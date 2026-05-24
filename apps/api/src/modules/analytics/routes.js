const { getOverview, getFunnel, getMessagingAnalytics, getAutomationAnalytics, getAiAnalytics } = require('./service');
const { getExecutiveAnalyticsSummary } = require('./executive-service');
const { authenticateAndAuthorize } = require('../rbac/service');
const { getPool } = require('../../db');
const { AppError } = require('../../common/errors');

async function handleAnalyticsRoutes(request, response, url, tools) {
  const { authenticateRequest, json } = tools;

  if (url.pathname === '/analytics/executive/summary' && request.method === 'GET') {
    const context = await authenticateRequest(request);
    
    const userRes = await getPool().query('select is_franchise_admin from users where id = $1', [context.currentUser.id]);
    const isFranchiseAdmin = userRes.rows[0]?.is_franchise_admin || false;

    const searchParams = Object.fromEntries(url.searchParams);
    const requestedOrgId = searchParams.organizationId 
      ? Number(searchParams.organizationId) 
      : Number(context.currentOrganization.id);

    // Security check: must be a franchise admin or belong to the requested organization
    const userBelongsToOrg = Number(context.currentOrganization.id) === requestedOrgId;
    if (!isFranchiseAdmin && !userBelongsToOrg) {
      throw new AppError(403, 'FORBIDDEN', 'Access to executive summary analytics is denied.');
    }

    const summary = await getExecutiveAnalyticsSummary(requestedOrgId);
    return json(response, 200, summary);
  }

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