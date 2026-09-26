import React from 'react';
import { TrendingUp, Ship, Coins, ShieldCheck, DollarSign } from 'lucide-react';

interface DubaiLiveSoukTickerProps {
  className?: string;
}

export const DubaiLiveSoukTicker: React.FC<DubaiLiveSoukTickerProps> = ({
  className = ''
}) => {
  const tickerItems = [
    {
      icon: <Coins className="w-3 h-3 text-amber-400" />,
      label: '24K GOLD',
      value: 'AED 314.50',
      change: '+0.42%',
      positive: true
    },
    {
      icon: <Coins className="w-3 h-3 text-amber-500" />,
      label: '22K GOLD',
      value: 'AED 291.20',
      change: '+0.38%',
      positive: true
    },
    {
      icon: <DollarSign className="w-3 h-3 text-emerald-400" />,
      label: 'USD / AED',
      value: '3.6725',
      change: 'STABLE',
      positive: true
    },
    {
      icon: <TrendingUp className="w-3 h-3 text-blue-400" />,
      label: 'EUR / AED',
      value: '3.9850',
      change: '+0.15%',
      positive: true
    },
    {
      icon: <TrendingUp className="w-3 h-3 text-rose-400" />,
      label: 'AED / PKR',
      value: '76.25',
      change: 'FOREX',
      positive: true
    },
    {
      icon: <Ship className="w-3 h-3 text-sky-400" />,
      label: 'CARGO',
      value: '480 Bales (Berth 6)',
      change: 'INBOUND',
      positive: true
    },
    {
      icon: <ShieldCheck className="w-3 h-3 text-emerald-400" />,
      label: 'FTA VAT',
      value: '5% Standard',
      change: 'VERIFIED',
      positive: true
    }
  ];

  return (
    <div
      className={`relative w-full overflow-hidden bg-gradient-to-r from-amber-950 via-slate-950 to-amber-950 border-b border-amber-500/40 text-amber-200 py-1 text-xs select-none ${className}`}
      title="Live Dubai Gold Souk, Forex Exchange & Inbound Cargo Telemetry"
    >
      <div className="w-full px-2 sm:px-4 flex items-center justify-between gap-2 overflow-hidden">
        {/* Left Badge: Live Status Pill */}
        <div className="flex items-center gap-1.5 shrink-0 px-2 py-0.5 rounded-full bg-amber-900/60 border border-amber-400/40 text-[9.5px] font-black uppercase tracking-wider text-amber-300">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]"></span>
          <span className="font-serif">DUBAI SOUK LIVE</span>
        </div>

        {/* Live Rates Row: Completely overflow-hidden with zero scrollbar */}
        <div className="flex items-center justify-end sm:justify-between flex-1 gap-2 sm:gap-4 overflow-hidden py-0.5 text-[10.5px]">
          {tickerItems.map((item, idx) => (
            <div
              key={`ticker-${idx}`}
              className="inline-flex items-center gap-1.5 shrink-0 transition-colors hover:text-white"
            >
              <div className="p-0.5 rounded bg-amber-500/20 border border-amber-400/30 flex items-center justify-center">
                {item.icon}
              </div>
              <span className="font-bold text-amber-300 text-[9.5px] tracking-wider uppercase font-mono">
                {item.label}:
              </span>
              <span className="text-white font-mono font-bold tracking-tight text-[10.5px]">
                {item.value}
              </span>
              <span
                className={`text-[8.5px] font-bold px-1 py-0.2 rounded font-mono ${
                  item.positive
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                }`}
              >
                {item.change}
              </span>
              {idx < tickerItems.length - 1 && (
                <span className="text-amber-600/70 font-bold ml-1 hidden lg:inline">◆</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
