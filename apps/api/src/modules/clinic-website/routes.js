const { matchPath } = require('../../common/routing');
const { AppError } = require('../../common/errors');
const {
  getClinicWebsitePayload,
  updateWebsiteSettings,
  updateBrandingSettings,
  updateContactSettings,
  updateLocationSettings,
  createHomepageSection,
  updateHomepageSection,
  deleteHomepageSection,
  reorderHomepageSections
} = require('./service');

function assertClinicContext(context) {
  if (!context?.currentClinic?.id) {
    throw new AppError(403, 'CLINIC_CONTEXT_REQUIRED', 'Clinic context is required.');
  }
}

function assertWritePermission(context) {
  assertClinicContext(context);
  const role = context.currentMembership?.role;
  if (!['owner', 'manager', 'marketing'].includes(role)) {
    throw new AppError(403, 'INSUFFICIENT_PERMISSIONS', 'คุณไม่มีสิทธิ์แก้ไขเว็บไซต์คลินิกนี้ กรุณาใช้บัญชี Clinic Owner หรือ Manager ของคลินิก');
  }
}

function assertReadPermission(context) {
  assertClinicContext(context);
  const role = context.currentMembership?.role;
  if (!['owner', 'manager', 'marketing', 'sales', 'staff'].includes(role)) {
    throw new AppError(403, 'INSUFFICIENT_PERMISSIONS', 'คุณไม่มีสิทธิ์ดูข้อมูลเว็บไซต์คลินิกนี้');
  }
}

async function handleClinicWebsiteRoutes(request, response, url, tools) {
  const { authenticateRequest, parseJsonBody, json } = tools;

  // 1. GET /admin/clinic-website
  if (url.pathname === '/admin/clinic-website' && request.method === 'GET') {
    const context = await authenticateRequest(request);
    assertReadPermission(context);
    const result = await getClinicWebsitePayload(context.currentClinic.id);
    return json(response, 200, result);
  }

  // 2. PATCH /admin/clinic-website/settings
  if (url.pathname === '/admin/clinic-website/settings' && request.method === 'PATCH') {
    const context = await authenticateRequest(request);
    assertWritePermission(context);
    const body = await parseJsonBody(request);
    if (body.clinicId !== undefined || body.clinic_id !== undefined) {
      throw new AppError(400, 'INVALID_REQUEST', 'clinicId cannot be overridden.');
    }
    const result = await updateWebsiteSettings(context.currentClinic.id, context.currentUser.id, body);
    return json(response, 200, result);
  }

  // 3. PATCH /admin/clinic-website/branding
  if (url.pathname === '/admin/clinic-website/branding' && request.method === 'PATCH') {
    const context = await authenticateRequest(request);
    assertWritePermission(context);
    const body = await parseJsonBody(request);
    if (body.clinicId !== undefined || body.clinic_id !== undefined) {
      throw new AppError(400, 'INVALID_REQUEST', 'clinicId cannot be overridden.');
    }
    const result = await updateBrandingSettings(context.currentClinic.id, context.currentUser.id, body);
    return json(response, 200, result);
  }

  // 4. PATCH /admin/clinic-website/contact
  if (url.pathname === '/admin/clinic-website/contact' && request.method === 'PATCH') {
    const context = await authenticateRequest(request);
    assertWritePermission(context);
    const body = await parseJsonBody(request);
    if (body.clinicId !== undefined || body.clinic_id !== undefined) {
      throw new AppError(400, 'INVALID_REQUEST', 'clinicId cannot be overridden.');
    }
    const result = await updateContactSettings(context.currentClinic.id, context.currentUser.id, body);
    return json(response, 200, result);
  }

  // 5. PATCH /admin/clinic-website/location
  if (url.pathname === '/admin/clinic-website/location' && request.method === 'PATCH') {
    const context = await authenticateRequest(request);
    assertWritePermission(context);
    const body = await parseJsonBody(request);
    if (body.clinicId !== undefined || body.clinic_id !== undefined) {
      throw new AppError(400, 'INVALID_REQUEST', 'clinicId cannot be overridden.');
    }
    const result = await updateLocationSettings(context.currentClinic.id, context.currentUser.id, body);
    return json(response, 200, result);
  }

  // 6. POST /admin/clinic-website/sections
  if (url.pathname === '/admin/clinic-website/sections' && request.method === 'POST') {
    const context = await authenticateRequest(request);
    assertWritePermission(context);
    const body = await parseJsonBody(request);
    if (body.clinicId !== undefined || body.clinic_id !== undefined) {
      throw new AppError(400, 'INVALID_REQUEST', 'clinicId cannot be overridden.');
    }
    const result = await createHomepageSection(context.currentClinic.id, context.currentUser.id, body);
    return json(response, 201, result);
  }

  // 7. PATCH /admin/clinic-website/sections/reorder (Matched before dynamic :id path)
  if (url.pathname === '/admin/clinic-website/sections/reorder' && request.method === 'PATCH') {
    const context = await authenticateRequest(request);
    assertWritePermission(context);
    const body = await parseJsonBody(request);
    if (body.clinicId !== undefined || body.clinic_id !== undefined) {
      throw new AppError(400, 'INVALID_REQUEST', 'clinicId cannot be overridden.');
    }
    const result = await reorderHomepageSections(context.currentClinic.id, context.currentUser.id, body);
    return json(response, 200, result);
  }

  // 8. PATCH /admin/clinic-website/sections/:id
  const sectionDetailParams = matchPath(url.pathname, '/admin/clinic-website/sections/:id');
  if (sectionDetailParams && request.method === 'PATCH') {
    const context = await authenticateRequest(request);
    assertWritePermission(context);
    const body = await parseJsonBody(request);
    if (body.clinicId !== undefined || body.clinic_id !== undefined) {
      throw new AppError(400, 'INVALID_REQUEST', 'clinicId cannot be overridden.');
    }
    const result = await updateHomepageSection(
      context.currentClinic.id,
      context.currentUser.id,
      Number(sectionDetailParams.id),
      body
    );
    return json(response, 200, result);
  }

  // 9. DELETE /admin/clinic-website/sections/:id
  if (sectionDetailParams && request.method === 'DELETE') {
    const context = await authenticateRequest(request);
    assertWritePermission(context);
    const result = await deleteHomepageSection(
      context.currentClinic.id,
      context.currentUser.id,
      Number(sectionDetailParams.id)
    );
    return json(response, 200, result);
  }

  return false;
}

module.exports = {
  handleClinicWebsiteRoutes
};
