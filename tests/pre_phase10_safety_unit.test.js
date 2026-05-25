const test = require('node:test');
const assert = require('node:assert/strict');

const { classifyMedicalSafety } = require('../apps/api/src/modules/ai-agent/medical-safety');
const { verifyWebhookSecret, getIntegrationStatus } = require('../apps/api/src/modules/integration-gateway/security');
const { getThaiErrorMessage } = require('../apps/api/src/common/user-messages');

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
