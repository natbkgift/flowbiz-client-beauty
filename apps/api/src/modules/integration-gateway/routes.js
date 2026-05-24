const { matchPath } = require('../../common/routing');
const { handleWixWebhook } = require('./wix-handler');
const { handleZonepangWebhook } = require('./zonepang-handler');

async function handleIntegrationGatewayRoutes(request, response, url, tools) {
  const { parseJsonBody, json } = tools;

  const wixParams = matchPath(url.pathname, '/integration/webhooks/wix/:clinicId/:workspaceId');
  if (wixParams && request.method === 'POST') {
    request.params = {
      clinicId: wixParams.clinicId,
      workspaceId: wixParams.workspaceId
    };
    request.query = Object.fromEntries(url.searchParams);
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

  return false;
}

module.exports = {
  handleIntegrationGatewayRoutes
};
