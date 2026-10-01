/**
 * Storefront Luxury Postcard Generator
 * Generates an ultra-high-resolution (800x1000) luxury vintage fashion postcard
 * matching the exact aesthetic of the Vintage Vibes E-Commerce Storefront (ProductCard).
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
}

/**
 * Creates pixel-perfect SVG markup matching exact 1:1 Storefront ProductCard
 */
export function createStorefrontPostcardSvg(data: StorefrontPostcardData): string {
  const width = 750;
  const height = 1080;

  const barcode = (data.barcode || 'VV-GARMENT').trim();
  const brandName = (data.brandName || 'Vintage Archive').trim();
  const itemName = (data.itemName || data.style || 'Curated Garment').trim();
  const size = (data.sizeScanned || 'L').trim().toUpperCase();
  const grade = (data.labelGrade || 'Grade A+ (Pristine)').trim();
  const price = data.retailPriceAed || data.estimatedPrice || 295;
  const pit = data.pitToPitInches ? String(data.pitToPitInches).trim() : '22';
  const len = data.lengthInches ? String(data.lengthInches).trim() : '28';
  const origin = (data.countryOfOrigin || 'Made in USA').trim();
  const location = (data.shopLocation || 'Al Ain Vault').trim();
  const fitSilhouette = (data.fitSilhouette || 'Boxy Vintage Fit').trim();

  // Tier Badge
  const isAntique = data.marketSegment === 'Antique' || itemName.toLowerCase().includes('antique');
  const isGrail = data.isGrail || data.marketSegment === 'Grails' || price >= 500;
  const tierText = isAntique ? '🏛️ Antique' : isGrail ? '👑 Grail' : '👑 1-of-1 Piece';
  const tierBg = isAntique ? '#3B0764' : '#0F172A';
  const tierBorder = isAntique ? '#C084FC' : '#F59E0B';
  const tierColor = isAntique ? '#E9D5FF' : '#FCD34D';

  // Garment Image Element (Supports Base64 or standard URL)
  let imageElement = '';
  if (data.frontImageUrl) {
    const src = data.frontImageUrl.startsWith('data:') || data.frontImageUrl.startsWith('http')
      ? data.frontImageUrl
      : `https://vintagevibesgk.com${data.frontImageUrl.startsWith('/') ? '' : '/'}${data.frontImageUrl}`;

    imageElement = `
      <defs>
        <clipPath id="photoClip">
          <rect x="24" y="24" width="702" height="520" rx="20" />
        </clipPath>
      </defs>
      <g clip-path="url(#photoClip)">
        <rect x="24" y="24" width="702" height="520" fill="#FFFFFF" />
        <image href="${src}" x="24" y="24" width="702" height="520" preserveAspectRatio="xMidYMid meet" />
      </g>
    `;
  } else {
    imageElement = `
      <rect x="24" y="24" width="702" height="520" rx="20" fill="#F8FAFC" />
      <text x="375" y="280" font-family="'Playfair Display', Georgia, serif" font-size="24" fill="#94A3B8" text-anchor="middle" font-weight="bold">Studio Photo Pending</text>
    `;
  }

  // Escape special XML characters in text
  const escapeXml = (str: string) => str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

  return `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="cardBg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#FFFDF8" />
      <stop offset="35%" stop-color="#FAF3E0" />
      <stop offset="100%" stop-color="#F5EADB" />
    </linearGradient>
    <linearGradient id="goldBtn" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#F59E0B" />
      <stop offset="50%" stop-color="#D97706" />
      <stop offset="100%" stop-color="#B45309" />
    </linearGradient>
    <linearGradient id="claimBtn" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#059669" />
      <stop offset="100%" stop-color="#10B981" />
    </linearGradient>
    <radialGradient id="waxGrad" cx="35%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#EF4444" />
      <stop offset="45%" stop-color="#B91C1C" />
      <stop offset="85%" stop-color="#7F1D1D" />
      <stop offset="100%" stop-color="#450A0A" />
    </radialGradient>
    <filter id="cardShadow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="10" stdDeviation="16" flood-color="#D97706" flood-opacity="0.18" />
    </filter>
    <filter id="photoShadow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.08" />
    </filter>
  </defs>

  <!-- Background Container with Gold Border -->
  <rect width="${width}" height="${height}" rx="28" fill="url(#cardBg)" stroke="#F59E0B" stroke-width="3" filter="url(#cardShadow)" />

  <!-- Inner Golden Hairline -->
  <rect x="8" y="8" width="734" height="1064" rx="22" fill="none" stroke="#FDE68A" stroke-width="1.2" opacity="0.7" />

  <!-- GARMENT PHOTO FRAME (Exact Aspect Ratio from ProductCard) -->
  <g filter="url(#photoShadow)">
    <rect x="24" y="24" width="702" height="520" rx="20" fill="#FFFFFF" stroke="#FDE68A" stroke-width="1.5" />
  </g>
  ${imageElement}

  <!-- FLOATING BADGES OVER PHOTO (EXACT 1:1 MATCH WITH STOREFRONT) -->
  <!-- Top Left: Tier Badge -->
  <g transform="translate(42, 42)">
    <rect width="145" height="34" rx="17" fill="${tierBg}" fill-opacity="0.94" stroke="${tierBorder}" stroke-width="1.2" />
    <text x="72" y="22" font-family="-apple-system, sans-serif" font-size="12" font-weight="900" fill="${tierColor}" text-anchor="middle" letter-spacing="0.5">${escapeXml(tierText)}</text>
  </g>

  <!-- Top Right: Size Badge & 3D Indicator -->
  <g transform="translate(535, 42)">
    <!-- Size Pill -->
    <rect width="90" height="34" rx="8" fill="#FFFFFF" fill-opacity="0.96" stroke="#F59E0B" stroke-width="1.5" />
    <text x="45" y="22" font-family="'Courier New', Courier, monospace" font-size="13" font-weight="900" fill="#0F172A" text-anchor="middle">SIZE ${escapeXml(size)}</text>

    <!-- 3D Back Pill -->
    <rect x="98" width="72" height="34" rx="8" fill="#F59E0B" stroke="#FFFFFF" stroke-width="1" />
    <text x="134" y="22" font-family="-apple-system, sans-serif" font-size="11" font-weight="900" fill="#0F172A" text-anchor="middle">🔄 3D Look</text>
  </g>

  <!-- FOMO Badges (Viewers & Cart) -->
  <g transform="translate(42, 88)">
    <rect width="175" height="28" rx="14" fill="#0F172A" fill-opacity="0.90" stroke="#F43F5E" stroke-width="1" stroke-opacity="0.8" />
    <circle cx="15" cy="14" r="4" fill="#F43F5E" />
    <text x="98" y="18" font-family="-apple-system, sans-serif" font-size="10.5" font-weight="bold" fill="#FDA4AF" text-anchor="middle">🔥 4 viewing this Grail</text>
  </g>

  <g transform="translate(225, 88)">
    <rect width="120" height="28" rx="14" fill="#0F172A" fill-opacity="0.90" stroke="#F59E0B" stroke-width="1" stroke-opacity="0.8" />
    <text x="60" y="18" font-family="-apple-system, sans-serif" font-size="10.5" font-weight="bold" fill="#FCD34D" text-anchor="middle">🛒 In 2 carts</text>
  </g>

  <!-- Over-Photo Bottom Tag Overlay -->
  <g transform="translate(24, 508)">
    <rect width="702" height="36" fill="#0F172A" fill-opacity="0.75" />
    <text x="351" y="23" font-family="-apple-system, sans-serif" font-size="11" font-weight="bold" fill="#FFFFFF" text-anchor="middle" letter-spacing="1">VERIFIED 1-OF-1 VINTAGE ARCHIVE • AL AIN VAULT</text>
  </g>

  <!-- CARD BODY SECTION (Exact match with Storefront) -->
  <!-- Row 1: SKU & Shop Location -->
  <g transform="translate(28, 570)">
    <rect width="250" height="28" rx="6" fill="#FEF3C7" stroke="#FDE68A" stroke-width="1" />
    <text x="125" y="18" font-family="'Courier New', Courier, monospace" font-size="11.5" font-weight="900" fill="#78350F" text-anchor="middle">${escapeXml(barcode)}</text>
    <text x="694" y="20" font-family="-apple-system, sans-serif" font-size="13" font-weight="600" fill="#64748B" text-anchor="end">📍 ${escapeXml(location)}, UAE</text>
  </g>

  <!-- Row 2: Piece Title (Brand • Item) -->
  <text x="28" y="632" font-family="'Playfair Display', Georgia, serif" font-size="25" font-weight="900" fill="#0F172A">
    ${escapeXml(brandName)} • ${escapeXml(itemName)}
  </text>

  <!-- Row 3: Country of Origin & Grade Badge -->
  <g transform="translate(28, 652)">
    <text x="0" y="19" font-family="-apple-system, sans-serif" font-size="13" font-weight="600" fill="#334155">${escapeXml(origin)}</text>
    <text x="125" y="19" font-family="-apple-system, sans-serif" font-size="13" fill="#94A3B8">•</text>
    <g transform="translate(142, 0)">
      <rect width="210" height="28" rx="8" fill="#ECFDF5" stroke="#6EE7B7" stroke-width="1" />
      <text x="105" y="18" font-family="-apple-system, sans-serif" font-size="11.5" font-weight="bold" fill="#065F46" text-anchor="middle">✨ ${escapeXml(grade)}</text>
    </g>
  </g>

  <!-- Row 4: Exact Garment Measurements Snippet -->
  <g transform="translate(28, 696)">
    <rect width="694" height="42" rx="10" fill="#FFFFFF" fill-opacity="0.95" stroke="#FDE68A" stroke-width="1.2" />
    <text x="16" y="26" font-family="'Courier New', Courier, monospace" font-size="13" font-weight="700" fill="#1E293B">
      📏 Pit: <tspan font-weight="900" fill="#0F172A">${escapeXml(pit)}"</tspan>  •  Len: <tspan font-weight="900" fill="#0F172A">${escapeXml(len)}"</tspan>
    </text>
    <!-- Fit Silhouette Badge -->
    <g transform="translate(535, 7)">
      <rect width="145" height="28" rx="6" fill="#FEF3C7" stroke="#FDE68A" stroke-width="1" />
      <text x="72" y="18" font-family="-apple-system, sans-serif" font-size="11" font-weight="bold" fill="#92400E" text-anchor="middle">${escapeXml(fitSilhouette)}</text>
    </g>
  </g>

  <!-- Hairline Divider -->
  <line x1="28" y1="756" x2="722" y2="756" stroke="#FDE68A" stroke-width="1.2" opacity="0.8" />

  <!-- Row 5: Price & International Valuation -->
  <g transform="translate(28, 782)">
    <text x="0" y="14" font-family="-apple-system, sans-serif" font-size="11" font-weight="900" fill="#64748B" letter-spacing="1">PRICE</text>
    <text x="0" y="34" font-family="'Courier New', monospace" font-size="11.5" font-weight="bold" fill="#059669">Int'l Val: ~$140 USD</text>
    <text x="540" y="38" font-family="'Courier New', Courier, monospace" font-size="44" font-weight="900" fill="#78350F" text-anchor="end">AED ${Number(price).toLocaleString()}</text>
  </g>

  <!-- 3D Red Royal Wax Seal Stamp -->
  <g transform="translate(660, 805) rotate(-6)">
    <circle cx="0" cy="0" r="38" fill="url(#waxGrad)" filter="url(#photoShadow)" />
    <circle cx="0" cy="0" r="32" fill="none" stroke="#FECACA" stroke-width="1" opacity="0.6" />
    <circle cx="0" cy="0" r="27" fill="none" stroke="#B91C1C" stroke-width="0.8" />
    <text x="0" y="-7" font-family="serif" font-size="7.5" font-weight="bold" fill="#FEE2E2" text-anchor="middle" letter-spacing="1">VINTAGE VIBES</text>
    <text x="0" y="5" font-family="serif" font-size="11" font-weight="bold" fill="#FDE047" text-anchor="middle">👑</text>
    <text x="0" y="16" font-family="sans-serif" font-size="6.5" font-weight="bold" fill="#FEE2E2" text-anchor="middle" letter-spacing="1">AL AIN VAULT</text>
  </g>

  <!-- Row 6: STOREFRONT DOUBLE ACTION BUTTONS (Exact Storefront Style) -->
  <!-- 1-Click WhatsApp Claim Button (Emerald) -->
  <g transform="translate(28, 868)">
    <rect width="338" height="52" rx="14" fill="url(#claimBtn)" stroke="#34D399" stroke-width="1.2" filter="url(#photoShadow)" />
    <text x="169" y="32" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="14" font-weight="900" fill="#FFFFFF" text-anchor="middle" letter-spacing="1">
      💬 1-CLICK CLAIM
    </text>
  </g>

  <!-- Add to Cart Button (White / Amber) -->
  <g transform="translate(384, 868)">
    <rect width="338" height="52" rx="14" fill="#FFFFFF" stroke="#F59E0B" stroke-width="1.5" filter="url(#photoShadow)" />
    <text x="169" y="32" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="14" font-weight="900" fill="#0F172A" text-anchor="middle" letter-spacing="1">
      🛒 + VAULT CART
    </text>
  </g>

  <!-- Instant Vault Buy Button (Full-Width Gold 3D) -->
  <g transform="translate(28, 938)">
    <rect width="694" height="64" rx="16" fill="url(#goldBtn)" stroke="#FCD34D" stroke-width="1.5" filter="url(#photoShadow)" />
    <text x="347" y="39" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="16" font-weight="900" fill="#0F172A" text-anchor="middle" letter-spacing="1">
      ⚡ INSTANT VAULT BUY  •  vintagevibesgk.com
    </text>
  </g>

  <!-- Bottom Authenticity Tagline -->
  <text x="375" y="1040" font-family="-apple-system, sans-serif" font-size="10.5" font-weight="bold" fill="#94A3B8" text-anchor="middle" letter-spacing="1">
    AUTHENTIC 1-OF-1 VINTAGE VAULT DROP  •  AL AIN, UAE
  </text>
</svg>
  `.trim();
}

/**
 * Generates PNG data URL in the Browser using HTML5 Canvas
 */
export async function generateStorefrontPostcardCanvas(data: StorefrontPostcardData): Promise<string> {
  const svg = createStorefrontPostcardSvg(data);
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 750;
        canvas.height = 1080;
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
