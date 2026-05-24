const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { loadConfig } = require('../apps/api/src/config');
const { createLead } = require('../apps/api/src/modules/leads/service');
const { createBuilderFlow } = require('../apps/api/src/modules/automation-builder/service');
const { handleDomainEvent } = require('../apps/api/src/modules/automation/service');
const scheduler = require('../apps/api/src/modules/worker-engine/scheduler');

async function waitForAssertion(assertion, attempts = 20, delayMs = 50) {
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

test('worker engine polls queued automation jobs and executes them', async () => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const context = await buildContext(pool);
  const flow = await createBuilderFlow(context, {
    name: `Worker Flow ${Date.now()}`,
    flowType: 'worker_runtime',
    triggerType: 'event',
    status: 'active',
    trigger: { eventName: 'lead.updated', entityType: 'lead' },
    conditions: { statusEquals: 'new' },
    steps: [
      { stepOrder: 1, stepType: 'create_task', configJson: { title: 'Worker execution task', assignedUserId: context.currentUser.id } }
    ]
  });
  const lead = await createLead(context, {
    fullName: `Worker Lead ${Date.now()}`,
    source: 'manual',
    status: 'new',
    stage: 'inquiry',
    ownerUserId: context.currentUser.id,
    phone: `084${String(Date.now()).slice(-7)}`,
    email: `worker-${Date.now()}@example.com`
  });

  const result = await handleDomainEvent(context, {
    eventName: 'lead.updated',
    entityType: 'lead',
    entityId: lead.id,
    eventId: `worker-${lead.id}`,
    occurredAt: '2026-03-16T09:00:00Z',
    contextJson: { status: 'new', stage: 'inquiry' },
    deferExecution: true
  });

  assert.ok(result.executionIds.length >= 1);

  const executionLookup = await pool.query(
    `
      select id
      from automation_executions
      where clinic_id = $1
        and flow_id = $2
        and entity_type = 'lead'
        and entity_id = $3
        and event_id = $4
      limit 1
    `,
    [context.currentClinic.id, flow.id, lead.id, `worker-${lead.id}`]
  );
  const executionId = executionLookup.rows[0].id;

  const jobsBefore = await pool.query(`select * from worker_jobs where job_type = 'automation.execute' and payload_json->>'executionId' = $1`, [String(executionId)]);
  const workerResult = await scheduler.runDueJobs(20);
  const executionResult = await pool.query(`select status from automation_executions where id = $1`, [executionId]);
  const taskResult = await pool.query(
    `select count(*)::int as task_count from automation_tasks at inner join automation_executions ae on ae.id = at.execution_id where ae.flow_id = $1 and ae.entity_id = $2`,
    [flow.id, lead.id]
  );

  assert.equal(jobsBefore.rowCount, 1);
  assert.ok(workerResult.claimedJobs >= 1);
  assert.equal(executionResult.rows[0].status, 'completed');
  assert.equal(taskResult.rows[0].task_count, 1);
  await pool.end();
});

test('worker engine retries failed jobs by moving run_at forward', async () => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const context = await buildContext(pool);
  const job = await scheduler.enqueueJob({
    clinicId: context.currentClinic.id,
    jobType: 'automation.execute',
    payloadJson: { executionId: 999999999, actorUserId: context.currentUser.id },
    runAt: '2026-03-16T09:00:00Z',
    maxAttempts: 2
  });

  const firstRun = await scheduler.runDueJobs(20);
  const reloaded = await pool.query(`select status, attempts, run_at, last_error from worker_jobs where id = $1`, [job.id]);

  assert.ok(firstRun.results.some((item) => item.jobId === job.id && item.status === 'retried'));
  assert.equal(reloaded.rows[0].status, 'pending');
  assert.equal(reloaded.rows[0].attempts, 1);
  assert.ok(reloaded.rows[0].last_error);
  await pool.end();
});

