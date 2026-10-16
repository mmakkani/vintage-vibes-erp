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
    const urlStr = String(url || '');
    if (urlStr.includes(CLOUD_HOST) || urlStr.includes('/realtime/v1/websocket')) {
      const listeners: Record<string, Array<(ev: any) => void>> = {
        open: [],
        message: [],
        error: [],
        close: []
      };
      const vws: any = {
        url: `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/realtime/v1/websocket`,
        readyState: 0,
        bufferedAmount: 0,
        extensions: '',
        protocol: Array.isArray(protocols) ? (protocols[0] || '') : (protocols || ''),
        binaryType: 'arraybuffer',
        onopen: null,
        onmessage: null,
        onerror: null,
        onclose: null,
        addEventListener(type: string, fn: (ev: any) => void) {
          if (listeners[type] && typeof fn === 'function') listeners[type].push(fn);
        },
        removeEventListener(type: string, fn: (ev: any) => void) {
          if (listeners[type]) listeners[type] = listeners[type].filter(f => f !== fn);
        },
        dispatchEvent(ev: any) {
          const t = ev?.type;
          if (t && listeners[t]) listeners[t].forEach(fn => { try { fn(ev); } catch (_) {} });
          return true;
        },
        send(raw: any) {
          if (vws.readyState !== 1) return;
          try {
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : null;
            if (!parsed) return;
            const isV2 = Array.isArray(parsed);
            const join_ref = isV2 ? parsed[0] : (parsed.join_ref ?? null);
            const ref = isV2 ? parsed[1] : (parsed.ref ?? null);
            const topic = isV2 ? parsed[2] : (parsed.topic || '');
            const event = isV2 ? parsed[3] : (parsed.event || '');
            const payload = isV2 ? parsed[4] : (parsed.payload || {});

            const emitReply = (jRef: any, rRef: any, tpc: string, evt: string, pld: any) => {
              const frame = isV2
                ? JSON.stringify([jRef ?? null, rRef ?? null, tpc, evt, pld])
                : JSON.stringify({ join_ref: jRef ?? null, ref: rRef ?? null, topic: tpc, event: evt, payload: pld });
              setTimeout(() => {
                if (vws.readyState !== 1) return;
                const msgEv = { data: frame, type: 'message' };
                if (typeof vws.onmessage === 'function') vws.onmessage(msgEv);
                listeners.message.forEach(fn => { try { fn(msgEv); } catch (_) {} });
              }, 5);
            };

            if (event === 'phx_join') {
              const reqPg = Array.isArray(payload?.config?.postgres_changes) ? payload.config.postgres_changes : [];
              const respPg = reqPg.map((f: any, idx: number) => ({ id: idx + 1, ...f }));
              emitReply(join_ref, ref, topic, 'phx_reply', {
                status: 'ok',
                response: { postgres_changes: respPg }
              });
            } else if (event === 'heartbeat') {
              emitReply(null, ref, 'phoenix', 'phx_reply', { status: 'ok', response: {} });
            } else if (event === 'access_token' || event === 'phx_leave') {
              emitReply(join_ref, ref, topic || 'phoenix', 'phx_reply', { status: 'ok', response: {} });
            }
          } catch (_) {}
        },
        close(code?: number, reason?: string) {
          if (vws.readyState === 3) return;
          vws.readyState = 3;
          const closeEv = { code: code || 1000, reason: reason || '', wasClean: true, type: 'close' };
          setTimeout(() => {
            if (typeof vws.onclose === 'function') vws.onclose(closeEv);
            listeners.close.forEach(fn => { try { fn(closeEv); } catch (_) {} });
          }, 5);
        }
      };

      setTimeout(() => {
        if (vws.readyState !== 0) return;
        vws.readyState = 1;
        const openEv = { type: 'open' };
        if (typeof vws.onopen === 'function') vws.onopen(openEv);
        listeners.open.forEach(fn => { try { fn(openEv); } catch (_) {} });
      }, 10);

      return vws;
    }
    return protocols ? new OrigWS(url, protocols) : new OrigWS(url);
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

