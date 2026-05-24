const crypto = require('node:crypto');
const { getPool } = require('../../db');
const { loadConfig } = require('../../config');
const { AppError } = require('../../common/errors');
const { hashPassword } = require('../auth/password');
const { createSessionToken } = require('../auth/token');
const { toPublicUser } = require('../users/user-entity');
const { toPublicWorkspace } = require('../workspaces/workspace-entity');
const { toPublicOrganization } = require('../organizations/organization-entity');
const { toPublicClinic } = require('../clinics/clinic-entity');
const { getMembershipsByUserId, resolveMembership } = require('../tenancy/service');
const { publishDomainEvent } = require('../event-bus/publisher');
const { recordAuditLog } = require('../audit/service');
const {
  validateInvitePayload,
  validateAcceptInvitePayload,
  validateRoleChangePayload,
  normalizeEmail
} = require('./validation');

const config = loadConfig();

function mapWorkspaceMembership(row) {
  return {
    id: row.id || row.membership_id,
    clinicId: row.clinic_id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    roleId: row.role_id,
    role: row.role_key,
    status: row.membership_status || row.status,
    invitedBy: row.invited_by,
    invitedAt: row.invited_at,
    joinedAt: row.joined_at,
    deactivatedAt: row.deactivated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    user: row.user_email || row.user_id || row.invite_email ? {
      id: row.user_id || null,
      email: row.user_email || row.invite_email || null,
      name: row.user_name || null,
      status: row.user_status || null
    } : null,
    roleDetail: row.role_name ? {
      id: row.role_id,
      key: row.role_key,
      name: row.role_name,
      description: row.role_description
    } : null,
    workspace: row.workspace_name ? toPublicWorkspace(row) : null,
    organization: row.organization_name ? toPublicOrganization(row) : null,
    clinic: row.clinic_name ? toPublicClinic(row) : null
  };
}

function hashInviteToken(token) {
  return crypto.createHmac('sha256', config.inviteTokenSecret).update(token).digest('hex');
}

function createInviteToken() {
  return crypto.randomBytes(24).toString('base64url');
}

async function findUserByEmail(client, email) {
  const result = await client.query(
    `
      select id, email, name, password_hash, status, last_login_at, created_at, updated_at
      from users
      where lower(email) = lower($1)
      limit 1
    `,
    [email]
  );

  return result.rows[0] || null;
}

async function findUserById(client, userId) {
  const result = await client.query(
    `
      select id, email, name, password_hash, status, last_login_at, created_at, updated_at
      from users
      where id = $1
      limit 1
    `,
    [userId]
  );

  return result.rows[0] || null;
}

async function createSession(client, userId, clinicId) {
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + config.authTokenTtlHours * 60 * 60 * 1000);

  await client.query(
    `
      insert into auth_sessions (id, user_id, clinic_id, expires_at)
      values ($1, $2, $3, $4)
    `,
    [sessionId, userId, clinicId, expiresAt.toISOString()]
  );

  return {
    sessionId,
    expiresAt
  };
}

async function revokeClinicSessions(client, clinicId, userId) {
  await client.query(
    `
      update auth_sessions
      set revoked_at = now()
      where clinic_id = $1 and user_id = $2 and revoked_at is null
    `,
    [clinicId, userId]
  );
}

