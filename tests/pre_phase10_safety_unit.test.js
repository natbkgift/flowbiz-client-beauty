const test = require('node:test');
const assert = require('node:assert/strict');

const { classifyMedicalSafety } = require('../apps/api/src/modules/ai-agent/medical-safety');
const { verifyWebhookSecret, getIntegrationStatus } = require('../apps/api/src/modules/integration-gateway/security');
const { getThaiErrorMessage } = require('../apps/api/src/common/user-messages');
const { json, noContent } = require('../apps/api/src/common/http');
const { loadConfig } = require('../apps/api/src/config');

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
});

test('pre phase 10 user-facing API error messages are Thai while codes remain stable', () => {
  assert.equal(getThaiErrorMessage('FORBIDDEN'), 'คุณไม่มีสิทธิ์ดำเนินการนี้');
  assert.equal(getThaiErrorMessage('MEDICAL_SAFETY_REVIEW_REQUIRED'), 'เนื้อหานี้เกี่ยวข้องกับความปลอดภัยทางการแพทย์ ต้องให้เจ้าหน้าที่ตรวจสอบก่อนส่ง');
});

test('http response helpers return handled marker for modular route dispatch', () => {
  const jsonResponse = createMockResponse();
  const noContentResponse = createMockResponse();

  assert.equal(json(jsonResponse, 200, { ok: true }), true);
  assert.equal(jsonResponse.statusCode, 200);
  assert.equal(JSON.parse(jsonResponse.body).ok, true);

  assert.equal(noContent(noContentResponse), true);
  assert.equal(noContentResponse.statusCode, 204);
});

test('production config refuses local default secrets and database url', () => {
  const previous = {
    appEnv: process.env.APP_ENV,
    authTokenSecret: process.env.AUTH_TOKEN_SECRET,
    inviteTokenSecret: process.env.INVITE_TOKEN_SECRET,
    databaseUrl: process.env.DATABASE_URL
  };

  try {
    process.env.APP_ENV = 'production';
    delete process.env.AUTH_TOKEN_SECRET;
    delete process.env.INVITE_TOKEN_SECRET;
    delete process.env.DATABASE_URL;

    assert.throws(() => loadConfig(), /AUTH_TOKEN_SECRET/);

    process.env.AUTH_TOKEN_SECRET = 'prod-auth-secret-for-test';
    process.env.INVITE_TOKEN_SECRET = 'prod-invite-secret-for-test';
    process.env.DATABASE_URL = 'postgresql://flowbiz_prod:secret@example.invalid:5432/flowbiz_prod';

    const config = loadConfig();
    assert.equal(config.appEnv, 'production');
    assert.equal(config.databaseUrl, process.env.DATABASE_URL);
  } finally {
    if (previous.appEnv === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = previous.appEnv;

    if (previous.authTokenSecret === undefined) delete process.env.AUTH_TOKEN_SECRET;
    else process.env.AUTH_TOKEN_SECRET = previous.authTokenSecret;

    if (previous.inviteTokenSecret === undefined) delete process.env.INVITE_TOKEN_SECRET;
    else process.env.INVITE_TOKEN_SECRET = previous.inviteTokenSecret;

    if (previous.databaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous.databaseUrl;
  }
});
