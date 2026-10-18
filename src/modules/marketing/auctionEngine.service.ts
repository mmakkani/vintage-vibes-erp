import fs from 'fs';
import path from 'path';
import { baileysManager } from './baileys.service.ts';
import {
  reserveVintagePiece,
  formatWhatsAppDirectOrderCard,
  registerCatalogItemPrice
} from '../../server/ustadShagirdAiEngine.ts';
import { fastIngestionService } from './fastIngestion.service.ts';

export type AuctionLifecycleState =
  | 'IDLE'
  | 'ACTIVE_BIDDING'
  | 'COUNTDOWN_5MIN'
  | 'CLOSED'
  | 'SETTLED';

export interface AuctionBidEntry {
  bidId: string;
  bidderPhone: string;
  bidderName: string;
  amountAED: number;
  timestamp: string;
}

export interface LiveAuctionSession {
  auctionId: string;
  itemId: string;
  brandName: string;
  itemName: string;
  size: string;
  eraEstimate: string;
  pieceHistory: string;
  imageUrl?: string;
  groupJid: string;
  startedByPhone: string;
  startPriceAED: number;
  minIncrementAED: number;
  durationMinutes: number;
  currentHighestBidAED: number;
  highestBidder?: {
    phone: string;
    name: string;
    jid: string;
  };
  state: AuctionLifecycleState;
  startedAt: number;
  endsAt: number;
  countdownWarned: boolean;
  bids: AuctionBidEntry[];
  winnerSoftLockExpiresAt?: string;
}

export interface BidEvaluationResult {
  handled: boolean;
  accepted: boolean;
  auctionId?: string;
  itemId?: string;
  bidAmountAED?: number;
  currentHighestBidAED?: number;
  minRequiredBidAED?: number;
  replyMessage: string;
  voiceReplyScript?: string;
  state?: AuctionLifecycleState;
}

const AUCTIONS_STORE_PATH = path.join(process.cwd(), 'data', 'whatsapp_live_auctions.json');

export class AuctionEngineService {
  private activeAuctions: Map<string, LiveAuctionSession> = new Map();
  private timers: Map<string, { countdownTimer?: NodeJS.Timeout; closeTimer?: NodeJS.Timeout }> = new Map();

  constructor() {
    this.loadAuctionsFromDisk();
  }

