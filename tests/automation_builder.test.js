const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { loadConfig } = require('../apps/api/src/config');
const { createLead } = require('../apps/api/src/modules/leads/service');
const {
  validateBuilderDefinition,
  createBuilderFlow,
  createFlowVersion,
  getBuilderFlow,
  listFlowVersions,
  getFlowVersionDetail,
  publishFlowVersion,
  getExecutionSteps
} = require('../apps/api/src/modules/automation-builder/service');
const { executeExecutionById } = require('../apps/api/src/modules/automation/service');
const { authorize } = require('../apps/api/src/modules/rbac/service');

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
      role: membershipResult.rows[0].role,
      permissions: ['automation.read', 'automation.manage']
    }
  };
}

function createDefinition(name, overrides = {}) {
  return {
    name,
    flowType: 'visual_builder',
    status: 'draft',
    nodes: [
      {
        id: 'trigger-1',
        type: 'trigger',
        position: { x: 60, y: 140 },
        config: { eventName: 'lead.created', entityType: 'lead' }
      },
      {
        id: 'action-1',
        type: 'action',
        position: { x: 320, y: 140 },
        config: { actionType: 'create_task', title: 'Builder task', assignedUserId: overrides.assignedUserId }
      }
    ],
    edges: [
      {
        id: 'edge-1',
        source: 'trigger-1',
        target: 'action-1'
      }
    ],
    ...overrides
  };
}

async function waitForAssertion(assertion, attempts = 24, delayMs = 250) {
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

test('create draft version stores snapshots without publishing flow', async () => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const context = await buildContext(pool);
  const flow = await createBuilderFlow(context, createDefinition(`Builder Draft ${Date.now()}`, { assignedUserId: context.currentUser.id }));
  const draftVersion = await createFlowVersion(context, flow.id, {
    ...createDefinition(`${flow.name} v2`, { assignedUserId: context.currentUser.id }),
    nodes: [
      ...createDefinition(flow.name, { assignedUserId: context.currentUser.id }).nodes,
      {
        id: 'delay-1',
        type: 'delay',
        position: { x: 560, y: 140 },
        config: { delayMinutes: 5 }
      }
    ],
    edges: [
      { id: 'edge-1', source: 'trigger-1', target: 'action-1' },
      { id: 'edge-2', source: 'action-1', target: 'delay-1' }
    ]
  });

  const versions = await listFlowVersions(context, flow.id);
  const persistedFlow = await getBuilderFlow(context, flow.id);

  assert.equal(versions.items.length >= 2, true);
  assert.equal(draftVersion.versionNumber, 2);
  assert.equal(persistedFlow.isPublished, false);
  assert.equal(persistedFlow.currentVersionId, null);
  await pool.end();
});

test('publish version activates flow and keeps exactly one published version', async () => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const context = await buildContext(pool);
  const flow = await createBuilderFlow(context, createDefinition(`Builder Publish ${Date.now()}`, { assignedUserId: context.currentUser.id }));
  const draftVersion = await createFlowVersion(context, flow.id, {
    ...createDefinition(`${flow.name} v2`, { assignedUserId: context.currentUser.id }),
    nodes: [
      {
        id: 'trigger-1',
        type: 'trigger',
        position: { x: 60, y: 140 },
        config: { eventName: 'lead.created', entityType: 'lead' }
      },
      {
        id: 'condition-1',
        type: 'condition',
        position: { x: 280, y: 140 },
        config: { field: 'stage', operator: 'equals', value: 'inquiry' }
      },
      {
        id: 'action-1',
        type: 'action',
        position: { x: 520, y: 140 },
        config: { actionType: 'create_task', title: 'Published task', assignedUserId: context.currentUser.id }
      }
    ],
    edges: [
      { id: 'edge-1', source: 'trigger-1', target: 'condition-1' },
      { id: 'edge-2', source: 'condition-1', target: 'action-1' }
    ]
  });

  const published = await publishFlowVersion(context, flow.id, draftVersion.id);
  const flowRow = await pool.query(`select current_version_id, is_published, status from automation_flows where id = $1`, [flow.id]);
  const versionRows = await pool.query(
    `select id, is_published from automation_flow_versions where flow_id = $1 order by version_number asc`,
    [flow.id]
  );

  assert.equal(published.currentVersionId, draftVersion.id);
  assert.equal(flowRow.rows[0].current_version_id, draftVersion.id);
  assert.equal(flowRow.rows[0].is_published, true);
  assert.equal(flowRow.rows[0].status, 'active');
  assert.equal(versionRows.rows.filter((row) => row.is_published).length, 1);
  await pool.end();
});

