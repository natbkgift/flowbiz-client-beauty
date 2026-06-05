'use strict';

const { matchPath } = require('../../common/routing');
const { AppError } = require('../../common/errors');
const {
  confirmAppointmentFromAcceptedSlotOffer,
  listConfirmedAppointments,
  getConfirmedAppointmentDetail,
  updateConfirmedAppointmentStatus
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
    throw new AppError(403, 'CONFIRMED_APPOINTMENT_PERMISSION_DENIED', 'Confirmed appointment read permission is required.');
  }
}

function assertManagePermission(context) {
  assertClinicContext(context);
  const role = getBookingQueueRole(context);
  const normalizedRole = context.currentMembership?.role;
  if (!['owner', 'manager', 'marketing', 'sales', 'admin'].includes(role) && normalizedRole !== 'admin') {
    throw new AppError(403, 'CONFIRMED_APPOINTMENT_PERMISSION_DENIED', 'Confirmed appointment management permission is required.');
  }
}

async function handleAppointmentRoutes(request, response, url, tools) {
  const { authenticateRequest, parseJsonBody, json } = tools;

  const confirmParams = matchPath(url.pathname, '/admin/booking-requests/:id/slot-offers/:offerId/confirm-appointment');
  if (confirmParams && request.method === 'POST') {
    const context = await authenticateRequest(request);
    assertManagePermission(context);
    const result = await confirmAppointmentFromAcceptedSlotOffer(context, confirmParams.id, confirmParams.offerId);
    return json(response, result.idempotent ? 200 : 201, result);
  }

  if (url.pathname === '/admin/confirmed-appointments' && request.method === 'GET') {
    const context = await authenticateRequest(request);
    assertReadPermission(context);
    const result = await listConfirmedAppointments(context, url.searchParams);
    return json(response, 200, result);
  }

  const statusParams = matchPath(url.pathname, '/admin/confirmed-appointments/:id/status');
  if (statusParams && request.method === 'PATCH') {
    const context = await authenticateRequest(request);
    assertManagePermission(context);
    const body = await parseJsonBody(request);
    const result = await updateConfirmedAppointmentStatus(context, statusParams.id, body);
    return json(response, 200, result);
  }

  const detailParams = matchPath(url.pathname, '/admin/confirmed-appointments/:id');
  if (detailParams && request.method === 'GET') {
    const context = await authenticateRequest(request);
    assertReadPermission(context);
    const result = await getConfirmedAppointmentDetail(context, detailParams.id);
    return json(response, 200, result);
  }

  return false;
}

module.exports = {
  handleAppointmentRoutes
};
