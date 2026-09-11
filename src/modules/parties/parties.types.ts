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

export interface Party {
  id: string;
  code: string; // "CLI-001", "SUP-001", "AGT-001"
  name: string;
  type: PartyType;
  contactPerson?: string;
  phone: string;
  email?: string;
  address?: string;
  trnNo?: string;
  creditLimit: number;
  currentBalance: number; // Positive = Customer owes us (Receivable), Negative = We owe supplier (Payable)
  currency: CurrencyCode;
  isActive: boolean;
  accountMap: PartyAccountMap;
  coaAccountId?: string;
  coa_account_id?: string;
  createdAt: string;
}
