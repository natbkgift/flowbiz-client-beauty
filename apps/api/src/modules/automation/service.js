const { getPool } = require('../../db');
const { AppError } = require('../../common/errors');
const { getMembershipsByUserId, resolveMembership } = require('../tenancy/service');
const {
  validateFlowPayload,
  validateStepPayload,
  validateFlowStatusPayload,
  validateEventPayload,
  parseExecutionFilters,
  parseTaskFilters,
  parseReminderFilters
} = require('./validation');
const { sendLeadOutboundMessage } = require('../messaging/service');

async function publishAutomationEventSafe(input, message) {
  try {
    const { publishDomainEvent } = require('../event-bus/publisher');
    await publishDomainEvent(input);
  } catch (error) {
    console.error(message, error.message);
  }
}

function normalizeFlowStatus(status) {
  return status === 'disabled' ? 'paused' : status;
}

function normalizeExecutionStatus(status) {
  return status === 'waiting' ? 'retrying' : status;
}

async function ensureAutomationMembershipScope(client, clinicContext) {
  const clinicUserResult = await client.query(
    `
      select cu.organization_id, cu.workspace_id, cu.role_id, cu.role, c.name as clinic_name, c.slug as clinic_slug
      from clinic_users cu
      inner join clinics c on c.id = cu.clinic_id
      where cu.clinic_id = $1 and cu.user_id = $2 and cu.status = 'active'
      limit 1
    `,
    [clinicContext.currentClinic.id, clinicContext.currentUser.id]
  );

  if (clinicUserResult.rowCount === 0) {
    throw new AppError(403, 'WORKSPACE_SCOPE_REQUIRED', 'Automation actions require an active workspace membership.');
  }

  const clinicUser = clinicUserResult.rows[0];

  if (clinicUser.organization_id && clinicUser.workspace_id) {
    return {
      organizationId: clinicUser.organization_id,
      workspaceId: clinicUser.workspace_id
    };
  }

  const organizationResult = await client.query(
    `
      insert into organizations (clinic_id, name, slug, status)
      values ($1, $2, $3, 'active')
      on conflict (clinic_id)
      do update set name = excluded.name, updated_at = now()
      returning id
    `,
    [
      clinicContext.currentClinic.id,
      `${clinicUser.clinic_name} Organization`,
      `${clinicUser.clinic_slug}-organization-${clinicContext.currentClinic.id}`
    ]
  );

  const organizationId = organizationResult.rows[0].id;
  const workspaceResult = await client.query(
    `
      insert into workspaces (clinic_id, organization_id, name, slug, status)
      values ($1, $2, 'Main Workspace', 'main-workspace', 'active')
      on conflict (clinic_id, slug)
      do update set organization_id = excluded.organization_id, updated_at = now()
      returning id
    `,
    [clinicContext.currentClinic.id, organizationId]
  );
  const workspaceId = workspaceResult.rows[0].id;

  await client.query(
    `
      update clinic_users
      set organization_id = $3,
          workspace_id = $4,
          updated_at = now()
      where clinic_id = $1 and user_id = $2
    `,
    [clinicContext.currentClinic.id, clinicContext.currentUser.id, organizationId, workspaceId]
  );

  if (clinicUser.role_id) {
    const membershipResult = await client.query(
      `
        update workspace_memberships
        set organization_id = $2,
            role_id = $5,
            status = 'active',
            updated_at = now()
        where clinic_id = $1 and workspace_id = $3 and user_id = $4
        returning id
      `,
      [clinicContext.currentClinic.id, organizationId, workspaceId, clinicContext.currentUser.id, clinicUser.role_id]
    );

    if (membershipResult.rowCount === 0) {
      await client.query(
        `
          insert into workspace_memberships (
            clinic_id,
            organization_id,
            workspace_id,
            user_id,
            role_id,
            status,
            invited_by,
            invited_at,
            joined_at
          )
          values ($1, $2, $3, $4, $5, 'active', $4, now(), now())
        `,
        [clinicContext.currentClinic.id, organizationId, workspaceId, clinicContext.currentUser.id, clinicUser.role_id]
      );
    }
  }

  return {
    organizationId,
    workspaceId
  };
}

async function resolveAutomationScope(client, clinicContext) {
  if (!clinicContext?.currentClinic?.id || !clinicContext?.currentUser?.id) {
    throw new AppError(400, 'INVALID_CONTEXT', 'Automation actions require clinic and user context.');
  }

  if (clinicContext.currentWorkspace?.id && clinicContext.currentOrganization?.id) {
    return {
      clinicId: clinicContext.currentClinic.id,
      organizationId: clinicContext.currentOrganization.id,
      workspaceId: clinicContext.currentWorkspace.id
    };
  }

  const memberships = await getMembershipsByUserId(clinicContext.currentUser.id);
  const currentMembership = memberships.length > 0
    ? resolveMembership(memberships, { clinicId: clinicContext.currentClinic.id })
    : null;

  if (currentMembership?.workspaceId && currentMembership?.organizationId) {
    return {
      clinicId: clinicContext.currentClinic.id,
      organizationId: currentMembership.organizationId,
      workspaceId: currentMembership.workspaceId
    };
  }

  const ensuredScope = await ensureAutomationMembershipScope(client, clinicContext);

  return {
    clinicId: clinicContext.currentClinic.id,
    organizationId: ensuredScope.organizationId,
    workspaceId: ensuredScope.workspaceId
  };
}

async function resolveAutomationScopeOrClinic(client, scopeOrClinic) {
  if (typeof scopeOrClinic === 'number') {
    const workspaceResult = await client.query(
      `
        select w.id as workspace_id, w.organization_id
        from workspaces w
        where w.clinic_id = $1
        order by w.id asc
        limit 1
      `,
      [scopeOrClinic]
    );

    return {
      clinicId: scopeOrClinic,
      organizationId: workspaceResult.rows[0]?.organization_id || null,
      workspaceId: workspaceResult.rows[0]?.workspace_id || null
    };
  }

  return resolveAutomationScope(client, scopeOrClinic);
}

async function findFlowRow(client, scope, flowId) {
  const values = [scope.clinicId, flowId];
  const clauses = ['clinic_id = $1', 'id = $2'];

  if (scope.workspaceId) {
    values.push(scope.workspaceId);
    clauses.push(`workspace_id = $${values.length}`);
  }

  const result = await client.query(
    `
      select *
      from automation_flows
      where ${clauses.join(' and ')}
      limit 1
    `,
    values
  );

  if (result.rowCount === 0) {
    throw new AppError(404, 'FLOW_NOT_FOUND', 'Automation flow not found.');
  }

  return result.rows[0];
}

async function getFlowSteps(client, clinicId, flowId) {
  const result = await client.query(
    `
      select *
      from automation_steps
      where clinic_id = $1 and flow_id = $2
      order by step_order asc
    `,
    [clinicId, flowId]
  );

  return result.rows;
}

async function getLeadSnapshot(client, clinicId, leadId) {
  const result = await client.query(
    `
      select id, clinic_id, organization_id, workspace_id, full_name, intent_score, status, stage, owner_user_id, last_contacted_at, next_followup_at, created_at, updated_at
      from leads
      where clinic_id = $1 and id = $2
      limit 1
    `,
    [clinicId, leadId]
  );

  if (result.rowCount === 0) {
    throw new AppError(404, 'LEAD_NOT_FOUND', 'Lead not found for automation flow.');
  }

  return result.rows[0];
}

