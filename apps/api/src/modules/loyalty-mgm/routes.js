const { AppError } = require('../../common/errors');
const { authenticateAndAuthorize } = require('../rbac/service');
const { recordAuditLog } = require('../audit/service');

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
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'loyalty', 'read');
    const leadId = Number.parseInt(url.searchParams.get('leadId'), 10);
    if (!leadId) {
      throw new AppError(400, 'INVALID_QUERY', 'leadId parameter is required.');
    }
    const balance = await getLoyaltyBalance(context.currentClinic.id, leadId);
    return json(response, 200, { success: true, leadId, balance });
  }

  if (url.pathname === '/loyalty/referrals' && request.method === 'GET') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'loyalty', 'read');
    const leadId = Number.parseInt(url.searchParams.get('leadId'), 10);
    if (!leadId) {
      throw new AppError(400, 'INVALID_QUERY', 'leadId parameter is required.');
    }
    const items = await getReferralsList(context.currentClinic.id, leadId);
    return json(response, 200, { success: true, referrerLeadId: leadId, items });
  }

  if (url.pathname === '/loyalty/record-purchase' && request.method === 'POST') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'loyalty', 'manage');
    const body = await parseJsonBody(request);
    
    if (!body.leadId || !body.amount) {
      throw new AppError(400, 'INVALID_PAYLOAD', 'leadId and amount are required.');
    }

    const result = await recordPurchaseAndAwardPoints(
      context.currentClinic.id,
      Number(body.leadId),
      Number(body.amount),
      body.description || 'Treatment purchase',
      { actorUserId: context.currentUser.id }
    );
    return json(response, 201, result);
  }

  if (url.pathname === '/loyalty/track-referral' && request.method === 'POST') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'loyalty', 'manage');
    const body = await parseJsonBody(request);

    if (!body.referredLeadId || !body.referralCode) {
      throw new AppError(400, 'INVALID_PAYLOAD', 'referredLeadId and referralCode are required.');
    }

    const referral = await trackReferral(
      context.currentClinic.id,
      body.referralCode,
      Number(body.referredLeadId),
      { actorUserId: context.currentUser.id }
    );
    return json(response, 201, { success: true, referral });
  }

  if (url.pathname === '/loyalty/ad-spend/sync' && request.method === 'POST') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'loyalty', 'manage');
    const result = await syncMockAdSpend(context.currentClinic.id);
    await recordAuditLog({
      clinicId: context.currentClinic.id,
      entityType: 'ad_spend_sync',
      entityId: context.currentClinic.id,
      actionType: 'loyalty.ad_spend_sync_simulated',
      actorUserId: context.currentUser.id,
      contextJson: {
        integrationStatus: 'mock_generated',
        days: 7
      }
    });
    return json(response, 200, result);
  }

  if (url.pathname === '/loyalty/roas-report' && request.method === 'GET') {
    const context = await authenticateAndAuthorize(request, authenticateRequest, 'loyalty', 'read');
    const report = await getRoasReport(context.currentClinic.id);
    return json(response, 200, report);
  }

  return false;
}

module.exports = {
  handleLoyaltyRoutes
};
