import fs from 'fs';
import path from 'path';
import { spawn, execFile, ChildProcess } from 'child_process';
import { promisify } from 'util';
import { withDb } from '../../db/pgPool.ts';
import {
  isBoothActuallyStreamingOnServer,
  setBoothPinnedPiece,
  LivePinnedPiece
} from './rtmpRelayServer.ts';
import { whatnotAuctionEngine } from './whatnotAuctionEngine.ts';

const execFileAsync = promisify(execFile);

const LT_BASE_DIR = path.join(process.cwd(), 'livetalking');
const LT_REPO_DIR = path.join(LT_BASE_DIR, 'repo');
const LT_PYTHON_EXE = path.join(LT_BASE_DIR, 'venv', 'Scripts', 'python.exe');
const LT_PREPARE_SCRIPT = path.join(LT_BASE_DIR, 'prepare_single_photo_avatar.py');
const CUSTOM_HOST_IMG = path.join(process.cwd(), 'public', 'assets', 'models', 'custom_ai_host.png');
const DEFAULT_HOST_IMG = path.join(process.cwd(), 'public', 'assets', 'models', 'vintage_vibes_master_host.png');

export interface AiNightHostStatus {
  boothId: string;
  active: boolean;
  mode: 'STUDIO_SHOWCASE' | 'LIVETALKING_AVATAR';
  liveTalkingConfigured: boolean;
  liveTalkingInstalled: boolean;
  liveTalkingRunning: boolean;
  avatarUrl: string;
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
let liveTalkingProc: ChildProcess | null = null;
let liveTalkingStarting: Promise<boolean> | null = null;

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

function getEffectiveLiveTalkingUrl(): string {
  const envUrl = String(process.env.LIVETALKING_URL || '').trim();
  if (envUrl) return envUrl.replace(/\/+$/, '');
  if (isLiveTalkingInstalled()) return 'http://127.0.0.1:8010';
  return '';
}

function isLiveTalkingInstalled(): boolean {
  return (
    fs.existsSync(LT_PYTHON_EXE) &&
    fs.existsSync(path.join(LT_REPO_DIR, 'app.py')) &&
    fs.existsSync(path.join(LT_REPO_DIR, 'models', 'wav2lip.pth'))
  );
}

function getActiveHostAvatarUrl(): string {
  if (fs.existsSync(CUSTOM_HOST_IMG)) return '/assets/models/custom_ai_host.png';
  if (fs.existsSync(DEFAULT_HOST_IMG)) return '/assets/models/vintage_vibes_master_host.png';
  return '/app-icon.png';
}

async function ensureAvatarPrepared(): Promise<void> {
  const coordsFile = path.join(LT_REPO_DIR, 'data', 'avatars', 'vv_host', 'coords.pkl');
  if (fs.existsSync(coordsFile)) return;
  if (!fs.existsSync(LT_PREPARE_SCRIPT) || !fs.existsSync(LT_PYTHON_EXE)) return;
  const srcImg = fs.existsSync(CUSTOM_HOST_IMG) ? CUSTOM_HOST_IMG : DEFAULT_HOST_IMG;
  if (!fs.existsSync(srcImg)) return;
  await execFileAsync(LT_PYTHON_EXE, [LT_PREPARE_SCRIPT, srcImg, 'vv_host'], {
    cwd: LT_REPO_DIR,
    timeout: 45000
  });
}

async function isHttpListening(urlStr: string): Promise<boolean> {
  try {
    const r = await fetch(urlStr, { signal: AbortSignal.timeout(1200) });
    return r.status < 500;
  } catch {
    return false;
  }
}

async function ensureLiveTalkingStarted(boothKey: string): Promise<boolean> {
  if (!isLiveTalkingInstalled()) return false;
  const baseUrl = getEffectiveLiveTalkingUrl() || 'http://127.0.0.1:8010';
  if (await isHttpListening(baseUrl)) return true;
  if (liveTalkingStarting) return liveTalkingStarting;

  liveTalkingStarting = (async () => {
    try {
      await ensureAvatarPrepared().catch(() => {});
      const logPath = path.join(LT_BASE_DIR, 'livetalking_runtime.log');
      const outFd = fs.openSync(logPath, 'a');

      const args = [
        'app.py',
        '--model', 'wav2lip',
        '--avatar_id', 'vv_host',
        '--transport', 'rtcpush',
        '--push_url', `http://127.0.0.1:8889/${encodeURIComponent(boothKey)}/whip`,
        '--tts', 'edgetts',
        '--REF_FILE', 'en-US-AndrewMultilingualNeural',
        '--max_session', '1',
        '--batch_size', '8',
        '--listenport', '8010'
      ];

      const ffmpegStaticDir = path.join(process.cwd(), 'node_modules', 'ffmpeg-static');
      const spawnEnv = {
        ...process.env,
        PATH: fs.existsSync(ffmpegStaticDir)
          ? `${ffmpegStaticDir}${path.delimiter}${process.env.PATH || ''}`
          : process.env.PATH,
        PYTHONUNBUFFERED: '1',
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1'
      };

      const proc = spawn(LT_PYTHON_EXE, args, {
        cwd: LT_REPO_DIR,
        env: spawnEnv,
        stdio: ['ignore', outFd, outFd],
        windowsHide: true
      });
      liveTalkingProc = proc;
      proc.on('exit', () => {
        if (liveTalkingProc === proc) liveTalkingProc = null;
        try { fs.closeSync(outFd); } catch {}
      });
      proc.on('error', () => {
        if (liveTalkingProc === proc) liveTalkingProc = null;
        try { fs.closeSync(outFd); } catch {}
      });

      // Wait up to 24s for wav2lip weights + WHIP publisher startup
      for (let i = 0; i < 24; i++) {
        if (!liveTalkingProc || liveTalkingProc !== proc) return false;
        if (await isHttpListening(baseUrl)) return true;
        await new Promise((r) => setTimeout(r, 1000));
      }
      return await isHttpListening(baseUrl);
    } catch {
      return false;
    } finally {
      liveTalkingStarting = null;
    }
  })();

  return liveTalkingStarting;
}

function stopLiveTalkingProcess() {
  if (liveTalkingProc) {
    try {
      liveTalkingProc.kill('SIGTERM');
    } catch {}
    liveTalkingProc = null;
  }
}

export async function updateAiHostSinglePhoto(imageBase64: string): Promise<{ ok: boolean; avatarUrl?: string; error?: string }> {
  try {
    const cleanB64 = String(imageBase64 || '').replace(/^data:image\/[^;]+;base64,/i, '').trim();
    if (!cleanB64) return { ok: false, error: 'imageBase64 is required' };
    const buf = Buffer.from(cleanB64, 'base64');
    if (buf.length < 400 || buf.length > 10 * 1024 * 1024) {
      return { ok: false, error: 'Photo size must be between 1 KB and 10 MB' };
    }

    const dir = path.dirname(CUSTOM_HOST_IMG);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CUSTOM_HOST_IMG, buf);

    if (fs.existsSync(LT_PREPARE_SCRIPT) && fs.existsSync(LT_PYTHON_EXE)) {
      await execFileAsync(LT_PYTHON_EXE, [LT_PREPARE_SCRIPT, CUSTOM_HOST_IMG, 'vv_host'], {
        cwd: LT_REPO_DIR,
        timeout: 45000
      });
    }

    // If any booth is currently running AI Host with LiveTalking, restart LiveTalking so new face takes effect
    const activeEntry = Array.from(runtimes.entries()).find(([, rt]) => rt.active);
    if (activeEntry && liveTalkingProc) {
      stopLiveTalkingProcess();
      await new Promise((r) => setTimeout(r, 800));
      await ensureLiveTalkingStarted(activeEntry[0]);
    }

    return { ok: true, avatarUrl: '/assets/models/custom_ai_host.png?t=' + Date.now() };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to bake host photo avatar' };
  }
}

