/**
 * Storefront Luxury Inspector Postcard Generator
 * Generates an ultra-high-resolution (1200x860) luxury vintage fashion postcard
 * matching the exact 1:1 aesthetic of the Vintage Vibes E-Commerce GarmentInspectorModal.
 */

export interface StorefrontPostcardData {
  barcode: string;
  brandName?: string;
  itemName?: string;
  style?: string;
  sizeScanned?: string;
  labelGrade?: string;
  retailPriceAed?: number;
  estimatedPrice?: number;
  frontImageUrl?: string;
  pitToPitInches?: number | string;
  lengthInches?: number | string;
  marketSegment?: string;
  isGrail?: boolean;
  shopLocation?: string;
  countryOfOrigin?: string;
  fitSilhouette?: string;
  hierarchy?: string;
  description?: string;
  ecommerceDescription?: string;
  seoTags?: string[];
  weightKg?: number | string;
  weightGrams?: number | string;
}

/**
 * Creates pixel-perfect SVG markup matching exact 1:1 Storefront Garment Inspector Modal
 */
export function createStorefrontPostcardSvg(data: StorefrontPostcardData): string {
  const width = 1200;
  const height = 860;

  const barcode = (data.barcode || 'VV-GARMENT').trim();
  const brandName = (data.brandName || 'Vintage Archive').trim();
  const itemName = (data.itemName || data.style || 'Curated Garment').trim();
  const size = (data.sizeScanned || 'L').trim().toUpperCase();
  const grade = (data.labelGrade || 'Grade A+ (Pristine)').trim();
  const price = data.retailPriceAed || data.estimatedPrice || 295;
  const pit = data.pitToPitInches ? String(data.pitToPitInches).trim() : '22';
  const pitNum = parseFloat(pit) || 22;
  const pitCm = (pitNum * 2.54).toFixed(1);
  const len = data.lengthInches ? String(data.lengthInches).trim() : '28';
  const lenNum = parseFloat(len) || 28;
  const lenCm = (lenNum * 2.54).toFixed(1);
  const origin = (data.countryOfOrigin || 'Made in USA').trim();
  const location = (data.shopLocation || 'Central Warehouse & Sorting Center').trim();
  const fitSilhouette = (data.fitSilhouette || 'Boxy 90s Fit').trim();
  const hierarchy = data.hierarchy || 'Men ➔ Tops & Blouses ➔ Graphic Tees';
  const weight = data.weightKg ? `${data.weightKg} kg` : (data.weightGrams ? `${data.weightGrams}g` : '0.3 kg');

  // Tier Badge & Segment
  const isAntique = data.marketSegment === 'Antique' || itemName.toLowerCase().includes('antique');
  const isGrail = data.isGrail || data.marketSegment === 'Grails' || price >= 500;
  const segmentText = isAntique ? '🏛️ Antique' : isGrail ? '👑 1-OF-1 GRAIL' : '🏷️ Non-Brand';
  const segmentBg = isAntique ? '#3B0764' : isGrail ? '#0F172A' : '#1E293B';
  const segmentBorder = isAntique ? '#C084FC' : isGrail ? '#F59E0B' : '#94A3B8';
  const segmentColor = isAntique ? '#E9D5FF' : isGrail ? '#FCD34D' : '#F1F5F9';

  const rawDesc = data.description || data.ecommerceDescription ||
    `Clean and vibrant ${brandName} archival collection crewneck in authentic vintage wash. Features soft cotton jersey fabric, single-stitch hem integrity, and comfortable boxy fit for relaxed daily styling.`;

  const tags = (Array.isArray(data.seoTags) && data.seoTags.length > 0)
    ? data.seoTags
    : [brandName.toLowerCase(), 'vintage tee', 'single stitch', 'thrifted archive', 'streetwear', 'al ain vault'];

  // 1. Sanitize frontImageUrl & Prevent Recursive Postcard Inception
  let src = (data.frontImageUrl || '').trim();

  // If someone passed an existing postcard SVG string, avoid embedding it
  if (src.includes('parchmentBg') || src.includes('inspectorPhotoClip') || src.includes('INSTANT VAULT BUY') || src.includes('1-CLICK WHATSAPP CLAIM')) {
    console.warn('[PostcardGenerator] Detected nested postcard in frontImageUrl. Neutralizing recursion.');
    src = '';
  }

  if (src) {
    if (src.startsWith('/9j/')) {
      src = `data:image/jpeg;base64,${src}`;
    } else if (src.startsWith('iVBORw')) {
      src = `data:image/png;base64,${src}`;
    } else if (src.startsWith('data:image/png;base64,/9j/')) {
      // Fix mislabeled JPEG MIME type
      src = src.replace('data:image/png;base64,/9j/', 'data:image/jpeg;base64,/9j/');
    } else if (!src.startsWith('data:') && !src.startsWith('http')) {
      src = `https://vintagevibesgk.com${src.startsWith('/') ? '' : '/'}${src}`;
    }
  }

  // XML Escape Helper
  const esc = (str: string) => String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

  // Split description into up to 2 readable lines (wrap at ~82 chars)
  const wrapText = (text: string, maxLen: number = 82): string[] => {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      if ((currentLine + ' ' + word).trim().length <= maxLen) {
        currentLine = (currentLine + ' ' + word).trim();
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
        if (lines.length >= 2) break;
      }
    }
    if (currentLine && lines.length < 2) lines.push(currentLine);
    return lines;
  };

  const descLines = wrapText(rawDesc, 82);

  // Garment image element
  let imageElement = '';
  if (src) {
    imageElement = `
      <g clip-path="url(#inspectorPhotoClip)">
        <rect x="24" y="104" width="490" height="664" fill="#FFFFFF" />
        <image href="${src}" x="24" y="104" width="490" height="664" preserveAspectRatio="xMidYMid meet" />
      </g>
    `;
  } else {
    imageElement = `
      <rect x="24" y="104" width="490" height="664" rx="18" fill="#F8FAFC" />
      <text x="269" y="440" font-family="'Playfair Display', Georgia, serif" font-size="22" fill="#94A3B8" text-anchor="middle" font-weight="bold">Studio Photo Pending</text>
    `;
  }

  return `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Card Parchment Background Gradient -->
    <linearGradient id="parchmentBg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#FFFDF8" />
      <stop offset="40%" stop-color="#FAF4E6" />
      <stop offset="100%" stop-color="#F5EADB" />
    </linearGradient>

    <!-- Header Bar Gradient -->
    <linearGradient id="headerGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#FAF3E0" />
      <stop offset="50%" stop-color="#FDF9EE" />
      <stop offset="100%" stop-color="#FAF3E0" />
    </linearGradient>

    <!-- Emerald Claim Button Gradient -->
    <linearGradient id="emeraldBtn" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#059669" />
      <stop offset="50%" stop-color="#10B981" />
      <stop offset="100%" stop-color="#059669" />
    </linearGradient>

    <!-- Amber Instant Buy Gradient -->
    <linearGradient id="goldVaultBtn" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#F59E0B" />
      <stop offset="50%" stop-color="#D97706" />
      <stop offset="100%" stop-color="#B45309" />
    </linearGradient>

    <!-- 3D Wax Seal Radial -->
    <radialGradient id="waxSeal" cx="35%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#EF4444" />
      <stop offset="45%" stop-color="#B91C1C" />
      <stop offset="85%" stop-color="#7F1D1D" />
      <stop offset="100%" stop-color="#450A0A" />
    </radialGradient>

    <!-- Shadow filters -->
    <filter id="cardShadow" x="-3%" y="-3%" width="106%" height="106%">
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#D97706" flood-opacity="0.15" />
    </filter>
    <filter id="photoShadow" x="-3%" y="-3%" width="106%" height="106%">
      <feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="#000000" flood-opacity="0.12" />
    </filter>

    <!-- Photo Rounded Clip -->
    <clipPath id="inspectorPhotoClip">
      <rect x="24" y="104" width="490" height="664" rx="18" />
    </clipPath>
  </defs>

  <!-- OUTER CONTAINER (Luxury Vintage Parchment with Gold Border) -->
  <rect width="${width}" height="${height}" rx="24" fill="url(#parchmentBg)" stroke="#F59E0B" stroke-width="3" filter="url(#cardShadow)" />
  <rect x="6" y="6" width="1188" height="848" rx="20" fill="none" stroke="#FDE68A" stroke-width="1.2" opacity="0.6" />

  <!-- TOP HEADER BAR -->
  <path d="M 0 24 Q 0 0 24 0 L 1176 0 Q 1200 0 1200 24 L 1200 58 L 0 58 Z" fill="url(#headerGrad)" />
  <line x1="0" y1="58" x2="${width}" y2="58" stroke="#FDE68A" stroke-width="1.5" />

  <!-- Header Content -->
  <g transform="translate(24, 15)">
    <!-- Sparkles Badge -->
    <rect width="28" height="28" rx="7" fill="#F59E0B" />
    <text x="14" y="19" font-family="-apple-system, sans-serif" font-size="14" font-weight="900" fill="#0F172A" text-anchor="middle">✨</text>

    <!-- Title & Subtitle -->
    <text x="38" y="16" font-family="'Playfair Display', Georgia, serif" font-size="15" font-weight="900" fill="#0F172A" letter-spacing="0.5">
      ${esc(brandName.toUpperCase())} • ${esc(itemName.toUpperCase())}
    </text>
    <text x="38" y="28" font-family="-apple-system, sans-serif" font-size="10" font-weight="700" fill="#92400E">
      High-Resolution Macro Inspector • Optical Fabric &amp; Tag Zoom • 1-of-1 Vault Archive
    </text>

    <!-- Right Header Badges: SKU & Location -->
    <g transform="translate(690, 0)">
      <!-- SKU Pill -->
      <rect width="240" height="28" rx="6" fill="#0F172A" stroke="#F59E0B" stroke-width="1" />
      <text x="120" y="18" font-family="'Courier New', Courier, monospace" font-size="11" font-weight="900" fill="#FDE047" text-anchor="middle">
        ${esc(barcode)}
      </text>

      <!-- Location Pill -->
      <rect x="250" width="225" height="28" rx="6" fill="#FFFFFF" stroke="#FDE68A" stroke-width="1" />
      <text x="362" y="18" font-family="-apple-system, sans-serif" font-size="10.5" font-weight="700" fill="#334155" text-anchor="middle">
        📍 ${esc(location.length > 25 ? location.slice(0, 23) + '...' : location)}
      </text>
    </g>
  </g>

  <!-- ======================================================== -->
  <!-- LEFT COLUMN: GARMENT PHOTO INSPECTOR (Width: 490px) -->
  <!-- ======================================================== -->

  <!-- View Angle Tabs -->
  <g transform="translate(24, 68)">
    <rect width="490" height="30" rx="8" fill="#FFFFFF" stroke="#FDE68A" stroke-width="1" />
    
    <!-- Active Front Tab -->
    <rect x="4" y="3" width="115" height="24" rx="6" fill="#F59E0B" />
    <text x="61" y="19" font-family="-apple-system, sans-serif" font-size="11" font-weight="900" fill="#0F172A" text-anchor="middle">👕 Front View</text>

    <!-- Inactive Back Tab -->
    <text x="180" y="19" font-family="-apple-system, sans-serif" font-size="11" font-weight="700" fill="#64748B" text-anchor="middle">🔄 Back View</text>

    <!-- Inactive Label Tab -->
    <text x="300" y="19" font-family="-apple-system, sans-serif" font-size="11" font-weight="700" fill="#64748B" text-anchor="middle">🏷️ Label &amp; Tag</text>

    <!-- Zoom Active indicator -->
    <rect x="382" y="3" width="102" height="24" rx="6" fill="#FEF3C7" stroke="#FDE68A" stroke-width="1" />
    <text x="433" y="18" font-family="-apple-system, sans-serif" font-size="10" font-weight="800" fill="#92400E" text-anchor="middle">🔍 High-Res Fit</text>
  </g>

  <!-- Garment Photo Frame -->
  <g filter="url(#photoShadow)">
    <rect x="24" y="104" width="490" height="664" rx="18" fill="#FFFFFF" stroke="#F59E0B" stroke-width="1.8" />
  </g>

  <!-- The Pure Garment Image -->
  ${imageElement}

  <!-- FLOATING BADGES OVER PHOTO (Matching GarmentInspectorModal 1:1) -->
  <!-- Top Left: 1-OF-1 GRAIL (ONLY ONE EXISTS) -->
  <g transform="translate(36, 116)">
    <rect width="210" height="28" rx="14" fill="#0F172A" fill-opacity="0.94" stroke="#F59E0B" stroke-width="1.2" />
    <text x="105" y="18" font-family="-apple-system, sans-serif" font-size="10.5" font-weight="900" fill="#FDE047" text-anchor="middle" letter-spacing="0.5">
      ✨ 1-OF-1 GRAIL (ONLY ONE EXISTS)
    </text>
  </g>

  <!-- Top Right: 👁 3 viewing now -->
  <g transform="translate(378, 116)">
    <rect width="124" height="28" rx="14" fill="#4C0519" fill-opacity="0.94" stroke="#FB7185" stroke-width="1" />
    <circle cx="16" cy="14" r="3.5" fill="#F43F5E" />
    <text x="70" y="18" font-family="-apple-system, sans-serif" font-size="10.5" font-weight="800" fill="#FDA4AF" text-anchor="middle">
      👁 3 viewing now
    </text>
  </g>

  <!-- Bottom Left: Magnify / Verified Tag -->
  <g transform="translate(36, 728)">
    <rect width="220" height="28" rx="8" fill="#0F172A" fill-opacity="0.90" stroke="#F59E0B" stroke-width="1" />
    <text x="110" y="18" font-family="'Courier New', Courier, monospace" font-size="10" font-weight="800" fill="#FDE047" text-anchor="middle">
      VERIFIED 1-OF-1 ARCHIVE
    </text>
  </g>

  <!-- Bottom Right: AI Tag Verified -->
  <g transform="translate(374, 728)">
    <rect width="128" height="28" rx="8" fill="#064E3B" fill-opacity="0.92" stroke="#34D399" stroke-width="1" />
    <text x="64" y="18" font-family="-apple-system, sans-serif" font-size="10" font-weight="800" fill="#6EE7B7" text-anchor="middle">
      ✓ AI Tag Verified
    </text>
  </g>

  <!-- Helper text under photo -->
  <text x="269" y="792" font-family="-apple-system, sans-serif" font-size="9.5" font-weight="600" fill="#64748B" text-anchor="middle" font-style="italic">
    Authentic single-stitch weave &amp; fabric integrity verified under optical macro inspection.
  </text>


  <!-- ======================================================== -->
  <!-- RIGHT COLUMN: PIECE DOSSIER & ACTIONS (Width: 645px) -->
  <!-- ======================================================== -->

  <g transform="translate(535, 68)">
    <!-- Row 1: Fresh From Sorting Badge & Market Segment -->
    <g transform="translate(0, 0)">
      <!-- Fresh Sorting Pill -->
      <rect width="215" height="26" rx="6" fill="#FEF3C7" stroke="#FDE68A" stroke-width="1" />
      <text x="107" y="17" font-family="-apple-system, sans-serif" font-size="10" font-weight="900" fill="#78350F" text-anchor="middle">
        ⚡ FRESH FROM SORTING TERMINAL
      </text>

      <!-- Market Segment Badge -->
      <g transform="translate(225, 0)">
        <rect width="130" height="26" rx="6" fill="${segmentBg}" stroke="${segmentBorder}" stroke-width="1" />
        <text x="65" y="17" font-family="-apple-system, sans-serif" font-size="10.5" font-weight="900" fill="${segmentColor}" text-anchor="middle">
          ${esc(segmentText)}
        </text>
      </g>
    </g>

    <!-- Row 2: Hierarchy Breadcrumb Bar -->
    <g transform="translate(0, 36)">
      <rect width="640" height="26" rx="6" fill="#FEF3C7" stroke="#FDE68A" stroke-width="1" />
      <text x="12" y="17" font-family="'Courier New', Courier, monospace" font-size="10" font-weight="800" fill="#78350F">
        HIERARCHY: <tspan font-weight="900" fill="#0F172A">${esc(hierarchy)}</tspan>
      </text>
    </g>

    <!-- Row 3: Big Garment Title & Style -->
    <text x="0" y="92" font-family="'Playfair Display', Georgia, serif" font-size="25" font-weight="900" fill="#0F172A">
      ${esc(brandName)} • ${esc(itemName)}
    </text>
    <text x="0" y="112" font-family="-apple-system, sans-serif" font-size="11.5" font-weight="600" fill="#64748B">
      Style: <tspan font-weight="800" fill="#1E293B">${esc(data.style || 'Double Stitch • Modern Commercial • Vintage Wash')}</tspan>
    </text>

    <!-- Row 4: Price Bar & 3D Wax Seal Stamp -->
    <g transform="translate(0, 126)">
      <text x="0" y="32" font-family="'Courier New', Courier, monospace" font-size="34" font-weight="900" fill="#78350F">
        AED ${Number(price).toLocaleString()}
      </text>
      <text x="155" y="28" font-family="-apple-system, sans-serif" font-size="11" font-weight="600" fill="#64748B">
        (VAT &amp; Delivery calculated at checkout)
      </text>

      <!-- 3D Red Royal Wax Seal Stamp -->
      <g transform="translate(580, 20) rotate(-6)">
        <circle cx="0" cy="0" r="32" fill="url(#waxSeal)" filter="url(#photoShadow)" />
        <circle cx="0" cy="0" r="27" fill="none" stroke="#FECACA" stroke-width="1" opacity="0.6" />
        <circle cx="0" cy="0" r="23" fill="none" stroke="#B91C1C" stroke-width="0.8" />
        <text x="0" y="-6" font-family="serif" font-size="6.5" font-weight="bold" fill="#FEE2E2" text-anchor="middle" letter-spacing="1">VINTAGE VIBES</text>
        <text x="0" y="4" font-family="serif" font-size="10" font-weight="bold" fill="#FDE047" text-anchor="middle">👑</text>
        <text x="0" y="14" font-family="sans-serif" font-size="5.5" font-weight="bold" fill="#FEE2E2" text-anchor="middle" letter-spacing="1">AL AIN VAULT</text>
      </g>
    </g>

    <!-- Row 5: Archival Vintage Notes Card -->
    <g transform="translate(0, 178)">
      <rect width="640" height="96" rx="12" fill="#FFFBEB" stroke="#FDE68A" stroke-width="1.2" />
      <g transform="translate(14, 16)">
        <text x="0" y="0" font-family="-apple-system, sans-serif" font-size="10" font-weight="900" fill="#92400E" letter-spacing="1">
          ✨ ARCHIVAL VINTAGE NOTES
        </text>
        ${descLines.map((line, idx) => `
          <text x="0" y="${18 + idx * 14}" font-family="-apple-system, sans-serif" font-size="10.5" font-weight="500" fill="#1E293B" font-style="italic">
            ${esc(line)}
          </text>
        `).join('')}

        <!-- Tag pills -->
        <g transform="translate(0, 52)">
          ${tags.slice(0, 5).map((t, idx) => `
            <g transform="translate(${idx * 115}, 0)">
              <rect width="108" height="20" rx="4" fill="#FEF3C7" stroke="#FDE68A" stroke-width="0.8" />
              <text x="54" y="14" font-family="'Courier New', Courier, monospace" font-size="9.5" font-weight="700" fill="#78350F" text-anchor="middle">
                #${esc(t.replace(/^#/, ''))}
              </text>
            </g>
          `).join('')}
        </g>
      </g>
    </g>

    <!-- Row 6: Exact Measured Dimensions Card -->
    <g transform="translate(0, 288)">
      <rect width="640" height="152" rx="14" fill="#FFFFFF" stroke="#F59E0B" stroke-width="1.5" filter="url(#photoShadow)" />
      
      <!-- Card Header -->
      <g transform="translate(16, 20)">
        <text x="0" y="0" font-family="-apple-system, sans-serif" font-size="11.5" font-weight="900" fill="#0F172A" letter-spacing="0.5">
          📐 EXACT MEASURED DIMENSIONS
        </text>
        <text x="608" y="0" font-family="-apple-system, sans-serif" font-size="11" font-weight="700" fill="#B45309" text-anchor="end">
          Vintage Fit Guide ➔
        </text>
      </g>

      <!-- Two Yellow Boxes Side-by-Side -->
      <g transform="translate(16, 34)">
        <!-- Box 1: Pit-to-Pit -->
        <rect width="296" height="52" rx="10" fill="#FFFBEB" stroke="#FDE68A" stroke-width="1" />
        <text x="148" y="18" font-family="-apple-system, sans-serif" font-size="9.5" font-weight="800" fill="#64748B" text-anchor="middle" letter-spacing="0.5">
          PIT-TO-PIT (CHEST)
        </text>
        <text x="148" y="40" font-family="'Courier New', Courier, monospace" font-size="17" font-weight="900" fill="#0F172A" text-anchor="middle">
          ${esc(pit)}" <tspan font-family="-apple-system, sans-serif" font-size="11" font-weight="600" fill="#64748B">(${esc(pitCm)} cm)</tspan>
        </text>

        <!-- Box 2: Length -->
        <g transform="translate(312, 0)">
          <rect width="296" height="52" rx="10" fill="#FFFBEB" stroke="#FDE68A" stroke-width="1" />
          <text x="148" y="18" font-family="-apple-system, sans-serif" font-size="9.5" font-weight="800" fill="#64748B" text-anchor="middle" letter-spacing="0.5">
            LENGTH (COLLAR-HEM)
          </text>
          <text x="148" y="40" font-family="'Courier New', Courier, monospace" font-size="17" font-weight="900" fill="#0F172A" text-anchor="middle">
            ${esc(len)}" <tspan font-family="-apple-system, sans-serif" font-size="11" font-weight="600" fill="#64748B">(${esc(lenCm)} cm)</tspan>
          </text>
        </g>
      </g>

      <!-- Silhouette Cut & Fit Summary Line -->
      <g transform="translate(16, 102)">
        <line x1="0" y1="0" x2="608" y2="0" stroke="#FDE68A" stroke-width="1" opacity="0.6" />
        <text x="0" y="18" font-family="-apple-system, sans-serif" font-size="11" font-weight="600" fill="#64748B">Silhouette Cut:</text>
        <g transform="translate(90, 4)">
          <rect width="110" height="20" rx="5" fill="#FEF3C7" stroke="#FDE68A" stroke-width="1" />
          <text x="55" y="14" font-family="-apple-system, sans-serif" font-size="10.5" font-weight="900" fill="#92400E" text-anchor="middle">${esc(fitSilhouette)}</text>
        </g>
        <text x="0" y="38" font-family="-apple-system, sans-serif" font-size="10.5" font-style="italic" fill="#475569">
          "Features a ${esc(pit)}" pit-to-pit width with ${esc(len)}" length. Vintage authentic cut."
        </text>
      </g>
    </g>

    <!-- Row 7: Provenance Specs 4-Pill Grid -->
    <g transform="translate(0, 452)">
      <rect width="640" height="52" rx="10" fill="#FFFFFF" fill-opacity="0.9" stroke="#E2E8F0" stroke-width="1" />
      
      <!-- Tag Size -->
      <g transform="translate(16, 12)">
        <text x="0" y="10" font-family="-apple-system, sans-serif" font-size="8.5" font-weight="800" fill="#64748B">TAG SCANNED SIZE</text>
        <text x="0" y="27" font-family="'Courier New', Courier, monospace" font-size="13" font-weight="900" fill="#0F172A">${esc(size)}</text>
      </g>

      <!-- Origin -->
      <g transform="translate(145, 12)">
        <text x="0" y="10" font-family="-apple-system, sans-serif" font-size="8.5" font-weight="800" fill="#64748B">COUNTRY OF ORIGIN</text>
        <text x="0" y="27" font-family="-apple-system, sans-serif" font-size="12" font-weight="800" fill="#0F172A">${esc(origin)}</text>
      </g>

      <!-- Weight -->
      <g transform="translate(305, 12)">
        <text x="0" y="10" font-family="-apple-system, sans-serif" font-size="8.5" font-weight="800" fill="#64748B">WEIGHT</text>
        <text x="0" y="27" font-family="'Courier New', Courier, monospace" font-size="12" font-weight="800" fill="#0F172A">${esc(weight)}</text>
      </g>

      <!-- Grade -->
      <g transform="translate(415, 12)">
        <text x="0" y="10" font-family="-apple-system, sans-serif" font-size="8.5" font-weight="800" fill="#64748B">CONDITION GRADE</text>
        <text x="0" y="27" font-family="-apple-system, sans-serif" font-size="11.5" font-weight="900" fill="#065F46">✨ ${esc(grade.length > 24 ? grade.slice(0, 22) + '...' : grade)}</text>
      </g>
    </g>

    <!-- Row 8: Action Buttons (Claim via WhatsApp & Instant Vault Buy) -->
    <g transform="translate(0, 516)">
      <!-- 1-Click WhatsApp Claim Button (Emerald) -->
      <g transform="translate(0, 0)">
        <rect width="312" height="46" rx="12" fill="url(#emeraldBtn)" stroke="#34D399" stroke-width="1.2" filter="url(#photoShadow)" />
        <text x="156" y="29" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="13" font-weight="900" fill="#FFFFFF" text-anchor="middle" letter-spacing="1">
          💬 1-CLICK WHATSAPP CLAIM
        </text>
      </g>

      <!-- Vault Cart Button -->
      <g transform="translate(328, 0)">
        <rect width="312" height="46" rx="12" fill="#FFFFFF" stroke="#F59E0B" stroke-width="1.5" filter="url(#photoShadow)" />
        <text x="156" y="29" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="13" font-weight="900" fill="#0F172A" text-anchor="middle" letter-spacing="1">
          🛒 + VAULT CART
        </text>
      </g>

      <!-- Full-Width Instant Vault Buy Button (Gold) -->
      <g transform="translate(0, 56)">
        <rect width="640" height="52" rx="14" fill="url(#goldVaultBtn)" stroke="#FCD34D" stroke-width="1.5" filter="url(#photoShadow)" />
        <text x="320" y="33" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="14.5" font-weight="900" fill="#0F172A" text-anchor="middle" letter-spacing="1">
          ⚡ INSTANT VAULT BUY  •  vintagevibesgk.com
        </text>
      </g>
    </g>

    <!-- Footer Guarantee -->
    <text x="320" y="638" font-family="-apple-system, sans-serif" font-size="10" font-weight="700" fill="#64748B" text-anchor="middle" letter-spacing="0.5">
      🛡️ 100% AUTHENTIC VINTAGE GUARANTEE • INSTANT RESERVATION • AL AIN, UAE
    </text>
  </g>
</svg>
  `.trim();
}

