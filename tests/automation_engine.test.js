const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { loadConfig } = require('../apps/api/src/config');
const { signup, authenticateRequest } = require('../apps/api/src/modules/auth/service');
const { authorize } = require('../apps/api/src/modules/rbac/service');
const { createLead } = require('../apps/api/src/modules/leads/service');
const {
  createFlow,
  updateFlowStatus,
  getExecutionDetail,
  getFlowDetail,
  listFlows,
  handleDomainEvent
} = require('../apps/api/src/modules/automation/service');
const scheduler = require('../apps/api/src/modules/worker-engine/scheduler');

async function buildContext(pool) {
  const clinicResult = await pool.query(`select id, name, slug, plan, status, timezone, created_at, updated_at from clinics where slug = 'demo-clinic' limit 1`);
  const membershipResult = await pool.query(
    `
      select u.id, u.email, u.name, cu.role, cu.role_id, cu.organization_id, cu.workspace_id
      from clinic_users cu
      inner join users u on u.id = cu.user_id
      where cu.clinic_id = $1 and cu.status = 'active' and u.status = 'active'
      order by cu.id asc
      limit 1
    `,
    [clinicResult.rows[0].id]
  );

  return {
    currentClinic: {
      id: clinicResult.rows[0].id,
      name: clinicResult.rows[0].name,
      slug: clinicResult.rows[0].slug,
      plan: clinicResult.rows[0].plan,
      status: clinicResult.rows[0].status,
      timezone: clinicResult.rows[0].timezone,
      createdAt: clinicResult.rows[0].created_at,
      updatedAt: clinicResult.rows[0].updated_at
    },
    currentUser: {
      id: membershipResult.rows[0].id,
      email: membershipResult.rows[0].email,
      name: membershipResult.rows[0].name,
      role: membershipResult.rows[0].role
    },
    currentOrganization: {
      id: membershipResult.rows[0].organization_id
    },
    currentWorkspace: {
      id: membershipResult.rows[0].workspace_id
    },
    currentMembership: {
      organizationId: membershipResult.rows[0].organization_id,
      workspaceId: membershipResult.rows[0].workspace_id,
      roleId: membershipResult.rows[0].role_id,
      role: membershipResult.rows[0].role
    }
  };
}

