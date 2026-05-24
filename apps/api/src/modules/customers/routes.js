const { matchPath } = require('../../common/routing');
const { authenticateAndAuthorize } = require('../rbac/service');
const {
  listCustomers,
  getCustomerDetail,
  convertLeadToCustomer,
  addCustomerNote,
  getCustomerTimeline
} = require('./service');
const { sendCustomerManualMessage } = require('../messaging/service');

async function handleCustomerRoutes(request, response, url, helpers) {
  const { authenticateRequest, parseJsonBody, json } = helpers;

  if (url.pathname === '/customers' && request.method === 'GET') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'contact', 'read');
    const customers = await listCustomers(context.currentClinic.id, url.searchParams);
    json(response, 200, customers);
    return true;
  }

  if (url.pathname === '/customers/convert-from-lead' && request.method === 'POST') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'contact', 'write');
    const body = await parseJsonBody(request);
    const customer = await convertLeadToCustomer(context, body);
    json(response, 201, customer);
    return true;
  }

  const customerDetailParams = matchPath(url.pathname, '/customers/:customerId');

  if (customerDetailParams && request.method === 'GET') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'contact', 'read');
    const customer = await getCustomerDetail(context.currentClinic.id, Number.parseInt(customerDetailParams.customerId, 10));
    json(response, 200, customer);
    return true;
  }

  const customerTimelineParams = matchPath(url.pathname, '/customers/:customerId/timeline');

  if (customerTimelineParams && request.method === 'GET') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'contact', 'read');
    const timeline = await getCustomerTimeline(
      context.currentClinic.id,
      Number.parseInt(customerTimelineParams.customerId, 10),
      url.searchParams
    );
    json(response, 200, timeline);
    return true;
  }

  const customerNoteParams = matchPath(url.pathname, '/customers/:customerId/notes');

  if (customerNoteParams && request.method === 'POST') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'contact', 'write');
    const body = await parseJsonBody(request);
    const note = await addCustomerNote(context, Number.parseInt(customerNoteParams.customerId, 10), body);
    json(response, 201, note);
    return true;
  }

  const customerMessageParams = matchPath(url.pathname, '/customers/:customerId/messages');

  if (customerMessageParams && request.method === 'POST') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'message', 'write');
    const body = await parseJsonBody(request);
    const message = await sendCustomerManualMessage(context, Number.parseInt(customerMessageParams.customerId, 10), body);
    json(response, 201, message);
    return true;
  }

  return false;
}

module.exports = {
  handleCustomerRoutes
};