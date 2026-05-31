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

async function routeJson(handler, { method = 'POST', path, body = {} }) {
  const response = createMockResponse();
  const url = new URL(`http://localhost${path}`);

  try {
    await handler(
      { method, headers: {}, socket: { remoteAddress: `127.1.0.${Math.floor(Math.random() * 200) + 1}` } },
      response,
      url,
      {
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

test('Public Booking Request API - Integration Tests', async (t) => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const uniqueId = Date.now() + Math.floor(Math.random() * 1000);

  const activeSlug = `public-booking-a-${uniqueId}`;
  const inactiveSlug = `public-booking-inactive-${uniqueId}`;
  const clinicBSlug = `public-booking-b-${uniqueId}`;

  let clinicAId;
  let clinicBId;
  let inactiveClinicId;
  let serviceId;
  let draftServiceId;
  let clinicBServiceId;
  let promotionId;
  let packageId;

  const validPayload = (overrides = {}) => ({
    name: 'Jane Doe',
    phone: '0899999999',
    email: 'jane@example.com',
    lineId: '@jane',
    requestType: 'booking_request',
    interestType: 'general',
    preferredDate: '2099-06-15',
    preferredTimeWindow: 'afternoon',
    preferredContactMethod: 'line',
    message: 'อยากปรึกษาก่อนทำ',
    consentAccepted: true,
    honeypot: '',
    ...overrides
  });

  t.before(async () => {
    const clinicA = await pool.query(
      "insert into clinics (name, slug, plan, status) values ($1, $2, 'starter', 'active') returning id",
      [`Public Booking Clinic A ${uniqueId}`, activeSlug]
    );
    clinicAId = Number(clinicA.rows[0].id);

    const clinicB = await pool.query(
      "insert into clinics (name, slug, plan, status) values ($1, $2, 'starter', 'active') returning id",
      [`Public Booking Clinic B ${uniqueId}`, clinicBSlug]
    );
    clinicBId = Number(clinicB.rows[0].id);

    const inactiveClinic = await pool.query(
      "insert into clinics (name, slug, plan, status) values ($1, $2, 'starter', 'inactive') returning id",
      [`Public Booking Inactive ${uniqueId}`, inactiveSlug]
    );
    inactiveClinicId = Number(inactiveClinic.rows[0].id);

    const service = await pool.query(
      `insert into clinic_services (clinic_id, service_key, name, slug, status)
       values ($1, $2, 'Botox Lift', $3, 'active') returning id`,
      [clinicAId, `booking-svc-${uniqueId}`, `booking-svc-${uniqueId}`]
    );
    serviceId = Number(service.rows[0].id);

    const draftService = await pool.query(
      `insert into clinic_services (clinic_id, service_key, name, slug, status)
       values ($1, $2, 'Draft Service', $3, 'draft') returning id`,
      [clinicAId, `booking-draft-svc-${uniqueId}`, `booking-draft-svc-${uniqueId}`]
    );
    draftServiceId = Number(draftService.rows[0].id);

    const clinicBService = await pool.query(
      `insert into clinic_services (clinic_id, service_key, name, slug, status)
       values ($1, $2, 'Other Clinic Service', $3, 'active') returning id`,
      [clinicBId, `booking-svc-b-${uniqueId}`, `booking-svc-b-${uniqueId}`]
    );
    clinicBServiceId = Number(clinicBService.rows[0].id);

    const promo = await pool.query(
      `insert into clinic_promotions (clinic_id, promotion_key, title, slug, status)
       values ($1, $2, 'Summer Glow', $3, 'active') returning id`,
      [clinicAId, `booking-promo-${uniqueId}`, `booking-promo-${uniqueId}`]
    );
    promotionId = Number(promo.rows[0].id);

    const pkg = await pool.query(
      `insert into clinic_packages (clinic_id, package_key, name, slug, status)
       values ($1, $2, 'Glow Course', $3, 'active') returning id`,
      [clinicAId, `booking-pkg-${uniqueId}`, `booking-pkg-${uniqueId}`]
    );
    packageId = Number(pkg.rows[0].id);
  });

  t.after(async () => {
    try {
      if (clinicAId) {
        await pool.query('delete from clinics where id = any($1::bigint[])', [[clinicAId, clinicBId, inactiveClinicId]]);
      }
    } finally {
      await pool.end();
    }
  });

  await t.test('1. Unknown clinic slug returns 404', async () => {
    const res = await routeJson(handleBookingRequestRoutes, {
      path: '/public/clinics/no-such-public-booking/booking-requests',
      body: validPayload()
    });
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error.code, 'CLINIC_NOT_FOUND');
  });

  await t.test('2. Inactive clinic returns 404', async () => {
    const res = await routeJson(handleBookingRequestRoutes, {
      path: `/public/clinics/${inactiveSlug}/booking-requests`,
      body: validPayload()
    });
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error.code, 'CLINIC_NOT_FOUND');
  });

  await t.test('3. Reject payload with clinicId or clinic_id', async () => {
    const camel = await routeJson(handleBookingRequestRoutes, {
      path: `/public/clinics/${activeSlug}/booking-requests`,
      body: validPayload({ clinicId: clinicBId })
    });
    assert.equal(camel.statusCode, 400);
    assert.equal(camel.body.error.code, 'INVALID_BOOKING_REQUEST_PAYLOAD');

    const snake = await routeJson(handleBookingRequestRoutes, {
      path: `/public/clinics/${activeSlug}/booking-requests`,
      body: validPayload({ clinic_id: clinicBId })
    });
    assert.equal(snake.statusCode, 400);
    assert.equal(snake.body.error.code, 'INVALID_BOOKING_REQUEST_PAYLOAD');
  });

  await t.test('4. Reject missing consent', async () => {
    const res = await routeJson(handleBookingRequestRoutes, {
      path: `/public/clinics/${activeSlug}/booking-requests`,
      body: validPayload({ consentAccepted: false })
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.code, 'BOOKING_CONSENT_REQUIRED');
  });

  await t.test('5. Reject missing contact method', async () => {
    const res = await routeJson(handleBookingRequestRoutes, {
      path: `/public/clinics/${activeSlug}/booking-requests`,
      body: validPayload({ phone: '', email: '', lineId: '' })
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.code, 'BOOKING_CONTACT_REQUIRED');
  });

  await t.test('6. Reject invalid email', async () => {
    const res = await routeJson(handleBookingRequestRoutes, {
      path: `/public/clinics/${activeSlug}/booking-requests`,
      body: validPayload({ email: 'bad-email' })
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.code, 'INVALID_BOOKING_EMAIL');
  });

  await t.test('7. Honeypot filled returns safe success and creates no booking request', async () => {
    const before = await pool.query('select count(*)::int as count from clinic_booking_requests where clinic_id = $1', [clinicAId]);
    const res = await routeJson(handleBookingRequestRoutes, {
      path: `/public/clinics/${activeSlug}/booking-requests`,
      body: validPayload({ honeypot: 'bot-value' })
    });
    const after = await pool.query('select count(*)::int as count from clinic_booking_requests where clinic_id = $1', [clinicAId]);

    assert.equal(res.statusCode, 202);
    assert.equal(res.body.success, true);
    assert.equal(after.rows[0].count, before.rows[0].count);
  });

  await t.test('8. Create general booking request under resolved clinic and linked CRM lead', async () => {
    const res = await routeJson(handleBookingRequestRoutes, {
      path: `/public/clinics/${activeSlug}/booking-requests`,
      body: validPayload({ email: '', lineId: '', interestType: 'general', interestId: undefined })
    });
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.success, true);
    assert.ok(res.body.bookingRequestId);
    assert.ok(res.body.leadId);

    const booking = await pool.query(
      'select clinic_id, lead_id, status, request_type, interest_type, preferred_time_window, preferred_contact_method from clinic_booking_requests where id = $1',
      [res.body.bookingRequestId]
    );
    assert.equal(Number(booking.rows[0].clinic_id), clinicAId);
    assert.equal(Number(booking.rows[0].lead_id), Number(res.body.leadId));
    assert.equal(booking.rows[0].status, 'new');
    assert.equal(booking.rows[0].request_type, 'booking_request');
    assert.equal(booking.rows[0].interest_type, 'general');
    assert.equal(booking.rows[0].preferred_time_window, 'afternoon');
    assert.equal(booking.rows[0].preferred_contact_method, 'line');

    const lead = await pool.query('select clinic_id, source, phone from leads where id = $1', [res.body.leadId]);
    assert.equal(Number(lead.rows[0].clinic_id), clinicAId);
    assert.equal(lead.rows[0].source, 'website');
    assert.equal(lead.rows[0].phone, '0899999999');
  });

  await t.test('9. Service, promotion, and package interest must be active same-clinic items', async () => {
    for (const [interestType, interestId] of [
      ['service', serviceId],
      ['promotion', promotionId],
      ['package', packageId]
    ]) {
      const res = await routeJson(handleBookingRequestRoutes, {
        path: `/public/clinics/${activeSlug}/booking-requests`,
        body: validPayload({ interestType, interestId })
      });
      assert.equal(res.statusCode, 201);

      const booking = await pool.query(
        'select interest_type, interest_id from clinic_booking_requests where id = $1',
        [res.body.bookingRequestId]
      );
      assert.equal(booking.rows[0].interest_type, interestType);
      assert.equal(Number(booking.rows[0].interest_id), Number(interestId));
    }
  });

  await t.test('10. Reject cross-tenant interest', async () => {
    const res = await routeJson(handleBookingRequestRoutes, {
      path: `/public/clinics/${activeSlug}/booking-requests`,
      body: validPayload({ interestType: 'service', interestId: clinicBServiceId })
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.code, 'INVALID_BOOKING_INTEREST');
  });

  await t.test('11. Reject inactive or draft interest', async () => {
    const res = await routeJson(handleBookingRequestRoutes, {
      path: `/public/clinics/${activeSlug}/booking-requests`,
      body: validPayload({ interestType: 'service', interestId: draftServiceId })
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.code, 'INVALID_BOOKING_INTEREST');
  });

  await t.test('12. Reject invalid preferred date', async () => {
    const invalid = await routeJson(handleBookingRequestRoutes, {
      path: `/public/clinics/${activeSlug}/booking-requests`,
      body: validPayload({ preferredDate: '2026-02-31' })
    });
    assert.equal(invalid.statusCode, 400);
    assert.equal(invalid.body.error.code, 'INVALID_BOOKING_DATE');

    const past = await routeJson(handleBookingRequestRoutes, {
      path: `/public/clinics/${activeSlug}/booking-requests`,
      body: validPayload({ preferredDate: '2000-01-01' })
    });
    assert.equal(past.statusCode, 400);
    assert.equal(past.body.error.code, 'INVALID_BOOKING_DATE');
  });

  await t.test('13. Reject invalid time window and contact method', async () => {
    const time = await routeJson(handleBookingRequestRoutes, {
      path: `/public/clinics/${activeSlug}/booking-requests`,
      body: validPayload({ preferredTimeWindow: 'midnight' })
    });
    assert.equal(time.statusCode, 400);
    assert.equal(time.body.error.code, 'INVALID_BOOKING_TIME_WINDOW');

    const contact = await routeJson(handleBookingRequestRoutes, {
      path: `/public/clinics/${activeSlug}/booking-requests`,
      body: validPayload({ preferredContactMethod: 'sms' })
    });
    assert.equal(contact.statusCode, 400);
    assert.equal(contact.body.error.code, 'INVALID_BOOKING_CONTACT_METHOD');
  });

  await t.test('14. Audit/activity summary contains no raw PII or message', async () => {
    const res = await routeJson(handleBookingRequestRoutes, {
      path: `/public/clinics/${activeSlug}/booking-requests`,
      body: validPayload({
        phone: '0811111111',
        email: 'private-booking@example.com',
        lineId: '@privatebooking',
        message: 'raw private booking message'
      })
    });
    assert.equal(res.statusCode, 201);

    const audit = await pool.query(
      "select context_json from audit_logs where clinic_id = $1 and entity_type = 'clinic_booking_request' and entity_id = $2 and action_type = 'clinic_booking_request.created' limit 1",
      [clinicAId, res.body.bookingRequestId]
    );
    assert.equal(audit.rowCount, 1);
    const serializedAudit = JSON.stringify(audit.rows[0].context_json);
    assert.match(serializedAudit, /public_booking_request/);
    assert.doesNotMatch(serializedAudit, /0811111111/);
    assert.doesNotMatch(serializedAudit, /private-booking@example\.com/);
    assert.doesNotMatch(serializedAudit, /@privatebooking/);
    assert.doesNotMatch(serializedAudit, /raw private booking message/);

    const activity = await pool.query(
      "select event_data_json from lead_activity where clinic_id = $1 and lead_id = $2 and event_type = 'booking_request.created' limit 1",
      [clinicAId, res.body.leadId]
    );
    assert.equal(activity.rowCount, 1);
    const serializedActivity = JSON.stringify(activity.rows[0].event_data_json);
    assert.doesNotMatch(serializedActivity, /0811111111/);
    assert.doesNotMatch(serializedActivity, /private-booking@example\.com/);
    assert.doesNotMatch(serializedActivity, /raw private booking message/);
  });
});
