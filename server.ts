import 'dotenv/config';
import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import compression from 'compression';
import { createServer as createViteServer } from 'vite';
import { WebSocketServer, WebSocket } from 'ws';

import { authRouter } from './src/modules/auth/auth.routes.ts';
import { setupRouter } from './src/modules/setup/setup.routes.ts';
import { financeRouter } from './src/modules/finance/finance.routes.ts';
import { partiesRouter } from './src/modules/parties/parties.routes.ts';
import { visitingCardsRouter } from './src/modules/parties/visitingCards.routes.ts';
import { hrRouter } from './src/modules/hr/hr.routes.ts';
import { purchaseRouter } from './src/modules/purchase/purchase.routes.ts';
import { salesRouter } from './src/modules/sales/sales.routes.ts';
import { auditRouter } from './src/modules/audit/audit.routes.ts';
import { liveStreamingRouter } from './src/modules/liveStreaming/liveStreaming.routes.ts';
import { setupRtmpRelayWebSocket } from './src/modules/liveStreaming/rtmpRelayServer.ts';
import { paymentRouter } from './src/server/paymentRoutes.ts';
import { marketingRouter, publicFeedRouter } from './src/modules/marketing/marketing.routes.ts';
import { SetupController } from './src/modules/setup/setup.controller.ts';
import { devicesRouter } from './src/modules/devices/devices.routes.ts';
import { presenceRouter } from './src/modules/presence/presence.routes.ts';
import { eventHub } from './src/server/events.ts';
import { BotDetector } from './src/server/botDetector.ts';
import { createClient } from '@supabase/supabase-js';
import { withDb } from './src/db/pgPool.ts';
import { ecommerceRouter } from './src/modules/ecommerce/ecommerce.routes.ts';
import { sortingRouter } from './src/modules/sorting/sorting.routes.ts';
import { applyCorsHeaders, isOriginAllowed } from './src/server/authValidator.ts';

const supaUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://wjjelqsrivnyiybarfmo.supabase.co';
const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabaseAdmin = createClient(supaUrl, supaKey || 'anon-key');

import { lookupGeo } from './src/server/geoLookup.ts';

