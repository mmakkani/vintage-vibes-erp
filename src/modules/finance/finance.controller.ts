import { COAAccount, Voucher, LedgerEntry, FinancialStatements } from './finance.types.ts';
import { FinanceEngine } from './finance.engine.ts';
import { relationalStore } from '../../db/relationalStore.ts';

export class FinanceController {
  public static getCOA(): COAAccount[] {
    return relationalStore.getCOA();
  }

  public static addAccount(account: Omit<COAAccount, 'id' | 'currentBalance'>): COAAccount {
    return relationalStore.addCOAAccount(account);
  }

  public static getVouchers(): Voucher[] {
    return relationalStore.getVouchers();
  }

  public static createVoucher(voucherData: Omit<Voucher, 'id' | 'voucherNo' | 'status'>): {
    success: boolean;
    voucher?: Voucher;
    error?: string;
  } {
    const totalDebit = voucherData.lines.reduce((sum, l) => sum + (Number(l.debitAmount) || 0), 0);
    const totalCredit = voucherData.lines.reduce((sum, l) => sum + (Number(l.creditAmount) || 0), 0);

    const validation = FinanceEngine.validateDoubleEntry({
      ...voucherData,
      id: '',
      voucherNo: '',
      status: 'DRAFT',
      totalDebit,
      totalCredit
    });

    if (!validation.isValid) {
      return { success: false, error: validation.error };
    }

    const voucher = relationalStore.createVoucher({
      ...voucherData,
      totalDebit,
      totalCredit,
      status: 'DRAFT'
    });

    return { success: true, voucher };
  }

  public static postVoucher(voucherId: string, postedBy: string): { success: boolean; error?: string } {
    return relationalStore.postVoucher(voucherId, postedBy);
  }

  public static unpostVoucher(voucherId: string): { success: boolean; error?: string } {
    return relationalStore.unpostVoucher(voucherId);
  }

  public static getLedger(accountId?: string, partyId?: string): LedgerEntry[] {
    let ledgers = relationalStore.getLedgers();
    if (accountId) {
      ledgers = ledgers.filter(l => l.accountId === accountId);
    }
    if (partyId) {
      ledgers = ledgers.filter(l => l.partyId === partyId);
    }
    return ledgers;
  }

  public static getFinancialStatements(): FinancialStatements {
    const accounts = relationalStore.getCOA();
    return FinanceEngine.generateFinancialStatements(accounts);
  }

  // Budgets
  public static getBudgets(periodMonth?: string) {
    return relationalStore.getBudgets(periodMonth || '2026-09');
  }

  public static setBudget(data: { accountId: string; periodMonth: string; budgetLimitAed: number; notes?: string }) {
    return relationalStore.setBudget(data);
  }

  public static deleteBudget(id: string) {
    return relationalStore.deleteBudget(id);
  }

  public static seedDefaultBudgets(periodMonth: string) {
    return relationalStore.seedDefaultBudgets(periodMonth);
  }

  // Custom Reports
  public static getCustomReports() {
    return relationalStore.getCustomReportTemplates();
  }

  public static saveCustomReport(template: any) {
    return relationalStore.saveCustomReportTemplate(template);
  }

  public static deleteCustomReport(id: string) {
    return relationalStore.deleteCustomReportTemplate(id);
  }

  public static executeCustomReport(id: string) {
    return relationalStore.executeCustomReport(id);
  }

  // Recurring Vouchers
  public static getRecurringVouchers() {
    return relationalStore.getRecurringVoucherTemplates();
  }

  public static saveRecurringVoucher(template: any) {
    return relationalStore.saveRecurringVoucherTemplate(template);
  }

  public static deleteRecurringVoucher(id: string) {
    return relationalStore.deleteRecurringVoucherTemplate(id);
  }

  public static runRecurringVoucher(id: string, runDate?: string) {
    return relationalStore.runRecurringVoucher(id, runDate);
  }

  public static runAllDueRecurringVouchers(runDate?: string) {
    return relationalStore.runAllDueRecurringVouchers(runDate);
  }

  // UAE FTA Audit File (FAF v1.0)
  public static generateFtaAuditFile(startDate?: string, endDate?: string) {
    return relationalStore.generateFtaAuditFile(startDate, endDate);
  }

  // UAE Corporate Tax (9%)
  public static calculateCorporateTaxEstimate(taxYear?: number) {
    return relationalStore.calculateCorporateTaxEstimate(taxYear);
  }

  public static postCorporateTaxProvision(taxYear?: number, postedBy?: string) {
    return relationalStore.postCorporateTaxProvision(taxYear, postedBy);
  }
}
