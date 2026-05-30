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
    name: 'FlowBiz Clinic A',
    slug: 'flowbiz-clinic-a',
    timezone: 'Asia/Bangkok',
    locale: 'th-TH'
  };
  const organization = {
    id: 2001,
    clinicId: 1001,
    name: 'FlowBiz Org',
    slug: 'flowbiz-org',
    timezone: 'Asia/Bangkok'
  };
  const workspaceOne = {
    id: 3001,
    clinicId: 1001,
    organizationId: 2001,
    name: 'Primary Workspace',
    slug: 'primary-workspace',
    status: 'active',
    timezone: 'Asia/Bangkok'
  };

  const memberships = [
    {
      id: 4001,
      clinicId: 1001,
      organizationId: 2001,
      workspaceId: 3001,
      role: 'owner',
      status: 'active',
      permissions: overrides.permissions || [],
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
      permissions: overrides.permissions || []
    },
    memberships,
    roles: ['owner'],
    permissions: overrides.permissions || [],
    ...overrides
  };
}

async function waitFor(predicate, timeout = 5000) {
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

  // Forward console messages and uncaught errors
  dom.window.console.log = (...args) => console.log('JSDOM LOG:', ...args);
  dom.window.console.error = (...args) => console.error('JSDOM ERROR:', ...args);
  dom.window.console.warn = (...args) => console.warn('JSDOM WARN:', ...args);
  dom.window.addEventListener('error', (event) => {
    console.error('JSDOM UNCAUGHT ERROR:', event.error || event.message);
  });
  dom.window.addEventListener('unhandledrejection', (event) => {
    console.error('JSDOM UNHANDLED REJECTION:', event.reason);
  });

  dom.window.eval(bundleSource);

  await waitFor(() => dom.window.document.querySelector('[data-testid="admin-shell"]'));

  return {
    dom,
    document: dom.window.document,
    window: dom.window,
    requests
  };
}

const mockWebsitePayload = {
  clinic: {
    id: 1001,
    name: 'FlowBiz Clinic A',
    slug: 'flowbiz-clinic-a'
  },
  websiteSettings: {
    websiteStatus: 'draft',
    publicDisplayName: 'FlowBiz Brand A',
    tagline: 'Best Skincare',
    shortDescription: 'Modern skincare center.',
    defaultLocale: 'th-TH',
    publishedAt: null
  },
  brandingSettings: {
    logoUrl: 'https://cdn/logo.png',
    faviconUrl: 'https://cdn/favicon.ico',
    heroImageUrl: 'https://cdn/hero.jpg',
    primaryColor: '#0F766E',
    secondaryColor: '#FFF',
    accentColor: '#FFFFFF00',
    fontFamily: 'Inter'
  },
  contactSettings: {
    phone: '0987654321',
    email: 'clinic@local.com',
    lineUrl: 'https://line.me/ti/p/test',
    lineOaId: '@clinic',
    facebookUrl: null,
    instagramUrl: null,
    tiktokUrl: null,
    websiteUrl: null
  },
  locationSettings: {
    addressLine1: '123 Main Road',
    addressLine2: 'Soi 5',
    district: 'Pathum Wan',
    province: 'Bangkok',
    postalCode: '10330',
    country: 'Thailand',
    googleMapUrl: 'https://maps/test',
    googleMapEmbedUrl: null,
    latitude: 13.75,
    longitude: 100.5,
    businessHours: { mon: '09:00 - 20:00' }
  },
  homepageSections: [
    {
      id: 99,
      sectionKey: 'my_hero',
      sectionType: 'hero',
      title: 'Welcome Hero',
      subtitle: 'Modern Aesthetics',
      content: { buttonText: 'Contact LINE' },
      sortOrder: 0,
      status: 'published'
    }
  ]
};

test('Admin UI - Clinic Website Editor - Navigation menu', async () => {
  const session = createSessionFixture();
  const app = await loadAdminApp({
    routes: {
      'GET /auth/me': { status: 200, body: session },
      'GET /admin/clinic-website': { status: 200, body: mockWebsitePayload }
    }
  });

  const sidebarButton = app.document.querySelector('[data-testid="nav-clinic-website"]');
  assert.ok(sidebarButton);
  assert.match(sidebarButton.textContent, /เว็บไซต์คลินิก/);

  click(sidebarButton, app.window);

  await waitFor(() => app.document.querySelector('[data-testid="clinic-website-page"]'));
  assert.equal(app.window.location.hash, '#/clinic-website');
});

