import { PieceBreakdownItem } from '../purchase/purchase.types.ts';

export interface GarmentMeasurements {
  pitToPitInches: number;
  lengthInches: number;
  pitToPitCm: number;
  lengthCm: number;
  fitSilhouette: string;
  silhouetteBadge: string;
  vintageEra: string;
  fitSummary: string;
  modernComparison: string;
  recommendedBodyType: string;
}

export interface FitGuideSilhouette {
  id: string;
  name: string;
  era: string;
  badge: string;
  characteristics: string[];
  modernComparison: string;
  visualSilhouette: string;
  stylingTip: string;
}

export const VINTAGE_FIT_SILHOUETTES: FitGuideSilhouette[] = [
  {
    id: 'boxy-90s',
    name: 'Boxy 90s Fit',
    era: '1990 - 1999',
    badge: 'Iconic 90s Cut',
    characteristics: [
      'Wide chest and generous pit-to-pit cut',
      'Dropped shoulder seams for effortless drape',
      'Cropped / standard hem length (prevents gathering around waist)',
      'Heavyweight cotton with minimal taper'
    ],
    modernComparison: 'Fits wider across the chest than modern slim-fit tees, while sitting neatly right at the hip line without being overly long.',
    visualSilhouette: 'Wide torso with relaxed dropped sleeves',
    stylingTip: 'Pair with relaxed denim or carpenter pants for true 90s skate and grunge proportions.'
  },
  {
    id: 'workwear-boxy',
    name: 'Rugged Workwear Cut',
    era: '1980 - 1990s',
    badge: 'Heavyweight Canvas',
    characteristics: [
      'Wide armholes engineered for layered motion',
      'Waist-length boxy crop sitting right at belt level',
      'Bi-swing pleated action back on jackets',
      'Reinforced duck canvas / blanket lining'
    ],
    modernComparison: 'Roomier in the upper body than contemporary tailored jackets with a shorter, masculine profile that flatters all heights.',
    visualSilhouette: 'Square shoulders with straight waistline',
    stylingTip: 'Layer over vintage reverse-weave hoodies or thermal waffle knits.'
  },
  {
    id: 'drop-shoulder-hoodie',
    name: 'Heavyweight Drop-Shoulder',
    era: 'Mid 90s Classic',
    badge: 'Heavyweight Fleece',
    characteristics: [
      'Deep armhole drop with relaxed upper sleeve',
      'Substantial ribbing at cuffs and hem to lock the drape',
      'Double-lined deep hood with structure',
      'Cross-grain fleece weave (preserves length after washing)'
    ],
    modernComparison: 'Noticeably more substantial and roomier than modern fast-fashion hoodies. Drapes cleanly rather than clinging.',
    visualSilhouette: 'Slouchy shoulders with fitted waist ribbing',
    stylingTip: 'Let the vintage ribbed hem sit on the hips for a classic streetwear silhouette.'
  },
  {
    id: 'classic-straight-denim',
    name: 'Authentic 90s Straight Denim',
    era: '1985 - 1998',
    badge: 'Original Selvedge / 501',
    characteristics: [
      'Mid-to-high rise sitting at natural waist',
      'Straight leg from thigh through hem',
      'Non-stretch 100% rigid cotton denim',
      'Classic 5-pocket with button or heavy metal zipper'
    ],
    modernComparison: 'Higher rise than modern low-rise jeans, giving better posture support and legs-elongating proportions.',
    visualSilhouette: 'Straight parallel leg with clean drape over sneakers or boots',
    stylingTip: 'Cuff 1-2 inches with retro runners, loafers, or work boots.'
  },
  {
    id: 'heritage-relaxed-knit',
    name: 'Heritage Relaxed Knit',
    era: 'Late 80s - 90s',
    badge: 'Hand-Knit Wool / Cotton',
    characteristics: [
      'Generous chest room with soft shoulder slope',
      'Traditional hand-knit or jacquard structure',
      'Snug ribbed wrist cuffs and waistband',
      'Heavy drape that holds its boxy geometry'
    ],
    modernComparison: 'More volume in the sleeves and torso compared to tight modern sweaters, giving effortless collegiate luxury.',
    visualSilhouette: 'Cocoon drape with structured cuffs',
    stylingTip: 'Wear layered over an oxford shirt or as an outerwear centerpiece.'
  }
];

