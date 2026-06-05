'use strict';

const { matchPath } = require('../../common/routing');
const { checkRateLimit } = require('../../common/rate-limiter');
const { AppError } = require('../../common/errors');
const {
  requestMemberMagicLink,
  verifyMemberMagicToken,
  respondToMemberSlotOffer
} = require('./service');

function requestMeta(request) {
  return {
    ip: request.socket?.remoteAddress || request.headers['x-forwarded-for'] || null,
    userAgent: request.headers['user-agent'] || null
  };
}

async function handleMemberAccessRoutes(request, response, url, tools) {
  const { parseJsonBody, json } = tools;

  const requestParams = matchPath(url.pathname, '/public/clinics/:slug/member-access/request');
  if (requestParams && request.method === 'POST') {
    const limitCheck = checkRateLimit(request, 20, 60000);
    if (!limitCheck.allowed) {
      throw new AppError(429, 'RATE_LIMIT_EXCEEDED', limitCheck.message);
    }

    const body = await parseJsonBody(request);
    const result = await requestMemberMagicLink(requestParams.slug, body, requestMeta(request));
    return json(response, 200, result);
  }

  const sessionParams = matchPath(url.pathname, '/public/clinics/:slug/member-access/session');
  if (sessionParams && request.method === 'GET') {
    const limitCheck = checkRateLimit(request, 60, 60000);
    if (!limitCheck.allowed) {
      throw new AppError(429, 'RATE_LIMIT_EXCEEDED', limitCheck.message);
    }

    if (url.searchParams.has('clinicId') || url.searchParams.has('clinic_id')) {
      throw new AppError(400, 'INVALID_MEMBER_ACCESS_PAYLOAD', 'clinicId cannot be supplied for public member access.');
    }

    const result = await verifyMemberMagicToken(sessionParams.slug, url.searchParams.get('token'), requestMeta(request));
    return json(response, 200, result);
  }

  const portalSessionParams = matchPath(url.pathname, '/public/clinics/:slug/member-portal/session');
  if (portalSessionParams && request.method === 'GET') {
    const limitCheck = checkRateLimit(request, 60, 60000);
    if (!limitCheck.allowed) {
      throw new AppError(429, 'RATE_LIMIT_EXCEEDED', limitCheck.message);
    }

    if (url.searchParams.has('clinicId') || url.searchParams.has('clinic_id')) {
      throw new AppError(400, 'INVALID_MEMBER_ACCESS_PAYLOAD', 'clinicId cannot be supplied for public member access.');
    }

    const result = await verifyMemberMagicToken(portalSessionParams.slug, url.searchParams.get('token'), requestMeta(request));
    return json(response, 200, result);
  }

  const responseParams = matchPath(url.pathname, '/public/clinics/:slug/member-access/slot-offers/:offerId/respond');
  if (responseParams && request.method === 'POST') {
    const limitCheck = checkRateLimit(request, 60, 60000);
    if (!limitCheck.allowed) {
      throw new AppError(429, 'RATE_LIMIT_EXCEEDED', limitCheck.message);
    }

    if (
      url.searchParams.has('clinicId') ||
      url.searchParams.has('clinic_id') ||
      url.searchParams.has('memberId') ||
      url.searchParams.has('member_id') ||
      url.searchParams.has('leadId') ||
      url.searchParams.has('lead_id')
    ) {
      throw new AppError(400, 'INVALID_SLOT_OFFER_RESPONSE', 'Tenant, member, and lead identifiers cannot be supplied for public slot offer response.');
    }

    const body = await parseJsonBody(request);
    const result = await respondToMemberSlotOffer(responseParams.slug, responseParams.offerId, body, requestMeta(request));
    return json(response, 200, result);
  }

  return false;
}

module.exports = {
  handleMemberAccessRoutes
};
