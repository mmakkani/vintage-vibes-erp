import { supabase } from '../supabaseClient.ts';
import { COAAccount, Voucher, LedgerEntry } from '../modules/finance/finance.types.ts';

export class FinanceService {
  private static cachedCoaAccounts: COAAccount[] | null = null;
  private static coaAccountsPromise: Promise<COAAccount[]> | null = null;
  private static lastCoaFetched: number = 0;
  private static readonly COA_TTL_MS = 5 * 60 * 1000; // 5 mins cache

  public static clearCoaCache(): void {
    this.cachedCoaAccounts = null;
    this.coaAccountsPromise = null;
    this.lastCoaFetched = 0;
  }

  // --- Chart of Accounts (COA) ---
  public static async getCoaAccounts(forceRefresh: boolean = false): Promise<COAAccount[]> {
    if (!forceRefresh && this.cachedCoaAccounts && (Date.now() - this.lastCoaFetched < this.COA_TTL_MS)) {
      return this.cachedCoaAccounts;
    }
    if (this.coaAccountsPromise) {
      return this.coaAccountsPromise;
    }

    this.coaAccountsPromise = (async () => {
      try {
        const { data, error } = await supabase
          .from('coa_accounts')
          .select('id, code, name, type, sub_type, currency, current_balance, is_active, parent_id, party_id')
          .order('code', { ascending: true });

        if (error) {
          console.error('Supabase error on coa_accounts:', error);
          if (this.cachedCoaAccounts) return this.cachedCoaAccounts;
          throw new Error(error.message || 'Database error occurred reading Chart of Accounts');
        }

        const mapped = (data || []).map((row: any) => ({
          id: row.id,
          code: row.code,
          name: row.name,
          type: (row.type || 'ASSET').toUpperCase(),
          classification: (row.type || 'ASSET').toUpperCase() as any,
          subType: row.sub_type || '',
          sub_type: row.sub_type || '',
          currency: row.currency || 'AED',
          currentBalance: Number(row.current_balance ?? 0),
          current_balance: Number(row.current_balance ?? 0),
          isActive: row.is_active !== false,
          is_active: row.is_active !== false,
          parentId: row.parent_id,
          parent_id: row.parent_id,
          partyId: row.party_id,
          party_id: row.party_id,
          tierLevel: row.tier_level || (row.code?.includes('-') ? (row.code.split('-').length > 2 ? 3 : 2) : 1),
          parentCode: row.parent_code || '',
          isSystem: Boolean(row.is_system),
          createdAt: row.created_at
        }));

        this.cachedCoaAccounts = mapped;
        this.lastCoaFetched = Date.now();
        return mapped;
      } finally {
        this.coaAccountsPromise = null;
      }
    })();

    return this.coaAccountsPromise;
  }

  public static async addCoaAccount(acc: Partial<COAAccount>): Promise<COAAccount> {
    this.clearCoaCache();
    const id = acc.id || `acc-${acc.code || Date.now()}`;
    const payload = {
      id,
      code: acc.code,
      name: acc.name,
      type: (acc.type || acc.classification || 'ASSET').toUpperCase(),
      sub_type: acc.sub_type || acc.subType || '',
      currency: acc.currency || 'AED',
      current_balance: Number(acc.current_balance ?? acc.currentBalance ?? 0),
      is_active: acc.is_active !== false && acc.isActive !== false,
      parent_id: acc.parent_id || acc.parentId || null,
      party_id: acc.party_id || acc.partyId || null
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
      subType: data.sub_type || '',
      sub_type: data.sub_type || '',
      currency: data.currency || 'AED',
      currentBalance: Number(data.current_balance ?? 0),
      current_balance: Number(data.current_balance ?? 0),
      isActive: data.is_active !== false,
      is_active: data.is_active !== false,
      parentId: data.parent_id,
      parent_id: data.parent_id
    };
  }

  // --- Vouchers ---
  public static async getVouchers(): Promise<Voucher[]> {
    let rows: any[] = [];
    try {
      const { data, error } = await supabase
        .from('financial_vouchers')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data && data.length > 0) {
        rows = data;
      }
    } catch {}

