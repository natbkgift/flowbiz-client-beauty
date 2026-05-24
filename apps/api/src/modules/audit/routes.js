const { matchPath } = require('../../common/routing');
const { listAuditLogs, listAuditLogsByEntity } = require('./service');
const { authenticateAndAuthorize } = require('../rbac/service');

async function handleAuditRoutes(request, response, url, helpers) {
  const { authenticateRequest, json } = helpers;

  if (url.pathname === '/audit/logs' && request.method === 'GET') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'audit', 'read');
    const result = await listAuditLogs(context.currentClinic.id, url.searchParams);
    json(response, 200, result);
    return true;
  }

  const auditEntityParams = matchPath(url.pathname, '/audit/entity/:type/:id');

  if (auditEntityParams && request.method === 'GET') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'audit', 'read');
    const result = await listAuditLogsByEntity(
      context.currentClinic.id,
      auditEntityParams.type,
      Number.parseInt(auditEntityParams.id, 10)
    );
    json(response, 200, result);
    return true;
  }

  return false;
}

module.exports = {
  handleAuditRoutes
};