import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export interface StoredNativePushToken {
  token: string;
  platform: 'android' | 'ios';
  deviceName?: string;
  updatedAt: string;
}

interface FirebaseServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

let nativeTokensCache: Record<string, StoredNativePushToken[]> | null = null;
let cachedOAuthToken: { accessToken: string; expiresAtMs: number; clientEmail: string } | null = null;

function getNativeTokensPath(): string {
  return path.join(process.cwd(), '.data', 'vv_native_push_tokens.json');
}

function loadNativeTokens(): Record<string, StoredNativePushToken[]> {
  if (nativeTokensCache) return nativeTokensCache;
  try {
    const p = getNativeTokensPath();
    if (fs.existsSync(p)) {
      const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        nativeTokensCache = parsed;
        return nativeTokensCache!;
      }
    }
  } catch (_) {}
  nativeTokensCache = {};
  return nativeTokensCache;
}

function saveNativeTokens(): void {
  try {
    const store = loadNativeTokens();
    const p = getNativeTokensPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(store, null, 2), 'utf8');
  } catch (_) {}
}

export function saveNativePushToken(
  ownerKey: string,
  token: string,
  platform: 'android' | 'ios' = 'android',
  deviceName?: string
): boolean {
  const cleanOwner = String(ownerKey || '').trim().toLowerCase();
  const cleanToken = String(token || '').trim();
  const cleanPlatform = platform === 'ios' ? 'ios' : 'android';
  if (!cleanOwner || cleanToken.length < 20 || cleanToken.length > 4096) return false;

  const store = loadNativeTokens();
  const list = Array.isArray(store[cleanOwner]) ? store[cleanOwner] : [];
  const nextEntry: StoredNativePushToken = {
    token: cleanToken,
    platform: cleanPlatform,
    deviceName: deviceName ? String(deviceName).replace(/[<>]/g, '').trim().slice(0, 80) : undefined,
    updatedAt: new Date().toISOString()
  };
  const filtered = list.filter((x) => x.token !== cleanToken).slice(-7);
  filtered.push(nextEntry);
  store[cleanOwner] = filtered;
  saveNativeTokens();
  return true;
}

export function removeNativePushToken(ownerKey: string, token: string): void {
  const cleanOwner = String(ownerKey || '').trim().toLowerCase();
  const cleanToken = String(token || '').trim();
  if (!cleanOwner || !cleanToken) return;
  const store = loadNativeTokens();
  const list = store[cleanOwner];
  if (!Array.isArray(list)) return;
  const filtered = list.filter((x) => x.token !== cleanToken);
  if (filtered.length === 0) {
    delete store[cleanOwner];
  } else {
    store[cleanOwner] = filtered;
  }
  saveNativeTokens();
}

export function clearOwnerNativePushTokens(ownerKey: string): void {
  const cleanOwner = String(ownerKey || '').trim().toLowerCase();
  if (!cleanOwner) return;
  const store = loadNativeTokens();
  if (store[cleanOwner]) {
    delete store[cleanOwner];
    saveNativeTokens();
  }
}

export function getOwnerNativePushTokensMeta(ownerKey: string): {
  count: number;
  platforms: Array<'android' | 'ios'>;
  devices: Array<{ host: string; ua: string; updatedAt: string }>;
} {
  const cleanOwner = String(ownerKey || '').trim().toLowerCase();
  const store = loadNativeTokens();
  const list = Array.isArray(store[cleanOwner]) ? store[cleanOwner] : [];
  const devices = list.map((t) => ({
    host: `fcm-${t.platform}`,
    ua: t.deviceName || (t.platform === 'ios' ? 'VV Connect iOS App' : 'VV Connect Android App'),
    updatedAt: String(t.updatedAt || '')
  }));
  return {
    count: devices.length,
    platforms: Array.from(new Set(list.map((t) => t.platform))),
    devices
  };
}

function loadFirebaseServiceAccount(): FirebaseServiceAccount | null {
  try {
    const rawEnv = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
    if (rawEnv) {
      const parsed = JSON.parse(rawEnv);
      if (parsed?.project_id && parsed?.client_email && parsed?.private_key) {
        return {
          project_id: String(parsed.project_id),
          client_email: String(parsed.client_email),
          private_key: String(parsed.private_key).replace(/\\n/g, '\n')
        };
      }
    }
  } catch (_) {}

  const candidatePaths = [
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
    path.join(process.cwd(), '.data', 'firebase_service_account.json')
  ].filter(Boolean) as string[];

  for (const p of candidatePaths) {
    try {
      if (fs.existsSync(p)) {
        const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (parsed?.project_id && parsed?.client_email && parsed?.private_key) {
          return {
            project_id: String(parsed.project_id),
            client_email: String(parsed.client_email),
            private_key: String(parsed.private_key).replace(/\\n/g, '\n')
          };
        }
      }
    } catch (_) {}
  }
  return null;
}

export function isFcmConfigured(): boolean {
  return Boolean(loadFirebaseServiceAccount());
}

export function getFcmStatusInfo(): { fcmConfigured: boolean; projectId?: string } {
  const sa = loadFirebaseServiceAccount();
  if (!sa) return { fcmConfigured: false };
  return { fcmConfigured: true, projectId: sa.project_id };
}

