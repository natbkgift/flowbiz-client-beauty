'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');
const { JSDOM } = require('jsdom');

const publicBundleSource = esbuild.buildSync({
  entryPoints: [path.resolve(__dirname, '..', 'apps', 'web', 'src', 'public-main.js')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: ['es2020'],
  minify: true,
  write: false,
  logLevel: 'silent',
  define: { 'process.env.NODE_ENV': JSON.stringify('production') }
}).outputFiles[0].text;

const adminBundleSource = esbuild.buildSync({
  entryPoints: [path.resolve(__dirname, '..', 'apps', 'web', 'src', 'main.js')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: ['es2020'],
  minify: true,
  write: false,
  logLevel: 'silent',
  define: { 'process.env.NODE_ENV': JSON.stringify('production') }
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
    const requestRecord = { method, url, headers: init.headers || {}, body: init.body || null };
    requests.push(requestRecord);

    if (!queue || queue.length === 0) {
      return createResponse(404, { error: { code: 'NOT_FOUND', message: `not found: ${fullKey}` } });
    }

    const next = queue.shift();
    const result = typeof next === 'function' ? await next(requestRecord, requests) : next;
    return createResponse(result.status || 200, result.body);
  }

  return { requests, fetchMock };
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

function setValue(window, element, value) {
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value');
  if (descriptor?.set) {
    descriptor.set.call(element, value);
  } else {
    element.value = value;
  }
  if (element.type !== 'checkbox' && element.tagName !== 'SELECT') {
    element.dispatchEvent(new window.Event('input', { bubbles: true }));
  }
  element.dispatchEvent(new window.Event('change', { bubbles: true }));
}

function click(window, element) {
  element.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
}

function submit(window, form) {
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
}

const clinicPayload = {
  clinic: { id: 1001, name: 'Clinic Alpha', slug: 'clinic-alpha', status: 'active' },
  websiteSettings: {
    websiteStatus: 'active',
    publicDisplayName: 'Clinic Alpha',
    shortDescription: 'Premier aesthetic clinic.'
  },
  brandingSettings: {
    primaryColor: '#d4af37',
    secondaryColor: '#13151a',
    accentColor: '#f3e5ab'
  },
  contactSettings: { phone: '089-999-9999' },
  locationSettings: {},
  homepageSections: [],
  isPubliclyRenderable: true
};

function publicClinicRoutes(extra = {}) {
  return {
    'GET /public/clinics/clinic-alpha': { status: 200, body: clinicPayload },
    'GET /public/clinics/clinic-alpha/services': { status: 200, body: { items: [] } },
    'GET /public/clinics/clinic-alpha/promotions': { status: 200, body: { items: [] } },
    'GET /public/clinics/clinic-alpha/packages': { status: 200, body: { items: [] } },
    ...extra
  };
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
  dom.window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {};
  dom.window.eval(publicBundleSource);

  return { document: dom.window.document, window: dom.window, requests };
}

function createSessionFixture(role = 'owner') {
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
    permissions: []
  };
}

const bookingItems = [
  {
    id: 11,
    leadId: 101,
    requestType: 'booking_request',
    interestType: 'service',
    interestId: 201,
    preferredDate: '2099-06-15',
    preferredTimeWindow: 'afternoon',
    alternativePreferredDate: '2099-06-16',
    alternativeTimeWindow: 'morning',
    visitType: 'consultation',
    urgency: 'soon',
    slotStatus: 'requested',
    preferredContactMethod: 'line',
    customerName: 'Jane Doe',
    phone: '0899999999',
    email: 'jane@example.com',
    lineId: '@jane',
    status: 'new',
    createdAt: '2026-06-10T10:00:00.000Z',
    updatedAt: '2026-06-10T10:00:00.000Z'
  }
];

function bookingDetail(overrides = {}) {
  return {
    ...bookingItems[0],
    message: 'อยากปรึกษาก่อนทำ',
    lead: { id: 101, name: 'Jane Doe', status: 'new', stage: 'inquiry' },
    notes: [],
    ...overrides
  };
}

function bookingRoutes(overrides = {}) {
  return {
    'GET /auth/me': { status: 200, body: createSessionFixture() },
    'GET /admin/booking-requests': overrides.list || { status: 200, body: { items: bookingItems, total: 1, limit: 50, offset: 0 } },
    'GET /admin/booking-requests/11': overrides.detail || { status: 200, body: bookingDetail() },
    'GET /admin/booking-requests/11/slot-offers': overrides.slotOffers || { status: 200, body: { items: [] } },
    ...overrides.extra
  };
}

async function loadAdminApp({ routes }) {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', {
    url: 'http://localhost:3000/#/booking-requests',
    runScripts: 'dangerously',
    pretendToBeVisual: true
  });
  const { fetchMock, requests } = createFetchMock(routes);

  dom.window.__FLOWBIZ_WEB_CONFIG__ = { apiBaseUrl: 'http://localhost:3001' };
  dom.window.fetch = fetchMock;
  dom.window.confirm = () => true;
  dom.window.requestAnimationFrame = (callback) => dom.window.setTimeout(() => callback(Date.now()), 16);
  dom.window.cancelAnimationFrame = (id) => dom.window.clearTimeout(id);
  dom.window.sessionStorage.setItem('flowbiz.admin.token', 'test-token');
  dom.window.eval(adminBundleSource);

  await waitFor(() => dom.window.document.querySelector('[data-testid="admin-shell"]'));
  return { document: dom.window.document, window: dom.window, requests };
}

