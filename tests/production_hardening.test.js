const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { loadConfig } = require('../apps/api/src/config');
const { checkRateLimit } = require('../apps/api/src/common/rate-limiter');
const { enqueueJob, runDueJobs } = require('../apps/api/src/modules/worker-engine/scheduler');
const { getExecutiveAnalyticsSummary } = require('../apps/api/src/modules/analytics/executive-service');
const { createLead } = require('../apps/api/src/modules/leads/service');

async function buildContext(pool) {
  const clinicResult = await pool.query(`select id, name, slug, plan, status, timezone from clinics where slug = 'demo-clinic' limit 1`);
  const clinicId = clinicResult.rows[0].id;
  
  const workspaceResult = await pool.query(`select id, organization_id from workspaces where clinic_id = $1 limit 1`, [clinicId]);
  const workspaceId = workspaceResult.rows[0].id;
  const organizationId = workspaceResult.rows[0].organization_id;

  const membershipResult = await pool.query(
    `
      select u.id, u.email, u.name, cu.role
      from clinic_users cu
      inner join users u on u.id = cu.user_id
      where cu.clinic_id = $1 and cu.status = 'active' and u.status = 'active'
      order by cu.id asc
      limit 1
    `,
    [clinicId]
  );

  return {
    currentClinic: {
      id: clinicId,
      name: clinicResult.rows[0].name,
      slug: clinicResult.rows[0].slug,
      plan: clinicResult.rows[0].plan,
      status: clinicResult.rows[0].status,
      timezone: clinicResult.rows[0].timezone
    },
    currentUser: {
      id: membershipResult.rows[0].id,
      email: membershipResult.rows[0].email,
      name: membershipResult.rows[0].name,
      role: membershipResult.rows[0].role
    },
    currentWorkspace: {
      id: workspaceId
    },
    currentOrganization: {
      id: organizationId
    }
  };
}

test('production hardening - API rate limiting blocks excessive requests', async () => {
  const req = {
    params: { clinicId: 'test-limit-clinic' },
    query: {},
    headers: { 'x-forwarded-for': '192.168.1.100' },
    socket: {}
  };

  // 1. First 3 requests are allowed within a limit of 3
  const limit = 3;
  const windowMs = 5000;

  assert.ok(checkRateLimit(req, limit, windowMs).allowed);
  assert.ok(checkRateLimit(req, limit, windowMs).allowed);
  assert.ok(checkRateLimit(req, limit, windowMs).allowed);

  // 2. 4th request exceeds the limit and is blocked
  const blocked = checkRateLimit(req, limit, windowMs);
  assert.equal(blocked.allowed, false);
  assert.match(blocked.message, /Rate limit exceeded/);
});

test('production hardening - worker DLQ archives failed jobs', async () => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const context = await buildContext(pool);

  // 1. Enqueue a job that is designed to fail (automation execution with invalid non-existent ID)
  // Set maxAttempts to 1 to force immediate transition to DLQ on first failure
  const job = await enqueueJob({
    clinicId: context.currentClinic.id,
    jobType: 'automation.execute',
    payloadJson: {
      executionId: 999999, // non-existent ID
      workspaceId: context.currentWorkspace.id,
      actorUserId: context.currentUser.id
    },
    maxAttempts: 1,
    runAt: new Date(Date.now() - 10000).toISOString() // 10 seconds in the past to avoid clock drift
  });

  // Ensure it has 0 attempts initially
  assert.equal(job.attempts, 0);

  // 2. Run the worker loop to process the failing job
  const runResult = await runDueJobs(10);

  // 3. Verify job is removed from active worker_jobs queue
  const reloadedJob = await pool.query('select * from worker_jobs where id = $1', [job.id]);
  assert.equal(reloadedJob.rowCount, 0);

  // 4. Verify job is archived inside dead_letter_jobs (DLQ)
  const dlqJob = await pool.query('select * from dead_letter_jobs where job_id = $1 order by id desc limit 1', [job.id]);
  assert.equal(dlqJob.rowCount, 1);
  assert.equal(dlqJob.rows[0].job_type, 'automation.execute');
  assert.match(dlqJob.rows[0].last_error, /Automation execution not found/i);

  await pool.end();
});

test('production hardening - executive franchise analytics summary aggregator', async () => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const context = await buildContext(pool);
  const timeSuffix = Date.now();

  // Create mock leads under the same organization
  const lead1 = await createLead(context, {
    fullName: `Hardening Lead A ${timeSuffix}`,
    source: 'manual',
    status: 'active',
    stage: 'inquiry',
    ownerUserId: context.currentUser.id,
    phone: `084${String(timeSuffix).slice(-7)}`,
    email: `hard-a-${timeSuffix}@example.com`
  });

  // Explicitly set stage = converted to test conversion rate
  await pool.query("update leads set stage = 'converted' where id = $1", [lead1.id]);

  const summary = await getExecutiveAnalyticsSummary(context.currentOrganization.id);
  
  assert.equal(summary.organizationId, Number(context.currentOrganization.id));
  assert.ok(summary.summary.totalLeads >= 1);
  assert.ok(summary.summary.convertedLeads >= 1);
  assert.ok(summary.summary.averageConversionRate > 0.0);
  assert.ok(Array.isArray(summary.topPerformingClinics));

  await pool.end();
});
