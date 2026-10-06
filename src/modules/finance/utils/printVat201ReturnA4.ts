import { generateQrCodeSvgString } from '../../setup/thermal/thermalPopupManager.ts';

export interface Vat201ReturnPrintData {
  company: {
    legalName: string;
    arabicName: string;
    trn: string;
    tradeLicenseNo: string;
    address: string;
    phone: string;
    giban: string;
  };
  period: {
    quarter: string;
    startDate: string;
    endDate: string;
    dueDate?: string;
    isClosed: boolean;
    closingVoucherNo?: string | null;
    closedAt?: string | null;
  };
  boxes: {
    box1_standardRatedSupplies: number;
    box1_outputVat: number;
    box1_emirates: Array<{ emirate: string; code: string; netAmount: number; vatAmount: number }>;
    box2_taxExemptSupplies: number;
    box3_zeroRatedSupplies: number;
    box4_goodsImportedReverseCharge: number;
    box12_totalDueTax: number;
    box9_standardRatedPurchases: number;
    box9_recoverableInputVat: number;
    box10_reverseChargePurchases: number;
    box13_totalRecoverableTax: number;
    box14_totalDueTax: number;
    box15_totalRecoverableTax: number;
    box16_netVatPayableOrRefundable: number;
    isRefundable: boolean;
    payableAmount: number;
    refundableAmount: number;
  };
  reconciliation: {
    glOutputBalance: number;
    glInputBalance: number;
    outputVariance: number;
    inputVariance: number;
    isReconciled: boolean;
  };
}

