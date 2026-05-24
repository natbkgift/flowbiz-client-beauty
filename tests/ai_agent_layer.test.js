const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { loadConfig } = require('../apps/api/src/config');
const { createLead, addLeadNote } = require('../apps/api/src/modules/leads/service');
const { authorize } = require('../apps/api/src/modules/rbac/service');
const { createBuilderFlow, publishFlowVersion, listFlowVersions } = require('../apps/api/src/modules/automation-builder/service');
const { executeExecutionById } = require('../apps/api/src/modules/automation/service');
const { scoreLead, generateLeadMessage, getFlowInsights } = require('../apps/api/src/modules/ai/service');
const { runDueJobs } = require('../apps/api/src/modules/worker-engine/scheduler');

async function buildContext(pool, options = {}) {
  const clinicSlug = options.clinicSlug || 'demo-clinic';
  const clinicResult = await pool.query(
    `select id, name, slug, plan, status, timezone, created_at, updated_at from clinics where slug = $1 limit 1`,
    [clinicSlug]
  );

  const membershipResult = await pool.query(
    `
      select u.id, u.email, u.name, cu.role, cu.role_id, cu.organization_id, cu.workspace_id, w.name as workspace_name, w.slug as workspace_slug
      from clinic_users cu
      inner join users u on u.id = cu.user_id
      inner join workspaces w on w.id = cu.workspace_id
      where cu.clinic_id = $1
        and cu.status = 'active'
        and u.status = 'active'
        and ($2::bigint is null or cu.workspace_id = $2)
      order by cu.id asc
      limit 1
    `,
    [clinicResult.rows[0].id, options.workspaceId || null]
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
      id: membershipResult.rows[0].workspace_id,
      name: membershipResult.rows[0].workspace_name,
      slug: membershipResult.rows[0].workspace_slug
    },
    currentMembership: {
      organizationId: membershipResult.rows[0].organization_id,
      workspaceId: membershipResult.rows[0].workspace_id,
      roleId: membershipResult.rows[0].role_id,
      role: membershipResult.rows[0].role,
      permissions: ['ai.read', 'ai.manage', 'automation.read', 'automation.manage', 'lead.write', 'lead.read']
    }
  };
}

async function ensureAlternateWorkspace(pool, context) {
  const existing = await pool.query(
    `select id, name, slug from workspaces where clinic_id = $1 and id <> $2 order by id asc limit 1`,
    [context.currentClinic.id, context.currentWorkspace.id]
  );

  if (existing.rowCount > 0) {
    return existing.rows[0];
  }

  const workspaceInsert = await pool.query(
    `
      insert into workspaces (clinic_id, organization_id, name, slug, status)
      values ($1, $2, $3, $4, 'active')
      returning id, name, slug
    `,
    [context.currentClinic.id, context.currentOrganization.id, 'AI Isolation Workspace', `ai-isolation-${Date.now()}`]
  );

  await pool.query(
    `
      update clinic_users
      set workspace_id = workspace_id
      where clinic_id = $1 and user_id = $2
    `,
    [context.currentClinic.id, context.currentUser.id]
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
      workspaceInsert.rows[0].id,
      context.currentUser.id,
      context.currentMembership.roleId
    ]
  );

  return workspaceInsert.rows[0];
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

function createBuilderDefinition(name, assignedUserId) {
  return {
    name,
    flowType: 'ai_flow_test',
    status: 'active',
    nodes: [
      {
        id: 'trigger-1',
        type: 'trigger',
        position: { x: 60, y: 120 },
        config: { eventName: 'lead.created', entityType: 'lead' }
      },
      {
        id: 'action-1',
        type: 'action',
        position: { x: 320, y: 120 },
        config: { actionType: 'create_task', title: 'AI insight task', assignedUserId }
      }
    ],
    edges: [
      { id: 'edge-1', source: 'trigger-1', target: 'action-1' }
    ]
  };
}

