const { matchPath } = require('../../common/routing');
const { AppError } = require('../../common/errors');
const {
  authenticateAndAuthorize,
  hasAnyPermission,
  hasPermission
} = require('../rbac/service');
const { resolvePublicClinicId, resolvePublicClinicContext } = require('../public-content/tenant');
const {
  createTopic,
  listTopics,
  getTopicByIdOrSlug,
  createReply,
  listReplies,
  verifyReply,
  updateTopicStatus
} = require('./service');

async function handleForumRoutes(request, response, url, tools) {
  const { authenticateRequest, parseJsonBody, json } = tools;

  // 1. GET /forum/topics (public listing)
  if (url.pathname === '/forum/topics' && request.method === 'GET') {
    let clinicId;
    let canModerate = false;
    try {
      const context = await authenticateRequest(request);
      clinicId = context.currentClinic.id;
      canModerate = hasAnyPermission(context, [['forum', 'moderate'], ['forum', 'medical_answer']]);
    } catch (_) {
      clinicId = resolvePublicClinicId(url);
    }

    const topics = await listTopics(clinicId, {
      category: url.searchParams.get('category'),
      status: canModerate ? (url.searchParams.get('status') || 'active') : 'active',
      limit: url.searchParams.get('limit'),
      offset: url.searchParams.get('offset')
    });
    return json(response, 200, topics);
  }

  // 2. GET /forum/topics/:idOrSlug (public detail + replies)
  const idOrSlugParams = matchPath(url.pathname, '/forum/topics/:idOrSlug');
  if (idOrSlugParams && request.method === 'GET') {
    let clinicId;
    try {
      const context = await authenticateRequest(request);
      clinicId = context.currentClinic.id;
    } catch (_) {
      clinicId = resolvePublicClinicId(url);
    }

    try {
      const topic = await getTopicByIdOrSlug(clinicId, idOrSlugParams.idOrSlug);
      const replies = await listReplies(clinicId, topic.id);
      return json(response, 200, { ...topic, replies });
    } catch (err) {
      if (err.code === 'TOPIC_NOT_FOUND') {
        return json(response, 404, { error: 'Not Found', message: err.message });
      }
      throw err;
    }
  }

  // 3. POST /forum/topics (create topic)
  if (url.pathname === '/forum/topics' && request.method === 'POST') {
    let clinicContext;
    try {
      clinicContext = await authenticateRequest(request);
    } catch (_) {
      clinicContext = resolvePublicClinicContext(url);
    }

    const body = await parseJsonBody(request);
    const topic = await createTopic(clinicContext, body);
    return json(response, 201, topic);
  }

  // 4. POST /forum/topics/:topicId/replies (create reply)
  const replyParams = matchPath(url.pathname, '/forum/topics/:topicId/replies');
  if (replyParams && request.method === 'POST') {
    let clinicContext;
    let isDoctorReply = false;
    
    try {
      clinicContext = await authenticateRequest(request);
      if (hasPermission(clinicContext, 'forum', 'medical_answer')) {
        isDoctorReply = true; // Auto-detect as doctor/clinic reply if posted by owner/admin
      }
    } catch (_) {
      clinicContext = resolvePublicClinicContext(url);
    }

    const body = await parseJsonBody(request);
    const topicId = Number(replyParams.topicId);
    
    try {
      const reply = await createReply(clinicContext, topicId, {
        ...body,
        isDoctorReply
      });
      return json(response, 201, reply);
    } catch (err) {
      if (err.code === 'TOPIC_NOT_FOUND') {
        return json(response, 404, { error: 'Not Found', message: err.message });
      }
      throw err;
    }
  }

  // 5. PUT /forum/replies/:replyId/verify (mark reply as verified answer - Admin only)
  const verifyParams = matchPath(url.pathname, '/forum/replies/:replyId/verify');
  if (verifyParams && request.method === 'PUT') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'forum', 'medical_answer');

    const body = await parseJsonBody(request);
    const replyId = Number(verifyParams.replyId);
    const isVerified = body.isVerified !== undefined ? body.isVerified : true;

    try {
      const result = await verifyReply(context, replyId, isVerified);
      return json(response, 200, result);
    } catch (err) {
      if (err.code === 'REPLY_NOT_FOUND') {
        return json(response, 404, { error: 'Not Found', message: err.message });
      }
      throw err;
    }
  }

  // 6. PUT /forum/topics/:topicId/status (lock/hide topic - Admin only)
  const statusParams = matchPath(url.pathname, '/forum/topics/:topicId/status');
  if (statusParams && request.method === 'PUT') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'forum', 'moderate');

    const body = await parseJsonBody(request);
    const topicId = Number(statusParams.topicId);
    const status = body.status; // active, locked, hidden

    if (!['active', 'locked', 'hidden'].includes(status)) {
      throw new AppError(400, 'INVALID_PAYLOAD', 'Invalid status value.');
    }

    try {
      const topic = await updateTopicStatus(context, topicId, status);
      return json(response, 200, topic);
    } catch (err) {
      if (err.code === 'TOPIC_NOT_FOUND') {
        return json(response, 404, { error: 'Not Found', message: err.message });
      }
      throw err;
    }
  }

  return false;
}

module.exports = {
  handleForumRoutes
};
