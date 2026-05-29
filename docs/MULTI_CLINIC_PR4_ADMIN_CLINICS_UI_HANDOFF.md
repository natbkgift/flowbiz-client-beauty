# PR 4 Handoff - Admin Clinics Menu + Add Clinic UI

This document details the features, routing, API methods, security, forms, testing, and validation added in PR 4.

## Goal

Add the Clinics Management user interface in the Admin SPA Control Center for Platform Admins / Super Admins. This allows platform administrators to easily manage, filter, create, edit, and toggle the status of clinics using the Super Admin Clinic API developed in PR 3.

## Scope

- **Admin SPA Navigation & Layout**: `apps/web/src/app.jsx`
- **Clinics Page Component & Forms**: `apps/web/src/app.jsx`
- **API Client Methods**: `apps/web/src/app.jsx`
- **UI Tests**: Added `tests/admin_clinics_ui.test.js`
- **Validation Script**: Updated `scripts/validate.js`

---

## UI Routes Added

- **`#/clinics`**: Accesses the "จัดการคลินิก" page.
- **Sidebar Menu Item**: Adds "จัดการคลินิก" (caption: "เพิ่ม แก้ไข และควบคุมคลินิก") right under Dashboard, visible to administrators.

---

## API Client Methods Added

We expanded the frontend `createApiClient` function in `apps/web/src/app.jsx` with the following five methods:

1. **`listAdminClinics(session, params = {})`**
   - Path: `GET /admin/clinics?search=&status=&limit=50&offset=0`
2. **`getAdminClinic(session, clinicId)`**
   - Path: `GET /admin/clinics/:id`
3. **`createAdminClinic(session, body)`**
   - Path: `POST /admin/clinics`
4. **`updateAdminClinic(session, clinicId, body)`**
   - Path: `PATCH /admin/clinics/:id`
5. **`updateAdminClinicStatus(session, clinicId, body)`**
   - Path: `PATCH /admin/clinics/:id/status`

---

## Permission / Error UX

In accordance with strict security constraints:
- If a user lacks platform administrator rights (i.e. is a standard clinic manager or operator), or if `ADMIN_CLINIC_API_ENABLED=false`, the Super Admin Clinic API will return `403 PLATFORM_ADMIN_REQUIRED`.
- The Clinics UI catches this error status/code and renders a clean, user-friendly notice box (`data-testid="clinic-platform-permission-notice"`):
  > **ไม่สามารถเปิดหน้าจัดการคลินิกได้**
  > ต้องเปิด ADMIN_CLINIC_API_ENABLED, เพิ่มอีเมลใน PLATFORM_ADMIN_EMAILS และตั้ง is_franchise_admin=true

---

## Forms and Payloads

### 1. Add Clinic Form (`clinic-create-form`)
- **Fields**:
  - `name` (required, text): Clinic Name.
  - `slug` (optional, text): Clinic Slug (if blank, generated from name).
  - `plan` (select): `starter`, `pro`, `premium`, or `enterprise`.
  - `status` (select): `active` or `inactive`.
  - `timezone` (text, defaults to `Asia/Bangkok`).
  - `publicDisplayName` (optional, text): Public Brand Name.
  - `tagline` (optional, text): Branding tagline.
  - `shortDescription` (optional, textarea): Description.

### 2. Edit Clinic Panel (`clinic-edit-form`)
- Loads existing clinic details via `getAdminClinic` on edit button click.
- Allows editing: `name`, `slug`, `plan`, `timezone`, `publicDisplayName`, `tagline`, and `shortDescription`.
- Saves using `updateAdminClinic` and displays a success alert.

### 3. Active / Inactive Status Toggle
- Quick actions in each row: "Deactivate" / "Activate".
- Dispatches status payload `{ status: 'inactive' }` or `{ status: 'active' }` to `updateAdminClinicStatus` and reloads the table.

---

## Tests Added

File: `tests/admin_clinics_ui.test.js`
- **Sidebar & Hash Routing**: Verifies `nav-clinics` exists and successfully transitions to `#/clinics`.
- **Clinics Table Loading**: Asserts clinics are correctly listed in the table and match mock data fields.
- **Search & Filtering**: Asserts search inputs and status selectors render and query options are matched.
- **Clinic Creation**: Populates the "Add Clinic Form", submits, asserts correct payload POST, and verifies reload.
- **Clinic Editing**: Clicks Edit, verifies detailed data loading and population, edits fields, submits, and asserts correct PATCH payload.
- **Status Toggle**: Clicks toggle button, verifies deactivate sends `{ status: 'inactive' }`, and activate sends `{ status: 'active' }`.
- **Permission Notice UX**: Mocks 403 API response, asserts the error is gracefully caught, does not crash, and notice text is shown.

---

## What This PR Does Not Do

- **No Public Routing Changes**: Web server, public path matching `/:clinicSlug`, and `public-app.jsx` are completely untouched.
- **No Database Migrations**: No database changes or SQL files are created.
- **No Security Guards Relaxation**: The security and auth enforcement on the backend remains strictly unchanged.
- **No Payments or LINE integration**: The payment logic and LINE webhook provider connections are completely avoided.

---

## Validation

All CI validation checks and syntax checks have passed successfully:
```powershell
node scripts/validate.js
```
All UI and API tests pass:
```powershell
node tests/admin_clinics_ui.test.js
node tests/admin_ui.test.js
```

---

## Residual Risks

- **Global Config Dependency**: The Clinics UI will be disabled by default in production since `ADMIN_CLINIC_API_ENABLED=false` until explicitly allowlisted.

---

## Next PR Recommendation

- **PR 5: Public Clinic Slug Resolver API**: Creates endpoints to fetch clinic branding/website settings based on `clinicSlug` path.
- **PR 6: Public Routing Split**: Introduces the main URL path split between the SaaS Landing page (`/`) and clinic-specific SPAs (`/:clinicSlug`).
