'use strict';

const { matchPath } = require('../../common/routing');
const { AppError } = require('../../common/errors');
const {
  listServicePackages,
  createServicePackage,
  updateServicePackage,
  assignPackageToMember,
  listMemberPackagesForAdmin,
  createPaymentRecord,
  listPaymentRecords
} = require('./service');

function assertClinicContext(context) {
  if (!context?.currentClinic?.id) {
    throw new AppError(403, 'CLINIC_CONTEXT_REQUIRED', 'Clinic context is required.');
  }
}

function getRole(context) {
  return context.currentMembership?.legacyRole || context.currentMembership?.role;
}

function assertReadPermission(context) {
  assertClinicContext(context);
  const role = getRole(context);
  const normalizedRole = context.currentMembership?.role;
  if (!['owner', 'manager', 'marketing', 'sales', 'staff', 'admin', 'operator'].includes(role) && !['admin', 'operator'].includes(normalizedRole)) {
    throw new AppError(403, 'PACKAGE_PAYMENT_PERMISSION_DENIED', 'Package/payment read permission is required.');
  }
}

function assertManagePermission(context) {
  assertClinicContext(context);
  const role = getRole(context);
  const normalizedRole = context.currentMembership?.role;
  if (!['owner', 'manager', 'admin'].includes(role) && normalizedRole !== 'admin') {
    throw new AppError(403, 'PACKAGE_PAYMENT_PERMISSION_DENIED', 'Package/payment manage permission is required.');
  }
}

async function handlePackagePaymentRoutes(request, response, url, tools) {
  const { authenticateRequest, parseJsonBody, json } = tools;

  if (url.pathname === '/admin/packages' && request.method === 'GET') {
    const context = await authenticateRequest(request);
    assertReadPermission(context);
    const result = await listServicePackages(context, url.searchParams);
    return json(response, 200, result);
  }

  if (url.pathname === '/admin/packages' && request.method === 'POST') {
    const context = await authenticateRequest(request);
    assertManagePermission(context);
    const body = await parseJsonBody(request);
    const result = await createServicePackage(context, body);
    return json(response, 201, result);
  }

  const packageParams = matchPath(url.pathname, '/admin/packages/:packageId');
  if (packageParams && request.method === 'PATCH') {
    const context = await authenticateRequest(request);
    assertManagePermission(context);
    const body = await parseJsonBody(request);
    const result = await updateServicePackage(context, packageParams.packageId, body);
    return json(response, 200, result);
  }

  const memberPackageParams = matchPath(url.pathname, '/admin/members/:memberId/packages');
  if (memberPackageParams && request.method === 'GET') {
    const context = await authenticateRequest(request);
    assertReadPermission(context);
    const result = await listMemberPackagesForAdmin(context, memberPackageParams.memberId, url.searchParams);
    return json(response, 200, result);
  }

  if (memberPackageParams && request.method === 'POST') {
    const context = await authenticateRequest(request);
    assertManagePermission(context);
    const body = await parseJsonBody(request);
    const result = await assignPackageToMember(context, memberPackageParams.memberId, body);
    return json(response, 201, result);
  }

  if (url.pathname === '/admin/payment-records' && request.method === 'GET') {
    const context = await authenticateRequest(request);
    assertReadPermission(context);
    const result = await listPaymentRecords(context, url.searchParams);
    return json(response, 200, result);
  }

  if (url.pathname === '/admin/payment-records' && request.method === 'POST') {
    const context = await authenticateRequest(request);
    assertManagePermission(context);
    const body = await parseJsonBody(request);
    const result = await createPaymentRecord(context, body);
    return json(response, 201, result);
  }

  return false;
}

module.exports = {
  handlePackagePaymentRoutes,
  assertReadPermission,
  assertManagePermission
};
