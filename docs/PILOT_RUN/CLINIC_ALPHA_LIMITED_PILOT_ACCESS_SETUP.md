# Clinic Alpha - Limited Pilot Access Setup (PR-19)

Document type: Access setup and least-privilege role plan
Pilot clinic: Clinic Alpha (pseudonym only)
Date: 2026-05-28
Decision baseline: READY_FOR_LIMITED_PILOT_PREP

---

## 1) Access Principles

1. Use least privilege for every role.
2. Keep access limited to Clinic Alpha staging workspace only.
3. Do not enable access for any other clinic in PR-19.
4. Do not store credentials in repo.
5. Disable access immediately if a stop condition appears.

---

## 2) Roles

| Role | Pseudonym | Minimum Access | Not Allowed |
|---|---|---|---|
| Owner approver | Owner-A | Read prep status, approve scope, request stop | Direct credential handling in repo |
| HITL approver | Staff-A1 | View queue, approve, modify, reject | Admin configuration |
| Audit viewer | Staff-A2 | Read audit summaries and metrics | Workflow activation |
| LINE operator | Staff-A1 | Controlled one-to-one send only after separate approval | Broadcast or unapproved send |
| Pilot operator | FlowBiz-Ops | Cadence, support, metrics, notes | Production changes |
| Technical owner | FlowBiz-Tech | Staging health, safe flags, emergency disable | Unreviewed data import |

---

## 3) Account Creation Checklist

| Item | Owner | Status |
|---|---|---|
| Create or confirm Owner-A staging role | FlowBiz-Tech | PLANNED |
| Create or confirm Staff-A1 HITL role | FlowBiz-Tech | PLANNED |
| Create or confirm Staff-A2 audit-view role | FlowBiz-Tech | PLANNED |
| Confirm FlowBiz-Ops operator access | FlowBiz-Tech | PLANNED |
| Confirm FlowBiz-Tech emergency access | FlowBiz-Tech | PLANNED |
| Confirm no extra clinic workspace access | FlowBiz-Tech | PLANNED |
| Confirm no credential material in repo | FlowBiz-Tech | PLANNED |

---

## 4) HITL Approver

Required:
1. At least one active HITL approver before operational use.
2. HITL approver must understand approve, modify, and reject.
3. No AI-drafted customer-facing text may bypass HITL.
4. Rejected items cannot be sent.

Primary HITL approver:
- Staff-A1

Backup approver:
- Owner-A, if operationally available and explicitly assigned.

---

## 5) Audit Viewer

Audit viewer responsibilities:
1. Confirm daily audit visibility.
2. Review weekly HITL and workflow summaries.
3. Escalate missing audit events immediately.

Audit viewer:
- Staff-A2

---

## 6) Offboarding Checklist

When the prep or pilot ends:
1. Disable Staff-A1 access.
2. Disable Staff-A2 access.
3. Disable Owner-A staging access if requested.
4. Pause workflows.
5. Preserve required audit events.
6. Confirm no active sessions remain.
7. Record a sanitized offboarding note.

---

## 7) Emergency Disable

Emergency disable owner:
- FlowBiz-Tech

Immediate actions:
1. Disable real send capability.
2. Disable real AI provider capability.
3. Disable clinic user accounts if required.
4. Pause all Clinic Alpha workflows.
5. Preserve audit trail.
6. Notify Owner-A through approved external channel.

No production action is included in PR-19.

---

## 8) Decision

Current access setup status:
- READY_FOR_DAY_1_PREP
