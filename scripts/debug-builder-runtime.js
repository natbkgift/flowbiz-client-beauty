const { Pool } = require('pg');
const { loadConfig } = require('../apps/api/src/config');
const { createLead } = require('../apps/api/src/modules/leads/service');
const {
  createBuilderFlow,
  addBuilderFlowStep,
  getBuilderFlow
} = require('../apps/api/src/modules/automation-builder/service');

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

async function main() {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const context = await buildContext(pool);
  const flow = await createBuilderFlow(context, {
    name: `Builder Runtime ${Date.now()}`,
    flowType: 'custom_builder',
    triggerType: 'event',
    status: 'active',
    trigger: { eventName: 'lead.created', entityType: 'lead' },
    conditions: { statusEquals: 'new' },
    steps: [
      { stepOrder: 1, stepType: 'create_task', configJson: { title: 'Builder runtime task', assignedUserId: context.currentUser.id } }
    ]
  });

  await addBuilderFlowStep(context, flow.id, {
    stepType: 'wait',
    delayMinutes: 10,
    configJson: { title: 'Builder runtime wait' }
  });

  const refreshed = await getBuilderFlow(context.currentClinic.id, flow.id);
  const runtimeFlow = await pool.query('select id, clinic_id, workspace_id, name, status, trigger_type, trigger_event, entry_rule_json, definition_json from automation_flows where id = $1', [flow.id]);
  const runtimeSteps = await pool.query('select step_order, step_type, delay_minutes, config_json from automation_steps where flow_id = $1 order by step_order asc', [flow.id]);

  const lead = await createLead(context, {
    fullName: `Builder Runtime Lead ${Date.now()}`,
    source: 'manual',
    status: 'new',
    stage: 'inquiry',
    ownerUserId: context.currentUser.id,
    phone: `089${String(Date.now()).slice(-7)}`,
    email: `builder-runtime-${Date.now()}@example.com`
  });

  await new Promise((resolve) => setTimeout(resolve, 2000));

  const executionRows = await pool.query('select id, flow_id, workspace_id, entity_type, entity_id, trigger_event, status, context_json, event_id from automation_executions where flow_id = $1 and entity_id = $2 order by id asc', [flow.id, lead.id]);
  const taskRows = await pool.query('select at.id, at.title, at.status, ae.id as execution_id from automation_tasks at inner join automation_executions ae on ae.id = at.execution_id where ae.flow_id = $1 and ae.entity_id = $2 order by at.id asc', [flow.id, lead.id]);
  const workerRows = await pool.query("select id, job_type, status, run_at, attempts, max_attempts, last_error, payload_json from worker_jobs where payload_json->>'executionId' = $1 order by id asc", [String(executionRows.rows[0]?.id || '')]);
  const eventRows = await pool.query('select id, event_type, entity_id, payload_json, created_at from event_store where entity_type = $1 and entity_id = $2 order by id desc limit 10', ['lead', lead.id]);
  console.log(JSON.stringify({
    context: { workspaceId: context.currentWorkspace.id, organizationId: context.currentOrganization.id, userId: context.currentUser.id },
    builderFlow: refreshed,
    runtimeFlow: runtimeFlow.rows[0],
    runtimeSteps: runtimeSteps.rows,
    lead: { id: lead.id, workspaceId: lead.workspaceId, ownerUserId: lead.ownerUserId },
    executionRows: executionRows.rows,
    workerRows: workerRows.rows,
    eventRows: eventRows.rows,
    taskRows: taskRows.rows
  }, null, 2));

  await pool.end();
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
