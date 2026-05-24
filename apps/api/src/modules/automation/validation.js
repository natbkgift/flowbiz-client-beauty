const { AppError } = require('../../common/errors');
const {
  AUTOMATION_FLOW_STATUSES,
  AUTOMATION_EXECUTION_STATUSES,
  AUTOMATION_STEP_TYPES,
  AUTOMATION_TASK_STATUSES,
  REMINDER_STATUSES,
  TRIGGER_TYPES,
  AUTOMATION_TRIGGER_EVENTS,
  AUTOMATION_ACTION_TYPES
} = require('./constants');

function asTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asNullableString(value) {
  const normalized = asTrimmedString(value);
  return normalized || null;
}

function asNullableIsoDate(value, fieldName) {
  const normalized = asNullableString(value);

  if (!normalized) {
    return null;
  }

  const parsed = new Date(normalized);

  if (Number.isNaN(parsed.getTime())) {
    throw new AppError(400, 'INVALID_PAYLOAD', `${fieldName} must be a valid date.`);
  }

  return parsed.toISOString();
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

function asJsonObject(value, fieldName) {
  if (value === undefined || value === null) {
    return {};
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new AppError(400, 'INVALID_PAYLOAD', `${fieldName} must be an object.`);
  }

  return value;
}

function asOptionalPositiveInteger(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return asPositiveInteger(value, fieldName);
}

function validateConditionStep(step, index) {
  const field = asTrimmedString(step.field);
  const operator = asTrimmedString(step.operator);

  if (!field || !operator) {
    throw new AppError(400, 'INVALID_PAYLOAD', `definitionJson.steps[${index}] condition steps require field and operator.`);
  }

  return {
    stepOrder: index + 1,
    stepType: 'condition',
    delayMinutes: null,
    configJson: {
      field,
      operator,
      value: step.value
    }
  };
}

function validateActionStep(step, index) {
  const action = assertEnum(asTrimmedString(step.action), AUTOMATION_ACTION_TYPES, `definitionJson.steps[${index}].action`);
  return {
    stepOrder: index + 1,
    stepType: 'action',
    delayMinutes: null,
    configJson: {
      ...step,
      action
    }
  };
}

function validateDelayStep(step, index) {
  const minutes = asPositiveInteger(step.minutes || step.delayMinutes, `definitionJson.steps[${index}].minutes`);
  return {
    stepOrder: index + 1,
    stepType: 'delay',
    delayMinutes: minutes,
    configJson: {
      ...step,
      minutes,
      blocking: step.blocking !== false
    }
  };
}

function validateDefinitionStep(step, index) {
  const type = assertEnum(asTrimmedString(step.type), ['condition', 'action', 'delay'], `definitionJson.steps[${index}].type`);

  if (type === 'condition') {
    return validateConditionStep(step, index);
  }

  if (type === 'action') {
    return validateActionStep(step, index);
  }

  return validateDelayStep(step, index);
}

function assertNoInfiniteExecutionLoop(triggerEvent, steps) {
  const actions = steps
    .filter((step) => step.stepType === 'action')
    .map((step) => step.configJson.action);

  if (triggerEvent === 'lead.stage_changed' && actions.includes('change_stage')) {
    throw new AppError(400, 'INVALID_PAYLOAD', 'Flows triggered by lead.stage_changed cannot include change_stage actions.');
  }

  if (triggerEvent === 'lead.assigned' && actions.includes('assign_user')) {
    throw new AppError(400, 'INVALID_PAYLOAD', 'Flows triggered by lead.assigned cannot include assign_user actions.');
  }

  if (triggerEvent === 'lead.tag_added' && actions.includes('add_tag')) {
    throw new AppError(400, 'INVALID_PAYLOAD', 'Flows triggered by lead.tag_added cannot include add_tag actions.');
  }
}

function buildLegacyDefinitionJson(triggerEvent, entryRuleJson = {}, steps = []) {
  return {
    trigger: triggerEvent || entryRuleJson.eventName || null,
    entityType: entryRuleJson.entityType || 'lead',
    conditions: entryRuleJson.guardConditions || {},
    rateLimits: entryRuleJson.rateLimits || {},
    steps: steps.map((step) => {
      if (step.stepType === 'wait') {
        return {
          type: 'delay',
          minutes: step.delayMinutes || step.configJson?.delayMinutes || 1,
          blocking: step.configJson?.blocking !== false
        };
      }

      if (['send_message', 'create_task', 'assign_user', 'add_tag', 'remove_tag'].includes(step.stepType)) {
        return {
          type: 'action',
          action: step.stepType,
          ...step.configJson
        };
      }

      return {
        type: 'action',
        action: step.stepType,
        ...step.configJson
      };
    })
  };
}

function validateDefinitionJson(definitionJson, triggerEvent) {
  const normalizedDefinition = asJsonObject(definitionJson, 'definitionJson');
  const steps = Array.isArray(normalizedDefinition.steps) ? normalizedDefinition.steps : [];

  if (steps.length === 0) {
    throw new AppError(400, 'INVALID_PAYLOAD', 'definitionJson.steps must contain at least one step.');
  }

  if (steps.length > 25) {
    throw new AppError(400, 'INVALID_PAYLOAD', 'definitionJson.steps cannot exceed 25 steps.');
  }

  const normalizedSteps = steps.map((step, index) => validateDefinitionStep(step, index));
  assertNoInfiniteExecutionLoop(triggerEvent, normalizedSteps);

  return {
    trigger: triggerEvent,
    entityType: asTrimmedString(normalizedDefinition.entityType || 'lead') || 'lead',
    conditions: asJsonObject(normalizedDefinition.conditions || {}, 'definitionJson.conditions'),
    rateLimits: asJsonObject(normalizedDefinition.rateLimits || {}, 'definitionJson.rateLimits'),
    steps: normalizedSteps
  };
}

function validateFlowPayload(payload) {
  const name = asTrimmedString(payload.name);
  const flowType = asTrimmedString(payload.flowType || 'lifecycle');

  if (!name || !flowType) {
    throw new AppError(400, 'INVALID_PAYLOAD', 'name and flowType are required.');
  }

  const triggerEventInput = payload.triggerEvent || payload.trigger_event || payload.definitionJson?.trigger || payload.definition_json?.trigger;
  const hasNewShape = Boolean(triggerEventInput || payload.definitionJson || payload.definition_json || payload.workspaceId || payload.workspace_id);

  if (hasNewShape) {
    const triggerEvent = assertEnum(asTrimmedString(triggerEventInput), AUTOMATION_TRIGGER_EVENTS, 'triggerEvent');
    const definitionJson = validateDefinitionJson(payload.definitionJson || payload.definition_json, triggerEvent);

    return {
      name,
      flowType,
      triggerType: 'event',
      status: assertEnum(asTrimmedString(payload.status || 'draft') || 'draft', AUTOMATION_FLOW_STATUSES, 'status'),
      version: Math.max(Number.parseInt(payload.version || '1', 10) || 1, 1),
      workspaceId: asOptionalPositiveInteger(payload.workspaceId !== undefined ? payload.workspaceId : payload.workspace_id, payload.workspaceId !== undefined ? 'workspaceId' : 'workspace_id'),
      triggerEvent,
      definitionJson,
      entryRuleJson: {
        eventName: triggerEvent,
        entityType: definitionJson.entityType,
        guardConditions: definitionJson.conditions,
        rateLimits: definitionJson.rateLimits
      },
      steps: definitionJson.steps
    };
  }

  return {
    name,
    flowType,
    triggerType: assertEnum(asTrimmedString(payload.triggerType || 'event') || 'event', TRIGGER_TYPES, 'triggerType'),
    status: assertEnum(asTrimmedString(payload.status || 'draft') || 'draft', AUTOMATION_FLOW_STATUSES, 'status'),
    version: Math.max(Number.parseInt(payload.version || '1', 10) || 1, 1),
    workspaceId: asOptionalPositiveInteger(payload.workspaceId !== undefined ? payload.workspaceId : payload.workspace_id, payload.workspaceId !== undefined ? 'workspaceId' : 'workspace_id'),
    triggerEvent: asTrimmedString(payload.entryRuleJson?.eventName || payload.entry_rule_json?.eventName) || null,
    definitionJson: buildLegacyDefinitionJson(
      asTrimmedString(payload.entryRuleJson?.eventName || payload.entry_rule_json?.eventName) || null,
      payload.entryRuleJson || payload.entry_rule_json || {},
      []
    ),
    entryRuleJson: asJsonObject(payload.entryRuleJson || payload.entry_rule_json, 'entryRuleJson'),
    steps: []
  };
}

function validateStepPayload(payload) {
  return {
    stepOrder: asPositiveInteger(payload.stepOrder, 'stepOrder'),
    stepType: assertEnum(asTrimmedString(payload.stepType), AUTOMATION_STEP_TYPES, 'stepType'),
    delayMinutes: asPositiveInteger(payload.delayMinutes, 'delayMinutes', { optional: true }),
    configJson: asJsonObject(payload.configJson, 'configJson')
  };
}

function validateFlowStatusPayload(payload) {
  return {
    status: assertEnum(asTrimmedString(payload.status), AUTOMATION_FLOW_STATUSES, 'status')
  };
}

function validateEventPayload(payload) {
  const eventName = asTrimmedString(payload.eventName);
  const entityType = asTrimmedString(payload.entityType);

  if (!eventName || !entityType) {
    throw new AppError(400, 'INVALID_PAYLOAD', 'eventName and entityType are required.');
  }

  return {
    eventName,
    entityType,
    entityId: asPositiveInteger(payload.entityId, 'entityId'),
    eventId: asNullableString(payload.eventId),
    occurredAt: asNullableIsoDate(payload.occurredAt, 'occurredAt'),
    contextJson: asJsonObject(payload.contextJson, 'contextJson'),
    deferExecution: payload.deferExecution === true
  };
}

function parseExecutionFilters(searchParams) {
  return {
    status: searchParams.get('status')
      ? assertEnum(searchParams.get('status'), AUTOMATION_EXECUTION_STATUSES, 'status')
      : null,
    entityType: asNullableString(searchParams.get('entityType')),
    entityId: searchParams.get('entityId') ? asPositiveInteger(searchParams.get('entityId'), 'entityId') : null,
    limit: Math.min(Number.parseInt(searchParams.get('limit') || '20', 10) || 20, 100)
  };
}

function parseTaskFilters(searchParams) {
  return {
    status: searchParams.get('status')
      ? assertEnum(searchParams.get('status'), AUTOMATION_TASK_STATUSES, 'status')
      : null,
    limit: Math.min(Number.parseInt(searchParams.get('limit') || '20', 10) || 20, 100)
  };
}

function parseReminderFilters(searchParams) {
  return {
    status: searchParams.get('status')
      ? assertEnum(searchParams.get('status'), REMINDER_STATUSES, 'status')
      : null,
    limit: Math.min(Number.parseInt(searchParams.get('limit') || '20', 10) || 20, 100)
  };
}

module.exports = {
  validateDefinitionJson,
  validateFlowPayload,
  validateStepPayload,
  validateFlowStatusPayload,
  validateEventPayload,
  parseExecutionFilters,
  parseTaskFilters,
  parseReminderFilters
};