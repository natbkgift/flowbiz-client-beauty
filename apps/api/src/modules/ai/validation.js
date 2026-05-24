const { AppError } = require('../../common/errors');

function asPositiveInteger(value, fieldName) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AppError(400, 'INVALID_PAYLOAD', `${fieldName} must be a positive integer.`);
  }

  return parsed;
}

function validateEntityId(value, fieldName = 'id') {
  return asPositiveInteger(value, fieldName);
}

function asTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
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

function validateGenerateMessagePayload(payload) {
  return {
    leadId: validateEntityId(payload?.leadId, 'leadId'),
    tone: asTrimmedString(payload?.tone || 'friendly') || 'friendly',
    context: asOptionalObject(payload?.context, 'context')
  };
}

module.exports = {
  validateEntityId,
  validateGenerateMessagePayload
};
