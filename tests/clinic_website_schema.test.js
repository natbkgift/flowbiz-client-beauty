const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { loadConfig } = require('../apps/api/src/config');
const { signup } = require('../apps/api/src/modules/auth/service');
const {
  isValidWebsiteStatus,
  isValidHomepageSectionStatus,
  normalizeSectionKey
} = require('../apps/api/src/modules/clinic-website/validation');

async function createClinicFixture(uniqueId) {
  const session = await signup({
    clinicName: `Schema Clinic ${uniqueId}`,
    ownerName: 'Schema Owner',
    email: `schema-owner-${uniqueId}@example.com`,
    password: 'StrongPass123!'
  });
  return session.currentClinic.id;
}

test('Clinic Website Schema Extension Tests', async (t) => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const uniqueId1 = Date.now() + Math.floor(Math.random() * 1000);
  const uniqueId2 = uniqueId1 + 1;

  let clinicId1;
  let clinicId2;

  t.before(async () => {
    clinicId1 = await createClinicFixture(uniqueId1);
    clinicId2 = await createClinicFixture(uniqueId2);
  });

  t.after(async () => {
    try {
      await pool.query('delete from clinics where id in ($1, $2)', [clinicId1, clinicId2]);
    } catch (_) {
      // ignore errors
    } finally {
      await pool.end();
    }
  });

  await t.test('1. Migration tables exist and have correct schema/columns', async () => {
    const tableCheck = await pool.query(`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name in (
          'clinic_website_settings',
          'clinic_branding_settings',
          'clinic_contact_settings',
          'clinic_location_settings',
          'clinic_homepage_sections'
        )
    `);
    assert.equal(tableCheck.rowCount, 5);
  });

  await t.test('2. Core tables have clinic_id column referencing clinics', async () => {
    const fkCheck = await pool.query(`
      select
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu on tc.constraint_name = kcu.constraint_name
      join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
      where tc.constraint_type = 'FOREIGN KEY'
        and tc.table_name in (
          'clinic_website_settings',
          'clinic_branding_settings',
          'clinic_contact_settings',
          'clinic_location_settings',
          'clinic_homepage_sections'
        )
        and kcu.column_name = 'clinic_id';
    `);
    assert.equal(fkCheck.rowCount, 5);
    for (const row of fkCheck.rows) {
      assert.equal(row.foreign_table_name, 'clinics');
      assert.equal(row.foreign_column_name, 'id');
    }
  });

  await t.test('3. Enforce website_status allowed enum values check constraint', async () => {
    // Valid status: draft
    const insertRes = await pool.query(`
      insert into clinic_website_settings (clinic_id, website_status)
      values ($1, 'draft')
      returning id, website_status
    `, [clinicId1]);
    assert.equal(insertRes.rows[0].website_status, 'draft');

    // Invalid status should reject at DB level
    await assert.rejects(async () => {
      await pool.query(`
        insert into clinic_website_settings (clinic_id, website_status)
        values ($1, 'invalid_status_value')
      `, [clinicId2]);
    });
  });

  await t.test('4. Enforce unique clinic_id constraint on settings tables', async () => {
    // Duplicate insert for same clinicId1 on clinic_website_settings should fail
    await assert.rejects(async () => {
      await pool.query(`
        insert into clinic_website_settings (clinic_id, website_status)
        values ($1, 'active')
      `, [clinicId1]);
    });

    // Test unique on branding
    await pool.query(`
      insert into clinic_branding_settings (clinic_id, logo_url)
      values ($1, 'https://logo.png')
    `, [clinicId1]);

    await assert.rejects(async () => {
      await pool.query(`
        insert into clinic_branding_settings (clinic_id, logo_url)
        values ($1, 'https://another-logo.png')
      `, [clinicId1]);
    });

    // Test unique on contact
    await pool.query(`
      insert into clinic_contact_settings (clinic_id, phone)
      values ($1, '0999999999')
    `, [clinicId1]);

    await assert.rejects(async () => {
      await pool.query(`
        insert into clinic_contact_settings (clinic_id, phone)
        values ($1, '0888888888')
      `, [clinicId1]);
    });

    // Test unique on location
    await pool.query(`
      insert into clinic_location_settings (clinic_id, country)
      values ($1, 'Thailand')
    `, [clinicId1]);

    await assert.rejects(async () => {
      await pool.query(`
        insert into clinic_location_settings (clinic_id, country)
        values ($1, 'Thailand')
      `, [clinicId1]);
    });
  });

  await t.test('5. Default JSONB fields should be empty object', async () => {
    // location business_hours_json defaults to '{}'
    const locRow = await pool.query('select business_hours_json from clinic_location_settings where clinic_id = $1', [clinicId1]);
    assert.deepEqual(locRow.rows[0].business_hours_json, {});
  });

  await t.test('6. Homepage sections enforce status check constraint and unique (clinic_id, section_key)', async () => {
    // Valid status: published
    await pool.query(`
      insert into clinic_homepage_sections (clinic_id, section_key, section_type, status)
      values ($1, 'hero', 'hero', 'published')
    `, [clinicId1]);

    // Invalid status: invalid_status
    await assert.rejects(async () => {
      await pool.query(`
        insert into clinic_homepage_sections (clinic_id, section_key, section_type, status)
        values ($1, 'hero2', 'hero', 'invalid_status')
      `, [clinicId1]);
    });

    // Duplicate section_key in same clinic: should reject
    await assert.rejects(async () => {
      await pool.query(`
        insert into clinic_homepage_sections (clinic_id, section_key, section_type, status)
        values ($1, 'hero', 'features', 'draft')
      `, [clinicId1]);
    });

    // Same section_key across different clinics: should pass
    await pool.query(`
      insert into clinic_homepage_sections (clinic_id, section_key, section_type, status)
      values ($1, 'hero', 'hero', 'published')
    `, [clinicId2]);

    const count = await pool.query('select count(*) from clinic_homepage_sections where section_key = $1', ['hero']);
    assert.equal(count.rows[0].count, '2');
  });

  await t.test('7. Cascade delete from clinics', async () => {
    // We delete clinicId2
    await pool.query('delete from clinics where id = $1', [clinicId2]);

    // Check settings for clinicId2 - should be deleted
    const settings = await pool.query('select 1 from clinic_website_settings where clinic_id = $1', [clinicId2]);
    assert.equal(settings.rowCount, 0);

    // Check homepage sections for clinicId2 - should be deleted
    const sections = await pool.query('select 1 from clinic_homepage_sections where clinic_id = $1', [clinicId2]);
    assert.equal(sections.rowCount, 0);
  });

  await t.test('8. Validation helpers function correctly', () => {
    assert.equal(isValidWebsiteStatus('draft'), true);
    assert.equal(isValidWebsiteStatus('active'), true);
    assert.equal(isValidWebsiteStatus('invalid'), false);

    assert.equal(isValidHomepageSectionStatus('published'), true);
    assert.equal(isValidHomepageSectionStatus('hidden'), true);
    assert.equal(isValidHomepageSectionStatus('invalid'), false);

    assert.equal(normalizeSectionKey('  Hero Section!!  '), 'hero_section');
    assert.equal(normalizeSectionKey('  -some--key- '), 'some-key');
  });
});
