import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { COAAccount, Voucher, LedgerEntry, FinancialStatements } from '../finance.types.ts';
import { Party } from '../../parties/parties.types.ts';
import { AccountClassification } from '../../../types/common.types.ts';
import { PrintVoucherModal } from './PrintVoucherModal.tsx';
import { BudgetingView } from './BudgetingView.tsx';
import { CustomReportBuilder } from './CustomReportBuilder.tsx';
import { RecurringVouchersView } from './RecurringVouchersView.tsx';
import { TaxComplianceView } from './TaxComplianceView.tsx';
import { CourierCODReconciliation } from './CourierCODReconciliation.tsx';
import { useSync } from '../../../context/SyncContext.tsx';
import { VoucherInputSchema, validateWithZod } from '../../../validation/schemas.ts';
import { safeFetchJson } from '../../../utils/fetchUtils.ts';
import { FinanceService } from '../../../services/financeService.ts';
import { PartiesService } from '../../../services/partiesService.ts';
import { SearchableSelect, SearchableOption, SearchableGroup } from '../../../components/SearchableSelect.tsx';
import {
  Landmark,
  FileSpreadsheet,
  Plus,
  CheckCircle,
  XCircle,
  FileText,
  DollarSign,
  Scale,
  TrendingUp,
  PieChart,
  Printer,
  Search,
  BookOpen,
  ArrowRight,
  ShieldCheck,
  Building,
  Users,
  Layers,
  FolderTree,
  Coins,
  Target,
  Repeat,
  Truck,
  Calendar,
  RefreshCw,
  Edit3,
  Trash2,
  Lock
} from 'lucide-react';
import { AccessDeniedNotice } from '../../../components/AccessDeniedNotice.tsx';
import { ModuleMaintenanceGuard } from '../../../components/ModuleMaintenanceGuard.tsx';

interface COARowProps {
  acc: COAAccount;
  isDebitNormal: boolean;
  hasTransactions: boolean;
  onViewLedger?: (accId: string) => void;
  onToggleActive?: (acc: COAAccount) => void;
  onDeleteAccount?: (acc: COAAccount) => void;
}

