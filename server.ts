import 'dotenv/config';
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
import { ecommerceRouter } from './src/modules/ecommerce/ecommerce.routes.ts';
import { sortingRouter } from './src/modules/sorting/sorting.routes.ts';
import { applyCorsHeaders, isOriginAllowed } from './src/server/authValidator.ts';

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

  let dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || 'postgresql://postgres.wjjelqsrivnyiybarfmo:Makkani%402233@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres?sslmode=require&uselibpqcompat=true';
  if (dbUrl.includes('.pooler.supabase.com:5432')) {
    dbUrl = dbUrl.replace('.pooler.supabase.com:5432', '.pooler.supabase.com:6543');
  }
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

  // Request Correlation ID Middleware
  app.use((req, res, next) => {
    const correlationId = (req.headers['x-correlation-id'] as string) || `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    (req as any).correlationId = correlationId;
    res.setHeader('X-Correlation-ID', correlationId);
    next();
  });

  // Global Strict CORS & Tunnel Intermediary Header Handling
  app.use((req, res, next) => {
    const corsResult = applyCorsHeaders(req, res);
    if (corsResult.isPreflight) {
      if (!corsResult.allowed) {
        return; // 403 status already sent by applyCorsHeaders
      }
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

  // Health endpoint with live database connectivity verification
  app.get('/api/health', async (req, res) => {
    const startTime = Date.now();
    try {
      const { withDb } = await import('./src/db/pgPool.ts');
      const timeData = await withDb(async (client) => {
        const result = await client.query('SELECT NOW() as time');
        return result.rows[0]?.time;
      });
      return res.json({
        status: 'ok',
        db_connected: true,
        time: timeData || new Date().toISOString(),
        latency_ms: Date.now() - startTime,
        pool_type: 'SUPABASE_TRANSACTION_POOLER_6543',
        has_db_url: !!process.env.DATABASE_URL
      });
    } catch (err: any) {
      console.error('[server.ts Health Check Error]:', err?.message || err);
      return res.status(200).json({
        status: 'error',
        db_connected: false,
        error: err?.message || String(err),
        has_db_url: !!process.env.DATABASE_URL,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Enterprise Modular API Routes
  app.use('/api/auth', authRouter);
  app.use('/api/setup', setupRouter);
  app.use('/api/finance', financeRouter);
  app.use('/api/chart-of-accounts', financeRouter);
  app.use('/api/coa', financeRouter);
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
  app.use('/api/ecommerce', ecommerceRouter);
  app.use('/api/sorting', sortingRouter);
  app.get('/api/search', (req, res) => {
    return res.json(SetupController.globalSearch((req.query.q as string) || ''));
  });

  // Database RPC Proxy Endpoint (executes PostgreSQL stored procedures directly)
  app.post('/api/rpc/:fnName', async (req, res) => {
    const { fnName } = req.params;
    const body = req.body || {};
    let dbClient: Client | null = null;
    try {
      let dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || 'postgresql://postgres.wjjelqsrivnyiybarfmo:Makkani%402233@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres?sslmode=require&uselibpqcompat=true';
      if (dbUrl.includes('.pooler.supabase.com:5432')) {
        dbUrl = dbUrl.replace('.pooler.supabase.com:5432', '.pooler.supabase.com:6543');
      }
      try {
        const match = dbUrl.match(/^postgresql:\/\/([^:]+):(.*)@([^@\/]+)(:\d+)?(\/.*)$/);
        if (match) {
          let [_, user, rawPwd, host, port, rest] = match;
          if (rawPwd.startsWith('[') && rawPwd.endsWith(']')) rawPwd = rawPwd.slice(1, -1);
          dbUrl = `postgresql://${user}:${encodeURIComponent(decodeURIComponent(rawPwd))}@${host}${port || ''}${rest}`;
        }
      } catch (e) {}

      dbClient = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
      await dbClient.connect();

      if (fnName === 'create_party_with_coa') {
        const p_name = body.p_name;
        const p_type = body.p_type;
        const p_phone = body.p_phone || null;
        const p_trn = body.p_trn || null;
        const p_credit_limit = Number(body.p_credit_limit) || 0;
        const p_inventory_account_id = body.p_inventory_account_id || null;
        const p_expense_account = body.p_expense_account || null;

        const result = await dbClient.query(
          `SELECT public.create_party_with_coa($1, $2, $3, $4, $5, $6, $7) as data;`,
          [p_name, p_type, p_phone, p_trn, p_credit_limit, p_inventory_account_id, p_expense_account]
        );
        const data = result.rows[0]?.data;
        return res.json({ data, error: null });
      } else {
        const keys = Object.keys(body);
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
        const values = keys.map(k => body[k]);
        const result = await dbClient.query(
          `SELECT public.${fnName}(${placeholders}) as data;`,
          values
        );
        return res.json({ data: result.rows[0]?.data, error: null });
      }
    } catch (err: any) {
      console.error(`[RPC Proxy] Error executing ${fnName}:`, err?.message || err);
      return res.status(400).json({ data: null, error: { message: err?.message || 'RPC execution failed' } });
    } finally {
      if (dbClient) await dbClient.end().catch(() => {});
    }
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

  // Structured Server-side API Error Logging Middleware
  app.use((err: any, req: any, res: any, next: any) => {
    const correlationId = req.correlationId || (req.headers?.['x-correlation-id'] as string) || 'unknown';
    const userId = req.user?.id || 'unauthenticated';
    const clientReportedId = (req.headers?.['x-user-id'] as string) || null;
    const isAuthError = err?.status === 401 || err?.status === 403 || err?.statusCode === 401 || err?.statusCode === 403 || /unauthorized|forbidden|jwt|token|not authenticated/i.test(err?.message || '');
    const statusCode = isAuthError ? (err.status || err.statusCode || 401) : (err.status || err.statusCode || 500);

    console.error('[API Server Error]', {
      correlationId,
      endpoint: req.originalUrl || req.url,
      method: req.method,
      userId,
      ...(clientReportedId ? { clientReportedId } : {}),
      errorCode: err?.code || (isAuthError ? 'AUTH_ERROR' : 'INTERNAL_ERROR'),
      errorMessage: err?.message || String(err)
    });

    if (res.headersSent) return next(err);

    return res.status(statusCode).json({
      success: false,
      error: err?.message || (isAuthError ? 'Authentication/Authorization required' : 'Internal server error'),
      correlationId
    });
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
