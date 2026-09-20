let pool: any = null;
let pgPoolClass: any = null;

async function getClient() {
  const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!dbUrl) return null;

  if (!pgPoolClass) {
    const pgMod: any = await import('pg');
    pgPoolClass = pgMod.Pool || pgMod.default?.Pool;
  }

  let sanitizedUrl = dbUrl;
  if (sanitizedUrl.includes('127.0.0.1') || sanitizedUrl.includes('localhost')) {
    return null;
  }
  if (sanitizedUrl.includes('.pooler.supabase.com:5432')) {
    sanitizedUrl = sanitizedUrl.replace('.pooler.supabase.com:5432', '.pooler.supabase.com:6543');
  }

  const match = sanitizedUrl.match(/^postgresql:\/\/([^:]+):(.*)@([^@\/]+)(:\d+)?(\/.*)$/);
  if (match) {
    let [_, u, rawPwd, host, port, rest] = match;
    if (rawPwd.startsWith('[') && rawPwd.endsWith(']')) rawPwd = rawPwd.slice(1, -1);
    sanitizedUrl = `postgresql://${u}:${encodeURIComponent(decodeURIComponent(rawPwd))}@${host}${port || ''}${rest}`;
  }

  if (!pool) {
    pool = new pgPoolClass({
      connectionString: sanitizedUrl,
      max: 2,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000
    });
  }

  try {
    return await pool.connect();
  } catch {
    return null;
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

  let client: any = null;
  try {
    client = await getClient();
    if (client) {
      await client.query('SELECT 1');
      return res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString()
      });
    }

    return res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString()
    });
  } catch {
    return res.status(200).json({
      status: 'degraded',
      timestamp: new Date().toISOString()
    });
  } finally {
    if (client && typeof client.release === 'function') {
      try { client.release(); } catch (_) {}
    }
  }
}