test('Calendar Slot Request UI - public form renders and submits slot fields', async () => {
  let capturedPayload = null;
  const app = await loadPublicApp({
    routes: publicClinicRoutes({
      'POST /public/clinics/clinic-alpha/booking-requests': (request) => {
        capturedPayload = JSON.parse(request.body);
        return { status: 201, body: { success: true, bookingRequestId: 123, leadId: 456, message: 'รับคำขอนัดหมายแล้วค่ะ' } };
      }
    })
  });

  const form = await waitFor(() => app.document.querySelector('[data-testid="clinic-booking-form"]'));
  assert.ok(app.document.querySelector('[data-testid="clinic-booking-alt-date"]'));
  assert.ok(app.document.querySelector('[data-testid="clinic-booking-alt-time-window"]'));
  assert.ok(app.document.querySelector('[data-testid="clinic-booking-visit-type"]'));
  assert.ok(app.document.querySelector('[data-testid="clinic-booking-urgency"]'));
  assert.ok(app.document.querySelector('[data-testid="clinic-booking-slot-notes"]'));

  setValue(app.window, app.document.querySelector('[data-testid="clinic-booking-phone"]'), '0899999999');
  setValue(app.window, app.document.querySelector('[data-testid="clinic-booking-preferred-date"]'), '2099-06-15');
  setValue(app.window, app.document.querySelector('[data-testid="clinic-booking-alt-date"]'), '2099-06-16');
  setValue(app.window, app.document.querySelector('[data-testid="clinic-booking-alt-time-window"]'), 'morning');
  setValue(app.window, app.document.querySelector('[data-testid="clinic-booking-visit-type"]'), 'treatment');
  setValue(app.window, app.document.querySelector('[data-testid="clinic-booking-urgency"]'), 'soon');
  setValue(app.window, app.document.querySelector('[data-testid="clinic-booking-slot-notes"]'), 'สะดวกหลังบ่ายสอง');
  click(app.window, app.document.querySelector('[data-testid="clinic-booking-consent"]'));
  submit(app.window, form);

  await waitFor(() => app.document.querySelector('[data-testid="clinic-booking-success"]'));
  assert.equal(capturedPayload.alternativePreferredDate, '2099-06-16');
  assert.equal(capturedPayload.alternativeTimeWindow, 'morning');
  assert.equal(capturedPayload.visitType, 'treatment');
  assert.equal(capturedPayload.urgency, 'soon');
  assert.deepEqual(capturedPayload.slotRequest, { notes: 'สะดวกหลังบ่ายสอง' });
  assert.equal(capturedPayload.clinicId, undefined);
  assert.equal(capturedPayload.clinic_id, undefined);
});

test('Calendar Slot Request UI - public validation blocks past alt date and long slot notes', async () => {
  const app = await loadPublicApp({ routes: publicClinicRoutes() });
  const form = await waitFor(() => app.document.querySelector('[data-testid="clinic-booking-form"]'));

  setValue(app.window, app.document.querySelector('[data-testid="clinic-booking-phone"]'), '0899999999');
  click(app.window, app.document.querySelector('[data-testid="clinic-booking-consent"]'));
  setValue(app.window, app.document.querySelector('[data-testid="clinic-booking-alt-date"]'), '2000-01-01');
  submit(app.window, form);
  await waitFor(() => /วันที่สำรอง/.test(app.document.querySelector('[data-testid="clinic-booking-error"]')?.textContent || ''));

  setValue(app.window, app.document.querySelector('[data-testid="clinic-booking-alt-date"]'), '');
  setValue(app.window, app.document.querySelector('[data-testid="clinic-booking-slot-notes"]'), 'x'.repeat(501));
  submit(app.window, form);
  await waitFor(() => /500/.test(app.document.querySelector('[data-testid="clinic-booking-error"]')?.textContent || ''));
});

