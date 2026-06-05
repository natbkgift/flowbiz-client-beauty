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

async function routeJson({ method = 'GET', path, body = {}, searchParams = {}, remoteAddress }) {
  const response = createMockResponse();
  const suffix = Object.keys(searchParams).length ? `?${new URLSearchParams(searchParams).toString()}` : '';
  const url = new URL(`http://localhost${path}${suffix}`);

  try {
    await handleMemberAccessRoutes(
      {
        method,
        headers: { 'user-agent': 'member-portal-v1-test-agent' },
        socket: { remoteAddress: remoteAddress || `127.19.1.${Math.floor(Math.random() * 200) + 1}` }
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
    [`PR18A Portal Clinic ${suffix} ${uniqueId}`, `pr18a-portal-${suffix}-${uniqueId}`]
  );
  const clinicId = Number(clinic.rows[0].id);
  const organization = await pool.query(
    "insert into organizations (clinic_id, name, slug, status) values ($1, $2, $3, 'active') returning id",
    [clinicId, `PR18A Portal Org ${suffix}`, `pr18a-portal-org-${suffix}-${uniqueId}`]
  );
  const workspace = await pool.query(
    "insert into workspaces (clinic_id, organization_id, name, slug, status) values ($1, $2, $3, $4, 'active') returning id",
    [clinicId, organization.rows[0].id, `PR18A Portal Workspace ${suffix}`, `pr18a-portal-ws-${suffix}-${uniqueId}`]
  );

  return {
    clinicId,
    clinicSlug: `pr18a-portal-${suffix}-${uniqueId}`,
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
      `pr18a-portal-lead-${suffix}-${uniqueId}`,
      `PR18A Raw Lead ${suffix}`,
      `08918${suffix}`,
      `pr18a-portal-lead-${suffix}-${uniqueId}@example.com`,
      `@pr18a-portal-lead-${suffix}`
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
      values ($1, $2, $3, $4, $5, $6, 'active', 'public_booking_request', $7::jsonb)
      returning id
    `,
    [
      tenant.clinicId,
      leadId,
      `PR18A Member ${suffix}`,
      `08928${suffix}`,
      `pr18a-portal-member-${suffix}-${uniqueId}@example.com`,
      `@pr18a-portal-member-${suffix}`,
      JSON.stringify({ unsafe: `raw PR18A member profile ${suffix}` })
    ]
  );
  return Number(result.rows[0].id);
}

async function createBooking(pool, tenant, leadId, memberId, uniqueId, suffix) {
  const result = await pool.query(
    `
      insert into clinic_booking_requests (
        clinic_id, lead_id, member_id, request_type, interest_type,
        preferred_date, preferred_time_window, visit_type, urgency, slot_status,
        slot_request_json, preferred_contact_method, customer_name, phone,
        email, line_id, message, status, metadata_json
      )
      values (
        $1, $2, $3, 'booking_request', 'service',
        '2099-08-01', 'afternoon', 'consultation', 'soon', 'requested',
        '{}'::jsonb, 'line', $4, $5, $6, $7, $8, 'new', $9::jsonb
      )
      returning id
    `,
    [
      tenant.clinicId,
      leadId,
      memberId,
      `PR18A Raw Booking Customer ${suffix}`,
      `08938${suffix}`,
      `pr18a-portal-booking-${suffix}-${uniqueId}@example.com`,
      `@pr18a-portal-booking-${suffix}`,
      `raw PR18A private booking message ${suffix}`,
      JSON.stringify({ unsafe: `raw PR18A booking metadata ${suffix}` })
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
        customer_response_note,
        offer_note,
        internal_note,
        metadata_json
      )
      values ($1, $2, $3, $4, $5::date, 'specific_time', $6, 60, $7, $8, $9, $10, $11, $12::jsonb)
      returning id
    `,
    [
      tenant.clinicId,
      bookingId,
      leadId,
      memberId,
      overrides.offeredDate || '2099-08-10',
      overrides.offeredStartTime || '14:00',
      overrides.offerStatus || 'sent',
      Object.prototype.hasOwnProperty.call(overrides, 'customerResponse') ? overrides.customerResponse : null,
      `raw PR18A response note ${suffix}`,
      `raw PR18A offer note ${suffix}`,
      `raw PR18A internal note ${suffix}`,
      JSON.stringify({ unsafe: `raw PR18A offer metadata ${suffix}` })
    ]
  );
  return Number(result.rows[0].id);
}

async function createAppointment(pool, tenant, bookingId, offerId, leadId, memberId, suffix, overrides = {}) {
  const result = await pool.query(
    `
      insert into clinic_confirmed_appointments (
        clinic_id,
        booking_request_id,
        slot_offer_id,
        lead_id,
        member_id,
        appointment_date,
        start_time,
        end_time,
        duration_minutes,
        timezone,
        visit_type,
        status,
        source,
        cancellation_reason,
        metadata_json
      )
      values ($1, $2, $3, $4, $5, $6::date, $7, $8, 60, 'Asia/Bangkok', 'consultation', $9, 'slot_offer', $10, $11::jsonb)
      returning id
    `,
    [
      tenant.clinicId,
      bookingId,
      offerId,
      leadId,
      memberId,
      overrides.appointmentDate || '2099-08-10',
      overrides.startTime || '14:00',
      overrides.endTime || '15:00',
      overrides.status || 'scheduled',
      overrides.cancellationReason || null,
      JSON.stringify({ unsafe: `raw PR18A appointment metadata ${suffix}` })
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

test('PR18A Member Portal V1', async (t) => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const uniqueId = Date.now() + Math.floor(Math.random() * 1000);
  let tenantA;
  let tenantB;
  let leadAId;
  let memberAId;
  let tokenA;
  let bookingScheduledId;
  let bookingPendingId;
  let bookingDeclinedId;
  let bookingCompletedId;
  let bookingCancelledId;
  let acceptedOfferId;
  let pendingOfferId;
  let declinedOfferId;
  let scheduledAppointmentId;
  let completedAppointmentId;
  let cancelledAppointmentId;
  let tenantBBookingId;
  let tenantBOfferId;
  let tenantBAppointmentId;
  let otherMemberBookingId;
  let otherMemberOfferId;
  let otherMemberAppointmentId;

  t.before(async () => {
    tenantA = await createTenant(pool, uniqueId, 'a');
    tenantB = await createTenant(pool, uniqueId, 'b');

    leadAId = await createLead(pool, tenantA, uniqueId, 'a');
    memberAId = await createMember(pool, tenantA, leadAId, uniqueId, 'a');

    bookingScheduledId = await createBooking(pool, tenantA, leadAId, memberAId, uniqueId, 'scheduled');
    acceptedOfferId = await createOffer(pool, tenantA, bookingScheduledId, leadAId, memberAId, 'accepted', {
      offerStatus: 'accepted',
      customerResponse: 'accepted',
      offeredDate: '2099-08-10',
      offeredStartTime: '14:00'
    });
    scheduledAppointmentId = await createAppointment(pool, tenantA, bookingScheduledId, acceptedOfferId, leadAId, memberAId, 'scheduled', {
      appointmentDate: '2099-08-10',
      startTime: '14:00',
      endTime: '15:00',
      status: 'scheduled'
    });

    bookingPendingId = await createBooking(pool, tenantA, leadAId, memberAId, uniqueId, 'pending');
    pendingOfferId = await createOffer(pool, tenantA, bookingPendingId, leadAId, memberAId, 'pending', {
      offerStatus: 'sent',
      customerResponse: null,
      offeredDate: '2099-08-11',
      offeredStartTime: '10:00'
    });

    bookingDeclinedId = await createBooking(pool, tenantA, leadAId, memberAId, uniqueId, 'declined');
    declinedOfferId = await createOffer(pool, tenantA, bookingDeclinedId, leadAId, memberAId, 'declined', {
      offerStatus: 'declined',
      customerResponse: 'declined',
      offeredDate: '2099-08-12',
      offeredStartTime: '11:00'
    });

    bookingCompletedId = await createBooking(pool, tenantA, leadAId, memberAId, uniqueId, 'completed');
    completedAppointmentId = await createAppointment(pool, tenantA, bookingCompletedId, null, leadAId, memberAId, 'completed', {
      appointmentDate: '2099-08-01',
      startTime: '09:00',
      endTime: '10:00',
      status: 'completed'
    });

    bookingCancelledId = await createBooking(pool, tenantA, leadAId, memberAId, uniqueId, 'cancelled');
    cancelledAppointmentId = await createAppointment(pool, tenantA, bookingCancelledId, null, leadAId, memberAId, 'cancelled', {
      appointmentDate: '2099-08-02',
      startTime: '16:00',
      endTime: '17:00',
      status: 'cancelled',
      cancellationReason: 'raw PR18A cancellation reason 08938cancelled'
    });

    const otherLeadId = await createLead(pool, tenantA, uniqueId, 'other-member');
    const otherMemberId = await createMember(pool, tenantA, otherLeadId, uniqueId, 'other-member');
    otherMemberBookingId = await createBooking(pool, tenantA, otherLeadId, otherMemberId, uniqueId, 'other-member');
    otherMemberOfferId = await createOffer(pool, tenantA, otherMemberBookingId, otherLeadId, otherMemberId, 'other-member', {
      offerStatus: 'accepted',
      customerResponse: 'accepted',
      offeredDate: '2099-08-13'
    });
    otherMemberAppointmentId = await createAppointment(pool, tenantA, otherMemberBookingId, otherMemberOfferId, otherLeadId, otherMemberId, 'other-member', {
      appointmentDate: '2099-08-13',
      status: 'scheduled'
    });

    const leadBId = await createLead(pool, tenantB, uniqueId, 'b');
    const memberBId = await createMember(pool, tenantB, leadBId, uniqueId, 'b');
    tenantBBookingId = await createBooking(pool, tenantB, leadBId, memberBId, uniqueId, 'b');
    tenantBOfferId = await createOffer(pool, tenantB, tenantBBookingId, leadBId, memberBId, 'b', {
      offerStatus: 'accepted',
      customerResponse: 'accepted',
      offeredDate: '2099-08-14'
    });
    tenantBAppointmentId = await createAppointment(pool, tenantB, tenantBBookingId, tenantBOfferId, leadBId, memberBId, 'b', {
      appointmentDate: '2099-08-14',
      status: 'scheduled'
    });

    tokenA = await requestToken(tenantA, `pr18a-portal-member-a-${uniqueId}@example.com`);
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

  await t.test('1. Portal session includes confirmed appointments and backward-compatible top-level fields', async () => {
    const res = await routeJson({
      path: `/public/clinics/${tenantA.clinicSlug}/member-access/session`,
      searchParams: { token: tokenA }
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.member);
    assert.ok(Array.isArray(res.body.bookingRequests));
    assert.ok(Array.isArray(res.body.slotOffers));
    assert.ok(Array.isArray(res.body.confirmedAppointments));
    assert.ok(res.body.portal);
    assert.deepEqual(res.body.portal.profile, res.body.member);
    assert.deepEqual(res.body.portal.bookingRequests, res.body.bookingRequests);
    assert.deepEqual(res.body.portal.slotOffers, res.body.slotOffers);
    assert.deepEqual(res.body.portal.confirmedAppointments, res.body.confirmedAppointments);

    const appointment = res.body.portal.confirmedAppointments.find((item) => item.id === scheduledAppointmentId);
    assert.ok(appointment);
    assert.deepEqual(Object.keys(appointment).sort(), [
      'appointmentDate',
      'bookingRequestId',
      'createdAt',
      'durationMinutes',
      'endTime',
      'id',
      'slotOfferId',
      'source',
      'startTime',
      'status',
      'timezone',
      'updatedAt',
      'visitType'
    ]);
    assert.equal(appointment.bookingRequestId, bookingScheduledId);
    assert.equal(appointment.slotOfferId, acceptedOfferId);
    assert.equal(appointment.appointmentDate, '2099-08-10');
    assert.equal(appointment.startTime, '14:00');
    assert.equal(appointment.endTime, '15:00');
    assert.equal(appointment.durationMinutes, 60);
    assert.equal(appointment.timezone, 'Asia/Bangkok');
    assert.equal(appointment.visitType, 'consultation');
    assert.equal(appointment.status, 'scheduled');
    assert.equal(appointment.source, 'slot_offer');
  });

  await t.test('2. Portal summary counts are correct', async () => {
    const res = await routeJson({
      path: `/public/clinics/${tenantA.clinicSlug}/member-access/session`,
      searchParams: { token: tokenA }
    });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.portal.summary, {
      bookingRequestCount: 5,
      pendingSlotOfferCount: 1,
      acceptedSlotOfferCount: 1,
      declinedSlotOfferCount: 1,
      scheduledAppointmentCount: 1,
      completedAppointmentCount: 1,
      cancelledAppointmentCount: 1,
      nextScheduledAppointment: res.body.portal.confirmedAppointments.find((item) => item.id === scheduledAppointmentId)
    });
    assert.equal(res.body.portal.summary.nextScheduledAppointment.id, scheduledAppointmentId);
  });

  await t.test('3. Tenant and member isolation exclude other portal rows', async () => {
    const res = await routeJson({
      path: `/public/clinics/${tenantA.clinicSlug}/member-access/session`,
      searchParams: { token: tokenA }
    });

    const bookingIds = res.body.portal.bookingRequests.map((item) => item.id);
    const offerIds = res.body.portal.slotOffers.map((item) => item.id);
    const appointmentIds = res.body.portal.confirmedAppointments.map((item) => item.id);

    assert.ok(bookingIds.includes(bookingScheduledId));
    assert.ok(bookingIds.includes(bookingPendingId));
    assert.ok(bookingIds.includes(bookingDeclinedId));
    assert.ok(bookingIds.includes(bookingCompletedId));
    assert.ok(bookingIds.includes(bookingCancelledId));
    assert.equal(bookingIds.includes(tenantBBookingId), false);
    assert.equal(bookingIds.includes(otherMemberBookingId), false);

    assert.ok(offerIds.includes(acceptedOfferId));
    assert.ok(offerIds.includes(pendingOfferId));
    assert.ok(offerIds.includes(declinedOfferId));
    assert.equal(offerIds.includes(tenantBOfferId), false);
    assert.equal(offerIds.includes(otherMemberOfferId), false);

    assert.ok(appointmentIds.includes(scheduledAppointmentId));
    assert.ok(appointmentIds.includes(completedAppointmentId));
    assert.ok(appointmentIds.includes(cancelledAppointmentId));
    assert.equal(appointmentIds.includes(tenantBAppointmentId), false);
    assert.equal(appointmentIds.includes(otherMemberAppointmentId), false);
  });

  await t.test('4. Token security preserves existing invalid, expired, and revoked behavior', async () => {
    const invalid = await routeJson({
      path: `/public/clinics/${tenantA.clinicSlug}/member-access/session`,
      searchParams: { token: 'not-a-real-member-token' }
    });
    assert.equal(invalid.statusCode, 404);
    assert.equal(invalid.body.error.code, 'INVALID_MEMBER_ACCESS_TOKEN');

    const expiredToken = await requestToken(tenantA, `pr18a-portal-member-a-${uniqueId}@example.com`);
    await pool.query(
      "update clinic_member_access_tokens set expires_at = now() - interval '1 minute' where token_hash = $1",
      [hashAccessToken(expiredToken)]
    );
    const expired = await routeJson({
      path: `/public/clinics/${tenantA.clinicSlug}/member-access/session`,
      searchParams: { token: expiredToken }
    });
    assert.equal(expired.statusCode, 401);
    assert.equal(expired.body.error.code, 'MEMBER_ACCESS_TOKEN_EXPIRED');

    const revokedToken = await requestToken(tenantA, `pr18a-portal-member-a-${uniqueId}@example.com`);
    await pool.query(
      'update clinic_member_access_tokens set revoked_at = now() where token_hash = $1',
      [hashAccessToken(revokedToken)]
    );
    const revoked = await routeJson({
      path: `/public/clinics/${tenantA.clinicSlug}/member-access/session`,
      searchParams: { token: revokedToken }
    });
    assert.equal(revoked.statusCode, 404);
    assert.equal(revoked.body.error.code, 'INVALID_MEMBER_ACCESS_TOKEN');
  });

  await t.test('5. Portal response is PII-safe', async () => {
    const res = await routeJson({
      path: `/public/clinics/${tenantA.clinicSlug}/member-access/session`,
      searchParams: { token: tokenA }
    });
    const serialized = JSON.stringify(res.body);

    for (const needle of [
      `pr18a-portal-member-a-${uniqueId}@example.com`,
      '08928a',
      '@pr18a-portal-member-a',
      `pr18a-portal-booking-scheduled-${uniqueId}@example.com`,
      '08938scheduled',
      '@pr18a-portal-booking-scheduled',
      'raw PR18A private booking message scheduled',
      'raw PR18A offer note accepted',
      'raw PR18A internal note accepted',
      'raw PR18A response note accepted',
      'raw PR18A cancellation reason',
      'raw PR18A member profile a',
      'raw PR18A booking metadata scheduled',
      'raw PR18A offer metadata accepted',
      'raw PR18A appointment metadata scheduled',
      'leadId',
      'memberId',
      'clinicId',
      'metadata',
      'cancellationReason'
    ]) {
      assert.equal(serialized.includes(needle), false, `portal response leaked ${needle}`);
    }

    assert.ok(res.body.member.contact.emailMasked);
    assert.ok(res.body.member.contact.phoneMasked);
    assert.ok(res.body.member.contact.lineIdMasked);
  });

  await t.test('6. Member portal route alias returns the same portal payload', async () => {
    const res = await routeJson({
      path: `/public/clinics/${tenantA.clinicSlug}/member-portal/session`,
      searchParams: { token: tokenA }
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.portal);
    assert.ok(res.body.portal.confirmedAppointments.some((item) => item.id === scheduledAppointmentId));
    assert.equal(res.body.portal.summary.scheduledAppointmentCount, 1);
    assert.equal(res.body.portal.summary.pendingSlotOfferCount, 1);
    assert.equal(res.body.bookingRequests.length, 5);
    assert.equal(res.body.slotOffers.length, 3);
    assert.equal(res.body.confirmedAppointments.length, 3);
  });

  await t.test('7. Next scheduled appointment uses robust time parsing and is not limited by recent appointment list', async () => {
    await pool.query(
      "update clinic_confirmed_appointments set start_time = '14:00:00', end_time = '15:00:00' where id = $1",
      [scheduledAppointmentId]
    );

    for (let day = 1; day <= 25; day += 1) {
      await createAppointment(pool, tenantA, null, null, leadAId, memberAId, `next-limit-${day}`, {
        appointmentDate: `2099-09-${String(day).padStart(2, '0')}`,
        startTime: '10:00',
        endTime: '11:00',
        status: 'scheduled'
      });
    }

    const res = await routeJson({
      path: `/public/clinics/${tenantA.clinicSlug}/member-access/session`,
      searchParams: { token: tokenA }
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.portal.confirmedAppointments.length, 20);
    assert.equal(res.body.portal.confirmedAppointments.some((item) => item.id === scheduledAppointmentId), false);
    assert.equal(res.body.portal.summary.nextScheduledAppointment.id, scheduledAppointmentId);
    assert.equal(res.body.portal.summary.nextScheduledAppointment.startTime, '14:00:00');
  });
});
