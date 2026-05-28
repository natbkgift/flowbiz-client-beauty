# Clinic Alpha - Day 1 Preflight Evidence (PR-20)

Document type: POST-PHASE 10 PR-20 Day 1 preflight evidence
Pilot clinic: Clinic Alpha (pseudonym only)
Date: 2026-05-28
Canonical staging URL: https://beauty.flowbiz.cloud
Decision baseline: READY_FOR_DAY_1_PREP

---

## 1) Scope

This evidence record verifies Day 1 prep readiness before limited pilot operation.

This PR does not start pilot operations, deploy production, import broad operational data, perform outbound send, enable broadcast, or enable AI auto-send.

---

## 2) Network and Readiness Evidence

| Check | Evidence | Result |
|---|---|---|
| DNS canonical host resolves | Host resolved with 1 address record | PASS |
| TCP 443 reachable | TCP check succeeded | PASS |
| GET /api/live | HTTP 200 | PASS |
| GET /api/ready | HTTP 200 | PASS |
| App environment | appEnv = staging | PASS |
| Database target | database name = flowbiz_beauty_staging | PASS |
| Readiness status | status = ok, database connected | PASS |

---

## 3) Staging Smoke Evidence

Command target:
1. BASE_URL=https://beauty.flowbiz.cloud
2. API_BASE_URL=https://beauty.flowbiz.cloud/api
3. EXPECT_DEMO_DATA=true
4. LINE_REAL_SEND_ENABLED=false
5. AI_REAL_GENERATION_ENABLED=false

Smoke result:
- npm run smoke:staging: PASS
- recorded checks: 8

Smoke checks passed:
1. external send flags disabled
2. API readiness
3. web root
4. web admin route
5. admin asset
6. public asset
7. login endpoint invalid-credential behavior
8. demo data visibility

---

## 4) Authenticated Demo Access Evidence

| Check | Evidence | Result |
|---|---|---|
| Demo login | Authenticated demo session returned HTTP 200 | PASS |
| Staff/demo access scope | Auth context returned one role and 34 permissions in demo staging workspace | PASS |
| HITL queue visible | Queue endpoint returned HTTP 200 with 8 visible records | PASS |
| Audit log visible | Audit endpoint returned HTTP 200 with 10 recent records visible | PASS |
| Outbound read-only visibility | Outbound list endpoint returned HTTP 200; no send action executed | PASS |

No credential values, contact identifiers, or real staff names are recorded in this evidence file.

---

## 5) Workflow Readiness Evidence

Required PR-20 workflow checks:

| Workflow | Live evidence | Result |
|---|---|---|
| New Lead Welcome | Active workflow present | PASS |
| Uncontacted Lead Alert | Active workflow present | PASS |
| No-Show Recovery | Active workflow present | PASS |
| Review Request | Active workflow present | PASS |
| Botox/Filler Repeat Reminder | Related active repeat flows present as separate Botox and Filler cycle reminders | PASS_WITH_NOTE |

Workflow scope issue:
1. Daily Marketing Reminder is active in staging demo workspace.
2. Lead Qualification Nurture is active in staging demo workspace.
3. PR-19 prep scope did not include these two additional active workflows.

Workflow readiness result:
- GO_WITH_FIXES

---

## 6) Safe Mode Evidence

| Check | Evidence | Result |
|---|---|---|
| LINE real send flag for smoke run | explicitly false for PR-20 smoke command | PASS |
| AI real generation flag for smoke run | explicitly false for PR-20 smoke command | PASS |
| Channel config read | simulated mode visible for non-primary demo channels; primary LINE mode not exposed in public response | PASS_WITH_NOTE |
| PR-20 outbound action | no outbound send action executed | PASS |
| PR-20 import action | no import action executed | PASS |
| Audit scan since PR-20 start window | 0 real-send indicators and 0 outbound actions found | PASS |

Historical note:
- A previous controlled staging QA window from 2026-05-27 is recorded outside this PR.
- PR-20 did not perform a real outbound send.

---

## 7) Operational Health Evidence

| Check | Evidence | Result |
|---|---|---|
| /ops/health endpoint | HTTP 200 | PASS |
| System status | degraded | FIX_REQUIRED |
| Worker failed jobs | 0 | PASS |
| Automation failures in last 24 hours | 2 | FIX_REQUIRED |
| Recent failure rows | 0 visible recent failure rows | PASS_WITH_NOTE |

Operational health result:
- GO_WITH_FIXES

---

## 8) Evidence Summary

Passed:
1. canonical DNS and TCP
2. live and ready endpoints
3. staging app and database identity
4. smoke staging
5. demo login
6. HITL queue visibility
7. audit visibility
8. no PR-20 import action
9. no PR-20 outbound send action

Fix required before Day 1 start log:
1. Resolve or explicitly accept operational health degraded status.
2. Align active workflow scope to PR-20 selected workflows.
3. Clarify repeat reminder label mapping in operator checklist.

Current evidence outcome:
- GO_WITH_FIXES

---

## 9) PR-21 Recheck Evidence

Recheck time:
- 2026-05-28T08:36:13+07:00

Canonical staging checks:

| Check | Evidence | Result |
|---|---|---|
| DNS canonical host resolves | Host resolved with 1 address record | PASS |
| TCP 443 reachable | TCP check succeeded | PASS |
| GET /api/live | HTTP 200 | PASS |
| GET /api/ready | HTTP 200 | PASS |
| App environment | appEnv = staging | PASS |
| Database target | database name = flowbiz_beauty_staging | PASS |
| npm run smoke:staging | 8 checks recorded, PASS | PASS |
| demo login | HTTP 200 | PASS |
| HITL queue | HTTP 200 with 8 visible records | PASS |
| audit log | HTTP 200 with visible records | PASS |

Audit since fix window:
1. new outbound actions: 0
2. new real-send indicators: 0
3. broad import indicators: 0

Operational health:
1. /ops/health: HTTP 200
2. systemStatus: degraded
3. automation failures in last 24 hours: 2
4. worker failed jobs: 0
5. recent visible failure rows: 0

Workflow evidence:
1. New Lead Welcome: present
2. Uncontacted Lead Alert: present
3. No-Show Recovery: present
4. Review Request: present
5. Botox/Filler Repeat Reminder: present by mapped Botox Cycle Reminder + Filler Cycle Reminder
6. Daily Marketing Reminder: extra demo workflow, excluded from Day 1 operating path
7. Lead Qualification Nurture: extra demo workflow, excluded from Day 1 operating path

PR-21 evidence outcome:
- READY_TO_START_LIMITED_PILOT_DAY_1_WITH_ACCEPTED_EXCEPTIONS
