'use strict';

const { matchPath } = require('../../common/routing');
const { checkRateLimit } = require('../../common/rate-limiter');
const { AppError } = require('../../common/errors');
const { createPublicClinicLead } = require('./service');

async function handlePublicLeadRoutes(request, response, url, tools) {
  const { parseJsonBody, json } = tools;

  const leadParams = matchPath(url.pathname, '/public/clinics/:slug/leads');
  if (!leadParams || request.method !== 'POST') {
    return false;
  }

  const limitCheck = checkRateLimit(request, 30, 60000);
  if (!limitCheck.allowed) {
    throw new AppError(429, 'PUBLIC_LEAD_RATE_LIMITED', limitCheck.message);
  }

  const body = await parseJsonBody(request);
  const result = await createPublicClinicLead(leadParams.slug, body);
  return json(response, result.botAccepted ? 202 : 201, result);
}

module.exports = {
  handlePublicLeadRoutes
};
