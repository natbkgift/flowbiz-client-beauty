const { matchPath } = require('../../common/routing');
const { authenticateAndAuthorizeAny, authenticateAndAuthorize } = require('../rbac/service');
const {
  getTenantSettings,
  updateTenantSettings,
  getOrganizationSettings,
  updateOrganizationSettings,
  getWorkspaceSettings,
  updateWorkspaceSettings
} = require('./service');

async function handleSettingsRoutes(request, response, url, helpers) {
  const { authenticateRequest, parseJsonBody, json } = helpers;

  if (url.pathname === '/tenant/settings' && request.method === 'GET') {
    const context = await authenticateAndAuthorizeAny(request, authenticateRequest, [
      ['tenant', 'read'],
      ['tenant', 'manage']
    ]);
    const result = await getTenantSettings(context);
    json(response, 200, result);
    return true;
  }

  if (url.pathname === '/tenant/settings' && request.method === 'PATCH') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'tenant', 'manage');
    const body = await parseJsonBody(request);
    const result = await updateTenantSettings(context, body);
    json(response, 200, result);
    return true;
  }

  const organizationParams = matchPath(url.pathname, '/organization/:organizationId');

  if (organizationParams && request.method === 'GET') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'organization', 'read');
    const result = await getOrganizationSettings(context, Number.parseInt(organizationParams.organizationId, 10));
    json(response, 200, result);
    return true;
  }

  if (organizationParams && request.method === 'PATCH') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'organization', 'manage');
    const body = await parseJsonBody(request);
    const result = await updateOrganizationSettings(context, Number.parseInt(organizationParams.organizationId, 10), body);
    json(response, 200, result);
    return true;
  }

  const workspaceParams = matchPath(url.pathname, '/workspace/:workspaceId');

  if (workspaceParams && request.method === 'GET') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'workspace', 'read');
    const result = await getWorkspaceSettings(context, Number.parseInt(workspaceParams.workspaceId, 10));
    json(response, 200, result);
    return true;
  }

  if (workspaceParams && request.method === 'PATCH') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'workspace', 'manage');
    const body = await parseJsonBody(request);
    const result = await updateWorkspaceSettings(context, Number.parseInt(workspaceParams.workspaceId, 10), body);
    json(response, 200, result);
    return true;
  }

  return false;
}

module.exports = {
  handleSettingsRoutes
};