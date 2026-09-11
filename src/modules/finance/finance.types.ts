import { AccountClassification, VoucherType, DocumentStatus, CurrencyCode } from '../../types/common.types.ts';

export interface COAAccount {
  id: string;
  code: string; // e.g. "1000-01-001"
  name: string;
  classification: AccountClassification;
  tierLevel: number; // 1 to 5
  parentCode?: string;
  currency: CurrencyCode;
  currentBalance: number;
  isSystem: boolean;
  isActive: boolean;
}

export interface VoucherLine {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  debitAmount: number;
  creditAmount: number;
  memo?: string;
  narration?: string;
}

export interface Voucher {
  id: string;
  voucherNo: string; // e.g. "JV-2026-0001", "BRV-2026-0004"
  type: VoucherType;
  status: DocumentStatus;
  date: string;
  narration: string;
  totalDebit: number;
  totalCredit: number;
  currency: CurrencyCode;
  exchangeRate: number;
  lines: VoucherLine[];
  postedAt?: string;
  postedBy?: string;
  documentRef?: string;
}

export interface LedgerEntry {
  id: string;
  voucherId: string;
  voucherNo: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  date: string;
  debit: number;
  credit: number;
  runningBalance: number;
  documentRef: string;
  partyId?: string;
  narration: string;
  debitAmount?: number;
  creditAmount?: number;
  balanceAfter?: number;
}

export interface TrialBalanceRow {
  accountCode: string;
  accountName: string;
  classification: AccountClassification;
  debit: number;
  credit: number;
}

export interface FinancialStatements {
  trialBalance: TrialBalanceRow[];
  balanceSheet: {
    assets: { accounts: { code: string; name: string; balance: number }[]; total: number };
    liabilities: { accounts: { code: string; name: string; balance: number }[]; total: number };
    equity: { accounts: { code: string; name: string; balance: number }[]; total: number };
    balanced: boolean;
  };
  incomeStatement: {
    revenue: { accounts: { code: string; name: string; balance: number }[]; total: number };
    expenses: { accounts: { code: string; name: string; balance: number }[]; total: number };
    netProfit: number;
  };
}

export interface BudgetLimit {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  periodMonth: string; // YYYY-MM e.g. "2026-09"
  budgetLimitAed: number;
  notes?: string;
  actualSpentAed: number;
  varianceAed: number; // budgetLimitAed - actualSpentAed
  percentUsed: number; // (actualSpentAed / budgetLimitAed) * 100
  status: 'ON_TRACK' | 'WARNING' | 'EXCEEDED';
  updatedAt: string;
}

export interface CustomReportSection {
  id: string;
  title: string;
  type: 'REVENUE' | 'COGS' | 'EXPENSE';
  accountIds: string[];
}

export interface CustomReportTemplate {
  id: string;
  name: string;
  description: string;
  sections: CustomReportSection[];
  createdAt: string;
  updatedAt?: string;
}

export interface ExecutedCustomReportSection {
  id: string;
  title: string;
  type: 'REVENUE' | 'COGS' | 'EXPENSE';
  accounts: {
    id: string;
    code: string;
    name: string;
    balance: number;
  }[];
  subtotal: number;
}

export interface ExecutedCustomReport {
  templateId: string;
  templateName: string;
  sections: ExecutedCustomReportSection[];
  totalRevenue: number;
  totalCOGS: number;
  grossProfit: number;
  totalExpenses: number;
  netOperatingIncome: number;
  generatedAt: string;
}

export interface RecurringVoucherTemplate {
  id: string;
  title: string;
  voucherType: VoucherType;
  frequency: 'MONTHLY' | 'BI_WEEKLY' | 'QUARTERLY';
  dayOfMonth: number; // 1 to 31
  narration: string;
  currency: CurrencyCode;
  exchangeRate: number;
  lines: VoucherLine[];
  totalAmount: number;
  isActive: boolean;
  lastRunDate?: string;
  nextDueDate: string;
  createdAt: string;
}

