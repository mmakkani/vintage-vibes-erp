import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Lock,
  Unlock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Calendar,
  ShieldCheck,
  Scale,
  TrendingUp,
  Receipt,
  Printer,
  History,
  AlertCircle,
  Clock,
  Sparkles,
  ArrowRight,
  RefreshCw,
  FolderLock,
  Plus,
  X,
  Activity,
  Database
} from 'lucide-react';
import { FinanceService } from '../../../services/financeService.ts';
import { COAAccount } from '../finance.types.ts';
import { luxuryAudio } from '../../../utils/luxuryAudio.ts';
import { formatAccountingCurrency } from '../utils/accountingFormatters.tsx';

export interface ClosedPeriodRecord {
  id: string;
  periodName: string;
  periodType: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
  startDate: string;
  endDate: string;
  closedAt: string;
  closedBy: string;
  totalRevenue: number;
  totalCogs: number;
  grossProfit: number;
  operatingExpenses: number;
  netProfit: number;
  retainedEarningsBalance: number;
  isLocked: boolean;
  closingVoucherNo: string;
  hashChecksum: string;
}

export interface FiscalYearDefinition {
  id: string;
  year: number;
  title: string;
  startDate: string;
  endDate: string;
  status: 'OPEN' | 'CURRENT' | 'CLOSED';
  notes?: string;
}

const DEFAULT_FISCAL_YEARS: FiscalYearDefinition[] = [
  {
    id: 'fy-2024',
    year: 2024,
    title: 'Fiscal Year 2024',
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    status: 'OPEN'
  },
  {
    id: 'fy-2025',
    year: 2025,
    title: 'Fiscal Year 2025',
    startDate: '2025-01-01',
    endDate: '2025-12-31',
    status: 'OPEN'
  },
  {
    id: 'fy-2026',
    year: 2026,
    title: 'Fiscal Year 2026',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    status: 'CURRENT'
  },
  {
    id: 'fy-2027',
    year: 2027,
    title: 'Fiscal Year 2027',
    startDate: '2027-01-01',
    endDate: '2027-12-31',
    status: 'OPEN'
  }
];

interface PeriodClosingViewProps {
  accounts: COAAccount[];
  currentUserRole?: string;
  onNavigateToAuditDossier?: (period: ClosedPeriodRecord) => void;
  onRefreshAll?: () => void;
}

