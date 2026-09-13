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

  // Split corporate brand name into 2 structured lines to prevent awkward 3-line word wrapping
  let primaryName = name;
  let secondaryName = '';

  const splitKeywords = ['GENERAL TRADING', 'TRADING', 'L.L.C', 'LLC', 'LIMITED', 'LTD'];
  for (const keyword of splitKeywords) {
    const idx = name.toUpperCase().indexOf(keyword);
    if (idx > 0) {
      primaryName = name.slice(0, idx).trim();
      secondaryName = name.slice(idx).trim();
      break;
    }
  }

  // If no keyword match but more than 2 words and long, split into 2 balanced lines
  if (!secondaryName && name.split(' ').length > 2 && name.length > 20) {
    const parts = name.split(' ');
    primaryName = parts.slice(0, 2).join(' ');
    secondaryName = parts.slice(2).join(' ');
  }

  const renderWordGroup = (text: string, isSubtitle = false) => {
    const words = text.split(' ');
    return words.map((word, wordIdx) => (
      <span key={`word-${wordIdx}`} className="inline-flex whitespace-nowrap">
        {word.split('').map((char, charIdx) => {
          const globalIdx = (isSubtitle ? 1000 : 0) + wordIdx * 30 + charIdx;
          return (
            <motion.span
              key={`char-${globalIdx}`}
              whileHover={{
                y: isSubtitle ? -6 : -10,
                scale: isSubtitle ? 1.15 : 1.25,
                color: '#d97706',
                textShadow:
                  '0 1px 0 #fff7d6, 0 2px 0 #fbbf24, 0 3px 0 #d97706, 0 4.5px 0 #b45309, 0 6px 0 #78350f, 0 8px 0 #451a03, 0 10px 14px rgba(0,0,0,0.4)',
                transition: { type: 'spring', stiffness: 550, damping: 12 }
              }}
              whileTap={{ scale: 0.92 }}
              className="inline-block cursor-pointer origin-bottom transition-all duration-100 ease-out font-black"
              style={{
                color: isSubtitle ? '#92400e' : '#b45309',
                textShadow: isSubtitle
                  ? '0 1px 0 #fffbeb, 0 1.2px 0 #f59e0b, 0 2px 0 #b45309, 0 2.5px 4px rgba(0,0,0,0.18)'
                  : '0 1px 0 #fffbeb, 0 1.8px 0 #f59e0b, 0 2.8px 0 #b45309, 0 4px 0 #78350f, 0 5.5px 8px rgba(0,0,0,0.28)',
                letterSpacing: isSubtitle ? '0.08em' : '0.035em',
                display: 'inline-block'
              }}
            >
              {char}
            </motion.span>
          );
        })}
      </span>
    ));
  };

  return (
    <div
      id="3d-company-name-container"
      className={`select-none flex flex-col justify-center ${className}`}
      title={`${name} (Hover over any alphabet to lift in 3D)`}
    >
      {/* Primary Brand Line (e.g. VINTAGE VIBES) */}
      <h1
        id="3d-company-name"
        className={`font-black uppercase flex items-center gap-x-2 whitespace-nowrap drop-shadow-sm ${sizeClasses}`}
        style={{
          fontFamily: "'Cinzel', 'Playfair Display', Georgia, serif",
          lineHeight: 1.15
        }}
      >
        {renderWordGroup(primaryName, false)}
      </h1>

      {/* Secondary Legal Entity Line (e.g. GENERAL TRADING L.L.C - S.P.C) */}
      {secondaryName && (
        <div
          id="3d-company-name-secondary"
          className="font-extrabold uppercase flex items-center gap-x-1.5 whitespace-nowrap text-[10px] sm:text-xs tracking-[0.1em] text-amber-900/90 mt-0.5"
          style={{
            fontFamily: "'Cinzel', 'Playfair Display', Georgia, serif",
            lineHeight: 1.1
          }}
        >
          {renderWordGroup(secondaryName, true)}
        </div>
      )}
    </div>
  );
};
