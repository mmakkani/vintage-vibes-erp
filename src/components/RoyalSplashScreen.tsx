import React, { useState, useEffect } from 'react';

interface RoyalSplashScreenProps {
  onFinish?: () => void;
  durationMs?: number;
}

export const RoyalSplashScreen: React.FC<RoyalSplashScreenProps> = ({
  onFinish,
  durationMs = 1900
}) => {
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsFadingOut(true);
      setTimeout(() => {
        if (onFinish) onFinish();
      }, 400);
    }, durationMs);

    return () => clearTimeout(timer);
  }, [durationMs, onFinish]);

  const handleSkip = () => {
    setIsFadingOut(true);
    setTimeout(() => {
      if (onFinish) onFinish();
    }, 200);
  };

  return (
    <div
      onClick={handleSkip}
      className={`fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-[#07080c] transition-all duration-400 select-none cursor-pointer overflow-hidden ${
        isFadingOut ? 'opacity-0 scale-105 pointer-events-none' : 'opacity-100 scale-100'
      }`}
    >
      {/* Radial Gold Ambient Core Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(217,119,6,0.22)_0%,transparent_65%)] pointer-events-none" />

      {/* Floating Gold Stardust Particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {[...Array(16)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-gradient-to-tr from-amber-500 to-yellow-200"
            style={{
              width: `${(i % 3) + 2}px`,
              height: `${(i % 3) + 2}px`,
              top: `${15 + (i * 5) % 70}%`,
              left: `${10 + (i * 7) % 80}%`,
              opacity: 0.65,
              animation: `vv-stardust ${2 + (i % 3) * 0.8}s ease-in-out infinite`,
              animationDelay: `${(i * 0.2)}s`
            }}
          />
        ))}
      </div>

      {/* Central 3D Emblem with Glow & Diagonal Light Sweep */}
      <div className="relative z-10 flex flex-col items-center">
        <div
          className="relative w-40 h-40 sm:w-48 sm:h-48 flex items-center justify-center"
          style={{ animation: 'vv-zoom-pulse 1.6s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}
        >
          {/* Exact 3D Gold Vector Seal */}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" className="w-full h-full drop-shadow-[0_0_35px_rgba(245,158,11,0.65)]">
            <defs>
              <radialGradient id="outerBevelSplash" cx="40%" cy="35%" r="65%">
                <stop offset="0%" stopColor="#fff5cc" />
                <stop offset="25%" stopColor="#dfb15b" />
                <stop offset="50%" stopColor="#9a6e18" />
                <stop offset="75%" stopColor="#d4af37" />
                <stop offset="100%" stopColor="#4a3508" />
              </radialGradient>
              <linearGradient id="goldLinearSplash" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#fcedb3" />
                <stop offset="30%" stopColor="#d4af37" />
                <stop offset="60%" stopColor="#aa7c11" />
                <stop offset="85%" stopColor="#fdf3cd" />
                <stop offset="100%" stopColor="#8b6508" />
              </linearGradient>
              <linearGradient id="silverLinearSplash" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="40%" stopColor="#d1d5db" />
                <stop offset="70%" stopColor="#9ca3af" />
                <stop offset="100%" stopColor="#4b5563" />
              </linearGradient>
              <radialGradient id="globeSphereSplash" cx="35%" cy="30%" r="70%">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="45%" stopColor="#e5e7eb" />
                <stop offset="80%" stopColor="#cbd5e1" />
                <stop offset="100%" stopColor="#94a3b8" />
              </radialGradient>
              <filter id="emboss3dSplash" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="2" dy="3" stdDeviation="2" floodColor="#3b2b06" floodOpacity="0.8" />
                <feDropShadow dx="-1" dy="-1" stdDeviation="1" floodColor="#fff5d9" floodOpacity="0.9" />
              </filter>
            </defs>
            <circle cx="250" cy="250" r="242" fill="url(#outerBevelSplash)" stroke="#3d2a07" strokeWidth="4" />
            <circle cx="250" cy="250" r="236" fill="none" stroke="#ffe89e" strokeWidth="2" />
            <circle cx="250" cy="250" r="226" fill="none" stroke="#684a0c" strokeWidth="3" />
            <circle cx="250" cy="250" r="220" fill="#faf7ee" stroke="#b38927" strokeWidth="3" />
            <path id="textArcTopSplash" d="M 58 250 A 192 192 0 1 1 442 250" fill="none" />
            <path id="textArcBottomSplash" d="M 442 250 A 192 192 0 1 1 58 250" fill="none" />
            <text fontFamily="'Times New Roman', 'Cinzel', Georgia, serif" fontWeight="900" fontSize="34" fill="url(#goldLinearSplash)" filter="url(#emboss3dSplash)" letterSpacing="9">
              <textPath href="#textArcTopSplash" startOffset="50%" textAnchor="middle">VINTAGE VIBES</textPath>
            </text>
            <text fontFamily="'Times New Roman', 'Cinzel', serif" fontWeight="800" fontSize="18" fill="url(#goldLinearSplash)" filter="url(#emboss3dSplash)" letterSpacing="4">
              <textPath href="#textArcBottomSplash" startOffset="50%" textAnchor="middle">GENERAL TRADING - L.L.C - S.P.C</textPath>
            </text>
            <circle cx="250" cy="250" r="148" fill="url(#silverLinearSplash)" stroke="#4b5563" strokeWidth="4" />
            <circle cx="250" cy="250" r="142" fill="none" stroke="#ffffff" strokeWidth="2" />
            <circle cx="250" cy="250" r="136" fill="#1b2430" stroke="#9ca3af" strokeWidth="3" />
            <g id="globeCenterSplash">
              <circle cx="250" cy="250" r="132" fill="url(#globeSphereSplash)" />
              <ellipse cx="250" cy="250" rx="132" ry="132" fill="none" stroke="#94a3b8" strokeWidth="2.5" />
              <ellipse cx="250" cy="250" rx="95" ry="132" fill="none" stroke="#64748b" strokeWidth="2.5" />
              <ellipse cx="250" cy="250" rx="50" ry="132" fill="none" stroke="#64748b" strokeWidth="2.5" />
              <line x1="250" y1="118" x2="250" y2="382" stroke="#475569" strokeWidth="3.5" />
              <line x1="118" y1="250" x2="382" y2="250" stroke="#475569" strokeWidth="3.5" />
              <path d="M 148 185 Q 250 215 352 185" fill="none" stroke="#64748b" strokeWidth="2.5" />
              <path d="M 148 315 Q 250 285 352 315" fill="none" stroke="#64748b" strokeWidth="2.5" />
            </g>
            <circle cx="250" cy="250" r="95" fill="none" stroke="url(#goldLinearSplash)" strokeWidth="12" filter="url(#emboss3dSplash)" />
            <circle cx="250" cy="250" r="95" fill="none" stroke="#fffae6" strokeWidth="2" />
            <g id="vvMonogramSplash" filter="url(#emboss3dSplash)">
              <path d="M 152 216 L 218 216 L 250 318 L 282 216 L 348 216 L 272 352 L 228 352 Z" fill="url(#goldLinearSplash)" stroke="#593f05" strokeWidth="2" />
              <path d="M 184 228 L 226 228 L 250 298 L 274 228 L 316 228 L 264 324 L 236 324 Z" fill="url(#goldLinearSplash)" stroke="#ffe58f" strokeWidth="1.5" />
            </g>
          </svg>

          {/* Diagonal Liquid Gold Specular Sweep Beam */}
          <div className="absolute inset-0 overflow-hidden rounded-full pointer-events-none">
            <div
              className="w-full h-full bg-gradient-to-r from-transparent via-amber-100/65 to-transparent"
              style={{
                animation: 'vv-shimmer-sweep 2.2s ease-in-out infinite',
                animationDelay: '0.4s'
              }}
            />
          </div>
        </div>

        {/* Brand Typography Reveal */}
        <div className="mt-7 text-center space-y-2 z-20">
          <h1
            className="text-lg sm:text-xl font-black text-amber-300 uppercase tracking-[0.35em]"
            style={{
              fontFamily: "'Cinzel', serif",
              animation: 'vv-text-fade 1.1s cubic-bezier(0.16, 1, 0.3, 1) 0.4s both'
            }}
          >
            VINTAGE VIBES
          </h1>

          <div className="w-20 h-px bg-gradient-to-r from-transparent via-amber-400 to-transparent mx-auto opacity-70" />

          <p
            className="text-[10px] sm:text-[11px] font-bold text-amber-200/75 uppercase tracking-[0.25em]"
            style={{
              fontFamily: "'Cinzel', serif",
              animation: 'vv-subtext-fade 1.1s ease-out 0.7s both'
            }}
          >
            HAUTE ARCHIVE • DUBAI
          </p>
        </div>

        {/* Subtle Laser Loader at Bottom */}
        <div className="mt-8 w-36 h-0.5 bg-stone-900 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-amber-600 via-amber-300 to-amber-500 rounded-full"
            style={{ animation: 'vv-laser 1.8s ease-in-out infinite' }}
          />
        </div>
      </div>

      <style>{`
        @keyframes vv-zoom-pulse {
          0% { transform: scale(0.65); opacity: 0; filter: drop-shadow(0 0 0 rgba(217, 119, 6, 0)); }
          40% { transform: scale(1.05); opacity: 1; filter: drop-shadow(0 0 35px rgba(245, 158, 11, 0.7)); }
          60% { transform: scale(0.98); opacity: 1; filter: drop-shadow(0 0 25px rgba(217, 119, 6, 0.5)); }
          100% { transform: scale(1); opacity: 1; filter: drop-shadow(0 0 30px rgba(245, 158, 11, 0.6)); }
        }
        @keyframes vv-shimmer-sweep {
          0% { transform: translateX(-150%) translateY(-150%) rotate(45deg); opacity: 0; }
          20% { opacity: 0.85; }
          80% { opacity: 0.85; }
          100% { transform: translateX(250%) translateY(250%) rotate(45deg); opacity: 0; }
        }
        @keyframes vv-text-fade {
          0% { opacity: 0; transform: translateY(12px); letter-spacing: 0.15em; }
          100% { opacity: 1; transform: translateY(0); letter-spacing: 0.35em; }
        }
        @keyframes vv-subtext-fade {
          0% { opacity: 0; transform: translateY(8px); }
          100% { opacity: 0.75; transform: translateY(0); }
        }
        @keyframes vv-stardust {
          0% { transform: translateY(0) translateX(0); opacity: 0; }
          50% { opacity: 0.75; }
          100% { transform: translateY(-130px) translateX(20px); opacity: 0; }
        }
        @keyframes vv-laser {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
};
