const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');
const { JSDOM } = require('jsdom');

const bundleSource = esbuild.buildSync({
  entryPoints: [path.resolve(__dirname, '..', 'apps', 'web', 'src', 'public-main.js')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: ['es2020'],
  minify: true,
  write: false,
  logLevel: 'silent',
  define: {
    'process.env.NODE_ENV': JSON.stringify('production')
  }
}).outputFiles[0].text;

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

  return { requests, fetchMock };
}

async function waitFor(predicate, timeout = 4000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const value = predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Timed out waiting for UI condition.');
}

async function loadPublicApp({ pathName = '/clinic-alpha', routes = {} }) {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', {
    url: `http://localhost:3000${pathName}`,
    runScripts: 'dangerously',
    pretendToBeVisual: true
  });
  const { fetchMock, requests } = createFetchMock(routes);

  dom.window.__FLOWBIZ_WEB_CONFIG__ = { apiBaseUrl: 'http://localhost:3001' };
  dom.window.fetch = fetchMock;
  dom.window.open = () => ({ opener: null });
  dom.window.requestAnimationFrame = (callback) => dom.window.setTimeout(() => callback(Date.now()), 16);
  dom.window.cancelAnimationFrame = (id) => dom.window.clearTimeout(id);
  dom.window.eval(bundleSource);

  return { dom, document: dom.window.document, window: dom.window, requests };
}

const clinicPayload = {
  clinic: { id: 1001, name: 'Clinic Alpha', slug: 'clinic-alpha', status: 'active' },
  websiteSettings: {
    websiteStatus: 'active',
    publicDisplayName: 'Clinic Alpha Preferred Name',
    tagline: 'The Ultimate Glow Experience',
    shortDescription: 'Premier aesthetic clinic.'
  },
  brandingSettings: {
    primaryColor: '#d4af37',
    secondaryColor: '#13151a',
    accentColor: '#f3e5ab'
  },
  contactSettings: {
    phone: '089-999-9999',
    lineUrl: 'https://line.me/R/ti/p/@clinicalpha'
  },
  locationSettings: {
    province: 'Bangkok'
  },
  homepageSections: [
    { sectionKey: 'hero', sectionType: 'hero', status: 'published' }
  ],
  isPubliclyRenderable: true
};

const publicServices = [
  {
    id: 11,
    serviceKey: 'botox_lift',
    name: 'Botox Lift',
    slug: 'botox-lift',
    category: 'Injectable',
    shortDescription: 'ลดริ้วรอยอย่างเป็นธรรมชาติ',
    durationMinutes: 30,
    priceMin: 3000,
    priceMax: 8000,
    currency: 'THB',
    isFeatured: true,
    sortOrder: 0,
    imageUrl: null
  }
];

const publicPromotions = [
  {
    id: 21,
    promotionKey: 'summer_glow',
    title: 'Summer Glow',
    slug: 'summer-glow',
    subtitle: 'โปรดูแลผิวเดือนนี้',
    badgeLabel: 'Hot',
    ctaLabel: 'ดูโปร',
    ctaUrl: 'https://example.com/promo',
    isFeatured: true,
    sortOrder: 0,
    imageUrl: null
  }
];

const publicPackages = [
  {
    id: 31,
    packageKey: 'glow_course',
    name: 'Glow Course',
    slug: 'glow-course',
    summary: 'ดูแลต่อเนื่อง 3 ครั้ง',
    price: 12000,
    currency: 'THB',
    isFeatured: true,
    sortOrder: 0,
    imageUrl: null
  }
];

function clinicRoutes(overrides = {}) {
  return {
    'GET /public/clinics/clinic-alpha': { status: 200, body: overrides.clinic || clinicPayload },
    'GET /public/clinics/clinic-alpha/services': overrides.services || { status: 200, body: { items: publicServices } },
    'GET /public/clinics/clinic-alpha/promotions': overrides.promotions || { status: 200, body: { items: publicPromotions } },
    'GET /public/clinics/clinic-alpha/packages': overrides.packages || { status: 200, body: { items: publicPackages } },
    ...overrides.extra
  };
}

test('Public clinic offerings rendering - fetches and renders active offerings after clinic resolver', async () => {
  const app = await loadPublicApp({ routes: clinicRoutes() });

  await waitFor(() => app.document.querySelector('[data-testid="clinic-template-service-card-11"]'));
  assert.ok(app.document.querySelector('[data-testid="clinic-template-promotion-card-21"]'));
  assert.ok(app.document.querySelector('[data-testid="clinic-template-package-card-31"]'));

  const publicRequests = app.requests.filter((request) => request.url.pathname.startsWith('/public/clinics/clinic-alpha'));
  assert.deepEqual(publicRequests.map((request) => request.url.pathname), [
    '/public/clinics/clinic-alpha',
    '/public/clinics/clinic-alpha/services',
    '/public/clinics/clinic-alpha/promotions',
    '/public/clinics/clinic-alpha/packages'
  ]);
});

test('Public clinic offerings rendering - formats prices without fake fallback prices', async () => {
  const app = await loadPublicApp({ routes: clinicRoutes() });

  await waitFor(() => app.document.querySelector('[data-testid="clinic-template-service-card-11"]'));
  assert.match(app.document.querySelector('[data-testid="clinic-template-service-card-11"]').textContent, /฿3,000 - ฿8,000/);
  assert.match(app.document.querySelector('[data-testid="clinic-template-package-card-31"]').textContent, /฿12,000/);
});

