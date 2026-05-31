const crypto = require('node:crypto');
const { getPool } = require('../../db');
const { loadConfig } = require('../../config');
const { AppError } = require('../../common/errors');
const { verifyPassword } = require('./password');
const { createSessionToken, verifySessionToken } = require('./token');
const { toPublicUser } = require('../users/user-entity');
const { getMembershipsByUserId, resolveMembership } = require('../tenancy/service');
const { signup } = require('../onboarding/service');

const config = loadConfig();

function buildAccessSummary(memberships, currentMembership) {
  return {
    roles: [...new Set(memberships.map((membership) => membership.role))],
    permissions: currentMembership.permissions
  };
}

async function findUserByEmail(email) {
  const result = await getPool().query(
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

async function findUserById(userId) {
  const result = await getPool().query(
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

async function recordSuccessfulLogin(userId) {
  await getPool().query('update users set last_login_at = now() where id = $1', [userId]);
}

async function createSession(userId, clinicId) {
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + config.authTokenTtlHours * 60 * 60 * 1000);

  await getPool().query(
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

async function findActiveSession(sessionId) {
  const result = await getPool().query(
    `
      select id, user_id, clinic_id, expires_at, revoked_at
      from auth_sessions
      where id = $1
      limit 1
    `,
    [sessionId]
  );

  const session = result.rows[0] || null;

  if (!session) {
    return null;
  }

  if (session.revoked_at || new Date(session.expires_at).getTime() <= Date.now()) {
    return null;
  }

  return session;
}

async function revokeSession(sessionId) {
  await getPool().query(
    `
      update auth_sessions
      set revoked_at = now()
      where id = $1
        and revoked_at is null
    `,
    [sessionId]
  );
}

function extractBearerToken(request) {
  const authorization = request.headers.authorization;

  if (!authorization) {
    throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.');
  }

  const [scheme, token] = authorization.split(' ');

  if (scheme !== 'Bearer' || !token) {
    throw new AppError(401, 'INVALID_AUTH_HEADER', 'Authorization header must use the Bearer scheme.');
  }

  return token;
}

async function login(payload) {
  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  const password = typeof payload.password === 'string' ? payload.password : '';
  const clinicSlug = typeof payload.clinicSlug === 'string' ? payload.clinicSlug.trim() : undefined;

  if (!email || !password) {
    throw new AppError(400, 'INVALID_CREDENTIALS', 'Email and password are required.');
  }

  const user = await findUserByEmail(email);

  if (!user || user.status !== 'active' || !verifyPassword(password, user.password_hash)) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
  }

  const memberships = await getMembershipsByUserId(user.id);
  const currentMembership = resolveMembership(memberships, { clinicSlug });
  const session = await createSession(user.id, currentMembership.clinic.id);

  await recordSuccessfulLogin(user.id);

  const refreshedUser = await findUserById(user.id);
  const token = createSessionToken(
    {
      userId: user.id,
      clinicId: currentMembership.clinic.id,
      sessionId: session.sessionId
    },
    config.authTokenSecret,
    config.authTokenTtlHours
  );
  const accessSummary = buildAccessSummary(memberships, currentMembership);

  return {
    token,
    user: toPublicUser(refreshedUser),
    currentClinic: currentMembership.clinic,
    currentOrganization: currentMembership.organization,
    currentWorkspace: currentMembership.workspace,
    currentMembership: {
      clinicId: currentMembership.clinicId,
      organizationId: currentMembership.organizationId,
      workspaceId: currentMembership.workspaceId,
      role: currentMembership.role,
      legacyRole: currentMembership.legacyRole,
      status: currentMembership.status,
      permissions: currentMembership.permissions
    },
    roles: accessSummary.roles,
    permissions: accessSummary.permissions,
    memberships: memberships.map((membership) => ({
      clinicId: membership.clinicId,
      organizationId: membership.organizationId,
      workspaceId: membership.workspaceId,
      role: membership.role,
      legacyRole: membership.legacyRole,
      status: membership.status,
      permissions: membership.permissions,
      clinic: membership.clinic,
      organization: membership.organization,
      workspace: membership.workspace
    }))
  };
}

async function authenticateRequest(request) {
  const token = extractBearerToken(request);
  const tokenPayload = verifySessionToken(token, config.authTokenSecret);

  if (!tokenPayload) {
    throw new AppError(401, 'INVALID_TOKEN', 'The supplied token is invalid or expired.');
  }

  const user = await findUserById(tokenPayload.sub);

  if (!user || user.status !== 'active') {
    throw new AppError(401, 'INVALID_TOKEN', 'The supplied token is invalid or expired.');
  }

  const session = await findActiveSession(tokenPayload.sid);

  if (!session || String(session.user_id) !== String(user.id) || String(session.clinic_id) !== String(tokenPayload.clinicId)) {
    throw new AppError(401, 'INVALID_TOKEN', 'The supplied token is invalid or expired.');
  }

  const memberships = await getMembershipsByUserId(user.id);
  const requestedClinicSlug =
    typeof request.headers['x-clinic-slug'] === 'string' ? request.headers['x-clinic-slug'].trim() : undefined;
  const requestedWorkspaceSlug =
    typeof request.headers['x-workspace-slug'] === 'string' ? request.headers['x-workspace-slug'].trim() : undefined;

  const currentMembership = resolveMembership(memberships, {
    clinicSlug: requestedClinicSlug,
    clinicId: requestedClinicSlug ? undefined : tokenPayload.clinicId,
    workspaceSlug: requestedWorkspaceSlug
  });
  const accessSummary = buildAccessSummary(memberships, currentMembership);

  return {
    tokenPayload,
    sessionId: session.id,
    currentUser: toPublicUser(user),
    currentClinic: currentMembership.clinic,
    currentOrganization: currentMembership.organization,
    currentWorkspace: currentMembership.workspace,
    currentMembership: {
      clinicId: currentMembership.clinicId,
      organizationId: currentMembership.organizationId,
      workspaceId: currentMembership.workspaceId,
      role: currentMembership.role,
      legacyRole: currentMembership.legacyRole,
      status: currentMembership.status,
      permissions: currentMembership.permissions
    },
    roles: accessSummary.roles,
    permissions: accessSummary.permissions,
    memberships: memberships.map((membership) => ({
      clinicId: membership.clinicId,
      organizationId: membership.organizationId,
      workspaceId: membership.workspaceId,
      role: membership.role,
      legacyRole: membership.legacyRole,
      status: membership.status,
      permissions: membership.permissions,
      clinic: membership.clinic,
      organization: membership.organization,
      workspace: membership.workspace
    }))
  };
}

async function logout(request) {
  const context = await authenticateRequest(request);
  await revokeSession(context.sessionId);
}

module.exports = {
  login,
  signup,
  authenticateRequest,
  logout,
  buildAccessSummary
};
