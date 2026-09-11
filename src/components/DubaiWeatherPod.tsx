import React, { useState, useEffect } from 'react';
import { Sun, Moon, CloudSun, Sparkles, Wind, Droplets } from 'lucide-react';
import { luxuryAudio } from '../utils/luxuryAudio.ts';

interface DubaiWeatherPodProps {
  userName?: string;
  className?: string;
}

export const DubaiWeatherPod: React.FC<DubaiWeatherPodProps> = ({
  userName = 'Executive',
  className = ''
}) => {
  const [currentHour, setCurrentHour] = useState(12);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const updateHour = () => {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Dubai',
        hour: 'numeric',
        hour12: false
      }).formatToParts(new Date());
      const h = parseInt(parts.find(p => p.type === 'hour')?.value || '12', 10);
      setCurrentHour(h);
    };
    updateHour();
    const interval = setInterval(updateHour, 60000);
    return () => clearInterval(interval);
  }, []);

  const isDay = currentHour >= 6 && currentHour < 19;

  const greeting =
    currentHour >= 5 && currentHour < 12
      ? 'Good Morning'
      : currentHour >= 12 && currentHour < 17
      ? 'Good Afternoon'
      : currentHour >= 17 && currentHour < 22
      ? 'Good Evening'
      : 'Late Night Operations';

  const temperature = isDay ? '34°C' : '29°C';
  const weatherCondition = isDay ? 'Sunny & Clear' : 'Starlit Skies';

  return (
    <div
      onMouseEnter={() => {
        setIsHovered(true);
        luxuryAudio.playMechanicalClick(1.2);
      }}
      onMouseLeave={() => setIsHovered(false)}
      className={`relative select-none cursor-pointer flex items-center gap-2.5 px-3 py-1.5 rounded-xl border border-amber-300/80 bg-gradient-to-r from-amber-100/90 via-[#FAF4E6] to-amber-100/80 shadow-xs hover:border-amber-500 hover:shadow-md transition-all duration-200 ${className}`}
      title="Dubai UAE Live Meteorological Telemetry & Executive Pod"
    >
      {/* Weather Icon Pod with Animated Glow */}
      <div className="relative w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white shadow-2xs flex-shrink-0">
        {isDay ? (
          <Sun className="w-4 h-4 text-amber-100 animate-spin" style={{ animationDuration: '24s' }} />
        ) : (
          <Moon className="w-4 h-4 text-amber-100" />
        )}
        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 border border-white"></span>
      </div>

      {/* Greeting & Location Info */}
      <div className="text-left leading-tight">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-black uppercase tracking-wider text-amber-950 font-serif">
            {greeting}
          </span>
          <span className="text-[9px] font-mono font-bold px-1 py-0.2 rounded bg-amber-200/90 text-amber-900">
            {temperature}
          </span>
        </div>
        <div className="text-[9.5px] font-medium text-slate-700 flex items-center gap-1 mt-0.5">
          <span className="font-bold text-amber-900">Dubai Hub</span>
          <span className="text-amber-500">•</span>
          <span className="truncate max-w-[90px]">{weatherCondition}</span>
        </div>
      </div>

      {/* Detailed Weather Hover Flyout */}
      {isHovered && (
        <div className="absolute -bottom-14 left-1/2 -translate-x-1/2 bg-slate-950/95 border border-amber-400 text-amber-200 px-3 py-1.5 rounded-lg text-[10px] font-mono whitespace-nowrap shadow-2xl z-40 pointer-events-none flex items-center gap-2.5 animate-in fade-in zoom-in-95">
          <div className="flex items-center gap-1 text-slate-300">
            <Droplets className="w-3 h-3 text-sky-400" />
            <span>Hum: 48%</span>
          </div>
          <span className="text-slate-600">|</span>
          <div className="flex items-center gap-1 text-slate-300">
            <Wind className="w-3 h-3 text-amber-300" />
            <span>Wind: 14 km/h NW</span>
          </div>
          <span className="text-slate-600">|</span>
          <span className="text-emerald-400 font-bold">Al Quoz Terminal</span>
        </div>
      )}
    </div>
  );
};
