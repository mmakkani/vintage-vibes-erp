import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { baileysManager } from '../marketing/baileys.service.ts';
import { getOwnerNativePushTokensMeta, sendFcmToOwner } from './fcmNativeService.ts';

interface StoredPushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent?: string;
  updatedAt: string;
}

interface VapidKeyPair {
  publicKeyB64Url: string;
  privateKeyPem: string;
}

let vapidKeysCache: VapidKeyPair | null = null;
let pushSubsCache: Record<string, StoredPushSubscription[]> | null = null;
const waCallAlertCooldowns = new Map<string, number>();

function getVapidKeysPath(): string {
  return path.join(process.cwd(), '.data', 'vapid_keys.json');
}

function getPushSubsPath(): string {
  return path.join(process.cwd(), '.data', 'vv_push_subscriptions.json');
}

export function loadOrCreateVapidKeys(): VapidKeyPair {
  if (vapidKeysCache) return vapidKeysCache;
  const p = getVapidKeysPath();
  try {
    if (fs.existsSync(p)) {
      const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (parsed?.publicKeyB64Url && parsed?.privateKeyPem) {
        vapidKeysCache = {
          publicKeyB64Url: String(parsed.publicKeyB64Url),
          privateKeyPem: String(parsed.privateKeyPem)
        };
        return vapidKeysCache;
      }
    }
  } catch (_) {}

  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string };
  const xBuf = Buffer.from(jwk.x, 'base64url');
  const yBuf = Buffer.from(jwk.y, 'base64url');
  const uncompressedPub = Buffer.concat([Buffer.from([0x04]), xBuf, yBuf]);
  const generated: VapidKeyPair = {
    publicKeyB64Url: uncompressedPub.toString('base64url'),
    privateKeyPem: String(privateKey.export({ type: 'pkcs8', format: 'pem' }))
  };
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(generated, null, 2), 'utf8');
  } catch (_) {}
  vapidKeysCache = generated;
  return generated;
}

export function getVapidPublicKey(): string {
  return loadOrCreateVapidKeys().publicKeyB64Url;
}

function loadPushSubscriptions(): Record<string, StoredPushSubscription[]> {
  if (pushSubsCache) return pushSubsCache;
  try {
    const p = getPushSubsPath();
    if (fs.existsSync(p)) {
      const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        pushSubsCache = parsed;
        return pushSubsCache!;
      }
    }
  } catch (_) {}
  pushSubsCache = {};
  return pushSubsCache;
}

function savePushSubscriptions() {
  try {
    const store = loadPushSubscriptions();
    const p = getPushSubsPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(store, null, 2), 'utf8');
  } catch (_) {}
}

export function savePushSubscription(ownerKey: string, sub: any, userAgent?: string): boolean {
  const cleanOwner = String(ownerKey || '').trim().toLowerCase();
  const endpoint = String(sub?.endpoint || '').trim();
  const p256dh = String(sub?.keys?.p256dh || '').trim();
  const auth = String(sub?.keys?.auth || '').trim();
  if (!cleanOwner || !endpoint.startsWith('https://')) return false;

  const clientPub = Buffer.from(p256dh, 'base64url');
  const authBuf = Buffer.from(auth, 'base64url');
  if (clientPub.length !== 65 || clientPub[0] !== 0x04 || authBuf.length !== 16) {
    return false;
  }

  const store = loadPushSubscriptions();
  const list = Array.isArray(store[cleanOwner]) ? store[cleanOwner] : [];
  const nextEntry: StoredPushSubscription = {
    endpoint,
    keys: { p256dh, auth },
    userAgent: userAgent ? String(userAgent).slice(0, 120) : undefined,
    updatedAt: new Date().toISOString()
  };
  const filtered = list.filter((x) => x.endpoint !== endpoint).slice(-7);
  filtered.push(nextEntry);
  store[cleanOwner] = filtered;
  savePushSubscriptions();
  return true;
}

export function removePushSubscription(ownerKey: string, endpoint: string): void {
  const cleanOwner = String(ownerKey || '').trim().toLowerCase();
  const store = loadPushSubscriptions();
  const list = store[cleanOwner];
  if (!Array.isArray(list)) return;
  const filtered = list.filter((x) => x.endpoint !== endpoint);
  if (filtered.length === 0) {
    delete store[cleanOwner];
  } else {
    store[cleanOwner] = filtered;
  }
  savePushSubscriptions();
}

