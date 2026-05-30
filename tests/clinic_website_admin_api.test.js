const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { loadConfig } = require('../apps/api/src/config');
const { AppError } = require('../apps/api/src/common/errors');
const { json } = require('../apps/api/src/common/http');
const { handleClinicWebsiteRoutes } = require('../apps/api/src/modules/clinic-website/routes');

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
  return {
    handled,
    statusCode: response.statusCode,
    body: parsedBody
  };
}

test('Clinic Website Admin API - Integration Tests', async (t) => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const uniqueId = Date.now() + Math.floor(Math.random() * 1000);

  let testClinicId1;
  let testClinicId2;
  let testOwnerUserId;
  let testStaffUserId;

  t.before(async () => {
    // 1. Create two test clinics
    const clinic1 = await pool.query(
      "insert into clinics (name, slug, plan, status) values ($1, $2, 'starter', 'active') returning id",
      [`Test Clinic A ${uniqueId}`, `test-clinic-a-${uniqueId}`]
    );
    testClinicId1 = Number(clinic1.rows[0].id);

    const clinic2 = await pool.query(
      "insert into clinics (name, slug, plan, status) values ($1, $2, 'starter', 'active') returning id",
      [`Test Clinic B ${uniqueId}`, `test-clinic-b-${uniqueId}`]
    );
    testClinicId2 = Number(clinic2.rows[0].id);

    // 2. Create users
    const ownerUser = await pool.query(
      "insert into users (email, name, password_hash, status) values ($1, $2, 'hash', 'active') returning id",
      [`owner-${uniqueId}@flowbiz.local`, 'Clinic Owner']
    );
    testOwnerUserId = Number(ownerUser.rows[0].id);

    const staffUser = await pool.query(
      "insert into users (email, name, password_hash, status) values ($1, $2, 'hash', 'active') returning id",
      [`staff-${uniqueId}@flowbiz.local`, 'Clinic Staff']
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

  // Mocks for different auth contexts
  const ownerAuthClinic1 = async () => ({
    currentUser: { id: testOwnerUserId, email: `owner-${uniqueId}@flowbiz.local` },
    currentClinic: { id: testClinicId1, slug: `test-clinic-a-${uniqueId}` },
    currentMembership: { role: 'owner', permissions: [] }
  });

  const ownerAuthClinic2 = async () => ({
    currentUser: { id: testOwnerUserId, email: `owner-${uniqueId}@flowbiz.local` },
    currentClinic: { id: testClinicId2, slug: `test-clinic-b-${uniqueId}` },
    currentMembership: { role: 'owner', permissions: [] }
  });

  const staffAuthClinic1 = async () => ({
    currentUser: { id: testStaffUserId, email: `staff-${uniqueId}@flowbiz.local` },
    currentClinic: { id: testClinicId1, slug: `test-clinic-a-${uniqueId}` },
    currentMembership: { role: 'staff', permissions: [] }
  });

  const anonymousAuth = async () => {
    throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.');
  };

  await t.test('1. Auth required for endpoints', async () => {
    const res = await routeJson(handleClinicWebsiteRoutes, {
      method: 'GET',
      path: '/admin/clinic-website',
      authenticateRequest: anonymousAuth
    });
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error.code, 'AUTH_REQUIRED');
  });

  await t.test('2. Owner can GET website editor payload with default entities', async () => {
    const res = await routeJson(handleClinicWebsiteRoutes, {
      method: 'GET',
      path: '/admin/clinic-website',
      authenticateRequest: ownerAuthClinic1
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.clinic.id, testClinicId1);
    assert.equal(res.body.websiteSettings.websiteStatus, 'draft');
    assert.deepEqual(res.body.homepageSections, []);
  });

  await t.test('3. Owner can PATCH website settings', async () => {
    const payload = {
      publicDisplayName: 'Brand Name',
      tagline: 'Premium Aesthetics',
      shortDescription: 'Modern clinic offering facial treatments.',
      websiteStatus: 'active',
      defaultLocale: 'th-TH'
    };

    const res = await routeJson(handleClinicWebsiteRoutes, {
      method: 'PATCH',
      path: '/admin/clinic-website/settings',
      authenticateRequest: ownerAuthClinic1,
      body: payload
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.publicDisplayName, 'Brand Name');
    assert.equal(res.body.websiteStatus, 'active');
    assert.ok(res.body.publishedAt);
  });

  await t.test('4. Owner can PATCH branding settings with valid HEX colors & safe URLs', async () => {
    const payload = {
      logoUrl: 'https://cdn.local/logo.png',
      heroImageUrl: 'http://cdn.local/hero.jpg',
      primaryColor: '#0F766E',
      secondaryColor: '#FFF',
      accentColor: '#FFFFFF33'
    };

    const res = await routeJson(handleClinicWebsiteRoutes, {
      method: 'PATCH',
      path: '/admin/clinic-website/branding',
      authenticateRequest: ownerAuthClinic1,
      body: payload
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.primaryColor, '#0F766E');
    assert.equal(res.body.logoUrl, 'https://cdn.local/logo.png');
  });

  await t.test('5. Reject invalid color formats', async () => {
    const payload = {
      primaryColor: 'red', // not hex
    };

    const res = await routeJson(handleClinicWebsiteRoutes, {
      method: 'PATCH',
      path: '/admin/clinic-website/branding',
      authenticateRequest: ownerAuthClinic1,
      body: payload
    });

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.code, 'INVALID_COLOR');
  });

  await t.test('6. Reject unsafe URL formats', async () => {
    const payload = {
      logoUrl: 'javascript:alert(1)', // unsafe protocol
    };

    const res = await routeJson(handleClinicWebsiteRoutes, {
      method: 'PATCH',
      path: '/admin/clinic-website/branding',
      authenticateRequest: ownerAuthClinic1,
      body: payload
    });

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.code, 'INVALID_URL');
  });

  await t.test('7. Owner can PATCH contact settings', async () => {
    const payload = {
      phone: '0987654321',
      email: 'clinic@local.com',
      lineUrl: 'https://line.me/ti/p/test'
    };

    const res = await routeJson(handleClinicWebsiteRoutes, {
      method: 'PATCH',
      path: '/admin/clinic-website/contact',
      authenticateRequest: ownerAuthClinic1,
      body: payload
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.phone, '0987654321');
    assert.equal(res.body.email, 'clinic@local.com');
  });

  await t.test('8. Owner can PATCH location settings', async () => {
    const payload = {
      addressLine1: '123 Main St',
      province: 'Bangkok',
      googleMapUrl: 'https://maps.google.com/test',
      latitude: 13.7563,
      longitude: 100.5018,
      businessHours: { mon: '09:00 - 20:00' }
    };

    const res = await routeJson(handleClinicWebsiteRoutes, {
      method: 'PATCH',
      path: '/admin/clinic-website/location',
      authenticateRequest: ownerAuthClinic1,
      body: payload
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.province, 'Bangkok');
    assert.equal(res.body.latitude, 13.7563);
    assert.deepEqual(res.body.businessHours, { mon: '09:00 - 20:00' });
  });

  await t.test('8b. Reject invalid businessHours structure', async () => {
    const payload = {
      businessHours: '09:00 - 20:00' // not a JSON object
    };

    const res = await routeJson(handleClinicWebsiteRoutes, {
      method: 'PATCH',
      path: '/admin/clinic-website/location',
      authenticateRequest: ownerAuthClinic1,
      body: payload
    });

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.code, 'INVALID_BUSINESS_HOURS');
  });

  let createdSectionId;

  await t.test('9. Owner can create / update / reorder homepage sections', async () => {
    // Create Section
    const createPayload = {
      sectionKey: 'about_us',
      sectionType: 'about',
      title: 'About Us',
      subtitle: 'Our Story',
      content: { text: 'Welcome to our clinic' },
      status: 'published'
    };

    const createRes = await routeJson(handleClinicWebsiteRoutes, {
      method: 'POST',
      path: '/admin/clinic-website/sections',
      authenticateRequest: ownerAuthClinic1,
      body: createPayload
    });

    assert.equal(createRes.statusCode, 201);
    assert.ok(createRes.body.id);
    assert.equal(createRes.body.sectionKey, 'about_us');
    assert.deepEqual(createRes.body.content, { text: 'Welcome to our clinic' });

    createdSectionId = createRes.body.id;

    // Reject invalid section key (resulting in empty normalized key)
    const invalidKeyRes = await routeJson(handleClinicWebsiteRoutes, {
      method: 'POST',
      path: '/admin/clinic-website/sections',
      authenticateRequest: ownerAuthClinic1,
      body: {
        ...createPayload,
        sectionKey: '!!!'
      }
    });
    assert.equal(invalidKeyRes.statusCode, 400);
    assert.equal(invalidKeyRes.body.error.code, 'INVALID_SECTION_KEY');

    // Update Section
    const updatePayload = {
      title: 'Our Premium Story',
      content: { text: 'Welcome to our beautiful clinic' }
    };

    const updateRes = await routeJson(handleClinicWebsiteRoutes, {
      method: 'PATCH',
      path: `/admin/clinic-website/sections/${createdSectionId}`,
      authenticateRequest: ownerAuthClinic1,
      body: updatePayload
    });

    assert.equal(updateRes.statusCode, 200);
    assert.equal(updateRes.body.title, 'Our Premium Story');
    assert.deepEqual(updateRes.body.content, { text: 'Welcome to our beautiful clinic' });

    // Reorder Sections
    const reorderPayload = {
      sections: [
        { id: createdSectionId, sortOrder: 5 }
      ]
    };

    const reorderRes = await routeJson(handleClinicWebsiteRoutes, {
      method: 'PATCH',
      path: '/admin/clinic-website/sections/reorder',
      authenticateRequest: ownerAuthClinic1,
      body: reorderPayload
    });

    assert.equal(reorderRes.statusCode, 200);
    assert.equal(reorderRes.body.success, true);

    // A. Reorder non-existent section ID (404)
    const reorder404Res = await routeJson(handleClinicWebsiteRoutes, {
      method: 'PATCH',
      path: '/admin/clinic-website/sections/reorder',
      authenticateRequest: ownerAuthClinic1,
      body: {
        sections: [
          { id: 999999, sortOrder: 1 }
        ]
      }
    });
    assert.equal(reorder404Res.statusCode, 404);
    assert.equal(reorder404Res.body.error.code, 'SECTION_NOT_FOUND');

    // B. Reorder cross-tenant section ID (403)
    const reorder403Res = await routeJson(handleClinicWebsiteRoutes, {
      method: 'PATCH',
      path: '/admin/clinic-website/sections/reorder',
      authenticateRequest: ownerAuthClinic2, // Clinic 2 tries to reorder Clinic 1's section
      body: {
        sections: [
          { id: createdSectionId, sortOrder: 2 }
        ]
      }
    });
    assert.equal(reorder403Res.statusCode, 403);
    assert.equal(reorder403Res.body.error.code, 'CROSS_TENANT_FORBIDDEN');

    // C. DELETE section API test
    const deleteRes = await routeJson(handleClinicWebsiteRoutes, {
      method: 'DELETE',
      path: `/admin/clinic-website/sections/${createdSectionId}`,
      authenticateRequest: ownerAuthClinic1
    });
    assert.equal(deleteRes.statusCode, 200);
    assert.equal(deleteRes.body.success, true);

    // Assert section was actually deleted from database
    const dbCheck = await pool.query('select 1 from clinic_homepage_sections where id = $1', [createdSectionId]);
    assert.equal(dbCheck.rowCount, 0);

    // Assert audit log has clinic_section.deleted
    const auditCheck = await pool.query(
      'select entity_id from audit_logs where clinic_id = $1 and action_type = $2 limit 1',
      [testClinicId1, 'clinic_section.deleted']
    );
    assert.equal(auditCheck.rowCount, 1);
  });

  await t.test('10. Staff without permission gets 403 on write', async () => {
    const payload = {
      publicDisplayName: 'Staff Hack Brand'
    };

    const res = await routeJson(handleClinicWebsiteRoutes, {
      method: 'PATCH',
      path: '/admin/clinic-website/settings',
      authenticateRequest: staffAuthClinic1,
      body: payload
    });

    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error.code, 'INSUFFICIENT_PERMISSIONS');
  });

  await t.test('11. Cross-tenant write is impossible (clinic resolved strictly from session context)', async () => {
    // If a user tries to modify and passes clinicId in the body or query, it is rejected or ignored.
    const payload = {
      clinicId: testClinicId2, // attempts to target Clinic 2
      publicDisplayName: 'Hijack Display Name'
    };

    const res = await routeJson(handleClinicWebsiteRoutes, {
      method: 'PATCH',
      path: '/admin/clinic-website/settings',
      authenticateRequest: ownerAuthClinic1, // session context is testClinicId1
      body: payload
    });

    // It should either reject with 400 (which we do if body.clinicId is passed)
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.code, 'INVALID_REQUEST');

    // Verify that Clinic 2 settings were never written to
    const checkClinic2 = await pool.query('select * from clinic_website_settings where clinic_id = $1 limit 1', [testClinicId2]);
    assert.equal(checkClinic2.rowCount, 0);
  });

  await t.test('12. Audit logs are generated for write actions', async () => {
    const auditRes = await pool.query(
      'select action_type from audit_logs where clinic_id = $1 order by id asc',
      [testClinicId1]
    );

    assert.ok(auditRes.rowCount >= 4);
    const actions = auditRes.rows.map(r => r.action_type);
    assert.ok(actions.includes('clinic_website.updated'));
    assert.ok(actions.includes('clinic_branding.updated'));
    assert.ok(actions.includes('clinic_contact.updated'));
    assert.ok(actions.includes('clinic_location.updated'));
    assert.ok(actions.includes('clinic_section.created'));
    assert.ok(actions.includes('clinic_section.updated'));
    assert.ok(actions.includes('clinic_sections.reordered'));
  });
});
