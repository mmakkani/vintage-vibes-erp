import { DocumentStatus, PackagingUOM, WeightUOM, CurrencyCode } from '../../types/common.types.ts';

export interface PurchaseInvoiceItem {
  id: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  packagingUom: PackagingUOM;
  packageCount: number; // e.g., 5 Bales
  weightUom: WeightUOM;
  totalWeight: number; // e.g. 500 KG
  ratePerWeight: number; // e.g. 25 AED per KG
  lineTotal: number;
}

export interface PurchaseInvoice {
  id: string;
  invoiceNo: string; // "PUR-2026-0001"
  supplierId: string;
  supplierName: string;
  supplierTrn?: string;
  date: string;
  dueDate?: string;
  status: DocumentStatus;
  currency: CurrencyCode;
  exchangeRate: number;
  subTotal: number;
  applyVat?: boolean;
  vatRatePercent?: number;
  vatAmount: number;
  totalAmount: number;
  notes?: string;
  convertedToInward: boolean;
  inwardGatePassId?: string;
  items?: PurchaseInvoiceItem[];
  containerNo?: string;
  blAirwayBillNo?: string;
  portOfEntry?: string;
  freightAmount?: number;
  customsDutyAmount?: number;
  terminalHandlingAmount?: number;
  totalBalesCount?: number;
  totalGrossWeightKg?: number;
  grossAmount?: number;
  netAmount?: number;
  grandTotalAed?: number;
}

export interface PieceBreakdownItem {
  id: string;
  gatePassId: string;
  baleCode?: string;
  barcode: string; // "VV-BAL-001-0001"
  itemId?: string;
  itemName: string;
  brandName: string;
  brandTier: string;
  labelGrade: string; // "Grade A Cream", "Grade B", "Vintage Grail"
  shopLocation: string; // "Shop 01", "Main Warehouse"
  weightKg: number;
  weightGrams?: number; // Weight in grams (e.g. 285 g)
  costPerGram?: number; // Base cost per gram (AED / g)
  calculatedCostPrice?: number; // weightGrams * costPerGram (AED)
  costPrice?: number; // Alias for calculated cost
  estimatedPrice: number; // Retail sale price
  // Studio photos: Front, Back, and Tag (OCR)
  frontImageUrl?: string;
  backImageUrl?: string;
  tagImageUrl?: string;
  sizeScanned: string; // "L", "XL", "32x34"
  countryOfOrigin: string; // "USA", "Japan", "Italy"
  style: string; // "Denim Trucker 90s", "Graphic Print Tee"
  isSold: boolean;
  isTagged?: boolean;
  soldInvoiceId?: string;
  createdAt: string;
  status?: 'IN_STOCK' | 'SOLD' | 'DAMAGED' | 'RESERVED' | 'CLAIMED_PENDING';
  grade?: string;
  retailPriceAed?: number;
  soldPriceAed?: number;
  lockedByBuyer?: string;
  lockedByBooth?: string;
  lockExpiresAt?: number;
  reservedUntil?: number;
  lockedChannel?: string;
  lockedPrice?: number;
  pitToPitInches?: number;
  lengthInches?: number;
  fitSilhouette?: string;
}

export interface InwardGatePass {
  id: string;
  gatePassNo: string; // "IGP-2026-0001"
  baleCode?: string; // "VV-B01"
  baleCategory?: string; // "Jackets", "Hoodies", "Vintage Mix"
  purchaseInvoiceId: string;
  purchaseInvoiceNo: string;
  supplierId?: string;
  supplierName: string;
  date: string;
  status: DocumentStatus | 'PARTIALLY_SORTED' | 'FULLY_SORTED' | 'UNOPENED' | 'COMPLETED';
  sortingStatus?: 'UNOPENED' | 'PARTIALLY_SORTED' | 'FULLY_SORTED' | 'COMPLETED';
  totalBaleCost?: number; // Total cost of bale from purchase invoice (e.g. 1000 AED)
  totalBaleWeight: number; // e.g. 20.00 KG
  costPerGram?: number; // totalBaleCost / (totalBaleWeight * 1000)
  brokenDownWeight: number; // Sum of piece weights in KG
  remainingWeight: number; // totalBaleWeight - brokenDownWeight in KG
  pieceCount: number;
  vehicleNo?: string;
  containerNo?: string;
  pieces: PieceBreakdownItem[];
  postedAt?: string;
  lastSavedAt?: string;
  billOfLading?: string;
  vesselName?: string;
  portOfLoading?: string;
  baleBatchNo?: string;
  totalBales?: number;
  totalWeightKg?: number;
}

export type BaleInwardMaster = InwardGatePass;

export interface InventoryFilterOptions {
  searchBarcode?: string;
  brandName?: string;
  labelGrade?: string;
  itemCategory?: string;
  soldStatus?: 'ALL' | 'IN_STOCK' | 'SOLD';
}
