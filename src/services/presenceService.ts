/**
 * Presence Service - SQL-backed real-time multi-user online tracking
 * Reports every active terminal / phone session to PostgreSQL user_presences table.
 */

import { DeviceService } from './deviceService.ts';

export interface OnlineUserPresence {
  session_id: string;
  user_id?: string;
  username: string;
  display_name?: string;
  role?: string;
  device_type?: string;
  ip_address?: string;
  city?: string;
  country?: string;
  last_heartbeat: string;
}

export interface PresenceResponse {
  success: boolean;
  onlineCount: number;
  users: OnlineUserPresence[];
}

export const PresenceService = {
  getSessionId(): string {
    const KEY = 'vv_user_presence_session_id';
    try {
      let id = sessionStorage.getItem(KEY);
      if (!id) {
        id = 'sess-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 9);
        sessionStorage.setItem(KEY, id);
      }
      return id;
    } catch {
      return 'sess-temp-' + Date.now();
    }
  },

  async sendHeartbeat(username?: string, displayName?: string, role?: string, userId?: string): Promise<PresenceResponse> {
    const sessionId = this.getSessionId();
    const deviceInfo = DeviceService.detectDeviceInfo();

    let activeUser = username;
    let activeName = displayName;
    let activeRole = role;
    let activeUserId = userId;

    if (!activeUser && typeof localStorage !== 'undefined') {
      try {
        const stored = localStorage.getItem('vintage_erp_logged_user');
        if (stored) {
          const parsed = JSON.parse(stored);
          activeUser = parsed.username || parsed.name;
          activeName = parsed.name || parsed.username;
          activeRole = parsed.role;
          activeUserId = parsed.id;
        }
      } catch {}
    }

    if (!activeUser) {
      activeUser = 'Visitor';
      activeName = 'Storefront Visitor';
      activeRole = 'GUEST';
    }

    const payload = {
      sessionId,
      userId: activeUserId,
      username: activeUser,
      displayName: activeName,
      role: activeRole,
      deviceType: deviceInfo.deviceModel || deviceInfo.deviceType
    };

    try {
      const res = await fetch('/api/presence/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      return {
        success: false,
        onlineCount: 1,
        users: []
      };
    }
  },

  async getOnlineUsers(): Promise<PresenceResponse> {
    try {
      const res = await fetch('/api/presence');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      return {
        success: false,
        onlineCount: 1,
        users: []
      };
    }
  },

  async logout(username?: string): Promise<void> {
    const sessionId = this.getSessionId();
    try {
      await fetch('/api/presence/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, username })
      });
    } catch (_) {}
  }
};