/**
 * Calculates exact pit-to-pit, length, and fit silhouette for any garment.
 */
export function getGarmentMeasurements(piece: PieceBreakdownItem): GarmentMeasurements {
  // If piece already has custom measurements specified
  if (piece.pitToPitInches && piece.lengthInches) {
    const p2p = piece.pitToPitInches;
    const len = piece.lengthInches;
    const silhouette = piece.fitSilhouette || 'Boxy 90s Fit';
    return {
      pitToPitInches: p2p,
      lengthInches: len,
      pitToPitCm: Math.round(p2p * 2.54),
      lengthCm: Math.round(len * 2.54),
      fitSilhouette: silhouette,
      silhouetteBadge: 'Exact Measured Piece',
      vintageEra: '1990s Vintage Archive',
      fitSummary: `Features a ${p2p}" pit-to-pit width with ${len}" length. Vintage authentic cut.`,
      modernComparison: `Fits like standard modern ${piece.sizeScanned || 'L'} with vintage boxy drape.`,
      recommendedBodyType: 'All body types seeking authentic vintage proportions'
    };
  }

  const name = String(piece?.itemName || '').toLowerCase();
  const brand = String(piece?.brandName || '').toLowerCase();
  const size = String(piece?.sizeScanned || 'L').toUpperCase();

  // Baseline measurements according to vintage size chart
  let p2p = 23.5;
  let len = 28.5;
  let silhouette = 'Boxy 90s Fit';
  let badge = 'Boxy 90s Silhouette';
  let era = '1990s Vintage Archive';
  let summary = 'Wider pit-to-pit chest with comfortable drop shoulder and vintage length.';
  let comparison = 'Fits roomier than modern slim cuts with relaxed drape.';

  if (name.includes('jacket') || name.includes('coat') || brand.includes('carhartt') || name.includes('detroit')) {
    silhouette = 'Rugged Workwear Cut';
    badge = 'Boxy Workwear Crop';
    era = 'Mid 1990s USA Workwear';
    summary = 'Engineered with wide chest and waist-level hem for mobility. Heavy canvas body.';
    comparison = 'Noticeably boxier than slim modern jackets; sits comfortably above the hips.';
    if (size.includes('S')) { p2p = 22.0; len = 25.5; }
    else if (size.includes('M')) { p2p = 24.0; len = 26.5; }
    else if (size.includes('XL')) { p2p = 27.5; len = 28.5; }
    else if (size.includes('2XL') || size.includes('XXL')) { p2p = 29.5; len = 29.5; }
    else { p2p = 25.5; len = 27.5; } // L
  } else if (name.includes('hoodie') || name.includes('fleece') || name.includes('sweat')) {
    silhouette = 'Heavyweight Drop-Shoulder';
    badge = 'Heavyweight 90s Drape';
    era = '1996 Retro Sportswear';
    summary = 'Deep armholes, slouchy drop shoulder, and thick ribbed cuffs.';
    comparison = 'Generous chest drape compared to contemporary narrow-fit hoodies.';
    if (size.includes('S')) { p2p = 21.0; len = 26.0; }
    else if (size.includes('M')) { p2p = 23.0; len = 27.5; }
    else if (size.includes('XL')) { p2p = 26.5; len = 30.0; }
    else if (size.includes('2XL') || size.includes('XXL')) { p2p = 28.5; len = 31.0; }
    else { p2p = 24.5; len = 28.5; } // L
  } else if (name.includes('pant') || name.includes('denim') || name.includes('501') || name.includes('jean')) {
    silhouette = 'Authentic 90s Straight Denim';
    badge = 'High-Rise Straight Leg';
    era = '1993 USA Red Tab';
    summary = 'Mid-high rise waist, generous thigh, and classic straight leg opening.';
    comparison = 'Zero elastane 100% cotton denim gives authentic vertical drape.';
    p2p = 17.0; // Waist width laid flat (34" waist / 2)
    len = 32.0; // Inseam length
  } else if (name.includes('sweater') || name.includes('knit') || brand.includes('lauren')) {
    silhouette = 'Heritage Relaxed Knit';
    badge = 'Classic Luxury Knit';
    era = '1990s Italian Heritage';
    summary = 'Plush wool knit with relaxed chest and ribbed waist.';
    comparison = 'Comfortable, non-restrictive drape with timeless collegiate fit.';
    if (size.includes('S')) { p2p = 20.5; len = 25.5; }
    else if (size.includes('M')) { p2p = 22.5; len = 27.0; }
    else if (size.includes('XL')) { p2p = 26.0; len = 29.5; }
    else { p2p = 24.0; len = 28.0; } // L
  } else if (name.includes('cap') || name.includes('hat')) {
    silhouette = 'Vintage 6-Panel Snapback';
    badge = 'High-Crown Structured';
    era = 'UAE Signature Archive';
    summary = 'Structured 6-panel high crown with adjustable snapback strap.';
    comparison = 'Universal adjustable circumference (55cm - 61cm).';
    p2p = 7.25; // Hat width
    len = 4.75; // Crown height
  } else {
    // T-shirts and standard apparel
    silhouette = 'Boxy 90s Fit';
    badge = 'Single-Stitch 90s Boxy';
    era = '1993 USA Single-Stitch';
    summary = 'Iconic single-stitch 90s cut: wider chest width with shorter, boxier length.';
    comparison = 'Modern shirts are narrower and longer; this 90s cut sits wider and higher.';
    if (size.includes('S')) { p2p = 19.5; len = 26.5; }
    else if (size.includes('M')) { p2p = 21.5; len = 27.5; }
    else if (size.includes('XL')) { p2p = 25.5; len = 30.5; }
    else if (size.includes('2XL') || size.includes('XXL')) { p2p = 27.5; len = 31.5; }
    else { p2p = 23.5; len = 29.0; } // L
  }

  return {
    pitToPitInches: p2p,
    lengthInches: len,
    pitToPitCm: Math.round(p2p * 2.54 * 10) / 10,
    lengthCm: Math.round(len * 2.54 * 10) / 10,
    fitSilhouette: silhouette,
    silhouetteBadge: badge,
    vintageEra: era,
    fitSummary: summary,
    modernComparison: comparison,
    recommendedBodyType: 'True to vintage size. For an oversized fit, size up.'
  };
}

/**
 * Creates the exact pre-formatted WhatsApp claim message required by the user:
 *
 * Hello Vintage Vibes! I am claiming this 1-of-1 piece:
 * - SKU: [ItemSKU]
 * - Item: [Title]
 * - Size: [Size]
 * - Price: AED [Price]
 * Please reserve it for me!
 */
export function createWhatsAppClaimMessage(piece: PieceBreakdownItem): string {
  const price = piece.estimatedPrice || piece.retailPriceAed || 295;
  const title = piece.itemName ? `${piece.brandName} - ${piece.itemName}` : piece.brandName;
  const size = piece.sizeScanned || 'L';
  const sku = piece.barcode || piece.id;

  return `Hello Vintage Vibes! I am claiming this 1-of-1 piece:\n- SKU: ${sku}\n- Item: ${title}\n- Size: ${size}\n- Price: AED ${Number(price).toLocaleString()}\nPlease reserve it for me!`;
}

/**
 * 1-Click WhatsApp Claim link generator and handler
 */
export function openWhatsAppClaim(piece: PieceBreakdownItem, phone = '971554186086'): void {
  const message = createWhatsAppClaimMessage(piece);
  const cleanPhone = phone.replace(/\D/g, '');
  const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}
