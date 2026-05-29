const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { buildWeb } = require('../scripts/build-web');

const bundlePath = buildWeb({ silent: true }).publicOutputFile;
const bundleSource = fs.readFileSync(bundlePath, 'utf8');

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
      return createResponse(404, { error: { code: 'NOT_FOUND' } });
    }

    const next = queue.shift();
    const result = typeof next === 'function' ? await next(requestRecord, requests) : next;
    return createResponse(result.status || 200, result.body);
  }

  return {
    requests,
    fetchMock
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

async function loadPublicApp({ pathName = '/', routes = {} }) {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="app"></div></body></html>',
    {
      url: `http://localhost:3000${pathName}`,
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

  // Evaluate the compiled React app bundle
  dom.window.eval(bundleSource);

  return {
    dom,
    document: dom.window.document,
    window: dom.window,
    requests
  };
}

// =========================================================================
// Integration Tests for PR 7 - FlowBiz SaaS Landing Page
// =========================================================================

test('PR7 - FlowBiz SaaS Landing Page tests', async (t) => {

  // =========================================================================
  // 1. "/" renders SaaS landing page with all key sections
  // =========================================================================
  await t.test('1. "/" renders SaaS landing page with hero', async () => {
    const app = await loadPublicApp({
      pathName: '/',
      routes: {}
    });

    await waitFor(() => app.document.querySelector('[data-testid="saas-landing-page"]'));
    const landing = app.document.querySelector('[data-testid="saas-landing-page"]');
    assert.ok(landing, 'saas-landing-page wrapper should exist');

    const hero = app.document.querySelector('[data-testid="saas-hero"]');
    assert.ok(hero, 'saas-hero section should exist');
    assert.match(hero.textContent, /AI CRM/, 'Hero should mention AI CRM');
    assert.match(hero.textContent, /Beauty Clinics/, 'Hero should mention Beauty Clinics');
  });

  await t.test('1b. "/" has all required sections', async () => {
    const app = await loadPublicApp({
      pathName: '/',
      routes: {}
    });

    await waitFor(() => app.document.querySelector('[data-testid="saas-landing-page"]'));

    const requiredSections = [
      'saas-hero',
      'saas-pain-points',
      'saas-features',
      'saas-how-it-works',
      'saas-hitl-safety',
      'saas-pricing',
      'saas-demo',
      'saas-faq',
      'saas-final-cta'
    ];

    for (const sectionId of requiredSections) {
      const el = app.document.querySelector(`[data-testid="${sectionId}"]`);
      assert.ok(el, `Section [data-testid="${sectionId}"] must exist`);
    }
  });

  await t.test('1c. Hero has CTA buttons', async () => {
    const app = await loadPublicApp({
      pathName: '/',
      routes: {}
    });

    await waitFor(() => app.document.querySelector('[data-testid="saas-request-demo-cta"]'));
    const demoCta = app.document.querySelector('[data-testid="saas-request-demo-cta"]');
    assert.ok(demoCta, 'Request Demo CTA should exist');
    assert.match(demoCta.textContent, /Request Demo/);

    const pricingCta = app.document.querySelector('[data-testid="saas-pricing-cta"]');
    assert.ok(pricingCta, 'Pricing CTA should exist');
    assert.match(pricingCta.textContent, /View Pricing/);
  });

  await t.test('1d. Features section has all 8 features', async () => {
    const app = await loadPublicApp({
      pathName: '/',
      routes: {}
    });

    await waitFor(() => app.document.querySelector('[data-testid="saas-features"]'));
    const featuresSection = app.document.querySelector('[data-testid="saas-features"]');
    const featureCards = featuresSection.querySelectorAll('.saas-feature-card');
    assert.equal(featureCards.length, 8, 'Should have 8 feature cards');

    // Verify key feature names
    const text = featuresSection.textContent;
    assert.match(text, /AI CRM/);
    assert.match(text, /LINE Automation/);
    assert.match(text, /Human-in-the-Loop/);
    assert.match(text, /Clinic Website/);
    assert.match(text, /Multi-Clinic/);
    assert.match(text, /Audit Trail/);
  });

  await t.test('1e. Pricing section has 3 packages', async () => {
    const app = await loadPublicApp({
      pathName: '/',
      routes: {}
    });

    await waitFor(() => app.document.querySelector('[data-testid="saas-pricing"]'));
    const pricingSection = app.document.querySelector('[data-testid="saas-pricing"]');
    const pricingCards = pricingSection.querySelectorAll('.saas-pricing-card');
    assert.equal(pricingCards.length, 3, 'Should have 3 pricing cards');

    const text = pricingSection.textContent;
    assert.match(text, /Starter/, 'Should have Starter plan');
    assert.match(text, /Growth/, 'Should have Growth plan');
    assert.match(text, /Enterprise/, 'Should have Enterprise plan');
    assert.match(text, /9,900/, 'Should show Starter price');
    assert.match(text, /19,900/, 'Should show Growth price');
  });

  await t.test('1f. HITL safety section has approval content', async () => {
    const app = await loadPublicApp({
      pathName: '/',
      routes: {}
    });

    await waitFor(() => app.document.querySelector('[data-testid="saas-hitl-safety"]'));
    const hitlSection = app.document.querySelector('[data-testid="saas-hitl-safety"]');
    const text = hitlSection.textContent;
    assert.match(text, /Human Approval Gate/, 'Should have Human Approval Gate heading');
    assert.match(text, /Safety First/, 'Should have Safety First badge');
    assert.match(text, /audit trail/, 'Should mention audit trail');
  });

  // =========================================================================
  // 2. "/pricing" renders SaaS landing with pricing section
  // =========================================================================
  await t.test('2. "/pricing" renders SaaS landing with pricing section', async () => {
    const app = await loadPublicApp({
      pathName: '/pricing',
      routes: {}
    });

    await waitFor(() => app.document.querySelector('[data-testid="saas-landing-page"]'));
    const landing = app.document.querySelector('[data-testid="saas-landing-page"]');
    assert.ok(landing, 'SaaS landing should render on /pricing');

    const pricing = app.document.querySelector('[data-testid="saas-pricing"]');
    assert.ok(pricing, 'Pricing section should exist');

    // Verify NO clinic resolver API was called
    const clinicRequests = app.requests.filter(r => r.url.pathname.includes('/public/clinics/pricing'));
    assert.equal(clinicRequests.length, 0, 'Should NOT call /public/clinics/pricing');
  });

  // =========================================================================
  // 3. "/demo" renders SaaS landing with demo section
  // =========================================================================
  await t.test('3. "/demo" renders SaaS landing with demo section', async () => {
    const app = await loadPublicApp({
      pathName: '/demo',
      routes: {}
    });

    await waitFor(() => app.document.querySelector('[data-testid="saas-landing-page"]'));
    const landing = app.document.querySelector('[data-testid="saas-landing-page"]');
    assert.ok(landing, 'SaaS landing should render on /demo');

    const demo = app.document.querySelector('[data-testid="saas-demo"]');
    assert.ok(demo, 'Demo section should exist');

    const form = app.document.querySelector('[data-testid="saas-demo-form"]');
    assert.ok(form, 'Demo form should exist');

    // Verify NO clinic resolver API was called
    const clinicRequests = app.requests.filter(r => r.url.pathname.includes('/public/clinics/demo'));
    assert.equal(clinicRequests.length, 0, 'Should NOT call /public/clinics/demo');
  });

  // =========================================================================
  // 4. "/contact" renders SaaS landing with contact/demo section
  // =========================================================================
  await t.test('4. "/contact" renders SaaS landing with contact section', async () => {
    const app = await loadPublicApp({
      pathName: '/contact',
      routes: {}
    });

    await waitFor(() => app.document.querySelector('[data-testid="saas-landing-page"]'));
    const landing = app.document.querySelector('[data-testid="saas-landing-page"]');
    assert.ok(landing, 'SaaS landing should render on /contact');

    const contact = app.document.querySelector('[data-testid="saas-contact"]');
    assert.ok(contact, 'Contact section should exist');

    // Verify NO clinic resolver API was called
    const clinicRequests = app.requests.filter(r => r.url.pathname.includes('/public/clinics/contact'));
    assert.equal(clinicRequests.length, 0, 'Should NOT call /public/clinics/contact');
  });

  // =========================================================================
  // 5. Demo form submission shows success
  // =========================================================================
  await t.test('5. Demo form submit shows success message', async () => {
    const app = await loadPublicApp({
      pathName: '/demo',
      routes: {}
    });

    await waitFor(() => app.document.querySelector('[data-testid="saas-demo-form"]'));

    // Fill in required fields
    const clinicNameInput = app.document.querySelector('#demo-clinic-name');
    const contactNameInput = app.document.querySelector('#demo-contact-name');

    assert.ok(clinicNameInput, 'Clinic name input should exist');
    assert.ok(contactNameInput, 'Contact name input should exist');

    // Simulate form field changes
    clinicNameInput.value = 'Test Clinic';
    clinicNameInput.dispatchEvent(new app.window.Event('input', { bubbles: true }));
    contactNameInput.value = 'Test User';
    contactNameInput.dispatchEvent(new app.window.Event('input', { bubbles: true }));

    // Submit the form
    const submitBtn = app.document.querySelector('[data-testid="saas-demo-submit"]');
    assert.ok(submitBtn, 'Submit button should exist');
    submitBtn.click();

    // Wait for success message
    await waitFor(() => app.document.querySelector('[data-testid="saas-demo-success"]'));
    const success = app.document.querySelector('[data-testid="saas-demo-success"]');
    assert.ok(success, 'Success message should appear');
    assert.match(success.textContent, /Demo request captured locally/, 'Should show local-only message');
  });

  // =========================================================================
  // 6. "/blog" still renders blog, NOT SaaS landing
  // =========================================================================
  await t.test('6. "/blog" still renders blog page', async () => {
    const app = await loadPublicApp({
      pathName: '/blog',
      routes: {
        'GET /blog/posts': { status: 200, body: { posts: [], total: 0 } }
      }
    });

    await waitFor(() => app.document.querySelector('.blog-header') || app.document.querySelector('[data-testid="saas-landing-page"]'));
    const landing = app.document.querySelector('[data-testid="saas-landing-page"]');
    assert.equal(landing, null, 'SaaS landing should NOT render on /blog');
  });

  // =========================================================================
  // 7. "/forum" still renders forum, NOT SaaS landing
  // =========================================================================
  await t.test('7. "/forum" still renders forum page', async () => {
    const app = await loadPublicApp({
      pathName: '/forum',
      routes: {
        'GET /forum/topics': { status: 200, body: { topics: [], total: 0 } }
      }
    });

    await waitFor(() => app.document.querySelector('.forum-header') || app.document.querySelector('[data-testid="saas-landing-page"]'));
    const landing = app.document.querySelector('[data-testid="saas-landing-page"]');
    assert.equal(landing, null, 'SaaS landing should NOT render on /forum');
  });

  // =========================================================================
  // 8. "/:clinicSlug" renders clinic shell, NOT SaaS landing
  // =========================================================================
  await t.test('8. "/:clinicSlug" renders clinic shell, not SaaS landing', async () => {
    const mockClinicResponse = {
      clinic: {
        id: 1001,
        name: 'Clinic Alpha Premium',
        slug: 'clinic-alpha',
        plan: 'starter',
        status: 'active',
        timezone: 'Asia/Bangkok'
      },
      websiteSettings: {
        websiteStatus: 'active',
        tagline: 'Premium skincare expert'
      },
      brandingSettings: {},
      contactSettings: {
        phone: '089-999-9999',
        email: 'alpha@clinic.com'
      },
      locationSettings: {
        province: 'Bangkok',
        country: 'Thailand'
      },
      homepageSections: [],
      isPubliclyRenderable: true
    };

    const app = await loadPublicApp({
      pathName: '/clinic-alpha',
      routes: {
        'GET /public/clinics/clinic-alpha': { status: 200, body: mockClinicResponse }
      }
    });

    await waitFor(() => app.document.querySelector('[data-testid="clinic-public-shell"]'));
    const clinicShell = app.document.querySelector('[data-testid="clinic-public-shell"]');
    assert.ok(clinicShell, 'Clinic shell should render');

    const saasLanding = app.document.querySelector('[data-testid="saas-landing-page"]');
    assert.equal(saasLanding, null, 'SaaS landing should NOT render on clinic slug');
  });

  // =========================================================================
  // 9. Platform header has SaaS navigation links
  // =========================================================================
  await t.test('9. Platform header has SaaS navigation links', async () => {
    const app = await loadPublicApp({
      pathName: '/',
      routes: {}
    });

    await waitFor(() => app.document.querySelector('[data-testid="saas-landing-page"]'));
    const header = app.document.querySelector('.header-glass');
    assert.ok(header, 'Header should exist');

    const navText = header.textContent;
    assert.match(navText, /Pricing/, 'Nav should have Pricing link');
    assert.match(navText, /Demo/, 'Nav should have Demo link');
    assert.match(navText, /Contact/, 'Nav should have Contact link');
  });

  // =========================================================================
  // 10. FAQ section is interactive (accordion)
  // =========================================================================
  await t.test('10. FAQ section has collapsible items', async () => {
    const app = await loadPublicApp({
      pathName: '/',
      routes: {}
    });

    await waitFor(() => app.document.querySelector('[data-testid="saas-faq"]'));
    const faqSection = app.document.querySelector('[data-testid="saas-faq"]');
    const faqItems = faqSection.querySelectorAll('.saas-faq-item');
    assert.ok(faqItems.length >= 5, 'Should have at least 5 FAQ items');

    // First item should NOT be open by default
    const firstItem = faqItems[0];
    assert.ok(!firstItem.classList.contains('open'), 'FAQ item should be closed by default');

    // Click to open
    const question = firstItem.querySelector('.saas-faq-question');
    question.click();

    // Wait for class toggle
    await waitFor(() => firstItem.classList.contains('open'));
    assert.ok(firstItem.classList.contains('open'), 'FAQ item should open after click');
  });

  // =========================================================================
  // 11. Bundle files not committed
  // =========================================================================
  await t.test('11. Bundle files exist locally after build', () => {
    const publicBundlePath = path.resolve(__dirname, '..', 'apps', 'web', 'dist', 'assets', 'public.bundle.js');
    const adminBundlePath = path.resolve(__dirname, '..', 'apps', 'web', 'dist', 'assets', 'admin.bundle.js');
    assert.ok(fs.existsSync(publicBundlePath), 'public.bundle.js should exist after build');
    assert.ok(fs.existsSync(adminBundlePath), 'admin.bundle.js should exist after build');
  });

  // =========================================================================
  // 12. How It Works section has 6 steps
  // =========================================================================
  await t.test('12. How It Works section has 6 steps', async () => {
    const app = await loadPublicApp({
      pathName: '/',
      routes: {}
    });

    await waitFor(() => app.document.querySelector('[data-testid="saas-how-it-works"]'));
    const section = app.document.querySelector('[data-testid="saas-how-it-works"]');
    const steps = section.querySelectorAll('.saas-flow-step');
    assert.equal(steps.length, 6, 'Should have 6 flow steps');
  });

  // =========================================================================
  // 13. Pain Points section has 5 cards
  // =========================================================================
  await t.test('13. Pain Points section has 5 cards', async () => {
    const app = await loadPublicApp({
      pathName: '/',
      routes: {}
    });

    await waitFor(() => app.document.querySelector('[data-testid="saas-pain-points"]'));
    const section = app.document.querySelector('[data-testid="saas-pain-points"]');
    const cards = section.querySelectorAll('.saas-pain-card');
    assert.equal(cards.length, 5, 'Should have 5 pain point cards');
  });
});
