# MULTI_CLINIC_PR14A: Calendar Slot Request V1 Handoff

## Goal

Add a lightweight Calendar Slot Request V1 layer to public booking requests so customers can submit structured appointment preferences for staff follow-up.

This is a slot preference/request workflow only. It is not a confirmed appointment calendar.

## Scope

- Add slot preference fields to `clinic_booking_requests`.
- Extend public booking request payload validation and storage.
- Extend admin booking queue list/detail responses with slot fields.
- Add admin filters for slot status, visit type, urgency, and preferred date range.
- Add controlled admin slot status update endpoint.
- Add API/UI tests and validation coverage.

## Database Schema

Migration: `database/migrations/044_calendar_slot_request_v1.sql`

Added columns on `clinic_booking_requests`:

- `alternative_preferred_date`
- `alternative_time_window`
- `visit_type`
- `urgency`
- `slot_status`
- `slot_request_json`

Added indexes:

- `(clinic_id, slot_status)`
- `(clinic_id, preferred_date, preferred_time_window)`
- `(clinic_id, alternative_preferred_date, alternative_time_window)`

The migration also extends `lead_activity.event_type` with `booking_request.slot_status_changed`.

## Public Booking Slot Fields

`POST /public/clinics/:slug/booking-requests` now accepts:

- `alternativePreferredDate`
- `alternativeTimeWindow`
- `visitType`
- `urgency`
- `slotRequest`

The public frontend sends these fields from the booking request form without sending `clinicId` or `clinic_id`.

## Admin Queue Slot Fields

Admin list/detail responses now include:

- `alternativePreferredDate`
- `alternativeTimeWindow`
- `visitType`
- `urgency`
- `slotStatus`

Admin detail also includes `slotRequest` for staff review.

## Validation Rules

- `clinicId` and `clinic_id` are rejected on public and admin booking routes.
- `preferredDate` remains optional, valid date only, and cannot be in the past.
- `alternativePreferredDate` is optional, valid date only, and cannot be in the past.
- `alternativeTimeWindow` is allowlisted to `morning`, `afternoon`, `evening`, or `anytime`.
- `visitType` is allowlisted to `consultation`, `treatment`, `follow_up`, or `other`.
- `urgency` is allowlisted to `normal`, `soon`, or `urgent`.
- `slotStatus` is allowlisted to `requested`, `reviewing`, `offered`, `accepted`, `rejected`, or `expired`.
- `slotRequest` must be a JSON object.
- `slotRequest.notes` is trimmed and limited to 500 characters.

## Slot Status Model

Slot status is a preference workflow status only:

- `requested`
- `reviewing`
- `offered`
- `accepted`
- `rejected`
- `expired`

Endpoint:

`PATCH /admin/booking-requests/:id/slot-status`

Allowed roles match booking status management: `owner`, `manager`, `marketing`, `sales`, and normalized `admin`. `staff` and `operator` remain read-only.

## Tenant Isolation

- Public tenant resolution continues to use clinic slug only.
- Public frontend does not send tenant IDs.
- Admin APIs use `context.currentClinic.id`.
- Admin query/body `clinicId` and `clinic_id` overrides are rejected.
- List/detail/update SQL always scopes by `clinic_id`.
- Cross-tenant slot status updates return `404 BOOKING_REQUEST_NOT_FOUND`.

## Audit/Event Logging

Public create audit/activity summaries include summary-only slot data:

- `hasPreferredDate`
- `hasAlternativePreferredDate`
- `visitType`
- `urgency`
- `slotStatus`
- `slotRequestProvided`

Slot status updates write:

- `lead_activity` event `booking_request.slot_status_changed`
- `audit_logs` action `booking_request.slot_status_changed`

Raw slot notes are stored on the booking request row only and are not copied into audit or lead activity summaries.

## Tests Added

- `tests/calendar_slot_request_api.test.js`
- `tests/calendar_slot_request_ui.test.js`

Coverage includes public slot storage, validation failures, audit-safe summaries, admin slot fields, slot filters, slot status update permissions, cross-tenant safety, wildcard search escaping, public UI payloads, admin UI filters, and slot status save payloads.

## What This PR Does Not Do

- No confirmed appointment system.
- No doctor availability engine.
- No calendar sync.
- No Google Calendar or Outlook integration.
- No payment.
- No member portal.
- No password login.
- No LINE or email real send.
- No AI auto reply.
- No deployment.

## Validation

Targeted validation:

```powershell
node tests/calendar_slot_request_api.test.js
node tests/calendar_slot_request_ui.test.js
node tests/public_booking_request_api.test.js
node tests/public_booking_request_ui.test.js
node tests/booking_request_admin_api.test.js
node tests/booking_request_admin_ui.test.js
node tests/member_magic_link_access_api.test.js
node tests/member_magic_link_access_ui.test.js
node scripts/validate.js
```

Full suite:

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

- Slot requests are preferences, not appointment confirmations.
- Staff still manually confirm final booking times with customers.
- Availability conflicts, provider schedules, and capacity rules remain future work.

## Next PR Recommendation

PR 14B: Admin Slot Offer / Appointment Confirmation Draft.