export function clearOwnerPushSubscriptions(ownerKey: string): void {
  const cleanOwner = String(ownerKey || '').trim().toLowerCase();
  if (!cleanOwner) return;
  const store = loadPushSubscriptions();
  if (store[cleanOwner]) {
    delete store[cleanOwner];
    savePushSubscriptions();
  }
}

export function getOwnerPushSubscriptionCount(ownerKey: string): number {
  const cleanOwner = String(ownerKey || '').trim().toLowerCase();
  const store = loadPushSubscriptions();
  return Array.isArray(store[cleanOwner]) ? store[cleanOwner].length : 0;
}

export function getOwnerPushSubscriptionsMeta(ownerKey: string): {
  count: number;
  webCount: number;
  nativeCount: number;
  nativePlatforms: Array<'android' | 'ios'>;
  hosts: string[];
  devices: Array<{ host: string; ua: string; updatedAt: string }>;
} {
  const cleanOwner = String(ownerKey || '').trim().toLowerCase();
  const store = loadPushSubscriptions();
  const list = Array.isArray(store[cleanOwner]) ? store[cleanOwner] : [];
  const webDevices = list.map((s) => {
    let host = 'unknown';
    try { host = new URL(s.endpoint).host; } catch (_) {}
    return {
      host,
      ua: String(s.userAgent || '').slice(0, 80),
      updatedAt: String(s.updatedAt || '')
    };
  });
  const nativeMeta = getOwnerNativePushTokensMeta(cleanOwner);
  const allDevices = [...nativeMeta.devices, ...webDevices];
  return {
    count: allDevices.length,
    webCount: webDevices.length,
    nativeCount: nativeMeta.count,
    nativePlatforms: nativeMeta.platforms,
    hosts: Array.from(new Set(allDevices.map((d) => d.host))),
    devices: allDevices
  };
}

export function encryptWebPushPayload(
  p256dhB64Url: string,
  authB64Url: string,
  payloadJson: string
): Buffer {
  const clientPub = Buffer.from(p256dhB64Url, 'base64url');
  const authSecret = Buffer.from(authB64Url, 'base64url');
  if (clientPub.length !== 65 || clientPub[0] !== 0x04) {
    throw new Error('Invalid client p256dh public key');
  }
  if (authSecret.length !== 16) {
    throw new Error('Invalid client auth secret');
  }

  const ecdh = crypto.createECDH('prime256v1');
  const asPub = ecdh.generateKeys();
  const sharedSecret = ecdh.computeSecret(clientPub);

  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0', 'utf8'), clientPub, asPub]);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', sharedSecret, authSecret, keyInfo, 32));

  const salt = crypto.randomBytes(16);
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0', 'utf8'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0', 'utf8'), 12));

  const padded = Buffer.concat([Buffer.from(payloadJson, 'utf8'), Buffer.from([0x02])]);
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const encrypted = Buffer.concat([cipher.update(padded), cipher.final(), cipher.getAuthTag()]);

  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096, 0);
  const idlen = Buffer.from([asPub.length]);
  return Buffer.concat([salt, rs, idlen, asPub, encrypted]);
}

export function buildVapidAuthHeader(endpoint: string): string {
  const keys = loadOrCreateVapidKeys();
  const origin = new URL(endpoint).origin;
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;
  const hdr = Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ aud: origin, exp, sub: 'mailto:concierge@vintagevibesgk.com' })).toString('base64url');
  const signingInput = `${hdr}.${body}`;
  const sig = crypto
    .sign('sha256', Buffer.from(signingInput), {
      key: keys.privateKeyPem,
      dsaEncoding: 'ieee-p1363'
    })
    .toString('base64url');
  return `vapid t=${signingInput}.${sig}, k=${keys.publicKeyB64Url}`;
}

