# PR 9: Clinic Website Admin Editor Handoff

This document describes the design, implementation, safety measures, and testing strategy for **PR 9: Clinic Website Admin Editor** in the multi-tenant `flowbiz-client-beauty` SaaS platform.

---

## 1. Goal & Architecture

The goal of PR 9 is to enable authorized Clinic Owners, Managers, and Marketing staff to customize their clinic's public website elements directly from the Admin SPA panel. This updates the database settings used by the public template engine (PR 8) to render `/:clinicSlug`.

```
                    ┌────────────────────────────────┐
                    │     Admin SPA Panel (React)    │
                    │      Route: #/clinic-website   │
                    └───────────────┬────────────────┘
                                    │ HTTP PATCH/POST (Authorized Roles)
                                    ▼
                    ┌────────────────────────────────┐
                    │      Backend API Router        │
                    │  (Enforces Session RBAC & Log) │
                    └───────────────┬────────────────┘
                                    │
                                    ▼
                    ┌────────────────────────────────┐
                    │       PostgreSQL Database      │
                    │   (website_settings & sections)│
                    └────────────────────────────────┘
```

---

## 2. Admin Router & API Mappings

### Frontend Client Methods (SPA)
In the React client, all admin API integrations are registered under the central `api` connector using `sessionOptions`:
- `getClinicWebsite(session)` ➜ `GET /admin/clinic-website`
- `updateClinicWebsiteSettings(session, body)` ➜ `PATCH /admin/clinic-website/settings`
- `updateClinicWebsiteBranding(session, body)` ➜ `PATCH /admin/clinic-website/branding`
- `updateClinicWebsiteContact(session, body)` ➜ `PATCH /admin/clinic-website/contact`
- `updateClinicWebsiteLocation(session, body)` ➜ `PATCH /admin/clinic-website/location`
- `createClinicHomepageSection(session, body)` ➜ `POST /admin/clinic-website/sections`
- `updateClinicHomepageSection(session, id, body)` ➜ `PATCH /admin/clinic-website/sections/:id`
- `deleteClinicHomepageSection(session, id)` ➜ `DELETE /admin/clinic-website/sections/:id`
- `reorderClinicHomepageSections(session, body)` ➜ `PATCH /admin/clinic-website/sections/reorder`

### Express Backend Router (`apps/api/src/modules/clinic-website/routes.js`)
To avoid dynamic path matching conflicts in Express, static endpoints are registered before dynamic placeholders:
```javascript
// Order of registration is critical to prevent dynamic parameter matching collision
router.patch('/sections/reorder', checkRole(['owner', 'manager', 'marketing']), reorderSectionsHandler);
router.patch('/sections/:id', checkRole(['owner', 'manager', 'marketing']), updateSectionHandler);
router.delete('/sections/:id', checkRole(['owner', 'manager', 'marketing']), deleteSectionHandler);
```

---

## 3. Strict Security & Validation Gates

### A. Tenant Isolation
- **No Client Inputs for Tenancy Selection**: The API **never** accepts a `clinicId` or `clinicSlug` from the request body or query strings to determine the target clinic context.
- **Strict Session Resolution**: The target clinic is resolved strictly from the authenticated user's session context (`req.user.clinicId` / `req.session.clinicId`). This guarantees that a user from Clinic A can never modify the settings of Clinic B, even by tampered API payloads.

### B. Role-Based Access Control (RBAC)
We enforce the following permission matrix on the endpoints:
- **Read Permissions (GET)**: Allowed for `owner`, `manager`, `marketing`, `sales`, and `staff` roles.
- **Write/Mutation Permissions (POST, PATCH, DELETE)**: Allowed **only** for `owner`, `manager`, and `marketing` roles.
- **Strict Rejection**: Users with `sales` or `staff` roles receive a immediate `403 Forbidden` error on any write/mutation request.

### C. Data Validation Gates (Backend Enforcement)
1. **HEX Colors Only**: Rebranding colors (`primaryColor`, `secondaryColor`, `accentColor`) are strictly validated against a case-insensitive hexadecimal regex:
   ```javascript
   /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/
   ```
2. **Safe URL Protocols**: Image and social URLs must start with `http://` or `https://`, or be empty/null. Safe validation rejects `javascript:`, `data:`, `file:`, or other schema overrides to prevent Cross-Site Scripting (XSS) vectors.
3. **Structured JSON homepage sections**: The `content` column of homepage sections must be a structured JSON object. Rejects strings, arrays, or null.
4. **Valid Coordinates**: Latitude must be between `-90.0` and `90.0` and longitude must be between `-180.0` and `180.0`.
5. **Structured Business Hours**: Business hours must be a valid JSON object.

### D. Zero Injection (UI Safety)
- The admin dashboard uses React native bindings and string interpolations. It strictly forbids raw HTML rendering and contains **no** instances of `dangerouslySetInnerHTML`.

---

## 4. Immutable Audit Trail

Every state-mutating action successfully processed by the API writes a persistent log to the `audit_logs` table, containing the acting user ID, clinic ID, action descriptor, and timestamp:

```sql
INSERT INTO audit_logs (clinic_id, user_id, action, target_type, target_id, details)
VALUES ($1, $2, $3, $4, $5, $6);
```

Actions audited:
- `update_website_settings`
- `update_website_branding`
- `update_website_contact`
- `update_website_location`
- `create_homepage_section`
- `update_homepage_section`
- `delete_homepage_section`
- `reorder_homepage_sections`

---

## 5. Verification & Quality Assurance

### Integration Tests (API Coverage)
`tests/clinic_website_admin_api.test.js` covers 14 distinct integration checks:
1. Verification of authentication blocks.
2. Structure load operations.
3. Settings mutations.
4. Colors HEX-only format validations.
5. Unsafe URL protocol blocking.
6. RBAC rejection verification (Staff gets 403 on write).
7. Tenant-isolation cross-access prevention.
8. Generation of DB audit logs on mutations.

### UI Integration Tests (JSDOM SPA Coverage)
`tests/clinic_website_admin_ui.test.js` runs JSDOM integration checks:
1. Navigation Menu visibility under "เว็บไซต์คลินิก".
2. Multi-tab visual switching.
3. Reactive validation blocks (HEX color input blocks).
4. Submitting general settings, location settings, and contact information.
5. Adding, arranging, and configuring homepage sections.
6. Graceful 403 authorization error rendering.

---

## 6. Residual Risks

- **Resource CDN URLs**: The system accepts absolute URLs (`http://`/`https://`) for branding images. Clinics should use authorized and secure image hosts or internal CDNs. If domain lock-downs are introduced in the future, a CSP header update might be needed.