test('version switching deactivates previous published version', async () => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const context = await buildContext(pool);
  const flow = await createBuilderFlow(context, createDefinition(`Builder Switch ${Date.now()}`, { assignedUserId: context.currentUser.id }));
  const versionOne = await getFlowVersionDetail(context, flow.id, (await listFlowVersions(context, flow.id)).items[0].id);
  await publishFlowVersion(context, flow.id, versionOne.id);

  const versionTwo = await createFlowVersion(context, flow.id, {
    ...createDefinition(`${flow.name} v2`, { assignedUserId: context.currentUser.id }),
    nodes: [
      {
        id: 'trigger-1',
        type: 'trigger',
        position: { x: 60, y: 140 },
        config: { eventName: 'lead.created', entityType: 'lead' }
      },
      {
        id: 'action-1',
        type: 'action',
        position: { x: 300, y: 120 },
        config: { actionType: 'create_task', title: 'Version 2 task', assignedUserId: context.currentUser.id }
      },
      {
        id: 'delay-1',
        type: 'delay',
        position: { x: 540, y: 120 },
        config: { delayMinutes: 10 }
      }
    ],
    edges: [
      { id: 'edge-1', source: 'trigger-1', target: 'action-1' },
      { id: 'edge-2', source: 'action-1', target: 'delay-1' }
    ]
  });
  const switched = await publishFlowVersion(context, flow.id, versionTwo.id);
  const versionRows = await pool.query(
    `select id, is_published from automation_flow_versions where flow_id = $1 order by version_number asc`,
    [flow.id]
  );

  assert.equal(switched.currentVersionId, versionTwo.id);
  assert.equal(versionRows.rows.find((row) => row.id === versionOne.id).is_published, false);
  assert.equal(versionRows.rows.find((row) => row.id === versionTwo.id).is_published, true);
  await pool.end();
});

test('flow validation rejects disconnected and circular graphs', async () => {
  assert.throws(
    () => validateBuilderDefinition({
      name: 'Disconnected',
      nodes: [
        { id: 'trigger-1', type: 'trigger', position: { x: 0, y: 0 }, config: { eventName: 'lead.created', entityType: 'lead' } },
        { id: 'action-1', type: 'action', position: { x: 0, y: 0 }, config: { actionType: 'create_task' } },
        { id: 'action-2', type: 'action', position: { x: 0, y: 0 }, config: { actionType: 'create_task' } }
      ],
      edges: [{ id: 'edge-1', source: 'trigger-1', target: 'action-1' }]
    }),
    /disconnected/i
  );

  assert.throws(
    () => validateBuilderDefinition({
      name: 'Loop',
      nodes: [
        { id: 'trigger-1', type: 'trigger', position: { x: 0, y: 0 }, config: { eventName: 'lead.created', entityType: 'lead' } },
        { id: 'action-1', type: 'action', position: { x: 0, y: 0 }, config: { actionType: 'create_task' } }
      ],
      edges: [
        { id: 'edge-1', source: 'trigger-1', target: 'action-1' },
        { id: 'edge-2', source: 'action-1', target: 'trigger-1' }
      ]
    }),
    /circular/i
  );
});

test('execution debugger returns step-by-step execution data for published flow', async () => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const context = await buildContext(pool);
  const flow = await createBuilderFlow(context, createDefinition(`Builder Runtime ${Date.now()}`, { assignedUserId: context.currentUser.id }));
  const version = (await listFlowVersions(context, flow.id)).items[0];
  await publishFlowVersion(context, flow.id, version.id);

  const lead = await createLead(context, {
    fullName: `Builder Debug Lead ${Date.now()}`,
    source: 'manual',
    status: 'new',
    stage: 'inquiry',
    ownerUserId: context.currentUser.id,
    phone: `089${String(Date.now()).slice(-7)}`,
    email: `builder-debug-${Date.now()}@example.com`
  });

  let executionId = null;
  await waitForAssertion(async () => {
    const executionResult = await pool.query(
      `
        select id
        from automation_executions
        where clinic_id = $1 and flow_id = $2 and entity_type = 'lead' and entity_id = $3
        order by id desc
        limit 1
      `,
      [context.currentClinic.id, flow.id, lead.id]
    );

    assert.equal(executionResult.rowCount, 1);
    executionId = executionResult.rows[0].id;
  });
  await executeExecutionById(context, executionId);

  let steps = { items: [] };
  await waitForAssertion(async () => {
    steps = await getExecutionSteps(context, executionId);
    assert.equal(steps.items.length >= 1, true);
  });

  assert.equal(typeof steps.items[0].step_id, 'number');
  assert.equal(typeof steps.items[0].step_type, 'string');
  assert.ok(Object.prototype.hasOwnProperty.call(steps.items[0], 'input_data'));
  assert.ok(Object.prototype.hasOwnProperty.call(steps.items[0], 'output_data'));
  assert.ok(Object.prototype.hasOwnProperty.call(steps.items[0], 'error'));
  assert.ok(Object.prototype.hasOwnProperty.call(steps.items[0], 'duration'));
  await pool.end();
});

test('RBAC enforcement allows automation.read and blocks automation.manage for viewer', async () => {
  const viewerContext = {
    currentMembership: {
      permissions: ['automation.read']
    }
  };

  assert.doesNotThrow(() => authorize(viewerContext, 'automation', 'read'));
  assert.throws(() => authorize(viewerContext, 'automation', 'manage'), /Missing permission automation.manage/);
});
