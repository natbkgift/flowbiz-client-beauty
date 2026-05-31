'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { loadConfig } = require('../apps/api/src/config');
const { AppError } = require('../apps/api/src/common/errors');
const { json } = require('../apps/api/src/common/http');
const { handleBookingRequestRoutes } = require('../apps/api/src/modules/booking-requests/routes');

function createMockResponse() {
  return {
    statusCode: null,
    body: '',
    writeHead(statusCode) {
      this.statusCode = statusCode;
    },
    end(body = '') {
      this.body = body;
    }
  };
}

async function routeJson({ method = 'GET', path, authenticateRequest, body = {}, searchParams = {} }) {
  const response = createMockResponse();
  const suffix = Object.keys(searchParams).length ? `?${new URLSearchParams(searchParams).toString()}` : '';
  const url = new URL(`http://localhost${path}${suffix}`);

  try {
    await handleBookingRequestRoutes(
      { method, headers: {}, socket: { remoteAddress: `127.15.0.${Math.floor(Math.random() * 200) + 1}` } },
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
    [`Slot Offer Clinic ${suffix} ${uniqueId}`, `slot-offer-${suffix}-${uniqueId}`]
  );
  const clinicId = Number(clinic.rows[0].id);
  const organization = await pool.query(
    "insert into organizations (clinic_id, name, slug, status) values ($1, $2, $3, 'active') returning id",
    [clinicId, `Slot Offer Org ${suffix}`, `slot-offer-org-${suffix}-${uniqueId}`]
  );
  const workspace = await pool.query(
    "insert into workspaces (clinic_id, organization_id, name, slug, status) values ($1, $2, $3, $4, 'active') returning id",
    [clinicId, organization.rows[0].id, `Slot Offer Workspace ${suffix}`, `slot-offer-ws-${suffix}`]
  );

  return {
    clinicId,
    clinicSlug: `slot-offer-${suffix}-${uniqueId}`,
    organizationId: Number(organization.rows[0].id),
    workspaceId: Number(workspace.rows[0].id)
  };
}

async function createUser(pool, uniqueId, role) {
  const result = await pool.query(
    "insert into users (email, name, password_hash, status) values ($1, $2, 'hash', 'active') returning id",
    [`slot-offer-${role}-${uniqueId}@flowbiz.local`, `Slot Offer ${role}`]
  );
  return Number(result.rows[0].id);
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
      `slot-offer-lead-${suffix}-${uniqueId}`,
      `Slot Offer ${suffix}`,
      `0898800${suffix}`,
      `slot-offer-${suffix}-${uniqueId}@example.com`,
      `@slotoffer-${suffix}`
    ]
  );
  return Number(result.rows[0].id);
}

async function createMember(pool, tenant, leadId, uniqueId, suffix) {
  const result = await pool.query(
    `
      insert into clinic_members (clinic_id, lead_id, display_name, phone, email, line_id, source)
      values ($1, $2, $3, $4, $5, $6, 'public_booking_request')
      returning id
    `,
    [
      tenant.clinicId,
      leadId,
      `Slot Member ${suffix}`,
      `0898811${suffix}`,
      `slot-member-${suffix}-${uniqueId}@example.com`,
      `@slotmember-${suffix}`
    ]
  );
  return Number(result.rows[0].id);
}

async function createBookingRequest(pool, tenant, leadId, memberId, overrides = {}) {
  const result = await pool.query(
    `
      insert into clinic_booking_requests (
        clinic_id, lead_id, member_id, request_type, interest_type,
        preferred_date, preferred_time_window, visit_type, urgency, slot_status,
        slot_request_json, preferred_contact_method, customer_name, phone,
        email, line_id, message, status, created_at, updated_at
      )
      values (
        $1, $2, $3, 'booking_request', 'service',
        $4::date, $5, 'consultation', 'soon', $6,
        '{}'::jsonb, 'line', $7, $8, $9, $10, $11, 'new',
        '2026-06-10T10:00:00.000Z', '2026-06-10T10:00:00.000Z'
      )
      returning id
    `,
    [
      tenant.clinicId,
      leadId,
      memberId,
      overrides.preferredDate || '2099-06-15',
      overrides.preferredTimeWindow || 'afternoon',
      overrides.slotStatus || 'requested',
      overrides.customerName || 'Slot Offer Customer',
      overrides.phone || '0899999999',
      overrides.email || 'slot-offer-customer@example.com',
      overrides.lineId || '@slotoffercustomer',
      overrides.message || 'raw private slot offer booking message'
    ]
  );
  return Number(result.rows[0].id);
}

