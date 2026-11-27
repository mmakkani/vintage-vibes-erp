import https from 'https';
import fs from 'fs';
import path from 'path';
import { streamController } from '../../server/streamController.ts';
import { relationalStore } from '../../db/relationalStore.ts';
import { eventHub } from '../../server/events.ts';
import { getPgClient } from '../../db/pgPool.ts';
import { decryptCredential } from '../../utils/encryption.ts';
import { tikTokSocketService } from '../../server/tiktokSocketService.ts';
import { youTubeChatService } from './youtubeChatService.ts';
import { liveStreamAgentService } from '../marketing/liveStreamAgent.service.ts';
import { liveStreamOrchestratorService } from '../marketing/liveStreamOrchestrator.service.ts';
import { marketingService } from '../marketing/marketing.service.ts';
import {
  getActiveBoothFacebookSession,
  getActiveBoothSecondaryFacebookSession,
  getBoothPinnedPiece
} from './rtmpRelayServer.ts';
import {
  parseLiveClaimDetails,
  shouldHandleAsOpenLiveClaim,
  resolveOpenClaimPriceAndTitle,
  executeOpenLiveClaim,
  canSendNeedPricePrompt,
  buildNeedPriceReply,
  buildUnderBidReply
} from './openLiveClaimHelper.ts';
import { loadDeskMarketingConfig } from './deskMarketingConfig.ts';

export type SocialPlatformKey = 'tiktok' | 'instagram' | 'facebook' | 'youtube' | 'threads' | 'custom';

interface BoothSocialPollerState {
  boothId: string;
  running: boolean;
  timer: NodeJS.Timeout | null;
  startedAt: number;
  seenMessageIds: Set<string>;
  facebookConfig?: { liveVideoId?: string; videoId?: string; fbTargetId?: string; accessToken: string };
  facebookPageConfig?: {
    liveVideoId?: string;
    videoId?: string;
    fbTargetId: string;
    accessToken: string;
    lastDiscoverAt?: number;
    consecutiveFailures?: number;
  };
  instagramConfig?: { liveMediaId?: string; igUserId?: string; accessToken: string };
  threadsConfig?: { mediaId?: string; accessToken: string };
  customConfig?: { chatPollUrl?: string; apiKey?: string };
  fbLastPollAt?: number;
  fbLastOkAt?: number;
  fbLastDiscoverAt?: number;
  fbLastCommentAt?: number;
  fbLastError?: string;
  fbLastErrorLogAt?: number;
  fbCommentsIngested?: number;
  fbConsecutiveFailures?: number;
}

async function fetchFacebookGraphJson(
  urlStr: string,
  timeoutMs = 5000,
  preferIpv4Https = false
): Promise<{ ok: boolean; status: number; data: any; error?: string }> {
  const httpsGetIpv4 = () =>
    new Promise<{ ok: boolean; status: number; data: any; error?: string }>((resolve) => {
      try {
        const u = new URL(urlStr);
        const req = https.get(
          {
            hostname: u.hostname,
            port: u.port || 443,
            path: u.pathname + u.search,
            family: 4,
            agent: false,
            timeout: timeoutMs,
            headers: {
              Connection: 'close',
              'User-Agent': 'VintageVibe-SocialChat/1.0'
            }
          },
          (res) => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
              body += chunk;
            });
            res.on('end', () => {
              const status = res.statusCode || 0;
              let data: any = null;
              try {
                data = body ? JSON.parse(body) : null;
              } catch (_) {}
              const ok = status >= 200 && status < 300;
              const error = ok ? undefined : data?.error?.message || `HTTP ${status}`;
              resolve({ ok, status, data, error });
            });
          }
        );
        req.on('timeout', () => {
          req.destroy(new Error(`HTTPS IPv4 timeout after ${timeoutMs}ms`));
        });
        req.on('error', (err) => {
          resolve({ ok: false, status: 0, data: null, error: err?.message || 'HTTPS IPv4 error' });
        });
      } catch (err: any) {
        resolve({ ok: false, status: 0, data: null, error: err?.message || 'Invalid URL' });
      }
    });

  if (preferIpv4Https) {
    return await httpsGetIpv4();
  }

  try {
    const res = await fetch(urlStr, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Connection: 'close' }
    });
    const data: any = await res.json().catch(() => null);
    if (res.ok) {
      return { ok: true, status: res.status, data };
    }
    return {
      ok: false,
      status: res.status,
      data,
      error: data?.error?.message || `HTTP ${res.status}`
    };
  } catch (_) {
    // Fallback to native non-pooled IPv4 HTTPS when undici/IPv6 stalls on a half-open socket
    return await httpsGetIpv4();
  }
}

function getBoothAliases(boothId: string): string[] {
  const raw = String(boothId || 'booth-1').trim().toLowerCase();
  const m = raw.match(/^booth[-_]?0*(\d+)$/i);
  if (m) {
    const n = parseInt(m[1], 10);
    const p = n < 10 ? `0${n}` : `${n}`;
    return [`booth-${n}`, `booth-${p}`, `booth_${n}`, `booth_${p}`];
  }
  return [raw];
}

function normalizeBoothId(boothId?: string): string {
  const raw = String(boothId || 'booth-1').trim().toLowerCase();
  const num = parseInt(raw.replace(/^booth[-_]?0*/i, ''), 10) || 1;
  return `booth-${num}`;
}

function isSelfOrBotChatMessage(username: string, text: string): boolean {
  const cleanUser = String(username || '').trim();
  const cleanText = String(text || '').trim();
  if (
    /Auto-Claim Bot|VintageVibesHost|Vintage Vibes Host|VintageVibesLLCSPC|Vintage\s*Vibes\s*LLC|VintageVibes\s*Clo|Vintage\s*Vibes\s*Official|Vintage\s*Vibes\s*Al\s*Ain|Vintage\s*Vibes\s*UAE/i.test(
      cleanUser
    )
  ) {
    return true;
  }
  if (
    /^🎉\s*(SOLD|Congratulations)|Guaranteed Lock Confirmed|📲\s*WhatsApp AI:|🔗\s*Instant Checkout:|vintagevibesgk\.com\/claim|Tap Link in Profile Bio|VV-90S-8920|Carhartt WIP.*Detroit/i.test(
      cleanText
    )
  ) {
    return true;
  }
  return false;
}

class SocialChatService {
  private boothPollers: Map<string, BoothSocialPollerState> = new Map();
  private globalSeenWebhookIds: Set<string> = new Set();
  private lastAutoHealAt: Map<string, number> = new Map();
  private connectInFlight: Map<string, Promise<{ boothId: string; activeListeners: string[] }>> = new Map();

