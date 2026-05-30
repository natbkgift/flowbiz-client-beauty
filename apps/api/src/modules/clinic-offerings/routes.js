'use strict';

const { matchPath } = require('../../common/routing');
const { AppError } = require('../../common/errors');
const {
  listServices,
  createService,
  getService,
  updateService,
  deleteService,
  reorderServices,
  listPromotions,
  createPromotion,
  getPromotion,
  updatePromotion,
  deletePromotion,
  reorderPromotions,
  listPackages,
  createPackage,
  getPackage,
  updatePackage,
  deletePackage,
  reorderPackages,
  addServiceToPackage,
  removeServiceFromPackage,
  reorderPackageServices,
  getPublicServices,
  getPublicPromotions,
  getPublicPackages
} = require('./service');

// ---------------------------------------------------------------------------
// Permission helpers
// ---------------------------------------------------------------------------

function assertClinicContext(context) {
  if (!context?.currentClinic?.id) {
    throw new AppError(403, 'CLINIC_CONTEXT_REQUIRED', 'Clinic context is required.');
  }
}

function assertReadPermission(context) {
  assertClinicContext(context);
  const role = context.currentMembership?.role;
  if (!['owner', 'manager', 'marketing', 'sales', 'staff'].includes(role)) {
    throw new AppError(403, 'INSUFFICIENT_PERMISSIONS', 'คุณไม่มีสิทธิ์ดูข้อมูล offerings ของคลินิกนี้');
  }
}

function assertWritePermission(context) {
  assertClinicContext(context);
  const role = context.currentMembership?.role;
  if (!['owner', 'manager', 'marketing'].includes(role)) {
    throw new AppError(403, 'INSUFFICIENT_PERMISSIONS', 'คุณไม่มีสิทธิ์แก้ไข offerings ของคลินิกนี้ กรุณาใช้บัญชี Clinic Owner หรือ Manager ของคลินิก');
  }
}

/**
 * Reject requests that attempt to override clinic context from body.
 * Hard constraint: clinicId must NEVER come from request body.
 */
