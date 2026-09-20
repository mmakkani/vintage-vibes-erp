import crypto from 'crypto';

const DEFAULT_ALLOWED_ORIGINS = [
  'https://vintagevibesgk.com',
  'https://www.vintagevibesgk.com',
  'https://api.vintagevibesgk.com'
];

function isOriginAllowed(origin?: string | null): boolean {
  if (!origin || typeof origin !== 'string') return false;
  const lower = origin.trim().toLowerCase();

  const envOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(o => o.trim().toLowerCase())
    .filter(Boolean);

  if (envOrigins.includes(lower)) return true;
  if (DEFAULT_ALLOWED_ORIGINS.some(allowed => allowed.toLowerCase() === lower)) return true;

  if (
    lower.startsWith('http://localhost:') ||
    lower.startsWith('http://127.0.0.1:') ||
    lower.startsWith('https://localhost:')
  ) {
    return true;
  }

  if (lower.endsWith('.vercel.app')) {
    return true;
  }

  return false;
}

let devEphemeralSecret: string | null = null;
function getSessionSecret(): string {
  const envSecret =
    process.env.SESSION_SECRET ||
    process.env.JWT_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (envSecret && envSecret.trim()) {
    return envSecret.trim();
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'CRITICAL SECURITY ERROR: SESSION_SECRET (or JWT_SECRET / SUPABASE_SERVICE_ROLE_KEY) is mandatory in production environment. No default secret permitted.'
    );
  }

  if (!devEphemeralSecret) {
    devEphemeralSecret = crypto.randomBytes(32).toString('hex');
  }
  return devEphemeralSecret;
}

function computeSignature(payload: string): string {
  return crypto.createHmac('sha256', getSessionSecret()).update(payload).digest('hex');
}

async function createSessionToken(user: { id: string; username: string; role?: string }): Promise<string> {
  const opaqueId = 'vv_sess_' + crypto.randomBytes(32).toString('hex');
  const userId = String(user.id || '').trim();
  const username = String(user.username || '').trim();
  const role = String(user.role || 'ADMIN').toUpperCase();
  const maxAge = Number(process.env.SESSION_MAX_AGE_MS) || 24 * 60 * 60 * 1000;
  const expiresAt = Date.now() + maxAge;

  const payload = `${opaqueId}.${userId}.${role}.${expiresAt}`;
  const sig = computeSignature(payload);
  const token = `${payload}.${sig}`;

  return token;
}

function generatePermissions(userId: string, role: string) {
  const modules = [
    'DASHBOARD', 'PURCHASE', 'INVENTORY', 'SALES', 'FINANCE', 'PARTIES', 'HR', 'SETUP', 'AUDIT', 'AUTH'
  ];

  return modules.map(mod => {
    let canView = true;
    let canCreate = false;
    let canEdit = false;
    let canDelete = false;
    let canPost = false;
    let canUnpost = false;

    if (role === 'ADMIN') {
      canView = true;
      canCreate = true;
      canEdit = true;
      canDelete = true;
      canPost = true;
      canUnpost = true;
    } else {
      if (['SETUP', 'AUDIT', 'AUTH'].includes(mod)) {
        canView = false;
      }
      if (role === 'MANAGER') {
        canCreate = true;
        canEdit = true;
        canDelete = false;
        canPost = true;
        canUnpost = true;
      } else if (role === 'ACCOUNTANT') {
        if (['FINANCE', 'PARTIES', 'SALES', 'PURCHASE', 'HR'].includes(mod)) {
          canCreate = true;
          canEdit = true;
          canDelete = false;
          canPost = true;
          canUnpost = mod === 'FINANCE';
        }
      }
    }

    return {
      id: `perm-${userId}-${mod.toLowerCase()}`,
      userId,
      module: mod,
      canView,
      canCreate,
      canEdit,
      canDelete,
      canPost,
      canUnpost
    };
  });
}

// global pool reuse pattern
let loginPool: any = null;
let pgPoolClass: any = null;

