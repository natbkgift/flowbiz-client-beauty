const { getPool } = require('../../db');
const { AppError } = require('../../common/errors');
const { toSlug } = require('../../common/slug');
const { authorize, authorizeAny } = require('../rbac/service');
const { toPublicClinic } = require('../clinics/clinic-entity');
const { toPublicOrganization } = require('../organizations/organization-entity');
const { toPublicWorkspace } = require('../workspaces/workspace-entity');
const { recordAuditLog } = require('../audit/service');
const { publishDomainEvent } = require('../event-bus/publisher');

const VALID_TIME_ZONES = new Set(Intl.supportedValuesOf('timeZone'));

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateTimeZone(value, fieldName = 'timezone') {
  if (typeof value !== 'string' || !value.trim()) {
    throw new AppError(400, 'INVALID_TIMEZONE', `${fieldName} must be a non-empty IANA timezone.`);
  }

  const normalized = value.trim();

  if (!VALID_TIME_ZONES.has(normalized)) {
    throw new AppError(400, 'INVALID_TIMEZONE', `${fieldName} must be a valid IANA timezone.`);
  }

  return normalized;
}

function validateOptionalJsonObject(value, fieldName) {
  if (value === undefined) {
    return undefined;
  }

  if (!isPlainObject(value)) {
    throw new AppError(400, 'INVALID_SETTINGS_PAYLOAD', `${fieldName} must be a JSON object.`);
  }

  return value;
}

function validateTenantSettingsPayload(payload) {
  const normalized = {};

  if (payload.timezone !== undefined) {
    normalized.timezone = validateTimeZone(payload.timezone);
  }

  if (payload.locale !== undefined) {
    if (typeof payload.locale !== 'string' || !payload.locale.trim()) {
      throw new AppError(400, 'INVALID_LOCALE', 'locale must be a non-empty string.');
    }

    normalized.locale = payload.locale.trim();
  }

  const brandingJson = validateOptionalJsonObject(payload.branding_json, 'branding_json');
  const settingsJson = validateOptionalJsonObject(payload.settings_json, 'settings_json');

  if (brandingJson !== undefined) {
    normalized.brandingJson = brandingJson;
  }

  if (settingsJson !== undefined) {
    normalized.settingsJson = settingsJson;
  }

  if (Object.keys(normalized).length === 0) {
    throw new AppError(400, 'EMPTY_SETTINGS_PAYLOAD', 'At least one tenant settings field must be provided.');
  }

  return normalized;
}

function validateOrganizationPayload(payload) {
  const normalized = {};

  if (payload.name !== undefined) {
    if (typeof payload.name !== 'string' || !payload.name.trim()) {
      throw new AppError(400, 'INVALID_ORGANIZATION_NAME', 'name must be a non-empty string.');
    }

    normalized.name = payload.name.trim();
  }

  if (payload.slug !== undefined) {
    const slug = toSlug(payload.slug, 'organization');

    if (!slug) {
      throw new AppError(400, 'INVALID_ORGANIZATION_SLUG', 'slug must be convertible to a non-empty slug.');
    }

    normalized.slug = slug;
  }

  if (payload.timezone !== undefined) {
    normalized.timezone = validateTimeZone(payload.timezone);
  }

  const settingsJson = validateOptionalJsonObject(payload.settings_json, 'settings_json');

  if (settingsJson !== undefined) {
    normalized.settingsJson = settingsJson;
  }

  if (Object.keys(normalized).length === 0) {
    throw new AppError(400, 'EMPTY_SETTINGS_PAYLOAD', 'At least one organization settings field must be provided.');
  }

  return normalized;
}

function validateWorkspacePayload(payload) {
  const normalized = {};

  if (payload.name !== undefined) {
    if (typeof payload.name !== 'string' || !payload.name.trim()) {
      throw new AppError(400, 'INVALID_WORKSPACE_NAME', 'name must be a non-empty string.');
    }

    normalized.name = payload.name.trim();
  }

  if (payload.slug !== undefined) {
    const slug = toSlug(payload.slug, 'workspace');

    if (!slug) {
      throw new AppError(400, 'INVALID_WORKSPACE_SLUG', 'slug must be convertible to a non-empty slug.');
    }

    normalized.slug = slug;
  }

  if (payload.timezone !== undefined) {
    normalized.timezone = validateTimeZone(payload.timezone);
  }

  const settingsJson = validateOptionalJsonObject(payload.settings_json, 'settings_json');

  if (settingsJson !== undefined) {
    normalized.settingsJson = settingsJson;
  }

  if (Object.keys(normalized).length === 0) {
    throw new AppError(400, 'EMPTY_SETTINGS_PAYLOAD', 'At least one workspace settings field must be provided.');
  }

  return normalized;
}

async function getTenantRow(client, clinicId) {
  const result = await client.query(
    `
      select id, name, slug, plan, status, timezone, locale, branding_json, settings_json, created_at, updated_at
      from clinics
      where id = $1 and status = 'active'
      limit 1
    `,
    [clinicId]
  );

  if (result.rowCount === 0) {
    throw new AppError(404, 'TENANT_NOT_FOUND', 'Tenant not found.');
  }

  return result.rows[0];
}

