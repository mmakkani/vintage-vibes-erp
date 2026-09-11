import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Sparkles, RotateCw, Award, CheckCircle2 } from 'lucide-react';
import { luxuryAudio } from '../utils/luxuryAudio.ts';

interface GoldCoinFlipper3DProps {
  className?: string;
  onFlipped?: (side: 'HEADS' | 'TAILS') => void;
}

export const GoldCoinFlipper3D: React.FC<GoldCoinFlipper3DProps> = ({
  className = '',
  onFlipped
}) => {
  const [isFlipping, setIsFlipping] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [resultSide, setResultSide] = useState<'HEADS' | 'TAILS'>('HEADS');
  const [flipsCount, setFlipsCount] = useState(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const flipCoin = () => {
    if (isFlipping) return;
    setIsFlipping(true);
    luxuryAudio.playCoinFlipSound();

    // Random outcome: Heads or Tails
    const isHeads = Math.random() > 0.5;
    const newSide = isHeads ? 'HEADS' : 'TAILS';

    // 5 to 7 full 360-degree rotations + target face
    // Even multiples of 180 = HEADS, Odd multiples = TAILS
    const extraSpins = (Math.floor(Math.random() * 3) + 5) * 360;
    const finalAngle = extraSpins + (isHeads ? 0 : 180);

    setRotation(prev => prev + finalAngle);

    setTimeout(() => {
      setResultSide(newSide);
      setIsFlipping(false);
      setFlipsCount(c => c + 1);
      luxuryAudio.playGoldChime();
      setToastMessage(newSide === 'HEADS' ? 'Vintage Vibes Royalty (Front)' : 'UAE Falcon 1 Dirham (Back)');
      if (onFlipped) onFlipped(newSide);

      setTimeout(() => {
        setToastMessage(null);
      }, 3000);
    }, 1400);
  };

  return (
    <div className={`relative flex items-center gap-3 p-2 rounded-2xl bg-gradient-to-br from-amber-500/10 via-amber-200/20 to-amber-600/10 border border-amber-400/40 shadow-sm backdrop-blur-xs ${className}`}>
      {/* 3D Flippable Coin */}
      <div
        className="relative w-12 h-12 cursor-pointer perspective-[1000px] select-none group"
        onClick={flipCoin}
        title="Click to Flip 24K UAE Royal Gold Coin"
      >
        <motion.div
          animate={{ rotateY: rotation }}
          transition={{ duration: 1.4, ease: [0.25, 1, 0.5, 1] }}
          className="w-full h-full relative preserve-3d"
          style={{ transformStyle: 'preserve-3d' }}
        >
          {/* SIDE A: HEADS - Vintage Vibes Royal Emblem */}
          <div
            className="absolute inset-0 rounded-full flex flex-col items-center justify-center p-1 backface-hidden shadow-lg border-2 border-yellow-300"
            style={{
              backfaceVisibility: 'hidden',
              background: 'radial-gradient(circle at 35% 35%, #fffbeb 0%, #fef08a 25%, #f59e0b 60%, #b45309 100%)',
              boxShadow: '0 0 14px rgba(245, 158, 11, 0.6), inset 0 0 6px rgba(180, 83, 9, 0.8)'
            }}
          >
            {/* Ribbed Coin Rim */}
            <div className="absolute inset-0.5 rounded-full border border-dashed border-amber-800/40 pointer-events-none" />
            <span className="font-serif font-black text-amber-950 text-base leading-none drop-shadow-xs">VV</span>
            <span className="text-[7px] font-black uppercase text-amber-900 tracking-tighter scale-90">DUBAI</span>
          </div>

          {/* SIDE B: TAILS - UAE Falcon / 1 Dirham */}
          <div
            className="absolute inset-0 rounded-full flex flex-col items-center justify-center p-1 backface-hidden shadow-lg border-2 border-yellow-300"
            style={{
              backfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
              background: 'radial-gradient(circle at 35% 35%, #fffbeb 0%, #fef08a 25%, #f59e0b 60%, #92400e 100%)',
              boxShadow: '0 0 14px rgba(245, 158, 11, 0.6), inset 0 0 6px rgba(180, 83, 9, 0.8)'
            }}
          >
            {/* Ribbed Coin Rim */}
            <div className="absolute inset-0.5 rounded-full border border-dashed border-amber-800/40 pointer-events-none" />
            <span className="text-base leading-none select-none">🦅</span>
            <span className="text-[7px] font-black uppercase text-amber-900 tracking-tighter scale-90">1 AED</span>
          </div>
        </motion.div>

        {/* Hover ripple pulse */}
        <div className="absolute -inset-1 rounded-full border border-amber-400/50 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none animate-ping" />
      </div>

      {/* Coin Status / Interactive Trigger */}
      <div className="flex flex-col text-left">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] uppercase font-bold tracking-wider text-amber-900 font-mono">24K Royal Coin</span>
          <button
            type="button"
            onClick={flipCoin}
            disabled={isFlipping}
            className="p-0.5 text-amber-700 hover:text-amber-900 transition-colors cursor-pointer"
            title="Toss Coin"
          >
            <RotateCw className={`w-3 h-3 ${isFlipping ? 'animate-spin text-amber-600' : ''}`} />
          </button>
        </div>

        <button
          type="button"
          onClick={flipCoin}
          disabled={isFlipping}
          className="text-xs font-black text-amber-950 hover:text-amber-700 transition-colors text-left flex items-center gap-1 cursor-pointer font-sans"
        >
          <span>{resultSide === 'HEADS' ? 'Vintage Vibes (Emblem)' : 'Falcon (1 Dirham)'}</span>
          <Sparkles className="w-3 h-3 text-amber-500 animate-pulse" />
        </button>

        {toastMessage && (
          <span className="text-[9px] font-bold text-emerald-800 animate-in fade-in slide-in-from-bottom-1 font-mono">
            ★ {toastMessage}
          </span>
        )}
      </div>
    </div>
  );
};