export function printVat201ReturnA4(data: Vat201ReturnPrintData) {
  const printWin = window.open('', '_blank', 'width=1000,height=1100,menubar=no,toolbar=no,location=no,status=no');
  if (!printWin) {
    alert('Please allow popups for printing official UAE VAT 201 Return declarations.');
    return;
  }

  const formatAed = (val: number) => {
    return (Number(val) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const verifyUrl = `https://vintagevibe.ae/audit/vat201?trn=${data.company.trn}&period=${encodeURIComponent(data.period.quarter)}&net=${data.boxes.box16_netVatPayableOrRefundable}`;
  const qrSvg = generateQrCodeSvgString(verifyUrl, 130);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>UAE FTA VAT 201 Return - ${data.period.quarter} - ${data.company.legalName}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 12mm 14mm 12mm 14mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif;
      font-size: 11px;
      color: #0f172a;
      background: #ffffff;
      line-height: 1.35;
    }
    .sheet {
      width: 100%;
      background: #ffffff;
    }
    .header-table {
      width: 100%;
      border-collapse: collapse;
      border-bottom: 2.5px solid #b45309;
      padding-bottom: 8px;
      margin-bottom: 10px;
    }
    .fta-badge {
      display: inline-block;
      background: #78350f;
      color: #fef3c7;
      font-weight: 800;
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      padding: 3px 8px;
      border-radius: 4px;
      margin-bottom: 4px;
    }
    .title-en {
      font-size: 17px;
      font-weight: 900;
      color: #78350f;
      letter-spacing: 0.04em;
      margin: 0;
    }
    .title-sub {
      font-size: 10px;
      color: #475569;
      font-weight: 600;
      margin-top: 2px;
    }
    .title-ar {
      font-size: 13px;
      font-weight: bold;
      color: #92400e;
      direction: rtl;
      font-family: 'Traditional Arabic', 'Amiri', Tahoma, sans-serif;
    }
    .card {
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      margin-bottom: 10px;
      background: #ffffff;
    }
    .card-header {
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
      padding: 5px 10px;
      font-weight: 800;
      font-size: 10.5px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #1e293b;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .card-header.gold {
      background: linear-gradient(90deg, #fef3c7 0%, #fef9c3 100%);
      border-bottom: 1.5px solid #f59e0b;
      color: #78350f;
    }
    .card-header.emerald {
      background: linear-gradient(90deg, #ecfdf5 0%, #d1fae5 100%);
      border-bottom: 1.5px solid #10b981;
      color: #064e3b;
    }
    .card-body {
      padding: 8px 10px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px 12px;
    }
    .info-item {
      font-size: 10px;
    }
    .info-label {
      color: #64748b;
      font-size: 9px;
      text-transform: uppercase;
      font-weight: 700;
      display: block;
    }
    .info-val {
      color: #0f172a;
      font-weight: 800;
      font-size: 10.5px;
    }
    .info-val.mono {
      font-family: 'Consolas', 'Courier New', monospace;
    }
    table.data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
    }
    table.data-table th {
      background: #f1f5f9;
      border-top: 1px solid #cbd5e1;
      border-bottom: 1.5px solid #94a3b8;
      padding: 5px 8px;
      text-align: left;
      font-weight: 800;
      color: #334155;
      text-transform: uppercase;
      font-size: 9px;
      letter-spacing: 0.05em;
    }
    table.data-table th.num, table.data-table td.num {
      text-align: right;
    }
    table.data-table td {
      padding: 4.5px 8px;
      border-bottom: 1px solid #e2e8f0;
      color: #1e293b;
    }
    table.data-table tr.total-row td {
      background: #fffbeb;
      border-top: 1.5px solid #f59e0b;
      border-bottom: 2px solid #b45309;
      font-weight: 900;
      color: #78350f;
    }
    .net-box {
      border: 2px solid #b45309;
      border-radius: 8px;
      background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);
      padding: 10px 14px;
      margin: 10px 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .net-box.refund {
      border-color: #059669;
      background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
    }
    .net-title {
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #78350f;
    }
    .net-box.refund .net-title {
      color: #065f46;
    }
    .net-val {
      font-size: 20px;
      font-weight: 900;
      font-family: 'Consolas', 'Courier New', monospace;
      color: #78350f;
    }
    .net-box.refund .net-val {
      color: #047857;
    }
    .declaration-box {
      border: 1px dashed #94a3b8;
      border-radius: 6px;
      padding: 8px 10px;
      background: #fafaf9;
      font-size: 9.5px;
      color: #334155;
      margin-top: 8px;
    }
    .sig-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-top: 14px;
      padding-top: 8px;
    }
    .sig-block {
      width: 28%;
      text-align: center;
      border-top: 1px solid #475569;
      padding-top: 4px;
      font-size: 9px;
      color: #475569;
    }
    .seal-wrap {
      width: 32%;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .seal-img {
      width: 72px;
      height: 72px;
      margin-bottom: 2px;
    }
    .badge-closed {
      display: inline-block;
      background: #065f46;
      color: #ffffff;
      padding: 2px 8px;
      border-radius: 9999px;
      font-weight: 800;
      font-size: 8.5px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
  </style>
</head>
<body>
  <div class="sheet">
    <!-- 1. OFFICIAL FTA VAT 201 HEADER -->
    <table class="header-table">
      <tr>
        <td style="width: 70%; vertical-align: top;">
          <div class="fta-badge">Federal Tax Authority • United Arab Emirates (FTA)</div>
          <h1 class="title-en">FORM VAT 201: VALUE ADDED TAX RETURN</h1>
          <div class="title-sub">Statutory Periodic Return Declaration pursuant to UAE Federal Decree-Law No. 8 of 2017</div>
        </td>
        <td style="width: 30%; text-align: right; vertical-align: top;">
          <div class="title-ar">الهيئة الاتحادية للضرائب</div>
          <div style="font-size: 11px; font-weight: bold; color: #78350f; margin-top: 4px;">إقرار ضريبة القيمة المضافة</div>
          <div style="margin-top: 4px;">
            ${data.period.isClosed 
              ? '<span class="badge-closed">● STATUTORY AUDIT CLOSED</span>' 
              : '<span style="background: #f59e0b; color: #78350f; font-weight: 800; font-size: 8.5px; padding: 2px 6px; border-radius: 4px;">PROVISIONAL RETURN PREVIEW</span>'}
          </div>
        </td>
      </tr>
    </table>

    <!-- 2. TAXABLE PERSON & PERIOD PROFILE -->
    <div class="card">
      <div class="card-header gold">
        <span>Part 1: Taxable Person & Tax Period Details (بيانات الخاضع للضريبة)</span>
        <span style="font-family: monospace; font-size: 9.5px;">TRN: ${data.company.trn}</span>
      </div>
      <div class="card-body">
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">Taxable Person (Legal Name)</span>
            <div class="info-val">${data.company.legalName}</div>
          </div>
          <div class="info-item">
            <span class="info-label">Tax Registration Number (TRN)</span>
            <div class="info-val mono" style="color: #b45309;">${data.company.trn}</div>
          </div>
          <div class="info-item">
            <span class="info-label">Commercial Trade License</span>
            <div class="info-val mono">${data.company.tradeLicenseNo} (Abu Dhabi / Alain)</div>
          </div>

          <div class="info-item">
            <span class="info-label">Tax Period Quarter</span>
            <div class="info-val" style="color: #78350f;">${data.period.quarter}</div>
          </div>
          <div class="info-item">
            <span class="info-label">Period Date Range</span>
            <div class="info-val mono">${data.period.startDate} to ${data.period.endDate}</div>
          </div>
          <div class="info-item">
            <span class="info-label">FTA Payment GIBAN Reference</span>
            <div class="info-val mono">${data.company.giban}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 3. SECTION 1: VAT ON SALES AND OUTPUTS (BOXES 1 TO 8) -->
    <div class="card">
      <div class="card-header">
        <span>Part 2: VAT on Sales and All Other Outputs (ضريبة المخرجات)</span>
        <span>Standard Rate 5%</span>
      </div>
      <div class="card-body" style="padding: 0;">
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 10%;">Box #</th>
              <th style="width: 48%;">Description of Taxable Supplies & Outputs</th>
              <th class="num" style="width: 21%;">Amount (AED)</th>
              <th class="num" style="width: 21%;">VAT Amount (AED)</th>
            </tr>
          </thead>
          <tbody>
            ${data.boxes.box1_emirates.map(e => `
              <tr>
                <td style="font-weight: 700; color: #64748b;">Box ${e.code}</td>
                <td>Standard rated supplies in ${e.emirate} (5%)</td>
                <td class="num">${formatAed(e.netAmount)}</td>
                <td class="num" style="font-weight: 700;">${formatAed(e.vatAmount)}</td>
              </tr>
            `).join('')}
            <tr>
              <td style="font-weight: 700; color: #64748b;">Box 2</td>
              <td>Tax Exempt Supplies (توريدات معفاة)</td>
              <td class="num">${formatAed(data.boxes.box2_taxExemptSupplies)}</td>
              <td class="num">-</td>
            </tr>
            <tr>
              <td style="font-weight: 700; color: #64748b;">Box 3</td>
              <td>Zero-rated Supplies / Exports (توريدات بنسبة الصفر)</td>
              <td class="num">${formatAed(data.boxes.box3_zeroRatedSupplies)}</td>
              <td class="num">0.00</td>
            </tr>
            <tr>
              <td style="font-weight: 700; color: #64748b;">Box 4</td>
              <td>Goods imported into the UAE (Reverse Charge Mechanism)</td>
              <td class="num">${formatAed(data.boxes.box4_goodsImportedReverseCharge)}</td>
              <td class="num">0.00</td>
            </tr>
            <tr class="total-row">
              <td style="font-weight: 900;">Box 12</td>
              <td>TOTAL VALUE OF DUE TAX (إجمالي الضريبة المستحقة)</td>
              <td class="num">${formatAed(data.boxes.box1_standardRatedSupplies)}</td>
              <td class="num" style="font-size: 11.5px;">AED ${formatAed(data.boxes.box12_totalDueTax)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 4. SECTION 2: VAT ON EXPENSES AND INPUTS (BOXES 9 TO 11) -->
    <div class="card">
      <div class="card-header">
        <span>Part 3: VAT on Expenses and All Other Inputs (ضريبة المدخلات)</span>
        <span>Standard Rate 5% Recoverable</span>
      </div>
      <div class="card-body" style="padding: 0;">
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 10%;">Box #</th>
              <th style="width: 48%;">Description of Taxable Purchases & Expenses</th>
              <th class="num" style="width: 21%;">Amount (AED)</th>
              <th class="num" style="width: 21%;">Recoverable VAT (AED)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="font-weight: 700; color: #64748b;">Box 9</td>
              <td>Standard rated expenses, bale imports & trade purchases (5%)</td>
              <td class="num">${formatAed(data.boxes.box9_standardRatedPurchases)}</td>
              <td class="num" style="font-weight: 700; color: #047857;">${formatAed(data.boxes.box9_recoverableInputVat)}</td>
            </tr>
            <tr>
              <td style="font-weight: 700; color: #64748b;">Box 10</td>
              <td>Supplies subject to the reverse charge provisions</td>
              <td class="num">${formatAed(data.boxes.box10_reverseChargePurchases)}</td>
              <td class="num">0.00</td>
            </tr>
            <tr class="total-row" style="background: #f0fdf4; border-top-color: #10b981; border-bottom-color: #047857; color: #064e3b;">
              <td style="font-weight: 900;">Box 13</td>
              <td>TOTAL VALUE OF RECOVERABLE TAX (إجمالي الضريبة القابلة للاسترداد)</td>
              <td class="num">${formatAed(data.boxes.box9_standardRatedPurchases)}</td>
              <td class="num" style="font-size: 11.5px; color: #047857;">AED ${formatAed(data.boxes.box13_totalRecoverableTax)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 5. NET VAT CALCULATION (BOX 14 TO 16) -->
    <div class="${data.boxes.isRefundable ? 'net-box refund' : 'net-box'}">
      <div>
        <div class="net-title">
          ${data.boxes.isRefundable ? 'Box 16: Net VAT Refundable / Carry-Forward Credit' : 'Box 16: Net VAT Payable to Federal Tax Authority'}
        </div>
        <div style="font-size: 9.5px; color: #475569; margin-top: 2px;">
          Calculation: Box 14 (Due Tax: AED ${formatAed(data.boxes.box14_totalDueTax)}) − Box 15 (Recoverable Tax: AED ${formatAed(data.boxes.box15_totalRecoverableTax)})
        </div>
        ${data.period.closingVoucherNo ? `
          <div style="font-size: 9px; font-weight: 700; margin-top: 3px; color: #0f172a;">
            Settlement Voucher Ref: <span style="font-family: monospace;">${data.period.closingVoucherNo}</span>
          </div>
        ` : ''}
      </div>
      <div style="text-align: right;">
        <div class="net-val">
          ${data.boxes.isRefundable ? `(AED ${formatAed(data.boxes.refundableAmount)})` : `AED ${formatAed(data.boxes.payableAmount)}`}
        </div>
        <div style="font-size: 8.5px; font-weight: 700; text-transform: uppercase;">
          ${data.boxes.isRefundable ? 'Credit to carry forward or claim refund' : 'Payable via EmaraTax before period due date'}
        </div>
      </div>
    </div>

    <!-- 6. GENERAL LEDGER RECONCILIATION -->
    <div class="card" style="margin-bottom: 6px;">
      <div class="card-header emerald" style="padding: 4px 10px; font-size: 9.5px;">
        <span>General Ledger Audit Cross-Check (2140-01 Output vs 2140-02 Input)</span>
        <span style="font-weight: 800;">
          ${data.reconciliation.isReconciled ? '✓ RECONCILED (ZERO VARIANCE)' : '⚠️ ATTENTION: VARIANCE DETECTED'}
        </span>
      </div>
      <div class="card-body" style="padding: 5px 10px; font-size: 9px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="width: 50%;">
              <strong>GL 2140-01 (Output VAT Ledger):</strong> AED ${formatAed(data.reconciliation.glOutputBalance)} | <strong>Box 12:</strong> AED ${formatAed(data.boxes.box12_totalDueTax)} | <strong>Variance:</strong> AED ${formatAed(data.reconciliation.outputVariance)}
            </td>
            <td style="width: 50%; text-align: right;">
              <strong>GL 2140-02 (Input VAT Ledger):</strong> AED ${formatAed(data.reconciliation.glInputBalance)} | <strong>Box 13:</strong> AED ${formatAed(data.boxes.box13_totalRecoverableTax)} | <strong>Variance:</strong> AED ${formatAed(data.reconciliation.inputVariance)}
            </td>
          </tr>
        </table>
      </div>
    </div>

    <!-- 7. STATUTORY DECLARATION & SIGNATURES -->
    <div class="declaration-box">
      <strong>Statutory Declaration:</strong> I hereby declare that the information given in this return is true, accurate and complete in accordance with the provisions of Federal Decree-Law No. 8 of 2017 on Value Added Tax and its Executive Regulations. I understand that false or misleading declarations may lead to penalties imposed by the Federal Tax Authority.
    </div>

    <div class="sig-row">
      <div class="sig-block">
        <div style="height: 35px;"></div>
        <strong>PREPARED BY</strong><br>
        Senior Tax Accountant<br>
        Date: ${new Date().toLocaleDateString('en-GB')}
      </div>

      <div class="seal-wrap">
        <img src="/vintage_vibes_seal.svg" alt="Official Seal" class="seal-img" onerror="this.style.display='none'">
        <div style="font-size: 8px; font-weight: 800; color: #78350f; text-transform: uppercase;">
          Official Corporate Stamp & Seal
        </div>
      </div>

      <div class="sig-block">
        <div style="height: 35px;"></div>
        <strong>AUTHORIZED SIGNATORY</strong><br>
        Managing Director / Tax Agent<br>
        TRN: ${data.company.trn}
      </div>
    </div>

  </div>
  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 500);
    };
  </script>
</body>
</html>`;

  printWin.document.open();
  printWin.document.write(html);
  printWin.document.close();
}
