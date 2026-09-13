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
import { eventHub } from './src/server/events.ts';

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
  app.use('/api/payments', paymentRouter);
  app.use('/api/webhooks', paymentRouter);
  app.use('/api/marketing', marketingRouter);
  app.use('/api/feed', publicFeedRouter);
  app.use('/api/devices', devicesRouter);
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