async function buildSessionResponse(client, userId, clinicId, workspaceId) {
  const user = await findUserById(client, userId);
  const session = await createSession(client, userId, clinicId);
  const memberships = await getMembershipsByUserId(userId);
  const currentMembership = resolveMembership(memberships, { clinicId, workspaceId });
  const token = createSessionToken(
    {
      userId,
      clinicId,
      sessionId: session.sessionId
    },
    config.authTokenSecret,
    config.authTokenTtlHours
  );

  const distinctRoles = [...new Set(memberships.map((membership) => membership.role))];

  return {
    token,
    user: toPublicUser(user),
    currentClinic: currentMembership.clinic,
    currentOrganization: currentMembership.organization,
    currentWorkspace: currentMembership.workspace,
    currentMembership: {
      id: currentMembership.id,
      clinicId: currentMembership.clinicId,
      organizationId: currentMembership.organizationId,
      workspaceId: currentMembership.workspaceId,
      role: currentMembership.role,
      status: currentMembership.status,
      permissions: currentMembership.permissions
    },
    memberships: memberships.map((membership) => ({
      id: membership.id,
      clinicId: membership.clinicId,
      organizationId: membership.organizationId,
      workspaceId: membership.workspaceId,
      role: membership.role,
      status: membership.status,
      permissions: membership.permissions,
      clinic: membership.clinic,
      organization: membership.organization,
      workspace: membership.workspace
    })),
    roles: distinctRoles,
    permissions: currentMembership.permissions
  };
}

async function getWorkspaceById(client, clinicId, workspaceId) {
  const result = await client.query(
    `
      select
        w.id as workspace_id,
        w.clinic_id,
        w.organization_id,
        w.name as workspace_name,
        w.slug as workspace_slug,
        w.status as workspace_status,
        w.created_at as workspace_created_at,
        w.updated_at as workspace_updated_at,
        o.id as organization_id,
        o.clinic_id as organization_clinic_id,
        o.name as organization_name,
        o.slug as organization_slug,
        o.status as organization_status,
        o.created_at as organization_created_at,
        o.updated_at as organization_updated_at,
        c.id as clinic_id,
        c.name as clinic_name,
        c.slug as clinic_slug,
        c.plan as clinic_plan,
        c.status as clinic_status,
        c.timezone as clinic_timezone,
        c.created_at as clinic_created_at,
        c.updated_at as clinic_updated_at
      from workspaces w
      inner join organizations o on o.id = w.organization_id
      inner join clinics c on c.id = w.clinic_id
      where w.id = $1 and w.clinic_id = $2 and w.status = 'active' and o.status = 'active' and c.status = 'active'
      limit 1
    `,
    [workspaceId, clinicId]
  );

  if (result.rowCount === 0) {
    throw new AppError(404, 'WORKSPACE_NOT_FOUND', 'Workspace not found.');
  }

  return result.rows[0];
}

function assertWorkspaceAccess(context, workspaceId) {
  if (String(context.currentMembership.workspaceId) !== String(workspaceId)) {
    throw new AppError(403, 'WORKSPACE_ACCESS_DENIED', 'The user does not have access to the requested workspace.');
  }
}

async function getRoleByKey(client, roleKey) {
  const result = await client.query('select id, key, name, description from roles where key = $1 limit 1', [roleKey]);

  if (result.rowCount === 0) {
    throw new AppError(400, 'ROLE_NOT_FOUND', 'Role not found.');
  }

  return result.rows[0];
}

async function findMembershipById(client, workspaceId, membershipId) {
  const result = await client.query(
    `
      select
        wm.id,
        wm.clinic_id,
        wm.organization_id,
        wm.workspace_id,
        wm.user_id,
        wm.role_id,
        wm.status as membership_status,
        wm.invited_by,
        wm.invited_at,
        wm.joined_at,
        wm.deactivated_at,
        wm.created_at,
        wm.updated_at,
        r.key as role_key,
        r.name as role_name,
        r.description as role_description,
        u.email as user_email,
        u.name as user_name,
        u.status as user_status
      from workspace_memberships wm
      inner join roles r on r.id = wm.role_id
      left join users u on u.id = wm.user_id
      where wm.workspace_id = $1 and wm.id = $2
      limit 1
    `,
    [workspaceId, membershipId]
  );

  if (result.rowCount === 0) {
    throw new AppError(404, 'MEMBERSHIP_NOT_FOUND', 'Workspace membership not found.');
  }

  return result.rows[0];
}

