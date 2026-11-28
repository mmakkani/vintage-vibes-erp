import fs from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { spawn, execFile, ChildProcess } from 'child_process';
import { promisify } from 'util';
import { withDb } from '../../db/pgPool.ts';
import {
  isBoothActuallyStreamingOnServer,
  setBoothPinnedPiece,
  registerAiHostStateHooks,
  markBoothLiveEnded,
  startAiSocialMultistream,
  stopAiSocialMultistream,
  LivePinnedPiece
} from './rtmpRelayServer.ts';
import { whatnotAuctionEngine } from './whatnotAuctionEngine.ts';

const execFileAsync = promisify(execFile);

const LT_BASE_DIR = path.join(process.cwd(), 'livetalking');
const LT_REPO_DIR = path.join(LT_BASE_DIR, 'repo');
const LT_PYTHON_EXE = path.join(LT_BASE_DIR, 'venv', 'Scripts', 'python.exe');
const LT_PREPARE_SCRIPT = path.join(LT_BASE_DIR, 'prepare_single_photo_avatar.py');
const LT_PROFILE_FILE = path.join(LT_BASE_DIR, 'host_profile.json');
const SEEDVC_BASE_DIR = path.join(process.cwd(), 'seedvc');
const SEEDVC_PYTHON_EXE = path.join(SEEDVC_BASE_DIR, 'venv', 'Scripts', 'python.exe');
const PURE_BROADCASTER_SCRIPT = path.join(SEEDVC_BASE_DIR, 'pure_gemini_broadcaster.py');
const CONVERT_GEMINI_UPLOAD_SCRIPT = path.join(SEEDVC_BASE_DIR, 'convert_uploaded_gemini_video.py');
const PURE_GEMINI_CLIPS_DIR = path.join(process.cwd(), 'public', 'assets', 'models', 'pure_gemini_clips');
const HOST_MASTER_VOICE_WAV = path.join(process.cwd(), 'voiceclone', 'host_master_clean.wav');
const FFMPEG_EXE_PATH = path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');
const CUSTOM_HOST_IMG = path.join(process.cwd(), 'public', 'assets', 'models', 'custom_ai_host.png');
const CUSTOM_HOST_16X9_JPG = path.join(process.cwd(), 'public', 'assets', 'models', 'custom_ai_host_16x9.jpg');
const CUSTOM_HOST_9X16_JPG = path.join(process.cwd(), 'public', 'assets', 'models', 'custom_ai_host_9x16.jpg');
const LT_BG_PORTRAIT_JPG = path.join(LT_BASE_DIR, 'host_8k_1080p.jpg');
const DEFAULT_HOST_IMG = path.join(process.cwd(), 'public', 'assets', 'models', 'vintage_vibes_master_host.png');

export type AiHostVoicePreset = 'clone3_exact' | 'ph_female_en' | 'ph_female_tl' | 'gemini_clone';

export interface HostProfile {
  voicePreset: AiHostVoicePreset;
  geminiVoiceId: string;
  hostName: string;
  avatarType: 'video' | 'photo';
  updatedAt: string;
}

function isPureGeminiClone3Installed(): boolean {
  return (
    fs.existsSync(SEEDVC_PYTHON_EXE) &&
    fs.existsSync(PURE_BROADCASTER_SCRIPT) &&
    fs.existsSync(HOST_MASTER_VOICE_WAV)
  );
}