export default async function handler(req: any, res: any) {
  // Always return application/json headers
  res.setHeader('Content-Type', 'application/json');
  const origin = (req.headers?.origin as string) || '';
  if (origin && isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Correlation-ID');

  if (req.method === 'OPTIONS') {
    if (origin && !isOriginAllowed(origin)) {
      return res.status(403).json({ error: 'CORS origin not allowed' });
    }
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        body = {};
      }
    }

    const username = (body?.username || body?.email || '').trim().toLowerCase();
    const password = (body?.password || '').trim();

    if (!username) {
      return res.status(400).json({ success: false, error: 'Username or email is required' });
    }
    if (!password) {
      return res.status(400).json({ success: false, error: 'Password is required' });
    }

    // 1. Live Supabase PostgreSQL Query across both users and operators tables
    let dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || 'postgresql://postgres.wjjelqsrivnyiybarfmo:Makkani%402233@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres';
    let foundUserRow: any = null;

    if (dbUrl && !dbUrl.includes('your_') && !dbUrl.includes('placeholder')) {
      if (dbUrl.includes('db.wjjelqsrivnyiybarfmo.supabase.co')) {
        dbUrl = 'postgresql://postgres.wjjelqsrivnyiybarfmo:Makkani%402233@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres';
      }
      const match = dbUrl.match(/^postgresql:\/\/([^:]+):(.*)@([^@\/]+)(:\d+)?(\/.*)$/);
      if (match) {
        let [_, u, rawPwd, host, port, rest] = match;
        if (rawPwd.startsWith('[') && rawPwd.endsWith(']')) {
          rawPwd = rawPwd.slice(1, -1);
        }
        dbUrl = `postgresql://${u}:${encodeURIComponent(decodeURIComponent(rawPwd))}@${host}${port || ''}${rest}`;
      }

      async function tryPgQuery(connStr: string) {
        if (!pgPoolClass) {
          const pgMod: any = await import('pg');
          pgPoolClass = pgMod.Pool || pgMod.default?.Pool;
        }
        if (!loginPool) {
          loginPool = new pgPoolClass({
            connectionString: connStr,
            max: 5,
            ssl: { rejectUnauthorized: false },
            connectionTimeoutMillis: 5000
          });
        }
        const result = await loginPool.query(
          `SELECT id, username, email, name, role, is_active, password_hash, permissions
           FROM (
             SELECT id::text, username, email, name, UPPER(role) AS role, is_active, password_hash, permissions FROM users
             UNION ALL
             SELECT id::text, username, (CASE WHEN username LIKE '%@%' THEN username ELSE username || '@vintagevibe.ae' END) AS email, display_name AS name, UPPER(role) AS role, is_active, password_hash, permissions FROM operators
           ) combined_auth
           WHERE LOWER(username) = $1 OR LOWER(email) = $1 OR LOWER(name) = $1
           LIMIT 1`,
          [username]
        );
        return result.rows?.[0] || null;
      }

      try {
        foundUserRow = await tryPgQuery(dbUrl);
      } catch (dbErr: any) {
        console.warn('[Vercel Serverless] PostgreSQL primary connect failed, trying fallback pooler:', dbErr?.message);
        try {
          const fallbackPooler = 'postgresql://postgres.wjjelqsrivnyiybarfmo:Makkani%402233@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres';
          foundUserRow = await tryPgQuery(fallbackPooler);
        } catch (fbErr: any) {
          console.warn('[Vercel Serverless] Fallback pooler also failed:', fbErr?.message);
        }
      }
    }

    // 2. Secondary Supabase REST API Query (if direct PG was not available or didn't connect)
    if (!foundUserRow) {
      const supaUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
      const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
      if (supaUrl && supaKey) {
        try {
          const { createClient } = await import('@supabase/supabase-js');
          const supabase = createClient(supaUrl, supaKey);

          // Check operators table
          const { data: opData } = await supabase
            .from('operators')
            .select('*')
            .ilike('username', username)
            .limit(1);

          if (opData && opData.length > 0) {
            const op = opData[0];
            foundUserRow = {
              id: op.id,
              username: op.username,
              name: op.display_name || op.username,
              email: op.username.includes('@') ? op.username : `${op.username}@vintagevibe.ae`,
              role: (op.role || 'ADMIN').toUpperCase(),
              is_active: op.is_active !== false,
              password_hash: op.password_hash,
              permissions: op.permissions
            };
          } else {
            // Check users table
            const { data: usrData } = await supabase
              .from('users')
              .select('*')
              .or(`username.ilike.${username},email.ilike.${username}`)
              .limit(1);

            if (usrData && usrData.length > 0) {
              const u = usrData[0];
              foundUserRow = {
                id: u.id,
                username: u.username,
                name: u.name || u.username,
                email: u.email || `${u.username}@vintagevibe.ae`,
                role: (u.role || 'ADMIN').toUpperCase(),
                is_active: u.is_active !== false,
                password_hash: u.password_hash,
                permissions: u.permissions
              };
            }
          }
        } catch (sErr: any) {
          console.warn('[Vercel Serverless] Supabase REST query fallback failed:', sErr?.message);
        }
      }
    }

    if (foundUserRow) {
      if (!foundUserRow.is_active) {
        return res.status(403).json({ success: false, error: 'User account has been deactivated' });
      }

      if (!foundUserRow.password_hash || foundUserRow.password_hash.trim() !== password.trim()) {
        return res.status(401).json({ success: false, error: 'Invalid password. Please check your credentials' });
      }

      const userPerms = (Array.isArray(foundUserRow.permissions) && foundUserRow.permissions.length > 0)
        ? foundUserRow.permissions
        : generatePermissions(String(foundUserRow.id), foundUserRow.role || 'ADMIN');

      const userIdStr = String(foundUserRow.id);
      const sessionToken = await createSessionToken({
        id: userIdStr,
        username: foundUserRow.username,
        role: foundUserRow.role || 'ADMIN'
      });

      return res.status(200).json({
        success: true,
        token: sessionToken,
        user: {
          id: userIdStr,
          username: foundUserRow.username,
          name: foundUserRow.name,
          email: foundUserRow.email,
          role: foundUserRow.role || 'ADMIN',
          isActive: foundUserRow.is_active !== false,
          permissions: userPerms,
          token: sessionToken,
          createdAt: new Date().toISOString()
        }
      });
    }

    // 2. Built-in Fallback Credentials (STRICTLY GUARDED: Development Only via explicit env flag)
    const allowDevFallback = process.env.NODE_ENV !== 'production' && process.env.ENABLE_DEV_FALLBACK_AUTH === 'true';

    if (allowDevFallback) {
      if (username === 'admin' && password === 'admin123') {
        const sessionToken = await createSessionToken({
          id: 'usr-admin',
          username: 'admin',
          role: 'ADMIN'
        });
        return res.status(200).json({
          success: true,
          token: sessionToken,
          user: {
            id: 'usr-admin',
            username: 'admin',
            name: 'Elena Rostova (Principal Admin)',
            email: 'admin@vintagevibe.ae',
            role: 'ADMIN',
            isActive: true,
            permissions: generatePermissions('usr-admin', 'ADMIN'),
            token: sessionToken,
            createdAt: new Date().toISOString()
          }
        });
      }

      if (username === 'accountant' && password === 'acct123') {
        const sessionToken = await createSessionToken({
          id: 'usr-acct',
          username: 'accountant',
          role: 'ACCOUNTANT'
        });
        return res.status(200).json({
          success: true,
          token: sessionToken,
          user: {
            id: 'usr-acct',
            username: 'accountant',
            name: 'Farhan Zaidi (Senior Accountant)',
            email: 'accountant@vintagevibe.ae',
            role: 'ACCOUNTANT',
            isActive: true,
            permissions: generatePermissions('usr-acct', 'ACCOUNTANT'),
            token: sessionToken,
            createdAt: new Date().toISOString()
          }
        });
      }
    }

    return res.status(401).json({
      success: false,
      error: 'Invalid credentials. Please verify your username and password.'
    });

  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err?.message || 'Server error during authentication'
    });
  }
}
