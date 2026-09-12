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
}

export function openCommercialInvoiceA4PrintWindow(data: InvoiceA4PrintData): Window | null {
  const printWin = window.open('', '_blank', 'width=900,height=1100,menubar=no,toolbar=no,location=no,status=no');
  if (!printWin) {
    alert('Pop-up blocked. Please allow pop-ups for this site to print the invoice.');
    return null;
  }

  const itemsHtml = data.items.map((it) => `
    <tr>
      <td style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb; font-family: sans-serif; font-weight: 500; color: #111827;">
        ${it.description}
      </td>
      <td style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb; text-align: center; font-family: monospace; color: #4b5563;">
        ${it.hsCode || '6309.00.10'}
      </td>
      <td style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb; text-align: center; font-family: monospace; font-weight: 700; color: #111827;">
        ${it.quantityBales}
      </td>
      <td style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb; text-align: right; font-family: monospace; color: #111827;">
        ${it.netWeightKg.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} KG
      </td>
      <td style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb; text-align: right; font-family: monospace; color: #111827;">
        $${it.unitPriceUsd.toFixed(2)}
      </td>
      <td style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb; text-align: right; font-family: monospace; font-weight: 600; color: #111827;">
        $${it.totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </td>
      <td style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb; text-align: right; font-family: monospace; font-weight: 700; color: #78350f;">
        AED ${it.totalAed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </td>
    </tr>
  `).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Commercial Invoice - ${data.docNo}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 12mm 10mm 15mm 10mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 16px;
      color: #1f2937;
      background: #ffffff;
      font-size: 12px;
      line-height: 1.4;
    }
    .invoice-wrapper {
      max-width: 800px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 24px;
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
      padding-bottom: 14px;
      margin-bottom: 16px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .logo-title {
      font-family: Georgia, serif;
      font-weight: 900;
      font-size: 16px;
      color: #78350f;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin: 0 0 4px 0;
    }
    .meta-text {
      font-size: 10px;
      color: #4b5563;
      margin: 2px 0;
    }
    .badge-ref {
      text-align: right;
      border-left: 2px solid #fde68a;
      padding-left: 14px;
    }
    .badge-pill {
      background: #78350f;
      color: #ffffff;
      font-weight: 700;
      font-size: 10px;
      letter-spacing: 1px;
      padding: 3px 8px;
      border-radius: 4px;
      display: inline-block;
      margin-bottom: 4px;
      text-transform: uppercase;
    }
    .two-col-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 14px;
    }
    .info-card {
      border: 1px solid #fde68a;
      background: #fffbeb;
      border-radius: 6px;
      padding: 10px 12px;
    }
    .card-label {
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      color: #92400e;
      letter-spacing: 0.5px;
      display: block;
      margin-bottom: 4px;
    }
    .card-title {
      font-weight: 800;
      font-size: 13px;
      color: #111827;
      margin-bottom: 2px;
    }
    .card-desc {
      font-size: 10.5px;
      color: #4b5563;
      line-height: 1.35;
    }
    .transport-bar {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 8px 12px;
      margin-bottom: 16px;
      font-family: monospace;
      font-size: 10px;
    }
    .transport-label {
      font-size: 8.5px;
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
      margin-bottom: 16px;
      font-size: 11px;
    }
    table.items-table th {
      background: #fef3c7;
      border-top: 1px solid #b45309;
      border-bottom: 1px solid #b45309;
      padding: 8px 10px;
      font-weight: 800;
      font-size: 9.5px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #78350f;
    }
    table.items-table tfoot td {
      background: #fef3c7;
      border-top: 2px solid #78350f;
      border-bottom: 2px solid #78350f;
      padding: 8px 10px;
      font-weight: 900;
      font-size: 11px;
      color: #78350f;
      font-family: monospace;
    }
    .words-box {
      border: 1px solid #fde68a;
      background: #ffffff;
      border-radius: 6px;
      padding: 10px 12px;
      margin-bottom: 20px;
      font-size: 11px;
    }
    .words-val {
      font-family: Georgia, serif;
      font-style: italic;
      font-weight: 700;
      color: #92400e;
    }
    .declaration {
      border-top: 1px solid #f3f4f6;
      margin-top: 6px;
      padding-top: 6px;
      font-size: 9.5px;
      color: #4b5563;
      line-height: 1.3;
    }
    .signatures-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 20px;
      margin-top: 30px;
      padding-top: 12px;
      border-top: 1px dashed #d97706;
      text-align: center;
      font-size: 9.5px;
      font-weight: 700;
      color: #4b5563;
      text-transform: uppercase;
      position: relative;
    }
    .sig-line {
      height: 40px;
      border-bottom: 1px solid #9ca3af;
      margin-bottom: 4px;
    }
    .customs-stamp {
      position: absolute;
      right: 15%;
      bottom: -15px;
      width: 75px;
      height: 75px;
      border: 2px solid #dc2626;
      border-radius: 50%;
      color: #dc2626;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-size: 8px;
      font-weight: 900;
      letter-spacing: 0.5px;
      transform: rotate(-12deg);
      opacity: 0.85;
      pointer-events: none;
      background: rgba(254, 242, 242, 0.4);
    }
    .print-bar {
      margin-bottom: 16px;
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
    <!-- Header -->
    <div class="header-box">
      <div>
        <h1 class="logo-title">VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C</h1>
        <p class="meta-text" style="font-family: monospace; font-size: 9.5px;">
          Dubai Economy & Tourism License: <strong>1049281</strong> &bull; Customs Code: <strong>AE-9281048</strong>
        </p>
        <p class="meta-text">
          House 14 Street 4 - Al Jimi - Al Nudood, Al Ain, Abu Dhabi, United Arab Emirates
        </p>
        <p class="meta-text">
          Tel: +971 55 418 6086 &bull; Email: sales@vintagevibesllcspc.com &bull; Tax TRN: <strong>100482910300003</strong>
        </p>
      </div>

      <div class="badge-ref">
        <div class="badge-pill">Commercial Customs Invoice</div>
        <div style="font-family: monospace; font-size: 13px; font-weight: 900; color: #111827;">
          REF: ${data.docNo}
        </div>
        <div style="font-family: monospace; font-size: 10px; color: #4b5563; margin-top: 2px;">
          DATE: <strong>${data.date}</strong>
        </div>
        <div style="font-family: monospace; font-size: 9.5px; color: #6b7280;">
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
          Jebel Ali Port (AEJEA), Dubai, UAE
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

    <!-- Items Table -->
    <table class="items-table">
      <thead>
        <tr>
          <th style="text-align: left;">Item Description</th>
          <th style="text-align: center;">HS Code</th>
          <th style="text-align: center;">Bales</th>
          <th style="text-align: right;">Net Wt (KG)</th>
          <th style="text-align: right;">Unit CIF (USD)</th>
          <th style="text-align: right;">Total (USD)</th>
          <th style="text-align: right;">Total (AED)</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="2" style="text-align: right; text-transform: uppercase; font-family: sans-serif;">
            Cargo Totals (CIF Dubai):
          </td>
          <td style="text-align: center;">${data.totalBales} Bales</td>
          <td style="text-align: right;">${data.totalNetKg.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} KG</td>
          <td style="text-align: right;">-</td>
          <td style="text-align: right;">$${data.totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td style="text-align: right; font-size: 12px; font-weight: 900;">AED ${data.totalAed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        </tr>
      </tfoot>
    </table>

    <!-- Words & Declaration -->
    <div class="words-box">
      <div>
        <strong>Total Invoice Amount in Words:</strong>
        <span class="words-val">${data.amountInWords} (AED ${data.totalAed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</span>
      </div>
      <div class="declaration">
        <strong>Customs Declaration:</strong> We certify that this invoice shows the actual price of the authentic pre-owned vintage garments described, that no other invoice has been or will be issued, and that all particulars are true and correct according to UAE Federal Customs Authority regulations.
      </div>
    </div>

    <!-- Signatures -->
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
        <span style="font-size: 9px; font-weight: 900;">CLEARED</span>
        <span style="font-size: 7px;">CUSTOMS</span>
      </div>
    </div>
  </div>

  <script>
    window.onload = function() {
      // Auto-trigger print dialog after render
      setTimeout(function() {
        window.print();
      }, 300);
    };
  </script>
</body>
</html>`;

  printWin.document.open();
  printWin.document.write(html);
  printWin.document.close();
  return printWin;
}
