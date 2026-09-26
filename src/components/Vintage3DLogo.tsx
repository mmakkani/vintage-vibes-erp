import React, { useState, useRef, useEffect } from 'react';

export interface Vintage3DLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'custom';
  interactive?: boolean;
  className?: string;
  spinSpeed?: 'normal' | 'slow' | 'fast';
  showOuterOrbit?: boolean;
}

export const Vintage3DLogo: React.FC<Vintage3DLogoProps> = ({
  size = 'lg',
  interactive = true,
  className = '',
  spinSpeed = 'normal',
  showOuterOrbit = true
}) => {
  const [rotateX, setRotateX] = useState(0);
  const [rotateY, setRotateY] = useState(0);
  const [glintPos, setGlintPos] = useState({ x: 50, y: 50 });
  const [isHovered, setIsHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Standard predefined dimension classes
  const sizeDimensions = {
    sm: 'w-12 h-12',
    md: 'w-16 h-16',
    lg: 'w-24 h-24',
    xl: 'w-32 h-32',
    '2xl': 'w-44 h-44',
    custom: ''
  }[size];

  // Dynamic speeds: When cursor hovers, rotation accelerates dynamically ("cursor lay jayen to fasht guhmay")
  const baseVSpinDuration = spinSpeed === 'slow' ? 14 : spinSpeed === 'fast' ? 7 : 10;
  const vSpinDuration = isHovered ? '1.8s' : `${baseVSpinDuration}s`;

  const baseOrbitDuration = spinSpeed === 'slow' ? 26 : spinSpeed === 'fast' ? 14 : 20;
  const orbitDuration = isHovered ? '4s' : `${baseOrbitDuration}s`;
  const counterOrbitDuration = isHovered ? '6s' : '26s';

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!interactive || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    // Realistic 3D tilt angles (up to +/-22 deg)
    const limit = 22;
    const normX = (x - centerX) / centerX;
    const normY = (y - centerY) / centerY;

    setRotateX(-Math.max(-limit, Math.min(limit, normY * limit)));
    setRotateY(Math.max(-limit, Math.min(limit, normX * limit)));

    // Specular flare coordinates in percentage
    setGlintPos({
      x: Math.round((x / rect.width) * 100),
      y: Math.round((y / rect.height) * 100)
    });
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setRotateX(0);
    setRotateY(0);
    setGlintPos({ x: 50, y: 50 });
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      className={`relative select-none cursor-pointer flex-shrink-0 perspective-[1200px] ${sizeDimensions} ${className}`}
      title="Vintage Vibes General Trading L.L.C - S.P.C (Official 3D Animated Seal)"
      style={{
        perspective: '1200px',
        WebkitPerspective: '1200px'
      }}
    >
      {/* =====================================================================
          3D Multi-Layer Gyroscopic Medal Container with Interactive Mouse Tilt
          ===================================================================== */}
      <div
        className="w-full h-full relative transition-transform duration-200 ease-out"
        style={{
          transformStyle: 'preserve-3d',
          WebkitTransformStyle: 'preserve-3d',
          transform: `rotateX(${rotateX}deg) rotateY(${rotateY}deg) ${isHovered ? 'scale(1.08)' : 'scale(1)'}`,
          transition: isHovered
            ? 'transform 0.1s cubic-bezier(0.2, 0, 0.2, 1)'
            : 'transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)'
        }}
      >
        {/* Ambient Radial Golden Aura Halo */}
        <div
          className="absolute -inset-3 rounded-full bg-gradient-to-tr from-amber-500/40 via-yellow-400/35 to-amber-600/40 blur-xl -z-10 pointer-events-none transition-all duration-300"
          style={{
            transform: 'translateZ(-12px)',
            opacity: isHovered ? 0.95 : 0.5,
            transformOrigin: 'center center'
          }}
        />

        {/* =====================================================================
            LAYER 1: "BAHIR KI CIRCLE MOVMENT" - Outer Celestial Orbital Rings
            Dotted gold orbital ring with glowing orbital nodes & stars
            ===================================================================== */}
        {showOuterOrbit && (
          <>
            {/* Primary Clockwise Celestial Orbit (Active only on hover for 0% idle GPU) */}
            <div
              className="absolute -inset-2.5 rounded-full pointer-events-none"
              style={{
                transformStyle: 'preserve-3d',
                transform: 'translateZ(-4px)',
                animation: isHovered ? `orbitSpinClockwise ${orbitDuration} linear infinite` : 'none',
                transition: 'animation-duration 0.4s ease'
              }}
            >
              <svg viewBox="0 0 540 540" className="w-full h-full">
                <defs>
                  <linearGradient id="orbitalGold" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#fef08a" stopOpacity="0.95" />
                    <stop offset="30%" stopColor="#f59e0b" stopOpacity="0.8" />
                    <stop offset="70%" stopColor="#b45309" stopOpacity="0.85" />
                    <stop offset="100%" stopColor="#fbbf24" stopOpacity="0.95" />
                  </linearGradient>
                </defs>
                {/* Outer Dashed Golden Trajectory */}
                <circle
                  cx="270"
                  cy="270"
                  r="262"
                  fill="none"
                  stroke="url(#orbitalGold)"
                  strokeWidth="2.8"
                  strokeDasharray="8 14"
                  strokeLinecap="round"
                  className="opacity-85"
                />
                {/* 4 Cardinal Golden Star Nodes */}
                <circle cx="270" cy="8" r="5" fill="#fef08a" stroke="#78350f" strokeWidth="1.5" />
                <circle cx="270" cy="532" r="5" fill="#fef08a" stroke="#78350f" strokeWidth="1.5" />
                <circle cx="8" cy="270" r="5" fill="#fef08a" stroke="#78350f" strokeWidth="1.5" />
                <circle cx="532" cy="270" r="5" fill="#fef08a" stroke="#78350f" strokeWidth="1.5" />
                {/* 4 Diagonal Micro Sparkles */}
                <circle cx="85" cy="85" r="3" fill="#fef08a" opacity="0.9" />
                <circle cx="455" cy="85" r="3" fill="#fef08a" opacity="0.9" />
                <circle cx="85" cy="455" r="3" fill="#fef08a" opacity="0.9" />
                <circle cx="455" cy="455" r="3" fill="#fef08a" opacity="0.9" />
              </svg>
            </div>

            {/* Secondary Counter-Rotating Orbital Ring (Active only on hover for 0% idle GPU) */}
            <div
              className="absolute -inset-1 rounded-full pointer-events-none"
              style={{
                transformStyle: 'preserve-3d',
                transform: 'translateZ(-1px)',
                animation: isHovered ? `orbitSpinCounter ${counterOrbitDuration} linear infinite` : 'none',
                transition: 'animation-duration 0.4s ease'
              }}
            >
              <svg viewBox="0 0 520 520" className="w-full h-full">
                <circle
                  cx="260"
                  cy="260"
                  r="254"
                  fill="none"
                  stroke="#d97706"
                  strokeWidth="1.6"
                  strokeDasharray="3 11"
                  opacity="0.65"
                />
              </svg>
            </div>
          </>
        )}

        {/* =====================================================================
            LAYER 2: AUTHENTIC PHOTOREALISTIC OUTER MEDAL DIAL (translateZ: 6px)
            Ornate sculpted bronze/gold rim, cream enamel dial with embossed
            "VINTAGE VIBES", 6 flanking stars, "GENERAL TRADING-L.L.C-S.P.C",
            and inner silver beaded bezel.
            ===================================================================== */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none drop-shadow-[0_12px_26px_rgba(0,0,0,0.55)]"
          style={{
            transformStyle: 'preserve-3d',
            transform: 'translateZ(6px)'
          }}
        >
          {/* Photorealistic Outer Dial Texture from Uploaded Image */}
          <img
            src="/vintage_outer_dial_3d.png"
            alt="Vintage Vibes Official Medal"
            className="w-full h-full object-contain select-none pointer-events-none rounded-full"
            loading="eager"
            onError={(e) => {
              // Graceful fallback to full medal image if dial cutout is unavailable
              const target = e.currentTarget;
              if (target.src.indexOf('vintage_medal_3d.png') === -1) {
                target.src = '/vintage_medal_3d.png';
              }
            }}
          />
        </div>

        {/* =====================================================================
            LAYER 3: SILVER ARMILLARY GLOBE SPHERE (translateZ: 14px)
            Sits in the central aperture of the outer dial. Features curved
            parallels and meridians in brilliant platinum / silver relief.
            ===================================================================== */}
        <div
          className="absolute inset-[20%] rounded-full pointer-events-none flex items-center justify-center"
          style={{
            transformStyle: 'preserve-3d',
            transform: 'translateZ(14px)'
          }}
        >
          <svg viewBox="0 0 280 280" className="w-full h-full drop-shadow-[0_4px_12px_rgba(0,0,0,0.4)]">
            <defs>
              {/* Platinum Silver Globe Sphere Gradient */}
              <radialGradient id="globeSilverRadial" cx="35%" cy="30%" r="70%">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="35%" stopColor="#f1f5f9" />
                <stop offset="70%" stopColor="#cbd5e1" />
                <stop offset="95%" stopColor="#94a3b8" />
                <stop offset="100%" stopColor="#64748b" />
              </radialGradient>
              <filter id="silverDrop" x="-15%" y="-15%" width="130%" height="130%">
                <feDropShadow dx="1" dy="2" stdDeviation="1" floodColor="#1e293b" floodOpacity="0.4" />
              </filter>
            </defs>

            {/* Globe Sphere Base */}
            <circle cx="140" cy="140" r="136" fill="url(#globeSilverRadial)" stroke="#64748b" strokeWidth="3" />

            {/* Latitude Parallels */}
            <line x1="6" y1="140" x2="274" y2="140" stroke="#475569" strokeWidth="3" filter="url(#silverDrop)" />
            <path d="M 28 85 Q 140 120 252 85" fill="none" stroke="#64748b" strokeWidth="2.6" filter="url(#silverDrop)" />
            <path d="M 28 195 Q 140 160 252 195" fill="none" stroke="#64748b" strokeWidth="2.6" filter="url(#silverDrop)" />
            <path d="M 65 42 Q 140 70 215 42" fill="none" stroke="#94a3b8" strokeWidth="2" />
            <path d="M 65 238 Q 140 210 215 238" fill="none" stroke="#94a3b8" strokeWidth="2" />

            {/* Longitude Meridians */}
            <line x1="140" y1="6" x2="140" y2="274" stroke="#475569" strokeWidth="3" filter="url(#silverDrop)" />
            <ellipse cx="140" cy="140" rx="105" ry="136" fill="none" stroke="#64748b" strokeWidth="2.6" filter="url(#silverDrop)" />
            <ellipse cx="140" cy="140" rx="60" ry="136" fill="none" stroke="#64748b" strokeWidth="2.6" filter="url(#silverDrop)" />
            <ellipse cx="140" cy="140" rx="20" ry="136" fill="none" stroke="#94a3b8" strokeWidth="2" />
          </svg>
        </div>

        {/* =====================================================================
            LAYER 4: "BEECH KA V KA MOVMENT" - 3D Central Golden V Monogram
            Floats on an elevated plane (translateZ: 28px).
            Performs continuous 3D Y-axis rotation with dynamic acceleration
            on cursor hover ("cursor lay jayen to fasht guhmay").
            Dual-sided solid gold rendering with cast-metal depth.
            ===================================================================== */}
        <div
          className="absolute inset-[26%] rounded-full pointer-events-none flex items-center justify-center"
          style={{
            transformStyle: 'preserve-3d',
            transform: 'translateZ(28px)'
          }}
        >
          {/* Rotating Container for the Golden V Emblem */}
          <div
            className="w-full h-full relative"
            style={{
              transformStyle: 'preserve-3d',
              WebkitTransformStyle: 'preserve-3d',
              animation: isHovered ? `vSpin3D ${vSpinDuration} linear infinite` : 'none',
              transition: 'animation-duration 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)'
            }}
          >
            {/* Front Face: High-Resolution Isolated Gold V & Ring */}
            <div
              className="absolute inset-0 w-full h-full flex items-center justify-center drop-shadow-[0_8px_18px_rgba(0,0,0,0.65)]"
              style={{
                transformStyle: 'preserve-3d',
                transform: 'translateZ(2px)',
                backfaceVisibility: 'visible',
                WebkitBackfaceVisibility: 'visible'
              }}
            >
              <img
                src="/vintage_v_isolated_gold.png"
                alt="Vintage Vibes Golden V"
                className="w-full h-full object-contain select-none pointer-events-none"
                loading="eager"
                onError={(e) => {
                  // Fallback to central V image
                  const target = e.currentTarget;
                  if (target.src.indexOf('vintage_central_v_3d.png') === -1) {
                    target.src = '/vintage_central_v_3d.png';
                  }
                }}
              />
            </div>

            {/* Back Face: Solid Polished Gold Monogram (when emblem turns past 90 deg) */}
            <div
              className="absolute inset-0 w-full h-full flex items-center justify-center drop-shadow-[0_8px_18px_rgba(0,0,0,0.65)]"
              style={{
                transformStyle: 'preserve-3d',
                transform: 'rotateY(180deg) translateZ(2px)',
                backfaceVisibility: 'visible',
                WebkitBackfaceVisibility: 'visible',
                filter: 'brightness(0.95) contrast(1.1)'
              }}
            >
              <img
                src="/vintage_v_isolated_gold.png"
                alt="Vintage Vibes Golden V Back"
                className="w-full h-full object-contain select-none pointer-events-none"
                loading="eager"
              />
            </div>

            {/* Gold Edge Extrusion Rim (Gives physical 3D coin thickness) */}
            <div
              className="absolute inset-0 w-full h-full rounded-full border-2 border-amber-800/60 pointer-events-none opacity-80"
              style={{
                transform: 'translateZ(-1px)'
              }}
            />
          </div>
        </div>

        {/* =====================================================================
            LAYER 5: DYNAMIC SPECULAR LENS REFLECTION & HOLOGRAPHIC LIGHT GLEAM
            Sweeps dynamically across the medal face following the mouse cursor
            ===================================================================== */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none transition-opacity duration-300"
          style={{
            transform: 'translateZ(40px)',
            opacity: isHovered ? 0.85 : 0.3,
            background: `radial-gradient(circle at ${glintPos.x}% ${glintPos.y}%, rgba(255,255,255,0.7) 0%, rgba(255,245,210,0.25) 30%, rgba(255,255,255,0) 65%)`
          }}
        />

        {/* Corner Sparkle Accents on Hover */}
        {isHovered && (
          <>
            <div
              className="absolute top-2 left-3 w-3 h-3 pointer-events-none animate-ping opacity-90"
              style={{ transform: 'translateZ(44px)' }}
            >
              <svg viewBox="0 0 24 24" fill="#ffffff" className="w-full h-full drop-shadow-[0_0_8px_#fef08a]">
                <polygon points="12,0 15,9 24,12 15,15 12,24 9,15 0,12 9,9" />
              </svg>
            </div>
            <div
              className="absolute bottom-3 right-4 w-2.5 h-2.5 pointer-events-none animate-pulse opacity-85"
              style={{ transform: 'translateZ(44px)' }}
            >
              <svg viewBox="0 0 24 24" fill="#fef08a" className="w-full h-full drop-shadow-[0_0_6px_#f59e0b]">
                <polygon points="12,0 15,9 24,12 15,15 12,24 9,15 0,12 9,9" />
              </svg>
            </div>
          </>
        )}
      </div>

      {/* =====================================================================
          EMBEDDED HARDWARE-ACCELERATED CSS 3D ANIMATIONS
          ===================================================================== */}
      <style>{`
        /* Central Golden V 3D Continuous Rotation */
        @keyframes vSpin3D {
          0% {
            transform: rotateY(0deg);
          }
          100% {
            transform: rotateY(360deg);
          }
        }

        /* Outer Orbit Clockwise Celestial Rotation */
        @keyframes orbitSpinClockwise {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }

        /* Counter Orbital Secondary Ring */
        @keyframes orbitSpinCounter {
          0% {
            transform: rotate(360deg);
          }
          100% {
            transform: rotate(0deg);
          }
        }
      `}</style>
    </div>
  );
};
