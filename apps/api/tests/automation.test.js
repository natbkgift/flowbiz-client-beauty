const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateFlowPayload,
  validateStepPayload,
  validateEventPayload,
  parseExecutionFilters
} = require('../src/modules/automation/validation');
const { createDeterministicEventId } = require('../src/modules/automation/service');

test('validateFlowPayload normalizes a minimal flow payload', () => {
  const payload = validateFlowPayload({
    name: 'New Lead Welcome',
    flowType: 'lead_nurture',
    triggerType: 'event',
    entryRuleJson: { eventName: 'lead.created', entityType: 'lead' }
  });

  assert.equal(payload.name, 'New Lead Welcome');
  assert.equal(payload.status, 'draft');
  assert.equal(payload.version, 1);
});

test('validateStepPayload rejects invalid step types', () => {
  assert.throws(
    () => validateStepPayload({ stepOrder: 1, stepType: 'email_user', configJson: {} }),
    /stepType must be one of/
  );
});

test('validateEventPayload requires eventName and entityType', () => {
  assert.throws(
    () => validateEventPayload({ entityId: 1 }),
    /eventName and entityType are required/
  );
});

test('parseExecutionFilters normalizes execution query filters', () => {
  const filters = parseExecutionFilters(new URLSearchParams({ status: 'waiting', entityType: 'lead', entityId: '2', limit: '10' }));

  assert.equal(filters.status, 'waiting');
  assert.equal(filters.entityType, 'lead');
  assert.equal(filters.entityId, 2);
  assert.equal(filters.limit, 10);
});

test('createDeterministicEventId buckets the same event consistently', () => {
  const eventIdA = createDeterministicEventId({
    eventName: 'lead.created',
    entityType: 'lead',
    entityId: 24,
    occurredAt: '2026-03-16T09:02:00.000Z'
  });
  const eventIdB = createDeterministicEventId({
    eventName: 'lead.created',
    entityType: 'lead',
    entityId: 24,
    occurredAt: '2026-03-16T09:04:59.000Z'
  });

  assert.equal(eventIdA, eventIdB);
});