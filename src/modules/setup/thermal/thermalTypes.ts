export type ThermalPresetId = '2x1' | '2.25x1.25' | '3x2' | '4x2' | '4x4' | '4x6' | 'custom';

export interface ThermalPreset {
  id: ThermalPresetId;
  name: string;
  widthIn: number;
  heightIn: number;
  widthMm: number;
  heightMm: number;
  description: string;
  badge: string;
}

export const THERMAL_PRESETS: ThermalPreset[] = [
  {
    id: '2x1',
    name: '2" x 1"',
    widthIn: 2.0,
    heightIn: 1.0,
    widthMm: 50,
    heightMm: 25,
    description: '50 x 25 mm - Standard Hangtag',
    badge: 'Standard Hangtag'
  },
  {
    id: '2.25x1.25',
    name: '2.25" x 1.25"',
    widthIn: 2.25,
    heightIn: 1.25,
    widthMm: 57,
    heightMm: 32,
    description: '57 x 32 mm - Retail Tag',
    badge: 'Retail Tag'
  },
  {
    id: '3x2',
    name: '3" x 2"',
    widthIn: 3.0,
    heightIn: 2.0,
    widthMm: 76,
    heightMm: 50,
    description: '76 x 50 mm - Large Product Tag',
    badge: 'Large Product Tag'
  },
  {
    id: '4x2',
    name: '4" x 2"',
    widthIn: 4.0,
    heightIn: 2.0,
    widthMm: 100,
    heightMm: 50,
    description: '100 x 50 mm - Shipping / Bale Tag',
    badge: 'Shipping / Bale Tag'
  },
  {
    id: '4x4',
    name: '4" x 4"',
    widthIn: 4.0,
    heightIn: 4.0,
    widthMm: 100,
    heightMm: 100,
    description: '100 x 100 mm - Square Logistics',
    badge: 'Square Logistics'
  },
  {
    id: '4x6',
    name: '4" x 6"',
    widthIn: 4.0,
    heightIn: 6.0,
    widthMm: 100,
    heightMm: 150,
    description: '100 x 150 mm - Standard Waybill / Box',
    badge: 'Standard Waybill / Box'
  }
];

export type ThermalStyleId =
  | 'modern_minimalist'
  | 'boutique_luxury'
  | 'high_density_industrial'
  | 'dual_code_retail'
  | 'big_price_live_drop'
  | 'master_bale_bulk'
  | 'jewelry_delicate'
  | 'classic_apparel'
  | 'split_grid_technical'
  | 'express_courier_waybill'
  | 'live_stream_host'
  | 'vintage_archive_retro'
  | 'security_authenticity'
  | 'qr_express_scan'
  | 'eco_textile_metric';

export interface ThermalStyleDefinition {
  id: ThermalStyleId;
  styleNumber: number;
  title: string;
  category: 'Retail' | 'Luxury' | 'Industrial' | 'Logistics' | 'Live Selling' | 'Eco & Security';
  tagline: string;
  highlights: string[];
}

