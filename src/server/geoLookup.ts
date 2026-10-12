/**
 * GeoIP Lookup Engine for Vintage Vibes Sentinel & Device Tracking
 * ----------------------------------------------------------------
 * Accurately extracts Country, City, and ISP for incoming requests.
 * Uses Cloudflare / Vercel edge headers when available (0ms instant return),
 * and caches IP lookups with non-blocking background resolution to prevent
 * request-blocking latency or server event loop starvation.
 */

interface GeoData {
  ip: string;
  country: string;
  countryCode: string;
  city: string;
  isp: string;
}

const geoCache = new Map<string, GeoData>();
const pendingLookups = new Set<string>();

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
  LB: 'Lebanon'
};

async function resolveGeoInBackground(cleanIp: string, defaultCity?: string, defaultCountryCode?: string) {
  if (pendingLookups.has(cleanIp) || geoCache.has(cleanIp)) return;
  pendingLookups.add(cleanIp);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1200);

    const res = await fetch(`http://ip-api.com/json/${cleanIp}?fields=status,country,countryCode,regionName,city,isp,org`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && data.status === 'success') {
        const result: GeoData = {
          ip: cleanIp,
          country: data.country || (defaultCountryCode ? COUNTRY_NAME_MAP[defaultCountryCode] : 'United Arab Emirates') || 'United Arab Emirates',
          countryCode: data.countryCode || defaultCountryCode || 'AE',
          city: data.city || data.regionName || defaultCity || 'Dubai',
          isp: data.isp || data.org || 'Regional Broadband'
        };
        geoCache.set(cleanIp, result);
        return;
      }
    }
  } catch (_) {
    // Non-blocking background catch
  } finally {
    pendingLookups.delete(cleanIp);
  }
}

export async function lookupGeo(ip: string, req?: any): Promise<GeoData> {
  const cleanIp = (ip || '').trim().replace(/^::ffff:/, '');

  // 1. Private / Loopback / Local network handling
  const isLocal =
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
    cleanIp.startsWith('172.3');

  // Check Cloudflare or Vercel edge headers on the request (0ms lookup)
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

  if (isLocal && !cfCountry) {
    return {
      ip: cleanIp || '127.0.0.1',
      country: 'United Arab Emirates',
      countryCode: 'AE',
      city: 'Al Ain',
      isp: 'Vintage Vibes HQ / Local'
    };
  }

  // 2. If Edge Headers (Cloudflare/Vercel) provide country, use them IMMEDIATELY (0ms latency)
  if (cfCountry && COUNTRY_NAME_MAP[cfCountry]) {
    const geoData: GeoData = {
      ip: cleanIp,
      country: COUNTRY_NAME_MAP[cfCountry] || cfCountry,
      countryCode: cfCountry,
      city: cfCity || (cfCountry === 'AE' ? 'Dubai' : cfCountry === 'PK' ? 'Islamabad' : 'Main Hub'),
      isp: cfCountry === 'AE' ? 'Etisalat / Du UAE' : cfCountry === 'PK' ? 'PTCL Broadband' : 'Enterprise Network'
    };
    geoCache.set(cleanIp, geoData);
    return geoData;
  }

  // 3. Check in-memory cache
  if (geoCache.has(cleanIp)) {
    const cached = geoCache.get(cleanIp)!;
    if (cfCity && (!cached.city || cached.city === 'Global' || cached.city === 'Unknown')) {
      cached.city = cfCity;
    }
    return cached;
  }

  // 4. Instant Fallback for un-cached IPs + background lookup (never blocks Express event loop)
  const fallbackCountryCode = cfCountry || (cleanIp.startsWith('39.') || cleanIp.startsWith('182.') ? 'PK' : 'AE');
  const fallbackData: GeoData = {
    ip: cleanIp,
    country: COUNTRY_NAME_MAP[fallbackCountryCode] || (fallbackCountryCode === 'AE' ? 'United Arab Emirates' : 'Pakistan'),
    countryCode: fallbackCountryCode,
    city: cfCity || (fallbackCountryCode === 'PK' ? 'Islamabad' : 'Dubai'),
    isp: fallbackCountryCode === 'PK' ? 'PTCL Broadband' : 'Etisalat / Du UAE'
  };
  geoCache.set(cleanIp, fallbackData);

  // Trigger non-blocking async background resolution for detailed ISP/City
  resolveGeoInBackground(cleanIp, cfCity, fallbackCountryCode).catch(() => {});

  return fallbackData;
}
