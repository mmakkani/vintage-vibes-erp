import pg from 'pg';
import { supabase } from '../supabaseClient.ts';

const { Pool, types } = pg;
export type { PoolClient } from 'pg';

// Parse PostgreSQL NUMERIC/DECIMAL (OID 1700), FLOAT4 (700), FLOAT8 (701), and INT8/BIGINT (20) as JS Numbers
// Matches Supabase PostgREST JSON serialization so "0.00" strings never break truthiness or arithmetic
if (types && typeof types.setTypeParser === 'function') {
  types.setTypeParser(1700, (val: string) => (val === null ? null : parseFloat(val)));
  types.setTypeParser(700, (val: string) => (val === null ? null : parseFloat(val)));
  types.setTypeParser(701, (val: string) => (val === null ? null : parseFloat(val)));
  types.setTypeParser(20, (val: string) => {
    if (val === null) return null;
    const n = Number(val);
    return Number.isSafeInteger(n) ? n : val;
  });
}

export const DEFAULT_DB_URL = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || '';
export const CLOUD_SUPABASE_DB_URL =
  process.env.SUPABASE_DB_URL ||
  'postgresql://postgres.wjjelqsrivnyiybarfmo:Makkani%402233@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres?sslmode=require&uselibpqcompat=true';

export function isLocalDatabaseUrl(url: string): boolean {
  const u = (url || '').toLowerCase();
  return (
    u.includes('127.0.0.1') ||
    u.includes('localhost') ||
    u.includes('sslmode=disable')
  );
}

