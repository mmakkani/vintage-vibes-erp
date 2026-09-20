export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const startTime = Date.now();
  try {
    let pgPoolClass: any = null;
    try {
      const pgMod: any = await import('pg');
      pgPoolClass = pgMod.Pool || pgMod.default?.Pool;
    } catch (_) {}

    if (pgPoolClass) {
      let dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || 'postgresql://postgres.wjjelqsrivnyiybarfmo:Makkani%402233@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres?sslmode=require&uselibpqcompat=true';
      if (dbUrl.includes('127.0.0.1') || dbUrl.includes('localhost')) {
        dbUrl = 'postgresql://postgres.wjjelqsrivnyiybarfmo:Makkani%402233@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres?sslmode=require&uselibpqcompat=true';
      }
      if (dbUrl.includes('.pooler.supabase.com:5432')) {
        dbUrl = dbUrl.replace('.pooler.supabase.com:5432', '.pooler.supabase.com:6543');
      }
      const pool = new pgPoolClass({
        connectionString: dbUrl,
        max: 1,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000
      });
      const client = await pool.connect();
      const result = await client.query('SELECT NOW() as time');
      client.release();
      await pool.end();

      return res.status(200).json({
        status: 'ok',
        db_connected: true,
        time: result.rows[0]?.time || new Date().toISOString(),
        latency_ms: Date.now() - startTime,
        pool_type: 'SUPABASE_TRANSACTION_POOLER_6543',
        has_db_url: !!process.env.DATABASE_URL,
        env: process.env.NODE_ENV || 'production'
      });
    }

    return res.status(200).json({
      status: 'healthy',
      system: 'Vintage Vibe Enterprise ERP',
      runtime: 'Vercel Serverless Function',
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    return res.status(200).json({
      status: 'error',
      db_connected: false,
      error: err?.message || String(err),
      has_db_url: !!process.env.DATABASE_URL,
      timestamp: new Date().toISOString()
    });
  }
}
