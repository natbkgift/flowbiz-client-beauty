const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { loadConfig } = require('../../api/src/config');
const { buildWeb } = require('../../../scripts/build-web');

const config = loadConfig();
const root = __dirname;
const distRoot = path.resolve(root, '..', 'dist');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

function renderIndex() {
  const template = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  return template.replace('__API_BASE_URL__', `http://localhost:${config.apiPort}`);
}

function getFilePath(urlPath) {
  if (urlPath.startsWith('/assets/')) {
    return path.join(distRoot, urlPath.replace(/^\//, ''));
  }

  if (urlPath === '/' || urlPath === '' || !path.extname(urlPath)) {
    return null;
  }

  return path.join(root, urlPath.replace(/^\//, ''));
}

buildWeb();

const server = http.createServer((request, response) => {
  const filePath = getFilePath(request.url || '/');

  if (!filePath) {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(renderIndex());
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if ((request.url || '/').includes('.')) {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Not Found');
        return;
      }

      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(renderIndex());
      return;
    }

    const contentType = mimeTypes[path.extname(filePath)] || 'text/plain; charset=utf-8';
    response.writeHead(200, { 'Content-Type': contentType });
    response.end(content);
  });
});

server.listen(config.webPort, () => {
  process.stdout.write(`FlowBiz Web listening on http://localhost:${config.webPort}\n`);
});
