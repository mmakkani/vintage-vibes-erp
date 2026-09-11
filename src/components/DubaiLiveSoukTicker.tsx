import React, { useState } from 'react';
import { Sparkles, TrendingUp, Ship, Coins, ShieldCheck, DollarSign, ArrowUpRight } from 'lucide-react';
import { luxuryAudio } from '../utils/luxuryAudio.ts';

interface DubaiLiveSoukTickerProps {
  className?: string;
}

export const DubaiLiveSoukTicker: React.FC<DubaiLiveSoukTickerProps> = ({
  className = ''
}) => {
  const [isPaused, setIsPaused] = useState(false);

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
      onMouseEnter={() => {
        setIsPaused(true);
        luxuryAudio.playMechanicalClick(0.9);
      }}
      onMouseLeave={() => setIsPaused(false)}
      className={`relative w-full overflow-hidden bg-gradient-to-r from-amber-900 via-amber-950 to-slate-950 border-b border-amber-500/40 text-amber-200 py-1.5 text-xs shadow-md select-none ${className}`}
      title="Live Dubai Gold Souk, Forex Exchange & Inbound Cargo Telemetry (Hover to Pause)"
    >
      {/* Subtle Gold Foil Sheen Overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_0%,rgba(251,191,36,0.15)_50%,transparent_100%)] pointer-events-none" />

      {/* Left Badge: Live Status Pill */}
      <div className="absolute left-0 top-0 bottom-0 z-10 px-3 sm:px-4 bg-gradient-to-r from-amber-900 via-amber-900/90 to-transparent flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-amber-300">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
        <span className="font-serif">DUBAI SOUK LIVE</span>
      </div>

      {/* Marquee Track Container */}
      <div
        className="flex whitespace-nowrap will-change-transform pl-44"
        style={{
          animation: `tickerMarquee 38s linear infinite`,
          animationPlayState: isPaused ? 'paused' : 'running'
        }}
      >
        {/* Render items twice for continuous infinite scroll */}
        {[...tickerItems, ...tickerItems].map((item, idx) => (
          <div
            key={`ticker-${idx}`}
            className="inline-flex items-center gap-2.5 mx-6 text-[11px] font-medium transition-colors hover:text-white cursor-pointer"
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
            <span className="text-amber-600/70 font-bold mx-2">◆</span>
          </div>
        ))}
      </div>

      {/* Embedded Hardware-Accelerated Marquee Animation */}
      <style>{`
        @keyframes tickerMarquee {
          0% {
            transform: translateX(0%);
          }
          100% {
            transform: translateX(-50%);
          }
        }
      `}</style>
    </div>
  );
};
