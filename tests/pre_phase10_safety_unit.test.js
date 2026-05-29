const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { classifyMedicalSafety } = require('../apps/api/src/modules/ai-agent/medical-safety');
const {
  verifyWebhookSecret,
  getIntegrationStatus,
  resetWebhookReplayCacheForTests
} = require('../apps/api/src/modules/integration-gateway/security');
const { getThaiErrorMessage } = require('../apps/api/src/common/user-messages');
const { THAI_ERROR_MESSAGES } = require('../apps/api/src/common/user-messages');
const { json, jsonError, noContent } = require('../apps/api/src/common/http');
const { matchPath } = require('../apps/api/src/common/routing');
const { loadConfig } = require('../apps/api/src/config');
const { resolvePublicClinicId } = require('../apps/api/src/modules/public-content/tenant');
const { handleAiAgentRoutes } = require('../apps/api/src/modules/ai-agent/routes');
const { canAccessExecutiveAnalytics } = require('../apps/api/src/modules/analytics/routes');

function createMockResponse() {
  return {
    statusCode: null,
    headers: null,
    body: '',
    writeHead(statusCode, headers = {}) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(body = '') {
      this.body = body;
    }
  };
}

test('pre phase 10 medical safety classifier forces HITL for sensitive patient text', () => {
  const result = classifyMedicalSafety('คนไข้ตั้งครรภ์และมีโรคประจำตัว ฉีดโบท็อกซ์ได้ไหม');

  assert.equal(result.requiresHitl, true);
  assert.equal(result.severity, 'high');
  assert.ok(result.matchedCategories.includes('pregnancy'));
  assert.ok(result.matchedCategories.includes('medical_condition'));
});

test('pre phase 10 medical safety classifier allows normal commercial inquiry', () => {
  const result = classifyMedicalSafety('สนใจราคาโปรแกรมเมโสหน้าใสค่ะ');

  assert.equal(result.requiresHitl, false);
  assert.equal(result.severity, 'low');
  assert.deepEqual(result.matchedCategories, []);
});

