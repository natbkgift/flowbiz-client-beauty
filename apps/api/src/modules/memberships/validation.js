const { AppError } = require('../../common/errors');
const { normalizeRoleKey } = require('../rbac/service');

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function validateInvitePayload(payload) {
  const email = normalizeEmail(payload.email);
  const role = normalizeRoleKey(typeof payload.role === 'string' ? payload.role.trim().toLowerCase() : '');

  if (!email) {
    throw new AppError(400, 'INVALID_INVITE_PAYLOAD', 'email is required.');
  }

  if (!['owner', 'admin', 'operator', 'viewer'].includes(role)) {
    throw new AppError(400, 'INVALID_INVITE_ROLE', 'role must be one of owner, admin, operator, or viewer.');
  }

  return {
    email,
    role
  };
}

function validateAcceptInvitePayload(payload) {
  const token = typeof payload.token === 'string' ? payload.token.trim() : '';
  const name = typeof payload.name === 'string' ? payload.name.trim() : '';
  const password = typeof payload.password === 'string' ? payload.password : '';

  if (!token || !name || !password) {
    throw new AppError(400, 'INVALID_ACCEPT_INVITE_PAYLOAD', 'token, name, and password are required.');
  }

  if (password.length < 8) {
    throw new AppError(400, 'WEAK_PASSWORD', 'Password must be at least 8 characters long.');
  }

  return {
    token,
    name,
    password
  };
}

function validateRoleChangePayload(payload) {
  const role = normalizeRoleKey(typeof payload.role === 'string' ? payload.role.trim().toLowerCase() : '');

  if (!['owner', 'admin', 'operator', 'viewer'].includes(role)) {
    throw new AppError(400, 'INVALID_ROLE_CHANGE', 'role must be one of owner, admin, operator, or viewer.');
  }

  return {
    role
  };
}

module.exports = {
  validateInvitePayload,
  validateAcceptInvitePayload,
  validateRoleChangePayload,
  normalizeEmail
};