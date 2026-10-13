import { LiveChat } from 'youtube-chat';
import { streamController } from '../../server/streamController';
import { relationalStore } from '../../db/relationalStore';
import { eventHub } from '../../server/events';
import { getPgClient } from '../../db/pgPool.ts';

class YouTubeChatService {
  private activeListeners: Map<string, LiveChat> = new Map();
  private activeVideoIds: Map<string, string> = new Map();
  private reconnectTimers: Map<string, NodeJS.Timeout> = new Map();
  private lastKnownInputs: Map<string, string> = new Map();

  /**
   * Connect to YouTube Live Chat for a specific booth
   * Accepts: full URL (https://www.youtube.com/watch?v=XYZ or https://youtu.be/XYZ or https://studio.youtube.com/video/XYZ/livestreaming)
   * OR raw videoId (XYZ)
   * OR channel handle (@VintageVibesLLCSPC)
   */
  public async connectBoothToYouTubeChat(
    boothId: string,
    urlOrId?: string
  ): Promise<{ success: boolean; isConnected?: boolean; waitingForStream?: boolean; liveId?: string; message?: string; error?: string }> {
    this.disconnectBooth(boothId, false);

    let cleanInput = (urlOrId || '').trim();

    // If no input provided, attempt to look up from database or fallback to store channel handle
    if (!cleanInput) {
      cleanInput = this.lastKnownInputs.get(boothId) || '';
    }

    if (!cleanInput) {
      try {
        const client = await getPgClient();
        if (client) {
          const res = await client.query(
            `SELECT account_username, proxy_url FROM public.booth_social_channels WHERE booth_id = $1 AND platform = 'youtube' LIMIT 1`,
            [boothId]
          );
          if (res.rows?.[0]?.account_username) {
            const u = res.rows[0].account_username.trim();
            cleanInput = u.startsWith('@') ? u : `@${u.replace(/^@/, '')}`;
          }
          await client.end().catch(() => {});
        }
      } catch (_) {}
    }

    if (!cleanInput) {
      cleanInput = '@VintageVibesLLCSPC';
    }

    // Check if user accidentally pasted an RTMP URL or stream key instead of a YouTube video link
    const isRtmpInput = cleanInput.startsWith('rtmp://') || 
                        cleanInput.startsWith('rtmps://') || 
                        cleanInput.includes('/live2') ||
                        /^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}/i.test(cleanInput);

    if (isRtmpInput) {
      return {
        success: false,
        error: 'Yeh aapki RTMP video stream key/URL hai (video broadcast karne ke liye). Live Chat Sync ke liye YouTube Studio ke "Share" button se stream ka Watch Link (e.g. https://youtu.be/... ya https://youtube.com/watch?v=...) ya Channel Handle (@VintageVibesLLCSPC) paste karein.'
      };
    }

    this.lastKnownInputs.set(boothId, cleanInput);

    let targetId: { liveId: string } | { handle: string } | { channelId: string };

    if (cleanInput.startsWith('@')) {
      targetId = { handle: cleanInput };
    } else if (cleanInput.includes('youtube.com/channel/')) {
      const parts = cleanInput.split('youtube.com/channel/');
      const channelId = parts[1]?.split('/')[0]?.split('?')[0];
      targetId = { channelId };
    } else if (cleanInput.includes('youtube.com/@')) {
      const parts = cleanInput.split('youtube.com/@');
      const handle = '@' + parts[1]?.split('/')[0]?.split('?')[0];
      targetId = { handle };
    } else {
      let videoId = cleanInput;
      const vMatch = cleanInput.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
      const shortMatch = cleanInput.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
      const studioMatch = cleanInput.match(/\/video\/([a-zA-Z0-9_-]{11})/);
      const liveMatch = cleanInput.match(/live\/([a-zA-Z0-9_-]{11})/);

      if (vMatch) videoId = vMatch[1];
      else if (shortMatch) videoId = shortMatch[1];
      else if (studioMatch) videoId = studioMatch[1];
      else if (liveMatch) videoId = liveMatch[1];
      else if (/^[a-zA-Z0-9_-]{11}$/.test(cleanInput)) videoId = cleanInput;

      targetId = { liveId: videoId };
    }

