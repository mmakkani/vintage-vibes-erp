import { supabase } from '../supabaseClient.ts';
import { COAAccount, Voucher, LedgerEntry } from '../modules/finance/finance.types.ts';
import { safeFetchJson, safeFetchMutation } from '../utils/fetchUtils.ts';
import { applyPagination, buildPaginatedResponse, PaginatedResponse } from '../utils/paginationHelper.ts';
import { SequenceService } from './sequenceService.ts';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUuid = (val: any): boolean => typeof val === 'string' && UUID_REGEX.test(val.trim());

/**
 * Enterprise UUID generator guaranteeing fresh unique RFC4122 v4 UUIDs for every row.
 * Strictly uses crypto.randomUUID() when available in browser or Node environments,
 * with RFC4122 v4 compliant fallback to prevent Primary Key collisions.
 */
export const generateLedgerUuid = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

/**
 * Strict numeric parser and decimal rounding for enterprise ledgers.
 * Prevents floating-point drift, NaN injection, and string leakage.
 */
export const toSafeLedgerAmount = (val: unknown, decimals: number = 4): number => {
  const num = Number(val);
  if (isNaN(num) || !isFinite(num)) return 0;
  return Number(num.toFixed(decimals));
};

export class FinanceService {
  private static cachedCoaAccounts: COAAccount[] | null = null;
  private static coaAccountsPromise: Promise<COAAccount[]> | null = null;
  private static lastCoaFetched: number = 0;