test('Calendar Slot Request UI - platform routes do not render slot booking fields', async () => {
  const app = await loadPublicApp({ pathName: '/', routes: {} });
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(app.document.querySelector('[data-testid="clinic-booking-alt-date"]'), null);
  assert.equal(app.document.querySelector('[data-testid="clinic-booking-slot-notes"]'), null);
});

test('Calendar Slot Request UI - admin renders slot fields and sends filters', async () => {
  const app = await loadAdminApp({
    routes: bookingRoutes({
      list: [
        { status: 200, body: { items: bookingItems, total: 1, limit: 50, offset: 0 } },
        { status: 200, body: { items: [], total: 0, limit: 50, offset: 0 } }
      ]
    })
  });

  await waitFor(() => app.document.querySelector('[data-testid="booking-requests-filters"]'));
  assert.match(app.document.body.textContent, /เร็วๆ นี้/);
  assert.ok(app.document.querySelector('[data-testid="booking-request-slot-status"]'));
  assert.ok(app.document.querySelector('[data-testid="booking-request-visit-type"]'));
  assert.ok(app.document.querySelector('[data-testid="booking-request-urgency"]'));

  setValue(app.window, app.document.querySelector('[data-testid="booking-requests-slot-status-filter"]'), 'requested');
  setValue(app.window, app.document.querySelector('[data-testid="booking-requests-visit-type-filter"]'), 'consultation');
  setValue(app.window, app.document.querySelector('[data-testid="booking-requests-urgency-filter"]'), 'soon');
  setValue(app.window, app.document.querySelector('[data-testid="booking-requests-preferred-date-from"]'), '2099-06-01');
  setValue(app.window, app.document.querySelector('[data-testid="booking-requests-preferred-date-to"]'), '2099-06-30');
  submit(app.window, app.document.querySelector('[data-testid="booking-requests-filters"]'));

  await waitFor(() => app.requests.filter((request) => request.url.pathname === '/admin/booking-requests').length >= 2);
  const filteredRequest = app.requests.filter((request) => request.url.pathname === '/admin/booking-requests').at(-1);
  assert.equal(filteredRequest.url.searchParams.get('slotStatus'), 'requested');
  assert.equal(filteredRequest.url.searchParams.get('visitType'), 'consultation');
  assert.equal(filteredRequest.url.searchParams.get('urgency'), 'soon');
  assert.equal(filteredRequest.url.searchParams.get('preferredDateFrom'), '2099-06-01');
  assert.equal(filteredRequest.url.searchParams.get('preferredDateTo'), '2099-06-30');
});

test('Calendar Slot Request UI - admin detail renders alt slot and slot status save payload', async () => {
  let capturedPayload = null;
  const app = await loadAdminApp({
    routes: bookingRoutes({
      detail: [
        { status: 200, body: bookingDetail() },
        { status: 200, body: bookingDetail({ slotStatus: 'reviewing' }) }
      ],
      list: [
        { status: 200, body: { items: bookingItems, total: 1, limit: 50, offset: 0 } },
        { status: 200, body: { items: [{ ...bookingItems[0], slotStatus: 'reviewing' }], total: 1, limit: 50, offset: 0 } }
      ],
      extra: {
        'PATCH /admin/booking-requests/11/slot-status': (request) => {
          capturedPayload = JSON.parse(request.body);
          return { status: 200, body: { success: true, item: bookingDetail({ slotStatus: 'reviewing' }) } };
        }
      }
    })
  });

  click(app.window, await waitFor(() => app.document.querySelector('[data-testid="booking-request-row-11"]')));
  await waitFor(() => app.document.querySelector('[data-testid="booking-request-alt-slot"]'));
  assert.match(app.document.querySelector('[data-testid="booking-request-alt-slot"]').textContent, /2099-06-16/);

  setValue(app.window, app.document.querySelector('[data-testid="booking-request-slot-status-select"]'), 'reviewing');
  click(app.window, app.document.querySelector('[data-testid="booking-request-slot-status-save"]'));

  await waitFor(() => app.document.querySelector('[data-testid="booking-request-success"]'));
  assert.deepEqual(capturedPayload, { slotStatus: 'reviewing' });
  assert.equal(capturedPayload.clinicId, undefined);
  assert.equal(capturedPayload.clinic_id, undefined);
});
