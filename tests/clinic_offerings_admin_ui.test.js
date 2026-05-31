const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');
const { JSDOM } = require('jsdom');

const bundleSource = esbuild.buildSync({
  entryPoints: [path.resolve(__dirname, '..', 'apps', 'web', 'src', 'main.js')],
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

    if (!queue || queue.length === 0) {
      throw new Error(`Unhandled fetch request in mock: ${fullKey}`);
    }

    const requestRecord = {
      method,
      url,
      headers: init.headers || {},
      body: init.body || null
    };
    requests.push(requestRecord);

    const next = queue.shift();
    const result = typeof next === 'function' ? await next(requestRecord, requests) : next;
    return createResponse(result.status || 200, result.body);
  }

  return { requests, fetchMock };
}

function createSessionFixture(overrides = {}) {
  const role = overrides.role || 'owner';
  const clinic = { id: 1001, name: 'FlowBiz Clinic A', slug: 'flowbiz-clinic-a' };
  const workspace = { id: 3001, clinicId: 1001, name: 'Primary Workspace', slug: 'primary-workspace' };
  const membership = {
    id: 4001,
    clinicId: 1001,
    workspaceId: 3001,
    role,
    status: 'active',
    permissions: [],
    clinic,
    workspace,
    organization: { id: 2001, name: 'FlowBiz Org', slug: 'flowbiz-org' }
  };

  return {
    token: 'test-token',
    user: { id: 501, email: `${role}@example.com`, name: `${role} User`, status: 'active' },
    currentClinic: clinic,
    currentOrganization: membership.organization,
    currentWorkspace: workspace,
    currentMembership: membership,
    memberships: [membership],
    roles: [role],
    permissions: [],
    ...overrides
  };
}

const services = [
  {
    id: 11,
    name: 'Botox Lift',
    category: 'Injectable',
    shortDescription: 'ลดริ้วรอย',
    durationMinutes: 30,
    priceMin: 3000,
    priceMax: 8000,
    currency: 'THB',
    status: 'active',
    isFeatured: true,
    sortOrder: 0,
    imageUrl: null
  },
  {
    id: 12,
    name: 'Laser Glow',
    category: 'Skin',
    shortDescription: 'ผิวใส',
    durationMinutes: 45,
    priceMin: 2500,
    priceMax: null,
    currency: 'THB',
    status: 'draft',
    isFeatured: false,
    sortOrder: 1,
    imageUrl: null
  }
];

const promotions = [
  {
    id: 21,
    title: 'Summer Glow',
    subtitle: 'ลดพิเศษเดือนนี้',
    badgeLabel: 'Hot',
    startsAt: null,
    endsAt: null,
    status: 'active',
    isFeatured: true,
    sortOrder: 0,
    imageUrl: null,
    ctaLabel: 'ดูโปร',
    ctaUrl: 'https://example.com/promo'
  }
];

const packages = [
  {
    id: 31,
    name: 'Glow Course',
    summary: 'ดูแลต่อเนื่อง 3 ครั้ง',
    price: 12000,
    currency: 'THB',
    status: 'active',
    isFeatured: true,
    sortOrder: 0,
    imageUrl: null
  }
];

function offeringRoutes(session = createSessionFixture(), overrides = {}) {
  return {
    'GET /auth/me': { status: 200, body: session },
    'GET /admin/clinic-offerings/services': overrides.services || { status: 200, body: { items: services } },
    'GET /admin/clinic-offerings/promotions': overrides.promotions || { status: 200, body: { items: promotions } },
    'GET /admin/clinic-offerings/packages': overrides.packages || { status: 200, body: { items: packages } },
    ...overrides.extra
  };
}

async function waitFor(predicate, timeout = 5000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const value = predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Timed out waiting for UI condition.');
}

function setInputValue(element, value, window) {
  const prototype = Object.getPrototypeOf(element);
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');

  if (descriptor && typeof descriptor.set === 'function') {
    descriptor.set.call(element, value);
  } else {
    element.value = value;
  }

  if (element.type !== 'checkbox' && element.tagName !== 'SELECT') {
    element.dispatchEvent(new window.Event('input', { bubbles: true }));
  }
  element.dispatchEvent(new window.Event('change', { bubbles: true }));
}

