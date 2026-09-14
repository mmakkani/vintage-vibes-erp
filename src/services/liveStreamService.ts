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

export interface BoothSocialChannel {
  id: string;
  booth_id: string;
  platform: 'tiktok' | 'instagram' | 'facebook' | 'youtube' | string;
  account_username?: string;
  account_password?: string;
  session_cookies?: any[];
  auth_status: 'IDLE' | 'AUTHENTICATING' | 'WAITING_OTP' | 'LOGGED_IN' | 'AUTH_FAILED';
  last_login_at?: string | null;
  otp_required?: boolean;
  proxy_url?: string | null;
  is_active?: boolean;
  stream_status?: 'STANDBY' | 'CONNECTING' | 'LIVE' | 'ERROR';
  metadata?: any;
  created_at?: string;
  updated_at?: string;
}

export class LiveStreamService {
  public static async getBoothSocialChannels(boothId: string): Promise<BoothSocialChannel[]> {
    try {
      const { data, error } = await supabase
        .from('booth_social_channels')
        .select('*')
        .eq('booth_id', boothId)
        .order('platform');

      if (!error && Array.isArray(data) && data.length > 0) {
        return data as BoothSocialChannel[];
      }
    } catch (e) {
      console.warn('Supabase fetch channels note:', e);
    }

    // Fallback through API
    try {
      const res = await fetch(`/api/live/booths/${boothId}/channels`);
      if (res.ok) {
        const json = await res.json();
        return json.channels || [];
      }
    } catch (_) {}

    return [];
  }

  public static async saveBoothSocialChannel(channelData: Partial<BoothSocialChannel>): Promise<BoothSocialChannel> {
    const res = await fetch(`/api/live/booths/${channelData.booth_id}/channels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(channelData)
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to save social channel credentials');
    }
    return data.channel;
  }

  public static async authenticateSocialChannel(
    boothId: string,
    platform: string,
    payload: { username?: string; password?: string; proxyUrl?: string; forceFreshLogin?: boolean } = {}
  ): Promise<{ success: boolean; status: string; requiresOtp?: boolean; message?: string; error?: string }> {
    const res = await fetch(`/api/live/booths/${boothId}/channels/${platform}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return res.json();
  }

  public static async submitChannelOtp(
    boothId: string,
    platform: string,
    otpCode: string
  ): Promise<{ success: boolean; status: string; message?: string; error?: string }> {
    const res = await fetch(`/api/live/booths/${boothId}/channels/${platform}/otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ otpCode })
    });
    return res.json();
  }

  /**
   * Fetch Live Login QR from Railway worker or backend API
   */
  public static async fetchLoginQR(
    boothId: string,
    platform: string,
    fallback = false
  ): Promise<{
    success: boolean;
    qrDataUrl?: string;
    qrRawUrl?: string;
    token?: string;
    expiresInSeconds?: number;
    status?: string;
    error?: string;
    isFallback?: boolean;
  }> {
    console.log(`[Client fetchLoginQR] 🚀 Invoking QR generation for platform: ${platform}, booth: ${boothId}, fallback: ${fallback}`);
    try {
      const query = fallback ? '?fallback=true' : '';
      const res = await fetch(`/api/live/booths/${boothId}/channels/${platform}/qr/generate${query}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fallback })
      });

      const data = await res.json().catch(() => ({ success: false, error: 'Malformed JSON returned from server' }));

      if (!res.ok || !data.success) {
        console.error(`[Client fetchLoginQR] ❌ Server returned failure for ${platform}:`, data.error || res.statusText);
      } else {
        console.log(`[Client fetchLoginQR] ✅ QR generated successfully for ${platform} (image length: ${data.qrDataUrl?.length || 0})`);
      }

      return data;
    } catch (err: any) {
      console.error(`[Client fetchLoginQR] ❌ Network exception for ${platform}:`, err.message || err);
      return { success: false, error: err?.message || 'Network error fetching login QR' };
    }
  }

  public static generateChannelLoginQr = LiveStreamService.fetchLoginQR;

  public static async getChannelLoginQrStatus(
    boothId: string,
    platform: string,
    token?: string
  ): Promise<{
    success: boolean;
    status: 'WAITING_SCAN' | 'SCANNED' | 'LOGGED_IN' | 'EXPIRED' | 'IDLE';
    message?: string;
    secondsRemaining?: number;
    token?: string;
    error?: string;
  }> {
    const query = token ? `?token=${encodeURIComponent(token)}` : '';
    const res = await fetch(`/api/live/booths/${boothId}/channels/${platform}/qr/status${query}`);
    return res.json();
  }

  public static async simulateChannelQrApproval(
    boothId: string,
    platform: string,
    token?: string
  ): Promise<{ success: boolean; status: string; message?: string }> {
    const res = await fetch(`/api/live/booths/${boothId}/channels/${platform}/qr/simulate-approval`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    return res.json();
  }

  public static async startHeadlessStream(
    boothId: string,
    payload: { streamFeedUrl?: string; resolution?: string } = {}
  ): Promise<any> {
    const res = await fetch(`/api/live/booths/${boothId}/stream/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return res.json();
  }

  public static async stopHeadlessStream(boothId: string): Promise<any> {
    const res = await fetch(`/api/live/booths/${boothId}/stream/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    return res.json();
  }

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

  public static async dispatchLiveSaleWhatsApp(payload: {
    to?: string;
    customerPhone?: string;
    message?: string;
    buyerHandle?: string;
    invoiceNo?: string;
    barcode?: string;
    priceAed?: number;
  }): Promise<{ success: boolean; dispatchedViaWorker: boolean; waMeLink?: string; message?: string }> {
    try {
      const res = await fetch('/api/live/whatsapp/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return await res.json();
    } catch (e: any) {
      const cleanPhone = (payload.to || payload.customerPhone || '').replace(/\D/g, '');
      return {
        success: true,
        dispatchedViaWorker: false,
        message: 'Network offline, deep link ready',
        waMeLink: cleanPhone ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(payload.message || '')}` : undefined
      };
    }
  }
}
export default LiveStreamService;
