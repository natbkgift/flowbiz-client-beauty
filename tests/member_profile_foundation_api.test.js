'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { loadConfig } = require('../apps/api/src/config');
const { AppError } = require('../apps/api/src/common/errors');
const { json } = require('../apps/api/src/common/http');
const { handlePublicLeadRoutes } = require('../apps/api/src/modules/public-leads/routes');
const { handleBookingRequestRoutes } = require('../apps/api/src/modules/booking-requests/routes');
const { handleMemberRoutes } = require('../apps/api/src/modules/members/routes');
const { linkLeadToMember } = require('../apps/api/src/modules/members/service');

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

async function routeJson(handler, { method = 'GET', path, body = {}, authenticateRequest, searchParams = {} }) {
  const response = createMockResponse();
  const suffix = Object.keys(searchParams).length ? `?${new URLSearchParams(searchParams).toString()}` : '';
  const url = new URL(`http://localhost${path}${suffix}`);

  try {
    await handler(
      { method, headers: {}, socket: { remoteAddress: `127.13.0.${Math.floor(Math.random() * 200) + 1}` } },
      response,
      url,
      {
        authenticateRequest: authenticateRequest || (async () => {
          throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.');
        }),
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

async function createTenant(pool, uniqueId, suffix) {
  const clinic = await pool.query(
    "insert into clinics (name, slug, plan, status) values ($1, $2, 'starter', 'active') returning id",
    [`Member Clinic ${suffix} ${uniqueId}`, `member-clinic-${suffix}-${uniqueId}`]
  );
  const clinicId = Number(clinic.rows[0].id);
  const organization = await pool.query(
    "insert into organizations (clinic_id, name, slug, status) values ($1, $2, $3, 'active') returning id",
    [clinicId, `Member Org ${suffix}`, `member-org-${suffix}-${uniqueId}`]
  );
  const workspace = await pool.query(
    "insert into workspaces (clinic_id, organization_id, name, slug, status) values ($1, $2, $3, 'main-workspace', 'active') returning id",
    [clinicId, organization.rows[0].id, `Member Workspace ${suffix}`]
  );
  return {
    clinicId,
    clinicSlug: `member-clinic-${suffix}-${uniqueId}`,
    organizationId: Number(organization.rows[0].id),
    workspaceId: Number(workspace.rows[0].id)
  };
}

async function createUser(pool, uniqueId, role) {
  const result = await pool.query(
    "insert into users (email, name, password_hash, status) values ($1, $2, 'hash', 'active') returning id",
    [`member-${role}-${uniqueId}@flowbiz.local`, `Member ${role}`]
  );
  return Number(result.rows[0].id);
}

async function createLead(pool, tenant, uniqueId, suffix, overrides = {}) {
  const result = await pool.query(
    `
      insert into leads (
        clinic_id,
        organization_id,
        workspace_id,
        source,
        source_ref,
        full_name,
        phone,
        email,
        line_user_id,
        status,
        stage
      )
      values ($1, $2, $3, 'website', $4, $5, $6, $7, $8, 'new', 'inquiry')
      returning id
    `,
    [
      tenant.clinicId,
      tenant.organizationId,
      tenant.workspaceId,
      `member-lead-${suffix}-${uniqueId}`,
      overrides.name || `Member Lead ${suffix}`,
      overrides.phone || `0810000${suffix}`,
      overrides.email || `member-lead-${suffix}-${uniqueId}@example.com`,
      overrides.lineId || `@member-lead-${suffix}`
    ]
  );
  return Number(result.rows[0].id);
}

async function createManualMember(pool, tenant, overrides = {}) {
  const result = await pool.query(
    `
      insert into clinic_members (
        clinic_id,
        display_name,
        phone,
        email,
        line_id,
        source
      )
      values ($1, $2, $3, $4, $5, 'manual')
      returning id
    `,
    [
      tenant.clinicId,
      overrides.displayName || 'Manual Member',
      overrides.phone || null,
      overrides.email || null,
      overrides.lineId || null
    ]
  );
  return Number(result.rows[0].id);
}

function publicLeadPayload(overrides = {}) {
  return {
    name: 'Member Public Lead',
    phone: '0811111111',
    email: 'member-public@example.com',
    lineId: '@memberpublic',
    interestType: 'general',
    message: 'raw lead message should not be logged',
    consentAccepted: true,
    honeypot: '',
    ...overrides
  };
}

function publicBookingPayload(overrides = {}) {
  return {
    name: 'Member Booking',
    phone: '0811111111',
    email: 'member-public@example.com',
    lineId: '@memberpublic',
    requestType: 'booking_request',
    interestType: 'general',
    preferredDate: '2099-06-15',
    preferredTimeWindow: 'afternoon',
    preferredContactMethod: 'line',
    message: 'raw booking message should not be logged',
    consentAccepted: true,
    honeypot: '',
    ...overrides
  };
}

test('Member Profile Foundation API - no public member portal endpoint is exposed in PR13A', async () => {
  const response = createMockResponse();
  const handled = await handleMemberRoutes(
    { method: 'GET', headers: {}, socket: { remoteAddress: '127.13.0.250' } },
    response,
    new URL('http://localhost/public/clinics/demo/member'),
    {
      authenticateRequest: async () => {
        throw new Error('Public member routes must not authenticate through admin member handlers.');
      },
      parseJsonBody: async () => ({}),
      json
    }
  );

  assert.equal(handled, false);
  assert.equal(response.statusCode, null);
});

test('Member Profile Foundation API - Integration Tests', async (t) => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const uniqueId = Date.now() + Math.floor(Math.random() * 1000);
  const primaryEmail = `member-public-${uniqueId}@example.com`;
  const userIds = [];
  let tenantA;
  let tenantB;
  const roleUserIds = {};
  let memberFromLeadId;
  let bookingRequestId;
  let bookingMemberId;
  let memberBId;

  t.before(async () => {
    tenantA = await createTenant(pool, uniqueId, 'a');
    tenantB = await createTenant(pool, uniqueId, 'b');
    for (const role of ['owner', 'manager', 'staff']) {
      roleUserIds[role] = await createUser(pool, uniqueId, role);
      userIds.push(roleUserIds[role]);
    }
  });

  t.after(async () => {
    try {
      if (tenantA?.clinicId && tenantB?.clinicId) {
        await pool.query('delete from clinics where id = any($1::bigint[])', [[tenantA.clinicId, tenantB.clinicId]]);
      }
      if (userIds.length) {
        await pool.query('delete from users where id = any($1::bigint[])', [userIds]);
      }
    } finally {
      await pool.end();
    }
  });

  const contextFor = (role, tenant = tenantA) => async () => ({
    currentUser: { id: roleUserIds[role], email: `member-${role}-${uniqueId}@flowbiz.local` },
    currentClinic: { id: tenant.clinicId, slug: tenant.clinicSlug },
    currentOrganization: { id: tenant.organizationId },
    currentWorkspace: { id: tenant.workspaceId },
    currentMembership: { role, permissions: [] }
  });

  await t.test('1. Public lead capture creates and links a clinic member', async () => {
    const res = await routeJson(handlePublicLeadRoutes, {
      method: 'POST',
      path: `/public/clinics/${tenantA.clinicSlug}/leads`,
      body: publicLeadPayload({
        phone: '0811111111',
        email: primaryEmail,
        lineId: '@memberpublic'
      })
    });
    assert.equal(res.statusCode, 201);
    assert.ok(res.body.leadId);

    const member = await pool.query(
      'select id, clinic_id, lead_id, phone, email, line_id from clinic_members where clinic_id = $1 and lower(email) = lower($2) limit 1',
      [tenantA.clinicId, primaryEmail]
    );
    assert.equal(member.rowCount, 1);
    memberFromLeadId = Number(member.rows[0].id);
    assert.equal(Number(member.rows[0].clinic_id), tenantA.clinicId);
    assert.equal(Number(member.rows[0].lead_id), Number(res.body.leadId));
  });

  await t.test('2. Booking request reuses existing same-clinic member by email and stores member_id', async () => {
    const res = await routeJson(handleBookingRequestRoutes, {
      method: 'POST',
      path: `/public/clinics/${tenantA.clinicSlug}/booking-requests`,
      body: publicBookingPayload({
        phone: '0899990000',
        email: primaryEmail,
        lineId: '@bookingreused'
      })
    });
    assert.equal(res.statusCode, 201);
    bookingRequestId = res.body.bookingRequestId;

    const booking = await pool.query(
      'select member_id from clinic_booking_requests where clinic_id = $1 and id = $2',
      [tenantA.clinicId, bookingRequestId]
    );
    assert.equal(Number(booking.rows[0].member_id), memberFromLeadId);
    bookingMemberId = Number(booking.rows[0].member_id);
  });

  await t.test('3. Existing member is reused by phone without overwriting different email', async () => {
    const manualMemberId = await createManualMember(pool, tenantA, {
      phone: '0822222222',
      email: 'phone-owner@example.com'
    });
    const res = await routeJson(handlePublicLeadRoutes, {
      method: 'POST',
      path: `/public/clinics/${tenantA.clinicSlug}/leads`,
      body: publicLeadPayload({
        phone: '0822222222',
        email: 'new-email-for-phone@example.com',
        lineId: ''
      })
    });
    assert.equal(res.statusCode, 201);

    const member = await pool.query('select id, email from clinic_members where clinic_id = $1 and phone = $2', [tenantA.clinicId, '0822222222']);
    assert.equal(Number(member.rows[0].id), manualMemberId);
    assert.equal(member.rows[0].email, 'phone-owner@example.com');
  });

  await t.test('4. Existing member is reused by lineId', async () => {
    const manualMemberId = await createManualMember(pool, tenantA, {
      lineId: '@line-reuse-member'
    });
    const res = await routeJson(handlePublicLeadRoutes, {
      method: 'POST',
      path: `/public/clinics/${tenantA.clinicSlug}/leads`,
      body: publicLeadPayload({
        phone: '',
        email: '',
        lineId: '@line-reuse-member'
      })
    });
    assert.equal(res.statusCode, 201);

    const member = await pool.query('select id, lead_id from clinic_members where clinic_id = $1 and line_id = $2', [tenantA.clinicId, '@line-reuse-member']);
    assert.equal(Number(member.rows[0].id), manualMemberId);
    assert.equal(Number(member.rows[0].lead_id), Number(res.body.leadId));
  });

  await t.test('5. Same email in different clinic creates a separate member', async () => {
    const res = await routeJson(handlePublicLeadRoutes, {
      method: 'POST',
      path: `/public/clinics/${tenantB.clinicSlug}/leads`,
      body: publicLeadPayload({
        phone: '0833333333',
        email: primaryEmail,
        lineId: '@memberpublicb'
      })
    });
    assert.equal(res.statusCode, 201);

    const members = await pool.query(
      'select id, clinic_id from clinic_members where lower(email) = lower($1) order by clinic_id asc',
      [primaryEmail]
    );
    assert.ok(members.rows.some((row) => Number(row.clinic_id) === tenantA.clinicId));
    assert.ok(members.rows.some((row) => Number(row.clinic_id) === tenantB.clinicId));
    memberBId = Number(members.rows.find((row) => Number(row.clinic_id) === tenantB.clinicId).id);
  });

  await t.test('6. Cross-tenant lead/member link is rejected', async () => {
    const leadAId = await createLead(pool, tenantA, uniqueId, 'cross');
    await assert.rejects(
      () => linkLeadToMember({ clinicId: tenantA.clinicId, leadId: leadAId, memberId: memberBId }, pool),
      (error) => error instanceof AppError && error.statusCode === 404 && error.code === 'MEMBER_NOT_FOUND'
    );
  });

  await t.test('7. Admin list only shows current clinic members', async () => {
    const res = await routeJson(handleMemberRoutes, {
      path: '/admin/members',
      authenticateRequest: contextFor('owner')
    });
    assert.equal(res.statusCode, 200);
    const adminMember = res.body.items.find((item) => item.id === memberFromLeadId);
    assert.ok(adminMember);
    assert.equal(adminMember.phone, '0811111111');
    assert.equal(adminMember.email, primaryEmail);
    assert.equal(adminMember.lineId, '@memberpublic');
    assert.equal(res.body.items.some((item) => item.id === memberBId), false);
  });

  await t.test('8. Admin detail cross-tenant member id returns 404', async () => {
    const res = await routeJson(handleMemberRoutes, {
      path: `/admin/members/${memberBId}`,
      authenticateRequest: contextFor('owner')
    });
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error.code, 'MEMBER_NOT_FOUND');
  });

  await t.test('9. Search q wildcard is escaped and does not match every member', async () => {
    const res = await routeJson(handleMemberRoutes, {
      path: '/admin/members',
      searchParams: { q: '%' },
      authenticateRequest: contextFor('owner')
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.items.length, 0);
  });

  await t.test('10. Admin query and body reject clinic override', async () => {
    const query = await routeJson(handleMemberRoutes, {
      path: '/admin/members',
      searchParams: { clinicId: tenantB.clinicId },
      authenticateRequest: contextFor('owner')
    });
    assert.equal(query.statusCode, 400);
    assert.equal(query.body.error.code, 'INVALID_MEMBER_PAYLOAD');

    const patch = await routeJson(handleMemberRoutes, {
      method: 'PATCH',
      path: `/admin/members/${memberFromLeadId}`,
      body: { clinic_id: tenantB.clinicId, displayName: 'Override' },
      authenticateRequest: contextFor('owner')
    });
    assert.equal(patch.statusCode, 400);
    assert.equal(patch.body.error.code, 'INVALID_MEMBER_PAYLOAD');
  });

  await t.test('11. Audit logs are summary-only and exclude raw contact PII', async () => {
    const audit = await pool.query(
      `
        select context_json
        from audit_logs
        where clinic_id = $1
          and entity_type = 'clinic_member'
          and entity_id = $2
          and action_type in ('clinic_member.created', 'clinic_member.linked_to_lead')
        order by id asc
      `,
      [tenantA.clinicId, memberFromLeadId]
    );
    assert.ok(audit.rowCount >= 1);
    const serialized = JSON.stringify(audit.rows.map((row) => row.context_json));
    assert.match(serialized, /member_profile_foundation/);
    assert.doesNotMatch(serialized, /0811111111/);
    assert.equal(serialized.includes(primaryEmail), false);
    assert.doesNotMatch(serialized, /@memberpublic/);
  });

  await t.test('12. Member event summaries exclude raw contact PII and messages', async () => {
    const events = await pool.query(
      'select event_summary_json from clinic_member_events where clinic_id = $1 and member_id = $2 order by id asc',
      [tenantA.clinicId, memberFromLeadId]
    );
    assert.ok(events.rowCount >= 1);
    const serialized = JSON.stringify(events.rows.map((row) => row.event_summary_json));
    assert.doesNotMatch(serialized, /0811111111/);
    assert.equal(serialized.includes(primaryEmail), false);
    assert.doesNotMatch(serialized, /@memberpublic/);
    assert.doesNotMatch(serialized, /raw lead message/);
    assert.doesNotMatch(serialized, /raw booking message/);
  });

  await t.test('13. Admin detail returns linked booking and event summary', async () => {
    const res = await routeJson(handleMemberRoutes, {
      path: `/admin/members/${bookingMemberId}`,
      authenticateRequest: contextFor('manager')
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.id, bookingMemberId);
    assert.ok(res.body.bookingRequests.some((booking) => booking.id === bookingRequestId));
    assert.ok(res.body.events.some((event) => event.eventType === 'member.linked_to_booking_request'));
  });

  await t.test('14. Staff can read but cannot update member profile', async () => {
    const read = await routeJson(handleMemberRoutes, {
      path: `/admin/members/${memberFromLeadId}`,
      authenticateRequest: contextFor('staff')
    });
    assert.equal(read.statusCode, 200);

    const update = await routeJson(handleMemberRoutes, {
      method: 'PATCH',
      path: `/admin/members/${memberFromLeadId}`,
      body: { status: 'inactive' },
      authenticateRequest: contextFor('staff')
    });
    assert.equal(update.statusCode, 403);
    assert.equal(update.body.error.code, 'MEMBER_PERMISSION_DENIED');
  });

  await t.test('15. Manager can update displayName/status/profileJson but not contact fields', async () => {
    const update = await routeJson(handleMemberRoutes, {
      method: 'PATCH',
      path: `/admin/members/${memberFromLeadId}`,
      body: {
        displayName: 'Updated Member Name',
        status: 'inactive',
        profileJson: { segment: 'vip_candidate' }
      },
      authenticateRequest: contextFor('manager')
    });
    assert.equal(update.statusCode, 200);
    assert.equal(update.body.item.displayName, 'Updated Member Name');
    assert.equal(update.body.item.status, 'inactive');
    assert.equal(update.body.item.profileJson.segment, 'vip_candidate');

    const contactUpdate = await routeJson(handleMemberRoutes, {
      method: 'PATCH',
      path: `/admin/members/${memberFromLeadId}`,
      body: { email: 'new-private@example.com' },
      authenticateRequest: contextFor('manager')
    });
    assert.equal(contactUpdate.statusCode, 400);
    assert.equal(contactUpdate.body.error.code, 'INVALID_MEMBER_PAYLOAD');
  });
});
