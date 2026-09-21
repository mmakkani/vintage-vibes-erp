import { supabase } from '../supabaseClient.ts';
import { Party, PartyKhataLog } from '../modules/parties/parties.types.ts';
import { FinanceService } from './financeService.ts';

export class PartiesService {
  public static async getParties(): Promise<Party[]> {
    // 1. Primary & direct route: query server endpoint which connects directly to PostgreSQL
    if (typeof window !== 'undefined') {
      try {
        const rawFetch = (window as any).__originalFetch || window.fetch;
        const apiRes = await rawFetch('/api/parties?_t=' + Date.now());
        if (apiRes && apiRes.ok) {
          const list = await apiRes.json();
          if (Array.isArray(list)) {
            const normalized = list.map((r: any) => ({
              id: r.id,
              code: r.code || `P-${r.id}`,
              name: r.name || 'Unnamed Party',
              type: (r.type || 'CLIENT').toUpperCase(),
              contactPerson: r.contactPerson || r.contact_person || '',
              phone: r.phone || '',
              email: r.email || '',
              address: r.address || '',
              trnNo: r.trn_no || r.trnNo || '',
              trn_no: r.trn_no || r.trnNo || '',
              party_id: r.party_id,
              company_name: r.company_name || r.name,
              party_type: r.party_type || r.type,
              linked_account_id: r.linked_account_id,
              creditLimit: Number(r.creditLimit ?? r.credit_limit ?? 0),
              credit_limit: Number(r.creditLimit ?? r.credit_limit ?? 0),
              currentBalance: Number(r.currentBalance ?? r.current_balance ?? 0),
              current_balance: Number(r.currentBalance ?? r.current_balance ?? 0),
              currency: r.currency || 'AED',
              isActive: r.isActive !== false && r.is_active !== false,
              is_active: r.isActive !== false && r.is_active !== false,
              accountMap: r.accountMap || r.account_map || {},
              account_map: r.accountMap || r.account_map || {},
              coaAccountId: r.coaAccountId || r.coa_account_id,
              coa_account_id: r.coaAccountId || r.coa_account_id,
              purchaseInvoicesCount: Number(r.purchaseInvoicesCount || 0),
              salesInvoicesCount: Number(r.salesInvoicesCount || 0),
              khataLogsCount: Number(r.khataLogsCount || 0),
              glEntriesCount: Number(r.glEntriesCount || 0),
              totalEntriesCount: Number(r.totalEntriesCount || 0),
              hasEntries: Boolean(r.hasEntries),
              createdAt: r.createdAt || r.created_at || new Date().toISOString(),
              created_at: r.createdAt || r.created_at || new Date().toISOString()
            }));
            try {
              localStorage.removeItem('vibe_cached_parties');
            } catch {}
            return normalized;
          }
        }
      } catch (_) {}
    }

    // 2. Secondary route: Supabase REST client
    try {
      const [partiesRes, liveBalancesRes] = await Promise.all([
        supabase.from('parties').select('*').order('name'),
        supabase.from('view_coa_live_balances').select('party_id, account_id, current_balance')
      ]);

      if (!partiesRes.error && Array.isArray(partiesRes.data)) {
        if (partiesRes.data.length === 0) {
          try {
            localStorage.removeItem('vibe_cached_parties');
          } catch {}
          return [];
        }

        const liveBalancesMap = new Map<string, number>();
        if (liveBalancesRes.data) {
          liveBalancesRes.data.forEach((row: any) => {
            if (row.party_id) {
              liveBalancesMap.set(String(row.party_id), Number(row.current_balance || 0));
            }
            if (row.account_id) {
              liveBalancesMap.set(String(row.account_id), Number(row.current_balance || 0));
            }
          });
        }

        const mapped = (partiesRes.data || []).map((row: any) => {
          const liveBal = liveBalancesMap.has(String(row.id))
            ? liveBalancesMap.get(String(row.id))!
            : (row.coa_account_id && liveBalancesMap.has(String(row.coa_account_id))
              ? liveBalancesMap.get(String(row.coa_account_id))!
              : Number(row.current_balance ?? row.currentBalance ?? 0));

          return {
            id: row.id,
            code: row.code,
            name: row.name,
            type: (row.type || 'CLIENT').toUpperCase(),
            contactPerson: row.contact_person || row.contactPerson || '',
            phone: row.phone || '',
            email: row.email || '',
            address: row.address || '',
            trnNo: row.trn_no || row.trnNo || '',
            trn_no: row.trn_no || row.trnNo || '',
            party_id: row.party_id,
            company_name: row.company_name || row.name,
            party_type: row.party_type || row.type,
            linked_account_id: row.linked_account_id,
            creditLimit: Number(row.credit_limit ?? row.creditLimit ?? 0),
            credit_limit: Number(row.credit_limit ?? row.creditLimit ?? 0),
            currentBalance: Number(liveBal.toFixed(2)),
            current_balance: Number(liveBal.toFixed(2)),
            currency: row.currency || 'AED',
            isActive: row.is_active !== false && row.isActive !== false,
            is_active: row.is_active !== false && row.isActive !== false,
            accountMap: row.account_map || row.accountMap || {},
            account_map: row.account_map || row.accountMap || {},
            coaAccountId: row.coa_account_id,
            coa_account_id: row.coa_account_id,
            createdAt: row.created_at || new Date().toISOString(),
            created_at: row.created_at || new Date().toISOString()
          };
        });

        try {
          localStorage.removeItem('vibe_cached_parties');
        } catch {}

        return mapped;
      }
    } catch (_) {}

    return [];
  }

