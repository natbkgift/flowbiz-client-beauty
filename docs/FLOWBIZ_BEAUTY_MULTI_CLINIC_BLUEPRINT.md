# FlowBiz Beauty Multi-Clinic SaaS Blueprint

Last updated: 2026-06-06

## Current State

FlowBiz Beauty is a multi-clinic SaaS platform for clinic-facing CRM, booking request handling, member access, notification safety, and AI/HITL-assisted operations.

PR #37 / PR 16B has been merged:

- PR: https://github.com/natbkgift/flowbiz-client-beauty/pull/37
- Merge commit: `c09eb0c557a060f645a10ccd800f7889ed3b334d`
- Result: customer slot offer email delivery is now part of `main`

PR #39 / PR 17A has been merged:

- PR: https://github.com/natbkgift/flowbiz-client-beauty/pull/39
- Merge commit: `159bb95345b5c6da6977c0b673bf4fb5d4fcd62b`
- Result: confirmed appointment foundation is now part of `main`

PR #40 / PR 17B has been merged:

- PR: https://github.com/natbkgift/flowbiz-client-beauty/pull/40
- Merge commit: `636f3e71b76a35fa7cf3d75ff5a1c2ca437557e0`
- Result: appointment conflict guard is now part of `main`

Current branch work:

- PR 18A: Member Portal V1 - implemented in branch, not merged.
- Extends the existing member-access magic-link session payload with a read-only portal profile, booking requests, slot offers, confirmed appointments, and portal summary counts.
- Keeps new authentication, payment, package ownership, consent management, profile editing, rescheduling, public appointment creation, calendar sync, auto-send, and real messaging providers out of scope.

## Notification Stack Status

Completed notification stack:

```txt
PR 15B / #28: Notification Draft Foundation          - merged
PR 15C / #29: Admin Notification Preview UI          - merged
PR 15D / #30: Delivery Adapter Dry Run               - merged
PR 15E / #31: Provider Config + Kill Switch          - merged
PR 15F / #32: Approval Gate + Send Control           - merged
PR 15G / #33: Safety-Gated Email Delivery Adapter    - merged
PR 15H / #35: Admin Email Send UI Hardening          - merged
PR 16A / #36: Notification Delivery Audit Hardening  - merged
PR 16B / #37: Customer Slot Offer Email Delivery     - merged
```

Current notification flow:

```txt
Notification Draft
-> Admin Preview
-> Dry Run
-> Provider Readiness
-> Kill Switch
-> Approval Gate
-> Send Control
-> Safety-Gated Email Delivery Adapter
-> Delivery Audit Hardening
```

## Current Email Delivery Behavior In Main

The merged notification stack has the first controlled real notification delivery path:

- Manual admin email send endpoint.
- Email-only delivery path.
- Sandbox email adapter.
- Approval enforcement.
- Provider readiness enforcement.
- Global kill switch enforcement.
- Real delivery enabled guard.
- Tenant-scoped draft lookup.
- Idempotent successful email send behavior.
- Delivery attempt records.
- Safe email audit events.

Safety boundaries preserved:

- No LINE real delivery.
- No SMS real delivery.
- No auto-send after approval.
- No bulk send.
- No retry queue.
- No SMTP, SendGrid, Mailgun, SES, or other provider SDK integration.
- No external provider call from the sandbox email adapter.

## Still Not Implemented

Notification and delivery gaps:

- Real SMTP provider integration.
- Real SendGrid provider integration.
- Real Mailgun provider integration.
- Real SES provider integration.
- LINE real delivery.
- SMS real delivery.
- Retry queue.
- Delivery dashboard.
- Real provider operational runbook.

Appointment and booking gaps:

- Doctor/provider availability engine.
- Calendar sync.
- Appointment capacity rules.

Member and commerce gaps:

- Member consent management.
- Package ownership ledger.
- Payment or checkout foundation.
- Payment gateway integration.

## Current Safety Position

The platform can now create notification drafts, preview them, dry-run adapter delivery, check provider readiness, require approval, and manually trigger a safety-gated sandbox email delivery path.

Real email provider delivery is still not implemented. The current adapter is sandbox-only and does not call external services.

LINE and SMS real delivery are still intentionally unsupported.

Approval alone still does not send anything. A manual admin action is required for the email send endpoint, and the endpoint remains blocked unless all guards pass.

## Recommended Next Roadmap

1. PR 18B: Member Consent Management
2. PR 19A: Package Ownership / Payment Foundation

## Historical PR 15H Scope (Merged)

PR 15H remained UI-hardening only:

- Add or harden an explicit Admin "Send Email" control.
- Show the control only for email drafts.
- Require "approved" status before enabling the control.
- Show provider readiness, real delivery flag, and kill switch status.
- Use a confirmation modal that states a real email send will be attempted.
- Show clear blocking reasons.

PR 15H did not add:

- SMTP or provider SDK integration.
- LINE or SMS delivery.
- Auto-send.
- Bulk send.
- Retry queue.
- Appointment creation.

## Merge Readiness Baseline

After PR #40, `main` should be treated as having:

- Notification draft foundation complete.
- Admin preview complete.
- Dry-run delivery complete.
- Provider readiness and kill switch complete.
- Approval gate and send control complete.
- Sandbox-only safety-gated email delivery complete.
- Admin email send UI hardening complete.
- Delivery audit hardening complete.
- Customer slot offer email delivery complete.
- Confirmed appointment foundation complete.
- Appointment conflict guard complete.

PR18A branch work is not part of this merge readiness baseline until PR18A is merged.

The next delivery work must preserve the same safety gates:

- Tenant scope.
- Email-only scope until a dedicated later PR.
- Approval required.
- Real delivery enabled required.
- Kill switch off required.
- Provider readiness required.
- Manual admin action required.
- Idempotency required.
- Audit required.
- No secrets in payloads, results, readiness responses, or audit logs.
