import { withDb } from '../../db/pgPool.ts';
import {
  isBoothActuallyStreamingOnServer,
  setBoothPinnedPiece,
  LivePinnedPiece
} from './rtmpRelayServer.ts';
import { whatnotAuctionEngine } from './whatnotAuctionEngine.ts';

export interface AiNightHostStatus {
  boothId: string;
  active: boolean;
  mode: 'STUDIO_SHOWCASE' | 'LIVETALKING_AVATAR';
  liveTalkingConfigured: boolean;
  cycleSec: number;
  piecesShown: number;
  currentSku: string;
  currentPiece: LivePinnedPiece | null;
  currentScriptEn: string;
  currentScriptAr: string;
  startedAt: string | null;
}

interface BoothHostRuntime {
  active: boolean;
  cycleSec: number;
  piecesShown: number;
  queue: any[];
  cursor: number;
  currentPiece: LivePinnedPiece | null;
  currentScriptEn: string;
  currentScriptAr: string;
  startedAt: string | null;
  timer: NodeJS.Timeout | null;
}

const runtimes: Map<string, BoothHostRuntime> = new Map();

function normBooth(boothId: string): string {
  return String(boothId || 'booth-1').trim().toLowerCase() || 'booth-1';
}

function getRuntime(boothId: string): BoothHostRuntime {
  const key = normBooth(boothId);
  let rt = runtimes.get(key);
  if (!rt) {
    rt = {
      active: false,
      cycleSec: 35,
      piecesShown: 0,
      queue: [],
      cursor: 0,
      currentPiece: null,
      currentScriptEn: '',
      currentScriptAr: '',
      startedAt: null,
      timer: null
    };
    runtimes.set(key, rt);
  }
  return rt;
}

function buildShowcaseScripts(piece: LivePinnedPiece) {
  const meas = [
    piece.pitToPitInches ? `Chest ${piece.pitToPitInches}"` : '',
    piece.lengthInches ? `Length ${piece.lengthInches}"` : ''
  ]
    .filter(Boolean)
    .join(' • ');
  const en =
    `Now on Stage: ${piece.title}` +
    (piece.size ? ` (Size ${piece.size})` : '') +
    (meas ? ` — ${meas}` : '') +
    `. Start Price AED ${piece.priceAed}! Tap BID or type MINE ${piece.priceAed} now.`;
  const ar =
    `الآن في البث المباشر: ${piece.title}` +
    (piece.size ? ` • المقاس ${piece.size}` : '') +
    ` — بسعر ${piece.priceAed} درهم فقط! اضغط للمزايدة الآن.`;
  return { en, ar };
}

