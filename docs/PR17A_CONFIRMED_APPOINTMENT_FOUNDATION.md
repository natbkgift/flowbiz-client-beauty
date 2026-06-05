# PR17A Confirmed Appointment Foundation

Last updated: 2026-06-05

## Goal

Add the first tenant-scoped confirmed appointment foundation for FlowBiz Beauty clinic scheduling.

This PR lets an admin manually create a confirmed appointment from an accepted slot offer, then list, inspect, and minimally update appointment status.

## Schema

Adds `clinic_confirmed_appointments` in `database/migrations/051_confirmed_appointments.sql`.

Key fields:

- `clinic_id`
- `booking_request_id`
- `slot_offer_id`
- `lead_id`
- `member_id`
- `appointment_date`
- `start_time`
- `end_time`
- `duration_minutes`
- `timezone`
- `visit_type`
- `status`
- `source`
- confirmation and cancellation actor fields
- summary metadata

Idempotency is enforced with a partial unique index on `(clinic_id, slot_offer_id)` where `slot_offer_id is not null`.

## Admin Routes

- `POST /admin/booking-requests/:id/slot-offers/:offerId/confirm-appointment`
- `GET /admin/confirmed-appointments`
- `GET /admin/confirmed-appointments/:id`
- `PATCH /admin/confirmed-appointments/:id/status`

No public appointment endpoints are added.

## Confirm From Slot Offer

Confirmation is a manual admin action.

Required rules:

- Admin clinic context is required.
- Manage permission is required.
- Booking request and slot offer must belong to the current clinic.
- Slot offer must belong to the booking request.
- Slot offer must be accepted through `offer_status = accepted` or `customer_response = accepted`.
- Slot offer must have a concrete `offered_start_time`.
- Slot offer must have valid `duration_minutes`.

On create, the appointment copies safe scheduling references from the slot offer:

- booking request id
- slot offer id
- lead id
- member id
- offered date
- offered start time
- duration
- visit type

The appointment starts as `scheduled` with `source = slot_offer` and `timezone = Asia/Bangkok`.

## Idempotency

Confirming the same slot offer more than once returns the existing appointment instead of creating a duplicate.

The second request returns an idempotent success and does not write duplicate appointment rows.

## Status Updates

Allowed statuses:

- `scheduled`
- `cancelled`
- `completed`
- `no_show`

Cancelling an appointment sets:

- `cancelled_at`
- `cancelled_by_user_id`
- `cancellation_reason`, if provided

Responses expose only `cancellationReasonProvided`, not the raw cancellation reason.

## Audit And Activity

Appointment creation writes:

- audit action: `clinic_confirmed_appointment.created`
- lead activity: `booking_request.appointment_confirmed`

Appointment cancellation writes:

- audit action: `clinic_confirmed_appointment.cancelled`
- lead activity: `booking_request.appointment_cancelled`

Other status changes write:

- audit action: `clinic_confirmed_appointment.status_changed`
- lead activity: `booking_request.appointment_status_changed`

Audit and activity payloads are summary-only. They use ids, status fields, boolean flags, date/time scheduling fields, and do not include customer name, email, phone, LINE id, free-text messages, notes, or cancellation reason text.

## Explicit Out Of Scope

- Appointment conflict guard
- Provider availability engine
- Calendar sync
- Google Calendar integration
- Capacity rules
- Auto-confirm when a customer accepts a slot offer
- Auto-send notification
- External notification provider
- Payment, package ownership, or member portal work
- Deploy
- Merge
