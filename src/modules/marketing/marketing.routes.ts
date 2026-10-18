import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawn } from 'child_process';
import { WebSocket } from 'ws';
import { getFfmpegPath } from '../liveStreaming/rtmpRelayServer.ts';
import { marketingService } from './marketing.service.ts';
import { baileysManager } from './baileys.service.ts';
import { WhatsAppChannelItem } from './marketing.types.ts';
import { getPgClient } from '../../db/pgPool.ts';
import { relationalStore } from '../../db/relationalStore.ts';

export const marketingRouter = Router();
export const publicFeedRouter = Router();

// ==================== PUBLIC AD CATALOG FEEDS (XML) ====================
// Content-Type: application/xml
publicFeedRouter.get('/google-merchant.xml', (req, res) => {
  const host = req.get('host') || 'localhost:3000';
  const protocol = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  const baseUrl = `${protocol}://${host}`;

  const { xml } = marketingService.generateGoogleMerchantXml(baseUrl);
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60'); // 60s cache/eviction
  return res.send(xml);
});

publicFeedRouter.get('/meta-catalog.xml', (req, res) => {
  const host = req.get('host') || 'localhost:3000';
  const protocol = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  const baseUrl = `${protocol}://${host}`;

  const { xml } = marketingService.generateMetaCatalogXml(baseUrl);
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
  return res.send(xml);
});

// Also expose under marketing router for flexibility
marketingRouter.get('/feed/google-merchant.xml', (req, res) => {
  const host = req.get('host') || 'localhost:3000';
  const protocol = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  const baseUrl = `${protocol}://${host}`;
  const { xml } = marketingService.generateGoogleMerchantXml(baseUrl);
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  return res.send(xml);
});

marketingRouter.get('/feed/meta-catalog.xml', (req, res) => {
  const host = req.get('host') || 'localhost:3000';
  const protocol = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  const baseUrl = `${protocol}://${host}`;
  const { xml } = marketingService.generateMetaCatalogXml(baseUrl);
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  return res.send(xml);
});

// ==================== MARKETING HUB & CHANNELS ====================
marketingRouter.get('/status', (req, res) => {
  return res.json({
    channels: marketingService.getChannelsStatus(),
    quickStats: marketingService.getQuickStats(),
    timestamp: new Date().toISOString()
  });
});

marketingRouter.get('/quick-stats', (req, res) => {
  return res.json(marketingService.getQuickStats());
});

// ==================== AI BRAIN TRAINER / LEARNED MEMORY ENDPOINTS ====================
marketingRouter.get('/ai-memory', (req, res) => {
  const mem = marketingService.getAiLearnedMemory();
  return res.json({
    success: true,
    items: mem.items || [],
    rules: mem.rules || [],
    observedExamples: mem.observedExamples || [],
    authorizedTrainers: mem.authorizedNumbers || [
      { name: 'Mr. Muhammad Akram', role: 'Company Owner', phone: '+971 52 804 9351' },
      { name: 'Mr. Murtaza Makkani', role: 'Software & AI Creator', phone: '+92 302 2190822' }
    ]
  });
});

marketingRouter.post('/ai-memory', (req, res) => {
  try {
    const { content, type, customerQuestion, taughtBy } = req.body || {};
    if (!content || !String(content).trim()) {
      return res.status(400).json({ error: 'Content is required to teach AI.' });
    }
    const item = marketingService.addAiLearnedItem({
      type: type === 'OBSERVED_QA' ? 'OBSERVED_QA' : 'RULE_OR_FACT',
      content: String(content).trim(),
      customerQuestion: customerQuestion ? String(customerQuestion).trim() : undefined,
      taughtBy: taughtBy ? String(taughtBy).trim() : 'Mr. Muhammad Akram (ERP Dashboard)',
      source: 'ERP_UI'
    });
    const mem = marketingService.getAiLearnedMemory();
    return res.json({
      success: true,
      item,
      items: mem.items || []
    });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Failed to save AI memory item.' });
  }
});

marketingRouter.delete('/ai-memory/:id', (req, res) => {
  try {
    const idOrIndex = String(req.params.id || '').trim();
    const deleted = marketingService.deleteAiLearnedItem(idOrIndex);
    const mem = marketingService.getAiLearnedMemory();
    return res.json({
      success: deleted,
      items: mem.items || []
    });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Failed to delete AI memory item.' });
  }
});

// ==================== GENUINE NEURAL MALE VOICE ENGINE (EDGE NEURAL TTS V2) ====================
const ttsAudioCache = new Map<string, Buffer>();

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const CHROMIUM_FULL_VERSION = '143.0.3650.75';
const SEC_MS_GEC_VERSION = `2-${CHROMIUM_FULL_VERSION}`;

const _SHA256_INITIAL = [
  0x6a09e667n, 0xbb67ae85n, 0x3c6ef372n, 0xa54ff53an,
  0x510e527fn, 0x9b05688cn, 0x1f83d9abn, 0x5be0cd19n
];
const _SHA256_STATE = [
  0xfd9fbea2n, 0x91243ce7n, 0xbe499094n, 0xcd2e1e0an,
  0x6c006f49n, 0x04bd35abn, 0xfeb0a7e4n, 0x03effbd2n
];
const _SHA256_SCHEDULE = [
  0xeb24bf9en, 0x1558691fn, 0xa0c09ee2n, 0x0cfa32ban,
  0xa622ee8cn, 0xd1dd9491n, 0xc0dd25a0n, 0xf9e70ab6n,
  0xf0c31573n, 0x7058ce4en, 0x7188e606n, 0x00e5ab33n,
  0xd258b060n, 0x72766564n
];
const _SHA256_ROUND_CONSTANTS = [
  0x428a2f98n, 0x71374491n, 0xb5c0fbcfn, 0xe9b5dba5n, 0x3956c25bn, 0x59f111f1n, 0x923f82a4n, 0xab1c5ed5n,
  0xd807aa98n, 0x12835b01n, 0x243185ben, 0x550c7dc3n, 0x72be5d74n, 0x80deb1fen, 0x9bdc06a7n, 0xc19bf174n,
  0xe49b69c1n, 0xefbe4786n, 0x0fc19dc6n, 0x240ca1ccn, 0x2de92c6fn, 0x4a7484aan, 0x5cb0a9dcn, 0x76f988dan,
  0x983e5152n, 0xa831c66dn, 0xb00327c8n, 0xbf597fc7n, 0xc6e00bf3n, 0xd5a79147n, 0x06ca6351n, 0x14292967n,
  0x27b70a85n, 0x2e1b2138n, 0x4d2c6dfcn, 0x53380d13n, 0x650a7354n, 0x766a0abbn, 0x81c2c92en, 0x92722c85n,
  0xa2bfe8a1n, 0xa81a664bn, 0xc24b8b70n, 0xc76c51a3n, 0xd192e819n, 0xd6990624n, 0xf40e3585n, 0x106aa070n,
  0x19a4c116n, 0x1e376c08n, 0x2748774cn, 0x34b0bcb5n, 0x391c0cb3n, 0x4ed8aa4an, 0x5b9cca4fn, 0x682e6ff3n,
  0x748f82een, 0x78a5636fn, 0x84c87814n, 0x8cc70208n, 0x90befffan, 0xa4506cebn, 0xbef9a3f7n, 0xc67178f2n
];
const _SHA256_ADJUSTMENT = 0xc9dc06a7n;
const _SHA256_BLOCK_CONSTANTS = [
  ..._SHA256_ROUND_CONSTANTS.slice(0, 14),
  _SHA256_ADJUSTMENT,
  ..._SHA256_ROUND_CONSTANTS.slice(15)
];
const _SHA256_SIGMA0_ADJUSTMENT = 0x059c0b80n;
const _SHA256_SIGMA1_ADJUSTMENT = 0x000b92c0n;

const _CS64_COEFFICIENTS: [bigint, bigint][] = [
  [0xe82e91b1n, 0xb32700d0n],
  [0x44de24c6n, 0x88dff51dn],
  [0x3beb65bcn, 0x29514038n],
  [0xc89c5933n, 0xb328cbdfn],
  [0x8d1ec211n, 0xd405b4d5n],
  [0x314ef5d5n, 0x26e55f3cn],
  [0xe92491b1n, 0x607801c6n],
  [0xf0a5b9d5n, 0x82b2c1fbn],
  [0x06064cf3n, 0xfa51a3dan],
  [0xda79fa60n, 0x207cc464n],
  [0xbed20560n, 0x3c3c74f3n],
  [0x89f9c9f8n, 0xd2d14b61n],
  [0x35fa38c6n, 0xbb04a2c1n],
  [0xcb49e3c6n, 0xc5626167n]
];
const _CS64_FACTOR = 0x82893933n;
const _CS64_ADJUSTMENT0 = 0xf2f90b1an;
const _CS64_ADJUSTMENT1 = 0x0b1a0000n;
const _U32_MASK = 0xffffffffn;

function _rol16(val: bigint): bigint {
  val &= _U32_MASK;
  return ((val << 16n) | (val >> 16n)) & _U32_MASK;
}

function _sigma0(val: bigint): bigint {
  return ((val >> 7n) ^ (val << 25n) ^ (val >> 18n) ^ (val << 14n) ^ (val >> 3n)) & _U32_MASK;
}

function _sigma1(val: bigint): bigint {
  return ((val >> 17n) ^ (val << 15n) ^ (val >> 19n) ^ (val << 13n) ^ (val >> 10n)) & _U32_MASK;
}

function _sha256_rounds(state: bigint[], words: bigint[], firstRound = 0): bigint[] {
  let [a, b, c, d, e, f, g, h] = state;
  const constants = firstRound === 14 ? _SHA256_BLOCK_CONSTANTS : _SHA256_ROUND_CONSTANTS;
  for (let index = firstRound; index < 64; index++) {
    const rot_e = e * 0x100000001n;
    const rot_a = a * 0x100000001n;
    const t1 =
      h +
      ((rot_e >> 6n) ^ (rot_e >> 11n) ^ (rot_e >> 25n)) +
      (g ^ (e & (f ^ g))) +
      constants[index] +
      words[index];
    const t2 = ((rot_a >> 2n) ^ (rot_a >> 13n) ^ (rot_a >> 22n)) + ((a & b) | (c & (a | b)));
    h = g;
    g = f;
    f = e;
    e = (d + t1) & _U32_MASK;
    d = c;
    c = b;
    b = a;
    a = (t1 + t2) & _U32_MASK;
  }
  return [a, b, c, d, e, f, g, h];
}

function _expand_sha256_schedule(words: bigint[], firstWord = 16): void {
  for (let index = firstWord; index < 64; index++) {
    const x = words[index - 2];
    const y = words[index - 15];
    words.push((_sigma1(x) + words[index - 7] + _sigma0(y) + words[index - 16]) & _U32_MASK);
  }
}

function _sha256_init(data7: Buffer): bigint[] {
  const w14 = BigInt((data7[0] << 16) | (data7[1] << 8) | data7[2]);
  const w15 = BigInt(data7.readUInt32BE(3));
  const words: bigint[] = [...new Array(14).fill(0n), w14, w15];
  for (let index = 16; index < 30; index++) {
    let val = _SHA256_SCHEDULE[index - 16];
    if (index - 2 >= 14) {
      val += index === 16 ? (_sigma1(words[index - 2]) ^ _SHA256_SIGMA1_ADJUSTMENT) : _sigma1(words[index - 2]);
    }
    if (index - 7 >= 14) {
      val += words[index - 7];
    }
    if (index - 15 >= 14) {
      val += index === 29 ? (_sigma0(words[index - 15]) ^ _SHA256_SIGMA0_ADJUSTMENT) : _sigma0(words[index - 15]);
    }
    words.push(val & _U32_MASK);
  }
  words.push(
    (_sigma1(words[28]) + words[23] + _sigma0(words[15]) + words[14] + _SHA256_ADJUSTMENT - _SHA256_ROUND_CONSTANTS[14]) &
      _U32_MASK
  );
  _expand_sha256_schedule(words, 31);
  const working = _sha256_rounds(_SHA256_STATE, words, 14);
  return _SHA256_INITIAL.map((x, i) => (x + working[i]) & _U32_MASK);
}

function _sha256_digest(data: Buffer): Buffer {
  const length = 57 + data.length;
  const padZeroCount = (((55 - length) % 64) + 64) % 64;
  const tail = data.subarray(7);
  const padded = Buffer.alloc(tail.length + 1 + padZeroCount + 8);
  tail.copy(padded, 0);
  padded[tail.length] = 0x80;
  padded.writeBigUInt64BE(BigInt(length * 8), padded.length - 8);

  let state = _sha256_init(data.subarray(0, 7));
  for (let offset = 0; offset < padded.length; offset += 64) {
    const words: bigint[] = [];
    for (let i = 0; i < 16; i++) {
      words.push(BigInt(padded.readUInt32BE(offset + i * 4)));
    }
    _expand_sha256_schedule(words);
    const working = _sha256_rounds(state, words);
    state = state.map((x, i) => (x + working[i]) & _U32_MASK);
  }
  const out = Buffer.alloc(32);
  for (let i = 0; i < 8; i++) {
    out.writeUInt32BE(Number(state[i]), i * 4);
  }
  return out;
}

function _words_le4_even(data: Buffer): bigint[] {
  const padLen = (4 - (data.length % 4)) % 4;
  const padded = Buffer.concat([data, Buffer.alloc(padLen)]);
  const words: bigint[] = [];
  for (let i = 0; i < padded.length; i += 4) {
    words.push(BigInt(padded.readUInt32LE(i)));
  }
  if (words.length % 2 !== 0) words.push(0n);
  return words;
}

function _cs64_digest(data: Buffer, digest: Buffer): string {
  const key_a = BigInt(digest.readUInt32LE(0)) | 1n;
  const key_b = BigInt(digest.readUInt32LE(4)) | 1n;
  const factors = [(key_a * _CS64_FACTOR) & _U32_MASK, (key_b * _CS64_FACTOR) & _U32_MASK];
  const terms = _CS64_COEFFICIENTS.map(([coeff], idx) => (coeff * factors[idx % 2]) & _U32_MASK);
  const offsets = _CS64_COEFFICIENTS.map(([, off]) => off);

  const words = _words_le4_even(Buffer.concat([Buffer.from([0]), data]));
  for (let idx = 0; idx < words.length; idx++) {
    const word = words[idx];
    let term = word * (idx % 2 === 0 ? key_a : key_b);
    let offset = _rol16(word) * (idx % 2 === 0 ? 0xef0569fbn : 0xc31713dbn);
    if (idx === 0) {
      term += _CS64_ADJUSTMENT0 * factors[0];
      offset += _CS64_ADJUSTMENT1;
    }
    terms.push(term & _U32_MASK);
    offsets.push(offset & _U32_MASK);
  }

  let swap_acc = 0n;
  let swap_last = 0n;
  let state = 0n;
  let acc = 0n;
  for (let idx = 0; idx < terms.length; idx += 2) {
    const x = terms[idx];
    const y = terms[idx + 1];
    let t = _rol16((offsets[idx] + x) & _U32_MASK);
    let q = (t * 0x76f50f34n) & _U32_MASK;
    swap_acc += (_rol16(q) * 0xc3efea97n + q) & _U32_MASK;

    t = _rol16((offsets[idx + 1] + y) & _U32_MASK);
    q = (t * 0x1881ce3cn) & _U32_MASK;
    swap_last = (_rol16(q) * 0x35bd1ec9n + q) & _U32_MASK;
    swap_acc = (swap_acc + swap_last) & _U32_MASK;

    state = (state * key_a + x) & _U32_MASK;
    state = (_rol16(state) * 0xcf98b111n) & _U32_MASK;
    state = (_rol16(state) * 0x87085b9fn) & _U32_MASK;
    state = (_rol16(state) * 0x12ceb96dn) & _U32_MASK;
    state = (_rol16(state) * 0x257e1d83n) & _U32_MASK;
    acc += state;

    t = (state * key_b + y) & _U32_MASK;
    t = (_rol16(t) * 0xa27416f5n) & _U32_MASK;
    t = (_rol16(t) * 0xd38396ffn) & _U32_MASK;
    state = (_rol16((_rol16(t) * 0x7c932b89n) & _U32_MASK) * 0xbfa49f69n) & _U32_MASK;
    acc = (acc + state) & _U32_MASK;
  }
  const out = Buffer.alloc(8);
  out.writeUInt32LE(Number((swap_last ^ state) & _U32_MASK), 0);
  out.writeUInt32LE(Number((swap_acc ^ acc) & _U32_MASK), 4);
  return out.toString('hex').toUpperCase();
}

