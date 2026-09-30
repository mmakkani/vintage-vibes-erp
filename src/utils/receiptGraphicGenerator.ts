import { VINTAGE_VIBES_GOLD_SEAL_POS_BASE64 } from '../assets/vintageGoldSeal.ts';

export interface ReceiptGraphicItem {
  name?: string;
  itemName?: string;
  description?: string;
  barcode?: string;
  weightKg?: number;
  weight_kg?: number;
  unitPrice?: number;
  unit_price?: number;
  price?: number;
  quantity?: number;
  qty?: number;
  finalAmount?: number;
  final_amount?: number;
  imageUrl?: string;
  frontImageUrl?: string;
}

export interface ReceiptGraphicData {
  invoiceNo: string;
  date?: string;
  customerName?: string;
  customerPhone?: string;
  customerTrn?: string;
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyTrn?: string;
  paymentMethod?: string;
  items: ReceiptGraphicItem[];
  subTotal: number;
  discountAmount?: number;
  vatAmount: number;
  totalAmount: number;
  currency?: string;
  garmentImageUrl?: string;
}

/**
 * Loads an image from a URL or Base64 string safely without throwing unhandled exceptions
 */
function loadImageSafe(src: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
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
  dateStr: string
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
  ctx.arc(0, 0, radius - 8, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(254, 202, 202, 0.5)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 3. Beaded ring
  ctx.beginPath();
  ctx.arc(0, 0, radius - 12, 0, Math.PI * 2);
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
  ctx.font = '900 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 1;
  ctx.fillText('PAID & VERIFIED', 0, -2);

  ctx.shadowColor = 'transparent';
  ctx.fillStyle = 'rgba(254, 240, 138, 0.95)';
  ctx.font = 'bold 8px monospace';
  ctx.fillText(dateStr || new Date().toISOString().slice(0, 10), 0, radius * 0.4);

  ctx.fillStyle = 'rgba(254, 226, 226, 0.8)';
  ctx.font = 'bold 7px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('SALES DESK', 0, radius * 0.62);

  ctx.restore();
}

/**
 * Generates an ultra-high-definition, branded Digital Tax Receipt image (Option 2: Single Merged Slip)
 * embedding both the garment's front photo, company credentials, items, and the Royal Wax Seal.
 */
export async function generateReceiptGraphic(data: ReceiptGraphicData): Promise<string> {
  if (typeof document === 'undefined') {
    return '';
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const width = 850;
  const items = Array.isArray(data.items) && data.items.length > 0 ? data.items : [];
  const firstItem = items[0] || {};

  // Resolve garment photo
  const rawGarmentUrl = 
    data.garmentImageUrl || 
    firstItem.imageUrl || 
    firstItem.frontImageUrl || 
    (firstItem as any)?.front_image_url || 
    (firstItem as any)?.frontImage;

  // Load logo and garment image in parallel
  const [logoImg, garmentImg] = await Promise.all([
    loadImageSafe(VINTAGE_VIBES_GOLD_SEAL_POS_BASE64),
    rawGarmentUrl ? loadImageSafe(rawGarmentUrl) : Promise.resolve(null)
  ]);

  // Compute dynamic height
  const hasGarmentHero = Boolean(garmentImg);
  const garmentHeroHeight = hasGarmentHero ? 200 : 0;
  const itemRowHeight = 44;
  const tableHeight = Math.max(1, items.length) * itemRowHeight + 40;
  const totalsHeight = 170;
  const headerHeight = 200;
  const footerHeight = 65;
  const totalHeight = headerHeight + garmentHeroHeight + tableHeight + totalsHeight + footerHeight;

  canvas.width = width;
  canvas.height = totalHeight;

  // 1. Crisp White Card Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, totalHeight);

  // 2. Gold Luxury Header Strip
  const goldBar = ctx.createLinearGradient(0, 0, width, 0);
  goldBar.addColorStop(0, '#b45309');
  goldBar.addColorStop(0.3, '#f59e0b');
  goldBar.addColorStop(0.7, '#d97706');
  goldBar.addColorStop(1, '#92400e');
  ctx.fillStyle = goldBar;
  ctx.fillRect(0, 0, width, 8);

  // Outer Border
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(0, 0, width, totalHeight);

  // 3. Brand Header with Gold Emblem Logo
  if (logoImg) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(75, 65, 32, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(logoImg, 43, 33, 64, 64);
    ctx.restore();
  }

  // Company Name
  ctx.fillStyle = '#0f172a';
  ctx.font = '900 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'left';
  const cName = data.companyName || 'VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C';
  ctx.fillText(cName, 125, 54);

  // Subtitle / Address & TRN
  const displayAddress = data.companyAddress || 'Downtown, Al Qaseedah District, 135 Khalifa Bin Zayed Street, Alain UAE';
  const displayTrn = data.companyTrn || 'TRN-100482910300003';
  ctx.fillStyle = '#64748b';
  ctx.font = '500 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(`${displayAddress} • ${displayTrn}`, 125, 75);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '500 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const phoneStr = data.companyPhone || '+971554186086';
  ctx.fillText(`Phone: ${phoneStr} • Official Digital Tax Receipt`, 125, 93);

  // Divider
  ctx.beginPath();
  ctx.moveTo(35, 114);
  ctx.lineTo(width - 35, 114);
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.stroke();

  // 4. Metadata Details (Invoice No, Date, Billed to)
  ctx.font = 'bold 12px monospace';
  ctx.fillStyle = '#64748b';
  ctx.fillText('INVOICE NO: ', 35, 140);
  ctx.fillStyle = '#1e3a8a';
  ctx.font = '900 14px monospace';
  ctx.fillText(data.invoiceNo, 128, 140);

  const invoiceDateStr = data.date || new Date().toISOString().slice(0, 10);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 12px monospace';
  ctx.fillText(`DATE: ${invoiceDateStr}`, width - 35, 140);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#475569';
  ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('BILLED TO: ', 35, 168);
  ctx.fillStyle = '#0f172a';
  ctx.font = '900 14px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(data.customerName || 'Walk-In Customer', 110, 168);

  if (data.customerPhone) {
    ctx.textAlign = 'right';
    ctx.fillStyle = '#047857';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(`📱 ${data.customerPhone}`, width - 35, 168);
  }

  // Dashed separator
  ctx.beginPath();
  ctx.setLineDash([4, 4]);
  ctx.moveTo(35, 186);
  ctx.lineTo(width - 35, 186);
  ctx.strokeStyle = '#cbd5e1';
  ctx.stroke();
  ctx.setLineDash([]); // Reset

  let currentY = 200;

  // 5. EMBEDDED GARMENT SHOWCASE CARD (Option 2 Hero)
  if (garmentImg) {
    const cardX = 35;
    const cardY = currentY;
    const cardW = width - 70;
    const cardH = 175;

    // Card background
    ctx.fillStyle = '#f8fafc';
    roundRect(ctx, cardX, cardY, cardW, cardH, 12);
    ctx.fill();
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Garment Photo frame
    const imgX = cardX + 14;
    const imgY = cardY + 12;
    const imgW = 125;
    const imgH = 150;

    ctx.save();
    roundRect(ctx, imgX, imgY, imgW, imgH, 8);
    ctx.clip();
    ctx.drawImage(garmentImg, imgX, imgY, imgW, imgH);
    ctx.restore();

    // Border around photo
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    roundRect(ctx, imgX, imgY, imgW, imgH, 8);
    ctx.stroke();

    // Garment Information beside photo
    const infoX = imgX + imgW + 18;
    ctx.textAlign = 'left';

    // Amber Badge
    ctx.fillStyle = '#fef3c7';
    roundRect(ctx, infoX, cardY + 16, 175, 20, 4);
    ctx.fill();
    ctx.fillStyle = '#b45309';
    ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText('✨ 100% AUTHENTIC GARMENT', infoX + 8, cardY + 30);

    // Garment Title
    ctx.fillStyle = '#0f172a';
    ctx.font = '900 17px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const garmentTitle = firstItem.description || firstItem.itemName || firstItem.name || 'Curated Vintage Garment';
    ctx.fillText(garmentTitle.slice(0, 42), infoX, cardY + 60);

    // SKU / Barcode
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(`BARCODE: ${firstItem.barcode || '—'}`, infoX, cardY + 84);

    // Weight & Details
    const weightVal = Number(firstItem.weightKg || firstItem.weight_kg || 0);
    const weightLabel = weightVal > 0 ? `Weight: ${weightVal.toFixed(2)} KG` : 'Single Curated Piece';
    ctx.fillStyle = '#475569';
    ctx.font = '500 12px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(`• ${weightLabel}  • Hand-Inspected & Graded  • UAE Archive`, infoX, cardY + 106);

    // Verified Quality Stamp
    ctx.fillStyle = '#059669';
    ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText('✓ Grade A Authenticated • Dispatched from Vintage Vibes', infoX, cardY + 128);

    // Price tag
    const itemPrice = Number(firstItem.finalAmount ?? firstItem.final_amount ?? firstItem.unitPrice ?? firstItem.price ?? 0);
    ctx.fillStyle = '#1e293b';
    ctx.font = '900 16px monospace';
    ctx.fillText(`PRICE: AED ${itemPrice.toFixed(2)}`, infoX, cardY + 154);

    currentY += cardH + 16;
  }

  // 6. ITEM BREAKDOWN TABLE
  const tableY = currentY;
  ctx.fillStyle = '#f1f5f9';
  roundRect(ctx, 35, tableY, width - 70, 26, 4);
  ctx.fill();

  ctx.fillStyle = '#475569';
  ctx.font = '900 10.5px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('BARCODE / DESCRIPTION', 48, tableY + 17);

  ctx.textAlign = 'right';
  ctx.fillText('PRICE', 640, tableY + 17);
  ctx.fillText('TOTAL', width - 48, tableY + 17);

  let rowY = tableY + 34;
  items.slice(0, 6).forEach((it) => {
    const desc = it.description || it.itemName || it.name || 'Vintage Garment';
    const bc = it.barcode || '—';
    const w = Number(it.weightKg || it.weight_kg || 0);
    const price = Number(it.unitPrice ?? it.unit_price ?? it.price ?? 0);
    const finalAmt = Number(it.finalAmount ?? it.final_amount ?? price);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 12.5px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(desc.slice(0, 50), 48, rowY + 12);

    ctx.fillStyle = '#64748b';
    ctx.font = '10px monospace';
    const wStr = w > 0 ? ` (${w.toFixed(2)} KG)` : '';
    ctx.fillText(`${bc}${wStr}`, 48, rowY + 28);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#334155';
    ctx.font = '12px monospace';
    ctx.fillText(`AED ${price.toFixed(2)}`, 640, rowY + 16);

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 12.5px monospace';
    ctx.fillText(`AED ${finalAmt.toFixed(2)}`, width - 48, rowY + 16);

    // Row line
    ctx.beginPath();
    ctx.moveTo(35, rowY + 38);
    ctx.lineTo(width - 35, rowY + 38);
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1;
    ctx.stroke();

    rowY += itemRowHeight;
  });

  currentY = rowY + 10;

  // 7. FINANCIAL SETTLEMENT & 3D ROYAL WAX SEAL
  // Divider
  ctx.beginPath();
  ctx.moveTo(35, currentY);
  ctx.lineTo(width - 35, currentY);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  currentY += 16;

  // Draw 3D Red Royal Wax Seal on the Left Side
  const sealCenterX = 150;
  const sealCenterY = currentY + 68;
  drawRoyalWaxSeal(ctx, sealCenterX, sealCenterY, 52, invoiceDateStr);

  // Financial Lines on the Right Side
  const rightLabelX = 640;
  const rightValueX = width - 48;

  ctx.textAlign = 'right';
  ctx.font = 'bold 12px monospace';
  ctx.fillStyle = '#64748b';
  ctx.fillText('Subtotal:', rightLabelX, currentY + 16);
  ctx.fillStyle = '#0f172a';
  ctx.fillText(`AED ${Number(data.subTotal || 0).toFixed(2)}`, rightValueX, currentY + 16);

  if (Number(data.discountAmount || 0) > 0) {
    ctx.fillStyle = '#059669';
    ctx.fillText('Discount:', rightLabelX, currentY + 36);
    ctx.fillText(`- AED ${Number(data.discountAmount).toFixed(2)}`, rightValueX, currentY + 36);
  }

  const vatY = Number(data.discountAmount || 0) > 0 ? currentY + 56 : currentY + 40;
  ctx.fillStyle = '#64748b';
  ctx.fillText('5% UAE VAT:', rightLabelX, vatY);
  ctx.fillStyle = '#0f172a';
  ctx.fillText(`AED ${Number(data.vatAmount || 0).toFixed(2)}`, rightValueX, vatY);

  // Total Billable box
  const totalY = vatY + 28;
  ctx.beginPath();
  ctx.setLineDash([3, 3]);
  ctx.moveTo(480, totalY - 10);
  ctx.lineTo(width - 35, totalY - 10);
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = '#0f172a';
  ctx.font = '900 15px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('TOTAL BILLABLE:', rightLabelX, totalY + 12);

  ctx.fillStyle = '#0f172a';
  ctx.font = '900 20px monospace';
  ctx.fillText(`AED ${Number(data.totalAmount || 0).toFixed(2)}`, rightValueX, totalY + 12);

  // Payment badge
  const pMode = data.paymentMethod || 'CASH';
  ctx.fillStyle = '#059669';
  ctx.font = 'bold 11px monospace';
  ctx.fillText(`PAYMENT: ${pMode} (VERIFIED PAID)`, rightValueX, totalY + 32);

  currentY = totalY + 50;

  // 8. LUXURY BOTTOM FOOTER
  ctx.beginPath();
  ctx.moveTo(35, currentY);
  ctx.lineTo(width - 35, currentY);
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#94a3b8';
  ctx.font = '500 10px -apple-system, BlinkMacSystemFont, sans-serif';
  const fPhone = data.companyPhone || '+971554186086';
  ctx.fillText(
    `Thank you for choosing Vintage Vibes! 🛍️ • For inquiries: ${fPhone} • vintagevibesgk.com`,
    width / 2,
    currentY + 22
  );

  return canvas.toDataURL('image/jpeg', 0.92);
}
