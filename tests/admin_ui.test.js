const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { buildWeb } = require('../scripts/build-web');

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
      throw new Error(`Unhandled fetch request: ${fullKey}`);
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
  const workspaceTwo = {
    id: 3002,
    clinicId: 1001,
    organizationId: 2001,
    name: 'Operations Workspace',
    slug: 'operations-workspace',
    status: 'active',
    timezone: 'Asia/Singapore',
    settingsJson: { inboxMode: 'ops' }
  };
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
    },
    {
      id: 4002,
      clinicId: 1001,
      organizationId: 2001,
      workspaceId: 3002,
      role: 'owner',
      status: 'active',
      permissions: overrides.permissions || ['user.read'],
      clinic,
      organization,
      workspace: workspaceTwo
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
  dom.window.localStorage.setItem('flowbiz.admin.token', token);
  dom.window.eval(bundleSource);

  await waitFor(() => dom.window.document.querySelector('[data-testid="admin-shell"]'));

  return {
    dom,
    document: dom.window.document,
    window: dom.window,
    requests
  };
}

test('auth bootstrap loads admin context from /auth/me', async () => {
  const session = createSessionFixture();
  const app = await loadAdminApp({
    routes: {
      'GET /auth/me': { status: 200, body: session }
    }
  });

  assert.equal(app.requests[0].url.pathname, '/auth/me');
  await waitFor(() => app.document.body.textContent.includes('FlowBiz Clinic'));
  assert.match(app.document.body.textContent, /Primary Workspace/);
  assert.equal(app.document.querySelector('[data-testid="workspace-selector"]').value, '3001');
});

test('workspace selector reloads tenant context with workspace header', async () => {
  const session = createSessionFixture();
  const app = await loadAdminApp({
    routes: {
      'GET /auth/me': { status: 200, body: session },
      'GET /tenant-context': {
        status: 200,
        body: {
          user: session.user,
          currentClinic: session.currentClinic,
          currentOrganization: session.currentOrganization,
          currentWorkspace: session.memberships[1].workspace,
          currentMembership: {
            ...session.currentMembership,
            workspaceId: session.memberships[1].workspace.id
          },
          roles: session.roles,
          permissions: session.permissions
        }
      }
    }
  });

  const selector = app.document.querySelector('[data-testid="workspace-selector"]');
  setInputValue(selector, '3002', app.window);

  await waitFor(() => app.document.body.textContent.includes('Operations Workspace'));
  const tenantContextRequest = app.requests.find((request) => request.url.pathname === '/tenant-context');

  assert.ok(tenantContextRequest);
  assert.equal(tenantContextRequest.headers['x-workspace-slug'], 'operations-workspace');
});

test('users page invites a member and refreshes the member list', async () => {
  const session = createSessionFixture({
    permissions: ['user.read', 'user.manage', 'invite.manage', 'role.manage']
  });
  const initialMembers = {
    items: [
      {
        id: 9001,
        user: { email: 'owner@example.com' },
        role: 'owner',
        status: 'active',
        invitedAt: '2026-03-17T08:00:00.000Z'
      }
    ]
  };
  const refreshedMembers = {
    items: [
      initialMembers.items[0],
      {
        id: 9002,
        user: { email: 'new-member@example.com' },
        role: 'viewer',
        status: 'invited',
        invitedAt: '2026-03-17T08:10:00.000Z'
      }
    ]
  };
  const app = await loadAdminApp({
    route: '#/users',
    routes: {
      'GET /auth/me': { status: 200, body: session },
      'GET /workspace/3001/members': [
        { status: 200, body: initialMembers },
        { status: 200, body: refreshedMembers }
      ],
      'POST /workspace/3001/invite': {
        status: 201,
        body: {
          membership: refreshedMembers.items[1],
          invite: {
            email: 'new-member@example.com',
            role: 'viewer',
            expiresAt: '2026-03-18T08:10:00.000Z',
            token: 'invite-token'
          }
        }
      }
    }
  });

  await waitFor(() => app.document.querySelector('[data-testid="members-table"]'));
  setInputValue(app.document.querySelector('[data-testid="invite-email"]'), 'new-member@example.com', app.window);
  setInputValue(app.document.querySelector('[data-testid="invite-role"]'), 'viewer', app.window);
  submitForm(app.document.querySelector('[data-testid="invite-form"]'), app.window);

  await waitFor(() => app.document.body.textContent.includes('Invitation sent to new-member@example.com.'));
  await waitFor(() => app.document.body.textContent.includes('new-member@example.com'));
  const inviteRequest = app.requests.find((request) => request.method === 'POST' && request.url.pathname.endsWith('/invite'));

  assert.ok(inviteRequest);
  assert.deepEqual(JSON.parse(inviteRequest.body), {
    email: 'new-member@example.com',
    role: 'viewer'
  });
});

