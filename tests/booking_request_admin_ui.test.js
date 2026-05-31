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

const bookingItems = [
  {
    id: 11,
    leadId: 101,
    requestType: 'booking_request',
    interestType: 'service',
    interestId: 201,
    preferredDate: '2099-06-15',
    preferredTimeWindow: 'afternoon',
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

function bookingRoutes(session = createSessionFixture(), overrides = {}) {
  return {
    'GET /auth/me': { status: 200, body: session },
    'GET /admin/booking-requests': overrides.list || { status: 200, body: { items: bookingItems, total: 1, limit: 50, offset: 0 } },
    'GET /admin/booking-requests/11': overrides.detail || { status: 200, body: bookingDetail() },
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

async function loadAdminApp({ route = '#/booking-requests', token = 'test-token', routes }) {
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

test('Admin Booking Requests UI - menu renders booking request route', async () => {
  const app = await loadAdminApp({
    route: '',
    routes: bookingRoutes(createSessionFixture())
  });

  const nav = app.document.querySelector('[data-testid="nav-booking-requests"]');
  assert.ok(nav);
  assert.match(nav.textContent, /คำขอนัดหมาย/);

  click(nav, app.window);
  await waitFor(() => app.document.querySelector('[data-testid="booking-requests-page"]'));
  assert.equal(app.window.location.hash, '#/booking-requests');
});

test('Admin Booking Requests UI - page loads booking requests list', async () => {
  const app = await loadAdminApp({ routes: bookingRoutes(createSessionFixture()) });

  await waitFor(() => app.document.querySelector('[data-testid="booking-requests-list"]'));
  assert.match(app.document.body.textContent, /Jane Doe/);
  assert.ok(app.document.querySelector('[data-testid="booking-request-row-11"]'));
});

test('Admin Booking Requests UI - filters send query params', async () => {
  const app = await loadAdminApp({
    routes: bookingRoutes(createSessionFixture(), {
      list: [
        { status: 200, body: { items: bookingItems, total: 1, limit: 50, offset: 0 } },
        { status: 200, body: { items: [], total: 0, limit: 50, offset: 0 } }
      ]
    })
  });

  await waitFor(() => app.document.querySelector('[data-testid="booking-requests-filters"]'));
  setInputValue(app.document.querySelector('[data-testid="booking-requests-status-filter"]'), 'contacted', app.window);
  setInputValue(app.document.querySelector('[data-testid="booking-requests-request-type-filter"]'), 'booking_request', app.window);
  setInputValue(app.document.querySelector('[data-testid="booking-requests-interest-type-filter"]'), 'service', app.window);
  setInputValue(app.document.querySelector('[data-testid="booking-requests-date-from"]'), '2026-06-01', app.window);
  setInputValue(app.document.querySelector('[data-testid="booking-requests-date-to"]'), '2026-06-30', app.window);
  submitForm(app.document.querySelector('[data-testid="booking-requests-filters"]'), app.window);

  await waitFor(() => app.requests.filter((request) => request.url.pathname === '/admin/booking-requests').length >= 2);
  const filteredRequest = app.requests.filter((request) => request.url.pathname === '/admin/booking-requests').at(-1);
  assert.equal(filteredRequest.url.searchParams.get('status'), 'contacted');
  assert.equal(filteredRequest.url.searchParams.get('requestType'), 'booking_request');
  assert.equal(filteredRequest.url.searchParams.get('interestType'), 'service');
  assert.equal(filteredRequest.url.searchParams.get('dateFrom'), '2026-06-01');
  assert.equal(filteredRequest.url.searchParams.get('dateTo'), '2026-06-30');
});

test('Admin Booking Requests UI - row click opens detail panel', async () => {
  const app = await loadAdminApp({ routes: bookingRoutes(createSessionFixture()) });
  const row = await waitFor(() => app.document.querySelector('[data-testid="booking-request-row-11"]'));

  click(row, app.window);
  await waitFor(() => app.document.querySelector('[data-testid="booking-request-detail"]').textContent.includes('Lead #101'));
  assert.match(app.document.querySelector('[data-testid="booking-request-detail"]').textContent, /อยากปรึกษาก่อนทำ/);
});

test('Admin Booking Requests UI - status update sends payload without clinic override', async () => {
  let capturedPayload = null;
  const app = await loadAdminApp({
    routes: bookingRoutes(createSessionFixture(), {
      list: [
        { status: 200, body: { items: bookingItems, total: 1, limit: 50, offset: 0 } },
        { status: 200, body: { items: [{ ...bookingItems[0], status: 'contacted' }], total: 1, limit: 50, offset: 0 } }
      ],
      detail: [
        { status: 200, body: bookingDetail() },
        { status: 200, body: bookingDetail({ status: 'contacted' }) }
      ],
      extra: {
        'PATCH /admin/booking-requests/11/status': (request) => {
          capturedPayload = JSON.parse(request.body);
          return { status: 200, body: { success: true, item: bookingDetail({ status: 'contacted' }) } };
        }
      }
    })
  });

  click(await waitFor(() => app.document.querySelector('[data-testid="booking-request-row-11"]')), app.window);
  await waitFor(() => app.document.querySelector('[data-testid="booking-request-status-select"]'));
  setInputValue(app.document.querySelector('[data-testid="booking-request-status-select"]'), 'contacted', app.window);
  click(app.document.querySelector('[data-testid="booking-request-status-save"]'), app.window);

  await waitFor(() => app.document.querySelector('[data-testid="booking-request-success"]'));
  assert.deepEqual(capturedPayload, { status: 'contacted' });
  assert.equal(capturedPayload.clinicId, undefined);
  assert.equal(capturedPayload.clinic_id, undefined);
});

test('Admin Booking Requests UI - 403 status update shows permission error', async () => {
  const app = await loadAdminApp({
    routes: bookingRoutes(createSessionFixture(), {
      extra: {
        'PATCH /admin/booking-requests/11/status': {
          status: 403,
          body: { error: { code: 'BOOKING_REQUEST_PERMISSION_DENIED', message: 'คุณไม่มีสิทธิ์จัดการคำขอนัดหมายนี้' } }
        }
      }
    })
  });

  click(await waitFor(() => app.document.querySelector('[data-testid="booking-request-row-11"]')), app.window);
  await waitFor(() => app.document.querySelector('[data-testid="booking-request-status-save"]'));
  setInputValue(app.document.querySelector('[data-testid="booking-request-status-select"]'), 'contacted', app.window);
  click(app.document.querySelector('[data-testid="booking-request-status-save"]'), app.window);

  await waitFor(() => app.document.querySelector('[data-testid="booking-request-permission-error"]'));
  assert.match(app.document.body.textContent, /กรุณาใช้บัญชี Owner, Manager, Marketing หรือ Sales/);
});

test('Admin Booking Requests UI - staff read-only message renders', async () => {
  const staffSession = createSessionFixture({ role: 'staff' });
  const app = await loadAdminApp({
    routes: bookingRoutes(staffSession)
  });

  await waitFor(() => app.document.querySelector('[data-testid="booking-request-readonly-notice"]'));
  assert.match(app.document.body.textContent, /บัญชีนี้ดูคำขอนัดหมายได้ แต่ไม่สามารถเปลี่ยนสถานะได้/);
});

test('Admin Booking Requests UI - note save sends note payload', async () => {
  let capturedPayload = null;
  const app = await loadAdminApp({
    routes: bookingRoutes(createSessionFixture(), {
      detail: [
        { status: 200, body: bookingDetail() },
        { status: 200, body: bookingDetail({ notes: [{ id: 901, content: 'โทรแล้ว', createdAt: '2026-06-10T10:00:00.000Z' }] }) }
      ],
      extra: {
        'POST /admin/booking-requests/11/notes': (request) => {
          capturedPayload = JSON.parse(request.body);
          return { status: 201, body: { success: true, noteId: 901, item: bookingDetail() } };
        }
      }
    })
  });

  click(await waitFor(() => app.document.querySelector('[data-testid="booking-request-row-11"]')), app.window);
  await waitFor(() => app.document.querySelector('[data-testid="booking-request-note"]'));
  setInputValue(app.document.querySelector('[data-testid="booking-request-note"]'), 'โทรแล้ว ลูกค้าขอให้ติดต่อพรุ่งนี้', app.window);
  submitForm(app.document.querySelector('.booking-note-form'), app.window);

  await waitFor(() => app.document.querySelector('[data-testid="booking-request-success"]'));
  assert.deepEqual(capturedPayload, { note: 'โทรแล้ว ลูกค้าขอให้ติดต่อพรุ่งนี้' });
  assert.equal(capturedPayload.clinicId, undefined);
  assert.equal(capturedPayload.clinic_id, undefined);
});