async function advanceBoothPiece(boothId: string): Promise<void> {
  const key = normBooth(boothId);
  const rt = getRuntime(key);
  if (!rt.active) return;

  // Never hijack an active human broadcast
  if (isBoothActuallyStreamingOnServer(key)) {
    stopAiNightHost(key);
    return;
  }

  if (rt.queue.length === 0 || rt.cursor >= rt.queue.length) {
    try {
      const rows = await withDb(async (client) => {
        const res = await client.query(
          `SELECT id, sku, brand_name, item_name, parent_category_name, sub_category,
                  size_scanned, pit_to_pit_inches, length_inches, retail_price_aed,
                  front_image_url, back_image_url, tag_image_url
             FROM public.inventory_pieces
            WHERE COALESCE(status, 'IN_STOCK') = 'IN_STOCK'
              AND front_image_url IS NOT NULL
              AND front_image_url <> ''
            ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
            LIMIT 80`
        );
        return res.rows || [];
      });
      rt.queue = rows;
      rt.cursor = 0;
    } catch {}
  }

  if (rt.queue.length === 0) return;

  const row = rt.queue[rt.cursor % rt.queue.length];
  rt.cursor += 1;
  rt.piecesShown += 1;

  const brand = String(row.brand_name || 'Vintage').trim();
  const item = String(row.item_name || 'Vintage Garment').trim();
  const title = brand && !item.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${item}` : item;
  const priceAed = Math.max(10, Math.round(Number(row.retail_price_aed || 35)));

  const pinned: LivePinnedPiece = {
    sku: String(row.sku || row.id),
    id: String(row.id || row.sku),
    title,
    brand,
    category: String(row.sub_category || row.parent_category_name || 'Vintage'),
    size: String(row.size_scanned || '').trim(),
    pitToPitInches: String(row.pit_to_pit_inches || '').trim(),
    lengthInches: String(row.length_inches || '').trim(),
    priceAed,
    frontImageUrl: String(row.front_image_url || ''),
    backImageUrl: String(row.back_image_url || ''),
    tagImageUrl: String(row.tag_image_url || ''),
    status: 'IN_STOCK',
    pinnedAt: new Date().toISOString()
  };

  const scripts = buildShowcaseScripts(pinned);
  rt.currentPiece = pinned;
  rt.currentScriptEn = scripts.en;
  rt.currentScriptAr = scripts.ar;

  setBoothPinnedPiece(key, pinned);

  // Start matching Whatnot quick-drop countdown ONLY if no auction is currently active
  const curAuc = whatnotAuctionEngine.getAuction(key);
  if (curAuc.status === 'IDLE' || curAuc.status === 'SOLD') {
    whatnotAuctionEngine.startAuction(key, {
      sku: pinned.sku,
      title: pinned.title,
      brand: pinned.brand,
      category: pinned.category,
      size: pinned.size,
      pitToPitInches: pinned.pitToPitInches,
      lengthInches: pinned.lengthInches,
      imageUrl: pinned.frontImageUrl || '',
      startPriceAed: Math.max(10, Math.round(priceAed * 0.7)),
      minIncrementAed: 5,
      durationSec: Math.min(45, Math.max(15, rt.cycleSec - 2)),
      suddenDeathResetSec: 5
    });
  }

  // Optional external lipku/LiveTalking avatar webhook if configured
  const ltUrl = String(process.env.LIVETALKING_URL || '').trim();
  if (ltUrl) {
    fetch(`${ltUrl.replace(/\/+$/, '')}/human`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: scripts.en, type: 'echo', interrupt: true }),
      signal: AbortSignal.timeout(4000)
    }).catch(() => {});
  }
}

export async function startAiNightHost(boothId: string, opts: { cycleSec?: number } = {}) {
  const key = normBooth(boothId);
  if (isBoothActuallyStreamingOnServer(key)) {
    return {
      ok: false,
      error: 'HUMAN_HOST_ACTIVE: Human host is currently live on this booth.',
      status: getAiNightHostStatus(key)
    };
  }
  const rt = getRuntime(key);
  if (rt.timer) clearInterval(rt.timer);
  rt.cycleSec = Math.min(120, Math.max(15, Math.round(Number(opts.cycleSec || 35))));
  rt.active = true;
  rt.startedAt = new Date().toISOString();
  rt.piecesShown = 0;

  await advanceBoothPiece(key);
  rt.timer = setInterval(() => {
    advanceBoothPiece(key).catch(() => {});
  }, rt.cycleSec * 1000);
  if (typeof (rt.timer as any).unref === 'function') (rt.timer as any).unref();

  return { ok: true, status: getAiNightHostStatus(key) };
}

export function stopAiNightHost(boothId: string) {
  const key = normBooth(boothId);
  const rt = getRuntime(key);
  if (rt.timer) {
    clearInterval(rt.timer);
    rt.timer = null;
  }
  rt.active = false;
  return { ok: true, status: getAiNightHostStatus(key) };
}

export async function nextAiNightHostPiece(boothId: string) {
  const key = normBooth(boothId);
  const rt = getRuntime(key);
  if (!rt.active) {
    return startAiNightHost(key, { cycleSec: rt.cycleSec });
  }
  await advanceBoothPiece(key);
  return { ok: true, status: getAiNightHostStatus(key) };
}

export function getAiNightHostStatus(boothId: string): AiNightHostStatus {
  const key = normBooth(boothId);
  const rt = getRuntime(key);
  const liveTalkingConfigured = Boolean(String(process.env.LIVETALKING_URL || '').trim());
  return {
    boothId: key,
    active: rt.active,
    mode: liveTalkingConfigured ? 'LIVETALKING_AVATAR' : 'STUDIO_SHOWCASE',
    liveTalkingConfigured,
    cycleSec: rt.cycleSec,
    piecesShown: rt.piecesShown,
    currentSku: rt.currentPiece?.sku || '',
    currentPiece: rt.currentPiece,
    currentScriptEn: rt.currentScriptEn,
    currentScriptAr: rt.currentScriptAr,
    startedAt: rt.startedAt
  };
}
