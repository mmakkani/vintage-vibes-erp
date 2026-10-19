import { streamController } from '../../server/streamController.ts';
import { relationalStore } from '../../db/relationalStore.ts';
import { eventHub } from '../../server/events.ts';
import { getPgClient } from '../../db/pgPool.ts';
import { marketingService } from '../marketing/marketing.service.ts';
import { liveStreamAgentService } from '../marketing/liveStreamAgent.service.ts';
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

class YouTubeChatService {
  private activePollers: Map<string, ActivePollerState> = new Map();
  private lastKnownInputs: Map<string, string> = new Map();
  private latestHostBroadcasts: Map<string, { text: string; sender: string; timestamp: number }> = new Map();

  constructor() {
    // Do not auto-connect to ended streams on boot; connect when stream starts or operator clicks Sync
  }

  private normalizeBoothId(boothId: string): string {
    const raw = String(boothId || 'booth-1').trim().toLowerCase();
    const num = parseInt(raw.replace(/^booth[-_]?0*/i, ''), 10) || 1;
    return `booth-${num}`;
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

    // 2. Discover active live streams from channel handles in parallel
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
  private async handleIncomingMessage(boothId: string, authorName: string, text: string) {
    const cleanText = text.trim();
    if (!cleanText) return;
    const username = authorName.startsWith('@') ? authorName : `@${authorName}`;

    console.log(`[YouTubeChat] 💬 [${username}] (${boothId}): "${cleanText}"`);

    // Ensure unique millisecond timestamp for consecutive messages in the same batch
    await new Promise(r => setTimeout(r, 2));

    // 1. Add comment to streamController live feed (broadcasts SSE LIVE_COMMENT immediately)
    const newComment = streamController.addComment(boothId, cleanText, 'youtube', username);

    // 2. Real-Time NLP Auto-Claim Engine (STRICTLY ONLY "CLAIM" or "MINE")
    const isSystemOrHost = /Auto-Claim Bot|VintageVibesHost|Vintage Vibes Host/i.test(username) || /^🎉\s*SOLD/i.test(cleanText);
    const claimPattern = /\b(?:claim|mine)\b/i;
    const isClaim = !isSystemOrHost && Boolean(newComment.isClaimIntent && claimPattern.test(cleanText));

    if (isClaim) {
      console.log(`[YouTubeChat] 🎯 CLAIM INTENT DETECTED from ${username}: "${cleanText}"`);
      const boothSession = streamController.getBooth(boothId);
      let targetSku = newComment.extractedSku || boothSession?.activeOnAirSku;

      // Also check PostgreSQL live_booths / inventory_pieces / bale_sorted_pieces so we always have a truly available On-Air SKU
      const storeAny = relationalStore as any;
      try {
        const client = await getPgClient();
        if (client) {
          try {
            if (!targetSku) {
              const boothNum = parseInt(boothId.replace(/\D/g, ''), 10) || 1;
              const aliases = [`booth-${boothNum}`, `booth-0${boothNum}`, `booth_${boothNum}`, `booth_0${boothNum}`];
              const bRes = await client.query(
                `SELECT active_product_sku FROM public.live_booths WHERE id = ANY($1::text[]) AND active_product_sku IS NOT NULL LIMIT 1`,
                [aliases]
              );
              if (bRes.rows?.[0]?.active_product_sku) {
                targetSku = String(bRes.rows[0].active_product_sku).trim();
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

            if (!targetSku) {
              const nextStock = await client.query(
                `SELECT barcode FROM public.inventory_pieces
                 WHERE (status = 'IN_STOCK' OR status IS NULL OR status = 'AVAILABLE' OR status = 'IN_VAULT')
                   AND (is_sold = false OR is_sold IS NULL)
                 ORDER BY created_at DESC LIMIT 1`
              );
              if (nextStock.rows.length > 0) {
                targetSku = nextStock.rows[0].barcode;
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

      if (!targetSku) {
        const allPieces = relationalStore.getStockPieces ? relationalStore.getStockPieces() : (storeAny.inventoryPieces || []);
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
            newComment.extractedSku = targetSku;
            newComment.isProcessed = true;
            streamController.markBuyerClaimCommentLocked(boothId, username, targetSku);
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

            // 5. Post Official Host Reply to YouTube Live Chat & Broadcast Video HUD as '📢 Vintage Vibes Host'
            this.sendMessageToYouTubeChat(
              boothId,
              hostReplyText,
              '📢 Vintage Vibes Host'
            ).catch(() => {});

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
    } else if (!isSystemOrHost) {
      // Forward non-claim viewer questions on YouTube Live to AI Voice Host & reply as '📢 Vintage Vibes Host'
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
            this.sendMessageToYouTubeChat(boothId, aiReplyWithWa, '📢 Vintage Vibes Host').catch(() => {});
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
          // Stream has ended on YouTube
          state.streams.delete(vid);
          if (state.streams.size === 0) {
            streamController.clearComments(state.boothId);
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
          // No more live continuations -> broadcast ended
          state.streams.delete(vid);
          if (state.streams.size === 0) {
            streamController.clearComments(state.boothId);
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
          // Discover currently active live stream IDs
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
      streamController.archiveAndClearSessionComments(boothId, lastLiveId);
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
   * 2. Attempts direct YouTube Live Chat API / Innertube insertion if OAuth token or authenticated YouTube cookies are configured.
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
    note?: string;
  }> {
    const boothId = this.normalizeBoothId(rawBoothId);
    const cleanMsg = (messageText || '').trim();
    const poller = this.activePollers.get(boothId);
    const liveIds = poller ? Array.from(poller.streams.keys()) : [];
    const liveId = liveIds[0] || null;
    const popoutUrl = liveId ? `https://www.youtube.com/live_chat?is_popout=1&v=${liveId}` : null;

    if (!cleanMsg) {
      return {
        success: false,
        deliveredViaYouTubeApi: false,
        displayedOnStreamHud: false,
        liveId,
        popoutUrl
      };
    }

    // 1. Record for Broadcast Video HUD Banner and emit instant SSE event
    const broadcastEntry = {
      text: cleanMsg,
      sender: senderName,
      timestamp: Date.now()
    };
    this.latestHostBroadcasts.set(boothId, broadcastEntry);
    try {
      eventHub.broadcast({
        type: 'ENTITY_MUTATED',
        module: 'SALES',
        entity: 'HOST_ANNOUNCEMENT',
        action: 'CREATE',
        documentRef: boothId,
        data: { boothId, ...broadcastEntry }
      });
    } catch (_) {}

    let deliveredViaYouTubeApi = false;
    let note = 'Displayed live on YouTube Video Broadcast HUD';

    // 2. Check for OAuth 2.0 Token or real YouTube Cookies in DB / env
    try {
      let oauthToken = process.env.YOUTUBE_OAUTH_ACCESS_TOKEN || '';
      let rawCookies: any[] = [];
      const client = await getPgClient();
      if (client) {
        try {
          const q = await client.query(
            `SELECT session_cookies, metadata FROM public.booth_social_channels WHERE platform = 'youtube' ORDER BY (auth_status = 'LOGGED_IN') DESC LIMIT 1`
          );
          const row = q.rows[0];
          if (row?.metadata?.oauthAccessToken) {
            oauthToken = row.metadata.oauthAccessToken;
          }
          if (Array.isArray(row?.session_cookies)) {
            rawCookies = row.session_cookies;
          }
        } finally {
          await client.end().catch(() => {});
        }
      }

      // 2a. If Google OAuth 2.0 Bearer Token is available, use YouTube Data API v3 liveChatMessages.insert
      if (oauthToken && liveId) {
        const vidRes = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${encodeURIComponent(liveId)}`,
          { headers: { Authorization: `Bearer ${oauthToken}` }, signal: AbortSignal.timeout(4000) }
        );
        if (vidRes.ok) {
          const vidJson = await vidRes.json();
          const activeLiveChatId = vidJson?.items?.[0]?.liveStreamingDetails?.activeLiveChatId;
          if (activeLiveChatId) {
            const insertRes = await fetch(
              `https://www.googleapis.com/youtube/v3/liveChat/messages?part=snippet`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${oauthToken}`,
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
              }
            );
            if (insertRes.ok) {
              deliveredViaYouTubeApi = true;
              note = 'Posted directly to YouTube Live Chat via OAuth API & Video HUD';
            }
          }
        }
      }

      // 2b. If real YouTube session cookies (with SAPISID / __Secure-3PAPISID) are stored, use Innertube live_chat/send_message
      if (!deliveredViaYouTubeApi && rawCookies.length > 0 && poller) {
        const sapisidCookie = rawCookies.find(
          (c: any) => c.name === 'SAPISID' || c.name === '__Secure-3PAPISID'
        );
        const sessionInfo = poller.streams.get(liveId);
        if (sapisidCookie?.value && sessionInfo?.apiKey && sessionInfo?.sendParams) {
          const ts = Math.floor(Date.now() / 1000);
          const origin = 'https://www.youtube.com';
          const hash = crypto
            .createHash('sha1')
            .update(`${ts} ${sapisidCookie.value} ${origin}`)
            .digest('hex');
          const cookieHeader = rawCookies.map((c: any) => `${c.name}=${c.value}`).join('; ');

          const sendRes = await fetch(
            `https://www.youtube.com/youtubei/v1/live_chat/send_message?key=${sessionInfo.apiKey}`,
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
                params: sessionInfo.sendParams,
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
              note = 'Posted directly to YouTube Live Chat & Video HUD';
            }
          }
        }
      }
    } catch (_) {}

    return {
      success: true,
      deliveredViaYouTubeApi,
      displayedOnStreamHud: true,
      liveId,
      popoutUrl,
      note
    };
  }
}

const globalForYtChat = globalThis as unknown as { __vvYouTubeChatService?: YouTubeChatService };
export const youTubeChatService =
  globalForYtChat.__vvYouTubeChatService || (globalForYtChat.__vvYouTubeChatService = new YouTubeChatService());