function getLeadValue(leadSnapshot, eventContext, fieldName) {
  if (eventContext && Object.prototype.hasOwnProperty.call(eventContext, fieldName)) {
    return eventContext[fieldName];
  }

  const snakeCaseField = fieldName.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  return leadSnapshot ? leadSnapshot[snakeCaseField] : null;
}

function matchesGuardConditions(leadSnapshot, eventContext, guardConditions = {}) {
  if (guardConditions.leadStatusEquals && getLeadValue(leadSnapshot, eventContext, 'status') !== guardConditions.leadStatusEquals) {
    return false;
  }

  if (guardConditions.statusEquals && getLeadValue(leadSnapshot, eventContext, 'status') !== guardConditions.statusEquals) {
    return false;
  }

  if (guardConditions.stageEquals && getLeadValue(leadSnapshot, eventContext, 'stage') !== guardConditions.stageEquals) {
    return false;
  }

  if (guardConditions.lastContactedAtIsNull === true && getLeadValue(leadSnapshot, eventContext, 'lastContactedAt') !== null) {
    return false;
  }

  if (Number.isInteger(guardConditions.lastContactedOlderThanDays)) {
    const lastContactedAt = getLeadValue(leadSnapshot, eventContext, 'lastContactedAt');

    if (!lastContactedAt) {
      return false;
    }

    const threshold = Date.now() - guardConditions.lastContactedOlderThanDays * 24 * 60 * 60 * 1000;

    if (new Date(lastContactedAt).getTime() > threshold) {
      return false;
    }
  }

  return true;
}

function resolveScheduledTimestamp(baseValue, offsetMinutes = 0) {
  if (!baseValue) {
    return null;
  }

  const baseDate = new Date(baseValue);

  if (Number.isNaN(baseDate.getTime())) {
    return null;
  }

  return new Date(baseDate.getTime() + offsetMinutes * 60 * 1000).toISOString();
}

function resolveConfiguredTimestamp(config, eventContext, propertyName) {
  if (config[propertyName]) {
    return config[propertyName];
  }

  const fromContextFieldName = `${propertyName}FromContextField`;
  const offsetFieldName = `${propertyName.replace('At', '')}OffsetMinutes`;

  if (config[fromContextFieldName] && eventContext && eventContext[config[fromContextFieldName]]) {
    return resolveScheduledTimestamp(eventContext[config[fromContextFieldName]], config[offsetFieldName] || 0);
  }

  return null;
}

async function resolveAssignedUserId(client, context, config) {
  if (config.assignedUserId) {
    return assertActiveClinicUser(client, context.currentClinic.id, config.assignedUserId);
  }

  if (config.assignedUserField === 'ownerUserId') {
    const ownerUserId = context.leadSnapshot ? context.leadSnapshot.owner_user_id : null;

    if (!ownerUserId) {
      throw new AppError(400, 'INVALID_TASK_ASSIGNEE', 'Lead owner is required for this notification flow.');
    }

    return assertActiveClinicUser(client, context.currentClinic.id, ownerUserId);
  }

  return assertActiveClinicUser(client, context.currentClinic.id, context.currentUser.id);
}

async function hasMessageRateLimitReached(client, context, limitPerDay) {
  if (context.entityType !== 'lead' || !limitPerDay || !context.currentFlow?.id) {
    return false;
  }

  const result = await client.query(
    `
      select count(*)::int as message_count
      from outbound_messages om
      inner join automation_executions ae on ae.id = om.automation_execution_id
      where om.clinic_id = $1
        and om.entity_type = 'lead'
        and om.entity_id = $2
        and ae.flow_id = $3
        and om.created_at >= date_trunc('day', now())
        and om.created_at < date_trunc('day', now()) + interval '1 day'
    `,
    [context.currentClinic.id, context.entityId, context.currentFlow.id]
  );

  const row = result.rows[0] || { message_count: 0 };
  return row.message_count >= limitPerDay;
}

