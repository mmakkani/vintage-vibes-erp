import { VINTAGE_VIBES_GOLD_SEAL_POS_BASE64 } from '../assets/vintageGoldSeal.ts';

export interface B2BInvoiceGraphicItem {
  barcode?: string;
  description?: string;
  itemName?: string;
  name?: string;
  isRawBale?: boolean;
  baleCode?: string;
  weightKg?: number;
  grossWeightKg?: number;
  unitPrice?: number;
  finalAmount?: number;
  ratePerKg?: number;
  quantity?: number;
}

export interface B2BInvoiceGraphicData {
  invoiceNo: string;
  date?: string;
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;
  customerTrn?: string;
  customerCoaCode?: string;
  
  // Logistics
  courierName?: string;
  waybillNo?: string;
  courierFee?: number;
  courierFeePayer?: 'BUYER' | 'SELLER';
  airwayBillPhotoUrl?: string;

  // Items & Financials
  items: B2BInvoiceGraphicItem[];
  itemsSubtotal: number;
  otherChargesTotal?: number;
  vatAmount: number;
  grandTotal: number;
  advanceAmountPaid?: number;
  paymentMethod?: string;
  taxType?: string;
  exportCustomsDeclarationNo?: string;

  // Company Profile
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyTrn?: string;
}

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

