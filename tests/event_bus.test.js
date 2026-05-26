const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { loadConfig } = require('../apps/api/src/config');
const { registerSubscriber } = require('../apps/api/src/modules/event-bus/event_bus');
const { publishDomainEvent } = require('../apps/api/src/modules/event-bus/publisher');
const { runDueJobs } = require('../apps/api/src/modules/worker-engine/scheduler');
const { createLead } = require('../apps/api/src/modules/leads/service');

async function buildContext(pool) {
  const clinicResult = await pool.query(`select id, name, slug, plan, status, timezone, created_at, updated_at from clinics where slug = 'demo-clinic' limit 1`);
  const membershipResult = await pool.query(
    `
      select u.id, u.email, u.name, cu.role
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
    }
  };
}

async function waitForWorkerJob(pool, jobId, clinicId, attempts = 12, batchSize = 50) {
  let lastResult = { results: [] };

  for (let index = 0; index < attempts; index += 1) {
    lastResult = await runDueJobs(batchSize, { clinicId, jobIds: [jobId] });
    const reloaded = await pool.query('select status from worker_jobs where id = $1', [jobId]);

    if (reloaded.rows[0]?.status === 'completed') {
      return lastResult;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return lastResult;
}

test('event bus stores lead events and triggers subscribers', async () => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const context = await buildContext(pool);

  // Re-apply automation engine seeds to ensure a triggered flow is active in the database
  const fs = require('node:fs/promises');
  const path = require('node:path');
  try {
    const seedSql = await fs.readFile(path.resolve(__dirname, '../database/seeds/005_automation_engine_seed.sql'), 'utf8');
    await pool.query(seedSql);
  } catch (err) {
    console.error('Failed to re-apply automation engine seed:', err.message);
  }

  const lead = await createLead(context, {
    fullName: `Event Bus Lead ${Date.now()}`,
    source: 'manual',
    status: 'new',
    stage: 'inquiry',
    ownerUserId: context.currentUser.id,
    phone: `086${String(Date.now()).slice(-7)}`,
    email: `event-bus-${Date.now()}@example.com`
  });

  const eventResult = await pool.query(
    `select * from event_store where clinic_id = $1 and event_type = 'lead.created' and entity_id = $2 order by id desc limit 1`,
    [context.currentClinic.id, lead.id]
  );
  
  // Poll until automation execution and ai score count are >= 1, up to 20 attempts, running due jobs to ensure they process
  let executionCount = 0;
  let scoreCount = 0;
  for (let i = 0; i < 20; i++) {
    await runDueJobs(10, { clinicId: context.currentClinic.id });
    const execRes = await pool.query(
      `select count(*)::int as execution_count from automation_executions where clinic_id = $1 and entity_type = 'lead' and entity_id = $2`,
      [context.currentClinic.id, lead.id]
    );
    const aiRes = await pool.query(
      `select count(*)::int as score_count from ai_lead_scores where clinic_id = $1 and lead_id = $2`,
      [context.currentClinic.id, lead.id]
    );
    executionCount = execRes.rows[0].execution_count;
    scoreCount = aiRes.rows[0].score_count;
    if (executionCount >= 1 && scoreCount >= 1) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  assert.equal(eventResult.rowCount, 1);
  assert.ok(executionCount >= 1, `Should have at least 1 automation execution, got ${executionCount}`);
  assert.ok(scoreCount >= 1, `Should have at least 1 AI score record, got ${scoreCount}`);
  await pool.end();
});

test('event bus queues failed subscribers for retry and replays them through worker engine', async () => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const context = await buildContext(pool);
  const lead = await createLead(context, {
    fullName: `Retry Event Lead ${Date.now()}`,
    source: 'manual',
    status: 'new',
    stage: 'inquiry',
    ownerUserId: context.currentUser.id,
    phone: `086${String(Date.now()).slice(-7)}`,
    email: `event-retry-${Date.now()}@example.com`
  });
  const eventType = `custom.retry.${Date.now()}`;
  const subscriberName = `retry-subscriber-${Date.now()}`;
  let attempts = 0;

  registerSubscriber({
    name: subscriberName,
    supports(event) {
      return event.eventType === eventType;
    },
    async handle() {
      attempts += 1;

      if (attempts === 1) {
        throw new Error('TRANSIENT_SUBSCRIBER_FAILURE');
      }
    }
  });

  const publishResult = await publishDomainEvent({
    clinicId: context.currentClinic.id,
    eventType,
    entityType: 'lead',
    entityId: lead.id,
    payloadJson: { actorUserId: context.currentUser.id }
  });
  const retryJobs = await pool.query(
    `
      select id, status
      from worker_jobs
      where clinic_id = $1 and job_type = 'event.dispatch.retry' and payload_json->>'eventId' = $2
      order by id desc
      limit 1
    `,
    [context.currentClinic.id, String(publishResult.event.id)]
  );

  assert.ok(publishResult.subscriberResults.some((item) => item.name === subscriberName && item.status === 'failed'));
  assert.equal(retryJobs.rowCount, 1);

  await waitForWorkerJob(pool, retryJobs.rows[0].id, context.currentClinic.id);
  const reloaded = await pool.query('select status from worker_jobs where id = $1', [retryJobs.rows[0].id]);

  assert.equal(reloaded.rows[0].status, 'completed');
  assert.equal(attempts, 2);
  await pool.end();
});
