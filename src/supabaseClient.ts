import { createClient, SupabaseClient } from '@supabase/supabase-js';

function resolveEnv(envKey: string, viteKey: string, fallback: string = ''): string {
  try {
    if (typeof process !== 'undefined' && process.env && process.env[envKey]) {
      return process.env[envKey] as string;
    }
  } catch (_) {}
  try {
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[viteKey]) {
      // @ts-ignore
      return import.meta.env[viteKey] as string;
    }
  } catch (_) {}
  return fallback;
}

declare global {
  interface Window {
    __supabaseInstance?: SupabaseClient;
  }
}

const defaultCloudUrl = 'https://wjjelqsrivnyiybarfmo.supabase.co';

function isValidJwt(k: string): boolean {
  return typeof k === 'string' && k.startsWith('eyJ') && !k.includes('placeholder') && !k.startsWith('your_supabase_');
}

const envServiceKey = resolveEnv('SUPABASE_SERVICE_ROLE_KEY', 'VITE_SUPABASE_SERVICE_ROLE_KEY', '');
const envAnonKey = resolveEnv('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY', '');

const rawKey = isValidJwt(envServiceKey) ? envServiceKey : (isValidJwt(envAnonKey) ? envAnonKey : (envServiceKey || envAnonKey || ''));


export const isPlaceholderKey =
  !rawKey ||
  rawKey === 'anon-key-placeholder' ||
  rawKey === 'your_supabase_anon_public_key' ||
  rawKey.startsWith('your_supabase_') ||
  !rawKey.startsWith('eyJ');

const configuredUrl = resolveEnv(
  'SUPABASE_URL',
  'VITE_SUPABASE_URL',
  defaultCloudUrl
);

// Route requests to the Express PostgREST + Realtime server so that all database queries
// and real-time subscriptions operate directly against the configured PostgreSQL database.
const localOrigin =
  typeof window !== 'undefined' && window.location && window.location.origin
    ? window.location.origin
    : (typeof process !== 'undefined' && process.env && (process.env.APP_URL || `http://127.0.0.1:${process.env.PORT || 3000}`)) || 'http://127.0.0.1:3000';

const supabaseUrl = localOrigin;
const supabaseKey = isValidJwt(rawKey)
  ? rawKey
  : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvY2FsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6MjEwMDAwMDAwMH0.local';

if (typeof window !== 'undefined' && !(window as any).__vvLocalBridgeInstalled) {
  (window as any).__vvLocalBridgeInstalled = true;
  const CLOUD_HOST = 'wjjelqsrivnyiybarfmo.supabase.co';
  const origFetch = window.fetch.bind(window);
  (window as any).__originalFetch = origFetch;

  window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
    try {
      if (typeof input === 'string' && input.includes(CLOUD_HOST)) {
        const u = new URL(input);
        input = window.location.origin + u.pathname + u.search;
      } else if (input instanceof Request && input.url && input.url.includes(CLOUD_HOST)) {
        const u = new URL(input.url);
        input = new Request(window.location.origin + u.pathname + u.search, input);
      }
    } catch (_) {}
    return origFetch(input as any, init);
  };

  const OrigWS = window.WebSocket;
  const WrappedWS: any = function (url: string | URL, protocols?: string | string[]) {
    try {
      const urlStr = String(url || '');
      if (urlStr.includes(CLOUD_HOST) || urlStr.includes('/realtime/v1/websocket')) {
        const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        url = `${wsProto}//${window.location.host}/realtime/v1/websocket`;
      }
    } catch (_) {}
    const ws = protocols ? new OrigWS(url, protocols) : new OrigWS(url);
    ws.addEventListener('message', function (ev: MessageEvent) {
      try {
        const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '');
        if (msg && msg.event === 'postgres_changes' && msg.payload && msg.payload.data) {
          const d = msg.payload.data;
          const now = Date.now();
          if (!((window as any).__vvLastRtDispatch) || now - (window as any).__vvLastRtDispatch > 250) {
            (window as any).__vvLastRtDispatch = now;
            window.dispatchEvent(
              new CustomEvent('vv:entity-mutated', {
                detail: {
                  module: 'ALL',
                  entity: d.table || 'ALL',
                  action: d.eventType || 'UPDATE',
                  fromRealtime: true
                }
              })
            );
          }
        }
      } catch (_) {}
    });
    return ws;
  };
  WrappedWS.prototype = OrigWS.prototype;
  WrappedWS.CONNECTING = OrigWS.CONNECTING;
  WrappedWS.OPEN = OrigWS.OPEN;
  WrappedWS.CLOSING = OrigWS.CLOSING;
  WrappedWS.CLOSED = OrigWS.CLOSED;
  window.WebSocket = WrappedWS;
}

function setupClient(client: SupabaseClient): SupabaseClient {
  const originalRpc = client.rpc.bind(client);

  // Execute PostgreSQL RPC directly via Express /api/rpc/:fnName with fallback to PostgREST /rest/v1/rpc/:fnName
  client.rpc = (async (fnName: string, args?: any, options?: any) => {
    try {
      const fetchFn = (typeof window !== 'undefined' && (window as any).__originalFetch) || (typeof fetch !== 'undefined' ? fetch : null);
      if (fetchFn) {
        const rpcUrl = typeof window !== 'undefined' ? `/api/rpc/${fnName}` : `${localOrigin}/api/rpc/${fnName}`;
        const res = await fetchFn(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(args || {})
        });
        const resJson = await res.json();
        if (res.ok) {
          return { data: resJson.data !== undefined ? resJson.data : resJson, error: null, count: null, status: 200, statusText: 'OK' } as any;
        } else {
          return { data: null, error: resJson.error || { message: 'RPC execution failed' }, count: null, status: res.status, statusText: res.statusText } as any;
        }
      }
      return await originalRpc(fnName, args, options);
    } catch (err: any) {
      return { data: null, error: { message: err?.message || 'RPC execution failed' }, count: null, status: 500, statusText: 'Error' } as any;
    }
  }) as any;

  return client;
}

export const supabase: SupabaseClient = (() => {
  if (typeof window !== 'undefined') {
    if (!window.__supabaseInstance) {
      window.__supabaseInstance = setupClient(createClient(supabaseUrl, supabaseKey || 'anon-key-placeholder'));
    }
    return window.__supabaseInstance;
  }
  // SSR / Node environment fallback
  // @ts-ignore
  const g = globalThis as any;
  if (!g.__supabaseInstance) {
    g.__supabaseInstance = setupClient(createClient(supabaseUrl, supabaseKey || 'anon-key-placeholder'));
  }
  return g.__supabaseInstance;
})();

export default supabase;