async function getOrganizationRow(client, clinicId, organizationId) {
  const result = await client.query(
    `
      select id, clinic_id, name, slug, status, timezone, settings_json, created_at, updated_at
      from organizations
      where id = $1 and clinic_id = $2 and status = 'active'
      limit 1
    `,
    [organizationId, clinicId]
  );

  if (result.rowCount === 0) {
    throw new AppError(404, 'ORGANIZATION_NOT_FOUND', 'Organization not found.');
  }

  return result.rows[0];
}

async function getWorkspaceRow(client, clinicId, workspaceId) {
  const result = await client.query(
    `
      select id, clinic_id, organization_id, name, slug, status, timezone, settings_json, created_at, updated_at
      from workspaces
      where id = $1 and clinic_id = $2 and status = 'active'
      limit 1
    `,
    [workspaceId, clinicId]
  );

  if (result.rowCount === 0) {
    throw new AppError(404, 'WORKSPACE_NOT_FOUND', 'Workspace not found.');
  }

  return result.rows[0];
}

function assertOrganizationAccess(context, organizationId) {
  if (String(context.currentOrganization?.id) !== String(organizationId)) {
    throw new AppError(403, 'ORGANIZATION_ACCESS_DENIED', 'The user does not have access to the requested organization.');
  }
}

function assertWorkspaceAccess(context, workspaceId) {
  if (String(context.currentWorkspace?.id) !== String(workspaceId)) {
    throw new AppError(403, 'WORKSPACE_ACCESS_DENIED', 'The user does not have access to the requested workspace.');
  }
}

async function assertUniqueOrganizationSlug(client, clinicId, organizationId, slug) {
  const result = await client.query(
    `
      select 1
      from organizations
      where clinic_id = $1 and slug = $2 and id <> $3
      limit 1
    `,
    [clinicId, slug, organizationId]
  );

  if (result.rowCount > 0) {
    throw new AppError(409, 'ORGANIZATION_SLUG_CONFLICT', 'organization slug already exists in this tenant.');
  }
}

async function assertUniqueWorkspaceSlug(client, organizationId, workspaceId, slug) {
  const result = await client.query(
    `
      select 1
      from workspaces
      where organization_id = $1 and slug = $2 and id <> $3
      limit 1
    `,
    [organizationId, slug, workspaceId]
  );

  if (result.rowCount > 0) {
    throw new AppError(409, 'WORKSPACE_SLUG_CONFLICT', 'workspace slug already exists in this organization.');
  }
}

function buildChangeAuditContext(context, beforeJson, afterJson, scope) {
  return {
    clinic_id: context.currentClinic.id,
    organization_id: scope.organizationId || context.currentOrganization?.id || null,
    workspace_id: scope.workspaceId || context.currentWorkspace?.id || null,
    actor_user_id: context.currentUser.id,
    before_json: beforeJson,
    after_json: afterJson,
    timestamp: new Date().toISOString()
  };
}

async function getTenantSettings(context) {
  authorizeAny(context, [
    ['tenant', 'read'],
    ['tenant', 'manage']
  ]);

  const row = await getTenantRow(getPool(), context.currentClinic.id);
  return toPublicClinic(row);
}

