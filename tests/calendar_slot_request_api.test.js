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

async function routeJson({ method = 'POST', path, body = {}, searchParams = {}, authenticateRequest }) {
  const response = createMockResponse();
  const suffix = Object.keys(searchParams).length ? `?${new URLSearchParams(searchParams).toString()}` : '';
  const url = new URL(`http://localhost${path}${suffix}`);

  try {
    await handleBookingRequestRoutes(
      { method, headers: {}, socket: { remoteAddress: `127.14.0.${Math.floor(Math.random() * 200) + 1}` } },
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

function dateOnly(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value);
  const isoDate = text.match(/^\d{4}-\d{2}-\d{2}/);
  if (isoDate) return isoDate[0];
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return text;
}

async function createTenant(pool, uniqueId, suffix) {
  const clinic = await pool.query(
    "insert into clinics (name, slug, plan, status) values ($1, $2, 'starter', 'active') returning id",
    [`Calendar Slot Clinic ${suffix} ${uniqueId}`, `calendar-slot-${suffix}-${uniqueId}`]
  );
  const clinicId = Number(clinic.rows[0].id);
  const organization = await pool.query(
    "insert into organizations (clinic_id, name, slug, status) values ($1, $2, $3, 'active') returning id",
    [clinicId, `Calendar Slot Org ${suffix}`, `calendar-slot-org-${suffix}-${uniqueId}`]
  );
  const workspace = await pool.query(
    "insert into workspaces (clinic_id, organization_id, name, slug, status) values ($1, $2, $3, $4, 'active') returning id",
    [clinicId, organization.rows[0].id, `Calendar Slot Workspace ${suffix}`, `calendar-slot-ws-${suffix}`]
  );

  return {
    clinicId,
    clinicSlug: `calendar-slot-${suffix}-${uniqueId}`,
    organizationId: Number(organization.rows[0].id),
    workspaceId: Number(workspace.rows[0].id)
  };
}

async function createUser(pool, uniqueId, role) {
  const result = await pool.query(
    "insert into users (email, name, password_hash, status) values ($1, $2, 'hash', 'active') returning id",
    [`calendar-slot-${role}-${uniqueId}@flowbiz.local`, `Calendar Slot ${role}`]
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
      `calendar-slot-lead-${suffix}-${uniqueId}`,
      `Slot ${suffix}`,
      `0897777${suffix}`,
      `slot-${suffix}-${uniqueId}@example.com`,
      `@slot-${suffix}`
    ]
  );
  return Number(result.rows[0].id);
}

async function createBookingRequest(pool, tenant, leadId, overrides = {}) {
  const result = await pool.query(
    `
      insert into clinic_booking_requests (
        clinic_id, lead_id, request_type, interest_type, interest_id,
        preferred_date, preferred_time_window, alternative_preferred_date,
        alternative_time_window, visit_type, urgency, slot_status,
        slot_request_json, preferred_contact_method, customer_name, phone,
        email, line_id, message, status, created_at, updated_at
      )
      values (
        $1, $2, 'booking_request', 'service', 11,
        $3::date, $4, $5::date, $6, $7, $8, $9,
        $10::jsonb, 'line', $11, $12, $13, $14, $15, 'new',
        $16::timestamptz, $16::timestamptz
      )
      returning id
    `,
    [
      tenant.clinicId,
      leadId,
      overrides.preferredDate || '2099-06-15',
      overrides.preferredTimeWindow || 'afternoon',
      overrides.alternativePreferredDate || '2099-06-16',
      overrides.alternativeTimeWindow || 'morning',
      overrides.visitType || 'consultation',
      overrides.urgency || 'normal',
      overrides.slotStatus || 'requested',
      JSON.stringify(overrides.slotRequest || { notes: 'stored privately' }),
      overrides.customerName || 'Slot Customer',
      overrides.phone || '0899999999',
      overrides.email || 'slot-customer@example.com',
      overrides.lineId || '@slotcustomer',
      overrides.message || 'raw public message',
      overrides.createdAt || '2026-06-10T10:00:00.000Z'
    ]
  );
  return Number(result.rows[0].id);
}

test('Calendar Slot Request API - slot preferences and admin queue', async (t) => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const uniqueId = Date.now() + Math.floor(Math.random() * 1000);
  const userIds = [];
  let tenantA;
  let tenantB;
  let leadAId;
  let leadBId;
  let bookingAId;
  let bookingBId;
  const roleUserIds = {};

  const validPayload = (overrides = {}) => ({
    name: 'Jane Slot',
    phone: '0899999999',
    email: `jane-slot-${uniqueId}@example.com`,
    lineId: '@janeslot',
    requestType: 'booking_request',
    interestType: 'general',
    preferredDate: '2099-06-15',
    preferredTimeWindow: 'afternoon',
    alternativePreferredDate: '2099-06-16',
    alternativeTimeWindow: 'morning',
    visitType: 'consultation',
    urgency: 'normal',
    slotRequest: { notes: 'สะดวกหลังบ่ายสอง', flexible: true },
    preferredContactMethod: 'line',
    message: 'อยากปรึกษาก่อนทำ',
    consentAccepted: true,
    honeypot: '',
    ...overrides
  });

  t.before(async () => {
    tenantA = await createTenant(pool, uniqueId, 'a');
    tenantB = await createTenant(pool, uniqueId, 'b');
    for (const role of ['owner', 'staff']) {
      roleUserIds[role] = await createUser(pool, uniqueId, role);
      userIds.push(roleUserIds[role]);
    }
    leadAId = await createLead(pool, tenantA, uniqueId, 'a');
    leadBId = await createLead(pool, tenantB, uniqueId, 'b');
    bookingAId = await createBookingRequest(pool, tenantA, leadAId, {
      slotStatus: 'requested',
      visitType: 'consultation',
      urgency: 'soon',
      preferredDate: '2099-06-15'
    });
    bookingBId = await createBookingRequest(pool, tenantB, leadBId, {
      slotStatus: 'reviewing',
      visitType: 'treatment',
      urgency: 'urgent',
      preferredDate: '2099-07-01'
    });
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
    currentUser: { id: roleUserIds[role], email: `calendar-slot-${role}-${uniqueId}@flowbiz.local` },
    currentClinic: { id: tenant.clinicId, slug: tenant.clinicSlug },
    currentOrganization: { id: tenant.organizationId },
    currentWorkspace: { id: tenant.workspaceId },
    currentMembership: { role, permissions: [] }
  });

  await t.test('1. Public submit stores slot fields with requested slot status', async () => {
    const res = await routeJson({
      path: `/public/clinics/${tenantA.clinicSlug}/booking-requests`,
      body: validPayload()
    });
    assert.equal(res.statusCode, 201);

    const booking = await pool.query(
      `
        select alternative_preferred_date, alternative_time_window, visit_type,
               urgency, slot_status, slot_request_json
        from clinic_booking_requests
        where id = $1
      `,
      [res.body.bookingRequestId]
    );
    assert.equal(dateOnly(booking.rows[0].alternative_preferred_date), '2099-06-16');
    assert.equal(booking.rows[0].alternative_time_window, 'morning');
    assert.equal(booking.rows[0].visit_type, 'consultation');
    assert.equal(booking.rows[0].urgency, 'normal');
    assert.equal(booking.rows[0].slot_status, 'requested');
    assert.equal(booking.rows[0].slot_request_json.notes, 'สะดวกหลังบ่ายสอง');
  });

  await t.test('2. Public validation rejects invalid slot payloads', async () => {
    for (const [overrides, code] of [
      [{ alternativePreferredDate: '2026-02-31' }, 'INVALID_SLOT_DATE'],
      [{ alternativePreferredDate: '2000-01-01' }, 'INVALID_SLOT_DATE'],
      [{ alternativeTimeWindow: 'midnight' }, 'INVALID_SLOT_TIME_WINDOW'],
      [{ visitType: 'surgery' }, 'INVALID_VISIT_TYPE'],
      [{ urgency: 'now' }, 'INVALID_URGENCY'],
      [{ slotRequest: 'raw notes' }, 'INVALID_SLOT_REQUEST_PAYLOAD']
    ]) {
      const res = await routeJson({
        path: `/public/clinics/${tenantA.clinicSlug}/booking-requests`,
        body: validPayload(overrides)
      });
      assert.equal(res.statusCode, 400);
      assert.equal(res.body.error.code, code);
    }
  });

  await t.test('3. Audit/activity summary excludes raw slot notes', async () => {
    const res = await routeJson({
      path: `/public/clinics/${tenantA.clinicSlug}/booking-requests`,
      body: validPayload({ slotRequest: { notes: 'raw private slot note', flexible: true } })
    });
    assert.equal(res.statusCode, 201);

    const audit = await pool.query(
      "select context_json from audit_logs where clinic_id = $1 and entity_id = $2 and action_type = 'clinic_booking_request.created' order by id desc limit 1",
      [tenantA.clinicId, res.body.bookingRequestId]
    );
    assert.equal(audit.rowCount, 1);
    const serializedAudit = JSON.stringify(audit.rows[0].context_json);
    assert.match(serializedAudit, /slotRequestProvided/);
    assert.doesNotMatch(serializedAudit, /raw private slot note/);

    const activity = await pool.query(
      "select event_data_json from lead_activity where clinic_id = $1 and lead_id = $2 and event_type = 'booking_request.created' order by id desc limit 1",
      [tenantA.clinicId, res.body.leadId]
    );
    assert.equal(activity.rowCount, 1);
    assert.doesNotMatch(JSON.stringify(activity.rows[0].event_data_json), /raw private slot note/);
  });

  await t.test('4. Admin list/detail returns slot fields and rejects clinic override', async () => {
    const override = await routeJson({
      method: 'GET',
      path: '/admin/booking-requests',
      authenticateRequest: contextFor('owner'),
      searchParams: { clinicId: tenantB.clinicId }
    });
    assert.equal(override.statusCode, 400);
    assert.equal(override.body.error.code, 'INVALID_REQUEST');

    const list = await routeJson({
      method: 'GET',
      path: '/admin/booking-requests',
      authenticateRequest: contextFor('owner')
    });
    assert.equal(list.statusCode, 200);
    const item = list.body.items.find((entry) => entry.id === bookingAId);
    assert.equal(item.alternativePreferredDate, '2099-06-16');
    assert.equal(item.alternativeTimeWindow, 'morning');
    assert.equal(item.visitType, 'consultation');
    assert.equal(item.urgency, 'soon');
    assert.equal(item.slotStatus, 'requested');

    const detail = await routeJson({
      method: 'GET',
      path: `/admin/booking-requests/${bookingAId}`,
      authenticateRequest: contextFor('owner')
    });
    assert.equal(detail.statusCode, 200);
    assert.equal(detail.body.alternativePreferredDate, '2099-06-16');
    assert.equal(detail.body.slotRequest.notes, 'stored privately');
  });

  await t.test('5. Admin filters by slot fields and keeps wildcard escaping', async () => {
    for (const [searchParams, expectedId] of [
      [{ slotStatus: 'requested' }, bookingAId],
      [{ visitType: 'consultation' }, bookingAId],
      [{ urgency: 'soon' }, bookingAId],
      [{ preferredDateFrom: '2099-06-01', preferredDateTo: '2099-06-30' }, bookingAId]
    ]) {
      const res = await routeJson({
        method: 'GET',
        path: '/admin/booking-requests',
        authenticateRequest: contextFor('owner'),
        searchParams
      });
      assert.equal(res.statusCode, 200);
      assert.ok(res.body.items.some((item) => item.id === expectedId));
      assert.equal(res.body.items.some((item) => item.id === bookingBId), false);
    }

    const wildcard = await routeJson({
      method: 'GET',
      path: '/admin/booking-requests',
      authenticateRequest: contextFor('owner'),
      searchParams: { q: '%' }
    });
    assert.equal(wildcard.statusCode, 200);
    assert.equal(wildcard.body.items.length, 0);
  });

  await t.test('6. Slot status endpoint enforces permissions, validation, and tenant scope', async () => {
    const updated = await routeJson({
      method: 'PATCH',
      path: `/admin/booking-requests/${bookingAId}/slot-status`,
      authenticateRequest: contextFor('owner'),
      body: { slotStatus: 'reviewing' }
    });
    assert.equal(updated.statusCode, 200);
    assert.equal(updated.body.item.slotStatus, 'reviewing');

    const staff = await routeJson({
      method: 'PATCH',
      path: `/admin/booking-requests/${bookingAId}/slot-status`,
      authenticateRequest: contextFor('staff'),
      body: { slotStatus: 'offered' }
    });
    assert.equal(staff.statusCode, 403);
    assert.equal(staff.body.error.code, 'BOOKING_REQUEST_PERMISSION_DENIED');

    const invalid = await routeJson({
      method: 'PATCH',
      path: `/admin/booking-requests/${bookingAId}/slot-status`,
      authenticateRequest: contextFor('owner'),
      body: { slotStatus: 'scheduled' }
    });
    assert.equal(invalid.statusCode, 400);
    assert.equal(invalid.body.error.code, 'INVALID_SLOT_STATUS');

    const cross = await routeJson({
      method: 'PATCH',
      path: `/admin/booking-requests/${bookingBId}/slot-status`,
      authenticateRequest: contextFor('owner'),
      body: { slotStatus: 'accepted' }
    });
    assert.equal(cross.statusCode, 404);
    assert.equal(cross.body.error.code, 'BOOKING_REQUEST_NOT_FOUND');
  });
});
