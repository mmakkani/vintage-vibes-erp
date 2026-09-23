import { TikTokLiveConnection } from 'tiktok-live-connector';
import { eventHub } from './events.ts';
import { streamController } from './streamController.ts';
import { relationalStore } from '../db/relationalStore.ts';

export interface TikTokLiveStats {
  username: string;
  roomId?: string;
  status: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'LIVE' | 'OFFLINE' | 'ERROR';
  viewerCount: number;
  totalLikes: number;
  totalDiamonds: number;
  commentsCount: number;
  claimsCount: number;
  connectedAt?: string;
  errorMessage?: string;
  isRealConnection: boolean;
}

class TikTokSocketService {
  private connection: any = null;
  private currentUsername: string = '';
  private stats: TikTokLiveStats = {
    username: '',
    status: 'DISCONNECTED',
    viewerCount: 0,
    totalLikes: 0,
    totalDiamonds: 0,
    commentsCount: 0,
    claimsCount: 0,
    isRealConnection: false
  };

  private claimRegex = /\b(?:claim|mine|bin|take|buy)\b/i;

  public getStatus(): TikTokLiveStats {
    return { ...this.stats };
  }

  public async connect(username: string): Promise<{ success: boolean; stats: TikTokLiveStats; error?: string }> {
    const cleanUsername = username.replace(/^@/, '').trim();
    if (!cleanUsername) {
      return { success: false, stats: this.stats, error: 'TikTok username is required' };
    }

    // Disconnect any existing session
    if (this.connection) {
      try {
        await this.disconnect();
      } catch (err) {
        console.warn('[TikTok Socket] Error while disconnecting previous session:', err);
      }
    }

    this.currentUsername = cleanUsername;
    this.stats = {
      username: cleanUsername,
      status: 'CONNECTING',
      viewerCount: 0,
      totalLikes: 0,
      totalDiamonds: 0,
      commentsCount: 0,
      claimsCount: 0,
      connectedAt: new Date().toISOString(),
      isRealConnection: true
    };

    this.broadcastStatusChange();

    try {
      this.connection = new TikTokLiveConnection(cleanUsername, {
        processInitialData: false,
        enableExtendedGiftInfo: true,
        enableWebsocketUpgrade: true,
        requestPollingIntervalMs: 1500
      } as any);

      // 1. Room Connected
      this.connection.on('connected', (state: any) => {
        console.log(`[TikTok Live Socket] 🟢 Connected to @${cleanUsername} (Room ID: ${state?.roomId || 'Active'})`);
        this.stats.status = 'LIVE';
        this.stats.roomId = state?.roomId || `room-${cleanUsername}`;
        this.stats.viewerCount = state?.roomInfo?.user_count || 1;
        this.broadcastStatusChange();

        // Notify ERP Event Hub
        eventHub.broadcast({
          type: 'ENTITY_MUTATED',
          module: 'SALES',
          entity: 'TIKTOK_SOCKET',
          action: 'UPDATE',
          documentRef: cleanUsername,
          data: { ...this.stats }
        });
      });

      // 2. Real-time Live Chat Comments
      this.connection.on('chat', (data: any) => {
        const commentText = data?.comment || '';
        const commenterHandle = `@${data?.uniqueId || 'viewer'}`;
        const nickname = data?.nickname || commenterHandle;

        this.stats.commentsCount++;

        // Check if comment is a claim intent (e.g. "CLAIM VV-BAL-001" or "MINE")
        const isClaim = this.claimRegex.test(commentText);
        let extractedSku: string | undefined = undefined;

        // Try extracting SKU pattern e.g. VV-BAL-xxx-x-x or 4-digit code
        const skuMatch = commentText.match(/(?:VV-[A-Z0-9\-]+|[A-Z]{2,4}-\d{3,6})/i);
        if (skuMatch) {
          extractedSku = skuMatch[0].toUpperCase();
        }

        if (isClaim) {
          this.stats.claimsCount++;
        }

        // Push comment to Booth 01 in StreamController
        const newComment = streamController.addComment(
          'booth-01',
          commentText,
          'tiktok',
          commenterHandle
        );

        // If a valid SKU was claimed, trigger claim in ERP store if item is available
        if (extractedSku) {
          try {
            const piece = relationalStore.getInventoryPieces().find(p => p.barcode.toLowerCase() === extractedSku!.toLowerCase());
            if (piece && !piece.isSold && piece.status === 'IN_STOCK') {
              console.log(`[TikTok Live Auto-Claim] Real buyer ${commenterHandle} claimed SKU ${extractedSku}!`);
              relationalStore.claimPieceAtomically({
                barcode: extractedSku,
                buyerHandle: commenterHandle,
                channel: 'TikTok Live Real Stream',
                boothId: 'booth-01',
                lockDurationSeconds: 900 // 15 mins lock
              });
            }
          } catch (e) {
            console.warn('[TikTok Live Auto-Claim] Warning:', e);
          }
        }

        // Broadcast to all connected screens
        eventHub.broadcast({
          type: 'ENTITY_MUTATED',
          module: 'SALES',
          entity: 'LIVE_COMMENT',
          action: 'CREATE',
          documentRef: newComment.id,
          data: {
            ...newComment,
            nickname,
            isRealTikTokLive: true
          }
        });
      });

      // 3. Live Gifts
      this.connection.on('gift', (data: any) => {
        if (data.giftType === 1 && !data.repeatEnd) return; // ignore non-final combo
        const diamonds = (data.diamondCount || 1) * (data.repeatCount || 1);
        this.stats.totalDiamonds += diamonds;

        const giftComment = streamController.addComment(
          'booth-01',
          `🎁 Sent ${data.giftName || 'Gift'} x${data.repeatCount || 1} (${diamonds} Diamonds)`,
          'tiktok',
          `@${data.uniqueId}`
        );

        eventHub.broadcast({
          type: 'ENTITY_MUTATED',
          module: 'SALES',
          entity: 'LIVE_GIFT',
          action: 'CREATE',
          documentRef: giftComment.id,
          data: {
            giftComment,
            diamondCount: diamonds,
            giftName: data.giftName,
            isRealTikTokLive: true
          }
        });
      });

      // 4. Live Viewer Count & Room Stats
      this.connection.on('roomUser', (data: any) => {
        if (data?.viewerCount) {
          this.stats.viewerCount = data.viewerCount;
          this.broadcastStatusChange();
        }
      });

      // 5. Likes
      this.connection.on('like', (data: any) => {
        if (data?.totalLikeCount) {
          this.stats.totalLikes = data.totalLikeCount;
        } else if (data?.likeCount) {
          this.stats.totalLikes += data.likeCount;
        }
      });

      // 6. Stream Ended
      this.connection.on('streamEnd', () => {
        console.log(`[TikTok Live Socket] 🔴 Broadcast ended for @${cleanUsername}`);
        this.stats.status = 'OFFLINE';
        this.broadcastStatusChange();
      });

      // 7. Errors
      this.connection.on('error', (err: any) => {
        console.warn(`[TikTok Live Socket] ⚠️ Socket error on @${cleanUsername}:`, err?.message || err);
        this.stats.status = 'ERROR';
        this.stats.errorMessage = err?.message || 'WebSocket connection error';
        this.broadcastStatusChange();
      });

      // 8. Disconnected
      this.connection.on('disconnected', () => {
        console.log(`[TikTok Live Socket] ⚪ Disconnected from @${cleanUsername}`);
        if (this.stats.status !== 'OFFLINE') {
          this.stats.status = 'DISCONNECTED';
        }
        this.broadcastStatusChange();
      });

      // Trigger connection
      await this.connection.connect();
      return { success: true, stats: this.stats };
    } catch (err: any) {
      console.warn(`[TikTok Live Socket] Connection failed for @${cleanUsername}:`, err?.message || err);
      this.stats.status = 'ERROR';
      this.stats.errorMessage = err?.message || 'Could not connect to TikTok live room. Stream may be offline.';
      this.broadcastStatusChange();
      return { success: false, stats: this.stats, error: this.stats.errorMessage };
    }
  }

  public async disconnect(): Promise<{ success: boolean; stats: TikTokLiveStats }> {
    if (this.connection) {
      try {
        await this.connection.disconnect();
      } catch (e) {
        console.warn('[TikTok Socket] Error during disconnect:', e);
      }
      this.connection = null;
    }

    this.stats.status = 'DISCONNECTED';
    this.broadcastStatusChange();
    return { success: true, stats: this.stats };
  }

  private broadcastStatusChange() {
    eventHub.broadcast({
      type: 'ENTITY_MUTATED',
      module: 'SALES',
      entity: 'TIKTOK_SOCKET_STATUS',
      action: 'UPDATE',
      documentRef: this.currentUsername || 'socket',
      data: { ...this.stats }
    });
  }
}

export const tikTokSocketService = new TikTokSocketService();
