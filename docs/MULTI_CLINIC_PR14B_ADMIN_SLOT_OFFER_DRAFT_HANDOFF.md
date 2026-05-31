# MULTI_CLINIC_PR14B: Admin Slot Offer / Appointment Confirmation Draft Handoff

## Goal

Add a lightweight Admin Slot Offer / Appointment Confirmation Draft layer so clinic staff can propose appointment times from the Admin Booking Request Queue.

This remains a draft/offer workflow only. It is not a confirmed appointment calendar.

## Scope

- Add clinic-scoped slot offer storage.
- Add admin APIs to list, create, and update slot offer status.
- Set booking request `slot_status` to `offered` when an offer is created.
- Add a Slot Offers section to the admin booking request detail panel.
- Add validation, role checks, tenant isolation, and summary-only audit/activity logging.
- Add API/UI tests and validation registration.

## Database Schema

Migration: `database/migrations/045_booking_slot_offers.sql`

New table: `clinic_booking_slot_offers`

- Links to `clinics`, `clinic_booking_requests`, `leads`, and `clinic_members`.
- Stores offered date, time window, optional start time, optional duration, offer status, offer note, internal note, creator/updater user IDs, metadata, and timestamps.
- Allows `offered_time_window`: `morning`, `afternoon`, `evening`, `anytime`, `specific_time`.
- Allows `offer_status`: `draft`, `ready_to_send`, `sent`, `accepted`, `declined`, `cancelled`, `expired`.
- Enforces duration `5..480` when present and JSON object metadata.
- Adds indexes by clinic, booking request, offer status, offered date, and created date.

The migration also extends `lead_activity.event_type` for:

- `booking_request.slot_offer_created`
- `booking_request.slot_offer_status_changed`

## Admin API Endpoints

- `GET /admin/booking-requests/:id/slot-offers`
- `POST /admin/booking-requests/:id/slot-offers`
- `PATCH /admin/booking-requests/:id/slot-offers/:offerId/status`

All endpoints use `context.currentClinic.id`. Query/body `clinicId` and `clinic_id` overrides are rejected.

## Admin UI Changes

`BookingRequestsPage` now shows `Slot Offers / ข้อเสนอเวลานัด` in the detail panel.

The section supports:

- Existing offer list.
- Offer draft creation form.
- Offered date, time window, start time, duration, offer note, and internal note fields.
- Client-side validation.
- Success and error states.

## Slot Offer Status Model

Offer status is separate from booking request slot status:

- Offer status tracks the draft/send/customer-response lifecycle for a proposed slot.
- Creating an offer sets `clinic_booking_requests.slot_status = 'offered'`.
- Updating an offer status does not create a confirmed appointment and does not change booking request `slot_status`.

## Permission Model

Read:

- `owner`
- `manager`
- `marketing`
- `sales`
- `staff`
- `admin`
- `operator`

Create/update:

- `owner`
- `manager`
- `marketing`
- `sales`
- `admin`

`staff` and `operator` are read-only.

## Tenant Isolation

- Admin APIs scope all booking request and offer queries by `context.currentClinic.id`.
- Cross-tenant booking request access returns `404`.
- Cross-tenant offer status update returns `404`.
- Frontend payloads do not send `clinicId` or `clinic_id`.
- Audit logs use clinic ID from authenticated context only.

## Validation Rules

Create slot offer:

- Reject `clinicId` and `clinic_id`.
- `offeredDate` is required, valid `YYYY-MM-DD`, and not in the past using Asia/Bangkok date.
- `offeredTimeWindow` must be allowlisted.
- `specific_time` requires `offeredStartTime`.
- `offeredStartTime` must be `HH:mm`, `00:00` to `23:59`.
- `durationMinutes`, when present, must be `5..480`.
- `offerStatus` defaults to `draft` and must be allowlisted.
- `offerNote` max 500 characters.
- `internalNote` max 1000 characters.
- `metadata` must be a JSON object.

## Audit/Event Logging

Creating a slot offer writes:

- `lead_activity` event `booking_request.slot_offer_created`
- `audit_logs` action `clinic_booking_slot_offer.created`

Updating offer status writes:

- `lead_activity` event `booking_request.slot_offer_status_changed`
- `audit_logs` action `clinic_booking_slot_offer.status_changed`

Audit/activity context is summary-only. It records IDs, booleans such as note presence, offered time metadata, and status changes. It does not copy raw `offerNote` or `internalNote`.

## Tests Added

- `tests/booking_slot_offer_api.test.js`
- `tests/booking_slot_offer_ui.test.js`

Existing booking request UI tests were adjusted to mock the new slot offers list call from the detail panel.

## What This PR Does Not Do

- No confirmed appointment calendar.
- No doctor availability engine.
- No calendar sync.
- No Google Calendar or Outlook integration.
- No LINE/email real send.
- No AI auto reply.
- No payment.
- No deployment.

## Validation

Targeted:

```powershell
node scripts/validate.js
node tests/booking_slot_offer_api.test.js
node tests/booking_slot_offer_ui.test.js
node tests/calendar_slot_request_api.test.js
node tests/calendar_slot_request_ui.test.js
node tests/booking_request_admin_api.test.js
node tests/booking_request_admin_ui.test.js
```

Full:

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

- Slot offers are structured drafts, not reserved appointment slots.
- Staff still manually communicate and finalize appointments outside this PR.
- Availability conflicts and provider capacity remain manual.
- Notification delivery and customer response tracking remain future work.

## Next PR Recommendation

PR 15: Customer Slot Offer Response via Magic Link or Notification Delivery Integration.
