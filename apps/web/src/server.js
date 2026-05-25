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
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

function renderIndex(templateName) {
  const template = fs.readFileSync(path.join(root, templateName), 'utf8');
  const apiBaseUrl = config.appEnv === 'production' ? '/api' : `http://localhost:${config.apiPort}`;
  return template.replace('__API_BASE_URL__', apiBaseUrl);
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
    response.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8' });
    response.end(generateSitemap());
    return;
  }

  const filePath = getFilePath(pathname);

  if (!filePath) {
    const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/');
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(renderIndex(isAdminRoute ? 'index.html' : 'public-index.html'));
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (path.extname(filePath)) {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Not Found');
        return;
      }

      const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/');
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(renderIndex(isAdminRoute ? 'index.html' : 'public-index.html'));
      return;
    }

    const contentType = mimeTypes[path.extname(filePath)] || 'text/plain; charset=utf-8';
    response.writeHead(200, { 'Content-Type': contentType });
    response.end(content);
  });
});

if (require.main === module) {
  server.listen(config.webPort, () => {
    process.stdout.write(`FlowBiz Web listening on http://localhost:${config.webPort}\n`);
  });
}

module.exports = {
  server
};
