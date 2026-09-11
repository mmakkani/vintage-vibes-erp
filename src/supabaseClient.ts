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

export const supabase: SupabaseClient = (() => {
  if (typeof window !== 'undefined') {
    if (!window.__supabaseInstance) {
      window.__supabaseInstance = createClient(supabaseUrl, supabaseKey || 'anon-key-placeholder');
    }
    return window.__supabaseInstance;
  }
  // SSR / Node environment fallback
  // @ts-ignore
  const g = globalThis as any;
  if (!g.__supabaseInstance) {
    g.__supabaseInstance = createClient(supabaseUrl, supabaseKey || 'anon-key-placeholder');
  }
  return g.__supabaseInstance;
})();

export default supabase;