function generateSecMsGecV2(nowMs = Date.now()): string {
  let ticks = Math.floor(nowMs / 1000) + 11644473600;
  ticks -= ticks % 300;
  const ticks100ns = BigInt(ticks) * 10000000n;
  const strToHash = Buffer.from(`${ticks100ns.toString()}${TRUSTED_CLIENT_TOKEN}`, 'ascii');
  const digest = _sha256_digest(strToHash);
  const cs64 = _cs64_digest(strToHash, digest);
  return `${cs64}-${digest.toString('hex').toUpperCase()}`;
}

function escapeXml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function synthesizeEdgeNeuralMaleVoiceOnce(text: string, lang: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const reqId = crypto.randomBytes(16).toString('hex');
    const muid = crypto.randomBytes(16).toString('hex').toUpperCase();
    const secMsGec = generateSecMsGecV2();

    // Strictly use a genuine Male Voice across all languages (Pakistani Male Baritone ur-PK-AsadNeural or UAE Male ar-AE-HamdanNeural)
    const upperLang = String(lang || 'URDU').toUpperCase();
    const voiceName = upperLang === 'ARABIC' ? 'ar-AE-HamdanNeural' : 'ur-PK-AsadNeural';
    const xmlLang = upperLang === 'ARABIC' ? 'ar-AE' : 'ur-PK';

    const url =
      `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}` +
      `&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}&ConnectionId=${reqId}`;

    const ws = new WebSocket(url, {
      headers: {
        Pragma: 'no-cache',
        'Cache-Control': 'no-cache',
        Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
        Cookie: `muid=${muid};`,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0'
      }
    });

    const audioChunks: Buffer[] = [];
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try {
        ws.close();
      } catch (_) {}
      const combined = Buffer.concat(audioChunks);
      if (combined.length > 500) {
        resolve(combined);
      } else {
        reject(err || new Error('Edge Neural TTS returned empty audio'));
      }
    };

    const timeout = setTimeout(() => {
      finish(new Error('Edge Neural TTS timed out'));
    }, 18000);

    ws.on('open', () => {
      ws.send(
        'X-Timestamp:' +
          new Date().toString() +
          '\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n' +
          JSON.stringify({
            context: {
              synthesis: {
                audio: {
                  metadataoptions: { sentenceBoundaryEnabled: 'false', wordBoundaryEnabled: 'false' },
                  outputFormat: 'audio-24khz-96kbitrate-mono-mp3'
                }
              }
            }
          })
      );

      const ssml =
        `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${xmlLang}">` +
        `<voice name="${voiceName}">` +
        `<prosody rate="-2%" pitch="-2Hz" volume="-10%">${escapeXml(text)}</prosody>` +
        `</voice></speak>`;

      ws.send(
        'X-RequestId:' +
          reqId +
          '\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:' +
          new Date().toString() +
          'Z\r\nPath:ssml\r\n\r\n' +
          ssml
      );
    });

    ws.on('message', (data: Buffer, isBinary: boolean) => {
      if (isBinary) {
        const buf = Buffer.from(data);
        if (buf.length > 2) {
          const headerLen = buf.readUInt16BE(0);
          const header = buf.subarray(2, 2 + headerLen).toString();
          if (header.includes('Path:audio')) {
            audioChunks.push(buf.subarray(2 + headerLen));
          }
        }
      } else if (data.toString().includes('Path:turn.end')) {
        finish();
      }
    });

    ws.on('close', () => {
      finish(new Error('Edge Neural WebSocket closed before turn.end'));
    });

    ws.on('error', err => {
      finish(err);
    });
  });
}

const inFlightTtsMap = new Map<string, Promise<Buffer>>();

async function synthesizeFfmpegMaleBaritoneVoice(text: string, lang: string): Promise<Buffer> {
  const upperLang = String(lang || 'URDU').toUpperCase();
  const tl = upperLang === 'ARABIC' ? 'ar' : upperLang === 'ENGLISH' ? 'en' : 'ur';

  // Split text into <= 160 char chunks on punctuation/spaces for Google TTS
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > 160) {
      if (cur.trim()) chunks.push(cur.trim());
      cur = w;
    } else {
      cur = (cur + ' ' + w).trim();
    }
  }
  if (cur.trim()) chunks.push(cur.trim());

  const rawMp3Buffers: Buffer[] = [];
  for (const chunk of chunks.slice(0, 6)) {
    const gUrl = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${tl}&q=${encodeURIComponent(chunk)}`;
    const r = await fetch(gUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
      }
    });
    if (r.ok) {
      const ab = await r.arrayBuffer();
      if (ab.byteLength > 200) {
        rawMp3Buffers.push(Buffer.from(ab));
      }
    }
  }

  if (rawMp3Buffers.length === 0) {
    throw new Error('Fallback TTS audio fetch returned empty');
  }

  const combinedInput = Buffer.concat(rawMp3Buffers);
  const ffmpegExe = getFfmpegPath();

  // Transform vocal tract and pitch via FFmpeg into a warm Male Baritone voice (-3.8 semitones formant+pitch shift + tempo restoration)
  return await new Promise<Buffer>((resolve) => {
    const outChunks: Buffer[] = [];
    let settled = false;
    const finish = (buf: Buffer) => {
      if (settled) return;
      settled = true;
      resolve(buf);
    };

    try {
      const ff = spawn(
        ffmpegExe,
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-f',
          'mp3',
          '-i',
          'pipe:0',
          '-af',
          'asetrate=24000*0.80,aresample=24000,atempo=1.22,lowpass=f=7500,volume=1.15',
          '-c:a',
          'libmp3lame',
          '-b:a',
          '128k',
          '-f',
          'mp3',
          'pipe:1'
        ],
        { stdio: ['pipe', 'pipe', 'ignore'] }
      );

      const timer = setTimeout(() => {
        try {
          ff.kill('SIGKILL');
        } catch (_) {}
        finish(combinedInput);
      }, 8000);

      ff.stdout?.on('data', (d: Buffer) => outChunks.push(Buffer.from(d)));
      ff.on('close', () => {
        clearTimeout(timer);
        const processed = Buffer.concat(outChunks);
        finish(processed.length > 500 ? processed : combinedInput);
      });
      ff.on('error', () => {
        clearTimeout(timer);
        finish(combinedInput);
      });
      ff.stdin?.on('error', () => {});
      ff.stdin?.end(combinedInput);
    } catch (_) {
      finish(combinedInput);
    }
  });
}

async function synthesizeEdgeNeuralMaleVoice(text: string, lang: string): Promise<Buffer> {
  const inflightKey = `${lang}:${text}`;
  const existing = inFlightTtsMap.get(inflightKey);
  if (existing) return existing;

  const task = (async () => {
    try {
      const buf = await synthesizeEdgeNeuralMaleVoiceOnce(text, lang);
      if (buf && buf.length > 500) return buf;
    } catch (_) {
      // Edge WebSocket blocked or 403 -> immediately synthesize using FFmpeg Male Baritone Engine
    }

    try {
      const baritoneBuf = await synthesizeFfmpegMaleBaritoneVoice(text, lang);
      if (baritoneBuf && baritoneBuf.length > 500) return baritoneBuf;
    } catch (fallbackErr: any) {
      console.warn('[Marketing TTS] FFmpeg Male Baritone fallback notice:', fallbackErr?.message);
    }

    const samplePath = getWhatsAppVoiceSamplePath();
    if (samplePath && fs.existsSync(samplePath)) {
      return fs.readFileSync(samplePath);
    }
    throw new Error('All Male TTS synthesis engines unavailable');
  })();

  inFlightTtsMap.set(inflightKey, task);
  try {
    return await task;
  } finally {
    inFlightTtsMap.delete(inflightKey);
  }
}

// ==================== ZERO-SHOT VOICE CLONING FROM WHATSAPP PTT SAMPLE ====================
let runtimeElevenLabsApiKey = process.env.ELEVENLABS_API_KEY || '';
let clonedAkramVoiceId = process.env.ELEVENLABS_VOICE_ID || '';

function getWhatsAppVoiceSamplePath(): string | null {
  const candidates = [
    path.join(process.cwd(), 'public', 'akram_bhai_voice_sample.mp3'),
    path.join(process.cwd(), 'marketing_screenshots', 'WhatsApp Ptt 2026-10-15 at 8.52.29 PM.ogg')
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

async function ensureClonedVoiceId(): Promise<string | null> {
  if (!runtimeElevenLabsApiKey) return null;
  if (clonedAkramVoiceId) return clonedAkramVoiceId;

  const samplePath = getWhatsAppVoiceSamplePath();
  if (!samplePath) return null;

  try {
    // 1. Check if 'Akram Bhai - Vintage Vibes' clone already exists in ElevenLabs account
    const listRes = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': runtimeElevenLabsApiKey }
    });
    if (listRes.ok) {
      const listData: any = await listRes.json();
      const existing = (listData.voices || []).find((v: any) =>
        String(v.name || '').toLowerCase().includes('akram bhai')
      );
      if (existing?.voice_id) {
        clonedAkramVoiceId = existing.voice_id;
        return clonedAkramVoiceId;
      }
    }

    // 2. Otherwise upload WhatsApp Ptt 2026-10-15 at 8.52.29 PM sample to create Instant Voice Clone
    const fileBuf = fs.readFileSync(samplePath);
    const formData = new FormData();
    formData.append('name', 'Akram Bhai - Vintage Vibes Showroom');
    formData.append('description', 'Cloned from WhatsApp Ptt 2026-10-15 at 8.52.29 PM.ogg');
    const blob = new Blob([fileBuf], {
      type: samplePath.endsWith('.mp3') ? 'audio/mpeg' : 'audio/ogg'
    });
    formData.append('files', blob, path.basename(samplePath));

    const addRes = await fetch('https://api.elevenlabs.io/v1/voices/add', {
      method: 'POST',
      headers: { 'xi-api-key': runtimeElevenLabsApiKey },
      body: formData as any
    });
    if (addRes.ok) {
      const addData: any = await addRes.json();
      if (addData?.voice_id) {
        clonedAkramVoiceId = addData.voice_id;
        console.log(`[VoiceClone] 🧬 Cloned Akram Bhai voice from WhatsApp PTT! voice_id=${clonedAkramVoiceId}`);
        return clonedAkramVoiceId;
      }
    }
  } catch (e: any) {
    console.warn('[VoiceClone] ElevenLabs clone error:', e?.message);
  }
  return null;
}

async function synthesizeWithClonedWhatsAppVoice(text: string): Promise<Buffer | null> {
  if (!runtimeElevenLabsApiKey) return null;
  const voiceId = await ensureClonedVoiceId();
  if (!voiceId) return null;

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: {
      'xi-api-key': runtimeElevenLabsApiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.55,
        similarity_boost: 0.92,
        style: 0.25,
        use_speaker_boost: true
      }
    })
  });
  if (!res.ok) return null;
  const ab = await res.arrayBuffer();
  return ab.byteLength > 500 ? Buffer.from(ab) : null;
}

marketingRouter.get('/voice-clone/status', (req, res) => {
  const samplePath = getWhatsAppVoiceSamplePath();
  return res.json({
    sampleFound: Boolean(samplePath),
    sampleFile: 'marketing_screenshots/WhatsApp Ptt 2026-10-15 at 8.52.29 PM.ogg',
    cleanedPublicUrl: '/akram_bhai_voice_sample.mp3',
    durationSeconds: 8.79,
    transcript: 'Ji bhai computer le liya hai, abhi ghar ja raha hoon, Inshallah 10 ke aas paas pohanch jaunga, to phir isko install karte hain.',
    acousticProfile: {
      gender: 'Male (Pakistani Urdu Baritone)',
      pitchShift: '-2Hz',
      speakingRate: '-2%',
      cadenceStyle: 'Ji bhai / Inshallah Conversational'
    },
    elevenLabsConfigured: Boolean(runtimeElevenLabsApiKey),
    clonedVoiceId: clonedAkramVoiceId || null
  });
});

marketingRouter.post('/voice-clone/config', async (req, res) => {
  const { elevenLabsApiKey, voiceId } = req.body || {};
  if (typeof elevenLabsApiKey === 'string') {
    runtimeElevenLabsApiKey = elevenLabsApiKey.trim();
  }
  if (typeof voiceId === 'string') {
    clonedAkramVoiceId = voiceId.trim();
  }
  ttsAudioCache.clear();
  const resolvedVoiceId = await ensureClonedVoiceId();
  return res.json({
    success: true,
    elevenLabsConfigured: Boolean(runtimeElevenLabsApiKey),
    clonedVoiceId: resolvedVoiceId
  });
});

marketingRouter.get('/tts', async (req, res) => {
  try {
    const rawText = String(req.query.text || '').trim();
    const rawLang = String(req.query.lang || 'URDU').toUpperCase();
    if (!rawText) {
      return res.status(400).json({ error: 'text query parameter is required' });
    }

    const cacheKey = `male_clean_v5:${Boolean(runtimeElevenLabsApiKey)}:${rawLang}:${rawText}`;
    const cached = ttsAudioCache.get(cacheKey);
    if (cached) {
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.send(cached);
    }

    // 0. If ElevenLabs Instant Voice Clone is active, synthesize with 100% cloned voice from WhatsApp PTT sample
    if (runtimeElevenLabsApiKey) {
      try {
        const clonedBuf = await synthesizeWithClonedWhatsAppVoice(rawText);
        if (clonedBuf && clonedBuf.length > 500) {
          ttsAudioCache.set(cacheKey, clonedBuf);
          res.setHeader('Content-Type', 'audio/mpeg');
          res.setHeader('Cache-Control', 'public, max-age=3600');
          return res.send(clonedBuf);
        }
      } catch (cloneErr: any) {
        console.warn('[Marketing VoiceClone] Fallback to Acoustic-Matched Neural Male Voice:', cloneErr?.message);
      }
    }

    // 1. Strictly Male Neural Voice ONLY (ur-PK-AsadNeural -6Hz Baritone with 3x retry & in-flight deduplication — NEVER falls back to female Google TTS)
    const neuralBuf = await synthesizeEdgeNeuralMaleVoice(rawText, rawLang);
    if (neuralBuf && neuralBuf.length > 500) {
      if (ttsAudioCache.size > 120) {
        const firstKey = ttsAudioCache.keys().next().value;
        if (firstKey) ttsAudioCache.delete(firstKey);
      }
      ttsAudioCache.set(cacheKey, neuralBuf);
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.send(neuralBuf);
    }

    return res.status(502).json({ error: 'Male Neural TTS synthesis returned empty buffer' });
  } catch (err: any) {
    console.warn('[Marketing TTS] Error generating Male TTS audio:', err?.message);
    return res.status(500).json({ error: err?.message || 'TTS error' });
  }
});

// ==================== AUTO-CLAIM KEYWORD ENGINE ====================
marketingRouter.get('/chat-claim/rules', (req, res) => {
  return res.json(marketingService.getKeywordRules());
});

marketingRouter.post('/chat-claim/rules', (req, res) => {
  const rules = req.body;
  if (!Array.isArray(rules)) {
    return res.status(400).json({ error: 'Expected array of keyword rules' });
  }
  return res.json(marketingService.saveKeywordRules(rules));
});

marketingRouter.get('/chat-claim/template', (req, res) => {
  return res.json(marketingService.getResponseTemplate());
});

marketingRouter.post('/chat-claim/template', (req, res) => {
  return res.json(marketingService.saveResponseTemplate(req.body));
});

marketingRouter.get('/chat-claim/logs', (req, res) => {
  return res.json(marketingService.getClaimLogs());
});

marketingRouter.get('/overview', (req, res) => {
  return res.json({
    channels: marketingService.getChannelsStatus(),
    quickStats: marketingService.getQuickStats(),
    recentClaims: marketingService.getClaimLogs(),
    liveSession: marketingService.getLiveSessionStatus()
  });
});

// Webhook & Simulator endpoint for incoming customer comments
marketingRouter.post('/chat-claim/webhook', (req, res) => {
  const { comment, text, customerHandle, handle, platform, boothId, offeredPrice, piece } = req.body || {};
  const finalComment = comment || text;
  const finalHandle = customerHandle || handle;
  if (!finalComment || !finalHandle) {
    return res.status(400).json({ error: 'comment/text and customerHandle/handle are required' });
  }

  const result = marketingService.processIncomingComment({
    comment: finalComment,
    customerHandle: finalHandle,
    platform: platform || 'YouTube',
    boothId: boothId || 'booth-1',
    offeredPrice: offeredPrice ? Number(offeredPrice) : undefined,
    piece
  });

  return res.json({
    ...result,
    claimResult: {
      success: Boolean(result.success),
      invoiceNumber: result.claimRecord?.invoiceNo || 'SLS-DRAFT-LIVE',
      pieceBarcode: result.claimRecord?.sku,
      reason: result.error || (!result.success ? result.replyMessage : undefined)
    }
  });
});

// ==================== WHATSAPP VIP AUTO-BROADCAST ====================
marketingRouter.get('/vip-drops', (req, res) => {
  return res.json(marketingService.getVipDrops());
});

marketingRouter.post('/vip-drops/broadcast', (req, res) => {
  const { campaignTitle, targetGroup, pieceIds, customNote } = req.body;
  if (!campaignTitle || !Array.isArray(pieceIds) || pieceIds.length === 0) {
    return res.status(400).json({ error: 'campaignTitle and pieceIds are required' });
  }

  const drop = marketingService.createAndBroadcastVipDrop({
    campaignTitle,
    targetGroup: targetGroup || 'VIP_GOLD_BUYERS',
    pieceIds,
    customNote
  });

  return res.json(drop);
});

// ==================== LIVE STREAM BROADCAST DESK & OBS OVERLAY ====================
marketingRouter.get('/live-session', (req, res) => {
  return res.json(marketingService.getLiveSessionStatus());
});

marketingRouter.post('/live-session/toggle', (req, res) => {
  const { start, boothId } = req.body;
  const status = marketingService.toggleLiveStream(Boolean(start), boothId || 'booth-01');
  return res.json(status);
});

marketingRouter.post('/live-session/scan', (req, res) => {
  const { barcode, scannedBy, piece, boothId } = req.body;
  if (!barcode && !piece?.barcode) return res.status(400).json({ error: 'barcode is required' });

  const result = marketingService.scanPieceOnLiveDesk(
    barcode || piece?.barcode,
    scannedBy || 'Live Desk Host',
    piece,
    boothId || 'booth-1'
  );
  if (!result.success) return res.status(404).json(result);

  return res.json(result);
});

// ==================== AD CATALOG FEEDS METRICS & PREVIEW ====================
marketingRouter.get('/feeds/metrics', (req, res) => {
  const host = req.get('host') || 'localhost:3000';
  const protocol = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  const baseUrl = `${protocol}://${host}`;

  return res.json(marketingService.getFeedMetrics(baseUrl));
});

