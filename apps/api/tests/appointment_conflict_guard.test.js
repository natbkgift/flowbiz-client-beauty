'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { loadConfig } = require('../src/config');
const { AppError } = require('../src/common/errors');
const { json } = require('../src/common/http');
const { handleAppointmentRoutes } = require('../src/modules/appointments/routes');

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
    await handleAppointmentRoutes(
      { method, headers: {}, socket: { remoteAddress: `127.18.0.${Math.floor(Math.random() * 200) + 1}` } },
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
    [`PR17B Clinic ${suffix} ${uniqueId}`, `pr17b-${suffix}-${uniqueId}`]
  );
  const clinicId = Number(clinic.rows[0].id);
  const organization = await pool.query(
    "insert into organizations (clinic_id, name, slug, status) values ($1, $2, $3, 'active') returning id",
    [clinicId, `PR17B Org ${suffix}`, `pr17b-org-${suffix}-${uniqueId}`]
  );
  const workspace = await pool.query(
    "insert into workspaces (clinic_id, organization_id, name, slug, status) values ($1, $2, $3, $4, 'active') returning id",
    [clinicId, organization.rows[0].id, `PR17B Workspace ${suffix}`, `pr17b-ws-${suffix}-${uniqueId}`]
  );

  return {
    clinicId,
    clinicSlug: `pr17b-${suffix}-${uniqueId}`,
    organizationId: Number(organization.rows[0].id),
    workspaceId: Number(workspace.rows[0].id)
  };
}

async function createUser(pool, uniqueId) {
  const result = await pool.query(
    "insert into users (email, name, password_hash, status) values ($1, 'PR17B Owner', 'hash', 'active') returning id",
    [`pr17b-owner-${uniqueId}@flowbiz.local`]
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
      `pr17b-lead-${suffix}-${uniqueId}`,
      `PR17B Lead ${suffix}`,
      `08917${suffix}`,
      `pr17b-lead-${suffix}-${uniqueId}@example.com`,
      `@pr17b-lead-${suffix}`
    ]
  );
  return Number(result.rows[0].id);
}

async function createMember(pool, tenant, leadId, uniqueId, suffix) {
  const result = await pool.query(
    `
      insert into clinic_members (clinic_id, lead_id, display_name, phone, email, line_id, status, source)
      values ($1, $2, $3, $4, $5, $6, 'active', 'public_booking_request')
      returning id
    `,
    [
      tenant.clinicId,
      leadId,
      `PR17B Member ${suffix}`,
      `08927${suffix}`,
      `pr17b-member-${suffix}-${uniqueId}@example.com`,
      `@pr17b-member-${suffix}`
    ]
  );
  return Number(result.rows[0].id);
}

async function createBooking(pool, tenant, leadId, memberId, suffix) {
  const result = await pool.query(
    `
      insert into clinic_booking_requests (
        clinic_id, lead_id, member_id, request_type, interest_type,
        preferred_date, preferred_time_window, visit_type, urgency, slot_status,
        slot_request_json, preferred_contact_method, customer_name, phone,
        email, line_id, message, status
      )
      values (
        $1, $2, $3, 'booking_request', 'service',
        '2099-06-15', 'afternoon', 'consultation', 'soon', 'accepted',
        '{}'::jsonb, 'line', $4, $5, $6, $7, $8, 'new'
      )
      returning id
    `,
    [
      tenant.clinicId,
      leadId,
      memberId,
      `PR17B Private Customer ${suffix}`,
      `08937${suffix}`,
      `pr17b-booking-${suffix}@example.com`,
      `@pr17b-booking-${suffix}`,
      `raw PR17B private booking message ${suffix}`
    ]
  );
  return Number(result.rows[0].id);
}

async function createOffer(pool, tenant, bookingId, leadId, memberId, suffix, overrides = {}) {
  const result = await pool.query(
    `
      insert into clinic_booking_slot_offers (
        clinic_id,
        booking_request_id,
        lead_id,
        member_id,
        offered_date,
        offered_time_window,
        offered_start_time,
        duration_minutes,
        offer_status,
        customer_response,
        offer_note,
        internal_note,
        metadata_json
      )
      values ($1, $2, $3, $4, $5::date, 'specific_time', $6, $7, 'accepted', 'accepted', $8, $9, $10::jsonb)
      returning id
    `,
    [
      tenant.clinicId,
      bookingId,
      leadId,
      memberId,
      overrides.offeredDate,
      overrides.offeredStartTime,
      overrides.durationMinutes || 60,
      `raw PR17B offer note ${suffix}`,
      `raw PR17B internal note ${suffix}`,
      JSON.stringify({ unsafe: `raw PR17B metadata ${suffix}` })
    ]
  );
  return Number(result.rows[0].id);
}

async function createAcceptedOffer(pool, tenant, uniqueId, suffix, overrides) {
  const leadId = await createLead(pool, tenant, uniqueId, suffix);
  const memberId = await createMember(pool, tenant, leadId, uniqueId, suffix);
  const bookingId = await createBooking(pool, tenant, leadId, memberId, suffix);
  const offerId = await createOffer(pool, tenant, bookingId, leadId, memberId, suffix, overrides);
  return { leadId, memberId, bookingId, offerId };
}