async function getFirebaseAccessToken(sa: FirebaseServiceAccount): Promise<string> {
  const nowMs = Date.now();
  if (
    cachedOAuthToken &&
    cachedOAuthToken.clientEmail === sa.client_email &&
    cachedOAuthToken.expiresAtMs - nowMs > 120000
  ) {
    return cachedOAuthToken.accessToken;
  }

  const iat = Math.floor(nowMs / 1000);
  const exp = iat + 3600;
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const claim = Buffer.from(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat,
      exp
    })
  ).toString('base64url');
  const signingInput = `${header}.${claim}`;
  const sig = crypto.sign('RSA-SHA256', Buffer.from(signingInput), sa.private_key).toString('base64url');
  const assertion = `${signingInput}.${sig}`;

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion
  }).toString();

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(8000)
  });
  const json: any = await resp.json().catch(() => ({}));
  if (!resp.ok || !json?.access_token) {
    throw new Error(json?.error_description || json?.error || `OAuth HTTP ${resp.status}`);
  }
  const expiresInSec = Math.max(300, Number(json.expires_in || 3600));
  cachedOAuthToken = {
    accessToken: String(json.access_token),
    expiresAtMs: nowMs + expiresInSec * 1000,
    clientEmail: sa.client_email
  };
  return cachedOAuthToken.accessToken;
}

export async function sendFcmToOwner(
  ownerKey: string,
  data: Record<string, any>,
  opts?: { ttl?: number; urgency?: 'very-low' | 'low' | 'normal' | 'high'; topic?: string }
): Promise<{ sent: number; failed: number; tokenCount: number; lastStatus?: number; lastError?: string }> {
  const cleanOwner = String(ownerKey || '').trim().toLowerCase();
  const store = loadNativeTokens();
  const entries = Array.isArray(store[cleanOwner]) ? [...store[cleanOwner]] : [];
  if (entries.length === 0) {
    return { sent: 0, failed: 0, tokenCount: 0 };
  }

  const sa = loadFirebaseServiceAccount();
  if (!sa) {
    return { sent: 0, failed: 0, tokenCount: entries.length, lastError: 'FCM_SERVICE_ACCOUNT_NOT_CONFIGURED' };
  }

  let accessToken = '';
  try {
    accessToken = await getFirebaseAccessToken(sa);
  } catch (err: any) {
    return {
      sent: 0,
      failed: entries.length,
      tokenCount: entries.length,
      lastError: String(err?.message || 'FCM_OAUTH_FAILED').slice(0, 140)
    };
  }

  const kind = String(data?.kind || 'chat');
  const isCall = kind === 'call' || kind === 'group_call';
  const title = String(data?.title || (isCall ? 'Incoming Call' : 'Vintage Vibes Connect'));
  const body = String(data?.body || (isCall ? 'Tap to answer live' : 'New message received'));
  const ttlSec = Math.max(0, Math.min(86400, Number(opts?.ttl ?? 300)));

  const stringData: Record<string, string> = {};
  for (const [k, v] of Object.entries(data || {})) {
    if (v !== undefined && v !== null) stringData[String(k)] = String(v);
  }
  if (!stringData.kind) stringData.kind = kind;
  if (!stringData.title) stringData.title = title;
  if (!stringData.body) stringData.body = body;

  let sent = 0;
  let failed = 0;
  let lastStatus: number | undefined;
  let lastError: string | undefined;

  await Promise.all(
    entries.map(async (entry) => {
      try {
        const message: Record<string, any> = {
          token: entry.token,
          data: stringData,
          android: {
            priority: 'HIGH',
            ttl: `${ttlSec}s`
          },
          apns: {
            headers: { 'apns-priority': '10' },
            payload: {
              aps: {
                alert: { title, body },
                sound: 'default',
                'content-available': 1
              }
            }
          }
        };
        // For non-call chats also attach top-level notification; for calls on Android use data-only HIGH priority
        // so VVFirebaseMessagingService.onMessageReceived() always runs even when screen is off or app killed.
        if (!isCall || entry.platform === 'ios') {
          message.notification = { title, body };
        }

        const resp = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ message }),
          signal: AbortSignal.timeout(8000)
        });
        lastStatus = resp.status;
        if (resp.ok) {
          sent += 1;
        } else {
          failed += 1;
          const errTxt = (await resp.text()).slice(0, 220);
          lastError = errTxt ? `FCM ${resp.status}: ${errTxt}` : `FCM ${resp.status}`;
          console.warn('[FCM] send failed', { owner: cleanOwner, platform: entry.platform, status: resp.status, err: lastError });
          if (resp.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/i.test(errTxt)) {
            removeNativePushToken(cleanOwner, entry.token);
          }
        }
      } catch (e: any) {
        failed += 1;
        lastError = String(e?.message || 'FCM_FETCH_ERROR').slice(0, 120);
        console.warn('[FCM] error', { owner: cleanOwner, platform: entry.platform, err: lastError });
      }
    })
  );

  return { sent, failed, tokenCount: entries.length, lastStatus, lastError };
}