  public static async ensurePartyCoaAccount(party: {
    id: string;
    code: string;
    name: string;
    type: string;
    currentBalance?: number;
    currency?: string;
    isActive?: boolean;
    accountMap?: any;
  }): Promise<string> {
    const cleanName = String(party.name || '').trim();
    if (!cleanName) return '';

    const isSupplier = party.type === 'SUPPLIER';
    const isClient = party.type === 'CLIENT' || party.type === 'CUSTOMER';
    const isAgent = party.type === 'AGENT';
    const parentCode = isAgent
      ? (party.accountMap?.payableAccountId || party.accountMap?.agentPayableAccountId || '2120-00')
      : (isSupplier 
        ? (party.accountMap?.payableAccountId || '2110-00')
        : (party.accountMap?.receivableAccountId || '1130-00'));
    const coaAccountType = isClient ? 'ASSET' : 'LIABILITY';
    const subType = isSupplier ? 'Accounts Payable - Trade' : (isClient ? 'Accounts Receivable - Trade' : 'Accounts Payable - Clearing & Courier Agent');
    const cleanCode = (party.code || '').replace(/[^A-Za-z0-9]/g, '') || String(Date.now()).slice(-4);
    const coaCode = isSupplier ? `2110-${cleanCode}` : (isClient ? `1130-${cleanCode}` : `2120-${cleanCode}`);
    const coaId = `acc-${party.id}`;
    const roleTag = isSupplier ? 'Supplier' : (isClient ? 'Customer' : 'Agent');
    const coaName = `${cleanName} (${roleTag})`;

    try {
      // 1. Look up parent in chart_of_accounts to get parent UUID
      const { data: parentAcc } = await supabase
        .from('chart_of_accounts')
        .select('id')
        .eq('code', parentCode)
        .maybeSingle();

      const parentId = parentAcc?.id || null;

      // 2. Upsert in chart_of_accounts (Standard 5-Tier PostgreSQL table)
      await supabase.from('chart_of_accounts').upsert({
        code: coaCode,
        name: coaName,
        account_type: coaAccountType,
        parent_id: parentId,
        current_balance: Number(party.currentBalance || 0)
      }, { onConflict: 'code' });

      // 3. Upsert in coa_accounts (Legacy compatibility)
      await supabase.from('coa_accounts').upsert({
        id: coaId,
        code: coaCode,
        name: coaName,
        type: coaAccountType,
        sub_type: subType,
        currency: party.currency || 'AED',
        current_balance: Number(party.currentBalance || 0),
        is_active: party.isActive !== false,
        parent_id: parentId || `acc-${parentCode.replace('-00', '')}`,
        parent_code: parentCode,
        party_id: party.id,
        tier_level: 3
      }, { onConflict: 'code' });

      // 4. Link accountMap and coa_account_id on party
      const updatedMap = isAgent ? {
        ...(party.accountMap || {}),
        payableAccountId: coaCode,
        agentPayableAccountId: coaCode,
        clearingAccountId: party.accountMap?.clearingAccountId || '1310-00',
        expenseAccountId: party.accountMap?.clearingAccountId || party.accountMap?.expenseAccountId || '5110-00'
      } : {
        ...(party.accountMap || {}),
        payableAccountId: isSupplier ? coaCode : (party.accountMap?.payableAccountId || '2110-01'),
        receivableAccountId: isClient ? coaCode : (party.accountMap?.receivableAccountId || '1130-00')
      };

      await supabase.from('parties').update({
        coa_account_id: coaCode,
        account_map: updatedMap
      }).eq('id', party.id);

      FinanceService.clearCoaCache();
    } catch (err) {
      console.warn('Auto-provisioning COA account for party failed (non-blocking):', err);
    }

    return coaCode;
  }

