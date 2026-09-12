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
  RefreshCw
} from 'lucide-react';
import { AccessDeniedNotice } from '../../../components/AccessDeniedNotice.tsx';
import { ModuleMaintenanceGuard } from '../../../components/ModuleMaintenanceGuard.tsx';

interface COARowProps {
  acc: COAAccount;
  isDebitNormal: boolean;
  onViewLedger?: (accId: string) => void;
}

const COARow: React.FC<COARowProps> = React.memo(({ acc, isDebitNormal, onViewLedger }) => {
  const code = acc.code || '';
  const name = acc.name || '';
  const type = (acc.type || acc.classification || 'ASSET').toString().toUpperCase();
  const currentBalance = typeof acc.current_balance === 'number' ? acc.current_balance : (Number(acc.currentBalance) || 0);
  const tierLevel = acc.tierLevel || acc.tier_level || (code.includes('-') ? (code.split('-').length > 2 || (!code.endsWith('-00') && (code.startsWith('2110-') || code.startsWith('1130-') || code.startsWith('2120-'))) ? 3 : 2) : 1);
  const isDebit = type === 'ASSET' || type === 'EXPENSE';
  const isActive = acc.is_active !== false && acc.isActive !== false;
  const isPartyAccount = Boolean(
    acc.party_id ||
    acc.partyId ||
    (!code.endsWith('-00') && (code.startsWith('2110-') || code.startsWith('1130-') || code.startsWith('2120-')))
  );

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
      <td className="px-3.5 py-2.5 text-slate-700">{acc.currency || 'AED'}</td>
      <td className="px-3.5 py-2.5 text-right font-bold text-slate-900">
        AED {Number(currentBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
        <span className="text-[9px] text-slate-500 ml-1 font-sans">
          ({isDebit ? 'Dr' : 'Cr'})
        </span>
      </td>
      <td className="px-3.5 py-2.5 text-center">
        <div className="flex items-center justify-center gap-1.5">
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
            isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
          }`}>
            {isActive ? 'Active' : 'Inactive'}
          </span>
          {onViewLedger && (
            <button
              type="button"
              onClick={() => onViewLedger(acc.id)}
              title="View General Ledger for this account"
              className="text-[10px] text-amber-700 hover:text-amber-900 font-bold hover:underline cursor-pointer ml-1"
            >
              Ledger →
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

export const FinanceView: React.FC<FinanceViewProps> = ({ onRefreshAll, currentUserRole, initialSubTab = 'coa', maintenanceModules }) => {
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
  const [coaSearchText, setCoaSearchText] = useState<string>('');

  // General Ledger Unified Selector
  const [glSelectedTarget, setGlSelectedTarget] = useState<string>('ALL');
  const [glSearchText, setGlSearchText] = useState<string>('');
  const [glDateFrom, setGlDateFrom] = useState<string>('2026-01-01');
  const [glDateTo, setGlDateTo] = useState<string>('2026-12-31');

  // New Account Modal state
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [newAccClassification, setNewAccClassification] = useState<AccountClassification>('EXPENSE');
  const [newAccTierLevel, setNewAccTierLevel] = useState<number>(3); // 2: Sub-Account, 3: Transaction Account
  const [newAccParentCode, setNewAccParentCode] = useState<string>('5200');
  const [newAccCode, setNewAccCode] = useState<string>('5220-00');
  const [newAccName, setNewAccName] = useState<string>('');
  const [newAccOpeningBalance, setNewAccOpeningBalance] = useState<string>('0');
  const [newAccCurrency, setNewAccCurrency] = useState<string>('AED');
  const [isSavingAccount, setIsSavingAccount] = useState(false);

  // New Voucher Modal & Line Items
  const [showNewVoucherModal, setShowNewVoucherModal] = useState(false);
  const [voucherType, setVoucherType] = useState<any>('JV');
  const [voucherNarration, setVoucherNarration] = useState('Vintage cargo port handling & customs duty adjustment');
  const [voucherDate, setVoucherDate] = useState(new Date().toISOString().slice(0, 10));
  const [voucherLines, setVoucherLines] = useState<NewVoucherLineItem[]>([
    { id: '1', accountId: '', accountCode: '', accountName: '', debitAmount: 4200, creditAmount: 0, memo: 'Customs duty debit' },
    { id: '2', accountId: '', accountCode: '', accountName: '', debitAmount: 0, creditAmount: 4200, memo: 'Bank payment credit' }
  ]);
  const [isSavingVoucher, setIsSavingVoucher] = useState(false);

  // Print voucher modal state
  const [voucherToPrint, setVoucherToPrint] = useState<Voucher | null>(null);

  // Dynamic Reporting Period for SQL Reports
  const [reportPeriod, setReportPeriod] = useState<'2026' | '2025' | 'ALL' | 'CUSTOM'>('2026');
  const [reportStartDate, setReportStartDate] = useState<string>('2026-01-01');
  const [reportEndDate, setReportEndDate] = useState<string>('2026-12-31');

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
    try {
      const sDate = customParams?.startDate !== undefined ? customParams.startDate : (reportPeriod === 'ALL' ? undefined : (reportStartDate || undefined));
      const eDate = customParams?.endDate !== undefined ? customParams.endDate : (reportPeriod === 'ALL' ? undefined : (reportEndDate || undefined));

      const [coaRes, vchRes, ledRes, repRes, ptyRes] = await Promise.all([
        FinanceService.getCoaAccounts(true).catch(() => safeFetchJson<COAAccount[]>('/api/finance/coa', undefined, 3, 300)),
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

      const coaList = (Array.isArray(coaRes) && coaRes.length > 0) ? coaRes : await safeFetchJson<COAAccount[]>('/api/finance/coa', undefined, 3, 300);
      const finalCoa = Array.isArray(coaList) && coaList.length > 0 ? coaList : (Array.isArray(coaRes) ? coaRes : []);
      setAccounts(finalCoa);
      setVouchers(Array.isArray(vchRes) ? vchRes : []);
      setLedgers(Array.isArray(ledRes) ? ledRes : []);
      if (repRes) setReports(repRes);
      setParties(Array.isArray(ptyRes) ? ptyRes : []);

      // Pre-select initial accounts for default voucher lines if empty
      if (finalCoa.length >= 2) {
        setVoucherLines(prev => {
          if (!prev[0].accountId) {
            return [
              { ...prev[0], accountId: finalCoa[0].id, accountCode: finalCoa[0].code, accountName: finalCoa[0].name },
              { ...prev[1], accountId: finalCoa[1].id, accountCode: finalCoa[1].code, accountName: finalCoa[1].name }
            ];
          }
          return prev;
        });
      }
    } catch {
      // Graceful fallback
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
      await FinanceService.addCoaAccount({
        code: newAccCode.trim(),
        name: newAccName.trim(),
        type: newAccClassification,
        classification: newAccClassification,
        sub_type: '',
        subType: '',
        tierLevel: newAccTierLevel,
        parentCode: newAccParentCode.trim() || undefined,
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
      loadData();
      onRefreshAll();
    } catch (err: any) {
      showMsg(err.message || 'Error saving account', 'error');
    } finally {
      setIsSavingAccount(false);
    }
  };

  // Voucher Line Helpers
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
    const updated = [...voucherLines];
    if (field === 'accountId') {
      const acc = accounts.find(a => a.id === value);
      if (acc) {
        updated[idx].accountId = acc.id;
        updated[idx].accountCode = acc.code;
        updated[idx].accountName = acc.name;
      }
    } else {
      (updated[idx] as any)[field] = value;
    }
    setVoucherLines(updated);
  };

  // Calculations for total debit and credit in modal
  const totalDebitSum = voucherLines.reduce((acc, l) => acc + (Number(l.debitAmount) || 0), 0);
  const totalCreditSum = voucherLines.reduce((acc, l) => acc + (Number(l.creditAmount) || 0), 0);
  const voucherDiff = Math.abs(Number((totalDebitSum - totalCreditSum).toFixed(2)));
  const isVoucherBalanced = voucherDiff === 0 && totalDebitSum > 0;

  // Create multi-line Voucher with Zod validation & anti-double submission lock
  const handleCreateVoucher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isVoucherBalanced) {
      showMsg(`Voucher is out of balance by AED ${voucherDiff.toFixed(2)}. Debits must equal Credits!`, 'error');
      return;
    }

    const payload = {
      type: voucherType,
      date: voucherDate,
      narration: voucherNarration,
      currency: 'AED' as const,
      exchangeRate: 1.0,
      totalDebit: Number(totalDebitSum.toFixed(2)),
      totalCredit: Number(totalCreditSum.toFixed(2)),
      status: 'DRAFT' as const,
      lines: voucherLines.map(l => ({
        accountId: l.accountId,
        debitAmount: Number(l.debitAmount) || 0,
        creditAmount: Number(l.creditAmount) || 0,
        memo: l.memo || voucherNarration
      }))
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
      const voucher = await FinanceService.addVoucher({
        ...payload,
        status: 'DRAFT'
      });

      showMsg(`Voucher ${voucher.voucherNo} created as Draft successfully!`);
      setShowNewVoucherModal(false);
      releaseLock('finance-create-voucher');
      notifyMutation('FINANCE', 'VOUCHER', 'CREATE', voucher.voucherNo);
      loadData();
      onRefreshAll();
    } catch (err: any) {
      releaseLock('finance-create-voucher');
      showMsg(err.message || 'Error creating voucher', 'error');
    } finally {
      setIsSavingVoucher(false);
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

  // Memoized Filtered COA Accounts with Hierarchical Sorting
  const filteredAccounts = useMemo(() => {
    const matches = accounts.filter(acc => {
      const accType = (acc.type || acc.classification || '').toString().toUpperCase();
      if (coaFilterPillar !== 'ALL' && accType !== coaFilterPillar.toUpperCase()) {
        return false;
      }
      if (coaSearchText.trim()) {
        const query = coaSearchText.toLowerCase();
        return (
          (acc.code || '').toLowerCase().includes(query) ||
          (acc.name || '').toLowerCase().includes(query) ||
          accType.toLowerCase().includes(query) ||
          (acc.sub_type || acc.subType || '').toLowerCase().includes(query)
        );
      }
      return true;
    });

    const sorted: COAAccount[] = [];
    const tier1 = matches.filter(a => (a.tierLevel === 1 || a.tier_level === 1 || !(a.code || '').includes('-')));
    for (const t1 of tier1) {
      sorted.push(t1);
      const tier2 = matches.filter(a => (a.tierLevel === 2 || a.tier_level === 2 || (a.code.endsWith('-00') && a.code !== t1.code)) && (a.parentCode === t1.code || a.parent_id === t1.id || (a.type || a.classification) === (t1.type || t1.classification)));
      for (const t2 of tier2) {
        if (!sorted.includes(t2)) sorted.push(t2);
        const prefix = t2.code.split('-')[0];
        const tier3 = matches.filter(a => 
          a.id !== t2.id &&
          (a.tierLevel === 3 || a.tier_level === 3 || Boolean(a.party_id || a.partyId) || !a.code.endsWith('-00')) && 
          (a.parentCode === t2.code || a.parent_id === t2.id || a.code.startsWith(`${prefix}-`))
        );
        for (const t3 of tier3) {
          if (!sorted.includes(t3)) sorted.push(t3);
        }
      }
    }
    for (const acc of matches) {
      if (!sorted.includes(acc)) sorted.push(acc);
    }
    return sorted;
  }, [accounts, coaFilterPillar, coaSearchText]);

  // General Ledger Entries strictly queried and aggregated via PostgreSQL window functions
  const filteredLedgers = ledgers;

  // Memoized GL Totals
  const { totalGlDebits, totalGlCredits } = useMemo(() => {
    let debits = 0;
    let credits = 0;
    for (let i = 0; i < filteredLedgers.length; i++) {
      debits += (filteredLedgers[i].debit || 0);
      credits += (filteredLedgers[i].credit || 0);
    }
    return { totalGlDebits: debits, totalGlCredits: credits };
  }, [filteredLedgers]);

  // Groups for SearchableSelect in General Ledger
  const glTargetGroups: SearchableGroup[] = useMemo(() => {
    return [
      {
        label: 'Chart of Accounts (COA)',
        options: accounts.map(a => ({
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
        options: parties.filter(p => p.type === 'CLIENT').map(p => ({
          value: `PTY:${p.id}`,
          label: `${p.code} - ${p.name}`,
          badge: 'CLIENT',
          badgeColor: 'bg-blue-100 text-blue-900 border-blue-300',
          sublabel: p.phone ? `Phone: ${p.phone}` : undefined
        }))
      },
      {
        label: 'Suppliers / Exporters',
        options: parties.filter(p => p.type === 'SUPPLIER').map(p => ({
          value: `PTY:${p.id}`,
          label: `${p.code} - ${p.name}`,
          badge: 'SUPPLIER',
          badgeColor: 'bg-amber-100 text-amber-900 border-amber-300',
          sublabel: p.phone ? `Phone: ${p.phone}` : undefined
        }))
      },
      {
        label: 'Clearing Agents',
        options: parties.filter(p => p.type === 'AGENT').map(p => ({
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
              onClick={() => setShowNewVoucherModal(true)}
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
              const pillarAccounts = accounts.filter(a => (a.type || a.classification || '').toString().toUpperCase() === p.key);
              const count = pillarAccounts.length;
              const totalVal = pillarAccounts
                .reduce((sum, a) => sum + (typeof a.current_balance === 'number' ? a.current_balance : (Number(a.currentBalance) || 0)), 0);

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
                  {filteredAccounts.map(acc => (
                    <COARow
                      key={acc.id}
                      acc={acc}
                      isDebitNormal={
                        (acc.type || acc.classification || '').toString().toUpperCase() === 'ASSET' ||
                        (acc.type || acc.classification || '').toString().toUpperCase() === 'EXPENSE'
                      }
                      onViewLedger={(accId) => {
                        setGlSelectedTarget(accId);
                        setSubTab('ledger');
                      }}
                    />
                  ))}
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
                  <span>Financial Vouchers Register ({vouchers.length} records)</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowNewVoucherModal(true)}
                  className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs uppercase tracking-wider shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Double-Entry Voucher</span>
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
                    {(vouchers || []).map(v => (
                      <tr key={v.id} className="hover:bg-amber-50/40 transition-colors">
                        <td className="px-3.5 py-2 font-bold text-amber-900">{v.voucherNo}</td>
                        <td className="px-3.5 py-2">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-bold">
                            {v.type}
                          </span>
                        </td>
                        <td className="px-3.5 py-2 text-slate-600">{v.date}</td>
                        <td className="px-3.5 py-2 max-w-xs truncate text-slate-800" title={v.narration}>
                          {v.narration}
                        </td>
                        <td className="px-3.5 py-2 text-right font-bold text-slate-900">
                          {Number(v.totalDebit || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-3.5 py-2 text-right font-bold text-slate-900">
                          {Number(v.totalCredit || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
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
                            onClick={() => {
                              setSelectedVoucherForPrint(v);
                              setIsPrintModalOpen(true);
                            }}
                            className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] uppercase tracking-wider inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Printer className="w-3 h-3" />
                            <span>Print</span>
                          </button>
                          {v.status === 'POSTED' && (
                            <button
                              type="button"
                              onClick={() => handleUnpostVoucher(v.id)}
                              className="px-2 py-1 rounded bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-[10px] uppercase tracking-wider border border-amber-300 inline-flex items-center gap-1 cursor-pointer"
                            >
                              <XCircle className="w-3 h-3" />
                              <span>Unpost</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
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
                <span>Total Debits: <strong className="text-emerald-800">AED {Number(totalGlDebits || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></span>
                <span>Total Credits: <strong className="text-rose-800">AED {Number(totalGlCredits || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></span>
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
                    (reports?.trialBalance || []).map((row, idx) => (
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
                      AED {Number((reports as any)?.trialBalanceMeta?.totalDebit ?? (reports?.trialBalance || []).reduce((sum, r) => sum + (Number(r.debit) || 0), 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-3 text-right">
                      AED {Number((reports as any)?.trialBalanceMeta?.totalCredit ?? (reports?.trialBalance || []).reduce((sum, r) => sum + (Number(r.credit) || 0), 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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

            <div className="space-y-4 font-mono text-xs">
              {/* 1. Operating Revenue */}
              <div>
                <div className="bg-emerald-50/80 p-2.5 rounded-lg font-bold text-emerald-950 uppercase tracking-wider flex justify-between font-sans border border-emerald-200">
                  <span>Operating Revenue (Wholesale & Retail Sales)</span>
                  <span className="font-mono text-sm">
                    AED {Number(reports?.incomeStatement?.revenue?.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="divide-y divide-slate-100 pl-4 pr-2 pt-1">
                  {(reports?.incomeStatement?.revenue?.accounts || []).length === 0 ? (
                    <div className="py-2 text-slate-400 font-sans italic text-center">No revenue recorded in this period</div>
                  ) : (
                    (reports?.incomeStatement?.revenue?.accounts || []).map((a: any, i: number) => (
                      <div key={i} className="py-1.5 flex justify-between">
                        <span className="font-sans text-slate-800">{a.code} - {a.name}</span>
                        <span className="font-bold text-slate-900">AED {Number(a.balance || 0).toFixed(2)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* 2. Cost of Goods Sold (COGS) */}
              {(reports?.incomeStatement?.cogs?.accounts || []).length > 0 && (
                <div>
                  <div className="bg-amber-50/80 p-2.5 rounded-lg font-bold text-amber-950 uppercase tracking-wider flex justify-between font-sans border border-amber-200">
                    <span>Cost of Goods Sold (Direct Costs, Freight & Customs)</span>
                    <span className="font-mono text-sm">
                      AED {Number(reports?.incomeStatement?.cogs?.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="divide-y divide-slate-100 pl-4 pr-2 pt-1">
                    {(reports?.incomeStatement?.cogs?.accounts || []).map((a: any, i: number) => (
                      <div key={i} className="py-1.5 flex justify-between">
                        <span className="font-sans text-slate-800">{a.code} - {a.name}</span>
                        <span className="font-bold text-slate-900">AED {Number(a.balance || 0).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Gross Profit Summary */}
              <div className="p-2.5 rounded-lg bg-emerald-50/50 border border-emerald-200 flex items-center justify-between font-sans font-bold text-xs text-emerald-950">
                <span className="uppercase tracking-wider">Gross Operating Profit:</span>
                <span className="font-mono font-black text-emerald-900 text-sm">
                  AED {Number(reports?.incomeStatement?.grossProfit ?? ((reports?.incomeStatement?.revenue?.total || 0) - (reports?.incomeStatement?.cogs?.total || 0))).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>

              {/* 3. Operating Expenses */}
              <div>
                <div className="bg-rose-50/80 p-2.5 rounded-lg font-bold text-rose-950 uppercase tracking-wider flex justify-between font-sans border border-rose-200">
                  <span>Operating Expenses (Overheads & Administration)</span>
                  <span className="font-mono text-sm">
                    AED {Number(reports?.incomeStatement?.operatingExpenses?.total ?? reports?.incomeStatement?.expenses?.total ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="divide-y divide-slate-100 pl-4 pr-2 pt-1">
                  {((reports?.incomeStatement?.operatingExpenses?.accounts ?? reports?.incomeStatement?.expenses?.accounts) || []).length === 0 ? (
                    <div className="py-2 text-slate-400 font-sans italic text-center">No operating expenses recorded in this period</div>
                  ) : (
                    ((reports?.incomeStatement?.operatingExpenses?.accounts ?? reports?.incomeStatement?.expenses?.accounts) || []).map((a: any, i: number) => (
                      <div key={i} className="py-1.5 flex justify-between">
                        <span className="font-sans text-slate-800">{a.code} - {a.name}</span>
                        <span className="font-bold text-slate-900">AED {Number(a.balance || 0).toFixed(2)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Net Profit Summary Row */}
              <div className="pt-4 border-t-2 border-amber-900/60">
                <div className="p-3.5 rounded-xl bg-gradient-to-r from-amber-100/90 to-amber-200/80 flex items-center justify-between font-serif font-black text-sm text-amber-950 shadow-xs">
                  <span className="uppercase tracking-wider">Net Operating Profit / (Loss):</span>
                  <span className={`font-mono text-base font-black ${
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
              {/* Left Col: ASSETS */}
              <div className="space-y-3">
                <div className="bg-blue-50/80 p-2.5 rounded-lg font-bold text-blue-950 uppercase tracking-wider flex justify-between font-sans border border-blue-200">
                  <span>Total Assets (Current & Fixed)</span>
                  <span className="font-mono text-sm">
                    AED {Number(reports?.balanceSheet?.assets?.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="divide-y divide-slate-100 pl-2">
                  {(reports?.balanceSheet?.assets?.accounts || []).length === 0 ? (
                    <div className="py-2 text-slate-400 font-sans italic text-center">No asset accounts found</div>
                  ) : (
                    (reports?.balanceSheet?.assets?.accounts || []).map((a: any, i: number) => (
                      <div key={i} className="py-2 flex justify-between">
                        <span className="font-sans text-slate-800">{a.code} - {a.name}</span>
                        <span className="font-bold text-slate-900">AED {Number(a.balance || 0).toFixed(2)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Right Col: LIABILITIES & EQUITY */}
              <div className="space-y-4">
                {/* Liabilities */}
                <div className="space-y-2">
                  <div className="bg-rose-50/80 p-2.5 rounded-lg font-bold text-rose-950 uppercase tracking-wider flex justify-between font-sans border border-rose-200">
                    <span>Total Liabilities (Payables & Dues)</span>
                    <span className="font-mono text-sm">
                      AED {Number(reports?.balanceSheet?.liabilities?.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="divide-y divide-slate-100 pl-2">
                    {(reports?.balanceSheet?.liabilities?.accounts || []).length === 0 ? (
                      <div className="py-1.5 text-slate-400 font-sans italic text-center">No liability accounts found</div>
                    ) : (
                      (reports?.balanceSheet?.liabilities?.accounts || []).map((a: any, i: number) => (
                        <div key={i} className="py-1.5 flex justify-between">
                          <span className="font-sans text-slate-800">{a.code} - {a.name}</span>
                          <span className="font-bold text-slate-900">AED {Number(a.balance || 0).toFixed(2)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Equity */}
                <div className="space-y-2">
                  <div className="bg-purple-50/80 p-2.5 rounded-lg font-bold text-purple-950 uppercase tracking-wider flex justify-between font-sans border border-purple-200">
                    <span>Shareholders' Equity & Retained Earnings</span>
                    <span className="font-mono text-sm">
                      AED {Number(reports?.balanceSheet?.equity?.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="divide-y divide-slate-100 pl-2">
                    {(reports?.balanceSheet?.equity?.accounts || []).length === 0 ? (
                      <div className="py-1.5 text-slate-400 font-sans italic text-center">No equity accounts found</div>
                    ) : (
                      (reports?.balanceSheet?.equity?.accounts || []).map((a: any, i: number) => (
                        <div key={i} className="py-1.5 flex justify-between">
                          <span className="font-sans text-slate-800">{a.code ? `${a.code} - ` : ''}{a.name}</span>
                          <span className="font-bold text-slate-900">AED {Number(a.balance || 0).toFixed(2)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Balancing Proof Bar */}
            <div className="mt-6 pt-4 border-t-2 border-amber-900/60">
              <div className={`p-3 rounded-xl border flex flex-wrap items-center justify-between gap-2 font-mono text-xs ${
                reports?.balanceSheet?.balanced
                  ? 'bg-emerald-50/80 border-emerald-300'
                  : 'bg-rose-50/80 border-rose-300'
              }`}>
                <div className={`flex items-center gap-2 font-bold font-sans ${
                  reports?.balanceSheet?.balanced ? 'text-emerald-800' : 'text-rose-800'
                }`}>
                  <ShieldCheck className="w-4 h-4" />
                  <span>
                    Balance Sheet Status:{' '}
                    <strong>{reports?.balanceSheet?.balanced ? 'BALANCED TO ZERO DIFFERENCE' : 'OUT OF BALANCE'}</strong>
                  </span>
                </div>
                <div className="font-bold text-slate-900">
                  Assets (AED {Number(reports?.balanceSheet?.assets?.total || 0).toFixed(2)}) = Liab + Equity (AED {Number(reports?.balanceSheet?.totalLiabilitiesAndEquity ?? ((reports?.balanceSheet?.liabilities?.total || 0) + (reports?.balanceSheet?.equity?.total || 0))).toFixed(2)})
                  {!reports?.balanceSheet?.balanced && Number(reports?.balanceSheet?.difference || 0) !== 0 && (
                    <span className="text-rose-700 font-bold ml-2 font-sans">
                      (Diff: AED {Number(reports?.balanceSheet?.difference || 0).toFixed(2)})
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
        <CourierCODReconciliation onRefreshAll={loadData} />
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
                      if (val === 'ASSET') setNewAccCode('1140-00');
                      if (val === 'LIABILITY') setNewAccCode('2140-00');
                      if (val === 'EQUITY') setNewAccCode('3130-00');
                      if (val === 'REVENUE') setNewAccCode('4130-00');
                      if (val === 'EXPENSE') setNewAccCode('5220-00');
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
                        const parentT1 = accounts.find(a => a.classification === newAccClassification && a.tierLevel === 1);
                        if (parentT1) setNewAccParentCode(parentT1.code);
                        setNewAccCode(newAccClassification === 'ASSET' ? '1150-00' : '5150-00');
                      } else if (lvl === 3) {
                        const parentT2 = accounts.find(a => a.classification === newAccClassification && a.tierLevel === 2);
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
                      .filter(a => a.classification === newAccClassification && a.tierLevel === (newAccTierLevel - 1))
                      .map(parentAcc => ({
                        value: parentAcc.code,
                        label: `${parentAcc.code} - ${parentAcc.name}`,
                        badge: parentAcc.classification
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
                    <option value="AED">AED (Dirham)</option>
                    <option value="USD">USD (US Dollar)</option>
                    <option value="EUR">EUR (Euro)</option>
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
                  <h4 className="font-serif font-bold text-slate-900 text-sm">Post Accounting Voucher</h4>
                  <p className="text-[11px] text-slate-500">Multi-row dual-entry debit and credit builder</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowNewVoucherModal(false)}
                className="text-slate-400 hover:text-slate-700 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateVoucher} className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Voucher Type *
                  </label>
                  <select
                    value={voucherType}
                    onChange={e => setVoucherType(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-amber-200 text-xs font-bold bg-[#fdfcf9] focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="JV">JV - Journal Voucher</option>
                    <option value="BPV">BPV - Bank Payment</option>
                    <option value="BRV">BRV - Bank Receipt</option>
                    <option value="CPV">CPV - Cash Payment</option>
                    <option value="CRV">CRV - Cash Receipt</option>
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
                    Currency
                  </label>
                  <input
                    type="text"
                    disabled
                    value="AED (Dirham)"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-slate-100 font-bold text-slate-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Narration / Particulars *
                </label>
                <input
                  type="text"
                  value={voucherNarration}
                  onChange={e => setVoucherNarration(e.target.value)}
                  placeholder="e.g. Payment for customs duty, port clearance, or partner share"
                  required
                  className="w-full px-3 py-2 rounded-lg border border-amber-200 text-xs bg-[#fdfcf9] focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* Multi-Line Debit & Credit Table */}
              <div className="border border-amber-200 rounded-xl overflow-hidden">
                <div className="bg-amber-50/70 p-2.5 flex items-center justify-between border-b border-amber-200 text-xs font-bold text-amber-950">
                  <span>Double-Entry Account Line Items</span>
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
                          placeholder="Debit (AED)"
                          className="w-full text-right p-1.5 border border-slate-300 rounded font-mono text-[11px] font-bold text-slate-900 bg-white"
                        />
                      </div>

                      <div className="col-span-3">
                        <input
                          type="number"
                          step="0.01"
                          value={line.creditAmount || ''}
                          onChange={e => handleUpdateVoucherLine(idx, 'creditAmount', parseFloat(e.target.value) || 0)}
                          placeholder="Credit (AED)"
                          className="w-full text-right p-1.5 border border-slate-300 rounded font-mono text-[11px] font-bold text-slate-900 bg-white"
                        />
                      </div>

                      <div className="col-span-1 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveVoucherLine(idx)}
                          className="p-1 rounded text-rose-600 hover:bg-rose-100"
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
                    <strong className="text-slate-900">AED {totalDebitSum.toFixed(2)}</strong>
                    <span className="mx-2 text-slate-400">|</span>
                    <span className="text-slate-600">Total Credit: </span>
                    <strong className="text-slate-900">AED {totalCreditSum.toFixed(2)}</strong>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {isVoucherBalanced ? (
                      <span className="text-emerald-800 font-bold flex items-center gap-1">
                        <ShieldCheck className="w-4 h-4" />
                        <span>Balanced (0.00 AED Diff)</span>
                      </span>
                    ) : (
                      <span className="text-rose-800 font-bold">
                        Out of balance by AED {voucherDiff.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-amber-100">
                <button
                  type="button"
                  onClick={() => setShowNewVoucherModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!isVoucherBalanced || isSavingVoucher}
                  className="px-5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs hover:shadow transition-all disabled:opacity-50"
                >
                  {isSavingVoucher ? 'Saving...' : 'Save & Post Voucher'}
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
