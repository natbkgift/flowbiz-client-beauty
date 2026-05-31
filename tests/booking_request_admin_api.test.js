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

async function routeJson(handler, { method = 'GET', path, authenticateRequest, body = {}, searchParams = {} }) {
  const response = createMockResponse();
  const suffix = Object.keys(searchParams).length ? `?${new URLSearchParams(searchParams).toString()}` : '';
  const url = new URL(`http://localhost${path}${suffix}`);

  try {
    await handler(
      { method, headers: {}, socket: { remoteAddress: `127.9.0.${Math.floor(Math.random() * 200) + 1}` } },
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
      response.end(JSON.stringify({
        error: {
          code: err.code,
          message: err.message,
          details: err.details || null
        }
      }));
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
    [`Booking Admin Clinic ${suffix} ${uniqueId}`, `booking-admin-${suffix}-${uniqueId}`]
  );
  const clinicId = Number(clinic.rows[0].id);
  const organization = await pool.query(
    "insert into organizations (clinic_id, name, slug, status) values ($1, $2, $3, 'active') returning id",
    [clinicId, `Booking Admin Org ${suffix}`, `booking-admin-org-${suffix}-${uniqueId}`]
  );
  const workspace = await pool.query(
    "insert into workspaces (clinic_id, organization_id, name, slug, status) values ($1, $2, $3, $4, 'active') returning id",
    [clinicId, organization.rows[0].id, `Booking Admin Workspace ${suffix}`, `booking-admin-ws-${suffix}`]
  );

  return {
    clinicId,
    clinicSlug: `booking-admin-${suffix}-${uniqueId}`,
    organizationId: Number(organization.rows[0].id),
    workspaceId: Number(workspace.rows[0].id)
  };
}

async function createUser(pool, uniqueId, role) {
  const result = await pool.query(
    "insert into users (email, name, password_hash, status) values ($1, $2, 'hash', 'active') returning id",
    [`booking-admin-${role}-${uniqueId}@flowbiz.local`, `Booking ${role}`]
  );
  return Number(result.rows[0].id);
}

async function createLead(pool, tenant, uniqueId, suffix) {
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
      `booking-admin-lead-${suffix}-${uniqueId}`,
      `Jane ${suffix}`,
      `0890000${suffix}`,
      `jane-${suffix}-${uniqueId}@example.com`,
      `@jane-${suffix}`
    ]
  );
  return Number(result.rows[0].id);
}

async function createBookingRequest(pool, tenant, leadId, overrides = {}) {
  const result = await pool.query(
    `
      insert into clinic_booking_requests (
        clinic_id,
        lead_id,
        request_type,
        interest_type,
        interest_id,
        preferred_date,
        preferred_time_window,
        preferred_contact_method,
        customer_name,
        phone,
        email,
        line_id,
        message,
        status,
        created_at,
        updated_at
      )
      values ($1, $2, $3, $4, $5, $6::date, $7, $8, $9, $10, $11, $12, $13, $14, $15::timestamptz, $15::timestamptz)
      returning id
    `,
    [
      tenant.clinicId,
      leadId,
      overrides.requestType || 'booking_request',
      overrides.interestType || 'service',
      Object.prototype.hasOwnProperty.call(overrides, 'interestId') ? overrides.interestId : 11,
      overrides.preferredDate || '2099-06-15',
      overrides.preferredTimeWindow || 'afternoon',
      overrides.preferredContactMethod || 'line',
      overrides.customerName || 'Jane Doe',
      overrides.phone || '0899999999',
      overrides.email || 'private-booking-admin@example.com',
      overrides.lineId || '@privatebookingadmin',
      overrides.message || 'raw private admin booking message',
      overrides.status || 'new',
      overrides.createdAt || '2026-06-10T10:00:00.000Z'
    ]
  );
  return Number(result.rows[0].id);
}

