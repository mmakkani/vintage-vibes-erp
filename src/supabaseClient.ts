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

const supabaseUrl = resolveEnv(
  'SUPABASE_URL',
  'VITE_SUPABASE_URL',
  'https://wjjelqsrivnyiybarfmo.supabase.co'
);

const supabaseKey = resolveEnv(
  'SUPABASE_SERVICE_ROLE_KEY',
  'VITE_SUPABASE_ANON_KEY',
  ''
) || resolveEnv(
  'SUPABASE_ANON_KEY',
  'VITE_SUPABASE_ANON_KEY',
  ''
);

function setupClient(client: SupabaseClient): SupabaseClient {
  const originalRpc = client.rpc.bind(client);

  // Transparently fallback to PostgreSQL Express RPC if cloud Supabase anon key is placeholder or rejects
  client.rpc = (async (fnName: string, args?: any, options?: any) => {
    try {
      const result = await originalRpc(fnName, args, options);
      if (!result.error) return result;

      const errMsg = result.error.message || '';
      if (
        errMsg.includes('Invalid API key') ||
        errMsg.includes('JWT') ||
        result.error.code === 'PGRST301' ||
        result.error.code === 'PGRST300'
      ) {
        const fetchFn = (typeof window !== 'undefined' && (window as any).__originalFetch) || (typeof fetch !== 'undefined' ? fetch : null);
        if (fetchFn) {
          const res = await fetchFn(`/api/rpc/${fnName}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(args || {})
          });
          const resJson = await res.json();
          if (res.ok) {
            return { data: resJson.data, error: null, count: null, status: 200, statusText: 'OK' } as any;
          } else {
            return { data: null, error: resJson.error || { message: 'RPC execution failed' }, count: null, status: res.status, statusText: res.statusText } as any;
          }
        }
      }
      return result;
    } catch (err: any) {
      try {
        const fetchFn = (typeof window !== 'undefined' && (window as any).__originalFetch) || (typeof fetch !== 'undefined' ? fetch : null);
        if (fetchFn) {
          const res = await fetchFn(`/api/rpc/${fnName}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(args || {})
          });
          const resJson = await res.json();
          if (res.ok) {
            return { data: resJson.data, error: null, count: null, status: 200, statusText: 'OK' } as any;
          }
          return { data: null, error: resJson.error || { message: err?.message || 'RPC execution failed' }, count: null, status: res.status, statusText: res.statusText } as any;
        }
      } catch (_) {}
      return { data: null, error: err, count: null, status: 500, statusText: 'Error' } as any;
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

