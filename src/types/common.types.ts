// Global ERP Common Types
export type DocumentStatus = 'DRAFT' | 'POSTED' | 'UNPOSTED' | 'ARCHIVED' | 'PARTIALLY_SORTED' | 'FULLY_SORTED' | 'UNOPENED' | 'CANCELLED';

export type RoleType = 'ADMIN' | 'MANAGER' | 'ACCOUNTANT' | 'INVENTORY_SUPERVISOR' | 'SALES_EXECUTIVE';

export type ModuleType = 
  | 'DASHBOARD'
  | 'AUTH' 
  | 'SETUP' 
  | 'FINANCE' 
  | 'PARTIES' 
  | 'HR' 
  | 'PURCHASE' 
  | 'INVENTORY' 
  | 'SALES' 
  | 'AUDIT'
  | 'MARKETING';

export type ActionType = 'CREATE' | 'EDIT' | 'UPDATE' | 'DELETE' | 'POST' | 'UNPOST' | 'VIEW' | 'RETURN';

export type AccountClassification = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

export type VoucherType = 'JV' | 'BRV' | 'BPV' | 'CRV' | 'CPV' | 'JOURNAL' | 'PURCHASE' | 'SALES' | 'PAYMENT' | 'RECEIPT';

export type PartyType = 'CLIENT' | 'SUPPLIER' | 'AGENT' | 'COURIER';

export type CurrencyCode = 'AED' | 'USD' | 'EUR' | 'GBP' | 'SAR' | 'PKR' | (string & {});

export type PackagingUOM = 'BAGS' | 'BALES' | 'SACKS' | 'CARTON' | 'PIECE';

export type WeightUOM = 'KG' | 'LBS';

export interface AuditLogEntry {
  id: string;
  module: ModuleType;
  action: ActionType;
  documentRef: string;
  status: DocumentStatus;
  userId: string;
  userName: string;
  timestamp: string;
  details: string;
  metaPayload?: any;
}
