import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Award, CheckCircle2 } from 'lucide-react';
import { luxuryAudio } from '../utils/luxuryAudio.ts';

interface RoyalWaxSealProps {
  sealText?: string;
  subText?: string;
  size?: 'sm' | 'md' | 'lg';
  date?: string;
  approver?: string;
  isAnimated?: boolean;
  className?: string;
}

export const RoyalWaxSeal: React.FC<RoyalWaxSealProps> = ({
  sealText = 'APPROVED',
  subText = 'VINTAGE VIBES DUBAI',
  size = 'md',
  date,
  approver,
  isAnimated = true,
  className = ''
}) => {
  const [stamped, setStamped] = useState(!isAnimated);

  useEffect(() => {
    if (isAnimated) {
      const timer = setTimeout(() => {
        setStamped(true);
        luxuryAudio.playWaxSealSound();
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [isAnimated]);

  const sizeClasses = {
    sm: 'w-16 h-16 text-[8px]',
    md: 'w-24 h-24 text-[10px]',
    lg: 'w-32 h-32 text-xs'
  }[size];

  const currentDate = date || new Date().toISOString().slice(0, 10);

  return (
    <div className={`relative inline-flex items-center justify-center select-none ${className}`}>
      <AnimatePresence>
        {stamped && (
          <motion.div
            initial={{ scale: 2.4, opacity: 0, rotate: -30 }}
            animate={{ scale: 1, opacity: 0.95, rotate: -8 }}
            transition={{ type: 'spring', damping: 14, stiffness: 220 }}
            className={`relative rounded-full flex flex-col items-center justify-center text-center font-bold tracking-widest ${sizeClasses}`}
            style={{
              // Royal Wax Seal physical appearance with molten wax scalloped edge
              background: 'radial-gradient(circle at 35% 30%, #ef4444 0%, #b91c1c 45%, #7f1d1d 85%, #450a0a 100%)',
              boxShadow: `
                0 0 0 3px rgba(185, 28, 28, 0.4),
                0 4px 12px rgba(127, 29, 29, 0.5),
                inset 0 2px 4px rgba(254, 202, 202, 0.6),
                inset 0 -3px 6px rgba(69, 10, 10, 0.8)
              `,
              border: '2px solid rgba(254, 226, 226, 0.4)',
              color: '#fef2f2'
            }}
          >
            {/* Scalloped outer wax ring simulation */}
            <div className="absolute inset-1 rounded-full border border-dashed border-red-200/50 pointer-events-none" />

            {/* Inner Gold Foil Stamped Emboss */}
            <div className="relative z-10 flex flex-col items-center justify-center px-1">
              <span className="text-[7px] uppercase font-mono tracking-tighter text-amber-200 opacity-90">
                ★ {subText} ★
              </span>

              <div className="my-0.5 font-serif font-black tracking-widest text-white text-shadow-sm uppercase border-y border-amber-300/40 py-0.5 px-1.5 flex items-center gap-1">
                <CheckCircle2 className="w-2.5 h-2.5 text-amber-300" />
                <span>{sealText}</span>
              </div>

              <span className="text-[6.5px] font-mono uppercase tracking-tight text-amber-100 opacity-80">
                {currentDate}
              </span>

              {approver && (
                <span className="text-[6px] font-mono tracking-tighter text-red-200 uppercase truncate max-w-[80px]">
                  BY: {approver}
                </span>
              )}
            </div>

            {/* Molten wax edge blobs */}
            <div className="absolute -top-1 left-2 w-3 h-2 rounded-full bg-red-800 opacity-75 blur-[0.5px]" />
            <div className="absolute -bottom-1.5 right-3 w-4 h-2.5 rounded-full bg-red-900 opacity-80 blur-[0.5px]" />
            <div className="absolute top-4 -right-1 w-2.5 h-3 rounded-full bg-red-800 opacity-70 blur-[0.5px]" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
