import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  getFfmpegPath,
  getBoothPinnedPiece,
  setBoothPinnedPiece,
  getBoothLiveCardPrefs,
  isBoothActuallyStreamingOnServer,
  type LivePinnedPiece
} from './rtmpRelayServer.ts';
import { matchLiveCameraFrame } from './liveVisualGarmentMatcher.ts';
import { streamController } from '../../server/streamController.ts';

const execFileAsync = promisify(execFile);

interface BoothAutoScanState {
  lastProcessedSeg: string;
  inFlight: boolean;
  lastCandidateSku: string;
  consecutiveHits: number;
  lastPinnedSku: string;
  lastPinnedAt: number;
  lastVisionOcrAt: number;
  lastDetectedBy?: 'TAG_OCR' | 'GARMENT_MATCH';
}

const scanStates = new Map<string, BoothAutoScanState>();
let scannerTimer: ReturnType<typeof setInterval> | null = null;
let skuResolverFn: ((sku: string) => Promise<LivePinnedPiece | null>) | null = null;

export function registerAutoScannerSkuResolver(fn: (sku: string) => Promise<LivePinnedPiece | null>) {
  skuResolverFn = fn;
}

const SKU_CODE_REGEX = /\b((?:VV|VIN|BAL|DXB)[-\s_]?\d{2,4}[-\s_]?\d{3,6})\b/i;
const PARTIAL_SKU_REGEX = /\b(26\d{2}[-\s_]\d{4})\b/;

function normalizeDetectedSkuCode(raw: string): string {
  const cleaned = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[\s_]+/g, '-');
  if (/^26\d{2}-\d{4}$/.test(cleaned)) {
    return `VV-${cleaned}`;
  }
  return cleaned;
}

function parseSkuFromModelText(txt: string): string | null {
  const clean = String(txt || '').trim();
  if (!clean || /^NONE$/i.test(clean)) return null;
  const full = clean.match(SKU_CODE_REGEX);
  if (full?.[1]) return normalizeDetectedSkuCode(full[1]);
  const partial = clean.match(PARTIAL_SKU_REGEX);
  if (partial?.[1]) return normalizeDetectedSkuCode(partial[1]);
  return null;
}

async function detectVisibleSkuTagViaGemini(jpgBase64: string): Promise<string | null> {
  const apiKey = String(process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '').trim();
  if (!apiKey) return null;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: 'Read ONLY any printed SKU / barcode label text like VV-2601-0980 (or 2601-0980) held up or visible in this live camera frame, even if close-up or slightly blurry. Reply ONLY with the exact code (e.g. VV-2601-0980), or NONE if no SKU label is visible.'
                },
                { inlineData: { mimeType: 'image/jpeg', data: jpgBase64 } }
              ]
            }
          ],
          generationConfig: { temperature: 0, maxOutputTokens: 24 }
        }),
        signal: AbortSignal.timeout(3200)
      }
    );
    if (!res.ok) return null;
    const data: any = await res.json();
    const txt = String(data?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
    return parseSkuFromModelText(txt);
  } catch {
    return null;
  }
}

async function detectVisibleSkuTagViaOllama(jpgBase64: string): Promise<string | null> {
  try {
    const res = await fetch('http://127.0.0.1:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.VV_TAG_OCR_MODEL || 'qwen2.5vl:7b',
        prompt:
          'Read ONLY any printed SKU barcode code like VV-2601-0826 (or 2601-0826) visible on a sticker, tag, or label held near the camera. Even if the barcode lines are blurry close-up, read the printed characters. Reply ONLY with the code (e.g. VV-2601-0826), or NONE.',
        images: [jpgBase64],
        stream: false,
        keep_alive: '24h',
        options: { temperature: 0, num_predict: 28 }
      }),
      signal: AbortSignal.timeout(6500)
    });
    if (res.ok) {
      const data: any = await res.json();
      const parsed = parseSkuFromModelText(String(data?.response || ''));
      if (parsed) return parsed;
    }
  } catch {
    // Fallback to Gemini Flash Vision if Ollama is cold or busy
  }
  return detectVisibleSkuTagViaGemini(jpgBase64);
}

