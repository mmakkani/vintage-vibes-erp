import React from 'react';

/**
 * Checks whether an error is caused by a missing chunk / outdated asset 404
 * following a new deployment or network interruption.
 */
export function isChunkLoadError(error: any): boolean {
  if (!error) return false;
  const msg = String(error?.message || error?.name || error || '').toLowerCase();
  return (
    msg.includes('failed to fetch dynamically imported module') ||
    msg.includes('loading chunk') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('importing a module script failed') ||
    msg.includes('err_aborted') ||
    msg.includes('chunkloaderror') ||
    msg.includes('bad-precaching-response') ||
    msg.includes('404')
  );
}

/**
 * Cleanly unregisters service workers and purges CacheStorage caches
 * so the browser fetches the fresh index.html and deployment manifest.
 */
export async function purgeCachesAndServiceWorkers(): Promise<void> {
  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    } catch (_) {}
  }
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const r of registrations) {
        await r.unregister();
      }
    } catch (_) {}
  }
}

/**
 * Wraps dynamic component imports with automatic reload on deployment chunk failure.
 * When a new deployment occurs on Vercel, previous chunk hashes are removed from the server.
 * If a client tries to lazy-load an outdated chunk, this catches the failure, clears
 * the service worker and browser cache, and reloads once to fetch the fresh deployment bundle.
 */
export function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T } | any>
): React.LazyExoticComponent<T> {
  return React.lazy(async () => {
    try {
      const module = await factory();
      return module.default ? module : { default: module };
    } catch (error: any) {
      console.warn('[Vite Chunk Retry] Dynamic chunk load failed (likely new deployment):', error);

      const RELOAD_KEY = 'vv_chunk_reload_cooldown';
      const lastReload = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
      const now = Date.now();

      // If it's a dynamic chunk / 404 error and we haven't reloaded in the last 15 seconds
      if (isChunkLoadError(error) && now - lastReload > 15000) {
        console.info('[Vite Chunk Retry] Auto-reloading page to fetch latest deployment manifest...');
        sessionStorage.setItem(RELOAD_KEY, String(now));
        await purgeCachesAndServiceWorkers();
        window.location.reload();
        // Return a pending promise while the browser hard reloads
        return new Promise(() => {});
      }

      throw error;
    }
  });
}
