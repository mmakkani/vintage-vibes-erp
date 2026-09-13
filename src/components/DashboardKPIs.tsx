import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  Package, 
  TrendingUp, 
  Clock, 
  ShoppingBag, 
  FileText, 
  Users, 
  RefreshCw,
  Printer,
  AlertCircle,
  FileClock,
  ClipboardCheck,
  ArrowRight
} from 'lucide-react';
import { ActiveTab } from './Navigation.tsx';
import { safeFetchJson } from '../utils/fetchUtils.ts';
import { GoldenPulseWave } from './GoldenPulseWave.tsx';

interface DashboardKPIsProps {
  activeTab: ActiveTab;
  onRefreshTrigger?: () => void;
  onTriggerDownloadPdf: () => void;
  onNavigateTab?: (tab: ActiveTab) => void;
}

interface KPIData {
  totalInventoryValue: number;
  totalInventoryCount: number;
  pendingSalesCount: number;
  pendingSalesAmount: number;
  currentMonthRevenue: number;
  currentMonthSubtotal: number;
  currentMonthVat: number;
  totalSalesCount: number;
  totalPurchasesAmount: number;
  totalPurchasesCount: number;
  openReceivables: number;
  activeStaffCount: number;
  unpostedVouchersCount?: number;
  awaitingGatePassesCount?: number;
  awaitingInwardGatePasses?: number;
  awaitingSalesGatePasses?: number;
  draftSalesInvoicesCount?: number;
  unpostedPurchaseInvoicesCount?: number;
  expiredLiveClaimsCount?: number;
  pendingActionTotal?: number;
}

let cachedKpiData: KPIData | null = null;
let cachedUsdRate: number = 0.2723;
let lastKpiFetchTime = 0;
const KPI_TTL_MS = 60 * 1000; // 1 minute cache

