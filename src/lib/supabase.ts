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

const supabaseUrl = resolveEnv('SUPABASE_URL', 'VITE_SUPABASE_URL', 'https://wjjelqsrivnyiybarfmo.supabase.co');
const supabaseKey = resolveEnv('SUPABASE_SERVICE_ROLE_KEY', 'VITE_SUPABASE_ANON_KEY', '') || resolveEnv('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY', '');

export const supabase: SupabaseClient | null = (supabaseUrl && supabaseKey) 
  ? createClient(supabaseUrl, supabaseKey) 
  : null;

export const SUPABASE_MEDIA_BUCKET = resolveEnv('SUPABASE_STORAGE_BUCKET', 'VITE_SUPABASE_STORAGE_BUCKET', 'vintage-vibes-media');

/**
 * Upload binary garment photos or media directly to Supabase Storage bucket
 * Returns the permanent public CDN URL
 */
export async function uploadMediaToSupabase(
  fileBuffer: any,
  fileName: string,
  mimeType: string = 'image/jpeg',
  bucketName: string = SUPABASE_MEDIA_BUCKET
): Promise<{ success: boolean; publicUrl?: string; error?: string }> {
  if (!supabase) {
    return {
      success: false,
      error: 'Supabase client not initialized. Ensure SUPABASE_URL and SUPABASE_ANON_KEY are configured in .env.'
    };
  }

  try {
    const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = `garments/${Date.now()}_${sanitizedName}`;

    const { data, error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(filePath, fileBuffer, {
        contentType: mimeType,
        upsert: true
      });

    if (uploadError) {
      return { success: false, error: uploadError.message };
    }

    const { data: urlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(data.path);

    return {
      success: true,
      publicUrl: urlData.publicUrl
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Failed to upload media to Supabase Storage'
    };
  }
}
