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
      return createResponse(404, { error: { code: 'NOT_FOUND', message: `not found: ${fullKey}` } });
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

async function loadPublicApp({ pathName = '/clinic-alpha#/member-access?token=dev-token', routes = {} }) {
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

function click(window, element) {
  element.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
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

const sessionPayload = {
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
  ],
  slotOffers: [
    {
      id: 1001,
      bookingRequestId: 123,
      offeredDate: '2099-06-20',
      offeredTimeWindow: 'specific_time',
      offeredStartTime: '14:00',
      durationMinutes: 60,
      offerStatus: 'ready_to_send',
      customerResponse: null,
      createdAt: '2099-06-01T00:00:00.000Z'
    },
    {
      id: 1002,
      bookingRequestId: 123,
      offeredDate: '2099-06-21',
      offeredTimeWindow: 'afternoon',
      offeredStartTime: null,
      durationMinutes: 45,
      offerStatus: 'draft',
      customerResponse: null,
      offerNote: 'raw offer note should not render',
      internalNote: 'raw internal note should not render',
      createdAt: '2099-06-01T00:00:00.000Z'
    }
  ]
};

function clinicRoutes(extra = {}, session = sessionPayload) {
  return {
    'GET /public/clinics/clinic-alpha': { status: 200, body: clinicPayload },
    'GET /public/clinics/clinic-alpha/services': { status: 200, body: { items: [] } },
    'GET /public/clinics/clinic-alpha/promotions': { status: 200, body: { items: [] } },
    'GET /public/clinics/clinic-alpha/packages': { status: 200, body: { items: [] } },
    'GET /public/clinics/clinic-alpha/member-access/session?token=dev-token': { status: 200, body: session },
    ...extra
  };
}

test('Member slot offer response UI - renders slot offers section', async () => {
  const app = await loadPublicApp({ routes: clinicRoutes() });
  await waitFor(() => app.document.querySelector('[data-testid="member-access-slot-offers"]'));

  assert.ok(app.document.querySelector('[data-testid="member-access-slot-offers"]'));
  assert.match(app.document.body.textContent, /ข้อเสนอเวลานัดจากคลินิก/);
});

test('Member slot offer response UI - row renders date time duration and status', async () => {
  const app = await loadPublicApp({ routes: clinicRoutes() });
  const row = await waitFor(() => app.document.querySelector('[data-testid="member-access-slot-offer-row-1001"]'));

  assert.match(row.textContent, /2099-06-20/);
  assert.match(row.textContent, /specific_time/);
  assert.match(row.textContent, /14:00/);
  assert.match(row.textContent, /60 นาที/);
  assert.match(row.textContent, /ready_to_send/);
});

test('Member slot offer response UI - accept sends token and response without tenant override', async () => {
  let capturedPayload = null;
  const app = await loadPublicApp({
    routes: clinicRoutes({
      'POST /public/clinics/clinic-alpha/member-access/slot-offers/1001/respond': (request) => {
        capturedPayload = JSON.parse(request.body);
        return {
          status: 200,
          body: {
            success: true,
            offer: {
              id: 1001,
              bookingRequestId: 123,
              offerStatus: 'accepted',
              customerResponse: 'accepted',
              customerRespondedAt: '2099-06-01T01:00:00.000Z'
            }
          }
        };
      }
    })
  });

  await waitFor(() => app.document.querySelector('[data-testid="member-access-slot-offer-accept-1001"]'));
  setValue(app.window, app.document.querySelector('[data-testid="member-access-slot-offer-note-1001"]'), 'สะดวกเวลานี้ค่ะ');
  click(app.window, app.document.querySelector('[data-testid="member-access-slot-offer-accept-1001"]'));

  await waitFor(() => app.document.querySelector('[data-testid="member-access-slot-offer-success"]'));
  assert.equal(capturedPayload.token, 'dev-token');
  assert.equal(capturedPayload.response, 'accepted');
  assert.equal(capturedPayload.note, 'สะดวกเวลานี้ค่ะ');
  assert.equal(capturedPayload.clinicId, undefined);
  assert.equal(capturedPayload.clinic_id, undefined);
  assert.equal(capturedPayload.memberId, undefined);
  assert.equal(capturedPayload.member_id, undefined);
  assert.equal(capturedPayload.leadId, undefined);
  assert.equal(capturedPayload.lead_id, undefined);
});

test('Member slot offer response UI - disables all slot offer response controls while submission is pending', async () => {
  let resolveResponse;
  const pendingResponse = new Promise((resolve) => {
    resolveResponse = resolve;
  });
  const responseableSession = {
    ...sessionPayload,
    slotOffers: [
      ...sessionPayload.slotOffers,
      {
        id: 1003,
        bookingRequestId: 123,
        offeredDate: '2099-06-22',
        offeredTimeWindow: 'morning',
        offeredStartTime: '10:00',
        durationMinutes: 30,
        offerStatus: 'sent',
        customerResponse: null,
        createdAt: '2099-06-01T00:00:00.000Z'
      }
    ]
  };
  const app = await loadPublicApp({
    routes: clinicRoutes({
      'POST /public/clinics/clinic-alpha/member-access/slot-offers/1001/respond': () => pendingResponse
    }, responseableSession)
  });

  await waitFor(() => app.document.querySelector('[data-testid="member-access-slot-offer-accept-1001"]'));
  click(app.window, app.document.querySelector('[data-testid="member-access-slot-offer-accept-1001"]'));

  await waitFor(() => app.document.querySelector('[data-testid="member-access-slot-offer-accept-1001"]').disabled);
  assert.equal(app.document.querySelector('[data-testid="member-access-slot-offer-decline-1001"]').disabled, true);
  assert.equal(app.document.querySelector('[data-testid="member-access-slot-offer-accept-1003"]').disabled, true);
  assert.equal(app.document.querySelector('[data-testid="member-access-slot-offer-decline-1003"]').disabled, true);
  assert.equal(app.document.querySelector('[data-testid="member-access-slot-offer-note-1001"]').disabled, true);
  assert.equal(app.document.querySelector('[data-testid="member-access-slot-offer-note-1003"]').disabled, true);

  resolveResponse({
    status: 200,
    body: {
      success: true,
      offer: {
        id: 1001,
        bookingRequestId: 123,
        offerStatus: 'accepted',
        customerResponse: 'accepted',
        customerRespondedAt: '2099-06-01T01:00:00.000Z'
      }
    }
  });
  await waitFor(() => app.document.querySelector('[data-testid="member-access-slot-offer-success"]'));
});

test('Member slot offer response UI - decline sends declined response', async () => {
  let capturedPayload = null;
  const app = await loadPublicApp({
    routes: clinicRoutes({
      'POST /public/clinics/clinic-alpha/member-access/slot-offers/1001/respond': (request) => {
        capturedPayload = JSON.parse(request.body);
        return {
          status: 200,
          body: {
            success: true,
            offer: {
              id: 1001,
              bookingRequestId: 123,
              offerStatus: 'declined',
              customerResponse: 'declined',
              customerRespondedAt: '2099-06-01T01:00:00.000Z'
            }
          }
        };
      }
    })
  });

  await waitFor(() => app.document.querySelector('[data-testid="member-access-slot-offer-decline-1001"]'));
  click(app.window, app.document.querySelector('[data-testid="member-access-slot-offer-decline-1001"]'));

  await waitFor(() => app.document.querySelector('[data-testid="member-access-slot-offer-success"]'));
  assert.equal(capturedPayload.response, 'declined');
});

test('Member slot offer response UI - note max 500 validation', async () => {
  const app = await loadPublicApp({ routes: clinicRoutes() });
  await waitFor(() => app.document.querySelector('[data-testid="member-access-slot-offer-note-1001"]'));

  setValue(app.window, app.document.querySelector('[data-testid="member-access-slot-offer-note-1001"]'), 'x'.repeat(501));
  await waitFor(() => app.document.querySelector('[data-testid="member-access-slot-offer-error"]'));
  assert.match(app.document.querySelector('[data-testid="member-access-slot-offer-error"]').textContent, /500/);
});

test('Member slot offer response UI - success state renders after accept', async () => {
  const app = await loadPublicApp({
    routes: clinicRoutes({
      'POST /public/clinics/clinic-alpha/member-access/slot-offers/1001/respond': {
        status: 200,
        body: {
          success: true,
          offer: {
            id: 1001,
            bookingRequestId: 123,
            offerStatus: 'accepted',
            customerResponse: 'accepted',
            customerRespondedAt: '2099-06-01T01:00:00.000Z'
          }
        }
      }
    })
  });

  await waitFor(() => app.document.querySelector('[data-testid="member-access-slot-offer-accept-1001"]'));
  click(app.window, app.document.querySelector('[data-testid="member-access-slot-offer-accept-1001"]'));

  const success = await waitFor(() => app.document.querySelector('[data-testid="member-access-slot-offer-success"]'));
  assert.match(success.textContent, /ตอบรับ/);
  assert.match(app.document.querySelector('[data-testid="member-access-slot-offer-row-1001"]').textContent, /accepted/);
});

test('Member slot offer response UI - API error renders', async () => {
  const app = await loadPublicApp({
    routes: clinicRoutes({
      'POST /public/clinics/clinic-alpha/member-access/slot-offers/1001/respond': {
        status: 409,
        body: { error: { code: 'SLOT_OFFER_ALREADY_RESPONDED', message: 'Slot offer has already been responded to.' } }
      }
    })
  });

  await waitFor(() => app.document.querySelector('[data-testid="member-access-slot-offer-accept-1001"]'));
  click(app.window, app.document.querySelector('[data-testid="member-access-slot-offer-accept-1001"]'));

  const error = await waitFor(() => app.document.querySelector('[data-testid="member-access-slot-offer-error"]'));
  assert.match(error.textContent, /SLOT_OFFER_ALREADY_RESPONDED/);
});

test('Member slot offer response UI - internal note and offer note are not rendered', async () => {
  const app = await loadPublicApp({ routes: clinicRoutes() });
  await waitFor(() => app.document.querySelector('[data-testid="member-access-slot-offers"]'));

  assert.doesNotMatch(app.document.body.textContent, /raw offer note should not render/);
  assert.doesNotMatch(app.document.body.textContent, /raw internal note should not render/);
});

test('Member slot offer response UI - draft offers are not rendered', async () => {
  const app = await loadPublicApp({ routes: clinicRoutes() });
  await waitFor(() => app.document.querySelector('[data-testid="member-access-slot-offers"]'));

  assert.equal(app.document.querySelector('[data-testid="member-access-slot-offer-row-1002"]'), null);
});

test('Member slot offer response UI - platform routes do not render slot offers', async () => {
  const app = await loadPublicApp({ pathName: '/', routes: {} });
  await waitFor(() => app.document.querySelector('.saas-landing') || app.document.querySelector('.header-glass'));

  assert.equal(app.document.querySelector('[data-testid="member-access-slot-offers"]'), null);
});
