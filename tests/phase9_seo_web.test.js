const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
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
  assert.match(resHome.body, /<html lang="en">/);
  assert.match(resHome.body, /FlowBiz Beauty Clinic/);
  assert.match(resHome.body, /public.bundle.js/);

  // 2. Verify Admin Routing (/admin)
  const resAdmin = await get(`${baseUrl}/admin`);
  assert.equal(resAdmin.statusCode, 200);
  assert.match(resAdmin.body, /FlowBiz Admin Control Center/);
  assert.match(resAdmin.body, /admin.bundle.js/);

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
});
