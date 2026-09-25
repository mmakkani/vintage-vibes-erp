import { useEffect } from 'react';
import { supabase } from '../supabaseClient.ts';

interface GeoLocationData {
  ip: string;
  country: string;
  city: string;
}

interface DeviceFingerprint {
  deviceType: 'Mobile' | 'Desktop' | 'Tablet';
  os: string;
  browser: string;
}

const VISITOR_ID_KEY = 'vv_storefront_visitor_id';

/**
 * Validates a standard UUID format
 */
function isValidUuid(uuid: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid);
}

/**
 * Retrieves existing persistent visitor_id from localStorage or generates a new RFC4122 v4 UUID.
 * Never requests or exposes private user information.
 */
function getOrCreateVisitorId(): string {
  try {
    let id = localStorage.getItem(VISITOR_ID_KEY);
    if (!id || !isValidUuid(id)) {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        id = crypto.randomUUID();
      } else {
        id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
          const r = (Math.random() * 16) | 0;
          const v = c === 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
      }
      localStorage.setItem(VISITOR_ID_KEY, id);
    }
    return id;
  } catch (_) {
    // Graceful fallback if third-party storage is restricted
    return '00000000-0000-4000-8000-000000000000';
  }
}

/**
 * Parses navigator.userAgent within strict browser sandbox boundaries.
 * Strictly avoids accessing personal device names or hardware identifiers.
 */
function getDeviceFingerprint(): DeviceFingerprint {
  if (typeof navigator === 'undefined') {
    return { deviceType: 'Desktop', os: 'Unknown', browser: 'Unknown' };
  }

  const ua = navigator.userAgent || '';

  // 1. Device Type
  let deviceType: 'Mobile' | 'Desktop' | 'Tablet' = 'Desktop';
  const isTablet = /(ipad|tablet|(android(?!.*mobile))|(windows(?!.*phone)(.*touch))|kindle|playbook|silk)/i.test(ua);
  const isMobile = /(mobile|iphone|ipod|blackberry|iemobile|opera mini|webos)/i.test(ua);

  if (isTablet) {
    deviceType = 'Tablet';
  } else if (isMobile) {
    deviceType = 'Mobile';
  }

  // 2. Operating System
  let os = 'Unknown';
  if (/windows/i.test(ua)) os = 'Windows';
  else if (/macintosh|mac os x/i.test(ua)) os = 'macOS';
  else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/linux/i.test(ua)) os = 'Linux';
  else if (/cros/i.test(ua)) os = 'ChromeOS';

  // 3. Browser
  let browser = 'Unknown';
  if (/edg/i.test(ua)) browser = 'Edge';
  else if (/opr|opera/i.test(ua)) browser = 'Opera';
  else if (/chrome|crios/i.test(ua)) browser = 'Chrome';
  else if (/firefox|fxios/i.test(ua)) browser = 'Firefox';
  else if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) browser = 'Safari';
  else if (/msie|trident/i.test(ua)) browser = 'Internet Explorer';

  return { deviceType, os, browser };
}

/**
 * Fetches public IP and Geo-location silently using resilient public endpoints.
 * Automatically times out after 3.5s to prevent blocking.
 */
async function fetchGeoLocation(): Promise<any> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3500);
  try {
    const res = await fetch('https://ipwho.is/', { signal: controller.signal, headers: { Accept: 'application/json' } });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      if (data.success) return { ip: data.ip || 'Unknown', country: data.country || 'Unknown', city: data.city || 'Unknown' };
    }
  } catch (_) {}
  try {
    const resFallback = await fetch('https://freeipapi.com/api/json', { headers: { Accept: 'application/json' } });
    if (resFallback.ok) {
      const data = await resFallback.json();
      return { ip: data.ipAddress || 'Unknown', country: data.countryName || 'Unknown', city: data.cityName || 'Unknown' };
    }
  } catch (_) {}
  return { ip: 'Unknown', country: 'Unknown', city: 'Unknown' };
}

/**
 * Custom React Hook: useStorefrontAnalytics
 *
 * Silently records storefront traffic sessions to Supabase `storefront_analytics`.
 * Enforces DDoS protection via sessionStorage lock to ensure only 1 write per session / page load.
 */
export function useStorefrontAnalytics(): void {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const pagePath = window.location.pathname || '/';
    const sessionLockKey = `vv_analytics_locked_${pagePath}`;

    // DDoS Protection (Session Lock): Only track once per browser session per page
    try {
      if (sessionStorage.getItem(sessionLockKey) === 'true') {
        return;
      }
      // Immediately set lock to prevent race conditions during React render passes
      sessionStorage.setItem(sessionLockKey, 'true');
    } catch (_) {
      // Continue if sessionStorage access is blocked
    }

    // Schedule execution in background idle time so storefront UI rendering is 100% unblocked
    const executeTracking = async () => {
      try {
        const visitorId = getOrCreateVisitorId();
        const { deviceType, os, browser } = getDeviceFingerprint();
        const { ip, country, city } = await fetchGeoLocation();

        // Silent insert into Supabase
        await supabase.from('storefront_analytics').insert({
          visitor_id: visitorId,
          ip_address: ip,
          country: country,
          city: city,
          device_type: deviceType,
          os: os,
          browser: browser,
          page_visited: pagePath,
          created_at: new Date().toISOString()
        });
      } catch (err) {
        // Completely silent: tracking failure MUST NOT degrade storefront UX
      }
    };

    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(() => {
        executeTracking();
      }, { timeout: 2000 });
    } else {
      setTimeout(executeTracking, 1000);
    }
  }, []);
}
