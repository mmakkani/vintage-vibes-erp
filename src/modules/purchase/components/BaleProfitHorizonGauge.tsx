import React, { useMemo } from 'react';
import {
  TrendingUp,
  Sparkles,
  Award,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  Flame,
  Coins
} from 'lucide-react';
import { PieceBreakdownItem } from '../purchase.types.ts';
import { soundEffects } from '../../../utils/soundEffects.ts';

export interface BaleProfitHorizonGaugeProps {
  baleCost?: number;
  pieces: PieceBreakdownItem[];
  baleCode?: string;
  className?: string;
  compact?: boolean;
}

export const BaleProfitHorizonGauge: React.FC<BaleProfitHorizonGaugeProps> = ({
  baleCost = 2400,
  pieces = [],
  baleCode = 'BALE-001',
  className = '',
  compact = false
}) => {
  // Aggregate sorted piece valuations
  const { totalRetailValuation, totalPieces, grailPiecesCount, totalWeightKg } = useMemo(() => {
    let retailSum = 0;
    let grails = 0;
    let weightSum = 0;

    pieces.forEach(p => {
      const val = p.estimatedPrice || p.retailPriceAed || (p.costPrice ? p.costPrice * 2.5 : 85);
      retailSum += Number(val) || 0;
      if (
        p.labelGrade?.toLowerCase().includes('grail') ||
        p.grade?.toLowerCase().includes('grail') ||
        val >= 300
      ) {
        grails++;
      }
      weightSum += Number(p.weightKg) || ((Number(p.weightGrams) || 0) / 1000);
    });

    return {
      totalRetailValuation: retailSum,
      totalPieces: pieces.length,
      grailPiecesCount: grails,
      totalWeightKg: weightSum
    };
  }, [pieces]);

  // Break-even calculation
  const safeCost = Math.max(baleCost, 1);
  const rawRatio = totalRetailValuation / safeCost;
  const progressPercent = Math.min(Math.round(rawRatio * 100), 200); // Capped at 200% for progress gauge visual
  const isBreakeven = totalRetailValuation >= safeCost;
  const netAlpha = totalRetailValuation - safeCost;
  const roiMultiple = rawRatio.toFixed(2);

  const handleCelebrate = () => {
    if (isBreakeven) {
      soundEffects.playBreakEvenFanfare();
    } else {
      soundEffects.playCashChime();
    }
  };

  if (compact) {
    return (
      <div className={`p-3 rounded-xl border ${isBreakeven ? 'bg-emerald-950/40 border-emerald-500/40' : 'bg-stone-900/60 border-amber-500/30'} ${className}`}>
        <div className="flex items-center justify-between text-xs mb-1.5 font-mono">
          <span className="font-bold flex items-center gap-1.5 text-amber-300">
            <Coins className="w-3.5 h-3.5" />
            <span>ROI Horizon: {baleCode}</span>
          </span>
          <span className={`font-black ${isBreakeven ? 'text-emerald-400' : 'text-amber-400'}`}>
            {progressPercent}% {isBreakeven ? '• PURE PROFIT' : '• RECOVERING'}
          </span>
        </div>
        {/* Compact Progress Bar */}
        <div className="w-full h-3 rounded-full bg-stone-950 border border-slate-800 relative overflow-hidden">
          <div
            className={`h-full transition-all duration-700 ${
              isBreakeven
                ? 'bg-gradient-to-r from-amber-400 via-emerald-400 to-emerald-500 shadow-md shadow-emerald-500/50'
                : 'bg-gradient-to-r from-amber-600 to-amber-400'
            }`}
            style={{ width: `${Math.min(progressPercent, 100)}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[11px] font-mono mt-1 text-slate-400">
          <span>Cost: AED {safeCost.toLocaleString()}</span>
          <span className="text-white font-bold">Tagged: AED {totalRetailValuation.toLocaleString()} ({roiMultiple}x)</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border ${isBreakeven ? 'border-emerald-500/50 bg-gradient-to-br from-stone-950 via-[#0a1410] to-stone-950 shadow-emerald-500/10' : 'border-amber-500/30 bg-stone-950'} p-5 shadow-2xl relative overflow-hidden ${className}`}>
      {/* Background radial glow */}
      <div
        className={`absolute -top-12 -right-12 w-48 h-48 rounded-full blur-3xl pointer-events-none ${
          isBreakeven ? 'bg-emerald-500/15' : 'bg-amber-500/10'
        }`}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black ${
            isBreakeven ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/30' : 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/30'
          }`}>
            {isBreakeven ? <Flame className="w-5 h-5 animate-bounce" /> : <Coins className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-cinzel font-black text-sm text-white uppercase tracking-wider">
                3D Bale Break-Even Horizon Gauge
              </h4>
              <span className={`text-[10px] font-mono font-black uppercase px-2 py-0.5 rounded-full border ${
                isBreakeven
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/50'
              }`}>
                {baleCode}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono">
              Live inventory yield vs landed purchase acquisition cost
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleCelebrate}
          className="self-start sm:self-auto px-3 py-1 rounded-lg bg-stone-900 hover:bg-stone-800 border border-slate-700 text-xs font-mono font-bold text-amber-300 flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>Audit Audio Ping</span>
        </button>
      </div>

      {/* Main KPI Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="p-3 rounded-xl bg-stone-900/80 border border-slate-800">
          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
            Bale Landed Cost
          </span>
          <span className="text-base sm:text-lg font-mono font-black text-white mt-0.5 block">
            AED {safeCost.toLocaleString()}
          </span>
        </div>

        <div className="p-3 rounded-xl bg-stone-900/80 border border-slate-800">
          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
            Sorted Retail Value
          </span>
          <span className="text-base sm:text-lg font-mono font-black text-amber-300 mt-0.5 block">
            AED {totalRetailValuation.toLocaleString()}
          </span>
        </div>

        <div className="p-3 rounded-xl bg-stone-900/80 border border-slate-800">
          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
            Yield Multiplier (ROI)
          </span>
          <span className={`text-base sm:text-lg font-mono font-black mt-0.5 block flex items-center gap-1 ${
            isBreakeven ? 'text-emerald-400' : 'text-amber-400'
          }`}>
            <ArrowUpRight className="w-4 h-4" />
            <span>{roiMultiple}x</span>
          </span>
        </div>

        <div className={`p-3 rounded-xl border ${
          isBreakeven ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300' : 'bg-stone-900/80 border-slate-800 text-slate-300'
        }`}>
          <span className="text-[10px] font-mono uppercase tracking-wider block opacity-75">
            {isBreakeven ? 'Pure Profit (Alpha)' : 'To Break-Even'}
          </span>
          <span className="text-base sm:text-lg font-mono font-black mt-0.5 block">
            {netAlpha >= 0 ? `+AED ${netAlpha.toLocaleString()}` : `-AED ${Math.abs(netAlpha).toLocaleString()}`}
          </span>
        </div>
      </div>

      {/* 3D Gauge Progress Track */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-mono font-bold">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Yield Progress:</span>
            <span className="text-white text-sm">{progressPercent}% of Acquisition</span>
          </div>
          <div className="flex items-center gap-2">
            {isBreakeven ? (
              <span className="inline-flex items-center gap-1 text-emerald-400 font-black">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>100% BREAK-EVEN ACHIEVED • PURE ALPHA ZONE</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-amber-400">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Need AED {Math.max(safeCost - totalRetailValuation, 0).toLocaleString()} to break even</span>
              </span>
            )}
          </div>
        </div>

        {/* Outer 3D Track */}
        <div className="w-full h-7 rounded-xl bg-stone-950 border-2 border-slate-800 p-1 relative overflow-hidden shadow-inner flex items-center">
          {/* Break-even 100% Marker Line */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-20 shadow-[0_0_8px_#fbbf24]"
            style={{ left: '50%' }}
            title="100% Break-Even Point"
          >
            <span className="absolute -top-1 -translate-x-1/2 text-[8px] font-mono font-black bg-amber-400 text-slate-950 px-1 rounded-xs">
              100% BE
            </span>
          </div>

          {/* Fill Gauge */}
          <div
            className={`h-full rounded-lg transition-all duration-700 relative overflow-hidden ${
              isBreakeven
                ? 'bg-gradient-to-r from-amber-500 via-emerald-400 to-emerald-500 shadow-[0_0_16px_rgba(52,211,153,0.4)]'
                : 'bg-gradient-to-r from-rose-600 via-amber-500 to-amber-400'
            }`}
            style={{ width: `${Math.min(progressPercent / 2, 100)}%` }}
          >
            {/* Shimmer animation */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
          </div>
        </div>

        {/* Gauge Scale Labels */}
        <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 px-1 pt-0.5">
          <span>0% (AED 0)</span>
          <span className="text-amber-400 font-bold">100% Break-Even (AED {safeCost.toLocaleString()})</span>
          <span className="text-emerald-400 font-bold">200%+ Profit (AED {(safeCost * 2).toLocaleString()})</span>
        </div>
      </div>

      {/* Footer Pill Counters */}
      <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-slate-400">
        <div className="flex items-center gap-3">
          <span>📦 {totalPieces} Pieces Sorted</span>
          <span>⚖️ {totalWeightKg.toFixed(2)} KG Unpacked</span>
          {grailPiecesCount > 0 && (
            <span className="inline-flex items-center gap-1 text-amber-300 font-bold bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/30">
              <Award className="w-3 h-3 text-amber-400" />
              <span>{grailPiecesCount} Vintage Grail(s) Identified</span>
            </span>
          )}
        </div>
        <span className="text-[11px] text-slate-500">
          Auto-updated on every piece scanned or graded
        </span>
      </div>

      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .animate-shimmer {
          animation: shimmer 2.5s infinite;
        }
      `}</style>
    </div>
  );
};

export default BaleProfitHorizonGauge;
