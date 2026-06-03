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

async function handleNotificationRoutes(request, response, url, tools) {
  const { authenticateRequest, json } = tools;

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