test('Public clinic offerings rendering - falls back safely when APIs return empty lists', async () => {
  const app = await loadPublicApp({
    routes: clinicRoutes({
      services: { status: 200, body: { items: [] } },
      promotions: { status: 200, body: { items: [] } },
      packages: { status: 200, body: { items: [] } }
    })
  });

  await waitFor(() => app.document.querySelector('[data-testid="clinic-template-services"]'));
  assert.match(app.document.querySelector('[data-testid="clinic-template-services"]').textContent, /ข้อมูลแนะนำชั่วคราว/);
  assert.equal(app.document.querySelector('[data-testid="clinic-template-service-card-11"]'), null);
  assert.equal(app.document.querySelector('[data-testid="clinic-template-package-card-31"]'), null);
});

test('Public clinic offerings rendering - offerings failure does not 404 the clinic page', async () => {
  const app = await loadPublicApp({
    routes: clinicRoutes({
      services: { status: 500, body: { error: { code: 'SERVER_ERROR' } } }
    })
  });

  await waitFor(() => app.document.querySelector('[data-testid="clinic-template"]'));
  await waitFor(() => app.document.querySelector('[data-testid="clinic-template-offerings-error"]'));
  assert.equal(app.document.querySelector('[data-testid="clinic-not-found"]'), null);
});

test('Public clinic offerings rendering - exposes offerings loading state', async () => {
  let releaseServices;
  const servicesPromise = new Promise((resolve) => {
    releaseServices = () => resolve({ status: 200, body: { items: publicServices } });
  });

  const app = await loadPublicApp({
    routes: clinicRoutes({
      services: () => servicesPromise
    })
  });

  await waitFor(() => app.document.querySelector('[data-testid="clinic-template-offerings-loading"]'));
  releaseServices();
  await waitFor(() => app.document.querySelector('[data-testid="clinic-template-service-card-11"]'));
});

test('Public clinic offerings rendering - platform routes do not fetch clinic offerings', async () => {
  for (const pathName of ['/', '/pricing', '/demo', '/blog', '/forum']) {
    const app = await loadPublicApp({ pathName, routes: {} });
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(
      app.requests.some((request) => request.url.pathname.startsWith('/public/clinics/') && /\/(services|promotions|packages)$/.test(request.url.pathname)),
      false,
      `${pathName} should not fetch clinic offerings`
    );
  }
});

test('Public clinic offerings rendering - does not expose tenant-only fields', async () => {
  const app = await loadPublicApp({
    routes: clinicRoutes({
      services: {
        status: 200,
        body: {
          items: [
            {
              ...publicServices[0],
              clinicId: 9999,
              metadata: { privateNote: 'secret' },
              description: 'Full private description'
            }
          ]
        }
      }
    })
  });

  await waitFor(() => app.document.querySelector('[data-testid="clinic-template-service-card-11"]'));
  const sectionText = app.document.querySelector('[data-testid="clinic-template-services"]').textContent;
  assert.doesNotMatch(sectionText, /9999/);
  assert.doesNotMatch(sectionText, /secret/);
  assert.doesNotMatch(sectionText, /Full private description/);
});

test('Public clinic offerings rendering - keeps promotions and packages in separate sections', async () => {
  const app = await loadPublicApp({ routes: clinicRoutes() });

  await waitFor(() => app.document.querySelector('[data-testid="clinic-template-promotions"]'));
  await waitFor(() => app.document.querySelector('[data-testid="clinic-template-packages"]'));

  assert.match(app.document.querySelector('[data-testid="clinic-template-promotions"]').textContent, /Summer Glow/);
  assert.doesNotMatch(app.document.querySelector('[data-testid="clinic-template-promotions"]').textContent, /Glow Course/);
  assert.match(app.document.querySelector('[data-testid="clinic-template-packages"]').textContent, /Glow Course/);
});

test('Public clinic offerings rendering - handles null prices as ask-price copy', async () => {
  const app = await loadPublicApp({
    routes: clinicRoutes({
      services: { status: 200, body: { items: [{ ...publicServices[0], priceMin: null, priceMax: null } ] } },
      packages: { status: 200, body: { items: [{ ...publicPackages[0], price: null }] } }
    })
  });

  await waitFor(() => app.document.querySelector('[data-testid="clinic-template-service-card-11"]'));
  assert.match(app.document.querySelector('[data-testid="clinic-template-service-card-11"]').textContent, /สอบถามราคา/);
  assert.match(app.document.querySelector('[data-testid="clinic-template-package-card-31"]').textContent, /สอบถามราคา/);
});

test('Public clinic offerings rendering - escapes offering text and avoids raw HTML injection', async () => {
  const app = await loadPublicApp({
    routes: clinicRoutes({
      services: {
        status: 200,
        body: {
          items: [
            {
              ...publicServices[0],
              shortDescription: '<img src=x onerror=alert(1)>Safe text'
            }
          ]
        }
      }
    })
  });

  const card = await waitFor(() => app.document.querySelector('[data-testid="clinic-template-service-card-11"]'));
  assert.equal(card.querySelector('img'), null);
  assert.doesNotMatch(card.innerHTML, /onerror=/);
  assert.match(card.textContent, /Safe text/);
});
