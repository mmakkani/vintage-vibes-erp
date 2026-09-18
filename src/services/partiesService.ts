import { supabase } from '../supabaseClient.ts';
import { Party, PartyKhataLog } from '../modules/parties/parties.types.ts';

export class PartiesService {
  public static async getParties(): Promise<Party[]> {
    // 1. Primary & direct route: query server endpoint which connects directly to PostgreSQL
    if (typeof window !== 'undefined') {
      try {
        const rawFetch = (window as any).__originalFetch || window.fetch;
        const apiRes = await rawFetch('/api/parties');
        if (apiRes && apiRes.ok) {
          const list = await apiRes.json();
          if (Array.isArray(list) && list.length > 0) {
            const normalized = list.map((r: any) => ({
              id: r.id,
              code: r.code || `P-${r.id}`,
              name: r.name || 'Unnamed Party',
              type: (r.type || 'CLIENT').toUpperCase(),
              contactPerson: r.contactPerson || r.contact_person || '',
              phone: r.phone || '',
              email: r.email || '',
              address: r.address || '',
              trnNo: r.trnNo || r.trn_no || '',
              creditLimit: Number(r.creditLimit ?? r.credit_limit ?? 0),
              currentBalance: Number(r.currentBalance ?? r.current_balance ?? 0),
              currency: r.currency || 'AED',
              isActive: r.isActive !== false && r.is_active !== false,
              accountMap: r.accountMap || r.account_map || {},
              coaAccountId: r.coaAccountId || r.coa_account_id,
              coa_account_id: r.coaAccountId || r.coa_account_id,
              createdAt: r.createdAt || r.created_at || new Date().toISOString()
            }));
            try {
              localStorage.setItem('vibe_cached_parties', JSON.stringify(normalized));
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

      if (!partiesRes.error && partiesRes.data && partiesRes.data.length > 0) {
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
            creditLimit: Number(row.credit_limit ?? row.creditLimit ?? 0),
            currentBalance: Number(liveBal.toFixed(2)),
            currency: row.currency || 'AED',
            isActive: row.is_active !== false && row.isActive !== false,
            accountMap: row.account_map || row.accountMap || {},
            coaAccountId: row.coa_account_id,
            coa_account_id: row.coa_account_id,
            createdAt: row.created_at || new Date().toISOString()
          };
        });

        try {
          localStorage.setItem('vibe_cached_parties', JSON.stringify(mapped));
        } catch {}

        return mapped;
      }
    } catch (_) {}

    // 3. Fallback to localStorage cache
    try {
      const cached = localStorage.getItem('vibe_cached_parties');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((r: any) => ({
            ...r,
            creditLimit: Number(r.creditLimit ?? r.credit_limit ?? 0),
            currentBalance: Number(r.currentBalance ?? r.current_balance ?? 0)
          }));
        }
      }
    } catch {}

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
    const isSupplier = party.type === 'SUPPLIER';
    const isClient = party.type === 'CLIENT' || party.type === 'CUSTOMER';
    const parentCode = isSupplier ? '2110-00' : (isClient ? '1130-00' : '2120-00');
    const parentId = isSupplier ? 'acc-2110' : (isClient ? 'acc-1130' : 'acc-2120');
    const coaType = isSupplier ? 'LIABILITY' : (isClient ? 'ASSET' : 'LIABILITY');
    const subType = isSupplier ? 'Accounts Payable - Trade' : (isClient ? 'Accounts Receivable - Trade' : 'Accounts Payable - Agent');
    const cleanCode = (party.code || '').replace(/[^A-Za-z0-9]/g, '') || String(Date.now()).slice(-4);
    const coaCode = isSupplier ? `2110-${cleanCode}` : (isClient ? `1130-${cleanCode}` : `2120-${cleanCode}`);
    const coaId = `acc-${party.id}`;
    const roleTag = isSupplier ? 'Supplier' : (isClient ? 'Customer' : 'Agent');
    const coaName = `${party.name} (${roleTag})`;

    try {
      // 1. Upsert COA Sub-Account
      await supabase.from('coa_accounts').upsert({
        id: coaId,
        code: coaCode,
        name: coaName,
        type: coaType,
        sub_type: subType,
        currency: party.currency || 'AED',
        current_balance: Number(party.currentBalance || 0),
        is_active: party.isActive !== false,
        parent_id: parentId,
        parent_code: parentCode,
        party_id: party.id,
        tier_level: 3
      }, { onConflict: 'id' });

      // 2. Link accountMap and coa_account_id on party
      const updatedMap = {
        ...(party.accountMap || {}),
        payableAccountId: isSupplier ? coaCode : (party.accountMap?.payableAccountId || '2110-00'),
        receivableAccountId: isClient ? coaCode : (party.accountMap?.receivableAccountId || '1130-00')
      };

      await supabase.from('parties').update({
        coa_account_id: coaId,
        account_map: updatedMap
      }).eq('id', party.id);
    } catch (err) {
      console.warn('Auto-provisioning COA account for party failed (non-blocking):', err);
    }

