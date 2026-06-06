# PR19A Package Ownership / Payment Foundation

Last updated: 2026-06-06

## Goal

Add a safe manual commerce foundation for FlowBiz Beauty without integrating any real payment provider.

This PR adds:

- Clinic service package catalog.
- Member-owned package records.
- Manual/admin-created payment records.
- Read-only member portal package/payment visibility.
- Summary-only audit logs and member events.

## Tables

Migration: `database/migrations/053_package_payment_foundation.sql`

New tables:

- `clinic_service_packages`
- `clinic_member_packages`
- `clinic_payment_records`

The existing `clinic_packages` public offering table remains unchanged. `clinic_service_packages` is the operational package catalog used for ownership and payment records.

## Admin Routes

- `GET /admin/packages`
- `POST /admin/packages`
- `PATCH /admin/packages/:packageId`
- `POST /admin/members/:memberId/packages`
- `GET /admin/members/:memberId/packages`
- `POST /admin/payment-records`
- `GET /admin/payment-records`

Admin routes use the authenticated clinic context. Request body/query `clinicId` overrides are rejected, and member/package/payment references are validated against the current clinic.

## Package Ownership Behavior

Manual package assignment:

- Requires an active `clinic_service_packages` row in the same clinic.
- Requires the member to belong to the current clinic.
- Creates a `clinic_member_packages` row with `source = manual_admin`.
- Defaults `totalUnits` from the service package.
- Defaults `remainingUnits` to `totalUnits`.
- Stores a safe package snapshot containing code, name, type, units, price, and currency.
- Does not deduct usage or create visit-consumption ledger entries.

## Manual Payment Behavior

Manual payment records:

- Are created only by admin API.
- Store `payment_status`, `payment_method`, `amount`, `currency`, optional `payment_ref`, and optional `paid_at` for recorded payments.
- Validate member, member package, and package references against the current clinic.
- Do not activate package ownership automatically.
- Do not call or require any external transaction provider.

## Member Portal Visibility

Existing member portal session routes now include:

- `portal.packages`
- `portal.payments`
- top-level `packages`
- top-level `payments`

Public package fields:

- `id`
- `packageCode`
- `packageName`
- `packageType`
- `ownershipStatus`
- `totalUnits`
- `remainingUnits`
- `unitLabel`
- `activatedAt`
- `expiresAt`
- `source`
- `createdAt`
- `updatedAt`

Public payment fields:

- `id`
- `memberPackageId`
- `packageId`
- `paymentRefProvided`
- `paymentStatus`
- `paymentMethod`
- `amount`
- `currency`
- `paidAt`
- `createdAt`
- `updatedAt`

## Audit And Member Events

Audit action types:

- `clinic_service_package.created`
- `clinic_service_package.updated`
- `clinic_member_package.assigned`
- `clinic_payment_record.created`

Member event types:

- `member_package.assigned`
- `member_payment.recorded`

Audit and event summaries include only compact operational identifiers and booleans such as `paymentRefProvided`.

## PII Safety

Public portal responses do not expose:

- `clinicId`
- `memberId`
- `leadId`
- raw metadata
- raw payment reference
- `createdByUserId`
- `recordedByUserId`
- gateway/provider fields
- checkout URLs

Audit/event summaries do not include contact details, raw payment refs, raw metadata, request IP, user agent, or provider secrets.

## Explicit Out Of Scope

PR19A does not add:

- Real payment gateway integration.
- Checkout.
- Webhook handling.
- QR payment generation.
- PromptPay, Stripe, Omise, or other payment provider integration.
- Bank reconciliation.
- Invoice PDF generation.
- Auto-capture.
- Auto-refund.
- Auto-send.
- Real messaging provider behavior.
- Package usage deduction automation.
- Visit consumption ledger.
- Deploy.

## Validation

Targeted:

```powershell
npm run migrate
node --test apps/api/tests/package_payment_foundation.test.js
node --test apps/api/tests/member_portal_v1.test.js
node --test apps/api/tests/member_consent_management.test.js
node --test tests/member_magic_link_access_api.test.js
node --test tests/member_slot_offer_response_api.test.js
node --test apps/api/tests/customer_slot_offer_email_delivery.test.js
node --test apps/api/tests/confirmed_appointment_foundation.test.js
node --test apps/api/tests/appointment_conflict_guard.test.js
node --test apps/api/tests/notification_*.test.js
```