test('pre phase 10 webhook verifier rejects missing or invalid secrets and labels sandbox secrets', () => {
  const previousAppEnv = process.env.APP_ENV;

  try {
    process.env.APP_ENV = 'development';

    const missing = verifyWebhookSecret({ headers: {}, query: {} }, ['x-webhook-secret']);
    assert.equal(missing.ok, false);
    assert.equal(missing.reason, 'missing_secret');

    const invalid = verifyWebhookSecret({ headers: { 'x-webhook-secret': 'invalid-secret' }, query: {} }, ['x-webhook-secret']);
    assert.equal(invalid.ok, false);
    assert.equal(invalid.reason, 'invalid_secret');

    const sandbox = verifyWebhookSecret({ headers: { 'x-webhook-secret': 'mock-valid-signature' }, query: {} }, ['x-webhook-secret']);
    assert.equal(sandbox.ok, true);
    assert.equal(sandbox.integrationStatus, 'sandbox_secret');
    assert.equal(getIntegrationStatus('sha256=abc123'), 'live_signature_unverified');
  } finally {
    if (previousAppEnv === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = previousAppEnv;
  }
});

test('pre phase 10 webhook verifier validates HMAC signatures and blocks replay', () => {
  const previous = {
    appEnv: process.env.APP_ENV,
    signingSecret: process.env.FLOWBIZ_WEBHOOK_SIGNING_SECRET
  };

  try {
    resetWebhookReplayCacheForTests();
    process.env.APP_ENV = 'production';
    process.env.FLOWBIZ_WEBHOOK_SIGNING_SECRET = 'test-webhook-signing-secret';

    const rawBody = JSON.stringify({ event: 'lead.created', id: 123 });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = crypto
      .createHmac('sha256', process.env.FLOWBIZ_WEBHOOK_SIGNING_SECRET)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');
    const req = {
      rawBody,
      query: {},
      headers: {
        'x-webhook-signature': `sha256=${signature}`,
        'x-webhook-timestamp': timestamp
      }
    };

    const accepted = verifyWebhookSecret(req, ['x-webhook-signature']);
    assert.equal(accepted.ok, true);
    assert.equal(accepted.integrationStatus, 'live_signature_verified');

    const replayed = verifyWebhookSecret(req, ['x-webhook-signature']);
    assert.equal(replayed.ok, false);
    assert.equal(replayed.reason, 'replayed_signature');
  } finally {
    resetWebhookReplayCacheForTests();
    if (previous.appEnv === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = previous.appEnv;

    if (previous.signingSecret === undefined) delete process.env.FLOWBIZ_WEBHOOK_SIGNING_SECRET;
    else process.env.FLOWBIZ_WEBHOOK_SIGNING_SECRET = previous.signingSecret;
  }
});

test('pre phase 10 webhook verifier fails closed for arbitrary production shared secrets', () => {
  const previous = {
    appEnv: process.env.APP_ENV,
    sharedSecret: process.env.FLOWBIZ_WEBHOOK_SHARED_SECRET
  };

  try {
    process.env.APP_ENV = 'production';
    delete process.env.FLOWBIZ_WEBHOOK_SHARED_SECRET;

    const arbitrary = verifyWebhookSecret({ headers: { 'x-webhook-secret': 'anything-non-empty' }, query: {} }, ['x-webhook-secret']);
    assert.equal(arbitrary.ok, false);
    assert.equal(arbitrary.reason, 'missing_shared_secret');

    process.env.FLOWBIZ_WEBHOOK_SHARED_SECRET = 'configured-prod-secret';
    const wrong = verifyWebhookSecret({ headers: { 'x-webhook-secret': 'wrong-secret' }, query: {} }, ['x-webhook-secret']);
    assert.equal(wrong.ok, false);
    assert.equal(wrong.reason, 'invalid_secret');

    const accepted = verifyWebhookSecret({ headers: { 'x-webhook-secret': 'configured-prod-secret' }, query: {} }, ['x-webhook-secret']);
    assert.equal(accepted.ok, true);
    assert.equal(accepted.integrationStatus, 'live_shared_secret_verified');
  } finally {
    if (previous.appEnv === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = previous.appEnv;

    if (previous.sharedSecret === undefined) delete process.env.FLOWBIZ_WEBHOOK_SHARED_SECRET;
    else process.env.FLOWBIZ_WEBHOOK_SHARED_SECRET = previous.sharedSecret;
  }
});

test('pre phase 10 user-facing API error messages are Thai while codes remain stable', () => {
  assert.equal(getThaiErrorMessage('FORBIDDEN'), 'คุณไม่มีสิทธิ์ดำเนินการนี้');
  assert.equal(getThaiErrorMessage('PUBLIC_SIGNUP_DISABLED'), 'ยังไม่เปิดให้สมัครใช้งานสาธารณะ กรุณาติดต่อผู้ดูแลระบบ');
  assert.equal(getThaiErrorMessage('PUBLIC_CLINIC_REQUIRED'), 'กรุณาระบุคลินิกสำหรับหน้าเว็บสาธารณะ');
  assert.equal(getThaiErrorMessage('MEDICAL_SAFETY_REVIEW_REQUIRED'), 'เนื้อหานี้เกี่ยวข้องกับความปลอดภัยทางการแพทย์ ต้องให้เจ้าหน้าที่ตรวจสอบก่อนส่ง');
  assert.equal(getThaiErrorMessage('INVALID_WEBHOOK_SIGNATURE'), 'ลายเซ็นหรือ secret ของ webhook ไม่ถูกต้อง');
  assert.equal(getThaiErrorMessage('RATE_LIMIT_EXCEEDED'), 'มีคำขอเข้ามามากเกินไป กรุณารอสักครู่แล้วลองใหม่');
});

test('pre phase 10 every AppError code has a Thai user-facing message mapping', () => {
  const apiRoot = path.resolve(__dirname, '..', 'apps', 'api', 'src');
  const files = [];

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        files.push(fullPath);
      }
    }
  }

  walk(apiRoot);

  const codes = new Set();
  const appErrorRegex = /AppError\([^,\n]+,\s*['"]([A-Z0-9_]+)['"]/g;

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(appErrorRegex)) {
      codes.add(match[1]);
    }
  }

  const missing = [...codes].filter((code) => !THAI_ERROR_MESSAGES[code]).sort();
  assert.deepEqual(missing, []);
});

test('public content routes require explicit clinic context instead of defaulting tenants', async () => {
  assert.equal(await resolvePublicClinicId(new URL('http://localhost/blog/posts?clinicId=1001')), 1001);
  await assert.rejects(
    () => resolvePublicClinicId(new URL('http://localhost/blog/posts')),
    (error) => error.code === 'PUBLIC_CLINIC_REQUIRED'
  );
});

test('routing helper decodes Thai path params for public slugs', () => {
  const slug = 'สอบถามปัญหาผิวสิวอักเสบหลังทำเลเซอร์';
  const params = matchPath(`/forum/topics/${encodeURIComponent(slug)}`, '/forum/topics/:idOrSlug');

  assert.equal(params.idOrSlug, slug);
});

