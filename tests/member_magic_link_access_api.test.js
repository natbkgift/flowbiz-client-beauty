'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { loadConfig } = require('../apps/api/src/config');
const { AppError } = require('../apps/api/src/common/errors');
const { json } = require('../apps/api/src/common/http');
const { handleMemberAccessRoutes } = require('../apps/api/src/modules/member-access/routes');

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
        headers: { 'user-agent': 'member-access-test-agent' },
        socket: { remoteAddress: remoteAddress || `127.13.1.${Math.floor(Math.random() * 200) + 1}` }
      },
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

async function createTenant(pool, uniqueId, suffix, status = 'active') {
  const clinic = await pool.query(
    "insert into clinics (name, slug, plan, status) values ($1, $2, 'starter', $3) returning id",
    [`Magic Clinic ${suffix} ${uniqueId}`, `magic-clinic-${suffix}-${uniqueId}`, status]
  );
  return {
    clinicId: Number(clinic.rows[0].id),
    clinicSlug: `magic-clinic-${suffix}-${uniqueId}`
  };
}

async function createMember(pool, tenant, overrides = {}) {
  const result = await pool.query(
    `
      insert into clinic_members (
        clinic_id,
        display_name,
        phone,
        email,
        line_id,
        status,
        source,
        profile_json
      )
      values ($1, $2, $3, $4, $5, $6, 'manual', $7::jsonb)
      returning id
    `,
    [
      tenant.clinicId,
      overrides.displayName || 'Jane Doe',
      overrides.phone || '0899991199',
      overrides.email || 'jane.magic@example.com',
      overrides.lineId || '@janemagic',
      overrides.status || 'active',
      JSON.stringify({ internalSegment: 'vip-private' })
    ]
  );
  return Number(result.rows[0].id);
}

async function createBooking(pool, tenant, memberId, overrides = {}) {
  const result = await pool.query(
    `
      insert into clinic_booking_requests (
        clinic_id,
        member_id,
        request_type,
        interest_type,
        preferred_date,
        preferred_time_window,
        phone,
        email,
        line_id,
        message,
        status
      )
      values ($1, $2, 'booking_request', 'service', '2099-06-15', 'afternoon', $3, $4, $5, $6, $7)
      returning id
    `,
    [
      tenant.clinicId,
      memberId,
      overrides.phone || '0899991199',
      overrides.email || 'jane.magic@example.com',
      overrides.lineId || '@janemagic',
      'private booking note',
      overrides.status || 'contacted'
    ]
  );
  return Number(result.rows[0].id);
}

async function requestToken(pool, tenant, body) {
  const res = await routeJson({
    method: 'POST',
    path: `/public/clinics/${tenant.clinicSlug}/member-access/request`,
    body
  });
  const tokenRow = await pool.query(
    'select * from clinic_member_access_tokens where clinic_id = $1 order by id desc limit 1',
    [tenant.clinicId]
  );
  return { res, tokenRow: tokenRow.rows[0] || null };
}

