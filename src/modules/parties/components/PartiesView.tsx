import React, { useState, useEffect, useMemo } from 'react';
import { Party, PartyKhataLog } from '../parties.types.ts';
import {
  Users,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
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
  Calendar
} from 'lucide-react';
import { PartiesService } from '../../../services/partiesService.ts';
import { FinanceService } from '../../../services/financeService.ts';
import { SearchableSelect } from '../../../components/SearchableSelect.tsx';
import { supabase } from '../../../supabaseClient.ts';
import { LiveCardScannerModal } from './LiveCardScannerModal.tsx';
import { PartyProfilePrintDossier } from './PartyProfilePrintDossier.tsx';
import { extractVisitingCardDetails, VisitingCardOcrResult } from '../services/visitingCardOcrService.ts';

interface PartiesViewProps {
  onRefreshAll: () => void;
  currentUserRole: string;
}

export const PartiesView: React.FC<PartiesViewProps> = ({ onRefreshAll }) => {
  const [parties, setParties] = useState<Party[]>([]);
  const [filterType, setFilterType] = useState<string>('ALL');

  // Selected party for Khata statement
  const [selectedParty, setSelectedParty] = useState<Party | null>(null);
  const [khataLogs, setKhataLogs] = useState<PartyKhataLog[]>([]);

  // Double-submission protection & OCR Scanner state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showLiveScannerModal, setShowLiveScannerModal] = useState(false);
  const [scannerTargetForm, setScannerTargetForm] = useState<'NEW' | 'EDIT'>('NEW');
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);
  const [printingParty, setPrintingParty] = useState<Party | null>(null);

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
    type: 'CLIENT' as any,
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
    type: 'CLIENT' as 'CLIENT' | 'SUPPLIER' | 'AGENT',
    party_type: 'CLIENT' as 'CLIENT' | 'SUPPLIER' | 'AGENT',
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
    payableAccountId: '2110-01',
    payable_account_id: '2110-01',
    clearingAccountId: '1310-00',
    clearing_account_id: '1310-00',
    receivableAccountId: '1130-00',
    receivable_account_id: '1130-00',
    revenueAccountId: '4110-00',
    revenue_account_id: '4110-00'
  });

  const [coaAccounts, setCoaAccounts] = useState<any[]>([]);

  // Memoized options for Agent COA selection
  const agentPayableOptions = useMemo(() => {
    const list = coaAccounts
      .filter(a => a.classification === 'LIABILITY' || a.type === 'LIABILITY' || (a.code && a.code.startsWith('2')))
      .map(a => ({
        value: a.code,
        label: `${a.code} - ${a.name}`,
        badge: 'LIABILITY'
      }));

    if (!list.some(o => o.value === '2120-00')) {
      list.unshift({
        value: '2120-00',
        label: '2120-00 - Accounts Payable - Courier, Freight & Clearing Agents',
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
          value: a.code,
          label: `${a.code} - ${a.name}`,
          badge: isExp ? 'EXPENSE' : 'ASSET'
        };
      });

    if (!list.some(o => o.value === '1310-00')) {
      list.unshift({
        value: '1310-00',
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

  const loadParties = async () => {
    try {
      const data = await PartiesService.getParties();
      const safeData = (Array.isArray(data) ? data : []).map((p: any) => {
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

      // Auto-select party if none selected or if selectedParty was deleted
      if (safeData && safeData.length > 0) {
        if (!selectedParty) {
          selectParty(safeData[0]);
        } else {
          const stillThere = safeData.find((p: any) => p.id === selectedParty.id);
          if (stillThere) setSelectedParty(stillThere);
        }
      }
    } catch (err: any) {
      console.error('Failed to load parties:', err);
    }
  };

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
      const data = await FinanceService.getCoaAccounts();
      setCoaAccounts(data || []);
    } catch (err: any) {
      console.error('Failed to load COA accounts:', err);
    }
  };

  const selectParty = async (party: Party) => {
    const memoryParty = parties.find(p => p.id === party.id || String((p as any).party_id) === String((party as any).party_id)) || party;
    setSelectedParty(memoryParty);
    try {
      const logs = await PartiesService.getKhataLogs(memoryParty.id);
      setKhataLogs(logs);
    } catch (err: any) {
      console.error(err);
      setKhataLogs([]);
    }
  };

  useEffect(() => {
    loadParties();
    loadCoaAccounts();
  }, []);

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
    } else {
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
    }
    toast.success('✨ Visiting card scanned & party details auto-populated!');
  };

  const handleCardFileUpload = (e: React.ChangeEvent<HTMLInputElement>, target: 'NEW' | 'EDIT') => {
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

    const cleanName = String(partyForm.name || (partyForm as any).company_name || '').trim();
    const cleanType = String(partyForm.type || (partyForm as any).party_type || 'CLIENT').trim().toUpperCase();

    if (!cleanName) {
      toast.error('Party / Company Name cannot be empty or undefined.');
      return;
    }
    if (!cleanType) {
      toast.error('Party Entity Type cannot be empty or undefined.');
      return;
    }

    const dup = parties.find(p => p.name.trim().toLowerCase() === cleanName.toLowerCase());
    if (dup) {
      toast.error(`Duplicate Name: A party named "${cleanName}" already exists (${dup.code})! Duplicate client/supplier names are strictly prohibited.`);
      return;
    }

    setIsSubmitting(true);

    const formData = {
      name: cleanName,
      company_name: cleanName,
      party_type: cleanType,
      type: cleanType,
      phone: partyForm.phone || (partyForm as any).contact_no || null,
      trn_no: partyForm.trn_no || partyForm.trnNo || null,
      credit_limit: Number(partyForm.creditLimit ?? (partyForm as any).credit_limit ?? 0),
      inventory_account_id: (partyForm as any).inventory_account_id || null,
      payable_account_id: partyForm.payableAccountId || (partyForm as any).payable_account_id,
      clearing_account_id: partyForm.clearingAccountId || (partyForm as any).clearing_account_id,
      receivable_account_id: partyForm.receivableAccountId || (partyForm as any).receivable_account_id,
      revenue_account_id: partyForm.revenueAccountId || (partyForm as any).revenue_account_id,
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

    try {
      const { data, error } = await supabase.rpc('create_party_with_coa', {
        p_name: formData.name,
        p_type: formData.party_type,
        p_phone: formData.phone || null,
        p_trn: formData.trn_no || null,
        p_credit_limit: Number(formData.credit_limit) || 0,
        p_inventory_account_id: formData.inventory_account_id || null,
        p_expense_account: formData.clearing_account_id || null
      });

      if (error) {
        toast.error(error.message);
        console.error("Party Creation Failed:", error);
        return;
      }

      // Update party extra details (contact_person, email, address, enterprise B2B fields)
      if (data?.party_id) {
        const customMap = formData.party_type === 'AGENT' ? {
          payableAccountId: data.code || data.account_code || '2120-01',
          agentPayableAccountId: data.code || data.account_code || '2120-01',
          clearingAccountId: formData.clearing_account_id || '1310-00',
          expenseAccountId: formData.clearing_account_id || '5110-00'
        } : formData.party_type === 'SUPPLIER' ? {
          payableAccountId: data.code || data.account_code || '2110-01',
          receivableAccountId: '1130-00',
          clearingAccountId: formData.clearing_account_id || '1310-00'
        } : {
          payableAccountId: '2110-01',
          receivableAccountId: data.code || data.account_code || '1130-01',
          revenueAccountId: formData.revenue_account_id || '4110-00'
        };

        const { error: updateError } = await supabase.from('parties').update({
          contact_person: formData.contact_person,
          email: formData.email,
          address: formData.address,
          account_map: customMap,
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

      toast.success(`Created party & provisioned account ${data.code}`);
      await queryClient.invalidateQueries({ queryKey: ['parties'] });
      await queryClient.invalidateQueries({ queryKey: ['chart_of_accounts'] });

      setShowNewPartyModal(false);

      // Reset form
      setPartyForm({
        name: '',
        company_name: '',
        type: 'CLIENT',
        party_type: 'CLIENT',
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
        payableAccountId: '2110-01',
        payable_account_id: '2110-01',
        clearingAccountId: '1310-00',
        clearing_account_id: '1310-00',
        receivableAccountId: '1130-00',
        receivable_account_id: '1130-00',
        revenueAccountId: '4110-00',
        revenue_account_id: '4110-00'
      });

      onRefreshAll?.();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add party');
      console.error("Party Creation Failed:", err);
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
    setEditPartyForm({
      id: party.id,
      code: party.code,
      name: party.name || pAny.company_name || '',
      company_name: pAny.company_name || party.name || '',
      type: (party.type || pAny.party_type || 'CLIENT') as any,
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
      payableAccountId: party.accountMap?.payableAccountId || pAny.account_map?.payableAccountId || (party.type === 'SUPPLIER' ? `2110-${(party.code || '').replace(/[^A-Za-z0-9]/g, '')}` : '2110-00'),
      clearingAccountId: party.accountMap?.clearingAccountId || pAny.account_map?.clearingAccountId || '1310-00',
      receivableAccountId: party.accountMap?.receivableAccountId || pAny.account_map?.receivableAccountId || (party.type === 'CLIENT' ? `1130-${(party.code || '').replace(/[^A-Za-z0-9]/g, '')}` : '1130-00'),
      revenueAccountId: party.accountMap?.revenueAccountId || pAny.account_map?.revenueAccountId || '4110-00'
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
      return;
    }

    const dup = parties.find(p => p.id !== editPartyForm.id && (p.name || '').trim().toLowerCase() === cleanName.toLowerCase());
    if (dup) {
      showMsg(`Duplicate Name: Another party named "${cleanName}" already exists in the system (${dup.code})! Duplicate client/supplier names are prohibited.`, 'error');
      return;
    }

    setIsSubmitting(true);

    try {
      const updated = await PartiesService.updateParty(editPartyForm.id, {
        name: cleanName,
        company_name: cleanName,
        type: editPartyForm.type,
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
          payableAccountId: editPartyForm.payableAccountId,
          clearingAccountId: editPartyForm.clearingAccountId,
          receivableAccountId: editPartyForm.receivableAccountId,
          revenueAccountId: editPartyForm.revenueAccountId
        },
        account_map: {
          payableAccountId: editPartyForm.payableAccountId,
          clearingAccountId: editPartyForm.clearingAccountId,
          receivableAccountId: editPartyForm.receivableAccountId,
          revenueAccountId: editPartyForm.revenueAccountId
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

    if (!isPartyDeletable(deletingParty)) {
      showMsg("Cannot delete: This account/supplier has existing transactions. Please deactivate it instead.", "error");
      setDeleteError("Cannot delete: This account/supplier has existing transactions. Please deactivate it instead.");
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);
    try {
      await PartiesService.deleteParty(delId);

      // 1. Immediately mutate local state so the party is removed from the screen instantaneously
      setParties(prev => prev.filter(p => {
        const pId = String(p.id || (p as any).party_id || '');
        const pCode = p.code || '';
        return pId !== delId && pCode !== delCode;
      }));

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

  const filteredParties = parties.filter(p => {
    if (filterType === 'ALL') return true;
    return p.type === filterType;
  });

  return (
    <div className="space-y-3">
      {/* Top Header & Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white p-2 sm:p-2.5 rounded border border-slate-200 shadow-xs">
        <div className="flex items-center gap-1.5 flex-wrap">
          {['ALL', 'CLIENT', 'SUPPLIER', 'AGENT'].map(type => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-all ${
                filterType === type
                  ? 'bg-[#0056b3] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {type === 'ALL' ? 'All Parties' : type === 'CLIENT' ? 'Clients' : type === 'SUPPLIER' ? 'Suppliers' : 'Agents'} ({parties.filter(p => type === 'ALL' || p.type === type).length})
            </button>
          ))}
        </div>

        <button
          id="btn-add-new-party"
          onClick={() => setShowNewPartyModal(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#0056b3] hover:bg-[#004494] text-white text-xs font-bold uppercase tracking-wider shadow-xs transition-colors"
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
                        party.type === 'AGENT' ? 'bg-purple-100 text-purple-800 border border-purple-200' :
                        party.type === 'SUPPLIER' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                        'bg-blue-100 text-blue-800 border border-blue-200'
                      }`}>
                        {party.type}
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
                      {party.accountMap?.agentPayableAccountId || party.accountMap?.payableAccountId || party.accountMap?.receivableAccountId || party.coaAccountId || (party.type === 'AGENT' ? `2120-${(party.code || '').replace(/[^A-Za-z0-9]/g, '')}` : (party.type === 'SUPPLIER' ? `2110-${(party.code || '').replace(/[^A-Za-z0-9]/g, '')}` : `1130-${(party.code || '').replace(/[^A-Za-z0-9]/g, '')}`))}
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
        </div>

        {/* Khata Ledger Statement (7 cols) */}
        <div className="lg:col-span-7">
          {selectedParty ? (
            <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden space-y-3">
              <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
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
                </div>
              </div>

              {/* Linked Chart of Accounts Auto-Link Card */}
              <div className="mx-3 p-2 bg-amber-50/80 rounded border border-amber-200/80 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-300 uppercase">
                    Auto-Linked COA Khata
                  </span>
                  <span className="font-mono font-bold text-slate-800 text-[11px]">
                    {selectedParty.accountMap?.payableAccountId || selectedParty.accountMap?.receivableAccountId || selectedParty.coaAccountId || (selectedParty.type === 'SUPPLIER' ? `2110-${selectedParty.code.replace(/[^A-Za-z0-9]/g, '')}` : `1130-${selectedParty.code.replace(/[^A-Za-z0-9]/g, '')}`)} - {selectedParty.name} ({selectedParty.type === 'SUPPLIER' ? 'Supplier' : 'Customer'})
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

              {/* Transactions Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead className="bg-slate-50 text-slate-600 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Doc Ref</th>
                      <th className="px-3 py-2">Description</th>
                      <th className="px-3 py-2 text-right">Debit (Dr)</th>
                      <th className="px-3 py-2 text-right">Credit (Cr)</th>
                      <th className="px-3 py-2 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {khataLogs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-center text-slate-400 font-sans text-xs">
                          No transaction history recorded yet for this party.
                        </td>
                      </tr>
                    ) : (
                      khataLogs.map(log => (
                        <tr key={log.id} className="hover:bg-blue-50/40">
                          <td className="px-3 py-1.5 text-slate-600">{log.date}</td>
                          <td className="px-3 py-1.5 font-bold text-blue-900">{log.docRef}</td>
                          <td className="px-3 py-1.5 font-sans text-slate-700 max-w-xs truncate">{log.description}</td>
                          <td className="px-3 py-1.5 text-right font-semibold text-emerald-700">
                            {Number(log.debit || 0) > 0 ? `AED ${Number(log.debit || 0).toLocaleString()}` : '-'}
                          </td>
                          <td className="px-3 py-1.5 text-right font-semibold text-rose-700">
                            {Number(log.credit || 0) > 0 ? `AED ${Number(log.credit || 0).toLocaleString()}` : '-'}
                          </td>
                          <td className="px-3 py-1.5 text-right font-bold text-slate-900">
                            AED {Number(log.balance ?? (log as any).running_balance ?? (log as any).runningBalance ?? 0).toLocaleString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded border border-slate-200 p-8 text-center text-slate-400 text-xs">
              Select a party from the directory to view their complete Khata ledger.
            </div>
          )}
        </div>
      </div>

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
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                ✕
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
                    value={partyForm.type || (partyForm as any).party_type}
                    onChange={e => {
                      const val = e.target.value as any;
                      setPartyForm(prev => ({
                        ...prev,
                        type: val,
                        party_type: val,
                        ...(val === 'AGENT' ? {
                          payableAccountId: '2120-00',
                          payable_account_id: '2120-00',
                          clearingAccountId: '1310-00',
                          clearing_account_id: '1310-00'
                        } : val === 'SUPPLIER' ? {
                          payableAccountId: '2110-00',
                          payable_account_id: '2110-00',
                          clearingAccountId: '1310-00',
                          clearing_account_id: '1310-00'
                        } : {
                          receivableAccountId: '1130-00',
                          receivable_account_id: '1130-00',
                          revenueAccountId: '4110-00',
                          revenue_account_id: '4110-00'
                        })
                      }));
                    }}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:border-blue-500 bg-white"
                  >
                    <option value="CLIENT">Client (Customer)</option>
                    <option value="SUPPLIER">Supplier (Vendor / Sorter)</option>
                    <option value="AGENT">Clearing & Commission Agent</option>
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
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-1">Record Settlement / Khata Entry</h3>
            <p className="text-[11px] text-slate-500 mb-3">Party: {selectedParty.name}</p>

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
                    viewPartyData.type === 'CLIENT' ? 'bg-blue-100 text-blue-900 border border-blue-300' :
                    'bg-purple-100 text-purple-900 border border-purple-300'
                  }`}>
                    {viewPartyData.type}
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
                onClick={() => setShowViewPartyModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                ✕
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
                    {viewPartyData.accountMap?.agentPayableAccountId || viewPartyData.accountMap?.payableAccountId || viewPartyData.accountMap?.receivableAccountId || (viewPartyData.type === 'AGENT' ? `2120-${viewPartyData.code.replace(/[^A-Za-z0-9]/g, '')}` : (viewPartyData.type === 'SUPPLIER' ? `2110-${viewPartyData.code.replace(/[^A-Za-z0-9]/g, '')}` : `1130-${viewPartyData.code.replace(/[^A-Za-z0-9]/g, '')}`))}
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
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                ✕
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
                    value={editPartyForm.type}
                    onChange={e => setEditPartyForm({ ...editPartyForm, type: e.target.value as any })}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:border-blue-500 bg-white"
                  >
                    <option value="CLIENT">Client (Customer)</option>
                    <option value="SUPPLIER">Supplier (Vendor / Sorter)</option>
                    <option value="AGENT">Clearing & Commission Agent</option>
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
                      value={editPartyForm.payableAccountId}
                      onChange={val => setEditPartyForm({ ...editPartyForm, payableAccountId: val })}
                      options={coaAccounts.filter(a => a.classification === 'LIABILITY').map(a => ({
                        value: a.code,
                        label: `${a.code} - ${a.name}`,
                        badge: 'LIABILITY'
                      }))}
                      placeholder="Select Payable Account (2110-00)..."
                      className="w-full bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 text-[10px] uppercase mb-0.5">
                      Stock Bale Inventory / Goods Clearing (Asset):
                    </label>
                    <SearchableSelect
                      value={editPartyForm.clearingAccountId}
                      onChange={val => setEditPartyForm({ ...editPartyForm, clearingAccountId: val })}
                      options={coaAccounts.filter(a => a.classification === 'ASSET').map(a => ({
                        value: a.code,
                        label: `${a.code} - ${a.name}`,
                        badge: 'ASSET'
                      }))}
                      placeholder="Select Inventory Asset Account..."
                      className="w-full bg-white"
                    />
                  </div>
                </div>
              )}

              {editPartyForm.type === 'CLIENT' && (
                <div className="bg-blue-50/70 p-3 rounded-lg border border-blue-200 space-y-2 mt-2">
                  <div className="text-[10px] font-bold text-blue-900 uppercase flex items-center justify-between">
                    <span>🛡️ Linked COA Accounts</span>
                    <span className="text-[9px] bg-blue-200 text-blue-900 px-1.5 py-0.5 rounded font-bold">CLIENT</span>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 text-[10px] uppercase mb-0.5">
                      Accounts Receivable Account (Asset):
                    </label>
                    <SearchableSelect
                      value={editPartyForm.receivableAccountId}
                      onChange={val => setEditPartyForm({ ...editPartyForm, receivableAccountId: val })}
                      options={coaAccounts.filter(a => a.classification === 'ASSET').map(a => ({
                        value: a.code,
                        label: `${a.code} - ${a.name}`,
                        badge: 'ASSET'
                      }))}
                      placeholder="Select Receivable Account (1130-00)..."
                      className="w-full bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 text-[10px] uppercase mb-0.5">
                      Sales Revenue Account (Revenue):
                    </label>
                    <SearchableSelect
                      value={editPartyForm.revenueAccountId}
                      onChange={val => setEditPartyForm({ ...editPartyForm, revenueAccountId: val })}
                      options={coaAccounts.filter(a => a.classification === 'REVENUE').map(a => ({
                        value: a.code,
                        label: `${a.code} - ${a.name}`,
                        badge: 'REVENUE'
                      }))}
                      placeholder="Select Sales Revenue Account..."
                      className="w-full bg-white"
                    />
                  </div>
                </div>
              )}

              {editPartyForm.type === 'AGENT' && (
                <div className="bg-indigo-50/70 p-3 rounded-lg border border-indigo-200 space-y-2 mt-2">
                  <div className="text-[10px] font-bold text-indigo-900 uppercase flex items-center justify-between">
                    <span>🛡️ Linked COA Accounts</span>
                    <span className="text-[9px] bg-indigo-200 text-indigo-900 px-1.5 py-0.5 rounded font-bold">AGENT / COURIER</span>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 text-[10px] uppercase mb-0.5">
                      Accounts Payable / Agent Clearing Account (Liability):
                    </label>
                    <SearchableSelect
                      value={editPartyForm.payableAccountId || '2120-00'}
                      onChange={val => setEditPartyForm({ ...editPartyForm, payableAccountId: val })}
                      options={agentPayableOptions}
                      placeholder="Select Agent Payable (2120-00)..."
                      className="w-full bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 text-[10px] uppercase mb-0.5">
                      Default Expense / Clearing Account:
                    </label>
                    <SearchableSelect
                      value={editPartyForm.clearingAccountId || '1310-00'}
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
            <div className="bg-white rounded-lg max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
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

      {/* LIVE AI CARD SCANNER MODAL */}
      <LiveCardScannerModal
        isOpen={showLiveScannerModal}
        onClose={() => setShowLiveScannerModal(false)}
        onCardExtracted={handleVisitingCardExtracted}
      />

      {/* PRINT DOSSIER LAYOUT (Hidden on screen, rendered on @media print) */}
      <PartyProfilePrintDossier
        party={printingParty || viewPartyData || selectedParty}
      />
    </div>
  );
};
