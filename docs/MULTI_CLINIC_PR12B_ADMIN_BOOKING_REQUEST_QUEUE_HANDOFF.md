# MULTI_CLINIC_PR12B: Admin Booking Request Queue Handoff

## Goal

Add an Admin Booking Request Queue so clinic teams can manage booking requests submitted from public clinic websites after PR 12A.

Flow:

Public booking request -> `clinic_booking_requests` -> Admin Queue -> staff follow-up -> status/note update -> audit log.

## Scope

- Admin API for list, detail, status update, and internal note handling.
- Admin SPA route `#/booking-requests`.
- Filters by status, request type, interest type, and created date range.
- Tenant-scoped status management and note creation.
- Audit and lead activity summaries without raw PII in audit payloads.
- Backend and frontend tests.

## Admin API Endpoints

- `GET /admin/booking-requests`
- `GET /admin/booking-requests/:id`
- `PATCH /admin/booking-requests/:id/status`
- `POST /admin/booking-requests/:id/notes`

All admin endpoints use the authenticated `context.currentClinic.id`. They reject `clinicId` and `clinic_id` overrides.

## Admin UI Route

- Route key: `booking-requests`
- Hash route: `#/booking-requests`
- Menu label: `คำขอนัดหมาย`

The page includes filters, a request table, a detail panel, status update controls, and an internal note textarea.

## Permission Model

Read:

- `owner`
- `manager`
- `marketing`
- `sales`
- `staff`

Status update and notes:

- `owner`
- `manager`
- `marketing`
- `sales`

`staff` is read-only.

When the authenticated membership includes a legacy clinic role, the queue uses that role so `sales` can manage while `staff` remains read-only even if both normalize to `operator`. The route also accepts the repo's normalized `admin` role as a manager/marketing equivalent for management actions, and `operator` as read-only when no legacy role is available.

## Tenant Isolation

- No frontend request sends `clinicId` or `clinic_id`.
- API rejects `clinicId` and `clinic_id` in admin query/body payloads.
- List/detail/status/note queries always filter with `clinic_id = context.currentClinic.id`.
- Cross-tenant detail, status update, and note requests fail closed with `404 BOOKING_REQUEST_NOT_FOUND`.
- Audit logs use clinic id from authenticated context only.

## Status Management

Allowed statuses:

- `new`
- `contacted`
- `confirmed`
- `cancelled`
- `closed`

Status updates create:

- `lead_activity` event `booking_request.status_changed`
- `audit_logs` action `clinic_booking_request.status_changed`

Audit context stores summary only:

```js
{
  summary: {
    source: 'admin_booking_request_queue',
    bookingRequestId,
    leadId,
    fromStatus,
    toStatus,
    changedFields: ['status']
  }
}
```

## Note Handling

`POST /admin/booking-requests/:id/notes` stores the note as a CRM business record in `lead_notes` and `notes` using `note_type = 'booking_request_internal'`.

Rules:

- `note` is trimmed.
- Empty notes are rejected.
- Notes over 1000 characters are rejected.
- Notes require the booking request to be linked to a lead.
- Audit and lead activity summaries do not include raw note content.

Note actions create:

- `lead_activity` event `booking_request.note_added`
- `audit_logs` action `clinic_booking_request.note_added`

## Audit/Event Logging

Migration `041_booking_request_admin_events.sql` extends `lead_activity.event_type` for:

- `booking_request.status_changed`
- `booking_request.note_added`

Audit and activity payloads include summary metadata only. Raw customer name, phone, email, LINE ID, message, and note content are not logged in audit summaries.

## Tests Added

- `tests/booking_request_admin_api.test.js`
- `tests/booking_request_admin_ui.test.js`

Covered areas:

- Auth required
- Role-based read/write behavior
- Cross-tenant isolation
- Query/body clinic override rejection
- Detail scoping
- Status validation and audit/activity creation
- Internal note handling without raw note in audit
- Admin menu, filters, detail panel, status update, 403 UI, staff read-only notice, and note save payload

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

Targeted validation:

```powershell
node scripts/validate.js
node tests/booking_request_admin_api.test.js
node tests/booking_request_admin_ui.test.js
node tests/public_booking_request_api.test.js
node tests/public_booking_request_ui.test.js
node tests/public_lead_capture_api.test.js
node tests/public_lead_capture_ui.test.js
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

- This queue manages follow-up state only; it does not reserve calendar slots.
- Staff still confirm the final appointment time manually.
- Normalized `operator` remains read-only unless the authenticated context also carries legacy `sales`.
- Rich calendar availability and doctor scheduling remain future work.

## Next PR Recommendation

PR 13: Lightweight Member Profile Foundation or Calendar Slot Request V1.
