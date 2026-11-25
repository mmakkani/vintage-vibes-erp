import { streamController } from '../../server/streamController.ts';
import { relationalStore } from '../../db/relationalStore.ts';
import { eventHub } from '../../server/events.ts';
import { getPgClient } from '../../db/pgPool.ts';
import { marketingService } from '../marketing/marketing.service.ts';
import { liveStreamAgentService } from '../marketing/liveStreamAgent.service.ts';
import {
  parseLiveClaimDetails,
  shouldHandleAsOpenLiveClaim,
  resolveOpenClaimPriceAndTitle,
  executeOpenLiveClaim,
  canSendNeedPricePrompt,
  buildNeedPriceReply
} from './openLiveClaimHelper.ts';
import crypto from 'crypto';

interface ActivePollerState {
  boothId: string;
  cleanInput: string;
  running: boolean;
  isRefreshing: boolean;
  refreshPromise: Promise<void> | null;
  timer: NodeJS.Timeout | null;
  discoveryTimer: NodeJS.Timeout | null;
  streams: Map<string, { apiKey: string; continuation: string; sendParams?: string }>;
  seenMessageIds: Set<string>;
}

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9'
};

export const EMOJI_SHORTCODE_MAP: Record<string, string> = {
  man_raising_hand: '🙋‍♂️',
  woman_raising_hand: '🙋‍♀️',
  raising_hand: '🙋',
  person_raising_hand: '🙋',
  wave: '👋',
  waving_hand: '👋',
  hand_pink_waving: '👋',
  raised_hand: '✋',
  hand_orange_raised: '✋',
  raised_hands: '🙌',
  clap: '👏',
  clapping_hands: '👏',
  pray: '🙏',
  folded_hands: '🙏',
  thumbs_up: '👍',
  thumbsup: '👍',
  '+1': '👍',
  thumbs_down: '👎',
  '-1': '👎',
  ok_hand: '👌',
  muscle: '💪',
  flexed_biceps: '💪',
  handshake: '🤝',
  joy: '😂',
  face_with_tears_of_joy: '😂',
  rofl: '🤣',
  rolling_on_the_floor_laughing: '🤣',
  smile: '😄',
  grinning: '😄',
  face_yellow_smiling: '😄',
  face_green_smiling: '😄',
  blush: '😊',
  slightly_smiling_face: '😊',
  face_blue_smiling: '😊',
  heart_eyes: '😍',
  smiling_face_with_heart_eyes: '😍',
  eyes_pink_heart_shape: '😍',
  face_red_heart_shape: '😍',
  smiling_face_with_3_hearts: '🥰',
  smiling_face_with_hearts: '🥰',
  kissing_heart: '😘',
  sunglasses: '😎',
  star_struck: '🤩',
  wink: '😉',
  thinking: '🤔',
  thinking_face: '🤔',
  pleading_face: '🥺',
  cry: '😢',
  crying_face: '😢',
  face_purple_crying: '😢',
  sob: '😭',
  loudly_crying_face: '😭',
  frowning: '☹️',
  face_orange_frowning: '☹️',
  see_no_evil: '🙈',
  face_turquoise_covering_eyes: '🙈',
  astonished: '😮',
  open_mouth: '😮',
  rage: '😡',
  angry: '😡',
  poop: '💩',
  face_fuchsia_poop_shape: '💩',
  heart: '❤️',
  red_heart: '❤️',
  pink_heart: '🩷',
  orange_heart: '🧡',
  yellow_heart: '💛',
  green_heart: '💚',
  blue_heart: '💙',
  purple_heart: '💜',
  sparkling_heart: '💖',
  fire: '🔥',
  '100': '💯',
  hundred_points: '💯',
  sparkles: '✨',
  star: '⭐',
  crown: '👑',
  gem: '💎',
  moneybag: '💰',
  money_bag: '💰',
  shopping_bags: '🛍️',
  package: '📦',
  tada: '🎉',
  party_popper: '🎉',
  white_check_mark: '✅',
  check_mark_button: '✅',
  check_mark: '✅',
  eyes: '👀',
  trophy: '🏆',
  rocket: '🚀',
  zap: '⚡',
  coat: '🧥',
  shirt: '👕',
  tshirt: '👕',
  billed_cap: '🧢',
  athletic_shoe: '👟'
};

export function normalizeEmojiShortcodes(input: string): string {
  if (!input || !input.includes(':')) return String(input || '');
  return String(input).replace(/:([a-zA-Z0-9_+-]+):/g, (full, rawKey) => {
    const key = String(rawKey).toLowerCase().replace(/-/g, '_');
    if (EMOJI_SHORTCODE_MAP[key]) return EMOJI_SHORTCODE_MAP[key];
    if (key.includes('waving')) return '👋';
    if (key.includes('raising_hand')) return '🙋';
    if (key.includes('heart')) return '❤️';
    if (key.includes('fire') || key.includes('flame')) return '🔥';
    if (key.includes('crying') || key.includes('tear')) return '😢';
    if (key.includes('smiling') || key.includes('smile')) return '😊';
    if (key.includes('laugh') || key.includes('rofl')) return '😂';
    if (key.includes('thumb')) return '👍';
    if (key.includes('clap')) return '👏';
    if (key.includes('party') || key.includes('confetti')) return '🎉';
    if (key.includes('crown')) return '👑';
    if (key.includes('cool') || key.includes('sunglass')) return '😎';
    if (key.includes('star')) return '⭐';
    if (key === 'ok' || key.endsWith('_ok')) return '👌';
    return full;
  });
}

export function resolveYouTubeRunText(r: any): string {
  if (!r) return '';
  if (r.text) return String(r.text);
  const em = r.emoji;
  if (!em) return '';
  if (!em.isCustomEmoji && typeof em.emojiId === 'string' && em.emojiId.length > 0 && !/^[A-Za-z0-9_/:.-]+$/.test(em.emojiId)) {
    return em.emojiId;
  }
  const accLabel = em.image?.accessibility?.accessibilityData?.label;
  if (typeof accLabel === 'string' && /[^\x00-\x7F]/.test(accLabel)) {
    return accLabel;
  }
  const rawShortcut = em.shortcuts?.[0] || (em.searchTerms?.[0] ? `:${em.searchTerms[0]}:` : '');
  return rawShortcut ? normalizeEmojiShortcodes(String(rawShortcut)) : '';
}

class YouTubeChatService {
  private activePollers: Map<string, ActivePollerState> = new Map();
  private lastKnownInputs: Map<string, string> = new Map();
  private latestHostBroadcasts: Map<string, { text: string; sender: string; timestamp: number }> = new Map();
  private liveChatIdCache: Map<string, string> = new Map();
  private recentSentFingerprints: Map<string, number> = new Map();
  private activeOAuthDiscoveryCache: Map<string, { checkedAt: number; ids: string[] }> = new Map();
  private hasOAuthCache: {
    checkedAt: number;
    canSend: boolean;
    channelTitle?: string;
    autoLiveEnabled?: boolean;
  } = { checkedAt: 0, canSend: false };

