import React, { useState } from 'react';
import { luxuryAudio } from '../utils/luxuryAudio.ts';

interface GoldWaxSeal3DProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  onClick?: () => void;
}

export const GoldWaxSeal3D: React.FC<GoldWaxSeal3DProps> = ({
  size = 'md',
  className = '',
  onClick
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const dimensions = {
    sm: 'w-14 h-14',
    md: 'w-20 h-20 sm:w-22 sm:h-22',
    lg: 'w-28 h-28'
  }[size];

  return (
    <div
      onMouseEnter={() => {
        setIsHovered(true);
        luxuryAudio.playGoldChime();
      }}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => {
        luxuryAudio.playMechanicalClick();
        onClick?.();
      }}
      className={`relative select-none cursor-pointer flex-shrink-0 group ${dimensions} ${className}`}
      title="Vintage Vibes Official 3D Royal Gold Wax Seal • Dubai Certified"
    >
      <div
        className="w-full h-full relative transition-transform duration-200 ease-out"
        style={{
          transform: isHovered ? 'scale(1.1) translateY(-2px)' : 'scale(1) translateY(0)'
        }}
      >
        {/* Ambient Gold Glow */}
        <div
          className="absolute -inset-1.5 rounded-full bg-gradient-to-tr from-amber-500/50 via-yellow-400/40 to-amber-600/50 blur-md pointer-events-none transition-opacity duration-300"
          style={{ opacity: isHovered ? 0.95 : 0.5 }}
        />

        {/* 3D Wax Seal SVG */}
        <svg
          viewBox="0 0 200 200"
          className="w-full h-full drop-shadow-[0_8px_18px_rgba(0,0,0,0.55)]"
        >
          <defs>
            {/* Rich 24K Melted Sealing Gold Wax Radial Gradient */}
            <radialGradient id="waxGoldBase" cx="35%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#fff8db" />
              <stop offset="22%" stopColor="#f59e0b" />
              <stop offset="55%" stopColor="#b45309" />
              <stop offset="85%" stopColor="#78350f" />
              <stop offset="100%" stopColor="#3d1402" />
            </radialGradient>

            {/* Embossed Typography Gradient */}
            <linearGradient id="waxEmbossedGold" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="35%" stopColor="#fef08a" />
              <stop offset="70%" stopColor="#d97706" />
              <stop offset="100%" stopColor="#78350f" />
            </linearGradient>

            {/* Deep Wax Stamp Bevel Filter */}
            <filter id="waxStampFilter" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="1.5" dy="2.5" stdDeviation="1" floodColor="#2a0d01" floodOpacity="0.85" />
              <feDropShadow dx="-1" dy="-1" stdDeviation="0.6" floodColor="#ffffff" floodOpacity="0.8" />
            </filter>

            {/* Arch paths for circular seal typography */}
            <path id="sealTopArc" d="M 30 100 A 70 70 0 1 1 170 100" fill="none" />
            <path id="sealBottomArc" d="M 170 100 A 70 70 0 1 1 30 100" fill="none" />
          </defs>

          {/* 1. Scalloped Organic Wax Seal Edge (Authentic Melted Wax Edge) */}
          <path
            d="M 100 6 C 114 4, 128 10, 138 18 C 148 26, 156 36, 166 46 C 176 56, 186 66, 192 78 C 198 90, 198 106, 194 120 C 190 134, 182 146, 172 156 C 162 166, 150 176, 138 184 C 126 192, 112 196, 98 196 C 84 196, 70 192, 58 184 C 46 176, 36 166, 26 156 C 16 146, 10 132, 6 118 C 2 104, 4 88, 10 76 C 16 64, 26 52, 36 42 C 46 32, 58 22, 70 14 C 82 6, 90 6, 100 6 Z"
            fill="url(#waxGoldBase)"
            stroke="#260c02"
            strokeWidth="2.5"
          />

          {/* 2. Concentric Beaded / Chiseled Rings */}
          <circle cx="100" cy="100" r="82" fill="none" stroke="#fff7d6" strokeWidth="1.5" opacity="0.9" />
          <circle cx="100" cy="100" r="76" fill="none" stroke="#451a03" strokeWidth="2.5" />
          <circle cx="100" cy="100" r="54" fill="none" stroke="#fef08a" strokeWidth="1.8" />
          <circle cx="100" cy="100" r="50" fill="none" stroke="#78350f" strokeWidth="2" />

          {/* 3. Circular Embossed Typography: "OFFICIAL SEAL • VINTAGE VIBES" */}
          <text
            fontFamily="'Cinzel', 'Playfair Display', Georgia, serif"
            fontWeight="900"
            fontSize="11.5"
            fill="url(#waxEmbossedGold)"
            filter="url(#waxStampFilter)"
            letterSpacing="2.8"
          >
            <textPath href="#sealTopArc" startOffset="50%" textAnchor="middle">
              VINTAGE VIBES
            </textPath>
          </text>

          <text
            fontFamily="'Cinzel', 'Playfair Display', Georgia, serif"
            fontWeight="800"
            fontSize="8.5"
            fill="url(#waxEmbossedGold)"
            filter="url(#waxStampFilter)"
            letterSpacing="2.2"
          >
            <textPath href="#sealBottomArc" startOffset="50%" textAnchor="middle">
              DUBAI • CERTIFIED SEAL
            </textPath>
          </text>

          {/* 4. Center Monogram & Royal Stars */}
          <g filter="url(#waxStampFilter)" transform="translate(100, 100)">
            {/* Center Crown */}
            <polygon
              points="-18,-14 -12,-6 0,-18 12,-6 18,-14 14,2 -14,2"
              fill="url(#waxEmbossedGold)"
              stroke="#592404"
              strokeWidth="0.8"
            />
            {/* Golden Monogram "VV" */}
            <text
              y="16"
              textAnchor="middle"
              fontFamily="'Cinzel', Georgia, serif"
              fontWeight="900"
              fontSize="20"
              fill="url(#waxEmbossedGold)"
              letterSpacing="1"
            >
              VV
            </text>
          </g>

          {/* 5. Specular Holographic Glint Bar */}
          <path
            d="M 30 50 Q 100 20 170 50 Q 100 65 30 50 Z"
            fill="#ffffff"
            opacity={isHovered ? 0.6 : 0.25}
            className="transition-opacity duration-300"
          />
        </svg>
      </div>
    </div>
  );
};
