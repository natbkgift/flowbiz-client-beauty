'use strict';

const { matchPath } = require('../../common/routing');
const { checkRateLimit } = require('../../common/rate-limiter');
const { AppError } = require('../../common/errors');
const { createPublicBookingRequest } = require('./service');

async function handleBookingRequestRoutes(request, response, url, tools) {
  const { parseJsonBody, json } = tools;

  const publicParams = matchPath(url.pathname, '/public/clinics/:slug/booking-requests');
  if (!publicParams || request.method !== 'POST') {
    return false;
  }

  const limitCheck = checkRateLimit(request, 30, 60000);
  if (!limitCheck.allowed) {
    throw new AppError(429, 'PUBLIC_BOOKING_REQUEST_RATE_LIMITED', limitCheck.message);
  }

  const body = await parseJsonBody(request);
  const result = await createPublicBookingRequest(publicParams.slug, body);
  return json(response, result.botAccepted ? 202 : 201, result);
}

module.exports = {
  handleBookingRequestRoutes
};