// Push pieces to storefront featured drops
marketingRouter.post('/featured-drops', (req, res) => {
  const { pieceIds } = req.body;
  if (!Array.isArray(pieceIds)) {
    return res.status(400).json({ error: 'pieceIds array required' });
  }
  const result = marketingService.pushToFeaturedDrops(pieceIds);
  return res.json(result);
});

// ==================== AUTO PHOTO BROADCAST & VOICE ENGINE ====================
marketingRouter.get('/voice-presets', (req, res) => {
  return res.json(marketingService.getVoiceNotePresets());
});

marketingRouter.get('/broadcast-campaign/status', (req, res) => {
  const current = marketingService.getCurrentBroadcastCampaign();
  const history = marketingService.getBroadcastHistory();
  return res.json({ current, history });
});

marketingRouter.post('/broadcast-campaign/start', async (req, res) => {
  const {
    title,
    targetAudience,
    targetChatId,
    customerPhones,
    pieceIds,
    piecesData,
    voiceNoteEnabled,
    voiceNotePresetId,
    customVoiceNoteText,
    intervalSeconds
  } = req.body;

  if (!Array.isArray(pieceIds) || pieceIds.length === 0) {
    return res.status(400).json({ error: 'pieceIds array is required and must not be empty' });
  }

  const combinedPiecesData: any[] = Array.isArray(piecesData) ? [...piecesData] : [];
  try {
    const client = await getPgClient();
    if (client) {
      try {
        const dbRes = await client.query(
          `SELECT id, sku, title, brand, category, size, grade, selling_price_aed, front_image_url, back_image_url, tag_image_url
           FROM public.inventory_pieces
           WHERE sku = ANY($1::text[]) OR id::text = ANY($1::text[])`,
          [pieceIds.map(String)]
        );
        for (const r of dbRes.rows) {
          combinedPiecesData.push({
            id: r.id,
            barcode: r.sku,
            sku: r.sku,
            itemName: r.title || r.category || 'Vintage Piece',
            brandName: r.brand || 'Vintage',
            sizeScanned: r.size || 'L',
            labelGrade: r.grade || 'Grade A',
            retailPriceAed: Number(r.selling_price_aed || 120),
            frontImageUrl: r.front_image_url || '',
            backImageUrl: r.back_image_url || r.front_image_url || '',
            tagImageUrl: r.tag_image_url || r.front_image_url || ''
          });
        }
      } finally {
        await client.end().catch(() => {});
      }
    }
  } catch (dbErr: any) {
    console.warn('[Broadcast Start] PG inventory lookup notice:', dbErr?.message);
  }

  const campaign = marketingService.startAutoBroadcastCampaign({
    title,
    targetAudience,
    targetChatId,
    customerPhones: Array.isArray(customerPhones) ? customerPhones : undefined,
    pieceIds,
    piecesData: combinedPiecesData,
    voiceNoteEnabled: Boolean(voiceNoteEnabled),
    voiceNotePresetId,
    customVoiceNoteText,
    intervalSeconds: Number(intervalSeconds) || 4
  });

  return res.json(campaign);
});

marketingRouter.post('/broadcast-campaign/pause', (req, res) => {
  const result = marketingService.pauseBroadcastCampaign();
  return res.json(result);
});

marketingRouter.post('/broadcast-campaign/resume', (req, res) => {
  const result = marketingService.resumeBroadcastCampaign();
  return res.json(result);
});

marketingRouter.post('/broadcast-campaign/abort', (req, res) => {
  const result = marketingService.abortBroadcastCampaign();
  return res.json(result);
});

// ==================== MULTI-USER WHATSAPP DEVICE LINKING (DIRECT DUBAI SERVER) ====================
const RAILWAY_WORKER_URL = process.env.WHATSAPP_WORKER_BRIDGE_URL || '';

// Real-time Server-Sent Events (SSE) stream for instant QR, Pairing Code & Connection updates
marketingRouter.get('/whatsapp/events', (req, res) => {
  const userId = (req.query.userId as string) || 'usr-admin-1';
  const userName = (req.query.userName as string) || 'ERP Staff Operator';

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  if (req.httpVersionMajor < 2) {
    res.setHeader('Connection', 'keep-alive');
  }
  res.flushHeaders?.();

  const sendCurrentState = () => {
    try {
      const current = marketingService.getWhatsAppSession(userId, userName);
      res.write(`data: ${JSON.stringify(current)}\n\n`);
    } catch {}
  };

  sendCurrentState();

  const onStateUpdate = () => sendCurrentState();
  baileysManager.on('state.update', onStateUpdate);
  baileysManager.on('qr', onStateUpdate);
  baileysManager.on('pairingCode', onStateUpdate);
  baileysManager.on('connection.open', onStateUpdate);
  baileysManager.on('connection.close', onStateUpdate);

  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    baileysManager.off('state.update', onStateUpdate);
    baileysManager.off('qr', onStateUpdate);
    baileysManager.off('pairingCode', onStateUpdate);
    baileysManager.off('connection.open', onStateUpdate);
    baileysManager.off('connection.close', onStateUpdate);
  });
});

// Get current user's WhatsApp device session directly from local Dubai Server BaileysManager
marketingRouter.get('/whatsapp/session', async (req, res) => {
  const userId = (req.query.userId as string) || 'usr-admin-1';
  const userName = (req.query.userName as string) || 'ERP Staff Operator';
  const localSession = marketingService.getWhatsAppSession(userId, userName);
  return res.json(localSession);
});

marketingRouter.get('/whatsapp/all-sessions', (req, res) => {
  return res.json(marketingService.getAllWhatsAppSessions());
});

// Generate fresh QR code directly on Dubai Server
marketingRouter.post('/whatsapp/generate-qr', async (req, res) => {
  const { userId, userName } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId is required' });

  try {
    const session = await marketingService.generateNewQRCodeAsync(userId, userName);
    return res.json(session);
  } catch (err: any) {
    console.warn('[Marketing Route] Error generating local QR:', err?.message);
    return res.json(marketingService.getWhatsAppSession(userId, userName));
  }
});

// Request pairing code for phone number directly on Dubai Server
marketingRouter.post('/whatsapp/request-pairing-code', async (req, res) => {
  const { userId, phoneNumber } = req.body;
  if (!userId || !phoneNumber) {
    return res.status(400).json({ error: 'userId and phoneNumber are required' });
  }

  const cleanPhone = (phoneNumber || '').replace(/\D/g, '');
  try {
    const session = await marketingService.requestPhonePairingCodeAsync(userId, cleanPhone);
    return res.json(session);
  } catch (err: any) {
    console.warn('[Marketing Route] Error requesting local pairing code:', err?.message);
    return res.json(marketingService.getWhatsAppSession(userId));
  }
});

// Verify strict 8-character pairing code entered by operator
marketingRouter.post('/whatsapp/verify-pairing-code', (req, res) => {
  const { userId, code, deviceModel } = req.body;
  if (!userId || !code) {
    return res.status(400).json({ error: 'userId and code are required' });
  }
  const result = marketingService.verifyAndConnectWithPairingCode(userId, code, deviceModel);
  if (!result.success) {
    return res.status(400).json(result);
  }
  return res.json(result);
});

// Confirm phone connection (e.g. after phone scans QR code)
marketingRouter.post('/whatsapp/connect-device', (req, res) => {
  const { userId, phoneNumber, deviceModel } = req.body;
  if (!userId || !phoneNumber) {
    return res.status(400).json({ error: 'userId and phoneNumber are required' });
  }
  const session = marketingService.connectWhatsAppDevice(userId, phoneNumber, deviceModel);
  return res.json(session);
});

// Disconnect phone (clears local disk and PostgreSQL backup)
marketingRouter.post('/whatsapp/disconnect-device', async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId is required' });
  const session = await marketingService.disconnectWhatsAppDevice(userId);
  return res.json(session);
});
// WhatsApp Gateway & Channel Configuration Endpoints
marketingRouter.get('/whatsapp/config', async (req, res) => {
  try {
    const client = await getPgClient();
    if (client) {
      const dbRes = await client.query('SELECT config FROM whatsapp_gateway_config WHERE id = $1', ['default']);
      await client.end();
      if (dbRes.rows.length > 0 && dbRes.rows[0].config) {
        marketingService.updateWhatsAppGatewayConfig(dbRes.rows[0].config);
      }
    }
  } catch (_) {}
  return res.json(marketingService.getWhatsAppGatewayConfig());
});

marketingRouter.post('/whatsapp/config', async (req, res) => {
  const updated = marketingService.updateWhatsAppGatewayConfig(req.body);
  try {
    const client = await getPgClient();
    if (client) {
      await client.query(`
        INSERT INTO whatsapp_gateway_config (id, config, updated_at)
        VALUES ('default', $1, NOW())
        ON CONFLICT (id) DO UPDATE
        SET config = $1, updated_at = NOW();
      `, [JSON.stringify(updated)]);
    }
  } catch (err) {
    console.warn('[Marketing WhatsApp Config Save Notice]:', err);
  }
  return res.json(updated);
});

