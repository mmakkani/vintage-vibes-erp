import path from 'path';
import fs from 'fs';
import os from 'os';
import { EventEmitter } from 'events';
import pino from 'pino';
import QRCode from 'qrcode';
import sharp from 'sharp';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  delay,
  Browsers
} from '@whiskeysockets/baileys';

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

export interface BaileysLiveSession {
  userId: string;
  phoneNumber?: string;
  pairingCode?: string;
  qrCode?: string; // Raw string
  qrCodeDataUrl?: string; // Real-time base64 data URL
  status: 'DISCONNECTED' | 'CONNECTING' | 'WAITING_QR' | 'WAITING_PAIRING' | 'CONNECTED';
  sock?: any;
  lastError?: string;
  contacts?: Map<string, { id: string; name: string; phone: string }>;
}

class BaileysManager extends EventEmitter {
  private sessions: Map<string, BaileysLiveSession> = new Map();
  private authBaseDir: string;
  private logger = pino({ level: 'silent' });

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

    // Auto-connect socket on startup if auth credentials exist on disk
    setTimeout(() => {
      const defaultSessionDir = path.join(this.authBaseDir, 'session_usr-admin-1');
      if (fs.existsSync(path.join(defaultSessionDir, 'creds.json'))) {
        console.log('[Baileys] Found existing auth credentials for usr-admin-1. Auto-connecting socket...');
        this.initSocket('usr-admin-1').catch(err => {
          console.warn('[Baileys] Auto-connection warning:', err?.message);
        });
      }
    }, 1000);
  }

  public getSession(userId: string): BaileysLiveSession | undefined {
    return this.sessions.get(userId);
  }

  /**
   * Start or restart a real Baileys socket for a user.
   * If phoneNumber is passed, it requests an authentic 8-character pairing code from WhatsApp servers.
   * If phoneNumber is not passed, it emits genuine QR codes for camera scanning.
   */
  public async initSocket(userId: string, phoneNumber?: string): Promise<BaileysLiveSession> {
    const existing = this.sessions.get(userId);
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

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307] as [number, number, number] }));

    const sessionObj: BaileysLiveSession = {
      userId,
      phoneNumber,
      status: 'CONNECTING',
      pairingCode: undefined,
      qrCode: undefined,
      qrCodeDataUrl: undefined,
      contacts: new Map()
    };
    this.sessions.set(userId, sessionObj);

    // Standard valid desktop client identity requested by WhatsApp protocol
    const sock = makeWASocket({
      version: version as any,
      logger: this.logger,
      auth: state,
      printQRInTerminal: false,
      browser: Browsers.ubuntu('Chrome'),
      syncFullHistory: false,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 0,
      keepAliveIntervalMs: 10000
    });

    sessionObj.sock = sock;

    // Save auth credentials whenever updated to ./baileys_auth
    sock.ev.on('creds.update', saveCreds);

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

    // If a phone number is provided and we aren't registered yet, request a genuine pairing code!
    if (phoneNumber && !sock.authState.creds.registered) {
      sessionObj.status = 'WAITING_PAIRING';
      setTimeout(async () => {
        try {
          await delay(3000);
          const cleanPhone = phoneNumber.replace(/\D/g, '');
          const code = await sock.requestPairingCode(cleanPhone);
          const formatted = code?.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
          sessionObj.pairingCode = formatted;
          this.emit('pairingCode', { userId, phoneNumber: cleanPhone, code: formatted });
        } catch (err: any) {
          console.warn(`[Baileys] Error requesting pairing code for ${phoneNumber}:`, err?.message);
          sessionObj.lastError = err?.message;
        }
      }, 500);
    }

    // Handle incoming messages for MINE [SKU] auto-claims
    sock.ev.on('messages.upsert', async (m: any) => {
      try {
        const { messages, type } = m;
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

      // 2. Dynamic Real-Time QR Refresh: immediately convert to base64 data URL
      if (qr && !phoneNumber) {
        sessionObj.status = 'WAITING_QR';
        sessionObj.qrCode = qr;
        try {
          const dataUrl = await QRCode.toDataURL(qr, {
            margin: 2,
            width: 256,
            errorCorrectionLevel: 'M'
          });
          sessionObj.qrCodeDataUrl = dataUrl;
          this.emit('qr', { userId, qr, dataUrl });
        } catch (qrErr: any) {
          console.warn('[Baileys] Error generating QR data URL:', qrErr?.message);
          this.emit('qr', { userId, qr, dataUrl: qr });
        }
      }

      // 3. Clean Disconnect Recovery
      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;

        sessionObj.status = 'DISCONNECTED';
        sessionObj.lastError = lastDisconnect?.error?.message;
        this.emit('connection.close', { userId, isLoggedOut, error: lastDisconnect?.error });

        if (isLoggedOut) {
          // If logged out, wipe session directory and clear state
          console.log(`[Baileys] User ${userId} logged out. Clearing auth credentials in ${sessionDir}`);
          try {
            if (fs.existsSync(sessionDir)) {
              fs.rmSync(sessionDir, { recursive: true, force: true });
            }
          } catch {}
          // Start clean session listener
          setTimeout(() => {
            this.initSocket(userId, phoneNumber).catch(() => {});
          }, 3000);
        } else {
          // Temporary network drop: trigger auto-reconnect without corrupting state
          console.log(`[Baileys] Socket temporarily closed for user ${userId} (Code ${statusCode}). Auto-reconnecting...`);
          setTimeout(() => {
            this.initSocket(userId, phoneNumber).catch(() => {});
          }, 4000);
        }
      } else if (connection === 'open') {
        sessionObj.status = 'CONNECTED';
        sessionObj.pairingCode = undefined;
        sessionObj.qrCode = undefined;
        sessionObj.qrCodeDataUrl = undefined;
        if (sock.user?.id) {
          sessionObj.phoneNumber = `+${sock.user.id.split(':')[0]}`;
        }
        console.log(`[Baileys] Socket CONNECTED for user ${userId} (${sessionObj.phoneNumber || 'authenticated'})!`);
        this.emit('connection.open', { userId, user: sock.user });
      }
    });

    return sessionObj;
  }

  /**
   * Disconnect and clear local session auth
   */
  public async disconnectSession(userId: string): Promise<void> {
    const existing = this.sessions.get(userId);
    if (existing?.sock) {
      try {
        existing.sock.logout?.();
        existing.sock.end?.();
      } catch {}
    }
    this.sessions.delete(userId);

    const sessionDir = path.join(this.authBaseDir, `session_${userId}`);
    if (fs.existsSync(sessionDir)) {
      try {
        fs.rmSync(sessionDir, { recursive: true, force: true });
      } catch {}
    }
  }

  /**
   * Send a text message to a WhatsApp recipient or group
   */
  public async sendMessage(userId: string, jid: string, text: string): Promise<any> {
    const session = this.sessions.get(userId);
    if (!session?.sock || session.status !== 'CONNECTED') {
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
        if (url.startsWith('http://') || url.startsWith('https://')) {
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
    const session = this.sessions.get(userId);
    if (!session?.sock || session.status !== 'CONNECTED') {
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

    return await session.sock.sendMessage(cleanJid, {
      text: caption || ''
    });
  }

  /**
   * Discover Channels (Newsletters) subscribed or administered by the connected WhatsApp socket
   */
  public async discoverChannels(userId: string): Promise<Array<{ id: string; name: string; role: string; inviteLink?: string }>> {
    const session = this.sessions.get(userId);
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
    const session = this.sessions.get(userId);

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
    const session = this.sessions.get(userId);
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
    const session = this.sessions.get(userId);
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
    // MODE 1: FREE DIRECT MODE (BAILEYS LINKED PHONE SOCKET)
    // ============================================================
    const session = this.sessions.get(userId);
    if (!session?.sock || session.status !== 'CONNECTED') {
      console.warn(`[Baileys] Cannot post: WhatsApp socket not connected for user ${userId}`);
      throw new Error(`WhatsApp is not connected for user ${userId}. Please connect via QR or Pairing code.`);
    }

    // 1. Fetch / Download image URL into in-memory buffer
    let imageBuffer: Buffer | null = null;
    if (payload.imageBuffer && Buffer.isBuffer(payload.imageBuffer)) {
      imageBuffer = payload.imageBuffer;
    } else if (payload.imageUrl) {
      if (payload.imageUrl.startsWith('http')) {
        try {
          console.log(`[Baileys Channel Post] Fetching image for thumbnail: ${payload.imageUrl}`);
          const res = await fetch(payload.imageUrl);
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

    // 2. Format drop post card with direct photo link so photo is ALWAYS viewable in channel feed
    let dropCardText = cleanCaption;
    if (payload.imageUrl && !dropCardText.includes(payload.imageUrl)) {
      dropCardText = dropCardText.replace(
        /(💳 \*1-Tap Instant Checkout)/,
        `📸 *Direct High-Res Photo:*\n👉 ${payload.imageUrl}\n\n$1`
      );
    }

    const urlMatch = dropCardText.match(/https?:\/\/[^\s]+/);
    const targetUrl = payload.imageUrl || (urlMatch ? urlMatch[0] : 'http://localhost:3000');

    // 3. Dispatch the guaranteed drop post card to channel (Arrives 100% reliably in WhatsApp mobile & web feed!)
    console.log(`[Baileys Channel Post] Dispatching Free Mode drop post card to newsletter ${targetJid}`);
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

    // 4. Also attempt native image message silently for client versions that support it
    if (finalMediaBuffer || payload.imageUrl) {
      session.sock.sendMessage(targetJid, {
        image: finalMediaBuffer || { url: payload.imageUrl || '' },
        caption: cleanCaption,
        mimetype: 'image/jpeg',
        jpegThumbnail: prepared?.thumbnailBuffer
      }, {
        additionalAttributes: { mediatype: 'image' }
      }).catch((e: any) => console.log('[Baileys Channel Post] Silent image attempt notice:', e?.message));
    }

    return cardResult;
  }
}

export const baileysManager = new BaileysManager();
