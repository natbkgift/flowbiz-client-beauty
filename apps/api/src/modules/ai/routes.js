const { matchPath } = require('../../common/routing');
const { authenticateAndAuthorize } = require('../rbac/service');
const {
  getLeadScore,
  getCustomerScore,
  getLeadRecommendations,
  getCustomerRecommendations,
  scoreLead,
  generateLeadMessage,
  getFlowInsights,
  recomputeLeadInsights,
  recomputeCustomerInsights
} = require('./service');
const { trackOutcome, getAiPerformance } = require('../ai-feedback/service');
const { executeAutoAction } = require('../ai-actions/service');
const { getLeadPrediction, getCustomerPrediction } = require('../ai-engine/prediction');

async function handleAiRoutes(request, response, url, helpers) {
  const { authenticateRequest, parseJsonBody, json } = helpers;
  const autoActionParams = matchPath(url.pathname, '/ai/auto-action/:leadId');
  const performanceParams = matchPath(url.pathname, '/ai/performance/:entityId');
  const scoreLeadParams = matchPath(url.pathname, '/ai/score-lead/:leadId');

  if (url.pathname === '/ai/track-outcome' && request.method === 'POST') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'ai', 'manage');
    const body = await parseJsonBody(request);
    const result = await trackOutcome(context, body);
    json(response, result.duplicate ? 200 : 201, result);
    return true;
  }

  if (autoActionParams && request.method === 'POST') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'ai', 'manage');
    const result = await executeAutoAction(context, Number.parseInt(autoActionParams.leadId, 10));
    json(response, 200, result);
    return true;
  }

  if (performanceParams && request.method === 'GET') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'ai', 'read');
    const result = await getAiPerformance(
      context,
      Number.parseInt(performanceParams.entityId, 10),
      url.searchParams.get('entityType') || 'lead'
    );
    json(response, 200, result);
    return true;
  }

  if (scoreLeadParams && request.method === 'POST') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'ai', 'manage');
    const result = await scoreLead(context, Number.parseInt(scoreLeadParams.leadId, 10));
    json(response, 200, result);
    return true;
  }

  if (url.pathname === '/ai/generate-message' && request.method === 'POST') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'ai', 'manage');
    const body = await parseJsonBody(request);
    const result = await generateLeadMessage(context, body);
    json(response, 200, result);
    return true;
  }

  const flowInsightParams = matchPath(url.pathname, '/ai/flow-insights/:flowId');

  if (flowInsightParams && request.method === 'GET') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'ai', 'read');
    const result = await getFlowInsights(context, Number.parseInt(flowInsightParams.flowId, 10));
    json(response, 200, result);
    return true;
  }

  const leadScoreParams = matchPath(url.pathname, '/ai/leads/:leadId/score');

  if (leadScoreParams && request.method === 'GET') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'ai', 'read');
    const result = await getLeadScore(context, Number.parseInt(leadScoreParams.leadId, 10));
    json(response, 200, result);
    return true;
  }

  const customerScoreParams = matchPath(url.pathname, '/ai/customers/:customerId/score');

  if (customerScoreParams && request.method === 'GET') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'ai', 'read');
    const result = await getCustomerScore(context, Number.parseInt(customerScoreParams.customerId, 10));
    json(response, 200, result);
    return true;
  }

  const leadRecommendationParams = matchPath(url.pathname, '/ai/leads/:leadId/recommendations');

  if (leadRecommendationParams && request.method === 'GET') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'ai', 'read');
    const result = await getLeadRecommendations(context, Number.parseInt(leadRecommendationParams.leadId, 10));
    json(response, 200, result);
    return true;
  }

  const customerRecommendationParams = matchPath(url.pathname, '/ai/customers/:customerId/recommendations');

  if (customerRecommendationParams && request.method === 'GET') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'ai', 'read');
    const result = await getCustomerRecommendations(context, Number.parseInt(customerRecommendationParams.customerId, 10));
    json(response, 200, result);
    return true;
  }

  const recomputeLeadParams = matchPath(url.pathname, '/ai/recompute/lead/:leadId');

  const leadPredictionParams = matchPath(url.pathname, '/ai/leads/:leadId/prediction');

  if (leadPredictionParams && request.method === 'GET') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'ai', 'read');
    const result = await getLeadPrediction(context, Number.parseInt(leadPredictionParams.leadId, 10));
    json(response, 200, result);
    return true;
  }

  const customerPredictionParams = matchPath(url.pathname, '/ai/customers/:customerId/prediction');

  if (customerPredictionParams && request.method === 'GET') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'ai', 'read');
    const result = await getCustomerPrediction(context, Number.parseInt(customerPredictionParams.customerId, 10));
    json(response, 200, result);
    return true;
  }

  if (recomputeLeadParams && request.method === 'POST') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'ai', 'manage');
    const result = await recomputeLeadInsights(context, Number.parseInt(recomputeLeadParams.leadId, 10));
    json(response, 200, result);
    return true;
  }

  const recomputeCustomerParams = matchPath(url.pathname, '/ai/recompute/customer/:customerId');

  if (recomputeCustomerParams && request.method === 'POST') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'ai', 'manage');
    const result = await recomputeCustomerInsights(context, Number.parseInt(recomputeCustomerParams.customerId, 10));
    json(response, 200, result);
    return true;
  }

  return false;
}

module.exports = {
  handleAiRoutes
};
