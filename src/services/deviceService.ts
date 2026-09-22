/**
 * Device Installation & Security Tracking Service
 * Tracks client devices, IP addresses, standalone PWA installs, and enforces per-operator device limits in PostgreSQL.
 */
import { supabase } from '../supabaseClient.ts';
import { applyPagination, buildPaginatedResponse, PaginatedResponse } from '../utils/paginationHelper.ts';

export interface DeviceInstallation {
  id: string;
  device_id: string;
  user_id?: string;
  username?: string;
  ip_address?: string;
  city?: string;
  country?: string;
  device_type: string;
  device_model: string;
  user_agent: string;
  is_standalone: boolean;
  install_status: 'ACTIVE' | 'BLOCKED' | 'PENDING';
  bot_type?: 'HUMAN' | 'VERIFIED_BOT' | 'BAD_BOT';
  block_reason?: string;
  threat_type?: string;
  max_devices_limit: number;
  registered_at?: string;
  last_active_at?: string;
  created_at?: string;
}

export interface SecurityThreatLog {
  id: number;
  ip_address: string;
  country?: string;
  isp_org?: string;
  user_agent: string;
  request_method: string;
  request_url: string;
  headers?: Record<string, any>;
  raw_payload?: string;
  threat_type: string;
  created_at: string;
}

export interface RegisterDeviceResponse {
  success: boolean;
  device?: DeviceInstallation;
  ip?: string;
  city?: string;
  country?: string;
  blocked?: boolean;
  limitReached?: boolean;
  message?: string;
}

