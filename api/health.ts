import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPgClient, borrowClient } from '../src/db/pgPool.ts';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const startTime = Date.now();
  let client: any = null;

  try {
    client = await borrowClient();
    const result = await client.query('SELECT NOW() as time');
    const queryDurationMs = Date.now() - startTime;

    return res.status(200).json({
      status: 'ok',
      db_connected: true,
      time: result.rows[0]?.time || new Date().toISOString(),
      latency_ms: queryDurationMs,
      pool_type: 'SUPABASE_TRANSACTION_POOLER_6543',
      has_db_url: !!process.env.DATABASE_URL,
      env: process.env.NODE_ENV || 'production'
    });
  } catch (err: any) {
    console.error('[Health Check DB Error]:', err?.message || err);
    return res.status(200).json({
      status: 'error',
      db_connected: false,
      error: err?.message || String(err),
      has_db_url: !!process.env.DATABASE_URL,
      timestamp: new Date().toISOString()
    });
  } finally {
    if (client && typeof client.release === 'function') {
      try {
        client.release();
      } catch (_) {}
    }
  }
}
