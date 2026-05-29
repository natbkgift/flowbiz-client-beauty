const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { loadConfig } = require('../apps/api/src/config');
const { AppError } = require('../apps/api/src/common/errors');
const { json } = require('../apps/api/src/common/http');
const { handlePublicContentRoutes } = require('../apps/api/src/modules/public-content/routes');
const { resolvePublicClinicId, resolvePublicClinicContext } = require('../apps/api/src/modules/public-content/tenant');
const { getPublicClinicBySlug } = require('../apps/api/src/modules/public-content/clinic-resolver');

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

async function routeJson(handler, { method = 'GET', path, body = {} }) {
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
          throw new AppError(401, 'AUTH_REQUIRED', 'Not authenticated.');
        },
        parseJsonBody: async () => body,
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
      response.end(JSON.stringify({ error: { code: 'INTERNAL_SERVER_ERROR', message: err.message } }));
    }
    handled = true;
  }

  const parsedBody = response.body ? JSON.parse(response.body) : null;
  if (response.statusCode >= 400) {
    console.error('API Error Response:', response.statusCode, parsedBody);
  }
  return { handled, statusCode: response.statusCode, body: parsedBody };
}

test('PR5 - Public Clinic Slug Resolver API', async (t) => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const uniqueId = Date.now() + Math.floor(Math.random() * 1000);
  const createdClinicIds = [];

  // Track clinic slugs for cleanup
  let activeClinicId;
  let activeClinicSlug;
  let inactiveClinicId;
  let inactiveClinicSlug;
  let noSettingsClinicId;
  let noSettingsClinicSlug;
  let draftWebsiteClinicId;
  let draftWebsiteClinicSlug;

  t.before(async () => {
    // 1. Active clinic with full settings
    activeClinicSlug = `pr5-active-${uniqueId}`;
    const activeRes = await pool.query(
      `insert into clinics (name, slug, plan, status, timezone) values ($1, $2, 'starter', 'active', 'Asia/Bangkok') returning id`,
      [`PR5 Active Clinic ${uniqueId}`, activeClinicSlug]
    );
    activeClinicId = Number(activeRes.rows[0].id);
    createdClinicIds.push(activeClinicId);

    // Insert all settings for active clinic
    await pool.query(
      `insert into clinic_website_settings (clinic_id, website_status, public_display_name, tagline, short_description, default_locale)
       values ($1, 'active', $2, 'Best Beauty', 'Short desc', 'th-TH')`,
      [activeClinicId, `PR5 Active Clinic ${uniqueId}`]
    );
    await pool.query(
      `insert into clinic_branding_settings (clinic_id, primary_color, font_family) values ($1, '#ff0000', 'Inter')`,
      [activeClinicId]
    );
    await pool.query(
      `insert into clinic_contact_settings (clinic_id, phone, email) values ($1, '0812345678', 'test@clinic.com')`,
      [activeClinicId]
    );
    await pool.query(
      `insert into clinic_location_settings (clinic_id, province, country, business_hours_json) values ($1, 'Bangkok', 'Thailand', '{"mon":"09:00-18:00"}')`,
      [activeClinicId]
    );
    // Insert sections in non-sequential sort order to test ordering
    await pool.query(
      `insert into clinic_homepage_sections (clinic_id, section_key, section_type, title, sort_order, status, content_json)
       values ($1, 'hero', 'hero', 'Welcome', 1, 'published', '{}'),
              ($1, 'location', 'location', 'Our Location', 3, 'draft', '{}'),
              ($1, 'hidden_sec', 'info', 'Hidden Section', 2, 'hidden', '{}')`,
      [activeClinicId]
    );

    // 2. Inactive clinic
    inactiveClinicSlug = `pr5-inactive-${uniqueId}`;
    const inactiveRes = await pool.query(
      `insert into clinics (name, slug, plan, status, timezone) values ($1, $2, 'starter', 'inactive', 'Asia/Bangkok') returning id`,
      [`PR5 Inactive Clinic ${uniqueId}`, inactiveClinicSlug]
    );
    inactiveClinicId = Number(inactiveRes.rows[0].id);
    createdClinicIds.push(inactiveClinicId);

    // 3. Active clinic with NO website settings rows (legacy/bare clinic)
    noSettingsClinicSlug = `pr5-nosettings-${uniqueId}`;
    const noSettingsRes = await pool.query(
      `insert into clinics (name, slug, plan, status, timezone) values ($1, $2, 'starter', 'active', 'Asia/Bangkok') returning id`,
      [`PR5 NoSettings Clinic ${uniqueId}`, noSettingsClinicSlug]
    );
    noSettingsClinicId = Number(noSettingsRes.rows[0].id);
    createdClinicIds.push(noSettingsClinicId);

    // 4. Active clinic with draft website status
    draftWebsiteClinicSlug = `pr5-draft-${uniqueId}`;
    const draftRes = await pool.query(
      `insert into clinics (name, slug, plan, status, timezone) values ($1, $2, 'starter', 'active', 'Asia/Bangkok') returning id`,
      [`PR5 Draft Website Clinic ${uniqueId}`, draftWebsiteClinicSlug]
    );
    draftWebsiteClinicId = Number(draftRes.rows[0].id);
    createdClinicIds.push(draftWebsiteClinicId);

    await pool.query(
      `insert into clinic_website_settings (clinic_id, website_status, default_locale) values ($1, 'draft', 'th-TH')`,
      [draftWebsiteClinicId]
    );
  });

  t.after(async () => {
    try {
      if (createdClinicIds.length > 0) {
        await pool.query('delete from clinics where id = any($1)', [createdClinicIds]);
      }
    } catch (err) {
      console.error('Test cleanup failed:', err);
    } finally {
      await pool.end();
    }
  });

  // =========================================================================
  // 1. Resolve active clinic by slug
  // =========================================================================
  await t.test('1. GET /public/clinics/:slug - active clinic returns 200', async () => {
    const res = await routeJson(handlePublicContentRoutes, {
      method: 'GET',
      path: `/public/clinics/${activeClinicSlug}`
    });

    assert.equal(res.statusCode, 200);
    assert.ok(res.body.clinic, 'should have clinic key');
    assert.equal(res.body.clinic.slug, activeClinicSlug);
    assert.equal(res.body.clinic.status, 'active');
    assert.equal(res.body.clinic.plan, 'starter');
    assert.equal(res.body.clinic.timezone, 'Asia/Bangkok');
  });

  await t.test('1b. Response has websiteSettings', async () => {
    const res = await routeJson(handlePublicContentRoutes, {
      method: 'GET',
      path: `/public/clinics/${activeClinicSlug}`
    });
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.websiteSettings, 'should have websiteSettings');
    assert.equal(res.body.websiteSettings.websiteStatus, 'active');
    assert.ok(res.body.websiteSettings.publicDisplayName);
  });

  await t.test('1c. Response has brandingSettings', async () => {
    const res = await routeJson(handlePublicContentRoutes, {
      method: 'GET',
      path: `/public/clinics/${activeClinicSlug}`
    });
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.brandingSettings, 'should have brandingSettings');
    assert.equal(res.body.brandingSettings.primaryColor, '#ff0000');
    assert.equal(res.body.brandingSettings.fontFamily, 'Inter');
  });

  await t.test('1d. Response has contactSettings', async () => {
    const res = await routeJson(handlePublicContentRoutes, {
      method: 'GET',
      path: `/public/clinics/${activeClinicSlug}`
    });
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.contactSettings, 'should have contactSettings');
    assert.equal(res.body.contactSettings.phone, '0812345678');
    assert.equal(res.body.contactSettings.email, 'test@clinic.com');
  });

  await t.test('1e. Response has locationSettings', async () => {
    const res = await routeJson(handlePublicContentRoutes, {
      method: 'GET',
      path: `/public/clinics/${activeClinicSlug}`
    });
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.locationSettings, 'should have locationSettings');
    assert.equal(res.body.locationSettings.province, 'Bangkok');
    assert.equal(res.body.locationSettings.country, 'Thailand');
    assert.deepStrictEqual(res.body.locationSettings.businessHours, { mon: '09:00-18:00' });
  });

  await t.test('1f. homepageSections ordered by sort_order, hidden excluded', async () => {
    const res = await routeJson(handlePublicContentRoutes, {
      method: 'GET',
      path: `/public/clinics/${activeClinicSlug}`
    });
    assert.equal(res.statusCode, 200);
    const sections = res.body.homepageSections;
    assert.ok(Array.isArray(sections), 'homepageSections should be an array');
    // hidden_sec should be excluded
    assert.ok(!sections.find(s => s.sectionKey === 'hidden_sec'), 'hidden section must be excluded');
    // Should have 2 non-hidden sections
    assert.equal(sections.length, 2);
    // Order: hero(1) before location(3)
    assert.equal(sections[0].sectionKey, 'hero');
    assert.equal(sections[1].sectionKey, 'location');
  });

  await t.test('1g. Response has features flags', async () => {
    const res = await routeJson(handlePublicContentRoutes, {
      method: 'GET',
      path: `/public/clinics/${activeClinicSlug}`
    });
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.features, 'should have features');
    assert.equal(res.body.features.blogEnabled, true);
    assert.equal(res.body.features.forumEnabled, true);
  });

  // =========================================================================
  // 2. Not found scenarios
  // =========================================================================
  await t.test('2a. Unknown slug returns 404', async () => {
    const res = await routeJson(handlePublicContentRoutes, {
      method: 'GET',
      path: `/public/clinics/completely-unknown-clinic-slug-xyz-${uniqueId}`
    });
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error.code, 'CLINIC_NOT_FOUND');
  });

  await t.test('2b. Inactive clinic returns 404', async () => {
    const res = await routeJson(handlePublicContentRoutes, {
      method: 'GET',
      path: `/public/clinics/${inactiveClinicSlug}`
    });
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error.code, 'CLINIC_NOT_FOUND');
  });

  await t.test('2c. Reserved slug "admin" returns 404', async () => {
    const res = await routeJson(handlePublicContentRoutes, {
      method: 'GET',
      path: `/public/clinics/admin`
    });
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error.code, 'CLINIC_NOT_FOUND');
  });

  await t.test('2d. Reserved slug "api" returns 404', async () => {
    const res = await routeJson(handlePublicContentRoutes, {
      method: 'GET',
      path: `/public/clinics/api`
    });
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error.code, 'CLINIC_NOT_FOUND');
  });

  await t.test('2e. Invalid slug with uppercase chars is normalized, then fails if not found', async () => {
    const res = await routeJson(handlePublicContentRoutes, {
      method: 'GET',
      path: `/public/clinics/INVALID__SLUG!!`
    });
    // After normalization, this becomes empty/invalid → 404
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error.code, 'CLINIC_NOT_FOUND');
  });

  // =========================================================================
  // 3. Website renderability flag
  // =========================================================================
  await t.test('3a. active clinic + website_status=active → isPubliclyRenderable=true', async () => {
    const res = await routeJson(handlePublicContentRoutes, {
      method: 'GET',
      path: `/public/clinics/${activeClinicSlug}`
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.isPubliclyRenderable, true);
  });

  await t.test('3b. active clinic + website_status=draft → isPubliclyRenderable=false', async () => {
    const res = await routeJson(handlePublicContentRoutes, {
      method: 'GET',
      path: `/public/clinics/${draftWebsiteClinicSlug}`
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.isPubliclyRenderable, false);
    assert.equal(res.body.websiteSettings.websiteStatus, 'draft');
  });

  // =========================================================================
  // 4. Safe defaults for clinics without settings rows
  // =========================================================================
  await t.test('4a. Active clinic with no settings rows returns 200 with safe defaults', async () => {
    const res = await routeJson(handlePublicContentRoutes, {
      method: 'GET',
      path: `/public/clinics/${noSettingsClinicSlug}`
    });
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.clinic, 'should have clinic');
    assert.equal(res.body.clinic.slug, noSettingsClinicSlug);
  });

  await t.test('4b. Safe default: websiteSettings.websiteStatus = draft', async () => {
    const res = await routeJson(handlePublicContentRoutes, {
      method: 'GET',
      path: `/public/clinics/${noSettingsClinicSlug}`
    });
    assert.equal(res.body.websiteSettings.websiteStatus, 'draft');
    assert.equal(res.body.websiteSettings.defaultLocale, 'th-TH');
  });

  await t.test('4c. Safe default: homepageSections is empty array', async () => {
    const res = await routeJson(handlePublicContentRoutes, {
      method: 'GET',
      path: `/public/clinics/${noSettingsClinicSlug}`
    });
    assert.ok(Array.isArray(res.body.homepageSections), 'homepageSections must be array');
    assert.equal(res.body.homepageSections.length, 0);
  });

  await t.test('4d. Safe default: locationSettings.businessHours is {}', async () => {
    const res = await routeJson(handlePublicContentRoutes, {
      method: 'GET',
      path: `/public/clinics/${noSettingsClinicSlug}`
    });
    assert.deepStrictEqual(res.body.locationSettings.businessHours, {});
    assert.equal(res.body.locationSettings.country, 'Thailand');
  });

  await t.test('4e. Safe default: isPubliclyRenderable=false when no websiteSettings row', async () => {
    const res = await routeJson(handlePublicContentRoutes, {
      method: 'GET',
      path: `/public/clinics/${noSettingsClinicSlug}`
    });
    assert.equal(res.body.isPubliclyRenderable, false);
  });

  // =========================================================================
  // 5. Public tenant helper compatibility
  // =========================================================================
  await t.test('5a. resolvePublicClinicId: clinicId param still resolves (legacy)', async () => {
    const url = new URL(`http://localhost/blog/posts?clinicId=${activeClinicId}`);
    const id = await resolvePublicClinicId(url);
    assert.equal(id, activeClinicId);
  });

  await t.test('5b. resolvePublicClinicId: clinicSlug param resolves to clinic id', async () => {
    const url = new URL(`http://localhost/blog/posts?clinicSlug=${activeClinicSlug}`);
    const id = await resolvePublicClinicId(url);
    assert.equal(id, activeClinicId);
  });

  await t.test('5c. resolvePublicClinicId: missing both params throws PUBLIC_CLINIC_REQUIRED', async () => {
    const url = new URL(`http://localhost/blog/posts`);
    try {
      await resolvePublicClinicId(url);
      assert.fail('Should have thrown');
    } catch (err) {
      assert.ok(err instanceof AppError, 'should be AppError');
      assert.equal(err.code, 'PUBLIC_CLINIC_REQUIRED');
    }
  });

  await t.test('5d. resolvePublicClinicId: inactive clinicSlug throws PUBLIC_CLINIC_REQUIRED', async () => {
    const url = new URL(`http://localhost/blog/posts?clinicSlug=${inactiveClinicSlug}`);
    try {
      await resolvePublicClinicId(url);
      assert.fail('Should have thrown');
    } catch (err) {
      assert.ok(err instanceof AppError, 'should be AppError');
      assert.equal(err.code, 'PUBLIC_CLINIC_REQUIRED');
    }
  });

  await t.test('5e. resolvePublicClinicContext: returns context object with currentClinic.id', async () => {
    const url = new URL(`http://localhost/forum/topics?clinicId=${activeClinicId}`);
    const ctx = await resolvePublicClinicContext(url);
    assert.ok(ctx.currentClinic, 'should have currentClinic');
    assert.equal(ctx.currentClinic.id, activeClinicId);
  });

  await t.test('5f. resolvePublicClinicContext: clinicSlug resolves to context', async () => {
    const url = new URL(`http://localhost/forum/topics?clinicSlug=${activeClinicSlug}`);
    const ctx = await resolvePublicClinicContext(url);
    assert.ok(ctx.currentClinic, 'should have currentClinic');
    assert.equal(ctx.currentClinic.id, activeClinicId);
  });

  // =========================================================================
  // 6. Blog/forum compatibility – tenant helper regression
  // =========================================================================
  await t.test('6a. Tenant helper: clinicId=<id> resolves correctly (blog/forum legacy)', async () => {
    const url = new URL(`http://localhost/blog/posts?clinicId=${activeClinicId}`);
    const id = await resolvePublicClinicId(url);
    assert.equal(typeof id, 'number');
    assert.equal(id, activeClinicId);
  });

  await t.test('6b. Tenant helper: clinicSlug resolves to same id as direct DB lookup', async () => {
    const urlById = new URL(`http://localhost/forum/topics?clinicId=${activeClinicId}`);
    const urlBySlug = new URL(`http://localhost/forum/topics?clinicSlug=${activeClinicSlug}`);
    const idFromId = await resolvePublicClinicId(urlById);
    const idFromSlug = await resolvePublicClinicId(urlBySlug);
    assert.equal(idFromId, idFromSlug, 'both resolution methods should return the same clinic id');
  });

  await t.test('6c. Reserved slug via clinicSlug query throws PUBLIC_CLINIC_REQUIRED', async () => {
    const url = new URL(`http://localhost/blog/posts?clinicSlug=admin`);
    try {
      await resolvePublicClinicId(url);
      assert.fail('Should have thrown');
    } catch (err) {
      assert.ok(err instanceof AppError, 'should be AppError');
      assert.equal(err.code, 'PUBLIC_CLINIC_REQUIRED');
    }
  });

  // =========================================================================
  // 7. Route does not handle non-matching paths
  // =========================================================================
  await t.test('7. Non-matching route returns false (not handled)', async () => {
    const response = createMockResponse();
    const url = new URL('http://localhost/some/other/path');
    const handled = await handlePublicContentRoutes(
      { method: 'GET', headers: {} },
      response,
      url,
      { authenticateRequest: async () => { throw new Error('not called'); }, parseJsonBody: async () => ({}), json }
    );
    assert.equal(handled, false);
  });

  await t.test('7b. POST to /public/clinics/:slug not handled (wrong method)', async () => {
    const response = createMockResponse();
    const url = new URL(`http://localhost/public/clinics/${activeClinicSlug}`);
    const handled = await handlePublicContentRoutes(
      { method: 'POST', headers: {} },
      response,
      url,
      { authenticateRequest: async () => { throw new Error('not called'); }, parseJsonBody: async () => ({}), json }
    );
    assert.equal(handled, false);
  });
});
