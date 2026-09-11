import { DocumentStatus, CurrencyCode } from '../../types/common.types.ts';

export interface SalesGatePassItem {
  id: string;
  pieceId: string;
  barcode: string;
  itemName: string;
  brandName: string;
  size: string;
  weightKg: number;
  unitPrice: number;
  discountPercent: number;
  netPrice: number;
}

export interface SalesGatePass {
  id: string;
  gatePassNo: string; // "SGP-2026-0001"
  customerId: string;
  customerName: string;
  date: string;
  status: DocumentStatus;
  totalPieces: number;
  totalWeight: number;
  estimatedAmount: number;
  isConverted: boolean;
  salesInvoiceId?: string;
  items: SalesGatePassItem[];
  postedAt?: string;
}

export interface SalesInvoiceItem {
  id: string;
  barcode: string;
  description: string;
  weightKg: number;
  weightGrams?: number;
  costPerGram?: number;
  calculatedCostPrice?: number;
  unitPrice: number;
  discount: number;
  finalAmount: number;
  lineTotal?: number;
  quantity?: number;
  itemName?: string;
  isReturned?: boolean;
  // B2B Custom Sales Fields
  isRawBale?: boolean;
  baleCode?: string;
  baleCategory?: string;
  grossWeightKg?: number;
  ratePerKg?: number;
  pricingMode?: 'PER_KG' | 'FLAT';
  brandName?: string;
  labelGrade?: string;
  size?: string;
}

export interface SalesInvoiceOtherCharge {
  id: string;
  title: string;
  amount: number;
  vatApplicable: boolean;
  coaHead?: string; // e.g. 4310-00 (Delivery) or 4210-00 (Packaging)
}

export interface SalesInvoice {
  id: string;
  invoiceNo: string; // "SLS-2026-0001"
  salesGatePassId?: string;
  salesGatePassNo?: string;
  customerId: string;
  customerName: string;
  customerPhone?: string;
  customerTrn?: string;
  customerAddress?: string;
  clientName?: string;
  clientTrn?: string;
  clientId?: string;
  date: string;
  time?: string;
  boothId?: string;
  hostName?: string;
  socialPlatform?: 'TIKTOK' | 'INSTAGRAM' | 'FACEBOOK' | 'YOUTUBE' | 'CUSTOM';
  buyerHandle?: string;
  status: DocumentStatus;
  currency: CurrencyCode;
  exchangeRate: number;
  subTotal: number;
  discountAmount: number;
  vatAmount: number; // 5% VAT
  totalAmount: number;
  grandTotalAED?: number;
  netAmount?: number;
  grossAmount?: number;
  items: SalesInvoiceItem[];
  postedAt?: string;
  postedBy?: string;
  paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'CREDIT_ACCOUNT' | 'COD' | 'CARD_POS';
  paymentStatus?: 'UNPAID_PENDING_COD' | 'PREPAID_VERIFIED' | 'PARTIAL_ADVANCE' | 'RETURNED';
  paymentReference?: string;
  trackingNumber?: string;
  shippingCharge?: number;
  shippingFeeAed?: number;
  shippingBearer?: 'COMPANY' | 'CUSTOMER';
  shippingAddress?: string;
  courierPartner?: 'DHL' | 'EMIRATES_POST' | 'ARAMEX' | 'FETCHR' | 'LOCAL_DELIVERY' | string;
  grossProfitAed?: number;
  grossProfitPercent?: number;
  expiresAt?: string;
  isReturned?: boolean;
  returnStatus?: 'NONE' | 'PARTIAL_RETURN' | 'FULL_RTO';
  rtoVoucherId?: string;
  // B2B Corporate Wholesale Fields
  isB2BCustomSale?: boolean;
  taxType?: 'MAINLAND_5_VAT' | 'EXPORT_ZERO_RATED';
  exportCustomsDeclarationNo?: string;
  otherCharges?: SalesInvoiceOtherCharge[];
  advanceAmountPaid?: number;
  creditAmountDue?: number;
  pdcChequeNo?: string;
  pdcChequeDate?: string;
  salespersonOrBroker?: string;
  brokerCommissionPercent?: number;
  brokerCommissionAmount?: number;
  packingListNotes?: string;
  creditLimitSnapshot?: number;
  outstandingBalanceSnapshot?: number;
}

export interface ParcelReturnItem {
  barcode: string;
  description: string;
  weightGrams: number;
  weightKg: number;
  costPerGram: number;
  calculatedCostPrice: number;
  salePrice: number;
}

export interface ParcelReturnRecord {
  id: string;
  returnNo: string; // "RTO-2026-0001"
  invoiceId: string;
  invoiceNo: string;
  trackingNumber: string;
  customerId: string;
  customerName: string;
  customerPhone?: string;
  returnDate: string;
  reason: 'REJECTED_AT_DOORSTEP' | 'WRONG_ITEM' | 'CUSTOMER_UNAVAILABLE' | 'DAMAGED_TRANSIT' | 'BUYER_CANCELLED';
  courierPartner: string;
  courierReturnCharge: number; // e.g. 25 AED
  returnedItems: ParcelReturnItem[];
  totalSaleRefunded: number;
  totalCOGSReversed: number;
  voucherId?: string;
  voucherNo?: string;
  status: 'COMPLETED' | 'PENDING';
  processedBy: string;
  processedAt: string;
  notes?: string;
}

