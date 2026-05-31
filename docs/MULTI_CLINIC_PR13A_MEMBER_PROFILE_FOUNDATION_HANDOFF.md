# MULTI_CLINIC_PR13A: Lightweight Member Profile Foundation Handoff

## Goal

Add a lightweight, tenant-scoped member/customer identity foundation that links public lead capture and booking request intake to clinic members.

## Scope

- Add `clinic_members` as the central clinic-scoped member identity table.
- Add `clinic_member_events` for summary-only member timeline events.
- Add `member_id` linkage on `clinic_booking_requests`.
- Add member matching by email, phone, then LINE ID within the same clinic.
- Wire public lead capture and public booking request creation to members.
- Add tenant-scoped Admin member list/detail/update APIs.
- Add tests and validation coverage.

## Database Schema

Migration: `database/migrations/042_member_profile_foundation.sql`

Tables:

- `clinic_members`
- `clinic_member_events`

Booking request linkage:

- `clinic_booking_requests.member_id`

All member uniqueness is scoped by `clinic_id`. Partial unique indexes prevent duplicate email, phone, or LINE ID within a clinic while allowing the same contact identity in another clinic.

## Member Identity Matching

Public intake uses deterministic matching priority:

1. Email
2. Phone
3. LINE ID

If a member is found, only missing member fields are filled. Existing non-empty contact fields are not overwritten with a different value. Conflict and merge policy remain future work.

## Lead Linkage

Public lead capture creates the CRM lead first, then calls `findOrCreateMemberForPublicIntake` and `linkLeadToMember` in the same transaction.

## Booking Request Linkage

Public booking request creation creates or reuses the CRM lead, inserts the booking request, then links both the lead and booking request to the matched member in the same transaction.

## Admin API Endpoints

- `GET /admin/members`
- `GET /admin/members/:id`
- `PATCH /admin/members/:id`

PATCH is limited to:

- `displayName`
- `status`
- `profileJson`

Contact fields cannot be edited in this PR.

## Admin UI

Not included in this PR. The admin API is the read-only/admin foundation surface for PR 13A.

## Permission Model

Read:

- `owner`
- `manager`
- `marketing`
- `sales`
- `staff`
- `admin`
- `operator`

Update:

- `owner`
- `manager`
- `marketing`
- `sales`
- `admin`

`staff` and `operator` are read-only.

## Tenant Isolation

- Admin APIs use `context.currentClinic.id`.
- Admin list/detail/update reject `clinicId` and `clinic_id` in query/body.
- Public APIs continue resolving tenant from clinic slug only.
- Public frontend does not send `clinicId` or `clinic_id`.
- Cross-tenant member IDs return `404 MEMBER_NOT_FOUND`.

## Validation Rules

- Public member helper requires at least one of phone, email, or LINE ID.
- Email uses basic format validation.
- String fields are trimmed and capped.
- `source` is allowlisted.
- `consentSummary`, `profileJson`, and JSON columns must be JSON objects.
- Member status is allowlisted.

## Audit/Event Logging

Mutations write summary-only audit logs:

- `clinic_member.created`
- `clinic_member.updated`
- `clinic_member.linked_to_lead`
- `clinic_member.linked_to_booking_request`

Member timeline events are summary-only:

- `member.created`
- `member.linked_to_lead`
- `member.linked_to_booking_request`
- `member.profile.updated`

Audit/member event summaries do not log raw phone, email, LINE ID, raw message, or full profile content.

## Tests Added

- `tests/member_profile_foundation_api.test.js`

Coverage includes public lead linkage, booking linkage, reuse by email/phone/LINE ID, cross-clinic uniqueness, tenant isolation, wildcard search escaping, admin permissions, summary-only audit/member events, and `member_id` booking linkage.

## What This PR Does Not Do

- No full member portal
- No public member login
- No password auth
- No payment
- No calendar scheduling
- No doctor availability engine
- No LINE real send
- No AI auto reply
- No deployment

## Validation

Targeted:

```powershell
node tests/member_profile_foundation_api.test.js
node tests/public_lead_capture_api.test.js
node tests/public_booking_request_api.test.js
node tests/booking_request_admin_api.test.js
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

## Residual Risks

- Matching is conservative and deterministic; contact conflict/merge workflow remains future work.
- Multiple historical leads can be represented through member events, while `clinic_members.lead_id` stores the first direct lead reference.
- Member self-service and magic-link access are not exposed yet.

## Next PR Recommendation

PR 13B: Magic Link Member Access or Calendar Slot Request V1.
