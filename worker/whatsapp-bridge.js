/**
 * Vintage Vibes ERP - Turnkey Standalone WhatsApp Persistent WebSocket Bridge
 * ----------------------------------------------------------------------------
 * Designed to run 24/7 on Railway, Render, Fly.io, Docker, or any Node.js VPS.
 * Bridges persistent Baileys WebSockets to your Vercel-hosted frontend via standard HTTP REST.
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import pino from 'pino';
import QRCode from 'qrcode';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  delay,
  Browsers
} from '@whiskeysockets/baileys';
import { headlessRouter } from './headless-live-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

// Mount Headless Live Ingestion & Anti-Ban Social Automation Engine
app.use('/api/booth/social', headlessRouter);
app.use('/api/booth', headlessRouter);
app.use('/api/worker/headless', headlessRouter);


const PORT = process.env.PORT || 3001;
const AUTH_DIR = process.env.AUTH_DIR || path.join(__dirname, 'baileys_auth');
const SECRET_TOKEN = process.env.BRIDGE_SECRET_TOKEN || '';

if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

// Self-healing patch to ensure WhatsApp Channel newsletter media upload utilizes /m1/ CDN routing
function ensureBaileysNewsletterPatched() {
  try {
    const candidateDirs = [
      path.join(process.cwd(), 'node_modules', '@whiskeysockets', 'baileys'),
      path.join(__dirname, '..', 'node_modules', '@whiskeysockets', 'baileys'),
      path.join(__dirname, 'node_modules', '@whiskeysockets', 'baileys')
    ];
    const baileysDir = candidateDirs.find(d => fs.existsSync(d));
    if (!baileysDir) return;

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
    console.log('[WhatsApp Bridge] Baileys newsletter media /m1/ CDN patch verified.');
  } catch (patchErr) {
    console.warn('[WhatsApp Bridge] Auto-patch notice:', patchErr?.message);
  }
}
ensureBaileysNewsletterPatched();

// In-memory debug log buffer for live diagnostics
const logBuffer = [];
function logRecord(level, args) {
  const time = new Date().toISOString().slice(11, 19);
  const msg = args.map(a => a instanceof Error ? (a.stack || a.message) : (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
  logBuffer.push(`[${time}] [${level}] ${msg}`);
  if (logBuffer.length > 250) logBuffer.shift();
}
const _origLog = console.log;
const _origWarn = console.warn;
const _origErr = console.error;
console.log = (...args) => { logRecord('INFO', args); _origLog(...args); };
console.warn = (...args) => { logRecord('WARN', args); _origWarn(...args); };
console.error = (...args) => { logRecord('ERROR', args); _origErr(...args); };

// Session state
let sock = null;
let reconnectTimer = null;
let isInitializing = false;

let sessionState = {
  isConnected: false,
  status: 'DISCONNECTED', // 'DISCONNECTED' | 'CONNECTING' | 'WAITING_QR' | 'WAITING_PAIRING' | 'CONNECTED'
  phoneNumber: '',
  pairingCode: '',
  qrCode: '',
  qrCodeDataUrl: '',
  lastActive: 'Idle',
  lastError: null,
  connectedAt: null,
  batteryLevel: 98
};

// SSE active clients
const sseClients = new Set();

function notifyClients() {
  const payload = `data: ${JSON.stringify(sessionState)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch (_) {
      sseClients.delete(client);
    }
  }
}

// Logger
const logger = pino({ level: process.env.LOG_LEVEL || 'warn' });

// Initialize Baileys Socket
async function initBaileysSocket(requestPairingPhone = null) {
  if (isInitializing) {
    console.log('[WhatsApp Bridge] Socket initialization already in progress, skipping duplicate call.');
    return;
  }
  isInitializing = true;

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  // Gracefully close previous socket
  if (sock) {
    try {
      sock.ev.removeAllListeners();
      sock.end();
    } catch (_) {}
    sock = null;
  }

  try {
    sessionState.status = requestPairingPhone ? 'WAITING_PAIRING' : 'CONNECTING';
    sessionState.lastActive = requestPairingPhone
      ? `Requesting Pairing Code for ${requestPairingPhone}...`
      : 'Connecting to WhatsApp Socket...';
    sessionState.lastError = null;
    notifyClients();

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version, isLatest } = await fetchLatestBaileysVersion().catch(() => ({
      version: [2, 3000, 1043857760],
      isLatest: true
    }));

    console.log(`[WhatsApp Bridge] Initializing Baileys v${version.join('.')}, isLatest=${isLatest}`);

    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: !requestPairingPhone,
      logger,
      browser: Browsers.ubuntu('Chrome'),
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
      emitOwnEvents: false,
      markOnlineOnConnect: true,
      syncFullHistory: false,
      getMessage: async () => undefined
    });

    sock.ev.on('creds.update', async () => {
      try {
        await saveCreds();
      } catch (err) {
        console.warn('[WhatsApp Bridge] Credential save warning:', err?.message);
      }
    });

    // If pairing code was explicitly requested for a phone number
    if (requestPairingPhone && !state.creds.registered) {
      setTimeout(async () => {
        try {
          const cleanPhone = requestPairingPhone.replace(/\D/g, '');
          console.log(`[WhatsApp Bridge] Requesting native WhatsApp pairing code for: +${cleanPhone}`);
          const rawCode = await sock.requestPairingCode(cleanPhone);
          const formattedCode = rawCode?.length === 8 ? `${rawCode.slice(0, 4)}-${rawCode.slice(4)}` : rawCode;
          sessionState.pairingCode = formattedCode;
          sessionState.phoneNumber = `+${cleanPhone}`;
          sessionState.status = 'WAITING_PAIRING';
          sessionState.lastActive = `Pairing Code: ${formattedCode}`;
          console.log(`[WhatsApp Bridge] Authentic Pairing Code Generated: ${formattedCode}`);
          notifyClients();
        } catch (pairErr) {
          console.error('[WhatsApp Bridge] Pairing code request error:', pairErr?.message);
          sessionState.lastError = pairErr?.message || 'Failed to request pairing code';
          sessionState.status = 'DISCONNECTED';
          notifyClients();
        }
      }, 2000);
    }

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr && !requestPairingPhone) {
        // If phone just scanned (status 515 reconnect), do not flash new QR while handshake is completing
        if (sessionState.status === 'CONNECTING' && sessionState.lastActive?.includes('Finalizing')) {
          console.log('[WhatsApp Bridge] Intermediate QR received during scan handshake - waiting for mobile to finish.');
          return;
        }
        sessionState.qrCode = qr;
        sessionState.status = 'WAITING_QR';
        sessionState.lastActive = 'Live QR Ready for Scan';
        try {
          sessionState.qrCodeDataUrl = await QRCode.toDataURL(qr, {
            errorCorrectionLevel: 'M',
            margin: 2,
            scale: 6
          });
        } catch (qrErr) {
          console.warn('[WhatsApp Bridge] QR DataURL render notice:', qrErr?.message);
        }
        notifyClients();
      }

      if (connection === 'connecting') {
        sessionState.status = 'CONNECTING';
        sessionState.lastActive = 'Exchanging keys with WhatsApp...';
        notifyClients();
      }

      if (connection === 'open') {
        sessionState.isConnected = true;
        sessionState.status = 'CONNECTED';
        sessionState.qrCode = '';
        sessionState.qrCodeDataUrl = '';
        sessionState.pairingCode = '';
        sessionState.connectedAt = new Date().toISOString();
        sessionState.lastActive = 'Active Online (Baileys Connected)';
        sessionState.lastError = null;

        const userJid = sock?.user?.id || '';
        const phone = userJid.split(':')[0] || userJid.split('@')[0];
        if (phone) sessionState.phoneNumber = `+${phone}`;

        console.log(`[WhatsApp Bridge] Connection OPEN! Authenticated as: ${sessionState.phoneNumber}`);
        notifyClients();
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const errorMsg = lastDisconnect?.error?.message || '';
        const isConflict = Boolean(errorMsg?.toLowerCase().includes('conflict'));
        const isLoggedOut = (statusCode === DisconnectReason.loggedOut) && !isConflict;
        const isRestartRequired = statusCode === DisconnectReason.restartRequired;

        console.warn(`[WhatsApp Bridge] Connection closed. StatusCode: ${statusCode}. Reason: ${errorMsg}`);

        if (isLoggedOut) {
          console.log('[WhatsApp Bridge] Device was logged out. Clearing credentials.');
          sessionState.isConnected = false;
          sessionState.status = 'DISCONNECTED';
          sessionState.phoneNumber = '';
          sessionState.qrCode = '';
          sessionState.qrCodeDataUrl = '';
          sessionState.pairingCode = '';
          sessionState.lastActive = 'Logged Out';
          notifyClients();

          try {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
          } catch (_) {}

          reconnectTimer = setTimeout(() => initBaileysSocket(), 2000);
        } else if (isRestartRequired) {
          // CRITICAL: When phone scans QR, WhatsApp sends status 515 (restartRequired) to finalize encryption handshake!
          // NEVER wipe credentials on 515! Reconnect immediately within 500ms using existing keys!
          console.log('[WhatsApp Bridge] Status 515: restartRequired (QR scan handshake in progress). Reconnecting immediately to complete login...');
          sessionState.status = 'CONNECTING';
          sessionState.lastActive = 'Phone scanned! Finalizing secure login with mobile...';
          sessionState.qrCode = '';
          sessionState.qrCodeDataUrl = '';
          notifyClients();

          reconnectTimer = setTimeout(() => initBaileysSocket(), 500);
        } else if (isConflict) {
          // Stream conflict: DO NOT wipe credentials! Delay and reconnect cleanly with existing credentials
          console.log('[WhatsApp Bridge] Stream conflict encountered. Preserving saved credentials and retrying connection in 3s...');
          sessionState.status = 'CONNECTING';
          sessionState.lastActive = 'Reconnecting session after stream conflict...';
          notifyClients();

          reconnectTimer = setTimeout(() => initBaileysSocket(), 3000);
        } else {
          // Stream drop or temporary network disconnect: Keep credentials intact!
          sessionState.isConnected = false;
          sessionState.status = 'CONNECTING';
          sessionState.lastActive = `Reconnecting (${statusCode || 'stream drop'})...`;
          notifyClients();

          reconnectTimer = setTimeout(() => initBaileysSocket(), 3000);
        }
      }
    });

  } catch (err) {
    console.error('[WhatsApp Bridge] Fatal socket initialization error:', err);
    sessionState.status = 'DISCONNECTED';
    sessionState.lastError = err?.message;
    notifyClients();
    reconnectTimer = setTimeout(() => initBaileysSocket(), 5000);
  } finally {
    isInitializing = false;
  }
}

// Start Baileys immediately
initBaileysSocket();

// Middleware: optional auth check
function requireAuth(req, res, next) {
  if (!SECRET_TOKEN) return next();
  const token = req.headers['authorization']?.replace('Bearer ', '') || req.query.token;
  if (token !== SECRET_TOKEN) {
    return res.status(401).json({ success: false, error: 'Unauthorized bridge access.' });
  }
  next();
}

// --------------------------------------------------------------------------
// REST API & SSE ENDPOINTS
// --------------------------------------------------------------------------

// Health check endpoint for Vercel / Railway / Render ping
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Vintage Vibes WhatsApp Persistent Bridge',
    uptime: Math.round(process.uptime()),
    isConnected: sessionState.isConnected,
    phoneNumber: sessionState.phoneNumber,
    connectionStatus: sessionState.status
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.round(process.uptime()),
    isConnected: sessionState.isConnected,
    phoneNumber: sessionState.phoneNumber,
    connectionStatus: sessionState.status
  });
});

// Server-Sent Events (SSE) stream for real-time QR and pairing code updates
app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  // HTTP/2 prohibits the 'Connection' header field (causes ERR_HTTP2_PROTOCOL_ERROR)
  if (req.httpVersionMajor < 2) {
    res.setHeader('Connection', 'keep-alive');
  }
  res.flushHeaders?.();

  // Send current state immediately
  res.write(`data: ${JSON.stringify(sessionState)}\n\n`);
  sseClients.add(res);

  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch (_) {
      clearInterval(heartbeat);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

// Live in-memory logs for remote diagnostics
app.get('/logs', (req, res) => {
  res.type('text/plain').send(logBuffer.join('\n') || 'No logs captured yet.');
});

// Auth folder inspection
app.get('/debug-auth', (req, res) => {
  try {
    const files = fs.existsSync(AUTH_DIR) ? fs.readdirSync(AUTH_DIR) : [];
    let credsSummary = null;
    const credsPath = path.join(AUTH_DIR, 'creds.json');
    if (fs.existsSync(credsPath)) {
      try {
        const raw = fs.readFileSync(credsPath, 'utf8');
        const parsed = JSON.parse(raw);
        credsSummary = {
          registered: parsed?.registered,
          me: parsed?.me,
          accountSyncCounter: parsed?.accountSyncCounter
        };
      } catch (parseErr) {
        credsSummary = { error: parseErr.message };
      }
    }
    res.json({
      authDir: AUTH_DIR,
      fileCount: files.length,
      files: files.slice(0, 30),
      creds: credsSummary,
      session: sessionState
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Full Session status for ERP frontend
app.get('/status', (req, res) => {
  res.json({
    success: true,
    ...sessionState
  });
});

app.get('/session', (req, res) => {
  res.json({
    success: true,
    ...sessionState
  });
});

// Live QR code
app.get('/qr', (req, res) => {
  res.json({
    success: true,
    isConnected: sessionState.isConnected,
    status: sessionState.status,
    qrCode: sessionState.qrCode,
    qrCodeDataUrl: sessionState.qrCodeDataUrl,
    pairingCode: sessionState.pairingCode,
    lastActive: sessionState.lastActive
  });
});

// Regenerate QR: Only cleans credentials when explicitly requested by user
app.post('/generate-qr', requireAuth, async (req, res) => {
  try {
    // If currently handshaking (status 515 restartRequired), protect credentials and do not wipe!
    if (sessionState.status === 'CONNECTING' && sessionState.lastActive?.toLowerCase().includes('finalizing')) {
      console.log('[WhatsApp Bridge] Regenerate QR ignored: phone scan handshake is currently finalizing with mobile.');
      return res.json({
        success: true,
        message: 'Phone scan handshake is currently finalizing. Please wait a moment...',
        ...sessionState
      });
    }

    console.log('[WhatsApp Bridge] Manual Regenerate QR requested. Cleaning auth and generating fresh QR...');
    if (sock) {
      try {
        sock.ev.removeAllListeners();
        sock.end();
      } catch (_) {}
      sock = null;
    }

    // Only wipe credentials if not currently connected and not handshaking
    if (!sessionState.isConnected && sessionState.status !== 'CONNECTING') {
      try {
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        fs.mkdirSync(AUTH_DIR, { recursive: true });
      } catch (_) {}
    }

    sessionState.qrCode = '';
    sessionState.qrCodeDataUrl = '';
    sessionState.pairingCode = '';
    sessionState.status = 'CONNECTING';
    sessionState.lastActive = 'Generating fresh live WhatsApp QR...';
    notifyClients();

    await initBaileysSocket();

    // Wait up to 6 seconds for fresh QR
    for (let i = 0; i < 30; i++) {
      if (sessionState.qrCodeDataUrl || sessionState.isConnected) break;
      await delay(200);
    }

    return res.json({
      success: true,
      status: sessionState.status,
      qrCode: sessionState.qrCode,
      qrCodeDataUrl: sessionState.qrCodeDataUrl,
      isConnected: sessionState.isConnected,
      lastActive: sessionState.lastActive
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

// Request 8-Digit Native WhatsApp Pairing Code (Phone Number)
app.post('/pair', requireAuth, async (req, res) => {
  const { phoneNumber } = req.body || {};
  const cleanPhone = (phoneNumber || '').replace(/\D/g, '');

  if (!cleanPhone || cleanPhone.length < 8) {
    return res.status(400).json({ success: false, error: 'Valid phone number with country code is required (e.g. 971554186086).' });
  }

  try {
    console.log(`[WhatsApp Bridge] Pairing code requested for: +${cleanPhone}`);
    if (sock) {
      try {
        sock.ev.removeAllListeners();
        sock.end();
      } catch (_) {}
      sock = null;
    }

    if (!sessionState.isConnected) {
      try {
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        fs.mkdirSync(AUTH_DIR, { recursive: true });
      } catch (_) {}
    }

    sessionState.qrCode = '';
    sessionState.qrCodeDataUrl = '';
    sessionState.pairingCode = '';
    sessionState.phoneNumber = `+${cleanPhone}`;
    sessionState.status = 'WAITING_PAIRING';
    sessionState.lastActive = `Contacting WhatsApp servers for 8-digit code...`;
    notifyClients();

    await initBaileysSocket(cleanPhone);

    // Wait up to 8 seconds for Baileys to emit the pairing code
    for (let i = 0; i < 40; i++) {
      if (sessionState.pairingCode || sessionState.isConnected) break;
      await delay(200);
    }

    if (sessionState.pairingCode) {
      return res.json({
        success: true,
        pairingCode: sessionState.pairingCode,
        phoneNumber: sessionState.phoneNumber,
        status: sessionState.status
      });
    }

    return res.json({
      success: true,
      status: sessionState.status,
      message: 'Pairing requested. Contacting WhatsApp network...',
      phoneNumber: `+${cleanPhone}`
    });
  } catch (err) {
    console.error('[WhatsApp Bridge] /pair error:', err);
    return res.status(500).json({ success: false, error: err?.message });
  }
});

// Send Message (Direct to Customer or Group)
app.post('/send', requireAuth, async (req, res) => {
  const { to, text, imageUrl, caption } = req.body || {};

  if (!sock || !sessionState.isConnected) {
    return res.status(503).json({
      success: false,
      error: 'WhatsApp Bridge is not currently connected to WhatsApp. Please scan QR or link via pairing code.'
    });
  }

  const rawTo = (to || '').replace(/\D/g, '');
  if (!rawTo && !to?.includes('@')) {
    return res.status(400).json({ success: false, error: 'Recipient phone number is required.' });
  }

  const jid = to?.includes('@') ? to : `${rawTo}@s.whatsapp.net`;

  try {
    let result;
    if (imageUrl) {
      const imagePayload = typeof imageUrl === 'string' && imageUrl.startsWith('data:')
        ? Buffer.from(imageUrl.replace(/^data:image\/[a-zA-Z0-9.+]+;base64,/, ''), 'base64')
        : { url: imageUrl };
      const effectiveCaption = typeof caption === 'string' ? caption : (typeof text === 'string' ? text : '');
      result = await sock.sendMessage(jid, {
        image: imagePayload,
        caption: effectiveCaption
      });
    } else {
      result = await sock.sendMessage(jid, {
        text: text || ''
      });
    }

    return res.json({
      success: true,
      messageId: result?.key?.id,
      recipient: jid,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error(`[WhatsApp Bridge] Send error to ${jid}:`, err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Failed to dispatch message'
    });
  }
});

// Post to WhatsApp Channel (Newsletter)
app.post('/post-channel', requireAuth, async (req, res) => {
  const { channelJid, caption, imageUrl } = req.body || {};

  if (!sock || !sessionState.isConnected) {
    return res.status(503).json({ success: false, error: 'Bridge is not connected to WhatsApp.' });
  }

  if (!channelJid) {
    return res.status(400).json({ success: false, error: 'Channel JID is required (e.g. 120363xxx@newsletter).' });
  }

  let targetJid = String(channelJid).trim();

  // If channelJid is an invite link or invite code, extract code and resolve
  if (targetJid.includes('/channel/') || targetJid.startsWith('0029') || !targetJid.endsWith('@newsletter')) {
    const code = targetJid.replace(/.*\/channel\//i, '').replace(/@newsletter$/i, '').trim();
    if (code) {
      try {
        if (typeof sock.newsletterMetadata === 'function') {
          const meta = await sock.newsletterMetadata('invite', code);
          if (meta?.id) {
            targetJid = meta.id;
            console.log(`[WhatsApp Bridge] Resolved newsletter code "${code}" to numeric JID: ${targetJid}`);
          } else {
            targetJid = `${code}@newsletter`;
          }
        } else {
          targetJid = `${code}@newsletter`;
        }
      } catch (resErr) {
        console.warn(`[WhatsApp Bridge] Newsletter code metadata lookup error, falling back to ${code}@newsletter:`, resErr?.message);
        targetJid = `${code}@newsletter`;
      }
    }
  }

  try {
    // Sanitize caption: eliminate any raw base64 noise or redundant injected photo links
    let cleanCaption = (caption || '')
      .replace(/data:image\/[a-zA-Z0-9.+]+;base64,[^\s]+/g, '')
      .replace(/📸\s*\*High-Res Garment Photo:\*[\s\S]*?(?=\n\n|$)/g, '')
      .replace(/📸\s*\*Direct High-Res Photo:\*[\s\S]*?(?=\n\n|$)/g, '')
      .trim();

    let result;
    if (imageUrl) {
      const imagePayload = typeof imageUrl === 'string' && imageUrl.startsWith('data:')
        ? Buffer.from(imageUrl.replace(/^data:image\/[a-zA-Z0-9.+]+;base64,/, ''), 'base64')
        : (typeof imageUrl === 'string' && imageUrl.startsWith('http') ? { url: imageUrl } : imageUrl);

      try {
        console.log(`[WhatsApp Bridge] Dispatching native photo to channel ${targetJid}`);
        result = await sock.sendMessage(targetJid, {
          image: imagePayload,
          caption: cleanCaption
        });
      } catch (imgErr) {
        console.warn(`[WhatsApp Bridge] Channel image dispatch failed (${imgErr?.message}), falling back to text:`, imgErr?.message || imgErr);
        result = await sock.sendMessage(targetJid, {
          text: cleanCaption
        });
      }
    } else {
      result = await sock.sendMessage(targetJid, {
        text: cleanCaption
      });
    }

    return res.json({
      success: true,
      messageId: result?.key?.id,
      channelJid: targetJid
    });
  } catch (err) {
    console.error(`[WhatsApp Bridge] Channel post fatal error to ${targetJid}:`, err);
    return res.status(500).json({ success: false, error: err?.message || 'Failed to dispatch channel post' });
  }
});

// Disconnect & Unlink Device
app.post('/disconnect', requireAuth, async (req, res) => {
  try {
    if (sock) {
      try { await sock.logout(); } catch (_) {}
      try { sock.ev.removeAllListeners(); sock.end(); } catch (_) {}
      sock = null;
    }
    try {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    } catch (_) {}

    sessionState = {
      isConnected: false,
      status: 'DISCONNECTED',
      phoneNumber: '',
      pairingCode: '',
      qrCode: '',
      qrCodeDataUrl: '',
      lastActive: 'Unlinked',
      lastError: null,
      connectedAt: null,
      batteryLevel: 98
    };
    notifyClients();

    setTimeout(() => initBaileysSocket(), 2000);
    return res.json({ success: true, message: 'WhatsApp session disconnected and unlinked.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

// ============================================================================
// Turnkey Browser-to-RTMP Streaming Relay (YouTube Live, TikTok Live, etc.)
// ============================================================================
const activeRtmpRelays = new Map();

function getFfmpegPath() {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    return process.env.FFMPEG_PATH;
  }
  const candidatePaths = [
    '/usr/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    path.join(process.cwd(), 'node_modules', 'ffmpeg-static', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'),
    path.join(__dirname, '..', 'node_modules', 'ffmpeg-static', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'),
    path.join(__dirname, 'node_modules', 'ffmpeg-static', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')
  ];
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) return p;
  }
  return 'ffmpeg';
}

// Diagnostic endpoint to check ffmpeg installation and network reachability
app.get('/ffmpeg-check', async (req, res) => {
  const ffmpegExe = getFfmpegPath();
  const net = await import('net');
  
  const testPort = (host, port) => new Promise((resolve) => {
    const s = net.createConnection({ host, port, timeout: 3500 }, () => {
      s.destroy();
      resolve({ reachable: true });
    });
    s.on('error', (err) => resolve({ reachable: false, error: err.message }));
    s.on('timeout', () => { s.destroy(); resolve({ reachable: false, error: 'TIMEOUT' }); });
  });

  const [rtmp1935, rtmps443] = await Promise.all([
    testPort('a.rtmp.youtube.com', 1935),
    testPort('a.rtmp.youtube.com', 443)
  ]);

  try {
    const { execSync } = await import('child_process');
    const versionOut = execSync(`"${ffmpegExe}" -version`, { timeout: 4000 }).toString();
    
    let encodeTest = 'UNKNOWN';
    try {
      execSync(`"${ffmpegExe}" -f lavfi -i testsrc=s=320x240:d=1 -c:v libx264 -preset ultrafast -threads 1 -f null -`, { timeout: 6000 });
      encodeTest = 'SUCCESS';
    } catch (encErr) {
      encodeTest = `FAILED: ${encErr.message} ${encErr.stderr?.toString()}`;
    }

    return res.json({
      success: true,
      ffmpegExe,
      version: versionOut.split('\n')[0],
      encodeTest,
      ports: {
        youtube_rtmp_1935: rtmp1935,
        youtube_rtmps_443: rtmps443
      },
      memory: process.memoryUsage()
    });
  } catch (err) {
    return res.status(500).json({ success: false, ffmpegExe, error: err.message, stderr: err.stderr?.toString() });
  }
});

function setupRtmpRelay(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
    if (url.pathname === '/api/live/stream/rtmp-relay' || url.pathname.endsWith('/stream/rtmp-relay')) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    const boothId = url.searchParams.get('boothId') || 'booth-1';
    const queryKey = url.searchParams.get('streamKey');
    const queryUrl = url.searchParams.get('rtmpUrl');

    const rtmpUrl = (queryUrl || 'rtmp://a.rtmp.youtube.com/live2').trim();
    const streamKey = (queryKey || 'edu8-fpef-kc0c-s9cs-dath').trim();

    console.log(`[Worker RTMP Relay] 🎥 Client connected for ${boothId}. Ingesting WebM -> RTMP...`);

    const existing = activeRtmpRelays.get(boothId);
    if (existing) {
      console.log(`[Worker RTMP Relay] Cleaning up existing relay for ${boothId}`);
      try {
        existing.ffmpeg?.stdin?.end();
        existing.ffmpeg?.kill('SIGTERM');
      } catch (_) {}
      activeRtmpRelays.delete(boothId);
    }

    let safeRtmpUrl = rtmpUrl;
    if (safeRtmpUrl.startsWith('rtmp://live.restream.io')) {
      safeRtmpUrl = safeRtmpUrl.replace('rtmp://live.restream.io', 'rtmps://live.restream.io');
    }
    const cleanRtmpBase = safeRtmpUrl.replace(/\/+$/, '');
    const destinationRtmp = `${cleanRtmpBase}/${streamKey}`;
    const ffmpegExe = getFfmpegPath();

    console.log(`[Worker RTMP Relay] 🚀 Target destination: ${cleanRtmpBase}/****${streamKey.slice(-4)}`);

    let ffmpegProcess = null;
    let isSpawned = false;
    let bytesReceived = 0;
    let chunkCount = 0;
    let lastStderr = '';

    const spawnFfmpeg = (initialChunk) => {
      if (isSpawned) return;
      isSpawned = true;

      const ffmpegArgs = [
        '-f', 'webm',
        '-probesize', '2M',
        '-analyzeduration', '2M',
        '-i', 'pipe:0',
        '-map', '0:v:0',
        '-map', '0:a:0?',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-tune', 'zerolatency',
        '-profile:v', 'main',
        '-r', '30',
        '-g', '60',
        '-keyint_min', '60',
        '-sc_threshold', '0',
        '-b:v', '3000k',
        '-maxrate', '3500k',
        '-bufsize', '6000k',
        '-pix_fmt', 'yuv420p',
        '-threads', '2',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ar', '44100',
        '-ac', '2',
        '-f', 'flv',
        '-flvflags', 'no_duration_filesize',
        destinationRtmp
      ];

      console.log(`[Worker RTMP Relay] 🎬 Spawning FFmpeg with initial chunk (${initialChunk.length} bytes)...`);

      try {
        ffmpegProcess = spawn(ffmpegExe, ffmpegArgs, {
          stdio: ['pipe', 'ignore', 'pipe']
        });
      } catch (spawnErr) {
        console.error('[Worker RTMP Relay] Failed to spawn FFmpeg:', spawnErr);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ERROR', error: `Failed to spawn FFmpeg: ${spawnErr.message}` }));
          ws.close(1011, 'FFmpeg spawn failed');
        }
        return;
      }

      activeRtmpRelays.set(boothId, {
        boothId,
        ffmpeg: ffmpegProcess,
        ws,
        startedAt: Date.now()
      });

      if (ffmpegProcess.stderr) {
        ffmpegProcess.stderr.on('data', (data) => {
          const text = data.toString();
          lastStderr = (lastStderr + '\n' + text).slice(-3000);
          const lines = text.trim().split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('frame=')) {
              console.log(`[FFmpeg ${boothId}] ${trimmed}`);
            } else if (trimmed.startsWith('frame=') && Math.random() < 0.05) {
              console.log(`[FFmpeg ${boothId}] ${trimmed}`);
            }
          }
        });
      }

      ffmpegProcess.on('exit', (code, signal) => {
        console.warn(`[Worker RTMP Relay] FFmpeg for ${boothId} exited with code=${code}, signal=${signal}. Stderr: ${lastStderr.slice(-400)}`);
        activeRtmpRelays.delete(boothId);
        if (ws.readyState === WebSocket.OPEN) {
          const errDetail = signal ? `FFmpeg terminated by ${signal}` : `FFmpeg exited code ${code}`;
          ws.send(JSON.stringify({ type: 'STREAM_ENDED', code, signal, error: `${errDetail}: ${lastStderr.slice(-200)}` }));
          ws.close(1000, `Stream ended code ${code || signal}`);
        }
      });

      ffmpegProcess.on('error', (err) => {
        console.error(`[Worker RTMP Relay] FFmpeg error for ${boothId}:`, err);
        activeRtmpRelays.delete(boothId);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ERROR', error: err.message }));
          ws.close(1011, err.message);
        }
      });

      // Write the first chunk containing the WebM EBML header
      try {
        ffmpegProcess.stdin.write(initialChunk);
      } catch (writeErr) {
        console.warn(`[Worker RTMP Relay] Initial chunk write error:`, writeErr);
      }
    };

    // Notify client that WebSocket is open and ready for chunks
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'READY_FOR_CHUNKS',
        boothId,
        destination: `${cleanRtmpBase}/****${streamKey.slice(-4)}`
      }));
    }

    const pendingChunks = [];
    let pendingBytes = 0;

    ws.on('message', (data) => {
      let buf;
      if (Buffer.isBuffer(data)) {
        buf = data;
      } else if (Array.isArray(data)) {
        buf = Buffer.concat(data);
      } else {
        buf = Buffer.from(data);
      }

      bytesReceived += buf.length;
      chunkCount++;

      if (!isSpawned) {
        pendingChunks.push(buf);
        pendingBytes += buf.length;
        // Buffer at least 150KB or 2 chunks before spawning FFmpeg to guarantee complete EBML headers and video keyframes
        if (pendingBytes >= 150000 || pendingChunks.length >= 2) {
          const initialBuffer = Buffer.concat(pendingChunks);
          spawnFfmpeg(initialBuffer);
        }
      } else if (ffmpegProcess && ffmpegProcess.stdin && ffmpegProcess.stdin.writable) {
        try {
          ffmpegProcess.stdin.write(buf);
        } catch (writeErr) {
          console.warn(`[Worker RTMP Relay] Error writing chunk to FFmpeg:`, writeErr);
        }
      }
    });

    ws.on('close', (code, reason) => {
      console.log(`[Worker RTMP Relay] ⏹️ Client disconnected for ${boothId} (chunks=${chunkCount}, bytes=${(bytesReceived / 1024 / 1024).toFixed(2)} MB, code=${code}, reason=${reason})`);
      try {
        if (ffmpegProcess && ffmpegProcess.stdin && ffmpegProcess.stdin.writable) {
          ffmpegProcess.stdin.end();
        }
        ffmpegProcess?.kill('SIGTERM');
      } catch (_) {}
      activeRtmpRelays.delete(boothId);
    });

    ws.on('error', (err) => {
      console.warn(`[Worker RTMP Relay] WebSocket error for ${boothId}:`, err);
      try {
        ffmpegProcess?.kill('SIGTERM');
      } catch (_) {}
      activeRtmpRelays.delete(boothId);
    });
  });
}

const server = http.createServer(app);
setupRtmpRelay(server);

server.listen(PORT, () => {
  console.log(`\n=============================================================`);
  console.log(`🚀 Vintage Vibes Persistent Worker & RTMP Relay listening on port ${PORT}`);
  console.log(`🌐 Ready to connect with Vercel Frontend & ERP Clients`);
  console.log(`📁 Auth Directory: ${AUTH_DIR}`);
  console.log(`=============================================================\n`);
});
