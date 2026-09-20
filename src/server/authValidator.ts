import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// Global in-memory cache for fast session lookup and instant revocation
const activeSessions = new Map<string, {
  userId: string;
  username: string;
  role: string;
  expiresAt: number;
}>();

const revokedTokens = new Set<string>();

// Dynamic Supabase Admin singleton
let _supabaseAdmin: any = null;
function getSupabaseAdmin() {
  if (!_supabaseAdmin) {
    try {
      const supaUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://wjjelqsrivnyiybarfmo.supabase.co';
      const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
      _supabaseAdmin = createClient(supaUrl, supaKey || 'anon-key');
    } catch {
      _supabaseAdmin = null;
    }
  }
  return _supabaseAdmin;
}

let devEphemeralSecret: string | null = null;

// Secret key for HMAC token signing (Strictly mandatory in production)
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

  // Development & test fallback: ephemeral cryptographically random 32-byte secret per process run (never hardcoded)
  if (!devEphemeralSecret) {
    devEphemeralSecret = crypto.randomBytes(32).toString('hex');
  }
  return devEphemeralSecret;
}

/**
 * Compute HMAC-SHA256 signature for token payload
 */
function computeSignature(payload: string): string {
  return crypto.createHmac('sha256', getSessionSecret()).update(payload).digest('hex');
}

/**
 * Safe constant-time signature comparison to prevent timing attacks.
 * Fails closed on length mismatch or malformed hex buffers.
 */
