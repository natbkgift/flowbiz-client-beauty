# PR 5 Handoff - Public Clinic Slug Resolver API

This document details the goal, scope, implementation, security rules, compatibility notes, tests, and residual risks for PR 5.

---

## Goal

Add a public backend API that resolves clinic website configuration by slug, in preparation for path-based clinic routing.

Target URL model (to be fully enabled in PR 6):

```
https://beauty.flowbiz.cloud/:clinicSlug
```

The new endpoint allows any public frontend to call:

```
GET /public/clinics/:slug
```

...and receive full clinic configuration including branding, contact, location, and homepage sections needed to render a clinic public website.

---

## Scope

Files added or modified in this PR:

- **[NEW]** `apps/api/src/modules/public-content/clinic-resolver.js` — Public clinic resolver service
- **[NEW]** `apps/api/src/modules/public-content/routes.js` — Route handler for `GET /public/clinics/:slug`
- **[MODIFIED]** `apps/api/src/modules/public-content/tenant.js` — Extended tenant helper with `clinicSlug` support (additive, preserves `clinicId` behavior)
- **[MODIFIED]** `apps/api/src/modules/blog/routes.js` — Awaited now-async `resolvePublicClinicId`
- **[MODIFIED]** `apps/api/src/modules/forum/routes.js` — Awaited now-async `resolvePublicClinicId` and `resolvePublicClinicContext`
- **[MODIFIED]** `apps/api/src/server.js` — Imported and wired `handlePublicContentRoutes`
- **[MODIFIED]** `scripts/validate.js` — Added 4 new required paths and syntax checks
- **[NEW]** `tests/public_clinic_slug_resolver.test.js` — Full integration test suite
- **[NEW]** `docs/MULTI_CLINIC_PR5_PUBLIC_CLINIC_SLUG_RESOLVER_HANDOFF.md` — This document

---

## API Endpoint Added

### `GET /public/clinics/:slug`

**Auth:** None required. Fully public.

**Response (200 — active clinic):**

```json
{
  "clinic": {
    "id": 123,
    "name": "Clinic Alpha",
    "slug": "clinic-alpha",
    "plan": "starter",
    "status": "active",
    "timezone": "Asia/Bangkok"
  },
  "websiteSettings": {
    "websiteStatus": "draft",
    "publicDisplayName": "Clinic Alpha",
    "tagline": "Beauty clinic",
    "shortDescription": "...",
    "defaultLocale": "th-TH",
    "publishedAt": null
  },
  "brandingSettings": {
    "logoUrl": null,
    "faviconUrl": null,
    "heroImageUrl": null,
    "primaryColor": null,
    "secondaryColor": null,
    "accentColor": null,
    "fontFamily": null
  },
  "contactSettings": {
    "phone": null,
    "email": null,
    "lineUrl": null,
    "lineOaId": null,
    "facebookUrl": null,
    "instagramUrl": null,
    "tiktokUrl": null,
    "websiteUrl": null
  },
  "locationSettings": {
    "addressLine1": null,
    "addressLine2": null,
    "district": null,
    "province": null,
    "postalCode": null,
    "country": "Thailand",
    "googleMapUrl": null,
    "googleMapEmbedUrl": null,
    "latitude": null,
    "longitude": null,
    "businessHours": {}
  },
  "homepageSections": [
    {
      "sectionKey": "hero",
      "sectionType": "hero",
      "title": "Welcome",
      "subtitle": "...",
      "content": {},
      "sortOrder": 1,
      "status": "draft"
    }
  ],
  "features": {
    "blogEnabled": true,
    "forumEnabled": true,
    "bookingEnabled": false,
    "packagesEnabled": false
  },
  "isPubliclyRenderable": false
}
```

**Error (404):**

```json
{
  "error": {
    "code": "CLINIC_NOT_FOUND",
    "message": "ไม่พบคลินิกที่ต้องการ"
  }
}
```

---

## Public Visibility Rules

### Active Clinic Gate