async function syncClinicUserForActiveMembership(client, membership) {
  if (!membership.userId) {
    return;
  }

  await client.query(
    `
      insert into clinic_users (clinic_id, user_id, organization_id, workspace_id, role, role_id, status)
      values ($1, $2, $3, $4, $5, $6, 'active')
      on conflict (clinic_id, user_id)
      do update set
        organization_id = excluded.organization_id,
        workspace_id = excluded.workspace_id,
        role = excluded.role,
        role_id = excluded.role_id,
        status = 'active',
        updated_at = now()
    `,
    [membership.clinicId, membership.userId, membership.organizationId, membership.workspaceId, membership.role, membership.roleId]
  );
}

async function syncClinicUserAfterDeactivation(client, clinicId, userId) {
  const activeMembershipResult = await client.query(
    `
      select wm.clinic_id, wm.organization_id, wm.workspace_id, wm.user_id, wm.role_id, r.key as role_key
      from workspace_memberships wm
      inner join roles r on r.id = wm.role_id
      where wm.clinic_id = $1 and wm.user_id = $2 and wm.status = 'active'
      order by wm.updated_at desc, wm.id desc
      limit 1
    `,
    [clinicId, userId]
  );

  if (activeMembershipResult.rowCount === 0) {
    await client.query(
      `
        update clinic_users
        set status = 'inactive', updated_at = now()
        where clinic_id = $1 and user_id = $2
      `,
      [clinicId, userId]
    );
    await revokeClinicSessions(client, clinicId, userId);
    return;
  }

  const activeMembership = activeMembershipResult.rows[0];
  await client.query(
    `
      update clinic_users
      set organization_id = $3,
          workspace_id = $4,
          role = $5,
          role_id = $6,
          status = 'active',
          updated_at = now()
      where clinic_id = $1 and user_id = $2
    `,
    [clinicId, userId, activeMembership.organization_id, activeMembership.workspace_id, activeMembership.role_key, activeMembership.role_id]
  );
}

async function listWorkspaceMembers(context, workspaceId) {
  assertWorkspaceAccess(context, workspaceId);
  const result = await getPool().query(
    `
      select
        wm.id as membership_id,
        wm.clinic_id,
        wm.organization_id,
        wm.workspace_id,
        wm.user_id,
        wm.role_id,
        wm.status as membership_status,
        wm.invited_by,
        wm.invited_at,
        wm.joined_at,
        wm.deactivated_at,
        wm.created_at,
        wm.updated_at,
        u.email as user_email,
        u.name as user_name,
        u.status as user_status,
        r.key as role_key,
        r.name as role_name,
        r.description as role_description,
        latest_invite.email as invite_email,
        w.id as workspace_id,
        w.clinic_id as workspace_clinic_id,
        w.organization_id as workspace_organization_id,
        w.name as workspace_name,
        w.slug as workspace_slug,
        w.status as workspace_status,
        w.created_at as workspace_created_at,
        w.updated_at as workspace_updated_at,
        o.id as organization_id,
        o.clinic_id as organization_clinic_id,
        o.name as organization_name,
        o.slug as organization_slug,
        o.status as organization_status,
        o.created_at as organization_created_at,
        o.updated_at as organization_updated_at,
        c.id as clinic_id,
        c.name as clinic_name,
        c.slug as clinic_slug,
        c.plan as clinic_plan,
        c.status as clinic_status,
        c.timezone as clinic_timezone,
        c.created_at as clinic_created_at,
        c.updated_at as clinic_updated_at
      from workspace_memberships wm
      inner join roles r on r.id = wm.role_id
      inner join workspaces w on w.id = wm.workspace_id
      inner join organizations o on o.id = wm.organization_id
      inner join clinics c on c.id = wm.clinic_id
      left join users u on u.id = wm.user_id
      left join lateral (
        select it.email
        from invite_tokens it
        where it.membership_id = wm.id
        order by it.created_at desc, it.id desc
        limit 1
      ) latest_invite on true
      where wm.workspace_id = $1 and wm.clinic_id = $2
      order by case when wm.status = 'active' then 0 when wm.status = 'invited' then 1 else 2 end asc, wm.id asc
    `,
    [workspaceId, context.currentClinic.id]
  );

  return {
    items: result.rows.map(mapWorkspaceMembership)
  };
}

