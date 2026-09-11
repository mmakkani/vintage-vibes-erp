import React, { useState } from 'react';
import { Download, Smartphone, X, CheckCircle2 } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall.ts';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already running as an installed PWA, hide the button
  if (isInstalled) {
    return (
      <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-900/40 border border-emerald-500/30 text-emerald-300 text-xs font-mono">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
        <span>PWA Active</span>
      </div>
    );
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    return (
      <button
        id="pwa-install-btn"
        onClick={install}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-b from-amber-400 to-amber-600 hover:from-amber-300 hover:to-amber-500 active:translate-y-0.5 text-slate-950 text-xs font-bold shadow-[0_3px_0_#b45309,0_4px_8px_rgba(0,0,0,0.3)] transition-all cursor-pointer whitespace-nowrap"
        title="Install Vintage Vibe ERP as Desktop / Mobile App"
      >
        <Download className="w-3.5 h-3.5 text-slate-950" />
        <span>Install App</span>
      </button>
    );
  }

  // iOS Safari flow (beforeinstallprompt is not supported by WebKit)
  if (isIOS) {
    return (
      <>
        <button
          id="pwa-install-ios-btn"
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gradient-to-b from-amber-400 to-amber-600 text-slate-950 text-xs font-bold shadow-[0_2px_0_#b45309] hover:brightness-110 active:translate-y-0.5 cursor-pointer whitespace-nowrap"
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span>Add to Home</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
            <div className="w-full max-w-sm rounded-xl bg-slate-900 border border-amber-500/40 p-5 shadow-2xl text-slate-100">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-amber-400" />
                  <h3 className="text-sm font-bold text-amber-300">Install on iPhone / iPad</h3>
                </div>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 text-slate-400 hover:text-white rounded-md"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="mt-3 space-y-3 text-xs text-slate-300">
                <div className="flex items-start gap-2.5 bg-slate-800/80 p-2.5 rounded-lg border border-slate-700">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-slate-950 font-bold text-[11px] shrink-0">1</span>
                  <p>Tap the <strong>Share</strong> button (box with upward arrow) in the Safari toolbar.</p>
                </div>
                <div className="flex items-start gap-2.5 bg-slate-800/80 p-2.5 rounded-lg border border-slate-700">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-slate-950 font-bold text-[11px] shrink-0">2</span>
                  <p>Scroll down and tap <strong>Add to Home Screen</strong>.</p>
                </div>
                <div className="flex items-start gap-2.5 bg-slate-800/80 p-2.5 rounded-lg border border-slate-700">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-slate-950 font-bold text-[11px] shrink-0">3</span>
                  <p>Launch Vintage Vibe directly from your home screen with offline caching enabled.</p>
                </div>
              </div>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-4 w-full py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md transition"
              >
                Got It
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
