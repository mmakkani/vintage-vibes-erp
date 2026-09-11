import { supabase } from '../supabaseClient.ts';
import { COAAccount, Voucher, LedgerEntry } from '../modules/finance/finance.types.ts';

export class FinanceService {
  // --- Chart of Accounts (COA) ---
  public static async getCoaAccounts(): Promise<COAAccount[]> {
    const { data, error } = await supabase
      .from('coa_accounts')
      .select('*')
      .order('code');

    if (error) {
      console.error('Supabase error on coa_accounts:', error);
      throw new Error(error.message || 'Database error occurred reading Chart of Accounts');
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      type: row.type,
      classification: row.type as any,
      subType: row.sub_type || row.subType || '',
      currency: row.currency || 'AED',
      currentBalance: Number(row.current_balance ?? row.currentBalance ?? 0),
      isActive: row.is_active !== false && row.isActive !== false,
      parentId: row.parent_id || row.parentId,
      tierLevel: row.tier_level || 1,
      parentCode: row.parent_code || '',
      isSystem: Boolean(row.is_system),
      createdAt: row.created_at
    }));
  }

  public static async addCoaAccount(acc: Partial<COAAccount>): Promise<COAAccount> {
    const id = acc.id || `acc-${acc.code || Date.now()}`;
    const payload = {
      id,
      code: acc.code,
      name: acc.name,
      type: acc.type || acc.classification || 'ASSET',
      sub_type: acc.subType || '',
      currency: acc.currency || 'AED',
      current_balance: Number(acc.currentBalance || 0),
      is_active: acc.isActive !== false,
      parent_id: acc.parentId || null
    };

    const { data, error } = await supabase
      .from('coa_accounts')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('Supabase error on coa_accounts:', error);
      throw new Error(error.message || 'Failed to add COA Account');
    }

    return {
      id: data.id,
      code: data.code,
      name: data.name,
      type: data.type,
      classification: data.type as any,
      currency: data.currency,
      currentBalance: Number(data.current_balance),
      isActive: data.is_active
    };
  }

  // --- Vouchers ---
  public static async getVouchers(): Promise<Voucher[]> {
    const { data, error } = await supabase
      .from('vouchers')
      .select('*')
      .order('date', { ascending: false });

    if (error) {
      console.error('Supabase error on vouchers:', error);
      throw new Error(error.message || 'Database error occurred reading vouchers');
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      voucherNo: row.voucher_no || row.voucherNo,
      date: row.date,
      type: row.type,
      reference: row.reference || '',
      narration: row.narration || '',
      totalDebit: Number(row.total_debit ?? row.totalDebit ?? 0),
      totalCredit: Number(row.total_credit ?? row.totalCredit ?? 0),
      status: row.status || 'POSTED',
      createdBy: row.created_by || row.createdBy || 'System',
      entries: [],
      createdAt: row.created_at
    }));
  }

  public static async addVoucher(v: Partial<Voucher>): Promise<Voucher> {
    const id = v.id || `vch-${Date.now()}`;
    const voucherNo = v.voucherNo || `VCH-${Date.now().toString().slice(-6)}`;
    const payload = {
      id,
      voucher_no: voucherNo,
      date: v.date || new Date().toISOString().slice(0, 10),
      type: v.type || 'JOURNAL',
      reference: v.reference || '',
      narration: v.narration || '',
      total_debit: Number(v.totalDebit || 0),
      total_credit: Number(v.totalCredit || 0),
      status: v.status || 'POSTED',
      created_by: v.createdBy || 'System'
    };

    const { data, error } = await supabase
      .from('vouchers')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('Supabase error on vouchers:', error);
      throw new Error(error.message || 'Failed to create voucher');
    }

    return {
      id: data.id,
      voucherNo: data.voucher_no,
      date: data.date,
      type: data.type,
      reference: data.reference,
      narration: data.narration,
      totalDebit: Number(data.total_debit),
      totalCredit: Number(data.total_credit),
      status: data.status,
      createdBy: data.created_by,
      entries: []
    };
  }

  public static async updateVoucherStatus(id: string, status: string): Promise<void> {
    const { error } = await supabase.from('vouchers').update({ status }).eq('id', id);
    if (error) {
      console.error('Supabase error on vouchers:', error);
      throw new Error(error.message || 'Failed to update voucher status');
    }
  }

  // --- Ledgers ---
  public static async getLedgers(accountId?: string): Promise<LedgerEntry[]> {
    let query = supabase.from('ledgers').select('*').order('date', { ascending: false });
    if (accountId) {
      query = query.eq('account_id', accountId);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Supabase error on ledgers:', error);
      throw new Error(error.message || 'Database error occurred reading ledgers');
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      voucherId: row.voucher_id || row.voucherId,
      accountId: row.account_id || row.accountId,
      accountCode: row.account_code || row.accountCode,
      accountName: row.account_name || row.accountName,
      date: row.date,
      debit: Number(row.debit || 0),
      credit: Number(row.credit || 0),
      balance: Number(row.balance || 0),
      narration: row.narration || '',
      createdAt: row.created_at
    }));
  }
}
