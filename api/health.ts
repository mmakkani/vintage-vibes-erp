let pool: any = null;
let pgPoolClass: any = null;

const DEFAULT_DB_URL = 'postgresql://postgres.wjjelqsrivnyiybarfmo:Makkani%402233@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres?sslmode=require&uselibpqcompat=true';

async function getClient() {
  if (!pgPoolClass) {
    const pgMod: any = await import('pg');
    pgPoolClass = pgMod.Pool || pgMod.default?.Pool;
  }
  let dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || DEFAULT_DB_URL;
  if (dbUrl.includes('127.0.0.1') || dbUrl.includes('localhost') || dbUrl.includes('db.wjjelqsrivnyiybarfmo.supabase.co')) {
    dbUrl = DEFAULT_DB_URL;
  }
  if (dbUrl.includes('.pooler.supabase.com:5432')) {
    dbUrl = dbUrl.replace('.pooler.supabase.com:5432', '.pooler.supabase.com:6543');
  }
  const match = dbUrl.match(/^postgresql:\/\/([^:]+):(.*)@([^@\/]+)(:\d+)?(\/.*)$/);
  if (match) {
    let [_, u, rawPwd, host, port, rest] = match;
    if (rawPwd.startsWith('[') && rawPwd.endsWith(']')) rawPwd = rawPwd.slice(1, -1);
    dbUrl = `postgresql://${u}:${encodeURIComponent(decodeURIComponent(rawPwd))}@${host}${port || ''}${rest}`;
  }
  if (!pool) {
    pool = new pgPoolClass({
      connectionString: dbUrl,
      max: 2,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000
    });
  }
  try {
    return await pool.connect();
  } catch (err) {
    const fbPool = new pgPoolClass({
      connectionString: DEFAULT_DB_URL,
      max: 2,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000
    });
    return await fbPool.connect();
  }
}

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const startTime = Date.now();
  let client: any = null;
  try {
    client = await getClient();
    const result = await client.query('SELECT NOW() as time');
    return res.status(200).json({
      status: 'ok',
      db_connected: true,
      time: result.rows[0]?.time || new Date().toISOString(),
      latency_ms: Date.now() - startTime,
      pool_type: 'SUPABASE_TRANSACTION_POOLER_6543',
      has_db_url: !!process.env.DATABASE_URL,
      env: process.env.NODE_ENV || 'production'
    });
  } catch (err: any) {
    return res.status(200).json({
      status: 'error',
      db_connected: false,
      error: err?.message || String(err),
      has_db_url: !!process.env.DATABASE_URL,
      timestamp: new Date().toISOString()
    });
  } finally {
    if (client && typeof client.release === 'function') {
      try { client.release(); } catch (_) {}
    }
  }
}
