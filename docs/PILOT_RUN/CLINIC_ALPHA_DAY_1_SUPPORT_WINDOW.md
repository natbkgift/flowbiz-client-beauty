# Clinic Alpha - Day 1 Support Window (PR-22)

Document type: Day 1 support and escalation window
Pilot clinic: Clinic Alpha (pseudonym only)
Date: 2026-05-28
Start timestamp: 2026-05-28T08:53:41+07:00

---

## 1) Support Window

Support window:
- Day 1 opening window from start timestamp through end-of-day operator review.

Support is role-based only. No real contact details are recorded in repo.

---

## 2) Escalation Path

| Severity | Route | Expected Action |
|---|---|---|
| Critical safety/data issue | FlowBiz-Tech + FlowBiz-Ops + Owner-A | Stop operation and preserve audit |
| HITL or audit unavailable | FlowBiz-Tech + FlowBiz-Ops | Pause workflow and investigate |
| Workflow scope issue | FlowBiz-Ops + Owner-A | Keep excluded path unused or stop affected workflow |
| Staff usage question | FlowBiz-Ops + Staff-A1 | Provide operating guidance |
| Business stop request | Owner-A + FlowBiz-Ops | Stop Day 1 and record sanitized closeout note |

---

## 3) Stop Triggers

Stop Day 1 if:
1. HITL bypass occurs.
2. audit visibility fails.
3. outbound send occurs without approved window.
4. broad import occurs.
5. excluded workflow enters operational use.
6. owner approval is withdrawn.
7. staging readiness fails.

---

## 4) Support Decision

Support window status:
- OPEN_FOR_DAY_1_LIMITED_PILOT
