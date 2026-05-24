const { getOverview, getFunnel, getMessagingAnalytics, getAutomationAnalytics, getAiAnalytics } = require('./service');
const { authenticateAndAuthorize } = require('../rbac/service');

async function handleAnalyticsRoutes(request, response, url, helpers) {
  const { authenticateRequest, json } = helpers;

  if (url.pathname === '/analytics/overview' && request.method === 'GET') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'analytics', 'read');
    const result = await getOverview(context.currentClinic.id, url.searchParams);
    json(response, 200, result);
    return true;
  }

  if (url.pathname === '/analytics/funnel' && request.method === 'GET') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'analytics', 'read');
    const result = await getFunnel(context.currentClinic.id, url.searchParams);
    json(response, 200, result);
    return true;
  }

  if (url.pathname === '/analytics/messaging' && request.method === 'GET') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'analytics', 'read');
    const result = await getMessagingAnalytics(context.currentClinic.id, url.searchParams);
    json(response, 200, result);
    return true;
  }

  if (url.pathname === '/analytics/automation' && request.method === 'GET') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'analytics', 'read');
    const result = await getAutomationAnalytics(context.currentClinic.id, url.searchParams);
    json(response, 200, result);
    return true;
  }

  if (url.pathname === '/analytics/ai' && request.method === 'GET') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'analytics', 'read');
    const result = await getAiAnalytics(context.currentClinic.id, url.searchParams);
    json(response, 200, result);
    return true;
  }

  return false;
}

module.exports = {
  handleAnalyticsRoutes
};