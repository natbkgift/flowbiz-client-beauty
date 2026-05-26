const { matchPath } = require('../../common/routing');
const { handleWixWebhook } = require('./wix-handler');
const { handleZonepangWebhook } = require('./zonepang-handler');
const { handleTikTokWebhook } = require('./tiktok-handler');
const { handleFacebookWebhook } = require('./facebook-handler');
const { checkRateLimit } = require('../../common/rate-limiter');
const { jsonError } = require('../../common/http');

async function handleIntegrationGatewayRoutes(request, response, url, tools) {
  const { parseJsonBody, json } = tools;

  const wixParams = matchPath(url.pathname, '/integration/webhooks/wix/:clinicId/:workspaceId');
  if (wixParams && request.method === 'POST') {
    request.params = {
      clinicId: wixParams.clinicId,
      workspaceId: wixParams.workspaceId
    };
    request.query = Object.fromEntries(url.searchParams);
    
    // API Security Rate Limiter (60 Req / 1 Min window)
    const limitCheck = checkRateLimit(request, 60, 60000);
    if (!limitCheck.allowed) {
      return jsonError(response, 429, 'RATE_LIMIT_EXCEEDED', limitCheck.message);
    }

    request.body = await parseJsonBody(request);
    
    await new Promise((resolve, reject) => {
      handleWixWebhook(request, {
        status(code) {
          response.statusCode = code;
          return this;
        },
        json(data) {
          json(response, response.statusCode || 200, data);
          resolve();
        }
      }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    return true;
  }

  const zonepangParams = matchPath(url.pathname, '/integration/webhooks/zonepang/:clinicId');
  if (zonepangParams && request.method === 'POST') {
    request.params = {
      clinicId: zonepangParams.clinicId
    };
    request.query = Object.fromEntries(url.searchParams);

    // API Security Rate Limiter (60 Req / 1 Min window)
    const limitCheck = checkRateLimit(request, 60, 60000);
    if (!limitCheck.allowed) {
      return jsonError(response, 429, 'RATE_LIMIT_EXCEEDED', limitCheck.message);
    }

    request.body = await parseJsonBody(request);

    await new Promise((resolve, reject) => {
      handleZonepangWebhook(request, {
        status(code) {
          response.statusCode = code;
          return this;
        },
        json(data) {
          json(response, response.statusCode || 200, data);
          resolve();
        }
      }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    return true;
  }

  const tiktokParams = matchPath(url.pathname, '/integration/webhooks/tiktok/:clinicId');
  if (tiktokParams && request.method === 'POST') {
    request.params = {
      clinicId: tiktokParams.clinicId
    };
    request.query = Object.fromEntries(url.searchParams);

    const limitCheck = checkRateLimit(request, 60, 60000);
    if (!limitCheck.allowed) {
      return jsonError(response, 429, 'RATE_LIMIT_EXCEEDED', limitCheck.message);
    }

    request.body = await parseJsonBody(request);

    await new Promise((resolve, reject) => {
      handleTikTokWebhook(request, {
        status(code) {
          response.statusCode = code;
          return this;
        },
        json(data) {
          json(response, response.statusCode || 200, data);
          resolve();
        }
      }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    return true;
  }

  const facebookParams = matchPath(url.pathname, '/integration/webhooks/facebook/:clinicId');
  if (facebookParams && request.method === 'POST') {
    request.params = {
      clinicId: facebookParams.clinicId
    };
    request.query = Object.fromEntries(url.searchParams);

    const limitCheck = checkRateLimit(request, 60, 60000);
    if (!limitCheck.allowed) {
      return jsonError(response, 429, 'RATE_LIMIT_EXCEEDED', limitCheck.message);
    }

    request.body = await parseJsonBody(request);

    await new Promise((resolve, reject) => {
      handleFacebookWebhook(request, {
        status(code) {
          response.statusCode = code;
          return this;
        },
        json(data) {
          json(response, response.statusCode || 200, data);
          resolve();
        }
      }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    return true;
  }

  return false;
}

module.exports = {
  handleIntegrationGatewayRoutes
};
