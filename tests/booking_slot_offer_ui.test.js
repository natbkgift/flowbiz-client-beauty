'use strict';

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
  define: { 'process.env.NODE_ENV': JSON.stringify('production') }
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

const existingOffer = {
  id: 71,
  bookingRequestId: 11,
  offeredDate: '2099-06-20',
  offeredTimeWindow: 'afternoon',
  offeredStartTime: '14:00',
  durationMinutes: 60,
  offerStatus: 'draft',
  offerNote: 'ทีมงานขอเสนอเวลา 14:00',
  internalNote: 'ลูกค้าสะดวกบ่าย',
  customerResponseNote: 'ลูกค้าตอบว่าสะดวกเวลานี้',
  createdByUserId: 501,
  createdAt: '2026-06-10T11:00:00.000Z'
};

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
    'GET /auth/me': { status: 200, body: overrides.session || createSessionFixture() },
    'GET /admin/booking-requests': overrides.list || { status: 200, body: { items: bookingItems, total: 1, limit: 50, offset: 0 } },
    'GET /admin/booking-requests/11': overrides.detail || { status: 200, body: bookingDetail() },
    'GET /admin/booking-requests/11/slot-offers': overrides.slotOffers || { status: 200, body: { items: [existingOffer] } },
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
  dom.window.eval(bundleSource);

  await waitFor(() => dom.window.document.querySelector('[data-testid="admin-shell"]'));
  return { document: dom.window.document, window: dom.window, requests };
}

async function openDetail(app) {
  click(app.window, await waitFor(() => app.document.querySelector('[data-testid="booking-request-row-11"]')));
  await waitFor(() => app.document.querySelector('[data-testid="booking-slot-offers-section"]'));
}

test('Booking Slot Offer UI - detail renders section and existing offer list', async () => {
  const app = await loadAdminApp({ routes: bookingRoutes() });
  await openDetail(app);

  assert.ok(app.document.querySelector('[data-testid="booking-slot-offers-section"]'));
  assert.ok(app.document.querySelector('[data-testid="booking-slot-offer-list"]'));
  assert.ok(app.document.querySelector('[data-testid="booking-slot-offer-row-71"]'));
  assert.match(app.document.body.textContent, /ทีมงานขอเสนอเวลา 14:00/);
  assert.match(app.document.body.textContent, /ลูกค้าตอบว่าสะดวกเวลานี้/);
});

test('Booking Slot Offer UI - create form validates missing date and specific start time', async () => {
  const app = await loadAdminApp({ routes: bookingRoutes() });
  await openDetail(app);

  submit(app.window, app.document.querySelector('[data-testid="booking-slot-offer-form"]'));
  await waitFor(() => /กรุณาระบุวันที่/.test(app.document.querySelector('[data-testid="booking-slot-offer-error"]')?.textContent || ''));

  setValue(app.window, app.document.querySelector('[data-testid="booking-slot-offer-date"]'), '2099-06-20');
  submit(app.window, app.document.querySelector('[data-testid="booking-slot-offer-form"]'));
  await waitFor(() => /เวลาเริ่มต้น/.test(app.document.querySelector('[data-testid="booking-slot-offer-error"]')?.textContent || ''));
});

test('Booking Slot Offer UI - create form validates invalid time, duration, and long notes', async () => {
  const app = await loadAdminApp({ routes: bookingRoutes() });
  await openDetail(app);

  setValue(app.window, app.document.querySelector('[data-testid="booking-slot-offer-date"]'), '2099-06-20');
  const startTime = app.document.querySelector('[data-testid="booking-slot-offer-start-time"]');
  startTime.setAttribute('type', 'text');
  setValue(app.window, startTime, '25:00');
  submit(app.window, app.document.querySelector('[data-testid="booking-slot-offer-form"]'));
  await waitFor(() => /HH:mm/.test(app.document.querySelector('[data-testid="booking-slot-offer-error"]')?.textContent || ''));

  setValue(app.window, startTime, '14:00');
  setValue(app.window, app.document.querySelector('[data-testid="booking-slot-offer-duration"]'), '4');
  submit(app.window, app.document.querySelector('[data-testid="booking-slot-offer-form"]'));
  await waitFor(() => /5 ถึง 480/.test(app.document.querySelector('[data-testid="booking-slot-offer-error"]')?.textContent || ''));

  setValue(app.window, app.document.querySelector('[data-testid="booking-slot-offer-duration"]'), '60');
  setValue(app.window, app.document.querySelector('[data-testid="booking-slot-offer-note"]'), 'x'.repeat(501));
  submit(app.window, app.document.querySelector('[data-testid="booking-slot-offer-form"]'));
  await waitFor(() => /500/.test(app.document.querySelector('[data-testid="booking-slot-offer-error"]')?.textContent || ''));

  setValue(app.window, app.document.querySelector('[data-testid="booking-slot-offer-note"]'), '');
  setValue(app.window, app.document.querySelector('[data-testid="booking-slot-offer-internal-note"]'), 'x'.repeat(1001));
  submit(app.window, app.document.querySelector('[data-testid="booking-slot-offer-form"]'));
  await waitFor(() => /1000/.test(app.document.querySelector('[data-testid="booking-slot-offer-error"]')?.textContent || ''));
});

