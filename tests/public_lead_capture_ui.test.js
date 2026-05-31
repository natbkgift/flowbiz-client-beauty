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

const publicServices = [
  { id: 11, name: 'Botox Lift', slug: 'botox-lift', shortDescription: 'ลดริ้วรอย', priceMin: 3000, priceMax: 8000, currency: 'THB' }
];
const publicPromotions = [
  { id: 21, title: 'Summer Glow', slug: 'summer-glow', subtitle: 'โปรดูแลผิว', badgeLabel: 'Hot' }
];
const publicPackages = [
  { id: 31, name: 'Glow Course', slug: 'glow-course', summary: 'ดูแลต่อเนื่อง', price: 12000, currency: 'THB' }
];

function clinicRoutes(extra = {}) {
  return {
    'GET /public/clinics/clinic-alpha': { status: 200, body: clinicPayload },
    'GET /public/clinics/clinic-alpha/services': { status: 200, body: { items: publicServices } },
    'GET /public/clinics/clinic-alpha/promotions': { status: 200, body: { items: publicPromotions } },
    'GET /public/clinics/clinic-alpha/packages': { status: 200, body: { items: publicPackages } },
    ...extra
  };
}

test('Public lead capture UI - renders form and client-side validation states', async () => {
  const app = await loadPublicApp({ routes: clinicRoutes() });
  const form = await waitFor(() => app.document.querySelector('[data-testid="clinic-lead-form"]'));

  assert.ok(form);
  assert.ok(app.document.querySelector('[data-testid="clinic-lead-name"]'));
  assert.ok(app.document.querySelector('[data-testid="clinic-lead-phone"]'));
  assert.ok(app.document.querySelector('[data-testid="clinic-lead-email"]'));
  assert.ok(app.document.querySelector('[data-testid="clinic-lead-line-id"]'));
  assert.ok(app.document.querySelector('[data-testid="clinic-lead-interest-type"]'));
  assert.ok(app.document.querySelector('[data-testid="clinic-lead-interest-id"]'));
  assert.ok(app.document.querySelector('[data-testid="clinic-lead-message"]'));
  assert.ok(app.document.querySelector('[data-testid="clinic-lead-consent"]'));
  assert.ok(app.document.querySelector('[data-testid="clinic-lead-submit"]'));

  submit(app.window, form);
  await waitFor(() => app.document.querySelector('[data-testid="clinic-lead-error"]'));
  assert.match(app.document.querySelector('[data-testid="clinic-lead-error"]').textContent, /ยอมรับ/);

  app.document.querySelector('[data-testid="clinic-lead-consent"]').click();
  submit(app.window, form);
  await waitFor(() => {
    const error = app.document.querySelector('[data-testid="clinic-lead-error"]');
    return error && /เบอร์โทรศัพท์|LINE ID/.test(error.textContent);
  });

  setValue(app.window, app.document.querySelector('[data-testid="clinic-lead-email"]'), 'bad-email');
  submit(app.window, form);
  await waitFor(() => {
    const error = app.document.querySelector('[data-testid="clinic-lead-error"]');
    return error && /อีเมล/.test(error.textContent);
  });
});

