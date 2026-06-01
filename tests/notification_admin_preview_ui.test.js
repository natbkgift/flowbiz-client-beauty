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

function click(window, element) {
  element.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
}

function createSessionFixture() {
  const clinic = { id: 1001, name: 'FlowBiz Clinic A', slug: 'flowbiz-clinic-a' };
  const workspace = { id: 3001, clinicId: 1001, name: 'Primary Workspace', slug: 'primary-workspace' };
  const membership = {
    id: 4001,
    clinicId: 1001,
    workspaceId: 3001,
    role: 'owner',
    status: 'active',
    permissions: [],
    clinic,
    workspace,
    organization: { id: 2001, name: 'FlowBiz Org', slug: 'flowbiz-org' }
  };

  return {
    token: 'test-token',
    user: { id: 501, email: 'owner@example.com', name: 'Owner User', status: 'active' },
    currentClinic: clinic,
    currentOrganization: membership.organization,
    currentWorkspace: workspace,
    currentMembership: membership,
    memberships: [membership],
    roles: ['owner'],
    permissions: []
  };
}

const notificationDraft = {
  id: 91,
  tenantId: 1001,
  eventType: 'slot_offer.accepted',
  recipientType: 'admin',
  recipientId: 501,
  recipientRef: 'admin:501',
  channel: 'email',
  title: 'Slot offer accepted',
  subject: 'Customer accepted a slot offer',
  message: 'The customer accepted the offered booking time. Please review the booking request.',
  status: 'draft',
  sourceType: 'slot_offer',
  sourceId: '71',
  idempotencyKey: 'tenant:1001:event:slot_offer.accepted:source:slot_offer:71:recipient:admin:501:channel:email',
  metadata: { bookingRequestId: 11, offerId: 71, safe: true },
  createdAt: '2026-06-01T09:00:00.000Z',
  updatedAt: '2026-06-01T09:00:00.000Z'
};

function notificationRoutes(overrides = {}) {
  return {
    'GET /auth/me': { status: 200, body: createSessionFixture() },
    'GET /admin/notification-drafts': overrides.list || {
      status: 200,
      body: { items: [notificationDraft], total: 1, limit: 50, offset: 0 }
    },
    'GET /admin/notification-drafts/91': overrides.detail || { status: 200, body: notificationDraft },
    ...overrides.extra
  };
}

async function loadAdminApp({ routes }) {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', {
    url: 'http://localhost:3000/#/notification-drafts',
    runScripts: 'dangerously',
    pretendToBeVisual: true
  });
  const { fetchMock, requests } = createFetchMock(routes);

  dom.window.__FLOWBIZ_WEB_CONFIG__ = { apiBaseUrl: 'http://localhost:3001' };
  dom.window.fetch = fetchMock;
  dom.window.requestAnimationFrame = (callback) => dom.window.setTimeout(() => callback(Date.now()), 16);
  dom.window.cancelAnimationFrame = (id) => dom.window.clearTimeout(id);
  dom.window.sessionStorage.setItem('flowbiz.admin.token', 'test-token');
  dom.window.eval(bundleSource);

  await waitFor(() => dom.window.document.querySelector('[data-testid="admin-shell"]'));
  return { document: dom.window.document, window: dom.window, requests };
}

test('Notification Drafts UI - screen renders with preview safety copy', async () => {
  const app = await loadAdminApp({ routes: notificationRoutes() });
  await waitFor(() => app.document.querySelector('[data-testid="notification-drafts-page"]'));

  assert.match(app.document.body.textContent, /ร่างการแจ้งเตือน/);
  assert.match(app.document.body.textContent, /Preview only/);
  assert.match(app.document.body.textContent, /no notification has been sent/);
});

test('Notification Drafts UI - empty state renders', async () => {
  const app = await loadAdminApp({
    routes: notificationRoutes({
      list: { status: 200, body: { items: [], total: 0, limit: 50, offset: 0 } }
    })
  });
  await waitFor(() => app.document.querySelector('[data-testid="notification-drafts-empty"]'));

  assert.match(app.document.body.textContent, /No notification drafts yet/);
});

test('Notification Drafts UI - draft rows render event channel status and message preview', async () => {
  const app = await loadAdminApp({ routes: notificationRoutes() });
  await waitFor(() => app.document.querySelector('[data-testid="notification-draft-row-91"]'));

  assert.match(app.document.body.textContent, /slot_offer\.accepted/);
  assert.match(app.document.body.textContent, /email/);
  assert.match(app.document.body.textContent, /Draft/);
  assert.match(app.document.body.textContent, /Not sent/);
  assert.match(app.document.body.textContent, /The customer accepted/);
});

test('Notification Drafts UI - detail view shows subject message metadata and no delivery controls', async () => {
  const app = await loadAdminApp({ routes: notificationRoutes() });
  click(app.window, await waitFor(() => app.document.querySelector('[data-testid="notification-draft-row-91"]')));
  await waitFor(() => app.document.querySelector('[data-testid="notification-draft-message"]'));

  assert.match(app.document.querySelector('[data-testid="notification-draft-subject"]').textContent, /Customer accepted/);
  assert.match(app.document.querySelector('[data-testid="notification-draft-message"]').textContent, /Please review/);
  assert.match(app.document.querySelector('[data-testid="notification-draft-metadata"]').textContent, /bookingRequestId/);

  const buttonText = [...app.document.querySelectorAll('button')]
    .map((button) => button.textContent.trim().toLowerCase())
    .join(' ');
  assert.doesNotMatch(buttonText, /\bsend\b/);
  assert.doesNotMatch(buttonText, /\bapprove\b/);
  assert.doesNotMatch(buttonText, /\bretry\b/);
});

test('Notification Drafts UI - ignores stale detail responses after rapid selection changes', async () => {
  const firstDraft = {
    ...notificationDraft,
    id: 91,
    subject: 'First delayed draft',
    message: 'First delayed draft content.'
  };
  const secondDraft = {
    ...notificationDraft,
    id: 92,
    subject: 'Latest selected draft',
    message: 'Latest selected draft content.',
    idempotencyKey: 'tenant:1001:event:slot_offer.accepted:source:slot_offer:72:recipient:admin:501:channel:email',
    sourceId: '72'
  };

  const app = await loadAdminApp({
    routes: notificationRoutes({
      list: { status: 200, body: { items: [firstDraft, secondDraft], total: 2, limit: 50, offset: 0 } },
      detail: async () => new Promise((resolve) => {
        setTimeout(() => resolve({ status: 200, body: firstDraft }), 80);
      }),
      extra: {
        'GET /admin/notification-drafts/92': { status: 200, body: secondDraft }
      }
    })
  });

  click(app.window, await waitFor(() => app.document.querySelector('[data-testid="notification-draft-row-91"]')));
  click(app.window, await waitFor(() => app.document.querySelector('[data-testid="notification-draft-row-92"]')));

  await waitFor(() => /Latest selected draft content/.test(
    app.document.querySelector('[data-testid="notification-draft-message"]')?.textContent || ''
  ));
  await new Promise((resolve) => setTimeout(resolve, 120));

  const messageText = app.document.querySelector('[data-testid="notification-draft-message"]').textContent;
  assert.match(messageText, /Latest selected draft content/);
  assert.doesNotMatch(messageText, /First delayed draft content/);
});
