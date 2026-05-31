'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { loadConfig } = require('../apps/api/src/config');
const { AppError } = require('../apps/api/src/common/errors');
const { json } = require('../apps/api/src/common/http');
const { handlePublicLeadRoutes } = require('../apps/api/src/modules/public-leads/routes');
const { handleLeadRoutes } = require('../apps/api/src/modules/leads/routes');

function createMockResponse() {
  return {
    statusCode: null,
    headers: null,
    body: '',
    writeHead(statusCode, headers = {}) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(body = '') {
      this.body = body;
    }
  };
}

async function routeJson(handler, { method = 'POST', path, body = {}, authenticateRequest }) {
  const response = createMockResponse();
  const url = new URL(`http://localhost${path}`);

  try {
    await handler(
      { method, headers: {}, socket: { remoteAddress: `127.0.0.${Math.floor(Math.random() * 200) + 1}` } },
      response,
      url,
      {
        authenticateRequest,
        authenticateAndAuthorize: async () => authenticateRequest(),
        parseJsonBody: async () => body,
        json
      }
    );
  } catch (err) {
    if (err instanceof AppError) {
      response.writeHead(err.statusCode);
      response.end(JSON.stringify({ error: { code: err.code, message: err.message, details: err.details || null } }));
    } else {
      response.writeHead(500);
      response.end(JSON.stringify({ error: { code: 'INTERNAL_SERVER_ERROR', message: err.message } }));
    }
  }

  return {
    statusCode: response.statusCode,
    body: response.body ? JSON.parse(response.body) : null
  };
}