test('AI inbound test route is disabled in production runtime', async () => {
  const previousAppEnv = process.env.APP_ENV;

  try {
    process.env.APP_ENV = 'production';
    await assert.rejects(
      () => handleAiAgentRoutes(
        { method: 'POST' },
        {},
        new URL('http://localhost/ai-agent/inbound'),
        {
          authenticateRequest: async () => {
            throw new Error('authenticateRequest should not be called');
          },
          parseJsonBody: async () => ({}),
          json: () => true
        }
      ),
      (error) => error.code === 'NOT_FOUND'
    );
  } finally {
    if (previousAppEnv === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = previousAppEnv;
  }
});

test('executive analytics requires owner/admin/franchise scope and blocks viewer/operator', () => {
  const baseContext = {
    currentOrganization: { id: 2001 },
    currentMembership: {
      role: 'viewer',
      permissions: ['analytics.read']
    }
  };

  assert.equal(canAccessExecutiveAnalytics(baseContext, 2001, false), false);
  assert.equal(
    canAccessExecutiveAnalytics({ ...baseContext, currentMembership: { role: 'operator', permissions: ['analytics.read'] } }, 2001, false),
    false
  );
  assert.equal(
    canAccessExecutiveAnalytics({ ...baseContext, currentMembership: { role: 'admin', permissions: ['analytics.read'] } }, 2001, false),
    true
  );
  assert.equal(
    canAccessExecutiveAnalytics({ ...baseContext, currentMembership: { role: 'owner', permissions: ['analytics.read'] } }, 2001, false),
    true
  );
  assert.equal(
    canAccessExecutiveAnalytics(
      { ...baseContext, currentMembership: { role: 'viewer', permissions: ['analytics.read', 'analytics.executive'] } },
      2001,
      false
    ),
    true
  );
  assert.equal(canAccessExecutiveAnalytics(baseContext, 9999, false), false);
  assert.equal(canAccessExecutiveAnalytics(baseContext, 9999, true), true);
});

test('http response helpers return handled marker for modular route dispatch', () => {
  const jsonResponse = createMockResponse();
  const noContentResponse = createMockResponse();

  assert.equal(json(jsonResponse, 200, { ok: true }), true);
  assert.equal(jsonResponse.statusCode, 200);
  assert.equal(jsonResponse.headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(jsonResponse.headers['X-Frame-Options'], 'DENY');
  assert.equal(JSON.parse(jsonResponse.body).ok, true);

  assert.equal(noContent(noContentResponse), true);
  assert.equal(noContentResponse.statusCode, 204);
  assert.equal(noContentResponse.headers['X-Content-Type-Options'], 'nosniff');
});

test('http error helper keeps stable code and Thai user-facing message shape', () => {
  const response = createMockResponse();

  assert.equal(jsonError(response, 429, 'RATE_LIMIT_EXCEEDED', 'Rate limit exceeded.'), true);
  assert.equal(response.statusCode, 429);

  const body = JSON.parse(response.body);
  assert.equal(body.error.code, 'RATE_LIMIT_EXCEEDED');
  assert.equal(body.error.message, 'มีคำขอเข้ามามากเกินไป กรุณารอสักครู่แล้วลองใหม่');
  assert.equal(body.error.details, null);
});

test('production config refuses local default secrets and database url', () => {
  const previous = {
    appEnv: process.env.APP_ENV,
    authTokenSecret: process.env.AUTH_TOKEN_SECRET,
    inviteTokenSecret: process.env.INVITE_TOKEN_SECRET,
    databaseUrl: process.env.DATABASE_URL,
    publicSignupEnabled: process.env.PUBLIC_SIGNUP_ENABLED
  };

  try {
    process.env.APP_ENV = 'production';
    delete process.env.AUTH_TOKEN_SECRET;
    delete process.env.INVITE_TOKEN_SECRET;
    delete process.env.DATABASE_URL;
    delete process.env.PUBLIC_SIGNUP_ENABLED;

    assert.throws(() => loadConfig(), /AUTH_TOKEN_SECRET/);

    process.env.AUTH_TOKEN_SECRET = 'prod-auth-secret-for-test';
    process.env.INVITE_TOKEN_SECRET = 'prod-invite-secret-for-test';
    process.env.DATABASE_URL = 'postgresql://flowbiz_prod:secret@example.invalid:5432/flowbiz_prod';

    const config = loadConfig();
    assert.equal(config.appEnv, 'production');
    assert.equal(config.databaseUrl, process.env.DATABASE_URL);
    assert.equal(config.publicSignupEnabled, false);
  } finally {
    if (previous.appEnv === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = previous.appEnv;

    if (previous.authTokenSecret === undefined) delete process.env.AUTH_TOKEN_SECRET;
    else process.env.AUTH_TOKEN_SECRET = previous.authTokenSecret;

    if (previous.inviteTokenSecret === undefined) delete process.env.INVITE_TOKEN_SECRET;
    else process.env.INVITE_TOKEN_SECRET = previous.inviteTokenSecret;

    if (previous.databaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous.databaseUrl;

    if (previous.publicSignupEnabled === undefined) delete process.env.PUBLIC_SIGNUP_ENABLED;
    else process.env.PUBLIC_SIGNUP_ENABLED = previous.publicSignupEnabled;
  }
});
