# PR 3 Handoff - Super Admin Clinic API

This document details the features, security model, validation rules, tests, and documentation added in PR 3.

## Goal

Add backend API endpoints and service methods for Super Admin / Platform Admin users to manage clinics in the Multi-Clinic SaaS application. This enables administrators to:
1. List all clinics with search and status filters.
2. View detailed records of any clinic (including its basic settings, branding, contact info, location details, and homepage sections count/overview).
3. Provision new clinics alongside initial default website settings and homepage sections in a database transaction.
4. Modify clinic general information and website setting attributes.
5. Deactivate or reactivate clinics.
6. Automatically record detailed audit logs for all administrative write actions.

## Scope

- **Clinics Module Service**: `apps/api/src/modules/clinics/service.js`
- **Clinics Module Routes**: `apps/api/src/modules/clinics/routes.js`
- **Error Messages**: Added Thai descriptions in `apps/api/src/common/user-messages.js`
- **Integration Tests**: Added `tests/super_admin_clinic_api.test.js`
- **Validation Script**: Added files checking in `scripts/validate.js`

---

## API Endpoints

All admin endpoints are exposed under `/admin/clinics` and require authentication.

### 1. `GET /admin/clinics`
- **Query Params**:
  - `status` (optional): `'active'` or `'inactive'`
  - `search` (optional): Searches clinic name or slug using case-insensitive partial matching (`ilike`)
  - `limit` (optional): Limit results (1 to 100, default 50)
  - `offset` (optional): Offset results (default 0)
- **Response**:
  ```json
  {
    "items": [
      {
        "id": 1,
        "name": "Demo Clinic",
        "slug": "demo-clinic",
        "plan": "starter",
        "status": "active",
        "timezone": "Asia/Bangkok",
        "websiteStatus": "draft",
        "createdAt": "2026-05-29T00:00:00.000Z",
        "updatedAt": "2026-05-29T00:00:00.000Z"
      }
    ],
    "pagination": {
      "limit": 50,
      "offset": 0,
      "total": 1
    }
  }
  ```

### 2. `GET /admin/clinics/:id`
- **Response**: Returns basic clinic details joined with settings tables and homepage section metadata:
  ```json
  {
    "id": 1,
    "name": "Demo Clinic",
    "slug": "demo-clinic",
    "plan": "starter",
    "status": "active",
    "timezone": "Asia/Bangkok",
    "createdAt": "...",
    "updatedAt": "...",
    "websiteSettings": {
      "id": 1,
      "websiteStatus": "draft",
      "publicDisplayName": "Demo Clinic",
      "tagline": "Skin Care",
      "shortDescription": "...",
      "defaultLocale": "th-TH",
      "publishedAt": null,
      "createdAt": "...",
      "updatedAt": "..."
    },
    "brandingSettings": { ... },
    "contactSettings": { ... },
    "locationSettings": { ... },
    "homepageSections": [
      { "sectionKey": "hero", "sectionType": "hero", "title": "Welcome to our Clinic", "subtitle": "...", "sortOrder": 1, "status": "draft" }
    ]
  }
  ```

### 3. `POST /admin/clinics`
- **Payload Contract**:
  ```json
  {
    "name": "Clinic Alpha",
    "slug": "clinic-alpha", // Optional: generated from name if missing
    "plan": "starter", // Optional: default starter
    "status": "active", // Optional: default active
    "timezone": "Asia/Bangkok", // Optional: default Asia/Bangkok
    "tagline": "Beauty Clinic",
    "shortDescription": "Top tier clinic"
  }
  ```

### 4. `PATCH /admin/clinics/:id`
- **Payload Contract**:
  ```json
  {
    "name": "New Name",
    "slug": "new-slug",
    "plan": "pro",
    "timezone": "Asia/Bangkok",
    "publicDisplayName": "New Display Name",
    "tagline": "New tagline",
    "shortDescription": "New description"
  }
  ```

### 5. `PATCH /admin/clinics/:id/status`
- **Payload Contract**:
  ```json
  {
    "status": "inactive"
  }
  ```

---

## Permission Model (Strict Fail-Closed)

Access to `/admin/clinics` routes is protected by a strict, multi-layered fail-closed security guard:
```js
async function assertPlatformClinicManageAccess(context) { ... }
```

Access is granted if and only if **all** of the following requirements are met:
1. **Global Toggle Check**: `ADMIN_CLINIC_API_ENABLED` environment variable is explicitly set to `true`. If unset or set to `false`, all administrative clinic actions are denied with `403 PLATFORM_ADMIN_REQUIRED`.
2. **Platform Allowlist Check**: The user's authenticated email is explicitly defined in `PLATFORM_ADMIN_EMAILS` (a comma-separated list of permitted emails parsed into an array). If the list is empty, or the user's email is not present, the request is denied with `403 PLATFORM_ADMIN_REQUIRED`.
3. **Database Franchise Status Check**: The user's record in the database must have `is_franchise_admin = true` system-level flag. If `false`, the request is denied with `403 PLATFORM_ADMIN_REQUIRED`.

