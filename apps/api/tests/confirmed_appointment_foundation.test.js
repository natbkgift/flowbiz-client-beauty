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
      { method, headers: {}, socket: { remoteAddress: `127.17.0.${Math.floor(Math.random() * 200) + 1}` } },
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
    [`PR17A Clinic ${suffix} ${uniqueId}`, `pr17a-${suffix}-${uniqueId}`]
  );
  const clinicId = Number(clinic.rows[0].id);
  const organization = await pool.query(
    "insert into organizations (clinic_id, name, slug, status) values ($1, $2, $3, 'active') returning id",
    [clinicId, `PR17A Org ${suffix}`, `pr17a-org-${suffix}-${uniqueId}`]
  );
  const workspace = await pool.query(
    "insert into workspaces (clinic_id, organization_id, name, slug, status) values ($1, $2, $3, $4, 'active') returning id",
    [clinicId, organization.rows[0].id, `PR17A Workspace ${suffix}`, `pr17a-ws-${suffix}-${uniqueId}`]
  );

  return {
    clinicId,
    clinicSlug: `pr17a-${suffix}-${uniqueId}`,
    organizationId: Number(organization.rows[0].id),
    workspaceId: Number(workspace.rows[0].id)
  };
}

async function createUser(pool, uniqueId, role) {
  const result = await pool.query(
    "insert into users (email, name, password_hash, status) values ($1, $2, 'hash', 'active') returning id",
    [`pr17a-${role}-${uniqueId}@flowbiz.local`, `PR17A ${role}`]
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
      `pr17a-lead-${suffix}-${uniqueId}`,
      `PR17A Lead ${suffix}`,
      `0891700${suffix}`,
      `pr17a-lead-${suffix}-${uniqueId}@example.com`,
      `@pr17a-lead-${suffix}`
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
      `PR17A Member ${suffix}`,
      `0891711${suffix}`,
      `pr17a-member-${suffix}-${uniqueId}@example.com`,
      `@pr17a-member-${suffix}`
    ]
  );
  return Number(result.rows[0].id);
}

async function createBooking(pool, tenant, leadId, memberId, suffix, overrides = {}) {
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
        '2099-06-15', 'afternoon', $4, 'soon', $5,
        '{}'::jsonb, 'line', $6, $7, $8, $9, $10, 'new'
      )
      returning id
    `,
    [
      tenant.clinicId,
      leadId,
      memberId,
      overrides.visitType || 'consultation',
      overrides.slotStatus || 'accepted',
      overrides.customerName || `PR17A Customer ${suffix}`,
      overrides.phone || `0891799${suffix}`,
      overrides.email || `pr17a-booking-${suffix}@example.com`,
      overrides.lineId || `@pr17a-booking-${suffix}`,
      overrides.message || `raw PR17A private booking message ${suffix}`
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
      values ($1, $2, $3, $4, $5::date, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
      returning id
    `,
    [
      tenant.clinicId,
      bookingId,
      leadId,
      memberId,
      overrides.offeredDate || '2099-06-20',
      overrides.offeredTimeWindow || 'specific_time',
      Object.prototype.hasOwnProperty.call(overrides, 'offeredStartTime') ? overrides.offeredStartTime : '14:00',
      Object.prototype.hasOwnProperty.call(overrides, 'durationMinutes') ? overrides.durationMinutes : 60,
      overrides.offerStatus || 'accepted',
      Object.prototype.hasOwnProperty.call(overrides, 'customerResponse') ? overrides.customerResponse : 'accepted',
      overrides.offerNote || `raw PR17A offer note ${suffix}`,
      overrides.internalNote || `raw PR17A internal note ${suffix}`,
      JSON.stringify(overrides.metadata || { unsafe: `raw PR17A metadata ${suffix}` })
    ]
  );
  return Number(result.rows[0].id);
}

