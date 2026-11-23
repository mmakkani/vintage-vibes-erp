import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile, spawn, type ChildProcess } from 'child_process';
import { promisify } from 'util';
import ffmpegStatic from 'ffmpeg-static';
import { GoogleGenAI } from '@google/genai';
import { streamController } from '../../server/streamController.ts';
import { eventHub } from '../../server/events.ts';

function resolveFfmpegBinary(): string {
  if (typeof ffmpegStatic === 'string' && fs.existsSync(ffmpegStatic)) return ffmpegStatic;
  return 'ffmpeg';
}

const execFileAsync = promisify(execFile);

const STT_PORT = Number(process.env.VV_VOICE_STT_PORT || 3099);
const STT_BASE = `http://127.0.0.1:${STT_PORT}`;
const VOICE_PRICE_TTL_MS = 3 * 60 * 1000; // 3 minutes freshness window

interface BoothVoiceTrackerState {
  lastProcessedSeg: string;
  lastCheckedAt: number;
  lastTranscript: string;
  lastPriceAed?: number;
  lastItemTitle?: string;
  lastDetectedAt?: number;
  inFlight: boolean;
}

const boothStates = new Map<string, BoothVoiceTrackerState>();
let workerProc: ChildProcess | null = null;
let lastWorkerSpawnAttempt = 0;
let loopTimer: ReturnType<typeof setInterval> | null = null;

function resolveVenvPython(): string | null {
  const winCandidate = path.resolve(process.cwd(), '.venv', 'Scripts', 'python.exe');
  if (fs.existsSync(winCandidate)) return winCandidate;
  const nixCandidate = path.resolve(process.cwd(), '.venv', 'bin', 'python');
  if (fs.existsSync(nixCandidate)) return nixCandidate;
  return null;
}

async function isLocalSttHealthy(): Promise<boolean> {
  try {
    const r = await fetch(`${STT_BASE}/health`, { signal: AbortSignal.timeout(1200) });
    return r.ok;
  } catch {
    return false;
  }
}

async function ensureLocalSttWorker(): Promise<boolean> {
  if (await isLocalSttHealthy()) return true;
  if (Date.now() - lastWorkerSpawnAttempt < 20000) return false;
  lastWorkerSpawnAttempt = Date.now();

  const pyExe = resolveVenvPython();
  const workerScript = path.resolve(process.cwd(), 'scripts', 'live_voice_stt_worker.py');
  if (!pyExe || !fs.existsSync(workerScript)) return false;

  try {
    workerProc = spawn(pyExe, [workerScript], {
      cwd: process.cwd(),
      stdio: 'ignore',
      detached: false,
      windowsHide: true,
      env: { ...process.env, VV_VOICE_STT_PORT: String(STT_PORT) }
    });
    workerProc.unref?.();
    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 1000));
      if (await isLocalSttHealthy()) return true;
    }
  } catch (err: any) {
    console.warn('[VoicePriceTracker] Worker spawn notice:', err?.message);
  }
  return false;
}

const SPOKEN_NUMBER_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\b(?:trenta\s*y\s*singko|trentay\s*singko|thirty[\s-]*five|paintis)\b/gi, ' 35 dirhams '],
  [/\b(?:kwarenta\s*y\s*singko|kwarentay\s*singko|kuwarentay\s*singko|forty[\s-]*five)\b/gi, ' 45 dirhams '],
  [/\b(?:bente\s*singko|twenty[\s-]*five|pachees)\b/gi, ' 25 dirhams '],
  [/\b(?:singkwenta\s*y\s*singko|fifty[\s-]*five)\b/gi, ' 55 dirhams '],
  [/\b(?:trenta|thirty|tees)\b/gi, ' 30 '],
  [/\b(?:kwarenta|kuwarenta|forty|chalis)\b/gi, ' 40 '],
  [/\b(?:singkwenta|fifty|pachas)\b/gi, ' 50 '],
  [/\b(?:sisenta|sesenta|sixty|saath)\b/gi, ' 60 '],
  [/\b(?:sitenta|setenta|seventy|sattar)\b/gi, ' 70 '],
  [/\b(?:otsenta|ochenta|eighty|assi)\b/gi, ' 80 '],
  [/\b(?:nobenta|ninety)\b/gi, ' 90 '],
  [/\b(?:isang\s*daan|one\s*hundred|sau)\b/gi, ' 100 '],
  [/\b(?:bente|twenty)\b/gi, ' 20 ']
];

