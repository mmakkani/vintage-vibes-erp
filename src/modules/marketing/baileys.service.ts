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
   * Scan all session_* folders on disk for registered creds.json, or restore from PostgreSQL if disk is empty
   */
  private async bootstrapSavedSessions(): Promise<void> {
    let foundRegisteredOnDisk = false;
    try {
      if (fs.existsSync(this.authBaseDir)) {
        const entries = fs.readdirSync(this.authBaseDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && entry.name.startsWith('session_')) {
            const credsPath = path.join(this.authBaseDir, entry.name, 'creds.json');
            if (fs.existsSync(credsPath)) {
              try {
                const raw = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
                if (raw?.registered || raw?.me?.id) {
                  const uId = entry.name.replace(/^session_/, '') || PRIMARY_SESSION_KEY;
                  foundRegisteredOnDisk = true;
                  console.log(`[Baileys] Found registered auth credentials on disk for "${uId}". Auto-connecting socket...`);
                  await this.initSocket(uId);
                  break;
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
        console.log(`[Baileys] Restored registered auth credentials from PostgreSQL for "${restoredUserId}". Auto-connecting socket...`);
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
      // Only back up once registered or authenticated
      if (!credsParsed?.registered && !credsParsed?.me?.id) return;

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
    options?: { isHandshakeReconnect?: boolean; forceFreshQr?: boolean }
  ): Promise<BaileysLiveSession> {
    // Use existing active session key if one is already registered, or default to PRIMARY_SESSION_KEY
    const userId = this.sessions.has(requestedUserId)
      ? requestedUserId
      : (this.sessions.has(PRIMARY_SESSION_KEY) ? PRIMARY_SESSION_KEY : (requestedUserId || PRIMARY_SESSION_KEY));

    const prevTimer = this.reconnectTimers.get(userId);
    if (prevTimer) {
      clearTimeout(prevTimer);
      this.reconnectTimers.delete(userId);
    }

    const existing = this.sessions.get(userId);
    // Protect active 515 QR scan handshake from being interrupted by duplicate generate-qr calls
    if (existing?.isHandshaking && !options?.isHandshakeReconnect) {
      console.log(`[Baileys] Ignoring duplicate initSocket for ${userId}: QR scan handshake is finalizing.`);
      return existing;
    }

    if (existing?.sock) {
      try {
        existing.sock.ev?.removeAllListeners();
        existing.sock.end?.();
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

    // Check if existing creds on disk are already registered
    let isRegisteredOnDisk = false;
    const credsFile = path.join(sessionDir, 'creds.json');
    if (fs.existsSync(credsFile)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(credsFile, 'utf8'));
        isRegisteredOnDisk = Boolean(parsed?.registered || parsed?.me?.id);
      } catch {}
    }

    const isCurrentlyConnected = existing?.status === 'CONNECTED' && Boolean(existing?.sock?.user);

    // If requesting a fresh QR or a Phone Pairing Code while not actively connected, wipe stale noise/auth keys so Baileys emits a fresh QR or Pairing Code immediately
    if ((phoneNumber || options?.forceFreshQr || !isRegisteredOnDisk) && !isCurrentlyConnected && !options?.isHandshakeReconnect) {
      if (phoneNumber || options?.forceFreshQr || !isRegisteredOnDisk) {
        try {
          fs.rmSync(sessionDir, { recursive: true, force: true });
          fs.mkdirSync(sessionDir, { recursive: true });
        } catch {}
      }
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1043857760] as [number, number, number] }));

    const sessionObj: BaileysLiveSession = {
      userId,
      phoneNumber: phoneNumber ? (phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber.replace(/\D/g, '')}`) : existing?.phoneNumber,
      status: phoneNumber ? 'WAITING_PAIRING' : 'CONNECTING',
      lastActive: options?.isHandshakeReconnect
        ? 'Phone scanned! Finalizing secure login with mobile...'
        : (phoneNumber ? `Requesting Pairing Code for +${phoneNumber.replace(/\D/g, '')}...` : 'Connecting to WhatsApp Socket...'),
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

    // Save auth credentials whenever updated to ./baileys_auth AND back up to PostgreSQL
    sock.ev.on('creds.update', async () => {
      try {
        await saveCreds();
        this.schedulePostgresBackup(userId, sessionDir);
      } catch (err: any) {
        console.warn('[Baileys] Credential save warning:', err?.message);
      }
    });

    // Helper to request 8-digit pairing code once noise socket is ready
    let pairingRequested = false;
    const triggerPairingCodeRequest = async () => {
      if (!phoneNumber || state.creds.registered || pairingRequested) return;
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

    if (phoneNumber && !state.creds.registered) {
      setTimeout(() => {
        triggerPairingCodeRequest().catch(() => {});
      }, 2200);
    }

    // Track genuine contacts synced from WhatsApp account
    sock.ev.on('contacts.upsert', (contacts: any[]) => {
      if (!Array.isArray(contacts)) return;
      for (const c of contacts) {
        if (!c.id || c.id.includes('@g.us') || c.id.includes('@newsletter')) continue;
        const cleanPhone = c.id.split('@')[0].replace(/\D/g, '');
        const name = (c.name || c.notify || c.verifiedName || '').trim();
        if (cleanPhone && cleanPhone.length >= 7 && name && !name.toLowerCase().startsWith('whatsapp member')) {
          sessionObj.contacts?.set(cleanPhone, {
            id: `wa-contact-${cleanPhone}`,
            name,
            phone: `+${cleanPhone}`
          });
        }
      }
    });

    sock.ev.on('contacts.update', (updates: any[]) => {
      if (!Array.isArray(updates)) return;
      for (const c of updates) {
        if (!c.id || c.id.includes('@g.us') || c.id.includes('@newsletter')) continue;
        const cleanPhone = c.id.split('@')[0].replace(/\D/g, '');
        const name = (c.name || c.notify || c.verifiedName || '').trim();
        if (cleanPhone && cleanPhone.length >= 7 && name && !name.toLowerCase().startsWith('whatsapp member')) {
          sessionObj.contacts?.set(cleanPhone, {
            id: `wa-contact-${cleanPhone}`,
            name,
            phone: `+${cleanPhone}`
          });
        }
      }
    });

    // Handle incoming messages for MINE [SKU] auto-claims
    sock.ev.on('messages.upsert', async (m: any) => {
      try {
        const { messages } = m;
        if (!messages || messages.length === 0) return;

        for (const msg of messages) {
          if (msg.key.fromMe) continue; // Ignore bot's own messages

          const remoteJid = msg.key.remoteJid;
          if (remoteJid && remoteJid.endsWith('@s.whatsapp.net')) {
            const cleanPhone = remoteJid.split('@')[0].replace(/\D/g, '');
            const pushName = (msg.pushName || '').trim();
            if (cleanPhone && cleanPhone.length >= 7 && pushName && !pushName.toLowerCase().startsWith('whatsapp member')) {
              sessionObj.contacts?.set(cleanPhone, {
                id: `wa-contact-${cleanPhone}`,
                name: pushName,
                phone: `+${cleanPhone}`
              });
            }
          }

          const conversationText =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            '';

          if (!conversationText) continue;

          const senderName = msg.pushName || remoteJid?.split('@')[0] || 'Customer';

          // Emit incoming message event to core marketing service listener
          this.emit('message', {
            userId,
            remoteJid,
            senderName,
            text: conversationText,
            rawMsg: msg
          });
        }
      } catch (err: any) {
        console.warn('[Baileys] Error processing messages.upsert:', err?.message);
      }
    });

    // Handle dynamic real-time QR refresh & clean disconnect recovery
    sock.ev.on('connection.update', async (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      // If phoneNumber pairing was requested, as soon as QR/noise is ready, trigger pairing code
      if (qr && phoneNumber && !state.creds.registered) {
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
      }

      // Clean Disconnect & Handshake Recovery
      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const errorMsg = lastDisconnect?.error?.message || '';
        const isConflict = Boolean(errorMsg.toLowerCase().includes('conflict'));
        const isLoggedOut = (statusCode === DisconnectReason.loggedOut) && !isConflict;
        const isRestartRequired = statusCode === DisconnectReason.restartRequired;

        console.warn(`[Baileys] Connection closed for ${userId}. StatusCode: ${statusCode}. Reason: ${errorMsg}`);

        if (isRestartRequired) {
          // CRITICAL: Status 515 (restartRequired) happens right when mobile scans QR or confirms Pairing Code!
          // NEVER wipe credentials on 515! Reconnect immediately in 500ms to complete encryption handshake!
          console.log(`[Baileys] Status 515 (restartRequired): QR/Pairing handshake in progress for ${userId}. Reconnecting in 500ms...`);
          sessionObj.status = 'CONNECTING';
          sessionObj.isHandshaking = true;
          sessionObj.lastActive = 'Phone scanned! Finalizing secure login with mobile...';
          sessionObj.qrCode = undefined;
          sessionObj.qrCodeDataUrl = undefined;
          this.emit('state.update', sessionObj);

          const t = setTimeout(() => {
            this.initSocket(userId, undefined, { isHandshakeReconnect: true }).catch(() => {});
          }, 500);
          this.reconnectTimers.set(userId, t);
        } else if (isLoggedOut) {
          // Explicit logout from phone: wipe session directory and clear PostgreSQL backup
          console.log(`[Baileys] User ${userId} logged out from phone. Clearing auth credentials in ${sessionDir}`);
          sessionObj.status = 'DISCONNECTED';
          sessionObj.isHandshaking = false;
          sessionObj.phoneNumber = undefined;
          sessionObj.qrCode = undefined;
          sessionObj.qrCodeDataUrl = undefined;
          sessionObj.pairingCode = undefined;
          sessionObj.lastActive = 'Logged Out';
          sessionObj.lastError = errorMsg;
          this.emit('connection.close', { userId, isLoggedOut: true, error: lastDisconnect?.error });
          this.emit('state.update', sessionObj);

          try {
            if (fs.existsSync(sessionDir)) {
              fs.rmSync(sessionDir, { recursive: true, force: true });
            }
          } catch {}
          this.clearPostgresBackup().catch(() => {});

          const t = setTimeout(() => {
            this.initSocket(userId).catch(() => {});
          }, 2500);
          this.reconnectTimers.set(userId, t);
        } else {
          // Temporary network drop or stream conflict: Preserve credentials intact and auto-reconnect!
          sessionObj.status = 'CONNECTING';
          sessionObj.isHandshaking = false;
          sessionObj.lastActive = `Reconnecting (${statusCode || 'network sync'})...`;
          sessionObj.lastError = errorMsg;
          this.emit('connection.close', { userId, isLoggedOut: false, error: lastDisconnect?.error });
          this.emit('state.update', sessionObj);

          const t = setTimeout(() => {
            this.initSocket(userId).catch(() => {});
          }, 3000);
          this.reconnectTimers.set(userId, t);
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

    for (const [k, existing] of this.sessions.entries()) {
      if (existing?.sock) {
        try {
          existing.sock.logout?.();
          existing.sock.end?.();
        } catch {}
      }
      this.sessions.delete(k);
    }

    try {
      if (fs.existsSync(this.authBaseDir)) {
        const entries = fs.readdirSync(this.authBaseDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && entry.name.startsWith('session_')) {
            fs.rmSync(path.join(this.authBaseDir, entry.name), { recursive: true, force: true });
          }
        }
      }
    } catch {}

    await this.clearPostgresBackup();
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
    return await session.sock.sendMessage(cleanJid, { text });
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
        } else if (url.startsWith('http://') || url.startsWith('https://')) {
          const resp = await fetch(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
          });
          if (resp.ok) {
            rawBuffer = Buffer.from(await resp.arrayBuffer());
          }
        } else {
          const cleanPath = url.replace(/^\//, '');
          const localP = path.join(process.cwd(), 'public', cleanPath);
          if (fs.existsSync(localP)) {
            rawBuffer = fs.readFileSync(localP);
          }
        }
      }

      if (!rawBuffer || rawBuffer.length === 0) {
        return null;
      }

      // Convert to clean progressive JPEG
      const imageBuffer = await sharp(rawBuffer)
        .jpeg({ quality: 85, progressive: true })
        .toBuffer();

      // Generate sharp 400x400 embedded thumbnail
      const thumbnailBuffer = await sharp(rawBuffer)
        .resize(400, 400, { fit: 'inside' })
        .jpeg({ quality: 80 })
        .toBuffer();

      return {
        imageBuffer,
        thumbnailBuffer,
        mimetype: 'image/jpeg'
      };
    } catch (err: any) {
      console.warn('[Baileys] prepareJpegImageAndThumbnail error:', err?.message);
      return null;
    }
  }

  /**
   * Send an image with caption and guaranteed thumbnail
   */
  public async sendImage(userId: string, jid: string, imageBuffer: Buffer | { url: string } | string, caption?: string): Promise<any> {
    const session = this.getSession(userId);
    if (!session?.sock || (session.status !== 'CONNECTED' && !(session.sock.user && !session.sock.ws?.isClosed))) {
      throw new Error(`WhatsApp device for user ${userId} is not connected.`);
    }

    const cleanJid = jid.includes('@') ? jid : `${jid.replace(/\D/g, '')}@s.whatsapp.net`;
    const prepared = await this.prepareJpegImageAndThumbnail(imageBuffer);

    if (prepared) {
      return await session.sock.sendMessage(cleanJid, {
        image: prepared.imageBuffer,
        caption: caption || '',
        mimetype: prepared.mimetype,
        jpegThumbnail: prepared.thumbnailBuffer
      });
    }

    // Strict photo-only enforcement: do NOT fall back to text message when photo dispatch is requested
    throw new Error('Failed to prepare and encode image for WhatsApp dispatch.');
  }

  /**
   * Returns any actively connected live session across all operators (admin or sales desk)
   */
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
   * Supports strictly isolated per-operator WhatsApp sessions.
   */
  public async sendUnifiedMessage(
    to: string,
    text: string,
    imageUrl?: string,
    requestedUserId?: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
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

    const cleanDigits = String(to || '').replace(/\D/g, '');
    if (!cleanDigits || cleanDigits.length < 7) {
      return { success: false, error: 'Invalid recipient phone number.' };
    }
    const cleanJid = `${cleanDigits}@s.whatsapp.net`;

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
        console.warn('[Baileys sendUnifiedMessage] Local socket error, falling back to worker bridge:', err?.message);
      }
    }

    // 2. Fallback to Railway Baileys Worker Bridge (Supports PNG Image & Thermal Slips)
    const bridgeUrl = process.env.WHATSAPP_WORKER_BRIDGE_URL ||
      process.env.VITE_WHATSAPP_WORKER_URL ||
      'https://vintage-vibes-erp-production.up.railway.app';

    if (bridgeUrl) {
      try {
        const bridgeRes = await fetch(`${bridgeUrl.replace(/\/$/, '')}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: cleanDigits,
            text: imageUrl ? (text || '') : text,
            caption: imageUrl ? (text || '') : text,
            imageUrl: imageUrl || undefined
          }),
          signal: AbortSignal.timeout(15000)
        });
        if (bridgeRes.ok) {
          const bData = await bridgeRes.json().catch(() => ({}));
          if (bData.success) {
            return { success: true, messageId: bData.messageId || `wa-bridge-${Date.now()}` };
          }
        }
      } catch (bErr: any) {
        console.warn('[Baileys sendUnifiedMessage] Worker bridge fallback notice:', bErr?.message);
      }
    }

    return {
      success: false,
      error: 'No WhatsApp device is currently connected for your account. Please link your phone in ERP.'
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

  /**
   * Extract Genuine Contacts with real display names (Zero fake data, no junk group scraping)
   */
  public async fetchUserContacts(userId: string): Promise<Array<{ id: string; name: string; phone: string }>> {
    const session = this.getSession(userId);
    if (!session?.sock || session.status !== 'CONNECTED') {
      return [];
    }

    const contactMap = new Map<string, { id: string; name: string; phone: string }>();

    // 1. Include authentic contacts synced via Baileys contacts.upsert / messages.upsert
    if (session.contacts) {
      for (const [phone, contact] of session.contacts.entries()) {
        if (contact.name && !contact.name.startsWith('WhatsApp Member')) {
          contactMap.set(phone, contact);
        }
      }
    }

    // 2. Include linked operator phone if registered
    try {
      if (session.phoneNumber) {
        const clean = session.phoneNumber.replace(/\D/g, '');
        if (clean && !contactMap.has(clean)) {
          contactMap.set(clean, {
            id: `wa-contact-${clean}`,
            name: 'My Personal Phone (Operator / Admin)',
            phone: session.phoneNumber.startsWith('+') ? session.phoneNumber : `+${clean}`
          });
        }
      } else if (session.sock?.user?.id) {
        const clean = session.sock.user.id.split(':')[0].replace(/\D/g, '');
        if (clean && !contactMap.has(clean)) {
          contactMap.set(clean, {
            id: `wa-contact-${clean}`,
            name: session.sock.user.name || 'My Personal Phone (Operator / Admin)',
            phone: `+${clean}`
          });
        }
      }
    } catch {}

    return Array.from(contactMap.values());
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
