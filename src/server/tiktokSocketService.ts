import { TikTokLiveConnection } from 'tiktok-live-connector';
import { eventHub } from './events.ts';
import { streamController } from './streamController.ts';
import { relationalStore } from '../db/relationalStore.ts';
import { getPgClient } from '../db/pgPool.ts';
import {
  parseLiveClaimDetails,
  shouldHandleAsOpenLiveClaim,
  resolveOpenClaimPriceAndTitle,
  executeOpenLiveClaim,
  canSendNeedPricePrompt,
  buildNeedPriceReply
} from '../modules/liveStreaming/openLiveClaimHelper.ts';

export interface TikTokLiveStats {
  username: string;
  boothId?: string;
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

interface BoothTikTokSession {
  boothId: string;
  username: string;
  connection: any;
  stats: TikTokLiveStats;
}

function normalizeBoothId(boothId?: string): string {
  const raw = String(boothId || 'booth-1').trim().toLowerCase();
  const num = parseInt(raw.replace(/^booth[-_]?0*/i, ''), 10) || 1;
  return `booth-${num}`;
}

class TikTokSocketService {
  private sessions: Map<string, BoothTikTokSession> = new Map();
  private lastBoothId: string = 'booth-1';
  private claimRegex = /\b(?:claim|mine)\b/i;

  private getDefaultStats(boothId: string = 'booth-1'): TikTokLiveStats {
    return {
      username: '',
      boothId,
      status: 'DISCONNECTED',
      viewerCount: 0,
      totalLikes: 0,
      totalDiamonds: 0,
      commentsCount: 0,
      claimsCount: 0,
      isRealConnection: false
    };
  }

  public getStatus(boothId?: string): TikTokLiveStats {
    const targetBooth = boothId ? normalizeBoothId(boothId) : this.lastBoothId;
    const sess = this.sessions.get(targetBooth);
    if (sess) {
      return { ...sess.stats };
    }
    return this.getDefaultStats(targetBooth);
  }

