const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { loadConfig } = require('../apps/api/src/config');
const { signup } = require('../apps/api/src/modules/onboarding/service');
const { authenticateRequest } = require('../apps/api/src/modules/auth/service');
const { handleAiRoutes } = require('../apps/api/src/modules/ai/routes');
const { createLead, updateLead } = require('../apps/api/src/modules/leads/service');
const { createFlow } = require('../apps/api/src/modules/automation/service');
const { trackOutcome } = require('../apps/api/src/modules/ai-feedback/service');
const { executeAutoAction, handleAutoActionEvent } = require('../apps/api/src/modules/ai-actions/service');
const { publishDomainEvent } = require('../apps/api/src/modules/event-bus/publisher');

function buildAuthRequest(token, extraHeaders = {}) {
  return {
    headers: {
      authorization: `Bearer ${token}`,
      ...extraHeaders
    }
  };
}

async function createFixture(t) {
  const uniqueId = Date.now() + Math.floor(Math.random() * 1000);
  const session = await signup({
    clinicName: `AI Feedback Clinic ${uniqueId}`,
    ownerName: 'AI Feedback Owner',
    email: `ai-feedback-owner-${uniqueId}@example.com`,
    password: 'StrongPass123!'
  });
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });

  t.after(async () => {
    await pool.query('delete from clinics where id = $1', [session.currentClinic.id]);
    await pool.query('delete from users where id = $1', [session.user.id]);
    await pool.end();
  });

  const ownerContext = await authenticateRequest(buildAuthRequest(session.token));

  return {
    pool,
    session,
    ownerContext,
    async refreshContext(headers = {}) {
      return authenticateRequest(buildAuthRequest(session.token, headers));
    }
  };
}

