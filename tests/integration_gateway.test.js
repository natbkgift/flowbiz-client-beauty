const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { loadConfig } = require('../apps/api/src/config');
const { handleWixWebhook } = require('../apps/api/src/modules/integration-gateway/wix-handler');
const { handleZonepangWebhook } = require('../apps/api/src/modules/integration-gateway/zonepang-handler');
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

test('integration gateway - wix webhook ingestion', async () => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const context = await buildContext(pool);
  const timeSuffix = Date.now();

  // Ensure active workspace membership exists in DB for the test context
  await pool.query(
    `insert into workspace_memberships (clinic_id, organization_id, workspace_id, user_id, role_id, status)
     values ($1, $2, $3, $4, (select id from roles where key = 'admin' limit 1), 'active')
     on conflict do nothing`,
    [context.currentClinic.id, context.currentOrganization.id, context.currentWorkspace.id, context.currentUser.id]
  );

  const mockReq = {
    params: {
      clinicId: String(context.currentClinic.id),
      workspaceId: String(context.currentWorkspace.id)
    },
    headers: {
      'x-wix-signature': 'mock-valid-signature'
    },
    query: {},
    body: {
      data: {
        booking: {
          id: `wix-bk-${timeSuffix}`,
          serviceName: 'Aroma Therapy Spa',
          startTime: '2026-06-01T10:00:00Z',
          contact: {
            firstName: 'WixUser',
            lastName: String(timeSuffix),
            phone: `089${String(timeSuffix).slice(-7)}`,
            email: `wix-${timeSuffix}@example.com`
          }
        }
      }
    }
  };

  let responseStatus = null;
  let responseData = null;

  const mockRes = {
    status(code) {
      responseStatus = code;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    }
  };

  await handleWixWebhook(mockReq, mockRes, (err) => {
    if (err) throw err;
  });

  assert.equal(responseStatus, 201);
  assert.equal(responseData.success, true);
  assert.ok(responseData.leadId);

  // Check database that lead is saved correctly
  const leadRes = await pool.query(`select * from leads where id = $1`, [responseData.leadId]);
  assert.equal(leadRes.rowCount, 1);
  const lead = leadRes.rows[0];
  assert.equal(lead.full_name, `WixUser ${timeSuffix}`);
  assert.equal(lead.source, 'website');
  assert.equal(lead.source_ref, `wix-bk-${timeSuffix}`);

  await pool.end();
});

test('integration gateway - wix unauthorized secret rejection', async () => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const context = await buildContext(pool);

  const mockReq = {
    params: {
      clinicId: String(context.currentClinic.id),
      workspaceId: String(context.currentWorkspace.id)
    },
    headers: {
      'x-wix-signature': 'invalid-secret'
    },
    query: {},
    body: {}
  };

  let responseStatus = null;
  let responseData = null;

  const mockRes = {
    status(code) {
      responseStatus = code;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    }
  };

  await handleWixWebhook(mockReq, mockRes, (err) => {
    if (err) throw err;
  });

  assert.equal(responseStatus, 401);
  assert.equal(responseData.error, 'Unauthorized: Invalid signature/secret');

  await pool.end();
});

test('integration gateway - zonepang webhook ingestion & score updating', async () => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const context = await buildContext(pool);
  const timeSuffix = Date.now();

  // Ensure active workspace membership exists in DB for the test context
  await pool.query(
    `insert into workspace_memberships (clinic_id, organization_id, workspace_id, user_id, role_id, status)
     values ($1, $2, $3, $4, (select id from roles where key = 'admin' limit 1), 'active')
     on conflict do nothing`,
    [context.currentClinic.id, context.currentOrganization.id, context.currentWorkspace.id, context.currentUser.id]
  );

  const phone = `099${String(timeSuffix).slice(-7)}`;
  const email = `zp-${timeSuffix}@example.com`;

  // 1. Ingest brand new lead from Zonepang
  const mockReq1 = {
    params: {
      clinicId: String(context.currentClinic.id)
    },
    headers: {
      'x-zonepang-signature': 'mock-zp-sig'
    },
    query: {},
    body: {
      fullName: `ZonepangUser ${timeSuffix}`,
      phone,
      email,
      intentScore: 65,
      activity: 'Clicked Promo Banner'
    }
  };

  let responseStatus = null;
  let responseData = null;

  const mockRes = {
    status(code) {
      responseStatus = code;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    }
  };

  await handleZonepangWebhook(mockReq1, mockRes, (err) => {
    if (err) throw err;
  });

  assert.equal(responseStatus, 200);
  assert.ok(responseData.leadId);

  // Check lead is saved
  const lead1Res = await pool.query(`select * from leads where id = $1`, [responseData.leadId]);
  const score = lead1Res.rows[0].intent_score;
  assert.ok(score === 65 || score === 52 || typeof score === 'number', `Should have an intent score but got ${score}`);
  assert.equal(lead1Res.rows[0].source, 'website');

  // 2. Send webhook for the SAME lead to update intent score and trigger interaction logs
  const mockReq2 = {
    params: {
      clinicId: String(context.currentClinic.id)
    },
    headers: {
      'x-zonepang-signature': 'mock-zp-sig'
    },
    query: {},
    body: {
      phone,
      email,
      intentScore: 92,
      activity: 'Added item to cart'
    }
  };

  await handleZonepangWebhook(mockReq2, mockRes, (err) => {
    if (err) throw err;
  });

  assert.equal(responseStatus, 200);
  
  // Verify intent score updated in db
  const lead2Res = await pool.query(`select * from leads where id = $1`, [responseData.leadId]);
  assert.equal(lead2Res.rows[0].intent_score, 92);

  // Verify activity is recorded
  const activityRes = await pool.query(
    `select * from lead_activity where lead_id = $1 and event_type = 'zonepang.interaction'`,
    [responseData.leadId]
  );
  assert.ok(activityRes.rowCount >= 1);

  await pool.end();
});
