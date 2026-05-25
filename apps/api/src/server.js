const http = require('node:http');
const { loadConfig } = require('./config');
const { testConnection, closePool } = require('./db');
const { startWorkerLoop, stopWorkerLoop } = require('./modules/worker-engine/scheduler');
const { json, noContent, sendError, parseJsonBody } = require('./common/http');
const { matchPath } = require('./common/routing');
const { AppError } = require('./common/errors');
const { login, signup, authenticateRequest, logout } = require('./modules/auth/service');
const { authenticateAndAuthorize } = require('./modules/rbac/service');
const { handleLeadRoutes } = require('./modules/leads/routes');
const { handleCampaignRoutes } = require('./modules/campaigns/routes');
const { handleIntegrationGatewayRoutes } = require('./modules/integration-gateway/routes');
const {
  listChannels,
  createChannel,
  listContactIdentities,
  createContactIdentity,
  listTemplates,
  createTemplate,
  updateTemplate,
  sendLeadManualMessage,
  listOutboundMessages
} = require('./modules/messaging/service');
const {
  listFlows,
  getFlowDetail,
  createFlow,
  updateFlow,
  updateFlowStatus,
  handleDomainEvent,
  listExecutions,
  getExecutionDetail,
  listTasks,
  listReminders
} = require('./modules/automation/service');
const { handleAutomationBuilderRoutes } = require('./modules/automation-builder/routes');
const { createBuilderFlow, getExecutionSteps } = require('./modules/automation-builder/service');
const { handleAiRoutes } = require('./modules/ai/routes');
const { handleAiAgentRoutes } = require('./modules/ai-agent/routes');
const { handleAnalyticsRoutes } = require('./modules/analytics/routes');
const { handleAuditRoutes } = require('./modules/audit/routes');
const { handleCustomerRoutes } = require('./modules/customers/routes');
const { handleMembershipRoutes } = require('./modules/memberships/routes');
const { handleSettingsRoutes } = require('./modules/settings/routes');
const { handleOpsRoutes } = require('./modules/ops/routes');
const { handleUnifiedChatRoutes } = require('./modules/unified-chat/routes');
const { handleLoyaltyRoutes } = require('./modules/loyalty-mgm/routes');
const { handleBlogRoutes } = require('./modules/blog/routes');


const config = loadConfig();