test('Public lead capture UI - submit sends safe payload and renders success', async () => {
  let capturedPayload = null;
  const app = await loadPublicApp({
    routes: clinicRoutes({
      'POST /public/clinics/clinic-alpha/leads': (request) => {
        capturedPayload = JSON.parse(request.body);
        return {
          status: 201,
          body: { success: true, leadId: 123, message: 'ขอบคุณค่ะ ทีมงานจะติดต่อกลับโดยเร็วที่สุด' }
        };
      }
    })
  });

  const form = await waitFor(() => app.document.querySelector('[data-testid="clinic-lead-form"]'));
  setValue(app.window, app.document.querySelector('[data-testid="clinic-lead-name"]'), 'Jane Doe');
  setValue(app.window, app.document.querySelector('[data-testid="clinic-lead-phone"]'), '0899999999');
  setValue(app.window, app.document.querySelector('[data-testid="clinic-lead-email"]'), 'jane@example.com');
  setValue(app.window, app.document.querySelector('[data-testid="clinic-lead-line-id"]'), '@jane');
  setValue(app.window, app.document.querySelector('[data-testid="clinic-lead-message"]'), 'สนใจ Botox');
  app.document.querySelector('[data-testid="clinic-lead-consent"]').click();
  submit(app.window, form);

  await waitFor(() => app.document.querySelector('[data-testid="clinic-lead-success"]'));
  assert.equal(capturedPayload.name, 'Jane Doe');
  assert.equal(capturedPayload.phone, '0899999999');
  assert.equal(capturedPayload.source, 'clinic_public_website');
  assert.equal(capturedPayload.clinicId, undefined);
  assert.equal(capturedPayload.clinic_id, undefined);
});

test('Public lead capture UI - API error renders form error without redirect', async () => {
  const app = await loadPublicApp({
    routes: clinicRoutes({
      'POST /public/clinics/clinic-alpha/leads': {
        status: 400,
        body: { error: { code: 'INVALID_INTEREST', message: 'บริการที่เลือกไม่พร้อมใช้งาน' } }
      }
    })
  });

  const form = await waitFor(() => app.document.querySelector('[data-testid="clinic-lead-form"]'));
  setValue(app.window, app.document.querySelector('[data-testid="clinic-lead-phone"]'), '0899999999');
  app.document.querySelector('[data-testid="clinic-lead-consent"]').click();
  submit(app.window, form);

  await waitFor(() => app.document.querySelector('[data-testid="clinic-lead-error"]'));
  assert.match(app.document.querySelector('[data-testid="clinic-lead-error"]').textContent, /บริการที่เลือกไม่พร้อมใช้งาน/);
  assert.ok(app.document.querySelector('[data-testid="clinic-template"]'));
});

test('Public lead capture UI - interest CTA buttons prefill service, promotion, and package interest', async () => {
  const app = await loadPublicApp({ routes: clinicRoutes() });
  await waitFor(() => app.document.querySelector('[data-testid="clinic-template-service-interest-11"]'));

  app.document.querySelector('[data-testid="clinic-template-service-interest-11"]').click();
  await waitFor(() => app.document.querySelector('[data-testid="clinic-lead-interest-type"]').value === 'service');
  assert.equal(app.document.querySelector('[data-testid="clinic-lead-interest-id"]').value, '11');

  app.document.querySelector('[data-testid="clinic-template-promotion-interest-21"]').click();
  await waitFor(() => app.document.querySelector('[data-testid="clinic-lead-interest-type"]').value === 'promotion');
  assert.equal(app.document.querySelector('[data-testid="clinic-lead-interest-id"]').value, '21');

  app.document.querySelector('[data-testid="clinic-template-package-interest-31"]').click();
  await waitFor(() => app.document.querySelector('[data-testid="clinic-lead-interest-type"]').value === 'package');
  assert.equal(app.document.querySelector('[data-testid="clinic-lead-interest-id"]').value, '31');
});

test('Public lead capture UI - honeypot field exists and stays hidden', async () => {
  const app = await loadPublicApp({ routes: clinicRoutes() });
  const honeypot = await waitFor(() => app.document.querySelector('[data-testid="clinic-lead-honeypot"]'));

  assert.ok(honeypot.classList.contains('clinic-lead-honeypot'));
  assert.equal(honeypot.getAttribute('aria-hidden'), 'true');
  assert.equal(honeypot.getAttribute('tabindex'), '-1');
});

test('Public lead capture UI - platform routes do not render lead form', async () => {
  for (const pathName of ['/', '/pricing', '/demo', '/blog', '/forum']) {
    const app = await loadPublicApp({ pathName, routes: {} });
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(app.document.querySelector('[data-testid="clinic-lead-form"]'), null, `${pathName} should not render lead form`);
  }
});