  public static async getPartyById(id: string): Promise<Party | null> {
    if (!id || id === 'undefined' || id === 'null') return null;
    if (typeof window !== 'undefined') {
      try {
        const rawFetch = (window as any).__originalFetch || window.fetch;
        const res = await rawFetch(`/api/parties/${encodeURIComponent(id)}`);
        if (res.ok) {
          const p = await res.json();
          if (Array.isArray(p)) {
            const found = p.find((x: any) => x.id === id || String(x.party_id) === String(id));
            return found || null;
          }
          if (p && (p.id || p.party_id || p.name)) {
            return p;
          }
        }
      } catch (_) {}
    }
    const { data } = await supabase.from('parties').select('*').or(`id.eq.${id},party_id.eq.${id}`).maybeSingle();
    return data as any;
  }

  public static async addParty(party: Partial<Party> & { party_type?: string; company_name?: string; companyName?: string; trn_no?: string; trnNo?: string; tax_id?: string; contact_no?: string; credit_limit?: number; receivable_account_id?: string; payable_account_id?: string }): Promise<Party> {
    const cleanName = String(party.name || party.company_name || party.companyName || '').trim();
    if (!cleanName) {
      throw new Error('Party company/customer name is required and cannot be empty or undefined');
    }

    const rawType = String(party.type || party.party_type || (party as any).partyType || 'CLIENT').trim().toUpperCase();
    const type = (rawType === 'SUPPLIER' || rawType === 'AGENT') ? rawType : 'CLIENT';

    const phone = party.phone || party.contact_no || (party as any).contactNo || '';
    const trnNo = party.trn_no || party.trnNo || party.tax_id || (party as any).trnTaxNo || '';
    const creditLimit = Number(party.creditLimit ?? party.credit_limit ?? 50000);
    const payableAccountId = party.payableAccountId || (party as any).payable_account_id || (type === 'AGENT' ? '2120-00' : '2110-01');
    const receivableAccountId = party.receivableAccountId || (party as any).receivable_account_id || '1130-00';
    const clearingAccountId = party.clearingAccountId || (party as any).clearing_account_id || '1310-00';
    const revenueAccountId = party.revenueAccountId || (party as any).revenue_account_id || '4110-00';

    const normalizedInput = {
      ...party,
      name: cleanName,
      company_name: cleanName,
      type,
      party_type: type,
      phone,
      trnNo,
      trn_no: trnNo,
      creditLimit,
      credit_limit: creditLimit,
      payableAccountId,
      payable_account_id: payableAccountId,
      receivableAccountId,
      receivable_account_id: receivableAccountId,
      clearingAccountId,
      clearing_account_id: clearingAccountId,
      revenueAccountId,
      revenue_account_id: revenueAccountId
    };

    // 1. Primary route: Express PostgreSQL backend
    if (typeof window !== 'undefined') {
      try {
        const rawFetch = (window as any).__originalFetch || window.fetch;
        const apiRes = await rawFetch('/api/parties', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(normalizedInput)
        });
        if (apiRes.ok) {
          const resJson = await apiRes.json();
          const created = resJson.party || resJson;
          FinanceService.clearCoaCache();
          try {
            localStorage.removeItem('vibe_cached_parties');
          } catch {}
          return {
            id: created.id || `pty-${Date.now()}`,
            code: created.code || 'P-NEW',
            name: created.name || cleanName,
            type: created.type || type,
            contactPerson: created.contactPerson || created.contact_person || '',
            phone: created.phone || phone,
            email: created.email || '',
            address: created.address || '',
            trnNo: created.trn_no || created.trnNo || trnNo,
            trn_no: created.trn_no || created.trnNo || trnNo,
            creditLimit: Number(created.creditLimit ?? created.credit_limit ?? creditLimit),
            credit_limit: Number(created.creditLimit ?? created.credit_limit ?? creditLimit),
            currentBalance: Number(created.currentBalance ?? created.current_balance ?? 0),
            current_balance: Number(created.currentBalance ?? created.current_balance ?? 0),
            currency: created.currency || 'AED',
            isActive: created.isActive !== false && created.is_active !== false,
            is_active: created.isActive !== false && created.is_active !== false,
            accountMap: created.accountMap || created.account_map || {},
            account_map: created.accountMap || created.account_map || {},
            coaAccountId: created.coaAccountId || created.coa_account_id,
            coa_account_id: created.coaAccountId || created.coa_account_id,
            createdAt: created.createdAt || created.created_at || new Date().toISOString(),
            created_at: created.createdAt || created.created_at || new Date().toISOString()
          };
        } else {
          const errData = await apiRes.json().catch(() => ({}));
          if (errData.error) throw new Error(errData.error);
        }
      } catch (err: any) {
        if (err.message && !err.message.includes('fetch') && !err.message.includes('JSON')) throw err;
      }
    }

