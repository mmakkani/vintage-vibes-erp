import path from 'path';
import fs from 'fs';
import os from 'os';
import { EventEmitter } from 'events';
import pino from 'pino';
import QRCode from 'qrcode';
import sharp from 'sharp';
import * as BaileysPkg from '@whiskeysockets/baileys';
import makeWASocketDefault, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  delay,
  Browsers
} from '@whiskeysockets/baileys';

const makeWASocket: typeof makeWASocketDefault =
  typeof makeWASocketDefault === 'function'
    ? makeWASocketDefault
    : typeof (BaileysPkg as any)?.makeWASocket === 'function'
      ? (BaileysPkg as any).makeWASocket
      : typeof (BaileysPkg as any)?.default?.makeWASocket === 'function'
        ? (BaileysPkg as any).default.makeWASocket
        : typeof (BaileysPkg as any)?.default?.default === 'function'
          ? (BaileysPkg as any).default.default
          : (makeWASocketDefault as any);

// Self-healing patch to ensure WhatsApp Channel newsletter media upload utilizes /m1/ CDN routing
function ensureBaileysNewsletterPatched() {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) return;
  try {
    const baileysDir = path.join(process.cwd(), 'node_modules', '@whiskeysockets', 'baileys');
    if (!fs.existsSync(baileysDir)) return;

    // 1. Defaults/index.js
    const defaultsPath = path.join(baileysDir, 'lib', 'Defaults', 'index.js');
    if (fs.existsSync(defaultsPath)) {
      let defaultsContent = fs.readFileSync(defaultsPath, 'utf8');
      if (!defaultsContent.includes('NEWSLETTER_MEDIA_PATH_MAP')) {
        defaultsContent = defaultsContent.replace(
          /export const MEDIA_PATH_MAP = \{[\s\S]*?\};/,
          (match) => `${match}\nexport const NEWSLETTER_MEDIA_PATH_MAP = {\n    image: '/newsletter/newsletter-image',\n    video: '/newsletter/newsletter-video',\n    document: '/newsletter/newsletter-document',\n    audio: '/newsletter/newsletter-audio',\n    sticker: '/newsletter/newsletter-image',\n    'thumbnail-link': '/newsletter/newsletter-thumbnail-link'\n};`
        );
        fs.writeFileSync(defaultsPath, defaultsContent, 'utf8');
      }
    }

    // 2. Utils/messages-media.js
    const mediaPath = path.join(baileysDir, 'lib', 'Utils', 'messages-media.js');
    if (fs.existsSync(mediaPath)) {
      let mediaContent = fs.readFileSync(mediaPath, 'utf8');
      let changed = false;
      if (!mediaContent.includes('NEWSLETTER_MEDIA_PATH_MAP')) {
        mediaContent = mediaContent.replace('MEDIA_PATH_MAP }', 'MEDIA_PATH_MAP, NEWSLETTER_MEDIA_PATH_MAP }');
        changed = true;
      }
      if (!mediaContent.includes('newsletter ? NEWSLETTER_MEDIA_PATH_MAP')) {
        mediaContent = mediaContent.replace(
          'async (filePath, { mediaType, fileEncSha256B64, timeoutMs }) =>',
          'async (filePath, { mediaType, fileEncSha256B64, timeoutMs, newsletter }) =>'
        );
        mediaContent = mediaContent.replace(
          'const url = `https://${hostname}${MEDIA_PATH_MAP[mediaType]}/${fileEncSha256B64}?auth=${auth}&token=${fileEncSha256B64}`;',
          'const pathMap = newsletter ? NEWSLETTER_MEDIA_PATH_MAP : MEDIA_PATH_MAP;\n            const targetPath = (pathMap && pathMap[mediaType]) || MEDIA_PATH_MAP[mediaType];\n            const url = `https://${hostname}${targetPath}/${fileEncSha256B64}?auth=${auth}&token=${fileEncSha256B64}`;'
        );
        changed = true;
      }
      if (changed) {
        fs.writeFileSync(mediaPath, mediaContent, 'utf8');
      }
    }

    // 3. Utils/messages.js
    const msgsPath = path.join(baileysDir, 'lib', 'Utils', 'messages.js');
    if (fs.existsSync(msgsPath)) {
      let msgsContent = fs.readFileSync(msgsPath, 'utf8');
      if (!msgsContent.includes('newsletterDirectPath')) {
        msgsContent = msgsContent.replace(
          /const \{ mediaUrl, directPath \} = await options\.upload\(filePath, \{[\s\S]*?\}\);[\s\S]*?await fs\.unlink\(filePath\);/,
          `const { mediaUrl, directPath } = await options.upload(filePath, {\n            fileEncSha256B64: fileSha256B64,\n            mediaType: mediaType,\n            timeoutMs: options.mediaUploadTimeoutMs,\n            newsletter: isNewsletter\n        });\n        await fs.unlink(filePath);\n        const newsletterDirectPath = directPath ? directPath.replace(/^\\/o1\\//, '/m1/') : directPath;\n        const newsletterMediaUrl = mediaUrl ? mediaUrl.replace('/o1/', '/m1/') : mediaUrl;`
        );
        msgsContent = msgsContent.replace('url: mediaUrl,', 'url: newsletterMediaUrl,');
        msgsContent = msgsContent.replace('directPath,', 'directPath: newsletterDirectPath,');
        fs.writeFileSync(msgsPath, msgsContent, 'utf8');
      }
    }
  } catch (patchErr: any) {
    console.warn('[Baileys] Auto-patch notice:', patchErr?.message);
  }
}
ensureBaileysNewsletterPatched();

import { getPgClient } from '../../db/pgPool.ts';
import { transcribeVoiceWithMultiEngine } from '../../server/ustadShagirdAiEngine.ts';

export interface BaileysLiveSession {
  userId: string;
  phoneNumber?: string;
  pairingCode?: string;
  qrCode?: string; // Raw string
  qrCodeDataUrl?: string; // Real-time base64 data URL
  status: 'DISCONNECTED' | 'CONNECTING' | 'WAITING_QR' | 'WAITING_PAIRING' | 'CONNECTED';
  lastActive?: string;
  connectedAt?: string;
  isHandshaking?: boolean;
  sock?: any;
  lastError?: string;
  contacts?: Map<string, { id: string; name: string; phone: string }>;
}

const PRIMARY_SESSION_KEY = 'usr-admin-1';
const PG_AUTH_BACKUP_ID = 'baileys_auth_backup';

class BaileysManager extends EventEmitter {
  private sessions: Map<string, BaileysLiveSession> = new Map();
  private authBaseDir: string;
  private logger = pino({ level: 'silent' });
  private pgBackupTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private botSentMsgIds: Set<string> = new Set();
  private lastBotSendAt: Map<string, number> = new Map();
  private inFlightBotSends = 0;
  private recentBotCaptions: Set<string> = new Set();
  private whisperPipePromise: Promise<any> | null = null;

  private markBotSent(jid: string, res?: any, textContent?: string) {
    const now = Date.now();
    this.lastBotSendAt.set(jid, now);
    this.lastBotSendAt.set(jid.split('@')[0], now);
    this.lastBotSendAt.set('__GLOBAL__', now);
    if (textContent && typeof textContent === 'string') {
      const cleanSnippet = textContent.trim().slice(0, 120);
      if (cleanSnippet) {
        this.recentBotCaptions.add(cleanSnippet);
        if (this.recentBotCaptions.size > 300) {
          const firstCap = this.recentBotCaptions.values().next().value;
          if (firstCap) this.recentBotCaptions.delete(firstCap);
        }
      }
    }
    const msgId = res?.key?.id;
    if (msgId) {
      this.botSentMsgIds.add(msgId);
      if (this.botSentMsgIds.size > 1000) {
        const first = this.botSentMsgIds.values().next().value;
        if (first) this.botSentMsgIds.delete(first);
      }
    }
  }

  private async getWhisperPipeline(): Promise<any> {
    if (!this.whisperPipePromise) {
      this.whisperPipePromise = (async () => {
        try {
          const modName = '@xenova/transformers';
          const transformers: any = await import(/* @vite-ignore */ modName);
          const pipe = await transformers.pipeline('automatic-speech-recognition', 'Xenova/whisper-base');
          console.log('[Baileys Voice AI] Local Whisper-base speech recognition engine ready.');
          return pipe;
        } catch (err: any) {
          console.warn('[Baileys Voice AI] Local Whisper init notice:', err?.message);
          this.whisperPipePromise = null;
          return null;
        }
      })();
    }
    return this.whisperPipePromise;
  }

  private async transcribeVoiceBuffer(mediaBuf: Buffer): Promise<string> {
    if (!Buffer.isBuffer(mediaBuf) || mediaBuf.length === 0) return '';

    // Stage 1: Try Level-7 Multi-Engine Transcriber (Groq Whisper-Large-V3-Turbo + Gemini Native Audio)
    try {
      const cloudText = await transcribeVoiceWithMultiEngine(mediaBuf, 'audio/ogg');
      if (cloudText && cloudText.trim().length > 0) {
        return cloudText.trim();
      }
    } catch (multiErr: any) {
      console.warn('[Baileys Voice AI] Multi-engine notice:', multiErr?.message);
    }

    // Stage 2: Local Offline Whisper-base via FFmpeg + @xenova/transformers
    const tmpId = `wa_audio_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const tmpIn = path.join(os.tmpdir(), `${tmpId}.ogg`);
    const tmpOut = path.join(os.tmpdir(), `${tmpId}.pcm`);
    try {
      fs.writeFileSync(tmpIn, mediaBuf);
      let ffmpegBin = 'ffmpeg';
      try {
        const ffStatic = require('ffmpeg-static');
        if (typeof ffStatic === 'string' && fs.existsSync(ffStatic)) {
          ffmpegBin = ffStatic;
        }
      } catch {}
      const { execFileSync } = require('child_process');
      execFileSync(ffmpegBin, ['-y', '-i', tmpIn, '-f', 'f32le', '-acodec', 'pcm_f32le', '-ar', '16000', '-ac', '1', tmpOut], {
        stdio: 'ignore',
        timeout: 10000
      });
      if (!fs.existsSync(tmpOut)) return '';
      const pcmBuf = fs.readFileSync(tmpOut);
      const float32Data = new Float32Array(pcmBuf.buffer, pcmBuf.byteOffset, Math.floor(pcmBuf.byteLength / 4));
      if (float32Data.length < 800) return '';

      const transcriber = await Promise.race([
        this.getWhisperPipeline(),
        new Promise<null>(r => setTimeout(() => r(null), 12000))
      ]);
      if (!transcriber) return '';

      const result = await Promise.race([
        transcriber(float32Data, { chunk_length_s: 30, stride_length_s: 5 }),
        new Promise<null>(r => setTimeout(() => r(null), 10000))
      ]);
      const text = String(result?.text || '').trim();
      if (text) {
        console.log(`[Baileys Voice AI] Transcribed voice note (Local Whisper): "${text}"`);
      }
      return text;
    } catch (err: any) {
      console.warn('[Baileys Voice AI] Transcription notice:', err?.message);
      return '';
    } finally {
      try { if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn); } catch {}
      try { if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut); } catch {}
    }
  }

  private async extractVideoFrameAndAudio(videoBuf: Buffer): Promise<{ frameBase64?: string; transcript?: string }> {
    if (!Buffer.isBuffer(videoBuf) || videoBuf.length === 0) return {};
    const tmpId = `wa_vid_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const tmpVid = path.join(os.tmpdir(), `${tmpId}.mp4`);
    const tmpFrame = path.join(os.tmpdir(), `${tmpId}.jpg`);
    try {
      fs.writeFileSync(tmpVid, videoBuf);
      let ffmpegBin = 'ffmpeg';
      try {
        const ffStatic = require('ffmpeg-static');
        if (typeof ffStatic === 'string' && fs.existsSync(ffStatic)) {
          ffmpegBin = ffStatic;
        }
      } catch {}
      const { execFileSync } = require('child_process');
      try {
        execFileSync(ffmpegBin, ['-y', '-ss', '00:00:00.500', '-i', tmpVid, '-frames:v', '1', '-q:v', '2', tmpFrame], {
          stdio: 'ignore',
          timeout: 10000
        });
      } catch {
        try {
          execFileSync(ffmpegBin, ['-y', '-i', tmpVid, '-frames:v', '1', '-q:v', '2', tmpFrame], {
            stdio: 'ignore',
            timeout: 10000
          });
        } catch {}
      }

      let frameBase64: string | undefined;
      if (fs.existsSync(tmpFrame)) {
        const rawFrame = fs.readFileSync(tmpFrame);
        const resized = await sharp(rawFrame).resize(512, 512, { fit: 'inside' }).jpeg({ quality: 80 }).toBuffer();
        frameBase64 = resized.toString('base64');
      }

      const transcript = await this.transcribeVoiceBuffer(videoBuf).catch(() => '');
      return { frameBase64, transcript };
    } catch (err: any) {
      console.warn('[Baileys Video AI] Video frame extraction notice:', err?.message);
      return {};
    } finally {
      try { if (fs.existsSync(tmpVid)) fs.unlinkSync(tmpVid); } catch {}
      try { if (fs.existsSync(tmpFrame)) fs.unlinkSync(tmpFrame); } catch {}
    }
  }

  constructor() {
    super();
    this.setMaxListeners(50);
    const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
    this.authBaseDir = isServerless ? path.join(os.tmpdir(), 'baileys_auth') : path.join(process.cwd(), 'baileys_auth');
    try {
      if (!fs.existsSync(this.authBaseDir)) {
        fs.mkdirSync(this.authBaseDir, { recursive: true });
      }
    } catch (e: any) {
      console.warn('[Baileys] authBaseDir mkdir notice:', e?.message);
    }

    // Auto-connect socket on startup if auth credentials exist on disk OR in PostgreSQL backup
    setTimeout(() => {
      this.bootstrapSavedSessions().catch(err => {
        console.warn('[Baileys] Bootstrap warning:', err?.message);
      });
    }, 800);
  }

  /**
   * Strictly checks if a Baileys creds object has completed device pairing (either QR pair-success or Pairing Code companion_finish).
   * Never returns true for an unconfirmed requestPairingCode() call which only sets creds.me = { id: '...@s.whatsapp.net', name: '~' } without creds.account or ':device'.
   */
  private isTrulyAuthenticatedCreds(creds: any): boolean {
    if (!creds || typeof creds !== 'object') return false;
    return Boolean(
      creds.account ||
      creds.registered === true ||
      (creds.me?.id && String(creds.me.id).includes(':'))
    );
  }

  /**
   * Scan all session_* folders on disk for registered creds.json, or restore from PostgreSQL if disk is empty
   */
  private async bootstrapSavedSessions(): Promise<void> {
    let foundRegisteredOnDisk = false;
    try {
      if (fs.existsSync(this.authBaseDir)) {
        const entries = fs.readdirSync(this.authBaseDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && entry.name.startsWith('session_')) {
            const fullDir = path.join(this.authBaseDir, entry.name);
            const credsPath = path.join(fullDir, 'creds.json');
            if (fs.existsSync(credsPath)) {
              try {
                const raw = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
                if (this.isTrulyAuthenticatedCreds(raw)) {
                  const uId = entry.name.replace(/^session_/, '') || PRIMARY_SESSION_KEY;
                  foundRegisteredOnDisk = true;
                  console.log(`[Baileys] Found verified auth credentials on disk for "${uId}". Auto-connecting socket...`);
                  await this.initSocket(uId);
                  break;
                } else {
                  // Wipe unconfirmed / stale pairing attempt from disk so it never blocks QR scanning
                  fs.rmSync(fullDir, { recursive: true, force: true });
                }
              } catch {}
            }
          }
        }
      }
    } catch (err: any) {
      console.warn('[Baileys] Disk scan notice:', err?.message);
    }