test('Booking Slot Offer UI - save sends payload without tenant override and shows success', async () => {
  let capturedPayload = null;
  const app = await loadAdminApp({
    routes: bookingRoutes({
      list: [
        { status: 200, body: { items: bookingItems, total: 1, limit: 50, offset: 0 } },
        { status: 200, body: { items: [{ ...bookingItems[0], slotStatus: 'offered' }], total: 1, limit: 50, offset: 0 } }
      ],
      detail: [
        { status: 200, body: bookingDetail() },
        { status: 200, body: bookingDetail({ slotStatus: 'offered' }) }
      ],
      slotOffers: [
        { status: 200, body: { items: [existingOffer] } },
        { status: 200, body: { items: [{ ...existingOffer, id: 72, offerNote: 'ขอเสนอเวลา 14:00 ค่ะ' }] } }
      ],
      extra: {
        'POST /admin/booking-requests/11/slot-offers': (request) => {
          capturedPayload = JSON.parse(request.body);
          return {
            status: 201,
            body: {
              success: true,
              offer: { ...existingOffer, id: 72 },
              bookingRequest: bookingDetail({ slotStatus: 'offered' })
            }
          };
        }
      }
    })
  });
  await openDetail(app);

  setValue(app.window, app.document.querySelector('[data-testid="booking-slot-offer-date"]'), '2099-06-20');
  setValue(app.window, app.document.querySelector('[data-testid="booking-slot-offer-start-time"]'), '14:00');
  setValue(app.window, app.document.querySelector('[data-testid="booking-slot-offer-duration"]'), '60');
  setValue(app.window, app.document.querySelector('[data-testid="booking-slot-offer-note"]'), 'ขอเสนอเวลา 14:00 ค่ะ');
  setValue(app.window, app.document.querySelector('[data-testid="booking-slot-offer-internal-note"]'), 'ลูกค้าขอช่วงบ่าย');
  submit(app.window, app.document.querySelector('[data-testid="booking-slot-offer-form"]'));

  await waitFor(() => app.document.querySelector('[data-testid="booking-slot-offer-success"]'));
  assert.equal(capturedPayload.offeredDate, '2099-06-20');
  assert.equal(capturedPayload.offeredTimeWindow, 'specific_time');
  assert.equal(capturedPayload.offeredStartTime, '14:00');
  assert.equal(capturedPayload.durationMinutes, 60);
  assert.equal(capturedPayload.offerStatus, 'draft');
  assert.equal(capturedPayload.clinicId, undefined);
  assert.equal(capturedPayload.clinic_id, undefined);
});

test('Booking Slot Offer UI - API error and permission error render in slot offer section', async () => {
  const app = await loadAdminApp({
    routes: bookingRoutes({
      extra: {
        'POST /admin/booking-requests/11/slot-offers': {
          status: 403,
          body: { error: { code: 'SLOT_OFFER_PERMISSION_DENIED', message: 'คุณไม่มีสิทธิ์จัดการข้อเสนอเวลานัดนี้' } }
        }
      }
    })
  });
  await openDetail(app);

  setValue(app.window, app.document.querySelector('[data-testid="booking-slot-offer-date"]'), '2099-06-20');
  setValue(app.window, app.document.querySelector('[data-testid="booking-slot-offer-start-time"]'), '14:00');
  submit(app.window, app.document.querySelector('[data-testid="booking-slot-offer-form"]'));

  await waitFor(() => app.document.querySelector('[data-testid="booking-slot-offer-error"]'));
  assert.match(app.document.body.textContent, /SLOT_OFFER_PERMISSION_DENIED/);
  assert.ok(app.document.querySelector('[data-testid="booking-request-permission-error"]'));
});