async function createAlternateWorkspaceContext(pool, context) {
  const workspaceSlug = `automation-alt-${Date.now()}`;
  const workspaceResult = await pool.query(
    `
      insert into workspaces (clinic_id, organization_id, name, slug, status)
      values ($1, $2, $3, $4, 'active')
      returning id, organization_id
    `,
    [context.currentClinic.id, context.currentOrganization.id, `Automation Alt ${Date.now()}`, workspaceSlug]
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
      on conflict do nothing
    `,
    [
      context.currentClinic.id,
      context.currentOrganization.id,
      workspaceResult.rows[0].id,
      context.currentUser.id,
      context.currentMembership.roleId
    ]
  );

  return {
    ...context,
    currentWorkspace: {
      id: workspaceResult.rows[0].id
    },
    currentMembership: {
      ...context.currentMembership,
      workspaceId: workspaceResult.rows[0].id
    }
  };
}

async function waitForAssertion(assertion, attempts = 25, delayMs = 100) {
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

function buildAuthRequest(token, extraHeaders = {}) {
  return {
    headers: {
      authorization: `Bearer ${token}`,
      ...extraHeaders
    }
  };
}

async function createTenantFixture(t) {
  const uniqueId = Date.now() + Math.floor(Math.random() * 1000);
  const session = await signup({
    clinicName: `Automation Tenant ${uniqueId}`,
    ownerName: 'Automation Owner',
    email: `automation-owner-${uniqueId}@example.com`,
    password: 'StrongPass123!'
  });
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const cleanupUserIds = new Set([session.user.id]);

  t.after(async () => {
    await pool.query('delete from clinics where id = $1', [session.currentClinic.id]);

    if (cleanupUserIds.size > 0) {
      await pool.query('delete from users where id = any($1::bigint[])', [[...cleanupUserIds].map((id) => Number(id))]);
    }

    await pool.end();
  });

  const context = await authenticateRequest(buildAuthRequest(session.token));

  return {
    pool,
    session,
    context,
    registerUser(userId) {
      cleanupUserIds.add(userId);
    }
  };
}

test('automation engine executes canonical flow steps and records step executions', async () => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const context = await buildContext(pool);
  await pool.query('delete from automation_flows where clinic_id = $1', [context.currentClinic.id]);
  const flow = await createFlow(context, {
    name: `Automation Engine ${Date.now()}`,
    flowType: 'lifecycle',
    status: 'active',
    triggerEvent: 'lead.created',
    definitionJson: {
      trigger: 'lead.created',
      entityType: 'lead',
      conditions: {},
      steps: [
        { type: 'condition', field: 'status', operator: '==', value: 'new' },
        {
          type: 'action',
          action: 'create_task',
          assignedUserId: context.currentUser.id,
          title: 'Automation engine review',
          description: 'Created from canonical action step',
          taskType: 'automation_engine_review'
        }
      ]
    }
  });

  const lead = await createLead(context, {
    fullName: `Automation Engine Lead ${Date.now()}`,
    source: 'manual',
    status: 'new',
    stage: 'inquiry',
    ownerUserId: context.currentUser.id,
    phone: `087${String(Date.now()).slice(-7)}`,
    email: `automation-engine-${Date.now()}@example.com`
  });

  let executionId = null;

  await waitForAssertion(async () => {
    const executionResult = await pool.query(
      `
        select id
        from automation_executions
        where clinic_id = $1 and workspace_id = $2 and flow_id = $3 and lead_id = $4
        order by id desc
        limit 1
      `,
      [context.currentClinic.id, context.currentWorkspace.id, flow.id, lead.id]
    );

    assert.equal(executionResult.rowCount, 1);
    executionId = executionResult.rows[0].id;

    const detail = await getExecutionDetail(context, executionId);
    assert.equal(detail.status, 'completed');
    assert.equal(detail.stepExecutions.length, 2);
    assert.deepEqual(
      detail.stepExecutions.map((step) => [step.stepOrder, step.stepType, step.status]),
      [
        [1, 'condition', 'completed'],
        [2, 'action', 'completed']
      ]
    );
  });

  const taskResult = await pool.query(
    `
      select count(*)::int as task_count
      from automation_tasks at
      inner join automation_executions ae on ae.id = at.execution_id
      where ae.id = $1 and at.title = 'Automation engine review'
    `,
    [executionId]
  );

  assert.equal(taskResult.rows[0].task_count, 1);
  await pool.end();
});

test('automation engine rejects self-looping tag automations', async () => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const context = await buildContext(pool);

  await assert.rejects(
    () => createFlow(context, {
      name: `Loop Guard ${Date.now()}`,
      flowType: 'lifecycle',
      status: 'draft',
      triggerEvent: 'lead.tag_added',
      definitionJson: {
        trigger: 'lead.tag_added',
        entityType: 'lead',
        steps: [
          { type: 'action', action: 'add_tag', tagName: 'vip' }
        ]
      }
    }),
    /lead\.tag_added cannot include add_tag actions/
  );

  await pool.end();
});

test('automation flows are isolated by workspace scope', async () => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const context = await buildContext(pool);
  const alternateContext = await createAlternateWorkspaceContext(pool, context);
  const flow = await createFlow(alternateContext, {
    name: `Workspace Scoped Flow ${Date.now()}`,
    flowType: 'lifecycle',
    status: 'draft',
    triggerEvent: 'lead.note_added',
    definitionJson: {
      trigger: 'lead.note_added',
      entityType: 'lead',
      steps: [
        {
          type: 'action',
          action: 'create_task',
          assignedUserId: alternateContext.currentUser.id,
          title: 'Workspace specific task',
          taskType: 'workspace_specific'
        }
      ]
    }
  });

  await assert.rejects(() => getFlowDetail(context, flow.id), /Automation flow not found/);

  const defaultWorkspaceFlows = await listFlows(context);
  const alternateWorkspaceFlows = await listFlows(alternateContext);

  assert.equal(defaultWorkspaceFlows.items.some((item) => item.id === flow.id), false);
  assert.equal(alternateWorkspaceFlows.items.some((item) => item.id === flow.id), true);

  await pool.end();
});

test('automation flow activation updates status and writes activation audit', async () => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const context = await buildContext(pool);
  const flow = await createFlow(context, {
    name: `Flow Activation ${Date.now()}`,
    flowType: 'lifecycle',
    status: 'draft',
    triggerEvent: 'lead.note_added',
    definitionJson: {
      trigger: 'lead.note_added',
      entityType: 'lead',
      steps: [
        {
          type: 'action',
          action: 'create_task',
          assignedUserId: context.currentUser.id,
          title: 'Activation task'
        }
      ]
    }
  });

  const activated = await updateFlowStatus(context, flow.id, { status: 'active' });
  const auditResult = await pool.query(
    `
      select count(*)::int as audit_count
      from audit_logs
      where clinic_id = $1 and entity_type = 'automation_flow' and entity_id = $2 and action_type = 'flow.activated'
    `,
    [context.currentClinic.id, flow.id]
  );

  assert.equal(activated.status, 'active');
  assert.equal(auditResult.rows[0].audit_count >= 1, true);
  await pool.end();
});

test('automation engine stops after failed condition and skips action execution', async () => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const context = await buildContext(pool);
  await pool.query('delete from automation_flows where clinic_id = $1', [context.currentClinic.id]);
  const flow = await createFlow(context, {
    name: `Condition Skip ${Date.now()}`,
    flowType: 'lifecycle',
    status: 'active',
    triggerEvent: 'lead.note_added',
    definitionJson: {
      trigger: 'lead.note_added',
      entityType: 'lead',
      steps: [
        { type: 'condition', field: 'status', operator: '==', value: 'qualified' },
        {
          type: 'action',
          action: 'create_task',
          assignedUserId: context.currentUser.id,
          title: 'Should not run'
        }
      ]
    }
  });
  const lead = await createLead(context, {
    fullName: `Condition Skip Lead ${Date.now()}`,
    source: 'manual',
    status: 'new',
    stage: 'inquiry',
    ownerUserId: context.currentUser.id,
    phone: `086${String(Date.now()).slice(-7)}`,
    email: `condition-skip-${Date.now()}@example.com`
  });

  const result = await handleDomainEvent(context, {
    eventName: 'lead.note_added',
    entityType: 'lead',
    entityId: lead.id,
    eventId: `condition-skip-${lead.id}`,
    occurredAt: '2026-03-16T09:00:00Z',
    contextJson: { workspaceId: context.currentWorkspace.id },
    deferExecution: false
  });

  const detail = await getExecutionDetail(context, result.executionIds[0]);
  const taskResult = await pool.query(
    `
      select count(*)::int as task_count
      from automation_tasks
      where execution_id = $1
    `,
    [result.executionIds[0]]
  );

  assert.equal(detail.status, 'completed');
  assert.deepEqual(
    detail.stepExecutions.map((step) => [step.stepOrder, step.stepType, step.status]),
    [
      [1, 'condition', 'skipped']
    ]
  );
  assert.equal(taskResult.rows[0].task_count, 0);
  assert.equal(flow.id > 0, true);
  await pool.end();
});

test('automation engine schedules delay step and resumes execution via worker', async () => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const context = await buildContext(pool);
  await pool.query('delete from automation_flows where clinic_id = $1', [context.currentClinic.id]);
  const flow = await createFlow(context, {
    name: `Delay Resume ${Date.now()}`,
    flowType: 'lifecycle',
    status: 'active',
    triggerEvent: 'lead.note_added',
    definitionJson: {
      trigger: 'lead.note_added',
      entityType: 'lead',
      steps: [
        { type: 'delay', minutes: 30 },
        {
          type: 'action',
          action: 'create_task',
          assignedUserId: context.currentUser.id,
          title: 'Delayed task'
        }
      ]
    }
  });
  const lead = await createLead(context, {
    fullName: `Delay Lead ${Date.now()}`,
    source: 'manual',
    status: 'new',
    stage: 'inquiry',
    ownerUserId: context.currentUser.id,
    phone: `088${String(Date.now()).slice(-7)}`,
    email: `delay-${Date.now()}@example.com`
  });

  const result = await handleDomainEvent(context, {
    eventName: 'lead.note_added',
    entityType: 'lead',
    entityId: lead.id,
    eventId: `delay-${lead.id}`,
    occurredAt: '2026-03-16T09:00:00Z',
    contextJson: { workspaceId: context.currentWorkspace.id },
    deferExecution: false
  });

  const executionId = result.executionIds[0];
  let detail = await getExecutionDetail(context, executionId);
  assert.equal(detail.status, 'retrying');
  assert.equal(detail.stepExecutions[0].status, 'waiting');

  await pool.query(
    `
      update worker_jobs
      set run_at = now() - interval '1 minute', updated_at = now()
      where clinic_id = $1 and job_type = 'automation.execute' and payload_json->>'executionId' = $2
    `,
    [context.currentClinic.id, String(executionId)]
  );

  const workerResult = await scheduler.runDueJobs(20);
  detail = await getExecutionDetail(context, executionId);
  const taskResult = await pool.query(
    `select count(*)::int as task_count from automation_tasks where execution_id = $1 and title = 'Delayed task'`,
    [executionId]
  );

  assert.ok(workerResult.claimedJobs >= 1);
  assert.equal(detail.status, 'completed');
  assert.ok(detail.stepExecutions.some((step) => step.stepOrder === 2 && step.status === 'completed'));
  assert.equal(taskResult.rows[0].task_count, 1);
  assert.equal(flow.id > 0, true);
  await pool.end();
});

test('automation engine schedules retry when task action fails and worker completes retry', async () => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const context = await buildContext(pool);
  await pool.query('delete from automation_flows where clinic_id = $1', [context.currentClinic.id]);
  const flow = await createFlow(context, {
    name: `Retry Flow ${Date.now()}`,
    flowType: 'lifecycle',
    status: 'active',
    triggerEvent: 'lead.note_added',
    definitionJson: {
      trigger: 'lead.note_added',
      entityType: 'lead',
      steps: [
        {
          type: 'action',
          action: 'create_task',
          assignedUserId: 999999999,
          title: 'Retry task',
          retryDelayMinutes: 1,
          maxAttempts: 2
        }
      ]
    }
  });
  const lead = await createLead(context, {
    fullName: `Retry Lead ${Date.now()}`,
    source: 'manual',
    status: 'new',
    stage: 'inquiry',
    ownerUserId: context.currentUser.id,
    phone: `085${String(Date.now()).slice(-7)}`,
    email: `retry-${Date.now()}@example.com`
  });

  const result = await handleDomainEvent(context, {
    eventName: 'lead.note_added',
    entityType: 'lead',
    entityId: lead.id,
    eventId: `retry-${lead.id}`,
    occurredAt: '2026-03-16T09:00:00Z',
    contextJson: { workspaceId: context.currentWorkspace.id },
    deferExecution: false
  });

  const executionId = result.executionIds[0];
  let detail = await getExecutionDetail(context, executionId);
  assert.equal(detail.status, 'retrying');
  assert.ok(detail.stepExecutions.some((step) => step.status === 'retry_scheduled'));

  await pool.query(
    `
      update automation_steps
      set config_json = jsonb_set(config_json, '{assignedUserId}', to_jsonb($3::bigint), true),
          updated_at = now()
      where clinic_id = $1 and flow_id = $2 and step_order = 1
    `,
    [context.currentClinic.id, flow.id, context.currentUser.id]
  );

  await pool.query(
    `
      update worker_jobs
      set run_at = now() - interval '1 minute', updated_at = now()
      where clinic_id = $1 and job_type = 'automation.execute' and payload_json->>'executionId' = $2 and status = 'pending'
    `,
    [context.currentClinic.id, String(executionId)]
  );

  const workerResult = await scheduler.runDueJobs(20);
  detail = await getExecutionDetail(context, executionId);
  const taskResult = await pool.query(
    `select count(*)::int as task_count from automation_tasks where execution_id = $1 and title = 'Retry task' and assigned_user_id = $2`,
    [executionId, context.currentUser.id]
  );

  assert.ok(workerResult.claimedJobs >= 1);
  assert.equal(detail.status, 'completed');
  assert.equal(taskResult.rows[0].task_count, 1);
  assert.equal(flow.id > 0, true);
  await pool.end();
});

test('automation RBAC allows read and blocks manage for operator role', async (t) => {
  const fixture = await createTenantFixture(t);
  const operatorRoleResult = await fixture.pool.query(`select id from roles where key = 'operator' limit 1`);

  await fixture.pool.query(
    `
      update clinic_users
      set role = 'operator', role_id = $1, updated_at = now()
      where clinic_id = $2 and user_id = $3
    `,
    [operatorRoleResult.rows[0].id, fixture.session.currentClinic.id, fixture.session.user.id]
  );

  await fixture.pool.query(
    `
      update workspace_memberships
      set role_id = $1, updated_at = now()
      where clinic_id = $2 and user_id = $3 and workspace_id = $4
    `,
    [operatorRoleResult.rows[0].id, fixture.session.currentClinic.id, fixture.session.user.id, fixture.session.currentWorkspace.id]
  );

  const operatorContext = await authenticateRequest(buildAuthRequest(fixture.session.token));

  assert.doesNotThrow(() => authorize(operatorContext, 'automation', 'read'));
  assert.throws(() => authorize(operatorContext, 'automation', 'manage'), /Missing permission automation.manage/);
});