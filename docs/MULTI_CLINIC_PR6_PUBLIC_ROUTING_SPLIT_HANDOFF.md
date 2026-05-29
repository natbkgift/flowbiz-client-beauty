# PR 6 Handoff - Public Routing Split `/` vs `/:clinicSlug`

This document details the goal, scope, routing behavior, integration rules, UI states, testing suite, validation steps, residual risks, and future roadmap recommendations for PR 6.

---

## Goal

Split the public SPA route behavior so that the root path `/` renders a platform marketing landing placeholder and any `/:clinicSlug` dynamically resolves and loads clinic configurations through the public resolver API from PR 5.

---

## Scope

Files modified and added in this PR:

- **[MODIFIED]** `apps/web/src/public-app.jsx` — Added route parser helpers, public API client method, platform landing placeholder, clinic public shell, and updated SPA router integration.
- **[MODIFIED]** `scripts/validate.js` — Updated files checklist and syntax check paths to include the PR 6 test suite and handoff documentation.
- **[NEW]** `tests/public_routing_split.test.js` — Comprehensive JSDOM integration test suite covering route extraction, shell loading, unpublished drafts, and legacy paths.
- **[NEW]** `docs/MULTI_CLINIC_PR6_PUBLIC_ROUTING_SPLIT_HANDOFF.md` — This handoff document.

---

## Public Route Behavior

The client-side React SPA router divides all requests into two routing spaces based on URL pathname segments:

```
[Browser Pathname] ──> [Routing Parser]
                             │
                             ├─► Path matches PLATFORM_PUBLIC_PATHS?
                             │     ├─► Yes ──► Platform/SaaS Landing Placeholder (/) or legacy blog/forum
                             │     └─► No  ──► Clinic Public Shell (/:clinicSlug)
```

### 1. Platform Landing Space
- `/` serves a clean, minimalist platform landing placeholder outlining FlowBiz Beauty's SaaS value proposition.
- Test ID: `public-platform-landing`

### 2. Clinic Space
- `/:clinicSlug` serves the clinic public shell component which queries the public API for the clinic settings.
- Test ID: `clinic-public-shell`

---

## Clinic Slug Extraction Rules

A client-side utility `extractClinicSlugFromPathname(pathname)` extracts and identifies valid clinic slugs:

1. **First Segment Rule**: The first path segment is treated as the `clinicSlug` candidate.
2. **Platform Path Protection**: The candidate is rejected and returns `null` if the normalized path matches `PLATFORM_PUBLIC_PATHS` or starts with any of the `PLATFORM_PREFIXES`.
3. **Protected Paths Protected**:
  - `/blog`, `/blog/*`
  - `/forum`, `/forum/*`
  - `/admin`, `/admin/*`
  - `/api`, `/api/*`
  - `/public`, `/public/*`
  - `/health`, `/healthz`, `/live`, `/ready`
  - `/assets`, `/static`
  - `/pricing`, `/pricing/`
  - `/demo`, `/demo/`
  - `/contact`, `/contact/`
  - `/support`, `/support/`
  - `/terms`, `/terms/`
  - `/privacy`, `/privacy/`

This guarantees that visitors navigating to `/blog`, `/forum`, `/pricing`, `/demo` etc. are never treated as clinic slugs and never trigger queries to `/public/clinics/...`.

---

## API Integration

Inside the public SPA, a clean API fetch method is introduced:

```javascript
async function getPublicClinicBySlug(slug) {
  const url = `${API_BASE}/public/clinics/${encodeURIComponent(slug)}`;
  // Fetches public clinic config by slug directly
}
```

This method is invoked dynamically by the `ClinicPublicShell` component on mount or whenever the slug changes.

---

## UI States

The dynamic `ClinicPublicShell` supports all required states:

| State | Triggers When | Visual Content & Test ID |
|---|---|---|
| **Loading** | API request is in progress | Displays `กำลังโหลดข้อมูลคลินิก...`<br/>Test ID: `clinic-loading-state` |
| **Success (Renderable)** | API returns 200, clinic active & website active | Displays name, tagline, contacts, location, homepage sections.<br/>Test ID: `clinic-public-shell` |
| **Success (Draft/Unpublished)** | API returns 200, clinic active but website draft | Displays shell with unpublished notice banner.<br/>Test ID: `clinic-unpublished-notice` |
| **Not Found (404)** | API returns 404 CLINIC_NOT_FOUND | Displays not found page.<br/>Test ID: `clinic-not-found` |
| **Error** | API returns 500 or connection fails | Displays generic error state. |

---

## Tests Added

File: `tests/public_routing_split.test.js`

Contains 8 targeted integration sub-tests using a compiled public JSDOM app environment:
1. **Platform Landing Placeholder**: Asserts `/` correctly renders the `public-platform-landing` test ID.
2. **Clinic Shell Rendering**: Asserts that `/:clinicSlug` dynamically requests clinic configuration and renders all required data and test IDs.
3. **Nested Extraction**: Asserts that `/clinic-alpha/services` extracts `clinic-alpha` and successfully calls the API for `clinic-alpha`.
4. **Clinic Not Found**: Asserts that a 404 API response renders the `clinic-not-found` state.
5. **Draft/Unpublished Clinic**: Asserts that a response with `isPubliclyRenderable=false` renders the `clinic-unpublished-notice` banner while displaying the draft clinic name.
6. **Platform Guard Protection (Blog)**: Asserts that `/blog` loads the legacy blog page and never triggers clinic resolver calls for `/public/clinics/blog`.
7. **Platform Guard Protection (Forum)**: Asserts that `/forum` and `/forum/some-topic` preserve legacy forum pages and never trigger clinic resolver calls for `/public/clinics/forum`.
8. **Platform Guard Protection (Pricing/Demo)**: Asserts that `/pricing` and `/demo` protect platform routes, never trigger clinic resolver, and render safely without crashing.

---

## What This PR Does Not Do

- **Does NOT build a full SaaS Landing Page** — Deferred to PR 7.
- **Does NOT render full clinic website templates** — Deferred to PR 8.
- **Does NOT implement services, promotions, packages, or booking interfaces** — Deferred to PR 10/14.
- **Does NOT add database migrations** — All schema remains from PR 1.
- **Does NOT modify Web Server fallback routing** — Minimal check confirmed that `server.js` serves SPA index perfectly for extensionless routes.
- **Does NOT commit generated bundle files** — `apps/web/dist/assets/` was fully reverted before committing.

---

## Validation

Syntax validation:
```powershell
node scripts/validate.js
```
*Result: Passed!*

Run integration tests:
```powershell
node tests/public_routing_split.test.js
```
*Result: Passed! (8 sub-tests, 9 passing assertions, 100% success)*

Full test suite execution:
```powershell
$env:LINE_INTEGRATION_MODE="simulated"; $env:AI_PROVIDER="mock"; $env:AI_REAL_GENERATION_ENABLED="false"; $env:LINE_REAL_SEND_ENABLED="false"; npm test
```
*Result: All 37 test suites passed!*

---

## Residual Risks

- **Platform Landing Copy**: The platform landing page is a simple text placeholder; visitors will only see a marketing outline until PR 7.
- **Transitional Blog/Forum**: The global `/blog` and `/forum` routes remain unified at the platform level; routing them dynamically to clinic-specific spaces is deferred to PR 8 and PR 13.