function buildShowcaseScripts(piece: LivePinnedPiece) {
  const meas = [
    piece.pitToPitInches ? `Chest ${piece.pitToPitInches}"` : '',
    piece.lengthInches ? `Length ${piece.lengthInches}"` : ''
  ]
    .filter(Boolean)
    .join(' • ');
  const en =
    `Welcome to Vintage Vibes Live! Up next: ${piece.title}` +
    (piece.size ? `, Size ${piece.size}` : '') +
    (meas ? `, ${meas}` : '') +
    `. Bidding starts at ${piece.priceAed} Dirhams! Tap Bid or comment Mine ${piece.priceAed} right now!`;
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

  const ltUrl = getEffectiveLiveTalkingUrl();
  if (ltUrl) {
    fetch(`${ltUrl}/human`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionid: '0', text: scripts.en, type: 'echo', interrupt: true }),
      signal: AbortSignal.timeout(5000)
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

  if (isLiveTalkingInstalled()) {
    await ensureLiveTalkingStarted(key).catch(() => false);
  }

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
  const anyOtherActive = Array.from(runtimes.values()).some((r) => r.active);
  if (!anyOtherActive) {
    stopLiveTalkingProcess();
  }
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
  const liveTalkingInstalled = isLiveTalkingInstalled();
  const liveTalkingConfigured = Boolean(getEffectiveLiveTalkingUrl());
  return {
    boothId: key,
    active: rt.active,
    mode: liveTalkingConfigured ? 'LIVETALKING_AVATAR' : 'STUDIO_SHOWCASE',
    liveTalkingConfigured,
    liveTalkingInstalled,
    liveTalkingRunning: Boolean(liveTalkingProc),
    avatarUrl: getActiveHostAvatarUrl(),
    cycleSec: rt.cycleSec,
    piecesShown: rt.piecesShown,
    currentSku: rt.currentPiece?.sku || '',
    currentPiece: rt.currentPiece,
    currentScriptEn: rt.currentScriptEn,
    currentScriptAr: rt.currentScriptAr,
    startedAt: rt.startedAt
  };
}
