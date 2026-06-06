'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { loadConfig } = require('../src/config');
const { AppError } = require('../src/common/errors');
const { json } = require('../src/common/http');
const { handleMemberAccessRoutes } = require('../src/modules/member-access/routes');
const { hashAccessToken } = require('../src/modules/member-access/service');

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

async function routeJson({
  method = 'GET',
  path,
  body = {},
  searchParams = {},
  remoteAddress,
  userAgent = 'member-consent-test-agent'
}) {
  const response = createMockResponse();
  const suffix = Object.keys(searchParams).length ? `?${new URLSearchParams(searchParams).toString()}` : '';
  const url = new URL(`http://localhost${path}${suffix}`);

  try {
    await handleMemberAccessRoutes(
      {
        method,
        headers: { 'user-agent': userAgent },
        socket: { remoteAddress: remoteAddress || `127.18.1.${Math.floor(Math.random() * 200) + 1}` }
      },
      response,
      url,
      {
        parseJsonBody: async () => body,
        json
      }
    );
  } catch (error) {
    if (error instanceof AppError) {
      response.writeHead(error.statusCode);
      response.end(JSON.stringify({ error: { code: error.code, message: error.message, details: error.details || null } }));
    } else {
      response.writeHead(500);
      response.end(JSON.stringify({ error: { code: 'INTERNAL_SERVER_ERROR', message: error.message } }));
    }
  }

  return {
    statusCode: response.statusCode,
    body: response.body ? JSON.parse(response.body) : null
  };
}

async function createTenant(pool, uniqueId, suffix) {
  const clinic = await pool.query(
    "insert into clinics (name, slug, plan, status) values ($1, $2, 'starter', 'active') returning id",
    [`PR18B Consent Clinic ${suffix} ${uniqueId}`, `pr18b-consent-${suffix}-${uniqueId}`]
  );
  const clinicId = Number(clinic.rows[0].id);
  const organization = await pool.query(
    "insert into organizations (clinic_id, name, slug, status) values ($1, $2, $3, 'active') returning id",
    [clinicId, `PR18B Consent Org ${suffix}`, `pr18b-consent-org-${suffix}-${uniqueId}`]
  );
  const workspace = await pool.query(
    "insert into workspaces (clinic_id, organization_id, name, slug, status) values ($1, $2, $3, $4, 'active') returning id",
    [clinicId, organization.rows[0].id, `PR18B Consent Workspace ${suffix}`, `pr18b-consent-ws-${suffix}-${uniqueId}`]
  );

  return {
    clinicId,
    clinicSlug: `pr18b-consent-${suffix}-${uniqueId}`,
    organizationId: Number(organization.rows[0].id),
    workspaceId: Number(workspace.rows[0].id)
  };
}

async function createLead(pool, tenant, uniqueId, suffix) {
  const result = await pool.query(
    `
      insert into leads (
        clinic_id, organization_id, workspace_id, source, source_ref,
        full_name, phone, email, line_user_id, status, stage
      )
      values ($1, $2, $3, 'website', $4, $5, $6, $7, $8, 'new', 'inquiry')
      returning id
    `,
    [
      tenant.clinicId,
      tenant.organizationId,
      tenant.workspaceId,
      `pr18b-consent-lead-${suffix}-${uniqueId}`,
      `PR18B Consent Lead ${suffix}`,
      `08918b${suffix}`,
      `pr18b-consent-lead-${suffix}-${uniqueId}@example.com`,
      `@pr18b-consent-lead-${suffix}`
    ]
  );
  return Number(result.rows[0].id);
}

async function createMember(pool, tenant, leadId, uniqueId, suffix) {
  const result = await pool.query(
    `
      insert into clinic_members (
        clinic_id, lead_id, display_name, phone, email, line_id, status, source, profile_json
      )
      values ($1, $2, $3, $4, $5, $6, 'active', 'manual', $7::jsonb)
      returning id
    `,
    [
      tenant.clinicId,
      leadId,
      `PR18B Consent Member ${suffix}`,
      `08928b${suffix}`,
      `pr18b-consent-member-${suffix}-${uniqueId}@example.com`,
      `@pr18b-consent-member-${suffix}`,
      JSON.stringify({ unsafe: `raw PR18B member profile ${suffix}` })
    ]
  );
  return Number(result.rows[0].id);
}

