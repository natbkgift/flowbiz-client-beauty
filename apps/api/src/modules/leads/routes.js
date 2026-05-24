const { matchPath } = require('../../common/routing');
const {
  createLead,
  listLeads,
  getLeadDetail,
  updateLead,
  addLeadNote,
  addLeadTag,
  assignLeadOwner,
  transitionLeadStage,
  updateLeadStageStatus,
  getLeadPipeline
} = require('./service');

async function handleLeadRoutes(request, response, url, tools) {
  const { authenticateRequest, authenticateAndAuthorize, parseJsonBody, json } = tools;

  if (url.pathname === '/leads' && request.method === 'GET') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'lead', 'read');
    const leads = await listLeads(context, url.searchParams);
    return json(response, 200, leads);
  }

  if (url.pathname === '/leads' && request.method === 'POST') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'lead', 'write');
    const body = await parseJsonBody(request);
    const lead = await createLead(context, body);
    return json(response, 201, lead);
  }

  if (url.pathname === '/leads/pipeline' && request.method === 'GET') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'lead', 'read');
    const pipeline = await getLeadPipeline(context);
    return json(response, 200, pipeline);
  }

  const leadDetailParams = matchPath(url.pathname, '/leads/:leadId');

  if (leadDetailParams && request.method === 'GET') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'lead', 'read');
    const lead = await getLeadDetail(context, Number.parseInt(leadDetailParams.leadId, 10));
    return json(response, 200, lead);
  }

  if (leadDetailParams && request.method === 'PATCH') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'lead', 'write');
    const body = await parseJsonBody(request);
    const lead = await updateLead(context, Number.parseInt(leadDetailParams.leadId, 10), body);
    return json(response, 200, lead);
  }

  const leadNoteParams = matchPath(url.pathname, '/leads/:leadId/notes');

  if (leadNoteParams && request.method === 'POST') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'lead', 'write');
    const body = await parseJsonBody(request);
    const lead = await addLeadNote(context, Number.parseInt(leadNoteParams.leadId, 10), body);
    return json(response, 200, lead);
  }

  const leadTagParams = matchPath(url.pathname, '/leads/:leadId/tags');

  if (leadTagParams && request.method === 'POST') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'lead', 'write');
    const body = await parseJsonBody(request);
    const lead = await addLeadTag(context, Number.parseInt(leadTagParams.leadId, 10), body);
    return json(response, 200, lead);
  }

  const leadOwnerParams = matchPath(url.pathname, '/leads/:leadId/owner');

  if (leadOwnerParams && request.method === 'POST') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'lead', 'write');
    const body = await parseJsonBody(request);
    const lead = await assignLeadOwner(context, Number.parseInt(leadOwnerParams.leadId, 10), body);
    return json(response, 200, lead);
  }

  const leadStageParams = matchPath(url.pathname, '/leads/:leadId/stage');

  if (leadStageParams && request.method === 'PATCH') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'lead', 'write');
    const body = await parseJsonBody(request);
    const lead = await transitionLeadStage(context, Number.parseInt(leadStageParams.leadId, 10), body);
    return json(response, 200, lead);
  }

  const leadStageStatusParams = matchPath(url.pathname, '/leads/:leadId/stage-status');

  if (leadStageStatusParams && request.method === 'POST') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'lead', 'write');
    const body = await parseJsonBody(request);
    const lead = await updateLeadStageStatus(context, Number.parseInt(leadStageStatusParams.leadId, 10), body);
    return json(response, 200, lead);
  }

  return false;
}

module.exports = {
  handleLeadRoutes
};