test('Admin UI - Clinic Website Editor - Load and Save General Settings', async () => {
  const session = createSessionFixture();
  const app = await loadAdminApp({
    route: '#/clinic-website',
    routes: {
      'GET /auth/me': { status: 200, body: session },
      'GET /admin/clinic-website': { status: 200, body: mockWebsitePayload },
      'PATCH /admin/clinic-website/settings': {
        status: 200,
        body: {
          ...mockWebsitePayload.websiteSettings,
          publicDisplayName: 'FlowBiz Super Brand'
        }
      }
    }
  });

  // Wait for the form to be painted AND values to be populated from the API
  await waitFor(() => {
    const el = app.document.querySelector('[data-testid="clinic-website-display-name"]');
    return el && el.value === 'FlowBiz Brand A';
  });

  const displayNameInput = app.document.querySelector('[data-testid="clinic-website-display-name"]');

  // Change input
  setInputValue(displayNameInput, 'FlowBiz Super Brand', app.window);

  // Submit
  submitForm(app.document.querySelector('[data-testid="clinic-website-general-form"]'), app.window);

  await waitFor(() => app.document.body.textContent.includes('บันทึกข้อมูลทั่วไปสำเร็จ!'));

  const patchReq = app.requests.find(r => r.method === 'PATCH' && r.url.pathname === '/admin/clinic-website/settings');
  assert.ok(patchReq);
  const payload = JSON.parse(patchReq.body);
  assert.equal(payload.publicDisplayName, 'FlowBiz Super Brand');
});

test('Admin UI - Clinic Website Editor - Branding Forms & HEX-only blocking validator', async () => {
  const session = createSessionFixture();
  const app = await loadAdminApp({
    route: '#/clinic-website',
    routes: {
      'GET /auth/me': { status: 200, body: session },
      'GET /admin/clinic-website': { status: 200, body: mockWebsitePayload },
      'PATCH /admin/clinic-website/branding': {
        status: 200,
        body: {
          ...mockWebsitePayload.brandingSettings,
          primaryColor: '#00FF00'
        }
      }
    }
  });

  // Wait for page to load first
  await waitFor(() => app.document.querySelector('[data-testid="clinic-website-general-form"]'));

  // Switch to Branding Tab
  const tabs = app.document.querySelectorAll('.blog-editor-tabs button');
  const brandingTab = [...tabs].find(t => t.textContent.includes('การออกแบบ'));
  click(brandingTab, app.window);

  // Wait for branding form to load and populate color value
  await waitFor(() => {
    const el = app.document.querySelector('[data-testid="clinic-website-primary-color"]');
    return el && el.value === '#0F766E';
  });

  const primaryColorInput = app.document.querySelector('[data-testid="clinic-website-primary-color"]');

  // 1. Enter invalid color
  setInputValue(primaryColorInput, 'invalid-red', app.window);

  // Assert inline warning exists
  await waitFor(() => app.document.querySelector('[data-testid="clinic-website-color-error"]'));
  const errorSpan = app.document.querySelector('[data-testid="clinic-website-color-error"]');
  assert.match(errorSpan.textContent, /HEX/);

  // Submit should not work or not trigger API call
  submitForm(app.document.querySelector('[data-testid="clinic-website-branding-form"]'), app.window);

  // 2. Fix the color to valid HEX
  setInputValue(primaryColorInput, '#00FF00', app.window);

  // Submit and verify API request
  submitForm(app.document.querySelector('[data-testid="clinic-website-branding-form"]'), app.window);

  await waitFor(() => app.document.body.textContent.includes('บันทึกข้อมูลการออกแบบสำเร็จ!'));

  const patchReq = app.requests.find(r => r.method === 'PATCH' && r.url.pathname === '/admin/clinic-website/branding');
  assert.ok(patchReq);
  const payload = JSON.parse(patchReq.body);
  assert.equal(payload.primaryColor, '#00FF00');
});

test('Admin UI - Clinic Website Editor - Save Contact & Location', async () => {
  const session = createSessionFixture();
  const app = await loadAdminApp({
    route: '#/clinic-website',
    routes: {
      'GET /auth/me': { status: 200, body: session },
      'GET /admin/clinic-website': { status: 200, body: mockWebsitePayload },
      'PATCH /admin/clinic-website/contact': {
        status: 200,
        body: {
          ...mockWebsitePayload.contactSettings,
          phone: '0888888888'
        }
      },
      'PATCH /admin/clinic-website/location': {
        status: 200,
        body: {
          ...mockWebsitePayload.locationSettings,
          province: 'Chiang Mai'
        }
      }
    }
  });

  // Wait for page to load first
  await waitFor(() => app.document.querySelector('[data-testid="clinic-website-general-form"]'));

  // Switch to Contact
  const tabs = app.document.querySelectorAll('.blog-editor-tabs button');
  const contactTab = [...tabs].find(t => t.textContent.includes('การติดต่อ'));
  click(contactTab, app.window);

  await waitFor(() => app.document.querySelector('[data-testid="clinic-website-contact-form"]'));
  const phoneInput = app.document.querySelector('[data-testid="clinic-website-phone"]');
  setInputValue(phoneInput, '0888888888', app.window);
  submitForm(app.document.querySelector('[data-testid="clinic-website-contact-form"]'), app.window);

  await waitFor(() => app.document.body.textContent.includes('บันทึกข้อมูลการติดต่อสำเร็จ!'));

  // Switch to Location
  const locationTab = [...tabs].find(t => t.textContent.includes('สถานที่'));
  click(locationTab, app.window);

  await waitFor(() => app.document.querySelector('[data-testid="clinic-website-location-form"]'));
  const provinceInput = app.document.querySelector('[data-testid="clinic-website-province"]');
  setInputValue(provinceInput, 'Chiang Mai', app.window);
  submitForm(app.document.querySelector('[data-testid="clinic-website-location-form"]'), app.window);

  await waitFor(() => app.document.body.textContent.includes('บันทึกข้อมูลที่ตั้งสำเร็จ!'));
});

