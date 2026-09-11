import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Move, RotateCcw } from 'lucide-react';

interface LuxuryCarClock3DProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  draggable?: boolean;
}

export const LuxuryCarClock3D: React.FC<LuxuryCarClock3DProps> = ({
  size = 'lg',
  className = '',
  draggable = true
}) => {
  const [time, setTime] = useState(new Date());
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const clockRef = useRef<HTMLDivElement>(null);

  // Tick clock every 250ms for smooth sweeping motion
  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 250);
    return () => clearInterval(timer);
  }, []);

  // Compute angles for clock hands in Dubai UAE GST (UTC+4)
  const getDubaiTime = (d: Date) => {
    const options: Intl.DateTimeFormatOptions = {
      timeZone: 'Asia/Dubai',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false
    };
    const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(d);
    const h = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
    const m = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
    const s = parseInt(parts.find(p => p.type === 'second')?.value || '0', 10);
    const ms = d.getMilliseconds();
    return { h, m, s, ms };
  };

  const { h, m, s, ms } = getDubaiTime(time);

  // Exact fractional hand angles
  const secondAngle = (s + ms / 1000) * 6; // 360 / 60
  const minuteAngle = (m + s / 60) * 6; // 360 / 60
  const hourAngle = ((h % 12) + m / 60 + s / 3600) * 30; // 360 / 12

  // Rolls-Royce Dashboard Proportions
  const dimensions = {
    sm: 'w-20 h-20 sm:w-24 sm:h-24',
    md: 'w-24 h-24 sm:w-28 sm:h-28',
    lg: 'w-32 h-32 sm:w-36 sm:h-36 lg:w-40 lg:h-40',
    xl: 'w-40 h-40 sm:w-44 sm:h-44 lg:w-48 lg:h-48'
  }[size];

  // 12-hour formatted time with AM/PM for high-contrast digital sub-window
  const digitalTime12 = time.toLocaleTimeString('en-US', {
    timeZone: 'Asia/Dubai',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });

  // Numbers 1 to 12 coordinates around circle (radius = 76, center = 120, 120)
  const numerals = [
    { num: '12', x: 120, y: 55 },
    { num: '1', x: 158, y: 65 },
    { num: '2', x: 184, y: 92 },
    { num: '3', x: 194, y: 126 },
    { num: '4', x: 184, y: 160 },
    { num: '5', x: 158, y: 186 },
    { num: '6', x: 120, y: 196 },
    { num: '7', x: 82, y: 186 },
    { num: '8', x: 56, y: 160 },
    { num: '9', x: 46, y: 126 },
    { num: '10', x: 56, y: 92 },
    { num: '11', x: 82, y: 65 }
  ];

  return (
    <motion.div
      key={resetKey}
      drag={draggable}
      dragMomentum={false}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={() => setIsDragging(false)}
      whileDrag={{ scale: 1.12, cursor: 'grabbing', zIndex: 9999 }}
      ref={clockRef}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`relative select-none ${draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} flex-shrink-0 group ${dimensions} ${className}`}
      title="Official Rolls-Royce Inspired Dashboard Chronometer • Drag anywhere on screen!"
      style={{
        zIndex: isDragging ? 9999 : isHovered ? 50 : 20,
        touchAction: 'none'
      }}
    >
      {/* Clock Housing with Solid 3D Bevel */}
      <div
        className="w-full h-full relative transition-transform duration-150 ease-out"
        style={{
          transform: isHovered && !isDragging ? 'scale(1.05)' : 'scale(1)'
        }}
      >
        {/* Ambient Gold/Platinum Halo Glow */}
        <div
          className="absolute -inset-2.5 rounded-full bg-gradient-to-tr from-amber-400/40 via-yellow-200/30 to-amber-500/40 blur-xl pointer-events-none transition-opacity duration-300"
          style={{ opacity: isHovered || isDragging ? 0.95 : 0.4 }}
        />

        {/* =====================================================================
            AUTHENTIC ROLLS-ROYCE DASHBOARD TIMEPIECE (HIGH-CONTRAST & CLEAR)
            Features Frosted Champagne/Ivory Dial with Jet-Black/Gold Numerals
            and Razor-Sharp High-Visibility Blued-Steel & Gold Hands!
            ===================================================================== */}
        <svg
          viewBox="0 0 240 240"
          className="w-full h-full drop-shadow-[0_14px_28px_rgba(0,0,0,0.65)]"
        >
          <defs>
            {/* Mirror-Polished Rolls-Royce Heavy Chrome / Gold Bezel */}
            <radialGradient id="rrOuterBezel" cx="30%" cy="25%" r="75%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="18%" stopColor="#fef08a" />
              <stop offset="42%" stopColor="#d97706" />
              <stop offset="70%" stopColor="#78350f" />
              <stop offset="90%" stopColor="#451a03" />
              <stop offset="100%" stopColor="#1e0a01" />
            </radialGradient>

            {/* Stepped Chrome Inner Ring */}
            <linearGradient id="rrInnerChrome" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="40%" stopColor="#cbd5e1" />
              <stop offset="70%" stopColor="#64748b" />
              <stop offset="100%" stopColor="#334155" />
            </linearGradient>

            {/* High-Contrast Frosted Cream / Ivory Guilloché Dial */}
            <radialGradient id="rrDialIvory" cx="45%" cy="40%" r="65%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="45%" stopColor="#fdfaf3" />
              <stop offset="80%" stopColor="#f5edd8" />
              <stop offset="100%" stopColor="#e8dcbe" />
            </radialGradient>

            {/* Deep Piano-Black / Blued-Steel Hand Gradient (Crystal Clear Contrast) */}
            <linearGradient id="rrHandBlack" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#0f172a" />
              <stop offset="50%" stopColor="#1e293b" />
              <stop offset="100%" stopColor="#020617" />
            </linearGradient>

            {/* Sharp Hand Shadow Filter */}
            <filter id="rrHandShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="2" dy="4" stdDeviation="1.5" floodColor="#1e293b" floodOpacity="0.55" />
            </filter>

            {/* Sapphire Curved Crystal Anti-Reflective Glare */}
            <linearGradient id="rrCrystalGlare" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
              <stop offset="40%" stopColor="#ffffff" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* 1. Heavy Mirror-Polished Rolls-Royce Bezel (Outer Rim) */}
          <circle cx="120" cy="120" r="117" fill="url(#rrOuterBezel)" stroke="#260e02" strokeWidth="3" />

          {/* Precision Fluted Rim Ticks (Goodwood Bespoke Detail) */}
          {[...Array(60)].map((_, i) => (
            <line
              key={`flute-${i}`}
              x1="120"
              y1="4"
              x2="120"
              y2={i % 5 === 0 ? "9" : "6.5"}
              stroke="#fffbeb"
              strokeWidth={i % 5 === 0 ? "1.6" : "0.9"}
              opacity={0.8}
              transform={`rotate(${i * 6} 120 120)`}
            />
          ))}

          {/* 2. Stepped Chrome Bezel Ring */}
          <circle cx="120" cy="120" r="110" fill="url(#rrInnerChrome)" stroke="#0f172a" strokeWidth="2" />
          <circle cx="120" cy="120" r="105" fill="none" stroke="#fef08a" strokeWidth="1.5" opacity="0.9" />

          {/* 3. High-Contrast Frosted Ivory/Champagne Dial Face */}
          <circle cx="120" cy="120" r="102" fill="url(#rrDialIvory)" stroke="#b45309" strokeWidth="2.5" />

          {/* Elegant Circular Sunray Guilloché Tracks */}
          <circle cx="120" cy="120" r="88" fill="none" stroke="#d97706" strokeWidth="0.8" strokeDasharray="3 4" opacity="0.45" />
          <circle cx="120" cy="120" r="68" fill="none" stroke="#cbd5e1" strokeWidth="0.8" opacity="0.6" />
          <circle cx="120" cy="120" r="42" fill="none" stroke="#d97706" strokeWidth="0.8" opacity="0.35" />

          {/* 4. Fine Minute Railway Track (60 Minutes) */}
          {[...Array(60)].map((_, i) => {
            const isHour = i % 5 === 0;
            return (
              <line
                key={`rr-rail-${i}`}
                x1="120"
                y1="19"
                x2="120"
                y2={isHour ? "29" : "24"}
                stroke={isHour ? "#78350f" : "#64748b"}
                strokeWidth={isHour ? "2.5" : "1.2"}
                opacity={isHour ? 1 : 0.75}
                transform={`rotate(${i * 6} 120 120)`}
              />
            );
          })}

          {/* 5. CRYSTAL-CLEAR ROLLS-ROYCE NUMERALS (1 TO 12) */}
          {numerals.map(({ num, x, y }) => (
            <text
              key={`rr-num-${num}`}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontFamily="'Playfair Display', 'Cinzel', 'Georgia', serif"
              fontWeight="900"
              fontSize={num === '12' ? '18' : '15'}
              fill="#1e1b18"
              filter="drop-shadow(0 1px 1px rgba(255,255,255,0.9))"
            >
              {num}
            </text>
          ))}

          {/* 6. Signature Rolls-Royce Brand Insignia */}
          <text
            x="120"
            y="76"
            textAnchor="middle"
            fontFamily="'Cinzel', 'Playfair Display', serif"
            fontWeight="800"
            fontSize="8"
            fill="#78350f"
            letterSpacing="2.5"
          >
            VINTAGE VIBES
          </text>
          <text
            x="120"
            y="87"
            textAnchor="middle"
            fontFamily="'Cinzel', sans-serif"
            fontWeight="700"
            fontSize="5.5"
            fill="#92400e"
            letterSpacing="1.5"
          >
            ROLLS-ROYCE EDITION
          </text>

          {/* 7. Built-in High-Contrast Digital GST Time Window (Crystal Clear Readout) */}
          <g transform="translate(75, 142)">
            {/* Beveled Aperture Frame */}
            <rect
              x="0"
              y="0"
              width="90"
              height="20"
              rx="4"
              fill="#0f172a"
              stroke="#ca8a04"
              strokeWidth="1.5"
            />
            <rect
              x="1.5"
              y="1.5"
              width="87"
              height="17"
              rx="3"
              fill="none"
              stroke="#020617"
              strokeWidth="1"
            />
            {/* Ultra-sharp digital time display */}
            <text
              x="45"
              y="14"
              textAnchor="middle"
              fontFamily="'JetBrains Mono', 'Courier New', monospace"
              fontWeight="900"
              fontSize="9.5"
              fill="#fef08a"
              letterSpacing="0.8"
            >
              {digitalTime12}
            </text>
          </g>

          {/* 8. HIGH-VISIBILITY ROLLS-ROYCE HOUR HAND */}
          <g transform={`rotate(${hourAngle} 120 120)`} filter="url(#rrHandShadow)">
            {/* Main Black/Steel Body with Gold Border */}
            <polygon
              points="120,54 114,116 120,125 126,116"
              fill="url(#rrHandBlack)"
              stroke="#d97706"
              strokeWidth="1.2"
            />
            {/* Luminous Ivory Center Strip (Easy to read day or night) */}
            <line x1="120" y1="62" x2="120" y2="114" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
            {/* Counterweight */}
            <polygon points="116,125 120,138 124,125" fill="#78350f" />
          </g>

          {/* 9. HIGH-VISIBILITY ROLLS-ROYCE MINUTE HAND */}
          <g transform={`rotate(${minuteAngle} 120 120)`} filter="url(#rrHandShadow)">
            {/* Main Black/Steel Body with Gold Border */}
            <polygon
              points="120,32 115,116 120,126 125,116"
              fill="url(#rrHandBlack)"
              stroke="#d97706"
              strokeWidth="1.2"
            />
            {/* Luminous Ivory Center Strip */}
            <line x1="120" y1="40" x2="120" y2="114" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
            {/* Counterweight */}
            <polygon points="116,126 120,142 124,126" fill="#78350f" />
          </g>

          {/* 10. HIGH-PRECISION CRIMSON SWEEPING SECOND HAND */}
          <g transform={`rotate(${secondAngle} 120 120)`} filter="url(#rrHandShadow)">
            <line x1="120" y1="24" x2="120" y2="152" stroke="#dc2626" strokeWidth="1.8" strokeLinecap="round" />
            {/* Golden Counterweight Ring */}
            <circle cx="120" cy="140" r="4" fill="#f59e0b" stroke="#78350f" strokeWidth="1" />
            {/* Arrow Tip */}
            <polygon points="120,20 117,28 123,28" fill="#dc2626" />
          </g>

          {/* 11. Center Pinion Cap (18K Gold Jewel Cap) */}
          <circle cx="120" cy="120" r="7" fill="url(#rrOuterBezel)" stroke="#301102" strokeWidth="1.5" />
          <circle cx="120" cy="120" r="3" fill="#dc2626" />
          <circle cx="118.8" cy="118.8" r="1.2" fill="#ffffff" opacity="0.95" />

          {/* 12. Domed Sapphire Crystal Glass Glare */}
          <path
            d="M 36 68 A 94 94 0 0 1 204 68 A 96 96 0 0 0 36 68 Z"
            fill="url(#rrCrystalGlare)"
            opacity={isHovered ? 0.65 : 0.35}
            className="transition-opacity duration-200"
          />
        </svg>

        {/* Drag Indicator & 1-Click Reset Control */}
        {isHovered && (
          <div className="absolute -top-3 right-0 flex items-center gap-1.5 z-30 pointer-events-auto animate-in fade-in">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setResetKey(prev => prev + 1);
              }}
              title="Reset clock position back to original slot"
              className="w-5 h-5 rounded-full bg-slate-900 text-amber-300 border border-amber-400 flex items-center justify-center shadow-md hover:bg-slate-800 transition-colors"
            >
              <RotateCcw className="w-2.5 h-2.5" />
            </button>
            <div
              title="Drag anywhere on screen!"
              className="px-2 py-0.5 rounded-full bg-slate-900 text-amber-300 border border-amber-400 text-[10px] font-mono flex items-center gap-1 shadow-md"
            >
              <Move className="w-3 h-3" />
              <span>Drag Me</span>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};