  /**
   * Unified real-time comment processor & NLP Auto-Claim engine for all 5 social platforms
   * (TikTok, Instagram, Facebook, YouTube, Threads / Custom)
   */
  public async processIncomingSocialComment(params: {
    boothId?: string;
    platform: SocialPlatformKey;
    username: string;
    commentText: string;
    externalMessageId?: string;
    avatarUrl?: string;
  }): Promise<{
    success: boolean;
    duplicate?: boolean;
    comment?: any;
    isClaim?: boolean;
    claimedSku?: string;
    draftInvoice?: any;
  }> {
    const boothId = normalizeBoothId(params.boothId);
    const cleanText = String(params.commentText || '').trim();
    if (!cleanText) {
      return { success: false };
    }

    if (params.externalMessageId) {
      const dedupKey = `${params.platform}:${params.externalMessageId}`;
      if (this.globalSeenWebhookIds.has(dedupKey)) {
        return { success: true, duplicate: true };
      }
      this.globalSeenWebhookIds.add(dedupKey);
      if (this.globalSeenWebhookIds.size > 5000) {
        const first = this.globalSeenWebhookIds.values().next().value;
        if (first) this.globalSeenWebhookIds.delete(first);
      }
    }

    const rawUser = String(params.username || 'Viewer').trim();
    const username = rawUser.startsWith('@') ? rawUser : `@${rawUser}`;
    const mappedPlatform: 'tiktok' | 'instagram' | 'facebook' | 'youtube' | 'custom' =
      params.platform === 'threads' ? 'custom' : params.platform;

    // Suppress external Graph API / Scraper self-echoes of our own Page/Profile comments
    // ("@VintageVibes Clo", "📢 JOIN VIP WHATSAPP...", "🎉 Congratulations...") so 1 host broadcast never eats 3 slots!
    if (
      isSelfOrBotChatMessage(username, cleanText) ||
      /^📢\s*JOIN\s+VIP\s+WHATSAPP/i.test(cleanText)
    ) {
      return { success: true, duplicate: true };
    }

    // Suppress duplicate masked "@Facebook Viewer" Graph API echo if headless_fb_live_names already
    // delivered the exact same Facebook comment text with the buyer's real name within the last 45s!
    if (mappedPlatform === 'facebook' && /^@?facebook\s*viewer$/i.test(username)) {
      const existingBooth = streamController.getBooth(boothId);
      const recentComments = (existingBooth?.comments || []).slice(0, 30);
      const normIncoming = cleanText.toLowerCase().replace(/\s+/g, ' ');
      const alreadyRealNamed = recentComments.some(
        (c: any) =>
          c?.platform === 'facebook' &&
          !/^@?facebook\s*viewer$/i.test(String(c?.username || '')) &&
          !/vintage\s*vibes/i.test(String(c?.username || '')) &&
          String(c?.comment || '').trim().toLowerCase().replace(/\s+/g, ' ') === normIncoming
      );
      if (alreadyRealNamed) {
        return { success: true, duplicate: true };
      }
    }

    console.log(`[SocialChat:${params.platform.toUpperCase()}] 💬 [${username}] (${boothId}): "${cleanText}"`);

    // 1. Add comment to StreamController (emits instant SSE LIVE_COMMENT to studio & mobile host screens)
    const newComment = streamController.addComment(
      boothId,
      cleanText,
      mappedPlatform,
      username,
      params.externalMessageId ? `${params.platform}:${params.externalMessageId}` : undefined
    );
    if ((newComment as any).__duplicate) {
      return { success: true, duplicate: true };
    }
    if (params.avatarUrl) {
      newComment.avatarUrl = params.avatarUrl;
    }
    if (params.platform === 'threads') {
      newComment.badge = 'THREADS';
    }

    // 2. Real-Time NLP Auto-Claim Engine (STRICTLY ONLY genuine "CLAIM" or "MINE" commands, never self/bot echoes)
    const isSelfOrBot = isSelfOrBotChatMessage(username, cleanText);
    const isClaim =
      !isSelfOrBot &&
      Boolean(newComment.isClaimIntent && streamController.isGenuineClaimMessage(cleanText, username));

    let claimedSku: string | undefined;
    let draftInvoice: any = null;

    if (isClaim) {
      const boothSession = streamController.getBooth(boothId);
      const pinnedCard = getBoothPinnedPiece(boothId);
      const parsedClaim = parseLiveClaimDetails(cleanText, newComment.extractedSku);
      const isOpenLiveClaim = shouldHandleAsOpenLiveClaim({
        boothSession,
        parsed: parsedClaim,
        pinnedTitle: pinnedCard?.title
      });

      if (isOpenLiveClaim) {
        const resolvedOpen = resolveOpenClaimPriceAndTitle(parsedClaim, boothSession);
        const { priceAed, itemTitle, priceSource } = resolvedOpen;
        if (resolvedOpen.rejectedUnderBid && resolvedOpen.offeredPriceAed !== undefined) {
          if (canSendNeedPricePrompt(boothId, username)) {
            const underBidText = buildUnderBidReply(
              username,
              resolvedOpen.offeredPriceAed,
              resolvedOpen.requiredPriceAed,
              itemTitle
            );
            streamController.addComment(boothId, underBidText, mappedPlatform, '📢 Vintage Vibes Host');
            this.broadcastHostMessageToAllPlatforms(boothId, underBidText, '📢 Vintage Vibes Host', {
              replyToPlatform: params.platform,
              replyToCommentId: params.externalMessageId
            }).catch(() => {});
          }
        } else if (priceAed && priceAed > 0) {
          try {
            const openRes = await executeOpenLiveClaim({
              boothId,
              username,
              platform: params.platform,
              rawComment: cleanText,
              commentId: newComment.id,
              priceAed,
              itemTitle,
              priceSource
            });
            newComment.isClaimIntent = true;
            newComment.extractedSku = openRes.sku;
            newComment.isProcessed = true;
            claimedSku = openRes.sku;
            this.broadcastHostMessageToAllPlatforms(boothId, openRes.hostReplyText, '📢 Vintage Vibes Host', {
              replyToPlatform: params.platform,
              replyToCommentId: params.externalMessageId
            }).catch(() => {});
          } catch (openErr) {
            console.warn(`[SocialChat:${params.platform}] Open-live claim note:`, openErr);
          }
        } else if (canSendNeedPricePrompt(boothId, username)) {
          const needPriceText = buildNeedPriceReply(username);
          streamController.addComment(boothId, needPriceText, mappedPlatform, '📢 Vintage Vibes Host');
          this.broadcastHostMessageToAllPlatforms(boothId, needPriceText, '📢 Vintage Vibes Host', {
            replyToPlatform: params.platform,
            replyToCommentId: params.externalMessageId
          }).catch(() => {});
        }
        return {
          success: true,
          comment: newComment,
          isClaim,
          claimedSku,
          draftInvoice
        };
      }

      let targetSku = parsedClaim.extractedSku || pinnedCard?.sku || boothSession?.activeOnAirSku;

      if (!targetSku) {
        try {
          const client = await getPgClient();
          if (client) {
            try {
              const aliases = getBoothAliases(boothId);
              const mRes = await client.query(
                `SELECT COALESCE(m.active_on_air_sku, b.active_on_air_sku) AS active_sku
                 FROM public.live_stream_booths b
                 LEFT JOIN public.live_booth_metrics m ON b.booth_id = m.booth_id
                 WHERE b.booth_id = ANY($1::text[])
                   AND COALESCE(m.active_on_air_sku, b.active_on_air_sku) IS NOT NULL
                 LIMIT 1`,
                [aliases]
              ).catch(() => ({ rows: [] as any[] }));
              if (mRes.rows?.[0]?.active_sku) {
                targetSku = String(mRes.rows[0].active_sku).trim();
              }
            } finally {
              await client.end().catch(() => {});
            }
          }
        } catch (_) {}
      }

      if (targetSku) {
        try {
          const draftRes = relationalStore.draftLiveClaimInvoice({
            barcode: targetSku,
            buyerHandle: username,
            boothId,
            offeredPrice: newComment.extractedBid,
            channel: params.platform.toUpperCase()
          });

          if (draftRes.success && draftRes.piece) {
            newComment.isClaimIntent = true;
            newComment.extractedSku = targetSku;
            newComment.isProcessed = true;
            claimedSku = targetSku;
            draftInvoice = draftRes.draftInvoice;

            const piece = draftRes.piece;
            const price = Number(newComment.extractedBid || piece?.lockedPrice || piece?.retailPriceAed || 120);
            const invoiceNo = draftInvoice?.invoiceNo || `SLS-DRAFT-LIVE-${Date.now().toString().slice(-4)}`;
            const checkoutUrl = `https://vintagevibesgk.com/?checkout=${encodeURIComponent(targetSku)}`;
            const brandName = piece?.brandName || 'Vintage Archive';
            const itemName = piece?.itemName || 'Vintage Piece';
            const fullTitle = itemName.toLowerCase().includes(brandName.toLowerCase())
              ? itemName
              : `${brandName} ${itemName}`.trim();
            const sizeLabel = piece?.sizeScanned || 'L';
            const isTikTok = params.platform === 'tiktok';

            const hostReplyText = isTikTok
              ? `🎉 Congratulations @${username}! Piece #${targetSku} (${fullTitle}, Size ${sizeLabel}) LOCKED for AED ${price}! • Invoice: #${invoiceNo} • 🔗 Tap our Profile Bio Link or Check Inbox DM to confirm delivery!`
              : `🎉 Congratulations ${username}! Guaranteed Lock Confirmed for ${fullTitle} (Size: ${sizeLabel}) • SKU: ${targetSku} • Price: AED ${price} • Draft Invoice: #${invoiceNo} • 📲 Contact Our Official VIP Concierge: ${checkoutUrl}`;

            streamController.recordClaim(boothId, targetSku, price);
            streamController.markBuyerClaimCommentLocked(boothId, username, targetSku, newComment.id);

            // Add Official Reply from '📢 Vintage Vibes Host' directly into StreamController & multicast across ALL active live chats
            streamController.addComment(boothId, hostReplyText, mappedPlatform, '📢 Vintage Vibes Host');
            this.broadcastHostMessageToAllPlatforms(boothId, hostReplyText, '📢 Vintage Vibes Host', {
              replyToPlatform: params.platform,
              replyToCommentId: params.externalMessageId
            }).catch(() => {});

            // Synchronize reservation lock to PostgreSQL (only valid inventory_pieces columns)
            try {
              const client = await getPgClient();
              if (client) {
                await client.query(
                  `UPDATE public.inventory_pieces
                   SET status = 'RESERVED',
                       locked_by_buyer = $1,
                       locked_by_booth = $2,
                       lock_expires_at = $3,
                       updated_at = NOW()
                   WHERE LOWER(barcode) = LOWER($4) OR LOWER(sku) = LOWER($4);`,
                  [username, boothId, Date.now() + 120 * 60 * 1000, targetSku]
                );
                await client.end().catch(() => {});
              }
            } catch (_) {}

            // Sync with MarketingService (in-memory + PostgreSQL marketing_claim_logs + sales_invoices + WhatsApp Notification)
            const claimRecord = {
              id: `claim-${Date.now()}`,
              timestamp: new Date().toLocaleTimeString(),
              customerHandle: username,
              platform: (params.platform === 'threads' || params.platform === 'custom' ? 'youtube' : params.platform) as any,
              rawComment: cleanText,
              matchedKeyword: 'MINE/CLAIM',
              sku: targetSku,
              itemName: `${fullTitle} (Size ${sizeLabel})`,
              itemImage: piece?.frontImageUrl || '',
              priceAed: price,
              invoiceNo,
              status: 'LOCK_ACTIVE' as const,
              replyDispatched: hostReplyText,
              checkoutUrl,
              lockExpiresAt: Date.now() + 15 * 60 * 1000,
              boothId
            };
            marketingService.recordLiveStreamClaimAndNotifyWhatsApp(claimRecord, piece).catch(() => {});

            eventHub.broadcast({
              type: 'ENTITY_MUTATED',
              module: 'SALES',
              entity: 'LIVE_CLAIM',
              action: 'CREATE',
              documentRef: targetSku,
              data: {
                claimRecord,
                piece: draftRes.piece,
                draftInvoice: draftRes.draftInvoice,
                invoiceNo,
                priceAed: price,
                checkoutUrl,
                boothId,
                buyerHandle: username,
                platform: params.platform,
                source: `${params.platform.toUpperCase()}_LIVE_CHAT`
              }
            });
            // Trigger Live Stream Orchestrator "ITEM [SKU] SOLD!" overlay & AI Host buyer thank-you
            liveStreamOrchestratorService
              .triggerItemSoldAlert({
                sku: targetSku,
                buyerName: username,
                channel: params.platform.toUpperCase(),
                synthesizeAudio: true
              })
              .catch(() => {});
          }
        } catch (err) {
          console.warn(`[SocialChat:${params.platform}] Auto-claim note:`, err);
        }
      }
    } else if (
      !isSelfOrBot &&
      (process.env.ENABLE_LIVE_AI_CHAT_AUTOREPLY === '1' || loadDeskMarketingConfig().liveAiAutoReplyEnabled)
    ) {
      // 3. Route live buying questions across ALL channels (TikTok, YouTube, Instagram, Facebook, Threads, Custom) to FIFO AI Voice Host (opt-in only)
      liveStreamAgentService
        .ingestLiveStreamComment({
          boothId,
          platform: params.platform,
          username,
          commentText: cleanText
        })
        .then(res => {
          if (res?.isRelevantBuyingQuery && res?.spokenTextReply) {
            const safeSuffix = params.platform === 'tiktok'
              ? '• 🔗 Tap Link in Profile Bio to Claim!'
              : '• 🔗 Instant Checkout: vintagevibesgk.com/claim';
            const aiReplySafe = `${res.spokenTextReply} ${safeSuffix}`;
            streamController.addComment(boothId, aiReplySafe, mappedPlatform, '📢 Vintage Vibes Host');
            this.broadcastHostMessageToAllPlatforms(boothId, aiReplySafe, '📢 Vintage Vibes Host', {
              replyToPlatform: params.platform,
              replyToCommentId: params.externalMessageId
            }).catch(() => {});
          }
        })
        .catch(() => {});
    }

    return {
      success: true,
      comment: newComment,
      isClaim,
      claimedSku,
      draftInvoice
    };
  }

