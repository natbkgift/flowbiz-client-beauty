const { getPool } = require('../../db');
const { AppError } = require('../../common/errors');
const { toPublicClinic } = require('../clinics/clinic-entity');
const { toPublicOrganization } = require('../organizations/organization-entity');
const { toPublicWorkspace } = require('../workspaces/workspace-entity');
const { buildPermissionKey, normalizeRoleKey } = require('../rbac/service');

function mapMembership(row) {
  return {
    id: row.membership_id,
    clinicId: row.clinic_id,
    userId: row.user_id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    roleId: row.resolved_role_id,
    role: row.role_key,
    status: row.membership_status,
    permissions: (row.permissions_json || []).map((permission) => buildPermissionKey(permission.resource, permission.action)),
    clinic: toPublicClinic(row),
    organization: toPublicOrganization(row),
    workspace: toPublicWorkspace(row)
  };
}

async function getMembershipsByUserId(userId) {
  const result = await getPool().query(
    `
      select
        wm.id as membership_id,
        wm.clinic_id,
        wm.user_id,
        wm.organization_id,
        wm.workspace_id,
        wm.status as membership_status,
        coalesce(resolved_role.id, 0) as resolved_role_id,
        coalesce(resolved_role.key, $2) as role_key,
        c.id as clinic_id,
        c.name as clinic_name,
        c.slug as clinic_slug,
        c.plan as clinic_plan,
        c.status as clinic_status,
        c.timezone as clinic_timezone,
        c.locale as clinic_locale,
        c.branding_json as clinic_branding_json,
        c.settings_json as clinic_settings_json,
        c.created_at as clinic_created_at,
        c.updated_at as clinic_updated_at,
        o.id as organization_id,
        o.clinic_id as organization_clinic_id,
        o.name as organization_name,
        o.slug as organization_slug,
        o.status as organization_status,
        o.timezone as organization_timezone,
        o.settings_json as organization_settings_json,
        o.created_at as organization_created_at,
        o.updated_at as organization_updated_at,
        w.id as workspace_id,
        w.clinic_id as workspace_clinic_id,
        w.organization_id as workspace_organization_id,
        w.name as workspace_name,
        w.slug as workspace_slug,
        w.status as workspace_status,
        w.timezone as workspace_timezone,
        w.settings_json as workspace_settings_json,
        w.created_at as workspace_created_at,
        w.updated_at as workspace_updated_at,
        coalesce(
          jsonb_agg(distinct jsonb_build_object('resource', p.resource, 'action', p.action)) filter (where p.id is not null),
          '[]'::jsonb
        ) as permissions_json
      from workspace_memberships wm
      inner join clinics c on c.id = wm.clinic_id
      left join organizations o on o.id = wm.organization_id
      left join workspaces w on w.id = wm.workspace_id
      left join lateral (
        select id, key
        from roles
        where id = wm.role_id
           or (wm.role_id is null and key = $2)
        order by case when id = wm.role_id then 0 else 1 end asc
        limit 1
      ) resolved_role on true
      left join role_permissions rp on rp.role_id = resolved_role.id
      left join permissions p on p.id = rp.permission_id
      where wm.user_id = $1
        and wm.status = 'active'
        and c.status = 'active'
        and coalesce(o.status, 'active') = 'active'
        and coalesce(w.status, 'active') = 'active'
      group by
        wm.id,
        wm.clinic_id,
        wm.user_id,
        wm.organization_id,
        wm.workspace_id,
        wm.status,
        resolved_role.id,
        resolved_role.key,
        c.id,
        c.name,
        c.slug,
        c.plan,
        c.status,
        c.timezone,
        c.locale,
        c.branding_json,
        c.settings_json,
        c.created_at,
        c.updated_at,
        o.id,
        o.clinic_id,
        o.name,
        o.slug,
        o.status,
        o.timezone,
        o.settings_json,
        o.created_at,
        o.updated_at,
        w.id,
        w.clinic_id,
        w.organization_id,
        w.name,
        w.slug,
        w.status,
        w.timezone,
        w.settings_json,
        w.created_at,
        w.updated_at
      order by c.id asc
    `,
    [userId, normalizeRoleKey('viewer')]
  );

  return result.rows.map(mapMembership);
}

function resolveMembership(memberships, options = {}) {
  if (memberships.length === 0) {
    throw new AppError(403, 'NO_ACTIVE_MEMBERSHIP', 'The user does not belong to any active clinic.');
  }

  if (options.clinicSlug) {
    const matchedBySlug = memberships.find(
      (membership) =>
        membership.clinic.slug === options.clinicSlug && (!options.workspaceSlug || membership.workspace?.slug === options.workspaceSlug)
    );

    if (!matchedBySlug) {
      throw new AppError(403, 'CLINIC_ACCESS_DENIED', 'The user does not have access to the requested clinic.');
    }

    return matchedBySlug;
  }

  if (options.clinicId) {
    const matchedById = memberships.find(
      (membership) =>
        String(membership.clinic.id) === String(options.clinicId) &&
        (!options.workspaceSlug || membership.workspace?.slug === options.workspaceSlug) &&
        (!options.workspaceId || String(membership.workspace?.id) === String(options.workspaceId))
    );

    if (!matchedById) {
      throw new AppError(403, 'CLINIC_ACCESS_DENIED', 'The user does not have access to the requested clinic.');
    }

    return matchedById;
  }

  return memberships[0];
}

module.exports = {
  getMembershipsByUserId,
  resolveMembership
};