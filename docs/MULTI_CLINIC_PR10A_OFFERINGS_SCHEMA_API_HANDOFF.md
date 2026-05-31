# MULTI_CLINIC_PR10A: Services / Promotions / Packages Schema & API Handoff

## Goal

Add tenant-scoped database schema and backend APIs for clinic services, promotions, and packages.
This provides the foundation for PR 10B to render real offerings data in the Admin UI and Public Clinic Website (replacing placeholders from PR 8).

---

## Scope

- Database migration for services, promotions, packages, and package-service links
- Admin CRUD + reorder API for all three entity types
- Package-service linking endpoints
- Public read-only endpoints for active offerings by clinic slug
- Tenant-scoped permission guard and validation
- Summary-only audit logging for all mutations
- Admin API tests and public API tests
- This handoff documentation

---

## Database Schema

Migration: `database/migrations/039_services_promotions_packages.sql`

### `clinic_services`

| Column | Type | Notes |
|---|---|---|
| id | bigserial PK | |
| clinic_id | bigint FK → clinics | ON DELETE CASCADE |
| service_key | varchar(120) | Unique per clinic |
| name | varchar(200) | Required |
| slug | varchar(160) | Unique per clinic |
| category | varchar(120) | Optional |
| short_description | text | Optional |
| description | text | Optional |
| duration_minutes | integer | ≥ 0 |
| price_min | numeric(12,2) | ≥ 0 |
| price_max | numeric(12,2) | ≥ price_min |
| currency | varchar(10) | Default: THB |
| status | varchar(30) | draft / active / inactive / archived |
| is_featured | boolean | Default: false |
| sort_order | integer | Default: 0 |
| image_url | text | http/https only |
| metadata_json | jsonb | Must be JSON object |
| created_at / updated_at | timestamptz | |

Indexes: `clinic_id`, `(clinic_id, status)`, `(clinic_id, is_featured)`, `(clinic_id, sort_order)`

### `clinic_promotions`

| Column | Type | Notes |
|---|---|---|
| id | bigserial PK | |
| clinic_id | bigint FK → clinics | ON DELETE CASCADE |
| promotion_key | varchar(120) | Unique per clinic |
| title | varchar(200) | Required |
| slug | varchar(160) | Unique per clinic |
| subtitle | varchar(250) | Optional |
| description | text | Optional |
| badge_label | varchar(80) | Optional |
| starts_at | timestamptz | Optional |
| ends_at | timestamptz | ≥ starts_at |
| status | varchar(30) | draft / active / inactive / archived |
| is_featured | boolean | Default: false |
| sort_order | integer | Default: 0 |
| image_url | text | http/https only |
| cta_label | varchar(120) | Optional |
| cta_url | text | http/https only |
| metadata_json | jsonb | Must be JSON object |
| created_at / updated_at | timestamptz | |

### `clinic_packages`

| Column | Type | Notes |
|---|---|---|
| id | bigserial PK | |
| clinic_id | bigint FK → clinics | ON DELETE CASCADE |
| package_key | varchar(120) | Unique per clinic |
| name | varchar(200) | Required |
| slug | varchar(160) | Unique per clinic |
| summary | text | Optional |
| description | text | Optional |
| price | numeric(12,2) | ≥ 0 |
| currency | varchar(10) | Default: THB |
| status | varchar(30) | draft / active / inactive / archived |
| is_featured | boolean | Default: false |
| sort_order | integer | Default: 0 |
| image_url | text | http/https only |
| metadata_json | jsonb | Must be JSON object |
| created_at / updated_at | timestamptz | |

### `clinic_package_services` (junction)

| Column | Type | Notes |
|---|---|---|
| id | bigserial PK | |
| clinic_id | bigint FK → clinics | ON DELETE CASCADE |
| package_id | bigint FK → clinic_packages | ON DELETE CASCADE |
| service_id | bigint FK → clinic_services | ON DELETE RESTRICT |
| quantity | integer | > 0, Default: 1 |
| sort_order | integer | Default: 0 |
| created_at | timestamptz | |