function click(element, window) {
  element.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
}

function submitForm(element, window) {
  element.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
}

async function loadAdminApp({ route = '#/clinic-offerings', token = 'test-token', routes }) {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', {
    url: `http://localhost:3000/${route}`,
    runScripts: 'dangerously',
    pretendToBeVisual: true
  });
  const { fetchMock, requests } = createFetchMock(routes);

  dom.window.__FLOWBIZ_WEB_CONFIG__ = { apiBaseUrl: 'http://localhost:3001' };
  dom.window.fetch = fetchMock;
  dom.window.confirm = () => true;
  dom.window.requestAnimationFrame = (callback) => dom.window.setTimeout(() => callback(Date.now()), 16);
  dom.window.cancelAnimationFrame = (id) => dom.window.clearTimeout(id);
  dom.window.sessionStorage.setItem('flowbiz.admin.token', token);
  dom.window.eval(bundleSource);

  await waitFor(() => dom.window.document.querySelector('[data-testid="admin-shell"]'));
  return { dom, document: dom.window.document, window: dom.window, requests };
}

test('Admin Offerings UI - navigation exposes PR10B route', async () => {
  const app = await loadAdminApp({
    route: '',
    routes: offeringRoutes(createSessionFixture())
  });

  const nav = app.document.querySelector('[data-testid="nav-clinic-offerings"]');
  assert.ok(nav);
  assert.match(nav.textContent, /บริการและแพ็กเกจ/);

  click(nav, app.window);
  await waitFor(() => app.document.querySelector('[data-testid="clinic-offerings-page"]'));
  assert.equal(app.window.location.hash, '#/clinic-offerings');
});

test('Admin Offerings UI - loads services, promotions, and packages', async () => {
  const app = await loadAdminApp({ routes: offeringRoutes(createSessionFixture()) });

  await waitFor(() => app.document.querySelector('[data-testid="clinic-offerings-services-table"]'));
  await waitFor(() => app.document.querySelector('[data-testid="clinic-offerings-service-row-11"]'));
  assert.match(app.document.body.textContent, /Botox Lift/);

  click(app.document.querySelector('[data-testid="clinic-offerings-tab-promotions"]'), app.window);
  await waitFor(() => app.document.querySelector('[data-testid="clinic-offerings-promotions-table"]'));
  assert.match(app.document.body.textContent, /Summer Glow/);

  click(app.document.querySelector('[data-testid="clinic-offerings-tab-packages"]'), app.window);
  await waitFor(() => app.document.querySelector('[data-testid="clinic-offerings-packages-table"]'));
  assert.match(app.document.body.textContent, /Glow Course/);
});

test('Admin Offerings UI - creates service without clinicId in payload', async () => {
  const app = await loadAdminApp({
    routes: offeringRoutes(createSessionFixture(), {
      services: [
        { status: 200, body: { items: services } },
        { status: 200, body: { items: services } }
      ],
      promotions: [
        { status: 200, body: { items: promotions } },
        { status: 200, body: { items: promotions } }
      ],
      packages: [
        { status: 200, body: { items: packages } },
        { status: 200, body: { items: packages } }
      ],
      extra: {
        'POST /admin/clinic-offerings/services': { status: 201, body: { ...services[0], id: 99, name: 'Hydra Facial' } }
      }
    })
  });

  await waitFor(() => app.document.querySelector('[data-testid="clinic-offerings-service-name"]'));
  setInputValue(app.document.querySelector('[data-testid="clinic-offerings-service-name"]'), 'Hydra Facial', app.window);
  setInputValue(app.document.querySelector('[data-testid="clinic-offerings-service-price-min"]'), '1500', app.window);
  setInputValue(app.document.querySelector('[data-testid="clinic-offerings-service-price-max"]'), '3500', app.window);
  setInputValue(app.document.querySelector('[data-testid="clinic-offerings-service-image-url"]'), '  https://example.com/hydra.png  ', app.window);
  submitForm(app.document.querySelector('[data-testid="clinic-offerings-service-form"]'), app.window);

  await waitFor(() => app.document.body.textContent.includes('เพิ่มบริการสำเร็จ'));
  const request = app.requests.find((item) => item.method === 'POST' && item.url.pathname === '/admin/clinic-offerings/services');
  assert.ok(request);
  const payload = JSON.parse(request.body);
  assert.equal(payload.name, 'Hydra Facial');
  assert.equal(payload.priceMin, 1500);
  assert.equal(payload.imageUrl, 'https://example.com/hydra.png');
  assert.equal(payload.clinicId, undefined);
  assert.equal(payload.clinic_id, undefined);
});

