const { getPool } = require('../../db');
const { AppError } = require('../../common/errors');
const { getMembershipsByUserId, resolveMembership } = require('../tenancy/service');

async function ensureWorkerMembershipScope(pool, clinicId, actorUserId) {
  const clinicUserResult = await pool.query(
    `
      select cu.role_id, cu.role, cu.organization_id, cu.workspace_id, c.name as clinic_name, c.slug as clinic_slug
      from clinic_users cu
      inner join clinics c on c.id = cu.clinic_id
      where cu.clinic_id = $1 and cu.user_id = $2 and cu.status = 'active'
      limit 1
    `,
    [clinicId, actorUserId]
  );

  if (clinicUserResult.rowCount === 0) {
    throw new AppError(404, 'WORKER_USER_NOT_FOUND', 'Worker could not resolve an active clinic user.');
  }

  const clinicUser = clinicUserResult.rows[0];
  let organizationId = clinicUser.organization_id;
  let workspaceId = clinicUser.workspace_id;
  let roleId = clinicUser.role_id;

  if (!organizationId) {
    const organizationResult = await pool.query(
      `
        insert into organizations (clinic_id, name, slug, status)
        values ($1, $2, $3, 'active')
        on conflict (clinic_id)
        do update set name = excluded.name, updated_at = now()
        returning id
      `,
      [clinicId, `${clinicUser.clinic_name} Organization`, `${clinicUser.clinic_slug}-organization-${clinicId}`]
    );
    organizationId = organizationResult.rows[0].id;
  }

  if (!workspaceId) {
    const workspaceResult = await pool.query(
      `
        insert into workspaces (clinic_id, organization_id, name, slug, status)
        values ($1, $2, 'Main Workspace', 'main-workspace', 'active')
        on conflict (clinic_id, slug)
        do update set organization_id = excluded.organization_id, updated_at = now()
        returning id
      `,
      [clinicId, organizationId]
    );
    workspaceId = workspaceResult.rows[0].id;
  }

  if (!roleId) {
    const roleKey = clinicUser.role === 'manager' || clinicUser.role === 'marketing' || clinicUser.role === 'owner'
      ? 'admin'
      : clinicUser.role === 'sales' || clinicUser.role === 'staff'
        ? 'operator'
        : clinicUser.role || 'viewer';
    const roleResult = await pool.query('select id from roles where key = $1 limit 1', [roleKey]);
    roleId = roleResult.rows[0]?.id || null;
    
    if (!roleId) {
      const fallbackResult = await pool.query("select id from roles where key = 'admin' limit 1");
      roleId = fallbackResult.rows[0]?.id || null;
    }
  }

  await pool.query(
    `
      update clinic_users
      set organization_id = $3,
          workspace_id = $4,
          role_id = coalesce($5, role_id),
          updated_at = now()
      where clinic_id = $1 and user_id = $2
    `,
    [clinicId, actorUserId, organizationId, workspaceId, roleId]
  );

  if (roleId) {
    await pool.query(
      `
        update workspace_memberships
        set organization_id = $2,
            role_id = $5,
            status = 'active',
            updated_at = now()
        where clinic_id = $1 and workspace_id = $3 and user_id = $4
      `,
      [clinicId, organizationId, workspaceId, actorUserId, roleId]
    );

    await pool.query(
      `
        insert into workspace_memberships (
          clinic_id,
          organization_id,
          workspace_id,
          user_id,
          role_id,
          status,
          invited_by,
          invited_at,
          joined_at
        )
        select $1, $2, $3, $4, $5, 'active', $4, now(), now()
        where not exists (
          select 1
          from workspace_memberships
          where clinic_id = $1 and workspace_id = $3 and user_id = $4
        )
      `,
      [clinicId, organizationId, workspaceId, actorUserId, roleId]
    );
  }

  return {
    organizationId,
    workspaceId
  };
}

