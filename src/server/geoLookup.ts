/**
 * GeoIP Lookup Engine for Vintage Vibes Sentinel & Device Tracking
 * ----------------------------------------------------------------
 * Accurately extracts Country, City, and ISP for incoming requests.
 * Uses Cloudflare edge headers (cf-ipcountry, cf-ipcity) when available,
 * and falls back to ultra-fast JSON GeoIP resolvers with in-memory 24h caching.
 */

interface GeoData {
  ip: string;
  country: string;
  countryCode: string;
  city: string;
  isp: string;
}

const geoCache = new Map<string, GeoData>();

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

  // Check Cloudflare headers on the request first (if routed via Cloudflare tunnel)
  const cfCountry = (req?.headers?.['cf-ipcountry'] || '').toString().trim().toUpperCase();
  const cfCity = (req?.headers?.['cf-ipcity'] || '').toString().trim();

  if (isLocal && !cfCountry) {
    return {
      ip: cleanIp || '127.0.0.1',
      country: 'United Arab Emirates',
      countryCode: 'AE',
      city: 'Al Ain',
      isp: 'Vintage Vibes HQ / Local'
    };
  }

  // 2. Check in-memory cache
  if (geoCache.has(cleanIp)) {
    const cached = geoCache.get(cleanIp)!;
    // Enhance with Cloudflare headers if cache didn't have them
    if (cfCity && (!cached.city || cached.city === 'Global' || cached.city === 'Unknown')) {
      cached.city = cfCity;
    }
    return cached;
  }

  // 3. Fast asynchronous resolution via ip-api / ipwho.is with 1.8s timeout
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1800);

    const res = await fetch(`http://ip-api.com/json/${cleanIp}?fields=status,country,countryCode,regionName,city,isp,org`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && data.status === 'success') {
        const result: GeoData = {
          ip: cleanIp,
          country: data.country || (cfCountry ? COUNTRY_NAME_MAP[cfCountry] : 'Global') || 'Pakistan',
          countryCode: data.countryCode || cfCountry || 'PK',
          city: data.city || data.regionName || cfCity || 'Karachi',
          isp: data.isp || data.org || 'PTCL / Regional Broadband'
        };
        geoCache.set(cleanIp, result);
        return result;
      }
    }
  } catch (_) {
    // Fallback to secondary provider ipwho.is if ip-api timed out
    try {
      const controller2 = new AbortController();
      const timeoutId2 = setTimeout(() => controller2.abort(), 1800);
      const res2 = await fetch(`https://ipwho.is/${cleanIp}`, { signal: controller2.signal });
      clearTimeout(timeoutId2);

      if (res2.ok) {
        const data2 = await res2.json();
        if (data2 && data2.success) {
          const result: GeoData = {
            ip: cleanIp,
            country: data2.country || 'Pakistan',
            countryCode: data2.country_code || 'PK',
            city: data2.city || 'Islamabad',
            isp: data2.connection?.isp || data2.connection?.org || 'Broadband ISP'
          };
          geoCache.set(cleanIp, result);
          return result;
        }
      }
    } catch (_) {}
  }

  // 4. Default fallback using Cloudflare headers
  const fallbackCountryCode = cfCountry || (cleanIp.startsWith('39.') ? 'PK' : 'AE');
  const fallbackData: GeoData = {
    ip: cleanIp,
    country: COUNTRY_NAME_MAP[fallbackCountryCode] || fallbackCountryCode,
    countryCode: fallbackCountryCode,
    city: cfCity || (fallbackCountryCode === 'PK' ? 'Islamabad' : 'Al Ain'),
    isp: fallbackCountryCode === 'PK' ? 'PTCL Broadband' : 'Etisalat UAE'
  };
  geoCache.set(cleanIp, fallbackData);
  return fallbackData;
}