function readHostProfile(): HostProfile {
  const pureReady = isPureGeminiClone3Installed();
  const defaults: HostProfile = {
    voicePreset: pureReady ? 'clone3_exact' : 'ph_female_en',
    geminiVoiceId: '',
    hostName: 'Vintage Vibes Filipina Host',
    avatarType: pureReady ? 'video' : 'photo',
    updatedAt: ''
  };
  try {
    if (!fs.existsSync(LT_PROFILE_FILE)) return defaults;
    const raw = JSON.parse(fs.readFileSync(LT_PROFILE_FILE, 'utf8'));
    const vp = raw?.voicePreset;
    const allowed: AiHostVoicePreset[] = ['clone3_exact', 'ph_female_en', 'ph_female_tl', 'gemini_clone'];
    return {
      voicePreset: allowed.includes(vp) ? vp : defaults.voicePreset,
      geminiVoiceId: String(raw?.geminiVoiceId || '').trim(),
      hostName: String(raw?.hostName || defaults.hostName).trim() || defaults.hostName,
      avatarType:
        raw?.avatarType === 'photo'
          ? 'photo'
          : raw?.avatarType === 'video'
          ? 'video'
          : fs.existsSync(CUSTOM_HOST_IMG)
          ? 'photo'
          : defaults.avatarType,
      updatedAt: String(raw?.updatedAt || '')
    };
  } catch {
    return defaults;
  }
}

function writeHostProfile(patch: Partial<HostProfile>): HostProfile {
  const next: HostProfile = {
    ...readHostProfile(),
    ...patch,
    updatedAt: new Date().toISOString()
  };
  try {
    fs.mkdirSync(path.dirname(LT_PROFILE_FILE), { recursive: true });
    fs.writeFileSync(LT_PROFILE_FILE, JSON.stringify(next, null, 2), 'utf8');
  } catch {}
  return next;
}

async function resolveActiveGeminiApiKey(): Promise<string> {
  try {
    const dbKey = await withDb(async (client) => {
      const res = await client.query(
        `SELECT api_key FROM public.gemini_api_config WHERE id = 'default' LIMIT 1`
      );
      return String(res.rows?.[0]?.api_key || '').trim();
    });
    if (dbKey) return dbKey;
  } catch {}
  return String(process.env.GEMINI_API_KEY || '').trim();
}

function buildLtPythonEnv(geminiApiKey = ''): NodeJS.ProcessEnv {
  const ffmpegStaticDir = path.join(process.cwd(), 'node_modules', 'ffmpeg-static');
  const resolvedKey = String(geminiApiKey || process.env.GEMINI_API_KEY || '').trim();
  return {
    ...process.env,
    ...(resolvedKey ? { GEMINI_API_KEY: resolvedKey } : {}),
    PATH: fs.existsSync(ffmpegStaticDir)
      ? `${ffmpegStaticDir}${path.delimiter}${process.env.PATH || ''}`
      : process.env.PATH,
    PYTHONUNBUFFERED: '1',
    PYTHONIOENCODING: 'utf-8',
    PYTHONUTF8: '1'
  };
}

export interface AiNightHostStatus {
  boothId: string;
  active: boolean;
  mode: 'STUDIO_SHOWCASE' | 'LIVETALKING_AVATAR';
  liveTalkingConfigured: boolean;
  liveTalkingInstalled: boolean;
  liveTalkingRunning: boolean;
  avatarUrl: string;
  avatarStudioUrl?: string;
  avatarType: 'video' | 'photo';
  avatarEngine: 'pure_gemini_clone3' | 'musetalk_v15' | 'wav2lip';
  clone3Ready?: boolean;
  voicePreset: AiHostVoicePreset;
  geminiVoiceCloned: boolean;
  geminiVoiceId: string;
  hostName: string;
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
      cycleSec: 60,
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
  if (isPureGeminiClone3Installed()) return '';
  const envUrl = String(process.env.LIVETALKING_URL || '').trim();
  if (envUrl) return envUrl.replace(/\/+$/, '');
  if (isLegacyWav2LipInstalled()) return 'http://127.0.0.1:8010';
  return '';
}

function isLegacyWav2LipInstalled(): boolean {
  return (
    fs.existsSync(LT_PYTHON_EXE) &&
    fs.existsSync(path.join(LT_REPO_DIR, 'app.py')) &&
    fs.existsSync(path.join(LT_REPO_DIR, 'models', 'wav2lip.pth'))
  );
}

function isLiveTalkingInstalled(): boolean {
  return isPureGeminiClone3Installed() || isLegacyWav2LipInstalled();
}