const COARow: React.FC<COARowProps> = React.memo(({ acc, isDebitNormal, hasTransactions, onViewLedger, onToggleActive, onDeleteAccount }) => {
  const code = (acc as any).account_code || acc.code || '';
  const name = (acc as any).account_name || acc.name || '';
  const rawType = ((acc as any).pillar_category || (acc as any).pillar || acc.type || acc.classification || acc.account_type || 'ASSET').toString().toUpperCase();
  const type = rawType === 'INCOME' ? 'REVENUE' : rawType;
  const currentBalance = typeof (acc as any).current_balance === 'number' ? (acc as any).current_balance : (Number(acc.currentBalance) || 0);
  const isMaster = code.endsWith('000-00') || !code.includes('-') || code === '1000-00' || code === '2000-00' || code === '3000-00' || code === '4000-00' || code === '5000-00';
  const isSub = code.endsWith('-00') && !isMaster;
  const computedTier = isMaster ? 1 : (isSub ? 2 : 3);
  const rawTier = Number((acc as any).tier_level || acc.tierLevel || (acc as any).account_level);
  const tierLevel = (rawTier && rawTier >= 1 && rawTier <= 5) ? rawTier : computedTier;
  const isDebit = type === 'ASSET' || type === 'EXPENSE';
  const isActive = (acc as any).status ? String((acc as any).status).toUpperCase() === 'ACTIVE' : (acc.is_active !== false && acc.isActive !== false);
  const isPartyAccount = Boolean(
    acc.party_id ||
    acc.partyId ||
    (!code.endsWith('-00') && (code.startsWith('2110-') || code.startsWith('1130-') || code.startsWith('2120-')))
  );

  const curBal = Math.abs(currentBalance);
  const isBlockedFromDelete = curBal > 0.001 || hasTransactions || tierLevel === 1;

  return (
    <tr className="hover:bg-amber-50/30 transition-colors">
      <td className="px-3.5 py-2.5 font-bold text-slate-900">
        <span className="inline-flex items-center gap-1.5">
          {tierLevel === 1 ? '📂' : tierLevel === 2 ? '📁' : '📄'}
          {code}
        </span>
      </td>
      <td className="px-3.5 py-2.5 font-sans font-medium text-slate-900">
        <span style={{ paddingLeft: `${(tierLevel - 1) * 16}px` }} className="inline-flex items-center gap-1.5 flex-wrap">
          {tierLevel > 1 && '↳ '}
          <span>{name}</span>
          {isPartyAccount && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
              🏷️ {type === 'LIABILITY' ? 'Auto-Linked Supplier Khata' : 'Auto-Linked Client Khata'}
            </span>
          )}
        </span>
      </td>
      <td className="px-3.5 py-2.5">
        <span className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase ${
          type === 'ASSET' ? 'bg-blue-100 text-blue-900' :
          type === 'LIABILITY' ? 'bg-rose-100 text-rose-900' :
          type === 'EQUITY' ? 'bg-purple-100 text-purple-900' :
          type === 'REVENUE' ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'
        }`}>
          {type}
        </span>
      </td>
      <td className="px-3.5 py-2.5 text-slate-600 font-sans text-[11px]">
        {tierLevel === 1 ? 'Tier 1: Master Folder' : tierLevel === 2 ? 'Tier 2: Sub-Folder' : 'Tier 3: Transaction Account'}
      </td>
      <td className="px-3.5 py-2.5 text-slate-700">{acc.currency || (acc as any).currency_code || 'AED'}</td>
      <td className="px-3.5 py-2.5 text-right font-bold text-slate-900">
        AED {Number(currentBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
        <span className="text-[9px] text-slate-500 ml-1 font-sans">
          ({isDebit ? 'Dr' : 'Cr'})
        </span>
      </td>
      <td className="px-3.5 py-2.5 text-center">
        <div className="flex items-center justify-center gap-1.5">
          {/* Active/Inactive Toggle */}
          <button
            type="button"
            onClick={() => onToggleActive?.(acc)}
            className={`text-[9px] font-bold px-1.5 py-0.5 rounded transition-colors cursor-pointer ${
              isActive ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
            }`}
            title={isActive ? "Active - Click to Deactivate/Archive" : "Inactive - Click to Activate"}
          >
            {isActive ? 'Active' : 'Archived'}
          </button>

          {onViewLedger && (
            <button
              type="button"
              onClick={() => onViewLedger(acc.id || (acc as any).account_id || '')}
              title="View General Ledger for this account"
              className="text-[10px] text-amber-700 hover:text-amber-900 font-bold hover:underline cursor-pointer ml-0.5"
            >
              Ledger →
            </button>
          )}

          {/* Delete or Protected Lock */}
          {isBlockedFromDelete ? (
            <button
              type="button"
              disabled
              className="p-1 rounded bg-slate-100 text-slate-400 opacity-50 cursor-not-allowed"
              title={tierLevel === 1 ? "Cannot delete: Master tier folder accounts cannot be deleted. Please deactivate it instead." : "Cannot delete: This account has existing transactions or non-zero balance. Please deactivate it instead."}
            >
              <Lock className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onDeleteAccount?.(acc)}
              className="p-1 rounded bg-slate-100 hover:bg-red-100 text-red-600 hover:text-red-800 transition-colors cursor-pointer"
              title="Delete unused account"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
});
COARow.displayName = 'COARow';

interface FinanceViewProps {
  onRefreshAll: () => void;
  currentUserRole: string;
  initialSubTab?: 'coa' | 'vouchers' | 'cod-reconciliation' | 'recurring-vouchers' | 'budgeting' | 'tax-compliance' | 'ledger' | 'trial-balance' | 'income-statement' | 'custom-reports' | 'balance-sheet';
  maintenanceModules?: Record<string, boolean>;
  companyProfile?: any;
}

interface NewVoucherLineItem {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  debitAmount: number;
  creditAmount: number;
  memo: string;
}

interface SingleVoucherLineItem {
  id: string;
  accountId: string;
  amount: number;
  memo: string;
}

export const FinanceView: React.FC<FinanceViewProps> = ({ onRefreshAll, currentUserRole, initialSubTab = 'coa', maintenanceModules, companyProfile }) => {
  const { syncVersion, acquireLock, releaseLock, notifyMutation } = useSync();

  const [subTab, setSubTabState] = useState<
    'coa' | 'vouchers' | 'cod-reconciliation' | 'recurring-vouchers' | 'budgeting' | 'tax-compliance' | 'ledger' | 'trial-balance' | 'income-statement' | 'custom-reports' | 'balance-sheet'
  >(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const sub = urlParams.get('financeSubTab') as any;
      if (sub && (currentUserRole === 'ADMIN' || sub !== 'coa')) return sub;
      const key = initialSubTab === 'ledger' ? 'vintage_ledger_subtab' : 'vintage_finance_subtab';
      const saved = localStorage.getItem(key) as any;
      if (saved && (currentUserRole === 'ADMIN' || saved !== 'coa')) return saved;
    } catch {}
    if (initialSubTab === 'coa' && currentUserRole !== 'ADMIN') return 'vouchers';
    return initialSubTab;
  });

  const setSubTab = (tab: any) => {
    setSubTabState(tab);
    try {
      const key = initialSubTab === 'ledger' ? 'vintage_ledger_subtab' : 'vintage_finance_subtab';
      localStorage.setItem(key, tab);
      const url = new URL(window.location.href);
      url.searchParams.set('financeSubTab', tab);
      window.history.replaceState({}, '', url.toString());
    } catch {}
  };

  useEffect(() => {
    if (initialSubTab) {
      if (initialSubTab === 'coa' && currentUserRole !== 'ADMIN') {
        setSubTab('vouchers');
      } else {
        setSubTab(initialSubTab);
      }
    }
  }, [initialSubTab, currentUserRole]);

  const [accounts, setAccounts] = useState<COAAccount[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [ledgers, setLedgers] = useState<LedgerEntry[]>([]);
  const [reports, setReports] = useState<FinancialStatements | null>(null);
  const [parties, setParties] = useState<Party[]>([]);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Search & Filter in COA
  const [coaFilterPillar, setCoaFilterPillar] = useState<string>('ALL');
  const [coaFilterTier, setCoaFilterTier] = useState<string>('ALL');
  const [coaSearchText, setCoaSearchText] = useState<string>('');

  // General Ledger Unified Selector
  const [glSelectedTarget, setGlSelectedTarget] = useState<string>('ALL');
  const [glSearchText, setGlSearchText] = useState<string>('');
  const [glDateFrom, setGlDateFrom] = useState<string>('2026-01-01');
  const [glDateTo, setGlDateTo] = useState<string>('2026-12-31');

  // New Account Modal state
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [newAccClassification, setNewAccClassification] = useState<AccountClassification>('ASSET');
  const [newAccTierLevel, setNewAccTierLevel] = useState<number>(2); // 2: Sub-Account, 3: Transaction Account
  const [newAccParentCode, setNewAccParentCode] = useState<string>('1000-00');
  const [newAccCode, setNewAccCode] = useState<string>('1100-00');
  const [newAccName, setNewAccName] = useState<string>('');
  const [newAccOpeningBalance, setNewAccOpeningBalance] = useState<string>('0');
  const [newAccCurrency, setNewAccCurrency] = useState<string>('AED');
  const [isSavingAccount, setIsSavingAccount] = useState(false);

  // New Voucher Modal & Line Items
  const [showNewVoucherModal, setShowNewVoucherModal] = useState(false);
  const [editingVoucherId, setEditingVoucherId] = useState<string | null>(null);
  const [editingVoucherNo, setEditingVoucherNo] = useState<string>('');
  const [voucherType, setVoucherType] = useState<any>('BPV');
  const [entryMode, setEntryMode] = useState<'SINGLE' | 'DOUBLE'>('SINGLE');
  const [primaryBankCashAccountId, setPrimaryBankCashAccountId] = useState<string>('');
  const [singleLines, setSingleLines] = useState<SingleVoucherLineItem[]>([
    { id: '1', accountId: '', amount: 0, memo: '' }
  ]);
  const [voucherNarration, setVoucherNarration] = useState('');
  const [voucherDate, setVoucherDate] = useState(new Date().toISOString().slice(0, 10));
  const [voucherLines, setVoucherLines] = useState<NewVoucherLineItem[]>([
    { id: '1', accountId: '', accountCode: '', accountName: '', debitAmount: 0, creditAmount: 0, memo: '' },
    { id: '2', accountId: '', accountCode: '', accountName: '', debitAmount: 0, creditAmount: 0, memo: '' }
  ]);
  const [voucherCurrency, setVoucherCurrency] = useState<string>('AED');
  const [voucherExchangeRate, setVoucherExchangeRate] = useState<number>(1.0);
  const [isSavingVoucher, setIsSavingVoucher] = useState(false);

  const CURRENCY_LIST = [
    { code: 'AED', name: 'AED - UAE Dirham (Base)', defaultRate: 1.0 },
    { code: 'USD', name: 'USD - US Dollar', defaultRate: 3.6725 },
    { code: 'EUR', name: 'EUR - Euro', defaultRate: 4.0 },
    { code: 'GBP', name: 'GBP - British Pound', defaultRate: 4.7 },
    { code: 'SAR', name: 'SAR - Saudi Riyal', defaultRate: 0.98 },
    { code: 'OMR', name: 'OMR - Omani Rial', defaultRate: 9.54 },
    { code: 'PKR', name: 'PKR - Pakistani Rupee', defaultRate: 0.013 },
    { code: 'INR', name: 'INR - Indian Rupee', defaultRate: 0.043 },
    { code: 'CNY', name: 'CNY - Chinese Yuan', defaultRate: 0.51 }
  ];

  const handleCurrencyChange = (newCurr: string) => {
    setVoucherCurrency(newCurr);
    if (newCurr === 'AED') {
      setVoucherExchangeRate(1.0);
    } else {
      const found = CURRENCY_LIST.find(c => c.code === newCurr);
      if (found && (voucherExchangeRate === 1.0 || !voucherExchangeRate)) {
        setVoucherExchangeRate(found.defaultRate);
      }
    }
  };

  // Auto-detect Bank & Cash accounts directly from COA (SQL)
  const bankAccounts = useMemo(() => {
    return (accounts || []).filter(a => {
      const sub = (a.sub_type || a.subType || '').toLowerCase();
      const name = (a.name || '').toLowerCase();
      const code = a.code || '';
      const type = (a.type || a.classification || '').toUpperCase();
      return type === 'ASSET' && (sub.includes('bank') || name.includes('bank') || code.startsWith('112'));
    });
  }, [accounts]);

  const cashAccounts = useMemo(() => {
    return (accounts || []).filter(a => {
      const sub = (a.sub_type || a.subType || '').toLowerCase();
      const name = (a.name || '').toLowerCase();
      const code = a.code || '';
      const type = (a.type || a.classification || '').toUpperCase();
      return type === 'ASSET' && (sub.includes('cash') || name.includes('cash') || code.startsWith('111'));
    });
  }, [accounts]);

  const bankAndCashAccounts = useMemo(() => {
    const combined = [...bankAccounts, ...cashAccounts];
    const unique = new Map<string, COAAccount>();
    combined.forEach(acc => unique.set(acc.id, acc));
    return Array.from(unique.values());
  }, [bankAccounts, cashAccounts]);

  const selectablePrimaryAccounts = useMemo(() => {
    if (voucherType === 'BPV' || voucherType === 'BRV') {
      return bankAccounts.length > 0 ? bankAccounts : bankAndCashAccounts;
    }
    if (voucherType === 'CPV' || voucherType === 'CRV') {
      return cashAccounts.length > 0 ? cashAccounts : bankAndCashAccounts;
    }
    return bankAndCashAccounts;
  }, [voucherType, bankAccounts, cashAccounts, bankAndCashAccounts]);

  const primaryAccount = useMemo(() => {
    return accounts.find(a => a.id === primaryBankCashAccountId);
  }, [accounts, primaryBankCashAccountId]);

  const primaryAccBalance = primaryAccount
    ? (typeof primaryAccount.current_balance === 'number'
        ? primaryAccount.current_balance
        : (Number(primaryAccount.currentBalance) || 0))
    : 0;

  useEffect(() => {
    if (entryMode === 'SINGLE' && selectablePrimaryAccounts.length > 0) {
      const exists = selectablePrimaryAccounts.some(a => a.id === primaryBankCashAccountId);
      if (!exists && !editingVoucherId) {
        setPrimaryBankCashAccountId(selectablePrimaryAccounts[0].id);
      }
    }
  }, [entryMode, selectablePrimaryAccounts, primaryBankCashAccountId, editingVoucherId]);

  // Print voucher modal state
  const [voucherToPrint, setVoucherToPrint] = useState<Voucher | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // Dynamic Reporting Period for SQL Reports
  const [reportPeriod, setReportPeriod] = useState<'2026' | '2025' | 'ALL' | 'CUSTOM'>('2026');
  const [reportStartDate, setReportStartDate] = useState<string>('2026-01-01');
  const [reportEndDate, setReportEndDate] = useState<string>('2026-12-31');
  const [showAllCoaAccounts, setShowAllCoaAccounts] = useState<boolean>(true);

  const handlePeriodChange = (period: '2026' | '2025' | 'ALL' | 'CUSTOM') => {
    setReportPeriod(period);
    if (period === '2026') {
      setReportStartDate('2026-01-01');
      setReportEndDate('2026-12-31');
    } else if (period === '2025') {
      setReportStartDate('2025-01-01');
      setReportEndDate('2025-12-31');
    } else if (period === 'ALL') {
      setReportStartDate('');
      setReportEndDate('');
    }
  };

  const loadData = async (customParams?: { startDate?: string; endDate?: string }) => {
    setLoading(true);
    try {
      const sDate = customParams?.startDate !== undefined ? customParams.startDate : (reportPeriod === 'ALL' ? undefined : (reportStartDate || undefined));
      const eDate = customParams?.endDate !== undefined ? customParams.endDate : (reportPeriod === 'ALL' ? undefined : (reportEndDate || undefined));

      const [coaRes, vchRes, ledRes, repRes, ptyRes] = await Promise.all([
        safeFetchJson<any>('/api/finance/coa')
          .catch(() => null)
          .then(res => {
            if (res) return res;
            return FinanceService.getCoaAccounts(true).catch(() => safeFetchJson<any>('/api/finance/coa', undefined, 3, 300));
          }),
        FinanceService.getVouchers().catch(() => safeFetchJson<Voucher[]>('/api/finance/vouchers', undefined, 3, 300)),
        FinanceService.getGeneralLedgerEntries({
          accountId: glSelectedTarget.startsWith('ACC:') ? glSelectedTarget.replace('ACC:', '') : undefined,
          partyId: glSelectedTarget.startsWith('PTY:') ? glSelectedTarget.replace('PTY:', '') : undefined,
          startDate: glDateFrom || undefined,
          endDate: glDateTo || undefined,
          search: glSearchText || undefined
        }).then(r => r.entries).catch(() => safeFetchJson<LedgerEntry[]>('/api/finance/ledgers', undefined, 3, 300)),
        FinanceService.getFinancialReports({
          startDate: sDate,
          endDate: eDate,
          asOfDate: eDate
        }).catch(() => safeFetchJson<FinancialStatements>('/api/finance/reports', undefined, 3, 300)),
        PartiesService.getParties().catch(() => safeFetchJson<Party[]>('/api/parties', undefined, 3, 300))
      ]);

      const list = Array.isArray(coaRes) ? coaRes : ((coaRes as any)?.accounts || (coaRes as any)?.coa || (coaRes as any)?.data || []);
      const finalCoa = Array.isArray(list) ? list : [];
      setAccounts(finalCoa);
      setVouchers(Array.isArray(vchRes) ? vchRes : []);
      setLedgers(Array.isArray(ledRes) ? ledRes : []);
      if (repRes) setReports(repRes);
      setParties(Array.isArray(ptyRes) ? ptyRes : []);

      // Pre-select initial accounts for default voucher lines if empty
      if (finalCoa.length >= 2) {
        setVoucherLines(prev => {
          if (!prev[0].accountId) {
            const acc0Code = (finalCoa[0] as any).account_code || finalCoa[0].code || '';
            const acc0Name = (finalCoa[0] as any).account_name || finalCoa[0].name || '';
            const acc1Code = (finalCoa[1] as any).account_code || finalCoa[1].code || '';
            const acc1Name = (finalCoa[1] as any).account_name || finalCoa[1].name || '';
            return [
              { ...prev[0], accountId: finalCoa[0].id, accountCode: acc0Code, accountName: acc0Name },
              { ...prev[1], accountId: finalCoa[1].id, accountCode: acc1Code, accountName: acc1Name }
            ];
          }
          return prev;
        });
      }
    } catch {
      // Graceful fallback
    } finally {
      setLoading(false);
    }
  };

  // Reactively re-fetch reports when reporting period or dates change
  useEffect(() => {
    if (subTab === 'trial-balance' || subTab === 'income-statement' || subTab === 'balance-sheet') {
      loadData();
    }
  }, [reportStartDate, reportEndDate, subTab]);

  // Reactively re-fetch General Ledger entries from PostgreSQL when filters change
  useEffect(() => {
    if (subTab === 'ledger') {
      FinanceService.getGeneralLedgerEntries({
        accountId: glSelectedTarget.startsWith('ACC:') ? glSelectedTarget.replace('ACC:', '') : undefined,
        partyId: glSelectedTarget.startsWith('PTY:') ? glSelectedTarget.replace('PTY:', '') : undefined,
        startDate: glDateFrom || undefined,
        endDate: glDateTo || undefined,
        search: glSearchText || undefined
      }).then(res => {
        setLedgers(res.entries || []);
      });
    }
  }, [glSelectedTarget, glDateFrom, glDateTo, glSearchText, subTab]);

  useEffect(() => {
    FinanceService.clearCoaCache();
    loadData();
  }, [syncVersion]);

  const showMsg = (text: string, type: 'success' | 'error' = 'success') => {
    setActionMessage({ type, text });
    setTimeout(() => setActionMessage(null), 5000);
  };

  // Add Account to COA
  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccCode.trim() || !newAccName.trim()) {
      showMsg('Account Code and Account Name are required', 'error');
      return;
    }

    setIsSavingAccount(true);
    try {
      const parentAcc = newAccParentCode ? accounts.find(a => a.code === newAccParentCode.trim() || a.id === newAccParentCode.trim()) : null;
      const parentId = parentAcc?.id || null;

      const created = await FinanceService.addCoaAccount({
        code: newAccCode.trim(),
        name: newAccName.trim(),
        type: newAccClassification,
        classification: newAccClassification,
        account_type: newAccClassification === 'REVENUE' ? 'INCOME' : newAccClassification,
        sub_type: '',
        subType: '',
        tierLevel: newAccTierLevel,
        parentCode: newAccParentCode.trim() || undefined,
        parentId: parentId || undefined,
        parent_id: parentId || undefined,
        currency: newAccCurrency,
        currentBalance: Number(newAccOpeningBalance) || 0,
        current_balance: Number(newAccOpeningBalance) || 0,
        isSystem: false,
        isActive: true,
        is_active: true
      });

      showMsg(`Account ${newAccCode} - ${newAccName} created successfully!`);
      setShowAddAccountModal(false);
      setNewAccName('');
      setNewAccOpeningBalance('0');
      if (created) {
        setAccounts(prev => {
          const exists = prev.some(a => a.id === created.id || a.code === created.code);
          if (exists) return prev.map(a => (a.id === created.id || a.code === created.code ? created : a));
          return [...prev, created];
        });
      }
      loadData();
      onRefreshAll();
    } catch (err: any) {
      showMsg(err.message || 'Error saving account', 'error');
    } finally {
      setIsSavingAccount(false);
    }
  };

  // Calculate accounts with transaction history from ledgers and vouchers
  const accountsWithTransactions = useMemo(() => {
    const set = new Set<string>();
    // 1. From ledgers
    (ledgers || []).forEach((l: any) => {
      if (l.accountId) set.add(String(l.accountId));
      if (l.account_id) set.add(String(l.account_id));
      if (l.code) set.add(String(l.code));
      if (l.accountCode) set.add(String(l.accountCode));
      if (l.account_code) set.add(String(l.account_code));
    });
    // 2. From vouchers
    (vouchers || []).forEach((v: any) => {
      (v.entries || []).forEach((e: any) => {
        if (e.accountId) set.add(String(e.accountId));
        if (e.account_id) set.add(String(e.account_id));
        if (e.code) set.add(String(e.code));
        if (e.accountCode) set.add(String(e.accountCode));
        if (e.account_code) set.add(String(e.account_code));
      });
    });
    return set;
  }, [ledgers, vouchers]);

  // Toggle active status for COA Account
  const handleToggleCoaActive = async (acc: COAAccount) => {
    const accId = String(acc.id || (acc as any).account_id || '').trim();
    const accCode = String((acc as any).account_code || acc.code || '').trim();
    const currentActive = acc.isActive !== false && (acc as any).is_active !== false;
    const newActive = !currentActive;

    try {
      await FinanceService.toggleCoaAccountActive(accId || accCode, newActive, accCode);
      showMsg(`Account "${accCode} - ${acc.name}" set to ${newActive ? 'Active' : 'Inactive (Archived)'}.`, 'success');
      setAccounts(prev => prev.map(a => {
        if (a.id === accId || a.code === accCode) {
          return { ...a, isActive: newActive, is_active: newActive };
        }
        return a;
      }));
      loadData();
      onRefreshAll();
    } catch (err: any) {
      showMsg(err.message || 'Failed to update account status', 'error');
    }
  };

  // Delete unused COA Account (strictly blocked if transactions or balance > 0)
  const handleDeleteCoaAccount = async (acc: COAAccount) => {
    const accId = String(acc.id || (acc as any).account_id || '').trim();
    const accCode = String((acc as any).account_code || acc.code || '').trim();
    const accName = acc.name || (acc as any).account_name || '';
    const curBal = Math.abs(Number(acc.currentBalance ?? (acc as any).current_balance ?? 0));
    const hasTx = accountsWithTransactions.has(accId) || accountsWithTransactions.has(accCode);
    const tierLevel = Number(acc.tierLevel ?? (acc as any).tier_level ?? 3);

    if (tierLevel === 1) {
      showMsg("Cannot delete: Master tier folder accounts cannot be deleted. Please deactivate it instead.", "error");
      return;
    }

    if (curBal > 0.001 || hasTx) {
      showMsg("Cannot delete: This account/supplier has existing transactions. Please deactivate it instead.", "error");
      return;
    }

    const confirmed = window.confirm(`Are you sure you want to permanently delete unused account ${accCode} - ${accName}?`);
    if (!confirmed) return;

    try {
      await FinanceService.deleteCoaAccount(accId || accCode, accCode);
      showMsg(`Account "${accCode} - ${accName}" successfully deleted.`);
      setAccounts(prev => prev.filter(a => a.id !== accId && a.code !== accCode));
      loadData();
      onRefreshAll();
    } catch (err: any) {
      showMsg(err.message || 'Failed to delete account', 'error');
    }
  };

  // Single Entry Line Helpers
  const singleEntryTotal = useMemo(() => {
    const list = Array.isArray(singleLines) ? singleLines : [];
    return list.reduce((sum, l) => sum + (Number(l?.amount) || 0), 0);
  }, [singleLines]);

  const handleAddSingleLine = () => {
    setSingleLines(prev => [
      ...prev,
      { id: String(Date.now()), accountId: '', amount: 0, memo: '' }
    ]);
  };

  const handleRemoveSingleLine = (idx: number) => {
    if (singleLines.length <= 1) {
      showMsg('Voucher requires at least one line item', 'error');
      return;
    }
    setSingleLines(prev => prev.filter((_, i) => i !== idx));
  };

  const handleUpdateSingleLine = (idx: number, field: keyof SingleVoucherLineItem, value: any) => {
    setSingleLines(prev => prev.map((l, i) => {
      if (i !== idx) return l;
      return { ...l, [field]: value };
    }));
  };

  const handleVoucherTypeChange = (newType: string) => {
    setVoucherType(newType);
    if (newType === 'JV') {
      setEntryMode('DOUBLE');
    } else if (newType === 'BPV' || newType === 'BRV') {
      setEntryMode('SINGLE');
      const isBank = bankAccounts.some(b => b.id === primaryBankCashAccountId);
      if (!isBank && bankAccounts.length > 0) {
        setPrimaryBankCashAccountId(bankAccounts[0].id);
      }
    } else if (newType === 'CPV' || newType === 'CRV') {
      setEntryMode('SINGLE');
      const isCash = cashAccounts.some(c => c.id === primaryBankCashAccountId);
      if (!isCash && cashAccounts.length > 0) {
        setPrimaryBankCashAccountId(cashAccounts[0].id);
      }
    }
  };

  const handleSwitchMode = (targetMode: 'SINGLE' | 'DOUBLE') => {
    if (voucherType === 'JV' && targetMode === 'SINGLE') {
      showMsg('Journal Voucher (JV) must use Double-Entry mode', 'error');
      return;
    }

    if (targetMode === 'DOUBLE') {
      // Sync single lines into double entry voucher lines
      if (primaryBankCashAccountId && singleEntryTotal > 0) {
        const isPayment = voucherType === 'BPV' || voucherType === 'CPV';
        const convertedLines: NewVoucherLineItem[] = [];

        singleLines.forEach((sl, idx) => {
          const acc = accounts.find(a => a.id === sl.accountId);
          convertedLines.push({
            id: String(sl.id || `line-${idx + 1}`),
            accountId: sl.accountId,
            accountCode: acc?.code || '',
            accountName: acc?.name || '',
            debitAmount: isPayment ? Number(sl.amount || 0) : 0,
            creditAmount: isPayment ? 0 : Number(sl.amount || 0),
            memo: sl.memo || voucherNarration
          });
        });

        const primaryAcc = accounts.find(a => a.id === primaryBankCashAccountId);
        convertedLines.push({
          id: `primary-bank-cash-${Date.now()}`,
          accountId: primaryBankCashAccountId,
          accountCode: primaryAcc?.code || '',
          accountName: primaryAcc?.name || '',
          debitAmount: isPayment ? 0 : Number(singleEntryTotal),
          creditAmount: isPayment ? Number(singleEntryTotal) : 0,
          memo: voucherNarration
        });

        setVoucherLines(convertedLines);
      }
      setEntryMode('DOUBLE');
    } else {
      // Switch from DOUBLE to SINGLE
      const isPayment = voucherType === 'BPV' || voucherType === 'CPV';
      if (isPayment) {
        const creditLine = voucherLines.find(l => (Number(l.creditAmount) || 0) > 0);
        const debitLines = voucherLines.filter(l => (Number(l.debitAmount) || 0) > 0);
        if (creditLine) {
          setPrimaryBankCashAccountId(creditLine.accountId);
        }
        if (debitLines.length > 0) {
          setSingleLines(debitLines.map((dl, i) => ({
            id: String(dl.id || `sline-${i}`),
            accountId: dl.accountId,
            amount: Number(dl.debitAmount || 0),
            memo: dl.memo || ''
          })));
        }
      } else {
        const debitLine = voucherLines.find(l => (Number(l.debitAmount) || 0) > 0);
        const creditLines = voucherLines.filter(l => (Number(l.creditAmount) || 0) > 0);
        if (debitLine) {
          setPrimaryBankCashAccountId(debitLine.accountId);
        }
        if (creditLines.length > 0) {
          setSingleLines(creditLines.map((cl, i) => ({
            id: String(cl.id || `sline-${i}`),
            accountId: cl.accountId,
            amount: Number(cl.creditAmount || 0),
            memo: cl.memo || ''
          })));
        }
      }
      setEntryMode('SINGLE');
    }
  };

  // Double-Entry Voucher Line Helpers
  const handleAddVoucherLine = () => {
    const nextAcc = accounts[0] || { id: '', code: '', name: '' };
    setVoucherLines([
      ...voucherLines,
      {
        id: String(Date.now()),
        accountId: nextAcc.id,
        accountCode: nextAcc.code,
        accountName: nextAcc.name,
        debitAmount: 0,
        creditAmount: 0,
        memo: ''
      }
    ]);
  };

  const handleRemoveVoucherLine = (idx: number) => {
    if (voucherLines.length <= 2) {
      showMsg('Double-entry voucher requires at least two lines', 'error');
      return;
    }
    setVoucherLines(voucherLines.filter((_, i) => i !== idx));
  };

  const handleUpdateVoucherLine = (idx: number, field: keyof NewVoucherLineItem, value: any) => {
    const updated = voucherLines.map((l, i) => {
      if (i !== idx) return l;
      if (field === 'accountId') {
        const acc = accounts.find(a => a.id === value);
        return {
          ...l,
          accountId: acc ? acc.id : value,
          accountCode: acc ? acc.code : l.accountCode,
          accountName: acc ? acc.name : l.accountName
        };
      }
      if (field === 'debitAmount') {
        const num = parseFloat(value) || 0;
        return {
          ...l,
          debitAmount: num,
          // When amount is entered in Debit, automatically clear Credit on this line!
          creditAmount: num > 0 ? 0 : l.creditAmount
        };
      }
      if (field === 'creditAmount') {
        const num = parseFloat(value) || 0;
        return {
          ...l,
          creditAmount: num,
          // When amount is entered in Credit, automatically clear Debit on this line!
          debitAmount: num > 0 ? 0 : l.debitAmount
        };
      }
      return { ...l, [field]: value };
    });
    setVoucherLines(updated);
  };

  // Calculations for total debit and credit in modal
  const safeVoucherLines = Array.isArray(voucherLines) ? voucherLines : [];
  const totalDebitSum = safeVoucherLines.reduce((acc, l) => acc + (Number(l?.debitAmount) || 0), 0);
  const totalCreditSum = safeVoucherLines.reduce((acc, l) => acc + (Number(l?.creditAmount) || 0), 0);
  const voucherDiff = Math.abs(Number((totalDebitSum - totalCreditSum).toFixed(2)));
  const isVoucherBalanced = voucherDiff === 0 && totalDebitSum > 0;

  // Create or Update multi-line Voucher with Zod validation & anti-double submission lock
  const handleCreateVoucher = async (e: React.FormEvent) => {
    e.preventDefault();

    let finalLines: { accountId: string; debitAmount: number; creditAmount: number; memo: string }[] = [];
    let finalTotalDebit = 0;
    let finalTotalCredit = 0;

    const rate = Number(voucherExchangeRate) > 0 ? Number(voucherExchangeRate) : 1.0;
    const isForeign = voucherCurrency !== 'AED';

    if (entryMode === 'SINGLE' && voucherType !== 'JV') {
      if (!primaryBankCashAccountId) {
        showMsg(`Please select a ${voucherType.startsWith('B') ? 'Bank' : 'Cash'} account from COA!`, 'error');
        return;
      }
      if (singleLines.length === 0) {
        showMsg('Please add at least one line item.', 'error');
        return;
      }
      for (let i = 0; i < singleLines.length; i++) {
        const line = singleLines[i];
        if (!line.accountId) {
          showMsg(`Please select an account for line item #${i + 1}.`, 'error');
          return;
        }
        if ((Number(line.amount) || 0) <= 0) {
          showMsg(`Amount on line item #${i + 1} must be greater than 0.`, 'error');
          return;
        }
      }
      if (singleEntryTotal <= 0) {
        showMsg('Total voucher amount must be greater than 0.', 'error');
        return;
      }

      const isPayment = voucherType === 'BPV' || voucherType === 'CPV';
      const primaryAcc = accounts.find(a => a.id === primaryBankCashAccountId);

      if (isPayment) {
        // Payment: Line items are Debited, Master Bank/Cash is Credited
        finalLines = singleLines.map(l => {
          const enteredAmt = Number(l.amount) || 0;
          const baseAmt = isForeign ? Number((enteredAmt * rate).toFixed(2)) : enteredAmt;
          const lineAcc = accounts.find(a => a.id === l.accountId);
          return {
            accountId: l.accountId,
            accountCode: lineAcc?.code || '',
            accountName: lineAcc?.name || '',
            partyId: lineAcc?.party_id || lineAcc?.partyId || undefined,
            debitAmount: baseAmt,
            creditAmount: 0,
            foreignDebit: isForeign ? enteredAmt : undefined,
            foreignCredit: undefined,
            memo: l.memo || voucherNarration
          };
        });
        const totalBase = isForeign ? Number((singleEntryTotal * rate).toFixed(2)) : Number(singleEntryTotal.toFixed(2));
        finalLines.push({
          accountId: primaryBankCashAccountId,
          accountCode: primaryAcc?.code || '',
          accountName: primaryAcc?.name || '',
          partyId: primaryAcc?.party_id || primaryAcc?.partyId || undefined,
          debitAmount: 0,
          creditAmount: totalBase,
          foreignDebit: undefined,
          foreignCredit: isForeign ? Number(singleEntryTotal.toFixed(2)) : undefined,
          memo: voucherNarration
        });
      } else {
        // Receipt: Line items are Credited, Master Bank/Cash is Debited
        finalLines = singleLines.map(l => {
          const enteredAmt = Number(l.amount) || 0;
          const baseAmt = isForeign ? Number((enteredAmt * rate).toFixed(2)) : enteredAmt;
          const lineAcc = accounts.find(a => a.id === l.accountId);
          return {
            accountId: l.accountId,
            accountCode: lineAcc?.code || '',
            accountName: lineAcc?.name || '',
            partyId: lineAcc?.party_id || lineAcc?.partyId || undefined,
            debitAmount: 0,
            creditAmount: baseAmt,
            foreignDebit: undefined,
            foreignCredit: isForeign ? enteredAmt : undefined,
            memo: l.memo || voucherNarration
          };
        });
        const totalBase = isForeign ? Number((singleEntryTotal * rate).toFixed(2)) : Number(singleEntryTotal.toFixed(2));
        finalLines.push({
          accountId: primaryBankCashAccountId,
          accountCode: primaryAcc?.code || '',
          accountName: primaryAcc?.name || '',
          partyId: primaryAcc?.party_id || primaryAcc?.partyId || undefined,
          debitAmount: totalBase,
          creditAmount: 0,
          foreignDebit: isForeign ? Number(singleEntryTotal.toFixed(2)) : undefined,
          foreignCredit: undefined,
          memo: voucherNarration
        });
      }
      finalTotalDebit = isForeign ? Number((singleEntryTotal * rate).toFixed(2)) : Number(singleEntryTotal.toFixed(2));
      finalTotalCredit = isForeign ? Number((singleEntryTotal * rate).toFixed(2)) : Number(singleEntryTotal.toFixed(2));
    } else {
      if (!isVoucherBalanced) {
        showMsg(`Voucher is out of balance by ${voucherCurrency} ${voucherDiff.toFixed(2)}. Debits must equal Credits!`, 'error');
        return;
      }
      finalLines = voucherLines.map(l => {
        const debEntered = Number(l.debitAmount) || 0;
        const credEntered = Number(l.creditAmount) || 0;
        const debBase = isForeign ? Number((debEntered * rate).toFixed(2)) : debEntered;
        const credBase = isForeign ? Number((credEntered * rate).toFixed(2)) : credEntered;
        const lineAcc = accounts.find(a => a.id === l.accountId);
        return {
          accountId: l.accountId,
          accountCode: l.accountCode || lineAcc?.code || '',
          accountName: l.accountName || lineAcc?.name || '',
          partyId: lineAcc?.party_id || lineAcc?.partyId || undefined,
          debitAmount: debBase,
          creditAmount: credBase,
          foreignDebit: isForeign && debEntered > 0 ? debEntered : undefined,
          foreignCredit: isForeign && credEntered > 0 ? credEntered : undefined,
          memo: l.memo || voucherNarration
        };
      });
      finalTotalDebit = isForeign ? Number((totalDebitSum * rate).toFixed(2)) : Number(totalDebitSum.toFixed(2));
      finalTotalCredit = isForeign ? Number((totalCreditSum * rate).toFixed(2)) : Number(totalCreditSum.toFixed(2));
    }

    const payload = {
      type: voucherType,
      date: voucherDate,
      narration: voucherNarration?.trim() ? voucherNarration.trim() : null,
      currency: voucherCurrency,
      exchangeRate: rate,
      baseCurrency: 'AED',
      foreignTotalAmount: isForeign ? (entryMode === 'SINGLE' && voucherType !== 'JV' ? Number(singleEntryTotal.toFixed(2)) : Number(totalDebitSum.toFixed(2))) : undefined,
      foreignTotalDebit: isForeign ? (entryMode === 'SINGLE' && voucherType !== 'JV' ? Number(singleEntryTotal.toFixed(2)) : Number(totalDebitSum.toFixed(2))) : undefined,
      foreignTotalCredit: isForeign ? (entryMode === 'SINGLE' && voucherType !== 'JV' ? Number(singleEntryTotal.toFixed(2)) : Number(totalCreditSum.toFixed(2))) : undefined,
      totalDebit: finalTotalDebit,
      totalCredit: finalTotalCredit,
      status: 'POSTED' as const,
      lines: finalLines
    };

    // Client-side schema validation using Zod
    const validation = validateWithZod(VoucherInputSchema, payload);
    if (validation.success === false) {
      showMsg(validation.error, 'error');
      return;
    }

    if (!acquireLock('finance-create-voucher')) {
      showMsg('A voucher creation request is already being processed...', 'error');
      return;
    }

    setIsSavingVoucher(true);
    try {
      if (editingVoucherId) {
        await FinanceService.updateVoucher(editingVoucherId, {
          ...payload,
          voucherNo: editingVoucherNo,
          status: 'POSTED'
        });
        showMsg(`Voucher ${editingVoucherNo} updated successfully in PostgreSQL!`);
        setShowNewVoucherModal(false);
        setEditingVoucherId(null);
        setEditingVoucherNo('');
        releaseLock('finance-create-voucher');
        notifyMutation('FINANCE', 'VOUCHER', 'UPDATE', editingVoucherNo);
        loadData();
        onRefreshAll();
      } else {
        const voucher = await FinanceService.addVoucher({
          ...payload,
          status: 'POSTED',
          isAuto: false
        });

        showMsg(`Voucher ${voucher.voucherNo} posted successfully to PostgreSQL General Ledger!`);
        setShowNewVoucherModal(false);
        releaseLock('finance-create-voucher');
        notifyMutation('FINANCE', 'VOUCHER', 'CREATE', voucher.voucherNo);
        loadData();
        onRefreshAll();
      }
    } catch (err: any) {
      releaseLock('finance-create-voucher');
      showMsg(err.message || 'Error saving voucher', 'error');
    } finally {
      setIsSavingVoucher(false);
    }
  };

  const isPeriodLocked = (voucherDate?: string) => {
    if (!companyProfile?.isFinancialLocked || !companyProfile?.financialLockDate || !voucherDate) return false;
    return voucherDate <= companyProfile.financialLockDate;
  };

  const handleOpenEditVoucher = (v: Voucher) => {
    if (v.isAuto || (v as any).is_auto || FinanceService.isAutoVoucher(v)) {
      showMsg('Auto-generated system vouchers cannot be edited.', 'error');
      return;
    }
    if (isPeriodLocked(v.date)) {
      showMsg(`Cannot edit: Financial period up to ${companyProfile.financialLockDate} is locked for VAT & audit compliance.`, 'error');
      return;
    }
    setEditingVoucherId(v.id);
    setEditingVoucherNo(v.voucherNo);
    const type = (v.type || 'JV') as string;
    setVoucherType(type);
    setVoucherDate(v.date || new Date().toISOString().slice(0, 10));
    setVoucherNarration(v.narration || '');
    setVoucherCurrency(v.currency || 'AED');
    setVoucherExchangeRate(Number(v.exchangeRate) > 0 ? Number(v.exchangeRate) : 1.0);

    const isForeign = (v.currency && v.currency !== 'AED');
    const linesToSet = (v.lines && v.lines.length > 0 ? v.lines : (v.entries && v.entries.length > 0 ? v.entries : [])).map((l: any, i: number) => {
      const foreignDeb = Number(l.foreignDebit ?? l.foreign_debit ?? 0);
      const foreignCred = Number(l.foreignCredit ?? l.foreign_credit ?? 0);
      const debAmt = (isForeign && foreignDeb > 0) ? foreignDeb : Number(l.debitAmount ?? l.debit ?? 0);
      const credAmt = (isForeign && foreignCred > 0) ? foreignCred : Number(l.creditAmount ?? l.credit ?? 0);
      return {
        id: String(l.id || `edit-line-${i}`),
        accountId: l.accountId || l.account_id || '',
        accountCode: l.accountCode || l.account_code || '',
        accountName: l.accountName || l.account_name || '',
        debitAmount: debAmt,
        creditAmount: credAmt,
        memo: l.memo || l.particulars || l.narration || ''
      };
    });

    if (type === 'JV') {
      setEntryMode('DOUBLE');
      if (linesToSet.length >= 2) {
        setVoucherLines(linesToSet);
      } else {
        setVoucherLines([
          { id: '1', accountId: accounts[0]?.id || '', accountCode: accounts[0]?.code || '', accountName: accounts[0]?.name || '', debitAmount: v.totalDebit || 0, creditAmount: 0, memo: v.narration || '' },
          { id: '2', accountId: accounts[1]?.id || '', accountCode: accounts[1]?.code || '', accountName: accounts[1]?.name || '', debitAmount: 0, creditAmount: v.totalCredit || 0, memo: v.narration || '' }
        ]);
      }
    } else if (type === 'BPV' || type === 'CPV') {
      const creditLine = linesToSet.find(l => l.creditAmount > 0);
      const debitLines = linesToSet.filter(l => l.debitAmount > 0);
      if (creditLine && debitLines.length > 0) {
        setEntryMode('SINGLE');
        setPrimaryBankCashAccountId(creditLine.accountId);
        setSingleLines(debitLines.map((dl, i) => ({
          id: String(dl.id || `edit-sline-${i}`),
          accountId: dl.accountId,
          amount: dl.debitAmount,
          memo: dl.memo || ''
        })));
        setVoucherLines(linesToSet);
      } else {
        setEntryMode('DOUBLE');
        setVoucherLines(linesToSet.length >= 2 ? linesToSet : [
          { id: '1', accountId: accounts[0]?.id || '', accountCode: accounts[0]?.code || '', accountName: accounts[0]?.name || '', debitAmount: v.totalDebit || 0, creditAmount: 0, memo: v.narration || '' },
          { id: '2', accountId: accounts[1]?.id || '', accountCode: accounts[1]?.code || '', accountName: accounts[1]?.name || '', debitAmount: 0, creditAmount: v.totalCredit || 0, memo: v.narration || '' }
        ]);
      }
    } else if (type === 'BRV' || type === 'CRV') {
      const debitLine = linesToSet.find(l => l.debitAmount > 0);
      const creditLines = linesToSet.filter(l => l.creditAmount > 0);
      if (debitLine && creditLines.length > 0) {
        setEntryMode('SINGLE');
        setPrimaryBankCashAccountId(debitLine.accountId);
        setSingleLines(creditLines.map((cl, i) => ({
          id: String(cl.id || `edit-sline-${i}`),
          accountId: cl.accountId,
          amount: cl.creditAmount,
          memo: cl.memo || ''
        })));
        setVoucherLines(linesToSet);
      } else {
        setEntryMode('DOUBLE');
        setVoucherLines(linesToSet.length >= 2 ? linesToSet : [
          { id: '1', accountId: accounts[0]?.id || '', accountCode: accounts[0]?.code || '', accountName: accounts[0]?.name || '', debitAmount: v.totalDebit || 0, creditAmount: 0, memo: v.narration || '' },
          { id: '2', accountId: accounts[1]?.id || '', accountCode: accounts[1]?.code || '', accountName: accounts[1]?.name || '', debitAmount: 0, creditAmount: v.totalCredit || 0, memo: v.narration || '' }
        ]);
      }
    } else {
      setEntryMode('DOUBLE');
      setVoucherLines(linesToSet);
    }

    setShowNewVoucherModal(true);
  };

  const handleDeleteVoucher = async (v: Voucher) => {
    const isAuto = Boolean(v.isAuto || (v as any).is_auto || FinanceService.isAutoVoucher(v));
    if (isPeriodLocked(v.date)) {
      showMsg(`Cannot delete: Financial period up to ${companyProfile.financialLockDate} is locked for VAT & audit compliance.`, 'error');
      return;
    }
    const confirmPrompt = isAuto
      ? `⚠️ WARNING: Voucher ${v.voucherNo} was generated by a system transaction (Commercial Invoice / Inward Sorting).\n\nDeleting it will permanently purge this voucher and all its General Ledger entries from SQL.\n\nAre you sure you want to permanently delete this voucher from the database?`
      : `Are you sure you want to permanently delete manual voucher ${v.voucherNo}? All corresponding General Ledger entries will be removed.`;

    if (!window.confirm(confirmPrompt)) {
      return;
    }
    try {
      await FinanceService.deleteVoucher(v.id, true);
      showMsg(`Voucher ${v.voucherNo} deleted successfully from SQL!`);
      notifyMutation('FINANCE', 'VOUCHER', 'DELETE', v.voucherNo);
      loadData();
      onRefreshAll();
    } catch (err: any) {
      showMsg(err?.message || 'Failed to delete voucher', 'error');
    }
  };

  const handlePostVoucher = async (voucherId: string) => {
    const lockKey = `post-voucher-${voucherId}`;
    if (!acquireLock(lockKey)) return;

    try {
      await FinanceService.updateVoucherStatus(voucherId, 'POSTED');
      showMsg('Voucher approved and posted to General Ledger!');
      notifyMutation('FINANCE', 'VOUCHER', 'POST', voucherId);
      loadData();
      onRefreshAll();
    } catch (err: any) {
      showMsg(err?.message || 'Failed to post voucher', 'error');
    } finally {
      releaseLock(lockKey);
    }
  };

  const handleUnpostVoucher = async (voucherId: string) => {
    const lockKey = `unpost-voucher-${voucherId}`;
    if (!acquireLock(lockKey)) return;

    const v = (vouchers || []).find(x => x.id === voucherId);
    if (v && isPeriodLocked(v.date)) {
      showMsg(`Cannot unpost: Financial period up to ${companyProfile.financialLockDate} is locked for VAT & audit compliance.`, 'error');
      releaseLock(lockKey);
      return;
    }

    try {
      await FinanceService.updateVoucherStatus(voucherId, 'DRAFT');
      showMsg('Voucher unposted and General Ledger postings reversed!');
      notifyMutation('FINANCE', 'VOUCHER', 'UNPOST', voucherId);
      loadData();
      onRefreshAll();
    } catch (err: any) {
      showMsg(err?.message || 'Failed to unpost voucher', 'error');
    } finally {
      releaseLock(lockKey);
    }
  };

  // Memoized Filtered COA Accounts with Natural Sorting
  const filteredAccounts = useMemo(() => {
    const safeAccountsList = Array.isArray(accounts) ? accounts : [];
    const matches = safeAccountsList.filter(acc => {
      const code = ((acc as any).account_code || acc.code || '').toString();
      const name = ((acc as any).account_name || acc.name || '').toString();
      const rawType = ((acc as any).pillar_category || (acc as any).pillar || acc.type || acc.classification || acc.account_type || '').toString().toUpperCase();
      const normAccType = rawType === 'INCOME' ? 'REVENUE' : rawType;
      const normFilter = (coaFilterPillar || 'ALL').toUpperCase();
      const effectiveFilter = normFilter === 'INCOME' ? 'REVENUE' : normFilter;

      if (effectiveFilter !== 'ALL' && normAccType !== effectiveFilter) {
        return false;
      }
      if (coaFilterTier !== 'ALL' && coaFilterTier !== '') {
        const targetTier = Number(coaFilterTier);
        const isMaster = code.endsWith('000-00') || !code.includes('-') || code === '1000-00' || code === '2000-00' || code === '3000-00' || code === '4000-00' || code === '5000-00';
        const isSub = code.endsWith('-00') && !isMaster;
        const computedTier = isMaster ? 1 : (isSub ? 2 : 3);
        const rawTier = Number((acc as any).tier_level || acc.tierLevel || (acc as any).account_level);
        const accTier = (rawTier && rawTier >= 1 && rawTier <= 5) ? rawTier : computedTier;
        if (accTier !== targetTier) {
          return false;
        }
      }
      if (coaSearchText.trim()) {
        const query = coaSearchText.toLowerCase();
        return (
          code.toLowerCase().includes(query) ||
          name.toLowerCase().includes(query) ||
          normAccType.toLowerCase().includes(query) ||
          ((acc as any).sub_type || acc.subType || '').toLowerCase().includes(query)
        );
      }
      return true;
    });

    return [...matches].sort((a, b) => {
      const codeA = ((a as any).account_code || a.code || '').toString();
      const codeB = ((b as any).account_code || b.code || '').toString();
      return codeA.localeCompare(codeB, undefined, { numeric: true });
    });
  }, [accounts, coaFilterPillar, coaFilterTier, coaSearchText]);

  // General Ledger Entries strictly queried and aggregated via PostgreSQL window functions
  const filteredLedgers = ledgers;

  // Memoized GL Totals
  const glTotals = useMemo(() => {
    const list = Array.isArray(filteredLedgers) ? filteredLedgers : [];
    const debit = list.reduce((sum, entry) => sum + (Number(entry.debit) || 0), 0);
    const credit = list.reduce((sum, entry) => sum + (Number(entry.credit) || 0), 0);
    return { debit, credit, count: list.length };
  }, [filteredLedgers]);

  // Groups for SearchableSelect in General Ledger
  const glTargetGroups: SearchableGroup[] = useMemo(() => {
    const safeAcc = Array.isArray(accounts) ? accounts : [];
    const safePty = Array.isArray(parties) ? parties : [];
    return [
      {
        label: 'Chart of Accounts (COA)',
        options: safeAcc.map(a => ({
          value: `ACC:${a.id}`,
          label: `${a.code} - ${a.name}`,
          badge: a.classification,
          badgeColor: a.classification === 'ASSET' ? 'bg-blue-100 text-blue-900 border-blue-300' :
                      a.classification === 'LIABILITY' ? 'bg-rose-100 text-rose-900 border-rose-300' :
                      a.classification === 'EQUITY' ? 'bg-purple-100 text-purple-900 border-purple-300' :
                      a.classification === 'REVENUE' ? 'bg-emerald-100 text-emerald-900 border-emerald-300' :
                      'bg-amber-100 text-amber-900 border-amber-300',
          sublabel: a.sub_type || a.subType
        }))
      },
      {
        label: 'Customers / Clients',
        options: safePty.filter(p => p.type === 'CLIENT').map(p => ({
          value: `PTY:${p.id}`,
          label: `${p.code} - ${p.name}`,
          badge: 'CLIENT',
          badgeColor: 'bg-blue-100 text-blue-900 border-blue-300',
          sublabel: p.phone ? `Phone: ${p.phone}` : undefined
        }))
      },
      {
        label: 'Suppliers / Exporters',
        options: safePty.filter(p => p.type === 'SUPPLIER').map(p => ({
          value: `PTY:${p.id}`,
          label: `${p.code} - ${p.name}`,
          badge: 'SUPPLIER',
          badgeColor: 'bg-amber-100 text-amber-900 border-amber-300',
          sublabel: p.phone ? `Phone: ${p.phone}` : undefined
        }))
      },
      {
        label: 'Clearing Agents',
        options: safePty.filter(p => p.type === 'AGENT').map(p => ({
          value: `PTY:${p.id}`,
          label: `${p.code} - ${p.name}`,
          badge: 'AGENT',
          badgeColor: 'bg-indigo-100 text-indigo-900 border-indigo-300',
          sublabel: p.phone ? `Phone: ${p.phone}` : undefined
        }))
      }
    ];
  }, [accounts, parties]);

  const glTargetFlatOptions: SearchableOption[] = useMemo(() => {
    return [
      {
        value: 'ALL',
        label: '-- All Accounts & Parties Combined --',
        badge: 'ALL',
        badgeColor: 'bg-slate-100 text-slate-800 border-slate-300'
      }
    ];
  }, []);

  // Pillars list
  const coaPillars = [
    { key: 'ASSET', code: '1000', label: '1000: ASSETS (Assets & Bank)', color: 'text-blue-900', bg: 'bg-blue-50 border-blue-200' },
    { key: 'LIABILITY', code: '2000', label: '2000: LIABILITIES (Payables & Dues)', color: 'text-rose-900', bg: 'bg-rose-50 border-rose-200' },
    { key: 'EQUITY', code: '3000', label: '3000: EQUITY (Capital & Reserves)', color: 'text-purple-900', bg: 'bg-purple-50 border-purple-200' },
    { key: 'REVENUE', code: '4000', label: '4000: REVENUE (Sales & Income)', color: 'text-emerald-900', bg: 'bg-emerald-50 border-emerald-200' },
    { key: 'EXPENSE', code: '5000', label: '5000: EXPENSES (COGS & Overheads)', color: 'text-amber-900', bg: 'bg-amber-50 border-amber-200' }
  ];

  const getPeriodLabel = () => {
    if (reportPeriod === '2026') return 'Fiscal Year 2026 (01 Jan 2026 – 31 Dec 2026)';
    if (reportPeriod === '2025') return 'Fiscal Year 2025 (01 Jan 2025 – 31 Dec 2025)';
    if (reportPeriod === 'ALL') return 'All Historical Postings (Inception to Date)';
    return `Custom Date Range (${reportStartDate || 'Start'} to ${reportEndDate || 'End'})`;
  };

  const getAsOfLabel = () => {
    if (reportPeriod === '2026') return 'As of 31 Dec 2026';
    if (reportPeriod === '2025') return 'As of 31 Dec 2025';
    if (reportPeriod === 'ALL') return 'As of Today';
    return `As of ${reportEndDate || 'Current Date'}`;
  };

  const renderReportingPeriodSelector = () => (
    <div className="flex flex-wrap items-center justify-between gap-3 bg-amber-50/60 border border-amber-200 p-3 rounded-xl mb-5 shadow-xs">
      <div className="flex items-center gap-2">
        <Calendar className="w-4 h-4 text-amber-700" />
        <span className="text-xs font-bold text-amber-950 uppercase tracking-wider">Fiscal Period:</span>
        <div className="inline-flex rounded-lg border border-amber-300 bg-white p-0.5 shadow-xs">
          {(['2026', '2025', 'ALL', 'CUSTOM'] as const).map((period) => (
            <button
              key={period}
              type="button"
              onClick={() => handlePeriodChange(period)}
              className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                reportPeriod === period
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-700 hover:text-amber-950 hover:bg-amber-100/50'
              }`}
            >
              {period === '2026' ? 'FY 2026' : period === '2025' ? 'FY 2025' : period === 'ALL' ? 'All Time' : 'Custom Dates'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {reportPeriod === 'CUSTOM' && (
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={reportStartDate}
              onChange={(e) => setReportStartDate(e.target.value)}
              className="text-xs border border-amber-300 rounded-lg px-2.5 py-1 bg-white font-mono focus:ring-2 focus:ring-amber-500"
            />
            <span className="text-xs text-amber-800 font-bold">to</span>
            <input
              type="date"
              value={reportEndDate}
              onChange={(e) => setReportEndDate(e.target.value)}
              className="text-xs border border-amber-300 rounded-lg px-2.5 py-1 bg-white font-mono focus:ring-2 focus:ring-amber-500"
            />
          </div>
        )}
        <label className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-amber-300 text-xs font-bold text-amber-950 cursor-pointer hover:bg-amber-50/80 transition-colors">
          <input
            type="checkbox"
            checked={showAllCoaAccounts}
            onChange={(e) => setShowAllCoaAccounts(e.target.checked)}
            className="rounded border-amber-300 text-amber-600 focus:ring-amber-500 w-3.5 h-3.5 cursor-pointer"
          />
          <span>Show All Accounts (Incl. Zero Balances)</span>
        </label>
        <button
          type="button"
          onClick={() => loadData()}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white border border-amber-300 text-amber-900 text-xs font-bold hover:bg-amber-100/60 transition-colors shadow-xs cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-600' : 'text-amber-700'}`} />
          <span>Refresh Database Reports</span>
        </button>
      </div>
    </div>
  );

  return (
    <div id="comprehensive-finance-module-view" className="space-y-4">
      {/* 1. TOP SUBTABS NAVIGATOR */}
      <div className="bg-white p-3 rounded-xl border border-amber-200/90 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto flex-wrap">
          {[
            ...(currentUserRole === 'ADMIN' ? [{ id: 'coa', label: 'Chart of Accounts (5 Pillars)', icon: <FolderTree className="w-3.5 h-3.5" /> }] : []),
            { id: 'vouchers', label: 'Accounting Vouchers (JV/PV/RV)', icon: <FileText className="w-3.5 h-3.5" /> },
            { id: 'cod-reconciliation', label: 'Courier COD Clearing', icon: <Truck className="w-3.5 h-3.5" /> },
            { id: 'recurring-vouchers', label: 'Recurring Vouchers', icon: <Repeat className="w-3.5 h-3.5" /> },
            { id: 'budgeting', label: 'Budgeting & Ceilings', icon: <Target className="w-3.5 h-3.5" /> },
            { id: 'ledger', label: 'General Ledger (GL)', icon: <BookOpen className="w-3.5 h-3.5" /> },
            { id: 'trial-balance', label: 'Trial Balance', icon: <Scale className="w-3.5 h-3.5" /> },
            { id: 'income-statement', label: 'Income Statement (P&L)', icon: <TrendingUp className="w-3.5 h-3.5" /> },
            { id: 'custom-reports', label: 'Custom Report Builder', icon: <FileSpreadsheet className="w-3.5 h-3.5" /> },
            { id: 'balance-sheet', label: 'Balance Sheet', icon: <Landmark className="w-3.5 h-3.5" /> },
            { id: 'tax-compliance', label: 'UAE Tax & Corporate Tax', icon: <ShieldCheck className="w-3.5 h-3.5" /> }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setSubTab(tab.id as any)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all cursor-pointer ${
                subTab === tab.id
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-amber-100/60 hover:text-amber-900'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Global Action depending on subtab */}
        <div className="flex items-center gap-2">
          {subTab === 'coa' && (
            <button
              type="button"
              onClick={() => {
                setNewAccCode('');
                setNewAccName('');
                setNewAccOpeningBalance('0');
                setShowAddAccountModal(true);
              }}
              className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs uppercase tracking-wider shadow-xs hover:shadow transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Sub / Transaction Account</span>
            </button>
          )}

          {subTab === 'vouchers' && (!maintenanceModules?.vouchers || currentUserRole === 'ADMIN') && (
            <button
              type="button"
              onClick={() => {
                setEditingVoucherId(null);
                setEditingVoucherNo('');
                setVoucherNarration('Vintage cargo port handling & customs duty adjustment');
                setVoucherDate(new Date().toISOString().slice(0, 10));
                if (accounts.length >= 2) {
                  setVoucherLines([
                    { id: '1', accountId: accounts[0].id, accountCode: accounts[0].code, accountName: accounts[0].name, debitAmount: 0, creditAmount: 0, memo: '' },
                    { id: '2', accountId: accounts[1].id, accountCode: accounts[1].code, accountName: accounts[1].name, debitAmount: 0, creditAmount: 0, memo: '' }
                  ]);
                }
                setShowNewVoucherModal(true);
              }}
              className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs uppercase tracking-wider shadow-xs hover:shadow transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Post New Voucher</span>
            </button>
          )}

          {(subTab === 'trial-balance' || subTab === 'income-statement' || subTab === 'balance-sheet' || subTab === 'ledger') && (
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3 py-1.5 rounded-lg border border-amber-300 bg-white hover:bg-amber-50 text-amber-900 font-bold text-xs uppercase tracking-wider shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer print:hidden"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Statement</span>
            </button>
          )}
        </div>
      </div>

      {actionMessage && (
        <div
          className={`p-3 rounded-xl text-xs font-semibold flex items-center justify-between animate-in fade-in duration-200 ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
              : 'bg-rose-50 text-rose-800 border border-rose-300'
          }`}
        >
          <span>{actionMessage.text}</span>
          <button onClick={() => setActionMessage(null)} className="text-slate-700 hover:text-slate-900 font-bold">✕</button>
        </div>
      )}

      {/* ========================================================
          SUBTAB 1: 5 BASIC PILLARS OF CHART OF ACCOUNTS (COA)
          ======================================================== */}
      {subTab === 'coa' && (
        currentUserRole !== 'ADMIN' ? (
          <AccessDeniedNotice
            moduleName="Chart of Accounts (COA) Configuration"
            currentRole={currentUserRole}
            onGoDashboard={() => setSubTab('vouchers')}
          />
        ) : (
        <div className="space-y-4">
          {/* 5 Pillars Summary Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
            {coaPillars.map(p => {
              const safeAcc = Array.isArray(accounts) ? accounts : [];
              const pKey = p.key.toUpperCase();
              const normKey = pKey === 'INCOME' ? 'REVENUE' : pKey;
              const pillarAccounts = safeAcc.filter(a => {
                const t = ((a as any).pillar_category || (a as any).pillar || a.type || a.classification || a.account_type || '').toString().toUpperCase();
                const normT = t === 'INCOME' ? 'REVENUE' : t;
                return normT === normKey;
              });
              const count = pillarAccounts.length;
              const totalVal = pillarAccounts
                .reduce((sum, a) => sum + (typeof (a as any).current_balance === 'number' ? (a as any).current_balance : (Number(a.currentBalance) || 0)), 0);

              const isSelected = coaFilterPillar === p.key;

              return (
                <div
                  key={p.key}
                  onClick={() => setCoaFilterPillar(isSelected ? 'ALL' : p.key)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer ${
                    isSelected ? 'ring-2 ring-amber-500 bg-white shadow-sm' : `${p.bg} hover:shadow-2xs`
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                    <span>{p.code}</span>
                    <span>{count} Accounts</span>
                  </div>
                  <div className={`font-serif font-black text-xs ${p.color} mb-1`}>
                    {p.key}
                  </div>
                  <div className="font-mono text-sm font-bold text-slate-900">
                    AED {Number(totalVal || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Search and Filters */}
          <div className="bg-white p-3 rounded-xl border border-amber-200/90 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={coaSearchText}
                onChange={e => setCoaSearchText(e.target.value)}
                placeholder="Search by code (e.g. 1110) or title (e.g. Cash in Vault)..."
                className="w-full text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 font-sans"
              />
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-700 font-bold uppercase">Filter Pillar:</span>
                <select
                  value={coaFilterPillar}
                  onChange={e => setCoaFilterPillar(e.target.value)}
                  className="text-xs border border-slate-300 rounded-lg px-2.5 py-1 bg-white font-medium focus:ring-2 focus:ring-amber-500"
                >
                  <option value="ALL">All 5 Pillars ({accounts.length})</option>
                  <option value="ASSET">1000 - ASSETS</option>
                  <option value="LIABILITY">2000 - LIABILITIES</option>
                  <option value="EQUITY">3000 - EQUITY</option>
                  <option value="REVENUE">4000 - REVENUE</option>
                  <option value="EXPENSE">5000 - EXPENSES</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-700 font-bold uppercase">Tier Level:</span>
                <select
                  value={coaFilterTier}
                  onChange={e => setCoaFilterTier(e.target.value)}
                  className="text-xs border border-slate-300 rounded-lg px-2.5 py-1 bg-white font-medium focus:ring-2 focus:ring-amber-500"
                >
                  <option value="ALL">All Tiers ({accounts.length})</option>
                  <option value="1">Tier 1: Master Folders</option>
                  <option value="2">Tier 2: Sub-Folders</option>
                  <option value="3">Tier 3: Transaction Accounts</option>
                </select>
              </div>
            </div>
          </div>

          {/* Accounts Hierarchical Table */}
          <div className="bg-white rounded-xl border border-amber-200/90 shadow-xs overflow-hidden">
            <div className="p-3.5 border-b border-amber-200/70 bg-amber-50/50 flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-2">
                <FolderTree className="w-4 h-4 text-amber-600" />
                <span>Chart of Accounts Directory ({filteredAccounts.length} accounts found)</span>
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-700 hidden md:inline">Tier 2 = Sub-Account Group | Tier 3 = Transaction Level</span>
                <button
                  type="button"
                  onClick={() => {
                    const defaultRoot = accounts.find(a => ((a as any).account_code || a.code) === '1000-00') || accounts[0];
                    setNewAccClassification(((defaultRoot as any)?.pillar_category || defaultRoot?.classification || 'ASSET') as AccountClassification);
                    setNewAccTierLevel(2);
                    setNewAccParentCode((defaultRoot as any)?.account_code || defaultRoot?.code || '1000-00');
                    setNewAccCode('');
                    setNewAccName('');
                    setNewAccOpeningBalance('0');
                    setShowAddAccountModal(true);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs uppercase tracking-wider shadow-xs hover:shadow transition-all flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Naya Khata Kholain</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-600 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="px-3.5 py-2.5">Account Code</th>
                    <th className="px-3.5 py-2.5">Account Name / Title</th>
                    <th className="px-3.5 py-2.5">Pillar Category</th>
                    <th className="px-3.5 py-2.5">Tier Level</th>
                    <th className="px-3.5 py-2.5">Currency</th>
                    <th className="px-3.5 py-2.5 text-right">Current Balance</th>
                    <th className="px-3.5 py-2.5 text-center">Status / Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {filteredAccounts.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3.5 py-8 text-center text-slate-400 font-sans text-xs">
                        No accounts found in Chart of Accounts database.
                      </td>
                    </tr>
                  ) : (
                    filteredAccounts.map(acc => {
                      const accId = String(acc.id || (acc as any).account_id || '');
                      const accCode = String((acc as any).account_code || acc.code || '');
                      const hasTx = accountsWithTransactions.has(accId) || accountsWithTransactions.has(accCode);

                      return (
                        <COARow
                          key={acc.id || (acc as any).account_id || (acc as any).account_code || acc.code}
                          acc={acc}
                          isDebitNormal={
                            (((acc as any).pillar_category || (acc as any).pillar || acc.type || acc.classification || '').toString().toUpperCase()) === 'ASSET' ||
                            (((acc as any).pillar_category || (acc as any).pillar || acc.type || acc.classification || '').toString().toUpperCase()) === 'EXPENSE'
                          }
                          hasTransactions={hasTx}
                          onViewLedger={(accId) => {
                            setGlSelectedTarget(accId);
                            setSubTab('ledger');
                          }}
                          onToggleActive={handleToggleCoaActive}
                          onDeleteAccount={handleDeleteCoaAccount}
                        />
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        )
      )}

      {/* ========================================================
          SUBTAB 2: VOUCHERS (JV / BPV / BRV / CPV / CRV)
          ======================================================== */}
      {subTab === 'vouchers' && (
        <ModuleMaintenanceGuard
          moduleKey="vouchers"
          moduleName="Financial Vouchers Register"
          currentUserRole={currentUserRole}
          maintenanceModules={maintenanceModules}
        >
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-amber-200/90 shadow-xs overflow-hidden">
              <div className="p-3.5 border-b border-amber-200/70 bg-amber-50/50 flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-2">
                  <FileText className="w-4 h-4 text-amber-600" />
                  <span>Financial Vouchers Register {Array.isArray(vouchers) ? `(${vouchers.length} records)` : ''}</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setEditingVoucherId(null);
                    setEditingVoucherNo('');
                    setVoucherType('BPV');
                    setEntryMode('SINGLE');
                    const defaultBank = bankAccounts[0]?.id || (accounts.find(a => a.code.startsWith('112') || (a.name || '').toLowerCase().includes('bank'))?.id) || '';
                    setPrimaryBankCashAccountId(defaultBank);
                    setVoucherDate(new Date().toISOString().slice(0, 10));
                    setVoucherNarration('');
                    setVoucherCurrency('AED');
                    setVoucherExchangeRate(1.0);
                    setSingleLines([
                      { id: '1', accountId: '', amount: 0, memo: '' }
                    ]);
                    setVoucherLines([
                      { id: '1', accountId: '', accountCode: '', accountName: '', debitAmount: 0, creditAmount: 0, memo: '' },
                      { id: '2', accountId: '', accountCode: '', accountName: '', debitAmount: 0, creditAmount: 0, memo: '' }
                    ]);
                    setShowNewVoucherModal(true);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs uppercase tracking-wider shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Accounting Voucher</span>
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 text-slate-600 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="px-3.5 py-2.5">Voucher No</th>
                      <th className="px-3.5 py-2.5">Type</th>
                      <th className="px-3.5 py-2.5">Date</th>
                      <th className="px-3.5 py-2.5">Narration / Particulars</th>
                      <th className="px-3.5 py-2.5 text-right">Debit (AED)</th>
                      <th className="px-3.5 py-2.5 text-right">Credit (AED)</th>
                      <th className="px-3.5 py-2.5 text-center">Status</th>
                      <th className="px-3.5 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {(Array.isArray(vouchers) ? vouchers : []).map(v => {
                      const isAuto = Boolean(v.isAuto || (v as any).is_auto || FinanceService.isAutoVoucher(v));
                      const isLocked = isPeriodLocked(v.date);
                      return (
                        <tr key={v.id} className="hover:bg-amber-50/40 transition-colors">
                          <td className="px-3.5 py-2 font-bold text-amber-900">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span>{v.voucherNo}</span>
                              {isAuto ? (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-100 text-purple-800 border border-purple-200" title="System Auto Generated (Locked)">
                                  Auto
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-200" title="Manual Posted Voucher">
                                  Manual
                                </span>
                              )}
                              {isLocked && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-100 text-rose-800 border border-rose-200 inline-flex items-center gap-0.5" title={`Financial period locked up to ${companyProfile?.financialLockDate} for UAE VAT and audit compliance`}>
                                  <Lock className="w-2.5 h-2.5" /> Locked
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3.5 py-2">
                            <div className="flex items-center gap-1">
                              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-bold">
                                {v.type}
                              </span>
                              {v.currency && v.currency !== 'AED' && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-blue-100 text-blue-800 border border-blue-200" title={`Foreign Currency: ${v.currency} @ ${v.exchangeRate}`}>
                                  {v.currency}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3.5 py-2 text-slate-600">{v.date}</td>
                          <td className="px-3.5 py-2 max-w-xs text-slate-800" title={v.narration || ''}>
                            {v.narration ? (
                              <div className="truncate">{v.narration}</div>
                            ) : (
                              <div className="text-[11px] text-slate-700">
                                {(v.lines || v.entries || []).map((l: any, i: number) => {
                                  const name = l.accountName || l.account_name || accounts.find(a => a.id === (l.accountId || l.account_id))?.name || '';
                                  if (!name) return null;
                                  const dr = Number(l.debitAmount ?? l.debit ?? 0);
                                  const cr = Number(l.creditAmount ?? l.credit ?? 0);
                                  return (
                                    <span key={i} className="inline-block mr-1">
                                      <span className="font-semibold text-slate-900">{name}</span>
                                      <span className="text-[10px] text-slate-500"> ({dr > 0 ? `Dr ${dr}` : `Cr ${cr}`})</span>
                                      {i < (v.lines || v.entries || []).length - 1 ? ' • ' : ''}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                          <td className="px-3.5 py-2 text-right font-bold text-slate-900">
                            <div>{Number(v.totalDebit || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                            {v.currency && v.currency !== 'AED' && (
                              <div className="text-[10px] font-normal text-blue-600">
                                {v.currency} {Number(v.foreignTotalDebit ?? v.foreignTotalAmount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </div>
                            )}
                          </td>
                          <td className="px-3.5 py-2 text-right font-bold text-slate-900">
                            <div>{Number(v.totalCredit || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                            {v.currency && v.currency !== 'AED' && (
                              <div className="text-[10px] font-normal text-blue-600">
                                {v.currency} {Number(v.foreignTotalCredit ?? v.foreignTotalAmount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </div>
                            )}
                          </td>
                          <td className="px-3.5 py-2 text-center">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                v.status === 'POSTED'
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {v.status}
                            </span>
                          </td>
                          <td className="px-3.5 py-2 text-right flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setVoucherToPrint(v)}
                              className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] uppercase tracking-wider inline-flex items-center gap-1 cursor-pointer"
                              title="Print Voucher"
                            >
                              <Printer className="w-3 h-3" />
                              <span>Print</span>
                            </button>
                            {!isLocked && (
                              <>
                                {!isAuto && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditVoucher(v)}
                                    className="px-2 py-1 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[10px] uppercase tracking-wider border border-blue-200 inline-flex items-center gap-1 cursor-pointer"
                                    title="Edit Manual Voucher"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                    <span>Edit</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleDeleteVoucher(v)}
                                  className={`px-2 py-1 rounded ${
                                    isAuto
                                      ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-300'
                                      : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
                                  } font-bold text-[10px] uppercase tracking-wider border inline-flex items-center gap-1 cursor-pointer`}
                                  title={isAuto ? "Delete System Voucher from SQL" : "Delete Manual Voucher"}
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>Delete</span>
                                </button>
                              </>
                            )}
                            {v.status === 'POSTED' && !isAuto && !isLocked && (
                              <button
                                type="button"
                                onClick={() => handleUnpostVoucher(v.id)}
                                className="px-2 py-1 rounded bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-[10px] uppercase tracking-wider border border-amber-300 inline-flex items-center gap-1 cursor-pointer"
                                title="Unpost Voucher (Reverses General Ledger impact to DRAFT)"
                              >
                                <XCircle className="w-3 h-3 text-amber-700" />
                                <span>Unpost</span>
                              </button>
                            )}
                            {v.status !== 'POSTED' && !isAuto && !isLocked && (
                              <button
                                type="button"
                                onClick={() => handlePostVoucher(v.id)}
                                className="px-2 py-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-[10px] uppercase tracking-wider border border-emerald-300 inline-flex items-center gap-1 cursor-pointer"
                                title="Post Voucher to General Ledger"
                              >
                                <CheckCircle className="w-3 h-3 text-emerald-600" />
                                <span>Post</span>
                              </button>
                            )}
                            {isLocked && !isAuto && (
                              <span className="px-2 py-1 rounded bg-slate-100 text-slate-400 font-bold text-[10px] uppercase tracking-wider border border-slate-200 inline-flex items-center gap-1" title="Locked by Accounting Period Lock">
                                <Lock className="w-3 h-3" />
                                <span>Locked</span>
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </ModuleMaintenanceGuard>
      )}

      {/* ========================================================
          SUBTAB 3: GENERAL LEDGER (GL) WITH UNIVERSAL SEARCH
          ======================================================== */}
      {subTab === 'ledger' && (
        <div className="space-y-4">
          {/* Universal Search and Filter Card */}
          <div className="bg-white p-4 rounded-xl border border-amber-200/90 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-amber-100">
              <span className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-amber-600" />
                <span>General Ledger Search & Account Selection</span>
              </span>
              <span className="text-[11px] text-slate-500">
                Filter by any Customer, Supplier, Agent, or COA Account
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Target Dropdown: COA / Clients / Suppliers / Agents */}
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Target Account / Party:
                </label>
                <SearchableSelect
                  value={glSelectedTarget}
                  onChange={val => setGlSelectedTarget(val || 'ALL')}
                  options={glTargetFlatOptions}
                  groups={glTargetGroups}
                  placeholder="Select Account or Party..."
                  searchPlaceholder="Search account, code (e.g. 2110), party, or supplier..."
                  className="w-full font-mono font-bold text-xs"
                />
              </div>

              {/* Text Search */}
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Filter Narrative / Ref:
                </label>
                <input
                  type="text"
                  value={glSearchText}
                  onChange={e => setGlSearchText(e.target.value)}
                  placeholder="e.g. JV-2026, customs, boutique..."
                  className="w-full text-xs px-2.5 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* Date From */}
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  From Date:
                </label>
                <input
                  type="date"
                  value={glDateFrom}
                  onChange={e => setGlDateFrom(e.target.value)}
                  className="w-full text-xs px-2.5 py-2 border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* Date To */}
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  To Date:
                </label>
                <input
                  type="date"
                  value={glDateTo}
                  onChange={e => setGlDateTo(e.target.value)}
                  className="w-full text-xs px-2.5 py-2 border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>
          </div>

          {/* Ledger Table */}
          <div className="bg-white rounded-xl border border-amber-200/90 shadow-xs overflow-hidden">
            <div className="p-3.5 border-b border-amber-200/70 bg-amber-50/50 flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                Chronological Ledger Statement ({filteredLedgers.length} postings)
              </span>
              <div className="text-xs font-mono font-bold text-slate-800 space-x-4">
                <span>Total Debits: <strong className="text-emerald-800">AED {Number(glTotals.debit || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></span>
                <span>Total Credits: <strong className="text-rose-800">AED {Number(glTotals.credit || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-600 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="px-3.5 py-2.5">Date</th>
                    <th className="px-3.5 py-2.5">Voucher No</th>
                    <th className="px-3.5 py-2.5">Account Code</th>
                    <th className="px-3.5 py-2.5">Account Title</th>
                    <th className="px-3.5 py-2.5">Narration</th>
                    <th className="px-3.5 py-2.5 text-right">Debit (AED)</th>
                    <th className="px-3.5 py-2.5 text-right">Credit (AED)</th>
                    <th className="px-3.5 py-2.5 text-right">Running Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {filteredLedgers.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-500 font-sans">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <BookOpen className="w-8 h-8 text-amber-500/70" />
                          <p className="font-bold text-slate-800 text-sm">No General Ledger postings found</p>
                          <p className="text-xs text-slate-500 max-w-md">
                            No ledger entries match the selected filters or date range ({glDateFrom} to {glDateTo}).
                          </p>
                          <button
                            onClick={() => {
                              setGlSelectedTarget('ALL');
                              setGlSearchText('');
                              setGlDateFrom('');
                              setGlDateTo('');
                            }}
                            className="mt-2 text-xs bg-amber-100 text-amber-900 px-3 py-1.5 rounded-lg font-bold hover:bg-amber-200 transition-colors shadow-xs cursor-pointer"
                          >
                            Reset GL Filters & Show All Time
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    (filteredLedgers || []).map(l => (
                      <tr key={l.id} className="hover:bg-amber-50/30 transition-colors">
                        <td className="px-3.5 py-2 text-slate-600">{l.date}</td>
                        <td className="px-3.5 py-2 font-bold text-slate-900">{l.voucherNo || '-'}</td>
                        <td className="px-3.5 py-2 font-bold text-amber-900">{l.accountCode}</td>
                        <td className="px-3.5 py-2 font-sans text-slate-800">{l.accountName}</td>
                        <td className="px-3.5 py-2 font-sans text-slate-600 truncate max-w-xs">{l.narration}</td>
                        <td className="px-3.5 py-2 text-right font-bold text-slate-900">
                          {Number(l.debit || 0) > 0 ? Number(l.debit || 0).toFixed(2) : '-'}
                        </td>
                        <td className="px-3.5 py-2 text-right font-bold text-slate-900">
                          {Number(l.credit || 0) > 0 ? Number(l.credit || 0).toFixed(2) : '-'}
                        </td>
                        <td className="px-3.5 py-2 text-right font-black text-amber-950">
                          AED {Number(l.runningBalance ?? (l as any).balance ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          SUBTAB 4: TRIAL BALANCE
          ======================================================== */}
      {subTab === 'trial-balance' && (
        <div className="space-y-4 w-full">
          {renderReportingPeriodSelector()}

          <div className="bg-white rounded-xl border border-amber-200/90 shadow-xs p-5 w-full">
            <div className="text-center pb-4 mb-4 border-b border-amber-200">
              <h3 className="font-serif font-black text-base uppercase tracking-wider text-amber-950">
                VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C
              </h3>
              <div className="font-serif font-bold text-sm text-slate-800 uppercase tracking-widest mt-0.5">
                AUDITED TRIAL BALANCE
              </div>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                Financial Period: {getPeriodLabel()} &bull; Currency: AED (UAE Dirham)
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-amber-100/70 border-y border-amber-300 font-bold uppercase text-[10px] text-amber-950 tracking-wider">
                    <th className="py-2.5 px-3 text-left">Code</th>
                    <th className="py-2.5 px-3 text-left">Account Title</th>
                    <th className="py-2.5 px-3 text-left">Pillar Classification</th>
                    <th className="py-2.5 px-3 text-right">Debit Balance (AED)</th>
                    <th className="py-2.5 px-3 text-right">Credit Balance (AED)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {(reports?.trialBalance || []).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400 font-sans">
                        No transactions recorded for the selected period ({getPeriodLabel()}).
                      </td>
                    </tr>
                  ) : (
                    (reports?.trialBalance || []).filter((r: any) => !r.accountCode?.endsWith('-00')).map((row, idx) => (
                      <tr key={idx} className="hover:bg-amber-50/40">
                        <td className="py-2 px-3 font-bold text-slate-900">{row.accountCode}</td>
                        <td className="py-2 px-3 font-sans font-medium text-slate-900">{row.accountName}</td>
                        <td className="py-2 px-3 text-slate-600 uppercase text-[10px]">{row.classification}</td>
                        <td className="py-2 px-3 text-right font-bold text-slate-900">
                          {Number(row.debit || 0) > 0 ? Number(row.debit || 0).toFixed(2) : '-'}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-slate-900">
                          {Number(row.credit || 0) > 0 ? Number(row.credit || 0).toFixed(2) : '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-amber-900/60 bg-amber-50 font-mono font-black text-xs text-amber-950">
                    <td colSpan={3} className="py-3 px-3 uppercase text-right font-sans">
                      Trial Balance Grand Totals:
                    </td>
                    <td className="py-3 px-3 text-right">
                      AED {Number((reports as any)?.trialBalanceMeta?.totalDebit ?? (Array.isArray(reports?.trialBalance) ? reports.trialBalance : []).reduce((sum, r) => sum + (Number(r.debit) || 0), 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-3 text-right">
                      AED {Number((reports as any)?.trialBalanceMeta?.totalCredit ?? (Array.isArray(reports?.trialBalance) ? reports.trialBalance : []).reduce((sum, r) => sum + (Number(r.credit) || 0), 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="mt-4 pt-3 border-t border-amber-200 flex items-center justify-between text-xs">
              <div className={`flex items-center gap-1.5 font-bold font-sans ${
                ((reports as any)?.trialBalanceMeta?.isBalanced ?? true) ? 'text-emerald-800' : 'text-rose-800'
              }`}>
                <ShieldCheck className="w-4 h-4" />
                <span>
                  {((reports as any)?.trialBalanceMeta?.isBalanced ?? true)
                    ? 'Verification: Debit and Credit columns equal. General Ledger balanced to zero discrepancy.'
                    : `Discrepancy: Trial balance out of balance by AED ${Number((reports as any)?.trialBalanceMeta?.difference || 0).toFixed(2)}`}
                </span>
              </div>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 print:hidden cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Trial Balance</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          SUBTAB 5: INCOME STATEMENT (P&L)
          ======================================================== */}
      {subTab === 'income-statement' && (
        <div className="space-y-4 w-full">
          {renderReportingPeriodSelector()}

          <div className="bg-white rounded-xl border border-amber-200/90 shadow-xs p-6 w-full">
            <div className="text-center pb-4 mb-4 border-b border-amber-200">
              <h3 className="font-serif font-black text-base uppercase tracking-wider text-amber-950">
                VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C
              </h3>
              <div className="font-serif font-bold text-sm text-slate-800 uppercase tracking-widest mt-0.5">
                STATEMENT OF PROFIT OR LOSS (INCOME STATEMENT)
              </div>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                Financial Period: {getPeriodLabel()} &bull; Currency: AED (UAE Dirham)
              </p>
            </div>

            <div className="space-y-6 font-mono text-xs">
              {/* 1. Operating Revenue */}
              <div className="space-y-2">
                <div className="bg-emerald-50/80 p-2.5 rounded-lg font-bold text-emerald-950 uppercase tracking-wider flex justify-between font-sans border border-emerald-200">
                  <span className="flex items-center gap-1.5">
                    <span>1. Operating Revenue</span>
                  </span>
                  <span className="font-mono text-sm font-black text-emerald-900">
                    AED {Number(reports?.incomeStatement?.revenue?.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>

                {/* Sub-categories or flat accounts */}
                {(() => {
                  const salesAccs = (reports?.incomeStatement?.revenue?.categories?.sales?.accounts || []).filter((a: any) => !a.code?.endsWith('-00') && (showAllCoaAccounts || Number(a.balance || 0) !== 0));
                  const otherAccs = (reports?.incomeStatement?.revenue?.categories?.otherIncome?.accounts || []).filter((a: any) => !a.code?.endsWith('-00') && (showAllCoaAccounts || Number(a.balance || 0) !== 0));
                  const allRev = (reports?.incomeStatement?.revenue?.accounts || []).filter((a: any) => !a.code?.endsWith('-00') && (showAllCoaAccounts || Number(a.balance || 0) !== 0));

                  if (reports?.incomeStatement?.revenue?.categories) {
                    return (
                      <div className="space-y-3 pl-2 pr-1">
                        {/* 1A. Sales Revenue */}
                        <div>
                          <div className="flex justify-between items-center text-[11px] font-sans font-bold text-emerald-900 border-b border-emerald-100 pb-1">
                            <span>1.1 Retail POS, Live Stream & Wholesale Sales</span>
                            <span>AED {Number(reports?.incomeStatement?.revenue?.categories?.sales?.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                          </div>
                          <div className="divide-y divide-slate-100 pl-3">
                            {salesAccs.length === 0 ? (
                              <div className="py-1.5 text-slate-400 font-sans italic text-xs">No sales accounts recorded in this period</div>
                            ) : (
                              salesAccs.map((a: any, i: number) => (
                                <div key={i} className="py-1.5 flex justify-between hover:bg-emerald-50/20">
                                  <span className="font-sans text-slate-800">{a.code} - {a.name}</span>
                                  <span className="font-bold text-slate-900">AED {Number(a.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        {/* 1B. Other Operating Revenue */}
                        {otherAccs.length > 0 && (
                          <div>
                            <div className="flex justify-between items-center text-[11px] font-sans font-bold text-emerald-900 border-b border-emerald-100 pb-1">
                              <span>1.2 Packaging & Delivery Revenue</span>
                              <span>AED {Number(reports?.incomeStatement?.revenue?.categories?.otherIncome?.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div className="divide-y divide-slate-100 pl-3">
                              {otherAccs.map((a: any, i: number) => (
                                <div key={i} className="py-1.5 flex justify-between hover:bg-emerald-50/20">
                                  <span className="font-sans text-slate-800">{a.code} - {a.name}</span>
                                  <span className="font-bold text-slate-900">AED {Number(a.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div className="divide-y divide-slate-100 pl-3">
                      {allRev.map((a: any, i: number) => (
                        <div key={i} className="py-1.5 flex justify-between hover:bg-emerald-50/20">
                          <span className="font-sans text-slate-800">{a.code} - {a.name}</span>
                          <span className="font-bold text-slate-900">AED {Number(a.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {/* 2. Cost of Goods Sold (COGS) */}
              <div className="space-y-2">
                <div className="bg-amber-50/80 p-2.5 rounded-lg font-bold text-amber-950 uppercase tracking-wider flex justify-between font-sans border border-amber-200">
                  <span className="flex items-center gap-1.5">
                    <span>2. Cost of Goods Sold (Bulk Bales, Sorting & Direct Imports)</span>
                  </span>
                  <span className="font-mono text-sm font-black text-amber-900">
                    AED {Number(reports?.incomeStatement?.cogs?.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="divide-y divide-slate-100 pl-4 pr-2">
                  {(() => {
                    const cogsAccs = (reports?.incomeStatement?.cogs?.accounts || []).filter((a: any) => !a.code?.endsWith('-00') && (showAllCoaAccounts || Number(a.balance || 0) !== 0));
                    if (cogsAccs.length === 0) {
                      return <div className="py-2 text-slate-400 font-sans italic text-center">No cost of goods sold recorded in this period</div>;
                    }
                    return cogsAccs.map((a: any, i: number) => (
                      <div key={i} className="py-1.5 flex justify-between hover:bg-amber-50/20">
                        <span className="font-sans text-slate-800">{a.code} - {a.name}</span>
                        <span className="font-bold text-slate-900">AED {Number(a.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                    ));
                  })()}
                </div>
              </div>

              {/* Gross Profit Summary Bar */}
              <div className="p-3 rounded-lg bg-emerald-50/60 border border-emerald-300 flex items-center justify-between font-sans font-bold text-xs text-emerald-950">
                <span className="uppercase tracking-wider">Gross Operating Profit (Revenue - COGS):</span>
                <span className="font-mono font-black text-emerald-900 text-sm">
                  AED {Number(reports?.incomeStatement?.grossProfit ?? ((reports?.incomeStatement?.revenue?.total || 0) - (reports?.incomeStatement?.cogs?.total || 0))).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>

              {/* 3. Operating Expenses */}
              <div className="space-y-2">
                <div className="bg-rose-50/80 p-2.5 rounded-lg font-bold text-rose-950 uppercase tracking-wider flex justify-between font-sans border border-rose-200">
                  <span className="flex items-center gap-1.5">
                    <span>3. Operating & Administrative Expenses</span>
                  </span>
                  <span className="font-mono text-sm font-black text-rose-900">
                    AED {Number(reports?.incomeStatement?.operatingExpenses?.total ?? reports?.incomeStatement?.expenses?.total ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="divide-y divide-slate-100 pl-4 pr-2">
                  {(() => {
                    const opAccs = ((reports?.incomeStatement?.operatingExpenses?.accounts ?? reports?.incomeStatement?.expenses?.accounts) || []).filter((a: any) => !a.code?.endsWith('-00') && (showAllCoaAccounts || Number(a.balance || 0) !== 0));
                    if (opAccs.length === 0) {
                      return <div className="py-2 text-slate-400 font-sans italic text-center">No operating expenses recorded in this period</div>;
                    }
                    return opAccs.map((a: any, i: number) => (
                      <div key={i} className="py-1.5 flex justify-between hover:bg-rose-50/20">
                        <span className="font-sans text-slate-800">{a.code} - {a.name}</span>
                        <span className="font-bold text-slate-900">AED {Number(a.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                    ));
                  })()}
                </div>
              </div>

              {/* Net Profit Summary Row */}
              <div className="pt-4 border-t-2 border-amber-900/60">
                <div className="p-4 rounded-xl bg-gradient-to-r from-amber-100/90 to-amber-200/80 flex items-center justify-between font-serif font-black text-sm text-amber-950 shadow-xs">
                  <div className="flex flex-col">
                    <span className="uppercase tracking-wider text-base">Net Operating Profit / (Loss):</span>
                    <span className="font-sans text-[11px] font-normal text-slate-600">Operating Revenue &bull; COGS &bull; Overhead Expenses</span>
                  </div>
                  <span className={`font-mono text-lg font-black ${
                    Number(reports?.incomeStatement?.netProfit || 0) >= 0 ? 'text-emerald-900' : 'text-rose-900'
                  }`}>
                    AED {Number(reports?.incomeStatement?.netProfit || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-3 border-t border-amber-200 flex items-center justify-between text-xs print:hidden">
              <span className="text-slate-500 font-sans">Computed directly via PostgreSQL RPC &bull; Prepared for Board Review and FTA Corporate Tax Filing</span>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Income Statement</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          SUBTAB 6: BALANCE SHEET
          ======================================================== */}
      {subTab === 'balance-sheet' && (
        <div className="space-y-4 w-full">
          {renderReportingPeriodSelector()}

          <div className="bg-white rounded-xl border border-amber-200/90 shadow-xs p-6 w-full">
            <div className="text-center pb-4 mb-4 border-b border-amber-200">
              <h3 className="font-serif font-black text-base uppercase tracking-wider text-amber-950">
                VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C
              </h3>
              <div className="font-serif font-bold text-sm text-slate-800 uppercase tracking-widest mt-0.5">
                STATEMENT OF FINANCIAL POSITION (BALANCE SHEET)
              </div>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                {getAsOfLabel()} &bull; Dual-Entry Verification: ASSETS = LIABILITIES + EQUITY
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-mono text-xs">
              {/* ================= LEFT COL: ASSETS ================= */}
              <div className="space-y-4">
                <div className="bg-blue-50/80 p-2.5 rounded-lg font-bold text-blue-950 uppercase tracking-wider flex justify-between font-sans border border-blue-200">
                  <span>Total Assets</span>
                  <span className="font-mono text-sm font-black text-blue-950">
                    AED {Number(reports?.balanceSheet?.assets?.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>

                {reports?.balanceSheet?.assets?.categories ? (
                  <div className="space-y-3 pl-1 pr-1">
                    {/* 1. Cash & Bank */}
                    <div className="bg-slate-50/60 p-2.5 rounded-lg border border-slate-200">
                      <div className="flex justify-between items-center text-[11px] font-sans font-bold text-slate-900 border-b border-slate-200 pb-1 mb-1">
                        <span>Cash & Cash Equivalents</span>
                        <span className="font-mono">AED {Number(reports.balanceSheet.assets.categories.cashAndBank?.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="divide-y divide-slate-100 pl-2">
                        {(reports.balanceSheet.assets.categories.cashAndBank?.accounts || []).filter((a: any) => !a.code?.endsWith('-00') && (showAllCoaAccounts || Number(a.balance || 0) !== 0)).map((a: any, i: number) => (
                          <div key={i} className="py-1 flex justify-between hover:bg-amber-50/30">
                            <span className="font-sans text-slate-700">{a.code} - {a.name}</span>
                            <span className="font-bold text-slate-900">AED {Number(a.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 2. Clearing Accounts */}
                    <div className="bg-slate-50/60 p-2.5 rounded-lg border border-slate-200">
                      <div className="flex justify-between items-center text-[11px] font-sans font-bold text-slate-900 border-b border-slate-200 pb-1 mb-1">
                        <span>Payment & COD Clearing Accounts</span>
                        <span className="font-mono">AED {Number(reports.balanceSheet.assets.categories.clearing?.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="divide-y divide-slate-100 pl-2">
                        {(reports.balanceSheet.assets.categories.clearing?.accounts || []).filter((a: any) => !a.code?.endsWith('-00') && (showAllCoaAccounts || Number(a.balance || 0) !== 0)).map((a: any, i: number) => (
                          <div key={i} className="py-1 flex justify-between hover:bg-amber-50/30">
                            <span className="font-sans text-slate-700">{a.code} - {a.name}</span>
                            <span className="font-bold text-slate-900">AED {Number(a.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 3. Receivables */}
                    <div className="bg-slate-50/60 p-2.5 rounded-lg border border-slate-200">
                      <div className="flex justify-between items-center text-[11px] font-sans font-bold text-slate-900 border-b border-slate-200 pb-1 mb-1">
                        <span>Trade & Customer Receivables</span>
                        <span className="font-mono">AED {Number(reports.balanceSheet.assets.categories.receivables?.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="divide-y divide-slate-100 pl-2">
                        {(reports.balanceSheet.assets.categories.receivables?.accounts || []).filter((a: any) => !a.code?.endsWith('-00') && (showAllCoaAccounts || Number(a.balance || 0) !== 0)).map((a: any, i: number) => (
                          <div key={i} className="py-1 flex justify-between hover:bg-amber-50/30">
                            <span className="font-sans text-slate-700">{a.code} - {a.name}</span>
                            <span className="font-bold text-slate-900">AED {Number(a.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 4. Inventories (Raw Bales, WIP Sorting, Finished Goods) */}
                    <div className="bg-slate-50/60 p-2.5 rounded-lg border border-slate-200">
                      <div className="flex justify-between items-center text-[11px] font-sans font-bold text-slate-900 border-b border-slate-200 pb-1 mb-1">
                        <span>Inventories (Raw Bales, WIP Sorting & Finished Garments)</span>
                        <span className="font-mono">AED {Number(reports.balanceSheet.assets.categories.inventory?.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="divide-y divide-slate-100 pl-2">
                        {(reports.balanceSheet.assets.categories.inventory?.accounts || []).filter((a: any) => !a.code?.endsWith('-00') && (showAllCoaAccounts || Number(a.balance || 0) !== 0)).map((a: any, i: number) => (
                          <div key={i} className="py-1 flex justify-between hover:bg-amber-50/30">
                            <span className="font-sans text-slate-700">{a.code} - {a.name}</span>
                            <span className="font-bold text-slate-900">AED {Number(a.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 5. Fixed & Non-Current Assets */}
                    <div className="bg-slate-50/60 p-2.5 rounded-lg border border-slate-200">
                      <div className="flex justify-between items-center text-[11px] font-sans font-bold text-slate-900 border-b border-slate-200 pb-1 mb-1">
                        <span>Fixed & Non-Current Assets (Equipment & Deposits)</span>
                        <span className="font-mono">AED {Number(reports.balanceSheet.assets.categories.fixedAssets?.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="divide-y divide-slate-100 pl-2">
                        {(reports.balanceSheet.assets.categories.fixedAssets?.accounts || []).filter((a: any) => !a.code?.endsWith('-00') && (showAllCoaAccounts || Number(a.balance || 0) !== 0)).map((a: any, i: number) => (
                          <div key={i} className="py-1 flex justify-between hover:bg-amber-50/30">
                            <span className="font-sans text-slate-700">{a.code} - {a.name}</span>
                            <span className="font-bold text-slate-900">AED {Number(a.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 pl-2">
                    {(reports?.balanceSheet?.assets?.accounts || []).filter((a: any) => !a.code?.endsWith('-00') && (showAllCoaAccounts || Number(a.balance || 0) !== 0)).map((a: any, i: number) => (
                      <div key={i} className="py-2 flex justify-between">
                        <span className="font-sans text-slate-800">{a.code} - {a.name}</span>
                        <span className="font-bold text-slate-900">AED {Number(a.balance || 0).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ================= RIGHT COL: LIABILITIES & EQUITY ================= */}
              <div className="space-y-4">
                {/* 1. LIABILITIES */}
                <div className="space-y-3">
                  <div className="bg-rose-50/80 p-2.5 rounded-lg font-bold text-rose-950 uppercase tracking-wider flex justify-between font-sans border border-rose-200">
                    <span>Total Liabilities</span>
                    <span className="font-mono text-sm font-black text-rose-950">
                      AED {Number(reports?.balanceSheet?.liabilities?.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  {reports?.balanceSheet?.liabilities?.categories ? (
                    <div className="space-y-3 pl-1 pr-1">
                      {/* Trade Payables */}
                      <div className="bg-slate-50/60 p-2.5 rounded-lg border border-slate-200">
                        <div className="flex justify-between items-center text-[11px] font-sans font-bold text-slate-900 border-b border-slate-200 pb-1 mb-1">
                          <span>Trade & Logistics Payables</span>
                          <span className="font-mono">AED {Number(reports.balanceSheet.liabilities.categories.payables?.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="divide-y divide-slate-100 pl-2">
                          {(reports.balanceSheet.liabilities.categories.payables?.accounts || []).filter((a: any) => !a.code?.endsWith('-00') && (showAllCoaAccounts || Number(a.balance || 0) !== 0)).map((a: any, i: number) => (
                            <div key={i} className="py-1 flex justify-between hover:bg-amber-50/30">
                              <span className="font-sans text-slate-700">{a.code} - {a.name}</span>
                              <span className="font-bold text-slate-900">AED {Number(a.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Statutory & Tax Payables */}
                      <div className="bg-slate-50/60 p-2.5 rounded-lg border border-slate-200">
                        <div className="flex justify-between items-center text-[11px] font-sans font-bold text-slate-900 border-b border-slate-200 pb-1 mb-1">
                          <span>Statutory & Tax Obligations</span>
                          <span className="font-mono">AED {Number(reports.balanceSheet.liabilities.categories.taxPayables?.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="divide-y divide-slate-100 pl-2">
                          {(reports.balanceSheet.liabilities.categories.taxPayables?.accounts || []).filter((a: any) => !a.code?.endsWith('-00') && (showAllCoaAccounts || Number(a.balance || 0) !== 0)).map((a: any, i: number) => (
                            <div key={i} className="py-1 flex justify-between hover:bg-amber-50/30">
                              <span className="font-sans text-slate-700">{a.code} - {a.name}</span>
                              <span className="font-bold text-slate-900">AED {Number(a.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Accrued Payroll */}
                      <div className="bg-slate-50/60 p-2.5 rounded-lg border border-slate-200">
                        <div className="flex justify-between items-center text-[11px] font-sans font-bold text-slate-900 border-b border-slate-200 pb-1 mb-1">
                          <span>Accrued Payroll & Overheads</span>
                          <span className="font-mono">AED {Number(reports.balanceSheet.liabilities.categories.accruedPayroll?.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="divide-y divide-slate-100 pl-2">
                          {(reports.balanceSheet.liabilities.categories.accruedPayroll?.accounts || []).filter((a: any) => !a.code?.endsWith('-00') && (showAllCoaAccounts || Number(a.balance || 0) !== 0)).map((a: any, i: number) => (
                            <div key={i} className="py-1 flex justify-between hover:bg-amber-50/30">
                              <span className="font-sans text-slate-700">{a.code} - {a.name}</span>
                              <span className="font-bold text-slate-900">AED {Number(a.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 pl-2">
                      {(reports?.balanceSheet?.liabilities?.accounts || []).filter((a: any) => !a.code?.endsWith('-00') && (showAllCoaAccounts || Number(a.balance || 0) !== 0)).map((a: any, i: number) => (
                        <div key={i} className="py-1.5 flex justify-between">
                          <span className="font-sans text-slate-800">{a.code} - {a.name}</span>
                          <span className="font-bold text-slate-900">AED {Number(a.balance || 0).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 2. SHAREHOLDERS' EQUITY */}
                <div className="space-y-3 pt-2">
                  <div className="bg-purple-50/80 p-2.5 rounded-lg font-bold text-purple-950 uppercase tracking-wider flex justify-between font-sans border border-purple-200">
                    <span>Shareholders' Equity & Reserves</span>
                    <span className="font-mono text-sm font-black text-purple-950">
                      AED {Number(reports?.balanceSheet?.equity?.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  {reports?.balanceSheet?.equity?.categories ? (
                    <div className="space-y-3 pl-1 pr-1">
                      {/* Capital */}
                      <div className="bg-slate-50/60 p-2.5 rounded-lg border border-slate-200">
                        <div className="flex justify-between items-center text-[11px] font-sans font-bold text-slate-900 border-b border-slate-200 pb-1 mb-1">
                          <span>Owner & Shareholder Capital</span>
                          <span className="font-mono">AED {Number(reports.balanceSheet.equity.categories.capital?.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="divide-y divide-slate-100 pl-2">
                          {(reports.balanceSheet.equity.categories.capital?.accounts || []).filter((a: any) => !a.code?.endsWith('-00') && (showAllCoaAccounts || Number(a.balance || 0) !== 0)).map((a: any, i: number) => (
                            <div key={i} className="py-1 flex justify-between hover:bg-amber-50/30">
                              <span className="font-sans text-slate-700">{a.code} - {a.name}</span>
                              <span className="font-bold text-slate-900">AED {Number(a.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Retained Earnings */}
                      <div className="bg-slate-50/60 p-2.5 rounded-lg border border-slate-200">
                        <div className="flex justify-between items-center text-[11px] font-sans font-bold text-slate-900 border-b border-slate-200 pb-1 mb-1">
                          <span>Retained Earnings & General Reserves</span>
                          <span className="font-mono">AED {Number(reports.balanceSheet.equity.categories.retainedEarnings?.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="divide-y divide-slate-100 pl-2">
                          {(reports.balanceSheet.equity.categories.retainedEarnings?.accounts || []).filter((a: any) => !a.code?.endsWith('-00') && (showAllCoaAccounts || Number(a.balance || 0) !== 0)).map((a: any, i: number) => (
                            <div key={i} className="py-1 flex justify-between hover:bg-amber-50/30">
                              <span className="font-sans text-slate-700">{a.code} - {a.name}</span>
                              <span className="font-bold text-slate-900">AED {Number(a.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Current Year Net Profit YTD */}
                      <div className="bg-purple-100/50 p-2.5 rounded-lg border border-purple-300">
                        <div className="flex justify-between items-center text-[11px] font-sans font-bold text-purple-950">
                          <span>Current Year Net Operating Profit / (Loss) YTD</span>
                          <span className={`font-mono font-black ${
                            Number(reports.balanceSheet.equity.categories.currentNetProfit?.balance ?? (reports?.incomeStatement?.netProfit || 0)) >= 0
                              ? 'text-emerald-900'
                              : 'text-rose-900'
                          }`}>
                            AED {Number(reports.balanceSheet.equity.categories.currentNetProfit?.balance ?? (reports?.incomeStatement?.netProfit || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 pl-2">
                      {(reports?.balanceSheet?.equity?.accounts || []).filter((a: any) => !a.code?.endsWith('-00') && (showAllCoaAccounts || Number(a.balance || 0) !== 0)).map((a: any, i: number) => (
                        <div key={i} className="py-1.5 flex justify-between">
                          <span className="font-sans text-slate-800">{a.code ? `${a.code} - ` : ''}{a.name}</span>
                          <span className="font-bold text-slate-900">AED {Number(a.balance || 0).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Balancing Proof Bar */}
            <div className="mt-6 pt-4 border-t-2 border-amber-900/60">
              <div className={`p-3.5 rounded-xl border flex flex-wrap items-center justify-between gap-3 font-mono text-xs ${
                reports?.balanceSheet?.balanced
                  ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950'
                  : 'bg-rose-50/80 border-rose-300 text-rose-950'
              }`}>
                <div className={`flex items-center gap-2 font-bold font-sans ${
                  reports?.balanceSheet?.balanced ? 'text-emerald-800' : 'text-rose-800'
                }`}>
                  <ShieldCheck className="w-5 h-5" />
                  <span>
                    Balance Sheet Mathematical Verification:{' '}
                    <strong className="uppercase">{reports?.balanceSheet?.balanced ? 'BALANCED TO ZERO DISCREPANCY' : 'OUT OF BALANCE'}</strong>
                  </span>
                </div>
                <div className="font-bold text-slate-900 text-xs">
                  Total Assets (AED {Number(reports?.balanceSheet?.assets?.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}) = Liabilities & Equity (AED {Number(reports?.balanceSheet?.totalLiabilitiesAndEquity ?? ((reports?.balanceSheet?.liabilities?.total || 0) + (reports?.balanceSheet?.equity?.total || 0))).toLocaleString(undefined, { minimumFractionDigits: 2 })})
                  {!reports?.balanceSheet?.balanced && Number(reports?.balanceSheet?.difference || 0) !== 0 && (
                    <span className="text-rose-700 font-black ml-2 font-sans">
                      [Discrepancy: AED {Number(reports?.balanceSheet?.difference || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}]
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-4 pt-2 flex items-center justify-between text-xs print:hidden">
              <span className="text-slate-500 font-sans">Computed directly via PostgreSQL RPC &bull; Dual-Entry Integrity Validated</span>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Balance Sheet</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          SUBTAB 7: RECURRING VOUCHERS
          ======================================================== */}
      {subTab === 'recurring-vouchers' && (
        <RecurringVouchersView
          accounts={accounts}
          onRefreshFinance={loadData}
          onNavigateToVouchers={() => setSubTab('vouchers')}
        />
      )}

      {/* ========================================================
          SUBTAB 8: MONTHLY BUDGETING & CEILINGS
          ======================================================== */}
      {subTab === 'budgeting' && (
        <BudgetingView
          accounts={accounts}
          onRefreshFinance={loadData}
        />
      )}

      {/* ========================================================
          SUBTAB 9: CUSTOM REPORT BUILDER
          ======================================================== */}
      {subTab === 'custom-reports' && (
        <CustomReportBuilder
          accounts={accounts}
          onRefreshFinance={loadData}
        />
      )}

      {/* ========================================================
          SUBTAB: COURIER COD REMITTANCE & CLEARING RECONCILER
          ======================================================== */}
      {subTab === 'cod-reconciliation' && (
        <CourierCODReconciliation onRefreshAll={loadData} accounts={accounts} />
      )}

      {/* ========================================================
          SUBTAB 10: UAE FTA & CORPORATE TAX (9%) COMPLIANCE
          ======================================================== */}
      {subTab === 'tax-compliance' && (
        <TaxComplianceView onRefreshAll={loadData} />
      )}


      {/* ========================================================
          MODAL 1: ADD SUB-ACCOUNT / TRANSACTION ACCOUNT
          ======================================================== */}
      {showAddAccountModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border-2 border-amber-200 max-w-md w-full shadow-2xl p-6 relative">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-amber-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center">
                  <FolderTree className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-serif font-bold text-slate-900 text-sm">Add New COA Account</h4>
                  <p className="text-[11px] text-slate-500">Attach sub-account or transaction-level ledger account</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddAccountModal(false)}
                className="text-slate-400 hover:text-slate-700 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveAccount} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Pillar Classification *
                  </label>
                  <select
                    value={newAccClassification}
                    onChange={e => {
                      const val = e.target.value as AccountClassification;
                      setNewAccClassification(val);
                      const rootAcc = accounts.find(a => {
                        const c = (a.classification || a.type || a.account_type || '').toUpperCase();
                        const normC = c === 'INCOME' ? 'REVENUE' : c;
                        const targetC = val.toUpperCase();
                        const normTarget = targetC === 'INCOME' ? 'REVENUE' : targetC;
                        return normC === normTarget && (a.tierLevel === 1 || a.tier_level === 1 || (a.code || '').endsWith('000-00'));
                      });
                      if (rootAcc) setNewAccParentCode(rootAcc.code);
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-amber-200 text-xs font-bold bg-[#fdfcf9] focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="ASSET">1000: ASSET</option>
                    <option value="LIABILITY">2000: LIABILITY</option>
                    <option value="EQUITY">3000: EQUITY</option>
                    <option value="REVENUE">4000: REVENUE</option>
                    <option value="EXPENSE">5000: EXPENSE</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Tier Level *
                  </label>
                  <select
                    value={newAccTierLevel}
                    onChange={e => {
                      const lvl = Number(e.target.value);
                      setNewAccTierLevel(lvl);
                      if (lvl === 1) {
                        setNewAccParentCode('');
                        if (newAccClassification === 'ASSET') setNewAccCode('1000-05');
                        else if (newAccClassification === 'LIABILITY') setNewAccCode('2000-05');
                        else if (newAccClassification === 'EQUITY') setNewAccCode('3000-05');
                        else if (newAccClassification === 'REVENUE') setNewAccCode('4000-05');
                        else if (newAccClassification === 'EXPENSE') setNewAccCode('5000-05');
                      } else if (lvl === 2) {
                        const parentT1 = accounts.find(a => {
                          const c = (a.classification || a.type || a.account_type || '').toUpperCase();
                          const normC = c === 'INCOME' ? 'REVENUE' : c;
                          const targetC = newAccClassification.toUpperCase();
                          const normTarget = targetC === 'INCOME' ? 'REVENUE' : targetC;
                          return normC === normTarget && (a.tierLevel === 1 || a.tier_level === 1 || (a.code || '').endsWith('000-00'));
                        });
                        if (parentT1) setNewAccParentCode(parentT1.code);
                        setNewAccCode(newAccClassification === 'ASSET' ? '1150-00' : '5150-00');
                      } else if (lvl === 3) {
                        const parentT2 = accounts.find(a => {
                          const c = (a.classification || a.type || a.account_type || '').toUpperCase();
                          const normC = c === 'INCOME' ? 'REVENUE' : c;
                          const targetC = newAccClassification.toUpperCase();
                          const normTarget = targetC === 'INCOME' ? 'REVENUE' : targetC;
                          return normC === normTarget;
                        });
                        if (parentT2) setNewAccParentCode(parentT2.code);
                        setNewAccCode(newAccClassification === 'ASSET' ? '1150-01' : '5150-01');
                      }
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-amber-200 text-xs bg-[#fdfcf9] focus:ring-2 focus:ring-amber-500"
                  >
                    <option value={1}>Tier 1: Master Folder</option>
                    <option value={2}>Tier 2: Sub-Folder</option>
                    <option value={3}>Tier 3: Transaction Account</option>
                  </select>
                </div>
              </div>

              {newAccTierLevel > 1 && (
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Parent {newAccTierLevel === 2 ? 'Master Folder (Tier 1)' : 'Sub-Folder (Tier 2)'} *
                  </label>
                  <SearchableSelect
                    value={newAccParentCode}
                    onChange={val => setNewAccParentCode(val)}
                    options={accounts
                      .filter(a => {
                        const c = (a.classification || a.type || a.account_type || '').toUpperCase();
                        const normC = c === 'INCOME' ? 'REVENUE' : c;
                        const targetC = newAccClassification.toUpperCase();
                        const normTarget = targetC === 'INCOME' ? 'REVENUE' : targetC;
                        if (normC !== normTarget) return false;
                        if (newAccTierLevel === 2) {
                          return a.tierLevel === 1 || a.tier_level === 1 || (a.code || '').endsWith('000-00') || !(a.code || '').includes('-');
                        }
                        return true;
                      })
                      .map(parentAcc => ({
                        value: parentAcc.code,
                        label: `${parentAcc.code} - ${parentAcc.name}`,
                        badge: parentAcc.classification || parentAcc.type || 'COA'
                      }))}
                    placeholder="Select Parent Folder..."
                    searchPlaceholder="Search parent folders..."
                    className="w-full text-xs font-mono"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Account Code *
                  </label>
                  <input
                    type="text"
                    value={newAccCode}
                    onChange={e => setNewAccCode(e.target.value)}
                    placeholder="e.g. 1140-00"
                    required
                    className="w-full px-3 py-2 rounded-lg border border-amber-200 text-xs font-mono font-bold bg-[#fdfcf9] focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Currency
                  </label>
                  <select
                    value={newAccCurrency}
                    onChange={e => setNewAccCurrency(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-amber-200 text-xs bg-[#fdfcf9] focus:ring-2 focus:ring-amber-500"
                  >
                    {CURRENCY_LIST.map(curr => (
                      <option key={curr.code} value={curr.code}>
                        {curr.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Account Name / Title *
                </label>
                <input
                  type="text"
                  value={newAccName}
                  onChange={e => setNewAccName(e.target.value)}
                  placeholder="e.g. DHL Express Freight Port Clearing or Commercial Bank of Dubai"
                  required
                  className="w-full px-3 py-2 rounded-lg border border-amber-200 text-xs bg-[#fdfcf9] focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Opening Balance (AED)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={newAccOpeningBalance}
                  onChange={e => setNewAccOpeningBalance(e.target.value)}
                  onFocus={e => e.target.select()}
                  placeholder="0.00"
                  className="w-full px-3 py-2 rounded-lg border border-amber-200 text-xs font-mono font-bold bg-[#fdfcf9] focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-amber-100">
                <button
                  type="button"
                  onClick={() => setShowAddAccountModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingAccount}
                  className="px-5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs hover:shadow transition-all disabled:opacity-50"
                >
                  {isSavingAccount ? 'Saving...' : 'Add Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL 2: CREATE MULTI-ROW VOUCHER (JV/PV/RV)
          ======================================================== */}
      {showNewVoucherModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border-2 border-amber-300 max-w-2xl w-full shadow-2xl p-6 relative">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-amber-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-600 text-white flex items-center justify-center">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-serif font-bold text-slate-900 text-sm">
                    {editingVoucherId ? `Edit Accounting Voucher (${editingVoucherNo})` : 'Post Accounting Voucher'}
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    {editingVoucherId ? 'Modify dual-entry debit and credit line items' : 'Multi-row dual-entry debit and credit builder'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowNewVoucherModal(false);
                  setEditingVoucherId(null);
                  setEditingVoucherNo('');
                }}
                className="text-slate-400 hover:text-slate-700 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateVoucher} className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Voucher Type *
                  </label>
                  <select
                    value={voucherType}
                    onChange={e => handleVoucherTypeChange(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-amber-200 text-xs font-bold bg-[#fdfcf9] focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="BPV">BPV - Bank Payment</option>
                    <option value="BRV">BRV - Bank Receipt</option>
                    <option value="CPV">CPV - Cash Payment</option>
                    <option value="CRV">CRV - Cash Receipt</option>
                    <option value="JV">JV - Journal Voucher</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Posting Date *
                  </label>
                  <input
                    type="date"
                    value={voucherDate}
                    onChange={e => setVoucherDate(e.target.value)}
                    required
                    className="w-full px-2.5 py-1.5 rounded-lg border border-amber-200 text-xs font-mono font-bold bg-[#fdfcf9] focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Currency *
                  </label>
                  <select
                    value={voucherCurrency}
                    onChange={e => handleCurrencyChange(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-amber-200 text-xs font-bold bg-[#fdfcf9] focus:ring-2 focus:ring-amber-500 text-amber-900"
                  >
                    {CURRENCY_LIST.map(curr => (
                      <option key={curr.code} value={curr.code}>
                        {curr.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Rate (1 {voucherCurrency} = AED)
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    min="0.0001"
                    disabled={voucherCurrency === 'AED'}
                    value={voucherCurrency === 'AED' ? '1.0000' : voucherExchangeRate}
                    onChange={e => setVoucherExchangeRate(parseFloat(e.target.value) || 1.0)}
                    onFocus={e => e.target.select()}
                    className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono font-bold ${
                      voucherCurrency === 'AED'
                        ? 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed'
                        : 'bg-[#fdfcf9] border-amber-300 text-amber-900 focus:ring-2 focus:ring-amber-500'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Entry Mode
                  </label>
                  {voucherType === 'JV' ? (
                    <div className="px-2.5 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-[11px] font-bold text-slate-600 flex items-center justify-center">
                      <span>Double Entry Only</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                      <button
                        type="button"
                        onClick={() => handleSwitchMode('SINGLE')}
                        className={`flex-1 py-1 text-[10px] font-bold rounded-md transition-all cursor-pointer ${
                          entryMode === 'SINGLE'
                            ? 'bg-amber-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Single
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSwitchMode('DOUBLE')}
                        className={`flex-1 py-1 text-[10px] font-bold rounded-md transition-all cursor-pointer ${
                          entryMode === 'DOUBLE'
                            ? 'bg-amber-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Double
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Narration / Particulars (Optional)
                </label>
                <input
                  type="text"
                  value={voucherNarration}
                  onChange={e => setVoucherNarration(e.target.value)}
                  placeholder="e.g. Payment for customs duty, port clearance, partner share, or supplier payment (optional)"
                  className="w-full px-3 py-2 rounded-lg border border-amber-200 text-xs bg-[#fdfcf9] focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* SINGLE ENTRY MODE UI */}
              {entryMode === 'SINGLE' && voucherType !== 'JV' ? (
                <div className="space-y-3">
                  {/* Primary Bank/Cash Account Selector Header */}
                  <div className="p-3 rounded-xl border-2 border-amber-300 bg-amber-50/50 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Landmark className="w-4 h-4 text-amber-700" />
                        <label className="text-xs font-bold uppercase tracking-wider text-amber-950">
                          {voucherType === 'BPV' && 'Paid From Bank Account (Credit Source) *'}
                          {voucherType === 'CPV' && 'Paid From Cash Account (Credit Source) *'}
                          {voucherType === 'BRV' && 'Received Into Bank Account (Debit Destination) *'}
                          {voucherType === 'CRV' && 'Received Into Cash Account (Debit Destination) *'}
                        </label>
                      </div>
                      {primaryBankCashAccountId && (
                        <div className="text-[11px] font-mono font-bold text-slate-700 bg-white px-2 py-0.5 rounded border border-amber-200">
                          Live Balance: <span className={primaryAccBalance >= 0 ? 'text-emerald-700 font-bold' : 'text-rose-700 font-bold'}>AED {primaryAccBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                      )}
                    </div>

                    <SearchableSelect
                      value={primaryBankCashAccountId}
                      onChange={val => setPrimaryBankCashAccountId(val)}
                      options={selectablePrimaryAccounts.map(a => ({
                        value: a.id,
                        label: `${a.code} - ${a.name}`,
                        badge: a.sub_type || a.subType || a.classification,
                        badgeColor: 'bg-amber-100 text-amber-900 border-amber-300',
                        sublabel: `Balance: AED ${(Number(a.current_balance ?? a.currentBalance) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                      }))}
                      placeholder={voucherType.startsWith('B') ? 'Select Bank Account from COA...' : 'Select Cash Account from COA...'}
                      searchPlaceholder="Search bank or cash accounts from COA..."
                      className="w-full text-xs font-mono font-bold"
                    />
                  </div>

                  {/* Line Items Table */}
                  <div className="border border-amber-200 rounded-xl overflow-hidden">
                    <div className="bg-amber-50/70 p-2.5 flex items-center justify-between border-b border-amber-200 text-xs font-bold text-amber-950">
                      <span>
                        {voucherType === 'BPV' || voucherType === 'CPV' ? 'Payment Particulars (Debit Accounts)' : 'Receipt Particulars (Credit Accounts)'}
                      </span>
                      <button
                        type="button"
                        onClick={handleAddSingleLine}
                        className="px-2 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold uppercase flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add Line</span>
                      </button>
                    </div>

                    <div className="p-2 space-y-2 max-h-60 overflow-y-auto">
                      {singleLines.map((line, idx) => (
                        <div key={line.id} className="grid grid-cols-12 gap-2 items-center bg-slate-50/80 p-2 rounded-lg border border-slate-200 text-xs">
                          <div className="col-span-5">
                            <SearchableSelect
                              value={line.accountId}
                              onChange={val => handleUpdateSingleLine(idx, 'accountId', val)}
                              options={accounts.map(a => ({
                                value: a.id,
                                label: `${a.code} - ${a.name}`,
                                badge: a.classification,
                                badgeColor: a.classification === 'ASSET' ? 'bg-blue-100 text-blue-900 border-blue-300' :
                                            a.classification === 'LIABILITY' ? 'bg-rose-100 text-rose-900 border-rose-300' :
                                            a.classification === 'EQUITY' ? 'bg-purple-100 text-purple-900 border-purple-300' :
                                            a.classification === 'REVENUE' ? 'bg-emerald-100 text-emerald-900 border-emerald-300' :
                                            'bg-amber-100 text-amber-900 border-amber-300',
                                sublabel: a.sub_type || a.subType
                              }))}
                              placeholder="Select Account / Head / Party..."
                              searchPlaceholder="Search account title or code..."
                              className="w-full text-[11px] font-mono font-bold"
                            />
                          </div>

                          <div className="col-span-3">
                            <input
                              type="number"
                              step="0.01"
                              value={line.amount || ''}
                              onChange={e => handleUpdateSingleLine(idx, 'amount', parseFloat(e.target.value) || 0)}
                              onFocus={e => e.target.select()}
                              placeholder={`Amount (${voucherCurrency})`}
                              className="w-full text-right p-1.5 border border-slate-300 rounded font-mono text-[11px] font-bold text-slate-900 bg-white"
                            />
                            {voucherCurrency !== 'AED' && (Number(line.amount) || 0) > 0 && (
                              <div className="text-[10px] text-right text-slate-500 font-mono">
                                ≈ AED {((Number(line.amount) || 0) * (Number(voucherExchangeRate) || 1)).toFixed(2)}
                              </div>
                            )}
                          </div>

                          <div className="col-span-3">
                            <input
                              type="text"
                              value={line.memo}
                              onChange={e => handleUpdateSingleLine(idx, 'memo', e.target.value)}
                              placeholder="Line memo (optional)"
                              className="w-full p-1.5 border border-slate-300 rounded text-[11px] bg-white"
                            />
                          </div>

                          <div className="col-span-1 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveSingleLine(idx)}
                              className="p-1 rounded text-rose-600 hover:bg-rose-100 cursor-pointer"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Single Entry Summary Bar */}
                    <div className="bg-amber-100/70 p-3 border-t border-amber-200 flex flex-wrap items-center justify-between text-xs font-mono">
                      <div>
                        <span className="text-slate-600">Total Voucher Amount: </span>
                        <strong className="text-slate-900 text-sm">{voucherCurrency} {singleEntryTotal.toFixed(2)}</strong>
                        {voucherCurrency !== 'AED' && (
                          <span className="ml-2 text-xs font-bold text-blue-900 bg-blue-100 px-2 py-0.5 rounded border border-blue-300">
                            ≈ AED {(singleEntryTotal * (Number(voucherExchangeRate) || 1)).toFixed(2)}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 text-[11px] text-slate-700">
                        <ShieldCheck className="w-4 h-4 text-emerald-700" />
                        <span>Auto Double-Entry: 100% Balanced</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* DOUBLE ENTRY MODE UI */
                <div className="border border-amber-200 rounded-xl overflow-hidden">
                  <div className="bg-amber-50/70 p-2.5 flex items-center justify-between border-b border-amber-200 text-xs font-bold text-amber-950">
                    <span>Double-Entry Account Line Items ({voucherCurrency})</span>
                    <button
                      type="button"
                      onClick={handleAddVoucherLine}
                      className="px-2 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold uppercase flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add Line</span>
                    </button>
                  </div>

                  <div className="p-2 space-y-2 max-h-60 overflow-y-auto">
                    {voucherLines.map((line, idx) => (
                      <div key={line.id} className="grid grid-cols-12 gap-2 items-center bg-slate-50/80 p-2 rounded-lg border border-slate-200 text-xs">
                        <div className="col-span-5">
                          <SearchableSelect
                            value={line.accountId}
                            onChange={val => handleUpdateVoucherLine(idx, 'accountId', val)}
                            options={accounts.map(a => ({
                              value: a.id,
                              label: `${a.code} - ${a.name}`,
                              badge: a.classification,
                              badgeColor: a.classification === 'ASSET' ? 'bg-blue-100 text-blue-900 border-blue-300' :
                                          a.classification === 'LIABILITY' ? 'bg-rose-100 text-rose-900 border-rose-300' :
                                          a.classification === 'EQUITY' ? 'bg-purple-100 text-purple-900 border-purple-300' :
                                          a.classification === 'REVENUE' ? 'bg-emerald-100 text-emerald-900 border-emerald-300' :
                                          'bg-amber-100 text-amber-900 border-amber-300',
                              sublabel: a.sub_type || a.subType
                            }))}
                            placeholder="Select Account..."
                            searchPlaceholder="Search code or account title..."
                            className="w-full text-[11px] font-mono font-bold"
                          />
                        </div>

                        <div className="col-span-3">
                          <input
                            type="number"
                            step="0.01"
                            value={line.debitAmount || ''}
                            onChange={e => handleUpdateVoucherLine(idx, 'debitAmount', parseFloat(e.target.value) || 0)}
                            onFocus={e => e.target.select()}
                            placeholder={`Debit (${voucherCurrency})`}
                            className="w-full text-right p-1.5 border border-slate-300 rounded font-mono text-[11px] font-bold text-slate-900 bg-white"
                          />
                          {voucherCurrency !== 'AED' && (Number(line.debitAmount) || 0) > 0 && (
                            <div className="text-[10px] text-right text-slate-500 font-mono">
                              ≈ AED {((Number(line.debitAmount) || 0) * (Number(voucherExchangeRate) || 1)).toFixed(2)}
                            </div>
                          )}
                        </div>

                        <div className="col-span-3">
                          <input
                            type="number"
                            step="0.01"
                            value={line.creditAmount || ''}
                            onChange={e => handleUpdateVoucherLine(idx, 'creditAmount', parseFloat(e.target.value) || 0)}
                            onFocus={e => e.target.select()}
                            placeholder={`Credit (${voucherCurrency})`}
                            className="w-full text-right p-1.5 border border-slate-300 rounded font-mono text-[11px] font-bold text-slate-900 bg-white"
                          />
                          {voucherCurrency !== 'AED' && (Number(line.creditAmount) || 0) > 0 && (
                            <div className="text-[10px] text-right text-slate-500 font-mono">
                              ≈ AED {((Number(line.creditAmount) || 0) * (Number(voucherExchangeRate) || 1)).toFixed(2)}
                            </div>
                          )}
                        </div>

                        <div className="col-span-1 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveVoucherLine(idx)}
                            className="p-1 rounded text-rose-600 hover:bg-rose-100 cursor-pointer"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Balance Proof Summary Bar */}
                  <div className="bg-amber-100/70 p-3 border-t border-amber-200 flex flex-wrap items-center justify-between text-xs font-mono">
                    <div>
                      <span className="text-slate-600">Total Debit: </span>
                      <strong className="text-slate-900">{voucherCurrency} {totalDebitSum.toFixed(2)}</strong>
                      <span className="mx-2 text-slate-400">|</span>
                      <span className="text-slate-600">Total Credit: </span>
                      <strong className="text-slate-900">{voucherCurrency} {totalCreditSum.toFixed(2)}</strong>
                      {voucherCurrency !== 'AED' && (
                        <span className="ml-2 text-xs font-bold text-blue-900 bg-blue-100 px-2 py-0.5 rounded border border-blue-300">
                          ≈ AED {(totalDebitSum * (Number(voucherExchangeRate) || 1)).toFixed(2)} Base
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {isVoucherBalanced ? (
                        <span className="text-emerald-800 font-bold flex items-center gap-1">
                          <ShieldCheck className="w-4 h-4" />
                          <span>Balanced (0.00 {voucherCurrency} Diff)</span>
                        </span>
                      ) : (
                        <span className="text-rose-800 font-bold">
                          Out of balance by {voucherCurrency} {voucherDiff.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-amber-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowNewVoucherModal(false);
                    setEditingVoucherId(null);
                    setEditingVoucherNo('');
                  }}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    (entryMode === 'SINGLE' && voucherType !== 'JV'
                      ? singleEntryTotal <= 0 || !primaryBankCashAccountId || isSavingVoucher
                      : !isVoucherBalanced || isSavingVoucher)
                  }
                  className="px-5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs hover:shadow transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isSavingVoucher ? 'Saving to SQL...' : editingVoucherId ? 'Update & Post Voucher' : 'Save & Post Voucher'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL 3: PRINT VOUCHER MODAL
          ======================================================== */}
      {voucherToPrint && (
        <PrintVoucherModal
          voucher={voucherToPrint}
          onClose={() => setVoucherToPrint(null)}
        />
      )}
    </div>
  );
};
