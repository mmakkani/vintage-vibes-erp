import pg from 'pg';
const { Pool } = pg;
export type { PoolClient } from 'pg';

// global pool reuse pattern
let pool: pg.Pool | null = null;

export const getPgClient = (): pg.Pool => {
  if (!pool) {
    const DEFAULT_DB_URL = 'postgresql://postgres.wjjelqsrivnyiybarfmo:Makkani%402233@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres';
    let dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || DEFAULT_DB_URL;
    if (dbUrl.includes('db.wjjelqsrivnyiybarfmo.supabase.co')) {
      dbUrl = DEFAULT_DB_URL;
    }
    const match = dbUrl.match(/^postgresql:\/\/([^:]+):(.*)@([^@\/]+)(:\d+)?(\/.*)$/);
    if (match) {
      let [_, u, rawPwd, host, port, rest] = match;
      if (rawPwd.startsWith('[') && rawPwd.endsWith(']')) rawPwd = rawPwd.slice(1, -1);
      dbUrl = `postgresql://${u}:${encodeURIComponent(decodeURIComponent(rawPwd))}@${host}${port || ''}${rest}`;
    }
    pool = new Pool({
      connectionString: dbUrl,
      max: 10,
      ssl: { rejectUnauthorized: false }
    });
    // Intercept client.end() so legacy callers in individual route handlers do not drain the shared global pool
    const origEnd = pool.end.bind(pool);
    pool.end = (async () => {}) as any;
    (pool as any).destroyPool = origEnd;
  }
  return pool;
};

export async function withDb<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const p = getPgClient();
  const client = await p.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export { Pool, pool };