test('lead scoring updates score automatically and persists intent_score', async () => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const context = await buildContext(pool);
  const lead = await createLead(context, {
    fullName: `AI Agent Lead ${Date.now()}`,
    source: 'line',
    status: 'new',
    stage: 'inquiry',
    ownerUserId: context.currentUser.id,
    phone: `089${String(Date.now()).slice(-7)}`,
    email: `ai-agent-lead-${Date.now()}@example.com`
  });

  await addLeadNote(context, lead.id, {
    noteType: 'general',
    content: 'Interested in package and asked for available times'
  });

  await waitForAssertion(async () => {
    const scoreRow = await pool.query(`select score from ai_lead_scores where clinic_id = $1 and lead_id = $2`, [context.currentClinic.id, lead.id]);
    const leadRow = await pool.query(`select intent_score from leads where clinic_id = $1 and id = $2`, [context.currentClinic.id, lead.id]);

    assert.equal(scoreRow.rowCount, 1);
    assert.ok(scoreRow.rows[0].score >= 0 && scoreRow.rows[0].score <= 100);
    assert.equal(leadRow.rows[0].intent_score, scoreRow.rows[0].score);
  });

  const rescored = await scoreLead(context, lead.id);
  assert.ok(rescored.intentScore >= 0 && rescored.intentScore <= 100);
  await pool.end();
});

test('message generation returns short personalized text', async () => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const context = await buildContext(pool);
  const lead = await createLead(context, {
    fullName: `Message Lead ${Date.now()}`,
    source: 'website',
    status: 'active',
    stage: 'qualified',
    ownerUserId: context.currentUser.id,
    phone: `088${String(Date.now()).slice(-7)}`,
    email: `message-lead-${Date.now()}@example.com`
  });

  const result = await generateLeadMessage(context, {
    leadId: lead.id,
    tone: 'friendly',
    context: { goal: 'ชวนจองคิวปรึกษา' }
  });

  assert.equal(result.leadId, Number(lead.id));
  assert.equal(typeof result.messageText, 'string');
  assert.ok(result.messageText.length > 20);
  await pool.end();
});

test('flow insights generated from execution data', async () => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const context = await buildContext(pool);
  const flow = await createBuilderFlow(context, createBuilderDefinition(`Insight Flow ${Date.now()}`, context.currentUser.id));
  const version = (await listFlowVersions(context, flow.id)).items[0];
  await publishFlowVersion(context, flow.id, version.id);
  const lead = await createLead(context, {
    fullName: `Insight Lead ${Date.now()}`,
    source: 'manual',
    status: 'new',
    stage: 'inquiry',
    ownerUserId: context.currentUser.id,
    phone: `087${String(Date.now()).slice(-7)}`,
    email: `insight-lead-${Date.now()}@example.com`
  });

  await waitForAssertion(async () => {
    await runDueJobs(10);
    const executionResult = await pool.query(
      `select id from automation_executions where clinic_id = $1 and flow_id = $2 and entity_id = $3 order by id desc limit 1`,
      [context.currentClinic.id, flow.id, lead.id]
    );
    assert.equal(executionResult.rowCount, 1);
    await executeExecutionById(context, executionResult.rows[0].id);
  });

  const insight = await getFlowInsights(context, flow.id);
  const storedInsight = await pool.query(
    `select count(*)::int as insight_count from ai_insights where clinic_id = $1 and workspace_id = $2 and entity_type = 'automation_flow' and entity_id = $3`,
    [context.currentClinic.id, context.currentWorkspace.id, flow.id]
  );

  assert.ok(Array.isArray(insight.bottlenecks));
  assert.ok(Array.isArray(insight.failurePoints));
  assert.ok(Array.isArray(insight.suggestedChanges));
  assert.equal(storedInsight.rows[0].insight_count >= 1, true);
  await pool.end();
});

test('RBAC enforcement blocks ai.manage when permission missing', async () => {
  const viewerContext = {
    currentMembership: {
      permissions: ['ai.read']
    }
  };

  assert.doesNotThrow(() => authorize(viewerContext, 'ai', 'read'));
  assert.throws(() => authorize(viewerContext, 'ai', 'manage'), /Missing permission ai.manage/);
});

test('workspace isolation prevents reading lead from another workspace', async () => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const context = await buildContext(pool);
  const alternateWorkspace = await ensureAlternateWorkspace(pool, context);
  const alternateContext = {
    ...context,
    currentWorkspace: {
      id: alternateWorkspace.id,
      name: alternateWorkspace.name,
      slug: alternateWorkspace.slug
    },
    currentMembership: {
      ...context.currentMembership,
      workspaceId: alternateWorkspace.id
    }
  };
  const lead = await createLead(alternateContext, {
    fullName: `Isolation Lead ${Date.now()}`,
    source: 'manual',
    status: 'new',
    stage: 'inquiry',
    ownerUserId: alternateContext.currentUser.id,
    phone: `086${String(Date.now()).slice(-7)}`,
    email: `isolation-lead-${Date.now()}@example.com`
  });

  await assert.rejects(
    () => generateLeadMessage(context, { leadId: lead.id, tone: 'professional' }),
    /Lead not found\./
  );
  await pool.end();
});