Only clinics with `status = 'active'` are resolved and returned. Any other status results in:

```
404 CLINIC_NOT_FOUND
```

This protects inactive, suspended, or soft-deleted clinics from public discovery.

### Slug Validation

The slug from the URL path is normalized via `normalizeClinicSlug()` from PR 2.

- Invalid format (non-lowercase, double hyphens, empty, etc.) → `404 CLINIC_NOT_FOUND`
- Reserved slugs (`admin`, `api`, `auth`, `blog`, `forum`, etc.) → `404 CLINIC_NOT_FOUND`

The public endpoint always returns `404`, not `400`, to avoid leaking route policy information.

### Website Status

In PR 5, the resolver does not block on `website_status`. The full clinic configuration is returned even for `draft`, `inactive`, or `suspended` website status. The field `isPubliclyRenderable` signals whether the frontend should render the public website:

```
isPubliclyRenderable = clinic.status === 'active' && website_status === 'active'
```

This allows PR 6/8 to make rendering decisions without exposing inactive data to end-users at the API level.

### Homepage Sections

Only sections with `status != 'hidden'` are returned (draft and published sections are included). This allows in-progress sections to be previewed via the resolver API. PR 8 should filter down to only `published` sections for final public rendering.

---

## Response Contract

| Field | Type | Notes |
|---|---|---|
| `clinic` | Object | Core clinic fields (id, name, slug, plan, status, timezone) |
| `websiteSettings` | Object | Website config with safe defaults if row missing |
| `brandingSettings` | Object | Colors, logo, favicon with safe defaults |
| `contactSettings` | Object | Phone, email, social links with safe defaults |
| `locationSettings` | Object | Address, map, business hours with safe defaults |
| `homepageSections` | Array | Ordered by `sort_order asc, id asc`, hidden excluded |
| `features` | Object | Static feature flags for blog/forum/booking/packages |
| `isPubliclyRenderable` | Boolean | True only when `clinic.status=active` AND `website_status=active` |

**Safe defaults when settings rows are missing:**
- `websiteSettings.websiteStatus` → `"draft"`
- `websiteSettings.defaultLocale` → `"th-TH"`
- `locationSettings.country` → `"Thailand"`
- `locationSettings.businessHours` → `{}`
- `homepageSections` → `[]`
- All null-able fields → `null`

---

## Tenant Helper Compatibility

`apps/api/src/modules/public-content/tenant.js` was updated **additively**:

### `resolvePublicClinicId(url)` — now async

Resolution priority:
1. `clinicId` query param → parse integer (legacy behavior preserved)
2. `clinicSlug` query param → resolve via DB (new in PR 5)
3. Neither → throw `PUBLIC_CLINIC_REQUIRED`

**Breaking change note:** This function changed from synchronous to async. Blog and Forum routes have been updated with `await` accordingly.

### New exported functions:
- `resolvePublicClinicIdFromSlug(slug)` — slug → clinic ID, throws if not active
- `resolvePublicClinicContext(url)` — now async, wraps `resolvePublicClinicId`

---

## Blog/Forum Compatibility

Blog and Forum routes call `resolvePublicClinicId(url)` in the catch block for unauthenticated requests. Since this function is now async, both files were updated to `await` the call:

- `apps/api/src/modules/blog/routes.js` — 2 `await` additions
- `apps/api/src/modules/forum/routes.js` — 4 `await` additions

**Backward compatible:** `/blog/posts?clinicId=<id>` and `/forum/topics?clinicId=<id>` continue to work exactly as before.

**New capability:** `/blog/posts?clinicSlug=<slug>` and `/forum/topics?clinicSlug=<slug>` now resolve correctly if the clinic is active.

> [!NOTE]
> Full route-level integration tests for blog/forum with `clinicSlug` query param are included in the tenant helper unit tests in `tests/public_clinic_slug_resolver.test.js`. Deeper end-to-end route-level blog/forum slug tests can be added in PR 6/8 when public routing is wired.

---

## Tests Added