function verifySignature(expected: string, actual: string): boolean {
  try {
    if (!expected || !actual) return false;
    const bufA = Buffer.from(expected, 'hex');
    const bufB = Buffer.from(actual, 'hex');
    if (bufA.length === 0 || bufB.length === 0 || bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Create a cryptographically random, HMAC-signed opaque session token.
 * Format: vv_sess_<opaqueHex>.<userId>.<role>.<expiresAt>.<signature>
 */
export async function createSessionToken(user: { id: string; username: string; role?: string }): Promise<string> {
  const opaqueId = 'vv_sess_' + crypto.randomBytes(32).toString('hex');
  const userId = String(user.id || '').trim();
  const username = String(user.username || '').trim();
  const role = String(user.role || 'ADMIN').toUpperCase();
  // 24-hour default session lifetime with persistent DB storage and revocation
  const maxAge = Number(process.env.SESSION_MAX_AGE_MS) || 24 * 60 * 60 * 1000;
  const expiresAt = Date.now() + maxAge;

  const payload = `${opaqueId}.${userId}.${role}.${expiresAt}`;
  const sig = computeSignature(payload);
  const token = `${payload}.${sig}`;

  // Store in active session cache
  activeSessions.set(token, {
    userId,
    username,
    role,
    expiresAt
  });

  // Attempt to persist in PostgreSQL user_sessions table if available (non-blocking)
  try {
    const { getPgClient } = await import('../db/pgPool.ts');
    const client = await getPgClient();
    if (client) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS public.user_sessions (
          token TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          username TEXT NOT NULL,
          role TEXT NOT NULL,
          expires_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          revoked_at TIMESTAMPTZ
        );
      `).catch(() => {});
      await client.query(`
        INSERT INTO public.user_sessions (token, user_id, username, role, expires_at)
        VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000.0))
        ON CONFLICT (token) DO UPDATE
        SET expires_at = EXCLUDED.expires_at, revoked_at = NULL;
      `, [token, userId, username, role, expiresAt]).catch(() => {});
    }
  } catch {
    // Database persistence failure will not break the active in-memory / cryptographic session
  }

  return token;
}

/**
 * Revoke a session token persistently in PostgreSQL user_sessions and local cache
 */
export async function revokeSessionToken(token: string): Promise<boolean> {
  if (!token) return false;
  revokedTokens.add(token);
  activeSessions.delete(token);

  try {
    const { getPgClient } = await import('../db/pgPool.ts');
    const client = await getPgClient();
    if (client) {
      await client.query(
        'UPDATE public.user_sessions SET revoked_at = NOW() WHERE token = $1;',
        [token]
      );
    }
  } catch {}

  return true;
}

export interface AuthVerifyResult {
  valid: boolean;
  user?: {
    id: string;
    username: string;
    role: string;
  };
  error?: string;
}

/**
 * Cryptographically verifies an Authorization header or raw token.
 * Rejects any arbitrary/unverified token string (no prefix-only bypass).
 * Fail-closed: any parsing error, invalid signature, or expired token returns valid: false.
 */
export async function verifyAuthToken(authHeaderOrToken?: string): Promise<AuthVerifyResult> {
  try {
    if (!authHeaderOrToken || typeof authHeaderOrToken !== 'string') {
      return { valid: false, error: 'Authorization token is required' };
    }

    let token = authHeaderOrToken.trim();

    // Strip leading 'Bearer ' (case-insensitive)
    if (token.toLowerCase().startsWith('bearer ')) {
      token = token.slice(7).trim();
    }

    if (!token) {
      return { valid: false, error: 'Empty token supplied' };
    }

    // Check if token was revoked
    if (revokedTokens.has(token)) {
      return { valid: false, error: 'Session token has been revoked' };
    }

    // 1. Check Cryptographic HMAC Session Token format:
    // vv_sess_<opaqueHex>.<userId>.<role>.<expiresAt>.<signature>
    if (token.startsWith('vv_sess_')) {
      const parts = token.split('.');
      if (parts.length === 5) {
        const [opaqueId, userId, role, expiresAtStr, sig] = parts;

        // Strict parsing validation
        if (!opaqueId.startsWith('vv_sess_') || opaqueId.length < 32 || !userId || !role || !sig || sig.length !== 64) {
          return { valid: false, error: 'Malformed session token structure' };
        }

        const expiresAt = Number(expiresAtStr);
        if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
          return { valid: false, error: 'Session token has expired' };
        }

        const payload = `${opaqueId}.${userId}.${role}.${expiresAtStr}`;
        const expectedSig = computeSignature(payload);

        // Constant-time HMAC comparison
        if (!verifySignature(expectedSig, sig)) {
          return { valid: false, error: 'Invalid session signature' };
        }

        // Check in-memory active cache
        const cached = activeSessions.get(token);
        if (cached) {
          return {
            valid: true,
            user: {
              id: cached.userId,
              username: cached.username,
              role: cached.role
            }
          };
        }

        // If not in memory cache (e.g. cold start), check persistent database user_sessions
        try {
          const { getPgClient } = await import('../db/pgPool.ts');
          const client = await getPgClient();
          if (client) {
            const dbCheck = await client.query(
              'SELECT user_id, username, role, revoked_at FROM public.user_sessions WHERE token = $1 LIMIT 1;',
              [token]
            );
            if (dbCheck.rows && dbCheck.rows.length > 0) {
              const row = dbCheck.rows[0];
              if (row.revoked_at) {
                revokedTokens.add(token);
                return { valid: false, error: 'Session token has been revoked' };
              }
              activeSessions.set(token, {
                userId: row.user_id,
                username: row.username,
                role: row.role,
                expiresAt
              });
              return {
                valid: true,
                user: {
                  id: row.user_id,
                  username: row.username,
                  role: row.role
                }
              };
            }
          }
        } catch {}

        // Fallback: Signature is cryptographically verified!
        return {
          valid: true,
          user: {
            id: userId,
            username: userId.startsWith('usr-') ? userId.replace('usr-', '') : userId,
            role
          }
        };
      }

      return { valid: false, error: 'Malformed session token' };
    }

    // 2. Check Supabase Auth JWT (Format: header.payload.signature where header is base64 JSON starting with eyJ)
    if (token.startsWith('eyJ') && token.split('.').length === 3) {
      const supabase = getSupabaseAdmin();
      if (supabase) {
        try {
          const { data, error } = await supabase.auth.getUser(token);
          if (!error && data?.user) {
            const u = data.user;
            const userMeta = u.user_metadata || {};
            const appMeta = u.app_metadata || {};
            return {
              valid: true,
              user: {
                id: u.id,
                username: userMeta.username || u.email?.split('@')[0] || 'operator',
                role: (appMeta.role || userMeta.role || 'USER').toUpperCase()
              }
            };
          }
        } catch {}
      }
    }

    // 3. Any other token (e.g. fake Bearer, sess-usr-admin, random string) is REJECTED
    return {
      valid: false,
      error: 'Unauthorized: Invalid or unverified token. Prefix-only or arbitrary tokens are rejected.'
    };
  } catch {
    // Fail closed on any unhandled exception
    return {
      valid: false,
      error: 'Unauthorized: Authentication verification failed (fail-closed).'
    };
  }
}

/**
 * Express middleware to enforce cryptographic token verification on protected routes.
 */
export async function requireAuthMiddleware(req: any, res: any, next: any) {
  const authHeader = req.headers?.authorization || req.headers?.['authorization'];
  const correlationId = (req as any).correlationId || req.headers?.['x-correlation-id'] || `req-${Date.now()}`;

  const result = await verifyAuthToken(authHeader);
  if (!result.valid || !result.user) {
    return res.status(401).json({
      success: false,
      error: result.error || 'Unauthorized. Valid cryptographic authorization token is required.',
      correlationId
    });
  }

  req.user = result.user;
  next();
}

export type ModulePermissionTarget = 'AUDIT' | 'HR' | 'FINANCE';

/**
 * Validates whether the authenticated user has sufficient role/privileges to access the specified module.
 * Fails closed with explicit reason on permission denial.
 */
export function checkModulePermission(
  user: { role?: string; permissions?: any[] } | undefined,
  module: ModulePermissionTarget
): { allowed: boolean; reason?: string } {
  if (!user) {
    return { allowed: false, reason: 'Authentication required' };
  }

  const role = String(user.role || '').toUpperCase();
  if (role === 'ADMIN') {
    return { allowed: true };
  }

  // Check explicit module permissions array if present
  if (Array.isArray(user.permissions)) {
    const modPerm = user.permissions.find((p: any) => p?.module === module);
    if (modPerm && typeof modPerm.canView === 'boolean') {
      if (modPerm.canView) return { allowed: true };
      return { allowed: false, reason: `Forbidden: User does not have ${module} view permission.` };
    }
  }

  if (module === 'AUDIT') {
    return {
      allowed: false,
      reason: 'Forbidden: Insufficient privileges to view audit logs. Required role: ADMIN.'
    };
  }

  if (module === 'HR') {
    if (['MANAGER', 'ACCOUNTANT'].includes(role)) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: 'Forbidden: Insufficient privileges to access HR records. Required role: ADMIN, MANAGER, or ACCOUNTANT.'
    };
  }

  if (module === 'FINANCE') {
    if (['MANAGER', 'ACCOUNTANT'].includes(role)) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: 'Forbidden: Insufficient privileges to access financial data. Required role: ADMIN, MANAGER, or ACCOUNTANT.'
    };
  }

  return { allowed: false, reason: `Forbidden: Insufficient privileges for module ${module}.` };
}

/**
 * Express middleware to enforce both cryptographic authentication and role-based access control.
 */
export function requireModuleAuth(module: ModulePermissionTarget) {
  return async (req: any, res: any, next: any) => {
    const correlationId = (req as any).correlationId || req.headers?.['x-correlation-id'] || `req-${Date.now()}`;
    const authHeader = req.headers?.authorization || req.headers?.['authorization'];
    const authResult = await verifyAuthToken(authHeader);

    if (!authResult.valid || !authResult.user) {
      return res.status(401).json({
        success: false,
        error: authResult.error || 'Unauthorized. Valid cryptographic authorization token is required.',
        correlationId
      });
    }

    const perm = checkModulePermission(authResult.user, module);
    if (!perm.allowed) {
      return res.status(403).json({
        success: false,
        error: perm.reason || 'Forbidden: Insufficient privileges.',
        correlationId
      });
    }

    req.user = authResult.user;
    next();
  };
}

/**
 * Strict CORS Allowlist and Origin validation
 */
const DEFAULT_ALLOWED_ORIGINS = [
  'https://vintagevibesgk.com',
  'https://www.vintagevibesgk.com',
  'https://vintagevibe.ae',
  'https://www.vintagevibe.ae'
];

export function isOriginAllowed(origin?: string | null): boolean {
  if (!origin || typeof origin !== 'string') return false;
  const lower = origin.trim().toLowerCase();

  const envOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(o => o.trim().toLowerCase())
    .filter(Boolean);

  if (envOrigins.includes(lower)) return true;
  if (DEFAULT_ALLOWED_ORIGINS.some(allowed => allowed.toLowerCase() === lower)) return true;

  // Local development origins
  if (
    lower.startsWith('http://localhost:') ||
    lower.startsWith('http://127.0.0.1:') ||
    lower.startsWith('https://localhost:')
  ) {
    return true;
  }

  // Preview domains
  if (lower.endsWith('.vercel.app')) {
    return true;
  }

  return false;
}

export function applyCorsHeaders(req: any, res: any): { allowed: boolean; isPreflight: boolean } {
  const origin = (req.headers?.origin as string) || '';
  const isPreflight = req.method === 'OPTIONS';

  if (origin && isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Correlation-ID, X-User-ID, ngrok-skip-browser-warning');
    return { allowed: true, isPreflight };
  }

  // Unknown / unauthorized origin
  if (origin) {
    // Strictly do not set Access-Control-Allow-Credentials
    // Strictly do not reflect origin
    if (isPreflight) {
      res.status(403).json({ error: 'CORS origin not allowed' });
      return { allowed: false, isPreflight: true };
    }
    return { allowed: false, isPreflight: false };
  }

  // Non-browser / same-origin / server-to-server request
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Correlation-ID, X-User-ID, ngrok-skip-browser-warning');
  return { allowed: true, isPreflight };
}
