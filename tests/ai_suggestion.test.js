const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { loadConfig } = require('../apps/api/src/config');
const { createLead, updateLeadStageStatus } = require('../apps/api/src/modules/leads/service');
const { convertLeadToCustomer, getCustomerTimeline } = require('../apps/api/src/modules/customers/service');
const {
  getLeadScore,
  getCustomerScore,
  getLeadRecommendations,
  recomputeLeadInsights,
  recomputeCustomerInsights
} = require('../apps/api/src/modules/ai/service');

async function buildContext(pool, clinicSlug = 'demo-clinic') {
  const clinicResult = await pool.query(
    `select id, name, slug, plan, status, timezone, created_at, updated_at from clinics where slug = $1 limit 1`,
    [clinicSlug]
  );
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

test('lead score calculation populates ai_lead_scores', async () => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const context = await buildContext(pool);
  const lead = await createLead(context, {
    fullName: `AI Lead ${Date.now()}`,
    source: 'line',
    status: 'active',
    stage: 'qualified',
    ownerUserId: context.currentUser.id,
    phone: `090${String(Date.now()).slice(-7)}`,
    email: `ai-lead-${Date.now()}@example.com`,
    initialNote: 'Interested in premium package'
  });

  await updateLeadStageStatus(context, lead.id, {
    status: 'active',
    stage: 'consult_booked',
    lastContactedAt: '2026-03-16T09:00:00Z'
  });

  const result = await recomputeLeadInsights(context, lead.id);
  const persisted = await pool.query(`select score from ai_lead_scores where clinic_id = $1 and lead_id = $2`, [context.currentClinic.id, lead.id]);

  assert.ok(result.score.score >= 0 && result.score.score <= 100);
  assert.equal(persisted.rowCount, 1);
  await pool.end();
});

test('customer score calculation populates ai_customer_scores', async () => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const context = await buildContext(pool);
  const lead = await createLead(context, {
    fullName: `AI Customer ${Date.now()}`,
    source: 'referral',
    status: 'won',
    stage: 'converted',
    ownerUserId: context.currentUser.id,
    phone: `091${String(Date.now()).slice(-7)}`,
    email: `ai-customer-${Date.now()}@example.com`
  });
  const customer = await convertLeadToCustomer(context, { leadId: lead.id });

  const result = await recomputeCustomerInsights(context, customer.id);
  const persisted = await pool.query(`select score, lifetime_value_estimate from ai_customer_scores where clinic_id = $1 and customer_id = $2`, [context.currentClinic.id, customer.id]);

  assert.ok(result.score.score >= 0 && result.score.score <= 100);
  assert.ok(result.score.lifetimeValueEstimate >= 0);
  assert.equal(persisted.rowCount, 1);
  await pool.end();
});

test('recommendation generation returns next best action for lead', async () => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const context = await buildContext(pool);
  const leadResult = await pool.query(`select id from leads where clinic_id = $1 order by id asc limit 1`, [context.currentClinic.id]);

  await recomputeLeadInsights(context, leadResult.rows[0].id);
  const recommendations = await getLeadRecommendations(context, leadResult.rows[0].id);

  assert.ok(recommendations.items.length >= 1);
  assert.ok(recommendations.nextBestAction);
  await pool.end();
});

test('ai tenant safety rejects cross-clinic lead access', async () => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const context = await buildContext(pool);
  const clinicSlug = `ai-tenant-${Date.now()}`;
  
  // 1. Insert clinic
  const clinicInsert = await pool.query(
    `insert into clinics (name, slug, plan, status, timezone) values ($1, $2, 'starter', 'active', 'Asia/Bangkok') returning id`,
    ['AI Other Tenant', clinicSlug]
  );
  const clinicId = clinicInsert.rows[0].id;

  // 2. Insert organization
  const orgInsert = await pool.query(
    `insert into organizations (clinic_id, name, slug, status) values ($1, 'AI Other Org', $2, 'active') returning id`,
    [clinicId, `ai-other-org-${Date.now()}`]
  );
  const orgId = orgInsert.rows[0].id;

  // 3. Insert workspace
  const workspaceInsert = await pool.query(
    `insert into workspaces (clinic_id, organization_id, name, slug, status) values ($1, $2, 'Main Workspace', 'main-workspace', 'active') returning id`,
    [clinicId, orgId]
  );
  const workspaceId = workspaceInsert.rows[0].id;

  // 4. Get owner role ID
  const roleResult = await pool.query(`select id from roles where key = 'owner' limit 1`);
  const ownerRoleId = roleResult.rows[0].id;

  // 5. Insert clinic user
  await pool.query(
    `insert into clinic_users (clinic_id, user_id, role, role_id, organization_id, workspace_id, status) values ($1, $2, 'owner', $3, $4, $5, 'active') on conflict (clinic_id, user_id) do nothing`,
    [clinicId, context.currentUser.id, ownerRoleId, orgId, workspaceId]
  );

  // 6. Insert workspace membership
  await pool.query(
    `insert into workspace_memberships (clinic_id, organization_id, workspace_id, user_id, role_id, status, invited_by, invited_at, joined_at) values ($1, $2, $3, $4, $5, 'active', $4, now(), now())`,
    [clinicId, orgId, workspaceId, context.currentUser.id, ownerRoleId]
  );

  const otherContext = await buildContext(pool, clinicSlug);
  const otherLead = await createLead(otherContext, {
    fullName: `Other AI Lead ${Date.now()}`,
    source: 'manual',
    status: 'new',
    stage: 'inquiry',
    ownerUserId: otherContext.currentUser.id,
    phone: `092${String(Date.now()).slice(-7)}`,
    email: `other-ai-${Date.now()}@example.com`
  });

  await assert.rejects(() => getLeadScore(context, otherLead.id), { code: 'LEAD_NOT_FOUND' });
  await pool.end();
});

test('customer timeline includes ai recommendation event after recompute', async () => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const context = await buildContext(pool);
  const lead = await createLead(context, {
    fullName: `AI Timeline ${Date.now()}`,
    source: 'website',
    status: 'won',
    stage: 'converted',
    ownerUserId: context.currentUser.id,
    phone: `093${String(Date.now()).slice(-7)}`,
    email: `ai-timeline-${Date.now()}@example.com`
  });
  const customer = await convertLeadToCustomer(context, { leadId: lead.id });

  await recomputeCustomerInsights(context, customer.id);
  const timeline = await getCustomerTimeline(context.currentClinic.id, customer.id, new URLSearchParams());

  assert.ok(timeline.items.some((item) => item.title === 'ai.recommendation_generated'));
  await pool.end();
});