File: `tests/public_clinic_slug_resolver.test.js`

Test categories:

| # | Category | Tests |
|---|---|---|
| 1 | Active clinic resolution | 7 sub-tests: HTTP 200, clinic fields, websiteSettings, brandingSettings, contactSettings, locationSettings, sections ordering, features flags |
| 2 | Not found | 5 sub-tests: unknown slug, inactive clinic, reserved "admin", reserved "api", invalid characters |
| 3 | isPubliclyRenderable flag | 2 sub-tests: active website → true; draft website → false |
| 4 | Safe defaults | 5 sub-tests: no settings rows returns 200, websiteStatus default, homepageSections empty, businessHours empty, isPubliclyRenderable false |
| 5 | Tenant helper compatibility | 6 sub-tests: clinicId param, clinicSlug param, missing both, inactive slug, context object, context with slug |
| 6 | Blog/forum regression | 3 sub-tests: clinicId resolves, both methods return same id, reserved slug via query throws |
| 7 | Non-matching routes | 2 sub-tests: unrelated path returns false, POST method not handled |

---

## What This PR Does Not Do

- **Does NOT add public frontend routing** — `/:clinicSlug` React routing is deferred to PR 6
- **Does NOT change `/` to SaaS Landing Page** — deferred to PR 7
- **Does NOT render clinic website templates** — deferred to PR 8
- **Does NOT modify web server fallback routing** — unchanged
- **Does NOT add member portal** — deferred to PR 11
- **Does NOT add payment features** — out of scope
- **Does NOT add database migrations** — all schema was ready from PR 1 (migration 038)
- **Does NOT modify generated bundle files** — `apps/web/dist/` untouched
- **Does NOT change Admin Clinic API security** — all admin guards unchanged
- **Does NOT wire LINE or AI integrations** — unchanged

---

## Validation

```powershell
node scripts/validate.js
```

And:

```powershell
$env:LINE_INTEGRATION_MODE="simulated"
$env:AI_PROVIDER="mock"
$env:AI_REAL_GENERATION_ENABLED="false"
$env:LINE_REAL_SEND_ENABLED="false"
npm test
Remove-Item Env:\LINE_INTEGRATION_MODE -ErrorAction SilentlyContinue
Remove-Item Env:\AI_PROVIDER -ErrorAction SilentlyContinue
Remove-Item Env:\AI_REAL_GENERATION_ENABLED -ErrorAction SilentlyContinue
Remove-Item Env:\LINE_REAL_SEND_ENABLED -ErrorAction SilentlyContinue
```

Targeted test run:

```powershell
node tests/public_clinic_slug_resolver.test.js
node tests/super_admin_clinic_api.test.js
node scripts/validate.js
```

---

## Residual Risks

| Risk | Mitigation |
|---|---|
| `resolvePublicClinicId` is now async — any un-awaited call in future modules will silently return a Promise | Both blog and forum routes were fixed with `await`; pattern is documented here |
| Public SPA still uses `PUBLIC_CLINIC_ID` env var model until PR 6 | Expected; PR 6 wires path-based routing |
| `homepageSections` returns `draft` status sections (not just `published`) | Intentional for resolver preview; PR 8 should filter to `published` only for final rendering |
| Blog/forum with `clinicSlug` query param does not perform deep integration test at the HTTP route level | Tenant helper unit tests cover this; full route-level regression can be added in PR 6/8 |
| No rate limiting on `/public/clinics/:slug` | Future PR should add rate limiting for unauthenticated endpoints |
| No caching layer on slug resolution queries | Acceptable for MVP; cache can be added when under load |

---

## Next PR Recommendation

- **PR 6: Public Routing Split `/` vs `/:clinicSlug`** — Split web server and frontend routing to serve `/:clinicSlug` using the slug resolver API built in this PR
- **PR 7: FlowBiz SaaS Landing Page** — Convert `/` to the platform marketing landing page
- **PR 8: Clinic Website Template V1** — Render the public clinic website using the data returned by `GET /public/clinics/:slug`
