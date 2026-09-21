export interface InvoiceA4PrintData {
  docNo: string;
  date: string;
  supplierName: string;
  supplierTrn?: string;
  consigneeName: string;
  consigneeAddress: string;
  consigneeTrn: string;
  vesselName: string;
  billOfLading: string;
  containerNo: string;
  portOfDischarge: string;
  items: Array<{
    description: string;
    hsCode?: string;
    quantityBales: number;
    netWeightKg: number;
    grossWeightKg: number;
    unitPriceUsd: number;
    totalUsd: number;
    unitPriceAed: number;
    totalAed: number;
  }>;
  totalBales: number;
  totalNetKg: number;
  totalGrossKg: number;
  totalUsd: number;
  totalAed: number;
  amountInWords: string;
  // Landed Cost & Expense Accounting ("Karachya" Breakdown)
  currency?: string;
  exchangeRate?: number;
  itemsSubTotal?: number;
  freightAmount?: number;
  customsDutyAmount?: number;
  terminalHandlingAmount?: number;
  deductionAmount?: number;
  vatAmount?: number;
  grandTotal?: number;
  grandTotalAed?: number;
  notes?: string;
}

const VINTAGE_VIBES_MONOGRAM_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="76" height="76" style="flex-shrink: 0;">
  <defs>
    <radialGradient id="outerBevel" cx="40%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#fff5cc" />
      <stop offset="25%" stop-color="#dfb15b" />
      <stop offset="50%" stop-color="#9a6e18" />
      <stop offset="75%" stop-color="#d4af37" />
      <stop offset="100%" stop-color="#4a3508" />
    </radialGradient>
    <linearGradient id="goldLinear" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fcedb3" />
      <stop offset="30%" stop-color="#d4af37" />
      <stop offset="60%" stop-color="#aa7c11" />
      <stop offset="85%" stop-color="#fdf3cd" />
      <stop offset="100%" stop-color="#8b6508" />
    </linearGradient>
    <linearGradient id="silverLinear" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="40%" stop-color="#d1d5db" />
      <stop offset="70%" stop-color="#9ca3af" />
      <stop offset="100%" stop-color="#4b5563" />
    </linearGradient>
    <radialGradient id="globeSphere" cx="35%" cy="30%" r="70%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="45%" stop-color="#e5e7eb" />
      <stop offset="80%" stop-color="#cbd5e1" />
      <stop offset="100%" stop-color="#94a3b8" />
    </radialGradient>
  </defs>
  <circle cx="250" cy="250" r="242" fill="url(#outerBevel)" stroke="#3d2a07" stroke-width="4" />
  <circle cx="250" cy="250" r="236" fill="none" stroke="#ffe89e" stroke-width="2" />
  <circle cx="250" cy="250" r="226" fill="none" stroke="#684a0c" stroke-width="3" />
  <circle cx="250" cy="250" r="220" fill="#faf7ee" stroke="#b38927" stroke-width="3" />
  <path id="textArcTop" d="M 58 250 A 192 192 0 1 1 442 250" fill="none" />
  <path id="textArcBottom" d="M 442 250 A 192 192 0 1 1 58 250" fill="none" />
  <text font-family="'Times New Roman', Georgia, serif" font-weight="900" font-size="34" fill="url(#goldLinear)" letter-spacing="9">
    <textPath href="#textArcTop" startOffset="50%" text-anchor="middle">VINTAGE VIBES</textPath>
  </text>
  <text font-family="'Times New Roman', serif" font-weight="800" font-size="18" fill="url(#goldLinear)" letter-spacing="4">
    <textPath href="#textArcBottom" startOffset="50%" text-anchor="middle">GENERAL TRADING - L.L.C - S.P.C</textPath>
  </text>
  <circle cx="250" cy="250" r="148" fill="url(#silverLinear)" stroke="#4b5563" stroke-width="4" />
  <circle cx="250" cy="250" r="142" fill="none" stroke="#ffffff" stroke-width="2" />
  <circle cx="250" cy="250" r="136" fill="#1b2430" stroke="#9ca3af" stroke-width="3" />
  <circle cx="250" cy="250" r="132" fill="url(#globeSphere)" />
  <ellipse cx="250" cy="250" rx="132" ry="132" fill="none" stroke="#94a3b8" stroke-width="2.5" />
  <ellipse cx="250" cy="250" rx="95" ry="132" fill="none" stroke="#64748b" stroke-width="2.5" />
  <ellipse cx="250" cy="250" rx="50" ry="132" fill="none" stroke="#64748b" stroke-width="2.5" />
  <line x1="250" y1="118" x2="250" y2="382" stroke="#475569" stroke-width="3.5" />
  <line x1="118" y1="250" x2="382" y2="250" stroke="#475569" stroke-width="3.5" />
  <circle cx="250" cy="250" r="95" fill="none" stroke="url(#goldLinear)" stroke-width="12" />
  <g id="vvMonogram">
    <path d="M 152 216 L 218 216 L 250 318 L 282 216 L 348 216 L 272 352 L 228 352 Z" fill="url(#goldLinear)" stroke="#593f05" stroke-width="2" />
    <path d="M 184 228 L 226 228 L 250 298 L 274 228 L 316 228 L 264 324 L 236 324 Z" fill="url(#goldLinear)" stroke="#ffe58f" stroke-width="1.5" />
  </g>
