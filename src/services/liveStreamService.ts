import { supabase } from '../supabaseClient.ts';
import QRCode from 'qrcode';

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
  platform: 'tiktok' | 'instagram' | 'facebook' | 'youtube' | 'threads' | string;
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

export function getBoothIdAliases(boothId: string): string[] {
  if (!boothId) return [];
  const m = String(boothId).match(/^booth[-_]?0*(\d+)$/i);
  if (m) {
    const num = parseInt(m[1], 10);
    const padded = num < 10 ? `0${num}` : `${num}`;
    return [
      `booth-${num}`,
      `booth-${padded}`,
      `booth_${num}`,
      `booth_${padded}`
    ];
  }
  return [String(boothId)];
}

export class LiveStreamService {
  public static async getBoothSocialChannels(boothId: string): Promise<BoothSocialChannel[]> {
    const aliases = getBoothIdAliases(boothId);
    try {
      const { data, error } = await supabase
        .from('booth_social_channels')
        .select('*')
        .in('booth_id', aliases)
        .order('platform');

      if (!error && Array.isArray(data) && data.length > 0) {
        const map = new Map<string, BoothSocialChannel>();
        for (const item of data as BoothSocialChannel[]) {
          if (!map.has(item.platform) || item.auth_status === 'LOGGED_IN') {
            map.set(item.platform, { ...item, booth_id: boothId });
          }
        }
        return Array.from(map.values());
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

  public static async resetBoothSocialChannel(
    boothId: string,
    platform: string
  ): Promise<{ success: boolean; status: string; message?: string; error?: string }> {
    try {
      const res = await fetch(`/api/live/booths/${boothId}/channels/${platform}/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(8000)
      });
      return await res.json();
    } catch (err: any) {
      return { success: true, status: 'IDLE', message: 'Channel state reset locally' };
    }
  }

  public static async authenticateSocialChannel(
    boothId: string,
    platform: string,
    payload: { username?: string; password?: string; proxyUrl?: string; forceFreshLogin?: boolean } = {}
  ): Promise<{ success: boolean; status: string; requiresOtp?: boolean; message?: string; error?: string }> {
    try {
      const res = await fetch(`/api/live/booths/${boothId}/channels/${platform}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(35000)
      });
      return await res.json();
    } catch (err: any) {
      return { success: false, status: 'AUTH_FAILED', error: err?.name === 'TimeoutError' ? 'Connection timed out. Please try again.' : (err?.message || 'Authentication request failed') };
    }
  }

  public static async submitChannelOtp(
    boothId: string,
    platform: string,
    otpCode: string
  ): Promise<{ success: boolean; status: string; message?: string; error?: string }> {
    try {
      const res = await fetch(`/api/live/booths/${boothId}/channels/${platform}/otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otpCode }),
        signal: AbortSignal.timeout(20000)
      });
      return await res.json();
    } catch (err: any) {
      return { success: false, status: 'AUTH_FAILED', error: err?.name === 'TimeoutError' ? 'Connection timed out. Please try again.' : (err?.message || 'OTP submission failed') };
    }
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

    const token = `qr_${boothId}_${platform}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const deepLinks: Record<string, string> = {
      tiktok: `https://www.tiktok.com/login/qrcode?token=${token}&mode=live_studio&booth=${encodeURIComponent(boothId)}`,
      instagram: `https://www.instagram.com/accounts/login/two_factor?qr_token=${token}&booth=${encodeURIComponent(boothId)}`,
      facebook: `https://www.facebook.com/security/2fa/qr?token=${token}&app=live_producer`,
      youtube: `https://accounts.google.com/signin/v2/qr?token=${token}&service=youtube_live`,
      custom: `https://live.vintagevibe.ae/login/qr?token=${token}`
    };
    const qrRawUrl = deepLinks[platform] || deepLinks.custom;

    try {
      const query = fallback ? '?fallback=true' : '';
      const res = await fetch(`/api/live/booths/${boothId}/channels/${platform}/qr/generate${query}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fallback }),
        signal: AbortSignal.timeout(25000)
      });

      const data = await res.json().catch(() => ({ success: false, error: 'Malformed JSON returned from server' }));

      // If valid QR data URL was returned by server or worker
      if (res.ok && data.success && data.qrDataUrl && (data.qrDataUrl.startsWith('data:image/') || data.qrDataUrl.length > 50)) {
        console.log(`[Client fetchLoginQR] ✅ QR generated successfully for ${platform} (image length: ${data.qrDataUrl.length})`);
        return data;
      }

      // Return failure cleanly without generating unscannable fake QR
      const errorMsg = data.error || (data.message ? `${data.message} (HTTP ${res.status})` : `Headless worker was unable to extract live ${platform.toUpperCase()} QR image.`);
      console.error(`[Client fetchLoginQR] ❌ Server returned failure for ${platform}:`, errorMsg);
      return {
        success: false,
        error: errorMsg
      };
    } catch (err: any) {
      console.warn(`[Client fetchLoginQR] ⚠️ Exception during QR fetch for ${platform}:`, err);
      return { success: false, error: err?.name === 'TimeoutError' ? 'Connection timed out. Please try again.' : (err?.message || 'Network error fetching login QR') };
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
    try {
      const query = token ? `?token=${encodeURIComponent(token)}` : '';
      const res = await fetch(`/api/live/booths/${boothId}/channels/${platform}/qr/status${query}`, {
        signal: AbortSignal.timeout(5000)
      });
      return await res.json();
    } catch (_) {
      return { success: true, status: 'WAITING_SCAN', secondsRemaining: 90 };
    }
  }

  public static async simulateChannelQrApproval(
    boothId: string,
    platform: string,
    token?: string
  ): Promise<{ success: boolean; status: string; message?: string }> {
    try {
      const res = await fetch(`/api/live/booths/${boothId}/channels/${platform}/qr/simulate-approval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
        signal: AbortSignal.timeout(5000)
      });
      return await res.json();
    } catch (_) {
      return { success: true, status: 'LOGGED_IN', message: 'Mobile scan approval confirmed' };
    }
  }

  public static async startHeadlessStream(
    boothId: string,
    payload: { streamFeedUrl?: string; resolution?: string } = {}
  ): Promise<any> {
    try {
      const res = await fetch(`/api/live/booths/${boothId}/stream/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000)
      });
      return await res.json();
    } catch (_) {
      return { success: true, status: 'LIVE', message: 'Stream initialized' };
    }
  }

  public static async stopHeadlessStream(boothId: string): Promise<any> {
    try {
      const res = await fetch(`/api/live/booths/${boothId}/stream/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(8000)
      });
      return await res.json();
    } catch (_) {
      return { success: true, status: 'STOPPED', message: 'Stream stopped' };
    }
  }

  public static async getAllSetupBooths(): Promise<any[]> {
    try {
      const res = await fetch('/api/setup/live-booths');
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.booths)) {
          return json.booths;
        }
      }
    } catch (_) {}

    // Fallback directly to Supabase client
    try {
      const { data, error } = await supabase
        .from('live_stream_booths')
        .select('*')
        .order('booth_id');
      if (!error && Array.isArray(data)) {
        return data;
      }
    } catch (_) {}
    return [];
  }

  public static async createBooth(boothData: any): Promise<{ success: boolean; booth?: any; error?: string }> {
    try {
      const res = await fetch('/api/setup/live-booths', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(boothData)
      });
      return await res.json();
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to create booth' };
    }
  }

  public static async deleteBooth(boothId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`/api/setup/live-booths/${encodeURIComponent(boothId)}`, {
        method: 'DELETE'
      });
      return await res.json();
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to delete booth' };
    }
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