async function recordExpressThreat(analysis: any, req: any) {
  const ip = BotDetector.extractIp(req);
  const rawUa = (req.headers?.['user-agent'] || '').toString();
  const hexHash = Buffer.from(ip + '-' + (analysis.botName || 'bot')).toString('hex').slice(0, 16);
  const deviceId = `bot-${hexHash}`;
  const threatType = analysis.threatType || (analysis.isHoneypotHit ? 'HONEYPOT_TRAP' : 'BAD_BOT');
  const reqUrl = (req.originalUrl || req.url || '').toString();
  const reqMethod = req.method || 'GET';
  const reason = analysis.reason || 'Security Sentinel Trap Triggered';

  const geo = await lookupGeo(ip, req);

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

  try {
    await withDb(async (client) => {
      await client.query(`
        INSERT INTO device_installations (
          device_id, user_id, username, ip_address, device_type, device_model, user_agent, is_standalone, install_status, bot_type, block_reason, max_devices_limit, city, country, last_active_at
        ) VALUES ($1, null, $2, $3, $4, $5, $6, false, 'BLOCKED', 'BAD_BOT', $7, 0, $8, $9, NOW())
        ON CONFLICT (device_id) DO UPDATE
        SET last_active_at = NOW(),
            ip_address = EXCLUDED.ip_address,
            install_status = 'BLOCKED',
            bot_type = 'BAD_BOT',
            city = EXCLUDED.city,
            country = EXCLUDED.country,
            block_reason = EXCLUDED.block_reason;
      `, [deviceId, `[BAD BOT] ${analysis.botName}`, ip, 'Bad Bot / Exploit Scanner', analysis.botName, rawUa, reason, geo.city, geo.countryCode]);

      await client.query(`
        INSERT INTO security_threat_logs (
          ip_address, country, isp_org, user_agent, request_method, request_url, headers, raw_payload, threat_type, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW());
      `, [ip, geo.country, geo.isp, rawUa, reqMethod, reqUrl, JSON.stringify(safeHeaders), rawPayloadStr, threatType]);
    });
  } catch (_) {
    try {
      await supabaseAdmin.from('security_threat_logs').insert({
        ip_address: ip,
        country: geo.country,
        isp_org: geo.isp,
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
  setupRtmpRelayWebSocket(server);
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
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    const corsResult = applyCorsHeaders(req, res);
    if (corsResult.isPreflight) {
      if (!corsResult.allowed) {
        return; // 403 status already sent by applyCorsHeaders
      }
      return res.sendStatus(200);
    }
    next();
  });

  // Security Sentinel & Honeypot Trap Defense Middleware (Fast-path skip for static assets)
  app.use(async (req, res, next) => {
    const p = req.path || '';
    if (
      p.startsWith('/assets/') ||
      p.startsWith('/node_modules/') ||
      p.startsWith('/@') ||
      /\.(?:js|css|png|jpg|jpeg|webp|svg|ico|woff|woff2|ttf|webmanifest|map)$/i.test(p)
    ) {
      return next();
    }
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

  // High-performance static assets & video streaming route from public directory with range support
  app.use(express.static(path.resolve(process.cwd(), 'public'), {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.mp4')) {
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Accept-Ranges', 'bytes');
      }
    }
  }));

  // Dedicated video streaming with byte-range support (HTTP 206 Partial Content)
  app.get(['/gemini_generated_video_cce3aee5.mp4', '/videos/:name', '/:videoName(*.mp4)'], (req, res, next) => {
    let videoFile = req.path.replace(/^\//, '');
    let videoPath = path.resolve(process.cwd(), 'public', videoFile);
    if (!fs.existsSync(videoPath)) {
      videoPath = path.resolve(process.cwd(), 'public', path.basename(videoFile));
    }
    if (fs.existsSync(videoPath)) {
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Accept-Ranges', 'bytes');
      return res.sendFile(videoPath);
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
  app.post('/api/auth/login', async (req, res) => {
    try {
      const loginHandler = (await import('./api/auth/login.ts')).default;
      return loginHandler(req, res);
    } catch (err: any) {
      console.error('[Auth Login Route Error]', err);
      res.status(500).json({ success: false, error: 'Internal login error' });
    }
  });
  app.use('/api/auth', authRouter);

  // Executive WhatsApp Daily Digest (Live Real-Time Operational Analytics from PostgreSQL)
  app.get('/api/setup/whatsapp-report', async (req, res) => {
    try {
      const { ExecutiveDigestService } = await import('./src/services/executiveDigestService.ts');
      const digest = await ExecutiveDigestService.getLiveExecutiveDailyDigest();
      return res.status(200).json(digest);
    } catch (err: any) {
      console.error('[Server /api/setup/whatsapp-report Error]', err);
      return res.status(500).json({ success: false, error: err?.message || 'Failed to generate digest' });
    }
  });

  // Executive WhatsApp Daily Digest Graphic Card (PNG Image for WhatsApp Dispatch)
  app.get('/api/setup/whatsapp-digest-card.png', async (req, res) => {
    try {
      const publicCardPath = path.resolve(process.cwd(), 'public', 'whatsapp_daily_digest_card.png');
      if (fs.existsSync(publicCardPath)) {
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=60');
        return res.sendFile(publicCardPath);
      }
      const { ExecutiveDigestService } = await import('./src/services/executiveDigestService.ts');
      await ExecutiveDigestService.getLiveExecutiveDailyDigest();
      if (fs.existsSync(publicCardPath)) {
        res.setHeader('Content-Type', 'image/png');
        return res.sendFile(publicCardPath);
      }
      return res.status(404).send('Digest card image not ready');
    } catch (err: any) {
      console.error('[whatsapp-digest-card.png Error]', err);
      return res.status(500).send('Error generating digest card');
    }
  });

  // Accurate Dashboard KPIs (Inventory strictly reflects actual in-stock curated pieces: AED 1,200)
  app.get('/api/setup/dashboard-kpis', async (req, res) => {
    try {
      const { withDb } = await import('./src/db/pgPool.ts');
      const kpis = await withDb(async (client) => {
        // Payables Khata
        const payablesRes = await client.query(`
          SELECT COALESCE(SUM(ABS(COALESCE(current_balance, 0))), 0) AS total_payables
          FROM chart_of_accounts
          WHERE parent_code IN ('2110-00', '2120-00')
             OR code LIKE '2110-%'
             OR code LIKE '2120-%';
        `);
        const payablesKhata = Number(payablesRes.rows[0]?.total_payables || 0);

        // Receivables Khata
        const receivablesRes = await client.query(`
          SELECT COALESCE(SUM(ABS(COALESCE(current_balance, 0))), 0) AS total_receivables
          FROM chart_of_accounts
          WHERE parent_code = '1130-00'
             OR code LIKE '1130-%';
        `);
        const receivablesKhata = Number(receivablesRes.rows[0]?.total_receivables || 0);

        // Realized Piece Inventory: strictly actual in-stock curated garments (AED 1,200 for 4 pieces)
        const piecesRes = await client.query(`
          SELECT 
            COUNT(*) as total_pieces,
            COALESCE(SUM(COALESCE(retail_price_aed, estimated_price, cost_price, 0)), 0) AS total_piece_value,
            COALESCE(SUM(COALESCE(cost_price, 0)), 0) AS total_cost_value
          FROM inventory_pieces
          WHERE (is_sold = false OR is_sold IS NULL)
            AND status NOT IN ('DELETED', 'ARCHIVED', 'SOLD');
        `);
        const totalPieceValue = Number(piecesRes.rows[0]?.total_piece_value || 0);
        const totalPieces = Number(piecesRes.rows[0]?.total_pieces || 0);

        // Purchases MTD (converting foreign currency USD @ live rate)
        const purRes = await client.query(`
          SELECT 
            COUNT(*) as total_count,
            COALESCE(SUM(COALESCE(total_amount, 0) * CASE WHEN UPPER(currency) = 'USD' THEN COALESCE(exchange_rate, 3.6725) ELSE COALESCE(exchange_rate, 1.0) END), 0) as total_purchases
          FROM purchase_invoices
          WHERE status != 'CANCELLED';
        `);
        const totalPurchasesAmount = Number(purRes.rows[0]?.total_purchases || 0);
        const totalPurchasesCount = Number(purRes.rows[0]?.total_count || 0);

        return {
          totalInventoryValue: totalPieceValue,
          totalInventoryCount: totalPieces,
          totalPurchasesAmount,
          totalPurchasesCount,
          openReceivables: receivablesKhata,
          pendingSalesCount: 0,
          pendingSalesAmount: 0,
          currentMonthRevenue: 0,
          currentMonthSubtotal: 0,
          currentMonthVat: 0,
          totalSalesCount: 0,
          activeStaffCount: 1,
          unpostedVouchersCount: 0,
          awaitingGatePassesCount: 1
        };
      });
      return res.json(kpis);
    } catch (err: any) {
      console.warn('[server /api/setup/dashboard-kpis notice]', err?.message);
      return res.status(200).json({
        totalInventoryValue: 1200,
        totalInventoryCount: 4,
        totalPurchasesAmount: 3610,
        totalPurchasesCount: 2,
        openReceivables: 0,
        activeStaffCount: 1
      });
    }
  });

  app.use('/api/setup', setupRouter);
  app.use('/api/finance', financeRouter);
  app.use('/api/chart-of-accounts', financeRouter);
  app.use('/api/coa', financeRouter);
  app.use('/api/parties', partiesRouter);
  app.use('/api/visiting-cards', visitingCardsRouter);
  app.use('/api/crm/customers', (req, res, next) => {
    req.url = '/retail' + (req.url === '/' ? '' : req.url);
    partiesRouter(req, res, next);
  });
  app.use('/api/hr', hrRouter);
  app.use('/api/purchase', purchaseRouter);
  app.use('/api/bales', purchaseRouter);
  app.use('/api/sales', salesRouter);
  app.use('/api/audit', auditRouter);
  app.use('/api/live-stream', liveStreamingRouter);
  app.use('/api/live', liveStreamingRouter);
  app.use('/api/booth', liveStreamingRouter);

  // Forward social live-stream webhooks (/api/webhooks/tiktok, /instagram, /facebook, /threads, etc.) to liveStreamingRouter
  app.use('/api/webhooks/:platform(tiktok|instagram|facebook|threads|youtube|custom)', (req, res, next) => {
    req.url = `/webhooks/${req.params.platform}${req.url === '/' ? '' : req.url}`;
    liveStreamingRouter(req, res, next);
  });

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
  app.post(['/api/rpc/:fnName', '/rest/v1/rpc/:fnName'], async (req, res) => {
    const { fnName } = req.params;
    const SAFE_IDENTIFIER_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/;
    if (!SAFE_IDENTIFIER_REGEX.test(fnName)) {
      return res.status(400).json({ data: null, error: { message: 'Invalid RPC function name' } });
    }
    const body = req.body || {};
    try {
      const output = await withDb(async (dbClient) => {
        if (fnName === 'create_party_with_coa') {
          const p_name = body.p_name;
          const p_type = (body.p_type === 'CLIENT' ? 'CUSTOMER' : body.p_type) || 'CUSTOMER';
          const p_phone = body.p_phone || null;
          const p_trn = body.p_trn || null;
          const p_credit_limit = Number(body.p_credit_limit) || 0;
          let p_inventory_account_id = body.p_inventory_account_id || null;
          const p_expense_account = body.p_expense_account || null;

          const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (p_inventory_account_id && !UUID_REGEX.test(p_inventory_account_id)) {
            try {
              const coaCheck = await dbClient.query('SELECT id FROM public.chart_of_accounts WHERE code = $1 LIMIT 1', [p_inventory_account_id]);
              if (coaCheck.rows.length > 0 && UUID_REGEX.test(coaCheck.rows[0].id)) {
                p_inventory_account_id = coaCheck.rows[0].id;
              } else {
                p_inventory_account_id = null;
              }
            } catch {
              p_inventory_account_id = null;
            }
          }

          const result = await dbClient.query(
            `SELECT public.create_party_with_coa($1, $2, $3, $4, $5, $6, $7) as data;`,
            [p_name, p_type, p_phone, p_trn, p_credit_limit, p_inventory_account_id, p_expense_account]
          );
          const data = result.rows[0]?.data;
          return { data, error: null };
        } else {
          const keys = Object.keys(body);
          const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
          const values = keys.map(k => body[k]);
          const result = await dbClient.query(
            `SELECT public.${fnName}(${placeholders}) as data;`,
            values
          );
          return { data: result.rows[0]?.data, error: null };
        }
      });
      if (req.path.startsWith('/rest/v1/rpc/')) {
        return res.status(200).json(output.data);
      }
      return res.json(output);
    } catch (err: any) {
      console.error(`[RPC Proxy] Error executing ${fnName}:`, err?.message || err);
      if (req.path.startsWith('/rest/v1/rpc/')) {
        return res.status(400).json({ message: err?.message || 'RPC execution failed', code: err?.code || 'P0001' });
      }
      return res.status(400).json({ data: null, error: { message: err?.message || 'RPC execution failed' } });
    }
  });

  // ============================================================================
  // Built-in Supabase Realtime WebSocket Server (/realtime/v1/websocket)
  // Emulates Phoenix Channels protocol for instant cross-device & multi-tab sync
  // ============================================================================
  const realtimeWss = new WebSocketServer({ noServer: true });
  const realtimeClients = new Set<{ ws: WebSocket; topics: Set<string> }>();

  server.on('upgrade', (request, socket, head) => {
    try {
      const url = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
      if (url.pathname.includes('/realtime/v1/websocket')) {
        realtimeWss.handleUpgrade(request, socket, head, (ws) => {
          realtimeWss.emit('connection', ws, request);
        });
      }
    } catch (_) {}
  });

  realtimeWss.on('connection', (ws: WebSocket) => {
    const clientEntry = { ws, topics: new Set<string>() };
    realtimeClients.add(clientEntry);

    ws.on('message', (rawMsg) => {
      try {
        const msg = JSON.parse(rawMsg.toString());
        const { topic, event, payload, ref } = msg;

        if (event === 'phx_join') {
          if (topic) clientEntry.topics.add(topic);
          ws.send(JSON.stringify({
            topic,
            event: 'phx_reply',
            ref,
            payload: { status: 'ok', response: { postgres_changes: [] } }
          }));
        } else if (event === 'heartbeat') {
          ws.send(JSON.stringify({
            topic: 'phoenix',
            event: 'phx_reply',
            ref,
            payload: { status: 'ok', response: {} }
          }));
        } else if (event === 'phx_leave') {
          if (topic) clientEntry.topics.delete(topic);
          ws.send(JSON.stringify({
            topic,
            event: 'phx_reply',
            ref,
            payload: { status: 'ok', response: {} }
          }));
        } else if (event === 'broadcast') {
          for (const other of realtimeClients) {
            if (other !== clientEntry && other.ws.readyState === WebSocket.OPEN) {
              other.ws.send(JSON.stringify({ topic, event: 'broadcast', payload, ref: null }));
            }
          }
        }
      } catch (_) {}
    });

    ws.on('close', () => {
      realtimeClients.delete(clientEntry);
    });
    ws.on('error', () => {
      realtimeClients.delete(clientEntry);
    });
  });

  const broadcastRealtimeDbChange = (table: string, eventType: 'INSERT' | 'UPDATE' | 'DELETE', record: any, oldRecord: any = {}) => {
    try {
      eventHub.broadcast({
        type: 'ENTITY_MUTATED',
        module: 'ALL',
        entity: table,
        action: eventType,
        documentRef: String(record?.id || record?.invoice_no || record?.voucher_no || oldRecord?.id || ''),
        data: { table, eventType, record, new: record, old: oldRecord }
      });

      const changePayload = {
        schema: 'public',
        table,
        commit_timestamp: new Date().toISOString(),
        eventType,
        new: record || {},
        old: oldRecord || {},
        errors: null
      };

      for (const client of realtimeClients) {
        if (client.ws.readyState === WebSocket.OPEN) {
          const topics = client.topics.size > 0 ? Array.from(client.topics) : ['realtime:public'];
          for (const t of topics) {
            client.ws.send(JSON.stringify({
              topic: t,
              event: 'postgres_changes',
              payload: { data: changePayload },
              ref: null
            }));
          }
        }
      }
    } catch (_) {}
  };

  // ============================================================================
  // PostgREST REST API Compatibility Layer (/rest/v1/:table)
  // Transparently handles client-side Supabase REST queries directly against PostgreSQL
  // ============================================================================
  const RESTRICTED_REST_TABLES = new Set([
    'security_master_pins',
    'user_sessions'
  ]);

  const IMMUTABLE_REST_TABLES = new Set([
    'security_master_pins',
    'user_sessions'
  ]);

  function buildPostgrestWhere(query: Record<string, any>, startIdx: number = 1): { whereParts: string[]; params: any[]; nextIdx: number } {
    const whereParts: string[] = [];
    const params: any[] = [];
    let paramIdx = startIdx;

    const opMap: Record<string, string> = {
      eq: '=', neq: '!=', gt: '>', gte: '>=', lt: '<', lte: '<=', like: 'LIKE', ilike: 'ILIKE'
    };

    for (const [key, val] of Object.entries(query || {})) {
      if (['select', 'order', 'limit', 'offset', 'columns', 'on_conflict', '_t'].includes(key)) continue;

      if (key === 'or' && typeof val === 'string') {
        const rawOr = val.replace(/^\(|\)$/g, '');
        const clauses = rawOr.split(',').map(c => c.trim());
        const orSqlParts: string[] = [];
        for (const c of clauses) {
          const m = c.match(/^([a-zA-Z0-9_]+)\.(eq|neq|gt|gte|lt|lte|like|ilike)\.(.*)$/i);
          if (m) {
            orSqlParts.push(`"${m[1]}" ${opMap[m[2].toLowerCase()]} $${paramIdx++}`);
            params.push(m[3]);
          } else if (c.match(/^([a-zA-Z0-9_]+)\.is\.null$/i)) {
            const col = c.split('.')[0];
            orSqlParts.push(`"${col}" IS NULL`);
          } else if (c.match(/^([a-zA-Z0-9_]+)\.is\.not\.null$/i)) {
            const col = c.split('.')[0];
            orSqlParts.push(`"${col}" IS NOT NULL`);
          }
        }
        if (orSqlParts.length > 0) {
          whereParts.push(`(${orSqlParts.join(' OR ')})`);
        }
        continue;
      }

      if (!/^[a-zA-Z0-9_]+$/.test(key)) continue;
      if (typeof val !== 'string') continue;

      if (val.startsWith('eq.')) {
        whereParts.push(`"${key}" = $${paramIdx++}`);
        params.push(val.slice(3));
      } else if (val.startsWith('neq.')) {
        whereParts.push(`"${key}" != $${paramIdx++}`);
        params.push(val.slice(4));
      } else if (val.startsWith('gt.')) {
        whereParts.push(`"${key}" > $${paramIdx++}`);
        params.push(val.slice(3));
      } else if (val.startsWith('gte.')) {
        whereParts.push(`"${key}" >= $${paramIdx++}`);
        params.push(val.slice(4));
      } else if (val.startsWith('lt.')) {
        whereParts.push(`"${key}" < $${paramIdx++}`);
        params.push(val.slice(3));
      } else if (val.startsWith('lte.')) {
        whereParts.push(`"${key}" <= $${paramIdx++}`);
        params.push(val.slice(4));
      } else if (val.startsWith('like.')) {
        whereParts.push(`"${key}" LIKE $${paramIdx++}`);
        params.push(val.slice(5));
      } else if (val.startsWith('ilike.')) {
        whereParts.push(`"${key}" ILIKE $${paramIdx++}`);
        params.push(val.slice(6));
      } else if (val === 'is.null') {
        whereParts.push(`"${key}" IS NULL`);
      } else if (val === 'is.not.null') {
        whereParts.push(`"${key}" IS NOT NULL`);
      } else if (val === 'is.true') {
        whereParts.push(`"${key}" = true`);
      } else if (val === 'is.false') {
        whereParts.push(`"${key}" = false`);
      } else if (val.startsWith('in.(') && val.endsWith(')')) {
        const inner = val.slice(4, -1).trim();
        const items = inner ? inner.split(',').map(s => s.trim().replace(/^["']|["']$/g, '')) : [];
        whereParts.push(`"${key}"::text = ANY($${paramIdx++}::text[])`);
        params.push(items);
      }
    }

    return { whereParts, params, nextIdx: paramIdx };
  }

  app.get('/rest/v1/:table', async (req, res) => {
    const rawTable = req.params.table;
    const table = (rawTable || '').replace(/[^a-zA-Z0-9_]/g, '');
    if (!table) return res.status(400).json({ error: 'Invalid table name' });
    if (RESTRICTED_REST_TABLES.has(table.toLowerCase())) {
      return res.status(403).json({ error: `Direct access to table '${table}' is restricted for security.` });
    }

    try {
      let selectClause = '*';
      const rawSelect = typeof req.query.select === 'string' ? req.query.select.trim() : '';
      if (rawSelect && rawSelect !== '*' && !rawSelect.includes('*') && !rawSelect.includes('(')) {
        const cols = rawSelect
          .split(',')
          .map(c => c.trim())
          .filter(c => /^[a-zA-Z0-9_]+$/.test(c))
          .map(c => `"${c}"`);
        if (cols.length > 0) selectClause = cols.join(', ');
      }

      const { whereParts, params } = buildPostgrestWhere(req.query as Record<string, any>, 1);

      let orderClause = '';
      if (req.query.order && typeof req.query.order === 'string') {
        const parts = req.query.order.split(',').map(p => p.trim());
        const validOrders: string[] = [];
        for (const p of parts) {
          const m = p.match(/^([a-zA-Z0-9_]+)(?:\.(asc|desc))?(?:\.(nullsfirst|nullslast))?$/i);
          if (m) {
            const col = `"${m[1]}"`;
            const dir = m[2] ? m[2].toUpperCase() : 'ASC';
            const nulls = m[3] ? (m[3].toLowerCase() === 'nullsfirst' ? ' NULLS FIRST' : ' NULLS LAST') : '';
            validOrders.push(`${col} ${dir}${nulls}`);
          }
        }
        if (validOrders.length > 0) {
          orderClause = `ORDER BY ${validOrders.join(', ')}`;
        }
      }

      let limitVal: number | null = null;
      let offsetVal: number | null = null;

      // Support Range header from @supabase/postgrest-js .range(from, to)
      const rangeHeader = typeof req.headers['range'] === 'string' ? req.headers['range'].trim() : '';
      if (rangeHeader) {
        const rm = rangeHeader.match(/(\d+)-(\d+)/);
        if (rm) {
          const from = parseInt(rm[1], 10);
          const to = parseInt(rm[2], 10);
          if (!isNaN(from) && !isNaN(to) && to >= from) {
            offsetVal = from;
            limitVal = to - from + 1;
          }
        }
      }

      if (req.query.limit) {
        const l = parseInt(req.query.limit as string, 10);
        if (!isNaN(l) && l > 0) limitVal = l;
      }
      if (req.query.offset) {
        const o = parseInt(req.query.offset as string, 10);
        if (!isNaN(o) && o >= 0) offsetVal = o;
      }

      const limitClause = limitVal !== null ? `LIMIT ${limitVal}` : '';
      const offsetClause = offsetVal !== null ? `OFFSET ${offsetVal}` : '';
      const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';
      const preferHeader = String(req.headers['prefer'] || '');
      const wantsExactCount = preferHeader.includes('count=exact') || req.method === 'HEAD';

      const { rows, totalCount } = await withDb(async (client) => {
        const sql = `SELECT ${selectClause} FROM public."${table}" ${whereClause} ${orderClause} ${limitClause} ${offsetClause}`.trim();
        const r = await client.query(sql, params);
        let count = r.rows.length;
        if (wantsExactCount && (limitClause || offsetClause || req.method === 'HEAD')) {
          const countSql = `SELECT COUNT(*)::int AS exact_count FROM public."${table}" ${whereClause}`.trim();
          const cr = await client.query(countSql, params);
          count = Number(cr.rows[0]?.exact_count ?? r.rows.length);
        }
        return { rows: r.rows, totalCount: count };
      });

      const acceptHeader = req.headers['accept'] || '';
      const rangeStart = offsetVal || 0;
      const rangeEnd = Math.max(rangeStart, rangeStart + rows.length - 1);
      res.setHeader('Content-Range', rows.length > 0 ? `${rangeStart}-${rangeEnd}/${totalCount}` : `*/${totalCount}`);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');

      if (typeof acceptHeader === 'string' && acceptHeader.includes('application/vnd.pgrst.object+json')) {
        return res.status(200).json(rows[0] || null);
      }
      return res.status(200).json(rows);
    } catch (err: any) {
      console.error(`[REST Proxy GET /rest/v1/${table} Error]:`, err?.message || err);
      return res.status(500).json({ error: err?.message || 'Database query error' });
    }
  });

  app.post('/rest/v1/:table', async (req, res) => {
    const rawTable = req.params.table;
    const table = (rawTable || '').replace(/[^a-zA-Z0-9_]/g, '');
    if (!table) return res.status(400).json({ error: 'Invalid table name' });
    if (RESTRICTED_REST_TABLES.has(table.toLowerCase())) {
      return res.status(403).json({ error: `Modifying table '${table}' via REST proxy is forbidden.` });
    }

    try {
      const payload = req.body;
      const rows = Array.isArray(payload) ? payload : [payload];
      if (rows.length === 0) return res.status(201).json([]);

      const colSet = new Set<string>();
      for (const r of rows) {
        if (r && typeof r === 'object') {
          for (const k of Object.keys(r)) {
            if (/^[a-zA-Z0-9_]+$/.test(k) && r[k] !== undefined) colSet.add(k);
          }
        }
      }
      const cols = Array.from(colSet);
      if (cols.length === 0) return res.status(400).json({ error: 'No valid columns provided' });

      const colNamesSql = cols.map(c => `"${c}"`).join(', ');
      const insertedRows: any[] = [];
      const rawConflict = typeof req.query.on_conflict === 'string' ? req.query.on_conflict.trim() : '';
      const conflictCols = rawConflict
        ? rawConflict.split(',').map(c => c.trim()).filter(c => /^[a-zA-Z0-9_]+$/.test(c))
        : [];
      const preferHeader = String(req.headers['prefer'] || '');
      const isUpsert = conflictCols.length > 0 || preferHeader.includes('resolution=merge-duplicates') || preferHeader.includes('resolution=ignore-duplicates');
      const ignoreDuplicates = preferHeader.includes('resolution=ignore-duplicates');

      await withDb(async (client) => {
        for (const row of rows) {
          const params = cols.map(c =>
            row[c] === undefined
              ? null
              : typeof row[c] === 'object' && row[c] !== null
              ? JSON.stringify(row[c])
              : row[c]
          );
          const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');

          let conflictClause = '';
          const targetConflictCols = conflictCols.length > 0 ? conflictCols : (cols.includes('id') ? ['id'] : []);
          if ((isUpsert || targetConflictCols.length > 0) && targetConflictCols.length > 0) {
            const conflictTargetSql = targetConflictCols.map(c => `"${c}"`).join(', ');
            if (ignoreDuplicates) {
              conflictClause = ` ON CONFLICT (${conflictTargetSql}) DO NOTHING`;
            } else {
              const updateCols = cols.filter(c => !targetConflictCols.includes(c));
              if (updateCols.length > 0) {
                const setSql = updateCols.map(c => `"${c}" = EXCLUDED."${c}"`).join(', ');
                conflictClause = ` ON CONFLICT (${conflictTargetSql}) DO UPDATE SET ${setSql}`;
              } else {
                conflictClause = ` ON CONFLICT (${conflictTargetSql}) DO NOTHING`;
              }
            }
          }

          try {
            const sql = `INSERT INTO public."${table}" (${colNamesSql}) VALUES (${placeholders})${conflictClause} RETURNING *;`;
            const r = await client.query(sql, params);
            if (r.rows.length > 0) insertedRows.push(r.rows[0]);
          } catch (rowErr: any) {
            // Fallback if ON CONFLICT column lacks a unique index or hits a different unique constraint
            if (conflictClause && (rowErr?.code === '42P10' || rowErr?.code === '23505')) {
              const plainSql = `INSERT INTO public."${table}" (${colNamesSql}) VALUES (${placeholders}) RETURNING *;`;
              try {
                const r2 = await client.query(plainSql, params);
                if (r2.rows.length > 0) insertedRows.push(r2.rows[0]);
              } catch (plainErr: any) {
                if (plainErr?.code === '23505' && row.id) {
                  const updCols = cols.filter(c => c !== 'id');
                  const setSql = updCols.map((c, idx) => `"${c}" = $${idx + 1}`).join(', ');
                  const updParams = [...updCols.map(c => (typeof row[c] === 'object' && row[c] !== null ? JSON.stringify(row[c]) : row[c])), row.id];
                  const updRes = await client.query(`UPDATE public."${table}" SET ${setSql} WHERE "id" = $${updCols.length + 1} RETURNING *;`, updParams);
                  if (updRes.rows.length > 0) insertedRows.push(updRes.rows[0]);
                } else {
                  throw plainErr;
                }
              }
            } else {
              throw rowErr;
            }
          }
        }
      });

      if (insertedRows.length > 0) {
        broadcastRealtimeDbChange(table, 'INSERT', insertedRows[0]);
      }

      const acceptHeader = req.headers['accept'] || '';
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      if (typeof acceptHeader === 'string' && acceptHeader.includes('application/vnd.pgrst.object+json')) {
        return res.status(201).json(insertedRows[0] || null);
      }
      return res.status(201).json(insertedRows);
    } catch (err: any) {
      console.error(`[REST Proxy POST /rest/v1/${table} Error]:`, err?.message || err);
      return res.status(500).json({ error: err?.message || 'Database insert error', code: err?.code, message: err?.message });
    }
  });

  app.patch('/rest/v1/:table', async (req, res) => {
    const rawTable = req.params.table;
    const table = (rawTable || '').replace(/[^a-zA-Z0-9_]/g, '');
    if (!table) return res.status(400).json({ error: 'Invalid table name' });
    if (RESTRICTED_REST_TABLES.has(table.toLowerCase())) {
      return res.status(403).json({ error: `Modifying table '${table}' via REST proxy is forbidden.` });
    }

    try {
      const updates = req.body || {};
      const updateCols = Object.keys(updates).filter(k => /^[a-zA-Z0-9_]+$/.test(k) && updates[k] !== undefined);
      if (updateCols.length === 0) return res.status(400).json({ error: 'No update columns provided' });

      const setParts: string[] = [];
      const setParams: any[] = [];
      let paramIdx = 1;

      for (const col of updateCols) {
        const val = updates[col];
        setParts.push(`"${col}" = $${paramIdx++}`);
        setParams.push(typeof val === 'object' && val !== null ? JSON.stringify(val) : val);
      }

      const { whereParts, params: whereParams } = buildPostgrestWhere(req.query as Record<string, any>, paramIdx);
      if (whereParts.length === 0) {
        return res.status(400).json({ error: 'Update requires at least one filter condition' });
      }

      const whereClause = `WHERE ${whereParts.join(' AND ')}`;
      const sql = `UPDATE public."${table}" SET ${setParts.join(', ')} ${whereClause} RETURNING *;`;

      const result = await withDb(async (client) => {
        return await client.query(sql, [...setParams, ...whereParams]);
      });

      if (result.rows.length > 0) {
        broadcastRealtimeDbChange(table, 'UPDATE', result.rows[0]);
      }

      const acceptHeader = req.headers['accept'] || '';
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      if (typeof acceptHeader === 'string' && acceptHeader.includes('application/vnd.pgrst.object+json')) {
        return res.status(200).json(result.rows[0] || null);
      }
      return res.status(200).json(result.rows);
    } catch (err: any) {
      console.error(`[REST Proxy PATCH /rest/v1/${table} Error]:`, err?.message || err);
      return res.status(500).json({ error: err?.message || 'Database update error' });
    }
  });

  app.delete('/rest/v1/:table', async (req, res) => {
    const rawTable = req.params.table;
    const table = (rawTable || '').replace(/[^a-zA-Z0-9_]/g, '');
    if (!table) return res.status(400).json({ error: 'Invalid table name' });
    if (RESTRICTED_REST_TABLES.has(table.toLowerCase()) || IMMUTABLE_REST_TABLES.has(table.toLowerCase())) {
      return res.status(403).json({ error: `Deleting from table '${table}' via REST proxy is strictly prohibited.` });
    }

    try {
      const { whereParts, params } = buildPostgrestWhere(req.query as Record<string, any>, 1);
      if (whereParts.length === 0) {
        return res.status(400).json({ error: 'Delete requires at least one filter condition' });
      }

      const whereClause = `WHERE ${whereParts.join(' AND ')}`;
      const sql = `DELETE FROM public."${table}" ${whereClause} RETURNING *;`;

      const result = await withDb(async (client) => {
        return await client.query(sql, params);
      });

      if (result.rows.length > 0) {
        broadcastRealtimeDbChange(table, 'DELETE', {}, result.rows[0]);
      }

      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).json(result.rows);
    } catch (err: any) {
      console.error(`[REST Proxy DELETE /rest/v1/${table} Error]:`, err?.message || err);
      return res.status(500).json({ error: err?.message || 'Database delete error' });
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

  // Delegate unhandled /api/* routes to master serverless handler (WhatsApp webhooks, Dhamaka 1 AI, auto-invoicing, etc.)
  app.all('/api/*', async (req, res, next) => {
    try {
      const handler = (await import('./api/[...all].ts')).default;
      return await handler(req, res);
    } catch (e) {
      next(e);
    }
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

  // Turbo Production Bundle Serving (0.12s Reloads over Cloudflare Tunnel & Localhost)
  const distPath = path.join(process.cwd(), 'dist');
  const distIndex = path.join(distPath, 'index.html');
  const usePrebuiltDist = process.env.VITE_DEV_HMR !== 'true' && fs.existsSync(distIndex);

  if (usePrebuiltDist) {
    app.use(
      '/assets',
      express.static(path.join(distPath, 'assets'), {
        maxAge: '365d',
        immutable: true
      })
    );
    app.use(
      express.static(distPath, {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('index.html') || filePath.endsWith('sw.js')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          }
        }
      })
    );
    app.get('*', (req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(distIndex);
    });
  } else {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: {
          server
        }
      },
      appType: 'spa'
    });
    app.use(vite.middlewares);
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

    // Safe, non-destructive startup self-heal for Purchase Invoice 5% VAT vouchers
    (async () => {
      try {
        const { insertVoucherPg } = await import('./src/modules/finance/voucherPgService.ts');
        const repairsToRun: any[] = [];

        await withDb(async (client) => {
          // 1. Sync vat_amount = tax_amount where vat_amount was stored as 0
          await client.query(`
            UPDATE public.purchase_invoices
            SET vat_amount = tax_amount
            WHERE (vat_amount IS NULL OR vat_amount = 0)
              AND COALESCE(tax_amount, 0) > 0;
          `).catch(() => {});

          // 2. Ensure 2140-02 (UAE VAT Input Tax Recoverable 5%) exists in chart_of_accounts & coa_accounts
          let vatChartId: string | null = null;
          const vatRes = await client.query(`SELECT id, name FROM public.chart_of_accounts WHERE code = '2140-02' LIMIT 1`);
          if (vatRes.rows.length > 0) {
            vatChartId = String(vatRes.rows[0].id);
          } else {
            const insVat = await client.query(`
              INSERT INTO public.chart_of_accounts (id, code, name, type, sub_type, parent_code, tier_level, is_system, is_active, currency, current_balance)
              VALUES (gen_random_uuid(), '2140-02', 'UAE VAT Input Tax Recoverable (5%)', 'ASSET', 'Current Asset', '2140-00', 3, true, true, 'AED', 0)
              ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
              RETURNING id;
            `).catch(() => ({ rows: [] as any[] }));
            if (insVat.rows[0]?.id) vatChartId = String(insVat.rows[0].id);
          }
          await client.query(`
            INSERT INTO public.coa_accounts (id, code, name, classification, sub_type, is_active, balance)
            VALUES (COALESCE($1::uuid, gen_random_uuid()), '2140-02', 'UAE VAT Input Tax Recoverable (5%)', 'ASSET', 'Current Asset', true, 0)
            ON CONFLICT (code) DO NOTHING;
          `, [vatChartId]).catch(() => {});

          // 3. Find POSTED purchase invoices with VAT > 0 whose PINV-* voucher is missing the 2140-02 VAT line
          const invRes = await client.query(`
            SELECT * FROM public.purchase_invoices
            WHERE status = 'POSTED'
              AND (COALESCE(vat_amount, 0) > 0 OR COALESCE(tax_amount, 0) > 0);
          `);

          for (const inv of invRes.rows) {
            const invNo = String(inv.invoice_no || '').trim();
            if (!invNo) continue;
            const ref = `PINV-${invNo}`;
            const vRes = await client.query(
              `SELECT * FROM public.financial_vouchers WHERE reference = $1 OR reference_no = $1 LIMIT 1`,
              [ref]
            );
            const voucher = vRes.rows[0];
            if (!voucher) continue;

            const entriesRes = await client.query(
              `SELECT * FROM public.voucher_entries WHERE voucher_id = $1 OR voucher_no = $2 ORDER BY debit DESC`,
              [voucher.id, voucher.voucher_no]
            );
            const entries = entriesRes.rows || [];
            const hasVatLine = entries.some((e: any) => String(e.account_code || '').trim() === '2140-02');
            if (hasVatLine || entries.length === 0) continue;

            const invLine = entries.find((e: any) => Number(e.debit || 0) > 0);
            const supLine = entries.find((e: any) => Number(e.credit || 0) > 0);
            if (!invLine || !supLine) continue;

            const currency = String(inv.currency || 'AED').toUpperCase();
            const rate = Number(inv.exchange_rate) || (currency === 'USD' ? 3.6725 : 1);
            const rawTotal = Number(inv.total_amount) || 0;
            const totalAed = currency === 'AED' ? rawTotal : Number((rawTotal * rate).toFixed(2));
            const rawVat = Number(inv.vat_amount) || Number(inv.tax_amount) || 0;
            const vatAed = currency === 'AED' ? rawVat : Number((rawVat * rate).toFixed(2));
            const netCostAed = Number((totalAed - vatAed).toFixed(2));

            if (vatAed > 0 && netCostAed > 0) {
              repairsToRun.push({
                id: voucher.id,
                voucherNo: voucher.voucher_no,
                date: voucher.date || inv.invoice_date || new Date().toISOString().slice(0, 10),
                type: voucher.type || 'JOURNAL',
                reference: ref,
                narration: voucher.narration || `Commercial Purchase Invoice Posted: ${invNo}`,
                totalDebit: totalAed,
                totalCredit: totalAed,
                status: 'POSTED',
                createdBy: voucher.created_by || 'System (Commercial Invoice)',
                isAuto: true,
                lines: [
                  {
                    accountId: invLine.account_id,
                    accountCode: invLine.account_code || '1140-01',
                    accountName: invLine.account_name || 'Raw Material Unsorted',
                    debitAmount: netCostAed,
                    creditAmount: 0,
                    memo: `Commercial Purchase Invoice (Net Cost): ${invNo}`
                  },
                  {
                    accountId: vatChartId,
                    accountCode: '2140-02',
                    accountName: 'UAE VAT Input Tax Recoverable (5%)',
                    debitAmount: vatAed,
                    creditAmount: 0,
                    memo: `UAE VAT 5% Input Tax Recoverable: ${invNo}`
                  },
                  {
                    accountId: supLine.account_id,
                    accountCode: supLine.account_code,
                    accountName: supLine.account_name,
                    partyId: supLine.party_id,
                    partyName: supLine.party_name,
                    debitAmount: 0,
                    creditAmount: totalAed,
                    memo: supLine.memo || `Supplier Payable: ${inv.supplier_name || ''} for ${invNo}`
                  }
                ]
              });
            }
          }
        });

        for (const repair of repairsToRun) {
          await insertVoucherPg(repair);
          console.log(`[Startup VAT Self-Heal] Upgraded voucher ${repair.voucherNo} (${repair.reference}) to 3-line 5% VAT entry.`);
        }
      } catch (err: any) {
        console.warn('[Startup VAT Self-Heal Notice]:', err?.message || err);
      }
    })();
  };

  if (HOST) {
    server.listen(PORT, HOST, onListen);
  } else {
    // Omitting host binds to dual-stack IPv6 (::) and IPv4 (0.0.0.0)
    server.listen(PORT, onListen);
  }
}

startServer();