export async function sendWebPushToOwner(
  ownerKey: string,
  data: Record<string, any>,
  opts?: { ttl?: number; urgency?: 'very-low' | 'low' | 'normal' | 'high'; topic?: string }
): Promise<{ sent: number; failed: number; subscriptionCount: number; lastStatus?: number; lastError?: string }> {
  const cleanOwner = String(ownerKey || '').trim().toLowerCase();
  const store = loadPushSubscriptions();
  const subs = Array.isArray(store[cleanOwner]) ? [...store[cleanOwner]] : [];
  const jsonStr = JSON.stringify(data || {});
  const ttl = Math.max(0, Math.min(86400, Number(opts?.ttl ?? 300)));
  const urgency = opts?.urgency || 'high';
  let sent = 0;
  let failed = 0;
  let lastStatus: number | undefined;
  let lastError: string | undefined;

  const webPushPromise = Promise.all(
    subs.map(async (sub) => {
      let epHost = 'unknown';
      try { epHost = new URL(sub.endpoint).host; } catch (_) {}
      try {
        const bodyBuf = encryptWebPushPayload(sub.keys.p256dh, sub.keys.auth, jsonStr);
        const authHdr = buildVapidAuthHeader(sub.endpoint);
        const safeTopic = opts?.topic ? String(opts.topic).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) : '';
        const headers: Record<string, string> = {
          Authorization: authHdr,
          'Content-Type': 'application/octet-stream',
          'Content-Encoding': 'aes128gcm',
          'Content-Length': String(bodyBuf.length),
          TTL: String(ttl),
          Urgency: urgency
        };
        if (safeTopic) headers.Topic = safeTopic;

        const resp = await fetch(sub.endpoint, {
          method: 'POST',
          headers,
          body: new Uint8Array(bodyBuf),
          signal: AbortSignal.timeout(8000)
        });
        lastStatus = resp.status;
        if (resp.status === 200 || resp.status === 201 || resp.status === 202) {
          sent += 1;
        } else {
          failed += 1;
          let errTxt = '';
          try {
            errTxt = (await resp.text()).slice(0, 140);
            lastError = errTxt ? `HTTP ${resp.status}: ${errTxt}` : `HTTP ${resp.status}`;
          } catch (_) {
            lastError = `HTTP ${resp.status}`;
          }
          console.warn('[WebPush] failed', { owner: cleanOwner, host: epHost, status: resp.status, err: lastError });
          if (
            resp.status === 404 ||
            resp.status === 410 ||
            (resp.status === 403 && /VapidPkHashMismatch|BadJwtToken|InvalidRegistration/i.test(errTxt))
          ) {
            removePushSubscription(cleanOwner, sub.endpoint);
          }
        }
      } catch (e: any) {
        failed += 1;
        lastError = String(e?.message || 'FETCH_ERROR').slice(0, 120);
        console.warn('[WebPush] error', { owner: cleanOwner, host: epHost, err: lastError });
      }
    })
  );

  const [, fcmRes] = await Promise.all([webPushPromise, sendFcmToOwner(cleanOwner, data, opts)]);
  sent += fcmRes.sent;
  failed += fcmRes.failed;
  const totalCount = subs.length + fcmRes.tokenCount;
  if (!lastError && fcmRes.lastError) lastError = fcmRes.lastError;
  if (lastStatus === undefined && fcmRes.lastStatus !== undefined) lastStatus = fcmRes.lastStatus;

  if (totalCount === 0) {
    return { sent: 0, failed: 0, subscriptionCount: 0, lastError: 'NO_SUBSCRIPTIONS' };
  }

  return { sent, failed, subscriptionCount: totalCount, lastStatus, lastError };
}

export async function sendOptionalWhatsAppCallAlert(
  phoneDigits: string,
  callerName: string,
  mode: 'audio' | 'video',
  answerUrl: string
): Promise<boolean> {
  const cleanDigits = String(phoneDigits || '').replace(/\D/g, '');
  if (cleanDigits.length < 7) return false;
  const now = Date.now();
  const lastAt = waCallAlertCooldowns.get(cleanDigits) || 0;
  if (now - lastAt < 20000) return false;
  waCallAlertCooldowns.set(cleanDigits, now);
  try {
    const label = mode === 'video' ? '📹 Incoming Video Call' : '📞 Incoming Audio Call';
    const text = `${label} from *${callerName}* on VV Connect App!\nTap to answer live:\n${answerUrl}`;
    const res = await baileysManager.sendUnifiedMessage(cleanDigits, text);
    return Boolean(res?.success);
  } catch (_) {
    return false;
  }
}
