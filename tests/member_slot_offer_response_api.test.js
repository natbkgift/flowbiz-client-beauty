'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { loadConfig } = require('../apps/api/src/config');
const { AppError } = require('../apps/api/src/common/errors');
const { json } = require('../apps/api/src/common/http');
const { handleMemberAccessRoutes } = require('../apps/api/src/modules/member-access/routes');
const { hashAccessToken } = require('../apps/api/src/modules/member-access/service');

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
        headers: { 'user-agent': 'member-slot-offer-test-agent' },
        socket: { remoteAddress: remoteAddress || `127.16.1.${Math.floor(Math.random() * 200) + 1}` }
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
    [`Member Slot Offer Clinic ${suffix} ${uniqueId}`, `member-slot-offer-${suffix}-${uniqueId}`]
  );
  const clinicId = Number(clinic.rows[0].id);
  const organization = await pool.query(
    "insert into organizations (clinic_id, name, slug, status) values ($1, $2, $3, 'active') returning id",
    [clinicId, `Member Slot Offer Org ${suffix}`, `member-slot-offer-org-${suffix}-${uniqueId}`]
  );
  const workspace = await pool.query(
    "insert into workspaces (clinic_id, organization_id, name, slug, status) values ($1, $2, $3, $4, 'active') returning id",
    [clinicId, organization.rows[0].id, `Member Slot Offer Workspace ${suffix}`, `member-slot-offer-ws-${suffix}-${uniqueId}`]
  );

  return {
    clinicId,
    clinicSlug: `member-slot-offer-${suffix}-${uniqueId}`,
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
      `member-slot-offer-lead-${suffix}-${uniqueId}`,
      `Member Slot Offer ${suffix}`,
      `0897700${suffix}`,
      `member-slot-offer-${suffix}-${uniqueId}@example.com`,
      `@memberslotoffer-${suffix}`
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
      `Member Slot ${suffix}`,
      `0897711${suffix}`,
      `member-slot-${suffix}-${uniqueId}@example.com`,
      `@memberslot-${suffix}`
    ]
  );
  return Number(result.rows[0].id);
}

