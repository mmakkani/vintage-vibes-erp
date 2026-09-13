import React, { useState, useEffect } from 'react';
import { DeviceService } from '../services/deviceService.ts';

const DISMISSED_KEY = 'vintage_pwa_prompt_dismissed_until';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export const IOSInstallBanner: React.FC = () => {
  const [showBanner, setShowBanner] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [registeredIp, setRegisteredIp] = useState<string>('');
  const [deviceModel, setDeviceModel] = useState<string>('iPhone');

  useEffect(() => {
    // 1. Detect device & standalone mode
    const info = DeviceService.detectDeviceInfo();
    setDeviceModel(info.deviceModel);

    // 2. Auto-register device and capture IP in PostgreSQL
    DeviceService.registerDevice().then((res) => {
      if (res && res.success && res.ip) {
        setRegisteredIp(res.ip);
      }
    }).catch(() => {});

    // 3. Listen for manual trigger (e.g. from header profile button)
    const handleOpenModal = () => setShowGuideModal(true);
    window.addEventListener('open_ios_install_guide', handleOpenModal);

    // 4. Test mode via URL parameter: ?ios_install=1
    const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const forceShow = urlParams?.get('ios_install') === '1';

    // 5. Check 30-day dismissal persistence
    let isDismissed = false;
    try {
      const dismissedUntil = localStorage.getItem(DISMISSED_KEY);
      if (dismissedUntil && Number(dismissedUntil) > Date.now()) {
        isDismissed = true;
      }
    } catch {}

    // 6. Only show slim top banner if on iOS, not standalone, and not dismissed
    if ((info.isIOS && !info.isStandalone && !isDismissed) || forceShow) {
      setShowBanner(true);
    }

    return () => {
      window.removeEventListener('open_ios_install_guide', handleOpenModal);
    };
  }, []);

  const handleDismiss = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setShowBanner(false);
    setShowGuideModal(false);
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now() + THIRTY_DAYS_MS));
    } catch {}
  };

  return (
    <>
      {/* Slim, Non-Intrusive Top Banner (Never blocks bottom navigation) */}
      {showBanner && (
        <aside
          aria-label="Install App Banner"
          className="fixed top-0 inset-x-0 z-[9999] bg-slate-950/95 backdrop-blur-md border-b border-amber-500/60 px-3 py-1.5 shadow-lg text-slate-100 flex items-center justify-between gap-2 animate-in fade-in slide-in-from-top-3 duration-200"
        >
          <div className="flex items-center gap-2 min-w-0">
            <img
              src="/apple-touch-icon.png"
              alt="Vintage Vibes"
              className="w-6 h-6 rounded-md border border-amber-500/50 shrink-0 object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/vintage_logo.svg';
              }}
            />
            <div className="truncate text-xs">
              <span className="font-bold text-amber-300">Install Vintage Vibes App</span>
              <span className="hidden sm:inline text-slate-300 text-[11px] ml-1.5">• Full-screen iOS experience</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowGuideModal(true)}
              className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-md shadow transition cursor-pointer flex items-center gap-1"
            >
              <span>Install Guide</span>
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition cursor-pointer"
              title="Dismiss for 30 days"
              aria-label="Close banner"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </aside>
      )}

      {/* Clean English Step-by-Step Modal */}
      {showGuideModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="relative w-full max-w-md bg-slate-950 border border-amber-500/70 rounded-2xl p-5 sm:p-6 shadow-[0_25px_60px_rgba(0,0,0,0.9)] text-slate-100 max-h-[92vh] overflow-y-auto">
            {/* Close Button */}
            <button
              onClick={handleDismiss}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1.5 rounded-lg bg-slate-900 border border-slate-800 transition cursor-pointer"
              title="Close and dismiss"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <img
                src="/apple-touch-icon.png"
                alt="Vintage Vibes Logo"
                className="w-12 h-12 rounded-xl border border-amber-500/50 shadow-md object-cover bg-slate-900"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/vintage_logo.svg';
                }}
              />
              <div>
                <h3 className="text-base font-bold text-amber-300 tracking-wide">
                  Install iPhone App
                </h3>
                <p className="text-xs text-slate-400">
                  Run Vintage Vibes ERP in standalone full-screen mode
                </p>
              </div>
            </div>

            {/* Info Note */}
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 mb-4 text-xs text-amber-200/90 leading-relaxed">
              <strong className="text-amber-300">Apple iOS Policy: </strong>
              iPhones install web applications directly through Safari without downloading external APK files. Adding to your Home Screen provides a native full-screen experience.
            </div>

            {/* 3 Step Guide */}
            <div className="space-y-3">
              {/* Step 1 */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-amber-500 text-slate-950 font-black flex items-center justify-center text-xs shrink-0 shadow">
                  1
                </div>
                <div className="flex-1 text-xs">
                  <div className="font-bold text-amber-300 mb-0.5">
                    Tap Safari Share Button
                  </div>
                  <p className="text-slate-300 leading-normal">
                    At the bottom of your Safari screen, tap the blue Share icon{' '}
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.2 bg-sky-500/20 text-sky-300 rounded border border-sky-500/30 font-bold text-[11px]">
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                        <polyline points="16 6 12 2 8 6" />
                        <line x1="12" y1="2" x2="12" y2="15" />
                      </svg>
                      Share [↑]
                    </span>.
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-amber-500 text-slate-950 font-black flex items-center justify-center text-xs shrink-0 shadow">
                  2
                </div>
                <div className="flex-1 text-xs">
                  <div className="font-bold text-amber-300 mb-0.5">
                    Select &apos;Add to Home Screen&apos;
                  </div>
                  <p className="text-slate-300 leading-normal">
                    Scroll down the action list and select{' '}
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.2 bg-amber-500/20 text-amber-300 rounded border border-amber-500/30 font-bold text-[11px]">
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <line x1="12" y1="8" x2="12" y2="16" />
                        <line x1="8" y1="12" x2="16" y2="12" />
                      </svg>
                      Add to Home Screen
                    </span>.
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-amber-500 text-slate-950 font-black flex items-center justify-center text-xs shrink-0 shadow">
                  3
                </div>
                <div className="flex-1 text-xs">
                  <div className="font-bold text-amber-300 mb-0.5">
                    Tap &apos;Add&apos; in Top-Right Corner
                  </div>
                  <p className="text-slate-300 leading-normal">
                    Tap the blue <strong className="text-white">&apos;Add&apos;</strong> button in the top right. The app will immediately install to your home screen!
                  </p>
                </div>
              </div>
            </div>

            {/* SQL Telemetry Info */}
            <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
              <div>
                <span>Device: </span>
                <strong className="text-slate-200">{deviceModel}</strong>
              </div>
              {registeredIp && (
                <div>
                  <span>IP: </span>
                  <strong className="text-emerald-400 font-mono">{registeredIp}</strong>
                </div>
              )}
              <div className="flex items-center gap-1 text-emerald-400 font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>SQL Connected</span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="mt-4">
              <button
                type="button"
                onClick={handleDismiss}
                className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs py-2.5 rounded-xl transition cursor-pointer shadow"
              >
                Got It (Dismiss for 30 Days)
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default IOSInstallBanner;