test('Member Magic Link Access API - route is public and not handled by admin member routes', async () => {
  const res = await routeJson({
    method: 'POST',
    path: '/public/clinics/unknown-magic/member-access/request',
    body: { contact: 'unknown@example.com', channel: 'email', honeypot: '' }
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
});

test('Member Magic Link Access API - validates overlong fields instead of truncating', async () => {
  const requestRes = await routeJson({
    method: 'POST',
    path: '/public/clinics/unknown-magic/member-access/request',
    body: { contact: `${'a'.repeat(170)}@example.com`, channel: 'email', honeypot: '' }
  });

  assert.equal(requestRes.statusCode, 400);
  assert.equal(requestRes.body.error.code, 'INVALID_MEMBER_ACCESS_PAYLOAD');

  const sessionRes = await routeJson({
    method: 'GET',
    path: '/public/clinics/unknown-magic/member-access/session',
    searchParams: { token: 'x'.repeat(301) }
  });

  assert.equal(sessionRes.statusCode, 400);
  assert.equal(sessionRes.body.error.code, 'INVALID_MEMBER_ACCESS_TOKEN');
});

test('Member Magic Link Access API - session endpoint rate limits before token verification', async () => {
  let lastResponse = null;
  for (let i = 0; i < 61; i += 1) {
    lastResponse = await routeJson({
      method: 'GET',
      path: '/public/clinics/unknown-magic/member-access/session',
      searchParams: { token: 'invalid-token', clinic_id: '1' },
      remoteAddress: '127.13.1.251'
    });
  }

  assert.equal(lastResponse.statusCode, 429);
  assert.equal(lastResponse.body.error.code, 'RATE_LIMIT_EXCEEDED');
});

test('Member Magic Link Access API - public booking serializer formats Date preferred_date', () => {
  const { mapPublicBookingRequest } = require('../apps/api/src/modules/member-access/service');
  const booking = mapPublicBookingRequest({
    id: 1,
    status: 'contacted',
    request_type: 'booking_request',
    interest_type: 'service',
    preferred_date: new Date('2099-06-15T00:00:00.000Z'),
    preferred_time_window: 'afternoon',
    created_at: '2099-06-01T00:00:00.000Z'
  });

  assert.equal(booking.preferredDate, '2099-06-15');
});

test('Member Magic Link Access API - Integration Tests', async (t) => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const uniqueId = Date.now() + Math.floor(Math.random() * 1000);
  let tenantA;
  let tenantB;
  let inactiveTenant;
  let memberId;
  let bookingId;
  let emailToken;
  let phoneToken;
  let lineToken;

  t.before(async () => {
    tenantA = await createTenant(pool, uniqueId, 'a');
    tenantB = await createTenant(pool, uniqueId, 'b');
    inactiveTenant = await createTenant(pool, uniqueId, 'inactive', 'inactive');
    memberId = await createMember(pool, tenantA);
    await createMember(pool, tenantB, { email: 'jane.magic@example.com', phone: '0877777777', lineId: '@janeb' });
    bookingId = await createBooking(pool, tenantA, memberId);
  });

  t.after(async () => {
    try {
      if (tenantA?.clinicId && tenantB?.clinicId && inactiveTenant?.clinicId) {
        await pool.query('delete from clinics where id = any($1::bigint[])', [[tenantA.clinicId, tenantB.clinicId, inactiveTenant.clinicId]]);
      }
    } finally {
      await pool.end();
    }
  });

  await t.test('1. Unknown clinic returns generic success and creates no token', async () => {
    const res = await routeJson({
      method: 'POST',
      path: `/public/clinics/no-such-${uniqueId}/member-access/request`,
      body: { contact: 'jane.magic@example.com', channel: 'email', honeypot: '' }
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);

    const tokens = await pool.query('select count(*)::int as count from clinic_member_access_tokens where clinic_id = $1', [tenantA.clinicId]);
    assert.equal(tokens.rows[0].count, 0);
  });

  await t.test('2. Inactive clinic cannot issue token', async () => {
    const inactiveMemberId = await createMember(pool, inactiveTenant, { email: `inactive-${uniqueId}@example.com` });
    const res = await routeJson({
      method: 'POST',
      path: `/public/clinics/${inactiveTenant.clinicSlug}/member-access/request`,
      body: { contact: `inactive-${uniqueId}@example.com`, channel: 'email', honeypot: '' }
    });
    assert.equal(res.statusCode, 200);

    const tokens = await pool.query('select count(*)::int as count from clinic_member_access_tokens where member_id = $1', [inactiveMemberId]);
    assert.equal(tokens.rows[0].count, 0);
  });

  await t.test('3. Reject clinicId and clinic_id override', async () => {
    const clinicIdRes = await routeJson({
      method: 'POST',
      path: `/public/clinics/${tenantA.clinicSlug}/member-access/request`,
      body: { contact: 'jane.magic@example.com', channel: 'email', clinicId: tenantB.clinicId, honeypot: '' }
    });
    assert.equal(clinicIdRes.statusCode, 400);
    assert.equal(clinicIdRes.body.error.code, 'INVALID_MEMBER_ACCESS_PAYLOAD');

    const clinicSnakeRes = await routeJson({
      method: 'GET',
      path: `/public/clinics/${tenantA.clinicSlug}/member-access/session`,
      searchParams: { token: 'anything', clinic_id: tenantB.clinicId }
    });
    assert.equal(clinicSnakeRes.statusCode, 400);
    assert.equal(clinicSnakeRes.body.error.code, 'INVALID_MEMBER_ACCESS_PAYLOAD');
  });

  await t.test('4. Honeypot returns safe success and creates no token', async () => {
    const before = await pool.query('select count(*)::int as count from clinic_member_access_tokens where clinic_id = $1', [tenantA.clinicId]);
    const res = await routeJson({
      method: 'POST',
      path: `/public/clinics/${tenantA.clinicSlug}/member-access/request`,
      body: { contact: 'jane.magic@example.com', channel: 'email', honeypot: 'bot-field' }
    });
    assert.equal(res.statusCode, 200);
    const after = await pool.query('select count(*)::int as count from clinic_member_access_tokens where clinic_id = $1', [tenantA.clinicId]);
    assert.equal(after.rows[0].count, before.rows[0].count);
  });

  await t.test('5. Existing member by email creates token hash only', async () => {
    const { res, tokenRow } = await requestToken(pool, tenantA, {
      contact: 'jane.magic@example.com',
      channel: 'email',
      honeypot: ''
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.devToken);
    assert.ok(tokenRow);
    assert.equal(Number(tokenRow.member_id), memberId);
    assert.notEqual(tokenRow.token_hash, res.body.devToken);
    assert.equal(JSON.stringify(tokenRow).includes(res.body.devToken), false);
    emailToken = res.body.devToken;
  });

  await t.test('6. Existing member by phone creates token', async () => {
    const { res, tokenRow } = await requestToken(pool, tenantA, {
      contact: '0899991199',
      channel: 'phone',
      honeypot: ''
    });
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.devToken);
    assert.equal(tokenRow.delivery_channel, 'phone');
    phoneToken = res.body.devToken;
  });

  await t.test('7. Existing member by line creates token', async () => {
    const { res, tokenRow } = await requestToken(pool, tenantA, {
      contact: '@janemagic',
      channel: 'line',
      honeypot: ''
    });
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.devToken);
    assert.equal(tokenRow.delivery_channel, 'line');
    lineToken = res.body.devToken;
  });

  await t.test('8. Unknown member returns generic success and creates no token', async () => {
    const before = await pool.query('select count(*)::int as count from clinic_member_access_tokens where clinic_id = $1', [tenantA.clinicId]);
    const res = await routeJson({
      method: 'POST',
      path: `/public/clinics/${tenantA.clinicSlug}/member-access/request`,
      body: { contact: 'missing@example.com', channel: 'email', honeypot: '' }
    });
    const after = await pool.query('select count(*)::int as count from clinic_member_access_tokens where clinic_id = $1', [tenantA.clinicId]);
    assert.equal(res.statusCode, 200);
    assert.equal(after.rows[0].count, before.rows[0].count);
  });

  await t.test('9. Token verify returns public-safe profile and booking request status list', async () => {
    const res = await routeJson({
      method: 'GET',
      path: `/public/clinics/${tenantA.clinicSlug}/member-access/session`,
      searchParams: { token: emailToken }
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.member.displayName, 'Jane D.');
    assert.equal(res.body.member.contact.emailMasked, 'ja***@example.com');
    assert.equal(res.body.member.contact.phoneMasked, '08******99');
    assert.equal(res.body.member.contact.lineIdMasked, '@ja***');
    assert.ok(res.body.bookingRequests.some((booking) => booking.id === bookingId && booking.status === 'contacted'));
  });

  await t.test('10. Token verify does not return raw contact or admin fields', async () => {
    const res = await routeJson({
      method: 'GET',
      path: `/public/clinics/${tenantA.clinicSlug}/member-access/session`,
      searchParams: { token: phoneToken }
    });
    const serialized = JSON.stringify(res.body);
    assert.doesNotMatch(serialized, /0899991199/);
    assert.equal(serialized.includes('jane.magic@example.com'), false);
    assert.doesNotMatch(serialized, /@janemagic/);
    assert.doesNotMatch(serialized, /profileJson|profile_json|internalSegment|private booking note|clinicId|clinic_id/);
  });

  await t.test('11. Expired token rejected', async () => {
    const { res } = await requestToken(pool, tenantA, { contact: 'jane.magic@example.com', channel: 'email', honeypot: '' });
    await pool.query(
      'update clinic_member_access_tokens set expires_at = now() - interval \'1 minute\' where token_hash = $1',
      [require('../apps/api/src/modules/member-access/service').hashAccessToken(res.body.devToken)]
    );
    const verify = await routeJson({
      method: 'GET',
      path: `/public/clinics/${tenantA.clinicSlug}/member-access/session`,
      searchParams: { token: res.body.devToken }
    });
    assert.equal(verify.statusCode, 401);
    assert.equal(verify.body.error.code, 'MEMBER_ACCESS_TOKEN_EXPIRED');
  });

  await t.test('12. Revoked token rejected', async () => {
    const { res } = await requestToken(pool, tenantA, { contact: 'jane.magic@example.com', channel: 'email', honeypot: '' });
    await pool.query(
      'update clinic_member_access_tokens set revoked_at = now() where token_hash = $1',
      [require('../apps/api/src/modules/member-access/service').hashAccessToken(res.body.devToken)]
    );
    const verify = await routeJson({
      method: 'GET',
      path: `/public/clinics/${tenantA.clinicSlug}/member-access/session`,
      searchParams: { token: res.body.devToken }
    });
    assert.equal(verify.statusCode, 404);
    assert.equal(verify.body.error.code, 'INVALID_MEMBER_ACCESS_TOKEN');
  });

  await t.test('13. Cross-clinic token rejected', async () => {
    const res = await routeJson({
      method: 'GET',
      path: `/public/clinics/${tenantB.clinicSlug}/member-access/session`,
      searchParams: { token: lineToken }
    });
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error.code, 'INVALID_MEMBER_ACCESS_TOKEN');
  });

  await t.test('14. Audit summaries exclude raw token and contact', async () => {
    const audit = await pool.query(
      `
        select context_json
        from audit_logs
        where clinic_id = $1
          and entity_type = 'clinic_member'
          and entity_id = $2
          and action_type in ('member_access.requested', 'member_access.verified')
        order by id asc
      `,
      [tenantA.clinicId, memberId]
    );
    assert.ok(audit.rowCount >= 1);
    const serialized = JSON.stringify(audit.rows.map((row) => row.context_json));
    assert.match(serialized, /member_magic_link/);
    assert.doesNotMatch(serialized, /0899991199/);
    assert.equal(serialized.includes('jane.magic@example.com'), false);
    assert.doesNotMatch(serialized, /@janemagic/);
    assert.equal(serialized.includes(emailToken), false);
  });
});