    // 2. Direct RPC call to PostgreSQL create_party_with_coa
    const { data, error } = await supabase.rpc('create_party_with_coa', {
      p_name: cleanName,
      p_type: type,
      p_phone: phone || null,
      p_trn: trnNo || null,
      p_credit_limit: creditLimit || 0,
      p_inventory_account_id: (party as any).inventory_account_id || null,
      p_expense_account: clearingAccountId || null
    });

    if (error) {
      console.error('RPC Error on create_party_with_coa:', error);
      throw new Error(error.message || 'Failed to save party');
    }

    FinanceService.clearCoaCache();
    try {
      localStorage.removeItem('vibe_cached_parties');
    } catch {}

    const partyId = data?.party_id || `pty-${Date.now()}`;
    const partyCode = data?.party_code || 'P-NEW';
    const coaCode = data?.code || (type === 'AGENT' ? '2120-00' : (type === 'SUPPLIER' ? '2110-01' : '1130-01'));

    return {
      id: partyId,
      code: partyCode,
      name: cleanName,
      type,
      contactPerson: party.contactPerson || '',
      phone: phone || '',
      email: party.email || '',
      address: party.address || '',
      trnNo: trnNo || '',
      trn_no: trnNo || '',
      creditLimit,
      currentBalance: 0,
      currency: party.currency || 'AED',
      isActive: true,
      accountMap: type === 'AGENT' ? {
        payableAccountId: coaCode,
        agentPayableAccountId: coaCode,
        clearingAccountId: clearingAccountId || '1310-00',
        expenseAccountId: clearingAccountId || '5110-00'
      } : {
        payableAccountId: type === 'SUPPLIER' ? coaCode : '2110-01',
        receivableAccountId: type !== 'SUPPLIER' ? coaCode : '1130-00',
        clearingAccountId: clearingAccountId || '1310-00',
        revenueAccountId: revenueAccountId || '4110-00'
      },
      coaAccountId: coaCode,
      coa_account_id: coaCode,
      createdAt: data?.created_at || new Date().toISOString()
    };
  }

  public static async updateParty(id: string, updates: Partial<Party>): Promise<Party> {
    // 1. Primary route: Express PostgreSQL backend
    if (typeof window !== 'undefined') {
      try {
        const rawFetch = (window as any).__originalFetch || window.fetch;
        const apiRes = await rawFetch(`/api/parties/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates)
        });
        if (apiRes.ok) {
          const resJson = await apiRes.json();
          const p = resJson.party || (Array.isArray(resJson) ? resJson[0] : resJson);
          if (p && (p.name || p.id || p.company_name)) {
            return {
              id: p.id || id,
              code: p.code || 'P-SAVED',
              name: p.name || p.company_name || String(updates.name || ''),
              company_name: p.company_name || p.name || String(updates.name || ''),
              type: p.type || p.party_type || updates.type || 'CLIENT',
              contactPerson: p.contactPerson || p.contact_person || updates.contactPerson || '',
              contact_person: p.contact_person || p.contactPerson || updates.contactPerson || '',
              phone: p.phone || updates.phone || '',
              email: p.email || updates.email || '',
              address: p.address || updates.address || '',
              trnNo: p.trn_no || p.trnNo || updates.trnNo || '',
              trn_no: p.trn_no || p.trnNo || updates.trnNo || '',
              creditLimit: Number(p.creditLimit ?? p.credit_limit ?? updates.creditLimit ?? 0),
              credit_limit: Number(p.creditLimit ?? p.credit_limit ?? updates.creditLimit ?? 0),
              currentBalance: Number(p.currentBalance ?? p.current_balance ?? updates.currentBalance ?? 0),
              current_balance: Number(p.currentBalance ?? p.current_balance ?? updates.currentBalance ?? 0),
              currency: p.currency || updates.currency || 'AED',
              isActive: p.isActive !== false && p.is_active !== false,
              is_active: p.isActive !== false && p.is_active !== false,
              accountMap: p.accountMap || p.account_map || updates.accountMap || {},
              account_map: p.accountMap || p.account_map || updates.accountMap || {},
              coaAccountId: p.coaAccountId || p.coa_account_id,
              coa_account_id: p.coaAccountId || p.coa_account_id,
              linked_account_id: p.linked_account_id || p.linkedAccountId || updates.linked_account_id,
              createdAt: p.createdAt || p.created_at || new Date().toISOString()
            };
          }
        } else {
          const errData = await apiRes.json().catch(() => ({}));
          if (errData.error) throw new Error(errData.error);
        }
      } catch (err: any) {
        if (err.message && !err.message.includes('fetch')) throw err;
      }
    }

    // 2. Fallback route: Supabase client
    const payload: any = {};
    if (updates.name !== undefined) {
      payload.name = updates.name;
      payload.company_name = updates.name;
    }
    if (updates.company_name !== undefined) payload.company_name = updates.company_name;
    if (updates.type !== undefined) {
      payload.type = updates.type;
      payload.party_type = updates.type === 'SUPPLIER' ? 'SUPPLIER' : 'CUSTOMER';
    }
    if (updates.contactPerson !== undefined) payload.contact_person = updates.contactPerson;
    if (updates.contact_person !== undefined) payload.contact_person = updates.contact_person;
    if (updates.phone !== undefined) payload.phone = updates.phone;
    if (updates.email !== undefined) payload.email = updates.email;
    if (updates.address !== undefined) payload.address = updates.address;
    if (updates.trn_no !== undefined) payload.trn_no = updates.trn_no;
    if (updates.trnNo !== undefined) payload.trn_no = updates.trnNo;
    if (updates.creditLimit !== undefined) payload.credit_limit = Number(updates.creditLimit);
    if (updates.credit_limit !== undefined) payload.credit_limit = Number(updates.credit_limit);
    if (updates.currentBalance !== undefined) payload.current_balance = Number(updates.currentBalance);
    if (updates.isActive !== undefined) payload.is_active = updates.isActive;
    if (updates.accountMap !== undefined) payload.account_map = updates.accountMap;
    if (updates.account_map !== undefined) payload.account_map = updates.account_map;
    if (updates.linked_account_id !== undefined) payload.linked_account_id = updates.linked_account_id;

    const { data, error } = await supabase
      .from('parties')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Supabase error on parties:', error);
      throw new Error(error.message || 'Failed to update party');
    }

    // Keep linked COA account updated
    await PartiesService.ensurePartyCoaAccount({
      id: data.id,
      code: data.code,
      name: data.name,
      type: data.type,
      currentBalance: Number(data.current_balance || 0),
      currency: data.currency,
      isActive: data.is_active,
      accountMap: data.account_map
    });

    return {
      id: data.id,
      code: data.code,
      name: data.name,
      type: data.type,
      contactPerson: data.contact_person,
      phone: data.phone,
      email: data.email,
      address: data.address,
      trnNo: data.trn_no,
      trn_no: data.trn_no,
      party_id: data.party_id,
      company_name: data.company_name,
      party_type: data.party_type,
      linked_account_id: data.linked_account_id,
      creditLimit: Number(data.credit_limit),
      currentBalance: Number(data.current_balance),
      currency: data.currency,
      isActive: data.is_active,
      accountMap: data.account_map || {},
      coaAccountId: data.coa_account_id,
      coa_account_id: data.coa_account_id,
      createdAt: data.created_at
    };
  }

  public static async deleteParty(id: string): Promise<any> {
    if (!id || id === 'undefined' || id === 'null') {
      throw new Error('Valid Party ID is required for deletion');
    }

    // Strict Accounting Validation Check: Prevent deletion of parties with transactions or non-zero balance
    try {
      const { data: pCheck } = await supabase
        .from('parties')
        .select('id, current_balance, coa_account_id')
        .or(`id.eq.${id},party_id.eq.${id}`)
        .maybeSingle();

      if (pCheck) {
        const curBal = Math.abs(Number(pCheck.current_balance || 0));
        if (curBal > 0.001) {
          throw new Error("Cannot delete: This account/supplier has existing transactions. Please deactivate it instead.");
        }

        const partyId = pCheck.id || id;
        const coaId = pCheck.coa_account_id;

        // Check journal entries
        const { data: je } = await supabase
          .from('journal_entries')
          .select('id')
          .or(`party_id.eq.${partyId}${coaId ? `,account_id.eq.${coaId}` : ''}`)
          .limit(1);
        if (je && je.length > 0) {
          throw new Error("Cannot delete: This account/supplier has existing transactions. Please deactivate it instead.");
        }

        // Check voucher entries
        const { data: ve } = await supabase
          .from('voucher_entries')
          .select('id')
          .eq('party_id', partyId)
          .limit(1);
        if (ve && ve.length > 0) {
          throw new Error("Cannot delete: This account/supplier has existing transactions. Please deactivate it instead.");
        }

        // Check purchase invoices
        const { data: pi } = await supabase
          .from('purchase_invoices')
          .select('id')
          .eq('supplier_id', partyId)
          .limit(1);
        if (pi && pi.length > 0) {
          throw new Error("Cannot delete: This account/supplier has existing transactions. Please deactivate it instead.");
        }
      }
    } catch (valErr: any) {
      if (valErr.message?.includes('Cannot delete: This account/supplier')) {
        throw valErr;
      }
      // If table query failed due to network/offline, continue to API
    }

    let apiSuccess = false;
    let resultData: any = null;

    // 1. Primary route: Express PostgreSQL backend (invoking atomic delete_party_and_coa)
    if (typeof window !== 'undefined') {
      try {
        const rawFetch = (window as any).__originalFetch || window.fetch;
        const apiRes = await rawFetch(`/api/parties/${encodeURIComponent(id)}`, {
          method: 'DELETE'
        });
        const resData = await apiRes.json().catch(() => ({}));
        if (apiRes.ok && resData.success !== false) {
          apiSuccess = true;
          resultData = resData;
        } else {
          const errMsg = resData.error || resData.detail || resData.messageUrdu || `Server returned HTTP ${apiRes.status}`;
          throw new Error(errMsg);
        }
      } catch (err: any) {
        // If it was a real rejection from the server API, rethrow it directly
        if (err.message && !err.message.includes('fetch') && !err.message.includes('Failed to fetch') && !err.message.includes('NetworkError')) {
          throw err;
        }
      }
    }

    // 2. Direct Supabase RPC Fallback (calling atomic stored procedure delete_party_and_coa)
    if (!apiSuccess) {
      const { data: rpcData, error: rpcErr } = await supabase.rpc('delete_party_and_coa', { p_party_id: String(id) });
      if (rpcErr) {
        throw new Error(rpcErr.message || 'Failed to delete party from database');
      }
      if (rpcData && rpcData.success === false) {
        throw new Error(rpcData.error || 'Failed to delete party');
      }
      resultData = rpcData;
    }

    // 3. Purge obsolete party cache
    try {
      localStorage.removeItem('vibe_cached_parties');
    } catch {}
    FinanceService.clearCoaCache();

    return resultData;
  }

  // --- Khata Logs ---
  public static async getKhataLogs(partyId?: string): Promise<any[]> {
    if (!partyId) return [];

    // 1. Primary route: Express PostgreSQL backend
    if (typeof window !== 'undefined') {
      try {
        const rawFetch = (window as any).__originalFetch || window.fetch;
        const apiRes = await rawFetch(`/api/parties/${partyId}/khata`);
        if (apiRes.ok) {
          const logs = await apiRes.json();
          if (Array.isArray(logs)) {
            return logs;
          }
        }
      } catch (_) {}
    }

    // 2. Fallback: Fetch from Supabase party_khata_logs
    const { data: logs } = await supabase
      .from('party_khata_logs')
      .select('*')
      .eq('party_id', partyId)
      .order('date', { ascending: true });

    if (logs && logs.length > 0) {
      return logs.map((row: any) => ({
        id: row.id,
        partyId: row.party_id,
        date: String(row.date || '').slice(0, 10),
        docRef: row.reference || 'REF',
        description: row.notes || 'Khata Transaction',
        debit: Number(row.debit || 0),
        credit: Number(row.credit || 0),
        balance: Number(row.running_balance || 0)
      }));
    }

    // 3. Fallback: General Ledger entries
    try {
      const { data: partyRow } = await supabase.from('parties').select('code, coa_account_id').eq('id', partyId).maybeSingle();
      const cleanCode = (partyRow?.code || '').replace(/[^A-Za-z0-9]/g, '');
      const accountCode = `2110-${cleanCode}`;
      const accountId = partyRow?.coa_account_id || `acc-${partyId}`;

      const { data: glEntries } = await supabase
        .from('general_ledger')
        .select('*')
        .or(`account_id.eq.${accountId},account_code.eq.${accountCode},account_code.eq.1130-${cleanCode}`)
        .order('entry_date', { ascending: true });

      if (glEntries && glEntries.length > 0) {
        let runBal = 0;
        return glEntries.map((row: any) => {
          const dr = Number(row.debit || 0);
          const cr = Number(row.credit || 0);
          runBal += (dr - cr);
          return {
            id: row.id,
            partyId,
            date: String(row.entry_date || row.created_at || '').slice(0, 10),
            docRef: row.voucher_no || row.reference || 'GL',
            description: row.narration || row.memo || 'General Ledger Entry',
            debit: dr,
            credit: cr,
            balance: runBal
          };
        });
      }
    } catch {}

    return [];
  }

  public static async addKhataLog(log: Partial<PartyKhataLog>): Promise<PartyKhataLog> {
    // 1. Primary route: Express PostgreSQL backend
    if (typeof window !== 'undefined') {
      try {
        const rawFetch = (window as any).__originalFetch || window.fetch;
        const apiRes = await rawFetch(`/api/parties/${log.partyId}/khata`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: Number(log.debit || 0) > 0 ? log.debit : log.credit,
            type: Number(log.debit || 0) > 0 ? 'PAYMENT' : 'RECEIPT',
            docRef: log.reference,
            description: log.notes,
            date: log.date
          })
        });
        if (apiRes.ok) {
          const resJson = await apiRes.json();
          if (resJson.khataLog) {
            return resJson.khataLog;
          }
        }
      } catch (err: any) {
        if (err.message && !err.message.includes('fetch')) throw err;
      }
    }

    // 2. Fallback route: Supabase client
    const id = log.id || `kht-${Date.now()}`;
    const payload = {
      id,
      party_id: log.partyId,
      date: log.date || new Date().toISOString().slice(0, 10),
      reference: log.reference || '',
      debit: Number(log.debit || 0),
      credit: Number(log.credit || 0),
      running_balance: Number(log.runningBalance || 0),
      notes: log.notes || ''
    };

    const { data, error } = await supabase
      .from('party_khata_logs')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('Supabase error on party_khata_logs:', error);
      throw new Error(error.message || 'Failed to add Khata entry');
    }

    return {
      id: data.id,
      partyId: data.party_id,
      date: data.date,
      reference: data.reference,
      debit: Number(data.debit),
      credit: Number(data.credit),
      runningBalance: Number(data.running_balance),
      notes: data.notes
    };
  }
}
