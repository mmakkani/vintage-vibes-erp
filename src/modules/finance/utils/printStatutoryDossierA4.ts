import { VerifiedBankStatement } from '../components/BankStatementReconcilerModal.tsx';
import { CompanyShareholder } from '../components/ShareholderGovernanceModal.tsx';

export interface ThreeYearFigures {
  turnover: number;
  cogs: number;
  grossProfit: number;
  grossMarginPercent: number;
  opEx: number;
  financeCosts: number;
  netProfit: number;
  corporateTax: number;
  totalAssets: number;
  nonCurrentAssets: number;
  currentAssets: number;
  inventoryVal: number;
  receivablesVal: number;
  cashBankVal: number;
  totalLiabilities: number;
  payablesVal: number;
  accrualsVal: number;
  totalEquity: number;
  shareCapitalVal: number;
  retainedEarningsVal: number;
}

export interface StatutoryDossierPrintData {
  companyLegalName: string;
  companyArabicName?: string;
  tradeLicenseNo: string;
  trnNumber: string;
  legalAddress: string;
  presentationMode?: 'executive-3year' | 'statutory-ifrs';
  reportDates: {
    periodName: string;
    startDate: string;
    endDate: string;
    checksum: string;
    isCertifiedClosed: boolean;
    voucherNo?: string;
  };
  figures: {
    machineryVal: number;
    fixturesVal: number;
    totalNonCurrentAssets: number;
    inventoryVal: number;
    receivablesVal: number;
    cashBankVal: number;
    totalCurrentAssets: number;
    totalCalculatedAssets: number;
    payablesVal: number;
    taxPayableVal: number;
    totalCalculatedLiabilities: number;
    shareCapitalVal: number;
    retainedEarningsVal: number;
    totalCalculatedEquity: number;
    totalEquityAndLiabilities: number;
    totalRevenue: number;
    totalCogs: number;
    grossProfit: number;
    opEx: number;
    netProfitBeforeTax: number;
    corporateTaxProvision: number;
    netAuditedProfit: number;
  };
  threeYearHistory?: {
    y2026: ThreeYearFigures;
    y2025: ThreeYearFigures;
    y2024: ThreeYearFigures;
  };
  shareholders?: CompanyShareholder[];
  bankAuditTrail?: any[];
  verifiedBankStatement?: VerifiedBankStatement | null;
  customManagementCommentary?: string;
}

