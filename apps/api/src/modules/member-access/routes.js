'use strict';

const { matchPath } = require('../../common/routing');
const { checkRateLimit } = require('../../common/rate-limiter');
const { AppError } = require('../../common/errors');
const {
  requestMemberMagicLink,
  verifyMemberMagicToken
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

  return false;
}

module.exports = {
  handleMemberAccessRoutes
};
