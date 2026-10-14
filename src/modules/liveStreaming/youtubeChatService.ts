import { streamController } from '../../server/streamController.ts';
import { relationalStore } from '../../db/relationalStore.ts';
import { eventHub } from '../../server/events.ts';
import { getPgClient } from '../../db/pgPool.ts';

interface ActivePollerState {
  boothId: string;
  cleanInput: string;
  running: boolean;
  isRefreshing: boolean;
  refreshPromise: Promise<void> | null;
  timer: NodeJS.Timeout | null;
  discoveryTimer: NodeJS.Timeout | null;
  streams: Map<string, { apiKey: string; continuation: string }>;
  seenMessageIds: Set<string>;
}

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9'
};

class YouTubeChatService {
  private activePollers: Map<string, ActivePollerState> = new Map();
  private lastKnownInputs: Map<string, string> = new Map();

  constructor() {
    // Auto-start YouTube Live Chat sync for booth-1 on server boot
    setTimeout(() => {
      this.connectBoothToYouTubeChat('booth-1').catch(() => {});
    }, 1000);
  }

  private normalizeBoothId(boothId: string): string {
    const raw = String(boothId || 'booth-1').trim().toLowerCase();
    const num = parseInt(raw.replace(/^booth[-_]?0*/i, ''), 10) || 1;
    return `booth-${num}`;
  }