function mapFlow(row) {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    workspaceId: row.workspace_id,
    name: row.name,
    flowType: row.flow_type,
    triggerType: row.trigger_type,
    triggerEvent: row.trigger_event || row.entry_rule_json?.eventName || null,
    status: normalizeFlowStatus(row.status),
    version: row.version,
    currentVersionId: row.current_version_id || null,
    isPublished: row.is_published === true,
    definitionJson: row.definition_json,
    entryRuleJson: row.entry_rule_json,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapExecution(row) {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    workspaceId: row.workspace_id,
    flowId: row.flow_id,
    flowName: row.flow_name,
    entityType: row.entity_type,
    entityId: row.entity_id,
    leadId: row.lead_id,
    triggerEvent: row.trigger_event,
    eventId: row.event_id,
    status: normalizeExecutionStatus(row.status),
    startedAt: row.started_at,
    completedAt: row.completed_at || row.finished_at,
    finishedAt: row.finished_at,
    errorMessage: row.error_message,
    retryCount: row.retry_count,
    lastStepOrder: row.last_step_order,
    contextJson: row.context_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapTask(row) {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    executionId: row.execution_id,
    assignedUserId: row.assigned_user_id,
    taskType: row.task_type,
    title: row.title,
    description: row.description,
    dueAt: row.due_at,
    status: row.status,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    nextRetryAt: row.next_retry_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapReminder(row) {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    executionId: row.execution_id,
    reminderType: row.reminder_type,
    title: row.title,
    dueAt: row.due_at,
    status: row.status,
    payloadJson: row.payload_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function createDeterministicEventId(eventPayload) {
  const eventTimestamp = eventPayload.occurredAt ? new Date(eventPayload.occurredAt).getTime() : Date.now();
  const bucket = Math.floor(eventTimestamp / (5 * 60 * 1000));
  return `${eventPayload.eventName}:${eventPayload.entityType}:${eventPayload.entityId}:${bucket}`;
}

async function insertExecutionLog(client, clinicId, executionId, stepOrder, stepType, status, detailJson) {
  const stepResult = await client.query(
    `
      select id
      from automation_steps
      where clinic_id = $1 and flow_id = (select flow_id from automation_executions where id = $2) and step_order = $3
      limit 1
    `,
    [clinicId, executionId, stepOrder]
  );

  await client.query(
    `
      insert into automation_execution_logs (clinic_id, execution_id, step_order, step_type, status, detail_json)
      values ($1, $2, $3, $4, $5, $6::jsonb)
    `,
    [clinicId, executionId, stepOrder, stepType, status, JSON.stringify(detailJson || {})]
  );

  if (stepResult.rowCount > 0) {
    await client.query(
      `
        insert into automation_step_executions (execution_id, step_id, status, result_json, started_at, completed_at)
        values ($1, $2, $3, $4::jsonb, now(), case when $3 in ('completed', 'failed', 'skipped', 'waiting', 'retrying') then now() else null end)
      `,
      [executionId, stepResult.rows[0].id, status, JSON.stringify(detailJson || {})]
    );
  }
}

async function assertActiveClinicUser(client, clinicId, userId) {
  const result = await client.query(
    `
      select u.id
      from clinic_users cu
      inner join users u on u.id = cu.user_id
      where cu.clinic_id = $1
        and cu.user_id = $2
        and cu.status = 'active'
        and u.status = 'active'
      limit 1
    `,
    [clinicId, userId]
  );

  if (result.rowCount === 0) {
    throw new AppError(400, 'INVALID_TASK_ASSIGNEE', 'assignedUserId must belong to the current clinic.');
  }

  return userId;
}

async function recordTaskRetry(client, context, executionId, step, error) {
  const config = step.config_json || {};
  const maxAttempts = Number.isInteger(config.maxAttempts) && config.maxAttempts > 0 ? config.maxAttempts : 3;
  const retryDelayMinutes = Number.isInteger(config.retryDelayMinutes) && config.retryDelayMinutes > 0 ? config.retryDelayMinutes : 15;
  const taskType = config.taskType || (step.step_type === 'notify_user' ? 'notify_user' : 'follow_up');
  const title = config.title || (step.step_type === 'notify_user' ? 'Automation notification' : 'Automation task');
  const description = config.description || error.message;
  const nextRetryAt = new Date(Date.now() + retryDelayMinutes * 60 * 1000).toISOString();

  const existingResult = await client.query(
    `
      select id, attempt_count, max_attempts
      from automation_tasks
      where clinic_id = $1 and execution_id = $2 and task_type = $3 and title = $4
      order by id desc
      limit 1
    `,
    [context.currentClinic.id, executionId, taskType, title]
  );

  let taskRow;

  if (existingResult.rowCount === 0) {
    const insertResult = await client.query(
      `
        insert into automation_tasks (
          clinic_id,
          execution_id,
          assigned_user_id,
          task_type,
          title,
          description,
          due_at,
          status,
          attempt_count,
          max_attempts,
          next_retry_at,
          last_error
        )
        values ($1, $2, null, $3, $4, $5, null, 'open', 1, $6, $7, $8)
        returning *
      `,
      [context.currentClinic.id, executionId, taskType, title, description, maxAttempts, nextRetryAt, error.message]
    );
    taskRow = insertResult.rows[0];
  } else {
    const updateResult = await client.query(
      `
        update automation_tasks
        set attempt_count = attempt_count + 1,
            max_attempts = $2,
            next_retry_at = $3,
            last_error = $4,
            updated_at = now()
        where id = $1
        returning *
      `,
      [existingResult.rows[0].id, maxAttempts, nextRetryAt, error.message]
    );
    taskRow = updateResult.rows[0];
  }

  if (taskRow.attempt_count < taskRow.max_attempts) {
    const { enqueueJob } = require('../worker-engine/scheduler');
    await enqueueJob(
      {
        clinicId: context.currentClinic.id,
        jobType: 'automation.execute',
        payloadJson: {
          executionId,
          actorUserId: context.currentUser?.id || null,
          workspaceId: context.currentFlow.workspace_id || context.currentWorkspace?.id || null
        },
        runAt: taskRow.next_retry_at,
        maxAttempts: 3
      },
      client
    );

    await insertExecutionLog(client, context.currentClinic.id, executionId, step.step_order, step.step_type, 'retry_scheduled', {
      taskId: taskRow.id,
      attemptCount: taskRow.attempt_count,
      maxAttempts: taskRow.max_attempts,
      nextRetryAt: taskRow.next_retry_at,
      lastError: taskRow.last_error
    });
    return 'retry-pending';
  }

  await client.query(
    `
      update automation_tasks
      set status = 'cancelled', next_retry_at = null, updated_at = now()
      where id = $1
    `,
    [taskRow.id]
  );

  throw new AppError(500, 'AUTOMATION_TASK_FAILED', error.message);
}

async function syncFlowSteps(client, clinicId, flowId, steps) {
  await client.query('delete from automation_steps where clinic_id = $1 and flow_id = $2', [clinicId, flowId]);

  for (const step of steps) {
    await client.query(
      `
        insert into automation_steps (clinic_id, flow_id, step_order, step_type, delay_minutes, config_json)
        values ($1, $2, $3, $4, $5, $6::jsonb)
      `,
      [clinicId, flowId, step.stepOrder, step.stepType, step.delayMinutes, JSON.stringify(step.configJson || {})]
    );
  }
}

function normalizeFlowStepsForStorage(steps = []) {
  return steps.map((step, index) => {
    if (step.stepType) {
      return {
        stepOrder: step.stepOrder || index + 1,
        stepType: step.stepType,
        delayMinutes: step.delayMinutes || null,
        configJson: step.configJson || {}
      };
    }

    if (step.type === 'condition') {
      return {
        stepOrder: index + 1,
        stepType: 'condition',
        delayMinutes: null,
        configJson: {
          field: step.field,
          operator: step.operator,
          value: step.value
        }
      };
    }

    if (step.type === 'action') {
      return {
        stepOrder: index + 1,
        stepType: 'action',
        delayMinutes: null,
        configJson: { ...step }
      };
    }

    if (step.type === 'delay') {
      return {
        stepOrder: index + 1,
        stepType: 'delay',
        delayMinutes: step.minutes,
        configJson: {
          minutes: step.minutes,
          blocking: step.blocking === undefined ? true : step.blocking
        }
      };
    }

    return {
      stepOrder: index + 1,
      stepType: 'action',
      delayMinutes: null,
      configJson: { ...step }
    };
  });
}

async function recordFlowAudit(client, scope, flowId, actionType, actorUserId) {
  const { recordAuditLog } = require('../audit/service');
  await recordAuditLog(
    {
      clinicId: scope.clinicId,
      entityType: 'automation_flow',
      entityId: flowId,
      actionType,
      actorUserId,
      contextJson: {
        clinic_id: scope.clinicId,
        workspace_id: scope.workspaceId,
        actor_user_id: actorUserId,
        flow_id: flowId,
        timestamp: new Date().toISOString()
      }
    },
    client
  );
}

async function getExecutionDetail(scopeOrClinic, executionId) {
  const client = getPool();
  const scope = await resolveAutomationScopeOrClinic(client, scopeOrClinic);
  const values = [scope.clinicId, executionId];
  const clauses = ['ae.clinic_id = $1', 'ae.id = $2'];

  if (scope.workspaceId) {
    values.push(scope.workspaceId);
    clauses.push(`ae.workspace_id = $${values.length}`);
  }

  const executionResult = await client.query(
    `
      select ae.*, af.name as flow_name
      from automation_executions ae
      inner join automation_flows af on af.id = ae.flow_id
      where ${clauses.join(' and ')}
      limit 1
    `,
    values
  );

  if (executionResult.rowCount === 0) {
    throw new AppError(404, 'EXECUTION_NOT_FOUND', 'Automation execution not found.');
  }

  const stepExecutionsResult = await client.query(
    `
      select ase.*, s.step_order, s.step_type, s.config_json
      from automation_step_executions ase
      inner join automation_steps s on s.id = ase.step_id
      where ase.execution_id = $1
      order by ase.id asc
    `,
    [executionId]
  );

  return {
    ...mapExecution(executionResult.rows[0]),
    stepExecutions: stepExecutionsResult.rows.map((row) => ({
      id: row.id,
      executionId: row.execution_id,
      stepId: row.step_id,
      stepOrder: row.step_order,
      stepType: row.step_type,
      status: row.status,
      resultJson: row.result_json,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      configJson: row.config_json,
      createdAt: row.created_at
    }))
  };
}

async function listFlows(scopeOrClinic) {
  const client = getPool();
  const scope = await resolveAutomationScopeOrClinic(client, scopeOrClinic);
  const values = [scope.clinicId];
  const clauses = ['clinic_id = $1'];

  if (scope.workspaceId) {
    values.push(scope.workspaceId);
    clauses.push(`workspace_id = $${values.length}`);
  }

  const result = await client.query(
    `
      select *
      from automation_flows
      where ${clauses.join(' and ')}
      order by id asc
    `,
    values
  );

  return {
    items: result.rows.map(mapFlow)
  };
}

async function getFlowDetail(scopeOrClinic, flowId) {
  const client = getPool();
  const scope = await resolveAutomationScopeOrClinic(client, scopeOrClinic);
  const flowRow = await findFlowRow(client, scope, flowId);
  const steps = await getFlowSteps(client, scope.clinicId, flowId);

  return {
    ...mapFlow(flowRow),
    steps: steps.map((step) => ({
      id: step.id,
      flowId: step.flow_id,
      stepOrder: step.step_order,
      stepType: step.step_type,
      delayMinutes: step.delay_minutes,
      configJson: step.config_json,
      createdAt: step.created_at,
      updatedAt: step.updated_at
    }))
  };
}

async function createFlow(clinicContext, payload) {
  const client = await getPool().connect();
  const normalized = validateFlowPayload(payload);

  try {
    await client.query('begin');
    const scope = await resolveAutomationScope(client, clinicContext);
    const result = await client.query(
      `
        insert into automation_flows (
          clinic_id,
          workspace_id,
          name,
          flow_type,
          trigger_type,
          trigger_event,
          status,
          version,
          definition_json,
          entry_rule_json,
          created_by
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11)
        returning *
      `,
      [
        scope.clinicId,
        normalized.workspaceId || scope.workspaceId,
        normalized.name,
        normalized.flowType,
        normalized.triggerType,
        normalized.triggerEvent,
        normalized.status,
        normalized.version,
        JSON.stringify(normalized.definitionJson),
        JSON.stringify(normalized.entryRuleJson),
        clinicContext.currentUser.id
      ]
    );

    const persistedSteps = normalizeFlowStepsForStorage(normalized.steps);

    if (persistedSteps.length > 0) {
      await syncFlowSteps(client, scope.clinicId, result.rows[0].id, persistedSteps);
    }

    const normalizedStatus = normalizeFlowStatus(result.rows[0].status);
    await recordFlowAudit(client, scope, result.rows[0].id, 'flow.created', clinicContext.currentUser.id);
    if (normalizedStatus === 'active') {
      await recordFlowAudit(client, scope, result.rows[0].id, 'flow.activated', clinicContext.currentUser.id);
    }
    if (normalizedStatus === 'paused') {
      await recordFlowAudit(client, scope, result.rows[0].id, 'flow.paused', clinicContext.currentUser.id);
    }

    await client.query('commit');
    return getFlowDetail(clinicContext, result.rows[0].id);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function addFlowStep(clinicContext, flowId, payload) {
  const normalized = validateStepPayload(payload);
  const client = getPool();
  const scope = await resolveAutomationScopeOrClinic(client, clinicContext);
  await findFlowRow(client, scope, flowId);

  const result = await client.query(
    `
      insert into automation_steps (clinic_id, flow_id, step_order, step_type, delay_minutes, config_json)
      values ($1, $2, $3, $4, $5, $6::jsonb)
      returning *
    `,
    [
      clinicContext.currentClinic.id,
      flowId,
      normalized.stepOrder,
      normalized.stepType,
      normalized.delayMinutes,
      JSON.stringify(normalized.configJson)
    ]
  );

  return {
    id: result.rows[0].id,
    clinicId: result.rows[0].clinic_id,
    flowId: result.rows[0].flow_id,
    stepOrder: result.rows[0].step_order,
    stepType: result.rows[0].step_type,
    delayMinutes: result.rows[0].delay_minutes,
    configJson: result.rows[0].config_json,
    createdAt: result.rows[0].created_at,
    updatedAt: result.rows[0].updated_at
  };
}

async function updateFlow(clinicContext, flowId, payload) {
  const client = await getPool().connect();
  const normalized = validateFlowPayload(payload);

  try {
    await client.query('begin');
    const scope = await resolveAutomationScope(client, clinicContext);
    await findFlowRow(client, scope, flowId);

    const result = await client.query(
      `
        update automation_flows
        set name = $4,
            flow_type = $5,
            trigger_type = $6,
            trigger_event = $7,
            status = $8,
            version = version + 1,
            definition_json = $9::jsonb,
            entry_rule_json = $10::jsonb,
            updated_at = now()
        where clinic_id = $1 and id = $2 and workspace_id = $3
        returning *
      `,
      [
        scope.clinicId,
        flowId,
        normalized.workspaceId || scope.workspaceId,
        normalized.name,
        normalized.flowType,
        normalized.triggerType,
        normalized.triggerEvent,
        normalized.status,
        JSON.stringify(normalized.definitionJson),
        JSON.stringify(normalized.entryRuleJson)
      ]
    );

    await syncFlowSteps(client, scope.clinicId, flowId, normalizeFlowStepsForStorage(normalized.steps));
    await recordFlowAudit(client, scope, flowId, 'flow.updated', clinicContext.currentUser.id);
    await client.query('commit');

    return getFlowDetail(clinicContext, flowId);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function updateFlowStatus(clinicContext, flowId, payload) {
  const client = await getPool().connect();
  const normalized = validateFlowStatusPayload(payload);

  try {
    await client.query('begin');
    const scope = await resolveAutomationScope(client, clinicContext);
    const result = await client.query(
      `
        update automation_flows
        set status = $4, updated_at = now()
        where clinic_id = $1 and id = $2 and workspace_id = $3
        returning *
      `,
      [scope.clinicId, flowId, scope.workspaceId, normalized.status]
    );

    if (result.rowCount === 0) {
      throw new AppError(404, 'FLOW_NOT_FOUND', 'Automation flow not found.');
    }

    const actionType = normalizeFlowStatus(normalized.status) === 'active'
      ? 'flow.activated'
      : normalizeFlowStatus(normalized.status) === 'paused'
        ? 'flow.paused'
        : normalizeFlowStatus(normalized.status) === 'archived'
          ? 'flow.deleted'
          : 'flow.updated';
    await recordFlowAudit(client, scope, flowId, actionType, clinicContext.currentUser.id);
    await client.query('commit');
    return mapFlow(result.rows[0]);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function ensureTag(client, clinicId, tagName) {
  const leadTagResult = await client.query(
    `
      insert into lead_tags (clinic_id, name, color)
      values ($1, $2, '#0F766E')
      on conflict (clinic_id, name)
      do update set color = excluded.color, updated_at = now()
      returning id
    `,
    [clinicId, tagName]
  );

  const result = await client.query(
    `
      insert into tags (clinic_id, name, color)
      values ($1, $2, '#0F766E')
      on conflict (clinic_id, name)
      do update set name = excluded.name
      returning id
    `,
    [clinicId, tagName]
  );

  return {
    legacyTagId: result.rows[0].id,
    leadTagId: leadTagResult.rows[0].id
  };
}

function evaluateConditionStep(context, config) {
  const leftValue = getLeadValue(context.leadSnapshot, context.eventContext, config.field);
  const rightValue = config.value;

  switch (config.operator) {
    case '>':
      return Number(leftValue) > Number(rightValue);
    case '>=':
      return Number(leftValue) >= Number(rightValue);
    case '<':
      return Number(leftValue) < Number(rightValue);
    case '<=':
      return Number(leftValue) <= Number(rightValue);
    case '=':
    case '==':
      return String(leftValue) === String(rightValue);
    case '!=':
      return String(leftValue) !== String(rightValue);
    case 'includes':
      return Array.isArray(leftValue) ? leftValue.includes(rightValue) : String(leftValue || '').includes(String(rightValue || ''));
    default:
      throw new AppError(400, 'INVALID_AUTOMATION_CONDITION', `Unsupported condition operator: ${config.operator}`);
  }
}

async function applyActionStep(client, context, step, executionId) {
  const config = step.config_json || {};
  const actionName = config.action;

  if (actionName === 'send_message') {
    return applyAutomationStep(client, context, { ...step, step_type: 'send_message', config_json: config }, executionId);
  }

  if (actionName === 'create_task') {
    return applyAutomationStep(client, context, { ...step, step_type: 'create_task', config_json: config }, executionId);
  }

  if (actionName === 'add_tag') {
    return applyAutomationStep(client, context, { ...step, step_type: 'add_tag', config_json: config }, executionId);
  }

  if (actionName === 'remove_tag') {
    return applyAutomationStep(client, context, { ...step, step_type: 'remove_tag', config_json: config }, executionId);
  }

  if (actionName === 'assign_user') {
    if (context.entityType !== 'lead') {
      throw new AppError(400, 'UNSUPPORTED_AUTOMATION_ENTITY', 'assign_user currently supports lead only.');
    }

    const assignedUserId = await resolveAssignedUserId(client, context, {
      assignedUserId: config.assignedUserId || config.userId,
      assignedUserField: config.assignedUserField || null
    });

    await client.query(
      `
        update leads
        set owner_user_id = $3,
            updated_at = now()
        where clinic_id = $1 and id = $2
      `,
      [context.currentClinic.id, context.entityId, assignedUserId]
    );
    await insertExecutionLog(client, context.currentClinic.id, executionId, step.step_order, step.step_type, 'completed', {
      action: actionName,
      assignedUserId
    });
    return 'completed';
  }

  throw new AppError(400, 'UNSUPPORTED_STEP', `Unsupported action step: ${actionName}`);
}

async function applyAutomationStep(client, context, step, executionId) {
  const config = step.config_json || {};
  const flowRateLimits = context.currentFlow?.entry_rule_json?.rateLimits || {};

  switch (step.step_type) {
    case 'condition': {
      const matches = evaluateConditionStep(context, config);
      await insertExecutionLog(client, context.currentClinic.id, executionId, step.step_order, step.step_type, matches ? 'completed' : 'skipped', {
        field: config.field,
        operator: config.operator,
        value: config.value,
        result: matches
      });
      return matches ? 'completed' : 'stopped';
    }
    case 'action': {
      return applyActionStep(client, context, step, executionId);
    }
    case 'delay': {
      const dueAt = new Date(Date.now() + (config.minutes || step.delay_minutes || 1) * 60 * 1000).toISOString();
      const { enqueueJob } = require('../worker-engine/scheduler');
      await enqueueJob(
        {
          clinicId: context.currentClinic.id,
          jobType: 'automation.execute',
          payloadJson: {
            executionId,
            actorUserId: context.currentUser?.id || null,
            workspaceId: context.currentFlow.workspace_id || context.currentWorkspace?.id || null
          },
          runAt: dueAt,
          maxAttempts: 3
        },
        client
      );
      await insertExecutionLog(client, context.currentClinic.id, executionId, step.step_order, step.step_type, 'waiting', {
        dueAt,
        minutes: config.minutes || step.delay_minutes || 1
      });
      return 'waiting';
    }
    case 'send_message': {
      if (context.entityType !== 'lead') {
        throw new AppError(400, 'UNSUPPORTED_AUTOMATION_ENTITY', 'send_message currently supports lead only.');
      }

      if (!matchesGuardConditions(context.leadSnapshot, context.eventContext, config.guardConditions || {})) {
        await insertExecutionLog(client, context.currentClinic.id, executionId, step.step_order, step.step_type, 'skipped_guard', {
          guardConditions: config.guardConditions || {}
        });
        break;
      }

      if (await hasMessageRateLimitReached(client, context, flowRateLimits.maxMessagesPerDayPerLead)) {
        await insertExecutionLog(client, context.currentClinic.id, executionId, step.step_order, step.step_type, 'skipped_rate_limit', {
          maxMessagesPerDayPerLead: flowRateLimits.maxMessagesPerDayPerLead
        });
        break;
      }

      const scheduledAt =
        resolveConfiguredTimestamp(config, context.eventContext, 'scheduledAt') ||
        (config.scheduledAfterMinutes ? new Date(Date.now() + config.scheduledAfterMinutes * 60 * 1000).toISOString() : null);

      let outbound;

      try {
        let content = config.content;

        if (!content && (config.aiGenerate === true || !config.templateId)) {
          const { generateLeadMessage } = require('../ai/service');
          const generated = await generateLeadMessage(
            {
              currentClinic: context.currentClinic,
              currentUser: context.currentUser,
              currentWorkspace: context.currentWorkspace
            },
            {
              leadId: context.entityId,
              tone: config.tone || 'friendly',
              context: {
                goal: config.goal || 'follow up lead',
                automationExecutionId: executionId
              }
            }
          );
          content = generated.messageText;
        }

        outbound = await sendLeadOutboundMessage(
          {
            currentClinic: context.currentClinic,
            currentUser: context.currentUser
          },
          context.entityId,
          {
            channelId: config.channelId,
            templateId: config.templateId,
            content,
            variables: config.variables || {},
            scheduledAt
          },
          { messageType: 'automation', executionId }
        );
      } catch (error) {
        if (error.code === 'RECIPIENT_NOT_FOUND') {
          await insertExecutionLog(client, context.currentClinic.id, executionId, step.step_order, step.step_type, 'skipped_no_recipient', {
            channelId: config.channelId,
            entityId: context.entityId
          });
          break;
        }

        throw error;
      }

      await insertExecutionLog(client, context.currentClinic.id, executionId, step.step_order, step.step_type, 'completed', {
        outboundMessageId: outbound.id
      });
      break;
    }
    case 'create_task': {
      try {
        if (!matchesGuardConditions(context.leadSnapshot, context.eventContext, config.guardConditions || {})) {
          await insertExecutionLog(client, context.currentClinic.id, executionId, step.step_order, step.step_type, 'skipped_guard', {
            guardConditions: config.guardConditions || {}
          });
          break;
        }

        const dueAt =
          resolveConfiguredTimestamp(config, context.eventContext, 'dueAt') ||
          (config.dueInMinutes ? new Date(Date.now() + config.dueInMinutes * 60 * 1000).toISOString() : null);
        const assignedUserId = await resolveAssignedUserId(client, context, config);

        const taskResult = await client.query(
          `
            insert into automation_tasks (
              clinic_id,
              execution_id,
              assigned_user_id,
              task_type,
              title,
              description,
              due_at,
              status,
              attempt_count,
              max_attempts,
              next_retry_at,
              last_error
            )
            values ($1, $2, $3, $4, $5, $6, $7, 'open', 0, $8, null, null)
            returning id
          `,
          [
            context.currentClinic.id,
            executionId,
            assignedUserId,
            config.taskType || 'follow_up',
            config.title || 'Automation task',
            config.description || null,
            dueAt,
            Number.isInteger(config.maxAttempts) && config.maxAttempts > 0 ? config.maxAttempts : 3
          ]
        );

        await insertExecutionLog(client, context.currentClinic.id, executionId, step.step_order, step.step_type, 'completed', {
          taskId: taskResult.rows[0].id
        });
      } catch (error) {
        return recordTaskRetry(client, context, executionId, step, error);
      }
      break;
    }
    case 'create_reminder': {
      if (!matchesGuardConditions(context.leadSnapshot, context.eventContext, config.guardConditions || {})) {
        await insertExecutionLog(client, context.currentClinic.id, executionId, step.step_order, step.step_type, 'skipped_guard', {
          guardConditions: config.guardConditions || {}
        });
        break;
      }

      const dueAt = config.dueAt
        ? config.dueAt
        : config.dueInMinutes
          ? new Date(Date.now() + config.dueInMinutes * 60 * 1000).toISOString()
          : null;
      const reminderResult = await client.query(
        `
          insert into reminders (
            clinic_id,
            entity_type,
            entity_id,
            execution_id,
            reminder_type,
            title,
            due_at,
            status,
            payload_json
          )
          values ($1, $2, $3, $4, $5, $6, $7, 'pending', $8::jsonb)
          returning id
        `,
        [
          context.currentClinic.id,
          context.entityType,
          context.entityId,
          executionId,
          config.reminderType || 'follow_up',
          config.title || 'Automation reminder',
          dueAt,
          JSON.stringify(config.payload || {})
        ]
      );

      await insertExecutionLog(client, context.currentClinic.id, executionId, step.step_order, step.step_type, 'completed', {
        reminderId: reminderResult.rows[0].id
      });
      break;
    }
    case 'add_tag': {
      if (context.entityType !== 'lead') {
        throw new AppError(400, 'UNSUPPORTED_AUTOMATION_ENTITY', 'add_tag currently supports lead only.');
      }

      const tagIds = await ensureTag(client, context.currentClinic.id, config.tagName || 'automation');
      await client.query(
        `
          insert into entity_tags (clinic_id, tag_id, entity_type, entity_id)
          values ($1, $2, 'lead', $3)
          on conflict (clinic_id, tag_id, entity_type, entity_id)
          do nothing
        `,
        [context.currentClinic.id, tagIds.legacyTagId, context.entityId]
      );
      await client.query(
        `
          insert into lead_tag_links (clinic_id, lead_id, tag_id)
          values ($1, $2, $3)
          on conflict (clinic_id, lead_id, tag_id)
          do nothing
        `,
        [context.currentClinic.id, context.entityId, tagIds.leadTagId]
      );
      await insertExecutionLog(client, context.currentClinic.id, executionId, step.step_order, step.step_type, 'completed', { tagId: tagIds.leadTagId });
      break;
    }
    case 'remove_tag': {
      if (context.entityType !== 'lead') {
        throw new AppError(400, 'UNSUPPORTED_AUTOMATION_ENTITY', 'remove_tag currently supports lead only.');
      }

      await client.query(
        `
          delete from entity_tags
          where clinic_id = $1
            and entity_type = 'lead'
            and entity_id = $2
            and tag_id in (
              select id from tags where clinic_id = $1 and name = $3
            )
        `,
        [context.currentClinic.id, context.entityId, config.tagName]
      );
      await client.query(
        `
          delete from lead_tag_links
          where clinic_id = $1
            and lead_id = $2
            and tag_id in (
              select id from lead_tags where clinic_id = $1 and name = $3
            )
        `,
        [context.currentClinic.id, context.entityId, config.tagName]
      );
      await insertExecutionLog(client, context.currentClinic.id, executionId, step.step_order, step.step_type, 'completed', {
        removedTagName: config.tagName
      });
      break;
    }
    case 'change_stage': {
      if (context.entityType !== 'lead') {
        throw new AppError(400, 'UNSUPPORTED_AUTOMATION_ENTITY', 'change_stage currently supports lead only.');
      }

      await client.query(
        `
          update leads
          set stage = coalesce($3, stage),
              status = coalesce($4, status),
              updated_at = now()
          where clinic_id = $1 and id = $2
        `,
        [context.currentClinic.id, context.entityId, config.stage || null, config.status || null]
      );
      await insertExecutionLog(client, context.currentClinic.id, executionId, step.step_order, step.step_type, 'completed', {
        stage: config.stage || null,
        status: config.status || null
      });
      break;
    }
    case 'notify_user': {
      try {
        if (!matchesGuardConditions(context.leadSnapshot, context.eventContext, config.guardConditions || {})) {
          await insertExecutionLog(client, context.currentClinic.id, executionId, step.step_order, step.step_type, 'skipped_guard', {
            guardConditions: config.guardConditions || {}
          });
          break;
        }

        const assignedUserId = await resolveAssignedUserId(client, context, config);
        const notifyResult = await client.query(
          `
            insert into automation_tasks (
              clinic_id,
              execution_id,
              assigned_user_id,
              task_type,
              title,
              description,
              due_at,
              status,
              attempt_count,
              max_attempts,
              next_retry_at,
              last_error
            )
            values ($1, $2, $3, 'notify_user', $4, $5, $6, 'open', 0, $7, null, null)
            returning id
          `,
          [
            context.currentClinic.id,
            executionId,
            assignedUserId,
            config.title || 'Automation notification',
            config.description || 'Automation generated notification',
            new Date().toISOString(),
            Number.isInteger(config.maxAttempts) && config.maxAttempts > 0 ? config.maxAttempts : 3
          ]
        );
        await insertExecutionLog(client, context.currentClinic.id, executionId, step.step_order, step.step_type, 'completed', {
          taskId: notifyResult.rows[0].id
        });
      } catch (error) {
        return recordTaskRetry(client, context, executionId, step, error);
      }
      break;
    }
    case 'wait': {
      const effectiveDelayMinutes = config.delayMinutes || step.delay_minutes;
      const dueAt = effectiveDelayMinutes
        ? new Date(Date.now() + effectiveDelayMinutes * 60 * 1000).toISOString()
        : new Date().toISOString();
      await client.query(
        `
          insert into reminders (
            clinic_id,
            entity_type,
            entity_id,
            execution_id,
            reminder_type,
            title,
            due_at,
            status,
            payload_json
          )
          values ($1, $2, $3, $4, 'automation_wait', $5, $6, 'pending', $7::jsonb)
        `,
        [
          context.currentClinic.id,
          context.entityType,
          context.entityId,
          executionId,
          config.title || 'Automation wait checkpoint',
          dueAt,
          JSON.stringify({ stepOrder: step.step_order })
        ]
      );
      const { enqueueJob } = require('../worker-engine/scheduler');
      await enqueueJob(
        {
          clinicId: context.currentClinic.id,
          jobType: 'automation.execute',
          payloadJson: {
            executionId,
            actorUserId: context.currentUser?.id || null,
            workspaceId: context.currentFlow.workspace_id || context.currentWorkspace?.id || null
          },
          runAt: dueAt,
          maxAttempts: 3
        },
        client
      );
      const waitStatus = config.blocking === false ? 'scheduled' : 'waiting';
      await insertExecutionLog(client, context.currentClinic.id, executionId, step.step_order, step.step_type, waitStatus, { dueAt });
      return config.blocking === false ? 'completed' : 'waiting';
    }
    default:
      throw new AppError(400, 'UNSUPPORTED_STEP', `Unsupported step type: ${step.step_type}`);
  }

  return 'completed';
}

async function runExecution(client, context, executionRow, steps) {
  await client.query(
    'update automation_executions set status = $2, started_at = now(), updated_at = now() where id = $1',
    [executionRow.id, 'running']
  );

  const stepsToRun = steps.filter((step) => {
    if (executionRow.status === 'waiting') {
      return step.step_order > (executionRow.last_step_order || 0);
    }
    if (executionRow.status === 'retrying') {
      return step.step_order >= (executionRow.last_step_order || 0);
    }

    return true;
  });

  for (const step of stepsToRun) {
    try {
      const stepResult = await applyAutomationStep(client, context, step, executionRow.id);
      await client.query(
        'update automation_executions set last_step_order = $2, updated_at = now() where id = $1',
        [executionRow.id, step.step_order]
      );

      try {
        const { publishDomainEvent } = require('../event-bus/publisher');
        publishDomainEvent({
          clinicId: context.currentClinic.id,
          eventType: 'automation.step_completed',
          entityType: context.entityType,
          entityId: context.entityId,
          payloadJson: {
            flowId: context.currentFlow.id,
            executionId: executionRow.id,
            stepOrder: step.step_order,
            stepType: step.step_type,
            actorUserId: context.currentUser?.id || null,
            workspaceId: context.currentFlow.workspace_id || context.currentWorkspace?.id || null
          }
        }).catch(() => {});
      } catch (error) {
        console.error('Event bus automation.step_completed publish failed:', error.message);
      }

      if (stepResult === 'stopped') {
        await client.query(
          `
            update automation_executions
            set status = 'completed', completed_at = now(), finished_at = now(), updated_at = now()
            where id = $1
          `,
          [executionRow.id]
        );
        return 'completed';
      }

      if (stepResult === 'waiting' || stepResult === 'retry-pending') {
        await client.query(
          `
            update automation_executions
            set status = $3, last_step_order = $2, updated_at = now()
            where id = $1
          `,
          [executionRow.id, step.step_order, stepResult === 'retry-pending' ? 'retrying' : 'waiting']
        );
        return stepResult === 'retry-pending' ? 'retrying' : 'waiting';
      }
    } catch (error) {
      await insertExecutionLog(client, context.currentClinic.id, executionRow.id, step.step_order, step.step_type, 'failed', {
        message: error.message
      });
      await client.query(
        `
          update automation_executions
          set status = 'failed', error_message = $3, completed_at = now(), finished_at = now(), last_step_order = $2, updated_at = now()
          where id = $1
        `,
        [executionRow.id, step.step_order, error.message]
      );
      throw error;
    }
  }

  await client.query(
    `
      update automation_executions
      set status = 'completed', completed_at = now(), finished_at = now(), error_message = null, updated_at = now()
      where id = $1
    `,
    [executionRow.id]
  );
  return 'completed';
}

async function executeExecutionById(clinicContext, executionId) {
  const client = await getPool().connect();

  try {
    await client.query('begin');
    const scope = await resolveAutomationScope(client, clinicContext);
    const executionResult = await client.query(
      `
        select ae.*, af.name as flow_name, af.entry_rule_json, af.id as resolved_flow_id
        from automation_executions ae
        inner join automation_flows af on af.id = ae.flow_id
        where ae.clinic_id = $1 and ae.id = $2 and ae.workspace_id = $3
        limit 1
      `,
      [scope.clinicId, executionId, scope.workspaceId]
    );

    if (executionResult.rowCount === 0) {
      throw new AppError(404, 'EXECUTION_NOT_FOUND', 'Automation execution not found.');
    }

    const executionRow = executionResult.rows[0];

    if (executionRow.status === 'completed' || executionRow.status === 'cancelled') {
      await client.query('commit');
      return mapExecution(executionRow);
    }

    const stepsResult = await client.query(
      'select * from automation_steps where clinic_id = $1 and flow_id = $2 order by step_order asc',
      [clinicContext.currentClinic.id, executionRow.flow_id]
    );

    const leadSnapshot = executionRow.entity_type === 'lead'
      ? await getLeadSnapshot(client, clinicContext.currentClinic.id, executionRow.entity_id)
      : null;

    try {
      const { publishDomainEvent } = require('../event-bus/publisher');
      publishDomainEvent({
        clinicId: scope.clinicId,
        eventType: 'automation.execution_started',
        entityType: executionRow.entity_type,
        entityId: executionRow.entity_id,
        payloadJson: {
          flowId: executionRow.flow_id,
          executionId,
          triggerEvent: executionRow.trigger_event,
          actorUserId: clinicContext.currentUser?.id || null,
          workspaceId: scope.workspaceId
        }
      }).catch(() => {});
    } catch (error) {
      console.error('Event bus automation.execution_started publish failed:', error.message);
    }

    const finalStatus = await runExecution(
      client,
      {
        currentClinic: clinicContext.currentClinic,
        currentUser: clinicContext.currentUser,
        currentWorkspace: clinicContext.currentWorkspace,
        currentFlow: {
          id: executionRow.flow_id,
          workspace_id: executionRow.workspace_id,
          entry_rule_json: executionRow.entry_rule_json,
          name: executionRow.flow_name
        },
        entityType: executionRow.entity_type,
        entityId: executionRow.entity_id,
        eventContext: executionRow.context_json || {},
        leadSnapshot
      },
      executionRow,
      stepsResult.rows
    );

    const refreshed = await client.query(
      `
        select ae.*, af.name as flow_name
        from automation_executions ae
        inner join automation_flows af on af.id = ae.flow_id
        where ae.id = $1
        limit 1
      `,
      [executionId]
    );

    await client.query('commit');

    if (finalStatus === 'completed' || refreshed.rows[0].status === 'completed') {
      await publishAutomationEventSafe(
        {
          clinicId: scope.clinicId,
          eventType: 'automation.execution_completed',
          entityType: refreshed.rows[0].entity_type,
          entityId: refreshed.rows[0].entity_id,
          payloadJson: {
            flowId: refreshed.rows[0].flow_id,
            executionId,
            triggerEvent: refreshed.rows[0].trigger_event,
            actorUserId: clinicContext.currentUser?.id || null,
            workspaceId: scope.workspaceId
          }
        },
        'Event bus automation.execution_completed publish failed:'
      );
    }

    return mapExecution(refreshed.rows[0]);
  } catch (error) {
    await client.query('rollback');

    try {
      const scope = await resolveAutomationScopeOrClinic(getPool(), clinicContext);
      const { publishDomainEvent } = require('../event-bus/publisher');
      publishDomainEvent({
        clinicId: scope.clinicId,
        eventType: 'automation.execution_failed',
        entityType: 'automation_execution',
        entityId: executionId,
        payloadJson: {
          executionId,
          actorUserId: clinicContext.currentUser?.id || null,
          message: error.message,
          workspaceId: scope.workspaceId || null
        }
      }).catch(() => {});
    } catch (publishError) {
      console.error('Event bus automation.execution_failed publish failed:', publishError.message);
    }

    throw error;
  } finally {
    client.release();
  }
}

async function handleDomainEvent(clinicContext, payload) {
  const client = await getPool().connect();
  const normalized = validateEventPayload(payload);
  try {
    const eventId = normalized.eventId || createDeterministicEventId(normalized);
    const scope = await resolveAutomationScope(client, clinicContext);
    const leadSnapshot = normalized.entityType === 'lead'
      ? await getLeadSnapshot(client, scope.clinicId, normalized.entityId)
      : null;
    const workspaceId = normalized.contextJson.workspaceId || leadSnapshot?.workspace_id || scope.workspaceId;
    const flowsResult = await client.query(
      `
        select *
        from automation_flows
        where clinic_id = $1
          and workspace_id = $2
          and status in ('active')
          and trigger_type = 'event'
          and coalesce(trigger_event, entry_rule_json->>'eventName') = $3
          and coalesce(entry_rule_json->>'entityType', definition_json->>'entityType', 'lead') = $4
        order by id asc
      `,
      [scope.clinicId, workspaceId, normalized.eventName, normalized.entityType]
    );

    const executions = [];
    const skippedExecutionIds = [];

    for (const flow of flowsResult.rows) {
      await client.query('begin');
      let executionResult;

      try {
        const guardConditions = flow.entry_rule_json?.guardConditions || {};
        const rateLimits = flow.entry_rule_json?.rateLimits || {};

        if (!matchesGuardConditions(leadSnapshot, normalized.contextJson, guardConditions)) {
          await client.query('commit');
          continue;
        }

        if (rateLimits.maxExecutionsPerEntity) {
          const existingExecutionCount = await client.query(
            `
              select count(*)::int as execution_count
              from automation_executions
              where clinic_id = $1
                and flow_id = $2
                and entity_type = $3
                and entity_id = $4
            `,
            [clinicContext.currentClinic.id, flow.id, normalized.entityType, normalized.entityId]
          );

          if (existingExecutionCount.rows[0].execution_count >= rateLimits.maxExecutionsPerEntity) {
            await client.query('commit');
            continue;
          }
        }

        const existingExecution = await client.query(
          `
            select id
            from automation_executions
            where clinic_id = $1
              and flow_id = $2
              and entity_type = $3
              and entity_id = $4
              and event_id = $5
            limit 1
          `,
          [clinicContext.currentClinic.id, flow.id, normalized.entityType, normalized.entityId, eventId]
        );

        if (existingExecution.rowCount > 0) {
          await client.query('commit');
          skippedExecutionIds.push(existingExecution.rows[0].id);
          continue;
        }

        executionResult = await client.query(
          `
            insert into automation_executions (
              clinic_id,
              workspace_id,
              flow_id,
              lead_id,
              entity_type,
              entity_id,
              trigger_event,
              event_id,
              status,
              context_json
            )
            values ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9::jsonb)
            returning *
          `,
          [
            scope.clinicId,
            workspaceId,
            flow.id,
            normalized.entityType === 'lead' ? normalized.entityId : null,
            normalized.entityType,
            normalized.entityId,
            normalized.eventName,
            eventId,
            JSON.stringify(normalized.contextJson)
          ]
        );

        const stepsResult = await client.query(
          'select * from automation_steps where clinic_id = $1 and flow_id = $2 order by step_order asc',
          [clinicContext.currentClinic.id, flow.id]
        );

        if (normalized.deferExecution) {
          const { enqueueJob } = require('../worker-engine/scheduler');
          await enqueueJob(
            {
              clinicId: clinicContext.currentClinic.id,
              jobType: 'automation.execute',
              payloadJson: {
                executionId: executionResult.rows[0].id,
                actorUserId: clinicContext.currentUser?.id || null,
                workspaceId
              },
              runAt: normalized.occurredAt || new Date().toISOString(),
              maxAttempts: 3
            },
            client
          );
        } else {
          await runExecution(
            client,
            {
              currentClinic: clinicContext.currentClinic,
              currentUser: clinicContext.currentUser,
              currentWorkspace: clinicContext.currentWorkspace,
              currentFlow: flow,
              entityType: normalized.entityType,
              entityId: normalized.entityId,
              eventContext: normalized.contextJson,
              leadSnapshot
            },
            executionResult.rows[0],
            stepsResult.rows
          );
        }

        const { recordAuditLog } = require('../audit/service');
        await recordAuditLog(
          {
            clinicId: scope.clinicId,
            entityType: normalized.entityType,
            entityId: normalized.entityId,
            actionType: 'automation.trigger',
            actorUserId: clinicContext.currentUser?.id || null,
            contextJson: {
              eventName: normalized.eventName,
              flowId: flow.id,
              executionId: executionResult.rows[0].id,
              workspaceId
            }
          },
          client
        );

        await client.query('commit');

        if (!normalized.deferExecution) {
          const completedExecution = await getPool().query(
            `select status from automation_executions where id = $1 limit 1`,
            [executionResult.rows[0].id]
          );

          if (completedExecution.rowCount > 0 && completedExecution.rows[0].status === 'completed') {
            await publishAutomationEventSafe(
              {
                clinicId: scope.clinicId,
                eventType: 'automation.execution_completed',
                entityType: normalized.entityType,
                entityId: normalized.entityId,
                payloadJson: {
                  flowId: flow.id,
                  executionId: executionResult.rows[0].id,
                  triggerEvent: normalized.eventName,
                  actorUserId: clinicContext.currentUser?.id || null,
                  workspaceId
                }
              },
              'Event bus automation.execution_completed publish failed:'
            );
          }
        }

        executions.push(executionResult.rows[0].id);
      } catch (error) {
        await client.query('rollback').catch(() => {});
        throw error;
      }
    }

    return {
      matchedFlows: flowsResult.rowCount,
      eventId,
      executionIds: executions,
      skippedExecutionIds
    };
  } finally {
    client.release();
  }
}

async function listExecutions(clinicId, searchParams) {
  const client = getPool();
  const scope = await resolveAutomationScopeOrClinic(client, clinicId);
  const filters = parseExecutionFilters(searchParams);
  const clauses = ['ae.clinic_id = $1'];
  const values = [scope.clinicId];

  if (scope.workspaceId) {
    values.push(scope.workspaceId);
    clauses.push(`ae.workspace_id = $${values.length}`);
  }

  if (filters.status) {
    values.push(filters.status);
    clauses.push(`ae.status = $${values.length}`);
  }

  if (filters.entityType) {
    values.push(filters.entityType);
    clauses.push(`ae.entity_type = $${values.length}`);
  }

  if (filters.entityId) {
    values.push(filters.entityId);
    clauses.push(`ae.entity_id = $${values.length}`);
  }

  values.push(filters.limit);

  const result = await client.query(
    `
      select ae.*, af.name as flow_name
      from automation_executions ae
      inner join automation_flows af on af.id = ae.flow_id
      where ${clauses.join(' and ')}
      order by ae.created_at desc, ae.id desc
      limit $${values.length}
    `,
    values
  );

  return {
    items: result.rows.map(mapExecution),
    filters
  };
}

async function listTasks(clinicId, searchParams) {
  const filters = parseTaskFilters(searchParams);
  const client = getPool();
  const scope = await resolveAutomationScopeOrClinic(client, clinicId);
  const values = [scope.clinicId];
  const clauses = ['clinic_id = $1'];

  if (filters.status) {
    values.push(filters.status);
    clauses.push(`status = $${values.length}`);
  }

  values.push(filters.limit);

  const result = await client.query(
    `
      select *
      from automation_tasks
      where ${clauses.join(' and ')}
      order by created_at desc, id desc
      limit $${values.length}
    `,
    values
  );

  return {
    items: result.rows.map(mapTask),
    filters
  };
}

async function listReminders(clinicId, searchParams) {
  const filters = parseReminderFilters(searchParams);
  const client = getPool();
  const scope = await resolveAutomationScopeOrClinic(client, clinicId);
  const values = [scope.clinicId];
  const clauses = ['clinic_id = $1'];

  if (filters.status) {
    values.push(filters.status);
    clauses.push(`status = $${values.length}`);
  }

  values.push(filters.limit);

  const result = await client.query(
    `
      select *
      from reminders
      where ${clauses.join(' and ')}
      order by created_at desc, id desc
      limit $${values.length}
    `,
    values
  );

  return {
    items: result.rows.map(mapReminder),
    filters
  };
}

module.exports = {
  createDeterministicEventId,
  matchesGuardConditions,
  listFlows,
  getFlowDetail,
  createFlow,
  addFlowStep,
  updateFlow,
  updateFlowStatus,
  handleDomainEvent,
  executeExecutionById,
  listExecutions,
  getExecutionDetail,
  listTasks,
  listReminders
};
