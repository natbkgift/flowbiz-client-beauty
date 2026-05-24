const { AppError } = require('../../common/errors');
const { LEAD_STATUSES, LEAD_ACTIVE_STATUSES, LEAD_STAGES, LEAD_SOURCES, LEGACY_LEAD_STATUS_ALIASES } = require('./constants');

function asTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asNullableString(value) {
  const normalized = asTrimmedString(value);
  return normalized || null;
}

function asNullableInteger(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AppError(400, 'INVALID_PAYLOAD', `${fieldName} must be a positive integer.`);
  }

  return parsed;
}

function asNullableIsoDate(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new AppError(400, 'INVALID_PAYLOAD', `${fieldName} must be a valid date.`);
  }

  return date.toISOString();
}

function asNullableScore(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
    throw new AppError(400, 'INVALID_PAYLOAD', `${fieldName} must be an integer between 0 and 100.`);
  }

  return parsed;
}

function assertEnum(value, allowedValues, fieldName) {
  if (!allowedValues.includes(value)) {
    throw new AppError(400, 'INVALID_PAYLOAD', `${fieldName} must be one of: ${allowedValues.join(', ')}.`);
  }

  return value;
}

function normalizeLeadStatus(value) {
  const normalized = asTrimmedString(value);

  if (!normalized) {
    return normalized;
  }

  return LEGACY_LEAD_STATUS_ALIASES[normalized] || normalized;
}

function normalizeTagNames(tagNames) {
  if (tagNames === undefined) {
    return undefined;
  }

  if (!Array.isArray(tagNames)) {
    throw new AppError(400, 'INVALID_PAYLOAD', 'tagNames must be an array of strings.');
  }

  const names = Array.from(
    new Set(tagNames.map((tagName) => asTrimmedString(tagName)).filter((tagName) => tagName.length > 0))
  );

  return names;
}

function normalizeLeadName(payload, isUpdate) {
  const candidate = payload.fullName !== undefined ? payload.fullName : payload.name;

  if (isUpdate && candidate === undefined) {
    return undefined;
  }

  const fullName = asTrimmedString(candidate);

  if (!fullName) {
    throw new AppError(400, 'INVALID_PAYLOAD', 'name is required.');
  }

  return fullName;
}

function normalizeInterests(interests) {
  if (interests === undefined) {
    return undefined;
  }

  if (!Array.isArray(interests)) {
    throw new AppError(400, 'INVALID_PAYLOAD', 'interests must be an array.');
  }

  return interests.map((interest, index) => {
    if (!interest || typeof interest !== 'object') {
      throw new AppError(400, 'INVALID_PAYLOAD', `interests[${index}] must be an object.`);
    }

    const interestName = asTrimmedString(interest.interestName);

    if (!interestName) {
      throw new AppError(400, 'INVALID_PAYLOAD', `interests[${index}].interestName is required.`);
    }

    return {
      interestType: asNullableString(interest.interestType) || 'treatment',
      interestName,
      priority: asNullableInteger(interest.priority, `interests[${index}].priority`),
      budgetMin: asNullableInteger(interest.budgetMin, `interests[${index}].budgetMin`),
      budgetMax: asNullableInteger(interest.budgetMax, `interests[${index}].budgetMax`),
      urgency: asNullableString(interest.urgency)
    };
  });
}

function validateLeadPayload(payload, options = {}) {
  const isUpdate = options.partial === true;
  const normalized = {};

  const fullName = normalizeLeadName(payload, isUpdate);

  if (fullName !== undefined) {
    normalized.fullName = fullName;
  }

  if (!isUpdate || payload.source !== undefined) {
    normalized.source = assertEnum(asTrimmedString(payload.source || 'manual') || 'manual', LEAD_SOURCES, 'source');
  }

  if (!isUpdate || payload.status !== undefined) {
    normalized.status = assertEnum(normalizeLeadStatus(payload.status || 'new') || 'new', LEAD_ACTIVE_STATUSES, 'status');
  }

  if (!isUpdate || payload.stage !== undefined) {
    normalized.stage = assertEnum(asTrimmedString(payload.stage || 'inquiry') || 'inquiry', LEAD_STAGES, 'stage');
  }

  const simpleStringFields = [
    ['sourceRef', 'sourceRef'],
    ['nickname', 'nickname'],
    ['phone', 'phone'],
    ['lineUserId', 'lineUserId'],
    ['email', 'email'],
    ['gender', 'gender'],
    ['budgetRange', 'budgetRange'],
    ['preferredBranch', 'preferredBranch'],
    ['notesSummary', 'notesSummary']
  ];

  for (const [inputKey, outputKey] of simpleStringFields) {
    if (!isUpdate || payload[inputKey] !== undefined) {
      normalized[outputKey] = asNullableString(payload[inputKey]);
    }
  }

  if (!isUpdate || payload.birthDate !== undefined) {
    normalized.birthDate = asNullableIsoDate(payload.birthDate, 'birthDate');
  }

  if (!isUpdate || payload.lastContactedAt !== undefined) {
    normalized.lastContactedAt = asNullableIsoDate(payload.lastContactedAt, 'lastContactedAt');
  }

  if (!isUpdate || payload.nextFollowupAt !== undefined) {
    normalized.nextFollowupAt = asNullableIsoDate(payload.nextFollowupAt, 'nextFollowupAt');
  }

  const intentScoreInput = payload.intentScore !== undefined ? payload.intentScore : payload.intent_score;
  if (!isUpdate || intentScoreInput !== undefined) {
    normalized.intentScore = asNullableScore(intentScoreInput, payload.intentScore !== undefined ? 'intentScore' : 'intent_score');
  }

  const ownerUserIdInput = payload.ownerUserId !== undefined ? payload.ownerUserId : payload.owner_user_id;
  if (!isUpdate || ownerUserIdInput !== undefined) {
    normalized.ownerUserId = asNullableInteger(
      ownerUserIdInput,
      payload.ownerUserId !== undefined ? 'ownerUserId' : 'owner_user_id'
    );
  }

  const normalizedTagNames = normalizeTagNames(payload.tagNames);
  if (normalizedTagNames !== undefined) {
    normalized.tagNames = normalizedTagNames;
  } else if (payload.tags !== undefined) {
    normalized.tagNames = normalizeTagNames(payload.tags);
  }

  const normalizedInterests = normalizeInterests(payload.interests);
  if (normalizedInterests !== undefined) {
    normalized.interests = normalizedInterests;
  }

  if (payload.initialNote !== undefined) {
    normalized.initialNote = asNullableString(payload.initialNote);
  }

  return normalized;
}