async function inviteWorkspaceMember(context, workspaceId, payload) {
  assertWorkspaceAccess(context, workspaceId);
  const normalized = validateInvitePayload(payload);
  const client = await getPool().connect();

  await client.query('begin');

  try {
    const workspace = await getWorkspaceById(client, context.currentClinic.id, workspaceId);
    const role = await getRoleByKey(client, normalized.role);
    const existingUser = await findUserByEmail(client, normalized.email);

    if (existingUser) {
      const existingActive = await client.query(
        `
          select id
          from workspace_memberships
          where workspace_id = $1 and user_id = $2 and status in ('invited', 'active')
          limit 1
        `,
        [workspaceId, existingUser.id]
      );

      if (existingActive.rowCount > 0) {
        throw new AppError(409, 'MEMBERSHIP_EXISTS', 'The user already has an invited or active membership in this workspace.');
      }
    }

    const pendingInvite = await client.query(
      `
        select id
        from invite_tokens
        where workspace_id = $1 and lower(email) = lower($2) and status = 'pending'
        limit 1
      `,
      [workspaceId, normalized.email]
    );

    if (pendingInvite.rowCount > 0) {
      throw new AppError(409, 'INVITE_ALREADY_PENDING', 'An active invite already exists for this email in the workspace.');
    }

    const existingDeactivated = existingUser
      ? await client.query(
          `
            select id
            from workspace_memberships
            where workspace_id = $1 and user_id = $2 and status = 'deactivated'
            limit 1
          `,
          [workspaceId, existingUser.id]
        )
      : { rowCount: 0, rows: [] };

    let membershipResult;

    if (existingDeactivated.rowCount > 0) {
      membershipResult = await client.query(
        `
          update workspace_memberships
          set role_id = $2,
              status = 'invited',
              invited_by = $3,
              invited_at = now(),
              joined_at = null,
              deactivated_at = null,
              updated_at = now()
          where id = $1
          returning *
        `,
        [existingDeactivated.rows[0].id, role.id, context.currentUser.id]
      );
    } else {
      membershipResult = await client.query(
        `
          insert into workspace_memberships (
            clinic_id,
            organization_id,
            workspace_id,
            user_id,
            role_id,
            status,
            invited_by,
            invited_at
          )
          values ($1, $2, $3, $4, $5, 'invited', $6, now())
          returning *
        `,
        [context.currentClinic.id, workspace.organization_id, workspaceId, existingUser?.id || null, role.id, context.currentUser.id]
      );
    }

    const plainToken = createInviteToken();
    const tokenHash = hashInviteToken(plainToken);
    const expiresAt = new Date(Date.now() + config.inviteTokenTtlHours * 60 * 60 * 1000);

    await client.query(
      `
        insert into invite_tokens (
          membership_id,
          clinic_id,
          organization_id,
          workspace_id,
          email,
          role_id,
          token_hash,
          expires_at,
          invited_by,
          status
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
      `,
      [
        membershipResult.rows[0].id,
        context.currentClinic.id,
        workspace.organization_id,
        workspaceId,
        normalized.email,
        role.id,
        tokenHash,
        expiresAt.toISOString(),
        context.currentUser.id
      ]
    );

    await recordAuditLog(
      {
        clinicId: context.currentClinic.id,
        entityType: 'workspace_membership',
        entityId: membershipResult.rows[0].id,
        actionType: 'membership.invited',
        actorUserId: context.currentUser.id,
        contextJson: {
          clinic_id: context.currentClinic.id,
          organization_id: workspace.organization_id,
          workspace_id: workspaceId,
          actor_user_id: context.currentUser.id,
          target_user_id: existingUser?.id || null,
          invite_email: normalized.email,
          role_before: null,
          role_after: role.key,
          timestamp: new Date().toISOString()
        }
      },
      client
    );

    await client.query('commit');

    await publishDomainEvent({
      clinicId: context.currentClinic.id,
      eventType: 'membership.invited',
      entityType: 'workspace_membership',
      entityId: membershipResult.rows[0].id,
      payloadJson: {
        organizationId: workspace.organization_id,
        workspaceId,
        actorUserId: context.currentUser.id,
        targetUserId: existingUser?.id || null,
        email: normalized.email,
        roleAfter: role.key,
        occurredAt: new Date().toISOString()
      }
    });

    return {
      membership: mapWorkspaceMembership({
        ...membershipResult.rows[0],
        role_key: role.key,
        role_name: role.name,
        role_description: role.description,
        invite_email: normalized.email
      }),
      invite: {
        email: normalized.email,
        role: role.key,
        expiresAt,
        token: plainToken
      }
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function acceptInvite(payload) {
  const normalized = validateAcceptInvitePayload(payload);
  const client = await getPool().connect();
  const tokenHash = hashInviteToken(normalized.token);
  let transactionCommitted = false;

  await client.query('begin');

  try {
    const inviteResult = await client.query(
      `
        select
          it.*,
          wm.id as membership_id,
          wm.user_id as membership_user_id,
          wm.status as membership_status,
          r.key as role_key,
          r.name as role_name,
          r.description as role_description,
          w.id as workspace_id,
          w.clinic_id as workspace_clinic_id,
          w.organization_id as workspace_organization_id,
          w.name as workspace_name,
          w.slug as workspace_slug,
          w.status as workspace_status,
          w.created_at as workspace_created_at,
          w.updated_at as workspace_updated_at,
          o.id as organization_id,
          o.clinic_id as organization_clinic_id,
          o.name as organization_name,
          o.slug as organization_slug,
          o.status as organization_status,
          o.created_at as organization_created_at,
          o.updated_at as organization_updated_at,
          c.id as clinic_id,
          c.name as clinic_name,
          c.slug as clinic_slug,
          c.plan as clinic_plan,
          c.status as clinic_status,
          c.timezone as clinic_timezone,
          c.created_at as clinic_created_at,
          c.updated_at as clinic_updated_at
        from invite_tokens it
        inner join workspace_memberships wm on wm.id = it.membership_id
        inner join roles r on r.id = it.role_id
        inner join workspaces w on w.id = it.workspace_id
        inner join organizations o on o.id = it.organization_id
        inner join clinics c on c.id = it.clinic_id
        where it.token_hash = $1
        limit 1
      `,
      [tokenHash]
    );

    if (inviteResult.rowCount === 0) {
      throw new AppError(400, 'INVALID_INVITE_TOKEN', 'Invite token is invalid.');
    }

    const invite = inviteResult.rows[0];

    if (invite.status === 'accepted' || invite.status === 'revoked') {
      throw new AppError(400, 'INVITE_NOT_PENDING', 'Invite token is no longer pending.');
    }

    if (new Date(invite.expires_at).getTime() <= Date.now()) {
      await client.query(`update invite_tokens set status = 'expired', updated_at = now() where id = $1`, [invite.id]);
      await client.query('commit');
      transactionCommitted = true;
      throw new AppError(400, 'INVITE_EXPIRED', 'Invite token has expired.');
    }

    let user = await findUserByEmail(client, invite.email);

    if (!user) {
      const passwordHash = hashPassword(normalized.password, crypto.randomBytes(16).toString('hex'));
      const userResult = await client.query(
        `
          insert into users (email, name, password_hash, status)
          values ($1, $2, $3, 'active')
          returning *
        `,
        [invite.email, normalized.name, passwordHash]
      );
      user = userResult.rows[0];
    } else if (user.status !== 'active') {
      await client.query(`update users set name = $2, password_hash = $3, status = 'active', updated_at = now() where id = $1`, [
        user.id,
        normalized.name,
        hashPassword(normalized.password, crypto.randomBytes(16).toString('hex'))
      ]);
      user = await findUserById(client, user.id);
    }

    const duplicateMembership = await client.query(
      `
        select id
        from workspace_memberships
        where workspace_id = $1 and user_id = $2 and status = 'active' and id <> $3
        limit 1
      `,
      [invite.workspace_id, user.id, invite.membership_id]
    );

    if (duplicateMembership.rowCount > 0) {
      throw new AppError(409, 'MEMBERSHIP_EXISTS', 'The user is already an active member of this workspace.');
    }

    const membershipResult = await client.query(
      `
        update workspace_memberships
        set user_id = $2,
            role_id = $3,
            status = 'active',
            joined_at = now(),
            deactivated_at = null,
            updated_at = now()
        where id = $1
        returning *
      `,
      [invite.membership_id, user.id, invite.role_id]
    );

    await syncClinicUserForActiveMembership(client, {
      clinicId: invite.clinic_id,
      organizationId: invite.organization_id,
      workspaceId: invite.workspace_id,
      userId: user.id,
      roleId: invite.role_id,
      role: invite.role_key
    });

    await client.query(`update invite_tokens set status = 'accepted', updated_at = now() where id = $1`, [invite.id]);
    await client.query(
      `
        update invite_tokens
        set status = 'revoked', updated_at = now()
        where workspace_id = $1 and lower(email) = lower($2) and status = 'pending' and id <> $3
      `,
      [invite.workspace_id, invite.email, invite.id]
    );

    await recordAuditLog(
      {
        clinicId: invite.clinic_id,
        entityType: 'workspace_membership',
        entityId: membershipResult.rows[0].id,
        actionType: 'membership.accepted',
        actorUserId: user.id,
        contextJson: {
          clinic_id: invite.clinic_id,
          organization_id: invite.organization_id,
          workspace_id: invite.workspace_id,
          actor_user_id: user.id,
          target_user_id: user.id,
          role_before: null,
          role_after: invite.role_key,
          timestamp: new Date().toISOString()
        }
      },
      client
    );

    await client.query('commit');
    transactionCommitted = true;

    const response = await buildSessionResponse(client, user.id, invite.clinic_id, invite.workspace_id);

    await publishDomainEvent({
      clinicId: invite.clinic_id,
      eventType: 'membership.accepted',
      entityType: 'workspace_membership',
      entityId: membershipResult.rows[0].id,
      payloadJson: {
        organizationId: invite.organization_id,
        workspaceId: invite.workspace_id,
        actorUserId: user.id,
        targetUserId: user.id,
        roleAfter: invite.role_key,
        occurredAt: new Date().toISOString()
      }
    });

    return response;
  } catch (error) {
    if (!transactionCommitted) {
      try {
        await client.query('rollback');
      } catch (rollbackError) {
        // noop
      }
    }
    throw error;
  } finally {
    client.release();
  }
}

async function changeWorkspaceMemberRole(context, workspaceId, membershipId, payload) {
  assertWorkspaceAccess(context, workspaceId);
  const normalized = validateRoleChangePayload(payload);
  const client = await getPool().connect();

  await client.query('begin');

  try {
    const membership = await findMembershipById(client, workspaceId, membershipId);
    const nextRole = await getRoleByKey(client, normalized.role);

    if (membership.role_id === nextRole.id) {
      await client.query('commit');
      return mapWorkspaceMembership({ ...membership, role_id: nextRole.id, role_key: nextRole.key, role_name: nextRole.name, role_description: nextRole.description });
    }

    const updated = await client.query(
      `
        update workspace_memberships
        set role_id = $2, updated_at = now()
        where id = $1
        returning *
      `,
      [membership.id, nextRole.id]
    );

    if (membership.status === 'active' && membership.user_id) {
      await syncClinicUserForActiveMembership(client, {
        clinicId: membership.clinic_id,
        organizationId: membership.organization_id,
        workspaceId: membership.workspace_id,
        userId: membership.user_id,
        roleId: nextRole.id,
        role: nextRole.key
      });
    }

    await client.query(
      `
        update invite_tokens
        set role_id = $2, updated_at = now()
        where membership_id = $1 and status = 'pending'
      `,
      [membership.id, nextRole.id]
    );

    await recordAuditLog(
      {
        clinicId: membership.clinic_id,
        entityType: 'workspace_membership',
        entityId: membership.id,
        actionType: 'membership.role_changed',
        actorUserId: context.currentUser.id,
        contextJson: {
          clinic_id: membership.clinic_id,
          organization_id: membership.organization_id,
          workspace_id: membership.workspace_id,
          actor_user_id: context.currentUser.id,
          target_user_id: membership.user_id,
          role_before: membership.role_key,
          role_after: nextRole.key,
          timestamp: new Date().toISOString()
        }
      },
      client
    );

    await client.query('commit');

    await publishDomainEvent({
      clinicId: membership.clinic_id,
      eventType: 'membership.role_changed',
      entityType: 'workspace_membership',
      entityId: membership.id,
      payloadJson: {
        organizationId: membership.organization_id,
        workspaceId: membership.workspace_id,
        actorUserId: context.currentUser.id,
        targetUserId: membership.user_id,
        roleBefore: membership.role_key,
        roleAfter: nextRole.key,
        occurredAt: new Date().toISOString()
      }
    });

    return mapWorkspaceMembership({
      ...updated.rows[0],
      role_key: nextRole.key,
      role_name: nextRole.name,
      role_description: nextRole.description,
      user_id: membership.user_id,
      user_email: membership.user_email,
      user_name: membership.user_name,
      user_status: membership.user_status
    });
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function deactivateWorkspaceMember(context, workspaceId, membershipId) {
  assertWorkspaceAccess(context, workspaceId);
  const client = await getPool().connect();

  await client.query('begin');

  try {
    const membership = await findMembershipById(client, workspaceId, membershipId);

    if (membership.status === 'deactivated') {
      await client.query('commit');
      return mapWorkspaceMembership(membership);
    }

    const updated = await client.query(
      `
        update workspace_memberships
        set status = 'deactivated',
            deactivated_at = now(),
            updated_at = now()
        where id = $1
        returning *
      `,
      [membership.id]
    );

    await client.query(
      `
        update invite_tokens
        set status = case when status = 'pending' then 'revoked' else status end,
            updated_at = now()
        where membership_id = $1 and status in ('pending', 'accepted')
      `,
      [membership.id]
    );

    if (membership.user_id) {
      await syncClinicUserAfterDeactivation(client, membership.clinic_id, membership.user_id);
    }

    await recordAuditLog(
      {
        clinicId: membership.clinic_id,
        entityType: 'workspace_membership',
        entityId: membership.id,
        actionType: 'membership.deactivated',
        actorUserId: context.currentUser.id,
        contextJson: {
          clinic_id: membership.clinic_id,
          organization_id: membership.organization_id,
          workspace_id: membership.workspace_id,
          actor_user_id: context.currentUser.id,
          target_user_id: membership.user_id,
          role_before: membership.role_key,
          role_after: membership.role_key,
          timestamp: new Date().toISOString()
        }
      },
      client
    );

    await client.query('commit');

    await publishDomainEvent({
      clinicId: membership.clinic_id,
      eventType: 'membership.deactivated',
      entityType: 'workspace_membership',
      entityId: membership.id,
      payloadJson: {
        organizationId: membership.organization_id,
        workspaceId: membership.workspace_id,
        actorUserId: context.currentUser.id,
        targetUserId: membership.user_id,
        roleBefore: membership.role_key,
        roleAfter: membership.role_key,
        occurredAt: new Date().toISOString()
      }
    });

    return mapWorkspaceMembership({
      ...updated.rows[0],
      role_id: membership.role_id,
      role_key: membership.role_key,
      role_name: membership.role_name,
      role_description: membership.role_description,
      user_id: membership.user_id,
      user_email: membership.user_email,
      user_name: membership.user_name,
      user_status: membership.user_status
    });
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  inviteWorkspaceMember,
  listWorkspaceMembers,
  changeWorkspaceMemberRole,
  deactivateWorkspaceMember,
  acceptInvite,
  hashInviteToken
};