async function resolveWorkerContext(clinicId, actorUserId = null, workspaceId = null) {
  const pool = getPool();
  const clinicResult = await pool.query(
    `select id, name, slug, plan, status, timezone, created_at, updated_at from clinics where id = $1 limit 1`,
    [clinicId]
  );

  if (clinicResult.rowCount === 0) {
    throw new AppError(404, 'CLINIC_NOT_FOUND', 'Worker clinic context was not found.');
  }

  const userResult = await pool.query(
    `
      select u.id, u.email, u.name, cu.role
      from clinic_users cu
      inner join users u on u.id = cu.user_id
      where cu.clinic_id = $1
        and cu.status = 'active'
        and u.status = 'active'
        and ($2::bigint is null or u.id = $2)
      order by case when u.id = $2 then 0 else 1 end, cu.id asc
      limit 1
    `,
    [clinicId, actorUserId]
  );

  if (userResult.rowCount === 0) {
    throw new AppError(404, 'WORKER_USER_NOT_FOUND', 'Worker could not resolve an active clinic user.');
  }

  let memberships = await getMembershipsByUserId(userResult.rows[0].id);

  if (memberships.length === 0 || (workspaceId && !memberships.some((membership) => String(membership.workspaceId) === String(workspaceId)))) {
    await ensureWorkerMembershipScope(pool, clinicId, userResult.rows[0].id);
    memberships = await getMembershipsByUserId(userResult.rows[0].id);
  }

  const currentMembership = resolveMembership(memberships, {
    clinicId,
    workspaceId: workspaceId || undefined
  });

  return {
    currentClinic: {
      id: clinicResult.rows[0].id,
      name: clinicResult.rows[0].name,
      slug: clinicResult.rows[0].slug,
      plan: clinicResult.rows[0].plan,
      status: clinicResult.rows[0].status,
      timezone: clinicResult.rows[0].timezone,
      createdAt: clinicResult.rows[0].created_at,
      updatedAt: clinicResult.rows[0].updated_at
    },
    currentUser: {
      id: userResult.rows[0].id,
      email: userResult.rows[0].email,
      name: userResult.rows[0].name,
      role: userResult.rows[0].role
    },
    currentOrganization: currentMembership.organization,
    currentWorkspace: currentMembership.workspace,
    currentMembership: {
      clinicId: currentMembership.clinicId,
      organizationId: currentMembership.organizationId,
      workspaceId: currentMembership.workspaceId,
      role: currentMembership.role,
      status: currentMembership.status,
      permissions: currentMembership.permissions
    },
    permissions: currentMembership.permissions
  };
}

async function executeJob(job) {
  switch (job.job_type) {
    case 'campaign.dispatch': {
      const { dispatchCampaignDelivery } = require('../campaigns/service');
      const context = await resolveWorkerContext(
        job.clinic_id,
        job.payload_json?.actorUserId || null,
        job.payload_json?.workspaceId || null
      );
      await dispatchCampaignDelivery(context, job.payload_json.deliveryId);
      return { type: 'campaign.dispatch', deliveryId: job.payload_json.deliveryId };
    }
    case 'automation.execute': {
      const { executeExecutionById } = require('../automation/service');
      const context = await resolveWorkerContext(
        job.clinic_id,
        job.payload_json?.actorUserId || null,
        job.payload_json?.workspaceId || null
      );
      await executeExecutionById(context, job.payload_json.executionId);
      return { type: 'automation.execute', executionId: job.payload_json.executionId };
    }
    case 'event.dispatch.retry': {
      const { retryDomainEventDelivery } = require('../event-bus/publisher');
      const retryResult = await retryDomainEventDelivery(
        job.payload_json.eventId,
        job.payload_json.failedSubscribers || []
      );

      if (retryResult.failedSubscribers.length > 0) {
        throw new AppError(
          503,
          'EVENT_SUBSCRIBER_RETRY_FAILED',
          `Retry failed for subscribers: ${retryResult.failedSubscribers.join(', ')}`,
          retryResult
        );
      }

      return {
        type: 'event.dispatch.retry',
        eventId: retryResult.event.id,
        retriedSubscribers: retryResult.retriedSubscribers
      };
    }
    case 'noop':
      return { type: 'noop', ok: true };
    default:
      throw new AppError(400, 'UNSUPPORTED_WORKER_JOB', `Unsupported worker job type: ${job.job_type}`);
  }
}

module.exports = {
  executeJob,
  resolveWorkerContext
};