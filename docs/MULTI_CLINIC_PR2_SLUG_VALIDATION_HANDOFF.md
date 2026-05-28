# PR 2 Handoff - Reserved Slug & Clinic Slug Validation

This document outlines the validation constraints, rules, and integration changes introduced in PR 2 for the Multi-Clinic SaaS migration.

## Goal

Establish a robust, centralized validation layer for clinic slugs (`clinics.slug`) to prevent slug conflicts with system routes (e.g. `/admin`, `/api`, `/auth`), static files, or other system endpoints. This acts as a security guard layer before implementing path-based routing (`/:clinicSlug`) in later phases.

## Scope

- **Clinic Slug Validation Module**: `apps/api/src/modules/clinics/validation.js`
- **Onboarding Signup Integration**: `apps/api/src/modules/onboarding/service.js`
- **Validation Script Update**: `scripts/validate.js`
- **Error Messages & Mappings**: Added Thai user error messages to `apps/api/src/common/user-messages.js`
- **Tests Added**: Unit and integration tests in `tests/clinic_slug_validation.test.js`

---

## Reserved Slug Policy

Slugs matching any of the following values (case-insensitive) are strictly prohibited for clinics because they conflict with current or planned routes/endpoints:

### Core Routes & Assets
- `admin`
- `api`
- `auth`
- `login`
- `logout`
- `signup`
- `register`
- `pricing`
- `demo`
- `contact`
- `support`
- `terms`
- `privacy`
- `assets`
- `static`
- `public`
- `blog`
- `forum`
- `member`
- `members`
- `dashboard`
- `settings`
- `health`
- `healthz`
- `live`
- `ready`
- `sitemap.xml`
- `robots.txt`
- `favicon.ico`
- `public.css`
- `styles.css`

### Risky Endpoint Path Groups
- `v1`, `webhook`, `webhooks`, `integration`, `integrations`, `channels`, `templates`, `leads`, `customers`, `campaigns`, `automation`, `audit`, `ops`, `billing`, `ai`, `line`, `facebook`, `tiktok`

---

## Validation Rules

Every clinic slug is subjected to the following validation constraints:
1. **Normalization**: Trims spaces and transforms characters using `toSlug(value, '')` from `apps/api/src/common/slug.js`.
2. **Case Insensitivity**: Slugs are normalized to lowercase before validation.
3. **Empty Value**: Slugs cannot be empty.
4. **Length Constraint**: Slugs cannot exceed 80 characters.
5. **Character Registry**: Only lowercase alphanumeric characters (`a-z`, `0-9`) and hyphens (`-`) are permitted.
6. **No Leading/Trailing Hyphens**: Slugs must not start or end with a hyphen (`-`).
7. **No Consecutive Hyphens**: Slugs must not contain duplicate consecutive hyphens (`--`).
8. **Reserved Check**: Slugs must not match any string in the Reserved List.

If validation fails, an `AppError` is thrown with the respective error code:
- `RESERVED_CLINIC_SLUG` ("สลักของคลินิกเป็นคำสงวนของระบบ" / "Clinic slug is reserved for system routes.")
- `INVALID_CLINIC_SLUG` ("สลักของคลินิกไม่ถูกต้อง" / "Clinic slug is invalid.")

---

## Onboarding Integration

In `apps/api/src/modules/onboarding/service.js`:
- During signup, the clinic slug is generated using the new helper `ensureUniqueClinicSlug(client, preferredSlug)`.
- If a user inputs a reserved clinic name (e.g. `Admin`), the signup throws `RESERVED_CLINIC_SLUG` and aborts.
- This validation occurs within the SQL transaction, triggering a `rollback` so that **no user, clinic, workspace, or other orphan database records are left behind**.
- If a normal clinic slug already exists, the onboarding flow appends a sequential counter suffix (e.g. `clinic-alpha-1`), which is subsequently validated to ensure it is not reserved and conforms to the slug formatting rules.

---

## Tests Added

### 1. Pure Helper Tests
- Verified `normalizeClinicSlug` handles space trimming, lowercase conversion, and non-alphanumeric character replacement.
- Verified `isValidClinicSlug` enforces length, regex checks, hyphens, and empty checks.
- Verified `isReservedClinicSlug` catches system routes and risky paths.
- Verified `assertValidClinicSlug` throws expected `AppError` objects.

### 2. Onboarding Integration Tests
- Checked that standard onboarding generates a correct slug.
- Checked that duplicate signups correctly resolve with suffixes (e.g., `-1`).
- Checked that signup with reserved names (`Admin`, `API`, `Healthz`) is rejected.
- Verified transaction rollback safety: ensuring that no user or clinic records are left in the database after a rejected reserved signup attempt.

---

## What This PR Does Not Do

- **No Super Admin API**: Platform APIs for provisioning clinics will be implemented in PR 3.
- **No Admin UI**: Frontend components for listing or adding clinics will be implemented in PR 4.
- **No `/:clinicSlug` resolver**: Routing matching for actual clinic websites is deferred to PR 5.
- **No Web Server Routing Changes**: Web traffic splitting is deferred to PR 6.
- **No Database Migrations**: The schema baseline from PR 1 is sufficient; constraints are enforced at the application level.

---

## Validation Results

- `npm run validate` passed successfully.
- `npm test` passed 177 tests out of 177 tests successfully.

---

## Residual Risks

- **Existing DB Data**: This validation only acts as a gatekeeper for *new* clinics. Any existing legacy clinics with invalid slugs in the database are not mutated or migrated by this PR.

---

## Next PR Recommendation

- **PR 3**: Implement the Super Admin Clinic API to allow platform operators to manage clinics.
- **PR 4**: Create Admin Clinics Menu and Add Clinic UI on the Admin SPA.