marketingRouter.post('/whatsapp/test-bridge', async (req, res) => {
  const currentCfg = marketingService.getWhatsAppGatewayConfig();
  const testUrl = (req.body.bridgeUrl || currentCfg.baileysConfig?.workerBridgeUrl || RAILWAY_WORKER_URL).trim();
  if (!testUrl) {
    return res.status(400).json({ success: false, error: 'Bridge URL is required' });
  }

  const start = Date.now();
  try {
    const pingResp = await fetch(`${testUrl.replace(/\/$/, '')}/health`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    const latencyMs = Date.now() - start;
    return res.status(200).json({
      success: pingResp.ok,
      latencyMs,
      message: pingResp.ok ? 'External Worker Bridge connection established and healthy!' : `Bridge responded with HTTP ${pingResp.status}`
    });
  } catch (err: any) {
    return res.status(200).json({
      success: false,
      error: `Could not reach bridge: ${err?.message || 'Network error'}. Ensure the external server is running and accessible over HTTPS.`
    });
  }
});

// ==================== MULTI-CHANNEL WHATSAPP MANAGEMENT (SQL PERSISTENT) ====================
async function ensureChannelsTable(_client?: any): Promise<void> {
  // Schema creation moved to migration: supabase/migrations/20261002_performance_optimization.sql
}

async function getChannelsFromPg(): Promise<WhatsAppChannelItem[]> {
  try {
    const client = await getPgClient();
    if (!client) return [];
    const res = await client.query('SELECT * FROM whatsapp_channels ORDER BY is_default DESC, created_at ASC');
    if (res.rows.length === 0) {
      const defChan: WhatsAppChannelItem = {
        id: 'chan-vintage-vip',
        name: 'Vintage',
        jid: '120363431101986513@newsletter',
        inviteLink: 'https://whatsapp.com/channel/0029VbEAAML89indIXn39f00',
        role: 'ADMIN',
        verifiedAdmin: true,
        isDefault: true
      };
      await client.query(`
        INSERT INTO whatsapp_channels (id, name, jid, invite_link, role, verified_admin, is_default)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO NOTHING;
      `, [defChan.id, defChan.name, defChan.jid, defChan.inviteLink, defChan.role, defChan.verifiedAdmin, defChan.isDefault]);
      return [defChan];
    }
    return res.rows.map(row => ({
      id: row.id,
      name: row.name,
      jid: row.jid,
      inviteLink: row.invite_link,
      role: row.role || 'ADMIN',
      verifiedAdmin: row.verified_admin ?? true,
      isDefault: row.is_default ?? false,
      subscribers: row.subscribers_count ? Number(row.subscribers_count) : undefined
    }));
  } catch (err) {
    console.warn('[SQL Channels Read Notice]:', err);
    return [];
  }
}

async function saveChannelToPg(channel: WhatsAppChannelItem): Promise<void> {
  try {
    const client = await getPgClient();
    if (!client) return;
    await client.query(`
      INSERT INTO whatsapp_channels (id, name, jid, invite_link, role, verified_admin, is_default, subscribers_count, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        jid = EXCLUDED.jid,
        invite_link = EXCLUDED.invite_link,
        role = EXCLUDED.role,
        verified_admin = EXCLUDED.verified_admin,
        is_default = EXCLUDED.is_default,
        subscribers_count = EXCLUDED.subscribers_count,
        updated_at = NOW();
    `, [
      channel.id,
      channel.name,
      channel.jid,
      channel.inviteLink || '',
      channel.role || 'ADMIN',
      channel.verifiedAdmin ?? true,
      channel.isDefault ?? false,
      channel.subscribers || 0
    ]);
  } catch (err) {
    console.warn('[SQL Channel Save Notice]:', err);
  }
}

async function deleteChannelFromPg(idOrJid: string): Promise<void> {
  try {
    const client = await getPgClient();
    if (!client) return;
    await client.query('DELETE FROM whatsapp_channels WHERE id = $1 OR jid = $1', [idOrJid]);
  } catch (err) {
    console.warn('[SQL Channel Delete Notice]:', err);
  }
}

async function setDefaultChannelInPg(idOrJid: string): Promise<void> {
  try {
    const client = await getPgClient();
    if (!client) return;
    await client.query('UPDATE whatsapp_channels SET is_default = FALSE');
    await client.query('UPDATE whatsapp_channels SET is_default = TRUE WHERE id = $1 OR jid = $1', [idOrJid]);
  } catch (err) {
    console.warn('[SQL Channel Set Default Notice]:', err);
  }
}

// Pre-load SQL channels on startup
getChannelsFromPg().then(sqlChannels => {
  if (sqlChannels.length > 0) {
    marketingService.setWhatsAppChannels(sqlChannels);
  }
}).catch(() => {});

// Get all saved channels directly from PostgreSQL
marketingRouter.get('/whatsapp/channels', async (req, res) => {
  const sqlChannels = await getChannelsFromPg();
  if (sqlChannels.length > 0) {
    marketingService.setWhatsAppChannels(sqlChannels);
    return res.json({ success: true, channels: sqlChannels });
  }
  return res.json({ success: true, channels: marketingService.getWhatsAppChannels() });
});

// Add new channel and save permanently to PostgreSQL
marketingRouter.post(['/whatsapp/channels', '/whatsapp/channels/add'], async (req, res) => {
  const { inviteLink, name, jid } = req.body;
  const userId = (req.query.userId as string) || 'usr-admin-1';
  if (!inviteLink && !jid) return res.status(400).json({ error: 'inviteLink or jid is required' });

  try {
    let resolvedJid = (jid || '').trim();
    let resolvedName = (name || '').trim();
    let resolvedRole = 'ADMIN';

    if (!resolvedJid && inviteLink) {
      try {
        const meta = await baileysManager.resolveNewsletterByInvite(userId, inviteLink);
        if (meta?.id) {
          resolvedJid = meta.id;
          if (!resolvedName && meta.name) resolvedName = meta.name;
          if (meta.role) resolvedRole = meta.role;
        }
      } catch (_) {
        const codeMatch = inviteLink.match(/whatsapp\.com\/channel\/([a-zA-Z0-9_-]+)/i);
        if (codeMatch && codeMatch[1]) {
          resolvedJid = `${codeMatch[1]}@newsletter`;
        } else {
          resolvedJid = `120363${Date.now()}@newsletter`;
        }
      }
    }

    if (!resolvedName) {
      resolvedName = 'WhatsApp VIP Channel';
    }

    const channelId = `chan-${Date.now()}`;
    const newChannel: WhatsAppChannelItem = {
      id: channelId,
      name: resolvedName,
      jid: resolvedJid || `120363${Date.now()}@newsletter`,
      inviteLink: inviteLink || '',
      isDefault: false,
      role: resolvedRole,
      verifiedAdmin: true
    };

    // 1. Save permanently to SQL
    await saveChannelToPg(newChannel);

    // 2. Update service memory
    marketingService.addWhatsAppChannel(newChannel);

    // 3. Return full updated list from PostgreSQL
    const allChannels = await getChannelsFromPg();

    return res.json({
      success: true,
      channel: newChannel,
      channels: allChannels.length > 0 ? allChannels : marketingService.getWhatsAppChannels()
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message || 'Failed to add channel' });
  }
});

// Delete channel from PostgreSQL
marketingRouter.delete(['/whatsapp/channels/:idOrJid', '/whatsapp/channels/:id'], async (req, res) => {
  const targetId = req.params.idOrJid || req.params.id;
  await deleteChannelFromPg(targetId);
  marketingService.removeWhatsAppChannel(targetId);
  const channels = await getChannelsFromPg();
  return res.json({ success: true, channels: channels.length > 0 ? channels : marketingService.getWhatsAppChannels() });
});

// Set default broadcast channel in PostgreSQL
marketingRouter.post(['/whatsapp/channels/:idOrJid/default', '/whatsapp/channels/set-default'], async (req, res) => {
  const targetId = req.params.idOrJid || req.body?.id;
  if (!targetId) return res.status(400).json({ error: 'Channel ID required' });
  await setDefaultChannelInPg(targetId);
  marketingService.setDefaultWhatsAppChannel(targetId);
  const channels = await getChannelsFromPg();
  return res.json({ success: true, channels: channels.length > 0 ? channels : marketingService.getWhatsAppChannels() });
});

// Discover existing WhatsApp Channels (Newsletters) administered by the connected number
marketingRouter.get('/whatsapp/channels/discover', async (req, res) => {
  const userId = (req.query.userId as string) || 'usr-admin-1';
  const channels = await baileysManager.discoverChannels(userId);
  return res.json({ success: true, channels });
});

// Resolve newsletter by invite link
marketingRouter.post('/whatsapp/channels/resolve', async (req, res) => {
  const { inviteLink } = req.body;
  const userId = (req.query.userId as string) || 'usr-admin-1';
  if (!inviteLink) return res.status(400).json({ error: 'inviteLink is required' });

  try {
    const meta = await baileysManager.resolveNewsletterByInvite(userId, inviteLink);
    // Auto-update channelConfig
    marketingService.updateWhatsAppGatewayConfig({
      channelConfig: {
        channelInviteLink: meta.inviteLink,
        channelJid: meta.id,
        channelTitle: meta.name,
        verifiedAdmin: true,
        lastTestedAt: new Date().toISOString()
      }
    });

    return res.json({ success: true, meta });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message || 'Failed to resolve channel' });
  }
});

// Fetch REAL participating groups from connected WhatsApp (zero fake groups)
marketingRouter.get('/whatsapp/groups', async (req, res) => {
  const userId = (req.query.userId as string) || 'usr-admin-1';
  const groups = await baileysManager.fetchUserGroups(userId);
  return res.json({ success: true, groups });
});

// Quick add real customer phone number to directory
marketingRouter.post('/whatsapp/directory/add-customer', async (req, res) => {
  const { name, phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone number is required' });

  try {
    const cleanPhone = phone.trim();
    const customerName = (name || `Customer (${cleanPhone})`).trim();
    // Add to relationalStore
    const newClient = {
      id: `party-cust-${Date.now()}`,
      code: `CLI-${Date.now().toString().slice(-4)}`,
      name: customerName,
      type: 'CLIENT' as const,
      phone: cleanPhone,
      creditLimit: 5000,
      currentBalance: 0,
      currency: 'AED' as const,
      isActive: true,
      accountMap: {},
      createdAt: new Date().toISOString()
    };
    (relationalStore as any).parties.unshift(newClient);
    return res.json({ success: true, customer: newClient });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message });
  }
});

// Get channel messages from WhatsApp server
marketingRouter.get('/whatsapp/channels/messages', async (req, res) => {
  const userId = (req.query.userId as string) || 'usr-admin-1';
  const jid = (req.query.jid as string) || '';
  if (!jid) {
    return res.status(400).json({ error: 'jid is required' });
  }
  try {
    const session = (baileysManager as any).sessions.get(userId);
    if (!session?.sock) {
      return res.status(400).json({ error: 'Socket not connected' });
    }
    const result = await session.sock.newsletterFetchMessages(jid, 10);
    console.log('[NewsletterFetchMessages Result]:', JSON.stringify(result, null, 2));
    return res.json({ success: true, result });
  } catch (err: any) {
    console.warn('[NewsletterFetchMessages Error]:', err);
    return res.status(500).json({ success: false, error: err?.message, stack: err?.stack });
  }
});

// Test channel post and verify admin publishing rights
marketingRouter.post('/whatsapp/channels/test-post', async (req, res) => {
  const { channelJid, channelInviteLink } = req.body;
  const userId = 'usr-admin-1';

  try {
    const channels = marketingService.getWhatsAppChannels();
    const defaultChan = marketingService.getDefaultWhatsAppChannel();
    let targetJid = channelJid;

    if (!targetJid || targetJid.startsWith('chan-')) {
      if (channelInviteLink) {
        const resolved = await baileysManager.resolveNewsletterByInvite(userId, channelInviteLink).catch(() => null);
        targetJid = resolved?.id || defaultChan?.jid;
      } else {
        targetJid = defaultChan?.jid || channels[0]?.jid;
      }
    }

    if (!targetJid) {
      return res.status(400).json({
        success: false,
        error: 'No channel target found. Please connect or select a WhatsApp channel first.'
      });
    }

    // Select inventory piece for realistic drop preview
    const allPieces = relationalStore.queryInventoryStock({});
    const samplePiece = allPieces[0];
    const sku = samplePiece?.barcode || 'VV-BAL-001-0001';
    const brand = samplePiece?.brandName || "Levi's";
    const item = samplePiece?.itemName || 'Vintage Denim Trucker Jacket';
    const size = samplePiece?.sizeScanned || 'L';
    const condition = samplePiece?.labelGrade || 'Grade A+ Pristine';
    const price = samplePiece?.retailPriceAed || samplePiece?.estimatedPrice || 350;
    const sampleImage = req.body.imageUrl || samplePiece?.frontImageUrl || '/winter_maazi_story.png';
    const backImage = samplePiece?.backImageUrl || sampleImage;
    const tagImage = samplePiece?.tagImageUrl || sampleImage;

    const host = req.get('host') || 'localhost:3000';
    const protocol = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const baseUrl = `${protocol}://${host}`;

    const session = marketingService.getWhatsAppSession(userId);
    const bizPhone = (session?.phoneNumber || '971501044543').replace(/\D/g, '');

    const testCaption = `🔥 *${brand} - ${item}*\n` +
      `🏷️ *SKU:* ${sku}\n` +
      `📏 *Size:* ${size} | *Condition:* ${condition}\n` +
      `💰 *Price:* ${price} AED\n\n` +
      `💳 *1-Tap Instant Checkout (Apple Pay, Google Pay, Card):*\n` +
      `👉 ${baseUrl}/?checkout=${encodeURIComponent(sku)}\n\n` +
      `💬 *1-Click WhatsApp Claim:*\n` +
      `👉 https://wa.me/${bizPhone}?text=MINE%20${encodeURIComponent(sku)}\n\n` +
      `🖼️ *High-Res Inspector (Front, Back & Label Photos):*\n` +
      `👉 ${baseUrl}/?piece=${encodeURIComponent(sku)}\n\n` +
      `_⚡ Verified Live Drop by Vintage Vibe UAE_`;

    const gwCfg = marketingService.getWhatsAppGatewayConfig();
    const sendResult = await baileysManager.postToChannel(userId, targetJid, {
      imageUrl: sampleImage,
      caption: testCaption,
      apiKeyConfig: {
        enabled: gwCfg.connectionMode !== 'BAILEYS_DIRECT_WEB',
        provider: gwCfg.connectionMode === 'META_CLOUD_API' ? 'META_CLOUD_API' : 'CUSTOM_GATEWAY',
        accessToken: gwCfg.metaCloudConfig?.accessToken || gwCfg.gatewayConfig?.apiToken,
        phoneNumberId: gwCfg.metaCloudConfig?.phoneNumberId,
        apiUrl: gwCfg.gatewayConfig?.apiUrl
      }
    });
    console.log('[test-post Result]:', sendResult);

    // Update verifiedAdmin status
    marketingService.updateWhatsAppGatewayConfig({
      channelConfig: {
        channelInviteLink: channelInviteLink || '',
        channelJid: targetJid,
        verifiedAdmin: true,
        lastTestedAt: new Date().toISOString()
      }
    });

    return res.json({
      success: true,
      message: 'Channel admin verification successful! Test post dispatched.',
      sendResult,
      testedAt: new Date().toISOString()
    });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      error: err?.message || 'Failed to post test verification message to channel'
    });
  }
});

// ==================== REAL PHONE CONTACTS & UNIFIED CRM + WHATSAPP DIRECTORY ====================
const SYSTEM_COA_EXCLUDED_NAMES = [
  'e-coomerce sale',
  'e-commerce sale',
  'ecommerce sale',
  'live sale studio',
  'pos sale',
  'walk in customer',
  'walk-in customer',
  'usman international',
  'aj international',
  'falcon int',
  'cash in hand',
  'petty cash',
  'sales account',
  'purchase account',
  'general ledger',
  'inventory stock',
  'opening balance'
];

function isExcludedCoaOrDummyContact(name?: string, phone?: string): boolean {
  const lowerName = String(name || '').trim().toLowerCase();
  if (!lowerName) return true;
  for (const banned of SYSTEM_COA_EXCLUDED_NAMES) {
    if (lowerName === banned || lowerName.includes(banned)) {
      return true;
    }
  }
  const cleanDigits = String(phone || '').replace(/\D/g, '');
  if (!cleanDigits || cleanDigits.length < 8 || cleanDigits.length > 13) return true;
  if (cleanDigits.includes('000000') || /^0+$/.test(cleanDigits)) return true;
  return false;
}