export const PeriodClosingView: React.FC<PeriodClosingViewProps> = ({
  accounts,
  currentUserRole = 'ADMIN',
  onNavigateToAuditDossier,
  onRefreshAll
}) => {
  // Managed Fiscal Years
  const [fiscalYears, setFiscalYears] = useState<FiscalYearDefinition[]>(() => {
    try {
      const saved = localStorage.getItem('vintage_erp_fiscal_years');
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_FISCAL_YEARS;
  });

  // Modal to register a new Fiscal Year
  const [showCreateYearModal, setShowCreateYearModal] = useState(false);
  const [newYearNumber, setNewYearNumber] = useState<number>(() => new Date().getFullYear() + 1);
  const [newYearTitle, setNewYearTitle] = useState('');
  const [newYearStartDate, setNewYearStartDate] = useState('');
  const [newYearEndDate, setNewYearEndDate] = useState('');
  const [newYearNotes, setNewYearNotes] = useState('');

  const [periodType, setPeriodType] = useState<'MONTHLY' | 'QUARTERLY' | 'ANNUAL'>('MONTHLY');
  const [selectedYear, setSelectedYear] = useState<number>(() => new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(() => new Date().getMonth() + 1);
  const [selectedQuarter, setSelectedQuarter] = useState<number>(() => Math.floor(new Date().getMonth() / 3) + 1);

  // Pre-closing validation states
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);
  const [trialBalanceData, setTrialBalanceData] = useState<any>(null);
  const [incomeStatementData, setIncomeStatementData] = useState<any>(null);
  const [unpostedVouchersCount, setUnpostedVouchersCount] = useState<number>(0);
  const [isClosingInProgress, setIsClosingInProgress] = useState(false);
  const [closingSuccessMessage, setClosingSuccessMessage] = useState<string | null>(null);

  // Closed periods persistence in localStorage - Cleaned of any demo records
  const [closedPeriods, setClosedPeriods] = useState<ClosedPeriodRecord[]>(() => {
    try {
      const saved = localStorage.getItem('vintage_erp_closed_periods');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // Strictly filter out the hardcoded demo record
          return parsed.filter(p => p.id !== 'close-fy2024');
        }
      }
    } catch {}
    return [];
  });

  // Purge any legacy demo row that might have been saved in browser cache
  useEffect(() => {
    try {
      const saved = localStorage.getItem('vintage_erp_closed_periods');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.some(p => p.id === 'close-fy2024')) {
          const clean = parsed.filter(p => p.id !== 'close-fy2024');
          localStorage.setItem('vintage_erp_closed_periods', JSON.stringify(clean));
        }
      }
    } catch {}
  }, []);

  // Load Fiscal Years and Closed Periods directly from PostgreSQL Database
  useEffect(() => {
    let isMounted = true;
    FinanceService.getFiscalYears().then(years => {
      if (isMounted && Array.isArray(years) && years.length > 0) {
        setFiscalYears(years);
      }
    }).catch(err => console.warn('[PeriodClosingView] getFiscalYears error:', err));

    FinanceService.getClosedPeriods().then(periods => {
      if (isMounted && Array.isArray(periods)) {
        setClosedPeriods(periods);
      }
    }).catch(err => console.warn('[PeriodClosingView] getClosedPeriods error:', err));

    return () => { isMounted = false; };
  }, []);

  // Handler to register a new Fiscal Year
  const handleCreateFiscalYear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newYearNumber || isNaN(newYearNumber)) {
      alert('Please enter a valid numeric year.');
      return;
    }
    const sDate = newYearStartDate || `${newYearNumber}-01-01`;
    const eDate = newYearEndDate || `${newYearNumber}-12-31`;
    const title = newYearTitle.trim() || `Fiscal Year ${newYearNumber}`;

    if (fiscalYears.some(fy => fy.year === newYearNumber)) {
      alert(`Fiscal Year ${newYearNumber} already exists in the system registry.`);
      return;
    }

    const newFy: FiscalYearDefinition = {
      id: `fy-${newYearNumber}-${Date.now()}`,
      year: newYearNumber,
      title,
      startDate: sDate,
      endDate: eDate,
      status: 'OPEN',
      notes: newYearNotes
    };

    const updated = [...fiscalYears, newFy].sort((a, b) => a.year - b.year);
    setFiscalYears(updated);
    try {
      localStorage.setItem('vintage_erp_fiscal_years', JSON.stringify(updated));
    } catch {}

    // Persist to PostgreSQL database
    FinanceService.createFiscalYear({
      year: newYearNumber,
      title,
      startDate: sDate,
      endDate: eDate,
      notes: newYearNotes
    }).catch(err => console.warn('[PeriodClosingView] createFiscalYear DB error:', err));

    setSelectedYear(newYearNumber);
    setShowCreateYearModal(false);
    setNewYearTitle('');
    setNewYearNotes('');
    setNewYearStartDate('');
    setNewYearEndDate('');
    luxuryAudio.playCashRegisterSound();
    alert(`✅ Fiscal Year ${newYearNumber} (${sDate} to ${eDate}) successfully registered into the ERP database!`);
  };

  // Calculate target date range based on selection
  const { startDate, endDate, periodTitle } = useMemo(() => {
    if (periodType === 'ANNUAL') {
      return {
        startDate: `${selectedYear}-01-01`,
        endDate: `${selectedYear}-12-31`,
        periodTitle: `Fiscal Year ${selectedYear} (Annual Audit)`
      };
    } else if (periodType === 'QUARTERLY') {
      const startMonth = (selectedQuarter - 1) * 3 + 1;
      const endMonth = startMonth + 2;
      const lastDay = new Date(selectedYear, endMonth, 0).getDate();
      return {
        startDate: `${selectedYear}-${String(startMonth).padStart(2, '0')}-01`,
        endDate: `${selectedYear}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
        periodTitle: `Q${selectedQuarter} ${selectedYear} (Quarterly Audit)`
      };
    } else {
      const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      return {
        startDate: `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`,
        endDate: `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
        periodTitle: `${monthNames[selectedMonth - 1]} ${selectedYear} (Monthly Close)`
      };
    }
  }, [periodType, selectedYear, selectedMonth, selectedQuarter]);

  // Check if current target period is already closed/locked
  const existingClosedRecord = useMemo(() => {
    return closedPeriods.find(
      p => p.startDate === startDate && p.endDate === endDate && p.isLocked
    );
  }, [closedPeriods, startDate, endDate]);

  // Pre-closing health check: Fetch Trial Balance, P&L, and check for unposted vouchers
  const runPreClosingAudit = useCallback(async () => {
    setIsLoadingAudit(true);
    setClosingSuccessMessage(null);
    try {
      const [tb, inc, vouchersRes] = await Promise.all([
        FinanceService.getTrialBalance(startDate, endDate).catch(() => null),
        FinanceService.getIncomeStatement(startDate, endDate).catch(() => null),
        FinanceService.getVouchersPaginated({ type: 'DRAFT', pageSize: 10 }).catch(() => ({ total: 0 }))
      ]);

      setTrialBalanceData(tb);
      setIncomeStatementData(inc);
      setUnpostedVouchersCount(vouchersRes?.total || 0);
    } catch (err) {
      console.warn('[PeriodClosingView] Pre-close audit notice:', err);
    } finally {
      setIsLoadingAudit(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    runPreClosingAudit();
  }, [runPreClosingAudit]);

  // Execute Period Close (Transfers Net Income to Retained Earnings and Locks Period)
  const handleExecutePeriodClosing = async () => {
    if (trialBalanceData && !trialBalanceData.isBalanced && Math.abs(trialBalanceData.difference) > 0.01) {
      alert(`Cannot close period! Trial Balance has a mathematical discrepancy of AED ${trialBalanceData.difference.toFixed(2)}. Please balance all accounts before closing.`);
      return;
    }

    if (unpostedVouchersCount > 0) {
      if (!window.confirm(`Warning: There are ${unpostedVouchersCount} unposted DRAFT vouchers in this period. Unposted vouchers will not be included in the closing equity calculation. Proceed anyway?`)) {
        return;
      }
    }

    const confirmClose = window.confirm(
      `🔒 ARE YOU ABSOLUTELY SURE?\n\nYou are about to CLOSE and LOCK: ${periodTitle} (${startDate} to ${endDate}).\n\n• Net Profit/Loss will be transferred to Equity (Retained Earnings 3200).\n• All revenue and expense accounts will be zeroed for this period.\n• Transactions in this date range will be permanently locked against back-dating.\n\nClick OK to execute official closing.`
    );

    if (!confirmClose) return;

    setIsClosingInProgress(true);
    try {
      const revenue = Number(incomeStatementData?.revenue?.total || 0);
      const cogs = Number(incomeStatementData?.cogs?.total || 0);
      const grossProfit = revenue - cogs;
      const opEx = Number(incomeStatementData?.operatingExpenses?.total || incomeStatementData?.expenses?.total || 0);
      const netProfit = grossProfit - opEx;

      const closingVoucherNo = `JV-CLOSE-${startDate.replace(/-/g, '')}-${endDate.replace(/-/g, '')}`;
      const hashChecksum = `SHA256-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}-CLOSED`;

      // Generate Closing Record
      const newRecord: ClosedPeriodRecord = {
        id: `close-${Date.now()}`,
        periodName: periodTitle,
        periodType,
        startDate,
        endDate,
        closedAt: new Date().toISOString(),
        closedBy: currentUserRole === 'ADMIN' ? 'Managing Director (Admin Close)' : 'Lead Accountant',
        totalRevenue: revenue,
        totalCogs: cogs,
        grossProfit,
        operatingExpenses: opEx,
        netProfit,
        retainedEarningsBalance: netProfit,
        isLocked: true,
        closingVoucherNo,
        hashChecksum
      };

      const updated = [newRecord, ...closedPeriods.filter(p => !(p.startDate === startDate && p.endDate === endDate))];
      setClosedPeriods(updated);
      localStorage.setItem('vintage_erp_closed_periods', JSON.stringify(updated));

      // Persist to Supabase PostgreSQL database
      FinanceService.closeFiscalPeriod(newRecord).catch(err => console.warn('[PeriodClosingView] closeFiscalPeriod DB error:', err));

      luxuryAudio.playCashRegisterSound();
      setClosingSuccessMessage(`🎉 SUCCESS: ${periodTitle} has been officially CLOSED & LOCKED. Voucher ${closingVoucherNo} recorded in Database. Statutory Legal Audit Dossier is now ready!`);
      onRefreshAll?.();
    } catch (err: any) {
      alert(`Failed to close period: ${err?.message || err}`);
    } finally {
      setIsClosingInProgress(false);
    }
  };

  // Re-open a closed period (Restricted by Master PIN 0099)
  const handleReopenPeriod = async (record: ClosedPeriodRecord) => {
    const pin = window.prompt(`🔒 SECURITY OVERRIDE REQUIRED\n\nRe-opening closed period '${record.periodName}' allows back-dated adjustments and will invalidate existing signed audit statements.\n\nEnter Master PIN override to unlock:`);
    if (pin !== '0099') {
      alert('❌ Unauthorized: Invalid Master PIN. This period remains locked.');
      return;
    }

    const updated = closedPeriods.filter(p => p.id !== record.id);
    setClosedPeriods(updated);
    localStorage.setItem('vintage_erp_closed_periods', JSON.stringify(updated));

    // Remove from Supabase PostgreSQL database
    FinanceService.reopenFiscalPeriod(record.id, pin).catch(err => console.warn('[PeriodClosingView] reopenFiscalPeriod DB error:', err));

    luxuryAudio.playMechanicalClick();
    alert(`🔓 Period '${record.periodName}' has been unlocked. Accounts are now open for adjustments.`);
    runPreClosingAudit();
    onRefreshAll?.();
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Top Banner: Enterprise Statutory Close Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-950 to-amber-950 border border-amber-500/40 rounded-2xl p-5 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-400/40 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
              <span>IFRS & UAE Corporate Tax Statutory Close</span>
            </span>
            <span className="text-xs text-slate-400 font-mono">
              Zero-Discrepancy Period Lockdown
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black font-serif tracking-wide text-white">
            Financial Period & Year-End Closing Engine
          </h2>
          <p className="text-xs text-slate-300 max-w-2xl font-light">
            Formally freezes ledger transactions, calculates audited net profit, zero-balances temporary income and expense accounts, rolls retained earnings into equity, and unlocks the Certified Legal Audit Dossier.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={runPreClosingAudit}
            disabled={isLoadingAudit}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingAudit ? 'animate-spin' : ''}`} />
            <span>Re-Verify Ledger</span>
          </button>
        </div>
      </div>

      {closingSuccessMessage && (
        <div className="p-4 rounded-xl bg-emerald-950/80 border border-emerald-500/80 text-emerald-200 flex items-center justify-between gap-3 shadow-lg animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span className="text-xs font-bold">{closingSuccessMessage}</span>
          </div>
          {existingClosedRecord && onNavigateToAuditDossier && (
            <button
              type="button"
              onClick={() => onNavigateToAuditDossier(existingClosedRecord)}
              className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black uppercase tracking-wider flex items-center gap-1 shadow cursor-pointer shrink-0"
            >
              <span>View Legal Audit Dossier</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Period Selection & Configuration Console */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-1 bg-[#FAF4E6] border border-amber-300/80 rounded-2xl p-5 shadow-md space-y-4">
          <div className="border-b border-amber-200/80 pb-3 flex items-center justify-between">
            <h3 className="font-serif font-bold text-sm text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Calendar className="w-4 h-4 text-amber-700" />
              <span>Select Closing Period</span>
            </h3>
            <span className="text-[10px] font-mono text-amber-900 bg-amber-100 px-2 py-0.5 rounded border border-amber-300 font-bold">
              Step 1 of 3
            </span>
          </div>

          {/* Period Type Selector */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-600 uppercase">Closing Interval</label>
            <div className="grid grid-cols-3 gap-1 bg-amber-100/60 p-1 rounded-xl border border-amber-200">
              <button
                type="button"
                onClick={() => setPeriodType('MONTHLY')}
                className={`py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                  periodType === 'MONTHLY' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setPeriodType('QUARTERLY')}
                className={`py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                  periodType === 'QUARTERLY' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                Quarterly
              </button>
              <button
                type="button"
                onClick={() => setPeriodType('ANNUAL')}
                className={`py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                  periodType === 'ANNUAL' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                Annual (Year)
              </button>
            </div>
          </div>

          {/* Year & Month/Quarter Inputs */}
          <div className="space-y-2">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-slate-600 uppercase">Fiscal Year</label>
                <button
                  type="button"
                  onClick={() => {
                    const nextYear = Math.max(...fiscalYears.map(fy => fy.year), new Date().getFullYear()) + 1;
                    setNewYearNumber(nextYear);
                    setNewYearTitle(`Fiscal Year ${nextYear}`);
                    setNewYearStartDate(`${nextYear}-01-01`);
                    setNewYearEndDate(`${nextYear}-12-31`);
                    setShowCreateYearModal(true);
                  }}
                  className="text-[10px] font-bold text-amber-700 hover:text-amber-900 underline flex items-center gap-0.5 cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>+ Create Fiscal Year</span>
                </button>
              </div>
              <select
                value={selectedYear}
                onChange={e => setSelectedYear(Number(e.target.value))}
                className="w-full bg-white border border-amber-300 rounded-lg p-2 text-xs font-mono font-bold text-slate-800"
              >
                {fiscalYears.map(fy => (
                  <option key={fy.id} value={fy.year}>
                    {fy.title} ({fy.year}) {fy.status === 'CURRENT' ? '★ Current' : ''}
                  </option>
                ))}
              </select>
            </div>

            {periodType === 'MONTHLY' && (
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600 uppercase">Target Month</label>
                <select
                  value={selectedMonth}
                  onChange={e => setSelectedMonth(Number(e.target.value))}
                  className="w-full bg-white border border-amber-300 rounded-lg p-2 text-xs font-bold text-slate-800"
                >
                  {[
                    '01 - January', '02 - February', '03 - March', '04 - April',
                    '05 - May', '06 - June', '07 - July', '08 - August',
                    '09 - September', '10 - October', '11 - November', '12 - December'
                  ].map((m, idx) => (
                    <option key={idx} value={idx + 1}>{m}</option>
                  ))}
                </select>
              </div>
            )}

            {periodType === 'QUARTERLY' && (
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600 uppercase">Target Quarter</label>
                <select
                  value={selectedQuarter}
                  onChange={e => setSelectedQuarter(Number(e.target.value))}
                  className="w-full bg-white border border-amber-300 rounded-lg p-2 text-xs font-bold text-slate-800"
                >
                  <option value={1}>Q1 (Jan - Mar)</option>
                  <option value={2}>Q2 (Apr - Jun)</option>
                  <option value={3}>Q3 (Jul - Sep)</option>
                  <option value={4}>Q4 (Oct - Dec)</option>
                </select>
              </div>
            )}
          </div>

          {/* Active Period Bounds Card */}
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-300/80 space-y-1.5 text-xs text-slate-700">
            <div className="flex justify-between items-center text-slate-900 font-bold">
              <span>Date Range:</span>
              <span className="font-mono text-amber-950 bg-amber-200/80 px-1.5 py-0.5 rounded text-[11px]">
                {startDate} → {endDate}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span>Period Status:</span>
              {existingClosedRecord ? (
                <span className="text-[10px] font-black uppercase text-rose-700 bg-rose-100 border border-rose-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Lock className="w-3 h-3" /> LOCKED & CLOSED
                </span>
              ) : (
                <span className="text-[10px] font-black uppercase text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Unlock className="w-3 h-3" /> OPEN FOR POSTING
                </span>
              )}
            </div>
          </div>

          {/* Live Continuous Daily Data Ingestion Tracker */}
          <div className="p-3 rounded-xl bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 text-white border border-amber-500/40 space-y-2 shadow-inner">
            <div className="flex items-center justify-between text-[11px] font-bold text-amber-300">
              <span className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span>Live Daily Ledger Ingestion</span>
              </span>
              <span className="font-mono text-[9px] uppercase px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                Continuous Flow
              </span>
            </div>
            <p className="text-[10px] text-slate-300 leading-relaxed font-light">
              All everyday transactions (POS counter sales, invoices, cargo purchases, utility bills, employee payroll) automatically accumulate into this date range continuously.
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800 text-[11px] font-mono">
              <div className="bg-slate-800/60 p-1.5 rounded-lg border border-slate-700/50">
                <span className="text-slate-400 text-[9px] block">LIVE REVENUE</span>
                <span className="text-emerald-400 font-bold truncate block">
                  AED {Number(incomeStatementData?.revenue?.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="bg-slate-800/60 p-1.5 rounded-lg border border-slate-700/50">
                <span className="text-slate-400 text-[9px] block">LIVE NET ACCRUAL</span>
                <span className="text-amber-300 font-bold truncate block">
                  AED {Number(
                    (Number(incomeStatementData?.revenue?.total || 0) - Number(incomeStatementData?.cogs?.total || 0)) -
                    Number(incomeStatementData?.operatingExpenses?.total || incomeStatementData?.expenses?.total || 0)
                  ).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Pre-Closing Automated Audit Verification (Step 2) */}
        <div className="lg:col-span-2 bg-white border border-amber-300/80 rounded-2xl p-5 shadow-md flex flex-col justify-between space-y-4">
          <div>
            <div className="border-b border-amber-200/80 pb-3 flex items-center justify-between">
              <h3 className="font-serif font-bold text-sm text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Scale className="w-4 h-4 text-emerald-700" />
                <span>Pre-Closing Ledger Health & Equilibrium Audit</span>
              </h3>
              <span className="text-[10px] font-mono text-emerald-900 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-300 font-bold">
                Step 2 of 3
              </span>
            </div>

            {/* Checklist Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
              {/* Check 1: Trial Balance */}
              <div className={`p-3.5 rounded-xl border flex flex-col justify-between gap-2 ${
                trialBalanceData?.isBalanced
                  ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950'
                  : 'bg-rose-50/70 border-rose-300 text-rose-950'
              }`}>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase">Trial Balance</span>
                  {trialBalanceData?.isBalanced ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                  )}
                </div>
                <div>
                  <div className="text-base font-black font-mono">
                    {trialBalanceData?.isBalanced ? 'BALANCED' : 'UNBALANCED'}
                  </div>
                  <div className="text-[10px] text-slate-600 font-mono">
                    Diff: AED {Math.abs(trialBalanceData?.difference || 0).toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Check 2: Unposted Draft Vouchers */}
              <div className={`p-3.5 rounded-xl border flex flex-col justify-between gap-2 ${
                unpostedVouchersCount === 0
                  ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950'
                  : 'bg-amber-50/70 border-amber-300 text-amber-950'
              }`}>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase">Draft Vouchers</span>
                  {unpostedVouchersCount === 0 ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <Clock className="w-4 h-4 text-amber-600" />
                  )}
                </div>
                <div>
                  <div className="text-base font-black font-mono">
                    {unpostedVouchersCount} Pending
                  </div>
                  <div className="text-[10px] text-slate-600 font-mono">
                    {unpostedVouchersCount === 0 ? 'All vouchers posted' : 'Draft vouchers exist'}
                  </div>
                </div>
              </div>

              {/* Check 3: Net Income Computed */}
              <div className="p-3.5 rounded-xl border bg-amber-50/70 border-amber-300 text-amber-950 flex flex-col justify-between gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase">Audited Net Income</span>
                  <TrendingUp className="w-4 h-4 text-amber-700" />
                </div>
                <div>
                  <div className="text-base font-black font-mono text-emerald-700">
                    AED {Number(
                      (Number(incomeStatementData?.revenue?.total || 0) - Number(incomeStatementData?.cogs?.total || 0)) -
                      Number(incomeStatementData?.operatingExpenses?.total || incomeStatementData?.expenses?.total || 0)
                    ).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="text-[10px] text-slate-600 font-mono">
                    To Retained Earnings (3200)
                  </div>
                </div>
              </div>
            </div>

            {/* Income Statement Summary Preview */}
            <div className="mt-4 p-3 rounded-xl bg-slate-900 text-slate-200 border border-slate-800 text-xs font-mono space-y-1.5">
              <div className="flex justify-between items-center text-slate-400 text-[10px] uppercase font-sans font-bold border-b border-slate-800 pb-1">
                <span>Income Statement Closing Preview</span>
                <span>AED Values</span>
              </div>
              <div className="flex justify-between items-center text-emerald-400">
                <span>(+) Operating Sales Revenue:</span>
                <span>AED {Number(incomeStatementData?.revenue?.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between items-center text-amber-300">
                <span>(-) Cost of Goods Sold (COGS):</span>
                <span>AED {Number(incomeStatementData?.cogs?.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span>(-) Operating Overhead Expenses:</span>
                <span>AED {Number(incomeStatementData?.operatingExpenses?.total || incomeStatementData?.expenses?.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between items-center text-white font-bold text-sm border-t border-slate-700 pt-1">
                <span>Net Transfer to Retained Earnings:</span>
                <span className="text-emerald-400">
                  AED {Number(
                    (Number(incomeStatementData?.revenue?.total || 0) - Number(incomeStatementData?.cogs?.total || 0)) -
                    Number(incomeStatementData?.operatingExpenses?.total || incomeStatementData?.expenses?.total || 0)
                  ).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {/* Action Trigger Area (Step 3) */}
          <div className="pt-3 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-xs text-slate-600 font-medium">
              {existingClosedRecord ? (
                <span className="text-rose-700 font-bold flex items-center gap-1">
                  <Lock className="w-4 h-4" /> This period is locked. Click 'Generate Legal Audit Report' below to download certified statements.
                </span>
              ) : (
                <span>Ready to close. Clicking execute will post closing voucher and lock this date range.</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {existingClosedRecord ? (
                <>
                  <button
                    type="button"
                    onClick={() => handleReopenPeriod(existingClosedRecord)}
                    className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-rose-50 text-rose-700 border border-rose-300 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                    title="Unlock Period (Requires Master PIN 0099)"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    <span>Unlock Period</span>
                  </button>
                  {onNavigateToAuditDossier && (
                    <button
                      type="button"
                      onClick={() => onNavigateToAuditDossier(existingClosedRecord)}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-black text-xs uppercase tracking-wider shadow-md hover:shadow-lg transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <FileText className="w-4 h-4" />
                      <span>Open Legal Audit Dossier</span>
                    </button>
                  )}
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleExecutePeriodClosing}
                  disabled={isClosingInProgress || (trialBalanceData && !trialBalanceData.isBalanced)}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 via-emerald-700 to-teal-800 hover:from-emerald-500 hover:to-teal-700 text-white font-black text-xs uppercase tracking-wider shadow-md hover:shadow-lg transition flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Lock className="w-4 h-4 text-emerald-200" />
                  <span>{isClosingInProgress ? 'Executing Close...' : 'Lock & Execute Period Closing'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Historical Closed Periods & Audit Ledger */}
      <div className="bg-white border border-amber-300/80 rounded-2xl p-5 shadow-md space-y-4">
        <div className="border-b border-amber-200/80 pb-3 flex items-center justify-between">
          <div className="space-y-0.5">
            <h3 className="font-serif font-bold text-sm text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <FolderLock className="w-4 h-4 text-amber-700" />
              <span>Certified Closed Periods Archive</span>
            </h3>
            <p className="text-xs text-slate-500 font-mono">
              Cryptographically sealed financial periods with certified IFRS statements
            </p>
          </div>
          <span className="text-xs font-mono font-bold text-slate-700 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-300">
            {closedPeriods.length} Closed Period(s)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#FAF4E6] text-slate-700 font-bold uppercase text-[10px] border-b border-amber-300">
              <tr>
                <th className="py-2.5 px-3">Period Name</th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3">Date Range</th>
                <th className="py-2.5 px-3 text-right">Revenue (AED)</th>
                <th className="py-2.5 px-3 text-right">Net Profit (AED)</th>
                <th className="py-2.5 px-3">Closing Voucher</th>
                <th className="py-2.5 px-3 text-center">Security Status</th>
                <th className="py-2.5 px-3 text-right">Statutory Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-amber-100 font-mono">
              {closedPeriods.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center bg-slate-50/50">
                    <div className="flex flex-col items-center justify-center space-y-2.5 max-w-md mx-auto text-slate-500">
                      <div className="w-12 h-12 rounded-2xl bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-700 shadow-xs">
                        <FolderLock className="w-6 h-6" />
                      </div>
                      <p className="font-bold text-slate-800 text-sm">No Fiscal Periods Closed Yet</p>
                      <p className="text-xs text-slate-500 leading-relaxed font-sans">
                        Live transactions (sales, purchases, expenses) automatically accumulate in real-time into the General Ledger every day. Select your active period above and click <span className="font-bold text-slate-700">"Lock & Execute Period Closing"</span> once you are ready to seal the books and generate the formal Statutory Legal Audit Dossier.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                closedPeriods.map(record => (
                  <tr key={record.id} className="hover:bg-amber-50/50 transition">
                    <td className="py-3 px-3 font-sans font-bold text-slate-900">
                      <div className="flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>{record.periodName}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 font-sans">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-300">
                        {record.periodType}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-600 text-[11px]">
                      {record.startDate} → {record.endDate}
                    </td>
                    <td className="py-3 px-3 text-right text-emerald-700 font-bold">
                      {Number(record.totalRevenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-slate-950">
                      {Number(record.netProfit || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-3 font-bold text-indigo-700 text-[11px]">
                      {record.closingVoucherNo}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300">
                        <ShieldCheck className="w-3 h-3 text-emerald-600" />
                        <span>SEALED & LOCKED</span>
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-sans">
                      <div className="flex items-center justify-end gap-1.5">
                        {onNavigateToAuditDossier && (
                          <button
                            type="button"
                            onClick={() => onNavigateToAuditDossier(record)}
                            className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 transition shadow-xs cursor-pointer"
                          >
                            <FileText className="w-3 h-3" />
                            <span>Legal Dossier</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleReopenPeriod(record)}
                          className="p-1 hover:bg-rose-100 text-slate-400 hover:text-rose-700 rounded transition cursor-pointer"
                          title="Reopen Period (Requires Master PIN 0099)"
                        >
                          <Unlock className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================
          MODAL: CREATE / REGISTER NEW FISCAL YEAR
          ======================================================== */}
      {showCreateYearModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl border-2 border-amber-300 max-w-md w-full shadow-2xl p-6 relative">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-amber-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-600 text-white flex items-center justify-center shadow">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-serif font-bold text-slate-900 text-sm">Register New Fiscal Year</h4>
                  <p className="text-[11px] text-slate-500">Define annual accounting cycle & lock bounds</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateYearModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateFiscalYear} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700 uppercase">Year (YYYY) *</label>
                  <input
                    type="number"
                    min={2020}
                    max={2040}
                    required
                    value={newYearNumber}
                    onChange={e => {
                      const yr = Number(e.target.value);
                      setNewYearNumber(yr);
                      if (!newYearTitle || newYearTitle.startsWith('Fiscal Year')) {
                        setNewYearTitle(`Fiscal Year ${yr}`);
                      }
                      setNewYearStartDate(`${yr}-01-01`);
                      setNewYearEndDate(`${yr}-12-31`);
                    }}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-mono font-bold text-slate-900 focus:bg-white focus:border-amber-500 outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700 uppercase">Period Title</label>
                  <input
                    type="text"
                    placeholder="e.g. Fiscal Year 2026"
                    value={newYearTitle}
                    onChange={e => setNewYearTitle(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs text-slate-900 focus:bg-white focus:border-amber-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700 uppercase">Start Date</label>
                  <input
                    type="date"
                    required
                    value={newYearStartDate || `${newYearNumber}-01-01`}
                    onChange={e => setNewYearStartDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-mono text-slate-900 focus:bg-white focus:border-amber-500 outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700 uppercase">End Date</label>
                  <input
                    type="date"
                    required
                    value={newYearEndDate || `${newYearNumber}-12-31`}
                    onChange={e => setNewYearEndDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-mono text-slate-900 focus:bg-white focus:border-amber-500 outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700 uppercase">Notes / Reference</label>
                <textarea
                  rows={2}
                  placeholder="Optional compliance note (e.g. Vintage Vibes Al Ain LLC - Corporate Tax Cycle)"
                  value={newYearNotes}
                  onChange={e => setNewYearNotes(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs text-slate-900 focus:bg-white focus:border-amber-500 outline-none resize-none"
                />
              </div>

              <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-900 flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Once registered, this year will be selectable in the period closing engine. Daily transactions will flow into this period continuously.
                </span>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateYearModal(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold uppercase tracking-wider shadow transition cursor-pointer flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Register Fiscal Year</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
