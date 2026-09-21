import { PartyType, CurrencyCode } from '../../types/common.types.ts';

export interface PartyAccountMap {
  receivableAccountId?: string;
  payableAccountId?: string;
  clearingAccountId?: string;
  revenueAccountId?: string;
  commissionAccountId?: string;
}

export interface PartyKhataLog {
  id: string;
  partyId: string;
  date: string;
  docType: 'INVOICE' | 'PAYMENT' | 'RECEIPT' | 'CREDIT_NOTE' | 'JV' | 'RETURN';
  docRef: string;
  debit: number;
  credit: number;
  balance: number;
  description: string;
}

export interface PartyRow {
  party_id: number;
  id: string;
  code: string;
  name: string;
  company_name: string;
  party_type: string;
  type: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  contact_person?: string | null;
  contact_designation?: string | null;
  trade_license_no?: string | null;
  license_expiry_date?: string | null;
  bank_name?: string | null;
  iban?: string | null;
  swift_code?: string | null;
  payment_terms?: string | null;
  opening_balance?: number | null;
  business_card_url?: string | null;
  tin_or_ntn?: string | null;
  trn_no?: string | null;
  credit_limit?: number | null;
  current_balance?: number | null;
  currency?: string | null;
  is_active?: boolean | null;
  account_map?: PartyAccountMap | null;
  coa_account_id?: string | null;
  linked_account_id?: number | null;
  created_at?: string | null;
}

export interface PartyFormData {
  name: string;
  company_name?: string;
  type: PartyType;
  party_type?: string;
  contact_person?: string;
  contactPerson?: string;
  contact_designation?: string;
  contactDesignation?: string;
  trade_license_no?: string;
  tradeLicenseNo?: string;
  license_expiry_date?: string;
  licenseExpiryDate?: string;
  bank_name?: string;
  bankName?: string;
  iban?: string;
  swift_code?: string;
  swiftCode?: string;
  payment_terms?: string;
  paymentTerms?: string;
  opening_balance?: number;
  openingBalance?: number;
  business_card_url?: string;
  businessCardUrl?: string;
  phone: string;
  email?: string;
  address?: string;
  trn_no?: string;
  trnNo?: string;
  credit_limit?: number;
  creditLimit?: number;
  currency?: CurrencyCode;
  payable_account_id?: string;
  payableAccountId?: string;
  receivable_account_id?: string;
  receivableAccountId?: string;
  clearing_account_id?: string;
  clearingAccountId?: string;
  revenue_account_id?: string;
  revenueAccountId?: string;
  inventory_account_id?: string;
}

export interface Party {
  party_id?: number;
  id: string;
  code: string; // "CLI-001", "SUP-001", "AGT-001"
  name: string;
  company_name?: string;
  companyName?: string;
  type: PartyType;
  party_type?: string;
  partyType?: string;
  contact_person?: string;
  contactPerson?: string;
  contact_designation?: string;
  contactDesignation?: string;
  trade_license_no?: string;
  tradeLicenseNo?: string;
  license_expiry_date?: string;
  licenseExpiryDate?: string;
  bank_name?: string;
  bankName?: string;
  iban?: string;
  swift_code?: string;
  swiftCode?: string;
  payment_terms?: string;
  paymentTerms?: string;
  opening_balance?: number;
  openingBalance?: number;
  business_card_url?: string;
  businessCardUrl?: string;
  phone: string;
  email?: string;
  address?: string;
  tin_or_ntn?: string;
  tinOrNtn?: string;
  trn_no?: string;
  trnNo?: string;
  credit_limit?: number;
  creditLimit: number;
  current_balance?: number;
  currentBalance: number; // Positive = Customer owes us (Receivable), Negative = We owe supplier (Payable)
  currency: CurrencyCode;
  is_active?: boolean;
  isActive: boolean;
  account_map?: PartyAccountMap;
  accountMap: PartyAccountMap;
  coa_account_id?: string;
  coaAccountId?: string;
  linked_account_id?: number;
  linkedAccountId?: number;
  created_at?: string;
  createdAt: string;
  purchaseInvoicesCount?: number;
  salesInvoicesCount?: number;
  khataLogsCount?: number;
  glEntriesCount?: number;
  totalEntriesCount?: number;
  hasEntries?: boolean;
}

export interface VisitingCard {
  id: string;
  companyName?: string;
  company_name?: string;
  contactPerson?: string;
  contact_person?: string;
  designation?: string;
  phone?: string;
  email?: string;
  address?: string;
  website?: string;
  cardImageUrl?: string;
  card_image_url?: string;
  notes?: string;
  status?: 'LEAD' | 'CONVERTED';
  convertedPartyId?: string;
  converted_party_id?: string;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
}

