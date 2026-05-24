const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { loadConfig } = require('../apps/api/src/config');
const { createLead } = require('../apps/api/src/modules/leads/service');
const { convertLeadToCustomer } = require('../apps/api/src/modules/customers/service');
const { getLeadPrediction, getCustomerPrediction } = require('../apps/api/src/modules/ai-engine/prediction');

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

test('lead prediction stores conversion probability', async () => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const context = await buildContext(pool);
  const lead = await createLead(context, {
    fullName: `Prediction Lead ${Date.now()}`,
    source: 'manual',
    status: 'new',
    stage: 'qualified',
    ownerUserId: context.currentUser.id,
    phone: `091${String(Date.now()).slice(-7)}`,
    email: `prediction-lead-${Date.now()}@example.com`,
    intentScore: 88
  });

  const prediction = await getLeadPrediction(context, lead.id);
  const stored = await pool.query(`select count(*)::int as prediction_count from ai_predictions where clinic_id = $1 and entity_type = 'lead' and entity_id = $2 and prediction_type = 'conversion_probability'`, [context.currentClinic.id, lead.id]);

  assert.equal(prediction.predictionType, 'conversion_probability');
  assert.ok(prediction.score >= 0 && prediction.score <= 1);
  assert.ok(prediction.nextBestAction);
  assert.equal(stored.rows[0].prediction_count, 1);
  await pool.end();
});

test('customer prediction stores churn probability', async () => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const context = await buildContext(pool);
  const lead = await createLead(context, {
    fullName: `Prediction Customer ${Date.now()}`,
    source: 'manual',
    status: 'won',
    stage: 'converted',
    ownerUserId: context.currentUser.id,
    phone: `092${String(Date.now()).slice(-7)}`,
    email: `prediction-customer-${Date.now()}@example.com`,
    intentScore: 72
  });
  const customer = await convertLeadToCustomer(context, { leadId: lead.id });

  const prediction = await getCustomerPrediction(context, customer.id);
  const stored = await pool.query(`select count(*)::int as prediction_count from ai_predictions where clinic_id = $1 and entity_type = 'customer' and entity_id = $2 and prediction_type = 'churn_probability'`, [context.currentClinic.id, customer.id]);

  assert.equal(prediction.predictionType, 'churn_probability');
  assert.ok(prediction.score >= 0 && prediction.score <= 1);
  assert.ok(prediction.nextBestAction);
  assert.equal(stored.rows[0].prediction_count, 1);
  await pool.end();
});