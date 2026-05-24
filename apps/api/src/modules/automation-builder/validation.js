const { AppError } = require('../../common/errors');
const { AUTOMATION_FLOW_STATUSES, AUTOMATION_STEP_TYPES, TRIGGER_TYPES } = require('../automation/constants');

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

function asJsonObject(value, fieldName, options = {}) {
  if ((value === undefined || value === null) && options.optional) {
    return options.defaultValue !== undefined ? options.defaultValue : {};
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new AppError(400, 'INVALID_PAYLOAD', `${fieldName} must be an object.`);
  }

  return value;
}

function validateBuilderStepPayload(payload, options = {}) {
  const stepType = assertEnum(asTrimmedString(payload.stepType), AUTOMATION_STEP_TYPES, 'stepType');

  return {
    stepOrder: options.allowMissingStepOrder && (payload.stepOrder === undefined || payload.stepOrder === null)
      ? null
      : asPositiveInteger(payload.stepOrder, 'stepOrder'),
    stepType,
    delayMinutes: asPositiveInteger(payload.delayMinutes, 'delayMinutes', { optional: true }),
    configJson: asJsonObject(payload.configJson || {}, 'configJson')
  };
}

function validateBuilderFlowPayload(payload) {
  const name = asTrimmedString(payload.name);
  const flowType = asTrimmedString(payload.flowType);

  if (!name || !flowType) {
    throw new AppError(400, 'INVALID_PAYLOAD', 'name and flowType are required.');
  }

  const triggerType = assertEnum(asTrimmedString(payload.triggerType || 'event') || 'event', TRIGGER_TYPES, 'triggerType');
  const status = assertEnum(asTrimmedString(payload.status || 'draft') || 'draft', AUTOMATION_FLOW_STATUSES, 'status');
  const trigger = asJsonObject(payload.trigger || {}, 'trigger');
  const conditions = asJsonObject(payload.conditions || {}, 'conditions');
  const delays = Array.isArray(payload.delays) ? payload.delays : [];
  const stepsRaw = Array.isArray(payload.steps) ? payload.steps : [];

  if (triggerType === 'event') {
    const eventName = asTrimmedString(trigger.eventName);
    const entityType = asTrimmedString(trigger.entityType);

    if (!eventName || !entityType) {
      throw new AppError(400, 'INVALID_PAYLOAD', 'trigger.eventName and trigger.entityType are required for event flows.');
    }
  }

  return {
    name,
    flowType,
    triggerType,
    status,
    trigger,
    conditions,
    delays,
    steps: stepsRaw.map((step, index) => {
      const normalized = validateBuilderStepPayload(step, { allowMissingStepOrder: true });
      return {
        ...normalized,
        stepOrder: normalized.stepOrder || index + 1
      };
    })
  };
}

module.exports = {
  validateBuilderFlowPayload,
  validateBuilderStepPayload
};