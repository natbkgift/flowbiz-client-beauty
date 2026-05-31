const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { buildWeb } = require('../scripts/build-web');

const bundlePath = buildWeb({ silent: true }).publicOutputFile;
const bundleSource = fs.readFileSync(bundlePath, 'utf8');

function createResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
    async text() {
      return body === undefined || body === null ? '' : JSON.stringify(body);
    }
  };
}

function createFetchMock(routes) {
  const queueMap = new Map();
  const requests = [];

  Object.entries(routes).forEach(([key, value]) => {
    queueMap.set(key, Array.isArray(value) ? [...value] : [value]);
  });

  async function fetchMock(input, init = {}) {
    const url = new URL(String(input));
    const method = (init.method || 'GET').toUpperCase();
    const fullKey = `${method} ${url.pathname}${url.search}`;
    const pathKey = `${method} ${url.pathname}`;
    const queue = queueMap.get(fullKey) || queueMap.get(pathKey);

    const requestRecord = {
      method,
      url,
      headers: init.headers || {},
      body: init.body || null
    };
    requests.push(requestRecord);

    if (!queue || queue.length === 0) {
      // Fallback for unmocked routes to avoid crashing the test,
      // returns a basic empty response or 404.
      return createResponse(404, { error: { code: 'NOT_FOUND' } });
    }

    const next = queue.shift();
    const result = typeof next === 'function' ? await next(requestRecord, requests) : next;
    return createResponse(result.status || 200, result.body);
  }

  return {
    requests,
    fetchMock
  };
}

async function waitFor(predicate, timeout = 2500) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const value = predicate();
    if (value) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Timed out waiting for UI condition.');
}

async function loadPublicApp({ pathName = '/', routes = {} }) {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="app"></div></body></html>',
    {
      url: `http://localhost:3000${pathName}`,
      runScripts: 'dangerously',
      pretendToBeVisual: true
    }
  );
  const { fetchMock, requests } = createFetchMock(routes);

  dom.window.__FLOWBIZ_WEB_CONFIG__ = {
    apiBaseUrl: 'http://localhost:3001'
  };
  dom.window.fetch = fetchMock;
  dom.window.requestAnimationFrame = (callback) => dom.window.setTimeout(() => callback(Date.now()), 16);
  dom.window.cancelAnimationFrame = (id) => dom.window.clearTimeout(id);
  
  // Evaluate the compiled React app bundle
  dom.window.eval(bundleSource);

  return {
    dom,
    document: dom.window.document,
    window: dom.window,
    requests
  };
}

// =========================================================================
// Integration Tests for PR 6
// =========================================================================

