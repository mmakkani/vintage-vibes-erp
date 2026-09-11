import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase: SupabaseClient | null = (supabaseUrl && supabaseKey) 
  ? createClient(supabaseUrl, supabaseKey) 
  : null;

export const SUPABASE_MEDIA_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'vintage-vibes-media';

/**
 * Upload binary garment photos or media directly to Supabase Storage bucket
 * Returns the permanent public CDN URL
 */
export async function uploadMediaToSupabase(
  fileBuffer: Buffer,
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
