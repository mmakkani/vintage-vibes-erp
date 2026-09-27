import React, { useState, useEffect } from 'react';

interface RoyalSplashScreenProps {
  onFinish?: () => void;
  durationMs?: number;
}

export const RoyalSplashScreen: React.FC<RoyalSplashScreenProps> = ({
  onFinish,
  durationMs = 900
}) => {
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsFadingOut(true);
      setTimeout(() => {
        if (onFinish) onFinish();
      }, 300);
    }, durationMs);

    return () => clearTimeout(timer);
  }, [durationMs, onFinish]);

  const handleSkip = () => {
    setIsFadingOut(true);
    setTimeout(() => {
      if (onFinish) onFinish();
    }, 150);
  };

  return (
    <div
      onClick={handleSkip}
      className={`fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-[#07080c] transition-opacity duration-300 select-none cursor-pointer overflow-hidden ${
        isFadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
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
          {/* Authentic 3D Embossed Gold Seal Medallion with Transparent Sides */}
          <img
            src="/vintage_logo_gold_seal.png"
            alt="Vintage Vibes Royal Gold Seal"
            className="w-full h-full object-contain rounded-full drop-shadow-[0_0_35px_rgba(245,158,11,0.65)]"
          />

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
