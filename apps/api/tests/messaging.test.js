const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateChannelPayload,
  validateContactIdentityPayload,
  validateTemplatePayload,
  validateManualMessagePayload,
  parseContactIdentityFilters
} = require('../src/modules/messaging/validation');

test('validateChannelPayload normalizes a channel payload', () => {
  const payload = validateChannelPayload({ channelType: 'line', name: 'Primary LINE', isPrimary: true });

  assert.equal(payload.channelType, 'line');
  assert.equal(payload.name, 'Primary LINE');
  assert.equal(payload.status, 'active');
  assert.equal(payload.isPrimary, true);
});

test('validateTemplatePayload rejects missing content', () => {
  assert.throws(
    () => validateTemplatePayload({ channelType: 'line', category: 'followup', name: 'Template', content: '   ' }),
    /content is required/
  );
});

test('validateManualMessagePayload requires content or templateId', () => {
  assert.throws(
    () => validateManualMessagePayload({ channelId: 1 }),
    /Either templateId or content is required/
  );
});

test('parseContactIdentityFilters requires entity filters', () => {
  assert.throws(
    () => parseContactIdentityFilters(new URLSearchParams()),
    /entityType and entityId are required/
  );
});

test('validateContactIdentityPayload allows customer identities in Sprint 6', () => {
  const payload = validateContactIdentityPayload({
    entityType: 'customer',
    entityId: 1,
    channelType: 'email',
    externalId: 'customer@example.com'
  });

  assert.equal(payload.entityType, 'customer');
  assert.equal(payload.entityId, 1);
});