</svg>`;

export function openCommercialInvoiceA4PrintWindow(data: InvoiceA4PrintData): Window | null {
  const printWin = window.open('', '_blank', 'width=950,height=1150,menubar=no,toolbar=no,location=no,status=no');
  if (!printWin) {
    alert('Pop-up blocked. Please allow pop-ups for this site to print the invoice.');
    return null;
  }

  const currency = (data.currency || 'USD').toUpperCase();
  const rate = Number(data.exchangeRate) || (currency === 'USD' ? 3.6725 : currency === 'EUR' ? 4.015 : 1);
  const currSym = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : 'AED ';

  const itemsSubTotal = Number(data.itemsSubTotal ?? (currency === 'USD' ? data.totalUsd : data.totalAed));
  const freight = Number(data.freightAmount || 0);
  const customs = Number(data.customsDutyAmount || 0);
  const terminalHandling = Number(data.terminalHandlingAmount || 0);
  const deductions = Number(data.deductionAmount || 0);
  const vat = Number(data.vatAmount || 0);
  const grandTotalDoc = Number(data.grandTotal ?? (itemsSubTotal + freight + customs + terminalHandling - deductions + vat));
  const grandTotalAed = Number(data.grandTotalAed ?? (currency === 'AED' ? grandTotalDoc : Number((grandTotalDoc * rate).toFixed(2))));

  const itemsHtml = data.items.map((it) => `
    <tr>
      <td style="padding: 7px 10px; border-bottom: 1px solid #e5e7eb; font-family: sans-serif; font-weight: 600; color: #111827;">
        ${it.description}
      </td>
      <td style="padding: 7px 10px; border-bottom: 1px solid #e5e7eb; text-align: center; font-family: monospace; color: #4b5563;">
        ${it.hsCode || '6309.00.10'}
      </td>
      <td style="padding: 7px 10px; border-bottom: 1px solid #e5e7eb; text-align: center; font-family: monospace; font-weight: 700; color: #111827;">
        ${it.quantityBales}
      </td>
      <td style="padding: 7px 10px; border-bottom: 1px solid #e5e7eb; text-align: right; font-family: monospace; color: #111827;">
        ${it.netWeightKg.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} KG
      </td>
      <td style="padding: 7px 10px; border-bottom: 1px solid #e5e7eb; text-align: right; font-family: monospace; color: #111827;">
        $${it.unitPriceUsd.toFixed(2)}
      </td>
      <td style="padding: 7px 10px; border-bottom: 1px solid #e5e7eb; text-align: right; font-family: monospace; font-weight: 600; color: #111827;">
        $${it.totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </td>
      <td style="padding: 7px 10px; border-bottom: 1px solid #e5e7eb; text-align: right; font-family: monospace; font-weight: 700; color: #78350f;">
        AED ${it.totalAed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </td>
    </tr>
  `).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Commercial Customs Invoice - ${data.docNo}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 10mm 10mm 12mm 10mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 12px;
      color: #1f2937;
      background: #ffffff;
      font-size: 11px;
      line-height: 1.35;
    }
    .invoice-wrapper {
      max-width: 820px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 20px;
    }
    @media print {
      body {
        padding: 0;
        background: transparent;
      }
      .invoice-wrapper {
        border: none;
        padding: 0;
        max-width: 100%;
      }
      .no-print {
        display: none !important;
      }
    }
    .header-box {
      border-bottom: 2px solid #b45309;
      padding-bottom: 12px;
      margin-bottom: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
    }
    .brand-group {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .logo-title {
      font-family: 'Times New Roman', Georgia, serif;
      font-weight: 900;
      font-size: 15px;
      color: #78350f;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin: 0 0 3px 0;
    }
    .meta-text {
      font-size: 9.5px;
      color: #4b5563;
      margin: 1.5px 0;
    }
    .badge-ref {
      text-align: right;
      border-left: 2px solid #fde68a;
      padding-left: 12px;
      min-width: 180px;
    }
    .badge-pill {
      background: #78350f;
      color: #ffffff;
      font-weight: 700;
      font-size: 9.5px;
      letter-spacing: 1px;
      padding: 3px 8px;
      border-radius: 4px;
      display: inline-block;
      margin-bottom: 3px;
      text-transform: uppercase;
    }
    .two-col-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 12px;
    }
    .info-card {
      border: 1px solid #fde68a;
      background: #fffbeb;
      border-radius: 6px;
      padding: 8px 10px;
    }
    .card-label {
      font-size: 8.5px;
      font-weight: 800;
      text-transform: uppercase;
      color: #92400e;
      letter-spacing: 0.5px;
      display: block;
      margin-bottom: 2px;
    }
    .card-title {
      font-weight: 800;
      font-size: 12px;
      color: #111827;
      margin-bottom: 2px;
    }
    .card-desc {
      font-size: 9.5px;
      color: #4b5563;
      line-height: 1.3;
    }
    .transport-bar {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 7px 10px;
      margin-bottom: 12px;
      font-family: monospace;
      font-size: 9.5px;
    }
    .transport-label {
      font-size: 8px;
      text-transform: uppercase;
      font-weight: 700;
      color: #64748b;
      display: block;
    }
    .transport-val {
      font-weight: 700;
      color: #0f172a;
    }
    table.items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12px;
      font-size: 10.5px;
    }
    table.items-table th {
      background: #fef3c7;
      border-top: 1px solid #b45309;
      border-bottom: 1px solid #b45309;
      padding: 6px 8px;
      font-weight: 800;
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #78350f;
    }
    table.items-table tfoot td {
      background: #fef3c7;
      border-top: 2px solid #78350f;
      border-bottom: 2px solid #78350f;
      padding: 6px 8px;
      font-weight: 900;
      font-size: 10.5px;
      color: #78350f;
      font-family: monospace;
    }
    /* Landed Cost Accounting & Karachya Grid */
    .karachya-box {
      border: 1px solid #b45309;
      border-radius: 6px;
      background: #fffbeb;
      padding: 10px 14px;
      margin-bottom: 12px;
    }
    .karachya-title {
      font-size: 9.5px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #78350f;
      border-bottom: 1px dashed #d97706;
      padding-bottom: 4px;
      margin-bottom: 8px;
      display: flex;
      justify-content: space-between;
    }
    .karachya-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
    }
    .karachya-table td {
      padding: 3px 6px;
    }
    .words-box {
      border: 1px solid #fde68a;
      background: #ffffff;
      border-radius: 6px;
      padding: 8px 10px;
      margin-bottom: 14px;
      font-size: 10.5px;
    }
    .words-val {
      font-family: Georgia, serif;
      font-style: italic;
      font-weight: 700;
      color: #92400e;
    }
    .declaration {
      border-top: 1px solid #f3f4f6;
      margin-top: 5px;
      padding-top: 5px;
      font-size: 9px;
      color: #4b5563;
      line-height: 1.3;
    }
    .signatures-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 16px;
      margin-top: 24px;
      padding-top: 10px;
      border-top: 1px dashed #d97706;
      text-align: center;
      font-size: 9px;
      font-weight: 700;
      color: #4b5563;
      text-transform: uppercase;
      position: relative;
    }
    .sig-line {
      height: 35px;
      border-bottom: 1px solid #9ca3af;
      margin-bottom: 3px;
    }
    .customs-stamp {
      position: absolute;
      right: 15%;
      bottom: -10px;
      width: 70px;
      height: 70px;
      border: 2px solid #dc2626;
      border-radius: 50%;
      color: #dc2626;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-size: 7.5px;
      font-weight: 900;
      letter-spacing: 0.5px;
      transform: rotate(-12deg);
      opacity: 0.85;
      pointer-events: none;
      background: rgba(254, 242, 242, 0.4);
    }
    .print-bar {
      margin-bottom: 12px;
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
    .btn {
      padding: 6px 14px;
      border-radius: 6px;
      font-weight: 700;
      font-size: 11px;
      cursor: pointer;
      border: none;
    }
    .btn-print {
      background: #78350f;
      color: #fff;
    }
    .btn-close {
      background: #f3f4f6;
      color: #374151;
      border: 1px solid #d1d5db;
    }
  </style>
</head>
<body>
  <div class="no-print print-bar">
    <button class="btn btn-print" onclick="window.print()">🖨️ Print / Save as PDF</button>
    <button class="btn btn-close" onclick="window.close()">✕ Close</button>
  </div>

  <div class="invoice-wrapper">
    <!-- Header with Official Vintage Vibes Monogram -->
    <div class="header-box">
      <div class="brand-group">
        ${VINTAGE_VIBES_MONOGRAM_SVG}
        <div>
          <h1 class="logo-title">VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C</h1>
          <p class="meta-text" style="font-family: monospace; font-size: 9px;">
            Dubai Economy & Tourism License: <strong>1049281</strong> &bull; Customs Code: <strong>AE-9281048</strong>
          </p>
          <p class="meta-text">
            House 14 Street 4 - Al Jimi - Al Nudood, Al Ain, Abu Dhabi, United Arab Emirates
          </p>
          <p class="meta-text">
            Tel: +971 55 418 6086 &bull; Email: sales@vintagevibesllcspc.com &bull; Tax TRN: <strong>100482910300003</strong>
          </p>
        </div>
      </div>

      <div class="badge-ref">
        <div class="badge-pill">Commercial Customs Invoice</div>
        <div style="font-family: monospace; font-size: 12.5px; font-weight: 900; color: #111827;">
          REF: ${data.docNo}
        </div>
        <div style="font-family: monospace; font-size: 9.5px; color: #4b5563; margin-top: 2px;">
          DATE: <strong>${data.date}</strong>
        </div>
        <div style="font-family: monospace; font-size: 9px; color: #6b7280;">
          INCOTERMS: <strong>CIF DUBAI (2020)</strong>
        </div>
      </div>
    </div>

    <!-- Shipper & Consignee -->
    <div class="two-col-grid">
      <div class="info-card">
        <span class="card-label">Shipper / Exporter:</span>
        <div class="card-title">${data.supplierName}</div>
        <div class="card-desc">
          ${data.supplierTrn ? `TRN / TAX ID: ${data.supplierTrn}` : 'Direct Consignor / Factory Dispatch'}<br>
          Origin: Global Vintage Sourcing / Consignor Dispatch
        </div>
      </div>

      <div class="info-card">
        <span class="card-label">Consignee & Buyer:</span>
        <div class="card-title">${data.consigneeName}</div>
        <div class="card-desc">
          ${data.consigneeAddress}<br>
          TRN: ${data.consigneeTrn} &bull; Notify: Same as Consignee
        </div>
      </div>
    </div>

    <!-- Transport Parameters -->
    <div class="transport-bar">
      <div>
        <span class="transport-label">Vessel / Voyage:</span>
        <span class="transport-val">${data.vesselName || '-'}</span>
      </div>
      <div>
        <span class="transport-label">Bill of Lading:</span>
        <span class="transport-val">${data.billOfLading || '-'}</span>
      </div>
      <div>
        <span class="transport-label">Container No:</span>
        <span class="transport-val">${data.containerNo || '-'}</span>
      </div>
      <div>
        <span class="transport-label">Discharge Port:</span>
        <span class="transport-val" style="color: #78350f;">${data.portOfDischarge}</span>
      </div>
    </div>

    <!-- Cargo Line Items Table -->
    <table class="items-table">
      <thead>
        <tr>
          <th style="text-align: left;">Item Description</th>
          <th style="text-align: center;">HS Code</th>
          <th style="text-align: center;">Bales</th>
          <th style="text-align: right;">Net Wt (KG)</th>
          <th style="text-align: right;">Unit Rate</th>
          <th style="text-align: right;">Total (${currency})</th>
          <th style="text-align: right;">Total (AED)</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="2" style="text-align: right; text-transform: uppercase; font-family: sans-serif;">
            Cargo FOB / CIF Base Subtotal:
          </td>
          <td style="text-align: center;">${data.totalBales} Bales</td>
          <td style="text-align: right;">${data.totalNetKg.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} KG</td>
          <td style="text-align: right;">-</td>
          <td style="text-align: right;">${currSym}${itemsSubTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td style="text-align: right; font-size: 11px; font-weight: 900;">AED ${data.totalAed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        </tr>
      </tfoot>
    </table>

    <!-- Complete Landed Cost & Expense Accounting ("Karachya" Breakdown) -->
    <div class="karachya-box">
      <div class="karachya-title">
        <span>Official Landed Cost Accounting & Clearing Expenses ("Karachya" Breakdown)</span>
        <span style="font-family: monospace;">FX Rate: 1 ${currency} = AED ${rate.toFixed(4)}</span>
      </div>
      <table class="karachya-table">
        <tbody>
          <tr>
            <td style="width: 45%; color: #4b5563; font-weight: 600;">Base Goods Subtotal (FOB / Factory Invoice):</td>
            <td style="text-align: right; font-family: monospace; font-weight: 700; color: #111827;">
              ${currSym}${itemsSubTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </td>
            <td style="text-align: right; font-family: monospace; color: #78350f; font-weight: 600;">
              AED ${(currency === 'AED' ? itemsSubTotal : itemsSubTotal * rate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </td>
          </tr>
          <tr>
            <td style="color: #4b5563; font-weight: 600;">Ocean / Air Freight Charges (سمندری / فضائی کرایہ):</td>
            <td style="text-align: right; font-family: monospace; font-weight: 700; color: #111827;">
              ${freight > 0 ? `+${currSym}${freight.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '0.00'}
            </td>
            <td style="text-align: right; font-family: monospace; color: #78350f; font-weight: 600;">
              ${freight > 0 ? `+AED ${(currency === 'AED' ? freight : freight * rate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '0.00'}
            </td>
          </tr>
          <tr>
            <td style="color: #4b5563; font-weight: 600;">UAE Customs Duties & Tariffs (کسٹم ڈیوٹی 5%):</td>
            <td style="text-align: right; font-family: monospace; font-weight: 700; color: #111827;">
              ${customs > 0 ? `+${currSym}${customs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '0.00'}
            </td>
            <td style="text-align: right; font-family: monospace; color: #78350f; font-weight: 600;">
              ${customs > 0 ? `+AED ${(currency === 'AED' ? customs : customs * rate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '0.00'}
            </td>
          </tr>
          <tr>
            <td style="color: #4b5563; font-weight: 600;">Port Terminal Handling & Offloading (ٹرمینل و کلیئرنس):</td>
            <td style="text-align: right; font-family: monospace; font-weight: 700; color: #111827;">
              ${terminalHandling > 0 ? `+${currSym}${terminalHandling.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '0.00'}
            </td>
            <td style="text-align: right; font-family: monospace; color: #78350f; font-weight: 600;">
              ${terminalHandling > 0 ? `+AED ${(currency === 'AED' ? terminalHandling : terminalHandling * rate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '0.00'}
            </td>
          </tr>
          <tr>
            <td style="color: #dc2626; font-weight: 600;">Commercial Deductions & Supplier Discounts (رعایت):</td>
            <td style="text-align: right; font-family: monospace; font-weight: 700; color: #dc2626;">
              ${deductions > 0 ? `-${currSym}${deductions.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '0.00'}
            </td>
            <td style="text-align: right; font-family: monospace; color: #dc2626; font-weight: 600;">
              ${deductions > 0 ? `-AED ${(currency === 'AED' ? deductions : deductions * rate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '0.00'}
            </td>
          </tr>
          <tr>
            <td style="color: #059669; font-weight: 600;">UAE Federal Tax Authority VAT 5% (ٹیکس):</td>
            <td style="text-align: right; font-family: monospace; font-weight: 700; color: #059669;">
              ${vat > 0 ? `+${currSym}${vat.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '0.00'}
            </td>
            <td style="text-align: right; font-family: monospace; color: #059669; font-weight: 600;">
              ${vat > 0 ? `+AED ${(currency === 'AED' ? vat : vat * rate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '0.00'}
            </td>
          </tr>
          <tr style="border-top: 1.5px solid #b45309; background: #fef3c7;">
            <td style="font-weight: 900; font-size: 11px; text-transform: uppercase; color: #78350f; padding-top: 5px; padding-bottom: 5px;">
              NET TOTAL COMMERCIAL PAYABLE (کل قابل ادائیگی رقم):
            </td>
            <td style="text-align: right; font-family: monospace; font-weight: 900; font-size: 12px; color: #111827; padding-top: 5px; padding-bottom: 5px;">
              ${currSym}${grandTotalDoc.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </td>
            <td style="text-align: right; font-family: monospace; font-weight: 900; font-size: 12px; color: #78350f; padding-top: 5px; padding-bottom: 5px;">
              AED ${grandTotalAed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Words & Declaration -->
    <div class="words-box">
      <div>
        <strong>Total Commercial Invoice Amount in Words:</strong>
        <span class="words-val">${data.amountInWords} (AED ${grandTotalAed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</span>
      </div>
      <div class="declaration">
        <strong>Customs Declaration:</strong> We certify that this invoice shows the actual price of the authentic pre-owned vintage garments described, including all landed expenses and cargo transport logistics, that no other invoice has been or will be issued, and that all particulars are true and correct according to UAE Federal Customs Authority regulations.
      </div>
    </div>

    <!-- Signatures & Customs Seal -->
    <div class="signatures-grid">
      <div>
        <div class="sig-line"></div>
        <span>Shipper / Exporter Signature</span>
      </div>
      <div>
        <div class="sig-line"></div>
        <span>Dubai Customs Gate Inspector</span>
      </div>
      <div>
        <div class="sig-line"></div>
        <span>Vintage Vibes Managing Director</span>
      </div>

      <div class="customs-stamp">
        <span>JEBEL ALI PORT</span>
        <span>★ AEJEA ★</span>
        <span style="font-size: 8px; font-weight: 900;">CLEARED</span>
        <span style="font-size: 6.5px;">CUSTOMS</span>
      </div>
    </div>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 350);
    };
  </script>
</body>
</html>`;

  printWin.document.open();
  printWin.document.write(html);
  printWin.document.close();
  return printWin;
}

export function numberToWords(amount: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const num = Math.floor(amount);
  const fils = Math.round((amount - num) * 100);

  function convertGroup(n: number): string {
    let str = '';
    if (n >= 100) {
      str += ones[Math.floor(n / 100)] + ' Hundred ';
      n %= 100;
    }
    if (n >= 20) {
      str += tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '') + ' ';
    } else if (n > 0) {
      str += ones[n] + ' ';
    }
    return str;
  }

  if (num === 0) return 'Zero UAE Dirhams Only';
  let result = '';
  const millions = Math.floor(num / 1000000);
  const thousands = Math.floor((num % 1000000) / 1000);
  const remainder = num % 1000;

  if (millions) result += convertGroup(millions) + 'Million ';
  if (thousands) result += convertGroup(thousands) + 'Thousand ';
  if (remainder) result += convertGroup(remainder);

  result = result.trim() + ' UAE Dirhams';
  if (fils > 0) {
    result += ' and ' + fils + '/100 Fils';
  }
  result += ' Only';
  return result;
}

