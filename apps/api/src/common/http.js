const { AppError } = require('./errors');
const { getThaiErrorMessage } = require('./user-messages');

function buildJsonHeaders(extraHeaders = {}) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    ...extraHeaders
  };

  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined || value === null) {
      delete headers[key];
    }
  }

  return headers;
}

function buildErrorPayload(code, fallbackMessage, details = null) {
  return {
    error: {
      code,
      message: getThaiErrorMessage(code, fallbackMessage),
      details
    }
  };
}

function json(response, statusCode, payload) {
  response.writeHead(statusCode, buildJsonHeaders());
  response.end(JSON.stringify(payload, null, 2));
  return true;
}

function noContent(response) {
  response.writeHead(204, buildJsonHeaders({ 'Content-Type': undefined }));
  response.end();
  return true;
}

function jsonError(response, statusCode, code, fallbackMessage, details = null) {
  return json(response, statusCode, buildErrorPayload(code, fallbackMessage, details));
}

function parseJsonBody(request) {
  return new Promise((resolve, reject) => {
    if (request.method === 'GET' || request.method === 'HEAD') {
      request.rawBody = '';
      resolve({});
      return;
    }

    let body = '';

    request.on('data', (chunk) => {
      body += chunk;

      if (body.length > 1024 * 1024) {
        reject(new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.'));
        request.destroy();
      }
    });

    request.on('end', () => {
      request.rawBody = body;

      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new AppError(400, 'INVALID_JSON', 'Request body must be valid JSON.'));
      }
    });

    request.on('error', (error) => {
      reject(error);
    });
  });
}

function sendError(response, error) {
  if (error instanceof AppError) {
    return json(response, error.statusCode, buildErrorPayload(error.code, error.message, error.details || null));
  }

  return json(response, 500, buildErrorPayload('INTERNAL_SERVER_ERROR'));
}

module.exports = {
  buildErrorPayload,
  buildJsonHeaders,
  json,
  jsonError,
  noContent,
  parseJsonBody,
  sendError
};
