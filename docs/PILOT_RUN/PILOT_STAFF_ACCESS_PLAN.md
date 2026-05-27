# Pilot Staff Access Plan — FlowBiz Beauty

Date: 2026-05-28
Version: 1.0

---

## Purpose

This document defines staff roles, permissions, and access procedures for the pilot.
All access follows a **least-privilege** principle: staff get only the permissions needed for their specific responsibilities.

---

## Roles Available in Pilot

| Role | Internal Name | Description |
|---|---|---|
| **Clinic Owner** | `clinic_owner` | Full read access; approves scope changes; does not manage UI daily |
| **Pilot Admin** | `workspace_admin` | FlowBiz operator account; manages clinic setup, workflows, user accounts |
| **Clinic Operator** | `operator` | Front-desk / marketing staff who uses daily workflow, reviews HITL queue |
| **Clinic Viewer** | `viewer` | Read-only — for owner or manager who wants visibility without edit access |

> During the first pilot, limit to **1 Pilot Admin + 1–2 Clinic Operators + 1 optional Viewer**.
> Do not create more accounts than needed.

---

## Permission Matrix

| Action | Clinic Owner | Pilot Admin | Clinic Operator | Clinic Viewer |
|---|:---:|:---:|:---:|:---:|
| View leads / customers | ✓ | ✓ | ✓ | ✓ |
| Edit lead stage / notes | — | ✓ | ✓ | — |
| Create leads | — | ✓ | ✓ | — |
| View AI suggestion queue | ✓ | ✓ | ✓ | ✓ |
| **Approve AI suggestion (HITL)** | — | ✓ | ✓ | — |
| **Reject AI suggestion (HITL)** | — | ✓ | ✓ | — |
| Queue approved message for outbound | — | ✓ | ✓ | — |
| View audit trail | ✓ | ✓ | ✓ | ✓ |
| Manage user accounts | — | ✓ | — | — |
| Enable/disable workflows | — | ✓ | — | — |
| View baseline/weekly metrics | ✓ | ✓ | ✓ | ✓ |
| Change LINE/Gemini mode | — | ✓ (with tech owner approval) | — | — |
| Emergency disable workflows | — | ✓ | — | — |

---

## HITL Approval — Who Can Approve

Only accounts with `operator` or `workspace_admin` role can approve, modify, or reject AI-generated messages.

Rule summary:
- Minimum 1 designated HITL approver must be active before any AI workflow is turned on
- Viewer-only accounts cannot approve
- Clinic Owner account does not approve by default (separation of duty)
- If only 1 operator is available, add a second backup approver before enabling workflows

Designated HITL approvers for this clinic:

| Name | Role | Account Created |
|---|---|---|
| `<APPROVER_1_NAME>` | Operator | `[ ]` |
| `<APPROVER_2_NAME>` | Operator (backup) | `[ ]` |

---

## Who Can Queue Outbound

Only accounts with `operator` or `workspace_admin` role.
Outbound queue action is separate from HITL approval — it is a deliberate two-step:

1. Approve (or modify) AI message
2. Separately queue for outbound send

This prevents accidental sends at the moment of approval.

---

## Who Can View Audit Trail

All roles may view audit trail (read-only). The audit trail is non-editable.

---

## Who Can Manage Users

Only `workspace_admin` (Pilot Admin / FlowBiz operator). No clinic staff should have user-management access by default.

---

## Account Creation Checklist

For each staff account:

- [ ] Role confirmed (minimum necessary)
- [ ] Account created in staging workspace for `<CLINIC_PSEUDONYM>`
- [ ] Credential communicated securely (not via this repo or plain text)
- [ ] Staff logged in and confirmed access
- [ ] Staff completed HITL walkthrough (for operators)
- [ ] Staff confirmed understanding of: no AI auto-send, HITL required, prohibited message content
- [ ] Account ID recorded: `<ACCOUNT_ID>`

Accounts created:

| # | Name | Role | Account ID | Created Date |
|---|---|---|---|---|
| 1 | `<PILOT_ADMIN>` | workspace_admin | `<ID>` | `<DATE>` |
| 2 | `<OPERATOR_1>` | operator | `<ID>` | `<DATE>` |
| 3 | `<OPERATOR_2_BACKUP>` | operator | `<ID>` | `<DATE>` |
| 4 | `<VIEWER_OPTIONAL>` | viewer | `<ID>` | `<DATE>` |

---

## Credential Security Rules

- Credentials are not stored in this repository
- Credentials are not sent via unencrypted channels
- Temporary passwords must be changed at first login
- No shared accounts — each person has their own account
- Credentials for staging only — no production credentials

---

## Offboarding Checklist

When a staff member leaves the pilot or the pilot ends:

- [ ] Disable account (do not delete — preserve audit trail)
- [ ] Confirm no active sessions
- [ ] Confirm no pending HITL items assigned to this user
- [ ] Reassign any pending HITL items to active approver
- [ ] Record offboarding date and reason

At pilot end — all clinic accounts:

- [ ] All clinic operator accounts disabled
- [ ] Clinic owner account disabled or archived
- [ ] Confirm audit trail is still readable post-disable
- [ ] Data export/delete plan executed per data intake checklist

---

## Emergency Disable

If a staff member needs immediate access revocation:

1. Pilot Admin disables account via workspace user management
2. If Pilot Admin is unavailable: FlowBiz technical owner disables via admin backend
3. Confirm no active session tokens remain
4. Record incident in audit notes

Emergency contact for immediate account disable:
- FlowBiz Technical Owner: `<SECURE_CONTACT — not stored here>`

---

## References

- [PILOT_SCOPE_AND_BOUNDARIES.md](PILOT_SCOPE_AND_BOUNDARIES.md)
- [PILOT_ROLLBACK_AND_DISABLE_PLAN.md](PILOT_ROLLBACK_AND_DISABLE_PLAN.md)
- [../HITL_APPROVAL_CONTRACT.md](../HITL_APPROVAL_CONTRACT.md)
