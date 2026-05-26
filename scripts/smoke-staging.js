const DEFAULT_BASE_URL = 'http://localhost:4173';
const DEFAULT_API_BASE_URL = 'http://localhost:3001';

function toBoolean(value, fallback = false) {
  if (value === undefined) {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function normalizeBaseUrl(value, fallback) {
  const raw = String(value || fallback).trim().replace(/\/+$/, '');
  try {
    return new URL(raw).toString().replace(/\/+$/, '');
  } catch (error) {
    throw new Error(`Invalid URL: ${raw}`);
  }
}

function joinUrl(baseUrl, path) {
  return `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

function printResult(results, name, status, detail = '') {
  results.push({ name, status, detail });
  const suffix = detail ? ` - ${detail}` : '';
  process.stdout.write(`[${status.toUpperCase()}] ${name}${suffix}\n`);
}

async function requestJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number.parseInt(process.env.SMOKE_TIMEOUT_MS || '10000', 10));

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        ...(options.headers || {})
      }
    });
    const text = await response.text();
    let body = null;

    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }

    return { response, body };
  } finally {
    clearTimeout(timer);
  }
}

async function requestText(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number.parseInt(process.env.SMOKE_TIMEOUT_MS || '10000', 10));

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    return { response, text };
  } finally {
    clearTimeout(timer);
  }
}

function assertSafeFlags(results) {
  const lineRealSend = toBoolean(process.env.LINE_REAL_SEND_ENABLED, false);
  const aiRealGeneration = toBoolean(process.env.AI_REAL_GENERATION_ENABLED, false);

  if (lineRealSend) {
    throw new Error('LINE_REAL_SEND_ENABLED must not be true for staging smoke tests.');
  }

  if (aiRealGeneration) {
    throw new Error('AI_REAL_GENERATION_ENABLED must not be true for staging smoke tests.');
  }

  printResult(results, 'external send flags', 'pass', 'LINE real send and AI real generation are disabled');
}

async function checkApiReadiness(results, apiBaseUrl) {
  const readyUrl = joinUrl(apiBaseUrl, '/ready');
  const { response, body } = await requestJson(readyUrl);

  if (response.status !== 200 || body?.database?.status !== 'connected') {
    throw new Error(`API readiness failed at ${readyUrl}: HTTP ${response.status}`);
  }

  printResult(results, 'api readiness', 'pass', `${readyUrl} HTTP ${response.status}`);
}

async function checkWeb(results, baseUrl) {
  for (const path of ['/', '/admin']) {
    const url = joinUrl(baseUrl, path);
    const { response, text } = await requestText(url);

    if (response.status !== 200 || !text.includes('__FLOWBIZ_WEB_CONFIG__')) {
      throw new Error(`Web route failed at ${url}: HTTP ${response.status}`);
    }

    printResult(results, `web ${path}`, 'pass', `${url} HTTP ${response.status}`);
  }
}

async function checkAssets(results, baseUrl) {
  for (const path of ['/assets/admin.bundle.js', '/assets/public.bundle.js']) {
    const url = joinUrl(baseUrl, path);
    const { response, text } = await requestText(url);

    if (response.status !== 200 || text.length < 1000) {
      throw new Error(`Asset check failed at ${url}: HTTP ${response.status}`);
    }

    printResult(results, `asset ${path}`, 'pass', `${url} HTTP ${response.status}`);
  }
}

async function checkLoginBehavior(results, apiBaseUrl) {
  const url = joinUrl(apiBaseUrl, '/auth/login');
  const { response, body } = await requestJson(url, {
    method: 'POST',
    body: JSON.stringify({})
  });

  if (![400, 401].includes(response.status) || !body?.error?.code) {
    throw new Error(`Login behavior check failed at ${url}: HTTP ${response.status}`);
  }

  printResult(results, 'login endpoint behavior', 'pass', `${url} rejected invalid credentials with ${body.error.code}`);
}

async function checkDemoData(results, apiBaseUrl) {
  if (!toBoolean(process.env.EXPECT_DEMO_DATA, false)) {
    printResult(results, 'demo data visibility', 'warn', 'EXPECT_DEMO_DATA is not true; skipped demo login check');
    return;
  }

  const email = process.env.DEMO_EMAIL || 'owner.demo@flowbiz.local';
  const password = process.env.DEMO_PASSWORD || 'DemoPass123!';
  const clinicSlug = process.env.DEMO_CLINIC_SLUG || 'flowbiz-beauty-demo';
  const loginUrl = joinUrl(apiBaseUrl, '/auth/login');
  const loginResult = await requestJson(loginUrl, {
    method: 'POST',
    body: JSON.stringify({ email, password, clinicSlug })
  });

  if (loginResult.response.status !== 200 || !loginResult.body?.token) {
    throw new Error(`Demo login failed at ${loginUrl}: HTTP ${loginResult.response.status}`);
  }

  const contextUrl = joinUrl(apiBaseUrl, '/tenant-context');
  const contextResult = await requestJson(contextUrl, {
    headers: {
      authorization: ['Bearer', loginResult.body.token].join(' '),
      'x-clinic-slug': clinicSlug
    }
  });

  if (contextResult.response.status !== 200 || contextResult.body?.currentClinic?.slug !== clinicSlug) {
    throw new Error(`Demo tenant context failed at ${contextUrl}: HTTP ${contextResult.response.status}`);
  }

  printResult(results, 'demo data visibility', 'pass', `demo clinic ${clinicSlug} is reachable`);
}

async function run() {
  const results = [];
  const baseUrl = normalizeBaseUrl(process.env.BASE_URL, DEFAULT_BASE_URL);
  const apiBaseUrl = normalizeBaseUrl(process.env.API_BASE_URL, DEFAULT_API_BASE_URL);
  const dryRun = toBoolean(process.env.SMOKE_DRY_RUN, false);

  process.stdout.write(`Staging smoke target web: ${baseUrl}\n`);
  process.stdout.write(`Staging smoke target api: ${apiBaseUrl}\n`);

  assertSafeFlags(results);

  if (dryRun) {
    printResult(results, 'network checks', 'warn', 'SMOKE_DRY_RUN=true; live HTTP checks skipped');
    process.stdout.write(`Smoke summary: ${results.length} checks recorded, dry-run PASS\n`);
    return;
  }

  await checkApiReadiness(results, apiBaseUrl);
  await checkWeb(results, baseUrl);
  await checkAssets(results, baseUrl);
  await checkLoginBehavior(results, apiBaseUrl);
  await checkDemoData(results, apiBaseUrl);

  process.stdout.write(`Smoke summary: ${results.length} checks recorded, PASS\n`);
}

run().catch((error) => {
  process.stderr.write(`Smoke summary: FAIL - ${error.message}\n`);
  process.exit(1);
});
