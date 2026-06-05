# PR17B Appointment Conflict Guard

Last updated: 2026-06-05

## Goal

Add a tenant-scoped appointment conflict guard so admins cannot manually confirm overlapping scheduled appointments for the same clinic.

## Conflict Definition

A proposed appointment conflicts when all of these are true:

- The existing appointment has the same `clinic_id`.
- The existing appointment has the same `appointment_date`.
- The existing appointment status is `scheduled`.
- The proposed start time is before the existing end time.
- The proposed end time is after the existing start time.

The guard uses half-open interval behavior:

```txt
[newStart, newEnd) overlaps [existingStart, existingEnd)
```

Examples:

- `14:00-15:00` conflicts with `14:30-15:30`.
- `14:00-15:00` conflicts with `13:30-14:30`.
- `14:00-15:00` conflicts with `14:00-15:00`.
- `14:00-15:00` does not conflict with `15:00-16:00`.
- `14:00-15:00` does not conflict with `13:00-14:00`.

## Blocking Status Rules

The active blocking status is:

- `scheduled`

These statuses do not block a new appointment:

- `cancelled`
- `completed`
- `no_show`

## Tenant Scope

Conflict detection is scoped to the current admin clinic context. Appointments in another clinic do not block confirmation, even when the date and time overlap.

## Error Response Safety

When a conflict is found, confirmation returns `409 APPOINTMENT_TIME_CONFLICT`.

The error details include only safe scheduling fields:

```json
{
  "conflict": {
    "appointmentId": 123,
    "appointmentDate": "2099-07-10",
    "startTime": "14:00",
    "endTime": "15:00",
    "status": "scheduled"
  }
}
```

The conflict response must not expose customer name, email, phone, LINE id, booking message, offer note, internal note, or metadata.

## Idempotency

Confirming the same accepted slot offer more than once still returns the existing confirmed appointment. Slot-offer idempotency is checked before the conflict guard so an appointment does not conflict with itself.

## Explicit Out Of Scope

- Provider availability.
- Doctor availability.
- Capacity rules.
- Calendar sync.
- Rescheduling.
- Public appointment endpoints.
- Auto-confirm when a customer accepts a slot offer.
- Auto-send notification.
- Retry queue.
- Payment, package ownership, or member portal work.
- Deploy.
- Merge.
