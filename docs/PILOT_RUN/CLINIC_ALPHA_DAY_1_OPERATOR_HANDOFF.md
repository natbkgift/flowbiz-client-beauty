# Clinic Alpha - Day 1 Operator Handoff (PR-22)

Document type: Opening-day operator handoff
Pilot clinic: Clinic Alpha (pseudonym only)
Date: 2026-05-28
Start timestamp: 2026-05-28T08:53:41+07:00

---

## 1) Handoff Roles

| Role | Pseudonym | Responsibility |
|---|---|---|
| Operator on duty | FlowBiz-Ops | Monitor Day 1, record issues, coordinate handoff |
| Technical escalation | FlowBiz-Tech | Health checks, safe-mode checks, rollback support |
| Business approver | Owner-A | Scope and stop/continue decisions |
| HITL approver | Staff-A1 | Review, modify, approve, or reject drafts |
| Audit viewer | Staff-A2 | Confirm audit visibility and daily baseline |

---

## 2) Operator Checklist

| Item | Status |
|---|---|
| Start timestamp recorded | COMPLETE |
| Canonical staging URL confirmed | COMPLETE |
| Day 1 scope reviewed | COMPLETE |
| HITL mandatory rule reviewed | COMPLETE |
| Excluded workflow list reviewed | COMPLETE |
| Accepted exceptions reviewed | COMPLETE |
| Audit baseline recorded | COMPLETE |
| No-send/no-import guardrails reviewed | COMPLETE |

---

## 3) Operating Rules

1. Review HITL queue before any customer-facing draft is considered.
2. Do not use excluded workflow paths.
3. Do not send outbound messages from PR-22.
4. Do not import new data from PR-22.
5. Escalate immediately if audit visibility drops.
6. Escalate immediately if any unsafe send or broad import indicator appears.

---

## 4) Handoff Decision

Operator handoff status:
- COMPLETE