test('Admin Booking Request API - Queue and Status Management', async (t) => {
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

  t.before(async () => {
    tenantA = await createTenant(pool, uniqueId, 'a');
    tenantB = await createTenant(pool, uniqueId, 'b');

    for (const role of ['owner', 'manager', 'marketing', 'sales', 'staff']) {
      roleUserIds[role] = await createUser(pool, uniqueId, role);
      userIds.push(roleUserIds[role]);
    }

    leadAId = await createLead(pool, tenantA, uniqueId, 'a');
    leadBId = await createLead(pool, tenantB, uniqueId, 'b');
    bookingAId = await createBookingRequest(pool, tenantA, leadAId);
    bookingBId = await createBookingRequest(pool, tenantB, leadBId, {
      customerName: 'Clinic B Customer',
      email: `clinic-b-${uniqueId}@example.com`,
      createdAt: '2026-06-11T10:00:00.000Z'
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
    currentUser: { id: roleUserIds[role], email: `booking-admin-${role}-${uniqueId}@flowbiz.local` },
    currentClinic: { id: tenant.clinicId, slug: tenant.clinicSlug },
    currentOrganization: { id: tenant.organizationId },
    currentWorkspace: { id: tenant.workspaceId },
    currentMembership: { role, permissions: [] }
  });

  await t.test('1. Auth required', async () => {
    const res = await routeJson(handleBookingRequestRoutes, {
      path: '/admin/booking-requests'
    });
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error.code, 'AUTH_REQUIRED');
  });

  await t.test('2. Owner/manager/marketing/sales/staff can list own clinic booking requests', async () => {
    for (const role of ['owner', 'manager', 'marketing', 'sales', 'staff']) {
      const res = await routeJson(handleBookingRequestRoutes, {
        path: '/admin/booking-requests',
        authenticateRequest: contextFor(role)
      });
      assert.equal(res.statusCode, 200);
      assert.ok(res.body.items.some((item) => item.id === bookingAId));
      assert.equal(res.body.items.some((item) => item.id === bookingBId), false);
      assert.equal(res.body.limit, 50);
      assert.equal(res.body.offset, 0);
    }
  });

  await t.test('3. Clinic B cannot see clinic A booking requests', async () => {
    const res = await routeJson(handleBookingRequestRoutes, {
      path: '/admin/booking-requests',
      authenticateRequest: contextFor('owner', tenantB)
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.items.some((item) => item.id === bookingAId), false);
    assert.ok(res.body.items.some((item) => item.id === bookingBId));
  });

  await t.test('4. Reject query clinicId and clinic_id override', async () => {
    const camel = await routeJson(handleBookingRequestRoutes, {
      path: '/admin/booking-requests',
      authenticateRequest: contextFor('owner'),
      searchParams: { clinicId: tenantB.clinicId }
    });
    assert.equal(camel.statusCode, 400);
    assert.equal(camel.body.error.code, 'INVALID_REQUEST');

    const snake = await routeJson(handleBookingRequestRoutes, {
      path: '/admin/booking-requests',
      authenticateRequest: contextFor('owner'),
      searchParams: { clinic_id: tenantB.clinicId }
    });
    assert.equal(snake.statusCode, 400);
    assert.equal(snake.body.error.code, 'INVALID_REQUEST');
  });

  await t.test('5. Detail returns only own clinic request', async () => {
    const res = await routeJson(handleBookingRequestRoutes, {
      path: `/admin/booking-requests/${bookingAId}`,
      authenticateRequest: contextFor('owner')
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.id, bookingAId);
    assert.equal(res.body.leadId, leadAId);
    assert.equal(res.body.customerName, 'Jane Doe');
    assert.equal(res.body.lead.id, leadAId);
    assert.ok(Array.isArray(res.body.notes));
  });

  await t.test('6. Detail for cross-tenant id returns 404', async () => {
    const res = await routeJson(handleBookingRequestRoutes, {
      path: `/admin/booking-requests/${bookingBId}`,
      authenticateRequest: contextFor('owner')
    });
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error.code, 'BOOKING_REQUEST_NOT_FOUND');
  });

  await t.test('7. Owner/manager/marketing/sales can update status', async () => {
    const nextByRole = {
      owner: 'contacted',
      manager: 'confirmed',
      marketing: 'cancelled',
      sales: 'closed'
    };

    for (const [role, status] of Object.entries(nextByRole)) {
      await pool.query("update clinic_booking_requests set status = 'new' where id = $1", [bookingAId]);
      const res = await routeJson(handleBookingRequestRoutes, {
        method: 'PATCH',
        path: `/admin/booking-requests/${bookingAId}/status`,
        authenticateRequest: contextFor(role),
        body: { status }
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.item.status, status);
    }
  });

  await t.test('8. Staff cannot update status', async () => {
    const res = await routeJson(handleBookingRequestRoutes, {
      method: 'PATCH',
      path: `/admin/booking-requests/${bookingAId}/status`,
      authenticateRequest: contextFor('staff'),
      body: { status: 'contacted' }
    });
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error.code, 'BOOKING_REQUEST_PERMISSION_DENIED');
  });

  await t.test('9. Invalid status rejected', async () => {
    const res = await routeJson(handleBookingRequestRoutes, {
      method: 'PATCH',
      path: `/admin/booking-requests/${bookingAId}/status`,
      authenticateRequest: contextFor('owner'),
      body: { status: 'scheduled' }
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.code, 'INVALID_BOOKING_REQUEST_STATUS');
  });

  await t.test('10. Missing or cross-tenant id status update returns 404', async () => {
    const missing = await routeJson(handleBookingRequestRoutes, {
      method: 'PATCH',
      path: '/admin/booking-requests/999999999/status',
      authenticateRequest: contextFor('owner'),
      body: { status: 'contacted' }
    });
    assert.equal(missing.statusCode, 404);
    assert.equal(missing.body.error.code, 'BOOKING_REQUEST_NOT_FOUND');

    const cross = await routeJson(handleBookingRequestRoutes, {
      method: 'PATCH',
      path: `/admin/booking-requests/${bookingBId}/status`,
      authenticateRequest: contextFor('owner'),
      body: { status: 'contacted' }
    });
    assert.equal(cross.statusCode, 404);
    assert.equal(cross.body.error.code, 'BOOKING_REQUEST_NOT_FOUND');
  });

  await t.test('11. Status update creates audit summary without raw PII', async () => {
    const res = await routeJson(handleBookingRequestRoutes, {
      method: 'PATCH',
      path: `/admin/booking-requests/${bookingAId}/status`,
      authenticateRequest: contextFor('owner'),
      body: { status: 'contacted' }
    });
    assert.equal(res.statusCode, 200);

    const audit = await pool.query(
      `
        select context_json
        from audit_logs
        where clinic_id = $1
          and entity_type = 'clinic_booking_request'
          and entity_id = $2
          and action_type = 'clinic_booking_request.status_changed'
        order by id desc
        limit 1
      `,
      [tenantA.clinicId, bookingAId]
    );
    assert.equal(audit.rowCount, 1);
    const serialized = JSON.stringify(audit.rows[0].context_json);
    assert.match(serialized, /admin_booking_request_queue/);
    assert.doesNotMatch(serialized, /Jane Doe/);
    assert.doesNotMatch(serialized, /0899999999/);
    assert.doesNotMatch(serialized, /private-booking-admin@example\.com/);
    assert.doesNotMatch(serialized, /@privatebookingadmin/);
    assert.doesNotMatch(serialized, /raw private admin booking message/);
  });

  await t.test('12. Status update creates lead_activity event', async () => {
    const activity = await pool.query(
      `
        select event_data_json
        from lead_activity
        where clinic_id = $1 and lead_id = $2 and event_type = 'booking_request.status_changed'
        order by id desc
        limit 1
      `,
      [tenantA.clinicId, leadAId]
    );
    assert.equal(activity.rowCount, 1);
    assert.equal(activity.rows[0].event_data_json.summary.bookingRequestId, bookingAId);
  });

  await t.test('13. Add note stores CRM note and returns updated detail', async () => {
    const res = await routeJson(handleBookingRequestRoutes, {
      method: 'POST',
      path: `/admin/booking-requests/${bookingAId}/notes`,
      authenticateRequest: contextFor('sales'),
      body: { note: 'โทรแล้ว ลูกค้าขอให้ติดต่ออีกครั้งพรุ่งนี้' }
    });
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.success, true);
    assert.ok(res.body.noteId);
    assert.ok(res.body.item.notes.some((note) => note.content.includes('ติดต่ออีกครั้ง')));

    const note = await pool.query(
      "select content from lead_notes where clinic_id = $1 and lead_id = $2 and note_type = 'booking_request_internal' order by id desc limit 1",
      [tenantA.clinicId, leadAId]
    );
    assert.equal(note.rowCount, 1);
    assert.match(note.rows[0].content, /ลูกค้าขอให้ติดต่อ/);
  });

  await t.test('14. Note audit does not log raw note', async () => {
    const audit = await pool.query(
      `
        select context_json
        from audit_logs
        where clinic_id = $1
          and entity_type = 'clinic_booking_request'
          and entity_id = $2
          and action_type = 'clinic_booking_request.note_added'
        order by id desc
        limit 1
      `,
      [tenantA.clinicId, bookingAId]
    );
    assert.equal(audit.rowCount, 1);
    const serialized = JSON.stringify(audit.rows[0].context_json);
    assert.match(serialized, /noteProvided/);
    assert.doesNotMatch(serialized, /โทรแล้ว/);
    assert.doesNotMatch(serialized, /ลูกค้าขอให้ติดต่อ/);

    const activity = await pool.query(
      "select event_data_json from lead_activity where clinic_id = $1 and lead_id = $2 and event_type = 'booking_request.note_added' order by id desc limit 1",
      [tenantA.clinicId, leadAId]
    );
    assert.equal(activity.rowCount, 1);
    assert.doesNotMatch(JSON.stringify(activity.rows[0].event_data_json), /โทรแล้ว/);
  });

  await t.test('15. List filters status/requestType/interestType/date range', async () => {
    await pool.query(
      `
        update clinic_booking_requests
        set status = 'contacted',
            request_type = 'booking_request',
            interest_type = 'service',
            created_at = '2026-06-10T10:00:00.000Z'
        where id = $1
      `,
      [bookingAId]
    );
    const consultId = await createBookingRequest(pool, tenantA, leadAId, {
      requestType: 'consultation',
      interestType: 'general',
      interestId: null,
      status: 'new',
      customerName: 'Consult Customer',
      email: `consult-${uniqueId}@example.com`,
      createdAt: '2026-05-01T10:00:00.000Z'
    });
    const packageId = await createBookingRequest(pool, tenantA, leadAId, {
      requestType: 'follow_up',
      interestType: 'package',
      interestId: 31,
      status: 'closed',
      customerName: 'Package Customer',
      email: `package-${uniqueId}@example.com`,
      createdAt: '2026-07-10T10:00:00.000Z'
    });

    const byStatus = await routeJson(handleBookingRequestRoutes, {
      path: '/admin/booking-requests',
      authenticateRequest: contextFor('owner'),
      searchParams: { status: 'contacted' }
    });
    assert.equal(byStatus.statusCode, 200);
    assert.ok(byStatus.body.items.some((item) => item.id === bookingAId));
    assert.equal(byStatus.body.items.some((item) => item.id === packageId), false);

    const byRequestType = await routeJson(handleBookingRequestRoutes, {
      path: '/admin/booking-requests',
      authenticateRequest: contextFor('owner'),
      searchParams: { requestType: 'consultation' }
    });
    assert.equal(byRequestType.statusCode, 200);
    assert.ok(byRequestType.body.items.some((item) => item.id === consultId));
    assert.equal(byRequestType.body.items.some((item) => item.id === bookingAId), false);

    const byInterestType = await routeJson(handleBookingRequestRoutes, {
      path: '/admin/booking-requests',
      authenticateRequest: contextFor('owner'),
      searchParams: { interestType: 'package' }
    });
    assert.equal(byInterestType.statusCode, 200);
    assert.ok(byInterestType.body.items.some((item) => item.id === packageId));
    assert.equal(byInterestType.body.items.some((item) => item.id === bookingAId), false);

    const byDateRange = await routeJson(handleBookingRequestRoutes, {
      path: '/admin/booking-requests',
      authenticateRequest: contextFor('owner'),
      searchParams: { dateFrom: '2026-06-01', dateTo: '2026-06-30' }
    });
    assert.equal(byDateRange.statusCode, 200);
    assert.ok(byDateRange.body.items.some((item) => item.id === bookingAId));
    assert.equal(byDateRange.body.items.some((item) => item.id === consultId), false);
    assert.equal(byDateRange.body.items.some((item) => item.id === packageId), false);
  });
});