test('Admin Offerings UI - blocks invalid price range before request', async () => {
  const app = await loadAdminApp({ routes: offeringRoutes(createSessionFixture()) });
  await waitFor(() => app.document.querySelector('[data-testid="clinic-offerings-service-name"]'));

  setInputValue(app.document.querySelector('[data-testid="clinic-offerings-service-name"]'), 'Bad Price', app.window);
  setInputValue(app.document.querySelector('[data-testid="clinic-offerings-service-price-min"]'), '5000', app.window);
  setInputValue(app.document.querySelector('[data-testid="clinic-offerings-service-price-max"]'), '1000', app.window);
  submitForm(app.document.querySelector('[data-testid="clinic-offerings-service-form"]'), app.window);

  await waitFor(() => app.document.body.textContent.includes('ราคาสูงสุดต้องมากกว่าหรือเท่ากับราคาต่ำสุด'));
  assert.equal(app.requests.some((item) => item.method === 'POST' && item.url.pathname === '/admin/clinic-offerings/services'), false);
});

test('Admin Offerings UI - blocks unsafe offering URLs', async () => {
  const app = await loadAdminApp({ routes: offeringRoutes(createSessionFixture()) });
  await waitFor(() => app.document.querySelector('[data-testid="clinic-offerings-service-name"]'));

  setInputValue(app.document.querySelector('[data-testid="clinic-offerings-service-name"]'), 'Unsafe URL', app.window);
  setInputValue(app.document.querySelector('[data-testid="clinic-offerings-service-image-url"]'), 'javascript:alert(1)', app.window);
  submitForm(app.document.querySelector('[data-testid="clinic-offerings-service-form"]'), app.window);

  await waitFor(() => app.document.body.textContent.includes('Image URL ต้องขึ้นต้นด้วย'));
  assert.equal(app.requests.some((item) => item.method === 'POST' && item.url.pathname === '/admin/clinic-offerings/services'), false);
});

test('Admin Offerings UI - blocks negative service values and package price before request', async () => {
  const app = await loadAdminApp({ routes: offeringRoutes(createSessionFixture()) });
  await waitFor(() => app.document.querySelector('[data-testid="clinic-offerings-service-name"]'));

  setInputValue(app.document.querySelector('[data-testid="clinic-offerings-service-name"]'), 'Negative Price', app.window);
  setInputValue(app.document.querySelector('[data-testid="clinic-offerings-service-price-min"]'), '-1', app.window);
  submitForm(app.document.querySelector('[data-testid="clinic-offerings-service-form"]'), app.window);

  await waitFor(() => app.document.body.textContent.includes('ราคาต่ำสุดต้องไม่น้อยกว่า 0'));
  assert.equal(app.requests.some((item) => item.method === 'POST' && item.url.pathname === '/admin/clinic-offerings/services'), false);

  setInputValue(app.document.querySelector('[data-testid="clinic-offerings-service-price-min"]'), '', app.window);
  setInputValue(app.document.querySelector('[data-testid="clinic-offerings-service-duration"]'), '-5', app.window);
  submitForm(app.document.querySelector('[data-testid="clinic-offerings-service-form"]'), app.window);
  await waitFor(() => app.document.body.textContent.includes('ระยะเวลาต้องไม่น้อยกว่า 0'));

  click(app.document.querySelector('[data-testid="clinic-offerings-tab-packages"]'), app.window);
  await waitFor(() => app.document.querySelector('[data-testid="clinic-offerings-package-name"]'));
  setInputValue(app.document.querySelector('[data-testid="clinic-offerings-package-name"]'), 'Negative Package', app.window);
  setInputValue(app.document.querySelector('[data-testid="clinic-offerings-package-price"]'), '-100', app.window);
  submitForm(app.document.querySelector('[data-testid="clinic-offerings-package-form"]'), app.window);

  await waitFor(() => app.document.body.textContent.includes('ราคาต้องไม่น้อยกว่า 0'));
  assert.equal(app.requests.some((item) => item.method === 'POST' && item.url.pathname === '/admin/clinic-offerings/packages'), false);
});