export const DeviceService = {
  /**
   * Get or initialize persistent device UUID for this browser/phone
   */
  getDeviceId(): string {
    const STORAGE_KEY = 'vv_device_id';
    try {
      let id = localStorage.getItem(STORAGE_KEY);
      if (!id) {
        // Generate secure client UUID
        id = 'dev-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 10);
        localStorage.setItem(STORAGE_KEY, id);
      }
      return id;
    } catch {
      return 'dev-fallback-' + Date.now();
    }
  },

  /**
   * Detect device hardware, OS, and standalone installation state
   */
  detectDeviceInfo() {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const uaLower = ua.toLowerCase();

    let deviceType = 'Desktop';
    let deviceModel = 'Web Browser';

    const isIOS = /iphone|ipad|ipod/.test(uaLower) ||
      (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isAndroid = /android/.test(uaLower);
    const isWindows = /windows nt/.test(uaLower);
    const isMac = /macintosh|mac os x/.test(uaLower) && !isIOS;
    const isLinux = /linux/.test(uaLower) && !isAndroid;

    if (/iphone/.test(uaLower)) {
      deviceType = 'iPhone';
      const match = ua.match(/iPhone OS ([\d_]+)/);
      const version = match ? match[1].replace(/_/g, '.') : '';
      deviceModel = version ? `Apple iPhone (iOS ${version})` : 'Apple iPhone';
    } else if (/ipad/.test(uaLower) || (isIOS && !/iphone/.test(uaLower))) {
      deviceType = 'iPad';
      deviceModel = 'Apple iPad (iPadOS)';
    } else if (isAndroid) {
      deviceType = 'Android';
      const match = ua.match(/Android ([\d.]+)/);
      const version = match ? match[1] : '';
      deviceModel = version ? `Android Device (v${version})` : 'Android Device';
    } else if (isWindows) {
      deviceType = 'Windows PC';
      deviceModel = 'Windows Desktop/Laptop';
    } else if (isMac) {
      deviceType = 'Mac';
      deviceModel = 'Apple Mac Desktop/MacBook';
    } else if (isLinux) {
      deviceType = 'Linux';
      deviceModel = 'Linux Desktop';
    }

    const isStandalone = typeof window !== 'undefined' && (
      (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches
    );

    return {
      deviceType,
      deviceModel,
      userAgent: ua,
      isStandalone,
      isIOS,
      isAndroid
    };
  },

  /**
   * Register device and update live IP address in PostgreSQL
   */
  async registerDevice(username?: string, userId?: string): Promise<RegisterDeviceResponse> {
    const deviceId = this.getDeviceId();
    const info = this.detectDeviceInfo();

    // If username not provided, try reading from logged operator
    let activeUser = username;
    let activeUserId = userId;
    if (!activeUser && typeof localStorage !== 'undefined') {
      try {
        const stored = localStorage.getItem('vintage_erp_logged_user');
        if (stored) {
          const parsed = JSON.parse(stored);
          activeUser = parsed.username || parsed.name;
          activeUserId = parsed.id;
        }
      } catch {}
    }

    const payload = {
      deviceId,
      userId: activeUserId || 'guest',
      username: activeUser || 'Guest / Visitor',
      deviceType: info.deviceType,
      deviceModel: info.deviceModel,
      userAgent: info.userAgent,
      isStandalone: info.isStandalone
    };

    try {
      const res = await fetch('/api/devices/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        return {
          success: false,
          blocked: res.status === 403 && errData.blocked,
          limitReached: res.status === 403 && errData.limitReached,
          message: errData.error || errData.message || `Server responded with status ${res.status}`
        };
      }

      const data = await res.json();
      return data;
    } catch (err: any) {
      console.warn('[DeviceService] Auto-register notice:', err?.message || err);
      return {
        success: false,
        message: err?.message || 'Network error registering device'
      };
    }
  },

  /**
   * Fetch all registered devices from PostgreSQL (for Admin view)
   */
  async getDevices(): Promise<DeviceInstallation[]> {
    try {
      const res = await fetch('/api/devices');
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      return Array.isArray(data) ? data : (data.devices || data.data || []);
    } catch (err) {
      console.error('[DeviceService] Failed to fetch devices:', err);
      return [];
    }
  },

  /**
   * Fetch paginated devices with stable ordering and tab filtering
   */
  async getDevicesPaginated(options?: {
    page?: number;
    pageSize?: number;
    filterTab?: string;
    search?: string;
  }): Promise<PaginatedResponse<DeviceInstallation>> {
    const page = Math.max(1, options?.page || 1);
    const pageSize = Math.max(1, options?.pageSize || 10);
    const filterTab = options?.filterTab || 'all';
    const search = options?.search?.trim() || '';

    try {
      let query = supabase
        .from('device_installations')
        .select('*', { count: 'exact' });

      if (filterTab === 'operators') {
        query = query.neq('bot_type', 'BAD_BOT').neq('username', 'Guest / Visitor').not('username', 'ilike', '[BAD BOT]%');
      } else if (filterTab === 'bad_bots') {
        query = query.or('bot_type.eq.BAD_BOT,install_status.eq.BLOCKED');
      } else if (filterTab === 'verified_bots') {
        query = query.eq('bot_type', 'VERIFIED_BOT');
      } else if (filterTab === 'visitors') {
        query = query.or('username.eq.Guest / Visitor,username.is.null').neq('bot_type', 'BAD_BOT').neq('bot_type', 'VERIFIED_BOT');
      }

      if (search) {
        query = query.or(`ip_address.ilike.%${search}%,username.ilike.%${search}%,device_model.ilike.%${search}%,device_type.ilike.%${search}%`);
      }

      query = applyPagination(query, page, pageSize, {
        orderBy: 'last_active_at',
        ascending: false,
        secondaryOrderBy: 'id',
        secondaryAscending: false
      });

      const { data, count, error } = await query;
      if (!error && Array.isArray(data)) {
        return buildPaginatedResponse(data, count || 0, page, pageSize);
      }
      if (error) {
        console.warn('[DeviceService] Supabase getDevicesPaginated notice:', error.message);
      }
    } catch (err: any) {
      console.warn('[DeviceService] Supabase getDevicesPaginated exception:', err?.message || err);
    }

    // Fallback to /api/devices with query params
    try {
      const q = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        filterTab,
        search
      });
      const res = await fetch(`/api/devices?${q.toString()}`);
      if (res.ok) {
        const json = await res.json();
        if (json && Array.isArray(json.data)) {
          return buildPaginatedResponse(json.data, json.total ?? json.data.length, json.page || page, json.pageSize || pageSize);
        } else if (Array.isArray(json)) {
          const from = (page - 1) * pageSize;
          return buildPaginatedResponse(json.slice(from, from + pageSize), json.length, page, pageSize);
        }
      }
    } catch (e: any) {
      console.error('[DeviceService] Fallback getDevicesPaginated error:', e?.message || e);
    }

    return buildPaginatedResponse([], 0, page, pageSize);
  },

  /**
   * Fetch aggregate summary counts for KPI cards across all monitored sessions
   */
  async getDeviceCounts(): Promise<{
    total: number;
    staff: number;
    badBots: number;
    verifiedBots: number;
    visitors: number;
  }> {
    try {
      const [allRes, staffRes, badRes, verifiedRes, visitorRes] = await Promise.all([
        supabase.from('device_installations').select('id', { count: 'exact', head: true }),
        supabase.from('device_installations').select('id', { count: 'exact', head: true }).neq('bot_type', 'BAD_BOT').neq('username', 'Guest / Visitor').not('username', 'ilike', '[BAD BOT]%'),
        supabase.from('device_installations').select('id', { count: 'exact', head: true }).or('bot_type.eq.BAD_BOT,install_status.eq.BLOCKED'),
        supabase.from('device_installations').select('id', { count: 'exact', head: true }).eq('bot_type', 'VERIFIED_BOT'),
        supabase.from('device_installations').select('id', { count: 'exact', head: true }).or('username.eq.Guest / Visitor,username.is.null').neq('bot_type', 'BAD_BOT').neq('bot_type', 'VERIFIED_BOT')
      ]);

      return {
        total: allRes.count || 0,
        staff: staffRes.count || 0,
        badBots: badRes.count || 0,
        verifiedBots: verifiedRes.count || 0,
        visitors: visitorRes.count || 0
      };
    } catch (err) {
      console.warn('[DeviceService] getDeviceCounts fallback:', err);
      return { total: 0, staff: 0, badBots: 0, verifiedBots: 0, visitors: 0 };
    }
  },

  /**
   * Admin: Block or Unblock a device
   */
  async toggleDeviceStatus(deviceId: string, status: 'ACTIVE' | 'BLOCKED'): Promise<boolean> {
    try {
      const res = await fetch('/api/devices/toggle-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, status })
      });
      return res.ok;
    } catch (err) {
      console.error('[DeviceService] Failed to toggle device status:', err);
      return false;
    }
  },

  /**
   * Admin: Update max allowed devices limit for an operator/device
   */
  async updateDeviceLimit(deviceId: string, maxLimit: number): Promise<boolean> {
    try {
      const res = await fetch('/api/devices/update-limit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, maxLimit })
      });
      return res.ok;
    } catch (err) {
      console.error('[DeviceService] Failed to update device limit:', err);
      return false;
    }
  },

  /**
   * Admin: Remove a registered device
   */
  async deleteDevice(deviceId: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/devices/${encodeURIComponent(deviceId)}`, {
        method: 'DELETE'
      });
      return res.ok;
    } catch (err) {
      console.error('[DeviceService] Failed to delete device:', err);
      return false;
    }
  },

  /**
   * Admin: Fetch forensic security threat logs from PostgreSQL
   */
  async getThreatLogs(ip?: string): Promise<SecurityThreatLog[]> {
    try {
      const query = ip ? `?ip=${encodeURIComponent(ip)}` : '';
      const res = await fetch(`/api/devices/threat-logs${query}`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      return Array.isArray(data) ? data : (data.logs || []);
    } catch (err) {
      console.error('[DeviceService] Failed to fetch threat logs:', err);
      return [];
    }
  }
};
