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

import { VINTAGE_VIBES_GOLD_SEAL_A4_BASE64 } from '../assets/vintageGoldSeal';

export const VINTAGE_VIBES_MONOGRAM_SVG = `<img src="${VINTAGE_VIBES_GOLD_SEAL_A4_BASE64}" alt="Vintage Vibes Official Seal" class="vintage-vibes-seal-img" style="width: 76px; height: 76px; object-fit: contain; flex-shrink: 0; display: block; border-radius: 50%; filter: drop-shadow(0 2px 5px rgba(0,0,0,0.18));" />`;

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
            Downtown, Al Qaseedah District, 135 Khalifa Bin Zayed Street, Alain UAE
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
    (function() {
      var printed = false;
      function doPrint() {
        if (printed) return;
        printed = true;
        try {
          window.focus();
          window.print();
        } catch(e) {
          console.warn('[A4 Print] Window print failed:', e);
        }
      }
      function prepareAndPrint() {
        if (document.fonts && document.fonts.ready) {
          document.fonts.ready.then(function() {
            requestAnimationFrame(function() {
              setTimeout(doPrint, 40);
            });
          }).catch(function() {
            setTimeout(doPrint, 50);
          });
        } else {
          requestAnimationFrame(function() {
            setTimeout(doPrint, 50);
          });
        }
      }
      if (document.readyState === 'complete') {
        prepareAndPrint();
      } else {
        window.addEventListener('load', prepareAndPrint);
        setTimeout(doPrint, 300);
      }
    })();
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

export interface B2BTaxInvoiceA4Data {
  invoiceNo: string;
  invoiceDate: string;
  paymentMethod?: string;
  taxType?: string;
  exportCustomsDeclarationNo?: string;
  pdcChequeNo?: string;
  pdcChequeDate?: string;
  salespersonOrBroker?: string;
  
  // Customer
  customerName: string;
  customerAddress?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerTrn?: string;
  customerCoaCode?: string;

  // Logistics & Courier
  courierName?: string;
  waybillNo?: string;
  courierCoaCode?: string;
  courierFee?: number;
  courierFeePayer?: 'BUYER' | 'SELLER';
  airwayBillPhotoUrl?: string;

  // Items
  items: Array<{
    id?: string;
    barcode: string;
    description: string;
    isRawBale?: boolean;
    weightKg?: number;
    grossWeightKg?: number;
    weightGrams?: number;
    quantity?: number;
    unitPrice: number;
    finalAmount: number;
    sku?: string;
  }>;

  // Financials
  itemsSubtotal: number;
  otherCharges?: Array<{
    id?: string;
    chargeTitle?: string;
    title?: string;
    amount: number;
    isVatApplicable?: boolean;
    hasVat?: boolean;
  }>;
  otherChargesTotal: number;
  vatAmount: number;
  grandTotal: number;
  advanceAmountPaid?: number;
  packingListNotes?: string;
}

