import 'dotenv/config';
import allHandler from '../api/[...all].ts';
import loginHandler from '../api/auth/login.ts';
import healthHandler from '../api/health.ts';
import { createSessionToken, verifyAuthToken, revokeSessionToken, isOriginAllowed } from '../src/server/authValidator.ts';
import { isAllowedApiDestination } from '../src/utils/fetchUtils.ts';

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

  console.log('\n======================================================');
  console.log(`  SECURITY TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runSecurityGateTests().catch((err) => {
  console.error('Test runner exception:', err);
  process.exit(1);
});
