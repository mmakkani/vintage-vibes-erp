import { supabase } from '../supabaseClient.ts';
import { COAAccount, Voucher, LedgerEntry } from '../modules/finance/finance.types.ts';

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
        keysToRemove.forEach(k => localStorage.removeItem(k));
      } catch {}
    }
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
            const rawFetch = (window as any).__originalFetch || window.fetch;
            const apiRes = await rawFetch('/api/finance/coa?_t=' + Date.now());
            if (apiRes && apiRes.ok) {
              const apiData = await apiRes.json();
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
        const rawFetch = (window as any).__originalFetch || window.fetch;
        const res = await rawFetch('/api/finance/coa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(acc)
        });
        if (res && res.ok) {
          const created = await res.json();
          if (created && (created.id || created.code)) {
            this.clearCoaCache();
            return created;
          }
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
      const coaList = await this.getCoaAccounts();

      const voucherEntriesRows = lines.map((l: any, idx: number) => {
        const lineId = String(l.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `ve-${id}-${idx + 1}`));
        const debit = Number(l.debitAmount ?? l.debit ?? 0);
        const credit = Number(l.creditAmount ?? l.credit ?? 0);
        const foreignDebit = Number(l.foreignDebit ?? l.foreign_debit ?? (currency === 'AED' ? debit : (debit / (exchangeRate || 1.0))));
        const foreignCredit = Number(l.foreignCredit ?? l.foreign_credit ?? (currency === 'AED' ? credit : (credit / (exchangeRate || 1.0))));
        const memo = l.memo || l.narration || narration;

        const targetAccId = String(l.accountId || l.account_id || '');
        const matchedAcc = coaList.find(a => a.id === targetAccId || a.code === targetAccId);

        const resolvedCode = String(l.accountCode || l.account_code || matchedAcc?.code || '');
        const resolvedName = String(l.accountName || l.account_name || matchedAcc?.name || '');
        const resolvedPartyId = l.partyId || l.party_id || matchedAcc?.party_id || matchedAcc?.partyId || null;
        const resolvedPartyName = l.partyName || l.party_name || (resolvedPartyId ? resolvedName.replace(/\s*\([^)]*\)/g, '') : null);

        return {
          id: lineId,
          voucher_id: String(id),
          voucher_no: voucherNo,
          account_id: targetAccId || matchedAcc?.id || null,
          account_code: resolvedCode,
          account_name: resolvedName,
          party_id: resolvedPartyId,
          party_name: resolvedPartyName,
          debit,
          credit,
          currency,
          exchange_rate: exchangeRate,
          foreign_debit: foreignDebit,
          foreign_credit: foreignCredit,
          particulars: memo,
          memo,
          narration: memo,
          date
        };
      });

      const generalLedgerRows = voucherEntriesRows.map((veRow: any, idx: number) => {
        return {
          id: String(typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `gl-${id}-${idx + 1}`),
          voucher_id: String(id),
          voucher_no: voucherNo,
          account_id: veRow.account_id,
          account_code: veRow.account_code,
          account_name: veRow.account_name,
          party_id: veRow.party_id,
          party_name: veRow.party_name,
          date,
          entry_date: date,
          debit: veRow.debit,
          credit: veRow.credit,
          currency,
          exchange_rate: exchangeRate,
          foreign_debit: veRow.foreign_debit,
          foreign_credit: veRow.foreign_credit,
          balance: veRow.debit - veRow.credit,
          running_balance: veRow.debit - veRow.credit,
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

      try {
        const journalEntriesRows = voucherEntriesRows.map((veRow: any) => ({
          voucher_id: String(id),
          account_id: veRow.account_id,
          party_id: veRow.party_id || null,
          debit: veRow.debit,
          credit: veRow.credit,
          description: veRow.narration || narration
        }));
        await supabase.from('journal_entries').insert(journalEntriesRows);
      } catch (err) {
        console.warn('journal_entries insert warning in FinanceService.addVoucher:', err);
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
    try {
      await supabase.from('vouchers').update({ status }).or(`id.eq.${cleanId},voucher_no.eq.${vNo}`);
    } catch {}

    if (status === 'DRAFT' || status === 'UNPOSTED') {
      // When unposted, remove GL entries so live ledger and trial balance exclude this voucher
      try {
        await supabase.from('general_ledger').delete().or(`voucher_id.eq.${cleanId},voucher_no.eq.${vNo}`);
      } catch {}
      try {
        await supabase.from('ledgers').delete().or(`voucher_id.eq.${cleanId},voucher_no.eq.${vNo}`);
      } catch {}
    } else if (status === 'POSTED' && existing) {
      // When posted, ensure GL entries exist for all lines
      const glRows = (existing.lines || existing.entries || []).map((l: any, i: number) => ({
        id: `gl-${existing.id}-${i}-${Date.now()}`,
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
        try { await supabase.from('general_ledger').insert(glRows); } catch {}
        try { await supabase.from('ledgers').insert(glRows); } catch {}
      }
    }

    try {
      this.clearCoaCache();
      await supabase.rpc('sync_coa_current_balances');
    } catch (_) {}
  }

  public static isAutoVoucher(v: any): boolean {
    if (!v) return false;
    // Only lock as auto if it is an automated upstream document (PINV, INV, PAYROLL)
    if (v.is_auto === true || v.isAuto === true) {
      const vNo = String(v.voucher_no || v.voucherNo || '').toUpperCase();
      if (vNo.startsWith('VCH-') || vNo.startsWith('BPV-') || vNo.startsWith('CPV-') || vNo.startsWith('BRV-') || vNo.startsWith('CRV-')) {
        return false; // Manual voucher created by user
      }
      return true;
    }
    const ref = String(v.reference || v.reference_no || '').trim().toUpperCase();
    if (
      ref.startsWith('PINV-') ||
      ref.startsWith('INV-') ||
      ref.startsWith('PAYROLL-') ||
      ref.startsWith('COD-') ||
      ref.startsWith('BALE-') ||
      ref.startsWith('TAX-') ||
      ref.startsWith('COMM-')
    ) {
      return true;
    }
    const narr = String(v.narration || '').toLowerCase();
    if (
      narr.startsWith('[auto]') ||
      narr.includes('commercial purchase invoice posted') ||
      narr.includes('commercial sales invoice posted')
    ) {
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

    try {
      await supabase.from('vouchers').update(updatePayload).eq('id', cleanId);
    } catch (e) {
      console.warn('vouchers update error:', e);
    }

    const lines = v.lines || v.entries || [];
    if (Array.isArray(lines) && lines.length > 0) {
      // 1. Delete previous line items
      try {
        await supabase.from('voucher_entries').delete().eq('voucher_id', cleanId);
      } catch {}
      try {
        await supabase.from('general_ledger').delete().eq('voucher_id', cleanId);
      } catch {}
      try {
        await supabase.from('ledgers').delete().eq('voucher_id', cleanId);
      } catch {}

      // 2. Insert updated line items
      const coaList = await this.getCoaAccounts();

      const voucherEntriesRows = lines.map((l: any, idx: number) => {
        const lineId = String(l.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `ve-${cleanId}-${idx + 1}`));
        const debit = Number(l.debitAmount ?? l.debit ?? 0);
        const credit = Number(l.creditAmount ?? l.credit ?? 0);
        const foreignDebit = Number(l.foreignDebit ?? l.foreign_debit ?? (currency === 'AED' ? debit : (debit / (exchangeRate || 1.0))));
        const foreignCredit = Number(l.foreignCredit ?? l.foreign_credit ?? (currency === 'AED' ? credit : (credit / (exchangeRate || 1.0))));
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
          exchange_rate: exchangeRate,
          foreign_debit: foreignDebit,
          foreign_credit: foreignCredit,
          particulars: memo,
          memo,
          narration: memo,
          date
        };
      });

      const generalLedgerRows = voucherEntriesRows.map((veRow: any, idx: number) => {
        return {
          id: String(typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `gl-${cleanId}-${idx + 1}`),
          voucher_id: cleanId,
          voucher_no: voucherNo,
          account_id: veRow.account_id,
          account_code: veRow.account_code,
          account_name: veRow.account_name,
          party_id: veRow.party_id,
          party_name: veRow.party_name,
          date,
          entry_date: date,
          debit: veRow.debit,
          credit: veRow.credit,
          currency,
          exchange_rate: exchangeRate,
          foreign_debit: veRow.foreign_debit,
          foreign_credit: veRow.foreign_credit,
          balance: veRow.debit - veRow.credit,
          running_balance: veRow.debit - veRow.credit,
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
        await supabase.from('general_ledger').insert(generalLedgerRows);
      } catch (err) {
        console.warn('general_ledger update insert warning:', err);
      }
      try {
        await supabase.from('ledgers').insert(generalLedgerRows);
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
      if (existing?.voucherNo) {
        vNo = existing.voucherNo;
      }
    } catch (_) {}

    // Call serverless endpoint if available
    try {
      fetch(`/api/finance/vouchers/${cleanId}`, { method: 'DELETE' }).catch(() => {});
    } catch (_) {}

    try {
      await supabase.from('voucher_entries').delete().or(`voucher_id.eq.${cleanId},voucher_no.eq.${vNo}`);
    } catch {}
    try {
      await supabase.from('financial_voucher_lines').delete().or(`voucher_id.eq.${cleanId},voucher_no.eq.${vNo}`);
    } catch {}
    try {
      await supabase.from('general_ledger').delete().or(`voucher_id.eq.${cleanId},voucher_no.eq.${vNo}`);
    } catch {}
    try {
      await supabase.from('ledgers').delete().or(`voucher_id.eq.${cleanId},voucher_no.eq.${vNo}`);
    } catch {}
    try {
      await supabase.from('financial_vouchers').delete().or(`id.eq.${cleanId},voucher_no.eq.${vNo}`);
    } catch {}
    try {
      await supabase.from('vouchers').delete().or(`id.eq.${cleanId},voucher_no.eq.${vNo}`);
    } catch {}

    try {
      this.clearCoaCache();
      await supabase.rpc('sync_coa_current_balances');
    } catch (_) {}

    return true;
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
        const rawFetch = (window as any).__originalFetch || window.fetch;
        const q = new URLSearchParams();
        if (startDate) q.append('startDate', startDate);
        if (endDate) q.append('endDate', endDate);
        const res = await rawFetch(`/api/finance/reports/trial-balance${q.toString() ? '?' + q.toString() : ''}`);
        if (res && res.ok) {
          const data = await res.json();
          if (data && (Array.isArray(data.rows) || data.totalDebit !== undefined)) {
            return {
              rows: data.rows || [],
              totalDebit: Number(data.totalDebit || 0),
              totalCredit: Number(data.totalCredit || 0),
              isBalanced: Boolean(data.isBalanced),
              difference: Number(data.difference || 0)
            };
          }
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
        const rawFetch = (window as any).__originalFetch || window.fetch;
        const q = new URLSearchParams();
        if (startDate) q.append('startDate', startDate);
        if (endDate) q.append('endDate', endDate);
        const res = await rawFetch(`/api/finance/reports/income-statement${q.toString() ? '?' + q.toString() : ''}`);
        if (res && res.ok) {
          const data = await res.json();
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
        const rawFetch = (window as any).__originalFetch || window.fetch;
        const q = asOfDate ? `?asOfDate=${encodeURIComponent(asOfDate)}` : '';
        const res = await rawFetch(`/api/finance/reports/balance-sheet${q}`);
        if (res && res.ok) {
          const data = await res.json();
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
        const rawFetch = (window as any).__originalFetch || window.fetch;
        const q = new URLSearchParams();
        if (params?.startDate) q.append('startDate', params.startDate);
        if (params?.endDate) q.append('endDate', params.endDate);
        if (params?.asOfDate) q.append('asOfDate', params.asOfDate);
        const res = await rawFetch(`/api/finance/reports${q.toString() ? '?' + q.toString() : ''}`);
        if (res && res.ok) {
          const data = await res.json();
          if (data && (data.balanceSheet || data.trialBalance || data.incomeStatement)) {
            return data;
          }
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
        const rawFetch = (window as any).__originalFetch || window.fetch;
        const q = new URLSearchParams();
        if (filters?.accountId) q.append('accountId', filters.accountId);
        if (filters?.partyId) q.append('partyId', filters.partyId);
        if (filters?.startDate) q.append('startDate', filters.startDate);
        if (filters?.endDate) q.append('endDate', filters.endDate);
        if (filters?.search) q.append('search', filters.search);
        const res = await rawFetch(`/api/finance/ledgers${q.toString() ? '?' + q.toString() : ''}`);
        if (res && res.ok) {
          const data = await res.json();
          const list: any[] = Array.isArray(data) ? data : (Array.isArray(data?.entries) ? data.entries : []);
          const entries: LedgerEntry[] = list.map((r: any) => ({
            id: r.id,
            voucherId: r.voucherId || r.voucher_id,
            voucherNo: r.voucherNo || r.voucher_no,
            accountId: r.accountId || r.account_id,
            accountCode: r.accountCode || r.account_code,
            accountName: r.accountName || r.account_name,
            partyId: r.partyId || r.party_id,
            partyName: r.partyName || r.party_name,
            date: r.date,
            debit: Number(r.debit || 0),
            credit: Number(r.credit || 0),
            runningBalance: Number(r.runningBalance || r.balance || 0),
            balance: Number(r.runningBalance || r.balance || 0),
            documentRef: r.documentRef || r.document_ref || '',
            narration: r.narration || ''
          }));
          const totalDebit = entries.reduce((s, e) => s + (e.debit || 0), 0);
          const totalCredit = entries.reduce((s, e) => s + (e.credit || 0), 0);
          return { entries, totalDebit, totalCredit };
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
      if (!error && data) {
        return {
          entries: (data.entries || []).map((r: any) => ({
            id: r.id,
            voucherId: r.voucherId,
            voucherNo: r.voucherNo,
            accountId: r.accountId,
            accountCode: r.accountCode,
            accountName: r.accountName,
            partyId: r.partyId,
            partyName: r.partyName,
            date: r.date,
            debit: Number(r.debit || 0),
            credit: Number(r.credit || 0),
            runningBalance: Number(r.runningBalance || 0),
            balance: Number(r.runningBalance || 0),
            documentRef: r.documentRef || '',
            narration: r.narration || ''
          })),
          totalDebit: Number(data.totalDebit || 0),
          totalCredit: Number(data.totalCredit || 0)
        };
      }
      if (error) console.warn('Supabase get_general_ledger_entries warning:', error.message);
    } catch (err) {
      console.warn('Supabase get_general_ledger_entries exception:', err);
    }
    return { entries: [], totalDebit: 0, totalCredit: 0 };
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

