/**
 * GeoIP Lookup Engine for Vintage Vibes Sentinel & Device Tracking
 * ----------------------------------------------------------------
 * Accurately resolves public IP, Country, Country Code, City, and ISP.
 * Resolves local loopback (127.0.0.1 / ::1) to the host's real public IP and geolocation,
 * and queries ip-api.com + ipwho.is with in-memory caching of verified lookups only.
 */

export interface GeoData {
  ip: string;
  country: string;
  countryCode: string;
  city: string;
  isp: string;
}

const geoCache = new Map<string, { data: GeoData; expiresAt: number }>();
const inFlightLookups = new Map<string, Promise<GeoData>>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

const COUNTRY_NAME_MAP: Record<string, string> = {
  AE: 'United Arab Emirates',
  PK: 'Pakistan',
  SA: 'Saudi Arabia',
  OM: 'Oman',
  QA: 'Qatar',
  KW: 'Kuwait',
  BH: 'Bahrain',
  US: 'United States',
  GB: 'United Kingdom',
  UK: 'United Kingdom',
  IN: 'India',
  CA: 'Canada',
  AU: 'Australia',
  DE: 'Germany',
  FR: 'France',
  CN: 'China',
  SG: 'Singapore',
  MY: 'Malaysia',
  TR: 'Turkey',
  EG: 'Egypt',
  JO: 'Jordan',
  LB: 'Lebanon',
  RU: 'Russia',
  JP: 'Japan',
  AO: 'Angola',
  NL: 'Netherlands',
  IR: 'Iran',
  IQ: 'Iraq',
  AF: 'Afghanistan',
  BD: 'Bangladesh',
  LK: 'Sri Lanka'
};

const regionNames =
  typeof Intl !== 'undefined' && typeof Intl.DisplayNames !== 'undefined'
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null;

export function getCountryNameFromCode(code?: string): string {
  const clean = (code || '').trim().toUpperCase();
  if (!clean || clean.length !== 2) return clean || 'Unknown';
  if (COUNTRY_NAME_MAP[clean]) return COUNTRY_NAME_MAP[clean];
  try {
    const resolved = regionNames?.of(clean);
    if (resolved) return resolved;
  } catch (_) {}
  return clean;
}

export function isLocalOrPrivateIp(ip: string): boolean {
  const cleanIp = (ip || '').trim().replace(/^::ffff:/, '');
  return (
    !cleanIp ||
    cleanIp === '127.0.0.1' ||
    cleanIp === 'localhost' ||
    cleanIp === '::1' ||
    cleanIp.startsWith('192.168.') ||
    cleanIp.startsWith('10.') ||
    cleanIp.startsWith('172.16.') ||
    cleanIp.startsWith('172.17.') ||
    cleanIp.startsWith('172.18.') ||
    cleanIp.startsWith('172.19.') ||
    cleanIp.startsWith('172.2') ||
    cleanIp.startsWith('172.3')
  );
}

async function queryExternalGeoApis(targetIp: string, isLocal: boolean): Promise<GeoData | null> {
  // 1. Primary Provider: ip-api.com (supports auto-detecting caller's public IP when query IP is omitted)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);
    const endpoint = isLocal
      ? 'http://ip-api.com/json/?fields=status,query,country,countryCode,regionName,city,isp,org'
      : `http://ip-api.com/json/${encodeURIComponent(targetIp)}?fields=status,query,country,countryCode,regionName,city,isp,org`;

    const res = await fetch(endpoint, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data: any = await res.json();
      if (data && data.status === 'success' && (data.countryCode || data.country)) {
        const cc = String(data.countryCode || '').toUpperCase() || 'PK';
        const resolvedIp = String(data.query || targetIp || '').trim();
        return {
          ip: resolvedIp || targetIp,
          countryCode: cc,
          country: data.country || getCountryNameFromCode(cc),
          city: data.city || data.regionName || getCountryNameFromCode(cc),
          isp: data.isp || data.org || 'Broadband Network'
        };
      }
    }
  } catch (_) {}

  // 2. Secondary Provider: ipwho.is (HTTPS, no API key required, works for IPv4 & IPv6)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);
    const endpoint = isLocal
      ? 'https://ipwho.is/'
      : `https://ipwho.is/${encodeURIComponent(targetIp)}`;

    const res = await fetch(endpoint, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data: any = await res.json();
      if (data && data.success !== false && (data.country_code || data.country)) {
        const cc = String(data.country_code || '').toUpperCase() || 'PK';
        const resolvedIp = String(data.ip || targetIp || '').trim();
        return {
          ip: resolvedIp || targetIp,
          countryCode: cc,
          country: data.country || getCountryNameFromCode(cc),
          city: data.city || data.region || getCountryNameFromCode(cc),
          isp: data.connection?.isp || data.connection?.org || 'Broadband Network'
        };
      }
    }
  } catch (_) {}

  return null;
}

export async function lookupGeo(ip: string, req?: any): Promise<GeoData> {
  const cleanIp = (ip || '').trim().replace(/^::ffff:/, '');
  const isLocal = isLocalOrPrivateIp(cleanIp);
  const cacheKey = isLocal ? '__LOCAL_HOST_PUBLIC_IP__' : cleanIp;

  // 1. Check verified in-memory cache first
  const cached = geoCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  // 2. Check Cloudflare / Vercel edge headers if BOTH country and city are explicitly present
  const cfCountry = (
    req?.headers?.['cf-ipcountry'] ||
    req?.headers?.['x-vercel-ip-country'] ||
    req?.headers?.['x-country-code'] ||
    ''
  ).toString().trim().toUpperCase();

  const cfCity = (
    req?.headers?.['cf-ipcity'] ||
    req?.headers?.['x-vercel-ip-city'] ||
    req?.headers?.['x-city'] ||
    ''
  ).toString().trim();

  if (!isLocal && cfCountry && cfCountry !== 'XX' && cfCity) {
    const edgeData: GeoData = {
      ip: cleanIp,
      countryCode: cfCountry,
      country: getCountryNameFromCode(cfCountry),
      city: decodeURIComponent(cfCity),
      isp: 'Cloudflare Edge Network'
    };
    geoCache.set(cacheKey, { data: edgeData, expiresAt: Date.now() + CACHE_TTL_MS });
    return edgeData;
  }

  // 3. Deduplicate concurrent lookups for the same IP
  if (inFlightLookups.has(cacheKey)) {
    return inFlightLookups.get(cacheKey)!;
  }

  const lookupPromise = (async (): Promise<GeoData> => {
    try {
      const resolved = await queryExternalGeoApis(cleanIp, isLocal);
      if (resolved) {
        geoCache.set(cacheKey, { data: resolved, expiresAt: Date.now() + CACHE_TTL_MS });
        if (resolved.ip && resolved.ip !== cleanIp) {
          geoCache.set(resolved.ip, { data: resolved, expiresAt: Date.now() + CACHE_TTL_MS });
        }
        return resolved;
      }
    } catch (_) {}

    // 4. Last-resort fallback if external GeoIP services are unreachable (DO NOT cache so next request retries)
    const fallbackCode = (cfCountry && cfCountry !== 'XX') ? cfCountry : 'PK';
    return {
      ip: cleanIp || '127.0.0.1',
      countryCode: fallbackCode,
      country: getCountryNameFromCode(fallbackCode),
      city: cfCity || getCountryNameFromCode(fallbackCode),
      isp: 'Network Provider'
    };
  })().finally(() => {
    inFlightLookups.delete(cacheKey);
  });

  inFlightLookups.set(cacheKey, lookupPromise);
  return lookupPromise;
}