    try {
      console.log(`[YouTubeChat] 🚀 Attempting connection to YouTube Live chat for booth ${boothId} using:`, targetId);
      const liveChat = new LiveChat(targetId, 1000);
      this.attachLiveChatHandlers(boothId, liveChat, cleanInput);

      // Fast race with 4.5s timeout so the HTTP request never hangs
      const startPromise = liveChat.start();
      const timeoutPromise = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 4500));
      const started = await Promise.race([startPromise, timeoutPromise]).catch(() => false);

      if (started) {
        console.log(`[YouTubeChat] 🟢 Connected to YouTube Live Chat! LiveId: ${liveChat.liveId} for ${boothId}`);
        this.activeListeners.set(boothId, liveChat);
        this.activeVideoIds.set(boothId, liveChat.liveId || '');
        return {
          success: true,
          isConnected: true,
          liveId: liveChat.liveId,
          message: '🔴 YouTube Live Chat Connected!'
        };
      }

      // If not yet live on YouTube, start background poller without blocking the response
      this.startBackgroundPoller(boothId, targetId, cleanInput);
      return {
        success: true,
        waitingForStream: true,
        message: 'YouTube live stream ka search background me jari hai. Jaise hi YouTube Studio me stream live hogi, chat automatic sync ho jayegi.'
      };
    } catch (err: any) {
      console.warn(`[YouTubeChat] Connection attempt notice for ${boothId}:`, err?.message || err);
      this.startBackgroundPoller(boothId, targetId, cleanInput);
      return {
        success: true,
        waitingForStream: true,
        message: 'YouTube live stream ka search background me jari hai. Jaise hi broadcast live hoga, chat automatic connect ho jayegi.'
      };
    }
  }

  private attachLiveChatHandlers(boothId: string, liveChat: LiveChat, cleanInput: string) {
    liveChat.on('start', (liveId: string) => {
      console.log(`[YouTubeChat] 🟢 Connected to YouTube Live Chat! LiveId: ${liveId} for ${boothId}`);
      this.activeListeners.set(boothId, liveChat);
      this.activeVideoIds.set(boothId, liveId);
      eventHub.broadcast({
        type: 'ENTITY_MUTATED',
        module: 'SALES',
        entity: 'YOUTUBE_CHAT_STATUS',
        action: 'UPDATE',
        documentRef: boothId,
        data: { boothId, status: 'CONNECTED', liveId }
      });
    });

    liveChat.on('chat', async (chatItem: any) => {
      const text = (chatItem.message || [])
        .map((m: any) => ('text' in m ? m.text : (m.emojiText || '')))
        .join(' ')
        .trim();
      const rawUsername = chatItem.author?.name || 'YouTube Viewer';
      const username = rawUsername.startsWith('@') ? rawUsername : `@${rawUsername}`;
      if (!text) return;

      console.log(`[YouTubeChat] 💬 [${username}]: "${text}"`);

      // 1. Add comment to streamController live feed
      const newComment = streamController.addComment(boothId, text, 'youtube', username);

      // 2. Real-Time NLP Auto-Claim Engine
      const claimPattern = /\b(?:claim|mine|bin|take|buy|sold|reserve|book|chahiye|lena\s*hai|mera\s*hai|pack|done)\b/i;
      const isClaim = newComment.isClaimIntent || claimPattern.test(text);

      if (isClaim) {
        console.log(`[YouTubeChat] 🎯 CLAIM INTENT DETECTED from ${username}: "${text}"`);
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
                  `, [username, boothId, Date.now() + 120 * 60 * 1000, targetSku]);
                  await client.end().catch(() => {});
                }
              } catch (pgErr) {
                console.warn('[YouTubeChat] PG sync note:', pgErr);
              }

              // Broadcast live claim event
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
            } else {
              console.warn(`[YouTubeChat] Auto-claim note:`, draftRes.error);
            }
          } catch (claimErr) {
            console.error(`[YouTubeChat] Error drafting auto-claim:`, claimErr);
          }
        }
      }
    });

    liveChat.on('error', (err: any) => {
      console.warn(`[YouTubeChat] LiveChat notice for booth ${boothId}:`, err?.message || err);
    });

    liveChat.on('end', (reason: any) => {
      console.log(`[YouTubeChat] LiveChat ended for booth ${boothId}:`, reason);
      this.activeListeners.delete(boothId);
      this.activeVideoIds.delete(boothId);

      // Auto-reconnect if broadcast is still live (essential for long broadcasts)
      const boothSession = streamController.getBooth(boothId);
      if (boothSession?.isBroadcasting && cleanInput) {
        console.log(`[YouTubeChat] Stream is still active. Auto-reconnecting live chat in 6s...`);
        const t = setTimeout(() => {
          this.connectBoothToYouTubeChat(boothId, cleanInput).catch(() => {});
        }, 6000);
        this.reconnectTimers.set(boothId, t);
      }
    });
  }

  private startBackgroundPoller(boothId: string, targetId: any, cleanInput: string) {
    if (this.reconnectTimers.has(boothId)) {
      clearTimeout(this.reconnectTimers.get(boothId)!);
      this.reconnectTimers.delete(boothId);
    }

    let attempts = 0;
    const maxAttempts = 30; // 30 attempts * 6s = 3 minutes of background polling

    const check = async () => {
      attempts++;
      if (this.activeListeners.has(boothId)) return;
      if (attempts > maxAttempts) {
        console.log(`[YouTubeChat] Background poller finished after ${maxAttempts} attempts for ${boothId}`);
        return;
      }

      try {
        console.log(`[YouTubeChat] 🔍 Background search for live stream (${attempts}/${maxAttempts}) for ${boothId}...`);
        const chat = new LiveChat(targetId, 1000);
        this.attachLiveChatHandlers(boothId, chat, cleanInput);
        
        const ok = await chat.start().catch(() => false);
        if (ok) {
          console.log(`[YouTubeChat] 🎉 Successfully connected in background! LiveId: ${chat.liveId} for ${boothId}`);
          this.activeListeners.set(boothId, chat);
          this.activeVideoIds.set(boothId, chat.liveId || '');
          eventHub.broadcast({
            type: 'ENTITY_MUTATED',
            module: 'SALES',
            entity: 'YOUTUBE_CHAT_STATUS',
            action: 'UPDATE',
            documentRef: boothId,
            data: { boothId, status: 'CONNECTED', liveId: chat.liveId }
          });
          return;
        }
      } catch (_) {}

      const timer = setTimeout(check, 6000);
      this.reconnectTimers.set(boothId, timer);
    };

    const timer = setTimeout(check, 5000);
    this.reconnectTimers.set(boothId, timer);
  }

  public disconnectBooth(boothId: string, clearMemory = true) {
    if (this.reconnectTimers.has(boothId)) {
      clearTimeout(this.reconnectTimers.get(boothId)!);
      this.reconnectTimers.delete(boothId);
    }
    const existing = this.activeListeners.get(boothId);
    if (existing) {
      try {
        existing.stop('USER_DISCONNECT');
      } catch (_) {}
      this.activeListeners.delete(boothId);
      this.activeVideoIds.delete(boothId);
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

  public getBoothChatStatus(boothId: string) {
    const listener = this.activeListeners.get(boothId);
    return {
      isConnected: !!listener,
      isSearching: this.reconnectTimers.has(boothId) && !listener,
      liveId: this.activeVideoIds.get(boothId) || null,
      lastInput: this.lastKnownInputs.get(boothId) || null
    };
  }
}

export const youTubeChatService = new YouTubeChatService();
