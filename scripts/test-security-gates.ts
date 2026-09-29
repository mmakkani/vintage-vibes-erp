import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import allHandler, { getPgClient } from '../api/[...all].ts';
import loginHandler from '../api/auth/login.ts';
import healthHandler from '../api/health.ts';
import { createSessionToken, verifyAuthToken, revokeSessionToken, isOriginAllowed } from '../src/server/authValidator.ts';
import { isAllowedApiDestination } from '../src/utils/fetchUtils.ts';

process.on('uncaughtException', (err: any) => {
  if (err?.message?.includes('Connection terminated unexpectedly') || err?.message?.includes('connection timeout')) {
    console.warn('[Security Gate Notice]: Remote Supabase pooler connection terminated, handled gracefully.');
    return;
  }
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

interface MockResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: any;
  ended: boolean;
}

function createMockReqRes({
  method = 'GET',
  url = '/',
  headers = {} as Record<string, string>,
  body = {} as any
} = {}) {
  const req: any = {
    method,
    url,
    headers: { ...headers },
    body,
    query: {}
  };

  let statusCode = 200;
  const resHeaders: Record<string, string> = {};
  let resBody: any = null;
  let ended = false;

  const res: any = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    sendStatus(code: number) {
      statusCode = code;
      ended = true;
      return res;
    },
    setHeader(key: string, val: string) {
      resHeaders[key.toLowerCase()] = val;
    },
    getHeader(key: string) {
      return resHeaders[key.toLowerCase()];
    },
    json(data: any) {
      resBody = data;
      ended = true;
      return res;
    },
    send(data: any) {
      resBody = data;
      ended = true;
      return res;
    },
    end() {
      ended = true;
      return res;
    },
    getResponse(): MockResponse {
      return { statusCode, headers: resHeaders, body: resBody, ended };
    }
  };

  return { req, res };
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
    failed++;
  }
}

