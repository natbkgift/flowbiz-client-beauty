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

test('Public booking request UI - renders form and client-side validation states', async () => {
  const app = await loadPublicApp({ routes: clinicRoutes() });
  const form = await waitFor(() => app.document.querySelector('[data-testid="clinic-booking-form"]'));

  assert.ok(form);
  assert.ok(app.document.querySelector('[data-testid="clinic-booking-name"]'));
  assert.ok(app.document.querySelector('[data-testid="clinic-booking-phone"]'));
  assert.ok(app.document.querySelector('[data-testid="clinic-booking-email"]'));
  assert.ok(app.document.querySelector('[data-testid="clinic-booking-line-id"]'));
  assert.ok(app.document.querySelector('[data-testid="clinic-booking-request-type"]'));
  assert.ok(app.document.querySelector('[data-testid="clinic-booking-interest-type"]'));
  assert.ok(app.document.querySelector('[data-testid="clinic-booking-interest-id"]'));
  assert.ok(app.document.querySelector('[data-testid="clinic-booking-preferred-date"]'));
  assert.ok(app.document.querySelector('[data-testid="clinic-booking-time-window"]'));
  assert.ok(app.document.querySelector('[data-testid="clinic-booking-contact-method"]'));
  assert.ok(app.document.querySelector('[data-testid="clinic-booking-message"]'));
  assert.ok(app.document.querySelector('[data-testid="clinic-booking-consent"]'));
  assert.ok(app.document.querySelector('[data-testid="clinic-booking-submit"]'));

  submit(app.window, form);
  await waitFor(() => app.document.querySelector('[data-testid="clinic-booking-error"]'));
  assert.match(app.document.querySelector('[data-testid="clinic-booking-error"]').textContent, /ยอมรับ/);

  app.document.querySelector('[data-testid="clinic-booking-consent"]').click();
  submit(app.window, form);
  await waitFor(() => {
    const error = app.document.querySelector('[data-testid="clinic-booking-error"]');
    return error && /เบอร์โทรศัพท์|LINE ID/.test(error.textContent);
  });

  setValue(app.window, app.document.querySelector('[data-testid="clinic-booking-email"]'), 'bad-email');
  submit(app.window, form);
  await waitFor(() => {
    const error = app.document.querySelector('[data-testid="clinic-booking-error"]');
    return error && /อีเมล/.test(error.textContent);
  });
});

test('Public booking request UI - submit sends safe payload and renders success', async () => {
  let capturedPayload = null;
  const app = await loadPublicApp({
    routes: clinicRoutes({
      'POST /public/clinics/clinic-alpha/booking-requests': (request) => {
        capturedPayload = JSON.parse(request.body);
        return {
          status: 201,
          body: { success: true, bookingRequestId: 123, leadId: 456, message: 'รับคำขอนัดหมายแล้วค่ะ ทีมงานจะติดต่อกลับเพื่อยืนยันเวลา' }
        };
      }
    })
  });

  const form = await waitFor(() => app.document.querySelector('[data-testid="clinic-booking-form"]'));
  setValue(app.window, app.document.querySelector('[data-testid="clinic-booking-name"]'), 'Jane Doe');
  setValue(app.window, app.document.querySelector('[data-testid="clinic-booking-phone"]'), '0899999999');
  setValue(app.window, app.document.querySelector('[data-testid="clinic-booking-email"]'), 'jane@example.com');
  setValue(app.window, app.document.querySelector('[data-testid="clinic-booking-line-id"]'), '@jane');
  setValue(app.window, app.document.querySelector('[data-testid="clinic-booking-preferred-date"]'), '2099-06-15');
  setValue(app.window, app.document.querySelector('[data-testid="clinic-booking-message"]'), 'อยากปรึกษาก่อนทำ');
  app.document.querySelector('[data-testid="clinic-booking-consent"]').click();
  submit(app.window, form);

  await waitFor(() => app.document.querySelector('[data-testid="clinic-booking-success"]'));
  assert.equal(capturedPayload.name, 'Jane Doe');
  assert.equal(capturedPayload.phone, '0899999999');
  assert.equal(capturedPayload.preferredDate, '2099-06-15');
  assert.equal(capturedPayload.clinicId, undefined);
  assert.equal(capturedPayload.clinic_id, undefined);
});

test('Public booking request UI - API error renders form error without redirect', async () => {
  const app = await loadPublicApp({
    routes: clinicRoutes({
      'POST /public/clinics/clinic-alpha/booking-requests': {
        status: 400,
        body: { error: { code: 'INVALID_BOOKING_INTEREST', message: 'บริการที่เลือกไม่พร้อมรับคำขอนัดหมาย' } }
      }
    })
  });

  const form = await waitFor(() => app.document.querySelector('[data-testid="clinic-booking-form"]'));
  setValue(app.window, app.document.querySelector('[data-testid="clinic-booking-phone"]'), '0899999999');
  app.document.querySelector('[data-testid="clinic-booking-consent"]').click();
  submit(app.window, form);

  await waitFor(() => app.document.querySelector('[data-testid="clinic-booking-error"]'));
  assert.match(app.document.querySelector('[data-testid="clinic-booking-error"]').textContent, /บริการที่เลือกไม่พร้อม/);
  assert.ok(app.document.querySelector('[data-testid="clinic-template"]'));
});

test('Public booking request UI - booking CTA buttons prefill service, promotion, and package interest', async () => {
  const app = await loadPublicApp({ routes: clinicRoutes() });
  await waitFor(() => app.document.querySelector('[data-testid="clinic-template-service-booking-11"]'));

  app.document.querySelector('[data-testid="clinic-template-service-booking-11"]').click();
  await waitFor(() => app.document.querySelector('[data-testid="clinic-booking-interest-type"]').value === 'service');
  assert.equal(app.document.querySelector('[data-testid="clinic-booking-interest-id"]').value, '11');
  assert.equal(app.document.querySelector('[data-testid="clinic-booking-request-type"]').value, 'booking_request');

  app.document.querySelector('[data-testid="clinic-template-promotion-booking-21"]').click();
  await waitFor(() => app.document.querySelector('[data-testid="clinic-booking-interest-type"]').value === 'promotion');
  assert.equal(app.document.querySelector('[data-testid="clinic-booking-interest-id"]').value, '21');

  app.document.querySelector('[data-testid="clinic-template-package-booking-31"]').click();
  await waitFor(() => app.document.querySelector('[data-testid="clinic-booking-interest-type"]').value === 'package');
  assert.equal(app.document.querySelector('[data-testid="clinic-booking-interest-id"]').value, '31');
});

test('Public booking request UI - honeypot field exists and stays hidden', async () => {
  const app = await loadPublicApp({ routes: clinicRoutes() });
  const honeypot = await waitFor(() => app.document.querySelector('[data-testid="clinic-booking-honeypot"]'));

  assert.ok(honeypot.classList.contains('clinic-lead-honeypot'));
  assert.equal(honeypot.getAttribute('aria-hidden'), 'true');
  assert.equal(honeypot.getAttribute('tabindex'), '-1');
});

test('Public booking request UI - platform routes do not render booking form', async () => {
  for (const pathName of ['/', '/pricing', '/demo', '/blog', '/forum']) {
    const app = await loadPublicApp({ pathName, routes: {} });
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(app.document.querySelector('[data-testid="clinic-booking-form"]'), null, `${pathName} should not render booking form`);
  }
});
