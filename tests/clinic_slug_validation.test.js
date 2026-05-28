const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { loadConfig } = require('../apps/api/src/config');
const { signup } = require('../apps/api/src/modules/onboarding/service');
const { AppError } = require('../apps/api/src/common/errors');
const {
  normalizeClinicSlug,
  isReservedClinicSlug,
  isValidClinicSlug,
  assertValidClinicSlug
} = require('../apps/api/src/modules/clinics/validation');

test('Clinic Slug Validation - Pure Helper Tests', (t) => {
  // normalizeClinicSlug
  assert.equal(normalizeClinicSlug(' Clinic Alpha '), 'clinic-alpha');
  assert.equal(normalizeClinicSlug('Clinic   Alpha!!'), 'clinic-alpha');
  assert.equal(normalizeClinicSlug('clinic_alpha'), 'clinic-alpha');
  assert.equal(normalizeClinicSlug(''), '');
  assert.equal(normalizeClinicSlug(null), '');

  // isValidClinicSlug
  assert.equal(isValidClinicSlug('clinic-alpha'), true);
  assert.equal(isValidClinicSlug('clinic123'), true);
  assert.equal(isValidClinicSlug(''), false);
  assert.equal(isValidClinicSlug('a'.repeat(81)), false);
  assert.equal(isValidClinicSlug('a'.repeat(80)), true);
  assert.equal(isValidClinicSlug('clinic/alpha'), false);
  assert.equal(isValidClinicSlug('clinic.alpha'), false);
  assert.equal(isValidClinicSlug('clinic alpha'), false);
  assert.equal(isValidClinicSlug('-clinic'), false);
  assert.equal(isValidClinicSlug('clinic-'), false);
  assert.equal(isValidClinicSlug('clinic--alpha'), false);

  // isReservedClinicSlug
  assert.equal(isReservedClinicSlug('admin'), true);
  assert.equal(isReservedClinicSlug('api'), true);
  assert.equal(isReservedClinicSlug('auth'), true);
  assert.equal(isReservedClinicSlug('assets'), true);
  assert.equal(isReservedClinicSlug('health'), true);
  assert.equal(isReservedClinicSlug('healthz'), true);
  assert.equal(isReservedClinicSlug('live'), true);
  assert.equal(isReservedClinicSlug('ready'), true);
  assert.equal(isReservedClinicSlug('sitemap.xml'), true);
  assert.equal(isReservedClinicSlug('robots.txt'), true);
  assert.equal(isReservedClinicSlug('blog'), true);
  assert.equal(isReservedClinicSlug('forum'), true);
  assert.equal(isReservedClinicSlug('dashboard'), true);
  assert.equal(isReservedClinicSlug('my-clinic'), false);

  // assertValidClinicSlug
  assert.doesNotThrow(() => assertValidClinicSlug('my-clinic'));
  assert.throws(() => assertValidClinicSlug('admin'), (err) => {
    return err instanceof AppError && err.code === 'RESERVED_CLINIC_SLUG' && err.statusCode === 400;
  });
  assert.throws(() => assertValidClinicSlug('clinic/alpha'), (err) => {
    return err instanceof AppError && err.code === 'INVALID_CLINIC_SLUG' && err.statusCode === 400;
  });
});

test('Clinic Slug Validation - Onboarding Integration Tests', async (t) => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const uniqueId = Date.now();
  const createdClinicIds = [];
  const createdUserIds = [];

  t.after(async () => {
    try {
      if (createdClinicIds.length > 0) {
        await pool.query('delete from clinics where id = any($1)', [createdClinicIds]);
      }
      if (createdUserIds.length > 0) {
        await pool.query('delete from users where id = any($1)', [createdUserIds]);
      }
    } catch (err) {
      console.error('Clean up failed:', err);
    } finally {
      await pool.end();
    }
  });

  await t.test('1. Normal signup creates valid slug', async () => {
    const session = await signup({
      clinicName: `Clinic Alpha ${uniqueId}`,
      ownerName: 'Owner One',
      email: `owner-one-${uniqueId}@example.com`,
      password: 'StrongPass123!'
    });

    createdClinicIds.push(session.currentClinic.id);
    createdUserIds.push(session.user.id);

    assert.ok(session.currentClinic.slug.startsWith('clinic-alpha-'));
  });

  await t.test('2. Signup same clinicName twice appends suffix', async () => {
    const name = `Clinic Duplicate ${uniqueId}`;

    const session1 = await signup({
      clinicName: name,
      ownerName: 'Owner Two A',
      email: `owner-two-a-${uniqueId}@example.com`,
      password: 'StrongPass123!'
    });
    createdClinicIds.push(session1.currentClinic.id);
    createdUserIds.push(session1.user.id);

    const session2 = await signup({
      clinicName: name,
      ownerName: 'Owner Two B',
      email: `owner-two-b-${uniqueId}@example.com`,
      password: 'StrongPass123!'
    });
    createdClinicIds.push(session2.currentClinic.id);
    createdUserIds.push(session2.user.id);

    assert.notEqual(session1.currentClinic.slug, session2.currentClinic.slug);
    assert.ok(session2.currentClinic.slug.includes(session1.currentClinic.slug));
  });

  await t.test('3. Signup with reserved names rejects with RESERVED_CLINIC_SLUG and does not leave orphan records', async () => {
    const reservedNames = ['Admin', 'API', 'Healthz'];

    for (const name of reservedNames) {
      const email = `rejected-owner-${name.toLowerCase()}-${uniqueId}@example.com`;

      await assert.rejects(
        async () => {
          await signup({
            clinicName: name,
            ownerName: 'Admin Owner',
            email,
            password: 'StrongPass123!'
          });
        },
        (err) => {
          return err instanceof AppError && err.code === 'RESERVED_CLINIC_SLUG' && err.statusCode === 400;
        }
      );

      // Verify no user record was created
      const userCheck = await pool.query('select 1 from users where email = $1', [email]);
      assert.equal(userCheck.rowCount, 0);

      // Verify no clinic record was created
      const clinicCheck = await pool.query('select 1 from clinics where slug = $1', [name.toLowerCase()]);
      assert.equal(clinicCheck.rowCount, 0);
    }
  });
});
