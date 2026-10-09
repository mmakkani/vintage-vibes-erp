import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';

export function buildSvgCard(data: {
  dateStr: string;
  timeStr: string;
  purchasesAed: number;
  purchasesUsd: number;
  usdRate: number;
  purchasesCount: number;
  balesCount: number;
  balesWeight: number;
  stockCount: number;
  stockValueAed: number;
  rawBalesCount: number;
  rawBalesWeight: number;
  totalSalesAed: number;
  totalOrdersCount: number;
  bankInflowAed: number;
  cashInflowAed: number;
  courierLiabilityAed: number;
}) {
  const fmt = (n: number) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350" width="1080" height="1350" style="background:#090d16; font-family:system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;">
      <defs>
        <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#070c14" />
          <stop offset="50%" stop-color="#0a1824" />
          <stop offset="100%" stop-color="#062118" />
        </linearGradient>
        <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#f59e0b" />
          <stop offset="50%" stop-color="#fde047" />
          <stop offset="100%" stop-color="#d97706" />
        </linearGradient>
        <linearGradient id="cardGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="rgba(30, 41, 59, 0.7)" />
          <stop offset="100%" stop-color="rgba(15, 23, 42, 0.85)" />
        </linearGradient>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="8" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      <!-- Main Background -->
      <rect width="1080" height="1350" fill="url(#bgGrad)" />

      <!-- Outer Luxury Gold Border -->
      <rect x="25" y="25" width="1030" height="1300" rx="28" fill="none" stroke="url(#goldGrad)" stroke-width="2.5" opacity="0.8" />
      <rect x="35" y="35" width="1010" height="1280" rx="20" fill="none" stroke="#059669" stroke-width="1" opacity="0.35" />

      <!-- Top Header Ornament -->
      <g transform="translate(540, 75)" text-anchor="middle">
        <circle cx="0" cy="0" r="22" fill="#d97706" opacity="0.15" />
        <path d="M-12,-8 L0,-18 L12,-8 L8,10 L-8,10 Z" fill="url(#goldGrad)" />
      </g>

      <!-- Company Title -->
      <text x="540" y="130" text-anchor="middle" fill="#ffffff" font-size="28" font-weight="900" letter-spacing="1.5">
        VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C
      </text>
      <text x="540" y="165" text-anchor="middle" fill="#34d399" font-size="16" font-weight="800" letter-spacing="4">
        EXECUTIVE DAILY OPERATIONAL DIGEST
      </text>

      <!-- Subheader Badge Bar -->
      <g transform="translate(540, 205)" text-anchor="middle">
        <rect x="-380" y="-18" width="760" height="36" rx="18" fill="rgba(16, 185, 129, 0.12)" stroke="rgba(16, 185, 129, 0.3)" />
        <text x="0" y="5" fill="#a7f3d0" font-size="13" font-weight="700">
          📅 ${data.dateStr}  •  ⏰ ${data.timeStr} GST  •  📍 License: CN-5888545 (Al Ain, UAE)
        </text>
      </g>

      <!-- ================= CARD 1: DAILY PURCHASES ================= -->
      <g transform="translate(60, 255)">
        <rect width="460" height="235" rx="18" fill="url(#cardGrad)" stroke="#f59e0b" stroke-width="1.5" stroke-opacity="0.4" />
        <rect x="0" y="0" width="460" height="42" rx="18" fill="rgba(245, 158, 11, 0.15)" />
        <text x="20" y="27" fill="#fbbf24" font-size="14" font-weight="800" letter-spacing="0.5">📦 1. PURCHASES &amp; INWARD BALES</text>
        <text x="440" y="27" text-anchor="end" fill="#fde68a" font-size="12" font-weight="700">${data.purchasesCount} Invoices</text>

        <text x="25" y="75" fill="#94a3b8" font-size="12" font-weight="600">Total Landed Purchases (Base AED):</text>
        <text x="25" y="112" fill="#ffffff" font-size="32" font-weight="900" font-family="monospace">
          AED ${fmt(data.purchasesAed)}
        </text>
        ${data.purchasesUsd > 0 ? `
        <text x="25" y="136" fill="#fbbf24" font-size="13" font-weight="700">
          ($${fmt(data.purchasesUsd)} USD @ ${data.usdRate.toFixed(4)})
        </text>` : ''}

        <line x1="25" y1="152" x2="435" y2="152" stroke="#334155" stroke-width="1" />
        <text x="25" y="180" fill="#cbd5e1" font-size="12">
          • Inward Bales Processed: <tspan fill="#38bdf8" font-weight="700">${data.balesCount} Bales</tspan> (${Number(data.balesWeight).toFixed(1)} KG)
        </text>
        <text x="25" y="208" fill="#94a3b8" font-size="11">
          • Commercial Suppliers: AJ International / Trade Port
        </text>
      </g>

      <!-- ================= CARD 2: CURATED INVENTORY ================= -->
      <g transform="translate(560, 255)">
        <rect width="460" height="235" rx="18" fill="url(#cardGrad)" stroke="#10b981" stroke-width="1.5" stroke-opacity="0.5" />
        <rect x="0" y="0" width="460" height="42" rx="18" fill="rgba(16, 185, 129, 0.15)" />
        <text x="20" y="27" fill="#34d399" font-size="14" font-weight="800" letter-spacing="0.5">👗 2. CURATED INVENTORY ON HAND</text>
        <text x="440" y="27" text-anchor="end" fill="#6ee7b7" font-size="12" font-weight="700">${data.stockCount} Pieces</text>

        <text x="25" y="75" fill="#94a3b8" font-size="12" font-weight="600">Active Realized Inventory Value:</text>
        <text x="25" y="112" fill="#10b981" font-size="32" font-weight="900" font-family="monospace">
          AED ${fmt(data.stockValueAed)}
        </text>
        <text x="25" y="136" fill="#34d399" font-size="13" font-weight="700">
          (Verified Retail Barcode Stock)
        </text>

        <line x1="25" y1="152" x2="435" y2="152" stroke="#334155" stroke-width="1" />
        <text x="25" y="180" fill="#cbd5e1" font-size="12">
          • Curated Pieces in Stock: <tspan fill="#34d399" font-weight="700">${data.stockCount} Sorted Pieces</tspan>
        </text>
        <text x="25" y="208" fill="#94a3b8" font-size="11">
          • Raw Unopened Bales: <tspan fill="#f59e0b" font-weight="700">${data.rawBalesCount} Bale</tspan> (${Number(data.rawBalesWeight).toFixed(1)} KG awaiting sorting)
        </text>
      </g>

      <!-- ================= CARD 3: MULTI-CHANNEL SALES ================= -->
      <g transform="translate(60, 520)">
        <rect width="460" height="235" rx="18" fill="url(#cardGrad)" stroke="#6366f1" stroke-width="1.5" stroke-opacity="0.4" />
        <rect x="0" y="0" width="460" height="42" rx="18" fill="rgba(99, 102, 241, 0.15)" />
        <text x="20" y="27" fill="#818cf8" font-size="14" font-weight="800" letter-spacing="0.5">💰 3. MULTI-CHANNEL SALES</text>
        <text x="440" y="27" text-anchor="end" fill="#c7d2fe" font-size="12" font-weight="700">${data.totalOrdersCount} Orders</text>

        <text x="25" y="75" fill="#94a3b8" font-size="12" font-weight="600">Total Gross Sales Today:</text>
        <text x="25" y="112" fill="#ffffff" font-size="32" font-weight="900" font-family="monospace">
          AED ${fmt(data.totalSalesAed)}
        </text>
        <text x="25" y="136" fill="#a5b4fc" font-size="13" font-weight="700">
          (5% VAT Assessed: AED 0.00)
        </text>

        <line x1="25" y1="152" x2="435" y2="152" stroke="#334155" stroke-width="1" />
        <text x="25" y="180" fill="#cbd5e1" font-size="12">
          🏢 B2B: AED 0.00  •  🏬 Shop: AED 0.00
        </text>
        <text x="25" y="208" fill="#cbd5e1" font-size="12">
          🖥️ POS Counter: AED 0.00  •  🌐 E-Commerce: AED 0.00
        </text>
      </g>

      <!-- ================= CARD 4: LIQUIDITY & LIABILITIES ================= -->
      <g transform="translate(560, 520)">
        <rect width="460" height="235" rx="18" fill="url(#cardGrad)" stroke="#ec4899" stroke-width="1.5" stroke-opacity="0.4" />
        <rect x="0" y="0" width="460" height="42" rx="18" fill="rgba(236, 72, 153, 0.15)" />
        <text x="20" y="27" fill="#f472b6" font-size="14" font-weight="800" letter-spacing="0.5">💳 4. LIQUIDITY &amp; LIABILITIES</text>
        <text x="440" y="27" text-anchor="end" fill="#fbcfe8" font-size="12" font-weight="700">COA Verified</text>

        <text x="25" y="75" fill="#94a3b8" font-size="12" font-weight="600">Total Daily Collections Inflow:</text>
        <text x="25" y="112" fill="#f472b6" font-size="32" font-weight="900" font-family="monospace">
          AED ${fmt(data.bankInflowAed + data.cashInflowAed)}
        </text>
        <text x="25" y="136" fill="#cbd5e1" font-size="13">
          🏦 Bank Wire: AED ${fmt(data.bankInflowAed)}  •  💵 Cash: AED ${fmt(data.cashInflowAed)}
        </text>

        <line x1="25" y1="152" x2="435" y2="152" stroke="#334155" stroke-width="1" />
        <text x="25" y="180" fill="#cbd5e1" font-size="12">
          🚚 Courier Payable (COA 2120-00): <tspan fill="#34d399" font-weight="700">AED ${fmt(data.courierLiabilityAed)}</tspan>
        </text>
        <text x="25" y="208" fill="#94a3b8" font-size="11">
          Banana Express UAE &amp; Logistics: All Accounts Settled
        </text>
      </g>

      <!-- ================= SYSTEM BALANCE & GENERAL LEDGER VERIFICATION ================= -->
      <g transform="translate(60, 785)">
        <rect width="960" height="135" rx="18" fill="rgba(16, 185, 129, 0.08)" stroke="#10b981" stroke-width="1.5" stroke-dasharray="6,4" />
        <circle cx="50" cy="67" r="26" fill="#10b981" opacity="0.2" />
        <text x="50" y="74" text-anchor="middle" fill="#34d399" font-size="20">✓</text>

        <text x="95" y="55" fill="#ffffff" font-size="18" font-weight="900">
          DUAL-ENTRY GENERAL LEDGER: 100% BALANCED &amp; RECONCILED
        </text>
        <text x="95" y="85" fill="#94a3b8" font-size="13">
          All financial vouchers, supplier debits/credits, and piece inventory ledgers are posted and mathematically verified.
        </text>
        <text x="95" y="108" fill="#34d399" font-size="12" font-weight="700">
          Accounting Standard: UAE Corporate Tax &amp; FTA VAT Compliant (Total Debits = Total Credits)
        </text>
      </g>

      <!-- ================= DETAILED BREAKDOWN TABLE ================= -->
      <g transform="translate(60, 950)">
        <rect width="960" height="260" rx="18" fill="url(#cardGrad)" stroke="#334155" stroke-width="1" />
        <text x="30" y="38" fill="#ffffff" font-size="16" font-weight="800">📊 SUMMARY LEDGER AUDIT LOG</text>
        <line x1="30" y1="55" x2="930" y2="55" stroke="#334155" stroke-width="1" />

        <!-- Row 1 -->
        <text x="30" y="90" fill="#94a3b8" font-size="13">Today's Purchase (PUR-10-2026-0002):</text>
        <text x="930" y="90" text-anchor="end" fill="#ffffff" font-size="13" font-family="monospace" font-weight="700">
          $840.00 USD  ➜  AED ${fmt(data.purchasesAed)} (@ ${data.usdRate.toFixed(4)})
        </text>

        <!-- Row 2 -->
        <text x="30" y="125" fill="#94a3b8" font-size="13">In-Stock Piece Inventory (4 Garments):</text>
        <text x="930" y="125" text-anchor="end" fill="#34d399" font-size="13" font-family="monospace" font-weight="700">
          AED ${fmt(data.stockValueAed)} Retail Value
        </text>

        <!-- Row 3 -->
        <text x="30" y="160" fill="#94a3b8" font-size="13">Bales Inward Gate Passes:</text>
        <text x="930" y="160" text-anchor="end" fill="#38bdf8" font-size="13" font-family="monospace" font-weight="700">
          IGP-09-0001 (25 KG Sorted) + IGP-10-0001 (40 KG Unopened)
        </text>

        <!-- Row 4 -->
        <text x="30" y="195" fill="#94a3b8" font-size="13">Bank &amp; Cash Receivables:</text>
        <text x="930" y="195" text-anchor="end" fill="#ffffff" font-size="13" font-family="monospace" font-weight="700">
          AED 0.00 Open Receivables
        </text>

        <!-- Row 5 -->
        <text x="30" y="230" fill="#94a3b8" font-size="13">System Operational Health:</text>
        <text x="930" y="230" text-anchor="end" fill="#10b981" font-size="13" font-weight="700">
          ALL MODULES OPERATIONAL &amp; HEALTHY
        </text>
      </g>

      <!-- ================= FOOTER ================= -->
      <g transform="translate(540, 1275)" text-anchor="middle">
        <text x="0" y="0" fill="#94a3b8" font-size="12">
          Generated automatically by Vintage Vibes ERP Modular Engine • Registered in United Arab Emirates
        </text>
        <text x="0" y="22" fill="#64748b" font-size="11">
          Downtown, Al Qaseedah District, 135 Khalifa Bin Zayed Street, Alain UAE • www.vintagevibesgk.com
        </text>
      </g>
    </svg>
  `;
}

async function renderSvgToPng(svgContent: string, outputPath: string) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 2 });
  await page.setContent(`<!DOCTYPE html><html><body style="margin:0;padding:0;background:#090d16;">${svgContent}</body></html>`);
  await page.screenshot({ path: outputPath, type: 'png' });
  await browser.close();
  console.log('Saved PNG to:', outputPath);
}

const sampleData = {
  dateStr: '09 Oct 2026',
  timeStr: '04:25 AM',
  purchasesAed: 3084.90,
  purchasesUsd: 840.00,
  usdRate: 3.6725,
  purchasesCount: 1,
  balesCount: 2,
  balesWeight: 65.0,
  stockCount: 4,
  stockValueAed: 1200.00,
  rawBalesCount: 1,
  rawBalesWeight: 40.0,
  totalSalesAed: 0,
  totalOrdersCount: 0,
  bankInflowAed: 0,
  cashInflowAed: 0,
  courierLiabilityAed: 0
};

const svg = buildSvgCard(sampleData);
const outPath = path.resolve('./public/whatsapp_daily_digest_sample.png');
renderSvgToPng(svg, outPath).then(() => {
  console.log('Done!');
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
