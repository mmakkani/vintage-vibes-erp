import React, { useState, useEffect, useMemo } from 'react';
import { Party, PartyKhataLog, VisitingCard } from '../parties.types.ts';
import {
  Users,
  Plus,
  ArrowLeft,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRight,
  BookOpen,
  Building,
  Building2,
  Phone,
  Mail,
  Receipt,
  FileCheck,
  CreditCard,
  Eye,
  Pencil,
  Trash2,
  Lock,
  Printer,
  MapPin,
  CheckCircle2,
  AlertCircle,
  X,
  ExternalLink,
  FileText,
  Check,
  Shield,
  Loader2,
  Camera,
  Sparkles,
  Upload,
  Landmark,
  Calendar,
  Globe,
  Search
} from 'lucide-react';
import { PartiesService } from '../../../services/partiesService.ts';
import { FinanceService } from '../../../services/financeService.ts';
import { SearchableSelect } from '../../../components/SearchableSelect.tsx';
import { safeFetchJson } from '../../../utils/fetchUtils.ts';
import { supabase } from '../../../supabaseClient.ts';
import { LiveCardScannerModal } from './LiveCardScannerModal.tsx';
import { PartyProfilePrintDossier } from './PartyProfilePrintDossier.tsx';
import { extractVisitingCardDetails, VisitingCardOcrResult } from '../services/visitingCardOcrService.ts';
import { Pagination } from '../../../components/Pagination.tsx';
import { RetailCustomerStatementModal } from './RetailCustomerStatementModal.tsx';
import { NewRetailCustomerModal } from './NewRetailCustomerModal.tsx';

const KNOWN_ACCOUNT_UUIDS: Record<string, string> = {
  '1130-00': '26cf14df-ce02-4dc3-95bb-a3a9b59dfff7',
  '1140-01': '6b45e403-1422-44fc-87f6-b7ff60864a91',
  '1310-00': '7d9a873a-13dc-4519-9f15-c551cd0d4697',
  '2110-00': '68ba3a36-5930-4adb-9cfa-3a4c0b4b8127',
  '2110-01': '68ba3a36-5930-4adb-9cfa-3a4c0b4b8127',
  '2120-00': '4cf50ade-782f-4535-9548-f97011d3d604',
  '2120-01': '1af8a80f-84d3-4e42-97ce-c5678e874fb0',
  '4110-00': 'a50aeec4-441a-4bbd-b96e-cfac6d4de671',
  '5110-00': 'd2e7c1d5-e7cb-40fd-bc0e-3de4cf506e94'
};

const isUuidString = (val: any): boolean => {
  return typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val.trim());
};

interface PartiesViewProps {
  onRefreshAll: () => void;
  currentUserRole: string;
}

