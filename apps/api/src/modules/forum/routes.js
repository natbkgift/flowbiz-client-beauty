const { matchPath } = require('../../common/routing');
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
    try {
      const context = await authenticateRequest(request);
      clinicId = context.currentClinic.id;
    } catch (_) {
      clinicId = Number(url.searchParams.get('clinicId')) || 1001;
    }

    const topics = await listTopics(clinicId, {
      category: url.searchParams.get('category'),
      status: url.searchParams.get('status') || 'active',
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
      clinicId = Number(url.searchParams.get('clinicId')) || 1001;
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
      // Public / Guest user
      clinicContext = {
        currentClinic: { id: Number(url.searchParams.get('clinicId')) || 1001 }
      };
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
      const role = clinicContext.currentMembership?.role;
      if (role === 'owner' || role === 'admin') {
        isDoctorReply = true; // Auto-detect as doctor/clinic reply if posted by owner/admin
      }
    } catch (_) {
      clinicContext = {
        currentClinic: { id: Number(url.searchParams.get('clinicId')) || 1001 }
      };
    }

    const body = await parseJsonBody(request);
    const topicId = Number(replyParams.topicId);
    
    try {
      const reply = await createReply(clinicContext, topicId, {
        ...body,
        isDoctorReply: body.isDoctorReply !== undefined ? body.isDoctorReply : isDoctorReply
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
    const context = await authenticateRequest(request);
    const role = context.currentMembership?.role;
    if (role !== 'owner' && role !== 'admin') {
      return json(response, 403, { error: 'Forbidden', message: 'Only clinic administrators can verify forum answers.' });
    }

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
    const context = await authenticateRequest(request);
    const role = context.currentMembership?.role;
    if (role !== 'owner' && role !== 'admin') {
      return json(response, 403, { error: 'Forbidden', message: 'Only clinic administrators can moderate forum topics.' });
    }

    const body = await parseJsonBody(request);
    const topicId = Number(statusParams.topicId);
    const status = body.status; // active, locked, hidden

    if (!['active', 'locked', 'hidden'].includes(status)) {
      return json(response, 400, { error: 'Bad Request', message: 'Invalid status value.' });
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
