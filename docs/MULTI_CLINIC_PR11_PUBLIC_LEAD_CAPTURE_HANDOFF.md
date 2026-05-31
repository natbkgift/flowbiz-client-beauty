# MULTI_CLINIC_PR11: Public Lead Capture Handoff

## Goal

Add public clinic lead capture so visitors on `/:clinicSlug` can request consultation and create CRM leads under the clinic resolved from the public slug.

## Scope

- Public API endpoint for lead submission
- Tenant resolution from `:slug` only
- Public lead form in the clinic website template
- Interest CTAs from services, promotions, and packages
- Validation for consent, contact method, email, honeypot, and interest ownership
- CRM lead creation under the resolved clinic tenant
- Summary-only audit/activity logging
- Backend and frontend regression tests

## Public API Endpoint

`POST /public/clinics/:slug/leads`

The request body must not include `clinicId` or `clinic_id`. The API resolves the active clinic from the slug and returns `404 CLINIC_NOT_FOUND` for unknown or inactive clinics.

## Lead Capture Form

The public clinic template now renders an inline form with:

- name
- phone
- email
- lineId
- interestType
- interestId
- message
- consentAccepted
- hidden honeypot

Success shows a thank-you message. Errors render inline and do not redirect or break the clinic page.

## Tenant Resolution

The frontend sends only the slug in the URL path. Backend lead insertion uses the clinic ID resolved by `resolvePublicClinicBySlug`. Public callers cannot select or override tenant context.

## CRM Integration

The API creates a row in `leads` with `source = 'website'` to fit the existing lead source constraint. The public source marker remains `clinic_public_website` in audit/activity summary. Default organization/workspace scope is ensured for the clinic before insertion.

## Validation Rules

- `consentAccepted` must be `true`
- at least one of `phone`, `email`, or `lineId` is required
- email must pass basic format validation when present
- message is trimmed to max 1000 characters
- `interestType` must be `service`, `promotion`, `package`, or `general`
- `clinicId` and `clinic_id` are rejected
- honeypot submissions return safe success without creating a lead

## Interest Mapping

If `interestType` is `service`, `promotion`, or `package` and `interestId` is present, the API verifies the item belongs to the resolved clinic and has `status = 'active'`. Cross-tenant, draft, inactive, or missing items return `400 INVALID_INTEREST`.

## Spam Guard

The route uses the existing lightweight in-memory rate limiter, payload limits, consent validation, message length validation, and honeypot handling. No captcha is added in this PR.

## Audit/Event Logging

Created leads write:

- `lead_activity` event `lead.created`
- `audit_logs` action `public_lead.created`

Both store summary-only data such as lead ID, clinic ID, interest type, interest ID, and contact-channel booleans. Raw phone, email, LINE ID, and message are not stored in audit/activity payloads.

## Tests Added

- `tests/public_lead_capture_api.test.js`
- `tests/public_lead_capture_ui.test.js`

## What This PR Does Not Do

- No payment
- No checkout or cart
- No full member portal
- No member login
- No booking calendar or doctor schedule
- No LINE real send
- No AI auto reply
- No deployment

## Validation

Targeted validation:

```powershell
node tests/public_lead_capture_api.test.js
node tests/public_lead_capture_ui.test.js
node tests/public_clinic_offerings_rendering.test.js
node tests/clinic_offerings_admin_ui.test.js
node tests/public_clinic_template.test.js
node scripts/validate.js
```

Generated bundles must remain uncommitted:

```powershell
git diff main -- apps/web/dist/assets/admin.bundle.js
git diff main -- apps/web/dist/assets/public.bundle.js
```

## Residual Risks

- Spam protection is intentionally lightweight until captcha or stronger public rate limiting is introduced.
- The system creates CRM leads, not full member accounts.
- Customer auto-linking remains future work because this PR is the lead capture foundation.

## Next PR Recommendation

PR 12: lightweight member profile or booking request workflow built on top of the public lead intake foundation.
