const { AppError } = require('../../common/errors');

const TRACKED_ENTITY_TYPES = ['lead', 'message', 'flow'];
const TRACKED_OUTCOME_TYPES = ['sent', 'delivered', 'opened', 'replied', 'converted', 'ignored', 'lost'];

function asTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asPositiveInteger(value, fieldName, options = {}) {
  if (options.optional && (value === undefined || value === null || value === '')) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AppError(400, 'INVALID_PAYLOAD', `${fieldName} must be a positive integer.`);
  }

  return parsed;
}

function assertEnum(value, allowedValues, fieldName) {
  if (!allowedValues.includes(value)) {
    throw new AppError(400, 'INVALID_PAYLOAD', `${fieldName} must be one of: ${allowedValues.join(', ')}.`);
  }

  return value;
}

function asOptionalObject(value, fieldName) {
  if (value === undefined || value === null) {
    return {};
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new AppError(400, 'INVALID_PAYLOAD', `${fieldName} must be an object.`);
  }

  return value;
}

function validateOutcomeTrackingPayload(payload) {
  const entityType = assertEnum(
    asTrimmedString(payload?.entityType !== undefined ? payload.entityType : payload?.entity_type),
    TRACKED_ENTITY_TYPES,
    payload?.entityType !== undefined ? 'entityType' : 'entity_type'
  );
  const actionType = asTrimmedString(payload?.actionType !== undefined ? payload.actionType : payload?.action_type);
  const outcomeType = assertEnum(
    asTrimmedString(payload?.outcomeType !== undefined ? payload.outcomeType : payload?.outcome_type),
    TRACKED_OUTCOME_TYPES,
    payload?.outcomeType !== undefined ? 'outcomeType' : 'outcome_type'
  );

  if (!actionType) {
    throw new AppError(400, 'INVALID_PAYLOAD', 'actionType is required.');
  }

  return {
    entityType,
    entityId: asPositiveInteger(payload?.entityId !== undefined ? payload.entityId : payload?.entity_id, payload?.entityId !== undefined ? 'entityId' : 'entity_id'),
    actionType,
    outcomeType,
    metadata: asOptionalObject(payload?.metadata, 'metadata')
  };
}

function validatePerformanceEntityType(value) {
  if (value === undefined || value === null || value === '') {
    return 'lead';
  }

  return assertEnum(asTrimmedString(value), TRACKED_ENTITY_TYPES, 'entityType');
}

module.exports = {
  TRACKED_ENTITY_TYPES,
  TRACKED_OUTCOME_TYPES,
  validateOutcomeTrackingPayload,
  validatePerformanceEntityType
};