  /**
   * Automatically connect all 5 social platform chat listeners for a booth when broadcast starts
   */
  public async connectAllBoothPlatforms(rawBoothId: string): Promise<{
    boothId: string;
    activeListeners: string[];
  }> {
    const boothId = normalizeBoothId(rawBoothId);
    const existingInFlight = this.connectInFlight.get(boothId);
    if (existingInFlight) {
      return existingInFlight;
    }

    const promise = this.connectAllBoothPlatformsInner(boothId).finally(() => {
      if (this.connectInFlight.get(boothId) === promise) {
        this.connectInFlight.delete(boothId);
      }
    });
    this.connectInFlight.set(boothId, promise);
    return promise;
  }

  private async connectAllBoothPlatformsInner(boothId: string): Promise<{
    boothId: string;
    activeListeners: string[];
  }> {
    const aliases = getBoothAliases(boothId);
    const activeListeners: string[] = ['youtube'];

    // 1. Ensure YouTube Live Chat poller is active (untouched existing YouTube system)
    try {
      const ytStatus = youTubeChatService.getBoothChatStatus(boothId);
      if (!ytStatus.isConnected && !ytStatus.isSearching) {
        youTubeChatService.connectBoothToYouTubeChat(boothId).catch(() => {});
      }
    } catch (_) {}

    // 2. Load social channel credentials & tokens from PostgreSQL for TikTok, Instagram, Facebook, Threads/Custom
    let tiktokHandle = '';
    let fbConfig: BoothSocialPollerState['facebookConfig'] | undefined;
    let fbPageConfig: BoothSocialPollerState['facebookPageConfig'] | undefined;
    let igConfig: BoothSocialPollerState['instagramConfig'] | undefined;
    let thConfig: BoothSocialPollerState['threadsConfig'] | undefined;
    let customConfig: BoothSocialPollerState['customConfig'] | undefined;

    const hasRealTikTokKey = (val?: string): boolean => {
      const clean = String(val || '').trim();
      if (clean.length < 8 || clean.includes('•')) return false;
      const lower = clean.toLowerCase();
      return lower !== 'tt_key' && !lower.startsWith('re_live_sec_');
    };

    const client = await getPgClient();
    if (client) {
      try {
        const [chQ, boothQ, apiKeysQ] = await Promise.all([
          client.query(
            `SELECT booth_id, platform, account_username, account_password, auth_status, metadata, is_active, updated_at
             FROM public.booth_social_channels
             WHERE booth_id = ANY($1::text[]) AND is_active = true
             ORDER BY CASE WHEN booth_id = $2 THEN 0 ELSE 1 END, updated_at DESC NULLS LAST`,
            [aliases, boothId]
          ),
          client
            .query(
              `SELECT tiktok_stream_key, auto_relay_to_tiktok FROM public.live_stream_booths WHERE booth_id = ANY($1::text[]) LIMIT 1`,
              [aliases]
            )
            .catch(() => ({ rows: [] as any[] })),
          client
            .query(`SELECT platform, access_token, api_key, server_url FROM public.streaming_api_keys WHERE is_connected = true`)
            .catch(() => ({ rows: [] as any[] }))
        ]);

        const boothRow = boothQ.rows?.[0];
        const boothMem = streamController.getBooth(boothId);
        const apiKeyMap = new Map<string, any>();
        for (const r of apiKeysQ.rows || []) {
          apiKeyMap.set(String(r.platform || '').toLowerCase(), r);
        }

        for (const row of chQ.rows || []) {
          const plat = String(row.platform || '').toLowerCase();
          const username = String(row.account_username || '').trim();
          const decryptedSecret = decryptCredential(String(row.account_password || '').trim());
          const meta = row.metadata || {};
          const globalKey = apiKeyMap.get(plat);

          if (plat === 'tiktok') {
            if (!tiktokHandle) {
              const isLoggedIn = String(row.auth_status || '').toUpperCase() === 'LOGGED_IN';
              const metaStreamKey = decryptCredential(String(meta.streamKey || '').trim());
              const boothStreamKey = decryptCredential(String(boothRow?.tiktok_stream_key || '').trim());
              const destConnected = Boolean(
                boothMem?.destinations?.some(
                  (d: any) => d.platform === 'tiktok' && (d.isConnected === true || d.status === 'ONLINE')
                )
              );
              const hasValidUsername =
                Boolean(username) &&
                !username.includes('not_linked') &&
                !username.startsWith('@booth') &&
                !username.startsWith('@vintage_booth_');
              if (
                hasValidUsername &&
                (isLoggedIn || hasRealTikTokKey(metaStreamKey) || hasRealTikTokKey(boothStreamKey) || destConnected)
              ) {
                tiktokHandle = username;
              }
            }
          } else if (plat === 'facebook') {
            const rawFbToken = String(
              meta.fbAccessToken ||
                meta.accessToken ||
                meta.pageAccessToken ||
                globalKey?.access_token ||
                (decryptedSecret.startsWith('EAA') ? decryptedSecret : '')
            ).trim();
            const accessToken = rawFbToken ? decryptCredential(rawFbToken).trim() : '';
            const activeFb = getActiveBoothFacebookSession(boothId);
            const liveVideoId =
              activeFb?.fbLiveVideoId ||
              meta.fbLiveVideoId ||
              meta.liveVideoId ||
              meta.videoId ||
              (username && /^\d{10,22}$/.test(username) ? username : undefined);
            if (!fbConfig && accessToken) {
              const primaryTarget = String(meta.fbTargetId || 'me').trim();
              fbConfig = { accessToken, liveVideoId, fbTargetId: primaryTarget };

              const secPageId = String(
                meta.secondaryFbTargetId ||
                  meta.savedOfficialPageId ||
                  process.env.META_DUAL_FB_PAGE_ID ||
                  (primaryTarget === 'me' ? '1436686246201829' : '')
              ).trim();
              if (
                secPageId &&
                /^\d{6,25}$/.test(secPageId) &&
                secPageId !== primaryTarget &&
                process.env.DISABLE_DUAL_FB_SIMULCAST !== '1'
              ) {
                let secPageTok = decryptCredential(
                  String(meta.secondaryFbAccessToken || meta.savedOfficialPageToken || '').trim()
                ).trim();
                if (!secPageTok) {
                  const pgRes = await fetchFacebookGraphJson(
                    `https://graph.facebook.com/v21.0/${encodeURIComponent(secPageId)}?fields=id,access_token&access_token=${encodeURIComponent(accessToken)}`,
                    3500
                  );
                  if (pgRes.ok && pgRes.data?.access_token) {
                    secPageTok = String(pgRes.data.access_token).trim();
                  }
                }
                if (secPageTok) {
                  const activeSecFb = getActiveBoothSecondaryFacebookSession(boothId);
                  fbPageConfig = {
                    fbTargetId: secPageId,
                    accessToken: secPageTok,
                    liveVideoId: activeSecFb?.fbLiveVideoId
                  };
                }
              }
            }
          } else if (plat === 'instagram') {
            const accessToken = meta.accessToken || globalKey?.access_token || (decryptedSecret.startsWith('EAA') || decryptedSecret.startsWith('IG') ? decryptedSecret : '');
            const liveMediaId = meta.liveMediaId || meta.mediaId || (username && /^\d{10,22}$/.test(username) ? username : undefined);
            const igUserId = meta.igUserId || undefined;
            if (!igConfig && accessToken) {
              igConfig = { accessToken, liveMediaId, igUserId };
            }
          } else if (plat === 'threads') {
            const accessToken = meta.accessToken || (decryptedSecret.startsWith('TH') || decryptedSecret.startsWith('IG') ? decryptedSecret : '');
            const mediaId = meta.mediaId || (username && /^\d{10,22}$/.test(username) ? username : undefined);
            if (!thConfig && accessToken) {
              thConfig = { accessToken, mediaId };
            }
          } else if (plat === 'custom') {
            if (!customConfig && meta.chatPollUrl) {
              customConfig = { chatPollUrl: meta.chatPollUrl, apiKey: decryptedSecret || meta.apiKey };
            }
          }
        }
      } catch (err) {
        console.warn(`[SocialChat] DB channel lookup note for ${boothId}:`, (err as Error).message);
      } finally {
        await client.end().catch(() => {});
      }
    }

    // 3. Connect TikTok Live Socket if a real handle is configured for this booth
    if (tiktokHandle) {
      activeListeners.push('tiktok');
      tikTokSocketService.connect(tiktokHandle, boothId).catch(() => {});
    }

    // 4. Start Graph API / Social Poller for Facebook, Instagram, Threads, Custom
    const existingSeen = this.boothPollers.get(boothId)?.seenMessageIds || new Set<string>();
    this.stopBoothPoller(boothId);
    const pollerState: BoothSocialPollerState = {
      boothId,
      running: true,
      timer: null,
      startedAt: Date.now(),
      seenMessageIds: existingSeen,
      facebookConfig: fbConfig,
      facebookPageConfig: fbPageConfig,
      instagramConfig: igConfig,
      threadsConfig: thConfig,
      customConfig,
      fbCommentsIngested: 0,
      fbConsecutiveFailures: 0
    };
    this.boothPollers.set(boothId, pollerState);

    if (fbConfig) activeListeners.push('facebook');
    if (igConfig) activeListeners.push('instagram');
    if (thConfig) activeListeners.push('threads');
    if (customConfig) activeListeners.push('custom');

    if (fbConfig || igConfig || thConfig || customConfig) {
      const pollLoop = async () => {
        if (!pollerState.running) return;
        try {
          await this.pollSocialApisOnce(pollerState);
        } catch (loopErr: any) {
          console.warn(`[SocialChat:${boothId}] pollLoop tick warning:`, loopErr?.message || loopErr);
        }
        if (pollerState.running) {
          pollerState.timer = setTimeout(pollLoop, 1500);
        }
      };
      pollLoop();
    }

    return {
      boothId,
      activeListeners
    };
  }

