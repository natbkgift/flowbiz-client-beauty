'use strict';

const { matchPath } = require('../../common/routing');
const { AppError } = require('../../common/errors');
const {
  listMembersForAdmin,
  getMemberProfileForAdmin,
  updateMemberProfileForAdmin
} = require('./service');

function assertClinicContext(context) {
  if (!context?.currentClinic?.id) {
    throw new AppError(403, 'CLINIC_CONTEXT_REQUIRED', 'Clinic context is required.');
  }
}

function getMemberRole(context) {
  return context.currentMembership?.legacyRole || context.currentMembership?.role;
}

function assertReadPermission(context) {
  assertClinicContext(context);
  const role = getMemberRole(context);
  const normalizedRole = context.currentMembership?.role;
  if (!['owner', 'manager', 'marketing', 'sales', 'staff', 'admin', 'operator'].includes(role) && !['admin', 'operator'].includes(normalizedRole)) {
    throw new AppError(403, 'MEMBER_PERMISSION_DENIED', 'Member read permission is required.');
  }
}

function assertUpdatePermission(context) {
  assertClinicContext(context);
  const role = getMemberRole(context);
  const normalizedRole = context.currentMembership?.role;
  if (!['owner', 'manager', 'marketing', 'sales', 'admin'].includes(role) && normalizedRole !== 'admin') {
    throw new AppError(403, 'MEMBER_PERMISSION_DENIED', 'Member update permission is required.');
  }
}

async function handleMemberRoutes(request, response, url, tools) {
  const { authenticateRequest, parseJsonBody, json } = tools;

  if (url.pathname === '/admin/members' && request.method === 'GET') {
    const context = await authenticateRequest(request);
    assertReadPermission(context);
    const result = await listMembersForAdmin(context, url.searchParams);
    return json(response, 200, result);
  }

  const detailParams = matchPath(url.pathname, '/admin/members/:id');

  if (detailParams && request.method === 'GET') {
    const context = await authenticateRequest(request);
    assertReadPermission(context);
    const result = await getMemberProfileForAdmin(context, detailParams.id);
    return json(response, 200, result);
  }

  if (detailParams && request.method === 'PATCH') {
    const context = await authenticateRequest(request);
    assertUpdatePermission(context);
    const body = await parseJsonBody(request);
    const result = await updateMemberProfileForAdmin(context, detailParams.id, body);
    return json(response, 200, result);
  }

  return false;
}

module.exports = {
  handleMemberRoutes
};