/**
 * Generates PNG data URL in the Browser using HTML5 Canvas (1200x860)
 */
export async function generateStorefrontPostcardCanvas(data: StorefrontPostcardData): Promise<string> {
  const safeData: StorefrontPostcardData = { ...data };

  // If frontImageUrl is an HTTP/HTTPS or relative URL, fetch and convert to Base64 in-browser
  // so browser SVG rendering inside Image() element is never tainted or blocked by CORS
  if (safeData.frontImageUrl && (safeData.frontImageUrl.startsWith('http://') || safeData.frontImageUrl.startsWith('https://') || safeData.frontImageUrl.startsWith('/'))) {
    try {
      const fullUrl = safeData.frontImageUrl.startsWith('/') ? `https://vintagevibesgk.com${safeData.frontImageUrl}` : safeData.frontImageUrl;
      const res = await fetch(fullUrl, { mode: 'cors' });
      if (res.ok) {
        const blob = await res.blob();
        const b64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve((reader.result as string) || fullUrl);
          reader.onerror = () => resolve(fullUrl);
          reader.readAsDataURL(blob);
        });
        if (b64 && b64.startsWith('data:')) {
          safeData.frontImageUrl = b64;
        }
      }
    } catch (_) {
      // Fallback to original url
    }
  }

  const svg = createStorefrontPostcardSvg(safeData);
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 1200;
        canvas.height = 860;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(url);
          return resolve(url);
        }
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        const dataUrl = canvas.toDataURL('image/png', 0.92);
        resolve(dataUrl);
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(new Error(`Failed to load SVG for postcard rendering: ${e}`));
    };
    img.src = url;
  });
}