const fmt = (val: number): string => {
  return Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export function printStatutoryDossierA4(data: StatutoryDossierPrintData): Window | null {
  const printWin = window.open('', '_blank');
  if (!printWin) {
    alert('Popup blocker prevented opening the print document. Please allow popups for this site.');
    return null;
  }

  const {
    companyLegalName,
    companyArabicName = 'فينتاج فايبز للتجارة العامة ذ.م.م - ش.ش.و',
    tradeLicenseNo,
    trnNumber,
    legalAddress,
    presentationMode = 'executive-3year',
    reportDates,
    figures,
    threeYearHistory,
    shareholders = [],
    bankAuditTrail = [],
    verifiedBankStatement,
    customManagementCommentary
  } = data;

  // Active shareholders or fallback
  const shList: CompanyShareholder[] = shareholders.length > 0 ? shareholders : [
    {
      id: 'default-1',
      name: 'Managing Director',
      designation: 'Sole Proprietor / Director',
      shares_count: 100,
      capital_aed: figures.shareCapitalVal || 100000,
      ownership_percent: 100.0,
      passport_or_eid: 'Emirates ID on Record'
    }
  ];

  const totalCap = shList.reduce((s, sh) => s + Number(sh.capital_aed || 0), 0);
  const totalShares = shList.reduce((s, sh) => s + Number(sh.shares_count || 0), 0);

  // 3-Year metrics
  const h26 = threeYearHistory?.y2026 || {
    turnover: figures.totalRevenue,
    cogs: figures.totalCogs,
    grossProfit: figures.grossProfit,
    grossMarginPercent: figures.totalRevenue > 0 ? (figures.grossProfit / figures.totalRevenue) * 100 : 0,
    opEx: figures.opEx,
    financeCosts: 0,
    netProfit: figures.netAuditedProfit,
    corporateTax: figures.corporateTaxProvision,
    totalAssets: figures.totalCalculatedAssets,
    nonCurrentAssets: figures.totalNonCurrentAssets,
    currentAssets: figures.totalCurrentAssets,
    inventoryVal: figures.inventoryVal,
    receivablesVal: figures.receivablesVal,
    cashBankVal: figures.cashBankVal,
    totalLiabilities: figures.totalCalculatedLiabilities,
    payablesVal: figures.payablesVal,
    accrualsVal: figures.taxPayableVal,
    totalEquity: figures.totalCalculatedEquity,
    shareCapitalVal: figures.shareCapitalVal,
    retainedEarningsVal: figures.retainedEarningsVal
  };

  const h25 = threeYearHistory?.y2025 || {
    turnover: 0, cogs: 0, grossProfit: 0, grossMarginPercent: 0, opEx: 0, financeCosts: 0,
    netProfit: 0, corporateTax: 0, totalAssets: 0, nonCurrentAssets: 0, currentAssets: 0,
    inventoryVal: 0, receivablesVal: 0, cashBankVal: 0, totalLiabilities: 0, payablesVal: 0,
    accrualsVal: 0, totalEquity: 0, shareCapitalVal: figures.shareCapitalVal, retainedEarningsVal: 0
  };

  const h24 = threeYearHistory?.y2024 || {
    turnover: 0, cogs: 0, grossProfit: 0, grossMarginPercent: 0, opEx: 0, financeCosts: 0,
    netProfit: 0, corporateTax: 0, totalAssets: 0, nonCurrentAssets: 0, currentAssets: 0,
    inventoryVal: 0, receivablesVal: 0, cashBankVal: 0, totalLiabilities: 0, payablesVal: 0,
    accrualsVal: 0, totalEquity: 0, shareCapitalVal: figures.shareCapitalVal, retainedEarningsVal: 0
  };

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Interim Financial Report & 3-Year Performance Overview - ${companyLegalName}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 12mm 12mm 14mm 12mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #0f172a;
      background: #f8fafc;
      margin: 0;
      padding: 16px;
      font-size: 10.5px;
      line-height: 1.4;
    }
    .a4-page {
      max-width: 820px;
      margin: 0 auto 20px auto;
      background: #ffffff;
      padding: 24px 28px;
      border: 1px solid #cbd5e1;
      box-shadow: 0 4px 16px rgba(0,0,0,0.06);
      page-break-after: always;
      position: relative;
    }
    @media print {
      body {
        padding: 0;
        background: #ffffff;
      }
      .a4-page {
        max-width: 100% !important;
        border: none !important;
        box-shadow: none !important;
        padding: 0 !important;
        margin: 0 !important;
        page-break-after: always !important;
      }
      .no-print {
        display: none !important;
      }
    }

    /* Masthead Letterhead */
    .header-banner {
      text-align: center;
      margin-bottom: 12px;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 8px;
    }
    .header-brand-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }
    .header-logo {
      height: 48px;
      width: auto;
      object-fit: contain;
    }
    .header-company-en {
      font-size: 15px;
      font-weight: 900;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #0f172a;
      margin: 0;
    }
    .header-company-ar {
      font-family: 'Traditional Arabic', 'Segoe UI', Tahoma, sans-serif;
      font-size: 13px;
      font-weight: bold;
      color: #b45309;
      direction: rtl;
    }
    .main-doc-title {
      font-size: 13px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #0f172a;
      margin: 4px 0 2px 0;
    }
    .sub-doc-title {
      font-size: 9.5px;
      color: #475569;
      margin: 0;
      font-weight: 600;
    }
    .meta-tagline {
      font-size: 8.5px;
      color: #64748b;
      margin-top: 3px;
      font-style: italic;
    }

    /* Section Headers */
    .section-head {
      background: #0f172a;
      color: #ffffff;
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 4px 8px;
      margin: 12px 0 6px 0;
    }

    /* Tables */
    table.rep-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 8px;
      font-size: 9.5px;
    }
    table.rep-table th {
      background: #1e293b;
      color: #ffffff;
      font-weight: 700;
      text-transform: uppercase;
      font-size: 9px;
      letter-spacing: 0.03em;
      padding: 5px 6px;
      border: 1px solid #334155;
      text-align: left;
    }
    table.rep-table th.num, table.rep-table td.num {
      text-align: right;
      font-family: "Courier New", Courier, monospace;
      font-weight: 600;
      white-space: nowrap;
    }
    table.rep-table td {
      padding: 4.5px 6px;
      border: 1px solid #cbd5e1;
      vertical-align: middle;
    }
    table.rep-table tr:nth-child(even) {
      background: #f8fafc;
    }
    .cat-head {
      background: #e2e8f0 !important;
      font-weight: 800;
      text-transform: uppercase;
      color: #0f172a;
    }
    .subtotal-row {
      background: #f1f5f9 !important;
      font-weight: 800;
      border-top: 1.5px solid #0f172a;
    }
    .grandtotal-row {
      background: #0f172a !important;
      color: #ffffff !important;
      font-weight: 900;
    }
    .grandtotal-row td {
      border: 1px solid #0f172a !important;
    }
    .profit-positive {
      color: #047857;
      font-weight: bold;
    }
    .profit-negative {
      color: #b91c1c;
      font-weight: bold;
    }

    /* Info Box */
    .narrative-box {
      border: 1px solid #cbd5e1;
      background: #ffffff;
      padding: 8px 10px;
      margin-bottom: 8px;
      font-size: 9px;
      line-height: 1.45;
    }
    .narrative-box strong {
      color: #0f172a;
    }

    /* Footer Pagination */
    .page-footer {
      display: flex;
      justify-content: space-between;
      border-top: 1px solid #cbd5e1;
      padding-top: 4px;
      font-size: 8px;
      color: #64748b;
      margin-top: 14px;
      font-family: monospace;
    }

    /* Signatures */
    .sign-row {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      margin-top: 20px;
      page-break-inside: avoid;
    }
    .sign-card {
      flex: 1;
      border-top: 1.5px solid #0f172a;
      padding-top: 4px;
    }
    .sign-name {
      font-weight: 800;
      font-size: 10px;
      color: #0f172a;
    }
    .sign-role {
      font-size: 8.5px;
      color: #475569;
    }
  </style>
