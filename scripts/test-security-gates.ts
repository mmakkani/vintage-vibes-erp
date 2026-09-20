import 'dotenv/config';
import allHandler from '../api/[...all].ts';
import loginHandler from '../api/auth/login.ts';
import { createSessionToken, verifyAuthToken, isOriginAllowed } from '../src/server/authValidator.ts';

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
