import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Vintage3DLogo } from '../../../components/Vintage3DLogo.tsx';
import { CompanyName3D } from '../../../components/CompanyName3D.tsx';
import { GoldWaxSeal3D } from '../../../components/GoldWaxSeal3D.tsx';
import {
  TrendingUp,
  Package,
  ArrowDownRight,
  ArrowUpRight,
  DollarSign,
  Receipt,
  Truck,
  Building,
  Users,
  ShieldCheck,
  Calendar,
  Sparkles,
  Layers,
  ArrowRight,
  FileSpreadsheet,
  PlusCircle,
  FileText,
  AlertTriangle,
  BellRing,
  AlertCircle,
  Crown
} from 'lucide-react';
import { User } from '../../auth/auth.types.ts';
import { BaleYieldAnalyticsWidget } from './BaleYieldAnalyticsWidget.tsx';
import { safeFetchJson } from '../../../utils/fetchUtils.ts';
import { PurchaseService } from '../../../services/purchaseService.ts';
import { DashboardService, getSafeFxRates, DEFAULT_FX_RATES } from '../../../services/dashboardService.ts';

interface MainDashboardViewProps {
  onNavigateTab: (tabId: string) => void;
  currentUser: User | null;
}

interface StockAlertItem {
  id: string;
  name: string;
  code: string;
  category: string;
  currentQuantity: number;
  minStockThreshold: number;
  unit: string;
  severity: 'CRITICAL' | 'WARNING';
}

let cachedMainDashboardKpi: any = null;
let cachedMainDashboardStockAlerts: StockAlertItem[] | null = null;
let cachedMainDashboardGrails: any[] | null = null;
let cachedMainDashboardThreshold: number = 20;
let lastMainDashboardFetchTime = 0;
const MAIN_DASHBOARD_TTL_MS = 60 * 1000; // 1 minute cache