  private recordSentFingerprint(messageText: string): void {
    const fp = String(messageText || '').trim().slice(0, 80).toLowerCase();
    if (!fp) return;
    const now = Date.now();
    this.recentSentFingerprints.set(fp, now);
    if (this.recentSentFingerprints.size > 100) {
      for (const [k, ts] of this.recentSentFingerprints.entries()) {
        if (now - ts > 90_000) this.recentSentFingerprints.delete(k);
      }
    }
  }

  private hasRecentSentFingerprint(messageText: string): boolean {
    const fp = String(messageText || '').trim().slice(0, 80).toLowerCase();
    if (!fp) return false;
    const ts = this.recentSentFingerprints.get(fp);
    if (!ts) return false;
    if (Date.now() - ts <= 90_000) return true;
    this.recentSentFingerprints.delete(fp);
    return false;
  }

  private isSelfOrBotMessage(username: string, text: string): boolean {
    const cleanUser = String(username || '').trim();
    const cleanText = String(text || '').trim();
    if (
      /Auto-Claim Bot|VintageVibesHost|Vintage Vibes Host|VintageVibesLLCSPC|Vintage\s*Vibes\s*LLC|VintageVibes\s*Clo|Vintage\s*Vibes\s*Official|Vintage\s*Vibes\s*Al\s*Ain|Vintage\s*Vibes\s*UAE/i.test(
        cleanUser
      )
    ) {
      return true;
    }
    const cachedTitleNorm = String(this.hasOAuthCache.channelTitle || '')
      .replace(/[^a-z0-9]/gi, '')
      .toLowerCase();
    const userNorm = cleanUser.replace(/[^a-z0-9]/gi, '').toLowerCase();
    if (cachedTitleNorm && userNorm && userNorm === cachedTitleNorm) {
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

  constructor() {
    // Do not auto-connect to ended streams on boot; connect when stream starts or operator clicks Sync
  }

  public registerKnownLiveBroadcast(rawBoothId: string, videoId: string, liveChatId?: string) {
    const boothId = this.normalizeBoothId(rawBoothId);
    const cleanVid = String(videoId || '').trim();
    if (!/^[a-zA-Z0-9_-]{11}$/.test(cleanVid)) return;
    this.lastKnownInputs.set(boothId, cleanVid);
    if (liveChatId) {
      this.liveChatIdCache.set(cleanVid, String(liveChatId).trim());
    }
  }

  public invalidateOAuthCache() {
    this.hasOAuthCache = { checkedAt: 0, canSend: false, channelTitle: undefined, autoLiveEnabled: false };
    this.canSendOutboundChat().catch(() => {});
  }

  public async canSendOutboundChat(): Promise<boolean> {
    if (process.env.YOUTUBE_OAUTH_ACCESS_TOKEN) {
      this.hasOAuthCache = { checkedAt: Date.now(), canSend: true, autoLiveEnabled: true };
      return true;
    }
    try {
      const client = await getPgClient();
      if (client) {
        try {
          const q = await client.query(
            `SELECT session_cookies, metadata
             FROM public.booth_social_channels
             WHERE platform = 'youtube'
             ORDER BY ((metadata->>'oauthRefreshToken') IS NOT NULL) DESC, ((metadata->>'oauthAccessToken') IS NOT NULL) DESC, (auth_status = 'LOGGED_IN') DESC
             LIMIT 1`
          );
          const row = q.rows?.[0];
          const meta = row?.metadata || {};
          const cookies = Array.isArray(row?.session_cookies) ? row.session_cookies : [];
          const hasRealCookies =
            cookies.some((c: any) => c?.name === 'SAPISID' || c?.name === '__Secure-3PAPISID') ||
            /SAPISID|__Secure-3PAPISID/i.test(String(meta.cookieHeader || ''));
          const hasOAuth = Boolean(meta.oauthAccessToken || meta.oauthRefreshToken);
          const ok = Boolean(hasOAuth || hasRealCookies);
          this.hasOAuthCache = {
            checkedAt: Date.now(),
            canSend: ok,
            channelTitle: meta.youtubeChannelTitle ? String(meta.youtubeChannelTitle) : undefined,
            autoLiveEnabled: hasOAuth
          };
          return ok;
        } finally {
          await client.end().catch(() => {});
        }
      }
    } catch (_) {}
    this.hasOAuthCache = { checkedAt: Date.now(), canSend: false, autoLiveEnabled: false };
    return false;
  }

  private normalizeBoothId(boothId: string): string {
    const raw = String(boothId || 'booth-1').trim().toLowerCase();
    const num = parseInt(raw.replace(/^booth[-_]?0*/i, ''), 10) || 1;
    return `booth-${num}`;
  }

  private async discoverActiveOAuthBroadcastIds(boothId: string): Promise<string[]> {
    const now = Date.now();
    const cached = this.activeOAuthDiscoveryCache.get(boothId);
    if (cached && now - cached.checkedAt < 20_000) {
      return cached.ids;
    }

    let accessToken = String(process.env.YOUTUBE_OAUTH_ACCESS_TOKEN || '').trim();
    if (!accessToken) {
      try {
        const client = await getPgClient();
        if (client) {
          try {
            const aliases = Array.from(new Set([boothId, boothId.replace('-', '-0')]));
            const q = await client.query(
              `SELECT metadata
               FROM public.booth_social_channels
               WHERE platform = 'youtube'
                 AND booth_id = ANY($1::text[])
               ORDER BY ((metadata->>'oauthAccessToken') IS NOT NULL) DESC, (auth_status = 'LOGGED_IN') DESC
               LIMIT 1`,
              [aliases]
            );
            const md = q.rows?.[0]?.metadata || {};
            const exp = Number(md.oauthExpiresAt || 0);
            if (md.oauthAccessToken && (!exp || now < exp - 10_000)) {
              accessToken = String(md.oauthAccessToken).trim();
            }
          } finally {
            await client.end().catch(() => {});
          }
        }
      } catch (_) {}
    }

    if (!accessToken) {
      this.activeOAuthDiscoveryCache.set(boothId, { checkedAt: now, ids: [] });
      return [];
    }

    const ids: string[] = [];
    try {
      const res = await fetch(
        'https://www.googleapis.com/youtube/v3/liveBroadcasts?part=id,status&broadcastStatus=active&broadcastType=all&maxResults=10',
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(4000)
        }
      );
      if (res.ok) {
        const data: any = await res.json().catch(() => null);
        for (const it of data?.items || []) {
          const vid = String(it?.id || '').trim();
          const life = String(it?.status?.lifeCycleStatus || '').toLowerCase();
          if (/^[a-zA-Z0-9_-]{11}$/.test(vid) && (!life || life === 'live') && !ids.includes(vid)) {
            ids.push(vid);
          }
        }
      }
    } catch (_) {}

    this.activeOAuthDiscoveryCache.set(boothId, { checkedAt: now, ids });
    return ids;
  }

  /**
   * Discover candidate 11-char videoIds from user input + known store handles (@murtazamakkani5608 & @VintageVibesLLCSPC)
   * Strictly filters for currently active LIVE broadcasts (ignoring ended/archived streams).
   */
  private async discoverCandidateVideoIds(cleanInput: string): Promise<string[]> {
    const candidates: string[] = [];
    const addCandidate = (id?: string | null) => {
      if (id && /^[a-zA-Z0-9_-]{11}$/.test(id) && !candidates.includes(id)) {
        candidates.push(id);
      }
    };

    // 1. Check if input directly contains a video ID
    const vMatch = cleanInput.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    const shortMatch = cleanInput.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    const studioMatch = cleanInput.match(/\/video\/([a-zA-Z0-9_-]{11})/);
    const liveMatch = cleanInput.match(/live\/([a-zA-Z0-9_-]{11})/);

    if (vMatch) addCandidate(vMatch[1]);
    else if (shortMatch) addCandidate(shortMatch[1]);
    else if (studioMatch) addCandidate(studioMatch[1]);
    else if (liveMatch) addCandidate(liveMatch[1]);
    else if (/^[a-zA-Z0-9_-]{11}$/.test(cleanInput)) addCandidate(cleanInput);

    // 2. Discover active live streams from channel handles in parallel (only if no explicit video ID was given)
    const handlesToCheck = new Set<string>();
    if (cleanInput.startsWith('@')) {
      handlesToCheck.add(cleanInput);
    } else if (cleanInput.includes('youtube.com/@')) {
      const h = '@' + cleanInput.split('youtube.com/@')[1]?.split('/')[0]?.split('?')[0];
      if (h.length > 2) handlesToCheck.add(h);
    }
    if (candidates.length === 0 && handlesToCheck.size === 0) {
      handlesToCheck.add('@VintageVibesLLCSPC');
      handlesToCheck.add('@murtazamakkani5608');
    }

    await Promise.all(
      Array.from(handlesToCheck).map(async (handle) => {
        try {
          // Check /live endpoint first (resolves to the active live stream when channel is live)
          const liveRes = await fetch(`https://www.youtube.com/${handle}/live`, {
            headers: BROWSER_HEADERS,
            signal: AbortSignal.timeout(5000)
          });
          if (liveRes.ok) {
            const liveHtml = await liveRes.text();
            const isCurrentlyLive =
              liveHtml.includes('"isLive":true') ||
              liveHtml.includes('"isLiveNow":true') ||
              liveHtml.includes('BADGE_STYLE_TYPE_LIVE_NOW');
            if (isCurrentlyLive) {
              const canonMatch = liveHtml.match(/canonical"\s+href="https:\/\/www\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})"/);
              const detailsMatch = liveHtml.match(/"videoDetails":\{"videoId":"([a-zA-Z0-9_-]{11})"/);
              if (canonMatch?.[1]) addCandidate(canonMatch[1]);
              if (detailsMatch?.[1]) addCandidate(detailsMatch[1]);
            }
          }

          // Also check /streams for any stream explicitly badged as LIVE_NOW
          const res = await fetch(`https://www.youtube.com/${handle}/streams`, {
            headers: BROWSER_HEADERS,
            signal: AbortSignal.timeout(5000)
          });
          if (res.ok) {
            const html = await res.text();
            if (html.includes('BADGE_STYLE_TYPE_LIVE_NOW')) {
              const liveBlocks = html.split('BADGE_STYLE_TYPE_LIVE_NOW');
              for (let i = 0; i < liveBlocks.length - 1; i++) {
                const windowSlice = liveBlocks[i].slice(-1800) + liveBlocks[i + 1].slice(0, 1800);
                const matches = [...windowSlice.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)];
                for (const m of matches) {
                  addCandidate(m[1]);
                }
              }
            }
          }
        } catch (_) {}
      })
    );

    return candidates;
  }

