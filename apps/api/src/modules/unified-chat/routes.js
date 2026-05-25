const { matchPath } = require('../../common/routing');
const { AppError } = require('../../common/errors');
const { authenticateAndAuthorize } = require('../rbac/service');
const {
  listUnifiedChats,
  getUnifiedChatMessages,
  sendUnifiedMessage
} = require('./service');

async function handleUnifiedChatRoutes(request, response, url, tools) {
  const { authenticateRequest, parseJsonBody, json } = tools;

  if (url.pathname === '/chats' && request.method === 'GET') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'message', 'read');
    const chats = await listUnifiedChats(context);
    return json(response, 200, chats);
  }

  const threadMessagesParams = matchPath(url.pathname, '/chats/:threadId/messages');
  if (threadMessagesParams && request.method === 'GET') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'message', 'read');
    const threadId = Number.parseInt(threadMessagesParams.threadId, 10);
    const messages = await getUnifiedChatMessages(context, threadId);
    return json(response, 200, messages);
  }

  const sendParams = matchPath(url.pathname, '/chats/:threadId/send');
  if (sendParams && request.method === 'POST') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'message', 'write');
    const threadId = Number.parseInt(sendParams.threadId, 10);
    const body = await parseJsonBody(request);
    
    if (!body || !body.messageText) {
      throw new AppError(400, 'INVALID_PAYLOAD', 'messageText is required.');
    }

    const result = await sendUnifiedMessage(context, threadId, body);
    return json(response, 201, result);
  }

  return false;
}

module.exports = {
  handleUnifiedChatRoutes
};
