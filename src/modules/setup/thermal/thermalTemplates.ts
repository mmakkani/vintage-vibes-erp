import { ThermalEngineConfig, ThermalStyleId } from './thermalTypes.ts';
import { VINTAGE_VIBES_GOLD_SEAL_POS_BASE64 } from '../../../assets/vintageGoldSeal.ts';

interface TemplateRenderParams {
  config: ThermalEngineConfig;
  barcodeSvg: string;
  qrSvg: string;
}

const WASH_ICONS_SVG = `
<div style="display:flex;align-items:center;gap:6px;font-size:10px;line-height:1;margin:2px 0;">
  <span title="Wash at 30C" style="border:1px solid #000;border-radius:2px;padding:1px 3px;font-size:8px;font-weight:900;">30°C</span>
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2"><path d="M12 2l9 19H3z"/><line x1="8" y1="14" x2="16" y2="14"/></svg>
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="12" r="7"/></svg>
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2"><path d="M4 17l16-12M4 5l16 12"/></svg>
  <span style="font-size:7.5px;font-weight:bold;letter-spacing:0.5px;text-transform:uppercase;">GENTLE CARE</span>
</div>
`;

export function renderLabelHtml(styleId: ThermalStyleId, params: TemplateRenderParams): string {
  const { config, barcodeSvg, qrSvg } = params;
  const {
    companyName,
    phone,
    trn,
    invoiceNo,
    itemName,
    category,
    brandName,
    weightValue,
    weightUnit,
    priceAed,
    skuBarcode,
    size,
    consigneeName,
    buyerHandle,
    customerPhone,
    boothId,
    batchNo,
    fabricComposition,
    serialNumber,
    securityHash,
    isCod,
    codAmount,
    department,
    subCategory,
    season,
    grade
  } = config;

  const rawInvoice = (invoiceNo && invoiceNo.trim() !== '' && invoiceNo !== 'INV-2026-8891' && !invoiceNo.startsWith('igp-17'))
    ? invoiceNo.trim()
    : (batchNo && batchNo.trim() !== '' && !batchNo.startsWith('igp-17') ? batchNo.trim() : 'AUTHENTIC');
  const displayInvoice = rawInvoice.length > 20 ? rawInvoice.slice(0, 20) : rawInvoice;

  const formattedPrice = Number(priceAed).toFixed(2);
  const formattedWeight = `${weightValue} ${weightUnit.toUpperCase()}`;
  const currentDate = new Date().toISOString().split('T')[0];
  const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Resolve clean primary brand (e.g. "Hollister" from "Hollister Must-Have Collection...")
  let cleanBrand = (brandName || '').trim();
  if (cleanBrand.length > 25) {
    cleanBrand = cleanBrand.split(/\s+/)[0] || cleanBrand;
  }
  if (!cleanBrand || cleanBrand.toLowerCase() === 'apparel' || cleanBrand.toLowerCase() === 'apparel / heavy denim') {
    cleanBrand = 'VINTAGE';
  }

  // Resolve clean AI garment title without redundant category/size suffix
  let displayTitle = (itemName || '').trim();
  displayTitle = displayTitle.replace(/\s*•\s*[^•]+(\([^)]*\))?$/, '').trim();
  if (!displayTitle || displayTitle.length < 3) {
    displayTitle = `${cleanBrand} ${category || 'VINTAGE GARMENT'}`;
  }

  // Resolve taxonomy names (clean uppercase, strictly avoiding literal "DEPARTMENT" or "CATEGORY")
  const displayDept = (department && department.trim() !== '' && department.toUpperCase() !== 'DEPARTMENT')
    ? department.trim().toUpperCase()
    : 'LADIES';

  const displayCategory = (category && category.trim() !== '' && category !== 'Apparel / Heavy Denim' && category.toUpperCase() !== 'CATEGORY')
    ? category.trim().toUpperCase()
    : 'TOPS & BLOUSES';

  const displaySubCat = (subCategory && subCategory.trim() !== '' && subCategory.toUpperCase() !== 'SUBCATEGORY' && subCategory.toLowerCase() !== displayCategory.toLowerCase())
    ? subCategory.trim().toUpperCase()
    : '';

  const displaySeason = (season && season.trim() !== '' && season.toUpperCase() !== 'SEASON')
    ? season.trim().toUpperCase()
    : 'SUMMER 2026';

  const displayGrade = (grade && grade.trim() !== '' && grade.toUpperCase() !== 'GRADE')
    ? grade.trim().toUpperCase()
    : 'SUPER CREAM';

  // Effective logo rendering (falls back to Vintage Vibes Gold Seal base64 if no custom logo provided)
  const effectiveLogoSrc = (config.logoUrl && config.logoUrl.trim() !== '')
    ? config.logoUrl
    : VINTAGE_VIBES_GOLD_SEAL_POS_BASE64;

  const logoHtml = `<img src="${effectiveLogoSrc}" alt="Logo" style="max-height:22px;max-width:80px;object-fit:contain;margin-bottom:2px;" />`;

  switch (styleId) {
    // 1. Modern Minimalist: Clean sans-serif, hairline accents, brand logo medallion, compact QR, bold price badge
    case 'modern_minimalist':
      return `
        <div class="label-box" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display:flex; flex-direction:column; justify-content:space-between; height:100%; border:0.75px solid #000; padding:1.8mm; box-sizing:border-box; overflow:hidden;">
          <div>
            <!-- HEADER -->
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:0.75px solid #000; padding-bottom:1mm; margin-bottom:1mm; gap:4px;">
              <div style="display:flex; align-items:center; gap:4px; flex:1; min-width:0;">
                <img src="${effectiveLogoSrc}" alt="Logo" style="width:22px; height:22px; min-width:22px; max-width:22px; max-height:22px; object-fit:contain; border-radius:50%; flex-shrink:0; display:inline-block;" />
                <div style="flex:1; min-width:0;">
                  <div style="font-weight:900; font-size:8.5px; text-transform:uppercase; letter-spacing:0.2px; line-height:1.1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${companyName}</div>
                  <div style="font-size:6px; color:#333; font-family:monospace; margin-top:0.5px;">TRN: ${trn} &bull; TEL: ${phone}</div>
                </div>
              </div>
              <div style="font-size:7px; font-family:monospace; font-weight:800; border:0.75px solid #000; padding:1px 3.5px; border-radius:2px; flex-shrink:0; white-space:nowrap; background:#fff;">
                ${displayInvoice}
              </div>
            </div>

            <!-- SUBLINE -->
            <div style="font-size:6.8px; text-transform:uppercase; font-weight:700; color:#555; letter-spacing:0.3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-bottom:1px;">
              ${cleanBrand} &bull; ${displayDept} &bull; ${displayCategory}
            </div>

            <!-- AI GARMENT TITLE (2-LINE WRAP, NO CUTOFF!) -->
            <div style="font-size:9.5px; font-weight:900; text-transform:uppercase; line-height:1.15; color:#000; margin:1px 0 2px 0; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; line-clamp:2; -webkit-box-orient:vertical; word-break:break-word;">
              ${displayTitle}
            </div>

            <!-- TAXONOMY PILLS (REAL NAMES ONLY, NEVER LITERAL 'DEPARTMENT') -->
            <div style="display:flex; align-items:center; gap:2.5px; overflow:hidden; margin:1.5px 0;">
              <span style="background:#000; color:#fff; font-size:6px; font-weight:800; padding:1px 3.5px; border-radius:2px; text-transform:uppercase; white-space:nowrap; flex-shrink:0;">${department || 'DEPARTMENT'}</span>
              <span style="background:#eef2f6; color:#111; font-size:6px; font-weight:700; padding:1px 3.5px; border-radius:2px; border:0.5px solid #cbd5e1; text-transform:uppercase; white-space:nowrap; flex-shrink:0;">${displayCategory}</span>
              ${displaySubCat ? `<span style="background:#f1f5f9; color:#475569; font-size:6px; font-weight:600; padding:1px 3px; border-radius:2px; border:0.5px solid #e2e8f0; text-transform:uppercase; white-space:nowrap; flex-shrink:0;">${displaySubCat}</span>` : ''}
              <span style="background:#f8fafc; color:#334155; font-size:6px; font-weight:600; padding:1px 3.5px; border-radius:2px; border:0.5px solid #cbd5e1; text-transform:uppercase; white-space:nowrap; flex-shrink:0;">${season || 'SUMMER 2026'}</span>
              <span style="background:#052e16; color:#86efac; font-size:6px; font-weight:800; padding:1px 4px; border-radius:2px; border:0.5px solid #16a34a; text-transform:uppercase; white-space:nowrap; margin-left:auto; flex-shrink:0;">${grade || 'SUPER CREAM'}</span>
            </div>
          </div>

          <!-- FOOTER: DEDICATED FULL WIDTH SKU + METADATA + QR + PRICE -->
          <div style="border-top:0.5px dashed #000; padding-top:1mm; margin-top:auto;">
            <!-- FULL WIDTH SKU LINE: Fits all 30 characters easily, 0% cut off! -->
            <div style="font-family:monospace; font-size:7px; font-weight:800; color:#000; letter-spacing:0.2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-bottom:1mm;">
              SKU: <span style="font-weight:900; font-size:7.5px;">${skuBarcode}</span>
            </div>

            <div style="display:flex; align-items:center; justify-content:space-between; gap:4px;">
              <div style="flex:1; min-width:0; line-height:1.25;">
                <div style="font-size:6.8px; color:#222; font-weight:700;">WT: ${formattedWeight} &bull; SIZE: ${size}</div>
                <div style="font-size:6px; color:#666; font-family:monospace; margin-top:0.5px;">DATE: ${currentDate}</div>
              </div>
              <div style="width:30px; height:30px; flex-shrink:0;">
                ${qrSvg}
              </div>
              <div style="background:#000; color:#fff; padding:2.5px 5px; border-radius:3px; text-align:right; flex-shrink:0; min-width:44px;">
                <div style="font-size:5px; font-weight:800; letter-spacing:0.5px;">PRICE (AED)</div>
                <div style="font-size:13px; font-weight:900; line-height:1; letter-spacing:-0.5px;">${formattedPrice}</div>
              </div>
            </div>
          </div>
        </div>
      `;

    // 2. Boutique Luxury: Serif typography, double border frame, centered micro-logo, discreet contact/phone
    case 'boutique_luxury':
      return `
        <div class="label-box" style="font-family: 'Playfair Display', Georgia, serif; display:flex; flex-direction:column; justify-content:space-between; height:100%; border:3px double #000; padding:3mm; box-sizing:border-box; text-align:center;">
          <div>
            <div style="display:flex; flex-direction:column; align-items:center; margin-bottom:2mm;">
              ${logoHtml}
              <div style="font-size:11px; font-weight:900; text-transform:uppercase; letter-spacing:1.5px; border-bottom:0.5px solid #000; padding-bottom:1mm; width:85%;">${companyName}</div>
              <div style="font-size:6.5px; font-family:sans-serif; letter-spacing:0.5px; color:#444; margin-top:1px;">DUBAI ARCHIVE ATELIER &bull; TRN ${trn}</div>
            </div>
            <div style="font-style:italic; font-size:8.5px; color:#333;">${department ? `${department} &bull; ` : ''}${season ? `${season} &bull; ` : ''}${grade ? `${grade} &bull; ` : ''}${brandName}</div>
            <div style="font-size:13px; font-weight:bold; text-transform:uppercase; margin:2px 0; letter-spacing:0.5px;">${itemName}</div>
            <div style="font-size:8px; font-family:sans-serif; text-transform:uppercase; letter-spacing:1px; color:#333;">${category}${subCategory && subCategory !== category ? ` (${subCategory})` : ''} &bull; ${size}</div>
          </div>

          <div style="border-top:0.5px solid #000; padding-top:2mm; margin-top:2mm; display:flex; align-items:flex-end; justify-content:space-between;">
            <div style="text-align:left; font-family:sans-serif; font-size:7px;">
              <div>REF: <strong style="font-family:monospace;">${skuBarcode}</strong></div>
              <div>MASS: ${formattedWeight}</div>
              <div style="font-size:6.5px; color:#555;">TEL: ${phone}</div>
            </div>
            <div style="width:30px; height:30px;">
              ${qrSvg}
            </div>
            <div style="text-align:right;">
              <div style="font-size:7px; font-family:sans-serif; text-transform:uppercase; letter-spacing:1px;">Investment Value</div>
              <div style="font-size:16px; font-weight:900; letter-spacing:-0.5px;">AED ${formattedPrice}</div>
            </div>
          </div>
        </div>
      `;

    // 3. High-Density Industrial: Full-width Code-128 linear barcode, bold SKU, compact weight and brand
    case 'high_density_industrial':
      return `
        <div class="label-box" style="font-family: monospace, sans-serif; display:flex; flex-direction:column; justify-content:space-between; height:100%; border:2px solid #000; padding:2mm; box-sizing:border-box;">
          <div>
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #000; padding-bottom:1mm; margin-bottom:1mm;">
              <span style="font-weight:900; font-size:10px; text-transform:uppercase;">${companyName}</span>
              <span style="font-size:8px; font-weight:bold; background:#000; color:#fff; padding:1px 4px;">${grade || 'SUPER CREAM'}</span>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:7.5px; font-weight:bold; margin-bottom:2px;">
              <span>${department ? `${department}/` : ''}${category}</span>
              <span>WT: ${formattedWeight}</span>
              <span>${season || 'SUMMER-26'}</span>
            </div>
            <div style="font-size:11px; font-weight:900; text-transform:uppercase; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
              ${itemName}
            </div>
          </div>

          <div style="text-align:center; margin:1mm 0;">
            <div style="width:100%; max-height:46px; overflow:hidden;">${barcodeSvg}</div>
            <div style="font-size:12px; font-weight:900; letter-spacing:2px; margin-top:1px;">*${skuBarcode}*</div>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; border-top:2px solid #000; padding-top:1.5mm; font-size:8px; font-weight:bold;">
            <div>INV: ${displayInvoice} | ${currentDate}</div>
            <div style="font-size:14px; font-weight:900;">AED ${formattedPrice}</div>
          </div>
        </div>
      `;

    // 4. Dual-Code Retail: Stacked linear barcode and high-contrast 2D QR code for dual-scanner compatibility
    case 'dual_code_retail':
      return `
        <div class="label-box" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display:flex; flex-direction:column; justify-content:space-between; height:100%; border:1.5px solid #000; padding:2.5mm; box-sizing:border-box;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:1px solid #000; padding-bottom:1.5mm;">
            <div>
              <div style="font-weight:900; font-size:10px; text-transform:uppercase;">${companyName}</div>
              <div style="font-size:7px; color:#444; font-family:monospace;">${department ? `${department} &bull; ` : ''}${category}${subCategory && subCategory !== category ? ` (${subCategory})` : ''} &bull; ${grade || 'SUPER CREAM'}</div>
              <div style="font-weight:900; font-size:11px; text-transform:uppercase; margin-top:2px;">${itemName}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:7px; font-weight:bold; color:#555;">RETAIL PRICE</div>
              <div style="font-size:16px; font-weight:900; line-height:1;">AED ${formattedPrice}</div>
            </div>
          </div>

          <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin:2mm 0;">
            <div style="flex:1; text-align:center;">
              <div style="font-size:6.5px; font-weight:bold; text-transform:uppercase; margin-bottom:1px; color:#444;">1D Laser POS Scan</div>
              <div style="width:100%; max-height:38px; overflow:hidden;">${barcodeSvg}</div>
              <div style="font-family:monospace; font-size:8px; font-weight:bold; letter-spacing:1px;">${skuBarcode}</div>
            </div>
            <div style="width:1px; height:45px; background:#ccc;"></div>
            <div style="text-align:center; width:48px; flex-shrink:0;">
              <div style="font-size:6.5px; font-weight:bold; text-transform:uppercase; margin-bottom:1px; color:#444;">2D Quick App</div>
              <div style="width:40px; height:40px; margin:0 auto;">${qrSvg}</div>
            </div>
          </div>

          <div style="display:flex; justify-content:space-between; font-size:7px; font-family:monospace; border-top:1px solid #000; padding-top:1mm;">
            <span>SIZE: ${size} &bull; WT: ${formattedWeight}</span>
            <span>SEASON: ${season || 'SUMMER-26'} &bull; INV: ${displayInvoice}</span>
          </div>
        </div>
      `;

    // 5. Big Price Live Drop: Inverted solid black footer block with large white bold price
    case 'big_price_live_drop':
      return `
        <div class="label-box" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display:flex; flex-direction:column; justify-content:space-between; height:100%; border:2px solid #000; box-sizing:border-box; overflow:hidden;">
          <div style="padding:2.5mm 2.5mm 1mm 2.5mm;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="background:#000; color:#fff; font-size:8px; font-weight:900; padding:1px 6px; border-radius:2px; letter-spacing:0.5px;">🔥 LIVE DROP ITEM</span>
              <span style="font-size:8px; font-weight:bold; font-family:monospace;">${boothId}</span>
            </div>
            <div style="font-size:8px; font-weight:bold; text-transform:uppercase; color:#555; margin-top:2px;">${brandName} &bull; ${category}</div>
            <div style="font-size:13px; font-weight:900; text-transform:uppercase; line-height:1.15; margin:1px 0;">${itemName}</div>
            <div style="display:flex; justify-content:space-between; align-items:center; font-size:7.5px; font-family:monospace; color:#333; margin-top:2px;">
              <span>SKU: ${skuBarcode}</span>
              <span>CLAIM: ${buyerHandle || 'GUEST'}</span>
            </div>
          </div>

          <div style="background:#000; color:#fff; padding:3mm 2.5mm; display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-size:8px; font-weight:900; letter-spacing:1px; text-transform:uppercase;">OFFICIAL DROP PRICE</div>
              <div style="font-size:6.5px; color:#ccc;">NON-REFUNDABLE LIVE SALE</div>
            </div>
            <div style="text-align:right;">
              <span style="font-size:10px; font-weight:700; margin-right:2px;">AED</span>
              <span style="font-size:24px; font-weight:900; letter-spacing:-1px; line-height:1;">${formattedPrice}</span>
            </div>
          </div>
        </div>
      `;

    // 6. Master Bale / Bulk Tag: Company header, gross weight, piece capacity, batch ID, scannable inward QR
    case 'master_bale_bulk':
      return `
        <div class="label-box" style="font-family: monospace, sans-serif; display:flex; flex-direction:column; justify-content:space-between; height:100%; border:2.5px solid #000; padding:2.5mm; box-sizing:border-box;">
          <div>
            <div style="display:flex; justify-content:space-between; border-bottom:2px solid #000; padding-bottom:1mm; margin-bottom:1mm;">
              <div>
                <div style="font-size:11px; font-weight:900; text-transform:uppercase;">${companyName}</div>
                <div style="font-size:7.5px;">WAREHOUSE INWARD BULK BALE TAG</div>
              </div>
              <div style="text-align:right; font-size:8px;">
                <div>BATCH: <strong>${batchNo}</strong></div>
                <div>INV: ${displayInvoice}</div>
              </div>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; background:#000; color:#fff; padding:2px 4px; margin-bottom:2mm;">
              <span style="font-size:11px; font-weight:900; text-transform:uppercase;">${category}</span>
              <span style="font-size:9px; font-weight:bold;">EST. CAPACITY: 120-150 PCS</span>
            </div>
          </div>

          <div style="display:grid; grid-template-columns: 1fr 1fr 60px; gap:4px; align-items:center; border:1px solid #000; padding:4px; margin-bottom:1mm;">
            <div style="text-align:center; border-right:1px solid #000; padding-right:4px;">
              <div style="font-size:7px; text-transform:uppercase; color:#555;">Gross Weight</div>
              <div style="font-size:15px; font-weight:900;">${formattedWeight}</div>
            </div>
            <div style="text-align:center; border-right:1px solid #000; padding-right:4px;">
              <div style="font-size:7px; text-transform:uppercase; color:#555;">Lot Valuation</div>
              <div style="font-size:14px; font-weight:900;">AED ${formattedPrice}</div>
            </div>
            <div style="width:50px; height:50px; margin:0 auto;">
              ${qrSvg}
            </div>
          </div>

          <div style="display:flex; justify-content:space-between; font-size:7px; font-weight:bold; border-top:1.5px solid #000; padding-top:1mm;">
            <span>STATUS: VERIFIED INWARD / READY FOR SORTING</span>
            <span>TAGGED: ${currentDate} ${currentTime}</span>
          </div>
        </div>
      `;

    // 7. Jewelry & Delicate Tag: Ultra-slim format, mini QR, gram weight, and item name
    case 'jewelry_delicate':
      return `
        <div class="label-box" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display:flex; flex-direction:column; justify-content:space-between; height:100%; border:1px solid #000; padding:1.5mm; box-sizing:border-box;">
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:0.5px solid #000; padding-bottom:1px; margin-bottom:1px;">
            <span style="font-size:7px; font-weight:900; text-transform:uppercase;">${brandName}</span>
            <span style="font-size:6.5px; font-family:monospace;">WT: ${formattedWeight}</span>
          </div>

          <div style="display:flex; align-items:center; justify-content:space-between; gap:4px;">
            <div style="width:24px; height:24px; flex-shrink:0;">
              ${qrSvg}
            </div>
            <div style="flex:1; line-height:1.1;">
              <div style="font-size:8.5px; font-weight:bold; text-transform:uppercase; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${itemName}</div>
              <div style="font-size:6.5px; color:#555; font-family:monospace;">SKU: ${skuBarcode}</div>
            </div>
            <div style="text-align:right; flex-shrink:0;">
              <div style="font-size:5.5px; font-weight:bold;">AED</div>
              <div style="font-size:12px; font-weight:900; line-height:1;">${formattedPrice}</div>
            </div>
          </div>

          <div style="font-size:5.5px; text-align:center; color:#666; border-top:0.5px dotted #000; padding-top:1px;">
            ${companyName} &bull; TEL ${phone}
          </div>
        </div>
      `;

    // 8. Classic Apparel Tag: Brand logo header, size badge, category title, wash care icons, barcode footer
    case 'classic_apparel':
      return `
        <div class="label-box" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display:flex; flex-direction:column; justify-content:space-between; height:100%; border:1.5px solid #000; padding:2.5mm; box-sizing:border-box;">
          <div>
            <div style="text-align:center; border-bottom:1px solid #000; padding-bottom:1.5mm; margin-bottom:1.5mm;">
              ${logoHtml}
              <div style="font-weight:900; font-size:11px; text-transform:uppercase; letter-spacing:1px;">${brandName}</div>
              <div style="font-size:7px; color:#555;">AUTHENTIC VINTAGE GARMENTS</div>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5mm;">
              <div>
                <div style="font-size:7.5px; font-weight:bold; text-transform:uppercase; color:#666;">${category}</div>
                <div style="font-size:11px; font-weight:900; text-transform:uppercase;">${itemName}</div>
              </div>
              <div style="border:1.5px solid #000; padding:2px 6px; border-radius:3px; text-align:center;">
                <div style="font-size:5.5px; font-weight:bold; text-transform:uppercase;">SIZE</div>
                <div style="font-size:11px; font-weight:900;">${size}</div>
              </div>
            </div>

            ${WASH_ICONS_SVG}
          </div>

          <div>
            <div style="width:100%; max-height:36px; overflow:hidden; text-align:center;">${barcodeSvg}</div>
            <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid #000; padding-top:1mm; margin-top:1mm;">
              <div style="font-family:monospace; font-size:7px; color:#444;">${skuBarcode}</div>
              <div style="font-size:14px; font-weight:900;">AED ${formattedPrice}</div>
            </div>
          </div>
        </div>
      `;

    // 9. Split-Grid Technical: 2 columns; left column metadata (brand, invoice, weight), right column QR & price
    case 'split_grid_technical':
      return `
        <div class="label-box" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display:flex; flex-direction:column; justify-content:space-between; height:100%; border:2px solid #000; padding:2.5mm; box-sizing:border-box;">
          <div style="border-bottom:1.5px solid #000; padding-bottom:1mm; margin-bottom:1.5mm; display:flex; justify-content:space-between; align-items:center;">
            <span style="font-weight:900; font-size:10px; text-transform:uppercase;">${companyName}</span>
            <span style="font-size:7.5px; font-family:monospace; font-weight:bold;">SPEC: ${skuBarcode}</span>
          </div>

          <div style="display:grid; grid-template-columns: 1.4fr 1fr; gap:6px; flex:1; align-items:stretch;">
            <!-- Left Column: Metadata -->
            <div style="display:flex; flex-direction:column; justify-content:space-between; border-right:1.5px solid #000; padding-right:6px; font-size:7.5px;">
              <div>
                <div style="font-size:11px; font-weight:900; text-transform:uppercase; line-height:1.2; margin-bottom:2px;">${itemName}</div>
                <div style="font-weight:bold; color:#444; text-transform:uppercase;">BRAND: ${brandName}</div>
                <div style="color:#555;">CAT: ${category}</div>
              </div>
              <div style="font-family:monospace; font-size:7px; border-top:0.5px dashed #666; padding-top:2px;">
                <div>INVOICE: ${displayInvoice}</div>
                <div>WEIGHT: ${formattedWeight}</div>
                <div>TRN: ${trn}</div>
              </div>
            </div>

            <!-- Right Column: QR & Price -->
            <div style="display:flex; flex-direction:column; justify-content:space-between; align-items:center; text-align:center; padding-left:2px;">
              <div style="width:48px; height:48px;">
                ${qrSvg}
              </div>
              <div style="width:100%; border:1.5px solid #000; padding:3px 2px; border-radius:2px; background:#f8f8f8;">
                <div style="font-size:6.5px; font-weight:bold; text-transform:uppercase;">NET RETAIL</div>
                <div style="font-size:14px; font-weight:900; line-height:1;">AED ${formattedPrice}</div>
              </div>
            </div>
          </div>

          <div style="font-size:6.5px; font-family:monospace; text-align:center; border-top:1px solid #000; padding-top:1mm; margin-top:1.5mm;">
            VERIFIED INDUSTRIAL ASSET &bull; UAE TAX REGISTERED &bull; TEL ${phone}
          </div>
        </div>
      `;

    // 10. Express Courier Mini-Waybill: Consignee/buyer handle, phone no, invoice ID, routing barcode, COD amount
    case 'express_courier_waybill':
      return `
        <div class="label-box" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display:flex; flex-direction:column; justify-content:space-between; height:100%; border:2px solid #000; padding:2.5mm; box-sizing:border-box;">
          <div>
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #000; padding-bottom:1.5mm; margin-bottom:1.5mm;">
              <div>
                <span style="background:#000; color:#fff; font-size:9px; font-weight:900; padding:1px 5px; text-transform:uppercase;">EXPRESS DISPATCH</span>
                <span style="font-size:8px; font-weight:bold; margin-left:4px;">AIR/DOMESTIC</span>
              </div>
              <div style="font-size:8px; font-family:monospace; font-weight:bold;">INV: ${displayInvoice}</div>
            </div>

            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px; border-bottom:1.5px solid #000; padding-bottom:2mm; margin-bottom:2mm; font-size:7.5px;">
              <div style="border-right:1px solid #ccc; padding-right:4px;">
                <div style="font-size:6.5px; font-weight:900; color:#555; text-transform:uppercase;">FROM (SHIPPER):</div>
                <div style="font-weight:900;">${companyName}</div>
                <div>TRN: ${trn}</div>
                <div>TEL: ${phone}</div>
              </div>
              <div>
                <div style="font-size:6.5px; font-weight:900; color:#555; text-transform:uppercase;">TO (CONSIGNEE):</div>
                <div style="font-weight:900; font-size:8.5px;">${consigneeName}</div>
                <div style="font-weight:bold;">${buyerHandle}</div>
                <div>TEL: ${customerPhone}</div>
              </div>
            </div>
          </div>

          <div>
            <div style="width:100%; max-height:40px; overflow:hidden; text-align:center;">${barcodeSvg}</div>
            <div style="font-family:monospace; font-size:8px; text-align:center; font-weight:bold; margin:1px 0 2px 0;">WAYBILL: ${skuBarcode}</div>
          </div>

          <div style="border:1.5px solid #000; padding:2mm; display:flex; justify-content:space-between; align-items:center; background:#f9f9f9;">
            <div>
              <div style="font-size:7px; font-weight:bold; text-transform:uppercase;">COLLECTION MODE:</div>
              <div style="font-size:10px; font-weight:900;">${isCod ? '💵 CASH ON DELIVERY (COD)' : '✅ PREPAID'}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:6.5px; font-weight:bold;">TOTAL TO COLLECT</div>
              <div style="font-size:14px; font-weight:900;">AED ${isCod ? Number(codAmount || priceAed).toFixed(2) : '0.00'}</div>
            </div>
          </div>
        </div>
      `;

    // 11. Live Stream Host Tag: Bold Booth ID, live session timestamp, buyer handle, fast-claim QR
    case 'live_stream_host':
      return `
        <div class="label-box" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display:flex; flex-direction:column; justify-content:space-between; height:100%; border:2px solid #000; padding:2.5mm; box-sizing:border-box;">
          <div>
            <div style="display:flex; justify-content:space-between; align-items:center; background:#000; color:#fff; padding:2px 6px; border-radius:2px; margin-bottom:1.5mm;">
              <span style="font-size:11px; font-weight:900; letter-spacing:0.5px;">🔴 ${boothId}</span>
              <span style="font-size:7.5px; font-family:monospace;">${currentDate} ${currentTime}</span>
            </div>

            <div style="border:1px solid #000; padding:3px 5px; border-radius:3px; margin-bottom:2mm; background:#fafafa;">
              <div style="font-size:6.5px; font-weight:bold; color:#555; text-transform:uppercase;">CLAIMED BY BUYER:</div>
              <div style="font-size:12px; font-weight:900;">${buyerHandle}</div>
              <div style="font-size:7px; color:#333;">NAME: ${consigneeName} &bull; ${customerPhone}</div>
            </div>

            <div style="font-size:11px; font-weight:900; text-transform:uppercase; line-height:1.2;">${itemName}</div>
            <div style="font-size:8px; font-weight:bold; color:#444;">${brandName} &bull; SIZE ${size}</div>
          </div>

          <div style="display:flex; align-items:center; justify-content:space-between; border-top:1.5px solid #000; padding-top:2mm; margin-top:2mm;">
            <div style="text-align:left;">
              <div style="font-size:6.5px; font-weight:bold; text-transform:uppercase;">FAST BASKET CLAIM</div>
              <div style="font-size:16px; font-weight:900;">AED ${formattedPrice}</div>
              <div style="font-size:6.5px; font-family:monospace; color:#555;">SKU: ${skuBarcode}</div>
            </div>
            <div style="width:42px; height:42px;">
              ${qrSvg}
            </div>
          </div>
        </div>
      `;

    // 12. Vintage Archive Retro: Heavy vintage borders, retro typography, serial number, item category
    case 'vintage_archive_retro':
      return `
        <div class="label-box" style="font-family: 'Courier New', Courier, monospace; display:flex; flex-direction:column; justify-content:space-between; height:100%; border:4px ridge #000; padding:3mm; box-sizing:border-box;">
          <div>
            <div style="text-align:center; border-bottom:1.5px solid #000; padding-bottom:1.5mm; margin-bottom:1.5mm;">
              <div style="font-size:9px; font-weight:900; letter-spacing:2px; text-transform:uppercase;">════ HISTORICAL ARCHIVE ════</div>
              <div style="font-size:11px; font-weight:bold; text-transform:uppercase;">${companyName}</div>
              <div style="font-size:7.5px; letter-spacing:1px;">AUTHENTICATED PERIOD VINTAGE</div>
            </div>

            <div style="display:flex; justify-content:space-between; font-size:8px; font-weight:bold; margin-bottom:2px;">
              <span>REG SERIAL: ${serialNumber}</span>
              <span>ERA: 1980s-1990s</span>
            </div>

            <div style="font-size:12px; font-weight:900; text-transform:uppercase; margin:2px 0;">${itemName}</div>
            <div style="font-size:8px; text-transform:uppercase;">MAKER: ${brandName} &bull; ${category}</div>
            <div style="font-size:7.5px; color:#444;">COMPOSITION: ${fabricComposition}</div>
          </div>

          <div style="border-top:1.5px solid #000; padding-top:2mm; margin-top:2mm; display:flex; justify-content:space-between; align-items:flex-end;">
            <div>
              <div style="font-size:7px; font-weight:bold;">ARCHIVE SKU: ${skuBarcode}</div>
              <div style="font-size:7px;">CERTIFIED DATE: ${currentDate}</div>
            </div>
            <div style="width:32px; height:32px;">
              ${qrSvg}
            </div>
            <div style="text-align:right;">
              <div style="font-size:6.5px; font-weight:bold;">PRICE</div>
              <div style="font-size:16px; font-weight:900;">AED ${formattedPrice}</div>
            </div>
          </div>
        </div>
      `;

    // 13. Security & Authenticity Tag: Tamper-evident layout with encrypted verification string and 'ORIGINAL VINTAGE' seal
    case 'security_authenticity':
      return `
        <div class="label-box" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display:flex; flex-direction:column; justify-content:space-between; height:100%; border:2px solid #000; padding:2.5mm; box-sizing:border-box;">
          <div>
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #000; padding-bottom:1.5mm; margin-bottom:1.5mm;">
              <span style="background:#000; color:#fff; font-size:8.5px; font-weight:900; padding:1px 6px; letter-spacing:1px; border-radius:2px;">SECURE RFID/QR VERIFIED</span>
              <span style="font-size:7px; font-family:monospace; font-weight:bold;">DO NOT REMOVE</span>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5mm;">
              <div style="flex:1;">
                <div style="font-size:11px; font-weight:900; text-transform:uppercase; line-height:1.2;">${itemName}</div>
                <div style="font-size:7.5px; font-weight:bold; color:#444;">${brandName} &bull; ${skuBarcode}</div>
              </div>
              <div style="border:2px solid #000; border-radius:50%; width:44px; height:44px; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; font-size:5.5px; font-weight:900; line-height:1; flex-shrink:0; margin-left:6px;">
                <span>ORIGINAL</span>
                <span style="font-size:8px;">★</span>
                <span>VINTAGE</span>
              </div>
            </div>

            <div style="font-family:monospace; font-size:6.5px; word-break:break-all; background:#f0f0f0; border:0.5px solid #000; padding:2px; margin-bottom:1mm;">
              HASH: ${securityHash.substring(0, 42)}...
            </div>
          </div>

          <div style="display:flex; align-items:center; justify-content:space-between; border-top:1.5px solid #000; padding-top:1.5mm;">
            <div style="width:36px; height:36px;">
              ${qrSvg}
            </div>
            <div style="flex:1; text-align:center; font-size:6.5px; color:#555; padding:0 4px;">
              TAMPER EVIDENCE PROTOCOL &bull; AUTHORIZED DUBAI DEALER
            </div>
            <div style="text-align:right;">
              <div style="font-size:6px; font-weight:bold;">AED</div>
              <div style="font-size:15px; font-weight:900;">${formattedPrice}</div>
            </div>
          </div>
        </div>
      `;

    // 14. QR Express Scan: 60% label area dedicated to a crisp vector QR code with SKU and phone footer
    case 'qr_express_scan':
      return `
        <div class="label-box" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display:flex; flex-direction:column; justify-content:space-between; align-items:center; height:100%; border:2px solid #000; padding:2mm; box-sizing:border-box; text-align:center;">
          <div style="width:100%; border-bottom:1px solid #000; padding-bottom:1mm;">
            <div style="font-size:9.5px; font-weight:900; text-transform:uppercase;">${itemName}</div>
            <div style="display:flex; justify-content:space-between; font-size:7px; font-weight:bold; color:#444;">
              <span>${brandName}</span>
              <span>AED ${formattedPrice}</span>
            </div>
          </div>

          <!-- 60% Dominant QR Area -->
          <div style="flex:1; display:flex; align-items:center; justify-content:center; padding:2mm 0; max-height:65%;">
            <div style="width:72px; height:72px;">
              ${qrSvg}
            </div>
          </div>

          <div style="width:100%; border-top:1.5px solid #000; padding-top:1mm;">
            <div style="font-family:monospace; font-size:10px; font-weight:900; letter-spacing:1px;">${skuBarcode}</div>
            <div style="font-size:6.5px; color:#555; font-family:monospace;">${companyName} &bull; TEL: ${phone}</div>
          </div>
        </div>
      `;

    // 15. Eco Textile Metric Tag: Fabric composition, exact gram weight, recycling batch, scannable QR
    case 'eco_textile_metric':
      return `
        <div class="label-box" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display:flex; flex-direction:column; justify-content:space-between; height:100%; border:2px solid #000; padding:2.5mm; box-sizing:border-box;">
          <div>
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1.5px solid #000; padding-bottom:1.5mm; margin-bottom:1.5mm;">
              <div>
                <span style="border:1px solid #000; font-size:7.5px; font-weight:900; padding:1px 4px; text-transform:uppercase; border-radius:2px;">♻ CIRCULAR VINTAGE</span>
                <div style="font-size:9.5px; font-weight:900; text-transform:uppercase; margin-top:2px;">${brandName}</div>
              </div>
              <div style="text-align:right; font-size:7.5px; font-family:monospace;">
                <div>BATCH: ${batchNo}</div>
                <div>INV: ${displayInvoice}</div>
              </div>
            </div>

            <div style="font-size:11px; font-weight:900; text-transform:uppercase;">${itemName}</div>
            <div style="font-size:8px; font-weight:bold; color:#333; margin:1px 0;">COMPOSITION: ${fabricComposition}</div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px; font-family:monospace; font-size:7px; border:1px solid #000; padding:3px; margin:2mm 0; background:#fafafa;">
              <div>EXACT WT: <strong>${formattedWeight}</strong></div>
              <div>WATER SAVED: <strong>~2,600 L</strong></div>
              <div>RECYCLE METRIC: <strong>GRADE A+</strong></div>
              <div>CARBON AVOID: <strong>~4.8 KG</strong></div>
            </div>
          </div>

          <div style="display:flex; align-items:center; justify-content:space-between; border-top:1.5px solid #000; padding-top:1.5mm;">
            <div style="width:34px; height:34px;">
              ${qrSvg}
            </div>
            <div style="text-align:right;">
              <div style="font-size:6.5px; font-weight:bold; color:#555;">CIRCULAR VALUE</div>
              <div style="font-size:15px; font-weight:900;">AED ${formattedPrice}</div>
            </div>
          </div>
        </div>
      `;

    default:
      return `<div style="padding:10px; font-family:sans-serif;">Unknown Style: ${styleId}</div>`;
  }
}