const BRAND_AND_ITEM_PATTERNS: Array<[RegExp, string]> = [
  [/\bcarhartt\b/i, 'Carhartt'],
  [/\blacoste\b/i, 'Lacoste'],
  [/\b(?:ralph\s*lauren|\brl\b)\b/i, 'Ralph Lauren'],
  [/\blevi'?s\b/i, "Levi's"],
  [/\bhugo\s*boss\b/i, 'Hugo Boss'],
  [/\btommy(?:\s*hilfiger)?\b/i, 'Tommy Hilfiger'],
  [/\bnike\b/i, 'Nike'],
  [/\badidas\b/i, 'Adidas'],
  [/\bdickies\b/i, 'Dickies'],
  [/\bstussy\b/i, 'Stussy'],
  [/\bpolo(?:\s*shirt)?\b/i, 'Polo Shirt'],
  [/\blong\s*sleeve\b/i, 'Longsleeve'],
  [/\bjacket\b/i, 'Jacket'],
  [/\bhoodie\b/i, 'Hoodie'],
  [/\bsweatshirt\b/i, 'Sweatshirt'],
  [/\bcap\b/i, 'Cap'],
  [/\bjeans\b/i, 'Jeans'],
  [/\bpants\b/i, 'Pants'],
  [/\bt[\s-]?shirt\b/i, 'T-Shirt']
];

export function extractSpokenPriceDeterministic(rawTranscript: string): {
  priceAed?: number;
  itemTitle?: string;
  confidence: 'HIGH' | 'MEDIUM' | 'NONE';
} {
  let text = String(rawTranscript || '').trim();
  if (!text) return { confidence: 'NONE' };

  const titleParts: string[] = [];
  for (const [re, label] of BRAND_AND_ITEM_PATTERNS) {
    if (re.test(text) && !titleParts.includes(label)) {
      titleParts.push(label);
    }
  }
  const itemTitle = titleParts.slice(0, 3).join(' ') || undefined;

  for (const [re, rep] of SPOKEN_NUMBER_REPLACEMENTS) {
    text = text.replace(re, rep);
  }

  // Strip clothing size / measurement expressions so "size 30", "waist 32", "22 by 28", "haba 27" are NEVER treated as prices
  const scrubbed = text
    .replace(/\b\d{1,2}\s*(?:by|x)\s*\d{1,2}\b/gi, ' ')
    .replace(
      /\b(?:size|sz|waist|width|length|haba|lapad|chest|shoulder|bewang|inch|inches)\s*(?:is|na|ng|:)?\s*\d{1,3}\b/gi,
      ' '
    )
    .replace(/\b\d{1,3}\s*(?:inch|inches|cm)\b/gi, ' ');

  // 1. High-confidence price with explicit price/currency/Filipino sale cue ("35 dirhams", "35 lang", "rate 35", "35 na lang", "for 40", "AED 35")
  const explicitMatches = [
    ...scrubbed.matchAll(
      /(?:\b(?:aed|dhs|dh|dirham|dirhams|price|rate|for|only|mine)\s*(\d{2,3})\b|\b(\d{2,3})\s*(?:aed|dhs|dh|dirham|dirhams|lang|na\s*lang|po|guys|madam|only|each)\b)/gi
    )
  ];
  if (explicitMatches.length > 0) {
    const last = explicitMatches[explicitMatches.length - 1];
    const val = parseInt(last[1] || last[2], 10);
    if (val >= 15 && val <= 500) {
      return { priceAed: val, itemTitle, confidence: 'HIGH' };
    }
  }

  // 2. Medium-confidence repeated or standard round thrift price (multiples of 5 between 20 and 250, e.g. "35, 35" or standalone "35")
  const allNums = [...scrubbed.matchAll(/\b(\d{2,3})\b/g)]
    .map(m => parseInt(m[1], 10))
    .filter(n => n >= 20 && n <= 250 && n % 5 === 0);

  if (allNums.length >= 2 && allNums[allNums.length - 1] === allNums[allNums.length - 2]) {
    return { priceAed: allNums[allNums.length - 1], itemTitle, confidence: 'HIGH' };
  }
  if (allNums.length === 1) {
    return { priceAed: allNums[0], itemTitle, confidence: 'MEDIUM' };
  }

  return { itemTitle, confidence: 'NONE' };
}

async function refineWithLocalOllama(transcript: string): Promise<{ priceAed?: number; itemTitle?: string } | null> {
  try {
    const prompt = `You extract the live seller's announced garment selling price in AED from a short transcript (English/Tagalog/Urdu). Ignore clothing sizes/measurements (like size 4, waist 30, length 28, 22x28). Only return priceAed if the seller clearly stated a selling price between 15 and 500. Return strict JSON: {"priceAed": number | null, "itemTitle": string | null}\nTranscript: ${JSON.stringify(transcript)}`;
    const res = await fetch('http://127.0.0.1:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'qwen2.5:7b',
        prompt,
        stream: false,
        format: 'json',
        keep_alive: '10m',
        options: { temperature: 0, num_predict: 60 }
      }),
      signal: AbortSignal.timeout(3500)
    });
    if (!res.ok) return null;
    const j: any = await res.json();
    const parsed = JSON.parse(String(j?.response || '{}'));
    const p = Number(parsed?.priceAed);
    return {
      priceAed: Number.isFinite(p) && p >= 15 && p <= 500 ? Math.round(p) : undefined,
      itemTitle: typeof parsed?.itemTitle === 'string' && parsed.itemTitle.trim() ? parsed.itemTitle.trim() : undefined
    };
  } catch {
    return null;
  }
}

