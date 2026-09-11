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

export const supabase: SupabaseClient = createClient(
  supabaseUrl,
  supabaseKey || 'anon-key-placeholder'
);

export default supabase;