test('Admin Offerings UI - updates and deletes services', async () => {
  const app = await loadAdminApp({
    routes: offeringRoutes(createSessionFixture(), {
      services: [
        { status: 200, body: { items: services } },
        { status: 200, body: { items: services } },
        { status: 200, body: { items: services.slice(1) } }
      ],
      promotions: [
        { status: 200, body: { items: promotions } },
        { status: 200, body: { items: promotions } },
        { status: 200, body: { items: promotions } }
      ],
      packages: [
        { status: 200, body: { items: packages } },
        { status: 200, body: { items: packages } },
        { status: 200, body: { items: packages } }
      ],
      extra: {
        'PATCH /admin/clinic-offerings/services/11': { status: 200, body: { ...services[0], name: 'Botox Premium' } },
        'DELETE /admin/clinic-offerings/services/11': { status: 200, body: { success: true } }
      }
    })
  });

  await waitFor(() => app.document.querySelector('[data-testid="clinic-offerings-service-edit-11"]'));
  click(app.document.querySelector('[data-testid="clinic-offerings-service-edit-11"]'), app.window);
  await waitFor(() => app.document.querySelector('[data-testid="clinic-offerings-service-name"]').value === 'Botox Lift');
  setInputValue(app.document.querySelector('[data-testid="clinic-offerings-service-name"]'), 'Botox Premium', app.window);
  submitForm(app.document.querySelector('[data-testid="clinic-offerings-service-form"]'), app.window);
  await waitFor(() => app.requests.some((item) => item.method === 'PATCH' && item.url.pathname === '/admin/clinic-offerings/services/11'));

  click(app.document.querySelector('[data-testid="clinic-offerings-service-delete-11"]'), app.window);
  await waitFor(() => app.requests.some((item) => item.method === 'DELETE' && item.url.pathname === '/admin/clinic-offerings/services/11'));
});

test('Admin Offerings UI - update can clear optional offering fields', async () => {
  const app = await loadAdminApp({
    routes: offeringRoutes(createSessionFixture(), {
      services: [
        { status: 200, body: { items: services } },
        { status: 200, body: { items: [{ ...services[0], category: null, shortDescription: null, priceMin: null, priceMax: null, imageUrl: null }, services[1]] } }
      ],
      promotions: [
        { status: 200, body: { items: promotions } },
        { status: 200, body: { items: promotions } }
      ],
      packages: [
        { status: 200, body: { items: packages } },
        { status: 200, body: { items: packages } }
      ],
      extra: {
        'PATCH /admin/clinic-offerings/services/11': { status: 200, body: { ...services[0], category: null, shortDescription: null, priceMin: null, priceMax: null, imageUrl: null } }
      }
    })
  });

  await waitFor(() => app.document.querySelector('[data-testid="clinic-offerings-service-edit-11"]'));
  click(app.document.querySelector('[data-testid="clinic-offerings-service-edit-11"]'), app.window);
  await waitFor(() => app.document.querySelector('[data-testid="clinic-offerings-service-category"]').value === 'Injectable');

  setInputValue(app.document.querySelector('[data-testid="clinic-offerings-service-category"]'), '', app.window);
  setInputValue(app.document.querySelector('[data-testid="clinic-offerings-service-short-description"]'), '', app.window);
  setInputValue(app.document.querySelector('[data-testid="clinic-offerings-service-price-min"]'), '', app.window);
  setInputValue(app.document.querySelector('[data-testid="clinic-offerings-service-price-max"]'), '', app.window);
  setInputValue(app.document.querySelector('[data-testid="clinic-offerings-service-image-url"]'), '', app.window);
  submitForm(app.document.querySelector('[data-testid="clinic-offerings-service-form"]'), app.window);

  await waitFor(() => app.requests.some((item) => item.method === 'PATCH' && item.url.pathname === '/admin/clinic-offerings/services/11'));
  const request = app.requests.find((item) => item.method === 'PATCH' && item.url.pathname === '/admin/clinic-offerings/services/11');
  const payload = JSON.parse(request.body);
  assert.equal(payload.category, null);
  assert.equal(payload.shortDescription, null);
  assert.equal(payload.priceMin, null);
  assert.equal(payload.priceMax, null);
  assert.equal(payload.imageUrl, null);
  assert.equal(payload.clinicId, undefined);
  assert.equal(payload.clinic_id, undefined);
});