async function transcribeWavBuffer(wavPath: string): Promise<string> {
  // 1. Primary: Local Faster-Whisper HTTP Worker (.venv on 127.0.0.1:3099 — 100% free & local)
  if (await ensureLocalSttWorker()) {
    try {
      const r = await fetch(`${STT_BASE}/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wavPath }),
        signal: AbortSignal.timeout(8000)
      });
      if (r.ok) {
        const j: any = await r.json();
        if (j?.ok && typeof j.text === 'string') {
          return j.text.trim();
        }
      }
    } catch {}
  }

  // 2. Optional Cloud Fallback: Gemini Interactions API ('gemini-3.8-flash') if a direct AI Studio key ('AIza...') is configured
  const gemKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (gemKey.startsWith('AIza')) {
    try {
      const ai = new GoogleGenAI({ apiKey: gemKey });
      const b64 = fs.readFileSync(wavPath).toString('base64');
      const r = await ai.interactions.create({
        model: 'gemini-3.8-flash',
        store: false,
        input: [
          {
            type: 'text',
            text: 'Transcribe the seller speech verbatim (Tagalog/English/Urdu). Output plain text only.'
          },
          { type: 'audio', data: b64, mime_type: 'audio/wav' }
        ]
      });
      return String(r.output_text || '').trim();
    } catch {}
  }

  return '';
}

export async function processBoothLiveAudioOnce(boothId: string, forceOfflineTest = false): Promise<{
  transcript: string;
  priceAed?: number;
  itemTitle?: string;
}> {
  const bKey = String(boothId || 'booth-1').trim().toLowerCase();
  let st = boothStates.get(bKey);
  if (!st) {
    st = { lastProcessedSeg: '', lastCheckedAt: 0, lastTranscript: '', inFlight: false };
    boothStates.set(bKey, st);
  }
  if (st.inFlight) {
    return { transcript: st.lastTranscript, priceAed: st.lastPriceAed, itemTitle: st.lastItemTitle };
  }

  const hlsDir = path.join(process.cwd(), 'public', 'live_hls', bKey);
  if (!fs.existsSync(hlsDir)) return { transcript: '' };

  const files = fs
    .readdirSync(hlsDir)
    .filter(f => f.endsWith('.m2ts'))
    .sort();
  if (files.length === 0) return { transcript: '' };

  const newestName = files[files.length - 1];
  if (!forceOfflineTest && newestName === st.lastProcessedSeg) {
    return { transcript: st.lastTranscript, priceAed: st.lastPriceAed, itemTitle: st.lastItemTitle };
  }

  const newestPath = path.join(hlsDir, newestName);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(newestPath);
  } catch {
    return { transcript: '' };
  }

  // Only process fresh live segments (< 15s old) unless running an explicit diagnostic test
  if (!forceOfflineTest && Date.now() - stat.mtimeMs > 15000) {
    return { transcript: '' };
  }

  st.inFlight = true;
  st.lastProcessedSeg = newestName;
  st.lastCheckedAt = Date.now();

  const tmpTs = path.join(os.tmpdir(), `vv_voice_${bKey}_${process.pid}.ts`);
  const tmpWav = path.join(os.tmpdir(), `vv_voice_${bKey}_${process.pid}.wav`);

  try {
    const sliceFiles = files.slice(-3);
    const buffers = sliceFiles.map(f => fs.readFileSync(path.join(hlsDir, f)));
    fs.writeFileSync(tmpTs, Buffer.concat(buffers));

    await execFileAsync(
      resolveFfmpegBinary(),
      ['-y', '-i', tmpTs, '-vn', '-ac', '1', '-ar', '16000', '-f', 'wav', tmpWav],
      { timeout: 6000, windowsHide: true }
    );

    const transcript = await transcribeWavBuffer(tmpWav);
    if (!transcript) return { transcript: '' };

    st.lastTranscript = transcript;
    let det = extractSpokenPriceDeterministic(transcript);

    if (det.confidence === 'MEDIUM') {
      const llm = await refineWithLocalOllama(transcript);
      if (llm) {
        det = {
          priceAed: llm.priceAed,
          itemTitle: det.itemTitle || llm.itemTitle,
          confidence: llm.priceAed ? 'HIGH' : 'NONE'
        };
      }
    }

    if (det.priceAed && det.priceAed >= 15 && det.priceAed <= 500) {
      st.lastPriceAed = det.priceAed;
      if (det.itemTitle) st.lastItemTitle = det.itemTitle;
      st.lastDetectedAt = Date.now();

      streamController.setVoiceDetectedPrice(bKey, {
        priceAed: det.priceAed,
        itemTitle: det.itemTitle,
        transcript
      });

      console.log(
        `[VoicePriceTracker] 🎙️ (${bKey}) Heard Host Rate: AED ${det.priceAed}${det.itemTitle ? ` (${det.itemTitle})` : ''} | "${transcript}"`
      );

      try {
        eventHub.broadcast({
          type: 'ENTITY_MUTATED',
          module: 'MARKETING',
          entity: 'LIVE_VOICE_PRICE',
          action: 'UPDATE',
          documentRef: bKey,
          data: {
            boothId: bKey,
            voiceDetectedPriceAed: det.priceAed,
            voiceDetectedItemTitle: det.itemTitle,
            transcript,
            detectedAt: st.lastDetectedAt
          }
        });
      } catch {}
    } else if (det.itemTitle) {
      streamController.setVoiceDetectedPrice(bKey, { itemTitle: det.itemTitle, transcript });
    }

    return {
      transcript,
      priceAed: det.priceAed,
      itemTitle: det.itemTitle
    };
  } catch (err: any) {
    console.warn(`[VoicePriceTracker] (${bKey}) scan notice:`, err?.message);
    return { transcript: '' };
  } finally {
    st.inFlight = false;
    try { if (fs.existsSync(tmpTs)) fs.unlinkSync(tmpTs); } catch {}
    try { if (fs.existsSync(tmpWav)) fs.unlinkSync(tmpWav); } catch {}
  }
}

export function getActiveVoiceDetectedPrice(boothSession?: any): {
  priceAed?: number;
  itemTitle?: string;
  isFresh: boolean;
} {
  const p = Number(boothSession?.voiceDetectedPriceAed || 0);
  const ts = Number(boothSession?.voiceDetectedAt || 0);
  const isFresh = p > 0 && ts > 0 && Date.now() - ts <= VOICE_PRICE_TTL_MS;
  return {
    priceAed: isFresh ? p : undefined,
    itemTitle: isFresh && boothSession?.voiceDetectedItemTitle ? String(boothSession.voiceDetectedItemTitle) : undefined,
    isFresh
  };
}

export function getVoicePriceTrackerStatus(boothId: string) {
  const bKey = String(boothId || 'booth-1').trim().toLowerCase();
  const st = boothStates.get(bKey);
  const b = streamController.getBooth(bKey);
  const active = getActiveVoiceDetectedPrice(b);
  return {
    boothId: bKey,
    activeVoicePriceAed: active.priceAed || null,
    activeVoiceItemTitle: active.itemTitle || null,
    isFresh: active.isFresh,
    lastTranscript: st?.lastTranscript || b?.voiceTranscript || '',
    lastDetectedAt: b?.voiceDetectedAt || null,
    lastCheckedAt: st?.lastCheckedAt || null
  };
}

export function startLiveVoicePriceTracker(): void {
  if (loopTimer) return;
  // Pre-warm local faster-whisper worker in background if .venv exists
  ensureLocalSttWorker().catch(() => {});
  loopTimer = setInterval(() => {
    for (const bKey of ['booth-1', 'booth-2']) {
      processBoothLiveAudioOnce(bKey).catch(() => {});
    }
  }, 4500);
  loopTimer.unref?.();
}
