import { streamController } from '../../server/streamController.ts';
import { eventHub } from '../../server/events.ts';

export interface ParsedLiveClaimDetails {
  extractedSku?: string;
  priceAed?: number;
  itemTitle?: string;
  hasExplicitItemWord: boolean;
}

let openSkuSequence = 0;
const needPricePromptCooldown = new Map<string, number>();

function getUaeMmDd(): string {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Dubai',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(new Date());
    const mm = parts.find(p => p.type === 'month')?.value || '01';
    const dd = parts.find(p => p.type === 'day')?.value || '01';
    return `${mm}${dd}`;
  } catch {
    const d = new Date();
    return `${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  }
}

export function generateOpenLiveSku(): string {
  openSkuSequence = (openSkuSequence % 9999) + 1;
  return `LIVE-OPEN-${getUaeMmDd()}-${String(openSkuSequence).padStart(4, '0')}`;
}

export function parseLiveClaimDetails(
  commentText: string,
  existingExtractedSku?: string
): ParsedLiveClaimDetails {
  const clean = String(commentText || '').trim();
  const extractedSku =
    (existingExtractedSku && String(existingExtractedSku).trim()) ||
    streamController.extractValidSkuFromComment(clean) ||
    undefined;

  const { priceAed, itemTitle } = streamController.parseOpenLiveFields(clean, extractedSku);
  const hasExplicitItemWord = Boolean(itemTitle && itemTitle.length >= 2);

  return {
    ...(extractedSku ? { extractedSku } : {}),
    ...(priceAed !== undefined ? { priceAed } : {}),
    ...(itemTitle ? { itemTitle } : {}),
    hasExplicitItemWord
  };
}

export function shouldHandleAsOpenLiveClaim(params: {
  boothSession?: any;
  parsed: ParsedLiveClaimDetails;
  pinnedTitle?: string;
}): boolean {
  const { boothSession, parsed, pinnedTitle } = params;
  // 1. Explicit SKU barcode always routes to 1-of-1 barcode inventory lock
  if (parsed.extractedSku) return false;
  // 2. Host switched booth to Open Live (no-barcode) mode or no item is pinned on air
  if (boothSession?.openLiveMode === true) return true;
  if (!boothSession?.activeOnAirSku) return true;
  // 3. Buyer explicitly typed a price ("Mine 35 cap", "Mine 50") — never hijack unrelated pinned catalog item
  if (parsed.priceAed !== undefined) return true;
  // 4. Buyer named a specific garment word ("Mine cap") — if it doesn't match the pinned title, treat as open live
  if (parsed.hasExplicitItemWord && parsed.itemTitle) {
    const pinnedWords = String(pinnedTitle || '').toLowerCase();
    if (!pinnedWords) return true;
    const itemWords = parsed.itemTitle
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length >= 3);
    if (itemWords.length > 0 && !itemWords.some(w => pinnedWords.includes(w))) {
      return true;
    }
  }
  return false;
}

export function resolveOpenClaimPriceAndTitle(
  parsed: ParsedLiveClaimDetails,
  boothSession?: any
): { priceAed?: number; itemTitle: string } {
  const quickPrice = Number(boothSession?.openLivePriceAed || 0);
  const priceAed =
    parsed.priceAed !== undefined
      ? parsed.priceAed
      : quickPrice > 0
      ? quickPrice
      : undefined;
  const itemTitle =
    parsed.itemTitle ||
    (boothSession?.openLiveItemTitle ? String(boothSession.openLiveItemTitle).trim() : '') ||
    'Live Thrift Piece';
  return { priceAed, itemTitle };
}

export function canSendNeedPricePrompt(boothId: string, username: string): boolean {
  const key = `${boothId}:${String(username || '').trim().toLowerCase()}`;
  const now = Date.now();
  const prev = needPricePromptCooldown.get(key) || 0;
  if (now - prev < 20000) return false;
  needPricePromptCooldown.set(key, now);
  if (needPricePromptCooldown.size > 500) {
    const oldest = needPricePromptCooldown.keys().next().value;
    if (oldest) needPricePromptCooldown.delete(oldest);
  }
  return true;
}

export function buildNeedPriceReply(username: string): string {
  const cleanUser = String(username || 'Friend').trim();
  return `👋 ${cleanUser} please comment "Mine + Price + Item" (e.g. Mine 35 cap) to confirm your claim! 😊`;
}

export async function executeOpenLiveClaim(params: {
  boothId: string;
  username: string;
  platform: 'facebook' | 'instagram' | 'youtube' | 'tiktok' | 'threads' | 'custom' | string;
  rawComment: string;
  commentId: string;
  priceAed: number;
  itemTitle: string;
  buyerPhone?: string;
}): Promise<{
  success: boolean;
  sku: string;
  itemTitle: string;
  priceAed: number;
  invoiceNo: string;
  hostReplyText: string;
  merged: boolean;
  itemCount: number;
  subtotal: number;
}> {
  const boothId = params.boothId || 'booth-1';
  const username = String(params.username || 'Viewer').trim();
  const openSku = generateOpenLiveSku();
  const initialInvoiceNo = `SLS-DRAFT-LIVE-${Date.now().toString().slice(-4)}`;
  const rawPlat = String(params.platform || 'custom').toLowerCase();
  const mappedPlatform: 'tiktok' | 'instagram' | 'facebook' | 'youtube' | 'custom' =
    rawPlat === 'tiktok' || rawPlat === 'instagram' || rawPlat === 'facebook' || rawPlat === 'youtube'
      ? rawPlat
      : 'custom';
  const marketingPlatform: 'tiktok' | 'instagram' | 'facebook' | 'youtube' | 'whatsapp' =
    rawPlat === 'tiktok' || rawPlat === 'instagram' || rawPlat === 'facebook' || rawPlat === 'youtube'
      ? rawPlat
      : 'youtube';

  const checkoutUrl = `https://vintagevibesgk.com/?checkout=${encodeURIComponent(openSku)}`;
  const waLink = `https://wa.me/971554186086?text=${encodeURIComponent(
    `CLAIM ${openSku} (${params.itemTitle} - AED ${params.priceAed}) by ${username}`
  )}`;

  const pseudoPiece = {
    barcode: openSku,
    sku: openSku,
    brandName: 'Live Thrift',
    itemName: params.itemTitle,
    sizeScanned: '',
    labelGrade: 'Pre-Loved Thrift',
    retailPriceAed: params.priceAed,
    estimatedPrice: params.priceAed,
    lockedPrice: params.priceAed,
    frontImageUrl: ''
  };

  const commentWithPhone =
    params.buyerPhone && !String(params.rawComment || '').includes(params.buyerPhone)
      ? `${params.rawComment} (${params.buyerPhone})`
      : params.rawComment;

  const provisionalReply =
    `🎉 Congratulations ${username}! Claim Confirmed: ${params.itemTitle} • Price: AED ${params.priceAed} • Draft Invoice: #${initialInvoiceNo}`;

  const claimRecord = {
    id: `claim-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    timestamp: new Date().toLocaleTimeString(),
    customerHandle: username,
    platform: marketingPlatform,
    rawComment: commentWithPhone,
    matchedKeyword: 'MINE/CLAIM',
    sku: openSku,
    itemName: params.itemTitle,
    itemImage: '',
    priceAed: params.priceAed,
    invoiceNo: initialInvoiceNo,
    status: 'LOCK_ACTIVE' as const,
    replyDispatched: provisionalReply,
    checkoutUrl,
    lockExpiresAt: Date.now() + 60 * 60 * 1000,
    boothId,
    createdAtMs: Date.now()
  };

  // Dynamic import breaks any circular module load graph between social/chat/marketing
  let finalInvNo = initialInvoiceNo;
  let merged = false;
  let itemCount = 1;
  let subtotal = params.priceAed;
  try {
    const { marketingService } = await import('../marketing/marketing.service.ts');
    const persistRes = await marketingService.recordLiveStreamClaimAndNotifyWhatsApp(claimRecord, pseudoPiece);
    if (persistRes?.invoiceNo) {
      finalInvNo = persistRes.invoiceNo;
      merged = Boolean(persistRes.merged);
      itemCount = Number(persistRes.itemCount || 1);
      subtotal = Number(persistRes.subtotal || params.priceAed);
    }
  } catch (err: any) {
    console.warn('[OpenLiveClaim] marketingService sync notice:', err?.message || err);
  }

  const isTikTok = rawPlat === 'tiktok';
  const bagSuffix = merged && itemCount > 1 ? ` • 🛍️ Bag Total: ${itemCount} items (AED ${subtotal})` : '';
  const hostReplyText = isTikTok
    ? `🎉 Congratulations ${username}! Claim Confirmed: ${params.itemTitle} • Price: AED ${params.priceAed} • Draft Invoice: #${finalInvNo}${bagSuffix} • 📲 Send Screenshot & Address via WhatsApp (+971 55 418 6086) or Profile Bio Link!`
    : `🎉 Congratulations ${username}! Claim Confirmed: ${params.itemTitle} • Price: AED ${params.priceAed} • Draft Invoice: #${finalInvNo}${bagSuffix} • 📲 Confirm Delivery on WhatsApp: ${waLink}`;

  claimRecord.replyDispatched = hostReplyText;

  streamController.recordClaim(boothId, openSku, params.priceAed);
  streamController.markBuyerClaimCommentLocked(boothId, username, openSku, params.commentId);
  streamController.addComment(boothId, hostReplyText, mappedPlatform, '📢 Vintage Vibes Host');

  eventHub.broadcast({
    type: 'ENTITY_MUTATED',
    module: 'SALES',
    entity: 'LIVE_CLAIM',
    action: 'CREATE',
    documentRef: openSku,
    data: {
      claimRecord,
      piece: pseudoPiece,
      invoiceNo: finalInvNo,
      priceAed: params.priceAed,
      itemTitle: params.itemTitle,
      checkoutUrl,
      boothId,
      buyerHandle: username,
      platform: rawPlat,
      isOpenLiveClaim: true,
      merged,
      itemCount,
      subtotal,
      source: `${rawPlat.toUpperCase()}_OPEN_LIVE_CHAT`
    }
  });

  return {
    success: true,
    sku: openSku,
    itemTitle: params.itemTitle,
    priceAed: params.priceAed,
    invoiceNo: finalInvNo,
    hostReplyText,
    merged,
    itemCount,
    subtotal
  };
}