test('Booking Slot Offer API - admin offer drafts', async (t) => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const uniqueId = Date.now() + Math.floor(Math.random() * 1000);
  const userIds = [];
  const roleUserIds = {};
  let tenantA;
  let tenantB;
  let leadAId;
  let leadBId;
  let memberAId;
  let memberBId;
  let bookingAId;
  let bookingBId;
  let offerAId;

  const validPayload = (overrides = {}) => ({
    offeredDate: '2099-06-20',
    offeredTimeWindow: 'specific_time',
    offeredStartTime: '14:00',
    durationMinutes: 60,
    offerStatus: 'draft',
    offerNote: 'ขอเสนอเวลา 14:00 ค่ะ',
    internalNote: 'ลูกค้าขอช่วงบ่าย',
    metadata: { source: 'admin_queue' },
    ...overrides
  });

  t.before(async () => {
    tenantA = await createTenant(pool, uniqueId, 'a');
    tenantB = await createTenant(pool, uniqueId, 'b');
    for (const role of ['owner', 'manager', 'sales', 'staff', 'operator']) {
      roleUserIds[role] = await createUser(pool, uniqueId, role);
      userIds.push(roleUserIds[role]);
    }
    leadAId = await createLead(pool, tenantA, uniqueId, 'a');
    leadBId = await createLead(pool, tenantB, uniqueId, 'b');
    memberAId = await createMember(pool, tenantA, leadAId, uniqueId, 'a');
    memberBId = await createMember(pool, tenantB, leadBId, uniqueId, 'b');
    bookingAId = await createBookingRequest(pool, tenantA, leadAId, memberAId);
    bookingBId = await createBookingRequest(pool, tenantB, leadBId, memberBId, {
      customerName: 'Other Clinic Slot Customer',
      email: `other-slot-${uniqueId}@example.com`
    });

    const offerB = await pool.query(
      `
        insert into clinic_booking_slot_offers (
          clinic_id, booking_request_id, lead_id, member_id, offered_date,
          offered_time_window, offered_start_time, duration_minutes, offer_status
        )
        values ($1, $2, $3, $4, '2099-07-01', 'afternoon', null, 45, 'draft')
        returning id
      `,
      [tenantB.clinicId, bookingBId, leadBId, memberBId]
    );
    assert.ok(offerB.rows[0].id);
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
    currentUser: { id: roleUserIds[role], email: `slot-offer-${role}-${uniqueId}@flowbiz.local` },
    currentClinic: { id: tenant.clinicId, slug: tenant.clinicSlug },
    currentOrganization: { id: tenant.organizationId },
    currentWorkspace: { id: tenant.workspaceId },
    currentMembership: { role, permissions: [] }
  });

  await t.test('1. Auth required', async () => {
    const res = await routeJson({ path: `/admin/booking-requests/${bookingAId}/slot-offers` });
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error.code, 'AUTH_REQUIRED');
  });

  await t.test('2. Read roles can list slot offers', async () => {
    for (const role of ['owner', 'manager', 'sales', 'staff', 'operator']) {
      const res = await routeJson({
        path: `/admin/booking-requests/${bookingAId}/slot-offers`,
        authenticateRequest: contextFor(role)
      });
      assert.equal(res.statusCode, 200);
      assert.ok(Array.isArray(res.body.items));
    }
  });

  await t.test('3. Staff/operator cannot create offer', async () => {
    for (const role of ['staff', 'operator']) {
      const res = await routeJson({
        method: 'POST',
        path: `/admin/booking-requests/${bookingAId}/slot-offers`,
        authenticateRequest: contextFor(role),
        body: validPayload()
      });
      assert.equal(res.statusCode, 403);
      assert.equal(res.body.error.code, 'SLOT_OFFER_PERMISSION_DENIED');
    }
  });

  await t.test('4. Owner/manager/sales can create offer', async () => {
    for (const role of ['owner', 'manager', 'sales']) {
      const res = await routeJson({
        method: 'POST',
        path: `/admin/booking-requests/${bookingAId}/slot-offers`,
        authenticateRequest: contextFor(role),
        body: validPayload({ offeredDate: '2099-06-21' })
      });
      assert.equal(res.statusCode, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.offer.offeredTimeWindow, 'specific_time');
      assert.equal(res.body.bookingRequest.slotStatus, 'offered');
      offerAId = offerAId || res.body.offer.id;
    }
  });

  await t.test('5. Create offer rejects clinicId/clinic_id override', async () => {
    for (const override of [{ clinicId: tenantB.clinicId }, { clinic_id: tenantB.clinicId }]) {
      const res = await routeJson({
        method: 'POST',
        path: `/admin/booking-requests/${bookingAId}/slot-offers`,
        authenticateRequest: contextFor('owner'),
        body: validPayload(override)
      });
      assert.equal(res.statusCode, 400);
      assert.equal(res.body.error.code, 'INVALID_REQUEST');
    }
  });

  await t.test('6. Cross-tenant booking request create offer returns 404', async () => {
    const res = await routeJson({
      method: 'POST',
      path: `/admin/booking-requests/${bookingBId}/slot-offers`,
      authenticateRequest: contextFor('owner'),
      body: validPayload()
    });
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error.code, 'BOOKING_REQUEST_NOT_FOUND');
  });

  await t.test('7. Create validation rejects invalid payloads', async () => {
    for (const [overrides, code] of [
      [{ offeredDate: '' }, 'INVALID_SLOT_OFFER_DATE'],
      [{ offeredDate: '2000-01-01' }, 'INVALID_SLOT_OFFER_DATE'],
      [{ offeredTimeWindow: 'midnight' }, 'INVALID_SLOT_OFFER_TIME_WINDOW'],
      [{ offeredTimeWindow: 'specific_time', offeredStartTime: '' }, 'INVALID_SLOT_OFFER_START_TIME'],
      [{ offeredStartTime: '24:00' }, 'INVALID_SLOT_OFFER_START_TIME'],
      [{ durationMinutes: 4 }, 'INVALID_SLOT_OFFER_DURATION'],
      [{ offerNote: 'x'.repeat(501) }, 'INVALID_SLOT_OFFER_PAYLOAD'],
      [{ internalNote: 'x'.repeat(1001) }, 'INVALID_SLOT_OFFER_PAYLOAD'],
      [{ metadata: 'raw' }, 'INVALID_SLOT_OFFER_PAYLOAD'],
      [{ offerStatus: 'scheduled' }, 'INVALID_SLOT_OFFER_STATUS']
    ]) {
      const res = await routeJson({
        method: 'POST',
        path: `/admin/booking-requests/${bookingAId}/slot-offers`,
        authenticateRequest: contextFor('owner'),
        body: validPayload(overrides)
      });
      assert.equal(res.statusCode, 400);
      assert.equal(res.body.error.code, code);
    }
  });

  await t.test('8. Create offer updates slot_status and writes summary-only activity/audit', async () => {
    const res = await routeJson({
      method: 'POST',
      path: `/admin/booking-requests/${bookingAId}/slot-offers`,
      authenticateRequest: contextFor('owner'),
      body: validPayload({
        offerNote: 'raw offer note should not be copied',
        internalNote: 'raw internal note should not be copied'
      })
    });
    assert.equal(res.statusCode, 201);

    const booking = await pool.query('select slot_status from clinic_booking_requests where id = $1', [bookingAId]);
    assert.equal(booking.rows[0].slot_status, 'offered');

    const activity = await pool.query(
      "select event_data_json from lead_activity where clinic_id = $1 and lead_id = $2 and event_type = 'booking_request.slot_offer_created' order by id desc limit 1",
      [tenantA.clinicId, leadAId]
    );
    assert.equal(activity.rowCount, 1);
    assert.equal(activity.rows[0].event_data_json.summary.offerNoteProvided, true);
    assert.doesNotMatch(JSON.stringify(activity.rows[0].event_data_json), /raw offer note should not be copied/);
    assert.doesNotMatch(JSON.stringify(activity.rows[0].event_data_json), /raw internal note should not be copied/);

    const audit = await pool.query(
      "select context_json from audit_logs where clinic_id = $1 and entity_type = 'clinic_booking_slot_offer' and action_type = 'clinic_booking_slot_offer.created' order by id desc limit 1",
      [tenantA.clinicId]
    );
    assert.equal(audit.rowCount, 1);
    assert.doesNotMatch(JSON.stringify(audit.rows[0].context_json), /raw offer note should not be copied/);
    assert.doesNotMatch(JSON.stringify(audit.rows[0].context_json), /raw internal note should not be copied/);
  });

  await t.test('9. List offers returns only current clinic offers and rejects query override', async () => {
    await pool.query(
      'update clinic_booking_slot_offers set customer_response_note = $1 where id = $2',
      ['admin-visible customer response note', offerAId]
    );

    const override = await routeJson({
      path: `/admin/booking-requests/${bookingAId}/slot-offers`,
      authenticateRequest: contextFor('owner'),
      searchParams: { clinicId: tenantB.clinicId }
    });
    assert.equal(override.statusCode, 400);
    assert.equal(override.body.error.code, 'INVALID_REQUEST');

    const list = await routeJson({
      path: `/admin/booking-requests/${bookingAId}/slot-offers`,
      authenticateRequest: contextFor('owner')
    });
    assert.equal(list.statusCode, 200);
    assert.ok(list.body.items.every((item) => item.bookingRequestId === bookingAId));
    assert.ok(list.body.items.some((item) => item.offerNote === 'ขอเสนอเวลา 14:00 ค่ะ'));
    assert.ok(list.body.items.some((item) => item.id === offerAId && item.customerResponseNote === 'admin-visible customer response note'));

    const cross = await routeJson({
      path: `/admin/booking-requests/${bookingBId}/slot-offers`,
      authenticateRequest: contextFor('owner')
    });
    assert.equal(cross.statusCode, 404);
    assert.equal(cross.body.error.code, 'BOOKING_REQUEST_NOT_FOUND');
  });

  await t.test('10. Offer status update validates status, tenant, and permissions', async () => {
    const invalid = await routeJson({
      method: 'PATCH',
      path: `/admin/booking-requests/${bookingAId}/slot-offers/${offerAId}/status`,
      authenticateRequest: contextFor('owner'),
      body: { offerStatus: 'scheduled' }
    });
    assert.equal(invalid.statusCode, 400);
    assert.equal(invalid.body.error.code, 'INVALID_SLOT_OFFER_STATUS');

    const staff = await routeJson({
      method: 'PATCH',
      path: `/admin/booking-requests/${bookingAId}/slot-offers/${offerAId}/status`,
      authenticateRequest: contextFor('staff'),
      body: { offerStatus: 'ready_to_send' }
    });
    assert.equal(staff.statusCode, 403);
    assert.equal(staff.body.error.code, 'SLOT_OFFER_PERMISSION_DENIED');

    const cross = await routeJson({
      method: 'PATCH',
      path: `/admin/booking-requests/${bookingBId}/slot-offers/${offerAId}/status`,
      authenticateRequest: contextFor('owner'),
      body: { offerStatus: 'ready_to_send' }
    });
    assert.equal(cross.statusCode, 404);
    assert.equal(cross.body.error.code, 'SLOT_OFFER_NOT_FOUND');

    const updated = await routeJson({
      method: 'PATCH',
      path: `/admin/booking-requests/${bookingAId}/slot-offers/${offerAId}/status`,
      authenticateRequest: contextFor('owner'),
      body: { offerStatus: 'ready_to_send' }
    });
    assert.equal(updated.statusCode, 200);
    assert.equal(updated.body.offer.offerStatus, 'ready_to_send');
  });
});