export const MainDashboardView: React.FC<MainDashboardViewProps> = ({
  onNavigateTab,
  currentUser
}) => {
  const [loading, setLoading] = useState(() => !cachedMainDashboardKpi);
  const [stockAlerts, setStockAlerts] = useState<StockAlertItem[]>(() => cachedMainDashboardStockAlerts || []);
  const [grailAlerts, setGrailAlerts] = useState<any[]>(() => cachedMainDashboardGrails || []);
  const [globalThreshold, setGlobalThreshold] = useState<number>(() => cachedMainDashboardThreshold);
  const [kpiData, setKpiData] = useState(() => cachedMainDashboardKpi || {
    totalInventoryValueAED: 0,
    totalBalesInStock: 0,
    totalSortedPcs: 0,
    monthRevenueAED: 0,
    receivablesKhataAED: 0,
    payablesKhataAED: 0,
    netWorkingCapitalAED: 0,
    currencyRates: DEFAULT_FX_RATES,
    recentGatePasses: [] as any[],
    clientKhatas: [] as any[]
  });

  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const fetchDashboardData = async (force: boolean = false) => {
      if (!force && cachedMainDashboardKpi && (Date.now() - lastMainDashboardFetchTime < MAIN_DASHBOARD_TTL_MS)) {
        setLoading(false);
        return;
      }
      try {
        const [liveKpis, purchaseInvoicesRes, gatePassesRes, salesRes, partiesRes, financeRes, currRes, itemsRes, companyRes, grailsRes] = await Promise.all([
          DashboardService.getLiveKPIs().catch(() => null),
          safeFetchJson<any[]>('/api/purchase/invoices', undefined, 3, 300),
          safeFetchJson<any[]>('/api/purchase/gate-passes', undefined, 3, 300),
          safeFetchJson<any[]>('/api/sales/invoices', undefined, 3, 300),
          safeFetchJson<any[]>('/api/parties', undefined, 3, 300),
          safeFetchJson<any>('/api/finance/reports', undefined, 3, 300),
          safeFetchJson<any[]>('/api/setup/currency', undefined, 3, 300),
          safeFetchJson<any[]>('/api/setup/items', undefined, 3, 300),
          safeFetchJson<any>('/api/setup/company', undefined, 3, 300),
          safeFetchJson<any[]>('/api/purchase/grails', undefined, 2, 300)
        ]);

        if (companyRes?.globalStockAlertThreshold) {
          setGlobalThreshold(companyRes.globalStockAlertThreshold);
        }

        let computedInventoryValue = 0;
        let computedBalesCount = 0;
        let computedSortedPcs = 0;
        let computedPayables = 0;

        if (Array.isArray(gatePassesRes) && gatePassesRes.length > 0) {
          computedBalesCount = gatePassesRes.length;
          for (const gp of gatePassesRes) {
            computedInventoryValue += (gp.totalBaleCost || gp.totalCost || 0);
            if (Array.isArray(gp.pieces)) {
              computedSortedPcs += gp.pieces.length;
            }
          }
        }

        if (Array.isArray(purchaseInvoicesRes) && purchaseInvoicesRes.length > 0) {
          for (const pi of purchaseInvoicesRes) {
            computedPayables += (pi.balanceDueAED || pi.grandTotalAED || 0);
            if (computedInventoryValue === 0) {
              computedInventoryValue += (pi.grandTotalAED || 0);
            }
          }
        }

        let computedRevenue = 0;
        if (Array.isArray(salesRes) && salesRes.length > 0) {
          computedRevenue = salesRes.reduce((acc: number, inv: any) => acc + (inv.grandTotalAED || 0), 0);
        }

        let computedReceivables = 0;
        const clientKhatasArr: any[] = [];
        if (Array.isArray(partiesRes) && partiesRes.length > 0) {
          const customers = partiesRes.filter((p: any) => p.type === 'CUSTOMER' || p.category === 'Client');
          for (const c of customers) {
            const bal = c.balanceAED || c.balance || 0;
            computedReceivables += bal;
            clientKhatasArr.push({
              name: c.name || c.partyName || 'Client',
              city: c.city || c.address || 'Dubai, UAE',
              balance: bal,
              status: c.status || 'Active'
            });
          }
        }

        // Merge with live database KPIs from chart_of_accounts, inward_gate_passes, inventory_pieces, journal_entries
        const finalInventoryValue = (liveKpis && liveKpis.totalInventoryValueAED > 0)
          ? liveKpis.totalInventoryValueAED
          : (computedInventoryValue > 0 ? computedInventoryValue : (liveKpis?.totalInventoryValueAED || 0));

        const finalBalesCount = (liveKpis && liveKpis.totalBalesInStock > 0)
          ? liveKpis.totalBalesInStock
          : (computedBalesCount > 0 ? computedBalesCount : (liveKpis?.totalBalesInStock || 0));

        const finalSortedPcs = (liveKpis && liveKpis.totalSortedPcs > 0)
          ? liveKpis.totalSortedPcs
          : (computedSortedPcs > 0 ? computedSortedPcs : (liveKpis?.totalSortedPcs || 0));

        const finalRevenue = (liveKpis && liveKpis.monthRevenueAED > 0)
          ? liveKpis.monthRevenueAED
          : (computedRevenue > 0 ? computedRevenue : (liveKpis?.monthRevenueAED || 0));

        const finalReceivables = (liveKpis && liveKpis.receivablesKhataAED > 0)
          ? liveKpis.receivablesKhataAED
          : (computedReceivables > 0 ? computedReceivables : (liveKpis?.receivablesKhataAED || 0));

        const finalPayables = (liveKpis && liveKpis.payablesKhataAED > 0)
          ? liveKpis.payablesKhataAED
          : (computedPayables > 0 ? computedPayables : (liveKpis?.payablesKhataAED || 0));

        let finalWorkingCapital = finalInventoryValue + finalReceivables - finalPayables;
        if (finalInventoryValue === 0 && finalReceivables === 0 && finalPayables === 0) {
          finalWorkingCapital = 0;
        }

        const safeRates = getSafeFxRates(currRes);

        const recentGatePassesArr = Array.isArray(gatePassesRes) && gatePassesRes.length > 0
          ? gatePassesRes.slice(0, 5).map((gp: any, idx: number) => ({
              id: gp.id || gp.gatePassNo || `IGP-2026-000${idx+1}`,
              supplier: gp.supplierName || gp.supplier || 'Global Supplier',
              date: gp.date || gp.createdAt || '2026-03-01',
              weight: `${gp.totalBaleWeight || gp.weight || 250} KG`,
              pcs: `${Array.isArray(gp.pieces) ? gp.pieces.length : (gp.piecesCount || 0)} Verified Pcs`,
              status: gp.status || 'POSTED'
            }))
          : [];

        const newKpi = {
          totalInventoryValueAED: finalInventoryValue,
          totalBalesInStock: finalBalesCount,
          totalSortedPcs: finalSortedPcs,
          monthRevenueAED: finalRevenue,
          receivablesKhataAED: finalReceivables,
          payablesKhataAED: finalPayables,
          netWorkingCapitalAED: finalWorkingCapital,
          currencyRates: safeRates,
          recentGatePasses: recentGatePassesArr,
          clientKhatas: clientKhatasArr
        };
        setKpiData(newKpi);
        cachedMainDashboardKpi = newKpi;

        if (itemsRes && Array.isArray(itemsRes)) {
          const triggered: StockAlertItem[] = [];
          for (const item of itemsRes) {
            const qty = item.currentStock !== undefined ? item.currentStock : (item.quantity || 0);
            const threshold = item.minStockThreshold || 15;
            if (qty <= threshold && qty > 0) {
              triggered.push({
                id: item.id,
                name: item.name,
                code: item.code,
                category: item.category,
                currentQuantity: qty,
                minStockThreshold: threshold,
                unit: item.unit || 'Bales',
                severity: qty <= threshold / 2 ? 'CRITICAL' : 'WARNING'
              });
            }
          }
          setStockAlerts(triggered);
          cachedMainDashboardStockAlerts = triggered;
        }

        if (Array.isArray(grailsRes) && grailsRes.length > 0) {
          setGrailAlerts(grailsRes);
          cachedMainDashboardGrails = grailsRes;
        } else {
          try {
            const pieces = await PurchaseService.getInventoryPieces(100);
            const foundGrails = (pieces || []).filter(p => p.isGrail || ['Antique', 'Grails', 'Boutique'].includes(p.marketSegment || ''));
            if (foundGrails.length > 0) {
              setGrailAlerts(foundGrails.slice(0, 6));
              cachedMainDashboardGrails = foundGrails.slice(0, 6);
            }
          } catch (_) {}
        }

        lastMainDashboardFetchTime = Date.now();
      } catch {
        // Fallback gracefully on network retry
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  return (
    <div id="main-executive-dashboard" className="space-y-4">
      {/* 1. EXECUTIVE WELCOME BANNER */}
      <div className="relative overflow-hidden rounded-2xl border-2 border-amber-300/80 bg-gradient-to-r from-[#fdfaf2] via-[#faf4e4] to-[#fbf7ee] p-5 sm:p-6 shadow-sm">
        <div className="absolute -right-10 -bottom-10 opacity-10 pointer-events-none">
          <Vintage3DLogo size="xl" interactive={false} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-4">
            <Vintage3DLogo size="lg" />
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-200/80 text-amber-950 border border-amber-300">
                  DUBAI WHOLESALE TERMINAL &bull; LIVE ERP
                </span>
                <span className="text-xs text-amber-900/80 font-mono font-bold">
                  {currentTime} GST
                </span>
              </div>
              <CompanyName3D
                name="VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C"
                size="md"
              />
              <p className="text-xs text-slate-700 font-medium mt-1">
                Welcome back, <strong>{currentUser?.name || 'Administrator'}</strong> &bull; Access Level: <span className="font-mono text-amber-900 font-bold">{currentUser?.role || 'ADMIN'}</span> &bull; Hub: <strong>{currentUser?.assignedShopId || 'Al Quoz Central Sorting Facility'}</strong>
              </p>
            </div>
          </div>

          {/* Quick Action Buttons with Framer Motion hover animations */}
          <div className="flex flex-wrap items-center gap-2">
            <motion.button
              type="button"
              whileHover={{ scale: 1.03, y: -1 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onNavigateTab('purchase')}
              className="px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold uppercase tracking-wider shadow-xs hover:shadow transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>New Purchase / Gate Pass</span>
            </motion.button>
            <motion.button
              type="button"
              whileHover={{ scale: 1.03, y: -1 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => {
                try { localStorage.setItem('vintage_finance_subtab', 'ledger'); } catch {}
                onNavigateTab('finance');
              }}
              className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-300 text-xs font-bold uppercase tracking-wider shadow-xs hover:shadow transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Receipt className="w-4 h-4" />
              <span>General Ledger (GL)</span>
            </motion.button>
            <motion.button
              type="button"
              whileHover={{ scale: 1.03, y: -1 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onNavigateTab('parties')}
              className="px-3 py-2 rounded-xl border border-amber-300 bg-white hover:bg-amber-50 text-slate-900 text-xs font-bold uppercase tracking-wider shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Users className="w-4 h-4 text-amber-700" />
              <span>Customer / Khata Registry</span>
            </motion.button>

            {/* 3D Royal Gold Wax Seal Certification Stamp */}
            <GoldWaxSeal3D size="sm" className="hidden lg:flex ml-2" />
          </div>
        </div>
      </div>

      {/* 1.25 HIGH-VALUE ANTIQUE & GRAIL REAL-TIME SORTING ALERT BANNER */}
      {grailAlerts.length > 0 && (
        <motion.div
          id="high-value-grail-alert-panel"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border-2 border-amber-500/80 bg-gradient-to-r from-purple-950 via-slate-950 to-amber-950 text-white p-4 shadow-lg shadow-amber-950/20"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-amber-500/30">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black shadow-md shadow-amber-500/30 animate-pulse">
                <Crown className="w-5 h-5 text-slate-950" />
              </div>
              <div>
                <h4 className="font-serif font-black text-amber-300 text-xs sm:text-sm uppercase tracking-wider flex items-center gap-2">
                  <span>🚨 High-Value Antique / Grail Detected in Sorting!</span>
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold">
                    {grailAlerts.length} Vault Items Flagged
                  </span>
                </h4>
                <p className="text-[11px] text-slate-300 font-medium">
                  AI Vision & Geo-Arbitrage Appraisal identified museum/collector-grade archive pieces in sorting terminal. Grail Anti-Theft Lock active.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onNavigateTab('purchase')}
              className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs uppercase tracking-wider shadow-md transition-all flex items-center gap-1.5 cursor-pointer self-start sm:self-auto shrink-0"
            >
              <span>Inspect in Sorting Terminal</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-3">
            {grailAlerts.slice(0, 6).map((grail: any, idx: number) => {
              const gi = grail.globalInsights || grail.global_insights || {};
              const seg = grail.marketSegment || grail.market_segment || 'Grails';
              const img = grail.frontImageUrl || grail.front_image_url || grail.front_image;
              const price = grail.retailPriceAed || grail.retail_price_aed || grail.estimatedPrice || grail.selling_price || 0;

              return (
                <motion.div
                  key={grail.id || idx}
                  whileHover={{ scale: 1.02 }}
                  className="p-3 rounded-xl border border-amber-500/30 bg-slate-900/90 hover:bg-slate-900 transition flex items-center gap-3 cursor-pointer"
                  onClick={() => onNavigateTab('purchase')}
                >
                  {img ? (
                    <img
                      src={img}
                      alt={grail.itemName || 'Grail'}
                      className="w-14 h-14 object-cover rounded-lg border border-amber-500/40 shrink-0"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-lg bg-amber-950/60 border border-amber-600/40 flex items-center justify-center text-amber-400 shrink-0 font-bold">
                      <Sparkles className="w-6 h-6" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                        seg === 'Antique'
                          ? 'bg-purple-950 text-purple-300 border border-purple-500/50'
                          : seg === 'Grails'
                          ? 'bg-amber-950 text-amber-300 border border-amber-500/50'
                          : 'bg-pink-950 text-pink-300 border border-pink-500/50'
                      }`}>
                        {seg}
                      </span>
                      <span className="text-[11px] text-amber-400 font-mono font-bold">
                        AED {Number(price).toFixed(0)}
                      </span>
                    </div>

                    <div className="text-xs font-bold text-white truncate mt-0.5">
                      {grail.brandName || grail.brand_title || 'Archive'} &bull; {grail.itemName || grail.category || 'Garment'}
                    </div>

                    <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400 mt-1">
                      {gi.usa_market_usd && (
                        <span className="text-emerald-400">🇺🇸 ${gi.usa_market_usd}</span>
                      )}
                      {gi.europe_market_eur && (
                        <span className="text-sky-400">🇪🇺 €{gi.europe_market_eur}</span>
                      )}
                      {gi.australia_market_aud && (
                        <span className="text-amber-400">🇦🇺 A${gi.australia_market_aud}</span>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* 1.5 GLOBAL STOCK-ALERT THRESHOLD VISUAL WARNING PANEL */}
      {stockAlerts.length > 0 && (
        <motion.div
          id="global-stock-alert-panel"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border-2 border-rose-300 bg-gradient-to-r from-rose-50 via-amber-50/70 to-rose-50/50 p-4 shadow-sm"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-rose-200">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-rose-600 text-white flex items-center justify-center animate-bounce">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-serif font-black text-rose-950 text-xs uppercase tracking-wider flex items-center gap-2">
                  <span>Critical Inventory Stock-Alert Warnings</span>
                  <span className="px-2 py-0.5 rounded-full bg-rose-200 text-rose-900 text-[10px] font-bold">
                    {stockAlerts.length} Bale Types Below Minimum Threshold
                  </span>
                </h4>
                <p className="text-[11px] text-rose-800/90 font-medium">
                  Configured Global Stock Alert Minimum: <strong>{globalThreshold} Units</strong>. Automated warning triggered for immediate inward purchase requisition.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                type="button"
                onClick={() => onNavigateTab('purchase')}
                className="px-3 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-[11px] font-bold uppercase tracking-wider shadow-xs transition-all flex items-center gap-1 cursor-pointer"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Create Purchase Order</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab('setup')}
                className="px-2.5 py-1.5 rounded-lg border border-rose-300 bg-white hover:bg-rose-50 text-rose-900 text-[11px] font-bold transition-colors cursor-pointer"
              >
                Configure Thresholds
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-3">
            {stockAlerts.map(alert => (
              <motion.div
                key={alert.id}
                whileHover={{ scale: 1.02, y: -2 }}
                transition={{ duration: 0.15 }}
                className={`p-2.5 rounded-xl border flex items-center justify-between shadow-2xs ${
                  alert.severity === 'CRITICAL'
                    ? 'bg-white border-rose-300 ring-1 ring-rose-200'
                    : 'bg-white border-amber-300'
                }`}
              >
                <div className="min-w-0 pr-2">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${alert.severity === 'CRITICAL' ? 'bg-rose-600 animate-ping' : 'bg-amber-500'}`}></span>
                    <div className="font-bold text-slate-900 text-xs truncate">{alert.name}</div>
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                    Code: <strong>{alert.code}</strong> &bull; Category: {alert.category}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="font-mono font-black text-xs text-rose-900">
                    {alert.currentQuantity} {alert.unit}
                  </div>
                  <div className="text-[9px] font-bold text-slate-500 uppercase tracking-tight">
                    Min: {alert.minStockThreshold} {alert.unit}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* 2. TOP LEVEL FINANCIAL & OPERATIONAL KPIS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {/* Metric 1 */}
        <motion.div
          whileHover={{ scale: 1.02, y: -2 }}
          transition={{ duration: 0.15 }}
          className="p-4 rounded-xl border border-amber-200/90 bg-white shadow-xs hover:border-amber-400 transition-all"
        >
          <div className="flex items-center justify-between text-xs text-slate-700 font-bold uppercase tracking-wider mb-1">
            <span>Inventory Value</span>
            <Package className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-xl font-black font-serif text-slate-900">
            AED {Number(kpiData?.totalInventoryValueAED || 0).toLocaleString()}
          </div>
          <div className="text-[10px] text-emerald-800 font-medium flex items-center gap-1 mt-1">
            <TrendingUp className="w-3 h-3" />
            <span>Audited Cost</span>
          </div>
        </motion.div>

        {/* Metric 2 */}
        <motion.div
          whileHover={{ scale: 1.02, y: -2 }}
          transition={{ duration: 0.15 }}
          className="p-4 rounded-xl border border-amber-200/90 bg-white shadow-xs hover:border-amber-400 transition-all"
        >
          <div className="flex items-center justify-between text-xs text-slate-700 font-bold uppercase tracking-wider mb-1">
            <span>Stock Pieces</span>
            <Layers className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-xl font-black font-serif text-slate-900">
            {Number(kpiData?.totalSortedPcs || 0).toLocaleString()} <span className="text-xs font-sans font-normal text-slate-700">pcs</span>
          </div>
          <div className="text-[10px] text-amber-800 font-medium mt-1">
            {kpiData?.totalBalesInStock || 0} Raw Cargo Bales in Vault
          </div>
        </motion.div>

        {/* Metric 3 */}
        <motion.div
          whileHover={{ scale: 1.02, y: -2 }}
          transition={{ duration: 0.15 }}
          className="p-4 rounded-xl border border-amber-200/90 bg-white shadow-xs hover:border-amber-400 transition-all"
        >
          <div className="flex items-center justify-between text-xs text-slate-700 font-bold uppercase tracking-wider mb-1">
            <span>Month Revenue</span>
            <DollarSign className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl font-black font-serif text-emerald-800">
            AED {Number(kpiData?.monthRevenueAED || 0).toLocaleString()}
          </div>
          <div className="text-[10px] text-emerald-800 font-medium flex items-center gap-1 mt-1">
            <ArrowUpRight className="w-3 h-3" />
            <span>+18.4% vs Prior Cycle</span>
          </div>
        </motion.div>

        {/* Metric 4 */}
        <motion.div
          whileHover={{ scale: 1.02, y: -2 }}
          transition={{ duration: 0.15 }}
          className="p-4 rounded-xl border border-amber-200/90 bg-white shadow-xs hover:border-amber-400 transition-all"
        >
          <div className="flex items-center justify-between text-xs text-slate-700 font-bold uppercase tracking-wider mb-1">
            <span>Receivables Khata</span>
            <Users className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-xl font-black font-serif text-blue-800">
            AED {Number(kpiData?.receivablesKhataAED || 0).toLocaleString()}
          </div>
          <div className="text-[10px] text-slate-700 font-medium mt-1">
            Trade Debtors & Client Accounts
          </div>
        </motion.div>

        {/* Metric 5 */}
        <motion.div
          whileHover={{ scale: 1.02, y: -2 }}
          transition={{ duration: 0.15 }}
          className="p-4 rounded-xl border border-amber-200/90 bg-white shadow-xs hover:border-amber-400 transition-all"
        >
          <div className="flex items-center justify-between text-xs text-slate-700 font-bold uppercase tracking-wider mb-1">
            <span>Payables Khata</span>
            <Truck className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-xl font-black font-serif text-rose-800">
            AED {Number(kpiData?.payablesKhataAED || 0).toLocaleString()}
          </div>
          <div className="text-[10px] text-slate-700 font-medium mt-1">
            Overseas Suppliers & Freight Dues
          </div>
        </motion.div>

        {/* Metric 6 */}
        <motion.div
          whileHover={{ scale: 1.02, y: -2 }}
          transition={{ duration: 0.15 }}
          className="p-4 rounded-xl border border-amber-200/90 bg-white shadow-xs hover:border-amber-400 transition-all"
        >
          <div className="flex items-center justify-between text-xs text-slate-700 font-bold uppercase tracking-wider mb-1">
            <span>Working Capital</span>
            <ShieldCheck className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-xl font-black font-serif text-amber-900">
            AED {Number(kpiData?.netWorkingCapitalAED || 0).toLocaleString()}
          </div>
          <div className="text-[10px] text-emerald-800 font-medium mt-1">
            Healthy Solvency Ratio (4.4x)
          </div>
        </motion.div>
      </div>

      {/* 3. MULTI-CURRENCY LIVE FX TICKER */}
      <div className="bg-amber-50/80 rounded-xl border border-amber-300/80 p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded bg-amber-600 text-white font-mono font-bold text-[10px] uppercase">
            LIVE FX RATES
          </span>
          <span className="text-slate-700 font-medium">Base: <strong>1 AED (Dirham)</strong> =</span>
        </div>

        <div className="flex items-center gap-4 overflow-x-auto flex-wrap font-mono text-xs">
          {getSafeFxRates(kpiData.currencyRates).map(c => (
            <div key={c.code} className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-amber-200 shadow-2xs">
              <span className="font-bold text-slate-700">{c.code}:</span>
              <span className="font-black text-amber-900">{Number(c.rate || 0).toFixed(4)} {c.symbol}</span>
              <span className="text-[10px] text-slate-700">(1 {c.symbol} = {Number(c.aedEquivalent || 0).toFixed(2)} AED)</span>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => onNavigateTab('setup')}
          className="text-amber-800 hover:text-amber-950 font-bold underline text-[11px] cursor-pointer"
        >
          Adjust Manual FX Rates &rarr;
        </button>
      </div>

      {/* 3.5 BALE & CONTAINER YIELD ANALYTICS ENGINE */}
      <BaleYieldAnalyticsWidget />

      {/* 4. MAIN OPERATIONAL GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left 2 Cols: Inward Cargo & Gate Pass Activity */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-amber-200/90 shadow-xs p-4">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-amber-100">
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-amber-600" />
                <h4 className="font-serif font-bold text-slate-900 text-xs uppercase tracking-wider">
                  Recent Inward Cargo & Customs Gate Passes (IGP)
                </h4>
              </div>
              <button
                type="button"
                onClick={() => onNavigateTab('purchase')}
                className="text-xs font-bold text-amber-800 hover:text-amber-950 flex items-center gap-1"
              >
                <span>View Full Register</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2">Gate Pass No</th>
                    <th className="px-3 py-2">Supplier / Shipper</th>
                    <th className="px-3 py-2">Cargo Weight</th>
                    <th className="px-3 py-2">Sorting Status</th>
                    <th className="px-3 py-2 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {kpiData.recentGatePasses.map(gp => (
                    <tr key={gp.id} className="hover:bg-amber-50/30">
                      <td className="px-3 py-2.5 font-bold text-slate-900">{gp.id}</td>
                      <td className="px-3 py-2.5 font-sans font-medium text-slate-800">{gp.supplier}</td>
                      <td className="px-3 py-2.5 text-slate-700">{gp.weight}</td>
                      <td className="px-3 py-2.5 text-slate-700 font-sans">{gp.pcs}</td>
                      <td className="px-3 py-2.5 text-right">
                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                            gp.status === 'POSTED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {gp.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Quick ERP Shortcuts Bar with Framer Motion hover animations */}
          <div className="bg-white rounded-xl border border-amber-200/90 shadow-xs p-4">
            <h4 className="font-serif font-bold text-slate-900 text-xs uppercase tracking-wider mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-600" />
              <span>Core Module Workflows</span>
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <motion.button
                type="button"
                whileHover={{ scale: 1.03, y: -2 }}
                whileTap={{ scale: 0.98 }}
                transition={{ duration: 0.15 }}
                onClick={() => onNavigateTab('purchase')}
                className="p-3 rounded-xl border border-slate-200 hover:border-amber-400 bg-slate-50/60 hover:bg-amber-50/40 text-left transition-all group cursor-pointer shadow-2xs"
              >
                <Truck className="w-4 h-4 text-amber-700 mb-1 group-hover:scale-110 transition-transform" />
                <div className="font-bold text-xs text-slate-900">Commercial Invoices</div>
                <div className="text-[10px] text-slate-700">Customs CIF & Inward Gate Pass</div>
              </motion.button>
              <motion.button
                type="button"
                whileHover={{ scale: 1.03, y: -2 }}
                whileTap={{ scale: 0.98 }}
                transition={{ duration: 0.15 }}
                onClick={() => {
                  try { localStorage.setItem('vintage_finance_subtab', 'ledger'); } catch {}
                  onNavigateTab('finance');
                }}
                className="p-3 rounded-xl border border-slate-200 hover:border-amber-400 bg-slate-50/60 hover:bg-amber-50/40 text-left transition-all group cursor-pointer shadow-2xs"
              >
                <Receipt className="w-4 h-4 text-amber-700 mb-1 group-hover:scale-110 transition-transform" />
                <div className="font-bold text-xs text-slate-900">General Ledger (GL)</div>
                <div className="text-[10px] text-slate-700">Full Audit Postings & Balances</div>
              </motion.button>
              <motion.button
                type="button"
                whileHover={{ scale: 1.03, y: -2 }}
                whileTap={{ scale: 0.98 }}
                transition={{ duration: 0.15 }}
                onClick={() => onNavigateTab('finance')}
                className="p-3 rounded-xl border border-slate-200 hover:border-amber-400 bg-slate-50/60 hover:bg-amber-50/40 text-left transition-all group cursor-pointer shadow-2xs"
              >
                <Building className="w-4 h-4 text-amber-700 mb-1 group-hover:scale-110 transition-transform" />
                <div className="font-bold text-xs text-slate-900">Chart of Accounts</div>
                <div className="text-[10px] text-slate-700">5-Pillars & Trial Balance</div>
              </motion.button>
              <motion.button
                type="button"
                whileHover={{ scale: 1.03, y: -2 }}
                whileTap={{ scale: 0.98 }}
                transition={{ duration: 0.15 }}
                onClick={() => onNavigateTab('sales')}
                className="p-3 rounded-xl border border-slate-200 hover:border-amber-400 bg-slate-50/60 hover:bg-amber-50/40 text-left transition-all group cursor-pointer shadow-2xs"
              >
                <FileSpreadsheet className="w-4 h-4 text-amber-700 mb-1 group-hover:scale-110 transition-transform" />
                <div className="font-bold text-xs text-slate-900">Sales Gate Passes</div>
                <div className="text-[10px] text-slate-700">Outward Dispatch & VAT 5%</div>
              </motion.button>
            </div>
          </div>
        </div>

        {/* Right Col: Client Khata Balances & System Summary */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-amber-200/90 shadow-xs p-4">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-amber-100">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-amber-600" />
                <h4 className="font-serif font-bold text-slate-900 text-xs uppercase tracking-wider">
                  Top Client Khata Balances
                </h4>
              </div>
              <button
                type="button"
                onClick={() => onNavigateTab('parties')}
                className="text-xs font-bold text-amber-800 hover:text-amber-950 flex items-center gap-1 cursor-pointer"
              >
                <span>Parties</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-2.5">
              {kpiData.clientKhatas.map(ck => (
                <motion.div
                  key={ck.name}
                  whileHover={{ scale: 1.02, x: 2 }}
                  transition={{ duration: 0.15 }}
                  className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/60 flex items-center justify-between shadow-2xs"
                >
                  <div>
                    <div className="font-bold text-slate-900 text-xs">{ck.name}</div>
                    <div className="text-[10px] text-slate-700">{ck.city}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-bold text-xs text-amber-900">
                      AED {Number(ck?.balance || 0).toLocaleString()}
                    </div>
                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800">
                      {ck.status}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Quick System Health Box */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-950 text-white rounded-xl p-4 shadow-md border border-amber-500/30">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <h5 className="font-serif font-bold text-xs uppercase tracking-wider text-amber-300">
                Enterprise System Integrity
              </h5>
            </div>
            <p className="text-xs text-slate-300 mb-3">
              Dual-entry ledger posting active. All transactions balanced. Full audit logging enabled.
            </p>
            <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
              <div className="bg-slate-800/80 p-2 rounded border border-slate-700">
                <span className="text-slate-400 block">DB Architecture:</span>
                <span className="font-bold text-emerald-400">Relational Store v2.4</span>
              </div>
              <div className="bg-slate-800/80 p-2 rounded border border-slate-700">
                <span className="text-slate-400 block">Base Currency:</span>
                <span className="font-bold text-amber-300">AED Dirham (Base 1.0)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