export const PartiesView: React.FC<PartiesViewProps> = ({ onRefreshAll }) => {
  const [parties, setParties] = useState<Party[]>([]);
  const [filterType, setFilterType] = useState<string>('ALL');
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [totalParties, setTotalParties] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [partySearch, setPartySearch] = useState<string>('');
  const [isLoadingParties, setIsLoadingParties] = useState<boolean>(false);

  // Selected party for Khata statement
  const [selectedParty, setSelectedParty] = useState<Party | null>(null);
  const [khataLogs, setKhataLogs] = useState<PartyKhataLog[]>([]);

  // Double-submission protection & OCR Scanner state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showLiveScannerModal, setShowLiveScannerModal] = useState(false);
  const [scannerTargetForm, setScannerTargetForm] = useState<'NEW' | 'EDIT' | 'CRM' | 'CRM_EDIT'>('NEW');
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);
  const [printingParty, setPrintingParty] = useState<Party | null>(null);

  // CRM Visiting Cards Directory State (Isolated from COA)
  const [activeRegistryTab, setActiveRegistryTab] = useState<'PARTIES' | 'VISITING_CARDS' | 'RETAIL_CRM'>('PARTIES');
  const [visitingCards, setVisitingCards] = useState<VisitingCard[]>([]);
  const [isLoadingCards, setIsLoadingCards] = useState(false);
  const [cardSearch, setCardSearch] = useState('');
  const [showNewCardModal, setShowNewCardModal] = useState(false);
  const [showEditCardModal, setShowEditCardModal] = useState(false);
  const [convertingCardId, setConvertingCardId] = useState<string | null>(null);
  const [cardForm, setCardForm] = useState({
    id: '',
    companyName: '',
    contactPerson: '',
    designation: '',
    phone: '',
    email: '',
    address: '',
    website: '',
    cardImageUrl: '',
    notes: ''
  });

  // Retail Customer CRM & Statement Dossier State (Isolated from COA, linked to 1130-05)
  const [retailCustomers, setRetailCustomers] = useState<Party[]>([]);
  const [isLoadingRetail, setIsLoadingRetail] = useState(false);
  const [retailSearch, setRetailSearch] = useState('');
  const [showNewRetailModal, setShowNewRetailModal] = useState(false);
  const [showRetailStatementModal, setShowRetailStatementModal] = useState(false);
  const [selectedRetailCustomer, setSelectedRetailCustomer] = useState<Party | null>(null);
  const [retailCustomerInvoices, setRetailCustomerInvoices] = useState<any[]>([]);
  const [isLoadingStatement, setIsLoadingStatement] = useState(false);

  // Modals
  const [showNewPartyModal, setShowNewPartyModal] = useState(false);
  const [showTransactionModal, setShowTransactionModal] = useState(false);

  // View Party Profile Modal
  const [showViewPartyModal, setShowViewPartyModal] = useState(false);
  const [viewPartyData, setViewPartyData] = useState<any | null>(null);

  // Edit Party Modal
  const [showEditPartyModal, setShowEditPartyModal] = useState(false);
  const [editPartyForm, setEditPartyForm] = useState({
    id: '',
    code: '',
    name: '',
    company_name: '',
    type: 'CUSTOMER' as any,
    contactPerson: '',
    contact_person: '',
    contactDesignation: '',
    contact_designation: '',
    phone: '',
    email: '',
    address: '',
    trnNo: '',
    trn_no: '',
    tradeLicenseNo: '',
    trade_license_no: '',
    licenseExpiryDate: '',
    license_expiry_date: '',
    bankName: '',
    bank_name: '',
    iban: '',
    swiftCode: '',
    swift_code: '',
    paymentTerms: 'Cash on Delivery',
    payment_terms: 'Cash on Delivery',
    openingBalance: 0,
    opening_balance: 0,
    businessCardUrl: '',
    business_card_url: '',
    creditLimit: 50000,
    isActive: true,
    linked_account_id: undefined as number | undefined,
    payableAccountId: '2110-01',
    clearingAccountId: '1310-00',
    receivableAccountId: '1130-00',
    revenueAccountId: '4110-00'
  });

  // Delete Party Modal
  const [showDeletePartyModal, setShowDeletePartyModal] = useState(false);
  const [deletingParty, setDeletingParty] = useState<Party | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // New Party form
  const [partyForm, setPartyForm] = useState({
    name: '',
    company_name: '',
    type: 'CUSTOMER' as 'CUSTOMER' | 'CLIENT' | 'SUPPLIER' | 'AGENT' | 'COURIER',
    party_type: 'CUSTOMER' as 'CUSTOMER' | 'CLIENT' | 'SUPPLIER' | 'AGENT' | 'COURIER',
    contactPerson: '',
    contact_person: '',
    contactDesignation: '',
    contact_designation: '',
    phone: '',
    email: '',
    address: '',
    trnNo: '',
    trn_no: '',
    tradeLicenseNo: '',
    trade_license_no: '',
    licenseExpiryDate: '',
    license_expiry_date: '',
    bankName: '',
    bank_name: '',
    iban: '',
    swiftCode: '',
    swift_code: '',
    paymentTerms: 'Cash on Delivery',
    payment_terms: 'Cash on Delivery',
    openingBalance: 0,
    opening_balance: 0,
    businessCardUrl: '',
    business_card_url: '',
    creditLimit: 50000,
    credit_limit: 50000,
    currency: 'AED' as any,
    payableAccountId: '68ba3a36-5930-4adb-9cfa-3a4c0b4b8127',
    payable_account_id: '68ba3a36-5930-4adb-9cfa-3a4c0b4b8127',
    clearingAccountId: '7d9a873a-13dc-4519-9f15-c551cd0d4697',
    clearing_account_id: '7d9a873a-13dc-4519-9f15-c551cd0d4697',
    receivableAccountId: '26cf14df-ce02-4dc3-95bb-a3a9b59dfff7',
    receivable_account_id: '26cf14df-ce02-4dc3-95bb-a3a9b59dfff7',
    revenueAccountId: 'a50aeec4-441a-4bbd-b96e-cfac6d4de671',
    revenue_account_id: 'a50aeec4-441a-4bbd-b96e-cfac6d4de671',
    coaAccountId: '26cf14df-ce02-4dc3-95bb-a3a9b59dfff7',
    coa_account_id: '26cf14df-ce02-4dc3-95bb-a3a9b59dfff7'
  });

  const [coaAccounts, setCoaAccounts] = useState<any[]>([]);

  const resolveAccountUuid = (val: any, fallbackCodeOrUuid?: string): string => {
    if (!val) {
      if (fallbackCodeOrUuid) return resolveAccountUuid(fallbackCodeOrUuid);
      return '';
    }
    const str = String(val).trim();
    if (isUuidString(str)) return str;
    const match = coaAccounts.find(a => a.code === str || a.account_code === str || a.id === str);
    if (match?.id && isUuidString(String(match.id))) {
      return String(match.id);
    }
    if (KNOWN_ACCOUNT_UUIDS[str]) {
      return KNOWN_ACCOUNT_UUIDS[str];
    }
    if (fallbackCodeOrUuid && fallbackCodeOrUuid !== str) {
      return resolveAccountUuid(fallbackCodeOrUuid);
    }
    return str;
  };

  const resolveAccountCode = (val: any, fallbackCode: string = ''): string => {
    if (!val) return fallbackCode;
    const str = String(val).trim();
    const match = coaAccounts.find(a => a.id === str || a.code === str || a.account_code === str);
    if (match?.code || match?.account_code) {
      return String(match.code || match.account_code);
    }
    for (const [kCode, kUuid] of Object.entries(KNOWN_ACCOUNT_UUIDS)) {
      if (kUuid.toLowerCase() === str.toLowerCase()) {
        return kCode;
      }
    }
    return !isUuidString(str) ? str : fallbackCode;
  };

  // Memoized options for Supplier COA selection
  const supplierPayableOptions = useMemo(() => {
    const list = coaAccounts
      .filter(a => a.classification === 'LIABILITY' || a.type === 'LIABILITY' || (a.code && a.code.startsWith('2')))
      .map(a => ({
        value: String(a.id || resolveAccountUuid(a.code, '68ba3a36-5930-4adb-9cfa-3a4c0b4b8127')),
        label: `${a.code} - ${a.name}`,
        badge: 'LIABILITY'
      }));

    const defaultUuid = '68ba3a36-5930-4adb-9cfa-3a4c0b4b8127';
    if (!list.some(o => o.value === defaultUuid)) {
      list.unshift({
        value: defaultUuid,
        label: '2110-00 - Accounts Payable - Trade Suppliers (Bale Exporters)',
        badge: 'LIABILITY'
      });
    }
    return list;
  }, [coaAccounts]);

  const supplierInventoryOptions = useMemo(() => {
    const list = coaAccounts
      .filter(a => a.classification === 'ASSET' || a.type === 'ASSET' || (a.code && a.code.startsWith('1')))
      .map(a => ({
        value: String(a.id || resolveAccountUuid(a.code, '7d9a873a-13dc-4519-9f15-c551cd0d4697')),
        label: `${a.code} - ${a.name}`,
        badge: 'ASSET'
      }));

    const defaultUuid = '7d9a873a-13dc-4519-9f15-c551cd0d4697';
    if (!list.some(o => o.value === defaultUuid)) {
      list.unshift({
        value: defaultUuid,
        label: '1310-00 - Goods In-Transit & Port Clearing Account',
        badge: 'ASSET'
      });
    }
    return list;
  }, [coaAccounts]);

  // Memoized options for Client COA selection
  const clientReceivableOptions = useMemo(() => {
    const list = coaAccounts
      .filter(a => a.classification === 'ASSET' || a.type === 'ASSET' || (a.code && a.code.startsWith('1')))
      .map(a => ({
        value: String(a.id || resolveAccountUuid(a.code, '26cf14df-ce02-4dc3-95bb-a3a9b59dfff7')),
        label: `${a.code} - ${a.name}`,
        badge: 'ASSET'
      }));

    const defaultUuid = '26cf14df-ce02-4dc3-95bb-a3a9b59dfff7';
    if (!list.some(o => o.value === defaultUuid)) {
      list.unshift({
        value: defaultUuid,
        label: '1130-00 - Accounts Receivable (Trade Debtors)',
        badge: 'ASSET'
      });
    }
    return list;
  }, [coaAccounts]);

  const clientRevenueOptions = useMemo(() => {
    const list = coaAccounts
      .filter(a => a.classification === 'REVENUE' || a.type === 'REVENUE' || (a.code && a.code.startsWith('4')))
      .map(a => ({
        value: String(a.id || resolveAccountUuid(a.code, 'a50aeec4-441a-4bbd-b96e-cfac6d4de671')),
        label: `${a.code} - ${a.name}`,
        badge: 'REVENUE'
      }));

    const defaultUuid = 'a50aeec4-441a-4bbd-b96e-cfac6d4de671';
    if (!list.some(o => o.value === defaultUuid)) {
      list.unshift({
        value: defaultUuid,
        label: '4110-00 - Sales Revenue - Local / Retail Stream',
        badge: 'REVENUE'
      });
    }
    return list;
  }, [coaAccounts]);

  // Memoized options for Courier COA selection (Default: 2120-00)
  const courierPayableOptions = useMemo(() => {
    const list = coaAccounts
      .filter(a => a.classification === 'LIABILITY' || a.type === 'LIABILITY' || (a.code && a.code.startsWith('2')))
      .map(a => ({
        value: String(a.id || resolveAccountUuid(a.code, '4cf50ade-782f-4535-9548-f97011d3d604')),
        label: `${a.code} - ${a.name}`,
        badge: 'LIABILITY'
      }));

    const defaultUuid = '4cf50ade-782f-4535-9548-f97011d3d604';
    if (!list.some(o => o.value === defaultUuid)) {
      list.unshift({
        value: defaultUuid,
        label: '2120-00 - Accounts Payable - Courier, Freight & Clearing Agents',
        badge: 'LIABILITY'
      });
    }
    return list;
  }, [coaAccounts]);

  // Memoized options for Agent COA selection (Default: 2110-00 Trade Payables)
  const agentPayableOptions = useMemo(() => {
    const list = coaAccounts
      .filter(a => a.classification === 'LIABILITY' || a.type === 'LIABILITY' || (a.code && a.code.startsWith('2')))
      .map(a => ({
        value: String(a.id || resolveAccountUuid(a.code, '68ba3a36-5930-4adb-9cfa-3a4c0b4b8127')),
        label: `${a.code} - ${a.name}`,
        badge: 'LIABILITY'
      }));

    const defaultUuid = '68ba3a36-5930-4adb-9cfa-3a4c0b4b8127';
    if (!list.some(o => o.value === defaultUuid)) {
      list.unshift({
        value: defaultUuid,
        label: '2110-00 - Accounts Payable - Trade Suppliers (Bale Exporters)',
        badge: 'LIABILITY'
      });
    }
    return list;
  }, [coaAccounts]);

  const expenseAndClearingOptions = useMemo(() => {
    const list = coaAccounts
      .filter(a => {
        const isExp = a.classification === 'EXPENSE' || a.type === 'EXPENSE' || (a.code && a.code.startsWith('5'));
        const isClearingAsset = a.code === '1310-00' || a.code?.startsWith('1310') || (a.name && (a.name.toLowerCase().includes('clearing') || a.name.toLowerCase().includes('in-transit')));
        return isExp || isClearingAsset;
      })
      .map(a => {
        const isExp = a.classification === 'EXPENSE' || a.type === 'EXPENSE' || (a.code && a.code.startsWith('5'));
        return {
          value: String(a.id || resolveAccountUuid(a.code, '7d9a873a-13dc-4519-9f15-c551cd0d4697')),
          label: `${a.code} - ${a.name}`,
          badge: isExp ? 'EXPENSE' : 'ASSET'
        };
      });

    const defaultUuid = '7d9a873a-13dc-4519-9f15-c551cd0d4697';
    if (!list.some(o => o.value === defaultUuid)) {
      list.unshift({
        value: defaultUuid,
        label: '1310-00 - Goods In-Transit & Port Clearing Account',
        badge: 'ASSET'
      });
    }
    return list;
  }, [coaAccounts]);

  // New Payment/Receipt form
  const [txForm, setTxForm] = useState({
    type: 'RECEIPT' as 'RECEIPT' | 'PAYMENT',
    amount: '' as string | number,
    docRef: '',
    description: ''
  });

  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadParties = React.useCallback(async (targetPage = page, targetPageSize = pageSize, targetSearch = partySearch, targetType = filterType) => {
    try {
      setIsLoadingParties(true);
      const res = await PartiesService.getPartiesPaginated({
        page: targetPage,
        pageSize: targetPageSize,
        search: targetSearch,
        type: targetType
      });
      const safeData = (Array.isArray(res.data) ? res.data : []).map((p: any) => {
        const curBal = Number(p.currentBalance ?? p.current_balance ?? 0);
        const purC = Number(p.purchaseInvoicesCount ?? p.stats?.purchaseInvoicesCount ?? 0);
        const salC = Number(p.salesInvoicesCount ?? p.stats?.salesInvoicesCount ?? 0);
        const khtC = Number(p.khataLogsCount ?? p.stats?.khataTransactionsCount ?? 0);
        const glC = Number(p.glEntriesCount ?? p.stats?.glEntriesCount ?? 0);
        const totC = Number(p.totalEntriesCount ?? p.stats?.totalEntriesCount ?? (purC + salC + khtC + glC));
        const hasEnt = Boolean(p.hasEntries ?? (totC > 0 || Math.abs(curBal) > 0.001));

        return {
          ...p,
          currentBalance: curBal,
          purchaseInvoicesCount: purC,
          salesInvoicesCount: salC,
          khataLogsCount: khtC,
          glEntriesCount: glC,
          totalEntriesCount: totC,
          hasEntries: hasEnt
        };
      });
      setParties(safeData);
      setTotalParties(res.total);
      setTotalPages(res.totalPages);

      // Auto-select party only once on mount or if no party is currently selected
      setSelectedParty(prev => {
        if (!prev) {
          if (safeData && safeData.length > 0) {
            const first = safeData[0];
            PartiesService.getKhataLogs(first.id)
              .then(logs => setKhataLogs(logs || []))
              .catch(() => setKhataLogs([]));
            return first;
          }
          return null;
        }
        // If a party is already selected, only update if balance or key metadata changed
        const stillThere = safeData.find((p: any) => p.id === prev.id);
        if (stillThere) {
          if (
            stillThere.currentBalance !== prev.currentBalance ||
            stillThere.totalEntriesCount !== prev.totalEntriesCount ||
            stillThere.hasEntries !== prev.hasEntries ||
            stillThere.name !== prev.name
          ) {
            return stillThere;
          }
        }
        return prev;
      });
    } catch (err: any) {
      console.error('Failed to load parties:', err);
    } finally {
      setIsLoadingParties(false);
    }
  }, [page, pageSize, partySearch, filterType]);


  // Helper to evaluate if a party can be safely deleted or must be preserved under GAAP/IFRS
  const isPartyDeletable = (p: Party | any): boolean => {
    if (!p) return false;
    const curBal = Number(p.currentBalance ?? p.current_balance ?? 0);
    const purC = Number(p.purchaseInvoicesCount ?? p.stats?.purchaseInvoicesCount ?? 0);
    const salC = Number(p.salesInvoicesCount ?? p.stats?.salesInvoicesCount ?? 0);
    const khtC = Number(p.khataLogsCount ?? p.stats?.khataTransactionsCount ?? 0);
    const glC = Number(p.glEntriesCount ?? p.stats?.glEntriesCount ?? 0);
    const totC = Number(p.totalEntriesCount ?? p.stats?.totalEntriesCount ?? (purC + salC + khtC + glC));
    if (p.hasEntries) return false;
    if (totC > 0) return false;
    if (Math.abs(curBal) > 0.001) return false;
    return true;
  };

  // One-click toggle between Active and Inactive (Archived)
  const handleToggleActiveParty = async (party: Party, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const pAny = party as any;
    const pId = String(party.id || pAny.party_id || '').trim();
    const pName = party.name || pAny.company_name || 'Party';
    const currentActive = party.isActive !== false && pAny.is_active !== false;
    const newActive = !currentActive;
    try {
      await PartiesService.updateParty(pId, { isActive: newActive });
      showMsg(`Party "${pName}" set to ${newActive ? 'Active' : 'Inactive (Archived)'}.`, 'success');
      await loadParties();
      onRefreshAll();
    } catch (err: any) {
      showMsg(err.message || 'Failed to update party status', 'error');
    }
  };

  const loadCoaAccounts = async () => {
    try {
      // Strictly use safeFetchJson to attach HttpOnly session cookie (vv_session) & Bearer token
      const res = await safeFetchJson<any>('/api/finance/coa');
      const list = Array.isArray(res) ? res : (res?.accounts || res?.coa || res?.data || []);
      if (Array.isArray(list) && list.length > 0) {
        setCoaAccounts(list);
        return;
      }
      // Fallback via FinanceService if safeFetchJson returned empty
      const data = await FinanceService.getCoaAccounts();
      setCoaAccounts(data || []);
    } catch (err: any) {
      console.error('Failed to load COA accounts:', err);
      try {
        const data = await FinanceService.getCoaAccounts();
        setCoaAccounts(data || []);
      } catch (fallbackErr) {
        console.error('Fallback load COA accounts failed:', fallbackErr);
      }
    }
  };

  const selectParty = async (party: Party) => {
    if (!party) return;
    const memoryParty = parties.find(p => p.id === party.id || String((p as any).party_id) === String((party as any).party_id)) || party;
    setSelectedParty(memoryParty);
    try {
      const logs = await PartiesService.getKhataLogs(memoryParty.id);
      setKhataLogs(logs || []);
    } catch (err: any) {
      console.error(err);
      setKhataLogs([]);
    }
  };

  const loadVisitingCards = async () => {
    setIsLoadingCards(true);
    try {
      const cards = await PartiesService.getVisitingCards();
      setVisitingCards(cards || []);
    } catch (err: any) {
      console.error('Failed to load visiting cards:', err);
    } finally {
      setIsLoadingCards(false);
    }
  };

  const loadRetailCustomers = async () => {
    setIsLoadingRetail(true);
    try {
      const list = await PartiesService.getRetailCustomers();
      setRetailCustomers(list || []);
    } catch (err: any) {
      console.error('Failed to load retail customers:', err);
    } finally {
      setIsLoadingRetail(false);
    }
  };

  const openRetailCustomerStatement = async (cust: Party) => {
    setSelectedRetailCustomer(cust);
    setShowRetailStatementModal(true);
    setIsLoadingStatement(true);
    try {
      const invs = await PartiesService.getRetailCustomerInvoices(cust.id, cust.phone, cust.name);
      setRetailCustomerInvoices(invs || []);
    } catch (err) {
      console.warn('Failed to load retail customer statement:', err);
      setRetailCustomerInvoices([]);
    } finally {
      setIsLoadingStatement(false);
    }
  };

  useEffect(() => {
    loadParties(page, pageSize, partySearch, filterType);
  }, [loadParties, page, pageSize, partySearch, filterType]);

  useEffect(() => {
    loadCoaAccounts();
    loadVisitingCards();
    loadRetailCustomers();
  }, []);

  // Realtime refetch current page on Supabase CDC update
  useEffect(() => {
    const handleRealtimeRecord = (e: any) => {
      const detail = e.detail;
      if (!detail || !detail.record) return;
      if (detail.table === 'parties' || detail.table === 'chart_of_accounts') {
        loadParties(page, pageSize, partySearch, filterType);
      }
    };
    window.addEventListener('vv:realtime-record', handleRealtimeRecord);
    return () => window.removeEventListener('vv:realtime-record', handleRealtimeRecord);
  }, [loadParties, page, pageSize, partySearch, filterType]);


  const showMsg = (text: string, type: 'success' | 'error' = 'success') => {
    setActionMessage({ type, text });
    setTimeout(() => setActionMessage(null), 5000);
  };

  const toast = {
    error: (msg: string) => showMsg(msg, 'error'),
    success: (msg: string) => showMsg(msg, 'success'),
    info: (msg: string) => showMsg(msg, 'success')
  };

  const handleVisitingCardExtracted = (ocrResult: VisitingCardOcrResult) => {
    if (scannerTargetForm === 'NEW') {
      setPartyForm(prev => ({
        ...prev,
        name: ocrResult.companyName || prev.name,
        company_name: ocrResult.companyName || prev.name,
        contactPerson: ocrResult.contactPerson || prev.contactPerson,
        contact_person: ocrResult.contactPerson || prev.contactPerson,
        contactDesignation: ocrResult.designation || prev.contactDesignation,
        contact_designation: ocrResult.designation || prev.contactDesignation,
        phone: ocrResult.phone || prev.phone,
        email: ocrResult.email || prev.email,
        address: ocrResult.address || prev.address,
        trnNo: ocrResult.trn_tax_no || prev.trnNo,
        trn_no: ocrResult.trn_tax_no || prev.trnNo,
        businessCardUrl: ocrResult.cardImageUrl || prev.businessCardUrl,
        business_card_url: ocrResult.cardImageUrl || prev.businessCardUrl
      }));
      toast.success('✨ Visiting card scanned & party details auto-populated!');
    } else if (scannerTargetForm === 'EDIT') {
      setEditPartyForm(prev => ({
        ...prev,
        name: ocrResult.companyName || prev.name,
        company_name: ocrResult.companyName || prev.name,
        contactPerson: ocrResult.contactPerson || prev.contactPerson,
        contact_person: ocrResult.contactPerson || prev.contactPerson,
        contactDesignation: ocrResult.designation || prev.contactDesignation,
        contact_designation: ocrResult.designation || prev.contactDesignation,
        phone: ocrResult.phone || prev.phone,
        email: ocrResult.email || prev.email,
        address: ocrResult.address || prev.address,
        trnNo: ocrResult.trn_tax_no || prev.trnNo,
        trn_no: ocrResult.trn_tax_no || prev.trnNo,
        businessCardUrl: ocrResult.cardImageUrl || prev.businessCardUrl,
        business_card_url: ocrResult.cardImageUrl || prev.businessCardUrl
      }));
      toast.success('✨ Visiting card scanned & party details auto-populated!');
    } else if (scannerTargetForm === 'CRM') {
      setCardForm({
        id: '',
        companyName: ocrResult.companyName || '',
        contactPerson: ocrResult.contactPerson || '',
        designation: ocrResult.designation || '',
        phone: ocrResult.phone || '',
        email: ocrResult.email || '',
        address: ocrResult.address || '',
        website: ocrResult.website || '',
        cardImageUrl: ocrResult.cardImageUrl || '',
        notes: ''
      });
      setShowNewCardModal(true);
      toast.success('✨ Visiting card extracted! Review & save to CRM directory.');
    } else if (scannerTargetForm === 'CRM_EDIT') {
      setCardForm(prev => ({
        ...prev,
        companyName: ocrResult.companyName || prev.companyName,
        contactPerson: ocrResult.contactPerson || prev.contactPerson,
        designation: ocrResult.designation || prev.designation,
        phone: ocrResult.phone || prev.phone,
        email: ocrResult.email || prev.email,
        address: ocrResult.address || prev.address,
        website: ocrResult.website || prev.website,
        cardImageUrl: ocrResult.cardImageUrl || prev.cardImageUrl
      }));
      toast.success('✨ Visiting card details refreshed from scanner.');
    }
  };

  const handleCardFileUpload = (e: React.ChangeEvent<HTMLInputElement>, target: 'NEW' | 'EDIT' | 'CRM' | 'CRM_EDIT') => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const b64 = event.target?.result as string;
      if (!b64) return;
      setIsOcrProcessing(true);
      try {
        toast.info('Scanning business card with Gemini AI...');
        const result = await extractVisitingCardDetails(b64);
        setScannerTargetForm(target);
        handleVisitingCardExtracted(result);
      } catch (err: any) {
        toast.error(err.message || 'Failed to scan visiting card');
      } finally {
        setIsOcrProcessing(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleStartCardConversion = (card: VisitingCard) => {
    setConvertingCardId(card.id);
    const cName = card.companyName || card.company_name || '';
    const cPerson = card.contactPerson || card.contact_person || '';
    const cDesig = card.designation || '';
    const cPhone = card.phone || '';
    const cEmail = card.email || '';
    const cAddr = card.address || '';
    const cImg = card.cardImageUrl || card.card_image_url || '';

    setPartyForm(prev => ({
      ...prev,
      name: cName,
      company_name: cName,
      contactPerson: cPerson,
      contact_person: cPerson,
      contactDesignation: cDesig,
      contact_designation: cDesig,
      phone: cPhone,
      email: cEmail,
      address: cAddr,
      businessCardUrl: cImg,
      business_card_url: cImg
    }));

    setActiveRegistryTab('PARTIES');
    setShowNewPartyModal(true);
    toast.info(`Converting lead "${cName || cPerson}" into official party. Complete details and provision COA.`);
  };

  const handleSaveNewCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const company = cardForm.companyName.trim();
    const contact = cardForm.contactPerson.trim();
    if (!company && !contact) {
      toast.error('Please enter at least Company Name or Contact Person');
      return;
    }

    setIsSubmitting(true);
    try {
      await PartiesService.createVisitingCard(cardForm);
      toast.success('📇 Visiting card saved to CRM directory!');
      setShowNewCardModal(false);
      setCardForm({
        id: '',
        companyName: '',
        contactPerson: '',
        designation: '',
        phone: '',
        email: '',
        address: '',
        website: '',
        cardImageUrl: '',
        notes: ''
      });
      await loadVisitingCards();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save visiting card');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenEditCard = (card: VisitingCard) => {
    setCardForm({
      id: card.id,
      companyName: card.companyName || card.company_name || '',
      contactPerson: card.contactPerson || card.contact_person || '',
      designation: card.designation || '',
      phone: card.phone || '',
      email: card.email || '',
      address: card.address || '',
      website: card.website || '',
      cardImageUrl: card.cardImageUrl || card.card_image_url || '',
      notes: card.notes || ''
    });
    setShowEditCardModal(true);
  };

  const handleSaveEditCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      await PartiesService.updateVisitingCard(cardForm.id, cardForm);
      toast.success('📇 Visiting card details updated!');
      setShowEditCardModal(false);
      await loadVisitingCards();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update visiting card');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteCard = async (card: VisitingCard) => {
    const label = card.companyName || card.contactPerson || 'this visiting card';
    if (!window.confirm(`Delete ${label} from CRM Visiting Cards Directory?`)) return;

    try {
      await PartiesService.deleteVisitingCard(card.id);
      toast.success('Visiting card removed from CRM directory');
      await loadVisitingCards();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete visiting card');
    }
  };

  const handlePrintParty = (party: Party) => {
    setPrintingParty(party);
    setTimeout(() => {
      window.print();
    }, 150);
  };

  const queryClient = {
    invalidateQueries: async ({ queryKey }: { queryKey: string[] }) => {
      if (queryKey.includes('parties')) {
        await loadParties();
      }
      if (queryKey.includes('chart_of_accounts') || queryKey.includes('coa')) {
        await loadCoaAccounts();
        FinanceService.clearCoaCache();
      }
    }
  };

  const handleCreateParty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    try {
      const cleanName = String(partyForm.name || (partyForm as any).company_name || (partyForm as any).companyName || '').trim();
      if (!cleanName) {
        toast.error('Party / Company Name cannot be empty or undefined.');
        setIsSubmitting(false);
        return;
      }

      const dup = parties.find(p => p.name.trim().toLowerCase() === cleanName.toLowerCase());
      if (dup) {
        toast.error(`Duplicate Name: A party named "${cleanName}" already exists (${dup.code})! Duplicate client/supplier names are strictly prohibited.`);
        setIsSubmitting(false);
        return;
      }

      setIsSubmitting(true);

      const rawType = String(partyForm.type || (partyForm as any).party_type || (partyForm as any).partyType || 'CUSTOMER').trim().toUpperCase();
      let cleanType: 'CUSTOMER' | 'CLIENT' | 'SUPPLIER' | 'COURIER' | 'AGENT' = 'CUSTOMER';

      if (rawType.includes('COURIER') || rawType.includes('FREIGHT') || rawType.includes('LOGISTICS')) {
        cleanType = 'COURIER';
      } else if (rawType.includes('AGENT') || rawType.includes('BROKER')) {
        cleanType = 'AGENT';
      } else if (rawType.includes('SUPPLIER') || rawType.includes('VENDOR')) {
        cleanType = 'SUPPLIER';
      } else {
        cleanType = 'CUSTOMER';
      }

      // Exact Normalization: public.parties table check constraint only accepts CUSTOMER
      const normalizedPartyType = (cleanType as string) === 'CLIENT' ? 'CUSTOMER' : cleanType;

      // Resolve UUIDs strictly for RPC payload (create_party_with_coa requires UUID or NULL for p_inventory_account_id)
      const rawInv = (partyForm as any).inventory_account_id || (cleanType === 'SUPPLIER' ? (partyForm.clearingAccountId || '1310-00') : null);
      const resolvedInventoryUuid = cleanType === 'SUPPLIER' && rawInv ? resolveAccountUuid(rawInv, '7d9a873a-13dc-4519-9f15-c551cd0d4697') : null;
      const safeInventoryUuid = (resolvedInventoryUuid && isUuidString(resolvedInventoryUuid)) ? resolvedInventoryUuid : null;

      const clearingCode = resolveAccountCode(partyForm.clearingAccountId, '1310-00');
      const clearingUuid = resolveAccountUuid(partyForm.clearingAccountId, '7d9a873a-13dc-4519-9f15-c551cd0d4697');
      const payableCode = resolveAccountCode(partyForm.payableAccountId, cleanType === 'COURIER' ? '2120-00' : ((cleanType === 'CUSTOMER' || (cleanType as string) === 'CLIENT') ? '1130-00' : '2110-00'));
      const payableUuid = resolveAccountUuid(partyForm.payableAccountId, cleanType === 'COURIER' ? '4cf50ade-782f-4535-9548-f97011d3d604' : ((cleanType === 'CUSTOMER' || (cleanType as string) === 'CLIENT') ? '26cf14df-ce02-4dc3-95bb-a3a9b59dfff7' : '68ba3a36-5930-4adb-9cfa-3a4c0b4b8127'));
      const receivableCode = resolveAccountCode(partyForm.receivableAccountId, '1130-00');
      const receivableUuid = resolveAccountUuid(partyForm.receivableAccountId, '26cf14df-ce02-4dc3-95bb-a3a9b59dfff7');
      const revenueCode = resolveAccountCode(partyForm.revenueAccountId, '4110-00');
      const revenueUuid = resolveAccountUuid(partyForm.revenueAccountId, 'a50aeec4-441a-4bbd-b96e-cfac6d4de671');

      const formData = {
        name: cleanName,
        company_name: cleanName,
        party_type: normalizedPartyType,
        type: normalizedPartyType,
        partyType: normalizedPartyType,
        phone: partyForm.phone || (partyForm as any).contact_no || null,
        trn_no: partyForm.trn_no || partyForm.trnNo || null,
        credit_limit: Number(partyForm.creditLimit ?? (partyForm as any).credit_limit ?? 0),
        inventory_account_id: safeInventoryUuid,
        payable_account_id: payableUuid,
        clearing_account_id: clearingUuid,
        receivable_account_id: receivableUuid,
        revenue_account_id: revenueUuid,
        coa_account_id: (cleanType === 'CUSTOMER' || (cleanType as string) === 'CLIENT') ? receivableCode : payableCode,
        coaAccountId: (cleanType === 'CUSTOMER' || (cleanType as string) === 'CLIENT') ? receivableCode : payableCode,
        contact_person: partyForm.contactPerson || (partyForm as any).contact_person || '',
        email: partyForm.email || null,
        address: partyForm.address || null,
        contact_designation: partyForm.contactDesignation || partyForm.contact_designation || null,
        trade_license_no: partyForm.tradeLicenseNo || partyForm.trade_license_no || null,
        license_expiry_date: partyForm.licenseExpiryDate || partyForm.license_expiry_date || null,
        bank_name: partyForm.bankName || partyForm.bank_name || null,
        iban: partyForm.iban || null,
        swift_code: partyForm.swiftCode || partyForm.swift_code || null,
        payment_terms: partyForm.paymentTerms || partyForm.payment_terms || 'Cash on Delivery',
        opening_balance: Number(partyForm.openingBalance ?? partyForm.opening_balance ?? 0),
        business_card_url: partyForm.businessCardUrl || partyForm.business_card_url || null
      };

      const { data, error } = await supabase.rpc('create_party_with_coa', {
        p_name: formData.name,
        p_type: formData.party_type,
        p_phone: formData.phone || null,
        p_trn: formData.trn_no || null,
        p_credit_limit: Number(formData.credit_limit) || 0,
        p_inventory_account_id: safeInventoryUuid,
        p_expense_account: clearingCode
      });

      if (error) {
        toast.error(error.message);
        console.error("Party Creation Failed:", error);
        setIsSubmitting(false);
        return;
      }

      // Update party extra details (contact_person, email, address, enterprise B2B fields)
      if (data?.party_id) {
        const provisionedCode = data.code || data.account_code || data.coa_account_id;
        const customMap = (formData.party_type === 'COURIER') ? {
          payableAccountId: provisionedCode || '2120-05',
          payableAccountUuid: payableUuid,
          courierPayableAccountId: provisionedCode || '2120-05',
          clearingAccountId: clearingCode,
          clearingAccountUuid: clearingUuid,
          expenseAccountId: resolveAccountCode(formData.clearing_account_id, '5110-00'),
          inventoryAccountId: safeInventoryUuid
        } : (formData.party_type === 'AGENT') ? {
          payableAccountId: provisionedCode || '2110-03',
          payableAccountUuid: payableUuid,
          agentPayableAccountId: provisionedCode || '2110-03',
          clearingAccountId: clearingCode,
          clearingAccountUuid: clearingUuid,
          expenseAccountId: resolveAccountCode(formData.clearing_account_id, '5110-00'),
          inventoryAccountId: safeInventoryUuid
        } : formData.party_type === 'SUPPLIER' ? {
          payableAccountId: provisionedCode || '2110-03',
          payableAccountUuid: payableUuid,
          receivableAccountId: '1130-00',
          clearingAccountId: clearingCode,
          clearingAccountUuid: clearingUuid,
          inventoryAccountId: safeInventoryUuid || clearingCode
        } : {
          payableAccountId: '2110-00',
          receivableAccountId: provisionedCode || '1130-07',
          receivableAccountUuid: receivableUuid,
          revenueAccountId: revenueCode,
          revenueAccountUuid: revenueUuid
        };

        const { error: updateError } = await supabase.from('parties').update({
          contact_person: formData.contact_person,
          email: formData.email,
          address: formData.address,
          account_map: customMap,
          coa_account_id: provisionedCode || formData.coa_account_id,
          contact_designation: formData.contact_designation,
          trade_license_no: formData.trade_license_no,
          license_expiry_date: formData.license_expiry_date,
          bank_name: formData.bank_name,
          iban: formData.iban,
          swift_code: formData.swift_code,
          payment_terms: formData.payment_terms,
          opening_balance: formData.opening_balance,
          business_card_url: formData.business_card_url
        }).eq('id', data.party_id);
        if (updateError) console.warn("Could not update extended party columns:", updateError);
      }

      if (convertingCardId && (data?.party_id || data?.id)) {
        await PartiesService.markVisitingCardConverted(convertingCardId, data.party_id || data.id);
        setConvertingCardId(null);
        await loadVisitingCards();
        toast.success('🎉 Visiting card converted to official party & linked!');
      }

      // Immediately close modal and reset form state BEFORE querying to prevent duplicate validation race condition
      setShowNewPartyModal(false);

      // Reset form
      setPartyForm({
        name: '',
        company_name: '',
        type: 'CUSTOMER',
        party_type: 'CUSTOMER',
        contactPerson: '',
        contact_person: '',
        contactDesignation: '',
        contact_designation: '',
        phone: '',
        email: '',
        address: '',
        trnNo: '',
        trn_no: '',
        tradeLicenseNo: '',
        trade_license_no: '',
        licenseExpiryDate: '',
        license_expiry_date: '',
        bankName: '',
        bank_name: '',
        iban: '',
        swiftCode: '',
        swift_code: '',
        paymentTerms: 'Cash on Delivery',
        payment_terms: 'Cash on Delivery',
        openingBalance: 0,
        opening_balance: 0,
        businessCardUrl: '',
        business_card_url: '',
        creditLimit: 50000,
        credit_limit: 50000,
        currency: 'AED',
        payableAccountId: '68ba3a36-5930-4adb-9cfa-3a4c0b4b8127',
        payable_account_id: '68ba3a36-5930-4adb-9cfa-3a4c0b4b8127',
        clearingAccountId: '7d9a873a-13dc-4519-9f15-c551cd0d4697',
        clearing_account_id: '7d9a873a-13dc-4519-9f15-c551cd0d4697',
        receivableAccountId: '26cf14df-ce02-4dc3-95bb-a3a9b59dfff7',
        receivable_account_id: '26cf14df-ce02-4dc3-95bb-a3a9b59dfff7',
        revenueAccountId: 'a50aeec4-441a-4bbd-b96e-cfac6d4de671',
        revenue_account_id: 'a50aeec4-441a-4bbd-b96e-cfac6d4de671',
        coaAccountId: '26cf14df-ce02-4dc3-95bb-a3a9b59dfff7',
        coa_account_id: '26cf14df-ce02-4dc3-95bb-a3a9b59dfff7'
      });

      toast.success(`Created party & provisioned account ${data?.code || data?.account_code || data?.coa_account_id || ''}`);

      // Refetch queries after modal is safely closed and form is clean
      await queryClient.invalidateQueries({ queryKey: ['parties'] });
      await queryClient.invalidateQueries({ queryKey: ['chart_of_accounts'] });

      onRefreshAll?.();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add party');
      console.error("Party Creation Failed:", err);
      setIsSubmitting(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecordTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedParty) return;

    const numAmount = Number(txForm.amount);
    if (!numAmount || numAmount <= 0) {
      showMsg('Please enter a valid amount greater than 0.', 'error');
      return;
    }

    try {
      const isReceipt = txForm.type === 'RECEIPT';
      const debit = isReceipt ? 0 : numAmount;
      const credit = isReceipt ? numAmount : 0;
      const newBal = (selectedParty.currentBalance || 0) + debit - credit;

      await PartiesService.addKhataLog({
        partyId: selectedParty.id,
        date: new Date().toISOString().slice(0, 10),
        reference: txForm.docRef,
        debit,
        credit,
        runningBalance: newBal,
        notes: txForm.description
      });

      await PartiesService.updateParty(selectedParty.id, {
        currentBalance: newBal
      });

      showMsg(`Recorded ${txForm.type} of AED ${numAmount}! Updated Khata statement.`);
      setShowTransactionModal(false);
      setTxForm({ type: 'RECEIPT', amount: '', docRef: '', description: '' });
      loadParties();
      selectParty({ ...selectedParty, currentBalance: newBal });
      onRefreshAll();
    } catch (err: any) {
      showMsg(err?.message || 'Transaction error', 'error');
    }
  };

  // Open View Modal
  const handleOpenViewParty = (party: Party) => {
    const memoryParty = parties.find(p => p.id === party.id || String((p as any).party_id) === String((party as any).party_id)) || party;
    setViewPartyData(memoryParty);
    setShowViewPartyModal(true);
  };

  // Open Edit Modal
  const handleOpenEditParty = (party: Party) => {
    const pAny = party as any;
    const rawType = String(party.type || pAny.party_type || 'CUSTOMER').trim().toUpperCase();
    const normalizedType = rawType === 'CLIENT' ? 'CUSTOMER' : rawType;
    setEditPartyForm({
      id: party.id,
      code: party.code,
      name: party.name || pAny.company_name || '',
      company_name: pAny.company_name || party.name || '',
      type: normalizedType as any,
      contactPerson: party.contactPerson || pAny.contact_person || '',
      contact_person: party.contactPerson || pAny.contact_person || '',
      contactDesignation: party.contactDesignation || pAny.contact_designation || '',
      contact_designation: party.contactDesignation || pAny.contact_designation || '',
      phone: party.phone || '',
      email: party.email || '',
      address: party.address || '',
      trnNo: pAny.trn_no || party.trnNo || '',
      trn_no: pAny.trn_no || party.trnNo || '',
      tradeLicenseNo: party.tradeLicenseNo || pAny.trade_license_no || '',
      trade_license_no: party.tradeLicenseNo || pAny.trade_license_no || '',
      licenseExpiryDate: party.licenseExpiryDate || pAny.license_expiry_date || '',
      license_expiry_date: party.licenseExpiryDate || pAny.license_expiry_date || '',
      bankName: party.bankName || pAny.bank_name || '',
      bank_name: party.bankName || pAny.bank_name || '',
      iban: party.iban || pAny.iban || '',
      swiftCode: party.swiftCode || pAny.swift_code || '',
      swift_code: party.swiftCode || pAny.swift_code || '',
      paymentTerms: party.paymentTerms || pAny.payment_terms || 'Cash on Delivery',
      payment_terms: party.paymentTerms || pAny.payment_terms || 'Cash on Delivery',
      openingBalance: Number(party.openingBalance ?? pAny.opening_balance ?? 0),
      opening_balance: Number(party.openingBalance ?? pAny.opening_balance ?? 0),
      businessCardUrl: party.businessCardUrl || pAny.business_card_url || '',
      business_card_url: party.businessCardUrl || pAny.business_card_url || '',
      creditLimit: Number(party.creditLimit || pAny.credit_limit || 0),
      isActive: party.isActive !== false && pAny.is_active !== false,
      linked_account_id: pAny.linked_account_id || pAny.linkedAccountId,
      payableAccountId: resolveAccountUuid(party.accountMap?.courierPayableAccountId || party.accountMap?.agentPayableAccountId || party.accountMap?.payableAccountId || pAny.account_map?.payableAccountId || ((party.type === 'COURIER') ? '2120-00' : '2110-00'), (party.type === 'COURIER') ? '4cf50ade-782f-4535-9548-f97011d3d604' : '68ba3a36-5930-4adb-9cfa-3a4c0b4b8127'),
      clearingAccountId: resolveAccountUuid(party.accountMap?.clearingAccountId || pAny.account_map?.clearingAccountId || '1310-00', '7d9a873a-13dc-4519-9f15-c551cd0d4697'),
      receivableAccountId: resolveAccountUuid(party.accountMap?.receivableAccountId || pAny.account_map?.receivableAccountId || '1130-00', '26cf14df-ce02-4dc3-95bb-a3a9b59dfff7'),
      revenueAccountId: resolveAccountUuid(party.accountMap?.revenueAccountId || pAny.account_map?.revenueAccountId || '4110-00', 'a50aeec4-441a-4bbd-b96e-cfac6d4de671')
    });
    setShowEditPartyModal(true);
  };

  // Save Edit to SQL
  const handleSaveEditParty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const cleanName = (editPartyForm.name || editPartyForm.company_name || '').trim();
    if (!cleanName) {
      showMsg('Party / Company Name cannot be empty.', 'error');
      setIsSubmitting(false);
      return;
    }

    const dup = parties.find(p => p.id !== editPartyForm.id && (p.name || '').trim().toLowerCase() === cleanName.toLowerCase());
    if (dup) {
      showMsg(`Duplicate Name: Another party named "${cleanName}" already exists in the system (${dup.code})! Duplicate client/supplier names are prohibited.`, 'error');
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(true);

    try {
      const rawEditType = String(editPartyForm.type || (editPartyForm as any).party_type || (editPartyForm as any).partyType || 'CUSTOMER').trim().toUpperCase();
      const normalizedEditType = (rawEditType === 'CLIENT' ? 'CUSTOMER' : rawEditType) as any;

      const updated = await PartiesService.updateParty(editPartyForm.id, {
        name: cleanName,
        company_name: cleanName,
        type: normalizedEditType,
        party_type: normalizedEditType,
        contactPerson: editPartyForm.contactPerson,
        contact_person: editPartyForm.contactPerson,
        contactDesignation: editPartyForm.contactDesignation,
        contact_designation: editPartyForm.contactDesignation,
        phone: editPartyForm.phone,
        email: editPartyForm.email,
        address: editPartyForm.address,
        trnNo: editPartyForm.trnNo || editPartyForm.trn_no,
        trn_no: editPartyForm.trnNo || editPartyForm.trn_no,
        tradeLicenseNo: editPartyForm.tradeLicenseNo,
        trade_license_no: editPartyForm.tradeLicenseNo,
        licenseExpiryDate: editPartyForm.licenseExpiryDate,
        license_expiry_date: editPartyForm.licenseExpiryDate,
        bankName: editPartyForm.bankName,
        bank_name: editPartyForm.bankName,
        iban: editPartyForm.iban,
        swiftCode: editPartyForm.swiftCode,
        swift_code: editPartyForm.swiftCode,
        paymentTerms: editPartyForm.paymentTerms,
        payment_terms: editPartyForm.paymentTerms,
        openingBalance: editPartyForm.openingBalance,
        opening_balance: editPartyForm.openingBalance,
        businessCardUrl: editPartyForm.businessCardUrl,
        business_card_url: editPartyForm.businessCardUrl,
        creditLimit: editPartyForm.creditLimit,
        credit_limit: editPartyForm.creditLimit,
        isActive: editPartyForm.isActive,
        is_active: editPartyForm.isActive,
        linked_account_id: editPartyForm.linked_account_id,
        accountMap: {
          payableAccountId: resolveAccountCode(editPartyForm.payableAccountId, (editPartyForm.type === 'CUSTOMER' || (editPartyForm.type as string) === 'CLIENT') ? '1130-00' : '2110-00'),
          payableAccountUuid: resolveAccountUuid(editPartyForm.payableAccountId),
          agentPayableAccountId: editPartyForm.type === 'AGENT' ? resolveAccountCode(editPartyForm.payableAccountId, '2110-00') : undefined,
          agentPayableAccountUuid: editPartyForm.type === 'AGENT' ? resolveAccountUuid(editPartyForm.payableAccountId) : undefined,
          courierPayableAccountId: editPartyForm.type === 'COURIER' ? resolveAccountCode(editPartyForm.payableAccountId, '2120-00') : undefined,
          clearingAccountId: resolveAccountCode(editPartyForm.clearingAccountId, '1310-00'),
          clearingAccountUuid: resolveAccountUuid(editPartyForm.clearingAccountId),
          receivableAccountId: resolveAccountCode(editPartyForm.receivableAccountId, '1130-00'),
          receivableAccountUuid: resolveAccountUuid(editPartyForm.receivableAccountId),
          revenueAccountId: resolveAccountCode(editPartyForm.revenueAccountId, '4110-00'),
          revenueAccountUuid: resolveAccountUuid(editPartyForm.revenueAccountId)
        },
        account_map: {
          payableAccountId: resolveAccountCode(editPartyForm.payableAccountId, (editPartyForm.type === 'CUSTOMER' || (editPartyForm.type as string) === 'CLIENT') ? '1130-00' : '2110-00'),
          payableAccountUuid: resolveAccountUuid(editPartyForm.payableAccountId),
          agentPayableAccountId: editPartyForm.type === 'AGENT' ? resolveAccountCode(editPartyForm.payableAccountId, '2110-00') : undefined,
          agentPayableAccountUuid: editPartyForm.type === 'AGENT' ? resolveAccountUuid(editPartyForm.payableAccountId) : undefined,
          courierPayableAccountId: editPartyForm.type === 'COURIER' ? resolveAccountCode(editPartyForm.payableAccountId, '2120-00') : undefined,
          clearingAccountId: resolveAccountCode(editPartyForm.clearingAccountId, '1310-00'),
          clearingAccountUuid: resolveAccountUuid(editPartyForm.clearingAccountId),
          receivableAccountId: resolveAccountCode(editPartyForm.receivableAccountId, '1130-00'),
          receivableAccountUuid: resolveAccountUuid(editPartyForm.receivableAccountId),
          revenueAccountId: resolveAccountCode(editPartyForm.revenueAccountId, '4110-00'),
          revenueAccountUuid: resolveAccountUuid(editPartyForm.revenueAccountId)
        }
      });
      setShowEditPartyModal(false);
      const partyDisplayName = updated?.name || updated?.company_name || cleanName;
      const partyDisplayCode = updated?.code || editPartyForm.code || 'P-SAVED';
      showMsg(`Party "${partyDisplayName}" (${partyDisplayCode}) updated in SQL database!`, 'success');
      loadParties();
      if (selectedParty?.id === (updated?.id || editPartyForm.id)) {
        setSelectedParty(updated || { ...selectedParty, name: cleanName });
      }
      onRefreshAll();
    } catch (err: any) {
      showMsg(err.message || 'Failed to update party', 'error');
      setIsSubmitting(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Delete Modal
  const handleOpenDeleteParty = (party: Party) => {
    if (!party) return;
    const isUuid = (val: any) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(val || ''));
    const memoryParty = parties.find(p => (p.id && p.id === party.id) || (p.code && p.code === party.code) || (String((p as any).party_id) === String((party as any).party_id))) || party;
    const pAny = memoryParty as any;
    
    // Strict UUID resolution: Ensure safeParty has a true UUID, never an array index or numeric party_id
    let validUuid = '';
    if (isUuid(memoryParty.id)) {
      validUuid = String(memoryParty.id);
    } else if (isUuid(pAny.id)) {
      validUuid = String(pAny.id);
    } else {
      const match = parties.find(p => 
        (p.code === memoryParty.code || String((p as any).party_id) === String(pAny.party_id)) &&
        isUuid(p.id)
      );
      if (match?.id) validUuid = String(match.id);
    }

    const safeParty = {
      ...memoryParty,
      id: validUuid || String(memoryParty.id || ''),
      party_id: pAny.party_id,
      name: memoryParty.name || pAny.company_name || '',
      company_name: pAny.company_name || memoryParty.name || '',
      code: memoryParty.code || ''
    };
    setDeletingParty(safeParty);
    setDeleteError(null);
    setShowDeletePartyModal(true);
  };

  // One-click Deactivate Party (recommended when party has financial entries)
  const handleDeactivateParty = async (party: Party) => {
    const pAny = party as any;
    const isUuid = (val: any) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(val || ''));
    let pId = String(party.id || '').trim();
    if (!isUuid(pId)) {
      const match = parties.find(p => 
        (p.code === party.code || String((p as any).party_id) === String(pAny.party_id)) && 
        isUuid(p.id)
      );
      if (match?.id) pId = String(match.id);
    }
    const pName = party.name || pAny.company_name || 'Party';
    const pCode = party.code || '';
    try {
      setIsDeleting(true);
      await PartiesService.updateParty(pId, { isActive: false });
      setShowDeletePartyModal(false);
      showMsg(`Party "${pName}" (${pCode}) has been set to Inactive. It is safely archived in accounting.`, 'success');
      setDeletingParty(null);
      await loadParties();
      onRefreshAll();
    } catch (err: any) {
      showMsg(err.message || 'Failed to deactivate party', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Confirm Delete from SQL (strictly blocked if entries exist, requires valid UUID)
  const handleConfirmDeleteParty = async () => {
    if (!deletingParty) return;
    const pAny = deletingParty as any;
    const isUuid = (val: any) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(val || ''));

    let delId = String(deletingParty.id || '').trim();
    if (!isUuid(delId)) {
      const match = parties.find(p => 
        (p.code === deletingParty.code || String((p as any).party_id) === String(pAny.party_id)) &&
        isUuid(p.id)
      );
      if (match?.id) {
        delId = String(match.id);
      }
    }

    const delName = deletingParty.name || pAny.company_name || 'Party';
    const delCode = deletingParty.code || '';

    // Enforce strict UUID validation: Block array index, numeric party_id, or missing id
    if (!delId || !isUuid(delId)) {
      const errMsg = 'Cannot delete: A valid Party UUID is required. Numeric IDs or array indices are not permitted.';
      showMsg(errMsg, 'error');
      setDeleteError(errMsg);
      return;
    }

    const pCheck = isPartyDeletable(deletingParty);
    if (!pCheck) {
      showMsg("Cannot delete: This account/supplier has existing transactions. Please deactivate it instead.", "error");
      setDeleteError("Cannot delete: This account/supplier has existing transactions. Please deactivate it instead.");
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);
    try {
      await PartiesService.deleteParty(delId);

      // 1. Immediately mutate local state so the party is removed from the screen instantaneously
      setParties(prev => {
        const next = prev.filter(p => {
          const pId = String(p.id || (p as any).party_id || '');
          const pCode = p.code || '';
          return pId !== delId && pCode !== delCode;
        });
        if (next.length === 0 && page > 1) {
          setPage(p => Math.max(1, p - 1));
        }
        return next;
      });
      setTotalParties(prev => Math.max(0, prev - 1));


      setShowDeletePartyModal(false);
      showMsg(`Party "${delName}" (${delCode}) and linked Chart of Accounts entry deleted from SQL database!`, 'success');
      setDeletingParty(null);
      if (selectedParty?.id === delId || String((selectedParty as any)?.party_id) === delId) {
        setSelectedParty(null);
        setKhataLogs([]);
      }
      await Promise.all([loadParties(), loadCoaAccounts()]);
      onRefreshAll();
    } catch (err: any) {
      const errMsg = err.message || 'Server rejected deletion';
      setDeleteError(errMsg);
      showMsg('Deletion Failed: ' + errMsg, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Print Khata Statement
  const handlePrintKhata = () => {
    if (!selectedParty) return;
    window.print();
  };

  const matchesPartyEntityType = (p: Party, typeToMatch: string): boolean => {
    if (!typeToMatch || typeToMatch === 'ALL') return true;
    const t = String(p.type || (p as any).party_type || '').trim().toUpperCase();
    const pt = String((p as any).party_type || '').trim().toUpperCase();

    if (typeToMatch === 'CUSTOMER' || typeToMatch === 'CLIENT') {
      return t === 'CLIENT' || t === 'CUSTOMER' || pt === 'CLIENT' || pt === 'CUSTOMER';
    }
    if (typeToMatch === 'SUPPLIER') {
      return t === 'SUPPLIER' || t === 'VENDOR' || pt === 'SUPPLIER' || pt === 'VENDOR';
    }
    if (typeToMatch === 'COURIER') {
      return t === 'COURIER' || t === 'FREIGHT' || t === 'LOGISTICS' || pt === 'COURIER' || pt === 'FREIGHT' || pt === 'LOGISTICS';
    }
    if (typeToMatch === 'AGENT') {
      return t === 'AGENT' || t === 'BROKER' || pt === 'AGENT' || pt === 'BROKER';
    }
    return t === typeToMatch || pt === typeToMatch;
  };

  const filteredParties = parties.filter(p => matchesPartyEntityType(p, filterType));

  const filteredCards = useMemo(() => {
    if (!cardSearch.trim()) return visitingCards;
    const q = cardSearch.trim().toLowerCase();
    return visitingCards.filter(c => {
      const comp = (c.companyName || c.company_name || '').toLowerCase();
      const person = (c.contactPerson || c.contact_person || '').toLowerCase();
      const ph = (c.phone || '').toLowerCase();
      const em = (c.email || '').toLowerCase();
      const des = (c.designation || '').toLowerCase();
      const notes = (c.notes || '').toLowerCase();
      return comp.includes(q) || person.includes(q) || ph.includes(q) || em.includes(q) || des.includes(q) || notes.includes(q);
    });
  }, [visitingCards, cardSearch]);

  const filteredRetailCustomers = useMemo(() => {
    const q = retailSearch.trim().toLowerCase();
    if (!q) return retailCustomers;
    return retailCustomers.filter(c => {
      const name = (c.name || '').toLowerCase();
      const comp = ((c as any).company_name || '').toLowerCase();
      const ph = (c.phone || '').toLowerCase();
      const em = (c.email || '').toLowerCase();
      const cd = (c.code || '').toLowerCase();
      const addr = (c.address || '').toLowerCase();
      return name.includes(q) || comp.includes(q) || ph.includes(q) || em.includes(q) || cd.includes(q) || addr.includes(q);
    });
  }, [retailCustomers, retailSearch]);

  return (
    <div className="space-y-3">
      {/* MODULE NAVIGATION TABS */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 flex-wrap">
        <button
          type="button"
          onClick={() => setActiveRegistryTab('PARTIES')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider transition cursor-pointer ${
            activeRegistryTab === 'PARTIES'
              ? 'bg-[#0056b3] text-white shadow-xs'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>🏢 Registered Parties & Ledgers ({totalParties || parties.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveRegistryTab('VISITING_CARDS')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider transition cursor-pointer ${
            activeRegistryTab === 'VISITING_CARDS'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'bg-white text-slate-700 hover:bg-amber-50 border border-slate-200'
          }`}
        >
          <span className="text-sm">📇</span>
          <span>Visiting Card Directory / CRM Leads ({visitingCards.length})</span>
          {visitingCards.filter(c => c.status !== 'CONVERTED').length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-amber-200 text-amber-900 text-[10px] font-extrabold ml-1">
              {visitingCards.filter(c => c.status !== 'CONVERTED').length} Leads
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveRegistryTab('RETAIL_CRM')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider transition cursor-pointer ${
            activeRegistryTab === 'RETAIL_CRM'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'bg-white text-slate-700 hover:bg-emerald-50 border border-slate-200'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>🛍️ Retail Customer CRM & Statements ({retailCustomers.length})</span>
        </button>
      </div>

      {activeRegistryTab === 'PARTIES' && (
        <div className="space-y-3">
          {/* Top Header & Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white p-2 sm:p-2.5 rounded border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2 flex-wrap flex-1">
          <div className="relative min-w-[200px] max-w-xs">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Search code, name, phone, trn..."
              value={partySearch}
              onChange={e => {
                setPartySearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {['ALL', 'CUSTOMER', 'SUPPLIER', 'AGENT', 'COURIER'].map(type => (
              <button
                key={type}
                onClick={() => {
                  setFilterType(type);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  filterType === type
                    ? 'bg-[#0056b3] text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {type === 'ALL' ? 'All Parties' : (type === 'CUSTOMER' || type === 'CLIENT') ? 'Clients (Customers)' : type === 'SUPPLIER' ? 'Suppliers' : type === 'AGENT' ? 'Agents' : 'Couriers'}
              </button>
            ))}
          </div>
        </div>

        <button
          id="btn-add-new-party"
          onClick={() => setShowNewPartyModal(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#0056b3] hover:bg-[#004494] text-white text-xs font-bold uppercase tracking-wider shadow-xs transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Party (COA Auto-Provision)</span>
        </button>
      </div>

      {actionMessage && (
        <div
          className={`p-2.5 rounded text-xs font-semibold flex items-center justify-between animate-in fade-in duration-200 ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
              : 'bg-red-50 text-red-800 border border-red-300'
          }`}
        >
          <span>{actionMessage.text}</span>
          <button onClick={() => setActionMessage(null)} className="text-slate-400 hover:text-slate-700">✕</button>
        </div>
      )}

      {/* Main Grid: Directory on Left, Detailed Khata Ledger on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* Parties List (5 cols) */}
        <div className="lg:col-span-5 space-y-2">
          {filteredParties.length === 0 ? (
            <div className="p-8 text-center bg-white rounded border border-dashed border-slate-200 text-slate-400">
              <Users className="w-8 h-8 mx-auto mb-2 text-slate-300 stroke-[1.5]" />
              <p className="font-semibold text-sm text-slate-600">No parties registered</p>
              <p className="text-xs text-slate-400 mt-0.5">Database verified empty. Add a client or supplier above to begin.</p>
            </div>
          ) : (
            filteredParties.map(party => {
            const isSelected = selectedParty?.id === party.id;
            return (
              <div
                key={party.id}
                onClick={() => selectParty(party)}
                className={`p-3 rounded border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-blue-50/70 border-blue-500 ring-1 ring-blue-400/40 shadow-xs'
                    : 'bg-white border-slate-200 hover:border-slate-300 shadow-xs'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-[10px] font-bold text-blue-800 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                        {party.code}
                      </span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
                        party.type === 'COURIER' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                        party.type === 'AGENT' ? 'bg-purple-100 text-purple-800 border border-purple-200' :
                        party.type === 'SUPPLIER' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                        'bg-blue-100 text-blue-800 border border-blue-200'
                      }`}>
                        {party.type === 'CUSTOMER' || party.type === 'CLIENT' ? 'Client (Customer)' : party.type}
                      </span>
                      {party.hasEntries ? (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-0.5" title="Financial history recorded - Protected from deletion">
                          🔒 {party.totalEntriesCount ? `${party.totalEntriesCount} Entries` : 'Active Khata'}
                        </span>
                      ) : (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-0.5" title="Clean record - 0 entries">
                          🟢 0 Entries
                        </span>
                      )}
                    </div>
                    <h4 className="font-bold text-slate-900 text-xs mt-1 flex items-center gap-1">
                      <span>{party.name}</span>
                    </h4>
                  </div>

                  <div className="text-right">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Khata Balance</div>
                    <div className={`font-mono font-bold text-xs ${
                      Number(party.currentBalance || (party as any).current_balance || 0) > 0
                        ? 'text-emerald-700'
                        : Number(party.currentBalance || (party as any).current_balance || 0) < 0
                        ? 'text-rose-700'
                        : 'text-slate-600'
                    }`}>
                      AED {Math.abs(Number(party.currentBalance ?? (party as any).current_balance ?? 0)).toLocaleString()}
                      <span className="text-[10px] font-sans font-normal ml-1">
                        {Number(party.currentBalance || (party as any).current_balance || 0) > 0 ? '(Rec)' : Number(party.currentBalance || (party as any).current_balance || 0) < 0 ? '(Pay)' : '(Nil)'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-1.5 text-[11px] text-slate-600 flex flex-wrap gap-x-3 gap-y-0.5">
                  {party.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="w-3 h-3 text-blue-600" /> {party.phone}
                    </span>
                  )}
                  {(party.trn_no || party.trnNo) && (
                    <span className="flex items-center gap-1 font-mono text-[10px] text-slate-500">
                      TRN: {party.trn_no || party.trnNo}
                    </span>
                  )}
                </div>

                {/* Provisioned COA Mapping preview & Quick Actions */}
                <div className="mt-1.5 pt-1.5 border-t border-slate-100 text-[10px] text-slate-500 font-mono flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <span className="text-emerald-600 font-bold">✓ COA:</span>
                    <span className="font-bold text-slate-800">
                      {((party.type === 'CUSTOMER' || (party.type as string) === 'CLIENT' || (party as any).party_type === 'CUSTOMER' || (party as any).party_type === 'CLIENT')
                        ? (party.accountMap?.receivableAccountId || party.coaAccountId || (party as any).coa_account_id || `1130-${(party.code || '').replace(/[^A-Za-z0-9]/g, '')}`)
                        : (party.accountMap?.courierPayableAccountId || party.accountMap?.agentPayableAccountId || party.accountMap?.payableAccountId || party.coaAccountId || (party as any).coa_account_id || ((party.type === 'COURIER' || party.type === 'AGENT') ? `2120-${(party.code || '').replace(/[^A-Za-z0-9]/g, '')}` : `2110-${(party.code || '').replace(/[^A-Za-z0-9]/g, '')}`)))
                      }
                    </span>
                  </span>
                  
                  <div className="flex items-center gap-1">
                    {/* One-click Active/Inactive toggle */}
                    <button
                      type="button"
                      onClick={(e) => handleToggleActiveParty(party, e)}
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase transition-colors cursor-pointer ${
                        party.isActive !== false && (party as any).is_active !== false
                          ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                          : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                      }`}
                      title={party.isActive !== false && (party as any).is_active !== false ? "Active - Click to Deactivate/Archive" : "Inactive - Click to Activate"}
                    >
                      {party.isActive !== false && (party as any).is_active !== false ? 'Active' : 'Archived'}
                    </button>

                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleOpenViewParty(party); }}
                      className="p-1 rounded bg-slate-100 hover:bg-blue-100 text-blue-700 transition-colors cursor-pointer"
                      title="View Full Party Profile"
                    >
                      <Eye className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handlePrintParty(party); }}
                      className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                      title="Print Official Profile / A4 Dossier"
                    >
                      <Printer className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleOpenEditParty(party); }}
                      className="p-1 rounded bg-slate-100 hover:bg-amber-100 text-amber-800 transition-colors cursor-pointer"
                      title="Edit Party Details in SQL"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    {isPartyDeletable(party) ? (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleOpenDeleteParty(party); }}
                        className="p-1 rounded transition-colors bg-slate-100 hover:bg-red-100 text-red-600 cursor-pointer"
                        title="Delete Party from SQL Database"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="p-1 rounded bg-slate-100 text-slate-400 opacity-60 cursor-not-allowed"
                        title="Cannot delete: This supplier has existing transactions. Please deactivate it instead."
                      >
                        <Lock className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
          )}

          <Pagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={totalParties}
            pageSize={pageSize}
            onPageChange={newPage => setPage(newPage)}
            onPageSizeChange={newSize => {
              setPageSize(newSize);
              setPage(1);
            }}
            isLoading={isLoadingParties}
            itemLabel="parties"
          />
        </div>

        {/* Khata Ledger Statement (7 cols) */}
        <div className="lg:col-span-7">
          {selectedParty ? (
            <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden space-y-3">
              <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setSelectedParty(null)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 font-bold text-[11px] uppercase tracking-wider border border-slate-300 shadow-2xs transition-colors cursor-pointer min-h-[36px]"
                    title="Return to Parties List"
                  >
                    <ArrowLeft className="w-4 h-4 text-slate-600" />
                    <span>Back to List</span>
                  </button>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-blue-900 bg-blue-50 px-1.5 py-0.5 rounded text-[10px] border border-blue-200">
                        {selectedParty.code}
                      </span>
                      <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">{selectedParty.name}</h3>
                      {!selectedParty.isActive && (
                        <span className="text-[9px] bg-red-100 text-red-700 font-bold px-1.5 py-0.2 rounded border border-red-200">
                          INACTIVE
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {selectedParty.address || 'Dubai Garment District'} • Contact: {selectedParty.contactPerson || 'General Manager'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    onClick={() => handleOpenViewParty(selectedParty)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white hover:bg-blue-50 text-blue-800 font-bold text-[10px] uppercase tracking-wider border border-blue-300 shadow-2xs transition-colors cursor-pointer"
                    title="View Full Profile & Accounting Information"
                  >
                    <Eye className="w-3.5 h-3.5 text-blue-600" />
                    <span>View Profile</span>
                  </button>

                  <button
                    onClick={() => handleOpenEditParty(selectedParty)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white hover:bg-amber-50 text-amber-900 font-bold text-[10px] uppercase tracking-wider border border-amber-300 shadow-2xs transition-colors cursor-pointer"
                    title="Edit Party Information in SQL Database"
                  >
                    <Pencil className="w-3.5 h-3.5 text-amber-600" />
                    <span>Edit</span>
                  </button>

                  <button
                    onClick={() => handlePrintParty(selectedParty)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white hover:bg-slate-100 text-slate-800 font-bold text-[10px] uppercase tracking-wider border border-slate-300 shadow-2xs transition-colors cursor-pointer"
                    title="Print Full Party Profile / A4 Dossier"
                  >
                    <Printer className="w-3.5 h-3.5 text-slate-600" />
                    <span>Print</span>
                  </button>

                  <button
                    id="btn-record-party-payment"
                    onClick={() => setShowTransactionModal(true)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#0056b3] hover:bg-[#004494] text-white font-bold text-[10px] uppercase tracking-wider shadow-xs transition-colors cursor-pointer"
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>Record Settlement</span>
                  </button>

                  <button
                    onClick={() => handleToggleActiveParty(selectedParty)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded font-bold text-[10px] uppercase tracking-wider border shadow-2xs transition-colors cursor-pointer ${
                      selectedParty.isActive !== false && (selectedParty as any).is_active !== false
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                        : 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
                    }`}
                    title="Toggle Active / Inactive (Archive) Status"
                  >
                    <Shield className="w-3.5 h-3.5 text-emerald-700" />
                    <span>{selectedParty.isActive !== false && (selectedParty as any).is_active !== false ? 'Active' : 'Archived'}</span>
                  </button>

                  <button
                    onClick={handlePrintKhata}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white hover:bg-slate-100 text-slate-700 font-bold text-[10px] uppercase tracking-wider border border-slate-300 shadow-2xs transition-colors cursor-pointer"
                    title="Print / Export Statement"
                  >
                    <Printer className="w-3.5 h-3.5 text-slate-600" />
                    <span>Print</span>
                  </button>

                  {isPartyDeletable(selectedParty) ? (
                    <button
                      onClick={() => handleOpenDeleteParty(selectedParty)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded font-bold text-[10px] uppercase tracking-wider border shadow-2xs transition-colors cursor-pointer bg-white hover:bg-red-50 text-red-700 border-red-200"
                      title="Delete Party from SQL Database"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-600" />
                      <span>Delete</span>
                    </button>
                  ) : (
                    <button
                      disabled
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded font-bold text-[10px] uppercase tracking-wider border shadow-2xs opacity-50 bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                      title="Cannot delete: This supplier has existing transactions. Please deactivate it instead."
                    >
                      <Lock className="w-3.5 h-3.5 text-slate-400" />
                      <span>Delete</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setSelectedParty(null)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] uppercase tracking-wider border border-slate-300 shadow-2xs transition-colors cursor-pointer"
                    title="Close Khata Statement"
                  >
                    <X className="w-3.5 h-3.5 text-slate-500" />
                    <span>Close</span>
                  </button>
                </div>
              </div>

              {/* Linked Chart of Accounts Auto-Link Card */}
              <div className="mx-3 p-2 bg-amber-50/80 rounded border border-amber-200/80 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-300 uppercase">
                    Auto-Linked COA Khata
                  </span>
                  <span className="font-mono font-bold text-slate-800 text-[11px]">
                    {((selectedParty.type === 'CUSTOMER' || (selectedParty.type as string) === 'CLIENT' || (selectedParty as any).party_type === 'CUSTOMER' || (selectedParty as any).party_type === 'CLIENT')
                      ? (selectedParty.accountMap?.receivableAccountId || selectedParty.coaAccountId || (selectedParty as any).coa_account_id || `1130-${(selectedParty.code || '').replace(/[^A-Za-z0-9]/g, '')}`)
                      : (selectedParty.accountMap?.courierPayableAccountId || selectedParty.accountMap?.agentPayableAccountId || selectedParty.accountMap?.payableAccountId || selectedParty.coaAccountId || (selectedParty as any).coa_account_id || (selectedParty.type === 'COURIER' ? `2120-${(selectedParty.code || '').replace(/[^A-Za-z0-9]/g, '')}` : `2110-${(selectedParty.code || '').replace(/[^A-Za-z0-9]/g, '')}`))
                    )} - {selectedParty.name} ({selectedParty.type === 'SUPPLIER' ? 'Supplier' : (selectedParty.type === 'AGENT' ? 'Agent' : (selectedParty.type === 'COURIER' ? 'Courier' : 'Customer'))})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const url = new URL(window.location.href);
                    url.searchParams.set('tab', 'finance');
                    url.searchParams.set('financeSubTab', 'coa');
                    window.location.href = url.toString();
                  }}
                  className="text-[10px] font-bold text-amber-900 bg-white border border-amber-300 px-2 py-0.5 rounded hover:bg-amber-100 transition-colors cursor-pointer"
                >
                  View in COA (5-Pillars) →
                </button>
              </div>

              {/* Running Balance Banner */}
              <div className="px-3 grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded bg-slate-50 border border-slate-200">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Current Ledger Net Balance</div>
                  <div className={`text-base font-mono font-bold mt-0.5 ${
                    Number(selectedParty.currentBalance || (selectedParty as any).current_balance || 0) > 0 ? 'text-emerald-700' : Number(selectedParty.currentBalance || (selectedParty as any).current_balance || 0) < 0 ? 'text-rose-700' : 'text-slate-700'
                  }`}>
                    AED {Math.abs(Number(selectedParty.currentBalance ?? (selectedParty as any).current_balance ?? 0)).toLocaleString()}
                    <span className="text-[10px] font-sans font-normal ml-1">
                      {Number(selectedParty.currentBalance || (selectedParty as any).current_balance || 0) > 0 ? 'Customer Owes Us (Dr)' : Number(selectedParty.currentBalance || (selectedParty as any).current_balance || 0) < 0 ? 'We Owe Supplier (Cr)' : 'Settled'}
                    </span>
                  </div>
                </div>

                <div className="p-2.5 rounded bg-slate-50 border border-slate-200">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Credit Facility</div>
                  <div className="text-base font-mono font-bold text-slate-800 mt-0.5">
                    AED {Number(selectedParty.creditLimit ?? (selectedParty as any).credit_limit ?? 0).toLocaleString()}
                  </div>
                </div>
              </div>

              {/* General Ledger Direct View Notice */}
              <div className="p-4 rounded-lg bg-blue-50/70 border border-blue-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                <div>
                  <div className="font-bold text-blue-950 flex items-center gap-1.5">
                    <BookOpen className="w-4 h-4 text-blue-700" />
                    Consolidated General Ledger
                  </div>
                  <p className="text-slate-600 text-[11px] mt-0.5">
                    Transaction postings, vouchers, and statements of account for this party are maintained strictly in the Finance module.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const url = new URL(window.location.href);
                    url.searchParams.set('tab', 'finance');
                    url.searchParams.set('financeSubTab', 'ledger');
                    url.searchParams.set('targetAccount', `PTY:${selectedParty.id}`);
                    window.location.href = url.toString();
                  }}
                  className="px-3 py-1.5 rounded-md font-bold text-xs bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors shrink-0 cursor-pointer flex items-center gap-1.5"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  Open in General Ledger
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded border border-slate-200 p-8 text-center text-slate-400 text-xs">
              Select a party from the directory to view their complete Khata ledger.
            </div>
          )}
        </div>
      </div>
    </div>
  )}

    {/* VISITING CARDS CRM DIRECTORY TAB */}
    {activeRegistryTab === 'VISITING_CARDS' && (
      <div className="space-y-4 animate-in fade-in duration-200">
        {/* Header Control Panel */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl">📇</span>
                <h2 className="text-base font-bold text-slate-900 tracking-tight">Visiting Card Directory (CRM Leads)</h2>
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 rounded-full border border-amber-200">
                  Isolated from COA
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Collect and digitize physical cards without creating accounting ledger records. Convert to official Party anytime.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  setScannerTargetForm('CRM');
                  setShowLiveScannerModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider shadow-xs transition cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>📸 Live Camera Scan</span>
              </button>

              <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs uppercase tracking-wider border border-slate-300 shadow-xs transition cursor-pointer">
                <Upload className="w-3.5 h-3.5 text-blue-600" />
                <span>📁 Upload Card</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => handleCardFileUpload(e, 'CRM')}
                />
              </label>

              <button
                type="button"
                onClick={() => {
                  setCardForm({
                    id: '',
                    companyName: '',
                    contactPerson: '',
                    designation: '',
                    phone: '',
                    email: '',
                    address: '',
                    website: '',
                    cardImageUrl: '',
                    notes: ''
                  });
                  setShowNewCardModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs uppercase tracking-wider shadow-xs transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Manual Entry</span>
              </button>
            </div>
          </div>

          {/* Search & Metrics Bar */}
          <div className="mt-3 pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={cardSearch}
                onChange={e => setCardSearch(e.target.value)}
                placeholder="Search company, person, phone..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:border-blue-500 text-slate-800"
              />
              {cardSearch && (
                <button
                  onClick={() => setCardSearch('')}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 self-end sm:self-auto">
              <span>Total Leads: <strong className="text-slate-800">{visitingCards.length}</strong></span>
              <span>•</span>
              <span>Active Leads: <strong className="text-amber-700">{visitingCards.filter(c => c.status !== 'CONVERTED').length}</strong></span>
              <span>•</span>
              <span>Converted: <strong className="text-emerald-700">{visitingCards.filter(c => c.status === 'CONVERTED').length}</strong></span>
            </div>
          </div>
        </div>

        {/* Cards Grid */}
        {isLoadingCards ? (
          <div className="p-12 text-center bg-white rounded-xl border border-slate-200">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600 mx-auto mb-2" />
            <p className="text-xs text-slate-500">Loading visiting card directory...</p>
          </div>
        ) : filteredCards.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-xl border border-dashed border-slate-300">
            <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3">
              <span className="text-2xl">📇</span>
            </div>
            <h3 className="text-sm font-bold text-slate-800">No Visiting Cards in Directory</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              {cardSearch ? 'No cards match your search criteria.' : 'Scan cards using your camera or upload card images to start building your CRM lead database.'}
            </p>
            <div className="mt-4 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setScannerTargetForm('CRM');
                  setShowLiveScannerModal(true);
                }}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white font-bold text-xs shadow-xs"
              >
                📸 Start Camera Scan
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
            {filteredCards.map(card => {
              const isConverted = card.status === 'CONVERTED';
              const cCompany = card.companyName || card.company_name || 'Individual Contact';
              const cPerson = card.contactPerson || card.contact_person || '';
              const cImg = card.cardImageUrl || card.card_image_url;

              return (
                <div
                  key={card.id}
                  className={`bg-white rounded-xl border transition-all p-4 flex flex-col justify-between shadow-xs ${
                    isConverted
                      ? 'border-emerald-200/80 bg-gradient-to-b from-emerald-50/20 to-white'
                      : 'border-slate-200 hover:border-blue-300 hover:shadow-md'
                  }`}
                >
                  <div>
                    {/* Top Status & Badge */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        isConverted
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1'
                          : 'bg-amber-100 text-amber-800 border border-amber-200'
                      }`}>
                        {isConverted ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-700" />
                            <span>Converted to Party</span>
                          </>
                        ) : (
                          'CRM Lead'
                        )}
                      </span>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEditCard(card)}
                          className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                          title="Edit Lead Card"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCard(card)}
                          className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                          title="Delete Card"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Card Image Preview if present */}
                    {cImg && (
                      <div className="mb-3 rounded-lg overflow-hidden border border-slate-200 aspect-[1.75/1] bg-slate-900/5 relative group">
                        <img
                          src={cImg}
                          alt={cCompany}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        />
                      </div>
                    )}

                    {/* Title & Person */}
                    <h3 className="font-bold text-slate-900 text-sm leading-snug">{cCompany}</h3>
                    {cPerson && (
                      <div className="flex items-center gap-1.5 mt-1 text-slate-700 font-semibold text-xs">
                        <span>{cPerson}</span>
                        {card.designation && (
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-normal">
                            {card.designation}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Details */}
                    <div className="mt-2.5 space-y-1 text-xs text-slate-600">
                      {card.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <a href={`tel:${card.phone}`} className="hover:text-blue-600 font-mono text-[11px]">
                            {card.phone}
                          </a>
                        </div>
                      )}
                      {card.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <a href={`mailto:${card.email}`} className="hover:text-blue-600 truncate text-[11px]">
                            {card.email}
                          </a>
                        </div>
                      )}
                      {card.website && (
                        <div className="flex items-center gap-2">
                          <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <a
                            href={card.website.startsWith('http') ? card.website : `https://${card.website}`}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:text-blue-600 truncate text-[11px]"
                          >
                            {card.website}
                          </a>
                        </div>
                      )}
                      {card.address && (
                        <div className="flex items-start gap-2 pt-0.5">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                          <span className="text-[11px] leading-tight text-slate-500 line-clamp-2">
                            {card.address}
                          </span>
                        </div>
                      )}
                      {card.notes && (
                        <div className="mt-2 p-2 rounded bg-slate-50 border border-slate-100 text-[11px] text-slate-600 italic">
                          "{card.notes}"
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Convert Button */}
                  <div className="mt-4 pt-3 border-t border-slate-100">
                    {isConverted ? (
                      <div className="flex items-center justify-between text-[11px] text-emerald-800 font-semibold bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          Official Registry Linked
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const matched = parties.find(p => p.id === card.convertedPartyId || p.name.toLowerCase() === cCompany.toLowerCase());
                            if (matched) {
                              setActiveRegistryTab('PARTIES');
                              selectParty(matched);
                            } else {
                              setActiveRegistryTab('PARTIES');
                            }
                          }}
                          className="text-blue-700 hover:underline font-bold text-[10px] uppercase cursor-pointer"
                        >
                          View Khata →
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleStartCardConversion(card)}
                        className="w-full py-2 px-3 rounded-lg bg-[#0056b3] hover:bg-[#004494] text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
                      >
                        <Building2 className="w-3.5 h-3.5" />
                        <span>Convert to Party & Provision COA</span>
                        <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    )}

    {/* RETAIL CUSTOMER CRM & STATEMENTS (KHATA) TAB */}
    {activeRegistryTab === 'RETAIL_CRM' && (
      <div className="space-y-4 animate-in fade-in duration-200">
        {/* Header Control Panel */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl">🛍️</span>
                <h2 className="text-base font-bold text-slate-900 tracking-tight">
                  Retail Customer CRM & Statements (Khata)
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 rounded-full border border-emerald-200">
                  COA: 1130-05 Walk-In Control
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Counter retail customers directory. Sales flow through 1130-05 Walk-In control account without bloating corporate ledger. View purchase history, statements, and WhatsApp receipts.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setShowNewRetailModal(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider shadow-xs transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ New Retail Customer</span>
              </button>
            </div>
          </div>

          {/* Search & Metrics Bar */}
          <div className="mt-3 pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={retailSearch}
                onChange={e => setRetailSearch(e.target.value)}
                placeholder="Search by customer name, phone, code..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:border-emerald-600 text-slate-800"
              />
              {retailSearch && (
                <button
                  type="button"
                  onClick={() => setRetailSearch('')}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex items-center gap-3 text-xs font-semibold text-slate-500 self-end sm:self-auto flex-wrap">
              <span>Total Customers: <strong className="text-slate-800">{retailCustomers.length}</strong></span>
              <span>•</span>
              <span>Total Orders: <strong className="text-indigo-700">{retailCustomers.reduce((s, c) => s + (Number((c as any).totalOrders) || 0), 0)}</strong></span>
              <span>•</span>
              <span>Total Retail Sales: <strong className="text-emerald-700">AED {retailCustomers.reduce((s, c) => s + (Number((c as any).totalSpent) || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
            </div>
          </div>
        </div>

        {/* Retail Customers Grid */}
        {isLoadingRetail ? (
          <div className="p-12 text-center bg-white rounded-xl border border-slate-200">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-600 mx-auto mb-2" />
            <p className="text-xs text-slate-500">Loading retail CRM customers...</p>
          </div>
        ) : filteredRetailCustomers.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-xl border border-dashed border-slate-300">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
              <Users className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-800">No Retail Customers Found</h4>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              {retailSearch
                ? `No retail customers match "${retailSearch}". Try a different search.`
                : 'Click "+ New Retail Customer" to register your first counter customer, or add customers directly while scanning in POS Terminal.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredRetailCustomers.map(cust => {
              const ordersCount = Number((cust as any).totalOrders || 0);
              const spentAmt = Number((cust as any).totalSpent || 0);

              return (
                <div
                  key={cust.id}
                  className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs hover:shadow-md transition flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700 font-bold flex items-center justify-center text-xs border border-emerald-100">
                          {cust.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <h3 className="text-xs font-bold text-slate-900 line-clamp-1">{cust.name}</h3>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="font-mono text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-100">
                              {cust.code}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">1130-05</span>
                          </div>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
                        RETAIL
                      </span>
                    </div>

                    <div className="space-y-1 text-xs text-slate-600 pt-1 border-t border-slate-100">
                      {cust.phone ? (
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-slate-500 text-[11px]">
                            <Phone className="w-3 h-3 text-emerald-600" />
                            <span>{cust.phone}</span>
                          </span>
                          <a
                            href={`https://wa.me/${cust.phone.replace(/\D/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] font-bold text-emerald-600 hover:underline flex items-center gap-0.5"
                          >
                            <span>WhatsApp</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-400 italic">No phone registered</div>
                      )}

                      {cust.address && (
                        <div className="flex items-center gap-1.5 text-slate-500 text-[11px] truncate">
                          <MapPin className="w-3 h-3 text-amber-500 shrink-0" />
                          <span className="truncate">{cust.address}</span>
                        </div>
                      )}
                    </div>

                    {/* Spend & Order Stats */}
                    <div className="grid grid-cols-2 gap-2 bg-slate-50 rounded-lg p-2 border border-slate-100 text-center font-mono">
                      <div>
                        <div className="text-[10px] text-slate-500 uppercase">Orders</div>
                        <div className="text-xs font-bold text-indigo-700">{ordersCount}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500 uppercase">Total Spend</div>
                        <div className="text-xs font-bold text-emerald-700">AED {spentAmt.toFixed(2)}</div>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-3 mt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => openRetailCustomerStatement(cust)}
                      className="w-full py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Customer Statement (Khata)</span>
                      <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    )}

      {/* NEW PARTY MODAL */}
      {showNewPartyModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-200 pb-3 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <span>Register Enterprise Party & Auto-Provision COA</span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Full UAE B2B compliance record with automated 5-Tier Chart of Accounts provisioning.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowNewPartyModal(false)}
                className="p-2 -mr-1 -mt-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 min-w-[36px] min-h-[36px] flex items-center justify-center cursor-pointer transition-colors"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* AI VISITING CARD OCR BLOCK */}
            <div className="bg-gradient-to-r from-blue-50/80 via-indigo-50/60 to-slate-50 border border-blue-200/80 rounded-xl p-3.5 mb-4 shadow-xs">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5 text-blue-950 font-bold text-xs">
                  <Sparkles className="w-4 h-4 text-blue-600" />
                  <span>Live AI Visiting Card Scanner & Auto-Fill</span>
                </div>
                <span className="text-[9px] font-bold uppercase tracking-wider bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full border border-blue-200">
                  Gemini Vision OCR
                </span>
              </div>
              <p className="text-[11px] text-slate-600 mb-2.5 leading-relaxed">
                Scan or upload a physical visiting card to automatically parse corporate name, designation, phone, email, address, and UAE TRN tax number.
              </p>

              {partyForm.businessCardUrl ? (
                <div className="bg-white rounded-lg border border-slate-300 p-2.5 flex items-center justify-between gap-3 shadow-2xs">
                  <div className="flex items-center gap-3">
                    <img
                      src={partyForm.businessCardUrl}
                      alt="Scanned Business Card"
                      className="h-16 w-28 rounded object-cover border border-slate-200 shadow-xs"
                    />
                    <div>
                      <span className="text-[11px] font-bold text-emerald-800 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        Business Card Captured & Attached
                      </span>
                      <p className="text-[10px] text-slate-500">
                        Authenticated image will be preserved in database and official print dossiers.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setScannerTargetForm('NEW');
                        setShowLiveScannerModal(true);
                      }}
                      className="px-2.5 py-1 rounded text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200"
                    >
                      Rescan
                    </button>
                    <button
                      type="button"
                      onClick={() => setPartyForm(prev => ({ ...prev, businessCardUrl: '', business_card_url: '' }))}
                      className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50"
                      title="Remove Card"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setScannerTargetForm('NEW');
                      setShowLiveScannerModal(true);
                    }}
                    className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>📸 Live Camera Scan</span>
                  </button>
                  <label className="px-3.5 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 border border-slate-300 shadow-xs transition cursor-pointer">
                    <Upload className="w-3.5 h-3.5 text-blue-600" />
                    <span>📁 Upload Card</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => handleCardFileUpload(e, 'NEW')}
                    />
                  </label>
                  {isOcrProcessing && (
                    <div className="flex items-center gap-1.5 text-xs text-blue-700 font-semibold animate-pulse ml-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Extracting with Gemini AI...</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <form onSubmit={handleCreateParty} className="space-y-3.5 text-xs">
              {/* Row 1: Entity Type & Name */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <label className="block font-bold text-slate-700 text-[10px] uppercase mb-1">
                    Entity Type:
                  </label>
                  <select
                    value={partyForm.type === 'CLIENT' ? 'CUSTOMER' : (partyForm.type || (partyForm as any).party_type || 'CUSTOMER')}
                    onChange={e => {
                      const val = e.target.value as any;
                      setPartyForm(prev => ({
                        ...prev,
                        type: val,
                        party_type: val,
                        ...(val === 'COURIER' ? {
                          payableAccountId: resolveAccountUuid('2120-00', '4cf50ade-782f-4535-9548-f97011d3d604'),
                          payable_account_id: resolveAccountUuid('2120-00', '4cf50ade-782f-4535-9548-f97011d3d604'),
                          clearingAccountId: resolveAccountUuid('1310-00', '7d9a873a-13dc-4519-9f15-c551cd0d4697'),
                          clearing_account_id: resolveAccountUuid('1310-00', '7d9a873a-13dc-4519-9f15-c551cd0d4697'),
                          coaAccountId: resolveAccountUuid('2120-00', '4cf50ade-782f-4535-9548-f97011d3d604'),
                          coa_account_id: resolveAccountUuid('2120-00', '4cf50ade-782f-4535-9548-f97011d3d604')
                        } : val === 'AGENT' ? {
                          payableAccountId: resolveAccountUuid('2110-00', '68ba3a36-5930-4adb-9cfa-3a4c0b4b8127'),
                          payable_account_id: resolveAccountUuid('2110-00', '68ba3a36-5930-4adb-9cfa-3a4c0b4b8127'),
                          clearingAccountId: resolveAccountUuid('1310-00', '7d9a873a-13dc-4519-9f15-c551cd0d4697'),
                          clearing_account_id: resolveAccountUuid('1310-00', '7d9a873a-13dc-4519-9f15-c551cd0d4697'),
                          coaAccountId: resolveAccountUuid('2110-00', '68ba3a36-5930-4adb-9cfa-3a4c0b4b8127'),
                          coa_account_id: resolveAccountUuid('2110-00', '68ba3a36-5930-4adb-9cfa-3a4c0b4b8127')
                        } : val === 'SUPPLIER' ? {
                          payableAccountId: resolveAccountUuid('2110-00', '68ba3a36-5930-4adb-9cfa-3a4c0b4b8127'),
                          payable_account_id: resolveAccountUuid('2110-00', '68ba3a36-5930-4adb-9cfa-3a4c0b4b8127'),
                          clearingAccountId: resolveAccountUuid('1310-00', '7d9a873a-13dc-4519-9f15-c551cd0d4697'),
                          clearing_account_id: resolveAccountUuid('1310-00', '7d9a873a-13dc-4519-9f15-c551cd0d4697'),
                          coaAccountId: resolveAccountUuid('2110-00', '68ba3a36-5930-4adb-9cfa-3a4c0b4b8127'),
                          coa_account_id: resolveAccountUuid('2110-00', '68ba3a36-5930-4adb-9cfa-3a4c0b4b8127')
                        } : {
                          receivableAccountId: resolveAccountUuid('1130-00', '26cf14df-ce02-4dc3-95bb-a3a9b59dfff7'),
                          receivable_account_id: resolveAccountUuid('1130-00', '26cf14df-ce02-4dc3-95bb-a3a9b59dfff7'),
                          revenueAccountId: resolveAccountUuid('4110-00', 'a50aeec4-441a-4bbd-b96e-cfac6d4de671'),
                          revenue_account_id: resolveAccountUuid('4110-00', 'a50aeec4-441a-4bbd-b96e-cfac6d4de671'),
                          coaAccountId: resolveAccountUuid('1130-00', '26cf14df-ce02-4dc3-95bb-a3a9b59dfff7'),
                          coa_account_id: resolveAccountUuid('1130-00', '26cf14df-ce02-4dc3-95bb-a3a9b59dfff7')
                        })
                      }));
                    }}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:border-blue-500 bg-white"
                  >
                    <option value="CUSTOMER">Client (Customer)</option>
                    <option value="SUPPLIER">Supplier (Vendor / Sorter)</option>
                    <option value="AGENT">Agent (Broker)</option>
                    <option value="COURIER">Courier Company (Logistics/Freight)</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-700 text-[10px] uppercase mb-1">
                    Company / Legal Trading Name:
                  </label>
                  <input
                    type="text"
                    value={partyForm.name}
                    onChange={e => {
                      const val = e.target.value;
                      setPartyForm(prev => ({ ...prev, name: val, company_name: val }));
                    }}
                    placeholder="e.g. Vintage Vibes General Trading L.L.C"
                    className={`w-full border rounded-lg p-2 text-xs font-semibold text-slate-800 ${
                      partyForm.name.trim() && parties.some(p => p.name.trim().toLowerCase() === partyForm.name.trim().toLowerCase())
                        ? 'border-red-500 bg-red-50/40 focus:border-red-600'
                        : 'border-slate-300 focus:border-blue-500'
                    }`}
                    required
                  />
                  {(() => {
                    const clean = partyForm.name.trim().toLowerCase();
                    if (!clean) return null;
                    const dup = parties.find(p => p.name.trim().toLowerCase() === clean);
                    if (dup) {
                      return (
                        <div className="text-[10px] text-red-600 font-bold mt-1 flex items-center gap-1 bg-red-50 p-1.5 rounded border border-red-200">
                          <AlertCircle className="w-3 h-3 text-red-600 shrink-0" />
                          <span>Duplicate Name: "{dup.name}" already exists ({dup.code}). Duplicate names are strictly prohibited.</span>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              </div>

              {/* Row 2: Contact Person & Designation */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 text-[10px] uppercase mb-1">
                    Contact Person Name:
                  </label>
                  <input
                    type="text"
                    value={partyForm.contactPerson}
                    onChange={e => {
                      const val = e.target.value;
                      setPartyForm(prev => ({ ...prev, contactPerson: val, contact_person: val }));
                    }}
                    placeholder="e.g. John Doe / Tariq Al Mansoor"
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 text-[10px] uppercase mb-1">
                    Contact Designation / Executive Role:
                  </label>
                  <input
                    type="text"
                    value={partyForm.contactDesignation}
                    onChange={e => {
                      const val = e.target.value;
                      setPartyForm(prev => ({ ...prev, contactDesignation: val, contact_designation: val }));
                    }}
                    placeholder="e.g. Managing Director, Procurement Head"
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Row 3: Phone & Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 text-[10px] uppercase mb-1">
                    Official Telephone / Mobile:
                  </label>
                  <input
                    type="text"
                    value={partyForm.phone}
                    onChange={e => {
                      const val = e.target.value;
                      setPartyForm(prev => ({ ...prev, phone: val, contact_no: val }));
                    }}
                    placeholder="+971 50 123 4567"
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:border-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 text-[10px] uppercase mb-1">
                    Corporate Email Address:
                  </label>
                  <input
                    type="email"
                    value={partyForm.email}
                    onChange={e => setPartyForm(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="finance@company.com"
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Row 4: Tax TRN & Trade License */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <label className="block font-bold text-slate-700 text-[10px] uppercase mb-1">
                    UAE Tax TRN (15 Digits):
                  </label>
                  <input
                    type="text"
                    value={partyForm.trnNo}
                    onChange={e => {
                      const val = e.target.value;
                      setPartyForm(prev => ({ ...prev, trnNo: val, trn_no: val }));
                    }}
                    placeholder="100..."
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs font-mono text-slate-800 focus:border-blue-500"
                  />
                </div>
                <div className="sm:col-span-1">
                  <label className="block font-bold text-slate-700 text-[10px] uppercase mb-1">
                    Trade License Number:
                  </label>
                  <input
                    type="text"
                    value={partyForm.tradeLicenseNo}
                    onChange={e => {
                      const val = e.target.value;
                      setPartyForm(prev => ({ ...prev, tradeLicenseNo: val, trade_license_no: val }));
                    }}
                    placeholder="e.g. 748291"
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs font-mono text-slate-800 focus:border-blue-500"
                  />
                </div>
                <div className="sm:col-span-1">
                  <label className="block font-bold text-slate-700 text-[10px] uppercase mb-1">
                    License Expiry Date:
                  </label>
                  <input
                    type="date"
                    value={partyForm.licenseExpiryDate}
                    onChange={e => {
                      const val = e.target.value;
                      setPartyForm(prev => ({ ...prev, licenseExpiryDate: val, license_expiry_date: val }));
                    }}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Address / Location */}
              <div>
                <label className="block font-bold text-slate-700 text-[10px] uppercase mb-1">
                  Office / Warehouse Address:
                </label>
                <input
                  type="text"
                  value={partyForm.address}
                  onChange={e => setPartyForm(prev => ({ ...prev, address: e.target.value }))}
                  placeholder="Plot 12, Industrial Area, Al Quoz, Dubai"
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:border-blue-500"
                />
              </div>

              {/* Banking & Settlement Section */}
              <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-1.5 text-slate-800 font-bold text-[11px] uppercase tracking-wider">
                  <Landmark className="w-3.5 h-3.5 text-blue-700" />
                  <span>Corporate Banking & Wire Details</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block font-bold text-slate-600 text-[9px] uppercase mb-0.5">Bank Name:</label>
                    <input
                      type="text"
                      value={partyForm.bankName}
                      onChange={e => {
                        const val = e.target.value;
                        setPartyForm(prev => ({ ...prev, bankName: val, bank_name: val }));
                      }}
                      placeholder="e.g. Emirates NBD, Mashreq"
                      className="w-full border border-slate-300 rounded p-1.5 text-xs text-slate-800 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-600 text-[9px] uppercase mb-0.5">IBAN Number:</label>
                    <input
                      type="text"
                      value={partyForm.iban}
                      onChange={e => setPartyForm(prev => ({ ...prev, iban: e.target.value }))}
                      placeholder="AE..."
                      className="w-full border border-slate-300 rounded p-1.5 text-xs font-mono text-slate-800 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-600 text-[9px] uppercase mb-0.5">SWIFT / BIC Code:</label>
                    <input
                      type="text"
                      value={partyForm.swiftCode}
                      onChange={e => {
                        const val = e.target.value;
                        setPartyForm(prev => ({ ...prev, swiftCode: val, swift_code: val }));
                      }}
                      placeholder="EBILAEAD..."
                      className="w-full border border-slate-300 rounded p-1.5 text-xs font-mono text-slate-800 bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Commercial Terms & Credit Limit */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 text-[10px] uppercase mb-1">
                    Commercial Payment Terms:
                  </label>
                  <select
                    value={partyForm.paymentTerms}
                    onChange={e => {
                      const val = e.target.value;
                      setPartyForm(prev => ({ ...prev, paymentTerms: val, payment_terms: val }));
                    }}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs text-slate-800 bg-white focus:border-blue-500"
                  >
                    <option value="Cash on Delivery">Cash on Delivery (COD)</option>
                    <option value="100% Advance">100% Advance Payment</option>
                    <option value="Net 15 Days">Net 15 Days</option>
                    <option value="Net 30 Days">Net 30 Days</option>
                    <option value="Net 60 Days">Net 60 Days</option>
                    <option value="Custom Agreement">Custom Agreement</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 text-[10px] uppercase mb-1">
                    Approved Credit Limit (AED):
                  </label>
                  <input
                    type="number"
                    value={partyForm.creditLimit}
                    onChange={e => {
                      const val = Number(e.target.value);
                      setPartyForm(prev => ({ ...prev, creditLimit: val, credit_limit: val }));
                    }}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs font-mono text-slate-800 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 text-[10px] uppercase mb-1">
                    Opening Balance (AED):
                  </label>
                  <input
                    type="number"
                    value={partyForm.openingBalance}
                    onChange={e => {
                      const val = Number(e.target.value);
                      setPartyForm(prev => ({ ...prev, openingBalance: val, opening_balance: val }));
                    }}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs font-mono text-slate-800 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* DUAL COA ACCOUNTING LINK (AUTO-PROVISIONED) */}
              {partyForm.type === 'SUPPLIER' && (
                <div className="bg-amber-50/70 p-3 rounded-xl border border-amber-200 space-y-2.5 mt-2">
                  <div className="text-[11px] font-bold text-amber-900 uppercase flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-amber-700" />
                      <span>DUAL COA ACCOUNTING LINK (AUTO-PROVISIONED)</span>
                    </div>
                    <span className="text-[9px] bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full font-bold">SUPPLIER</span>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 text-[10px] uppercase mb-1">
                      1. Accounts Payable Account (Trade Liability):
                    </label>
                    <SearchableSelect
                      value={resolveAccountUuid(partyForm.payableAccountId, '68ba3a36-5930-4adb-9cfa-3a4c0b4b8127')}
                      onChange={val => setPartyForm(prev => ({
                        ...prev,
                        payableAccountId: val,
                        payable_account_id: val,
                        coaAccountId: val,
                        coa_account_id: val
                      }))}
                      options={supplierPayableOptions}
                      placeholder="Select Payable Account (2110-00)..."
                      searchPlaceholder="Search liabilities / payables..."
                      className="w-full bg-white"
                    />
                    <span className="text-[9px] text-slate-500 mt-0.5 block">Credited when purchasing raw bales or inventory on credit</span>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 text-[10px] uppercase mb-1">
                      2. Stock Bale Inventory / Goods Clearing (Asset):
                    </label>
                    <SearchableSelect
                      value={resolveAccountUuid(partyForm.clearingAccountId, '7d9a873a-13dc-4519-9f15-c551cd0d4697')}
                      onChange={val => setPartyForm(prev => ({ ...prev, clearingAccountId: val, clearing_account_id: val }))}
                      options={supplierInventoryOptions}
                      placeholder="Select Inventory Asset Account..."
                      searchPlaceholder="Search inventory assets..."
                      className="w-full bg-white"
                    />
                    <span className="text-[9px] text-slate-500 mt-0.5 block">Debited to capitalize physical inward bales into inventory assets</span>
                  </div>
                </div>
              )}

              {(partyForm.type === 'CUSTOMER' || partyForm.type === 'CLIENT') && (
                <div className="bg-blue-50/70 p-3 rounded-xl border border-blue-200 space-y-2.5 mt-2">
                  <div className="text-[11px] font-bold text-blue-900 uppercase flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-blue-700" />
                      <span>DUAL COA ACCOUNTING LINK (AUTO-PROVISIONED)</span>
                    </div>
                    <span className="text-[9px] bg-blue-200 text-blue-900 px-2 py-0.5 rounded-full font-bold">CLIENT (CUSTOMER)</span>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 text-[10px] uppercase mb-1">
                      1. Accounts Receivable Account (Asset):
                    </label>
                    <SearchableSelect
                      value={resolveAccountUuid(partyForm.receivableAccountId, '26cf14df-ce02-4dc3-95bb-a3a9b59dfff7')}
                      onChange={val => setPartyForm(prev => ({
                        ...prev,
                        receivableAccountId: val,
                        receivable_account_id: val,
                        coaAccountId: val,
                        coa_account_id: val
                      }))}
                      options={clientReceivableOptions}
                      placeholder="Select Receivable Account (1130-00)..."
                      searchPlaceholder="Search trade receivables..."
                      className="w-full bg-white"
                    />
                    <span className="text-[9px] text-slate-500 mt-0.5 block">Debited when client purchases vintage apparel or goods on credit</span>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 text-[10px] uppercase mb-1">
                      2. Sales Revenue Account (Revenue):
                    </label>
                    <SearchableSelect
                      value={resolveAccountUuid(partyForm.revenueAccountId, 'a50aeec4-441a-4bbd-b96e-cfac6d4de671')}
                      onChange={val => setPartyForm(prev => ({ ...prev, revenueAccountId: val, revenue_account_id: val }))}
                      options={clientRevenueOptions}
                      placeholder="Select Sales Revenue Account (4110-00)..."
                      searchPlaceholder="Search revenue accounts..."
                      className="w-full bg-white"
                    />
                    <span className="text-[9px] text-slate-500 mt-0.5 block">Credited when sales invoices and counter receipts are finalized</span>
                  </div>
                </div>
              )}

              {partyForm.type === 'COURIER' && (
                <div className="bg-emerald-50/70 p-3 rounded-xl border border-emerald-200 space-y-2.5 mt-2">
                  <div className="text-[11px] font-bold text-emerald-900 uppercase flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-emerald-700" />
                      <span>DUAL COA ACCOUNTING LINK (AUTO-PROVISIONED)</span>
                    </div>
                    <span className="text-[9px] bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded-full font-bold">COURIER COMPANY</span>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 text-[10px] uppercase mb-1">
                      1. Accounts Payable - Courier & Freight (Liability e.g., 2120-00):
                    </label>
                    <SearchableSelect
                      value={resolveAccountUuid(partyForm.payableAccountId, '4cf50ade-782f-4535-9548-f97011d3d604')}
                      onChange={val => setPartyForm(prev => ({
                        ...prev,
                        payableAccountId: val,
                        payable_account_id: val,
                        coaAccountId: val,
                        coa_account_id: val
                      }))}
                      options={courierPayableOptions}
                      placeholder="Select Courier Payable (2120-00)..."
                      searchPlaceholder="Search courier / logistics payables..."
                      className="w-full bg-white"
                    />
                    <span className="text-[9px] text-slate-500 mt-0.5 block">Default Parent: 2120-00 - Accounts Payable - Courier, Freight & Clearing Agents</span>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 text-[10px] uppercase mb-1">
                      2. Relevant Expense / Shipping Clearing Account:
                    </label>
                    <SearchableSelect
                      value={resolveAccountUuid(partyForm.clearingAccountId, '7d9a873a-13dc-4519-9f15-c551cd0d4697')}
                      onChange={val => setPartyForm(prev => ({ ...prev, clearingAccountId: val, clearing_account_id: val }))}
                      options={expenseAndClearingOptions}
                      placeholder="Select Courier Expense or Clearing Account..."
                      searchPlaceholder="Search shipping expense or clearing accounts..."
                      className="w-full bg-white"
                    />
                    <span className="text-[9px] text-slate-500 mt-0.5 block">Operating Expense (Courier/Shipping 5110-00) or COD Clearing Asset (1310-00 / 1128-01)</span>
                  </div>
                </div>
              )}

              {partyForm.type === 'AGENT' && (
                <div className="bg-indigo-50/70 p-3 rounded-xl border border-indigo-200 space-y-2.5 mt-2">
                  <div className="text-[11px] font-bold text-indigo-900 uppercase flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-indigo-700" />
                      <span>DUAL COA ACCOUNTING LINK (AUTO-PROVISIONED)</span>
                    </div>
                    <span className="text-[9px] bg-indigo-200 text-indigo-900 px-2 py-0.5 rounded-full font-bold">AGENT (BROKER)</span>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 text-[10px] uppercase mb-1">
                      1. Commission Payable / Trade Payables (Liability e.g., 2110-00):
                    </label>
                    <SearchableSelect
                      value={resolveAccountUuid(partyForm.payableAccountId, '68ba3a36-5930-4adb-9cfa-3a4c0b4b8127')}
                      onChange={val => setPartyForm(prev => ({
                        ...prev,
                        payableAccountId: val,
                        payable_account_id: val,
                        coaAccountId: val,
                        coa_account_id: val
                      }))}
                      options={agentPayableOptions}
                      placeholder="Select Trade / Agent Payable (2110-00)..."
                      searchPlaceholder="Search agent / broker payables..."
                      className="w-full bg-white"
                    />
                    <span className="text-[9px] text-slate-500 mt-0.5 block">Default Parent: 2110-00 - Accounts Payable - Trade Suppliers (Bale Exporters)</span>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 text-[10px] uppercase mb-1">
                      2. Port Clearing / Brokerage Expense Account:
                    </label>
                    <SearchableSelect
                      value={resolveAccountUuid(partyForm.clearingAccountId, '7d9a873a-13dc-4519-9f15-c551cd0d4697')}
                      onChange={val => setPartyForm(prev => ({ ...prev, clearingAccountId: val, clearing_account_id: val }))}
                      options={expenseAndClearingOptions}
                      placeholder="Select Expense or Clearing Asset Account..."
                      searchPlaceholder="Search brokerage expense or port clearing..."
                      className="w-full bg-white"
                    />
                    <span className="text-[9px] text-slate-500 mt-0.5 block">Operating Expense (Demurrage / Duty / Commission) or Clearing Asset (1310-00)</span>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowNewPartyModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-lg bg-[#0056b3] hover:bg-[#004494] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold uppercase tracking-wider text-[11px] shadow-xs flex items-center gap-2 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Processing...</span>
                    </>
                  ) : (
                    <span>Register & Provision</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RECORD TRANSACTION MODAL */}
      {showTransactionModal && selectedParty && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded max-w-md w-full p-5 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-start justify-between mb-3 border-b border-slate-200 pb-2.5">
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-0.5">Record Settlement / Khata Entry</h3>
                <p className="text-[11px] text-slate-500">Party: {selectedParty.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowTransactionModal(false)}
                className="p-2 -mr-1 -mt-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 min-w-[36px] min-h-[36px] flex items-center justify-center cursor-pointer transition-colors"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRecordTransaction} className="space-y-2.5 text-xs">
              <div>
                <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">Transaction Type:</label>
                <select
                  value={txForm.type}
                  onChange={e => setTxForm({ ...txForm, type: e.target.value as any })}
                  className="w-full border border-slate-300 rounded p-1.5 text-xs text-slate-800 focus:border-blue-500"
                >
                  <option value="RECEIPT">Receipt from Customer (Dr Cash/Bank, Cr Khata)</option>
                  <option value="PAYMENT">Payment to Supplier / Agent (Dr Khata, Cr Cash/Bank)</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">Amount (AED):</label>
                <input
                  type="number"
                  value={txForm.amount}
                  onChange={e => setTxForm({ ...txForm, amount: e.target.value === '' ? '' : Number(e.target.value) })}
                  className="w-full border border-slate-300 rounded p-1.5 text-xs font-mono font-bold text-slate-900 focus:border-blue-500"
                  placeholder="0.00"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">Document / Cheque / Wire Ref:</label>
                <input
                  type="text"
                  value={txForm.docRef}
                  onChange={e => setTxForm({ ...txForm, docRef: e.target.value })}
                  className="w-full border border-slate-300 rounded p-1.5 text-xs font-mono text-slate-800 focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">Description / Memo:</label>
                <textarea
                  rows={2}
                  value={txForm.description}
                  onChange={e => setTxForm({ ...txForm, description: e.target.value })}
                  className="w-full border border-slate-300 rounded p-1.5 text-xs text-slate-800 focus:border-blue-500"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2.5 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowTransactionModal(false)}
                  className="px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded bg-[#0056b3] hover:bg-[#004494] text-white font-bold uppercase tracking-wider text-[11px] shadow-xs"
                >
                  Post to Khata
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW PARTY MODAL */}
      {showViewPartyModal && viewPartyData && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between pb-3 border-b border-slate-200">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900">{viewPartyData.name}</h3>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                    viewPartyData.type === 'SUPPLIER' ? 'bg-amber-100 text-amber-900 border border-amber-300' :
                    (viewPartyData.type === 'CUSTOMER' || viewPartyData.type === 'CLIENT') ? 'bg-blue-100 text-blue-900 border border-blue-300' :
                    viewPartyData.type === 'COURIER' ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' :
                    'bg-purple-100 text-purple-900 border border-purple-300'
                  }`}>
                    {viewPartyData.type === 'CUSTOMER' || viewPartyData.type === 'CLIENT' ? 'Client (Customer)' : viewPartyData.type}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                    viewPartyData.isActive !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                  }`}>
                    {viewPartyData.isActive !== false ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-mono mt-0.5">Code: {viewPartyData.code} • ID: {viewPartyData.id}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowViewPartyModal(false)}
                className="p-2 -mr-1 -mt-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 min-w-[36px] min-h-[36px] flex items-center justify-center cursor-pointer transition-colors"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              {/* Balances Highlight */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-[10px] font-bold uppercase text-slate-500 block">Current Ledger Balance</span>
                  <span className={`text-lg font-mono font-bold block mt-1 ${
                    Number(viewPartyData.currentBalance || (viewPartyData as any).current_balance || 0) > 0 ? 'text-emerald-700' :
                    Number(viewPartyData.currentBalance || (viewPartyData as any).current_balance || 0) < 0 ? 'text-rose-700' : 'text-slate-700'
                  }`}>
                    AED {Math.abs(Number(viewPartyData.currentBalance ?? (viewPartyData as any).current_balance ?? 0)).toLocaleString()}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {Number(viewPartyData.currentBalance || (viewPartyData as any).current_balance || 0) > 0 ? 'Customer Owes Us (Dr)' :
                     Number(viewPartyData.currentBalance || (viewPartyData as any).current_balance || 0) < 0 ? 'We Owe Supplier (Cr)' : 'Settled (0.00)'}
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-[10px] font-bold uppercase text-slate-500 block">Credit Facility</span>
                  <span className="text-lg font-mono font-bold text-slate-800 block mt-1">
                    AED {Number(viewPartyData.creditLimit ?? (viewPartyData as any).credit_limit ?? 0).toLocaleString()}
                  </span>
                  <span className="text-[10px] text-slate-500">Approved Credit Ceiling</span>
                </div>
              </div>

              {/* Scanned Business Card Display if available */}
              {(viewPartyData.businessCardUrl || (viewPartyData as any).business_card_url) && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <img
                      src={viewPartyData.businessCardUrl || (viewPartyData as any).business_card_url}
                      alt="Business Card"
                      className="h-16 w-28 rounded object-cover border border-slate-300 shadow-xs"
                    />
                    <div>
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        Scanned Business Card
                      </span>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        Authenticated digital identity artifact attached to this party record.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handlePrintParty(viewPartyData)}
                    className="px-2.5 py-1 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded border border-blue-200 flex items-center gap-1"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print Card Dossier</span>
                  </button>
                </div>
              )}

              {/* Details List */}
              <div className="bg-slate-50/60 rounded-lg p-3 border border-slate-200/80 divide-y divide-slate-200/60 space-y-2 text-[11px]">
                <div className="flex justify-between items-center pt-1 first:pt-0">
                  <span className="font-semibold text-slate-500">Contact Person</span>
                  <span className="font-medium text-slate-800">{viewPartyData.contactPerson || (viewPartyData as any).contact_person || '-'}</span>
                </div>

                {(viewPartyData.contactDesignation || (viewPartyData as any).contact_designation) && (
                  <div className="flex justify-between items-center pt-2">
                    <span className="font-semibold text-slate-500">Contact Designation</span>
                    <span className="font-semibold text-blue-900">{viewPartyData.contactDesignation || (viewPartyData as any).contact_designation}</span>
                  </div>
                )}

                <div className="flex justify-between items-center pt-2">
                  <span className="font-semibold text-slate-500">Phone Number</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-slate-800">{viewPartyData.phone || '-'}</span>
                    {viewPartyData.phone && (
                      <a
                        href={`https://wa.me/${viewPartyData.phone.replace(/[^0-9]/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold border border-emerald-200"
                      >
                        WhatsApp
                      </a>
                    )}
                  </div>
                </div>

                <div className="flex justify-between items-center pt-2">
                  <span className="font-semibold text-slate-500">Email Address</span>
                  <span className="text-slate-800">{viewPartyData.email || '-'}</span>
                </div>

                <div className="flex justify-between items-center pt-2">
                  <span className="font-semibold text-slate-500">Tax Registration Number (TRN)</span>
                  <span className="font-mono font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                    {viewPartyData.trn_no || viewPartyData.trnNo || '-'}
                  </span>
                </div>

                {(viewPartyData.tradeLicenseNo || (viewPartyData as any).trade_license_no) && (
                  <div className="flex justify-between items-center pt-2">
                    <span className="font-semibold text-slate-500">Trade License No & Expiry</span>
                    <span className="font-mono font-bold text-slate-800">
                      {viewPartyData.tradeLicenseNo || (viewPartyData as any).trade_license_no}
                      {(viewPartyData.licenseExpiryDate || (viewPartyData as any).license_expiry_date) && (
                        <span className="text-[10px] font-normal text-slate-500 ml-1.5">
                          (Exp: {viewPartyData.licenseExpiryDate || (viewPartyData as any).license_expiry_date})
                        </span>
                      )}
                    </span>
                  </div>
                )}

                {(viewPartyData.bankName || (viewPartyData as any).bank_name || viewPartyData.iban) && (
                  <div className="flex justify-between items-start pt-2">
                    <span className="font-semibold text-slate-500">Bank & IBAN</span>
                    <div className="text-right">
                      <span className="font-semibold text-slate-800 block">
                        {viewPartyData.bankName || (viewPartyData as any).bank_name || 'Bank Account'}
                      </span>
                      {viewPartyData.iban && (
                        <span className="font-mono text-[10px] text-slate-600 block">
                          {viewPartyData.iban}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex justify-between items-center pt-2">
                  <span className="font-semibold text-slate-500">Payment Terms</span>
                  <span className="font-medium text-slate-800">{viewPartyData.paymentTerms || (viewPartyData as any).payment_terms || 'Cash on Delivery'}</span>
                </div>

                <div className="flex justify-between items-start pt-2">
                  <span className="font-semibold text-slate-500">Address / Location</span>
                  <span className="text-slate-800 text-right max-w-xs">{viewPartyData.address || '-'}</span>
                </div>

                <div className="flex justify-between items-center pt-2">
                  <span className="font-semibold text-slate-500">Auto-Linked COA Code</span>
                  <span className="font-mono font-bold text-blue-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                    {((viewPartyData.type === 'CUSTOMER' || (viewPartyData.type as string) === 'CLIENT' || (viewPartyData as any).party_type === 'CUSTOMER' || (viewPartyData as any).party_type === 'CLIENT')
                      ? (viewPartyData.accountMap?.receivableAccountId || viewPartyData.coaAccountId || (viewPartyData as any).coa_account_id || `1130-${(viewPartyData.code || '').replace(/[^A-Za-z0-9]/g, '')}`)
                      : (viewPartyData.accountMap?.courierPayableAccountId || viewPartyData.accountMap?.agentPayableAccountId || viewPartyData.accountMap?.payableAccountId || viewPartyData.coaAccountId || (viewPartyData as any).coa_account_id || (viewPartyData.type === 'COURIER' ? `2120-${(viewPartyData.code || '').replace(/[^A-Za-z0-9]/g, '')}` : (viewPartyData.type === 'AGENT' ? `2120-${(viewPartyData.code || '').replace(/[^A-Za-z0-9]/g, '')}` : `2110-${(viewPartyData.code || '').replace(/[^A-Za-z0-9]/g, '')}`)))
                    )}
                  </span>
                </div>

                {(viewPartyData as any).purchaseInvoicesCount !== undefined && (
                  <div className="flex justify-between items-center pt-2">
                    <span className="font-semibold text-slate-500">Linked Purchase Invoices</span>
                    <span className="font-bold text-slate-800">{(viewPartyData as any).purchaseInvoicesCount} Invoices</span>
                  </div>
                )}

                {(viewPartyData as any).salesInvoicesCount !== undefined && (
                  <div className="flex justify-between items-center pt-2">
                    <span className="font-semibold text-slate-500">Linked Sales Invoices</span>
                    <span className="font-bold text-slate-800">{(viewPartyData as any).salesInvoicesCount} Invoices</span>
                  </div>
                )}
              </div>

              {/* Modal Actions */}
              <div className="flex justify-between items-center pt-3 border-t border-slate-200">
                {isPartyDeletable(viewPartyData) ? (
                  <button
                    type="button"
                    onClick={() => {
                      setShowViewPartyModal(false);
                      handleOpenDeleteParty(viewPartyData);
                    }}
                    className="px-3 py-1.5 rounded-lg text-red-600 hover:bg-red-50 text-xs font-semibold flex items-center gap-1.5 border border-red-200 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Party</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="px-3 py-1.5 rounded-lg text-slate-400 bg-slate-100 text-xs font-semibold flex items-center gap-1.5 border border-slate-200 cursor-not-allowed opacity-60"
                    title="Cannot delete: This supplier has existing transactions. Please deactivate it instead."
                  >
                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                    <span>Delete (Protected)</span>
                  </button>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handlePrintParty(viewPartyData)}
                    className="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-black text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5 text-blue-300" />
                    <span>🖨️ Print Profile</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowViewPartyModal(false);
                      handleOpenEditParty(viewPartyData);
                    }}
                    className="px-3.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-800 text-xs font-bold flex items-center gap-1.5 border border-blue-300 cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>Edit Profile</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowViewPartyModal(false)}
                    className="px-4 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EDIT PARTY MODAL */}
      {showEditPartyModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between pb-3 border-b border-slate-200 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 uppercase tracking-wider">
                  Edit Party Profile & Enterprise Ledger
                </h3>
                <p className="text-[11px] text-slate-500 font-mono mt-0.5">Code: {editPartyForm.code}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowEditPartyModal(false)}
                className="p-2 -mr-1 -mt-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 min-w-[36px] min-h-[36px] flex items-center justify-center cursor-pointer transition-colors"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* AI VISITING CARD OCR BLOCK */}
            <div className="bg-gradient-to-r from-blue-50/80 via-indigo-50/60 to-slate-50 border border-blue-200/80 rounded-xl p-3 mb-4 shadow-xs">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5 text-blue-950 font-bold text-xs">
                  <Sparkles className="w-4 h-4 text-blue-600" />
                  <span>Live AI Visiting Card Scanner & Update</span>
                </div>
                <span className="text-[9px] font-bold uppercase tracking-wider bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full border border-blue-200">
                  Gemini Vision OCR
                </span>
              </div>
              <p className="text-[11px] text-slate-600 mb-2 leading-relaxed">
                Scan or upload a visiting card to refresh executive contact details, phone, tax TRN, and save the card image.
              </p>

              {editPartyForm.businessCardUrl ? (
                <div className="bg-white rounded-lg border border-slate-300 p-2 flex items-center justify-between gap-3 shadow-2xs">
                  <div className="flex items-center gap-3">
                    <img
                      src={editPartyForm.businessCardUrl}
                      alt="Scanned Business Card"
                      className="h-14 w-24 rounded object-cover border border-slate-200 shadow-xs"
                    />
                    <div>
                      <span className="text-[11px] font-bold text-emerald-800 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        Business Card Preserved
                      </span>
                      <p className="text-[10px] text-slate-500">
                        Image is embedded in SQL database and official print dossiers.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setScannerTargetForm('EDIT');
                        setShowLiveScannerModal(true);
                      }}
                      className="px-2.5 py-1 rounded text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200"
                    >
                      Rescan
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditPartyForm(prev => ({ ...prev, businessCardUrl: '', business_card_url: '' }))}
                      className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50"
                      title="Remove Card"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setScannerTargetForm('EDIT');
                      setShowLiveScannerModal(true);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>📸 Live Camera Scan</span>
                  </button>
                  <label className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 border border-slate-300 shadow-xs transition cursor-pointer">
                    <Upload className="w-3.5 h-3.5 text-blue-600" />
                    <span>📁 Upload Card</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => handleCardFileUpload(e, 'EDIT')}
                    />
                  </label>
                  {isOcrProcessing && (
                    <div className="flex items-center gap-1.5 text-xs text-blue-700 font-semibold animate-pulse ml-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Extracting with Gemini AI...</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <form onSubmit={handleSaveEditParty} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">Party Entity Type:</label>
                  <select
                    value={editPartyForm.type === 'CLIENT' ? 'CUSTOMER' : (editPartyForm.type || 'CUSTOMER')}
                    onChange={e => {
                      const val = e.target.value as any;
                      setEditPartyForm(prev => ({
                        ...prev,
                        type: val,
                        ...(val === 'COURIER' ? {
                          payableAccountId: resolveAccountUuid('2120-00', '4cf50ade-782f-4535-9548-f97011d3d604')
                        } : val === 'AGENT' ? {
                          payableAccountId: resolveAccountUuid('2110-00', '68ba3a36-5930-4adb-9cfa-3a4c0b4b8127')
                        } : val === 'SUPPLIER' ? {
                          payableAccountId: resolveAccountUuid('2110-00', '68ba3a36-5930-4adb-9cfa-3a4c0b4b8127')
                        } : {
                          receivableAccountId: resolveAccountUuid('1130-00', '26cf14df-ce02-4dc3-95bb-a3a9b59dfff7')
                        })
                      }));
                    }}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:border-blue-500 bg-white"
                  >
                    <option value="CUSTOMER">Client (Customer)</option>
                    <option value="SUPPLIER">Supplier (Vendor / Sorter)</option>
                    <option value="AGENT">Agent (Broker)</option>
                    <option value="COURIER">Courier Company (Logistics/Freight)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">Status:</label>
                  <div className="flex items-center gap-3 h-9 px-2 bg-slate-50 rounded-lg border border-slate-200">
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editPartyForm.isActive}
                        onChange={e => setEditPartyForm({ ...editPartyForm, isActive: e.target.checked })}
                        className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                      />
                      <span>Active in System</span>
                    </label>
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">Company / Party Name:</label>
                <input
                  type="text"
                  value={editPartyForm.name}
                  onChange={e => setEditPartyForm({ ...editPartyForm, name: e.target.value, company_name: e.target.value })}
                  placeholder="e.g. Al Wasl Trading LLC"
                  className={`w-full border rounded-lg p-2 text-xs font-semibold text-slate-800 ${
                    editPartyForm.name.trim() && parties.some(p => p.id !== editPartyForm.id && p.name.trim().toLowerCase() === editPartyForm.name.trim().toLowerCase())
                      ? 'border-red-500 bg-red-50/40 focus:border-red-600'
                      : 'border-slate-300 focus:border-blue-500'
                  }`}
                  required
                />
                {(() => {
                  const clean = editPartyForm.name.trim().toLowerCase();
                  if (!clean) return null;
                  const dup = parties.find(p => p.id !== editPartyForm.id && p.name.trim().toLowerCase() === clean);
                  if (dup) {
                    return (
                      <div className="text-[10px] text-red-600 font-bold mt-1 flex items-center gap-1 bg-red-50 p-1.5 rounded border border-red-200">
                        <AlertCircle className="w-3 h-3 text-red-600 shrink-0" />
                        <span>Duplicate Name: Another party named "{dup.name}" is already registered as {dup.code} ({dup.type}). Cannot use this name.</span>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>

              {/* Contact Person & Designation */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">Contact Person:</label>
                  <input
                    type="text"
                    value={editPartyForm.contactPerson}
                    onChange={e => setEditPartyForm({ ...editPartyForm, contactPerson: e.target.value, contact_person: e.target.value })}
                    placeholder="Manager / Representative"
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">Contact Designation / Title:</label>
                  <input
                    type="text"
                    value={editPartyForm.contactDesignation}
                    onChange={e => setEditPartyForm({ ...editPartyForm, contactDesignation: e.target.value, contact_designation: e.target.value })}
                    placeholder="e.g. Managing Director, Procurement Head"
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Phone & Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">Phone Number:</label>
                  <input
                    type="text"
                    value={editPartyForm.phone}
                    onChange={e => setEditPartyForm({ ...editPartyForm, phone: e.target.value })}
                    placeholder="+971 50 ..."
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">Email Address:</label>
                  <input
                    type="email"
                    value={editPartyForm.email}
                    onChange={e => setEditPartyForm({ ...editPartyForm, email: e.target.value })}
                    placeholder="accountant@company.com"
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* TRN Tax Number, Trade License No, License Expiry Date */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">TRN Tax Number (15 Digits):</label>
                  <input
                    type="text"
                    value={editPartyForm.trnNo}
                    onChange={e => setEditPartyForm({ ...editPartyForm, trnNo: e.target.value, trn_no: e.target.value })}
                    placeholder="100..."
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs font-mono text-slate-800 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">Trade License No:</label>
                  <input
                    type="text"
                    value={editPartyForm.tradeLicenseNo}
                    onChange={e => setEditPartyForm({ ...editPartyForm, tradeLicenseNo: e.target.value, trade_license_no: e.target.value })}
                    placeholder="e.g. 748291"
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs font-mono text-slate-800 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">License Expiry Date:</label>
                  <input
                    type="date"
                    value={editPartyForm.licenseExpiryDate}
                    onChange={e => setEditPartyForm({ ...editPartyForm, licenseExpiryDate: e.target.value, license_expiry_date: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">Address / Location:</label>
                <input
                  type="text"
                  value={editPartyForm.address}
                  onChange={e => setEditPartyForm({ ...editPartyForm, address: e.target.value })}
                  placeholder="Plot 12, Industrial Area, Dubai"
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:border-blue-500"
                />
              </div>

              {/* Corporate Banking & Settlement Section */}
              <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-1.5 text-slate-800 font-bold text-[11px] uppercase tracking-wider">
                  <Landmark className="w-3.5 h-3.5 text-blue-700" />
                  <span>Corporate Banking & Wire Details</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block font-bold text-slate-600 text-[9px] uppercase mb-0.5">Bank Name:</label>
                    <input
                      type="text"
                      value={editPartyForm.bankName}
                      onChange={e => setEditPartyForm({ ...editPartyForm, bankName: e.target.value, bank_name: e.target.value })}
                      placeholder="e.g. Emirates NBD"
                      className="w-full border border-slate-300 rounded p-1.5 text-xs text-slate-800 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-600 text-[9px] uppercase mb-0.5">IBAN Number:</label>
                    <input
                      type="text"
                      value={editPartyForm.iban}
                      onChange={e => setEditPartyForm({ ...editPartyForm, iban: e.target.value })}
                      placeholder="AE..."
                      className="w-full border border-slate-300 rounded p-1.5 text-xs font-mono text-slate-800 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-600 text-[9px] uppercase mb-0.5">SWIFT / BIC Code:</label>
                    <input
                      type="text"
                      value={editPartyForm.swiftCode}
                      onChange={e => setEditPartyForm({ ...editPartyForm, swiftCode: e.target.value, swift_code: e.target.value })}
                      placeholder="EBILAEAD..."
                      className="w-full border border-slate-300 rounded p-1.5 text-xs font-mono text-slate-800 bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Commercial Payment Terms, Approved Credit Limit, and Opening Balance */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">Commercial Payment Terms:</label>
                  <select
                    value={editPartyForm.paymentTerms}
                    onChange={e => setEditPartyForm({ ...editPartyForm, paymentTerms: e.target.value, payment_terms: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs text-slate-800 bg-white focus:border-blue-500"
                  >
                    <option value="Cash on Delivery">Cash on Delivery (COD)</option>
                    <option value="100% Advance">100% Advance Payment</option>
                    <option value="Net 15 Days">Net 15 Days</option>
                    <option value="Net 30 Days">Net 30 Days</option>
                    <option value="Net 60 Days">Net 60 Days</option>
                    <option value="Custom Agreement">Custom Agreement</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">Approved Credit Limit (AED):</label>
                  <input
                    type="number"
                    value={editPartyForm.creditLimit}
                    onChange={e => setEditPartyForm({ ...editPartyForm, creditLimit: Number(e.target.value) })}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs font-mono text-slate-800 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">Opening Balance (AED):</label>
                  <input
                    type="number"
                    value={editPartyForm.openingBalance}
                    onChange={e => setEditPartyForm({ ...editPartyForm, openingBalance: Number(e.target.value), opening_balance: Number(e.target.value) })}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs font-mono text-slate-800 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* COA Accounts Mapping for Edit */}
              {editPartyForm.type === 'SUPPLIER' && (
                <div className="bg-amber-50/70 p-3 rounded-lg border border-amber-200 space-y-2 mt-2">
                  <div className="text-[10px] font-bold text-amber-900 uppercase flex items-center justify-between">
                    <span>🛡️ Linked COA Accounts</span>
                    <span className="text-[9px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded font-bold">SUPPLIER</span>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 text-[10px] uppercase mb-0.5">
                      Accounts Payable Account (Liability):
                    </label>
                    <SearchableSelect
                      value={resolveAccountUuid(editPartyForm.payableAccountId, '68ba3a36-5930-4adb-9cfa-3a4c0b4b8127')}
                      onChange={val => setEditPartyForm({ ...editPartyForm, payableAccountId: val })}
                      options={supplierPayableOptions}
                      placeholder="Select Payable Account (2110-00)..."
                      className="w-full bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 text-[10px] uppercase mb-0.5">
                      Stock Bale Inventory / Goods Clearing (Asset):
                    </label>
                    <SearchableSelect
                      value={resolveAccountUuid(editPartyForm.clearingAccountId, '7d9a873a-13dc-4519-9f15-c551cd0d4697')}
                      onChange={val => setEditPartyForm({ ...editPartyForm, clearingAccountId: val })}
                      options={supplierInventoryOptions}
                      placeholder="Select Inventory Asset Account..."
                      className="w-full bg-white"
                    />
                  </div>
                </div>
              )}

              {(editPartyForm.type === 'CUSTOMER' || editPartyForm.type === 'CLIENT') && (
                <div className="bg-blue-50/70 p-3 rounded-lg border border-blue-200 space-y-2 mt-2">
                  <div className="text-[10px] font-bold text-blue-900 uppercase flex items-center justify-between">
                    <span>🛡️ Linked COA Accounts</span>
                    <span className="text-[9px] bg-blue-200 text-blue-900 px-1.5 py-0.5 rounded font-bold">CLIENT (CUSTOMER)</span>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 text-[10px] uppercase mb-0.5">
                      Accounts Receivable Account (Asset):
                    </label>
                    <SearchableSelect
                      value={resolveAccountUuid(editPartyForm.receivableAccountId, '26cf14df-ce02-4dc3-95bb-a3a9b59dfff7')}
                      onChange={val => setEditPartyForm({ ...editPartyForm, receivableAccountId: val })}
                      options={clientReceivableOptions}
                      placeholder="Select Receivable Account (1130-00)..."
                      className="w-full bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 text-[10px] uppercase mb-0.5">
                      Sales Revenue Account (Revenue):
                    </label>
                    <SearchableSelect
                      value={resolveAccountUuid(editPartyForm.revenueAccountId, 'a50aeec4-441a-4bbd-b96e-cfac6d4de671')}
                      onChange={val => setEditPartyForm({ ...editPartyForm, revenueAccountId: val })}
                      options={clientRevenueOptions}
                      placeholder="Select Sales Revenue Account..."
                      className="w-full bg-white"
                    />
                  </div>
                </div>
              )}

              {editPartyForm.type === 'COURIER' && (
                <div className="bg-emerald-50/70 p-3 rounded-lg border border-emerald-200 space-y-2 mt-2">
                  <div className="text-[10px] font-bold text-emerald-900 uppercase flex items-center justify-between">
                    <span>🛡️ Linked COA Accounts</span>
                    <span className="text-[9px] bg-emerald-200 text-emerald-900 px-1.5 py-0.5 rounded font-bold">COURIER COMPANY</span>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 text-[10px] uppercase mb-0.5">
                      Accounts Payable - Courier & Freight (Liability):
                    </label>
                    <SearchableSelect
                      value={resolveAccountUuid(editPartyForm.payableAccountId, '4cf50ade-782f-4535-9548-f97011d3d604')}
                      onChange={val => setEditPartyForm({ ...editPartyForm, payableAccountId: val })}
                      options={courierPayableOptions}
                      placeholder="Select Courier Payable (2120-00)..."
                      className="w-full bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 text-[10px] uppercase mb-0.5">
                      Relevant Expense / Shipping Clearing Account:
                    </label>
                    <SearchableSelect
                      value={resolveAccountUuid(editPartyForm.clearingAccountId, '7d9a873a-13dc-4519-9f15-c551cd0d4697')}
                      onChange={val => setEditPartyForm({ ...editPartyForm, clearingAccountId: val })}
                      options={expenseAndClearingOptions}
                      placeholder="Select Courier Expense or Clearing Account..."
                      className="w-full bg-white"
                    />
                  </div>
                </div>
              )}

              {editPartyForm.type === 'AGENT' && (
                <div className="bg-indigo-50/70 p-3 rounded-lg border border-indigo-200 space-y-2 mt-2">
                  <div className="text-[10px] font-bold text-indigo-900 uppercase flex items-center justify-between">
                    <span>🛡️ Linked COA Accounts</span>
                    <span className="text-[9px] bg-indigo-200 text-indigo-900 px-1.5 py-0.5 rounded font-bold">AGENT (BROKER)</span>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 text-[10px] uppercase mb-0.5">
                      Accounts Payable - Trade / Agent Clearing (Liability):
                    </label>
                    <SearchableSelect
                      value={resolveAccountUuid(editPartyForm.payableAccountId, '68ba3a36-5930-4adb-9cfa-3a4c0b4b8127')}
                      onChange={val => setEditPartyForm({ ...editPartyForm, payableAccountId: val })}
                      options={agentPayableOptions}
                      placeholder="Select Agent Payable (2110-00)..."
                      className="w-full bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 text-[10px] uppercase mb-0.5">
                      Default Expense / Clearing Account:
                    </label>
                    <SearchableSelect
                      value={resolveAccountUuid(editPartyForm.clearingAccountId, '7d9a873a-13dc-4519-9f15-c551cd0d4697')}
                      onChange={val => setEditPartyForm({ ...editPartyForm, clearingAccountId: val })}
                      options={expenseAndClearingOptions}
                      placeholder="Select Expense or Clearing Asset Account..."
                      className="w-full bg-white"
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowEditPartyModal(false)}
                  className="px-3.5 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-lg bg-[#0056b3] hover:bg-[#004494] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold uppercase tracking-wider text-[11px] shadow-xs flex items-center gap-2 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving Changes...</span>
                    </>
                  ) : (
                    <span>Save Changes</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE PARTY MODAL */}
      {showDeletePartyModal && deletingParty && (() => {
        const purCount = Number(deletingParty.purchaseInvoicesCount || (deletingParty as any).stats?.purchaseInvoicesCount || 0);
        const salesCount = Number(deletingParty.salesInvoicesCount || (deletingParty as any).stats?.salesInvoicesCount || 0);
        const khataCount = Number(deletingParty.khataLogsCount || (deletingParty as any).stats?.khataTransactionsCount || 0);
        const glCount = Number(deletingParty.glEntriesCount || (deletingParty as any).stats?.glEntriesCount || 0);
        const curBal = Number(deletingParty.currentBalance || (deletingParty as any).current_balance || 0);
        const totalEntries = purCount + salesCount + khataCount + glCount;
        const hasAnyEntries = Boolean(
          deletingParty.hasEntries ||
          totalEntries > 0 ||
          Math.abs(curBal) > 0.001
        );

        return (
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-lg max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto relative">
              <button
                type="button"
                onClick={() => {
                  setShowDeletePartyModal(false);
                  setDeleteError(null);
                }}
                className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 min-w-[36px] min-h-[36px] flex items-center justify-center cursor-pointer transition-colors"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
              {hasAnyEntries ? (
                /* BLOCK DELETION: PARTY HAS FINANCIAL ENTRIES */
                <div>
                  <div className="flex items-center gap-3 text-amber-600 mb-3">
                    <div className="p-3 rounded-full bg-amber-100 border border-amber-300">
                      <Lock className="w-6 h-6 text-amber-700" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        Party Deletion Prohibited (Protected Record)
                      </h3>
                      <p className="text-xs font-semibold text-amber-800">
                        یہ پارٹی ٹرانزیکشنز کی وجہ سے ڈیلیٹ نہیں ہو سکتی — برائے مہربانی غیر فعال (Deactivate) کریں
                      </p>
                    </div>
                  </div>

                  <div className="bg-amber-50/80 border border-amber-300 rounded-lg p-3.5 space-y-2.5 text-xs text-slate-800">
                    <p className="font-semibold text-slate-900">
                      Party <strong className="text-blue-900 underline">{deletingParty.name}</strong> ({deletingParty.code}) has recorded transactions and cannot be deleted:
                    </p>

                    <div className="grid grid-cols-2 gap-2 font-mono text-[11px] bg-white p-2.5 rounded border border-amber-200">
                      <div>• Purchase Invoices: <strong className="text-slate-900">{purCount}</strong></div>
                      <div>• Sales Invoices: <strong className="text-slate-900">{salesCount}</strong></div>
                      <div>• Khata Ledger Logs: <strong className="text-slate-900">{khataCount}</strong></div>
                      <div>• GL Vouchers: <strong className="text-slate-900">{glCount}</strong></div>
                      <div className="col-span-2 text-rose-700 font-bold border-t border-slate-100 pt-1">
                        • Current Khata Balance: AED {Math.abs(curBal).toLocaleString()} {curBal > 0 ? '(Dr - Receivable)' : curBal < 0 ? '(Cr - Payable)' : '(Settled)'}
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-700 leading-relaxed font-sans">
                      اکاؤنٹنگ کے بین الاقوامی اصولوں (GAAP / IFRS) کے تحت جن پارٹیوں کا لین دین یا بیلنس موجود ہو، انہیں مستقل ڈیلیٹ کرنے کی اجازت نہیں ہے۔ آپ اس پارٹی کو <strong>"Mark Inactive"</strong> کر سکتے ہیں تاکہ مزید لین دین نہ ہو سکے جبکہ پچھلا مالیاتی ریکارڈ محفوظ رہے۔
                    </p>
                  </div>

                  {deleteError && (
                    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded text-xs text-red-800 leading-relaxed">
                      <strong className="block font-bold text-red-900 mb-1">Cannot Delete:</strong>
                      {deleteError}
                    </div>
                  )}

                  <div className="mt-5 flex items-center justify-between gap-2 pt-3 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={() => {
                        setShowDeletePartyModal(false);
                        setDeleteError(null);
                      }}
                      className="px-3.5 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px] cursor-pointer"
                    >
                      Cancel (منسوخ کریں)
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleDeactivateParty(deletingParty)}
                        disabled={isDeleting}
                        className="px-4 py-2 rounded bg-amber-600 hover:bg-amber-700 text-white font-bold uppercase tracking-wider text-[11px] shadow-xs flex items-center gap-1.5 cursor-pointer"
                        title="Mark party as inactive without deleting records"
                      >
                        <Shield className="w-3.5 h-3.5" />
                        <span>{isDeleting ? 'Archiving...' : 'Deactivate / Mark Inactive (محفوظ رکھیں)'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* ALLOW DELETION: CLEAN PARTY WITH 0 ENTRIES */
                <div>
                  <div className="flex items-center gap-3 text-red-600 mb-3">
                    <div className="p-2.5 rounded-full bg-red-100">
                      <Trash2 className="w-6 h-6 text-red-600" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">Delete Clean Party</h3>
                      <p className="text-xs text-slate-500">Party has 0 transactions and can be safely removed</p>
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed">
                    Are you sure you want to permanently delete <strong className="text-slate-900 font-bold">{deletingParty.name}</strong> ({deletingParty.code})?
                  </p>

                  <div className="mt-2 p-2 rounded bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-800">
                    ✓ Verified: This party has <strong>0 invoices, 0 khata entries</strong>, and <strong>AED 0.00 balance</strong>. Deletion will safely remove this record from PostgreSQL.
                  </div>

                  {deleteError && (
                    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded text-xs text-red-800 leading-relaxed">
                      <strong className="block font-bold text-red-900 mb-1">Cannot Delete:</strong>
                      {deleteError}
                    </div>
                  )}

                  <div className="mt-5 flex justify-end gap-2 pt-3 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={() => {
                        setShowDeletePartyModal(false);
                        setDeleteError(null);
                      }}
                      disabled={isDeleting}
                      className="px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmDeleteParty}
                      disabled={isDeleting}
                      className="px-4 py-1.5 rounded bg-red-600 hover:bg-red-700 text-white font-bold uppercase tracking-wider text-[11px] shadow-xs flex items-center gap-1.5"
                    >
                      {isDeleting ? (
                        <>
                          <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                          <span>Deleting...</span>
                        </>
                      ) : (
                        <span>Confirm Delete</span>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* NEW VISITING CARD MODAL (CRM LEAD) */}
      {showNewCardModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-5 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between pb-3 border-b border-slate-200 mb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <span>📇</span>
                  <span>Save Visiting Card (CRM Lead)</span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Stores contact card without affecting COA accounts or financial statements.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowNewCardModal(false)}
                className="p-2 -mr-1 -mt-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 min-w-[36px] min-h-[36px] flex items-center justify-center cursor-pointer transition-colors"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Live Camera & File Upload inside modal */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                  Live AI Scan / Re-extract
                </span>
                {cardForm.cardImageUrl && (
                  <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded">
                    Image Attached
                  </span>
                )}
              </div>

              {cardForm.cardImageUrl ? (
                <div className="flex items-center gap-3 bg-white p-2 rounded border border-slate-200">
                  <img
                    src={cardForm.cardImageUrl}
                    alt="Card Preview"
                    className="h-14 w-24 object-cover rounded border border-slate-200"
                  />
                  <div className="flex-1 min-w-0 text-[10px] text-slate-500">
                    <p className="font-semibold text-slate-700 truncate">Visiting card artifact preserved</p>
                    <p>Stored in CRM leads directory</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setScannerTargetForm('CRM');
                        setShowLiveScannerModal(true);
                      }}
                      className="px-2 py-1 text-xs text-blue-700 bg-blue-50 rounded hover:bg-blue-100 cursor-pointer"
                    >
                      Rescan
                    </button>
                    <button
                      type="button"
                      onClick={() => setCardForm(prev => ({ ...prev, cardImageUrl: '' }))}
                      className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setScannerTargetForm('CRM');
                      setShowLiveScannerModal(true);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>📸 Live Camera Scan</span>
                  </button>
                  <label className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 border border-slate-300 shadow-xs transition cursor-pointer">
                    <Upload className="w-3.5 h-3.5 text-blue-600" />
                    <span>📁 Upload Image</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => handleCardFileUpload(e, 'CRM')}
                    />
                  </label>
                  {isOcrProcessing && (
                    <div className="flex items-center gap-1.5 text-xs text-blue-700 font-semibold animate-pulse ml-1">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Parsing...</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <form onSubmit={handleSaveNewCard} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 text-[10px] uppercase mb-1">Company / Organization Name:</label>
                <input
                  type="text"
                  value={cardForm.companyName}
                  onChange={e => setCardForm({ ...cardForm, companyName: e.target.value })}
                  placeholder="e.g. Acme Corporation"
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs font-semibold text-slate-800 focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-slate-700 text-[10px] uppercase mb-1">Contact Person:</label>
                  <input
                    type="text"
                    value={cardForm.contactPerson}
                    onChange={e => setCardForm({ ...cardForm, contactPerson: e.target.value })}
                    placeholder="e.g. John Doe"
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 text-[10px] uppercase mb-1">Designation / Role:</label>
                  <input
                    type="text"
                    value={cardForm.designation}
                    onChange={e => setCardForm({ ...cardForm, designation: e.target.value })}
                    placeholder="e.g. Commercial Director"
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-slate-700 text-[10px] uppercase mb-1">Telephone / Mobile:</label>
                  <input
                    type="text"
                    value={cardForm.phone}
                    onChange={e => setCardForm({ ...cardForm, phone: e.target.value })}
                    placeholder="+971 50 ..."
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 text-[10px] uppercase mb-1">Email Address:</label>
                  <input
                    type="email"
                    value={cardForm.email}
                    onChange={e => setCardForm({ ...cardForm, email: e.target.value })}
                    placeholder="contact@company.com"
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-slate-700 text-[10px] uppercase mb-1">Website URL:</label>
                  <input
                    type="text"
                    value={cardForm.website}
                    onChange={e => setCardForm({ ...cardForm, website: e.target.value })}
                    placeholder="www.example.com"
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 text-[10px] uppercase mb-1">Office Address:</label>
                  <input
                    type="text"
                    value={cardForm.address}
                    onChange={e => setCardForm({ ...cardForm, address: e.target.value })}
                    placeholder="Office 301, Dubai"
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 text-[10px] uppercase mb-1">Meeting Notes / Lead Context:</label>
                <textarea
                  rows={2}
                  value={cardForm.notes}
                  onChange={e => setCardForm({ ...cardForm, notes: e.target.value })}
                  placeholder="Met at Gitex / Exhibition booth. Interested in bulk vintage denim bales."
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowNewCardModal(false)}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 rounded-lg bg-[#0056b3] hover:bg-[#004494] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold uppercase tracking-wider text-[11px] shadow-xs flex items-center gap-2 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving Lead...</span>
                    </>
                  ) : (
                    <span>Save to CRM Directory</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT VISITING CARD MODAL */}
      {showEditCardModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-5 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between pb-3 border-b border-slate-200 mb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <span>📇</span>
                  <span>Edit Lead Card</span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Update visiting card contact details in CRM leads directory.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowEditCardModal(false)}
                className="p-2 -mr-1 -mt-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 min-w-[36px] min-h-[36px] flex items-center justify-center cursor-pointer transition-colors"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditCard} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 text-[10px] uppercase mb-1">Company / Organization Name:</label>
                <input
                  type="text"
                  value={cardForm.companyName}
                  onChange={e => setCardForm({ ...cardForm, companyName: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs font-semibold text-slate-800 focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-slate-700 text-[10px] uppercase mb-1">Contact Person:</label>
                  <input
                    type="text"
                    value={cardForm.contactPerson}
                    onChange={e => setCardForm({ ...cardForm, contactPerson: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 text-[10px] uppercase mb-1">Designation / Role:</label>
                  <input
                    type="text"
                    value={cardForm.designation}
                    onChange={e => setCardForm({ ...cardForm, designation: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-slate-700 text-[10px] uppercase mb-1">Telephone / Mobile:</label>
                  <input
                    type="text"
                    value={cardForm.phone}
                    onChange={e => setCardForm({ ...cardForm, phone: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 text-[10px] uppercase mb-1">Email Address:</label>
                  <input
                    type="email"
                    value={cardForm.email}
                    onChange={e => setCardForm({ ...cardForm, email: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-slate-700 text-[10px] uppercase mb-1">Website URL:</label>
                  <input
                    type="text"
                    value={cardForm.website}
                    onChange={e => setCardForm({ ...cardForm, website: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 text-[10px] uppercase mb-1">Office Address:</label>
                  <input
                    type="text"
                    value={cardForm.address}
                    onChange={e => setCardForm({ ...cardForm, address: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 text-[10px] uppercase mb-1">Meeting Notes / Lead Context:</label>
                <textarea
                  rows={2}
                  value={cardForm.notes}
                  onChange={e => setCardForm({ ...cardForm, notes: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowEditCardModal(false)}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 rounded-lg bg-[#0056b3] hover:bg-[#004494] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold uppercase tracking-wider text-[11px] shadow-xs flex items-center gap-2 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving Changes...</span>
                    </>
                  ) : (
                    <span>Save Changes</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LIVE AI CARD SCANNER MODAL */}
      <LiveCardScannerModal
        isOpen={showLiveScannerModal}
        onClose={() => setShowLiveScannerModal(false)}
        onCardExtracted={handleVisitingCardExtracted}
      />

      {/* RETAIL CUSTOMER STATEMENT DOSSIER MODAL */}
      <RetailCustomerStatementModal
        isOpen={showRetailStatementModal}
        onClose={() => setShowRetailStatementModal(false)}
        customer={selectedRetailCustomer}
        invoices={retailCustomerInvoices}
        isLoading={isLoadingStatement}
        onRefresh={() => {
          if (selectedRetailCustomer) openRetailCustomerStatement(selectedRetailCustomer);
        }}
      />

      {/* NEW RETAIL CUSTOMER MODAL */}
      <NewRetailCustomerModal
        isOpen={showNewRetailModal}
        onClose={() => setShowNewRetailModal(false)}
        onSuccess={saved => {
          loadRetailCustomers();
          if (saved) {
            toast.success(`Retail customer ${saved.name} (${saved.code}) registered!`);
          }
        }}
      />

      {/* PRINT DOSSIER LAYOUT (Hidden on screen, rendered on @media print) */}
      <PartyProfilePrintDossier
        party={printingParty || viewPartyData || selectedParty}
      />
    </div>
  );
};
