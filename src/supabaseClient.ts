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
// On Node backend, ALWAYS use 127.0.0.1 loopback (0.1ms) rather than APP_URL external HTTPS NAT hairpin!
const localOrigin =
  typeof window !== 'undefined' && window.location && window.location.origin
    ? window.location.origin
    : `http://127.0.0.1:${(typeof process !== 'undefined' && process.env && process.env.PORT) || 3000}`;

const supabaseUrl = localOrigin;
const supabaseKey = isValidJwt(rawKey)
  ? rawKey
  : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvY2FsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6MjEwMDAwMDAwMH0.local';

function getValidErpSessionToken(): string | null {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return null;
  try {
    let tok =
      localStorage.getItem('vv_auth_token') ||
      localStorage.getItem('session_token') ||
      (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('vv_auth_token') : null) ||
      '';
    if (!tok) {
      const stored = localStorage.getItem('vintage_erp_logged_user') || localStorage.getItem('vintage_vibes_auth_user');
      if (stored) tok = JSON.parse(stored)?.token || '';
    }
    tok = String(tok || '').trim();
    if (!tok || !tok.startsWith('vv_sess_')) return null;
    const parts = tok.split('.');
    if (parts.length === 5) {
      const exp = Number(parts[3]);
      if (Number.isFinite(exp) && Date.now() > exp) return null;
    }
    return tok;
  } catch {
    return null;
  }
}

if (typeof window !== 'undefined' && !(window as any).__vvLocalBridgeInstalled) {
  (window as any).__vvLocalBridgeInstalled = true;
  try {
    if (typeof localStorage !== 'undefined' && !localStorage.getItem('vintage_gemini_api_key')) {
      localStorage.setItem('vintage_gemini_api_key', 'LOCAL_RTX_3070_TI_GPU_VISION');
      localStorage.setItem('vintage_gemini_model', 'llama3.2-vision');
    }
  } catch (_) {}
  const CLOUD_HOST = 'wjjelqsrivnyiybarfmo.supabase.co';
  const origFetch = window.fetch.bind(window);
  (window as any).__originalFetch = origFetch;

  window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
    try {
      if (typeof input === 'string' && input.includes(CLOUD_HOST)) {
        const u = new URL(input);
        input = window.location.origin + u.pathname + u.search;
      } else if (typeof input === 'string' && input.includes('generativelanguage.googleapis.com')) {
        input = window.location.origin + '/api/gpu/gemini-bridge';
      } else if (input instanceof Request && input.url && input.url.includes(CLOUD_HOST)) {
        const u = new URL(input.url);
        input = new Request(window.location.origin + u.pathname + u.search, input);
      } else if (input instanceof Request && input.url && input.url.includes('generativelanguage.googleapis.com')) {
        input = new Request(window.location.origin + '/api/gpu/gemini-bridge', input);
      }
      // Prevent browser HTTP disk cache from serving stale PostgREST (/rest/v1/*) GET responses,
      // and attach ERP credentials/session token when Supabase client sends the public anon key.
      const targetStr = typeof input === 'string' ? input : (input instanceof URL ? input.toString() : (input?.url || ''));
      const method = (init?.method || (input instanceof Request ? input.method : 'GET') || 'GET').toUpperCase();
      let isSameOriginSupabaseApi = false;
      try {
        const parsed = new URL(targetStr, window.location.origin);
        isSameOriginSupabaseApi =
          parsed.origin === window.location.origin &&
          (parsed.pathname.startsWith('/rest/v1/') || parsed.pathname.startsWith('/api/rpc/'));
      } catch (_) {}
      if (isSameOriginSupabaseApi) {
        const nextInit: RequestInit = { ...(init || {}) };
        if (!nextInit.credentials) nextInit.credentials = 'include';
        if (method === 'GET' && targetStr.includes('/rest/v1/') && !nextInit.cache) {
          nextInit.cache = 'no-cache';
        }
        const hdrs = new Headers(nextInit.headers || (input instanceof Request ? input.headers : undefined));
        const curAuth = (hdrs.get('Authorization') || hdrs.get('authorization') || '').trim();
        const erpTok = getValidErpSessionToken();
        if (erpTok && (!curAuth || curAuth === `Bearer ${supabaseKey}`)) {
          hdrs.set('Authorization', `Bearer ${erpTok}`);
        }
        nextInit.headers = hdrs;
        init = nextInit;
      } else if (method === 'GET' && targetStr.includes('/rest/v1/') && !init?.cache) {
        init = { ...(init || {}), cache: 'no-cache' };
      }
    } catch (_) {}
    return origFetch(input as any, init);
  };

  const OrigWS = window.WebSocket;
  const WrappedWS: any = function (url: string | URL, protocols?: string | string[]) {
    let targetUrl = String(url || '');
    try {
      if (targetUrl.includes(CLOUD_HOST) || targetUrl.includes('/realtime/v1/websocket')) {
        const parsedUrl = new URL(targetUrl, window.location.origin);
        const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        targetUrl = `${wsProto}//${window.location.host}${parsedUrl.pathname}${parsedUrl.search}`;
      }
    } catch (_) {}
    return protocols !== undefined ? new OrigWS(targetUrl, protocols) : new OrigWS(targetUrl);
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
        const rpcHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
        const erpTok = getValidErpSessionToken();
        if (erpTok) rpcHeaders['Authorization'] = `Bearer ${erpTok}`;
        const res = await fetchFn(rpcUrl, {
          method: 'POST',
          ...(typeof window !== 'undefined' ? { credentials: 'include' as RequestCredentials } : {}),
          headers: rpcHeaders,
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

