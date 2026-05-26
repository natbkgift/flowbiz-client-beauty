const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { server } = require('../apps/web/src/server');

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    }).on('error', reject);
  });
}

function assertHtmlSecurityHeaders(response) {
  assert.match(response.headers['content-security-policy'], /default-src 'self'/);
  assert.match(response.headers['content-security-policy'], /script-src 'self' 'nonce-[^']+'/);
  assert.match(response.headers['content-security-policy'], /object-src 'none'/);
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers['x-frame-options'], 'SAMEORIGIN');
  assert.equal(response.headers['referrer-policy'], 'strict-origin-when-cross-origin');
}

test('SEO Landing Page, Robots.txt, and Sitemap.xml Routing', async (t) => {
  // Start server on a random free port
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  t.after(() => {
    server.close();
  });

  // 1. Verify Public Landing Page (/)
  const resHome = await get(`${baseUrl}/`);
  assert.equal(resHome.statusCode, 200);
  assert.match(resHome.body, /<html lang="th">/);
  assert.match(resHome.body, /FlowBiz Beauty Clinic/);
  assert.match(resHome.body, /public.bundle.js/);
  assertHtmlSecurityHeaders(resHome);
  assert.match(resHome.body, /nonce="[^"]+"/);
  assert.doesNotMatch(resHome.body, /__CSP_NONCE__/);

  // 2. Verify Admin Routing (/admin)
  const resAdmin = await get(`${baseUrl}/admin`);
  assert.equal(resAdmin.statusCode, 200);
  assert.match(resAdmin.body, /FlowBiz Beauty CRM \| ศูนย์ควบคุมคลินิก/);
  assert.match(resAdmin.body, /admin.bundle.js/);
  assertHtmlSecurityHeaders(resAdmin);
  assert.doesNotMatch(resAdmin.body, /__CSP_NONCE__/);

  // 3. Verify Sitemap.xml
  const resSitemap = await get(`${baseUrl}/sitemap.xml`);
  assert.equal(resSitemap.statusCode, 200);
  assert.equal(resSitemap.headers['content-type'], 'application/xml; charset=utf-8');
  assert.match(resSitemap.body, /<urlset/);
  assert.match(resSitemap.body, /https:\/\/beauty.flowbiz.cloud\//);

  // 4. Verify Robots.txt
  const resRobots = await get(`${baseUrl}/robots.txt`);
  assert.equal(resRobots.statusCode, 200);
  assert.match(resRobots.body, /User-agent: \*/);
  assert.match(resRobots.body, /Disallow: \/admin/);

  // 5. Verify browser default favicon probe does not create a console-visible 404.
  const resFavicon = await get(`${baseUrl}/favicon.ico`);
  assert.equal(resFavicon.statusCode, 204);
  assert.equal(resFavicon.headers['x-content-type-options'], 'nosniff');
});

test('Production web bundles do not ship inline source maps', () => {
  const distRoot = path.resolve(__dirname, '..', 'apps', 'web', 'dist', 'assets');
  const adminBundle = fs.readFileSync(path.join(distRoot, 'admin.bundle.js'), 'utf8');
  const publicBundle = fs.readFileSync(path.join(distRoot, 'public.bundle.js'), 'utf8');

  assert.doesNotMatch(adminBundle, /sourceMappingURL=data:/);
  assert.doesNotMatch(publicBundle, /sourceMappingURL=data:/);
});
