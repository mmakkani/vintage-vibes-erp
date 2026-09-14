/**
 * Device Installation & Security Tracking Service
 * Tracks client devices, IP addresses, standalone PWA installs, and enforces per-operator device limits in PostgreSQL.
 */

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
  max_devices_limit: number;
  registered_at?: string;
  last_active_at?: string;
  created_at?: string;
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
      return Array.isArray(data) ? data : (data.devices || []);
    } catch (err) {
      console.error('[DeviceService] Failed to fetch devices:', err);
      return [];
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
  }
};