export async function scanBoothLiveFrameOnce(boothId: string): Promise<void> {
  const bKey = String(boothId || 'booth-1').trim().toLowerCase().replace(/^booth[-_]?0*(\d+)$/, 'booth-$1');
  const prefs = getBoothLiveCardPrefs(bKey);
  if (!prefs.autoScanEnabled) return;
  if (!isBoothActuallyStreamingOnServer(bKey, false)) return;

  const memBooth = streamController.getBooth(bKey);
  if (memBooth?.openLiveMode) return;

  let st = scanStates.get(bKey);
  if (!st) {
    st = {
      lastProcessedSeg: '',
      inFlight: false,
      lastCandidateSku: '',
      consecutiveHits: 0,
      lastPinnedSku: '',
      lastPinnedAt: 0,
      lastVisionOcrAt: 0
    };
    scanStates.set(bKey, st);
  }
  if (st.inFlight) return;

  const hlsDir = path.join(process.cwd(), 'public', 'live_hls', bKey);
  if (!fs.existsSync(hlsDir)) return;

  let files: string[] = [];
  try {
    files = fs
      .readdirSync(hlsDir)
      .filter((f) => f.endsWith('.m2ts') || f.endsWith('.ts'))
      .sort();
  } catch {
    return;
  }
  if (files.length === 0) return;

  const newestName = files[files.length - 1];
  if (newestName === st.lastProcessedSeg) return;

  const newestPath = path.join(hlsDir, newestName);
  let mtimeMs = 0;
  try {
    mtimeMs = fs.statSync(newestPath).mtimeMs;
  } catch {
    return;
  }
  // Only scan fresh live broadcast segments (< 12s old)
  if (Date.now() - mtimeMs > 12000) return;

  st.inFlight = true;
  st.lastProcessedSeg = newestName;
  const tmpJpg = path.join(os.tmpdir(), `vv_autoscan_${bKey}_${process.pid}.jpg`);

  try {
    await execFileAsync(
      getFfmpegPath(),
      ['-y', '-sseof', '-0.4', '-i', newestPath, '-frames:v', '1', '-vf', 'scale=960:-2', '-q:v', '3', tmpJpg],
      { timeout: 3500, windowsHide: true }
    );
    if (!fs.existsSync(tmpJpg)) return;
    const jpgBuf = fs.readFileSync(tmpJpg);
    if (jpgBuf.length < 1500) return;
    const b64 = jpgBuf.toString('base64');

    const curPinned = getBoothPinnedPiece(bKey);
    const curSkuUpper = String(curPinned?.sku || '').trim().toUpperCase();

    // STAGE 1: Instant Printed SKU Tag / Barcode Label OCR (1-frame immediate lock!)
    const now = Date.now();
    if (now - st.lastVisionOcrAt >= 2800 && skuResolverFn) {
      st.lastVisionOcrAt = now;
      const ocrSku = await detectVisibleSkuTagViaOllama(b64);
      if (ocrSku && ocrSku.toUpperCase() !== curSkuUpper) {
        const resolved = await skuResolverFn(ocrSku);
        if (resolved && !resolved.isReserved) {
          st.lastPinnedSku = resolved.sku.toUpperCase();
          st.lastPinnedAt = Date.now();
          st.lastDetectedBy = 'TAG_OCR';
          st.lastCandidateSku = '';
          st.consecutiveHits = 0;
          memBooth.activeOnAirSku = resolved.sku;
          setBoothPinnedPiece(bKey, resolved);
          console.log(`[LiveAutoScanner] 🏷️ Instant SKU Tag Picked on ${bKey}: ${resolved.sku} (${resolved.title})`);
          return;
        }
      }
    }

    // STAGE 2: CPU Visual Garment Matcher against 860+ studio pieces (2 consecutive frame lock to prevent flicker)
    if (skuResolverFn && Date.now() - st.lastPinnedAt >= 5000) {
      const vm = await matchLiveCameraFrame(b64, 2, true).catch(() => null);
      const top = vm?.matches?.[0];
      const second = vm?.matches?.[1];
      if (top && top.sku && top.confidencePct >= 89) {
        const margin = second ? top.confidencePct - second.confidencePct : 15;
        const candUpper = top.sku.trim().toUpperCase();
        if (candUpper === curSkuUpper) {
          st.lastCandidateSku = candUpper;
          st.consecutiveHits = 0;
          return;
        }
        if (top.confidencePct >= 93 && margin >= 8) {
          st.consecutiveHits = 2;
          st.lastCandidateSku = candUpper;
        } else if (margin >= 6 && st.lastCandidateSku === candUpper) {
          st.consecutiveHits += 1;
        } else {
          st.lastCandidateSku = candUpper;
          st.consecutiveHits = 1;
        }

        if (st.consecutiveHits >= 2) {
          const resolved = await skuResolverFn(top.sku);
          if (resolved && !resolved.isReserved) {
            st.lastPinnedSku = candUpper;
            st.lastPinnedAt = Date.now();
            st.lastDetectedBy = 'GARMENT_MATCH';
            st.consecutiveHits = 0;
            memBooth.activeOnAirSku = resolved.sku;
            setBoothPinnedPiece(bKey, resolved);
            console.log(
              `[LiveAutoScanner] 👕 Auto Garment Matched on ${bKey}: ${resolved.sku} (${top.confidencePct}% confidence)`
            );
          }
        }
      } else {
        st.consecutiveHits = 0;
        st.lastCandidateSku = '';
      }
    }
  } catch {
  } finally {
    st.inFlight = false;
    try {
      if (fs.existsSync(tmpJpg)) fs.unlinkSync(tmpJpg);
    } catch {}
  }
}

export function getAutoScannerStatus(boothId: string) {
  const bKey = String(boothId || 'booth-1').trim().toLowerCase().replace(/^booth[-_]?0*(\d+)$/, 'booth-$1');
  const st = scanStates.get(bKey);
  const prefs = getBoothLiveCardPrefs(bKey);
  return {
    boothId: bKey,
    autoScanEnabled: prefs.autoScanEnabled,
    showPieceCardOnLive: prefs.showPieceCardOnLive,
    lastPinnedSku: st?.lastPinnedSku || null,
    lastPinnedAt: st?.lastPinnedAt || null,
    lastDetectedBy: st?.lastDetectedBy || null
  };
}

export function startLiveAutoPieceScanner(): void {
  if (scannerTimer) return;
  // Warm up GPU vision model in background so first close-up tag scan completes in <400ms
  fetch('http://127.0.0.1:11434/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.VV_TAG_OCR_MODEL || 'qwen2.5vl:7b',
      prompt: 'Reply OK',
      stream: false,
      keep_alive: '24h',
      options: { num_predict: 3 }
    }),
    signal: AbortSignal.timeout(20000)
  }).catch(() => {});

  scannerTimer = setInterval(() => {
    for (const bKey of ['booth-1', 'booth-2']) {
      scanBoothLiveFrameOnce(bKey).catch(() => {});
    }
  }, 2200);
  scannerTimer.unref?.();
}
