# MULTI_CLINIC_PR10B: Offerings Admin UI + Public Rendering Handoff

## Goal

Add clinic offerings management in the Admin UI and render real services, promotions, and packages on the Public Clinic Website using the PR10A APIs.

---

## Scope

- Admin route for services, promotions, packages, and basic package-service links
- Frontend API helpers for PR10A admin offerings endpoints
- Public Clinic Website fetches active offerings by clinic slug
- Public template replaces PR8 placeholder sections when active offerings exist
- UI/rendering tests for admin and public surfaces
- Validation script updates
- This handoff documentation

---

## Admin UI

Route: `#/clinic-offerings`

Navigation item:

- Label: `บริการและแพ็กเกจ`
- Test id: `nav-clinic-offerings`

Page test id:

- `clinic-offerings-page`

### Services

- List services from `/admin/clinic-offerings/services`
- Create, edit, delete, and reorder services
- Client-side validation for required name, price range, and safe image URL
- Test ids include:
  - `clinic-offerings-services-table`
  - `clinic-offerings-service-form`
  - `clinic-offerings-service-name`
  - `clinic-offerings-service-save`
  - `clinic-offerings-service-row-<id>`

### Promotions

- List promotions from `/admin/clinic-offerings/promotions`
- Create, edit, delete, and reorder promotions
- Client-side validation for required title, date range, safe image URL, and safe CTA URL
- Test ids include:
  - `clinic-offerings-promotions-table`
  - `clinic-offerings-promotion-form`
  - `clinic-offerings-promotion-title`
  - `clinic-offerings-promotion-save`
  - `clinic-offerings-promotion-row-<id>`

### Packages

- List packages from `/admin/clinic-offerings/packages`
- Create, edit, delete, and reorder packages
- Client-side validation for required name and safe image URL
- Basic package-service add/remove controls use PR10A endpoints:
  - `POST /admin/clinic-offerings/packages/:id/services`
  - `DELETE /admin/clinic-offerings/packages/:id/services/:serviceId`
- Test ids include:
  - `clinic-offerings-packages-table`
  - `clinic-offerings-package-form`
  - `clinic-offerings-package-name`
  - `clinic-offerings-package-save`
  - `clinic-offerings-package-service-form`
  - `clinic-offerings-package-service-list`

---

## Permission Behavior

Admin UI follows PR10A role rules:

| Role | UI behavior |
|---|---|
| owner | Read/write |
| manager | Read/write |
| marketing | Read/write |
| sales | Read-only |
| staff | Read-only |

Read-only users still see offerings lists, but write controls are disabled and a notice is shown.

If the API returns 403 while loading offerings, the UI renders:

- `clinic-offerings-permission-error`
- `คุณไม่มีสิทธิ์แก้ไขบริการ โปรโมชั่น หรือแพ็กเกจของคลินิกนี้`
- `กรุณาใช้บัญชี Clinic Owner, Manager หรือ Marketing`

---

## Tenant Isolation

The frontend never sends `clinicId` or `clinic_id` in request bodies. Tenant context continues to come from the authenticated session headers:

- `Authorization`
- `x-clinic-slug`
- `x-workspace-slug`

Tests assert create, reorder, and package-service payloads do not include `clinicId` or `clinic_id`.

---

## Public Rendering

After the public clinic resolver succeeds, `ClinicPublicShell` fetches:

- `GET /public/clinics/:slug/services`
- `GET /public/clinics/:slug/promotions`
- `GET /public/clinics/:slug/packages`

Public route protections remain unchanged:

- Platform routes like `/`, `/pricing`, `/demo`, `/blog`, and `/forum` do not fetch clinic offerings.
- Unknown or inactive clinic behavior still depends on the resolver and remains 404-safe.

### Public Test IDs

- `clinic-template-services`
- `clinic-template-service-card-<id>`
- `clinic-template-promotions`
- `clinic-template-promotion-card-<id>`
- `clinic-template-packages`
- `clinic-template-package-card-<id>`
- `clinic-template-offerings-loading`
- `clinic-template-offerings-error`

### Fallback Rules

- If active offerings exist, PR10A API data is rendered.
- If offerings APIs return empty lists, PR8 safe fallback content remains.
- If offerings fetch fails, the clinic page still renders and shows `clinic-template-offerings-error`.
- Public rendering does not use `dangerouslySetInnerHTML`.
- Public rendering does not expose `clinicId`, metadata, or full private descriptions.

### Price Formatting

- Service range: `฿x - ฿y`
- Service minimum only: `เริ่มต้น ฿x`
- Package price: `฿x`
- Missing price: `สอบถามราคา`
- Fallback content does not show fake prices.

---

## Tests Added

| File | Coverage |
|---|---|
| `tests/clinic_offerings_admin_ui.test.js` | Navigation, list rendering, CRUD payloads, reorder payloads, URL/price validation, read-only roles, 403 copy, package-service add/remove |
| `tests/public_clinic_offerings_rendering.test.js` | Public offerings fetch/rendering, loading/error states, fallback, price formatting, platform route guard, tenant-only field hiding, HTML escaping |

---

## Validation

Targeted:

```powershell
node tests/clinic_offerings_admin_ui.test.js
node tests/public_clinic_offerings_rendering.test.js
node tests/clinic_offerings_admin_api.test.js
node tests/public_clinic_offerings_api.test.js
node tests/clinic_website_admin_ui.test.js
node tests/public_clinic_template.test.js
node scripts/validate.js
```

Generated bundles must not be committed:

```powershell
git diff main -- apps/web/dist/assets/admin.bundle.js
git diff main -- apps/web/dist/assets/public.bundle.js
```

---

## What This PR Does Not Do

- No migrations
- No backend API contract or tenant guard changes
- No booking, payment, cart, checkout, member portal, or file upload
- No LINE, AI, or HITL behavior changes
- No SaaS Landing Page changes
- No deployment

---

## Residual Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Package-service links have no admin list endpoint in PR10A | Medium | UI supports add/remove operations and keeps local add results visible during the session |
| No image upload workflow | Low | UI accepts safe http/https image URLs only |
| Public offerings fetch is independent from clinic resolver | Low | Failures degrade to fallback without turning the clinic page into a 404 |

---

## Next PR Recommendation

**PR 10C: Offerings polish and package-service read model**

- Add backend read model for package-service links
- Add richer Admin UI filters/search and reorder polish
- Add image upload/reference management if product scope requires it