> [!IMPORTANT]
> **Production Defenses**:
> - In Production, administrative controls strictly fail-closed by default (unless explicitly configured). This protects individual tenant scopes from unauthorized modifications by regular clinic owners or memberships.
> - An unauthorized request results in a `403 PLATFORM_ADMIN_REQUIRED` error (Thai translation: `'ต้องมีสิทธิ์ผู้ดูแลระบบแพลตฟอร์มเพื่อดำเนินการนี้'`).

---

## Default Website Records

Creating a clinic automatically inserts initial rows in the following tables in the same SQL transaction:
- `clinic_website_settings`: `website_status` defaults to `'draft'`, `public_display_name` defaults to clinic name.
- `clinic_branding_settings`
- `clinic_contact_settings`
- `clinic_location_settings`: `country` defaults to `'Thailand'`.
- `clinic_homepage_sections`: Creates 6 default page sections with `'draft'` status:
  - `hero` (sort order 1)
  - `trust_badges` (sort order 2)
  - `services_preview` (sort order 3)
  - `promotions_preview` (sort order 4)
  - `location` (sort order 5)
  - `final_cta` (sort order 6)

---

## Audit Events

Every write action invokes `recordAuditLog` inside the respective database transaction:
- `clinic.created`: When a clinic is initialized.
- `clinic.updated`: When basic parameters or website text fields change.
- `clinic.status_changed`: When clinic status transitions between `active` and `inactive`.

---

## Validation

Input payload validation includes:
- **Clinic Name**: Required, must be a non-empty string.
- **Slug**: Must be normalized via `normalizeClinicSlug()` and validated with `assertValidClinicSlug()`. Reserved slug checks reject system words (e.g. `admin`, `api`, `auth`) and throw `RESERVED_CLINIC_SLUG`. Conflicts reject and throw `CLINIC_SLUG_CONFLICT`.
- **Plan**: Enforces permitted plan keys (`starter`, `pro`, `premium`, `enterprise`) or throws `INVALID_CLINIC_PLAN`.
- **Status**: Enforces permitted statuses (`active`, `inactive`) or throws `INVALID_CLINIC_STATUS`.
- **Timezone**: Must be a non-empty string.
- **Clinic ID**: Enforced to be a positive integer.
- **Query params**: Enforces limit (1 to 100) and offset (>= 0) defaults and ranges.

---

## Tests Added

File: `tests/super_admin_clinic_api.test.js`
- **Auth & Permissions (Hardened)**:
  - Verifies anonymous calls are rejected with `401 AUTH_REQUIRED`.
  - Verifies standard staff calls are rejected with `403 PLATFORM_ADMIN_REQUIRED`.
  - Verifies administrative requests succeed when global toggle is enabled, user email is allowlisted, and DB flag `is_franchise_admin` is true.
  - Verifies that disabling `ADMIN_CLINIC_API_ENABLED` blocks administrative requests with `403`.
  - Verifies that a user with `is_franchise_admin = true` but email not allowlisted is rejected with `403`.
  - Verifies that an allowlisted email with DB flag `is_franchise_admin = false` is rejected with `403`.
  - Verifies standard owner role context is strictly blocked with `403` if they lack explicit allowlisting and system flags.
- **Clinic Onboarding (Generated Slug)**: Verifies clinic onboarding generates a unique slug.
- **Clinic Onboarding (Explicit Slug)**: Verifies custom slug creation.
- **Reserved Slugs**: Verifies setting a reserved slug is rejected with `RESERVED_CLINIC_SLUG`.
- **Slug Conflicts**: Verifies duplicate slugs are rejected with `CLINIC_SLUG_CONFLICT`.
- **Related Records & Rollbacks**: Verifies transaction integrity. Failed creation rollbacks all database operations, avoiding orphan website records.
- **Listing and Pagination**: Verifies filtering by status, search queries, limit, and offset parameters.
- **Clinic Detail Lookup**: Verifies clinic info, website settings, and homepage sections are returned successfully.
- **Basic Updates**: Verifies partial update works for basic fields and website setting fields.
- **Legacy Clinic Upsert Support**: Simulates a legacy clinic with no `clinic_website_settings` row and verifies that updating fields dynamically performs a database UPSERT, initializing default settings.
- **Status Toggling**: Verifies deactivation shifts clinic status to `inactive` and automatically sets website status to `inactive`.
- **Audit Logs**: Verifies `clinic.created`, `clinic.updated`, and `clinic.status_changed` write actions write audit records correctly.

---

## What This PR Does Not Do

- **No Admin UI**: No front-office menus or page additions are introduced.
- **No Public Resolver Routing**: Standard request path matching of public websites (`/:clinicSlug`) is deferred to PR 5.
- **No Path-Based Splitting**: Splitting of main URL paths and frontend routers is deferred to PR 6.
- **No Platform Admin Hardening**: A dedicated platform role model is deferred to a future PR.

---

## Residual Risks

- **Tenant Isolation Boundaries**: Super admin routes bypass single-clinic context boundaries. Strict audit logs and guarded endpoint routing serve as the primary security layer in this PR.

---

## Next PR Recommendation

- **PR 4**: Admin Clinics Menu + Add Clinic UI (creates UI buttons and lists in the Admin SPA to control this endpoint).
