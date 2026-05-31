# MULTI_CLINIC_PR12A: Booking Request Workflow Handoff

## Goal

Add a lightweight public booking/consultation request workflow for clinic websites at `/:clinicSlug`, linked to CRM leads under the clinic resolved from the slug.

## Scope

- Add booking request schema
- Add public booking request API
- Resolve clinic tenant from slug only
- Validate contact, consent, honeypot, date/time preference, contact method, and interest mapping
- Create or reuse a CRM lead and link the booking request to that lead
- Add public booking request form and offering booking CTAs
- Add backend and frontend tests
- Add this handoff documentation

## Database Schema

Migration: `database/migrations/040_booking_requests.sql`

Table: `clinic_booking_requests`

- Tenant column: `clinic_id`
- Optional CRM link: `lead_id`
- Request fields: `request_type`, `interest_type`, `interest_id`, `preferred_date`, `preferred_time_window`, `preferred_contact_method`
- Customer contact fields are stored on the booking request row for clinic staff follow-up
- Status values: `new`, `contacted`, `confirmed`, `cancelled`, `closed`
- Metadata is constrained to JSON object
- Indexes: `clinic_id`, `(clinic_id, status)`, `(clinic_id, created_at desc)`, `(clinic_id, lead_id)`

## Public API Endpoint

`POST /public/clinics/:slug/booking-requests`

The request body must not include `clinicId` or `clinic_id`. Unknown or inactive clinics return `404 CLINIC_NOT_FOUND`.

Success response:

```json
{
  "success": true,
  "bookingRequestId": 123,
  "leadId": 456,
  "message": "รับคำขอนัดหมายแล้วค่ะ ทีมงานจะติดต่อกลับเพื่อยืนยันเวลา"
}
```

## Admin API Endpoint If Included

Not included in PR 12A. Admin queue/status management is intentionally deferred to PR 12B to keep this PR focused on public intake, CRM linkage, validation, tests, and docs.

## Booking Request Form

The public clinic template renders a separate section:

`ขอนัดหมาย / ขอให้ทีมงานติดต่อกลับ`

Fields:

- name
- phone
- email
- lineId
- requestType
- interestType
- interestId
- preferredDate
- preferredTimeWindow
- preferredContactMethod
- message
- consentAccepted
- hidden honeypot

## Tenant Resolution

The frontend submits only to `/public/clinics/:slug/booking-requests`. Backend resolution uses `resolvePublicClinicBySlug`; public callers cannot select tenant context.

## CRM Lead Linkage

The API ensures default public lead scope for the resolved clinic, then reuses an existing same-clinic lead by email, phone, or LINE ID when found. If none exists, it creates a new CRM lead with `source = 'website'` and links `clinic_booking_requests.lead_id`.

## Interest Mapping

Allowed interest types:

- `service`
- `promotion`
- `package`
- `general`

If `interestId` is provided for service/promotion/package, the item must belong to the resolved clinic and have `status = 'active'`. Cross-tenant, draft, inactive, unknown, or missing active items are rejected.

## Validation Rules

- `clinicId` and `clinic_id` are rejected
- `consentAccepted` must be true
- at least one contact method is required: phone, email, or LINE ID
- email uses basic format validation
- request type allowlist: `consultation`, `booking_request`, `follow_up`
- interest type allowlist: `service`, `promotion`, `package`, `general`
- preferred date must be valid `YYYY-MM-DD` and not in the past
- preferred time window allowlist: `morning`, `afternoon`, `evening`, `anytime`
- preferred contact method allowlist: `phone`, `line`, `email`, `any`
- message max length is 1000 characters

## Spam Guard

The endpoint uses the existing lightweight public rate limiter and honeypot behavior. Honeypot submissions return safe success and do not create a lead or booking request.

## Audit/Event Logging

Created booking requests write:

- `lead_activity` event `booking_request.created`
- `audit_logs` action `clinic_booking_request.created`

Both store summary-only data. Raw phone, email, LINE ID, customer name, and message are not stored in audit/activity payloads.

## Tests Added

- `tests/public_booking_request_api.test.js`
- `tests/public_booking_request_ui.test.js`

## What This PR Does Not Do

- No full calendar scheduling
- No doctor availability engine
- No payment
- No checkout/cart
- No member portal
- No member login
- No LINE real send
- No AI auto reply
- No deployment

## Validation

Targeted:

```powershell
node tests/public_booking_request_api.test.js
node tests/public_booking_request_ui.test.js
node tests/public_lead_capture_api.test.js
node tests/public_lead_capture_ui.test.js
node tests/public_clinic_offerings_rendering.test.js
node tests/public_clinic_template.test.js
node scripts/validate.js
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

Generated bundle check:

```powershell
git diff main -- apps/web/dist/assets/admin.bundle.js
git diff main -- apps/web/dist/assets/public.bundle.js
```

## Residual Risks

- This is request intake, not confirmed appointment scheduling.
- Staff still need to manually confirm time with customers.
- Spam protection remains lightweight until captcha or stronger public abuse controls are added.
- Admin queue/status management is deferred.

## Next PR Recommendation

PR 12B: Admin Booking Request Queue / Status Management.