async function createBooking(pool, tenant, leadId, memberId, overrides = {}) {
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
        '2099-06-15', 'afternoon', 'consultation', 'soon', $4,
        '{}'::jsonb, 'line', $5, $6, $7, $8, $9, 'new'
      )
      returning id
    `,
    [
      tenant.clinicId,
      leadId,
      memberId,
      overrides.slotStatus || 'offered',
      overrides.customerName || 'Member Slot Customer',
      overrides.phone || '0899999999',
      overrides.email || 'member-slot-customer@example.com',
      overrides.lineId || '@memberslotcustomer',
      overrides.message || 'raw private booking message'
    ]
  );
  return Number(result.rows[0].id);
}

async function createOffer(pool, tenant, bookingId, leadId, memberId, overrides = {}) {
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
        customer_response_note,
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
      overrides.offeredStartTime || '14:00',
      overrides.durationMinutes === undefined ? 60 : overrides.durationMinutes,
      overrides.offerStatus || 'ready_to_send',
      overrides.customerResponseNote || 'raw public-hidden customer response note',
      overrides.offerNote || 'raw public-hidden offer note',
      overrides.internalNote || 'raw public-hidden internal note',
      JSON.stringify(overrides.metadata || { private: 'metadata-hidden' })
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

test('Member Slot Offer Response API - magic-link customer response', async (t) => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const uniqueId = Date.now() + Math.floor(Math.random() * 1000);
  let tenantA;
  let tenantB;
  let leadAId;
  let leadOtherMemberId;
  let memberAId;
  let memberOtherId;
  let memberBId;
  let bookingAId;
  let bookingDeclineId;
  let bookingOtherMemberId;
  let bookingBId;
  let offerAId;
  let declineOfferId;
  let draftOfferId;
  let cancelledOfferId;
  let expiredOfferId;
  let otherMemberOfferId;
  let tokenA;
  let tokenB;

  t.before(async () => {
    tenantA = await createTenant(pool, uniqueId, 'a');
    tenantB = await createTenant(pool, uniqueId, 'b');
    leadAId = await createLead(pool, tenantA, uniqueId, 'a');
    const leadDeclineId = await createLead(pool, tenantA, uniqueId, 'decline');
    leadOtherMemberId = await createLead(pool, tenantA, uniqueId, 'other-member');
    const leadBId = await createLead(pool, tenantB, uniqueId, 'b');

    memberAId = await createMember(pool, tenantA, leadAId, uniqueId, 'a');
    memberOtherId = await createMember(pool, tenantA, leadOtherMemberId, uniqueId, 'other');
    memberBId = await createMember(pool, tenantB, leadBId, uniqueId, 'b');

    bookingAId = await createBooking(pool, tenantA, leadAId, memberAId);
    bookingDeclineId = await createBooking(pool, tenantA, leadDeclineId, memberAId);
    bookingOtherMemberId = await createBooking(pool, tenantA, leadOtherMemberId, memberOtherId);
    bookingBId = await createBooking(pool, tenantB, leadBId, memberBId);

    offerAId = await createOffer(pool, tenantA, bookingAId, leadAId, memberAId);
    declineOfferId = await createOffer(pool, tenantA, bookingDeclineId, leadDeclineId, memberAId, { offeredDate: '2099-06-21', offerStatus: 'sent' });
    draftOfferId = await createOffer(pool, tenantA, bookingAId, leadAId, memberAId, { offeredDate: '2099-06-22', offerStatus: 'draft' });
    cancelledOfferId = await createOffer(pool, tenantA, bookingAId, leadAId, memberAId, { offeredDate: '2099-06-23', offerStatus: 'cancelled' });
    expiredOfferId = await createOffer(pool, tenantA, bookingAId, leadAId, memberAId, { offeredDate: '2099-06-24', offerStatus: 'expired' });
    otherMemberOfferId = await createOffer(pool, tenantA, bookingOtherMemberId, leadOtherMemberId, memberOtherId);
    await createOffer(pool, tenantB, bookingBId, leadBId, memberBId);

    tokenA = await requestToken(tenantA, `member-slot-a-${uniqueId}@example.com`);
    tokenB = await requestToken(tenantB, `member-slot-b-${uniqueId}@example.com`);
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

  await t.test('1. Session response includes public-safe slotOffers', async () => {
    const res = await routeJson({
      path: `/public/clinics/${tenantA.clinicSlug}/member-access/session`,
      searchParams: { token: tokenA }
    });
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.slotOffers.some((offer) => offer.id === offerAId && offer.bookingRequestId === bookingAId));
    const offer = res.body.slotOffers.find((item) => item.id === offerAId);
    assert.equal(offer.offeredDate, '2099-06-20');
    assert.equal(offer.offeredTimeWindow, 'specific_time');
    assert.equal(offer.offeredStartTime, '14:00');
    assert.equal(offer.durationMinutes, 60);
    assert.equal(offer.offerStatus, 'ready_to_send');
    assert.equal(offer.customerResponse, null);
  });

  await t.test('2. Session does not include draft/cancelled/expired offers', async () => {
    const res = await routeJson({
      path: `/public/clinics/${tenantA.clinicSlug}/member-access/session`,
      searchParams: { token: tokenA }
    });
    const ids = res.body.slotOffers.map((offer) => offer.id);
    assert.equal(ids.includes(draftOfferId), false);
    assert.equal(ids.includes(cancelledOfferId), false);
    assert.equal(ids.includes(expiredOfferId), false);
  });

  await t.test('3. Session does not expose internal/admin slot offer fields', async () => {
    const res = await routeJson({
      path: `/public/clinics/${tenantA.clinicSlug}/member-access/session`,
      searchParams: { token: tokenA }
    });
    const serialized = JSON.stringify(res.body.slotOffers);
    assert.doesNotMatch(serialized, /offerNote|offer_note|internalNote|internal_note|customerResponseNote|customer_response_note|metadata|createdByUserId|updatedByUserId|clinicId|leadId|memberId/);
    assert.doesNotMatch(serialized, /raw public-hidden offer note|raw public-hidden internal note|raw public-hidden customer response note|metadata-hidden/);
  });

  await t.test('4. Respond endpoint rejects public tenant/member/lead selectors', async () => {
    for (const override of [
      { clinicId: tenantB.clinicId },
      { clinic_id: tenantB.clinicId },
      { memberId: memberOtherId },
      { member_id: memberOtherId },
      { leadId: leadOtherMemberId },
      { lead_id: leadOtherMemberId }
    ]) {
      const res = await routeJson({
        method: 'POST',
        path: `/public/clinics/${tenantA.clinicSlug}/member-access/slot-offers/${offerAId}/respond`,
        body: { token: tokenA, response: 'accepted', note: '', honeypot: '', ...override }
      });
      assert.equal(res.statusCode, 400);
      assert.equal(res.body.error.code, 'INVALID_SLOT_OFFER_RESPONSE');
    }

    for (const searchParams of [
      { clinicId: tenantB.clinicId },
      { clinic_id: tenantB.clinicId },
      { memberId: memberOtherId },
      { member_id: memberOtherId },
      { leadId: leadOtherMemberId },
      { lead_id: leadOtherMemberId }
    ]) {
      const res = await routeJson({
        method: 'POST',
        path: `/public/clinics/${tenantA.clinicSlug}/member-access/slot-offers/${offerAId}/respond`,
        searchParams,
        body: { token: tokenA, response: 'accepted', note: '', honeypot: '' }
      });
      assert.equal(res.statusCode, 400);
      assert.equal(res.body.error.code, 'INVALID_SLOT_OFFER_RESPONSE');
    }
  });

  await t.test('5. Respond endpoint rejects invalid token', async () => {
    const res = await routeJson({
      method: 'POST',
      path: `/public/clinics/${tenantA.clinicSlug}/member-access/slot-offers/${offerAId}/respond`,
      body: { token: 'bad-token', response: 'accepted', honeypot: '' }
    });
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error.code, 'INVALID_MEMBER_ACCESS_TOKEN');
  });

  await t.test('6. Respond endpoint rejects expired token', async () => {
    const expiredToken = await requestToken(tenantA, `member-slot-a-${uniqueId}@example.com`);
    await pool.query(
      "update clinic_member_access_tokens set expires_at = now() - interval '1 minute' where token_hash = $1",
      [hashAccessToken(expiredToken)]
    );
    const res = await routeJson({
      method: 'POST',
      path: `/public/clinics/${tenantA.clinicSlug}/member-access/slot-offers/${offerAId}/respond`,
      body: { token: expiredToken, response: 'accepted', honeypot: '' }
    });
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error.code, 'MEMBER_ACCESS_TOKEN_EXPIRED');
  });

  await t.test('7. Respond endpoint rejects cross-clinic token', async () => {
    const res = await routeJson({
      method: 'POST',
      path: `/public/clinics/${tenantA.clinicSlug}/member-access/slot-offers/${offerAId}/respond`,
      body: { token: tokenB, response: 'accepted', honeypot: '' }
    });
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error.code, 'INVALID_MEMBER_ACCESS_TOKEN');
  });

  await t.test('8. Respond endpoint rejects offer from another member', async () => {
    const res = await routeJson({
      method: 'POST',
      path: `/public/clinics/${tenantA.clinicSlug}/member-access/slot-offers/${otherMemberOfferId}/respond`,
      body: { token: tokenA, response: 'accepted', honeypot: '' }
    });
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error.code, 'SLOT_OFFER_NOT_FOUND');
  });

  await t.test('9. Accept offer updates offer fields', async () => {
    const res = await routeJson({
      method: 'POST',
      path: `/public/clinics/${tenantA.clinicSlug}/member-access/slot-offers/${offerAId}/respond`,
      body: { token: tokenA, response: 'accepted', note: 'raw customer private note', honeypot: '' }
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.offer.offerStatus, 'accepted');
    assert.equal(res.body.offer.customerResponse, 'accepted');
    assert.ok(res.body.offer.customerRespondedAt);

    const row = await pool.query('select offer_status, customer_response, customer_response_note, customer_responded_at from clinic_booking_slot_offers where id = $1', [offerAId]);
    assert.equal(row.rows[0].offer_status, 'accepted');
    assert.equal(row.rows[0].customer_response, 'accepted');
    assert.equal(row.rows[0].customer_response_note, 'raw customer private note');
    assert.ok(row.rows[0].customer_responded_at);
  });

  await t.test('10. Accept offer updates booking request slot_status accepted', async () => {
    const row = await pool.query('select slot_status from clinic_booking_requests where id = $1', [bookingAId]);
    assert.equal(row.rows[0].slot_status, 'accepted');
  });

  await t.test('11. Decline offer updates offer fields', async () => {
    const res = await routeJson({
      method: 'POST',
      path: `/public/clinics/${tenantA.clinicSlug}/member-access/slot-offers/${declineOfferId}/respond`,
      body: { token: tokenA, response: 'declined', note: 'not available', honeypot: '' }
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.offer.offerStatus, 'declined');
    assert.equal(res.body.offer.customerResponse, 'declined');
    assert.ok(res.body.offer.customerRespondedAt);
  });

  await t.test('12. Decline offer updates booking request slot_status rejected', async () => {
    const row = await pool.query('select slot_status from clinic_booking_requests where id = $1', [bookingDeclineId]);
    assert.equal(row.rows[0].slot_status, 'rejected');
  });

  await t.test('13. Reject invalid response value', async () => {
    const res = await routeJson({
      method: 'POST',
      path: `/public/clinics/${tenantA.clinicSlug}/member-access/slot-offers/${declineOfferId}/respond`,
      body: { token: tokenA, response: 'maybe', honeypot: '' }
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.code, 'INVALID_SLOT_OFFER_RESPONSE');
  });

  await t.test('14. Reject note over 500 characters', async () => {
    const freshOfferId = await createOffer(pool, tenantA, bookingAId, leadAId, memberAId, { offeredDate: '2099-07-10' });
    const res = await routeJson({
      method: 'POST',
      path: `/public/clinics/${tenantA.clinicSlug}/member-access/slot-offers/${freshOfferId}/respond`,
      body: { token: tokenA, response: 'accepted', note: 'x'.repeat(501), honeypot: '' }
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.code, 'INVALID_SLOT_OFFER_RESPONSE');
  });

  await t.test('15. Honeypot safe success creates no mutation', async () => {
    const freshOfferId = await createOffer(pool, tenantA, bookingAId, leadAId, memberAId, { offeredDate: '2099-07-11' });
    const res = await routeJson({
      method: 'POST',
      path: `/public/clinics/${tenantA.clinicSlug}/member-access/slot-offers/${freshOfferId}/respond`,
      body: { token: tokenA, response: 'accepted', honeypot: 'bot-field' }
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    const row = await pool.query('select offer_status, customer_response from clinic_booking_slot_offers where id = $1', [freshOfferId]);
    assert.equal(row.rows[0].offer_status, 'ready_to_send');
    assert.equal(row.rows[0].customer_response, null);
  });

  await t.test('16. Already same response returns idempotent success', async () => {
    const res = await routeJson({
      method: 'POST',
      path: `/public/clinics/${tenantA.clinicSlug}/member-access/slot-offers/${offerAId}/respond`,
      body: { token: tokenA, response: 'accepted', honeypot: '' }
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.offer.customerResponse, 'accepted');
  });

  await t.test('17. Already different response returns 409', async () => {
    const res = await routeJson({
      method: 'POST',
      path: `/public/clinics/${tenantA.clinicSlug}/member-access/slot-offers/${offerAId}/respond`,
      body: { token: tokenA, response: 'declined', honeypot: '' }
    });
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.error.code, 'SLOT_OFFER_ALREADY_RESPONDED');
  });

  await t.test('18. Audit/activity summary excludes raw note/token/PII/internal notes', async () => {
    const activity = await pool.query(
      "select event_data_json from lead_activity where clinic_id = $1 and lead_id = $2 and event_type = 'booking_request.slot_offer_customer_accepted' order by id desc limit 1",
      [tenantA.clinicId, leadAId]
    );
    assert.equal(activity.rowCount, 1);
    assert.equal(activity.rows[0].event_data_json.summary.noteProvided, true);
    assert.equal(activity.rows[0].event_data_json.summary.response, 'accepted');

    const audit = await pool.query(
      "select context_json from audit_logs where clinic_id = $1 and entity_type = 'clinic_booking_slot_offer' and action_type = 'clinic_booking_slot_offer.customer_accepted' order by id desc limit 1",
      [tenantA.clinicId]
    );
    assert.equal(audit.rowCount, 1);
    const serialized = JSON.stringify([activity.rows[0].event_data_json, audit.rows[0].context_json]);
    assert.doesNotMatch(serialized, /raw customer private note|bad-token|raw public-hidden offer note|raw public-hidden internal note|member-slot-customer@example.com|0899999999|@memberslotcustomer/);
  });

  await t.test('19. Public response only returns safe fields', async () => {
    const res = await routeJson({
      method: 'POST',
      path: `/public/clinics/${tenantA.clinicSlug}/member-access/slot-offers/${declineOfferId}/respond`,
      body: { token: tokenA, response: 'declined', honeypot: '' }
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(Object.keys(res.body.offer).sort(), [
      'bookingRequestId',
      'customerRespondedAt',
      'customerResponse',
      'id',
      'offerStatus'
    ]);
    assert.doesNotMatch(JSON.stringify(res.body), /customerResponseNote|customer_response_note|not available/);
  });

  await t.test('20. No confirmed appointment table created or used', async () => {
    const result = await pool.query(
      `
        select table_name
        from information_schema.tables
        where table_schema = 'public'
          and table_name in ('clinic_confirmed_appointments', 'confirmed_appointments')
      `
    );
    assert.equal(result.rowCount, 0);
  });
});