function rejectClinicIdInBody(body) {
  if (body.clinicId !== undefined || body.clinic_id !== undefined) {
    throw new AppError(400, 'INVALID_REQUEST', 'clinicId cannot be overridden in the request body.');
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

async function handleClinicOfferingsRoutes(request, response, url, tools) {
  const { authenticateRequest, parseJsonBody, json } = tools;

  // =========================================================================
  // ADMIN – SERVICES
  // =========================================================================

  // GET /admin/clinic-offerings/services
  if (url.pathname === '/admin/clinic-offerings/services' && request.method === 'GET') {
    const context = await authenticateRequest(request);
    assertReadPermission(context);
    const items = await listServices(context.currentClinic.id, url.searchParams);
    return json(response, 200, { items });
  }

  // POST /admin/clinic-offerings/services
  if (url.pathname === '/admin/clinic-offerings/services' && request.method === 'POST') {
    const context = await authenticateRequest(request);
    assertWritePermission(context);
    const body = await parseJsonBody(request);
    rejectClinicIdInBody(body);
    const item = await createService(context.currentClinic.id, context.currentUser.id, body);
    return json(response, 201, item);
  }

  // PATCH /admin/clinic-offerings/services/reorder  (must come before /:id)
  if (url.pathname === '/admin/clinic-offerings/services/reorder' && request.method === 'PATCH') {
    const context = await authenticateRequest(request);
    assertWritePermission(context);
    const body = await parseJsonBody(request);
    rejectClinicIdInBody(body);
    const result = await reorderServices(context.currentClinic.id, context.currentUser.id, body);
    return json(response, 200, result);
  }

  // GET /admin/clinic-offerings/services/:id
  const serviceParams = matchPath(url.pathname, '/admin/clinic-offerings/services/:id');
  if (serviceParams && request.method === 'GET') {
    const context = await authenticateRequest(request);
    assertReadPermission(context);
    const item = await getService(context.currentClinic.id, Number(serviceParams.id));
    return json(response, 200, item);
  }

  // PATCH /admin/clinic-offerings/services/:id
  if (serviceParams && request.method === 'PATCH') {
    const context = await authenticateRequest(request);
    assertWritePermission(context);
    const body = await parseJsonBody(request);
    rejectClinicIdInBody(body);
    const item = await updateService(context.currentClinic.id, context.currentUser.id, Number(serviceParams.id), body);
    return json(response, 200, item);
  }

  // DELETE /admin/clinic-offerings/services/:id
  if (serviceParams && request.method === 'DELETE') {
    const context = await authenticateRequest(request);
    assertWritePermission(context);
    const result = await deleteService(context.currentClinic.id, context.currentUser.id, Number(serviceParams.id));
    return json(response, 200, result);
  }

  // =========================================================================
  // ADMIN – PROMOTIONS
  // =========================================================================

  // GET /admin/clinic-offerings/promotions
  if (url.pathname === '/admin/clinic-offerings/promotions' && request.method === 'GET') {
    const context = await authenticateRequest(request);
    assertReadPermission(context);
    const items = await listPromotions(context.currentClinic.id, url.searchParams);
    return json(response, 200, { items });
  }

  // POST /admin/clinic-offerings/promotions
  if (url.pathname === '/admin/clinic-offerings/promotions' && request.method === 'POST') {
    const context = await authenticateRequest(request);
    assertWritePermission(context);
    const body = await parseJsonBody(request);
    rejectClinicIdInBody(body);
    const item = await createPromotion(context.currentClinic.id, context.currentUser.id, body);
    return json(response, 201, item);
  }

  // PATCH /admin/clinic-offerings/promotions/reorder  (before /:id)
  if (url.pathname === '/admin/clinic-offerings/promotions/reorder' && request.method === 'PATCH') {
    const context = await authenticateRequest(request);
    assertWritePermission(context);
    const body = await parseJsonBody(request);
    rejectClinicIdInBody(body);
    const result = await reorderPromotions(context.currentClinic.id, context.currentUser.id, body);
    return json(response, 200, result);
  }

  // GET /admin/clinic-offerings/promotions/:id
  const promotionParams = matchPath(url.pathname, '/admin/clinic-offerings/promotions/:id');
  if (promotionParams && request.method === 'GET') {
    const context = await authenticateRequest(request);
    assertReadPermission(context);
    const item = await getPromotion(context.currentClinic.id, Number(promotionParams.id));
    return json(response, 200, item);
  }

  // PATCH /admin/clinic-offerings/promotions/:id
  if (promotionParams && request.method === 'PATCH') {
    const context = await authenticateRequest(request);
    assertWritePermission(context);
    const body = await parseJsonBody(request);
    rejectClinicIdInBody(body);
    const item = await updatePromotion(context.currentClinic.id, context.currentUser.id, Number(promotionParams.id), body);
    return json(response, 200, item);
  }

  // DELETE /admin/clinic-offerings/promotions/:id
  if (promotionParams && request.method === 'DELETE') {
    const context = await authenticateRequest(request);
    assertWritePermission(context);
    const result = await deletePromotion(context.currentClinic.id, context.currentUser.id, Number(promotionParams.id));
    return json(response, 200, result);
  }

  // =========================================================================
  // ADMIN – PACKAGES
  // =========================================================================

  // GET /admin/clinic-offerings/packages
  if (url.pathname === '/admin/clinic-offerings/packages' && request.method === 'GET') {
    const context = await authenticateRequest(request);
    assertReadPermission(context);
    const items = await listPackages(context.currentClinic.id, url.searchParams);
    return json(response, 200, { items });
  }

  // POST /admin/clinic-offerings/packages
  if (url.pathname === '/admin/clinic-offerings/packages' && request.method === 'POST') {
    const context = await authenticateRequest(request);
    assertWritePermission(context);
    const body = await parseJsonBody(request);
    rejectClinicIdInBody(body);
    const item = await createPackage(context.currentClinic.id, context.currentUser.id, body);
    return json(response, 201, item);
  }

  // PATCH /admin/clinic-offerings/packages/reorder  (before /:id)
  if (url.pathname === '/admin/clinic-offerings/packages/reorder' && request.method === 'PATCH') {
    const context = await authenticateRequest(request);
    assertWritePermission(context);
    const body = await parseJsonBody(request);
    rejectClinicIdInBody(body);
    const result = await reorderPackages(context.currentClinic.id, context.currentUser.id, body);
    return json(response, 200, result);
  }

  // Nested package-service routes (must come before generic /:id patterns)

  // POST /admin/clinic-offerings/packages/:id/services
  const packageServicesParams = matchPath(url.pathname, '/admin/clinic-offerings/packages/:id/services');
  if (packageServicesParams && request.method === 'POST') {
    const context = await authenticateRequest(request);
    assertWritePermission(context);
    const body = await parseJsonBody(request);
    rejectClinicIdInBody(body);
    const result = await addServiceToPackage(
      context.currentClinic.id,
      context.currentUser.id,
      Number(packageServicesParams.id),
      body
    );
    return json(response, 201, result);
  }

  // PATCH /admin/clinic-offerings/packages/:id/services/reorder
  // matchPath requires exact segment count, so we need a dedicated pattern
  const packageServicesReorderParams = matchPath(url.pathname, '/admin/clinic-offerings/packages/:id/services/reorder');
  if (packageServicesReorderParams && request.method === 'PATCH') {
    const context = await authenticateRequest(request);
    assertWritePermission(context);
    const body = await parseJsonBody(request);
    rejectClinicIdInBody(body);
    const result = await reorderPackageServices(
      context.currentClinic.id,
      context.currentUser.id,
      Number(packageServicesReorderParams.id),
      body
    );
    return json(response, 200, result);
  }

  // DELETE /admin/clinic-offerings/packages/:id/services/:serviceId
  const packageServiceRemoveParams = matchPath(url.pathname, '/admin/clinic-offerings/packages/:id/services/:serviceId');
  if (packageServiceRemoveParams && request.method === 'DELETE') {
    const context = await authenticateRequest(request);
    assertWritePermission(context);
    const result = await removeServiceFromPackage(
      context.currentClinic.id,
      context.currentUser.id,
      Number(packageServiceRemoveParams.id),
      Number(packageServiceRemoveParams.serviceId)
    );
    return json(response, 200, result);
  }

  // GET /admin/clinic-offerings/packages/:id
  const packageParams = matchPath(url.pathname, '/admin/clinic-offerings/packages/:id');
  if (packageParams && request.method === 'GET') {
    const context = await authenticateRequest(request);
    assertReadPermission(context);
    const item = await getPackage(context.currentClinic.id, Number(packageParams.id));
    return json(response, 200, item);
  }

  // PATCH /admin/clinic-offerings/packages/:id
  if (packageParams && request.method === 'PATCH') {
    const context = await authenticateRequest(request);
    assertWritePermission(context);
    const body = await parseJsonBody(request);
    rejectClinicIdInBody(body);
    const item = await updatePackage(context.currentClinic.id, context.currentUser.id, Number(packageParams.id), body);
    return json(response, 200, item);
  }

  // DELETE /admin/clinic-offerings/packages/:id
  if (packageParams && request.method === 'DELETE') {
    const context = await authenticateRequest(request);
    assertWritePermission(context);
    const result = await deletePackage(context.currentClinic.id, context.currentUser.id, Number(packageParams.id));
    return json(response, 200, result);
  }

  // =========================================================================
  // PUBLIC – Read-only, active offerings only, by clinic slug
  // =========================================================================

  // GET /public/clinics/:slug/services
  const publicServicesParams = matchPath(url.pathname, '/public/clinics/:slug/services');
  if (publicServicesParams && request.method === 'GET') {
    const items = await getPublicServices(publicServicesParams.slug);
    return json(response, 200, { items });
  }

  // GET /public/clinics/:slug/promotions
  const publicPromotionsParams = matchPath(url.pathname, '/public/clinics/:slug/promotions');
  if (publicPromotionsParams && request.method === 'GET') {
    const items = await getPublicPromotions(publicPromotionsParams.slug);
    return json(response, 200, { items });
  }

  // GET /public/clinics/:slug/packages
  const publicPackagesParams = matchPath(url.pathname, '/public/clinics/:slug/packages');
  if (publicPackagesParams && request.method === 'GET') {
    const items = await getPublicPackages(publicPackagesParams.slug);
    return json(response, 200, { items });
  }

  return false;
}

module.exports = {
  handleClinicOfferingsRoutes
};
