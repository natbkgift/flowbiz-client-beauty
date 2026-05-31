# MULTI_CLINIC_PR13B: Magic Link Member Access Handoff

## Goal

Add lightweight magic link member access so clinic customers can request a secure link and view a limited public-safe member profile and booking request status.

## Scope

- Add hashed magic link token storage.
- Add public request and session endpoints under clinic slug routes.
- Add public-safe member profile serialization separate from admin member serialization.
- Add masked contact fields and booking request status list.
- Add a lightweight public member access UI at `/:clinicSlug/#/member-access`.
- Add summary-only audit/member events, tests, and validation coverage.

## Database Schema

Migration: `database/migrations/043_member_magic_links.sql`

New table: `clinic_member_access_tokens`

- Stores `token_hash` only.
- Links to `clinics` and `clinic_members`.
- Supports `purpose = member_access`.
- Supports `delivery_channel` values `email`, `phone`, `line`, and `unknown`.
- Stores hashed request IP and user agent only.
- Adds indexes for clinic, member, token hash uniqueness, and expiry lookup.

The migration also extends `clinic_member_events.event_type` for:

- `member_access.requested`
- `member_access.verified`

## Magic Link Flow

1. Customer opens `/:clinicSlug/#/member-access`.
2. Customer submits contact plus channel.
3. API resolves clinic from slug only.
4. If the contact matches an active member in that clinic, a short-lived token is generated.
5. Only the token hash is stored.
6. In non-production dev/test mode, the raw token can be returned as `devToken`.
7. Customer opens the token session URL.
8. API validates token hash, clinic scope, expiry, revoke state, and active member status.
9. API returns a public-safe member profile and booking request statuses.

## Token Security

- Raw token uses `crypto.randomBytes(32).toString('base64url')`.
- Token hash uses SHA-256 over token plus `MEMBER_ACCESS_TOKEN_SECRET`, falling back to `AUTH_TOKEN_SECRET`.
- Production config already fails closed when auth token secrets are default or empty.
- TTL defaults to 15 minutes via `MEMBER_MAGIC_LINK_TTL_MINUTES`.
- Raw tokens are not logged and not stored.
- `devToken` is guarded by non-production config and `MEMBER_MAGIC_LINK_DEV_TOKEN_ENABLED`.

## Public API Endpoints

- `POST /public/clinics/:slug/member-access/request`
- `GET /public/clinics/:slug/member-access/session?token=...`

Request endpoint response is generic to avoid member enumeration:

```json
{
  "success": true,
  "message": "หากพบข้อมูลสมาชิก ระบบจะส่งลิงก์เข้าใช้งานให้ตามช่องทางที่ระบุ"
}
```

## Public Response Contract

The public response is produced by `mapMemberPublicProfile()` in `apps/api/src/modules/member-access/service.js`.

It does not reuse admin serializers such as `mapAdminMemberRow()` or `getMemberProfileForAdmin()`.

It returns masked contact fields only and excludes raw email, phone, LINE ID, notes, audit logs, admin profile JSON, and internal CRM fields.

## Frontend Member Access UI

Route: `/:clinicSlug/#/member-access`

The page supports:

- Request form with contact and channel selection.
- Hidden honeypot.
- Client-side email validation.
- Token verification from hash query or URL query.
- Session view with masked profile and booking request rows.
- Error view for invalid or expired tokens.

## Tenant Isolation

- Public endpoints resolve tenant from clinic slug only.
- Public request body and session query reject `clinicId` and `clinic_id`.
- Token verification requires both token hash and clinic ID.
- Cross-clinic token use returns invalid token.

## Validation Rules

- `contact` is required.
- `channel` must be `email`, `phone`, or `line`.
- Email channel requires a valid email format.
- Honeypot returns safe success without token creation.
- Inactive or unknown clinics do not issue tokens.

## Audit/Event Logging

Summary-only actions:

- `member_access.requested`
- `member_access.verified`

Summaries include member ID, channel, booleans for available contact types, and token created/verified flags. They exclude raw token, token hash, raw contact, raw email, raw phone, raw LINE ID, raw IP, and raw user agent.

## Tests Added

- `tests/member_magic_link_access_api.test.js`
- `tests/member_magic_link_access_ui.test.js`

Coverage includes request validation, token hashing, contact matching, honeypot behavior, unknown member safety, public-safe session output, booking status list, expired/revoked/cross-clinic rejection, summary-only audit logging, frontend form behavior, token session rendering, and platform route exclusion.

## What This PR Does Not Do

- No password login.
- No full member portal.
- No payment.
- No calendar scheduling.
- No doctor availability engine.
- No LINE real send.
- No email real send.
- No AI auto reply.
- No deployment.

## Validation

Targeted:

```powershell
node scripts/validate.js
node tests/member_magic_link_access_api.test.js
node tests/member_magic_link_access_ui.test.js
node tests/member_profile_foundation_api.test.js
node tests/public_lead_capture_api.test.js
node tests/public_booking_request_api.test.js
node tests/booking_request_admin_api.test.js
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

- Delivery is simulated until email, SMS, or LINE delivery integration is added.
- Public member access is read-only and intentionally limited.
- Token revocation is schema-supported but no public revoke endpoint is exposed in this PR.
- Full member portal remains future work.

## Next PR Recommendation

PR 14: Calendar Slot Request V1 or Notification Delivery Integration.