function drawRoyalWaxSeal(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radius: number,
  dateStr: string
) {
  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate((-8 * Math.PI) / 180);

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

  ctx.shadowColor = 'rgba(127, 29, 29, 0.45)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 4;

  const grad = ctx.createRadialGradient(-radius * 0.3, -radius * 0.3, 0, 0, 0, radius);
  grad.addColorStop(0, '#ef4444');
  grad.addColorStop(0.45, '#b91c1c');
  grad.addColorStop(0.85, '#7f1d1d');
  grad.addColorStop(1, '#450a0a');
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.shadowColor = 'transparent';

  // Inner ring
  ctx.beginPath();
  ctx.arc(0, 0, radius - 8, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(254, 202, 202, 0.5)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Seal Typography
  ctx.fillStyle = 'rgba(254, 226, 226, 0.95)';
  ctx.font = 'bold 8.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('DUBAI TRN VALIDATED', 0, -radius * 0.45);

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 1;
  ctx.fillText('PAID & VERIFIED', 0, -3);

  ctx.shadowColor = 'transparent';
  ctx.fillStyle = 'rgba(254, 240, 138, 0.95)';
  ctx.font = 'bold 8px monospace';
  ctx.fillText(dateStr || new Date().toISOString().slice(0, 10), 0, radius * 0.38);

  ctx.fillStyle = 'rgba(254, 226, 226, 0.85)';
  ctx.font = 'bold 7px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('B2B WHOLESALE DESK', 0, radius * 0.62);

  ctx.restore();
}

/**
 * Generates an ultra-high-definition, branded B2B Tax Invoice graphic
 * Embedding buyer particulars, logistics & courier details, full items breakdown,
 * bank settlement credentials, and the official Royal Wax Seal.
 */
export async function generateB2BInvoiceGraphic(data: B2BInvoiceGraphicData): Promise<string> {
  if (typeof document === 'undefined') {
    return '';
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const width = 900;
  const items = Array.isArray(data.items) && data.items.length > 0 ? data.items : [];

  // Load logo and optional airway bill slip image
  const [logoImg, awbSlipImg] = await Promise.all([
    loadImageSafe(VINTAGE_VIBES_GOLD_SEAL_POS_BASE64),
    data.airwayBillPhotoUrl ? loadImageSafe(data.airwayBillPhotoUrl) : Promise.resolve(null)
  ]);

  // Compute dynamic height
  const headerHeight = 160;
  const infoBoxesHeight = 135;
  const itemRowHeight = 36;
  const tableHeight = Math.max(1, items.length) * itemRowHeight + 45;
  const financialsHeight = 220;
  const awbBoxHeight = awbSlipImg ? 180 : 0;
  const footerHeight = 65;

  const totalHeight = headerHeight + infoBoxesHeight + tableHeight + financialsHeight + awbBoxHeight + footerHeight;

  canvas.width = width;
  canvas.height = totalHeight;

  // 1. Crisp Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, totalHeight);

  // 2. Gold Top Banner
  const goldBar = ctx.createLinearGradient(0, 0, width, 0);
  goldBar.addColorStop(0, '#78350f');
  goldBar.addColorStop(0.3, '#d97706');
  goldBar.addColorStop(0.7, '#f59e0b');
  goldBar.addColorStop(1, '#92400e');
  ctx.fillStyle = goldBar;
  ctx.fillRect(0, 0, width, 8);

  // Outer Border
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(0, 0, width, totalHeight);

  // 3. Header Section (Logo + Corporate Brand)
  let currentY = 24;
  if (logoImg) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(68, currentY + 36, 32, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(logoImg, 36, currentY + 4, 64, 64);
    ctx.restore();
  }

  // Company Name & Credentials
  ctx.fillStyle = '#78350f';
  ctx.font = '900 18px "Times New Roman", Georgia, serif';
  ctx.textAlign = 'left';
  const cName = data.companyName || 'VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C';
  ctx.fillText(cName, 115, currentY + 22);

  ctx.fillStyle = '#475569';
  ctx.font = '600 10.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('Dubai Economy & Tourism License: 1049281 • Customs Code: AE-9281048', 115, currentY + 40);

  const cAddress = data.companyAddress || 'Downtown, Al Qaseedah District, 135 Khalifa Bin Zayed Street, Alain UAE';
  ctx.fillText(cAddress, 115, currentY + 56);

  const cTrn = data.companyTrn || 'TRN-100482910300003';
  const cPhone = data.companyPhone || '+971 55 418 6086';
  ctx.fillStyle = '#64748b';
  ctx.fillText(`Tax TRN: ${cTrn} • Tel: ${cPhone} • sales@vintagevibesllcspc.com`, 115, currentY + 72);

  // Right Side Header Badge: TAX INVOICE Pill
  const rightEdge = width - 35;
  ctx.textAlign = 'right';

  // Pill badge background
  const pillGrad = ctx.createLinearGradient(rightEdge - 210, 0, rightEdge, 0);
  pillGrad.addColorStop(0, '#78350f');
  pillGrad.addColorStop(1, '#92400e');
  ctx.fillStyle = pillGrad;
  ctx.beginPath();
  const px = rightEdge - 210, py = currentY + 6, pw = 210, ph = 26;
  ctx.roundRect ? ctx.roundRect(px, py, pw, ph, 4) : ctx.rect(px, py, pw, ph);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 11px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('TAX INVOICE / فاتورة ضريبية', rightEdge - 14, py + 17);

  // Invoice Number & Date
  ctx.fillStyle = '#0f172a';
  ctx.font = '900 15px monospace';
  ctx.fillText(data.invoiceNo || 'INV-B2B', rightEdge, currentY + 54);

  const invDate = data.date || new Date().toISOString().slice(0, 10);
  ctx.fillStyle = '#475569';
  ctx.font = 'bold 11px monospace';
  ctx.fillText(`DATE: ${invDate}`, rightEdge, currentY + 70);

  const regimeStr = data.taxType === 'EXPORT_ZERO_RATED' ? 'REGIME: EXPORT 0% ZERO-RATED' : 'REGIME: MAINLAND 5% VAT';
  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 9.5px monospace';
  ctx.fillText(regimeStr, rightEdge, currentY + 84);

  currentY += 105;

  // Divider
  ctx.beginPath();
  ctx.moveTo(35, currentY);
  ctx.lineTo(width - 35, currentY);
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.stroke();

  currentY += 14;

  // 4. Two-Column Information Cards (Buyer Info & Logistics Details)
  const colWidth = (width - 70 - 16) / 2;
  const boxHeight = 110;

  // Left Card: Billed To
  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(35, currentY, colWidth, boxHeight, 6) : ctx.rect(35, currentY, colWidth, boxHeight);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#92400e';
  ctx.font = '900 9.5px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('BILLED TO (BUYER / العميل):', 47, currentY + 18);

  ctx.fillStyle = '#0f172a';
  ctx.font = '900 13px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(data.customerName || 'Walk-in Corporate Client', 47, currentY + 36);

  ctx.fillStyle = '#334155';
  ctx.font = '500 10.5px -apple-system, BlinkMacSystemFont, sans-serif';
  const cPhoneStr = data.customerPhone ? `WhatsApp / Tel: ${data.customerPhone}` : 'WhatsApp / Tel: N/A';
  ctx.fillText(cPhoneStr, 47, currentY + 54);

  const cAddrStr = data.customerAddress || 'Industrial Area, Dubai, UAE';
  ctx.fillText(cAddrStr.slice(0, 48), 47, currentY + 70);

  ctx.fillStyle = '#4338ca';
  ctx.font = 'bold 10px monospace';
  const trnAndCoa = `TRN: ${data.customerTrn || 'Freezone/N/A'} ${data.customerCoaCode ? `• COA: ${data.customerCoaCode}` : ''}`;
  ctx.fillText(trnAndCoa, 47, currentY + 90);

  // Right Card: Logistics & Airway Bill Parameters
  const rightCardX = 35 + colWidth + 16;
  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = '#cbd5e1';
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(rightCardX, currentY, colWidth, boxHeight, 6) : ctx.rect(rightCardX, currentY, colWidth, boxHeight);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#92400e';
  ctx.font = '900 9.5px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('TAX & LOGISTICS PARAMETERS:', rightCardX + 12, currentY + 18);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, sans-serif';
  const courierTitle = data.courierName ? `Courier: ${data.courierName}` : 'Courier: Direct Customer Pickup / Local';
  ctx.fillText(courierTitle, rightCardX + 12, currentY + 36);

  ctx.fillStyle = '#b45309';
  ctx.font = 'bold 11px monospace';
  const awbStr = data.waybillNo ? `Waybill / AWB #: ${data.waybillNo}` : 'Waybill / AWB #: N/A (Hand Delivery)';
  ctx.fillText(awbStr, rightCardX + 12, currentY + 54);

  // Courier Fee & Payer Info
  const feeVal = Number(data.courierFee || 0);
  const payer = data.courierFeePayer || 'BUYER';
  ctx.font = 'bold 10.5px -apple-system, BlinkMacSystemFont, sans-serif';
  if (feeVal > 0) {
    if (payer === 'BUYER') {
      ctx.fillStyle = '#0f172a';
      ctx.fillText(`Courier Delivery Fee: AED ${feeVal.toFixed(2)} (Paid by Buyer)`, rightCardX + 12, currentY + 72);
    } else {
      ctx.fillStyle = '#059669';
      ctx.fillText(`Courier Delivery Fee: AED ${feeVal.toFixed(2)} (FREE / Paid by Company)`, rightCardX + 12, currentY + 72);
    }
  } else {
    ctx.fillStyle = '#64748b';
    ctx.fillText('Delivery Charges: Complimentary / Included', rightCardX + 12, currentY + 72);
  }

  const termsMode = data.paymentMethod ? `Payment: ${data.paymentMethod}` : 'Payment: Credit Khata';
  ctx.fillStyle = '#475569';
  ctx.font = '500 10px monospace';
  ctx.fillText(termsMode, rightCardX + 12, currentY + 90);

  currentY += boxHeight + 16;

  // 5. Items Table
  // Table Header Bar
  ctx.fillStyle = '#fef3c7';
  ctx.fillRect(35, currentY, width - 70, 26);
  ctx.strokeStyle = '#b45309';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(35, currentY, width - 70, 26);

  ctx.fillStyle = '#78350f';
  ctx.font = '900 10px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('#', 45, currentY + 17);
  ctx.fillText('BARCODE / CODE', 75, currentY + 17);
  ctx.fillText('ITEM DESCRIPTION & CATEGORY', 255, currentY + 17);
  ctx.textAlign = 'right';
  ctx.fillText('WEIGHT', 590, currentY + 17);
  ctx.fillText('UNIT RATE', 720, currentY + 17);
  ctx.fillText('TOTAL (AED)', width - 45, currentY + 17);

  currentY += 26;

  // Item Rows
  items.forEach((item, index) => {
    const isEven = index % 2 === 0;
    ctx.fillStyle = isEven ? '#ffffff' : '#fafafa';
    ctx.fillRect(35, currentY, width - 70, itemRowHeight);

    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(35, currentY + itemRowHeight);
    ctx.lineTo(width - 35, currentY + itemRowHeight);
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = '#475569';
    ctx.font = 'bold 10px monospace';
    ctx.fillText(String(index + 1), 45, currentY + 22);

    // Barcode / Code
    const code = item.barcode || item.baleCode || 'N/A';
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 10.5px monospace';
    ctx.fillText(code, 75, currentY + 22);

    // Description
    const desc = item.description || item.itemName || item.name || (item.isRawBale ? 'Bulk Raw Garments Bale' : 'Sorted Vintage Apparel');
    ctx.fillStyle = '#1e293b';
    ctx.font = '600 10.5px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(desc.slice(0, 42), 255, currentY + 22);

    // Weight
    const w = item.grossWeightKg || item.weightKg || 0;
    ctx.textAlign = 'right';
    ctx.fillStyle = '#475569';
    ctx.font = 'bold 10.5px monospace';
    ctx.fillText(`${Number(w).toFixed(1)} KG`, 590, currentY + 22);

    // Unit Rate
    const rate = Number(item.unitPrice || item.ratePerKg || 0);
    ctx.fillText(`AED ${rate.toFixed(2)}`, 720, currentY + 22);

    // Line Total
    const lineTot = Number(item.finalAmount || (w > 0 && rate > 0 ? w * rate : rate));
    ctx.fillStyle = '#0f172a';
    ctx.font = '900 11px monospace';
    ctx.fillText(`AED ${lineTot.toFixed(2)}`, width - 45, currentY + 22);

    currentY += itemRowHeight;
  });

  currentY += 16;

  // 6. Financials & Totals Grid
  const finBoxHeight = 185;
  const leftBankWidth = 430;
  const rightTotalsWidth = width - 70 - leftBankWidth - 16;

  // Left Side: Bank Details Card
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(35, currentY, leftBankWidth, finBoxHeight, 6) : ctx.rect(35, currentY, leftBankWidth, finBoxHeight);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#0f172a';
  ctx.font = '900 10.5px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('🏛️ BANK DETAILS FOR WIRE SETTLEMENT:', 47, currentY + 20);

  ctx.fillStyle = '#334155';
  ctx.font = '500 10px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('Bank: Emirates NBD, Al Quoz Branch, Dubai, UAE', 47, currentY + 38);
  ctx.fillText('Beneficiary: Vintage Vibes General Trading L.L.C - S.P.C', 47, currentY + 54);

  ctx.font = 'bold 10.5px monospace';
  ctx.fillStyle = '#0f172a';
  ctx.fillText('IBAN: AE28 0260 0010 4928 1900 003', 47, currentY + 72);
  ctx.fillText('SWIFT/BIC: EBILAEAD • Currency: AED', 47, currentY + 88);

  ctx.fillStyle = '#64748b';
  ctx.font = '500 9px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('Goods once sold are authentic certified grade vintage garments.', 47, currentY + 110);
  ctx.fillText('Formal UAE Tax Invoice issued pursuant to UAE Federal Decree-Law No. (8) of 2017.', 47, currentY + 124);

  // Royal Wax Seal inside left bank box
  drawRoyalWaxSeal(ctx, 35 + leftBankWidth - 68, currentY + 105, 38, data.date || '');

  // Right Side: Karachya Totals Breakdown
  const rightTotalsX = 35 + leftBankWidth + 16;
  ctx.fillStyle = '#fffbeb';
  ctx.strokeStyle = '#d97706';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(rightTotalsX, currentY, rightTotalsWidth, finBoxHeight, 6) : ctx.rect(rightTotalsX, currentY, rightTotalsWidth, finBoxHeight);
  ctx.fill();
  ctx.stroke();

  let tY = currentY + 22;
  const labelX = rightTotalsX + 14;
  const valX = width - 47;

  // Subtotal
  ctx.textAlign = 'left';
  ctx.fillStyle = '#475569';
  ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('Items Subtotal:', labelX, tY);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 11px monospace';
  ctx.fillText(`AED ${Number(data.itemsSubtotal || 0).toFixed(2)}`, valX, tY);

  tY += 20;

  // Courier / Delivery Fee
  const cFee = Number(data.courierFee || 0);
  const cPayer = data.courierFeePayer || 'BUYER';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#475569';
  ctx.fillText('Delivery / Freight Fee:', labelX, tY);
  ctx.textAlign = 'right';
  if (cFee > 0) {
    if (cPayer === 'BUYER') {
      ctx.fillStyle = '#0f172a';
      ctx.fillText(`AED ${cFee.toFixed(2)}`, valX, tY);
    } else {
      ctx.fillStyle = '#059669';
      ctx.fillText(`FREE (AED ${cFee.toFixed(2)} by Company)`, valX, tY);
    }
  } else {
    ctx.fillStyle = '#64748b';
    ctx.fillText('AED 0.00', valX, tY);
  }

  tY += 20;

  // UAE VAT
  const vatRate = data.taxType === 'EXPORT_ZERO_RATED' ? '0%' : '5%';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#059669';
  ctx.fillText(`UAE VAT (${vatRate}):`, labelX, tY);
  ctx.textAlign = 'right';
  ctx.fillText(`AED ${Number(data.vatAmount || 0).toFixed(2)}`, valX, tY);

  tY += 24;

  // Grand Total Box
  ctx.fillStyle = '#fef3c7';
  ctx.strokeStyle = '#b45309';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(labelX - 4, tY - 14, rightTotalsWidth - 20, 36, 4) : ctx.rect(labelX - 4, tY - 14, rightTotalsWidth - 20, 36);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#78350f';
  ctx.font = '900 12.5px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('TOTAL BILLABLE:', labelX + 4, tY + 8);

  ctx.textAlign = 'right';
  ctx.font = '900 16px monospace';
  ctx.fillText(`AED ${Number(data.grandTotal || 0).toFixed(2)}`, valX - 4, tY + 8);

  tY += 38;

  // Advance / Balance if any
  const adv = Number(data.advanceAmountPaid || 0);
  if (adv > 0) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#0284c7';
    ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText('Advance Paid:', labelX, tY);
    ctx.textAlign = 'right';
    ctx.fillText(`AED ${adv.toFixed(2)}`, valX, tY);

    tY += 16;
    const balDue = Math.max(0, data.grandTotal - adv);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#b91c1c';
    ctx.fillText('Net Balance Due:', labelX, tY);
    ctx.textAlign = 'right';
    ctx.fillText(`AED ${balDue.toFixed(2)}`, valX, tY);
  }

  currentY += finBoxHeight + 16;

  // 7. Optional Attached Airway Bill Slip Thumbnail
  if (awbSlipImg) {
    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(35, currentY, width - 70, 160, 6) : ctx.rect(35, currentY, width - 70, 160);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = '#92400e';
    ctx.font = '900 10.5px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(`📦 ATTACHED AIRWAY BILL / CONSIGNMENT TRACKING SLIP (AWB: ${data.waybillNo || 'N/A'}):`, 47, currentY + 20);

    // Draw the slip photo scaled nicely
    const imgRatio = (awbSlipImg.width || 1) / (awbSlipImg.height || 1);
    const drawH = 120;
    const drawW = Math.min(drawH * imgRatio, 360);
    ctx.drawImage(awbSlipImg, 47, currentY + 30, drawW, drawH);

    ctx.fillStyle = '#64748b';
    ctx.font = '500 10px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(`Carrier: ${data.courierName || 'Courier Partner'} • Waybill: ${data.waybillNo || 'N/A'}`, 47 + drawW + 16, currentY + 60);
    ctx.fillText('Official physical consignment slip photographed at sales dispatch.', 47 + drawW + 16, currentY + 80);
    ctx.fillText('Tracking barcode verified and registered on UAE courier network.', 47 + drawW + 16, currentY + 100);

    currentY += 175;
  }

  // 8. Footer
  ctx.beginPath();
  ctx.moveTo(35, currentY);
  ctx.lineTo(width - 35, currentY);
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#94a3b8';
  ctx.font = '500 10px -apple-system, BlinkMacSystemFont, sans-serif';
  const fPhone = data.companyPhone || '+971 55 418 6086';
  ctx.fillText(
    `Thank you for your business! 🛍️ • Inquiries: ${fPhone} • vintagevibesgk.com • Official B2B Tax Document`,
    width / 2,
    currentY + 22
  );

  return canvas.toDataURL('image/jpeg', 0.92);
}
