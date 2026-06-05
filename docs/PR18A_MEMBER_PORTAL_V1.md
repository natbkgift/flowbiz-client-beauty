# PR18A Member Portal V1

Last updated: 2026-06-06

## Goal

Add the first read-only Member Portal V1 payload on top of the existing public member-access magic-link flow.

This PR evolves the existing session response into a small dashboard payload for members without changing the authentication model.

## Routes

Existing route, preserved:

- `GET /public/clinics/:slug/member-access/session?token=...`

Alias route, added for portal naming:

- `GET /public/clinics/:slug/member-portal/session?token=...`

Both routes use the same magic-link validation path:

- `verifyMemberMagicToken()`
- `resolveMemberSessionByToken()`

No new token type, password login, or separate member auth system is introduced.

## Session Payload

The session response remains backward compatible:

```json
{
  "success": true,
  "member": {
    "displayName": "Jane D.",
    "contact": {
      "emailMasked": "ja***@example.com",
      "phoneMasked": "08******99",
      "lineIdMasked": "@ja***"
    }
  },
  "portal": {
    "profile": {},
    "summary": {},
    "bookingRequests": [],
    "slotOffers": [],
    "confirmedAppointments": []
  },
  "bookingRequests": [],
  "slotOffers": [],
  "confirmedAppointments": []
}
```

Top-level `bookingRequests` and `slotOffers` are preserved for existing clients. Top-level `confirmedAppointments` is included as a convenience mirror of `portal.confirmedAppointments`.

## Portal Summary

`portal.summary` includes:

- `bookingRequestCount`
- `pendingSlotOfferCount`
- `acceptedSlotOfferCount`
- `declinedSlotOfferCount`
- `scheduledAppointmentCount`
- `completedAppointmentCount`
- `cancelledAppointmentCount`
- `nextScheduledAppointment`

`nextScheduledAppointment` is selected with a separate ascending scheduled-appointment lookup using a future Bangkok-local appointment start timestamp. It is `null` when no future scheduled appointment is available.

## Confirmed Appointment Exposure

Member portal sessions list up to 20 tenant-scoped confirmed appointments for the current member.

Allowed statuses:

- `scheduled`
- `cancelled`
- `completed`
- `no_show`

Safe appointment fields:

- `id`
- `bookingRequestId`
- `slotOfferId`
- `appointmentDate`
- `startTime`
- `endTime`
- `durationMinutes`
- `timezone`
- `visitType`
- `status`
- `source`
- `createdAt`
- `updatedAt`

The portal does not expose appointment `leadId`, `memberId`, internal metadata, cancellation reason text, audit data, or customer contact fields.

## Token And Security Behavior

The portal uses the existing member-access token table and hashing behavior.

Security behavior is unchanged:

- Invalid token returns `INVALID_MEMBER_ACCESS_TOKEN`.
- Expired token returns `MEMBER_ACCESS_TOKEN_EXPIRED`.
- Revoked token returns `INVALID_MEMBER_ACCESS_TOKEN`.
- Cross-clinic token use returns `INVALID_MEMBER_ACCESS_TOKEN`.
- Public session routes reject `clinicId` and `clinic_id` query overrides.

Session loads continue to update existing member last-seen metadata and write the existing summary-only `member_access.verified` event/audit entry. PR18A does not add an additional noisy portal-view event.

## PII Safety

The portal response only returns masked member contact values through the existing public profile mapper:

- `emailMasked`
- `phoneMasked`
- `lineIdMasked`

The response excludes raw:

- email
- phone
- LINE ID
- booking message
- offer note
- internal note
- customer response note
- cancellation reason
- unsafe metadata
- audit/activity data

## Explicit Out Of Scope

PR18A does not add:

- Payment
- Package ownership ledger
- Consent management
- Profile editing
- Appointment rescheduling
- Public appointment creation
- Calendar sync
- Auto-send
- Real email provider
- Real LINE delivery
- Real SMS delivery
- Provider/doctor availability engine
- Capacity rules
- Deploy

## Validation

Targeted:

```powershell
npm run migrate
node --test apps/api/tests/member_portal_v1.test.js
node --test tests/member_slot_offer_response_api.test.js
node --test apps/api/tests/customer_slot_offer_email_delivery.test.js
node --test apps/api/tests/confirmed_appointment_foundation.test.js
node --test apps/api/tests/appointment_conflict_guard.test.js
node --test apps/api/tests/notification_*.test.js
```