Unique constraint: `(clinic_id, package_id, service_id)`

> **Note**: `clinic_id` is stored in the junction table to enforce tenant boundary at the DB level and for cross-tenant validation in the service layer.

---

## Admin API Endpoints

All admin endpoints require authentication and appropriate role membership.

### Services

| Method | Path | Description |
|---|---|---|
| GET | `/admin/clinic-offerings/services` | List all services for current clinic |
| POST | `/admin/clinic-offerings/services` | Create service |
| GET | `/admin/clinic-offerings/services/:id` | Get single service |
| PATCH | `/admin/clinic-offerings/services/:id` | Update service |
| DELETE | `/admin/clinic-offerings/services/:id` | Delete service |
| PATCH | `/admin/clinic-offerings/services/reorder` | Reorder services |

### Promotions

| Method | Path | Description |
|---|---|---|
| GET | `/admin/clinic-offerings/promotions` | List all promotions for current clinic |
| POST | `/admin/clinic-offerings/promotions` | Create promotion |
| GET | `/admin/clinic-offerings/promotions/:id` | Get single promotion |
| PATCH | `/admin/clinic-offerings/promotions/:id` | Update promotion |
| DELETE | `/admin/clinic-offerings/promotions/:id` | Delete promotion |
| PATCH | `/admin/clinic-offerings/promotions/reorder` | Reorder promotions |

### Packages

| Method | Path | Description |
|---|---|---|
| GET | `/admin/clinic-offerings/packages` | List all packages for current clinic |
| POST | `/admin/clinic-offerings/packages` | Create package |
| GET | `/admin/clinic-offerings/packages/:id` | Get single package |
| PATCH | `/admin/clinic-offerings/packages/:id` | Update package |
| DELETE | `/admin/clinic-offerings/packages/:id` | Delete package |
| PATCH | `/admin/clinic-offerings/packages/reorder` | Reorder packages |
| POST | `/admin/clinic-offerings/packages/:id/services` | Add service to package |
| DELETE | `/admin/clinic-offerings/packages/:id/services/:serviceId` | Remove service from package |
| PATCH | `/admin/clinic-offerings/packages/:id/services/reorder` | Reorder services within package |

---

## Public API Endpoints

No authentication required. Returns only `status = active` items for active clinics.

| Method | Path | Description |
|---|---|---|
| GET | `/public/clinics/:slug/services` | List active services for clinic |
| GET | `/public/clinics/:slug/promotions` | List active promotions for clinic |
| GET | `/public/clinics/:slug/packages` | List active packages for clinic |

**Rules:**
- Clinic must have `status = 'active'` → otherwise 404 (no existence leak)
- Only items with `status = 'active'` are returned
- Sorted: `is_featured DESC, sort_order ASC, id ASC`
- Public response omits: `clinicId`, `metadata`, full `description`, `createdAt`, `updatedAt`
- Unknown/invalid/inactive clinic always returns `404 CLINIC_NOT_FOUND`

---

## Permission Model

| Role | Read | Write |
|---|---|---|
| owner | ✅ | ✅ |
| manager | ✅ | ✅ |
| marketing | ✅ | ✅ |
| sales | ✅ | ❌ |
| staff | ✅ | ❌ |

---

## Tenant Isolation

> [!IMPORTANT]
> All tenant isolation is enforced through the authenticated session context — **never** from request body.

- `clinicId` and `clinic_id` in request bodies or query strings are rejected with `400 INVALID_REQUEST`
- Every query filters by `clinic_id = context.currentClinic.id`
- Update/delete/reorder operations validate that the target record belongs to the current clinic
- Cross-tenant access → `403 CROSS_TENANT_FORBIDDEN`
- Missing record → `404 SERVICE_NOT_FOUND` / `PROMOTION_NOT_FOUND` / `PACKAGE_NOT_FOUND`
- Package-service link verifies service and package belong to the same clinic before insert

---

## Validation Rules

