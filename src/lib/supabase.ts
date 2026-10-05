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

import { supabase as singletonClient } from '../supabaseClient.ts';
export const supabase: SupabaseClient | null = singletonClient;

export const SUPABASE_MEDIA_BUCKET = resolveEnv('SUPABASE_STORAGE_BUCKET', 'VITE_SUPABASE_STORAGE_BUCKET', 'vintage-vibes-media');

/**
 * Upload binary garment photos or media directly to Supabase Storage bucket
 * Returns the permanent public CDN URL
 */
export async function uploadMediaToSupabase(
  fileInput: any,
  fileName: string,
  mimeType: string = 'image/jpeg',
  bucketName: string = SUPABASE_MEDIA_BUCKET
): Promise<{ success: boolean; publicUrl?: string; error?: string }> {
  if (!fileInput) {
    return { success: true, publicUrl: '' };
  }

  // Idempotent: If already a web URL, do not re-upload
  if (typeof fileInput === 'string' && (fileInput.startsWith('http://') || fileInput.startsWith('https://'))) {
    return { success: true, publicUrl: fileInput };
  }

  if (!supabase) {
    return {
      success: false,
      error: 'Supabase client not initialized. Ensure SUPABASE_URL and SUPABASE_ANON_KEY are configured in .env.'
    };
  }

  try {
    let payloadToUpload = fileInput;
    let effectiveMime = mimeType;

    // Handle base64 Data URL conversion (browser & Node compatible)
    if (typeof fileInput === 'string' && fileInput.startsWith('data:')) {
      const parts = fileInput.split(';base64,');
      if (parts.length === 2) {
        effectiveMime = parts[0].replace(/^data:/, '') || mimeType;
        const b64Data = parts[1];
        if (typeof window !== 'undefined' && typeof window.atob === 'function') {
          const byteCharacters = window.atob(b64Data);
          const byteNumbers = new Uint8Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          payloadToUpload = new Blob([byteNumbers], { type: effectiveMime });
        } else if (typeof Buffer !== 'undefined') {
          payloadToUpload = Buffer.from(b64Data, 'base64');
        }
      }
    }

    const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const ext = effectiveMime.includes('png') ? '.png' : effectiveMime.includes('webp') ? '.webp' : '.jpg';
    const cleanFileName = sanitizedName.endsWith(ext) ? sanitizedName : `${sanitizedName}${ext}`;
    const filePath = `garments/${Date.now()}_${cleanFileName}`;

    const { data, error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(filePath, payloadToUpload, {
        contentType: effectiveMime,
        upsert: true
      });

    if (uploadError) {
      console.warn('[Supabase Storage Upload Warning]:', uploadError.message);
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
    console.error('[Supabase Storage Upload Error]:', err);
    return {
      success: false,
      error: err?.message || 'Failed to upload media to Supabase Storage'
    };
  }
}
