const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateLeadPayload,
  validateLeadStageStatusPayload,
  parseLeadListFilters
} = require('../src/modules/leads/validation');

test('validateLeadPayload normalizes a minimal create payload', () => {
  const payload = validateLeadPayload({ fullName: '  Jane Doe  ', source: 'manual', status: 'new', stage: 'inquiry' });

  assert.equal(payload.fullName, 'Jane Doe');
  assert.equal(payload.source, 'manual');
  assert.equal(payload.status, 'new');
  assert.equal(payload.stage, 'inquiry');
});

test('validateLeadStageStatusPayload rejects invalid statuses', () => {
  assert.throws(
    () => validateLeadStageStatusPayload({ status: 'pending', stage: 'inquiry' }),
    /status must be one of/
  );
});

test('parseLeadListFilters reads query filters deterministically', () => {
  const filters = parseLeadListFilters(
    new URLSearchParams({ search: 'jane', status: 'active', stage: 'qualified', ownerUserId: '2', limit: '10' })
  );

  assert.equal(filters.search, 'jane');
  assert.equal(filters.status, 'active');
  assert.equal(filters.stage, 'qualified');
  assert.equal(filters.ownerUserId, 2);
  assert.equal(filters.limit, 10);
});