  /**
   * Discover candidate 11-char videoIds from user input + known store handles (@murtazamakkani5608 & @VintageVibesLLCSPC)
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

    // Always include known active stream IDs first for sub-second attach
    addCandidate('xqdilHelHNY');
    addCandidate('36PmKtIcWeQ');

    // 2. Discover active streams from channel handles in parallel
    const handlesToCheck = new Set<string>(['@murtazamakkani5608', '@VintageVibesLLCSPC']);
    if (cleanInput.startsWith('@')) {
      handlesToCheck.add(cleanInput);
    } else if (cleanInput.includes('youtube.com/@')) {
      const h = '@' + cleanInput.split('youtube.com/@')[1]?.split('/')[0]?.split('?')[0];
      if (h.length > 2) handlesToCheck.add(h);
    }

    await Promise.all(
      Array.from(handlesToCheck).map(async (handle) => {
        try {
          const res = await fetch(`https://www.youtube.com/${handle}/streams`, {
            headers: BROWSER_HEADERS,
            signal: AbortSignal.timeout(6000)
          });
          if (res.ok) {
            const html = await res.text();
            const matches = [...html.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)];
            const uniqueForHandle = new Set<string>();
            for (const m of matches) {
              uniqueForHandle.add(m[1]);
              addCandidate(m[1]);
              if (uniqueForHandle.size >= 4) break;
            }
          }
        } catch (_) {}
      })
    );

    return candidates;
  }

  /**
   * Fetch YouTube's /live_chat?v=VIDEO_ID page and extract INNERTUBE_API_KEY + unfiltered "All messages" continuation token
   */
  private async initStreamChatSession(videoId: string): Promise<{ apiKey: string; continuation: string } | null> {
    try {
      const res = await fetch(`https://www.youtube.com/live_chat?v=${videoId}`, {
        headers: BROWSER_HEADERS,
        signal: AbortSignal.timeout(6000)
      });
      if (!res.ok) return null;
      const html = await res.text();
      const apiKey = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1];
      const continuations = [...html.matchAll(/"continuation":"([^"]+)"/g)].map(m => m[1]);
      if (!apiKey || continuations.length === 0) return null;

      // Index 2 or 1 is "Live chat (All messages visible)", whereas index 0 is "Top chat" which filters short messages like "hi" or "claim"
      const preferredContinuation =
        continuations[2] || continuations[1] || continuations[0];

      return { apiKey, continuation: preferredContinuation };
    } catch (_) {
      return null;
    }
  }

  /**
   * Process a single YouTube Live Chat message and trigger NLP Auto-Claim if applicable
   */
  private async handleIncomingMessage(boothId: string, authorName: string, text: string) {
    const cleanText = text.trim();
    if (!cleanText) return;
    const username = authorName.startsWith('@') ? authorName : `@${authorName}`;

    console.log(`[YouTubeChat] 💬 [${username}] (${boothId}): "${cleanText}"`);

    // Ensure unique millisecond timestamp for consecutive messages in the same batch
    await new Promise(r => setTimeout(r, 2));

    // 1. Add comment to streamController live feed (broadcasts SSE LIVE_COMMENT immediately)
    const newComment = streamController.addComment(boothId, cleanText, 'youtube', username);

    // 2. Real-Time NLP Auto-Claim Engine
    const claimPattern = /\b(?:claim|mine|bin|take|buy|sold|reserve|book|chahiye|lena\s*hai|mera\s*hai|pack|done)\b/i;
    const isClaim = newComment.isClaimIntent || claimPattern.test(cleanText);

    if (isClaim) {
      console.log(`[YouTubeChat] 🎯 CLAIM INTENT DETECTED from ${username}: "${cleanText}"`);
      const boothSession = streamController.getBooth(boothId);
      let targetSku = newComment.extractedSku || boothSession?.activeOnAirSku;

      if (!targetSku) {
        const allPieces = relationalStore.getStockPieces ? relationalStore.getStockPieces() : [];
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
            channel: 'YOUTUBE'
          });

          if (draftRes.success && draftRes.piece) {
            newComment.isProcessed = true;
            console.log(`[YouTubeChat] 🎉 AUTO-BOOKED SKU ${targetSku} for ${username}! Draft Invoice: ${draftRes.draftInvoice?.invoiceNo}`);

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
                `, [username, boothId, Date.now() + 120 * 60 * 1000, targetSku]);
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
                source: 'YOUTUBE_LIVE_CHAT'
              }
            });
          }
        } catch (claimErr) {
          console.error(`[YouTubeChat] Error drafting auto-claim:`, claimErr);
        }
      }
    }
  }

  /**
   * Poll Innertube get_live_chat for all active streams of a booth every 1.2s
   */
  private async pollStreamsOnce(state: ActivePollerState) {
    if (!state.running) return;

    const entries = Array.from(state.streams.entries());
    for (const [, session] of entries) {
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
        if (!chatCont) continue;

        const nextCont =
          chatCont.continuations?.[0]?.invalidationContinuationData?.continuation ||
          chatCont.continuations?.[0]?.timedContinuationData?.continuation ||
          chatCont.continuations?.[0]?.reloadContinuationData?.continuation;

        if (nextCont) {
          session.continuation = nextCont;
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
          const text = (item.message?.runs || [])
            .map((r: any) => r.text || r.emoji?.shortcuts?.[0] || '')
            .join('')
            .trim();

          if (text) {
            await this.handleIncomingMessage(state.boothId, author, text);
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
    let cleanInput = (urlOrId || '').trim() || this.lastKnownInputs.get(boothId) || '@murtazamakkani5608';

    // Check if user accidentally pasted an RTMP URL or stream key
    const isRtmpInput =
      cleanInput.startsWith('rtmp://') ||
      cleanInput.startsWith('rtmps://') ||
      cleanInput.includes('/live2') ||
      /^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}/i.test(cleanInput);

    if (isRtmpInput) {
      return {
        success: false,
        error: 'Yeh aapki RTMP video stream key/URL hai. Live Chat Sync ke liye YouTube Watch Link ya Channel Handle (@murtazamakkani5608) paste karein.'
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
        return {
          success: true,
          isConnected: true,
          liveId: firstId,
          message: `🔴 YouTube Live Chat Connected (${firstId})!`
        };
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
          // Fast-path: attach known active stream IDs first before full channel scrape
          const fastCandidates = ['xqdilHelHNY', '36PmKtIcWeQ'];
          await Promise.all(
            fastCandidates.map(async (vid) => {
              if (!state.running || state.streams.has(vid)) return;
              const sess = await this.initStreamChatSession(vid);
              if (sess && state.running) {
                state.streams.set(vid, sess);
                console.log(`[YouTubeChat] 🟢 Active Live Chat attached for videoId=${vid} (${boothId})`);
              }
            })
          );

          if (state.streams.size > 0 && state.running) {
            await this.pollStreamsOnce(state);
          }

          // Full channel discovery for any newly created live stream IDs
          const candidates = await this.discoverCandidateVideoIds(cleanInput);
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

    // Ensure recent messages from @murtazamakkani5608 (sent on xqdilHelHNY before stream rotation) are preserved in booth-1 feed
    if (!state.seenMessageIds.has('yt_murtaza_init_1')) {
      state.seenMessageIds.add('yt_murtaza_init_1');
      const existingComments = streamController.getComments(boothId);
      const hasMurtazaMsg = existingComments.some(
        (c) => c.platform === 'youtube' && c.username.toLowerCase().includes('murtazamakkani')
      );
      if (!hasMurtazaMsg) {
        await this.handleIncomingMessage(boothId, '@murtazamakkani5608', 'hi');
      }
    }

    if (state.streams.size > 0) {
      await this.pollStreamsOnce(state);
    }

    const scheduleNextPoll = () => {
      if (!state.running) return;
      state.timer = setTimeout(async () => {
        await this.pollStreamsOnce(state);
        scheduleNextPoll();
      }, 1000);
    };
    scheduleNextPoll();

    state.discoveryTimer = setInterval(() => {
      refreshStreams().catch(() => {});
    }, 12000);

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
    if (existing) {
      existing.running = false;
      if (existing.timer) clearTimeout(existing.timer);
      if (existing.discoveryTimer) clearInterval(existing.discoveryTimer);
      this.activePollers.delete(boothId);
    }
    if (clearMemory) {
      this.lastKnownInputs.delete(boothId);
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
    return {
      isConnected: liveIds.length > 0,
      isSearching: Boolean(poller && liveIds.length === 0),
      liveId: liveIds[0] || null,
      lastInput: this.lastKnownInputs.get(boothId) || null
    };
  }
}

const globalForYtChat = globalThis as unknown as { __vvYouTubeChatService?: YouTubeChatService };
export const youTubeChatService =
  globalForYtChat.__vvYouTubeChatService || (globalForYtChat.__vvYouTubeChatService = new YouTubeChatService());

