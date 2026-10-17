import React, { useState, useEffect } from 'react';
import { DeviceService } from '../services/deviceService.ts';
import { usePWAInstall } from '../hooks/usePWAInstall.ts';

const DISMISSED_KEY = 'vintage_pwa_prompt_dismissed_until';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export const IOSInstallBanner: React.FC = () => {
  const { isInstallable, isInstalled: pwaInstalled, install } = usePWAInstall();
  const [showBanner, setShowBanner] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [registeredIp, setRegisteredIp] = useState<string>('');
  const [deviceModel, setDeviceModel] = useState<string>('Device');
  const [isIOSDevice, setIsIOSDevice] = useState(false);
  const [profileDownloaded, setProfileDownloaded] = useState(false);

  useEffect(() => {
    // 1. Detect device & standalone mode
    const info = DeviceService.detectDeviceInfo();
    setDeviceModel(info.deviceModel);
    setIsIOSDevice(info.isIOS);

    // 2. Auto-register device and capture IP in PostgreSQL
    DeviceService.registerDevice().then((res) => {
      if (res && res.success && res.ip) {
        setRegisteredIp(res.ip);
      }
    }).catch(() => {});

    // 3. Listen for manual trigger (e.g. from header profile button)
    const handleOpenModal = () => setShowGuideModal(true);
    window.addEventListener('open_ios_install_guide', handleOpenModal);

    return () => {
      window.removeEventListener('open_ios_install_guide', handleOpenModal);
    };
  }, []);

  useEffect(() => {
    // Test mode via URL parameter: ?ios_install=1 or ?pwa_install=1
    const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const forceShow = urlParams?.get('ios_install') === '1' || urlParams?.get('pwa_install') === '1';

    let isDismissed = false;
    try {
      const dismissedUntil = localStorage.getItem(DISMISSED_KEY);
      if (dismissedUntil && Number(dismissedUntil) > Date.now()) {
        isDismissed = true;
      }
    } catch {}

    const isStandalone = typeof window !== 'undefined' && (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true ||
      pwaInstalled
    );

    if (forceShow) {
      setShowBanner(true);
    } else if (!isStandalone && !isDismissed && (isIOSDevice || isInstallable)) {
      setShowBanner(true);
    } else {
      setShowBanner(false);
    }
  }, [isIOSDevice, isInstallable, pwaInstalled]);

  const handleDismiss = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setShowBanner(false);
    setShowGuideModal(false);
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now() + THIRTY_DAYS_MS));
    } catch {}
  };

  const handleDirectInstall = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (isIOSDevice) {
      setShowGuideModal(true);
    } else {
      install().then((success) => {
        if (success) {
          setShowBanner(false);
        } else {
          setShowGuideModal(true);
        }
      });
    }
  };

  return (
    <>
      {/* Slim, Non-Intrusive Top Banner (Never blocks navigation) */}
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
              <span className="font-bold text-amber-300">Add Vintage Vibes to Home Screen</span>
              <span className="hidden sm:inline text-slate-300 text-[11px] ml-1.5">
                • 2-Tap Instant App Icon (No Settings Required)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleDirectInstall}
              className="px-2.5 py-1 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-xs font-bold rounded-md shadow transition cursor-pointer flex items-center gap-1"
            >
              <span>📲</span>
              <span>{isIOSDevice ? 'Add to Home Screen' : 'Install App'}</span>
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

      {/* Easy 2-Tap Safari Add to Home Screen Modal */}
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
                  Add to iPhone / iPad Home Screen
                </h3>
                <p className="text-xs text-slate-400">
                  Super Easy 2-Step Method (No Settings Needed!)
                </p>
              </div>
            </div>

            {/* Simple 2-Step Safari Share Guide */}
            <div className="space-y-2.5 mb-4">
              <div className="bg-slate-900/90 border border-amber-500/40 rounded-xl p-3.5 flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-amber-500 text-slate-950 font-black flex items-center justify-center text-xs shrink-0 shadow">
                  1
                </div>
                <div className="flex-1 text-xs">
                  <div className="font-bold text-amber-300 text-sm mb-0.5">
                    Tap the Safari &apos;Share&apos; Button [↑]
                  </div>
                  <p className="text-slate-300 leading-relaxed">
                    Look at the <strong className="text-white">bottom center of Safari</strong> (or top-right on iPad) and tap the <strong className="text-amber-300">Share icon [↑]</strong> (square with an upward arrow).
                  </p>
                </div>
              </div>

              <div className="bg-slate-900/90 border border-amber-500/40 rounded-xl p-3.5 flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-amber-500 text-slate-950 font-black flex items-center justify-center text-xs shrink-0 shadow">
                  2
                </div>
                <div className="flex-1 text-xs">
                  <div className="font-bold text-amber-300 text-sm mb-0.5">
                    Tap &apos;Add to Home Screen ➕&apos;
                  </div>
                  <p className="text-slate-300 leading-relaxed">
                    Scroll slightly down in the menu, tap <strong className="text-amber-300">&apos;Add to Home Screen ➕&apos;</strong>, then tap <strong className="text-white">&apos;Add&apos;</strong> in the top-right corner!
                  </p>
                </div>
              </div>
            </div>

            {/* SQL Telemetry Info */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400 mb-3">
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

            {/* Dismiss Button */}
            <button
              type="button"
              onClick={handleDismiss}
              className="w-full bg-slate-900 hover:bg-slate-800 text-slate-300 font-bold text-xs py-2 rounded-xl border border-slate-800 transition cursor-pointer"
            >
              Done / Dismiss for 30 Days
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default IOSInstallBanner;
