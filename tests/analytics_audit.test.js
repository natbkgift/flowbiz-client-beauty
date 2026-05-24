const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { loadConfig } = require('../apps/api/src/config');
const { createLead } = require('../apps/api/src/modules/leads/service');
const { convertLeadToCustomer } = require('../apps/api/src/modules/customers/service');
const { sendLeadManualMessage, createContactIdentity } = require('../apps/api/src/modules/messaging/service');
const { recomputeLeadInsights } = require('../apps/api/src/modules/ai/service');
const { getOverview, getFunnel, getAiAnalytics } = require('../apps/api/src/modules/analytics/service');
const { listAuditLogs, listAuditLogsByEntity } = require('../apps/api/src/modules/audit/service');

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

test('analytics overview calculates daily metrics', async () => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const context = await buildContext(pool);
  const lead = await createLead(context, {
    fullName: `Analytics Lead ${Date.now()}`,
    source: 'line',
    status: 'active',
    stage: 'qualified',
    ownerUserId: context.currentUser.id,
    phone: `095${String(Date.now()).slice(-7)}`,
    email: `analytics-lead-${Date.now()}@example.com`
  });
  await createContactIdentity(context, {
    entityType: 'lead',
    entityId: lead.id,
    channelType: 'email',
    externalId: `analytics-lead-${lead.id}@example.com`,
    displayName: lead.fullName,
    isPrimary: true
  });
  const channelResult = await pool.query(`select id from channels where clinic_id = $1 and channel_type = 'email' order by id asc limit 1`, [context.currentClinic.id]);
  await sendLeadManualMessage(context, lead.id, { channelId: channelResult.rows[0].id, content: 'analytics message test' });
  await recomputeLeadInsights(context, lead.id);

  const overview = await getOverview(context.currentClinic.id, new URLSearchParams());

  assert.ok(overview.daily.leadsCreated >= 1);
  assert.ok(overview.daily.messagesSent >= 1);
  assert.ok(overview.daily.aiRecommendationsGenerated >= 1);
  await pool.end();
});

test('funnel metrics include converted customers stage', async () => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const context = await buildContext(pool);
  const lead = await createLead(context, {
    fullName: `Funnel Lead ${Date.now()}`,
    source: 'manual',
    status: 'won',
    stage: 'converted',
    ownerUserId: context.currentUser.id,
    phone: `096${String(Date.now()).slice(-7)}`,
    email: `funnel-lead-${Date.now()}@example.com`
  });
  await convertLeadToCustomer(context, { leadId: lead.id });

  const funnel = await getFunnel(context.currentClinic.id, new URLSearchParams());

  assert.ok(funnel.items.some((item) => item.stageName === 'customer_converted'));
  await pool.end();
});

test('ai analytics aggregates lead and recommendation counts', async () => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const context = await buildContext(pool);
  const leadResult = await pool.query(`select id from leads where clinic_id = $1 order by id desc limit 1`, [context.currentClinic.id]);
  await recomputeLeadInsights(context, leadResult.rows[0].id);

  const metrics = await getAiAnalytics(context.currentClinic.id, new URLSearchParams());

  assert.ok(metrics.leadsScored >= 1);
  assert.ok(metrics.recommendationsGenerated >= 1);
  await pool.end();
});

test('audit log insertion captures lead create action', async () => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const context = await buildContext(pool);
  const lead = await createLead(context, {
    fullName: `Audit Lead ${Date.now()}`,
    source: 'manual',
    status: 'new',
    stage: 'inquiry',
    ownerUserId: context.currentUser.id,
    phone: `097${String(Date.now()).slice(-7)}`,
    email: `audit-lead-${Date.now()}@example.com`
  });

  const entityLogs = await listAuditLogsByEntity(context.currentClinic.id, 'lead', lead.id);

  assert.ok(entityLogs.items.some((item) => item.actionType === 'lead.create'));
  await pool.end();
});

test('audit list is tenant isolated', async () => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const context = await buildContext(pool);
  const clinicSlug = `audit-tenant-${Date.now()}`;
  const clinicInsert = await pool.query(
    `insert into clinics (name, slug, plan, status, timezone) values ($1, $2, 'starter', 'active', 'Asia/Bangkok') returning id`,
    ['Audit Other Tenant', clinicSlug]
  );
  await pool.query(
    `insert into clinic_users (clinic_id, user_id, role, status) values ($1, $2, 'owner', 'active') on conflict (clinic_id, user_id) do nothing`,
    [clinicInsert.rows[0].id, context.currentUser.id]
  );

  const logs = await listAuditLogs(context.currentClinic.id, new URLSearchParams());
  assert.ok(logs.items.every((item) => item.clinicId === context.currentClinic.id));
  await pool.end();
});