### Shared
- `name`, `title`, `slug`, `key` are trimmed
- `slug` auto-generated from name/title using lowercase kebab normalization
- `key` auto-generated from name/title using lowercase snake normalization
- `status` must be: `draft`, `active`, `inactive`, `archived`
- `metadata` must be a JSON object (not array, not null, not string)
- `metadata_json` is also constrained as a JSON object in the database schema
- `imageUrl`, `ctaUrl` must be `http://` or `https://` or empty/null
- `data:`, `javascript:`, `file:` URLs are rejected with `INVALID_OFFERING_URL`

### Services
- `name` required
- `priceMin`, `priceMax` numeric >= 0; `priceMax >= priceMin` if both provided
- `durationMinutes` integer >= 0

### Promotions
- `title` required
- `startsAt`, `endsAt` must be valid dates if provided
- `endsAt >= startsAt` if both provided

### Packages
- `name` required
- `price` numeric >= 0

### Package-service links
- `serviceId` must exist and belong to the same clinic

---

## Audit Logging

All mutation endpoints create audit log entries via `recordAuditLog`. Logs are **summary-only** — no raw descriptions, pricing, or metadata are stored in audit context.

### Audit action types
```
clinic_service.created
clinic_service.updated
clinic_service.deleted
clinic_services.reordered

clinic_promotion.created
clinic_promotion.updated
clinic_promotion.deleted
clinic_promotions.reordered

clinic_package.created
clinic_package.updated
clinic_package.deleted
clinic_packages.reordered
clinic_package_service.added
clinic_package_service.removed
clinic_package_services.reordered
```

### Audit context structure
```js
{
  summary: {
    entity: 'service' | 'promotion' | 'package',
    entityId: number,
    changedFields: string[],   // keys from request body only
    source: 'clinic_offerings_admin_api'
  }
}
```

> [!CAUTION]
> Raw description, metadata, pricing, or any PII **must never** be logged in audit context. Only changedFields keys (not values) are captured.

---

## Tests Added

| File | Coverage |
|---|---|
| `tests/clinic_offerings_admin_api.test.js` | Auth required, owner CRUD, permission guard, price validation, URL validation, reorder (404/403), clinicId body rejection, audit log verification, metadata validation |
| `tests/public_clinic_offerings_api.test.js` | Active-only filtering, draft/inactive/archived hidden, unknown clinic 404, inactive clinic 404, sorting order, public response field restrictions |

---

## What This PR Does Not Do

- ❌ No Admin UI for managing services/promotions/packages
- ❌ No Public Clinic Template rendering changes (PR 8 placeholders remain unchanged)
- ❌ No booking or appointment flow
- ❌ No payment or checkout
- ❌ No member portal
- ❌ No file/image upload endpoints
- ❌ No deployment
- ❌ No LINE/AI integration changes
- ❌ No SaaS Landing Page changes

---

## Validation

```powershell
node scripts/validate.js
node tests/clinic_offerings_admin_api.test.js
node tests/public_clinic_offerings_api.test.js
node tests/clinic_website_admin_api.test.js
node tests/public_clinic_template.test.js
```

Full test suite:
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

---

## Residual Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Public rendering not wired | Low | Will be done in PR 10B |
| Admin UI not built | Low | Will be done in PR 10B |
| Package-service cross-clinic check is service layer only | Medium | DB-level `clinic_id` in junction table provides defence-in-depth |
| slug/key uniqueness collision under concurrent creates | Low | Unique DB constraint returns conflict error; retry logic deferred to PR 10B UI |
| No image upload yet | Low | Only URL references supported; upload deferred |

---

## Next PR Recommendation

**PR 10B: Services / Promotions / Packages Admin UI + Public Rendering**

- Build Admin UI pages for managing clinic offerings (list, create, edit, reorder)
- Wire public clinic website template to display real services/promotions/packages from the new API
- Replace placeholder sections in PR 8 template with live data from `/public/clinics/:slug/services`, `/promotions`, `/packages`
- Add PR 10B handoff documentation