test('Admin Offerings UI - reorders services with items payload only', async () => {
  const app = await loadAdminApp({
    routes: offeringRoutes(createSessionFixture(), {
      services: [
        { status: 200, body: { items: services } },
        { status: 200, body: { items: [services[1], services[0]] } }
      ],
      promotions: [
        { status: 200, body: { items: promotions } },
        { status: 200, body: { items: promotions } }
      ],
      packages: [
        { status: 200, body: { items: packages } },
        { status: 200, body: { items: packages } }
      ],
      extra: {
        'PATCH /admin/clinic-offerings/services/reorder': { status: 200, body: { success: true } }
      }
    })
  });

  await waitFor(() => app.document.querySelector('[data-testid="clinic-offerings-service-down-11"]'));
  click(app.document.querySelector('[data-testid="clinic-offerings-service-down-11"]'), app.window);
  await waitFor(() => app.requests.some((item) => item.method === 'PATCH' && item.url.pathname === '/admin/clinic-offerings/services/reorder'));

  const request = app.requests.find((item) => item.method === 'PATCH' && item.url.pathname === '/admin/clinic-offerings/services/reorder');
  const payload = JSON.parse(request.body);
  assert.deepEqual(payload.items.map((item) => item.id), [12, 11]);
  assert.equal(payload.clinicId, undefined);
  assert.equal(payload.clinic_id, undefined);
});

test('Admin Offerings UI - creates promotion and package from tabs', async () => {
  const app = await loadAdminApp({
    routes: offeringRoutes(createSessionFixture(), {
      services: [
        { status: 200, body: { items: services } },
        { status: 200, body: { items: services } },
        { status: 200, body: { items: services } }
      ],
      promotions: [
        { status: 200, body: { items: promotions } },
        { status: 200, body: { items: promotions } }
      ],
      packages: [
        { status: 200, body: { items: packages } },
        { status: 200, body: { items: packages } }
      ],
      extra: {
        'POST /admin/clinic-offerings/promotions': { status: 201, body: { ...promotions[0], id: 22, title: 'VIP Promo' } },
        'POST /admin/clinic-offerings/packages': { status: 201, body: { ...packages[0], id: 32, name: 'VIP Package' } }
      }
    })
  });

  click(await waitFor(() => app.document.querySelector('[data-testid="clinic-offerings-tab-promotions"]')), app.window);
  await waitFor(() => app.document.querySelector('[data-testid="clinic-offerings-promotion-title"]'));
  setInputValue(app.document.querySelector('[data-testid="clinic-offerings-promotion-title"]'), 'VIP Promo', app.window);
  submitForm(app.document.querySelector('[data-testid="clinic-offerings-promotion-form"]'), app.window);
  await waitFor(() => app.requests.some((item) => item.method === 'POST' && item.url.pathname === '/admin/clinic-offerings/promotions'));
  await waitFor(() => app.document.querySelector('[data-testid="clinic-offerings-page"]') && app.document.body.textContent.includes('เพิ่มโปรโมชั่นสำเร็จ'));

  click(await waitFor(() => app.document.querySelector('[data-testid="clinic-offerings-tab-packages"]')), app.window);
  const packageNameInput = await waitFor(() => app.document.querySelector('[data-testid="clinic-offerings-package-name"]'));
  const packagePriceInput = await waitFor(() => app.document.querySelector('[data-testid="clinic-offerings-package-price"]'));
  setInputValue(packageNameInput, 'VIP Package', app.window);
  setInputValue(packagePriceInput, '9900', app.window);
  submitForm(app.document.querySelector('[data-testid="clinic-offerings-package-form"]'), app.window);
  await waitFor(() => app.requests.some((item) => item.method === 'POST' && item.url.pathname === '/admin/clinic-offerings/packages'));
});

