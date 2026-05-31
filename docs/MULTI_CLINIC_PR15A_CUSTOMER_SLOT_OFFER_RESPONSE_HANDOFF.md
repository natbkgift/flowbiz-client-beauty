# MULTI_CLINIC_PR15A: Customer Slot Offer Response via Magic Link Handoff

## Goal

Add a customer response layer for clinic slot offers so verified members can open a magic link, view public-safe proposed appointment slots, and accept or decline an offer.

This remains a slot offer response workflow only. It is not a confirmed appointment calendar.

## Scope

- Extend `clinic_booking_slot_offers` with customer response fields.
- Extend the member access session response with public-safe slot offers.
- Add a public magic-link endpoint for customer accept/decline.
- Update booking request `slot_status` from customer response.
- Add summary-only audit and lead activity events.
- Add a lightweight public member access UI for slot offer responses.
- Add API/UI tests and validation registration.

## Database Schema

Migration: `database/migrations/046_slot_offer_customer_response.sql`

Added columns on `clinic_booking_slot_offers`:

- `customer_response`
- `customer_response_note`
- `customer_responded_at`

Allowed `customer_response` values:

- `accepted`
- `declined`

Added indexes:

- `(clinic_id, customer_response)`
- `(clinic_id, customer_responded_at desc)`

The migration also extends `lead_activity.event_type` for:

- `booking_request.slot_offer_customer_accepted`
- `booking_request.slot_offer_customer_declined`

No confirmed appointment table is created.

## Public API Endpoints

Extended:

- `GET /public/clinics/:slug/member-access/session?token=...`

Added:

- `POST /public/clinics/:slug/member-access/slot-offers/:offerId/respond`

The response endpoint uses the clinic slug and magic token only. It does not accept tenant, member, or lead identifiers from the public body or query string.

## Public Slot Offer Response Contract

Session `slotOffers` returns public-safe fields only:

- `id`
- `bookingRequestId`
- `offeredDate`
- `offeredTimeWindow`
- `offeredStartTime`
- `durationMinutes`
- `offerStatus`
- `customerResponse`
- `customerRespondedAt`
- `createdAt`

Response endpoint returns only:

- `id`
- `bookingRequestId`
- `offerStatus`
- `customerResponse`
- `customerRespondedAt`

The public serializer is separate from the admin slot offer serializer. It does not expose `offerNote`, `internalNote`, `metadata`, `createdByUserId`, `updatedByUserId`, `clinicId`, `leadId`, `memberId`, or raw audit/activity data.

## Magic Link Token Security

Token verification reuses the member access token resolver in `apps/api/src/modules/member-access/service.js`.

The resolver preserves the PR13B guarantees:

- Raw tokens are never stored.
- Token hash uses the configured member access token secret.
- Clinic is resolved from slug only.
- Token lookup is clinic-scoped.
- Expired and revoked tokens are rejected.
- Inactive members are rejected.
- Raw token values are not logged.

## Customer Accept / Decline Flow

Accepted response:

- Sets slot offer `offer_status = accepted`.
- Sets `customer_response = accepted`.
- Stores optional `customer_response_note`.
- Sets `customer_responded_at`.
- Sets booking request `slot_status = accepted`.
- Writes `booking_request.slot_offer_customer_accepted`.
- Writes `clinic_booking_slot_offer.customer_accepted`.

Declined response:

- Sets slot offer `offer_status = declined`.
- Sets `customer_response = declined`.
- Stores optional `customer_response_note`.
- Sets `customer_responded_at`.
- Sets booking request `slot_status = rejected`.
- Writes `booking_request.slot_offer_customer_declined`.
- Writes `clinic_booking_slot_offer.customer_declined`.

Already responded offers are idempotent for the same response and return `409 SLOT_OFFER_ALREADY_RESPONDED` for a different response.

## Tenant Isolation

Every public slot offer query is scoped by:

- Resolved clinic ID from slug.
- Verified member ID from magic token.
- Slot offer ID.
- Booking request/member linkage.

Public request bodies reject `clinicId` and `clinic_id`. The public response endpoint does not accept `memberId`, `leadId`, or `clinicId`.

## Validation Rules

- `token` is required.
- `offerId` must be a positive integer.
- `response` must be `accepted` or `declined`.
- `note` is optional and limited to 500 characters.
- `honeypot` returns safe success without mutation.
- Offer status must be `ready_to_send` or `sent` for first response.
- Non-owned offers return `404 SLOT_OFFER_NOT_FOUND`.
- Invalid response payloads return `INVALID_SLOT_OFFER_RESPONSE`.
- Non-respondable statuses return `SLOT_OFFER_RESPONSE_NOT_ALLOWED`.
- Conflicting repeat responses return `SLOT_OFFER_ALREADY_RESPONDED`.

## Audit/Event Logging

Audit and lead activity summaries are summary-only:

```json
{
  "summary": {
    "source": "member_magic_link_slot_offer_response",
    "bookingRequestId": 123,
    "offerId": 1001,
    "memberId": 456,
    "leadId": 789,
    "response": "accepted",
    "noteProvided": true
  }
}
```

The logs do not copy raw customer notes, raw tokens, token hashes, raw phone/email/LINE, offer notes, internal notes, or metadata.

## Frontend UI Changes

`apps/web/src/public-app.jsx` extends `MemberAccessPage` with a `ข้อเสนอเวลานัดจากคลินิก` section.

The UI displays:

- Offered date.
- Time window.
- Start time.
- Duration.
- Current status.
- Optional note input.
- Accept and Decline actions.
- Success and error states.

The frontend response payload includes `token`, `response`, optional `note`, and `honeypot`. It does not include `clinicId` or `clinic_id`.

## Tests Added

- `tests/member_slot_offer_response_api.test.js`
- `tests/member_slot_offer_response_ui.test.js`

Coverage includes public-safe session output, hidden statuses, tenant/member guards, token failures, accept/decline transitions, booking request slot status updates, honeypot behavior, idempotency, summary-only logging, UI rendering, response payloads, note validation, API errors, and platform route exclusion.

## What This PR Does Not Do

- No confirmed appointment calendar.
- No doctor availability engine.
- No calendar sync.
- No Google Calendar or Outlook integration.
- No LINE/email real send.
- No AI auto reply.
- No payment.
- No member portal.
- No password login.
- No deployment.

## Validation

Targeted:

```powershell
node tests/member_slot_offer_response_api.test.js
node tests/member_slot_offer_response_ui.test.js
node tests/member_magic_link_access_api.test.js
node tests/member_magic_link_access_ui.test.js
node tests/booking_slot_offer_api.test.js
node tests/booking_slot_offer_ui.test.js
node scripts/validate.js
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

- Customer response updates slot offer/request status only; it does not create a confirmed calendar appointment.
- Real notification delivery remains future work.
- Appointment confirmation, availability conflicts, and calendar sync remain manual/future work.

## Next PR Recommendation

PR 15B: Notification Delivery Draft or Confirmed Appointment Foundation.
