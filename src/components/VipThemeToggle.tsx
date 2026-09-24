import React, { useState, useEffect } from 'react';
import { Sun, Moon, Volume2, VolumeX, Sparkles } from 'lucide-react';
import { luxuryAudio } from '../utils/luxuryAudio.ts';

interface VipThemeToggleProps {
  className?: string;
}

export const VipThemeToggle: React.FC<VipThemeToggleProps> = ({
  className = ''
}) => {
  const [isObsidian, setIsObsidian] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem('vintage_vip_theme');
    if (savedTheme === 'obsidian') {
      setIsObsidian(true);
      document.body.classList.add('theme-obsidian');
    }
    setIsMuted(luxuryAudio.getIsMuted());
  }, []);

  const toggleTheme = () => {
    const nextState = !isObsidian;
    setIsObsidian(nextState);
    if (nextState) {
      document.body.classList.add('theme-obsidian');
      localStorage.setItem('vintage_vip_theme', 'obsidian');
    } else {
      document.body.classList.remove('theme-obsidian');
      localStorage.setItem('vintage_vip_theme', 'champagne');
    }
    luxuryAudio.playGoldChime();
  };

  const toggleAudio = (e: React.MouseEvent) => {
    e.stopPropagation();
    const muted = luxuryAudio.toggleMute();
    setIsMuted(muted);
  };

  return (
    <div className={`flex items-center gap-1.5 sm:gap-2 ${className}`}>
      {/* Sound FX Toggle (Mute / Unmute) - Hidden on mobile screens to save space */}
      <button
        type="button"
        onClick={toggleAudio}
        title={isMuted ? 'Unmute Mechanical Sound Effects' : 'Mute Sound Effects'}
        className="hidden sm:flex w-8 h-8 rounded-lg border border-amber-400/70 bg-amber-100/80 hover:bg-amber-200 text-amber-950 items-center justify-center shadow-xs transition-all cursor-pointer"
      >
        {isMuted ? (
          <VolumeX className="w-4 h-4 text-slate-500" />
        ) : (
          <Volume2 className="w-4 h-4 text-amber-700" />
        )}
      </button>

      {/* VIP Theme Pill: Champagne Day vs Maybach Obsidian Night */}
      <button
        type="button"
        onClick={toggleTheme}
        className="relative flex items-center p-0.5 sm:p-1 w-14 sm:w-16 h-7 sm:h-8 rounded-full border-2 border-amber-400/80 bg-gradient-to-r from-amber-200 via-amber-300 to-amber-400 shadow-sm cursor-pointer transition-all duration-300"
        title={`Switch to ${isObsidian ? 'Champagne Royal Day' : 'Maybach Obsidian 24K Gold Night'} Theme`}
      >
        {/* Track Icons */}
        <div className="w-full flex justify-between px-1 sm:px-1.5 text-amber-900 pointer-events-none text-xs">
          <Sun className="w-3 sm:w-3.5 h-3 sm:h-3.5 text-amber-800" />
          <Moon className="w-3 sm:w-3.5 h-3 sm:h-3.5 text-slate-800" />
        </div>

        {/* Sliding 3D Gold / Obsidian Dial Knob */}
        <div
          className={`absolute top-0.5 w-5 sm:w-6 h-5 sm:h-6 rounded-full shadow-md transition-all duration-300 ease-out flex items-center justify-center ${
            isObsidian
              ? 'translate-x-7 sm:translate-x-8 bg-gradient-to-tr from-slate-950 via-slate-900 to-slate-800 border border-amber-400 text-amber-300'
              : 'translate-x-0.5 bg-gradient-to-tr from-amber-100 via-yellow-200 to-amber-300 border border-amber-500 text-amber-950'
          }`}
        >
          {isObsidian ? <Moon className="w-2.5 sm:w-3 h-2.5 sm:h-3 text-amber-300" /> : <Sun className="w-2.5 sm:w-3 h-2.5 sm:h-3 text-amber-700" />}
        </div>
      </button>
    </div>
  );
};