test('Admin UI - Clinic Website Editor - Homepage Sections list & Save section', async () => {
  const session = createSessionFixture();
  const app = await loadAdminApp({
    route: '#/clinic-website',
    routes: {
      'GET /auth/me': { status: 200, body: session },
      'GET /admin/clinic-website': { status: 200, body: mockWebsitePayload },
      'PATCH /admin/clinic-website/sections/99': {
        status: 200,
        body: {
          ...mockWebsitePayload.homepageSections[0],
          title: 'Premium Beauty Services'
        }
      }
    }
  });

  // Wait for page to load first
  await waitFor(() => app.document.querySelector('[data-testid="clinic-website-general-form"]'));

  // Switch to Sections Tab
  const tabs = app.document.querySelectorAll('.blog-editor-tabs button');
  const sectionsTab = [...tabs].find(t => t.textContent.includes('ส่วนของหน้าแรก'));
  click(sectionsTab, app.window);

  await waitFor(() => app.document.querySelector('[data-testid="clinic-website-sections"]'));
  assert.match(app.document.body.textContent, /my_hero/);

  const row = app.document.querySelector('[data-testid="clinic-website-section-row-99"]');
  assert.ok(row);

  const titleInput = app.document.querySelector('[data-testid="clinic-website-section-title-99"]');
  setInputValue(titleInput, 'Premium Beauty Services', app.window);

  // Validate JSON string check
  const contentTextarea = app.document.querySelector('[data-testid="clinic-website-section-content-99"]');
  
  // Set invalid JSON and try to save (should block and alert/warn)
  const windowAlertOriginal = app.window.alert;
  let alertTriggered = false;
  app.window.alert = () => { alertTriggered = true; };

  setInputValue(contentTextarea, '{ invalid_json_here }', app.window);
  const saveButton = app.document.querySelector('[data-testid="clinic-website-section-save-99"]');
  click(saveButton, app.window);

  assert.ok(alertTriggered);

  // Reset to valid JSON
  setInputValue(contentTextarea, '{ "buttonText": "Contact Premium LINE" }', app.window);
  click(saveButton, app.window);

  await waitFor(() => app.document.body.textContent.includes("บันทึก Section 'my_hero' สำเร็จ!"));

  // Restore alert
  app.window.alert = windowAlertOriginal;

  const patchReq = app.requests.find(r => r.method === 'PATCH' && r.url.pathname === '/admin/clinic-website/sections/99');
  assert.ok(patchReq);
  const payload = JSON.parse(patchReq.body);
  assert.equal(payload.title, 'Premium Beauty Services');
  assert.deepEqual(payload.content, { buttonText: 'Contact Premium LINE' });
});

test('Admin UI - Clinic Website Editor - 403 Permission Error Notice', async () => {
  const session = createSessionFixture();
  const app = await loadAdminApp({
    route: '#/clinic-website',
    routes: {
      'GET /auth/me': { status: 200, body: session },
      'GET /admin/clinic-website': {
        status: 403,
        body: {
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: 'Forbidden.'
          }
        }
      }
    }
  });

  await waitFor(() => app.document.querySelector('[data-testid="clinic-website-permission-error"]'));
  const notice = app.document.querySelector('[data-testid="clinic-website-permission-error"]');
  assert.ok(notice);
  assert.match(notice.textContent, /คุณไม่มีสิทธิ์แก้ไขเว็บไซต์คลินิกนี้/);
});

test('Admin UI - Clinic Website Editor - Preview Link rendering', async () => {
  const session = createSessionFixture();
  const app = await loadAdminApp({
    route: '#/clinic-website',
    routes: {
      'GET /auth/me': { status: 200, body: session },
      'GET /admin/clinic-website': { status: 200, body: mockWebsitePayload }
    }
  });

  await waitFor(() => app.document.querySelector('[data-testid="clinic-website-preview-link"]'));
  const link = app.document.querySelector('[data-testid="clinic-website-preview-link"]');
  assert.ok(link);
  assert.equal(link.getAttribute('href'), '/flowbiz-clinic-a');
  assert.match(link.textContent, /ดูหน้าเว็บคลินิก/);
});