test('Public Lead Capture API - Integration Tests', async (t) => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const uniqueId = Date.now() + Math.floor(Math.random() * 1000);

  const activeSlug = `public-lead-a-${uniqueId}`;
  const inactiveSlug = `public-lead-inactive-${uniqueId}`;
  const clinicBSlug = `public-lead-b-${uniqueId}`;

  let clinicAId;
  let clinicBId;
  let inactiveClinicId;
  let serviceId;
  let draftServiceId;
  let clinicBServiceId;
  let promotionId;
  let packageId;
  let ownerUserId;
  let orgAId;
  let workspaceAId;
  let orgBId;
  let workspaceBId;

  const validPayload = (overrides = {}) => ({
    name: 'Jane Doe',
    phone: '0899999999',
    email: 'jane@example.com',
    lineId: '@jane',
    interestType: 'general',
    message: 'สนใจปรึกษา',
    source: 'clinic_public_website',
    consentAccepted: true,
    honeypot: '',
    ...overrides
  });

  t.before(async () => {
    const clinicA = await pool.query(
      "insert into clinics (name, slug, plan, status) values ($1, $2, 'starter', 'active') returning id",
      [`Public Lead Clinic A ${uniqueId}`, activeSlug]
    );
    clinicAId = Number(clinicA.rows[0].id);

    const clinicB = await pool.query(
      "insert into clinics (name, slug, plan, status) values ($1, $2, 'starter', 'active') returning id",
      [`Public Lead Clinic B ${uniqueId}`, clinicBSlug]
    );
    clinicBId = Number(clinicB.rows[0].id);

    const inactiveClinic = await pool.query(
      "insert into clinics (name, slug, plan, status) values ($1, $2, 'starter', 'inactive') returning id",
      [`Public Lead Inactive ${uniqueId}`, inactiveSlug]
    );
    inactiveClinicId = Number(inactiveClinic.rows[0].id);

    const user = await pool.query(
      "insert into users (email, name, password_hash, status) values ($1, $2, 'hash', 'active') returning id",
      [`public-lead-owner-${uniqueId}@flowbiz.local`, 'Public Lead Owner']
    );
    ownerUserId = Number(user.rows[0].id);

    const orgA = await pool.query(
      "insert into organizations (clinic_id, name, slug, status) values ($1, 'Org A', $2, 'active') returning id",
      [clinicAId, `public-lead-org-a-${uniqueId}`]
    );
    orgAId = Number(orgA.rows[0].id);
    const wsA = await pool.query(
      "insert into workspaces (clinic_id, organization_id, name, slug, status) values ($1, $2, 'Main', 'main-workspace', 'active') returning id",
      [clinicAId, orgAId]
    );
    workspaceAId = Number(wsA.rows[0].id);

    const orgB = await pool.query(
      "insert into organizations (clinic_id, name, slug, status) values ($1, 'Org B', $2, 'active') returning id",
      [clinicBId, `public-lead-org-b-${uniqueId}`]
    );
    orgBId = Number(orgB.rows[0].id);
    const wsB = await pool.query(
      "insert into workspaces (clinic_id, organization_id, name, slug, status) values ($1, $2, 'Main', 'main-workspace', 'active') returning id",
      [clinicBId, orgBId]
    );
    workspaceBId = Number(wsB.rows[0].id);

    const service = await pool.query(
      `insert into clinic_services (clinic_id, service_key, name, slug, status)
       values ($1, $2, 'Botox Lift', $3, 'active') returning id`,
      [clinicAId, `svc-${uniqueId}`, `svc-${uniqueId}`]
    );
    serviceId = Number(service.rows[0].id);

    const draftService = await pool.query(
      `insert into clinic_services (clinic_id, service_key, name, slug, status)
       values ($1, $2, 'Draft Service', $3, 'draft') returning id`,
      [clinicAId, `draft-svc-${uniqueId}`, `draft-svc-${uniqueId}`]
    );
    draftServiceId = Number(draftService.rows[0].id);

    const clinicBService = await pool.query(
      `insert into clinic_services (clinic_id, service_key, name, slug, status)
       values ($1, $2, 'Other Clinic Service', $3, 'active') returning id`,
      [clinicBId, `svc-b-${uniqueId}`, `svc-b-${uniqueId}`]
    );
    clinicBServiceId = Number(clinicBService.rows[0].id);

    const promo = await pool.query(
      `insert into clinic_promotions (clinic_id, promotion_key, title, slug, status)
       values ($1, $2, 'Summer Glow', $3, 'active') returning id`,
      [clinicAId, `promo-${uniqueId}`, `promo-${uniqueId}`]
    );
    promotionId = Number(promo.rows[0].id);

    const pkg = await pool.query(
      `insert into clinic_packages (clinic_id, package_key, name, slug, status)
       values ($1, $2, 'Glow Course', $3, 'active') returning id`,
      [clinicAId, `pkg-${uniqueId}`, `pkg-${uniqueId}`]
    );
    packageId = Number(pkg.rows[0].id);
  });

  t.after(async () => {
    try {
      if (clinicAId) {
        await pool.query('delete from clinics where id = any($1::bigint[])', [[clinicAId, clinicBId, inactiveClinicId]]);
      }
      if (ownerUserId) {
        await pool.query('delete from users where id = $1', [ownerUserId]);
      }
    } finally {
      await pool.end();
    }
  });

  await t.test('1. Unknown clinic slug returns 404', async () => {
    const res = await routeJson(handlePublicLeadRoutes, {
      path: '/public/clinics/no-such-public-lead/leads',
      body: validPayload()
    });
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error.code, 'CLINIC_NOT_FOUND');
  });

  await t.test('2. Inactive clinic returns 404', async () => {
    const res = await routeJson(handlePublicLeadRoutes, {
      path: `/public/clinics/${inactiveSlug}/leads`,
      body: validPayload()
    });
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error.code, 'CLINIC_NOT_FOUND');
  });

  await t.test('3. Reject payload with clinicId or clinic_id', async () => {
    const res = await routeJson(handlePublicLeadRoutes, {
      path: `/public/clinics/${activeSlug}/leads`,
      body: validPayload({ clinicId: clinicBId })
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.code, 'INVALID_PUBLIC_LEAD_PAYLOAD');

    const snake = await routeJson(handlePublicLeadRoutes, {
      path: `/public/clinics/${activeSlug}/leads`,
      body: validPayload({ clinic_id: clinicBId })
    });
    assert.equal(snake.statusCode, 400);
    assert.equal(snake.body.error.code, 'INVALID_PUBLIC_LEAD_PAYLOAD');
  });

  await t.test('4. Reject missing consent', async () => {
    const res = await routeJson(handlePublicLeadRoutes, {
      path: `/public/clinics/${activeSlug}/leads`,
      body: validPayload({ consentAccepted: false })
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.code, 'CONSENT_REQUIRED');
  });

  await t.test('5. Reject missing contact method', async () => {
    const res = await routeJson(handlePublicLeadRoutes, {
      path: `/public/clinics/${activeSlug}/leads`,
      body: validPayload({ phone: '', email: '', lineId: '' })
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.code, 'CONTACT_REQUIRED');
  });

  await t.test('6. Reject invalid email', async () => {
    const res = await routeJson(handlePublicLeadRoutes, {
      path: `/public/clinics/${activeSlug}/leads`,
      body: validPayload({ email: 'bad-email' })
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.code, 'INVALID_PUBLIC_LEAD_EMAIL');
  });

  await t.test('7. Honeypot filled does not create lead but returns accepted success', async () => {
    const before = await pool.query('select count(*)::int as count from leads where clinic_id = $1', [clinicAId]);
    const res = await routeJson(handlePublicLeadRoutes, {
      path: `/public/clinics/${activeSlug}/leads`,
      body: validPayload({ honeypot: 'bot-value' })
    });
    const after = await pool.query('select count(*)::int as count from leads where clinic_id = $1', [clinicAId]);

    assert.equal(res.statusCode, 202);
    assert.equal(res.body.success, true);
    assert.equal(after.rows[0].count, before.rows[0].count);
  });

  await t.test('8. Create general public lead under resolved clinic_id', async () => {
    const res = await routeJson(handlePublicLeadRoutes, {
      path: `/public/clinics/${activeSlug}/leads`,
      body: validPayload({ email: '', lineId: '' })
    });
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.success, true);
    assert.ok(res.body.leadId);

    const lead = await pool.query('select clinic_id, source, phone, email, line_user_id from leads where id = $1', [res.body.leadId]);
    assert.equal(Number(lead.rows[0].clinic_id), clinicAId);
    assert.equal(lead.rows[0].source, 'website');
    assert.equal(lead.rows[0].phone, '0899999999');
    assert.equal(lead.rows[0].email, null);
  });

  await t.test('9. Create service, promotion, and package interest leads only for active same-clinic items', async () => {
    for (const [interestType, interestId] of [
      ['service', serviceId],
      ['promotion', promotionId],
      ['package', packageId]
    ]) {
      const res = await routeJson(handlePublicLeadRoutes, {
        path: `/public/clinics/${activeSlug}/leads`,
        body: validPayload({ interestType, interestId })
      });
      assert.equal(res.statusCode, 201);

      const interest = await pool.query(
        'select interest_type from lead_interests where clinic_id = $1 and lead_id = $2',
        [clinicAId, res.body.leadId]
      );
      assert.equal(interest.rows[0].interest_type, interestType);
    }
  });

  await t.test('10. Reject cross-tenant or unknown interestId', async () => {
    const cross = await routeJson(handlePublicLeadRoutes, {
      path: `/public/clinics/${activeSlug}/leads`,
      body: validPayload({ interestType: 'service', interestId: clinicBServiceId })
    });
    assert.equal(cross.statusCode, 400);
    assert.equal(cross.body.error.code, 'INVALID_INTEREST');

    const unknown = await routeJson(handlePublicLeadRoutes, {
      path: `/public/clinics/${activeSlug}/leads`,
      body: validPayload({ interestType: 'service', interestId: 999999999 })
    });
    assert.equal(unknown.statusCode, 400);
    assert.equal(unknown.body.error.code, 'INVALID_INTEREST');
  });

  await t.test('11. Reject inactive or draft offering interest', async () => {
    const res = await routeJson(handlePublicLeadRoutes, {
      path: `/public/clinics/${activeSlug}/leads`,
      body: validPayload({ interestType: 'service', interestId: draftServiceId })
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.code, 'INVALID_INTEREST');
  });

  await t.test('12. Audit/activity summary is created without raw PII', async () => {
    const res = await routeJson(handlePublicLeadRoutes, {
      path: `/public/clinics/${activeSlug}/leads`,
      body: validPayload({ phone: '0811111111', email: 'private@example.com', message: 'raw private message' })
    });

    const audit = await pool.query(
      "select context_json from audit_logs where clinic_id = $1 and entity_type = 'lead' and entity_id = $2 and action_type = 'public_lead.created' limit 1",
      [clinicAId, res.body.leadId]
    );
    assert.equal(audit.rowCount, 1);
    const serialized = JSON.stringify(audit.rows[0].context_json);
    assert.match(serialized, /public_lead_capture/);
    assert.doesNotMatch(serialized, /0811111111/);
    assert.doesNotMatch(serialized, /private@example\.com/);
    assert.doesNotMatch(serialized, /raw private message/);

    const leadSummary = await pool.query(
      'select notes_summary from leads where clinic_id = $1 and id = $2 limit 1',
      [clinicAId, res.body.leadId]
    );
    assert.equal(leadSummary.rowCount, 1);
    assert.match(leadSummary.rows[0].notes_summary, /message_provided=true/);
    assert.doesNotMatch(leadSummary.rows[0].notes_summary, /raw private message/);

    const activity = await pool.query(
      "select event_data_json from lead_activity where clinic_id = $1 and lead_id = $2 and event_type = 'lead.created' limit 1",
      [clinicAId, res.body.leadId]
    );
    assert.equal(activity.rowCount, 1);
    assert.doesNotMatch(JSON.stringify(activity.rows[0].event_data_json), /raw private message/);
  });

  await t.test('13. Admin CRM query for clinic B does not see clinic A public lead', async () => {
    const createRes = await routeJson(handlePublicLeadRoutes, {
      path: `/public/clinics/${activeSlug}/leads`,
      body: validPayload({ name: `Tenant Isolation ${uniqueId}`, phone: '0822222222' })
    });
    assert.equal(createRes.statusCode, 201);

    const clinicBAuth = async () => ({
      currentUser: { id: ownerUserId },
      currentClinic: { id: clinicBId, slug: clinicBSlug },
      currentOrganization: { id: orgBId },
      currentWorkspace: { id: workspaceBId },
      currentMembership: { role: 'owner', permissions: [] }
    });

    const listRes = await routeJson(handleLeadRoutes, {
      method: 'GET',
      path: '/leads',
      authenticateRequest: clinicBAuth
    });

    assert.equal(listRes.statusCode, 200);
    assert.equal(listRes.body.items.some((lead) => Number(lead.id) === Number(createRes.body.leadId)), false);

    const clinicAAuth = async () => ({
      currentUser: { id: ownerUserId },
      currentClinic: { id: clinicAId, slug: activeSlug },
      currentOrganization: { id: orgAId },
      currentWorkspace: { id: workspaceAId },
      currentMembership: { role: 'owner', permissions: [] }
    });
    const listA = await routeJson(handleLeadRoutes, {
      method: 'GET',
      path: '/leads',
      authenticateRequest: clinicAAuth
    });
    assert.equal(listA.body.items.some((lead) => Number(lead.id) === Number(createRes.body.leadId)), true);
  });
});
