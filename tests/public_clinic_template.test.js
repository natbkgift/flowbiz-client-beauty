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
// Clinic Website Template V1 Integration Tests (PR 8)
// =========================================================================

test('PR8 - Clinic Website Template V1 Tests', async (t) => {

  // Test 1: Clinic template renders from resolver data
  await t.test('1. Clinic template renders all sections from resolver data', async () => {
    const mockClinicResponse = {
      clinic: {
        id: 101,
        name: 'Clinic Alpha Default',
        slug: 'clinic-alpha',
        plan: 'growth',
        status: 'active',
        timezone: 'Asia/Bangkok'
      },
      websiteSettings: {
        websiteStatus: 'active',
        publicDisplayName: 'Clinic Alpha Premium',
        tagline: 'Expert Dermatology & Aesthetics',
        shortDescription: 'We provide top-notch skincare and aesthetic surgery solutions.',
        defaultLocale: 'th-TH'
      },
      brandingSettings: {
        logoUrl: 'https://example.com/logo.png',
        heroImageUrl: 'https://example.com/hero.jpg',
        primaryColor: '#d4af37',
        secondaryColor: '#13151a',
        accentColor: '#f3e5ab'
      },
      contactSettings: {
        phone: '081-234-5678',
        email: 'info@clinicalpha.com',
        lineUrl: 'https://line.me/ti/p/@clinicalpha',
        lineOaId: '@clinicalpha'
      },
      locationSettings: {
        addressLine1: '456 Sukhumvit Road',
        addressLine2: 'Khlong Toei',
        district: 'Khlong Toei',
        province: 'Bangkok',
        postalCode: '10110',
        country: 'Thailand',
        googleMapUrl: 'https://maps.google.com/?q=Clinic+Alpha'
      },
      homepageSections: [
        { sectionKey: 'hero', sectionType: 'hero', status: 'published', sortOrder: 1 },
        { 
          sectionKey: 'trust_badges', 
          sectionType: 'trust_badges', 
          status: 'published', 
          sortOrder: 2,
          content: {
            items: [
              { title: 'Superb Doctor', description: 'Experienced dermatologists' },
              { title: 'Standardized CRM', description: 'Real-time follow up' }
            ]
          }
        },
        { 
          sectionKey: 'services_preview', 
          sectionType: 'services_preview', 
          status: 'published', 
          sortOrder: 3,
          content: {
            items: [
              { title: 'Botox Inject', description: 'Reduce wrinkles' },
              { title: 'Filler Lip', description: 'Volume boost' }
            ]
          }
        }
      ],
      isPubliclyRenderable: true
    };

    const app = await loadPublicApp({
      pathName: '/clinic-alpha',
      routes: {
        'GET /public/clinics/clinic-alpha': { status: 200, body: mockClinicResponse }
      }
    });

    await waitFor(() => app.document.querySelector('[data-testid="clinic-template"]'));

    const template = app.document.querySelector('[data-testid="clinic-template"]');
    assert.ok(template, 'Template container should render');

    // Hero Section
    assert.ok(app.document.querySelector('[data-testid="clinic-template-hero"]'));
    assert.equal(app.document.querySelector('[data-testid="clinic-template-title"]').textContent, 'Clinic Alpha Premium');
    assert.equal(app.document.querySelector('[data-testid="clinic-template-tagline"]').textContent, 'Expert Dermatology & Aesthetics');
    assert.ok(app.document.querySelector('[data-testid="clinic-template-logo"]'));
    assert.ok(app.document.querySelector('[data-testid="clinic-template-primary-cta"]'));
    assert.ok(app.document.querySelector('[data-testid="clinic-template-secondary-cta"]'));

    // Trust Badge Section
    assert.ok(app.document.querySelector('[data-testid="clinic-template-trust"]'));
    assert.match(app.document.querySelector('[data-testid="clinic-template-trust"]').textContent, /Superb Doctor/);

    // Services Section
    assert.ok(app.document.querySelector('[data-testid="clinic-template-services"]'));
    assert.match(app.document.querySelector('[data-testid="clinic-template-services"]').textContent, /Botox Inject/);

    // Contact/Location
    assert.ok(app.document.querySelector('[data-testid="clinic-template-contact"]'));
    assert.match(app.document.querySelector('[data-testid="clinic-template-contact"]').textContent, /081-234-5678/);
    assert.ok(app.document.querySelector('[data-testid="clinic-template-location"]'));
    assert.match(app.document.querySelector('[data-testid="clinic-template-location"]').textContent, /456 Sukhumvit Road/);
    assert.ok(app.document.querySelector('[data-testid="clinic-template-map-link"]'));
    assert.equal(app.document.querySelector('[data-testid="clinic-template-map-link"]').getAttribute('href'), 'https://maps.google.com/?q=Clinic+Alpha');
  });

  // Test 2: Branding/theme applied safely
  await t.test('2. Custom branding colors applied safely via CSS variables', async () => {
    const mockThemeResponse = {
      clinic: { id: 102, name: 'Clinic Color Safe', slug: 'clinic-theme', status: 'active' },
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
      pathName: '/clinic-theme',
      routes: {
        'GET /public/clinics/clinic-theme': { status: 200, body: mockThemeResponse }
      }
    });

    await waitFor(() => app.document.querySelector('[data-testid="clinic-template"]'));
    const container = app.document.querySelector('[data-testid="clinic-template"]');
    
    // Check that CSS custom properties (variables) are attached in inline style
    const inlineStyle = container.getAttribute('style') || '';
    assert.match(inlineStyle, /--clinic-primary:\s*#ff0000/);
    assert.match(inlineStyle, /--clinic-secondary:\s*#00ff00/);
    assert.match(inlineStyle, /--clinic-accent:\s*#0000ff/);

    // Ensure unsafe values are rejected/fall back safely
    const mockUnsafeResponse = {
      clinic: { id: 103, name: 'Clinic Color Unsafe', slug: 'clinic-unsafe-theme', status: 'active' },
      websiteSettings: { websiteStatus: 'active' },
      brandingSettings: {
        primaryColor: 'javascript:alert(1)', // Unsafe
        secondaryColor: 'url("https://malicious.site")', // Unsafe
        accentColor: '#123456' // Safe hex
      },
      contactSettings: {},
      locationSettings: {},
      homepageSections: [],
      isPubliclyRenderable: true
    };

    const appUnsafe = await loadPublicApp({
      pathName: '/clinic-unsafe-theme',
      routes: {
        'GET /public/clinics/clinic-unsafe-theme': { status: 200, body: mockUnsafeResponse }
      }
    });

    await waitFor(() => appUnsafe.document.querySelector('[data-testid="clinic-template"]'));
    const containerUnsafe = appUnsafe.document.querySelector('[data-testid="clinic-template"]');
    const inlineStyleUnsafe = containerUnsafe.getAttribute('style') || '';

    // Safe hex remains, unsafe strings fall back to standard variables
    assert.match(inlineStyleUnsafe, /--clinic-accent:\s*#123456/);
    assert.match(inlineStyleUnsafe, /--clinic-primary:\s*var\(--gold-primary\)/);
    assert.match(inlineStyleUnsafe, /--clinic-secondary:\s*var\(--bg-secondary\)/);
  });

  // Test 3: Homepage sections render and filter hidden
  await t.test('3. Dynamic homepage sections render and filter out hidden sections', async () => {
    const mockSectionsResponse = {
      clinic: { id: 104, name: 'Clinic Dynamic', slug: 'clinic-dyn', status: 'active' },
      websiteSettings: { websiteStatus: 'active' },
      brandingSettings: {},
      contactSettings: {},
      locationSettings: {},
      homepageSections: [
        {
          sectionKey: 'services_preview',
          sectionType: 'services_preview',
          status: 'published',
          content: {
            items: [
              { title: 'Real Botox', description: 'desc' }
            ]
          }
        },
        {
          sectionKey: 'special_offer',
          sectionType: 'custom_offer',
          title: 'Custom Offer Card',
          subtitle: 'Our Special Offer Sub',
          status: 'published'
        },
        {
          sectionKey: 'hidden_card',
          sectionType: 'trust_badges',
          status: 'hidden',
          content: {
            items: [{ title: 'Should Not Show' }]
          }
        }
      ],
      isPubliclyRenderable: true
    };

    const app = await loadPublicApp({
      pathName: '/clinic-dyn',
      routes: {
        'GET /public/clinics/clinic-dyn': { status: 200, body: mockSectionsResponse }
      }
    });

    await waitFor(() => app.document.querySelector('[data-testid="clinic-template"]'));

    // Renders the published services
    assert.match(app.document.querySelector('[data-testid="clinic-template-services"]').textContent, /Real Botox/);

    // Renders custom sections dynamically
    assert.ok(app.document.querySelector('[data-testid="clinic-template-dynamic-sections"]'));
    assert.match(app.document.querySelector('[data-testid="clinic-template-dynamic-sections"]').textContent, /Custom Offer Card/);

    // Hidden section is completely omitted from rendering
    const textContent = app.document.body.textContent;
    assert.equal(textContent.includes('Should Not Show'), false, 'Hidden section contents must not render');
  });

  // Test 4: Fallback defaults
  await t.test('4. Minimal configurations render safe fallback defaults and disclaimers', async () => {
    const mockMinimalResponse = {
      clinic: { id: 105, name: 'Minimal Clinic', slug: 'clinic-min', status: 'active' },
      websiteSettings: {
        websiteStatus: 'active',
        shortDescription: 'Minimal description'
      },
      brandingSettings: {},
      contactSettings: {},
      locationSettings: {},
      homepageSections: [],
      isPubliclyRenderable: true
    };

    const app = await loadPublicApp({
      pathName: '/clinic-min',
      routes: {
        'GET /public/clinics/clinic-min': { status: 200, body: mockMinimalResponse }
      }
    });

    await waitFor(() => app.document.querySelector('[data-testid="clinic-template"]'));

    // Displays name and description correctly
    assert.equal(app.document.querySelector('[data-testid="clinic-template-title"]').textContent, 'Minimal Clinic');
    assert.ok(app.document.querySelector('[data-testid="clinic-template-about"]'));
    assert.match(app.document.querySelector('[data-testid="clinic-template-about"]').textContent, /Minimal description/);

    // Displays fallbacks for trust, services, and promotions
    assert.match(app.document.querySelector('[data-testid="clinic-template-trust"]').textContent, /แพทย์ดูแล/);
    assert.match(app.document.querySelector('[data-testid="clinic-template-services"]').textContent, /\[ตัวอย่างบริการ\] ปรับรูปหน้า/);
    assert.match(app.document.querySelector('[data-testid="clinic-template-promotions"]').textContent, /โปรโมชั่นและแพ็กเกจจะอัปเดตโดยคลินิก/);

    // Safe fallbacks contain disclaimers
    assert.match(app.document.body.textContent, /\* รายการบริการด้านล่างนี้เป็นเพียงตัวอย่างทดสอบชั่วคราว/);
    assert.match(app.document.body.textContent, /\* ข้อเสนอและโปรโมชั่นพิเศษอย่างเป็นทางการยังอยู่ระหว่างการจัดทำ/);
  });

  // Test 5: Draft/unpublished notice
  await t.test('5. Unpublished clinic displays the draft notice alongside the template', async () => {
    const mockDraftResponse = {
      clinic: { id: 106, name: 'Draft Clinic', slug: 'clinic-draft', status: 'active' },
      websiteSettings: {
        websiteStatus: 'draft',
        publicDisplayName: 'Draft Clinic Showroom'
      },
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
    
    // Banner notice should appear
    assert.ok(app.document.querySelector('[data-testid="clinic-unpublished-notice"]'));
    assert.match(app.document.querySelector('[data-testid="clinic-unpublished-notice"]').textContent, /เว็บไซต์คลินิกนี้ยังไม่ถูกเผยแพร่เต็มรูปแบบ/);

    // Clinic template elements are still rendered behind/below it
    assert.ok(app.document.querySelector('[data-testid="clinic-template"]'));
    assert.equal(app.document.querySelector('[data-testid="clinic-template-title"]').textContent, 'Draft Clinic Showroom');
  });

  // Test 6: 404 still works
  await t.test('6. Non-existing clinic still displays 404 not found page', async () => {
    const app = await loadPublicApp({
      pathName: '/not-found-clinic-slug',
      routes: {
        'GET /public/clinics/not-found-clinic-slug': { status: 404, body: { error: { code: 'CLINIC_NOT_FOUND' } } }
      }
    });

    await waitFor(() => app.document.querySelector('[data-testid="clinic-not-found"]'));
    assert.ok(app.document.querySelector('[data-testid="clinic-not-found"]'));
    assert.equal(app.document.querySelector('[data-testid="clinic-template"]'), null, 'Template should not render for 404s');
  });

  // Test 7: Platform routes unaffected
  await t.test('7. Platform routes are protected, unaffected, and do not trigger clinic resolver', async () => {
    const app = await loadPublicApp({
      pathName: '/',
      routes: {}
    });

    await waitFor(() => app.document.querySelector('[data-testid="saas-landing-page"]'));
    
    // Resolver should never be called
    const hasClinicCall = app.requests.some(r => r.url.pathname.includes('/public/clinics/'));
    assert.equal(hasClinicCall, false, 'SaaS root must not trigger clinic slug resolver queries');
  });
});