async function updateTenantSettings(context, payload) {
  authorize(context, 'tenant', 'manage');
  const normalized = validateTenantSettingsPayload(payload);
  const client = await getPool().connect();

  await client.query('begin');

  try {
    const before = await getTenantRow(client, context.currentClinic.id);
    const result = await client.query(
      `
        update clinics
        set timezone = coalesce($2, timezone),
            locale = coalesce($3, locale),
            branding_json = coalesce($4::jsonb, branding_json),
            settings_json = coalesce($5::jsonb, settings_json),
            updated_at = now()
        where id = $1
        returning *
      `,
      [
        context.currentClinic.id,
        normalized.timezone || null,
        normalized.locale || null,
        normalized.brandingJson ? JSON.stringify(normalized.brandingJson) : null,
        normalized.settingsJson ? JSON.stringify(normalized.settingsJson) : null
      ]
    );

    await recordAuditLog(
      {
        clinicId: context.currentClinic.id,
        entityType: 'tenant',
        entityId: context.currentClinic.id,
        actionType: 'tenant.settings_updated',
        actorUserId: context.currentUser.id,
        contextJson: buildChangeAuditContext(context, toPublicClinic(before), toPublicClinic(result.rows[0]), {})
      },
      client
    );

    await client.query('commit');

    await publishDomainEvent({
      clinicId: context.currentClinic.id,
      eventType: 'tenant.settings_updated',
      entityType: 'tenant',
      entityId: context.currentClinic.id,
      payloadJson: {
        eventType: 'tenant.settings_updated',
        entityType: 'tenant',
        entityId: context.currentClinic.id,
        tenantId: context.currentClinic.id,
        timestamp: new Date().toISOString(),
        payload: {
          before: toPublicClinic(before),
          after: toPublicClinic(result.rows[0]),
          actorUserId: context.currentUser.id
        }
      }
    });

    return toPublicClinic(result.rows[0]);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function getOrganizationSettings(context, organizationId) {
  authorize(context, 'organization', 'read');
  assertOrganizationAccess(context, organizationId);
  const row = await getOrganizationRow(getPool(), context.currentClinic.id, organizationId);
  return toPublicOrganization(row);
}

async function updateOrganizationSettings(context, organizationId, payload) {
  authorize(context, 'organization', 'manage');
  assertOrganizationAccess(context, organizationId);
  const normalized = validateOrganizationPayload(payload);
  const client = await getPool().connect();

  await client.query('begin');

  try {
    const before = await getOrganizationRow(client, context.currentClinic.id, organizationId);

    if (normalized.slug) {
      await assertUniqueOrganizationSlug(client, context.currentClinic.id, organizationId, normalized.slug);
    }

    const result = await client.query(
      `
        update organizations
        set name = coalesce($2, name),
            slug = coalesce($3, slug),
            timezone = coalesce($4, timezone),
            settings_json = coalesce($5::jsonb, settings_json),
            updated_at = now()
        where id = $1 and clinic_id = $6
        returning *
      `,
      [
        organizationId,
        normalized.name || null,
        normalized.slug || null,
        normalized.timezone || null,
        normalized.settingsJson ? JSON.stringify(normalized.settingsJson) : null,
        context.currentClinic.id
      ]
    );

    await recordAuditLog(
      {
        clinicId: context.currentClinic.id,
        entityType: 'organization',
        entityId: organizationId,
        actionType: 'organization.settings_updated',
        actorUserId: context.currentUser.id,
        contextJson: buildChangeAuditContext(context, toPublicOrganization(before), toPublicOrganization(result.rows[0]), {
          organizationId
        })
      },
      client
    );

    await client.query('commit');

    await publishDomainEvent({
      clinicId: context.currentClinic.id,
      eventType: 'organization.settings_updated',
      entityType: 'organization',
      entityId: organizationId,
      payloadJson: {
        eventType: 'organization.settings_updated',
        entityType: 'organization',
        entityId: organizationId,
        tenantId: context.currentClinic.id,
        timestamp: new Date().toISOString(),
        payload: {
          before: toPublicOrganization(before),
          after: toPublicOrganization(result.rows[0]),
          actorUserId: context.currentUser.id,
          organizationId
        }
      }
    });

    return toPublicOrganization(result.rows[0]);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function getWorkspaceSettings(context, workspaceId) {
  authorize(context, 'workspace', 'read');
  assertWorkspaceAccess(context, workspaceId);
  const row = await getWorkspaceRow(getPool(), context.currentClinic.id, workspaceId);
  return toPublicWorkspace(row);
}

async function updateWorkspaceSettings(context, workspaceId, payload) {
  authorize(context, 'workspace', 'manage');
  assertWorkspaceAccess(context, workspaceId);
  const normalized = validateWorkspacePayload(payload);
  const client = await getPool().connect();

  await client.query('begin');

  try {
    const before = await getWorkspaceRow(client, context.currentClinic.id, workspaceId);

    if (normalized.slug) {
      await assertUniqueWorkspaceSlug(client, before.organization_id, workspaceId, normalized.slug);
    }

    const result = await client.query(
      `
        update workspaces
        set name = coalesce($2, name),
            slug = coalesce($3, slug),
            timezone = coalesce($4, timezone),
            settings_json = coalesce($5::jsonb, settings_json),
            updated_at = now()
        where id = $1 and clinic_id = $6
        returning *
      `,
      [
        workspaceId,
        normalized.name || null,
        normalized.slug || null,
        normalized.timezone || null,
        normalized.settingsJson ? JSON.stringify(normalized.settingsJson) : null,
        context.currentClinic.id
      ]
    );

    await recordAuditLog(
      {
        clinicId: context.currentClinic.id,
        entityType: 'workspace',
        entityId: workspaceId,
        actionType: 'workspace.settings_updated',
        actorUserId: context.currentUser.id,
        contextJson: buildChangeAuditContext(context, toPublicWorkspace(before), toPublicWorkspace(result.rows[0]), {
          organizationId: before.organization_id,
          workspaceId
        })
      },
      client
    );

    await client.query('commit');

    await publishDomainEvent({
      clinicId: context.currentClinic.id,
      eventType: 'workspace.settings_updated',
      entityType: 'workspace',
      entityId: workspaceId,
      payloadJson: {
        eventType: 'workspace.settings_updated',
        entityType: 'workspace',
        entityId: workspaceId,
        tenantId: context.currentClinic.id,
        timestamp: new Date().toISOString(),
        payload: {
          before: toPublicWorkspace(before),
          after: toPublicWorkspace(result.rows[0]),
          actorUserId: context.currentUser.id,
          organizationId: before.organization_id,
          workspaceId
        }
      }
    });

    return toPublicWorkspace(result.rows[0]);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  getTenantSettings,
  updateTenantSettings,
  getOrganizationSettings,
  updateOrganizationSettings,
  getWorkspaceSettings,
  updateWorkspaceSettings,
  validateTimeZone
};