function piiNeedles(uniqueId, suffix) {
  return [
    `PR17B Private Customer ${suffix}`,
    `08937${suffix}`,
    `pr17b-booking-${suffix}@example.com`,
    `@pr17b-booking-${suffix}`,
    `raw PR17B private booking message ${suffix}`,
    `raw PR17B offer note ${suffix}`,
    `raw PR17B internal note ${suffix}`,
    `raw PR17B metadata ${suffix}`,
    `pr17b-lead-${suffix}-${uniqueId}@example.com`,
    `pr17b-member-${suffix}-${uniqueId}@example.com`
  ];
}

test('PR17B Appointment Conflict Guard', async (t) => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const uniqueId = Date.now() + Math.floor(Math.random() * 1000);
  const userIds = [];
  let tenantA;
  let tenantB;
  let ownerUserId;

  t.before(async () => {
    tenantA = await createTenant(pool, uniqueId, 'a');
    tenantB = await createTenant(pool, uniqueId, 'b');
    ownerUserId = await createUser(pool, uniqueId);
    userIds.push(ownerUserId);
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

  const contextFor = (tenant = tenantA) => async () => ({
    currentUser: { id: ownerUserId, email: `pr17b-owner-${uniqueId}@flowbiz.local` },
    currentClinic: { id: tenant.clinicId, slug: tenant.clinicSlug },
    currentOrganization: { id: tenant.organizationId },
    currentWorkspace: { id: tenant.workspaceId },
    currentMembership: { role: 'owner', permissions: [] }
  });

  const confirmOffer = (tenant, bookingId, offerId) => routeJson({
    method: 'POST',
    path: `/admin/booking-requests/${bookingId}/slot-offers/${offerId}/confirm-appointment`,
    authenticateRequest: contextFor(tenant)
  });

  const updateStatus = (tenant, appointmentId, status) => routeJson({
    method: 'PATCH',
    path: `/admin/confirmed-appointments/${appointmentId}/status`,
    authenticateRequest: contextFor(tenant),
    body: { status }
  });

  await t.test('1. Blocks overlapping appointment in the same clinic', async () => {
    const existing = await createAcceptedOffer(pool, tenantA, uniqueId, 'block-base', {
      offeredDate: '2099-07-10',
      offeredStartTime: '14:00'
    });
    const created = await confirmOffer(tenantA, existing.bookingId, existing.offerId);
    assert.equal(created.statusCode, 201);

    const proposed = await createAcceptedOffer(pool, tenantA, uniqueId, 'block-overlap', {
      offeredDate: '2099-07-10',
      offeredStartTime: '14:30'
    });
    const beforeDrafts = await pool.query('select count(*)::int as count from notification_drafts where clinic_id = $1', [tenantA.clinicId]);
    const beforeAttempts = await pool.query('select count(*)::int as count from notification_delivery_attempts where clinic_id = $1', [tenantA.clinicId]);

    const blocked = await confirmOffer(tenantA, proposed.bookingId, proposed.offerId);

    assert.equal(blocked.statusCode, 409);
    assert.equal(blocked.body.error.code, 'APPOINTMENT_TIME_CONFLICT');
    assert.deepEqual(blocked.body.error.details, {
      conflict: {
        appointmentId: created.body.appointment.id,
        appointmentDate: '2099-07-10',
        startTime: '14:00',
        endTime: '15:00',
        status: 'scheduled'
      }
    });

    const count = await pool.query(
      'select count(*)::int as count from clinic_confirmed_appointments where clinic_id = $1 and slot_offer_id = $2',
      [tenantA.clinicId, proposed.offerId]
    );
    assert.equal(count.rows[0].count, 0);

    const serialized = JSON.stringify(blocked.body);
    for (const needle of [
      ...piiNeedles(uniqueId, 'block-base'),
      ...piiNeedles(uniqueId, 'block-overlap')
    ]) {
      assert.equal(serialized.includes(needle), false, `conflict response leaked ${needle}`);
    }

    const afterDrafts = await pool.query('select count(*)::int as count from notification_drafts where clinic_id = $1', [tenantA.clinicId]);
    const afterAttempts = await pool.query('select count(*)::int as count from notification_delivery_attempts where clinic_id = $1', [tenantA.clinicId]);
    assert.equal(afterDrafts.rows[0].count, beforeDrafts.rows[0].count);
    assert.equal(afterAttempts.rows[0].count, beforeAttempts.rows[0].count);
  });

  await t.test('2. Allows adjacent appointment after existing appointment', async () => {
    const existing = await createAcceptedOffer(pool, tenantA, uniqueId, 'after-base', {
      offeredDate: '2099-07-11',
      offeredStartTime: '14:00'
    });
    await confirmOffer(tenantA, existing.bookingId, existing.offerId);

    const adjacent = await createAcceptedOffer(pool, tenantA, uniqueId, 'after-adjacent', {
      offeredDate: '2099-07-11',
      offeredStartTime: '15:00'
    });
    const res = await confirmOffer(tenantA, adjacent.bookingId, adjacent.offerId);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.appointment.startTime, '15:00');
    assert.equal(res.body.appointment.endTime, '16:00');
  });

  await t.test('3. Allows adjacent appointment before existing appointment', async () => {
    const existing = await createAcceptedOffer(pool, tenantA, uniqueId, 'before-base', {
      offeredDate: '2099-07-12',
      offeredStartTime: '14:00'
    });
    await confirmOffer(tenantA, existing.bookingId, existing.offerId);

    const adjacent = await createAcceptedOffer(pool, tenantA, uniqueId, 'before-adjacent', {
      offeredDate: '2099-07-12',
      offeredStartTime: '13:00'
    });
    const res = await confirmOffer(tenantA, adjacent.bookingId, adjacent.offerId);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.appointment.startTime, '13:00');
    assert.equal(res.body.appointment.endTime, '14:00');
  });

  await t.test('4. Blocks exact same time', async () => {
    const existing = await createAcceptedOffer(pool, tenantA, uniqueId, 'exact-base', {
      offeredDate: '2099-07-13',
      offeredStartTime: '14:00'
    });
    await confirmOffer(tenantA, existing.bookingId, existing.offerId);

    const exact = await createAcceptedOffer(pool, tenantA, uniqueId, 'exact-overlap', {
      offeredDate: '2099-07-13',
      offeredStartTime: '14:00'
    });
    const res = await confirmOffer(tenantA, exact.bookingId, exact.offerId);

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.error.code, 'APPOINTMENT_TIME_CONFLICT');
  });

  await t.test('5. Ignores cancelled appointment', async () => {
    const existing = await createAcceptedOffer(pool, tenantA, uniqueId, 'cancelled-base', {
      offeredDate: '2099-07-14',
      offeredStartTime: '14:00'
    });
    const created = await confirmOffer(tenantA, existing.bookingId, existing.offerId);
    const cancelled = await updateStatus(tenantA, created.body.appointment.id, 'cancelled');
    assert.equal(cancelled.statusCode, 200);

    const proposed = await createAcceptedOffer(pool, tenantA, uniqueId, 'cancelled-overlap', {
      offeredDate: '2099-07-14',
      offeredStartTime: '14:30'
    });
    const res = await confirmOffer(tenantA, proposed.bookingId, proposed.offerId);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.appointment.startTime, '14:30');
  });

  await t.test('6. Ignores completed and no_show appointments', async () => {
    for (const status of ['completed', 'no_show']) {
      const existing = await createAcceptedOffer(pool, tenantA, uniqueId, `${status}-base`, {
        offeredDate: status === 'completed' ? '2099-07-15' : '2099-07-16',
        offeredStartTime: '14:00'
      });
      const created = await confirmOffer(tenantA, existing.bookingId, existing.offerId);
      const updated = await updateStatus(tenantA, created.body.appointment.id, status);
      assert.equal(updated.statusCode, 200);

      const proposed = await createAcceptedOffer(pool, tenantA, uniqueId, `${status}-overlap`, {
        offeredDate: status === 'completed' ? '2099-07-15' : '2099-07-16',
        offeredStartTime: '14:30'
      });
      const res = await confirmOffer(tenantA, proposed.bookingId, proposed.offerId);

      assert.equal(res.statusCode, 201);
      assert.equal(res.body.appointment.startTime, '14:30');
    }
  });

  await t.test('7. Tenant isolation allows same time in another clinic', async () => {
    const existing = await createAcceptedOffer(pool, tenantA, uniqueId, 'tenant-a-base', {
      offeredDate: '2099-07-17',
      offeredStartTime: '14:00'
    });
    await confirmOffer(tenantA, existing.bookingId, existing.offerId);

    const tenantBOffer = await createAcceptedOffer(pool, tenantB, uniqueId, 'tenant-b-overlap', {
      offeredDate: '2099-07-17',
      offeredStartTime: '14:30'
    });
    const res = await confirmOffer(tenantB, tenantBOffer.bookingId, tenantBOffer.offerId);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.appointment.appointmentDate, '2099-07-17');
    assert.equal(res.body.appointment.startTime, '14:30');
  });

  await t.test('8. Same slot offer confirmation remains idempotent', async () => {
    const offer = await createAcceptedOffer(pool, tenantA, uniqueId, 'idempotent', {
      offeredDate: '2099-07-18',
      offeredStartTime: '14:00'
    });

    const first = await confirmOffer(tenantA, offer.bookingId, offer.offerId);
    const second = await confirmOffer(tenantA, offer.bookingId, offer.offerId);

    assert.equal(first.statusCode, 201);
    assert.equal(second.statusCode, 200);
    assert.equal(second.body.success, true);
    assert.equal(second.body.idempotent, true);
    assert.equal(second.body.appointment.id, first.body.appointment.id);

    const count = await pool.query(
      'select count(*)::int as count from clinic_confirmed_appointments where clinic_id = $1 and slot_offer_id = $2',
      [tenantA.clinicId, offer.offerId]
    );
    assert.equal(count.rows[0].count, 1);
  });
});