  /**
   * Fetch YouTube's /live_chat?v=VIDEO_ID page and extract INNERTUBE_API_KEY + unfiltered "All messages" continuation token.
   * Rejects ended/archived streams where live_chat is in replay mode ("isReplay":true).
   */
  private async initStreamChatSession(videoId: string): Promise<{ apiKey: string; continuation: string; sendParams?: string } | null> {
    try {
      const res = await fetch(`https://www.youtube.com/live_chat?v=${videoId}`, {
        headers: BROWSER_HEADERS,
        signal: AbortSignal.timeout(6000)
      });
      if (!res.ok) return null;
      const html = await res.text();

      // Reject ended streams whose chat has switched to Replay mode
      if (html.includes('"isReplay":true') || html.includes('liveChatReplayContinuation')) {
        return null;
      }

      const apiKey = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1];
      const continuations = [...html.matchAll(/"continuation":"([^"]+)"/g)].map(m => m[1]);
      if (!apiKey || continuations.length === 0) return null;

      const sendParams = html.match(/"sendLiveChatMessageEndpoint":\{"params":"([^"]+)"\}/)?.[1];

      // Index 2 or 1 is "Live chat (All messages visible)", whereas index 0 is "Top chat" which filters short messages like "hi" or "claim"
      const preferredContinuation =
        continuations[2] || continuations[1] || continuations[0];

      return { apiKey, continuation: preferredContinuation, sendParams };
    } catch (_) {
      return null;
    }
  }

  /**
   * Process a single YouTube Live Chat message and trigger NLP Auto-Claim if applicable
   */
  private async handleIncomingMessage(boothId: string, authorName: string, text: string, externalMessageId?: string) {
    const cleanText = text.trim();
    if (!cleanText) return;
    const username = authorName.startsWith('@') ? authorName : `@${authorName}`;

    const isSystemOrHost = this.isSelfOrBotMessage(username, cleanText);
    const hasEchoSignature =
      this.hasRecentSentFingerprint(cleanText) ||
      /📲\s*WhatsApp AI:|🔗\s*Instant Checkout:|Guaranteed Lock Confirmed|VV-90S-8920|@VintageVibesLLCSPC/i.test(
        cleanText
      );
    if (isSystemOrHost && hasEchoSignature) {
      return;
    }

    // 1. Add comment to streamController live feed (broadcasts SSE LIVE_COMMENT immediately, deduplicated via externalId)
    const newComment = streamController.addComment(
      boothId,
      cleanText,
      'youtube',
      username,
      externalMessageId ? `yt:${externalMessageId}` : undefined
    );
    if ((newComment as any).__duplicate) {
      return;
    }

    console.log(`[YouTubeChat] 💬 [${username}] (${boothId}): "${cleanText}"`);

    // Ensure unique millisecond timestamp for consecutive messages in the same batch
    await new Promise(r => setTimeout(r, 2));

    // 2. Real-Time NLP Auto-Claim Engine (STRICTLY ONLY genuine "CLAIM" or "MINE" commands, never viewer/bot messages)
    const isClaim =
      !isSystemOrHost &&
      Boolean(newComment.isClaimIntent && streamController.isGenuineClaimMessage(cleanText, username));

    if (isClaim) {
      console.log(`[YouTubeChat] 🎯 CLAIM INTENT DETECTED from ${username}: "${cleanText}"`);
      const boothSession = streamController.getBooth(boothId);
      const parsedClaim = parseLiveClaimDetails(cleanText, newComment.extractedSku);
      let pinnedTitle: string | undefined;
      let pinnedSku: string | undefined;
      try {
        const { getBoothPinnedPiece } = await import('./rtmpRelayServer.ts');
        const pinned = getBoothPinnedPiece(boothId);
        pinnedTitle = pinned?.title;
        pinnedSku = pinned?.sku;
      } catch (_) {}

      const isOpenLiveClaim = shouldHandleAsOpenLiveClaim({
        boothSession,
        parsed: parsedClaim,
        pinnedTitle
      });

      if (isOpenLiveClaim) {
        const { priceAed, itemTitle } = resolveOpenClaimPriceAndTitle(parsedClaim, boothSession);
        if (priceAed && priceAed > 0) {
          try {
            const openRes = await executeOpenLiveClaim({
              boothId,
              username,
              platform: 'youtube',
              rawComment: cleanText,
              commentId: newComment.id,
              priceAed,
              itemTitle
            });
            newComment.extractedSku = openRes.sku;
            newComment.isProcessed = true;
            import('./socialChatService.ts')
              .then(({ socialChatService }) =>
                socialChatService.broadcastHostMessageToAllPlatforms(boothId, openRes.hostReplyText, '📢 Vintage Vibes Host')
              )
              .catch(() => {
                this.sendMessageToYouTubeChat(boothId, openRes.hostReplyText, '📢 Vintage Vibes Host').catch(() => {});
              });
          } catch (openErr) {
            console.error('[YouTubeChat] Open-live claim error:', openErr);
          }
        } else if (canSendNeedPricePrompt(boothId, username)) {
          const needPriceText = buildNeedPriceReply(username);
          streamController.addComment(boothId, needPriceText, 'youtube', '📢 Vintage Vibes Host');
          import('./socialChatService.ts')
            .then(({ socialChatService }) =>
              socialChatService.broadcastHostMessageToAllPlatforms(boothId, needPriceText, '📢 Vintage Vibes Host')
            )
            .catch(() => {
              this.sendMessageToYouTubeChat(boothId, needPriceText, '📢 Vintage Vibes Host').catch(() => {});
            });
        }
      } else {
        let targetSku = parsedClaim.extractedSku || pinnedSku || boothSession?.activeOnAirSku;

        // Also check PostgreSQL live_booths / inventory_pieces / bale_sorted_pieces so we verify exact SKU availability
        const storeAny = relationalStore as any;
        try {
          const client = await getPgClient();
          if (client) {
            try {
              if (!targetSku) {
                const boothNum = parseInt(boothId.replace(/\D/g, ''), 10) || 1;
                const aliases = [`booth-${boothNum}`, `booth-0${boothNum}`, `booth_${boothNum}`, `booth_0${boothNum}`];
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
                } else {
                  const bRes = await client.query(
                    `SELECT active_product_sku FROM public.live_booths WHERE id = ANY($1::text[]) AND active_product_sku IS NOT NULL LIMIT 1`,
                    [aliases]
                  ).catch(() => ({ rows: [] as any[] }));
                  if (bRes.rows?.[0]?.active_product_sku) {
                    targetSku = String(bRes.rows[0].active_product_sku).trim();
                  }
                }
              }

              // Verify targetSku is actually IN_STOCK and not already SOLD or RESERVED in PostgreSQL
              if (targetSku) {
                const invCheck = await client.query(
                  `SELECT barcode, status, is_sold FROM public.inventory_pieces WHERE UPPER(barcode) = UPPER($1) LIMIT 1`,
                  [targetSku]
                );
                if (invCheck.rows.length > 0) {
                  const r = invCheck.rows[0];
                  if (r.is_sold || r.status === 'SOLD' || r.status === 'RESERVED' || r.status === 'CLAIMED_PENDING') {
                    targetSku = undefined;
                  }
                }
              }

              if (targetSku && Array.isArray(storeAny.inventoryPieces)) {
                let memPiece = storeAny.inventoryPieces.find(
                  (p: any) => String(p.barcode || '').toUpperCase() === targetSku!.toUpperCase()
                );
                if (!memPiece) {
                  const pRes = await client.query(
                    `SELECT * FROM public.bale_sorted_pieces WHERE UPPER(barcode) = UPPER($1) OR id::text = $1 LIMIT 1`,
                    [targetSku]
                  );
                  const row = pRes.rows?.[0];
                  if (row) {
                    memPiece = {
                      id: row.id || row.barcode,
                      barcode: row.barcode,
                      itemName: row.item_name || row.category || 'Authentic Vintage Piece',
                      brandName: row.brand_name || row.brand || 'Vintage Archive',
                      style: row.style || row.sub_category || 'Vintage Classic',
                      category: row.category || 'Apparel',
                      sizeScanned: row.size_scanned || row.size || 'L',
                      labelGrade: row.label_grade || row.condition_grade || 'Grade A',
                      countryOfOrigin: row.country_of_origin || 'USA',
                      retailPriceAed: Number(row.retail_price_aed || row.estimated_price || 150),
                      estimatedPrice: Number(row.estimated_price || row.retail_price_aed || 150),
                      costPrice: Number(row.cost_price || 45),
                      frontImageUrl: row.front_image_url || row.image_url || '',
                      backImageUrl: row.back_image_url || row.front_image_url || '',
                      tagImageUrl: row.tag_image_url || row.front_image_url || '',
                      status: 'IN_STOCK',
                      isSold: false
                    };
                    storeAny.inventoryPieces.unshift(memPiece);
                  }
                } else if (memPiece.isSold || memPiece.status === 'SOLD' || memPiece.status === 'RESERVED') {
                  targetSku = undefined;
                }
              }
            } finally {
              await client.end().catch(() => {});
            }
          }
        } catch (_) {}

        if (targetSku) {
          try {
            const draftRes = relationalStore.draftLiveClaimInvoice({
              barcode: targetSku,
              buyerHandle: username,
              boothId,
              offeredPrice: newComment.extractedBid,
              channel: 'YOUTUBE'
            });

            if (draftRes.success && draftRes.piece) {
              newComment.extractedSku = targetSku;
              newComment.isProcessed = true;
              streamController.markBuyerClaimCommentLocked(boothId, username, targetSku, newComment.id);
              const piece = draftRes.piece;
              const priceAed = Number(piece.lockedPrice || piece.retailPriceAed || piece.estimatedPrice || 150);
              const invoiceNo = draftRes.draftInvoice?.invoiceNo || `SLS-DRAFT-LIVE-${Date.now().toString().slice(-4)}`;
              const checkoutUrl = `https://vintagevibesgk.com/?checkout=${encodeURIComponent(targetSku)}`;
              const claimId = `claim-${Date.now()}`;
              const brandName = piece.brandName || 'Vintage Archive';
              const itemName = piece.itemName || 'Vintage Piece';
              const fullTitle = itemName.toLowerCase().includes(brandName.toLowerCase())
                ? itemName
                : `${brandName} ${itemName}`.trim();
              const sizeLabel = piece.sizeScanned || 'L';
              const waClaimLink = `https://wa.me/971554186086?text=${encodeURIComponent(`CLAIM ${targetSku} ${invoiceNo} (${username})`)}`;

              const hostReplyText =
                `🎉 Congratulations ${username}! Guaranteed Lock Confirmed for ${fullTitle} (Size: ${sizeLabel}) • SKU: ${targetSku} • Price: AED ${priceAed} • Draft Invoice: #${invoiceNo} • 📲 Contact Our Official WhatsApp AI Now to Confirm Address & Invoice: +971 55 418 6086 (${waClaimLink}) • Checkout: ${checkoutUrl}`;

              console.log(`[YouTubeChat] 🎉 AUTO-BOOKED SKU ${targetSku} for ${username}! Draft Invoice: ${invoiceNo}`);

              // 1. Add Official Reply from '📢 Vintage Vibes Host' directly into StreamController so the Live Chat feed shows the Host reply!
              streamController.addComment(boothId, hostReplyText, 'youtube', '📢 Vintage Vibes Host');

              // 2. Sync reservation to PostgreSQL inventory_pieces
              try {
                const client = await getPgClient();
                if (client) {
                  try {
                    await client.query(`
                      UPDATE public.inventory_pieces
                      SET status = 'RESERVED',
                          locked_by_buyer = $1,
                          locked_by_booth = $2,
                          lock_expires_at = $3,
                          updated_at = NOW()
                      WHERE UPPER(barcode) = UPPER($4);
                    `, [username, boothId, Date.now() + 120 * 60 * 1000, targetSku]).catch(() => {});
                  } finally {
                    await client.end().catch(() => {});
                  }
                }
              } catch (_) {}

              // 3. Record Claim in MarketingService (in-memory + PostgreSQL marketing_claim_logs + sales_invoices + WhatsApp Notification to Owner & Buyer)
              const claimRecord = {
                id: claimId,
                timestamp: new Date().toLocaleTimeString(),
                customerHandle: username,
                platform: 'youtube' as const,
                rawComment: cleanText,
                matchedKeyword: 'MINE/CLAIM',
                sku: targetSku,
                itemName: `${fullTitle} (Size ${sizeLabel})`,
                itemImage: piece.frontImageUrl || '',
                priceAed,
                invoiceNo,
                status: 'LOCK_ACTIVE' as const,
                replyDispatched: hostReplyText,
                checkoutUrl,
                lockExpiresAt: Date.now() + 15 * 60 * 1000,
                boothId
              };
              marketingService.recordLiveStreamClaimAndNotifyWhatsApp(claimRecord, piece).catch(() => {});

              // 4. Broadcast live claim mutation to all connected ERP tabs & HUD
              eventHub.broadcast({
                type: 'ENTITY_MUTATED',
                module: 'SALES',
                entity: 'LIVE_CLAIM',
                action: 'CREATE',
                documentRef: targetSku,
                data: {
                  claimRecord,
                  piece,
                  draftInvoice: draftRes.draftInvoice,
                  invoiceNo,
                  priceAed,
                  checkoutUrl,
                  boothId,
                  buyerHandle: username,
                  rawComment: cleanText,
                  timestamp: new Date().toLocaleTimeString(),
                  source: 'YOUTUBE_LIVE_CHAT'
                }
              });

              // 5. Post Official Host Reply to ALL Connected Live Platforms (YouTube, Facebook, IG, TikTok, Video HUD) as '📢 Vintage Vibes Host'
              import('./socialChatService.ts')
                .then(({ socialChatService }) =>
                  socialChatService.broadcastHostMessageToAllPlatforms(boothId, hostReplyText, '📢 Vintage Vibes Host')
                )
                .catch(() => {
                  this.sendMessageToYouTubeChat(boothId, hostReplyText, '📢 Vintage Vibes Host').catch(() => {});
                });

              // 6. Announce Claim & Official WhatsApp Number via AI Host Voice on Stream
              liveStreamAgentService
                .announceLiveEventOnStream({
                  boothId,
                  eventType: 'ITEM_SOLD',
                  spokenScript: `Mubarak ho ${username.replace(/^@/, '')}! Yeh 1-of-1 ${fullTitle} Size ${sizeLabel} aap ke naam par ${priceAed} Dirhams mein lock ho gaya hai, aur aap ka Draft Invoice number ${invoiceNo} ban gaya hai! Apna order aur address confirm karne ke liye abhi hamaray official WhatsApp number Plus 9 7 1, 5 5, 4 1 8, 6 0 8 6 par rabta karein!`,
                  lang: 'ROMAN_URDU',
                  synthesizeAudio: true
                })
                .catch(() => {});
            }
          } catch (claimErr) {
            console.error(`[YouTubeChat] Error drafting auto-claim:`, claimErr);
          }
        }
      }
    } else if (!isSystemOrHost && process.env.ENABLE_LIVE_AI_CHAT_AUTOREPLY === '1') {
      // Forward non-claim viewer questions on YouTube Live to AI Voice Host & reply as '📢 Vintage Vibes Host' (opt-in only)
      liveStreamAgentService
        .ingestLiveStreamComment({
          boothId,
          platform: 'youtube',
          username,
          commentText: cleanText
        })
        .then(res => {
          if (res?.isRelevantBuyingQuery && res?.spokenTextReply) {
            const aiReplyWithWa = `${res.spokenTextReply} • 📲 WhatsApp AI: +971 55 418 6086`;
            streamController.addComment(boothId, aiReplyWithWa, 'youtube', '📢 Vintage Vibes Host');
            import('./socialChatService.ts')
              .then(({ socialChatService }) =>
                socialChatService.broadcastHostMessageToAllPlatforms(boothId, aiReplyWithWa, '📢 Vintage Vibes Host')
              )
              .catch(() => {
                this.sendMessageToYouTubeChat(boothId, aiReplyWithWa, '📢 Vintage Vibes Host').catch(() => {});
              });
          }
        })
        .catch(() => {});
    }
  }

  /**
   * Poll Innertube get_live_chat for all active streams of a booth every 1.2s
   */
  private async pollStreamsOnce(state: ActivePollerState) {
    if (!state.running) return;

    const entries = Array.from(state.streams.entries());
    for (const [vid, session] of entries) {
      if (!state.running) return;
      try {
        const res = await fetch(`https://www.youtube.com/youtubei/v1/live_chat/get_live_chat?key=${session.apiKey}`, {
          method: 'POST',
          headers: {
            ...BROWSER_HEADERS,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            context: {
              client: {
                clientName: 'WEB',
                clientVersion: '2.20241010.01.00'
              }
            },
            continuation: session.continuation
          }),
          signal: AbortSignal.timeout(4000)
        });

        if (!res.ok) continue;
        const data = await res.json();
        const chatCont = data?.continuationContents?.liveChatContinuation;
        if (!chatCont || chatCont.isReplay) {
          // Stream has ended on YouTube (do NOT wipe multi-platform booth chat)
          state.streams.delete(vid);
          if (state.streams.size === 0) {
            eventHub.broadcast({
              type: 'ENTITY_MUTATED',
              module: 'SALES',
              entity: 'YOUTUBE_CHAT_STATUS',
              action: 'UPDATE',
              documentRef: state.boothId,
              data: { boothId: state.boothId, status: 'DISCONNECTED', liveId: null, reason: 'STREAM_ENDED' }
            });
          }
          continue;
        }

        const nextCont =
          chatCont.continuations?.[0]?.invalidationContinuationData?.continuation ||
          chatCont.continuations?.[0]?.timedContinuationData?.continuation ||
          chatCont.continuations?.[0]?.reloadContinuationData?.continuation;

        if (nextCont) {
          session.continuation = nextCont;
        } else {
          // No more live continuations -> YouTube broadcast ended (do NOT wipe multi-platform booth chat)
          state.streams.delete(vid);
          if (state.streams.size === 0) {
            eventHub.broadcast({
              type: 'ENTITY_MUTATED',
              module: 'SALES',
              entity: 'YOUTUBE_CHAT_STATUS',
              action: 'UPDATE',
              documentRef: state.boothId,
              data: { boothId: state.boothId, status: 'DISCONNECTED', liveId: null, reason: 'STREAM_ENDED' }
            });
          }
          continue;
        }

        const actions = chatCont.actions || [];
        for (const a of actions) {
          const item =
            a?.addChatItemAction?.item?.liveChatTextMessageRenderer ||
            a?.addChatItemAction?.item?.liveChatPaidMessageRenderer;
          if (!item || !item.id) continue;

          if (state.seenMessageIds.has(item.id)) continue;
          state.seenMessageIds.add(item.id);

          const author = item.authorName?.simpleText || 'YouTube Viewer';
          const text = normalizeEmojiShortcodes(
            (item.message?.runs || [])
              .map((r: any) => resolveYouTubeRunText(r))
              .join('')
              .trim()
          );

          if (text) {
            await this.handleIncomingMessage(state.boothId, author, text, item.id);
          }
        }
      } catch (_) {}
    }
  }

  public async connectBoothToYouTubeChat(
    rawBoothId: string,
    urlOrId?: string
  ): Promise<{ success: boolean; isConnected?: boolean; waitingForStream?: boolean; liveId?: string; message?: string; error?: string }> {
    const boothId = this.normalizeBoothId(rawBoothId);
    let cleanInput = (urlOrId || '').trim() || this.lastKnownInputs.get(boothId) || '@VintageVibesLLCSPC';

    // Check if user accidentally pasted an RTMP URL or stream key
    const isRtmpInput =
      cleanInput.startsWith('rtmp://') ||
      cleanInput.startsWith('rtmps://') ||
      cleanInput.includes('/live2') ||
      /^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}/i.test(cleanInput);

    if (isRtmpInput) {
      return {
        success: false,
        error: 'Yeh aapki RTMP video stream key/URL hai. Live Chat Sync ke liye YouTube Watch Link ya Channel Handle (@VintageVibesLLCSPC) paste karein.'
      };
    }

    this.lastKnownInputs.set(boothId, cleanInput);

    // If an active poller is already running for this booth with standard handle or same input, reuse it instead of aborting in-flight discovery!
    const existing = this.activePollers.get(boothId);
    const isGenericHandle = !urlOrId || cleanInput === '@VintageVibesLLCSPC' || cleanInput === '@murtazamakkani5608';
    if (existing && existing.running && (isGenericHandle || existing.cleanInput === cleanInput)) {
      if (existing.refreshPromise) {
        await existing.refreshPromise.catch(() => {});
      }
      if (existing.streams.size > 0) {
        await this.pollStreamsOnce(existing);
        const firstId = Array.from(existing.streams.keys())[0];
        if (firstId) {
          return {
            success: true,
            isConnected: true,
            liveId: firstId,
            message: `🔴 YouTube Live Chat Connected (${firstId})!`
          };
        }
      }
      return {
        success: true,
        waitingForStream: true,
        message: 'YouTube live stream ka search background me jari hai. Jaise hi stream live hogi, chat automatic sync ho jayegi.'
      };
    }

    const prevSeen = existing?.seenMessageIds || new Set<string>();
    this.disconnectBooth(boothId, false);

    const state: ActivePollerState = {
      boothId,
      cleanInput,
      running: true,
      isRefreshing: false,
      refreshPromise: null,
      timer: null,
      discoveryTimer: null,
      streams: new Map(),
      seenMessageIds: prevSeen
    };
    this.activePollers.set(boothId, state);

    const refreshStreams = async () => {
      if (!state.running) return;
      if (state.refreshPromise) {
        return state.refreshPromise;
      }
      state.isRefreshing = true;
      state.refreshPromise = (async () => {
        try {
          // Discover currently active live stream IDs (OAuth active broadcasts + channel /live discovery)
          const [pageCandidates, oauthActiveIds] = await Promise.all([
            this.discoverCandidateVideoIds(cleanInput),
            this.discoverActiveOAuthBroadcastIds(boothId).catch(() => [] as string[])
          ]);
          const candidates = Array.from(new Set([...oauthActiveIds, ...pageCandidates]));
          await Promise.all(
            candidates.map(async (vid) => {
              if (!state.running || state.streams.has(vid)) return;
              const sess = await this.initStreamChatSession(vid);
              if (sess && state.running) {
                state.streams.set(vid, sess);
                console.log(`[YouTubeChat] 🟢 Active Live Chat attached for videoId=${vid} (${boothId})`);
              }
            })
          );

          if (state.streams.size > 0 && state.running) {
            const primaryId = Array.from(state.streams.keys())[0];
            eventHub.broadcast({
              type: 'ENTITY_MUTATED',
              module: 'SALES',
              entity: 'YOUTUBE_CHAT_STATUS',
              action: 'UPDATE',
              documentRef: boothId,
              data: { boothId, status: 'CONNECTED', liveId: primaryId }
            });
          }
        } finally {
          state.isRefreshing = false;
          state.refreshPromise = null;
        }
      })();
      return state.refreshPromise;
    };

    await refreshStreams();

    if (state.streams.size > 0) {
      await this.pollStreamsOnce(state);
    }

    const scheduleNextPoll = () => {
      if (!state.running) return;
      state.timer = setTimeout(async () => {
        await this.pollStreamsOnce(state);
        scheduleNextPoll();
      }, 650);
    };
    scheduleNextPoll();

    state.discoveryTimer = setInterval(() => {
      refreshStreams().catch(() => {});
    }, 10000);

    const firstLiveId = Array.from(state.streams.keys())[0];
    if (firstLiveId) {
      return {
        success: true,
        isConnected: true,
        liveId: firstLiveId,
        message: `🔴 YouTube Live Chat Connected (${firstLiveId})!`
      };
    }

    return {
      success: true,
      waitingForStream: true,
      message: 'YouTube live stream ka search background me jari hai. Jaise hi stream live hogi, chat automatic sync ho jayegi.'
    };
  }

  public disconnectBooth(rawBoothId: string, clearMemory = true) {
    const boothId = this.normalizeBoothId(rawBoothId);
    const existing = this.activePollers.get(boothId);
    const lastLiveId = existing ? (Array.from(existing.streams.keys())[0] || null) : null;
    if (existing) {
      existing.running = false;
      if (existing.timer) clearTimeout(existing.timer);
      if (existing.discoveryTimer) clearInterval(existing.discoveryTimer);
      this.activePollers.delete(boothId);
    }
    if (clearMemory) {
      this.lastKnownInputs.delete(boothId);
      this.latestHostBroadcasts.delete(boothId);
    }
    eventHub.broadcast({
      type: 'ENTITY_MUTATED',
      module: 'SALES',
      entity: 'YOUTUBE_CHAT_STATUS',
      action: 'UPDATE',
      documentRef: boothId,
      data: { boothId, status: 'DISCONNECTED', liveId: null }
    });
  }

  public getBoothChatStatus(rawBoothId: string) {
    const boothId = this.normalizeBoothId(rawBoothId);
    const poller = this.activePollers.get(boothId);
    const liveIds = poller ? Array.from(poller.streams.keys()) : [];
    const liveId = liveIds[0] || null;
    if (Date.now() - this.hasOAuthCache.checkedAt > 5000) {
      this.canSendOutboundChat().catch(() => {});
    }
    const rawComments = streamController.getComments(boothId) || [];
    const recentMessages = rawComments.map((c: any) => ({
      ...c,
      handle: c.username || c.handle || '@viewer',
      text: c.comment || c.text || ''
    }));
    return {
      connected: liveIds.length > 0,
      isConnected: liveIds.length > 0,
      isSearching: Boolean(poller && liveIds.length === 0),
      canSendChat: this.hasOAuthCache.canSend,
      autoLiveReady: Boolean(this.hasOAuthCache.autoLiveEnabled || this.hasOAuthCache.canSend),
      youtubeChannelTitle: this.hasOAuthCache.channelTitle || null,
      oauthUrl: `/auth/v1/authorize?youtube_chat=1&boothId=${encodeURIComponent(boothId)}`,
      videoId: liveId,
      liveId,
      popoutUrl: liveId ? `https://www.youtube.com/live_chat?is_popout=1&v=${liveId}` : null,
      lastInput: this.lastKnownInputs.get(boothId) || null,
      latestHostBroadcast: this.getLatestHostBroadcast(boothId),
      recentMessages
    };
  }

  public getLatestHostBroadcast(rawBoothId: string) {
    const boothId = this.normalizeBoothId(rawBoothId);
    const entry = this.latestHostBroadcasts.get(boothId);
    if (!entry) return null;
    // Show host message on broadcast HUD for 30 seconds after sending
    if (Date.now() - entry.timestamp > 30000) return null;
    return entry;
  }

  /**
   * Send an outbound message from ERP to YouTube Live:
   * 1. Broadcasts immediately onto the Live Stream Video HUD Canvas (visible to all YouTube viewers on the video stream).
   * 2. Attempts direct YouTube Live Chat API (auto-refreshing OAuth 2.0) / Innertube insertion if configured.
   */
  public async sendMessageToYouTubeChat(
    rawBoothId: string,
    messageText: string,
    senderName = 'Vintage Vibes Host'
  ): Promise<{
    success: boolean;
    deliveredViaYouTubeApi: boolean;
    displayedOnStreamHud: boolean;
    liveId: string | null;
    popoutUrl: string | null;
    needsOAuth?: boolean;
    oauthUrl?: string;
    note?: string;
  }> {
    const boothId = this.normalizeBoothId(rawBoothId);
    const cleanMsg = (messageText || '').trim();
    const poller = this.activePollers.get(boothId);
    const liveIds = poller ? Array.from(poller.streams.keys()) : [];
    const liveId = liveIds[0] || null;
    const popoutUrl = liveId ? `https://www.youtube.com/live_chat?is_popout=1&v=${liveId}` : null;
    const oauthUrl = `/auth/v1/authorize?youtube_chat=1&boothId=${encodeURIComponent(boothId)}`;

    if (!cleanMsg) {
      return {
        success: false,
        deliveredViaYouTubeApi: false,
        displayedOnStreamHud: false,
        liveId,
        popoutUrl,
        needsOAuth: !this.hasOAuthCache.canSend,
        oauthUrl
      };
    }

    // Do NOT draw host chat messages onto the video stream canvas (host messages go strictly to platform chat boxes)
    let deliveredViaYouTubeApi = false;
    let note = 'YouTube OAuth required: click "Enable YT Send" once to post comments directly into YouTube Live Chat.';
    let oauthToken = process.env.YOUTUBE_OAUTH_ACCESS_TOKEN || '';
    let oauthRefreshToken = '';
    let oauthExpiresAt = 0;

    // 2. Check for OAuth 2.0 Token (with refresh) or real YouTube Cookies in DB / env
    try {
      let rawCookies: any[] = [];
      let rawCookieHeader = '';
      const client = await getPgClient();
      if (client) {
        try {
          const q = await client.query(
            `SELECT session_cookies, metadata
             FROM public.booth_social_channels
             WHERE platform = 'youtube'
             ORDER BY ((metadata->>'oauthAccessToken') IS NOT NULL) DESC, (auth_status = 'LOGGED_IN') DESC
             LIMIT 1`
          );
          const row = q.rows[0];
          const meta = row?.metadata || {};
          if (meta.oauthAccessToken) oauthToken = String(meta.oauthAccessToken);
          if (meta.oauthRefreshToken) oauthRefreshToken = String(meta.oauthRefreshToken);
          if (meta.oauthExpiresAt) oauthExpiresAt = Number(meta.oauthExpiresAt);
          if (meta.cookieHeader) rawCookieHeader = String(meta.cookieHeader);
          if (Array.isArray(row?.session_cookies)) {
            rawCookies = row.session_cookies;
          }
        } finally {
          await client.end().catch(() => {});
        }
      }

      if (rawCookies.length === 0 && rawCookieHeader && /SAPISID|__Secure-3PAPISID/i.test(rawCookieHeader)) {
        rawCookies = rawCookieHeader
          .split(';')
          .map(p => {
            const idx = p.indexOf('=');
            return idx > 0 ? { name: p.slice(0, idx).trim(), value: p.slice(idx + 1).trim() } : null;
          })
          .filter(Boolean);
      }

      const refreshGoogleTokenIfNeeded = async (force = false): Promise<string> => {
        if (!oauthRefreshToken) return oauthToken;
        if (!force && oauthToken && (!oauthExpiresAt || Date.now() < oauthExpiresAt - 60000)) {
          return oauthToken;
        }
        try {
          const googleClientId =
            process.env.GOOGLE_CLIENT_ID ||
            '186959128141-u3m7iv727mlhdnlfskm3ghvjq0b6u95s.apps.googleusercontent.com';
          const googleClientSecret =
            process.env.GOOGLE_CLIENT_SECRET || '';
          const refRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: googleClientId,
              client_secret: googleClientSecret,
              refresh_token: oauthRefreshToken,
              grant_type: 'refresh_token'
            }),
            signal: AbortSignal.timeout(5000)
          });
          if (refRes.ok) {
            const refData: any = await refRes.json();
            if (refData.access_token) {
              oauthToken = refData.access_token;
              oauthExpiresAt = Date.now() + Number(refData.expires_in || 3500) * 1000;
              this.hasOAuthCache = { checkedAt: Date.now(), canSend: true };
              const pg = await getPgClient();
              if (pg) {
                try {
                  await pg.query(
                    `UPDATE public.booth_social_channels
                     SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
                         updated_at = NOW()
                     WHERE platform = 'youtube'`,
                    [JSON.stringify({ oauthAccessToken: oauthToken, oauthExpiresAt })]
                  );
                } finally {
                  await pg.end().catch(() => {});
                }
              }
            }
          }
        } catch (_) {}
        return oauthToken;
      };

      if (oauthRefreshToken) {
        oauthToken = await refreshGoogleTokenIfNeeded(false);
      }

      // 2a. If Google OAuth 2.0 Bearer Token is available, use YouTube Data API v3 liveChatMessages.insert
      if (oauthToken) {
        let activeLiveChatId = liveId ? (this.liveChatIdCache.get(liveId) || '') : '';
        if (!activeLiveChatId && liveId) {
          let vidRes = await fetch(
            `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${encodeURIComponent(liveId)}`,
            { headers: { Authorization: `Bearer ${oauthToken}` }, signal: AbortSignal.timeout(4000) }
          );
          if (vidRes.status === 401 && oauthRefreshToken) {
            oauthToken = await refreshGoogleTokenIfNeeded(true);
            vidRes = await fetch(
              `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${encodeURIComponent(liveId)}`,
              { headers: { Authorization: `Bearer ${oauthToken}` }, signal: AbortSignal.timeout(4000) }
            );
          }
          if (vidRes.ok) {
            const vidJson = await vidRes.json();
            activeLiveChatId = String(vidJson?.items?.[0]?.liveStreamingDetails?.activeLiveChatId || '').trim();
            if (activeLiveChatId) {
              this.liveChatIdCache.set(liveId, activeLiveChatId);
            }
          } else {
            const vidErrJson: any = await vidRes.json().catch(() => null);
            note = vidErrJson?.error?.message || `YouTube videos API HTTP ${vidRes.status}`;
          }
        }

        // Fallback: discover owner's currently active broadcast even if chat poller wasn't manually synced yet
        if (!activeLiveChatId) {
          const brRes = await fetch(
            `https://www.googleapis.com/youtube/v3/liveBroadcasts?part=id,snippet,status&mine=true&broadcastType=all&maxResults=10`,
            { headers: { Authorization: `Bearer ${oauthToken}` }, signal: AbortSignal.timeout(4000) }
          ).catch(() => null);
          if (brRes && brRes.ok) {
            const brJson = await brRes.json();
            const items = Array.isArray(brJson?.items) ? brJson.items : [];
            const activeItem =
              items.find((it: any) => ['live', 'liveStarting', 'testing'].includes(String(it?.status?.lifeCycleStatus || ''))) ||
              items.find((it: any) => String(it?.status?.lifeCycleStatus || '') === 'ready') ||
              items[0];
            activeLiveChatId = String(activeItem?.snippet?.liveChatId || '').trim();
            if (activeLiveChatId && liveId) {
              this.liveChatIdCache.set(liveId, activeLiveChatId);
            }
          } else if (brRes && !brRes.ok) {
            const brErrJson: any = await brRes.json().catch(() => null);
            if (brErrJson?.error?.message) {
              note = brErrJson.error.message;
            }
          }
        }

        if (activeLiveChatId) {
          const postToYt = async (tok: string) =>
            fetch(`https://www.googleapis.com/youtube/v3/liveChat/messages?part=snippet`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${tok}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                snippet: {
                  liveChatId: activeLiveChatId,
                  type: 'textMessageEvent',
                  textMessageDetails: { messageText: cleanMsg }
                }
              }),
              signal: AbortSignal.timeout(4000)
            });

          let insertRes = await postToYt(oauthToken);
          if (insertRes.status === 401 && oauthRefreshToken) {
            oauthToken = await refreshGoogleTokenIfNeeded(true);
            insertRes = await postToYt(oauthToken);
          }
          if (insertRes.ok) {
            const insertJson: any = await insertRes.json().catch(() => ({}));
            if (insertJson?.id && poller) {
              poller.seenMessageIds.add(insertJson.id);
              const bState = streamController.ensureBoothExists(boothId);
              if (!bState.seenExternalIds) bState.seenExternalIds = [];
              bState.seenExternalIds.push(`yt:${insertJson.id}`);
            }
            deliveredViaYouTubeApi = true;
            this.recordSentFingerprint(cleanMsg);
            note = 'Posted directly to YouTube Live Chat via OAuth API';
          } else {
            const insertErrJson: any = await insertRes.json().catch(() => null);
            note = insertErrJson?.error?.message || `YouTube liveChat API HTTP ${insertRes.status}`;
          }
        } else if (oauthToken && note.startsWith('YouTube OAuth required')) {
          note = 'No active YouTube liveChatId found for this stream (ensure stream is public/unlisted & live).';
        }
      }

      // 2b. If real YouTube session cookies (with SAPISID / __Secure-3PAPISID) are stored, use Innertube live_chat/send_message
      if (!deliveredViaYouTubeApi && rawCookies.length > 0 && liveId) {
        const sapisidCookie = rawCookies.find(
          (c: any) => c.name === 'SAPISID' || c.name === '__Secure-3PAPISID'
        );
        const cookieHeader = rawCookies.map((c: any) => `${c.name}=${c.value}`).join('; ');
        const sessionInfo = poller?.streams.get(liveId);
        let apiKey = sessionInfo?.apiKey || '';
        let sendParams = sessionInfo?.sendParams || '';

        if (sapisidCookie?.value && (!apiKey || !sendParams)) {
          try {
            const authPageRes = await fetch(`https://www.youtube.com/live_chat?v=${encodeURIComponent(liveId)}`, {
              headers: { ...BROWSER_HEADERS, Cookie: cookieHeader },
              signal: AbortSignal.timeout(5000)
            });
            if (authPageRes.ok) {
              const authHtml = await authPageRes.text();
              apiKey = authHtml.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1] || apiKey;
              sendParams = authHtml.match(/"sendLiveChatMessageEndpoint":\{"params":"([^"]+)"\}/)?.[1] || sendParams;
              if (sessionInfo && apiKey && sendParams) {
                sessionInfo.apiKey = apiKey;
                sessionInfo.sendParams = sendParams;
              }
            }
          } catch (_) {}
        }

        if (sapisidCookie?.value && apiKey && sendParams) {
          const ts = Math.floor(Date.now() / 1000);
          const origin = 'https://www.youtube.com';
          const hash = crypto
            .createHash('sha1')
            .update(`${ts} ${sapisidCookie.value} ${origin}`)
            .digest('hex');

          const sendRes = await fetch(
            `https://www.youtube.com/youtubei/v1/live_chat/send_message?key=${apiKey}`,
            {
              method: 'POST',
              headers: {
                ...BROWSER_HEADERS,
                'Content-Type': 'application/json',
                Cookie: cookieHeader,
                Origin: origin,
                Referer: `https://www.youtube.com/live_chat?v=${liveId}`,
                Authorization: `SAPISIDHASH ${ts}_${hash}`
              },
              body: JSON.stringify({
                context: {
                  client: { clientName: 'WEB', clientVersion: '2.20241010.01.00' }
                },
                params: sendParams,
                richMessage: {
                  textSegments: [{ text: cleanMsg }]
                },
                clientMessageId: `vv-${Date.now()}`
              }),
              signal: AbortSignal.timeout(4000)
            }
          );
          if (sendRes.ok) {
            const sendJson = await sendRes.json();
            if (sendJson?.actions && sendJson.actions.length > 0) {
              deliveredViaYouTubeApi = true;
              this.recordSentFingerprint(cleanMsg);
              note = 'Posted directly to YouTube Live Chat';
            }
          }
        }
      }
    } catch (err: any) {
      note = err?.message || note;
    }

    return {
      success: true,
      deliveredViaYouTubeApi,
      displayedOnStreamHud: false,
      liveId,
      popoutUrl,
      needsOAuth: !deliveredViaYouTubeApi && !oauthToken,
      oauthUrl,
      note
    };
  }
}

const globalForYtChat = globalThis as unknown as { __vvYouTubeChatService?: YouTubeChatService };
export const youTubeChatService =
  globalForYtChat.__vvYouTubeChatService || (globalForYtChat.__vvYouTubeChatService = new YouTubeChatService());

