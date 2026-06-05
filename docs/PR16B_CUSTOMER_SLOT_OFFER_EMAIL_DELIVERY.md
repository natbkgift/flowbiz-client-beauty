# PR 16B: Customer Slot Offer Email Delivery

## Goal

Enable `slot_offer.sent` notification drafts to use a real customer email recipient when a tenant-scoped customer email is available, while keeping the existing approval and manual send flow unchanged.

## Behavior

- `slot_offer.sent` now resolves a customer email before creating the draft.
- If a valid email is found, the draft uses `channel = email` and `recipientRef = <customer email>`.
- `recipientType` and `recipientId` remain tied to the tenant-scoped source used for the email: `member`, `lead`, or `booking_request`.
- The draft remains `status = draft`; no send is triggered during slot offer creation or status update.

## Email Resolution Order

1. Tenant-scoped member email.
2. Tenant-scoped lead email.
3. Booking request email.

Email validation is intentionally minimal: the value must be a trimmed string, reasonably sized, contain exactly one `@`, and contain no whitespace.

## No-Email Fallback

If no valid email is available:

- No sendable email draft is created.
- The draft falls back to the existing logical customer recipient.
- If the preferred contact method was `email`, the fallback channel is `line` so the email send endpoint cannot use a logical `recipientRef`.
- If the preferred contact method was `phone`, the fallback channel remains `sms`.
- LINE and SMS real delivery remain unsupported.

## Metadata Safety

`slot_offer.sent` metadata is limited to:

- `bookingRequestId`
- `offerId`
- `offerStatus`
- `offeredDate`
- `offeredTimeWindow`
- `offeredStartTimeProvided`
- `durationMinutes`
- `recipientEmailAvailable`
- `recipientSource`

Metadata does not include customer name, email, phone, LINE ID, raw booking message, offer note, internal note, response note, or magic-link tokens.

## Delivery Compatibility

The delivery flow remains:

1. Admin creates or sends a slot offer.
2. System creates a notification draft.
3. Admin previews the draft.
4. Admin requests approval.
5. Admin or authorized user approves.
6. Admin manually clicks send email.
7. Existing `sendApprovedNotificationEmail()` applies the safety gates and sandbox email adapter.

The email payload builder now also rejects `channel = email` drafts whose `recipientRef` is not a valid email address.

## Safety Boundaries

- No SMTP, SendGrid, Mailgun, SES, or external provider SDK.
- No external provider call from the sandbox adapter.
- No auto-send after slot offer creation.
- No auto-send after approval.
- No LINE real delivery.
- No SMS real delivery.
- No bulk send.
- No retry queue.
- No appointment creation.
- No calendar sync.
- No payment or member portal changes.
- No raw PII in draft metadata or delivery audit context.

## Tests

Implemented coverage in `apps/api/tests/customer_slot_offer_email_delivery.test.js`:

- Email draft creation from tenant-scoped member email.
- Email source order: member, lead, booking request.
- Cross-tenant lead/member email exclusion.
- No-email fallback for preferred email.
- Phone fallback stays SMS draft-only.
- Existing approval/manual sandbox email send compatibility.
- Safe audit context with no recipient email leak.
- Invalid non-email `recipientRef` rejection for email sends.
- Customer-facing safe template assertions.

Validation run:

```txt
PASS node --test apps/api/tests/customer_slot_offer_email_delivery.test.js
PASS node --test apps/api/tests/notification_draft_builder.test.js apps/api/tests/notification_email_delivery.test.js apps/api/tests/notification_delivery_audit_hardening.test.js
PASS node --test apps/api/tests/notification_*.test.js
PASS node --test apps/api/tests/customer_slot_offer_email_delivery.test.js apps/api/tests/notification_*.test.js
PASS node --test <all *slot_offer*.test.js and *booking*.test.js under apps/api/tests and tests>
```

## Out of Scope

Confirmed appointments, appointment availability, conflict guards, calendar sync, payment, member portal work, real provider integration, auto-send, bulk send, and retry behavior remain out of scope.