export const DashboardKPIs: React.FC<DashboardKPIsProps> = ({
  activeTab,
  onRefreshTrigger,
  onTriggerDownloadPdf,
  onNavigateTab
}) => {
  const [kpis, setKpis] = useState<KPIData>(() => cachedKpiData || {
    totalInventoryValue: 0,
    totalInventoryCount: 0,
    pendingSalesCount: 0,
    pendingSalesAmount: 0,
    currentMonthRevenue: 0,
    currentMonthSubtotal: 0,
    currentMonthVat: 0,
    totalSalesCount: 0,
    totalPurchasesAmount: 0,
    totalPurchasesCount: 0,
    openReceivables: 0,
    activeStaffCount: 0,
    unpostedVouchersCount: 0,
    awaitingGatePassesCount: 0,
    awaitingInwardGatePasses: 0,
    awaitingSalesGatePasses: 0,
    draftSalesInvoicesCount: 0,
    unpostedPurchaseInvoicesCount: 0,
    expiredLiveClaimsCount: 0,
    pendingActionTotal: 0
  });
  const [loading, setLoading] = useState(false);
  const [currencyMode, setCurrencyMode] = useState<'AED' | 'USD'>('AED');
  const [usdRate, setUsdRate] = useState<number>(() => cachedUsdRate);

  const fetchKPIs = async (force: boolean = false) => {
    if (!force && cachedKpiData && (Date.now() - lastKpiFetchTime < KPI_TTL_MS)) {
      setKpis(cachedKpiData);
      return;
    }
    try {
      setLoading(true);
      const [kpiData, currencies] = await Promise.all([
        safeFetchJson<KPIData>('/api/setup/dashboard-kpis', undefined, 3, 300),
        safeFetchJson<any[]>('/api/setup/currency', undefined, 3, 300)
      ]);
      if (kpiData) {
        cachedKpiData = kpiData;
        lastKpiFetchTime = Date.now();
        setKpis(kpiData);
      }
      if (Array.isArray(currencies)) {
        const usd = currencies.find((c: any) => c.code === 'USD');
        if (usd && usd.exchangeRate) {
          const rate = Number(usd.exchangeRate);
          cachedUsdRate = rate;
          setUsdRate(rate);
        }
      }
    } catch {
      // Graceful fallback; keep previous metrics
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKPIs();
  }, []);

  const formatMoney = (valAED: number) => {
    if (currencyMode === 'USD') {
      const valUSD = valAED * usdRate;
      return `$ ${valUSD.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    }
    return `AED ${valAED.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  return (
    <div id="top-level-kpi-dashboard" className="mb-3">
      {/* Top Banner Bar with Metrics and PDF Export */}
      <div className="bg-white rounded-xl border border-amber-200/90 shadow-xs p-2.5 sm:p-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-2.5 border-b border-amber-100">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
              <span>Executive KPI Summary</span>
              <span className="text-[10px] font-normal text-slate-400">| Real-time Telemetry</span>
            </h2>
          </div>

          <div className="flex items-center gap-2 self-end lg:self-auto">
            {/* Financial Velocity Pulse Meter */}
            <div className="hidden md:flex">
              <GoldenPulseWave />
            </div>

            {/* Currency Mode (AED vs USD) */}
            <div id="kpi-currency-toggle" className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[11px] font-bold">
              <button
                type="button"
                id="btn-currency-aed"
                onClick={() => setCurrencyMode('AED')}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  currencyMode === 'AED'
                    ? 'bg-amber-600 text-white shadow-xs font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                AED (Dirham)
              </button>
              <button
                type="button"
                id="btn-currency-usd"
                onClick={() => setCurrencyMode('USD')}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  currencyMode === 'USD'
                    ? 'bg-amber-600 text-white shadow-xs font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                USD ($ @ {usdRate.toFixed(3)})
              </button>
            </div>

            {/* Refresh Metrics */}
            <button
              id="btn-refresh-kpis"
              type="button"
              onClick={() => {
                fetchKPIs();
                if (onRefreshTrigger) onRefreshTrigger();
              }}
              title="Refresh top-level metrics"
              className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-600' : ''}`} />
            </button>

            {/* Prominent Download PDF button */}
            <button
              id="btn-download-view-pdf"
              type="button"
              onClick={onTriggerDownloadPdf}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-900 hover:bg-slate-800 text-amber-300 rounded text-xs font-bold uppercase tracking-wider shadow-xs hover:shadow transition-all cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-amber-300" />
              <span>Download PDF</span>
            </button>
          </div>
        </div>

        {/* 6 High-Density KPI Cards with Framer Motion hover animations */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-2.5">
          {/* Card 1: Total Inventory Value */}
          <motion.div
            id="kpi-inventory-value"
            whileHover={{ scale: 1.02, y: -2 }}
            transition={{ duration: 0.15 }}
            className="p-2 rounded-lg bg-[#FAF5E8] border border-amber-200/90 hover:border-amber-400 hover:bg-[#F6EED8] transition-colors shadow-2xs"
          >
            <div className="flex items-center justify-between text-slate-600 text-[10px] font-bold uppercase tracking-wider">
              <span>Total Inventory</span>
              <Package className="w-3.5 h-3.5 text-amber-600" />
            </div>
            <div className="mt-1 font-mono text-xs sm:text-sm font-black text-slate-900 truncate">
              {formatMoney(kpis.totalInventoryValue)}
            </div>
            <div className="text-[10px] text-slate-500 font-medium truncate">
              <span className="font-bold text-amber-800">{kpis.totalInventoryCount}</span> in-stock pieces
            </div>
          </motion.div>

          {/* Card 2: Current Month Revenue */}
          <motion.div
            id="kpi-current-revenue"
            whileHover={{ scale: 1.02, y: -2 }}
            transition={{ duration: 0.15 }}
            className="p-2 rounded-lg bg-emerald-50/70 border border-emerald-300/70 hover:border-emerald-400 transition-colors shadow-2xs"
          >
            <div className="flex items-center justify-between text-emerald-800 text-[10px] font-bold uppercase tracking-wider">
              <span>Revenue (MTD)</span>
              <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <div className="mt-1 font-mono text-xs sm:text-sm font-black text-emerald-900 truncate">
              {formatMoney(kpis.currentMonthRevenue)}
            </div>
            <div className="text-[10px] text-emerald-700 font-medium truncate">
              Incl. {formatMoney(kpis.currentMonthVat)} VAT
            </div>
          </motion.div>

          {/* Card 3: Pending Sales / Orders */}
          <motion.div
            id="kpi-pending-sales"
            whileHover={{ scale: 1.02, y: -2 }}
            transition={{ duration: 0.15 }}
            className="p-2 rounded-lg bg-amber-50/80 border border-amber-300/80 hover:border-amber-400 transition-colors shadow-2xs"
          >
            <div className="flex items-center justify-between text-amber-800 text-[10px] font-bold uppercase tracking-wider">
              <span>Pending Sales</span>
              <Clock className="w-3.5 h-3.5 text-amber-600" />
            </div>
            <div className="mt-1 font-mono text-xs sm:text-sm font-black text-amber-900 truncate">
              {formatMoney(kpis.pendingSalesAmount)}
            </div>
            <div className="text-[10px] text-amber-700 font-medium truncate">
              <span className="font-bold">{kpis.pendingSalesCount}</span> passes pending
            </div>
          </motion.div>

          {/* Card 4: Purchases / Inward Spend */}
          <motion.div
            id="kpi-purchases-spend"
            whileHover={{ scale: 1.02, y: -2 }}
            transition={{ duration: 0.15 }}
            className="p-2 rounded-lg bg-[#FAF5E8] border border-amber-200/90 hover:border-amber-400 hover:bg-[#F6EED8] transition-colors shadow-2xs"
          >
            <div className="flex items-center justify-between text-slate-600 text-[10px] font-bold uppercase tracking-wider">
              <span>Bale Purchases</span>
              <ShoppingBag className="w-3.5 h-3.5 text-purple-600" />
            </div>
            <div className="mt-1 font-mono text-xs sm:text-sm font-black text-slate-900 truncate">
              {formatMoney(kpis.totalPurchasesAmount)}
            </div>
            <div className="text-[10px] text-slate-500 font-medium truncate">
              <span className="font-bold">{kpis.totalPurchasesCount}</span> supplier invoices
            </div>
          </motion.div>

          {/* Card 5: Open Receivables / Client Khata */}
          <motion.div
            id="kpi-open-receivables"
            whileHover={{ scale: 1.02, y: -2 }}
            transition={{ duration: 0.15 }}
            className="p-2 rounded-lg bg-[#FAF5E8] border border-amber-200/90 hover:border-amber-400 hover:bg-[#F6EED8] transition-colors shadow-2xs"
          >
            <div className="flex items-center justify-between text-slate-600 text-[10px] font-bold uppercase tracking-wider">
              <span>Receivables (Khata)</span>
              <FileText className="w-3.5 h-3.5 text-sky-600" />
            </div>
            <div className="mt-1 font-mono text-xs sm:text-sm font-black text-slate-900 truncate">
              {formatMoney(kpis.openReceivables)}
            </div>
            <div className="text-[10px] text-slate-500 font-medium truncate">
              Active client dues
            </div>
          </motion.div>

          {/* Card 6: Active Workforce & Status */}
          <motion.div
            id="kpi-active-staff"
            whileHover={{ scale: 1.02, y: -2 }}
            transition={{ duration: 0.15 }}
            className="p-2 rounded-lg bg-[#FAF5E8] border border-amber-200/90 hover:border-amber-400 hover:bg-[#F6EED8] transition-colors shadow-2xs"
          >
            <div className="flex items-center justify-between text-slate-600 text-[10px] font-bold uppercase tracking-wider">
              <span>Workforce</span>
              <Users className="w-3.5 h-3.5 text-slate-600" />
            </div>
            <div className="mt-1 font-mono text-xs sm:text-sm font-black text-slate-900 truncate">
              {kpis.activeStaffCount} Active
            </div>
            <div className="text-[10px] text-emerald-600 font-semibold truncate">
              100% Synced
            </div>
          </motion.div>
        </div>

        {/* Pending Action Badges Strip - Highlighting urgent tasks like unposted vouchers & awaiting gate passes */}
        <div id="kpi-pending-actions-bar" className="mt-2.5 pt-2 border-t border-amber-100/90">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5 px-0.5">
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-500/20 text-amber-800">
                <AlertCircle className="w-3 h-3 text-amber-700" />
              </span>
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-800">
                Pending Action Queue
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                {(kpis.pendingActionTotal ?? ((kpis.unpostedVouchersCount || 0) + (kpis.awaitingGatePassesCount || 0)))} Tasks Requiring Action
              </span>
            </div>
            <span className="text-[10px] text-slate-400 hidden md:inline">
              Click any badge to navigate directly to the respective operational module
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {/* Badge 1: Unposted Vouchers */}
            <motion.button
              type="button"
              id="pending-badge-unposted-vouchers"
              whileHover={{ scale: 1.01, y: -1 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                try { localStorage.setItem('vintage_finance_subtab', 'vouchers'); } catch {}
                if (onNavigateTab) onNavigateTab('finance');
              }}
              className={`p-2 rounded-lg text-left transition-all border cursor-pointer ${
                (kpis.unpostedVouchersCount ?? 0) > 0
                  ? 'bg-amber-50/90 border-amber-300 hover:border-amber-500 hover:bg-amber-100/80'
                  : 'bg-slate-50/70 border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-amber-900 uppercase tracking-wide flex items-center gap-1 truncate">
                  <FileClock className="w-3 h-3 text-amber-700 shrink-0" />
                  <span className="truncate">Unposted Vouchers</span>
                </span>
                <span className={`text-[10px] font-mono font-black px-1.5 py-0.2 rounded-full shrink-0 ml-1 ${
                  (kpis.unpostedVouchersCount ?? 0) > 0
                    ? 'bg-amber-600 text-white animate-pulse'
                    : 'bg-slate-200 text-slate-700'
                }`}>
                  {kpis.unpostedVouchersCount ?? 0}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[10px] text-slate-600">
                <span className="truncate">{(kpis.unpostedVouchersCount ?? 0) > 0 ? 'Review & post to GL' : 'All vouchers posted'}</span>
                <ArrowRight className="w-2.5 h-2.5 text-amber-700 ml-1 shrink-0" />
              </div>
            </motion.button>

            {/* Badge 2: Awaiting Gate Passes */}
            <motion.button
              type="button"
              id="pending-badge-awaiting-gate-passes"
              whileHover={{ scale: 1.01, y: -1 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onNavigateTab && onNavigateTab('sales')}
              className={`p-2 rounded-lg text-left transition-all border cursor-pointer ${
                (kpis.awaitingGatePassesCount ?? 0) > 0
                  ? 'bg-sky-50/90 border-sky-300 hover:border-sky-500 hover:bg-sky-100/80'
                  : 'bg-slate-50/70 border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-sky-900 uppercase tracking-wide flex items-center gap-1 truncate">
                  <ClipboardCheck className="w-3 h-3 text-sky-700 shrink-0" />
                  <span className="truncate">Awaiting Gate Passes</span>
                </span>
                <span className={`text-[10px] font-mono font-black px-1.5 py-0.2 rounded-full shrink-0 ml-1 ${
                  (kpis.awaitingGatePassesCount ?? 0) > 0
                    ? 'bg-sky-600 text-white animate-pulse'
                    : 'bg-slate-200 text-slate-700'
                }`}>
                  {kpis.awaitingGatePassesCount ?? 0}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[10px] text-slate-600">
                <span className="truncate">
                  {kpis.awaitingSalesGatePasses ?? 1} sales &bull; {kpis.awaitingInwardGatePasses ?? 0} inward
                </span>
                <ArrowRight className="w-2.5 h-2.5 text-sky-700 ml-1 shrink-0" />
              </div>
            </motion.button>

            {/* Badge 3: Expired Live Claims */}
            <motion.button
              type="button"
              id="pending-badge-expired-claims"
              whileHover={{ scale: 1.01, y: -1 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onNavigateTab && onNavigateTab('sales')}
              className={`p-2 rounded-lg text-left transition-all border cursor-pointer ${
                (kpis.expiredLiveClaimsCount ?? 0) > 0
                  ? 'bg-rose-50/90 border-rose-300 hover:border-rose-500 hover:bg-rose-100/80'
                  : 'bg-slate-50/70 border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-rose-900 uppercase tracking-wide flex items-center gap-1 truncate">
                  <Clock className="w-3 h-3 text-rose-700 shrink-0" />
                  <span className="truncate">Expired Live Claims</span>
                </span>
                <span className={`text-[10px] font-mono font-black px-1.5 py-0.2 rounded-full shrink-0 ml-1 ${
                  (kpis.expiredLiveClaimsCount ?? 0) > 0
                    ? 'bg-rose-600 text-white animate-pulse'
                    : 'bg-slate-200 text-slate-700'
                }`}>
                  {kpis.expiredLiveClaimsCount ?? 0}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[10px] text-slate-600">
                <span className="truncate">
                  {(kpis.expiredLiveClaimsCount ?? 0) > 0 ? 'Ready for auto-release' : 'Cart holds in good standing'}
                </span>
                <ArrowRight className="w-2.5 h-2.5 text-rose-700 ml-1 shrink-0" />
              </div>
            </motion.button>

            {/* Badge 4: Draft Invoices */}
            <motion.button
              type="button"
              id="pending-badge-draft-invoices"
              whileHover={{ scale: 1.01, y: -1 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onNavigateTab && onNavigateTab('purchase')}
              className="p-2 rounded-lg text-left transition-all border bg-slate-50/70 border-slate-200 hover:border-slate-300 hover:bg-slate-100/80 cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1 truncate">
                  <ShoppingBag className="w-3 h-3 text-purple-700 shrink-0" />
                  <span className="truncate">Draft Invoices</span>
                </span>
                <span className="text-[10px] font-mono font-black px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-800 shrink-0 ml-1">
                  {(kpis.draftSalesInvoicesCount || 0) + (kpis.unpostedPurchaseInvoicesCount || 0)}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[10px] text-slate-600">
                <span className="truncate">Unfinalized drafts</span>
                <ArrowRight className="w-2.5 h-2.5 text-slate-600 ml-1 shrink-0" />
              </div>
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
};
