const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { buildWeb } = require('../scripts/build-web');

// Build bundle synchronously for UI testing
const bundlePath = buildWeb({ silent: true }).outputFile;
const bundleSource = fs.readFileSync(bundlePath, 'utf8');

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

  return {
    requests,
    fetchMock
  };
}

function createSessionFixture(overrides = {}) {
  const clinic = {
    id: 1001,
    name: 'FlowBiz Clinic',
    slug: 'flowbiz-clinic',
    timezone: 'Asia/Bangkok',
    locale: 'th-TH',
    brandingJson: { primaryColor: '#1144aa' },
    settingsJson: { plan: 'growth' }
  };
  const organization = {
    id: 2001,
    clinicId: 1001,
    name: 'FlowBiz Org',
    slug: 'flowbiz-org',
    timezone: 'Asia/Bangkok',
    settingsJson: { onboardingMode: 'guided' }
  };
  const workspaceOne = {
    id: 3001,
    clinicId: 1001,
    organizationId: 2001,
    name: 'Primary Workspace',
    slug: 'primary-workspace',
    status: 'active',
    timezone: 'Asia/Bangkok',
    settingsJson: { inboxMode: 'team' }
  };

  const memberships = [
    {
      id: 4001,
      clinicId: 1001,
      organizationId: 2001,
      workspaceId: 3001,
      role: 'owner',
      status: 'active',
      permissions: overrides.permissions || ['user.read'],
      clinic,
      organization,
      workspace: workspaceOne
    }
  ];

  return {
    token: 'test-token',
    user: {
      id: 501,
      email: 'owner@example.com',
      name: 'Owner User',
      status: 'active'
    },
    currentClinic: clinic,
    currentOrganization: organization,
    currentWorkspace: workspaceOne,
    currentMembership: {
      id: 4001,
      clinicId: 1001,
      organizationId: 2001,
      workspaceId: 3001,
      role: 'owner',
      status: 'active',
      permissions: overrides.permissions || ['user.read']
    },
    memberships,
    roles: ['owner'],
    permissions: overrides.permissions || ['user.read'],
    ...overrides
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

function setInputValue(element, value, window) {
  const prototype = Object.getPrototypeOf(element);
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');

  if (descriptor && typeof descriptor.set === 'function') {
    descriptor.set.call(element, value);
  } else {
    element.value = value;
  }

  if (element.tagName !== 'SELECT') {
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

async function loadAdminApp({ route = '', token = 'test-token', routes }) {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="app"></div></body></html>',
    {
      url: `http://localhost:3000/${route}`,
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
  dom.window.sessionStorage.setItem('flowbiz.admin.token', token);
  dom.window.eval(bundleSource);

  await waitFor(() => dom.window.document.querySelector('[data-testid="admin-shell"]'));

  return {
    dom,
    document: dom.window.document,
    window: dom.window,
    requests
  };
}

test('Admin UI - Clinics Page - Navigation', async () => {
  const session = createSessionFixture();
  const app = await loadAdminApp({
    routes: {
      'GET /auth/me': { status: 200, body: session },
      'GET /admin/clinics': { status: 200, body: { items: [], pagination: { limit: 50, offset: 0, total: 0 } } }
    }
  });

  const sidebarButton = app.document.querySelector('[data-testid="nav-clinics"]');
  assert.ok(sidebarButton);
  assert.match(sidebarButton.textContent, /จัดการคลินิก/);

  click(sidebarButton, app.window);

  await waitFor(() => app.document.querySelector('[data-testid="clinics-page"]'));
  assert.equal(app.window.location.hash, '#/clinics');
  assert.match(app.document.body.textContent, /Platform Admin console/);
});

test('Admin UI - Clinics Page - List Clinics', async () => {
  const session = createSessionFixture();
  const clinicList = {
    items: [
      {
        id: 100,
        name: 'Alpha Beauty Clinic',
        slug: 'alpha-beauty-clinic',
        plan: 'premium',
        status: 'active',
        timezone: 'Asia/Bangkok',
        websiteStatus: 'published',
        createdAt: '2026-05-29T00:00:00.000Z',
        updatedAt: '2026-05-29T00:00:00.000Z'
      }
    ],
    pagination: { limit: 50, offset: 0, total: 1 }
  };

  const app = await loadAdminApp({
    route: '#/clinics',
    routes: {
      'GET /auth/me': { status: 200, body: session },
      'GET /admin/clinics': { status: 200, body: clinicList }
    }
  });

  await waitFor(() => app.document.querySelector('[data-testid="clinics-table"]'));
  assert.match(app.document.body.textContent, /Alpha Beauty Clinic/);
  assert.match(app.document.body.textContent, /alpha-beauty-clinic/);
  assert.match(app.document.body.textContent, /premium/);

  const searchInput = app.document.querySelector('[data-testid="clinics-search"]');
  const statusFilter = app.document.querySelector('[data-testid="clinics-status-filter"]');
  const refreshButton = app.document.querySelector('[data-testid="clinics-refresh"]');

  assert.ok(searchInput);
  assert.ok(statusFilter);
  assert.ok(refreshButton);
});

test('Admin UI - Clinics Page - Create Clinic', async () => {
  const session = createSessionFixture();
  const initialList = { items: [], pagination: { limit: 50, offset: 0, total: 0 } };
  const createdClinic = {
    id: 101,
    name: 'Dynamic Beauty Shop',
    slug: 'dynamic-beauty-shop',
    plan: 'pro',
    status: 'active',
    timezone: 'Asia/Bangkok',
    websiteStatus: 'draft',
    createdAt: '2026-05-29T00:00:00.000Z',
    updatedAt: '2026-05-29T00:00:00.000Z'
  };
  const refreshedList = {
    items: [createdClinic],
    pagination: { limit: 50, offset: 0, total: 1 }
  };

  const app = await loadAdminApp({
    route: '#/clinics',
    routes: {
      'GET /auth/me': { status: 200, body: session },
      'GET /admin/clinics': [
        { status: 200, body: initialList },
        { status: 200, body: refreshedList }
      ],
      'POST /admin/clinics': {
        status: 201,
        body: createdClinic
      }
    }
  });

  await waitFor(() => app.document.querySelector('[data-testid="clinic-create-form"]'));
  
  setInputValue(app.document.querySelector('[data-testid="clinic-name-input"]'), 'Dynamic Beauty Shop', app.window);
  setInputValue(app.document.querySelector('[data-testid="clinic-slug-input"]'), 'dynamic-beauty-shop', app.window);
  setInputValue(app.document.querySelector('[data-testid="clinic-plan-select"]'), 'pro', app.window);
  setInputValue(app.document.querySelector('[data-testid="clinic-status-select"]'), 'active', app.window);

  submitForm(app.document.querySelector('[data-testid="clinic-create-form"]'), app.window);

  await waitFor(() => app.document.body.textContent.includes('เพิ่มคลินิกใหม่เรียบร้อยแล้ว'));
  await waitFor(() => app.document.body.textContent.includes('Dynamic Beauty Shop'));

  const postRequest = app.requests.find((request) => request.method === 'POST' && request.url.pathname === '/admin/clinics');
  assert.ok(postRequest);
  
  const payload = JSON.parse(postRequest.body);
  assert.equal(payload.name, 'Dynamic Beauty Shop');
  assert.equal(payload.slug, 'dynamic-beauty-shop');
  assert.equal(payload.plan, 'pro');
  assert.equal(payload.status, 'active');
});

test('Admin UI - Clinics Page - Edit Clinic', async () => {
  const session = createSessionFixture();
  const existingClinic = {
    id: 102,
    name: 'Starlight Skin Clinic',
    slug: 'starlight-skin-clinic',
    plan: 'starter',
    status: 'active',
    timezone: 'Asia/Bangkok',
    websiteStatus: 'draft',
    createdAt: '2026-05-29T00:00:00.000Z',
    updatedAt: '2026-05-29T00:00:00.000Z'
  };
  const listResponse = {
    items: [existingClinic],
    pagination: { limit: 50, offset: 0, total: 1 }
  };
  
  const clinicDetail = {
    ...existingClinic,
    websiteSettings: {
      id: 500,
      website_status: 'draft',
      public_display_name: 'Starlight Skin Clinic Public',
      tagline: 'Best dermatology clinic',
      short_description: 'Dermatology expertise and skin care solutions'
    }
  };

  const updatedClinic = {
    ...existingClinic,
    name: 'Starlight Clinic Premium',
    plan: 'premium'
  };

  const app = await loadAdminApp({
    route: '#/clinics',
    routes: {
      'GET /auth/me': { status: 200, body: session },
      'GET /admin/clinics': [
        { status: 200, body: listResponse },
        { status: 200, body: { items: [updatedClinic], pagination: { limit: 50, offset: 0, total: 1 } } }
      ],
      'GET /admin/clinics/102': { status: 200, body: clinicDetail },
      'PATCH /admin/clinics/102': { status: 200, body: updatedClinic }
    }
  });

  await waitFor(() => app.document.querySelector('[data-testid="clinic-edit-button-102"]'));
  
  const editButton = app.document.querySelector('[data-testid="clinic-edit-button-102"]');
  click(editButton, app.window);

  await waitFor(() => app.document.querySelector('[data-testid="clinic-edit-form"]'));

  const nameInput = app.document.querySelector('[data-testid="clinic-edit-form"] input[required]');
  assert.equal(nameInput.value, 'Starlight Skin Clinic');

  setInputValue(nameInput, 'Starlight Clinic Premium', app.window);
  
  const planSelect = app.document.querySelector('[data-testid="clinic-edit-form"] select');
  setInputValue(planSelect, 'premium', app.window);

  submitForm(app.document.querySelector('[data-testid="clinic-edit-form"]'), app.window);

  await waitFor(() => app.document.body.textContent.includes('แก้ไขข้อมูลคลินิกเรียบร้อยแล้ว'));
  await waitFor(() => app.document.body.textContent.includes('Starlight Clinic Premium'));

  const patchRequest = app.requests.find((request) => request.method === 'PATCH' && request.url.pathname === '/admin/clinics/102');
  assert.ok(patchRequest);
  
  const payload = JSON.parse(patchRequest.body);
  assert.equal(payload.name, 'Starlight Clinic Premium');
  assert.equal(payload.plan, 'premium');
});

test('Admin UI - Clinics Page - Status Toggle', async () => {
  const session = createSessionFixture();
  const clinic = {
    id: 103,
    name: 'Toggle Active Clinic',
    slug: 'toggle-active-clinic',
    plan: 'starter',
    status: 'active',
    timezone: 'Asia/Bangkok',
    websiteStatus: 'draft',
    createdAt: '2026-05-29T00:00:00.000Z',
    updatedAt: '2026-05-29T00:00:00.000Z'
  };

  const app = await loadAdminApp({
    route: '#/clinics',
    routes: {
      'GET /auth/me': { status: 200, body: session },
      'GET /admin/clinics': [
        { status: 200, body: { items: [clinic], pagination: { limit: 50, offset: 0, total: 1 } } },
        { status: 200, body: { items: [{ ...clinic, status: 'inactive' }], pagination: { limit: 50, offset: 0, total: 1 } } }
      ],
      'PATCH /admin/clinics/103/status': { status: 200, body: { ...clinic, status: 'inactive' } }
    }
  });

  await waitFor(() => app.document.querySelector('[data-testid="clinic-status-toggle-103"]'));
  
  const toggleButton = app.document.querySelector('[data-testid="clinic-status-toggle-103"]');
  click(toggleButton, app.window);

  await waitFor(() => app.document.body.textContent.includes('เปลี่ยนสถานะเป็น inactive เรียบร้อยแล้ว'));
  
  const patchRequest = app.requests.find((request) => request.method === 'PATCH' && request.url.pathname === '/admin/clinics/103/status');
  assert.ok(patchRequest);
  
  const payload = JSON.parse(patchRequest.body);
  assert.equal(payload.status, 'inactive');
});

test('Admin UI - Clinics Page - Permission 403 Notice', async () => {
  const session = createSessionFixture();

  const app = await loadAdminApp({
    route: '#/clinics',
    routes: {
      'GET /auth/me': { status: 200, body: session },
      'GET /admin/clinics': {
        status: 403,
        body: {
          error: {
            code: 'PLATFORM_ADMIN_REQUIRED',
            message: 'Platform admin permission is required.'
          }
        }
      }
    }
  });

  await waitFor(() => app.document.querySelector('[data-testid="clinic-platform-permission-notice"]'));
  
  const notice = app.document.querySelector('[data-testid="clinic-platform-permission-notice"]');
  assert.ok(notice);
  assert.match(notice.textContent, /ไม่สามารถเปิดหน้าจัดการคลินิกได้/);
  assert.match(notice.textContent, /ADMIN_CLINIC_API_ENABLED/);
  assert.match(notice.textContent, /PLATFORM_ADMIN_EMAILS/);
  assert.match(notice.textContent, /is_franchise_admin/);
});
