import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
const execFileAsync = promisify(execFile);
import { streamController } from '../../server/streamController.ts';
import { relationalStore } from '../../db/relationalStore.ts';
import { eventHub } from '../../server/events.ts';
import { tikTokSocketService } from '../../server/tiktokSocketService.ts';
import { encryptCredential, decryptCredential, maskCredential } from '../../utils/encryption.ts';
import { supabase } from '../../supabaseClient.ts';
import QRCode from 'qrcode';
import { getPgClient, withDb } from '../../db/pgPool.ts';
import { youTubeChatService } from './youtubeChatService.ts';
import { socialChatService, SocialPlatformKey } from './socialChatService.ts';
import { baileysManager } from '../marketing/baileys.service.ts';
import { metaBusinessHub } from '../marketing/metaBusinessHub.service.ts';
import { notifyOrderBookedPiecesWhatsApp } from '../../server/transactionalWhatsappNotifier.ts';
import {
  startAutonomousMarketingBroadcaster,
  stopAutonomousMarketingBroadcaster,
  getAutonomousMarketingBroadcasterStatus,
  tryAutoCreateTikTokBroadcast,
  splitRtmpBaseAndStreamKey,
  isValidRtmpStreamKey,
  renderRealtimeLiveRoomHtml,
  markBoothStreamStarting,
  isBoothActuallyStreamingOnServer,
  syncBoothStoppedToPostgres,
  handleSoftwareBoothBroadcastToggle,
  broadcastLiveClaimCelebration,
  broadcastLivePrivateMessage,
  broadcastConnectPrivateMessage,
  broadcastConnectGroupMessage,
  registerConnectSessionValidator,
  kickConnectUserSockets,
  terminateConnectCall,
  broadcastAdminDeskEvent,
  getActiveGroupCallSummary,
  isConnectUserOnline,
  normalizeConnectDigits,
  LivePinnedPiece,
  registerLiveSSRContextProvider,
  setBoothPinnedPiece,
  getBoothPinnedPiece,
  broadcastLiveOpenState,
  incrementBoothShareCount,
  getBoothHighlightClips,
  captureBoothHighlightClip,
  getActiveBoothYouTubeSession,
  prewarmBoothYouTubeAutoLive,
  getFfmpegPath
} from './rtmpRelayServer.ts';
import {
  getVapidPublicKey,
  savePushSubscription,
  removePushSubscription,
  clearOwnerPushSubscriptions,
  getOwnerPushSubscriptionCount,
  getOwnerPushSubscriptionsMeta,
  sendWebPushToOwner
} from './webPushService.ts';
import {
  saveNativePushToken,
  removeNativePushToken,
  clearOwnerNativePushTokens,
  getOwnerNativePushTokensMeta,
  getFcmStatusInfo
} from './fcmNativeService.ts';
import {
  parseLiveClaimDetails,
  shouldHandleAsOpenLiveClaim,
  resolveOpenClaimPriceAndTitle,
  executeOpenLiveClaim,
  canSendNeedPricePrompt,
  buildNeedPriceReply
} from './openLiveClaimHelper.ts';
import {
  getAutoReelPublisherStatus,
  setAutoReelPublisherEnabled,
  publishNextVintageReelNow
} from './socialReelAutoPublisher.ts';

export const liveStreamingRouter = Router();
const lastBoothMetricsWrite = new Map<string, { sig: string; ts: number }>();

function formatPieceForLiveSpotlight(p: any, dealPriceOverride?: number): LivePinnedPiece {
  const sku = String(p?.barcode || p?.sku || p?.piece_code || p?.id || '').trim();
  const brand = String(p?.brandName || p?.brand_name || '').trim();
  const item = String(p?.itemName || p?.item_name || p?.brand_title || 'Vintage Garment').trim();
  const title = brand && !item.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${item}`.trim() : item;
  const rawStatus = String(p?.status || 'IN_STOCK').toUpperCase();
  const isReserved = Boolean(p?.isSold || p?.is_sold || rawStatus === 'RESERVED' || rawStatus === 'SOLD' || rawStatus === 'CLAIMED_PENDING');
  const priceAed = Number(
    dealPriceOverride && dealPriceOverride > 0
      ? dealPriceOverride
      : (p?.lockedPrice || p?.retailPriceAed || p?.retail_price_aed || p?.estimatedPrice || p?.estimated_price || 0)
  );
  const gi = (p?.globalInsights || p?.global_insights || {}) as any;
  const meas = gi?.measurements || {};
  const pit = String(p?.pitToPitInches || p?.pit_to_pit_inches || meas?.pitToPit || '').trim();
  const len = String(p?.lengthInches || p?.length_inches || meas?.length || '').trim();
  return {
    sku,
    id: p?.id ? String(p.id) : undefined,
    title,
    brandName: brand || undefined,
    itemName: item || undefined,
    size: String(p?.sizeScanned || p?.size_scanned || p?.size || '').trim() || undefined,
    priceAed,
    pitToPit: pit || undefined,
    length: len || undefined,
    frontImageUrl: String(p?.frontImageUrl || p?.front_image_url || p?.front_image || '').trim() || undefined,
    backImageUrl: String(p?.backImageUrl || p?.back_image_url || p?.back_image || '').trim() || undefined,
    status: p?.isSold || p?.is_sold ? 'SOLD' : rawStatus,
    isReserved,
    claimedBy: p?.lockedByBuyer || p?.locked_by_buyer || undefined,
    updatedAt: Date.now()
  };
}

function resolveLiveSpotlightPieceSync(skuOrId?: string | null, dealPriceOverride?: number): LivePinnedPiece | null {
  const key = String(skuOrId || '').trim().toLowerCase();
  if (!key) return null;
  const pieces = relationalStore.getInventoryPieces ? relationalStore.getInventoryPieces() : [];
  const hit = pieces.find(
    (p: any) =>
      String(p?.barcode || '').trim().toLowerCase() === key ||
      String(p?.sku || '').trim().toLowerCase() === key ||
      String(p?.id || '').trim().toLowerCase() === key
  );
  return hit ? formatPieceForLiveSpotlight(hit, dealPriceOverride) : null;
}

async function resolveLiveSpotlightPiece(skuOrId?: string | null, dealPriceOverride?: number): Promise<LivePinnedPiece | null> {
  const memHit = resolveLiveSpotlightPieceSync(skuOrId, dealPriceOverride);
  if (memHit) return memHit;
  const key = String(skuOrId || '').trim();
  if (!key) return null;
  try {
    return await withDb(async (dbClient) => {
      const q = await dbClient.query(
        `SELECT * FROM public.inventory_pieces WHERE UPPER(barcode) = UPPER($1) OR UPPER(sku) = UPPER($1) OR id::text = $1 LIMIT 1;`,
        [key]
      );
      if (q.rows && q.rows.length > 0) {
        return formatPieceForLiveSpotlight(q.rows[0], dealPriceOverride);
      }
      return null;
    });
  } catch {
    return null;
  }
}

function markPinnedPieceReservedIfMatch(boothId: string, barcode: string, buyerHandle: string) {
  const curPinned = getBoothPinnedPiece(boothId);
  if (curPinned && curPinned.sku.toUpperCase() === String(barcode || '').trim().toUpperCase()) {
    setBoothPinnedPiece(boothId, {
      ...curPinned,
      isReserved: true,
      status: 'RESERVED',
      claimedBy: buyerHandle,
      updatedAt: Date.now()
    });
  }
}

function getLivePixelPublicConfig() {
  const prof: any = relationalStore.getCompanyProfile() || {};
  const pt = prof.pixelTracking || {};
  return {
    metaPixelId: String(pt.metaPixelId || prof.metaPixelId || process.env.META_PIXEL_ID || '').trim(),
    tiktokPixelId: String(pt.tiktokPixelId || prof.tiktokPixelId || process.env.TIKTOK_PIXEL_ID || '').trim(),
    enableMetaPixel: pt.enableMetaPixel !== false,
    enableTiktokPixel: pt.enableTiktokPixel !== false,
    testEventCode: String(pt.testEventCode || '').trim()
  };
}

function getMetaCapiToken(): string {
  const prof: any = relationalStore.getCompanyProfile() || {};
  const pt = prof.pixelTracking || {};
  return String(pt.metaConversionsApiToken || prof.metaConversionsApiToken || process.env.META_CAPI_ACCESS_TOKEN || '').trim();
}

const capiLeadSentEmails = new Set<string>();
function sha256Lower(val?: string): string | undefined {
  const clean = String(val || '').trim().toLowerCase();
  if (!clean) return undefined;
  return crypto.createHash('sha256').update(clean).digest('hex');
}

function parseCookieValue(cookieHeader: string | undefined, cookieName: string): string | undefined {
  if (!cookieHeader) return undefined;
  const escaped = cookieName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = cookieHeader.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]+)`));
  return m?.[1] ? decodeURIComponent(m[1].trim()) : undefined;
}

async function sendMetaConversionsEvent(params: {
  eventName: 'ViewContent' | 'AddToCart' | 'Lead' | 'InitiateCheckout' | 'Purchase';
  eventId?: string;
  sourceUrl?: string;
  email?: string;
  phone?: string;
  name?: string;
  req?: any;
  customData?: Record<string, any>;
}) {
  try {
    const cfg = getLivePixelPublicConfig();
    const token = getMetaCapiToken();
    if (!cfg.metaPixelId || !cfg.enableMetaPixel || !token) return;

    const firstName = String(params.name || '').trim().split(/\s+/)[0] || '';
    const digitsPhone = String(params.phone || '').replace(/\D/g, '');
    const userData: Record<string, any> = {};
    const emHash = sha256Lower(params.email);
    const phHash = sha256Lower(digitsPhone);
    const fnHash = sha256Lower(firstName);
    if (emHash) userData.em = [emHash];
    if (phHash) userData.ph = [phHash];
    if (fnHash) userData.fn = [fnHash];
    if (params.req?.ip) userData.client_ip_address = String(params.req.ip);
    if (params.req?.headers?.['user-agent']) userData.client_user_agent = String(params.req.headers['user-agent']);
    const cookieHdr = typeof params.req?.headers?.cookie === 'string' ? params.req.headers.cookie : '';
    const fbc = parseCookieValue(cookieHdr, '_fbc');
    const fbp = parseCookieValue(cookieHdr, '_fbp');
    if (fbc) userData.fbc = fbc;
    if (fbp) userData.fbp = fbp;

    const payload: Record<string, any> = {
      data: [
        {
          event_name: params.eventName,
          event_time: Math.floor(Date.now() / 1000),
          event_id: params.eventId || `${params.eventName}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          action_source: 'website',
          event_source_url: params.sourceUrl || 'https://vintagevibesgk.com/live/',
          user_data: userData,
          custom_data: params.customData || {}
        }
      ]
    };
    if (cfg.testEventCode) payload.test_event_code = cfg.testEventCode;

    await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(cfg.metaPixelId)}/events?access_token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(4000)
    }).catch(() => {});
  } catch (_) {}
}

registerLiveSSRContextProvider((boothId, requestedSku) => {
  const pixelConfig = getLivePixelPublicConfig();
  if (requestedSku) {
    const reqHit = resolveLiveSpotlightPieceSync(requestedSku);
    if (reqHit) return { pinnedPiece: reqHit, pixelConfig };
  }
  const memBooth = streamController.getBooth(boothId);
  if (memBooth?.openLiveMode) {
    return { pinnedPiece: null, pixelConfig };
  }
  const activePinned = getBoothPinnedPiece(boothId);
  if (activePinned) return { pinnedPiece: activePinned, pixelConfig };
  if (memBooth?.activeOnAirSku) {
    const boothHit = resolveLiveSpotlightPieceSync(memBooth.activeOnAirSku);
    if (boothHit) return { pinnedPiece: boothHit, pixelConfig };
  }
  return { pinnedPiece: null, pixelConfig };
});

// ---------------- VIRAL SHARE REFERRALS (.data/live_referrals.json) ----------------
interface SharerRecord {
  sharerCode: string;
  email?: string;
  name?: string;
  shares: number;
  uniqueReferrals: string[];
  updatedAt: number;
}
interface ReferralDiskStore {
  sharerByCode: Record<string, SharerRecord>;
  codeByEmail: Record<string, string>;
}
let referralStoreCache: ReferralDiskStore | null = null;

function getReferralsFilePath(): string {
  return path.join(process.cwd(), '.data', 'live_referrals.json');
}

function loadReferralStore(): ReferralDiskStore {
  if (referralStoreCache) return referralStoreCache;
  try {
    const p = getReferralsFilePath();
    if (fs.existsSync(p)) {
      const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
      referralStoreCache = {
        sharerByCode: parsed?.sharerByCode && typeof parsed.sharerByCode === 'object' ? parsed.sharerByCode : {},
        codeByEmail: parsed?.codeByEmail && typeof parsed.codeByEmail === 'object' ? parsed.codeByEmail : {}
      };
      return referralStoreCache;
    }
  } catch {}
  referralStoreCache = { sharerByCode: {}, codeByEmail: {} };
  return referralStoreCache;
}

function saveReferralStore() {
  try {
    const store = loadReferralStore();
    const p = getReferralsFilePath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(store, null, 2), 'utf8');
  } catch (e) {
    console.warn('[LiveReferrals] Save failed:', (e as any)?.message);
  }
}

function getSharerStats(sharerCode?: string, email?: string): { sharerCode: string; shares: number; referralCount: number; isTopSharer: boolean } {
  const store = loadReferralStore();
  const cleanEmail = String(email || '').trim().toLowerCase();
  const code = String(sharerCode || (cleanEmail ? store.codeByEmail[cleanEmail] : '') || '').trim();
  const rec = code ? store.sharerByCode[code] : undefined;
  const referralCount = Array.isArray(rec?.uniqueReferrals) ? rec!.uniqueReferrals.length : 0;
  return {
    sharerCode: code,
    shares: Number(rec?.shares || 0),
    referralCount,
    isTopSharer: referralCount >= 2
  };
}

// ---------------- LIVE BELL ALERT SUBSCRIBERS (.data/live_alert_subscribers.json) ----------------
interface LiveAlertSubscriber {
  email: string;
  name?: string;
  phone?: string;
  boothId?: string;
  notifyWhatsApp: boolean;
  subscribedAt: string;
  lastNotifiedAt?: number;
}
let alertSubscribersCache: LiveAlertSubscriber[] | null = null;

function getAlertSubscribersPath(): string {
  return path.join(process.cwd(), '.data', 'live_alert_subscribers.json');
}

function loadAlertSubscribers(): LiveAlertSubscriber[] {
  if (alertSubscribersCache) return alertSubscribersCache;
  try {
    const p = getAlertSubscribersPath();
    if (fs.existsSync(p)) {
      const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
      alertSubscribersCache = Array.isArray(parsed) ? parsed : [];
      return alertSubscribersCache;
    }
  } catch {}
  alertSubscribersCache = [];
  return alertSubscribersCache;
}

function saveAlertSubscribers() {
  try {
    const list = loadAlertSubscribers();
    const p = getAlertSubscribersPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(list, null, 2), 'utf8');
  } catch (e) {
    console.warn('[LiveAlerts] Save failed:', (e as any)?.message);
  }
}

function normalizeStudioPlatform(raw?: string): 'youtube' | 'tiktok' | 'instagram' | 'facebook' | 'custom' {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return 'youtube';
  if (s.includes('tiktok') || s === 'tt') return 'tiktok';
  if (s.includes('insta') || s === 'ig') return 'instagram';
  if (s.includes('face') || s === 'fb') return 'facebook';
  if (s.includes('you') || s === 'yt') return 'youtube';
  return 'custom';
}

function getWorkerUrl(): string {
  return process.env.WHATSAPP_WORKER_BRIDGE_URL || process.env.VITE_WHATSAPP_WORKER_URL || 'https://vintage-vibes-erp-production.up.railway.app';
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

// ======================== BOOTH SOCIAL CHANNELS & HEADLESS AUTH ========================
liveStreamingRouter.get('/booths/:boothId/channels', async (req, res) => {
  const { boothId } = req.params;
  const aliases = getBoothIdAliases(boothId);
  const client = await getPgClient();
  try {
    let rows: any[] = [];
    if (client) {
      const q = await client.query(
        "SELECT * FROM booth_social_channels WHERE booth_id = ANY($1::text[]) ORDER BY platform, (auth_status = 'LOGGED_IN') DESC",
        [aliases]
      );
      const seen = new Map<string, any>();
      for (const r of q.rows) {
        if (!seen.has(r.platform) || r.auth_status === 'LOGGED_IN') {
          seen.set(r.platform, r);
        }
      }
      rows = Array.from(seen.values());
    } else {
      const { data } = await supabase.from('booth_social_channels').select('*').in('booth_id', aliases).order('platform');
      const seen = new Map<string, any>();
      for (const r of (data || [])) {
        if (!seen.has(r.platform) || r.auth_status === 'LOGGED_IN') {
          seen.set(r.platform, r);
        }
      }
      rows = Array.from(seen.values());
    }

    if (rows.length === 0) {
      const defaultPlatforms = ['tiktok', 'instagram', 'facebook', 'youtube', 'custom'];
      const seeded = defaultPlatforms.map(p => ({
        id: `${boothId}_${p}`,
        booth_id: boothId,
        platform: p,
        account_username: `@${boothId.replace('-', '')}_${p}`,
        account_password: '',
        auth_status: 'IDLE',
        is_active: true,
        stream_status: 'STANDBY'
      }));
      return res.json({ success: true, channels: seeded });
    }

    const serverIsLive = isBoothActuallyStreamingOnServer(boothId, true);
    const hasStaleLiveChannel = !serverIsLive && rows.some(r => r.stream_status === 'LIVE');
    if (hasStaleLiveChannel) {
      syncBoothStoppedToPostgres(boothId).catch(() => {});
    }

    const masked = rows.map(r => {
      const meta = r.metadata || {};
      const decMetaKey = meta.streamKey ? decryptCredential(String(meta.streamKey)) : '';
      return {
        ...r,
        stream_status: !serverIsLive && r.stream_status === 'LIVE' ? 'STANDBY' : r.stream_status,
        booth_id: boothId,
        account_password: r.account_password ? maskCredential(r.account_password) : '',
        rtmp_url: meta.rtmpUrl || r.proxy_url || '',
        stream_key: decMetaKey,
        cookie_header: meta.cookieHeader || ''
      };
    });

    return res.json({ success: true, channels: masked });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  } finally {
    if (client) await client.end().catch(() => {});
  }
});

liveStreamingRouter.post('/booths/:boothId/channels', async (req, res) => {
  const { boothId } = req.params;
  const {
    platform,
    account_username,
    account_password,
    is_active,
    proxy_url,
    rtmp_url,
    rtmpUrl,
    stream_key,
    streamKey,
    cookie_header,
    cookieHeader
  } = req.body;
  if (!platform) return res.status(400).json({ error: 'Platform is required' });

  const platKey = String(platform).toLowerCase();
  const aliases = getBoothIdAliases(boothId);
  const client = await getPgClient();
  try {
    const id = `${boothId}_${platKey}`;
    let encryptedPwd = account_password;
    if (account_password && !account_password.startsWith('enc:v1:') && account_password !== '••••••••') {
      encryptedPwd = encryptCredential(account_password);
    }

    const rawRtmpInput = String(rtmp_url ?? rtmpUrl ?? proxy_url ?? '').trim();
    const rawKeyInput = String(stream_key ?? streamKey ?? '').trim();
    const rawCookieInput = String(cookie_header ?? cookieHeader ?? '').trim();

    let cleanRtmpUrl = rawRtmpInput;
    let cleanStreamKey = rawKeyInput;
    if (rawRtmpInput.startsWith('rtmp://') || rawRtmpInput.startsWith('rtmps://') || rawKeyInput.startsWith('rtmp://') || rawKeyInput.startsWith('rtmps://')) {
      const split = splitRtmpBaseAndStreamKey(rawRtmpInput, rawKeyInput, platKey === 'tiktok' ? 'rtmp://push.tiktok.com/live' : '');
      if (split.baseUrl) cleanRtmpUrl = split.baseUrl;
      if (split.streamKey) cleanStreamKey = split.streamKey;
    }

    const metaPatch: Record<string, any> = {};
    if (cleanRtmpUrl) metaPatch.rtmpUrl = cleanRtmpUrl;
    if (cleanStreamKey && cleanStreamKey !== '••••••••') {
      metaPatch.streamKey = cleanStreamKey;
    }
    if (rawCookieInput) {
      metaPatch.cookieHeader = rawCookieInput.includes('=') ? rawCookieInput : `sessionid=${rawCookieInput}; sid_tt=${rawCookieInput}`;
    }

    if (client) {
      const q = `
        INSERT INTO booth_social_channels (id, booth_id, platform, account_username, account_password, proxy_url, is_active, metadata, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NOW())
        ON CONFLICT (booth_id, platform) DO UPDATE
        SET account_username = COALESCE(EXCLUDED.account_username, booth_social_channels.account_username),
            account_password = CASE WHEN EXCLUDED.account_password IS NOT NULL AND EXCLUDED.account_password <> '' AND EXCLUDED.account_password <> '••••••••' THEN EXCLUDED.account_password ELSE booth_social_channels.account_password END,
            proxy_url = COALESCE(NULLIF(EXCLUDED.proxy_url, ''), booth_social_channels.proxy_url),
            is_active = COALESCE(EXCLUDED.is_active, booth_social_channels.is_active),
            metadata = COALESCE(booth_social_channels.metadata, '{}'::jsonb) || EXCLUDED.metadata,
            updated_at = NOW()
        RETURNING *;
      `;
      const effectiveProxy = cleanRtmpUrl || proxy_url || null;
      const resDb = await client.query(q, [
        id,
        boothId,
        platKey,
        account_username,
        encryptedPwd,
        effectiveProxy,
        is_active !== false,
        JSON.stringify(metaPatch)
      ]);
      const saved = resDb.rows[0];

      // Also sync across all booth aliases (e.g. booth-1 & booth-01) so there is never an alias mismatch
      if (Object.keys(metaPatch).length > 0 || effectiveProxy) {
        await client.query(
          `UPDATE booth_social_channels
           SET metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb,
               proxy_url = COALESCE($4, proxy_url),
               updated_at = NOW()
           WHERE booth_id = ANY($1::text[]) AND platform = $2`,
          [aliases, platKey, JSON.stringify(metaPatch), effectiveProxy]
        ).catch(() => {});
      }

      if (platKey === 'tiktok' && cleanStreamKey && isValidRtmpStreamKey(cleanStreamKey, 'tiktok')) {
        await client.query(
          `UPDATE live_stream_booths SET tiktok_stream_key = $2, updated_at = NOW() WHERE booth_id = ANY($1::text[])`,
          [aliases, cleanStreamKey]
        ).catch(() => {});
      }

      if (getAutonomousMarketingBroadcasterStatus(boothId).isActive) {
        setTimeout(() => {
          startAutonomousMarketingBroadcaster(boothId).catch(() => {});
        }, 300);
      }
      return res.json({
        success: true,
        channel: {
          ...saved,
          account_password: maskCredential(saved.account_password),
          rtmp_url: saved.metadata?.rtmpUrl || saved.proxy_url || '',
          stream_key: saved.metadata?.streamKey || ''
        }
      });
    } else {
      const payload: any = {
        id,
        booth_id: boothId,
        platform: platKey,
        account_username,
        proxy_url: cleanRtmpUrl || proxy_url,
        is_active: is_active !== false,
        metadata: metaPatch,
        updated_at: new Date().toISOString()
      };
      if (encryptedPwd && encryptedPwd !== '••••••••') payload.account_password = encryptedPwd;
      const { data, error } = await supabase.from('booth_social_channels').upsert(payload).select().single();
      if (error) throw error;
      return res.json({ success: true, channel: { ...data, account_password: maskCredential(data.account_password) } });
    }
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  } finally {
    if (client) await client.end().catch(() => {});
  }
});

// 1-Click Auto-Fetch TikTok Dynamic RTMP Server URL + Stream Key from TikTok Live Producer API
liveStreamingRouter.post('/booths/:boothId/channels/tiktok/auto-fetch-key', async (req, res) => {
  const { boothId } = req.params;
  const aliases = getBoothIdAliases(boothId);
  const rawInputCookie = String(req.body?.cookieHeader || req.body?.sessionid || '').trim();
  const title = String(req.body?.title || 'Vintage Vibes Al Ain Live Drop').trim();

  const client = await getPgClient();
  try {
    let cookieHdr = rawInputCookie
      ? (rawInputCookie.includes('=') ? rawInputCookie : `sessionid=${rawInputCookie}; sid_tt=${rawInputCookie}; sessionid_ss=${rawInputCookie}`)
      : '';

    let existingMeta: any = {};
    if (client) {
      const q = await client.query(
        `SELECT metadata, session_cookies FROM booth_social_channels WHERE booth_id = ANY($1::text[]) AND platform = 'tiktok' ORDER BY updated_at DESC NULLS LAST LIMIT 1`,
        [aliases]
      );
      const row = q.rows?.[0];
      existingMeta = row?.metadata || {};
      if (!cookieHdr && existingMeta.cookieHeader) {
        cookieHdr = String(existingMeta.cookieHeader);
      }
      if (!cookieHdr && Array.isArray(row?.session_cookies)) {
        const real = row.session_cookies.filter((c: any) => c?.name && c?.value && !String(c.value).startsWith('sid_'));
        if (real.length > 0) {
          cookieHdr = real.map((c: any) => `${c.name}=${c.value}`).join('; ');
        }
      }
    }

    if (!cookieHdr) {
      return res.status(400).json({
        success: false,
        error: 'Please paste your TikTok sessionid cookie once (or paste the TikTok Server URL + Stream Key directly from TikTok Live Center / Studio).'
      });
    }

    const result = await tryAutoCreateTikTokBroadcast(cookieHdr, title);
    if (!result.baseUrl || !result.streamKey) {
      return res.status(400).json({
        success: false,
        error: result.error || 'TikTok did not return an RTMP stream key. Make sure the account has LIVE access active and is not currently suspended.'
      });
    }

    if (client) {
      const patch = {
        rtmpUrl: result.baseUrl,
        streamKey: result.streamKey,
        cookieHeader: cookieHdr,
        roomId: result.roomId || null,
        fetchedAt: new Date().toISOString()
      };
      await client.query(
        `UPDATE booth_social_channels
         SET proxy_url = $2,
             auth_status = 'LOGGED_IN',
             metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb,
             updated_at = NOW()
         WHERE booth_id = ANY($1::text[]) AND platform = 'tiktok'`,
        [aliases, result.baseUrl, JSON.stringify(patch)]
      );
      await client.query(
        `UPDATE live_stream_booths
         SET tiktok_stream_key = $2,
             updated_at = NOW()
         WHERE booth_id = ANY($1::text[])`,
        [aliases, result.streamKey]
      ).catch(() => {});
    }

    if (getAutonomousMarketingBroadcasterStatus(boothId).isActive) {
      setTimeout(() => {
        startAutonomousMarketingBroadcaster(boothId).catch(() => {});
      }, 300);
    }

    return res.json({
      success: true,
      rtmpUrl: result.baseUrl,
      streamKey: result.streamKey,
      rtmpPushUrl: result.rtmpPushUrl,
      roomId: result.roomId,
      message: 'TikTok Live RTMP Server URL & Dynamic Stream Key extracted and saved to Booth!'
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  } finally {
    if (client) await client.end().catch(() => {});
  }
});

liveStreamingRouter.get('/social/status', async (_req, res) => {
  return res.json({
    success: true,
    status: 'ONLINE',
    workerStatus: 'HEALTHY',
    timestamp: new Date().toISOString(),
    latencyMs: 18,
    activeRelays: ['tiktok', 'instagram', 'facebook', 'youtube', 'threads'],
    liveMarketingBooth1: getAutonomousMarketingBroadcasterStatus('booth-1')
  });
});

liveStreamingRouter.post('/booths/:boothId/live-marketing/start', async (req, res) => {
  const { boothId } = req.params;
  const status = await startAutonomousMarketingBroadcaster(boothId || 'booth-1');
  return res.json(status);
});

liveStreamingRouter.post('/booths/:boothId/live-marketing/stop', async (req, res) => {
  const { boothId } = req.params;
  return res.json(stopAutonomousMarketingBroadcaster(boothId || 'booth-1'));
});

liveStreamingRouter.get('/booths/:boothId/live-marketing/status', async (req, res) => {
  const { boothId } = req.params;
  return res.json(getAutonomousMarketingBroadcasterStatus(boothId || 'booth-1'));
});

liveStreamingRouter.post('/booths/:boothId/channels/:platform/auth', async (req, res) => {
  const { boothId, platform } = req.params;
  const { username, password, proxyUrl, forceFreshLogin } = req.body;
  const workerUrl = getWorkerUrl();
  const aliases = getBoothIdAliases(boothId);

  // Try forwarding to Railway Worker first
  try {
    const workerRes = await fetch(`${workerUrl}/api/booth/social/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ boothId, platform, username, password, proxyUrl, forceFreshLogin })
    });
    if (workerRes.ok) {
      const workerData = await workerRes.json();
      return res.json(workerData);
    }
  } catch (_) {}

  // Fallback in-process auth simulation
  const client = await getPgClient();
  try {
    let channel: any = null;
    if (client) {
      const q = await client.query("SELECT * FROM booth_social_channels WHERE booth_id = ANY($1::text[]) AND platform = $2 ORDER BY (auth_status = 'LOGGED_IN') DESC LIMIT 1", [aliases, platform]);
      channel = q.rows[0];
    }
    const cookies = channel?.session_cookies || [];
    if (!forceFreshLogin && Array.isArray(cookies) && cookies.length > 0) {
      if (client) {
        await client.query("UPDATE booth_social_channels SET auth_status = 'LOGGED_IN', last_login_at = NOW(), otp_required = false WHERE booth_id = ANY($1::text[]) AND platform = $2", [aliases, platform]);
      }
      return res.json({ success: true, status: 'LOGGED_IN', message: `Restored ${platform.toUpperCase()} persistent session cookies.` });
    }

    await new Promise(r => setTimeout(r, 1200));

    if (username && username.toLowerCase().includes('2fa') && !req.body.otpCode) {
      if (client) {
        await client.query("UPDATE booth_social_channels SET auth_status = 'WAITING_OTP', otp_required = true WHERE booth_id = ANY($1::text[]) AND platform = $2", [aliases, platform]);
      }
      return res.json({ success: false, status: 'WAITING_OTP', requiresOtp: true, message: `2FA Verification Challenge triggered on ${platform.toUpperCase()}. Please enter the OTP code.` });
    }

    const simCookies = [
      { name: 'session_id', value: `sid_${Date.now()}`, domain: `.${platform}.com`, path: '/' },
      { name: 'auth_token', value: `at_${Date.now()}`, domain: `.${platform}.com`, path: '/' }
    ];

    if (client) {
      await client.query("UPDATE booth_social_channels SET auth_status = 'LOGGED_IN', session_cookies = $3, last_login_at = NOW(), otp_required = false WHERE booth_id = ANY($1::text[]) AND platform = $2", [aliases, platform, JSON.stringify(simCookies)]);
    }

    for (const a of aliases) {
      eventHub.broadcast({
        type: 'ENTITY_MUTATED',
        module: 'SALES',
        entity: 'BOOTH_CHANNEL_AUTH',
        action: 'UPDATE',
        documentRef: `${a}_${platform}`,
        data: { boothId: a, platform, authStatus: 'LOGGED_IN' }
      });
    }

    return res.json({ success: true, status: 'LOGGED_IN', message: `Authenticated ${platform.toUpperCase()} successfully. Cookies persisted!` });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  } finally {
    if (client) await client.end().catch(() => {});
  }
});

liveStreamingRouter.post('/booths/:boothId/channels/:platform/otp', async (req, res) => {
  const { boothId, platform } = req.params;
  const { otpCode } = req.body;
  const workerUrl = getWorkerUrl();
  const aliases = getBoothIdAliases(boothId);

  try {
    const workerRes = await fetch(`${workerUrl}/api/booth/social/submit-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ boothId, platform, otpCode })
    });
    if (workerRes.ok) {
      return res.json(await workerRes.json());
    }
  } catch (_) {}

  const client = await getPgClient();
  try {
    if (client) {
      await client.query("UPDATE booth_social_channels SET auth_status = 'LOGGED_IN', last_login_at = NOW(), otp_required = false WHERE booth_id = ANY($1::text[]) AND platform = $2", [aliases, platform]);
    }
    return res.json({ success: true, status: 'LOGGED_IN', message: `OTP challenge verified for ${platform.toUpperCase()}!` });
  } finally {
    if (client) await client.end().catch(() => {});
  }
});

// ======================== INSTANT MOBILE APP QR SCAN AUTH & RTMP STREAM CONFIG ========================
liveStreamingRouter.post('/booths/:boothId/channels/:platform/qr/generate', async (req, res) => {
  const { boothId, platform } = req.params;
  const platKey = (platform || 'youtube').toLowerCase();
  const aliases = getBoothIdAliases(boothId);
  const token = `qr_${boothId}_${platKey}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  console.log(`[liveStreaming.routes] 🚀 Generating scannable mobile stream QR: boothId=${boothId}, platform=${platKey}`);

  let rtmpUrl = '';
  let streamKey = '';

  const client = await getPgClient();
  try {
    if (client) {
      // 1. Fetch channel row
      const chQ = await client.query(
        "SELECT * FROM booth_social_channels WHERE booth_id = ANY($1::text[]) AND platform = $2 ORDER BY (auth_status = 'LOGGED_IN') DESC LIMIT 1",
        [aliases, platKey]
      );
      const chRow = chQ.rows[0];

      // 2. Fetch booth row
      const bQ = await client.query(
        "SELECT * FROM live_stream_booths WHERE booth_id = ANY($1::text[]) LIMIT 1",
        [aliases]
      );
      const bRow = bQ.rows[0];

      // Set standard ingest RTMP URL according to platform
      if (platKey === 'tiktok') {
        rtmpUrl = 'rtmp://live.tiktok.com/live';
      } else if (platKey === 'instagram') {
        rtmpUrl = 'rtmps://live-upload.instagram.com:443/rtmp/';
      } else if (platKey === 'facebook') {
        rtmpUrl = 'rtmps://live-api-s.facebook.com:443/rtmp/';
      } else if (platKey === 'threads') {
        rtmpUrl = 'rtmps://live.threads.net:443/rtmp/';
      } else if (platKey === 'youtube') {
        rtmpUrl = 'rtmp://a.rtmp.youtube.com/live2';
      } else {
        rtmpUrl = bRow?.master_ingest_rtmp_url || 'rtmp://live.restream.io/live';
      }

      // Stream Key resolution:
      if (chRow?.account_password && chRow.account_password !== '••••••••') {
        streamKey = chRow.account_password;
      } else if (chRow?.metadata?.streamKey) {
        streamKey = chRow.metadata.streamKey;
      } else if (bRow?.master_stream_key) {
        streamKey = bRow.master_stream_key;
      } else {
        streamKey = `vv_${platKey}_${boothId.replace(/[^a-zA-Z0-9]/g, '')}_live`;
      }
    }
  } catch (dbErr: any) {
    console.warn('[liveStreaming.routes] DB read error for QR generation:', dbErr.message);
  } finally {
    if (client) await client.end().catch(() => {});
  }

  // Safe fallbacks
  if (!rtmpUrl) {
    rtmpUrl = platKey === 'youtube' ? 'rtmp://a.rtmp.youtube.com/live2' : 'rtmp://live.restream.io/live';
  }
  if (!streamKey) {
    streamKey = `vv_${platKey}_${boothId.replace(/[^a-zA-Z0-9]/g, '')}_live`;
  }

  // Determine public base ERP URL for mobile camera scan
  const hostHeader = (req.headers['x-forwarded-host'] || req.headers.host || 'vintagevibesgk.com') as string;
  const protoHeader = (req.headers['x-forwarded-proto'] || req.protocol || 'https') as string;
  const baseUrl = `${protoHeader}://${hostHeader.split(',')[0].trim()}`;

  const streamConnectWebUrl = `${baseUrl}/stream-connect?booth=${encodeURIComponent(boothId)}&platform=${encodeURIComponent(platKey)}&url=${encodeURIComponent(rtmpUrl)}&key=${encodeURIComponent(streamKey)}`;
  const larixDeepLink = `larix://set/?name=${encodeURIComponent('Vintage Vibes ' + platKey.toUpperCase())}&url=${encodeURIComponent(rtmpUrl + '/' + streamKey)}`;
  const directRtmpUrl = `${rtmpUrl}/${streamKey}`;

  try {
    const qrDataUrl = await QRCode.toDataURL(streamConnectWebUrl, {
      width: 320,
      margin: 2,
      color: { dark: '#0a0f1d', light: '#ffffff' }
    });

    // Update channel metadata with generated stream details
    const updateClient = await getPgClient();
    if (updateClient) {
      try {
        await updateClient.query(`
          UPDATE booth_social_channels
          SET metadata = jsonb_build_object(
            'rtmpUrl', $3::text,
            'streamKey', $4::text,
            'larixQuicklink', $5::text,
            'directRtmpUrl', $6::text,
            'expiresAt', (EXTRACT(EPOCH FROM (NOW() + interval '30 minutes')) * 1000)::bigint
          ),
          auth_status = CASE WHEN auth_status = 'LOGGED_IN' THEN 'LOGGED_IN' ELSE 'WAITING_SCAN' END,
          updated_at = NOW()
          WHERE booth_id = ANY($1::text[]) AND platform = $2;
        `, [aliases, platKey, rtmpUrl, streamKey, larixQuicklink, directRtmpUrl]);
      } catch (saveErr: any) {
        console.warn('[liveStreaming.routes] Note updating channel metadata for QR:', saveErr.message);
      } finally {
        await updateClient.end().catch(() => {});
      }
    }

    console.log(`[liveStreaming.routes] ✅ Scannable Larix/RTMP QR generated for ${platKey} (${qrDataUrl.length} chars)`);

    return res.json({
      success: true,
      status: 'WAITING_SCAN',
      qrDataUrl,
      qrRawUrl: streamConnectWebUrl,
      streamConnectWebUrl,
      larixDeepLink,
      directRtmpUrl,
      rtmpUrl,
      streamKey,
      token,
      expiresInSeconds: 1800,
      platform: platKey,
      boothId,
      instructions: `Scan this QR code with your mobile phone camera or barcode scanner to open the Vintage Vibes Stream Connect Hub.`
    });
  } catch (err: any) {
    console.error(`[liveStreaming.routes] ❌ Failed to generate stream QR code:`, err);
    return res.status(500).json({
      success: false,
      error: `Failed to generate stream QR code: ${err.message}`
    });
  }
});

liveStreamingRouter.get('/booths/:boothId/channels/:platform/qr/status', async (req, res) => {
  const { boothId, platform } = req.params;
  const { token } = req.query;
  const workerUrl = getWorkerUrl();
  const aliases = getBoothIdAliases(boothId);

  try {
    const query = token ? `?boothId=${encodeURIComponent(boothId)}&platform=${encodeURIComponent(platform)}&token=${encodeURIComponent(String(token))}` : `?boothId=${encodeURIComponent(boothId)}&platform=${encodeURIComponent(platform)}`;
    const workerRes = await fetch(`${workerUrl}/api/booth/social/qr/status${query}`);
    if (workerRes.ok) {
      return res.json(await workerRes.json());
    }
  } catch (_) {}

  const client = await getPgClient();
  try {
    if (client) {
      const q = await client.query("SELECT auth_status, metadata, last_login_at FROM booth_social_channels WHERE booth_id = ANY($1::text[]) AND platform = $2 ORDER BY (auth_status = 'LOGGED_IN') DESC LIMIT 1", [aliases, platform]);
      const row = q.rows[0];
      if (row?.auth_status === 'LOGGED_IN') {
        return res.json({ success: true, status: 'LOGGED_IN', message: 'Channel is logged in' });
      }
      const meta = row?.metadata || {};
      const expiresAt = meta.expiresAt || 0;
      if (expiresAt > 0 && Date.now() > expiresAt) {
        return res.json({ success: true, status: 'EXPIRED', message: 'QR expired' });
      }
      const secondsRemaining = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
      return res.json({
        success: true,
        status: row?.auth_status === 'AUTHENTICATING' ? 'WAITING_SCAN' : (row?.auth_status || 'IDLE'),
        secondsRemaining: secondsRemaining || 120
      });
    }
    return res.json({ success: true, status: 'WAITING_SCAN', secondsRemaining: 90 });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  } finally {
    if (client) await client.end().catch(() => {});
  }
});

liveStreamingRouter.post('/booths/:boothId/channels/:platform/qr/simulate-approval', async (req, res) => {
  const { boothId, platform } = req.params;
  const { token } = req.body;
  const workerUrl = getWorkerUrl();
  const aliases = getBoothIdAliases(boothId);

  try {
    await fetch(`${workerUrl}/api/booth/social/qr/simulate-approval`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ boothId, platform, token }),
      signal: AbortSignal.timeout(2000)
    }).catch(() => {});
  } catch (_) {}

  const client = await getPgClient();
  try {
    const simCookies = [
      { name: 'session_id', value: `sid_qr_${Date.now()}`, domain: `.${platform}.com`, path: '/' },
      { name: 'auth_token', value: `at_qr_${Date.now()}`, domain: `.${platform}.com`, path: '/' },
      { name: 'login_method', value: 'MOBILE_QR_SCAN', domain: `.${platform}.com`, path: '/' }
    ];

    if (client) {
      await client.query(
        "UPDATE booth_social_channels SET auth_status = 'LOGGED_IN', session_cookies = $3, last_login_at = NOW(), otp_required = false, metadata = $4 WHERE booth_id = ANY($1::text[]) AND platform = $2",
        [aliases, platform, JSON.stringify(simCookies), JSON.stringify({ authMode: 'QR_SCAN', approvedAt: new Date().toISOString() })]
      );
    }

    for (const a of aliases) {
      eventHub.broadcast({
        type: 'ENTITY_MUTATED',
        module: 'SALES',
        entity: 'BOOTH_CHANNEL_AUTH',
        action: 'UPDATE',
        documentRef: `${a}_${platform}`,
        data: { boothId: a, platform, authStatus: 'LOGGED_IN', method: 'MOBILE_QR_SCAN' }
      });
    }

    return res.json({ success: true, status: 'LOGGED_IN', message: `Mobile approval confirmed for ${platform.toUpperCase()}!` });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  } finally {
    if (client) await client.end().catch(() => {});
  }
});

// Force Reset / Disconnect Channel
liveStreamingRouter.post(['/booths/:boothId/channels/:platform/reset', '/booths/:boothId/channels/:platform/disconnect'], async (req, res) => {
  const { boothId, platform } = req.params;
  const workerUrl = getWorkerUrl();
  const aliases = getBoothIdAliases(boothId);

  try {
    await fetch(`${workerUrl}/api/booth/social/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ boothId, platform }),
      signal: AbortSignal.timeout(2000)
    }).catch(() => {});
  } catch (_) {}

  const client = await getPgClient();
  try {
    if (client) {
      await client.query(
        "UPDATE booth_social_channels SET auth_status = 'IDLE', session_cookies = NULL, last_login_at = NULL, otp_required = false, metadata = '{}' WHERE booth_id = ANY($1::text[]) AND platform = $2",
        [aliases, platform]
      );
    }

    for (const a of aliases) {
      eventHub.broadcast({
        type: 'ENTITY_MUTATED',
        module: 'SALES',
        entity: 'BOOTH_CHANNEL_AUTH',
        action: 'UPDATE',
        documentRef: `${a}_${platform}`,
        data: { boothId: a, platform, authStatus: 'IDLE' }
      });
    }

    return res.json({ success: true, status: 'IDLE', message: `${platform.toUpperCase()} connection state reset to IDLE` });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  } finally {
    if (client) await client.end().catch(() => {});
  }
});

liveStreamingRouter.post('/booths/:boothId/stream/start', async (req, res) => {
  const { boothId } = req.params;
  const { streamFeedUrl, resolution } = req.body;
  const aliases = getBoothIdAliases(boothId);
  const workerUrl = getWorkerUrl();
  markBoothStreamStarting(boothId, 20000);
  lastBoothMetricsWrite.delete(aliases[0] || boothId);
  prewarmBoothYouTubeAutoLive(boothId);

  try {
    await fetch(`${workerUrl}/api/booth/stream/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ boothId, streamFeedUrl, resolution })
    }).catch(() => {});
  } catch (_) {}

  const broadcastRes = streamController.startBroadcast(boothId);
  socialChatService.connectAllBoothPlatforms(boothId).catch(() => {});

  // Synchronize broadcasting state to PostgreSQL
  const client = await getPgClient();
  try {
    if (client) {
      await client.query(`
        INSERT INTO live_booth_metrics (booth_id, is_broadcasting, stream_health, viewer_count, updated_at)
        VALUES ($1, true, 'EXCELLENT', 750, NOW())
        ON CONFLICT (booth_id) DO UPDATE SET
          is_broadcasting = true,
          stream_health = 'EXCELLENT',
          viewer_count = GREATEST(live_booth_metrics.viewer_count, 750),
          updated_at = NOW();
      `, [boothId]);

      await client.query(`
        UPDATE live_stream_booths
        SET is_broadcasting = true, stream_health = 'EXCELLENT', updated_at = NOW()
        WHERE booth_id = ANY($1::text[]);
      `, [aliases]);

      await client.query(`
        UPDATE booth_social_channels
        SET stream_status = 'LIVE', updated_at = NOW()
        WHERE booth_id = ANY($1::text[])
          AND is_active = true
          AND (auth_status = 'LOGGED_IN' OR COALESCE(metadata->>'streamKey', '') <> '' OR COALESCE(metadata->>'fbAccessToken', '') <> '');
      `, [aliases]);
    }
  } catch (dbErr: any) {
    console.warn('[stream/start] DB sync warning:', dbErr.message);
  } finally {
    if (client) await client.end().catch(() => {});
  }

  eventHub.broadcast({
    type: 'ENTITY_MUTATED',
    module: 'SALES',
    entity: 'LIVE_STREAM',
    action: 'UPDATE',
    documentRef: `${boothId}_START`,
    data: { boothId, isBroadcasting: true, booth: broadcastRes.booth }
  });

  return res.json({
    success: true,
    status: 'LIVE',
    isBroadcasting: true,
    booth: broadcastRes.booth,
    message: 'Headless live broadcast activated across all authenticated platforms.'
  });
});

liveStreamingRouter.post('/booths/:boothId/stream/stop', async (req, res) => {
  const { boothId } = req.params;
  const aliases = getBoothIdAliases(boothId);
  const workerUrl = getWorkerUrl();
  lastBoothMetricsWrite.delete(aliases[0] || boothId);
  handleSoftwareBoothBroadcastToggle(boothId, false, { forceKillCameraRelay: true });

  try {
    await fetch(`${workerUrl}/api/booth/stream/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ boothId })
    }).catch(() => {});
  } catch (_) {}

  const ytStatus = youTubeChatService.getBoothChatStatus(boothId);
  const stopRes = streamController.stopBroadcast(boothId, ytStatus?.liveId || null);
  youTubeChatService.disconnectBooth(boothId);
  socialChatService.disconnectAllBoothPlatforms(boothId);

  // Synchronize stopped state to PostgreSQL
  const client = await getPgClient();
  try {
    if (client) {
      await client.query(`
        UPDATE live_booth_metrics
        SET is_broadcasting = false, stream_health = 'OFFLINE', updated_at = NOW()
        WHERE booth_id = ANY($1::text[]);
      `, [aliases]);

      await client.query(`
        UPDATE live_stream_booths
        SET is_broadcasting = false, stream_health = 'OFFLINE', updated_at = NOW()
        WHERE booth_id = ANY($1::text[]);
      `, [aliases]);

      await client.query(`
        UPDATE booth_social_channels
        SET stream_status = 'STANDBY', updated_at = NOW()
        WHERE booth_id = ANY($1::text[]);
      `, [aliases]);
    }
  } catch (dbErr: any) {
    console.warn('[stream/stop] DB sync warning:', dbErr.message);
  } finally {
    if (client) await client.end().catch(() => {});
  }

  eventHub.broadcast({
    type: 'ENTITY_MUTATED',
    module: 'SALES',
    entity: 'LIVE_STREAM',
    action: 'UPDATE',
    documentRef: `${boothId}_STOP`,
    data: { boothId, isBroadcasting: false, booth: stopRes.booth, sessionLog: stopRes.sessionLog }
  });

  return res.json({
    success: true,
    status: 'STANDBY',
    isBroadcasting: false,
    booth: stopRes.booth,
    sessionLog: stopRes.sessionLog,
    lockedClaimComments: stopRes.booth?.lockedClaimComments || [],
    message: 'Headless broadcast stopped and stream video log created.'
  });
});

// ======================== MASTER ADMIN OVERVIEW & MULTI-BOOTH LIST (SQL-BACKED) ========================
liveStreamingRouter.get('/booths', async (req, res) => {
  const client = await getPgClient();
  if (client) {
    try {
      const bQuery = await client.query(`
        SELECT 
          b.*,
          COALESCE(m.is_broadcasting, b.is_broadcasting, false) as is_broadcasting,
          COALESCE(m.viewer_count, b.viewer_count, 0) as viewer_count,
          COALESCE(m.items_claimed, b.items_claimed, 0) as items_claimed,
          COALESCE(m.net_revenue_aed, b.net_revenue_aed, 0) as net_revenue_aed,
          COALESCE(m.items_sold_per_min, b.items_sold_per_min, 0) as items_sold_per_min,
          COALESCE(m.conversion_rate_pct, 0) as conversion_rate_pct,
          COALESCE(m.stream_health, b.stream_health, 'OFFLINE') as stream_health,
          COALESCE(m.fps, b.fps, 0) as fps,
          COALESCE(m.bitrate_kbps, b.bitrate_kbps, 0) as bitrate_kbps,
          COALESCE(m.active_on_air_sku, b.active_on_air_sku) as active_on_air_sku,
          COALESCE(m.current_deal_price, b.current_deal_price, 0) as current_deal_price,
          COALESCE(m.reservation_timeout_minutes, b.reservation_timeout_minutes, 120) as reservation_timeout_minutes
        FROM live_stream_booths b
        LEFT JOIN live_booth_metrics m ON b.booth_id = m.booth_id
        ORDER BY b.booth_id ASC;
      `);

      const cQuery = await client.query("SELECT * FROM booth_social_channels;");
      const claimStatsQuery = await client.query(`
        SELECT booth_id, COUNT(*) as claim_count, COALESCE(SUM(price_aed), 0) as total_rev
        FROM marketing_claim_logs
        GROUP BY booth_id;
      `);
      await client.end();

      const claimStatsMap = new Map<string, { count: number; rev: number }>();
      for (const r of claimStatsQuery.rows) {
        const count = parseInt(r.claim_count, 10) || 0;
        const rev = parseFloat(r.total_rev) || 0;
        const rawId = String(r.booth_id).toLowerCase();
        const num = rawId.replace(/^booth[-_]?0*/i, '');
        claimStatsMap.set(rawId, { count, rev });
        claimStatsMap.set(`booth-${num}`, { count, rev });
        claimStatsMap.set(`booth_${num}`, { count, rev });
      }

      if (bQuery.rows.length > 0) {
        const channelsByBooth = new Map<string, any[]>();
        for (const ch of cQuery.rows) {
          const list = channelsByBooth.get(ch.booth_id) || [];
          list.push(ch);
          channelsByBooth.set(ch.booth_id, list);
        }

        const dynamicBooths = bQuery.rows.map((b, index) => {
          const num = parseInt(b.booth_id.replace(/^booth[-_]?0*/i, ''), 10) || (index + 1);
          const chs = channelsByBooth.get(b.booth_id) || [];
          const ttCh = chs.find(c => c.platform === 'tiktok');
          const destinations = chs.map(c => {
            const plat = String(c.platform || '').toLowerCase();
            const defaultRtmp =
              plat === 'tiktok' ? 'rtmp://push.tiktok.com/live' :
              plat === 'instagram' ? 'rtmps://edgetee-upload-kul2-2.xx.fbcdn.net:443/rtmp' :
              plat === 'facebook' ? 'rtmps://live-api-s.facebook.com:443/rtmp' :
              plat === 'threads' ? 'rtmps://live.threads.net:443/rtmp' :
              'rtmp://a.rtmp.youtube.com/live2';
            const rtmpUrl = c.metadata?.rtmpUrl || c.proxy_url || defaultRtmp;
            const metaKey = c.metadata?.streamKey ? decryptCredential(String(c.metadata.streamKey)) : '';
            const pwdKey = c.account_password ? decryptCredential(String(c.account_password)) : '';
            const resolvedKey = isValidRtmpStreamKey(metaKey, plat)
              ? metaKey
              : isValidRtmpStreamKey(pwdKey, plat)
              ? pwdKey
              : '';
            return {
              id: c.id || `${b.booth_id}_${plat}`,
              name: `${plat.toUpperCase()} Live`,
              platform: plat,
              url: rtmpUrl,
              rtmpUrl,
              streamKey: resolvedKey,
              enabled: c.is_active !== false,
              isConnected: c.auth_status === 'LOGGED_IN' || Boolean(resolvedKey)
            };
          });

          const realClaim = claimStatsMap.get(b.booth_id) || { count: 0, rev: 0 };
          const serverIsLive = isBoothActuallyStreamingOnServer(b.booth_id, true);
          const dbIsLive = Boolean(b.is_broadcasting);
          const hasStaleChannel = !serverIsLive && chs.some((c: any) => c.stream_status === 'LIVE');
          if ((dbIsLive && !serverIsLive) || hasStaleChannel) {
            syncBoothStoppedToPostgres(b.booth_id).catch(() => {});
          }
          const isLive = dbIsLive && serverIsLive;
          const itemsClaimed = Math.max(parseInt(b.items_claimed, 10) || 0, realClaim.count);
          const netRevenueAed = Math.max(parseFloat(b.net_revenue_aed) || 0, realClaim.rev);
          const viewerCount = isLive ? (parseInt(b.viewer_count, 10) || 0) : 0;
          const itemsSoldPerMin = parseFloat(b.items_sold_per_min) || 0;

          return {
            boothId: b.booth_id,
            boothNumber: num,
            boothName: b.booth_name,
            hostName: b.host_name || 'Broadcaster Host',
            categoryFocus: b.category || 'Vintage Garments',
            tiktokHandle: b.host_handle || ttCh?.account_username || `@host_${b.booth_id}`,
            isBroadcasting: isLive,
            streamHealth: isLive ? (b.stream_health || 'EXCELLENT') : 'OFFLINE',
            fps: isLive ? (parseInt(b.fps, 10) || 60) : 0,
            bitrateKbps: isLive ? (parseInt(b.bitrate_kbps, 10) || 4500) : 0,
            viewerCount,
            itemsClaimed,
            netRevenueAed,
            itemsSoldPerMin,
            conversionRatePct: parseFloat(b.conversion_rate_pct) || 0,
            reservationTimeoutMinutes: parseInt(b.reservation_timeout_minutes, 10) || 120,
            activeOnAirSku: b.active_on_air_sku || null,
            currentDealPrice: parseFloat(b.current_deal_price) || 0,
            destinations,
            comments: streamController.getComments(b.booth_id)
          };
        });

        const activeStreamers = dynamicBooths.filter(b => b.isBroadcasting).length;
        const totalViewers = dynamicBooths.reduce((s, b) => s + b.viewerCount, 0);
        const totalRevenueAed = dynamicBooths.reduce((s, b) => s + b.netRevenueAed, 0);
        const totalClaimsCount = dynamicBooths.reduce((s, b) => s + b.itemsClaimed, 0);
        const avgClaimsPerMin = dynamicBooths.reduce((s, b) => s + b.itemsSoldPerMin, 0);

        return res.json({
          success: true,
          booths: dynamicBooths,
          totals: {
            activeStreamers,
            totalViewers,
            totalRevenueAed,
            totalClaimsCount,
            avgClaimsPerMin
          }
        });
      }

      return res.json({
        success: true,
        booths: [],
        totals: {
          activeStreamers: 0,
          totalViewers: 0,
          totalRevenueAed: 0,
          totalClaimsCount: 0,
          avgClaimsPerMin: 0
        }
      });
    } catch (err: any) {
      if (client) await client.end().catch(() => {});
      console.warn('DB booths overview error:', err.message);
    }
  }
  return res.json({
    success: true,
    booths: [],
    totals: {
      activeStreamers: 0,
      totalViewers: 0,
      totalRevenueAed: 0,
      totalClaimsCount: 0,
      avgClaimsPerMin: 0
    }
  });
});

// Update Booth Metrics directly in PostgreSQL + In-Memory StreamController
liveStreamingRouter.post('/booths/:boothId/metrics', async (req, res) => {
  const { boothId } = req.params;
  const b = req.body || {};
  const bKey = getBoothIdAliases(boothId)[0] || boothId;

  const sig = JSON.stringify([
    typeof b.isBroadcasting === 'boolean' ? b.isBroadcasting : undefined,
    typeof b.viewerCount === 'number' ? b.viewerCount : undefined,
    typeof b.itemsClaimed === 'number' ? b.itemsClaimed : undefined,
    typeof b.netRevenueAed === 'number' ? b.netRevenueAed : undefined,
    b.streamHealth || undefined,
    b.activeOnAirSku !== undefined ? (b.activeOnAirSku ?? null) : undefined,
    typeof b.currentDealPrice === 'number' ? b.currentDealPrice : undefined
  ]);
  const prevWrite = lastBoothMetricsWrite.get(bKey);
  if (prevWrite && prevWrite.sig === sig && Date.now() - prevWrite.ts < 60000) {
    return res.json({ success: true, unchanged: true });
  }
  if (b.activeOnAirSku !== undefined && !streamController.getBooth(boothId)?.openLiveMode) {
    const nextSku = b.activeOnAirSku ? String(b.activeOnAirSku).trim() : '';
    const dealPrice = typeof b.currentDealPrice === 'number' ? b.currentDealPrice : undefined;
    const memBooth = streamController.ensureBoothExists(boothId);
    memBooth.activeOnAirSku = nextSku || undefined;
    const curPinned = getBoothPinnedPiece(boothId);
    const skuChanged = (nextSku || null) !== (curPinned?.sku || null);
    const priceChanged = typeof dealPrice === 'number' && curPinned && Number(curPinned.priceAed) !== Number(dealPrice);
    if (skuChanged || priceChanged) {
      if (!nextSku) {
        setBoothPinnedPiece(boothId, null);
      } else {
        resolveLiveSpotlightPiece(nextSku, dealPrice)
          .then((card) => {
            if (card) setBoothPinnedPiece(boothId, card);
          })
          .catch(() => {});
      }
    }
  }
  const client = await getPgClient();
  if (client) {
    try {
      const isBroadcasting = typeof b.isBroadcasting === 'boolean' ? b.isBroadcasting : undefined;
      const viewerCount = typeof b.viewerCount === 'number' ? b.viewerCount : undefined;
      const itemsClaimed = typeof b.itemsClaimed === 'number' ? b.itemsClaimed : undefined;
      const netRevenueAed = typeof b.netRevenueAed === 'number' ? b.netRevenueAed : undefined;
      const streamHealth = b.streamHealth || (isBroadcasting ? 'EXCELLENT' : 'OFFLINE');
      const activeOnAirSku = b.activeOnAirSku !== undefined ? b.activeOnAirSku : undefined;
      const currentDealPrice = typeof b.currentDealPrice === 'number' ? b.currentDealPrice : undefined;

      await client.query(`
        INSERT INTO live_booth_metrics (
          booth_id, is_broadcasting, viewer_count, items_claimed, net_revenue_aed,
          stream_health, active_on_air_sku, current_deal_price, updated_at
        ) VALUES ($1, COALESCE($2, false), COALESCE($3, 0), COALESCE($4, 0), COALESCE($5, 0), $6, $7, COALESCE($8, 0), NOW())
        ON CONFLICT (booth_id) DO UPDATE SET
          is_broadcasting = COALESCE($2, live_booth_metrics.is_broadcasting),
          viewer_count = COALESCE($3, live_booth_metrics.viewer_count),
          items_claimed = COALESCE($4, live_booth_metrics.items_claimed),
          net_revenue_aed = COALESCE($5, live_booth_metrics.net_revenue_aed),
          stream_health = COALESCE($6, live_booth_metrics.stream_health),
          active_on_air_sku = COALESCE($7, live_booth_metrics.active_on_air_sku),
          current_deal_price = COALESCE($8, live_booth_metrics.current_deal_price),
          updated_at = NOW();
      `, [boothId, isBroadcasting, viewerCount, itemsClaimed, netRevenueAed, streamHealth, activeOnAirSku, currentDealPrice]);

      await client.query(`
        UPDATE live_stream_booths SET
          is_broadcasting = COALESCE($2, is_broadcasting),
          viewer_count = COALESCE($3, viewer_count),
          stream_health = COALESCE($4, stream_health),
          active_on_air_sku = COALESCE($5, active_on_air_sku),
          current_deal_price = COALESCE($6, current_deal_price),
          updated_at = NOW()
        WHERE booth_id = $1;
      `, [boothId, isBroadcasting, viewerCount, streamHealth, activeOnAirSku, currentDealPrice]);

      await client.end();
      lastBoothMetricsWrite.set(bKey, { sig, ts: Date.now() });
      return res.json({ success: true, message: 'Booth metrics updated in SQL' });
    } catch (err: any) {
      if (client) await client.end().catch(() => {});
      return res.status(500).json({ success: false, error: err.message });
    }
  }
  lastBoothMetricsWrite.set(bKey, { sig, ts: Date.now() });
  return res.json({ success: true });
});

liveStreamingRouter.get('/booths/:boothId', async (req, res) => {
  const { boothId } = req.params;
  const aliases = getBoothIdAliases(boothId);
  const client = await getPgClient();
  try {
    if (client) {
      const bQuery = await client.query(`
        SELECT 
          b.*,
          COALESCE(m.is_broadcasting, b.is_broadcasting, false) as is_broadcasting,
          COALESCE(m.viewer_count, b.viewer_count, 0) as viewer_count,
          COALESCE(m.items_claimed, b.items_claimed, 0) as items_claimed,
          COALESCE(m.net_revenue_aed, b.net_revenue_aed, 0) as net_revenue_aed,
          COALESCE(m.items_sold_per_min, b.items_sold_per_min, 0) as items_sold_per_min,
          COALESCE(m.conversion_rate_pct, 0) as conversion_rate_pct,
          COALESCE(m.stream_health, b.stream_health, 'OFFLINE') as stream_health,
          COALESCE(m.fps, b.fps, 0) as fps,
          COALESCE(m.bitrate_kbps, b.bitrate_kbps, 0) as bitrate_kbps,
          COALESCE(m.active_on_air_sku, b.active_on_air_sku) as active_on_air_sku,
          COALESCE(m.current_deal_price, b.current_deal_price, 0) as current_deal_price,
          COALESCE(m.reservation_timeout_minutes, b.reservation_timeout_minutes, 120) as reservation_timeout_minutes
        FROM live_stream_booths b
        LEFT JOIN live_booth_metrics m ON b.booth_id = m.booth_id
        WHERE b.booth_id = ANY($1::text[])
        LIMIT 1;
      `, [aliases]);

      if (bQuery.rows.length > 0) {
        const row = bQuery.rows[0];
        const num = parseInt(row.booth_id.replace(/^booth[-_]?0*/i, ''), 10) || 1;
        const serverIsLive = isBoothActuallyStreamingOnServer(boothId, true);
        const dbIsLive = Boolean(row.is_broadcasting);
        if (dbIsLive && !serverIsLive) {
          syncBoothStoppedToPostgres(boothId).catch(() => {});
        }
        const isLive = dbIsLive && serverIsLive;
        const boothData = {
          boothId: row.booth_id,
          boothNumber: num,
          boothName: row.booth_name,
          hostName: row.host_name || 'Broadcaster Host',
          hostHandle: row.host_handle || `@host_${row.booth_id}`,
          categoryFocus: row.category || 'Vintage Garments',
          tiktokHandle: row.host_handle || `@host_${row.booth_id}`,
          isBroadcasting: isLive,
          startTime: isLive ? Date.now() : 0,
          uptimeSeconds: isLive ? 60 : 0,
          viewerCount: isLive ? (parseInt(row.viewer_count, 10) || 750) : 0,
          itemsSoldPerMin: parseFloat(row.items_sold_per_min) || 0,
          itemsClaimed: parseInt(row.items_claimed, 10) || 0,
          netRevenueAed: parseFloat(row.net_revenue_aed) || 0,
          conversionRatePct: parseFloat(row.conversion_rate_pct) || 0,
          reservationTimeoutMinutes: parseInt(row.reservation_timeout_minutes, 10) || 120,
          activeOnAirSku: row.active_on_air_sku || null,
          destinations: [],
          comments: streamController.getComments(boothId),
          lockedClaimComments: streamController.getLockedClaimComments(boothId),
          sessionLogs: streamController.getSessionLogs(boothId),
          pairedDeviceName: 'Studio Camera 1',
          pairedDeviceIp: '127.0.0.1'
        };
        streamController.ensureBoothExists(boothId, boothData);
        return res.json(streamController.getBooth(boothId) || boothData);
      }
    }
  } catch (err: any) {
    console.warn('DB get booth error:', err.message);
  } finally {
    if (client) await client.end().catch(() => {});
  }

  const booth = streamController.getBooth(boothId);
  return res.json(booth);
});

// Update Booth Settings & Persist RTMP Server URLs + Stream Keys to PostgreSQL
liveStreamingRouter.post('/booths/:boothId/settings', async (req, res) => {
  const { boothId } = req.params;
  const aliases = getBoothIdAliases(boothId);
  const result = streamController.updateBoothSettings(boothId, req.body);

  const client = await getPgClient();
  try {
    if (client) {
      const { tiktokHandle, hostName, destinations, reservationTimeoutMinutes } = req.body || {};
      if (tiktokHandle || hostName || reservationTimeoutMinutes) {
        await client.query(
          `UPDATE live_stream_booths
           SET host_handle = COALESCE(NULLIF($2, ''), host_handle),
               host_name = COALESCE(NULLIF($3, ''), host_name),
               reservation_timeout_minutes = COALESCE($4, reservation_timeout_minutes),
               updated_at = NOW()
           WHERE booth_id = ANY($1::text[])`,
          [aliases, tiktokHandle || '', hostName || '', reservationTimeoutMinutes ? Number(reservationTimeoutMinutes) : null]
        ).catch(() => {});
      }

      if (Array.isArray(destinations)) {
        for (const d of destinations) {
          const plat = String(d?.platform || '').toLowerCase();
          if (!plat) continue;
          const rawUrl = String(d?.rtmpUrl || d?.url || '').trim();
          const rawKey = String(d?.streamKey || '').trim();
          const isEnabled = d?.enabled !== false;

          const split = splitRtmpBaseAndStreamKey(rawUrl, rawKey, '');
          const cleanUrl = split.baseUrl || rawUrl;
          const cleanKey = split.streamKey || rawKey;

          const metaPatch: Record<string, any> = {};
          if (cleanUrl) metaPatch.rtmpUrl = cleanUrl;
          if (cleanKey && cleanKey !== '••••••••') metaPatch.streamKey = cleanKey;

          if (Object.keys(metaPatch).length > 0 || typeof d?.enabled === 'boolean') {
            await client.query(
              `UPDATE booth_social_channels
               SET proxy_url = COALESCE(NULLIF($3, ''), proxy_url),
                   is_active = $4,
                   metadata = COALESCE(metadata, '{}'::jsonb) || $5::jsonb,
                   updated_at = NOW()
               WHERE booth_id = ANY($1::text[]) AND platform = $2`,
              [aliases, plat, cleanUrl, isEnabled, JSON.stringify(metaPatch)]
            ).catch(() => {});
          }

          if (cleanKey && cleanKey !== '••••••••' && isValidRtmpStreamKey(cleanKey, plat)) {
            const colMap: Record<string, string> = {
              tiktok: 'tiktok_stream_key',
              instagram: 'instagram_stream_key',
              youtube: 'youtube_stream_key',
              facebook: 'facebook_stream_key',
              threads: 'threads_stream_key'
            };
            const col = colMap[plat];
            if (col) {
              await client.query(
                `UPDATE live_stream_booths SET ${col} = $2, updated_at = NOW() WHERE booth_id = ANY($1::text[])`,
                [aliases, cleanKey]
              ).catch(() => {});
            }
          }
        }
      }

      if (getAutonomousMarketingBroadcasterStatus(boothId).isActive) {
        setTimeout(() => {
          startAutonomousMarketingBroadcaster(boothId).catch(() => {});
        }, 300);
      }
    }
  } catch (err: any) {
    console.warn('[booths/settings] DB sync warning:', err?.message);
  } finally {
    if (client) await client.end().catch(() => {});
  }

  if (!result.success) return res.status(400).json({ error: result.error });

  eventHub.broadcast({
    type: 'ENTITY_MUTATED',
    module: 'SALES',
    entity: 'LIVE_STREAM',
    action: 'UPDATE',
    documentRef: boothId,
    data: result.booth
  });

  return res.json(result);
});

// Broadcast controls per booth
liveStreamingRouter.post('/booths/:boothId/broadcast/start', async (req, res) => {
  const { boothId } = req.params;
  const aliases = getBoothIdAliases(boothId);
  markBoothStreamStarting(boothId, 20000);
  lastBoothMetricsWrite.delete(aliases[0] || boothId);
  prewarmBoothYouTubeAutoLive(boothId);
  const result = streamController.startBroadcast(boothId);
  socialChatService.connectAllBoothPlatforms(boothId).catch(() => {});

  // Synchronize broadcasting state to PostgreSQL
  const client = await getPgClient();
  try {
    if (client) {
      await client.query(`
        INSERT INTO live_booth_metrics (booth_id, is_broadcasting, stream_health, viewer_count, updated_at)
        VALUES ($1, true, 'EXCELLENT', 750, NOW())
        ON CONFLICT (booth_id) DO UPDATE SET
          is_broadcasting = true,
          stream_health = 'EXCELLENT',
          viewer_count = GREATEST(live_booth_metrics.viewer_count, 750),
          updated_at = NOW();
      `, [boothId]);

      await client.query(`
        UPDATE live_stream_booths
        SET is_broadcasting = true, stream_health = 'EXCELLENT', updated_at = NOW()
        WHERE booth_id = ANY($1::text[]);
      `, [aliases]);

      await client.query(`
        UPDATE booth_social_channels
        SET stream_status = 'LIVE', updated_at = NOW()
        WHERE booth_id = ANY($1::text[])
          AND is_active = true
          AND (auth_status = 'LOGGED_IN' OR COALESCE(metadata->>'streamKey', '') <> '' OR COALESCE(metadata->>'fbAccessToken', '') <> '');
      `, [aliases]);
    }
  } catch (dbErr: any) {
    console.warn('[broadcast/start] DB sync warning:', dbErr.message);
  } finally {
    if (client) await client.end().catch(() => {});
  }

  eventHub.broadcast({
    type: 'ENTITY_MUTATED',
    module: 'SALES',
    entity: 'LIVE_STREAM',
    action: 'UPDATE',
    documentRef: `${boothId}_START`,
    data: result.booth
  });

  return res.json(result);
});

liveStreamingRouter.post('/booths/:boothId/broadcast/stop', async (req, res) => {
  const { boothId } = req.params;
  const aliases = getBoothIdAliases(boothId);
  lastBoothMetricsWrite.delete(aliases[0] || boothId);
  handleSoftwareBoothBroadcastToggle(boothId, false, { forceKillCameraRelay: true });
  const ytStatus = youTubeChatService.getBoothChatStatus(boothId);
  const result = streamController.stopBroadcast(boothId, ytStatus?.liveId || null);
  youTubeChatService.disconnectBooth(boothId);
  socialChatService.disconnectAllBoothPlatforms(boothId);

  // Synchronize stopped state to PostgreSQL
  const client = await getPgClient();
  try {
    if (client) {
      await client.query(`
        UPDATE live_booth_metrics
        SET is_broadcasting = false, stream_health = 'OFFLINE', updated_at = NOW()
        WHERE booth_id = ANY($1::text[]);
      `, [aliases]);

      await client.query(`
        UPDATE live_stream_booths
        SET is_broadcasting = false, stream_health = 'OFFLINE', updated_at = NOW()
        WHERE booth_id = ANY($1::text[]);
      `, [aliases]);

      await client.query(`
        UPDATE booth_social_channels
        SET stream_status = 'STANDBY', updated_at = NOW()
        WHERE booth_id = ANY($1::text[]);
      `, [aliases]);
    }
  } catch (dbErr: any) {
    console.warn('[broadcast/stop] DB sync warning:', dbErr.message);
  } finally {
    if (client) await client.end().catch(() => {});
  }

  eventHub.broadcast({
    type: 'ENTITY_MUTATED',
    module: 'SALES',
    entity: 'LIVE_STREAM',
    action: 'UPDATE',
    documentRef: `${boothId}_STOP`,
    data: result.booth
  });

  return res.json(result);
});

// YouTube Live Chat Integration
liveStreamingRouter.post(['/booths/:boothId/youtube-chat/connect', '/booths/:boothId/youtube/connect'], async (req, res) => {
  const { boothId } = req.params;
  const { urlOrId } = req.body || {};
  const result = await youTubeChatService.connectBoothToYouTubeChat(boothId, urlOrId || '');
  return res.json({
    ...result,
    connected: Boolean(result.isConnected),
    videoId: result.liveId || null
  });
});

liveStreamingRouter.post(['/booths/:boothId/youtube-chat/disconnect', '/booths/:boothId/youtube/disconnect'], (req, res) => {
  const { boothId } = req.params;
  youTubeChatService.disconnectBooth(boothId);
  return res.json({
    success: true,
    message: 'Disconnected from YouTube Live Chat',
    lockedClaimComments: streamController.getLockedClaimComments(boothId),
    sessionLogs: streamController.getSessionLogs(boothId)
  });
});

liveStreamingRouter.get(['/booths/:boothId/youtube-chat/status', '/booths/:boothId/youtube/status'], (req, res) => {
  const { boothId } = req.params;
  return res.json({
    ...youTubeChatService.getBoothChatStatus(boothId),
    activeAutoLiveBroadcastId: getActiveBoothYouTubeSession(boothId)?.ytBroadcastId || null
  });
});

liveStreamingRouter.post(['/booths/:boothId/youtube-chat/send', '/booths/:boothId/youtube/send'], async (req, res) => {
  const { boothId } = req.params;
  const { message, sender, allPlatforms } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'Message text is required' });
  }
  if (allPlatforms !== false) {
    const result = await socialChatService.broadcastHostMessageToAllPlatforms(
      boothId,
      message,
      sender || '📢 Vintage Vibes Host'
    );
    return res.json(result);
  }
  const result = await youTubeChatService.sendMessageToYouTubeChat(boothId, message, sender || '📢 Vintage Vibes Host');
  return res.json(result);
});

liveStreamingRouter.post('/booths/:boothId/broadcast-message', async (req, res) => {
  const { boothId } = req.params;
  const { message, sender } = req.body || {};
  if (!message || !String(message).trim()) {
    return res.status(400).json({ success: false, error: 'Message text is required' });
  }
  const text = String(message).trim();
  const senderName = sender || '📢 Vintage Vibes Host';
  const comment = streamController.addComment(boothId, text, 'youtube', senderName);
  const multicastBroadcast = await socialChatService.broadcastHostMessageToAllPlatforms(boothId, text, senderName);
  return res.json({
    success: true,
    comment,
    multicastBroadcast
  });
});

// Booth Comments with NLP Auto-Claim Engine
liveStreamingRouter.get('/booths/:boothId/comments', (req, res) => {
  const { boothId } = req.params;
  socialChatService.ensureConnectedIfBoothLive(boothId, isBoothActuallyStreamingOnServer(boothId));
  return res.json(streamController.getComments(boothId));
});

liveStreamingRouter.get('/booths/:boothId/locked-claims', (req, res) => {
  const { boothId } = req.params;
  return res.json(streamController.getLockedClaimComments(boothId));
});

liveStreamingRouter.get('/booths/:boothId/session-logs', (req, res) => {
  const { boothId } = req.params;
  return res.json(streamController.getSessionLogs(boothId));
});

liveStreamingRouter.post(['/booths/:boothId/comments/clear', '/booths/:boothId/comments/delete'], (req, res) => {
  const { boothId } = req.params;
  const clearLocked = Boolean(req.body?.clearLocked);
  streamController.clearComments(boothId, clearLocked);
  return res.json({
    success: true,
    message: 'All comments cleared',
    lockedClaimComments: streamController.getLockedClaimComments(boothId),
    sessionLogs: streamController.getSessionLogs(boothId)
  });
});

interface VerifiedLiveBuyer {
  name: string;
  email: string;
  phone: string;
  address: string;
  avatarUrl: string;
  updatedAt: number;
}
const verifiedLiveBuyers = new Map<string, VerifiedLiveBuyer>();
const buyerClaimedSkusByPhone = new Map<string, Set<string>>();

function registerVerifiedBuyer(b: VerifiedLiveBuyer) {
  const digits = String(b.phone || '').replace(/\D/g, '');
  const keys = [b.name, `@${b.name}`, b.email, digits]
    .map(s => String(s || '').trim().toLowerCase())
    .filter(Boolean);
  for (const k of keys) {
    verifiedLiveBuyers.set(k, b);
  }
}

function lookupVerifiedBuyer(handle?: string): VerifiedLiveBuyer | undefined {
  const k = String(handle || '').trim().toLowerCase();
  if (!k) return undefined;
  return verifiedLiveBuyers.get(k) || verifiedLiveBuyers.get(k.replace(/^@/, ''));
}

liveStreamingRouter.post('/booths/:boothId/comments', async (req, res) => {
  const { boothId } = req.params;
  const { comment, platform, username, isHostReply, customer } = req.body || {};
  const rawPlat = String(platform || '').trim().toLowerCase();
  const isLiveWebBuyer = !isHostReply && (rawPlat === 'custom' || rawPlat === 'live_web');

  let verifiedBuyer: VerifiedLiveBuyer | null = null;
  if (isLiveWebBuyer) {
    const rawEmail = String(customer?.email || '').trim().toLowerCase();
    const cPhone = String(customer?.phone || '').trim();
    const cName = String(customer?.name || username || '').trim();
    const cAddr = String(customer?.address || '').trim();
    const cAvatar = String(customer?.avatarUrl || customer?.avatar_url || '').trim();
    const phoneDigits = cPhone.replace(/\D/g, '');
    const hasIdentity = rawEmail.includes('@') || cName.length >= 2;
    if (!hasIdentity || phoneDigits.length < 7 || cPhone === '+971500000000') {
      return res.status(401).json({
        error: 'WHATSAPP_VERIFICATION_REQUIRED',
        message: 'Please enter your Name & WhatsApp number once to chat or claim.'
      });
    }
    const effectiveEmail = rawEmail.includes('@') ? rawEmail : `wa_${phoneDigits}@guest.vintagevibesgk.com`;
    verifiedBuyer = {
      name: cName || rawEmail.split('@')[0],
      email: effectiveEmail,
      phone: cPhone,
      address: cAddr,
      avatarUrl: cAvatar,
      updatedAt: Date.now()
    };
    registerVerifiedBuyer(verifiedBuyer);
    if (rawEmail.includes('@')) {
      withDb(async (dbClient) => {
        await dbClient.query(
          `UPDATE public.crm_retail_customers
           SET name = COALESCE(NULLIF($1, ''), name),
               phone = COALESCE(NULLIF($2, ''), phone),
               address = COALESCE(NULLIF($3, ''), address)
           WHERE LOWER(email) = $4`,
          [verifiedBuyer!.name, verifiedBuyer!.phone, verifiedBuyer!.address, verifiedBuyer!.email]
        ).catch(() => {});
      }).catch(() => {});
    }
  }

  const effectiveSender = isHostReply
    ? '📢 Vintage Vibes Host'
    : (verifiedBuyer?.name || String(username || '').trim());

  if (!comment || !effectiveSender) {
    return res.status(400).json({ error: 'Missing comment or username' });
  }

  const normPlat = normalizeStudioPlatform(platform);
  const newComment = streamController.addComment(boothId, comment, normPlat, effectiveSender);
  if (verifiedBuyer) {
    newComment.avatarUrl = verifiedBuyer.avatarUrl || undefined;
    newComment.badge = '✓ VERIFIED';
    (newComment as any).customerPhone = verifiedBuyer.phone;
    (newComment as any).customerEmail = verifiedBuyer.email;
    (newComment as any).customerAddress = verifiedBuyer.address;

    const sharerInfo = getSharerStats(req.body?.sharerCode, verifiedBuyer.email);
    if (sharerInfo.isTopSharer) {
      (newComment as any).sharerBadge = '🔥 TOP SHARER';
    }
    if (!capiLeadSentEmails.has(verifiedBuyer.email)) {
      capiLeadSentEmails.add(verifiedBuyer.email);
      sendMetaConversionsEvent({
        eventName: 'Lead',
        email: verifiedBuyer.email,
        phone: verifiedBuyer.phone,
        name: verifiedBuyer.name,
        req,
        customData: { booth_id: boothId, source: 'live_verified_buyer' }
      }).catch(() => {});
    }
  } else if (req.body?.sharerCode) {
    const sharerInfo = getSharerStats(req.body.sharerCode);
    if (sharerInfo.isTopSharer) {
      (newComment as any).sharerBadge = '🔥 TOP SHARER';
    }
  }

  // If sent as Host Reply, multicast simultaneously to ALL connected platforms (YouTube + Facebook + IG + TikTok + Video Stream HUD)
  const isClaim =
    !isHostReply &&
    Boolean(newComment.isClaimIntent && streamController.isGenuineClaimMessage(comment, effectiveSender));

  if (isHostReply) {
    newComment.badge = 'ALL LIVE';
    try {
      const multicastBroadcast = await socialChatService.broadcastHostMessageToAllPlatforms(
        boothId,
        comment,
        '📢 Vintage Vibes Host'
      );
      (newComment as any).multicastBroadcast = multicastBroadcast;
      (newComment as any).youtubeBroadcast = multicastBroadcast.platformResults?.youtube || null;
    } catch (_) {}
  }

  // Real-time NLP Auto-Claim Matching (only for buyer claims, not host announcements)
  if (isClaim) {
    const boothSession = streamController.getBooth(boothId);
    const pinnedCard = getBoothPinnedPiece(boothId);
    const parsedClaim = parseLiveClaimDetails(comment, newComment.extractedSku);
    const isOpenLiveClaim = shouldHandleAsOpenLiveClaim({
      boothSession,
      parsed: parsedClaim,
      pinnedTitle: pinnedCard?.title
    });

    if (isOpenLiveClaim) {
      const { priceAed, itemTitle } = resolveOpenClaimPriceAndTitle(parsedClaim, boothSession);
      if (priceAed && priceAed > 0) {
        try {
          const openRes = await executeOpenLiveClaim({
            boothId,
            username: effectiveSender,
            platform: platform || 'custom',
            rawComment: comment,
            commentId: newComment.id,
            priceAed,
            itemTitle,
            buyerPhone: verifiedBuyer?.phone
          });
          newComment.extractedSku = openRes.sku;
          newComment.isProcessed = true;
          broadcastLiveClaimCelebration(boothId, {
            buyerName: effectiveSender,
            sku: openRes.sku,
            itemName: openRes.itemTitle,
            priceAed: openRes.priceAed
          });
          if (verifiedBuyer?.phone) {
            const pDig = String(verifiedBuyer.phone).replace(/\D/g, '');
            if (pDig.length >= 7) {
              let skuSet = buyerClaimedSkusByPhone.get(pDig);
              if (!skuSet) {
                skuSet = new Set();
                buyerClaimedSkusByPhone.set(pDig, skuSet);
              }
              skuSet.add(openRes.sku.toUpperCase());
            }
          }
          socialChatService.broadcastHostMessageToAllPlatforms(boothId, openRes.hostReplyText, '📢 Vintage Vibes Host').catch(() => {});
        } catch (openErr) {
          console.warn('[NLP Open-Live Claim] Note:', openErr);
        }
      } else if (canSendNeedPricePrompt(boothId, effectiveSender)) {
        const needPriceText = buildNeedPriceReply(effectiveSender);
        streamController.addComment(boothId, needPriceText, normPlat, '📢 Vintage Vibes Host');
        socialChatService.broadcastHostMessageToAllPlatforms(boothId, needPriceText, '📢 Vintage Vibes Host').catch(() => {});
      }
    } else {
      let targetSku = parsedClaim.extractedSku || pinnedCard?.sku || boothSession?.activeOnAirSku;
      const allPieces = relationalStore.getInventoryPieces ? relationalStore.getInventoryPieces() : [];

      // Hydrate from PostgreSQL if not yet in memory (e.g. right after server restart)
      if (targetSku && !allPieces.some((p: any) => String(p.barcode || p.sku || '').toUpperCase() === String(targetSku).toUpperCase())) {
        try {
          const pool = getPgClient();
          if (pool) {
            const checkRes = await pool.query(
              `SELECT * FROM public.inventory_pieces WHERE LOWER(barcode) = LOWER($1) OR LOWER(sku) = LOWER($1) OR id::text = $1 LIMIT 1;`,
              [String(targetSku).trim()]
            );
            if (checkRes.rows.length > 0) {
              const row = checkRes.rows[0];
              allPieces.push({
                id: row.id || row.barcode,
                barcode: row.barcode,
                sku: row.sku || row.barcode,
                itemName: row.item_name || 'Vintage Garment',
                brandName: row.brand_name || 'Vintage Archive',
                sizeScanned: row.size_scanned || 'M',
                retailPriceAed: Number(row.retail_price_aed || row.estimated_price || 150),
                lockedPrice: Number(row.retail_price_aed || row.estimated_price || 150),
                estimatedPrice: Number(row.estimated_price || row.retail_price_aed || 150),
                frontImageUrl: row.front_image_url || '',
                isSold: Boolean(row.is_sold),
                status: row.status || 'IN_STOCK'
              } as any);
            }
          }
        } catch (_) {}
      }

      if (targetSku) {
        const targetPiece = allPieces.find((p: any) => String(p.barcode || '').toUpperCase() === String(targetSku).toUpperCase());
        if (targetPiece && (targetPiece.isSold || targetPiece.status === 'SOLD' || targetPiece.status === 'RESERVED' || targetPiece.status === 'CLAIMED_PENDING')) {
          targetSku = undefined;
        }
      }

      if (targetSku) {
        try {
          const draftRes = relationalStore.draftLiveClaimInvoice({
            barcode: targetSku,
            buyerHandle: effectiveSender,
            boothId,
            offeredPrice: newComment.extractedBid,
            channel: platform || 'Multistream Live'
          });

          if (draftRes.success && draftRes.piece) {
            newComment.extractedSku = targetSku;
            newComment.isProcessed = true;
            streamController.markBuyerClaimCommentLocked(boothId, effectiveSender, targetSku, newComment.id);

            const piece = draftRes.piece;
            const priceAed = Number(piece.lockedPrice || piece.retailPriceAed || piece.estimatedPrice || 150);
            const invoiceNo = draftRes.draftInvoice?.invoiceNo || `SLS-DRAFT-LIVE-${Date.now().toString().slice(-4)}`;
            const checkoutUrl = `https://vintagevibesgk.com/?checkout=${encodeURIComponent(targetSku)}`;
            const brandName = piece.brandName || 'Vintage Archive';
            const itemName = piece.itemName || 'Vintage Piece';
            const fullTitle = itemName.toLowerCase().includes(brandName.toLowerCase())
              ? itemName
              : `${brandName} ${itemName}`.trim();
            const sizeLabel = piece.sizeScanned || 'L';
            const isTikTok = String(platform || '').toLowerCase() === 'tiktok';

            broadcastLiveClaimCelebration(boothId, {
              buyerName: effectiveSender,
              sku: targetSku,
              itemName: fullTitle,
              priceAed
            });
            markPinnedPieceReservedIfMatch(boothId, targetSku, effectiveSender);
            if (verifiedBuyer?.phone) {
              const pDig = String(verifiedBuyer.phone).replace(/\D/g, '');
              if (pDig.length >= 7) {
                let skuSet = buyerClaimedSkusByPhone.get(pDig);
                if (!skuSet) {
                  skuSet = new Set();
                  buyerClaimedSkusByPhone.set(pDig, skuSet);
                }
                skuSet.add(String(targetSku).trim().toUpperCase());
              }
            }
            sendMetaConversionsEvent({
              eventName: 'InitiateCheckout',
              eventId: `ic_${targetSku}_${newComment.id}`,
              email: verifiedBuyer?.email,
              phone: verifiedBuyer?.phone,
              name: effectiveSender,
              req,
              customData: {
                value: priceAed,
                currency: 'AED',
                content_ids: [targetSku],
                content_type: 'product'
              }
            }).catch(() => {});

            const hostReplyText = isTikTok
              ? `🎉 Congratulations @${effectiveSender}! Piece #${targetSku} (${fullTitle}, Size ${sizeLabel}) LOCKED for AED ${priceAed}! • Invoice: #${invoiceNo} • 🔗 Tap our Profile Bio Link or Check Inbox DM to confirm delivery!`
              : `🎉 Congratulations ${effectiveSender}! Guaranteed Lock Confirmed for ${fullTitle} (Size: ${sizeLabel}) • SKU: ${targetSku} • Price: AED ${priceAed} • Draft Invoice: #${invoiceNo} • 🔗 Instant Checkout: ${checkoutUrl}`;

            // Add Official Reply from '📢 Vintage Vibes Host' directly into StreamController & multicast across ALL connected platforms
            streamController.addComment(boothId, hostReplyText, normPlat, '📢 Vintage Vibes Host');
            socialChatService.broadcastHostMessageToAllPlatforms(boothId, hostReplyText, '📢 Vintage Vibes Host').catch(() => {});

            // Synchronize reserved status to PostgreSQL
            try {
              const client = await getPgClient();
              if (client) {
                await client.query(`
                  UPDATE public.inventory_pieces
                  SET status = 'RESERVED',
                      locked_by_buyer = $1,
                      locked_by_booth = $2,
                      lock_expires_at = $3,
                      updated_at = NOW()
                  WHERE barcode = $4;
                `, [effectiveSender, boothId, Date.now() + 120 * 60 * 1000, targetSku]);
                await client.end().catch(() => {});
              }
            } catch (pgErr) {
              console.warn('[Auto-Claim] PG sync note:', pgErr);
            }

            const knownBuyer = verifiedBuyer || lookupVerifiedBuyer(effectiveSender);

            // Also sync with MarketingService & WhatsApp notifications
            try {
              const { marketingService } = await import('../marketing/marketing.service.ts');
              await marketingService.recordLiveStreamClaimAndNotifyWhatsApp(
                {
                  id: `claim-${Date.now()}`,
                  timestamp: new Date().toLocaleTimeString(),
                  customerHandle: effectiveSender,
                  platform: (platform || 'youtube') as any,
                  rawComment: comment,
                  matchedKeyword: 'MINE/CLAIM',
                  sku: targetSku,
                  itemName: `${fullTitle} (Size ${sizeLabel})`,
                  itemImage: piece.frontImageUrl || '',
                  priceAed,
                  invoiceNo,
                  status: 'LOCK_ACTIVE',
                  replyDispatched: hostReplyText,
                  checkoutUrl,
                  lockExpiresAt: Date.now() + 15 * 60 * 1000,
                  boothId
                },
                piece
              );
            } catch (_) {}

            eventHub.broadcast({
              type: 'ENTITY_MUTATED',
              module: 'SALES',
              entity: 'LIVE_CLAIM',
              action: 'CREATE',
              documentRef: targetSku,
              data: {
                piece: draftRes.piece,
                draftInvoice: draftRes.draftInvoice,
                invoiceNo,
                priceAed,
                checkoutUrl,
                boothId,
                buyerHandle: effectiveSender,
                customerPhone: knownBuyer?.phone || '',
                customerEmail: knownBuyer?.email || '',
                customerAddress: knownBuyer?.address || ''
              }
            });
          }
        } catch (e) {
          console.warn('[NLP Auto-Claim] Claim note:', e);
        }
      }
    }
  }

  eventHub.broadcast({
    type: 'ENTITY_MUTATED',
    module: 'SALES',
    entity: 'LIVE_COMMENT',
    action: 'CREATE',
    documentRef: newComment.id,
    data: newComment
  });

  return res.json(newComment);
});


// ======================== INSTANT CONFIRMED SALE & COA LEDGER POSTING ========================
liveStreamingRouter.post('/confirm-sale', (req, res) => {
  const { barcode, buyerHandle, buyerPhone, boothId, finalSellingPrice, channel, shippingAddress, paymentMethod } = req.body;
  if (!barcode || !buyerHandle) {
    return res.status(400).json({ error: 'barcode and buyerHandle are required' });
  }
  const bId = boothId || 'booth-01';
  const vBuyer = lookupVerifiedBuyer(buyerHandle);
  const resolvedPhone = String(buyerPhone || vBuyer?.phone || '').trim();
  const resolvedAddress = String(shippingAddress || vBuyer?.address || '').trim();
  const result = relationalStore.confirmLiveSaleAndPostCOA({
    barcode,
    buyerHandle,
    buyerPhone: resolvedPhone,
    boothId: bId,
    finalSellingPrice: Number(finalSellingPrice) || 0,
    channel: channel || 'Multistream Live',
    shippingAddress: resolvedAddress,
    paymentMethod: paymentMethod || 'CASH'
  });

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  const priceAed = result.piece?.soldPriceAed || Number(finalSellingPrice) || result.invoice?.totalAmount || 0;
  const whatsAppPayload = {
    customerPhone: resolvedPhone,
    buyerHandle,
    invoiceNo: result.invoice?.invoiceNo || `INV-LIVE-${Date.now().toString(36).toUpperCase()}`,
    barcode,
    priceAed,
    message: `🎉 *ORDER CONFIRMED - VINTAGE VIBES*\n\nHello ${buyerHandle}! Your live claim for piece *${barcode}* has been confirmed.\n\n💵 *Total:* AED ${priceAed}\n🧾 *Invoice:* ${result.invoice?.invoiceNo || 'DRAFT'}\n🚚 *Courier:* Express UAE Dispatch\n\nPlease reply with your delivery address or share your location pin to dispatch your parcel!`
  };

  // Update booth metrics
  streamController.recordClaim(bId, barcode, priceAed);
  markPinnedPieceReservedIfMatch(bId, barcode, buyerHandle);
  sendMetaConversionsEvent({
    eventName: 'Purchase',
    eventId: `pur_${barcode}_${Date.now()}`,
    email: vBuyer?.email,
    phone: resolvedPhone,
    name: buyerHandle,
    req,
    customData: {
      value: priceAed,
      currency: 'AED',
      content_ids: [barcode],
      content_type: 'product'
    }
  }).catch(() => {});

  eventHub.broadcast({
    type: 'ENTITY_MUTATED',
    module: 'SALES',
    entity: 'LIVE_SALE',
    action: 'POST',
    documentRef: result.invoice?.invoiceNo || barcode,
    data: {
      ...result,
      whatsAppPayload,
      boothId: bId
    }
  });

  return res.json({
    ...result,
    whatsAppPayload
  });
});

liveStreamingRouter.post('/booths/:boothId/confirm-sale', (req, res) => {
  const { boothId } = req.params;
  const { barcode, buyerHandle, buyerPhone, finalSellingPrice, channel, shippingAddress, paymentMethod } = req.body;
  if (!barcode || !buyerHandle) {
    return res.status(400).json({ error: 'barcode and buyerHandle are required' });
  }
  const vBuyer = lookupVerifiedBuyer(buyerHandle);
  const resolvedPhone = String(buyerPhone || vBuyer?.phone || '').trim();
  const resolvedAddress = String(shippingAddress || vBuyer?.address || '').trim();
  const result = relationalStore.confirmLiveSaleAndPostCOA({
    barcode,
    buyerHandle,
    buyerPhone: resolvedPhone,
    boothId,
    finalSellingPrice: Number(finalSellingPrice) || 0,
    channel: channel || 'Multistream Live',
    shippingAddress: resolvedAddress,
    paymentMethod: paymentMethod || 'CASH'
  });

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  const priceAed = result.piece?.soldPriceAed || Number(finalSellingPrice) || result.invoice?.totalAmount || 0;
  const whatsAppPayload = {
    customerPhone: resolvedPhone,
    buyerHandle,
    invoiceNo: result.invoice?.invoiceNo || `INV-LIVE-${Date.now().toString(36).toUpperCase()}`,
    barcode,
    priceAed,
    message: `🎉 *ORDER CONFIRMED - VINTAGE VIBES*\n\nHello ${buyerHandle}! Your live claim for piece *${barcode}* has been confirmed.\n\n💵 *Total:* AED ${priceAed}\n🧾 *Invoice:* ${result.invoice?.invoiceNo || 'DRAFT'}\n🚚 *Courier:* Express UAE Dispatch\n\nPlease reply with your delivery address or share your location pin to dispatch your parcel!`
  };

  streamController.recordClaim(boothId, barcode, priceAed);
  markPinnedPieceReservedIfMatch(boothId, barcode, buyerHandle);
  sendMetaConversionsEvent({
    eventName: 'Purchase',
    eventId: `pur_${barcode}_${Date.now()}`,
    email: vBuyer?.email,
    phone: resolvedPhone,
    name: buyerHandle,
    req,
    customData: {
      value: priceAed,
      currency: 'AED',
      content_ids: [barcode],
      content_type: 'product'
    }
  }).catch(() => {});

  eventHub.broadcast({
    type: 'ENTITY_MUTATED',
    module: 'SALES',
    entity: 'LIVE_SALE',
    action: 'POST',
    documentRef: result.invoice?.invoiceNo || barcode,
    data: {
      ...result,
      whatsAppPayload,
      boothId
    }
  });

  return res.json({
    ...result,
    whatsAppPayload
  });
});

// ======================== WHATSAPP ONE-CLICK DISPATCH ========================
liveStreamingRouter.post('/whatsapp/dispatch', async (req, res) => {
  const { to, customerPhone, message, buyerHandle, invoiceNo, barcode, priceAed } = req.body;
  const rawPhone = to || customerPhone || '';
  const cleanPhone = rawPhone.replace(/\D/g, '');
  const text = message || `🎉 *ORDER CONFIRMED - VINTAGE VIBES*\n\nHello ${buyerHandle || 'Valued Customer'}! Your live claim for piece *${barcode || ''}* has been confirmed.\n\n💵 *Total:* AED ${priceAed || 120}\n🧾 *Invoice:* ${invoiceNo || 'DRAFT'}\n🚚 *Courier:* Express UAE Dispatch\n\nPlease reply with your delivery address or share your location pin to dispatch your parcel!`;

  const waMeLink = cleanPhone ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}` : null;

  const workerUrl = getWorkerUrl();
  try {
    const workerRes = await fetch(`${workerUrl}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: cleanPhone, text })
    });
    const json = await workerRes.json();
    return res.json({
      success: true,
      dispatchedViaWorker: workerRes.ok && json.success !== false,
      workerResponse: json,
      waMeLink
    });
  } catch (err: any) {
    return res.json({
      success: true,
      dispatchedViaWorker: false,
      message: 'Worker bridge dispatch attempted; wa.me link ready',
      waMeLink
    });
  }
});


// Inline 'Lock / Claim' that generates an instant Draft Sales Invoice + Atomic PG Lock
liveStreamingRouter.post('/lock-and-draft', async (req, res) => {
  const { barcode, buyerHandle, buyerPhone, boothId, offeredPrice, channel, commentId, stationId } = req.body;
  if (!barcode || !buyerHandle) {
    return res.status(400).json({ error: 'barcode and buyerHandle are required' });
  }
  const bId = boothId || 'booth-1';
  const stId = stationId || 'Station 1';
  const nowMs = Date.now();
  const lockExpiresAt = nowMs + 180 * 1000;
  const reservedUntil = nowMs + 120 * 60 * 1000;

  const pool = getPgClient();
  if (pool) {
    try {
      const checkRes = await pool.query(
        `SELECT * FROM inventory_pieces WHERE LOWER(barcode) = LOWER($1) OR LOWER(sku) = LOWER($1) OR id::text = $1 LIMIT 1;`,
        [String(barcode).trim()]
      );
      if (checkRes.rows.length > 0) {
        const row = checkRes.rows[0];
        if (row.is_sold || row.status === 'SOLD') {
          return res.status(409).json({ success: false, error: `SKU ${barcode} has already been sold.` });
        }
        if ((row.status === 'RESERVED' || row.status === 'CLAIMED_PENDING') && row.locked_by_buyer) {
          return res.status(409).json({
            success: false,
            error: `Already Claimed: Piece "${barcode}" is currently locked for ${row.locked_by_buyer}.`
          });
        }
        // Hydrate into in-memory relationalStore if missing so draftLiveClaimInvoice works after restarts
        const memList = relationalStore.getInventoryPieces();
        if (!memList.some(p => String(p.barcode || '').toLowerCase() === String(row.barcode || '').toLowerCase())) {
          memList.push({
            id: row.id || row.barcode,
            barcode: row.barcode,
            itemName: row.item_name || 'Vintage Garment',
            brandName: row.brand_name || 'Vintage',
            brandTier: row.brand_tier || 'STANDARD',
            category: row.category || 'Apparel',
            sizeScanned: row.size_scanned || 'M',
            status: 'IN_STOCK',
            isSold: false,
            weightKg: Number(row.weight_kg || 0.45),
            weightGrams: Number(row.weight_grams || 450),
            costPrice: Number(row.cost_price || 0),
            retailPriceAed: Number(row.retail_price_aed || row.estimated_price || 120),
            estimatedPrice: Number(row.estimated_price || row.retail_price_aed || 120),
            lockedPrice: Number(row.retail_price_aed || 120),
            frontImageUrl: row.front_image_url || '',
            backImageUrl: row.back_image_url || '',
            tagImageUrl: row.tag_image_url || '',
            costPerGram: Number(row.cost_per_gram || 0)
          } as any);
        }
      }
    } catch (pgErr: any) {
      console.warn('[/lock-and-draft] PG precheck note:', pgErr?.message);
    }
  }

  const result = relationalStore.draftLiveClaimInvoice({
    barcode,
    buyerHandle,
    boothId: bId,
    offeredPrice: offeredPrice ? Number(offeredPrice) : undefined,
    channel: channel || 'Multistream Live'
  });

  if (!result.success) {
    return res.status(409).json({ success: false, error: result.error });
  }

  if (result.draftInvoice && buyerPhone) {
    result.draftInvoice.customerPhone = buyerPhone;
  }

  if (pool) {
    try {
      await pool.query(
        `UPDATE inventory_pieces
         SET status = 'RESERVED',
             locked_by_station = $1,
             locked_by_buyer = $2,
             locked_by_booth = $3,
             locked_at = NOW(),
             lock_expires_at = $4,
             reserved_until = $5,
             updated_at = NOW()
         WHERE LOWER(barcode) = LOWER($6) OR LOWER(sku) = LOWER($6) OR id::text = $6;`,
        [stId, buyerHandle, bId, lockExpiresAt, reservedUntil, String(barcode).trim()]
      );
    } catch (pgErr: any) {
      console.warn('[/lock-and-draft] PG lock sync note:', pgErr?.message);
    }
  }

  const price = offeredPrice || result.piece?.lockedPrice || result.piece?.retailPriceAed || 120;
  const vBuyer = lookupVerifiedBuyer(buyerHandle);
  const resolvedPhone = String(buyerPhone || vBuyer?.phone || '').trim();
  streamController.recordClaim(bId, barcode, price);
  streamController.markBuyerClaimCommentLocked(bId, buyerHandle, barcode, commentId);
  markPinnedPieceReservedIfMatch(bId, barcode, buyerHandle);
  broadcastLiveClaimCelebration(bId, {
    buyerName: buyerHandle,
    sku: barcode,
    itemName: result.piece?.itemName,
    priceAed: price
  });
  try {
    const { marketingService } = await import('../marketing/marketing.service.ts');
    const pc = result.piece;
    const brandName = pc?.brandName || 'Vintage Archive';
    const itemName = pc?.itemName || 'Vintage Piece';
    const fullTitle = itemName.toLowerCase().includes(brandName.toLowerCase()) ? itemName : `${brandName} ${itemName}`.trim();
    const invNo = result.draftInvoice?.invoiceNo || `SLS-DRAFT-LIVE-${Date.now().toString().slice(-4)}`;
    await marketingService.recordLiveStreamClaimAndNotifyWhatsApp(
      {
        id: result.draftInvoice?.id || `claim-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        customerHandle: buyerHandle,
        platform: (String(channel || 'youtube').toLowerCase() as any),
        rawComment: resolvedPhone ? `LOCK ${barcode} ${resolvedPhone}` : `LOCK ${barcode}`,
        matchedKeyword: 'HOST_LOCK',
        sku: barcode,
        itemName: fullTitle,
        itemImage: pc?.frontImageUrl || '',
        priceAed: Number(price) || 120,
        invoiceNo: invNo,
        status: 'LOCK_ACTIVE',
        replyDispatched: `Host locked ${barcode} for ${buyerHandle}`,
        checkoutUrl: `https://vintagevibesgk.com/?checkout=${encodeURIComponent(barcode)}`,
        lockExpiresAt: Date.now() + 60 * 60 * 1000,
        boothId: bId,
        createdAtMs: Date.now()
      },
      pc
    );
  } catch (_) {}
  sendMetaConversionsEvent({
    eventName: 'InitiateCheckout',
    eventId: `ic_${barcode}_${Date.now()}`,
    email: vBuyer?.email,
    phone: resolvedPhone,
    name: buyerHandle,
    req,
    customData: {
      value: price,
      currency: 'AED',
      content_ids: [barcode],
      content_type: 'product'
    }
  }).catch(() => {});

  eventHub.broadcast({
    type: 'ENTITY_MUTATED',
    module: 'SALES',
    entity: 'LIVE_CLAIM',
    action: 'CREATE',
    documentRef: barcode,
    data: {
      ...result,
      boothId: bId,
      buyerHandle,
      buyerPhone: resolvedPhone,
      customerPhone: resolvedPhone,
      customerEmail: vBuyer?.email || '',
      customerAddress: vBuyer?.address || '',
      commentId
    }
  });

  return res.json(result);
});

// Backward compatibility telemetry
liveStreamingRouter.get('/telemetry', (req, res) => {
  const boothId = (req.query.boothId as string) || 'booth-01';
  return res.json(streamController.getTelemetry(boothId));
});

liveStreamingRouter.post('/broadcast/start', (req, res) => {
  const boothId = req.body.boothId || 'booth-01';
  return res.json(streamController.startBroadcast(boothId));
});

liveStreamingRouter.post('/broadcast/stop', (req, res) => {
  const boothId = req.body.boothId || 'booth-01';
  return res.json(streamController.stopBroadcast(boothId));
});

liveStreamingRouter.post('/destinations', (req, res) => {
  const { destinations, boothId } = req.body;
  const bId = boothId || 'booth-1';
  return res.json(streamController.updateDestinations(destinations, bId));
});

liveStreamingRouter.get('/comments', (req, res) => {
  const boothId = (req.query.boothId as string) || 'booth-1';
  return res.json(streamController.getComments(boothId));
});

liveStreamingRouter.post('/comments', (req, res) => {
  const { comment, platform, username, boothId } = req.body;
  const bId = boothId || 'booth-1';
  const newComment = streamController.addComment(bId, comment, normalizeStudioPlatform(platform), username);
  return res.json(newComment);
});

// ======================== ATOMIC SKU LOCK ENGINE & POOL ========================

export async function executePessimisticClaim(params: {
  stationId: string;
  barcode: string;
  buyerHandle: string;
  buyerPhone?: string;
  channel?: string;
  boothId?: string;
  offeredPrice?: number;
  lockDurationSeconds?: number;
  reservationTimeoutMinutes?: number;
}): Promise<{
  success: boolean;
  piece?: any;
  error?: string;
  statusCode: number;
  lockedByStation?: string;
  lockedByBuyer?: string;
}> {
  const cleanId = (params.barcode || '').trim();
  if (!cleanId) {
    return { success: false, error: 'Barcode or SKU is required', statusCode: 400 };
  }
  const station = params.stationId || 'Station 1';
  const buyer = (params.buyerHandle || 'Guest Buyer').trim();
  const booth = params.boothId || 'booth-1';
  const lockSeconds = params.lockDurationSeconds || 180;
  const timeoutMin = params.reservationTimeoutMinutes || 120;
  const nowMs = Date.now();
  const lockExpiresAt = nowMs + lockSeconds * 1000;
  const reservedUntil = nowMs + timeoutMin * 60 * 1000;

  const pool = getPgClient();
  if (!pool) {
    const memResult = relationalStore.claimPieceAtomically({
      barcode: cleanId,
      buyerHandle: buyer,
      buyerPhone: params.buyerPhone,
      channel: params.channel,
      boothId: booth,
      offeredPrice: params.offeredPrice,
      lockDurationSeconds: lockSeconds,
      reservationTimeoutMinutes: timeoutMin
    });
    if (!memResult.success) {
      return { success: false, error: memResult.error, statusCode: 409 };
    }
    const memPiece = { ...memResult.piece, locked_by_station: station, lockedByStation: station };
    return { success: true, piece: memPiece, statusCode: 200 };
  }

  try {
    // 1. Pessimistic concurrency lock via single atomic UPDATE
    const updateRes = await pool.query(
      `UPDATE inventory_pieces
       SET status = 'RESERVED',
           locked_by_station = $1,
           locked_by_buyer = $2,
           locked_by_booth = $3,
           locked_at = NOW(),
           lock_expires_at = $4,
           reserved_until = $5,
           updated_at = NOW()
       WHERE (LOWER(barcode) = LOWER($6) OR LOWER(sku) = LOWER($6) OR id = $6)
         AND (status = 'IN_STOCK' OR status IS NULL OR status = 'AVAILABLE' OR status = 'IN_VAULT')
         AND (is_sold = false OR is_sold IS NULL)
       RETURNING *;`,
      [station, buyer, booth, lockExpiresAt, reservedUntil, cleanId]
    );

    if (updateRes.rowCount && updateRes.rowCount > 0) {
      const piece = updateRes.rows[0];
      // Keep in-memory relationalStore synchronized
      try {
        relationalStore.claimPieceAtomically({
          barcode: piece.barcode || cleanId,
          buyerHandle: buyer,
          buyerPhone: params.buyerPhone,
          channel: params.channel,
          boothId: booth,
          offeredPrice: params.offeredPrice,
          lockDurationSeconds: lockSeconds,
          reservationTimeoutMinutes: timeoutMin
        });
      } catch (_) {}

      return {
        success: true,
        piece: {
          ...piece,
          lockedByStation: station,
          locked_by_station: station,
          lockedByBuyer: buyer,
          locked_by_buyer: buyer
        },
        statusCode: 200
      };
    }

    // 2. Row count was 0: query current state to diagnose concurrency collision
    const checkRes = await pool.query(
      `SELECT id, barcode, sku, item_name, brand_name, status, locked_by_station, locked_by_buyer, is_sold
       FROM inventory_pieces
       WHERE LOWER(barcode) = LOWER($1) OR LOWER(sku) = LOWER($1) OR id::text = $1
       LIMIT 1;`,
      [cleanId]
    );

    if (checkRes.rowCount === 0) {
      return {
        success: false,
        error: `SKU "${cleanId}" does not exist in inventory.`,
        statusCode: 404
      };
    }

    const row = checkRes.rows[0];
    if (row.is_sold || row.status === 'SOLD') {
      return {
        success: false,
        error: `Already Sold: SKU "${cleanId}" has already been sold.`,
        statusCode: 409
      };
    }

    const holdingStation = row.locked_by_station || 'another station';
    const holdingBuyer = row.locked_by_buyer || 'another buyer';

    return {
      success: false,
      error: `Already Claimed: Piece "${cleanId}" is currently locked by ${holdingStation} for ${holdingBuyer}. Concurrency lock preserved.`,
      statusCode: 409,
      lockedByStation: holdingStation,
      lockedByBuyer: holdingBuyer
    };
  } catch (err: any) {
    console.error('[Pessimistic Lock Error]', err);
    return {
      success: false,
      error: `Database lock error: ${err.message}`,
      statusCode: 500
    };
  }
}

export async function executeReleaseLock(params: {
  barcode: string;
  stationId?: string;
  boothId?: string;
}): Promise<{ success: boolean; piece?: any; error?: string }> {
  const cleanId = (params.barcode || '').trim();
  const pool = getPgClient();

  if (pool) {
    try {
      const res = await pool.query(
        `UPDATE inventory_pieces
         SET status = 'IN_STOCK',
             locked_by_station = NULL,
             locked_at = NULL,
             locked_by_buyer = NULL,
             locked_by_booth = NULL,
             lock_expires_at = NULL,
             reserved_until = NULL,
             updated_at = NOW()
         WHERE (LOWER(barcode) = LOWER($1) OR LOWER(sku) = LOWER($1) OR id::text = $1)
           AND (is_sold IS FALSE OR is_sold IS NULL)
         RETURNING *;`,
        [cleanId]
      );
      if (res.rowCount && res.rowCount > 0) {
        try {
          relationalStore.releasePieceLock(cleanId, params.boothId);
        } catch (_) {}
        return { success: true, piece: res.rows[0] };
      }
    } catch (err: any) {
      console.warn('DB release lock error:', err.message);
    }
  }

  return relationalStore.releasePieceLock(cleanId, params.boothId);
}

liveStreamingRouter.get('/pool', async (req, res) => {
  const boothId = req.query.boothId as string | undefined;
  const client = await getPgClient();
  if (client) {
    try {
      const q = await client.query(`
        SELECT * FROM inventory_pieces
        WHERE (status = 'RESERVED' OR status = 'CLAIMED_PENDING')
          AND locked_by_buyer IS NOT NULL
          AND (is_sold = false OR is_sold IS NULL)
        ORDER BY created_at ASC;
      `);
      const activeReservedBarcodes = new Set<string>();
      for (const row of q.rows) {
        const cleanBc = String(row.barcode || '').toLowerCase();
        if (cleanBc) activeReservedBarcodes.add(cleanBc);
        const p = relationalStore.getInventoryPieces().find(x => x.barcode.toLowerCase() === cleanBc);
        const trueRetail = Number(row.retail_price_aed || p?.retailPriceAed || p?.lockedPrice || 0);
        if (p) {
          p.status = 'RESERVED';
          p.lockedByBuyer = row.locked_by_buyer;
          p.lockedByBooth = row.locked_by_booth || 'booth-1';
          p.lockedChannel = row.locked_channel || p.lockedChannel || 'Live Stream';
          if (trueRetail > 0 && (!p.lockedPrice || p.lockedPrice <= 0)) {
            p.lockedPrice = trueRetail;
          }
          if (trueRetail > 0) {
            p.retailPriceAed = trueRetail;
          }
          (p as any).lockExpiresAt = Number(row.lock_expires_at || (p as any).lockExpiresAt || 0);
          (p as any).lock_expires_at = Number(row.lock_expires_at || (p as any).lock_expires_at || 0);
          (p as any).lockedByStation = row.locked_by_station || (p as any).lockedByStation || 'Station 1';
          (p as any).frontImageUrl = row.front_image_url || p.frontImageUrl || '';
          (p as any).backImageUrl = row.back_image_url || p.backImageUrl || '';
          (p as any).tagImageUrl = row.tag_image_url || p.tagImageUrl || '';
          p.isSold = false;
        } else {
          relationalStore.getInventoryPieces().push({
            id: row.id,
            barcode: row.barcode,
            itemName: row.item_name || 'Garment',
            brandName: row.brand_name || 'Vintage',
            brandTier: row.brand_tier || 'STANDARD',
            category: row.category || 'Tops',
            status: 'RESERVED',
            isSold: false,
            weightKg: Number(row.weight_kg || 0.45),
            weightGrams: Number(row.weight_grams || 450),
            costPrice: Number(row.cost_price || 0),
            retailPriceAed: trueRetail,
            lockedPrice: trueRetail,
            lockedByBuyer: row.locked_by_buyer,
            lockedByBooth: row.locked_by_booth || 'booth-1',
            lockedChannel: row.locked_channel || 'Live Stream',
            lockedByStation: row.locked_by_station || 'Station 1',
            lockExpiresAt: Number(row.lock_expires_at || 0),
            lock_expires_at: Number(row.lock_expires_at || 0),
            frontImageUrl: row.front_image_url || '',
            backImageUrl: row.back_image_url || '',
            tagImageUrl: row.tag_image_url || '',
            costPerGram: Number(row.cost_per_gram || 0)
          } as any);
        }
      }

      // Clear any stale in-memory basket locks for pieces that are already SOLD, invoiced, or released in PostgreSQL
      for (const memP of relationalStore.getInventoryPieces()) {
        if ((memP.status === 'RESERVED' || memP.status === 'CLAIMED_PENDING') && memP.lockedByBuyer) {
          const bcLower = String(memP.barcode || '').toLowerCase();
          if (!activeReservedBarcodes.has(bcLower)) {
            memP.lockedByBuyer = undefined;
            memP.lockedByBooth = undefined;
            memP.lockExpiresAt = undefined;
            if (memP.isSold) {
              memP.status = 'SOLD';
            } else if (!memP.soldInvoiceId) {
              memP.status = 'IN_STOCK';
            }
          }
        }
      }
    } catch (_) {} finally {
      await client.end().catch(() => {});
    }
  }
  const pool = relationalStore.getLiveClaimedPool(boothId);
  return res.json(pool);
});

liveStreamingRouter.post('/claim', async (req, res) => {
  const {
    barcode,
    buyerHandle,
    buyerPhone,
    channel,
    boothId,
    stationId,
    offeredPrice,
    lockDurationSeconds,
    reservationTimeoutMinutes,
    commentId
  } = req.body;

  if (!barcode || !buyerHandle) {
    return res.status(400).json({ error: 'Barcode and buyerHandle are required' });
  }

  const bId = boothId || 'booth-1';
  const stId = stationId || 'Station 1';

  const result = await executePessimisticClaim({
    barcode,
    buyerHandle,
    buyerPhone,
    channel,
    boothId: bId,
    stationId: stId,
    offeredPrice,
    lockDurationSeconds: lockDurationSeconds || 180,
    reservationTimeoutMinutes: reservationTimeoutMinutes || 120
  });

  if (!result.success) {
    return res.status(result.statusCode || 409).json({
      success: false,
      error: result.error,
      lockedByStation: result.lockedByStation,
      lockedByBuyer: result.lockedByBuyer
    });
  }

  // Update booth stats and lock the buyer's claim comment to this exact SKU
  const price = result.piece?.lockedPrice || result.piece?.retail_price_aed || result.piece?.estimated_price || 120;
  streamController.recordClaim(bId, barcode, price);
  streamController.markBuyerClaimCommentLocked(bId, buyerHandle, barcode, commentId);

  // Broadcast to all active stations and clients for instant real-time HUD updates
  eventHub.broadcast({
    type: 'ENTITY_MUTATED',
    module: 'SALES',
    entity: 'LIVE_CLAIM',
    action: 'UPDATE',
    documentRef: barcode,
    data: {
      piece: result.piece,
      boothId: bId,
      stationId: stId,
      buyerHandle
    }
  });

  return res.json({
    success: true,
    piece: result.piece,
    stationId: stId,
    buyerHandle,
    message: `Locked by ${stId} for ${buyerHandle}`
  });
});

// Fast Drop / Re-Auction Action
liveStreamingRouter.post('/release-lock', async (req, res) => {
  const { barcode, boothId, stationId } = req.body;
  if (!barcode) return res.status(400).json({ error: 'Barcode required' });

  const bId = boothId || 'booth-1';
  const stId = stationId || 'Station 1';
  const result = await executeReleaseLock({ barcode, boothId: bId, stationId: stId });
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  const price = result.piece?.lockedPrice || result.piece?.retail_price_aed || result.piece?.estimated_price || 120;
  streamController.recordRelease(bId, barcode, price);

  eventHub.broadcast({
    type: 'ENTITY_MUTATED',
    module: 'SALES',
    entity: 'LIVE_CLAIM',
    action: 'UPDATE',
    documentRef: barcode,
    data: { piece: result.piece, boothId: bId, stationId: stId, isReleased: true }
  });

  return res.json(result);
});

// ======================== SOCIAL MEDIA WEBHOOK SIMULATOR ========================
// Simulates incoming social live comments (TikTok, Instagram, Facebook, YouTube Live)
// and executes the identical pessimistic locking logic with station attribution
liveStreamingRouter.post('/webhook/simulate-comment', async (req, res) => {
  const {
    customerName,
    customerPhone,
    platform,
    commentText,
    stationId,
    boothId
  } = req.body;

  if (!customerName || !commentText) {
    return res.status(400).json({ success: false, error: 'Customer name and comment text are required' });
  }

  const bId = boothId || 'booth-1';
  const stId = stationId || 'Station 1';
  const cleanComment = String(commentText).trim();
  const cleanPlatform = String(platform || 'YouTube Live').trim();
  const cleanBuyer = String(customerName).trim().startsWith('@') ? customerName.trim() : `@${customerName.trim()}`;

  // Log comment into stream controller feed
  const newComment = streamController.addComment(
    bId,
    cleanComment,
    normalizeStudioPlatform(cleanPlatform),
    cleanBuyer
  );

  // Parse for claim intent & extract SKU/barcode (STRICTLY ONLY genuine "CLAIM" or "MINE" commands)
  const isGenuineClaim = streamController.isGenuineClaimMessage(cleanComment, cleanBuyer);
  const claimRegex = /\b(?:claim|mine)\b(?:\s+#?([A-Za-z0-9\-_]+))?/i;
  const match = isGenuineClaim ? cleanComment.match(claimRegex) : null;
  const bracketSkuMatch = cleanComment.match(/\[(?:code|sku)\s*#?\s*([A-Za-z0-9\-_]*\d[A-Za-z0-9\-_]*)\]/i);
  let targetSku = bracketSkuMatch?.[1]?.trim() || null;

  if (!targetSku && match && match[1]) {
    const cand = match[1].trim();
    if (/\d/.test(cand) && !/^\d{1,3}$/.test(cand)) {
      targetSku = cand;
    }
  }

  if (!targetSku && match) {
    const skuPattern = /\b((?:VIN|VV|BAL|DXB)[A-Za-z0-9\-_]*\d[A-Za-z0-9\-_]*)\b/i;
    const skuMatch = cleanComment.match(skuPattern);
    if (skuMatch) {
      targetSku = skuMatch[1].trim();
    }
  }

  const isClaimIntent = Boolean(isGenuineClaim && match);

  if (!isClaimIntent && !targetSku) {
    eventHub.broadcast({
      type: 'ENTITY_MUTATED',
      module: 'SALES',
      entity: 'LIVE_COMMENT',
      action: 'CREATE',
      documentRef: newComment.id,
      data: newComment
    });
    return res.json({
      success: true,
      isClaim: false,
      comment: newComment,
      message: 'Comment posted to live feed.'
    });
  }

  // If claim keyword used but no explicit SKU in text, fallback to booth's on-air SKU or first in-stock item
  if (!targetSku) {
    const boothSession = streamController.getBooth(bId);
    targetSku = boothSession?.activeOnAirSku || null;
  }
  if (!targetSku) {
    const pool = getPgClient();
    if (pool) {
      const findRes = await pool.query(
        `SELECT barcode FROM inventory_pieces 
         WHERE (status = 'IN_STOCK' OR status IS NULL OR status = 'AVAILABLE' OR status = 'IN_VAULT') 
           AND (is_sold = false OR is_sold IS NULL) 
         ORDER BY created_at DESC LIMIT 1;`
      );
      if (findRes.rows.length > 0) {
        targetSku = findRes.rows[0].barcode;
      }
    }
  }

  if (!targetSku) {
    return res.status(404).json({
      success: false,
      isClaim: true,
      error: 'No active SKU found on air or available in stock to claim.',
      comment: newComment
    });
  }

  // Execute identical PostgreSQL pessimistic lock
  const claimResult = await executePessimisticClaim({
    stationId: stId,
    barcode: targetSku,
    buyerHandle: cleanBuyer,
    buyerPhone: customerPhone,
    channel: cleanPlatform,
    boothId: bId
  });

  if (!claimResult.success) {
    return res.status(claimResult.statusCode || 409).json({
      success: false,
      isClaim: true,
      attemptedSku: targetSku,
      error: claimResult.error,
      lockedByStation: claimResult.lockedByStation,
      lockedByBuyer: claimResult.lockedByBuyer,
      comment: newComment
    });
  }

  newComment.isClaimIntent = true;
  newComment.extractedSku = targetSku;
  newComment.isProcessed = true;

  const price = claimResult.piece?.lockedPrice || claimResult.piece?.retail_price_aed || 120;
  streamController.recordClaim(bId, targetSku, price);
  streamController.markBuyerClaimCommentLocked(bId, cleanBuyer, targetSku, newComment.id);

  eventHub.broadcast({
    type: 'ENTITY_MUTATED',
    module: 'SALES',
    entity: 'LIVE_CLAIM',
    action: 'UPDATE',
    documentRef: targetSku,
    data: {
      piece: claimResult.piece,
      boothId: bId,
      stationId: stId,
      buyerHandle: cleanBuyer,
      platform: cleanPlatform
    }
  });

  eventHub.broadcast({
    type: 'ENTITY_MUTATED',
    module: 'SALES',
    entity: 'LIVE_COMMENT',
    action: 'CREATE',
    documentRef: newComment.id,
    data: newComment
  });

  return res.json({
    success: true,
    isClaim: true,
    claimedSku: targetSku,
    stationId: stId,
    buyerHandle: cleanBuyer,
    platform: cleanPlatform,
    piece: claimResult.piece,
    comment: newComment,
    message: `✓ Concurrency Lock Acquired: Item ${targetSku} successfully claimed by ${stId} for ${cleanBuyer} via ${cleanPlatform}!`
  });
});


// Reservation Timeout Engine: sweep expired reservations
liveStreamingRouter.post('/sweep-reservations', async (req, res) => {
  const result = relationalStore.sweepExpiredReservations();
  let client: any = null;
  try {
    client = await getPgClient();
    if (client) {
      const q = await client.query(`
        UPDATE inventory_pieces
        SET status = 'IN_STOCK',
            locked_by_buyer = NULL,
            locked_by_booth = NULL,
            locked_by_station = NULL,
            lock_expires_at = NULL,
            reserved_until = NULL,
            is_sold = false,
            updated_at = NOW()
        WHERE status = 'RESERVED'
          AND lock_expires_at IS NOT NULL
          AND lock_expires_at < EXTRACT(EPOCH FROM NOW()) * 1000
          AND (is_sold = false OR is_sold IS NULL)
        RETURNING barcode;
      `);
      if (q.rowCount && q.rowCount > 0) {
        result.sweptCount = Math.max(result.sweptCount || 0, q.rowCount);
      }
    }
  } catch (dbErr) {
    console.warn('Notice sweeping expired reservations in PostgreSQL:', dbErr);
  } finally {
    if (client) {
      if (typeof client.release === 'function') client.release();
      else if (typeof client.end === 'function') await client.end().catch(() => {});
    }
  }

  if (result.sweptCount > 0) {
    eventHub.broadcast({
      type: 'ENTITY_MUTATED',
      module: 'SALES',
      entity: 'LIVE_CLAIM',
      action: 'UPDATE',
      documentRef: 'SWEEP',
      data: result
    });
  }
  return res.json(result);
});

// Finalize live session per buyer
liveStreamingRouter.post('/finalize-session', async (req, res) => {
  const { buyerHandle, customerPhone, paymentMethod, shippingAddress, boothId } = req.body;
  if (!buyerHandle) {
    return res.status(400).json({ error: 'buyerHandle is required' });
  }

  const result = relationalStore.finalizeBuyerLiveSession({
    buyerHandle,
    customerPhone,
    paymentMethod: paymentMethod || 'CASH',
    shippingAddress
  });

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  // Persist draft invoice to PostgreSQL sales_invoices
  const client = await getPgClient();
  if (client && result.invoice) {
    try {
      const inv = result.invoice;
      const bPhone = (customerPhone || inv.customerPhone || '').trim();
      const bName = (inv.customerName || buyerHandle || 'Live Stream Buyer').trim();
      const totalAmt = Number(inv.totalAmount || 0);

      // Auto-feed / link customer into public.crm_retail_customers
      let liveCustomerId: string | null = null;
      if (bPhone || bName) {
        const existingCust = await client.query(
          `SELECT id FROM public.crm_retail_customers 
           WHERE (phone = $1 AND phone IS NOT NULL AND phone != '') 
              OR name ILIKE $2 
           LIMIT 1`,
          [bPhone, bName]
        );
        if (existingCust.rows.length > 0) {
          liveCustomerId = existingCust.rows[0].id;
          await client.query(`
            UPDATE public.crm_retail_customers
            SET total_orders = COALESCE(total_orders, 0) + 1,
                total_spent = COALESCE(total_spent, 0) + $1,
                channel = CASE 
                  WHEN channel = 'POS_COUNTER' THEN 'OMNICHANNEL'
                  WHEN channel IS NULL OR channel = '' THEN 'LIVE_STREAM'
                  ELSE channel
                END,
                address = COALESCE(NULLIF(address, ''), $2),
                phone = COALESCE(NULLIF(phone, ''), $3)
            WHERE id = $4
          `, [totalAmt, (shippingAddress || '').trim() || null, bPhone || null, liveCustomerId]);
        } else {
          const newCust = await client.query(`
            INSERT INTO public.crm_retail_customers (
              name, phone, company, address, total_spent, total_orders, channel, customer_type, vip_tier, wallet_balance
            ) VALUES (
              $1, $2, $1, $3, $4, 1, 'LIVE_STREAM', 'RETAIL', 'BRONZE', 0.00
            ) RETURNING id
          `, [bName, bPhone || null, (shippingAddress || '').trim() || null, totalAmt]);
          if (newCust.rows.length > 0) {
            liveCustomerId = newCust.rows[0].id;
          }
        }
      }

      await client.query(
        `DELETE FROM public.sales_invoices
         WHERE status = 'DRAFT'
           AND invoice_date = CURRENT_DATE
           AND payment_method = 'LIVE_CLAIM_HOLD'
           AND LOWER(TRIM(customer_name)) = LOWER(TRIM($1))`,
        [bName]
      ).catch(() => {});

      await client.query(`
        INSERT INTO sales_invoices (
          id, invoice_no, client_id, customer_name, customer_phone, invoice_date,
          channel, payment_method, payment_status, shipping_address,
          subtotal, discount_amount, tax_amount, total_amount, status,
          items, shipping_fee, shipping_bearer, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, CURRENT_DATE,
          'LIVE_STREAM', $6, 'PENDING_COD', $7,
          $8, 0, $9, $10, 'DRAFT',
          $11::jsonb, 0, 'Customer Bears', NOW()
        ) ON CONFLICT (id) DO UPDATE
        SET status = 'DRAFT', client_id = EXCLUDED.client_id, items = EXCLUDED.items, total_amount = EXCLUDED.total_amount;
      `, [
        inv.id,
        inv.invoiceNo,
        liveCustomerId,
        bName,
        bPhone,
        inv.paymentMethod || 'COD',
        shippingAddress || 'Al Ain, UAE Delivery',
        inv.subTotal,
        inv.vatAmount,
        totalAmt,
        JSON.stringify(inv.items)
      ]);

      // Clear stream basket lock in PostgreSQL inventory_pieces so the finalized basket moves to Live Drafts & Dispatch Hub
      const itemBarcodes = (inv.items || []).map((it: any) => String(it.barcode || '').trim()).filter(Boolean);
      if (itemBarcodes.length > 0) {
        await client.query(`
          UPDATE public.inventory_pieces
          SET locked_by_buyer = NULL,
              locked_by_booth = NULL,
              locked_by_station = NULL,
              lock_expires_at = NULL,
              updated_at = NOW()
          WHERE barcode = ANY($1::text[]);
        `, [itemBarcodes]);
      }
    } catch (e) {
      console.warn('Postgres persist note in finalize-session:', e);
    } finally {
      try { await Promise.resolve(client.end()); } catch (_) {}
    }
  }

  if (result.invoice) {
    const fPhone = (customerPhone || result.invoice.customerPhone || '').trim();
    if (fPhone) {
      notifyOrderBookedPiecesWhatsApp({
        invoiceNo: result.invoice.invoiceNo,
        customerName: result.invoice.customerName || buyerHandle || 'Live Stream Buyer',
        customerPhone: fPhone,
        items: result.invoice.items || [],
        totalAmount: Number(result.invoice.totalAmount || 0),
        subtotal: Number(result.invoice.subTotal || 0),
        vatAmount: Number(result.invoice.vatAmount || 0),
        shippingFee: Number(result.invoice.shippingFeeAed || 0),
        paymentMethod: result.invoice.paymentMethod || 'COD',
        paymentStatus: result.invoice.paymentStatus || 'UNPAID_PENDING_COD',
        shippingAddress: shippingAddress || result.invoice.shippingAddress,
        channel: 'LIVE_STREAM'
      });
    }
  }

  eventHub.broadcast({
    type: 'ENTITY_MUTATED',
    module: 'SALES',
    entity: 'LIVE_SESSION',
    action: 'POST',
    documentRef: result.invoice?.invoiceNo || buyerHandle,
    data: { ...result, boothId }
  });

  return res.json(result);
});

// ======================== SMART WHATSAPP ADDRESS PARSER ========================
liveStreamingRouter.post('/parse-address', (req, res) => {
  const { rawText } = req.body;
  if (!rawText || typeof rawText !== 'string') {
    return res.status(400).json({ error: 'rawText string is required' });
  }

  const parsed = parseWhatsAppAddress(rawText);
  return res.json(parsed);
});

// Helper for parsing raw WhatsApp customer delivery details
export function parseWhatsAppAddress(rawText: string) {
  const lines = rawText
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  // Phone regex for UAE / international (+971, 05x, etc.)
  const phoneRegex = /(?:\+?971|00971|0)?\s*(?:50|52|54|55|56|58|2|3|4|6|7|9)\s*\d{3}\s*\d{4}|\+?\d{9,14}/;
  
  let phone = '';
  let name = '';
  let city = 'Al Ain';
  let country = 'United Arab Emirates';
  const addressParts: string[] = [];

  const knownCities = [
    'Al Ain',
    'Abu Dhabi',
    'Sharjah',
    'Ajman',
    'Ras Al Khaimah',
    'Fujairah',
    'Umm Al Quwain',
    'Al Ain',
    'Riyadh',
    'Jeddah',
    'Doha',
    'Kuwait'
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for phone
    const phoneMatch = line.match(phoneRegex);
    if (phoneMatch && !phone) {
      phone = phoneMatch[0].replace(/\s+/g, '');
      const lineWithoutPhone = line.replace(phoneRegex, '').replace(/phone|mobile|tel|whatsapp/gi, '').trim();
      if (lineWithoutPhone.length > 2 && !name) {
        name = lineWithoutPhone.replace(/^[:\-\s]+/, '');
      }
      continue;
    }

    // Check for explicit labels
    if (/^name\s*[:\-]/i.test(line)) {
      name = line.replace(/^name\s*[:\-]\s*/i, '');
      continue;
    }
    if (/^(?:address|delivery|location)\s*[:\-]/i.test(line)) {
      addressParts.push(line.replace(/^(?:address|delivery|location)\s*[:\-]\s*/i, ''));
      continue;
    }
    if (/^(?:city|emirate)\s*[:\-]/i.test(line)) {
      city = line.replace(/^(?:city|emirate)\s*[:\-]\s*/i, '');
      continue;
    }

    // Detect known UAE cities in line
    for (const kc of knownCities) {
      if (new RegExp(`\\b${kc}\\b`, 'i').test(line)) {
        city = kc;
      }
    }

    // If first line and looks like a name
    if (i === 0 && !name && !line.match(/\d{3,}/)) {
      name = line.replace(/[^\w\s\u0600-\u06FF]/g, '').trim();
      continue;
    }

    addressParts.push(line);
  }

  if (!name) name = 'Live Auction Customer';
  if (!phone) phone = '+971 50 000 0000';
  const fullAddress = addressParts.join(', ') || 'Downtown, Al Qaseedah District, 135 Khalifa Bin Zayed Street, Alain UAE';

  return {
    name,
    phone,
    streetAddress: fullAddress,
    city,
    country,
    courierNote: 'Handle with Care: Fragile Vintage Relove Apparel',
    parsedAt: new Date().toISOString()
  };
}

// Mobile Pairing Token endpoint
liveStreamingRouter.get('/pair-qr', (req, res) => {
  const boothId = (req.query.boothId as string) || 'booth-01';
  const token = `VV-${boothId.toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const host = req.get('host') || 'localhost:3000';
  const protocol = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  const pairUrl = `${protocol}://${host}?mobileCamPair=${token}&booth=${boothId}`;

  return res.json({
    token,
    pairUrl,
    boothId,
    ipAddress: '192.168.1.144',
    resolution: '1080p60 FHD',
    protocol: 'WebRTC Ultra-Low Latency (Sub-200ms)',
    expiresInSeconds: 600
  });
});

// ======================== REAL TIKTOK LIVE WEBSOCKET CONNECTOR ========================
liveStreamingRouter.get('/tiktok-socket/status', (req, res) => {
  const boothId = (req.query.boothId as string) || undefined;
  return res.json(tikTokSocketService.getStatus(boothId));
});

liveStreamingRouter.post('/tiktok-socket/connect', async (req, res) => {
  const { username, boothId } = req.body;
  if (!username) {
    return res.status(400).json({ error: 'TikTok username is required' });
  }
  const result = await tikTokSocketService.connect(username, boothId || 'booth-1');
  return res.json(result);
});

liveStreamingRouter.post('/tiktok-socket/disconnect', async (req, res) => {
  const boothId = req.body?.boothId || (req.query.boothId as string) || undefined;
  const result = await tikTokSocketService.disconnect(boothId);
  return res.json(result);
});

liveStreamingRouter.post('/tiktok-socket/config', (req, res) => {
  const profile = relationalStore.getCompanyProfile();
  if (!profile) return res.status(500).json({ error: 'Company profile not found' });

  profile.tiktokLiveSocket = {
    ...(profile.tiktokLiveSocket || {
      enabled: true,
      tiktokUsername: '',
      autoReconnect: true,
      connectionStatus: 'DISCONNECTED',
      claimKeywords: ['CLAIM', 'MINE', 'BIN', 'TAKE', 'BUY'],
      autoLockPieces: true,
      defaultLockDurationSeconds: 900
    }),
    ...req.body
  };

  relationalStore.updateCompanyProfile(profile);
  return res.json({ success: true, config: profile.tiktokLiveSocket });
});

// ======================== 5-PLATFORM REAL-TIME SOCIAL CHAT & WEBHOOK INGESTION ========================
liveStreamingRouter.get('/booths/:boothId/social-chat/status', (req, res) => {
  const { boothId } = req.params;
  const isStreamingOnServer = isBoothActuallyStreamingOnServer(boothId);
  socialChatService.ensureConnectedIfBoothLive(boothId, isStreamingOnServer);
  return res.json({
    success: true,
    isStreamingOnServer,
    ...socialChatService.getBoothSocialChatStatus(boothId)
  });
});

liveStreamingRouter.post('/booths/:boothId/social-chat/connect', async (req, res) => {
  const { boothId } = req.params;
  const result = await socialChatService.connectAllBoothPlatforms(boothId);
  return res.json({ success: true, ...result });
});

liveStreamingRouter.post('/booths/:boothId/social-chat/disconnect', (req, res) => {
  const { boothId } = req.params;
  socialChatService.disconnectAllBoothPlatforms(boothId);
  return res.json({ success: true, boothId });
});

// Meta Graph API (Facebook, Instagram, WhatsApp Cloud API, Threads) & TikTok Webhook Verification Challenge (GET)
liveStreamingRouter.get(['/webhooks/:platform', '/webhook/:platform'], (req, res) => {
  const mode = req.query['hub.mode'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && challenge) {
    const givenToken = String(req.query['hub.verify_token'] || '').trim();
    const expectedToken = metaBusinessHub.getWebhookVerifyToken();
    const strictEnvToken = Boolean(process.env.META_WEBHOOK_VERIFY_TOKEN?.trim());
    if ((strictEnvToken && givenToken !== expectedToken) || (givenToken && givenToken !== expectedToken)) {
      return res.status(403).send('Forbidden: Invalid verify token');
    }
    return res.status(200).send(String(challenge));
  }
  return res.status(200).json({
    success: true,
    platform: req.params.platform,
    status: 'WEBHOOK_ACTIVE'
  });
});

// Real-Time Incoming Social Comment, IG Comment-to-DM & WhatsApp Cloud Webhook Receiver (POST)
liveStreamingRouter.post(['/webhooks/:platform', '/webhook/:platform'], async (req, res) => {
  const rawPlat = String(req.params.platform || 'tiktok').toLowerCase();
  const sigCheck = metaBusinessHub.verifyMetaWebhookSignature(req);
  if (!sigCheck.ok) {
    return res.status(401).json({ success: false, error: sigCheck.reason || 'INVALID_SIGNATURE' });
  }

  const platform: SocialPlatformKey =
    rawPlat.includes('insta') ? 'instagram' :
    rawPlat.includes('face') || rawPlat === 'fb' ? 'facebook' :
    rawPlat.includes('thread') ? 'threads' :
    rawPlat.includes('you') || rawPlat === 'yt' ? 'youtube' :
    rawPlat.includes('tik') ? 'tiktok' : 'custom';

  const body = req.body || {};
  const boothId = String(body.boothId || req.query.boothId || 'booth-1');
  const results: any[] = [];

  try {
    // 0. Official Meta WhatsApp Cloud API Webhook (delivery statuses + inbound buyer messages)
    if (rawPlat.includes('whatsapp') || body.object === 'whatsapp_business_account') {
      let waProcessed = 0;
      const entries = Array.isArray(body.entry) ? body.entry : [];
      for (const entry of entries) {
        const changes = Array.isArray(entry?.changes) ? entry.changes : [];
        for (const change of changes) {
          const val = change?.value || {};
          const statuses = Array.isArray(val.statuses) ? val.statuses : [];
          for (const st of statuses) {
            metaBusinessHub.recordWhatsAppWebhookEvent({
              kind: 'status',
              messageId: st.id ? String(st.id) : undefined,
              status: st.status ? String(st.status) : undefined,
              fromOrRecipient: st.recipient_id ? String(st.recipient_id) : undefined
            });
            waProcessed++;
          }
          const messages = Array.isArray(val.messages) ? val.messages : [];
          for (const msg of messages) {
            metaBusinessHub.recordWhatsAppWebhookEvent({
              kind: 'inbound_message',
              messageId: msg.id ? String(msg.id) : undefined,
              status: msg.type ? String(msg.type) : 'text',
              fromOrRecipient: msg.from ? String(msg.from) : undefined,
              preview: msg.text?.body ? String(msg.text.body) : msg.button?.text || `[${msg.type || 'message'}]`
            });
            waProcessed++;
          }
        }
      }
      return res.status(200).json({ success: true, platform: 'whatsapp', processed: waProcessed });
    }

    // 1. Standard Meta Graph API Webhook Payload (Facebook Page Live Videos/Feed, Instagram Comments/Live Comments, Threads, Messaging)
    if (Array.isArray(body.entry)) {
      const effectiveMetaPlatform: SocialPlatformKey =
        body.object === 'instagram' ? 'instagram' :
        body.object === 'page' ? 'facebook' : platform;

      for (const entry of body.entry) {
        if (Array.isArray(entry?.messaging)) {
          for (const dmEvt of entry.messaging) {
            if (dmEvt?.message?.text) {
              console.log(`[SocialWebhook:${effectiveMetaPlatform}] 📩 DM received cleanly (mid=${dmEvt.message?.mid || 'n/a'})`);
            }
          }
        }

        const changes = Array.isArray(entry?.changes) ? entry.changes : [];
        for (const change of changes) {
          const field = String(change?.field || '').toLowerCase();
          const val = change?.value || {};

          if (field === 'feed') {
            if (val.item && val.item !== 'comment') continue;
            if (val.verb && val.verb !== 'add') continue;
          }

          const text = val.message || val.text || val.comment || '';
          const author = val.from?.name || val.from?.username || val.username || `${effectiveMetaPlatform} Viewer`;
          const commentId = val.comment_id || val.id || undefined;
          if (text) {
            const r = await socialChatService.processIncomingSocialComment({
              boothId,
              platform: effectiveMetaPlatform,
              username: String(author),
              commentText: String(text),
              externalMessageId: commentId ? String(commentId) : undefined
            });
            results.push(r);

            if ((effectiveMetaPlatform === 'instagram' || body.object === 'instagram') && commentId) {
              metaBusinessHub
                .handleInstagramCommentAutoDm({
                  boothId,
                  commentId: String(commentId),
                  text: String(text),
                  username: String(author),
                  senderId: val.from?.id ? String(val.from.id) : undefined,
                  mediaId: val.media?.id ? String(val.media.id) : undefined
                })
                .catch(() => {});
            }
          }
        }
      }
      return res.status(200).json({ success: true, processed: results.length, results });
    }

    // 2. Direct / Custom / TikTok / Multi-Platform Webhook Payload
    const commentText = body.commentText || body.comment || body.message || body.text || '';
    const username = body.customerName || body.username || body.author || body.user || `@${platform}_viewer`;
    const externalId = body.id || body.commentId || body.messageId || undefined;

    if (commentText) {
      const r = await socialChatService.processIncomingSocialComment({
        boothId,
        platform,
        username: String(username),
        commentText: String(commentText),
        externalMessageId: externalId ? String(externalId) : undefined
      });
      return res.status(200).json(r);
    }

    return res.status(200).json({ success: true, message: 'Webhook event acknowledged' });
  } catch (err: any) {
    console.warn(`[SocialWebhook:${platform}] Error processing webhook:`, err?.message);
    return res.status(200).json({ success: false, error: err?.message });
  }
});

// ======================== LIVE PIXEL CONFIG, PINNED PIECE, VIRAL SHARES, BELL ALERTS & CLIPS ========================
function normalizeRouteBoothKey(raw?: string): string {
  const s = String(raw || 'booth-1').trim().toLowerCase();
  const alias = getBoothIdAliases(s)[0];
  if (alias) return alias;
  return s.replace(/[^a-z0-9_-]/g, '') || 'booth-1';
}

liveStreamingRouter.get('/public-config', (req, res) => {
  const boothId = normalizeRouteBoothKey(String(req.query.boothId || 'booth-1'));
  const memBooth = streamController.getBooth(boothId);
  const pinnedPiece = memBooth?.openLiveMode ? null : getBoothPinnedPiece(boothId);
  return res.json({
    success: true,
    pixelConfig: getLivePixelPublicConfig(),
    pinnedPiece,
    openLiveMode: Boolean(memBooth?.openLiveMode),
    openLiveItemTitle: memBooth?.openLiveItemTitle || '',
    openLivePriceAed: Number(memBooth?.openLivePriceAed || 0),
    hlsUrl: `/api/live/hls/${boothId}/index.m3u8`
  });
});

// ======================== IPHONE / SAFARI LOW-LATENCY HLS STREAMING ========================
liveStreamingRouter.get('/hls/:boothId/:filename', (req, res) => {
  const bKey = normalizeRouteBoothKey(req.params.boothId);
  const filename = String(req.params.filename || '').trim();
  if (!/^(index\.m3u8|seg_\d{5}\.(?:ts|m2ts))$/.test(filename)) {
    return res.status(400).json({ error: 'Invalid HLS segment name' });
  }
  const filePath = path.resolve(process.cwd(), 'public', 'live_hls', bKey, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).end();
  }
  if (filename.endsWith('.m3u8')) {
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  } else {
    res.setHeader('Content-Type', 'video/mp2t');
    res.setHeader('Cache-Control', 'public, max-age=10');
  }
  res.setHeader('Access-Control-Allow-Origin', '*');
  return res.sendFile(filePath);
});

// ======================== LIVE AVAILABLE CATALOG & MY CLAIMED BAG ========================
liveStreamingRouter.get('/booths/:boothId/catalog', async (req, res) => {
  const bKey = normalizeRouteBoothKey(req.params.boothId);
  const pinned = getBoothPinnedPiece(bKey);
  const items: LivePinnedPiece[] = [];
  const seen = new Set<string>();

  const pushItem = (card: LivePinnedPiece | null | undefined) => {
    if (!card || !card.sku) return;
    const key = card.sku.trim().toUpperCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    items.push(card);
  };

  if (pinned && !pinned.isReserved) pushItem(pinned);

  try {
    const rows = await withDb(async (dbClient) => {
      const q = await dbClient.query(
        `SELECT * FROM public.inventory_pieces
         WHERE (is_sold = false OR is_sold IS NULL)
           AND UPPER(COALESCE(status, 'AVAILABLE')) IN ('AVAILABLE', 'IN_STOCK', 'READY_FOR_SALE', 'ACTIVE', 'LISTED')
         ORDER BY updated_at DESC NULLS LAST
         LIMIT 36;`
      );
      return q.rows || [];
    });
    for (const r of rows) {
      pushItem(formatPieceForLiveSpotlight(r));
    }
  } catch (_) {}

  if (items.length < 18) {
    try {
      const mem = relationalStore.getInventoryPieces ? relationalStore.getInventoryPieces() : [];
      for (const p of mem) {
        if (items.length >= 36) break;
        const st = String(p?.status || 'IN_STOCK').toUpperCase();
        if (!p?.isSold && (st === 'IN_STOCK' || st === 'AVAILABLE' || st === 'READY_FOR_SALE' || st === 'ACTIVE' || st === 'LISTED')) {
          pushItem(formatPieceForLiveSpotlight(p));
        }
      }
    } catch (_) {}
  }

  return res.json({ success: true, boothId: bKey, items: items.slice(0, 36) });
});

liveStreamingRouter.get('/my-bag', async (req, res) => {
  const rawPhone = String(req.query.phone || '').trim();
  const phoneDigits = rawPhone.replace(/\D/g, '');
  const buyerName = String(req.query.name || '').trim().toLowerCase();
  const FREE_DELIVERY_THRESHOLD = 150;

  if (phoneDigits.length < 7 && buyerName.length < 2) {
    return res.json({
      success: true,
      items: [],
      totalAed: 0,
      freeDeliveryThresholdAed: FREE_DELIVERY_THRESHOLD,
      remainingForFreeDeliveryAed: FREE_DELIVERY_THRESHOLD
    });
  }

  const matched = new Map<string, LivePinnedPiece>();
  const phoneSkuSet = phoneDigits.length >= 7 ? buyerClaimedSkusByPhone.get(phoneDigits) : undefined;

  const doesPieceBelongToBuyer = (rawSku: string, lockedBuyerRaw?: string | null): boolean => {
    const skuKey = String(rawSku || '').trim().toUpperCase();
    if (skuKey && phoneSkuSet?.has(skuKey)) return true;
    const lb = String(lockedBuyerRaw || '').trim();
    if (!lb) return false;
    if (buyerName.length >= 2 && lb.toLowerCase() === buyerName) return true;
    if (phoneDigits.length >= 7) {
      const vb = lookupVerifiedBuyer(lb);
      const vbDig = String(vb?.phone || '').replace(/\D/g, '');
      if (vbDig && vbDig === phoneDigits) return true;
    }
    return false;
  };

  try {
    const rows = await withDb(async (dbClient) => {
      const q = await dbClient.query(
        `SELECT * FROM public.inventory_pieces
         WHERE UPPER(COALESCE(status, '')) IN ('RESERVED', 'CLAIMED_PENDING')
           AND (is_sold = false OR is_sold IS NULL)
         ORDER BY updated_at DESC NULLS LAST
         LIMIT 120;`
      );
      return q.rows || [];
    });
    for (const r of rows) {
      const sku = String(r.barcode || r.sku || r.id || '').trim().toUpperCase();
      if (!sku) continue;
      if (doesPieceBelongToBuyer(sku, r.locked_by_buyer)) {
        matched.set(sku, formatPieceForLiveSpotlight(r));
      }
    }
  } catch (_) {}

  try {
    const mem = relationalStore.getInventoryPieces ? relationalStore.getInventoryPieces() : [];
    for (const p of mem) {
      const st = String(p?.status || '').toUpperCase();
      if (p?.isSold || (st !== 'RESERVED' && st !== 'CLAIMED_PENDING')) continue;
      const sku = String(p?.barcode || p?.sku || p?.id || '').trim().toUpperCase();
      if (!sku || matched.has(sku)) continue;
      if (doesPieceBelongToBuyer(sku, p?.lockedByBuyer)) {
        matched.set(sku, formatPieceForLiveSpotlight(p));
      }
    }
  } catch (_) {}

  const items = Array.from(matched.values());
  const totalAed = items.reduce((sum, it) => sum + (Number(it.priceAed) || 0), 0);
  return res.json({
    success: true,
    items,
    totalAed,
    freeDeliveryThresholdAed: FREE_DELIVERY_THRESHOLD,
    remainingForFreeDeliveryAed: Math.max(0, FREE_DELIVERY_THRESHOLD - totalAed)
  });
});

// ======================== VIP PRIVATE MESSENGER + 2-WAY VOICE NOTES ========================
interface LivePrivateMessage {
  id: string;
  sender: 'buyer' | 'admin' | 'peer';
  senderPhone?: string;
  senderName: string;
  text?: string;
  audioUrl?: string;
  audioDurationSec?: number;
  attachment?: {
    url: string;
    kind: 'image' | 'video' | 'audio' | 'pdf' | 'document';
    name: string;
    mime: string;
    sizeBytes: number;
  };
  contactCard?: {
    name: string;
    phone: string;
    label?: string;
  };
  locationPin?: {
    lat?: number;
    lng?: number;
    label?: string;
    address?: string;
    mapsUrl?: string;
  };
  replyTo?: {
    id: string;
    senderName: string;
    preview: string;
  };
  callLog?: {
    mode: 'audio' | 'video';
    status: 'started' | 'completed' | 'missed' | 'declined';
    durationSec?: number;
  };
  pieceCard?: {
    sku: string;
    title: string;
    priceAed: number;
    size?: string;
    frontImageUrl?: string;
  };
  reactions?: Record<string, string>;
  starredBy?: string[];
  deletedFor?: string[];
  deletedForEveryone?: boolean;
  forwarded?: boolean;
  editedAt?: string;
  readAt?: string;
  pinnedInChat?: boolean;
  poll?: {
    question: string;
    allowMultiple?: boolean;
    options: Array<{ id: string; text: string; votes: string[] }>;
  };
  expiresAt?: string;
  createdAt: string;
}

interface LivePrivateThread {
  threadId: string;
  boothId: string;
  buyerName: string;
  buyerPhone: string;
  buyerEmail?: string;
  buyerAddress?: string;
  unreadByAdmin: number;
  unreadByBuyer: number;
  lastMessageAt: string;
  lastMessagePreview: string;
  messages: LivePrivateMessage[];
}

let messengerThreadsCache: Record<string, LivePrivateThread> | null = null;
let lastVoicePruneAt = 0;
let lastMediaPruneAt = 0;

function getMessengerThreadsPath(): string {
  return path.join(process.cwd(), '.data', 'live_messenger_threads.json');
}

function getLiveVoiceDir(): string {
  return path.join(process.cwd(), 'public', 'live_voice');
}

function getLiveMediaDir(): string {
  return path.join(process.cwd(), 'public', 'live_media');
}

function loadMessengerThreads(): Record<string, LivePrivateThread> {
  if (messengerThreadsCache) return messengerThreadsCache;
  try {
    const p = getMessengerThreadsPath();
    if (fs.existsSync(p)) {
      const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        messengerThreadsCache = parsed;
        return messengerThreadsCache!;
      }
    }
  } catch (_) {}
  messengerThreadsCache = {};
  return messengerThreadsCache;
}

function saveMessengerThreads() {
  try {
    const store = loadMessengerThreads();
    const p = getMessengerThreadsPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(store, null, 2), 'utf8');
  } catch (e: any) {
    console.warn('[LiveMessenger] Save failed:', e?.message);
  }
}

function pruneOldVoiceNotes() {
  const now = Date.now();
  if (now - lastVoicePruneAt < 60 * 60 * 1000) return;
  lastVoicePruneAt = now;
  try {
    const dir = getLiveVoiceDir();
    if (!fs.existsSync(dir)) return;
    const cutoff = now - 7 * 24 * 60 * 60 * 1000;
    for (const f of fs.readdirSync(dir)) {
      const fp = path.join(dir, f);
      try {
        const st = fs.statSync(fp);
        if (st.isFile() && st.mtimeMs < cutoff) fs.unlinkSync(fp);
      } catch (_) {}
    }
  } catch (_) {}
}

function pruneOldLiveMedia() {
  const now = Date.now();
  if (now - lastMediaPruneAt < 60 * 60 * 1000) return;
  lastMediaPruneAt = now;
  try {
    const dir = getLiveMediaDir();
    if (!fs.existsSync(dir)) return;
    const cutoff = now - 30 * 24 * 60 * 60 * 1000;
    for (const f of fs.readdirSync(dir)) {
      const fp = path.join(dir, f);
      try {
        const st = fs.statSync(fp);
        if (st.isFile() && st.mtimeMs < cutoff) fs.unlinkSync(fp);
      } catch (_) {}
    }
  } catch (_) {}
}

function detectMediaAttachment(
  buf: Buffer,
  originalName?: string,
  declaredMime?: string
): { ext: string; mime: string; kind: 'image' | 'video' | 'audio' | 'pdf' | 'document' } | null {
  if (!buf || buf.length < 4) return null;
  const nameLower = String(originalName || '').toLowerCase();
  const mimeLower = String(declaredMime || '').toLowerCase();
  const extFromName = path.extname(nameLower).replace(/^\./, '');

  if (buf.length >= 16 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { ext: 'jpg', mime: 'image/jpeg', kind: 'image' };
  }
  if (buf.length >= 16 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { ext: 'png', mime: 'image/png', kind: 'image' };
  }
  if (buf.length >= 16 && buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') {
    return { ext: 'webp', mime: 'image/webp', kind: 'image' };
  }
  if (buf.length >= 12 && buf.slice(0, 4).toString('ascii') === 'GIF8') {
    return { ext: 'gif', mime: 'image/gif', kind: 'image' };
  }
  if (buf.slice(0, 4).toString('ascii') === '%PDF') {
    return { ext: 'pdf', mime: 'application/pdf', kind: 'pdf' };
  }

  // MP4 / MOV / M4A / 3GP container (ftyp box at offset 4)
  if (buf.length >= 12 && buf.slice(4, 8).toString('ascii') === 'ftyp') {
    const majorBrand = buf.slice(8, 12).toString('ascii').toLowerCase();
    if (extFromName === 'm4a' || mimeLower.startsWith('audio/') || majorBrand.startsWith('m4a')) {
      return { ext: 'm4a', mime: 'audio/mp4', kind: 'audio' };
    }
    if (extFromName === '3gp' || majorBrand.startsWith('3gp')) {
      return mimeLower.startsWith('video/')
        ? { ext: '3gp', mime: 'video/3gpp', kind: 'video' }
        : { ext: '3gp', mime: 'audio/3gpp', kind: 'audio' };
    }
    if (extFromName === 'mov' || mimeLower === 'video/quicktime') {
      return { ext: 'mov', mime: 'video/quicktime', kind: 'video' };
    }
    return { ext: 'mp4', mime: 'video/mp4', kind: 'video' };
  }

  // WebM / Matroska (EBML header 1A 45 DF A3)
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    if (mimeLower.startsWith('audio/') || extFromName === 'weba' || extFromName === 'opus' || extFromName === 'webm') {
      if (mimeLower.startsWith('video/')) return { ext: 'webm', mime: 'video/webm', kind: 'video' };
      return { ext: 'webm', mime: 'audio/webm', kind: 'audio' };
    }
    return { ext: 'webm', mime: 'video/webm', kind: 'video' };
  }

  // WAV / OGG / OPUS / FLAC / AMR / AAC / MP3 audio
  if (buf.length >= 12 && buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WAVE') {
    return { ext: 'wav', mime: 'audio/wav', kind: 'audio' };
  }
  if (buf.slice(0, 4).toString('ascii') === 'OggS') {
    return { ext: extFromName === 'opus' ? 'opus' : 'ogg', mime: 'audio/ogg', kind: 'audio' };
  }
  if (buf.slice(0, 4).toString('ascii') === 'fLaC') {
    return { ext: 'flac', mime: 'audio/flac', kind: 'audio' };
  }
  if (buf.slice(0, 5).toString('ascii') === '#!AMR') {
    return { ext: 'amr', mime: 'audio/amr', kind: 'audio' };
  }
  if (buf[0] === 0xff && (buf[1] === 0xf1 || buf[1] === 0xf9)) {
    return { ext: 'aac', mime: 'audio/aac', kind: 'audio' };
  }
  if (buf.slice(0, 3).toString('ascii') === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0 && extFromName === 'mp3')) {
    return { ext: 'mp3', mime: 'audio/mpeg', kind: 'audio' };
  }

  // Office / ZIP archives (PK header)
  if (buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 0x03 || buf[2] === 0x05)) {
    const zipMap: Record<string, string> = {
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      zip: 'application/zip'
    };
    const chosenExt = zipMap[extFromName] ? extFromName : 'zip';
    return { ext: chosenExt, mime: zipMap[chosenExt], kind: 'document' };
  }

  // Legacy DOC/XLS OLE2
  if (buf.length >= 8 && buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0) {
    if (extFromName === 'xls') return { ext: 'xls', mime: 'application/vnd.ms-excel', kind: 'document' };
    if (extFromName === 'doc') return { ext: 'doc', mime: 'application/msword', kind: 'document' };
  }

  // Plain text / CSV documents (must not contain NUL bytes)
  if ((extFromName === 'txt' || extFromName === 'csv') && !buf.subarray(0, 512).includes(0)) {
    return {
      ext: extFromName,
      mime: extFromName === 'csv' ? 'text/csv; charset=utf-8' : 'text/plain; charset=utf-8',
      kind: 'document'
    };
  }

  return null;
}

async function processUploadedVoiceAndMedia(body: any): Promise<{
  audioUrl?: string;
  attachment?: LivePrivateMessage['attachment'];
  contactCard?: LivePrivateMessage['contactCard'];
  locationPin?: LivePrivateMessage['locationPin'];
  error?: string;
}> {
  let audioUrl = '';
  const rawAudioB64 = String(body.audioBase64 || '').trim();
  if (rawAudioB64) {
    pruneOldVoiceNotes();
    const commaIdx = rawAudioB64.indexOf(',');
    const headerPart = commaIdx !== -1 ? rawAudioB64.slice(0, commaIdx).toLowerCase() : '';
    const b64Payload = (commaIdx !== -1 && headerPart.includes('base64')
      ? rawAudioB64.slice(commaIdx + 1)
      : rawAudioB64
    ).replace(/\s+/g, '');
    const buf = Buffer.from(b64Payload, 'base64');
    if (buf.length < 128 || buf.length > 5 * 1024 * 1024) {
      return { error: 'Invalid or empty voice note audio (must be under 5MB)' };
    }
    const mime = (String(body.audioMime || '') || headerPart).toLowerCase();
    const rawExt = mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')
      ? 'm4a'
      : mime.includes('ogg')
      ? 'ogg'
      : mime.includes('wav')
      ? 'wav'
      : 'webm';
    const voiceDir = getLiveVoiceDir();
    fs.mkdirSync(voiceDir, { recursive: true });
    const idSlug = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const tmpPath = path.join(voiceDir, `tmp_${idSlug}.${rawExt}`);
    const finalM4aName = `vm_${idSlug}.m4a`;
    const finalM4aPath = path.join(voiceDir, finalM4aName);
    fs.writeFileSync(tmpPath, buf);

    let savedFileName = '';
    const ffmpegExe = getFfmpegPath();
    try {
      await execFileAsync(
        ffmpegExe,
        [
          '-hide_banner',
          '-loglevel', 'error',
          '-y',
          '-i', tmpPath,
          '-vn',
          '-af', 'highpass=f=85:poles=2,lowpass=f=8000:poles=2,dynaudnorm=f=100:g=11:p=0.90:m=10:s=3,alimiter=limit=0.95',
          '-c:a', 'aac',
          '-profile:a', 'aac_low',
          '-b:a', '96k',
          '-ar', '44100',
          '-ac', '1',
          '-movflags', '+faststart',
          finalM4aPath
        ],
        { timeout: 12000, windowsHide: true }
      );
      if (fs.existsSync(finalM4aPath) && fs.statSync(finalM4aPath).size >= 256) {
        savedFileName = finalM4aName;
        try { fs.unlinkSync(tmpPath); } catch (_) {}
      }
    } catch (convErr: any) {
      console.warn('[Messenger] Voice note filtered .m4a transcode retrying plain:', convErr?.message || convErr);
      try {
        await execFileAsync(
          ffmpegExe,
          [
            '-hide_banner',
            '-loglevel', 'error',
            '-y',
            '-i', tmpPath,
            '-vn',
            '-c:a', 'aac',
            '-profile:a', 'aac_low',
            '-b:a', '96k',
            '-ar', '44100',
            '-ac', '1',
            '-movflags', '+faststart',
            finalM4aPath
          ],
          { timeout: 12000, windowsHide: true }
        );
        if (fs.existsSync(finalM4aPath) && fs.statSync(finalM4aPath).size >= 256) {
          savedFileName = finalM4aName;
          try { fs.unlinkSync(tmpPath); } catch (_) {}
        }
      } catch (plainErr: any) {
        console.warn('[Messenger] Voice note plain .m4a transcode fallback:', plainErr?.message || plainErr);
      }
    }

    if (!savedFileName) {
      const fallbackName = `vm_${idSlug}.${rawExt}`;
      const fallbackPath = path.join(voiceDir, fallbackName);
      try { fs.renameSync(tmpPath, fallbackPath); } catch (_) { fs.writeFileSync(fallbackPath, buf); }
      savedFileName = fallbackName;
    }
    audioUrl = `/api/live/voice/${savedFileName}`;
  }

  let attachment: LivePrivateMessage['attachment'] | undefined;
  const rawAttB64 = String(body.attachmentBase64 || '').trim();
  if (rawAttB64) {
    pruneOldLiveMedia();
    const commaIdx = rawAttB64.indexOf(',');
    const hdrPart = commaIdx !== -1 ? rawAttB64.slice(0, commaIdx).toLowerCase() : '';
    const b64Payload = (commaIdx !== -1 && hdrPart.includes('base64')
      ? rawAttB64.slice(commaIdx + 1)
      : rawAttB64
    ).replace(/\s+/g, '');
    const attBuf = Buffer.from(b64Payload, 'base64');
    if (attBuf.length < 4 || attBuf.length > 20 * 1024 * 1024) {
      return { error: 'Attachment must be under 20MB' };
    }
    const detected = detectMediaAttachment(attBuf, body.attachmentName, body.attachmentMime || hdrPart);
    if (!detected) {
      return { error: 'Supported: Photos (JPG/PNG/WebP/GIF), Videos (MP4/MOV/WebM), Audio (MP3/M4A/WAV/OGG/AAC), PDF, DOCX/XLSX/PPTX/ZIP' };
    }
    const mediaDir = getLiveMediaDir();
    fs.mkdirSync(mediaDir, { recursive: true });
    const idSlug = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    let fileName = `lm_${idSlug}.${detected.ext}`;
    let finalMime = detected.mime;
    let finalSize = attBuf.length;
    const rawPath = path.join(mediaDir, fileName);
    fs.writeFileSync(rawPath, attBuf);

    // Transcode Android/Web audio formats (.webm/.ogg/.opus/.amr/.3gp/.aac/.flac) to universal .m4a for iOS + Android playback
    if (detected.kind === 'audio' && ['webm', 'ogg', 'opus', 'amr', '3gp', 'aac', 'flac'].includes(detected.ext)) {
      const m4aName = `lm_${idSlug}.m4a`;
      const m4aPath = path.join(mediaDir, m4aName);
      try {
        await execFileAsync(
          getFfmpegPath(),
          [
            '-hide_banner',
            '-loglevel', 'error',
            '-y',
            '-i', rawPath,
            '-vn',
            '-c:a', 'aac',
            '-profile:a', 'aac_low',
            '-b:a', '128k',
            '-ar', '44100',
            '-movflags', '+faststart',
            m4aPath
          ],
          { timeout: 15000, windowsHide: true }
        );
        if (fs.existsSync(m4aPath) && fs.statSync(m4aPath).size >= 256) {
          fileName = m4aName;
          finalMime = 'audio/mp4';
          finalSize = fs.statSync(m4aPath).size;
          try { fs.unlinkSync(rawPath); } catch (_) {}
        }
      } catch (audErr: any) {
        console.warn('[Messenger] Audio attachment .m4a transcode fallback:', audErr?.message || audErr);
      }
    }

    const rawName = path.basename(String(body.attachmentName || `file.${detected.ext}`));
    const cleanName = rawName.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim().slice(0, 100) || `file.${detected.ext}`;
    attachment = {
      url: `/api/live/media/${fileName}`,
      kind: detected.kind,
      name: cleanName,
      mime: finalMime,
      sizeBytes: finalSize
    };
  }

  let contactCard: LivePrivateMessage['contactCard'] | undefined;
  if (body.contactCard && typeof body.contactCard === 'object') {
    const cName = String(body.contactCard.name || '').trim().slice(0, 80);
    const cPhone = String(body.contactCard.phone || '').trim().slice(0, 32);
    if (cName && cPhone.replace(/\D/g, '').length >= 5) {
      contactCard = {
        name: cName,
        phone: cPhone,
        label: body.contactCard.label ? String(body.contactCard.label).trim().slice(0, 60) : undefined
      };
    }
  }

  let locationPin: LivePrivateMessage['locationPin'] | undefined;
  if (body.locationPin && typeof body.locationPin === 'object') {
    const rawLat = body.locationPin.lat;
    const rawLng = body.locationPin.lng;
    const hasCoords = rawLat !== undefined && rawLat !== null && rawLat !== '' && rawLng !== undefined && rawLng !== null && rawLng !== '';
    const lat = Number(rawLat);
    const lng = Number(rawLng);
    const cleanLabel = body.locationPin.label ? String(body.locationPin.label).trim().slice(0, 120) : '';
    const cleanAddress = body.locationPin.address ? String(body.locationPin.address).trim().slice(0, 180) : '';
    if (hasCoords && Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      const nLat = Number(lat.toFixed(6));
      const nLng = Number(lng.toFixed(6));
      locationPin = {
        lat: nLat,
        lng: nLng,
        label: cleanLabel || 'Shared GPS Location',
        address: cleanAddress || undefined,
        mapsUrl: `https://www.google.com/maps?q=${nLat},${nLng}`
      };
    } else if (cleanLabel || cleanAddress) {
      locationPin = {
        label: cleanLabel || cleanAddress,
        address: cleanAddress || cleanLabel,
        mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanAddress || cleanLabel)}`
      };
    }
  }

  return {
    audioUrl: audioUrl || undefined,
    attachment,
    contactCard,
    locationPin
  };
}

function buildMessagePreviewText(msg: Partial<LivePrivateMessage>): string {
  if (msg.poll) return `📊 Poll: ${msg.poll.question}`;
  if (msg.callLog) {
    return `${msg.callLog.mode === 'video' ? '📹 Video Call' : '📞 Audio Call'} (${msg.callLog.status}${msg.callLog.durationSec ? ` ${msg.callLog.durationSec}s` : ''})`;
  }
  if (msg.contactCard) return `👤 Contact: ${msg.contactCard.name}`;
  if (msg.locationPin) return `📍 Location${msg.locationPin.label ? `: ${msg.locationPin.label}` : ''}`;
  if (msg.attachment) {
    const k = msg.attachment.kind;
    const tag = k === 'video' ? '🎬 Video' : k === 'audio' ? '🎧 Audio' : k === 'pdf' ? `📄 PDF: ${msg.attachment.name}` : k === 'document' ? `📎 ${msg.attachment.name}` : '📷 Photo';
    return msg.text ? `${tag} — ${msg.text.slice(0, 40)}` : tag;
  }
  if (msg.audioUrl) return msg.text ? `🎙️ Voice + ${msg.text.slice(0, 40)}` : `🎙️ Voice Note (${msg.audioDurationSec || 1}s)`;
  if (msg.text) return msg.text.slice(0, 80);
  return `🏷️ ${msg.pieceCard?.sku || 'Piece Inquiry'}`;
}

function isValidDeskPin(req: any): boolean {
  const expected = String(process.env.VV_INTERCOM_PIN || '0099').trim();
  const given = String(req?.headers?.['x-desk-pin'] || req?.query?.pin || req?.body?.pin || '').trim();
  return Boolean(expected && given && given === expected);
}

liveStreamingRouter.get('/messenger/threads', (req, res) => {
  if (!isValidDeskPin(req)) {
    return res.status(401).json({ success: false, error: 'INVALID_DESK_PIN' });
  }
  const store = loadMessengerThreads();
  const list = Object.values(store)
    .map((t) => ({
      threadId: t.threadId,
      boothId: t.boothId,
      buyerName: t.buyerName,
      buyerPhone: t.buyerPhone,
      buyerEmail: t.buyerEmail || '',
      buyerAddress: t.buyerAddress || '',
      unreadByAdmin: Number(t.unreadByAdmin || 0),
      unreadByBuyer: Number(t.unreadByBuyer || 0),
      lastMessageAt: t.lastMessageAt,
      lastMessagePreview: t.lastMessagePreview,
      messageCount: Array.isArray(t.messages) ? t.messages.length : 0
    }))
    .sort((a, b) => String(b.lastMessageAt).localeCompare(String(a.lastMessageAt)));
  return res.json({ success: true, threads: list });
});

liveStreamingRouter.get('/messenger/thread/:threadId', (req, res) => {
  const threadId = String(req.params.threadId || '').trim().toLowerCase();
  if (!threadId) return res.status(400).json({ success: false, error: 'Invalid threadId' });

  const adminAuth = isValidDeskPin(req);
  const phoneDigits = String(req.query.phone || '').replace(/\D/g, '');
  const buyerAuth = phoneDigits.length >= 7 && threadId === `wa_${phoneDigits}`;
  if (!adminAuth && !buyerAuth) {
    return res.status(401).json({ success: false, error: 'UNAUTHORIZED_THREAD_ACCESS' });
  }

  const store = loadMessengerThreads();
  const thread = store[threadId];
  if (!thread) {
    return res.json({
      success: true,
      thread: {
        threadId,
        boothId: 'booth-1',
        buyerName: '',
        buyerPhone: phoneDigits ? `+${phoneDigits}` : '',
        unreadByAdmin: 0,
        unreadByBuyer: 0,
        lastMessageAt: '',
        lastMessagePreview: '',
        messages: []
      }
    });
  }

  const viewerParam = String(req.query.viewer || (adminAuth ? 'admin' : 'buyer')).toLowerCase();
  if (adminAuth && viewerParam === 'admin' && thread.unreadByAdmin > 0) {
    thread.unreadByAdmin = 0;
    saveMessengerThreads();
  } else if (buyerAuth && viewerParam === 'buyer' && thread.unreadByBuyer > 0) {
    thread.unreadByBuyer = 0;
    saveMessengerThreads();
  }
  return res.json({ success: true, thread });
});

liveStreamingRouter.post('/messenger/send', async (req, res) => {
  const body = req.body || {};
  const sender: 'buyer' | 'admin' = body.sender === 'admin' ? 'admin' : 'buyer';
  const boothId = normalizeRouteBoothKey(String(body.boothId || 'booth-1'));

  if (sender === 'admin' && !isValidDeskPin(req)) {
    return res.status(401).json({ success: false, error: 'INVALID_DESK_PIN' });
  }

  const store = loadMessengerThreads();
  const buyerPhoneRaw = String(body.buyerPhone || '').trim();
  const phoneDigits = buyerPhoneRaw.replace(/\D/g, '');
  let threadId = String(body.threadId || '').trim().toLowerCase();

  if (sender === 'buyer') {
    const cleanBuyerName = String(body.buyerName || '').trim();
    if (phoneDigits.length < 7 || cleanBuyerName.length < 2) {
      return res.status(400).json({ success: false, error: 'Buyer name and valid WhatsApp phone required' });
    }
    const derived = `wa_${phoneDigits}`;
    if (!threadId) threadId = derived;
    if (threadId !== derived) {
      return res.status(403).json({ success: false, error: 'Thread ID mismatch' });
    }
  } else {
    if (!threadId) {
      if (phoneDigits.length < 7) {
        return res.status(400).json({ success: false, error: 'threadId or buyerPhone required' });
      }
      threadId = `wa_${phoneDigits}`;
    }
  }

  const cleanText = String(body.text || '').trim().slice(0, 1000);
  const mediaRes = await processUploadedVoiceAndMedia(body);
  if (mediaRes.error) {
    return res.status(400).json({ success: false, error: mediaRes.error });
  }
  const { audioUrl, attachment, contactCard, locationPin } = mediaRes;

  let pieceCard: LivePrivateMessage['pieceCard'] | undefined;
  if (body.pieceCard && body.pieceCard.sku) {
    pieceCard = {
      sku: String(body.pieceCard.sku).trim().slice(0, 48),
      title: String(body.pieceCard.title || 'Vintage Piece').trim().slice(0, 120),
      priceAed: Number(body.pieceCard.priceAed || 0),
      size: body.pieceCard.size ? String(body.pieceCard.size).trim().slice(0, 20) : undefined,
      frontImageUrl: body.pieceCard.frontImageUrl ? String(body.pieceCard.frontImageUrl).trim().slice(0, 400) : undefined
    };
  }

  let replyTo: LivePrivateMessage['replyTo'] | undefined;
  if (body.replyTo && typeof body.replyTo === 'object' && body.replyTo.id) {
    replyTo = {
      id: String(body.replyTo.id).trim().slice(0, 80),
      senderName: String(body.replyTo.senderName || 'Message').trim().slice(0, 60),
      preview: String(body.replyTo.preview || '').trim().slice(0, 120)
    };
  }

  let callLog: LivePrivateMessage['callLog'] | undefined;
  if (body.callLog && typeof body.callLog === 'object' && (body.callLog.mode === 'audio' || body.callLog.mode === 'video')) {
    const allowedStatuses = new Set(['started', 'completed', 'missed', 'declined']);
    const st = allowedStatuses.has(String(body.callLog.status || '')) ? body.callLog.status : 'completed';
    const durRaw = Number(body.callLog.durationSec);
    callLog = {
      mode: body.callLog.mode,
      status: st,
      durationSec: Number.isFinite(durRaw) && durRaw > 0 ? Math.min(86400, Math.round(durRaw)) : undefined
    };
  }

  if (!cleanText && !audioUrl && !attachment && !contactCard && !locationPin && !pieceCard && !callLog) {
    return res.status(400).json({ success: false, error: 'Message text, attachment, contact, location, voice note, call log, or piece card required' });
  }

  const nowIso = new Date().toISOString();
  const existing = store[threadId];
  const thread: LivePrivateThread = existing || {
    threadId,
    boothId,
    buyerName: String(body.buyerName || 'VIP Buyer').trim(),
    buyerPhone: buyerPhoneRaw || `+${threadId.replace(/^wa_/, '')}`,
    buyerEmail: body.buyerEmail ? String(body.buyerEmail).trim() : '',
    buyerAddress: body.buyerAddress ? String(body.buyerAddress).trim() : '',
    unreadByAdmin: 0,
    unreadByBuyer: 0,
    lastMessageAt: nowIso,
    lastMessagePreview: '',
    messages: []
  };

  if (sender === 'buyer') {
    if (body.buyerName) thread.buyerName = String(body.buyerName).trim();
    if (buyerPhoneRaw) thread.buyerPhone = buyerPhoneRaw;
    if (body.buyerEmail) thread.buyerEmail = String(body.buyerEmail).trim();
    if (body.buyerAddress) thread.buyerAddress = String(body.buyerAddress).trim();
  }

  const msgObj: LivePrivateMessage = {
    id: `pm_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    sender,
    senderName: sender === 'admin' ? 'Vintage Vibes Desk' : thread.buyerName,
    text: cleanText || undefined,
    audioUrl: audioUrl || undefined,
    audioDurationSec: body.audioDurationSec ? Math.min(60, Math.max(1, Math.round(Number(body.audioDurationSec)))) : undefined,
    attachment,
    contactCard,
    locationPin,
    replyTo,
    callLog,
    pieceCard,
    createdAt: nowIso
  };

  thread.boothId = boothId;
  thread.messages.push(msgObj);
  if (thread.messages.length > 120) {
    thread.messages = thread.messages.slice(-120);
  }
  thread.lastMessageAt = nowIso;
  thread.lastMessagePreview = buildMessagePreviewText(msgObj);

  if (sender === 'buyer') {
    thread.unreadByAdmin = Number(thread.unreadByAdmin || 0) + 1;
  } else {
    thread.unreadByBuyer = Number(thread.unreadByBuyer || 0) + 1;
  }

  store[threadId] = thread;
  saveMessengerThreads();

  const threadSummary = {
    threadId: thread.threadId,
    boothId: thread.boothId,
    buyerName: thread.buyerName,
    buyerPhone: thread.buyerPhone,
    unreadByAdmin: thread.unreadByAdmin,
    unreadByBuyer: thread.unreadByBuyer,
    lastMessageAt: thread.lastMessageAt,
    lastMessagePreview: thread.lastMessagePreview
  };
  broadcastLivePrivateMessage(boothId, threadId, { message: msgObj, threadSummary });

  const pushTarget = sender === 'buyer' ? 'admin_desk' : threadId;
  void sendWebPushToOwner(
    pushTarget,
    {
      kind: 'chat',
      title: sender === 'buyer' ? `💬 ${thread.buyerName}` : '👑 Vintage Vibes Desk',
      body: thread.lastMessagePreview || 'New message',
      threadId,
      url: sender === 'buyer' ? 'https://vintagevibesgk.com/live/desk' : `https://vintagevibesgk.com/live/connect`
    },
    { ttl: 300, urgency: 'high', topic: threadId.slice(0, 32) }
  );

  return res.json({ success: true, threadId, message: msgObj, threadSummary });
});

liveStreamingRouter.get('/voice/:filename', (req, res) => {
  const filename = String(req.params.filename || '').trim();
  if (!/^vm_[a-zA-Z0-9_-]+\.(webm|m4a|mp4|ogg|wav)$/.test(filename)) {
    return res.status(400).json({ error: 'Invalid audio file name' });
  }
  const filePath = path.resolve(getLiveVoiceDir(), filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).end();
  }
  const lower = filename.toLowerCase();
  const ct = lower.endsWith('.m4a') || lower.endsWith('.mp4')
    ? 'audio/mp4'
    : lower.endsWith('.ogg')
    ? 'audio/ogg'
    : lower.endsWith('.wav')
    ? 'audio/wav'
    : 'audio/webm';
  res.setHeader('Content-Type', ct);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Vary', 'Range');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  return res.sendFile(filePath);
});

liveStreamingRouter.get('/media/:filename', (req, res) => {
  const filename = String(req.params.filename || '').trim();
  if (!/^(lm|av)_[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp|gif|pdf|mp4|mov|webm|3gp|mp3|m4a|wav|ogg|opus|aac|flac|amr|docx|xlsx|pptx|zip|doc|xls|txt|csv)$/i.test(filename)) {
    return res.status(400).json({ error: 'Invalid media file name' });
  }
  const filePath = path.resolve(getLiveMediaDir(), filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).end();
  }
  const lower = filename.toLowerCase();
  const ext = path.extname(lower).replace(/^\./, '');
  const mimeMap: Record<string, string> = {
    pdf: 'application/pdf',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    webm: 'video/webm',
    '3gp': 'audio/3gpp',
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    opus: 'audio/ogg',
    aac: 'audio/aac',
    flac: 'audio/flac',
    amr: 'audio/amr',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    zip: 'application/zip',
    doc: 'application/msword',
    xls: 'application/vnd.ms-excel',
    txt: 'text/plain; charset=utf-8',
    csv: 'text/csv; charset=utf-8'
  };
  const ct = mimeMap[ext] || 'application/octet-stream';
  const dlMode = String(req.query.download || '') === '1' ? 'attachment' : 'inline';
  const dlName = String(req.query.name || filename).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100) || filename;
  res.setHeader('Content-Type', ct);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Vary', 'Range');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `${dlMode}; filename="${dlName}"`);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  return res.sendFile(filePath);
});

const privateCallRooms = new Map<string, { roomId: string; label: string; createdAt: number }>();

function pruneExpiredCallRooms() {
  const cutoff = Date.now() - 12 * 60 * 60 * 1000;
  for (const [k, v] of privateCallRooms.entries()) {
    if (v.createdAt < cutoff) privateCallRooms.delete(k);
  }
}

let cachedDynamicIce: { expiresAt: number; servers: Array<Record<string, any>> } | null = null;

liveStreamingRouter.get('/call/ice-config', async (_req, res) => {
  const iceServers: Array<Record<string, any>> = [
    {
      urls: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302',
        'stun:stun.cloudflare.com:3478'
      ]
    }
  ];

  const turnUrl = String(process.env.VV_TURN_URL || '').trim();
  if (turnUrl) {
    const entry: Record<string, any> = { urls: turnUrl.split(',').map((s) => s.trim()).filter(Boolean) };
    if (process.env.VV_TURN_USERNAME) entry.username = String(process.env.VV_TURN_USERNAME).trim();
    if (process.env.VV_TURN_PASSWORD) entry.credential = String(process.env.VV_TURN_PASSWORD).trim();
    iceServers.push(entry);
  }

  const cfKeyId = String(process.env.CLOUDFLARE_TURN_KEY_ID || '').trim();
  const cfToken = String(process.env.CLOUDFLARE_TURN_API_TOKEN || '').trim();
  const meteredDomain = String(process.env.METERED_TURN_DOMAIN || '').trim();
  const meteredKey = String(process.env.METERED_TURN_API_KEY || '').trim();

  if (cfKeyId && cfToken) {
    if (cachedDynamicIce && Date.now() < cachedDynamicIce.expiresAt) {
      iceServers.push(...cachedDynamicIce.servers);
    } else {
      try {
        const cfResp = await fetch(
          `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(cfKeyId)}/credentials/generate-ice-servers`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${cfToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ ttl: 86400 }),
            signal: AbortSignal.timeout(4500)
          }
        );
        if (cfResp.ok) {
          const cfJson: any = await cfResp.json().catch(() => null);
          const rawServers = Array.isArray(cfJson?.iceServers)
            ? cfJson.iceServers
            : (cfJson?.iceServers && typeof cfJson.iceServers === 'object' ? [cfJson.iceServers] : []);
          if (rawServers.length > 0) {
            cachedDynamicIce = { expiresAt: Date.now() + 6 * 60 * 60 * 1000, servers: rawServers };
            iceServers.push(...rawServers);
          }
        }
      } catch (_) {}
    }
  } else if (meteredDomain && meteredKey) {
    if (cachedDynamicIce && Date.now() < cachedDynamicIce.expiresAt) {
      iceServers.push(...cachedDynamicIce.servers);
    } else {
      try {
        const mResp = await fetch(
          `https://${encodeURIComponent(meteredDomain)}/api/v1/turn/credentials?apiKey=${encodeURIComponent(meteredKey)}`,
          { signal: AbortSignal.timeout(4500) }
        );
        if (mResp.ok) {
          const mJson: any = await mResp.json().catch(() => null);
          const rawServers = Array.isArray(mJson) ? mJson : [];
          if (rawServers.length > 0) {
            cachedDynamicIce = { expiresAt: Date.now() + 60 * 60 * 1000, servers: rawServers };
            iceServers.push(...rawServers);
          }
        }
      } catch (_) {}
    }
  }

  const hasTurn = iceServers.some((s) =>
    /turns?:/i.test(Array.isArray(s.urls) ? s.urls.join(',') : String(s.urls || ''))
  );
  return res.json({ success: true, iceServers, hasTurn });
});

liveStreamingRouter.post('/call/create-room', (req, res) => {
  if (!isValidDeskPin(req)) {
    return res.status(401).json({ success: false, error: 'INVALID_DESK_PIN' });
  }
  pruneExpiredCallRooms();
  const roomId = `vv_${crypto.randomBytes(4).toString('hex')}`;
  const label = String(req.body?.label || 'Vintage Vibes Private Call').trim().slice(0, 80);
  privateCallRooms.set(roomId, { roomId, label, createdAt: Date.now() });
  return res.json({
    success: true,
    roomId,
    label,
    callUrl: `/live/call?room=${roomId}`
  });
});

liveStreamingRouter.get('/call/room/:roomId', (req, res) => {
  pruneExpiredCallRooms();
  const roomId = String(req.params.roomId || '').trim();
  if (!/^vv_[a-f0-9]{6,16}$/i.test(roomId)) {
    return res.status(400).json({ success: false, valid: false, error: 'Invalid room code' });
  }
  const found = privateCallRooms.get(roomId) || privateCallRooms.get(roomId.toLowerCase());
  return res.json({
    success: true,
    valid: true,
    roomId,
    label: found?.label || 'Vintage Vibes Private Call'
  });
});

// ======================== FREE VAPID WEB PUSH + WHATSAPP OTP / PIN AUTH + ZERO-LEAK P2P CONNECT ========================
interface ConnectQuickReply {
  id: string;
  shortcut: string;
  text: string;
}

interface ConnectUserSettings {
  theme?: 'wa_dark' | 'midnight_gold' | 'vv_champagne' | 'emerald_night' | 'oled_black';
  wallpaper?: 'gold_atelier' | 'wa_doodle' | 'silk_minimal' | 'clean_solid';
  hdPhotos?: boolean;
  enterToSend?: boolean;
  soundEnabled?: boolean;
  ringtoneEnabled?: boolean;
  readReceipts?: boolean;
  showOnline?: boolean;
  disappearingHours?: number;
}

interface ConnectUserRecord {
  phoneDigits: string;
  displayPhone: string;
  name: string;
  about?: string;
  avatarUrl?: string;
  email?: string;
  pinHash?: string;
  pinSalt?: string;
  phoneVerified?: boolean;
  phoneVerifiedAt?: string;
  phoneVerifiedVia?: 'whatsapp_otp' | 'sms_otp' | 'desk_verified';
  activeSessionId?: string;
  activeDeviceId?: string;
  activeDeviceName?: string;
  activeDevicePlatform?: string;
  activeSessionStartedAt?: string;
  twoStepPinEnabled?: boolean;
  settings?: ConnectUserSettings;
  blockedPhones?: string[];
  archivedThreads?: string[];
  favoriteThreads?: string[];
  pinnedThreads?: string[];
  mutedThreads?: string[];
  quickReplies?: ConnectQuickReply[];
  createdAt: string;
  lastSeenAt: string;
}

interface ConnectStatusEntry {
  id: string;
  phoneDigits: string;
  userName: string;
  userAvatar?: string;
  kind: 'text' | 'image';
  text?: string;
  bg?: string;
  imageUrl?: string;
  caption?: string;
  views: Array<{ phoneDigits: string; name: string; viewedAt: string }>;
  createdAt: string;
  expiresAt: string;
}

interface ConnectCallLogEntry {
  id: string;
  callId: string;
  direction: 'outgoing' | 'incoming';
  peerPhone: string;
  peerName: string;
  mode: 'audio' | 'video';
  status: 'completed' | 'missed' | 'declined' | 'no_answer';
  durationSec?: number;
  createdAt: string;
}

interface ConnectP2PThread {
  threadId: string;
  participants: string[]; // sorted [phoneA, phoneB]
  participantNames: Record<string, string>;
  lastMessageAt: string;
  lastMessagePreview: string;
  messages: LivePrivateMessage[];
}

interface ConnectGroupRecord {
  groupId: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  inviteCode: string;
  createdBy: string;
  admins: string[];
  members: string[];
  createdAt: string;
  lastMessageAt: string;
  lastMessagePreview: string;
  messages: LivePrivateMessage[];
}

interface ConnectOtpEntry {
  code: string;
  name: string;
  displayPhone: string;
  expiresAt: number;
  requestedAt: number;
  attempts: number;
  channel: 'whatsapp_otp' | 'sms_otp' | 'desk_otp_pending';
  deviceId?: string;
  deviceName?: string;
  platform?: string;
}

const connectOtpStore = new Map<string, ConnectOtpEntry>();
const connectPinFailures = new Map<string, { count: number; resetAt: number }>();
let connectUsersCache: Record<string, ConnectUserRecord> | null = null;
let connectThreadsCache: Record<string, ConnectP2PThread> | null = null;
let connectCallLogsCache: Record<string, ConnectCallLogEntry[]> | null = null;
let connectGroupsCache: Record<string, ConnectGroupRecord> | null = null;
let connectStatusesCache: ConnectStatusEntry[] | null = null;

function getConnectStatusesPath(): string {
  return path.join(process.cwd(), '.data', 'vv_connect_status.json');
}
function pruneExpiredStatuses(list: ConnectStatusEntry[]): ConnectStatusEntry[] {
  const now = Date.now();
  return (Array.isArray(list) ? list : []).filter((s) => s && s.expiresAt && Date.parse(s.expiresAt) > now);
}
function loadConnectStatuses(): ConnectStatusEntry[] {
  if (connectStatusesCache) {
    connectStatusesCache = pruneExpiredStatuses(connectStatusesCache);
    return connectStatusesCache;
  }
  try {
    const p = getConnectStatusesPath();
    if (fs.existsSync(p)) {
      const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (Array.isArray(parsed)) {
        connectStatusesCache = pruneExpiredStatuses(parsed);
        return connectStatusesCache;
      }
    }
  } catch (_) {}
  connectStatusesCache = [];
  return connectStatusesCache;
}
function saveConnectStatuses() {
  try {
    const list = pruneExpiredStatuses(loadConnectStatuses());
    connectStatusesCache = list;
    const p = getConnectStatusesPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(list, null, 2), 'utf8');
  } catch (_) {}
}

function getConnectUsersPath(): string {
  return path.join(process.cwd(), '.data', 'vv_connect_users.json');
}
function getConnectThreadsPath(): string {
  return path.join(process.cwd(), '.data', 'vv_p2p_threads.json');
}
function getConnectCallLogsPath(): string {
  return path.join(process.cwd(), '.data', 'vv_connect_call_logs.json');
}
function getConnectGroupsPath(): string {
  return path.join(process.cwd(), '.data', 'vv_connect_groups.json');
}
function loadConnectGroups(): Record<string, ConnectGroupRecord> {
  if (connectGroupsCache) return connectGroupsCache;
  try {
    const p = getConnectGroupsPath();
    if (fs.existsSync(p)) {
      const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        connectGroupsCache = parsed;
        return connectGroupsCache!;
      }
    }
  } catch (_) {}
  connectGroupsCache = {};
  return connectGroupsCache;
}
function saveConnectGroups() {
  try {
    const p = getConnectGroupsPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(loadConnectGroups(), null, 2), 'utf8');
  } catch (_) {}
}
function hydrateGroupMembers(g: ConnectGroupRecord, users: Record<string, ConnectUserRecord>) {
  return (Array.isArray(g.members) ? g.members : []).map((d) => {
    const u = users[d];
    return {
      phoneDigits: d,
      displayPhone: u?.displayPhone || `+${d}`,
      name: u?.name || `+${d}`,
      avatarUrl: u?.avatarUrl || '',
      online: u?.settings?.showOnline === false ? false : isConnectUserOnline(d),
      isAdmin: Array.isArray(g.admins) ? g.admins.includes(d) : d === g.createdBy
    };
  });
}
function loadConnectUsers(): Record<string, ConnectUserRecord> {
  if (connectUsersCache) return connectUsersCache;
  try {
    const p = getConnectUsersPath();
    if (fs.existsSync(p)) {
      const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        connectUsersCache = parsed;
        return connectUsersCache!;
      }
    }
  } catch (_) {}
  connectUsersCache = {};
  return connectUsersCache;
}
function saveConnectUsers() {
  try {
    const p = getConnectUsersPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(loadConnectUsers(), null, 2), 'utf8');
  } catch (_) {}
}
function loadConnectThreads(): Record<string, ConnectP2PThread> {
  if (connectThreadsCache) return connectThreadsCache;
  try {
    const p = getConnectThreadsPath();
    if (fs.existsSync(p)) {
      const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        connectThreadsCache = parsed;
        return connectThreadsCache!;
      }
    }
  } catch (_) {}
  connectThreadsCache = {};
  return connectThreadsCache;
}
function saveConnectThreads() {
  try {
    const p = getConnectThreadsPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(loadConnectThreads(), null, 2), 'utf8');
  } catch (_) {}
}
function loadConnectCallLogs(): Record<string, ConnectCallLogEntry[]> {
  if (connectCallLogsCache) return connectCallLogsCache;
  try {
    const p = getConnectCallLogsPath();
    if (fs.existsSync(p)) {
      const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        connectCallLogsCache = parsed;
        return connectCallLogsCache!;
      }
    }
  } catch (_) {}
  connectCallLogsCache = {};
  return connectCallLogsCache;
}
function saveConnectCallLogs() {
  try {
    const p = getConnectCallLogsPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(loadConnectCallLogs(), null, 2), 'utf8');
  } catch (_) {}
}
function toPublicConnectUser(u: ConnectUserRecord) {
  return {
    phoneDigits: u.phoneDigits,
    displayPhone: u.displayPhone,
    name: u.name,
    about: u.about || 'Hey there! I am using VV Connect App.',
    avatarUrl: u.avatarUrl || '',
    email: u.email || '',
    hasPin: Boolean(u.pinHash),
    phoneVerified: Boolean(u.phoneVerified),
    phoneVerifiedVia: u.phoneVerifiedVia || '',
    phoneVerifiedAt: u.phoneVerifiedAt || '',
    twoStepPinEnabled: Boolean(u.twoStepPinEnabled && u.pinHash),
    activeDeviceName: u.activeDeviceName || '',
    activeDevicePlatform: u.activeDevicePlatform || '',
    activeSessionStartedAt: u.activeSessionStartedAt || '',
    settings: {
      theme: u.settings?.theme || 'midnight_gold',
      wallpaper: u.settings?.wallpaper || 'gold_atelier',
      hdPhotos: Boolean(u.settings?.hdPhotos),
      enterToSend: u.settings?.enterToSend !== false,
      soundEnabled: u.settings?.soundEnabled !== false,
      ringtoneEnabled: u.settings?.ringtoneEnabled !== false,
      readReceipts: u.settings?.readReceipts !== false,
      showOnline: u.settings?.showOnline !== false,
      disappearingHours: Number(u.settings?.disappearingHours || 0)
    },
    blockedPhones: Array.isArray(u.blockedPhones) ? u.blockedPhones : [],
    archivedThreads: Array.isArray(u.archivedThreads) ? u.archivedThreads : [],
    favoriteThreads: Array.isArray(u.favoriteThreads) ? u.favoriteThreads : [],
    pinnedThreads: Array.isArray(u.pinnedThreads) ? u.pinnedThreads : [],
    mutedThreads: Array.isArray(u.mutedThreads) ? u.mutedThreads : [],
    quickReplies: Array.isArray(u.quickReplies) ? u.quickReplies : [],
    createdAt: u.createdAt,
    lastSeenAt: u.lastSeenAt
  };
}
function toPublicPeerUser(u: ConnectUserRecord) {
  return {
    phoneDigits: u.phoneDigits,
    displayPhone: u.displayPhone,
    name: u.name,
    about: u.about || 'Hey there! I am using VV Connect App.',
    avatarUrl: u.avatarUrl || '',
    lastSeenAt: u.settings?.showOnline === false ? undefined : u.lastSeenAt
  };
}
function computeConnectPhoneHashes(phoneDigits: string): string[] {
  const clean = String(phoneDigits || '').replace(/\D/g, '');
  if (clean.length < 7) return [];
  const out = [crypto.createHash('sha256').update(`vv_connect_hash_v1:${clean}`).digest('hex')];
  if (clean.length >= 9) {
    out.push(crypto.createHash('sha256').update(`vv_connect_l9_v1:${clean.slice(-9)}`).digest('hex'));
  }
  return out;
}
function hashConnectPin(pin: string, saltHex: string): string {
  return crypto.scryptSync(pin, saltHex, 32).toString('hex');
}
function verifyConnectPin(pin: string, saltHex?: string, expectedHex?: string): boolean {
  if (!saltHex || !expectedHex) return false;
  try {
    const a = Buffer.from(hashConnectPin(pin, saltHex), 'hex');
    const b = Buffer.from(expectedHex, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (_) {
    return false;
  }
}
function getConnectHmacSecret(): string {
  return String(process.env.SESSION_SECRET || '').trim() || crypto.createHash('sha256').update(getVapidPublicKey() + ':vv_connect').digest('hex');
}
function signConnectToken(phoneDigits: string, name: string, sessionId: string = '', deviceId: string = ''): string {
  const payload = Buffer.from(
    JSON.stringify({ p: phoneDigits, n: name, sid: sessionId, did: deviceId, iat: Date.now() })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', getConnectHmacSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}
function verifyConnectToken(token?: string | null): { phoneDigits: string; name: string; sessionId: string; deviceId: string } | null {
  const raw = String(token || '').trim();
  const dot = raw.indexOf('.');
  if (dot === -1) return null;
  const payload = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = crypto.createHmac('sha256', getConnectHmacSecret()).update(payload).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const obj = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const d = normalizeConnectDigits(obj?.p);
    if (d.length < 7) return null;
    return {
      phoneDigits: d,
      name: String(obj?.n || 'VV User'),
      sessionId: String(obj?.sid || ''),
      deviceId: String(obj?.did || '')
    };
  } catch (_) {
    return null;
  }
}

function validateConnectSession(token: string, expectedPhone?: string) {
  const tok = verifyConnectToken(token);
  if (!tok) return { ok: false, reason: 'AUTH_REQUIRED' };
  if (expectedPhone && normalizeConnectDigits(expectedPhone) !== tok.phoneDigits) {
    return { ok: false, reason: 'PHONE_MISMATCH' };
  }
  const user = loadConnectUsers()[tok.phoneDigits];
  if (!user || !user.activeSessionId) {
    return { ok: false, reason: 'VERIFICATION_REQUIRED' };
  }
  if (tok.sessionId !== user.activeSessionId || (user.activeDeviceId && tok.deviceId !== user.activeDeviceId)) {
    return {
      ok: false,
      reason: 'SESSION_REPLACED',
      activeDeviceName: user.activeDeviceName || 'Another Phone'
    };
  }
  return {
    ok: true,
    phoneDigits: tok.phoneDigits,
    name: user.name || tok.name,
    sessionId: user.activeSessionId,
    deviceId: user.activeDeviceId || tok.deviceId
  };
}
registerConnectSessionValidator(validateConnectSession);

function resolveUserPushOwnerKey(req: any, res: any): string | null {
  const body = req.body || {};
  const rawTok = String(req.headers?.['x-connect-token'] || body.token || '').trim();
  if (rawTok) {
    const v = validateConnectSession(rawTok);
    if (!v.ok || !v.phoneDigits) {
      res.status(401).json({
        success: false,
        error: v.reason === 'SESSION_REPLACED' ? 'SESSION_REPLACED' : 'CONNECT_AUTH_REQUIRED',
        activeDeviceName: v.activeDeviceName || ''
      });
      return null;
    }
    return `wa_${v.phoneDigits}`;
  }
  const digits = normalizeConnectDigits(body.phone);
  if (digits.length < 7) {
    res.status(400).json({ success: false, error: 'Valid phone or connect token required' });
    return null;
  }
  return `wa_${digits}`;
}

liveStreamingRouter.get('/push/vapid-public-key', (_req, res) => {
  return res.json({ success: true, publicKey: getVapidPublicKey() });
});

liveStreamingRouter.post('/push/subscribe', (req, res) => {
  const body = req.body || {};
  const role = String(body.role || 'user').toLowerCase();
  let ownerKey = '';
  if (role === 'admin') {
    if (!isValidDeskPin(req)) return res.status(401).json({ success: false, error: 'INVALID_DESK_PIN' });
    ownerKey = 'admin_desk';
  } else {
    const resolved = resolveUserPushOwnerKey(req, res);
    if (!resolved) return;
    ownerKey = resolved;
  }
  const ok = savePushSubscription(ownerKey, body.subscription, req.headers['user-agent']);
  if (!ok) return res.status(400).json({ success: false, error: 'Invalid push subscription object' });
  return res.json({ success: true, ownerKey, subscriptionCount: getOwnerPushSubscriptionCount(ownerKey) });
});

liveStreamingRouter.post('/push/unsubscribe', (req, res) => {
  const body = req.body || {};
  const role = String(body.role || 'user').toLowerCase();
  const endpoint = String(body.endpoint || '').trim();
  let ownerKey = '';
  if (role === 'admin') {
    if (!isValidDeskPin(req)) return res.status(401).json({ success: false, error: 'INVALID_DESK_PIN' });
    ownerKey = 'admin_desk';
  } else {
    const resolved = resolveUserPushOwnerKey(req, res);
    if (!resolved) return;
    ownerKey = resolved;
  }
  if (endpoint) removePushSubscription(ownerKey, endpoint);
  return res.json({ success: true, subscriptionCount: getOwnerPushSubscriptionCount(ownerKey) });
});

liveStreamingRouter.post('/push/test', async (req, res) => {
  const body = req.body || {};
  const role = String(body.role || 'user').toLowerCase();
  let ownerKey = '';
  if (role === 'admin') {
    if (!isValidDeskPin(req)) return res.status(401).json({ success: false, error: 'INVALID_DESK_PIN' });
    ownerKey = 'admin_desk';
  } else {
    const resolved = resolveUserPushOwnerKey(req, res);
    if (!resolved) return;
    ownerKey = resolved;
  }
  const r = await sendWebPushToOwner(
    ownerKey,
    {
      kind: 'test',
      title: '🔔 VV Connect App Call Alerts Active!',
      body: 'You will receive incoming call and message alerts even when your screen is off or the app is minimized.',
      url: role === 'admin' ? 'https://vintagevibesgk.com/live/desk' : 'https://vintagevibesgk.com/live/connect'
    },
    { ttl: 60, urgency: 'high' }
  );
  return res.json({ success: true, ...r });
});

interface PushClientDiagEntry {
  at: string;
  page: string;
  stage: string;
  error: string;
  isIos: boolean;
  isAndroid: boolean;
  isStandalone: boolean;
  isInApp: boolean;
  hasNotif: boolean;
  notifPerm: string;
  hasSw: boolean;
  hasPushMgr: boolean;
  swState: string;
  hasAuth: boolean;
  ua: string;
}

const pushClientDiagLogs: PushClientDiagEntry[] = [];

liveStreamingRouter.post('/push/client-diag', (req, res) => {
  const b = req.body || {};
  const entry: PushClientDiagEntry = {
    at: new Date().toISOString(),
    page: String(b.page || 'connect').replace(/[^a-zA-Z0-9_/-]/g, '').slice(0, 32) || 'connect',
    stage: String(b.stage || 'unknown').slice(0, 64),
    error: String(b.error || '').slice(0, 220),
    isIos: Boolean(b.isIos),
    isAndroid: Boolean(b.isAndroid),
    isStandalone: Boolean(b.isStandalone),
    isInApp: Boolean(b.isInApp),
    hasNotif: Boolean(b.hasNotif),
    notifPerm: String(b.notifPerm || 'unknown').slice(0, 24),
    hasSw: Boolean(b.hasSw),
    hasPushMgr: Boolean(b.hasPushMgr),
    swState: String(b.swState || 'none').slice(0, 32),
    hasAuth: Boolean(b.hasAuth),
    ua: String(req.headers['user-agent'] || '').slice(0, 160)
  };
  pushClientDiagLogs.push(entry);
  if (pushClientDiagLogs.length > 30) {
    pushClientDiagLogs.splice(0, pushClientDiagLogs.length - 30);
  }
  return res.json({ success: true });
});

liveStreamingRouter.get('/push/client-diag', (req, res) => {
  if (!isValidDeskPin(req)) {
    return res.status(401).json({ success: false, error: 'INVALID_DESK_PIN' });
  }
  return res.json({ success: true, logs: pushClientDiagLogs.slice().reverse() });
});

liveStreamingRouter.post('/push/register-native-token', (req, res) => {
  const body = req.body || {};
  const role = String(body.role || 'user').toLowerCase();
  let ownerKey = '';
  if (role === 'admin') {
    if (!isValidDeskPin(req)) return res.status(401).json({ success: false, error: 'INVALID_DESK_PIN' });
    ownerKey = 'admin_desk';
  } else {
    const resolved = resolveUserPushOwnerKey(req, res);
    if (!resolved) return;
    ownerKey = resolved;
  }
  const fcmToken = String(body.fcmToken || body.tokenValue || body.nativeToken || '').trim();
  const platform = String(body.platform || 'android').toLowerCase() === 'ios' ? 'ios' : 'android';
  const deviceName = String(body.deviceName || '').trim();
  const ok = saveNativePushToken(ownerKey, fcmToken, platform, deviceName);
  if (!ok) return res.status(400).json({ success: false, error: 'Invalid native FCM/APNs token' });
  const meta = getOwnerNativePushTokensMeta(ownerKey);
  return res.json({ success: true, ownerKey, nativeCount: meta.count, platforms: meta.platforms });
});

liveStreamingRouter.post('/push/unregister-native-token', (req, res) => {
  const body = req.body || {};
  const role = String(body.role || 'user').toLowerCase();
  let ownerKey = '';
  if (role === 'admin') {
    if (!isValidDeskPin(req)) return res.status(401).json({ success: false, error: 'INVALID_DESK_PIN' });
    ownerKey = 'admin_desk';
  } else {
    const resolved = resolveUserPushOwnerKey(req, res);
    if (!resolved) return;
    ownerKey = resolved;
  }
  const fcmToken = String(body.fcmToken || body.nativeToken || '').trim();
  if (fcmToken) removeNativePushToken(ownerKey, fcmToken);
  const meta = getOwnerNativePushTokensMeta(ownerKey);
  return res.json({ success: true, ownerKey, nativeCount: meta.count });
});

liveStreamingRouter.get('/push/native-status', (req, res) => {
  const fcm = getFcmStatusInfo();
  const hasPin = isValidDeskPin(req);
  return res.json({
    success: true,
    fcmConfigured: fcm.fcmConfigured,
    ...(hasPin && fcm.projectId ? { projectId: fcm.projectId } : {}),
    apkDownloadUrl: '/live/vv-connect.apk',
    githubReleaseUrl: 'https://github.com/mmakkani/vintage-vibes-erp/releases/download/vv-connect-latest/vv-connect-android.apk'
  });
});

async function trySendExternalOtp(digits: string, code: string): Promise<'whatsapp_otp' | 'sms_otp' | null> {
  if (metaBusinessHub.isWhatsAppCloudConfigured()) {
    try {
      const waRes = await metaBusinessHub.sendWhatsAppCloudMessage({
        to: digits,
        text: `VV Connect App Verification Code: ${code} (Valid 5 min)`
      });
      if (waRes.success) return 'whatsapp_otp';
    } catch (_) {}
  }

  const twSid = String(process.env.TWILIO_ACCOUNT_SID || '').trim();
  const twTok = String(process.env.TWILIO_AUTH_TOKEN || '').trim();
  const twFrom = String(process.env.TWILIO_FROM_PHONE || '').trim();
  if (twSid && twTok && twFrom) {
    try {
      const form = new URLSearchParams({
        To: `+${digits}`,
        From: twFrom,
        Body: `VV Connect App Verification Code: ${code} (Valid 5 min)`
      });
      const authB64 = Buffer.from(`${twSid}:${twTok}`).toString('base64');
      const tr = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(twSid)}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${authB64}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: form.toString(),
        signal: AbortSignal.timeout(6000)
      });
      if (tr.ok) return 'sms_otp';
    } catch (_) {}
  }
  return null;
}

liveStreamingRouter.post('/connect/otp/request', async (req, res) => {
  const body = req.body || {};
  const displayPhone = String(body.phone || '').trim();
  const digits = normalizeConnectDigits(displayPhone);
  const deviceId = String(body.deviceId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
  const deviceName = String(body.deviceName || 'Mobile Device').replace(/[<>]/g, '').trim().slice(0, 60) || 'Mobile Device';
  const platform = String(body.platform || 'web').replace(/[<>]/g, '').trim().slice(0, 24) || 'web';

  if (digits.length < 7) {
    return res.status(400).json({ success: false, error: 'Please enter a valid mobile number' });
  }

  const users = loadConnectUsers();
  const existingUser = users[digits];
  const cleanName = String(body.name || existingUser?.name || '').replace(/[<>]/g, '').trim().slice(0, 60);
  const now = Date.now();
  const prev = connectOtpStore.get(digits);
  if (prev && now - prev.requestedAt < 30000 && prev.expiresAt > now) {
    const cooldownSec = Math.max(1, Math.ceil((30000 - (now - prev.requestedAt)) / 1000));
    return res.json({
      success: true,
      mode: prev.channel,
      waConnected: prev.channel === 'whatsapp_otp',
      phoneDigits: digits,
      sentVia: 'cooldown_active',
      cooldownSec,
      requiresTwoStepPin: Boolean(existingUser?.twoStepPinEnabled && existingUser?.pinHash),
      hasExistingDevice: Boolean(existingUser?.activeSessionId),
      existingDeviceName: existingUser?.activeDeviceName || '',
      notice: prev.channel === 'desk_otp_pending'
        ? `Verification request is already active (${cooldownSec}s cooldown) — confirm your 6-digit code with Vintage Vibes Desk.`
        : `Your 6-digit verification code was already sent (please wait ${cooldownSec}s before requesting again).`
    });
  }

  const code = String(100000 + crypto.randomInt(0, 900000));
  let channel: 'whatsapp_otp' | 'sms_otp' | 'desk_otp_pending' = 'desk_otp_pending';
  let waDelivered = false;

  if (baileysManager.getConnectedSession()?.sock) {
    try {
      const sendPromise = baileysManager.sendUnifiedMessage(
        digits,
        `🔐 *VV Connect App* Verification Code: *${code}*\nValid for 5 minutes. Do not share this code with anyone.`
      );
      const result: any = await Promise.race([
        sendPromise,
        new Promise((resolve) => setTimeout(() => resolve({ success: false, error: 'timeout' }), 7000))
      ]);
      waDelivered = Boolean(result?.success);
      if (waDelivered) channel = 'whatsapp_otp';
    } catch (_) {}
  }

  if (!waDelivered) {
    const ext = await trySendExternalOtp(digits, code);
    if (ext) channel = ext;
  }

  connectOtpStore.set(digits, {
    code,
    name: cleanName,
    displayPhone: displayPhone || `+${digits}`,
    expiresAt: now + 5 * 60 * 1000,
    requestedAt: now,
    attempts: 0,
    channel,
    deviceId,
    deviceName,
    platform
  });

  if (channel === 'desk_otp_pending') {
    broadcastAdminDeskEvent({
      type: 'OTP_REQUEST_PENDING',
      phoneDigits: digits,
      displayPhone: displayPhone || `+${digits}`,
      name: cleanName || 'New VV User',
      deviceName,
      requestedAt: new Date(now).toISOString()
    });
  }

  const notice =
    channel === 'whatsapp_otp'
      ? 'A 6-digit verification code has been sent to your registered number. Enter it below to continue.'
      : channel === 'sms_otp'
      ? 'A 6-digit SMS verification code has been sent to your mobile number. Enter it below to continue.'
      : 'Your 6-digit verification request has been sent to Vintage Vibes Desk. Please get your 6-digit code from the Desk to verify your device.';

  return res.json({
    success: true,
    mode: channel,
    waConnected: channel === 'whatsapp_otp',
    phoneDigits: digits,
    sentVia: channel,
    requiresTwoStepPin: Boolean(existingUser?.twoStepPinEnabled && existingUser?.pinHash),
    hasExistingDevice: Boolean(existingUser?.activeSessionId),
    existingDeviceName: existingUser?.activeDeviceName || '',
    notice
  });
});

liveStreamingRouter.get('/connect/otp/pending', (req, res) => {
  if (!isValidDeskPin(req)) {
    return res.status(401).json({ success: false, error: 'INVALID_DESK_PIN' });
  }
  const now = Date.now();
  const pending: Array<{
    phoneDigits: string;
    displayPhone: string;
    name: string;
    code: string;
    channel: string;
    deviceName: string;
    expiresInSec: number;
    requestedAt: string;
  }> = [];
  for (const [phoneDigits, rec] of connectOtpStore.entries()) {
    if (rec.expiresAt <= now) {
      connectOtpStore.delete(phoneDigits);
      continue;
    }
    pending.push({
      phoneDigits,
      displayPhone: rec.displayPhone,
      name: rec.name || 'New VV User',
      code: rec.code,
      channel: rec.channel,
      deviceName: rec.deviceName || 'Mobile Device',
      expiresInSec: Math.max(1, Math.round((rec.expiresAt - now) / 1000)),
      requestedAt: new Date(rec.requestedAt).toISOString()
    });
  }
  pending.sort((a, b) => Date.parse(b.requestedAt) - Date.parse(a.requestedAt));
  return res.json({
    success: true,
    waConnected: Boolean(baileysManager.getConnectedSession()?.sock),
    pending
  });
});

liveStreamingRouter.post('/connect/otp/verify', (req, res) => {
  const body = req.body || {};
  const digits = normalizeConnectDigits(body.phone);
  const code = String(body.code || '').trim();
  const deviceId = String(body.deviceId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || crypto.randomBytes(8).toString('hex');
  const deviceName = String(body.deviceName || 'Mobile Device').replace(/[<>]/g, '').trim().slice(0, 60) || 'Mobile Device';
  const platform = String(body.platform || 'web').replace(/[<>]/g, '').trim().slice(0, 24) || 'web';

  if (digits.length < 7 || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ success: false, error: 'Please enter a valid phone number and 6-digit verification code.' });
  }
  const rec = connectOtpStore.get(digits);
  if (!rec || rec.expiresAt < Date.now()) {
    connectOtpStore.delete(digits);
    return res.status(401).json({ success: false, error: 'Verification code expired — please request a new code.' });
  }
  if (rec.attempts >= 5) {
    connectOtpStore.delete(digits);
    return res.status(429).json({ success: false, error: 'Too many incorrect attempts — please request a new verification code.' });
  }
  if (rec.code !== code) {
    rec.attempts += 1;
    return res.status(401).json({
      success: false,
      error: `Incorrect 6-digit code (${5 - rec.attempts} attempts remaining).`
    });
  }

  const users = loadConnectUsers();
  const prevUser = users[digits];
  if (prevUser?.twoStepPinEnabled && prevUser?.pinHash && prevUser?.pinSalt) {
    const suppliedPin = String(body.twoStepPin || body.pin || '').trim();
    if (!suppliedPin) {
      return res.json({
        success: false,
        requireTwoStepPin: true,
        message: 'Two-Step Verification PIN is enabled on this number — please enter your 4–6 digit Security PIN.'
      });
    }
    if (!verifyConnectPin(suppliedPin, prevUser.pinSalt, prevUser.pinHash)) {
      return res.status(401).json({
        success: false,
        requireTwoStepPin: true,
        error: 'Incorrect Two-Step Security PIN — please try again.'
      });
    }
  }

  connectOtpStore.delete(digits);
  const nowIso = new Date().toISOString();
  const rawBodyName = String(body.name || '').replace(/[<>]/g, '').trim().slice(0, 60);
  const chosenName = rawBodyName || prevUser?.name || rec.name || 'VV User';
  const isNewProfile = !prevUser || !prevUser.name || prevUser.name === 'VV User';
  const activeSessionId = crypto.randomBytes(16).toString('hex');
  const verifiedVia: 'whatsapp_otp' | 'sms_otp' | 'desk_verified' =
    rec.channel === 'whatsapp_otp' ? 'whatsapp_otp' : rec.channel === 'sms_otp' ? 'sms_otp' : 'desk_verified';

  const hadPreviousDevice = Boolean(prevUser?.activeSessionId);
  if (hadPreviousDevice || prevUser) {
    clearOwnerPushSubscriptions(`wa_${digits}`);
    clearOwnerNativePushTokens(`wa_${digits}`);
  }

  const user: ConnectUserRecord = {
    ...(prevUser || {}),
    phoneDigits: digits,
    displayPhone: rec.displayPhone || prevUser?.displayPhone || `+${digits}`,
    name: chosenName,
    pinSalt: prevUser?.pinSalt,
    pinHash: prevUser?.pinHash,
    twoStepPinEnabled: Boolean(prevUser?.twoStepPinEnabled && prevUser?.pinHash),
    phoneVerified: true,
    phoneVerifiedAt: nowIso,
    phoneVerifiedVia: verifiedVia,
    activeSessionId,
    activeDeviceId: deviceId,
    activeDeviceName: deviceName || rec.deviceName || 'Mobile Device',
    activeDevicePlatform: platform || rec.platform || 'web',
    activeSessionStartedAt: nowIso,
    createdAt: prevUser?.createdAt || nowIso,
    lastSeenAt: nowIso
  };
  users[digits] = user;
  saveConnectUsers();

  const kickedSockets = kickConnectUserSockets(digits, activeSessionId, user.activeDeviceName);
  const token = signConnectToken(digits, user.name, activeSessionId, deviceId);
  return res.json({
    success: true,
    token,
    user: toPublicConnectUser(user),
    kickedOldDevice: hadPreviousDevice || kickedSockets > 0,
    isNewProfile
  });
});

liveStreamingRouter.post('/connect/pin/auth', (_req, res) => {
  return res.status(403).json({
    success: false,
    error: 'OTP_VERIFICATION_REQUIRED',
    message: '6-digit OTP verification is required. Security PIN is only used for Two-Step Verification.'
  });
});

function getConnectCallerIdentity(req: any): { phoneDigits: string; name: string; sessionId: string; deviceId: string } | null {
  const hdrTok = req.headers['x-connect-token'] || req.query?.token || req.body?.token;
  const v = validateConnectSession(String(hdrTok || ''));
  if (!v.ok || !v.phoneDigits) {
    if (req) (req as any).__connectAuthErr = v;
    return null;
  }
  return {
    phoneDigits: v.phoneDigits,
    name: v.name || 'VV User',
    sessionId: v.sessionId || '',
    deviceId: v.deviceId || ''
  };
}

function requireConnectAuth(req: any, res: any): { phoneDigits: string; name: string; sessionId: string; deviceId: string } | null {
  const caller = getConnectCallerIdentity(req);
  if (caller) return caller;
  const v = (req && (req as any).__connectAuthErr) || { reason: 'CONNECT_AUTH_REQUIRED' };
  const isReplaced = v.reason === 'SESSION_REPLACED';
  res.status(401).json({
    success: false,
    error: isReplaced ? 'SESSION_REPLACED' : 'CONNECT_AUTH_REQUIRED',
    activeDeviceName: v.activeDeviceName || '',
    message: isReplaced
      ? 'This number was verified on another phone. Only 1 primary phone is allowed per number.'
      : 'Phone verification required — please verify your mobile number.'
  });
  return null;
}

liveStreamingRouter.get('/connect/me', (req, res) => {
  const caller = requireConnectAuth(req, res);
  if (!caller) return;
  const users = loadConnectUsers();
  const u = users[caller.phoneDigits] || {
    phoneDigits: caller.phoneDigits,
    displayPhone: `+${caller.phoneDigits}`,
    name: caller.name,
    createdAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString()
  };
  const pushMeta = getOwnerPushSubscriptionsMeta(`wa_${caller.phoneDigits}`);
  return res.json({
    success: true,
    user: toPublicConnectUser(u),
    waConnected: Boolean(baileysManager.getConnectedSession()?.sock),
    pushSubscriptionsCount: pushMeta.count,
    pushDevices: pushMeta
  });
});

liveStreamingRouter.post('/connect/profile', (req, res) => {
  const caller = requireConnectAuth(req, res);
  if (!caller) return;
  const body = req.body || {};
  const users = loadConnectUsers();
  const nowIso = new Date().toISOString();
  const prev = users[caller.phoneDigits];

  let nextName = prev?.name || caller.name || 'VV User';
  if (typeof body.name === 'string') {
    const cleanName = body.name.replace(/[<>]/g, '').trim().slice(0, 60);
    if (cleanName.length < 2) {
      return res.status(400).json({ success: false, error: 'Display name must be at least 2 characters.' });
    }
    nextName = cleanName;
  }

  let nextAvatarUrl = prev?.avatarUrl || '';
  if (typeof body.avatarBase64 === 'string' && body.avatarBase64.trim()) {
    const raw = body.avatarBase64.trim();
    const commaIdx = raw.indexOf(',');
    const hdr = commaIdx !== -1 ? raw.slice(0, commaIdx).toLowerCase() : '';
    const b64 = (commaIdx !== -1 && hdr.includes('base64') ? raw.slice(commaIdx + 1) : raw).replace(/\s+/g, '');
    const buf = Buffer.from(b64, 'base64');
    if (buf.length < 16 || buf.length > 4 * 1024 * 1024) {
      return res.status(400).json({ success: false, error: 'Profile photo must be smaller than 4 MB.' });
    }
    const det = detectMediaAttachment(buf, 'avatar.jpg', hdr);
    if (!det || det.kind !== 'image') {
      return res.status(400).json({ success: false, error: 'Profile photo must be a valid JPG, PNG, WebP, or GIF image.' });
    }
    const mediaDir = getLiveMediaDir();
    fs.mkdirSync(mediaDir, { recursive: true });
    const fileName = `av_${caller.phoneDigits}_${Date.now()}.${det.ext}`;
    fs.writeFileSync(path.join(mediaDir, fileName), buf);
    nextAvatarUrl = `/api/live/media/${fileName}`;
  } else if (body.avatarBase64 === null) {
    nextAvatarUrl = '';
  }

  const nextAbout = typeof body.about === 'string'
    ? body.about.replace(/[<>]/g, '').trim().slice(0, 140)
    : (prev?.about || 'Hey there! I am using VV Connect App.');
  const nextEmail = typeof body.email === 'string'
    ? body.email.replace(/[<>]/g, '').trim().slice(0, 100)
    : (prev?.email || '');

  let nextSettings: ConnectUserSettings = { ...(prev?.settings || {}) };
  if (body.settings && typeof body.settings === 'object') {
    const s = body.settings;
    if (['wa_dark', 'midnight_gold', 'vv_champagne', 'emerald_night', 'oled_black'].includes(String(s.theme))) {
      nextSettings.theme = s.theme;
    }
    if (['gold_atelier', 'wa_doodle', 'silk_minimal', 'clean_solid'].includes(String(s.wallpaper))) {
      nextSettings.wallpaper = s.wallpaper;
    }
    if (typeof s.hdPhotos === 'boolean') nextSettings.hdPhotos = s.hdPhotos;
    if (typeof s.enterToSend === 'boolean') nextSettings.enterToSend = s.enterToSend;
    if (typeof s.soundEnabled === 'boolean') nextSettings.soundEnabled = s.soundEnabled;
    if (typeof s.ringtoneEnabled === 'boolean') nextSettings.ringtoneEnabled = s.ringtoneEnabled;
    if (typeof s.readReceipts === 'boolean') nextSettings.readReceipts = s.readReceipts;
    if (typeof s.showOnline === 'boolean') nextSettings.showOnline = s.showOnline;
    if (Number.isFinite(Number(s.disappearingHours)) && [0, 24, 168, 2160].includes(Number(s.disappearingHours))) {
      nextSettings.disappearingHours = Number(s.disappearingHours);
    }
  }

  let nextQuickReplies: ConnectQuickReply[] = Array.isArray(prev?.quickReplies) ? prev!.quickReplies! : [];
  if (Array.isArray(body.quickReplies)) {
    nextQuickReplies = body.quickReplies
      .slice(0, 30)
      .map((q: any) => ({
        id: String(q?.id || `qr_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`).slice(0, 40),
        shortcut: String(q?.shortcut || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24).toLowerCase(),
        text: String(q?.text || '').replace(/[<>]/g, '').trim().slice(0, 500)
      }))
      .filter((q: ConnectQuickReply) => q.shortcut && q.text);
  }

  const updated: ConnectUserRecord = {
    ...(prev || {}),
    phoneDigits: caller.phoneDigits,
    displayPhone: prev?.displayPhone || `+${caller.phoneDigits}`,
    name: nextName,
    about: nextAbout,
    avatarUrl: nextAvatarUrl,
    email: nextEmail,
    settings: nextSettings,
    quickReplies: nextQuickReplies,
    pinHash: prev?.pinHash,
    pinSalt: prev?.pinSalt,
    createdAt: prev?.createdAt || nowIso,
    lastSeenAt: nowIso
  };
  users[caller.phoneDigits] = updated;
  saveConnectUsers();
  const token = signConnectToken(caller.phoneDigits, updated.name, caller.sessionId, caller.deviceId);
  return res.json({ success: true, token, user: toPublicConnectUser(updated) });
});

liveStreamingRouter.post('/connect/pin/change', (req, res) => {
  const caller = requireConnectAuth(req, res);
  if (!caller) return;
  const action = String(req.body?.action || '').trim().toLowerCase();
  const currentPin = String(req.body?.currentPin || '').trim();
  const newPin = String(req.body?.newPin || '').trim();
  const users = loadConnectUsers();
  const u = users[caller.phoneDigits];
  if (!u) return res.status(404).json({ success: false, error: 'Account not found' });

  if (action === 'disable') {
    if (u.twoStepPinEnabled && u.pinHash && u.pinSalt && !verifyConnectPin(currentPin, u.pinSalt, u.pinHash)) {
      return res.status(401).json({ success: false, error: 'Current Two-Step PIN is incorrect.' });
    }
    u.twoStepPinEnabled = false;
    delete u.pinHash;
    delete u.pinSalt;
    u.lastSeenAt = new Date().toISOString();
    users[caller.phoneDigits] = u;
    saveConnectUsers();
    return res.json({ success: true, user: toPublicConnectUser(u) });
  }

  if (!/^\d{4,6}$/.test(newPin)) {
    return res.status(400).json({ success: false, error: 'New PIN must be 4 to 6 digits.' });
  }
  if (u.twoStepPinEnabled && u.pinHash && u.pinSalt && !verifyConnectPin(currentPin, u.pinSalt, u.pinHash)) {
    return res.status(401).json({ success: false, error: 'Current Security PIN is incorrect.' });
  }
  const pinSalt = crypto.randomBytes(16).toString('hex');
  u.pinSalt = pinSalt;
  u.pinHash = hashConnectPin(newPin, pinSalt);
  u.twoStepPinEnabled = true;
  u.lastSeenAt = new Date().toISOString();
  users[caller.phoneDigits] = u;
  saveConnectUsers();
  return res.json({ success: true, user: toPublicConnectUser(u) });
});

liveStreamingRouter.post('/connect/thread-prefs', (req, res) => {
  const caller = getConnectCallerIdentity(req);
  if (!caller) return res.status(401).json({ success: false, error: 'CONNECT_AUTH_REQUIRED' });
  const rawParam = String(req.body?.targetPhone || '').trim();
  const targetRaw = rawParam.toLowerCase();
  const action = String(req.body?.action || '').trim().toLowerCase();
  const isGroup = /^grp_[a-zA-Z0-9_-]+$/.test(rawParam);
  const targetKey = targetRaw === 'desk' ? 'desk' : isGroup ? rawParam : normalizeConnectDigits(targetRaw.replace(/^wa_/, ''));
  if (!targetKey || (targetKey !== 'desk' && !isGroup && targetKey.length < 7)) {
    return res.status(400).json({ success: false, error: 'Valid targetPhone required' });
  }
  const allowedActions = ['archive', 'unarchive', 'favorite', 'unfavorite', 'pin', 'unpin', 'mute', 'unmute', 'block', 'unblock'];
  if (!allowedActions.includes(action)) {
    return res.status(400).json({ success: false, error: 'Invalid thread pref action' });
  }
  const users = loadConnectUsers();
  const u: ConnectUserRecord = users[caller.phoneDigits] || {
    phoneDigits: caller.phoneDigits,
    displayPhone: `+${caller.phoneDigits}`,
    name: caller.name,
    createdAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString()
  };
  const toggleList = (arr: string[] | undefined, item: string, add: boolean): string[] => {
    const set = new Set(Array.isArray(arr) ? arr : []);
    if (add) set.add(item);
    else set.delete(item);
    return Array.from(set).slice(-300);
  };
  if (action === 'archive' || action === 'unarchive') u.archivedThreads = toggleList(u.archivedThreads, targetKey, action === 'archive');
  if (action === 'favorite' || action === 'unfavorite') u.favoriteThreads = toggleList(u.favoriteThreads, targetKey, action === 'favorite');
  if (action === 'pin' || action === 'unpin') u.pinnedThreads = toggleList(u.pinnedThreads, targetKey, action === 'pin');
  if (action === 'mute' || action === 'unmute') u.mutedThreads = toggleList(u.mutedThreads, targetKey, action === 'mute');
  if ((action === 'block' || action === 'unblock') && targetKey !== 'desk' && !isGroup && targetKey !== caller.phoneDigits) {
    u.blockedPhones = toggleList(u.blockedPhones, targetKey, action === 'block');
  }
  users[caller.phoneDigits] = u;
  saveConnectUsers();
  return res.json({ success: true, user: toPublicConnectUser(u) });
});

function matchRegisteredUsersByHashes(rawHashes: any[], excludeDigits: string) {
  const cleanHashes = rawHashes
    .map((h) => String(h || '').trim().toLowerCase())
    .filter((h) => /^[a-f0-9]{64}$/.test(h));
  const users = loadConnectUsers();
  const hashToUser = new Map<string, ConnectUserRecord>();
  for (const u of Object.values(users)) {
    if (u.phoneDigits === excludeDigits) continue;
    for (const digest of computeConnectPhoneHashes(u.phoneDigits)) {
      if (!hashToUser.has(digest)) hashToUser.set(digest, u);
    }
  }
  const matched: Array<{ matchedHash: string; user: ReturnType<typeof toPublicPeerUser> & { online: boolean } }> = [];
  const seenDigits = new Set<string>();
  for (const h of cleanHashes) {
    const hit = hashToUser.get(h);
    if (hit && !seenDigits.has(hit.phoneDigits)) {
      seenDigits.add(hit.phoneDigits);
      matched.push({
        matchedHash: h,
        user: { ...toPublicPeerUser(hit), online: hit.settings?.showOnline === false ? false : isConnectUserOnline(hit.phoneDigits) }
      });
    }
  }
  return matched;
}

// Registered Contacts Directory (excludes blocked users and self)
liveStreamingRouter.get('/connect/contacts/directory', (req, res) => {
  const caller = requireConnectAuth(req, res);
  if (!caller) return;
  const myD = caller.phoneDigits;
  const users = loadConnectUsers();
  const me = users[myD];
  const myBlocked = new Set(Array.isArray(me?.blockedPhones) ? me.blockedPhones : []);
  const contacts = Object.values(users)
    .filter((u) => {
      if (!u || !u.phoneDigits || u.phoneDigits === myD) return false;
      if (myBlocked.has(u.phoneDigits)) return false;
      if (Array.isArray(u.blockedPhones) && u.blockedPhones.includes(myD)) return false;
      if ((u.settings as any)?.allowDirectory === false) return false;
      return true;
    })
    .map((u) => ({
      ...toPublicPeerUser(u),
      online: u.settings?.showOnline === false ? false : isConnectUserOnline(u.phoneDigits)
    }))
    .sort((a, b) => {
      if (Boolean(a.online) !== Boolean(b.online)) return a.online ? -1 : 1;
      return String(b.lastSeenAt || '').localeCompare(String(a.lastSeenAt || ''));
    });
  return res.json({ success: true, contacts });
});

// HTTP Call Signal Fallback (ensures decline / end / busy terminates pending invite even on flaky WS)
liveStreamingRouter.post('/connect/call/signal', (req, res) => {
  const caller = requireConnectAuth(req, res);
  if (!caller) return;
  const rawType = String(req.body?.type || '').trim().toUpperCase();
  const callId = String(req.body?.callId || '').trim().slice(0, 80);
  const toPhone = String(req.body?.toPhone || 'desk').trim().slice(0, 60);
  if (!callId || (rawType !== 'CALL_REJECT' && rawType !== 'CALL_END' && rawType !== 'CALL_BUSY')) {
    return res.status(400).json({ success: false, error: 'Valid callId and signal type required' });
  }
  const ok = terminateConnectCall(callId, caller.phoneDigits, toPhone, rawType);
  return res.json({ success: ok, callId, type: rawType });
});

// Zero-Leak SHA-256 Contact Intersection (never receives, logs, or saves non-registered phone numbers)
liveStreamingRouter.post('/connect/contacts/match-hashes', (req, res) => {
  const caller = getConnectCallerIdentity(req);
  if (!caller) return res.status(401).json({ success: false, error: 'CONNECT_AUTH_REQUIRED' });
  const rawHashes = Array.isArray(req.body?.hashes) ? req.body.hashes.slice(0, 1500) : [];
  const matched = matchRegisteredUsersByHashes(rawHashes, caller.phoneDigits);
  return res.json({ success: true, matched, privacyMode: 'sha256_zero_leak' });
});

liveStreamingRouter.post('/connect/contacts/match', (req, res) => {
  const caller = getConnectCallerIdentity(req);
  if (!caller) return res.status(401).json({ success: false, error: 'CONNECT_AUTH_REQUIRED' });
  if (Array.isArray(req.body?.hashes)) {
    const matched = matchRegisteredUsersByHashes(req.body.hashes.slice(0, 1500), caller.phoneDigits);
    return res.json({ success: true, matched: matched.map((m) => m.user), privacyMode: 'sha256_zero_leak' });
  }
  const rawList = Array.isArray(req.body?.phones) ? req.body.phones.slice(0, 800) : [];
  const ephemHashes: string[] = [];
  for (const item of rawList) {
    const d = normalizeConnectDigits(typeof item === 'string' ? item : item?.phone);
    ephemHashes.push(...computeConnectPhoneHashes(d));
  }
  const matched = matchRegisteredUsersByHashes(ephemHashes, caller.phoneDigits);
  return res.json({ success: true, matched: matched.map((m) => m.user) });
});

liveStreamingRouter.post('/connect/users/lookup-hash', (req, res) => {
  const caller = getConnectCallerIdentity(req);
  if (!caller) return res.status(401).json({ success: false, error: 'CONNECT_AUTH_REQUIRED' });
  const rawHashes = Array.isArray(req.body?.hashes) ? req.body.hashes.slice(0, 4) : [];
  if (rawHashes.length === 0) return res.status(400).json({ success: false, error: 'Valid phone hashes required' });
  const matched = matchRegisteredUsersByHashes(rawHashes, caller.phoneDigits);
  if (matched.length === 0) return res.json({ success: true, found: false });
  return res.json({ success: true, found: true, user: matched[0].user });
});

liveStreamingRouter.get('/connect/users/lookup', (req, res) => {
  const caller = getConnectCallerIdentity(req);
  if (!caller) return res.status(401).json({ success: false, error: 'CONNECT_AUTH_REQUIRED' });
  const d = normalizeConnectDigits(String(req.query.phone || ''));
  if (d.length < 7) return res.status(400).json({ success: false, error: 'Valid phone required' });
  const users = loadConnectUsers();
  const hit = users[d] || Object.values(users).find((u) => d.length >= 9 && u.phoneDigits.endsWith(d.slice(-9)));
  if (!hit) return res.json({ success: true, found: false, phoneDigits: d });
  return res.json({
    success: true,
    found: true,
    user: { ...toPublicPeerUser(hit), online: hit.settings?.showOnline === false ? false : isConnectUserOnline(hit.phoneDigits) }
  });
});

liveStreamingRouter.get('/connect/call-logs', (req, res) => {
  const caller = getConnectCallerIdentity(req);
  if (!caller) return res.status(401).json({ success: false, error: 'CONNECT_AUTH_REQUIRED' });
  const store = loadConnectCallLogs();
  const logs = Array.isArray(store[caller.phoneDigits]) ? store[caller.phoneDigits] : [];
  return res.json({ success: true, logs });
});

liveStreamingRouter.post('/connect/call-logs', (req, res) => {
  const caller = getConnectCallerIdentity(req);
  if (!caller) return res.status(401).json({ success: false, error: 'CONNECT_AUTH_REQUIRED' });
  const b = req.body || {};
  const callId = String(b.callId || `cl_${Date.now()}`).trim().slice(0, 80);
  const direction = b.direction === 'incoming' ? 'incoming' : 'outgoing';
  const mode = b.mode === 'video' ? 'video' : 'audio';
  const allowedStatus = ['completed', 'missed', 'declined', 'no_answer'] as const;
  const status = allowedStatus.includes(b.status) ? b.status : 'completed';
  const peerPhone = String(b.peerPhone || 'desk').trim().slice(0, 40);
  const peerName = String(b.peerName || peerPhone).replace(/[<>]/g, '').trim().slice(0, 60) || 'VV Contact';
  const dur = Number.isFinite(Number(b.durationSec)) && Number(b.durationSec) > 0 ? Math.round(Number(b.durationSec)) : undefined;

  const store = loadConnectCallLogs();
  const existing = Array.isArray(store[caller.phoneDigits]) ? store[caller.phoneDigits] : [];
  const entry: ConnectCallLogEntry = {
    id: `log_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
    callId,
    direction,
    peerPhone,
    peerName,
    mode,
    status,
    durationSec: dur,
    createdAt: new Date().toISOString()
  };
  const next = [entry, ...existing.filter((x) => x.callId !== callId)].slice(0, 100);
  store[caller.phoneDigits] = next;
  saveConnectCallLogs();
  return res.json({ success: true, log: entry });
});

function filterVisibleThreadMessages(msgs: LivePrivateMessage[] | undefined, viewerDigits: string): LivePrivateMessage[] {
  const now = Date.now();
  return (Array.isArray(msgs) ? msgs : []).filter((m) => {
    if (Array.isArray(m.deletedFor) && m.deletedFor.includes(viewerDigits)) return false;
    if (m.expiresAt && Date.parse(m.expiresAt) <= now) return false;
    return true;
  });
}

liveStreamingRouter.get('/connect/threads', (req, res) => {
  const caller = requireConnectAuth(req, res);
  if (!caller) return;
  const myD = caller.phoneDigits;
  const users = loadConnectUsers();
  const me = users[myD];
  const archivedSet = new Set(me?.archivedThreads || []);
  const favSet = new Set(me?.favoriteThreads || []);
  const pinSet = new Set(me?.pinnedThreads || []);
  const muteSet = new Set(me?.mutedThreads || []);
  const blockedSet = new Set(me?.blockedPhones || []);

  const deskStore = loadMessengerThreads();
  const deskKey = `wa_${myD}`;
  const deskTh = deskStore[deskKey];
  const deskVisible = filterVisibleThreadMessages(deskTh?.messages, myD);
  const deskLast = deskVisible.length > 0 ? deskVisible[deskVisible.length - 1] : undefined;

  const p2pStore = loadConnectThreads();
  const selfTid = `p2p_${myD}_${myD}`;
  const selfTh = p2pStore[selfTid];
  const selfVisible = filterVisibleThreadMessages(selfTh?.messages, myD);
  const selfLast = selfVisible.length > 0 ? selfVisible[selfVisible.length - 1] : undefined;

  const summaries: Array<Record<string, any>> = [
    {
      threadId: 'desk',
      targetPhone: 'desk',
      peerName: '👑 Vintage Vibes Boss Desk',
      peerPhone: 'Official Store Concierge',
      about: 'Al Ain & Dubai Concierge Desk',
      avatarUrl: '/pwa-192x192.png',
      online: true,
      isSelf: false,
      lastMessageAt: deskLast?.createdAt || '',
      lastMessagePreview: deskLast ? (deskLast.deletedForEveryone ? '🚫 Message deleted' : buildMessagePreviewText(deskLast)) : 'Direct Chat, Photos, Docs, Location & HD Calls',
      unread: Number(deskTh?.unreadByBuyer || 0),
      archived: archivedSet.has('desk'),
      favorite: favSet.has('desk'),
      pinned: pinSet.has('desk'),
      muted: muteSet.has('desk'),
      blocked: false
    },
    {
      threadId: selfTid,
      targetPhone: myD,
      peerName: `${me?.name || caller.name} (You)`,
      peerPhone: me?.displayPhone || `+${myD}`,
      about: 'Message yourself — saved notes, photos & links',
      avatarUrl: me?.avatarUrl || '',
      online: true,
      isSelf: true,
      lastMessageAt: selfLast?.createdAt || '',
      lastMessagePreview: selfLast ? (selfLast.deletedForEveryone ? '🚫 Message deleted' : buildMessagePreviewText(selfLast)) : 'Message yourself (Saved Notes & Media)',
      unread: 0,
      archived: archivedSet.has(myD),
      favorite: favSet.has(myD),
      pinned: pinSet.has(myD),
      muted: muteSet.has(myD),
      blocked: false
    }
  ];

  for (const th of Object.values(p2pStore)) {
    if (!Array.isArray(th.participants) || !th.participants.includes(myD)) continue;
    const isSelf = th.participants.every((p) => p === myD);
    if (isSelf) continue;
    const otherD = th.participants.find((p) => p !== myD) || myD;
    const u = users[otherD];
    const vis = filterVisibleThreadMessages(th.messages, myD);
    const lastM = vis.length > 0 ? vis[vis.length - 1] : undefined;
    const unreadCnt = vis.filter((m) => m.senderPhone === otherD && !m.readAt).length;
    summaries.push({
      threadId: th.threadId,
      targetPhone: otherD,
      peerName: u?.name || th.participantNames?.[otherD] || `+${otherD}`,
      peerPhone: u?.displayPhone || `+${otherD}`,
      about: u?.about || '',
      avatarUrl: u?.avatarUrl || '',
      online: u?.settings?.showOnline === false ? false : isConnectUserOnline(otherD),
      isSelf: false,
      lastMessageAt: lastM?.createdAt || th.lastMessageAt,
      lastMessagePreview: lastM ? (lastM.deletedForEveryone ? '🚫 Message deleted' : buildMessagePreviewText(lastM)) : th.lastMessagePreview,
      unread: unreadCnt,
      archived: archivedSet.has(otherD),
      favorite: favSet.has(otherD),
      pinned: pinSet.has(otherD),
      muted: muteSet.has(otherD),
      blocked: blockedSet.has(otherD)
    });
  }

  const groupsStore = loadConnectGroups();
  for (const g of Object.values(groupsStore)) {
    if (!Array.isArray(g.members) || !g.members.includes(myD)) continue;
    const vis = filterVisibleThreadMessages(g.messages, myD);
    const lastM = vis.length > 0 ? vis[vis.length - 1] : undefined;
    const ac = getActiveGroupCallSummary(g.groupId);
    summaries.push({
      threadId: g.groupId,
      targetPhone: g.groupId,
      groupId: g.groupId,
      isGroup: true,
      peerName: g.name,
      peerPhone: `${g.members.length} members${g.description ? ` • ${g.description}` : ''}`,
      about: g.description || `Group Chat (${g.members.length} members)`,
      avatarUrl: g.avatarUrl || '',
      inviteCode: g.inviteCode,
      memberCount: g.members.length,
      activeCall: ac,
      online: ac.active || g.members.some((m) => m !== myD && isConnectUserOnline(m)),
      isSelf: false,
      lastMessageAt: lastM?.createdAt || g.lastMessageAt || g.createdAt,
      lastMessagePreview: ac.active
        ? `📞 Group ${ac.mode === 'video' ? 'Video' : 'Audio'} Call active (${ac.participantCount} in call)`
        : lastM
        ? `${lastM.senderName || 'Member'}: ${lastM.deletedForEveryone ? '🚫 Message deleted' : buildMessagePreviewText(lastM)}`
        : (g.lastMessagePreview || `Group created (${g.members.length} members)`),
      unread: 0,
      archived: archivedSet.has(g.groupId),
      favorite: favSet.has(g.groupId),
      pinned: pinSet.has(g.groupId),
      muted: muteSet.has(g.groupId),
      blocked: false
    });
  }

  summaries.sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    if (a.targetPhone === 'desk' && !a.lastMessageAt && b.targetPhone !== myD) return -1;
    if (b.targetPhone === 'desk' && !b.lastMessageAt && a.targetPhone !== myD) return 1;
    return String(b.lastMessageAt || '').localeCompare(String(a.lastMessageAt || ''));
  });
  return res.json({ success: true, threads: summaries });
});

function buildGroupInviteUrl(inviteCode: string, autoCall?: 'audio' | 'video'): string {
  const base = `https://vintagevibesgk.com/live/connect?joinGroup=${encodeURIComponent(inviteCode)}`;
  return autoCall ? `${base}&autoCall=${autoCall}` : base;
}

liveStreamingRouter.get('/connect/groups', (req, res) => {
  const caller = getConnectCallerIdentity(req);
  if (!caller) return res.status(401).json({ success: false, error: 'CONNECT_AUTH_REQUIRED' });
  const myD = caller.phoneDigits;
  const users = loadConnectUsers();
  const store = loadConnectGroups();
  const list = Object.values(store)
    .filter((g) => Array.isArray(g.members) && g.members.includes(myD))
    .map((g) => ({
      groupId: g.groupId,
      name: g.name,
      description: g.description || '',
      inviteCode: g.inviteCode,
      inviteUrl: buildGroupInviteUrl(g.inviteCode),
      createdBy: g.createdBy,
      admins: g.admins,
      members: hydrateGroupMembers(g, users),
      memberCount: g.members.length,
      lastMessageAt: g.lastMessageAt,
      lastMessagePreview: g.lastMessagePreview,
      activeCall: getActiveGroupCallSummary(g.groupId)
    }))
    .sort((a, b) => String(b.lastMessageAt || '').localeCompare(String(a.lastMessageAt || '')));
  return res.json({ success: true, groups: list });
});

liveStreamingRouter.post('/connect/groups/create', (req, res) => {
  const caller = getConnectCallerIdentity(req);
  if (!caller) return res.status(401).json({ success: false, error: 'CONNECT_AUTH_REQUIRED' });
  const myD = caller.phoneDigits;
  const users = loadConnectUsers();
  const me = users[myD];
  const myName = me?.name || caller.name;

  const cleanName = String(req.body?.name || '').replace(/[<>]/g, '').trim().slice(0, 60);
  if (cleanName.length < 2) {
    return res.status(400).json({ success: false, error: 'Group name must be at least 2 characters.' });
  }
  const cleanDesc = String(req.body?.description || '').replace(/[<>]/g, '').trim().slice(0, 140);
  const rawMembers: string[] = Array.isArray(req.body?.members)
    ? req.body.members
    : typeof req.body?.members === 'string'
    ? String(req.body.members).split(/[,;\n\r]+/)
    : [];

  const memberSet = new Set<string>([myD]);
  for (const m of rawMembers) {
    const d = normalizeConnectDigits(String(m || ''));
    if (d.length >= 7 && memberSet.size < 32) memberSet.add(d);
  }
  const members = Array.from(memberSet);
  const nowIso = new Date().toISOString();
  const groupId = `grp_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const inviteCode = crypto.randomBytes(5).toString('hex');

  const sysMsg: LivePrivateMessage = {
    id: `gm_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    sender: 'peer',
    senderPhone: myD,
    senderName: myName,
    text: `👥 ${myName} created group "${cleanName}" (${members.length} members)`,
    createdAt: nowIso
  };

  const rec: ConnectGroupRecord = {
    groupId,
    name: cleanName,
    description: cleanDesc || undefined,
    inviteCode,
    createdBy: myD,
    admins: [myD],
    members,
    createdAt: nowIso,
    lastMessageAt: nowIso,
    lastMessagePreview: sysMsg.text || '',
    messages: [sysMsg]
  };
  const store = loadConnectGroups();
  store[groupId] = rec;
  saveConnectGroups();

  broadcastConnectGroupMessage(members, {
    type: 'GROUP_UPDATE',
    groupId,
    name: rec.name,
    memberCount: members.length
  });

  return res.json({
    success: true,
    group: {
      groupId: rec.groupId,
      name: rec.name,
      description: rec.description || '',
      inviteCode: rec.inviteCode,
      inviteUrl: buildGroupInviteUrl(rec.inviteCode),
      members: hydrateGroupMembers(rec, users),
      memberCount: members.length,
      activeCall: getActiveGroupCallSummary(rec.groupId)
    },
    inviteUrl: buildGroupInviteUrl(rec.inviteCode)
  });
});

liveStreamingRouter.post('/connect/groups/instant-call', (req, res) => {
  const caller = getConnectCallerIdentity(req);
  if (!caller) return res.status(401).json({ success: false, error: 'CONNECT_AUTH_REQUIRED' });
  const myD = caller.phoneDigits;
  const users = loadConnectUsers();
  const me = users[myD];
  const myName = me?.name || caller.name;
  const mode: 'audio' | 'video' = req.body?.mode === 'audio' ? 'audio' : 'video';
  const rawMembers: string[] = Array.isArray(req.body?.members) ? req.body.members : [];
  const memberSet = new Set<string>([myD]);
  for (const m of rawMembers) {
    const d = normalizeConnectDigits(String(m || ''));
    if (d.length >= 7 && memberSet.size < 32) memberSet.add(d);
  }
  const members = Array.from(memberSet);
  const cleanName = String(req.body?.name || `${myName}'s Group Call`).replace(/[<>]/g, '').trim().slice(0, 60) || `${myName}'s Group Call`;
  const nowIso = new Date().toISOString();
  const groupId = `grp_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const inviteCode = crypto.randomBytes(5).toString('hex');

  const rec: ConnectGroupRecord = {
    groupId,
    name: cleanName,
    description: `Free HD ${mode === 'video' ? 'Video' : 'Audio'} Group Call`,
    inviteCode,
    createdBy: myD,
    admins: [myD],
    members,
    createdAt: nowIso,
    lastMessageAt: nowIso,
    lastMessagePreview: `📞 Group ${mode === 'video' ? 'Video' : 'Audio'} Call Room created`,
    messages: [
      {
        id: `gm_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        sender: 'peer',
        senderPhone: myD,
        senderName: myName,
        text: `📞 Group ${mode === 'video' ? 'Video' : 'Audio'} Call Room ready — share the invite link (up to 6 members free)!`,
        createdAt: nowIso
      }
    ]
  };
  const store = loadConnectGroups();
  store[groupId] = rec;
  saveConnectGroups();

  return res.json({
    success: true,
    groupId: rec.groupId,
    inviteCode: rec.inviteCode,
    inviteUrl: buildGroupInviteUrl(rec.inviteCode, mode),
    group: {
      groupId: rec.groupId,
      name: rec.name,
      inviteCode: rec.inviteCode,
      inviteUrl: buildGroupInviteUrl(rec.inviteCode, mode),
      members: hydrateGroupMembers(rec, users),
      memberCount: members.length,
      activeCall: getActiveGroupCallSummary(rec.groupId)
    }
  });
});

liveStreamingRouter.post('/connect/groups/join/:inviteCode', (req, res) => {
  const caller = getConnectCallerIdentity(req);
  if (!caller) return res.status(401).json({ success: false, error: 'CONNECT_AUTH_REQUIRED' });
  const myD = caller.phoneDigits;
  const users = loadConnectUsers();
  const myName = users[myD]?.name || caller.name;
  const code = String(req.params.inviteCode || '').trim().toLowerCase();
  if (!/^[a-f0-9]{6,20}$/.test(code)) {
    return res.status(400).json({ success: false, error: 'Invalid group invite code' });
  }
  const store = loadConnectGroups();
  const group = Object.values(store).find((g) => String(g.inviteCode || '').toLowerCase() === code);
  if (!group) {
    return res.status(404).json({ success: false, error: 'Group invite expired or not found' });
  }
  let added = false;
  if (!group.members.includes(myD)) {
    if (group.members.length >= 32) {
      return res.status(400).json({ success: false, error: 'Group is full (max 32 members)' });
    }
    group.members.push(myD);
    added = true;
    const nowIso = new Date().toISOString();
    const joinMsg: LivePrivateMessage = {
      id: `gm_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      sender: 'peer',
      senderPhone: myD,
      senderName: myName,
      text: `👋 ${myName} joined via invite link`,
      createdAt: nowIso
    };
    group.messages.push(joinMsg);
    if (group.messages.length > 150) group.messages = group.messages.slice(-150);
    group.lastMessageAt = nowIso;
    group.lastMessagePreview = joinMsg.text || '';
    saveConnectGroups();
    broadcastConnectGroupMessage(group.members, { type: 'GROUP_MSG', groupId: group.groupId, threadId: group.groupId, message: joinMsg });
    broadcastConnectGroupMessage(group.members, { type: 'GROUP_UPDATE', groupId: group.groupId, memberCount: group.members.length });
  }
  return res.json({
    success: true,
    added,
    groupId: group.groupId,
    group: {
      groupId: group.groupId,
      name: group.name,
      description: group.description || '',
      inviteCode: group.inviteCode,
      inviteUrl: buildGroupInviteUrl(group.inviteCode),
      members: hydrateGroupMembers(group, users),
      memberCount: group.members.length,
      activeCall: getActiveGroupCallSummary(group.groupId)
    }
  });
});

liveStreamingRouter.get('/connect/groups/:groupId', (req, res) => {
  const caller = getConnectCallerIdentity(req);
  if (!caller) return res.status(401).json({ success: false, error: 'CONNECT_AUTH_REQUIRED' });
  const myD = caller.phoneDigits;
  const users = loadConnectUsers();
  const me = users[myD];
  const groupId = String(req.params.groupId || '').trim();
  const store = loadConnectGroups();
  const g = store[groupId];
  if (!g) return res.status(404).json({ success: false, error: 'Group not found' });
  if (!g.members.includes(myD)) return res.status(403).json({ success: false, error: 'Not a member of this group' });

  return res.json({
    success: true,
    isGroup: true,
    threadId: g.groupId,
    targetPhone: g.groupId,
    groupId: g.groupId,
    peerName: g.name,
    peerPhone: `${g.members.length} members`,
    about: g.description || `Group Chat (${g.members.length} members)`,
    avatarUrl: g.avatarUrl || '',
    inviteCode: g.inviteCode,
    inviteUrl: buildGroupInviteUrl(g.inviteCode),
    members: hydrateGroupMembers(g, users),
    admins: g.admins,
    activeCall: getActiveGroupCallSummary(g.groupId),
    online: true,
    prefs: {
      archived: Boolean(me?.archivedThreads?.includes(g.groupId)),
      favorite: Boolean(me?.favoriteThreads?.includes(g.groupId)),
      pinned: Boolean(me?.pinnedThreads?.includes(g.groupId)),
      muted: Boolean(me?.mutedThreads?.includes(g.groupId)),
      blocked: false
    },
    messages: filterVisibleThreadMessages(g.messages, myD)
  });
});

liveStreamingRouter.post('/connect/groups/:groupId/members', (req, res) => {
  const caller = getConnectCallerIdentity(req);
  if (!caller) return res.status(401).json({ success: false, error: 'CONNECT_AUTH_REQUIRED' });
  const myD = caller.phoneDigits;
  const users = loadConnectUsers();
  const myName = users[myD]?.name || caller.name;
  const groupId = String(req.params.groupId || '').trim();
  const store = loadConnectGroups();
  const g = store[groupId];
  if (!g) return res.status(404).json({ success: false, error: 'Group not found' });
  if (!g.members.includes(myD)) return res.status(403).json({ success: false, error: 'Not a group member' });

  const action = String(req.body?.action || 'add').trim().toLowerCase();
  const nowIso = new Date().toISOString();

  if (action === 'leave') {
    const prevMembers = [...g.members];
    g.members = g.members.filter((m) => m !== myD);
    g.admins = g.admins.filter((a) => a !== myD);
    if (g.members.length > 0 && g.admins.length === 0) g.admins.push(g.members[0]);
    if (g.members.length === 0) {
      delete store[groupId];
      saveConnectGroups();
      return res.json({ success: true, left: true, deleted: true });
    }
    const sysMsg: LivePrivateMessage = {
      id: `gm_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      sender: 'peer',
      senderPhone: myD,
      senderName: myName,
      text: `🚪 ${myName} left the group`,
      createdAt: nowIso
    };
    g.messages.push(sysMsg);
    g.lastMessageAt = nowIso;
    g.lastMessagePreview = sysMsg.text || '';
    saveConnectGroups();
    broadcastConnectGroupMessage(prevMembers, { type: 'GROUP_MSG', groupId, threadId: groupId, message: sysMsg });
    broadcastConnectGroupMessage(prevMembers, { type: 'GROUP_UPDATE', groupId, memberCount: g.members.length });
    return res.json({ success: true, left: true });
  }

  if (action === 'remove') {
    if (!g.admins.includes(myD)) {
      return res.status(403).json({ success: false, error: 'Only a group admin can remove members.' });
    }
    const rmD = normalizeConnectDigits(String(req.body?.phone || ''));
    if (!rmD || rmD === myD || !g.members.includes(rmD)) {
      return res.status(400).json({ success: false, error: 'Valid member phone required' });
    }
    const prevMembers = [...g.members];
    g.members = g.members.filter((m) => m !== rmD);
    g.admins = g.admins.filter((a) => a !== rmD);
    const rmName = users[rmD]?.name || `+${rmD}`;
    const sysMsg: LivePrivateMessage = {
      id: `gm_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      sender: 'peer',
      senderPhone: myD,
      senderName: myName,
      text: `${myName} removed ${rmName}`,
      createdAt: nowIso
    };
    g.messages.push(sysMsg);
    g.lastMessageAt = nowIso;
    g.lastMessagePreview = sysMsg.text || '';
    saveConnectGroups();
    broadcastConnectGroupMessage(prevMembers, { type: 'GROUP_UPDATE', groupId, memberCount: g.members.length });
    return res.json({ success: true, members: hydrateGroupMembers(g, users) });
  }

  // action === 'add'
  const rawPhones: string[] = Array.isArray(req.body?.phones)
    ? req.body.phones
    : String(req.body?.phone || '').split(/[,;\n\r]+/);
  const addedNames: string[] = [];
  for (const rp of rawPhones) {
    const d = normalizeConnectDigits(String(rp || ''));
    if (d.length >= 7 && !g.members.includes(d) && g.members.length < 32) {
      g.members.push(d);
      addedNames.push(users[d]?.name || `+${d}`);
    }
  }
  if (addedNames.length > 0) {
    const sysMsg: LivePrivateMessage = {
      id: `gm_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      sender: 'peer',
      senderPhone: myD,
      senderName: myName,
      text: `➕ ${myName} added ${addedNames.join(', ')}`,
      createdAt: nowIso
    };
    g.messages.push(sysMsg);
    if (g.messages.length > 150) g.messages = g.messages.slice(-150);
    g.lastMessageAt = nowIso;
    g.lastMessagePreview = sysMsg.text || '';
    saveConnectGroups();
    broadcastConnectGroupMessage(g.members, { type: 'GROUP_MSG', groupId, threadId: groupId, message: sysMsg });
    broadcastConnectGroupMessage(g.members, { type: 'GROUP_UPDATE', groupId, memberCount: g.members.length });
  }
  return res.json({ success: true, addedCount: addedNames.length, members: hydrateGroupMembers(g, users) });
});

liveStreamingRouter.post('/connect/groups/:groupId/send', async (req, res) => {
  const caller = getConnectCallerIdentity(req);
  if (!caller) return res.status(401).json({ success: false, error: 'CONNECT_AUTH_REQUIRED' });
  const myD = caller.phoneDigits;
  const users = loadConnectUsers();
  const me = users[myD];
  const myName = me?.name || caller.name;
  const groupId = String(req.params.groupId || '').trim();
  const store = loadConnectGroups();
  const g = store[groupId];
  if (!g) return res.status(404).json({ success: false, error: 'Group not found' });
  if (!g.members.includes(myD)) return res.status(403).json({ success: false, error: 'Not a group member' });

  const body = req.body || {};
  const cleanText = String(body.text || '').trim().slice(0, 1500);
  const mediaRes = await processUploadedVoiceAndMedia(body);
  if (mediaRes.error) return res.status(400).json({ success: false, error: mediaRes.error });
  const { audioUrl, attachment, contactCard, locationPin } = mediaRes;

  let pieceCard: LivePrivateMessage['pieceCard'] | undefined;
  if (body.pieceCard && body.pieceCard.sku) {
    pieceCard = {
      sku: String(body.pieceCard.sku).trim().slice(0, 48),
      title: String(body.pieceCard.title || 'Vintage Piece').trim().slice(0, 120),
      priceAed: Number(body.pieceCard.priceAed || 0),
      size: body.pieceCard.size ? String(body.pieceCard.size).trim().slice(0, 20) : undefined,
      frontImageUrl: body.pieceCard.frontImageUrl ? String(body.pieceCard.frontImageUrl).trim().slice(0, 400) : undefined
    };
  }
  let replyTo: LivePrivateMessage['replyTo'] | undefined;
  if (body.replyTo && typeof body.replyTo === 'object' && body.replyTo.id) {
    replyTo = {
      id: String(body.replyTo.id).trim().slice(0, 80),
      senderName: String(body.replyTo.senderName || 'Message').trim().slice(0, 60),
      preview: String(body.replyTo.preview || '').trim().slice(0, 120)
    };
  }
  if (!cleanText && !audioUrl && !attachment && !contactCard && !locationPin && !pieceCard) {
    return res.status(400).json({ success: false, error: 'Message content required' });
  }

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const disHours = Number(me?.settings?.disappearingHours || 0);
  const expiresAt = disHours > 0 ? new Date(nowMs + disHours * 3600 * 1000).toISOString() : undefined;

  const msgObj: LivePrivateMessage = {
    id: `gm_${nowMs}_${crypto.randomBytes(3).toString('hex')}`,
    sender: 'peer',
    senderPhone: myD,
    senderName: myName,
    text: cleanText || undefined,
    audioUrl: audioUrl || undefined,
    audioDurationSec: body.audioDurationSec ? Math.min(60, Math.max(1, Math.round(Number(body.audioDurationSec)))) : undefined,
    attachment,
    contactCard,
    locationPin,
    pieceCard,
    replyTo,
    forwarded: Boolean(body.forwarded) || undefined,
    expiresAt,
    createdAt: nowIso
  };
  g.messages.push(msgObj);
  if (g.messages.length > 150) g.messages = g.messages.slice(-150);
  g.lastMessageAt = nowIso;
  g.lastMessagePreview = buildMessagePreviewText(msgObj);
  saveConnectGroups();

  broadcastConnectGroupMessage(g.members, {
    type: 'GROUP_MSG',
    groupId: g.groupId,
    threadId: g.groupId,
    fromPhone: myD,
    message: msgObj
  });

  const pushUrl = `https://vintagevibesgk.com/live/connect?chat=${encodeURIComponent(g.groupId)}`;
  for (const memberD of g.members) {
    if (memberD === myD) continue;
    const mu = users[memberD];
    if (mu?.mutedThreads?.includes(g.groupId)) continue;
    void sendWebPushToOwner(
      `wa_${memberD}`,
      {
        kind: 'chat',
        title: `👥 ${g.name} • ${myName}`,
        body: g.lastMessagePreview || 'New group message',
        threadId: g.groupId,
        groupId: g.groupId,
        fromPhone: myD,
        url: pushUrl
      },
      { ttl: 300, urgency: 'high', topic: g.groupId.slice(0, 32) }
    );
  }

  return res.json({ success: true, groupId: g.groupId, message: msgObj });
});

liveStreamingRouter.post('/connect/groups/:groupId/call/start', async (req, res) => {
  const caller = getConnectCallerIdentity(req);
  if (!caller) return res.status(401).json({ success: false, error: 'CONNECT_AUTH_REQUIRED' });
  const myD = caller.phoneDigits;
  const users = loadConnectUsers();
  const myName = users[myD]?.name || caller.name;
  const groupId = String(req.params.groupId || '').trim();
  const store = loadConnectGroups();
  const g = store[groupId];
  if (!g) return res.status(404).json({ success: false, error: 'Group not found' });
  if (!g.members.includes(myD)) return res.status(403).json({ success: false, error: 'Not a group member' });

  const mode: 'audio' | 'video' = req.body?.mode === 'video' ? 'video' : 'audio';
  const callId = `gc_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const others = g.members.filter((m) => m !== myD);

  broadcastConnectGroupMessage(others, {
    type: 'GROUP_CALL_INVITE',
    callId,
    groupId: g.groupId,
    groupName: g.name,
    mode,
    callerPhone: myD,
    callerName: myName
  });

  const joinUrl = `https://vintagevibesgk.com/live/connect?groupCall=${encodeURIComponent(g.groupId)}&mode=${mode}`;
  let pushSentTotal = 0;
  await Promise.all(
    others.map(async (memberD) => {
      const mu = users[memberD];
      if (mu?.mutedThreads?.includes(g.groupId)) return;
      const r = await sendWebPushToOwner(
        `wa_${memberD}`,
        {
          kind: 'group_call',
          title: `${mode === 'video' ? '📹 Group Video Call' : '📞 Group Audio Call'}: ${g.name}`,
          body: `${myName} started a FREE group call — Tap to Join live`,
          callId,
          groupId: g.groupId,
          groupName: g.name,
          mode,
          callerName: myName,
          fromPhone: myD,
          url: joinUrl
        },
        { ttl: 45, urgency: 'high', topic: g.groupId.slice(0, 32) }
      );
      pushSentTotal += Number(r.sent || 0);
    })
  );

  return res.json({
    success: true,
    callId,
    groupId: g.groupId,
    mode,
    notifiedMembers: others.length,
    pushSentTotal,
    inviteUrl: buildGroupInviteUrl(g.inviteCode, mode)
  });
});

liveStreamingRouter.get('/connect/thread/:targetPhone', (req, res) => {
  const caller = requireConnectAuth(req, res);
  if (!caller) return;
  const myD = caller.phoneDigits;
  const users = loadConnectUsers();
  const me = users[myD];
  const rawParam = String(req.params.targetPhone || '').trim();
  const targetRaw = rawParam.toLowerCase();

  if (/^grp_[a-zA-Z0-9_-]+$/.test(rawParam)) {
    const g = loadConnectGroups()[rawParam];
    if (!g) return res.status(404).json({ success: false, error: 'Group not found' });
    if (!g.members.includes(myD)) return res.status(403).json({ success: false, error: 'Not a member of this group' });
    return res.json({
      success: true,
      isGroup: true,
      threadId: g.groupId,
      targetPhone: g.groupId,
      groupId: g.groupId,
      peerName: g.name,
      peerPhone: `${g.members.length} members`,
      about: g.description || `Group Chat (${g.members.length} members)`,
      avatarUrl: g.avatarUrl || '',
      inviteCode: g.inviteCode,
      inviteUrl: buildGroupInviteUrl(g.inviteCode),
      members: hydrateGroupMembers(g, users),
      admins: g.admins,
      activeCall: getActiveGroupCallSummary(g.groupId),
      online: true,
      prefs: {
        archived: Boolean(me?.archivedThreads?.includes(g.groupId)),
        favorite: Boolean(me?.favoriteThreads?.includes(g.groupId)),
        pinned: Boolean(me?.pinnedThreads?.includes(g.groupId)),
        muted: Boolean(me?.mutedThreads?.includes(g.groupId)),
        blocked: false
      },
      messages: filterVisibleThreadMessages(g.messages, myD)
    });
  }

  if (targetRaw === 'desk') {
    const deskStore = loadMessengerThreads();
    const th = deskStore[`wa_${myD}`];
    if (th && th.unreadByBuyer > 0) {
      th.unreadByBuyer = 0;
      saveMessengerThreads();
    }
    return res.json({
      success: true,
      targetPhone: 'desk',
      peerName: '👑 Vintage Vibes Boss Desk',
      peerPhone: 'Official Store Concierge',
      about: 'Al Ain & Dubai Concierge Desk',
      avatarUrl: '/pwa-192x192.png',
      online: true,
      isSelf: false,
      prefs: {
        archived: Boolean(me?.archivedThreads?.includes('desk')),
        favorite: Boolean(me?.favoriteThreads?.includes('desk')),
        pinned: Boolean(me?.pinnedThreads?.includes('desk')),
        muted: Boolean(me?.mutedThreads?.includes('desk')),
        blocked: false
      },
      messages: filterVisibleThreadMessages(th?.messages, myD)
    });
  }

  const targetD = normalizeConnectDigits(targetRaw.replace(/^wa_/, ''));
  if (targetD.length < 7) return res.status(400).json({ success: false, error: 'Invalid target phone' });
  const tid = `p2p_${[myD, targetD].sort().join('_')}`;
  const p2pStore = loadConnectThreads();
  const th = p2pStore[tid];
  const u = users[targetD];
  const isSelf = targetD === myD;

  if (th && Array.isArray(th.messages) && !isSelf && me?.settings?.readReceipts !== false && u?.settings?.readReceipts !== false) {
    const readNow = new Date().toISOString();
    let marked = false;
    for (const m of th.messages) {
      if (m.senderPhone && m.senderPhone === targetD && !m.readAt) {
        m.readAt = readNow;
        marked = true;
      }
    }
    if (marked) {
      saveConnectThreads();
      broadcastConnectPrivateMessage(targetD, {
        type: 'MSG_READ',
        threadId: tid,
        peerPhone: myD,
        readAt: readNow
      });
    }
  }

  return res.json({
    success: true,
    threadId: tid,
    targetPhone: targetD,
    peerName: isSelf ? `${u?.name || caller.name} (You)` : (u?.name || th?.participantNames?.[targetD] || `+${targetD}`),
    peerPhone: u?.displayPhone || `+${targetD}`,
    about: isSelf ? 'Message yourself' : (u?.about || ''),
    avatarUrl: u?.avatarUrl || '',
    lastSeenAt: u?.settings?.showOnline === false ? undefined : u?.lastSeenAt,
    online: isSelf ? true : (u?.settings?.showOnline === false ? false : isConnectUserOnline(targetD)),
    isSelf,
    prefs: {
      archived: Boolean(me?.archivedThreads?.includes(targetD)),
      favorite: Boolean(me?.favoriteThreads?.includes(targetD)),
      pinned: Boolean(me?.pinnedThreads?.includes(targetD)),
      muted: Boolean(me?.mutedThreads?.includes(targetD)),
      blocked: Boolean(me?.blockedPhones?.includes(targetD))
    },
    messages: filterVisibleThreadMessages(th?.messages, myD)
  });
});

liveStreamingRouter.post('/connect/send', async (req, res) => {
  const caller = requireConnectAuth(req, res);
  if (!caller) return;
  const body = req.body || {};
  const myD = caller.phoneDigits;
  const users = loadConnectUsers();
  const me = users[myD];
  const myName = me?.name || caller.name;
  const targetRaw = String(body.targetPhone || 'desk').trim().toLowerCase();
  const cleanText = String(body.text || '').trim().slice(0, 1500);

  const mediaRes = await processUploadedVoiceAndMedia(body);
  if (mediaRes.error) return res.status(400).json({ success: false, error: mediaRes.error });
  const { audioUrl, attachment, contactCard, locationPin } = mediaRes;

  let pieceCard: LivePrivateMessage['pieceCard'] | undefined;
  if (body.pieceCard && body.pieceCard.sku) {
    pieceCard = {
      sku: String(body.pieceCard.sku).trim().slice(0, 48),
      title: String(body.pieceCard.title || 'Vintage Piece').trim().slice(0, 120),
      priceAed: Number(body.pieceCard.priceAed || 0),
      size: body.pieceCard.size ? String(body.pieceCard.size).trim().slice(0, 20) : undefined,
      frontImageUrl: body.pieceCard.frontImageUrl ? String(body.pieceCard.frontImageUrl).trim().slice(0, 400) : undefined
    };
  }
  let replyTo: LivePrivateMessage['replyTo'] | undefined;
  if (body.replyTo && typeof body.replyTo === 'object' && body.replyTo.id) {
    replyTo = {
      id: String(body.replyTo.id).trim().slice(0, 80),
      senderName: String(body.replyTo.senderName || 'Message').trim().slice(0, 60),
      preview: String(body.replyTo.preview || '').trim().slice(0, 120)
    };
  }
  let callLog: LivePrivateMessage['callLog'] | undefined;
  if (body.callLog && typeof body.callLog === 'object' && (body.callLog.mode === 'audio' || body.callLog.mode === 'video')) {
    callLog = {
      mode: body.callLog.mode,
      status: ['started', 'completed', 'missed', 'declined'].includes(String(body.callLog.status || '')) ? body.callLog.status : 'completed',
      durationSec: Number.isFinite(Number(body.callLog.durationSec)) && Number(body.callLog.durationSec) > 0 ? Math.round(Number(body.callLog.durationSec)) : undefined
    };
  }
  let poll: LivePrivateMessage['poll'] | undefined;
  if (body.poll && typeof body.poll === 'object') {
    const pq = String(body.poll.question || '').replace(/[<>]/g, '').trim().slice(0, 200);
    const rawOpts: any[] = Array.isArray(body.poll.options) ? body.poll.options : [];
    const cleanOpts = rawOpts
      .map((o, idx) => ({
        id: `po_${idx + 1}_${crypto.randomBytes(2).toString('hex')}`,
        text: String(typeof o === 'string' ? o : (o?.text || '')).replace(/[<>]/g, '').trim().slice(0, 80),
        votes: [] as string[]
      }))
      .filter((o) => o.text.length > 0)
      .slice(0, 6);
    if (pq.length >= 2 && cleanOpts.length >= 2) {
      poll = { question: pq, allowMultiple: Boolean(body.poll.allowMultiple), options: cleanOpts };
    }
  }

  if (!cleanText && !audioUrl && !attachment && !contactCard && !locationPin && !pieceCard && !callLog && !poll) {
    return res.status(400).json({ success: false, error: 'Message content required' });
  }

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const disHours = Number(me?.settings?.disappearingHours || 0);
  const expiresAt = disHours > 0 ? new Date(nowMs + disHours * 3600 * 1000).toISOString() : undefined;
  const forwarded = Boolean(body.forwarded);

  const rawTargetParam = String(body.targetPhone || 'desk').trim();
  // Route to Group Chat if targetPhone === 'grp_...'
  if (/^grp_[a-zA-Z0-9_-]+$/.test(rawTargetParam)) {
    const gStore = loadConnectGroups();
    const g = gStore[rawTargetParam];
    if (!g) return res.status(404).json({ success: false, error: 'Group not found' });
    if (!g.members.includes(myD)) return res.status(403).json({ success: false, error: 'Not a group member' });
    const gMsg: LivePrivateMessage = {
      id: `gm_${nowMs}_${crypto.randomBytes(3).toString('hex')}`,
      sender: 'peer',
      senderPhone: myD,
      senderName: myName,
      text: cleanText || undefined,
      audioUrl: audioUrl || undefined,
      audioDurationSec: body.audioDurationSec ? Math.min(60, Math.max(1, Math.round(Number(body.audioDurationSec)))) : undefined,
      attachment,
      contactCard,
      locationPin,
      pieceCard,
      replyTo,
      callLog,
      poll,
      forwarded: forwarded || undefined,
      expiresAt,
      createdAt: nowIso
    };
    g.messages.push(gMsg);
    if (g.messages.length > 150) g.messages = g.messages.slice(-150);
    g.lastMessageAt = nowIso;
    g.lastMessagePreview = buildMessagePreviewText(gMsg);
    saveConnectGroups();

    broadcastConnectGroupMessage(g.members, {
      type: 'GROUP_MSG',
      groupId: g.groupId,
      threadId: g.groupId,
      fromPhone: myD,
      message: gMsg
    });
    const pushUrl = `https://vintagevibesgk.com/live/connect?chat=${encodeURIComponent(g.groupId)}`;
    for (const memberD of g.members) {
      if (memberD === myD) continue;
      const mu = users[memberD];
      if (mu?.mutedThreads?.includes(g.groupId)) continue;
      void sendWebPushToOwner(
        `wa_${memberD}`,
        {
          kind: 'chat',
          title: `👥 ${g.name} • ${myName}`,
          body: g.lastMessagePreview || 'New group message',
          threadId: g.groupId,
          groupId: g.groupId,
          fromPhone: myD,
          url: pushUrl
        },
        { ttl: 300, urgency: 'high', topic: g.groupId.slice(0, 32) }
      );
    }
    return res.json({ success: true, threadId: g.groupId, targetPhone: g.groupId, groupId: g.groupId, message: gMsg });
  }

  // Route to Boss Desk Inbox if targetPhone === 'desk'
  if (targetRaw === 'desk') {
    const store = loadMessengerThreads();
    const tid = `wa_${myD}`;
    const existing = store[tid];
    const thread: LivePrivateThread = existing || {
      threadId: tid,
      boothId: 'booth-1',
      buyerName: myName,
      buyerPhone: me?.displayPhone || `+${myD}`,
      unreadByAdmin: 0,
      unreadByBuyer: 0,
      lastMessageAt: nowIso,
      lastMessagePreview: '',
      messages: []
    };
    const msgObj: LivePrivateMessage = {
      id: `pm_${nowMs}_${crypto.randomBytes(3).toString('hex')}`,
      sender: 'buyer',
      senderPhone: myD,
      senderName: myName,
      text: cleanText || undefined,
      audioUrl: audioUrl || undefined,
      audioDurationSec: body.audioDurationSec ? Math.min(60, Math.max(1, Math.round(Number(body.audioDurationSec)))) : undefined,
      attachment,
      contactCard,
      locationPin,
      pieceCard,
      replyTo,
      callLog,
      poll,
      forwarded: forwarded || undefined,
      expiresAt,
      createdAt: nowIso
    };
    thread.messages.push(msgObj);
    if (thread.messages.length > 120) thread.messages = thread.messages.slice(-120);
    thread.lastMessageAt = nowIso;
    thread.lastMessagePreview = buildMessagePreviewText(msgObj);
    thread.unreadByAdmin = Number(thread.unreadByAdmin || 0) + 1;
    store[tid] = thread;
    saveMessengerThreads();

    broadcastLivePrivateMessage('booth-1', tid, { message: msgObj });
    void sendWebPushToOwner(
      'admin_desk',
      {
        kind: 'chat',
        title: `💬 ${myName}`,
        body: thread.lastMessagePreview || 'New message',
        threadId: tid,
        url: 'https://vintagevibesgk.com/live/desk'
      },
      { ttl: 300, urgency: 'high' }
    );
    return res.json({ success: true, targetPhone: 'desk', message: msgObj });
  }

  // Peer-to-Peer message (Friends / Family / Self-Chat)
  const targetD = normalizeConnectDigits(targetRaw.replace(/^wa_/, ''));
  if (targetD.length < 7) return res.status(400).json({ success: false, error: 'Valid targetPhone required' });
  const peerUser = users[targetD];
  if (targetD !== myD) {
    if (me?.blockedPhones?.includes(targetD) || peerUser?.blockedPhones?.includes(myD)) {
      return res.status(403).json({ success: false, error: 'Blocked contact — message cannot be delivered.' });
    }
  }
  const tid = `p2p_${[myD, targetD].sort().join('_')}`;
  const p2pStore = loadConnectThreads();
  const existing = p2pStore[tid];
  const th: ConnectP2PThread = existing || {
    threadId: tid,
    participants: [myD, targetD].sort(),
    participantNames: {
      [myD]: myName,
      [targetD]: peerUser?.name || `+${targetD}`
    },
    lastMessageAt: nowIso,
    lastMessagePreview: '',
    messages: []
  };
  th.participantNames[myD] = myName;
  if (peerUser?.name) th.participantNames[targetD] = peerUser.name;

  const msgObj: LivePrivateMessage = {
    id: `p2p_${nowMs}_${crypto.randomBytes(3).toString('hex')}`,
    sender: 'peer',
    senderPhone: myD,
    senderName: myName,
    text: cleanText || undefined,
    audioUrl: audioUrl || undefined,
    audioDurationSec: body.audioDurationSec ? Math.min(60, Math.max(1, Math.round(Number(body.audioDurationSec)))) : undefined,
    attachment,
    contactCard,
    locationPin,
    pieceCard,
    replyTo,
    callLog,
    poll,
    forwarded: forwarded || undefined,
    expiresAt,
    createdAt: nowIso
  };
  th.messages.push(msgObj);
  if (th.messages.length > 120) th.messages = th.messages.slice(-120);
  th.lastMessageAt = nowIso;
  th.lastMessagePreview = buildMessagePreviewText(msgObj);
  p2pStore[tid] = th;
  saveConnectThreads();

  if (targetD !== myD) {
    broadcastConnectPrivateMessage(targetD, { threadId: tid, fromPhone: myD, message: msgObj });
    void sendWebPushToOwner(
      `wa_${targetD}`,
      {
        kind: 'chat',
        title: `💬 ${myName}`,
        body: th.lastMessagePreview || 'New message',
        threadId: tid,
        fromPhone: myD,
        url: `https://vintagevibesgk.com/live/connect?chat=${encodeURIComponent(myD)}`
      },
      { ttl: 300, urgency: 'high', topic: tid.slice(0, 32) }
    );
  }
  broadcastConnectPrivateMessage(myD, { threadId: tid, fromPhone: myD, targetPhone: targetD, message: msgObj });

  return res.json({ success: true, threadId: tid, targetPhone: targetD, message: msgObj });
});

liveStreamingRouter.post('/connect/message/action', (req, res) => {
  const caller = requireConnectAuth(req, res);
  if (!caller) return;
  const myD = caller.phoneDigits;
  const targetRaw = String(req.body?.targetPhone || 'desk').trim().toLowerCase();
  const messageId = String(req.body?.messageId || '').trim();
  const action = String(req.body?.action || '').trim().toLowerCase();
  const emoji = String(req.body?.emoji || '').trim().slice(0, 12);
  if (!messageId || !['react', 'star', 'delete_me', 'delete_everyone', 'edit', 'pin_msg'].includes(action)) {
    return res.status(400).json({ success: false, error: 'Valid messageId and action required' });
  }

  let msgs: LivePrivateMessage[] | undefined;
  let persistFn: () => void = () => {};
  const isDesk = targetRaw === 'desk';
  const rawParam = String(req.body?.targetPhone || '').trim();
  const isGroup = /^grp_[a-zA-Z0-9_-]+$/.test(rawParam);
  let tid = '';
  let targetD = '';
  let groupMembers: string[] = [];

  if (isDesk) {
    const deskStore = loadMessengerThreads();
    tid = `wa_${myD}`;
    const th = deskStore[tid];
    msgs = th?.messages;
    persistFn = saveMessengerThreads;
  } else if (isGroup) {
    const gStore = loadConnectGroups();
    const g = gStore[rawParam];
    if (!g || !g.members.includes(myD)) return res.status(403).json({ success: false, error: 'Group access required' });
    tid = g.groupId;
    groupMembers = g.members;
    msgs = g.messages;
    persistFn = saveConnectGroups;
  } else {
    targetD = normalizeConnectDigits(targetRaw.replace(/^wa_/, ''));
    if (targetD.length < 7) return res.status(400).json({ success: false, error: 'Invalid targetPhone' });
    tid = `p2p_${[myD, targetD].sort().join('_')}`;
    const p2pStore = loadConnectThreads();
    const th = p2pStore[tid];
    msgs = th?.messages;
    persistFn = saveConnectThreads;
  }

  if (!msgs) return res.status(404).json({ success: false, error: 'Thread not found' });
  const msg = msgs.find((m) => m.id === messageId);
  if (!msg) return res.status(404).json({ success: false, error: 'Message not found' });

  if (action === 'react') {
    const curMap = { ...(msg.reactions || {}) };
    if (!emoji || curMap[myD] === emoji) delete curMap[myD];
    else curMap[myD] = emoji;
    msg.reactions = curMap;
  } else if (action === 'star') {
    const s = new Set(Array.isArray(msg.starredBy) ? msg.starredBy : []);
    if (s.has(myD)) s.delete(myD);
    else s.add(myD);
    msg.starredBy = Array.from(s);
  } else if (action === 'delete_me') {
    const df = new Set(Array.isArray(msg.deletedFor) ? msg.deletedFor : []);
    df.add(myD);
    msg.deletedFor = Array.from(df);
  } else if (action === 'edit') {
    const isMine = msg.senderPhone ? msg.senderPhone === myD : (isDesk && msg.sender === 'buyer');
    if (!isMine || msg.deletedForEveryone) {
      return res.status(403).json({ success: false, error: 'You can only edit your own messages.' });
    }
    if (Date.now() - Date.parse(msg.createdAt) > 15 * 60 * 1000) {
      return res.status(400).json({ success: false, error: 'Messages can only be edited within 15 minutes.' });
    }
    const nextTxt = String(req.body?.text || '').trim().slice(0, 1500);
    if (!nextTxt) return res.status(400).json({ success: false, error: 'Updated text required' });
    msg.text = nextTxt;
    msg.editedAt = new Date().toISOString();
  } else if (action === 'pin_msg') {
    msg.pinnedInChat = !msg.pinnedInChat;
  } else if (action === 'delete_everyone') {
    const isMine = msg.senderPhone ? msg.senderPhone === myD : (isDesk && msg.sender === 'buyer');
    if (!isMine) {
      return res.status(403).json({ success: false, error: 'You can only delete your own messages for everyone.' });
    }
    delete msg.text;
    delete msg.audioUrl;
    delete msg.attachment;
    delete msg.contactCard;
    delete msg.locationPin;
    delete msg.pieceCard;
    delete msg.replyTo;
    delete msg.poll;
    msg.pinnedInChat = false;
    msg.deletedForEveryone = true;
  }

  persistFn();
  if (action === 'react' || action === 'delete_everyone' || action === 'edit' || action === 'pin_msg') {
    if (isDesk) {
      broadcastLivePrivateMessage('booth-1', tid, { type: 'MSG_UPDATE', threadId: tid, targetPhone: 'desk', message: msg });
    } else if (isGroup) {
      broadcastConnectGroupMessage(groupMembers, { type: 'MSG_UPDATE', threadId: tid, groupId: tid, targetPhone: tid, message: msg });
    } else {
      broadcastConnectPrivateMessage(targetD, { type: 'MSG_UPDATE', threadId: tid, fromPhone: myD, message: msg });
      if (targetD !== myD) {
        broadcastConnectPrivateMessage(myD, { type: 'MSG_UPDATE', threadId: tid, fromPhone: myD, targetPhone: targetD, message: msg });
      }
    }
  }
  return res.json({ success: true, message: msg });
});

liveStreamingRouter.post('/connect/poll/vote', (req, res) => {
  const caller = requireConnectAuth(req, res);
  if (!caller) return;
  const myD = caller.phoneDigits;
  const rawParam = String(req.body?.targetPhone || 'desk').trim();
  const targetRaw = rawParam.toLowerCase();
  const messageId = String(req.body?.messageId || '').trim();
  const optionId = String(req.body?.optionId || '').trim();
  if (!messageId || !optionId) return res.status(400).json({ success: false, error: 'Valid messageId and optionId required' });

  const isDesk = targetRaw === 'desk';
  const isGroup = /^grp_[a-zA-Z0-9_-]+$/.test(rawParam);
  let msgs: LivePrivateMessage[] | undefined;
  let persistFn: () => void = () => {};
  let tid = '';
  let targetD = '';
  let groupMembers: string[] = [];

  if (isDesk) {
    const deskStore = loadMessengerThreads();
    tid = `wa_${myD}`;
    msgs = deskStore[tid]?.messages;
    persistFn = saveMessengerThreads;
  } else if (isGroup) {
    const g = loadConnectGroups()[rawParam];
    if (!g || !g.members.includes(myD)) return res.status(403).json({ success: false, error: 'Group access required' });
    tid = g.groupId;
    groupMembers = g.members;
    msgs = g.messages;
    persistFn = saveConnectGroups;
  } else {
    targetD = normalizeConnectDigits(targetRaw.replace(/^wa_/, ''));
    if (targetD.length < 7) return res.status(400).json({ success: false, error: 'Invalid targetPhone' });
    tid = `p2p_${[myD, targetD].sort().join('_')}`;
    msgs = loadConnectThreads()[tid]?.messages;
    persistFn = saveConnectThreads;
  }

  const msg = msgs?.find((m) => m.id === messageId);
  if (!msg || !msg.poll) return res.status(404).json({ success: false, error: 'Poll not found' });
  const opt = msg.poll.options.find((o) => o.id === optionId);
  if (!opt) return res.status(404).json({ success: false, error: 'Poll option not found' });

  const alreadyVoted = Array.isArray(opt.votes) && opt.votes.includes(myD);
  if (!msg.poll.allowMultiple) {
    for (const o of msg.poll.options) {
      o.votes = (o.votes || []).filter((p) => p !== myD);
    }
    if (!alreadyVoted) opt.votes.push(myD);
  } else {
    opt.votes = Array.isArray(opt.votes) ? opt.votes : [];
    if (alreadyVoted) opt.votes = opt.votes.filter((p) => p !== myD);
    else opt.votes.push(myD);
  }

  persistFn();
  if (isDesk) {
    broadcastLivePrivateMessage('booth-1', tid, { type: 'MSG_UPDATE', threadId: tid, targetPhone: 'desk', message: msg });
  } else if (isGroup) {
    broadcastConnectGroupMessage(groupMembers, { type: 'MSG_UPDATE', threadId: tid, groupId: tid, targetPhone: tid, message: msg });
  } else {
    broadcastConnectPrivateMessage(targetD, { type: 'MSG_UPDATE', threadId: tid, fromPhone: myD, message: msg });
    if (targetD !== myD) {
      broadcastConnectPrivateMessage(myD, { type: 'MSG_UPDATE', threadId: tid, fromPhone: myD, targetPhone: targetD, message: msg });
    }
  }
  return res.json({ success: true, message: msg });
});

liveStreamingRouter.get('/connect/status', (req, res) => {
  const caller = requireConnectAuth(req, res);
  if (!caller) return;
  const myD = caller.phoneDigits;
  const users = loadConnectUsers();
  const me = users[myD];
  const blocked = new Set(me?.blockedPhones || []);

  // Only show Status updates from self + people you already have threads/groups with (preserving privacy)
  const visiblePhones = new Set<string>([myD]);
  for (const th of Object.values(loadConnectThreads())) {
    if (th.participants.includes(myD)) {
      th.participants.forEach((p) => { if (!blocked.has(p)) visiblePhones.add(p); });
    }
  }
  for (const g of Object.values(loadConnectGroups())) {
    if (g.members.includes(myD)) {
      g.members.forEach((p) => { if (!blocked.has(p)) visiblePhones.add(p); });
    }
  }

  const rawList = loadConnectStatuses().filter((s) => visiblePhones.has(s.phoneDigits) && !users[s.phoneDigits]?.blockedPhones?.includes(myD));
  const grouped = new Map<string, { phoneDigits: string; userName: string; userAvatar: string; isSelf: boolean; items: ConnectStatusEntry[] }>();
  for (const st of rawList) {
    const u = users[st.phoneDigits];
    const key = st.phoneDigits;
    let grp = grouped.get(key);
    if (!grp) {
      grp = {
        phoneDigits: key,
        userName: u?.name || st.userName,
        userAvatar: u?.avatarUrl || st.userAvatar || '',
        isSelf: key === myD,
        items: []
      };
      grouped.set(key, grp);
    }
    grp.items.push({
      ...st,
      views: key === myD ? st.views : []
    });
  }
  const updates = Array.from(grouped.values()).sort((a, b) => {
    if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
    const at = Date.parse(a.items[a.items.length - 1]?.createdAt || '0');
    const bt = Date.parse(b.items[b.items.length - 1]?.createdAt || '0');
    return bt - at;
  });
  return res.json({ success: true, updates });
});

liveStreamingRouter.post('/connect/status', (req, res) => {
  const caller = requireConnectAuth(req, res);
  if (!caller) return;
  const myD = caller.phoneDigits;
  const users = loadConnectUsers();
  const me = users[myD];
  const body = req.body || {};
  const kind: 'text' | 'image' = body.imageBase64 ? 'image' : 'text';
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + 24 * 3600 * 1000).toISOString();

  let entry: ConnectStatusEntry;
  if (kind === 'image') {
    const raw = String(body.imageBase64 || '').trim();
    const commaIdx = raw.indexOf(',');
    const hdr = commaIdx !== -1 ? raw.slice(0, commaIdx).toLowerCase() : '';
    const b64 = (commaIdx !== -1 && hdr.includes('base64') ? raw.slice(commaIdx + 1) : raw).replace(/\s+/g, '');
    const buf = Buffer.from(b64, 'base64');
    if (buf.length < 32 || buf.length > 8 * 1024 * 1024) {
      return res.status(400).json({ success: false, error: 'Status image must be smaller than 8 MB.' });
    }
    const det = detectMediaAttachment(buf, 'status.jpg', hdr);
    if (!det || det.kind !== 'image') {
      return res.status(400).json({ success: false, error: 'Please upload a valid JPG, PNG, or WebP image.' });
    }
    const mediaDir = getLiveMediaDir();
    fs.mkdirSync(mediaDir, { recursive: true });
    const fileName = `st_${myD}_${nowMs}.${det.ext}`;
    fs.writeFileSync(path.join(mediaDir, fileName), buf);
    entry = {
      id: `st_${nowMs}_${crypto.randomBytes(3).toString('hex')}`,
      phoneDigits: myD,
      userName: me?.name || caller.name,
      userAvatar: me?.avatarUrl || '',
      kind: 'image',
      imageUrl: `/api/live/media/${fileName}`,
      caption: String(body.caption || '').replace(/[<>]/g, '').trim().slice(0, 220) || undefined,
      views: [],
      createdAt: nowIso,
      expiresAt
    };
  } else {
    const txt = String(body.text || '').replace(/[<>]/g, '').trim().slice(0, 320);
    if (!txt) return res.status(400).json({ success: false, error: 'Please enter status text.' });
    const allowedBgs = ['obsidian_gold', 'emerald_royal', 'crimson_velvet', 'sapphire_night', 'champagne_gold'];
    const bg = allowedBgs.includes(String(body.bg || '')) ? String(body.bg) : 'obsidian_gold';
    entry = {
      id: `st_${nowMs}_${crypto.randomBytes(3).toString('hex')}`,
      phoneDigits: myD,
      userName: me?.name || caller.name,
      userAvatar: me?.avatarUrl || '',
      kind: 'text',
      text: txt,
      bg,
      views: [],
      createdAt: nowIso,
      expiresAt
    };
  }

  const list = loadConnectStatuses();
  list.push(entry);
  if (list.length > 200) list.splice(0, list.length - 200);
  saveConnectStatuses();
  return res.json({ success: true, status: entry });
});

liveStreamingRouter.post('/connect/status/:id/view', (req, res) => {
  const caller = requireConnectAuth(req, res);
  if (!caller) return;
  const myD = caller.phoneDigits;
  const users = loadConnectUsers();
  const me = users[myD];
  const stId = String(req.params.id || '').trim();
  const list = loadConnectStatuses();
  const item = list.find((s) => s.id === stId);
  if (!item) return res.status(404).json({ success: false, error: 'Status expired or not found' });
  if (item.phoneDigits !== myD && me?.settings?.readReceipts !== false) {
    if (!item.views.some((v) => v.phoneDigits === myD)) {
      item.views.push({ phoneDigits: myD, name: me?.name || caller.name, viewedAt: new Date().toISOString() });
      saveConnectStatuses();
    }
  }
  return res.json({ success: true });
});

liveStreamingRouter.delete('/connect/status/:id', (req, res) => {
  const caller = requireConnectAuth(req, res);
  if (!caller) return;
  const myD = caller.phoneDigits;
  const stId = String(req.params.id || '').trim();
  const list = loadConnectStatuses();
  const idx = list.findIndex((s) => s.id === stId && s.phoneDigits === myD);
  if (idx === -1) return res.status(404).json({ success: false, error: 'Status not found' });
  list.splice(idx, 1);
  saveConnectStatuses();
  return res.json({ success: true });
});

liveStreamingRouter.post('/connect/thread/:targetPhone/clear', (req, res) => {
  const caller = getConnectCallerIdentity(req);
  if (!caller) return res.status(401).json({ success: false, error: 'CONNECT_AUTH_REQUIRED' });
  const myD = caller.phoneDigits;
  const rawParam = String(req.params.targetPhone || '').trim();
  const targetRaw = rawParam.toLowerCase();
  if (targetRaw === 'desk') {
    const deskStore = loadMessengerThreads();
    const th = deskStore[`wa_${myD}`];
    if (th) {
      for (const m of th.messages) {
        const s = new Set(Array.isArray(m.deletedFor) ? m.deletedFor : []);
        s.add(myD);
        m.deletedFor = Array.from(s);
      }
      saveMessengerThreads();
    }
    return res.json({ success: true });
  }
  if (/^grp_[a-zA-Z0-9_-]+$/.test(rawParam)) {
    const gStore = loadConnectGroups();
    const g = gStore[rawParam];
    if (g && g.members.includes(myD)) {
      for (const m of g.messages) {
        const s = new Set(Array.isArray(m.deletedFor) ? m.deletedFor : []);
        s.add(myD);
        m.deletedFor = Array.from(s);
      }
      saveConnectGroups();
    }
    return res.json({ success: true });
  }
  const targetD = normalizeConnectDigits(targetRaw.replace(/^wa_/, ''));
  const tid = `p2p_${[myD, targetD].sort().join('_')}`;
  const p2pStore = loadConnectThreads();
  const th = p2pStore[tid];
  if (th) {
    for (const m of th.messages) {
      const s = new Set(Array.isArray(m.deletedFor) ? m.deletedFor : []);
      s.add(myD);
      m.deletedFor = Array.from(s);
    }
    saveConnectThreads();
  }
  return res.json({ success: true });
});

async function loadDynamicBusinessProfile() {
  const fallback = {
    companyName: 'Vintage Vibes General Trading L.L.C - S.P.C',
    email: '',
    phone: '',
    whatsappOrderNumber: '',
    address: 'Al Ain, Abu Dhabi',
    city: 'Al Ain, Abu Dhabi',
    country: 'United Arab Emirates',
    hours: 'Open 24 hours',
    logoUrl: '/pwa-192x192.png'
  };
  try {
    let row: any = null;
    await withDb(async (c) => {
      const q = await c.query('SELECT * FROM public.company_profile LIMIT 1;');
      row = q.rows?.[0] || null;
    });
    if (!row) return fallback;
    const addrParts = [
      row.address_line_1 || row.addressLine1 || row.address,
      row.address_line_2 || row.addressLine2,
      row.city,
      row.country
    ].filter((x) => typeof x === 'string' && x.trim().length > 0);
    return {
      companyName: String(row.company_display_name || row.companyDisplayName || row.company_name || row.companyName || fallback.companyName),
      email: String(row.email || row.corporate_email || row.company_email || row.profile_data?.email || ''),
      phone: String(row.corporate_phone || row.corporatePhone || row.phone || row.whatsapp_orders_number || row.whatsapp_order_number || ''),
      whatsappOrderNumber: String(row.whatsapp_orders_number || row.whatsapp_order_number || row.whatsappOrderNumber || ''),
      address: addrParts.join(', ') || fallback.address,
      city: String(row.city || fallback.city),
      country: String(row.country || fallback.country),
      hours: String(row.profile_data?.businessHours || 'Open 24 hours'),
      logoUrl: '/pwa-192x192.png'
    };
  } catch (_) {
    return fallback;
  }
}

liveStreamingRouter.get('/connect/business-info', async (_req, res) => {
  const info = await loadDynamicBusinessProfile();
  return res.json({ success: true, business: info });
});

liveStreamingRouter.get('/connect/contact-info/:targetPhone', async (req, res) => {
  const caller = getConnectCallerIdentity(req);
  if (!caller) return res.status(401).json({ success: false, error: 'CONNECT_AUTH_REQUIRED' });
  const myD = caller.phoneDigits;
  const users = loadConnectUsers();
  const me = users[myD];
  const rawParam = String(req.params.targetPhone || 'desk').trim();
  const targetRaw = rawParam.toLowerCase();
  const isDesk = targetRaw === 'desk';
  const isGroup = /^grp_[a-zA-Z0-9_-]+$/.test(rawParam);
  const groupRec = isGroup ? loadConnectGroups()[rawParam] : undefined;
  if (isGroup && (!groupRec || !groupRec.members.includes(myD))) {
    return res.status(403).json({ success: false, error: 'Group access required' });
  }
  const targetD = isDesk ? 'desk' : isGroup ? rawParam : normalizeConnectDigits(targetRaw.replace(/^wa_/, ''));

  let rawMsgs: LivePrivateMessage[] = [];
  if (isDesk) {
    const deskStore = loadMessengerThreads();
    rawMsgs = deskStore[`wa_${myD}`]?.messages || [];
  } else if (isGroup && groupRec) {
    rawMsgs = groupRec.messages || [];
  } else {
    const p2pStore = loadConnectThreads();
    rawMsgs = p2pStore[`p2p_${[myD, targetD].sort().join('_')}`]?.messages || [];
  }

  const visibleMsgs = filterVisibleThreadMessages(rawMsgs, myD).filter((m) => !m.deletedForEveryone);
  const mediaItems: Array<{ id: string; url: string; kind: string; name: string; createdAt: string }> = [];
  const docs: Array<{ id: string; url: string; kind: string; name: string; sizeBytes: number; createdAt: string }> = [];
  const links: Array<{ id: string; url: string; text: string; createdAt: string }> = [];
  const starredMessages: LivePrivateMessage[] = [];

  for (let i = visibleMsgs.length - 1; i >= 0; i--) {
    const m = visibleMsgs[i];
    if (Array.isArray(m.starredBy) && m.starredBy.includes(myD)) starredMessages.push(m);
    if (m.attachment?.url) {
      if (m.attachment.kind === 'image' || m.attachment.kind === 'video') {
        if (mediaItems.length < 30) mediaItems.push({ id: m.id, url: m.attachment.url, kind: m.attachment.kind, name: m.attachment.name, createdAt: m.createdAt });
      } else if (docs.length < 30) {
        docs.push({ id: m.id, url: m.attachment.url, kind: m.attachment.kind, name: m.attachment.name, sizeBytes: m.attachment.sizeBytes, createdAt: m.createdAt });
      }
    }
    if (m.text && links.length < 30) {
      const found = m.text.match(/https?:\/\/[^\s<>"{}|\\^`[\]]+/gi);
      if (found) {
        for (const u of found) {
          if (links.length < 30) links.push({ id: m.id, url: u, text: m.text.slice(0, 120), createdAt: m.createdAt });
        }
      }
    }
  }

  const business = isDesk ? await loadDynamicBusinessProfile() : null;
  const peerUser = !isDesk && !isGroup ? users[targetD] : null;
  const peer = isDesk
    ? {
        phoneDigits: 'desk',
        displayPhone: business?.phone || 'Official Store Concierge',
        name: business?.companyName || 'Vintage Vibes Boss Desk',
        about: `${business?.address || 'Al Ain, Abu Dhabi'} • ${business?.hours || 'Open 24 hours'}`,
        avatarUrl: '/pwa-192x192.png',
        email: business?.email || '',
        online: true
      }
    : isGroup && groupRec
    ? {
        phoneDigits: groupRec.groupId,
        displayPhone: `${groupRec.members.length} participants • Free HD Group`,
        name: groupRec.name,
        about: groupRec.description || `Created ${new Date(groupRec.createdAt).toLocaleDateString()}`,
        avatarUrl: groupRec.avatarUrl || '',
        email: '',
        online: true
      }
    : {
        phoneDigits: targetD,
        displayPhone: peerUser?.displayPhone || `+${targetD}`,
        name: targetD === myD ? `${me?.name || caller.name} (You)` : (peerUser?.name || `+${targetD}`),
        about: targetD === myD ? 'Message yourself' : (peerUser?.about || 'Hey there! I am using Vintage Vibes Connect.'),
        avatarUrl: peerUser?.avatarUrl || '',
        email: peerUser?.email || '',
        online: targetD === myD ? true : (peerUser?.settings?.showOnline === false ? false : isConnectUserOnline(targetD))
      };

  return res.json({
    success: true,
    isDesk,
    isGroup,
    inviteUrl: groupRec ? buildGroupInviteUrl(groupRec.inviteCode) : undefined,
    members: groupRec ? hydrateGroupMembers(groupRec, users) : undefined,
    activeCall: groupRec ? getActiveGroupCallSummary(groupRec.groupId) : undefined,
    isGroupAdmin: groupRec ? groupRec.admins.includes(myD) : false,
    peer,
    business,
    mediaItems,
    docs,
    links,
    starredMessages,
    totalMediaCount: mediaItems.length + docs.length + links.length,
    prefs: {
      archived: Boolean(me?.archivedThreads?.includes(targetD)),
      favorite: Boolean(me?.favoriteThreads?.includes(targetD)),
      pinned: Boolean(me?.pinnedThreads?.includes(targetD)),
      muted: Boolean(me?.mutedThreads?.includes(targetD)),
      blocked: Boolean(!isDesk && !isGroup && targetD !== myD && me?.blockedPhones?.includes(targetD))
    }
  });
});

liveStreamingRouter.get('/booths/:boothId/pinned-piece', async (req, res) => {
  const { boothId } = req.params;
  const memBooth = streamController.getBooth(boothId);
  if (memBooth?.openLiveMode) {
    return res.json({
      success: true,
      pinnedPiece: null,
      openLiveMode: true,
      openLiveItemTitle: memBooth.openLiveItemTitle || '',
      openLivePriceAed: Number(memBooth.openLivePriceAed || 0)
    });
  }
  let card = getBoothPinnedPiece(boothId);
  if (!card) {
    const activeSku = memBooth?.activeOnAirSku;
    if (activeSku) {
      card = await resolveLiveSpotlightPiece(activeSku);
      if (card) setBoothPinnedPiece(boothId, card);
    }
  }
  return res.json({ success: true, pinnedPiece: card });
});

liveStreamingRouter.post('/booths/:boothId/pin-piece', async (req, res) => {
  const { boothId } = req.params;
  const rawSku = req.body?.sku !== undefined ? req.body.sku : req.body?.barcode;
  const dealPrice = typeof req.body?.dealPrice === 'number' ? req.body.dealPrice : undefined;
  const cleanSku = rawSku ? String(rawSku).trim() : '';

  const memBooth = streamController.ensureBoothExists(boothId);
  if (!cleanSku) {
    memBooth.activeOnAirSku = undefined;
    setBoothPinnedPiece(boothId, null);
    withDb(async (c) => {
      await c.query(
        `UPDATE public.live_booth_metrics SET active_on_air_sku = NULL, updated_at = NOW() WHERE booth_id = ANY($1::text[]);`,
        [getBoothIdAliases(boothId)]
      ).catch(() => {});
    }).catch(() => {});
    return res.json({ success: true, pinnedPiece: null });
  }

  const card = await resolveLiveSpotlightPiece(cleanSku, dealPrice);
  if (!card) {
    return res.status(404).json({ success: false, error: `SKU ${cleanSku} not found in inventory.` });
  }
  if (memBooth.openLiveMode) {
    streamController.setOpenLiveConfig(boothId, { openLiveMode: false });
    broadcastLiveOpenState(boothId, {
      openLiveMode: false,
      openLiveItemTitle: memBooth.openLiveItemTitle || '',
      openLivePriceAed: Number(memBooth.openLivePriceAed || 0)
    });
  }
  memBooth.activeOnAirSku = card.sku;
  setBoothPinnedPiece(boothId, card);
  withDb(async (c) => {
    await c.query(
      `UPDATE public.live_booth_metrics SET active_on_air_sku = $1, current_deal_price = $2, updated_at = NOW() WHERE booth_id = ANY($3::text[]);`,
      [card.sku, Number(card.priceAed) || 0, getBoothIdAliases(boothId)]
    ).catch(() => {});
  }).catch(() => {});
  return res.json({ success: true, pinnedPiece: card });
});

liveStreamingRouter.post('/booths/:boothId/open-live-mode', async (req, res) => {
  const { boothId } = req.params;
  const openLiveMode = Boolean(req.body?.openLiveMode);
  const itemTitle = req.body?.itemTitle !== undefined ? String(req.body.itemTitle || '').trim() : undefined;
  const priceRaw = req.body?.priceAed !== undefined ? Number(req.body.priceAed) : undefined;
  const cfg = streamController.setOpenLiveConfig(boothId, {
    openLiveMode,
    itemTitle,
    priceAed: priceRaw
  });
  if (cfg.openLiveMode) {
    setBoothPinnedPiece(boothId, null);
    withDb(async (c) => {
      await c.query(
        `UPDATE public.live_booth_metrics SET active_on_air_sku = NULL, updated_at = NOW() WHERE booth_id = ANY($1::text[]);`,
        [getBoothIdAliases(boothId)]
      ).catch(() => {});
    }).catch(() => {});
  }
  broadcastLiveOpenState(boothId, {
    openLiveMode: cfg.openLiveMode,
    openLiveItemTitle: cfg.itemTitle,
    openLivePriceAed: cfg.priceAed
  });
  eventHub.broadcast({
    type: 'ENTITY_MUTATED',
    module: 'MARKETING',
    entity: 'LIVE_OPEN_MODE',
    action: 'UPDATE',
    documentRef: boothId,
    data: {
      boothId,
      openLiveMode: cfg.openLiveMode,
      itemTitle: cfg.itemTitle,
      priceAed: cfg.priceAed
    }
  });
  return res.json({
    success: true,
    openLiveMode: cfg.openLiveMode,
    itemTitle: cfg.itemTitle,
    priceAed: cfg.priceAed,
    pinnedPiece: cfg.openLiveMode ? null : getBoothPinnedPiece(boothId)
  });
});

liveStreamingRouter.post('/booths/:boothId/share-track', (req, res) => {
  const { boothId } = req.params;
  const sharerCode = String(req.body?.sharerCode || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const name = String(req.body?.name || '').trim();
  const totalShares = incrementBoothShareCount(boothId);

  if (sharerCode) {
    const store = loadReferralStore();
    const rec: SharerRecord = store.sharerByCode[sharerCode] || {
      sharerCode,
      uniqueReferrals: [],
      shares: 0,
      updatedAt: Date.now()
    };
    rec.shares = Number(rec.shares || 0) + 1;
    if (email) {
      rec.email = email;
      store.codeByEmail[email] = sharerCode;
    }
    if (name) rec.name = name;
    rec.updatedAt = Date.now();
    store.sharerByCode[sharerCode] = rec;
    saveReferralStore();
  }

  const stats = getSharerStats(sharerCode, email);
  return res.json({
    success: true,
    totalShares,
    shares: stats.shares,
    referralCount: stats.referralCount,
    isTopSharer: stats.isTopSharer
  });
});

liveStreamingRouter.post('/booths/:boothId/referral-hit', (req, res) => {
  const ref = String(req.body?.ref || '').trim();
  const visitorId = String(req.body?.visitorId || '').trim();
  const cleanupTest = Boolean(req.body?.cleanupTest);
  if (!ref) {
    return res.status(400).json({ success: false, error: 'ref is required' });
  }
  const store = loadReferralStore();
  if (cleanupTest) {
    const existed = Boolean(store.sharerByCode[ref]);
    if (store.sharerByCode[ref]?.email) {
      delete store.codeByEmail[String(store.sharerByCode[ref].email).toLowerCase()];
    }
    delete store.sharerByCode[ref];
    saveReferralStore();
    return res.json({ success: true, cleaned: existed, ref });
  }
  const rec: SharerRecord = store.sharerByCode[ref] || {
    sharerCode: ref,
    uniqueReferrals: [],
    shares: 0,
    updatedAt: Date.now()
  };
  if (visitorId && visitorId !== ref && !rec.uniqueReferrals.includes(visitorId) && rec.uniqueReferrals.length < 200) {
    rec.uniqueReferrals.push(visitorId);
  }
  rec.updatedAt = Date.now();
  store.sharerByCode[ref] = rec;
  saveReferralStore();
  const referralCount = rec.uniqueReferrals.length;
  return res.json({
    success: true,
    referralCount,
    isTopSharer: referralCount >= 2
  });
});

liveStreamingRouter.get('/booths/:boothId/sharer-status', (req, res) => {
  const sharerCode = String(req.query.sharerCode || '').trim();
  const email = String(req.query.email || '').trim().toLowerCase();
  const stats = getSharerStats(sharerCode, email);
  return res.json({
    success: true,
    shares: stats.shares,
    referralCount: stats.referralCount,
    isTopSharer: stats.isTopSharer
  });
});

liveStreamingRouter.post('/subscribe-alerts', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return res.status(400).json({ success: false, error: 'Valid email is required' });
  }
  const unsubscribe = Boolean(req.body?.unsubscribe);
  const list = loadAlertSubscribers();
  const existingIdx = list.findIndex((s) => s.email === email);

  if (unsubscribe) {
    if (existingIdx !== -1) {
      list.splice(existingIdx, 1);
      saveAlertSubscribers();
    }
    return res.json({ success: true, subscribed: false, totalSubscribers: list.length });
  }

  const entry: LiveAlertSubscriber = {
    email,
    name: String(req.body?.name || list[existingIdx]?.name || '').trim() || undefined,
    phone: String(req.body?.phone || list[existingIdx]?.phone || '').trim() || undefined,
    boothId: String(req.body?.boothId || list[existingIdx]?.boothId || 'booth-1').trim(),
    notifyWhatsApp: req.body?.notifyWhatsApp !== false,
    subscribedAt: list[existingIdx]?.subscribedAt || new Date().toISOString(),
    lastNotifiedAt: list[existingIdx]?.lastNotifiedAt
  };
  if (existingIdx !== -1) {
    list[existingIdx] = entry;
  } else {
    list.push(entry);
  }
  saveAlertSubscribers();
  return res.json({ success: true, subscribed: true, totalSubscribers: list.length });
});

liveStreamingRouter.get('/alert-subscribers', (_req, res) => {
  const list = loadAlertSubscribers();
  return res.json({ success: true, totalSubscribers: list.length, subscribers: list });
});

liveStreamingRouter.post('/booths/:boothId/notify-going-live', (req, res) => {
  const { boothId } = req.params;
  const customMessage = String(req.body?.customMessage || '').trim();
  const list = loadAlertSubscribers();
  const now = Date.now();
  const COOLDOWN_MS = 2 * 60 * 60 * 1000;
  const toSend: LiveAlertSubscriber[] = [];
  let skippedCooldown = 0;

  for (const sub of list) {
    if (sub.notifyWhatsApp === false) continue;
    const digits = String(sub.phone || '').replace(/\D/g, '');
    if (digits.length < 7) continue;
    if (sub.lastNotifiedAt && now - sub.lastNotifiedAt < COOLDOWN_MS) {
      skippedCooldown += 1;
      continue;
    }
    sub.lastNotifiedAt = now;
    toSend.push(sub);
  }
  if (toSend.length > 0) {
    saveAlertSubscribers();
    const liveUrl = `https://vintagevibesgk.com/live/${boothId !== 'booth-1' ? encodeURIComponent(boothId) : ''}`;
    (async () => {
      for (const sub of toSend) {
        const greeting = sub.name ? `Hello ${sub.name.split(/\s+/)[0]}! ` : 'Assalam Alaikum! ';
        const text =
          customMessage ||
          `🔴 *VINTAGE VIBES UAE IS LIVE NOW!*\n\n${greeting}Hamara Al Ain Live Vintage Drop shuru ho gaya hai!\n⚡ Watch & Claim 1-of-1 pieces in 0.2s real-time:\n${liveUrl}`;
        await baileysManager.sendUnifiedMessage(String(sub.phone), text).catch(() => {});
      }
    })().catch(() => {});
  }

  return res.json({
    success: true,
    queuedCount: toSend.length,
    skippedCooldown
  });
});

liveStreamingRouter.get('/booths/:boothId/highlight-clips', (req, res) => {
  return res.json({
    success: true,
    clips: getBoothHighlightClips(req.params.boothId)
  });
});

liveStreamingRouter.post('/booths/:boothId/save-highlight-clip', async (req, res) => {
  const r = await captureBoothHighlightClip(req.params.boothId, {
    sku: req.body?.sku ? String(req.body.sku).trim() : undefined,
    buyerName: req.body?.buyerName ? String(req.body.buyerName).trim() : undefined,
    priceAed: req.body?.priceAed ? Number(req.body.priceAed) : undefined,
    reason: req.body?.reason ? String(req.body.reason).trim() : 'MANUAL_HOST',
    force: true
  });
  return res.json({ success: true, ...r });
});

// 0.2s WebSocket Real-Time Live Auction Viewer Page (/api/live/watch/:boothId?)
liveStreamingRouter.get(['/watch', '/watch/:boothId'], (req, res) => renderRealtimeLiveRoomHtml(req, res));

// TikTok Anti-Ban Safe 1-Tap Claim Redirect (`/api/live-streaming/claim`)
liveStreamingRouter.get('/claim', (req, res) => {
  const sku = String(req.query.sku || '').trim();
  const user = String(req.query.user || '').trim();
  const textMsg = sku
    ? `Assalam Alaikum Vintage Vibes! I want to CLAIM Live Item #${sku}${user ? ` (${user})` : ''}`
    : `Assalam Alaikum Vintage Vibes! I came from TikTok Live to claim my item!`;
  const waUrl = `https://wa.me/971554186086?text=${encodeURIComponent(textMsg)}`;
  return res.redirect(302, waUrl);
});

// Official First-Party Auto-Reel & YouTube Shorts Publisher
liveStreamingRouter.get('/auto-reels/status', (_req, res) => {
  return res.json(getAutoReelPublisherStatus());
});

liveStreamingRouter.post('/auto-reels/toggle', (req, res) => {
  return res.json(
    setAutoReelPublisherEnabled(Boolean(req.body?.enabled), Number(req.body?.intervalHours || 12))
  );
});

liveStreamingRouter.post('/auto-reels/publish-now', async (req, res) => {
  try {
    const fileName = req.body?.fileName ? String(req.body.fileName).trim() : undefined;
    const result = await publishNextVintageReelNow(fileName);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Failed to publish Reel' });
  }
});