function validateLeadNotePayload(payload) {
  const content = asTrimmedString(payload.content);

  if (!content) {
    throw new AppError(400, 'INVALID_PAYLOAD', 'content is required.');
  }

  return {
    content,
    noteType: asNullableString(payload.noteType) || 'general'
  };
}

function validateLeadOwnerPayload(payload) {
  const ownerUserId = asNullableInteger(
    payload.ownerUserId !== undefined ? payload.ownerUserId : payload.owner_user_id,
    payload.ownerUserId !== undefined ? 'ownerUserId' : 'owner_user_id'
  );

  if (!ownerUserId) {
    throw new AppError(400, 'INVALID_PAYLOAD', 'ownerUserId is required.');
  }

  return {
    ownerUserId
  };
}

function validateLeadStageStatusPayload(payload) {
  const status = assertEnum(normalizeLeadStatus(payload.status), LEAD_ACTIVE_STATUSES, 'status');
  const stage = assertEnum(asTrimmedString(payload.stage), LEAD_STAGES, 'stage');

  return {
    status,
    stage,
    nextFollowupAt: asNullableIsoDate(payload.nextFollowupAt, 'nextFollowupAt'),
    lastContactedAt: asNullableIsoDate(payload.lastContactedAt, 'lastContactedAt')
  };
}

function validateLeadStageTransitionPayload(payload) {
  const stage = assertEnum(asTrimmedString(payload.stage), LEAD_STAGES, 'stage');

  return {
    stage,
    nextFollowupAt: asNullableIsoDate(payload.nextFollowupAt, 'nextFollowupAt'),
    lastContactedAt: asNullableIsoDate(payload.lastContactedAt, 'lastContactedAt')
  };
}

function validateLeadTagPayload(payload) {
  const name = asTrimmedString(payload.name || payload.tagName);

  if (!name) {
    throw new AppError(400, 'INVALID_PAYLOAD', 'name is required.');
  }

  const color = asNullableString(payload.color) || '#C8B27D';

  return {
    name,
    color
  };
}

function parseLeadListFilters(searchParams) {
  const limit = Math.min(Number.parseInt(searchParams.get('limit') || '20', 10) || 20, 100);

  return {
    search: asNullableString(searchParams.get('search')),
    status: searchParams.get('status') ? assertEnum(normalizeLeadStatus(searchParams.get('status')), LEAD_ACTIVE_STATUSES, 'status') : null,
    stage: searchParams.get('stage') ? assertEnum(searchParams.get('stage'), LEAD_STAGES, 'stage') : null,
    ownerUserId: searchParams.get('ownerUserId') || searchParams.get('owner_user_id') || searchParams.get('owner')
      ? asNullableInteger(searchParams.get('ownerUserId') || searchParams.get('owner_user_id') || searchParams.get('owner'), 'owner_user_id')
      : null,
    tag: asNullableString(searchParams.get('tag')),
    createdFrom: searchParams.get('created_from') ? asNullableIsoDate(searchParams.get('created_from'), 'created_from') : null,
    createdTo: searchParams.get('created_to') ? asNullableIsoDate(searchParams.get('created_to'), 'created_to') : null,
    limit
  };
}

module.exports = {
  validateLeadPayload,
  validateLeadNotePayload,
  validateLeadTagPayload,
  validateLeadOwnerPayload,
  validateLeadStageStatusPayload,
  validateLeadStageTransitionPayload,
  parseLeadListFilters
};