async function routeRequest(request, response) {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

  if (url.pathname === '/health' && request.method === 'GET') {
    try {
      const db = await testConnection();

      return json(response, 200, {
        status: 'ok',
        appEnv: config.appEnv,
        database: {
          status: 'connected',
          name: db.database_name
        }
      });
    } catch (error) {
      return json(response, 200, {
        status: 'ok',
        appEnv: config.appEnv,
        database: {
          status: 'unavailable',
          message: error.message
        }
      });
    }
  }

  if (url.pathname === '/' && request.method === 'GET') {
    return json(response, 200, {
      name: 'flowbiz-api',
      message: 'Sprint 1 tenant and auth foundation is running.',
      healthEndpoint: '/health',
      authEndpoints: ['/auth/signup', '/auth/login', '/auth/me', '/tenant-context', '/auth/logout']
    });
  }

  if (url.pathname === '/auth/signup' && request.method === 'POST') {
    const body = await parseJsonBody(request);
    const session = await signup(body);
    return json(response, 201, session);
  }

  if (url.pathname === '/auth/login' && request.method === 'POST') {
    const body = await parseJsonBody(request);
    const session = await login(body);
    return json(response, 200, session);
  }

  if (url.pathname === '/auth/logout' && request.method === 'POST') {
    await logout(request);
    return noContent(response);
  }

  if (url.pathname === '/auth/me' && request.method === 'GET') {
    const context = await authenticateRequest(request);
    return json(response, 200, {
      user: context.currentUser,
      currentClinic: context.currentClinic,
      currentOrganization: context.currentOrganization,
      currentWorkspace: context.currentWorkspace,
      currentMembership: context.currentMembership,
      memberships: context.memberships,
      roles: context.roles,
      permissions: context.permissions
    });
  }

  if (url.pathname === '/tenant-context' && request.method === 'GET') {
    const context = await authenticateRequest(request);
    return json(response, 200, {
      user: context.currentUser,
      currentClinic: context.currentClinic,
      currentOrganization: context.currentOrganization,
      currentWorkspace: context.currentWorkspace,
      currentMembership: context.currentMembership,
      roles: context.roles,
      permissions: context.permissions
    });
  }

  if (await handleMembershipRoutes(request, response, url, { authenticateRequest, parseJsonBody, json })) {
    return;
  }

  if (await handleSettingsRoutes(request, response, url, { authenticateRequest, parseJsonBody, json })) {
    return;
  }

  if (await handleLeadRoutes(request, response, url, { authenticateRequest, authenticateAndAuthorize, parseJsonBody, json })) {
    return;
  }

  if (await handleCampaignRoutes(request, response, url, { authenticateRequest, authenticateAndAuthorize, parseJsonBody, json })) {
    return;
  }

  if (await handleIntegrationGatewayRoutes(request, response, url, { authenticateRequest, authenticateAndAuthorize, parseJsonBody, json })) {
    return;
  }

  if (await handleAiAgentRoutes(request, response, url, { authenticateRequest, parseJsonBody, json })) {
    return;
  }

  if (await handleLoyaltyRoutes(request, response, url, { authenticateRequest, parseJsonBody, json })) {
    return;
  }

  if (await handleBlogRoutes(request, response, url, { authenticateRequest, parseJsonBody, json })) {
    return;
  }

  if (url.pathname === '/channels' && request.method === 'GET') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'workspace', 'manage');
    const channels = await listChannels(context.currentClinic.id);
    return json(response, 200, channels);
  }

  if (url.pathname === '/channels' && request.method === 'POST') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'workspace', 'manage');
    const body = await parseJsonBody(request);
    const channel = await createChannel(context, body);
    return json(response, 201, channel);
  }

  if (url.pathname === '/contact-identities' && request.method === 'GET') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'contact', 'read');
    const identities = await listContactIdentities(context.currentClinic.id, url.searchParams);
    return json(response, 200, identities);
  }

  if (url.pathname === '/contact-identities' && request.method === 'POST') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'contact', 'write');
    const body = await parseJsonBody(request);
    const identity = await createContactIdentity(context, body);
    return json(response, 201, identity);
  }

  if (url.pathname === '/templates' && request.method === 'GET') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'template', 'read');
    const templates = await listTemplates(context.currentClinic.id);
    return json(response, 200, templates);
  }

  if (url.pathname === '/templates' && request.method === 'POST') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'template', 'manage');
    const body = await parseJsonBody(request);
    const template = await createTemplate(context, body);
    return json(response, 201, template);
  }

  if (url.pathname === '/messages/outbound' && request.method === 'GET') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'message', 'read');
    const messages = await listOutboundMessages(context.currentClinic.id, url.searchParams);
    return json(response, 200, messages);
  }

  if (url.pathname === '/automation/executions' && request.method === 'GET') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'automation', 'read');
    const executions = await listExecutions(context, url.searchParams);
    return json(response, 200, executions);
  }

  if (url.pathname === '/automation/flows' && request.method === 'GET') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'automation', 'read');
    const flows = await listFlows(context);
    return json(response, 200, flows);
  }

  if (url.pathname === '/automation/flows' && request.method === 'POST') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'automation', 'manage');
    const body = await parseJsonBody(request);
    const flow = body?.mode === 'builder' || Array.isArray(body?.nodes)
      ? await createBuilderFlow(context, body)
      : await createFlow(context, body);
    return json(response, 201, flow);
  }

  if (url.pathname === '/automation/tasks' && request.method === 'GET') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'automation', 'read');
    const tasks = await listTasks(context, url.searchParams);
    return json(response, 200, tasks);
  }

  if (url.pathname === '/reminders' && request.method === 'GET') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'automation', 'read');
    const reminders = await listReminders(context, url.searchParams);
    return json(response, 200, reminders);
  }

  if (url.pathname === '/automation/events' && request.method === 'POST') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'automation', 'manage');
    const body = await parseJsonBody(request);
    const result = await handleDomainEvent(context, body);
    return json(response, 200, result);
  }

  const leadMessageParams = matchPath(url.pathname, '/leads/:leadId/messages');

  if (leadMessageParams && request.method === 'POST') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'message', 'write');
    const body = await parseJsonBody(request);
    const message = await sendLeadManualMessage(context, Number.parseInt(leadMessageParams.leadId, 10), body);
    return json(response, 201, message);
  }

  const flowStatusParams = matchPath(url.pathname, '/automation/flows/:flowId/status');

  const flowDetailParams = matchPath(url.pathname, '/automation/flows/:flowId');

  if (flowDetailParams && request.method === 'GET') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'automation', 'read');
    const flow = await getFlowDetail(context, Number.parseInt(flowDetailParams.flowId, 10));
    return json(response, 200, flow);
  }

  if (flowDetailParams && request.method === 'PATCH') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'automation', 'manage');
    const body = await parseJsonBody(request);
    const flow = await updateFlow(context, Number.parseInt(flowDetailParams.flowId, 10), body);
    return json(response, 200, flow);
  }

  const executionDetailParams = matchPath(url.pathname, '/automation/executions/:executionId');

  const executionStepsParams = matchPath(url.pathname, '/automation/executions/:executionId/steps');

  if (executionStepsParams && request.method === 'GET') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'automation', 'read');
    const executionSteps = await getExecutionSteps(context, Number.parseInt(executionStepsParams.executionId, 10));
    return json(response, 200, executionSteps);
  }

  if (executionDetailParams && request.method === 'GET') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'automation', 'read');
    const execution = await getExecutionDetail(context, Number.parseInt(executionDetailParams.executionId, 10));
    return json(response, 200, execution);
  }

  if (flowStatusParams && (request.method === 'PATCH' || request.method === 'POST')) {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'automation', 'manage');
    const body = await parseJsonBody(request);
    const flow = await updateFlowStatus(context, Number.parseInt(flowStatusParams.flowId, 10), body);
    return json(response, 200, flow);
  }

  if (flowStatusParams && request.method === 'PATCH') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'automation', 'manage');
    const body = await parseJsonBody(request);
    const flow = await updateFlowStatus(context, Number.parseInt(flowStatusParams.flowId, 10), body);
    return json(response, 200, flow);
  }

  const templateParams = matchPath(url.pathname, '/templates/:templateId');

  if (templateParams && request.method === 'PATCH') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'template', 'manage');
    const body = await parseJsonBody(request);
    const template = await updateTemplate(context, Number.parseInt(templateParams.templateId, 10), body);
    return json(response, 200, template);
  }

  if (await handleCustomerRoutes(request, response, url, { authenticateRequest, parseJsonBody, json })) {
    return;
  }

  if (await handleAutomationBuilderRoutes(request, response, url, { authenticateRequest, parseJsonBody, json })) {
    return;
  }

  if (await handleAiRoutes(request, response, url, { authenticateRequest, parseJsonBody, json })) {
    return;
  }

  if (await handleAnalyticsRoutes(request, response, url, { authenticateRequest, json })) {
    return;
  }

  if (await handleAuditRoutes(request, response, url, { authenticateRequest, json })) {
    return;
  }

  if (await handleUnifiedChatRoutes(request, response, url, { authenticateRequest, parseJsonBody, json })) {
    return;
  }

  if (await handleOpsRoutes(request, response, url, { authenticateRequest, json })) {
    return;
  }

  throw new AppError(404, 'NOT_FOUND', 'Route not found.');
}

const server = http.createServer(async (request, response) => {
  try {
    await routeRequest(request, response);
  } catch (error) {
    sendError(response, error);
  }
});

server.listen(config.apiPort, () => {
  process.stdout.write(`FlowBiz API listening on http://localhost:${config.apiPort}\n`);

  if (config.workerLoopEnabled) {
    const workerLoop = startWorkerLoop({
      intervalMs: config.workerLoopIntervalMs,
      batchSize: config.workerLoopBatchSize
    });
    process.stdout.write(`FlowBiz worker loop ${workerLoop.started ? 'started' : 'already running'} on ${workerLoop.intervalMs}ms interval\n`);
  }
});

async function shutdown() {
  stopWorkerLoop();
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
