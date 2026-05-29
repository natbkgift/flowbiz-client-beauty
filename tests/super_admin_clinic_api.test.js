const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { loadConfig } = require('../apps/api/src/config');
const { AppError } = require('../apps/api/src/common/errors');
const { json } = require('../apps/api/src/common/http');
const { handleClinicRoutes } = require('../apps/api/src/modules/clinics/routes');

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

async function routeJson(handler, { method = 'GET', path, authenticateRequest, body = {} }) {
  const response = createMockResponse();
  const url = new URL(`http://localhost${path}`);
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
    // Mimic the top-level error handling from server.js
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
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: err.message
        }
      }));
    }
    handled = true;
  }

  const parsedBody = response.body ? JSON.parse(response.body) : null;
  if (response.statusCode >= 400) {
    console.error('API Error Response:', response.statusCode, parsedBody);
  }

  return {
    handled,
    statusCode: response.statusCode,
    body: parsedBody
  };
}

test('Super Admin Clinic API - Full Integration Tests', async (t) => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const uniqueId = Date.now() + Math.floor(Math.random() * 1000);
  const createdClinicIds = [];

  let testUserId;

  t.before(async () => {
    const userRes = await pool.query(
      `insert into users (email, name, password_hash) values ($1, $2, $3) returning id`,
      [`test-superadmin-${uniqueId}@flowbiz.local`, 'Test SuperAdmin', 'hash']
    );
    testUserId = Number(userRes.rows[0].id);
  });

  t.after(async () => {
    try {
      if (createdClinicIds.length > 0) {
        // Cascade deletes will clean up related website tables
        await pool.query('delete from clinics where id = any($1)', [createdClinicIds]);
      }
      if (testUserId) {
        await pool.query('delete from users where id = $1', [testUserId]);
      }
    } catch (err) {
      console.error('Test cleanup failed:', err);
    } finally {
      await pool.end();
    }
  });

  // Mocks for different auth contexts
  const superAdminAuth = async () => ({
    currentUser: { id: testUserId, email: 'superadmin@flowbiz.local' },
    currentMembership: { role: 'owner', permissions: ['tenant.manage'] }
  });

  const staffAuth = async () => ({
    currentUser: { id: testUserId, email: 'staff@flowbiz.local' },
    currentMembership: { role: 'staff', permissions: [] }
  });

  const anonymousAuth = async () => {
    throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.');
  };

  await t.test('1. Auth and Permission constraints', async () => {
    // Anonymous request returns 401
    const res1 = await routeJson(handleClinicRoutes, {
      method: 'GET',
      path: '/admin/clinics',
      authenticateRequest: anonymousAuth
    });
    assert.equal(res1.statusCode, 401);
    assert.equal(res1.body.error.code, 'AUTH_REQUIRED');

    // Unauthorized staff returns 403
    const res2 = await routeJson(handleClinicRoutes, {
      method: 'GET',
      path: '/admin/clinics',
      authenticateRequest: staffAuth
    });
    assert.equal(res2.statusCode, 403);
    assert.equal(res2.body.error.code, 'PLATFORM_ADMIN_REQUIRED');

    // Super Admin request succeeds
    const res3 = await routeJson(handleClinicRoutes, {
      method: 'GET',
      path: '/admin/clinics',
      authenticateRequest: superAdminAuth
    });
    assert.equal(res3.statusCode, 200);
    assert.ok(Array.isArray(res3.body.items));
  });

  await t.test('2. Create clinic with generated slug', async () => {
    const payload = {
      name: `New Gen Clinic ${uniqueId}`,
      plan: 'pro',
      status: 'active',
      timezone: 'Asia/Bangkok'
    };

    const res = await routeJson(handleClinicRoutes, {
      method: 'POST',
      path: '/admin/clinics',
      authenticateRequest: superAdminAuth,
      body: payload
    });

    assert.equal(res.statusCode, 201);
    assert.ok(res.body.id);
    assert.equal(res.body.name, payload.name);
    assert.equal(res.body.slug, `new-gen-clinic-${uniqueId}`);
    assert.equal(res.body.plan, 'pro');
    assert.equal(res.body.status, 'active');
    assert.equal(res.body.timezone, 'Asia/Bangkok');

    createdClinicIds.push(res.body.id);

    // Verify default website settings table created
    const websiteSettings = await pool.query('select * from clinic_website_settings where clinic_id = $1', [res.body.id]);
    assert.equal(websiteSettings.rowCount, 1);
    assert.equal(websiteSettings.rows[0].website_status, 'draft');
    assert.equal(websiteSettings.rows[0].public_display_name, payload.name);

    // Verify default homepage sections count
    const sections = await pool.query('select count(*) as count from clinic_homepage_sections where clinic_id = $1', [res.body.id]);
    assert.equal(sections.rows[0].count, '6');
  });

  await t.test('3. Create clinic with explicit slug', async () => {
    const payload = {
      name: `New Exp Clinic ${uniqueId}`,
      slug: `custom-slug-${uniqueId}`,
      plan: 'starter',
      status: 'active',
      timezone: 'Asia/Bangkok'
    };

    const res = await routeJson(handleClinicRoutes, {
      method: 'POST',
      path: '/admin/clinics',
      authenticateRequest: superAdminAuth,
      body: payload
    });

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.slug, `custom-slug-${uniqueId}`);
    createdClinicIds.push(res.body.id);
  });

  await t.test('4. Rejects reserved slug', async () => {
    const payload = {
      name: `Reserved Name ${uniqueId}`,
      slug: 'admin',
      plan: 'premium',
      status: 'active',
      timezone: 'Asia/Bangkok'
    };

    const res = await routeJson(handleClinicRoutes, {
      method: 'POST',
      path: '/admin/clinics',
      authenticateRequest: superAdminAuth,
      body: payload
    });

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.code, 'RESERVED_CLINIC_SLUG');

    // Rollback validation: verify no clinic or setting records exist
    const clinicCheck = await pool.query('select 1 from clinics where name = $1', [payload.name]);
    assert.equal(clinicCheck.rowCount, 0);
  });

  await t.test('5. Rejects duplicate slug', async () => {
    const payload = {
      name: `Duplicate Clinic ${uniqueId}`,
      slug: `custom-slug-${uniqueId}`, // Already used in test 3
      plan: 'enterprise',
      status: 'active',
      timezone: 'Asia/Bangkok'
    };

    const res = await routeJson(handleClinicRoutes, {
      method: 'POST',
      path: '/admin/clinics',
      authenticateRequest: superAdminAuth,
      body: payload
    });

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.error.code, 'CLINIC_SLUG_CONFLICT');
  });

  await t.test('6. List clinics with filtering and pagination', async () => {
    const res = await routeJson(handleClinicRoutes, {
      method: 'GET',
      path: `/admin/clinics?search=New+Gen+Clinic+${uniqueId}&limit=5`,
      authenticateRequest: superAdminAuth
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.items.length, 1);
    assert.equal(res.body.items[0].slug, `new-gen-clinic-${uniqueId}`);
    assert.equal(res.body.pagination.total, 1);
    assert.equal(res.body.pagination.limit, 5);
  });

  await t.test('7. Get clinic detail', async () => {
    const clinicId = createdClinicIds[0];
    const res = await routeJson(handleClinicRoutes, {
      method: 'GET',
      path: `/admin/clinics/${clinicId}`,
      authenticateRequest: superAdminAuth
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.id, clinicId);
    assert.ok(res.body.websiteSettings);
    assert.ok(res.body.brandingSettings);
    assert.ok(res.body.contactSettings);
    assert.ok(res.body.locationSettings);
    assert.equal(res.body.homepageSections.length, 6);
  });

  await t.test('8. Update clinic basic info & website settings', async () => {
    const clinicId = createdClinicIds[0];
    const payload = {
      name: `Updated Clinic Name ${uniqueId}`,
      plan: 'premium',
      timezone: 'Asia/Singapore',
      publicDisplayName: 'Super Updated Brand',
      tagline: 'The best skin care center'
    };

    const res = await routeJson(handleClinicRoutes, {
      method: 'PATCH',
      path: `/admin/clinics/${clinicId}`,
      authenticateRequest: superAdminAuth,
      body: payload
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.name, payload.name);
    assert.equal(res.body.plan, 'premium');
    assert.equal(res.body.timezone, 'Asia/Singapore');

    // Query DB to verify website settings were updated
    const websiteSettings = await pool.query('select * from clinic_website_settings where clinic_id = $1', [clinicId]);
    assert.equal(websiteSettings.rows[0].public_display_name, 'Super Updated Brand');
    assert.equal(websiteSettings.rows[0].tagline, 'The best skin care center');
  });

  await t.test('9. Toggle clinic status', async () => {
    const clinicId = createdClinicIds[0];
    
    // Inactive toggle
    const res = await routeJson(handleClinicRoutes, {
      method: 'PATCH',
      path: `/admin/clinics/${clinicId}/status`,
      authenticateRequest: superAdminAuth,
      body: { status: 'inactive' }
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, 'inactive');

    // Verify website status is inactive
    const websiteSettings = await pool.query('select * from clinic_website_settings where clinic_id = $1', [clinicId]);
    assert.equal(websiteSettings.rows[0].website_status, 'inactive');

    // Invalid status validation
    const resInvalid = await routeJson(handleClinicRoutes, {
      method: 'PATCH',
      path: `/admin/clinics/${clinicId}/status`,
      authenticateRequest: superAdminAuth,
      body: { status: 'suspended' }
    });
    assert.equal(resInvalid.statusCode, 400);
    assert.equal(resInvalid.body.error.code, 'INVALID_CLINIC_STATUS');
  });

  await t.test('10. Audit log tracking', async () => {
    const clinicId = createdClinicIds[0];
    const auditResult = await pool.query(
      'select action_type, context_json from audit_logs where clinic_id = $1 order by id asc',
      [clinicId]
    );

    assert.ok(auditResult.rowCount >= 3);
    assert.equal(auditResult.rows[0].action_type, 'clinic.created');
    assert.equal(auditResult.rows[0].context_json.source, 'super_admin_clinic_api');
    assert.equal(auditResult.rows[1].action_type, 'clinic.updated');
    assert.equal(auditResult.rows[2].action_type, 'clinic.status_changed');
  });
});
