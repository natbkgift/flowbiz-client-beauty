const { matchPath } = require('../../common/routing');
const { authenticateAndAuthorize } = require('../rbac/service');
const {
  listFlowVersions,
  getFlowVersionDetail,
  createFlowVersion,
  publishFlowVersion
} = require('./service');

async function handleAutomationBuilderRoutes(request, response, url, helpers) {
  const { authenticateRequest, parseJsonBody, json } = helpers;

  const flowVersionListParams = matchPath(url.pathname, '/automation/flows/:flowId/versions');

  if (flowVersionListParams && request.method === 'GET') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'automation', 'read');
    const versions = await listFlowVersions(context, Number.parseInt(flowVersionListParams.flowId, 10));
    json(response, 200, versions);
    return true;
  }

  if (flowVersionListParams && request.method === 'POST') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'automation', 'manage');
    const body = await parseJsonBody(request);
    const version = await createFlowVersion(context, Number.parseInt(flowVersionListParams.flowId, 10), body);
    json(response, 201, version);
    return true;
  }

  const flowVersionDetailParams = matchPath(url.pathname, '/automation/flows/:flowId/versions/:versionId');

  if (flowVersionDetailParams && request.method === 'GET') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'automation', 'read');
    const version = await getFlowVersionDetail(
      context,
      Number.parseInt(flowVersionDetailParams.flowId, 10),
      Number.parseInt(flowVersionDetailParams.versionId, 10)
    );
    json(response, 200, version);
    return true;
  }

  const flowPublishParams = matchPath(url.pathname, '/automation/flows/:flowId/versions/:versionId/publish');

  if (flowPublishParams && request.method === 'POST') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'automation', 'manage');
    const flow = await publishFlowVersion(
      context,
      Number.parseInt(flowPublishParams.flowId, 10),
      Number.parseInt(flowPublishParams.versionId, 10)
    );
    json(response, 200, flow);
    return true;
  }

  return false;
}

module.exports = {
  handleAutomationBuilderRoutes
};