test('Admin Offerings UI - package service add and remove uses tenant-safe payload', async () => {
  const app = await loadAdminApp({
    routes: offeringRoutes(createSessionFixture(), {
      extra: {
        'POST /admin/clinic-offerings/packages/31/services': { status: 201, body: { id: 401, packageId: 31, serviceId: 11, quantity: 2, sortOrder: 0 } },
        'DELETE /admin/clinic-offerings/packages/31/services/11': { status: 200, body: { success: true } }
      }
    })
  });

  click(await waitFor(() => app.document.querySelector('[data-testid="clinic-offerings-tab-packages"]')), app.window);
  await waitFor(() => app.document.querySelector('[data-testid="clinic-offerings-package-service-service"]'));
  setInputValue(app.document.querySelector('[data-testid="clinic-offerings-package-service-service"]'), '11', app.window);
  setInputValue(app.document.querySelector('[data-testid="clinic-offerings-package-service-quantity"]'), '2.9', app.window);
  submitForm(app.document.querySelector('[data-testid="clinic-offerings-package-service-form"]'), app.window);

  await waitFor(() => app.document.querySelector('[data-testid="clinic-offerings-package-service-row-11"]'));
  const request = app.requests.find((item) => item.method === 'POST' && item.url.pathname === '/admin/clinic-offerings/packages/31/services');
  const payload = JSON.parse(request.body);
  assert.equal(payload.serviceId, 11);
  assert.equal(payload.quantity, 2);
  assert.equal(payload.clinicId, undefined);
  assert.equal(payload.clinic_id, undefined);

  click(app.document.querySelector('[data-testid="clinic-offerings-package-service-remove-11"]'), app.window);
  await waitFor(() => app.requests.some((item) => item.method === 'DELETE' && item.url.pathname === '/admin/clinic-offerings/packages/31/services/11'));
});

test('Admin Offerings UI - staff and sales roles are read-only', async () => {
  const staffSession = createSessionFixture({ role: 'staff' });
  const app = await loadAdminApp({ routes: offeringRoutes(staffSession) });
  await waitFor(() => app.document.querySelector('[data-testid="clinic-offerings-readonly-notice"]'));
  await waitFor(() => app.document.querySelector('[data-testid="clinic-offerings-service-row-11"]'));

  assert.ok(app.document.querySelector('[data-testid="clinic-offerings-service-save"]').disabled);
  assert.match(app.document.body.textContent, /Botox Lift/);
});

test('Admin Offerings UI - 403 renders permission copy', async () => {
  const app = await loadAdminApp({
    routes: offeringRoutes(createSessionFixture(), {
      services: {
        status: 403,
        body: { error: { code: 'INSUFFICIENT_PERMISSIONS', message: 'Forbidden' } }
      }
    })
  });

  const notice = await waitFor(() => app.document.querySelector('[data-testid="clinic-offerings-permission-error"]'));
  assert.match(notice.textContent, /คุณไม่มีสิทธิ์แก้ไขบริการ โปรโมชั่น หรือแพ็กเกจของคลินิกนี้/);
  assert.match(notice.textContent, /Clinic Owner, Manager หรือ Marketing/);
});
