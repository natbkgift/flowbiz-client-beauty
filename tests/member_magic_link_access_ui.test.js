'use strict';

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
      return createResponse(404, { error: { code: 'NOT_FOUND', message: 'not found' } });
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

async function loadPublicApp({ pathName = '/clinic-alpha#/member-access', routes = {} }) {
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
  dom.window.eval(bundleSource);

  return { dom, document: dom.window.document, window: dom.window, requests };
}

function setValue(window, element, value) {
  const prototype = Object.getPrototypeOf(element);
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  if (descriptor?.set) {
    descriptor.set.call(element, value);
  } else {
    element.value = value;
  }
  element.dispatchEvent(new window.Event('input', { bubbles: true }));
  element.dispatchEvent(new window.Event('change', { bubbles: true }));
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

function clinicRoutes(extra = {}) {
  return {
    'GET /public/clinics/clinic-alpha': { status: 200, body: clinicPayload },
    'GET /public/clinics/clinic-alpha/services': { status: 200, body: { items: [] } },
    'GET /public/clinics/clinic-alpha/promotions': { status: 200, body: { items: [] } },
    'GET /public/clinics/clinic-alpha/packages': { status: 200, body: { items: [] } },
    ...extra
  };
}

test('Member magic link UI - clinic hash route renders request form', async () => {
  const app = await loadPublicApp({ routes: clinicRoutes() });
  const form = await waitFor(() => app.document.querySelector('[data-testid="member-access-request-form"]'));

  assert.ok(form);
  assert.ok(app.document.querySelector('[data-testid="member-access-contact"]'));
  assert.ok(app.document.querySelector('[data-testid="member-access-channel"]'));
  assert.ok(app.document.querySelector('[data-testid="member-access-honeypot"]'));
  assert.ok(app.document.querySelector('[data-testid="member-access-request-submit"]'));
});

test('Member magic link UI - missing contact and invalid email block submit', async () => {
  const app = await loadPublicApp({ routes: clinicRoutes() });
  const form = await waitFor(() => app.document.querySelector('[data-testid="member-access-request-form"]'));

  submit(app.window, form);
  await waitFor(() => app.document.querySelector('[data-testid="member-access-request-error"]'));
  assert.match(app.document.querySelector('[data-testid="member-access-request-error"]').textContent, /ช่องทางติดต่อ/);

  setValue(app.window, app.document.querySelector('[data-testid="member-access-contact"]'), 'bad-email');
  submit(app.window, form);
  await waitFor(() => /อีเมล/.test(app.document.querySelector('[data-testid="member-access-request-error"]').textContent));
});

test('Member magic link UI - submit sends payload without clinicId and renders success', async () => {
  let capturedPayload = null;
  const app = await loadPublicApp({
    routes: clinicRoutes({
      'POST /public/clinics/clinic-alpha/member-access/request': (request) => {
        capturedPayload = JSON.parse(request.body);
        return {
          status: 200,
          body: { success: true, message: 'หากพบข้อมูลสมาชิก ระบบจะส่งลิงก์เข้าใช้งานให้ตามช่องทางที่ระบุ' }
        };
      }
    })
  });

  const form = await waitFor(() => app.document.querySelector('[data-testid="member-access-request-form"]'));
  setValue(app.window, app.document.querySelector('[data-testid="member-access-contact"]'), 'jane@example.com');
  submit(app.window, form);

  await waitFor(() => app.document.querySelector('[data-testid="member-access-request-success"]'));
  assert.equal(capturedPayload.contact, 'jane@example.com');
  assert.equal(capturedPayload.channel, 'email');
  assert.equal(capturedPayload.clinicId, undefined);
  assert.equal(capturedPayload.clinic_id, undefined);
});

test('Member magic link UI - API error shown without breaking clinic page', async () => {
  const app = await loadPublicApp({
    routes: clinicRoutes({
      'POST /public/clinics/clinic-alpha/member-access/request': {
        status: 400,
        body: { error: { code: 'INVALID_MEMBER_ACCESS_EMAIL', message: 'รูปแบบอีเมลไม่ถูกต้อง' } }
      }
    })
  });

  const form = await waitFor(() => app.document.querySelector('[data-testid="member-access-request-form"]'));
  setValue(app.window, app.document.querySelector('[data-testid="member-access-contact"]'), 'jane@example.com');
  submit(app.window, form);

  await waitFor(() => app.document.querySelector('[data-testid="member-access-request-error"]'));
  assert.match(app.document.querySelector('[data-testid="member-access-request-error"]').textContent, /อีเมล/);
  assert.ok(app.document.querySelector('[data-testid="clinic-public-shell"]'));
});

test('Member magic link UI - token session success renders masked profile and booking rows', async () => {
  const app = await loadPublicApp({
    pathName: '/clinic-alpha#/member-access?token=dev-token',
    routes: clinicRoutes({
      'GET /public/clinics/clinic-alpha/member-access/session?token=dev-token': {
        status: 200,
        body: {
          success: true,
          member: {
            displayName: 'Jane D.',
            contact: {
              emailMasked: 'ja***@example.com',
              phoneMasked: '08*****99',
              lineIdMasked: '@ja***'
            }
          },
          bookingRequests: [
            {
              id: 123,
              status: 'contacted',
              requestType: 'booking_request',
              interestType: 'service',
              preferredDate: '2099-06-15',
              preferredTimeWindow: 'afternoon',
              createdAt: '2099-06-01T00:00:00.000Z'
            }
          ]
        }
      }
    })
  });

  await waitFor(() => app.document.querySelector('[data-testid="member-access-session"]'));
  assert.equal(app.document.querySelector('[data-testid="member-access-profile-name"]').textContent, 'Jane D.');
  assert.match(app.document.querySelector('[data-testid="member-access-profile-contact"]').textContent, /ja\*\*\*@example\.com/);
  assert.ok(app.document.querySelector('[data-testid="member-access-booking-list"]'));
  assert.ok(app.document.querySelector('[data-testid="member-access-booking-row-123"]'));
});

test('Member magic link UI - token invalid shows token error', async () => {
  const app = await loadPublicApp({
    pathName: '/clinic-alpha#/member-access?token=bad-token',
    routes: clinicRoutes({
      'GET /public/clinics/clinic-alpha/member-access/session?token=bad-token': {
        status: 404,
        body: { error: { code: 'INVALID_MEMBER_ACCESS_TOKEN', message: 'ลิงก์เข้าใช้งานไม่ถูกต้อง' } }
      }
    })
  });

  await waitFor(() => app.document.querySelector('[data-testid="member-access-token-error"]'));
  assert.match(app.document.querySelector('[data-testid="member-access-token-error"]').textContent, /ลิงก์/);
});

test('Member magic link UI - token route accepts hash without leading slash', async () => {
  const app = await loadPublicApp({
    pathName: '/clinic-alpha#member-access?token=no-slash-token',
    routes: clinicRoutes({
      'GET /public/clinics/clinic-alpha/member-access/session?token=no-slash-token': {
        status: 200,
        body: {
          success: true,
          member: {
            displayName: 'Jane D.',
            contact: {
              emailMasked: 'ja***@example.com',
              phoneMasked: '08*****99',
              lineIdMasked: '@ja***'
            }
          },
          bookingRequests: []
        }
      }
    })
  });

  await waitFor(() => app.document.querySelector('[data-testid="member-access-profile-name"]'));
  assert.equal(app.document.querySelector('[data-testid="member-access-profile-name"]').textContent, 'Jane D.');
});

test('Member magic link UI - platform routes do not render member access UI', async () => {
  const app = await loadPublicApp({ pathName: '/', routes: {} });
  await waitFor(() => app.document.querySelector('.saas-landing') || app.document.querySelector('.header-glass'));
  assert.equal(app.document.querySelector('[data-testid="member-access-request-form"]'), null);
  assert.equal(app.document.querySelector('[data-testid="member-access-session"]'), null);
});
