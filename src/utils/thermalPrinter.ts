import JsBarcode from 'jsbarcode';

export interface ThermalLabelData {
  itemCode: string;
  description: string;
  category?: string;
  size?: string;
  brand?: string;
  grade?: string;
  retailPriceAed: number;
  batchNo?: string;
  date?: string;
  companyName?: string;
  trn?: string;
  weightKg?: number;
  printSize?: string;
  svgHtml?: string;
  settings?: {
    showCompanyName?: boolean;
    showPrice?: boolean;
    showQtyWeight?: boolean;
    showDescription?: boolean;
    showLogo?: boolean;
    showBarcode?: boolean;
  };
}

export interface ThermalShippingWaybillData {
  waybillNo: string;
  courier: string;
  isCOD: boolean;
  totalAmount: number;
  shippingFee: number;
  invoiceNo: string;
  customerName: string;
  buyerHandle?: string;
  customerPhone?: string;
  shippingAddress?: string;
  shippingBearer?: string;
  paymentStatus?: string;
  items: Array<{ description: string; barcode?: string; finalAmount?: number; unitPrice?: number }>;
  svgHtml?: string;
}

/**
 * Open a self-contained window for thermal barcode sticker printing.
 */
export function openThermalLabelPrintWindow(data: ThermalLabelData): Window | null {
  const size = data.printSize || '50x25mm';
  let widthMm = 50;
  let heightMm = 25;

  if (size === '40x30mm') {
    widthMm = 40;
    heightMm = 30;
  } else if (size === '80x50mm') {
    widthMm = 80;
    heightMm = 50;
  } else if (size === '100x150mm' || size === '4x6_shipping') {
    widthMm = 100;
    heightMm = 150;
  }

  const win = window.open('', '_blank', 'width=480,height=600,resizable=yes,scrollbars=yes');
  if (!win) {
    alert('Popup blocked by browser. Please allow popups to print thermal labels.');
    return null;
  }

  const s = data.settings || {
    showCompanyName: true,
    showPrice: true,
    showQtyWeight: true,
    showDescription: true,
    showLogo: true,
    showBarcode: true
  };

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Thermal Label - ${data.itemCode}</title>
  <style>
    @page {
      size: ${widthMm}mm ${heightMm}mm;
      margin: 0;
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace, sans-serif;
      background: #f8fafc;
      color: #000;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .toolbar {
      background: #0f172a;
      color: #fff;
      padding: 10px 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      font-weight: 600;
      position: sticky;
      top: 0;
      z-index: 10;
    }
    .btn {
      border: none;
      border-radius: 6px;
      padding: 6px 12px;
      font-weight: 700;
      font-size: 11px;
      cursor: pointer;
    }
    .btn-print {
      background: #f59e0b;
      color: #000;
      margin-right: 6px;
    }
    .btn-close {
      background: #475569;
      color: #fff;
    }
    .preview-container {
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 24px;
    }
    .thermal-card {
      width: ${widthMm}mm;
      min-height: ${heightMm}mm;
      padding: 2.5mm;
      background: #ffffff;
      border: 1px dashed #94a3b8;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      font-size: 8.5px;
      line-height: 1.15;
    }
    .header-box {
      text-align: center;
      border-bottom: 1px solid #000;
      padding-bottom: 2px;
      margin-bottom: 2px;
    }
    .comp-name {
      font-weight: 900;
      font-size: 9.5px;
      text-transform: uppercase;
      letter-spacing: 0.2px;
    }
    .trn-text {
      font-size: 7px;
      color: #333;
      font-family: monospace;
    }
    .item-desc {
      font-weight: 800;
      font-size: 9px;
      text-transform: uppercase;
      margin: 2px 0 1px 0;
      line-height: 1.1;
      max-height: 22px;
      overflow: hidden;
    }
    .tags-row {
      display: flex;
      justify-content: space-between;
      font-size: 7.5px;
      font-weight: 600;
      color: #222;
      margin-bottom: 2px;
    }
    .badge {
      display: inline-block;
      padding: 0 3px;
      border: 0.5px solid #000;
      border-radius: 2px;
    }
    .barcode-area {
      display: flex;
      justify-content: center;
      align-items: center;
      margin: 1px 0;
    }
    .barcode-area svg {
      max-width: 100%;
      height: auto;
      max-height: 38px;
    }
    .footer-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      border-top: 1px solid #000;
      padding-top: 2px;
      margin-top: 2px;
    }
    .batch-date {
      font-family: monospace;
      font-size: 6.5px;
      color: #333;
      line-height: 1.1;
    }
    .price-tag {
      font-size: 13px;
      font-weight: 900;
      text-align: right;
      letter-spacing: -0.5px;
    }
    .price-currency {
      font-size: 8px;
      font-weight: 700;
      margin-right: 1px;
    }
    @media print {
      body {
        background: #ffffff !important;
      }
      .toolbar {
        display: none !important;
      }
      .preview-container {
        padding: 0 !important;
        margin: 0 !important;
      }
      .thermal-card {
        border: none !important;
        box-shadow: none !important;
        margin: 0 !important;
        page-break-after: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <span>Thermal Label Print (${widthMm}x${heightMm}mm)</span>
    <div>
      <button class="btn btn-print" onclick="window.print()">Print Label</button>
      <button class="btn btn-close" onclick="window.close()">Close</button>
    </div>
  </div>

  <div class="preview-container">
    <div class="thermal-card">
      <div>
        ${s.showCompanyName ? `
        <div class="header-box">
          ${s.showLogo ? '<div style="font-size:8px;font-weight:bold;margin-bottom:1px;">🏷️ VINTAGE VIBES ERP</div>' : ''}
          <div class="comp-name">${data.companyName || 'VINTAGE VIBES TRADING L.L.C'}</div>
          <div class="trn-text">${data.trn || 'TRN: 100482910300003'} | ${size}</div>
        </div>
        ` : ''}

        ${s.showDescription ? `
        <div class="item-desc">${data.description}</div>
        <div class="tags-row" style="display:flex;align-items:center;justify-content:space-between;gap:4px;flex-wrap:wrap;">
          <span>${data.category || 'Apparel'}${data.brand ? ' &bull; ' + data.brand : ''}</span>
          ${data.size ? `<span class="badge" style="background:#000;color:#fff;font-weight:900;padding:1px 4px;border-radius:2px;font-size:8px;">SIZE: ${data.size}</span>` : ''}
          ${data.grade ? `<span class="badge">&starf; ${data.grade}</span>` : ''}
        </div>
        ` : ''}

        ${s.showQtyWeight ? `
        <div class="tags-row" style="background:#f1f5f9;padding:1px 3px;border-radius:2px;font-family:monospace;">
          <span>QTY: 1 PCS</span>
          <span>WEIGHT: ${data.weightKg ? data.weightKg + ' kg' : '340g'}</span>
        </div>
        ` : ''}
      </div>

      <div>
        ${s.showBarcode && data.svgHtml ? `
        <div class="barcode-area">
          ${data.svgHtml}
        </div>
        ` : ''}

        ${s.showPrice ? `
        <div class="footer-row">
          <div class="batch-date">
            <div>BATCH: ${data.batchNo || 'BALE-2026'}</div>
            <div>${data.date || new Date().toISOString().split('T')[0]}</div>
          </div>
          <div class="price-tag">
            <span class="price-currency">AED</span>${data.retailPriceAed.toFixed(2)}
          </div>
        </div>
        ` : ''}
      </div>
    </div>
  </div>

  <script>
    window.addEventListener('afterprint', function() {
      setTimeout(function() {
        try { window.close(); } catch(e) {}
      }, 350);
    });
    window.addEventListener('load', function() {
      setTimeout(function() {
        window.print();
      }, 250);
    });
  </script>
</body>
</html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
  return win;
}

/**
 * Open a self-contained window for 4x6 (100mm x 150mm) thermal shipping waybill printing.
 */
export function openThermalShippingWaybillPrintWindow(data: ThermalShippingWaybillData): Window | null {
  const win = window.open('', '_blank', 'width=560,height=780,resizable=yes,scrollbars=yes');
  if (!win) {
    alert('Popup blocked by browser. Please allow popups to print shipping waybills.');
    return null;
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Shipping Waybill - ${data.waybillNo}</title>
  <style>
    @page {
      size: 100mm 150mm;
      margin: 0;
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace, sans-serif;
      background: #f8fafc;
      color: #000;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .toolbar {
      background: #0f172a;
      color: #fff;
      padding: 10px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13px;
      font-weight: 600;
      position: sticky;
      top: 0;
      z-index: 10;
    }
    .btn {
      border: none;
      border-radius: 6px;
      padding: 6px 14px;
      font-weight: 700;
      font-size: 12px;
      cursor: pointer;
    }
    .btn-print {
      background: #f59e0b;
      color: #000;
      margin-right: 8px;
    }
    .btn-close {
      background: #475569;
      color: #fff;
    }
    .preview-container {
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 20px;
    }
    .waybill-card {
      width: 100mm;
      min-height: 150mm;
      padding: 4mm;
      background: #ffffff;
      border: 2px solid #000;
      font-size: 10px;
      line-height: 1.25;
      font-family: monospace, sans-serif;
    }
    .courier-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #000;
      padding-bottom: 6px;
      margin-bottom: 6px;
    }
    .courier-pill {
      background: #000;
      color: #fff;
      padding: 3px 8px;
      font-size: 14px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .barcode-section {
      text-align: center;
      border-bottom: 2px solid #000;
      padding: 6px 0;
      margin-bottom: 6px;
      background: #f8fafc;
    }
    .barcode-section svg {
      max-width: 100%;
      height: auto;
      max-height: 52px;
    }
    .grid-parties {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      border-bottom: 2px solid #000;
      padding-bottom: 8px;
      margin-bottom: 8px;
      font-size: 9.5px;
    }
    .party-col-from {
      border-right: 1px solid #000;
      padding-right: 6px;
    }
    .party-title {
      font-weight: 900;
      font-size: 8.5px;
      text-transform: uppercase;
      color: #444;
      margin-bottom: 2px;
    }
    .items-section {
      border-bottom: 2px solid #000;
      padding-bottom: 6px;
      margin-bottom: 6px;
      font-size: 9px;
    }
    .cod-box {
      border: 2px solid #000;
      padding: 6px 8px;
      background: #f8fafc;
      margin-bottom: 6px;
    }
    .cod-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .footer-notice {
      text-align: center;
      font-size: 7.5px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #555;
    }
    @media print {
      body {
        background: #ffffff !important;
      }
      .toolbar {
        display: none !important;
      }
      .preview-container {
        padding: 0 !important;
        margin: 0 !important;
      }
      .waybill-card {
        border: 2px solid #000 !important;
        margin: 0 !important;
        page-break-after: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <span>4" x 6" Thermal Waybill (${data.courier})</span>
    <div>
      <button class="btn btn-print" onclick="window.print()">Print Waybill</button>
      <button class="btn btn-close" onclick="window.close()">Close</button>
    </div>
  </div>

  <div class="preview-container">
    <div class="waybill-card">
      <div class="courier-bar">
        <div>
          <span class="courier-pill">${data.courier}</span>
          <div style="font-size:8px;font-weight:bold;margin-top:2px;">DOMESTIC / AIRWAY DISPATCH</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:8px;color:#555;">ORIGIN: DXB-UAE</div>
          <div style="font-size:11px;font-weight:900;">STD-PRIORITY</div>
        </div>
      </div>

      <div class="barcode-section">
        ${data.svgHtml || ''}
        <div style="font-size:9px;font-weight:bold;margin-top:2px;">
          WAYBILL / TRACKING #${data.waybillNo}
        </div>
      </div>

      <div class="grid-parties">
        <div class="party-col-from">
          <div class="party-title">FROM (SHIPPER):</div>
          <div style="font-weight:800;">VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C</div>
          <div>House 14 Street 4 - Al Jimi - Al Nudood</div>
          <div>Al Ain, Abu Dhabi, United Arab Emirates</div>
          <div style="font-weight:700;margin-top:2px;">TRN: 100482910300003</div>
          <div>Tel: +971 55 418 6086</div>
        </div>
        <div>
          <div class="party-title">TO (CONSIGNEE):</div>
          <div style="font-weight:900;font-size:10.5px;">${data.customerName || data.buyerHandle || 'Guest Buyer'}</div>
          ${data.buyerHandle ? `<div style="font-weight:800;color:#1e40af;">${data.buyerHandle}</div>` : ''}
          <div style="font-weight:700;">${data.customerPhone || '+971 50 123 4567'}</div>
          <div style="margin-top:2px;">${data.shippingAddress || 'Dubai / Northern Emirates, UAE'}</div>
        </div>
      </div>

      <div class="items-section">
        <div style="display:flex;justify-content:space-between;font-weight:bold;margin-bottom:3px;">
          <span>INVOICE: ${data.invoiceNo}</span>
          <span>PIECES: ${data.items.length} PCS</span>
        </div>
        ${data.items.slice(0, 4).map(it => `
          <div style="display:flex;justify-content:space-between;color:#222;font-size:8.5px;">
            <span style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">&bull; ${it.description}</span>
            <span>AED ${(it.finalAmount || it.unitPrice || 0).toFixed(2)}</span>
          </div>
        `).join('')}
        ${data.items.length > 4 ? `<div style="font-size:8px;color:#666;font-style:italic;">+ ${data.items.length - 4} more garments bundled</div>` : ''}
      </div>

      <div class="cod-box">
        <div class="cod-row">
          <div>
            <div style="font-size:8px;font-weight:bold;color:#555;">COLLECTION MODE:</div>
            <div style="font-size:12px;font-weight:900;">
              ${data.isCOD ? '💵 CASH ON DELIVERY (COD)' : '✅ PREPAID (DO NOT COLLECT)'}
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:8px;font-weight:bold;color:#555;">TOTAL TO COLLECT:</div>
            <div style="font-size:14px;font-weight:900;">
              ${data.isCOD ? 'AED ' + data.totalAmount.toFixed(2) : 'AED 0.00'}
            </div>
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:8.5px;color:#555;margin-top:4px;padding-top:3px;border-top:1px solid #ccc;">
          <span>Shipping: ${data.shippingBearer === 'COMPANY' ? 'Absorbed (FREE to Buyer)' : 'AED ' + data.shippingFee.toFixed(2)}</span>
          <span>Status: ${data.paymentStatus || 'VERIFIED'}</span>
        </div>
      </div>

      <div class="footer-notice">
        Vintage Vibes Live Stream Logistics &bull; Retain Waybill for Customer Signature
      </div>
    </div>
  </div>

  <script>
    window.addEventListener('afterprint', function() {
      setTimeout(function() {
        try { window.close(); } catch(e) {}
      }, 350);
    });
    window.addEventListener('load', function() {
      setTimeout(function() {
        window.print();
      }, 250);
    });
  </script>
</body>
</html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
  return win;
}

export interface BaleThermalTagData {
  baleCode: string;
  gatePassNo?: string;
  category: string;
  grossWeightKg: number;
  totalCostAed?: number;
  costPerGram?: number;
  purchaseInvoiceNo?: string;
  supplierName?: string;
  status?: string;
  timestamp?: string;
}

/**
 * Open a self-contained window for high-density 4"x2" or 4"x4" Bale Thermal Tag printing
 */
export function openBaleThermalTagPrintWindow(data: BaleThermalTagData): Window | null {
  const win = window.open('', '_blank', 'width=540,height=680,resizable=yes,scrollbars=yes');
  if (!win) {
    alert('Popup blocked by browser. Please allow popups to print bale thermal tags.');
    return null;
  }

  const grossGrams = Math.round((Number(data.grossWeightKg) || 0) * 1000);
  const costPerGram = data.costPerGram || (data.totalCostAed && grossGrams > 0 ? (data.totalCostAed / grossGrams) : 0);
  const timestamp = data.timestamp || new Date().toLocaleString();
  const status = data.status || 'Unopened / In Stock';

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Bale Thermal Tag - ${data.baleCode}</title>
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"></script>
  <style>
    @media print {
      @page { size: 100mm 50mm; margin: 0; }
      body { margin: 0; padding: 2mm; background: #fff !important; }
      .toolbar { display: none !important; }
      .tag-card { border: none !important; box-shadow: none !important; margin: 0 !important; width: 100% !important; }
    }
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f1f5f9; margin: 0; padding: 12px; }
    .toolbar { background: #0f172a; color: #fff; padding: 8px 12px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; font-size: 11px; font-weight: bold; margin-bottom: 12px; }
    .btn { border: none; padding: 6px 12px; border-radius: 6px; font-size: 11px; font-weight: bold; cursor: pointer; }
    .btn-print { background: #d97706; color: #fff; margin-right: 6px; }
    .btn-close { background: #475569; color: #fff; }
    .tag-card { background: #fff; border: 2px solid #000; border-radius: 4px; padding: 10px; max-width: 420px; margin: 0 auto; color: #000; }
    .header-row { display: flex; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 4px; margin-bottom: 6px; }
    .brand-title { font-size: 11px; font-weight: 900; letter-spacing: 0.5px; }
    .factory-ref { font-size: 9px; font-family: monospace; font-weight: bold; }
    .bale-id-banner { text-align: center; margin: 6px 0; }
    .bale-id-text { font-size: 26px; font-weight: 900; font-family: monospace; letter-spacing: 2px; }
    .category-badge { display: inline-block; background: #000; color: #fff; font-size: 10px; font-weight: 800; text-transform: uppercase; padding: 2px 8px; border-radius: 3px; margin-top: 2px; }
    .codes-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 6px 0; border-top: 1px dashed #666; border-bottom: 1px dashed #666; padding: 6px 0; }
    .barcode-col { flex: 1; text-align: center; }
    .barcode-col svg { width: 100%; max-height: 48px; }
    .qr-col { width: 64px; height: 64px; display: flex; align-items: center; justify-content: center; }
    .metrics-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; text-align: center; margin-top: 6px; font-family: monospace; }
    .metric-box { border: 1px solid #000; padding: 3px 2px; }
    .metric-label { font-size: 8px; font-weight: bold; text-transform: uppercase; color: #444; }
    .metric-val { font-size: 11px; font-weight: 900; }
    .status-row { display: flex; justify-content: space-between; font-size: 8.5px; font-weight: bold; margin-top: 6px; padding-top: 4px; border-top: 1px solid #000; }
  </style>
</head>
<body>
  <div class="toolbar">
    <span>🏷️ 4"x2" Thermal Bale Label &bull; ${data.baleCode}</span>
    <div>
      <button class="btn btn-print" onclick="window.print()">Print Thermal Tag</button>
      <button class="btn btn-close" onclick="window.close()">Close</button>
    </div>
  </div>

  <div class="tag-card">
    <div class="header-row">
      <div>
        <div class="brand-title">VINTAGE VIBES DUBAI &bull; INWARD BALE</div>
        <div class="factory-ref">FACTORY REF: ${data.purchaseInvoiceNo || 'DIRECT IMPORT'}</div>
      </div>
      <div style="text-align: right;">
        <div style="font-size: 9px; font-weight: bold;">SUPPLIER:</div>
        <div style="font-size: 8.5px; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          ${data.supplierName || 'International Textile Sorters'}
        </div>
      </div>
    </div>

    <div class="bale-id-banner">
      <div class="bale-id-text">${data.baleCode}</div>
      <div class="category-badge">${data.category}</div>
    </div>

    <div class="codes-row">
      <div class="barcode-col">
        <svg id="barcode-elem"></svg>
      </div>
      <div class="qr-col" id="qr-elem"></div>
    </div>

    <div class="metrics-grid">
      <div class="metric-box">
        <div class="metric-label">Gross Weight</div>
        <div class="metric-val">${Number(data.grossWeightKg).toFixed(2)} KG</div>
      </div>
      <div class="metric-box">
        <div class="metric-label">Total Grams</div>
        <div class="metric-val">${grossGrams.toLocaleString()} g</div>
      </div>
      <div class="metric-box">
        <div class="metric-label">Base Cost / Gram</div>
        <div class="metric-val">AED ${Number(costPerGram).toFixed(4)}</div>
      </div>
    </div>

    <div class="status-row">
      <span>STATUS: <strong>${status}</strong></span>
      <span>TIMESTAMP: ${timestamp}</span>
    </div>
  </div>

  <script>
    try {
      JsBarcode("#barcode-elem", "${data.baleCode}", {
        format: "CODE128",
        width: 1.6,
        height: 42,
        displayValue: true,
        fontSize: 10,
        margin: 2
      });
      var qr = qrcode(4, 'L');
      qr.addData(JSON.stringify({
        bale: "${data.baleCode}",
        cat: "${data.category}",
        wtKg: ${data.grossWeightKg},
        inv: "${data.purchaseInvoiceNo || ''}"
      }));
      qr.make();
      document.getElementById('qr-elem').innerHTML = qr.createImgTag(2, 2);
    } catch(e) {
      console.error(e);
    }

    window.addEventListener('afterprint', function() {
      setTimeout(function() {
        try { window.close(); } catch(e) {}
      }, 350);
    });
    window.addEventListener('load', function() {
      setTimeout(function() {
        window.print();
      }, 250);
    });
  </script>
</body>
</html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
  return win;
}

export interface BatchBaleThermalTagItem {
  baleCode: string;
  gatePassNo?: string;
  category: string;
  grossWeightKg: number;
  totalCostAed?: number;
  costPerGram?: number;
  purchaseInvoiceNo?: string;
  supplierName?: string;
  status?: string;
  index: number;
  totalCount: number;
  timestamp?: string;
}

/**
 * Open a self-contained window for high-density 4"x2" Thermal Printing of ALL Bales/Sacks in an invoice or batch
 */
export function openBatchBaleThermalTagsPrintWindow(bales: BatchBaleThermalTagItem[]): Window | null {
  if (!bales || bales.length === 0) {
    alert('No bales available to print thermal tags.');
    return null;
  }

  const win = window.open('', '_blank', 'width=580,height=750,resizable=yes,scrollbars=yes');
  if (!win) {
    alert('Popup blocked by browser. Please allow popups to print bale thermal tags.');
    return null;
  }

  const totalBalesCount = bales.length;
  const cardsHtml = bales.map((bale, idx) => {
    const grossGrams = Math.round((Number(bale.grossWeightKg) || 0) * 1000);
    const costPerGram = bale.costPerGram || (bale.totalCostAed && grossGrams > 0 ? (bale.totalCostAed / grossGrams) : 0);
    const timestamp = bale.timestamp || new Date().toLocaleString();
    const status = bale.status || 'Unopened / Ready for Sorting';

    return `
    <div class="tag-page">
      <div class="tag-card">
        <div class="header-row">
          <div>
            <div class="brand-title">VINTAGE VIBES DUBAI &bull; INWARD BALE</div>
            <div class="factory-ref">REF: ${bale.purchaseInvoiceNo || 'IMPORT'} &bull; TAG ${bale.index} / ${bale.totalCount || totalBalesCount}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 8px; font-weight: bold; text-transform: uppercase; color: #555;">SUPPLIER:</div>
            <div style="font-size: 8.5px; font-weight: bold; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              ${bale.supplierName || 'Textile Exporter'}
            </div>
          </div>
        </div>

        <div class="bale-id-banner">
          <div class="bale-id-text">${bale.baleCode}</div>
          <div class="category-badge">${bale.category}</div>
        </div>

        <div class="codes-row">
          <div class="barcode-col">
            <svg id="barcode-elem-${idx}"></svg>
          </div>
          <div class="qr-col" id="qr-elem-${idx}"></div>
        </div>

        <div class="metrics-grid">
          <div class="metric-box">
            <div class="metric-label">Gross Weight</div>
            <div class="metric-val">${Number(bale.grossWeightKg).toFixed(2)} KG</div>
          </div>
          <div class="metric-box">
            <div class="metric-label">Total Grams</div>
            <div class="metric-val">${grossGrams.toLocaleString()} g</div>
          </div>
          <div class="metric-box">
            <div class="metric-label">Cost / Gram</div>
            <div class="metric-val">AED ${Number(costPerGram).toFixed(4)}</div>
          </div>
        </div>

        <div class="status-row">
          <span>STATUS: <strong>${status}</strong></span>
          <span>TAG: <strong>${bale.index} OF ${bale.totalCount || totalBalesCount}</strong></span>
        </div>
      </div>
    </div>`;
  }).join('\n');

  const scriptsData = JSON.stringify(bales.map(b => ({
    baleCode: b.baleCode,
    category: b.category,
    wtKg: b.grossWeightKg,
    inv: b.purchaseInvoiceNo || ''
  })));

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Batch Bale Thermal Labels (${totalBalesCount} Labels)</title>
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"></script>
  <style>
    @media print {
      @page {
        size: 100mm 50mm;
        margin: 0;
      }
      body {
        margin: 0 !important;
        padding: 0 !important;
        background: #fff !important;
      }
      .toolbar {
        display: none !important;
      }
      .tag-page {
        page-break-after: always !important;
        break-after: page !important;
        width: 100mm !important;
        height: 50mm !important;
        padding: 2mm !important;
        margin: 0 !important;
        box-sizing: border-box !important;
      }
      .tag-card {
        border: none !important;
        box-shadow: none !important;
        margin: 0 !important;
        width: 100% !important;
        height: 100% !important;
      }
    }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #f1f5f9;
      margin: 0;
      padding: 12px;
    }
    .toolbar {
      background: #0f172a;
      color: #fff;
      padding: 10px 14px;
      border-radius: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      font-weight: bold;
      margin-bottom: 16px;
      position: sticky;
      top: 10px;
      z-index: 50;
    }
    .btn {
      border: none;
      padding: 6px 14px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: bold;
      cursor: pointer;
    }
    .btn-print { background: #d97706; color: #fff; margin-right: 6px; }
    .btn-close { background: #475569; color: #fff; }
    .tag-page {
      margin: 0 auto 16px auto;
      max-width: 440px;
    }
    .tag-card {
      background: #fff;
      border: 2px solid #000;
      border-radius: 4px;
      padding: 8px 10px;
      color: #000;
    }
    .header-row {
      display: flex;
      justify-content: space-between;
      border-bottom: 2px solid #000;
      padding-bottom: 3px;
      margin-bottom: 4px;
    }
    .brand-title { font-size: 10.5px; font-weight: 900; letter-spacing: 0.5px; }
    .factory-ref { font-size: 8.5px; font-family: monospace; font-weight: bold; }
    .bale-id-banner { text-align: center; margin: 4px 0; }
    .bale-id-text { font-size: 24px; font-weight: 900; font-family: monospace; letter-spacing: 1.5px; line-height: 1.1; }
    .category-badge { display: inline-block; background: #000; color: #fff; font-size: 9.5px; font-weight: 800; text-transform: uppercase; padding: 1.5px 7px; border-radius: 3px; margin-top: 2px; }
    .codes-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 4px 0; border-top: 1px dashed #666; border-bottom: 1px dashed #666; padding: 4px 0; }
    .barcode-col { flex: 1; text-align: center; }
    .barcode-col svg { width: 100%; max-height: 38px; }
    .qr-col { width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; }
    .metrics-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; text-align: center; margin-top: 4px; font-family: monospace; }
    .metric-box { border: 1px solid #000; padding: 2.5px 2px; }
    .metric-label { font-size: 7.5px; font-weight: bold; text-transform: uppercase; color: #444; }
    .metric-val { font-size: 10.5px; font-weight: 900; }
    .status-row { display: flex; justify-content: space-between; font-size: 8px; font-weight: bold; margin-top: 4px; padding-top: 3px; border-top: 1px solid #000; }
  </style>
</head>
<body>
  <div class="toolbar">
    <span>🏷️ Batch Bale Thermal Labels &bull; ${totalBalesCount} Labels Ready for 4"x2" Printing</span>
    <div>
      <button class="btn btn-print" onclick="window.print()">Print All ${totalBalesCount} Labels</button>
      <button class="btn btn-close" onclick="window.close()">Close</button>
    </div>
  </div>

  ${cardsHtml}

  <script>
    const items = ${scriptsData};
    items.forEach((item, idx) => {
      try {
        JsBarcode("#barcode-elem-" + idx, item.baleCode, {
          format: "CODE128",
          width: 1.5,
          height: 36,
          displayValue: true,
          fontSize: 9,
          margin: 1
        });
        var qr = qrcode(4, 'L');
        qr.addData(JSON.stringify({
          bale: item.baleCode,
          cat: item.category,
          wtKg: item.wtKg,
          inv: item.inv
        }));
        qr.make();
        const qrContainer = document.getElementById('qr-elem-' + idx);
        if (qrContainer) qrContainer.innerHTML = qr.createImgTag(1.8, 1.8);
      } catch(e) {
        console.error('Barcode error for ' + item.baleCode, e);
      }
    });

    window.addEventListener('afterprint', function() {
      setTimeout(function() {
        try { window.close(); } catch(e) {}
      }, 350);
    });
    window.addEventListener('load', function() {
      setTimeout(function() {
        window.print();
      }, 300);
    });
  </script>
</body>
</html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
  return win;
}

export interface GiftReceiptData {
  invoiceNo: string;
  date: string;
  companyName?: string;
  trn?: string;
  customerName?: string;
  giftMessage?: string;
  items: Array<{
    description: string;
    barcode: string;
    brand?: string;
    size?: string;
  }>;
}

export function openGiftReceiptPrintWindow(data: GiftReceiptData): Window | null {
  const win = window.open('', '_blank', 'width=440,height=650,resizable=yes,scrollbars=yes');
  if (!win) {
    alert('Popup blocked by browser. Please allow popups to print gift receipts.');
    return null;
  }

  const itemsHtml = data.items.map((it) => `
    <tr>
      <td style="padding: 5px 0; border-bottom: 1px dashed #ccc;">
        <div style="font-weight: bold; font-size: 11px;">${it.description}</div>
        <div style="font-size: 9px; color: #555; font-family: monospace;">SKU: ${it.barcode} ${it.size ? `• Size: ${it.size}` : ''}</div>
      </td>
      <td style="padding: 5px 0; border-bottom: 1px dashed #ccc; text-align: right; font-weight: bold; font-size: 10px;">
        *** GIFT ***
      </td>
    </tr>
  `).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Gift Receipt - ${data.invoiceNo}</title>
  <style>
    @page {
      size: 80mm auto;
      margin: 0;
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #f1f5f9;
      color: #000;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace, sans-serif;
      font-size: 10px;
      line-height: 1.3;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .gift-container {
      width: 76mm;
      max-width: 76mm;
      margin: 0 auto;
      background: #ffffff;
      padding: 10px 8px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }
    .text-center { text-align: center; }
    .header { border-bottom: 2px dashed #000; padding-bottom: 8px; margin-bottom: 8px; }
    .title { font-size: 13px; font-weight: 900; letter-spacing: 0.5px; text-transform: uppercase; }
    .gift-badge {
      display: inline-block;
      border: 1.5px solid #000;
      padding: 3px 10px;
      font-weight: 900;
      font-size: 11px;
      margin: 5px 0;
      border-radius: 4px;
      background: #000;
      color: #fff;
      letter-spacing: 0.5px;
    }
    .info { font-size: 9px; line-height: 1.4; }
    .gift-msg-box {
      border: 1.5px solid #000;
      border-radius: 6px;
      padding: 8px;
      margin: 8px 0;
      background: #fafafa;
      text-align: center;
      font-style: italic;
      font-size: 10px;
    }
    .table { width: 100%; border-collapse: collapse; margin: 6px 0; }
    .policy-box {
      border-top: 2px dashed #000;
      padding-top: 8px;
      margin-top: 8px;
      font-size: 8.5px;
      line-height: 1.35;
      text-align: center;
    }
    @media print {
      .no-print { display: none !important; }
      html, body {
        background: #ffffff !important;
        width: 76mm !important;
        margin: 0 auto !important;
        padding: 0 !important;
      }
      .gift-container {
        width: 76mm !important;
        max-width: 76mm !important;
        margin: 0 auto !important;
        padding: 2mm 1mm !important;
        box-shadow: none !important;
      }
    }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; background: #0f172a; color: #fff; padding: 8px 12px; border-radius: 6px;">
    <span style="font-weight: bold; font-size: 11px;">80mm Gift Receipt (${data.invoiceNo})</span>
    <div>
      <button onclick="window.print()" style="padding: 6px 14px; font-weight: bold; background: #f59e0b; color: #000; border: none; border-radius: 4px; cursor: pointer; margin-right: 6px;">Print Gift Slip</button>
      <button onclick="window.close()" style="padding: 6px 12px; background: #475569; color: #fff; border: none; border-radius: 4px; cursor: pointer;">Close</button>
    </div>
  </div>

  <div class="gift-container">
    <div class="header text-center">
      <div class="title">${data.companyName || 'VINTAGE VIBES DUBAI'}</div>
      <div style="font-size: 8.5px; color: #444;">Al Quoz Industrial 3, Dubai &bull; TRN: ${data.trn || '100482910300003'}</div>
      <div class="gift-badge">🎁 GIFT RECEIPT</div>
      <div class="info">
        <div>Ref: <strong>${data.invoiceNo}</strong></div>
        <div>Date: <strong>${data.date}</strong></div>
        ${data.customerName ? `<div>Gifted By: <strong>${data.customerName}</strong></div>` : ''}
      </div>
    </div>

    ${data.giftMessage ? `
      <div class="gift-msg-box">
        <div style="font-size: 8.5px; font-weight: bold; text-transform: uppercase; color: #666; margin-bottom: 2px;">A Special Gift For You:</div>
        "${data.giftMessage}"
      </div>
    ` : ''}

    <table class="table">
      <thead>
        <tr style="border-bottom: 1px solid #000; font-size: 8.5px; text-transform: uppercase;">
          <th style="text-align: left; padding-bottom: 3px;">Item Description</th>
          <th style="text-align: right; padding-bottom: 3px;">Price</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
    </table>

    <div class="policy-box">
      <div style="font-weight: 900; margin-bottom: 3px;">★ 14-DAY EXCHANGE POLICY ★</div>
      <div>Items may be exchanged within 14 days of purchase date.</div>
      <div>Garment security tags and barcodes must remain intact.</div>
      <div>No cash refund. Exchange or Store Credit only.</div>
      <div style="margin-top: 5px; font-weight: bold;">Thank you for shopping vintage authenticated grails!</div>
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
          console.warn('[GiftReceipt] Print error:', e);
        }
      }
      window.addEventListener('afterprint', function() {
        setTimeout(function() {
          try { window.close(); } catch(e) {}
        }, 350);
      });
      function initPrint() {
        if (document.fonts && document.fonts.ready) {
          document.fonts.ready.then(function() {
            requestAnimationFrame(function() {
              setTimeout(doPrint, 50);
            });
          }).catch(function() {
            setTimeout(doPrint, 60);
          });
        } else {
          requestAnimationFrame(function() {
            setTimeout(doPrint, 60);
          });
        }
      }
      if (document.readyState === 'complete') {
        initPrint();
      } else {
        window.addEventListener('load', initPrint);
        setTimeout(doPrint, 350);
      }
    })();
  </script>
</body>
</html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
  return win;
}

export interface PosThermalReceiptData {
  invoiceNo: string;
  date: string;
  customerName?: string;
  customerPhone?: string;
  cashierName?: string;
  paymentMethod?: string;
  logoUrl?: string;
  companyName?: string;
  trn?: string;
  address?: string;
  items: Array<{
    description: string;
    barcode?: string;
    unitPrice?: number;
    discount?: number;
    finalAmount: number;
    quantity?: number;
  }>;
  subTotal: number;
  discountAmount?: number;
  vatAmount: number;
  totalAmount: number;
  tenderedAmount?: number;
  changeDue?: number;
}

export function generatePosBarcodeSvg(barcodeText: string): string {
  try {
    if (typeof document !== 'undefined') {
      const svgElem = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      JsBarcode(svgElem, barcodeText || 'POS-REC', {
        format: 'CODE128',
        width: 1.6,
        height: 34,
        displayValue: true,
        fontSize: 9,
        margin: 2
      });
      return svgElem.outerHTML;
    }
  } catch (e) {
    console.warn('[ThermalPrinter] Barcode SVG generation fallback:', e);
  }
  return `<div style="font-family:monospace;font-size:10px;text-align:center;padding:4px 0;letter-spacing:1px;">*${barcodeText}*</div>`;
}

export function openPosThermalReceiptPrintWindow(data: PosThermalReceiptData): Window | null {
  const win = window.open('', '_blank', 'width=460,height=720,resizable=yes,scrollbars=yes');
  if (!win) {
    alert('Popup blocked by browser. Please allow popups to print POS thermal receipts.');
    return null;
  }

  const barcodeSvgHtml = generatePosBarcodeSvg(data.invoiceNo);

  const isDefaultLogo = !data.logoUrl || data.logoUrl.includes('vintage_logo.svg') || data.logoUrl.includes('vintage_vibes_seal.svg');
  const resolvedLogoUrl = data.logoUrl
    ? (data.logoUrl.startsWith('http') || data.logoUrl.startsWith('data:')
        ? data.logoUrl
        : `${typeof window !== 'undefined' ? window.location.origin : ''}${data.logoUrl.startsWith('/') ? '' : '/'}${data.logoUrl}`)
    : '';

  const logoMarkup = !isDefaultLogo && resolvedLogoUrl
    ? `<img src="${resolvedLogoUrl}" class="receipt-logo" alt="Company Logo" onerror="this.style.display='none'" />`
    : `<div class="receipt-logo-inline" style="text-align:center;margin-bottom:4px;">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 38" width="130" height="22" style="display:inline-block;">
          <text x="120" y="18" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="15" font-weight="900" letter-spacing="2" text-anchor="middle" fill="#000">VINTAGE VIBES</text>
          <text x="120" y="32" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="8.5" font-weight="700" letter-spacing="3" text-anchor="middle" fill="#333">DUBAI &bull; ARCHIVE</text>
        </svg>
      </div>`;

  const safeItems = Array.isArray(data.items) ? data.items : [];
  const itemsHtml = safeItems.map((it) => {
    const qty = it.quantity || 1;
    const unitP = Number(it.unitPrice ?? it.finalAmount ?? 0).toFixed(2);
    const lineTotal = Number(it.finalAmount ?? 0).toFixed(2);
    const disc = Number(it.discount ?? 0);
    return `
      <tr>
        <td style="padding: 4px 0; border-bottom: 1px dashed #ddd; vertical-align: top;">
          <div style="font-weight: 800; font-size: 10px; text-transform: uppercase;">${it.description}</div>
          <div style="font-size: 8.5px; color: #555; font-family: monospace;">SKU: ${it.barcode || 'N/A'} ${qty > 1 ? `&times; ${qty} @ AED ${unitP}` : ''}</div>
          ${disc > 0 ? `<div style="font-size: 8px; color: #b91c1c;">Disc: -AED ${disc.toFixed(2)}</div>` : ''}
        </td>
        <td style="padding: 4px 0; border-bottom: 1px dashed #ddd; text-align: right; font-weight: 900; font-size: 10.5px; vertical-align: top; white-space: nowrap;">
          AED ${lineTotal}
        </td>
      </tr>
    `;
  }).join('');

  const displayDate = data.date ? new Date(data.date).toLocaleString('en-GB', { hour12: true }) : new Date().toLocaleString();
  const customerName = (data.customerName || 'Walk-In Customer').trim();
  const customerPhone = (data.customerPhone || '').trim();

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Receipt - ${data.invoiceNo}</title>
  <style>
    @page {
      size: 80mm auto;
      margin: 0;
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #f1f5f9;
      color: #000;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Courier New", monospace, sans-serif;
      font-size: 10px;
      line-height: 1.3;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .receipt-container {
      width: 76mm;
      max-width: 76mm;
      margin: 0 auto;
      background: #ffffff;
      padding: 10px 8px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .header {
      border-bottom: 2px dashed #000;
      padding-bottom: 8px;
      margin-bottom: 8px;
    }
    .receipt-logo {
      max-width: 130px;
      max-height: 48px;
      object-fit: contain;
      margin: 0 auto 4px auto;
      display: block;
    }
    .store-name {
      font-size: 13px;
      font-weight: 900;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .store-sub {
      font-size: 8px;
      color: #333;
      margin-top: 2px;
    }
    .tax-badge {
      display: inline-block;
      border: 1px solid #000;
      padding: 2px 8px;
      font-weight: 900;
      font-size: 9px;
      margin: 5px 0 3px 0;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .meta-box {
      border-bottom: 1px dashed #000;
      padding-bottom: 6px;
      margin-bottom: 6px;
      font-size: 9px;
    }
    .customer-box {
      border: 1.5px solid #000;
      background: #f8fafc;
      padding: 5px 8px;
      margin-bottom: 8px;
      font-size: 9px;
      border-radius: 4px;
    }
    .customer-title {
      font-size: 8px;
      font-weight: 900;
      text-transform: uppercase;
      color: #444;
      border-bottom: 1px solid #ccc;
      padding-bottom: 2px;
      margin-bottom: 3px;
    }
    .table {
      width: 100%;
      border-collapse: collapse;
      margin: 6px 0;
    }
    .totals-box {
      border-top: 2px dashed #000;
      border-bottom: 2px solid #000;
      padding: 6px 0;
      margin: 8px 0;
      font-size: 9.5px;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 3px;
    }
    .grand-total {
      font-size: 13px;
      font-weight: 900;
      border-top: 1px solid #000;
      padding-top: 4px;
      margin-top: 4px;
    }
    .barcode-section {
      text-align: center;
      margin: 8px 0 4px 0;
    }
    .barcode-section svg {
      max-width: 100%;
      height: 38px;
    }
    .footer-policy {
      border-top: 1px dashed #888;
      padding-top: 6px;
      margin-top: 6px;
      font-size: 8px;
      text-align: center;
      line-height: 1.35;
      color: #222;
    }
    @media print {
      .no-print { display: none !important; }
      html, body {
        background: #ffffff !important;
        width: 76mm !important;
        margin: 0 auto !important;
        padding: 0 !important;
      }
      .receipt-container {
        width: 76mm !important;
        max-width: 76mm !important;
        margin: 0 auto !important;
        padding: 2mm 1mm !important;
        box-shadow: none !important;
      }
    }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; background: #0f172a; color: #fff; padding: 8px 12px; border-radius: 6px;">
    <span style="font-weight: bold; font-size: 11px;">80mm POS Thermal Receipt (${data.invoiceNo})</span>
    <div>
      <button onclick="window.print()" style="padding: 6px 14px; font-weight: bold; background: #f59e0b; color: #000; border: none; border-radius: 4px; cursor: pointer; margin-right: 6px;">Print Receipt</button>
      <button onclick="window.close()" style="padding: 6px 12px; background: #475569; color: #fff; border: none; border-radius: 4px; cursor: pointer;">Close</button>
    </div>
  </div>

  <div class="receipt-container">
    <div class="header text-center">
      ${logoMarkup}
      <div class="store-name">${data.companyName || 'VINTAGE VIBES DUBAI'}</div>
      <div class="store-sub">${data.address || 'Al Quoz Industrial 3, Dubai, UAE'}</div>
      <div class="store-sub"><strong>TRN:</strong> ${data.trn || '100482910300003'}</div>
      <div class="tax-badge">TAX INVOICE / CASH MEMO</div>
    </div>

    <div class="meta-box">
      <div style="display: flex; justify-content: space-between;">
        <span><strong>INVOICE:</strong> ${data.invoiceNo}</span>
        <span><strong>PAYMENT:</strong> ${(data.paymentMethod || 'CASH').toUpperCase()}</span>
      </div>
      <div style="display: flex; justify-content: space-between; margin-top: 2px;">
        <span><strong>DATE:</strong> ${displayDate}</span>
        <span><strong>CASHIER:</strong> ${data.cashierName || 'Cashier 01'}</span>
      </div>
    </div>

    <div class="customer-box">
      <div class="customer-title">CUSTOMER INFORMATION</div>
      <div style="display: flex; justify-content: space-between;">
        <span><strong>NAME:</strong> ${customerName}</span>
        <span><strong>PHONE:</strong> ${customerPhone || 'N/A'}</span>
      </div>
    </div>

    <table class="table">
      <thead>
        <tr style="border-bottom: 1px solid #000; font-size: 8.5px; text-transform: uppercase;">
          <th style="text-align: left; padding-bottom: 3px;">Item &amp; Description</th>
          <th style="text-align: right; padding-bottom: 3px;">Amount (AED)</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
    </table>

    <div class="totals-box">
      <div class="total-row">
        <span>Subtotal (Excl. VAT):</span>
        <span>AED ${Number(data.subTotal || 0).toFixed(2)}</span>
      </div>
      ${Number(data.discountAmount || 0) > 0 ? `
      <div class="total-row" style="color: #b91c1c;">
        <span>Discount:</span>
        <span>-AED ${Number(data.discountAmount).toFixed(2)}</span>
      </div>` : ''}
      <div class="total-row">
        <span>UAE VAT 5%:</span>
        <span>AED ${Number(data.vatAmount || 0).toFixed(2)}</span>
      </div>
      <div class="total-row grand-total">
        <span>NET TOTAL (AED):</span>
        <span>AED ${Number(data.totalAmount || 0).toFixed(2)}</span>
      </div>
      ${Number(data.tenderedAmount || 0) > 0 ? `
      <div class="total-row" style="margin-top: 4px; font-size: 8.5px; color: #444;">
        <span>Tendered (${data.paymentMethod}):</span>
        <span>AED ${Number(data.tenderedAmount).toFixed(2)}</span>
      </div>
      <div class="total-row" style="font-size: 8.5px; color: #444;">
        <span>Change Due:</span>
        <span>AED ${Number(data.changeDue || 0).toFixed(2)}</span>
      </div>` : ''}
    </div>

    <div class="barcode-section">
      ${barcodeSvgHtml}
    </div>

    <div class="footer-policy">
      <div style="font-weight: 800;">★ 14-DAY EXCHANGE POLICY ★</div>
      <div>Items may be exchanged within 14 days of purchase.</div>
      <div>Security tag &amp; barcode must remain attached. No cash refunds.</div>
      <div style="margin-top: 4px; font-weight: 900; letter-spacing: 0.5px;">THANK YOU FOR SHOPPING VINTAGE VIBES!</div>
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
          console.warn('[POS Thermal Print] Window print failed:', e);
        }
      }

      // Automatically close the popup window after printing or cancelling
      window.addEventListener('afterprint', function() {
        setTimeout(function() {
          try { window.close(); } catch(e) {}
        }, 350);
      });

      // Synchronize with DOM paint & system font decoding
      function prepareAndPrint() {
        if (document.fonts && document.fonts.ready) {
          document.fonts.ready.then(function() {
            requestAnimationFrame(function() {
              setTimeout(doPrint, 50);
            });
          }).catch(function() {
            setTimeout(doPrint, 60);
          });
        } else {
          requestAnimationFrame(function() {
            setTimeout(doPrint, 60);
          });
        }
      }

      if (document.readyState === 'complete') {
        prepareAndPrint();
      } else {
        window.addEventListener('load', prepareAndPrint);
        // Fallback safety timeout so it never hangs if an external asset stalls
        setTimeout(doPrint, 350);
      }
    })();
  </script>
</body>
</html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
  return win;
}



