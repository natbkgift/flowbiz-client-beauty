const { AppError } = require('./errors');

function json(response, statusCode, payload) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload, null, 2));
}

function noContent(response) {
  response.writeHead(204);
  response.end();
}

function parseJsonBody(request) {
  return new Promise((resolve, reject) => {
    if (request.method === 'GET' || request.method === 'HEAD') {
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
    return json(response, error.statusCode, {
      error: {
        code: error.code,
        message: error.message,
        details: error.details || null
      }
    });
  }

  return json(response, 500, {
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error.'
    }
  });
}

module.exports = {
  json,
  noContent,
  parseJsonBody,
  sendError
};