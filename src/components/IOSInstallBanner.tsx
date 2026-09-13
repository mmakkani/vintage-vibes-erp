import React, { useState, useEffect } from 'react';
import { DeviceService } from '../services/deviceService.ts';

const DISMISSED_KEY = 'vintage_pwa_prompt_dismissed_until';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export const IOSInstallBanner: React.FC = () => {
  const [showBanner, setShowBanner] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [registeredIp, setRegisteredIp] = useState<string>('');
  const [deviceModel, setDeviceModel] = useState<string>('iPhone');
  const [profileDownloaded, setProfileDownloaded] = useState(false);

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

  const handleDirectInstall = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    setProfileDownloaded(true);
    setShowGuideModal(true);
    // Trigger native iOS configuration profile download
    window.location.href = '/vintagevibes.mobileconfig';
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
              <span className="hidden sm:inline text-slate-300 text-[11px] ml-1.5">• 1-Click Apple Profile Install</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleDirectInstall}
              className="px-2.5 py-1 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-xs font-bold rounded-md shadow transition cursor-pointer flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>Direct Install</span>
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

      {/* Direct Install Profile Modal */}
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
                  Direct iPhone App Installation
                </h3>
                <p className="text-xs text-slate-400">
                  Apple Enterprise WebClip Profile Installer
                </p>
              </div>
            </div>

            {/* Primary Action Button: Direct Download Profile */}
            <div className="mb-4">
              <a
                href="/vintagevibes.mobileconfig"
                download="vintagevibes.mobileconfig"
                onClick={() => setProfileDownloaded(true)}
                className="w-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 hover:from-amber-300 hover:to-amber-500 text-slate-950 font-black text-sm py-3 px-4 rounded-xl shadow-lg flex items-center justify-center gap-2 transition cursor-pointer text-center"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>Download & Install Apple Profile</span>
              </a>
            </div>

            {/* Simple 2-Step Completion Guide */}
            <div className="space-y-2.5 mb-4">
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-amber-500 text-slate-950 font-black flex items-center justify-center text-xs shrink-0 shadow">
                  1
                </div>
                <div className="flex-1 text-xs">
                  <div className="font-bold text-amber-300">Tap &apos;Allow&apos;</div>
                  <p className="text-slate-300">
                    When Safari asks to download a configuration profile, tap <strong className="text-white">&apos;Allow&apos;</strong>.
                  </p>
                </div>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-amber-500 text-slate-950 font-black flex items-center justify-center text-xs shrink-0 shadow">
                  2
                </div>
                <div className="flex-1 text-xs">
                  <div className="font-bold text-amber-300">Open Settings & Tap Install</div>
                  <p className="text-slate-300">
                    Open iPhone <strong className="text-white">Settings</strong> ➔ Tap <strong className="text-amber-300">&apos;Profile Downloaded&apos;</strong> at the top ➔ Tap <strong className="text-white">&apos;Install&apos;</strong>. The app icon will appear on your Home Screen!
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
