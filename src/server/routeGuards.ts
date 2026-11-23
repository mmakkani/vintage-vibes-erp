/**
 * Shared route guards (authentication, permission, rate-limiting) used by the
 * Sales, Live Streaming and REST/RPC proxy layers.
 *
 * Design rules
 *  - Fail closed: no valid ERP session => 401.
 *  - Operator identity always comes from the verified session, never from the request body.
 *  - Server-to-server calls may use the INTERNAL_SERVICE_TOKEN header (x-vv-internal).
 *  - Desk PIN (VV_INTERCOM_PIN) has NO default value; if it is not configured the desk PIN is disabled.
 */
import crypto from 'crypto';
import {
  verifyRequestAuth,
  checkModulePermission,
  type ModulePermissionTarget,
  type PermissionActionTarget
} from './authValidator.ts';

function timingSafeEqualStr(a: string, b: string): boolean {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length || ba.length === 0) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/**
 * True only for a request coming from a process on THIS machine that did not pass through a reverse proxy / tunnel
 * (Caddy and Cloudflare always add forwarding headers, so internet traffic never qualifies).
 */
export function isLocalProcessRequest(req: any): boolean {
  const ra = String(req?.socket?.remoteAddress || '');
  const isLoop = ra === '127.0.0.1' || ra === '::1' || ra === '::ffff:127.0.0.1';
  if (!isLoop) return false;
  const h = req?.headers || {};
  const proxied = ['x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-real-ip', 'forwarded', 'cf-connecting-ip', 'cf-ray', 'via', 'cdn-loop'];
  return !proxied.some((k) => h[k] !== undefined);
}

/** True when the request carries the configured internal service token. */
export function isInternalServiceRequest(req: any): boolean {
  const expected = String(process.env.INTERNAL_SERVICE_TOKEN || '').trim();
  if (expected.length < 24) return false;
  const given = String(req?.headers?.['x-vv-internal'] || '').trim();
  return timingSafeEqualStr(expected, given);
}

/** Desk PIN check. Disabled (always false) when VV_INTERCOM_PIN is not configured. Brute-force protected. */
const deskPinFails = new Map<string, { n: number; until: number }>();
export function isDeskPinValid(req: any): boolean {
  const expected = String(process.env.VV_INTERCOM_PIN || '').trim();
  if (expected.length < 6) return false;
  const given = String(req?.headers?.['x-desk-pin'] || req?.query?.pin || req?.body?.pin || '').trim();
  if (!given) return false;
  const ip = clientIp(req);
  const rec = deskPinFails.get(ip);
  if (rec && rec.until > Date.now() && rec.n >= 10) return false; // locked out (even for the right PIN)
  if (timingSafeEqualStr(expected, given)) return true;
  const cur = rec && rec.until > Date.now() ? rec : { n: 0, until: Date.now() + 15 * 60_000 };
  cur.n += 1;
  deskPinFails.set(ip, cur);
  return false;
}

export function inferPermissionAction(method: string, path: string): PermissionActionTarget {
  const m = String(method || 'GET').toUpperCase();
  const p = String(path || '').toLowerCase();
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return 'VIEW';
  if (/\/unpost(\/|$)/.test(p)) return 'UNPOST';
  if (/\/post(\/|$)/.test(p)) return 'POST';
  if (m === 'DELETE' || /\/delete(\/|$)/.test(p)) return 'DELETE';
  if (m === 'PUT' || m === 'PATCH') return 'EDIT';
  return 'CREATE';
}

export interface VerifiedSession {
  id: string;
  username: string;
  role: string;
}

/** Resolve the ERP session for a request (Bearer header or session cookie, skipping Supabase public anon keys). */
export async function resolveErpSession(req: any): Promise<VerifiedSession | null> {
  try {
    const r = await verifyRequestAuth(req);
    if (!r.valid || !r.user) return null;
    return {
      id: String((r.user as any).id || ''),
      username: String((r.user as any).username || (r.user as any).id || 'operator'),
      role: String((r.user as any).role || '')
    };
  } catch {
    return null;
  }
}

