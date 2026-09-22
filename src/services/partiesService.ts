import { supabase } from '../supabaseClient.ts';
import { Party, PartyKhataLog, VisitingCard, PartyType } from '../modules/parties/parties.types.ts';
import { FinanceService } from './financeService.ts';
import { safeFetchJson, safeFetchMutation } from '../utils/fetchUtils.ts';
import { applyPagination, buildPaginatedResponse, PaginatedResponse } from '../utils/paginationHelper.ts';

export class PartiesService {
  public static async getPartiesPaginated(options?: {
    page?: number;
    pageSize?: number;
    search?: string;
    type?: string;
  }): Promise<PaginatedResponse<Party>> {
    const page = Math.max(1, options?.page || 1);
    const pageSize = Math.max(1, options?.pageSize || 10);
    const search = options?.search?.trim() || '';
    const type = options?.type?.trim().toUpperCase() || 'ALL';

    let query = supabase
      .from('parties')
      .select('*', { count: 'exact' });

    if (search) {
      query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%,trn_no.ilike.%${search}%`);
    }

    if (type && type !== 'ALL') {
      if (type === 'CUSTOMER' || type === 'CLIENT') {
        query = query.or('type.ilike.%CUSTOMER%,type.ilike.%CLIENT%,party_type.ilike.%CUSTOMER%,party_type.ilike.%CLIENT%');
      } else if (type === 'SUPPLIER' || type === 'VENDOR') {
        query = query.or('type.ilike.%SUPPLIER%,type.ilike.%VENDOR%,party_type.ilike.%SUPPLIER%,party_type.ilike.%VENDOR%');
      } else if (type === 'AGENT' || type === 'BROKER') {
        query = query.or('type.ilike.%AGENT%,type.ilike.%BROKER%,party_type.ilike.%AGENT%,party_type.ilike.%BROKER%');
      } else if (type === 'COURIER' || type === 'FREIGHT' || type === 'LOGISTICS') {
        query = query.or('type.ilike.%COURIER%,type.ilike.%FREIGHT%,type.ilike.%LOGISTICS%,party_type.ilike.%COURIER%,party_type.ilike.%FREIGHT%,party_type.ilike.%LOGISTICS%');
      } else {
        query = query.or(`type.eq.${type},party_type.eq.${type}`);
      }
    }

    query = applyPagination(query, page, pageSize, {
      orderBy: 'created_at',
      ascending: false,
      secondaryOrderBy: 'id',
      secondaryAscending: false
    });

    const [partiesRes, liveBalancesRes] = await Promise.all([
      query,
      supabase.from('view_coa_live_balances').select('party_id, account_id, current_balance')
    ]);

    if (partiesRes.error) {
      console.warn('[PartiesService] Paginated parties query warning:', partiesRes.error.message);
      return buildPaginatedResponse([], 0, page, pageSize);
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

      const rawT = String(row.type || row.party_type || 'CLIENT').trim().toUpperCase();
      const normType: PartyType = (rawT.includes('COURIER') || rawT.includes('FREIGHT') || rawT.includes('LOGISTICS'))
        ? 'COURIER'
        : (rawT.includes('AGENT') || rawT.includes('BROKER'))
        ? 'AGENT'
        : (rawT.includes('SUPPLIER') || rawT.includes('VENDOR'))
        ? 'SUPPLIER'
        : 'CUSTOMER';

      return {
        id: row.id,
        code: row.code,
        name: row.name,
        type: normType,
        contactPerson: row.contact_person || row.contactPerson || '',
        contact_person: row.contact_person || row.contactPerson || '',
        contactDesignation: row.contact_designation || row.contactDesignation || '',
        contact_designation: row.contact_designation || row.contactDesignation || '',
        tradeLicenseNo: row.trade_license_no || row.tradeLicenseNo || '',
        trade_license_no: row.trade_license_no || row.tradeLicenseNo || '',
        licenseExpiryDate: row.license_expiry_date || row.licenseExpiryDate || null,
        license_expiry_date: row.license_expiry_date || row.licenseExpiryDate || null,
        bankName: row.bank_name || row.bankName || '',
        bank_name: row.bank_name || row.bankName || '',
        iban: row.iban || '',
        swiftCode: row.swift_code || row.swiftCode || '',
        swift_code: row.swift_code || row.swiftCode || '',
        paymentTerms: row.payment_terms || row.paymentTerms || '',
        payment_terms: row.payment_terms || row.paymentTerms || '',
        openingBalance: Number(row.opening_balance ?? row.openingBalance ?? 0),
        opening_balance: Number(row.opening_balance ?? row.openingBalance ?? 0),
        businessCardUrl: row.business_card_url || row.businessCardUrl || '',
        business_card_url: row.business_card_url || row.businessCardUrl || '',
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
      } as Party;
    });

    return buildPaginatedResponse(mapped, partiesRes.count || 0, page, pageSize);
  }

  public static async getParties(): Promise<Party[]> {
    // 1. Primary & direct route: query server endpoint which connects directly to PostgreSQL
    if (typeof window !== 'undefined') {
      try {
        const list = await safeFetchJson<any[]>('/api/parties?_t=' + Date.now(), { credentials: 'include' });
        if (Array.isArray(list)) {
            const normalized = list.map((r: any) => {
              const rawT = String(r.type || r.party_type || 'CLIENT').trim().toUpperCase();
              const normType: PartyType = (rawT.includes('COURIER') || rawT.includes('FREIGHT') || rawT.includes('LOGISTICS'))
                ? 'COURIER'
                : (rawT.includes('AGENT') || rawT.includes('BROKER'))
                ? 'AGENT'
                : (rawT.includes('SUPPLIER') || rawT.includes('VENDOR'))
                ? 'SUPPLIER'
                : 'CUSTOMER';

              return {
                id: r.id,
                code: r.code || `P-${r.id}`,
                name: r.name || 'Unnamed Party',
                type: normType,
                contactPerson: r.contactPerson || r.contact_person || '',
                contact_person: r.contact_person || r.contactPerson || '',
              phone: r.phone || '',
              email: r.email || '',
              address: r.address || '',
              contactDesignation: r.contact_designation || r.contactDesignation || '',
              contact_designation: r.contact_designation || r.contactDesignation || '',
              tradeLicenseNo: r.trade_license_no || r.tradeLicenseNo || '',
              trade_license_no: r.trade_license_no || r.tradeLicenseNo || '',
              licenseExpiryDate: r.license_expiry_date || r.licenseExpiryDate || null,
              license_expiry_date: r.license_expiry_date || r.licenseExpiryDate || null,
              bankName: r.bank_name || r.bankName || '',
              bank_name: r.bank_name || r.bankName || '',
              iban: r.iban || '',
              swiftCode: r.swift_code || r.swiftCode || '',
              swift_code: r.swift_code || r.swiftCode || '',
              paymentTerms: r.payment_terms || r.paymentTerms || '',
              payment_terms: r.payment_terms || r.paymentTerms || '',
              openingBalance: Number(r.opening_balance ?? r.openingBalance ?? 0),
              opening_balance: Number(r.opening_balance ?? r.openingBalance ?? 0),
              businessCardUrl: r.business_card_url || r.businessCardUrl || '',
              business_card_url: r.business_card_url || r.businessCardUrl || '',
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
            };
          });
            try {
              localStorage.removeItem('vibe_cached_parties');
            } catch {}
            return normalized as Party[];
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
            type: (() => {
              const rawT = String(row.type || row.party_type || 'CLIENT').trim().toUpperCase();
              if (rawT.includes('COURIER') || rawT.includes('FREIGHT') || rawT.includes('LOGISTICS')) return 'COURIER';
              if (rawT.includes('AGENT') || rawT.includes('BROKER')) return 'AGENT';
              if (rawT.includes('SUPPLIER') || rawT.includes('VENDOR')) return 'SUPPLIER';
              return 'CUSTOMER';
            })() as PartyType,
            contactPerson: row.contact_person || row.contactPerson || '',
            contact_person: row.contact_person || row.contactPerson || '',
            contactDesignation: row.contact_designation || row.contactDesignation || '',
            contact_designation: row.contact_designation || row.contactDesignation || '',
            tradeLicenseNo: row.trade_license_no || row.tradeLicenseNo || '',
            trade_license_no: row.trade_license_no || row.tradeLicenseNo || '',
            licenseExpiryDate: row.license_expiry_date || row.licenseExpiryDate || null,
            license_expiry_date: row.license_expiry_date || row.licenseExpiryDate || null,
            bankName: row.bank_name || row.bankName || '',
            bank_name: row.bank_name || row.bankName || '',
            iban: row.iban || '',
            swiftCode: row.swift_code || row.swiftCode || '',
            swift_code: row.swift_code || row.swiftCode || '',
            paymentTerms: row.payment_terms || row.paymentTerms || '',
            payment_terms: row.payment_terms || row.paymentTerms || '',
            openingBalance: Number(row.opening_balance ?? row.openingBalance ?? 0),
            opening_balance: Number(row.opening_balance ?? row.openingBalance ?? 0),
            businessCardUrl: row.business_card_url || row.businessCardUrl || '',
            business_card_url: row.business_card_url || row.businessCardUrl || '',
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

        return mapped as Party[];
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
    coaAccountId?: string;
    coa_account_id?: string;
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
    const prefix = isSupplier ? '2110-' : (isClient ? '1130-' : '2120-');
    const roleTag = isSupplier ? 'Supplier' : (isClient ? 'Customer' : 'Agent');
    const coaName = `${cleanName} (${roleTag})`;

    try {
      // 1. Check if the party already has an existing valid specific account code (not parent folder)
      let coaCode = party.coaAccountId || (party as any).coa_account_id;
      if (isSupplier && party.accountMap?.payableAccountId && party.accountMap.payableAccountId.startsWith('2110-') && !party.accountMap.payableAccountId.endsWith('-00')) {
        coaCode = party.accountMap.payableAccountId;
      } else if (isClient && party.accountMap?.receivableAccountId && party.accountMap.receivableAccountId.startsWith('1130-') && !party.accountMap.receivableAccountId.endsWith('-00')) {
        coaCode = party.accountMap.receivableAccountId;
      } else if (isAgent && party.accountMap?.payableAccountId && party.accountMap.payableAccountId.startsWith('2120-') && !party.accountMap.payableAccountId.endsWith('-00')) {
        coaCode = party.accountMap.payableAccountId;
      }

      // If no valid specific code exists, query the database for the highest existing code under prefix
      if (!coaCode || coaCode.endsWith('-00') || !coaCode.startsWith(prefix)) {
        const [coaRes, legacyRes] = await Promise.all([
          supabase.from('chart_of_accounts').select('code').like('code', `${prefix}%`),
          supabase.from('coa_accounts').select('code').like('code', `${prefix}%`)
        ]);

        let maxNum = 0;
        const allExistingCodes = new Set<string>();
        (coaRes.data || []).forEach((row: any) => {
          if (row.code) allExistingCodes.add(row.code);
        });
        (legacyRes.data || []).forEach((row: any) => {
          if (row.code) allExistingCodes.add(row.code);
        });

        allExistingCodes.forEach((code) => {
          if (code.startsWith(prefix)) {
            const numPart = code.slice(prefix.length);
            const num = parseInt(numPart, 10);
            if (!isNaN(num) && num > maxNum) {
              maxNum = num;
            }
          }
        });

        let nextNum = maxNum + 1;
        coaCode = `${prefix}${String(nextNum).padStart(2, '0')}`;
        while (allExistingCodes.has(coaCode)) {
          nextNum++;
          coaCode = `${prefix}${String(nextNum).padStart(2, '0')}`;
        }
      }

      // 2. Look up parent in chart_of_accounts to get parent UUID
      const { data: parentAcc } = await supabase
        .from('chart_of_accounts')
        .select('id')
        .eq('code', parentCode)
        .maybeSingle();

      const parentId = parentAcc?.id || null;

      // 3. Look up existing chart_of_accounts to preserve existing id, or let DB generate UUID
      const { data: existingCoa } = await supabase
        .from('chart_of_accounts')
        .select('id')
        .eq('code', coaCode)
        .maybeSingle();

      const coaPayload: any = {
        code: coaCode,
        name: coaName,
        account_type: coaAccountType,
        parent_id: parentId,
        current_balance: Number(party.currentBalance || 0)
      };
      if (existingCoa?.id) {
        coaPayload.id = existingCoa.id;
      }

      const { error: coaError } = await supabase.from('chart_of_accounts').upsert(coaPayload, { onConflict: 'code' });
      if (coaError) throw coaError;

      // 4. Look up existing coa_accounts to preserve existing id, or generate fresh random UUID
      const { data: existingLegacy } = await supabase
        .from('coa_accounts')
        .select('id')
        .eq('code', coaCode)
        .maybeSingle();

      const freshLegacyId = existingLegacy?.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `acc-${Date.now()}-${Math.floor(Math.random() * 10000)}`);

      const { error: legacyError } = await supabase.from('coa_accounts').upsert({
        id: freshLegacyId,
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
      if (legacyError) throw legacyError;

      // 5. Link accountMap and coa_account_id on party
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

      const { error: partyUpdateError } = await supabase.from('parties').update({
        coa_account_id: coaCode,
        account_map: updatedMap
      }).eq('id', party.id);
      if (partyUpdateError) throw partyUpdateError;

      FinanceService.clearCoaCache();
      return coaCode;
    } catch (err) {
      console.error('Error auto-provisioning COA account for party:', err);
      throw err;
    }
  }

  public static async getPartyById(id: string): Promise<Party | null> {
    if (!id || id === 'undefined' || id === 'null') return null;
    if (typeof window !== 'undefined') {
      try {
        const p = await safeFetchJson<any>(`/api/parties/${encodeURIComponent(id)}`, { credentials: 'include' });
        if (Array.isArray(p)) {
          const found = p.find((x: any) => x.id === id || String(x.party_id) === String(id));
          return found || null;
        }
        if (p && (p.id || p.party_id || p.name)) {
          return p;
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

    const rawType = String(party.type || party.party_type || (party as any).partyType || 'CUSTOMER').trim().toUpperCase();
    let type: 'CUSTOMER' | 'CLIENT' | 'SUPPLIER' | 'COURIER' | 'AGENT' = 'CUSTOMER';

    if (rawType.includes('COURIER') || rawType.includes('FREIGHT') || rawType.includes('LOGISTICS')) {
      type = 'COURIER';
    } else if (rawType.includes('AGENT') || rawType.includes('BROKER')) {
      type = 'AGENT';
    } else if (rawType.includes('SUPPLIER') || rawType.includes('VENDOR')) {
      type = 'SUPPLIER';
    } else {
      type = 'CUSTOMER';
    }

    const normalizedPartyType = (type as string) === 'CLIENT' ? 'CUSTOMER' : type;

    const phone = party.phone || party.contact_no || (party as any).contactNo || '';
    const trnNo = party.trn_no || party.trnNo || party.tax_id || (party as any).trnTaxNo || '';
    const creditLimit = Number(party.creditLimit ?? party.credit_limit ?? 50000);
    const payableAccountId = party.payableAccountId || (party as any).payable_account_id || (type === 'COURIER' ? '2120-00' : '2110-00');
    const receivableAccountId = party.receivableAccountId || (party as any).receivable_account_id || '1130-00';
    const clearingAccountId = party.clearingAccountId || (party as any).clearing_account_id || '1310-00';
    const revenueAccountId = party.revenueAccountId || (party as any).revenue_account_id || '4110-00';

    const rawInventory = (party as any).inventory_account_id || (party as any).inventoryAccountId || null;
    const isUuid = (val: any) => typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
    const KNOWN_ACCOUNT_UUIDS: Record<string, string> = {
      '1130-00': '26cf14df-ce02-4dc3-95bb-a3a9b59dfff7',
      '1140-01': '6b45e403-1422-44fc-87f6-b7ff60864a91',
      '1140-00': '6b45e403-1422-44fc-87f6-b7ff60864a91',
      '1310-00': '7d9a873a-13dc-4519-9f15-c551cd0d4697',
      '2110-00': '68ba3a36-5930-4adb-9cfa-3a4c0b4b8127',
      '2120-00': '4cf50ade-782f-4535-9548-f97011d3d604',
      '4110-00': 'a50aeec4-441a-4bbd-b96e-cfac6d4de671',
      '5110-00': 'd2e7c1d5-e7cb-40fd-bc0e-3de4cf506e94'
    };
    const safeInventoryAccountId = isUuid(rawInventory)
      ? rawInventory
      : (KNOWN_ACCOUNT_UUIDS[rawInventory] || null);

    const normalizedInput = {
      ...party,
      name: cleanName,
      company_name: cleanName,
      type: normalizedPartyType,
      party_type: normalizedPartyType,
      partyType: normalizedPartyType,
      phone,
      trnNo,
      trn_no: trnNo,
      creditLimit,
      credit_limit: creditLimit,
      inventory_account_id: safeInventoryAccountId,
      inventoryAccountId: safeInventoryAccountId,
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
        const resJson = await safeFetchMutation<any>('/api/parties', 'POST', normalizedInput);
        if (resJson) {
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
        }
      } catch (err: any) {
        if (err.message && !err.message.includes('fetch') && !err.message.includes('JSON')) throw err;
      }
    }

    // 2. Direct RPC call to PostgreSQL create_party_with_coa
    const { data, error } = await supabase.rpc('create_party_with_coa', {
      p_name: cleanName,
      p_type: normalizedPartyType,
      p_phone: phone || null,
      p_trn: trnNo || null,
      p_credit_limit: creditLimit || 0,
      p_inventory_account_id: safeInventoryAccountId,
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
    const coaCode = data?.code || data?.account_code || data?.coa_account_id || (type === 'COURIER' ? '2120-01' : ((type as string) === 'CLIENT' || type === 'CUSTOMER' ? '1130-01' : '2110-01'));

    const contactDesignation = (party as any).contact_designation || party.contactDesignation || '';
    const tradeLicenseNo = (party as any).trade_license_no || party.tradeLicenseNo || '';
    const licenseExpiryDate = (party as any).license_expiry_date || party.licenseExpiryDate || null;
    const bankName = (party as any).bank_name || party.bankName || '';
    const iban = party.iban || '';
    const swiftCode = (party as any).swift_code || party.swiftCode || '';
    const paymentTerms = (party as any).payment_terms || party.paymentTerms || '';
    const openingBalance = Number((party as any).opening_balance ?? party.openingBalance ?? 0);
    const businessCardUrl = (party as any).business_card_url || party.businessCardUrl || '';

    if (data?.party_id) {
      try {
        await supabase.from('parties').update({
          contact_person: party.contactPerson || (party as any).contact_person,
          email: party.email,
          address: party.address,
          coa_account_id: coaCode,
          contact_designation: contactDesignation || null,
          trade_license_no: tradeLicenseNo || null,
          license_expiry_date: licenseExpiryDate || null,
          bank_name: bankName || null,
          iban: iban || null,
          swift_code: swiftCode || null,
          payment_terms: paymentTerms || null,
          opening_balance: openingBalance,
          business_card_url: businessCardUrl || null
        }).eq('id', data.party_id);
      } catch (_) {}
    }

    return {
      id: partyId,
      code: partyCode,
      name: cleanName,
      type,
      contactPerson: party.contactPerson || '',
      contact_person: party.contactPerson || '',
      contactDesignation,
      contact_designation: contactDesignation,
      tradeLicenseNo,
      trade_license_no: tradeLicenseNo,
      licenseExpiryDate,
      license_expiry_date: licenseExpiryDate,
      bankName,
      bank_name: bankName,
      iban,
      swiftCode,
      swift_code: swiftCode,
      paymentTerms,
      payment_terms: paymentTerms,
      openingBalance,
      opening_balance: openingBalance,
      businessCardUrl,
      business_card_url: businessCardUrl,
      phone: phone || '',
      email: party.email || '',
      address: party.address || '',
      trnNo: trnNo || '',
      trn_no: trnNo || '',
      creditLimit,
      currentBalance: 0,
      currency: party.currency || 'AED',
      isActive: true,
      accountMap: (type === 'AGENT' || type === 'COURIER') ? {
        payableAccountId: coaCode,
        agentPayableAccountId: type === 'AGENT' ? coaCode : undefined,
        courierPayableAccountId: type === 'COURIER' ? coaCode : undefined,
        clearingAccountId: clearingAccountId || '1310-00',
        expenseAccountId: clearingAccountId || '5110-00'
      } : {
        payableAccountId: type === 'SUPPLIER' ? coaCode : '2110-00',
        receivableAccountId: (type === 'CUSTOMER' || (type as string) === 'CLIENT') ? coaCode : '1130-00',
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
        const resJson = await safeFetchMutation<any>(`/api/parties/${id}`, 'PUT', updates);
        const p = resJson?.party || (Array.isArray(resJson) ? resJson[0] : resJson);
        if (p && (p.name || p.id || p.company_name)) {
            return {
              id: p.id || id,
              code: p.code || 'P-SAVED',
              name: p.name || p.company_name || String(updates.name || ''),
              company_name: p.company_name || p.name || String(updates.name || ''),
              type: p.type || p.party_type || updates.type || 'CLIENT',
              contactPerson: p.contactPerson || p.contact_person || updates.contactPerson || '',
              contact_person: p.contact_person || p.contactPerson || updates.contactPerson || '',
              contactDesignation: p.contact_designation || p.contactDesignation || updates.contactDesignation || updates.contact_designation || '',
              contact_designation: p.contact_designation || p.contactDesignation || updates.contactDesignation || updates.contact_designation || '',
              tradeLicenseNo: p.trade_license_no || p.tradeLicenseNo || updates.tradeLicenseNo || updates.trade_license_no || '',
              trade_license_no: p.trade_license_no || p.tradeLicenseNo || updates.tradeLicenseNo || updates.trade_license_no || '',
              licenseExpiryDate: p.license_expiry_date || p.licenseExpiryDate || updates.licenseExpiryDate || updates.license_expiry_date || null,
              license_expiry_date: p.license_expiry_date || p.licenseExpiryDate || updates.licenseExpiryDate || updates.license_expiry_date || null,
              bankName: p.bank_name || p.bankName || updates.bankName || updates.bank_name || '',
              bank_name: p.bank_name || p.bankName || updates.bankName || updates.bank_name || '',
              iban: p.iban || updates.iban || '',
              swiftCode: p.swift_code || p.swiftCode || updates.swiftCode || updates.swift_code || '',
              swift_code: p.swift_code || p.swiftCode || updates.swiftCode || updates.swift_code || '',
              paymentTerms: p.payment_terms || p.paymentTerms || updates.paymentTerms || updates.payment_terms || '',
              payment_terms: p.payment_terms || p.paymentTerms || updates.paymentTerms || updates.payment_terms || '',
              openingBalance: Number(p.opening_balance ?? p.openingBalance ?? updates.openingBalance ?? updates.opening_balance ?? 0),
              opening_balance: Number(p.opening_balance ?? p.openingBalance ?? updates.openingBalance ?? updates.opening_balance ?? 0),
              businessCardUrl: p.business_card_url || p.businessCardUrl || updates.businessCardUrl || updates.business_card_url || '',
              business_card_url: p.business_card_url || p.businessCardUrl || updates.businessCardUrl || updates.business_card_url || '',
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
    if (updates.type !== undefined || (updates as any).party_type !== undefined) {
      const rawT = String(updates.type || (updates as any).party_type || '').trim().toUpperCase();
      const normalizedType = rawT === 'CLIENT' ? 'CUSTOMER' : (rawT || 'CUSTOMER');
      payload.type = normalizedType;
      payload.party_type = normalizedType;
    }
    if (updates.contactPerson !== undefined) payload.contact_person = updates.contactPerson;
    if (updates.contact_person !== undefined) payload.contact_person = updates.contact_person;
    if (updates.contactDesignation !== undefined) payload.contact_designation = updates.contactDesignation;
    if (updates.contact_designation !== undefined) payload.contact_designation = updates.contact_designation;
    if (updates.tradeLicenseNo !== undefined) payload.trade_license_no = updates.tradeLicenseNo;
    if (updates.trade_license_no !== undefined) payload.trade_license_no = updates.trade_license_no;
    if (updates.licenseExpiryDate !== undefined) payload.license_expiry_date = updates.licenseExpiryDate;
    if (updates.license_expiry_date !== undefined) payload.license_expiry_date = updates.license_expiry_date;
    if (updates.bankName !== undefined) payload.bank_name = updates.bankName;
    if (updates.bank_name !== undefined) payload.bank_name = updates.bank_name;
    if (updates.iban !== undefined) payload.iban = updates.iban;
    if (updates.swiftCode !== undefined) payload.swift_code = updates.swiftCode;
    if (updates.swift_code !== undefined) payload.swift_code = updates.swift_code;
    if (updates.paymentTerms !== undefined) payload.payment_terms = updates.paymentTerms;
    if (updates.payment_terms !== undefined) payload.payment_terms = updates.payment_terms;
    if (updates.openingBalance !== undefined) payload.opening_balance = updates.openingBalance;
    if (updates.opening_balance !== undefined) payload.opening_balance = updates.opening_balance;
    if (updates.businessCardUrl !== undefined) payload.business_card_url = updates.businessCardUrl;
    if (updates.business_card_url !== undefined) payload.business_card_url = updates.business_card_url;
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

    const strId = String(id).trim();
    const isNum = /^\d+$/.test(strId);
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(strId);

    // Strict Accounting Validation Check: Prevent deletion of parties with transactions or non-zero balance
    let pCheck: any = null;
    try {
      let pQuery = supabase.from('parties').select('id, party_id, code, current_balance, coa_account_id');
      if (isUuid) {
        pQuery = pQuery.eq('id', strId);
      } else if (isNum) {
        pQuery = pQuery.eq('party_id', parseInt(strId, 10));
      } else {
        pQuery = pQuery.or(`id.eq.${strId},code.eq.${strId}`);
      }
      const pRes = await pQuery.maybeSingle();
      pCheck = pRes?.data;

      if (pCheck) {
        const curBal = Math.abs(Number(pCheck.current_balance || 0));
        if (curBal > 0.001) {
          throw new Error("Cannot delete: This account/supplier has existing transactions. Please deactivate it instead.");
        }

        const partyUuid = pCheck.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pCheck.id)
          ? pCheck.id
          : (isUuid ? strId : null);

        let coaUuid: string | null = null;
        const coaIdOrCode = pCheck.coa_account_id;
        if (coaIdOrCode) {
          if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(coaIdOrCode)) {
            coaUuid = coaIdOrCode;
          } else {
            const { data: coaRec } = await supabase
              .from('chart_of_accounts')
              .select('id')
              .eq('code', coaIdOrCode)
              .maybeSingle();
            if (coaRec?.id) {
              coaUuid = coaRec.id;
            }
          }
        }

        // Check journal entries (STRICT UUID ONLY to avoid Postgres 22P02 syntax error)
        if (partyUuid || coaUuid) {
          let jeQuery = supabase.from('journal_entries').select('id');
          if (partyUuid && coaUuid) {
            jeQuery = jeQuery.or(`party_id.eq.${partyUuid},account_id.eq.${coaUuid}`);
          } else if (partyUuid) {
            jeQuery = jeQuery.eq('party_id', partyUuid);
          } else if (coaUuid) {
            jeQuery = jeQuery.eq('account_id', coaUuid);
          }
          const { data: je } = await jeQuery.limit(1);
          if (je && je.length > 0) {
            throw new Error("Cannot delete: This account/supplier has existing transactions. Please deactivate it instead.");
          }
        }

        // Check voucher entries
        const partyIdStr = String(pCheck.party_id ?? (isNum ? strId : ''));
        const partyCodeStr = pCheck.code || '';
        const orClauses: string[] = [];
        if (partyUuid) orClauses.push(`party_id.eq.${partyUuid}`);
        if (partyIdStr) orClauses.push(`party_id.eq.${partyIdStr}`);
        if (coaIdOrCode) orClauses.push(`account_code.eq.${coaIdOrCode}`);
        if (coaUuid) orClauses.push(`account_id.eq.${coaUuid}`);

        if (orClauses.length > 0) {
          const { data: ve } = await supabase
            .from('voucher_entries')
            .select('id')
            .or(orClauses.join(','))
            .limit(1);
          if (ve && ve.length > 0) {
            throw new Error("Cannot delete: This account/supplier has existing transactions. Please deactivate it instead.");
          }
        }

        // Check purchase invoices
        const piOrClauses: string[] = [];
        if (partyUuid) piOrClauses.push(`supplier_id.eq.${partyUuid}`);
        if (partyIdStr) piOrClauses.push(`supplier_id.eq.${partyIdStr}`);
        if (partyCodeStr) piOrClauses.push(`supplier_id.eq.${partyCodeStr}`);
        if (piOrClauses.length > 0) {
          const { data: pi } = await supabase
            .from('purchase_invoices')
            .select('id')
            .or(piOrClauses.join(','))
            .limit(1);
          if (pi && pi.length > 0) {
            throw new Error("Cannot delete: This account/supplier has existing transactions. Please deactivate it instead.");
          }
        }
      }
    } catch (valErr: any) {
      if (valErr.message?.includes('Cannot delete: This account/supplier')) {
        throw valErr;
      }
      // If table query failed due to network/offline, continue to API
    }

    let targetId = strId;
    if (pCheck?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pCheck.id)) {
      targetId = pCheck.id;
    }

    let apiSuccess = false;
    let resultData: any = null;

    // 1. Primary route: Express PostgreSQL backend (invoking atomic delete_party_and_coa)
    if (typeof window !== 'undefined') {
      try {
        const resData = await safeFetchMutation<any>(`/api/parties/${encodeURIComponent(targetId)}`, 'DELETE');
        if (resData && resData.success !== false) {
          apiSuccess = true;
          resultData = resData;
        } else {
          const errMsg = resData?.error || resData?.detail || resData?.messageUrdu || 'Failed to delete party';
          throw new Error(errMsg);
        }
      } catch (err: any) {
        // If it was a real rejection from the server API, rethrow it directly
        if (err.message && !err.message.includes('fetch') && !err.message.includes('Failed to fetch') && !err.message.includes('NetworkError')) {
          throw err;
        }
      }
    }

    // 2. Direct Supabase Fallback with STRICT DELETION ORDER
    if (!apiSuccess) {
      try {
        const { data: rpcData, error: rpcErr } = await supabase.rpc('delete_party_and_coa', { p_party_id: String(targetId) });
        if (!rpcErr && rpcData && rpcData.success !== false) {
          resultData = rpcData;
        } else if (rpcData && rpcData.success === false) {
          throw new Error(rpcData.error || 'Failed to delete party');
        } else if (rpcErr) {
          // Direct table deletion fallback:
          // A. Disassociate linked_account_id to prevent FK violation on accounts
          if (pCheck?.id) {
            await supabase.from('parties').update({ linked_account_id: null }).eq('id', pCheck.id);
            // B. DELETE Party record FIRST from parties table
            await supabase.from('parties').delete().eq('id', pCheck.id);
          }
          // C. Now delete linked COA accounts from chart_of_accounts & coa_accounts
          if (pCheck?.coa_account_id) {
            await supabase.from('chart_of_accounts').delete().eq('code', pCheck.coa_account_id);
            await supabase.from('coa_accounts').delete().eq('code', pCheck.coa_account_id);
          }
          resultData = { success: true, message: 'Party and linked COA deleted successfully' };
        }
      } catch (fbErr: any) {
        throw fbErr;
      }
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
        const logs = await safeFetchJson<any[]>(`/api/parties/${partyId}/khata`, { credentials: 'include' });
        if (Array.isArray(logs)) {
          return logs;
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
        const payload = {
          amount: Number(log.debit || 0) > 0 ? log.debit : log.credit,
          type: Number(log.debit || 0) > 0 ? 'PAYMENT' : 'RECEIPT',
          docRef: log.reference,
          description: log.notes,
          date: log.date
        };
        const resJson = await safeFetchMutation<any>(`/api/parties/${log.partyId}/khata`, 'POST', payload);
        if (resJson?.khataLog) {
          return resJson.khataLog;
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

  // =========================================================================
  // VISITING CARDS DIRECTORY (CRM LEADS - ISOLATED FROM COA)
  // =========================================================================

  public static async getVisitingCards(): Promise<VisitingCard[]> {
    if (typeof window !== 'undefined') {
      try {
        const list = await safeFetchJson<any[]>('/api/visiting-cards?_t=' + Date.now(), { credentials: 'include' });
        if (Array.isArray(list)) return list;
      } catch (e) {
        console.warn('Backend /api/visiting-cards failed, falling back to Supabase direct client:', e);
      }
    }

    const { data, error } = await supabase
      .from('visiting_cards')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase error on visiting_cards:', error);
      return [];
    }

    return (data || []).map((row: any) => ({
      id: String(row.id),
      companyName: row.company_name || '',
      company_name: row.company_name || '',
      contactPerson: row.contact_person || '',
      contact_person: row.contact_person || '',
      designation: row.designation || '',
      phone: row.phone || '',
      email: row.email || '',
      address: row.address || '',
      website: row.website || '',
      cardImageUrl: row.card_image_url || '',
      card_image_url: row.card_image_url || '',
      notes: row.notes || '',
      status: row.status || 'LEAD',
      convertedPartyId: row.converted_party_id ? String(row.converted_party_id) : null,
      converted_party_id: row.converted_party_id ? String(row.converted_party_id) : null,
      createdAt: row.created_at,
      created_at: row.created_at,
      updatedAt: row.updated_at,
      updated_at: row.updated_at
    }));
  }

  public static async createVisitingCard(card: Partial<VisitingCard>): Promise<VisitingCard> {
    const payload = {
      company_name: card.companyName || card.company_name || '',
      contact_person: card.contactPerson || card.contact_person || '',
      designation: card.designation || '',
      phone: card.phone || '',
      email: card.email || '',
      address: card.address || '',
      website: card.website || '',
      card_image_url: card.cardImageUrl || card.card_image_url || '',
      notes: card.notes || '',
      status: card.status || 'LEAD'
    };

    if (typeof window !== 'undefined') {
      try {
        const created = await safeFetchMutation<any>('/api/visiting-cards', 'POST', payload);
        if (created && created.id) return created;
      } catch (e) {
        console.warn('Backend POST /api/visiting-cards failed, falling back to Supabase:', e);
      }
    }

    const { data, error } = await supabase
      .from('visiting_cards')
      .insert([payload])
      .select()
      .single();

    if (error) throw new Error(error.message || 'Failed to save visiting card');

    return {
      id: String(data.id),
      companyName: data.company_name || '',
      company_name: data.company_name || '',
      contactPerson: data.contact_person || '',
      contact_person: data.contact_person || '',
      designation: data.designation || '',
      phone: data.phone || '',
      email: data.email || '',
      address: data.address || '',
      website: data.website || '',
      cardImageUrl: data.card_image_url || '',
      card_image_url: data.card_image_url || '',
      notes: data.notes || '',
      status: data.status || 'LEAD',
      convertedPartyId: data.converted_party_id ? String(data.converted_party_id) : null,
      converted_party_id: data.converted_party_id ? String(data.converted_party_id) : null,
      createdAt: data.created_at,
      created_at: data.created_at
    };
  }

  public static async updateVisitingCard(id: string, card: Partial<VisitingCard>): Promise<VisitingCard> {
    const payload = {
      company_name: card.companyName || card.company_name,
      contact_person: card.contactPerson || card.contact_person,
      designation: card.designation,
      phone: card.phone,
      email: card.email,
      address: card.address,
      website: card.website,
      card_image_url: card.cardImageUrl || card.card_image_url,
      notes: card.notes,
      status: card.status
    };

    if (typeof window !== 'undefined') {
      try {
        const updated = await safeFetchMutation<any>(`/api/visiting-cards/${id}`, 'PUT', payload);
        if (updated && updated.id) return updated;
      } catch (e) {
        console.warn(`Backend PUT /api/visiting-cards/${id} failed, falling back to Supabase:`, e);
      }
    }

    const { data, error } = await supabase
      .from('visiting_cards')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message || 'Failed to update visiting card');
    return data;
  }

  public static async deleteVisitingCard(id: string): Promise<boolean> {
    if (typeof window !== 'undefined') {
      try {
        const res = await safeFetchMutation<any>(`/api/visiting-cards/${id}`, 'DELETE');
        if (res && res.success) return true;
      } catch (e) {
        console.warn(`Backend DELETE /api/visiting-cards/${id} failed, falling back to Supabase:`, e);
      }
    }

    const { error } = await supabase
      .from('visiting_cards')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message || 'Failed to delete visiting card');
    return true;
  }

  public static async markVisitingCardConverted(id: string, partyId: string): Promise<void> {
    if (typeof window !== 'undefined') {
      try {
        await safeFetchMutation<any>(`/api/visiting-cards/${id}/convert`, 'POST', { partyId });
        return;
      } catch (e) {
        console.warn(`Backend POST /api/visiting-cards/${id}/convert failed:`, e);
      }
    }

    await supabase
      .from('visiting_cards')
      .update({ status: 'CONVERTED', converted_party_id: partyId, updated_at: new Date().toISOString() })
      .eq('id', id);
  }
}