    return coaId;
  }

  public static async getPartyById(id: string): Promise<Party | null> {
    if (typeof window !== 'undefined') {
      try {
        const rawFetch = (window as any).__originalFetch || window.fetch;
        const res = await rawFetch(`/api/parties/${id}`);
        if (res.ok) {
          const p = await res.json();
          return p;
        }
      } catch (_) {}
    }
    const { data } = await supabase.from('parties').select('*').eq('id', id).maybeSingle();
    return data as any;
  }

  public static async addParty(party: Partial<Party>): Promise<Party> {
    // 1. Primary route: Express PostgreSQL backend
    if (typeof window !== 'undefined') {
      try {
        const rawFetch = (window as any).__originalFetch || window.fetch;
        const apiRes = await rawFetch('/api/parties', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(party)
        });
        if (apiRes.ok) {
          const created = await apiRes.json();
          return created;
        } else {
          const errData = await apiRes.json().catch(() => ({}));
          if (errData.error) throw new Error(errData.error);
        }
      } catch (err: any) {
        if (err.message && !err.message.includes('fetch')) throw err;
      }
    }

    // 2. Fallback route: Supabase client
    const id = party.id || `pty-${Date.now()}`;
    const code = party.code || `P-${Date.now().toString().slice(-4)}`;
    const coaId = `acc-${id}`;
    const isSupplier = party.type === 'SUPPLIER';
    const isClient = party.type === 'CLIENT' || party.type === 'CUSTOMER';
    const cleanCode = code.replace(/[^A-Za-z0-9]/g, '');
    const coaCode = isSupplier ? `2110-${cleanCode}` : (isClient ? `1130-${cleanCode}` : `2120-${cleanCode}`);

    const initialMap = {
      ...(party.accountMap || {}),
      payableAccountId: isSupplier ? coaCode : '2110-00',
      receivableAccountId: isClient ? coaCode : '1130-00',
      clearingAccountId: '1310-00',
      revenueAccountId: '4110-00'
    };

    const payload = {
      id,
      code,
      name: party.name,
      type: party.type || 'CLIENT',
      contact_person: party.contactPerson || '',
      phone: party.phone || '',
      email: party.email || '',
      address: party.address || '',
      trn_no: party.trnNo || '',
      credit_limit: Number(party.creditLimit || 0),
      current_balance: Number(party.currentBalance || 0),
      currency: party.currency || 'AED',
      is_active: party.isActive !== false,
      account_map: initialMap,
      coa_account_id: null
    };

    const { data, error } = await supabase
      .from('parties')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('Supabase error on parties:', error);
      throw new Error(error.message || 'Failed to save party');
    }

    // Auto-provision COA account immediately
    await PartiesService.ensurePartyCoaAccount({
      id: data.id,
      code: data.code,
      name: data.name,
      type: data.type,
      currentBalance: Number(data.current_balance || 0),
      currency: data.currency,
      isActive: data.is_active,
      accountMap: initialMap
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
      creditLimit: Number(data.credit_limit),
      currentBalance: Number(data.current_balance),
      currency: data.currency,
      isActive: data.is_active,
      accountMap: initialMap,
      coaAccountId: coaId,
      coa_account_id: coaId,
      createdAt: data.created_at
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
          return resJson.party || resJson;
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
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.type !== undefined) payload.type = updates.type;
    if (updates.contactPerson !== undefined) payload.contact_person = updates.contactPerson;
    if (updates.phone !== undefined) payload.phone = updates.phone;
    if (updates.email !== undefined) payload.email = updates.email;
    if (updates.address !== undefined) payload.address = updates.address;
    if (updates.trnNo !== undefined) payload.trn_no = updates.trnNo;
    if (updates.creditLimit !== undefined) payload.credit_limit = Number(updates.creditLimit);
    if (updates.currentBalance !== undefined) payload.current_balance = Number(updates.currentBalance);
    if (updates.isActive !== undefined) payload.is_active = updates.isActive;

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

  public static async deleteParty(id: string): Promise<void> {
    // 1. Primary route: Express PostgreSQL backend (with safety verification)
    if (typeof window !== 'undefined') {
      try {
        const rawFetch = (window as any).__originalFetch || window.fetch;
        const apiRes = await rawFetch(`/api/parties/${id}`, {
          method: 'DELETE'
        });
        if (apiRes.ok) {
          return;
        }
        const errData = await apiRes.json().catch(() => ({}));
        if (errData.error) {
          throw new Error(errData.error);
        }
      } catch (err: any) {
        if (err.message && !err.message.includes('fetch')) {
          throw err;
        }
      }
    }

    // 2. Fallback route: Supabase client (unlinking foreign keys first)
    await supabase.from('coa_accounts').update({ party_id: null }).eq('party_id', id);
    await supabase.from('ledgers').update({ party_id: null }).eq('party_id', id);
    await supabase.from('party_khata_logs').delete().eq('party_id', id);
    const { error } = await supabase.from('parties').delete().eq('id', id);
    if (error) {
      console.error('Supabase error on parties:', error);
      throw new Error(error.message || 'Failed to delete party');
    }
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
          if (Array.isArray(logs) && logs.length > 0) {
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