  public disconnectAllBoothPlatforms(rawBoothId: string) {
    const boothId = normalizeBoothId(rawBoothId);
    this.stopBoothPoller(boothId);
    try {
      tikTokSocketService.disconnect(boothId).catch(() => {});
    } catch (_) {}
  }

  public getBoothSocialChatStatus(rawBoothId: string) {
    const boothId = normalizeBoothId(rawBoothId);
    const st = this.boothPollers.get(boothId);
    return {
      boothId,
      running: Boolean(st?.running),
      startedAt: st?.startedAt || null,
      platforms: {
        facebook: {
          configured: Boolean(st?.facebookConfig?.accessToken),
          liveVideoId: st?.facebookConfig?.liveVideoId || null,
          videoId: st?.facebookConfig?.videoId || null,
          lastPollAt: st?.fbLastPollAt || null,
          lastOkAt: st?.fbLastOkAt || null,
          lastCommentAt: st?.fbLastCommentAt || null,
          commentsIngested: st?.fbCommentsIngested || 0,
          consecutiveFailures: st?.fbConsecutiveFailures || 0,
          lastError: st?.fbLastError || null
        },
        instagram: {
          configured: Boolean(st?.instagramConfig?.accessToken)
        },
        threads: {
          configured: Boolean(st?.threadsConfig?.accessToken)
        }
      }
    };
  }

  public ensureConnectedIfBoothLive(rawBoothId: string, isStreaming: boolean) {
    if (!isStreaming) return;
    const boothId = normalizeBoothId(rawBoothId);
    const st = this.boothPollers.get(boothId);
    if (st && st.running && st.facebookConfig?.accessToken) return;
    const now = Date.now();
    const lastHeal = this.lastAutoHealAt.get(boothId) || 0;
    if (now - lastHeal < 20000) return;
    this.lastAutoHealAt.set(boothId, now);
    this.connectAllBoothPlatforms(boothId).catch(() => {});
  }

