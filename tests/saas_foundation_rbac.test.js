const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { loadConfig } = require('../apps/api/src/config');
const { signup } = require('../apps/api/src/modules/onboarding/service');
const { authenticateRequest } = require('../apps/api/src/modules/auth/service');
const { authorize } = require('../apps/api/src/modules/rbac/service');

function buildAuthRequest(token, extraHeaders = {}) {
  return {
    headers: {
      authorization: `Bearer ${token}`,
      ...extraHeaders
    }
  };
}

test('tenant signup provisions organization workspace and default CRM assets', async (t) => {
  const uniqueId = Date.now();
  const session = await signup({
    clinicName: `SaaS Clinic ${uniqueId}`,
    ownerName: 'Tenant Owner',
    email: `tenant-owner-${uniqueId}@example.com`,
    password: 'StrongPass123!'
  });
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });

  t.after(async () => {
    await pool.query('delete from clinics where id = $1', [session.currentClinic.id]);
    await pool.query('delete from users where id = $1', [session.user.id]);
    await pool.end();
  });

  assert.equal(session.currentMembership.role, 'owner');
  assert.ok(session.currentOrganization);
  assert.ok(session.currentWorkspace);
  assert.ok(session.currentMembership.permissions.includes('tenant.manage'));
  assert.ok(session.currentMembership.permissions.includes('automation.manage'));

  const assetResult = await pool.query(
    `
      select
        (select count(*)::int from organizations where clinic_id = $1) as organization_count,
        (select count(*)::int from workspaces where clinic_id = $1) as workspace_count,
        (select count(*)::int from clinic_users where clinic_id = $1 and role = 'owner') as owner_membership_count,
        (select count(*)::int from message_templates where clinic_id = $1) as template_count,
        (select count(*)::int from automation_flows where clinic_id = $1) as flow_count
    `,
    [session.currentClinic.id]
  );

  assert.equal(assetResult.rows[0].organization_count, 1);
  assert.equal(assetResult.rows[0].workspace_count, 1);
  assert.equal(assetResult.rows[0].owner_membership_count, 1);
  assert.equal(assetResult.rows[0].template_count, 7);
  assert.equal(assetResult.rows[0].flow_count, 8);
});

test('RBAC blocks viewer writes while allowing read access', async (t) => {
  const uniqueId = Date.now() + 1;
  const session = await signup({
    clinicName: `Viewer Clinic ${uniqueId}`,
    ownerName: 'Viewer Owner',
    email: `viewer-owner-${uniqueId}@example.com`,
    password: 'StrongPass123!'
  });

  const pool = new Pool({ connectionString: loadConfig().databaseUrl });

  t.after(async () => {
    await pool.query('delete from clinics where id = $1', [session.currentClinic.id]);
    await pool.query('delete from users where id = $1', [session.user.id]);
    await pool.end();
  });

  const viewerRole = await pool.query(`select id from roles where key = 'viewer' limit 1`);

  await pool.query(
    `
      update clinic_users
      set role = 'viewer', role_id = $1, updated_at = now()
      where clinic_id = $2 and user_id = $3
    `,
    [viewerRole.rows[0].id, session.currentClinic.id, session.user.id]
  );

  await pool.query(
    `
      update workspace_memberships
      set role_id = $1, updated_at = now()
      where clinic_id = $2 and user_id = $3 and workspace_id = $4
    `,
    [viewerRole.rows[0].id, session.currentClinic.id, session.user.id, session.currentWorkspace.id]
  );

  const context = await authenticateRequest(buildAuthRequest(session.token));

  assert.equal(context.currentMembership.role, 'viewer');
  assert.ok(context.currentMembership.permissions.includes('analytics.read'));
  assert.ok(!context.currentMembership.permissions.includes('lead.write'));
  assert.doesNotThrow(() => authorize(context, 'analytics', 'read'));
  assert.throws(() => authorize(context, 'lead', 'write'), /Missing permission lead.write/);
});