test('PR17A Confirmed Appointment Foundation', async (t) => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const uniqueId = Date.now() + Math.floor(Math.random() * 1000);
  const userIds = [];
  let tenantA;
  let tenantB;
  let ownerUserId;
  let staffUserId;
  let leadAId;
  let memberAId;
  let bookingAId;
  let offerAId;
  let appointmentAId;
  let bookingBId;
  let offerBId;
  let appointmentBId;

  t.before(async () => {
    tenantA = await createTenant(pool, uniqueId, 'a');
    tenantB = await createTenant(pool, uniqueId, 'b');
    ownerUserId = await createUser(pool, uniqueId, 'owner');
    staffUserId = await createUser(pool, uniqueId, 'staff');
    userIds.push(ownerUserId, staffUserId);

    leadAId = await createLead(pool, tenantA, uniqueId, 'a');
    memberAId = await createMember(pool, tenantA, leadAId, uniqueId, 'a');
    bookingAId = await createBooking(pool, tenantA, leadAId, memberAId, 'a');
    offerAId = await createOffer(pool, tenantA, bookingAId, leadAId, memberAId, 'a');

    const leadBId = await createLead(pool, tenantB, uniqueId, 'b');
    const memberBId = await createMember(pool, tenantB, leadBId, uniqueId, 'b');
    bookingBId = await createBooking(pool, tenantB, leadBId, memberBId, 'b');
    offerBId = await createOffer(pool, tenantB, bookingBId, leadBId, memberBId, 'b');
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
    currentUser: { id: role === 'staff' ? staffUserId : ownerUserId, email: `pr17a-${role}-${uniqueId}@flowbiz.local` },
    currentClinic: { id: tenant.clinicId, slug: tenant.clinicSlug },
    currentOrganization: { id: tenant.organizationId },
    currentWorkspace: { id: tenant.workspaceId },
    currentMembership: { role, permissions: [] }
  });

  await t.test('1. Confirm appointment from accepted slot offer', async () => {
    const res = await routeJson({
      method: 'POST',
      path: `/admin/booking-requests/${bookingAId}/slot-offers/${offerAId}/confirm-appointment`,
      authenticateRequest: contextFor('owner')
    });

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.idempotent, false);
    assert.equal(res.body.appointment.bookingRequestId, bookingAId);
    assert.equal(res.body.appointment.slotOfferId, offerAId);
    assert.equal(res.body.appointment.leadId, leadAId);
    assert.equal(res.body.appointment.memberId, memberAId);
    assert.equal(res.body.appointment.appointmentDate, '2099-06-20');
    assert.equal(res.body.appointment.startTime, '14:00');
    assert.equal(res.body.appointment.endTime, '15:00');
    assert.equal(res.body.appointment.durationMinutes, 60);
    assert.equal(res.body.appointment.status, 'scheduled');
    assert.equal(res.body.appointment.source, 'slot_offer');
    assert.equal(res.body.appointment.timezone, 'Asia/Bangkok');
    appointmentAId = res.body.appointment.id;

    const booking = await pool.query('select status, slot_status from clinic_booking_requests where id = $1', [bookingAId]);
    assert.equal(booking.rows[0].status, 'confirmed');
    assert.equal(booking.rows[0].slot_status, 'accepted');
  });

  await t.test('2. Confirm same slot offer is idempotent', async () => {
    const res = await routeJson({
      method: 'POST',
      path: `/admin/booking-requests/${bookingAId}/slot-offers/${offerAId}/confirm-appointment`,
      authenticateRequest: contextFor('owner')
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.idempotent, true);
    assert.equal(res.body.appointment.id, appointmentAId);

    const count = await pool.query(
      'select count(*)::int as count from clinic_confirmed_appointments where clinic_id = $1 and slot_offer_id = $2',
      [tenantA.clinicId, offerAId]
    );
    assert.equal(count.rows[0].count, 1);
  });

  await t.test('3. Reject non-accepted slot offer', async () => {
    const bookingId = await createBooking(pool, tenantA, leadAId, memberAId, 'sent');
    const offerId = await createOffer(pool, tenantA, bookingId, leadAId, memberAId, 'sent', {
      offerStatus: 'sent',
      customerResponse: null,
      offeredDate: '2099-06-21'
    });

    const res = await routeJson({
      method: 'POST',
      path: `/admin/booking-requests/${bookingId}/slot-offers/${offerId}/confirm-appointment`,
      authenticateRequest: contextFor('owner')
    });

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.error.code, 'APPOINTMENT_SLOT_OFFER_NOT_ACCEPTED');
  });

  await t.test('4. Reject accepted offer without concrete start time', async () => {
    const bookingId = await createBooking(pool, tenantA, leadAId, memberAId, 'missing-time');
    const offerId = await createOffer(pool, tenantA, bookingId, leadAId, memberAId, 'missing-time', {
      offeredDate: '2099-06-22',
      offeredTimeWindow: 'afternoon',
      offeredStartTime: null,
      durationMinutes: 60
    });

    const res = await routeJson({
      method: 'POST',
      path: `/admin/booking-requests/${bookingId}/slot-offers/${offerId}/confirm-appointment`,
      authenticateRequest: contextFor('owner')
    });

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.code, 'APPOINTMENT_START_TIME_REQUIRED');
  });

  await t.test('5. Reject accepted offer without duration', async () => {
    const bookingId = await createBooking(pool, tenantA, leadAId, memberAId, 'missing-duration');
    const offerId = await createOffer(pool, tenantA, bookingId, leadAId, memberAId, 'missing-duration', {
      offeredDate: '2099-06-23',
      durationMinutes: null
    });

    const res = await routeJson({
      method: 'POST',
      path: `/admin/booking-requests/${bookingId}/slot-offers/${offerId}/confirm-appointment`,
      authenticateRequest: contextFor('owner')
    });

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.code, 'APPOINTMENT_DURATION_REQUIRED');
  });

  await t.test('6. Tenant isolation blocks cross-clinic confirmation', async () => {
    const res = await routeJson({
      method: 'POST',
      path: `/admin/booking-requests/${bookingBId}/slot-offers/${offerBId}/confirm-appointment`,
      authenticateRequest: contextFor('owner', tenantA)
    });

    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error.code, 'APPOINTMENT_SLOT_OFFER_NOT_FOUND');

    const count = await pool.query(
      'select count(*)::int as count from clinic_confirmed_appointments where clinic_id = $1 and slot_offer_id = $2',
      [tenantB.clinicId, offerBId]
    );
    assert.equal(count.rows[0].count, 0);
  });

  await t.test('7. List/detail endpoints are tenant scoped and read roles can list', async () => {
    const createdB = await routeJson({
      method: 'POST',
      path: `/admin/booking-requests/${bookingBId}/slot-offers/${offerBId}/confirm-appointment`,
      authenticateRequest: contextFor('owner', tenantB)
    });
    assert.equal(createdB.statusCode, 201);
    appointmentBId = createdB.body.appointment.id;

    const list = await routeJson({
      path: '/admin/confirmed-appointments',
      authenticateRequest: contextFor('staff', tenantA)
    });
    assert.equal(list.statusCode, 200);
    assert.ok(list.body.items.some((item) => item.id === appointmentAId));
    assert.equal(list.body.items.some((item) => item.id === appointmentBId), false);
    assert.doesNotMatch(JSON.stringify(list.body.items), /customerName|phone|email|lineId|raw PR17A private booking message|raw PR17A offer note/);

    const detail = await routeJson({
      path: `/admin/confirmed-appointments/${appointmentAId}`,
      authenticateRequest: contextFor('staff', tenantA)
    });
    assert.equal(detail.statusCode, 200);
    assert.equal(detail.body.id, appointmentAId);
    assert.equal(detail.body.cancellationReasonProvided, false);

    const crossDetail = await routeJson({
      path: `/admin/confirmed-appointments/${appointmentBId}`,
      authenticateRequest: contextFor('staff', tenantA)
    });
    assert.equal(crossDetail.statusCode, 404);
    assert.equal(crossDetail.body.error.code, 'CONFIRMED_APPOINTMENT_NOT_FOUND');
  });

  await t.test('8. Status update cancel writes audit/activity without leaking reason', async () => {
    const res = await routeJson({
      method: 'PATCH',
      path: `/admin/confirmed-appointments/${appointmentAId}/status`,
      authenticateRequest: contextFor('owner'),
      body: { status: 'cancelled', cancellationReason: 'raw private cancellation reason 0891799a' }
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.appointment.status, 'cancelled');
    assert.equal(res.body.appointment.cancelledByUserId, ownerUserId);
    assert.ok(res.body.appointment.cancelledAt);
    assert.equal(res.body.appointment.cancellationReasonProvided, true);
    assert.doesNotMatch(JSON.stringify(res.body.appointment), /raw private cancellation reason/);

    const activity = await pool.query(
      "select event_data_json from lead_activity where clinic_id = $1 and lead_id = $2 and event_type = 'booking_request.appointment_cancelled' order by id desc limit 1",
      [tenantA.clinicId, leadAId]
    );
    assert.equal(activity.rowCount, 1);
    assert.equal(activity.rows[0].event_data_json.summary.cancellationReasonProvided, true);

    const audit = await pool.query(
      "select context_json from audit_logs where clinic_id = $1 and entity_type = 'clinic_confirmed_appointment' and action_type = 'clinic_confirmed_appointment.cancelled' order by id desc limit 1",
      [tenantA.clinicId]
    );
    assert.equal(audit.rowCount, 1);
    const serialized = JSON.stringify([activity.rows[0].event_data_json, audit.rows[0].context_json]);
    assert.doesNotMatch(serialized, /raw private cancellation reason|0891799a|pr17a-booking-a@example.com|raw PR17A private booking message|raw PR17A offer note/);
  });

  await t.test('9. Created audit/activity are summary-only', async () => {
    const activity = await pool.query(
      "select event_data_json from lead_activity where clinic_id = $1 and lead_id = $2 and event_type = 'booking_request.appointment_confirmed' order by id desc limit 1",
      [tenantA.clinicId, leadAId]
    );
    assert.equal(activity.rowCount, 1);
    assert.equal(activity.rows[0].event_data_json.summary.appointmentId, appointmentAId);

    const audit = await pool.query(
      "select context_json from audit_logs where clinic_id = $1 and entity_type = 'clinic_confirmed_appointment' and action_type = 'clinic_confirmed_appointment.created' order by id desc limit 1",
      [tenantA.clinicId]
    );
    assert.equal(audit.rowCount, 1);
    const serialized = JSON.stringify([activity.rows[0].event_data_json, audit.rows[0].context_json]);
    assert.doesNotMatch(serialized, /PR17A Customer a|0891799a|pr17a-booking-a@example.com|@pr17a-booking-a|raw PR17A private booking message|raw PR17A offer note|raw PR17A internal note|raw PR17A metadata/);
  });

  await t.test('10. Confirm appointment does not create notification drafts or delivery attempts', async () => {
    const bookingId = await createBooking(pool, tenantA, leadAId, memberAId, 'no-notification');
    const offerId = await createOffer(pool, tenantA, bookingId, leadAId, memberAId, 'no-notification', {
      offeredDate: '2099-06-24'
    });
    const beforeDrafts = await pool.query('select count(*)::int as count from notification_drafts where clinic_id = $1', [tenantA.clinicId]);
    const beforeAttempts = await pool.query('select count(*)::int as count from notification_delivery_attempts where clinic_id = $1', [tenantA.clinicId]);

    const res = await routeJson({
      method: 'POST',
      path: `/admin/booking-requests/${bookingId}/slot-offers/${offerId}/confirm-appointment`,
      authenticateRequest: contextFor('owner')
    });

    assert.equal(res.statusCode, 201);
    const afterDrafts = await pool.query('select count(*)::int as count from notification_drafts where clinic_id = $1', [tenantA.clinicId]);
    const afterAttempts = await pool.query('select count(*)::int as count from notification_delivery_attempts where clinic_id = $1', [tenantA.clinicId]);
    assert.equal(afterDrafts.rows[0].count, beforeDrafts.rows[0].count);
    assert.equal(afterAttempts.rows[0].count, beforeAttempts.rows[0].count);
  });
});
