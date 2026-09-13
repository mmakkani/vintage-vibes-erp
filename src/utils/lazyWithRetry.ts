import React from 'react';

/**
 * Wraps dynamic component imports with automatic reload on deployment chunk failure.
 * When a new deployment occurs on Vercel, previous chunk hashes are removed from the server.
 * If a client tries to lazy-load an outdated chunk, this catches the failure, clears
 * the service worker and browser cache, and reloads once to fetch the fresh bundle.
 */
export function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T } | any>
): React.LazyExoticComponent<T> {
  return React.lazy(async () => {
    const hasRefreshed = sessionStorage.getItem('vv_chunk_retry_refreshed');
    try {
      const module = await factory();
      sessionStorage.removeItem('vv_chunk_retry_refreshed');
      return module.default ? module : { default: module };
    } catch (error: any) {
      console.warn('[Vite Chunk Retry] Dynamic chunk load failed (likely new deployment):', error);

      if (!hasRefreshed) {
        sessionStorage.setItem('vv_chunk_retry_refreshed', String(Date.now()));

        // Purge CacheStorage caches
        if (typeof window !== 'undefined' && 'caches' in window) {
          try {
            const keys = await caches.keys();
            await Promise.all(keys.map(k => caches.delete(k)));
          } catch (_) {}
        }

        // Unregister outdated service workers
        if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
          try {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const r of registrations) {
              await r.unregister();
            }
          } catch (_) {}
        }

        // Hard reload the window to load current deploy assets
        window.location.reload();

        // Return an unresolving promise while reload executes to prevent React error boundary explosion
        return new Promise(() => {});
      }

      throw error;
    }
  });
}