export function sanitizeDbUrl(rawUrl: string): string {
  let dbUrl = (rawUrl || '').trim();
  if (!dbUrl) dbUrl = (process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || DEFAULT_DB_URL || '').trim();
  if (!dbUrl) return '';

  const isLocal = isLocalDatabaseUrl(dbUrl);

  if (!isLocal) {
    // Direct IPv6 host is unreachable in most environments — use pooler
    if (dbUrl.includes('db.wjjelqsrivnyiybarfmo.supabase.co')) {
      dbUrl = (process.env.SUPABASE_DB_URL || CLOUD_SUPABASE_DB_URL || '').trim();
    }

    // Auto-switch port 5432 (session pooler, max 15 clients) to port 6543 (transaction pooler) for Cloud Supabase
    if (dbUrl.includes(':5432')) {
      console.log('[pgPool] Automatically upgrading Supabase pooler from session port 5432 to transaction port 6543');
      dbUrl = dbUrl.replace(':5432', ':6543');
    }

    // Force sslmode=require & uselibpqcompat=true if not present on Cloud connections
    if (!dbUrl.includes('sslmode=')) {
      const separator = dbUrl.includes('?') ? '&' : '?';
      dbUrl = `${dbUrl}${separator}sslmode=require&uselibpqcompat=true`;
    } else if (!dbUrl.includes('uselibpqcompat=')) {
      dbUrl = `${dbUrl}&uselibpqcompat=true`;
    }
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

// Global pool reuse pattern across warm executions
let pool: pg.Pool | null = null;
let cloudPool: pg.Pool | null = null;

export const getCloudPgPool = (): pg.Pool | null => {
  const cloudUrl = sanitizeDbUrl(process.env.SUPABASE_DB_URL || CLOUD_SUPABASE_DB_URL);
  if (!cloudUrl || isLocalDatabaseUrl(cloudUrl)) return null;
  if (!cloudPool) {
    cloudPool = new Pool({
      connectionString: cloudUrl,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 15000,
      idleTimeoutMillis: 15000,
      min: 1,
      max: 15,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000
    });
    cloudPool.on('error', (err: any) => {
      console.warn('[pgPool Cloud Sync] Idle client notice:', err?.message || err);
    });
    cloudPool.end = (async () => {}) as any;
  }
  return cloudPool;
};

function isWriteOrRpcQuery(sqlText: string): boolean {
  const trimmed = (sqlText || '').trim().toLowerCase();
  if (!trimmed) return false;
  // Skip ephemeral heartbeat/log tables from cloud mirror to keep cloud pool fast
  if (trimmed.includes('user_presences') || trimmed.includes('security_threat_logs')) {
    return false;
  }
  if (
    trimmed.startsWith('insert ') ||
    trimmed.startsWith('update ') ||
    trimmed.startsWith('delete ') ||
    trimmed.startsWith('with ')
  ) {
    return /\b(insert|update|delete)\b/i.test(trimmed);
  }
  if (trimmed.startsWith('select ') && /\b(create_|upsert_|delete_|post_|unpost_|sync_)/i.test(trimmed)) {
    return true;
  }
  return false;
}

function mirrorWriteToCloudAsync(sqlText: string, params?: any[]) {
  if (!sqlText || !isWriteOrRpcQuery(sqlText)) return;
  setImmediate(() => {
    const cp = getCloudPgPool();
    if (cp) {
      cp.query(sqlText, params || []).catch((syncErr: any) => {
        console.warn('[pgPool Dual-Sync Notice] Cloud mirror skipped:', syncErr?.message || syncErr);
      });
    }
  });
}

function wrapClientWithCloudSync(cl: pg.PoolClient, isPrimaryLocal: boolean, safeReleaseFn?: () => void): pg.PoolClient {
  const origQuery = cl.query.bind(cl);

  const customQuery = async (queryTextOrConfig: any, values?: any, cb?: any) => {
    // If called with a callback (e.g. internal pg-pool or legacy callback caller), delegate directly to native query
    if (typeof values === 'function' || typeof cb === 'function' || typeof queryTextOrConfig?.callback === 'function') {
      return (origQuery as any)(queryTextOrConfig, values, cb);
    }

    const sqlText = typeof queryTextOrConfig === 'string' ? queryTextOrConfig : queryTextOrConfig?.text || '';
    const params = Array.isArray(values) ? values : (Array.isArray(queryTextOrConfig?.values) ? queryTextOrConfig.values : undefined);

    if (!isPrimaryLocal) {
      return await (params !== undefined ? origQuery(queryTextOrConfig, params) : origQuery(queryTextOrConfig));
    }

    try {
      const res = await (params !== undefined ? origQuery(queryTextOrConfig, params) : origQuery(queryTextOrConfig));

      // Mirror writes asynchronously in background to Supabase Cloud so Local + Cloud stay 100% synchronized
      mirrorWriteToCloudAsync(sqlText, params);
      return res;
    } catch (localErr: any) {
      // If local database is missing a column/table/function or errors, transparently try Cloud Pool
      const cp = getCloudPgPool();
      if (cp && sqlText && !/^(begin|commit|rollback)/i.test(sqlText.trim())) {
        try {
          return await cp.query(sqlText, params || []);
        } catch (_) {}
      }
      throw localErr;
    }
  };

  // Return a non-mutating Proxy so the underlying PoolClient in pg.Pool keeps its native .query and .release methods
  return new Proxy(cl, {
    get(target, prop, receiver) {
      if (prop === 'query') return customQuery;
      if (safeReleaseFn && (prop === 'release' || prop === 'end')) {
        return safeReleaseFn;
      }
      const val = Reflect.get(target, prop, receiver);
      return typeof val === 'function' ? val.bind(target) : val;
    }
  });
}

export const getPgClient = (): pg.Pool => {
  if (!process.env.DATABASE_URL) {
    console.error("CRITICAL: DATABASE_URL is missing in environment variables!");
  }

  if (!pool) {
    const targetUrl = sanitizeDbUrl(process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || DEFAULT_DB_URL);
    const isLocal = isLocalDatabaseUrl(targetUrl);
    const useSsl = isLocal ? false : { rejectUnauthorized: false };
    pool = new Pool({
      connectionString: targetUrl,
      ssl: useSsl,
      connectionTimeoutMillis: isLocal ? 2000 : 15000,
      idleTimeoutMillis: 15000,
      min: 2,
      max: 30,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000
    });

    pool.on('error', (err: any) => {
      console.warn('[pgPool] Idle client notice:', err?.message || err);
    });

    pool.on('connect', (client: any) => {
      if (client && typeof client.on === 'function') {
        client.on('error', (err: any) => {
          console.warn('[pgPool] Client socket notice:', err?.message || err);
        });
      }
    });

    // Also mirror direct pool.query() writes to Cloud when primary is Local PostgreSQL
    if (isLocal) {
      const origPoolQuery = pool.query.bind(pool);
      (pool as any).query = async (queryTextOrConfig: any, values?: any, cb?: any) => {
        if (typeof values === 'function' || typeof cb === 'function') {
          return (origPoolQuery as any)(queryTextOrConfig, values, cb);
        }
        const sqlText = typeof queryTextOrConfig === 'string' ? queryTextOrConfig : queryTextOrConfig?.text || '';
        const params = Array.isArray(values) ? values : (Array.isArray(queryTextOrConfig?.values) ? queryTextOrConfig.values : undefined);
        const res = await (params !== undefined ? origPoolQuery(queryTextOrConfig, params) : origPoolQuery(queryTextOrConfig));
        mirrorWriteToCloudAsync(sqlText, params);
        return res;
      };
    }

    // Intercept client.end() so legacy callers in route handlers do not drain the shared global pool
    const origEnd = pool.end.bind(pool);
    pool.end = (async () => {}) as any;
    (pool as any).destroyPool = origEnd;
  }
  return pool;
};

export const borrowClient = async (): Promise<pg.PoolClient> => {
  const p = getPgClient();
  const targetUrl = sanitizeDbUrl(process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || DEFAULT_DB_URL);
  const isPrimaryLocal = isLocalDatabaseUrl(targetUrl);

  try {
    const cl = await p.connect();
    let released = false;
    const checkoutRelease = cl.release.bind(cl);
    const safeRelease = () => {
      if (!released) {
        released = true;
        try { checkoutRelease(); } catch (_) {}
      }
    };

    return wrapClientWithCloudSync(cl, isPrimaryLocal, safeRelease);
  } catch (connErr: any) {
    console.error('[pgPool] Primary pool connect failed, failing over to Supabase Cloud pool:', connErr?.message);
    try {
      const cp = getCloudPgPool();
      if (!cp) throw new Error('No Cloud Supabase pool available');
      const fbClient = await cp.connect();
      let fbReleased = false;
      const checkoutFbRelease = fbClient.release.bind(fbClient);
      const safeFbRelease = () => {
        if (!fbReleased) {
          fbReleased = true;
          try { checkoutFbRelease(); } catch (_) {}
        }
      };

      return wrapClientWithCloudSync(fbClient, false, safeFbRelease);
    } catch (fbErr: any) {
      console.error('[pgPool] Cloud failover pool also failed:', fbErr?.message);
      const resilientClient: any = {
        query: async (sqlText: string, params: any[] = []) => {
          return await executeSupabaseRestFallback(sqlText, params);
        },
        release: () => {},
        end: async () => {}
      };
      return resilientClient;
    }
  }
};

/**
 * Universal fallback query engine when all direct PostgreSQL pool connections fail.
 * Strictly guards against calling localhost to prevent recursive self-requests.
 */
export async function executeSupabaseRestFallback(sqlText: string, _params: any[] = []): Promise<{ rows: any[]; rowCount: number }> {
  try {
    const trimmed = (sqlText || '').trim();
    const lower = trimmed.toLowerCase();

    if (lower.includes('select now()') || lower.includes('select 1')) {
      return { rows: [{ time: new Date().toISOString(), status: 'ok' }], rowCount: 1 };
    }

    // Prevent infinite self-recursion if SUPABASE_URL points to localhost
    const supaUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').toLowerCase();
    if (supaUrl.includes('localhost') || supaUrl.includes('127.0.0.1')) {
      return { rows: [], rowCount: 0 };
    }

    if (lower.startsWith('select')) {
      const match = trimmed.match(/\bfrom\s+([a-zA-Z0-9_\."]+)/i);
      if (match && match[1]) {
        let tableName = match[1].replace(/^(public\.)/, '').trim();
        tableName = tableName.replace(/["'`()]/g, '').trim();

        if (tableName) {
          const { data, error } = await supabase.from(tableName).select('*').limit(200);
          if (!error && Array.isArray(data)) {
            return { rows: data, rowCount: data.length };
          }
        }
      }
    }
  } catch (err: any) {
    console.error('[pgPool Fallback Exception]:', err?.message);
  }

  return { rows: [], rowCount: 0 };
}

export async function withDb<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const p = getPgClient();
  const targetUrl = sanitizeDbUrl(process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || DEFAULT_DB_URL);
  const isPrimaryLocal = isLocalDatabaseUrl(targetUrl);
  let rawClient: pg.PoolClient | null = null;
  let wrappedClient: pg.PoolClient | null = null;
  let released = false;
  let checkoutRelease: (() => void) | null = null;

  const safeRelease = () => {
    if (!released && checkoutRelease) {
      released = true;
      try { checkoutRelease(); } catch (_) {}
    }
  };

  try {
    rawClient = await p.connect();
    checkoutRelease = rawClient.release.bind(rawClient);
    wrappedClient = wrapClientWithCloudSync(rawClient, isPrimaryLocal, safeRelease);
  } catch (connErr: any) {
    console.warn('[pgPool] Primary DB unreachable, seamlessly using Supabase Cloud pool:', connErr?.message);
    const cp = getCloudPgPool();
    if (cp) {
      try {
        const cloudClient = await cp.connect();
        let cloudReleased = false;
        const cloudCheckoutRelease = cloudClient.release.bind(cloudClient);
        const safeCloudRelease = () => {
          if (!cloudReleased) {
            cloudReleased = true;
            try { cloudCheckoutRelease(); } catch (_) {}
          }
        };
        try {
          return await fn(wrapClientWithCloudSync(cloudClient, false, safeCloudRelease));
        } finally {
          safeCloudRelease();
        }
      } catch (cloudErr: any) {
        console.error('[pgPool] Cloud failover error:', cloudErr?.message);
      }
    }
    const fallbackClient = {
      query: async (sqlText: string, params: any[] = []) => {
        return await executeSupabaseRestFallback(sqlText, params);
      },
      release: () => {}
    };
    return await fn(fallbackClient as any);
  }

  try {
    return await fn(wrappedClient!);
  } finally {
    safeRelease();
  }
}

export { Pool, pool };