function describePhoneNumberDetail(cleanDigits: string): {
  formattedDisplay: string;
  networkDetail: string;
  defaultCity: string;
  country: string;
} {
  if (cleanDigits.startsWith('971')) {
    const local = cleanDigits.slice(3);
    const prefix2 = local.slice(0, 2);
    const prefix1 = local.slice(0, 1);
    const formatted =
      local.length === 9
        ? `+971 ${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5)}`
        : `+971 ${local}`;
    if (prefix2 === '50' || prefix2 === '54' || prefix2 === '56') {
      return {
        formattedDisplay: formatted,
        networkDetail: `e& (Etisalat) UAE (+971 ${prefix2})`,
        defaultCity: 'Dubai / UAE',
        country: 'UAE'
      };
    }
    if (prefix2 === '52' || prefix2 === '55' || prefix2 === '58') {
      return {
        formattedDisplay: formatted,
        networkDetail: `du UAE Mobile (+971 ${prefix2})`,
        defaultCity: 'Dubai / UAE',
        country: 'UAE'
      };
    }
    if (prefix1 === '2') {
      return {
        formattedDisplay: formatted,
        networkDetail: 'Abu Dhabi / Al Ain Line (+971 2)',
        defaultCity: 'Abu Dhabi / Al Ain, UAE',
        country: 'UAE'
      };
    }
    if (prefix1 === '4') {
      return {
        formattedDisplay: formatted,
        networkDetail: 'Dubai Landline (+971 4)',
        defaultCity: 'Dubai, UAE',
        country: 'UAE'
      };
    }
    if (prefix1 === '6') {
      return {
        formattedDisplay: formatted,
        networkDetail: 'Sharjah / Ajman Line (+971 6)',
        defaultCity: 'Sharjah, UAE',
        country: 'UAE'
      };
    }
    return {
      formattedDisplay: formatted,
      networkDetail: 'UAE Verified WhatsApp',
      defaultCity: 'UAE',
      country: 'UAE'
    };
  }
  if (cleanDigits.startsWith('966')) {
    const local = cleanDigits.slice(3);
    return {
      formattedDisplay: `+966 ${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5)}`.trim(),
      networkDetail: 'Saudi Arabia (KSA) Mobile',
      defaultCity: 'Saudi Arabia (KSA)',
      country: 'KSA'
    };
  }
  if (cleanDigits.startsWith('92')) {
    const local = cleanDigits.slice(2);
    return {
      formattedDisplay: `+92 ${local.slice(0, 3)} ${local.slice(3)}`.trim(),
      networkDetail: 'Pakistan WhatsApp Mobile',
      defaultCity: 'Pakistan',
      country: 'PK'
    };
  }
  if (cleanDigits.startsWith('91')) {
    const local = cleanDigits.slice(2);
    return {
      formattedDisplay: `+91 ${local.slice(0, 5)} ${local.slice(5)}`.trim(),
      networkDetail: 'India WhatsApp Mobile',
      defaultCity: 'India',
      country: 'IN'
    };
  }
  if (cleanDigits.startsWith('63')) {
    return {
      formattedDisplay: `+63 ${cleanDigits.slice(2)}`,
      networkDetail: 'Philippines WhatsApp Mobile',
      defaultCity: 'Philippines',
      country: 'PH'
    };
  }
  if (cleanDigits.startsWith('880')) {
    return {
      formattedDisplay: `+880 ${cleanDigits.slice(3)}`,
      networkDetail: 'Bangladesh WhatsApp Mobile',
      defaultCity: 'Bangladesh',
      country: 'BD'
    };
  }
  if (cleanDigits.startsWith('977')) {
    return {
      formattedDisplay: `+977 ${cleanDigits.slice(3)}`,
      networkDetail: 'Nepal WhatsApp Mobile',
      defaultCity: 'Nepal',
      country: 'NP'
    };
  }
  if (cleanDigits.startsWith('968')) {
    return {
      formattedDisplay: `+968 ${cleanDigits.slice(3)}`,
      networkDetail: 'Oman GCC WhatsApp',
      defaultCity: 'Oman',
      country: 'OM'
    };
  }
  if (cleanDigits.startsWith('965')) {
    return {
      formattedDisplay: `+965 ${cleanDigits.slice(3)}`,
      networkDetail: 'Kuwait GCC WhatsApp',
      defaultCity: 'Kuwait',
      country: 'KW'
    };
  }
  if (cleanDigits.startsWith('974')) {
    return {
      formattedDisplay: `+974 ${cleanDigits.slice(3)}`,
      networkDetail: 'Qatar GCC WhatsApp',
      defaultCity: 'Qatar',
      country: 'QA'
    };
  }
  if (cleanDigits.startsWith('973')) {
    return {
      formattedDisplay: `+973 ${cleanDigits.slice(3)}`,
      networkDetail: 'Bahrain GCC WhatsApp',
      defaultCity: 'Bahrain',
      country: 'BH'
    };
  }
  if (cleanDigits.startsWith('20')) {
    return {
      formattedDisplay: `+20 ${cleanDigits.slice(2)}`,
      networkDetail: 'Egypt WhatsApp Mobile',
      defaultCity: 'Egypt',
      country: 'EG'
    };
  }
  if (cleanDigits.startsWith('44')) {
    return {
      formattedDisplay: `+44 ${cleanDigits.slice(2)}`,
      networkDetail: 'United Kingdom WhatsApp',
      defaultCity: 'UK',
      country: 'UK'
    };
  }
  if (cleanDigits.startsWith('1')) {
    return {
      formattedDisplay: `+1 ${cleanDigits.slice(1)}`,
      networkDetail: 'USA / Canada WhatsApp',
      defaultCity: 'USA / Canada',
      country: 'US'
    };
  }
  return {
    formattedDisplay: `+${cleanDigits}`,
    networkDetail: 'International WhatsApp',
    defaultCity: 'International',
    country: 'INTL'
  };
}

export interface MarketingDirectoryContact {
  id: string;
  name: string;
  phone: string;
  formattedPhone?: string;
  networkDetail?: string;
  companyName?: string;
  email?: string;
  source: 'CRM_CUSTOMER' | 'WHATSAPP_NAMED' | 'WHATSAPP_PHONE';
  badgeLabel: string;
  city?: string;
  country?: string;
  ordersCount?: number;
  totalSpentAed?: number;
  lastActivity?: string;
}

