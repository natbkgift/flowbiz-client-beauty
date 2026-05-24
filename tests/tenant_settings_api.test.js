const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { loadConfig } = require('../apps/api/src/config');
const { signup, authenticateRequest } = require('../apps/api/src/modules/auth/service');
const {
  getTenantSettings,
  updateTenantSettings,
  getOrganizationSettings,
  updateOrganizationSettings,
  getWorkspaceSettings,
  updateWorkspaceSettings
} = require('../apps/api/src/modules/settings/service');

function buildAuthRequest(token, extraHeaders = {}) {
  return {
    headers: {
      authorization: `Bearer ${token}`,
      ...extraHeaders
    }
  };
}

async function createFixture(t) {
  const uniqueId = Date.now() + Math.floor(Math.random() * 1000);
  const ownerSession = await signup({
    clinicName: `Settings Clinic ${uniqueId}`,
    ownerName: 'Settings Owner',
    email: `settings-owner-${uniqueId}@example.com`,
    password: 'StrongPass123!'
  });
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const cleanupUserIds = new Set([ownerSession.user.id]);

  t.after(async () => {
    await pool.query('delete from clinics where id = $1', [ownerSession.currentClinic.id]);

    if (cleanupUserIds.size > 0) {
      await pool.query('delete from users where id = any($1::bigint[])', [[...cleanupUserIds].map((id) => Number(id))]);
    }

    await pool.end();
  });

  const ownerContext = await authenticateRequest(buildAuthRequest(ownerSession.token));

  return {
    pool,
    ownerSession,
    ownerContext,
    async refreshContext(token = ownerSession.token) {
      return authenticateRequest(buildAuthRequest(token));
    },
    registerUser(userId) {
      cleanupUserIds.add(userId);
    }
  };
}

async function setCurrentMembershipRole(pool, context, roleKey) {
  const roleResult = await pool.query('select id from roles where key = $1 limit 1', [roleKey]);
  assert.equal(roleResult.rowCount, 1);
  const roleId = roleResult.rows[0].id;

  await pool.query(
    `
      update workspace_memberships
      set role_id = $1, updated_at = now()
      where clinic_id = $2 and user_id = $3 and workspace_id = $4
    `,
    [roleId, context.currentClinic.id, context.currentUser.id, context.currentWorkspace.id]
  );

  await pool.query(
    `
      update clinic_users
      set role_id = $1, role = $2, updated_at = now()
      where clinic_id = $3 and user_id = $4
    `,
    [roleId, roleKey, context.currentClinic.id, context.currentUser.id]
  );
}

test('tenant settings can be read and updated with audit trail', async (t) => {
  const fixture = await createFixture(t);

  const currentSettings = await getTenantSettings(fixture.ownerContext);
  assert.equal(currentSettings.locale, 'th-TH');

  const updatedSettings = await updateTenantSettings(fixture.ownerContext, {
    timezone: 'Asia/Tokyo',
    locale: 'en-US',
    branding_json: {
      primaryColor: '#1144aa'
    },
    settings_json: {
      featureFlags: {
        smartInsights: true
      }
    }
  });

  assert.equal(updatedSettings.timezone, 'Asia/Tokyo');
  assert.equal(updatedSettings.locale, 'en-US');
  assert.deepEqual(updatedSettings.brandingJson, { primaryColor: '#1144aa' });
  assert.deepEqual(updatedSettings.settingsJson, { featureFlags: { smartInsights: true } });

  const auditRow = await fixture.pool.query(
    `
      select action_type, context_json
      from audit_logs
      where clinic_id = $1 and entity_type = 'tenant' and entity_id = $2
      order by id desc
      limit 1
    `,
    [fixture.ownerContext.currentClinic.id, fixture.ownerContext.currentClinic.id]
  );

  assert.equal(auditRow.rowCount, 1);
  assert.equal(auditRow.rows[0].action_type, 'tenant.settings_updated');
  assert.equal(auditRow.rows[0].context_json.after_json.locale, 'en-US');
});

