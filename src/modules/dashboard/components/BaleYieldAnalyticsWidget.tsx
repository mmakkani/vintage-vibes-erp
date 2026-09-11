import React, { useState, useEffect } from 'react';
import { Package, TrendingUp, DollarSign, Globe, Layers, ArrowUpRight, BarChart3, CheckCircle2, RefreshCw } from 'lucide-react';
import { safeFetchJson } from '../../../utils/fetchUtils.ts';

interface BaleBatchDetail {
  gatePassId: string;
  gatePassNo: string;
  date: string;
  baleBatchNo: string;
  containerNo: string;
  originCountry: string;
  totalBales: number;
  totalWeightKg: number;
  baleCostAed: number;
  totalPiecesCount: number;
  soldPiecesCount: number;
  inStockPiecesCount: number;
  soldRevenueAed: number;
  inStockValueAed: number;
  totalPiecesRetailValue: number;
  grossMarginAed: number;
  grossMarginPercent: number;
  realizedRoiPercent: number;
  gradeCount: Record<string, number>;
}

interface YieldAnalyticsResponse {
  totalBalesProcessed: number;
  totalPiecesRealized: number;
  totalPiecesSold: number;
  overallSoldRevenue: number;
  overallStockValue: number;
  baleDetails: BaleBatchDetail[];
}

export const BaleYieldAnalyticsWidget: React.FC = () => {
  const [data, setData] = useState<YieldAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchYieldAnalytics = async () => {
    try {
      setLoading(true);
      const json = await safeFetchJson<YieldAnalyticsResponse>('/api/finance/yield-analytics', undefined, 3, 300);
      if (json) {
        setData(json);
      }
    } catch {
      // Graceful fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchYieldAnalytics();
  }, []);

  if (loading && !data) {
    return (
      <div className="bg-white rounded-xl p-6 border border-stone-200 shadow-sm animate-pulse space-y-4">
        <div className="h-6 bg-stone-200 rounded w-1/3"></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="h-20 bg-stone-200 rounded"></div>
          <div className="h-20 bg-stone-200 rounded"></div>
          <div className="h-20 bg-stone-200 rounded"></div>
          <div className="h-20 bg-stone-200 rounded"></div>
        </div>
      </div>
    );
  }

  const details = data?.baleDetails || [];

  return (
    <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-stone-200 pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <Layers className="w-5 h-5 text-amber-600" />
            <h3 className="font-bold text-lg text-stone-900 tracking-tight">
              Bale & Container Yield Analytics
            </h3>
            <span className="bg-amber-100 text-amber-800 text-[11px] font-bold px-2 py-0.5 rounded-full border border-amber-300">
              Live ROI Engine
            </span>
          </div>
          <p className="text-xs text-stone-500 mt-0.5">
            Tracking landed container cost vs garment piece sales realization and gross margin yields
          </p>
        </div>
        <button
          onClick={fetchYieldAnalytics}
          className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Yields</span>
        </button>
      </div>

      {/* Overview Stat Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200/80">
          <div className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Total Bales Sorted</div>
          <div className="text-2xl font-black text-stone-900 mt-1">
            {data?.totalBalesProcessed || 0} <span className="text-xs font-normal text-stone-500">bales</span>
          </div>
          <div className="text-[11px] text-amber-700 font-medium mt-1">
            Realized: {data?.totalPiecesRealized || 0} graded pieces
          </div>
        </div>

        <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200/80">
          <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Sold Realization</div>
          <div className="text-2xl font-black text-emerald-950 mt-1">
            AED {(data?.overallSoldRevenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-emerald-700 font-medium mt-1">
            {data?.totalPiecesSold || 0} pieces dispatched
          </div>
        </div>

        <div className="p-4 rounded-xl bg-sky-50/70 border border-sky-200/80">
          <div className="text-[11px] font-bold uppercase tracking-wider text-sky-700">Active Piece Stock Value</div>
          <div className="text-2xl font-black text-sky-950 mt-1">
            AED {(data?.overallStockValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-sky-700 font-medium mt-1">
            Wholesale / retail tagged
          </div>
        </div>

        <div className="p-4 rounded-xl bg-purple-50/70 border border-purple-200/80">
          <div className="text-[11px] font-bold uppercase tracking-wider text-purple-700">Avg Piece Realization</div>
          <div className="text-2xl font-black text-purple-950 mt-1">
            AED {data?.totalPiecesRealized ? ((data.overallSoldRevenue + data.overallStockValue) / data.totalPiecesRealized).toFixed(1) : '0.0'}
          </div>
          <div className="text-[11px] text-purple-700 font-medium mt-1">
            Per garment yield
          </div>
        </div>
      </div>

      {/* Batch Yield Table */}
      <div className="border border-stone-200 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-stone-700">
            <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 font-semibold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-4">Gate Pass / Batch</th>
                <th className="py-3 px-4">Origin / Container</th>
                <th className="py-3 px-4 text-center">Weight / Bales</th>
                <th className="py-3 px-4 text-center">Pieces Sorted</th>
                <th className="py-3 px-4 text-right">Sold Revenue</th>
                <th className="py-3 px-4 text-right">Gross Margin</th>
                <th className="py-3 px-4 text-right">Projected ROI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 font-sans">
              {details.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-6 text-stone-400">
                    No processed inward bale batches found in warehouse database.
                  </td>
                </tr>
              ) : (
                details.map(b => (
                  <tr key={b.gatePassId} className="hover:bg-stone-50/80 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-bold text-stone-900">{b.gatePassNo}</div>
                      <div className="text-[11px] font-mono text-stone-500">{b.baleBatchNo}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-stone-800 flex items-center space-x-1">
                        <Globe className="w-3.5 h-3.5 text-stone-400" />
                        <span>{b.originCountry}</span>
                      </div>
                      <div className="text-[10px] text-stone-500 font-mono">{b.containerNo}</div>
                    </td>
                    <td className="py-3 px-4 text-center font-mono">
                      <div>{b.totalBales} bales</div>
                      <div className="text-[10px] text-stone-500">{b.totalWeightKg} kg</div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800">
                        {b.totalPiecesCount} pcs
                      </span>
                      <div className="text-[10px] text-stone-500 mt-0.5">
                        {b.soldPiecesCount} sold | {b.inStockPiecesCount} in stock
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-stone-900">
                      AED {b.soldRevenueAed.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono">
                      <span className={`font-bold ${b.grossMarginPercent >= 40 ? 'text-emerald-600' : 'text-stone-800'}`}>
                        {b.grossMarginPercent.toFixed(1)}%
                      </span>
                      <div className="text-[10px] text-stone-500">
                        +AED {b.grossMarginAed.toFixed(0)}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono">
                      <span className="font-bold text-amber-700">
                        +{b.realizedRoiPercent.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