  private stopBoothPoller(boothId: string) {
    const existing = this.boothPollers.get(boothId);
    if (existing) {
      existing.running = false;
      if (existing.timer) clearTimeout(existing.timer);
      this.boothPollers.delete(boothId);
    }
  }

  private async pollSocialApisOnce(state: BoothSocialPollerState) {
    // 1. Facebook Live Graph API Polling (20s cadence + 90s backoff on Meta #4 rate limit to stay well under 200 req/hr)
    if (state.facebookConfig?.accessToken) {
      const now = Date.now();
      const minGapMs = (state as any).fbRateLimitUntil && now < (state as any).fbRateLimitUntil ? 90000 : 18000;
      if (state.fbLastPollAt && now - state.fbLastPollAt < minGapMs) {
        // Skip this tick to conserve Meta Graph API user rate-limit budget
      } else {
      state.fbLastPollAt = now;
      const logFbWarn = (msg: string) => {
        state.fbLastError = msg;
        if (!state.fbLastErrorLogAt || Date.now() - state.fbLastErrorLogAt > 60000) {
          state.fbLastErrorLogAt = Date.now();
          console.warn(`[SocialChat:FB] (${state.boothId}) ${msg}`);
        }
      };

      try {
        const { accessToken } = state.facebookConfig;
        const preferIpv4 = (state.fbConsecutiveFailures || 0) >= 2;
        const activeFb = getActiveBoothFacebookSession(state.boothId);
        if (activeFb?.fbLiveVideoId && activeFb.fbLiveVideoId !== state.facebookConfig.liveVideoId) {
          state.facebookConfig.liveVideoId = activeFb.fbLiveVideoId;
          state.facebookConfig.videoId = undefined;
        }
        let { liveVideoId } = state.facebookConfig;

        const needsRediscover =
          !liveVideoId ||
          (state.fbConsecutiveFailures || 0) >= 3 ||
          (now - (state.fbLastDiscoverAt || 0) > 45000 &&
            now - (state.fbLastCommentAt || state.startedAt || 0) > 45000);

        // Auto-discover / refresh active live_video ID from Page/User feed
        if (needsRediscover) {
          const fbTarget = state.facebookConfig.fbTargetId || 'me';
          state.fbLastDiscoverAt = now;
          const discoverRes = await fetchFacebookGraphJson(
            `https://graph.facebook.com/v21.0/${encodeURIComponent(fbTarget)}/live_videos?broadcast_status=["LIVE"]&fields=id,status,video{id}&limit=1&access_token=${encodeURIComponent(accessToken)}`,
            5000,
            preferIpv4
          );
          if (discoverRes.ok && discoverRes.data?.data?.[0]?.id) {
            const discoveredId = String(discoverRes.data.data[0].id);
            const discoveredVideoId = discoverRes.data.data[0]?.video?.id
              ? String(discoverRes.data.data[0].video.id)
              : undefined;
            if (discoveredId !== state.facebookConfig.liveVideoId) {
              state.facebookConfig.liveVideoId = discoveredId;
              liveVideoId = discoveredId;
            }
            if (discoveredVideoId) {
              state.facebookConfig.videoId = discoveredVideoId;
            }
          } else if (!discoverRes.ok && !liveVideoId) {
            state.fbConsecutiveFailures = (state.fbConsecutiveFailures || 0) + 1;
            const dErr = String(discoverRes.error || `HTTP ${discoverRes.status}`);
            logFbWarn(`Discover failed: ${dErr}`);
            if (/limit reached|\(#4\)|rate limit/i.test(dErr)) {
              (state as any).fbRateLimitUntil = Date.now() + 15 * 60 * 1000;
            }
          }
        }

        if (liveVideoId) {
          streamController.notifyActiveFacebookLiveId(
            state.boothId,
            liveVideoId,
            state.facebookConfig.videoId
          );
          let fbRes = await fetchFacebookGraphJson(
            `https://graph.facebook.com/v21.0/${encodeURIComponent(liveVideoId)}/comments?filter=stream&order=reverse_chronological&limit=15&fields=id,message,from,created_time&access_token=${encodeURIComponent(accessToken)}`,
            5000,
            preferIpv4
          );

          if (!fbRes.ok && state.facebookConfig.videoId && state.facebookConfig.videoId !== liveVideoId) {
            fbRes = await fetchFacebookGraphJson(
              `https://graph.facebook.com/v21.0/${encodeURIComponent(state.facebookConfig.videoId)}/comments?filter=stream&order=reverse_chronological&limit=15&fields=id,message,from,created_time&access_token=${encodeURIComponent(accessToken)}`,
              5000,
              true
            );
          }

          if (fbRes.ok) {
            state.fbConsecutiveFailures = 0;
            state.fbLastOkAt = Date.now();
            state.fbLastError = undefined;
            const comments = Array.isArray(fbRes.data?.data) ? [...fbRes.data.data].reverse() : [];
            for (const c of comments) {
              if (!c?.id || !c?.message || state.seenMessageIds.has(`fb_${c.id}`)) continue;
              state.seenMessageIds.add(`fb_${c.id}`);
              if (state.seenMessageIds.size > 5000) {
                const first = state.seenMessageIds.values().next().value;
                if (first) state.seenMessageIds.delete(first);
              }
              const author = c.from?.name || 'Facebook Viewer';
              const res = await this.processIncomingSocialComment({
                boothId: state.boothId,
                platform: 'facebook',
                username: author,
                commentText: c.message,
                externalMessageId: c.id
              });
              if (res?.success) {
                state.fbCommentsIngested = (state.fbCommentsIngested || 0) + 1;
                state.fbLastCommentAt = Date.now();
              }
            }
          } else {
            state.fbConsecutiveFailures = (state.fbConsecutiveFailures || 0) + 1;
            const errStr = String(fbRes.error || `HTTP ${fbRes.status}`);
            logFbWarn(`Comments poll failed (${liveVideoId}): ${errStr}`);
            if (/limit reached|\(#4\)|rate limit/i.test(errStr)) {
              // Back off 12 minutes on Meta #4 so App OAuth window recovers quickly while headless GraphQL v3.1 handles comments
              (state as any).fbRateLimitUntil = Date.now() + 12 * 60 * 1000;
            } else if (fbRes.status === 404) {
              state.facebookConfig.liveVideoId = undefined;
              state.facebookConfig.videoId = undefined;
            }
          }
        }
      } catch (err: any) {
        state.fbConsecutiveFailures = (state.fbConsecutiveFailures || 0) + 1;
        logFbWarn(`Unexpected poll error: ${err?.message || 'unknown'}`);
      }
      }
    }

    // 1b. Secondary Official Facebook Page Live Polling (Dual-Facebook Simulcast in same Booth)
    if (state.facebookPageConfig?.accessToken && state.facebookPageConfig.fbTargetId) {
      const now = Date.now();
      const cfg = state.facebookPageConfig as any;
      if (!cfg.lastPollAt || now - cfg.lastPollAt >= (cfg.rateLimitUntil && now < cfg.rateLimitUntil ? 90000 : 25000)) {
      cfg.lastPollAt = now;
      try {
        const activeSecFb = getActiveBoothSecondaryFacebookSession(state.boothId);
        if (activeSecFb?.fbLiveVideoId && activeSecFb.fbLiveVideoId !== cfg.liveVideoId) {
          cfg.liveVideoId = activeSecFb.fbLiveVideoId;
          cfg.videoId = undefined;
        }
        let { liveVideoId } = cfg;
        const preferIpv4 = (cfg.consecutiveFailures || 0) >= 2;
        const needsRediscover =
          !liveVideoId ||
          (cfg.consecutiveFailures || 0) >= 3 ||
          now - (cfg.lastDiscoverAt || 0) > 45000;

        if (needsRediscover) {
          cfg.lastDiscoverAt = now;
          const disc = await fetchFacebookGraphJson(
            `https://graph.facebook.com/v21.0/${encodeURIComponent(cfg.fbTargetId)}/live_videos?broadcast_status=["LIVE"]&fields=id,status,video{id}&limit=1&access_token=${encodeURIComponent(cfg.accessToken)}`,
            5000,
            preferIpv4
          );
          if (disc.ok && disc.data?.data?.[0]?.id) {
            cfg.liveVideoId = String(disc.data.data[0].id);
            liveVideoId = cfg.liveVideoId;
            if (disc.data.data[0]?.video?.id) {
              cfg.videoId = String(disc.data.data[0].video.id);
            }
          }
        }

        if (liveVideoId) {
          const fbRes = await fetchFacebookGraphJson(
            `https://graph.facebook.com/v21.0/${encodeURIComponent(liveVideoId)}/comments?filter=stream&order=reverse_chronological&limit=15&fields=id,message,from,created_time&access_token=${encodeURIComponent(cfg.accessToken)}`,
            5000,
            preferIpv4
          );
          if (fbRes.ok) {
            cfg.consecutiveFailures = 0;
            const comments = Array.isArray(fbRes.data?.data) ? [...fbRes.data.data].reverse() : [];
            for (const c of comments) {
              if (!c?.id || !c?.message || state.seenMessageIds.has(`fb_${c.id}`)) continue;
              state.seenMessageIds.add(`fb_${c.id}`);
              const author = c.from?.name || 'Facebook Viewer';
              const res = await this.processIncomingSocialComment({
                boothId: state.boothId,
                platform: 'facebook',
                username: author,
                commentText: c.message,
                externalMessageId: c.id
              });
              if (res?.success) {
                state.fbCommentsIngested = (state.fbCommentsIngested || 0) + 1;
                state.fbLastCommentAt = Date.now();
              }
            }
          } else {
            cfg.consecutiveFailures = (cfg.consecutiveFailures || 0) + 1;
            const secErr = String(fbRes.error || '');
            if (/limit reached|\(#4\)|rate limit/i.test(secErr)) {
              cfg.rateLimitUntil = Date.now() + 90000;
            } else if (fbRes.status === 404) {
              cfg.liveVideoId = undefined;
              cfg.videoId = undefined;
            }
          }
        }
      } catch (_) {
        cfg.consecutiveFailures = (cfg.consecutiveFailures || 0) + 1;
      }
      }
    }

    // 2. Instagram Live Graph API Polling (throttled to 60s + 15m backoff on Meta #4 so Facebook Live quota is never starved!)
    if (state.instagramConfig?.accessToken) {
      const igNow = Date.now();
      const igState = state.instagramConfig as any;
      const igMinGap = igState.rateLimitUntil && igNow < igState.rateLimitUntil ? 15 * 60 * 1000 : (igState.liveMediaId ? 20000 : 60000);
      if (!igState.lastPollAt || igNow - igState.lastPollAt >= igMinGap) {
        igState.lastPollAt = igNow;
        try {
          const { accessToken, igUserId } = state.instagramConfig;
          let { liveMediaId } = state.instagramConfig;

          if (!liveMediaId && igUserId) {
            const discoverRes = await fetchFacebookGraphJson(
              `https://graph.facebook.com/v21.0/${encodeURIComponent(igUserId)}/live_media?fields=id&access_token=${encodeURIComponent(accessToken)}`,
              5000
            );
            if (discoverRes.ok && discoverRes.data?.data?.[0]?.id) {
              liveMediaId = String(discoverRes.data.data[0].id);
              state.instagramConfig.liveMediaId = liveMediaId;
            } else if (!discoverRes.ok && /limit reached|\(#4\)|rate limit/i.test(String(discoverRes.error || ''))) {
              igState.rateLimitUntil = Date.now() + 15 * 60 * 1000;
            }
          }

          if (liveMediaId) {
            const igRes = await fetchFacebookGraphJson(
              `https://graph.facebook.com/v21.0/${encodeURIComponent(liveMediaId)}/live_comments?fields=id,text,timestamp,username,from&access_token=${encodeURIComponent(accessToken)}`,
              5000
            );
            if (igRes.ok) {
              const comments = Array.isArray(igRes.data?.data) ? igRes.data.data : [];
              for (const c of comments) {
                if (!c?.id || !c?.text || state.seenMessageIds.has(`ig_${c.id}`)) continue;
                state.seenMessageIds.add(`ig_${c.id}`);
                const author = c.username || c.from?.username || 'Instagram Viewer';
                await this.processIncomingSocialComment({
                  boothId: state.boothId,
                  platform: 'instagram',
                  username: author,
                  commentText: c.text,
                  externalMessageId: c.id
                });
              }
            } else if (/limit reached|\(#4\)|rate limit/i.test(String(igRes.error || ''))) {
              igState.rateLimitUntil = Date.now() + 15 * 60 * 1000;
            } else if (igRes.status === 404 || igRes.status === 400) {
              state.instagramConfig.liveMediaId = undefined;
            }
          }
        } catch (_) {}
      }
    }

    // 3. Meta Threads API Replies Polling
    if (state.threadsConfig?.accessToken && state.threadsConfig?.mediaId) {
      try {
        const { accessToken, mediaId } = state.threadsConfig;
        const thRes = await fetch(
          `https://graph.threads.net/v1.0/${encodeURIComponent(mediaId)}/replies?fields=id,text,username,timestamp&access_token=${encodeURIComponent(accessToken)}`,
          { signal: AbortSignal.timeout(4000) }
        );
        if (thRes.ok) {
          const thJson = await thRes.json();
          const replies = Array.isArray(thJson?.data) ? thJson.data : [];
          for (const r of replies) {
            if (!r?.id || !r?.text || state.seenMessageIds.has(`th_${r.id}`)) continue;
            state.seenMessageIds.add(`th_${r.id}`);
            await this.processIncomingSocialComment({
              boothId: state.boothId,
              platform: 'threads',
              username: r.username || 'Threads Viewer',
              commentText: r.text,
              externalMessageId: r.id
            });
          }
        }
      } catch (_) {}
    }
  }

  /**
   * Unified 1-Click Host Broadcast:
   * Delivers 1 host message simultaneously to ALL active connected platforms:
   * - Live Broadcast Video HUD (seen on YouTube, Facebook, Instagram, TikTok, Custom video feeds)
   * - YouTube Live Chat (via OAuth 2.0 API or Innertube cookies)
   * - Facebook Live Comments (via Graph API /{liveVideoId}/comments)
   * - Instagram Live / Media Comments (via Graph API /{liveMediaId}/comments)
   * - TikTok Live Chat (if cookie + active roomId configured)
   * - Custom Chat Webhook (if configured)
   */
  public async broadcastHostMessageToAllPlatforms(
    rawBoothId: string,
    messageText: string,
    senderName = '📢 Vintage Vibes Host',
    options?: { replyToPlatform?: SocialPlatformKey; replyToCommentId?: string }
  ): Promise<{
    success: boolean;
    displayedOnStreamHud: boolean;
    deliveredPlatforms: string[];
    platformResults: Record<string, { delivered: boolean; note?: string; needsOAuth?: boolean; oauthUrl?: string }>;
    youtubeNeedsOAuth: boolean;
    youtubeOAuthUrl: string;
  }> {
    const boothId = normalizeBoothId(rawBoothId);
    const aliases = getBoothAliases(boothId);
    const cleanMsg = String(messageText || '').trim();
    const youtubeOAuthUrl = `/auth/v1/authorize?youtube_chat=1&boothId=${encodeURIComponent(boothId)}`;

    if (!cleanMsg) {
      return {
        success: false,
        displayedOnStreamHud: false,
        deliveredPlatforms: [],
        platformResults: {},
        youtubeNeedsOAuth: false,
        youtubeOAuthUrl
      };
    }

    const platformResults: Record<string, { delivered: boolean; note?: string; needsOAuth?: boolean; oauthUrl?: string }> = {};
    const deliveredPlatforms: string[] = [];

    // 1. YouTube Live Chat delivery
    const ytTask = youTubeChatService
      .sendMessageToYouTubeChat(boothId, cleanMsg, senderName)
      .then(ytRes => {
        platformResults.youtube = {
          delivered: Boolean(ytRes.deliveredViaYouTubeApi),
          needsOAuth: Boolean(ytRes.needsOAuth),
          oauthUrl: ytRes.oauthUrl || youtubeOAuthUrl,
          note: ytRes.note
        };
        if (ytRes.deliveredViaYouTubeApi) {
          deliveredPlatforms.push('YOUTUBE');
        }
        return ytRes;
      })
      .catch(() => null);

    // 2. Load connected Facebook, Instagram, TikTok, and Custom channels from PostgreSQL
    let channelRows: any[] = [];
    const globalKeyMap = new Map<string, any>();
    const client = await getPgClient();
    if (client) {
      try {
        const [chQ, akQ] = await Promise.all([
          client.query(
            `SELECT platform, account_username, account_password, auth_status, metadata, is_active
             FROM public.booth_social_channels
             WHERE booth_id = ANY($1::text[]) AND is_active IS NOT FALSE`,
            [aliases]
          ),
          client
            .query(`SELECT platform, access_token, api_key, server_url FROM public.streaming_api_keys WHERE is_connected = true`)
            .catch(() => ({ rows: [] as any[] }))
        ]);
        channelRows = chQ.rows || [];
        for (const r of akQ.rows || []) {
          globalKeyMap.set(String(r.platform || '').toLowerCase(), r);
        }
      } catch (_) {
      } finally {
        await client.end().catch(() => {});
      }
    }

    const pollerState = this.boothPollers.get(boothId);
    const dispatchTasks: Promise<any>[] = [ytTask];

    // Deduplicate channels by platform (prefer LOGGED_IN)
    const chByPlat = new Map<string, any>();
    for (const r of channelRows) {
      const p = String(r.platform || '').toLowerCase();
      if (!chByPlat.has(p) || r.auth_status === 'LOGGED_IN') {
        chByPlat.set(p, r);
      }
    }

    // 2a. Facebook Live Comments Graph API (Business Page + Threaded Comment Replies)
    const fbRow = chByPlat.get('facebook');
    if (fbRow || pollerState?.facebookConfig?.accessToken || globalKeyMap.get('facebook')?.access_token) {
      dispatchTasks.push(
        (async () => {
          try {
            const meta = fbRow?.metadata || {};
            const decPwd = decryptCredential(String(fbRow?.account_password || '').trim());
            const rawTok = String(
              meta.fbPageAccessToken ||
                meta.pageAccessToken ||
                meta.fbAccessToken ||
                meta.accessToken ||
                pollerState?.facebookConfig?.accessToken ||
                globalKeyMap.get('facebook')?.access_token ||
                (decPwd.startsWith('EAA') ? decPwd : '')
            ).trim();
            const fbAccessToken = rawTok ? decryptCredential(rawTok).trim() : '';
            if (!fbAccessToken) return;

            const activeFb = getActiveBoothFacebookSession(boothId);
            let liveVideoId =
              activeFb?.fbLiveVideoId ||
              pollerState?.facebookConfig?.liveVideoId ||
              meta.fbLiveVideoId ||
              meta.liveVideoId ||
              meta.videoId ||
              '';
            const fbTarget = String(
              meta.fbPageId || meta.fbTargetId || pollerState?.facebookConfig?.fbTargetId || 'me'
            ).trim();
            const isPageTarget = /^\d{6,25}$/.test(fbTarget) || Boolean(meta.fbPageId);

            if (!liveVideoId) {
              const disc = await fetchFacebookGraphJson(
                `https://graph.facebook.com/v21.0/${encodeURIComponent(fbTarget)}/live_videos?broadcast_status=["LIVE"]&fields=id&limit=1&access_token=${encodeURIComponent(fbAccessToken)}`,
                4000
              );
              if (disc.ok && disc.data?.data?.[0]?.id) {
                liveVideoId = String(disc.data.data[0].id || '').trim();
              }
            }

            if (!liveVideoId && !(options?.replyToPlatform === 'facebook' && options?.replyToCommentId && isPageTarget)) {
              platformResults.facebook = { delivered: false, note: 'Facebook connected, waiting for active Live Video ID' };
              return;
            }

            // Inspect LiveVideo to get underlying video.id & owner info, plus check /me/accounts for Page Access Token
            let underlyingVideoId = '';
            let ownerId = '';
            let ownerName = '';
            if (liveVideoId) {
              const lvMetaRes = await fetchFacebookGraphJson(
                `https://graph.facebook.com/v21.0/${encodeURIComponent(liveVideoId)}?fields=id,from,video{id}&access_token=${encodeURIComponent(fbAccessToken)}`,
                4000
              );
              if (lvMetaRes.ok && lvMetaRes.data) {
                underlyingVideoId = String(lvMetaRes.data?.video?.id || '').trim();
                ownerId = String(lvMetaRes.data?.from?.id || '').trim();
                ownerName = String(lvMetaRes.data?.from?.name || '').trim();
              }
            }

            let postToken = fbAccessToken;
            let pagesCount = isPageTarget ? 1 : 0;
            const accountsRes = await fetchFacebookGraphJson(
              `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(fbAccessToken)}`,
              4000
            );
            if (accountsRes.ok) {
              const pages = Array.isArray(accountsRes.data?.data) ? accountsRes.data.data : [];
              if (pages.length > 0) {
                pagesCount = Math.max(pagesCount, pages.length);
              }
              const targetPageLookup = ownerId || (isPageTarget ? fbTarget : '');
              const matchedPage =
                (targetPageLookup ? pages.find((p: any) => String(p.id) === targetPageLookup) : null) || pages[0];
              if (matchedPage?.access_token) {
                postToken = String(matchedPage.access_token);
              }
            }

            const threadedCommentId =
              options?.replyToPlatform === 'facebook' &&
              options?.replyToCommentId &&
              (isPageTarget || pagesCount > 0)
                ? String(options.replyToCommentId).trim()
                : '';

            const candidateTargets = Array.from(
              new Set([threadedCommentId, underlyingVideoId, liveVideoId].filter(Boolean))
            );
            let posted = false;
            let lastErr = '';
            let postedTarget = '';
            for (const targetObjId of candidateTargets) {
              const fbPost = await fetch(
                `https://graph.facebook.com/v21.0/${encodeURIComponent(targetObjId)}/comments`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
                  body: new URLSearchParams({ message: cleanMsg, access_token: postToken }).toString(),
                  signal: AbortSignal.timeout(5000)
                }
              );
              const fbJson: any = await fbPost.json().catch(() => null);
              if (fbPost.ok && fbJson?.id) {
                if (pollerState) pollerState.seenMessageIds.add(`fb_${fbJson.id}`);
                posted = true;
                postedTarget = targetObjId;
                break;
              } else {
                lastErr = fbJson?.error?.message || `Facebook API HTTP ${fbPost.status}`;
              }
            }

            if (posted) {
              deliveredPlatforms.push('FACEBOOK');
              platformResults.facebook = {
                delivered: true,
                note:
                  threadedCommentId && postedTarget === threadedCommentId
                    ? `Replied directly to buyer comment (${postedTarget})`
                    : `Posted to Facebook Live (${postedTarget})`
              };
            } else if (!isPageTarget && pagesCount === 0) {
              // Personal Profile Live ('VintageVibes Clo'): push immediately to Chrome Bridge host_outbox.json
              let queuedViaBridge = false;
              try {
                const activeLivePath = path.join(process.cwd(), 'public', 'fb-active-live.json');
                let activeMeta: any = {};
                if (fs.existsSync(activeLivePath)) {
                  activeMeta = JSON.parse(fs.readFileSync(activeLivePath, 'utf8') || '{}');
                }
                const outboxPub = path.join(process.cwd(), 'public', 'uploads', 'live_bridge', 'host_outbox.json');
                const outboxDist = path.join(process.cwd(), 'dist', 'uploads', 'live_bridge', 'host_outbox.json');
                let prevMsgs: any[] = [];
                if (fs.existsSync(outboxPub)) {
                  const prev = JSON.parse(fs.readFileSync(outboxPub, 'utf8') || '{}');
                  if (Array.isArray(prev.hostMessages)) prevMsgs = prev.hostMessages.slice(-19);
                }
                const bridgeVid = String(activeMeta.videoId || underlyingVideoId || liveVideoId || '').trim();
                const bridgeFid = String(activeMeta.feedbackId || '').trim();
                if (bridgeVid) {
                  prevMsgs.push({
                    id: `hb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    text: cleanMsg,
                    createdAtMs: Date.now(),
                    timestamp: new Date().toLocaleTimeString()
                  });
                  const outboxPayload = JSON.stringify({
                    updatedAt: Date.now(),
                    videoId: bridgeVid,
                    feedbackId: bridgeFid,
                    hostMessages: prevMsgs
                  });
                  fs.mkdirSync(path.dirname(outboxPub), { recursive: true });
                  fs.writeFileSync(outboxPub, outboxPayload, 'utf8');
                  if (fs.existsSync(path.dirname(path.join(process.cwd(), 'dist', 'index.html')))) {
                    fs.mkdirSync(path.dirname(outboxDist), { recursive: true });
                    fs.writeFileSync(outboxDist, outboxPayload, 'utf8');
                  }
                  queuedViaBridge = true;
                }
              } catch (_) {}

              if (queuedViaBridge) {
                deliveredPlatforms.push('FACEBOOK');
                platformResults.facebook = {
                  delivered: true,
                  note: 'Queued to Facebook Personal Profile Live Bridge (host_outbox.json)'
                };
              } else {
                platformResults.facebook = {
                  delivered: false,
                  note: `Facebook Personal Profile (${ownerName || 'Profile'}) par Meta API comment post block karta hai (viewer comments read ho saktay hain). Comment post ke liye Facebook Business Page use karein.`
                };
              }
            } else {
              platformResults.facebook = {
                delivered: false,
                note: lastErr || 'Facebook API comment post failed'
              };
            }
            } catch (fbErr: any) {
              platformResults.facebook = { delivered: false, note: fbErr?.message || 'Facebook send error' };
            }

            // Dual-Facebook Simulcast: also post host message / threaded reply on secondary Official Business Page when active
            try {
              const secCfg = pollerState?.facebookPageConfig;
              const activeSec = getActiveBoothSecondaryFacebookSession(boothId);
              const secLiveId = activeSec?.fbLiveVideoId || secCfg?.liveVideoId || '';
              const secTok = activeSec?.fbAccessToken || secCfg?.accessToken || '';
              const secThreadedId =
                options?.replyToPlatform === 'facebook' && options?.replyToCommentId
                  ? String(options.replyToCommentId).trim()
                  : '';
              const secCandidates = Array.from(new Set([secThreadedId, secCfg?.videoId || '', secLiveId].filter(Boolean)));
              if (secTok && secCandidates.length > 0) {
                for (const tgtId of secCandidates) {
                  const pRes = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(tgtId)}/comments`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
                    body: new URLSearchParams({ message: cleanMsg, access_token: secTok }).toString(),
                    signal: AbortSignal.timeout(4500)
                  });
                  const pJson: any = await pRes.json().catch(() => null);
                  if (pRes.ok && pJson?.id) {
                    if (pollerState) pollerState.seenMessageIds.add(`fb_${pJson.id}`);
                    if (!deliveredPlatforms.includes('FACEBOOK')) deliveredPlatforms.push('FACEBOOK');
                    platformResults.facebook_page = { delivered: true, note: `Posted to Official Page Live (${tgtId})` };
                    break;
                  }
                }
              }
            } catch (_) {}
          })()
        );
      }

    // 2b. Instagram Live Comments Graph API
    const igRow = chByPlat.get('instagram');
    if (igRow || pollerState?.instagramConfig?.accessToken || globalKeyMap.get('instagram')?.access_token) {
      dispatchTasks.push(
        (async () => {
          try {
            const meta = igRow?.metadata || {};
            const decPwd = decryptCredential(String(igRow?.account_password || '').trim());
            const rawTok = String(
              meta.accessToken ||
                pollerState?.instagramConfig?.accessToken ||
                globalKeyMap.get('instagram')?.access_token ||
                (decPwd.startsWith('EAA') || decPwd.startsWith('IG') ? decPwd : '')
            ).trim();
            const igAccessToken = rawTok ? decryptCredential(rawTok).trim() : '';
            if (!igAccessToken) return;

            let liveMediaId =
              pollerState?.instagramConfig?.liveMediaId || meta.liveMediaId || meta.mediaId || '';
            const igUserId = meta.igUserId || pollerState?.instagramConfig?.igUserId || '';
            if (!liveMediaId && igUserId) {
              const disc = await fetch(
                `https://graph.facebook.com/v21.0/${encodeURIComponent(igUserId)}/live_media?fields=id&access_token=${encodeURIComponent(igAccessToken)}`,
                { signal: AbortSignal.timeout(4000) }
              ).catch(() => null);
              if (disc && disc.ok) {
                const dj: any = await disc.json().catch(() => null);
                liveMediaId = String(dj?.data?.[0]?.id || '').trim();
              }
            }
            if (!liveMediaId) {
              platformResults.instagram = { delivered: false, note: 'Instagram connected, waiting for active Live Media ID' };
              return;
            }
            const igPost = await fetch(
              `https://graph.facebook.com/v21.0/${encodeURIComponent(liveMediaId)}/comments`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
                body: new URLSearchParams({ message: cleanMsg, access_token: igAccessToken }).toString(),
                signal: AbortSignal.timeout(5000)
              }
            );
            const igJson: any = await igPost.json().catch(() => null);
            if (igPost.ok && igJson?.id) {
              if (pollerState) pollerState.seenMessageIds.add(`ig_${igJson.id}`);
              deliveredPlatforms.push('INSTAGRAM');
              platformResults.instagram = { delivered: true, note: `Posted to Instagram Live (${liveMediaId})` };
            } else {
              platformResults.instagram = {
                delivered: false,
                note: igJson?.error?.message || `Instagram API HTTP ${igPost.status}`
              };
            }
          } catch (igErr: any) {
            platformResults.instagram = { delivered: false, note: igErr?.message || 'Instagram send error' };
          }
        })()
      );
    }

    // 2c. TikTok Live Chat (when real session cookies + active roomId are available)
    const ttRow = chByPlat.get('tiktok');
    if (ttRow) {
      dispatchTasks.push(
        (async () => {
          try {
            const meta = ttRow.metadata || {};
            const ttCookie = String(meta.cookieHeader || '').trim();
            const ttStatus = tikTokSocketService.getStatus(boothId);
            const roomId = String(ttStatus?.roomId || meta.roomId || '').trim();
            if (!ttCookie || !roomId || roomId.startsWith('room-')) {
              return;
            }
            const ttRes = await fetch('https://webcast.tiktok.com/webcast/room/chat/', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                Cookie: ttCookie,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36'
              },
              body: new URLSearchParams({ room_id: roomId, content: cleanMsg }).toString(),
              signal: AbortSignal.timeout(4000)
            });
            if (ttRes.ok) {
              const ttJson: any = await ttRes.json().catch(() => null);
              if (ttJson?.status_code === 0) {
                deliveredPlatforms.push('TIKTOK');
                platformResults.tiktok = { delivered: true, note: `Posted to TikTok Live Room ${roomId}` };
              }
            }
          } catch (_) {}
        })()
      );
    }

    // 2d. Custom Webhook Relay
    const customRow = chByPlat.get('custom');
    const customSendUrl = customRow?.metadata?.chatSendUrl || customRow?.metadata?.webhookUrl;
    if (customSendUrl) {
      dispatchTasks.push(
        (async () => {
          try {
            const decKey = decryptCredential(String(customRow.account_password || '').trim());
            const r = await fetch(String(customSendUrl), {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(decKey ? { Authorization: `Bearer ${decKey}` } : {})
              },
              body: JSON.stringify({ boothId, sender: senderName, message: cleanMsg }),
              signal: AbortSignal.timeout(4000)
            });
            if (r.ok) {
              deliveredPlatforms.push('CUSTOM');
              platformResults.custom = { delivered: true, note: 'Posted to Custom Live Chat Webhook' };
            }
          } catch (_) {}
        })()
      );
    }

    await Promise.allSettled(dispatchTasks);

    return {
      success: true,
      displayedOnStreamHud: false,
      deliveredPlatforms,
      platformResults,
      youtubeNeedsOAuth: Boolean(platformResults.youtube?.needsOAuth),
      youtubeOAuthUrl
    };
  }
}

const globalForSocialChat = globalThis as unknown as { __vvSocialChatService?: SocialChatService };
export const socialChatService =
  globalForSocialChat.__vvSocialChatService || (globalForSocialChat.__vvSocialChatService = new SocialChatService());
