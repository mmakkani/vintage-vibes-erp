import React, { useState, useEffect } from 'react';
import { Flame, Sparkles, Clock, Bell, ArrowRight } from 'lucide-react';

interface NextDropBannerProps {
  onExploreDrop?: () => void;
}

export const NextDropBanner: React.FC<NextDropBannerProps> = ({ onExploreDrop }) => {
  // Calculate next drop window (e.g. recurring 6-hour drops: 00:00, 06:00, 12:00, 18:00 UAE time)
  const calculateTimeLeft = () => {
    const now = new Date();
    // Drop cycle every 4 hours from midnight
    const currentHour = now.getHours();
    const nextDropHour = Math.ceil((currentHour + 0.001) / 4) * 4;
    const dropTime = new Date(now);
    dropTime.setHours(nextDropHour % 24, 0, 0, 0);
    if (nextDropHour >= 24) {
      dropTime.setDate(dropTime.getDate() + 1);
    }

    const diff = Math.max(0, dropTime.getTime() - now.getTime());
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff / (1000 * 60)) % 60);
    const seconds = Math.floor((diff / 1000) % 60);

    return {
      hours: String(hours).padStart(2, '0'),
      minutes: String(minutes).padStart(2, '0'),
      seconds: String(seconds).padStart(2, '0'),
      totalSeconds: Math.floor(diff / 1000)
    };
  };

  const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative z-30 w-full bg-gradient-to-r from-slate-950 via-amber-950 to-slate-950 text-amber-100 border-b border-amber-500/40 shadow-md py-2 px-3 sm:px-6">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-4 text-xs">
        {/* Left / Center Banner Announcement */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-center sm:justify-start">
          <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/50 text-amber-300 font-black text-[10px] uppercase tracking-wider animate-pulse">
            <Flame className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
            <span>Vault Scarcity Alert</span>
          </span>

          <span className="font-serif font-black tracking-wide text-slate-100 text-xs sm:text-sm flex items-center gap-2">
            <span>🔥 NEXT VAULT DROP IN:</span>
            {/* Digital Monospace Countdown Display */}
            <span className="inline-flex items-center gap-1 font-mono font-black text-amber-400 bg-black/60 px-2.5 py-0.5 rounded-md border border-amber-500/50 shadow-inner tracking-widest text-xs sm:text-sm">
              <span>{timeLeft.hours}</span>
              <span className="text-amber-500 animate-pulse">:</span>
              <span>{timeLeft.minutes}</span>
              <span className="text-amber-500 animate-pulse">:</span>
              <span>{timeLeft.seconds}</span>
            </span>
          </span>

          <span className="hidden md:inline-block text-[11px] text-amber-200/80 font-medium">
            (50+ 1-of-1 American & Japanese Vintage Grails Inbound from Dubai Sorting Facility)
          </span>
        </div>

        {/* Right CTA */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-500/40 px-2 py-0.5 rounded-full hidden lg:flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            <span>Live Archive Sync</span>
          </span>

          {onExploreDrop && (
            <button
              type="button"
              onClick={onExploreDrop}
              className="text-[11px] font-black uppercase tracking-wider text-slate-950 bg-gradient-to-r from-amber-300 to-amber-400 hover:from-amber-200 hover:to-amber-300 px-3 py-1 rounded-full shadow-md transition-transform active:scale-95 flex items-center gap-1 cursor-pointer"
            >
              <span>View In-Stock Pieces</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