  private loadAuctionsFromDisk(): void {
    try {
      const dir = path.dirname(AUCTIONS_STORE_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      if (fs.existsSync(AUCTIONS_STORE_PATH)) {
        const list = JSON.parse(fs.readFileSync(AUCTIONS_STORE_PATH, 'utf8'));
        if (Array.isArray(list)) {
          for (const auc of list) {
            if (auc?.auctionId) {
              this.activeAuctions.set(auc.auctionId, auc);
              if (
                (auc.state === 'ACTIVE_BIDDING' || auc.state === 'COUNTDOWN_5MIN') &&
                auc.endsAt > Date.now()
              ) {
                this.scheduleAuctionTimers(auc);
              }
            }
          }
        }
      }
    } catch {}
  }

  private saveAuctionsToDisk(): void {
    try {
      const dir = path.dirname(AUCTIONS_STORE_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const list = Array.from(this.activeAuctions.values()).slice(-200);
      fs.writeFileSync(AUCTIONS_STORE_PATH, JSON.stringify(list, null, 2), 'utf8');
    } catch {}
  }

  /**
   * Parse `#startauction <itemId> <startPriceAED> <durationMinutes> <minIncrementAED>` command
   */
  public parseStartAuctionCommand(rawMessage: string): {
    isCommand: boolean;
    itemId?: string;
    startPriceAED?: number;
    durationMinutes?: number;
    minIncrementAED?: number;
  } {
    const clean = String(rawMessage || '').trim();
    const match = clean.match(
      /^#startauction\s+([A-Za-z0-9\-_]+)(?:\s+(\d+(?:\.\d+)?))?(?:\s+(\d+(?:\.\d+)?))?(?:\s+(\d+(?:\.\d+)?))?/i
    );
    if (!match) {
      return { isCommand: false };
    }
    return {
      isCommand: true,
      itemId: match[1].toUpperCase(),
      startPriceAED: match[2] ? Math.max(10, Math.round(Number(match[2]))) : 150,
      durationMinutes: match[3] ? Math.max(1, Math.min(180, Math.round(Number(match[3])))) : 15,
      minIncrementAED: match[4] ? Math.max(5, Math.round(Number(match[4]))) : 20
    };
  }

  /**
   * 1. Start a Timed Live Auction in a WhatsApp VIP Group or Thread
   */
  public async startLiveAuction(params: {
    itemId: string;
    startPriceAED: number;
    durationMinutes: number;
    minIncrementAED: number;
    groupJid?: string;
    startedByPhone?: string;
    brandName?: string;
    itemName?: string;
    size?: string;
    eraEstimate?: string;
    pieceHistory?: string;
    imageUrl?: string;
  }): Promise<LiveAuctionSession> {
    const sku = String(params.itemId || 'VV-892').trim().toUpperCase();
    const fastRec = fastIngestionService.getIngestedRecord(sku);

    const brandName = params.brandName || fastRec?.metadata?.brand || 'Carhartt WIP';
    const itemName = params.itemName || fastRec?.metadata?.subCategory || '1-of-1 Archive Jacket';
    const size = params.size || fastRec?.metadata?.size || 'XL';
    const eraEstimate = params.eraEstimate || fastRec?.metadata?.era_estimate || 'Late 90s';
    const pieceHistory =
      params.pieceHistory ||
      `Authentic ${eraEstimate} USA/UK imported 1-of-1 archive collector piece (${brandName} ${itemName}, Size ${size}). Verified original stitch & hardware at Vintage Vibes Dubai.`;
    const imageUrl = params.imageUrl || fastRec?.imageUrl;

    const startPriceAED = Math.max(10, Math.round(Number(params.startPriceAED || 150)));
    const durationMinutes = Math.max(0.1, Number(params.durationMinutes || 15));
    const minIncrementAED = Math.max(5, Math.round(Number(params.minIncrementAED || 20)));

    const now = Date.now();
    const endsAt = now + Math.round(durationMinutes * 60 * 1000);
    const auctionId = `AUC-${sku}-${String(now).slice(-5)}`;
    const groupJid = params.groupJid || 'vip-auction-group@g.us';

    // Close any prior active auction in the same group
    for (const existing of this.activeAuctions.values()) {
      if (
        existing.groupJid === groupJid &&
        (existing.state === 'ACTIVE_BIDDING' || existing.state === 'COUNTDOWN_5MIN')
      ) {
        existing.state = 'CLOSED';
        this.clearAuctionTimers(existing.auctionId);
      }
    }

    registerCatalogItemPrice(sku, startPriceAED, Math.ceil(startPriceAED * 0.8));

    const session: LiveAuctionSession = {
      auctionId,
      itemId: sku,
      brandName,
      itemName,
      size,
      eraEstimate,
      pieceHistory,
      imageUrl,
      groupJid,
      startedByPhone: params.startedByPhone || '971528049351',
      startPriceAED,
      minIncrementAED,
      durationMinutes,
      currentHighestBidAED: 0,
      state: durationMinutes <= 5 ? 'COUNTDOWN_5MIN' : 'ACTIVE_BIDDING',
      startedAt: now,
      endsAt,
      countdownWarned: durationMinutes <= 5,
      bids: []
    };

    this.activeAuctions.set(auctionId, session);
    this.saveAuctionsToDisk();
    this.scheduleAuctionTimers(session);

    // Broadcast High-Res Master Studio Photo + Auction Announcement to Group
    const launchCard = this.formatAuctionLaunchMessage(session);
    try {
      const waSession = baileysManager.getConnectedSession();
      if (waSession?.userId && groupJid.includes('@')) {
        if (imageUrl) {
          await baileysManager.sendImage(waSession.userId, groupJid, imageUrl, launchCard);
        } else {
          await baileysManager.sendMessage(waSession.userId, groupJid, launchCard);
        }
      }
    } catch {}

    return session;
  }

  public formatAuctionLaunchMessage(session: LiveAuctionSession): string {
    return [
      `🔨 *VINTAGE VIBES DUBAI — LIVE VIP AUCTION STARTED!* 🔨`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `🧥 *1-of-1 Grail:* ${session.brandName} — ${session.itemName}`,
      `🏷️ *SKU:* \`#${session.itemId}\`  |  📏 *Size:* *${session.size}* (${session.eraEstimate})`,
      `📜 *Piece History:* ${session.pieceHistory}`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `💰 *Starting Bid:* *${session.startPriceAED} AED*`,
      `📈 *Minimum Bid Increment:* *+${session.minIncrementAED} AED*`,
      `⏳ *Auction Timer:* *${session.durationMinutes} Minutes*`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `⚡ *HOW TO BID:* Reply right now with your amount:`,
      `👉 Example: *"Bid ${session.startPriceAED}"* or *"${session.startPriceAED + session.minIncrementAED} AED"*`
    ].join('\n');
  }

  /**
   * Schedule 5-Minute Countdown transition & Auto-Close timer
   */
  private scheduleAuctionTimers(session: LiveAuctionSession): void {
    this.clearAuctionTimers(session.auctionId);
    const now = Date.now();
    const msUntilEnd = Math.max(50, session.endsAt - now);
    const msUntil5Min = session.endsAt - 5 * 60 * 1000 - now;

    const timerBundle: { countdownTimer?: NodeJS.Timeout; closeTimer?: NodeJS.Timeout } = {};

    if (msUntil5Min > 0 && !session.countdownWarned) {
      timerBundle.countdownTimer = setTimeout(() => {
        this.triggerCountdownWarning(session.auctionId).catch(() => {});
      }, msUntil5Min);
      if (typeof timerBundle.countdownTimer.unref === 'function') {
        timerBundle.countdownTimer.unref();
      }
    }

    timerBundle.closeTimer = setTimeout(() => {
      this.closeAuctionAndHandoffWinner(session.auctionId).catch(() => {});
    }, msUntilEnd);
    if (typeof timerBundle.closeTimer.unref === 'function') {
      timerBundle.closeTimer.unref();
    }

    this.timers.set(session.auctionId, timerBundle);
  }

  private clearAuctionTimers(auctionId: string): void {
    const t = this.timers.get(auctionId);
    if (t) {
      if (t.countdownTimer) clearTimeout(t.countdownTimer);
      if (t.closeTimer) clearTimeout(t.closeTimer);
      this.timers.delete(auctionId);
    }
  }

  private async triggerCountdownWarning(auctionId: string): Promise<void> {
    const session = this.activeAuctions.get(auctionId);
    if (!session || session.state !== 'ACTIVE_BIDDING') return;

    session.state = 'COUNTDOWN_5MIN';
    session.countdownWarned = true;
    this.saveAuctionsToDisk();

    const minNext =
      session.currentHighestBidAED > 0
        ? session.currentHighestBidAED + session.minIncrementAED
        : session.startPriceAED;

    const msg = [
      `⏰ *FINAL 5 MINUTES WARNING — #${session.itemId}* ⏰`,
      `🧥 *${session.brandName} — ${session.itemName} (Size ${session.size})*`,
      session.highestBidder
        ? `👑 *Current Highest Bid:* *${session.currentHighestBidAED} AED* by *${session.highestBidder.name}*`
        : `💰 *Opening Bid Open:* *${session.startPriceAED} AED*`,
      `👉 *Next Valid Bid:* *${minNext} AED* or higher! Last 5 minutes before hammer drops!`
    ].join('\n');

    try {
      const waSession = baileysManager.getConnectedSession();
      if (waSession?.userId && session.groupJid.includes('@')) {
        await baileysManager.sendMessage(waSession.userId, session.groupJid, msg);
      }
    } catch {}
  }

  /**
   * 2. Real-Time Bid Parsing & Validation
   *    Handles messages like "Bid 250", "280 AED", "300" during an active auction
   */
  public async processIncomingBidMessage(params: {
    groupJid?: string;
    auctionId?: string;
    bidderPhone: string;
    bidderName?: string;
    messageText: string;
    sendWhatsAppReplies?: boolean;
  }): Promise<BidEvaluationResult> {
    const text = String(params.messageText || '').trim();
    if (!text) {
      return { handled: false, accepted: false, replyMessage: '' };
    }

    // Locate target active auction
    let session: LiveAuctionSession | undefined;
    if (params.auctionId) {
      session = this.activeAuctions.get(params.auctionId);
    } else if (params.groupJid) {
      for (const auc of this.activeAuctions.values()) {
        if (
          auc.groupJid === params.groupJid &&
          (auc.state === 'ACTIVE_BIDDING' || auc.state === 'COUNTDOWN_5MIN')
        ) {
          session = auc;
          break;
        }
      }
    }
    if (!session) {
      for (const auc of this.activeAuctions.values()) {
        if (auc.state === 'ACTIVE_BIDDING' || auc.state === 'COUNTDOWN_5MIN') {
          session = auc;
        }
      }
    }

    if (!session || (session.state !== 'ACTIVE_BIDDING' && session.state !== 'COUNTDOWN_5MIN')) {
      return { handled: false, accepted: false, replyMessage: '' };
    }

    // Parse bid number from patterns: "Bid 250", "280 AED", "300", "boli 280", "my bid 300"
    const bidMatch =
      text.match(/^\s*(?:bid|boli|offer|my\s+bid)\s*[:\-]?\s*(\d{2,5})(?:\s*(?:aed|dhs|dirhams?))?\s*$/i) ||
      text.match(/^\s*(\d{2,5})\s*(?:aed|dhs|dirhams?)\s*$/i) ||
      text.match(/^\s*(\d{2,4})\s*$/);

    if (!bidMatch) {
      return { handled: false, accepted: false, replyMessage: '' };
    }

    const offeredBidAED = Math.round(Number(bidMatch[1]));
    const bidderName = String(params.bidderName || 'VIP Bidder').trim();
    const cleanPhone = String(params.bidderPhone || '').replace(/\D/g, '') || '971500000000';

    // Calculate minimum required bid:
    // - If no bids yet: must be >= startPriceAED
    // - If highest bid exists: must be >= currentHighestBidAED + minIncrementAED
    const minRequiredBidAED =
      session.currentHighestBidAED > 0
        ? session.currentHighestBidAED + session.minIncrementAED
        : session.startPriceAED;

    if (offeredBidAED < minRequiredBidAED) {
      const currentHighDisplay =
        session.currentHighestBidAED > 0 ? session.currentHighestBidAED : session.startPriceAED;
      const rejectText = `${bidderName}, current highest bid is ${currentHighDisplay} AED. Minimum bid is ${minRequiredBidAED} AED.`;
      const voiceScript = `${bidderName} bhai, abhi highest bid ${currentHighDisplay} AED chal rahi hai. Agli minimum bid ${minRequiredBidAED} AED hai.`;

      if (params.sendWhatsAppReplies !== false) {
        try {
          const waSession = baileysManager.getConnectedSession();
          if (waSession?.userId && session.groupJid.includes('@')) {
            await baileysManager.sendMessage(waSession.userId, session.groupJid, `⚠️ ${rejectText}`);
          }
        } catch {}
      }

      return {
        handled: true,
        accepted: false,
        auctionId: session.auctionId,
        itemId: session.itemId,
        bidAmountAED: offeredBidAED,
        currentHighestBidAED: currentHighDisplay,
        minRequiredBidAED,
        replyMessage: rejectText,
        voiceReplyScript: voiceScript,
        state: session.state
      };
    }

    // Valid Bid! Update highest bidder and broadcast immediately
    session.currentHighestBidAED = offeredBidAED;
    session.highestBidder = {
      phone: cleanPhone,
      name: bidderName,
      jid: `${cleanPhone}@s.whatsapp.net`
    };
    const bidEntry: AuctionBidEntry = {
      bidId: `BID-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      bidderPhone: cleanPhone,
      bidderName,
      amountAED: offeredBidAED,
      timestamp: new Date().toISOString()
    };
    session.bids.push(bidEntry);

    if (session.endsAt - Date.now() <= 5 * 60 * 1000) {
      session.state = 'COUNTDOWN_5MIN';
    }
    this.saveAuctionsToDisk();

    const nextMin = offeredBidAED + session.minIncrementAED;
    const remMins = Math.max(1, Math.ceil((session.endsAt - Date.now()) / 60000));
    const announceMsg = [
      `🔥 *NEW HIGHEST BID — ${offeredBidAED} AED!* 🔥`,
      `👑 *Leading Bidder:* *${bidderName}*`,
      `🧥 *Piece:* ${session.brandName} — ${session.itemName} (\`#${session.itemId}\`, Size ${session.size})`,
      `📈 *Next Minimum Bid:* *${nextMin} AED*  |  ⏳ *Time Left:* ~${remMins} min`
    ].join('\n');

    if (params.sendWhatsAppReplies !== false) {
      try {
        const waSession = baileysManager.getConnectedSession();
        if (waSession?.userId && session.groupJid.includes('@')) {
          await baileysManager.sendMessage(waSession.userId, session.groupJid, announceMsg);
        }
      } catch {}
    }

    return {
      handled: true,
      accepted: true,
      auctionId: session.auctionId,
      itemId: session.itemId,
      bidAmountAED: offeredBidAED,
      currentHighestBidAED: offeredBidAED,
      minRequiredBidAED: nextMin,
      replyMessage: announceMsg,
      voiceReplyScript: `Mubarak ho! ${bidderName} bhai ki nayi highest bid ${offeredBidAED} AED lag chuki hai! Agli minimum bid ${nextMin} AED hai.`,
      state: session.state
    };
  }

  /**
   * 3. Auto-Close Auction, Trigger 15-Minute Soft-Lock in DB/Memory, and DM Winner
   */
  public async closeAuctionAndHandoffWinner(auctionId: string): Promise<{
    closed: boolean;
    auction?: LiveAuctionSession;
    winnerDeclarationMessage: string;
    winnerDirectOrderCard?: string;
  }> {
    this.clearAuctionTimers(auctionId);
    const session = this.activeAuctions.get(auctionId);
    if (!session) {
      return { closed: false, winnerDeclarationMessage: 'Auction not found.' };
    }

    if (session.state === 'CLOSED' || session.state === 'SETTLED') {
      return {
        closed: true,
        auction: session,
        winnerDeclarationMessage: `Auction ${auctionId} is already ${session.state}.`
      };
    }

    session.state = 'CLOSED';

    if (!session.highestBidder || session.currentHighestBidAED <= 0) {
      this.saveAuctionsToDisk();
      const noBidMsg = `🔨 *AUCTION CLOSED — #${session.itemId}*\nNo bids were placed during the window. Piece remains available in showroom stock.`;
      try {
        const waSession = baileysManager.getConnectedSession();
        if (waSession?.userId && session.groupJid.includes('@')) {
          await baileysManager.sendMessage(waSession.userId, session.groupJid, noBidMsg);
        }
      } catch {}
      return {
        closed: true,
        auction: session,
        winnerDeclarationMessage: noBidMsg
      };
    }

    // Trigger 15-minute soft lock (`LOCKED_15MIN`) for the auction winner at the winning bid price
    registerCatalogItemPrice(session.itemId, session.currentHighestBidAED, session.startPriceAED);
    const lockRes = reserveVintagePiece(
      session.itemId,
      session.highestBidder.phone,
      session.currentHighestBidAED,
      {
        listedPriceAED: session.currentHighestBidAED,
        dbFloorPriceAED: session.startPriceAED,
        itemName: `${session.brandName} — ${session.itemName}`,
        size: session.size
      }
    );
    session.winnerSoftLockExpiresAt = lockRes.expiresAt;
    this.saveAuctionsToDisk();

    const groupDeclaration = [
      `🏆 *SOLD! AUCTION CLOSED — WINNER DECLARED!* 🏆`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `👑 *Winner:* *${session.highestBidder.name}*`,
      `💰 *Winning Bid:* *${session.currentHighestBidAED} AED*`,
      `🧥 *1-of-1 Piece:* ${session.brandName} — ${session.itemName} (\`#${session.itemId}\`, Size ${session.size})`,
      `🔒 *Inventory Status:* Soft-Locked for 15 Minutes (\`LOCKED_15MIN\`)`,
      `📩 *Checkout Link & Order Summary sent to ${session.highestBidder.name}'s Private WhatsApp DM!*`
    ].join('\n');

    const winnerOrderCard = formatWhatsAppDirectOrderCard({
      itemId: session.itemId,
      itemName: `${session.brandName} — ${session.itemName} (Auction Winner)`,
      size: session.size,
      finalPriceAED: session.currentHighestBidAED,
      checkoutUrl: `https://vintagevibesgk.com/?checkout=${encodeURIComponent(session.itemId)}`,
      customerLang: 'ROMAN_URDU',
      remainingMinutes: 15
    });

    try {
      const waSession = baileysManager.getConnectedSession();
      if (waSession?.userId) {
        if (session.groupJid.includes('@')) {
          await baileysManager.sendMessage(waSession.userId, session.groupJid, groupDeclaration);
        }
        await baileysManager.sendMessage(
          waSession.userId,
          session.highestBidder.jid,
          `🎉 *Congratulations ${session.highestBidder.name}! You won the live auction for #${session.itemId}!*\n\n${winnerOrderCard}`
        );
      }
    } catch {}

    return {
      closed: true,
      auction: session,
      winnerDeclarationMessage: groupDeclaration,
      winnerDirectOrderCard: winnerOrderCard
    };
  }

  public markAuctionSettled(auctionId: string): LiveAuctionSession | undefined {
    const session = this.activeAuctions.get(auctionId);
    if (!session) return undefined;
    session.state = 'SETTLED';
    this.saveAuctionsToDisk();
    return session;
  }

  public getAuction(auctionId: string): LiveAuctionSession | undefined {
    return this.activeAuctions.get(auctionId);
  }

  public getAllAuctions(): LiveAuctionSession[] {
    return Array.from(this.activeAuctions.values());
  }
}

export const auctionEngineService = new AuctionEngineService();
