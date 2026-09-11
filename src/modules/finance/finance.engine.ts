import { COAAccount, Voucher, LedgerEntry, FinancialStatements, TrialBalanceRow } from './finance.types.ts';

export class FinanceEngine {
  /**
   * Validates dual-entry balance rule: Total Debits must equal Total Credits
   */
  public static validateDoubleEntry(voucher: Voucher): { isValid: boolean; difference: number; error?: string } {
    if (!voucher.lines || voucher.lines.length < 2) {
      return { isValid: false, difference: 0, error: 'A voucher must have at least two line items' };
    }

    const totalDebit = voucher.lines.reduce((sum, line) => sum + (Number(line.debitAmount) || 0), 0);
    const totalCredit = voucher.lines.reduce((sum, line) => sum + (Number(line.creditAmount) || 0), 0);

    const difference = Math.abs(Number((totalDebit - totalCredit).toFixed(2)));

    if (difference !== 0) {
      return {
        isValid: false,
        difference,
        error: `Debits (AED ${totalDebit.toFixed(2)}) and Credits (AED ${totalCredit.toFixed(2)}) are out of balance by AED ${difference.toFixed(2)}`
      };
    }

    return { isValid: true, difference: 0 };
  }

  /**
   * Dispatches dual-entry postings into immutable ledger records and updates COA balances
   */
  public static postVoucherToLedger(
    voucher: Voucher,
    accounts: COAAccount[],
    existingLedgers: LedgerEntry[]
  ): { newLedgers: LedgerEntry[]; updatedAccounts: COAAccount[] } {
    const newLedgers: LedgerEntry[] = [];
    const accountsMap = new Map<string, COAAccount>();

    accounts.forEach(acc => accountsMap.set(acc.id, { ...acc }));

    voucher.lines.forEach((line, idx) => {
      const account = accountsMap.get(line.accountId);
      if (!account) return;

      const debit = Number(line.debitAmount) || 0;
      const credit = Number(line.creditAmount) || 0;

      // Normal balance accounting calculation:
      // ASSET & EXPENSE: Balance = Prior + Debit - Credit
      // LIABILITY, EQUITY & REVENUE: Balance = Prior + Credit - Debit
      let delta = 0;
      if (account.classification === 'ASSET' || account.classification === 'EXPENSE') {
        delta = debit - credit;
      } else {
        delta = credit - debit;
      }

      const priorBalance = account.currentBalance;
      const newBalance = Number((priorBalance + delta).toFixed(2));
      account.currentBalance = newBalance;

      const ledgerEntry: LedgerEntry = {
        id: `led-${voucher.id}-${idx}-${Date.now()}`,
        voucherId: voucher.id,
        voucherNo: voucher.voucherNo,
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        date: voucher.date,
        debit,
        credit,
        runningBalance: newBalance,
        documentRef: voucher.documentRef || voucher.voucherNo,
        narration: line.memo || voucher.narration
      };

      newLedgers.push(ledgerEntry);
    });

    return {
      newLedgers,
      updatedAccounts: Array.from(accountsMap.values())
    };
  }

  /**
   * Reverses ledger postings when a voucher is unposted
   */
  public static unpostVoucherFromLedger(
    voucherId: string,
    accounts: COAAccount[],
    ledgers: LedgerEntry[]
  ): { remainingLedgers: LedgerEntry[]; updatedAccounts: COAAccount[] } {
    const voucherLedgers = ledgers.filter(l => l.voucherId === voucherId);
    const remainingLedgers = ledgers.filter(l => l.voucherId !== voucherId);
    const accountsMap = new Map<string, COAAccount>();

    accounts.forEach(acc => accountsMap.set(acc.id, { ...acc }));

    voucherLedgers.forEach(entry => {
      const account = accountsMap.get(entry.accountId);
      if (!account) return;

      let delta = 0;
      if (account.classification === 'ASSET' || account.classification === 'EXPENSE') {
        delta = entry.debit - entry.credit;
      } else {
        delta = entry.credit - entry.debit;
      }

      // Reverse delta
      account.currentBalance = Number((account.currentBalance - delta).toFixed(2));
    });

    return {
      remainingLedgers,
      updatedAccounts: Array.from(accountsMap.values())
    };
  }

  /**
   * Generates full Financial Statements: Trial Balance, Balance Sheet, and Income Statement
   */
  public static generateFinancialStatements(accounts: COAAccount[]): FinancialStatements {
    const trialBalance: TrialBalanceRow[] = accounts.map(acc => {
      let debit = 0;
      let credit = 0;

      if (acc.classification === 'ASSET' || acc.classification === 'EXPENSE') {
        if (acc.currentBalance >= 0) {
          debit = acc.currentBalance;
        } else {
          credit = Math.abs(acc.currentBalance);
        }
      } else {
        if (acc.currentBalance >= 0) {
          credit = acc.currentBalance;
        } else {
          debit = Math.abs(acc.currentBalance);
        }
      }

      return {
        accountCode: acc.code,
        accountName: acc.name,
        classification: acc.classification,
        debit: Number(debit.toFixed(2)),
        credit: Number(credit.toFixed(2))
      };
    });

    // Income Statement: Revenue vs Expenses
    const revenueAccs = accounts.filter(a => a.classification === 'REVENUE');
    const expenseAccs = accounts.filter(a => a.classification === 'EXPENSE');

    const totalRevenue = revenueAccs.reduce((sum, a) => sum + a.currentBalance, 0);
    const totalExpenses = expenseAccs.reduce((sum, a) => sum + a.currentBalance, 0);
    const netProfit = Number((totalRevenue - totalExpenses).toFixed(2));

    // Balance Sheet: Assets = Liabilities + Equity + (Net Profit)
    const assetAccs = accounts.filter(a => a.classification === 'ASSET');
    const liabilityAccs = accounts.filter(a => a.classification === 'LIABILITY');
    const equityAccs = accounts.filter(a => a.classification === 'EQUITY');

    const totalAssets = Number(assetAccs.reduce((sum, a) => sum + a.currentBalance, 0).toFixed(2));
    const totalLiabilities = Number(liabilityAccs.reduce((sum, a) => sum + a.currentBalance, 0).toFixed(2));
    const totalEquity = Number((equityAccs.reduce((sum, a) => sum + a.currentBalance, 0) + netProfit).toFixed(2));

    const balanced = Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.05;

    return {
      trialBalance,
      balanceSheet: {
        assets: {
          accounts: assetAccs.map(a => ({ code: a.code, name: a.name, balance: a.currentBalance })),
          total: totalAssets
        },
        liabilities: {
          accounts: liabilityAccs.map(a => ({ code: a.code, name: a.name, balance: a.currentBalance })),
          total: totalLiabilities
        },
        equity: {
          accounts: [
            ...equityAccs.map(a => ({ code: a.code, name: a.name, balance: a.currentBalance })),
            { code: 'NET-PROFIT-YTD', name: 'Net Profit / Retained Earnings (Current Year)', balance: netProfit }
          ],
          total: totalEquity
        },
        balanced
      },
      incomeStatement: {
        revenue: {
          accounts: revenueAccs.map(a => ({ code: a.code, name: a.name, balance: a.currentBalance })),
          total: totalRevenue
        },
        expenses: {
          accounts: expenseAccs.map(a => ({ code: a.code, name: a.name, balance: a.currentBalance })),
          total: totalExpenses
        },
        netProfit
      }
    };
  }
}