export const THERMAL_DESIGN_STYLES: ThermalStyleDefinition[] = [
  {
    id: 'modern_minimalist',
    styleNumber: 1,
    title: 'Modern Minimalist',
    category: 'Retail',
    tagline: 'Clean sans-serif, hairline accents, compact QR, bold price badge',
    highlights: ['Hairline Accents', 'Compact QR', 'Solid Price Badge', 'Swiss Sans-Serif']
  },
  {
    id: 'boutique_luxury',
    styleNumber: 2,
    title: 'Boutique Luxury',
    category: 'Luxury',
    tagline: 'Serif typography, double border frame, centered micro-logo, discreet contact/phone',
    highlights: ['Serif Typography', 'Double Ornamental Border', 'Micro-Logo Emblem', 'Discreet TRN']
  },
  {
    id: 'high_density_industrial',
    styleNumber: 3,
    title: 'High-Density Industrial',
    category: 'Industrial',
    tagline: 'Full-width Code-128 linear barcode, bold SKU, compact weight and brand',
    highlights: ['Full-Width 1D Barcode', 'Bold Monospace SKU', 'Heavy Borders', 'Factory Density']
  },
  {
    id: 'dual_code_retail',
    styleNumber: 4,
    title: 'Dual-Code Retail',
    category: 'Retail',
    tagline: 'Stacked linear barcode and high-contrast 2D QR code for dual-scanner compatibility',
    highlights: ['Linear Barcode + 2D QR', 'Dual Scanner Ready', 'POS & Handheld Sync', 'High Contrast']
  },
  {
    id: 'big_price_live_drop',
    styleNumber: 5,
    title: 'Big Price Live Drop',
    category: 'Live Selling',
    tagline: 'Inverted solid black footer block with large white bold price',
    highlights: ['Massive Black Footer Block', 'Inverted White Price', 'Stream Drop Optimized', 'Fast Claim']
  },
  {
    id: 'master_bale_bulk',
    styleNumber: 6,
    title: 'Master Bale / Bulk Tag',
    category: 'Logistics',
    tagline: 'Company header, gross weight, piece capacity, batch ID, scannable inward QR',
    highlights: ['Gross KG / Grams Matrix', 'Piece Capacity', 'Inward Batch ID', 'Scannable Bale QR']
  },
  {
    id: 'jewelry_delicate',
    styleNumber: 7,
    title: 'Jewelry & Delicate Tag',
    category: 'Luxury',
    tagline: 'Ultra-slim format, mini QR, gram weight, and item name',
    highlights: ['Ultra-Slim Micro Layout', 'Precision Gram Weight', 'Mini QR Code', 'Jewelry & Eyewear']
  },
  {
    id: 'classic_apparel',
    styleNumber: 8,
    title: 'Classic Apparel Tag',
    category: 'Retail',
    tagline: 'Brand logo header, size badge, category title, wash care icons, barcode footer',
    highlights: ['Brand Logo Header', 'Size Pill Badge', 'Wash Care Symbol Strip', 'Retail Barcode Footer']
  },
  {
    id: 'split_grid_technical',
    styleNumber: 9,
    title: 'Split-Grid Technical',
    category: 'Industrial',
    tagline: '2 columns; left column metadata (brand, invoice, weight), right column QR & price',
    highlights: ['2-Column Balanced Grid', 'Left Metadata Stack', 'Right QR + Price Module', 'ERP Aligned']
  },
  {
    id: 'express_courier_waybill',
    styleNumber: 10,
    title: 'Express Courier Mini-Waybill',
    category: 'Logistics',
    tagline: 'Consignee/buyer handle, phone no, invoice ID, routing barcode, COD amount',
    highlights: ['Shipper/Consignee Split', 'COD Collection Pill', 'Routing Barcode', 'Buyer Instagram/Phone']
  },
  {
    id: 'live_stream_host',
    styleNumber: 11,
    title: 'Live Stream Host Tag',
    category: 'Live Selling',
    tagline: 'Bold Booth ID, live session timestamp, buyer handle, fast-claim QR',
    highlights: ['Prominent Booth ID Banner', 'Live Session Timestamp', 'Buyer Claim Handle', 'Fast Checkout QR']
  },
  {
    id: 'vintage_archive_retro',
    styleNumber: 12,
    title: 'Vintage Archive Retro',
    category: 'Luxury',
    tagline: 'Heavy vintage borders, retro typography, serial number, item category',
    highlights: ['Engraved Vintage Borders', 'Typewriter / Slab Typography', 'Archive Serial Number', 'Era Verification']
  },
  {
    id: 'security_authenticity',
    styleNumber: 13,
    title: 'Security & Authenticity Tag',
    category: 'Eco & Security',
    tagline: 'Tamper-evident layout with encrypted verification string and "ORIGINAL VINTAGE" seal',
    highlights: ['Tamper-Evident Guilloche', 'Encrypted Security String', 'Original Vintage Seal', 'Anti-Counterfeit']
  },
  {
    id: 'qr_express_scan',
    styleNumber: 14,
    title: 'QR Express Scan',
    category: 'Retail',
    tagline: '60% label area dedicated to a crisp vector QR code with SKU and phone footer',
    highlights: ['60% Dominant QR Area', 'Long-Distance Gun Scanning', 'Instant SKU Lookup', 'Minimalist Header/Footer']
  },
  {
    id: 'eco_textile_metric',
    styleNumber: 15,
    title: 'Eco Textile Metric Tag',
    category: 'Eco & Security',
    tagline: 'Fabric composition, exact gram weight, recycling batch, scannable QR',
    highlights: ['Fabric Composition', 'Recycling Batch & Eco Metrics', 'Circular Economy QR', 'Sustainability Matrix']
  }
];

export interface ThermalEngineConfig {
  // Company Branding
  companyName: string;
  logoUrl: string;
  phone: string;
  trn: string;

  // Transaction & Item Metadata
  invoiceNo: string;
  itemName: string;
  category: string;
  brandName: string;
  weightValue: number;
  weightUnit: 'g' | 'kg';
  priceAed: number;
  skuBarcode: string;

  // Contextual metadata for specialized styles
  size: string;
  consigneeName: string;
  buyerHandle: string;
  customerPhone: string;
  boothId: string;
  batchNo: string;
  fabricComposition: string;
  serialNumber: string;
  securityHash: string;
  isCod: boolean;
  codAmount: number;

  // Paper Dimensions
  presetId: ThermalPresetId;
  widthIn: number;
  heightIn: number;
  widthMm: number;
  heightMm: number;

  // Automation
  autoPrint: boolean;

  // Selected Style
  styleId: ThermalStyleId;
}

export const DEFAULT_THERMAL_ENGINE_CONFIG: ThermalEngineConfig = {
  companyName: 'VINTAGE VIBES DUBAI FZ-LLC',
  logoUrl: '',
  phone: '+971 4 883 9120',
  trn: '100482910300003',

  invoiceNo: 'INV-2026-8891',
  itemName: 'Vintage 1994 Levi’s 501 Trucker Jacket',
  category: 'Apparel / Heavy Denim',
  brandName: "Levi's Strauss & Co.",
  weightValue: 480,
  weightUnit: 'g',
  priceAed: 245.00,
  skuBarcode: 'VV-USA-501-8891',

  size: 'L (Chest 42")',
  consigneeName: 'Fatima Al Mansoori',
  buyerHandle: '@vintage_dubai_grails',
  customerPhone: '+971 50 789 4432',
  boothId: 'STUDIO BOOTH #03',
  batchNo: 'BALE-2026-DXB-04',
  fabricComposition: '100% Selvedge Indigo Cotton Denim',
  serialNumber: 'VV-ARC-1994-081',
  securityHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  isCod: true,
  codAmount: 245.00,

  presetId: '4x2',
  widthIn: 4.0,
  heightIn: 2.0,
  widthMm: 100,
  heightMm: 50,

  autoPrint: true,
  styleId: 'modern_minimalist'
};
