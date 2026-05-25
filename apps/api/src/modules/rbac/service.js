const { AppError } = require('../../common/errors');

const LEGACY_ROLE_TO_KEY = {
  owner: 'owner',
  manager: 'admin',
  marketing: 'admin',
  sales: 'operator',
  staff: 'operator'
};

function normalizeRoleKey(roleKey) {
  return LEGACY_ROLE_TO_KEY[roleKey] || roleKey || 'viewer';
}

function buildPermissionKey(resource, action) {
  return `${resource}.${action}`;
}

function hasPermission(context, resource, action) {
  const permissionKey = buildPermissionKey(resource, action);
  const permissions = context?.currentMembership?.permissions || [];
  return permissions.includes(permissionKey);
}

function hasAnyPermission(context, permissions) {
  return permissions.some(([resource, action]) => hasPermission(context, resource, action));
}

function authorize(context, resource, action) {
  if (!hasPermission(context, resource, action)) {
    throw new AppError(403, 'FORBIDDEN', `Missing permission ${buildPermissionKey(resource, action)}.`);
  }

  return context;
}

function authorizeAny(context, permissions) {
  if (!permissions.some(([resource, action]) => hasPermission(context, resource, action))) {
    throw new AppError(
      403,
      'FORBIDDEN',
      `Missing any required permission: ${permissions.map(([resource, action]) => buildPermissionKey(resource, action)).join(', ')}.`
    );
  }

  return context;
}

async function authenticateAndAuthorize(request, authenticateRequest, resource, action) {
  const context = await authenticateRequest(request);
  authorize(context, resource, action);
  return context;
}

async function authenticateAndAuthorizeAny(request, authenticateRequest, permissions) {
  const context = await authenticateRequest(request);
  authorizeAny(context, permissions);
  return context;
}

module.exports = {
  LEGACY_ROLE_TO_KEY,
  normalizeRoleKey,
  buildPermissionKey,
  hasPermission,
  hasAnyPermission,
  authorize,
  authorizeAny,
  authenticateAndAuthorize,
  authenticateAndAuthorizeAny
};
