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

// Logger
const logger = pino({ level: process.env.LOG_LEVEL || 'warn' });

// Initialize Baileys Socket
async function initBaileysSocket(requestPairingPhone = null) {
  try {
    sessionState.status = 'CONNECTING';
    sessionState.lastActive = 'Connecting to WhatsApp Socket...';
    sessionState.lastError = null;

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version, isLatest } = await fetchLatestBaileysVersion().catch(() => ({
      version: [2, 3000, 1015901307],
      isLatest: true
    }));

    console.log(`[WhatsApp Bridge] Using Baileys version ${version.join('.')}, isLatest=${isLatest}`);

    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: true,
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

    // If pairing code was explicitly requested
    if (requestPairingPhone && !state.creds.registered) {
      setTimeout(async () => {
        try {
          const cleanPhone = requestPairingPhone.replace(/\D/g, '');
          console.log(`[WhatsApp Bridge] Requesting pairing code for: ${cleanPhone}`);
          const code = await sock.requestPairingCode(cleanPhone);
          sessionState.pairingCode = code;
          sessionState.phoneNumber = `+${cleanPhone}`;
          sessionState.status = 'WAITING_PAIRING';
          sessionState.lastActive = `Pairing Code: ${code}`;
          console.log(`[WhatsApp Bridge] Generated Pairing Code: ${code}`);
        } catch (pairErr) {
          console.error('[WhatsApp Bridge] Pairing code error:', pairErr?.message);
          sessionState.lastError = pairErr?.message;
        }
      }, 3000);
    }

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
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

        const userJid = sock.user?.id || '';
        const phone = userJid.split(':')[0] || userJid.split('@')[0];
        if (phone) sessionState.phoneNumber = `+${phone}`;

        console.log(`[WhatsApp Bridge] Connection OPEN! Authenticated as: ${sessionState.phoneNumber}`);
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        sessionState.isConnected = false;
        sessionState.status = 'DISCONNECTED';
        sessionState.lastActive = `Disconnected (Status: ${statusCode || 'unknown'})`;
        sessionState.lastError = lastDisconnect?.error?.message || 'Socket closed';

        console.warn(`[WhatsApp Bridge] Connection closed. Reason: ${sessionState.lastError}. Reconnecting: ${shouldReconnect}`);

        if (shouldReconnect) {
          setTimeout(() => initBaileysSocket(), 5000);
        } else {
          console.log('[WhatsApp Bridge] Device was logged out. Clearing credentials.');
          try {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
          } catch {}
          setTimeout(() => initBaileysSocket(), 3000);
        }
      }
    });

  } catch (err) {
    console.error('[WhatsApp Bridge] Fatal socket initialization error:', err);
    sessionState.status = 'DISCONNECTED';
    sessionState.lastError = err?.message;
    setTimeout(() => initBaileysSocket(), 10000);
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
// REST API ENDPOINTS
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
    qrCodeDataUrl: sessionState.qrCodeDataUrl
  });
});

// Regenerate QR
app.post('/generate-qr', requireAuth, async (req, res) => {
  try {
    sessionState.qrCode = '';
    sessionState.qrCodeDataUrl = '';
    sessionState.pairingCode = '';
    if (sock) {
      try { sock.end(); } catch {}
    }
    await initBaileysSocket();
    res.json({ success: true, message: 'Re-initializing QR socket...' });
  } catch (err) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// Request 8-Digit Pairing Code
app.post('/pair', requireAuth, async (req, res) => {
  const { phoneNumber } = req.body || {};
  const cleanPhone = (phoneNumber || '').replace(/\D/g, '');

  if (!cleanPhone || cleanPhone.length < 8) {
    return res.status(400).json({ success: false, error: 'Valid phone number with country code is required.' });
  }

  try {
    if (sock) {
      try { sock.end(); } catch {}
    }
    await initBaileysSocket(cleanPhone);
    // Wait up to 5s for code
    for (let i = 0; i < 25; i++) {
      if (sessionState.pairingCode) break;
      await delay(200);
    }

    if (sessionState.pairingCode) {
      return res.json({
        success: true,
        pairingCode: sessionState.pairingCode,
        phoneNumber: `+${cleanPhone}`
      });
    }

    return res.json({
      success: true,
      message: 'Pairing requested. Poll /status for code.',
      phoneNumber: `+${cleanPhone}`
    });
  } catch (err) {
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
      try { await sock.logout(); } catch {}
      try { sock.end(); } catch {}
    }
    try {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    } catch {}

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

    setTimeout(() => initBaileysSocket(), 2000);
    return res.json({ success: true, message: 'WhatsApp session disconnected and unlinked.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n=============================================================`);
  console.log(`🚀 Vintage Vibes WhatsApp Persistent Bridge listening on port ${PORT}`);
  console.log(`🌐 Ready to connect with Vercel Frontend`);
  console.log(`📁 Auth Directory: ${AUTH_DIR}`);
  console.log(`=============================================================\n`);
});