const OPERATOR_BODY_KEYS = ['postedBy', 'cancelledBy', 'processedBy', 'createdBy', 'importedBy', 'updatedBy', 'unpostedBy'];

/** Overwrite client-supplied operator identity fields with the verified session username. */
export function stampOperatorIdentity(req: any, username: string): void {
  try {
    req.operatorName = username;
    const body = req.body;
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      for (const k of OPERATOR_BODY_KEYS) {
        if (k in body || k === 'postedBy' || k === 'processedBy' || k === 'cancelledBy') body[k] = username;
      }
    }
  } catch {
    /* ignore */
  }
}

export function operatorOf(req: any, fallback = 'system'): string {
  return String(req?.operatorName || req?.user?.username || fallback);
}

export type AnonymousRule = [method: string | null, pattern: RegExp];

export interface GuardOptions {
  module: ModulePermissionTarget;
  /** Requests matching any rule are allowed without an ERP session (they must self-authenticate if needed). */
  anonymousRules?: AnonymousRule[];
  /** Paths (regex) that may also be authorised with the desk PIN instead of an ERP session. */
  deskPinRules?: AnonymousRule[];
  /** Label used in denial logs. */
  label: string;
}

const deniedRing: Array<{ ts: string; label: string; method: string; path: string; ip: string; reason: string }> = [];
export function getRecentGuardDenials() {
  return deniedRing.slice(-200);
}

function matches(rules: AnonymousRule[] | undefined, method: string, path: string): boolean {
  if (!rules) return false;
  for (const [m, re] of rules) {
    if ((m === null || m === method) && re.test(path)) return true;
  }
  return false;
}

export function createModuleGuard(opts: GuardOptions) {
  const mode = () => (String(process.env[`${opts.label.toUpperCase()}_GUARD_MODE`] || 'enforce').toLowerCase());
  return async (req: any, res: any, next: any) => {
    const method = String(req.method || 'GET').toUpperCase();
    if (method === 'OPTIONS') return next();
    const path = String(req.path || '/');

    if (matches(opts.anonymousRules, method, path)) return next();
    // Local daemons / headless workers on this machine (loopback, no proxy headers) may call every router except Sales
    // (Sales moves money: it needs a real ERP session or the internal service token).
    if (isInternalServiceRequest(req) || (opts.label !== 'sales' && isLocalProcessRequest(req))) return next();

    const session = await resolveErpSession(req);
    if (session) {
      const action = inferPermissionAction(method, path);
      const perm = checkModulePermission({ role: session.role } as any, opts.module, action);
      if (!perm.allowed) {
        return res.status(403).json({ success: false, error: perm.reason || 'Forbidden' });
      }
      req.user = session;
      stampOperatorIdentity(req, session.username);
      return next();
    }

    if (matches(opts.deskPinRules, method, path) && isDeskPinValid(req)) {
      req.operatorName = 'Desk';
      return next();
    }

    const ip = String(req.headers?.['cf-connecting-ip'] || req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || '');
    deniedRing.push({ ts: new Date().toISOString(), label: opts.label, method, path, ip, reason: 'NO_SESSION' });
    if (deniedRing.length > 500) deniedRing.splice(0, deniedRing.length - 500);

    if (mode() === 'log') {
      console.warn(`[guard:${opts.label}] (log-only) unauthenticated ${method} ${path}`);
      return next();
    }
    return res.status(401).json({
      success: false,
      error: 'Authentication required. Please sign in to the ERP.',
      code: 'AUTH_REQUIRED'
    });
  };
}

/* -------------------------------------------------------------------------- */
/* Simple in-memory rate limiter                                              */
/* -------------------------------------------------------------------------- */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function clientIp(req: any): string {
  return String(
    req?.headers?.['cf-connecting-ip'] ||
      String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim() ||
      req?.socket?.remoteAddress ||
      'unknown'
  );
}

/** Returns true when the request is ALLOWED. */
export function rateLimitAllow(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  b.count += 1;
  return b.count <= max;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
}, 60_000).unref?.();
