import pg from 'pg';
const { Pool } = pg;
export type { PoolClient } from 'pg';

const DEFAULT_DB_URL = 'postgresql://postgres.wjjelqsrivnyiybarfmo:Makkani%402233@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres';

function sanitizeDbUrl(rawUrl: string): string {
  let dbUrl = rawUrl.trim();
  if (dbUrl.includes('db.wjjelqsrivnyiybarfmo.supabase.co')) {
    return DEFAULT_DB_URL;
  }
  try {
    const match = dbUrl.match(/^postgresql:\/\/([^:]+):(.*)@([^@\/]+)(:\d+)?(\/.*)$/);
    if (match) {
      let [_, u, rawPwd, host, port, rest] = match;
      if (rawPwd.startsWith('[') && rawPwd.endsWith(']')) rawPwd = rawPwd.slice(1, -1);
      return `postgresql://${u}:${encodeURIComponent(decodeURIComponent(rawPwd))}@${host}${port || ''}${rest}`;
    }
  } catch (_) {}
  return dbUrl;
}

// global pool reuse pattern
let pool: pg.Pool | null = null;

export const getPgClient = (): pg.Pool => {
  if (!pool) {
    const targetUrl = sanitizeDbUrl(process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || DEFAULT_DB_URL);
    pool = new Pool({
      connectionString: targetUrl,
      max: 10,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000
    });
    // Intercept client.end() so legacy callers in route handlers do not drain the shared global pool
    const origEnd = pool.end.bind(pool);
    pool.end = (async () => {}) as any;
    (pool as any).destroyPool = origEnd;
  }
  return pool;
};

export async function withDb<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  let p = getPgClient();
  let client: pg.PoolClient;
  try {
    client = await p.connect();
  } catch (connErr: any) {
    console.warn('[pgPool] Primary connection failed, attempting fallback pooler:', connErr?.message);
    try {
      const fallbackPool = new Pool({
        connectionString: DEFAULT_DB_URL,
        max: 10,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000
      });
      fallbackPool.end = (async () => {}) as any;
      pool = fallbackPool;
      client = await fallbackPool.connect();
    } catch (fbErr: any) {
      console.error('[pgPool] Fallback pooler connection also failed:', fbErr);
      throw connErr;
    }
  }

  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export { Pool, pool };