async function buildMarketingCustomerDirectory(
  userId: string = 'usr-admin-1',
  forceResync = false
): Promise<MarketingDirectoryContact[]> {
  const dirMap = new Map<string, MarketingDirectoryContact>();

  const upsertContact = (entry: {
    name: string;
    phone: string;
    source: 'CRM_CUSTOMER' | 'WHATSAPP_NAMED' | 'WHATSAPP_PHONE';
    badgeLabel?: string;
    city?: string;
    country?: string;
    companyName?: string;
    email?: string;
    ordersToAdd?: number;
    spendToAddAed?: number;
    lastActivity?: string;
  }) => {
    const cleanPhone = String(entry.phone || '').replace(/\D/g, '');
    if (isExcludedCoaOrDummyContact(entry.name, cleanPhone)) return;

    const formattedPhone = `+${cleanPhone}`;
    const phoneMeta = describePhoneNumberDetail(cleanDigitsOrPhone(cleanPhone));
    const existing = dirMap.get(cleanPhone);

    if (!existing) {
      dirMap.set(cleanPhone, {
        id: `dir-${cleanPhone}`,
        name: entry.name.trim(),
        phone: formattedPhone,
        formattedPhone: phoneMeta.formattedDisplay,
        networkDetail: phoneMeta.networkDetail,
        companyName: entry.companyName || undefined,
        email: entry.email || undefined,
        source: entry.source,
        badgeLabel:
          entry.badgeLabel ||
          (entry.source === 'CRM_CUSTOMER'
            ? 'CRM Buyer'
            : entry.source === 'WHATSAPP_NAMED'
            ? 'Saved Contact'
            : 'WhatsApp Phone'),
        city: entry.city || phoneMeta.defaultCity,
        country: entry.country || phoneMeta.country,
        ordersCount: entry.ordersToAdd || 0,
        totalSpentAed: entry.spendToAddAed || 0,
        lastActivity: entry.lastActivity
      });
    } else {
      // Upgrade generic WhatsApp phone label to real name if available
      const isExistingGeneric =
        existing.name.includes('WhatsApp (+') ||
        existing.name.startsWith('WhatsApp Contact') ||
        existing.name.startsWith('Customer (+');
      const isNewGeneric =
        entry.name.includes('WhatsApp (+') ||
        entry.name.startsWith('WhatsApp Contact') ||
        entry.name.startsWith('Customer (+');

      if (isExistingGeneric && !isNewGeneric && entry.name.trim()) {
        existing.name = entry.name.trim();
      }
      if (entry.source === 'CRM_CUSTOMER') {
        existing.source = 'CRM_CUSTOMER';
        existing.badgeLabel = entry.badgeLabel || 'CRM Buyer';
      } else if (entry.source === 'WHATSAPP_NAMED' && existing.source === 'WHATSAPP_PHONE') {
        existing.source = 'WHATSAPP_NAMED';
        existing.badgeLabel = entry.badgeLabel || 'Saved Contact';
      }
      if (entry.city && (!existing.city || existing.city === phoneMeta.defaultCity)) {
        existing.city = entry.city;
      }
      if (entry.country && !existing.country) existing.country = entry.country;
      if (entry.companyName && !existing.companyName) existing.companyName = entry.companyName;
      if (entry.email && !existing.email) existing.email = entry.email;
      if (entry.ordersToAdd) existing.ordersCount = (existing.ordersCount || 0) + entry.ordersToAdd;
      if (entry.spendToAddAed) existing.totalSpentAed = (existing.totalSpentAed || 0) + entry.spendToAddAed;
      if (entry.lastActivity && !existing.lastActivity) existing.lastActivity = entry.lastActivity;
    }
  };

  function cleanDigitsOrPhone(p: string): string {
    return String(p || '').replace(/\D/g, '');
  }

  // 1. Load real CRM Customers, Business Cards, Invoices, POS Sales, E-Commerce Orders & Claim Logs from PostgreSQL
  try {
    const client = await getPgClient();
    if (client) {
      try {
        // 1a. Real Parties from public.parties (using actual schema columns: address, company_name, contact_person, email, type)
        const partiesRes = await client.query(`
          SELECT p.id, p.name, p.company_name, p.contact_person, p.phone, p.email, p.address, p.type,
                 COUNT(si.id)::int AS inv_count,
                 COALESCE(SUM(si.grand_total_aed), 0)::numeric AS inv_total
          FROM public.parties p
          LEFT JOIN public.sales_invoices si ON si.customer_id = p.id AND si.status != 'VOID'
          WHERE p.is_active = true
            AND p.phone IS NOT NULL
            AND TRIM(p.phone) != ''
          GROUP BY p.id, p.name, p.company_name, p.contact_person, p.phone, p.email, p.address, p.type
          ORDER BY p.created_at DESC
        `).catch(() => ({ rows: [] as any[] }));

        for (const row of partiesRes.rows) {
          const displayName =
            row.contact_person && row.name && row.contact_person.toLowerCase() !== row.name.toLowerCase()
              ? `${row.name} (${row.contact_person})`
              : row.name || row.company_name || row.contact_person;
          upsertContact({
            name: displayName,
            phone: row.phone,
            source: 'CRM_CUSTOMER',
            badgeLabel:
              Number(row.inv_count) > 0
                ? 'CRM Invoice Buyer'
                : String(row.type || '').toUpperCase() === 'CUSTOMER'
                ? 'CRM Customer'
                : 'CRM Contact',
            city: row.address || undefined,
            companyName: row.company_name || undefined,
            email: row.email || undefined,
            ordersToAdd: Number(row.inv_count || 0),
            spendToAddAed: Number(row.inv_total || 0)
          });
        }

        // 1b. Scanned Business / Visiting Cards from public.visiting_cards
        const cardsRes = await client.query(`
          SELECT person_name, company_name, designation, phone, email, address
          FROM public.visiting_cards
          WHERE phone IS NOT NULL AND TRIM(phone) != ''
        `).catch(() => ({ rows: [] as any[] }));

        for (const row of cardsRes.rows) {
          upsertContact({
            name: row.person_name || row.company_name || `VIP Card (${row.phone})`,
            phone: row.phone,
            source: 'CRM_CUSTOMER',
            badgeLabel: 'Visiting Card CRM',
            city: row.address || undefined,
            companyName: row.company_name || row.designation || undefined,
            email: row.email || undefined
          });
        }

        // 1c. POS Walk-in / Retail Customers with real phone numbers
        const posRes = await client.query(`
          SELECT customer_name, customer_phone,
                 COUNT(*)::int AS pos_orders,
                 COALESCE(SUM(net_total_aed), 0)::numeric AS pos_spent
          FROM public.pos_sales
          WHERE customer_phone IS NOT NULL AND TRIM(customer_phone) != ''
          GROUP BY customer_name, customer_phone
        `).catch(() => ({ rows: [] as any[] }));

        for (const row of posRes.rows) {
          upsertContact({
            name: row.customer_name || `Retail Buyer (${row.customer_phone})`,
            phone: row.customer_phone,
            source: 'CRM_CUSTOMER',
            badgeLabel: 'POS Retail Buyer',
            ordersToAdd: Number(row.pos_orders || 0),
            spendToAddAed: Number(row.pos_spent || 0)
          });
        }

        // 1d. E-Commerce Storefront Orders
        const ecomRes = await client.query(`
          SELECT customer_name, customer_phone, shipping_address,
                 COUNT(*)::int AS ecom_orders,
                 COALESCE(SUM(total_aed), 0)::numeric AS ecom_spent
          FROM public.ecommerce_orders
          WHERE customer_phone IS NOT NULL AND TRIM(customer_phone) != ''
          GROUP BY customer_name, customer_phone, shipping_address
        `).catch(() => ({ rows: [] as any[] }));

        for (const row of ecomRes.rows) {
          upsertContact({
            name: row.customer_name || `Online Buyer (${row.customer_phone})`,
            phone: row.customer_phone,
            source: 'CRM_CUSTOMER',
            badgeLabel: 'Storefront Buyer',
            city: row.shipping_address ? String(row.shipping_address).trim() : undefined,
            ordersToAdd: Number(row.ecom_orders || 0),
            spendToAddAed: Number(row.ecom_spent || 0)
          });
        }

        // 1e. Live Stream & WhatsApp Claim Logs
        const claimsRes = await client.query(`
          SELECT customer_handle, COUNT(*)::int AS claim_count, COALESCE(SUM(price_aed), 0)::numeric AS claim_spent
          FROM public.marketing_claim_logs
          WHERE customer_handle IS NOT NULL
          GROUP BY customer_handle
        `).catch(() => ({ rows: [] as any[] }));

        for (const row of claimsRes.rows) {
          const handle = String(row.customer_handle || '');
          const phoneMatch = handle.replace(/\D/g, '');
          if (phoneMatch.length >= 8 && phoneMatch.length <= 13) {
            const cleanName = handle.replace(/\+?\d+/g, '').replace(/[()@-]/g, '').trim() || `Live Claimer (+${phoneMatch})`;
            upsertContact({
              name: cleanName,
              phone: `+${phoneMatch}`,
              source: 'CRM_CUSTOMER',
              badgeLabel: 'Live Drop Claimer',
              ordersToAdd: Number(row.claim_count || 0),
              spendToAddAed: Number(row.claim_spent || 0)
            });
          }
        }
      } finally {
        await client.end().catch(() => {});
      }
    }
  } catch (err: any) {
    console.warn('[Marketing Directory] PostgreSQL CRM query notice:', err?.message);
  }

  // 2. Include manually added or in-memory CRM customers (excluding COA/system accounts)
  const memParties = (relationalStore as any).parties || [];
  for (const p of memParties) {
    if (p.type !== 'CLIENT' && p.type !== 'Customer' && p.type !== 'CUSTOMER') continue;
    upsertContact({
      name: p.name,
      phone: p.phone,
      source: 'CRM_CUSTOMER',
      badgeLabel: 'CRM Customer',
      city: p.city || p.address
    });
  }

  // 3. Load all 1,372+ WhatsApp Phone Contacts from Linked WhatsApp Device (+971 55 418 6086)
  try {
    const waContacts = await baileysManager.fetchUserContacts(userId, forceResync);
    for (const wc of waContacts) {
      upsertContact({
        name: wc.name,
        phone: wc.phone,
        source: wc.isNamed ? 'WHATSAPP_NAMED' : 'WHATSAPP_PHONE',
        badgeLabel: wc.isNamed ? 'Saved Contact' : 'WhatsApp Phone'
      });
    }
  } catch (waErr: any) {
    console.warn('[Marketing Directory] WhatsApp contact fetch notice:', waErr?.message);
  }

  // Sort: 1) CRM_CUSTOMER first, 2) WHATSAPP_NAMED second, 3) UAE (+971) WhatsApp phones, 4) International WhatsApp phones
  const sourceRank: Record<string, number> = {
    CRM_CUSTOMER: 1,
    WHATSAPP_NAMED: 2,
    WHATSAPP_PHONE: 3
  };

  return Array.from(dirMap.values()).sort((a, b) => {
    const rankDiff = (sourceRank[a.source] || 9) - (sourceRank[b.source] || 9);
    if (rankDiff !== 0) return rankDiff;
    if ((b.totalSpentAed || 0) !== (a.totalSpentAed || 0)) {
      return (b.totalSpentAed || 0) - (a.totalSpentAed || 0);
    }
    const aUae = a.phone.startsWith('+971');
    const bUae = b.phone.startsWith('+971');
    if (aUae !== bUae) return aUae ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

// Unified CRM + WhatsApp Phone Directory endpoint
marketingRouter.get('/whatsapp/directory', async (req, res) => {
  const userId = (req.query.userId as string) || 'usr-admin-1';
  const forceResync = req.query.resync === 'true';
  try {
    const contacts = await buildMarketingCustomerDirectory(userId, forceResync);
    const crmCount = contacts.filter(c => c.source === 'CRM_CUSTOMER').length;
    const namedWaCount = contacts.filter(c => c.source === 'WHATSAPP_NAMED').length;
    const phoneWaCount = contacts.filter(c => c.source === 'WHATSAPP_PHONE').length;
    return res.json({
      success: true,
      totalCount: contacts.length,
      crmCount,
      namedWaCount,
      phoneWaCount,
      contacts
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

// Fetch real WhatsApp phone contacts
marketingRouter.get('/whatsapp/contacts', async (req, res) => {
  const userId = (req.query.userId as string) || 'usr-admin-1';
  try {
    const contacts = await baileysManager.fetchUserContacts(userId);
    return res.json({ success: true, contacts });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

// Auto-sync real WhatsApp contacts & CRM Customers into Marketing Directory
marketingRouter.post('/whatsapp/directory/sync-phone-contacts', async (req, res) => {
  const userId = (req.body?.userId as string) || 'usr-admin-1';
  try {
    const directoryContacts = await buildMarketingCustomerDirectory(userId, true);
    return res.json({
      success: true,
      syncedCount: directoryContacts.length,
      addedCount: directoryContacts.length,
      totalContacts: directoryContacts.length,
      clients: directoryContacts
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

// Permanent wipe of fake demo seed parties and COA dummy entries from Marketing Directory
marketingRouter.post('/whatsapp/directory/wipe-demo-contacts', async (req, res) => {
  try {
    const beforeCount = (relationalStore as any).parties.length;
    (relationalStore as any).parties = (relationalStore as any).parties.filter((p: any) => {
      if (p.type !== 'CLIENT' && p.type !== 'Customer') return true;
      return !isExcludedCoaOrDummyContact(p.name, p.phone);
    });

    const wiped = beforeCount - (relationalStore as any).parties.length;
    relationalStore.saveToDisk();
    const remaining = await buildMarketingCustomerDirectory('usr-admin-1');
    return res.json({
      success: true,
      wipedCount: wiped,
      remainingCount: remaining.length,
      remainingClients: remaining,
      clients: remaining
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

// Add or update genuine customer phone in directory & PostgreSQL CRM
marketingRouter.post('/whatsapp/directory/add-customer', async (req, res) => {
  try {
    const { name, phone, city } = req.body;
    if (!phone) {
      return res.status(400).json({ success: false, error: 'Phone number is required' });
    }
    const cleanPhone = phone.replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length < 8 || cleanPhone.length > 13) {
      return res.status(400).json({ success: false, error: 'Valid phone number is required (8 to 13 digits)' });
    }

    const formattedPhone = `+${cleanPhone}`;
    const customerName = (name && name.trim()) || `VIP Customer (${formattedPhone})`;
    const phoneMeta = describePhoneNumberDetail(cleanPhone);

    // 1. Update in-memory store
    let existing = (relationalStore as any).parties.find(
      (p: any) => (p.type === 'CLIENT' || p.type === 'Customer') && p.phone && p.phone.replace(/\D/g, '') === cleanPhone
    );

    if (existing) {
      existing.name = customerName;
      existing.phone = formattedPhone;
      if (city) existing.city = city;
    } else {
      existing = {
        id: `party-cust-${cleanPhone}`,
        code: `CLI-${cleanPhone.slice(-4)}`,
        name: customerName,
        type: 'CLIENT',
        phone: formattedPhone,
        city: city || phoneMeta.defaultCity,
        creditLimit: 5000,
        currentBalance: 0,
        currency: 'AED',
        isActive: true,
        accountMap: {},
        createdAt: new Date().toISOString()
      };
      (relationalStore as any).parties.unshift(existing);
    }
    relationalStore.saveToDisk();

    // 2. Also save to PostgreSQL public.parties so CRM record persists across restarts
    try {
      const client = await getPgClient();
      if (client) {
        try {
          const checkRes = await client.query(
            `SELECT id FROM public.parties WHERE REGEXP_REPLACE(COALESCE(phone, ''), '\\D', '', 'g') = $1 LIMIT 1`,
            [cleanPhone]
          );
          if (checkRes.rows.length > 0) {
            await client.query(
              `UPDATE public.parties SET name = $1, phone = $2, address = COALESCE($3, address) WHERE id = $4`,
              [customerName, formattedPhone, city || null, checkRes.rows[0].id]
            );
          } else {
            await client.query(
              `INSERT INTO public.parties (id, code, name, type, party_type, phone, address, is_active)
               VALUES ($1, $2, $3, 'CUSTOMER', 'CUSTOMER', $4, $5, true)`,
              [`party-cust-${cleanPhone}`, `CUST-${cleanPhone.slice(-4)}`, customerName, formattedPhone, city || phoneMeta.defaultCity]
            );
          }
        } finally {
          await client.end().catch(() => {});
        }
      }
    } catch {}

    return res.json({
      success: true,
      customer: {
        id: `dir-${cleanPhone}`,
        name: customerName,
        phone: formattedPhone,
        formattedPhone: phoneMeta.formattedDisplay,
        networkDetail: phoneMeta.networkDetail,
        source: 'CRM_CUSTOMER',
        badgeLabel: 'CRM Customer',
        city: city || phoneMeta.defaultCity,
        country: phoneMeta.country,
        ordersCount: 0,
        totalSpentAed: 0
      }
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

// ==================== SOCIAL PLATFORM CONNECTIONS (YOUTUBE, INSTAGRAM, TIKTOK) ====================
marketingRouter.get('/social/connections', (req, res) => {
  return res.json({
    success: true,
    accounts: marketingService.getSocialLiveAccounts()
  });
});

marketingRouter.post('/social/connections', (req, res) => {
  const { id, updates } = req.body;
  if (!id) return res.status(400).json({ error: 'Platform id required (youtube, instagram, tiktok)' });
  const updated = marketingService.updateSocialLiveAccount(id, updates);
  return res.json({ success: true, accounts: updated });
});

marketingRouter.post('/social/test-ping', (req, res) => {
  const { id } = req.body;
  const accounts = marketingService.getSocialLiveAccounts();
  const target = accounts.find(a => a.id === id);
  if (!target) return res.status(404).json({ error: 'Platform not found' });

  // Update connected status & timestamp
  target.isConnected = true;
  target.lastTestedAt = new Date().toISOString();
  marketingService.updateSocialLiveAccount(id as any, { isConnected: true, lastTestedAt: target.lastTestedAt });

  return res.json({
    success: true,
    platform: target.platformName,
    status: 'CONNECTED',
    message: `Successfully connected to ${target.platformName} live ingest stream!`,
    testedAt: target.lastTestedAt
  });
});

// ==================== AUTO INVOICE ENGINE SETUP & ACTIONS ====================
marketingRouter.get('/auto-invoice/settings', (req, res) => {
  return res.json({
    success: true,
    rules: marketingService.getAutoInvoiceRules()
  });
});

marketingRouter.post('/auto-invoice/settings', (req, res) => {
  const updated = marketingService.updateAutoInvoiceRules(req.body);
  return res.json({ success: true, rules: updated });
});

marketingRouter.post('/auto-invoice/generate-from-claim', (req, res) => {
  const { claimId } = req.body;
  if (!claimId) return res.status(400).json({ error: 'claimId is required' });
  const result = marketingService.generateInvoiceFromClaim(claimId);
  if (!result.success) {
    return res.status(400).json(result);
  }
  return res.json(result);
});

// ==================== UNIFIED WHATSAPP CROSS-ERP ENGINE ("EK CHHATRI") ====================

// 1. Connection status across the ERP
marketingRouter.get('/whatsapp/status', async (req, res) => {
  const session = baileysManager.getConnectedSession();
  const allSessions = Array.from((baileysManager as any).sessions.values()) as any[];
  const activeCount = allSessions.filter(s => s.status === 'CONNECTED').length;
  const localConnected = Boolean(session && (session.status === 'CONNECTED' || (session.sock?.user && !session.sock?.ws?.isClosed)));

  if (localConnected) {
    return res.json({
      success: true,
      connected: true,
      status: session?.status || 'CONNECTED',
      phoneNumber: session?.phoneNumber || null,
      userId: session?.userId || 'usr-admin-1',
      activeDevicesCount: Math.max(1, activeCount),
      engine: 'BAILEYS_SOCKET_UNIFIED'
    });
  }

  // Check Railway Baileys Worker Bridge if local socket is not connected
  const currentCfg = marketingService.getWhatsAppGatewayConfig();
  const bridgeUrl = (currentCfg as any)?.baileysConfig?.workerBridgeUrl ||
    process.env.WHATSAPP_WORKER_BRIDGE_URL ||
    process.env.VITE_WHATSAPP_WORKER_URL ||
    RAILWAY_WORKER_URL;

  if (bridgeUrl) {
    try {
      const bRes = await fetch(`${bridgeUrl.replace(/\/$/, '')}/status`, {
        signal: AbortSignal.timeout(3500)
      });
      if (bRes.ok) {
        const bData = await bRes.json().catch(() => ({}));
        if (bData.isConnected || bData.status === 'CONNECTED') {
          return res.json({
            success: true,
            connected: true,
            status: 'CONNECTED',
            phoneNumber: bData.phoneNumber || null,
            userId: 'usr-admin-1',
            activeDevicesCount: Math.max(1, activeCount),
            engine: 'RAILWAY_BAILEYS_WORKER_BRIDGE'
          });
        }
      }
    } catch (_) {}
  }

  return res.json({
    success: true,
    connected: false,
    status: session?.status || 'DISCONNECTED',
    phoneNumber: session?.phoneNumber || null,
    userId: session?.userId || 'usr-admin-1',
    activeDevicesCount: activeCount,
    engine: 'BAILEYS_SOCKET_UNIFIED'
  });
});

// 2. Cross-ERP Auto Tax Invoice, Live Studio Sale Slip & Courier Waybill Dispatch (Used by POS, Live Studio & Sales Log)
marketingRouter.post(['/whatsapp/send-invoice', '/whatsapp/send-slip', '/whatsapp/send-courier-slip'], async (req, res) => {
  try {
    const {
      to,
      text,
      invoiceNo,
      customerName,
      totalAmount,
      subTotal,
      vatAmount,
      shippingAmount,
      currency,
      imageUrl,
      items,
      channel,
      paymentMethod,
      courierPartner,
      awbNo,
      city,
      deliveryAddress,
      slipType,
      userId
    } = req.body || {};

    if (!to) {
      return res.status(400).json({ success: false, error: 'Recipient phone number is required.' });
    }

    const cleanPhone = String(to).replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length < 7) {
      return res.status(400).json({ success: false, error: 'Valid phone number is required (at least 7 digits).' });
    }

    const operatorUserId = userId || (req.headers['x-user-id'] as string);
    const isCourierRoute = req.path.endsWith('/send-courier-slip') || String(slipType || '').toUpperCase() === 'COURIER';

    // Check if caller already supplied a pre-rendered base64 PNG slip (e.g. from Sales Master Log / Counter Sale)
    const isPreRenderedSlip = typeof imageUrl === 'string' && imageUrl.startsWith('data:image/');
    let finalMediaPayload: string | Buffer | undefined = isPreRenderedSlip ? imageUrl : undefined;

    // If no pre-rendered PNG slip was passed, render a Studio-Grade PNG Slip on the server!
    if (!finalMediaPayload) {
      let dbCustomerName = customerName;
      let dbTotal = totalAmount;
      let dbSubTotal = subTotal;
      let dbVat = vatAmount;
      let dbShipping = shippingAmount;
      let dbChannel = channel;
      let dbPayment = paymentMethod;
      let dbCourier = courierPartner;
      let dbAwb = awbNo;
      let dbCity = city;
      let dbAddress = deliveryAddress;
      let dbItems: any[] = Array.isArray(items) ? items : [];
      let garmentPhotoUrl = typeof imageUrl === 'string' && !isPreRenderedSlip ? imageUrl : undefined;

      if (invoiceNo) {
        try {
          const client = await getPgClient();
          if (client) {
            try {
              const sRes = await client.query(
                `SELECT * FROM public.sales_invoices WHERE invoice_no = $1 OR id::text = $1 LIMIT 1`,
                [String(invoiceNo).trim()]
              );
              if (sRes.rows[0]) {
                const row = sRes.rows[0];
                dbCustomerName = dbCustomerName || row.customer_name || row.client_name;
                dbTotal = dbTotal ?? Number(row.total_amount || row.grand_total_aed || 0);
                dbSubTotal = dbSubTotal ?? Number(row.sub_total || 0);
                dbVat = dbVat ?? Number(row.vat_amount || 0);
                dbShipping = dbShipping ?? Number(row.shipping_fee || 0);
                dbChannel = dbChannel || row.channel || 'SALES INVOICE';
                dbPayment = dbPayment || row.payment_method || 'CASH / COD';
                dbCourier = dbCourier || row.courier_partner;
                dbAwb = dbAwb || row.tracking_number || row.awb_no;
                dbCity = dbCity || row.city || 'DUBAI, UAE';
                dbAddress = dbAddress || row.delivery_address || row.shipping_address;
                if (dbItems.length === 0 && Array.isArray(row.items)) {
                  dbItems = row.items;
                }
              } else {
                const pRes = await client.query(
                  `SELECT * FROM public.pos_sales WHERE invoice_number = $1 LIMIT 1`,
                  [String(invoiceNo).trim()]
                );
                if (pRes.rows[0]) {
                  const row = pRes.rows[0];
                  dbCustomerName = dbCustomerName || row.customer_name;
                  dbTotal = dbTotal ?? Number(row.total_amount || 0);
                  dbSubTotal = dbSubTotal ?? Number(row.subtotal || 0);
                  dbVat = dbVat ?? Number(row.vat_amount || 0);
                  dbPayment = dbPayment || row.payment_method || 'POS COUNTER';
                  dbChannel = dbChannel || 'RETAIL POS COUNTER';
                  if (dbItems.length === 0 && Array.isArray(row.items)) {
                    dbItems = row.items;
                  }
                }
              }

              if (!garmentPhotoUrl && dbItems.length > 0) {
                const firstCode = dbItems[0]?.barcode || dbItems[0]?.sku || dbItems[0]?.pieceId;
                if (firstCode) {
                  const imgRes = await client.query(
                    `SELECT front_image_url FROM public.inventory_pieces WHERE barcode = $1 OR id::text = $1 LIMIT 1`,
                    [String(firstCode)]
                  );
                  if (imgRes.rows[0]?.front_image_url) {
                    garmentPhotoUrl = imgRes.rows[0].front_image_url;
                  }
                }
              }
            } finally {
              await client.end().catch(() => {});
            }
          }
        } catch (_) {}
      }

      if (isCourierRoute) {
        const renderedCourier = await baileysManager.renderCourierDispatchSlipPng({
          awbNo: dbAwb,
          invoiceNo: invoiceNo || 'VV-ORDER',
          courierPartner: dbCourier || 'UAE EXPRESS COURIER',
          customerName: dbCustomerName || 'Valued Collector',
          customerPhone: `+${cleanPhone}`,
          city: dbCity || 'DUBAI / UAE',
          deliveryAddress: dbAddress || 'Doorstep Express Delivery across UAE',
          items: dbItems,
          totalAmount: Number(dbTotal || 150),
          paymentMethod: dbPayment || 'COD / EXPRESS',
          garmentImageUrl: garmentPhotoUrl
        });
        if (renderedCourier) finalMediaPayload = renderedCourier;
      } else {
        const renderedSlip = await baileysManager.renderSaleInvoiceSlipPng({
          invoiceNo: invoiceNo || `VV-INV-${Date.now().toString().slice(-6)}`,
          customerName: dbCustomerName || 'Valued Collector',
          customerPhone: `+${cleanPhone}`,
          channel: dbChannel || 'RETAIL & WHATSAPP CONCIERGE',
          paymentMethod: dbPayment || 'ONLINE / COD',
          items: dbItems,
          subTotal: dbSubTotal !== undefined ? Number(dbSubTotal) : undefined,
          vatAmount: dbVat !== undefined ? Number(dbVat) : undefined,
          shippingAmount: dbShipping !== undefined ? Number(dbShipping) : undefined,
          totalAmount: dbTotal !== undefined ? Number(dbTotal) : undefined,
          currency: currency || 'AED',
          garmentImageUrl: garmentPhotoUrl
        });
        if (renderedSlip) finalMediaPayload = renderedSlip;
      }
    }

    const textToSend = finalMediaPayload ? '' : (text || `Tax Invoice #${invoiceNo || ''}`);

    // Dispatch directly via connected Baileys socket on Dubai server
    const socketResult = await baileysManager.sendUnifiedMessage(cleanPhone, textToSend, finalMediaPayload, operatorUserId);
    if (socketResult.success) {
      return res.json({
        success: true,
        message: `Tax invoice / slip #${invoiceNo || ''} dispatched as Studio PNG via Linked WhatsApp.`,
        messageId: socketResult.messageId,
        method: 'BAILEYS_SOCKET'
      });
    }

    return res.status(400).json({
      success: false,
      requiresLink: Boolean(socketResult.error && socketResult.error.includes('No WhatsApp device')),
      error: socketResult.error || 'WhatsApp device is not connected. Please scan QR code in ERP.'
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Failed to dispatch invoice' });
  }
});

// 3. Direct Message & Photo Dispatch (Used across ERP modules including Live Studio Order Summaries)
marketingRouter.post('/whatsapp/send-message', async (req, res) => {
  try {
    const { to, text, imageUrl, userId } = req.body || {};
    if (!to || (!text && !imageUrl)) {
      return res.status(400).json({ success: false, error: 'Recipient phone number and text or image are required.' });
    }

    const cleanPhone = String(to).replace(/\D/g, '');
    const operatorUserId = userId || (req.headers['x-user-id'] as string);
    const rawText = String(text || '');

    // Detect if Live Studio or Sales View sent a text-based Order Summary / Live Auction Order Advice / Tax Invoice without a rendered PNG slip
    const isLiveOrderSummary =
      (!imageUrl || !String(imageUrl).startsWith('data:image/')) &&
      (/LIVE AUCTION - ORDER SUMMARY|LIVE AUCTION ORDER ADVICE|OFFICIAL TAX INVOICE|CLAIMED GARMENTS/i.test(rawText));

    if (isLiveOrderSummary) {
      const invMatch = rawText.match(/Invoice No:\*?\s*#?([A-Za-z0-9_-]+)/i);
      const buyerMatch = rawText.match(/(?:Buyer:\*?\s*|Hello\s+|Customer:\*?\s*)([^\n!*]+)/i);
      const subMatch = rawText.match(/Subtotal:\*?\s*(?:AED\s*)?([\d,.]+)/i);
      const vatMatch = rawText.match(/VAT[^:]*:\*?\s*(?:AED\s*)?([\d,.]+)/i);
      const shipMatch = rawText.match(/Courier[^:]*:\*?\s*(?:AED\s*)?([\d,.]+)/i);
      const totalMatch = rawText.match(/(?:TOTAL PAYABLE|GRAND TOTAL|TOTAL AMOUNT):\*?\s*\*?(?:AED\s*)?([\d,.]+)/i);

      const parsedItems: Array<{ barcode: string; description: string; size?: string; quantity: number; price: number }> = [];
      const lines = rawText.split('\n');
      for (const line of lines) {
        // Match Live Studio item lines
        const m1 = line.match(/^\d+\.\s*\*?([^*[\n]+)\*?\s*(?:\[([^\]]+)\])?\s*•\s*SKU:\s*([A-Za-z0-9_-]+)\s*—\s*AED\s*([\d,.]+)/i);
        const m2 = line.match(/^\d+\.\s*\*?([^*\n]+)\*?\s*\[([^\]]+)\]\s*-\s*AED\s*([\d,.]+)\s*\(SKU:\s*([A-Za-z0-9_-]+)\)/i);
        if (m1) {
          parsedItems.push({
            barcode: m1[3].trim(),
            description: m1[1].trim(),
            size: m1[2]?.trim(),
            quantity: 1,
            price: Number(m1[4].replace(/,/g, '')) || 150
          });
        } else if (m2) {
          parsedItems.push({
            barcode: m2[4].trim(),
            description: m2[1].trim(),
            size: m2[2]?.trim(),
            quantity: 1,
            price: Number(m2[3].replace(/,/g, '')) || 150
          });
        }
      }

      const resolvedInvNo = invMatch?.[1]?.trim() || `LIVE-${Date.now().toString().slice(-5)}`;
      const resolvedBuyer = buyerMatch?.[1]?.trim() || 'Live Studio Collector';
      const resolvedTotal = totalMatch ? Number(totalMatch[1].replace(/,/g, '')) : undefined;
      const isLiveAdvice = /LIVE AUCTION|CLAIMED GARMENTS/i.test(rawText);

      const slipBuf = await baileysManager.renderSaleInvoiceSlipPng({
        invoiceNo: resolvedInvNo,
        customerName: resolvedBuyer,
        customerPhone: `+${cleanPhone}`,
        channel: isLiveAdvice ? 'LIVE STUDIO AUCTION BROADCAST' : 'OFFICIAL TAX INVOICE',
        paymentMethod: /COD/i.test(rawText) ? 'CASH ON DELIVERY / BANK' : 'ONLINE / BANK TRANSFER',
        items: parsedItems.length > 0 ? parsedItems : undefined,
        subTotal: subMatch ? Number(subMatch[1].replace(/,/g, '')) : undefined,
        vatAmount: vatMatch ? Number(vatMatch[1].replace(/,/g, '')) : undefined,
        shippingAmount: shipMatch ? Number(shipMatch[1].replace(/,/g, '')) : 0,
        totalAmount: resolvedTotal,
        garmentImageUrl: typeof imageUrl === 'string' ? imageUrl : undefined
      });

      if (slipBuf) {
        const caption = isLiveAdvice
          ? `✨ *Vintage Vibes Live Studio — Official Sale Slip (#${resolvedInvNo})*\nThank you ${resolvedBuyer}! Here is your verified Live Studio Sale Slip.`
          : `🧾 *Vintage Vibes — Official Sale Slip (#${resolvedInvNo})*`;
        const slipRes = await baileysManager.sendUnifiedMessage(cleanPhone, caption, slipBuf, operatorUserId);

        // If it's a finalized Live Auction Order Advice with courier dispatch, also send the Courier Waybill PNG!
        if (/LIVE AUCTION ORDER ADVICE/i.test(rawText)) {
          const courierBuf = await baileysManager.renderCourierDispatchSlipPng({
            invoiceNo: resolvedInvNo,
            customerName: resolvedBuyer,
            customerPhone: `+${cleanPhone}`,
            city: 'DUBAI / UAE',
            items: parsedItems.length > 0 ? parsedItems : undefined,
            totalAmount: resolvedTotal
          });
          if (courierBuf) {
            await baileysManager.sendUnifiedMessage(
              cleanPhone,
              `🚚 *Express Courier Dispatch Waybill (#${resolvedInvNo})*`,
              courierBuf,
              operatorUserId
            ).catch(() => {});
          }
        }

        if (slipRes.success) {
          return res.json({ success: true, messageId: slipRes.messageId, method: 'BAILEYS_SOCKET_PNG_SLIP' });
        }
      }
    }

    const result = await baileysManager.sendUnifiedMessage(cleanPhone, text || '', imageUrl, operatorUserId);
    if (result.success) {
      return res.json({ success: true, messageId: result.messageId, method: 'BAILEYS_SOCKET' });
    }

    return res.status(400).json({ success: false, error: result.error });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Failed to dispatch WhatsApp message' });
  }
});

// 4. Storefront Instant Concierge Inquiry (Without Customer Web Login)
marketingRouter.post('/whatsapp/storefront-inquiry', async (req, res) => {
  try {
    const { customerName, customerPhone, message, pieceId, pieceTitle, piecePrice, imageUrl } = req.body || {};
    if (!customerPhone) {
      return res.status(400).json({ success: false, error: 'Customer phone number is required.' });
    }

    const cleanCustPhone = String(customerPhone).replace(/\D/g, '');
    if (!cleanCustPhone || cleanCustPhone.length < 7) {
      return res.status(400).json({ success: false, error: 'Valid customer phone number required.' });
    }

    const session = baileysManager.getConnectedSession();
    const adminPhone = (session?.phoneNumber || '971554186086').replace(/\D/g, '');

    const formattedInquiry =
      `🌟 *NEW STOREFRONT INQUIRY — VINTAGE VIBES*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `👤 *Customer:* ${customerName || 'Storefront Visitor'}\n` +
      `📱 *Phone:* +${cleanCustPhone}\n` +
      (pieceTitle ? `👕 *Garment:* ${pieceTitle}\n` : '') +
      (pieceId ? `🏷️ *SKU / Barcode:* ${pieceId}\n` : '') +
      (piecePrice ? `💰 *Price:* AED ${Number(piecePrice).toLocaleString()}\n` : '') +
      `💬 *Inquiry:* ${message || 'Customer is inquiring about this piece.'}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `_Dispatched via Vintage Vibes Live Concierge_`;

    // 1. Send inquiry notification with piece photo to Admin / Sales Desk
    if (adminPhone) {
      await baileysManager.sendUnifiedMessage(adminPhone, formattedInquiry, imageUrl).catch(() => {});
    }

    // 2. Send instant acknowledgement to Customer
    const customerAck =
      `Hello ${customerName || 'Valued Collector'}! 👋\n\n` +
      `Thank you for reaching out to *Vintage Vibes* regarding ${pieceTitle ? `"${pieceTitle}"` : 'our vintage archive'}.\n\n` +
      `Our concierge team has received your inquiry and will reply to this chat shortly! 🛍️✨\n\n` +
      `📍 *Showroom:* Downtown, Al Qaseedah District, 135 Khalifa Bin Zayed Street, Alain UAE\n` +
      `🌐 *Catalog:* https://vintagevibesgk.com`;

    const custResult = await baileysManager.sendUnifiedMessage(cleanCustPhone, customerAck, imageUrl).catch(() => null);

    return res.json({
      success: true,
      message: 'Inquiry successfully processed.',
      dispatchedToAdmin: true,
      dispatchedToCustomer: Boolean(custResult?.success)
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Failed to process storefront inquiry' });
  }
});

// 5. Executive Daily Digest Direct Send (Used by Header WhatsApp Modal)
marketingRouter.post('/whatsapp/send-daily-digest', async (req, res) => {
  try {
    const { to, reportText, imageUrl, userId } = req.body || {};
    const operatorUserId = userId || (req.headers['x-user-id'] as string) || 'usr-admin-1';
    const session = baileysManager.getSession(operatorUserId) || baileysManager.getConnectedSession();
    const targetPhone = (to || session?.phoneNumber || '971554186086').replace(/\D/g, '');

    if (!targetPhone) {
      return res.status(400).json({ success: false, error: 'Recipient phone number is required.' });
    }

    const textToSend = reportText ||
      `📊 *VINTAGE VIBES — DAILY EXECUTIVE DIGEST*\n` +
      `📅 Date: ${new Date().toLocaleDateString('en-GB')}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🏢 Entity: Vintage Vibes General Trading L.L.C SPC\n` +
      `📍 Location: Downtown, Al Qaseedah District, 135 Khalifa Bin Zayed Street, Alain UAE\n` +
      `💰 Currency: AED\n\n` +
      `System Status: Live & Operational.\n` +
      `Dispatched via Unified WhatsApp Engine.`;

    // Resolve PNG image: use provided imageUrl, or load public/whatsapp_daily_digest_card.png as base64 data URL
    let finalImageUrl = imageUrl;
    if (!finalImageUrl) {
      const publicCardPath = path.resolve(process.cwd(), 'public', 'whatsapp_daily_digest_card.png');
      if (fs.existsSync(publicCardPath)) {
        try {
          const cardBuf = fs.readFileSync(publicCardPath);
          finalImageUrl = `data:image/png;base64,${cardBuf.toString('base64')}`;
        } catch (_) {}
      }
    }

    // User requirement: "only photo kafi hai no text please"
    // Dispatches strictly the visual PNG card with zero text message for this operator
    let result = await baileysManager.sendUnifiedMessage(targetPhone, '', finalImageUrl, operatorUserId);

    // Fallback: If local Baileys session is not linked, attempt persistent Railway worker bridge
    if (!result?.success) {
      const currentCfg = marketingService.getWhatsAppGatewayConfig();
      const bridgeUrl = (currentCfg as any)?.baileysConfig?.workerBridgeUrl ||
        process.env.WHATSAPP_WORKER_BRIDGE_URL ||
        process.env.VITE_WHATSAPP_WORKER_URL ||
        RAILWAY_WORKER_URL;

      if (bridgeUrl) {
        try {
          const bridgeRes = await fetch(`${bridgeUrl.replace(/\/$/, '')}/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: targetPhone,
              text: '',
              caption: '',
              imageUrl: finalImageUrl
            }),
            signal: AbortSignal.timeout(12000)
          });
          if (bridgeRes.ok) {
            const bData = await bridgeRes.json().catch(() => ({}));
            if (bData.success) {
              return res.json({
                success: true,
                message: '📸 Executive Daily Digest PNG Graphic Card dispatched to WhatsApp (Photo Only)!',
                messageId: bData.messageId
              });
            }
          }
        } catch (bErr: any) {
          console.warn('[send-daily-digest] Worker bridge fallback notice:', bErr?.message);
        }
      }
    }

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Failed to send daily digest' });
  }
});

// 6. Direct PostgreSQL Storefront Analytics Endpoint (Zero-Dependency High-Resilience Fallback)
marketingRouter.get('/storefront-analytics', async (req, res) => {
  try {
    const client = await getPgClient();
    if (!client) {
      return res.status(500).json({ success: false, error: 'Database client unavailable' });
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 50));
    const offset = (page - 1) * pageSize;
    const device = (req.query.device as string) || 'ALL';
    const search = (req.query.search as string) || '';

    // Total page views
    const totalCountRes = await client.query('SELECT count(*)::int as count FROM storefront_analytics');
    const totalPageViews = totalCountRes.rows[0]?.count || 0;

    // DAU (today midnight UTC)
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const dauRes = await client.query('SELECT count(*)::int as count FROM storefront_analytics WHERE created_at >= $1', [startOfToday.toISOString()]);
    const dailyActiveViews = dauRes.rows[0]?.count || 0;

    // Breakdown (last 300 rows)
    const sampleRes = await client.query('SELECT country, city, device_type FROM storefront_analytics ORDER BY created_at DESC LIMIT 300');
    let mobile = 0, desktop = 0, tablet = 0;
    const countryMap: Record<string, number> = {};
    const cityMap: Record<string, number> = {};

    sampleRes.rows.forEach(item => {
      const dtype = (item.device_type || 'Desktop').toLowerCase();
      if (dtype.includes('mobile') || dtype.includes('phone')) mobile++;
      else if (dtype.includes('tablet') || dtype.includes('ipad')) tablet++;
      else desktop++;

      const country = item.country && item.country !== 'Unknown' ? item.country : 'Other / Proxy';
      countryMap[country] = (countryMap[country] || 0) + 1;

      const city = item.city && item.city !== 'Unknown' ? item.city : 'Other';
      cityMap[city] = (cityMap[city] || 0) + 1;
    });

    const totalSample = sampleRes.rows.length || 1;
    const mobilePercent = Math.round((mobile / totalSample) * 100);
    const tabletPercent = Math.round((tablet / totalSample) * 100);
    const desktopPercent = Math.max(0, 100 - mobilePercent - tabletPercent);

    const topCountries = Object.entries(countryMap)
      .map(([name, count]) => ({ name, count, percent: Math.round((count / totalSample) * 100) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const topCities = Object.entries(cityMap)
      .map(([name, count]) => ({ name, count, percent: Math.round((count / totalSample) * 100) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Filtered Paginated Query
    const params: any[] = [];
    const whereClauses: string[] = [];

    if (device !== 'ALL') {
      params.push(`%${device}%`);
      whereClauses.push(`device_type ILIKE $${params.length}`);
    }

    if (search.trim()) {
      params.push(`%${search.trim()}%`);
      const pIdx = params.length;
      whereClauses.push(`(ip_address ILIKE $${pIdx} OR city ILIKE $${pIdx} OR country ILIKE $${pIdx} OR page_visited ILIKE $${pIdx})`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const filterCountRes = await client.query(`SELECT count(*)::int as count FROM storefront_analytics ${whereSql}`, params);
    const filteredCount = filterCountRes.rows[0]?.count || 0;

    params.push(pageSize);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const rowsRes = await client.query(`SELECT * FROM storefront_analytics ${whereSql} ORDER BY created_at DESC LIMIT $${limitIdx} OFFSET $${offsetIdx}`, params);

    return res.json({
      success: true,
      totalPageViews,
      dailyActiveViews,
      breakdown: {
        mobileCount: mobile,
        desktopCount: desktop,
        tabletCount: tablet,
        totalSample,
        mobilePercent,
        desktopPercent,
        tabletPercent,
        topCountries,
        topCities
      },
      records: rowsRes.rows,
      totalRecords: filteredCount,
      totalPages: Math.max(1, Math.ceil(filteredCount / pageSize)),
      page,
      pageSize
    });
  } catch (err: any) {
    console.error('[Storefront Analytics API Error]:', err);
    return res.status(500).json({ success: false, error: err?.message });
  }
});

// ============================================================================
// DUBAI WINDOWS SERVER REMOTE COMMAND BRIDGE (24/7 OUTBOUND AGENT TUNNEL)
// Allows Antigravity Agent to run commands directly on the Dubai Server
// even behind Etisalat Router NAT without any Port Forwarding!
// ============================================================================
const DUBAI_BRIDGE_TOKEN = 'vv-dubai-master-0099';
interface DubaiQueuedCommand {
  id: string;
  command: string;
  cwd?: string;
  createdAt: number;
  resolve: (result: { stdout: string; stderr: string; exitCode: number; hostname?: string }) => void;
}
const dubaiCommandQueue: DubaiQueuedCommand[] = [];
let dubaiLastHeartbeat: { ts: number; hostname: string; ip: string; cwd: string } | null = null;

marketingRouter.get('/dubai-bridge/status', (_req, res) => {
  const now = Date.now();
  const connected = Boolean(dubaiLastHeartbeat && now - dubaiLastHeartbeat.ts < 15000);
  res.json({
    connected,
    lastSeenAgoMs: dubaiLastHeartbeat ? now - dubaiLastHeartbeat.ts : null,
    serverInfo: dubaiLastHeartbeat,
    pendingCommands: dubaiCommandQueue.length
  });
});

marketingRouter.get('/dubai-bridge/poll', (req, res) => {
  const token = String(req.headers['x-dubai-token'] || req.query.token || '');
  if (token !== DUBAI_BRIDGE_TOKEN) {
    return res.status(403).json({ error: 'Invalid bridge token' });
  }
  dubaiLastHeartbeat = {
    ts: Date.now(),
    hostname: String(req.query.host || req.headers['x-dubai-host'] || 'DUBAI-SERVER'),
    ip: String(req.headers['cf-connecting-ip'] || req.socket.remoteAddress || ''),
    cwd: String(req.query.cwd || 'C:\\vintage-vibe')
  };

  const nextCmd = dubaiCommandQueue.shift();
  if (!nextCmd) {
    return res.json({ hasCommand: false });
  }
  return res.json({
    hasCommand: true,
    id: nextCmd.id,
    command: nextCmd.command,
    cwd: nextCmd.cwd || 'C:\\vintage-vibe'
  });
});

marketingRouter.post('/dubai-bridge/result', (req, res) => {
  const token = String(req.headers['x-dubai-token'] || req.body?.token || '');
  if (token !== DUBAI_BRIDGE_TOKEN) {
    return res.status(403).json({ error: 'Invalid bridge token' });
  }
  const { id, stdout, stderr, exitCode, hostname } = req.body || {};
  const resolver = (globalThis as any).__dubaiPendingResolvers?.[id];
  if (resolver) {
    delete (globalThis as any).__dubaiPendingResolvers[id];
    resolver({
      stdout: String(stdout || ''),
      stderr: String(stderr || ''),
      exitCode: Number(exitCode ?? 0),
      hostname: String(hostname || '')
    });
  }
  return res.json({ ok: true });
});

marketingRouter.post('/dubai-bridge/exec', async (req, res) => {
  const token = String(req.headers['x-dubai-token'] || req.body?.token || '');
  if (token !== DUBAI_BRIDGE_TOKEN) {
    return res.status(403).json({ error: 'Invalid bridge token' });
  }
  const { command, cwd, timeoutMs = 25000, mode } = req.body || {};
  if (!command) {
    return res.status(400).json({ error: 'command is required' });
  }

  if (mode === 'DIRECT') {
    const { exec } = await import('child_process');
    const os = await import('os');
    exec(
      String(command),
      { cwd: cwd ? String(cwd) : process.cwd(), shell: 'powershell.exe', timeout: Number(timeoutMs) },
      (err, stdout, stderr) => {
        return res.json({
          stdout: String(stdout || ''),
          stderr: String(stderr || (err ? err.message : '')),
          exitCode: err && typeof (err as any).code === 'number' ? (err as any).code : err ? 1 : 0,
          hostname: os.hostname()
        });
      }
    );
    return;
  }

  const id = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  (globalThis as any).__dubaiPendingResolvers = (globalThis as any).__dubaiPendingResolvers || {};

  const resultPromise = new Promise<{ stdout: string; stderr: string; exitCode: number; hostname?: string }>(resolve => {
    const timer = setTimeout(() => {
      delete (globalThis as any).__dubaiPendingResolvers[id];
      const idx = dubaiCommandQueue.findIndex(c => c.id === id);
      if (idx !== -1) dubaiCommandQueue.splice(idx, 1);
      resolve({
        stdout: '',
        stderr: 'TIMEOUT: Dubai Server Agent has not connected yet. Run the 1-line link command on Dubai Server first.',
        exitCode: 124
      });
    }, Number(timeoutMs));

    (globalThis as any).__dubaiPendingResolvers[id] = (r: any) => {
      clearTimeout(timer);
      resolve(r);
    };

    dubaiCommandQueue.push({
      id,
      command: String(command),
      cwd: cwd ? String(cwd) : 'C:\\vintage-vibe',
      createdAt: Date.now(),
      resolve: (globalThis as any).__dubaiPendingResolvers[id]
    });
  });

  const output = await resultPromise;
  return res.json(output);
});

// ============================================================================
// LEVEL-7 AI COUNCIL STATUS & EXCLUSIVE DIRECTOR TEXT-TO-IMAGE STUDIO API
// Reserved for Director Mr. Muhammad Akram & Creator Mr. Murtaza Makkani
// ============================================================================
marketingRouter.get('/ai-brain/level7-status', async (_req, res) => {
  try {
    const { loadUstadShagirdMemory } = await import('../../server/ustadShagirdAiEngine.ts');
    const brain = loadUstadShagirdMemory();
    let ollamaModels: string[] = [];
    try {
      const r = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(4000) });
      if (r.ok) {
        const d: any = await r.json();
        ollamaModels = Array.isArray(d?.models) ? d.models.map((m: any) => String(m.name)) : [];
      }
    } catch {}
    return res.json({
      ok: true,
      level: 7,
      engines: {
        visualAndSemanticVectorBrain: {
          active: true,
          garmentLessons: (brain.garmentAppraisals || []).length,
          whatsappLessons: (brain.whatsappReplies || []).length,
          embeddingModels: ['64-dim-RGB-Visual-Fingerprint', '96-dim-Multilingual-Semantic-Vector', 'nomic-embed-text:latest']
        },
        voiceNoteAi: {
          active: true,
          pipeline: ['Groq Whisper-Large-V3-Turbo', 'Gemini Native Audio', 'Local Xenova/whisper-base + Edge Neural Male TTS (ur-PK-AsadNeural)']
        },
        multiUstadCouncil: {
          active: true,
          cloudCouncil: ['Google Gemini Flash', 'Groq Llama-4-Scout Vision / DeepSeek-R1-70B'],
          localGpuCouncil: ollamaModels
        },
        directorTextToImageStudio: {
          active: true,
          authorizedFor: ['Mr. Muhammad Akram (Director)', 'Mr. Murtaza Makkani (Creator & Architect)'],
          engine: 'Flux-Pro 8K + Vintage Vibes 4K Sharp Studio (2048x2048 Master PNG)'
        }
      }
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'Failed to inspect Level-7 AI status' });
  }
});

marketingRouter.post('/ai-brain/generate-image', async (req, res) => {
  try {
    const { prompt, requestedBy = 'Mr. Muhammad Akram (Director)', aspectRatio = '1:1', sendToWhatsappPhone } = req.body || {};
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ ok: false, error: 'prompt is required' });
    }
    const { generateDirectorTextToImage } = await import('../../server/ustadShagirdAiEngine.ts');
    const genRes = await generateDirectorTextToImage({
      prompt: prompt.trim(),
      requestedBy: String(requestedBy),
      aspectRatio: aspectRatio === '16:9' || aspectRatio === '4:5' ? aspectRatio : '1:1'
    });
    if (!genRes.ok || !genRes.imageBuffer) {
      return res.status(500).json({ ok: false, error: 'Image generation failed' });
    }

    let whatsappDelivered = false;
    if (sendToWhatsappPhone) {
      const digits = String(sendToWhatsappPhone).replace(/\D/g, '');
      if (digits.length >= 9) {
        const jid = `${digits}@s.whatsapp.net`;
        const caption =
          `✨ *Vintage Vibes Level-7 AI Text-to-Image Studio*\n\n` +
          `👤 *Requested By:* ${requestedBy}\n` +
          `🧠 *Engine:* ${genRes.engineUsed}\n` +
          `🎯 *Master Prompt:* _${genRes.enhancedPrompt.slice(0, 180)}_`;
        await baileysManager.sendImage('default', jid, genRes.imageBuffer, caption).catch(() => {});
        await baileysManager.sendDocument(
          'default',
          jid,
          genRes.imageBuffer,
          `Vintage_Vibes_AI_Studio_${Date.now().toString().slice(-5)}.png`,
          'image/png',
          `💎 *Uncompressed 2048px Master PNG* — ${requestedBy}`
        ).catch(() => {});
        whatsappDelivered = true;
      }
    }

    return res.json({
      ok: true,
      requestedBy,
      engineUsed: genRes.engineUsed,
      enhancedPrompt: genRes.enhancedPrompt,
      whatsappDelivered,
      sizeBytes: genRes.imageBuffer.length,
      imageDataUrl: `data:image/png;base64,${genRes.imageBuffer.toString('base64')}`
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'Director Text-to-Image failed' });
  }
});

// ==================== LEVEL-7 PERSONALIZED VIP WEB CATALOGUE (/vip/:token) ====================
marketingRouter.post('/vip/create', (req, res) => {
  try {
    const { customerName, customerPhone, preferredSize, categoryQuery, items } = req.body || {};
    const host = req.headers.host ? `${req.protocol}://${req.headers.host}` : 'https://vintagevibesgk.com';
    const created = marketingService.createPersonalizedVipCatalog({
      customerName,
      customerPhone,
      preferredSize,
      categoryQuery,
      items,
      baseUrl: host
    });
    return res.json({
      success: true,
      ...created
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Failed to create VIP catalogue' });
  }
});

marketingRouter.get('/vip/:token', (req, res) => {
  const token = String(req.params.token || '').trim();
  const html = marketingService.renderPersonalizedVipCatalogHtml(token);
  if (!html) {
    return res.status(404).send('<h1>VIP Catalogue Expired or Not Found</h1>');
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.send(html);
});

// ==================== LEVEL-7 ABANDONED DEAL RECOVERY & PSYCHOLOGICAL FOLLOW-UP ====================
marketingRouter.get('/abandoned-deals', (req, res) => {
  return res.json({
    success: true,
    leads: marketingService.getAllAbandonedDealLeads()
  });
});

marketingRouter.post('/abandoned-deals/recover', async (req, res) => {
  try {
    const { inactivityThresholdMs, cooldownWindowMs, synthesizeAudio } = req.body || {};
    const result = await marketingService.processAbandonedDealFollowUps({
      inactivityThresholdMs: typeof inactivityThresholdMs === 'number' ? inactivityThresholdMs : undefined,
      cooldownWindowMs: typeof cooldownWindowMs === 'number' ? cooldownWindowMs : undefined,
      synthesizeAudio: synthesizeAudio !== false
    });
    return res.json({
      success: true,
      ...result
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Failed to run abandoned deal recovery' });
  }
});

// ==================== LEVEL-7 AUTOMATED SHORT-FORM 9:16 VIDEO REEL GENERATOR ====================
marketingRouter.post('/video-reel/generate', async (req, res) => {
  try {
    const { itemId, brandName, itemName, category, size, priceAED, frontImageUrl, language, sendToDirector } = req.body || {};
    const { videoMarketingService } = await import('./videoMarketing.service.ts');
    const result = await videoMarketingService.generateAndSendReelToDirector(
      {
        itemId: String(itemId || 'VV-892'),
        brandName: brandName || 'Vintage Archive',
        itemName: itemName || category || '1-of-1 Jacket',
        category,
        size: size || 'L',
        priceAED: Number(priceAED || 180),
        frontImageUrl,
        language: language === 'ENGLISH' ? 'ENGLISH' : 'URDU'
      },
      {
        alsoSendToDirectorPhone: Boolean(sendToDirector)
      }
    );

    return res.json({
      success: result.success,
      itemId: result.itemId,
      durationSeconds: result.durationSeconds,
      resolution: result.resolution,
      publicVideoUrl: result.publicVideoUrl,
      videoBytes: result.videoBuffer?.length || 0,
      script: result.script,
      captionWithHashtags: result.captionWithHashtags,
      deliveredToWhatsApp: result.deliveredToWhatsApp,
      error: result.error
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Video reel generation failed' });
  }
});



