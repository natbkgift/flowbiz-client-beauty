const { AppError } = require('../../common/errors');
const {
  CHANNEL_TYPES,
  CHANNEL_STATUSES,
  TEMPLATE_CATEGORIES,
  TEMPLATE_APPROVAL_STATUSES,
  OUTBOUND_MESSAGE_STATUSES,
  CONTACT_ENTITY_TYPES
} = require('./constants');

function asTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asNullableString(value) {
  const normalized = asTrimmedString(value);
  return normalized || null;
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

function asJsonObject(value, fieldName, options = {}) {
  if (value === undefined) {
    return options.optional ? undefined : {};
  }

  if (value === null) {
    return options.optional ? null : {};
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new AppError(400, 'INVALID_PAYLOAD', `${fieldName} must be an object.`);
  }

  return value;
}

function validateChannelPayload(payload) {
  const name = asTrimmedString(payload.name);

  if (!name) {
    throw new AppError(400, 'INVALID_PAYLOAD', 'name is required.');
  }

  return {
    channelType: assertEnum(asTrimmedString(payload.channelType), CHANNEL_TYPES, 'channelType'),
    name,
    status: assertEnum(asTrimmedString(payload.status || 'active') || 'active', CHANNEL_STATUSES, 'status'),
    isPrimary: payload.isPrimary === true,
    configJson: asJsonObject(payload.configJson, 'configJson', { optional: true }) || {}
  };
}

function validateContactIdentityPayload(payload) {
  const entityType = assertEnum(asTrimmedString(payload.entityType), CONTACT_ENTITY_TYPES, 'entityType');

  const externalId = asTrimmedString(payload.externalId);

  if (!externalId) {
    throw new AppError(400, 'INVALID_PAYLOAD', 'externalId is required.');
  }

  return {
    entityType,
    entityId: asPositiveInteger(payload.entityId, 'entityId'),
    channelType: assertEnum(asTrimmedString(payload.channelType), CHANNEL_TYPES, 'channelType'),
    externalId,
    displayName: asNullableString(payload.displayName),
    isPrimary: payload.isPrimary !== false
  };
}

function validateTemplatePayload(payload, options = {}) {
  const isUpdate = options.partial === true;
  const normalized = {};

  if (!isUpdate || payload.channelType !== undefined) {
    normalized.channelType = assertEnum(asTrimmedString(payload.channelType), CHANNEL_TYPES, 'channelType');
  }

  if (!isUpdate || payload.category !== undefined) {
    normalized.category = assertEnum(asTrimmedString(payload.category), TEMPLATE_CATEGORIES, 'category');
  }

  if (!isUpdate || payload.approvalStatus !== undefined) {
    normalized.approvalStatus = assertEnum(
      asTrimmedString(payload.approvalStatus || 'draft') || 'draft',
      TEMPLATE_APPROVAL_STATUSES,
      'approvalStatus'
    );
  }

  if (!isUpdate || payload.name !== undefined) {
    const name = asTrimmedString(payload.name);

    if (!name) {
      throw new AppError(400, 'INVALID_PAYLOAD', 'name is required.');
    }

    normalized.name = name;
  }

  if (!isUpdate || payload.content !== undefined) {
    const content = asTrimmedString(payload.content);

    if (!content) {
      throw new AppError(400, 'INVALID_PAYLOAD', 'content is required.');
    }

    normalized.content = content;
  }

  if (!isUpdate || payload.language !== undefined) {
    normalized.language = asNullableString(payload.language) || 'th';
  }

  if (!isUpdate || payload.variablesJson !== undefined) {
    normalized.variablesJson = asJsonObject(payload.variablesJson, 'variablesJson', { optional: true }) || {};
  }

  return normalized;
}

function validateManualMessagePayload(payload) {
  const templateId = payload.templateId !== undefined ? asPositiveInteger(payload.templateId, 'templateId', { optional: true }) : undefined;
  const rawContent = asNullableString(payload.content);

  if (!templateId && !rawContent) {
    throw new AppError(400, 'INVALID_PAYLOAD', 'Either templateId or content is required.');
  }

  return {
    channelId: asPositiveInteger(payload.channelId, 'channelId'),
    templateId,
    content: rawContent,
    variables: asJsonObject(payload.variables, 'variables', { optional: true }) || {},
    scheduledAt: payload.scheduledAt ? payload.scheduledAt : null
  };
}

function parseOutboundFilters(searchParams) {
  return {
    status: searchParams.get('status')
      ? assertEnum(searchParams.get('status'), OUTBOUND_MESSAGE_STATUSES, 'status')
      : null,
    entityId: searchParams.get('entityId') ? asPositiveInteger(searchParams.get('entityId'), 'entityId') : null,
    channelType: searchParams.get('channelType')
      ? assertEnum(searchParams.get('channelType'), CHANNEL_TYPES, 'channelType')
      : null,
    limit: Math.min(Number.parseInt(searchParams.get('limit') || '20', 10) || 20, 100)
  };
}

function parseContactIdentityFilters(searchParams) {
  const entityType = searchParams.get('entityType');
  const entityId = searchParams.get('entityId');

  if (!entityType || !entityId) {
    throw new AppError(400, 'INVALID_QUERY', 'entityType and entityId are required.');
  }

  return {
    entityType: assertEnum(entityType, CONTACT_ENTITY_TYPES, 'entityType'),
    entityId: asPositiveInteger(entityId, 'entityId')
  };
}

module.exports = {
  validateChannelPayload,
  validateContactIdentityPayload,
  validateTemplatePayload,
  validateManualMessagePayload,
  parseOutboundFilters,
  parseContactIdentityFilters
};