test('organization settings update supports name slug timezone and settings json', async (t) => {
  const fixture = await createFixture(t);

  const updatedOrganization = await updateOrganizationSettings(
    fixture.ownerContext,
    fixture.ownerContext.currentOrganization.id,
    {
      name: 'Operations HQ',
      slug: 'operations-hq',
      timezone: 'Europe/London',
      settings_json: {
        onboardingMode: 'guided'
      }
    }
  );

  assert.equal(updatedOrganization.name, 'Operations HQ');
  assert.equal(updatedOrganization.slug, 'operations-hq');
  assert.equal(updatedOrganization.timezone, 'Europe/London');
  assert.deepEqual(updatedOrganization.settingsJson, { onboardingMode: 'guided' });

  const fetchedOrganization = await getOrganizationSettings(fixture.ownerContext, fixture.ownerContext.currentOrganization.id);
  assert.equal(fetchedOrganization.slug, 'operations-hq');
});

test('workspace settings update supports name slug timezone and settings json', async (t) => {
  const fixture = await createFixture(t);

  const updatedWorkspace = await updateWorkspaceSettings(
    fixture.ownerContext,
    fixture.ownerContext.currentWorkspace.id,
    {
      name: 'Marketing Hub',
      slug: 'marketing-hub',
      timezone: 'America/New_York',
      settings_json: {
        kanbanDefaultStage: 'qualified'
      }
    }
  );

  assert.equal(updatedWorkspace.name, 'Marketing Hub');
  assert.equal(updatedWorkspace.slug, 'marketing-hub');
  assert.equal(updatedWorkspace.timezone, 'America/New_York');
  assert.deepEqual(updatedWorkspace.settingsJson, { kanbanDefaultStage: 'qualified' });

  const fetchedWorkspace = await getWorkspaceSettings(fixture.ownerContext, fixture.ownerContext.currentWorkspace.id);
  assert.equal(fetchedWorkspace.slug, 'marketing-hub');
});

test('viewer can read workspace settings but cannot manage tenant settings', async (t) => {
  const fixture = await createFixture(t);
  await setCurrentMembershipRole(fixture.pool, fixture.ownerContext, 'viewer');
  const viewerContext = await fixture.refreshContext();

  const workspaceSettings = await getWorkspaceSettings(viewerContext, viewerContext.currentWorkspace.id);
  assert.equal(workspaceSettings.id, viewerContext.currentWorkspace.id);

  await assert.rejects(
    () =>
      updateTenantSettings(viewerContext, {
        locale: 'en-US'
      }),
    { code: 'FORBIDDEN' }
  );
});

test('invalid timezone is rejected', async (t) => {
  const fixture = await createFixture(t);

  await assert.rejects(
    () =>
      updateWorkspaceSettings(fixture.ownerContext, fixture.ownerContext.currentWorkspace.id, {
        timezone: 'Invalid/Timezone'
      }),
    { code: 'INVALID_TIMEZONE' }
  );
});

test('organization isolation blocks access outside current tenant organization', async (t) => {
  const fixture = await createFixture(t);
  const secondFixture = await createFixture(t);

  await assert.rejects(
    () => getOrganizationSettings(fixture.ownerContext, secondFixture.ownerContext.currentOrganization.id),
    { code: 'ORGANIZATION_ACCESS_DENIED' }
  );
});

test('workspace isolation blocks access outside current workspace', async (t) => {
  const fixture = await createFixture(t);
  const secondWorkspace = await fixture.pool.query(
    `
      insert into workspaces (clinic_id, organization_id, name, slug, status)
      values ($1, $2, $3, $4, 'active')
      returning id
    `,
    [
      fixture.ownerContext.currentClinic.id,
      fixture.ownerContext.currentOrganization.id,
      'Second Workspace',
      `second-workspace-${Date.now()}`
    ]
  );

  await assert.rejects(
    () => getWorkspaceSettings(fixture.ownerContext, secondWorkspace.rows[0].id),
    { code: 'WORKSPACE_ACCESS_DENIED' }
  );
});

test('workspace slug conflict is rejected inside the same organization', async (t) => {
  const fixture = await createFixture(t);
  const duplicateSlug = `workspace-slug-${Date.now()}`;

  const siblingWorkspace = await fixture.pool.query(
    `
      insert into workspaces (clinic_id, organization_id, name, slug, status)
      values ($1, $2, $3, $4, 'active')
      returning id
    `,
    [fixture.ownerContext.currentClinic.id, fixture.ownerContext.currentOrganization.id, 'Sibling Workspace', duplicateSlug]
  );

  assert.equal(siblingWorkspace.rowCount, 1);

  await assert.rejects(
    () =>
      updateWorkspaceSettings(fixture.ownerContext, fixture.ownerContext.currentWorkspace.id, {
        slug: duplicateSlug
      }),
    { code: 'WORKSPACE_SLUG_CONFLICT' }
  );
});