    if (!foundRegisteredOnDisk) {
      const restoredUserId = await this.restoreAuthFromPostgres();
      if (restoredUserId) {
        console.log(`[Baileys] Restored verified auth credentials from PostgreSQL for "${restoredUserId}". Auto-connecting socket...`);
        await this.initSocket(restoredUserId);
      }
    }
  }

  /**
   * Debounced backup of sessionDir JSON files into PostgreSQL whatsapp_gateway_config
   */
  public schedulePostgresBackup(userId: string, sessionDir: string): void {
    if (this.pgBackupTimer) {
      clearTimeout(this.pgBackupTimer);
    }
    this.pgBackupTimer = setTimeout(() => {
      this.backupAuthToPostgres(userId, sessionDir).catch(err => {
        console.warn('[Baileys] PostgreSQL auth backup notice:', err?.message);
      });
    }, 1500);
  }

  private async backupAuthToPostgres(userId: string, sessionDir: string): Promise<void> {
    if (!fs.existsSync(sessionDir)) return;
    const credsPath = path.join(sessionDir, 'creds.json');
    if (!fs.existsSync(credsPath)) return;

    try {
      const credsRaw = fs.readFileSync(credsPath, 'utf8');
      const credsParsed = JSON.parse(credsRaw);
      // Only back up once genuinely paired and authenticated
      if (!this.isTrulyAuthenticatedCreds(credsParsed)) return;

      const filesMap: Record<string, string> = {};
      const allFiles = fs.readdirSync(sessionDir);
      for (const fileName of allFiles) {
        if (!fileName.endsWith('.json')) continue;
        // Include creds.json, app-state-sync-key, pre-key, session, sender-key
        const fullPath = path.join(sessionDir, fileName);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isFile() && stat.size < 256 * 1024) {
            filesMap[fileName] = fs.readFileSync(fullPath, 'utf8');
          }
        } catch {}
      }

      const client = await getPgClient();
      if (!client) return;
      try {
        const backupPayload = {
          userId: userId || PRIMARY_SESSION_KEY,
          phoneNumber: credsParsed?.me?.id ? `+${String(credsParsed.me.id).split(':')[0].split('@')[0]}` : undefined,
          updatedAt: new Date().toISOString(),
          files: filesMap
        };
        await client.query(
          `INSERT INTO whatsapp_gateway_config (id, config, updated_at)
           VALUES ($1, $2::jsonb, NOW())
           ON CONFLICT (id) DO UPDATE SET config = $2::jsonb, updated_at = NOW()`,
          [PG_AUTH_BACKUP_ID, JSON.stringify(backupPayload)]
        );
      } finally {
        await client.end().catch(() => {});
      }
    } catch (err: any) {
      console.warn('[Baileys] backupAuthToPostgres warning:', err?.message);
    }
  }

  private async restoreAuthFromPostgres(): Promise<string | null> {
    const client = await getPgClient();
    if (!client) return null;
    try {
      const res = await client.query('SELECT config FROM whatsapp_gateway_config WHERE id = $1', [PG_AUTH_BACKUP_ID]);
      if (!res.rows || res.rows.length === 0 || !res.rows[0].config) return null;
      const backup = res.rows[0].config;
      const files = backup?.files;
      if (!files || typeof files !== 'object' || !files['creds.json']) return null;

      try {
        const parsedCreds = JSON.parse(files['creds.json']);
        if (!this.isTrulyAuthenticatedCreds(parsedCreds)) {
          await client.query('DELETE FROM whatsapp_gateway_config WHERE id = $1', [PG_AUTH_BACKUP_ID]).catch(() => {});
          return null;
        }
      } catch {
        return null;
      }

      const userId = backup.userId || PRIMARY_SESSION_KEY;
      const sessionDir = path.join(this.authBaseDir, `session_${userId}`);
      if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
      }
      for (const [fileName, content] of Object.entries(files)) {
        if (typeof content === 'string' && fileName.endsWith('.json') && !fileName.includes('..') && !fileName.includes('/') && !fileName.includes('\\')) {
          fs.writeFileSync(path.join(sessionDir, fileName), content, 'utf8');
        }
      }
      return userId;
    } catch (err: any) {
      console.warn('[Baileys] restoreAuthFromPostgres notice:', err?.message);
      return null;
    } finally {
      await client.end().catch(() => {});
    }
  }

  private async clearPostgresBackup(): Promise<void> {
    const client = await getPgClient();
    if (!client) return;
    try {
      await client.query('DELETE FROM whatsapp_gateway_config WHERE id = $1', [PG_AUTH_BACKUP_ID]);
    } catch {} finally {
      await client.end().catch(() => {});
    }
  }

  /**
   * Resolve session for userId, falling back to any active connected or pairing session
   * so all ERP tabs and operators share the connected Dubai WhatsApp gateway seamlessly.
   */
  public getSession(userId?: string): BaileysLiveSession | undefined {
    if (userId) {
      const direct = this.sessions.get(userId);
      if (direct && (direct.status === 'CONNECTED' || direct.status === 'WAITING_QR' || direct.status === 'WAITING_PAIRING' || direct.isHandshaking)) {
        return direct;
      }
    }
    const connected = this.getConnectedSession();
    if (connected) return connected;
    if (userId && this.sessions.has(userId)) return this.sessions.get(userId);
    const primary = this.sessions.get(PRIMARY_SESSION_KEY);
    if (primary) return primary;
    for (const s of this.sessions.values()) {
      return s;
    }
    return undefined;
  }

  /**
   * Start or restart a real Baileys socket for a user.
   * If phoneNumber is passed, it requests an authentic 8-character pairing code from WhatsApp servers.
   * If phoneNumber is not passed, it emits genuine QR codes for camera scanning.
   */
  public async initSocket(
    requestedUserId: string,
    phoneNumber?: string,
    options?: {
      isHandshakeReconnect?: boolean;
      isAutoReconnect?: boolean;
      forceFreshQr?: boolean;
      existingAuthState?: { state: any; saveCreds: () => Promise<void> };
    }
  ): Promise<BaileysLiveSession> {
    // Check if any session_* folder on disk already has genuinely paired credentials
    let registeredDiskUserId: string | undefined;
    try {
      if (fs.existsSync(this.authBaseDir)) {
        const entries = fs.readdirSync(this.authBaseDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && entry.name.startsWith('session_')) {
            const cPath = path.join(this.authBaseDir, entry.name, 'creds.json');
            if (fs.existsSync(cPath)) {
              const raw = JSON.parse(fs.readFileSync(cPath, 'utf8'));
              if (this.isTrulyAuthenticatedCreds(raw)) {
                registeredDiskUserId = entry.name.replace(/^session_/, '');
                break;
              }
            }
          }
        }
      }
    } catch {}

    const userId = registeredDiskUserId
      ? registeredDiskUserId
      : this.sessions.has(requestedUserId)
      ? requestedUserId
      : this.sessions.has(PRIMARY_SESSION_KEY)
      ? PRIMARY_SESSION_KEY
      : requestedUserId || PRIMARY_SESSION_KEY;

    const existing = this.sessions.get(userId);
    // Protect active 515 QR scan handshake or already-connected session from being interrupted by duplicate generate-qr calls
    if (existing && !options?.isHandshakeReconnect && !options?.isAutoReconnect) {
      if (existing.isHandshaking) {
        console.log(`[Baileys] Ignoring duplicate initSocket for ${userId}: QR scan handshake is finalizing.`);
        return existing;
      }
      if (existing.status === 'CONNECTED' && existing.sock?.user && !existing.sock?.ws?.isClosed) {
        return existing;
      }
      if (registeredDiskUserId && existing.status === 'CONNECTING' && existing.sock && !existing.sock?.ws?.isClosed) {
        return existing;
      }
    }

    const prevTimer = this.reconnectTimers.get(userId);
    if (prevTimer) {
      clearTimeout(prevTimer);
      this.reconnectTimers.delete(userId);
    }

    if (existing?.sock) {
      try {
        existing.sock.ev?.removeAllListeners();
        existing.sock.end?.(undefined);
      } catch {}
    }

    const sessionDir = path.join(this.authBaseDir, `session_${userId}`);
    try {
      if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
      }
    } catch (e: any) {
      console.warn('[Baileys] sessionDir mkdir notice:', e?.message);
    }

    // Check if existing creds on disk are genuinely paired (NOT an unconfirmed pairing code request)
    let isRegisteredOnDisk = false;
    const credsFile = path.join(sessionDir, 'creds.json');
    if (fs.existsSync(credsFile)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(credsFile, 'utf8'));
        isRegisteredOnDisk = this.isTrulyAuthenticatedCreds(parsed);
      } catch {}
    }

    const isCurrentlyConnected = existing?.status === 'CONNECTED' && Boolean(existing?.sock?.user);

    // NEVER wipe sessionDir if isRegisteredOnDisk is true or during 515 handshake reconnect!
    // ALWAYS wipe unauthenticated/partial noise keys & abandoned pairing code creds when starting fresh QR or new pairing code!
    if (!isRegisteredOnDisk && !isCurrentlyConnected && !options?.isHandshakeReconnect) {
      try {
        fs.rmSync(sessionDir, { recursive: true, force: true });
        fs.mkdirSync(sessionDir, { recursive: true });
      } catch {}
    }

    const { state, saveCreds } =
      options?.isHandshakeReconnect && options?.existingAuthState
        ? options.existingAuthState
        : await useMultiFileAuthState(sessionDir);

    // Use native Baileys WhatsApp Web protocol version directly with zero network delay (prevents 515 QR handshake timeout!)
    const version: [number, number, number] = [2, 3000, 1043857760];

    const sessionObj: BaileysLiveSession = {
      userId,
      phoneNumber: phoneNumber
        ? phoneNumber.startsWith('+')
          ? phoneNumber
          : `+${phoneNumber.replace(/\D/g, '')}`
        : isRegisteredOnDisk || options?.isHandshakeReconnect
        ? existing?.phoneNumber
        : undefined,
      status: phoneNumber ? 'WAITING_PAIRING' : 'CONNECTING',
      lastActive: options?.isHandshakeReconnect
        ? 'Phone scanned! Finalizing secure login with mobile...'
        : phoneNumber
        ? `Requesting Pairing Code for +${phoneNumber.replace(/\D/g, '')}...`
        : 'Connecting to WhatsApp Socket...',
      isHandshaking: Boolean(options?.isHandshakeReconnect),
      pairingCode: undefined,
      qrCode: undefined,
      qrCodeDataUrl: undefined,
      contacts: existing?.contacts || new Map()
    };
    this.sessions.set(userId, sessionObj);
    if (requestedUserId && requestedUserId !== userId) {
      this.sessions.set(requestedUserId, sessionObj);
    }

    // Standard valid desktop client identity requested by WhatsApp protocol
    const sock = makeWASocket({
      version: version as any,
      logger: this.logger,
      auth: state,
      printQRInTerminal: false,
      browser: Browsers.ubuntu('Chrome'),
      syncFullHistory: false,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
      markOnlineOnConnect: true
    });

    sessionObj.sock = sock;

    let lastSaveCredsPromise: Promise<any> = Promise.resolve();
    // Save auth credentials whenever updated to ./baileys_auth AND back up to PostgreSQL once paired
    sock.ev.on('creds.update', () => {
      lastSaveCredsPromise = saveCreds()
        .then(() => {
          if (this.isTrulyAuthenticatedCreds(state?.creds)) {
            this.schedulePostgresBackup(userId, sessionDir);
          }
        })
        .catch((err: any) => {
          console.warn('[Baileys] Credential save warning:', err?.message);
        });
    });

    // Helper to request 8-digit pairing code once noise socket is ready
    let pairingRequested = false;
    const triggerPairingCodeRequest = async () => {
      if (!phoneNumber || this.isTrulyAuthenticatedCreds(state.creds) || pairingRequested) return;
      pairingRequested = true;
      try {
        const cleanPhone = phoneNumber.replace(/\D/g, '');
        console.log(`[Baileys] Requesting authentic WhatsApp pairing code for: +${cleanPhone}`);
        const rawCode = await sock.requestPairingCode(cleanPhone);
        const formatted = rawCode?.length === 8 ? `${rawCode.slice(0, 4)}-${rawCode.slice(4)}` : rawCode;
        sessionObj.pairingCode = formatted;
        sessionObj.phoneNumber = `+${cleanPhone}`;
        sessionObj.status = 'WAITING_PAIRING';
        sessionObj.lastActive = `Official Pairing Code Generated: ${formatted}`;
        console.log(`[Baileys] Authentic Pairing Code Generated: ${formatted}`);
        this.emit('pairingCode', { userId, phoneNumber: cleanPhone, code: formatted });
        this.emit('state.update', sessionObj);
      } catch (err: any) {
        console.warn(`[Baileys] Error requesting pairing code for ${phoneNumber}:`, err?.message);
        sessionObj.lastError = err?.message;
      }
    };

    if (phoneNumber && !this.isTrulyAuthenticatedCreds(state.creds)) {
      setTimeout(() => {
        triggerPairingCodeRequest().catch(() => {});
      }, 2200);
    }

    const contactsCacheFile = path.join(sessionDir, 'contacts-cache.json');
    const resolveCleanPhoneFromId = (rawId: string): string => {
      if (!rawId) return '';
      const base = rawId.split('@')[0].split(':')[0].replace(/\D/g, '');
      if (!base) return '';
      if (rawId.endsWith('@lid') || base.length > 13) {
        const revPath = path.join(sessionDir, `lid-mapping-${base}_reverse.json`);
        if (fs.existsSync(revPath)) {
          try {
            const mapped = JSON.parse(fs.readFileSync(revPath, 'utf8'));
            if (typeof mapped === 'string' && mapped.replace(/\D/g, '').length >= 7) {
              return mapped.replace(/\D/g, '');
            }
          } catch {}
        }
        return ''; // Do not return raw 14-15 digit @lid as a phone number
      }
      return base;
    };

    const recordNamedContact = (rawId: string, rawName?: string) => {
      const cleanPhone = resolveCleanPhoneFromId(rawId);
      const name = (rawName || '').trim();
      if (
        cleanPhone &&
        cleanPhone.length >= 7 &&
        cleanPhone.length <= 13 &&
        name &&
        name !== '~' &&
        !name.toLowerCase().startsWith('whatsapp member')
      ) {
        sessionObj.contacts?.set(cleanPhone, {
          id: `wa-contact-${cleanPhone}`,
          name,
          phone: `+${cleanPhone}`
        });
      }
    };

    const flushContactsCache = () => {
      try {
        if (sessionObj.contacts && sessionObj.contacts.size > 0) {
          fs.writeFileSync(
            contactsCacheFile,
            JSON.stringify(Array.from(sessionObj.contacts.values()), null, 2),
            'utf8'
          );
        }
      } catch {}
    };

    // Load cached contact names from disk if available
    try {
      if (fs.existsSync(contactsCacheFile)) {
        const cachedList = JSON.parse(fs.readFileSync(contactsCacheFile, 'utf8'));
        if (Array.isArray(cachedList)) {
          for (const item of cachedList) {
            if (item?.phone && item?.name) {
              recordNamedContact(item.phone, item.name);
            }
          }
        }
      }
    } catch {}

    // Track genuine contacts synced from WhatsApp account & history sync
    sock.ev.on('messaging-history.set' as any, (historyData: any) => {
      try {
        if (Array.isArray(historyData?.contacts)) {
          for (const c of historyData.contacts) {
            if (!c?.id || c.id.includes('@g.us') || c.id.includes('@newsletter')) continue;
            const cName = c.name || c.fullName || c.firstName || c.notify || c.verifiedName || c.username;
            for (const cid of [c.phoneNumber, c.id, c.lid].filter(Boolean)) {
              recordNamedContact(cid, cName);
            }
          }
        }
        if (Array.isArray(historyData?.chats)) {
          for (const ch of historyData.chats) {
            if (!ch?.id || ch.id.includes('@g.us') || ch.id.includes('@newsletter')) continue;
            const chName = ch.name || ch.pushName || ch.notify;
            for (const cid of [ch.phoneNumber, ch.id, ch.lidJid].filter(Boolean)) {
              recordNamedContact(cid, chName);
            }
          }
        }
        flushContactsCache();
      } catch {}
    });

    sock.ev.on('chats.upsert' as any, (chats: any[]) => {
      if (!Array.isArray(chats)) return;
      for (const ch of chats) {
        if (!ch?.id || ch.id.includes('@g.us') || ch.id.includes('@newsletter')) continue;
        const chName = ch.name || ch.pushName || ch.notify;
        for (const cid of [ch.phoneNumber, ch.id, ch.lidJid].filter(Boolean)) {
          recordNamedContact(cid, chName);
        }
      }
      flushContactsCache();
    });

    sock.ev.on('contacts.upsert', (contacts: any[]) => {
      if (!Array.isArray(contacts)) return;
      for (const c of contacts) {
        if (!c.id || c.id.includes('@g.us') || c.id.includes('@newsletter')) continue;
        const cName = c.name || c.fullName || c.firstName || c.notify || c.verifiedName || c.username;
        for (const cid of [c.phoneNumber, c.id, c.lid].filter(Boolean)) {
          recordNamedContact(cid, cName);
        }
      }
      flushContactsCache();
    });

    sock.ev.on('contacts.update', (updates: any[]) => {
      if (!Array.isArray(updates)) return;
      for (const c of updates) {
        if (!c.id || c.id.includes('@g.us') || c.id.includes('@newsletter')) continue;
        const cName = c.name || c.fullName || c.firstName || c.notify || c.verifiedName || c.username;
        for (const cid of [c.phoneNumber, c.id, c.lid].filter(Boolean)) {
          recordNamedContact(cid, cName);
        }
      }
      flushContactsCache();
    });

    // Handle incoming messages for MINE [SKU] auto-claims & AI Sales Concierge
    sock.ev.on('messages.upsert', async (m: any) => {
      try {
        const { messages, type } = m;
        if (!messages || messages.length === 0) return;

        for (const msg of messages) {
          if (!msg?.key) continue;

          const rawRemoteJid = msg.key.remoteJid || '';
          const altJid = (msg.key as any).remoteJidAlt || (msg.key as any).senderPn || '';
          const remoteJid = (altJid && altJid.endsWith('@s.whatsapp.net')) ? altJid : rawRemoteJid;

          // Always capture pushName from historical/synced messages before skipping old append messages
          if (!msg.key.fromMe && msg.pushName && (remoteJid.endsWith('@s.whatsapp.net') || rawRemoteJid.endsWith('@lid'))) {
            recordNamedContact(remoteJid, msg.pushName);
            flushContactsCache();
          }

          // Skip old historical sync messages (>2 minutes old) when type is 'append'
          const msgTs = Number(msg.messageTimestamp || 0);
          if (type === 'append' && msgTs > 0 && (Date.now() / 1000 - msgTs) > 120) {
            continue;
          }

          if (!remoteJid) continue;

          // Unwrap ephemeral (disappearing), viewOnce, or documentWithCaption message wrappers
          const rawM = msg.message || {};
          const innerMsg =
            rawM.ephemeralMessage?.message ||
            rawM.viewOnceMessage?.message ||
            rawM.viewOnceMessageV2?.message ||
            rawM.documentWithCaptionMessage?.message ||
            rawM.deviceSentMessage?.message ||
            rawM;

          let conversationText =
            innerMsg?.conversation ||
            innerMsg?.extendedTextMessage?.text ||
            innerMsg?.imageMessage?.caption ||
            innerMsg?.videoMessage?.caption ||
            rawM?.conversation ||
            rawM?.extendedTextMessage?.text ||
            '';

          // Check if message is from our connected WhatsApp number (fromMe === true)
          if (msg.key.fromMe) {
            const msgId = msg.key.id || '';
            const bareTarget = remoteJid.split('@')[0];
            const bareRaw = rawRemoteJid.split('@')[0];
            const lastBotTs = Math.max(
              this.lastBotSendAt.get(rawRemoteJid) || 0,
              this.lastBotSendAt.get(remoteJid) || 0,
              this.lastBotSendAt.get(bareTarget) || 0,
              this.lastBotSendAt.get(bareRaw) || 0,
              this.lastBotSendAt.get('__GLOBAL__') || 0
            );
            const cleanSnip = (conversationText || '').trim().slice(0, 120);
            const looksLikeBotFormat = /^(?:Here is our|Yeh rahi|یہ رہی|تفضل هذا|Heto po ang|Ei nin|Yo hernuhos|🛒 \*Checkout Link:\*|🧾 Here is your|🚚 Here is your|🎙️ Here is your|👤 \*Direct Human Chat|✨ \*Welcome to Vintage Vibes|🔥 CLAIM LOCKED)/i.test(cleanSnip);
            const isBotGenerated =
              this.inFlightBotSends > 0 ||
              this.botSentMsgIds.has(msgId) ||
              (Date.now() - lastBotTs < 18000) ||
              (cleanSnip && this.recentBotCaptions.has(cleanSnip)) ||
              looksLikeBotFormat;

            if (!isBotGenerated && (conversationText || innerMsg?.imageMessage || innerMsg?.audioMessage)) {
              let ownerText = conversationText || '';
              if (!ownerText && innerMsg?.audioMessage) {
                try {
                  const dlOwnerFn = (BaileysPkg as any).downloadMediaMessage || (BaileysPkg as any)?.default?.downloadMediaMessage;
                  if (typeof dlOwnerFn === 'function') {
                    const ownerAudioBuf = await dlOwnerFn(msg, 'buffer', {}, { logger: this.logger, reuploadRequest: sock.updateMediaMessage });
                    if (Buffer.isBuffer(ownerAudioBuf) && ownerAudioBuf.length > 0) {
                      ownerText = await this.transcribeVoiceBuffer(ownerAudioBuf);
                    }
                  }
                } catch (ownerAudErr: any) {
                  console.warn('[Baileys] Owner voice note transcription notice:', ownerAudErr?.message);
                }
              }
              console.log(`[Baileys Human Takeover] Owner manually messaged ${remoteJid} from phone: "${ownerText || '[media]'}"`);
              this.emit('owner_manual_message', {
                userId,
                remoteJid: rawRemoteJid,
                phoneJid: remoteJid,
                text: ownerText
              });
            }
            continue;
          }

          if (remoteJid.endsWith('@s.whatsapp.net') || rawRemoteJid.endsWith('@lid')) {
            recordNamedContact(remoteJid, msg.pushName);
            flushContactsCache();
          }

          let customerImageBase64: string | undefined;
          let mediaType: 'TEXT' | 'IMAGE' | 'VOICE' | 'VIDEO' = 'TEXT';
          const dlFn = (BaileysPkg as any).downloadMediaMessage || (BaileysPkg as any)?.default?.downloadMediaMessage;

          if (innerMsg?.imageMessage) {
            mediaType = 'IMAGE';
            try {
              if (typeof dlFn === 'function') {
                const mediaBuf = await dlFn(msg, 'buffer', {}, { logger: this.logger, reuploadRequest: sock.updateMediaMessage });
                if (Buffer.isBuffer(mediaBuf) && mediaBuf.length > 0) {
                  const resizedBuf = await sharp(mediaBuf)
                    .resize(512, 512, { fit: 'inside' })
                    .jpeg({ quality: 80 })
                    .toBuffer();
                  customerImageBase64 = resizedBuf.toString('base64');
                }
              }
            } catch (imgErr: any) {
              console.warn('[Baileys] Customer image download notice:', imgErr?.message);
            }
            if (!conversationText) {
              conversationText = '[Customer sent a photo]';
            }
          } else if (innerMsg?.audioMessage) {
            mediaType = 'VOICE';
            let voiceTranscript = '';
            try {
              if (typeof dlFn === 'function') {
                const audioBuf = await dlFn(msg, 'buffer', {}, { logger: this.logger, reuploadRequest: sock.updateMediaMessage });
                if (Buffer.isBuffer(audioBuf) && audioBuf.length > 0) {
                  voiceTranscript = await this.transcribeVoiceBuffer(audioBuf);
                }
              }
            } catch (audErr: any) {
              console.warn('[Baileys] Customer voice note download notice:', audErr?.message);
            }
            conversationText = voiceTranscript
              ? voiceTranscript
              : '[Customer sent a voice message — greet warmly and ask them to briefly share their question or order inquiry]';
          } else if (innerMsg?.videoMessage) {
            mediaType = 'VIDEO';
            try {
              if (typeof dlFn === 'function') {
                const videoBuf = await dlFn(msg, 'buffer', {}, { logger: this.logger, reuploadRequest: sock.updateMediaMessage });
                if (Buffer.isBuffer(videoBuf) && videoBuf.length > 0) {
                  const { frameBase64, transcript } = await this.extractVideoFrameAndAudio(videoBuf);
                  if (frameBase64) customerImageBase64 = frameBase64;
                  if (transcript) {
                    conversationText = conversationText
                      ? `${conversationText} (Spoken in video: ${transcript})`
                      : transcript;
                  }
                }
              }
            } catch (vidErr: any) {
              console.warn('[Baileys] Customer video download notice:', vidErr?.message);
            }
            if (!conversationText) {
              conversationText = '[Customer sent a video — inspect the video frame and respond helpfully]';
            }
          }

          if (!conversationText) continue;

          const senderName = msg.pushName || remoteJid?.split('@')[0] || 'Customer';
          console.log(`[Baileys Incoming] From ${senderName} (${rawRemoteJid} / ${remoteJid}) [${mediaType}]: "${conversationText}"${customerImageBase64 ? ' [+VISION_FRAME]' : ''}`);

          // Emit incoming message event to core marketing service listener
          this.emit('message', {
            userId,
            remoteJid: rawRemoteJid, // Reply to exact JID (@s.whatsapp.net or @lid) that WhatsApp delivered from
            phoneJid: remoteJid,
            senderName,
            text: conversationText,
            mediaType,
            isVoiceNote: mediaType === 'VOICE',
            isVideoMessage: mediaType === 'VIDEO',
            customerImageBase64,
            rawMsg: msg
          });
        }
      } catch (err: any) {
        console.warn('[Baileys] Error processing messages.upsert:', err?.message);
      }
    });

    // Handle dynamic real-time QR refresh & clean disconnect recovery
    sock.ev.on('connection.update', async (update: any) => {
      const { connection, lastDisconnect, qr, isNewLogin } = update;

      // Immediately handle pair-success (isNewLogin === true) when mobile scans QR or confirms Pairing Code
      if (isNewLogin) {
        console.log(`[Baileys] pair-success (isNewLogin=true) for ${userId}! Flushing credentials to disk...`);
        sessionObj.status = 'CONNECTING';
        sessionObj.isHandshaking = true;
        sessionObj.lastActive = 'Phone scanned! Finalizing secure login with mobile...';
        sessionObj.qrCode = undefined;
        sessionObj.qrCodeDataUrl = undefined;
        if (state?.creds?.me?.id) {
          const clean = String(state.creds.me.id).split(':')[0].split('@')[0];
          if (clean) sessionObj.phoneNumber = `+${clean}`;
        }
        try {
          await lastSaveCredsPromise;
          await saveCreds();
          this.schedulePostgresBackup(userId, sessionDir);
        } catch {}
        this.emit('state.update', sessionObj);
      }

      // If phoneNumber pairing was requested, as soon as QR/noise is ready, trigger pairing code
      if (qr && phoneNumber && !this.isTrulyAuthenticatedCreds(state.creds)) {
        setTimeout(() => {
          triggerPairingCodeRequest().catch(() => {});
        }, 400);
        return;
      }

      // Dynamic Real-Time QR Refresh: immediately convert to base64 data URL
      if (qr && !phoneNumber) {
        if (sessionObj.isHandshaking) {
          console.log('[Baileys] Intermediate QR received during 515 scan handshake - waiting for mobile to finish.');
          return;
        }
        sessionObj.status = 'WAITING_QR';
        sessionObj.lastActive = 'Live QR Ready for Scan';
        sessionObj.qrCode = qr;
        try {
          const dataUrl = await QRCode.toDataURL(qr, {
            margin: 2,
            width: 256,
            errorCorrectionLevel: 'M'
          });
          sessionObj.qrCodeDataUrl = dataUrl;
          this.emit('qr', { userId, qr, dataUrl });
          this.emit('state.update', sessionObj);
        } catch (qrErr: any) {
          console.warn('[Baileys] Error generating QR data URL:', qrErr?.message);
          this.emit('qr', { userId, qr, dataUrl: qr });
          this.emit('state.update', sessionObj);
        }
      }

      if (connection === 'open') {
        sessionObj.status = 'CONNECTED';
        sessionObj.isHandshaking = false;
        sessionObj.pairingCode = undefined;
        sessionObj.qrCode = undefined;
        sessionObj.qrCodeDataUrl = undefined;
        sessionObj.connectedAt = new Date().toISOString();
        sessionObj.lastActive = 'Active Online (Persistent Baileys Connected)';
        sessionObj.lastError = undefined;
        if (sock.user?.id) {
          const clean = String(sock.user.id).split(':')[0].split('@')[0];
          if (clean) sessionObj.phoneNumber = `+${clean}`;
        }
        console.log(`[Baileys] Socket CONNECTED for user ${userId} (${sessionObj.phoneNumber || 'authenticated'})!`);
        this.schedulePostgresBackup(userId, sessionDir);
        this.emit('connection.open', { userId, user: sock.user, phoneNumber: sessionObj.phoneNumber });
        this.emit('state.update', sessionObj);

        if ((sessionObj.contacts?.size || 0) < 50) {
          setTimeout(() => {
            this.resyncWhatsAppContacts(userId).catch(() => {});
          }, 1500);
        }
      }

      // Clean Disconnect & Handshake Recovery
      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const errorMsg = lastDisconnect?.error?.message || '';
        const isConflict = Boolean(errorMsg.toLowerCase().includes('conflict'));
        const isQrTimeout = Boolean(errorMsg.toLowerCase().includes('qr refs'));
        const wasAuthenticated = this.isTrulyAuthenticatedCreds(state?.creds);
        const isLoggedOut = (statusCode === DisconnectReason.loggedOut) && !isConflict && !isQrTimeout && wasAuthenticated;
        const isRestartRequired = statusCode === DisconnectReason.restartRequired;

        console.warn(`[Baileys] Connection closed for ${userId}. StatusCode: ${statusCode}. Reason: ${errorMsg}`);

        if (isRestartRequired) {
          // CRITICAL: Status 515 (restartRequired) happens right when mobile scans QR or confirms Pairing Code!
          // Flush credentials to disk and pass in-memory { state, saveCreds } directly so login completes in <300ms!
          console.log(`[Baileys] Status 515 (restartRequired): QR/Pairing handshake in progress for ${userId}. Reconnecting immediately...`);
          sessionObj.status = 'CONNECTING';
          sessionObj.isHandshaking = true;
          sessionObj.lastActive = 'Phone scanned! Finalizing secure login with mobile...';
          sessionObj.qrCode = undefined;
          sessionObj.qrCodeDataUrl = undefined;
          this.emit('state.update', sessionObj);

          try {
            await lastSaveCredsPromise;
            await saveCreds();
          } catch {}

          const t = setTimeout(() => {
            this.initSocket(userId, undefined, {
              isHandshakeReconnect: true,
              existingAuthState: { state, saveCreds }
            }).catch(() => {});
          }, 150);
          this.reconnectTimers.set(userId, t);
        } else if (isQrTimeout) {
          // Unscanned QR code expired — pause cleanly until operator clicks Refresh QR (NEVER wipe Postgres backup!)
          sessionObj.status = 'WAITING_QR';
          sessionObj.isHandshaking = false;
          sessionObj.lastActive = 'QR expired — click Refresh QR to generate a fresh code';
          this.emit('state.update', sessionObj);
        } else if (isLoggedOut) {
          // Explicit logout from phone: wipe session directory and clear PostgreSQL backup
          console.log(`[Baileys] User ${userId} logged out from phone. Clearing auth credentials in ${sessionDir}`);
          sessionObj.status = 'DISCONNECTED';
          sessionObj.isHandshaking = false;
          sessionObj.phoneNumber = undefined;
          sessionObj.qrCode = undefined;
          sessionObj.qrCodeDataUrl = undefined;
          sessionObj.pairingCode = undefined;
          sessionObj.lastActive = 'Logged Out from Mobile';
          sessionObj.lastError = errorMsg;
          this.emit('connection.close', { userId, isLoggedOut: true, error: lastDisconnect?.error });
          this.emit('state.update', sessionObj);

          try {
            if (fs.existsSync(sessionDir)) {
              fs.rmSync(sessionDir, { recursive: true, force: true });
            }
          } catch {}
          this.clearPostgresBackup().catch(() => {});
        } else if (wasAuthenticated) {
          // Temporary network drop on an authenticated session: Preserve credentials intact and auto-reconnect!
          try {
            sock.ev?.removeAllListeners();
            sock.end?.(undefined);
          } catch {}
          sessionObj.sock = undefined;
          sessionObj.status = 'CONNECTING';
          sessionObj.isHandshaking = false;
          sessionObj.lastActive = `Reconnecting (${statusCode || 'network sync'})...`;
          sessionObj.lastError = errorMsg;
          this.emit('connection.close', { userId, isLoggedOut: false, error: lastDisconnect?.error });
          this.emit('state.update', sessionObj);

          const prevTimer = this.reconnectTimers.get(userId);
          if (prevTimer) clearTimeout(prevTimer);
          const t = setTimeout(() => {
            this.reconnectTimers.delete(userId);
            this.initSocket(userId, undefined, { isAutoReconnect: true }).catch(() => {});
          }, 2000);
          this.reconnectTimers.set(userId, t);
        } else {
          sessionObj.status = 'DISCONNECTED';
          sessionObj.isHandshaking = false;
          this.emit('state.update', sessionObj);
        }
      }
    });

    return sessionObj;
  }

  /**
   * Disconnect and clear local + PostgreSQL session auth
   */
  public async disconnectSession(userId: string): Promise<void> {
    for (const [k, t] of this.reconnectTimers.entries()) {
      clearTimeout(t);
      this.reconnectTimers.delete(k);
    }
    if (this.pgBackupTimer) {
      clearTimeout(this.pgBackupTimer);
      this.pgBackupTimer = null;
    }

    for (const [k, existing] of this.sessions.entries()) {
      if (existing?.sock) {
        try {
          existing.sock.ev?.removeAllListeners();
        } catch {}
        try {
          Promise.resolve(existing.sock.logout?.()).catch(() => {});
        } catch {}
        try {
          existing.sock.end?.(undefined);
        } catch {}
      }
      this.sessions.delete(k);
    }

    try {
      if (fs.existsSync(this.authBaseDir)) {
        const entries = await fs.promises.readdir(this.authBaseDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && entry.name.startsWith('session_')) {
            await fs.promises.rm(path.join(this.authBaseDir, entry.name), { recursive: true, force: true }).catch(() => {});
          }
        }
      }
    } catch {}

    await this.clearPostgresBackup().catch(() => {});
    this.emit('state.update', {
      userId,
      status: 'DISCONNECTED',
      isHandshaking: false,
      lastActive: 'Device Disconnected Cleanly'
    });
  }

  /**
   * Send a text message to a WhatsApp recipient or group
   */
  public async sendMessage(userId: string, jid: string, text: string): Promise<any> {
    const session = this.getSession(userId);
    if (!session?.sock || (session.status !== 'CONNECTED' && !(session.sock.user && !session.sock.ws?.isClosed))) {
      throw new Error(`WhatsApp device for user ${userId} is not connected.`);
    }

    const cleanJid = jid.includes('@') ? jid : `${jid.replace(/\D/g, '')}@s.whatsapp.net`;
    this.inFlightBotSends++;
    this.markBotSent(cleanJid, undefined, text);
    try {
      const res = await session.sock.sendMessage(cleanJid, { text });
      this.markBotSent(cleanJid, res, text);
      return res;
    } finally {
      this.inFlightBotSends = Math.max(0, this.inFlightBotSends - 1);
    }
  }

  /**
   * Convert any image format (PNG, WebP, URL, local public file, or Buffer) into:
   * 1. Standard progressive JPEG Buffer (100% compliant with WhatsApp CDN & MMG)
   * 2. High-resolution 400x400 JPEG thumbnail Buffer (for instant in-chat preview card)
   */
  public async prepareJpegImageAndThumbnail(imageInput: string | Buffer | { url: string }): Promise<{
    imageBuffer: Buffer;
    thumbnailBuffer: Buffer;
    mimetype: string;
  } | null> {
    try {
      let rawBuffer: Buffer | null = null;
      let input: any = imageInput;
      if (typeof input === 'object' && input !== null && 'url' in input && typeof input.url === 'string') {
        input = input.url;
      }

      if (Buffer.isBuffer(input)) {
        rawBuffer = input;
      } else if (typeof input === 'string') {
        const url = input.trim();
        if (url.startsWith('data:')) {
          const base64Data = url.replace(/^data:image\/[a-zA-Z0-9.+]+;base64,/, '');
          rawBuffer = Buffer.from(base64Data, 'base64');
        } else {
          // Always check local disk first if URL contains /storage/v1/object/public/ or is a relative path
          const storageMatch = url.match(/\/?storage\/v1\/object\/public\/(.+)$/i);
          if (storageMatch && storageMatch[1]) {
            const relUpload = path.join('uploads', storageMatch[1].split('?')[0]);
            const localCandidates = [
              path.join(process.cwd(), relUpload),
              path.join(process.cwd(), 'dist', relUpload),
              path.join(process.cwd(), 'public', relUpload)
            ];
            for (const cand of localCandidates) {
              if (fs.existsSync(cand) && fs.statSync(cand).isFile()) {
                rawBuffer = fs.readFileSync(cand);
                break;
              }
            }
          }

          if (!rawBuffer && (url.startsWith('http://') || url.startsWith('https://'))) {
            const resp = await fetch(url, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
              }
            });
            if (resp.ok) {
              rawBuffer = Buffer.from(await resp.arrayBuffer());
            }
          } else if (!rawBuffer) {
            const cleanPath = url.replace(/^\//, '');
            const mappedStorageRel = cleanPath.replace(/^storage\/v1\/object\/public\//i, 'uploads/');
            const candidates = [
              path.join(process.cwd(), cleanPath),
              path.join(process.cwd(), 'dist', cleanPath),
              path.join(process.cwd(), 'public', cleanPath),
              path.join(process.cwd(), mappedStorageRel),
              path.join(process.cwd(), 'dist', mappedStorageRel),
              path.join(process.cwd(), 'public', mappedStorageRel)
            ];
            for (const candidate of candidates) {
              if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
                rawBuffer = fs.readFileSync(candidate);
                break;
              }
            }
            if (!rawBuffer) {
              try {
                const localResp = await fetch(`http://127.0.0.1:${process.env.PORT || 3000}/${cleanPath}`);
                if (localResp.ok) {
                  rawBuffer = Buffer.from(await localResp.arrayBuffer());
                }
              } catch {}
            }
          }
        }
      }

      if (!rawBuffer || rawBuffer.length === 0) {
        return null;
      }

      // Check if input is already PNG or requested as PNG
      const meta = await sharp(rawBuffer).metadata().catch(() => null);
      const isPng = meta?.format === 'png';

      const imageBuffer = isPng
        ? await sharp(rawBuffer).png({ compressionLevel: 8 }).toBuffer()
        : await sharp(rawBuffer).jpeg({ quality: 88, progressive: true }).toBuffer();

      // Generate sharp 400x400 embedded thumbnail (WhatsApp spec requires jpegThumbnail to be JPEG)
      const thumbnailBuffer = await sharp(rawBuffer)
        .resize(400, 400, { fit: 'inside' })
        .jpeg({ quality: 82 })
        .toBuffer();

      return {
        imageBuffer,
        thumbnailBuffer,
        mimetype: isPng ? 'image/png' : 'image/jpeg'
      };
    } catch (err: any) {
      console.warn('[Baileys] prepareJpegImageAndThumbnail error:', err?.message);
      return null;
    }
  }

  /**
   * Generate a Studio-Grade 1280x960 Storefront Product Detail Card PNG for any inventory piece
   * Displays ALL 3 PHOTOS (FRONT VIEW, BACK VIEW, LABEL & TAG) on the left gallery panel
   * and the complete Storefront Specification Sheet on the right panel.
   */
  public async renderGarmentCardPng(
    piece: {
      barcode?: string;
      brandName?: string;
      itemName?: string;
      category?: string;
      subCategory?: string;
      parentCategoryName?: string;
      collectionName?: string;
      marketSegment?: string;
      style?: string;
      ecommerceDescription?: string;
      seoTags?: string[] | any;
      pitToPitInches?: number | string;
      lengthInches?: number | string;
      sizeScanned?: string;
      countryOfOrigin?: string;
      weightKg?: number | string;
      labelGrade?: string;
      shopLocation?: string;
      retailPriceAed?: number;
      estimatedPrice?: number;
      frontImageUrl?: string;
      backImageUrl?: string;
      tagImageUrl?: string;
    },
    _badgeText = 'IN STOCK • VERIFIED'
  ): Promise<Buffer | null> {
    try {
      const esc = (s: string) =>
        String(s || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');

      const wrapLines = (text: string, maxLen: number, maxLines: number): string[] => {
        const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
        if (words.length === 0) return [];
        const lines: string[] = [];
        let current = '';
        for (const w of words) {
          if ((current + ' ' + w).trim().length <= maxLen) {
            current = (current + ' ' + w).trim();
          } else {
            if (current) lines.push(current);
            if (lines.length >= maxLines) {
              const last = lines[lines.length - 1];
              lines[lines.length - 1] = last.length >= maxLen ? last.slice(0, maxLen - 1) + '…' : last + '…';
              return lines;
            }
            current = w.length > maxLen ? w.slice(0, maxLen - 1) + '…' : w;
          }
        }
        if (current && lines.length < maxLines) {
          lines.push(current);
        }
        return lines;
      };

      const rawSku = String(piece.barcode || 'VV-ITEM').trim();
      const sku = esc(rawSku.slice(0, 32));

      const rawBrand = String(piece.brandName || 'Vintage').trim();
      const rawItem = String(piece.itemName || piece.category || 'Garment').trim();

      // Match storefront title: e.g. "Blue • Blank Basics" or full brand + item
      const combinedTitleRaw =
        rawBrand.toLowerCase().includes(rawItem.toLowerCase())
          ? rawBrand
          : [rawBrand, rawItem].filter(Boolean).join(' • ');
      const titleLines = wrapLines(combinedTitleRaw || 'Curated Vintage Garment', 36, 2);
      const titleLine1 = esc(titleLines[0] || 'Curated Vintage Garment');
      const titleLine2 = esc(titleLines[1] || '');

      const parentCat = esc(String(piece.parentCategoryName || 'Men').trim().slice(0, 14));
      const subCat = esc(String(piece.subCategory || piece.category || piece.itemName || 'Apparel').trim().slice(0, 20));
      const collectionName = esc(String(piece.collectionName || 'SUMMER EDITION 2026').toUpperCase().trim().slice(0, 24));
      const marketSegment = esc(String(piece.marketSegment || 'BRAND').toUpperCase().trim().slice(0, 14));
      const shopLocation = esc(String(piece.shopLocation || 'Central Warehouse & Sorting Center').trim().slice(0, 34));

      const rawStyle = String(piece.style || `Double Stitch • Modern Branded • Authentic ${rawBrand} ${rawItem}`).trim();
      const styleLine = esc(rawStyle.length > 68 ? rawStyle.slice(0, 67) + '…' : rawStyle);

      const price = Number(piece.retailPriceAed || piece.estimatedPrice || 150);

      const rawDesc = String(
        piece.ecommerceDescription ||
          `Authentic curated ${rawBrand} ${rawItem} in verified vintage condition. Hand-inspected and measured at our Dubai sorting terminal.`
      ).trim();
      const descLines = wrapLines(rawDesc, 68, 3).map(esc);

      let tagsArr: string[] = [];
      if (Array.isArray(piece.seoTags)) {
        tagsArr = piece.seoTags.map((t: any) => String(t).trim()).filter(Boolean);
      } else if (typeof piece.seoTags === 'string' && piece.seoTags.trim().startsWith('[')) {
        try {
          tagsArr = JSON.parse(piece.seoTags).map((t: any) => String(t).trim()).filter(Boolean);
        } catch {}
      }
      if (tagsArr.length === 0) {
        tagsArr = [rawItem.toLowerCase(), 'mens fashion', rawBrand.slice(0, 16), 'vintage dubai', 'casual wear'];
      }
      const cleanTags = tagsArr.slice(0, 4).map(t => esc(`#${t.replace(/^#/, '').slice(0, 16)}`));

      const p2pVal = Number(piece.pitToPitInches) > 0 ? Number(piece.pitToPitInches) : 22;
      const lenVal = Number(piece.lengthInches) > 0 ? Number(piece.lengthInches) : 29;
      const p2pCm = (p2pVal * 2.54).toFixed(1);
      const lenCm = (lenVal * 2.54).toFixed(1);
      const doubledChest = Math.round(p2pVal * 2);

      const size = esc(String(piece.sizeScanned || 'M').trim().slice(0, 8));
      const origin = esc(String(piece.countryOfOrigin || 'Made in Vietnam').trim().slice(0, 22));
      const weightKg = esc(String(Number(piece.weightKg) > 0 ? Number(piece.weightKg) : 0.5));
      const rawGrade = String(piece.labelGrade || 'Grade A (Verified)').trim();
      const gradeFull = esc(rawGrade.length > 28 ? rawGrade.slice(0, 27) + '…' : rawGrade);

      // Load ALL 3 garment photos concurrently (Front, Back, Label & Tag)
      const loadResizedPhoto = async (url: string | undefined, w: number, h: number): Promise<Buffer | null> => {
        if (!url) return null;
        const prep = await this.prepareJpegImageAndThumbnail(url);
        if (!prep?.imageBuffer) return null;
        return await sharp(prep.imageBuffer)
          .resize(w, h, {
            fit: 'contain',
            background: { r: 15, g: 23, b: 42, alpha: 1 }
          })
          .png()
          .toBuffer()
          .catch(() => null);
      };

      const frontUrl = piece.frontImageUrl;
      const backUrl = piece.backImageUrl || piece.frontImageUrl;
      const tagUrl = piece.tagImageUrl || piece.frontImageUrl;

      const [frontPhotoBuf, backPhotoBuf, tagPhotoBuf] = await Promise.all([
        loadResizedPhoto(frontUrl, 532, 464),
        loadResizedPhoto(backUrl, 254, 280),
        loadResizedPhoto(tagUrl, 254, 280)
      ]);

      // Build SEO tag pills SVG
      let tagX = 612;
      const tagPillsSvg = cleanTags
        .map(tagText => {
          const pillW = Math.max(76, Math.min(148, tagText.length * 8.2 + 22));
          if (tagX + pillW > 1236) return '';
          const svgChunk = `
            <rect x="${tagX}" y="400" width="${pillW}" height="26" rx="6" fill="#fef3c7" stroke="#fde68a" stroke-width="1"/>
            <text x="${tagX + pillW / 2}" y="417" text-anchor="middle" font-family="Arial, sans-serif" font-size="11.5" font-weight="bold" fill="#92400e">${tagText}</text>
          `;
          tagX += pillW + 8;
          return svgChunk;
        })
        .join('');

      // Base SVG canvas (1280x960) matching the Storefront Product Detail card
      const baseSvg = Buffer.from(`
        <svg width="1280" height="960" viewBox="0 0 1280 960" xmlns="http://www.w3.org/2000/svg">
          <!-- Warm Archival Ivory Background -->
          <rect width="1280" height="960" fill="#fdfbf7"/>
          <rect x="12" y="12" width="1256" height="936" rx="22" fill="#fdfbf7" stroke="#f59e0b" stroke-width="2" stroke-opacity="0.4"/>

          <!-- ==================== LEFT COLUMN: 3-PHOTO GALLERY (FRONT, BACK, TAG) ==================== -->
          <!-- 1. Main Front View Frame (x=28, y=28, w=540, h=552) -->
          <rect x="28" y="28" width="540" height="552" rx="16" fill="#0f172a" stroke="#cbd5e1" stroke-width="2"/>
          <text x="298" y="310" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" font-weight="bold" fill="#475569">FRONT VIEW</text>

          <!-- 2. Back View Frame (x=28, y=596, w=262, h=336) -->
          <rect x="28" y="596" width="262" height="336" rx="14" fill="#0f172a" stroke="#f59e0b" stroke-width="2"/>
          <text x="159" y="750" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#475569">BACK VIEW</text>

          <!-- 3. Label & Tag Frame (x=306, y=596, w=262, h=336) -->
          <rect x="306" y="596" width="262" height="336" rx="14" fill="#0f172a" stroke="#f59e0b" stroke-width="2"/>
          <text x="437" y="750" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#475569">LABEL &amp; TAG</text>

          <!-- ==================== RIGHT COLUMN: STOREFRONT SPECIFICATION SHEET ==================== -->
          <!-- Row 1: Sorting Terminal Badge + SKU + Warehouse Location -->
          <rect x="592" y="28" width="234" height="28" rx="6" fill="#fef3c7" stroke="#f59e0b" stroke-width="1"/>
          <text x="709" y="46" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" font-weight="900" fill="#b45309">⚡ FRESH FROM SORTING TERMINAL</text>

          <rect x="834" y="28" width="224" height="28" rx="6" fill="#0f172a"/>
          <text x="946" y="46" text-anchor="middle" font-family="monospace" font-size="11" font-weight="bold" fill="#ffffff">${sku}</text>

          <rect x="1066" y="28" width="186" height="28" rx="6" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="1"/>
          <text x="1159" y="46" text-anchor="middle" font-family="Arial, sans-serif" font-size="10.5" font-weight="bold" fill="#334155">${shopLocation.slice(0, 26)}</text>

          <!-- Row 2: Hierarchy + Collection + Market Segment -->
          <rect x="592" y="64" width="230" height="26" rx="6" fill="#eff6ff" stroke="#bfdbfe" stroke-width="1"/>
          <text x="707" y="81" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="#1d4ed8">HIERARCHY: ${parentCat} &gt; ${subCat}</text>

          <rect x="830" y="64" width="196" height="26" rx="6" fill="#fffbeb" stroke="#fde68a" stroke-width="1"/>
          <text x="928" y="81" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="#b45309">✨ ${collectionName}</text>

          <rect x="1034" y="64" width="136" height="26" rx="6" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1"/>
          <text x="1102" y="81" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="#475569">🏷️ ${marketSegment}</text>

          <!-- Row 3: Main Garment Title & Style -->
          <text x="592" y="128" font-family="Arial, sans-serif" font-size="28" font-weight="900" fill="#0f172a">${titleLine1}</text>
          ${
            titleLine2
              ? `<text x="592" y="158" font-family="Arial, sans-serif" font-size="24" font-weight="900" fill="#1e293b">${titleLine2}</text>
                 <text x="592" y="182" font-family="Arial, sans-serif" font-size="13" font-weight="bold" fill="#64748b">Style: ${styleLine}</text>`
              : `<text x="592" y="156" font-family="Arial, sans-serif" font-size="13.5" font-weight="bold" fill="#64748b">Style: ${styleLine}</text>`
          }

          <!-- Row 4: Price AED -->
          <text x="592" y="232" font-family="Arial, sans-serif" font-size="38" font-weight="900" fill="#0f172a">AED ${price}</text>
          <text x="775" y="226" font-family="Arial, sans-serif" font-size="13" font-weight="bold" fill="#64748b">(VAT &amp; Delivery calculated at checkout)</text>
          <line x1="592" y1="248" x2="1252" y2="248" stroke="#fde68a" stroke-width="1.5"/>

          <!-- Row 5: Archival Vintage Notes Box (y=262..438) -->
          <rect x="592" y="262" width="660" height="176" rx="14" fill="#fffbeb" stroke="#fde68a" stroke-width="1.5"/>
          <text x="612" y="288" font-family="Arial, sans-serif" font-size="12" font-weight="900" fill="#b45309" letter-spacing="0.8">✨ ARCHIVAL VINTAGE NOTES</text>
          ${descLines[0] ? `<text x="612" y="314" font-family="Arial, sans-serif" font-size="13.5" fill="#334155">${descLines[0]}</text>` : ''}
          ${descLines[1] ? `<text x="612" y="336" font-family="Arial, sans-serif" font-size="13.5" fill="#334155">${descLines[1]}</text>` : ''}
          ${descLines[2] ? `<text x="612" y="358" font-family="Arial, sans-serif" font-size="13.5" fill="#334155">${descLines[2]}</text>` : ''}
          ${tagPillsSvg}

          <!-- Row 6: Exact Measured Dimensions Box (y=452..642) -->
          <rect x="592" y="452" width="660" height="190" rx="14" fill="#fffdf5" stroke="#fcd34d" stroke-width="1.5"/>
          <text x="612" y="480" font-family="Arial, sans-serif" font-size="12.5" font-weight="900" fill="#92400e" letter-spacing="0.8">📏 EXACT MEASURED DIMENSIONS</text>
          <text x="1232" y="480" text-anchor="end" font-family="Arial, sans-serif" font-size="11.5" font-weight="bold" fill="#b45309">Compare to a garment you own</text>

          <!-- Left Inner Dimension Box: Pit-to-Pit -->
          <rect x="612" y="494" width="302" height="96" rx="10" fill="#ffffff" stroke="#fde68a" stroke-width="1.2"/>
          <text x="628" y="518" font-family="Arial, sans-serif" font-size="11" font-weight="900" fill="#64748b">PIT-TO-PIT (CHEST)</text>
          <text x="628" y="554" font-family="Arial, sans-serif" font-size="26" font-weight="900" fill="#0f172a">${p2pVal}&quot; <tspan font-size="15" font-weight="bold" fill="#64748b">(${p2pCm} cm)</tspan></text>
          <text x="628" y="576" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="#94a3b8">Doubled Chest: ~${doubledChest}&quot; around</text>

          <!-- Right Inner Dimension Box: Length -->
          <rect x="930" y="494" width="302" height="96" rx="10" fill="#ffffff" stroke="#fde68a" stroke-width="1.2"/>
          <text x="946" y="518" font-family="Arial, sans-serif" font-size="11" font-weight="900" fill="#64748b">LENGTH (COLLAR-HEM)</text>
          <text x="946" y="554" font-family="Arial, sans-serif" font-size="26" font-weight="900" fill="#0f172a">${lenVal}&quot; <tspan font-size="15" font-weight="bold" fill="#64748b">(${lenCm} cm)</tspan></text>
          <text x="946" y="576" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="#94a3b8">Top of collar to bottom hem</text>

          <!-- Silhouette Cut Footer -->
          <text x="612" y="622" font-family="Arial, sans-serif" font-size="12.5" font-weight="bold" fill="#78350f">Silhouette Cut:</text>
          <rect x="712" y="604" width="118" height="24" rx="6" fill="#fef3c7" stroke="#fde68a" stroke-width="1"/>
          <text x="771" y="620" text-anchor="middle" font-family="Arial, sans-serif" font-size="11.5" font-weight="900" fill="#92400e">Boxy 90s Fit</text>
          <text x="1232" y="622" text-anchor="end" font-family="Arial, sans-serif" font-size="11.5" font-weight="bold" fill="#92400e">Measured flat on sorting table</text>

          <!-- Row 7: 4 Spec Boxes (2x2 Grid, y=656..836) -->
          <!-- Box 1: Tag Scanned Size -->
          <rect x="592" y="656" width="322" height="82" rx="12" fill="#ffffff" stroke="#e2e8f0" stroke-width="1.5"/>
          <text x="612" y="682" font-family="Arial, sans-serif" font-size="11" font-weight="900" fill="#94a3b8">TAG SCANNED SIZE</text>
          <text x="612" y="720" font-family="Arial, sans-serif" font-size="26" font-weight="900" fill="#0f172a">${size}</text>

          <!-- Box 2: Country of Origin -->
          <rect x="930" y="656" width="322" height="82" rx="12" fill="#ffffff" stroke="#e2e8f0" stroke-width="1.5"/>
          <text x="950" y="682" font-family="Arial, sans-serif" font-size="11" font-weight="900" fill="#94a3b8">COUNTRY OF ORIGIN</text>
          <text x="950" y="718" font-family="Arial, sans-serif" font-size="18" font-weight="900" fill="#0f172a">🌐 ${origin}</text>

          <!-- Box 3: Weight -->
          <rect x="592" y="750" width="322" height="82" rx="12" fill="#ffffff" stroke="#e2e8f0" stroke-width="1.5"/>
          <text x="612" y="776" font-family="Arial, sans-serif" font-size="11" font-weight="900" fill="#94a3b8">WEIGHT</text>
          <text x="612" y="814" font-family="Arial, sans-serif" font-size="22" font-weight="900" fill="#0f172a">⚖️ ${weightKg} kg</text>

          <!-- Box 4: Condition Grade -->
          <rect x="930" y="750" width="322" height="82" rx="12" fill="#ffffff" stroke="#e2e8f0" stroke-width="1.5"/>
          <text x="950" y="776" font-family="Arial, sans-serif" font-size="11" font-weight="900" fill="#94a3b8">CONDITION GRADE</text>
          <text x="950" y="812" font-family="Arial, sans-serif" font-size="15.5" font-weight="900" fill="#059669">${gradeFull}</text>

          <!-- Row 8: Green Claim via WhatsApp Bar (y=848..932) -->
          <rect x="592" y="848" width="660" height="84" rx="14" fill="#10b981"/>
          <text x="922" y="884" text-anchor="middle" font-family="Arial, sans-serif" font-size="19" font-weight="900" fill="#ffffff">💬 CLAIM VIA WHATSAPP — Reply "BUY" for Checkout Link</text>
          <text x="922" y="912" text-anchor="middle" font-family="Arial, sans-serif" font-size="13.5" font-weight="bold" fill="#ecfdf5">Reply "MORE" for Next Item • Front, Back &amp; Tag Verified</text>
        </svg>
      `);

      // Top overlay badges drawn ABOVE the 3 photos so labels/badges sit cleanly on top of the photos
      const topBadgesSvg = Buffer.from(`
        <svg width="1280" height="960" viewBox="0 0 1280 960" xmlns="http://www.w3.org/2000/svg">
          <!-- Front View Top-Left 1-OF-1 Grail Pill -->
          <rect x="42" y="42" width="268" height="32" rx="16" fill="#d97706"/>
          <text x="176" y="63" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" font-weight="900" fill="#ffffff">✨ 1-OF-1 GRAIL (ONLY ONE EXISTS)</text>

          <!-- Front View Top-Right Label -->
          <rect x="430" y="42" width="124" height="32" rx="16" fill="#0f172a" stroke="#f59e0b" stroke-width="1.5"/>
          <text x="492" y="63" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" font-weight="900" fill="#fde68a">📷 FRONT VIEW</text>

          <!-- Front View Bottom Bar -->
          <rect x="30" y="538" width="536" height="40" rx="10" fill="#0f172a" fill-opacity="0.88"/>
          <rect x="44" y="544" width="154" height="28" rx="14" fill="#ecfdf5" stroke="#10b981" stroke-width="1.5"/>
          <text x="121" y="563" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" font-weight="900" fill="#047857">✓ AI Tag Verified</text>
          <text x="550" y="563" text-anchor="end" font-family="Arial, sans-serif" font-size="12.5" font-weight="bold" fill="#fde68a">1 / 3 • MAIN FRONT PHOTO</text>

          <!-- Back View Bottom Label Bar -->
          <rect x="30" y="888" width="258" height="42" rx="10" fill="#1e293b"/>
          <text x="159" y="914" text-anchor="middle" font-family="Arial, sans-serif" font-size="13.5" font-weight="900" fill="#fde68a">🔄 2 / 3 • BACK VIEW</text>

          <!-- Label & Tag Bottom Label Bar -->
          <rect x="308" y="888" width="258" height="42" rx="10" fill="#1e293b"/>
          <text x="437" y="914" text-anchor="middle" font-family="Arial, sans-serif" font-size="13.5" font-weight="900" fill="#fde68a">🏷️ 3 / 3 • LABEL &amp; TAG</text>
        </svg>
      `);

      const layers: sharp.OverlayOptions[] = [{ input: baseSvg, top: 0, left: 0 }];
      if (frontPhotoBuf) {
        layers.push({ input: frontPhotoBuf, top: 76, left: 32 });
      }
      if (backPhotoBuf) {
        layers.push({ input: backPhotoBuf, top: 604, left: 32 });
      }
      if (tagPhotoBuf) {
        layers.push({ input: tagPhotoBuf, top: 604, left: 310 });
      }
      layers.push({ input: topBadgesSvg, top: 0, left: 0 });

      return await sharp({
        create: {
          width: 1280,
          height: 960,
          channels: 4,
          background: { r: 253, g: 251, b: 247, alpha: 1 }
        }
      })
        .composite(layers)
        .png({ compressionLevel: 8 })
        .toBuffer();
    } catch (err: any) {
      console.warn('[Baileys] renderGarmentCardPng error:', err?.message);
      return null;
    }
  }

  /**
   * Generate a Studio-Grade 1080x1280 Sale Slip / Tax Invoice / Live Studio Sale Slip PNG
   */
  public async renderSaleInvoiceSlipPng(data: {
    invoiceNo?: string;
    date?: string;
    customerName?: string;
    customerPhone?: string;
    channel?: string;
    paymentMethod?: string;
    paymentStatus?: string;
    items?: Array<{
      barcode?: string;
      sku?: string;
      name?: string;
      description?: string;
      size?: string;
      quantity?: number;
      unitPrice?: number;
      price?: number;
      total?: number;
      imageUrl?: string;
    }>;
    subTotal?: number;
    discountAmount?: number;
    vatAmount?: number;
    shippingAmount?: number;
    totalAmount?: number;
    currency?: string;
    garmentImageUrl?: string;
  }): Promise<Buffer | null> {
    try {
      const esc = (s: any) =>
        String(s ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');

      const invNo = esc(String(data.invoiceNo || `VV-INV-${Date.now().toString().slice(-6)}`).slice(0, 28));
      const dateStr = esc(String(data.date || new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })));
      const custName = esc(String(data.customerName || 'Valued Collector').slice(0, 36));
      const custPhone = esc(String(data.customerPhone || 'WhatsApp Client').slice(0, 24));
      const rawChannel = String(data.channel || 'RETAIL & WHATSAPP CONCIERGE').toUpperCase();
      const isLiveStudio = /LIVE|STUDIO|AUCTION|STREAM|BOOTH/.test(rawChannel);
      const badgeTitle = isLiveStudio ? '🎙️ LIVE STUDIO AUCTION SALE SLIP' : '🧾 OFFICIAL UAE TAX INVOICE & SALE SLIP';
      const channelLabel = esc(rawChannel.slice(0, 32));
      const payMethod = esc(String(data.paymentMethod || 'ONLINE GATEWAY / COD').toUpperCase().slice(0, 28));
      const payStatus = esc(String(data.paymentStatus || 'VERIFIED ORDER').toUpperCase().slice(0, 22));
      const currency = esc(String(data.currency || 'AED').toUpperCase());

      const rawItems = Array.isArray(data.items) && data.items.length > 0
        ? data.items
        : [
            {
              barcode: 'VV-ARCHIVE',
              description: 'Curated Vintage Archive Garment',
              size: 'STD',
              quantity: 1,
              price: Number(data.totalAmount || 150)
            }
          ];

      const computedSubtotal = rawItems.reduce((sum, it) => {
        const qty = Number(it.quantity || 1);
        const unit = Number(it.total ?? it.price ?? it.unitPrice ?? 150);
        return sum + (it.total ? Number(it.total) : unit * qty);
      }, 0);

      const subTotal = Number(data.subTotal ?? computedSubtotal);
      const discount = Number(data.discountAmount ?? 0);
      const vat = Number(data.vatAmount ?? Number(((subTotal - discount) * 0.05).toFixed(2)));
      const shipping = Number(data.shippingAmount ?? 0);
      const grandTotal = Number(data.totalAmount ?? Number((subTotal - discount + vat + shipping).toFixed(2)));

      const displayItems = rawItems.slice(0, 6);
      let rowsSvg = '';
      displayItems.forEach((it, idx) => {
        const rowY = 470 + idx * 62;
        const sku = esc(String(it.barcode || it.sku || `ITEM-0${idx + 1}`).slice(0, 18));
        const descRaw = String(it.description || it.name || 'Curated Vintage Garment').trim();
        const sizeTag = it.size ? ` [${it.size}]` : '';
        const desc = esc((descRaw + sizeTag).slice(0, 44));
        const qty = Number(it.quantity || 1);
        const lineTotal = Number(it.total ?? (Number(it.price ?? it.unitPrice ?? subTotal) * qty)).toFixed(2);
        const bgFill = idx % 2 === 0 ? '#ffffff' : '#f8fafc';

        rowsSvg += `
          <rect x="44" y="${rowY}" width="992" height="54" rx="8" fill="${bgFill}" stroke="#e2e8f0" stroke-width="1"/>
          <text x="68" y="${rowY + 33}" font-family="Arial, sans-serif" font-size="15" font-weight="900" fill="#64748b">${idx + 1}</text>
          <rect x="100" y="${rowY + 13}" width="170" height="28" rx="6" fill="#0f172a"/>
          <text x="185" y="${rowY + 32}" text-anchor="middle" font-family="monospace" font-size="13" font-weight="bold" fill="#fde68a">${sku}</text>
          <text x="290" y="${rowY + 33}" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#0f172a">${desc}</text>
          <text x="815" y="${rowY + 33}" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#334155">${qty}</text>
          <text x="1012" y="${rowY + 33}" text-anchor="end" font-family="Arial, sans-serif" font-size="17" font-weight="900" fill="#0f172a">${currency} ${lineTotal}</text>
        `;
      });

      if (rawItems.length > 6) {
        rowsSvg += `
          <text x="540" y="856" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#64748b">+ ${rawItems.length - 6} additional item(s) included in total</text>
        `;
      }

      const photoCandidate = data.garmentImageUrl || rawItems.find(i => i.imageUrl)?.imageUrl;
      let thumbBuf: Buffer | null = null;
      if (photoCandidate) {
        const prep = await this.prepareJpegImageAndThumbnail(photoCandidate);
        if (prep?.imageBuffer) {
          thumbBuf = await sharp(prep.imageBuffer)
            .resize(190, 210, { fit: 'contain', background: { r: 15, g: 23, b: 42, alpha: 1 } })
            .png()
            .toBuffer()
            .catch(() => null);
        }
      }

      const svg = Buffer.from(`
        <svg width="1080" height="1280" viewBox="0 0 1080 1280" xmlns="http://www.w3.org/2000/svg">
          <rect width="1080" height="1280" fill="#fdfbf7"/>
          <rect x="16" y="16" width="1048" height="1248" rx="24" fill="#fdfbf7" stroke="#f59e0b" stroke-width="2.5"/>

          <!-- HEADER BANNER -->
          <rect x="32" y="32" width="1016" height="176" rx="18" fill="#0f172a"/>
          <rect x="52" y="52" width="420" height="34" rx="8" fill="#f59e0b"/>
          <text x="262" y="75" text-anchor="middle" font-family="Arial, sans-serif" font-size="15" font-weight="900" fill="#0f172a">${badgeTitle}</text>

          <text x="52" y="122" font-family="Arial, sans-serif" font-size="30" font-weight="900" fill="#ffffff">VINTAGE VIBES GENERAL TRADING L.L.C</text>
          <text x="52" y="152" font-family="Arial, sans-serif" font-size="14.5" font-weight="bold" fill="#cbd5e1">📍 Downtown, Al Qaseedah District, 135 Khalifa Bin Zayed St, Al Ain / Dubai, UAE</text>
          <text x="52" y="178" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#fde68a">UAE TRN: 100489201948   •   WhatsApp Desk: +971 55 418 6086   •   vintagevibesgk.com</text>

          <!-- INVOICE NO BOX IN HEADER -->
          <rect x="740" y="52" width="286" height="136" rx="14" fill="#1e293b" stroke="#f59e0b" stroke-width="1.5"/>
          <text x="883" y="82" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" font-weight="900" fill="#94a3b8">SLIP / INVOICE NUMBER</text>
          <text x="883" y="116" text-anchor="middle" font-family="monospace" font-size="22" font-weight="900" fill="#fde68a">#${invNo}</text>
          <text x="883" y="146" text-anchor="middle" font-family="Arial, sans-serif" font-size="13.5" font-weight="bold" fill="#e2e8f0">Date: ${dateStr}</text>
          <rect x="793" y="156" width="180" height="22" rx="6" fill="#059669"/>
          <text x="883" y="172" text-anchor="middle" font-family="Arial, sans-serif" font-size="11.5" font-weight="900" fill="#ffffff">✓ ${payStatus}</text>

          <!-- CUSTOMER & CHANNEL META GRID -->
          <rect x="32" y="226" width="500" height="168" rx="16" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5"/>
          <text x="56" y="256" font-family="Arial, sans-serif" font-size="12" font-weight="900" fill="#b45309">👤 CUSTOMER / COLLECTOR DETAILS</text>
          <text x="56" y="292" font-family="Arial, sans-serif" font-size="24" font-weight="900" fill="#0f172a">${custName}</text>
          <text x="56" y="324" font-family="monospace" font-size="17" font-weight="bold" fill="#334155">📱 Phone: ${custPhone}</text>
          <text x="56" y="356" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#059669">✓ Authentic 1-of-1 Verified Archive Purchase</text>

          <rect x="548" y="226" width="500" height="168" rx="16" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5"/>
          <text x="572" y="256" font-family="Arial, sans-serif" font-size="12" font-weight="900" fill="#b45309">📦 ORDER &amp; DISPATCH SPECIFICATIONS</text>
          <text x="572" y="292" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#475569">Sales Channel:</text>
          <text x="1024" y="292" text-anchor="end" font-family="Arial, sans-serif" font-size="16" font-weight="900" fill="#0f172a">${channelLabel}</text>
          <text x="572" y="326" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#475569">Payment Mode:</text>
          <text x="1024" y="326" text-anchor="end" font-family="Arial, sans-serif" font-size="16" font-weight="900" fill="#0f172a">${payMethod}</text>
          <text x="572" y="360" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#475569">Total Garments:</text>
          <text x="1024" y="360" text-anchor="end" font-family="Arial, sans-serif" font-size="16" font-weight="900" fill="#059669">${rawItems.length} Piece(s)</text>

          <!-- TABLE HEADER -->
          <rect x="32" y="412" width="1016" height="46" rx="10" fill="#0f172a"/>
          <text x="68" y="441" font-family="Arial, sans-serif" font-size="13" font-weight="900" fill="#fde68a">#</text>
          <text x="185" y="441" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" font-weight="900" fill="#fde68a">SKU / BARCODE</text>
          <text x="290" y="441" font-family="Arial, sans-serif" font-size="13" font-weight="900" fill="#fde68a">GARMENT DESCRIPTION &amp; SIZE</text>
          <text x="815" y="441" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" font-weight="900" fill="#fde68a">QTY</text>
          <text x="1012" y="441" text-anchor="end" font-family="Arial, sans-serif" font-size="13" font-weight="900" fill="#fde68a">TOTAL (${currency})</text>

          <!-- ITEM ROWS -->
          ${rowsSvg}

          <!-- BOTTOM SECTION: PAYMENT INFO + PHOTO PREVIEW (LEFT) & TOTALS (RIGHT) -->
          <rect x="32" y="876" width="540" height="292" rx="16" fill="#fffbeb" stroke="#fcd34d" stroke-width="1.5"/>
          <text x="56" y="910" font-family="Arial, sans-serif" font-size="14" font-weight="900" fill="#b45309">💳 PAYMENT &amp; EXPRESS DISPATCH INFO</text>
          <text x="56" y="942" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#1e293b">• Bank: Emirates NBD (UAE)</text>
          <text x="56" y="968" font-family="Arial, sans-serif" font-size="13.5" font-weight="bold" fill="#334155">• Account: VINTAGE VIBES GENERAL TRADING LLC</text>
          <text x="56" y="994" font-family="Arial, sans-serif" font-size="13.5" font-weight="bold" fill="#334155">• Online Checkout: https://vintagevibesgk.com</text>
          <text x="56" y="1024" font-family="Arial, sans-serif" font-size="13.5" font-weight="bold" fill="#047857">• Express UAE Doorstep Courier (24–48 Hours)</text>

          <rect x="56" y="1048" width="276" height="96" rx="12" fill="#ecfdf5" stroke="#10b981" stroke-width="1.5"/>
          <text x="194" y="1084" text-anchor="middle" font-family="Arial, sans-serif" font-size="15" font-weight="900" fill="#047857">✓ OFFICIAL VERIFIED SLIP</text>
          <text x="194" y="1110" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="#065f46">Digitally Signed by Vintage Vibes</text>
          <text x="194" y="1130" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="#065f46">Dubai Sorting &amp; Live Studio ERP</text>

          ${
            thumbBuf
              ? `<rect x="356" y="926" width="198" height="222" rx="12" fill="#0f172a" stroke="#f59e0b" stroke-width="2"/>`
              : ''
          }

          <!-- TOTALS CARD (RIGHT) -->
          <rect x="588" y="876" width="460" height="292" rx="16" fill="#0f172a" stroke="#f59e0b" stroke-width="2"/>
          <text x="618" y="922" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#cbd5e1">Subtotal</text>
          <text x="1018" y="922" text-anchor="end" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="#ffffff">${currency} ${subTotal.toFixed(2)}</text>

          <text x="618" y="962" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#cbd5e1">Discount</text>
          <text x="1018" y="962" text-anchor="end" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="#34d399">- ${currency} ${discount.toFixed(2)}</text>

          <text x="618" y="1002" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#cbd5e1">UAE VAT (5%)</text>
          <text x="1018" y="1002" text-anchor="end" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="#ffffff">${currency} ${vat.toFixed(2)}</text>

          <text x="618" y="1042" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#cbd5e1">Courier Delivery</text>
          <text x="1018" y="1042" text-anchor="end" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="#fde68a">${shipping === 0 ? 'FREE' : `${currency} ${shipping.toFixed(2)}`}</text>

          <line x1="618" y1="1068" x2="1018" y2="1068" stroke="#334155" stroke-width="2"/>

          <rect x="612" y="1086" width="412" height="64" rx="12" fill="#10b981"/>
          <text x="634" y="1126" font-family="Arial, sans-serif" font-size="20" font-weight="900" fill="#ffffff">GRAND TOTAL</text>
          <text x="1002" y="1127" text-anchor="end" font-family="Arial, sans-serif" font-size="26" font-weight="900" fill="#ffffff">${currency} ${grandTotal.toFixed(2)}</text>

          <!-- FOOTER BAR -->
          <rect x="32" y="1186" width="1016" height="56" rx="12" fill="#1e293b"/>
          <text x="540" y="1220" text-anchor="middle" font-family="Arial, sans-serif" font-size="14.5" font-weight="bold" fill="#fde68a">Thank you for shopping with Vintage Vibes Dubai! Reply anytime on WhatsApp for support or tracking.</text>
        </svg>
      `);

      const layers: sharp.OverlayOptions[] = [{ input: svg, top: 0, left: 0 }];
      if (thumbBuf) {
        layers.push({ input: thumbBuf, top: 932, left: 360 });
      }

      return await sharp({
        create: {
          width: 1080,
          height: 1280,
          channels: 4,
          background: { r: 253, g: 251, b: 247, alpha: 1 }
        }
      })
        .composite(layers)
        .png({ compressionLevel: 8 })
        .toBuffer();
    } catch (err: any) {
      console.warn('[Baileys] renderSaleInvoiceSlipPng error:', err?.message);
      return null;
    }
  }

  /**
   * Generate a Studio-Grade 1080x1280 Express Courier Dispatch Waybill (AWB Slip) PNG
   */
  public async renderCourierDispatchSlipPng(data: {
    awbNo?: string;
    invoiceNo?: string;
    courierPartner?: string;
    date?: string;
    customerName?: string;
    customerPhone?: string;
    city?: string;
    deliveryAddress?: string;
    items?: Array<{ barcode?: string; description?: string; name?: string; quantity?: number; price?: number }>;
    piecesCount?: number;
    weightKg?: number;
    codAmount?: number;
    totalAmount?: number;
    paymentMethod?: string;
    garmentImageUrl?: string;
  }): Promise<Buffer | null> {
    try {
      const esc = (s: any) =>
        String(s ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');

      const invNo = esc(String(data.invoiceNo || `VV-ORD-${Date.now().toString().slice(-5)}`).slice(0, 24));
      const awbNo = esc(String(data.awbNo || `AWB-UAE-${invNo.replace(/\D/g, '').slice(-6) || Date.now().toString().slice(-6)}`).slice(0, 24));
      const courierName = esc(String(data.courierPartner || 'UAE EXPRESS COURIER DISPATCH').toUpperCase().slice(0, 32));
      const dateStr = esc(String(data.date || new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })));
      const custName = esc(String(data.customerName || 'Valued Collector').slice(0, 36));
      const custPhone = esc(String(data.customerPhone || 'WhatsApp Verified').slice(0, 24));
      const city = esc(String(data.city || 'DUBAI / UAE').toUpperCase().slice(0, 22));
      const address = esc(String(data.deliveryAddress || 'Doorstep Express Delivery across UAE (Confirmed via WhatsApp)').slice(0, 68));
      const totalAmt = Number(data.codAmount ?? data.totalAmount ?? 150);
      const payMode = String(data.paymentMethod || 'COD / EXPRESS').toUpperCase();
      const isCod = /COD|CASH/.test(payMode);
      const piecesCount = Number(data.piecesCount || (Array.isArray(data.items) ? data.items.length : 1) || 1);
      const weightKg = Number(data.weightKg || (piecesCount * 0.45).toFixed(2));

      // Generate visual SVG barcode bars
      let barcodeBars = '';
      let bx = 80;
      for (let i = 0; i < 62; i++) {
        const w = (i * 7 + 3) % 3 === 0 ? 6 : (i % 2 === 0 ? 3 : 2);
        const gap = (i * 5) % 3 === 0 ? 5 : 3;
        if (bx + w < 680) {
          barcodeBars += `<rect x="${bx}" y="252" width="${w}" height="74" fill="#0f172a"/>`;
          bx += w + gap;
        }
      }

      const rawItems = Array.isArray(data.items) && data.items.length > 0
        ? data.items
        : [{ barcode: 'VV-PARCEL', description: 'Curated Vintage Apparel Parcel', quantity: piecesCount, price: totalAmt }];

      const itemLinesSvg = rawItems
        .slice(0, 4)
        .map((it, idx) => {
          const y = 980 + idx * 36;
          const code = esc(String(it.barcode || `ITEM-${idx + 1}`).slice(0, 18));
          const title = esc(String(it.description || it.name || 'Vintage Garment').slice(0, 50));
          return `<text x="64" y="${y}" font-family="Arial, sans-serif" font-size="15.5" font-weight="bold" fill="#1e293b">• [${code}] ${title}</text>`;
        })
        .join('');

      const svg = Buffer.from(`
        <svg width="1080" height="1280" viewBox="0 0 1080 1280" xmlns="http://www.w3.org/2000/svg">
          <rect width="1080" height="1280" fill="#ffffff"/>
          <rect x="20" y="20" width="1040" height="1240" rx="20" fill="#fdfbf7" stroke="#0f172a" stroke-width="4"/>

          <!-- TOP HEADER -->
          <rect x="36" y="36" width="1008" height="164" rx="16" fill="#0f172a"/>
          <rect x="60" y="56" width="350" height="34" rx="8" fill="#10b981"/>
          <text x="235" y="79" text-anchor="middle" font-family="Arial, sans-serif" font-size="15" font-weight="900" fill="#ffffff">🚚 OFFICIAL COURIER WAYBILL (AWB)</text>

          <text x="60" y="128" font-family="Arial, sans-serif" font-size="30" font-weight="900" fill="#ffffff">${courierName}</text>
          <text x="60" y="160" font-family="Arial, sans-serif" font-size="15" font-weight="bold" fill="#fde68a">Shipper: VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C (UAE)</text>
          <text x="60" y="184" font-family="Arial, sans-serif" font-size="13.5" fill="#cbd5e1">Dispatch Date: ${dateStr}   •   Order Ref: #${invNo}</text>

          <!-- DESTINATION ROUTING GIANT CODE -->
          <rect x="770" y="54" width="250" height="128" rx="14" fill="#f59e0b"/>
          <text x="895" y="86" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" font-weight="900" fill="#0f172a">DESTINATION HUB</text>
          <text x="895" y="132" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" font-weight="900" fill="#0f172a">${city.slice(0, 12)}</text>
          <text x="895" y="164" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="900" fill="#1e293b">UAE EXPRESS</text>

          <!-- BARCODE & AWB STRIP -->
          <rect x="36" y="218" width="1008" height="156" rx="14" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
          ${barcodeBars}
          <text x="370" y="354" text-anchor="middle" font-family="monospace" font-size="22" font-weight="900" fill="#0f172a" letter-spacing="2">${awbNo}</text>

          <rect x="720" y="236" width="302" height="120" rx="12" fill="#0f172a"/>
          <text x="871" y="268" text-anchor="middle" font-family="Arial, sans-serif" font-size="12.5" font-weight="900" fill="#94a3b8">TRACKING / WAYBILL NO</text>
          <text x="871" y="304" text-anchor="middle" font-family="monospace" font-size="21" font-weight="900" fill="#34d399">${awbNo}</text>
          <text x="871" y="336" text-anchor="middle" font-family="Arial, sans-serif" font-size="13.5" font-weight="bold" fill="#fde68a">Status: READY FOR DISPATCH</text>

          <!-- SHIPPER (FROM) BOX -->
          <rect x="36" y="392" width="1008" height="132" rx="14" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5"/>
          <text x="60" y="422" font-family="Arial, sans-serif" font-size="13" font-weight="900" fill="#64748b">📤 SHIPPER (FROM — SORTING &amp; FULFILLMENT HUB)</text>
          <text x="60" y="454" font-family="Arial, sans-serif" font-size="20" font-weight="900" fill="#0f172a">VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C</text>
          <text x="60" y="482" font-family="Arial, sans-serif" font-size="15" font-weight="bold" fill="#334155">Downtown, Al Qaseedah District, 135 Khalifa Bin Zayed Street, Al Ain / Dubai, UAE</text>
          <text x="60" y="508" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#047857">Dispatch Desk Phone: +971 55 418 6086   •   Web: https://vintagevibesgk.com</text>

          <!-- CONSIGNEE (DELIVER TO) BOX -->
          <rect x="36" y="542" width="1008" height="206" rx="16" fill="#fffbeb" stroke="#f59e0b" stroke-width="2.5"/>
          <text x="60" y="576" font-family="Arial, sans-serif" font-size="14" font-weight="900" fill="#b45309">📍 CONSIGNEE (DELIVER TO RECIPIENT)</text>
          <text x="60" y="620" font-family="Arial, sans-serif" font-size="30" font-weight="900" fill="#0f172a">${custName}</text>
          <text x="60" y="658" font-family="monospace" font-size="22" font-weight="900" fill="#047857">📞 Mobile / WhatsApp: ${custPhone}</text>
          <text x="60" y="694" font-family="Arial, sans-serif" font-size="17" font-weight="bold" fill="#1e293b">🏠 Address: ${address}</text>
          <text x="60" y="726" font-family="Arial, sans-serif" font-size="16" font-weight="900" fill="#b45309">🏙️ Emirate / City: ${city}</text>

          <!-- 3 SHIPMENT METRIC BOXES -->
          <rect x="36" y="766" width="322" height="130" rx="14" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
          <text x="60" y="800" font-family="Arial, sans-serif" font-size="13" font-weight="900" fill="#64748b">PARCEL WEIGHT &amp; QTY</text>
          <text x="60" y="846" font-family="Arial, sans-serif" font-size="28" font-weight="900" fill="#0f172a">${piecesCount} Pc(s) • ${weightKg} kg</text>
          <text x="60" y="876" font-family="Arial, sans-serif" font-size="13.5" font-weight="bold" fill="#059669"> Sealed Archival Packaging</text>

          <rect x="378" y="766" width="322" height="130" rx="14" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
          <text x="402" y="800" font-family="Arial, sans-serif" font-size="13" font-weight="900" fill="#64748b">PAYMENT &amp; SERVICE MODE</text>
          <text x="402" y="846" font-family="Arial, sans-serif" font-size="24" font-weight="900" fill="#0f172a">${esc(payMode.slice(0, 18))}</text>
          <text x="402" y="876" font-family="Arial, sans-serif" font-size="13.5" font-weight="bold" fill="#b45309">⚡ 24–48 Hr UAE Doorstep</text>

          <rect x="720" y="766" width="324" height="130" rx="14" fill="#0f172a" stroke="#10b981" stroke-width="2.5"/>
          <text x="744" y="800" font-family="Arial, sans-serif" font-size="13" font-weight="900" fill="#34d399">${isCod ? 'CASH TO COLLECT (COD)' : 'ORDER VALUE (AED)'}</text>
          <text x="744" y="848" font-family="Arial, sans-serif" font-size="32" font-weight="900" fill="#ffffff">AED ${totalAmt.toFixed(2)}</text>
          <text x="744" y="878" font-family="Arial, sans-serif" font-size="13.5" font-weight="bold" fill="#fde68a">Invoice Ref: #${invNo}</text>

          <!-- PACKED CONTENTS MANIFEST -->
          <rect x="36" y="914" width="1008" height="248" rx="14" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
          <text x="64" y="948" font-family="Arial, sans-serif" font-size="14" font-weight="900" fill="#0f172a">📦 PACKED GARMENTS MANIFEST (VERIFIED AT SORTING TERMINAL)</text>
          ${itemLinesSvg}
          <text x="64" y="1138" font-family="Arial, sans-serif" font-size="13.5" font-weight="bold" fill="#64748b">Note: Please keep your phone reachable on WhatsApp for the delivery driver.</text>

          <!-- FOOTER -->
          <rect x="36" y="1180" width="1008" height="60" rx="12" fill="#0f172a"/>
          <text x="540" y="1216" text-anchor="middle" font-family="Arial, sans-serif" font-size="15" font-weight="900" fill="#fde68a">✓ VINTAGE VIBES LOGISTICS • OFFICIAL DISPATCH SLIP • VINTAGEVIBESGK.COM</text>
        </svg>
      `);

      return await sharp({
        create: {
          width: 1080,
          height: 1280,
          channels: 4,
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        }
      })
        .composite([{ input: svg, top: 0, left: 0 }])
        .png({ compressionLevel: 8 })
        .toBuffer();
    } catch (err: any) {
      console.warn('[Baileys] renderCourierDispatchSlipPng error:', err?.message);
      return null;
    }
  }

  /**
   * Send an image with caption and guaranteed thumbnail
   */
  public async sendImage(userId: string, jid: string, imageBuffer: Buffer | { url: string } | string, caption?: string): Promise<any> {
    let session = this.getSession(userId);
    if (!session?.sock || (session.status !== 'CONNECTED' && !(session.sock.user && !session.sock.ws?.isClosed))) {
      session = this.getConnectedSession();
    }
    if (!session?.sock || (session.status !== 'CONNECTED' && !(session.sock.user && !session.sock.ws?.isClosed))) {
      throw new Error(`WhatsApp device for user ${userId} is not connected.`);
    }

    const cleanJid = jid.includes('@') ? jid : `${jid.replace(/\D/g, '')}@s.whatsapp.net`;
    const prepared = await this.prepareJpegImageAndThumbnail(imageBuffer);

    if (prepared) {
      this.inFlightBotSends++;
      this.markBotSent(cleanJid, undefined, caption || '');
      try {
        const res = await session.sock.sendMessage(cleanJid, {
          image: prepared.imageBuffer,
          caption: caption || '',
          mimetype: prepared.mimetype,
          jpegThumbnail: prepared.thumbnailBuffer
        });
        this.markBotSent(cleanJid, res, caption || '');
        return res;
      } finally {
        this.inFlightBotSends = Math.max(0, this.inFlightBotSends - 1);
      }
    }

    // Strict photo-only enforcement: do NOT fall back to text message when photo dispatch is requested
    throw new Error('Failed to prepare and encode image for WhatsApp dispatch.');
  }

  /**
   * Send a native WhatsApp Document (PDF, Word .doc/.docx, Excel, etc.) with caption
   */
  public async sendDocument(
    userId: string,
    jid: string,
    docBuffer: Buffer,
    fileName: string,
    mimetype: string,
    caption?: string
  ): Promise<any> {
    const session = this.getSession(userId) || this.getConnectedSession();
    if (!session?.sock || (session.status !== 'CONNECTED' && !(session.sock.user && !session.sock.ws?.isClosed))) {
      throw new Error(`WhatsApp device for user ${userId} is not connected.`);
    }

    const cleanJid = jid.includes('@') ? jid : `${jid.replace(/\D/g, '')}@s.whatsapp.net`;
    this.inFlightBotSends++;
    this.markBotSent(cleanJid, undefined, caption || fileName);
    try {
      const res = await session.sock.sendMessage(cleanJid, {
        document: docBuffer,
        fileName,
        mimetype,
        caption: caption || ''
      });
      this.markBotSent(cleanJid, res, caption || fileName);
      return res;
    } finally {
      this.inFlightBotSends = Math.max(0, this.inFlightBotSends - 1);
    }
  }

  /**
   * Convert an HTML document into a genuine A4 PDF Buffer using local Chromium/Edge/Puppeteer
   */
  public async renderHtmlToPdfBuffer(htmlContent: string): Promise<Buffer | null> {
    let browser: any = null;
    try {
      const puppeteer = require('puppeteer');
      const edgePaths = [
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
      ];
      let executablePath: string | undefined;
      for (const ep of edgePaths) {
        if (fs.existsSync(ep)) {
          executablePath = ep;
          break;
        }
      }
      browser = await puppeteer.launch({
        headless: 'new',
        ...(executablePath ? { executablePath } : {}),
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
      });
      const page = await browser.newPage();
      await page.setContent(htmlContent, { waitUntil: 'networkidle0', timeout: 15000 }).catch(async () => {
        await page.setContent(htmlContent, { waitUntil: 'domcontentloaded', timeout: 8000 });
      });
      const pdfBytes = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' }
      });
      return Buffer.from(pdfBytes);
    } catch (err: any) {
      console.warn('[Baileys Doc Engine] Puppeteer PDF fallback notice:', err?.message);
      return null;
    } finally {
      if (browser) {
        try { await browser.close(); } catch {}
      }
    }
  }

  /**
   * Wrap an HTML document into a Microsoft Word (.doc) compatible buffer (opens natively in MS Word & WPS Office)
   */
  public renderHtmlToWordDocBuffer(htmlBodyContent: string, title = 'Vintage Vibes Official Document'): Buffer {
    const wordHtml = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
<meta charset="utf-8">
<title>${title}</title>
<!--[if gte mso 9]>
<xml>
  <w:WordDocument>
    <w:View>Print</w:View>
    <w:Zoom>100</w:Zoom>
    <w:DoNotOptimizeForBrowser/>
  </w:WordDocument>
</xml>
<![endif]-->
<style>
  @page { size: 21cm 29.7cm; margin: 1.5cm; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; line-height: 1.45; font-size: 11pt; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 14px; }
  th { background-color: #0f172a; color: #fde68a; font-weight: bold; text-align: left; padding: 8px; border: 1px solid #cbd5e1; font-size: 10pt; }
  td { padding: 7px 8px; border: 1px solid #cbd5e1; font-size: 10pt; vertical-align: middle; }
  tr:nth-child(even) td { background-color: #f8fafc; }
  .header-box { background-color: #0f172a; color: #ffffff; padding: 16px; border-bottom: 4px solid #f59e0b; margin-bottom: 16px; }
  .title { font-size: 18pt; font-weight: bold; color: #fde68a; margin: 0; }
  .subtitle { font-size: 10pt; color: #cbd5e1; margin-top: 4px; }
  .badge { background-color: #fef3c7; color: #92400e; padding: 2px 6px; font-weight: bold; font-size: 9pt; }
</style>
</head>
<body>
${htmlBodyContent}
</body>
</html>`;
    return Buffer.from('\ufeff' + wordHtml, 'utf8');
  }

  /**
   * Generate Official Vintage Vibes Product Catalogue (PDF + Word + Summary PNG) for all in-stock pieces (or filtered by department)
   */
  public async generateInventoryCatalogDocuments(
    pieces: any[],
    deptTitle = 'Complete In-Stock Collection',
    baseCheckout = 'https://vintagevibesgk.com/?checkout='
  ): Promise<{ pdfBuffer: Buffer | null; wordBuffer: Buffer; fileNameStem: string }> {
    const esc = (s: any) =>
      String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const rowsHtml = pieces
      .map((p, idx) => {
        const sku = esc(p.barcode || `VV-0${idx + 1}`);
        const name = esc(`${p.brandName || 'Vintage'} — ${p.itemName || 'Archive Piece'}`);
        const cat = esc(p.category || p.subCategory || p.parentCategoryName || 'Apparel');
        const size = esc(p.sizeScanned || 'M');
        const grade = esc(p.labelGrade || 'A+ Mint');
        const chest = p.pitToPitInches ? `${p.pitToPitInches}"` : '22"';
        const len = p.lengthInches ? `${p.lengthInches}"` : '29"';
        const price = Number(p.retailPriceAed || p.estimatedPrice || 120).toFixed(2);
        const link = `${baseCheckout}${encodeURIComponent(p.barcode || '')}`;
        const imgUrl = p.frontImageUrl && String(p.frontImageUrl).startsWith('http') ? p.frontImageUrl : '';
        return `
          <tr>
            <td style="font-weight:bold;text-align:center;">${idx + 1}</td>
            <td>
              ${imgUrl ? `<img src="${esc(imgUrl)}" width="64" height="64" style="object-fit:cover;border-radius:6px;border:1px solid #cbd5e1;" />` : `<span class="badge">${sku}</span>`}
            </td>
            <td style="font-family:monospace;font-weight:bold;color:#0f172a;">${sku}</td>
            <td>
              <div style="font-weight:bold;color:#0f172a;">${name}</div>
              <div style="font-size:9pt;color:#64748b;">Category: ${cat} • Grade: ${grade}</div>
            </td>
            <td style="text-align:center;font-weight:bold;">${size}<br/><span style="font-size:8.5pt;color:#64748b;">(${chest} × ${len})</span></td>
            <td style="text-align:right;font-weight:bold;color:#047857;font-size:11pt;">AED ${price}</td>
            <td><a href="${esc(link)}" style="color:#2563eb;font-weight:bold;text-decoration:none;">Buy / View Online</a></td>
          </tr>
        `;
      })
      .join('\n');

    const totalValue = pieces.reduce((acc, p) => acc + Number(p.retailPriceAed || p.estimatedPrice || 120), 0);

    const bodyHtml = `
      <div class="header-box" style="background:#0f172a;color:#fff;padding:20px;border-radius:10px;border-bottom:4px solid #f59e0b;">
        <div style="font-size:20pt;font-weight:900;color:#fde68a;letter-spacing:0.5px;">VINTAGE VIBES — OFFICIAL PRODUCT CATALOGUE</div>
        <div style="font-size:10.5pt;color:#e2e8f0;margin-top:4px;">
          Collection: <strong>${esc(deptTitle)}</strong> • Date: <strong>${esc(dateStr)}</strong> • Total In-Stock Pieces: <strong>${pieces.length} PCs</strong>
        </div>
        <div style="font-size:9.5pt;color:#94a3b8;margin-top:4px;">
          Showroom: Al Ain &amp; Dubai, UAE • Owner: Mr. Muhammad Akram (+971 52 804 9351) • Website: https://vintagevibesgk.com
        </div>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-top:14px;">
        <thead>
          <tr style="background:#0f172a;color:#fde68a;">
            <th style="width:36px;text-align:center;">#</th>
            <th style="width:74px;">Photo</th>
            <th style="width:120px;">SKU / Barcode</th>
            <th>Brand &amp; Garment Description</th>
            <th style="width:95px;text-align:center;">Size</th>
            <th style="width:105px;text-align:right;">Price (AED)</th>
            <th style="width:110px;">Instant Order</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>

      <div style="margin-top:16px;padding:12px 16px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;font-size:10pt;">
        <strong>Summary:</strong> Total Available Items: <strong>${pieces.length} PCs</strong> &nbsp;|&nbsp;
        Total Catalogue Retail Value: <strong>AED ${totalValue.toFixed(2)}</strong> &nbsp;|&nbsp;
        <strong>Express UAE Delivery:</strong> 24–48 Hours (Cash on Delivery &amp; Online Link Available)
      </div>
    `;

    const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      body { font-family: Arial, sans-serif; color: #0f172a; margin: 0; padding: 12px; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      th { background: #0f172a; color: #fde68a; padding: 8px; border: 1px solid #cbd5e1; font-size: 11px; text-align: left; }
      td { padding: 7px 8px; border: 1px solid #cbd5e1; font-size: 11px; vertical-align: middle; }
      tr:nth-child(even) td { background: #f8fafc; }
    </style></head><body>${bodyHtml}</body></html>`;

    const wordBuffer = this.renderHtmlToWordDocBuffer(bodyHtml, `Vintage Vibes Catalogue - ${deptTitle}`);
    const pdfBuffer = await this.renderHtmlToPdfBuffer(fullHtml);
    const cleanStem = `Vintage_Vibes_Catalogue_${deptTitle.replace(/[^a-zA-Z0-9]+/g, '_')}_${new Date().toISOString().slice(0, 10)}`;

    return { pdfBuffer, wordBuffer, fileNameStem: cleanStem };
  }

  /**
   * Generate Official Executive ERP Report (Chart of Accounts COA, Financial Account Statement, Sales/Purchase Summary, or Custom Owner Report) in both PDF & Word (.doc)
   */
  public async generateExecutiveErpReportDocuments(params: {
    reportTitle: string;
    subtitle?: string;
    requestedBy: string;
    summaryKpis?: Array<{ label: string; value: string }>;
    columns: string[];
    rows: string[][];
    footerNote?: string;
  }): Promise<{ pdfBuffer: Buffer | null; wordBuffer: Buffer; fileNameStem: string }> {
    const esc = (s: any) =>
      String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const dateStr = new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const kpiHtml =
      params.summaryKpis && params.summaryKpis.length > 0
        ? `<table style="width:100%;border-collapse:collapse;margin:12px 0;">
            <tr>
              ${params.summaryKpis
                .map(
                  k => `<td style="background:#f8fafc;border:1px solid #cbd5e1;padding:10px 12px;text-align:center;">
                    <div style="font-size:8.5pt;color:#64748b;text-transform:uppercase;font-weight:bold;">${esc(k.label)}</div>
                    <div style="font-size:13pt;color:#0f172a;font-weight:900;margin-top:3px;">${esc(k.value)}</div>
                  </td>`
                )
                .join('')}
            </tr>
          </table>`
        : '';

    const thHtml = params.columns.map(c => `<th>${esc(c)}</th>`).join('');
    const trHtml = params.rows
      .map(
        r =>
          `<tr>${r
            .map((cell, i) => `<td style="${i === r.length - 1 ? 'font-weight:bold;text-align:right;' : ''}">${esc(cell)}</td>`)
            .join('')}</tr>`
      )
      .join('\n');

    const bodyHtml = `
      <div class="header-box" style="background:#0f172a;color:#fff;padding:18px 20px;border-radius:10px;border-bottom:4px solid #f59e0b;">
        <div style="font-size:18pt;font-weight:900;color:#fde68a;">VINTAGE VIBES ERP — ${esc(params.reportTitle.toUpperCase())}</div>
        <div style="font-size:10pt;color:#e2e8f0;margin-top:4px;">
          ${params.subtitle ? `${esc(params.subtitle)} • ` : ''}Generated: <strong>${esc(dateStr)}</strong> • Requested By: <strong>${esc(params.requestedBy)}</strong>
        </div>
        <div style="font-size:9pt;color:#94a3b8;margin-top:3px;">
          Company Owner: Mr. Muhammad Akram (+971 52 804 9351) • ERP Architect: Mr. Murtaza Makkani (+92 302 2190822)
        </div>
      </div>

      ${kpiHtml}

      <table style="width:100%;border-collapse:collapse;margin-top:10px;">
        <thead>
          <tr style="background:#0f172a;color:#fde68a;">${thHtml}</tr>
        </thead>
        <tbody>
          ${trHtml}
        </tbody>
      </table>

      ${
        params.footerNote
          ? `<div style="margin-top:14px;padding:10px 14px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;font-size:9.5pt;">
              ${esc(params.footerNote)}
            </div>`
          : ''
      }
    `;

    const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      body { font-family: Arial, sans-serif; color: #0f172a; margin: 0; padding: 12px; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; }
      th { background: #0f172a; color: #fde68a; padding: 7px 8px; border: 1px solid #cbd5e1; font-size: 10.5px; text-align: left; }
      td { padding: 6px 8px; border: 1px solid #cbd5e1; font-size: 10.5px; vertical-align: middle; }
      tr:nth-child(even) td { background: #f8fafc; }
    </style></head><body>${bodyHtml}</body></html>`;

    const wordBuffer = this.renderHtmlToWordDocBuffer(bodyHtml, `Vintage Vibes - ${params.reportTitle}`);
    const pdfBuffer = await this.renderHtmlToPdfBuffer(fullHtml);
    const cleanStem = `Vintage_Vibes_${params.reportTitle.replace(/[^a-zA-Z0-9]+/g, '_')}_${new Date().toISOString().slice(0, 10)}`;

    return { pdfBuffer, wordBuffer, fileNameStem: cleanStem };
  }

  /**
   * Generate Official Letterhead Document (Email Draft or Business Letter) in both A4 PDF and Editable MS Word (.doc)
   * Restricted to Authorized Owner (Mr. Muhammad Akram +971 52 804 9351) & Creator (Mr. Murtaza Makkani +92 302 2190822)
   */
  public async generateOfficialLetterOrEmailDocuments(params: {
    docType: 'EMAIL' | 'LETTER';
    subject: string;
    recipient?: string;
    bodyText: string;
    requestedBy: string;
  }): Promise<{ pdfBuffer: Buffer | null; wordBuffer: Buffer; fileNameStem: string }> {
    const esc = (s: any) =>
      String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const dateStr = new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
    const refNo = `VV-${params.docType === 'EMAIL' ? 'EML' : 'LTR'}-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;

    const paragraphsHtml = String(params.bodyText || '')
      .split(/\n\s*\n|\n/)
      .map(p => p.trim())
      .filter(Boolean)
      .map(p => `<p style="margin:0 0 12px 0;line-height:1.65;font-size:11pt;color:#1e293b;">${esc(p)}</p>`)
      .join('\n');

    const bodyHtml = `
      <div style="background:#0f172a;color:#ffffff;padding:22px 26px;border-radius:10px;border-bottom:4px solid #f59e0b;margin-bottom:20px;">
        <div style="font-size:20pt;font-weight:900;letter-spacing:1px;color:#fde68a;">VINTAGE VIBES LUXURY APPAREL &amp; TRADING</div>
        <div style="font-size:10pt;color:#e2e8f0;margin-top:4px;">
          Al Ain &amp; Dubai Showroom, United Arab Emirates • Web: https://vintagevibesgk.com
        </div>
        <div style="font-size:9.5pt;color:#94a3b8;margin-top:3px;">
          Company Owner: Mr. Muhammad Akram (+971 52 804 9351) • Official WhatsApp: +971 55 418 6086
        </div>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:18px;border:none;">
        <tr>
          <td style="border:none;padding:4px 0;font-size:10pt;color:#475569;">
            <strong>Reference No:</strong> ${esc(refNo)}<br/>
            <strong>Document Type:</strong> Official ${params.docType === 'EMAIL' ? 'Executive Email Communication' : 'Corporate Letter'}
          </td>
          <td style="border:none;padding:4px 0;font-size:10pt;color:#475569;text-align:right;">
            <strong>Date:</strong> ${esc(dateStr)}<br/>
            <strong>Issued By:</strong> ${esc(params.requestedBy)}
          </td>
        </tr>
      </table>

      ${
        params.recipient
          ? `<div style="margin-bottom:14px;padding:10px 14px;background:#f8fafc;border-left:4px solid #0f172a;font-size:10.5pt;color:#0f172a;">
              <strong>To / Recipient:</strong> ${esc(params.recipient)}
            </div>`
          : ''
      }

      <div style="margin-bottom:18px;padding:12px 16px;background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;font-size:11.5pt;font-weight:bold;color:#92400e;">
        Subject: ${esc(params.subject)}
      </div>

      <div style="padding:8px 4px;min-height:320px;">
        ${paragraphsHtml}
      </div>

      <div style="margin-top:32px;padding-top:16px;border-top:2px solid #e2e8f0;">
        <div style="font-size:11pt;font-weight:bold;color:#0f172a;">Sincerely &amp; Best Regards,</div>
        <div style="font-size:13pt;font-weight:900;color:#b45309;margin-top:8px;">Mr. Muhammad Akram</div>
        <div style="font-size:10pt;color:#475569;">Managing Director &amp; Company Owner — Vintage Vibes UAE</div>
        <div style="font-size:9.5pt;color:#64748b;margin-top:2px;">Direct Contact: +971 52 804 9351 | Showroom: +971 55 418 6086 | https://vintagevibesgk.com</div>
      </div>
    `;

    const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      body { font-family: Georgia, 'Times New Roman', Arial, sans-serif; color: #0f172a; margin: 0; padding: 18px; }
    </style></head><body>${bodyHtml}</body></html>`;

    const wordBuffer = this.renderHtmlToWordDocBuffer(bodyHtml, `Vintage Vibes - ${params.subject}`);
    const pdfBuffer = await this.renderHtmlToPdfBuffer(fullHtml);
    const cleanStem = `Vintage_Vibes_${params.docType}_${params.subject.replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 32)}_${new Date().toISOString().slice(0, 10)}`;

    return { pdfBuffer, wordBuffer, fileNameStem: cleanStem };
  }

  /**
   * Helper: Load any image source (base64 data URI, raw base64, HTTP URL, or local file path) into a Buffer
   */
  private async resolveImageSourceToBuffer(source?: string | Buffer | null): Promise<Buffer | null> {
    if (!source) return null;
    if (Buffer.isBuffer(source)) return source;
    const str = String(source).trim();
    if (!str) return null;
    try {
      if (str.startsWith('data:image/')) {
        const b64 = str.split(',')[1] || '';
        return b64 ? Buffer.from(b64, 'base64') : null;
      }
      if (!str.startsWith('http') && !str.startsWith('/') && str.length > 200 && /^[A-Za-z0-9+/=\r\n]+$/.test(str.slice(0, 120))) {
        return Buffer.from(str, 'base64');
      }
      if (str.startsWith('http')) {
        const res = await fetch(str, { signal: AbortSignal.timeout(10000) });
        if (res.ok) {
          return Buffer.from(await res.arrayBuffer());
        }
        return null;
      }
      const cleanRel = str.replace(/^\//, '');
      const candidates = [
        path.join(process.cwd(), 'public', cleanRel),
        path.join(process.cwd(), cleanRel)
      ];
      for (const p of candidates) {
        if (fs.existsSync(p)) {
          return fs.readFileSync(p);
        }
      }
    } catch (e: any) {
      console.warn('[Baileys resolveImageSourceToBuffer notice]:', e?.message);
    }
    return null;
  }

  /**
   * Upscale & Studio-Enhance any uploaded photo into True 4K Ultra-HD Resolution (3840px)
   * Restricted to Authorized Owner (Mr. Muhammad Akram) & Creator (Mr. Murtaza Makkani)
   */
  public async enhanceAndUpscalePhotoTo4K(
    imageSource: string | Buffer,
    mode: 'CLEAN_4K_ENHANCE' | '4K_MARKETING_STUDIO' = 'CLEAN_4K_ENHANCE',
    captionTitle?: string
  ): Promise<Buffer | null> {
    const rawBuf = await this.resolveImageSourceToBuffer(imageSource);
    if (!rawBuf) return null;

    try {
      // 1. Studio Color Grading + Dynamic Range Normalization + Lanczos3 Super-Resolution to 3840px + Crisp Detail Sharpening
      const enhancedSubject = await sharp(rawBuf)
        .rotate()
        .resize({
          width: mode === '4K_MARKETING_STUDIO' ? 2000 : 3840,
          height: mode === '4K_MARKETING_STUDIO' ? 2100 : 3840,
          fit: 'inside',
          withoutEnlargement: false,
          kernel: sharp.kernel.lanczos3
        })
        .normalize()
        .modulate({ brightness: 1.04, saturation: 1.14 })
        .sharpen({ sigma: 1.25, m1: 1.0, m2: 2.2 })
        .png({ quality: 100, compressionLevel: 4 })
        .toBuffer();

      if (mode === 'CLEAN_4K_ENHANCE') {
        return enhancedSubject;
      }

      // 2. If 4K_MARKETING_STUDIO frame requested, place the 4K enhanced photo onto a 2160x2700 (4K Portrait) Luxury Studio Canvas
      const esc = (s: any) =>
        String(s ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');

      const titleText = (captionTitle || 'AUTHENTIC LUXURY VINTAGE ARCHIVE').toUpperCase().slice(0, 42);
      const canvasW = 2160;
      const canvasH = 2700;

      const studioBgSvg = `
        <svg width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#090d16"/>
              <stop offset="50%" stop-color="#111827"/>
              <stop offset="100%" stop-color="#090d16"/>
            </linearGradient>
            <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#f59e0b"/>
              <stop offset="50%" stop-color="#fde68a"/>
              <stop offset="100%" stop-color="#d97706"/>
            </linearGradient>
          </defs>
          <rect width="${canvasW}" height="${canvasH}" fill="url(#bgGrad)"/>
          <rect x="44" y="44" width="${canvasW - 88}" height="${canvasH - 88}" rx="32" fill="none" stroke="url(#goldGrad)" stroke-width="6"/>
          <rect x="80" y="76" width="460" height="68" rx="34" fill="url(#goldGrad)"/>
          <text x="310" y="121" font-family="Arial, sans-serif" font-size="30" font-weight="900" fill="#090d16" text-anchor="middle">4K ULTRA-HD STUDIO</text>
          <text x="${canvasW - 90}" y="122" font-family="Georgia, serif" font-size="44" font-weight="900" fill="#fde68a" text-anchor="end">VINTAGE VIBES UAE</text>

          <rect x="80" y="${canvasH - 360}" width="${canvasW - 160}" height="270" rx="26" fill="#0f172a" stroke="url(#goldGrad)" stroke-width="4"/>
          <text x="${canvasW / 2}" y="${canvasH - 255}" font-family="Arial, sans-serif" font-size="52" font-weight="900" fill="#fde68a" text-anchor="middle">${esc(titleText)}</text>
          <text x="${canvasW / 2}" y="${canvasH - 185}" font-family="Arial, sans-serif" font-size="34" font-weight="bold" fill="#f8fafc" text-anchor="middle">100% Authentic Imported Archive • Al Ain &amp; Dubai Showroom</text>
          <text x="${canvasW / 2}" y="${canvasH - 125}" font-family="Arial, sans-serif" font-size="30" font-weight="bold" fill="#fbbf24" text-anchor="middle">WhatsApp Order: +971 55 418 6086 • Owner: +971 52 804 9351 • vintagevibesgk.com</text>
        </svg>
      `;

      const framedPhoto = await sharp(enhancedSubject)
        .resize({ width: 1920, height: 2040, fit: 'inside', withoutEnlargement: false, kernel: sharp.kernel.lanczos3 })
        .png()
        .toBuffer();

      const meta = await sharp(framedPhoto).metadata();
      const fw = meta.width || 1800;
      const fh = meta.height || 1800;
      const leftPos = Math.max(80, Math.round((canvasW - fw) / 2));
      const topPos = Math.max(165, Math.round(165 + (2120 - fh) / 2));

      return await sharp(Buffer.from(studioBgSvg))
        .composite([{ input: framedPhoto, left: leftPos, top: topPos }])
        .png({ quality: 100, compressionLevel: 4 })
        .toBuffer();
    } catch (err: any) {
      console.warn('[Baileys enhanceAndUpscalePhotoTo4K error]:', err?.message);
      return rawBuf;
    }
  }

  /**
   * Generate a True 4K Resolution (2160 x 2700) Luxury Marketing Poster / Promotional Ad Banner
   * Restricted to Authorized Owner (Mr. Muhammad Akram) & Creator (Mr. Murtaza Makkani)
   */
  public async render4KMarketingPosterPng(params: {
    headline: string;
    subheadline?: string;
    offerBadge?: string;
    priceText?: string;
    productPhotoSource?: string | Buffer | null;
  }): Promise<Buffer | null> {
    const esc = (s: any) =>
      String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const W = 2160;
    const H = 2700;

    const cleanHeadline = (params.headline || 'EXCLUSIVE VINTAGE DROP').toUpperCase().slice(0, 34);
    const cleanSub = (params.subheadline || '1-of-1 Rare Imported Branded Collection • Limited Stock').slice(0, 68);
    const cleanBadge = (params.offerBadge || 'LIMITED VIP OFFER').toUpperCase().slice(0, 26);
    const cleanPrice = (params.priceText || 'SHOP NOW ON WHATSAPP & WEB').toUpperCase().slice(0, 32);

    const posterSvg = `
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bgLux" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#070a12"/>
            <stop offset="45%" stop-color="#111827"/>
            <stop offset="100%" stop-color="#1e1b4b"/>
          </linearGradient>
          <linearGradient id="goldLux" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#f59e0b"/>
            <stop offset="50%" stop-color="#fef08a"/>
            <stop offset="100%" stop-color="#d97706"/>
          </linearGradient>
          <radialGradient id="spotGlow" cx="50%" cy="48%" r="45%">
            <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.24"/>
            <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
          </radialGradient>
        </defs>

        <rect width="${W}" height="${H}" fill="url(#bgLux)"/>
        <circle cx="${W / 2}" cy="1280" r="920" fill="url(#spotGlow)"/>
        <rect x="42" y="42" width="${W - 84}" height="${H - 84}" rx="36" fill="none" stroke="url(#goldLux)" stroke-width="7"/>
        <rect x="66" y="66" width="${W - 132}" height="${H - 132}" rx="28" fill="none" stroke="#fde68a" stroke-opacity="0.25" stroke-width="2"/>

        <!-- Top Brand Header -->
        <text x="${W / 2}" y="165" font-family="Georgia, serif" font-size="68" font-weight="900" fill="url(#goldLux)" text-anchor="middle" letter-spacing="6">VINTAGE VIBES UAE</text>
        <text x="${W / 2}" y="222" font-family="Arial, sans-serif" font-size="28" font-weight="bold" fill="#cbd5e1" text-anchor="middle" letter-spacing="4">CURATED LUXURY THRIFT &amp; ARCHIVE STREETWEAR • AL AIN &amp; DUBAI</text>

        <!-- Offer Badge Pill -->
        <rect x="${W / 2 - 360}" y="265" width="720" height="78" rx="39" fill="url(#goldLux)"/>
        <text x="${W / 2}" y="316" font-family="Arial, sans-serif" font-size="34" font-weight="900" fill="#090d16" text-anchor="middle" letter-spacing="2">${esc(cleanBadge)}</text>

        <!-- Main Headline & Subheadline -->
        <text x="${W / 2}" y="445" font-family="Arial, sans-serif" font-size="76" font-weight="900" fill="#ffffff" text-anchor="middle">${esc(cleanHeadline)}</text>
        <text x="${W / 2}" y="512" font-family="Arial, sans-serif" font-size="34" font-weight="bold" fill="#fde68a" text-anchor="middle">${esc(cleanSub)}</text>

        <!-- Center Showcase Frame -->
        <rect x="170" y="565" width="${W - 340}" height="1580" rx="36" fill="#0b1120" stroke="url(#goldLux)" stroke-width="5"/>

        <!-- Bottom CTA Bar -->
        <rect x="120" y="2200" width="${W - 240}" height="170" rx="28" fill="url(#goldLux)"/>
        <text x="${W / 2}" y="2275" font-family="Arial, sans-serif" font-size="48" font-weight="900" fill="#090d16" text-anchor="middle">${esc(cleanPrice)}</text>
        <text x="${W / 2}" y="2335" font-family="Arial, sans-serif" font-size="30" font-weight="bold" fill="#1e293b" text-anchor="middle">100% Authentic USA/UK Archive • Express Delivery Across All UAE</text>

        <!-- Footer Contact Details -->
        <text x="${W / 2}" y="2465" font-family="Arial, sans-serif" font-size="36" font-weight="900" fill="#fde68a" text-anchor="middle">📱 WhatsApp Concierge: +971 55 418 6086  |  Owner: +971 52 804 9351</text>
        <text x="${W / 2}" y="2535" font-family="Arial, sans-serif" font-size="32" font-weight="bold" fill="#e2e8f0" text-anchor="middle">🌐 Instant Online Storefront: https://vintagevibesgk.com</text>
        <text x="${W / 2}" y="2600" font-family="Arial, sans-serif" font-size="22" fill="#94a3b8" text-anchor="middle">4K ULTRA-HD MASTER PROMOTIONAL POSTER • GENERATED BY VINTAGE VIBES AI STUDIO</text>
      </svg>
    `;

    try {
      const composites: sharp.OverlayOptions[] = [];
      const rawProduct = await this.resolveImageSourceToBuffer(params.productPhotoSource);
      if (rawProduct) {
        const enhancedProd = await sharp(rawProduct)
          .rotate()
          .resize({ width: 1740, height: 1500, fit: 'inside', withoutEnlargement: false, kernel: sharp.kernel.lanczos3 })
          .normalize()
          .modulate({ brightness: 1.04, saturation: 1.14 })
          .sharpen({ sigma: 1.2, m1: 1.0, m2: 2.0 })
          .png()
          .toBuffer();

        const pMeta = await sharp(enhancedProd).metadata();
        const pw = pMeta.width || 1600;
        const ph = pMeta.height || 1400;
        const left = Math.round((W - pw) / 2);
        const top = Math.round(565 + (1580 - ph) / 2);
        composites.push({ input: enhancedProd, left, top });
      }

      const final4KBuffer = await sharp(Buffer.from(posterSvg))
        .composite(composites)
        .png({ quality: 100, compressionLevel: 4 })
        .toBuffer();

      return final4KBuffer;
    } catch (err: any) {
      console.warn('[Baileys render4KMarketingPosterPng error]:', err?.message);
      return null;
    }
  }

  public getConnectedSession(): BaileysLiveSession | undefined {
    for (const session of this.sessions.values()) {
      if (session.sock && (session.status === 'CONNECTED' || (session.sock.user && !session.sock.ws?.isClosed))) {
        return session;
      }
    }
    return undefined;
  }

  /**
   * Unified message and photo dispatcher used across ERP (POS, Invoicing, Storefront Inquiries)
   * Supports strictly isolated per-operator WhatsApp sessions directly on the Dubai Server.
   */
  public async sendUnifiedMessage(
    to: string,
    text: string,
    imageUrl?: string | Buffer,
    requestedUserId?: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    let cleanDigits = String(to || '').replace(/\D/g, '');
    if (cleanDigits.startsWith('00')) {
      cleanDigits = cleanDigits.slice(2);
    }
    if (cleanDigits.length === 10 && cleanDigits.startsWith('05')) {
      cleanDigits = '971' + cleanDigits.slice(1);
    } else if (cleanDigits.length === 9 && cleanDigits.startsWith('5')) {
      cleanDigits = '971' + cleanDigits;
    } else if (cleanDigits.length === 11 && cleanDigits.startsWith('03')) {
      cleanDigits = '92' + cleanDigits.slice(1);
    }

    if (!cleanDigits || cleanDigits.length < 7) {
      return { success: false, error: 'Invalid recipient phone number.' };
    }
    const cleanJid = `${cleanDigits}@s.whatsapp.net`;

    let session: BaileysLiveSession | undefined;

    // 1. Check requestedUserId session first, then fall back to any active connected local session
    if (requestedUserId) {
      const userSession = this.getSession(requestedUserId);
      if (userSession && userSession.sock && (userSession.status === 'CONNECTED' || (userSession.sock.user && !userSession.sock.ws?.isClosed))) {
        session = userSession;
      }
    }
    if (!session) {
      session = this.getConnectedSession();
    }

    // 2. Self-heal if credentials exist on disk / memory but socket was temporarily dropped
    if (!session || !session.sock) {
      try {
        await this.initSocket(requestedUserId || PRIMARY_SESSION_KEY, undefined, { isAutoReconnect: true });
        for (let i = 0; i < 40; i++) {
          await new Promise(r => setTimeout(r, 250));
          session = this.getConnectedSession();
          if (session && session.sock && (session.status === 'CONNECTED' || (session.sock.user && !session.sock.ws?.isClosed))) {
            break;
          }
        }
      } catch {}
    }

    if (session && session.sock) {
      try {
        if (imageUrl) {
          const res = await this.sendImage(session.userId, cleanJid, imageUrl, text);
          return { success: true, messageId: res?.key?.id };
        } else {
          const res = await this.sendMessage(session.userId, cleanJid, text);
          return { success: true, messageId: res?.key?.id };
        }
      } catch (err: any) {
        return { success: false, error: err?.message || 'Failed to send via Direct WhatsApp socket.' };
      }
    }

    return {
      success: false,
      error: 'No WhatsApp device is currently connected on the Dubai Server. Please link your phone in ERP.'
    };
  }

  /**
   * Discover Channels (Newsletters) subscribed or administered by the connected WhatsApp socket
   */
  public async discoverChannels(userId: string): Promise<Array<{ id: string; name: string; role: string; inviteLink?: string }>> {
    const session = this.getSession(userId);
    if (!session?.sock || session.status !== 'CONNECTED') {
      return [];
    }

    try {
      if (typeof session.sock.newsletterSubscribed === 'function') {
        const list = await session.sock.newsletterSubscribed();
        if (Array.isArray(list) && list.length > 0) {
          return list.map((ch: any) => ({
            id: ch.id || ch.jid,
            name: ch.name || ch.subject || ch.thread_metadata?.name?.text || 'WhatsApp Channel',
            role: ch.viewer_metadata?.role || 'ADMIN',
            inviteLink: ch.invite ? `https://whatsapp.com/channel/${ch.invite}` : undefined
          }));
        }
      }
    } catch (err: any) {
      console.warn('[Baileys] Newsletter discovery notice:', err?.message);
    }

    return [];
  }

  /**
   * Resolve exact Newsletter Metadata (JID, Title, Subscribers) from an invite code or link
   */
  public async resolveNewsletterByInvite(userId: string, inviteUrlOrCode: string): Promise<{
    id: string;
    name: string;
    role?: string;
    subscribers?: number;
    inviteLink: string;
  }> {
    const raw = (inviteUrlOrCode || '').trim();
    const cleaned = raw.replace(/@newsletter$/i, '');
    const code = cleaned.replace(/.*\/channel\//i, '').replace(/[^a-zA-Z0-9]/g, '').trim();
    const session = this.getSession(userId);

    // Standard numeric JID fallback if socket resolution is offline
    const defaultNumericJid = `${code}@newsletter`;

    if (!session?.sock) {
      return {
        id: defaultNumericJid,
        name: 'WhatsApp Channel',
        inviteLink: `https://whatsapp.com/channel/${code}`
      };
    }

    try {
      if (typeof session.sock.newsletterMetadata === 'function') {
        const meta = await session.sock.newsletterMetadata('invite', code);
        const resolvedId = meta.id || defaultNumericJid;
        const resolvedName = meta.name || meta.thread_metadata?.name?.text || 'Vintage';
        console.log(`[Baileys] Successfully resolved channel "${code}":`, resolvedId, resolvedName);
        return {
          id: resolvedId,
          name: resolvedName,
          role: meta.viewer_metadata?.role || 'ADMIN',
          subscribers: meta.subscribers_count || meta.thread_metadata?.subscribers_count,
          inviteLink: `https://whatsapp.com/channel/${code}`
        };
      }
    } catch (err: any) {
      console.warn(`[Baileys] Could not fetch newsletter metadata for ${code}:`, err?.message);
    }

    return {
      id: defaultNumericJid,
      name: 'Vintage',
      inviteLink: `https://whatsapp.com/channel/${code}`
    };
  }

  /**
   * Fetch Participating WhatsApp Groups from connected phone (Zero fake groups)
   */
  public async fetchUserGroups(userId: string): Promise<Array<{ id: string; name: string; size: number }>> {
    const session = this.getSession(userId);
    if (!session?.sock || session.status !== 'CONNECTED') {
      return [];
    }

    try {
      if (typeof session.sock.groupFetchAllParticipating === 'function') {
        const groups = await session.sock.groupFetchAllParticipating();
        return Object.values(groups).map((g: any) => ({
          id: g.id,
          name: g.subject || 'VIP Group',
          size: g.participants?.length || 0
        }));
      }
    } catch (err: any) {
      console.warn('[Baileys] Error fetching participating groups:', err?.message);
    }
    return [];
  }

  private lastContactResyncAt = 0;

  /**
   * Force WhatsApp App-State contact snapshot resync to extract all saved phonebook names (fullName / firstName)
   */
  public async resyncWhatsAppContacts(userId: string = 'usr-admin-1', force = false): Promise<number> {
    const session = this.getSession(userId) || this.getConnectedSession();
    if (!session?.sock || session.status !== 'CONNECTED') {
      return session?.contacts?.size || 0;
    }

    const now = Date.now();
    if (!force && now - this.lastContactResyncAt < 45000) {
      return session.contacts?.size || 0;
    }
    this.lastContactResyncAt = now;

    try {
      const sessionDir = path.join(this.authBaseDir, `session_${session.userId}`);
      // Clear app-state-sync-version files on disk & in authState so Baileys requests full contact snapshot from WhatsApp
      if (fs.existsSync(sessionDir)) {
        const files = fs.readdirSync(sessionDir);
        for (const f of files) {
          if (f.startsWith('app-state-sync-version-') && f.endsWith('.json')) {
            try {
              fs.unlinkSync(path.join(sessionDir, f));
            } catch {}
          }
        }
      }
      if (session.sock.authState?.keys?.set) {
        await session.sock.authState.keys.set({
          'app-state-sync-version': {
            critical_unblock_low: null as any,
            regular_high: null as any,
            regular_low: null as any
          }
        });
      }
      if (typeof session.sock.resyncAppState === 'function') {
        console.log(`[Baileys] Resyncing WhatsApp App-State contact snapshot for ${session.userId}...`);
        await session.sock.resyncAppState(['critical_unblock_low', 'regular_high', 'regular_low'], false);
        if (typeof session.sock.ev?.flush === 'function') {
          session.sock.ev.flush();
        }
        if (session.contacts && session.contacts.size > 0 && fs.existsSync(sessionDir)) {
          fs.writeFileSync(
            path.join(sessionDir, 'contacts-cache.json'),
            JSON.stringify(Array.from(session.contacts.values()), null, 2),
            'utf8'
          );
        }
        console.log(`[Baileys] App-State contact snapshot resynced! Named contacts count: ${session.contacts?.size || 0}`);
      }
    } catch (err: any) {
      console.warn('[Baileys] resyncWhatsAppContacts notice:', err?.message);
    }

    return session.contacts?.size || 0;
  }

  private formatPhoneDisplayName(cleanDigits: string): string {
    if (cleanDigits.startsWith('97150') || cleanDigits.startsWith('97154') || cleanDigits.startsWith('97156')) {
      return `UAE e& WhatsApp (+${cleanDigits})`;
    }
    if (cleanDigits.startsWith('97152') || cleanDigits.startsWith('97155') || cleanDigits.startsWith('97158')) {
      return `UAE du WhatsApp (+${cleanDigits})`;
    }
    if (cleanDigits.startsWith('971')) return `UAE WhatsApp (+${cleanDigits})`;
    if (cleanDigits.startsWith('966')) return `KSA WhatsApp (+${cleanDigits})`;
    if (cleanDigits.startsWith('92')) return `PK WhatsApp (+${cleanDigits})`;
    if (cleanDigits.startsWith('91')) return `IN WhatsApp (+${cleanDigits})`;
    if (cleanDigits.startsWith('63')) return `PH WhatsApp (+${cleanDigits})`;
    if (cleanDigits.startsWith('880')) return `BD WhatsApp (+${cleanDigits})`;
    if (cleanDigits.startsWith('977')) return `NP WhatsApp (+${cleanDigits})`;
    if (cleanDigits.startsWith('968')) return `Oman WhatsApp (+${cleanDigits})`;
    if (cleanDigits.startsWith('965')) return `Kuwait WhatsApp (+${cleanDigits})`;
    if (cleanDigits.startsWith('974')) return `Qatar WhatsApp (+${cleanDigits})`;
    if (cleanDigits.startsWith('973')) return `Bahrain WhatsApp (+${cleanDigits})`;
    if (cleanDigits.startsWith('20')) return `Egypt WhatsApp (+${cleanDigits})`;
    if (cleanDigits.startsWith('44')) return `UK WhatsApp (+${cleanDigits})`;
    if (cleanDigits.startsWith('1')) return `US/CA WhatsApp (+${cleanDigits})`;
    return `WhatsApp Contact (+${cleanDigits})`;
  }

  /**
   * Extract all genuine WhatsApp contacts & synced phone numbers from the linked WhatsApp device
   */
  public async fetchUserContacts(
    userId: string,
    forceResync = false
  ): Promise<Array<{ id: string; name: string; phone: string; isNamed?: boolean }>> {
    const session = this.getSession(userId) || this.getConnectedSession();
    if (session?.sock && session.status === 'CONNECTED' && (forceResync || (session.contacts?.size || 0) < 50)) {
      await this.resyncWhatsAppContacts(session.userId, forceResync);
    }

    const contactMap = new Map<string, { id: string; name: string; phone: string; isNamed?: boolean }>();

    // Locate active session directory on disk
    const sessionDirs: string[] = [];
    if (session?.userId) {
      const primaryDir = path.join(this.authBaseDir, `session_${session.userId}`);
      if (fs.existsSync(primaryDir)) sessionDirs.push(primaryDir);
    }
    try {
      if (fs.existsSync(this.authBaseDir)) {
        const entries = fs.readdirSync(this.authBaseDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && entry.name.startsWith('session_')) {
            const full = path.join(this.authBaseDir, entry.name);
            if (!sessionDirs.includes(full)) sessionDirs.push(full);
          }
        }
      }
    } catch {}

    const resolveLidOrPhone = (rawDigits: string): string => {
      const clean = (rawDigits || '').replace(/\D/g, '');
      if (!clean) return '';
      if (clean.length > 13) {
        for (const sDir of sessionDirs) {
          const revFile = path.join(sDir, `lid-mapping-${clean}_reverse.json`);
          if (fs.existsSync(revFile)) {
            try {
              const mapped = JSON.parse(fs.readFileSync(revFile, 'utf8'));
              const mappedClean = String(mapped || '').replace(/\D/g, '');
              if (mappedClean.length >= 7 && mappedClean.length <= 13) {
                return mappedClean;
              }
            } catch {}
          }
        }
        return ''; // Never return raw 14-15 digit @lid as a phone number
      }
      return clean.length >= 7 && clean.length <= 13 ? clean : '';
    };

    // 1. Include authentic named contacts synced via Baileys events & contacts-cache.json
    for (const sDir of sessionDirs) {
      const cacheFile = path.join(sDir, 'contacts-cache.json');
      if (fs.existsSync(cacheFile)) {
        try {
          const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
          if (Array.isArray(cached)) {
            for (const c of cached) {
              const resolvedPhone = resolveLidOrPhone(c?.phone || c?.id || '');
              const cName = String(c?.name || '').trim();
              if (resolvedPhone && cName && !cName.startsWith('WhatsApp Member') && !cName.includes('WhatsApp (+')) {
                contactMap.set(resolvedPhone, {
                  id: `wa-contact-${resolvedPhone}`,
                  name: cName,
                  phone: `+${resolvedPhone}`,
                  isNamed: true
                });
              }
            }
          }
        } catch {}
      }
    }

    if (session?.contacts) {
      for (const [rawKey, contact] of session.contacts.entries()) {
        const resolvedPhone = resolveLidOrPhone(contact.phone || rawKey);
        const cName = String(contact.name || '').trim();
        if (resolvedPhone && cName && !cName.startsWith('WhatsApp Member')) {
          contactMap.set(resolvedPhone, {
            id: `wa-contact-${resolvedPhone}`,
            name: cName,
            phone: `+${resolvedPhone}`,
            isNamed: true
          });
        }
      }
    }

    // 2. Include linked operator phone if registered
    try {
      const selfRaw = session?.phoneNumber || session?.sock?.user?.id?.split(':')[0] || '';
      const cleanSelf = resolveLidOrPhone(selfRaw);
      if (cleanSelf && !contactMap.has(cleanSelf)) {
        contactMap.set(cleanSelf, {
          id: `wa-contact-${cleanSelf}`,
          name: session?.sock?.user?.name || 'My Linked WhatsApp Phone',
          phone: `+${cleanSelf}`,
          isNamed: true
        });
      }
    } catch {}

    // 3. Scan all lid-mapping-<PHONE>.json files synced from the linked WhatsApp device (1,370+ real phone numbers)
    for (const sDir of sessionDirs) {
      try {
        const files = fs.readdirSync(sDir);
        for (const file of files) {
          if (!file.startsWith('lid-mapping-') || !file.endsWith('.json') || file.endsWith('_reverse.json')) {
            continue;
          }
          const phonePart = file.slice('lid-mapping-'.length, -'.json'.length).replace(/\D/g, '');
          if (phonePart.length >= 8 && phonePart.length <= 13 && !/^0+$/.test(phonePart)) {
            if (!contactMap.has(phonePart)) {
              contactMap.set(phonePart, {
                id: `wa-contact-${phonePart}`,
                name: this.formatPhoneDisplayName(phonePart),
                phone: `+${phonePart}`,
                isNamed: false
              });
            }
          }
        }
      } catch (err: any) {
        console.warn('[Baileys] Error scanning lid-mapping directory:', err?.message);
      }
    }

    // 4. Also harvest any real phone numbers from participating WhatsApp groups
    if (session?.sock && session.status === 'CONNECTED' && typeof session.sock.groupFetchAllParticipating === 'function') {
      try {
        const groups = await session.sock.groupFetchAllParticipating();
        for (const g of Object.values(groups) as any[]) {
          if (!Array.isArray(g?.participants)) continue;
          for (const p of g.participants) {
            const pJid = p?.phoneNumber || p?.jid || p?.id || '';
            const cleanP = resolveLidOrPhone(pJid);
            if (!cleanP) continue;
            const pName = String(p?.notify || p?.name || '').trim();
            if (pName && !pName.startsWith('WhatsApp Member')) {
              contactMap.set(cleanP, {
                id: `wa-contact-${cleanP}`,
                name: pName,
                phone: `+${cleanP}`,
                isNamed: true
              });
            } else if (!contactMap.has(cleanP)) {
              contactMap.set(cleanP, {
                id: `wa-contact-${cleanP}`,
                name: this.formatPhoneDisplayName(cleanP),
                phone: `+${cleanP}`,
                isNamed: false
              });
            }
          }
        }
      } catch {}
    }

    // Sort: Named contacts first, then UAE (+971) numbers, then all other numbers
    return Array.from(contactMap.values()).sort((a, b) => {
      if (Boolean(a.isNamed) !== Boolean(b.isNamed)) {
        return a.isNamed ? -1 : 1;
      }
      const aUae = a.phone.startsWith('+971');
      const bUae = b.phone.startsWith('+971');
      if (aUae !== bUae) {
        return aUae ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  }

  /**
   * Post Garment Photo Drop with CTAs to WhatsApp Newsletter Channel
   * Supports Dual-Mode:
   * 1. API Key Mode (Official Meta Cloud API / Custom Gateway) - Real native photo media on Meta's CDN
   * 2. Free Direct Mode (Baileys Linked Phone) - Zero cost, rich drop cards with direct photo view links & CTAs
   */
  public async postToChannel(userId: string, channelJid: string, payload: {
    imageUrl?: string;
    imageBuffer?: Buffer;
    caption: string;
    apiKeyConfig?: {
      enabled?: boolean;
      provider?: 'META_CLOUD_API' | 'CUSTOM_GATEWAY';
      accessToken?: string;
      phoneNumberId?: string;
      apiUrl?: string;
    };
  }): Promise<any> {
    let targetJid = (channelJid || '').trim();
    // If it's an invite link or invite code, resolve real numeric JID
    if (targetJid.includes('/channel/') || targetJid.startsWith('0029')) {
      try {
        const resolved = await this.resolveNewsletterByInvite(userId, targetJid);
        if (resolved?.id && resolved.id.includes('@newsletter')) {
          targetJid = resolved.id;
        }
      } catch (err: any) {
        console.warn(`[Baileys] Could not auto-resolve channel ${targetJid}:`, err?.message);
      }
    }

    if (!targetJid.endsWith('@newsletter')) {
      targetJid = `${targetJid.replace(/[^0-9a-zA-Z_-]/g, '')}@newsletter`;
    }

    // Clean caption: Format text nicely
    let cleanCaption = (payload.caption || '')
      .replace(/📸\s*\*Direct Photo Previews:[\s\S]*?(?=(\n\n[⚡📢👉💳💬🏷️📏💰]|$))/g, '')
      .replace(/•\s*(Front|Back|Label\/Tag):[^\n]*/g, '')
      .replace(/📸\s*\*Garment Photo Preview:\*[^\n]*/g, '')
      .replace(/\n\s*\n\s*\n+/g, '\n\n')
      .trim();

    // ============================================================
    // MODE 2: OFFICIAL API KEY / META CLOUD API / GATEWAY DISPATCH
    // ============================================================
    if (payload.apiKeyConfig?.enabled && payload.apiKeyConfig.accessToken) {
      try {
        console.log(`[WhatsApp Channel Post] Dispatching via API Key Mode to ${targetJid}...`);
        if (payload.apiKeyConfig.provider === 'CUSTOM_GATEWAY' && payload.apiKeyConfig.apiUrl) {
          const gwResp = await fetch(payload.apiKeyConfig.apiUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${payload.apiKeyConfig.accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              to: targetJid,
              recipient: targetJid,
              media: payload.imageUrl,
              image: payload.imageUrl,
              caption: cleanCaption
            })
          });
          const gwData = await gwResp.json().catch(() => null);
          if (gwResp.ok) {
            console.log('[WhatsApp Channel Post] Successfully posted via Custom Gateway API:', gwData);
            return { success: true, mode: 'API_KEY', provider: 'CUSTOM_GATEWAY', data: gwData };
          }
          console.warn('[WhatsApp Channel Post] Gateway returned error:', gwResp.status, gwData);
        } else if (payload.apiKeyConfig.phoneNumberId) {
          const metaUrl = `https://graph.facebook.com/v21.0/${payload.apiKeyConfig.phoneNumberId}/messages`;
          const metaResp = await fetch(metaUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${payload.apiKeyConfig.accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              recipient_type: 'individual',
              to: targetJid,
              type: payload.imageUrl ? 'image' : 'text',
              ...(payload.imageUrl ? {
                image: {
                  link: payload.imageUrl,
                  caption: cleanCaption
                }
              } : {
                text: { body: cleanCaption }
              })
            })
          });
          const metaData = await metaResp.json().catch(() => null);
          if (metaResp.ok) {
            console.log('[WhatsApp Channel Post] Successfully posted via Meta Cloud API:', metaData);
            return { success: true, mode: 'API_KEY', provider: 'META_CLOUD_API', data: metaData };
          }
          console.warn('[WhatsApp Channel Post] Meta Cloud API error:', metaResp.status, metaData);
        }
      } catch (apiErr: any) {
        console.warn('[WhatsApp Channel Post] API Key dispatch failed, falling back to Free Mode:', apiErr?.message);
      }
    }

    // ============================================================
    // MODE 1: FREE DIRECT MODE (BAILEYS LINKED PHONE SOCKET OR PERSISTENT BRIDGE)
    // ============================================================
    const session = this.getSession(userId);
    if (!session?.sock || session.status !== 'CONNECTED') {
      const bridgeUrl = process.env.RAILWAY_WORKER_URL || 'https://vintage-vibes-erp-production.up.railway.app';
      console.log(`[Baileys postToChannel] Local socket not connected. Forwarding to worker bridge: ${bridgeUrl}`);
      try {
        let channelCaption = cleanCaption;
        if (payload.imageUrl && !channelCaption.includes(payload.imageUrl)) {
          channelCaption = channelCaption.replace(
            /(💳 \*1-Tap Instant Checkout|💳 \*Instant Mobile Checkout)/,
            `📸 *High-Res Garment Photo:*\n👉 ${payload.imageUrl}\n\n$1`
          );
          if (!channelCaption.includes(payload.imageUrl)) {
            channelCaption = `${channelCaption}\n\n📸 *High-Res Garment Photo:*\n👉 ${payload.imageUrl}`;
          }
        }

        const bRes = await fetch(`${bridgeUrl.replace(/\/$/, '')}/post-channel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channelJid: targetJid,
            caption: channelCaption
          }),
          signal: AbortSignal.timeout(15000)
        });
        const bData = await bRes.json().catch(() => ({}));
        if (bRes.ok && (bData.success || bData.messageId)) {
          console.log(`[Baileys postToChannel] Successfully delivered via persistent bridge:`, bData);
          return { success: true, mode: 'WORKER_BRIDGE', messageId: bData.messageId, channelJid: targetJid };
        }
        throw new Error(bData.error || 'Failed to dispatch via persistent worker bridge');
      } catch (fErr: any) {
        console.warn(`[Baileys postToChannel] Persistent worker bridge error:`, fErr?.message);
        throw new Error(`WhatsApp is not connected locally and bridge dispatch failed: ${fErr?.message}`);
      }
    }

    // 1. Fetch / Download image URL into in-memory buffer
    let imageBuffer: Buffer | null = null;
    if (payload.imageBuffer && Buffer.isBuffer(payload.imageBuffer)) {
      imageBuffer = payload.imageBuffer;
    } else if (payload.imageUrl) {
      if (payload.imageUrl.startsWith('http')) {
        try {
          console.log(`[Baileys Channel Post] Fetching image for thumbnail: ${payload.imageUrl}`);
          const res = await fetch(payload.imageUrl, { signal: AbortSignal.timeout(8000) });
          if (res.ok) {
            imageBuffer = Buffer.from(await res.arrayBuffer());
          }
        } catch (fetchErr: any) {
          console.warn('[Baileys Channel Post] Error downloading image:', fetchErr?.message);
        }
      } else {
        const cleanPath = payload.imageUrl.replace(/^\//, '');
        const candidates = [
          path.join(process.cwd(), 'public', cleanPath),
          path.join(process.cwd(), cleanPath)
        ];
        for (const p of candidates) {
          if (fs.existsSync(p)) {
            imageBuffer = fs.readFileSync(p);
            break;
          }
        }
      }
    }

    // Prepare thumbnail buffer via Sharp
    const prepared = imageBuffer ? await this.prepareJpegImageAndThumbnail(imageBuffer) : null;
    const finalMediaBuffer = prepared?.imageBuffer || imageBuffer;

    // 2. Primary Delivery: Dispatch Native Photo Directly to WhatsApp Channel
    if (finalMediaBuffer || payload.imageUrl) {
      try {
        console.log(`[Baileys Channel Post] Dispatching native photo to newsletter ${targetJid}`);
        const imageResult = await session.sock.sendMessage(targetJid, {
          image: finalMediaBuffer || { url: payload.imageUrl || '' },
          caption: cleanCaption,
          mimetype: 'image/jpeg',
          jpegThumbnail: prepared?.thumbnailBuffer
        }, {
          additionalAttributes: { mediatype: 'image' }
        });
        return imageResult;
      } catch (imgErr: any) {
        console.warn(`[Baileys Channel Post] Native image delivery blip (${imgErr?.message}), falling back to text preview card`);
      }
    }

    // 3. Fallback: Format drop post card with direct photo link so photo is ALWAYS viewable in channel feed
    let dropCardText = cleanCaption;
    const isHttpUrl = typeof payload.imageUrl === 'string' && payload.imageUrl.startsWith('http');
    if (isHttpUrl && !dropCardText.includes(payload.imageUrl)) {
      dropCardText = dropCardText.replace(
        /(💳 \*1-Tap Instant Checkout|💳 \*Instant Storefront Checkout)/,
        `📸 *Direct High-Res Photo:*\n👉 ${payload.imageUrl}\n\n$1`
      );
    }

    const urlMatch = dropCardText.match(/https?:\/\/[^\s]+/);
    const targetUrl = payload.imageUrl || (urlMatch ? urlMatch[0] : 'https://vintagevibesgk.com');

    console.log(`[Baileys Channel Post] Dispatching drop post card to newsletter ${targetJid}`);
    const cardResult = await session.sock.sendMessage(targetJid, {
      text: dropCardText,
      linkPreview: prepared ? {
        'canonical-url': targetUrl,
        'matched-text': targetUrl,
        title: dropCardText.split('\n')[0].replace(/[🔥*]/g, '').trim(),
        description: '1-of-1 Rare Vintage Piece • Tap link to view full photo & instant checkout',
        jpegThumbnail: prepared.thumbnailBuffer
      } : undefined
    });

    return cardResult;
  }
}

export const baileysManager = new BaileysManager();
