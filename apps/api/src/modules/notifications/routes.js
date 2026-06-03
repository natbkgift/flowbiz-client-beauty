'use strict';

const { loadConfig } = require('../../config');
const { matchPath } = require('../../common/routing');
const { getNotificationProviderReadiness } = require('./provider-readiness');
const {
  assertAdminNotificationPreviewContext,
  listAdminNotificationDrafts,
  getAdminNotificationDraft
} = require('./service');
const {
  dryRunNotificationDraftDelivery,
  listNotificationDraftDeliveryAttempts
} = require('./delivery-service');
const {
  approveNotificationDraft,
  cancelNotificationApproval,
  getNotificationApprovalStatus,
  rejectNotificationDraft,
  requestNotificationApproval
} = require('./approval-service');

async function handleNotificationRoutes(request, response, url, tools) {
  const { authenticateRequest, json, parseJsonBody = async () => ({}) } = tools;

  if (url.pathname === '/admin/notification-provider-readiness' && request.method === 'GET') {
    const context = await authenticateRequest(request);
    assertAdminNotificationPreviewContext(context);
    return json(response, 200, {
      notificationProviders: getNotificationProviderReadiness(loadConfig())
    });
  }

  if (url.pathname === '/admin/notification-drafts' && request.method === 'GET') {
    const context = await authenticateRequest(request);
    const result = await listAdminNotificationDrafts(context, url.searchParams);
    return json(response, 200, result);
  }

  const detailParams = matchPath(url.pathname, '/admin/notification-drafts/:id');
  if (detailParams && request.method === 'GET') {
    const context = await authenticateRequest(request);
    const result = await getAdminNotificationDraft(context, detailParams.id);
    return json(response, 200, result);
  }

  const dryRunParams = matchPath(url.pathname, '/admin/notification-drafts/:id/dry-run-delivery');
  if (dryRunParams && request.method === 'POST') {
    const context = await authenticateRequest(request);
    const result = await dryRunNotificationDraftDelivery(context, dryRunParams.id);
    return json(response, 201, result);
  }

  const approvalRequestParams = matchPath(url.pathname, '/admin/notification-drafts/:id/approval-request');
  if (approvalRequestParams && request.method === 'POST') {
    const context = await authenticateRequest(request);
    const body = await parseJsonBody(request);
    const result = await requestNotificationApproval(context, approvalRequestParams.id, body);
    return json(response, 201, result);
  }

  const approvalStatusParams = matchPath(url.pathname, '/admin/notification-drafts/:id/approval-status');
  if (approvalStatusParams && request.method === 'GET') {
    const context = await authenticateRequest(request);
    const result = await getNotificationApprovalStatus(context, approvalStatusParams.id);
    return json(response, 200, result);
  }

  const approveParams = matchPath(url.pathname, '/admin/notification-approval-requests/:id/approve');
  if (approveParams && request.method === 'POST') {
    const context = await authenticateRequest(request);
    const body = await parseJsonBody(request);
    const result = await approveNotificationDraft(context, approveParams.id, body);
    return json(response, 200, result);
  }

  const rejectParams = matchPath(url.pathname, '/admin/notification-approval-requests/:id/reject');
  if (rejectParams && request.method === 'POST') {
    const context = await authenticateRequest(request);
    const body = await parseJsonBody(request);
    const result = await rejectNotificationDraft(context, rejectParams.id, body);
    return json(response, 200, result);
  }

  const cancelParams = matchPath(url.pathname, '/admin/notification-approval-requests/:id/cancel');
  if (cancelParams && request.method === 'POST') {
    const context = await authenticateRequest(request);
    const body = await parseJsonBody(request);
    const result = await cancelNotificationApproval(context, cancelParams.id, body);
    return json(response, 200, result);
  }

  const attemptsParams = matchPath(url.pathname, '/admin/notification-drafts/:id/delivery-attempts');
  if (attemptsParams && request.method === 'GET') {
    const context = await authenticateRequest(request);
    const result = await listNotificationDraftDeliveryAttempts(context, attemptsParams.id);
    return json(response, 200, result);
  }

  return false;
}

module.exports = {
  handleNotificationRoutes
};