  public static clearCoaCache(): void {
    this.cachedCoaAccounts = null;
    this.coaAccountsPromise = null;
    this.lastCoaFetched = 0;
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const keysToRemove = [
          'vintage_cached_coa',
          'vibe_cached_coa',
          'coa_accounts',
          'vintage_coa',
          'vibe_cached_parties'
        ];
        keysToRemove.forEach(k => window.localStorage.removeItem(k));
      } catch (_) {}
    }
  }

  // --- Vouchers Paginated ---
  public static async getVouchersPaginated(options?: {
    page?: number;
    pageSize?: number;
    search?: string;
    type?: string;
    status?: string;
  }): Promise<PaginatedResponse<Voucher>> {
    const page = Math.max(1, options?.page || 1);
    const pageSize = Math.max(1, options?.pageSize || 10);
    const search = options?.search?.trim() || '';
    const type = options?.type?.trim() || 'ALL';
    const status = options?.status?.trim() || 'ALL';

    let query = supabase
      .from('financial_vouchers')
      .select('*', { count: 'exact' });

    if (search) {
      query = query.or(`voucher_no.ilike.%${search}%,reference.ilike.%${search}%,reference_no.ilike.%${search}%,narration.ilike.%${search}%`);
    }
    if (type && type !== 'ALL') {
      query = query.or(`type.eq.${type},voucher_type.eq.${type}`);
    }
    if (status && status !== 'ALL') {
      query = query.eq('status', status);
    }

    query = applyPagination(query, page, pageSize, {
      orderBy: 'created_at',
      ascending: false,
      secondaryOrderBy: 'id',
      secondaryAscending: false
    });

    let { data, count, error } = await query;

    // Fetch entries/lines for the current page vouchers
    const voucherIds = (data || []).map((r: any) => String(r.id)).filter(Boolean);
    const voucherNos = (data || []).map((r: any) => String(r.voucher_no || r.voucherNo)).filter(Boolean);

    let allEntries: any[] = [];
    if (voucherIds.length > 0 || voucherNos.length > 0) {
      try {
        const { data: veData } = await supabase
          .from('voucher_entries')
          .select('*')
          .or(`voucher_id.in.(${voucherIds.join(',')})${voucherNos.length > 0 ? `,voucher_no.in.(${voucherNos.map(n => `"${n}"`).join(',')})` : ''}`);
        if (veData) {
          allEntries = veData;
        }
      } catch {}
    }

    const mapped = (data || []).map((row: any) => {
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

      const isAuto = Boolean(row.is_auto === true || row.isAuto === true || FinanceService.isAutoVoucher(row));

      return {
        id: row.id,
        voucherNo: voucherNo || row.id,
        date: dateStr,
        type: row.type || row.voucher_type || 'JOURNAL',
        reference: row.reference || row.reference_no || '',
        narration: row.narration || '',
        totalDebit: Number(row.total_debit ?? row.totalDebit ?? (matchedEntries.reduce((acc: number, e: any) => acc + (Number(e.debit) || 0), 0)) ?? 0),
        totalCredit: Number(row.total_credit ?? row.totalCredit ?? (matchedEntries.reduce((acc: number, e: any) => acc + (Number(e.credit) || 0), 0)) ?? 0),
        status: row.status || 'POSTED',
        currency: (row.currency || 'AED').toUpperCase(),
        exchangeRate: Number(row.exchange_rate || 1.0),
        baseCurrency: (row.base_currency || 'AED').toUpperCase(),
        foreignTotalAmount: Number(row.foreign_total_amount || 0),
        createdBy: row.created_by || row.createdBy || 'System',
        isAuto,
        entries: matchedEntries,
        lines: matchedEntries,
        createdAt: row.created_at
      } as Voucher;
    });

    return buildPaginatedResponse(mapped, count || 0, page, pageSize);
  }

  // --- Chart of Accounts (COA) ---
  public static async getCoaAccounts(forceRefresh: boolean = false): Promise<COAAccount[]> {
    // If not forcing refresh, check short-lived cache (1 second to prevent duplicate parallel calls during single render)
    if (!forceRefresh && this.cachedCoaAccounts && (Date.now() - this.lastCoaFetched < 1000)) {
      return this.cachedCoaAccounts;
    }
    if (this.coaAccountsPromise) {
      return this.coaAccountsPromise;
    }

    this.coaAccountsPromise = (async () => {
      try {
        // 1. Primary route: Query Express backend connected directly to PostgreSQL accounts table
        if (typeof window !== 'undefined') {
          try {
            const apiData = await safeFetchJson<any>('/api/finance/coa?_t=' + Date.now(), { credentials: 'include' });
            if (apiData) {
              const list = Array.isArray(apiData) ? apiData : (apiData?.accounts || apiData?.coa || apiData?.data || []);
              if (Array.isArray(list) && list.length > 0) {
                const normalized = list.map((r: any) => {
                  const code = r.code || r.account_code || '';
                  const isMaster = code.endsWith('000-00') || !code.includes('-') || code === '1000-00' || code === '2000-00' || code === '3000-00' || code === '4000-00' || code === '5000-00';
                  const isSub = code.endsWith('-00') && !isMaster;
                  const computedTier = isMaster ? 1 : (isSub ? 2 : 3);
                  const tierLevel = Number(r.tierLevel || r.tier_level || r.account_level || computedTier);

                  return {
                    ...r,
                    code: code,
                    account_code: r.account_code || code,
                    name: r.name || r.account_name || '',
                    account_name: r.account_name || r.name || '',
                    type: r.type || r.pillar_category || r.classification || 'ASSET',
                    pillar_category: r.pillar_category || r.type || r.classification || 'ASSET',
                    tierLevel,
                    tier_level: tierLevel,
                    currency: r.currency || 'AED',
                    currentBalance: typeof r.currentBalance === 'number' ? r.currentBalance : (Number(r.current_balance) || 0),
                    current_balance: typeof r.current_balance === 'number' ? r.current_balance : (Number(r.currentBalance) || 0),
                    isActive: r.isActive !== false && r.is_active !== false,
                    is_active: r.is_active !== false && r.isActive !== false,
                    status: r.status || ((r.isActive !== false && r.is_active !== false) ? 'ACTIVE' : 'INACTIVE')
                  };
                });
                this.cachedCoaAccounts = normalized;
                this.lastCoaFetched = Date.now();
                return normalized;
              }
            }
          } catch (_) {}
        }

        // 2. Secondary fallback: Direct Supabase query to PostgreSQL 'chart_of_accounts' table
        try {
          const { data: coaData, error: coaErr } = await supabase
            .from('chart_of_accounts')
            .select('*')
            .order('code', { ascending: true });

          if (!coaErr && Array.isArray(coaData) && coaData.length > 0) {
            const mapped = coaData.map((r: any) => {
              const code = r.code || r.account_code || '';
              const isMaster = code.endsWith('000-00') || !code.includes('-') || code === '1000-00' || code === '2000-00' || code === '3000-00' || code === '4000-00' || code === '5000-00';
              const isSub = code.endsWith('-00') && !isMaster;
              const computedTier = isMaster ? 1 : (isSub ? 2 : 3);
              const tierLevel = Number(r.tier_level || r.tierLevel || r.account_level || computedTier);

              return {
                ...r,
                id: String(r.id),
                code: code,
                account_code: code,
                name: r.name || r.account_name || '',
                account_name: r.name || r.account_name || '',
                type: r.type || r.classification || 'ASSET',
                classification: r.type || r.classification || 'ASSET',
                pillar_category: r.type || r.classification || 'ASSET',
                tierLevel,
                tier_level: tierLevel,
                currentBalance: Number(r.current_balance || r.currentBalance || 0),
                current_balance: Number(r.current_balance || r.currentBalance || 0),
                isActive: r.is_active !== false,
                is_active: r.is_active !== false,
                status: (r.is_active !== false) ? 'ACTIVE' : 'INACTIVE',
                createdAt: r.created_at || new Date().toISOString()
              };
            });
            this.cachedCoaAccounts = mapped;
            this.lastCoaFetched = Date.now();
            return mapped;
          }
        } catch (_) {}

        // 3. Tertiary fallback: Direct Supabase query to PostgreSQL 'accounts' table
        try {
          const { data: accData, error: accErr } = await supabase
            .from('accounts')
            .select(`
              account_id,
              account_code,
              account_name,
              account_type_id,
              parent_id,
              is_active,
              is_transactional,
              account_level,
              account_types (
                type_name
              )
            `)
            .order('account_code', { ascending: true });

          if (!accErr && Array.isArray(accData)) {
            const mapped = accData.map((row: any) => {
              const typeName = row.account_types?.type_name || 'Asset';
              const normType = typeName.toUpperCase() === 'INCOME' ? 'REVENUE' : typeName.toUpperCase();
              const tierLevel = row.account_level || 1;

              return {
                id: String(row.account_id),
                code: row.account_code,
                account_code: row.account_code,
                name: row.account_name,
                account_name: row.account_name,
                type: normType,
                classification: normType as any,
                account_type: normType,
                pillar_category: normType,
                pillar: normType,
                subType: '',
                sub_type: '',
                currency: 'AED',
                currentBalance: 0,
                current_balance: 0,
                isActive: Boolean(row.is_active),
                is_active: Boolean(row.is_active),
                status: Boolean(row.is_active) ? 'ACTIVE' : 'INACTIVE',
                parentId: row.parent_id ? String(row.parent_id) : null,
                parent_id: row.parent_id ? String(row.parent_id) : null,
                parentCode: '',
                parent_code: '',
                tierLevel,
                tier_level: tierLevel,
                isTransactional: Boolean(row.is_transactional),
                is_transactional: Boolean(row.is_transactional),
                isSystem: tierLevel === 1,
                createdAt: new Date().toISOString(),
                created_at: new Date().toISOString()
              };
            });

            this.cachedCoaAccounts = mapped;
            this.lastCoaFetched = Date.now();
            return mapped;
          }
        } catch (_) {}

        return [];
      } finally {
        this.coaAccountsPromise = null;
      }
    })();

    return this.coaAccountsPromise;
  }

  public static async addCoaAccount(acc: Partial<COAAccount>): Promise<COAAccount> {
    this.clearCoaCache();

    // 1. Try Express backend POST /api/finance/coa
    if (typeof window !== 'undefined') {
      try {
        const created = await safeFetchMutation<any>('/api/finance/coa', 'POST', acc);
        if (created && (created.id || created.code)) {
          this.clearCoaCache();
          return created;
        }
      } catch (err) {
        console.warn('[FinanceService] POST /api/finance/coa failed, trying Supabase directly:', err);
      }
    }

    // 2. Direct Supabase insert into 'accounts' table
    const rawType = (acc.classification || acc.type || acc.account_type || 'ASSET').toUpperCase();
    const normType = rawType === 'INCOME' ? 'REVENUE' : rawType;
    const typeMap: Record<string, number> = {
      ASSET: 1,
      LIABILITY: 2,
      EQUITY: 3,
      REVENUE: 4,
      EXPENSE: 5
    };
    const account_type_id = typeMap[normType] || 1;

    let parent_id: number | null = null;
    if (acc.parent_id && !isNaN(Number(acc.parent_id))) {
      parent_id = Number(acc.parent_id);
    } else if (acc.parentId && !isNaN(Number(acc.parentId))) {
      parent_id = Number(acc.parentId);
    }

    const tierLevel = Number(acc.tierLevel || acc.tier_level || (parent_id ? 2 : 1));

    const payload: any = {
      account_code: (acc.code || '').trim(),
      account_name: (acc.name || '').trim(),
      account_type_id,
      parent_id,
      account_level: tierLevel,
      is_transactional: acc.is_active !== false && tierLevel > 1,
      is_active: acc.isActive !== false && acc.is_active !== false
    };

    const { data, error } = await supabase
      .from('accounts')
      .insert(payload)
      .select(`
        account_id,
        account_code,
        account_name,
        account_type_id,
        parent_id,
        is_active,
        is_transactional,
        account_level,
        account_types (
          type_name
        )
      `)
      .single();

    if (error) {
      console.error('Supabase error on accounts table:', error);
      throw new Error(error.message || 'Failed to add COA Account');
    }

    const typeName = data.account_types?.type_name || normType;
    const finalType = typeName.toUpperCase() === 'INCOME' ? 'REVENUE' : typeName.toUpperCase();

    return {
      id: String(data.account_id),
      code: data.account_code,
      name: data.account_name,
      type: finalType,
      classification: finalType as any,
      account_type: finalType,
      subType: '',
      sub_type: '',
      currency: 'AED',
      currentBalance: 0,
      current_balance: 0,
      isActive: Boolean(data.is_active),
      is_active: Boolean(data.is_active),
      parentId: data.parent_id ? String(data.parent_id) : null,
      parent_id: data.parent_id ? String(data.parent_id) : null,
      parentCode: '',
      parent_code: '',
      tierLevel: data.account_level,
      tier_level: data.account_level,
      isTransactional: Boolean(data.is_transactional),
      is_transactional: Boolean(data.is_transactional),
      isSystem: data.account_level === 1,
      createdAt: new Date().toISOString(),
      created_at: new Date().toISOString()
    };
  }

  public static async deleteCoaAccount(id: string, code?: string): Promise<any> {
    if (!id || id === 'undefined' || id === 'null') {
      throw new Error('Valid Account ID is required for deletion');
    }

    const strId = String(id).trim();
    const strCode = (code || '').trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(strId);

    // 1. Strict Accounting Validation Check: Prevent deletion of accounts with transactions or non-zero balance
    try {
      let coaQuery = supabase.from('chart_of_accounts').select('id, code, current_balance');
      if (isUuid) {
        coaQuery = strCode ? coaQuery.or(`id.eq.${strId},code.eq.${strCode}`) : coaQuery.eq('id', strId);
      } else {
        coaQuery = coaQuery.eq('code', strId);
      }
      let { data: coaAcc } = await coaQuery.maybeSingle();

      if (!coaAcc) {
        // Also check coa_accounts
        let caQuery = supabase.from('coa_accounts').select('id, code, current_balance, tier_level');
        if (isUuid) {
          caQuery = strCode ? caQuery.or(`id.eq.${strId},code.eq.${strCode}`) : caQuery.eq('id', strId);
        } else {
          caQuery = caQuery.eq('code', strId);
        }
        const { data: caData } = await caQuery.maybeSingle();
        coaAcc = caData;
      }

      if (coaAcc) {
        const targetCode = coaAcc.code || strCode || strId;
        const isMaster = targetCode.endsWith('000-00') || ['1000-00', '2000-00', '3000-00', '4000-00', '5000-00'].includes(targetCode) || Number(coaAcc.tier_level) === 1;
        if (isMaster) {
          throw new Error("Cannot delete: Master tier folder accounts cannot be deleted. Please deactivate it instead.");
        }

        const curBal = Math.abs(Number(coaAcc.current_balance || 0));
        if (curBal > 0.001) {
          throw new Error("Cannot delete: This account/supplier has existing transactions. Please deactivate it instead.");
        }

        const targetUuid = coaAcc.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(coaAcc.id)
          ? coaAcc.id
          : (isUuid ? strId : null);

        // Check journal_entries (Strict UUID only)
        if (targetUuid) {
          const { data: je } = await supabase
            .from('journal_entries')
            .select('id')
            .eq('account_id', targetUuid)
            .limit(1);
          if (je && je.length > 0) {
            throw new Error("Cannot delete: This account/supplier has existing transactions. Please deactivate it instead.");
          }
        }

        // Check voucher_entries
        const veOrClauses: string[] = [];
        if (targetUuid) veOrClauses.push(`account_id.eq.${targetUuid}`);
        if (targetCode) veOrClauses.push(`account_code.eq.${targetCode}`);
        if (veOrClauses.length > 0) {
          const { data: ve } = await supabase
            .from('voucher_entries')
            .select('id')
            .or(veOrClauses.join(','))
            .limit(1);
          if (ve && ve.length > 0) {
            throw new Error("Cannot delete: This account/supplier has existing transactions. Please deactivate it instead.");
          }
        }
      }
    } catch (valErr: any) {
      if (valErr.message?.includes('Cannot delete:')) {
        throw valErr;
      }
    }

    let apiSuccess = false;
    let resultData: any = null;

    // 2. Express Backend API
    if (typeof window !== 'undefined') {
      try {
        const resJson = await safeFetchMutation<any>(`/api/finance/coa/${encodeURIComponent(id)}`, 'DELETE');
        if (resJson && resJson.success !== false) {
          apiSuccess = true;
          resultData = resJson;
        }
      } catch (err: any) {
        // Strict accounting lock errors must be preserved and rethrown
        if (err.message?.includes('Cannot delete:')) {
          throw err;
        }
        // If 404 or network error, proceed to Step 3 Supabase direct fallback
      }
    }

    // 3. Direct Supabase Fallback
    if (!apiSuccess) {
      const deleteCode = strCode || (!isUuid ? strId : '');
      const deleteUuid = isUuid ? strId : null;

      if (deleteUuid) {
        try {
          await supabase.from('chart_of_accounts').delete().eq('id', deleteUuid);
        } catch (_) {}
        try {
          await supabase.from('coa_accounts').delete().eq('id', deleteUuid);
        } catch (_) {}
      }
      if (deleteCode) {
        try {
          await supabase.from('chart_of_accounts').delete().eq('code', deleteCode);
        } catch (_) {}
        try {
          await supabase.from('coa_accounts').delete().eq('code', deleteCode);
        } catch (_) {}
        try {
          await supabase.from('accounts').delete().eq('account_code', deleteCode);
        } catch (_) {}
      }
      resultData = { success: true };
    }

    this.clearCoaCache();
    return resultData;
  }

  public static async toggleCoaAccountActive(id: string, isActive: boolean, code?: string): Promise<any> {
    if (!id || id === 'undefined' || id === 'null') {
      throw new Error('Valid Account ID is required');
    }

    this.clearCoaCache();

    // 1. Express Backend API
    if (typeof window !== 'undefined') {
      try {
        const data = await safeFetchMutation<any>(`/api/finance/coa/${encodeURIComponent(id)}/toggle-active`, 'PATCH', { is_active: isActive });
        if (data) {
          this.clearCoaCache();
          return data;
        }
      } catch (err) {
        console.warn('[FinanceService] PATCH /api/finance/coa/:id/toggle-active failed, trying Supabase directly:', err);
      }
    }

    await supabase.from('chart_of_accounts').update({ is_active: isActive }).or(`id.eq.${id}${code ? `,code.eq.${code}` : ''}`);
    try {
      await supabase.from('accounts').update({ is_active: isActive }).or(`account_id.eq.${id}${code ? `,account_code.eq.${code}` : ''}`);
    } catch (_) {}
    this.clearCoaCache();
    return { success: true, is_active: isActive };
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

      const isAuto = Boolean(row.is_auto === true || row.isAuto === true || FinanceService.isAutoVoucher(row));

      return {
        id: row.id,
        voucherNo: voucherNo || row.id,
        date: dateStr,
        type: row.type || row.voucher_type || 'JOURNAL',
        reference: row.reference || row.reference_no || '',
        narration: row.narration || '',
        totalDebit: Number(row.total_debit ?? row.totalDebit ?? (matchedEntries.reduce((acc: number, e: any) => acc + (Number(e.debit) || 0), 0)) ?? 0),
        totalCredit: Number(row.total_credit ?? row.totalCredit ?? (matchedEntries.reduce((acc: number, e: any) => acc + (Number(e.credit) || 0), 0)) ?? 0),
        status: row.status || 'POSTED',
        currency: (row.currency || 'AED').toUpperCase(),
        exchangeRate: Number(row.exchange_rate || 1.0),
        baseCurrency: (row.base_currency || 'AED').toUpperCase(),
        foreignTotalAmount: Number(row.foreign_total_amount || 0),
        createdBy: row.created_by || row.createdBy || 'System',
        isAuto,
        entries: matchedEntries,
        lines: matchedEntries,
        createdAt: row.created_at
      };
    });
  }

  public static async addVoucher(v: any): Promise<Voucher> {
    const id = String(v.id || generateLedgerUuid());
    const date = v.date || new Date().toISOString().slice(0, 10);
    const type = String(v.type || 'JOURNAL');
    const typeUpper = type.toUpperCase();

    let prefix = 'JV';
    if (typeUpper.includes('CASH_RECEIPT') || typeUpper === 'CRV') prefix = 'CRV';
    else if (typeUpper.includes('BANK_RECEIPT') || typeUpper === 'BRV') prefix = 'BRV';
    else if (typeUpper.includes('CASH_PAYMENT') || typeUpper === 'CPV') prefix = 'CPV';
    else if (typeUpper.includes('BANK_PAYMENT') || typeUpper === 'BPV') prefix = 'BPV';
    else if (typeUpper.includes('CONTRA') || typeUpper === 'CV') prefix = 'CV';
    else prefix = 'JV';

    let voucherNo = String(v.voucherNo || '').trim();
    if (!voucherNo || voucherNo.startsWith('VCH-')) {
      voucherNo = await SequenceService.getNextNumber(prefix, date);
    }
    const reference = String(v.reference || v.documentRef || '');
    const narration = String(v.narration || '');
    const totalDebit = Number(v.totalDebit || 0);
    const totalCredit = Number(v.totalCredit || 0);
    const status = String(v.status || 'POSTED');
    const createdBy = String(v.createdBy || 'System');
    const isAuto = Boolean(v.isAuto || v.is_auto || FinanceService.isAutoVoucher(v));

    const currency = String(v.currency || 'AED').toUpperCase();
    const exchangeRate = Number(v.exchangeRate ?? v.exchange_rate ?? 1.0);
    const baseCurrency = String(v.baseCurrency || v.base_currency || 'AED').toUpperCase();
    const foreignTotalAmount = Number(
      v.foreignTotalAmount ?? v.foreign_total_amount ?? (currency === 'AED' ? totalDebit : (totalDebit / (exchangeRate || 1.0)))
    );

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
      currency,
      exchange_rate: exchangeRate,
      base_currency: baseCurrency,
      foreign_total_amount: foreignTotalAmount,
      status,
      created_by: createdBy,
      is_auto: isAuto
    };

    // 1. Write parent data to financial_vouchers
    try {
      const { error: fvError } = await supabase.from('financial_vouchers').insert([payload]);
      if (fvError) console.warn('financial_vouchers insert warning:', fvError.message);
    } catch (err) {
      console.warn('financial_vouchers exception:', err);
    }

    // 2. Write balanced lines to voucher_entries and ledgers
    const lines = v.lines || v.entries || [];
    if (Array.isArray(lines) && lines.length > 0) {
      const coaList = await this.getCoaAccounts();

      const voucherEntriesRows = lines.map((l: any) => {
        const lineId = String(l.id && isValidUuid(l.id) ? l.id : generateLedgerUuid());
        const debit = toSafeLedgerAmount(l.debitAmount ?? l.debit ?? 0);
        const credit = toSafeLedgerAmount(l.creditAmount ?? l.credit ?? 0);
        const foreignDebit = toSafeLedgerAmount(l.foreignDebit ?? l.foreign_debit ?? (currency === 'AED' ? debit : (debit / (exchangeRate || 1.0))));
        const foreignCredit = toSafeLedgerAmount(l.foreignCredit ?? l.foreign_credit ?? (currency === 'AED' ? credit : (credit / (exchangeRate || 1.0))));
        const memo = l.memo || l.narration || narration;

        const targetAccId = String(l.accountId || l.account_id || '');
        const matchedAcc = coaList.find(a => (targetAccId && (a.id === targetAccId || a.code === targetAccId)) || (l.accountCode && a.code === l.accountCode));

        const resolvedCode = String(l.accountCode || l.account_code || matchedAcc?.code || '');
        const resolvedName = String(l.accountName || l.account_name || matchedAcc?.name || '');
        const resolvedPartyId = l.partyId || l.party_id || matchedAcc?.party_id || matchedAcc?.partyId || null;
        const resolvedPartyName = l.partyName || l.party_name || (resolvedPartyId ? resolvedName.replace(/\s*\([^)]*\)/g, '') : null);

        const preferredAccId = (targetAccId && isValidUuid(targetAccId)) ? targetAccId : (matchedAcc?.id && isValidUuid(matchedAcc.id) ? matchedAcc.id : targetAccId || matchedAcc?.id || null);

        return {
          id: lineId,
          voucher_id: String(id),
          voucher_no: voucherNo,
          account_id: preferredAccId,
          account_code: resolvedCode,
          account_name: resolvedName,
          party_id: resolvedPartyId,
          party_name: resolvedPartyName,
          debit,
          credit,
          currency,
          exchange_rate: toSafeLedgerAmount(exchangeRate, 6),
          foreign_debit: foreignDebit,
          foreign_credit: foreignCredit,
          particulars: memo,
          memo,
          narration: memo,
          date
        };
      });

      const generalLedgerRows = voucherEntriesRows.map((veRow: any) => {
        return {
          id: generateLedgerUuid(),
          voucher_id: String(id),
          voucher_no: voucherNo,
          account_id: veRow.account_id,
          account_code: veRow.account_code,
          account_name: veRow.account_name,
          party_id: veRow.party_id,
          party_name: veRow.party_name,
          date,
          entry_date: date,
          debit: toSafeLedgerAmount(veRow.debit),
          credit: toSafeLedgerAmount(veRow.credit),
          currency,
          exchange_rate: toSafeLedgerAmount(exchangeRate, 6),
          foreign_debit: toSafeLedgerAmount(veRow.foreign_debit),
          foreign_credit: toSafeLedgerAmount(veRow.foreign_credit),
          balance: toSafeLedgerAmount(veRow.debit - veRow.credit),
          running_balance: toSafeLedgerAmount(veRow.debit - veRow.credit),
          narration: veRow.narration,
          description: veRow.narration
        };
      });

      try {
        const { error: veError } = await supabase.from('voucher_entries').insert(voucherEntriesRows);
        if (veError) console.warn('voucher_entries insert warning:', veError.message);
      } catch (err) {
        console.warn('voucher_entries exception:', err);
      }

      try {
        let coaMap: Map<string, string> = new Map();
        try {
          const { data: coaAccs } = await supabase.from('coa_accounts').select('id, code');
          if (Array.isArray(coaAccs)) {
            coaMap = new Map(coaAccs.map((a: any) => [a.code, String(a.id)]));
          }
        } catch (_) {}

        const ledgersRows = generalLedgerRows.map((glRow: any) => ({
          ...glRow,
          id: generateLedgerUuid(), // FRESH UNIQUE UUID for EVERY SINGLE ROW in ledgers
          voucher_id: String(id),
          account_id: coaMap.get(glRow.account_code) || glRow.account_id
        }));
        await supabase.from('ledgers').insert(ledgersRows);
      } catch (err) {
        console.warn('ledgers insert warning:', err);
      }

      try {
        const codesToLookup = Array.from(
          new Set(
            voucherEntriesRows
              .map((r: any) => r.account_code)
              .filter((c: any) => typeof c === 'string' && c.trim() !== '')
          )
        );

        let chartMap: Map<string, string> = new Map();
        if (codesToLookup.length > 0) {
          try {
            const { data: chartAccs } = await supabase
              .from('chart_of_accounts')
              .select('id, code')
              .in('code', codesToLookup);
            if (Array.isArray(chartAccs)) {
              chartAccs.forEach((a: any) => {
                if (a.code && isValidUuid(a.id)) {
                  chartMap.set(a.code, a.id);
                }
              });
            }
          } catch (cErr) {
            console.warn('chart_of_accounts lookup warning:', cErr);
          }
        }

        const journalEntriesRows = voucherEntriesRows
          .map((veRow: any) => {
            let accountUuid: string | null = null;
            if (isValidUuid(veRow.account_id)) {
              accountUuid = veRow.account_id;
            } else if (veRow.account_code && chartMap.has(veRow.account_code)) {
              accountUuid = chartMap.get(veRow.account_code)!;
            }

            const cleanPartyId = isValidUuid(veRow.party_id) ? veRow.party_id : null;

            if (!accountUuid) {
              console.warn(`[FinanceService] Skipping journal_entries row because account_id is not a valid UUID: ${veRow.account_id} (code: ${veRow.account_code})`);
              return null;
            }

            return {
              voucher_id: String(id),
              account_id: accountUuid,
              party_id: cleanPartyId,
              debit: veRow.debit,
              credit: veRow.credit,
              description: veRow.narration || narration
            };
          })
          .filter(Boolean);

        if (journalEntriesRows.length > 0) {
          const { error: jeErr } = await supabase.from('journal_entries').insert(journalEntriesRows);
          if (jeErr) {
            console.warn('journal_entries insert warning in FinanceService.addVoucher:', jeErr.message);
          }
        }
      } catch (err) {
        console.warn('journal_entries insert exception in FinanceService.addVoucher:', err);
      }
    }

    try {
      this.clearCoaCache();
      await supabase.rpc('sync_coa_current_balances');
    } catch (_) {}

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
      currency: currency as any,
      exchangeRate,
      baseCurrency,
      foreignTotalAmount,
      createdBy,
      entries: lines,
      lines
    };
  }

  public static async updateVoucherStatus(id: string, status: string): Promise<void> {
    const cleanId = String(id);
    const vouchersList = await this.getVouchers();
    const existing = vouchersList.find(item => String(item.id) === cleanId || item.voucherNo === cleanId);
    const vNo = existing?.voucherNo || cleanId;

    try {
      await supabase.from('financial_vouchers').update({ status }).or(`id.eq.${cleanId},voucher_no.eq.${vNo}`);
    } catch {}

    if (status === 'DRAFT' || status === 'UNPOSTED') {
      // When unposted, remove ledger entries so live ledger and trial balance exclude this voucher
      try {
        await supabase.from('journal_entries').delete().eq('voucher_id', cleanId);
      } catch {}
      try {
        await supabase.from('ledgers').delete().or(`voucher_id.eq.${cleanId},voucher_no.eq.${vNo}`);
      } catch {}
    } else if (status === 'POSTED' && existing) {
      // When posted, ensure ledger entries exist for all lines
      const glRows = (existing.lines || existing.entries || []).map((l: any) => ({
        id: generateLedgerUuid(),
        voucher_id: existing.id,
        voucher_no: existing.voucherNo,
        entry_date: existing.date,
        account_id: l.accountId || l.account_id,
        account_code: l.accountCode || l.account_code,
        narration: l.memo || existing.narration || '',
        debit: Number(l.debitAmount ?? l.debit ?? 0),
        credit: Number(l.creditAmount ?? l.credit ?? 0),
        status: 'POSTED'
      }));
      if (glRows.length > 0) {
        try {
          let coaMap: Map<string, string> = new Map();
          try {
            const { data: coaAccs } = await supabase.from('coa_accounts').select('id, code');
            if (Array.isArray(coaAccs)) coaMap = new Map(coaAccs.map((a: any) => [a.code, String(a.id)]));
          } catch (_) {}
          const mappedLedgers = glRows.map((r: any) => ({
            ...r,
            id: generateLedgerUuid(),
            account_id: coaMap.get(r.account_code) || r.account_id
          }));
          await supabase.from('ledgers').insert(mappedLedgers);
        } catch {}
      }
    }

    try {
      this.clearCoaCache();
      await supabase.rpc('sync_coa_current_balances');
    } catch (_) {}
  }

  public static isAutoVoucher(v: any): boolean {
    if (!v) return false;
    const ref = String(v.reference || v.reference_no || '').trim().toUpperCase();
    const narr = String(v.narration || '').toLowerCase();

    // 1. Automated upstream reference document prefixes (Inward Gate Pass, Invoices, Payroll, Bales)
    if (
      ref.startsWith('INWARD-') ||
      ref.startsWith('IGP-') ||
      ref.startsWith('IGP_VCH-') ||
      ref.startsWith('PINV-') ||
      ref.startsWith('INV-') ||
      ref.startsWith('PUR-') ||
      ref.startsWith('PAYROLL-') ||
      ref.startsWith('COD-') ||
      ref.startsWith('BALE-') ||
      ref.startsWith('TAX-') ||
      ref.startsWith('COMM-') ||
      ref.startsWith('SAL-')
    ) {
      return true;
    }

    // 2. Automated narrations
    if (
      narr.startsWith('[auto]') ||
      narr.includes('inward gate pass') ||
      narr.includes('commercial purchase invoice') ||
      narr.includes('commercial sales invoice') ||
      narr.includes('payroll voucher') ||
      narr.includes('auto-posted') ||
      narr.includes('system generated')
    ) {
      return true;
    }

    // 3. Explicit is_auto flag
    if (v.is_auto === true || v.isAuto === true) {
      return true;
    }

    return false;
  }

  public static async updateVoucher(id: string, v: any): Promise<Voucher> {
    const cleanId = String(id);
    const vouchersList = await this.getVouchers();
    const existing = vouchersList.find(item => String(item.id) === cleanId || item.voucherNo === cleanId);
    if (existing && this.isAutoVoucher(existing)) {
      throw new Error('Auto-generated system vouchers cannot be edited.');
    }

    const voucherNo = String(v.voucherNo || existing?.voucherNo || `VCH-${Date.now().toString().slice(-6)}`);
    const date = v.date || existing?.date || new Date().toISOString().slice(0, 10);
    const type = String(v.type || existing?.type || 'JOURNAL');
    const reference = String(v.reference || v.documentRef || existing?.reference || '');
    const narration = String(v.narration || existing?.narration || '');
    const totalDebit = Number(v.totalDebit || 0);
    const totalCredit = Number(v.totalCredit || 0);
    const status = String(v.status || existing?.status || 'POSTED');

    const currency = String(v.currency || existing?.currency || 'AED').toUpperCase();
    const exchangeRate = Number(v.exchangeRate ?? v.exchange_rate ?? existing?.exchangeRate ?? 1.0);
    const baseCurrency = String(v.baseCurrency || v.base_currency || existing?.baseCurrency || 'AED').toUpperCase();
    const foreignTotalAmount = Number(
      v.foreignTotalAmount ?? v.foreign_total_amount ?? (currency === 'AED' ? totalDebit : (totalDebit / (exchangeRate || 1.0)))
    );

    const updatePayload = {
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
      currency,
      exchange_rate: exchangeRate,
      base_currency: baseCurrency,
      foreign_total_amount: foreignTotalAmount,
      status
    };

    try {
      await supabase.from('financial_vouchers').update(updatePayload).eq('id', cleanId);
    } catch (e) {
      console.warn('financial_vouchers update error:', e);
    }

    const lines = v.lines || v.entries || [];
    if (Array.isArray(lines) && lines.length > 0) {
      // 1. Delete previous line items
      try {
        await supabase.from('journal_entries').delete().eq('voucher_id', cleanId);
      } catch {}
      try {
        await supabase.from('voucher_entries').delete().eq('voucher_id', cleanId);
      } catch {}
      try {
        await supabase.from('ledgers').delete().eq('voucher_id', cleanId);
      } catch {}

      // 2. Insert updated line items
      const coaList = await this.getCoaAccounts();

      const voucherEntriesRows = lines.map((l: any) => {
        const lineId = String(l.id && isValidUuid(l.id) ? l.id : generateLedgerUuid());
        const debit = toSafeLedgerAmount(l.debitAmount ?? l.debit ?? 0);
        const credit = toSafeLedgerAmount(l.creditAmount ?? l.credit ?? 0);
        const foreignDebit = toSafeLedgerAmount(l.foreignDebit ?? l.foreign_debit ?? (currency === 'AED' ? debit : (debit / (exchangeRate || 1.0))));
        const foreignCredit = toSafeLedgerAmount(l.foreignCredit ?? l.foreign_credit ?? (currency === 'AED' ? credit : (credit / (exchangeRate || 1.0))));
        const memo = l.memo || l.narration || narration;

        const targetAccId = String(l.accountId || l.account_id || '');
        const matchedAcc = coaList.find(a => a.id === targetAccId || a.code === targetAccId);

        const resolvedCode = String(l.accountCode || l.account_code || matchedAcc?.code || '');
        const resolvedName = String(l.accountName || l.account_name || matchedAcc?.name || '');
        const resolvedPartyId = l.partyId || l.party_id || matchedAcc?.party_id || matchedAcc?.partyId || null;
        const resolvedPartyName = l.partyName || l.party_name || (resolvedPartyId ? resolvedName.replace(/\s*\([^)]*\)/g, '') : null);

        return {
          id: lineId,
          voucher_id: cleanId,
          voucher_no: voucherNo,
          account_id: targetAccId || matchedAcc?.id || null,
          account_code: resolvedCode,
          account_name: resolvedName,
          party_id: resolvedPartyId,
          party_name: resolvedPartyName,
          debit,
          credit,
          currency,
          exchange_rate: toSafeLedgerAmount(exchangeRate, 6),
          foreign_debit: foreignDebit,
          foreign_credit: foreignCredit,
          particulars: memo,
          memo,
          narration: memo,
          date
        };
      });

      const generalLedgerRows = voucherEntriesRows.map((veRow: any) => {
        return {
          id: generateLedgerUuid(),
          voucher_id: cleanId,
          voucher_no: voucherNo,
          account_id: veRow.account_id,
          account_code: veRow.account_code,
          account_name: veRow.account_name,
          party_id: veRow.party_id,
          party_name: veRow.party_name,
          date,
          entry_date: date,
          debit: toSafeLedgerAmount(veRow.debit),
          credit: toSafeLedgerAmount(veRow.credit),
          currency,
          exchange_rate: toSafeLedgerAmount(exchangeRate, 6),
          foreign_debit: toSafeLedgerAmount(veRow.foreign_debit),
          foreign_credit: toSafeLedgerAmount(veRow.foreign_credit),
          balance: toSafeLedgerAmount(veRow.debit - veRow.credit),
          running_balance: toSafeLedgerAmount(veRow.debit - veRow.credit),
          narration: veRow.narration,
          description: veRow.narration
        };
      });

      try {
        await supabase.from('voucher_entries').insert(voucherEntriesRows);
      } catch (err) {
        console.warn('voucher_entries update insert warning:', err);
      }
      try {
        let coaMap: Map<string, string> = new Map();
        try {
          const { data: coaAccs } = await supabase.from('coa_accounts').select('id, code');
          if (Array.isArray(coaAccs)) coaMap = new Map(coaAccs.map((a: any) => [a.code, String(a.id)]));
        } catch (_) {}
        const mappedLedgers = generalLedgerRows.map((glRow: any) => ({
          ...glRow,
          id: generateLedgerUuid(), // FRESH UNIQUE UUID for EVERY SINGLE ROW in ledgers
          voucher_id: cleanId,
          account_id: coaMap.get(glRow.account_code) || glRow.account_id
        }));
        await supabase.from('ledgers').insert(mappedLedgers);
      } catch (err) {
        console.warn('ledgers update insert warning:', err);
      }
    }

    try {
      this.clearCoaCache();
      await supabase.rpc('sync_coa_current_balances');
    } catch (_) {}

    return {
      id: cleanId,
      voucherNo,
      date,
      type: type as any,
      reference,
      narration,
      totalDebit,
      totalCredit,
      status: status as any,
      currency: currency as any,
      exchangeRate,
      baseCurrency,
      foreignTotalAmount,
      createdBy: existing?.createdBy || 'Manual',
      isAuto: false,
      entries: lines,
      lines
    };
  }

  public static async deleteVoucher(id: string, force: boolean = true): Promise<boolean> {
    const cleanId = String(id);
    let vNo = cleanId;
    try {
      const vouchersList = await this.getVouchers();
      const existing = vouchersList.find(item => String(item.id) === cleanId || item.voucherNo === cleanId);
      if (existing) {
        vNo = existing.voucherNo || cleanId;
        if (this.isAutoVoucher(existing)) {
          throw new Error('Deletion Blocked: System auto-generated vouchers (Inward Gate Passes, Commercial Invoices, Payroll) are audit-locked and cannot be deleted. Only manual vouchers can be deleted.');
        }
      }
    } catch (checkErr: any) {
      if (checkErr?.message?.includes('Deletion Blocked')) {
        throw checkErr;
      }
    }

    // Call serverless endpoint if available
    try {
      fetch(`/api/finance/vouchers/${cleanId}`, { method: 'DELETE' }).catch(() => {});
    } catch (_) {}

    try {
      await supabase.from('journal_entries').delete().eq('voucher_id', cleanId);
    } catch (_) {}
    try {
      await supabase.from('voucher_entries').delete().or(`voucher_id.eq.${cleanId},voucher_no.eq.${vNo}`);
    } catch {}
    try {
      await supabase.from('ledgers').delete().or(`voucher_id.eq.${cleanId},voucher_no.eq.${vNo}`);
    } catch {}
    try {
      await supabase.from('financial_vouchers').delete().or(`id.eq.${cleanId},voucher_no.eq.${vNo}`);
    } catch {}

    try {
      this.clearCoaCache();
      await supabase.rpc('sync_coa_current_balances');
    } catch (_) {}

    return true;
  }

  /**
   * Recalculates a party's running balance from parties.opening_balance and party_khata_logs,
   * updates parties.current_balance, and updates the mapped coa_account if present.
   */
  public static async recalculatePartyBalance(partyId: string): Promise<number> {
    if (!partyId) return 0;
    const cleanId = String(partyId).trim();

    try {
      // 1. Fetch party record
      const { data: party, error: pErr } = await supabase
        .from('parties')
        .select('id, type, party_type, opening_balance, current_balance, coa_account_id')
        .eq('id', cleanId)
        .maybeSingle();

      if (pErr || !party) {
        return 0;
      }

      const rawType = String(party.type || party.party_type || '').toUpperCase();
      const isSupplier = rawType.includes('SUPPLIER') || rawType.includes('VENDOR') || rawType.includes('COURIER');
      const openingBalance = Number(party.opening_balance || 0);

      // 2. Fetch all remaining khata logs for this party ordered chronologically
      const { data: logs } = await supabase
        .from('party_khata_logs')
        .select('id, debit, credit')
        .eq('party_id', cleanId)
        .order('date', { ascending: true })
        .order('created_at', { ascending: true });

      let calculatedBalance = openingBalance;

      if (logs && logs.length > 0) {
        for (const log of logs) {
          const dr = Number(log.debit || 0);
          const cr = Number(log.credit || 0);
          if (isSupplier) {
            calculatedBalance = calculatedBalance + cr - dr;
          } else {
            calculatedBalance = calculatedBalance + dr - cr;
          }
        }
      }

      calculatedBalance = Math.max(0, Number(calculatedBalance.toFixed(2)));

      // 3. Update parties.current_balance
      await supabase
        .from('parties')
        .update({ current_balance: calculatedBalance })
        .eq('id', cleanId);

      // 4. Update mapped coa_account if present
      if (party.coa_account_id) {
        try {
          await supabase
            .from('coa_accounts')
            .update({ current_balance: calculatedBalance })
            .eq('id', party.coa_account_id);
        } catch (_) {}
        try {
          await supabase
            .from('chart_of_accounts')
            .update({ current_balance: calculatedBalance })
            .eq('id', party.coa_account_id);
        } catch (_) {}
      }

      return calculatedBalance;
    } catch (err) {
      console.warn(`[FinanceService] Error recalculating party balance for ${cleanId}:`, err);
      return 0;
    }
  }

  /**
   * Cascades full deletion of financial vouchers, cascading journal entries, ledger lines,
   * party khata logs, and recalculates party and COA balances.
   */
  public static async cascadeDeleteVouchersForDocument(
    docRef: string,
    options?: { invoiceId?: string; partyId?: string; docType?: 'PURCHASE' | 'SALES' | 'INWARD' }
  ): Promise<void> {
    if (!docRef || !docRef.trim()) return;
    const cleanRef = docRef.trim();
    const cleanNoSpecial = cleanRef.replace(/[^a-zA-Z0-9]/g, '');
    const cleanUpper = cleanRef.toUpperCase();
    const cleanNoSpecialUpper = cleanNoSpecial.toUpperCase();
    const invIdClean = options?.invoiceId ? String(options.invoiceId).trim() : '';

    const affectedPartyIds = new Set<string>();
    if (options?.partyId) {
      affectedPartyIds.add(String(options.partyId));
    }

    // Auto-resolve any document aliases (e.g. invoice_no from invoice ID or vice versa)
    const tokens = new Set<string>([cleanRef]);
    if (invIdClean) tokens.add(invIdClean);

    try {
      const isRefUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cleanRef);
      const [piLookup, siLookup] = await Promise.all([
        supabase.from('purchase_invoices').select('id, invoice_no, supplier_id').or(isRefUuid ? `id.eq.${cleanRef},invoice_no.eq.${cleanRef}` : `invoice_no.eq.${cleanRef}`).maybeSingle(),
        supabase.from('sales_invoices').select('id, invoice_no, client_id').or(isRefUuid ? `id.eq.${cleanRef},invoice_no.eq.${cleanRef}` : `invoice_no.eq.${cleanRef}`).maybeSingle()
      ]);

      if (piLookup.data) {
        if (piLookup.data.id) tokens.add(String(piLookup.data.id));
        if (piLookup.data.invoice_no) tokens.add(String(piLookup.data.invoice_no));
        if (piLookup.data.supplier_id) affectedPartyIds.add(String(piLookup.data.supplier_id));
      }
      if (siLookup.data) {
        if (siLookup.data.id) tokens.add(String(siLookup.data.id));
        if (siLookup.data.invoice_no) tokens.add(String(siLookup.data.invoice_no));
        const clientId = (siLookup.data as any).client_id || (siLookup.data as any).customer_id;
        if (clientId) affectedPartyIds.add(String(clientId));
      }

      // 1. Fetch matching vouchers from financial_vouchers
      const fvRes = await supabase
        .from('financial_vouchers')
        .select('id, voucher_no, reference, reference_no, narration, party_id');

      const matched: { id: string; voucherNo: string }[] = [];

      const checkAndAdd = (item: any) => {
        const vId = String(item.id || '');
        const vRef = String(item.reference || '').toUpperCase();
        const vRefNo = String(item.reference_no || '').toUpperCase();
        const vNo = String(item.voucher_no || '').toUpperCase();
        const vNarr = String(item.narration || '').toUpperCase();

        let isMatch = false;
        for (const t of tokens) {
          const tUpper = t.toUpperCase();
          const tClean = t.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
          if (
            (vRef && (vRef === tUpper || vRef.includes(tUpper) || vRef === `PINV-${tUpper}` || vRef === `PUR-${tUpper}` || vRef === `INWARD-${tUpper}` || vRef === `SINV-${tUpper}` || vRef === `SLS-${tUpper}` || vRef === `IGP-${tUpper}` || vRef === `BALE-${tUpper}`)) ||
            (vRefNo && (vRefNo === tUpper || vRefNo.includes(tUpper) || vRefNo === `PINV-${tUpper}` || vRefNo === `PUR-${tUpper}` || vRefNo === `INWARD-${tUpper}` || vRefNo === `SINV-${tUpper}` || vRefNo === `SLS-${tUpper}` || vRefNo === `IGP-${tUpper}` || vRefNo === `BALE-${tUpper}`)) ||
            (vNarr && vNarr.includes(tUpper)) ||
            (tClean && (vNo.includes(tClean) || vNo.includes(`JV-SLS-${tClean}`) || vNo.includes(`JV-PUR-${tClean}`) || vNo.includes(`JV-PINV-${tClean}`) || vNo.includes(`JV-INW-${tClean}`)))
          ) {
            isMatch = true;
            break;
          }
        }

        if (isMatch) {
          if (!matched.some(m => m.id === vId)) {
            matched.push({ id: vId, voucherNo: String(item.voucher_no || vId) });
          }
          if (item.party_id) {
            affectedPartyIds.add(String(item.party_id));
          }
        }
      };

      (fvRes.data || []).forEach(checkAndAdd);

      // 2. Cascade delete journal entries FIRST for all matched vouchers (prevents FK violation and orphaned rows)
      for (const m of matched) {
        const cleanId = m.id;
        const vNo = m.voucherNo;

        // Fetch any party IDs associated with these journal entries or voucher entries
        try {
          const { data: jeParties } = await supabase
            .from('journal_entries')
            .select('party_id')
            .eq('voucher_id', cleanId);
          (jeParties || []).forEach((r: any) => {
            if (r.party_id) affectedPartyIds.add(String(r.party_id));
          });
        } catch (_) {}

        // Delete journal entries first
        try {
          await supabase.from('journal_entries').delete().eq('voucher_id', cleanId);
        } catch (jeErr) {
          console.warn(`[FinanceService] Notice deleting journal_entries for voucher ${cleanId}:`, jeErr);
        }

        try {
          await supabase.from('voucher_entries').delete().or(`voucher_id.eq.${cleanId},voucher_no.eq.${vNo}`);
        } catch (_) {}
        try {
          await supabase.from('ledgers').delete().or(`voucher_id.eq.${cleanId},voucher_no.eq.${vNo}`);
        } catch (_) {}
        try {
          await supabase.from('financial_vouchers').delete().or(`id.eq.${cleanId},voucher_no.eq.${vNo}`);
        } catch (_) {}
      }

      // 3. Safety broad delete on journal_entries, ledgers, financial_vouchers matching any token
      for (const tok of tokens) {
        try {
          await supabase.from('journal_entries').delete().ilike('description', `%${tok}%`);
        } catch (_) {}
        try {
          await supabase.from('financial_vouchers').delete().or(`reference.eq.${tok},reference_no.eq.${tok},reference.ilike.%${tok}%,reference_no.ilike.%${tok}%`);
        } catch (_) {}
      }

      // 4. Strict Hard Delete of party_khata_logs (NO reversal entries, complete purge of all associated logs)
      for (const tok of tokens) {
        try {
          const { data: khtRows } = await supabase
            .from('party_khata_logs')
            .select('party_id')
            .or(`reference.eq.${tok},reference.ilike.%${tok}%,notes.ilike.%${tok}%`);

          (khtRows || []).forEach((r: any) => {
            if (r.party_id) affectedPartyIds.add(String(r.party_id));
          });

          await supabase
            .from('party_khata_logs')
            .delete()
            .or(`reference.eq.${tok},reference.ilike.%${tok}%,notes.ilike.%${tok}%`);
        } catch (khtErr) {
          console.warn(`[FinanceService] Notice deleting party_khata_logs for ${tok}:`, khtErr);
        }
      }

      // 5. Recalculate balances for all affected parties (Strict Zero-State if all invoices unposted/deleted)
      for (const pId of affectedPartyIds) {
        await this.recalculatePartyBalance(pId);
      }

      // 6. Clear cache and synchronize COA in SQL
      this.clearCoaCache();
      try {
        await supabase.rpc('sync_coa_current_balances');
      } catch (_) {}

      // 7. If zero purchase invoices and zero inward gate passes remain, reset raw materials & supplier accounts to 0
      try {
        const { count: invCount } = await supabase.from('purchase_invoices').select('id', { count: 'exact', head: true });
        const { count: baleCount } = await supabase.from('inward_gate_passes').select('id', { count: 'exact', head: true });
        if (Number(invCount || 0) === 0 && Number(baleCount || 0) === 0) {
          await supabase.from('coa_accounts').update({ current_balance: 0 }).in('code', ['1140-00', '1140-01', '1150-00', '1150-01', '2110-00', '2110-01']);
          await supabase.from('chart_of_accounts').update({ current_balance: 0 }).in('code', ['1140-00', '1140-01', '1150-00', '1150-01', '2110-00', '2110-01']);
        }
      } catch (_) {}
    } catch (err) {
      console.error('[FinanceService] Error in cascadeDeleteVouchersForDocument:', err);
      throw err;
    }
  }

  /**
   * System-level reversal: Reverses/deletes auto-vouchers, journal entries, and general ledger lines for a specific source document.
   */
  public static async reverseAutoVouchersForDocument(docRef: string): Promise<void> {
    return this.cascadeDeleteVouchersForDocument(docRef);
  }

  // --- SQL DATABASE REPORTING RPCS ---
  public static async getTrialBalance(startDate?: string, endDate?: string): Promise<{
    rows: any[];
    totalDebit: number;
    totalCredit: number;
    isBalanced: boolean;
    difference: number;
  }> {
    if (typeof window !== 'undefined') {
      try {
        const q = new URLSearchParams();
        if (startDate) q.append('startDate', startDate);
        if (endDate) q.append('endDate', endDate);
        const data = await safeFetchJson<any>(`/api/finance/reports/trial-balance${q.toString() ? '?' + q.toString() : ''}`, { credentials: 'include' });
        if (data && (Array.isArray(data.rows) || data.totalDebit !== undefined)) {
          return {
            rows: data.rows || [],
            totalDebit: Number(data.totalDebit || 0),
            totalCredit: Number(data.totalCredit || 0),
            isBalanced: Boolean(data.isBalanced),
            difference: Number(data.difference || 0)
          };
        }
      } catch (_) {}
    }

    try {
      const { data, error } = await supabase.rpc('get_trial_balance', {
        p_start_date: startDate || null,
        p_end_date: endDate || null
      });
      if (!error && data) {
        return {
          rows: data.rows || [],
          totalDebit: Number(data.totalDebit || 0),
          totalCredit: Number(data.totalCredit || 0),
          isBalanced: Boolean(data.isBalanced),
          difference: Number(data.difference || 0)
        };
      }
      if (error) console.warn('Supabase get_trial_balance warning:', error.message);
    } catch (err) {
      console.warn('Supabase get_trial_balance exception:', err);
    }
    return { rows: [], totalDebit: 0, totalCredit: 0, isBalanced: true, difference: 0 };
  }

  public static async getIncomeStatement(startDate?: string, endDate?: string): Promise<{
    revenue: { accounts: any[]; total: number; categories?: any };
    cogs: { accounts: any[]; total: number };
    operatingExpenses: { accounts: any[]; total: number };
    expenses: { accounts: any[]; total: number };
    grossProfit: number;
    netProfit: number;
    netOperatingProfit: number;
  }> {
    if (typeof window !== 'undefined') {
      try {
        const q = new URLSearchParams();
        if (startDate) q.append('startDate', startDate);
        if (endDate) q.append('endDate', endDate);
        const data = await safeFetchJson<any>(`/api/finance/reports/income-statement${q.toString() ? '?' + q.toString() : ''}`, { credentials: 'include' });
        if (data && (data.revenue || data.netProfit !== undefined)) {
            return {
              revenue: {
                accounts: data.revenue?.accounts || [],
                total: Number(data.revenue?.total || 0),
                categories: data.revenue?.categories || {}
              },
              cogs: {
                accounts: data.cogs?.accounts || [],
                total: Number(data.cogs?.total || 0)
              },
              operatingExpenses: {
                accounts: data.operatingExpenses?.accounts || [],
                total: Number(data.operatingExpenses?.total || 0)
              },
              expenses: {
                accounts: data.expenses?.accounts || [],
                total: Number(data.expenses?.total || 0)
              },
              grossProfit: Number(data.grossProfit || 0),
              netProfit: Number(data.netProfit || 0),
              netOperatingProfit: Number(data.netOperatingProfit || data.netProfit || 0)
            };
          }
      } catch (_) {}
    }

    try {
      const { data, error } = await supabase.rpc('get_income_statement', {
        p_start_date: startDate || null,
        p_end_date: endDate || null
      });
      if (!error && data) {
        return {
          revenue: {
            accounts: data.revenue?.accounts || [],
            total: Number(data.revenue?.total || 0),
            categories: data.revenue?.categories || {}
          },
          cogs: {
            accounts: data.cogs?.accounts || [],
            total: Number(data.cogs?.total || 0)
          },
          operatingExpenses: {
            accounts: data.operatingExpenses?.accounts || [],
            total: Number(data.operatingExpenses?.total || 0)
          },
          expenses: {
            accounts: data.expenses?.accounts || [],
            total: Number(data.expenses?.total || 0)
          },
          grossProfit: Number(data.grossProfit || 0),
          netProfit: Number(data.netProfit || 0),
          netOperatingProfit: Number(data.netOperatingProfit || data.netProfit || 0)
        };
      }
      if (error) console.warn('Supabase get_income_statement warning:', error.message);
    } catch (err) {
      console.warn('Supabase get_income_statement exception:', err);
    }
    return {
      revenue: { accounts: [], total: 0 },
      cogs: { accounts: [], total: 0 },
      operatingExpenses: { accounts: [], total: 0 },
      expenses: { accounts: [], total: 0 },
      grossProfit: 0,
      netProfit: 0,
      netOperatingProfit: 0
    };
  }

  public static async getBalanceSheet(asOfDate?: string): Promise<{
    assets: { accounts: any[]; total: number; categories?: any };
    liabilities: { accounts: any[]; total: number; categories?: any };
    equity: { accounts: any[]; total: number; categories?: any };
    retainedEarnings: number;
    totalAssets: number;
    totalLiabilities: number;
    totalEquity: number;
    totalLiabilitiesAndEquity: number;
    balanced: boolean;
    difference: number;
  }> {
    if (typeof window !== 'undefined') {
      try {
        const q = asOfDate ? `?asOfDate=${encodeURIComponent(asOfDate)}` : '';
        const data = await safeFetchJson<any>(`/api/finance/reports/balance-sheet${q}`, { credentials: 'include' });
        if (data && (data.assets || data.totalAssets !== undefined)) {
          return {
            assets: {
              accounts: data.assets?.accounts || [],
                total: Number(data.assets?.total || 0),
                categories: data.assets?.categories || {}
              },
              liabilities: {
                accounts: data.liabilities?.accounts || [],
                total: Number(data.liabilities?.total || 0),
                categories: data.liabilities?.categories || {}
              },
              equity: {
                accounts: data.equity?.accounts || [],
                total: Number(data.equity?.total || 0),
                categories: data.equity?.categories || {}
              },
              retainedEarnings: Number(data.retainedEarnings || 0),
              totalAssets: Number(data.totalAssets || 0),
              totalLiabilities: Number(data.totalLiabilities || 0),
              totalEquity: Number(data.totalEquity || 0),
              totalLiabilitiesAndEquity: Number(data.totalLiabilitiesAndEquity || 0),
              balanced: Boolean(data.balanced),
              difference: Number(data.difference || 0)
            };
          }
      } catch (_) {}
    }

    try {
      const { data, error } = await supabase.rpc('get_balance_sheet', {
        p_as_of_date: asOfDate || null
      });
      if (!error && data) {
        return {
          assets: {
            accounts: data.assets?.accounts || [],
            total: Number(data.assets?.total || 0),
            categories: data.assets?.categories || {}
          },
          liabilities: {
            accounts: data.liabilities?.accounts || [],
            total: Number(data.liabilities?.total || 0),
            categories: data.liabilities?.categories || {}
          },
          equity: {
            accounts: data.equity?.accounts || [],
            total: Number(data.equity?.total || 0),
            categories: data.equity?.categories || {}
          },
          retainedEarnings: Number(data.retainedEarnings || 0),
          totalAssets: Number(data.totalAssets || 0),
          totalLiabilities: Number(data.totalLiabilities || 0),
          totalEquity: Number(data.totalEquity || 0),
          totalLiabilitiesAndEquity: Number(data.totalLiabilitiesAndEquity || 0),
          balanced: Boolean(data.balanced),
          difference: Number(data.difference || 0)
        };
      }
      if (error) console.warn('Supabase get_balance_sheet warning:', error.message);
    } catch (err) {
      console.warn('Supabase get_balance_sheet exception:', err);
    }
    return {
      assets: { accounts: [], total: 0 },
      liabilities: { accounts: [], total: 0 },
      equity: { accounts: [], total: 0 },
      retainedEarnings: 0,
      totalAssets: 0,
      totalLiabilities: 0,
      totalEquity: 0,
      totalLiabilitiesAndEquity: 0,
      balanced: true,
      difference: 0
    };
  }

  public static async getFinancialReports(params?: { startDate?: string; endDate?: string; asOfDate?: string }): Promise<any> {
    if (typeof window !== 'undefined') {
      try {
        const q = new URLSearchParams();
        if (params?.startDate) q.append('startDate', params.startDate);
        if (params?.endDate) q.append('endDate', params.endDate);
        if (params?.asOfDate) q.append('asOfDate', params.asOfDate);
        const data = await safeFetchJson<any>(`/api/finance/reports${q.toString() ? '?' + q.toString() : ''}`, { credentials: 'include' });
        if (data && (data.balanceSheet || data.trialBalance || data.incomeStatement)) {
          return data;
        }
      } catch (_) {}
    }

    const [tb, inc, bs] = await Promise.all([
      this.getTrialBalance(params?.startDate, params?.endDate),
      this.getIncomeStatement(params?.startDate, params?.endDate),
      this.getBalanceSheet(params?.asOfDate || params?.endDate)
    ]);
    return {
      trialBalance: tb.rows,
      trialBalanceMeta: tb,
      incomeStatement: inc,
      balanceSheet: bs
    };
  }

  public static async getGeneralLedgerEntries(filters?: {
    accountId?: string;
    partyId?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
  }): Promise<{ entries: LedgerEntry[]; totalDebit: number; totalCredit: number }> {
    if (typeof window !== 'undefined') {
      try {
        const q = new URLSearchParams();
        if (filters?.accountId) q.append('accountId', filters.accountId);
        if (filters?.partyId) q.append('partyId', filters.partyId);
        if (filters?.startDate) q.append('startDate', filters.startDate);
        if (filters?.endDate) q.append('endDate', filters.endDate);
        if (filters?.search) q.append('search', filters.search);
        const data = await safeFetchJson<any>(`/api/finance/ledgers${q.toString() ? '?' + q.toString() : ''}`, { credentials: 'include' });
        if (data) {
          const list: any[] = Array.isArray(data) ? data : (Array.isArray(data?.entries) ? data.entries : (Array.isArray(data?.data) ? data.data : []));
          if (list.length > 0) {
            const entries: LedgerEntry[] = list.map((r: any) => ({
              id: String(r.id),
              voucherId: String(r.voucherId || r.voucher_id || ''),
              voucherNo: String(r.voucherNo || r.voucher_no || ''),
              accountId: String(r.accountId || r.account_id || ''),
              accountCode: String(r.accountCode || r.account_code || ''),
              accountName: String(r.accountName || r.account_name || ''),
              partyId: r.partyId || r.party_id || undefined,
              partyName: r.partyName || r.party_name || undefined,
              date: typeof r.date === 'string' ? r.date.slice(0, 10) : new Date().toISOString().slice(0, 10),
              debit: Number(r.debit || 0),
              credit: Number(r.credit || 0),
              runningBalance: Number(r.runningBalance || r.balance || 0),
              balance: Number(r.runningBalance || r.balance || 0),
              documentRef: String(r.documentRef || r.document_ref || ''),
              narration: String(r.narration || '')
            }));
            const totalDebit = Number(data.totalDebit ?? entries.reduce((s, e) => s + (e.debit || 0), 0));
            const totalCredit = Number(data.totalCredit ?? entries.reduce((s, e) => s + (e.credit || 0), 0));
            return { entries, totalDebit, totalCredit };
          }
        }
      } catch (_) {}
    }

    try {
      const { data, error } = await supabase.rpc('get_general_ledger_entries', {
        p_account_id: filters?.accountId || null,
        p_party_id: filters?.partyId || null,
        p_start_date: filters?.startDate || null,
        p_end_date: filters?.endDate || null,
        p_search: filters?.search || null
      });
      if (!error && data && Array.isArray(data.entries) && data.entries.length > 0) {
        return {
          entries: data.entries.map((r: any) => ({
            id: String(r.id),
            voucherId: String(r.voucherId || r.voucher_id || ''),
            voucherNo: String(r.voucherNo || r.voucher_no || ''),
            accountId: String(r.accountId || r.account_id || ''),
            accountCode: String(r.accountCode || r.account_code || ''),
            accountName: String(r.accountName || r.account_name || ''),
            partyId: r.partyId || r.party_id || undefined,
            partyName: r.partyName || r.party_name || undefined,
            date: typeof r.date === 'string' ? r.date.slice(0, 10) : new Date().toISOString().slice(0, 10),
            debit: Number(r.debit || 0),
            credit: Number(r.credit || 0),
            runningBalance: Number(r.runningBalance || r.balance || 0),
            balance: Number(r.runningBalance || r.balance || 0),
            documentRef: String(r.documentRef || r.document_ref || ''),
            narration: String(r.narration || '')
          })),
          totalDebit: Number(data.totalDebit || 0),
          totalCredit: Number(data.totalCredit || 0)
        };
      }
    } catch (_) {}

    // Direct Supabase Fallback: Join journal_entries + financial_vouchers + chart_of_accounts + parties
    try {
      const [jeRes, veRes, fvRes, coaRes, caRes, ptyRes] = await Promise.all([
        supabase.from('journal_entries').select('*').order('created_at', { ascending: true }),
        supabase.from('voucher_entries').select('*'),
        supabase.from('financial_vouchers').select('id, voucher_no, date, reference, reference_no, narration, status'),
        supabase.from('chart_of_accounts').select('id, code, name'),
        supabase.from('coa_accounts').select('id, code, name'),
        supabase.from('parties').select('id, name, code')
      ]);

      const voucherMap = new Map<string, any>();
      (fvRes.data || []).forEach((v: any) => {
        voucherMap.set(String(v.id), v);
        if (v.voucher_no) voucherMap.set(String(v.voucher_no), v);
      });

      const coaMap = new Map<string, { code: string; name: string }>();
      (coaRes.data || []).forEach((c: any) => {
        if (c.id) coaMap.set(String(c.id), { code: c.code, name: c.name });
        if (c.code) coaMap.set(String(c.code), { code: c.code, name: c.name });
      });
      (caRes.data || []).forEach((c: any) => {
        if (c.id && !coaMap.has(String(c.id))) coaMap.set(String(c.id), { code: c.code, name: c.name });
        if (c.code && !coaMap.has(String(c.code))) coaMap.set(String(c.code), { code: c.code, name: c.name });
      });

      const partyMap = new Map<string, string>();
      (ptyRes.data || []).forEach((p: any) => {
        partyMap.set(String(p.id), p.name);
      });

      const rawItems: any[] = [];
      const seenIds = new Set<string>();

      (jeRes.data || []).forEach((je: any) => {
        const v = voucherMap.get(String(je.voucher_id));
        if (v && v.status && v.status !== 'POSTED') return; // Only posted postings
        const coa = coaMap.get(String(je.account_id)) || { code: '', name: '' };
        const pName = je.party_id ? partyMap.get(String(je.party_id)) || '' : '';
        const dateStr = v?.date ? String(v.date).slice(0, 10) : (je.created_at ? String(je.created_at).slice(0, 10) : new Date().toISOString().slice(0, 10));

        seenIds.add(String(je.id));
        rawItems.push({
          id: String(je.id),
          voucherId: String(je.voucher_id),
          voucherNo: String(v?.voucher_no || je.voucher_id),
          accountId: String(je.account_id || ''),
          accountCode: coa.code || '',
          accountName: coa.name || '',
          partyId: je.party_id ? String(je.party_id) : undefined,
          partyName: pName,
          date: dateStr,
          debit: Number(je.debit || 0),
          credit: Number(je.credit || 0),
          documentRef: String(v?.reference || v?.reference_no || ''),
          narration: String(je.description || v?.narration || '')
        });
      });

      // Include any standalone voucher_entries not mirrored in journal_entries
      (veRes.data || []).forEach((ve: any) => {
        const v = voucherMap.get(String(ve.voucher_id));
        if (v && v.status && v.status !== 'POSTED') return;
        if (seenIds.has(String(ve.id))) return;

        const coa = coaMap.get(String(ve.account_id)) || coaMap.get(String(ve.account_code)) || { code: ve.account_code || '', name: ve.account_name || '' };
        const pName = ve.party_id ? partyMap.get(String(ve.party_id)) || ve.party_name || '' : (ve.party_name || '');
        const dateStr = ve.date ? String(ve.date).slice(0, 10) : (v?.date ? String(v.date).slice(0, 10) : new Date().toISOString().slice(0, 10));

        rawItems.push({
          id: String(ve.id),
          voucherId: String(ve.voucher_id),
          voucherNo: String(ve.voucher_no || v?.voucher_no || ve.voucher_id),
          accountId: String(ve.account_id || ''),
          accountCode: coa.code || ve.account_code || '',
          accountName: coa.name || ve.account_name || '',
          partyId: ve.party_id ? String(ve.party_id) : undefined,
          partyName: pName,
          date: dateStr,
          debit: Number(ve.debit || 0),
          credit: Number(ve.credit || 0),
          documentRef: String(v?.reference || v?.reference_no || ''),
          narration: String(ve.particulars || ve.memo || ve.narration || v?.narration || '')
        });
      });

      // Sort chronologically
      rawItems.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

      // Compute running balance per account
      const runningMap = new Map<string, number>();
      const calculatedItems: LedgerEntry[] = rawItems.map(item => {
        const accKey = item.accountCode || item.accountId || 'UNKNOWN';
        const prevBal = runningMap.get(accKey) || 0;
        const newBal = prevBal + item.debit - item.credit;
        runningMap.set(accKey, newBal);
        return {
          ...item,
          runningBalance: Number(newBal.toFixed(2)),
          balance: Number(newBal.toFixed(2))
        };
      });

      // Apply Filters
      let filtered = calculatedItems;
      if (filters?.accountId && filters.accountId !== 'ALL') {
        const targetAcc = filters.accountId.toLowerCase();
        filtered = filtered.filter(i =>
          i.accountId.toLowerCase() === targetAcc ||
          i.accountCode.toLowerCase() === targetAcc ||
          i.accountCode.toLowerCase().replace(/[^a-z0-9]/g, '') === targetAcc.replace(/[^a-z0-9]/g, '')
        );
      }
      if (filters?.partyId && filters.partyId !== 'ALL') {
        const targetParty = filters.partyId.toLowerCase();
        filtered = filtered.filter(i => i.partyId && i.partyId.toLowerCase() === targetParty);
      }
      if (filters?.startDate) {
        filtered = filtered.filter(i => i.date >= filters.startDate!);
      }
      if (filters?.endDate) {
        filtered = filtered.filter(i => i.date <= filters.endDate!);
      }
      if (filters?.search && filters.search.trim()) {
        const s = filters.search.toLowerCase().trim();
        filtered = filtered.filter(i =>
          i.voucherNo.toLowerCase().includes(s) ||
          i.accountCode.toLowerCase().includes(s) ||
          i.accountName.toLowerCase().includes(s) ||
          i.narration.toLowerCase().includes(s) ||
          i.documentRef.toLowerCase().includes(s) ||
          (i.partyName && i.partyName.toLowerCase().includes(s))
        );
      }

      const totalDebit = Number(filtered.reduce((sum, e) => sum + (e.debit || 0), 0).toFixed(2));
      const totalCredit = Number(filtered.reduce((sum, e) => sum + (e.credit || 0), 0).toFixed(2));

      return {
        entries: filtered,
        totalDebit,
        totalCredit
      };
    } catch (fallbackErr) {
      console.warn('[FinanceService] Fallback GL exception:', fallbackErr);
      return { entries: [], totalDebit: 0, totalCredit: 0 };
    }
  }

  public static async getGeneralLedgerEntriesPaginated(options?: {
    page?: number;
    pageSize?: number;
    accountId?: string;
    partyId?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
  }): Promise<PaginatedResponse<LedgerEntry> & { totalDebit: number; totalCredit: number }> {
    const page = Math.max(1, options?.page || 1);
    const pageSize = Math.max(1, options?.pageSize || 10);
    const accountId = options?.accountId?.trim() || '';
    const partyId = options?.partyId?.trim() || '';
    const startDate = options?.startDate?.trim() || '';
    const endDate = options?.endDate?.trim() || '';
    const search = options?.search?.trim() || '';

    const { entries: allEntries, totalDebit, totalCredit } = await this.getGeneralLedgerEntries({
      accountId: accountId || undefined,
      partyId: partyId || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      search: search || undefined
    });

    const total = allEntries.length;
    const from = (page - 1) * pageSize;
    const to = from + pageSize;
    const pageEntries = allEntries.slice(from, to);

    const baseRes = buildPaginatedResponse(pageEntries, total, page, pageSize);
    return {
      ...baseRes,
      totalDebit,
      totalCredit
    };
  }


  // --- Ledgers ---
  public static async getLedgers(accountId?: string): Promise<LedgerEntry[]> {
    let rows: any[] = [];
    try {
      let query = supabase.from('ledgers').select('*').order('date', { ascending: false });
      if (accountId) query = query.eq('account_id', String(accountId));
      const { data, error } = await query;
      if (!error && data && data.length > 0) {
        rows = data;
      }
    } catch {}

    if (rows.length === 0) {
      try {
        let q = supabase.from('journal_entries').select('*').order('created_at', { ascending: false });
        if (accountId) q = q.eq('account_id', String(accountId));
        const { data, error } = await q;
        if (!error && data) {
          rows = data.map((je: any) => ({
            ...je,
            entry_date: je.created_at,
            narration: je.description
          }));
        }
      } catch (_) {}
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

