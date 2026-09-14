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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

const PORT = process.env.PORT || 3001;
const AUTH_DIR = process.env.AUTH_DIR || path.join(__dirname, 'baileys_auth');
const SECRET_TOKEN = process.env.BRIDGE_SECRET_TOKEN || '';

if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

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

// Check if credentials exist and are registered
function isCredsRegistered() {
  try {
    const credsPath = path.join(AUTH_DIR, 'creds.json');
    if (!fs.existsSync(credsPath)) return false;
    const raw = fs.readFileSync(credsPath, 'utf8');
    const parsed = JSON.parse(raw);
    return Boolean(parsed?.registered);
  } catch (_) {
    return false;
  }
}

// Clean unlinked / corrupted auth directory if not registered
function cleanUnregisteredAuthDir() {
  try {
    if (!fs.existsSync(AUTH_DIR)) return;
    if (!isCredsRegistered()) {
      console.log('[WhatsApp Bridge] Removing unregistered/stale auth credentials in:', AUTH_DIR);
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
      fs.mkdirSync(AUTH_DIR, { recursive: true });
    }
  } catch (err) {
    console.warn('[WhatsApp Bridge] Error cleaning unlinked auth dir:', err?.message);
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
    // If we are not connected and not registered, clear stale QR so old strings are never cached
    if (!isCredsRegistered()) {
      sessionState.qrCode = '';
      sessionState.qrCodeDataUrl = '';
      sessionState.pairingCode = '';
    }

    sessionState.status = requestPairingPhone ? 'WAITING_PAIRING' : 'CONNECTING';
    sessionState.lastActive = requestPairingPhone
      ? `Requesting Pairing Code for ${requestPairingPhone}...`
      : 'Connecting to WhatsApp Socket...';
    sessionState.lastError = null;
    notifyClients();

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version, isLatest } = await fetchLatestBaileysVersion().catch(() => ({
      version: [2, 3000, 1015901307],
      isLatest: true
    }));

    console.log(`[WhatsApp Bridge] Initializing Baileys v${version.join('.')}, isLatest=${isLatest}`);

    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: !requestPairingPhone,
      logger,
      browser: Browsers.macOS('Chrome'),
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
      emitOwnEvents: false,
      markOnlineOnConnect: true,
      syncFullHistory: false
    });

    sock.ev.on('creds.update', saveCreds);

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
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;
        const isQrExpired = errorMsg.includes('QR refs') || statusCode === 408 || statusCode === 428;

        sessionState.isConnected = false;
        sessionState.status = 'DISCONNECTED';
        sessionState.qrCode = '';
        sessionState.qrCodeDataUrl = '';
        sessionState.pairingCode = '';
        sessionState.lastError = errorMsg || `Socket closed (${statusCode || 'unknown'})`;
        sessionState.lastActive = isQrExpired
          ? 'QR expired. Click "Regenerate Live QR" to refresh.'
          : `Disconnected (Status: ${statusCode || 'unknown'})`;

        console.warn(`[WhatsApp Bridge] Connection closed. Reason: ${sessionState.lastError}. LoggedOut: ${isLoggedOut}. QrExpired: ${isQrExpired}`);
        notifyClients();

        if (isLoggedOut) {
          console.log('[WhatsApp Bridge] Device logged out. Purging credentials.');
          try {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
          } catch (_) {}
          reconnectTimer = setTimeout(() => initBaileysSocket(), 3000);
        } else {
          // If connection dropped before pairing was completed, clean unregistered state so next QR is clean
          if (!isCredsRegistered()) {
            cleanUnregisteredAuthDir();
          }
          const reconnectDelay = isQrExpired ? 2500 : 5000;
          reconnectTimer = setTimeout(() => initBaileysSocket(), reconnectDelay);
        }
      }
    });

  } catch (err) {
    console.error('[WhatsApp Bridge] Fatal socket initialization error:', err);
    sessionState.status = 'DISCONNECTED';
    sessionState.lastError = err?.message;
    notifyClients();
    reconnectTimer = setTimeout(() => initBaileysSocket(), 8000);
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
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  // Send current state immediately
  res.write(`data: ${JSON.stringify(sessionState)}\n\n`);
  sseClients.add(res);

  req.on('close', () => {
    sseClients.delete(res);
  });
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

// Regenerate QR (Cleans unlinked state and starts fresh socket)
app.post('/generate-qr', requireAuth, async (req, res) => {
  try {
    console.log('[WhatsApp Bridge] Regenerate QR requested. Cleaning unlinked session and resetting socket...');
    if (sock) {
      try {
        sock.ev.removeAllListeners();
        sock.end();
      } catch (_) {}
      sock = null;
    }
    cleanUnregisteredAuthDir();

    sessionState.qrCode = '';
    sessionState.qrCodeDataUrl = '';
    sessionState.pairingCode = '';
    sessionState.status = 'CONNECTING';
    sessionState.lastActive = 'Re-initializing live WhatsApp QR...';
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
    cleanUnregisteredAuthDir();

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
      result = await sock.sendMessage(jid, {
        image: { url: imageUrl },
        caption: caption || text || ''
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

  try {
    let result;
    if (imageUrl) {
      result = await sock.sendMessage(channelJid, {
        image: { url: imageUrl },
        caption: caption || ''
      });
    } else {
      result = await sock.sendMessage(channelJid, {
        text: caption || ''
      });
    }

    return res.json({
      success: true,
      messageId: result?.key?.id,
      channelJid
    });
  } catch (err) {
    console.error(`[WhatsApp Bridge] Channel post error:`, err);
    return res.status(500).json({ success: false, error: err?.message });
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

app.listen(PORT, () => {
  console.log(`\n=============================================================`);
  console.log(`🚀 Vintage Vibes WhatsApp Persistent Bridge listening on port ${PORT}`);
  console.log(`🌐 Ready to connect with Vercel Frontend & ERP Clients`);
  console.log(`📁 Auth Directory: ${AUTH_DIR}`);
  console.log(`=============================================================\n`);
});
