'use strict';

const { matchPath } = require('../../common/routing');
const { checkRateLimit } = require('../../common/rate-limiter');
const { AppError } = require('../../common/errors');
const {
  createPublicBookingRequest,
  listAdminBookingRequests,
  getAdminBookingRequestDetail,
  updateAdminBookingRequestStatus,
  updateAdminBookingRequestSlotStatus,
  listAdminBookingRequestSlotOffers,
  createAdminBookingRequestSlotOffer,
  updateAdminBookingRequestSlotOfferStatus,
  addAdminBookingRequestNote
} = require('./service');

function assertClinicContext(context) {
  if (!context?.currentClinic?.id) {
    throw new AppError(403, 'CLINIC_CONTEXT_REQUIRED', 'Clinic context is required.');
  }
}

function getBookingQueueRole(context) {
  return context.currentMembership?.legacyRole || context.currentMembership?.role;
}

function assertReadPermission(context) {
  assertClinicContext(context);
  const role = getBookingQueueRole(context);
  const normalizedRole = context.currentMembership?.role;
  if (!['owner', 'manager', 'marketing', 'sales', 'staff', 'admin', 'operator'].includes(role) && !['admin', 'operator'].includes(normalizedRole)) {
    throw new AppError(403, 'BOOKING_REQUEST_PERMISSION_DENIED', 'Booking request read permission is required.');
  }
}

function assertManagePermission(context) {
  assertClinicContext(context);
  const role = getBookingQueueRole(context);
  const normalizedRole = context.currentMembership?.role;
  if (!['owner', 'manager', 'marketing', 'sales', 'admin'].includes(role) && normalizedRole !== 'admin') {
    throw new AppError(403, 'BOOKING_REQUEST_PERMISSION_DENIED', 'Booking request management permission is required.');
  }
}

function assertSlotOfferManagePermission(context) {
  assertClinicContext(context);
  const role = getBookingQueueRole(context);
  const normalizedRole = context.currentMembership?.role;
  if (!['owner', 'manager', 'marketing', 'sales', 'admin'].includes(role) && normalizedRole !== 'admin') {
    throw new AppError(403, 'SLOT_OFFER_PERMISSION_DENIED', 'Slot offer management permission is required.');
  }
}

async function handleBookingRequestRoutes(request, response, url, tools) {
  const { authenticateRequest, parseJsonBody, json } = tools;

  if (url.pathname === '/admin/booking-requests' && request.method === 'GET') {
    const context = await authenticateRequest(request);
    assertReadPermission(context);
    const result = await listAdminBookingRequests(context, url.searchParams);
    return json(response, 200, result);
  }

  const adminDetailParams = matchPath(url.pathname, '/admin/booking-requests/:id');
  if (adminDetailParams && request.method === 'GET') {
    const context = await authenticateRequest(request);
    assertReadPermission(context);
    const result = await getAdminBookingRequestDetail(context, adminDetailParams.id);
    return json(response, 200, result);
  }

  const adminStatusParams = matchPath(url.pathname, '/admin/booking-requests/:id/status');
  if (adminStatusParams && request.method === 'PATCH') {
    const context = await authenticateRequest(request);
    assertManagePermission(context);
    const body = await parseJsonBody(request);
    const result = await updateAdminBookingRequestStatus(context, adminStatusParams.id, body);
    return json(response, 200, result);
  }

  const adminSlotStatusParams = matchPath(url.pathname, '/admin/booking-requests/:id/slot-status');
  if (adminSlotStatusParams && request.method === 'PATCH') {
    const context = await authenticateRequest(request);
    assertManagePermission(context);
    const body = await parseJsonBody(request);
    const result = await updateAdminBookingRequestSlotStatus(context, adminSlotStatusParams.id, body);
    return json(response, 200, result);
  }

  const adminSlotOfferStatusParams = matchPath(url.pathname, '/admin/booking-requests/:id/slot-offers/:offerId/status');
  if (adminSlotOfferStatusParams && request.method === 'PATCH') {
    const context = await authenticateRequest(request);
    assertSlotOfferManagePermission(context);
    const body = await parseJsonBody(request);
    const result = await updateAdminBookingRequestSlotOfferStatus(
      context,
      adminSlotOfferStatusParams.id,
      adminSlotOfferStatusParams.offerId,
      body
    );
    return json(response, 200, result);
  }

  const adminSlotOffersParams = matchPath(url.pathname, '/admin/booking-requests/:id/slot-offers');
  if (adminSlotOffersParams && request.method === 'GET') {
    const context = await authenticateRequest(request);
    assertReadPermission(context);
    const result = await listAdminBookingRequestSlotOffers(context, adminSlotOffersParams.id, url.searchParams);
    return json(response, 200, result);
  }

  if (adminSlotOffersParams && request.method === 'POST') {
    const context = await authenticateRequest(request);
    assertSlotOfferManagePermission(context);
    const body = await parseJsonBody(request);
    const result = await createAdminBookingRequestSlotOffer(context, adminSlotOffersParams.id, body);
    return json(response, 201, result);
  }

  const adminNoteParams = matchPath(url.pathname, '/admin/booking-requests/:id/notes');
  if (adminNoteParams && request.method === 'POST') {
    const context = await authenticateRequest(request);
    assertManagePermission(context);
    const body = await parseJsonBody(request);
    const result = await addAdminBookingRequestNote(context, adminNoteParams.id, body);
    return json(response, 201, result);
  }

  const publicParams = matchPath(url.pathname, '/public/clinics/:slug/booking-requests');
  if (!publicParams || request.method !== 'POST') {
    return false;
  }

  const limitCheck = checkRateLimit(request, 30, 60000);
  if (!limitCheck.allowed) {
    throw new AppError(429, 'PUBLIC_BOOKING_REQUEST_RATE_LIMITED', limitCheck.message);
  }

  const body = await parseJsonBody(request);
  const result = await createPublicBookingRequest(publicParams.slug, body);
  return json(response, result.botAccepted ? 202 : 201, result);
}

module.exports = {
  handleBookingRequestRoutes
};
