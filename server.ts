import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import compression from 'compression';
import { createServer as createViteServer } from 'vite';

import { authRouter } from './src/modules/auth/auth.routes.ts';
import { setupRouter } from './src/modules/setup/setup.routes.ts';
import { financeRouter } from './src/modules/finance/finance.routes.ts';
import { partiesRouter } from './src/modules/parties/parties.routes.ts';
import { hrRouter } from './src/modules/hr/hr.routes.ts';
import { purchaseRouter } from './src/modules/purchase/purchase.routes.ts';
import { salesRouter } from './src/modules/sales/sales.routes.ts';
import { auditRouter } from './src/modules/audit/audit.routes.ts';
import { liveStreamingRouter } from './src/modules/liveStreaming/liveStreaming.routes.ts';
import { paymentRouter } from './src/server/paymentRoutes.ts';
import { marketingRouter, publicFeedRouter } from './src/modules/marketing/marketing.routes.ts';
import { SetupController } from './src/modules/setup/setup.controller.ts';
import { devicesRouter } from './src/modules/devices/devices.routes.ts';
import { presenceRouter } from './src/modules/presence/presence.routes.ts';
import { eventHub } from './src/server/events.ts';
import { BotDetector } from './src/server/botDetector.ts';
import { Client } from 'pg';
import { createClient } from '@supabase/supabase-js';

const supaUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://wjjelqsrivnyiybarfmo.supabase.co';
const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabaseAdmin = createClient(supaUrl, supaKey || 'anon-key');

async function recordExpressThreat(analysis: any, req: any) {
  const ip = BotDetector.extractIp(req);
  const rawUa = (req.headers?.['user-agent'] || '').toString();
  const hexHash = Buffer.from(ip + '-' + (analysis.botName || 'bot')).toString('hex').slice(0, 16);
  const deviceId = `bot-${hexHash}`;
  const threatType = analysis.threatType || (analysis.isHoneypotHit ? 'HONEYPOT_TRAP' : 'BAD_BOT');
  const reqUrl = (req.originalUrl || req.url || '').toString();
  const reqMethod = req.method || 'GET';
  const reason = analysis.reason || 'Security Sentinel Trap Triggered';

  const safeHeaders: Record<string, string> = {};
  if (req.headers) {
    for (const [k, v] of Object.entries(req.headers)) {
      if (['authorization', 'cookie', 'x-forwarded-for'].includes(k.toLowerCase())) continue;
      safeHeaders[k] = Array.isArray(v) ? v.join(', ') : String(v);
    }
  }

  let rawPayloadStr = '';
  if (req.body) {
    try {
      rawPayloadStr = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    } catch {
      rawPayloadStr = String(req.body);
    }
  }

  let dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || 'postgresql://postgres.wjjelqsrivnyiybarfmo:Makkani%402233@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres';
  try {
    const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    await client.connect();
    await client.query(`
      INSERT INTO device_installations (
        device_id, user_id, username, ip_address, device_type, device_model, user_agent, is_standalone, install_status, bot_type, block_reason, max_devices_limit, city, country, last_active_at
      ) VALUES ($1, null, $2, $3, $4, $5, $6, false, 'BLOCKED', 'BAD_BOT', $7, 0, 'Global', 'Global', NOW())
      ON CONFLICT (device_id) DO UPDATE
      SET last_active_at = NOW(),
          ip_address = EXCLUDED.ip_address,
          install_status = 'BLOCKED',
          bot_type = 'BAD_BOT',
          block_reason = EXCLUDED.block_reason;
    `, [deviceId, `[BAD BOT] ${analysis.botName}`, ip, 'Bad Bot / Exploit Scanner', analysis.botName, rawUa, reason]);

    await client.query(`
      INSERT INTO security_threat_logs (
        ip_address, country, isp_org, user_agent, request_method, request_url, headers, raw_payload, threat_type, created_at
      ) VALUES ($1, 'Global', 'Automated Host / Public IP', $2, $3, $4, $5, $6, $7, NOW());
    `, [ip, rawUa, reqMethod, reqUrl, JSON.stringify(safeHeaders), rawPayloadStr, threatType]);
    await client.end();
  } catch (_) {
    try {
      await supabaseAdmin.from('security_threat_logs').insert({
        ip_address: ip,
        country: 'Global',
        isp_org: 'Automated Host / Public IP',
        user_agent: rawUa,
        request_method: reqMethod,
        request_url: reqUrl,
        headers: safeHeaders,
        raw_payload: rawPayloadStr,
        threat_type: threatType,
        created_at: new Date().toISOString()
      });
    } catch (_) {}
  }
}

