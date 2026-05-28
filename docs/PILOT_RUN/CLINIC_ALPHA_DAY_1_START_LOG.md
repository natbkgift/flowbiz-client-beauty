# Clinic Alpha - Limited Pilot Day 1 Start Log (PR-22)

Document type: POST-PHASE 10 PR-22 limited pilot Day 1 start log
Pilot clinic: Clinic Alpha (pseudonym only)
Date: 2026-05-28
Canonical staging URL: https://beauty.flowbiz.cloud
Start timestamp: 2026-05-28T08:53:41+07:00

---

## 1) Start Decision

Start decision:
- LIMITED_PILOT_DAY_1_STARTED

Decision basis:
1. PR-21 decision was READY_TO_START_LIMITED_PILOT_DAY_1_WITH_ACCEPTED_EXCEPTIONS.
2. PR-22 pre-start checks passed for DNS, TCP, live endpoint, ready endpoint, app environment, database target, smoke test, demo login, HITL queue, and audit visibility.
3. No PR-22 outbound send action was performed before start.
4. No PR-22 data import action was performed before start.
5. Accepted exceptions remain documented and active watch items.

This start log does not approve production deployment, mass rollout, autonomous AI operation, broadcast, broad data import, or unsafe provider mode.

---

## 2) Operator and Support Roles

| Role | Pseudonym | Day 1 Responsibility |
|---|---|---|
| Operator on duty | FlowBiz-Ops | Day 1 monitoring, handoff, and issue intake |
| Technical escalation | FlowBiz-Tech | Staging health, safe-mode verification, rollback support |
| Business approver | Owner-A | Stop/continue decisions and scope ownership |
| HITL approver | Staff-A1 | Review, modify, approve, or reject drafts |
| Audit viewer | Staff-A2 | Review audit visibility and baseline metrics |

No real owner or staff names are recorded.

---

## 3) Required Checks Before Start

| Check | Result |
|---|---|
| DNS canonical host resolves | PASS |
| TCP 443 reachable | PASS |
| GET /api/live | PASS |
| GET /api/ready | PASS |
| appEnv = staging | PASS |
| DB = flowbiz_beauty_staging | PASS |
| smoke:staging | PASS |
| demo login | PASS |
| HITL queue visible | PASS |
| audit visible | PASS |
| no real outbound send in PR-22 window | PASS |
| no real AI generation in PR-22 window | PASS |
| no broad import in PR-22 window | PASS |
| accepted exceptions documented | PASS |

---

## 4) Safe-Mode Confirmation

Safe-mode requirement:
1. LINE real send remains disabled.
2. AI real generation remains disabled.
3. HITL is mandatory for customer-facing drafts.
4. No broadcast is allowed.
5. Excluded demo workflows must not be used for Day 1 operations.

Command-level smoke flags used in PR-22:
1. LINE_REAL_SEND_ENABLED=false
2. AI_REAL_GENERATION_ENABLED=false

---

## 5) Start Boundaries

Allowed:
1. limited pilot only
2. Clinic Alpha only
3. selected workflow paths only
4. demo or minimum-sample operational mode only
5. HITL-reviewed drafts only
6. audit monitoring

Not allowed:
1. production deployment
2. mass rollout
3. autonomous AI operation
4. broad data import
5. medical record import
6. full chat history import
7. broadcast
8. unsafe provider mode

---

## 6) Accepted Exceptions at Start

Accepted exceptions carried from PR-21:
1. Operational health remains degraded due to last-24-hour automation failure count, with worker failed jobs = 0 and recent visible failure rows = 0.
2. Daily Marketing Reminder and Lead Qualification Nurture remain excluded demo-only workflow paths.
3. Botox/Filler Repeat Reminder is represented by Botox Cycle Reminder plus Filler Cycle Reminder.

Start condition:
- These exceptions are accepted as watch items, not blockers, for Day 1 start.

---

## 7) Day 1 Start Status

Current operational status:
- LIMITED_PILOT_DAY_1_STARTED

This is a limited pilot start only. It is not production, not mass rollout, and not autonomous AI operation.