function getActiveHostAvatarUrl(): string {
  if (fs.existsSync(CUSTOM_HOST_IMG)) return '/assets/models/custom_ai_host.png';
  if (fs.existsSync(DEFAULT_HOST_IMG)) return '/assets/models/vintage_vibes_master_host.png';
  return '/app-icon.png';
}

function getActiveHostStudio16x9Url(): string {
  if (fs.existsSync(CUSTOM_HOST_16X9_JPG)) {
    try {
      const mt = Math.floor(fs.statSync(CUSTOM_HOST_16X9_JPG).mtimeMs);
      return `/assets/models/custom_ai_host_16x9.jpg?v=${mt}`;
    } catch {
      return '/assets/models/custom_ai_host_16x9.jpg';
    }
  }
  return getActiveHostAvatarUrl();
}

export async function bakeFittedStudioFramesFromPhoto(srcImagePath: string): Promise<void> {
  if (!fs.existsSync(srcImagePath)) return;
  fs.mkdirSync(path.dirname(CUSTOM_HOST_16X9_JPG), { recursive: true });
  const inputBuf = fs.readFileSync(srcImagePath);

  // 1) 16:9 HD Broadcast Studio Frame (1280x720) — blurred luxury boutique wings + crisp uncropped host portrait
  const bg16x9 = await sharp(inputBuf)
    .rotate()
    .resize(1280, 720, { fit: 'cover', position: 'attention' })
    .blur(26)
    .modulate({ brightness: 0.36, saturation: 0.9 })
    .png()
    .toBuffer();

  const fg16x9 = await sharp(inputBuf)
    .rotate()
    .resize(1240, 704, { fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer();

  await sharp(bg16x9)
    .composite([{ input: fg16x9, gravity: 'center' }])
    .jpeg({ quality: 92 })
    .toFile(CUSTOM_HOST_16X9_JPG);

  // 2) 9:16 Vertical Full Frame (720x1280) — clean full portrait fit
  const bg9x16 = await sharp(inputBuf)
    .rotate()
    .resize(720, 1280, { fit: 'cover', position: 'top' })
    .blur(22)
    .modulate({ brightness: 0.38, saturation: 0.9 })
    .png()
    .toBuffer();

  const fg9x16 = await sharp(inputBuf)
    .rotate()
    .resize(720, 1280, { fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer();

  await sharp(bg9x16)
    .composite([{ input: fg9x16, gravity: 'center' }])
    .jpeg({ quality: 92 })
    .toFile(CUSTOM_HOST_9X16_JPG);

  try {
    fs.mkdirSync(path.dirname(LT_BG_PORTRAIT_JPG), { recursive: true });
    fs.copyFileSync(CUSTOM_HOST_9X16_JPG, LT_BG_PORTRAIT_JPG);
  } catch {}
}

// Auto-ensure existing custom_ai_host.png is fitted into 16:9 & 9:16 studio frames on boot
setImmediate(() => {
  if (fs.existsSync(CUSTOM_HOST_IMG) && !fs.existsSync(CUSTOM_HOST_16X9_JPG)) {
    bakeFittedStudioFramesFromPhoto(CUSTOM_HOST_IMG).catch(() => {});
  }
});

async function ensureAvatarPrepared(): Promise<void> {
  if (isPureGeminiClone3Installed()) return;
  if (!fs.existsSync(LT_PYTHON_EXE)) return;
  const coordsFile = path.join(LT_REPO_DIR, 'data', 'avatars', 'vv_host', 'coords.pkl');
  if (fs.existsSync(coordsFile)) return;
  if (!fs.existsSync(LT_PREPARE_SCRIPT)) return;
  const srcImg = fs.existsSync(CUSTOM_HOST_IMG) ? CUSTOM_HOST_IMG : DEFAULT_HOST_IMG;
  if (!fs.existsSync(srcImg)) return;
  await execFileAsync(LT_PYTHON_EXE, [LT_PREPARE_SCRIPT, srcImg, 'vv_host'], {
    cwd: LT_REPO_DIR,
    env: buildLtPythonEnv(),
    timeout: 60000
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

  // Preferred Zero-MuseTalk Pure Gemini + Seed-VC Clone 3 Live Broadcaster
  if (isPureGeminiClone3Installed()) {
    if (liveTalkingProc && liveTalkingProc.exitCode === null) return true;
    if (liveTalkingStarting) return liveTalkingStarting;
    liveTalkingStarting = (async () => {
      try {
        const logPath = path.join(SEEDVC_BASE_DIR, 'broadcaster_runtime.log');
        fs.mkdirSync(SEEDVC_BASE_DIR, { recursive: true });
        const outFd = fs.openSync(logPath, 'a');
        const activeGeminiKey = await resolveActiveGeminiApiKey();
        const proc = spawn(SEEDVC_PYTHON_EXE, [PURE_BROADCASTER_SCRIPT, '--booth', boothKey], {
          cwd: path.join(SEEDVC_BASE_DIR, 'repo'),
          env: buildLtPythonEnv(activeGeminiKey),
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
        await new Promise((r) => setTimeout(r, 3500));
        return Boolean(liveTalkingProc && liveTalkingProc === proc && proc.exitCode === null);
      } catch {
        return false;
      } finally {
        liveTalkingStarting = null;
      }
    })();
    return liveTalkingStarting;
  }

  const baseUrl = getEffectiveLiveTalkingUrl() || 'http://127.0.0.1:8010';
  if (await isHttpListening(baseUrl)) return true;
  if (liveTalkingStarting) return liveTalkingStarting;

  liveTalkingStarting = (async () => {
    try {
      await ensureAvatarPrepared().catch(() => {});
      const logPath = path.join(LT_BASE_DIR, 'livetalking_runtime.log');
      const outFd = fs.openSync(logPath, 'a');
      const profile = readHostProfile();

      let ttsPlugin = 'edgetts';
      let refVoice = 'en-PH-RosaNeural';
      if (profile.voicePreset === 'gemini_clone' && profile.geminiVoiceId) {
        ttsPlugin = 'geminiclone';
        refVoice = profile.geminiVoiceId;
      } else if (profile.voicePreset === 'ph_female_tl') {
        ttsPlugin = 'edgetts';
        refVoice = 'fil-PH-BlessicaNeural';
      }

      const args = [
        'app.py',
        '--model', 'wav2lip',
        '--avatar_id', 'vv_host',
        '--transport', 'rtcpush',
        '--push_url', `http://127.0.0.1:8889/${encodeURIComponent(boothKey)}/whip`,
        '--tts', ttsPlugin,
        '--REF_FILE', refVoice,
        '--max_session', '1',
        '--batch_size', '8',
        '--listenport', '8010'
      ];

      const activeGeminiKey = await resolveActiveGeminiApiKey();

      const proc = spawn(LT_PYTHON_EXE, args, {
        cwd: LT_REPO_DIR,
        env: buildLtPythonEnv(activeGeminiKey),
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

      for (let i = 0; i < 60; i++) {
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
    const pid = liveTalkingProc.pid;
    try {
      if (process.platform === 'win32' && pid) {
        execFile('taskkill', ['/PID', String(pid), '/T', '/F'], () => {});
      }
      liveTalkingProc.kill('SIGTERM');
    } catch {}
    liveTalkingProc = null;
  }
}

async function restartActiveLiveTalkingIfNeeded(): Promise<void> {
  const activeEntry = Array.from(runtimes.entries()).find(([, rt]) => rt.active);
  if (activeEntry && liveTalkingProc) {
    stopLiveTalkingProcess();
    await new Promise((r) => setTimeout(r, 800));
    await ensureLiveTalkingStarted(activeEntry[0]);
  }
}

function guessMediaExt(mimeType: string, rawPrefix: string): { isVideo: boolean; ext: string } {
  const hint = `${mimeType} ${rawPrefix}`.toLowerCase();
  if (hint.includes('webm') && hint.includes('video')) return { isVideo: true, ext: '.webm' };
  if (hint.includes('quicktime') || hint.includes('video/mov')) return { isVideo: true, ext: '.mov' };
  if (hint.includes('video/')) return { isVideo: true, ext: '.mp4' };
  if (hint.includes('webp')) return { isVideo: false, ext: '.webp' };
  if (hint.includes('jpeg') || hint.includes('jpg')) return { isVideo: false, ext: '.jpg' };
  return { isVideo: false, ext: '.png' };
}

async function bakeHostAvatar(mediaPath: string, isVideo: boolean, previewOut?: string): Promise<void> {
  if (!isVideo) {
    await bakeFittedStudioFramesFromPhoto(mediaPath);
  }
  if (isPureGeminiClone3Installed()) {
    if (isVideo) {
      fs.mkdirSync(PURE_GEMINI_CLIPS_DIR, { recursive: true });
      const outClip = path.join(PURE_GEMINI_CLIPS_DIR, `clip_${Date.now()}.mp4`);
      await execFileAsync(
        SEEDVC_PYTHON_EXE,
        [CONVERT_GEMINI_UPLOAD_SCRIPT, mediaPath, outClip, previewOut || CUSTOM_HOST_IMG],
        {
          cwd: path.join(SEEDVC_BASE_DIR, 'repo'),
          env: buildLtPythonEnv(),
          timeout: 180000
        }
      );
      if (fs.existsSync(previewOut || CUSTOM_HOST_IMG)) {
        await bakeFittedStudioFramesFromPhoto(previewOut || CUSTOM_HOST_IMG).catch(() => {});
      }
      writeHostProfile({ avatarType: 'video', voicePreset: 'clone3_exact' });
    } else {
      writeHostProfile({ avatarType: 'photo' });
    }
    await restartActiveLiveTalkingIfNeeded().catch(() => {});
    return;
  }

  if (!fs.existsSync(LT_PREPARE_SCRIPT) || !fs.existsSync(LT_PYTHON_EXE)) {
    throw new Error('AI Host Python environment not installed on server');
  }
  const args = [LT_PREPARE_SCRIPT, mediaPath, 'vv_host'];
  if (previewOut) args.push(previewOut);
  await execFileAsync(LT_PYTHON_EXE, args, {
    cwd: LT_REPO_DIR,
    env: buildLtPythonEnv(),
    timeout: 60000
  });
  writeHostProfile({ avatarType: isVideo ? 'video' : 'photo' });
}

export async function updateAiHostMedia(
  mediaBase64: string,
  mimeType = ''
): Promise<{ ok: boolean; avatarUrl?: string; avatarType?: 'video' | 'photo'; error?: string }> {
  let tmpMediaPath = '';
  try {
    const rawStr = String(mediaBase64 || '').trim();
    const headerMatch = rawStr.match(/^data:([^;]+);base64,/i);
    const cleanB64 = rawStr.replace(/^data:[^;]+;base64,/i, '').trim();
    if (!cleanB64) return { ok: false, error: 'mediaBase64 is required' };
    const { isVideo, ext } = guessMediaExt(mimeType, headerMatch?.[1] || '');
    const buf = Buffer.from(cleanB64, 'base64');
    const maxBytes = isVideo ? 24 * 1024 * 1024 : 10 * 1024 * 1024;
    if (buf.length < 400 || buf.length > maxBytes) {
      return {
        ok: false,
        error: isVideo
          ? 'Video size must be under 24 MB (recommended: 8–12s MP4 clip).'
          : 'Photo size must be between 1 KB and 10 MB.'
      };
    }

    const dir = path.dirname(CUSTOM_HOST_IMG);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    if (isVideo) {
      tmpMediaPath = path.join(os.tmpdir(), `vv_host_upload_${Date.now()}${ext}`);
      fs.writeFileSync(tmpMediaPath, buf);
      await bakeHostAvatar(tmpMediaPath, true, CUSTOM_HOST_IMG);
    } else {
      fs.writeFileSync(CUSTOM_HOST_IMG, buf);
      await bakeHostAvatar(CUSTOM_HOST_IMG, false);
    }

    return {
      ok: true,
      avatarType: isVideo ? 'video' : 'photo',
      avatarUrl: '/assets/models/custom_ai_host.png?t=' + Date.now()
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to bake host video/photo avatar' };
  } finally {
    if (tmpMediaPath) {
      try { fs.unlinkSync(tmpMediaPath); } catch {}
    }
  }
}

export async function updateAiHostSinglePhoto(imageBase64: string) {
  return updateAiHostMedia(imageBase64, 'image/png');
}

export async function captureAiHostFromLiveBooth(
  boothId: string
): Promise<{ ok: boolean; avatarUrl?: string; avatarType?: 'video'; error?: string }> {
  const key = normBooth(boothId);
  const hlsDir = path.join(process.cwd(), 'public', 'live_hls', key);
  const tmpDir = path.join(os.tmpdir(), `vv_live_cap_${Date.now()}`);
  try {
    if (!fs.existsSync(hlsDir)) {
      return { ok: false, error: 'Abhi live HLS stream active nahi hai. 10-second host video directly upload karein.' };
    }
    const segs = fs
      .readdirSync(hlsDir)
      .filter((n) => /\.m2ts$/i.test(n))
      .map((n) => ({ name: n, full: path.join(hlsDir, n), mtime: fs.statSync(path.join(hlsDir, n)).mtimeMs }))
      .sort((a, b) => a.mtime - b.mtime)
      .slice(-6);
    if (segs.length === 0) {
      return { ok: false, error: 'Live video segments available nahi hain. Pehle 10s host video upload karein.' };
    }
    if (!fs.existsSync(FFMPEG_EXE_PATH)) {
      return { ok: false, error: 'ffmpeg-static missing on server' };
    }

    fs.mkdirSync(tmpDir, { recursive: true });
    const listLines: string[] = [];
    for (let i = 0; i < segs.length; i++) {
      const dst = path.join(tmpDir, `seg_${i}.m2ts`);
      fs.copyFileSync(segs[i].full, dst);
      listLines.push(`file '${dst.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`);
    }
    const listFile = path.join(tmpDir, 'concat.txt');
    const capMp4 = path.join(tmpDir, 'capture.mp4');
    fs.writeFileSync(listFile, listLines.join('\n'), 'utf8');

    await execFileAsync(
      FFMPEG_EXE_PATH,
      ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-t', '10', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-an', capMp4],
      { timeout: 60000 }
    );

    await bakeHostAvatar(capMp4, true, CUSTOM_HOST_IMG);

    return { ok: true, avatarType: 'video', avatarUrl: '/assets/models/custom_ai_host.png?t=' + Date.now() };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Live host capture failed' };
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

export async function setAiHostVoicePreset(
  voicePreset: string
): Promise<{ ok: boolean; profile?: HostProfile; error?: string }> {
  const vp = String(voicePreset || '').trim() as AiHostVoicePreset;
  if (vp !== 'clone3_exact' && vp !== 'ph_female_en' && vp !== 'ph_female_tl' && vp !== 'gemini_clone') {
    return { ok: false, error: 'Invalid voicePreset. Allowed: clone3_exact, ph_female_en, ph_female_tl, gemini_clone' };
  }
  const cur = readHostProfile();
  if (vp === 'gemini_clone' && !cur.geminiVoiceId) {
    return { ok: false, error: 'Pehle real host ki voice clone karein (15s speaking sample + consent clip).' };
  }
  const profile = writeHostProfile({ voicePreset: vp });
  await restartActiveLiveTalkingIfNeeded();
  return { ok: true, profile };
}

async function convertAudioB64ToWav24k(audioBase64: string, prefix: string, workDir: string): Promise<string> {
  const rawStr = String(audioBase64 || '').trim();
  const mimeMatch = rawStr.match(/^data:([^;]+);base64,/i);
  const cleanB64 = rawStr.replace(/^data:[^;]+;base64,/i, '').trim();
  if (!cleanB64) throw new Error(`${prefix} audio is required`);
  const buf = Buffer.from(cleanB64, 'base64');
  if (buf.length < 400 || buf.length > 20 * 1024 * 1024) {
    throw new Error(`${prefix} audio size must be between 1 KB and 20 MB`);
  }
  const mime = (mimeMatch?.[1] || '').toLowerCase();
  const inExt = mime.includes('webm') ? '.webm' : mime.includes('mp4') || mime.includes('m4a') ? '.m4a' : mime.includes('mpeg') || mime.includes('mp3') ? '.mp3' : mime.includes('ogg') ? '.ogg' : '.wav';
  const inPath = path.join(workDir, `${prefix}_in${inExt}`);
  const wavPath = path.join(workDir, `${prefix}_24k.wav`);
  fs.writeFileSync(inPath, buf);

  if (!fs.existsSync(FFMPEG_EXE_PATH)) {
    if (inExt === '.wav') return inPath;
    throw new Error('ffmpeg-static missing for audio conversion');
  }
  await execFileAsync(
    FFMPEG_EXE_PATH,
    ['-y', '-i', inPath, '-ar', '24000', '-ac', '1', '-c:a', 'pcm_s16le', wavPath],
    { timeout: 30000 }
  );
  return wavPath;
}

export async function cloneAiHostVoiceWithGemini(
  sourceAudioBase64: string,
  consentAudioBase64: string,
  displayName = 'Vintage Vibes Filipina Host'
): Promise<{ ok: boolean; voiceId?: string; displayName?: string; error?: string }> {
  const apiKey = await resolveActiveGeminiApiKey();
  if (!apiKey) {
    return { ok: false, error: 'GEMINI_API_KEY Global Setup ya server .env par configured nahi hai.' };
  }
  const tmpDir = path.join(os.tmpdir(), `vv_voice_clone_${Date.now()}`);
  try {
    fs.mkdirSync(tmpDir, { recursive: true });
    const srcWav = await convertAudioB64ToWav24k(sourceAudioBase64, 'source', tmpDir);
    const conWav = await convertAudioB64ToWav24k(consentAudioBase64, 'consent', tmpDir);
    const srcB64 = fs.readFileSync(srcWav).toString('base64');
    const conB64 = fs.readFileSync(conWav).toString('base64');
    const cleanName = String(displayName || 'Vintage Vibes Filipina Host').trim().slice(0, 80);

    const resp = await fetch('https://generativelanguage.googleapis.com/v1beta/voices', {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        store: true,
        voice: {
          model: 'gemini-3.8-flash-tts',
          type: 'replicated',
          display_name: cleanName,
          replicated: {
            source_audio: { mime_type: 'audio/wav', data: srcB64 },
            consent_audio: { mime_type: 'audio/wav', data: conB64 }
          }
        }
      }),
      signal: AbortSignal.timeout(45000)
    });

    const data: any = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const msg = data?.error?.message || data?.message || `HTTP ${resp.status}`;
      return { ok: false, error: `Gemini Voice Replication failed: ${msg}` };
    }
    const voiceId = String(data?.id || data?.voice?.id || '').trim();
    if (!voiceId) {
      return { ok: false, error: 'Gemini did not return a voice id.' };
    }

    writeHostProfile({
      geminiVoiceId: voiceId,
      hostName: cleanName,
      voicePreset: 'gemini_clone'
    });
    await restartActiveLiveTalkingIfNeeded();

    return { ok: true, voiceId, displayName: cleanName };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Voice clone failed' };
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

function buildShowcaseScripts(piece: LivePinnedPiece, voicePreset: AiHostVoicePreset = 'ph_female_en') {
  const meas = [
    piece.pitToPitInches ? `Chest ${piece.pitToPitInches}"` : '',
    piece.lengthInches ? `Length ${piece.lengthInches}"` : ''
  ]
    .filter(Boolean)
    .join(' • ');
  const en =
    voicePreset === 'ph_female_tl'
      ? `Hello mga sis! Welcome sa Vintage Vibes Live! Tingnan niyo ito, super ganda: ${piece.title}` +
        (piece.size ? `, Size ${piece.size}` : '') +
        (meas ? `, ${meas}` : '') +
        `. Only ${piece.priceAed} Dirhams lang! Tap Bid or comment Mine ${piece.priceAed} na, sis!`
      : `Hello guys! Welcome to Vintage Vibes Live! Look at this gorgeous piece: ${piece.title}` +
        (piece.size ? `, Size ${piece.size}` : '') +
        (meas ? `, ${meas}` : '') +
        `. Only ${piece.priceAed} Dirhams! Tap Bid or comment Mine ${piece.priceAed} right now, sis!`;
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

  const scripts = buildShowcaseScripts(pinned, readHostProfile().voicePreset);
  rt.currentPiece = pinned;
  rt.currentScriptEn = scripts.en;
  rt.currentScriptAr = scripts.ar;

  setBoothPinnedPiece(key, pinned);

  if (isPureGeminiClone3Installed()) {
    try {
      fs.mkdirSync(SEEDVC_BASE_DIR, { recursive: true });
      fs.writeFileSync(
        path.join(SEEDVC_BASE_DIR, `active_piece_${key}.json`),
        JSON.stringify({ ...pinned, scriptEn: scripts.en }, null, 2),
        'utf8'
      );
    } catch {}
  }

  // Keep exact ERP retail price (no automatic 30% discount auction override)
  const curAuc = whatnotAuctionEngine.getAuction(key);
  if (curAuc.status !== 'IDLE') {
    whatnotAuctionEngine.resetAuction(key);
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
  rt.cycleSec = Math.min(600, Math.max(15, Math.round(Number(opts.cycleSec || 60))));
  rt.active = true;
  rt.startedAt = new Date().toISOString();
  rt.piecesShown = 0;

  await advanceBoothPiece(key);

  if (isLiveTalkingInstalled()) {
    await ensureLiveTalkingStarted(key).catch(() => false);
  }

  // Automatically multistream AI Host Live Video + Audio to YouTube Live & Facebook Live too!
  startAiSocialMultistream(key).catch(() => {});

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
  const wasActive = rt.active;
  rt.active = false;
  rt.currentPiece = null;
  stopAiSocialMultistream(key);
  try {
    whatnotAuctionEngine.resetAuction(key);
  } catch {}
  const anyOtherActive = Array.from(runtimes.values()).some((r) => r.active);
  if (!anyOtherActive) {
    stopLiveTalkingProcess();
  }
  if (wasActive) {
    // Starts the 1-hour post-live shown rack retention window & clears ON AIR
    markBoothLiveEnded(key);
  }
  return { ok: true, status: getAiNightHostStatus(key) };
}

registerAiHostStateHooks({
  isActive: (boothId: string) => Boolean(runtimes.get(normBooth(boothId))?.active),
  stop: (boothId: string) => {
    stopAiNightHost(boothId);
  }
});

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
  const profile = readHostProfile();
  const pureReady = isPureGeminiClone3Installed();
  const liveTalkingInstalled = isLiveTalkingInstalled();
  const liveTalkingConfigured = pureReady || Boolean(getEffectiveLiveTalkingUrl());
  return {
    boothId: key,
    active: rt.active,
    mode: liveTalkingConfigured ? 'LIVETALKING_AVATAR' : 'STUDIO_SHOWCASE',
    liveTalkingConfigured,
    liveTalkingInstalled,
    liveTalkingRunning: Boolean(liveTalkingProc && liveTalkingProc.exitCode === null),
    avatarUrl: getActiveHostAvatarUrl(),
    avatarStudioUrl: getActiveHostStudio16x9Url(),
    avatarType: profile.avatarType,
    avatarEngine: pureReady ? 'pure_gemini_clone3' : 'wav2lip',
    clone3Ready: pureReady,
    voicePreset: profile.voicePreset,
    geminiVoiceCloned: Boolean(profile.geminiVoiceId),
    geminiVoiceId: profile.geminiVoiceId ? `${profile.geminiVoiceId.slice(0, 10)}...` : '',
    hostName: profile.hostName,
    cycleSec: rt.cycleSec,
    piecesShown: rt.piecesShown,
    currentSku: rt.currentPiece?.sku || '',
    currentPiece: rt.currentPiece,
    currentScriptEn: rt.currentScriptEn,
    currentScriptAr: rt.currentScriptAr,
    startedAt: rt.startedAt
  };
}
