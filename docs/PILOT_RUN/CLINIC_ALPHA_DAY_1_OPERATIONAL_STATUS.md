# Clinic Alpha - Day 1 Operational Status (PR-22)

Document type: Opening-day operational status
Pilot clinic: Clinic Alpha (pseudonym only)
Date: 2026-05-28
Start timestamp: 2026-05-28T08:53:41+07:00

---

## 1) Status Summary

Operational status:
- LIMITED_PILOT_DAY_1_STARTED

Environment:
- canonical staging only
- appEnv = staging
- DB = flowbiz_beauty_staging

Operating mode:
- safe-mode limited pilot
- HITL mandatory
- real send disabled
- real AI generation disabled

---

## 2) Opening Health Snapshot

| Area | Evidence | Status |
|---|---|---|
| Public host | DNS and TCP checks passed | PASS |
| API live | HTTP 200 | PASS |
| API ready | HTTP 200 | PASS |
| Smoke | 8 checks recorded, PASS | PASS |
| Demo login | HTTP 200 | PASS |
| HITL queue | HTTP 200 with 8 visible records | PASS |
| Audit view | HTTP 200 with visible records | PASS |
| Ops health | systemStatus = degraded; accepted exception | WATCH |

---

## 3) Operational Boundaries

Day 1 operations are limited to:
1. selected workflow monitoring
2. HITL queue review
3. audit observation
4. support handoff
5. issue logging

Day 1 operations exclude:
1. production deploy
2. broad data import
3. medical record import
4. full chat history import
5. broadcast
6. autonomous AI send
7. multi-clinic rollout

---

## 4) Watch Items

| Watch Item | Owner | Action |
|---|---|---|
| Accepted ops-health exception | FlowBiz-Tech | Recheck during Day 1 monitoring |
| Excluded demo workflows | FlowBiz-Ops | Keep outside operating path |
| Repeat reminder mapping | FlowBiz-Ops | Treat two cycle reminders as one workflow area |
| Audit window | FlowBiz-Ops | Track new actions after start timestamp |

---

## 5) Decision

Current Day 1 operational decision:
- LIMITED_PILOT_DAY_1_STARTED
