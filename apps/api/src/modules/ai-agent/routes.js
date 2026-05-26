const { matchPath } = require('../../common/routing');
const { AppError } = require('../../common/errors');
const { authenticateAndAuthorize } = require('../rbac/service');
const { recordAuditLog } = require('../audit/service');
const {
  handleInboundMessage,
  getApprovalQueue,
  approveOrOverrideMessage,
  rejectAiMessage,
  queueApprovedMessageForOutbound,
  getAiCopilotSuggestion,
  getAgentRules,
  updateAgentRule
} = require('./conversation-service');

function isProductionRuntime() {
  return (process.env.APP_ENV || 'development') === 'production';
}

async function handleAiAgentRoutes(request, response, url, tools) {
  const { authenticateRequest, parseJsonBody, json } = tools;

  if (url.pathname === '/ai-agent/copilot/suggest' && request.method === 'GET') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'ai', 'read');
    const messageText = url.searchParams.get('messageText');
    const leadId = Number.parseInt(url.searchParams.get('leadId'), 10);

    if (!messageText || !leadId) {
      throw new AppError(400, 'INVALID_QUERY', 'messageText and leadId are required.');
    }

    const suggestion = await getAiCopilotSuggestion(
      context.currentClinic.id,
      leadId,
      messageText,
      { actorUserId: context.currentUser.id }
    );
    return json(response, 200, suggestion);
  }

  if (url.pathname === '/ai-agent/approval-queue' && request.method === 'GET') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'ai', 'read');
    const queue = await getApprovalQueue(context.currentClinic.id, { workspaceId: context.currentWorkspace?.id || null });
    await recordAuditLog({
      clinicId: context.currentClinic.id,
      entityType: 'ai_hitl_queue',
      entityId: context.currentClinic.id,
      actionType: 'ai.hitl_queue_viewed',
      actorUserId: context.currentUser.id,
      contextJson: {
        pendingCount: queue.length
      }
    });
    return json(response, 200, queue);
  }

  const approveParams = matchPath(url.pathname, '/ai-agent/approve/:messageId');
  if (approveParams && request.method === 'POST') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'ai', 'manage');
    const body = await parseJsonBody(request).catch(() => ({}));
    const message = await approveOrOverrideMessage(
      context.currentClinic.id,
      Number(approveParams.messageId),
      body.staffOverrideText || null,
      {
        actorUserId: context.currentUser.id,
        workspaceId: context.currentWorkspace?.id || null
      }
    );
    return json(response, 200, message);
  }

  const rejectParams = matchPath(url.pathname, '/ai-agent/reject/:messageId');
  if (rejectParams && request.method === 'POST') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'ai', 'manage');
    const body = await parseJsonBody(request).catch(() => ({}));
    const message = await rejectAiMessage(
      context.currentClinic.id,
      Number(rejectParams.messageId),
      {
        actorUserId: context.currentUser.id,
        workspaceId: context.currentWorkspace?.id || null,
        rejectionReason: body.rejectionReason || null
      }
    );
    return json(response, 200, message);
  }

  const outboundParams = matchPath(url.pathname, '/ai-agent/outbound/:messageId');
  if (outboundParams && request.method === 'POST') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'ai', 'manage');
    const body = await parseJsonBody(request);
    const result = await queueApprovedMessageForOutbound(
      context,
      Number(outboundParams.messageId),
      {
        channelId: body.channelId,
        scheduledAt: body.scheduledAt || null
      }
    );
    return json(response, 201, result);
  }

  if (url.pathname === '/ai-agent/inbound' && request.method === 'POST') {
    if (isProductionRuntime()) {
      throw new AppError(404, 'NOT_FOUND', 'Route not found.');
    }

    const context = await authenticateAndAuthorize(request, authenticateRequest, 'ai', 'manage');
    const body = await parseJsonBody(request);
    const message = await handleInboundMessage(
      context.currentClinic.id,
      body.leadId,
      body.text,
      { actorUserId: context.currentUser.id }
    );
    return json(response, 201, message);
  }

  if (url.pathname === '/ai-agent/rules' && request.method === 'GET') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'ai', 'read');
    const rules = await getAgentRules(context.currentClinic.id);
    return json(response, 200, rules);
  }

  if (url.pathname === '/ai-agent/rules' && request.method === 'POST') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'ai', 'manage');
    const body = await parseJsonBody(request);
    const { agentType, systemPrompt, temperature, rulesConfig } = body;
    if (!agentType || !systemPrompt || temperature === undefined) {
      throw new AppError(400, 'INVALID_PAYLOAD', 'agentType, systemPrompt, and temperature are required.');
    }
    const rule = await updateAgentRule(
      context.currentClinic.id,
      agentType,
      systemPrompt,
      Number(temperature),
      rulesConfig || {},
      { actorUserId: context.currentUser.id }
    );
    return json(response, 200, rule);
  }

  return false;
}

module.exports = {
  handleAiAgentRoutes
};
