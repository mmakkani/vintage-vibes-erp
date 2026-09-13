import React, { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { RefreshCw, Sparkles, X } from 'lucide-react';

export const PWAUpdatePrompt: React.FC = () => {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [updateFunction, setUpdateFunction] = useState<((reloadPage?: boolean) => Promise<void>) | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    try {
      const updateSW = registerSW({
        onNeedRefresh() {
          // Triggered ONLY when the new Service Worker has finished downloading & installing into waiting state
          console.log('[PWA] New version downloaded and fully ready to activate.');
          setNeedRefresh(true);
        },
        onOfflineReady() {
          console.log('[PWA] Vintage Vibes is ready for offline operation.');
        },
        onRegisteredSW(swUrl, registration) {
          if (registration) {
            // Check for service worker updates periodically every 30 minutes
            const interval = setInterval(() => {
              registration.update().catch(err => console.warn('[PWA] Periodic update check failed:', err));
            }, 30 * 60 * 1000);

            return () => {
              clearInterval(interval);
            };
          }
        },
      });

      setUpdateFunction(() => updateSW);

      // When the new worker takes control, immediately reload to run the updated bundle
      let refreshing = false;
      const handleControllerChange = () => {
        if (!refreshing) {
          refreshing = true;
          console.log('[PWA] Controller changed -> reloading to latest build.');
          window.location.reload();
        }
      };
      navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

      return () => {
        navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      };
    } catch (err) {
      console.warn('[PWA] SW registration failed to initialize:', err);
    }
  }, []);

  const handleUpdate = async () => {
    setIsUpdating(true);
    try {
      if (updateFunction) {
        // Post message SKIP_WAITING to the waiting service worker
        await updateFunction(true);
      }
      // Safety timeout: if controllerchange doesn't fire within 1.2s, force reload
      setTimeout(() => {
        window.location.reload();
      }, 1200);
    } catch (err) {
      console.error('[PWA] Error activating new SW, falling back to window reload:', err);
      window.location.reload();
    }
  };

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[99999] max-w-sm animate-in fade-in slide-in-from-bottom-5 duration-300">
      <div className="bg-slate-950/95 text-white border border-amber-500/50 rounded-2xl shadow-2xl p-4 backdrop-blur-md">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
            </div>
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                New Update Available
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              </h4>
              <p className="text-[11px] text-slate-300 mt-0.5 leading-snug font-sans">
                A fresh build of Vintage Vibes ERP is ready with fixes & database updates.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setNeedRefresh(false)}
            className="text-slate-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-800 shrink-0 cursor-pointer"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={handleUpdate}
            disabled={isUpdating}
            className="flex-1 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold text-xs py-2 px-3 rounded-xl transition-all shadow-md shadow-amber-950/30 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isUpdating ? 'animate-spin' : ''}`} />
            <span>{isUpdating ? 'Applying Update...' : 'Refresh App Now'}</span>
          </button>
          <button
            type="button"
            onClick={() => setNeedRefresh(false)}
            className="text-[11px] font-semibold text-slate-400 hover:text-slate-200 px-2.5 py-2 rounded-xl hover:bg-slate-900 transition-colors cursor-pointer"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
};
