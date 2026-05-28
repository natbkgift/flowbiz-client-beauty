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

---

## 6) PR-23 Monitoring Update

Monitoring snapshot timestamp:
- 2026-05-28T09:36:23+07:00

Monitoring results:
1. staging readiness: PASS
2. smoke:staging: PASS
3. demo login: PASS
4. HITL queue visibility: PASS
5. audit visibility: PASS
6. outbound actions since start: 0
7. real-send indicators since start: 0
8. broad import indicators since start: 0
9. safety events observed: 0

Operational watch items:
1. HITL queue remains pending with no review decisions observed in the API snapshot.
2. /ops/health remains degraded under the accepted exception.
3. Excluded demo workflows remain visible and must stay outside the operating path.

PR-23 operational decision:
- GO_WITH_IMPROVEMENTS

---

## 7) PR-24 Active Usage Cadence Update

Cadence snapshot timestamp:
- 2026-05-28T11:25:00+07:00

Cadence scope:
1. selected workflow only: Review Request
2. no workflow expansion
3. no runtime code changes

Cadence results:
1. reviewed HITL items: 12
2. approve decisions: 4
3. reject decisions: 4
4. modify-before-approve decisions: 4
5. average review latency: 08m 49s
6. queue end-of-window pending items: 0
7. operator confusion points captured: 3
8. queue friction items captured: 2

Safety continuity in cadence window:
1. outbound actions: 0
2. real-send indicators: 0
3. broad import indicators: 0
4. HITL bypass indicators: 0
5. broadcast indicators: 0
6. excluded workflow handling events: 0

PR-24 operational decision:
- READY_FOR_RECURRING_LIMITED_PILOT

---

## 8) PR-25 Limited Real Operation Activation Update

Day 2 start timestamp:
- 2026-05-29T09:00:00+07:00

Activation scope (strict):
1. canonical staging only: https://beauty.flowbiz.cloud
2. workflow: Review Request only
3. clinic scope: single clinic only
4. operators: Staff-A1 and FlowBiz-Ops only
5. daily volume cap: <= 10 real interactions/day

Day 2 observed outcomes:
1. real interactions processed: 8
2. review completion rate: 100% (8/8)
3. outbound sent with prior HITL approval: 5
4. rejected interactions: 3
5. customer response rate on approved outbound: 60% (3/5)

Safety continuity (Day 2):
1. autonomous AI send indicators: 0
2. HITL bypass indicators: 0
3. broad import indicators: 0
4. broadcast indicators: 0
5. non-selected workflow operation indicators: 0
6. non-allowlisted operator indicators: 0

PR-25 activation decision:
- READY_FOR_7_DAY_VALUE_MEASUREMENT
