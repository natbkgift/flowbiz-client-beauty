'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { loadConfig } = require('../apps/api/src/config');
const { AppError } = require('../apps/api/src/common/errors');
const { json } = require('../apps/api/src/common/http');
const { handleClinicOfferingsRoutes } = require('../apps/api/src/modules/clinic-offerings/routes');

// ---------------------------------------------------------------------------
// Test harness helpers (same pattern as admin tests)
// ---------------------------------------------------------------------------

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

async function routeJson(handler, { method = 'GET', path }) {
  const response = createMockResponse();
  const url = new URL(`http://localhost${path}`);
  let handled = false;

  try {
    handled = await handler(
      { method, headers: {} },
      response,
      url,
      {
        authenticateRequest: async () => {
          throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.');
        },
        parseJsonBody: async () => ({}),
        json
      }
    );
  } catch (err) {
    if (err instanceof AppError) {
      response.writeHead(err.statusCode);
      response.end(JSON.stringify({
        error: { code: err.code, message: err.message, details: err.details || null }
      }));
    } else {
      console.error('INTERNAL ERROR IN TEST:', err);
      response.writeHead(500);
      response.end(JSON.stringify({
        error: { code: 'INTERNAL_SERVER_ERROR', message: err.message }
      }));
    }
    handled = true;
  }

  const parsedBody = response.body ? JSON.parse(response.body) : null;
  return { handled, statusCode: response.statusCode, body: parsedBody };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test('Public Clinic Offerings API - Integration Tests', async (t) => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const uniqueId = Date.now() + Math.floor(Math.random() * 1000);

  let testClinicId;
  let inactiveClinicId;

  const activeSlug = `pub-offerings-active-${uniqueId}`;
  const inactiveSlug = `pub-offerings-inactive-${uniqueId}`;

  t.before(async () => {
    // Active clinic with services, promotions, packages
    const clinicRes = await pool.query(
      "insert into clinics (name, slug, plan, status) values ($1, $2, 'starter', 'active') returning id",
      [`Public Offerings Clinic ${uniqueId}`, activeSlug]
    );
    testClinicId = Number(clinicRes.rows[0].id);

    // Inactive clinic
    const inactiveClinicRes = await pool.query(
      "insert into clinics (name, slug, plan, status) values ($1, $2, 'starter', 'inactive') returning id",
      [`Inactive Offerings Clinic ${uniqueId}`, inactiveSlug]
    );
    inactiveClinicId = Number(inactiveClinicRes.rows[0].id);

    // Insert services with various statuses
    await pool.query(
      `insert into clinic_services (clinic_id, service_key, name, slug, status, is_featured, sort_order)
       values
         ($1, 'featured-svc-${uniqueId}', 'Featured Service', 'featured-svc-${uniqueId}', 'active', true, 2),
         ($1, 'regular-svc-${uniqueId}', 'Regular Service', 'regular-svc-${uniqueId}', 'active', false, 1),
         ($1, 'draft-svc-${uniqueId}', 'Draft Service', 'draft-svc-${uniqueId}', 'draft', false, 0),
         ($1, 'inactive-svc-${uniqueId}', 'Inactive Service', 'inactive-svc-${uniqueId}', 'inactive', false, 3),
         ($1, 'archived-svc-${uniqueId}', 'Archived Service', 'archived-svc-${uniqueId}', 'archived', false, 4)`,
      [testClinicId]
    );

    // Insert promotions with various statuses
    await pool.query(
      `insert into clinic_promotions (clinic_id, promotion_key, title, slug, status, is_featured, sort_order)
       values
         ($1, 'featured-promo-${uniqueId}', 'Featured Promo', 'featured-promo-${uniqueId}', 'active', true, 2),
         ($1, 'regular-promo-${uniqueId}', 'Regular Promo', 'regular-promo-${uniqueId}', 'active', false, 1),
         ($1, 'draft-promo-${uniqueId}', 'Draft Promo', 'draft-promo-${uniqueId}', 'draft', false, 0),
         ($1, 'archived-promo-${uniqueId}', 'Archived Promo', 'archived-promo-${uniqueId}', 'archived', false, 3)`,
      [testClinicId]
    );

    // Insert packages with various statuses
    await pool.query(
      `insert into clinic_packages (clinic_id, package_key, name, slug, status, is_featured, sort_order)
       values
         ($1, 'featured-pkg-${uniqueId}', 'Featured Package', 'featured-pkg-${uniqueId}', 'active', true, 2),
         ($1, 'regular-pkg-${uniqueId}', 'Regular Package', 'regular-pkg-${uniqueId}', 'active', false, 1),
         ($1, 'draft-pkg-${uniqueId}', 'Draft Package', 'draft-pkg-${uniqueId}', 'draft', false, 0)`,
      [testClinicId]
    );
  });

  t.after(async () => {
    try {
      if (testClinicId) {
        await pool.query('delete from clinics where id in ($1, $2)', [testClinicId, inactiveClinicId]);
      }
    } catch (err) {
      console.error('Test cleanup failed:', err);
    } finally {
      await pool.end();
    }
  });

  // -------------------------------------------------------------------------
  // 1. Active clinic public services returns only active services
  // -------------------------------------------------------------------------
  await t.test('1. Active clinic services list returns only active services', async () => {
    const res = await routeJson(handleClinicOfferingsRoutes, {
      method: 'GET',
      path: `/public/clinics/${activeSlug}/services`
    });

    assert.equal(res.statusCode, 200);
    assert.ok(Array.isArray(res.body.items));

    const names = res.body.items.map(s => s.name);
    assert.ok(names.includes('Featured Service'), 'Featured Service should be in active list');
    assert.ok(names.includes('Regular Service'), 'Regular Service should be in active list');
    assert.equal(res.body.items.length, 2, 'Only active services should be returned');
  });

  // -------------------------------------------------------------------------
  // 2. Draft/inactive/archived services are hidden
  // -------------------------------------------------------------------------
  await t.test('2. Draft/inactive/archived services are hidden from public', async () => {
    const res = await routeJson(handleClinicOfferingsRoutes, {
      method: 'GET',
      path: `/public/clinics/${activeSlug}/services`
    });

    const names = res.body.items.map(s => s.name);
    assert.equal(names.includes('Draft Service'), false, 'Draft service must not appear');
    assert.equal(names.includes('Inactive Service'), false, 'Inactive service must not appear');
    assert.equal(names.includes('Archived Service'), false, 'Archived service must not appear');
  });

  // -------------------------------------------------------------------------
  // 3. Unknown clinic slug returns 404
  // -------------------------------------------------------------------------
  await t.test('3. Unknown clinic slug returns 404', async () => {
    const res = await routeJson(handleClinicOfferingsRoutes, {
      method: 'GET',
      path: '/public/clinics/no-such-clinic-slug-xyz/services'
    });
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error.code, 'CLINIC_NOT_FOUND');
  });

  // -------------------------------------------------------------------------
  // 4. Inactive clinic returns 404
  // -------------------------------------------------------------------------
  await t.test('4. Inactive clinic returns 404 (does not leak existence)', async () => {
    const res = await routeJson(handleClinicOfferingsRoutes, {
      method: 'GET',
      path: `/public/clinics/${inactiveSlug}/services`
    });
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error.code, 'CLINIC_NOT_FOUND');
  });

  // -------------------------------------------------------------------------
  // 5. Public promotions list returns only active promotions
  // -------------------------------------------------------------------------
  await t.test('5. Active clinic promotions list returns only active promotions', async () => {
    const res = await routeJson(handleClinicOfferingsRoutes, {
      method: 'GET',
      path: `/public/clinics/${activeSlug}/promotions`
    });

    assert.equal(res.statusCode, 200);
    assert.ok(Array.isArray(res.body.items));

    const titles = res.body.items.map(p => p.title);
    assert.ok(titles.includes('Featured Promo'), 'Featured Promo should appear');
    assert.ok(titles.includes('Regular Promo'), 'Regular Promo should appear');
    assert.equal(res.body.items.length, 2, 'Only active promotions should be returned');
    assert.equal(titles.includes('Draft Promo'), false, 'Draft Promo must not appear');
    assert.equal(titles.includes('Archived Promo'), false, 'Archived Promo must not appear');
  });

  // -------------------------------------------------------------------------
  // 6. Public packages list returns only active packages
  // -------------------------------------------------------------------------
  await t.test('6. Active clinic packages list returns only active packages', async () => {
    const res = await routeJson(handleClinicOfferingsRoutes, {
      method: 'GET',
      path: `/public/clinics/${activeSlug}/packages`
    });

    assert.equal(res.statusCode, 200);
    assert.ok(Array.isArray(res.body.items));

    const names = res.body.items.map(p => p.name);
    assert.ok(names.includes('Featured Package'), 'Featured Package should appear');
    assert.ok(names.includes('Regular Package'), 'Regular Package should appear');
    assert.equal(res.body.items.length, 2, 'Only active packages should be returned');
    assert.equal(names.includes('Draft Package'), false, 'Draft Package must not appear');
  });

  // -------------------------------------------------------------------------
  // 7. Sorting order: is_featured desc, sort_order asc
  // -------------------------------------------------------------------------
  await t.test('7. Public services sort: featured first, then sort_order asc', async () => {
    const res = await routeJson(handleClinicOfferingsRoutes, {
      method: 'GET',
      path: `/public/clinics/${activeSlug}/services`
    });

    assert.equal(res.statusCode, 200);
    const items = res.body.items;
    assert.ok(items.length >= 2);

    // Featured item should be first (is_featured=true, sort_order=2 > non-featured with sort_order=1)
    assert.equal(items[0].name, 'Featured Service', 'Featured service should come first');
    assert.equal(items[1].name, 'Regular Service', 'Regular service should come second');
  });

  await t.test('7b. Public promotions sort: featured first, then sort_order asc', async () => {
    const res = await routeJson(handleClinicOfferingsRoutes, {
      method: 'GET',
      path: `/public/clinics/${activeSlug}/promotions`
    });

    assert.equal(res.statusCode, 200);
    const items = res.body.items;
    assert.ok(items.length >= 2);
    assert.equal(items[0].title, 'Featured Promo', 'Featured promo should come first');
  });

  // -------------------------------------------------------------------------
  // 8. Public response does not include draft/internal metadata fields
  // -------------------------------------------------------------------------
  await t.test('8. Public response does not include internal admin-only fields', async () => {
    const res = await routeJson(handleClinicOfferingsRoutes, {
      method: 'GET',
      path: `/public/clinics/${activeSlug}/services`
    });

    assert.equal(res.statusCode, 200);
    const item = res.body.items[0];

    // Public endpoint should NOT expose clinicId or raw metadata object
    assert.equal(item.clinicId, undefined, 'clinicId should not be in public response');
    assert.equal(item.metadata, undefined, 'metadata should not be in public response');
    assert.equal(item.description, undefined, 'full description should not be in public response');
    assert.equal(item.createdAt, undefined, 'createdAt should not be in public response');
    assert.equal(item.updatedAt, undefined, 'updatedAt should not be in public response');
  });

  // -------------------------------------------------------------------------
  // 9. Unknown clinic for promotions returns 404
  // -------------------------------------------------------------------------
  await t.test('9. Unknown clinic for promotions returns 404', async () => {
    const res = await routeJson(handleClinicOfferingsRoutes, {
      method: 'GET',
      path: '/public/clinics/no-such-clinic-abc/promotions'
    });
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error.code, 'CLINIC_NOT_FOUND');
  });

  // -------------------------------------------------------------------------
  // 10. Unknown clinic for packages returns 404
  // -------------------------------------------------------------------------
  await t.test('10. Unknown clinic for packages returns 404', async () => {
    const res = await routeJson(handleClinicOfferingsRoutes, {
      method: 'GET',
      path: '/public/clinics/no-such-clinic-abc/packages'
    });
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error.code, 'CLINIC_NOT_FOUND');
  });

  // -------------------------------------------------------------------------
  // 11. Inactive clinic returns 404 for promotions and packages too
  // -------------------------------------------------------------------------
  await t.test('11. Inactive clinic returns 404 for promotions', async () => {
    const res = await routeJson(handleClinicOfferingsRoutes, {
      method: 'GET',
      path: `/public/clinics/${inactiveSlug}/promotions`
    });
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error.code, 'CLINIC_NOT_FOUND');
  });

  await t.test('11b. Inactive clinic returns 404 for packages', async () => {
    const res = await routeJson(handleClinicOfferingsRoutes, {
      method: 'GET',
      path: `/public/clinics/${inactiveSlug}/packages`
    });
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error.code, 'CLINIC_NOT_FOUND');
  });
});