test('worker scheduler respects delayed run_at timestamps', async () => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const context = await buildContext(pool);
  const futureRunAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const job = await scheduler.enqueueJob({
    clinicId: context.currentClinic.id,
    jobType: 'noop',
    payloadJson: { note: 'future job' },
    runAt: futureRunAt,
    maxAttempts: 1
  });

  const workerResult = await scheduler.runDueJobs(20);
  const reloaded = await pool.query(`select status, run_at from worker_jobs where id = $1`, [job.id]);

  assert.equal(workerResult.results.some((item) => item.jobId === job.id), false);
  assert.equal(reloaded.rows[0].status, 'pending');
  assert.equal(new Date(reloaded.rows[0].run_at).toISOString(), futureRunAt);
  await pool.end();
});

test('worker loop executes due jobs without requiring a new event', async () => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const context = await buildContext(pool);
  const job = await scheduler.enqueueJob({
    clinicId: context.currentClinic.id,
    jobType: 'noop',
    payloadJson: { note: 'loop job' },
    runAt: new Date().toISOString(),
    maxAttempts: 1
  });

  scheduler.startWorkerLoop({ intervalMs: 25, batchSize: 200, runOnStart: true });

  try {
    await waitForAssertion(async () => {
      const reloaded = await pool.query('select status from worker_jobs where id = $1', [job.id]);
      assert.equal(reloaded.rows[0].status, 'completed');
    }, 80, 50);
  } finally {
    scheduler.stopWorkerLoop();
    await pool.end();
  }
});

test('automation event trigger rolls back execution when job enqueue fails', async () => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const context = await buildContext(pool);
  const eventName = `rollback.event.${Date.now()}`;
  const flow = await createBuilderFlow(context, {
    name: `Rollback Flow ${Date.now()}`,
    flowType: 'worker_runtime',
    triggerType: 'event',
    status: 'active',
    trigger: { eventName, entityType: 'lead' },
    conditions: { statusEquals: 'new' },
    steps: [
      { stepOrder: 1, stepType: 'create_task', configJson: { title: 'Rollback task', assignedUserId: context.currentUser.id } }
    ]
  });
  const lead = await createLead(context, {
    fullName: `Rollback Lead ${Date.now()}`,
    source: 'manual',
    status: 'new',
    stage: 'inquiry',
    ownerUserId: context.currentUser.id,
    phone: `084${String(Date.now()).slice(-7)}`,
    email: `rollback-${Date.now()}@example.com`
  });

  const originalEnqueueJob = scheduler.enqueueJob;
  scheduler.enqueueJob = async () => {
    throw new Error('QUEUE_FAILURE');
  };

  try {
    await assert.rejects(
      () => handleDomainEvent(context, {
        eventName,
        entityType: 'lead',
        entityId: lead.id,
        eventId: `rollback-${lead.id}`,
        occurredAt: '2026-03-16T09:00:00Z',
        contextJson: { status: 'new', stage: 'inquiry' },
        deferExecution: true
      }),
      /QUEUE_FAILURE/
    );
  } finally {
    scheduler.enqueueJob = originalEnqueueJob;
  }

  const executionResult = await pool.query(
    'select count(*)::int as execution_count from automation_executions where clinic_id = $1 and flow_id = $2 and event_id = $3',
    [context.currentClinic.id, flow.id, `rollback-${lead.id}`]
  );
  const auditResult = await pool.query(
    `
      select count(*)::int as audit_count
      from audit_logs
      where clinic_id = $1 and entity_type = 'lead' and entity_id = $2 and action_type = 'automation.trigger'
        and context_json->>'flowId' = $3
    `,
    [context.currentClinic.id, lead.id, String(flow.id)]
  );
  const jobResult = await pool.query(
    `
      select count(*)::int as job_count
      from worker_jobs
      where clinic_id = $1 and job_type = 'automation.execute' and payload_json->>'executionId' is not null
    `,
    [context.currentClinic.id]
  );

  assert.equal(executionResult.rows[0].execution_count, 0);
  assert.equal(auditResult.rows[0].audit_count, 0);
  assert.equal(jobResult.rows[0].job_count >= 0, true);
  await pool.end();
});