# PR 16A: Notification Delivery Audit Hardening

Date: 2026-06-04

## Goal

Harden notification delivery audit evidence for manual real email delivery and dry-run delivery without changing delivery business flow.

## Scope

- Added a shared safe notification delivery audit helper.
- Hardened manual real email audit context for requested, sent, failed, and blocked paths.
- Added dry-run delivery audit evidence for requested, completed, and blocked paths.
- Added targeted tests for tenant-scoped, minimal, no-secret audit context.

## Audit Events

Manual real email send:

- `notification.email_send_requested`
- `notification.email_sent`
- `notification.email_send_failed`
- `notification.email_send_blocked`

Dry-run delivery:

- `notification.delivery_dry_run_requested`
- `notification.delivery_dry_run_completed`
- `notification.delivery_dry_run_blocked`

## Safe Audit Context

Audit context is limited to reviewable delivery evidence:

- `clinic_id`
- `draft_id`
- `delivery_attempt_id` when an attempt exists
- `approval_request_id` when an approval exists
- `actor_user_id`
- `channel`
- `provider`
- `mode`
- `status`
- safe `reason` code when relevant
- safe result summary only
- `recipient_type`
- `recipient_id`
- `recipient_ref_present`
- `timestamp`

Result summaries use counts and booleans only, such as `external_call_made`, `safe_result`, `accepted_count`, `rejected_count`, and `message_id_present`.

## Safety Guarantees

Audit context does not include:

- raw provider secrets
- raw provider credentials
- raw API keys, SMTP passwords, or tokens
- raw email body or message
- raw subject
- raw recipient email/ref
- raw payload JSON
- raw adapter payload
- raw accepted/rejected recipient arrays
- raw thrown error stack

Tenant scope remains enforced by existing draft lookup and audit writes use the draft tenant as `clinic_id`. Cross-tenant draft lookup failures do not create tenant A audit evidence for tenant B drafts.

## Out Of Scope

This PR does not add:

- SMTP, SendGrid, Mailgun, SES, or external provider SDKs
- LINE real delivery
- SMS real delivery
- auto-send after approval
- bulk send
- retry queue
- delivery dashboard
- appointment, member, or payment flow changes

## Validation

PASS:

- `node --test apps/api/tests/notification_delivery_audit_hardening.test.js`
- `node --test apps/api/tests/notification_email_delivery.test.js apps/api/tests/notification_delivery_dry_run.test.js apps/api/tests/notification_approval_gate.test.js apps/api/tests/notification_admin_preview.test.js`
- `node --test apps/api/tests/notification_*.test.js`

No deploy, no merge, and no external provider calls were performed.
