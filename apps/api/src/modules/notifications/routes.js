'use strict';

const { matchPath } = require('../../common/routing');
const {
  listAdminNotificationDrafts,
  getAdminNotificationDraft
} = require('./service');

async function handleNotificationRoutes(request, response, url, tools) {
  const { authenticateRequest, json } = tools;

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

  return false;
}

module.exports = {
  handleNotificationRoutes
};