test('users page changes role through membership role endpoint', async () => {
  const session = createSessionFixture({
    permissions: ['user.read', 'user.manage', 'invite.manage', 'role.manage']
  });
  const initialMembers = {
    items: [
      {
        id: 9003,
        user: { email: 'operator@example.com' },
        role: 'operator',
        status: 'active',
        joinedAt: '2026-03-17T08:00:00.000Z'
      }
    ]
  };
  const refreshedMembers = {
    items: [
      {
        id: 9003,
        user: { email: 'operator@example.com' },
        role: 'viewer',
        status: 'active',
        joinedAt: '2026-03-17T08:00:00.000Z'
      }
    ]
  };
  const app = await loadAdminApp({
    route: '#/users',
    routes: {
      'GET /auth/me': { status: 200, body: session },
      'GET /workspace/3001/members': [
        { status: 200, body: initialMembers },
        { status: 200, body: refreshedMembers }
      ],
      'PATCH /workspace/3001/members/9003/role': {
        status: 200,
        body: refreshedMembers.items[0]
      }
    }
  });

  await waitFor(() => app.document.querySelector('[data-testid="role-select-9003"]'));
  setInputValue(app.document.querySelector('[data-testid="role-select-9003"]'), 'viewer', app.window);
  click(app.document.querySelector('[data-testid="role-save-9003"]'), app.window);

  await waitFor(() => app.document.body.textContent.includes('Updated role for operator@example.com.'));
  const roleRequest = app.requests.find((request) => request.url.pathname.endsWith('/members/9003/role'));

  assert.ok(roleRequest);
  assert.deepEqual(JSON.parse(roleRequest.body), { role: 'viewer' });
});

test('settings page updates tenant settings and sends branding payload', async () => {
  const session = createSessionFixture({
    permissions: ['tenant.read', 'tenant.manage', 'organization.read', 'organization.manage']
  });
  const tenantSettings = {
    ...session.currentClinic,
    brandingJson: { primaryColor: '#1144aa' },
    settingsJson: { plan: 'growth' }
  };
  const organizationSettings = {
    ...session.currentOrganization,
    settingsJson: { onboardingMode: 'guided' }
  };
  const app = await loadAdminApp({
    route: '#/settings',
    routes: {
      'GET /auth/me': { status: 200, body: session },
      'GET /tenant/settings': { status: 200, body: tenantSettings },
      'GET /organization/2001': { status: 200, body: organizationSettings },
      'PATCH /tenant/settings': {
        status: 200,
        body: {
          ...tenantSettings,
          timezone: 'Asia/Tokyo',
          locale: 'en-US',
          brandingJson: { primaryColor: '#0f766e', wordmark: 'FlowBiz Admin' },
          settingsJson: { plan: 'enterprise' }
        }
      }
    }
  });

  await waitFor(() => app.document.querySelector('[data-testid="tenant-settings-form"]'));
  const textareas = app.document.querySelectorAll('[data-testid="tenant-branding-json"], [data-testid="tenant-settings-save"]');
  assert.equal(textareas.length, 2);
  const timezoneInput = [...app.document.querySelectorAll('input')].find((input) => input.value === 'Asia/Bangkok');
  const localeInput = [...app.document.querySelectorAll('input')].find((input) => input.value === 'th-TH');
  setInputValue(timezoneInput, 'Asia/Tokyo', app.window);
  setInputValue(localeInput, 'en-US', app.window);
  setInputValue(
    app.document.querySelector('[data-testid="tenant-branding-json"]'),
    JSON.stringify({ primaryColor: '#0f766e', wordmark: 'FlowBiz Admin' }, null, 2),
    app.window
  );
  submitForm(app.document.querySelector('[data-testid="tenant-settings-form"]'), app.window);

  await waitFor(() => app.document.body.textContent.includes('Tenant settings updated.'));
  const patchRequest = app.requests.find((request) => request.method === 'PATCH' && request.url.pathname === '/tenant/settings');

  assert.ok(patchRequest);
  assert.deepEqual(JSON.parse(patchRequest.body), {
    timezone: 'Asia/Tokyo',
    locale: 'en-US',
    branding_json: { primaryColor: '#0f766e', wordmark: 'FlowBiz Admin' },
    settings_json: { plan: 'growth' }
  });
});