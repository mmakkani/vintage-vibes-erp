import React from 'react';
import { motion } from 'motion/react';

interface CompanyName3DProps {
  name: string;
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
}

export const CompanyName3D: React.FC<CompanyName3DProps> = ({
  name,
  className = '',
  size = 'md'
}) => {
  const sizeClasses = {
    xs: 'text-sm sm:text-base tracking-wider',
    sm: 'text-base sm:text-lg md:text-xl tracking-wide',
    md: 'text-lg sm:text-xl md:text-2xl tracking-normal',
    lg: 'text-xl sm:text-2xl md:text-3xl tracking-normal',
    xl: 'text-2xl sm:text-3xl md:text-4xl tracking-tight'
  }[size];

  // Split name into words, then each word into individual characters
  // so word wrapping is preserved while every single alphabet animates individually
  const words = name.split(' ');

  return (
    <div
      id="3d-company-name-container"
      className={`select-none inline-flex flex-wrap items-center gap-x-2.5 py-1 ${className}`}
      title="Vintage Vibes General Trading L.L.C - S.P.C (Hover over any alphabet to lift in 3D)"
    >
      <h1
        id="3d-company-name"
        className={`font-black uppercase flex flex-wrap items-center gap-x-2.5 drop-shadow-sm ${sizeClasses}`}
        style={{
          fontFamily: "'Cinzel', 'Playfair Display', Georgia, serif",
          lineHeight: 1.2
        }}
      >
        {words.map((word, wordIdx) => (
          <span key={`word-${wordIdx}`} className="inline-flex whitespace-nowrap">
            {word.split('').map((char, charIdx) => {
              const globalIdx = wordIdx * 30 + charIdx;
              return (
                <motion.span
                  key={`char-${globalIdx}`}
                  whileHover={{
                    y: -12,
                    scale: 1.3,
                    color: '#d97706',
                    textShadow:
                      '0 1px 0 #fff7d6, 0 2px 0 #fbbf24, 0 3px 0 #d97706, 0 4.5px 0 #b45309, 0 6px 0 #78350f, 0 8px 0 #451a03, 0 12px 18px rgba(0,0,0,0.5)',
                    transition: { type: 'spring', stiffness: 550, damping: 12 }
                  }}
                  whileTap={{ scale: 0.92 }}
                  className="inline-block cursor-pointer origin-bottom transition-all duration-100 ease-out font-black"
                  style={{
                    // Pure Straight Front View - Razor Sharp 3D Bevel with No Distortion
                    color: '#b45309',
                    textShadow:
                      '0 1px 0 #fffbeb, 0 1.8px 0 #f59e0b, 0 2.8px 0 #b45309, 0 4px 0 #78350f, 0 5.5px 8px rgba(0,0,0,0.28)',
                    letterSpacing: '0.035em',
                    display: 'inline-block'
                  }}
                >
                  {char}
                </motion.span>
              );
            })}
          </span>
        ))}
      </h1>
    </div>
  );
};
