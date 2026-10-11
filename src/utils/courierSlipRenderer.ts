import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import { SalesInvoice } from '../modules/sales/sales.types.ts';

/**
 * Renders a high-resolution 4x6 Courier Shipping Waybill & Official Tax Invoice
 * as a PNG Data URL directly on an off-screen HTML5 Canvas.
 * Suitable for instant WhatsApp photo dispatch without third-party dependencies.
 */
export async function generateCourierSlipPngDataUrl(invoice: SalesInvoice): Promise<string> {
  const canvas = document.createElement('canvas');
  // High-res 4x6 label (800 x 1200 px at 200 DPI)
  canvas.width = 800;
  canvas.height = 1200;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create 2D canvas context');

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 800, 1200);

  // Outer Security Border
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 4;
  ctx.strokeRect(20, 20, 760, 1160);

  // Inner Border
  ctx.lineWidth = 1;
  ctx.strokeRect(24, 24, 752, 1152);

  // ==================== 1. TOP HEADER BANNER ====================
  const courier = (invoice.courierPartner || (invoice.courierPartnerId === 75 ? 'Banana Express Logistics UAE' : (invoice.courierPartnerId ? `Courier #${invoice.courierPartnerId}` : 'DHL Express UAE'))).toUpperCase();
  const getCourierPrefix = (name: string) => {
    const n = name.toUpperCase();
    if (n.includes('BANANA')) return 'BNN';
    if (n.includes('ARAMEX')) return 'ARX';
    if (n.includes('EMIRATES') || n.includes('POST')) return 'EMP';
    if (n.includes('SMSA')) return 'SMSA';
    if (n.includes('IMILE')) return 'IML';
    if (n.includes('DHL')) return 'DHL';
    return 'AWB';
  };
  const waybillNo = invoice.trackingNumber || `${getCourierPrefix(courier)}-${invoice.invoiceNo.replace(/[^0-9]/g, '').slice(-8) || '98765432'}`;
  const isCOD = invoice.paymentMethod === 'COD' || invoice.paymentStatus === 'UNPAID_PENDING_COD';
  const totalAmount = Number(invoice.totalAmount || invoice.grandTotalAED || invoice.subTotal || 0);
  const shippingFee = Number(invoice.shippingFeeAed !== undefined ? invoice.shippingFeeAed : (invoice.shippingCharge || 0));

  // Top Black Header Bar
  ctx.fillStyle = '#0a0a0c';
  ctx.fillRect(24, 24, 752, 70);

  // Courier Badge
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 28px "Arial Black", Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(courier, 45, 68);

  ctx.font = 'bold 13px Arial, sans-serif';
  ctx.fillStyle = '#fbbf24';
  ctx.textAlign = 'right';
  ctx.fillText('DOMESTIC & EXPRESS AIRWAY', 750, 52);
  ctx.font = '11px monospace';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('STD-PRIORITY LOGISTICS', 750, 72);

  // ==================== 2. BARCODE SECTION ====================
  const barcodeCanvas = document.createElement('canvas');
  try {
    JsBarcode(barcodeCanvas, waybillNo, {
      format: 'CODE128',
      width: 2.4,
      height: 60,
      displayValue: true,
      font: 'monospace',
      fontSize: 14,
      margin: 4,
      background: '#ffffff',
      lineColor: '#000000'
    });
    ctx.drawImage(barcodeCanvas, 40, 105, 520, 85);
  } catch (_) {
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`WAYBILL: ${waybillNo}`, 50, 150);
  }

  // QR Code on right side of barcode
  try {
    const qrDataUrl = await QRCode.toDataURL(`https://vintagevibesgk.com/track/${waybillNo}`, {
      width: 80,
      margin: 1
    });
    const qrImg = new Image();
    await new Promise((resolve) => {
      qrImg.onload = resolve;
      qrImg.src = qrDataUrl;
    });
    ctx.drawImage(qrImg, 670, 105, 80, 80);
    ctx.font = '9px monospace';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'center';
    ctx.fillText('SCAN TRACK', 710, 195);
  } catch (_) {}

  // Separator Line
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(24, 205);
  ctx.lineTo(776, 205);
  ctx.stroke();

  // ==================== 3. SHIP TO & SHIP FROM ====================
  // Ship To (Left Box - 480px width)
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(24, 207, 470, 24);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('SHIP TO (CONSIGNEE / BUYER)', 35, 224);

  ctx.fillStyle = '#000000';
  ctx.font = '900 18px Arial, sans-serif';
  ctx.fillText(invoice.customerName || 'Retail Customer', 35, 258);

  ctx.font = 'bold 14px monospace';
  ctx.fillStyle = '#0284c7';
  ctx.fillText(`📞 ${invoice.customerPhone || 'N/A'}`, 35, 282);

  ctx.font = '12px Arial, sans-serif';
  ctx.fillStyle = '#334155';
  const addressText = invoice.shippingAddress || 'Downtown Dubai / UAE Delivery Address Pending Location Pin';
  // Simple 2-line wrap
  if (addressText.length > 50) {
    ctx.fillText(addressText.slice(0, 50), 35, 304);
    ctx.fillText(addressText.slice(50, 100), 35, 322);
  } else {
    ctx.fillText(addressText, 35, 304);
  }

  // Ship From (Right Box - 282px width)
  ctx.fillStyle = '#334155';
  ctx.fillRect(494, 207, 282, 24);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px Arial, sans-serif';
  ctx.fillText('DISPATCHED BY (ORIGIN)', 505, 224);

  // Vertical Divider
  ctx.beginPath();
  ctx.moveTo(494, 205);
  ctx.lineTo(494, 340);
  ctx.stroke();

  ctx.fillStyle = '#000000';
  ctx.font = 'bold 13px Arial, sans-serif';
  ctx.fillText('VINTAGE VIBES TRADING L.L.C', 505, 255);
  ctx.font = '11px Arial, sans-serif';
  ctx.fillStyle = '#475569';
  ctx.fillText('Al Qaseedah, Alain UAE', 505, 273);
  ctx.fillText('FTA TRN: 100492817200003', 505, 291);
  ctx.fillText('Ph: +971 55 418 6086', 505, 309);
  ctx.fillText(`Inv Date: ${invoice.invoiceDate || new Date().toISOString().slice(0, 10)}`, 505, 327);

  // Separator Line
  ctx.beginPath();
  ctx.moveTo(24, 340);
  ctx.lineTo(776, 340);
  ctx.stroke();

  // ==================== 4. PAYMENT CALLOUT BANNER ====================
  if (isCOD) {
    ctx.fillStyle = '#dc2626'; // Red Alert COD
    ctx.fillRect(24, 340, 752, 55);
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 22px "Arial Black", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`⚠️ CASH ON DELIVERY: COLLECT AED ${totalAmount.toFixed(2)}`, 400, 376);
  } else {
    ctx.fillStyle = '#059669'; // Green Verified
    ctx.fillRect(24, 340, 752, 55);
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 22px "Arial Black", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`✅ PREPAID & VERIFIED (DO NOT COLLECT CASH)`, 400, 376);
  }

  // Separator Line
  ctx.beginPath();
  ctx.moveTo(24, 395);
  ctx.lineTo(776, 395);
  ctx.stroke();

  // ==================== 5. CLAIMED GARMENTS / ITEMS TABLE ====================
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(24, 395, 752, 28);
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('#', 35, 413);
  ctx.fillText('GARMENT ITEM DESCRIPTION', 70, 413);
  ctx.fillText('SKU / BARCODE', 520, 413);
  ctx.textAlign = 'right';
  ctx.fillText('AMOUNT (AED)', 760, 413);

  let currentY = 442;
  const items = invoice.items || [];
  const displayItems = items.slice(0, 8);

  displayItems.forEach((it, idx) => {
    ctx.fillStyle = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
    ctx.fillRect(24, currentY - 18, 752, 28);

    ctx.fillStyle = '#334155';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(String(idx + 1), 35, currentY);

    const desc = it.description || it.itemName || 'Vintage Garment Piece';
    ctx.font = 'bold 12px Arial, sans-serif';
    ctx.fillStyle = '#0f172a';
    ctx.fillText(desc.length > 40 ? desc.slice(0, 40) + '...' : desc, 70, currentY);

    ctx.font = '11px monospace';
    ctx.fillStyle = '#4f46e5';
    ctx.fillText(it.barcode || 'N/A', 520, currentY);

    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'right';
    const itAmt = Number(it.finalAmount || it.unitPrice || 0);
    ctx.fillText(`AED ${itAmt.toFixed(2)}`, 760, currentY);

    currentY += 28;
  });

  if (items.length > 8) {
    ctx.fillStyle = '#64748b';
    ctx.font = 'italic 11px Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`+ ${items.length - 8} more vintage garment pieces included in parcel`, 70, currentY);
    currentY += 22;
  }

  // ==================== 6. FINANCIAL BREAKDOWN SUMMARY ====================
  const summaryBoxY = 720;
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(24, summaryBoxY, 752, 220);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.strokeRect(24, summaryBoxY, 752, 220);

  // Subtotal, Courier Fee, VAT Breakdown
  ctx.textAlign = 'left';
  ctx.fillStyle = '#475569';
  ctx.font = '13px Arial, sans-serif';
  ctx.fillText(`Subtotal (${items.length} Scanned Garment Pieces):`, 50, summaryBoxY + 35);
  ctx.textAlign = 'right';
  ctx.font = 'bold 13px monospace';
  ctx.fillStyle = '#0f172a';
  ctx.fillText(`AED ${(Number(invoice.subTotal || totalAmount)).toFixed(2)}`, 740, summaryBoxY + 35);

  ctx.textAlign = 'left';
  ctx.font = '13px Arial, sans-serif';
  ctx.fillStyle = '#475569';
  const isCustBearer = (invoice.shippingBearer || 'CUSTOMER') === 'CUSTOMER';
  ctx.fillText(`Express Delivery Fee (${courier} - ${isCustBearer ? 'Customer' : 'Free / Absorbed'}):`, 50, summaryBoxY + 70);
  ctx.textAlign = 'right';
  ctx.font = 'bold 13px monospace';
  ctx.fillStyle = '#0f172a';
  ctx.fillText(isCustBearer ? `AED ${shippingFee.toFixed(2)}` : 'AED 0.00 (FREE)', 740, summaryBoxY + 70);

  ctx.textAlign = 'left';
  ctx.font = '13px Arial, sans-serif';
  ctx.fillStyle = '#475569';
  ctx.fillText('UAE FTA VAT (5% Applicable Standard Rate):', 50, summaryBoxY + 105);
  ctx.textAlign = 'right';
  ctx.font = 'bold 13px monospace';
  ctx.fillStyle = '#0f172a';
  ctx.fillText(`AED ${(Number(invoice.vatAmount || (totalAmount * 0.05 / 1.05))).toFixed(2)}`, 740, summaryBoxY + 105);

  // Divider inside summary
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(40, summaryBoxY + 125);
  ctx.lineTo(750, summaryBoxY + 125);
  ctx.stroke();

  // Grand Total Banner
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(40, summaryBoxY + 138, 715, 62);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 15px Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`NET TOTAL INVOICE & PARCEL VALUE:`, 60, summaryBoxY + 175);
  ctx.font = '900 26px monospace';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#fbbf24';
  ctx.fillText(`AED ${totalAmount.toFixed(2)}`, 735, summaryBoxY + 178);

  // ==================== 7. FOOTER LEGAL & AUTHENTICATION ====================
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 12px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`TAX INVOICE #${invoice.invoiceNo} • OFFICIAL DISPATCH WAYBILL`, 400, 975);

  ctx.font = '11px Arial, sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText('This document acts as an official UAE Tax Invoice and Courier Airway Delivery Slip.', 400, 998);
  ctx.fillText('Please verify package seal upon delivery before accepting from the rider.', 400, 1018);
  ctx.fillText('For live support or returns, WhatsApp: +971 55 418 6086 • www.vintagevibesgk.com', 400, 1038);

  // Bottom Gold Seal Simulation
  ctx.fillStyle = '#d97706';
  ctx.beginPath();
  ctx.arc(400, 1105, 38, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 10px Arial, sans-serif';
  ctx.fillText('VINTAGE VIBES', 400, 1098);
  ctx.fillText('GENUINE SEAL', 400, 1112);
  ctx.fillText('ALAIN - UAE', 400, 1124);

  return canvas.toDataURL('image/png');
}
