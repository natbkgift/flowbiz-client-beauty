const { matchPath } = require('../../common/routing');
const { authenticateAndAuthorize, authenticateAndAuthorizeAny } = require('../rbac/service');
const { getSystemHealth, retryFailedJob } = require('./service');

async function handleOpsRoutes(request, response, url, helpers) {
  const { authenticateRequest, json } = helpers;

  if (url.pathname === '/ops/health' && request.method === 'GET') {
    const context = await authenticateAndAuthorizeAny(request, authenticateRequest, [
      ['automation', 'read'],
      ['automation', 'manage'],
      ['audit', 'read']
    ]);
    const result = await getSystemHealth(context.currentClinic.id);
    json(response, 200, result);
    return true;
  }

  const retryParams = matchPath(url.pathname, '/ops/jobs/:jobId/retry');

  if (retryParams && request.method === 'POST') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'automation', 'manage');
    const result = await retryFailedJob(context, Number.parseInt(retryParams.jobId, 10));
    json(response, 200, result);
    return true;
  }

  return false;
}

module.exports = {
  handleOpsRoutes
};