const __filename = fileURLToPath(import.meta.url);
// Global resilience: catch unhandled exceptions (such as Baileys websocket or undici fetch disconnects)
process.on('uncaughtException', (err) => {
  console.warn('[Server] Uncaught exception caught safely:', err?.message || err);
});
process.on('unhandledRejection', (reason) => {
  console.warn('[Server] Unhandled rejection caught safely:', reason);
});

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = Number(process.env.PORT) || 3000;
  const HOST = process.env.HOST;

  // Enable GZIP / Brotli compression for fast mobile loading
  app.use(compression());

  // JSON and URL-encoded body parsers
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));

  // Global CORS & Tunnel Intermediary Header Handling
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, ngrok-skip-browser-warning');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Security Sentinel & Honeypot Trap Defense Middleware
  app.use(async (req, res, next) => {
    const analysis = BotDetector.analyze(req);
    if (analysis.isBadBot) {
      recordExpressThreat(analysis, req).catch(() => {});
      return res.status(403).json({
        success: false,
        blocked: true,
        error: 'Access Denied: Blocked by Vintage Vibes Security Sentinel',
        reason: analysis.reason,
        threatType: analysis.threatType,
        botName: analysis.botName,
        ip: BotDetector.extractIp(req)
      });
    }
    next();
  });

  // Health endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'healthy',
      system: 'Vintage Vibe Enterprise ERP',
      engine: 'Modular Architecture'
    });
  });

  // Enterprise Modular API Routes
  app.use('/api/auth', authRouter);
  app.use('/api/setup', setupRouter);
  app.use('/api/finance', financeRouter);
  app.use('/api/parties', partiesRouter);
  app.use('/api/hr', hrRouter);
  app.use('/api/purchase', purchaseRouter);
  app.use('/api/bales', purchaseRouter);
  app.use('/api/sales', salesRouter);
  app.use('/api/audit', auditRouter);
  app.use('/api/live-stream', liveStreamingRouter);
  app.use('/api/live', liveStreamingRouter);
  app.use('/api/booth', liveStreamingRouter);

  app.use('/api/payments', paymentRouter);
  app.use('/api/webhooks', paymentRouter);
  app.use('/api/marketing', marketingRouter);
  app.use('/api/feed', publicFeedRouter);
  app.use('/api/devices', devicesRouter);
  app.use('/api/presence', presenceRouter);
  app.get('/api/search', (req, res) => {
    return res.json(SetupController.globalSearch((req.query.q as string) || ''));
  });

  // Multi-User Real-time SSE Sync Endpoints
  app.get('/api/events/subscribe', (req, res) => {
    eventHub.subscribe(req, res);
  });
  app.get('/api/events/status', (req, res) => {
    return res.json(eventHub.getStatus());
  });
  app.post('/api/events/broadcast', (req, res) => {
    const { module, entity, action, documentRef, data } = req.body;
    eventHub.broadcast({
      type: 'ENTITY_MUTATED',
      module: module || 'ALL',
      entity: entity || 'RECORD',
      action: action || 'UPDATE',
      documentRef,
      data
    });
    return res.json({ success: true, broadcastedAt: new Date().toISOString() });
  });

  // Vite middleware in dev mode, or static file serving in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: ['.ngrok-free.dev', '.loca.lt', '.trycloudflare.com', '.lhr.life', 'all'],
        hmr: {
          server
        }
      },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Common port 5173 auto-redirect to 3000
  try {
    const redirectApp = express();
    redirectApp.all('*', (req, res) => {
      const hostHeader = req.headers.host || 'localhost';
      const hostname = hostHeader.split(':')[0];
      res.redirect(`http://${hostname}:${PORT}${req.originalUrl}`);
    });
    const redirectServer = http.createServer(redirectApp);
    redirectServer.on('error', () => { /* port 5173 might be occupied, ignore */ });
    redirectServer.listen(5173);
  } catch (_) {}

  const onListen = () => {
    console.log(`\n======================================================`);
    console.log(`  VINTAGE VIBE ENTERPRISE ERP - LIVE PREVIEW SERVER`);
    console.log(`======================================================`);
    console.log(`  Local Access:   http://localhost:${PORT}`);
    console.log(`  IPv4 Loopback:  http://127.0.0.1:${PORT}`);
    console.log(`  Redirect Port:  http://localhost:5173 -> :${PORT}`);
    console.log(`  Hot-Reload HMR: ACTIVE`);
    console.log(`======================================================\n`);
  };

  if (HOST) {
    server.listen(PORT, HOST, onListen);
  } else {
    // Omitting host binds to dual-stack IPv6 (::) and IPv4 (0.0.0.0)
    server.listen(PORT, onListen);
  }
}

startServer();