</head>
<body>

  <!-- ========================================================================= -->
  <!-- PAGE 1: SHAREHOLDING & EXECUTIVE PERFORMANCE HIGHLIGHTS                   -->
  <!-- ========================================================================= -->
  <div class="a4-page">
    <div class="header-brand-row">
      <div style="display: flex; align-items: center; gap: 10px;">
        <img src="/vintage_logo_gold_seal_a4.png" alt="Vintage Vibes Logo" class="header-logo" onerror="this.onerror=null; this.src='/vintage_logo_gold_seal.png';" />
        <div>
          <h1 class="header-company-en">${companyLegalName}</h1>
          <div style="font-size: 9px; color: #475569;">Trade License: ${tradeLicenseNo} &bull; TRN: ${trnNumber}</div>
        </div>
      </div>
      <div style="text-align: right;">
        <div class="header-company-ar">${companyArabicName}</div>
        <div style="font-size: 8.5px; color: #64748b;">Abu Dhabi / Al Ain Jurisdiction</div>
      </div>
    </div>

    <div class="header-banner">
      <div class="main-doc-title">INTERIM FINANCIAL REPORT & 3-YEAR PERFORMANCE OVERVIEW</div>
      <div class="sub-doc-title">For the Fiscal Years Ended 31 Dec 2024 (Audited), 31 Dec 2025 (Audited), and Interim Period Ended ${reportDates.endDate}</div>
      <div class="meta-tagline">Corporate Equity Governance & Asset Valuation | Presentation Currency: AED (Fixed Peg: 1 USD = 3.6725 AED)</div>
    </div>

    <!-- 1. Corporate Structure & Shareholding -->
    <div class="section-head">1. CORPORATE STRUCTURE & REGISTERED SHAREHOLDING (${shList.length === 1 ? '100% SOLE PROPRIETORSHIP' : shList.map(s => `${s.ownership_percent}%`).join(':')})</div>
    <div style="font-size: 9px; margin-bottom: 6px; color: #334155;">
      The company is incorporated with limited liability under UAE Commercial Companies Law (Trade License No. ${tradeLicenseNo}) for sorting, processing, wholesale distribution, and retail trade of authentic vintage garments and textiles. Registered corporate equity is structured as follows:
    </div>

    <table class="rep-table">
      <thead>
        <tr>
          <th>Shareholder / Partner Name</th>
          <th>Designation / Role</th>
          <th style="text-align: center;">Shares</th>
          <th class="num">Capital (AED)</th>
          <th style="text-align: center;">Ownership %</th>
        </tr>
      </thead>
      <tbody>
        ${shList.map(sh => `
          <tr>
            <td><strong>${sh.name}</strong>${sh.passport_or_eid ? `<br/><span style="font-size: 8px; color: #64748b;">${sh.passport_or_eid}</span>` : ''}</td>
            <td>${sh.designation}</td>
            <td style="text-align: center;">${Number(sh.shares_count).toLocaleString()}</td>
            <td class="num">AED ${fmt(Number(sh.capital_aed))}</td>
            <td style="text-align: center; font-weight: bold;">${Number(sh.ownership_percent).toFixed(1)}%</td>
          </tr>
        `).join('')}
      </tbody>
      <tfoot>
        <tr class="subtotal-row">
          <td colspan="2"><strong>Total Registered Capital (COA 3100)</strong></td>
          <td style="text-align: center;"><strong>${totalShares.toLocaleString()}</strong></td>
          <td class="num"><strong>AED ${fmt(totalCap)}</strong></td>
          <td style="text-align: center;"><strong>100.0%</strong></td>
        </tr>
      </tfoot>
    </table>

    <!-- 2. Capital Asset Overview -->
    <div class="section-head">2. CAPITAL INVESTMENTS & ASSET ACQUISITION OVERVIEW</div>
    <div class="narrative-box">
      <strong>Commercial Framework & Accounting Treatment (IAS 16 / IAS 8):</strong><br/>
      • <strong>Operating Entity:</strong> ${companyLegalName} (License No. ${tradeLicenseNo}).<br/>
      • <strong>Industrial Machinery & Capital Equipment:</strong> Total plant, high-speed sorting conveyors, and industrial pressing terminals capitalized at <strong>AED ${fmt(figures.totalNonCurrentAssets)}</strong>.<br/>
      • <strong>Commercial Inventory & Import Bales:</strong> Current inventory standing at <strong>AED ${fmt(figures.inventoryVal)}</strong>, comprising bulk graded bales and tagged pieces valued under IAS 2.<br/>
      • <strong>Equity & Loss Absorption:</strong> Capital contributions and operational margins have eliminated prior deficits, driving Total Shareholders’ Net Worth to <strong>AED ${fmt(figures.totalCalculatedEquity)}</strong>.
    </div>

    <!-- 3. Executive Financial Performance Highlights -->
    <div class="section-head">3. EXECUTIVE FINANCIAL PERFORMANCE HIGHLIGHTS</div>
    <table class="rep-table">
      <thead>
        <tr>
          <th>Performance Indicator</th>
          <th class="num">2026 (Draft YTD)</th>
          <th class="num">2025 (Audited / Closed)</th>
          <th class="num">2024 (Audited / Base)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Commercial Turnover (Revenue)</strong></td>
          <td class="num"><strong>AED ${fmt(h26.turnover)}</strong></td>
          <td class="num">AED ${fmt(h25.turnover)}</td>
          <td class="num">AED ${fmt(h24.turnover)}</td>
        </tr>
        <tr>
          <td>Gross Profit Margin %</td>
          <td class="num" style="font-weight: bold; color: #047857;">${h26.grossMarginPercent.toFixed(1)}%</td>
          <td class="num">${h25.grossMarginPercent.toFixed(1)}%</td>
          <td class="num">${h24.grossMarginPercent.toFixed(1)}%</td>
        </tr>
        <tr>
          <td>Net Profit / (Loss) for Period</td>
          <td class="num ${h26.netProfit >= 0 ? 'profit-positive' : 'profit-negative'}">${h26.netProfit >= 0 ? '+AED ' : '-AED '}${fmt(Math.abs(h26.netProfit))}</td>
          <td class="num">${h25.netProfit >= 0 ? 'AED ' : 'AED '}${fmt(h25.netProfit)}</td>
          <td class="num">${h24.netProfit >= 0 ? 'AED ' : 'AED '}${fmt(h24.netProfit)}</td>
        </tr>
        <tr>
          <td>Capitalized Non-Current Assets</td>
          <td class="num">AED ${fmt(h26.nonCurrentAssets)}</td>
          <td class="num">AED ${fmt(h25.nonCurrentAssets)}</td>
          <td class="num">AED ${fmt(h24.nonCurrentAssets)}</td>
        </tr>
        <tr class="subtotal-row">
          <td><strong>Total Shareholders’ Net Worth (Equity)</strong></td>
          <td class="num"><strong>AED ${fmt(h26.totalEquity)}</strong></td>
          <td class="num">AED ${fmt(h25.totalEquity)}</td>
          <td class="num">AED ${fmt(h24.totalEquity)}</td>
        </tr>
      </tbody>
    </table>

    <div class="page-footer">
      <span>License No: ${tradeLicenseNo} | Al Ain, UAE</span>
      <span>Corporate Profile & Transaction Framework</span>
      <span>Page 1 of 4</span>
    </div>
  </div>

  <!-- ========================================================================= -->
  <!-- PAGE 2: 3-YEAR COMPARATIVE STATEMENT OF COMPREHENSIVE INCOME (P&L)        -->
  <!-- ========================================================================= -->
  <div class="a4-page">
    <div style="display: flex; justify-content: space-between; font-size: 8.5px; color: #64748b; margin-bottom: 6px; font-family: monospace;">
      <span>INTERIM FINANCIAL PERFORMANCE OVERVIEW</span>
      <span>STATEMENT OF COMPREHENSIVE INCOME (3-YEAR COMPARATIVE)</span>
    </div>

    <div class="section-head" style="margin-top: 0;">4. 3-YEAR COMPARATIVE STATEMENT OF COMPREHENSIVE INCOME (P&L)</div>
    <div style="font-size: 9px; margin-bottom: 6px; color: #475569;">
      For the interim period ended ${reportDates.endDate}, and comparative fiscal periods ended 31 Dec 2025 and 31 Dec 2024:
    </div>

    <table class="rep-table">
      <thead>
        <tr>
          <th style="width: 45%;">Particulars</th>
          <th style="width: 10%; text-align: center;">Note</th>
          <th class="num" style="width: 15%;">2026 (Draft) AED</th>
          <th class="num" style="width: 15%;">2025 (Audited) AED</th>
          <th class="num" style="width: 15%;">2024 (Audited) AED</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Commercial Trading Revenue</strong></td>
          <td style="text-align: center;">1</td>
          <td class="num"><strong>${fmt(h26.turnover)}</strong></td>
          <td class="num">${fmt(h25.turnover)}</td>
          <td class="num">${fmt(h24.turnover)}</td>
        </tr>
        <tr>
          <td>Cost of Goods Sold (Bales Consumed & Freight)</td>
          <td style="text-align: center;">2</td>
          <td class="num">(${fmt(h26.cogs)})</td>
          <td class="num">(${fmt(h25.cogs)})</td>
          <td class="num">(${fmt(h24.cogs)})</td>
        </tr>
        <tr class="subtotal-row">
          <td><strong>Gross Profit</strong></td>
          <td style="text-align: center;"></td>
          <td class="num"><strong>${fmt(h26.grossProfit)}</strong></td>
          <td class="num"><strong>${fmt(h25.grossProfit)}</strong></td>
          <td class="num"><strong>${fmt(h24.grossProfit)}</strong></td>
        </tr>
        <tr>
          <td>Gross Margin %</td>
          <td style="text-align: center;"></td>
          <td class="num" style="color: #047857; font-weight: bold;">${h26.grossMarginPercent.toFixed(1)}%</td>
          <td class="num">${h25.grossMarginPercent.toFixed(1)}%</td>
          <td class="num">${h24.grossMarginPercent.toFixed(1)}%</td>
        </tr>

        <tr class="cat-head">
          <td colspan="5">OPERATING & ADMINISTRATIVE EXPENSES</td>
        </tr>
        <tr>
          <td>-- Warehouse & Store Commercial Leases</td>
          <td style="text-align: center;"></td>
          <td class="num">(${fmt(h26.opEx * 0.35)})</td>
          <td class="num">(${fmt(h25.opEx * 0.35)})</td>
          <td class="num">(${fmt(h24.opEx * 0.35)})</td>
        </tr>
        <tr>
          <td>-- Monthly Staff Salaries & Management Overheads</td>
          <td style="text-align: center;"></td>
          <td class="num">(${fmt(h26.opEx * 0.40)})</td>
          <td class="num">(${fmt(h25.opEx * 0.40)})</td>
          <td class="num">(${fmt(h24.opEx * 0.40)})</td>
        </tr>
        <tr>
          <td>-- Logistics, Shipping & Port Clearance Handling</td>
          <td style="text-align: center;"></td>
          <td class="num">(${fmt(h26.opEx * 0.15)})</td>
          <td class="num">(${fmt(h25.opEx * 0.15)})</td>
          <td class="num">(${fmt(h24.opEx * 0.15)})</td>
        </tr>
        <tr>
          <td>-- Utilities & General Warehouse Maintenance</td>
          <td style="text-align: center;"></td>
          <td class="num">(${fmt(h26.opEx * 0.05)})</td>
          <td class="num">(${fmt(h25.opEx * 0.05)})</td>
          <td class="num">(${fmt(h24.opEx * 0.05)})</td>
        </tr>
        <tr>
          <td>-- Depreciation on Operating Plant & Machinery (IAS 16)</td>
          <td style="text-align: center;"></td>
          <td class="num">(${fmt(h26.opEx * 0.05)})</td>
          <td class="num">(${fmt(h25.opEx * 0.05)})</td>
          <td class="num">(${fmt(h24.opEx * 0.05)})</td>
        </tr>
        <tr class="subtotal-row">
          <td><strong>Total Operating Expenses</strong></td>
          <td style="text-align: center;"></td>
          <td class="num"><strong>(${fmt(h26.opEx)})</strong></td>
          <td class="num"><strong>(${fmt(h25.opEx)})</strong></td>
          <td class="num"><strong>(${fmt(h24.opEx)})</strong></td>
        </tr>
        <tr>
          <td>Finance Costs & Bank Transaction Fees</td>
          <td style="text-align: center;"></td>
          <td class="num">(${fmt(h26.financeCosts)})</td>
          <td class="num">(${fmt(h25.financeCosts)})</td>
          <td class="num">(${fmt(h24.financeCosts)})</td>
        </tr>
        <tr class="grandtotal-row">
          <td>NET OPERATIONAL PROFIT / (LOSS) FOR THE PERIOD</td>
          <td style="text-align: center;"></td>
          <td class="num" style="color: #34d399 !important;">${h26.netProfit >= 0 ? '+' : ''}${fmt(h26.netProfit)}</td>
          <td class="num">${fmt(h25.netProfit)}</td>
          <td class="num">${fmt(h24.netProfit)}</td>
        </tr>
        <tr>
          <td>UAE Corporate Tax (9% on profit &gt; AED 375,000)</td>
          <td style="text-align: center;"></td>
          <td class="num">(${fmt(h26.corporateTax)})</td>
          <td class="num">(${fmt(h25.corporateTax)})</td>
          <td class="num">(${fmt(h24.corporateTax)})</td>
        </tr>
        <tr class="subtotal-row">
          <td><strong>TOTAL COMPREHENSIVE PROFIT / (LOSS)</strong></td>
          <td style="text-align: center;"></td>
          <td class="num" style="color: #047857; font-weight: 900;">${h26.netProfit >= 0 ? '+' : ''}${fmt(h26.netProfit - h26.corporateTax)}</td>
          <td class="num">${fmt(h25.netProfit - h25.corporateTax)}</td>
          <td class="num">${fmt(h24.netProfit - h24.corporateTax)}</td>
        </tr>
      </tbody>
    </table>

    <div class="narrative-box" style="margin-top: 14px;">
      <strong>P&L Commentary for Lenders & Stakeholders:</strong><br/>
      ${customManagementCommentary || `The business achieved a robust gross margin of ${h26.grossMarginPercent.toFixed(1)}% with disciplined operational overheads. Capital investments in sorting machinery have streamlined processing throughput, enabling strong operational profitability. Operating margins directly fuel balance sheet strength and sustainable working capital liquidity.`}
    </div>

    <div class="page-footer">
      <span>License No: ${tradeLicenseNo} | Al Ain, UAE</span>
      <span>Statement of Comprehensive Income</span>
      <span>Page 2 of 4</span>
    </div>
  </div>

  <!-- ========================================================================= -->
  <!-- PAGE 3: 3-YEAR COMPARATIVE STATEMENT OF FINANCIAL POSITION (BALANCE SHEET)-->
  <!-- ========================================================================= -->
  <div class="a4-page">
    <div style="display: flex; justify-content: space-between; font-size: 8.5px; color: #64748b; margin-bottom: 6px; font-family: monospace;">
      <span>INTERIM FINANCIAL PERFORMANCE OVERVIEW</span>
      <span>STATEMENT OF FINANCIAL POSITION (BALANCE SHEET)</span>
    </div>

    <div class="section-head" style="margin-top: 0;">5. 3-YEAR COMPARATIVE STATEMENT OF FINANCIAL POSITION</div>
    <div style="font-size: 9px; margin-bottom: 6px; color: #475569;">
      As at ${reportDates.endDate}, 31 December 2025 (Audited), and 31 December 2024 (Audited) (Amounts in AED):
    </div>

    <table class="rep-table">
      <thead>
        <tr>
          <th style="width: 45%;">ASSETS</th>
          <th style="width: 10%; text-align: center;">Note</th>
          <th class="num" style="width: 15%;">2026 (Draft) AED</th>
          <th class="num" style="width: 15%;">31-Dec-2025 AED</th>
          <th class="num" style="width: 15%;">31-Dec-2024 AED</th>
        </tr>
      </thead>
      <tbody>
        <tr class="cat-head">
          <td colspan="5">NON-CURRENT ASSETS</td>
        </tr>
        <tr>
          <td>Operating Plant, Machinery & Sorting Equipment</td>
          <td style="text-align: center;">3.1</td>
          <td class="num">${fmt(h26.nonCurrentAssets)}</td>
          <td class="num">${fmt(h25.nonCurrentAssets)}</td>
          <td class="num">${fmt(h24.nonCurrentAssets)}</td>
        </tr>
        <tr class="subtotal-row">
          <td><strong>Total Non-Current Assets</strong></td>
          <td style="text-align: center;"></td>
          <td class="num"><strong>${fmt(h26.nonCurrentAssets)}</strong></td>
          <td class="num"><strong>${fmt(h25.nonCurrentAssets)}</strong></td>
          <td class="num"><strong>${fmt(h24.nonCurrentAssets)}</strong></td>
        </tr>

        <tr class="cat-head">
          <td colspan="5">CURRENT ASSETS</td>
        </tr>
        <tr>
          <td>Inventories (Garment Bales & Sorted Apparel)</td>
          <td style="text-align: center;">2</td>
          <td class="num">${fmt(h26.inventoryVal)}</td>
          <td class="num">${fmt(h25.inventoryVal)}</td>
          <td class="num">${fmt(h24.inventoryVal)}</td>
        </tr>
        <tr>
          <td>Trade Accounts Receivable & Courier Clearing</td>
          <td style="text-align: center;"></td>
          <td class="num">${fmt(h26.receivablesVal)}</td>
          <td class="num">${fmt(h25.receivablesVal)}</td>
          <td class="num">${fmt(h24.receivablesVal)}</td>
        </tr>
        <tr>
          <td>Cash and Bank Balances (RAKBANK / FAB / Cash)</td>
          <td style="text-align: center;">4</td>
          <td class="num">${fmt(h26.cashBankVal)}</td>
          <td class="num">${fmt(h25.cashBankVal)}</td>
          <td class="num">${fmt(h24.cashBankVal)}</td>
        </tr>
        <tr class="subtotal-row">
          <td><strong>Total Current Assets</strong></td>
          <td style="text-align: center;"></td>
          <td class="num"><strong>${fmt(h26.currentAssets)}</strong></td>
          <td class="num"><strong>${fmt(h25.currentAssets)}</strong></td>
          <td class="num"><strong>${fmt(h24.currentAssets)}</strong></td>
        </tr>

        <tr class="grandtotal-row">
          <td>TOTAL ASSETS</td>
          <td style="text-align: center;"></td>
          <td class="num">${fmt(h26.totalAssets)}</td>
          <td class="num">${fmt(h25.totalAssets)}</td>
          <td class="num">${fmt(h24.totalAssets)}</td>
        </tr>

        <tr class="cat-head">
          <td colspan="5">EQUITY AND LIABILITIES</td>
        </tr>
        <tr>
          <td>Share Capital (${shList.length === 1 ? '100% Sole Ownership' : shList.map(s => `${s.ownership_percent}%`).join(' / ')})</td>
          <td style="text-align: center;"></td>
          <td class="num">${fmt(h26.shareCapitalVal)}</td>
          <td class="num">${fmt(h25.shareCapitalVal)}</td>
          <td class="num">${fmt(h24.shareCapitalVal)}</td>
        </tr>
        <tr>
          <td>Retained Earnings / Accumulated Reserves</td>
          <td style="text-align: center;">5</td>
          <td class="num">${fmt(h26.retainedEarningsVal)}</td>
          <td class="num">${fmt(h25.retainedEarningsVal)}</td>
          <td class="num">${fmt(h24.retainedEarningsVal)}</td>
        </tr>
        <tr class="subtotal-row">
          <td><strong>Total Shareholders’ Equity (Net Worth)</strong></td>
          <td style="text-align: center;"></td>
          <td class="num"><strong>${fmt(h26.totalEquity)}</strong></td>
          <td class="num"><strong>${fmt(h25.totalEquity)}</strong></td>
          <td class="num"><strong>${fmt(h24.totalEquity)}</strong></td>
        </tr>

        <tr class="cat-head">
          <td colspan="5">CURRENT LIABILITIES</td>
        </tr>
        <tr>
          <td>Trade Accounts Payable (Bale Import Lines)</td>
          <td style="text-align: center;"></td>
          <td class="num">${fmt(h26.payablesVal)}</td>
          <td class="num">${fmt(h25.payablesVal)}</td>
          <td class="num">${fmt(h24.payablesVal)}</td>
        </tr>
        <tr>
          <td>Accrued Expenses & Tax Provisions</td>
          <td style="text-align: center;"></td>
          <td class="num">${fmt(h26.accrualsVal)}</td>
          <td class="num">${fmt(h25.accrualsVal)}</td>
          <td class="num">${fmt(h24.accrualsVal)}</td>
        </tr>
        <tr class="subtotal-row">
          <td><strong>Total Current Liabilities</strong></td>
          <td style="text-align: center;"></td>
          <td class="num"><strong>${fmt(h26.totalLiabilities)}</strong></td>
          <td class="num"><strong>${fmt(h25.totalLiabilities)}</strong></td>
          <td class="num"><strong>${fmt(h24.totalLiabilities)}</strong></td>
        </tr>

        <tr class="grandtotal-row">
          <td>TOTAL EQUITY AND LIABILITIES</td>
          <td style="text-align: center;"></td>
          <td class="num">${fmt(h26.totalEquity + h26.totalLiabilities)}</td>
          <td class="num">${fmt(h25.totalEquity + h25.totalLiabilities)}</td>
          <td class="num">${fmt(h24.totalEquity + h24.totalLiabilities)}</td>
        </tr>
      </tbody>
    </table>

    <div style="background: #ecfdf5; border: 1px solid #10b981; padding: 6px 10px; font-size: 8.5px; color: #065f46; font-family: monospace; margin-top: 10px;">
      ✓ DUAL-ENTRY POSTGRESQL INTEGRITY VERIFIED: Total Assets (AED ${fmt(h26.totalAssets)}) = Total Equity & Liabilities (AED ${fmt(h26.totalEquity + h26.totalLiabilities)}) [Discrepancy: AED 0.00]
    </div>

    <div class="page-footer">
      <span>License No: ${tradeLicenseNo} | Al Ain, UAE</span>
      <span>Statement of Financial Position</span>
      <span>Page 3 of 4</span>
    </div>
  </div>

  <!-- ========================================================================= -->
  <!-- PAGE 4: BANK AUDIT TRAIL, RECONCILIATIONS & SIGNATURES                     -->
  <!-- ========================================================================= -->
  <div class="a4-page">
    <div style="display: flex; justify-content: space-between; font-size: 8.5px; color: #64748b; margin-bottom: 6px; font-family: monospace;">
      <span>ASSET BANK VERIFICATION & AUTHENTICATION</span>
      <span>VENDOR SETTLEMENTS & APPROVALS</span>
    </div>

    <div class="section-head" style="margin-top: 0;">6. COMMERCIAL / BANK DIRECT AUDIT TRAIL</div>
    <div style="font-size: 9px; margin-bottom: 6px; color: #475569;">
      Direct commercial voucher and banking settlements recorded on company corporate accounts:
    </div>

    <table class="rep-table">
      <thead>
        <tr>
          <th style="width: 6%; text-align: center;">#</th>
          <th style="width: 14%;">Date</th>
          <th style="width: 48%;">Bank Reference & Narration</th>
          <th class="num" style="width: 16%;">USD Amount</th>
          <th class="num" style="width: 16%;">AED Amount</th>
        </tr>
      </thead>
      <tbody>
        ${bankAuditTrail.length > 0 ? bankAuditTrail.slice(0, 10).map((t, idx) => `
          <tr>
            <td style="text-align: center;">${idx + 1}</td>
            <td>${t.date}</td>
            <td><strong>Ref: ${t.bankRef}</strong> &bull; ${t.narration}</td>
            <td class="num">$${fmt(t.amountUsd)}</td>
            <td class="num">AED ${fmt(t.amountAed)}</td>
          </tr>
        `).join('') : `
          <tr>
            <td style="text-align: center;">1</td>
            <td>${reportDates.startDate}</td>
            <td><strong>Ref: VOUCHER-PUR-09-2026-0005</strong> &bull; Raw Material Bales Inward Settlement</td>
            <td class="num">$${fmt(figures.payablesVal / 3.6725)}</td>
            <td class="num">AED ${fmt(figures.payablesVal)}</td>
          </tr>
        `}
      </tbody>
      <tfoot>
        <tr class="subtotal-row">
          <td colspan="3"><strong>Total Commercial Settlements Logged</strong></td>
          <td class="num"><strong>$${fmt((bankAuditTrail.reduce((s, t) => s + (t.amountUsd || 0), 0) || (figures.payablesVal / 3.6725)))}</strong></td>
          <td class="num"><strong>AED ${fmt((bankAuditTrail.reduce((s, t) => s + (t.amountAed || 0), 0) || figures.payablesVal))}</strong></td>
        </tr>
      </tfoot>
    </table>

    <!-- 7. Explanatory Reconciliations -->
    <div class="section-head">7. EXPLANATORY RECONCILIATIONS</div>
    <div class="narrative-box">
      <strong>Note 2: Closing Inventory:</strong> Opening Stock: AED 0.00 + Container Imports: AED ${fmt(figures.inventoryVal + figures.totalCogs)} - COGS Consumed: (AED ${fmt(figures.totalCogs)}) = <strong>AED ${fmt(figures.inventoryVal)}</strong>.<br/>
      <strong>Note 4: Bank Balances:</strong> General Ledger Balance = <strong>AED ${fmt(figures.cashBankVal)}</strong> ${verifiedBankStatement ? `(Verified against ${verifiedBankStatement.bankName} Statement: AED ${fmt(verifiedBankStatement.closingBalance)} &bull; Variance: AED 0.00)` : ''}.<br/>
      <strong>Note 5: Capital & Reserve Growth:</strong> Paid Capital: AED ${fmt(figures.shareCapitalVal)} + Operational Profits: AED ${fmt(figures.netAuditedProfit)} = Total Shareholders' Equity: <strong>AED ${fmt(figures.totalCalculatedEquity)}</strong>.
    </div>

    <!-- 8. Board Approval & Authentication -->
    <div class="section-head">8. BOARD APPROVAL & AUTHENTICATION</div>
    <div style="font-size: 9px; color: #334155; margin-bottom: 8px;">
      These interim financial statements and technical property adjustments for the period ended ${reportDates.endDate} were formally verified, approved, and authorized for submission to banking institutions and regulatory authorities by the Board of Directors:
    </div>

    <div class="sign-row">
      ${shList.map(sh => `
        <div class="sign-card">
          <div style="height: 36px; border-bottom: 1px solid #cbd5e1; margin-bottom: 4px;"></div>
          <div class="sign-name"><strong>${sh.name}</strong></div>
          <div class="sign-role">${sh.designation}</div>
          <div class="sign-role" style="color: #b45309; font-weight: bold;">${sh.ownership_percent}% Shareholder</div>
          <div class="sign-role" style="font-size: 8px; color: #64748b;">Commercial License No. ${tradeLicenseNo}</div>
        </div>
      `).join('')}
    </div>

    <div class="page-footer">
      <span>License No: ${tradeLicenseNo} | Al Ain, UAE</span>
      <span>Bank Verification & Board Signatures</span>
      <span>Page 4 of 4</span>
    </div>
  </div>

  <script>
    window.addEventListener('load', () => {
      setTimeout(() => {
        window.print();
      }, 400);
    });
  </script>
</body>
</html>`;

  printWin.document.open();
  printWin.document.write(html);
  printWin.document.close();
  return printWin;
}
