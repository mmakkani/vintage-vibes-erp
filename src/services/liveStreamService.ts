import { supabase } from '../supabaseClient.ts';

export interface LiveBooth {
  id: string; // 'booth_01' .. 'booth_05'
  booth_name: string;
  host_operator_name?: string | null;
  rtmp_ingest_url?: string | null;
  stream_key?: string | null;
  hls_playback_url?: string | null;
  active_product_sku?: string | null;
  is_broadcasting: boolean;
  viewer_count: number;
  camera_source: string;
  current_deal_price: number;
  updated_at?: string;
}

export interface LiveMulticastSettings {
  id?: string;
  is_live: boolean;
  broadcast_title: string;
  stream_url?: string | null;
  facebook_url?: string | null;
  instagram_url?: string | null;
  youtube_url?: string | null;
  tiktok_url?: string | null;
  updated_at?: string;
}

export interface StreamingApiKey {
  id?: string;
  platform: string; // 'tiktok' | 'instagram' | 'facebook' | 'youtube'
  server_url?: string | null;
  stream_key?: string | null;
  api_key?: string | null;
  api_secret?: string | null;
  access_token?: string | null;
  is_connected: boolean;
  updated_at?: string;
}

export class LiveStreamService {
  public static async getBooths(): Promise<LiveBooth[]> {
    const { data, error } = await supabase
      .from('live_booths')
      .select('*')
      .order('id');

    if (error) {
      console.error('Error fetching live booths:', error);
      return [];
    }
    return (data || []).map(b => ({
      ...b,
      current_deal_price: Number(b.current_deal_price || 0)
    }));
  }

  public static async updateBooth(id: string, updates: Partial<LiveBooth>): Promise<LiveBooth> {
    const { data, error } = await supabase
      .from('live_booths')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating live booth:', error);
      throw new Error(error.message);
    }
    return {
      ...data,
      current_deal_price: Number(data.current_deal_price || 0)
    };
  }

  public static async getMulticastSettings(): Promise<LiveMulticastSettings> {
    const { data, error } = await supabase
      .from('live_multicast_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return {
        id: '00000000-0000-0000-0000-000000000001',
        is_live: false,
        broadcast_title: 'Live Showcase'
      };
    }
    return data;
  }

  public static async updateMulticastSettings(updates: Partial<LiveMulticastSettings>): Promise<LiveMulticastSettings> {
    const payload = {
      id: '00000000-0000-0000-0000-000000000001',
      ...updates,
      updated_at: new Date().toISOString()
    };
    const { data, error } = await supabase
      .from('live_multicast_settings')
      .upsert(payload)
      .select()
      .single();

    if (error) {
      console.error('Error updating multicast settings:', error);
      throw new Error(error.message);
    }
    return data;
  }

  public static async getStreamingApiKeys(): Promise<StreamingApiKey[]> {
    const { data, error } = await supabase
      .from('streaming_api_keys')
      .select('*');

    if (error) {
      console.error('Error fetching streaming api keys:', error);
      return [];
    }
    return data || [];
  }

  public static async saveStreamingApiKey(platform: string, keyData: Partial<StreamingApiKey>): Promise<StreamingApiKey> {
    const existing = await supabase
      .from('streaming_api_keys')
      .select('id')
      .eq('platform', platform)
      .maybeSingle();

    const payload: any = {
      platform,
      ...keyData,
      updated_at: new Date().toISOString()
    };
    if (existing.data?.id) {
      payload.id = existing.data.id;
    }

    const { data, error } = await supabase
      .from('streaming_api_keys')
      .upsert(payload)
      .select()
      .single();

    if (error) {
      console.error(`Error saving streaming api key for ${platform}:`, error);
      throw new Error(error.message);
    }
    return data;
  }
}
export default LiveStreamService;