test('PR6 - Public Routing Split tests', async (t) => {

  // Test 1: "/" renders platform landing placeholder
  await t.test('1. "/" renders platform landing placeholder', async () => {
    const app = await loadPublicApp({
      pathName: '/',
      routes: {}
    });

    await waitFor(() => app.document.querySelector('[data-testid="public-platform-landing"]') || app.document.querySelector('[data-testid="saas-landing-page"]'));
    const container = app.document.querySelector('[data-testid="public-platform-landing"]') || app.document.querySelector('[data-testid="saas-landing-page"]');
    assert.ok(container);
    assert.match(container.textContent, /FlowBiz/);
  });

  // Test 2: "/:clinicSlug" loads clinic shell
  await t.test('2. "/:clinicSlug" loads clinic shell successfully', async () => {
    const mockClinicResponse = {
      clinic: {
        id: 1001,
        name: 'Clinic Alpha Premium',
        slug: 'clinic-alpha',
        plan: 'starter',
        status: 'active',
        timezone: 'Asia/Bangkok'
      },
      websiteSettings: {
        websiteStatus: 'active',
        tagline: 'Premium skincare expert'
      },
      brandingSettings: {},
      contactSettings: {
        phone: '089-999-9999',
        email: 'alpha@clinic.com'
      },
      locationSettings: {
        province: 'Bangkok',
        country: 'Thailand'
      },
      homepageSections: [
        { sectionKey: 'hero', sectionType: 'hero' },
        { sectionKey: 'services', sectionType: 'services' }
      ],
      isPubliclyRenderable: true
    };

    const app = await loadPublicApp({
      pathName: '/clinic-alpha',
      routes: {
        'GET /public/clinics/clinic-alpha': { status: 200, body: mockClinicResponse }
      }
    });

    // Verify clinic shell renders successfully
    await waitFor(() => app.document.querySelector('[data-testid="clinic-public-shell"]'));
    
    assert.equal(app.document.querySelector('[data-testid="clinic-template-title"]').textContent, 'Clinic Alpha Premium');
    assert.equal(app.document.querySelector('[data-testid="clinic-slug"]').textContent, 'clinic-alpha');
    assert.equal(app.document.querySelector('[data-testid="clinic-status"]').textContent, 'active');
    assert.match(app.document.querySelector('[data-testid="clinic-contact"]').textContent, /089-999-9999/);
    assert.match(app.document.querySelector('[data-testid="clinic-homepage-sections"]').textContent, /hero/);
  });

  // Test 3: Nested clinic path extracts first segment correctly
  await t.test('3. Nested clinic paths like "/clinic-alpha/services" extract clinic-alpha', async () => {
    const mockClinicResponse = {
      clinic: { id: 1001, name: 'Clinic Alpha Premium', slug: 'clinic-alpha', status: 'active' },
      websiteSettings: { websiteStatus: 'active' },
      brandingSettings: {},
      contactSettings: {},
      locationSettings: {},
      homepageSections: [],
      isPubliclyRenderable: true
    };

    const app = await loadPublicApp({
      pathName: '/clinic-alpha/services',
      routes: {
        'GET /public/clinics/clinic-alpha': { status: 200, body: mockClinicResponse }
      }
    });

    await waitFor(() => app.document.querySelector('[data-testid="clinic-public-shell"]'));
    assert.equal(app.document.querySelector('[data-testid="clinic-template-title"]').textContent, 'Clinic Alpha Premium');
    
    // Check that GET /public/clinics/clinic-alpha was called
    const apiCall = app.requests.find(r => r.url.pathname.endsWith('/public/clinics/clinic-alpha'));
    assert.ok(apiCall, 'should have fetched clinic-alpha data');
  });

  // Test 4: Clinic not found (404)
  await t.test('4. Unknown clinic slug renders 404 state', async () => {
    const app = await loadPublicApp({
      pathName: '/unknown-clinic',
      routes: {
        'GET /public/clinics/unknown-clinic': { status: 404, body: { error: { code: 'CLINIC_NOT_FOUND' } } }
      }
    });

    await waitFor(() => app.document.querySelector('[data-testid="clinic-not-found"]'));
    assert.ok(app.document.querySelector('[data-testid="clinic-not-found"]'));
    assert.match(app.document.body.textContent, /ไม่พบคลินิกที่ต้องการ/);
  });

  // Test 5: Unpublished draft clinic
  await t.test('5. Unpublished/draft clinic displays the unpublished notice', async () => {
    const mockDraftResponse = {
      clinic: { id: 1002, name: 'Draft Clinic Inc', slug: 'clinic-draft', status: 'active' },
      websiteSettings: { websiteStatus: 'draft' },
      brandingSettings: {},
      contactSettings: {},
      locationSettings: {},
      homepageSections: [],
      isPubliclyRenderable: false
    };

    const app = await loadPublicApp({
      pathName: '/clinic-draft',
      routes: {
        'GET /public/clinics/clinic-draft': { status: 200, body: mockDraftResponse }
      }
    });

    await waitFor(() => app.document.querySelector('[data-testid="clinic-unpublished-notice"]'));
    assert.ok(app.document.querySelector('[data-testid="clinic-unpublished-notice"]'));
    assert.match(app.document.querySelector('[data-testid="clinic-unpublished-notice"]').textContent, /ยังไม่ถูกเผยแพร่เต็มรูปแบบ/);
    assert.equal(app.document.querySelector('[data-testid="clinic-template-title"]').textContent, 'Draft Clinic Inc');
  });

  // Test 6: "/blog" and "/forum" do not trigger clinic resolver
  await t.test('6. "/blog" and "/forum" preserve legacy global pages and never trigger clinic resolver', async () => {
    const app = await loadPublicApp({
      pathName: '/blog',
      routes: {
        // Mock blog list fetch to let it load
        'GET /blog/posts': { status: 200, body: { items: [] } }
      }
    });

    // Should load the blog page instead of clinic shell
    await waitFor(() => app.document.body.textContent.includes('บทความให้ความรู้ด้านความงาม'));
    
    // Ensure getPublicClinicBySlug is never called for "blog"
    const hasClinicCall = app.requests.some(r => r.url.pathname.includes('/public/clinics/'));
    assert.equal(hasClinicCall, false, 'should not have made public clinic API calls');
  });

  // Test 7: "/forum" and "/forum/some-topic" do not trigger clinic resolver
  await t.test('7. "/forum" and "/forum/some-topic" preserve legacy forum pages and never trigger clinic resolver', async () => {
    const app = await loadPublicApp({
      pathName: '/forum',
      routes: {
        'GET /forum/topics': { status: 200, body: { items: [] } }
      }
    });

    await waitFor(() => app.document.body.textContent.includes('เว็บบอร์ดสุขภาพและผิวพรรณ'));
    const hasClinicCall = app.requests.some(r => r.url.pathname.includes('/public/clinics/'));
    assert.equal(hasClinicCall, false, 'should not have made public clinic API calls');

    const appDetail = await loadPublicApp({
      pathName: '/forum/some-topic',
      routes: {
        'GET /forum/topics/some-topic': { 
          status: 200, 
          body: { 
            id: 123, 
            title: 'Test Topic', 
            content: 'content', 
            replies: [],
            author_display_name: 'คนไข้นิรนาม',
            is_anonymous: true
          } 
        }
      }
    });

    await waitFor(() => appDetail.document.body.textContent.includes('กลับหน้ากระดานเว็บบอร์ด'));
    const hasClinicCallDetail = appDetail.requests.some(r => r.url.pathname.includes('/public/clinics/'));
    assert.equal(hasClinicCallDetail, false, 'should not have made public clinic API calls');
  });

  // Test 8: "/pricing" and "/demo" protect platform routes, never trigger clinic resolver, and render safely
  await t.test('8. "/pricing" and "/demo" protect platform routes, never trigger clinic resolver, and render safely', async () => {
    const appPricing = await loadPublicApp({
      pathName: '/pricing',
      routes: {}
    });

    await waitFor(() => appPricing.document.querySelector('[data-testid="public-platform-landing"]') || appPricing.document.querySelector('[data-testid="saas-landing-page"]'));
    const hasClinicCallPricing = appPricing.requests.some(r => r.url.pathname.includes('/public/clinics/'));
    assert.equal(hasClinicCallPricing, false, 'should not have made public clinic API calls');

    const appDemo = await loadPublicApp({
      pathName: '/demo',
      routes: {}
    });

    await waitFor(() => appDemo.document.querySelector('[data-testid="public-platform-landing"]') || appDemo.document.querySelector('[data-testid="saas-landing-page"]'));
    const hasClinicCallDemo = appDemo.requests.some(r => r.url.pathname.includes('/public/clinics/'));
    assert.equal(hasClinicCallDemo, false, 'should not have made public clinic API calls');
  });
});
