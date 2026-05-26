const http = require('node:http');
const crypto = require('node:crypto');
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
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

function createCspNonce() {
  return crypto.randomBytes(16).toString('base64');
}

function replaceAll(value, search, replacement) {
  return value.split(search).join(replacement);
}

function buildContentSecurityPolicy(nonce) {
  const connectSrc = ["'self'"];
  const imgSrc = ["'self'", 'https:', 'data:'];

  if (config.appEnv !== 'production') {
    connectSrc.push(`http://localhost:${config.apiPort}`, `http://127.0.0.1:${config.apiPort}`);
    imgSrc.push('http:');
  }

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    `img-src ${imgSrc.join(' ')}`,
    `connect-src ${connectSrc.join(' ')}`,
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'"
  ].join('; ');
}

function buildResponseHeaders(contentType, options = {}) {
  const headers = {
    'Content-Type': contentType,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
  };

  if (options.nonce && contentType.startsWith('text/html')) {
    headers['Content-Security-Policy'] = buildContentSecurityPolicy(options.nonce);
  }

  return headers;
}

function renderIndex(templateName, requestHostname = 'localhost', nonce = '') {
  const template = fs.readFileSync(path.join(root, templateName), 'utf8');
  const devApiHost = ['localhost', '127.0.0.1'].includes(requestHostname) ? requestHostname : 'localhost';
  const apiBaseUrl = config.appEnv === 'production' ? '/api' : `http://${devApiHost}:${config.apiPort}`;
  return replaceAll(
    replaceAll(
      replaceAll(template, '__API_BASE_URL__', apiBaseUrl),
      '__PUBLIC_CLINIC_ID__',
      JSON.stringify(config.publicClinicId || null)
    ),
    '__CSP_NONCE__',
    nonce
  );
}

function generateSitemap() {
  const dateStr = new Date().toISOString().split('T')[0];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://beauty.flowbiz.cloud/</loc>
    <lastmod>${dateStr}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://beauty.flowbiz.cloud/blog</loc>
    <lastmod>${dateStr}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://beauty.flowbiz.cloud/forum</loc>
    <lastmod>${dateStr}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
</urlset>`;
}

function getFilePath(urlPath) {
  if (urlPath.startsWith('/assets/')) {
    return path.join(distRoot, urlPath.replace(/^\//, ''));
  }

  if (urlPath === '/robots.txt') {
    return path.join(root, 'robots.txt');
  }

  if (urlPath === '/public.css') {
    return path.join(root, 'public.css');
  }

  if (urlPath === '/styles.css') {
    return path.join(root, 'styles.css');
  }

  if (urlPath === '/' || urlPath === '' || !path.extname(urlPath)) {
    return null;
  }

  return path.join(root, urlPath.replace(/^\//, ''));
}

buildWeb();

const server = http.createServer((request, response) => {
  const parsedUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  if (pathname === '/sitemap.xml') {
    response.writeHead(200, buildResponseHeaders('application/xml; charset=utf-8'));
    response.end(generateSitemap());
    return;
  }

  if (pathname === '/favicon.ico') {
    response.writeHead(204, buildResponseHeaders('image/x-icon'));
    response.end();
    return;
  }

  const filePath = getFilePath(pathname);

  if (!filePath) {
    const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/');
    const nonce = createCspNonce();
    response.writeHead(200, buildResponseHeaders('text/html; charset=utf-8', { nonce }));
    response.end(renderIndex(isAdminRoute ? 'index.html' : 'public-index.html', parsedUrl.hostname, nonce));
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (path.extname(filePath)) {
        response.writeHead(404, buildResponseHeaders('text/plain; charset=utf-8'));
        response.end('Not Found');
        return;
      }

      const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/');
      const nonce = createCspNonce();
      response.writeHead(200, buildResponseHeaders('text/html; charset=utf-8', { nonce }));
      response.end(renderIndex(isAdminRoute ? 'index.html' : 'public-index.html', parsedUrl.hostname, nonce));
      return;
    }

    const contentType = mimeTypes[path.extname(filePath)] || 'text/plain; charset=utf-8';
    response.writeHead(200, buildResponseHeaders(contentType));
    response.end(content);
  });
});

if (require.main === module) {
  server.listen(config.webPort, () => {
    process.stdout.write(`FlowBiz Web listening on http://localhost:${config.webPort}\n`);
  });
}

module.exports = {
  buildContentSecurityPolicy,
  buildResponseHeaders,
  renderIndex,
  server
};