    if (rows.length === 0) {
      const { data, error } = await supabase
        .from('vouchers')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Supabase error on vouchers:', error);
      } else if (data) {
        rows = data;
      }
    }

    // Fetch entries/lines for rich voucher viewing and printing
    let allEntries: any[] = [];
    try {
      const { data: veData, error: veError } = await supabase
        .from('voucher_entries')
        .select('*');
      if (!veError && veData) {
        allEntries = veData;
      }
    } catch {}

    return rows.map((row: any) => {
      const voucherId = String(row.id || '');
      const voucherNo = row.voucher_no || row.voucherNo || '';
      const matchedEntries = allEntries
        .filter((e: any) => (voucherId && String(e.voucher_id) === voucherId) || (voucherNo && e.voucher_no === voucherNo))
        .map((e: any) => ({
          id: e.id,
          voucherId: e.voucher_id || voucherId,
          accountId: e.account_id || '',
          accountCode: e.account_code || '',
          accountName: e.account_name || '',
          partyId: e.party_id || undefined,
          partyName: e.party_name || undefined,
          debitAmount: Number(e.debit ?? e.debit_amount ?? 0),
          creditAmount: Number(e.credit ?? e.credit_amount ?? 0),
          debit: Number(e.debit ?? e.debit_amount ?? 0),
          credit: Number(e.credit ?? e.credit_amount ?? 0),
          memo: e.memo || e.particulars || e.narration || ''
        }));

      const dateStr = typeof row.date === 'string' 
        ? row.date.slice(0, 10) 
        : (row.date ? new Date(row.date).toISOString().slice(0, 10) : (row.voucher_date || new Date().toISOString().slice(0, 10)));

      const totalDebit = Number(row.total_debit ?? row.totalDebit ?? row.total_amount ?? 0);
      const totalCredit = Number(row.total_credit ?? row.totalCredit ?? row.total_amount ?? 0);

      return {
        id: row.id,
        voucherNo: voucherNo || row.id,
        date: dateStr,
        type: row.type || row.voucher_type || 'JOURNAL',
        reference: row.reference || row.reference_no || '',
        narration: row.narration || '',
        totalDebit,
        totalCredit,
        status: row.status || 'POSTED',
        currency: row.currency || 'AED',
        exchangeRate: Number(row.exchange_rate || 1.0),
        createdBy: row.created_by || row.createdBy || 'System',
        entries: matchedEntries,
        lines: matchedEntries,
        createdAt: row.created_at
      };
    });
  }

  public static async addVoucher(v: any): Promise<Voucher> {
    const id = String(v.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `vch-${Date.now()}`));
    const voucherNo = String(v.voucherNo || `VCH-${Date.now().toString().slice(-6)}`);
    const date = v.date || new Date().toISOString().slice(0, 10);
    const type = String(v.type || 'JOURNAL');
    const reference = String(v.reference || v.documentRef || '');
    const narration = String(v.narration || '');
    const totalDebit = Number(v.totalDebit || 0);
    const totalCredit = Number(v.totalCredit || 0);
    const status = String(v.status || 'POSTED');
    const createdBy = String(v.createdBy || 'System');

    const payload = {
      id,
      voucher_no: voucherNo,
      date,
      voucher_date: date,
      type,
      voucher_type: type,
      reference,
      reference_no: reference,
      narration,
      total_debit: totalDebit,
      total_credit: totalCredit,
      total_amount: totalDebit || totalCredit,
      status,
      created_by: createdBy
    };

    // 1. Write parent data to financial_vouchers
    try {
      const { error: fvError } = await supabase.from('financial_vouchers').insert([payload]);
      if (fvError) console.warn('financial_vouchers insert warning:', fvError.message);
    } catch (err) {
      console.warn('financial_vouchers exception:', err);
    }

    // Mirror to vouchers
    try {
      const { error: vError } = await supabase.from('vouchers').insert([payload]);
      if (vError) console.warn('vouchers table insert warning:', vError.message);
    } catch (err) {
      console.warn('vouchers exception:', err);
    }

    // 2. Write balanced lines to voucher_entries and general_ledger
    const lines = v.lines || v.entries || [];
    if (Array.isArray(lines) && lines.length > 0) {
      const voucherEntriesRows = lines.map((l: any, idx: number) => {
        const lineId = String(l.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `ve-${id}-${idx + 1}`));
        const debit = Number(l.debitAmount ?? l.debit ?? 0);
        const credit = Number(l.creditAmount ?? l.credit ?? 0);
        const memo = l.memo || l.narration || narration;
        return {
          id: lineId,
          voucher_id: String(id),
          voucher_no: voucherNo,
          account_id: l.accountId || l.account_id ? String(l.accountId || l.account_id) : null,
          account_code: String(l.accountCode || l.account_code || ''),
          account_name: String(l.accountName || l.account_name || ''),
          party_id: l.partyId || l.party_id ? String(l.partyId || l.party_id) : null,
          party_name: l.partyName || l.party_name ? String(l.partyName || l.party_name) : null,
          debit,
          credit,
          particulars: memo,
          memo,
          narration: memo,
          date
        };
      });

      const generalLedgerRows = lines.map((l: any, idx: number) => {
        const debit = Number(l.debitAmount ?? l.debit ?? 0);
        const credit = Number(l.creditAmount ?? l.credit ?? 0);
        const memo = l.memo || l.narration || narration;
        return {
          id: String(typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `gl-${id}-${idx + 1}`),
          voucher_id: String(id),
          voucher_no: voucherNo,
          account_id: l.accountId || l.account_id ? String(l.accountId || l.account_id) : null,
          account_code: String(l.accountCode || l.account_code || ''),
          account_name: String(l.accountName || l.account_name || ''),
          party_id: l.partyId || l.party_id ? String(l.partyId || l.party_id) : null,
          party_name: l.partyName || l.party_name ? String(l.partyName || l.party_name) : null,
          date,
          entry_date: date,
          debit,
          credit,
          balance: debit - credit,
          running_balance: debit - credit,
          narration: memo,
          description: memo
        };
      });

      try {
        const { error: veError } = await supabase.from('voucher_entries').insert(voucherEntriesRows);
        if (veError) console.warn('voucher_entries insert warning:', veError.message);
      } catch (err) {
        console.warn('voucher_entries exception:', err);
      }

      try {
        const { error: glError } = await supabase.from('general_ledger').insert(generalLedgerRows);
        if (glError) console.warn('general_ledger insert warning:', glError.message);
      } catch (err) {
        console.warn('general_ledger exception:', err);
      }

      try {
        await supabase.from('ledgers').insert(generalLedgerRows);
      } catch (err) {
        console.warn('ledgers insert warning:', err);
      }
    }

    return {
      id,
      voucherNo,
      date,
      type: type as any,
      reference,
      narration,
      totalDebit,
      totalCredit,
      status: status as any,
      currency: 'AED',
      exchangeRate: 1.0,
      createdBy,
      entries: lines,
      lines
    };
  }

  public static async updateVoucherStatus(id: string, status: string): Promise<void> {
    const cleanId = String(id);
    try {
      await supabase.from('financial_vouchers').update({ status }).eq('id', cleanId);
    } catch {}
    try {
      await supabase.from('vouchers').update({ status }).eq('id', cleanId);
    } catch {}
  }

  // --- Ledgers ---
  public static async getLedgers(accountId?: string): Promise<LedgerEntry[]> {
    let rows: any[] = [];
    try {
      let q = supabase.from('general_ledger').select('*').order('date', { ascending: false });
      if (accountId) q = q.eq('account_id', String(accountId));
      const { data, error } = await q;
      if (!error && data && data.length > 0) {
        rows = data;
      }
    } catch {}

    if (rows.length === 0) {
      let query = supabase.from('ledgers').select('*').order('date', { ascending: false });
      if (accountId) query = query.eq('account_id', String(accountId));
      const { data, error } = await query;
      if (error) {
        console.error('Supabase error on ledgers:', error);
      } else if (data) {
        rows = data;
      }
    }

    return rows.map((row: any) => ({
      id: row.id,
      voucherId: row.voucher_id || row.voucherId,
      voucherNo: row.voucher_no || row.voucherNo || '',
      accountId: row.account_id || row.accountId || '',
      accountCode: row.account_code || row.accountCode || '',
      accountName: row.account_name || row.accountName || '',
      partyId: row.party_id || row.partyId || undefined,
      partyName: row.party_name || row.partyName || undefined,
      date: typeof row.date === 'string' ? row.date.slice(0, 10) : (row.date ? new Date(row.date).toISOString().slice(0, 10) : (row.entry_date || '')),
      debit: Number(row.debit || 0),
      credit: Number(row.credit || 0),
      balance: Number(row.balance ?? row.running_balance ?? 0),
      runningBalance: Number(row.running_balance ?? row.balance ?? 0),
      documentRef: row.document_ref || row.documentRef || '',
      narration: row.narration || row.description || '',
      createdAt: row.created_at
    }));
  }

  // --- Bank Accounts (Supabase public.bank_accounts) ---
  public static async getBankAccounts(): Promise<any[]> {
    const { data, error } = await supabase
      .from('bank_accounts')
      .select('*')
      .order('is_primary', { ascending: false });

    if (error) {
      console.error('Supabase error on bank_accounts:', error);
      return [];
    }
    return data || [];
  }

  public static async addBankAccount(account: {
    bank_name: string;
    account_title: string;
    iban: string;
    account_number?: string;
    swift_code?: string;
    branch_name?: string;
    qr_code_url?: string;
    is_primary?: boolean;
    is_active?: boolean;
  }): Promise<any> {
    const { data, error } = await supabase
      .from('bank_accounts')
      .insert({
        ...account,
        is_primary: account.is_primary ?? false,
        is_active: account.is_active ?? true
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase error adding bank_account:', error);
      throw new Error(error.message);
    }
    return data;
  }

  public static async updateBankAccount(id: string, updates: Partial<{
    bank_name: string;
    account_title: string;
    iban: string;
    account_number: string;
    swift_code: string;
    branch_name: string;
    qr_code_url: string;
    is_primary: boolean;
    is_active: boolean;
  }>): Promise<any> {
    const { data, error } = await supabase
      .from('bank_accounts')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Supabase error updating bank_account:', error);
      throw new Error(error.message);
    }
    return data;
  }

  public static async deleteBankAccount(id: string): Promise<void> {
    const { error } = await supabase
      .from('bank_accounts')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Supabase error deleting bank_account:', error);
      throw new Error(error.message);
    }
  }
}

