'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { loadConfig } = require('../apps/api/src/config');
const { AppError } = require('../apps/api/src/common/errors');
const { json } = require('../apps/api/src/common/http');
const { handleClinicOfferingsRoutes } = require('../apps/api/src/modules/clinic-offerings/routes');

// ---------------------------------------------------------------------------
// Test harness helpers
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

async function routeJson(handler, { method = 'GET', path, authenticateRequest, body = {}, searchParams = {} }) {
  const response = createMockResponse();
  const searchStr = Object.keys(searchParams).length
    ? '?' + new URLSearchParams(searchParams).toString()
    : '';
  const url = new URL(`http://localhost${path}${searchStr}`);
  let handled = false;

  try {
    handled = await handler(
      { method, headers: {} },
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

test('Clinic Offerings Admin API - Integration Tests', async (t) => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const uniqueId = Date.now() + Math.floor(Math.random() * 1000);

  let testClinicId1;
  let testClinicId2;
  let testOwnerUserId;
  let testStaffUserId;
  let createdServiceId;
  let createdPromotionId;
  let createdPackageId;

  t.before(async () => {
    const clinic1 = await pool.query(
      "insert into clinics (name, slug, plan, status) values ($1, $2, 'starter', 'active') returning id",
      [`Offerings Clinic A ${uniqueId}`, `offerings-clinic-a-${uniqueId}`]
    );
    testClinicId1 = Number(clinic1.rows[0].id);

    const clinic2 = await pool.query(
      "insert into clinics (name, slug, plan, status) values ($1, $2, 'starter', 'active') returning id",
      [`Offerings Clinic B ${uniqueId}`, `offerings-clinic-b-${uniqueId}`]
    );
    testClinicId2 = Number(clinic2.rows[0].id);

    const ownerUser = await pool.query(
      "insert into users (email, name, password_hash, status) values ($1, $2, 'hash', 'active') returning id",
      [`offerings-owner-${uniqueId}@flowbiz.local`, 'Offerings Owner']
    );
    testOwnerUserId = Number(ownerUser.rows[0].id);

    const staffUser = await pool.query(
      "insert into users (email, name, password_hash, status) values ($1, $2, 'hash', 'active') returning id",
      [`offerings-staff-${uniqueId}@flowbiz.local`, 'Offerings Staff']
    );
    testStaffUserId = Number(staffUser.rows[0].id);
  });

  t.after(async () => {
    try {
      if (testClinicId1) {
        await pool.query('delete from clinics where id in ($1, $2)', [testClinicId1, testClinicId2]);
      }
      if (testOwnerUserId) {
        await pool.query('delete from users where id in ($1, $2)', [testOwnerUserId, testStaffUserId]);
      }
    } catch (err) {
      console.error('Test cleanup failed:', err);
    } finally {
      await pool.end();
    }
  });

  const ownerAuthClinic1 = async () => ({
    currentUser: { id: testOwnerUserId, email: `offerings-owner-${uniqueId}@flowbiz.local` },
    currentClinic: { id: testClinicId1, slug: `offerings-clinic-a-${uniqueId}` },
    currentMembership: { role: 'owner', permissions: [] }
  });

  const ownerAuthClinic2 = async () => ({
    currentUser: { id: testOwnerUserId, email: `offerings-owner-${uniqueId}@flowbiz.local` },
    currentClinic: { id: testClinicId2, slug: `offerings-clinic-b-${uniqueId}` },
    currentMembership: { role: 'owner', permissions: [] }
  });

  const staffAuthClinic1 = async () => ({
    currentUser: { id: testStaffUserId, email: `offerings-staff-${uniqueId}@flowbiz.local` },
    currentClinic: { id: testClinicId1, slug: `offerings-clinic-a-${uniqueId}` },
    currentMembership: { role: 'staff', permissions: [] }
  });

  const salesAuthClinic1 = async () => ({
    currentUser: { id: testStaffUserId, email: `offerings-staff-${uniqueId}@flowbiz.local` },
    currentClinic: { id: testClinicId1, slug: `offerings-clinic-a-${uniqueId}` },
    currentMembership: { role: 'sales', permissions: [] }
  });

  const anonymousAuth = async () => {
    throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.');
  };

  // -------------------------------------------------------------------------
  // 1. Auth required
  // -------------------------------------------------------------------------
  await t.test('1. Auth required for all admin endpoints', async () => {
    const res = await routeJson(handleClinicOfferingsRoutes, {
      method: 'GET',
      path: '/admin/clinic-offerings/services',
      authenticateRequest: anonymousAuth
    });
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error.code, 'AUTH_REQUIRED');
  });

  // -------------------------------------------------------------------------
  // 2. Owner can list services
  // -------------------------------------------------------------------------
  await t.test('2. Owner can list services (empty initially)', async () => {
    const res = await routeJson(handleClinicOfferingsRoutes, {
      method: 'GET',
      path: '/admin/clinic-offerings/services',
      authenticateRequest: ownerAuthClinic1
    });
    assert.equal(res.statusCode, 200);
    assert.ok(Array.isArray(res.body.items));
    assert.equal(res.body.items.length, 0);
  });

  // -------------------------------------------------------------------------
  // 3. Owner can create a service
  // -------------------------------------------------------------------------
  await t.test('3. Owner can create a service', async () => {
    const res = await routeJson(handleClinicOfferingsRoutes, {
      method: 'POST',
      path: '/admin/clinic-offerings/services',
      authenticateRequest: ownerAuthClinic1,
      body: {
        name: 'Botox Treatment',
        category: 'Injectables',
        shortDescription: 'Reduce wrinkles safely.',
        priceMin: 3000,
        priceMax: 8000,
        durationMinutes: 30,
        status: 'active',
        isFeatured: true,
        sortOrder: 1
      }
    });

    assert.equal(res.statusCode, 201);
    assert.ok(res.body.id);
    assert.equal(res.body.name, 'Botox Treatment');
    assert.equal(res.body.priceMin, 3000);
    assert.equal(res.body.priceMax, 8000);
    assert.equal(res.body.isFeatured, true);
    assert.equal(res.body.clinicId, testClinicId1);

    createdServiceId = res.body.id;
  });

  // -------------------------------------------------------------------------
  // 4. Reject invalid price range (priceMax < priceMin)
  // -------------------------------------------------------------------------
  await t.test('4. Reject invalid price range (priceMax < priceMin)', async () => {
    const res = await routeJson(handleClinicOfferingsRoutes, {
      method: 'POST',
      path: '/admin/clinic-offerings/services',
      authenticateRequest: ownerAuthClinic1,
      body: {
        name: 'Bad Price Service',
        priceMin: 5000,
        priceMax: 1000
      }
    });

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.code, 'INVALID_PRICE_RANGE');
  });

  // -------------------------------------------------------------------------
  // 5. Reject unsafe image URL
  // -------------------------------------------------------------------------
  await t.test('5. Reject unsafe image URL (javascript: protocol)', async () => {
    const res = await routeJson(handleClinicOfferingsRoutes, {
      method: 'POST',
      path: '/admin/clinic-offerings/services',
      authenticateRequest: ownerAuthClinic1,
      body: {
        name: 'Unsafe Image Service',
        imageUrl: 'javascript:alert(1)'
      }
    });

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.code, 'INVALID_OFFERING_URL');
  });

  // -------------------------------------------------------------------------
  // 6. Owner can update a service
  // -------------------------------------------------------------------------
  await t.test('6. Owner can update a service', async () => {
    const res = await routeJson(handleClinicOfferingsRoutes, {
      method: 'PATCH',
      path: `/admin/clinic-offerings/services/${createdServiceId}`,
      authenticateRequest: ownerAuthClinic1,
      body: {
        shortDescription: 'Updated description.',
        priceMin: 3500,
        priceMax: 9000
      }
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.shortDescription, 'Updated description.');
    assert.equal(res.body.priceMin, 3500);
    assert.equal(res.body.priceMax, 9000);
  });

  // -------------------------------------------------------------------------
  // 7. Owner can reorder services
  // -------------------------------------------------------------------------
  await t.test('7. Owner can reorder services', async () => {
    const res = await routeJson(handleClinicOfferingsRoutes, {
      method: 'PATCH',
      path: '/admin/clinic-offerings/services/reorder',
      authenticateRequest: ownerAuthClinic1,
      body: {
        items: [{ id: createdServiceId, sortOrder: 10 }]
      }
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
  });

  // -------------------------------------------------------------------------
  // 8. Reorder with missing/cross-tenant ID fails closed
  // -------------------------------------------------------------------------
  await t.test('8a. Reorder non-existent service returns 404', async () => {
    const res = await routeJson(handleClinicOfferingsRoutes, {
      method: 'PATCH',
      path: '/admin/clinic-offerings/services/reorder',
      authenticateRequest: ownerAuthClinic1,
      body: { items: [{ id: 999999999, sortOrder: 1 }] }
    });
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error.code, 'SERVICE_NOT_FOUND');
  });

  await t.test('8b. Reorder cross-tenant service returns 403', async () => {
    const res = await routeJson(handleClinicOfferingsRoutes, {
      method: 'PATCH',
      path: '/admin/clinic-offerings/services/reorder',
      authenticateRequest: ownerAuthClinic2,
      body: { items: [{ id: createdServiceId, sortOrder: 1 }] }
    });
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error.code, 'CROSS_TENANT_FORBIDDEN');
  });

  // -------------------------------------------------------------------------
  // 9. Owner can delete a service (create a secondary one for deletion)
  // -------------------------------------------------------------------------
  await t.test('9. Owner can delete a service', async () => {
    const createRes = await routeJson(handleClinicOfferingsRoutes, {
      method: 'POST',
      path: '/admin/clinic-offerings/services',
      authenticateRequest: ownerAuthClinic1,
      body: { name: 'To Be Deleted Service', status: 'draft' }
    });
    const toDeleteId = createRes.body.id;

    const deleteRes = await routeJson(handleClinicOfferingsRoutes, {
      method: 'DELETE',
      path: `/admin/clinic-offerings/services/${toDeleteId}`,
      authenticateRequest: ownerAuthClinic1
    });

    assert.equal(deleteRes.statusCode, 200);
    assert.equal(deleteRes.body.success, true);

    const dbCheck = await pool.query('select 1 from clinic_services where id = $1', [toDeleteId]);
    assert.equal(dbCheck.rowCount, 0);
  });

  // -------------------------------------------------------------------------
  // 10. Staff/sales can read but cannot write
  // -------------------------------------------------------------------------
  await t.test('10a. Staff can list services (read-only)', async () => {
    const res = await routeJson(handleClinicOfferingsRoutes, {
      method: 'GET',
      path: '/admin/clinic-offerings/services',
      authenticateRequest: staffAuthClinic1
    });
    assert.equal(res.statusCode, 200);
  });

  await t.test('10b. Staff cannot create service (write blocked)', async () => {
    const res = await routeJson(handleClinicOfferingsRoutes, {
      method: 'POST',
      path: '/admin/clinic-offerings/services',
      authenticateRequest: staffAuthClinic1,
      body: { name: 'Staff Hack Service' }
    });
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error.code, 'INSUFFICIENT_PERMISSIONS');
  });

  await t.test('10c. Sales cannot create service (write blocked)', async () => {
    const res = await routeJson(handleClinicOfferingsRoutes, {
      method: 'POST',
      path: '/admin/clinic-offerings/services',
      authenticateRequest: salesAuthClinic1,
      body: { name: 'Sales Hack Service' }
    });
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error.code, 'INSUFFICIENT_PERMISSIONS');
  });

  // -------------------------------------------------------------------------
  // 11. Owner can create promotion
  // -------------------------------------------------------------------------
  await t.test('11. Owner can create a promotion', async () => {
    const res = await routeJson(handleClinicOfferingsRoutes, {
      method: 'POST',
      path: '/admin/clinic-offerings/promotions',
      authenticateRequest: ownerAuthClinic1,
      body: {
        title: 'Summer Glow Package',
        subtitle: 'Best deal of the season',
        badgeLabel: 'HOT',
        status: 'active',
        isFeatured: true,
        ctaLabel: 'Book Now',
        ctaUrl: 'https://clinic.local/book'
      }
    });

    assert.equal(res.statusCode, 201);
    assert.ok(res.body.id);
    assert.equal(res.body.title, 'Summer Glow Package');
    assert.equal(res.body.badgeLabel, 'HOT');
    assert.equal(res.body.isFeatured, true);
    assert.equal(res.body.clinicId, testClinicId1);

    createdPromotionId = res.body.id;
  });

  // -------------------------------------------------------------------------
  // 12. Reject promotion with endsAt before startsAt
  // -------------------------------------------------------------------------
  await t.test('12. Reject promotion where endsAt < startsAt', async () => {
    const res = await routeJson(handleClinicOfferingsRoutes, {
      method: 'POST',
      path: '/admin/clinic-offerings/promotions',
      authenticateRequest: ownerAuthClinic1,
      body: {
        title: 'Bad Date Promo',
        startsAt: '2025-12-01T00:00:00Z',
        endsAt: '2025-11-01T00:00:00Z'
      }
    });

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.code, 'INVALID_OFFERING_PAYLOAD');
  });

  // -------------------------------------------------------------------------
  // 13. Owner can create package
  // -------------------------------------------------------------------------
  await t.test('13. Owner can create a package', async () => {
    const res = await routeJson(handleClinicOfferingsRoutes, {
      method: 'POST',
      path: '/admin/clinic-offerings/packages',
      authenticateRequest: ownerAuthClinic1,
      body: {
        name: 'Glow Bundle',
        summary: 'Complete glow treatment',
        price: 12000,
        currency: 'THB',
        status: 'active',
        isFeatured: true
      }
    });

    assert.equal(res.statusCode, 201);
    assert.ok(res.body.id);
    assert.equal(res.body.name, 'Glow Bundle');
    assert.equal(res.body.price, 12000);
    assert.equal(res.body.clinicId, testClinicId1);

    createdPackageId = res.body.id;
  });

  // -------------------------------------------------------------------------
  // 14. Package-service link verifies same clinic
  // -------------------------------------------------------------------------
  await t.test('14. Package-service link verifies same clinic (cross-clinic service rejected)', async () => {
    // Create a service in clinic 2
    const svcRes = await pool.query(
      `insert into clinic_services (clinic_id, service_key, name, slug, status)
       values ($1, $2, $3, $4, 'active') returning id`,
      [testClinicId2, `svc-cross-${uniqueId}`, `Cross Clinic Service ${uniqueId}`, `cross-svc-${uniqueId}`]
    );
    const crossServiceId = Number(svcRes.rows[0].id);

    // Attempt to link clinic 2's service to clinic 1's package
    const res = await routeJson(handleClinicOfferingsRoutes, {
      method: 'POST',
      path: `/admin/clinic-offerings/packages/${createdPackageId}/services`,
      authenticateRequest: ownerAuthClinic1,
      body: { serviceId: crossServiceId, quantity: 1 }
    });

    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error.code, 'CROSS_TENANT_FORBIDDEN');

    // Cleanup cross-clinic service
    await pool.query('delete from clinic_services where id = $1', [crossServiceId]);
  });

  // -------------------------------------------------------------------------
  // 15. Body clinicId/clinic_id rejected
  // -------------------------------------------------------------------------
  await t.test('15. Body clinicId is rejected with 400', async () => {
    const res = await routeJson(handleClinicOfferingsRoutes, {
      method: 'POST',
      path: '/admin/clinic-offerings/services',
      authenticateRequest: ownerAuthClinic1,
      body: { name: 'Injected Clinic', clinicId: testClinicId2 }
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.code, 'INVALID_REQUEST');

    const res2 = await routeJson(handleClinicOfferingsRoutes, {
      method: 'POST',
      path: '/admin/clinic-offerings/services',
      authenticateRequest: ownerAuthClinic1,
      body: { name: 'Injected Clinic 2', clinic_id: testClinicId2 }
    });
    assert.equal(res2.statusCode, 400);
    assert.equal(res2.body.error.code, 'INVALID_REQUEST');
  });

  // -------------------------------------------------------------------------
  // 16. Audit logs created with summary-only context
  // -------------------------------------------------------------------------
  await t.test('16. Audit logs are created for write operations (summary only)', async () => {
    const auditRes = await pool.query(
      'select action_type, context_json from audit_logs where clinic_id = $1 order by id asc',
      [testClinicId1]
    );

    assert.ok(auditRes.rowCount >= 3, `Expected >= 3 audit entries, got ${auditRes.rowCount}`);

    const actions = auditRes.rows.map(r => r.action_type);
    assert.ok(actions.includes('clinic_service.created'), 'clinic_service.created audit missing');
    assert.ok(actions.includes('clinic_service.updated'), 'clinic_service.updated audit missing');
    assert.ok(actions.includes('clinic_promotion.created'), 'clinic_promotion.created audit missing');
    assert.ok(actions.includes('clinic_package.created'), 'clinic_package.created audit missing');

    // Verify summary-only structure (no raw PII or full payload)
    for (const row of auditRes.rows) {
      const ctx = typeof row.context_json === 'string' ? JSON.parse(row.context_json) : row.context_json;
      assert.ok(ctx.summary, `Audit row missing summary: action=${row.action_type}`);
      assert.ok(ctx.summary.source, `Audit summary missing source: action=${row.action_type}`);
      // Confirm raw sensitive fields are NOT stored at top level
      assert.equal(ctx.description, undefined, 'Raw description should not be in audit context root');
      assert.equal(ctx.price, undefined, 'Raw price should not be in audit context root');
    }
  });

  // -------------------------------------------------------------------------
  // Additional: Invalid metadata is rejected
  // -------------------------------------------------------------------------
  await t.test('17. Invalid metadata (array) is rejected', async () => {
    const res = await routeJson(handleClinicOfferingsRoutes, {
      method: 'POST',
      path: '/admin/clinic-offerings/services',
      authenticateRequest: ownerAuthClinic1,
      body: { name: 'Metadata Array Service', metadata: ['bad', 'array'] }
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.code, 'INVALID_OFFERING_METADATA');
  });

  // -------------------------------------------------------------------------
  // Additional: Promotion reorder works
  // -------------------------------------------------------------------------
  await t.test('18. Owner can reorder promotions', async () => {
    const res = await routeJson(handleClinicOfferingsRoutes, {
      method: 'PATCH',
      path: '/admin/clinic-offerings/promotions/reorder',
      authenticateRequest: ownerAuthClinic1,
      body: { items: [{ id: createdPromotionId, sortOrder: 5 }] }
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
  });

  // -------------------------------------------------------------------------
  // Additional: Package reorder works
  // -------------------------------------------------------------------------
  await t.test('19. Owner can reorder packages', async () => {
    const res = await routeJson(handleClinicOfferingsRoutes, {
      method: 'PATCH',
      path: '/admin/clinic-offerings/packages/reorder',
      authenticateRequest: ownerAuthClinic1,
      body: { items: [{ id: createdPackageId, sortOrder: 3 }] }
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
  });

  // -------------------------------------------------------------------------
  // Additional: data:// URL rejected
  // -------------------------------------------------------------------------
  await t.test('20. data: URL is rejected as unsafe', async () => {
    const res = await routeJson(handleClinicOfferingsRoutes, {
      method: 'POST',
      path: '/admin/clinic-offerings/promotions',
      authenticateRequest: ownerAuthClinic1,
      body: { title: 'Data URL Promo', imageUrl: 'data:text/html,<script>alert(1)</script>' }
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.code, 'INVALID_OFFERING_URL');
  });
});
