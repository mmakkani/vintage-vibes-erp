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
import { getActiveBoothFacebookSession, getBoothPinnedPiece } from './rtmpRelayServer.ts';
import {
  parseLiveClaimDetails,
  shouldHandleAsOpenLiveClaim,
  resolveOpenClaimPriceAndTitle,
  executeOpenLiveClaim,
  canSendNeedPricePrompt,
  buildNeedPriceReply
} from './openLiveClaimHelper.ts';

export type SocialPlatformKey = 'tiktok' | 'instagram' | 'facebook' | 'youtube' | 'threads' | 'custom';

interface BoothSocialPollerState {
  boothId: string;
  running: boolean;
  timer: NodeJS.Timeout | null;
  seenMessageIds: Set<string>;
  facebookConfig?: { liveVideoId?: string; fbTargetId?: string; accessToken: string };
  instagramConfig?: { liveMediaId?: string; igUserId?: string; accessToken: string };
  threadsConfig?: { mediaId?: string; accessToken: string };
  customConfig?: { chatPollUrl?: string; apiKey?: string };
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

class SocialChatService {
  private boothPollers: Map<string, BoothSocialPollerState> = new Map();
  private globalSeenWebhookIds: Set<string> = new Set();

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

    // 2. Real-Time NLP Auto-Claim Engine (STRICTLY ONLY genuine "CLAIM" or "MINE" commands)
    const isClaim = Boolean(
      newComment.isClaimIntent && streamController.isGenuineClaimMessage(cleanText, username)
    );

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
        const { priceAed, itemTitle } = resolveOpenClaimPriceAndTitle(parsedClaim, boothSession);
        if (priceAed && priceAed > 0) {
          try {
            const openRes = await executeOpenLiveClaim({
              boothId,
              username,
              platform: params.platform,
              rawComment: cleanText,
              commentId: newComment.id,
              priceAed,
              itemTitle
            });
            newComment.isClaimIntent = true;
            newComment.extractedSku = openRes.sku;
            newComment.isProcessed = true;
            claimedSku = openRes.sku;
            this.broadcastHostMessageToAllPlatforms(boothId, openRes.hostReplyText, '📢 Vintage Vibes Host').catch(() => {});
          } catch (openErr) {
            console.warn(`[SocialChat:${params.platform}] Open-live claim note:`, openErr);
          }
        } else if (canSendNeedPricePrompt(boothId, username)) {
          const needPriceText = buildNeedPriceReply(username);
          streamController.addComment(boothId, needPriceText, mappedPlatform, '📢 Vintage Vibes Host');
          this.broadcastHostMessageToAllPlatforms(boothId, needPriceText, '📢 Vintage Vibes Host').catch(() => {});
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
            this.broadcastHostMessageToAllPlatforms(boothId, hostReplyText, '📢 Vintage Vibes Host').catch(() => {});

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
    } else {
      // 3. Route live buying questions across ALL channels (TikTok, YouTube, Instagram, Facebook, Threads, Custom) to FIFO AI Voice Host
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
            this.broadcastHostMessageToAllPlatforms(boothId, aiReplySafe, '📢 Vintage Vibes Host').catch(() => {});
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
            `SELECT platform, account_username, account_password, auth_status, metadata, is_active
             FROM public.booth_social_channels
             WHERE booth_id = ANY($1::text[]) AND is_active = true`,
            [aliases]
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
            if (accessToken) {
              fbConfig = { accessToken, liveVideoId, fbTargetId: String(meta.fbTargetId || 'me').trim() };
            }
          } else if (plat === 'instagram') {
            const accessToken = meta.accessToken || globalKey?.access_token || (decryptedSecret.startsWith('EAA') || decryptedSecret.startsWith('IG') ? decryptedSecret : '');
            const liveMediaId = meta.liveMediaId || meta.mediaId || (username && /^\d{10,22}$/.test(username) ? username : undefined);
            const igUserId = meta.igUserId || undefined;
            if (accessToken) {
              igConfig = { accessToken, liveMediaId, igUserId };
            }
          } else if (plat === 'threads') {
            const accessToken = meta.accessToken || (decryptedSecret.startsWith('TH') || decryptedSecret.startsWith('IG') ? decryptedSecret : '');
            const mediaId = meta.mediaId || (username && /^\d{10,22}$/.test(username) ? username : undefined);
            if (accessToken) {
              thConfig = { accessToken, mediaId };
            }
          } else if (plat === 'custom') {
            if (meta.chatPollUrl) {
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
    this.stopBoothPoller(boothId);
    const existingSeen = this.boothPollers.get(boothId)?.seenMessageIds || new Set<string>();
    const pollerState: BoothSocialPollerState = {
      boothId,
      running: true,
      timer: null,
      seenMessageIds: existingSeen,
      facebookConfig: fbConfig,
      instagramConfig: igConfig,
      threadsConfig: thConfig,
      customConfig
    };
    this.boothPollers.set(boothId, pollerState);

    if (fbConfig) activeListeners.push('facebook');
    if (igConfig) activeListeners.push('instagram');
    if (thConfig) activeListeners.push('threads');
    if (customConfig) activeListeners.push('custom');

    if (fbConfig || igConfig || thConfig || customConfig) {
      const pollLoop = async () => {
        if (!pollerState.running) return;
        await this.pollSocialApisOnce(pollerState);
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

  private stopBoothPoller(boothId: string) {
    const existing = this.boothPollers.get(boothId);
    if (existing) {
      existing.running = false;
      if (existing.timer) clearTimeout(existing.timer);
      this.boothPollers.delete(boothId);
    }
  }

  private async pollSocialApisOnce(state: BoothSocialPollerState) {
    // 1. Facebook Live Graph API Polling
    if (state.facebookConfig?.accessToken) {
      try {
        const { accessToken } = state.facebookConfig;
        let { liveVideoId } = state.facebookConfig;
        if (!liveVideoId) {
          const activeFb = getActiveBoothFacebookSession(state.boothId);
          if (activeFb?.fbLiveVideoId) {
            liveVideoId = activeFb.fbLiveVideoId;
            state.facebookConfig.liveVideoId = liveVideoId;
          }
        }

        // Auto-discover active live_video ID from Page/User feed if not explicitly set
        if (!liveVideoId) {
          const fbTarget = state.facebookConfig.fbTargetId || 'me';
          const discoverRes = await fetch(
            `https://graph.facebook.com/v20.0/${encodeURIComponent(fbTarget)}/live_videos?broadcast_status=["LIVE"]&fields=id,status&limit=1&access_token=${encodeURIComponent(accessToken)}`,
            { signal: AbortSignal.timeout(4000) }
          );
          if (discoverRes.ok) {
            const dj = await discoverRes.json();
            if (dj?.data?.[0]?.id) {
              liveVideoId = dj.data[0].id;
              state.facebookConfig.liveVideoId = liveVideoId;
            }
          }
        }

        if (liveVideoId) {
          const fbRes = await fetch(
            `https://graph.facebook.com/v20.0/${encodeURIComponent(liveVideoId)}/comments?filter=stream&order=reverse_chronological&limit=15&fields=id,message,from,created_time&access_token=${encodeURIComponent(accessToken)}`,
            { signal: AbortSignal.timeout(4000) }
          );
          if (fbRes.ok) {
            const fbJson = await fbRes.json();
            const comments = Array.isArray(fbJson?.data) ? [...fbJson.data].reverse() : [];
            for (const c of comments) {
              if (!c?.id || !c?.message || state.seenMessageIds.has(`fb_${c.id}`)) continue;
              state.seenMessageIds.add(`fb_${c.id}`);
              const author = c.from?.name || 'Facebook Viewer';
              await this.processIncomingSocialComment({
                boothId: state.boothId,
                platform: 'facebook',
                username: author,
                commentText: c.message,
                externalMessageId: c.id
              });
            }
          }
        }
      } catch (_) {}
    }

    // 2. Instagram Live Graph API Polling
    if (state.instagramConfig?.accessToken) {
      try {
        const { accessToken, igUserId } = state.instagramConfig;
        let { liveMediaId } = state.instagramConfig;

        if (!liveMediaId && igUserId) {
          const discoverRes = await fetch(
            `https://graph.facebook.com/v20.0/${encodeURIComponent(igUserId)}/live_media?fields=id&access_token=${encodeURIComponent(accessToken)}`,
            { signal: AbortSignal.timeout(4000) }
          );
          if (discoverRes.ok) {
            const dj = await discoverRes.json();
            if (dj?.data?.[0]?.id) {
              liveMediaId = dj.data[0].id;
              state.instagramConfig.liveMediaId = liveMediaId;
            }
          }
        }

        if (liveMediaId) {
          const igRes = await fetch(
            `https://graph.facebook.com/v20.0/${encodeURIComponent(liveMediaId)}/live_comments?fields=id,text,timestamp,username,from&access_token=${encodeURIComponent(accessToken)}`,
            { signal: AbortSignal.timeout(4000) }
          );
          if (igRes.ok) {
            const igJson = await igRes.json();
            const comments = Array.isArray(igJson?.data) ? igJson.data : [];
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
          }
        }
      } catch (_) {}
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
    senderName = '📢 Vintage Vibes Host'
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

    // 2a. Facebook Live Comments Graph API
    const fbRow = chByPlat.get('facebook');
    if (fbRow || pollerState?.facebookConfig?.accessToken || globalKeyMap.get('facebook')?.access_token) {
      dispatchTasks.push(
        (async () => {
          try {
            const meta = fbRow?.metadata || {};
            const decPwd = decryptCredential(String(fbRow?.account_password || '').trim());
            const rawTok = String(
              meta.fbAccessToken ||
                meta.accessToken ||
                meta.pageAccessToken ||
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
            const fbTarget = String(meta.fbTargetId || pollerState?.facebookConfig?.fbTargetId || 'me').trim();

            if (!liveVideoId) {
              const disc = await fetch(
                `https://graph.facebook.com/v21.0/${encodeURIComponent(fbTarget)}/live_videos?broadcast_status=["LIVE"]&fields=id&limit=1&access_token=${encodeURIComponent(fbAccessToken)}`,
                { signal: AbortSignal.timeout(4000) }
              ).catch(() => null);
              if (disc && disc.ok) {
                const dj: any = await disc.json().catch(() => null);
                liveVideoId = String(dj?.data?.[0]?.id || '').trim();
              }
            }

            if (!liveVideoId) {
              platformResults.facebook = { delivered: false, note: 'Facebook connected, waiting for active Live Video ID' };
              return;
            }

            // Inspect LiveVideo to get underlying video.id & owner info, plus check /me/accounts for Page Access Token
            let underlyingVideoId = '';
            let ownerId = '';
            let ownerName = '';
            const lvMetaRes = await fetch(
              `https://graph.facebook.com/v21.0/${encodeURIComponent(liveVideoId)}?fields=id,from,video{id}&access_token=${encodeURIComponent(fbAccessToken)}`,
              { signal: AbortSignal.timeout(4000) }
            ).catch(() => null);
            if (lvMetaRes && lvMetaRes.ok) {
              const lvMeta: any = await lvMetaRes.json().catch(() => null);
              underlyingVideoId = String(lvMeta?.video?.id || '').trim();
              ownerId = String(lvMeta?.from?.id || '').trim();
              ownerName = String(lvMeta?.from?.name || '').trim();
            }

            let postToken = fbAccessToken;
            let pagesCount = 0;
            const accountsRes = await fetch(
              `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(fbAccessToken)}`,
              { signal: AbortSignal.timeout(4000) }
            ).catch(() => null);
            if (accountsRes && accountsRes.ok) {
              const accountsJson: any = await accountsRes.json().catch(() => null);
              const pages = Array.isArray(accountsJson?.data) ? accountsJson.data : [];
              pagesCount = pages.length;
              const matchedPage =
                (ownerId ? pages.find((p: any) => String(p.id) === ownerId) : null) || pages[0];
              if (matchedPage?.access_token) {
                postToken = String(matchedPage.access_token);
              }
            }

            const candidateTargets = Array.from(
              new Set([underlyingVideoId, liveVideoId].filter(Boolean))
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
              platformResults.facebook = { delivered: true, note: `Posted to Facebook Live (${postedTarget})` };
            } else if (pagesCount === 0) {
              platformResults.facebook = {
                delivered: false,
                note: `Facebook Personal Profile (${ownerName || 'Profile'}) par Meta API comment post block karta hai (viewer comments read ho saktay hain). Comment post ke liye Facebook Business Page use karein.`
              };
            } else {
              platformResults.facebook = {
                delivered: false,
                note: lastErr || 'Facebook API comment post failed'
              };
            }
          } catch (fbErr: any) {
            platformResults.facebook = { delivered: false, note: fbErr?.message || 'Facebook send error' };
          }
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