async function waitForAssertion(assertion, attempts = 20, delayMs = 150) {
  let lastError;

  for (let index = 0; index < attempts; index += 1) {
    try {
      await assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

async function setCurrentMembershipRole(pool, context, roleKey) {
  const roleResult = await pool.query('select id from roles where key = $1 limit 1', [roleKey]);
  assert.equal(roleResult.rowCount, 1);

  await pool.query(
    `
      update workspace_memberships
      set role_id = $1, updated_at = now()
      where clinic_id = $2 and user_id = $3 and workspace_id = $4
    `,
    [roleResult.rows[0].id, context.currentClinic.id, context.currentUser.id, context.currentWorkspace.id]
  );

  await pool.query(
    `
      update clinic_users
      set role_id = $1, role = $2, updated_at = now()
      where clinic_id = $3 and user_id = $4
    `,
    [roleResult.rows[0].id, roleKey, context.currentClinic.id, context.currentUser.id]
  );
}

async function createAlternateWorkspace(pool, context) {
  const slug = `ai-feedback-workspace-${Date.now()}`;
  const membershipRole = await pool.query(
    `
      select role_id
      from clinic_users
      where clinic_id = $1 and user_id = $2
      limit 1
    `,
    [context.currentClinic.id, context.currentUser.id]
  );
  const insertResult = await pool.query(
    `
      insert into workspaces (clinic_id, organization_id, name, slug, status)
      values ($1, $2, $3, $4, 'active')
      returning id, slug
    `,
    [context.currentClinic.id, context.currentOrganization.id, 'AI Feedback Workspace', slug]
  );

  await pool.query(
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
    [
      context.currentClinic.id,
      context.currentOrganization.id,
      insertResult.rows[0].id,
      context.currentUser.id,
      membershipRole.rows[0].role_id
    ]
  );

  return insertResult.rows[0];
}

async function createHotLeadFollowupFlow(context) {
  return createFlow(context, {
    name: `Hot Lead Followup ${Date.now()}`,
    flowType: 'ai_feedback',
    status: 'active',
    triggerEvent: 'ai.hot_lead_followup',
    definitionJson: {
      entityType: 'lead',
      conditions: {},
      rateLimits: {
        maxExecutionsPerEntity: 5
      },
      steps: [
        {
          type: 'action',
          action: 'create_task',
          title: 'Hot lead follow-up',
          taskType: 'hot_lead_followup'
        }
      ]
    }
  });
}

async function invokeAiRoute(token, path, method, body, extraHeaders = {}) {
  const request = {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...extraHeaders
    }
  };
  const response = {};

  await handleAiRoutes(
    request,
    response,
    new URL(path, 'http://localhost'),
    {
      authenticateRequest,
      parseJsonBody: async () => body,
      json(target, statusCode, payload) {
        target.statusCode = statusCode;
        target.payload = payload;
        return payload;
      }
    }
  );

  return response;
}

test('outcome is recorded correctly', async (t) => {
  const fixture = await createFixture(t);
  const lead = await createLead(fixture.ownerContext, {
    fullName: `Outcome Lead ${Date.now()}`,
    source: 'manual',
    status: 'new',
    stage: 'inquiry',
    ownerUserId: fixture.ownerContext.currentUser.id,
    phone: `081${String(Date.now()).slice(-7)}`,
    email: `outcome-lead-${Date.now()}@example.com`
  });

  const result = await trackOutcome(fixture.ownerContext, {
    entityType: 'lead',
    entityId: lead.id,
    actionType: 'lead_status_changed',
    outcomeType: 'opened',
    metadata: {
      stage: 'inquiry'
    }
  });

  assert.equal(result.duplicate, false);
  const stored = await fixture.pool.query(
    `
      select entity_type, entity_id, action_type, outcome_type, workspace_id
      from ai_outcomes
      where clinic_id = $1 and entity_type = 'lead' and entity_id = $2
      order by id desc
      limit 1
    `,
    [fixture.ownerContext.currentClinic.id, lead.id]
  );

  assert.equal(stored.rowCount, 1);
  assert.equal(stored.rows[0].action_type, 'lead_status_changed');
  assert.equal(stored.rows[0].outcome_type, 'opened');
  assert.equal(String(stored.rows[0].workspace_id), String(fixture.ownerContext.currentWorkspace.id));
});

test('score updates based on outcome', async (t) => {
  const fixture = await createFixture(t);
  const lead = await createLead(fixture.ownerContext, {
    fullName: `Learning Lead ${Date.now()}`,
    source: 'website',
    status: 'new',
    stage: 'inquiry',
    ownerUserId: fixture.ownerContext.currentUser.id,
    intentScore: 20,
    phone: `082${String(Date.now()).slice(-7)}`,
    email: `learning-lead-${Date.now()}@example.com`
  });

  await updateLead(fixture.ownerContext, lead.id, { intentScore: 20 });
  await trackOutcome(fixture.ownerContext, {
    entityType: 'lead',
    entityId: lead.id,
    actionType: 'lead_status_changed',
    outcomeType: 'replied'
  });

  await waitForAssertion(async () => {
    const leadRow = await fixture.pool.query(
      'select intent_score from leads where clinic_id = $1 and workspace_id = $2 and id = $3',
      [fixture.ownerContext.currentClinic.id, fixture.ownerContext.currentWorkspace.id, lead.id]
    );
    const learningEvent = await fixture.pool.query(
      `
        select count(*)::int as event_count
        from event_store
        where clinic_id = $1 and event_type = 'ai.learning_updated' and entity_type = 'lead' and entity_id = $2
      `,
      [fixture.ownerContext.currentClinic.id, lead.id]
    );

    assert.equal(leadRow.rows[0].intent_score, 35);
    assert.equal(learningEvent.rows[0].event_count >= 1, true);
  });
});

test('auto action triggers correctly', async (t) => {
  const fixture = await createFixture(t);
  const flow = await createHotLeadFollowupFlow(fixture.ownerContext);
  const lead = await createLead(fixture.ownerContext, {
    fullName: `Hot Lead ${Date.now()}`,
    source: 'manual',
    status: 'active',
    stage: 'qualified',
    ownerUserId: fixture.ownerContext.currentUser.id,
    intentScore: 91,
    phone: `083${String(Date.now()).slice(-7)}`,
    email: `hot-lead-${Date.now()}@example.com`
  });

  await updateLead(fixture.ownerContext, lead.id, { intentScore: 91 });
  const result = await executeAutoAction(fixture.ownerContext, lead.id);

  assert.ok(result.actions.some((action) => action.actionKey === 'hot_lead_followup' && action.status === 'executed'));
  await waitForAssertion(async () => {
    const executionResult = await fixture.pool.query(
      `
        select count(*)::int as execution_count
        from automation_executions
        where clinic_id = $1 and flow_id = $2 and entity_type = 'lead' and entity_id = $3 and trigger_event = 'ai.hot_lead_followup'
      `,
      [fixture.ownerContext.currentClinic.id, flow.id, lead.id]
    );

    assert.equal(executionResult.rows[0].execution_count >= 1, true);
  });
});

test('no duplicate execution occurs for the same source event', async (t) => {
  const fixture = await createFixture(t);
  await createHotLeadFollowupFlow(fixture.ownerContext);
  const lead = await createLead(fixture.ownerContext, {
    fullName: `Idempotent Lead ${Date.now()}`,
    source: 'manual',
    status: 'active',
    stage: 'qualified',
    ownerUserId: fixture.ownerContext.currentUser.id,
    intentScore: 92,
    phone: `084${String(Date.now()).slice(-7)}`,
    email: `idempotent-lead-${Date.now()}@example.com`
  });

  await updateLead(fixture.ownerContext, lead.id, { intentScore: 92 });
  const published = await publishDomainEvent({
    clinicId: fixture.ownerContext.currentClinic.id,
    eventType: 'ai.learning_updated',
    entityType: 'lead',
    entityId: lead.id,
    payloadJson: {
      leadId: lead.id,
      workspaceId: fixture.ownerContext.currentWorkspace.id,
      actorUserId: fixture.ownerContext.currentUser.id,
      nextScore: 92,
      previousScore: 70,
      delta: 22
    }
  });

  await waitForAssertion(async () => {
    const actionRows = await fixture.pool.query(
      `
        select count(*)::int as action_count
        from ai_action_executions
        where clinic_id = $1
          and workspace_id = $2
          and entity_type = 'lead'
          and entity_id = $3
          and action_key = 'hot_lead_followup'
          and source_event_id = $4
      `,
      [fixture.ownerContext.currentClinic.id, fixture.ownerContext.currentWorkspace.id, lead.id, published.event.id]
    );

    assert.equal(actionRows.rows[0].action_count, 1);
  });

  await handleAutoActionEvent(published.event);
  const actionRows = await fixture.pool.query(
    `
      select count(*)::int as action_count
      from ai_action_executions
      where clinic_id = $1
        and workspace_id = $2
        and entity_type = 'lead'
        and entity_id = $3
        and action_key = 'hot_lead_followup'
        and source_event_id = $4
    `,
    [fixture.ownerContext.currentClinic.id, fixture.ownerContext.currentWorkspace.id, lead.id, published.event.id]
  );

  assert.equal(actionRows.rows[0].action_count, 1);
});

test('AI follow-up auto action queues HITL approval instead of outbound send', async (t) => {
  const fixture = await createFixture(t);
  const lead = await createLead(fixture.ownerContext, {
    fullName: `HITL Followup Lead ${Date.now()}`,
    source: 'manual',
    status: 'active',
    stage: 'qualified',
    ownerUserId: fixture.ownerContext.currentUser.id,
    intentScore: 40,
    phone: `087${String(Date.now()).slice(-7)}`,
    email: `hitl-followup-${Date.now()}@example.com`
  });

  await fixture.pool.query(
    `
      insert into channels (clinic_id, channel_type, name, status, is_primary, config_json)
      select $1, 'line', $2, 'active', false, '{}'::jsonb
      where not exists (
        select 1 from channels where clinic_id = $1 and status = 'active'
      )
    `,
    [fixture.ownerContext.currentClinic.id, `HITL LINE ${Date.now()}`]
  );

  await fixture.pool.query(
    `
      insert into ai_outcomes (
        clinic_id,
        workspace_id,
        entity_type,
        entity_id,
        action_type,
        outcome_type,
        metadata_json,
        idempotency_key,
        created_at
      )
      values ($1, $2, 'lead', $3, 'message_sent', 'sent', '{}'::jsonb, $4, now() - interval '3 days')
    `,
    [
      fixture.ownerContext.currentClinic.id,
      fixture.ownerContext.currentWorkspace.id,
      lead.id,
      `phase2-hitl-followup-${lead.id}-${Date.now()}`
    ]
  );

  const result = await executeAutoAction(fixture.ownerContext, lead.id, {
    sourceEventId: null,
    triggerEventType: 'manual'
  });

  const followupAction = result.actions.find((action) => action.actionKey === 'send_followup_message');
  assert.ok(followupAction);
  assert.equal(followupAction.status, 'pending_approval');
  assert.ok(followupAction.approvalMessageId);

  const outboundRows = await fixture.pool.query(
    `
      select count(*)::int as message_count
      from outbound_messages
      where clinic_id = $1
        and entity_type = 'lead'
        and entity_id = $2
        and message_type = 'automation'
    `,
    [fixture.ownerContext.currentClinic.id, lead.id]
  );
  assert.equal(outboundRows.rows[0].message_count, 0);

  const pendingMessageRows = await fixture.pool.query(
    `
      select m.status
      from ai_chat_messages m
      inner join ai_chat_threads t on t.id = m.thread_id
      where t.clinic_id = $1
        and t.lead_id = $2
        and m.id = $3
    `,
    [fixture.ownerContext.currentClinic.id, lead.id, followupAction.approvalMessageId]
  );
  assert.equal(pendingMessageRows.rowCount, 1);
  assert.equal(pendingMessageRows.rows[0].status, 'pending_approval');

  const auditRows = await fixture.pool.query(
    `
      select count(*)::int as event_count
      from audit_logs
      where clinic_id = $1
        and entity_type = 'lead'
        and entity_id = $2
        and action_type = 'ai.auto_action_queued_for_approval'
    `,
    [fixture.ownerContext.currentClinic.id, lead.id]
  );
  assert.equal(auditRows.rows[0].event_count, 1);
});

test('workspace isolation is enforced', async (t) => {
  const fixture = await createFixture(t);
  const alternateWorkspace = await createAlternateWorkspace(fixture.pool, fixture.ownerContext);
  const alternateContext = await fixture.refreshContext({ 'x-workspace-slug': alternateWorkspace.slug });
  const lead = await createLead(alternateContext, {
    fullName: `Isolated Lead ${Date.now()}`,
    source: 'manual',
    status: 'new',
    stage: 'inquiry',
    ownerUserId: alternateContext.currentUser.id,
    phone: `085${String(Date.now()).slice(-7)}`,
    email: `isolated-lead-${Date.now()}@example.com`
  });

  await assert.rejects(
    () =>
      trackOutcome(fixture.ownerContext, {
        entityType: 'lead',
        entityId: lead.id,
        actionType: 'lead_status_changed',
        outcomeType: 'opened'
      }),
    { code: 'LEAD_NOT_FOUND' }
  );
});

test('RBAC is enforced for AI management endpoints', async (t) => {
  const fixture = await createFixture(t);
  const lead = await createLead(fixture.ownerContext, {
    fullName: `Viewer RBAC Lead ${Date.now()}`,
    source: 'manual',
    status: 'new',
    stage: 'inquiry',
    ownerUserId: fixture.ownerContext.currentUser.id,
    phone: `086${String(Date.now()).slice(-7)}`,
    email: `viewer-rbac-lead-${Date.now()}@example.com`
  });

  await setCurrentMembershipRole(fixture.pool, fixture.ownerContext, 'viewer');

  await assert.rejects(
    () =>
      invokeAiRoute(fixture.session.token, '/ai/track-outcome', 'POST', {
        entityType: 'lead',
        entityId: lead.id,
        actionType: 'lead_status_changed',
        outcomeType: 'opened'
      }),
    { code: 'FORBIDDEN' }
  );
});
