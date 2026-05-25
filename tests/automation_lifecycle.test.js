const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { loadConfig } = require('../apps/api/src/config');
const { getLifecycleFlowPresets } = require('../apps/api/src/modules/automation/flow-presets');
const { handleDomainEvent } = require('../apps/api/src/modules/automation/service');
const { createLead, updateLeadStageStatus } = require('../apps/api/src/modules/leads/service');
const { runDueJobs } = require('../apps/api/src/modules/worker-engine/scheduler');

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

async function waitForAssertion(assertion, attempts = 20, delayMs = 250) {
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

test('lifecycle flow presets define eight installed flows', () => {
  const presets = getLifecycleFlowPresets();

  assert.equal(presets.length, 8);
  assert.ok(presets.every((preset) => preset.rateLimits.maxExecutionsPerEntity === 1));
  assert.ok(presets.every((preset) => preset.rateLimits.maxMessagesPerDayPerLead === 2));
});

test('lifecycle flow pack is seeded for demo clinic', async () => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  
  // Re-apply the lifecycle flow pack seed to ensure it's populated regardless of previous tests' deletions
  const fs = require('node:fs/promises');
  const path = require('node:path');
  try {
    const seedSql = await fs.readFile(path.resolve(__dirname, '../database/seeds/008_lifecycle_flow_pack.sql'), 'utf8');
    await pool.query(seedSql);
  } catch (err) {
    console.error('Failed to re-apply seed:', err.message);
  }

  const clinicResult = await pool.query(`select id from clinics where slug = 'demo-clinic' limit 1`);
  const result = await pool.query(
    `
      select count(*)::int as flow_count
      from automation_flows
      where clinic_id = $1
        and entry_rule_json->>'presetKey' = any($2::text[])
    `,
    [clinicResult.rows[0].id, getLifecycleFlowPresets().map((preset) => preset.key)]
  );

  assert.equal(result.rows[0].flow_count, 8);
  await pool.end();
});


test('new lead welcome creates execution, task, and outbound log', async () => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const context = await buildContext(pool);
  const startedAt = new Date().toISOString();
  const lead = await createLead(context, {
    fullName: `Lifecycle Test Lead ${Date.now()}`,
    source: 'manual',
    status: 'new',
    stage: 'inquiry',
    ownerUserId: context.currentUser.id,
    phone: '0800000000',
    lineUserId: `line-lifecycle-${Date.now()}`,
    email: `lifecycle-${Date.now()}@example.com`
  });

  await waitForAssertion(async () => {
    await runDueJobs(20, {
      clinicId: context.currentClinic.id,
      jobType: 'automation.execute',
      createdAfter: startedAt
    });

    const executionResult = await pool.query(
      `
        select count(*)::int as execution_count
        from automation_executions ae
        inner join automation_flows af on af.id = ae.flow_id
        where ae.clinic_id = $1
          and ae.entity_type = 'lead'
          and ae.entity_id = $2
          and af.entry_rule_json->>'presetKey' = 'new_lead_welcome'
      `,
      [context.currentClinic.id, lead.id]
    );
    const taskResult = await pool.query(
      `
        select count(*)::int as task_count
        from automation_tasks at
        inner join automation_executions ae on ae.id = at.execution_id
        inner join automation_flows af on af.id = ae.flow_id
        where ae.clinic_id = $1
          and ae.entity_id = $2
          and af.entry_rule_json->>'presetKey' = 'new_lead_welcome'
      `,
      [context.currentClinic.id, lead.id]
    );
    const outboundResult = await pool.query(
      `
        select count(*)::int as outbound_count
        from outbound_messages om
        inner join automation_executions ae on ae.id = om.automation_execution_id
        inner join automation_flows af on af.id = ae.flow_id
        where om.clinic_id = $1
          and om.entity_type = 'lead'
          and om.entity_id = $2
          and om.message_type = 'automation'
          and af.entry_rule_json->>'presetKey' = 'new_lead_welcome'
      `,
      [context.currentClinic.id, lead.id]
    );

    assert.equal(executionResult.rows[0].execution_count, 1);
    assert.equal(taskResult.rows[0].task_count, 1);
    assert.equal(outboundResult.rows[0].outbound_count, 1);
  });
  await pool.end();
});

test('new lead welcome guard respects non-new lead status', async () => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const context = await buildContext(pool);
  const lead = await createLead(context, {
    fullName: `Lifecycle Guard Lead ${Date.now()}`,
    source: 'manual',
    status: 'active',
    stage: 'inquiry',
    ownerUserId: context.currentUser.id,
    phone: '0811111111',
    lineUserId: `line-guard-${Date.now()}`,
    email: `guard-${Date.now()}@example.com`
  });

  const executionResult = await pool.query(
    `
      select count(*)::int as execution_count
      from automation_executions ae
      inner join automation_flows af on af.id = ae.flow_id
      where ae.clinic_id = $1
        and ae.entity_type = 'lead'
        and ae.entity_id = $2
        and af.entry_rule_json->>'presetKey' = 'new_lead_welcome'
    `,
    [context.currentClinic.id, lead.id]
  );

  assert.equal(executionResult.rows[0].execution_count, 0);
  await pool.end();
});

test('qualified stage update triggers hot lead alert exactly once', async () => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const context = await buildContext(pool);
  const lead = await createLead(context, {
    fullName: `Hot Lead ${Date.now()}`,
    source: 'manual',
    status: 'new',
    stage: 'inquiry',
    ownerUserId: context.currentUser.id,
    phone: '0822222222',
    lineUserId: `line-hot-${Date.now()}`,
    email: `hot-${Date.now()}@example.com`
  });

  await updateLeadStageStatus(context, lead.id, {
    status: 'active',
    stage: 'qualified',
    lastContactedAt: '2026-03-16T09:00:00Z'
  });

  const executionResult = await pool.query(
    `
      select count(*)::int as execution_count
      from automation_executions ae
      inner join automation_flows af on af.id = ae.flow_id
      where ae.clinic_id = $1
        and ae.entity_id = $2
        and af.entry_rule_json->>'presetKey' = 'hot_lead_alert'
    `,
    [context.currentClinic.id, lead.id]
  );

  assert.equal(executionResult.rows[0].execution_count, 1);
  await pool.end();
});

test('lost lead recovery creates scheduled outbound after status update event', async () => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const context = await buildContext(pool);
  const lead = await createLead(context, {
    fullName: `Lost Lead ${Date.now()}`,
    source: 'manual',
    status: 'new',
    stage: 'inquiry',
    ownerUserId: context.currentUser.id,
    phone: '0833333333',
    lineUserId: `line-lost-${Date.now()}`,
    email: `lost-${Date.now()}@example.com`
  });

  await handleDomainEvent(context, {
    eventName: 'lead.status.updated',
    entityType: 'lead',
    entityId: lead.id,
    eventId: `lost-${lead.id}`,
    occurredAt: '2026-03-16T10:30:00Z',
    contextJson: { status: 'lost' }
  });

  const outboundResult = await pool.query(
    `
      select om.status, om.scheduled_at
      from outbound_messages om
      inner join automation_executions ae on ae.id = om.automation_execution_id
      inner join automation_flows af on af.id = ae.flow_id
      where om.clinic_id = $1
        and om.entity_id = $2
        and af.entry_rule_json->>'presetKey' = 'lost_lead_recovery'
      order by om.id desc
      limit 1
    `,
    [context.currentClinic.id, lead.id]
  );

  assert.equal(outboundResult.rows[0].status, 'pending');
  assert.ok(outboundResult.rows[0].scheduled_at);
  await pool.end();
});
