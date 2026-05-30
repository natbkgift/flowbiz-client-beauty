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
  
  dom.window.eval(bundleSource);

  return {
    dom,
    document: dom.window.document,
    window: dom.window,
    requests
  };
}

// =========================================================================
// PR 8 Clinic Template V1 Test Suite
// =========================================================================

test('PR 8 - Clinic Website Template V1 tests', async (t) => {

  // Test 1: Clinic template renders from resolver data
  await t.test('1. Clinic template renders all required sections from resolver data', async () => {
    const mockResponse = {
      clinic: {
        id: 1001,
        name: 'Clinic Alpha Default Name',
        slug: 'clinic-alpha',
        status: 'active'
      },
      websiteSettings: {
        websiteStatus: 'active',
        publicDisplayName: 'Clinic Alpha Preferred Name',
        tagline: 'The Ultimate Glow Experience',
        shortDescription: 'We are a premier aesthetic clinic dedicated to skin excellence.'
      },
      brandingSettings: {
        logoUrl: 'https://example.com/logo.png',
        heroImageUrl: 'https://example.com/hero.png',
        primaryColor: '#d4af37',
        secondaryColor: '#13151a',
        accentColor: '#f3e5ab'
      },
      contactSettings: {
        phone: '089-999-9999',
        email: 'info@clinicalpha.com',
        lineUrl: 'https://line.me/R/ti/p/@clinicalpha',
        lineOaId: '@clinicalpha'
      },
      locationSettings: {
        addressLine1: '456 Sukhumvit Rd',
        province: 'Bangkok',
        country: 'Thailand',
        googleMapUrl: 'https://maps.google.com/?q=clinicalpha'
      },
      homepageSections: [
        { sectionKey: 'hero', sectionType: 'hero', status: 'published' }
      ],
      isPubliclyRenderable: true
    };

    const app = await loadPublicApp({
      pathName: '/clinic-alpha',
      routes: {
        'GET /public/clinics/clinic-alpha': { status: 200, body: mockResponse }
      }
    });

    await waitFor(() => app.document.querySelector('[data-testid="clinic-template"]'));

    // Check all key test-ids exist
    assert.ok(app.document.querySelector('[data-testid="clinic-template"]'), 'clinic-template container missing');
    assert.ok(app.document.querySelector('[data-testid="clinic-template-hero"]'), 'clinic-template-hero missing');
    assert.ok(app.document.querySelector('[data-testid="clinic-template-logo"]'), 'clinic-template-logo missing');
    assert.ok(app.document.querySelector('[data-testid="clinic-template-title"]'), 'clinic-template-title missing');
    assert.ok(app.document.querySelector('[data-testid="clinic-template-tagline"]'), 'clinic-template-tagline missing');
    assert.ok(app.document.querySelector('[data-testid="clinic-template-primary-cta"]'), 'clinic-template-primary-cta missing');
    assert.ok(app.document.querySelector('[data-testid="clinic-template-secondary-cta"]'), 'clinic-template-secondary-cta missing');
    assert.ok(app.document.querySelector('[data-testid="clinic-template-contact"]'), 'clinic-template-contact missing');
    assert.ok(app.document.querySelector('[data-testid="clinic-template-location"]'), 'clinic-template-location missing');

    // Verify content mapping
    assert.equal(app.document.querySelector('[data-testid="clinic-template-title"]').textContent.trim(), 'Clinic Alpha Preferred Name');
    assert.equal(app.document.querySelector('[data-testid="clinic-template-tagline"]').textContent.trim(), 'The Ultimate Glow Experience');
    assert.match(app.document.querySelector('[data-testid="clinic-template-contact"]').textContent, /089-999-9999/);
    assert.match(app.document.querySelector('[data-testid="clinic-template-location"]').textContent, /Bangkok/);
  });

  // Test 2: Branding/theme applied safely using CSS variables
  await t.test('2. Branding/theme applies colors as CSS variables safely', async () => {
    const mockResponse = {
      clinic: { id: 1001, name: 'Clinic Alpha', slug: 'clinic-alpha', status: 'active' },
      websiteSettings: { websiteStatus: 'active' },
      brandingSettings: {
        primaryColor: '#ff0000',
        secondaryColor: '#00ff00',
        accentColor: '#0000ff'
      },
      contactSettings: {},
      locationSettings: {},
      homepageSections: [],
      isPubliclyRenderable: true
    };

    const app = await loadPublicApp({
      pathName: '/clinic-alpha',
      routes: {
        'GET /public/clinics/clinic-alpha': { status: 200, body: mockResponse }
      }
    });

    await waitFor(() => app.document.querySelector('[data-testid="clinic-template"]'));
    const container = app.document.querySelector('[data-testid="clinic-template"]');
    
    // Verify CSS variables are applied inline style
    assert.equal(container.style.getPropertyValue('--clinic-primary').trim(), '#ff0000');
    assert.equal(container.style.getPropertyValue('--clinic-secondary').trim(), '#00ff00');
    assert.equal(container.style.getPropertyValue('--clinic-accent').trim(), '#0000ff');

    // Safe color verification - check that non-hex colors (names, rgb, hsl, malicious payloads) are rejected
    const mockUnsafeResponse = {
      clinic: { id: 1001, name: 'Clinic Alpha', slug: 'clinic-alpha', status: 'active' },
      websiteSettings: { websiteStatus: 'active' },
      brandingSettings: {
        primaryColor: 'rgb(255, 0, 0)', // rgb format - rejected
        secondaryColor: 'hsl(120, 100%, 50%)', // hsl format - rejected
        accentColor: 'gold' // color name - rejected
      },
      contactSettings: {},
      locationSettings: {},
      homepageSections: [],
      isPubliclyRenderable: true
    };

    const appUnsafe = await loadPublicApp({
      pathName: '/clinic-alpha',
      routes: {
        'GET /public/clinics/clinic-alpha': { status: 200, body: mockUnsafeResponse }
      }
    });

    await waitFor(() => appUnsafe.document.querySelector('[data-testid="clinic-template"]'));
    const unsafeContainer = appUnsafe.document.querySelector('[data-testid="clinic-template"]');
    // Non-hex colors must fallback to default variables
    assert.equal(unsafeContainer.style.getPropertyValue('--clinic-primary').trim(), 'var(--gold-primary)');
    assert.equal(unsafeContainer.style.getPropertyValue('--clinic-secondary').trim(), 'var(--bg-secondary)');
    assert.equal(unsafeContainer.style.getPropertyValue('--clinic-accent').trim(), 'var(--gold-hover)');
  });

  // Test 3: Homepage sections render
  await t.test('3. Homepage sections render published contents and filter hidden ones', async () => {
    const mockResponse = {
      clinic: { id: 1001, name: 'Clinic Alpha', slug: 'clinic-alpha', status: 'active' },
      websiteSettings: { websiteStatus: 'active' },
      brandingSettings: {},
      contactSettings: {},
      locationSettings: {},
      homepageSections: [
        {
          sectionKey: 'services_preview',
          sectionType: 'services_preview',
          title: 'บริการยอดนิยม',
          content: {
            items: [
              { title: 'Botox Treatment', description: 'ลดริ้วรอย' },
              { title: 'Laser Glow', description: 'ดูแลผิวใส' }
            ]
          },
          status: 'published'
        },
        {
          sectionKey: 'promotions_preview',
          sectionType: 'promotions_preview',
          title: 'โปรปังๆ',
          content: {
            items: [
              { title: 'โบกรามยกชุด', description: 'ลดราคาคุ้มเว่อร์' }
            ]
          },
          status: 'published'
        },
        {
          sectionKey: 'custom_sec',
          sectionType: 'custom_text',
          title: 'ความประทับใจลูกค้า',
          content: {
            "รีวิว": "บริการประทับใจมากค่ะ"
          },
          status: 'published'
        },
        {
          sectionKey: 'hidden_sec',
          sectionType: 'services_preview',
          title: 'บริการลับ',
          content: { items: [{ title: 'Secret Service', description: 'Hidden' }] },
          status: 'hidden'
        }
      ],
      isPubliclyRenderable: true
    };

    const app = await loadPublicApp({
      pathName: '/clinic-alpha',
      routes: {
        'GET /public/clinics/clinic-alpha': { status: 200, body: mockResponse }
      }
    });

    await waitFor(() => app.document.querySelector('[data-testid="clinic-template"]'));
    const htmlContent = app.document.body.innerHTML;

    // Check service preview renders mocked items
    assert.ok(htmlContent.includes('Botox Treatment'), 'Botox Treatment should render');
    assert.ok(htmlContent.includes('Laser Glow'), 'Laser Glow should render');

    // Check promotions preview renders mock content
    assert.ok(htmlContent.includes('โบกรามยกชุด'), 'โบกรามยกชุด should render');

    // Check custom dynamic section renders safe data representation
    assert.ok(htmlContent.includes('ความประทับใจลูกค้า'), 'custom section title should render');
    assert.ok(htmlContent.includes('รีวิว'), 'custom section key should render');
    assert.ok(htmlContent.includes('บริการประทับใจมากค่ะ'), 'custom section value should render');

    // Hidden section must not render
    assert.equal(htmlContent.includes('บริการลับ'), false, 'hidden sections must not render');
    assert.equal(htmlContent.includes('Secret Service'), false, 'hidden items must not render');
  });

  // Test 4: Fallback defaults
  await t.test('4. Renders fallback default content when fields are missing', async () => {
    const mockResponse = {
      clinic: { id: 1001, name: 'Clinic Alpha Minimal', slug: 'clinic-alpha', status: 'active' },
      websiteSettings: { websiteStatus: 'active' },
      brandingSettings: {},
      contactSettings: {},
      locationSettings: {},
      homepageSections: [],
      isPubliclyRenderable: true
    };

    const app = await loadPublicApp({
      pathName: '/clinic-alpha',
      routes: {
        'GET /public/clinics/clinic-alpha': { status: 200, body: mockResponse }
      }
    });

    await waitFor(() => app.document.querySelector('[data-testid="clinic-template"]'));
    
    // Title falls back to clinic name
    assert.equal(app.document.querySelector('[data-testid="clinic-template-title"]').textContent.trim(), 'Clinic Alpha Minimal');
    
    // Services section has fallback badges
    const servicesText = app.document.querySelector('[data-testid="clinic-template-services"]').textContent;
    assert.match(servicesText, /ปรับรูปหน้า/);
    assert.match(servicesText, /ดูแลผิว/);

    // Promotions section has fallback placeholder notice
    const promoSection = app.document.querySelector('[data-testid="clinic-template-promotions"]');
    assert.match(promoSection.textContent, /โปรโมชั่นและแพ็กเกจจะอัปเดตโดยคลินิก/);
  });

  // Test 5: Draft/unpublished notice
  await t.test('5. Unpublished clinic renders draft notice without blocking the layout', async () => {
    const mockResponse = {
      clinic: { id: 1001, name: 'Draft Clinic', slug: 'clinic-draft', status: 'active' },
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
        'GET /public/clinics/clinic-draft': { status: 200, body: mockResponse }
      }
    });

    await waitFor(() => app.document.querySelector('[data-testid="clinic-unpublished-notice"]'));
    assert.ok(app.document.querySelector('[data-testid="clinic-unpublished-notice"]'), 'unpublished notice missing');
    assert.match(app.document.querySelector('[data-testid="clinic-unpublished-notice"]').textContent, /เว็บไซต์คลินิกนี้ยังไม่ถูกเผยแพร่เต็มรูปแบบ/);
    assert.ok(app.document.querySelector('[data-testid="clinic-template"]'), 'clinic template should still render');
  });

  // Test 6: 404 still works
  await t.test('6. 404 resolves correctly', async () => {
    const app = await loadPublicApp({
      pathName: '/non-existent-clinic',
      routes: {
        'GET /public/clinics/non-existent-clinic': { status: 404, body: { error: { code: 'CLINIC_NOT_FOUND' } } }
      }
    });

    await waitFor(() => app.document.querySelector('[data-testid="clinic-not-found"]'));
    assert.ok(app.document.querySelector('[data-testid="clinic-not-found"]'));
    assert.equal(app.document.querySelector('[data-testid="clinic-template"]'), null, 'clinic template should not render on 404');
  });

  // Test 7: Platform routes unaffected
  await t.test('7. Platform routes are unaffected and render SaaS Landing Page', async () => {
    const app = await loadPublicApp({
      pathName: '/',
      routes: {}
    });

    await waitFor(() => app.document.querySelector('[data-testid="saas-landing-page"]'));
    assert.ok(app.document.querySelector('[data-testid="saas-landing-page"]'));
    assert.equal(app.document.querySelector('[data-testid="clinic-template"]'), null, 'should not render clinic template on /');

    const appPricing = await loadPublicApp({
      pathName: '/pricing',
      routes: {}
    });

    await waitFor(() => appPricing.document.querySelector('[data-testid="saas-landing-page"]'));
    assert.ok(appPricing.document.querySelector('[data-testid="saas-landing-page"]'));
    assert.equal(appPricing.document.querySelector('[data-testid="clinic-template"]'), null, 'should not render clinic template on /pricing');
  });
});