async function requestToken(tenant, email) {
  const res = await routeJson({
    method: 'POST',
    path: `/public/clinics/${tenant.clinicSlug}/member-access/request`,
    body: { contact: email, channel: 'email', honeypot: '' }
  });
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.devToken);
  return res.body.devToken;
}

function consentByKey(consents, key) {
  return consents.find((consent) => consent.key === key);
}

function assertPublicPayloadSafe(payload, forbiddenValues) {
  const serialized = JSON.stringify(payload);
  for (const value of forbiddenValues) {
    assert.equal(serialized.includes(value), false, `public payload leaked ${value}`);
  }
}

test('PR18B Member Consent Management', async (t) => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const uniqueId = Date.now() + Math.floor(Math.random() * 1000);
  let tenantA;
  let tenantB;
  let leadAId;
  let memberAId;
  let leadBId;
  let memberBId;
  let tokenA;
  let tokenB;
  const rawIp = '203.0.113.18';
  const rawUserAgent = `member-consent-raw-agent-${uniqueId}`;

  t.before(async () => {
    tenantA = await createTenant(pool, uniqueId, 'a');
    tenantB = await createTenant(pool, uniqueId, 'b');
    leadAId = await createLead(pool, tenantA, uniqueId, 'a');
    leadBId = await createLead(pool, tenantB, uniqueId, 'b');
    memberAId = await createMember(pool, tenantA, leadAId, uniqueId, 'a');
    memberBId = await createMember(pool, tenantB, leadBId, uniqueId, 'b');
    tokenA = await requestToken(tenantA, `pr18b-consent-member-a-${uniqueId}@example.com`);
    tokenB = await requestToken(tenantB, `pr18b-consent-member-b-${uniqueId}@example.com`);
  });

  t.after(async () => {
    try {
      if (tenantA?.clinicId && tenantB?.clinicId) {
        await pool.query('delete from clinics where id = any($1::bigint[])', [[tenantA.clinicId, tenantB.clinicId]]);
      }
    } finally {
      await pool.end();
    }
  });

  await t.test('1. Session returns default unknown consents without creating rows', async () => {
    const res = await routeJson({
      path: `/public/clinics/${tenantA.clinicSlug}/member-portal/session`,
      searchParams: { token: tokenA }
    });

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.ok(Array.isArray(res.body.portal.consents));
    assert.deepEqual(res.body.portal.consents.map((consent) => consent.key), [
      'communication',
      'marketing',
      'appointment_reminder',
      'data_processing'
    ]);
    assert.deepEqual(res.body.portal.consents.map((consent) => consent.status), [
      'unknown',
      'unknown',
      'unknown',
      'unknown'
    ]);
    assert.deepEqual(res.body.consents, res.body.portal.consents);

    const rows = await pool.query(
      'select count(*)::int as count from clinic_member_consents where clinic_id = $1 and member_id = $2',
      [tenantA.clinicId, memberAId]
    );
    assert.equal(rows.rows[0].count, 0);
  });

  await t.test('2. Update single consent creates tenant/member-scoped row', async () => {
    const res = await routeJson({
      method: 'PATCH',
      path: `/public/clinics/${tenantA.clinicSlug}/member-portal/consents`,
      body: {
        token: tokenA,
        consent: { key: 'marketing', status: 'granted', version: 'v1' }
      },
      remoteAddress: rawIp,
      userAgent: rawUserAgent
    });

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.success, true);
    assert.equal(consentByKey(res.body.consents, 'marketing').status, 'granted');
    assert.ok(consentByKey(res.body.consents, 'marketing').grantedAt);
    assert.equal(consentByKey(res.body.consents, 'marketing').revokedAt, null);

    const row = await pool.query(
      `
        select *
        from clinic_member_consents
        where clinic_id = $1 and member_id = $2 and consent_key = 'marketing'
      `,
      [tenantA.clinicId, memberAId]
    );
    assert.equal(row.rowCount, 1);
    assert.equal(row.rows[0].consent_status, 'granted');
    assert.equal(row.rows[0].consent_source, 'member_portal');
    assert.equal(row.rows[0].consent_version, 'v1');
    assert.ok(row.rows[0].granted_at);
    assert.equal(row.rows[0].revoked_at, null);
  });

  await t.test('3. Update multiple consents and session reflects updates', async () => {
    const res = await routeJson({
      method: 'PATCH',
      path: `/public/clinics/${tenantA.clinicSlug}/member-portal/consents`,
      body: {
        token: tokenA,
        consents: [
          { key: 'appointment_reminder', status: 'revoked', version: 'v1' },
          { key: 'communication', status: 'granted', version: 'v1' }
        ]
      }
    });

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(consentByKey(res.body.consents, 'appointment_reminder').status, 'revoked');
    assert.equal(consentByKey(res.body.consents, 'communication').status, 'granted');

    const session = await routeJson({
      path: `/public/clinics/${tenantA.clinicSlug}/member-portal/session`,
      searchParams: { token: tokenA }
    });
    assert.equal(session.statusCode, 200, JSON.stringify(session.body));
    assert.equal(consentByKey(session.body.portal.consents, 'marketing').status, 'granted');
    assert.equal(consentByKey(session.body.portal.consents, 'appointment_reminder').status, 'revoked');
    assert.equal(consentByKey(session.body.portal.consents, 'communication').status, 'granted');
    assert.equal(consentByKey(session.body.portal.consents, 'data_processing').status, 'unknown');
  });

  await t.test('4. Revoke consent preserves prior granted timestamp and sets revoked_at', async () => {
    const before = await pool.query(
      "select granted_at from clinic_member_consents where clinic_id = $1 and member_id = $2 and consent_key = 'marketing'",
      [tenantA.clinicId, memberAId]
    );

    const res = await routeJson({
      method: 'PATCH',
      path: `/public/clinics/${tenantA.clinicSlug}/member-portal/consents`,
      body: {
        token: tokenA,
        consent: { key: 'marketing', status: 'revoked', version: 'v1' }
      }
    });

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(consentByKey(res.body.consents, 'marketing').status, 'revoked');
    assert.ok(consentByKey(res.body.consents, 'marketing').revokedAt);

    const after = await pool.query(
      "select consent_status, granted_at, revoked_at from clinic_member_consents where clinic_id = $1 and member_id = $2 and consent_key = 'marketing'",
      [tenantA.clinicId, memberAId]
    );
    assert.equal(after.rows[0].consent_status, 'revoked');
    assert.equal(after.rows[0].granted_at.toISOString(), before.rows[0].granted_at.toISOString());
    assert.ok(after.rows[0].revoked_at);
  });

  await t.test('5. Reject invalid consent key and update-only unknown status', async () => {
    const invalidKey = await routeJson({
      method: 'PATCH',
      path: `/public/clinics/${tenantA.clinicSlug}/member-portal/consents`,
      body: {
        token: tokenA,
        consent: { key: 'billing', status: 'granted', version: 'v1' }
      }
    });
    assert.equal(invalidKey.statusCode, 400);
    assert.equal(invalidKey.body.error.code, 'INVALID_MEMBER_CONSENT');

    const invalidStatus = await routeJson({
      method: 'PATCH',
      path: `/public/clinics/${tenantA.clinicSlug}/member-portal/consents`,
      body: {
        token: tokenA,
        consent: { key: 'marketing', status: 'unknown', version: 'v1' }
      }
    });
    assert.equal(invalidStatus.statusCode, 400);
    assert.equal(invalidStatus.body.error.code, 'INVALID_MEMBER_CONSENT_STATUS');

    const invalidConsentsShape = await routeJson({
      method: 'PATCH',
      path: `/public/clinics/${tenantA.clinicSlug}/member-portal/consents`,
      body: {
        token: tokenA,
        consents: { key: 'marketing', status: 'granted', version: 'v1' }
      }
    });
    assert.equal(invalidConsentsShape.statusCode, 400);
    assert.equal(invalidConsentsShape.body.error.code, 'INVALID_MEMBER_CONSENT');
  });

  await t.test('6. Tenant isolation and override rejection', async () => {
    const crossTenant = await routeJson({
      method: 'PATCH',
      path: `/public/clinics/${tenantB.clinicSlug}/member-portal/consents`,
      body: {
        token: tokenA,
        consent: { key: 'data_processing', status: 'granted', version: 'v1' }
      }
    });
    assert.equal(crossTenant.statusCode, 404);
    assert.equal(crossTenant.body.error.code, 'INVALID_MEMBER_ACCESS_TOKEN');

    for (const override of [
      { clinicId: tenantB.clinicId },
      { clinic_id: tenantB.clinicId },
      { memberId: memberBId },
      { member_id: memberBId },
      { leadId: leadBId },
      { lead_id: leadBId }
    ]) {
      const res = await routeJson({
        method: 'PATCH',
        path: `/public/clinics/${tenantA.clinicSlug}/member-portal/consents`,
        body: {
          token: tokenA,
          consent: { key: 'data_processing', status: 'granted', version: 'v1' },
          ...override
        }
      });
      assert.equal(res.statusCode, 400);
      assert.equal(res.body.error.code, 'INVALID_MEMBER_CONSENT');
    }

    for (const searchParams of [
      { clinicId: tenantB.clinicId },
      { clinic_id: tenantB.clinicId },
      { memberId: memberBId },
      { member_id: memberBId },
      { leadId: leadBId },
      { lead_id: leadBId }
    ]) {
      const res = await routeJson({
        method: 'PATCH',
        path: `/public/clinics/${tenantA.clinicSlug}/member-portal/consents`,
        searchParams,
        body: {
          token: tokenA,
          consent: { key: 'data_processing', status: 'granted', version: 'v1' }
        }
      });
      assert.equal(res.statusCode, 400);
      assert.equal(res.body.error.code, 'INVALID_MEMBER_CONSENT');
    }

    const tenantBUpdate = await routeJson({
      method: 'PATCH',
      path: `/public/clinics/${tenantB.clinicSlug}/member-portal/consents`,
      body: {
        token: tokenB,
        consent: { key: 'data_processing', status: 'granted', version: 'tenant-b-v1' }
      }
    });
    assert.equal(tenantBUpdate.statusCode, 200, JSON.stringify(tenantBUpdate.body));

    const tenantASession = await routeJson({
      path: `/public/clinics/${tenantA.clinicSlug}/member-portal/session`,
      searchParams: { token: tokenA }
    });
    assert.equal(consentByKey(tenantASession.body.portal.consents, 'data_processing').status, 'unknown');
  });

  await t.test('7. Token security rejects invalid, expired, and revoked tokens', async () => {
    const invalid = await routeJson({
      method: 'PATCH',
      path: `/public/clinics/${tenantA.clinicSlug}/member-portal/consents`,
      body: {
        token: 'not-a-real-member-token',
        consent: { key: 'marketing', status: 'granted', version: 'v1' }
      }
    });
    assert.equal(invalid.statusCode, 404);
    assert.equal(invalid.body.error.code, 'INVALID_MEMBER_ACCESS_TOKEN');

    const expiredToken = await requestToken(tenantA, `pr18b-consent-member-a-${uniqueId}@example.com`);
    await pool.query(
      "update clinic_member_access_tokens set expires_at = now() - interval '1 minute' where token_hash = $1",
      [hashAccessToken(expiredToken)]
    );
    const expired = await routeJson({
      method: 'PATCH',
      path: `/public/clinics/${tenantA.clinicSlug}/member-portal/consents`,
      body: {
        token: expiredToken,
        consent: { key: 'marketing', status: 'granted', version: 'v1' }
      }
    });
    assert.equal(expired.statusCode, 401);
    assert.equal(expired.body.error.code, 'MEMBER_ACCESS_TOKEN_EXPIRED');

    const revokedToken = await requestToken(tenantA, `pr18b-consent-member-a-${uniqueId}@example.com`);
    await pool.query(
      'update clinic_member_access_tokens set revoked_at = now() where token_hash = $1',
      [hashAccessToken(revokedToken)]
    );
    const revoked = await routeJson({
      method: 'PATCH',
      path: `/public/clinics/${tenantA.clinicSlug}/member-portal/consents`,
      body: {
        token: revokedToken,
        consent: { key: 'marketing', status: 'granted', version: 'v1' }
      }
    });
    assert.equal(revoked.statusCode, 404);
    assert.equal(revoked.body.error.code, 'INVALID_MEMBER_ACCESS_TOKEN');
  });

  await t.test('8. Public responses are PII-safe and do not expose consent metadata', async () => {
    const update = await routeJson({
      method: 'PATCH',
      path: `/public/clinics/${tenantA.clinicSlug}/member-portal/consents`,
      body: {
        token: tokenA,
        consent: { key: 'marketing', status: 'granted', version: 'v1' }
      },
      remoteAddress: rawIp,
      userAgent: rawUserAgent
    });
    const session = await routeJson({
      path: `/public/clinics/${tenantA.clinicSlug}/member-portal/session`,
      searchParams: { token: tokenA },
      remoteAddress: rawIp,
      userAgent: rawUserAgent
    });
    const metadata = await pool.query(
      "select metadata_json from clinic_member_consents where clinic_id = $1 and member_id = $2 and consent_key = 'marketing'",
      [tenantA.clinicId, memberAId]
    );
    assert.equal(update.statusCode, 200, JSON.stringify(update.body));
    assert.equal(session.statusCode, 200, JSON.stringify(session.body));
    assert.equal(metadata.rowCount, 1);

    const forbiddenValues = [
      `pr18b-consent-member-a-${uniqueId}@example.com`,
      '08928ba',
      '@pr18b-consent-member-a',
      tokenA,
      hashAccessToken(tokenA),
      rawIp,
      rawUserAgent,
      'clinicId',
      'clinic_id',
      'memberId',
      'member_id',
      'leadId',
      'lead_id',
      'metadata_json',
      'requestIpHash',
      'userAgentHash',
      metadata.rows[0].metadata_json.requestIpHash,
      metadata.rows[0].metadata_json.userAgentHash
    ];

    assertPublicPayloadSafe(update.body, forbiddenValues);
    assertPublicPayloadSafe(session.body, forbiddenValues);
    assert.deepEqual(Object.keys(consentByKey(update.body.consents, 'marketing')).sort(), [
      'grantedAt',
      'key',
      'lastUpdatedAt',
      'revokedAt',
      'source',
      'status',
      'updatedAt',
      'version'
    ]);
  });

  await t.test('9. Audit and member event evidence is summary-only', async () => {
    const event = await pool.query(
      `
        select event_summary_json
        from clinic_member_events
        where clinic_id = $1
          and member_id = $2
          and event_type = 'member_consent.updated'
        order by id desc
        limit 1
      `,
      [tenantA.clinicId, memberAId]
    );
    assert.equal(event.rowCount, 1);

    const audit = await pool.query(
      `
        select context_json
        from audit_logs
        where clinic_id = $1
          and entity_type = 'clinic_member'
          and entity_id = $2
          and action_type = 'member_consent.updated'
        order by id desc
        limit 1
      `,
      [tenantA.clinicId, memberAId]
    );
    assert.equal(audit.rowCount, 1);

    const eventSummary = event.rows[0].event_summary_json.summary;
    const auditSummary = audit.rows[0].context_json.summary;
    for (const summary of [eventSummary, auditSummary]) {
      assert.deepEqual(Object.keys(summary).sort(), [
        'memberId',
        'source',
        'statuses',
        'updatedKeys',
        'versionProvided'
      ]);
      assert.equal(summary.source, 'member_portal_consent');
      assert.equal(summary.memberId, memberAId);
      assert.ok(summary.updatedKeys.includes('marketing'));
      assert.equal(summary.statuses.marketing, 'granted');
    }

    const serialized = JSON.stringify([event.rows[0].event_summary_json, audit.rows[0].context_json]);
    assert.doesNotMatch(serialized, /pr18b-consent-member-a-/);
    assert.doesNotMatch(serialized, /08928ba/);
    assert.doesNotMatch(serialized, /@pr18b-consent-member-a/);
    assert.equal(serialized.includes(tokenA), false);
    assert.equal(serialized.includes(rawIp), false);
    assert.equal(serialized.includes(rawUserAgent), false);
    assert.doesNotMatch(serialized, /requestIpHash|userAgentHash|updatedVia|metadata_json/);
  });
});
