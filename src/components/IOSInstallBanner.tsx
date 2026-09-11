import React, { useState, useEffect } from 'react';

export const IOSInstallBanner: React.FC = () => {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    // 1. Detect iOS devices (iPhone, iPad, iPod, or modern iPadOS)
    const ua = (typeof window !== 'undefined' ? window.navigator.userAgent : '').toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(ua) || 
      (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    // 2. Detect Standalone mode (already installed as PWA or Home Screen app)
    const isStandalone = typeof window !== 'undefined' && (
      (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches
    );

    // 3. Test mode via URL parameter: ?ios_install=1
    const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const forceShow = urlParams?.get('ios_install') === '1';

    // 4. Check if dismissed during current session
    const isDismissed = typeof sessionStorage !== 'undefined' && 
      sessionStorage.getItem('vintage_ios_install_dismissed') === 'true';

    if ((isIOS && !isStandalone && !isDismissed) || forceShow) {
      setShowBanner(true);
    }
  }, []);

  const handleDismiss = () => {
    setShowBanner(false);
    try {
      sessionStorage.setItem('vintage_ios_install_dismissed', 'true');
    } catch {}
  };

  if (!showBanner) {
    return null;
  }

  return (
    <aside
      aria-label="Install App Banner"
      className="fixed bottom-3 inset-x-3 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:max-w-md z-[9999] pointer-events-auto transition-all duration-300 ease-out animate-in fade-in slide-in-from-bottom-5"
    >
      <div className="relative overflow-hidden bg-slate-950/95 backdrop-blur-md border border-amber-500/50 rounded-2xl p-4 shadow-[0_12px_40px_rgba(0,0,0,0.7)] ring-1 ring-amber-400/20 text-slate-100">
        {/* Subtle decorative gold corner glow */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none -mr-10 -mt-10" />

        <div className="flex items-start gap-3 relative z-10">
          {/* App Icon */}
          <div className="relative shrink-0">
            <img
              src="/logo192.png"
              alt="Vintage Vibes Logo"
              className="w-12 h-12 rounded-xl border border-amber-500/40 shadow-md object-cover bg-slate-900 p-0.5"
              onError={(e) => {
                // Fallback to SVG seal if PNG is loading
                (e.target as HTMLImageElement).src = '/vintage_logo.svg';
              }}
            />
            <span className="absolute -bottom-1 -right-1 bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 text-[9px] font-black uppercase px-1 py-0.2 rounded shadow">
              iOS
            </span>
          </div>

          {/* Content Area */}
          <div className="flex-1 min-w-0 pr-1">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-1.5">
                <span className="font-serif font-black text-amber-300 text-xs tracking-wider uppercase">
                  Vintage Vibes
                </span>
                <span className="bg-amber-400/20 text-amber-300 text-[10px] font-bold px-1.5 py-0.5 rounded border border-amber-400/30">
                  App
                </span>
              </div>
              <button
                type="button"
                onClick={handleDismiss}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
                title="Dismiss"
                aria-label="Dismiss banner"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Exact Required Prompt Instruction */}
            <p className="text-xs text-slate-200 leading-snug font-medium">
              <strong className="text-amber-300 font-bold">Install Vintage Vibes:</strong> Tap the Share button below and select &apos;Add to Home Screen&apos;.
            </p>

            {/* Quick Illustrated Steps */}
            <div className="mt-2.5 space-y-1.5 text-[11px] text-slate-300 bg-slate-900/80 rounded-xl p-2.5 border border-slate-800">
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-4 h-4 rounded-full bg-amber-500 text-slate-950 font-black text-[9px] shrink-0">
                  1
                </span>
                <span>
                  Tap the{' '}
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-sky-500/20 text-sky-300 rounded border border-sky-500/30 font-semibold text-[10px]">
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                      <polyline points="16 6 12 2 8 6" />
                      <line x1="12" y1="2" x2="12" y2="15" />
                    </svg>
                    Share
                  </span>{' '}
                  icon in Safari
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-4 h-4 rounded-full bg-amber-500 text-slate-950 font-black text-[9px] shrink-0">
                  2
                </span>
                <span>
                  Choose{' '}
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-500/20 text-amber-300 rounded border border-amber-500/30 font-semibold text-[10px]">
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <line x1="12" y1="8" x2="12" y2="16" />
                      <line x1="8" y1="12" x2="16" y2="12" />
                    </svg>
                    Add to Home Screen
                  </span>
                </span>
              </div>
            </div>

            {/* Bouncing Pointer to Safari Toolbar */}
            <div className="flex items-center justify-center gap-1.5 mt-2.5 pt-1.5 border-t border-slate-800 text-[11px] text-amber-400 font-semibold tracking-wide">
              <span>Tap the Share icon at the bottom of Safari</span>
              <svg className="w-3.5 h-3.5 animate-bounce text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default IOSInstallBanner;
