import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import { SalesInvoice } from '../modules/sales/sales.types.ts';
import { supabase } from '../supabaseClient.ts';
import { VINTAGE_VIBES_GOLD_SEAL_POS_BASE64 } from '../assets/vintageGoldSeal.ts';

/**
 * Loads an image from a URL or Base64 string safely without throwing unhandled exceptions
 */
function loadImageSafe(src?: string | null): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * Draws a rounded rectangle path on canvas context
 */
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  if (w < 2 * r) r = w / 2;
  if (h < 2 * r) r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Draws the 3D Red Royal Wax Seal stamp matching Vintage Vibes brand identity
 */
function drawRoyalWaxSeal(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radius: number,
  dateStr: string,
  isPrepaid: boolean
) {
  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate((-8 * Math.PI) / 180); // Slight natural tilt

  // 1. Draw scalloped molten wax edge (24 lobes)
  ctx.beginPath();
  const lobes = 24;
  for (let i = 0; i < lobes; i++) {
    const angle = (i * 2 * Math.PI) / lobes;
    const nextAngle = ((i + 1) * 2 * Math.PI) / lobes;
    const midAngle = (angle + nextAngle) / 2;
    const outerR = radius + 3;
    const innerR = radius - 1;

    const x1 = Math.cos(angle) * innerR;
    const y1 = Math.sin(angle) * innerR;
    const xm = Math.cos(midAngle) * outerR;
    const ym = Math.sin(midAngle) * outerR;
    const x2 = Math.cos(nextAngle) * innerR;
    const y2 = Math.sin(nextAngle) * innerR;

    if (i === 0) ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(xm, ym, x2, y2);
  }
  ctx.closePath();

  // Shadow for 3D depth
  ctx.shadowColor = 'rgba(127, 29, 29, 0.45)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 4;

  // Radial wax gradient
  const grad = ctx.createRadialGradient(-radius * 0.3, -radius * 0.3, 0, 0, 0, radius);
  grad.addColorStop(0, '#ef4444');
  grad.addColorStop(0.45, '#b91c1c');
  grad.addColorStop(0.85, '#7f1d1d');
  grad.addColorStop(1, '#450a0a');
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.shadowColor = 'transparent';

  // 2. Inner ring
  ctx.beginPath();
  ctx.arc(0, 0, radius - 7, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(254, 202, 202, 0.5)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 3. Beaded ring
  ctx.beginPath();
  ctx.arc(0, 0, radius - 11, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(185, 28, 28, 0.9)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // 4. Seal Typography
  ctx.fillStyle = 'rgba(254, 226, 226, 0.95)';
  ctx.font = 'bold 8px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('DUBAI TRN VALIDATED', 0, -radius * 0.45);

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 1;
  ctx.fillText(isPrepaid ? 'PAID & VERIFIED' : 'TAX INVOICE COD', 0, -2);

  ctx.shadowColor = 'transparent';
  ctx.fillStyle = 'rgba(254, 240, 138, 0.95)';
  ctx.font = 'bold 8px monospace';
  ctx.fillText(dateStr || new Date().toISOString().slice(0, 10), 0, radius * 0.4);

  ctx.fillStyle = 'rgba(254, 226, 226, 0.85)';
  ctx.font = 'bold 7px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('VINTAGE VIBES UAE', 0, radius * 0.63);

  ctx.restore();
}

/**
 * Enriches invoice items with high-resolution front photos from inventory_pieces table if missing.
 */
async function resolveItemPhotos(invoice: SalesInvoice): Promise<Array<any>> {
  const items = Array.isArray(invoice.items) ? [...invoice.items] : [];
  if (items.length === 0) return [];

  // Barcodes needing photo lookup
  const missingBarcodes: string[] = [];
  items.forEach((it: any) => {
    if (!it.imageUrl && !it.frontImageUrl && !it.front_image_url && it.barcode) {
      missingBarcodes.push(it.barcode);
    }
  });

  const photoMap: Record<string, string> = {};

  if (missingBarcodes.length > 0) {
    try {
      const { data, error } = await supabase
        .from('inventory_pieces')
        .select('barcode, front_image_url')
        .in('barcode', missingBarcodes);

      if (!error && Array.isArray(data)) {
        data.forEach((row: any) => {
          if (row.barcode && row.front_image_url) {
            photoMap[row.barcode] = row.front_image_url;
          }
        });
      }
    } catch (e) {
      console.warn('[photoInvoiceRenderer] Error querying piece photos:', e);
    }
  }

  return items.map((it: any) => {
    const resolvedUrl =
      it.imageUrl ||
      it.frontImageUrl ||
      it.front_image_url ||
      (it.barcode ? photoMap[it.barcode] : null) ||
      null;

    return {
      ...it,
      resolvedPhotoUrl: resolvedUrl
    };
  });
}

/**
 * Generates an Ultra-High-Definition, Professional Picture-Based Tax Invoice
 * as a PNG Data URL on an HTML5 canvas.
 *
 * Each garment item prominently features its real front photograph, SKU barcode,
 * luxury Vintage Vibes branding, Dubai TRN, Wax Seal, and UAE FTA QR Code.
 */
export async function generatePhotoInvoicePngDataUrl(invoice: SalesInvoice): Promise<string> {
  if (typeof document === 'undefined') {
    return '';
  }

  // 1. Resolve Item Photos
  const enrichedItems = await resolveItemPhotos(invoice);

  // Load logo and item photos in parallel
  const logoPromise = loadImageSafe(VINTAGE_VIBES_GOLD_SEAL_POS_BASE64);
  const photoPromises = enrichedItems.map((it) => loadImageSafe(it.resolvedPhotoUrl));
  const [logoImg, ...itemImages] = await Promise.all([logoPromise, ...photoPromises]);

  // 2. Setup Canvas Dimensions
  const width = 900;
  const headerHeight = 220;
  const customerMetaHeight = 135;
  const itemRowHeight = 110;
  const itemsSectionHeight = Math.max(1, enrichedItems.length) * itemRowHeight + 50;
  const financialTotalsHeight = 210;
  const authenticationFooterHeight = 210;
  const totalHeight = headerHeight + customerMetaHeight + itemsSectionHeight + financialTotalsHeight + authenticationFooterHeight;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = totalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create 2D canvas context');

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, totalHeight);

  // Outer Security Frame
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  ctx.strokeRect(12, 12, width - 24, totalHeight - 24);

  // ==================== 1. TOP GOLD LUXURY STRIP & BRAND HEADER ====================
  const goldBar = ctx.createLinearGradient(0, 0, width, 0);
  goldBar.addColorStop(0, '#78350f');
  goldBar.addColorStop(0.25, '#b45309');
  goldBar.addColorStop(0.5, '#f59e0b');
  goldBar.addColorStop(0.75, '#d97706');
  goldBar.addColorStop(1, '#92400e');
  ctx.fillStyle = goldBar;
  ctx.fillRect(12, 12, width - 24, 10);

  // Top Dark Header Container
  ctx.fillStyle = '#0a0f1d';
  ctx.fillRect(14, 22, width - 28, 140);

  // Brand Logo with Circular Clip
  if (logoImg) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(85, 92, 42, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(logoImg, 43, 50, 84, 84);
    ctx.restore();

    // Gold rim around logo
    ctx.beginPath();
    ctx.arc(85, 92, 43, 0, Math.PI * 2);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Company Name
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C', 145, 65);

  // Subtitle / Legal details
  ctx.fillStyle = '#94a3b8';
  ctx.font = '500 12px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('Downtown, Al Qaseedah District, 135 Khalifa Bin Zayed Street, Alain UAE', 145, 87);

  // TRN & Phone Badges
  ctx.fillStyle = '#10b981';
  ctx.font = 'bold 12px monospace';
  ctx.fillText('TRN-100482910300003', 145, 109);

  ctx.fillStyle = '#cbd5e1';
  ctx.font = '500 12px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('• Phone: +971 55 418 6086 • Web: vintagevibesgk.com', 315, 109);

  // Authenticity Header Tag
  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('OFFICIAL LIVE SALES BROADCAST ARCHIVE & TAX INVOICE', 145, 130);

  // Right Side "TAX INVOICE" Badge
  ctx.fillStyle = '#1e293b';
  roundRect(ctx, width - 260, 42, 230, 95, 10);
  ctx.fill();
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = '#f59e0b';
  ctx.font = '900 16px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('TAX INVOICE', width - 145, 70);

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 15px monospace';
  ctx.fillText(invoice.invoiceNo, width - 145, 95);

  const invoiceDateStr = invoice.date || new Date().toISOString().slice(0, 10);
  const invoiceTimeStr = invoice.time || '15:30 GST';
  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 11px monospace';
  ctx.fillText(`${invoiceDateStr} • ${invoiceTimeStr}`, width - 145, 118);

  let currentY = 175;

  // ==================== 2. BILLED TO & DISPATCH METADATA ====================
  ctx.fillStyle = '#f8fafc';
  roundRect(ctx, 35, currentY, width - 70, 115, 10);
  ctx.fill();
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Column 1: Customer Details
  ctx.textAlign = 'left';
  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('BILLED TO / LIVE BUYER:', 55, currentY + 28);

  ctx.fillStyle = '#0f172a';
  ctx.font = '900 16px -apple-system, BlinkMacSystemFont, sans-serif';
  const buyerTitle = invoice.buyerHandle || invoice.customerName || 'Valued Live Buyer';
  ctx.fillText(buyerTitle.slice(0, 36), 55, currentY + 52);

  ctx.fillStyle = '#059669';
  ctx.font = 'bold 13px monospace';
  const phoneDisplay = invoice.customerPhone || 'Direct Live Dispatch';
  ctx.fillText(`📱 WhatsApp: ${phoneDisplay}`, 55, currentY + 75);

  ctx.fillStyle = '#475569';
  ctx.font = '500 12px -apple-system, BlinkMacSystemFont, sans-serif';
  const addr = invoice.shippingAddress || 'Dubai / UAE Express Dispatch';
  ctx.fillText(`📍 Delivery Address: ${addr.slice(0, 45)}`, 55, currentY + 96);

  // Column 2: Logistics & Channel Details
  const midX = 520;
  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('DISPATCH & LOGISTICS:', midX, currentY + 28);

  const courierName = invoice.courierPartner || 'DHL Express UAE';
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(`🚚 Partner: ${courierName}`, midX, currentY + 52);

  ctx.fillStyle = '#2563eb';
  ctx.font = 'bold 13px monospace';
  const awb = invoice.trackingNumber || 'Pending AWB Dispatch';
  ctx.fillText(`🏷️ Waybill / AWB: ${awb}`, midX, currentY + 75);

  const platform = invoice.socialPlatform || 'TIKTOK LIVE';
  const booth = invoice.boothId ? `Booth ${invoice.boothId.replace(/[^0-9]/g, '')}` : 'Live Studio';
  ctx.fillStyle = '#6366f1';
  ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(`📡 Channel: ${platform} (${booth})`, midX, currentY + 96);

  currentY += 135;

  // ==================== 3. ITEMIZED GARMENT GALLERY & TABLE ====================
  // Table Header Ribbon
  ctx.fillStyle = '#0f172a';
  roundRect(ctx, 35, currentY, width - 70, 34, 6);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 12px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('GARMENT PHOTO & SPECIFICATIONS', 55, currentY + 22);

  ctx.textAlign = 'center';
  ctx.fillText('BARCODE / SKU', 500, currentY + 22);
  ctx.fillText('QTY', 660, currentY + 22);

  ctx.textAlign = 'right';
  ctx.fillText('AMOUNT (AED)', width - 55, currentY + 22);

  currentY += 44;

  // Render Each Item with Photo
  enrichedItems.forEach((it, idx) => {
    const rowY = currentY;
    const itImg = itemImages[idx];

    // Alternating soft background
    ctx.fillStyle = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
    roundRect(ctx, 35, rowY, width - 70, 100, 8);
    ctx.fill();
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 1. Draw Garment Photo (80x80 px)
    const imgX = 48;
    const imgY = rowY + 10;
    const imgSize = 80;

    if (itImg) {
      ctx.save();
      roundRect(ctx, imgX, imgY, imgSize, imgSize, 8);
      ctx.clip();
      ctx.drawImage(itImg, imgX, imgY, imgSize, imgSize);
      ctx.restore();

      // Border around photo
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1.5;
      roundRect(ctx, imgX, imgY, imgSize, imgSize, 8);
      ctx.stroke();
    } else {
      // Sleek fallback thumbnail box with hanger symbol
      ctx.fillStyle = '#e2e8f0';
      roundRect(ctx, imgX, imgY, imgSize, imgSize, 8);
      ctx.fill();

      ctx.fillStyle = '#64748b';
      ctx.font = '900 24px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🧥', imgX + 40, imgY + 45);

      ctx.font = 'bold 8px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText('AUTHENTIC', imgX + 40, imgY + 65);
    }

    // 2. Garment Details beside photo
    const infoX = imgX + imgSize + 16;
    ctx.textAlign = 'left';

    // Badge
    ctx.fillStyle = '#fef3c7';
    roundRect(ctx, infoX, rowY + 12, 175, 18, 4);
    ctx.fill();
    ctx.fillStyle = '#b45309';
    ctx.font = 'bold 9.5px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText('✨ 100% AUTHENTIC GARMENT', infoX + 8, rowY + 25);

    // Title
    ctx.fillStyle = '#0f172a';
    ctx.font = '900 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const garmentTitle = it.description || it.itemName || 'Curated Vintage Garment';
    ctx.fillText(garmentTitle.slice(0, 38), infoX, rowY + 47);

    // Specs
    const weightGrams = it.weightGrams || Math.round((it.weightKg || 0.45) * 1000);
    const sizeStr = it.size ? `Size: ${it.size}` : 'Standard Vintage Fit';
    ctx.fillStyle = '#475569';
    ctx.font = '500 11.5px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(`• ${sizeStr}  • Weight: ${weightGrams}g  • Hand-Inspected Grade A`, infoX, rowY + 68);

    // Verified Stamp
    ctx.fillStyle = '#059669';
    ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText('✓ Dispatched from Vintage Vibes UAE Vault', infoX, rowY + 87);

    // 3. Barcode in Center
    ctx.textAlign = 'center';
    ctx.fillStyle = '#1e3a8a';
    ctx.font = 'bold 11.5px monospace';
    ctx.fillText(it.barcode || 'BAL-PIECE', 500, rowY + 54);

    // 4. Quantity
    ctx.fillStyle = '#334155';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(`${it.quantity || 1}`, 660, rowY + 54);

    // 5. Total Price
    const lineAmt = Number(it.finalAmount ?? it.lineTotal ?? it.unitPrice ?? 0);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#0f172a';
    ctx.font = '900 16px monospace';
    ctx.fillText(`AED ${lineAmt.toFixed(2)}`, width - 55, rowY + 54);

    currentY += itemRowHeight;
  });

  currentY += 15;

  // ==================== 4. FINANCIAL BREAKDOWN & PAYMENT MODE ====================
  const totalsBoxY = currentY;
  const totalsBoxHeight = 175;

  // Left Side: Payment Method & Customer Notice
  const isPrepaid = invoice.paymentStatus === 'PREPAID_VERIFIED';
  const isCOD = invoice.paymentMethod === 'COD' || invoice.paymentStatus === 'UNPAID_PENDING_COD';

  ctx.fillStyle = isPrepaid ? '#ecfdf5' : '#fffbeb';
  roundRect(ctx, 35, totalsBoxY, 410, totalsBoxHeight, 10);
  ctx.fill();
  ctx.strokeStyle = isPrepaid ? '#a7f3d0' : '#fde68a';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.fillStyle = isPrepaid ? '#065f46' : '#92400e';
  ctx.font = '900 13px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('PAYMENT METHOD & ORDER STATUS:', 55, totalsBoxY + 30);

  const paymentLabel = isCOD
    ? '💵 Cash on Delivery (COD)'
    : invoice.paymentMethod === 'BANK_TRANSFER'
    ? '🏦 Bank Wire Transfer'
    : invoice.paymentMethod === 'CARD_POS'
    ? '💳 Card / Online POS Link'
    : 'Cash Payment';

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(paymentLabel, 55, totalsBoxY + 58);

  const statusLabel = isPrepaid
    ? '✅ STATUS: PREPAID & VERIFIED'
    : '⚠️ STATUS: TO BE COLLECTED ON DELIVERY';

  ctx.fillStyle = isPrepaid ? '#059669' : '#d97706';
  ctx.font = '900 13px monospace';
  ctx.fillText(statusLabel, 55, totalsBoxY + 84);

  ctx.fillStyle = '#475569';
  ctx.font = '500 11.5px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('• UAE FTA Tax Compliance: Registered Electronic Tax Document', 55, totalsBoxY + 112);
  ctx.fillText('• 7-Day Live Stream Verification Guarantee applies.', 55, totalsBoxY + 132);
  ctx.fillText('• Keep this digital photo tax invoice for all delivery inquiries.', 55, totalsBoxY + 152);

  // Right Side: Grand Totals
  const rightBoxX = 465;
  const rightBoxW = width - 35 - rightBoxX;

  ctx.fillStyle = '#ffffff';
  roundRect(ctx, rightBoxX, totalsBoxY, rightBoxW, totalsBoxHeight, 10);
  ctx.fill();
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Subtotal
  ctx.textAlign = 'left';
  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 12.5px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(`Subtotal (${enrichedItems.length} Pieces):`, rightBoxX + 18, totalsBoxY + 32);

  const subTotalAmt = Number(invoice.subTotal || 0);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#1e293b';
  ctx.font = 'bold 14px monospace';
  ctx.fillText(`AED ${subTotalAmt.toFixed(2)}`, width - 55, totalsBoxY + 32);

  // Delivery / Courier Fee
  const shippingAmount = Number(invoice.shippingFeeAed ?? (invoice.shippingCharge ?? 25));
  const isCustomerShipping = (invoice.shippingBearer || 'CUSTOMER') === 'CUSTOMER';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 12.5px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('Express Courier Delivery:', rightBoxX + 18, totalsBoxY + 60);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#1e293b';
  ctx.font = 'bold 14px monospace';
  const shippingLabel = isCustomerShipping ? `AED ${shippingAmount.toFixed(2)}` : 'FREE (Company Absorbed)';
  ctx.fillText(shippingLabel, width - 55, totalsBoxY + 60);

  // 5% UAE VAT
  const vatAmt = Number(invoice.vatAmount || 0);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 12.5px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('5% UAE FTA VAT:', rightBoxX + 18, totalsBoxY + 88);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#1e293b';
  ctx.font = 'bold 14px monospace';
  ctx.fillText(`AED ${vatAmt.toFixed(2)}`, width - 55, totalsBoxY + 88);

  // Grand Total Banner
  const grandTotalAmt = Number(invoice.totalAmount || invoice.grandTotalAED || subTotalAmt + shippingAmount + vatAmt);
  const totalBannerY = totalsBoxY + 110;

  ctx.fillStyle = '#0a0f1d';
  roundRect(ctx, rightBoxX + 10, totalBannerY, rightBoxW - 20, 52, 8);
  ctx.fill();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#fbbf24';
  ctx.font = '900 13px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('TOTAL TO PAY:', rightBoxX + 24, totalBannerY + 32);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 22px monospace';
  ctx.fillText(`AED ${grandTotalAmt.toFixed(2)}`, width - 55, totalBannerY + 35);

  currentY += totalsBoxHeight + 20;

  // ==================== 5. AUTHENTICITY STAMPS, WAX SEAL & QR CODE ====================
  // Divider
  ctx.beginPath();
  ctx.moveTo(35, currentY);
  ctx.lineTo(width - 35, currentY);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  currentY += 15;

  // 1. Draw 3D Red Royal Wax Seal on Left
  const sealX = 140;
  const sealY = currentY + 68;
  drawRoyalWaxSeal(ctx, sealX, sealY, 52, invoiceDateStr, isPrepaid);

  // 2. Center: Invoice Barcode (Code128)
  const barcodeCanvas = document.createElement('canvas');
  try {
    JsBarcode(barcodeCanvas, invoice.invoiceNo, {
      format: 'CODE128',
      width: 2.2,
      height: 55,
      displayValue: true,
      font: 'monospace',
      fontSize: 13,
      margin: 4,
      background: '#ffffff',
      lineColor: '#000000'
    });
    ctx.drawImage(barcodeCanvas, 275, currentY + 22, 350, 75);
  } catch (_) {
    ctx.fillStyle = '#0f172a';
    ctx.font = '900 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`INVOICE: ${invoice.invoiceNo}`, 450, currentY + 60);
  }

  // 3. Right: Official UAE FTA E-Invoicing QR Code
  try {
    const qrPayload = JSON.stringify({
      seller: 'VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C',
      trn: '100482910300003',
      invoiceNo: invoice.invoiceNo,
      date: `${invoiceDateStr}T${invoiceTimeStr}`,
      total: grandTotalAmt.toFixed(2),
      vat: vatAmt.toFixed(2)
    });
    const qrDataUrl = await QRCode.toDataURL(qrPayload, {
      width: 95,
      margin: 1
    });
    const qrImg = await loadImageSafe(qrDataUrl);
    if (qrImg) {
      ctx.drawImage(qrImg, width - 150, currentY + 12, 95, 95);

      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('FTA QR VERIFY', width - 102, currentY + 118);
    }
  } catch (_) {}

  // Bottom Legal Text
  currentY += 135;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#64748b';
  ctx.font = '500 10.5px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(
    'Official UAE Tax Invoice issued under Federal Tax Authority (FTA) VAT Laws • Vintage Vibes Archive & Luxury Vault Alain, UAE',
    width / 2,
    currentY
  );

  return canvas.toDataURL('image/png');
}