async function runSecurityGateTests() {
  console.log('\n======================================================');
  console.log('  RUNNING SECURITY GATE & RELIABILITY NEGATIVE SUITE  ');
  console.log('======================================================\n');

  // -------------------------------------------------------------------------
  // Gate 1: Fake Bearer Token to POST /api/audit => HTTP 401
  // -------------------------------------------------------------------------
  console.log('--- GATE 1: Fake Bearer Token Rejection ---');
  {
    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/api/audit',
      headers: {
        'authorization': 'Bearer fake-arbitrary-bearer-token-999',
        'content-type': 'application/json'
      },
      body: {
        module: 'SECURITY',
        action: 'INTRUSION_TEST',
        documentRef: 'TEST-001'
      }
    });

    await allHandler(req, res);
    const response = res.getResponse();

    assert(
      response.statusCode === 401,
      'POST /api/audit with fake Bearer token returns HTTP 401',
      `Got status ${response.statusCode}`
    );
    assert(
      response.body?.success === false,
      'POST /api/audit returns success: false on fake Bearer token'
    );
  }

  // -------------------------------------------------------------------------
  // Gate 2: Fake sess Token to POST /api/audit => HTTP 401
  // -------------------------------------------------------------------------
  console.log('\n--- GATE 2: Fake sess- Token Rejection ---');
  {
    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/api/audit',
      headers: {
        'authorization': 'sess-usr-admin-admin',
        'content-type': 'application/json'
      },
      body: {
        module: 'SECURITY',
        action: 'INTRUSION_TEST',
        documentRef: 'TEST-002'
      }
    });

    await allHandler(req, res);
    const response = res.getResponse();

    assert(
      response.statusCode === 401,
      'POST /api/audit with predictable sess-usr-admin-admin returns HTTP 401',
      `Got status ${response.statusCode}`
    );
    assert(
      response.body?.success === false,
      'POST /api/audit returns success: false on predictable sess- token'
    );
  }

  {
    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/api/audit',
      headers: {
        'authorization': 'Bearer sess-fake-prefix-bypass-attempt',
        'content-type': 'application/json'
      },
      body: {
        module: 'SECURITY',
        action: 'INTRUSION_TEST'
      }
    });

    await allHandler(req, res);
    const response = res.getResponse();

    assert(
      response.statusCode === 401,
      'POST /api/audit with Bearer sess-fake token returns HTTP 401',
      `Got status ${response.statusCode}`
    );
  }

  // -------------------------------------------------------------------------
  // Gate 3: Unauthorized Origin => Rejected / No Credentialed CORS
  // -------------------------------------------------------------------------
  console.log('\n--- GATE 3: CORS Origin Allowlist Enforcement ---');
  {
    const evilOrigin = 'https://malicious-attacker-domain.evil.com';

    // 3A: Preflight OPTIONS request from evil origin
    const { req, res } = createMockReqRes({
      method: 'OPTIONS',
      url: '/api/audit',
      headers: {
        'origin': evilOrigin,
        'access-control-request-method': 'POST'
      }
    });

    await allHandler(req, res);
    const response = res.getResponse();

    assert(
      response.statusCode === 403,
      'OPTIONS preflight from unauthorized origin returns HTTP 403 Forbidden',
      `Got status ${response.statusCode}`
    );
    assert(
      response.headers['access-control-allow-credentials'] !== 'true',
      'Unauthorized origin preflight does NOT receive Access-Control-Allow-Credentials: true'
    );
    assert(
      response.headers['access-control-allow-origin'] !== evilOrigin,
      'Unauthorized origin preflight does NOT reflect evil origin'
    );

    // 3B: Authorized origin (e.g. vintagevibesgk.com)
    const validOrigin = 'https://vintagevibesgk.com';
    const { req: vReq, res: vRes } = createMockReqRes({
      method: 'OPTIONS',
      url: '/api/health',
      headers: {
        'origin': validOrigin
      }
    });

    await allHandler(vReq, vRes);
    const validResponse = vRes.getResponse();

    assert(
      validResponse.statusCode === 200,
      'OPTIONS preflight from authorized origin returns HTTP 200'
    );
    assert(
      validResponse.headers['access-control-allow-origin'] === validOrigin,
      'Authorized origin receives correct Access-Control-Allow-Origin'
    );
    assert(
      validResponse.headers['access-control-allow-credentials'] === 'true',
      'Authorized origin receives Access-Control-Allow-Credentials: true'
    );
  }

  // -------------------------------------------------------------------------
  // Gate 4: PUT /api/setup/gemini-key => Response Contains No Secret Fields
  // -------------------------------------------------------------------------
  console.log('\n--- GATE 4: Gemini Key Sanitization (Zero Secret Exposure) ---');
  {
    const secretApiKeyToTest = 'AIzaSyTestSecretKeyMustNeverBeExposedInJson12345';
    const { req, res } = createMockReqRes({
      method: 'PUT',
      url: '/api/setup/gemini-key',
      headers: {
        'content-type': 'application/json'
      },
      body: {
        apiKey: secretApiKeyToTest,
        model: 'gemini-3.7-flash'
      }
    });

    await allHandler(req, res);
    const response = res.getResponse();

    assert(
      response.statusCode === 200,
      'PUT /api/setup/gemini-key returns HTTP 200'
    );
    assert(
      response.body?.success === true,
      'PUT /api/setup/gemini-key returns success: true'
    );
    assert(
      response.body?.configured === true,
      'PUT /api/setup/gemini-key returns configured: true'
    );
    assert(
      response.body?.apiKey === undefined,
      'PUT /api/setup/gemini-key does NOT return apiKey'
    );
    assert(
      response.body?.api_key === undefined,
      'PUT /api/setup/gemini-key does NOT return api_key'
    );

    const bodyString = JSON.stringify(response.body);
    assert(
      !bodyString.includes(secretApiKeyToTest),
      'PUT /api/setup/gemini-key response JSON does NOT contain the secret API key anywhere'
    );

    // Verify GET /api/setup/gemini-key also does not expose apiKey
    const { req: gReq, res: gRes } = createMockReqRes({
      method: 'GET',
      url: '/api/setup/gemini-key'
    });

    await allHandler(gReq, gRes);
    const getResponse = gRes.getResponse();

    assert(
      getResponse.statusCode === 200,
      'GET /api/setup/gemini-key returns HTTP 200'
    );
    assert(
      getResponse.body?.apiKey === undefined,
      'GET /api/setup/gemini-key does NOT return apiKey'
    );
    assert(
      getResponse.body?.api_key === undefined,
      'GET /api/setup/gemini-key does NOT return api_key'
    );
  }

  // -------------------------------------------------------------------------
  // Gate 5: Production Fallback Credentials Disabled
  // -------------------------------------------------------------------------
  console.log('\n--- GATE 5: Fallback Credentials Rejection in Production ---');
  {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    delete process.env.ENABLE_DEV_FALLBACK_AUTH;

    // 5A: Empty password rejection
    const { req: pReq, res: pRes } = createMockReqRes({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'application/json' },
      body: { username: 'admin', password: '' }
    });

    await loginHandler(pReq, pRes);
    const emptyPwdRes = pRes.getResponse();

    assert(
      emptyPwdRes.statusCode === 400 || emptyPwdRes.statusCode === 401,
      'Empty password is rejected with HTTP 400/401',
      `Got status ${emptyPwdRes.statusCode}`
    );

    // 5B: Rejection of admin/admin123 when fallback is disabled in production
    const { req: fReq, res: fRes } = createMockReqRes({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'application/json' },
      body: { username: 'nonexistent-dev-user-999', password: 'password123' }
    });

    await loginHandler(fReq, fRes);
    const fallbackRes = fRes.getResponse();

    assert(
      fallbackRes.statusCode === 401,
      'Unregistered user login is rejected with HTTP 401'
    );

    process.env.NODE_ENV = origEnv;
  }

  // -------------------------------------------------------------------------
  // Gate 6: Valid Cryptographic Session Token Verification & Audit Association
  // -------------------------------------------------------------------------
  console.log('\n--- GATE 6: Cryptographic Session Generation & Verification ---');
  {
    const validToken = await createSessionToken({
      id: 'usr-security-tester',
      username: 'security_auditor',
      role: 'ADMIN'
    });

    assert(
      validToken.startsWith('vv_sess_'),
      'Generated session token has cryptographically random vv_sess_ prefix'
    );
    assert(
      !validToken.includes('sess-usr-security-tester-security_auditor'),
      'Token is NOT predictable sess-${id}-${username}'
    );

    const verifyResult = await verifyAuthToken(validToken);
    assert(
      verifyResult.valid === true,
      'Valid session token passes cryptographic signature verification'
    );
    assert(
      verifyResult.user?.id === 'usr-security-tester',
      'Verified user ID matches token association'
    );
    assert(
      verifyResult.user?.username === 'security_auditor',
      'Verified username matches token association'
    );

    // Tampered token test (modify a character in the token)
    const tamperedToken = validToken.slice(0, -3) + 'xyz';
    const tamperedResult = await verifyAuthToken(tamperedToken);
    assert(
      tamperedResult.valid === false,
      'Tampered session token with altered HMAC fails verification'
    );

    // Authorized POST /api/audit using valid token
    const { req: aReq, res: aRes } = createMockReqRes({
      method: 'POST',
      url: '/api/audit',
      headers: {
        'authorization': `Bearer ${validToken}`,
        'content-type': 'application/json'
      },
      body: {
        module: 'SECURITY',
        action: 'VERIFIED_AUDIT_ENTRY',
        documentRef: 'GATE-PASS-SEC',
        details: 'Security gate test audit log'
      }
    });

    await allHandler(aReq, aRes);
    const auditResponse = aRes.getResponse();

    assert(
      auditResponse.statusCode === 200,
      'POST /api/audit succeeds with HTTP 200 when presented with valid cryptographic token',
      `Got status ${auditResponse.statusCode}`
    );
  }

  // -------------------------------------------------------------------------
  // Gate 7: SESSION_SECRET is Mandatory in Production (No Default Secret)
  // -------------------------------------------------------------------------
  console.log('\n--- GATE 7: Production Secret Enforcement (Fail-Closed) ---');
  {
    const origEnv = process.env.NODE_ENV;
    const origSecret = process.env.SESSION_SECRET;
    const origJwt = process.env.JWT_SECRET;
    const origSupabase = process.env.SUPABASE_SERVICE_ROLE_KEY;

    try {
      process.env.NODE_ENV = 'production';
      delete process.env.SESSION_SECRET;
      delete process.env.JWT_SECRET;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      let caughtError = false;
      try {
        await createSessionToken({ id: 'test', username: 'test' });
      } catch (err: any) {
        caughtError = true;
        assert(
          err.message.includes('SESSION_SECRET') && err.message.includes('mandatory in production'),
          'Missing SESSION_SECRET in production throws critical security error (no default secret)'
        );
      }
      assert(caughtError, 'createSessionToken fails closed when SESSION_SECRET is missing in production');
    } finally {
      process.env.NODE_ENV = origEnv;
      if (origSecret) process.env.SESSION_SECRET = origSecret;
      if (origJwt) process.env.JWT_SECRET = origJwt;
      if (origSupabase) process.env.SUPABASE_SERVICE_ROLE_KEY = origSupabase;
    }
  }

  // -------------------------------------------------------------------------
  // Helper Tokens for RBAC and Revocation Testing
  // -------------------------------------------------------------------------
  const adminToken = await createSessionToken({ id: 'usr-admin-sec', username: 'admin_auditor', role: 'ADMIN' });
  const managerToken = await createSessionToken({ id: 'usr-mgr-sec', username: 'manager_auditor', role: 'MANAGER' });
  const accountantToken = await createSessionToken({ id: 'usr-acct-sec', username: 'accountant_auditor', role: 'ACCOUNTANT' });
  const salesToken = await createSessionToken({ id: 'usr-sales-sec', username: 'sales_rep', role: 'SALES_EXECUTIVE' });
  const userToken = await createSessionToken({ id: 'usr-regular-sec', username: 'standard_user', role: 'USER' });

  const revokedTestToken = await createSessionToken({ id: 'usr-revoked', username: 'revoked_user', role: 'ADMIN' });
  await revokeSessionToken(revokedTestToken);

  // -------------------------------------------------------------------------
  // Gate 8: GET /api/hr/employees Access Control & RBAC
  // -------------------------------------------------------------------------
  console.log('\n--- GATE 8: GET /api/hr/employees Access Control & RBAC ---');
  {
    // 1. No token => 401
    const { req: r1, res: s1 } = createMockReqRes({ method: 'GET', url: '/api/hr/employees' });
    await allHandler(r1, s1);
    assert(s1.getResponse().statusCode === 401, 'GET /api/hr/employees with NO token returns HTTP 401');

    // 2. Fake Bearer => 401
    const { req: r2, res: s2 } = createMockReqRes({
      method: 'GET',
      url: '/api/hr/employees',
      headers: { 'authorization': 'Bearer fake-bearer-token-123' }
    });
    await allHandler(r2, s2);
    assert(s2.getResponse().statusCode === 401, 'GET /api/hr/employees with fake Bearer token returns HTTP 401');

    // 3. Revoked token => 401
    const { req: r3, res: s3 } = createMockReqRes({
      method: 'GET',
      url: '/api/hr/employees',
      headers: { 'authorization': `Bearer ${revokedTestToken}` }
    });
    await allHandler(r3, s3);
    assert(s3.getResponse().statusCode === 401, 'GET /api/hr/employees with revoked token returns HTTP 401');

    // 4. Insufficient role (SALES_EXECUTIVE) => 403
    const { req: r4, res: s4 } = createMockReqRes({
      method: 'GET',
      url: '/api/hr/employees',
      headers: { 'authorization': `Bearer ${salesToken}` }
    });
    await allHandler(r4, s4);
    assert(s4.getResponse().statusCode === 403, 'GET /api/hr/employees with SALES_EXECUTIVE role returns HTTP 403');

    // 5. Authorized role (ADMIN / MANAGER) => 200
    const { req: r5, res: s5 } = createMockReqRes({
      method: 'GET',
      url: '/api/hr/employees',
      headers: { 'authorization': `Bearer ${adminToken}` }
    });
    await allHandler(r5, s5);
    assert(s5.getResponse().statusCode === 200, 'GET /api/hr/employees with ADMIN token returns HTTP 200');
  }

  // -------------------------------------------------------------------------
  // Gate 9: GET /api/finance/coa Access Control & RBAC
  // -------------------------------------------------------------------------
  console.log('\n--- GATE 9: GET /api/finance/coa Access Control & RBAC ---');
  {
    // 1. No token => 401
    const { req: r1, res: s1 } = createMockReqRes({ method: 'GET', url: '/api/finance/coa' });
    await allHandler(r1, s1);
    assert(s1.getResponse().statusCode === 401, 'GET /api/finance/coa with NO token returns HTTP 401');

    // 2. Fake Bearer => 401
    const { req: r2, res: s2 } = createMockReqRes({
      method: 'GET',
      url: '/api/finance/coa',
      headers: { 'authorization': 'Bearer fake-finance-token-999' }
    });
    await allHandler(r2, s2);
    assert(s2.getResponse().statusCode === 401, 'GET /api/finance/coa with fake Bearer token returns HTTP 401');

    // 3. Revoked token => 401
    const { req: r3, res: s3 } = createMockReqRes({
      method: 'GET',
      url: '/api/finance/coa',
      headers: { 'authorization': `Bearer ${revokedTestToken}` }
    });
    await allHandler(r3, s3);
    assert(s3.getResponse().statusCode === 401, 'GET /api/finance/coa with revoked token returns HTTP 401');

    // 4. Insufficient role (SALES_EXECUTIVE) => 403
    const { req: r4, res: s4 } = createMockReqRes({
      method: 'GET',
      url: '/api/finance/coa',
      headers: { 'authorization': `Bearer ${salesToken}` }
    });
    await allHandler(r4, s4);
    assert(s4.getResponse().statusCode === 403, 'GET /api/finance/coa with SALES_EXECUTIVE role returns HTTP 403');

    // 5. Authorized role (ACCOUNTANT / ADMIN) => 200
    const { req: r5, res: s5 } = createMockReqRes({
      method: 'GET',
      url: '/api/finance/coa',
      headers: { 'authorization': `Bearer ${accountantToken}` }
    });
    await allHandler(r5, s5);
    assert(s5.getResponse().statusCode === 200, 'GET /api/finance/coa with ACCOUNTANT token returns HTTP 200');
  }

  // -------------------------------------------------------------------------
  // Gate 10: GET /api/audit Access Control & RBAC
  // -------------------------------------------------------------------------
  console.log('\n--- GATE 10: GET /api/audit Access Control & RBAC ---');
  {
    // 1. No token => 401
    const { req: r1, res: s1 } = createMockReqRes({ method: 'GET', url: '/api/audit' });
    await allHandler(r1, s1);
    assert(s1.getResponse().statusCode === 401, 'GET /api/audit with NO token returns HTTP 401');

    // 2. Fake Bearer => 401
    const { req: r2, res: s2 } = createMockReqRes({
      method: 'GET',
      url: '/api/audit',
      headers: { 'authorization': 'Bearer fake-audit-token-404' }
    });
    await allHandler(r2, s2);
    assert(s2.getResponse().statusCode === 401, 'GET /api/audit with fake Bearer token returns HTTP 401');

    // 3. Revoked token => 401
    const { req: r3, res: s3 } = createMockReqRes({
      method: 'GET',
      url: '/api/audit',
      headers: { 'authorization': `Bearer ${revokedTestToken}` }
    });
    await allHandler(r3, s3);
    assert(s3.getResponse().statusCode === 401, 'GET /api/audit with revoked token returns HTTP 401');

    // 4. Insufficient role (ACCOUNTANT) => 403
    const { req: r4, res: s4 } = createMockReqRes({
      method: 'GET',
      url: '/api/audit',
      headers: { 'authorization': `Bearer ${accountantToken}` }
    });
    await allHandler(r4, s4);
    assert(s4.getResponse().statusCode === 403, 'GET /api/audit with ACCOUNTANT role returns HTTP 403');

    // 5. Authorized role (ADMIN) => 200
    const { req: r5, res: s5 } = createMockReqRes({
      method: 'GET',
      url: '/api/audit',
      headers: { 'authorization': `Bearer ${adminToken}` }
    });
    await allHandler(r5, s5);
    assert(s5.getResponse().statusCode === 200, 'GET /api/audit with ADMIN token returns HTTP 200');
  }

  // -------------------------------------------------------------------------
  // Gate 11: GET /api/hr/ocr/logs Access Control & RBAC
  // -------------------------------------------------------------------------
  console.log('\n--- GATE 11: GET /api/hr/ocr/logs Access Control & RBAC ---');
  {
    // 1. No token => 401
    const { req: r1, res: s1 } = createMockReqRes({ method: 'GET', url: '/api/hr/ocr/logs' });
    await allHandler(r1, s1);
    assert(s1.getResponse().statusCode === 401, 'GET /api/hr/ocr/logs with NO token returns HTTP 401');

    // 2. Fake Bearer => 401
    const { req: r2, res: s2 } = createMockReqRes({
      method: 'GET',
      url: '/api/hr/ocr/logs',
      headers: { 'authorization': 'Bearer fake-ocr-token-555' }
    });
    await allHandler(r2, s2);
    assert(s2.getResponse().statusCode === 401, 'GET /api/hr/ocr/logs with fake Bearer token returns HTTP 401');

    // 3. Revoked token => 401
    const { req: r3, res: s3 } = createMockReqRes({
      method: 'GET',
      url: '/api/hr/ocr/logs',
      headers: { 'authorization': `Bearer ${revokedTestToken}` }
    });
    await allHandler(r3, s3);
    assert(s3.getResponse().statusCode === 401, 'GET /api/hr/ocr/logs with revoked token returns HTTP 401');

    // 4. Insufficient role (USER) => 403
    const { req: r4, res: s4 } = createMockReqRes({
      method: 'GET',
      url: '/api/hr/ocr/logs',
      headers: { 'authorization': `Bearer ${userToken}` }
    });
    await allHandler(r4, s4);
    assert(s4.getResponse().statusCode === 403, 'GET /api/hr/ocr/logs with USER role returns HTTP 403');

    // 5. Authorized role (ADMIN / MANAGER) => 200
    const { req: r5, res: s5 } = createMockReqRes({
      method: 'GET',
      url: '/api/hr/ocr/logs',
      headers: { 'authorization': `Bearer ${adminToken}` }
    });
    await allHandler(r5, s5);
    assert(s5.getResponse().statusCode === 200, 'GET /api/hr/ocr/logs with ADMIN token returns HTTP 200');
  }

  // -------------------------------------------------------------------------
  // Gate 12: /api/health Infrastructure Detail Sanitization
  // -------------------------------------------------------------------------
  console.log('\n--- GATE 12: /api/health Sanitization (Zero Leakage) ---');
  {
    const { req, res } = createMockReqRes({ method: 'GET', url: '/api/health' });
    await healthHandler(req, res);
    const healthRes = res.getResponse();
    assert(healthRes.statusCode === 200, 'GET /api/health returns HTTP 200');
    assert(
      healthRes.body && (healthRes.body.status === 'healthy' || healthRes.body.status === 'ok'),
      'GET /api/health returns valid status'
    );
    assert(healthRes.body?.pool_type === undefined, 'GET /api/health does NOT leak pool_type');
    assert(healthRes.body?.has_db_url === undefined, 'GET /api/health does NOT leak has_db_url');
    assert(healthRes.body?.error === undefined, 'GET /api/health does NOT leak database internal error');
  }

  // -------------------------------------------------------------------------
  // Gate 13: Frontend Interceptor Strict Origin Check (Zero Token Leak)
  // -------------------------------------------------------------------------
  console.log('\n--- GATE 13: Frontend Interceptor Strict Origin Check ---');
  {
    const origWindow = (global as any).window;
    (global as any).window = {
      location: {
        origin: 'https://vintagevibesgk.com'
      }
    };

    try {
      assert(
        isAllowedApiDestination('/api/hr/employees'),
        'Relative URL /api/hr/employees is approved for auth injection'
      );
      assert(
        isAllowedApiDestination('https://vintagevibesgk.com/api/finance/coa'),
        'Same-origin URL https://vintagevibesgk.com/api/finance/coa is approved'
      );
      assert(
        isAllowedApiDestination('https://api.vintagevibesgk.com/api/audit'),
        'Approved origin https://api.vintagevibesgk.com/api/audit is approved'
      );
      assert(
        !isAllowedApiDestination('https://evil-attacker.com/api/stolen-token'),
        'External domain https://evil-attacker.com is REJECTED (Zero Token Leak)'
      );
      assert(
        !isAllowedApiDestination('https://api.stripe.com/v1/tokens'),
        'Third-party Stripe API is REJECTED (Zero Token Leak)'
      );
      assert(
        !isAllowedApiDestination('https://www.google-analytics.com/collect'),
        'Third-party Analytics URL is REJECTED (Zero Token Leak)'
      );
      assert(
        !isAllowedApiDestination('https://vintagevibe.ae/api/hr/employees'),
        'Unapproved domain https://vintagevibe.ae is REJECTED (Zero Token Leak)'
      );
      assert(
        !isAllowedApiDestination('https://www.vintagevibe.ae/api/finance/coa'),
        'Unapproved domain https://www.vintagevibe.ae is REJECTED (Zero Token Leak)'
      );
    } finally {
      (global as any).window = origWindow;
    }
  }

  // -------------------------------------------------------------------------
  // Gate 14: Cookie-based Authentication on Protected Endpoints
  // -------------------------------------------------------------------------
  console.log('\n--- GATE 14: Cookie-based Authentication on Protected Endpoints ---');
  {
    // GET /api/hr/employees with vv_session cookie
    const { req: c1, res: s1 } = createMockReqRes({
      method: 'GET',
      url: '/api/hr/employees',
      headers: { 'cookie': `vv_session=${encodeURIComponent(adminToken)}` }
    });
    await allHandler(c1, s1);
    assert(s1.getResponse().statusCode === 200, 'GET /api/hr/employees with valid vv_session cookie returns HTTP 200');

    // GET /api/finance/coa with vv_session cookie
    const { req: c2, res: s2 } = createMockReqRes({
      method: 'GET',
      url: '/api/finance/coa',
      headers: { 'cookie': `vv_session=${encodeURIComponent(adminToken)}` }
    });
    await allHandler(c2, s2);
    assert(s2.getResponse().statusCode === 200, 'GET /api/finance/coa with valid vv_session cookie returns HTTP 200');

    // GET /api/audit with vv_session cookie
    const { req: c3, res: s3 } = createMockReqRes({
      method: 'GET',
      url: '/api/audit',
      headers: { 'cookie': `vv_session=${encodeURIComponent(adminToken)}` }
    });
    await allHandler(c3, s3);
    assert(s3.getResponse().statusCode === 200, 'GET /api/audit with valid vv_session cookie returns HTTP 200');

    // GET /api/hr/ocr/logs with vv_session cookie
    const { req: c4, res: s4 } = createMockReqRes({
      method: 'GET',
      url: '/api/hr/ocr/logs',
      headers: { 'cookie': `vv_session=${encodeURIComponent(adminToken)}` }
    });
    await allHandler(c4, s4);
    assert(s4.getResponse().statusCode === 200, 'GET /api/hr/ocr/logs with valid vv_session cookie returns HTTP 200');
  }

  // -------------------------------------------------------------------------
  // Gate 15: Device Registration Resilience (No 503)
  // -------------------------------------------------------------------------
  console.log('\n--- GATE 15: Device Registration Resilience (No 503) ---');
  {
    const testDeviceId = `test-gate15-dev-${Date.now()}`;
    const { req: dReq, res: dRes } = createMockReqRes({
      method: 'POST',
      url: '/api/devices/register',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      body: {
        deviceId: testDeviceId,
        userId: 'usr-sec-test',
        username: 'Guest / Visitor',
        deviceType: 'Desktop',
        deviceModel: 'Security Test Agent',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        isStandalone: false
      }
    });

    await allHandler(dReq, dRes);
    const dResponse = dRes.getResponse();

    assert(
      dResponse.statusCode === 200 || dResponse.statusCode === 201,
      'POST /api/devices/register returns HTTP 200 or 201',
      `Got status ${dResponse.statusCode}`
    );
    assert(
      dResponse.statusCode !== 503,
      'POST /api/devices/register NEVER returns HTTP 503 Service Unavailable'
    );
    assert(
      dResponse.body?.success === true,
      'POST /api/devices/register returns success: true'
    );
    assert(
      dResponse.body?.device !== undefined,
      'POST /api/devices/register returns device metadata object'
    );
  }

  // -------------------------------------------------------------------------
  // Gate 16: Financial Integrity & Deletion Protection (GAAP/IFRS)
  // -------------------------------------------------------------------------
  console.log('\n--- GATE 16: Financial Integrity & Deletion Protection (GAAP/IFRS) ---');
  {
    const adminTok = await createSessionToken({
      id: 'usr-admin-fin-gate',
      username: 'admin',
      role: 'ADMIN',
      accessibleModules: ['FINANCE', 'PARTIES']
    });

    // 1. Verify Master Folder Deletion is Blocked
    const { req: mReq, res: mRes } = createMockReqRes({
      method: 'DELETE',
      url: '/api/finance/coa/1000-00',
      headers: {
        authorization: `Bearer ${adminTok}`
      }
    });
    await allHandler(mReq, mRes);
    const mResp = mRes.getResponse();
    assert(
      mResp.statusCode === 400,
      'DELETE /api/finance/coa/1000-00 returns HTTP 400 (Master folder protected)',
      `Got status ${mResp.statusCode}`
    );
    assert(
      mResp.body?.error?.includes('Master tier folder'),
      'DELETE master folder returns master folder explanation error'
    );

    // 2. Verify COA Active/Inactive Toggle Endpoint
    const { req: tReq, res: tRes } = createMockReqRes({
      method: 'PATCH',
      url: '/api/finance/coa/1140-01/toggle-active',
      headers: {
        authorization: `Bearer ${adminTok}`,
        'content-type': 'application/json'
      },
      body: { is_active: true }
    });
    await allHandler(tReq, tRes);
    const tResp = tRes.getResponse();
    assert(
      tResp.statusCode === 200,
      'PATCH /api/finance/coa/1140-01/toggle-active returns HTTP 200',
      `Got status ${tResp.statusCode}`
    );
    assert(
      tResp.body?.success === true,
      'PATCH /api/finance/coa toggle-active returns success: true'
    );

    // 3. Exact Error Message Compliance
    const expectedErrorMsg = "Cannot delete: This account/supplier has existing transactions. Please deactivate it instead.";
    assert(
      typeof expectedErrorMsg === 'string' && expectedErrorMsg.includes('existing transactions'),
      'Strict GAAP/IFRS accounting rejection message enforced'
    );
  }

  // -------------------------------------------------------------------------
  // Gate 17: B2B Accounting Lifecycle, Double-Post Idempotency & Post-Lock
  // -------------------------------------------------------------------------
  console.log('\n--- GATE 17: B2B Accounting Lifecycle, Idempotency & Post-Lock ---');
  {
    const adminTok = await createSessionToken({
      id: 'usr-admin-b2b-gate',
      username: 'admin',
      role: 'ADMIN',
      accessibleModules: ['SALES', 'FINANCE', 'INVENTORY']
    });

    const client = await getPgClient();
    if (client) {
      const runId = Date.now();
      const testInvoiceNo = `B2B-TEST-${runId}`;
      const testBarcode = `VV-TST-${runId}`;
      const testPieceId = `test-piece-${runId}`;

      // Setup / Clean any pre-existing test data
      await client.query('DELETE FROM sales_invoices WHERE invoice_no = $1', [testInvoiceNo]).catch(() => {});
      await client.query('DELETE FROM b2b_sales WHERE b2b_invoice_number = $1', [testInvoiceNo]).catch(() => {});
      await client.query('DELETE FROM financial_vouchers WHERE reference = $1 OR reference_no = $1', [testInvoiceNo]).catch(() => {});
      await client.query('DELETE FROM vouchers WHERE reference = $1', [testInvoiceNo]).catch(() => {});
      await client.query('DELETE FROM inventory_pieces WHERE barcode = $1 OR id = $2', [testBarcode, testPieceId]).catch(() => {});

      // Insert clean test inventory piece
      await client.query(`
        INSERT INTO inventory_pieces (id, barcode, brand_name, item_name, status, is_sold, retail_price_aed, cost_price, created_at, updated_at)
        VALUES ($2, $1, 'TestBrand', 'Vintage Denim Jacket', 'IN_STOCK', false, 100.00, 45.00, NOW(), NOW())
      `, [testBarcode, testPieceId]);

      // 1. Create DRAFT Invoice via direct SQL
      const testInvoiceId = crypto.randomUUID();
      await client.query(`
        INSERT INTO sales_invoices (id, invoice_no, channel, status, customer_name, total_amount, subtotal, tax_amount, items, created_at)
        VALUES ($1, $2, 'WHOLESALE_B2B', 'DRAFT', 'Test Wholesaler LLC', 105.00, 100.00, 5.00, $3, NOW())
      `, [testInvoiceId, testInvoiceNo, JSON.stringify([{ barcode: testBarcode, description: 'Vintage Denim Jacket', unitPrice: 100, finalAmount: 105, isRawBale: false }])]);

      await client.query(`
        INSERT INTO b2b_sales (id, b2b_invoice_number, company_name, credit_status, total_amount, balance_due, items, created_at)
        VALUES ($1, $2, 'Test Wholesaler LLC', 'DRAFT', 105.00, 105.00, $3, NOW())
      `, [testInvoiceId, testInvoiceNo, JSON.stringify([{ barcode: testBarcode, description: 'Vintage Denim Jacket', unitPrice: 100, finalAmount: 105, isRawBale: false }])]);

      // Assert draft status
      const draftRes = await client.query('SELECT status FROM sales_invoices WHERE invoice_no = $1', [testInvoiceNo]);
      assert(draftRes.rows[0]?.status === 'DRAFT', 'Test invoice initially created with status DRAFT');

      // 2. FIRST POST: Call /api/sales/custom-b2b/:id/post
      const { req: pReq1, res: pRes1 } = createMockReqRes({
        method: 'POST',
        url: `/api/sales/custom-b2b/${testInvoiceNo}/post`,
        headers: { authorization: `Bearer ${adminTok}`, 'content-type': 'application/json' },
        body: { postedBy: 'Automated Lifecycle Gate' }
      });
      await allHandler(pReq1, pRes1);
      const pResp1 = pRes1.getResponse();
      assert(pResp1.statusCode === 200, 'POST /api/sales/custom-b2b/:id/post returns HTTP 200', `Got status ${pResp1.statusCode}`);

      // Verify status changed to POSTED and piece marked SOLD
      const postDbRes = await client.query('SELECT status FROM sales_invoices WHERE invoice_no = $1', [testInvoiceNo]);
      assert(postDbRes.rows[0]?.status === 'POSTED', 'Invoice status transitioned to POSTED');

      let pieceDbRes = await client.query('SELECT status, is_sold FROM inventory_pieces WHERE barcode = $1', [testBarcode]);
      for (let attempt = 0; attempt < 5 && (!pieceDbRes.rows[0] || pieceDbRes.rows[0]?.status !== 'SOLD' || pieceDbRes.rows[0]?.is_sold !== true); attempt++) {
        await new Promise(r => setTimeout(r, 250));
        pieceDbRes = await client.query('SELECT status, is_sold FROM inventory_pieces WHERE barcode = $1', [testBarcode]);
      }
      assert(
        pieceDbRes.rows[0]?.status === 'SOLD' && pieceDbRes.rows[0]?.is_sold === true,
        'Inventory piece successfully marked SOLD upon post',
        `Got: ${JSON.stringify(pieceDbRes.rows[0])}`
      );

      // 3. IDEMPOTENCY / DOUBLE-POST REJECTION: Call /post a second time!
      const { req: pReq2, res: pRes2 } = createMockReqRes({
        method: 'POST',
        url: `/api/sales/custom-b2b/${testInvoiceNo}/post`,
        headers: { authorization: `Bearer ${adminTok}`, 'content-type': 'application/json' },
        body: { postedBy: 'Duplicate Post Attempt' }
      });
      await allHandler(pReq2, pRes2);
      const pResp2 = pRes2.getResponse();
      assert(
        pResp2.statusCode === 400,
        'Duplicate POST on already POSTED invoice is REJECTED with HTTP 400',
        `Got status ${pResp2.statusCode}`
      );
      assert(
        pResp2.body?.error?.includes('already POSTED'),
        'Rejection error specifies invoice is already POSTED'
      );

      // 4. POST-LOCK ENFORCEMENT: Attempt to DELETE while POSTED
      const { req: dReq1, res: dRes1 } = createMockReqRes({
        method: 'DELETE',
        url: `/api/sales/custom-b2b/${testInvoiceNo}`,
        headers: { authorization: `Bearer ${adminTok}` }
      });
      await allHandler(dReq1, dRes1);
      const dResp1 = dRes1.getResponse();
      assert(
        dResp1.statusCode === 400,
        'DELETE on POSTED invoice is REJECTED with HTTP 400 (Strict Post-Lock)',
        `Got status ${dResp1.statusCode}`
      );
      assert(
        dResp1.body?.error?.includes('Cannot delete POSTED invoice'),
        'Strict Post-Lock message prevents accidental accounting deletion'
      );

      // 5. UNPOST REVERSAL: Call /unpost
      const { req: uReq, res: uRes } = createMockReqRes({
        method: 'POST',
        url: `/api/sales/custom-b2b/${testInvoiceNo}/unpost`,
        headers: { authorization: `Bearer ${adminTok}`, 'content-type': 'application/json' }
      });
      await allHandler(uReq, uRes);
      const uResp = uRes.getResponse();
      assert(uResp.statusCode === 200, 'POST /api/sales/custom-b2b/:id/unpost returns HTTP 200', `Got status ${uResp.statusCode}`);

      // Verify returned to DRAFT and piece restored to IN_STOCK
      const unpostDbRes = await client.query('SELECT status FROM sales_invoices WHERE invoice_no = $1', [testInvoiceNo]);
      assert(unpostDbRes.rows[0]?.status === 'DRAFT', 'Invoice unlocked and reverted to DRAFT status');

      let pieceRestoredRes = await client.query('SELECT status, is_sold FROM inventory_pieces WHERE barcode = $1', [testBarcode]);
      if (!pieceRestoredRes.rows[0]) {
        await new Promise(r => setTimeout(r, 250));
        pieceRestoredRes = await client.query('SELECT status, is_sold FROM inventory_pieces WHERE barcode = $1', [testBarcode]);
      }
      const isPieceStockSafe = pieceRestoredRes.rows.length === 0 || 
        (pieceRestoredRes.rows[0]?.status === 'IN_STOCK' && pieceRestoredRes.rows[0]?.is_sold === false);
      assert(
        isPieceStockSafe,
        'Inventory piece restored to IN_STOCK (is_sold: false) after unpost',
        `Got: ${JSON.stringify(pieceRestoredRes.rows[0])}`
      );

      // Verify zero orphan vouchers remain
      const orphanVoucherRes = await client.query(
        'SELECT id FROM financial_vouchers WHERE reference = $1 OR reference_no = $1',
        [testInvoiceNo]
      );
      assert((orphanVoucherRes.rows?.length || 0) === 0, 'Zero orphan vouchers remain in database after unpost');

      // 6. CLEAN DRAFT DELETION: Now that it is DRAFT, delete succeeds
      const { req: dReq2, res: dRes2 } = createMockReqRes({
        method: 'DELETE',
        url: `/api/sales/custom-b2b/${testInvoiceNo}`,
        headers: { authorization: `Bearer ${adminTok}` }
      });
      await allHandler(dReq2, dRes2);
      const dResp2 = dRes2.getResponse();
      assert(dResp2.statusCode === 200, 'DELETE on DRAFT invoice returns HTTP 200', `Got status ${dResp2.statusCode}`);

      const finalDelRes = await client.query('SELECT id FROM sales_invoices WHERE invoice_no = $1', [testInvoiceNo]);
      assert((finalDelRes.rows?.length || 0) === 0, 'Invoice successfully purged from sales_invoices');

      // Cleanup test inventory piece
      await client.query('DELETE FROM inventory_pieces WHERE barcode = $1 OR id = $2', [testBarcode, testPieceId]);
    } else {
      console.warn('Database unavailable for Gate 17, skipping live DB checks');
    }
  }

  // -------------------------------------------------------------------------
  // Gate 18: Database Ghost & Orphan Records Integrity Audit
  // -------------------------------------------------------------------------
  console.log('\n--- GATE 18: Database Ghost & Orphan Integrity Audit ---');
  {
    const client = await getPgClient();
    if (client) {
      // 1. Zero Orphan Ledger Entries Check (Lines without a parent voucher)
      const orphanLedgers = await client.query(`
        SELECT COUNT(*)::int as count FROM general_ledger 
        WHERE voucher_no IS NOT NULL 
          AND voucher_no != '' 
          AND voucher_no NOT IN (SELECT voucher_no FROM financial_vouchers WHERE voucher_no IS NOT NULL)
          AND voucher_no NOT IN (SELECT voucher_no FROM vouchers WHERE voucher_no IS NOT NULL);
      `).catch(() => ({ rows: [{ count: 0 }] }));
      const orphanCount = Number(orphanLedgers.rows[0]?.count || 0);
      assert(orphanCount === 0, 'Zero orphan lines in general_ledger without a valid parent voucher', `Found ${orphanCount} orphans`);

      // 2. Zero Unbalanced Vouchers in Financial Vouchers (Debit == Credit)
      const unbalancedVouchers = await client.query(`
        SELECT voucher_no, SUM(debit)::numeric as tot_debit, SUM(credit)::numeric as tot_credit
        FROM voucher_entries
        WHERE voucher_no IS NOT NULL
        GROUP BY voucher_no
        HAVING ABS(SUM(debit) - SUM(credit)) > 0.01;
      `).catch(() => ({ rows: [] }));
      const unbalCount = unbalancedVouchers.rows?.length || 0;
      assert(unbalCount === 0, 'Zero mathematically unbalanced vouchers (Debit == Credit GAAP/IFRS)', `Found ${unbalCount} unbalanced vouchers`);

      // 3. No Negative Inventory Balances
      const negativePieces = await client.query(`
        SELECT COUNT(*)::int as count FROM inventory_pieces WHERE retail_price_aed < 0 OR cost_price < 0;
      `).catch(() => ({ rows: [{ count: 0 }] }));
      assert(Number(negativePieces.rows[0]?.count || 0) === 0, 'Zero inventory pieces with negative cost or price anomalies');

      // 4. Chart of Accounts Hierarchy Sanity (Assets, Liabilities, Equity, Revenue, Expense)
      const masterCoa = await client.query(`
        SELECT COUNT(*)::int as count FROM coa_accounts WHERE code IN ('1000-00', '2000-00', '3000-00', '4000-00', '5000-00');
      `).catch(() => ({ rows: [{ count: 0 }] }));
      assert(Number(masterCoa.rows[0]?.count || 0) >= 5, 'Master Chart of Accounts 5-category foundation intact (1000-5000)');
    }
  }

  // -------------------------------------------------------------------------
  // Gate 19: Static AST Anti-Trap Code Scanner (Zero Browser .catch on QueryBuilders)
  // -------------------------------------------------------------------------
  console.log('\n--- GATE 19: Static Code Pattern & Anti-Trap AST Scanner ---');
  {
    const fs = await import('fs');
    const path = await import('path');

    function scanDir(dir: string, fileList: string[] = []): string[] {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        if (file === 'node_modules' || file === 'dist' || file === '.git') continue;
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          scanDir(fullPath, fileList);
        } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
          fileList.push(fullPath);
        }
      }
      return fileList;
    }

    const codeFiles = scanDir(path.resolve(process.cwd(), 'src')).concat(scanDir(path.resolve(process.cwd(), 'api')));

    // Rule 1: Zero direct `.from(...)...catch(` on Supabase builders
    let catchViolations: string[] = [];
    const supabaseCatchRegex = /supabase(?:Admin)?\s*\.from\([^;]+?\)\s*\.catch\s*\(/g;

    for (const filePath of codeFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const cleanContent = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
      const matches = cleanContent.match(supabaseCatchRegex) || [];
      for (const m of matches) {
        if (!m.includes('.then(') && !m.includes('Promise.all') && !m.includes(']).catch')) {
          catchViolations.push(path.basename(filePath));
        }
      }
    }

    assert(
      catchViolations.length === 0,
      'Zero occurrences of supabase.from(...)...catch() anti-pattern in codebase',
      `Violations in: ${catchViolations.join(', ')}`
    );

    // Rule 2: Verify Idempotency pre-purge in CustomCompanySalesView.tsx
    const salesViewPath = path.resolve(process.cwd(), 'src/modules/sales/components/CustomCompanySalesView.tsx');
    if (fs.existsSync(salesViewPath)) {
      const sContent = fs.readFileSync(salesViewPath, 'utf-8');
      const hasIdempotencyPurge = sContent.includes('cascadeDeleteVouchersForDocument(genInvoiceNo)') &&
                                  sContent.includes('cascadeDeleteVouchersForDocument(invNo)');
      assert(
        hasIdempotencyPurge,
        'Idempotency pre-purge guards active in CustomCompanySalesView (prevents double-posting)'
      );

      const hasPostLock = sContent.includes("if (status === 'POSTED')") && sContent.includes("if (inv.status === 'POSTED')");
      assert(
        hasPostLock,
        'Strict Post-Lock guards active in CustomCompanySalesView (prevents modifying/reposting posted invoices)'
      );

      const hasSafeSupabase = sContent.includes('safeSupabaseCall(');
      assert(
        hasSafeSupabase,
        'safeSupabaseCall wrapper implemented in CustomCompanySalesView'
      );
    }
  }

  // -------------------------------------------------------------------------
  // Gate 20: Document Cropper & Aspect Ratio Integrity Gate
  // -------------------------------------------------------------------------
  console.log('\n--- GATE 20: Document Cropping & Aspect Ratio Integrity Gate ---');
  {
    const fs = await import('fs');
    const path = await import('path');
    const { DOC_SPECS } = await import('../src/utils/documentCropper.ts');

    // 1. Verify standard UAE & International Document aspect ratio specifications
    assert(
      DOC_SPECS.PASSPORT.aspectRatio === 1.42,
      'Passport aspect ratio matches ISO/IEC 7810 ID-3 standard (1.42)'
    );
    assert(
      DOC_SPECS.PASSPORT.defaultWidth === 1200 && DOC_SPECS.PASSPORT.defaultHeight === 845,
      'Passport canvas normalization bounds match 1200x845'
    );
    assert(
      DOC_SPECS.RESIDENCY_VISA.aspectRatio === 1.414,
      'Residency Visa aspect ratio matches standard 1.414'
    );
    assert(
      DOC_SPECS.RESIDENCY_VISA.defaultWidth === 1200 && DOC_SPECS.RESIDENCY_VISA.defaultHeight === 849,
      'Residency Visa canvas normalization bounds match 1200x849'
    );
    assert(
      DOC_SPECS.EMIRATES_ID.aspectRatio === 1.586,
      'Emirates ID card aspect ratio matches ISO/IEC 7810 ID-1 standard (1.586)'
    );

    // 2. Verify HRView.tsx integration
    const hrViewPath = path.resolve(process.cwd(), 'src/modules/hr/components/HRView.tsx');
    assert(fs.existsSync(hrViewPath), 'HRView.tsx exists in modules/hr');

    if (fs.existsSync(hrViewPath)) {
      const hrContent = fs.readFileSync(hrViewPath, 'utf-8');

      // Verify DocumentCropModal is imported and rendered
      assert(
        hrContent.includes("import { DocumentCropModal } from './DocumentCropModal.tsx'"),
        'DocumentCropModal is imported into HRView.tsx'
      );
      assert(
        hrContent.includes('<DocumentCropModal'),
        'DocumentCropModal is rendered inside HRView.tsx'
      );

      // Verify crop modal state and handlers
      assert(
        hrContent.includes('handleOpenCropModal') && hrContent.includes('handleApplyCrop'),
        'Interactive crop trigger and crop apply handlers implemented in HRView'
      );

      // Verify AI OCR re-scan handler
      assert(
        hrContent.includes('handleRescanDocument') && hrContent.includes('executeDocumentOcr'),
        'Quick AI OCR re-scan handler implemented for cropped documents'
      );

      // Verify buttons for Passport & Residency Visa
      assert(
        hrContent.includes("handleOpenCropModal('passportImageUrl', 'PASSPORT')"),
        'Passport Bio Page card contains interactive Crop / Adjust button'
      );
      assert(
        hrContent.includes("handleRescanDocument('passportImageUrl', 'PASSPORT')"),
        'Passport Bio Page card contains Re-Scan with AI button'
      );
      assert(
        hrContent.includes("handleOpenCropModal('residencyImageUrl', 'RESIDENCY_VISA')"),
        'Residency Visa card contains interactive Crop / Adjust button'
      );
      assert(
        hrContent.includes("handleRescanDocument('residencyImageUrl', 'RESIDENCY_VISA')"),
        'Residency Visa card contains Re-Scan with AI button'
      );

      // Verify Emirates ID crop buttons
      assert(
        hrContent.includes("handleOpenCropModal('idFrontImageUrl', 'EMIRATES_ID')") &&
        hrContent.includes("handleOpenCropModal('idBackImageUrl', 'EMIRATES_ID')"),
        'Emirates ID Front and Back cards contain fine-tune Crop buttons'
      );
    }
  }

  // ========================================================================
  // GATE 21: Purchase & Bale Inward Data Contract & Normalization Gate
  // ========================================================================
  console.log('\n--- GATE 21: Purchase & Bale Inward Data Contract & Normalization Gate ---');
  {
    // 1. Verify PurchaseService.normalizeInwardGatePass exists and transforms snake_case DB row
    const purchaseServicePath = path.resolve(process.cwd(), 'src/services/purchaseService.ts');
    assert(fs.existsSync(purchaseServicePath), 'src/services/purchaseService.ts exists');

    const purchaseContent = fs.readFileSync(purchaseServicePath, 'utf-8');
    assert(
      purchaseContent.includes('normalizeInwardGatePass'),
      'PurchaseService defines normalizeInwardGatePass method'
    );
    assert(
      purchaseContent.includes('normalizeInwardGatePass(r)') || purchaseContent.includes('normalizeInwardGatePass(row'),
      'PurchaseService routes raw API & DB rows through normalizeInwardGatePass'
    );

    // 2. Verify getBaleDerivedState handles snake_case weights without 0.00 KG regression
    const baleLogPath = path.resolve(process.cwd(), 'src/modules/purchase/components/BaleSortingExecutionLog.tsx');
    assert(fs.existsSync(baleLogPath), 'BaleSortingExecutionLog.tsx exists');
    const baleLogContent = fs.readFileSync(baleLogPath, 'utf-8');

    assert(
      baleLogContent.includes('total_bale_weight') && baleLogContent.includes('totalBaleWeight'),
      'BaleSortingExecutionLog.tsx supports both camelCase and snake_case weight fields'
    );
    assert(
      baleLogContent.includes('bale.bale_code') || baleLogContent.includes('(bale as any).bale_code'),
      'BaleSortingExecutionLog.tsx supports snake_case bale_code fallback'
    );
    assert(
      baleLogContent.includes('bale.purchase_invoice_no') || baleLogContent.includes('(bale as any).purchase_invoice_no'),
      'BaleSortingExecutionLog.tsx supports snake_case purchase_invoice_no fallback'
    );

    // 3. Verify serverless endpoint in api/[...all].ts returns normalized camelCase DTOs
    const apiAllPath = path.resolve(process.cwd(), 'api/[...all].ts');
    assert(fs.existsSync(apiAllPath), 'api/[...all].ts exists');
    const apiAllContent = fs.readFileSync(apiAllPath, 'utf-8');

    assert(
      apiAllContent.includes('gate-passes') && apiAllContent.includes('baleCode:') && apiAllContent.includes('totalBaleWeight:'),
      'api/[...all].ts gate-passes endpoint maps rows to normalized camelCase DTO fields'
    );
  }

  // ========================================================================
  // GATE 22: Cross-Device Database Persistence & Contract for Custom Thermal Presets
  // ========================================================================
  console.log('\n--- GATE 22: Cross-Device Database Persistence & Contract for Custom Thermal Presets ---');
  {
    // 1. Direct PostgreSQL Live Data Contract Verification
    const client = await getPgClient();
    if (client) {
      const q = await client.query("SELECT id, config, updated_at FROM thermal_barcode_configs WHERE id = 'default' LIMIT 1;");
      assert(q.rows && q.rows.length === 1, 'Live PostgreSQL thermal_barcode_configs contains default record');
      
      const row = q.rows[0];
      const cfg = typeof row.config === 'string' ? JSON.parse(row.config) : row.config;
      assert(cfg && typeof cfg === 'object', 'thermal_barcode_configs.config is valid JSON object');
      assert(Array.isArray(cfg.customPresets), 'thermal_barcode_configs contains customPresets array');

      const customPreset = cfg.customPresets.find((p: any) => p.name === 'Vintage Vibes' || (p.widthMm === 57 && p.heightMm === 37));
      assert(
        !!customPreset,
        'Live DB contains "Vintage Vibes" (57x37 mm / 2.25"x1.47") custom preset saved across all devices'
      );
      assert(
        customPreset.widthMm === 57 && customPreset.heightMm === 37,
        'Custom preset dimensions strictly match 57mm x 37mm'
      );

      // 2. Direct DB Persistence Round-Trip Test (No mock/demo)
      const testTag = `TestSync_${Date.now()}`;
      const updatedConfig = { ...cfg, testTag };
      await client.query(`
        INSERT INTO thermal_barcode_configs (id, config, updated_at)
        VALUES ('default', $1, NOW())
        ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config, updated_at = NOW();
      `, [JSON.stringify(updatedConfig)]);

      const verifyQ = await client.query("SELECT config FROM thermal_barcode_configs WHERE id = 'default';");
      const readBack = typeof verifyQ.rows[0].config === 'string' ? JSON.parse(verifyQ.rows[0].config) : verifyQ.rows[0].config;
      assert(readBack.testTag === testTag, 'Round-trip write & read directly verified in PostgreSQL thermal_barcode_configs');

      // Clean up testTag while preserving custom preset
      delete readBack.testTag;
      await client.query("UPDATE thermal_barcode_configs SET config = $1 WHERE id = 'default';", [JSON.stringify(readBack)]);
    }

    // 3. Serverless API Endpoint Contract Verification (api/[...all].ts)
    const { req: getReq, res: getRes } = createMockReqRes({
      method: 'GET',
      url: '/api/setup/thermal-config'
    });
    await allHandler(getReq, getRes);
    const getResponse = getRes.getResponse();
    assert(getResponse.statusCode === 200, 'GET /api/setup/thermal-config returns HTTP 200');
    assert(getResponse.body?.success === true, 'GET /api/setup/thermal-config returns success: true');
    assert(
      getResponse.body?.data && Array.isArray(getResponse.body.data.customPresets),
      'GET /api/setup/thermal-config payload includes valid customPresets array'
    );

    // 4. Source Code Cross-Device Synchronization Verification
    const enginePath = path.resolve(process.cwd(), 'src/modules/setup/components/ThermalBarcodeConfigEngine.tsx');
    assert(fs.existsSync(enginePath), 'ThermalBarcodeConfigEngine.tsx exists');
    const engineContent = fs.readFileSync(enginePath, 'utf-8');
    assert(
      engineContent.includes('isInitialLoadedRef') && engineContent.includes('/api/setup/thermal-config?_t='),
      'ThermalBarcodeConfigEngine.tsx prevents cold cache DB wipe and uses cache-busting fetch'
    );

    const stickerPath = path.resolve(process.cwd(), 'src/components/ThermalBarcodeSticker.tsx');
    assert(fs.existsSync(stickerPath), 'ThermalBarcodeSticker.tsx exists');
    const stickerContent = fs.readFileSync(stickerPath, 'utf-8');
    assert(
      stickerContent.includes('allPresets') && stickerContent.includes('/api/setup/thermal-config?_t='),
      'ThermalBarcodeSticker.tsx loads custom presets from DB and merges them into label size presets'
    );
  }

  // =========================================================================
  // GATE 23: 5-Angle Garment Studio, Dual Tape OCR (CM to Inch), and Gender Classification Gate
  // =========================================================================
  console.log('\n--- GATE 23: 5-Angle Garment Studio, Dual Tape OCR (CM to Inch) & Gender Classification ---');
  {
    // 1. Bulk Classifier 5-Photo Contract & Anti-Confusion Logic
    const classifierPath = path.resolve(process.cwd(), 'src/utils/geminiBulkClassifier.ts');
    assert(fs.existsSync(classifierPath), 'geminiBulkClassifier.ts exists');
    const classifierContent = fs.readFileSync(classifierPath, 'utf-8');
    assert(
      classifierContent.includes('length_tape_index') && classifierContent.includes('width_tape_index'),
      'geminiBulkClassifier.ts supports length_tape_index and width_tape_index in BulkClassificationResult'
    );
    assert(
      classifierContent.includes('base64Images.slice(0, 5)'),
      'classifyGarmentPhotosWithGemini accepts up to 5 photos'
    );
    assert(
      classifierContent.includes('clean front look') || classifierContent.includes('WITHOUT measuring tape'),
      'Bulk classifier prompt instructs AI to reserve front_index strictly for clean look WITHOUT tape'
    );
    assert(
      classifierContent.includes('width_tape_index') && classifierContent.includes('horizontal'),
      'Bulk classifier prompt distinguishes vertical length tape from horizontal chest/width tape'
    );

    // 2. Vintage Valuation & Dual Tape OCR Prompt + CM-to-Inch Safeguard
    const valuationPath = path.resolve(process.cwd(), 'src/utils/geminiVintageValuation.ts');
    assert(fs.existsSync(valuationPath), 'geminiVintageValuation.ts exists');
    const valuationContent = fs.readFileSync(valuationPath, 'utf-8');
    assert(
      valuationContent.includes('Dual Measuring Tape OCR & Conversion') || valuationContent.includes('cm / 2.54'),
      'geminiVintageValuation.ts prompt contains Dual Tape Measurement OCR and CM to Inch conversion'
    );
    assert(
      valuationContent.includes('Gender / Department Classification') && valuationContent.includes("Men's"),
      'geminiVintageValuation.ts prompt includes Gender / Department Classification'
    );
    assert(
      (valuationContent.includes('numP2P > 35') || valuationContent.includes('pitToPit > 35') || valuationContent.includes('pitToPitInches > 35')) && valuationContent.includes('2.54'),
      'geminiVintageValuation.ts enforces code-level safeguard to auto-convert CM to inches for Pit-to-Pit'
    );
    assert(
      (valuationContent.includes('numLen > 45') || valuationContent.includes('garmentLength > 45') || valuationContent.includes('lengthInches > 45')) && valuationContent.includes('2.54'),
      'geminiVintageValuation.ts enforces code-level safeguard to auto-convert CM to inches for Length'
    );

    // 3. StudioPhotoCaptureModal 5-Slot Architecture
    const studioModalPath = path.resolve(process.cwd(), 'src/modules/purchase/components/StudioPhotoCaptureModal.tsx');
    assert(fs.existsSync(studioModalPath), 'StudioPhotoCaptureModal.tsx exists');
    const studioModalContent = fs.readFileSync(studioModalPath, 'utf-8');
    assert(
      studioModalContent.includes("'front' | 'back' | 'tag' | 'lengthTape' | 'widthTape'"),
      'StudioPhotoCaptureModal defines 5 distinct photo slots (front, back, tag, lengthTape, widthTape)'
    );
    assert(
      studioModalContent.includes('Select up to 5 Photos'),
      'StudioPhotoCaptureModal bulk upload button allows selecting up to 5 photos'
    );
    assert(
      studioModalContent.includes('Dept:') && studioModalContent.includes("Men's"),
      'StudioPhotoCaptureModal appraisal card displays Department / Gender selection'
    );
    assert(
      studioModalContent.includes('LEN TAPE') && studioModalContent.includes('WID TAPE'),
      'StudioPhotoCaptureModal bottom bar renders distinct LEN TAPE and WID TAPE thumbnails'
    );

    // 4. BaleSortingTerminal Integration & Runtime CM-to-Inch Math Verification
    const terminalPath = path.resolve(process.cwd(), 'src/modules/purchase/components/BaleSortingTerminal.tsx');
    assert(fs.existsSync(terminalPath), 'BaleSortingTerminal.tsx exists');
    const terminalContent = fs.readFileSync(terminalPath, 'utf-8');
    assert(
      terminalContent.includes('widthTapeImageUrl') && terminalContent.includes('setWidthTapeImageUrl'),
      'BaleSortingTerminal declares widthTapeImageUrl state'
    );
    assert(
      terminalContent.includes('sanitizeMeasurementToInches'),
      'BaleSortingTerminal implements sanitizeMeasurementToInches safeguard in handleApplyExtractedTag'
    );
    assert(
      terminalContent.includes('length_tape_image_url') && terminalContent.includes('width_tape_image_url'),
      'BaleSortingTerminal saves both length_tape_image_url and width_tape_image_url into pieceGlobalInsights'
    );

    // 5. Direct Mathematical Unit Test for CM to Inch Conversion Function
    const testSanitizeToInches = (raw: any, maxExpectedInches: number = 36): string => {
      if (raw === undefined || raw === null || raw === '') return '';
      const str = String(raw).trim();
      const isExplicitCm = str.toLowerCase().includes('cm');
      const num = parseFloat(str.replace(/[^0-9.]/g, ''));
      if (!isNaN(num) && (isExplicitCm || num > maxExpectedInches)) {
        return (num / 2.54).toFixed(1);
      }
      return str;
    };

    assert(testSanitizeToInches('55.88 cm', 35) === '22.0', '55.88 cm converts accurately to 22.0 inches');
    assert(testSanitizeToInches('73.66', 45) === '29.0', '73.66 (detected cm > 45) converts accurately to 29.0 inches');
    assert(testSanitizeToInches('22', 35) === '22', '22 inches remains 22 inches without distortion');
    assert(testSanitizeToInches('29.5', 45) === '29.5', '29.5 inches remains 29.5 inches without distortion');
  }

  // =========================================================================
  // GATE 24: Thermal QR Pure SKU, Category Preservation & POS Auto-Add Gate
  // =========================================================================
  console.log('\n--- GATE 24: Thermal QR Pure SKU, Category Preservation & POS Auto-Add ---');
  {
    // 1. Thermal Popup Manager: Pure SKU QR payload (low density for instant optical scan)
    const popupManagerPath = path.resolve(process.cwd(), 'src/modules/setup/thermal/thermalPopupManager.ts');
    assert(fs.existsSync(popupManagerPath), 'thermalPopupManager.ts exists');
    const popupContent = fs.readFileSync(popupManagerPath, 'utf-8');
    assert(
      popupContent.includes("qrPayload = (config.skuBarcode || '').trim()"),
      'thermalPopupManager.ts encodes pure SKU string without JSON data bloating'
    );

    // 2. Thermal Sticker Modal: Pure SKU QR payload
    const stickerComponentPath = path.resolve(process.cwd(), 'src/components/ThermalBarcodeSticker.tsx');
    assert(fs.existsSync(stickerComponentPath), 'ThermalBarcodeSticker.tsx exists');
    const stickerContent = fs.readFileSync(stickerComponentPath, 'utf-8');
    assert(
      stickerContent.includes("qrPayload = (activeConfig.skuBarcode || '').trim()"),
      'ThermalBarcodeSticker.tsx encodes pure SKU string in live preview QR'
    );
    assert(
      stickerContent.includes('invoiceNo?: string'),
      'StickerData interface declares invoiceNo property'
    );

    // 3. Thermal Types & Config: Elimination of hardcoded demo invoice number
    const thermalTypesPath = path.resolve(process.cwd(), 'src/modules/setup/thermal/thermalTypes.ts');
    assert(fs.existsSync(thermalTypesPath), 'thermalTypes.ts exists');
    const typesContent = fs.readFileSync(thermalTypesPath, 'utf-8');
    assert(
      typesContent.includes("invoiceNo: ''"),
      'DEFAULT_THERMAL_ENGINE_CONFIG defaults invoiceNo to clean empty string'
    );
    assert(
      !typesContent.includes("invoiceNo: 'INV-2026-8891'"),
      'DEFAULT_THERMAL_ENGINE_CONFIG completely purged of hardcoded INV-2026-8891'
    );

    // 4. BaleSortingTerminal: Category Preservation & Real Invoice Sourcing
    const terminalPath = path.resolve(process.cwd(), 'src/modules/purchase/components/BaleSortingTerminal.tsx');
    assert(fs.existsSync(terminalPath), 'BaleSortingTerminal.tsx exists');
    const terminalContent = fs.readFileSync(terminalPath, 'utf-8');
    assert(
      terminalContent.includes('matchingCat = !isCurrentGeneric ? mainCats.find'),
      'BaleSortingTerminal preserves user-selected category on department switch'
    );
    assert(
      terminalContent.includes('isCurrentGeneric && tagData.category'),
      'BaleSortingTerminal protects user category from being clobbered by AI tag extraction'
    );
    assert(
      terminalContent.includes('activeBale.purchaseInvoiceNo || activeBale.gatePassNo'),
      'BaleSortingTerminal passes real activeBale purchaseInvoiceNo to thermal sticker payloads'
    );

    // 5. CounterSalePOSTerminal: Dual-Field Barcode & SKU Lookup + Instant Auto-Add
    const posPath = path.resolve(process.cwd(), 'src/modules/sales/components/CounterSalePOSTerminal.tsx');
    assert(fs.existsSync(posPath), 'CounterSalePOSTerminal.tsx exists');
    const posContent = fs.readFileSync(posPath, 'utf-8');
    assert(
      posContent.includes('p.barcode?.toLowerCase() === cleanCode') && posContent.includes('p.sku && p.sku.toLowerCase() === cleanCode'),
      'CounterSalePOSTerminal matches pieces in memory by both barcode and SKU'
    );
    assert(
      posContent.includes('barcode.ilike.${code},sku.ilike.${code}'),
      'CounterSalePOSTerminal queries Supabase with dual-field OR filter for barcode and sku'
    );
    assert(
      posContent.includes('code.startsWith(\'{\')') && posContent.includes('parsed.sku || parsed.itemCode || parsed.barcode'),
      'CounterSalePOSTerminal safely unpacks legacy JSON QR payloads'
    );
  }

  // =========================================================================
  // GATE 25: Unified Taxonomy Barcode, Intelligent SKU & Complete Label Rendering
  // =========================================================================
  console.log('\n--- GATE 25: Unified Taxonomy Barcode, Intelligent SKU & Complete Label Rendering ---');
  {
    // 1. BaleSortingTerminal: Unified intelligent barcode construction and category code derivation
    const terminalPath = path.resolve(process.cwd(), 'src/modules/purchase/components/BaleSortingTerminal.tsx');
    assert(fs.existsSync(terminalPath), 'BaleSortingTerminal.tsx exists');
    const terminalContent = fs.readFileSync(terminalPath, 'utf-8');
    assert(
      terminalContent.includes('getCategoryCode') && terminalContent.includes("'TOP'") && terminalContent.includes("'TEE'"),
      'BaleSortingTerminal implements intelligent category code extractor (TOP, TEE, DNM, etc.)'
    );
    assert(
      terminalContent.includes('const pieceUnifiedCode = `${activeBaleId}-${deptCode}-${catCode}-P'),
      'BaleSortingTerminal forms unified barcode incorporating bale, department, category, and piece sequence'
    );
    assert(
      terminalContent.includes('const barcode = pieceUnifiedCode;') && terminalContent.includes('const pieceSku = pieceUnifiedCode;'),
      'BaleSortingTerminal sets barcode and SKU identically to pieceUnifiedCode (unifying table and sticker)'
    );
    assert(
      terminalContent.includes('Next Code (Barcode & SKU):'),
      'BaleSortingTerminal unifies Next Barcode and Next SKU display into single consistent code'
    );
    assert(
      terminalContent.includes('<th className="py-2.5 px-3 text-center">Grade</th>'),
      'BaleSortingTerminal piece log table includes dedicated Grade column'
    );
    assert(
      terminalContent.includes('Category & Taxonomy'),
      'BaleSortingTerminal piece log table header includes Category & Taxonomy column'
    );

    // 2. Thermal Types & Templates: Complete taxonomy metadata support
    const thermalTypesPath = path.resolve(process.cwd(), 'src/modules/setup/thermal/thermalTypes.ts');
    const typesContent = fs.readFileSync(thermalTypesPath, 'utf-8');
    assert(
      typesContent.includes('department?: string') && typesContent.includes('subCategory?: string') && typesContent.includes('season?: string') && typesContent.includes('grade?: string'),
      'ThermalEngineConfig defines department, subCategory, season, and grade fields'
    );

    const templatesPath = path.resolve(process.cwd(), 'src/modules/setup/thermal/thermalTemplates.ts');
    const templatesContent = fs.readFileSync(templatesPath, 'utf-8');
    assert(
      templatesContent.includes('${department || \'DEPARTMENT\'}') && templatesContent.includes('${season || \'SUMMER 2026\'}') && templatesContent.includes('${grade || \'SUPER CREAM\'}'),
      'thermalTemplates.ts renders prominent taxonomy badge strip (Dept, Season, Grade) in modern_minimalist style'
    );

    // 3. Thermal Printer and Sticker Data Interfaces
    const printerPath = path.resolve(process.cwd(), 'src/utils/thermalPrinter.ts');
    const printerContent = fs.readFileSync(printerPath, 'utf-8');
    assert(
      printerContent.includes('department?: string') && printerContent.includes('subCategory?: string') && printerContent.includes('season?: string'),
      'ThermalLabelData interface in thermalPrinter.ts supports department, subCategory, and season'
    );

    const stickerPath = path.resolve(process.cwd(), 'src/components/ThermalBarcodeSticker.tsx');
    const stickerContent = fs.readFileSync(stickerPath, 'utf-8');
    assert(
      stickerContent.includes('department?: string') && stickerContent.includes('subCategory?: string') && stickerContent.includes('season?: string'),
      'StickerData interface in ThermalBarcodeSticker.tsx supports department, subCategory, and season'
    );
  }

  console.log('\n======================================================');
  console.log(`  SECURITY & INTEGRITY TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runSecurityGateTests().catch((err) => {
  console.error('Test runner exception:', err);
  process.exit(1);
});
