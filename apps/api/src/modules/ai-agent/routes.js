const { matchPath } = require('../../common/routing');
const {
  handleInboundMessage,
  getApprovalQueue,
  approveOrOverrideMessage,
  getAiCopilotSuggestion,
  getAgentRules,
  updateAgentRule
} = require('./conversation-service');

async function handleAiAgentRoutes(request, response, url, tools) {
  const { authenticateRequest, parseJsonBody, json } = tools;

  if (url.pathname === '/ai-agent/copilot/suggest' && request.method === 'GET') {
    const context = await authenticateRequest(request);
    const messageText = url.searchParams.get('messageText');
    const leadId = Number.parseInt(url.searchParams.get('leadId'), 10);

    if (!messageText || !leadId) {
      return json(response, 400, { error: 'Bad Request', message: 'messageText and leadId are required' });
    }

    const suggestion = await getAiCopilotSuggestion(
      context.currentClinic.id,
      leadId,
      messageText
    );
    return json(response, 200, suggestion);
  }

  if (url.pathname === '/ai-agent/approval-queue' && request.method === 'GET') {
    const context = await authenticateRequest(request);
    const queue = await getApprovalQueue(context.currentClinic.id);
    return json(response, 200, queue);
  }

  const approveParams = matchPath(url.pathname, '/ai-agent/approve/:messageId');
  if (approveParams && request.method === 'POST') {
    const context = await authenticateRequest(request);
    const body = await parseJsonBody(request).catch(() => ({}));
    const message = await approveOrOverrideMessage(
      context.currentClinic.id,
      Number(approveParams.messageId),
      body.staffOverrideText || null
    );
    return json(response, 200, message);
  }

  if (url.pathname === '/ai-agent/inbound' && request.method === 'POST') {
    const context = await authenticateRequest(request);
    const body = await parseJsonBody(request);
    const message = await handleInboundMessage(
      context.currentClinic.id,
      body.leadId,
      body.text
    );
    return json(response, 201, message);
  }

  if (url.pathname === '/ai-agent/rules' && request.method === 'GET') {
    const context = await authenticateRequest(request);
    const rules = await getAgentRules(context.currentClinic.id);
    return json(response, 200, rules);
  }

  if (url.pathname === '/ai-agent/rules' && request.method === 'POST') {
    const context = await authenticateRequest(request);
    const body = await parseJsonBody(request);
    const { agentType, systemPrompt, temperature, rulesConfig } = body;
    if (!agentType || !systemPrompt || temperature === undefined) {
      return json(response, 400, { error: 'Bad Request', message: 'agentType, systemPrompt, and temperature are required' });
    }
    const rule = await updateAgentRule(
      context.currentClinic.id,
      agentType,
      systemPrompt,
      Number(temperature),
      rulesConfig || {}
    );
    return json(response, 200, rule);
  }

  return false;
}

module.exports = {
  handleAiAgentRoutes
};
