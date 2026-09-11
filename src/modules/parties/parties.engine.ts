import { Party, PartyAccountMap, PartyKhataLog } from './parties.types.ts';
import { COAAccount } from '../finance/finance.types.ts';

export class PartiesEngine {
  /**
   * Automatically provisions linked COA sub-accounts when a new Party is registered
   */
  public static provisionPartyCOAAccounts(
    party: Omit<Party, 'id' | 'code' | 'currentBalance' | 'accountMap' | 'createdAt'>,
    nextCodeIndex: number
  ): {
    generatedAccounts: Omit<COAAccount, 'id' | 'currentBalance'>[];
    accountMap: PartyAccountMap;
  } {
    const padded = String(nextCodeIndex).padStart(3, '0');
    const generatedAccounts: Omit<COAAccount, 'id' | 'currentBalance'>[] = [];
    const accountMap: PartyAccountMap = {};

    if (party.type === 'CLIENT') {
      const parentAr = (party as any).receivableAccountId || '1120-00';
      const parentRev = (party as any).revenueAccountId || '4110-00';

      // 1. Accounts Receivable (Asset - Tier 3)
      const arCode = `${parentAr.replace(/-00$/, '')}-01-${padded}`;
      generatedAccounts.push({
        code: arCode,
        name: `AR - ${party.name}`,
        classification: 'ASSET',
        tierLevel: 3,
        parentCode: parentAr,
        currency: party.currency,
        isSystem: false,
        isActive: true
      });
      accountMap.receivableAccountId = arCode;

      // 2. Client Direct Sales Revenue (Revenue - Tier 3)
      const revCode = `${parentRev.replace(/-00$/, '')}-01-${padded}`;
      generatedAccounts.push({
        code: revCode,
        name: `Sales Revenue - ${party.name}`,
        classification: 'REVENUE',
        tierLevel: 3,
        parentCode: parentRev,
        currency: party.currency,
        isSystem: false,
        isActive: true
      });
      accountMap.revenueAccountId = revCode;
    } else if (party.type === 'SUPPLIER') {
      const parentAp = (party as any).payableAccountId || '2110-00';
      const parentClr = (party as any).clearingAccountId || '1310-00';

      // 1. Accounts Payable (Liability - Tier 3)
      const apCode = `${parentAp.replace(/-00$/, '')}-01-${padded}`;
      generatedAccounts.push({
        code: apCode,
        name: `AP - ${party.name}`,
        classification: 'LIABILITY',
        tierLevel: 3,
        parentCode: parentAp,
        currency: party.currency,
        isSystem: false,
        isActive: true
      });
      accountMap.payableAccountId = apCode;

      // 2. Goods Inward Clearing (Asset - Tier 3)
      const clrCode = `${parentClr.replace(/-00$/, '')}-01-${padded}`;
      generatedAccounts.push({
        code: clrCode,
        name: `Bales Inventory / Clearing - ${party.name}`,
        classification: 'ASSET',
        tierLevel: 3,
        parentCode: parentClr,
        currency: party.currency,
        isSystem: false,
        isActive: true
      });
      accountMap.clearingAccountId = clrCode;
    } else if (party.type === 'AGENT') {
      // Clearing & Commission Agent Expense (Expense - Tier 3)
      const commCode = `5210-01-${padded}`;
      generatedAccounts.push({
        code: commCode,
        name: `Agent Clearing Commission - ${party.name}`,
        classification: 'EXPENSE',
        tierLevel: 3,
        parentCode: '5210-00',
        currency: party.currency,
        isSystem: false,
        isActive: true
      });
      accountMap.commissionAccountId = commCode;
    }

    return { generatedAccounts, accountMap };
  }

  /**
   * Recalculates party khata balance from chronological transactions
   */
  public static calculateKhataBalance(logs: PartyKhataLog[]): number {
    let running = 0;
    logs.forEach(log => {
      running += (log.debit - log.credit);
    });
    return Number(running.toFixed(2));
  }
}
