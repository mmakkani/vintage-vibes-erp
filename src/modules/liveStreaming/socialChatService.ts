import { streamController } from '../../server/streamController.ts';
import { relationalStore } from '../../db/relationalStore.ts';
import { eventHub } from '../../server/events.ts';
import { getPgClient } from '../../db/pgPool.ts';
import { decryptCredential } from '../../utils/encryption.ts';
import { tikTokSocketService } from '../../server/tiktokSocketService.ts';
import { youTubeChatService } from './youtubeChatService.ts';

export type SocialPlatformKey = 'tiktok' | 'instagram' | 'facebook' | 'youtube' | 'threads' | 'custom';

interface BoothSocialPollerState {
  boothId: string;
  running: boolean;
  timer: NodeJS.Timeout | null;
  seenMessageIds: Set<string>;
  facebookConfig?: { liveVideoId?: string; accessToken: string };
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
    const newComment = streamController.addComment(boothId, cleanText, mappedPlatform, username);
    if (params.avatarUrl) {
      newComment.avatarUrl = params.avatarUrl;
    }
    if (params.platform === 'threads') {
      newComment.badge = 'THREADS';
    }

    // 2. Real-Time NLP Auto-Claim Engine (supports English & Urdu/Hindi live selling keywords)
    const claimPattern = /\b(?:claim|mine|bin|take|buy|sold|reserve|book|chahiye|lena\s*hai|mera\s*hai|pack|done)\b/i;
    const isClaim = newComment.isClaimIntent || claimPattern.test(cleanText);

    let claimedSku: string | undefined;
    let draftInvoice: any = null;

    if (isClaim) {
      const boothSession = streamController.getBooth(boothId);
      let targetSku = newComment.extractedSku || boothSession?.activeOnAirSku;

      if (!targetSku) {
        const skuPattern = /\b((?:VIN|VV|BAL|DXB)[A-Za-z0-9\-_]+|[A-Z]{2,4}-\d{3,6})\b/i;
        const skuMatch = cleanText.match(skuPattern);
        if (skuMatch) {
          targetSku = skuMatch[1].toUpperCase();
        }
      }

      if (!targetSku) {
        const storeAny = relationalStore as any;
        const allPieces = typeof storeAny.getStockPieces === 'function'
          ? storeAny.getStockPieces()
          : (storeAny.pieceBreakdowns || []);
        const inStock = allPieces.find((p: any) => !p.isSold && p.status === 'IN_STOCK');
        if (inStock) targetSku = inStock.barcode;
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

            const price = newComment.extractedBid || draftRes.piece?.lockedPrice || draftRes.piece?.retailPriceAed || 120;
            streamController.recordClaim(boothId, targetSku, price);

            // Synchronize reservation lock to PostgreSQL
            try {
              const client = await getPgClient();
              if (client) {
                await client.query(
                  `UPDATE public.inventory_pieces
                   SET status = 'RESERVED',
                       locked_by_buyer = $1,
                       locked_by_booth = $2,
                       locked_channel = $3,
                       lock_expires_at = $4,
                       updated_at = NOW()
                   WHERE LOWER(barcode) = LOWER($5) OR LOWER(sku) = LOWER($5);`,
                  [username, boothId, params.platform.toUpperCase(), Date.now() + 120 * 60 * 1000, targetSku]
                );
                await client.end().catch(() => {});
              }
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
                boothId,
                buyerHandle: username,
                platform: params.platform,
                source: `${params.platform.toUpperCase()}_LIVE_CHAT`
              }
            });
          }
        } catch (err) {
          console.warn(`[SocialChat:${params.platform}] Auto-claim note:`, err);
        }
      }
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

    const client = await getPgClient();
    if (client) {
      try {
        const chQ = await client.query(
          `SELECT platform, account_username, account_password, metadata, is_active
           FROM public.booth_social_channels
           WHERE booth_id = ANY($1::text[]) AND is_active = true`,
          [aliases]
        );

        const apiKeysQ = await client
          .query(`SELECT platform, access_token, api_key, server_url FROM public.streaming_api_keys WHERE is_connected = true`)
          .catch(() => ({ rows: [] as any[] }));

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
            if (username && !username.includes('not_linked') && !username.startsWith('@booth')) {
              tiktokHandle = username;
            }
          } else if (plat === 'facebook') {
            const accessToken = meta.accessToken || meta.pageAccessToken || globalKey?.access_token || (decryptedSecret.startsWith('EAA') ? decryptedSecret : '');
            const liveVideoId = meta.liveVideoId || meta.videoId || (username && /^\d{10,22}$/.test(username) ? username : undefined);
            if (accessToken) {
              fbConfig = { accessToken, liveVideoId };
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

        // Auto-discover active live_video ID from Page/User feed if not explicitly set
        if (!liveVideoId) {
          const discoverRes = await fetch(
            `https://graph.facebook.com/v20.0/me/live_videos?broadcast_status=["LIVE"]&fields=id,status&limit=1&access_token=${encodeURIComponent(accessToken)}`,
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
}

const globalForSocialChat = globalThis as unknown as { __vvSocialChatService?: SocialChatService };
export const socialChatService =
  globalForSocialChat.__vvSocialChatService || (globalForSocialChat.__vvSocialChatService = new SocialChatService());
