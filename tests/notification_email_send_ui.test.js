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

function readiness(overrides = {}) {
  return {
    notificationProviders: {
      realDeliveryEnabled: true,
      dryRunEnabled: true,
      globalKillSwitch: false,
      realDeliveryBlocked: false,
      channels: {
        email: { enabled: true, provider: 'sandbox', ready: true, configured: true, blockedReason: null },
        line: { enabled: false, provider: 'none', ready: false, configured: false, blockedReason: 'LINE_PROVIDER_DISABLED' },
        sms: { enabled: false, provider: 'none', ready: false, configured: false, blockedReason: 'SMS_PROVIDER_DISABLED' }
      },
      ...overrides
    }
  };
}

function notificationRoutes(overrides = {}) {
  const draft = overrides.draft || notificationDraft;
  return {
    'GET /auth/me': { status: 200, body: createSessionFixture() },
    'GET /admin/notification-drafts': {
      status: 200,
      body: { items: [draft], total: 1, limit: 50, offset: 0 }
    },
    [`GET /admin/notification-drafts/${draft.id}`]: { status: 200, body: draft },
    [`GET /admin/notification-drafts/${draft.id}/approval-status`]: overrides.approval || {
      status: 200,
      body: { approvalStatus: 'approved', approval: { id: 701, status: 'approved' } }
    },
    'GET /admin/notification-provider-readiness': overrides.readiness || { status: 200, body: readiness() },
    [`GET /admin/notification-drafts/${draft.id}/delivery-attempts`]: overrides.attempts || {
      status: 200,
      body: { items: [], total: 0 }
    },
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

async function openDraft(overrides = {}) {
  const app = await loadAdminApp({ routes: notificationRoutes(overrides) });
  const draft = overrides.draft || notificationDraft;
  click(app.window, await waitFor(() => app.document.querySelector(`[data-testid="notification-draft-row-${draft.id}"]`)));
  await waitFor(() => app.document.querySelector('[data-testid="email-send-eligibility-panel"]'));
  return app;
}

function sendEmailButton(app) {
  return app.document.querySelector('[data-testid="send-email-button"]');
}

test('Notification Email Send UI - eligibility panel renders safety state', async () => {
  const app = await openDraft();

  assert.match(app.document.body.textContent, /Email Send Eligibility/);
  assert.match(app.document.querySelector('[data-testid="email-send-safety-copy"]').textContent, /Email only/);
  assert.match(app.document.querySelector('[data-testid="email-send-safety-copy"]').textContent, /Manual send only/);
  assert.match(app.document.querySelector('[data-testid="email-send-safety-copy"]').textContent, /Approval required/);
  assert.match(app.document.querySelector('[data-testid="email-send-safety-copy"]').textContent, /Kill switch protected/);
  assert.match(app.document.querySelector('[data-testid="email-send-safety-copy"]').textContent, /No LINE\/SMS/);
});

test('Notification Email Send UI - button is disabled for blocked states', async (t) => {
  const cases = [
    {
      name: 'draft channel is not email',
      overrides: { draft: { ...notificationDraft, id: 92, channel: 'line', recipientRef: 'line:user' } },
      reason: /Blocked: draft channel is not email/
    },
    {
      name: 'approval missing',
      overrides: { approval: { status: 200, body: { approvalStatus: null, approval: null } } },
      reason: /Blocked: approval is required/
    },
    {
      name: 'approval pending',
      overrides: { approval: { status: 200, body: { approvalStatus: 'pending', approval: { status: 'pending' } } } },
      reason: /Blocked: approval is not approved/
    },
    {
      name: 'approval rejected',
      overrides: { approval: { status: 200, body: { approvalStatus: 'rejected', approval: { status: 'rejected' } } } },
      reason: /Blocked: approval is not approved/
    },
    {
      name: 'approval cancelled',
      overrides: { approval: { status: 200, body: { approvalStatus: 'cancelled', approval: { status: 'cancelled' } } } },
      reason: /Blocked: approval is not approved/
    },
    {
      name: 'real delivery disabled',
      overrides: { readiness: { status: 200, body: readiness({ realDeliveryEnabled: false }) } },
      reason: /Blocked: real delivery is disabled/
    },
    {
      name: 'kill switch active',
      overrides: { readiness: { status: 200, body: readiness({ globalKillSwitch: true }) } },
      reason: /Blocked: global kill switch is active/
    },
    {
      name: 'email provider not ready',
      overrides: {
        readiness: {
          status: 200,
          body: readiness({
            channels: {
              email: { enabled: true, provider: 'none', ready: false, configured: false, blockedReason: 'EMAIL_PROVIDER_NOT_READY' }
            }
          })
        }
      },
      reason: /Blocked: email provider is not ready/
    },
    {
      name: 'successful send already exists',
      overrides: {
        attempts: {
          status: 200,
          body: { items: [{ id: 991, channel: 'email', mode: 'real', status: 'sent', createdAt: '2026-06-01T10:00:00.000Z' }], total: 1 }
        }
      },
      reason: /Blocked: this notification was already sent/
    }
  ];

  for (const testCase of cases) {
    await t.test(testCase.name, async () => {
      const app = await openDraft(testCase.overrides);

      assert.equal(sendEmailButton(app).disabled, true);
      assert.match(app.document.querySelector('[data-testid="email-send-blocking-reasons"]').textContent, testCase.reason);
    });
  }
});

test('Notification Email Send UI - button is enabled only when all gates pass', async () => {
  const app = await openDraft();

  assert.equal(sendEmailButton(app).disabled, false);
  assert.match(app.document.querySelector('[data-testid="email-send-status"]').textContent, /Eligible/);
});

test('Notification Email Send UI - approval fetch failure stays conservative without false approval reason', async () => {
  const app = await openDraft({
    approval: {
      status: 500,
      body: { error: { code: 'APPROVAL_STATUS_FAILED', message: 'approval status unavailable' } }
    }
  });
  const reasonsText = app.document.querySelector('[data-testid="email-send-blocking-reasons"]').textContent;

  assert.equal(sendEmailButton(app).disabled, true);
  assert.match(reasonsText, /Blocked: Eligibility cannot be confirmed yet/);
  assert.doesNotMatch(reasonsText, /Blocked: approval is required/);
});

test('Notification Email Send UI - confirmation modal supports aria description, safe focus, and Escape cancel', async () => {
  const app = await openDraft();

  click(app.window, sendEmailButton(app));
  const modal = await waitFor(() => app.document.querySelector('[data-testid="send-email-confirmation-modal"]'));
  const dialog = modal.querySelector('[role="dialog"]');
  const cancelButton = app.document.querySelector('[data-testid="cancel-send-email-button"]');

  assert.equal(dialog.getAttribute('aria-describedby'), 'send-email-confirm-description send-email-confirm-scope');
  await waitFor(() => app.document.activeElement === cancelButton);

  app.window.dispatchEvent(new app.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await waitFor(() => !app.document.querySelector('[data-testid="send-email-confirmation-modal"]'));
  assert.equal(app.requests.filter((request) => request.method === 'POST').length, 0);
});

test('Notification Email Send UI - confirmation modal appears before send and calls only send-email endpoint', async () => {
  const app = await loadAdminApp({
    routes: notificationRoutes({
      attempts: [
        { status: 200, body: { items: [], total: 0 } },
        { status: 200, body: { items: [{ id: 1009, channel: 'email', mode: 'real', status: 'sent' }], total: 1 } }
      ],
      extra: {
        'POST /admin/notification-drafts/91/send-email': { status: 201, body: { id: 1009, draftId: 91, channel: 'email', mode: 'real', status: 'sent' } }
      }
    })
  });

  click(app.window, await waitFor(() => app.document.querySelector('[data-testid="notification-draft-row-91"]')));
  await waitFor(() => {
    const button = sendEmailButton(app);
    return button && !button.disabled ? button : null;
  });
  click(app.window, sendEmailButton(app));

  await waitFor(() => app.document.querySelector('[data-testid="send-email-confirmation-modal"]'));
  assert.equal(app.requests.filter((request) => request.method === 'POST').length, 0);

  click(app.window, app.document.querySelector('[data-testid="confirm-send-email-button"]'));
  await waitFor(() => /Email send recorded/.test(app.document.querySelector('[data-testid="email-send-result"]')?.textContent || ''));

  const postRequests = app.requests.filter((request) => request.method === 'POST');
  assert.equal(postRequests.length, 1);
  assert.equal(postRequests[0].url.pathname, '/admin/notification-drafts/91/send-email');
});

test('Notification Email Send UI - stale send result does not leak after switching drafts', async () => {
  const secondDraft = {
    ...notificationDraft,
    id: 92,
    subject: 'Second selected draft',
    message: 'Second selected draft content.',
    sourceId: '72',
    idempotencyKey: 'tenant:1001:event:slot_offer.accepted:source:slot_offer:72:recipient:admin:501:channel:email'
  };
  const approved = { status: 200, body: { approvalStatus: 'approved', approval: { id: 701, status: 'approved' } } };
  const emptyAttempts = { status: 200, body: { items: [], total: 0 } };
  const app = await loadAdminApp({
    routes: {
      'GET /auth/me': { status: 200, body: createSessionFixture() },
      'GET /admin/notification-drafts': {
        status: 200,
        body: { items: [notificationDraft, secondDraft], total: 2, limit: 50, offset: 0 }
      },
      'GET /admin/notification-drafts/91': { status: 200, body: notificationDraft },
      'GET /admin/notification-drafts/92': { status: 200, body: secondDraft },
      'GET /admin/notification-provider-readiness': [
        { status: 200, body: readiness() },
        { status: 200, body: readiness() }
      ],
      'GET /admin/notification-drafts/91/approval-status': approved,
      'GET /admin/notification-drafts/92/approval-status': approved,
      'GET /admin/notification-drafts/91/delivery-attempts': emptyAttempts,
      'GET /admin/notification-drafts/92/delivery-attempts': emptyAttempts,
      'POST /admin/notification-drafts/91/send-email': async () => new Promise((resolve) => {
        setTimeout(() => resolve({ status: 201, body: { id: 1009, draftId: 91, channel: 'email', mode: 'real', status: 'sent' } }), 80);
      })
    }
  });

  click(app.window, await waitFor(() => app.document.querySelector('[data-testid="notification-draft-row-91"]')));
  await waitFor(() => {
    const button = sendEmailButton(app);
    return button && !button.disabled ? button : null;
  });
  click(app.window, sendEmailButton(app));
  click(app.window, await waitFor(() => app.document.querySelector('[data-testid="confirm-send-email-button"]')));
  click(app.window, app.document.querySelector('[data-testid="notification-draft-row-92"]'));

  await waitFor(() => /Second selected draft content/.test(app.document.querySelector('[data-testid="notification-draft-message"]')?.textContent || ''));
  await new Promise((resolve) => setTimeout(resolve, 120));

  assert.equal(app.document.querySelector('[data-testid="email-send-result"]'), null);
  assert.doesNotMatch(app.document.body.textContent, /Email send recorded/);
  const postRequests = app.requests.filter((request) => request.method === 'POST');
  assert.equal(postRequests.length, 1);
  assert.equal(postRequests[0].url.pathname, '/admin/notification-drafts/91/send-email');
});

test('Notification Email Send UI - blocked result renders safely', async () => {
  const app = await openDraft({
    extra: {
      'POST /admin/notification-drafts/91/send-email': {
        status: 403,
        body: { error: { code: 'NOTIFICATION_REAL_DELIVERY_DISABLED', message: 'Real delivery is disabled' } }
      }
    }
  });

  click(app.window, sendEmailButton(app));
  click(app.window, await waitFor(() => app.document.querySelector('[data-testid="confirm-send-email-button"]')));
  await waitFor(() => /Email send blocked or failed/.test(app.document.querySelector('[data-testid="email-send-result"]')?.textContent || ''));

  assert.match(app.document.querySelector('[data-testid="email-send-result"]').textContent, /NOTIFICATION_REAL_DELIVERY_DISABLED/);
});

test('Notification Email Send UI - forbidden controls and secrets are not rendered', async () => {
  const app = await openDraft({
    readiness: {
      status: 200,
      body: readiness({ secretToken: 'super-secret-token' })
    }
  });
  const bodyText = app.document.body.textContent;

  assert.doesNotMatch(bodyText, new RegExp(`Send ${'LINE'}`));
  assert.doesNotMatch(bodyText, new RegExp(`Send ${'SMS'}`));
  assert.doesNotMatch(bodyText, new RegExp(`Bulk ${'send'}`));
  assert.doesNotMatch(bodyText, new RegExp(`Retry ${'send'}`));
  assert.doesNotMatch(bodyText, /super-secret-token/);
});
