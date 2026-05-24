const { AppError } = require('../../common/errors');
const { CHANNEL_TYPES } = require('../messaging/constants');

const CUSTOMER_STATUSES = ['active', 'inactive', 'vip', 'churn_risk'];

function asTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asNullableString(value) {
  const normalized = asTrimmedString(value);
  return normalized || null;
}

function asPositiveInteger(value, fieldName) {
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

function asStringArray(value, fieldName) {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new AppError(400, 'INVALID_PAYLOAD', `${fieldName} must be an array of strings.`);
  }

  return Array.from(new Set(value.map((item) => asTrimmedString(item)).filter((item) => item.length > 0)));
}

function asJsonObject(value, fieldName) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return {};
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new AppError(400, 'INVALID_PAYLOAD', `${fieldName} must be an object.`);
  }

  return value;
}

function validateCustomerPayload(payload, options = {}) {
  const isUpdate = options.partial === true;
  const normalized = {};

  if (!isUpdate || payload.fullName !== undefined) {
    const fullName = asTrimmedString(payload.fullName);

    if (!fullName) {
      throw new AppError(400, 'INVALID_PAYLOAD', 'fullName is required.');
    }

    normalized.fullName = fullName;
  }

  if (!isUpdate || payload.status !== undefined) {
    normalized.status = assertEnum(asTrimmedString(payload.status || 'active') || 'active', CUSTOMER_STATUSES, 'status');
  }

  if (!isUpdate || payload.phone !== undefined) {
    normalized.phone = asNullableString(payload.phone);
  }

  if (!isUpdate || payload.email !== undefined) {
    normalized.email = asNullableString(payload.email);
  }

  if (!isUpdate || payload.preferredChannel !== undefined) {
    normalized.preferredChannel = payload.preferredChannel
      ? assertEnum(asTrimmedString(payload.preferredChannel), CHANNEL_TYPES, 'preferredChannel')
      : null;
  }

  normalized.tags = asStringArray(payload.tags, 'tags');
  normalized.metaJson = asJsonObject(payload.metaJson, 'metaJson');

  return normalized;
}

function validateLeadConversionPayload(payload) {
  return {
    leadId: asPositiveInteger(payload.leadId, 'leadId')
  };
}

function validateCustomerNotePayload(payload) {
  const noteText = asTrimmedString(payload.noteText);

  if (!noteText) {
    throw new AppError(400, 'INVALID_PAYLOAD', 'noteText is required.');
  }

  return {
    noteText
  };
}

function parseCustomerListFilters(searchParams) {
  const status = searchParams.get('status');

  return {
    search: asNullableString(searchParams.get('search')),
    status: status ? assertEnum(status, CUSTOMER_STATUSES, 'status') : null,
    limit: Math.min(Number.parseInt(searchParams.get('limit') || '20', 10) || 20, 100)
  };
}

function validateTimelineQuery(searchParams) {
  const limitRaw = searchParams.get('limit');
  const limit = limitRaw ? asPositiveInteger(limitRaw, 'limit') : 100;

  return {
    limit: Math.min(limit, 200)
  };
}

module.exports = {
  CUSTOMER_STATUSES,
  validateCustomerPayload,
  validateLeadConversionPayload,
  validateCustomerNotePayload,
  parseCustomerListFilters,
  validateTimelineQuery
};