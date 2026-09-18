import React, { useState, useEffect } from 'react';
import {
  Maximize2,
  Minimize2,
  X,
  Volume2,
  VolumeX,
  Radio,
  TrendingUp,
  Clock,
  Sparkles,
  Zap
} from 'lucide-react';
import { soundEffects } from '../utils/soundEffects.ts';

interface ExecutiveCommandCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialGrossRevenue?: number;
}

export const ExecutiveCommandCenterModal: React.FC<ExecutiveCommandCenterModalProps> = ({
  isOpen,
  onClose,
  initialGrossRevenue = 0
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(soundEffects.isEnabled());
  const [grossRevenue, setGrossRevenue] = useState(initialGrossRevenue);
  const [liveClock, setLiveClock] = useState('');
  const [recentClaims, setRecentClaims] = useState<Array<{ id: string; title: string; priceAed: number; buyer: string; time: string }>>([]);

  // Clock in GST (Dubai Time)
  useEffect(() => {
    const updateTime = () => {
      try {
        const timeStr = new Date().toLocaleTimeString('en-GB', {
          timeZone: 'Asia/Dubai',
          hour12: false
        });
        setLiveClock(timeStr + ' GST');
      } catch (_) {
        setLiveClock(new Date().toLocaleTimeString() + ' GST');
      }
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Keyboard shortcut listener (Escape to close)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const handleToggleSound = () => {
    const next = soundEffects.toggleSound();
    setSoundEnabled(next);
  };

  const handleSimulateSale = () => {
    soundEffects.playCashChime();
    const mockItems = [
      { title: '1993 Metallica Nowhere Else Tour Tee', price: 420, buyer: '@vintage_collector' },
      { title: '1985 Nike Air Jordan Flight Tracktop', price: 650, buyer: '@khalid_alain' },
      { title: '1978 Levi\'s 501 Redline Selvedge Denim', price: 920, buyer: '@dubai_denimhead' }
    ];
    const picked = mockItems[Math.floor(Math.random() * mockItems.length)];
    const timeNow = new Date().toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit' });

    setGrossRevenue(prev => prev + picked.price);
    setRecentClaims(prev => [
      {
        id: String(Date.now()),
        title: picked.title,
        priceAed: picked.price,
        buyer: picked.buyer,
        time: `Just now (${timeNow})`
      },
      ...prev.slice(0, 5)
    ]);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[99999] bg-[#07080c] text-slate-100 flex flex-col justify-between overflow-hidden select-none animate-in fade-in duration-200">
      {/* Top Trading Desk HUD Header */}
      <header className="px-5 py-3.5 bg-gradient-to-r from-stone-950 via-slate-900 to-amber-950/40 border-b border-amber-500/25 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-700 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-amber-500/20">
            <Radio className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
              <h1 className="font-cinzel text-sm md:text-base font-black tracking-widest text-amber-300 uppercase">
                Vintage Vibe • Executive Live Trading Desk
              </h1>
              <span className="text-[10px] font-mono font-black uppercase px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                LIVE TELEMETRY
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5 font-mono">
              DUBAI CENTRAL WAREHOUSE • WALL-STREET COMMAND CONSOLE • 2 BROADCAST FLOORS ACTIVE
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5">
          <div className="px-3 py-1.5 rounded-lg bg-stone-900 border border-slate-800 font-mono text-xs text-amber-300 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span>{liveClock || 'DUBAI GST'}</span>
          </div>

          <button
            type="button"
            onClick={handleToggleSound}
            className={`p-2 rounded-lg border transition-colors cursor-pointer ${
              soundEnabled
                ? 'bg-amber-500/20 border-amber-400/50 text-amber-300'
                : 'bg-stone-900 border-slate-800 text-slate-500'
            }`}
            title={soundEnabled ? 'Mute Sound FX' : 'Enable Golden Chime & Gavel'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={handleSimulateSale}
            className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-lg shadow-amber-500/20 cursor-pointer transition-all active:scale-95"
          >
            <Sparkles className="w-3.5 h-3.5 text-slate-950" />
            <span>+ Simulate Claim</span>
          </button>

          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-2 rounded-lg bg-stone-900 hover:bg-stone-800 border border-slate-800 text-slate-300 transition-colors cursor-pointer"
            title="Toggle TV Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/40 text-rose-300 transition-colors cursor-pointer"
            title="Close Executive Terminal (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Command Center Body */}
      <main className="flex-1 p-5 overflow-y-auto space-y-4 max-w-[1600px] mx-auto w-full">
        {/* KPI Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
          <div className="p-4 rounded-xl bg-stone-950/90 border border-amber-500/30 shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-xl pointer-events-none" />
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest block">
              TODAY'S GROSS REVENUE
            </span>
            <div className="text-2xl md:text-3xl font-black font-mono text-amber-300 mt-1.5 tracking-tight">
              AED {grossRevenue.toLocaleString()}.00
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-bold mt-1">
              <span>▲ +34.8% vs yesterday</span>
              <span className="text-slate-600">•</span>
              <span className="text-slate-400 font-normal">(${Math.round(grossRevenue / 3.6725).toLocaleString()} USD)</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-stone-950/90 border border-slate-800 shadow-lg">
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest block">
              TOTAL LIVE VIEWERS
            </span>
            <div className="text-2xl md:text-3xl font-black font-mono text-blue-400 mt-1.5 tracking-tight">
              1,248
            </div>
            <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <span>TikTok (784) • IG (312) • YT (152)</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-stone-950/90 border border-slate-800 shadow-lg">
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest block">
              LIVE SALES VELOCITY
            </span>
            <div className="text-2xl md:text-3xl font-black font-mono text-purple-400 mt-1.5 tracking-tight">
              4.8 pcs/min
            </div>
            <div className="text-[11px] text-amber-400 font-bold mt-1 flex items-center gap-1">
              <Zap className="w-3 h-3" />
              <span>High Floor Liquidity (Peak Rush)</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-stone-950/90 border border-slate-800 shadow-lg">
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest block">
              PENDING SETTLEMENT (HOLDS)
            </span>
            <div className="text-2xl md:text-3xl font-black font-mono text-rose-400 mt-1.5 tracking-tight">
              AED 2,890.00
            </div>
            <div className="text-[11px] text-rose-400/80 mt-1 font-mono">
              7 claims awaiting Apple Pay / Transfer
            </div>
          </div>
        </div>

        {/* Dual Floor Telemetry: Booth 1 & Booth 2 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Booth 1 Monitor */}
          <div className="rounded-2xl border border-amber-500/30 bg-stone-950 p-4 shadow-xl relative overflow-hidden flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded text-[10px] font-black uppercase bg-red-600 text-white animate-pulse">
                    ● ON AIR
                  </span>
                  <span className="font-black text-xs text-white uppercase tracking-wider">
                    Booth 1: Main Auction Floor
                  </span>
                </div>
                <span className="text-xs font-mono text-amber-300 font-bold bg-stone-900 px-2.5 py-1 rounded-lg border border-slate-800">
                  Host: Sarah Al-Maktoum (784 Viewers)
                </span>
              </div>

              {/* Central Active On-Air Frame */}
              <div className="w-full h-44 rounded-xl bg-gradient-to-br from-stone-900 to-[#0c0e14] border border-amber-500/20 relative flex items-center justify-center overflow-hidden p-4">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(217,119,6,0.18)_0%,transparent_70%)] pointer-events-none" />
                <div className="text-center z-10 space-y-1.5">
                  <span className="text-[10px] font-mono text-amber-400 font-extrabold uppercase tracking-widest">
                    ACTIVE BIDDING LOT #042
                  </span>
                  <div className="text-base font-black text-white font-cinzel">
                    1994 NIRVANA IN UTERO ORIGINAL TOUR TEE
                  </div>
                  <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-amber-500/20 border border-amber-400 text-amber-300 font-mono font-black text-xs">
                    <span>CURRENT BID: AED 850</span>
                    <span className="text-amber-500">•</span>
                    <span className="text-emerald-400">SINGLE STITCH</span>
                  </div>
                </div>

                {/* Simulated Audio Peak Meter */}
                <div className="absolute bottom-2.5 left-4 right-4 flex items-center justify-between text-[10px] font-mono text-slate-400">
                  <span>MIC PEAK: -2.8 dB</span>
                  <div className="flex gap-0.5 items-end h-3.5">
                    <span className="w-1 h-2 bg-emerald-500" />
                    <span className="w-1 h-3 bg-emerald-500" />
                    <span className="w-1 h-2.5 bg-emerald-500" />
                    <span className="w-1 h-3.5 bg-amber-500" />
                    <span className="w-1 h-1 bg-slate-700" />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-3 pt-2.5 border-t border-slate-900 flex items-center justify-between text-xs font-mono text-slate-400">
              <span>Category: Vintage Band Tees & Rare Grails</span>
              <span className="text-emerald-400 font-bold">Latency: 18ms</span>
            </div>
          </div>

          {/* Booth 2 Monitor */}
          <div className="rounded-2xl border border-blue-500/30 bg-stone-950 p-4 shadow-xl relative overflow-hidden flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded text-[10px] font-black uppercase bg-red-600 text-white animate-pulse">
                    ● ON AIR
                  </span>
                  <span className="font-black text-xs text-white uppercase tracking-wider">
                    Booth 2: Premium Outerwear Floor
                  </span>
                </div>
                <span className="text-xs font-mono text-blue-300 font-bold bg-stone-900 px-2.5 py-1 rounded-lg border border-slate-800">
                  Host: Marcus Chen (464 Viewers)
                </span>
              </div>

              {/* Central Active On-Air Frame */}
              <div className="w-full h-44 rounded-xl bg-gradient-to-br from-stone-900 to-[#0c0e14] border border-blue-500/20 relative flex items-center justify-center overflow-hidden p-4">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.18)_0%,transparent_70%)] pointer-events-none" />
                <div className="text-center z-10 space-y-1.5">
                  <span className="text-[10px] font-mono text-blue-400 font-extrabold uppercase tracking-widest">
                    ACTIVE BIDDING LOT #089
                  </span>
                  <div className="text-base font-black text-white font-cinzel">
                    1989 CARHARTT DETROIT SANTA FE JACKET
                  </div>
                  <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-blue-500/20 border border-blue-400 text-blue-300 font-mono font-black text-xs">
                    <span>CURRENT BID: AED 480</span>
                    <span className="text-blue-500">•</span>
                    <span className="text-amber-300">FADED MOSS</span>
                  </div>
                </div>

                {/* Simulated Audio Peak Meter */}
                <div className="absolute bottom-2.5 left-4 right-4 flex items-center justify-between text-[10px] font-mono text-slate-400">
                  <span>MIC PEAK: -4.6 dB</span>
                  <div className="flex gap-0.5 items-end h-3.5">
                    <span className="w-1 h-2 bg-emerald-500" />
                    <span className="w-1 h-2.5 bg-emerald-500" />
                    <span className="w-1 h-3 bg-emerald-500" />
                    <span className="w-1 h-1 bg-slate-700" />
                    <span className="w-1 h-1 bg-slate-700" />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-3 pt-2.5 border-t border-slate-900 flex items-center justify-between text-xs font-mono text-slate-400">
              <span>Category: Workwear, Carhartt & Leather Outerwear</span>
              <span className="text-emerald-400 font-bold">Latency: 22ms</span>
            </div>
          </div>
        </div>

        {/* Recent Transactions Stream */}
        <div className="bg-stone-950 p-4 rounded-xl border border-slate-800">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-mono font-extrabold uppercase text-slate-300 tracking-wider flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-amber-400" />
              <span>Real-Time Sales Log Stream</span>
            </span>
            <span className="text-[11px] font-mono text-emerald-400 font-bold">
              Automatic Relational SQL Journal Entry
            </span>
          </div>

          {recentClaims.length === 0 ? (
            <div className="p-6 rounded-lg bg-stone-900/50 border border-dashed border-slate-800 text-center text-slate-500 font-mono text-xs">
              No sales logged yet. Live stream ready for incoming transactions.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {recentClaims.map(c => (
                <div key={c.id} className="p-3 rounded-lg bg-stone-900 border border-slate-800 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                      <span className="text-amber-400 font-bold">{c.buyer}</span>
                      <span>{c.time}</span>
                    </div>
                    <h5 className="font-bold text-xs text-white mt-1 truncate">{c.title}</h5>
                  </div>
                  <div className="text-sm font-mono font-black text-emerald-400 mt-2">
                    +AED {c.priceAed.toLocaleString()}.00
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Bottom Continuous Wall-Street Stock Ticker Tape */}
      <footer className="bg-stone-950 border-t border-amber-500/25 p-2.5 overflow-hidden flex items-center gap-3">
        <div className="px-2.5 py-1 rounded bg-amber-500 text-slate-950 font-black text-[10px] uppercase tracking-wider shrink-0 shadow-sm">
          LIVE TICKER 🔴
        </div>
        <div className="overflow-hidden w-full relative">
          <div className="inline-flex whitespace-nowrap animate-ticker text-xs font-mono font-bold text-slate-300 space-x-6">
            <span className="text-blue-300">FX: 1 USD = 3.6725 AED</span>
            <span className="text-slate-600">•</span>
            <span className="text-blue-300">FX: 1 SAR = 0.9790 AED</span>
            <span className="text-slate-600">•</span>
            <span className="text-blue-300">FX: 1 EUR = 4.0210 AED</span>
            <span className="text-slate-600">•</span>
            <span className="text-emerald-400">DATABASE: Supabase PostgreSQL Connected</span>
            <span className="text-slate-600">•</span>
            <span className="text-purple-300 font-black">GROSS BOOKED TODAY: AED {grossRevenue.toLocaleString()}.00</span>
            <span className="text-slate-600">•</span>
            <span className="text-amber-300">LOGISTICS HUB: Al Ain Central Consignment Terminal Active</span>
          </div>
        </div>
      </footer>

      <style>{`
        @keyframes ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-ticker {
          display: inline-flex;
          white-space: nowrap;
          animation: ticker 32s linear infinite;
        }
        .animate-ticker:hover {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  );
};

export default ExecutiveCommandCenterModal;
