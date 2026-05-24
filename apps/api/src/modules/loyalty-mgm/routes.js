const {
  trackReferral,
  recordPurchaseAndAwardPoints,
  getLoyaltyBalance,
  getReferralsList
} = require('./service');

const {
  syncMockAdSpend,
  getRoasReport
} = require('./ad-spend-service');

async function handleLoyaltyRoutes(request, response, url, tools) {
  const { authenticateRequest, parseJsonBody, json } = tools;

  if (url.pathname === '/loyalty/balance' && request.method === 'GET') {
    const context = await authenticateRequest(request);
    const leadId = Number.parseInt(url.searchParams.get('leadId'), 10);
    if (!leadId) {
      return json(response, 400, { error: 'Bad Request', message: 'leadId parameter is required' });
    }
    const balance = await getLoyaltyBalance(context.currentClinic.id, leadId);
    return json(response, 200, { success: true, leadId, balance });
  }

  if (url.pathname === '/loyalty/referrals' && request.method === 'GET') {
    const context = await authenticateRequest(request);
    const leadId = Number.parseInt(url.searchParams.get('leadId'), 10);
    if (!leadId) {
      return json(response, 400, { error: 'Bad Request', message: 'leadId parameter is required' });
    }
    const items = await getReferralsList(context.currentClinic.id, leadId);
    return json(response, 200, { success: true, referrerLeadId: leadId, items });
  }

  if (url.pathname === '/loyalty/record-purchase' && request.method === 'POST') {
    const context = await authenticateRequest(request);
    const body = await parseJsonBody(request);
    
    if (!body.leadId || !body.amount) {
      return json(response, 400, { error: 'Bad Request', message: 'leadId and amount are required' });
    }

    const result = await recordPurchaseAndAwardPoints(
      context.currentClinic.id,
      Number(body.leadId),
      Number(body.amount),
      body.description || 'Treatment purchase'
    );
    return json(response, 201, result);
  }

  if (url.pathname === '/loyalty/track-referral' && request.method === 'POST') {
    const context = await authenticateRequest(request);
    const body = await parseJsonBody(request);

    if (!body.referredLeadId || !body.referralCode) {
      return json(response, 400, { error: 'Bad Request', message: 'referredLeadId and referralCode are required' });
    }

    const referral = await trackReferral(
      context.currentClinic.id,
      body.referralCode,
      Number(body.referredLeadId)
    );
    return json(response, 201, { success: true, referral });
  }

  if (url.pathname === '/loyalty/ad-spend/sync' && request.method === 'POST') {
    const context = await authenticateRequest(request);
    const result = await syncMockAdSpend(context.currentClinic.id);
    return json(response, 200, result);
  }

  if (url.pathname === '/loyalty/roas-report' && request.method === 'GET') {
    const context = await authenticateRequest(request);
    const report = await getRoasReport(context.currentClinic.id);
    return json(response, 200, report);
  }

  return false;
}

module.exports = {
  handleLoyaltyRoutes
};
