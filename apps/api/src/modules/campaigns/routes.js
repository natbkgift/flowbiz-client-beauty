const { matchPath } = require('../../common/routing');
const {
  createCampaign,
  getCampaign,
  previewCampaignTargetCount,
  enqueueCampaignBroadcast
} = require('./service');

async function handleCampaignRoutes(request, response, url, tools) {
  const { authenticateRequest, authenticateAndAuthorize, parseJsonBody, json } = tools;

  if (url.pathname === '/campaigns' && request.method === 'POST') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'broadcast', 'manage');
    const body = await parseJsonBody(request);
    const campaign = await createCampaign(context, body);
    return json(response, 201, campaign);
  }

  if (url.pathname === '/campaigns/preview' && request.method === 'POST') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'broadcast', 'manage');
    const body = await parseJsonBody(request);
    const result = await previewCampaignTargetCount(context, body);
    return json(response, 200, result);
  }

  const campaignDetailParams = matchPath(url.pathname, '/campaigns/:campaignId');
  if (campaignDetailParams && request.method === 'GET') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'broadcast', 'manage');
    const campaign = await getCampaign(context, Number.parseInt(campaignDetailParams.campaignId, 10));
    return json(response, 200, campaign);
  }

  const campaignSendParams = matchPath(url.pathname, '/campaigns/:campaignId/send');
  if (campaignSendParams && request.method === 'POST') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'broadcast', 'manage');
    const campaign = await enqueueCampaignBroadcast(context, Number.parseInt(campaignSendParams.campaignId, 10));
    return json(response, 200, campaign);
  }

  return false;
}

module.exports = {
  handleCampaignRoutes
};