  public async connect(username: string, rawBoothId: string = 'booth-1'): Promise<{ success: boolean; stats: TikTokLiveStats; error?: string }> {
    const boothId = normalizeBoothId(rawBoothId);
    this.lastBoothId = boothId;
    const cleanUsername = username.replace(/^@/, '').trim();
    if (!cleanUsername) {
      return { success: false, stats: this.getStatus(boothId), error: 'TikTok username is required' };
    }

    // Disconnect any existing session for THIS booth only (leaving other booths untouched)
    const existing = this.sessions.get(boothId);
    if (existing?.connection) {
      try {
        await this.disconnect(boothId);
      } catch (err) {
        console.warn(`[TikTok Socket] Error while disconnecting previous session on ${boothId}:`, err);
      }
    }

    const stats: TikTokLiveStats = {
      username: cleanUsername,
      boothId,
      status: 'CONNECTING',
      viewerCount: 0,
      totalLikes: 0,
      totalDiamonds: 0,
      commentsCount: 0,
      claimsCount: 0,
      connectedAt: new Date().toISOString(),
      isRealConnection: true
    };

    const session: BoothTikTokSession = {
      boothId,
      username: cleanUsername,
      connection: null,
      stats
    };
    this.sessions.set(boothId, session);
    this.broadcastStatusChange(session);

    try {
      const connection: any = new TikTokLiveConnection(cleanUsername, {
        processInitialData: false,
        enableExtendedGiftInfo: true,
        enableWebsocketUpgrade: true,
        requestPollingIntervalMs: 1500
      } as any);
      session.connection = connection;

      // 1. Room Connected
      connection.on('connected', (state: any) => {
        console.log(`[TikTok Live Socket] 🟢 Connected to @${cleanUsername} on ${boothId} (Room ID: ${state?.roomId || 'Active'})`);
        session.stats.status = 'LIVE';
        session.stats.roomId = state?.roomId || `room-${cleanUsername}`;
        session.stats.viewerCount = state?.roomInfo?.user_count || 1;
        this.broadcastStatusChange(session);

        eventHub.broadcast({
          type: 'ENTITY_MUTATED',
          module: 'SALES',
          entity: 'TIKTOK_SOCKET',
          action: 'UPDATE',
          documentRef: cleanUsername,
          data: { ...session.stats }
        });
      });

      // 2. Real-time Live Chat Comments & Full NLP Auto-Claim
      connection.on('chat', async (data: any) => {
        const commentText = (data?.comment || '').trim();
        if (!commentText) return;
        const commenterHandle = `@${data?.uniqueId || 'viewer'}`;
        const nickname = data?.nickname || commenterHandle;

        session.stats.commentsCount++;

        // Push comment to active booth in StreamController
        const newComment = streamController.addComment(
          boothId,
          commentText,
          'tiktok',
          commenterHandle,
          data?.msgId ? `tt:${data.msgId}` : undefined
        );
        if ((newComment as any).__duplicate) return;

        const isClaim = Boolean(
          newComment.isClaimIntent && streamController.isGenuineClaimMessage(commentText, commenterHandle)
        );
        const parsedClaim = parseLiveClaimDetails(commentText, newComment.extractedSku);

        if (isClaim) {
          session.stats.claimsCount++;
          const boothSession = streamController.getBooth(boothId);
          let pinnedTitle: string | undefined;
          let pinnedSku: string | undefined;
          try {
            const { getBoothPinnedPiece } = await import('../modules/liveStreaming/rtmpRelayServer.ts');
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
                  username: commenterHandle,
                  platform: 'tiktok',
                  rawComment: commentText,
                  commentId: newComment.id,
                  priceAed,
                  itemTitle
                });
                newComment.isClaimIntent = true;
                newComment.extractedSku = openRes.sku;
                newComment.isProcessed = true;
              } catch (openErr) {
                console.warn('[TikTok Open-Live Claim] Warning:', openErr);
              }
            } else if (canSendNeedPricePrompt(boothId, commenterHandle)) {
              streamController.addComment(boothId, buildNeedPriceReply(commenterHandle), 'tiktok', '📢 Vintage Vibes Host');
            }
          } else {
            const targetSku = parsedClaim.extractedSku || pinnedSku || boothSession?.activeOnAirSku;

            if (targetSku) {
              try {
                const draftRes = relationalStore.draftLiveClaimInvoice({
                  barcode: targetSku,
                  buyerHandle: commenterHandle,
                  boothId,
                  offeredPrice: newComment.extractedBid,
                  channel: 'TIKTOK'
                });

                if (draftRes.success && draftRes.piece) {
                  newComment.isClaimIntent = true;
                  newComment.extractedSku = targetSku;
                  newComment.isProcessed = true;

                  const piece = draftRes.piece;
                  const price = Number(newComment.extractedBid || piece?.lockedPrice || piece?.retailPriceAed || 120);
                  const invoiceNo = draftRes.draftInvoice?.invoiceNo || `SLS-DRAFT-LIVE-${Date.now().toString().slice(-4)}`;
                  const checkoutUrl = `https://vintagevibesgk.com/?checkout=${encodeURIComponent(targetSku)}`;
                  const brandName = piece?.brandName || 'Vintage Archive';
                  const itemName = piece?.itemName || 'Vintage Piece';
                  const fullTitle = itemName.toLowerCase().includes(brandName.toLowerCase())
                    ? itemName
                    : `${brandName} ${itemName}`.trim();
                  const sizeLabel = piece?.sizeScanned || 'L';

                  const hostReplyText = `🎉 Congratulations ${commenterHandle}! Piece #${targetSku} (${fullTitle}, Size ${sizeLabel}) LOCKED for AED ${price}! • Invoice: #${invoiceNo} • 🔗 Tap our Profile Bio Link or Check Inbox DM to confirm delivery!`;

                  streamController.recordClaim(boothId, targetSku, price);
                  streamController.markBuyerClaimCommentLocked(boothId, commenterHandle, targetSku, newComment.id);
                  streamController.addComment(boothId, hostReplyText, 'tiktok', '📢 Vintage Vibes Host');

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
                        [commenterHandle, boothId, Date.now() + 120 * 60 * 1000, targetSku]
                      );
                      await client.end().catch(() => {});
                    }
                  } catch (_) {}

                  try {
                    const { marketingService } = await import('../modules/marketing/marketing.service.ts');
                    await marketingService.recordLiveStreamClaimAndNotifyWhatsApp(
                      {
                        id: `claim-${Date.now()}`,
                        timestamp: new Date().toLocaleTimeString(),
                        customerHandle: commenterHandle,
                        platform: 'tiktok',
                        rawComment: commentText,
                        matchedKeyword: 'MINE/CLAIM',
                        sku: targetSku,
                        itemName: `${fullTitle} (Size ${sizeLabel})`,
                        itemImage: piece?.frontImageUrl || '',
                        priceAed: price,
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
                      priceAed: price,
                      checkoutUrl,
                      boothId,
                      buyerHandle: commenterHandle,
                      platform: 'tiktok',
                      source: 'TIKTOK_LIVE_CHAT'
                    }
                  });
                }
              } catch (e) {
                console.warn('[TikTok Live Auto-Claim] Warning:', e);
              }
            }
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
      connection.on('gift', (data: any) => {
        if (data.giftType === 1 && !data.repeatEnd) return;
        const diamonds = (data.diamondCount || 1) * (data.repeatCount || 1);
        session.stats.totalDiamonds += diamonds;

        const giftComment = streamController.addComment(
          boothId,
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
      connection.on('roomUser', (data: any) => {
        if (data?.viewerCount) {
          session.stats.viewerCount = data.viewerCount;
          this.broadcastStatusChange(session);
        }
      });

      // 5. Likes
      connection.on('like', (data: any) => {
        if (data?.totalLikeCount) {
          session.stats.totalLikes = data.totalLikeCount;
        } else if (data?.likeCount) {
          session.stats.totalLikes += data.likeCount;
        }
      });

      // 6. Stream Ended
      connection.on('streamEnd', () => {
        console.log(`[TikTok Live Socket] 🔴 Broadcast ended for @${cleanUsername} (${boothId})`);
        session.stats.status = 'OFFLINE';
        this.broadcastStatusChange(session);
      });

      // 7. Errors
      connection.on('error', (err: any) => {
        console.warn(`[TikTok Live Socket] ⚠️ Socket error on @${cleanUsername} (${boothId}):`, err?.message || err);
        session.stats.status = 'ERROR';
        session.stats.errorMessage = err?.message || 'WebSocket connection error';
        this.broadcastStatusChange(session);
      });

      // 8. Disconnected
      connection.on('disconnected', () => {
        console.log(`[TikTok Live Socket] ⚪ Disconnected from @${cleanUsername} (${boothId})`);
        if (session.stats.status !== 'OFFLINE') {
          session.stats.status = 'DISCONNECTED';
        }
        this.broadcastStatusChange(session);
      });

      await connection.connect();
      return { success: true, stats: session.stats };
    } catch (err: any) {
      console.warn(`[TikTok Live Socket] Connection failed for @${cleanUsername} (${boothId}):`, err?.message || err);
      session.stats.status = 'ERROR';
      session.stats.errorMessage = err?.message || 'Could not connect to TikTok live room. Stream may be offline.';
      this.broadcastStatusChange(session);
      return { success: false, stats: session.stats, error: session.stats.errorMessage };
    }
  }

  public async disconnect(rawBoothId?: string): Promise<{ success: boolean; stats: TikTokLiveStats }> {
    const boothId = rawBoothId ? normalizeBoothId(rawBoothId) : this.lastBoothId;
    const session = this.sessions.get(boothId);
    if (session?.connection) {
      try {
        await session.connection.disconnect();
      } catch (e) {
        console.warn(`[TikTok Socket] Error during disconnect (${boothId}):`, e);
      }
      session.connection = null;
    }

    if (session) {
      session.stats.status = 'DISCONNECTED';
      this.broadcastStatusChange(session);
      return { success: true, stats: session.stats };
    }

    return { success: true, stats: this.getDefaultStats(boothId) };
  }

  private broadcastStatusChange(session: BoothTikTokSession) {
    eventHub.broadcast({
      type: 'ENTITY_MUTATED',
      module: 'SALES',
      entity: 'TIKTOK_SOCKET_STATUS',
      action: 'UPDATE',
      documentRef: session.username || session.boothId || 'socket',
      data: { ...session.stats }
    });
  }
}

export const tikTokSocketService = new TikTokSocketService();
