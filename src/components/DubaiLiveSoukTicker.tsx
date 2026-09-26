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
      icon: <Coins className="w-3.5 h-3.5 text-amber-500" />,
      label: '24K DUBAI GOLD SOUK',
      value: 'AED 314.50 / g',
      change: '+0.42%',
      positive: true
    },
    {
      icon: <Coins className="w-3.5 h-3.5 text-amber-600" />,
      label: '22K GOLD SOUK',
      value: 'AED 291.20 / g',
      change: '+0.38%',
      positive: true
    },
    {
      icon: <DollarSign className="w-3.5 h-3.5 text-emerald-600" />,
      label: 'USD / AED PEG',
      value: '1 USD = 3.6725 AED',
      change: 'STABLE',
      positive: true
    },
    {
      icon: <TrendingUp className="w-3.5 h-3.5 text-blue-600" />,
      label: 'EUR / AED',
      value: '1 EUR = 3.9850 AED',
      change: '+0.15%',
      positive: true
    },
    {
      icon: <TrendingUp className="w-3.5 h-3.5 text-indigo-600" />,
      label: 'GBP / AED',
      value: '1 GBP = 4.7120 AED',
      change: '+0.22%',
      positive: true
    },
    {
      icon: <TrendingUp className="w-3.5 h-3.5 text-rose-600" />,
      label: 'AED / PKR',
      value: '1 AED = 76.25 PKR',
      change: 'FOREX',
      positive: true
    },
    {
      icon: <Ship className="w-3.5 h-3.5 text-sky-600" />,
      label: 'CARGO VESSEL INBOUND',
      value: 'MV Vintage Horizon • 480 Bales (Antwerp ➔ Jebel Ali)',
      change: 'BERTH 6',
      positive: true
    },
    {
      icon: <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />,
      label: 'DUBAI FTA VAT COMPLIANCE',
      value: 'Standard Rated 5% • Audit Trail Verified',
      change: 'ACTIVE',
      positive: true
    }
  ];

  return (
    <div
      className={`relative w-full bg-gradient-to-r from-amber-950 via-slate-950 to-amber-950 border-b border-amber-500/40 text-amber-200 py-1.5 text-xs shadow-md select-none ${className}`}
      title="Live Dubai Gold Souk, Forex Exchange & Inbound Cargo Telemetry"
    >
      <div className="w-full px-3 sm:px-4 flex items-center justify-between gap-3 overflow-x-auto no-scrollbar">
        {/* Left Badge: Live Status Pill */}
        <div className="flex items-center gap-1.5 shrink-0 px-2.5 py-0.5 rounded-full bg-amber-900/60 border border-amber-400/40 text-[10px] font-black uppercase tracking-wider text-amber-300">
          <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]"></span>
          <span className="font-serif">DUBAI SOUK LIVE</span>
        </div>

        {/* Live Rates Row (Static, Zero GPU compositing load) */}
        <div className="flex items-center gap-3 sm:gap-5 overflow-x-auto no-scrollbar py-0.5">
          {tickerItems.map((item, idx) => (
            <div
              key={`ticker-${idx}`}
              className="inline-flex items-center gap-2 text-[11px] font-medium shrink-0 transition-colors hover:text-white cursor-pointer"
            >
              <div className="p-1 rounded bg-amber-500/20 border border-amber-400/30 flex items-center justify-center">
                {item.icon}
              </div>
              <span className="font-bold text-amber-300 text-[10px] tracking-wider uppercase font-mono">
                {item.label}:
              </span>
              <span className="text-white font-mono font-bold tracking-tight">
                {item.value}
              </span>
              <span
                className={`text-[9px] font-bold px-1.5 py-0.2 rounded font-mono ${
                  item.positive
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                }`}
              >
                {item.change}
              </span>
              {idx < tickerItems.length - 1 && (
                <span className="text-amber-600/70 font-bold ml-1.5">◆</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
