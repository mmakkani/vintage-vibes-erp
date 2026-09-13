import React, { useState, useEffect } from 'react';
import { DeviceService } from '../services/deviceService.ts';

export const IOSInstallBanner: React.FC = () => {
  const [showBanner, setShowBanner] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [registeredIp, setRegisteredIp] = useState<string>('');
  const [isRegistered, setIsRegistered] = useState(false);
  const [deviceModel, setDeviceModel] = useState<string>('iPhone');

  useEffect(() => {
    // 1. Detect device & standalone mode
    const info = DeviceService.detectDeviceInfo();
    setDeviceModel(info.deviceModel);

    // 2. Auto-register device and capture IP in PostgreSQL
    DeviceService.registerDevice().then((res) => {
      if (res && res.success) {
        setIsRegistered(true);
        if (res.ip) setRegisteredIp(res.ip);
      }
    }).catch(() => {});

    // 3. Test mode via URL parameter: ?ios_install=1
    const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const forceShow = urlParams?.get('ios_install') === '1';

    // 4. Check if dismissed during current session
    const isDismissed = typeof sessionStorage !== 'undefined' &&
      sessionStorage.getItem('vintage_ios_install_dismissed') === 'true';

    // 5. Show banner on iOS if not running in standalone mode and not dismissed
    if ((info.isIOS && !info.isStandalone && !isDismissed) || forceShow) {
      setShowBanner(true);
    }
  }, []);

  const handleDismiss = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setShowBanner(false);
    try {
      sessionStorage.setItem('vintage_ios_install_dismissed', 'true');
    } catch {}
  };

  if (!showBanner) {
    return null;
  }

  return (
    <>
      {/* Bottom Sticky Banner with Pointer to Safari Toolbar */}
      <aside
        aria-label="Install App Banner"
        className="fixed bottom-3 inset-x-3 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:max-w-md z-[9999] pointer-events-auto transition-all duration-300 ease-out animate-in fade-in slide-in-from-bottom-5"
      >
        <div 
          onClick={() => setShowGuideModal(true)}
          className="relative overflow-hidden bg-slate-950/95 backdrop-blur-md border border-amber-500/60 rounded-2xl p-4 shadow-[0_16px_45px_rgba(0,0,0,0.8)] ring-1 ring-amber-400/30 text-slate-100 cursor-pointer hover:border-amber-400 transition"
        >
          {/* Subtle decorative gold corner glow */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/15 rounded-full blur-2xl pointer-events-none -mr-10 -mt-10" />

          <div className="flex items-start gap-3 relative z-10">
            {/* App Icon */}
            <div className="relative shrink-0">
              <img
                src="/apple-touch-icon.png"
                alt="Vintage Vibes Logo"
                className="w-12 h-12 rounded-xl border border-amber-500/50 shadow-md object-cover bg-slate-900 p-0.5"
                onError={(e) => {
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
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-serif font-black text-amber-300 text-xs tracking-wider uppercase">
                    Vintage Vibes
                  </span>
                  <span className="bg-amber-400/20 text-amber-300 text-[10px] font-bold px-1.5 py-0.5 rounded border border-amber-400/30">
                    App
                  </span>
                  {isRegistered && (
                    <span className="bg-emerald-500/20 text-emerald-300 text-[9px] font-mono px-1 py-0.5 rounded border border-emerald-500/30">
                      SQL Sync Active
                    </span>
                  )}
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

              {/* Exact Instruction & Clarification */}
              <p className="text-xs text-slate-200 leading-snug font-medium">
                <strong className="text-amber-300 font-bold">Install on iPhone:</strong> Tap the Safari Share button below & select &apos;Add to Home Screen&apos;.
              </p>
              <p className="text-[11px] text-amber-300/90 font-medium mt-0.5" dir="rtl">
                سفاری کے نیچے شیئر آئیکن [↑] دبائیں اور &apos;Add to Home Screen&apos; منتخب کریں۔
              </p>

              {/* Quick Action Buttons */}
              <div className="mt-2.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowGuideModal(true);
                  }}
                  className="flex-1 text-center bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-xs font-bold py-1.5 px-3 rounded-lg shadow cursor-pointer transition flex items-center justify-center gap-1.5"
                >
                  <span>Step-by-Step Guide (رہنمائی)</span>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

              {/* Bouncing Pointer Directly Down to Safari Toolbar */}
              <div className="flex items-center justify-center gap-1.5 mt-2.5 pt-1.5 border-t border-slate-800 text-[11px] text-amber-400 font-semibold tracking-wide">
                <span>Safari نیچے Share آئیکن [↑] دبائیں</span>
                <svg className="w-3.5 h-3.5 animate-bounce text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Comprehensive Visual Step-by-Step Modal */}
      {showGuideModal && (
        <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-lg bg-slate-950 border border-amber-500/60 rounded-3xl p-5 sm:p-6 shadow-[0_25px_60px_rgba(0,0,0,0.9)] text-slate-100 max-h-[90vh] overflow-y-auto">
            {/* Close Button */}
            <button
              onClick={() => setShowGuideModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-2 rounded-xl bg-slate-900 border border-slate-800 transition cursor-pointer"
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
                className="w-14 h-14 rounded-2xl border-2 border-amber-500/50 shadow-lg object-cover bg-slate-900"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/vintage_logo.svg';
                }}
              />
              <div>
                <h3 className="text-lg font-serif font-black text-amber-300 tracking-wide">
                  iPhone App Installation
                </h3>
                <p className="text-xs text-slate-400">
                  آئی فون پر ونٹیج وائبز ایپ انسٹال کرنے کا مکمل طریقہ
                </p>
              </div>
            </div>

            {/* Crucial Note about iPhone & Safari */}
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 mb-4 text-xs text-amber-200 leading-relaxed">
              <div className="font-bold flex items-center gap-1.5 text-amber-300 mb-1">
                <span>⚠️ اہم نکتہ (Apple iOS Policy):</span>
              </div>
              <p className="mb-1">
                آئی فون پر گوگل پلے یا اینڈرائیڈ کی طرح کوئی بیرونی فائل (APK) ڈاؤن لوڈ نہیں ہوتی۔
              </p>
              <p className="text-slate-300 text-[11px]">
                ایپل سفاری کے اندر صرف <strong>&apos;Add to Home Screen&apos;</strong> کرنے سے ایپ 2 سیکنڈ میں براہِ راست موبائل میں محفوظ ہو جاتی ہے اور بغیر براؤزر بار کے فل اسکرین کھلتی ہے۔
              </p>
            </div>

            {/* Step 1 */}
            <div className="space-y-3">
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 flex items-start gap-3.5">
                <div className="w-8 h-8 rounded-full bg-amber-500 text-slate-950 font-black flex items-center justify-center text-sm shrink-0 shadow">
                  1
                </div>
                <div className="flex-1">
                  <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wider mb-1">
                    Step 1: سفاری کا Share بٹن دبائیں
                  </h4>
                  <p className="text-xs text-slate-300 leading-normal">
                    اپنے آئی فون کے سب سے نیچے سفاری ٹول بار میں موجود نیلا شیئر آئیکن{' '}
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-sky-500/20 text-sky-300 rounded border border-sky-500/30 font-bold text-[11px]">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                        <polyline points="16 6 12 2 8 6" />
                        <line x1="12" y1="2" x2="12" y2="15" />
                      </svg>
                      Share [↑]
                    </span>{' '}
                    دبائیں۔
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 flex items-start gap-3.5">
                <div className="w-8 h-8 rounded-full bg-amber-500 text-slate-950 font-black flex items-center justify-center text-sm shrink-0 shadow">
                  2
                </div>
                <div className="flex-1">
                  <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wider mb-1">
                    Step 2: Add to Home Screen منتخب کریں
                  </h4>
                  <p className="text-xs text-slate-300 leading-normal">
                    کھلنے والے مینو کو نیچے اسکرول کریں اور{' '}
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded border border-amber-500/30 font-bold text-[11px]">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <line x1="12" y1="8" x2="12" y2="16" />
                        <line x1="8" y1="12" x2="16" y2="12" />
                      </svg>
                      Add to Home Screen
                    </span>{' '}
                    (ہوم اسکرین پر شامل کریں) پر کلک کریں۔
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 flex items-start gap-3.5">
                <div className="w-8 h-8 rounded-full bg-amber-500 text-slate-950 font-black flex items-center justify-center text-sm shrink-0 shadow">
                  3
                </div>
                <div className="flex-1">
                  <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wider mb-1">
                    Step 3: اوپر دائیں طرف Add پر کلک کریں
                  </h4>
                  <p className="text-xs text-slate-300 leading-normal">
                    اسکرین کے اوپر دائیں کونے میں نیلے رنگ کا <strong>&apos;Add&apos;</strong> دبائیں۔ ایپ فوری طور پر آپ کے آئی فون کی ہوم اسکرین پر شامل ہو جائے گی!
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
              <div className="flex items-center gap-1 text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>SQL Synced</span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs py-2.5 rounded-xl transition cursor-pointer"
              >
                سمجھ گیا / Got It
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default IOSInstallBanner;