export function openB2BTaxInvoiceA4PrintWindow(data: B2BTaxInvoiceA4Data): Window | null {
  const printWin = window.open('', '_blank', 'width=950,height=1150,menubar=no,toolbar=no,location=no,status=no');
  if (!printWin) {
    alert('Pop-up blocked. Please allow pop-ups for this site to print the invoice.');
    return null;
  }

  const isMainland = data.taxType !== 'EXPORT_ZERO_RATED';
  const taxBadge = isMainland ? 'Standard 5% VAT (Mainland)' : '0% Zero-Rated (Export)';
  
  const paymentMethodLabel = 
    data.paymentMethod === 'BANK_TRANSFER' ? 'Bank Wire Transfer' :
    data.paymentMethod === 'CASH' ? 'Cash Settlement' :
    data.paymentMethod === 'CARD_POS' ? 'Card / POS Payment' :
    data.paymentMethod === 'PDC_CHEQUE' ? `PDC Cheque ${data.pdcChequeNo ? `(#${data.pdcChequeNo})` : ''}` :
    'Company Credit Account (Khata)';

  const itemsHtml = (data.items || []).map((it, idx) => {
    const net = Number(it.finalAmount) || 0;
    const vat = isMainland ? Number((net * 0.05).toFixed(2)) : 0;
    const gross = net + vat;
    const weightStr = it.isRawBale 
      ? `${Number(it.grossWeightKg || it.weightKg || 0).toFixed(1)} KG` 
      : `${it.weightGrams || 400} g`;

    return `
      <tr>
        <td style="padding: 7px 10px; border-bottom: 1px solid #e2e8f0; text-align: center; font-family: monospace; color: #64748b;">
          ${idx + 1}
        </td>
        <td style="padding: 7px 10px; border-bottom: 1px solid #e2e8f0;">
          <div style="font-family: monospace; font-weight: 700; color: #0f172a; font-size: 11px;">${it.barcode}</div>
          <div style="color: #475569; font-size: 10px;">${it.description}</div>
        </td>
        <td style="padding: 7px 10px; border-bottom: 1px solid #e2e8f0; text-align: center;">
          <span style="display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 700; font-family: monospace; background: ${it.isRawBale ? '#ecfdf5; color: #065f46;' : '#f8fafc; color: #475569;'}">
            ${it.isRawBale ? 'RAW BALE' : 'GARMENT PC'}
          </span>
        </td>
        <td style="padding: 7px 10px; border-bottom: 1px solid #e2e8f0; text-align: right; font-family: monospace; font-weight: 600; color: #0f172a;">
          ${weightStr}
        </td>
        <td style="padding: 7px 10px; border-bottom: 1px solid #e2e8f0; text-align: right; font-family: monospace; color: #334155;">
          ${Number(it.unitPrice).toFixed(2)}
        </td>
        <td style="padding: 7px 10px; border-bottom: 1px solid #e2e8f0; text-align: right; font-family: monospace; font-weight: 600; color: #0f172a;">
          ${net.toFixed(2)}
        </td>
        <td style="padding: 7px 10px; border-bottom: 1px solid #e2e8f0; text-align: right; font-family: monospace; color: #059669; font-weight: 600;">
          ${vat.toFixed(2)}
        </td>
        <td style="padding: 7px 10px; border-bottom: 1px solid #e2e8f0; text-align: right; font-family: monospace; font-weight: 800; color: #78350f;">
          ${gross.toFixed(2)}
        </td>
      </tr>
    `;
  }).join('');

  const otherChargesRows = (data.otherCharges || []).filter(c => (Number(c.amount) || 0) > 0).map(c => `
    <tr>
      <td style="padding: 3px 6px; color: #475569; font-weight: 600;">
        ${c.chargeTitle || c.title || 'Other Charge'}:
      </td>
      <td style="padding: 3px 6px; text-align: right; font-family: monospace; font-weight: 700; color: #0f172a;">
        AED ${Number(c.amount).toFixed(2)}
      </td>
    </tr>
  `).join('');

  const advancePaid = Number(data.advanceAmountPaid || 0);
  const balanceDue = Math.max(0, Number(data.grandTotal || 0) - advancePaid);
  const wordsAmount = numberToWords(Number(data.grandTotal || 0));

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Tax Invoice - ${data.invoiceNo || 'INV'}</title>
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
      padding: 14px;
      color: #0f172a;
      background: #f8fafc;
      font-size: 11px;
      line-height: 1.35;
    }
    .invoice-wrapper {
      max-width: 820px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 24px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.07);
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
        box-shadow: none;
      }
      .no-print {
        display: none !important;
      }
    }
    .header-box {
      border-bottom: 2.5px solid #b45309;
      padding-bottom: 12px;
      margin-bottom: 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
    }
    .brand-group {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .logo-title {
      font-family: 'Times New Roman', Georgia, serif;
      font-weight: 900;
      font-size: 15.5px;
      color: #78350f;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin: 0 0 3px 0;
    }
    .meta-text {
      font-size: 9.5px;
      color: #475569;
      margin: 1.5px 0;
    }
    .badge-ref {
      text-align: right;
      border-left: 2px solid #fde68a;
      padding-left: 14px;
      min-width: 200px;
    }
    .badge-pill {
      background: linear-gradient(135deg, #78350f 0%, #92400e 100%);
      color: #ffffff;
      font-weight: 900;
      font-size: 10px;
      letter-spacing: 0.8px;
      padding: 4px 10px;
      border-radius: 4px;
      display: inline-block;
      margin-bottom: 4px;
      text-transform: uppercase;
      box-shadow: 0 1px 2px rgba(0,0,0,0.1);
    }
    .two-col-grid {
      display: grid;
      grid-template-columns: 1.2fr 0.8fr;
      gap: 12px;
      margin-bottom: 14px;
    }
    .info-card {
      border: 1px solid #e2e8f0;
      background: #f8fafc;
      border-radius: 6px;
      padding: 10px 12px;
    }
    .card-label {
      font-size: 8.5px;
      font-weight: 800;
      text-transform: uppercase;
      color: #92400e;
      letter-spacing: 0.5px;
      display: block;
      margin-bottom: 3px;
    }
    .card-title {
      font-weight: 800;
      font-size: 13px;
      color: #0f172a;
      margin-bottom: 3px;
    }
    .card-desc {
      font-size: 9.5px;
      color: #475569;
      line-height: 1.4;
    }
    table.items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 14px;
      font-size: 10.5px;
    }
    table.items-table th {
      background: #fef3c7;
      border-top: 1.5px solid #b45309;
      border-bottom: 1.5px solid #b45309;
      padding: 7px 10px;
      font-weight: 800;
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #78350f;
    }
    .totals-grid {
      display: grid;
      grid-template-columns: 1.1fr 0.9fr;
      gap: 16px;
      margin-bottom: 14px;
      align-items: start;
    }
    .bank-card {
      border: 1px solid #cbd5e1;
      background: #ffffff;
      border-radius: 6px;
      padding: 10px 12px;
      font-size: 9.5px;
      color: #334155;
    }
    .bank-title {
      font-weight: 800;
      font-size: 10px;
      text-transform: uppercase;
      color: #0f172a;
      margin-bottom: 4px;
      letter-spacing: 0.5px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .karachya-summary-box {
      border: 1.5px solid #d97706;
      border-radius: 6px;
      background: #fffbeb;
      padding: 10px 14px;
    }
    .karachya-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10.5px;
    }
    .karachya-table td {
      padding: 3.5px 4px;
    }
    .words-box {
      border: 1px solid #fde68a;
      background: #ffffff;
      border-radius: 6px;
      padding: 8px 12px;
      margin-bottom: 14px;
      font-size: 10px;
    }
    .words-val {
      font-family: Georgia, serif;
      font-style: italic;
      font-weight: 700;
      color: #92400e;
    }
    .declaration {
      border-top: 1px solid #f1f5f9;
      margin-top: 5px;
      padding-top: 5px;
      font-size: 8.5px;
      color: #64748b;
      line-height: 1.35;
    }
    .signatures-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      margin-top: 22px;
      padding-top: 12px;
      border-top: 1px dashed #cbd5e1;
      text-align: center;
      font-size: 9.5px;
      font-weight: 700;
      color: #475569;
      text-transform: uppercase;
      position: relative;
    }
    .sig-line {
      height: 45px;
      border-bottom: 1.5px solid #94a3b8;
      margin-bottom: 4px;
    }
    .official-seal {
      position: absolute;
      left: 20%;
      bottom: -6px;
      width: 76px;
      height: 76px;
      border: 2px solid #b45309;
      border-radius: 50%;
      color: #b45309;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-size: 7px;
      font-weight: 900;
      letter-spacing: 0.5px;
      transform: rotate(-10deg);
      opacity: 0.82;
      pointer-events: none;
      background: rgba(254, 243, 199, 0.45);
      box-shadow: inset 0 0 0 2px #d97706;
    }
    .print-bar {
      margin-bottom: 12px;
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
    .btn {
      padding: 6px 16px;
      border-radius: 6px;
      font-weight: 700;
      font-size: 11px;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
    }
    .btn-print {
      background: #78350f;
      color: #fff;
    }
    .btn-print:hover {
      background: #92400e;
    }
    .btn-close {
      background: #f1f5f9;
      color: #334155;
      border: 1px solid #cbd5e1;
    }
    .btn-close:hover {
      background: #e2e8f0;
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
            Downtown, Al Qaseedah District, 135 Khalifa Bin Zayed Street, Alain UAE
          </p>
          <p class="meta-text">
            Tel: +971 55 418 6086 &bull; Email: sales@vintagevibesllcspc.com &bull; Tax TRN: <strong>100482910300003</strong>
          </p>
        </div>
      </div>

      <div class="badge-ref">
        <div class="badge-pill">TAX INVOICE / فاتورة ضريبية</div>
        <div style="font-family: monospace; font-size: 13.5px; font-weight: 900; color: #0f172a; margin-top: 2px;">
          ${data.invoiceNo || 'INV-DRAFT'}
        </div>
        <div style="font-family: monospace; font-size: 9.5px; color: #475569; margin-top: 2px;">
          DATE: <strong>${data.invoiceDate}</strong>
        </div>
        <div style="font-family: monospace; font-size: 9px; color: #64748b;">
          REGIME: <strong>${taxBadge}</strong>
        </div>
        <div style="font-family: monospace; font-size: 9px; color: #64748b;">
          TERMS: <strong>${paymentMethodLabel}</strong>
        </div>
      </div>
    </div>

    <!-- Customer & Compliance Details -->
    <div class="two-col-grid">
      <div class="info-card">
        <span class="card-label">Billed To (Buyer / العميل):</span>
        <div class="card-title">${data.customerName || 'Walk-in Corporate Client'}</div>
        <div class="card-desc">
          ${data.customerAddress || 'Industrial Area, Dubai, UAE'}<br>
          Tel / Mobile: <strong>${data.customerPhone || 'N/A'}</strong> ${data.customerEmail ? `&bull; ${data.customerEmail}` : ''}
          ${data.customerCoaCode ? `<br><span style="font-family: monospace; color: #3730a3; font-weight: 700;">Chart of Accounts (Khata): ${data.customerCoaCode}</span>` : ''}
        </div>
      </div>

      <div class="info-card">
        <span class="card-label">Tax & Logistics Parameters:</span>
        <div class="card-desc">
          <strong>Buyer UAE TRN:</strong> <span style="font-family: monospace; font-weight: 700; color: #0f172a;">${data.customerTrn || 'Not Registered / Freezone'}</span><br>
          <strong>Tax Treatment:</strong> ${isMainland ? 'Standard Mainland 5% VAT' : 'Export 0% Zero-Rated'}<br>
          ${data.courierName ? `<strong>Courier / Transporter:</strong> <span style="font-weight: 700; color: #0f172a;">${data.courierName}</span> ${data.courierCoaCode ? `<span style="font-family: monospace; color: #3730a3; font-size: 8.5px;">(${data.courierCoaCode})</span>` : ''}<br>` : ''}
          ${data.waybillNo ? `<strong>Waybill / Tracking #:</strong> <span style="font-family: monospace; font-weight: 700; color: #b45309;">${data.waybillNo}</span><br>` : ''}
          ${data.courierFee !== undefined && Number(data.courierFee) > 0 ? `<strong>Courier Fee:</strong> <span style="font-family: monospace; font-weight: 700; color: #0f172a;">AED ${Number(data.courierFee).toFixed(2)}</span> <span style="font-size: 8.5px; color: ${data.courierFeePayer === 'BUYER' ? '#b45309' : '#059669'}; font-weight: 700;">(${data.courierFeePayer === 'BUYER' ? 'Paid by Buyer' : 'FREE / Company Paid'})</span><br>` : ''}
          ${data.exportCustomsDeclarationNo ? `<strong>Customs Dec #:</strong> <span style="font-family: monospace; font-weight: 700;">${data.exportCustomsDeclarationNo}</span><br>` : ''}
          ${data.pdcChequeNo ? `<strong>PDC Cheque #:</strong> <span style="font-family: monospace; font-weight: 700;">${data.pdcChequeNo}</span> (Due: ${data.pdcChequeDate || 'N/A'})<br>` : ''}
          ${data.salespersonOrBroker ? `<strong>Representative / Broker:</strong> ${data.salespersonOrBroker}` : ''}
        </div>
      </div>
    </div>

    <!-- Items Table -->
    <table class="items-table">
      <thead>
        <tr>
          <th style="text-align: center; width: 36px;">#</th>
          <th style="text-align: left;">Barcode & Item Description</th>
          <th style="text-align: center; width: 85px;">Type</th>
          <th style="text-align: right; width: 85px;">Weight</th>
          <th style="text-align: right; width: 90px;">Unit Rate</th>
          <th style="text-align: right; width: 95px;">Net Amount</th>
          <th style="text-align: right; width: 75px;">VAT (5%)</th>
          <th style="text-align: right; width: 110px;">Total (AED)</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
    </table>

    <!-- Totals & Karachya Grid -->
    <div class="totals-grid">
      <!-- Left: Banking & Wire Settlement -->
      <div class="bank-card">
        <div class="bank-title">
          <span>🏛️ Bank Details for Wire Transfer</span>
        </div>
        <div style="line-height: 1.5;">
          <strong>Bank:</strong> Emirates NBD, Al Quoz Branch, Dubai<br>
          <strong>Beneficiary Name:</strong> Vintage Vibes General Trading L.L.C - S.P.C<br>
          <strong>IBAN:</strong> <span style="font-family: monospace; font-weight: 800; color: #0f172a;">AE28 0260 0010 4928 1900 003</span><br>
          <strong>SWIFT / BIC:</strong> <span style="font-family: monospace; font-weight: 700; color: #0f172a;">EBILAEAD</span> &bull; Currency: <strong>AED</strong>
        </div>
        ${data.customerCoaCode ? `
          <div style="margin-top: 6px; padding-top: 5px; border-top: 1px dashed #cbd5e1; font-size: 8.5px; color: #475569;">
            Ledger Settlement: B2B balance automatically posted to General Ledger sub-account <strong>${data.customerCoaCode}</strong>.
          </div>
        ` : ''}
      </div>

      <!-- Right: Financial Summary -->
      <div class="karachya-summary-box">
        <table class="karachya-table">
          <tbody>
            <tr>
              <td style="color: #475569; font-weight: 600;">Items Subtotal:</td>
              <td style="text-align: right; font-family: monospace; font-weight: 700; color: #0f172a;">
                AED ${data.itemsSubtotal.toFixed(2)}
              </td>
            </tr>
            ${otherChargesRows}
            ${data.otherChargesTotal > 0 && !otherChargesRows ? `
              <tr>
                <td style="color: #475569; font-weight: 600;">Freight & Handling:</td>
                <td style="text-align: right; font-family: monospace; font-weight: 700; color: #0f172a;">
                  AED ${data.otherChargesTotal.toFixed(2)}
                </td>
              </tr>
            ` : ''}
            ${data.courierFee !== undefined && Number(data.courierFee) > 0 ? `
              <tr>
                <td style="color: #475569; font-weight: 600;">Courier / Delivery Fee:</td>
                <td style="text-align: right; font-family: monospace; font-weight: 700; color: #0f172a;">
                  ${data.courierFeePayer === 'BUYER' ? `AED ${Number(data.courierFee).toFixed(2)}` : `<span style="color: #059669; font-size: 9.5px;">FREE (AED ${Number(data.courierFee).toFixed(2)} Absorbed)</span>`}
                </td>
              </tr>
            ` : ''}
            <tr>
              <td style="color: #059669; font-weight: 600;">VAT (${isMainland ? '5%' : '0%'}):</td>
              <td style="text-align: right; font-family: monospace; font-weight: 700; color: #059669;">
                AED ${data.vatAmount.toFixed(2)}
              </td>
            </tr>
            <tr style="border-top: 2px solid #b45309; background: #fef3c7;">
              <td style="font-weight: 900; font-size: 11.5px; text-transform: uppercase; color: #78350f; padding-top: 6px; padding-bottom: 6px;">
                TOTAL PAYABLE:
              </td>
              <td style="text-align: right; font-family: monospace; font-weight: 900; font-size: 13.5px; color: #78350f; padding-top: 6px; padding-bottom: 6px;">
                AED ${data.grandTotal.toFixed(2)}
              </td>
            </tr>
            ${advancePaid > 0 ? `
              <tr>
                <td style="color: #0284c7; font-weight: 600; padding-top: 4px;">Advance Amount Paid:</td>
                <td style="text-align: right; font-family: monospace; font-weight: 700; color: #0284c7; padding-top: 4px;">
                  AED ${advancePaid.toFixed(2)}
                </td>
              </tr>
              <tr style="border-top: 1px dashed #cbd5e1;">
                <td style="font-weight: 800; color: #b91c1c;">Net Balance Due:</td>
                <td style="text-align: right; font-family: monospace; font-weight: 800; color: #b91c1c;">
                  AED ${balanceDue.toFixed(2)}
                </td>
              </tr>
            ` : ''}
          </tbody>
        </table>
      </div>
    </div>

    ${data.airwayBillPhotoUrl ? `
      <!-- Attached Physical Airway Bill Slip -->
      <div style="margin-bottom: 14px; border: 1.5px dashed #cbd5e1; border-radius: 6px; padding: 12px; background: #f8fafc;">
        <div style="font-size: 9px; font-weight: 800; color: #92400e; text-transform: uppercase; margin-bottom: 8px;">
          📦 Attached Airway Bill / Consignment Tracking Slip (AWB: ${data.waybillNo || 'N/A'})
        </div>
        <div style="display: flex; gap: 14px; align-items: center;">
          <img src="${data.airwayBillPhotoUrl}" alt="Airway Bill Slip" style="max-height: 180px; max-width: 320px; border-radius: 4px; border: 1px solid #cbd5e1; object-fit: contain; background: #fff;" />
          <div style="font-size: 9.5px; color: #475569; line-height: 1.5;">
            <strong>Carrier Partner:</strong> ${data.courierName || 'Courier Partner'}<br>
            <strong>Consignment No:</strong> <span style="font-family: monospace; font-weight: 700; color: #b45309;">${data.waybillNo || 'N/A'}</span><br>
            Official physical waybill slip captured and attached at sales dispatch.<br>
            Tracking barcode verified and registered on UAE logistics network.
          </div>
        </div>
      </div>
    ` : ''}

    <!-- Amount in Words & Legal Tax Declaration -->
    <div class="words-box">
      <div>
        <strong>Total Amount in Words:</strong>
        <span class="words-val">${wordsAmount}</span>
      </div>
      <div class="declaration">
        <strong>Tax Compliance Notice:</strong> This is a formal UAE Tax Invoice issued pursuant to UAE Federal Decree-Law No. (8) of 2017 on Value Added Tax. Goods once sold are authentic certified grade vintage garments. All sales are subject to Vintage Vibes General Trading LLC standard commercial terms.
      </div>
    </div>

    <!-- Signatures & Stamp -->
    <div class="signatures-grid">
      <div style="position: relative;">
        <div class="sig-line"></div>
        <span>Authorized Signatory & Stamp</span>
        <div class="official-seal">
          <span>VINTAGE VIBES</span>
          <span style="font-size: 8px;">★ UAE ★</span>
          <span>OFFICIAL</span>
          <span style="font-size: 6px;">VERIFIED</span>
        </div>
      </div>

      <div>
        <div class="sig-line"></div>
        <span>Customer Acceptance & Signature</span>
      </div>
    </div>
  </div>

  <script>
    (function() {
      var printed = false;
      function doPrint() {
        if (printed) return;
        printed = true;
        try {
          window.focus();
          window.print();
        } catch(e) {
          console.warn('[A4 Print] Window print failed:', e);
        }
      }
      function prepareAndPrint() {
        if (document.fonts && document.fonts.ready) {
          document.fonts.ready.then(function() {
            requestAnimationFrame(function() {
              setTimeout(doPrint, 40);
            });
          }).catch(function() {
            setTimeout(doPrint, 50);
          });
        } else {
          requestAnimationFrame(function() {
            setTimeout(doPrint, 50);
          });
        }
      }
      if (document.readyState === 'complete') {
        prepareAndPrint();
      } else {
        window.addEventListener('load', prepareAndPrint);
        setTimeout(doPrint, 300);
      }
    })();
  </script>
</body>
</html>`;

  printWin.document.open();
  printWin.document.write(html);
  printWin.document.close();
  return printWin;
}

export function openB2BPackingListA4PrintWindow(data: B2BTaxInvoiceA4Data): Window | null {
  const printWin = window.open('', '_blank', 'width=950,height=1150,menubar=no,toolbar=no,location=no,status=no');
  if (!printWin) {
    alert('Pop-up blocked. Please allow pop-ups for this site to print the packing list.');
    return null;
  }

  const items = data.items || [];
  const totalBales = items.filter(i => i.isRawBale).length;
  const totalPieces = items.filter(i => !i.isRawBale).length;
  const totalWeightKg = items.reduce((acc, it) => {
    if (it.isRawBale) return acc + (Number(it.grossWeightKg || it.weightKg || 0));
    return acc + ((Number(it.weightGrams || 400)) / 1000);
  }, 0);

  const itemsHtml = items.map((it, idx) => {
    const weightStr = it.isRawBale 
      ? `${Number(it.grossWeightKg || it.weightKg || 0).toFixed(1)} KG` 
      : `${it.weightGrams || 400} g`;

    return `
      <tr>
        <td style="padding: 7px 10px; border-bottom: 1px solid #e2e8f0; text-align: center; font-family: monospace; color: #64748b;">
          ${idx + 1}
        </td>
        <td style="padding: 7px 10px; border-bottom: 1px solid #e2e8f0; font-family: monospace; font-weight: 700; color: #0f172a;">
          ${it.barcode}
        </td>
        <td style="padding: 7px 10px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">
          ${it.description}
        </td>
        <td style="padding: 7px 10px; border-bottom: 1px solid #e2e8f0; text-align: center;">
          <span style="display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 700; font-family: monospace; background: ${it.isRawBale ? '#ecfdf5; color: #065f46;' : '#f1f5f9; color: #475569;'}">
            ${it.isRawBale ? 'RAW BALE' : 'GARMENT PC'}
          </span>
        </td>
        <td style="padding: 7px 10px; border-bottom: 1px solid #e2e8f0; text-align: right; font-family: monospace; font-weight: 700; color: #0f172a;">
          ${weightStr}
        </td>
      </tr>
    `;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Warehouse Packing List - ${data.invoiceNo || 'PACK'}</title>
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
      padding: 14px;
      color: #0f172a;
      background: #f8fafc;
      font-size: 11px;
      line-height: 1.35;
    }
    .invoice-wrapper {
      max-width: 820px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 24px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.07);
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
        box-shadow: none;
      }
      .no-print {
        display: none !important;
      }
    }
    .header-box {
      border-bottom: 2.5px solid #0f766e;
      padding-bottom: 12px;
      margin-bottom: 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
    }
    .brand-group {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .logo-title {
      font-family: 'Times New Roman', Georgia, serif;
      font-weight: 900;
      font-size: 15.5px;
      color: #0f766e;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin: 0 0 3px 0;
    }
    .meta-text {
      font-size: 9.5px;
      color: #475569;
      margin: 1.5px 0;
    }
    .badge-ref {
      text-align: right;
      border-left: 2px solid #99f6e4;
      padding-left: 14px;
      min-width: 200px;
    }
    .badge-pill {
      background: linear-gradient(135deg, #0f766e 0%, #115e59 100%);
      color: #ffffff;
      font-weight: 900;
      font-size: 10px;
      letter-spacing: 0.8px;
      padding: 4px 10px;
      border-radius: 4px;
      display: inline-block;
      margin-bottom: 4px;
      text-transform: uppercase;
      box-shadow: 0 1px 2px rgba(0,0,0,0.1);
    }
    .stats-card {
      background: #f0fdfa;
      border: 1px solid #ccfbf1;
      border-radius: 6px;
      padding: 10px 14px;
      margin-bottom: 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    table.items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 14px;
      font-size: 10.5px;
    }
    table.items-table th {
      background: #ccfbf1;
      border-top: 1.5px solid #0f766e;
      border-bottom: 1.5px solid #0f766e;
      padding: 7px 10px;
      font-weight: 800;
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #0f766e;
    }
    .notes-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 10px 12px;
      margin-bottom: 16px;
      font-size: 10px;
      color: #334155;
    }
    .signatures-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 16px;
      margin-top: 24px;
      padding-top: 12px;
      border-top: 1px dashed #cbd5e1;
      text-align: center;
      font-size: 9.5px;
      font-weight: 700;
      color: #475569;
      text-transform: uppercase;
    }
    .sig-line {
      height: 45px;
      border-bottom: 1.5px solid #94a3b8;
      margin-bottom: 4px;
    }
    .print-bar {
      margin-bottom: 12px;
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
    .btn {
      padding: 6px 16px;
      border-radius: 6px;
      font-weight: 700;
      font-size: 11px;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
    }
    .btn-print {
      background: #0f766e;
      color: #fff;
    }
    .btn-print:hover {
      background: #115e59;
    }
    .btn-close {
      background: #f1f5f9;
      color: #334155;
      border: 1px solid #cbd5e1;
    }
    .btn-close:hover {
      background: #e2e8f0;
    }
  </style>
</head>
<body>
  <div class="no-print print-bar">
    <button class="btn btn-print" onclick="window.print()">🖨️ Print / Save as PDF</button>
    <button class="btn btn-close" onclick="window.close()">✕ Close</button>
  </div>

  <div class="invoice-wrapper">
    <div class="header-box">
      <div class="brand-group">
        ${VINTAGE_VIBES_MONOGRAM_SVG}
        <div>
          <h1 class="logo-title">VINTAGE VIBES LOGISTICS & WAREHOUSE</h1>
          <p class="meta-text">Outward Cargo Dispatch & Freight Terminal</p>
          <p class="meta-text">Downtown, Al Qaseedah District, 135 Khalifa Bin Zayed Street, Alain UAE</p>
        </div>
      </div>

      <div class="badge-ref">
        <div class="badge-pill">WAREHOUSE PACKING LIST</div>
        <div style="font-family: monospace; font-size: 13.5px; font-weight: 900; color: #0f172a; margin-top: 2px;">
          ${data.invoiceNo || 'PACK-DRAFT'}
        </div>
        <div style="font-family: monospace; font-size: 9.5px; color: #475569; margin-top: 2px;">
          DATE: <strong>${data.invoiceDate}</strong>
        </div>
      </div>
    </div>

    <div class="stats-card">
      <div>
        <div style="font-size: 9px; text-transform: uppercase; font-weight: 800; color: #0f766e;">Consignee / Destination:</div>
        <div style="font-size: 13px; font-weight: 800; color: #0f172a;">${data.customerName || 'Wholesale Buyer'}</div>
        <div style="font-size: 9.5px; color: #475569;">${data.customerAddress || 'UAE Domestic Cargo'}</div>
        ${data.courierName ? `<div style="font-size: 9.5px; margin-top: 3px; color: #0f172a;"><strong>Assigned Courier:</strong> ${data.courierName} ${data.waybillNo ? `&bull; <strong>Waybill / Tracking #:</strong> <span style="font-family: monospace; font-weight: 700; color: #0f766e;">${data.waybillNo}</span>` : ''}</div>` : ''}
      </div>
      <div style="text-align: right; display: flex; gap: 16px;">
        <div>
          <div style="font-size: 8.5px; text-transform: uppercase; font-weight: 700; color: #64748b;">Total Bales</div>
          <div style="font-size: 14px; font-weight: 900; color: #0f766e; font-family: monospace;">${totalBales}</div>
        </div>
        <div>
          <div style="font-size: 8.5px; text-transform: uppercase; font-weight: 700; color: #64748b;">Total Pieces</div>
          <div style="font-size: 14px; font-weight: 900; color: #0f766e; font-family: monospace;">${totalPieces}</div>
        </div>
        <div>
          <div style="font-size: 8.5px; text-transform: uppercase; font-weight: 700; color: #64748b;">Total Net Weight</div>
          <div style="font-size: 14px; font-weight: 900; color: #0f766e; font-family: monospace;">${totalWeightKg.toFixed(1)} KG</div>
        </div>
      </div>
    </div>

    <table class="items-table">
      <thead>
        <tr>
          <th style="text-align: center; width: 40px;">Pkg #</th>
          <th style="text-align: left; width: 180px;">Barcode Identifier</th>
          <th style="text-align: left;">Item Description & Specifications</th>
          <th style="text-align: center; width: 100px;">Classification</th>
          <th style="text-align: right; width: 110px;">Gross Weight</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
    </table>

    ${data.packingListNotes ? `
      <div class="notes-box">
        <strong>Dispatch & Warehouse Instructions:</strong> ${data.packingListNotes}
      </div>
    ` : ''}

    <div class="signatures-grid">
      <div>
        <div class="sig-line"></div>
        <span>Warehouse Picker / Loader</span>
      </div>
      <div>
        <div class="sig-line"></div>
        <span>Transport Driver & Truck Plate #</span>
      </div>
      <div>
        <div class="sig-line"></div>
        <span>Consignee Receiving Seal & Signature</span>
      </div>
    </div>
  </div>

  <script>
    (function() {
      var printed = false;
      function doPrint() {
        if (printed) return;
        printed = true;
        try {
          window.focus();
          window.print();
        } catch(e) {
          console.warn('[A4 Print] Window print failed:', e);
        }
      }
      function prepareAndPrint() {
        if (document.fonts && document.fonts.ready) {
          document.fonts.ready.then(function() {
            requestAnimationFrame(function() {
              setTimeout(doPrint, 40);
            });
          }).catch(function() {
            setTimeout(doPrint, 50);
          });
        } else {
          requestAnimationFrame(function() {
            setTimeout(doPrint, 50);
          });
        }
      }
      if (document.readyState === 'complete') {
        prepareAndPrint();
      } else {
        window.addEventListener('load', prepareAndPrint);
        setTimeout(doPrint, 300);
      }
    })();
  </script>
</body>
</html>`;

  printWin.document.open();
  printWin.document.write(html);
  printWin.document.close();
  return printWin;
}


