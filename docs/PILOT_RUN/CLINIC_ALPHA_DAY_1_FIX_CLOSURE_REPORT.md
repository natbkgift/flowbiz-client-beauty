# Clinic Alpha - Day 1 Fix Closure Report (PR-21)

Document type: POST-PHASE 10 PR-21 fix closure and start approval recheck
Pilot clinic: Clinic Alpha (pseudonym only)
Date: 2026-05-28
Canonical staging URL: https://beauty.flowbiz.cloud
Previous decision: GO_WITH_FIXES

---

## 1) PR-21 Scope

PR-21 rechecks the PR-20 fix items before Day 1 start approval.

This PR does not start limited pilot operation, import broad operational data, perform outbound send, enable mass broadcast, enable AI auto-send, or deploy production.

---

## 2) Fix Closure Matrix

| Fix ID | PR-20 Fix | PR-21 Evidence | Closure Result |
|---|---|---|---|
| FIX-01 | Operational health degraded | /ops/health still reports degraded; exception recorded in CLINIC_ALPHA_DAY_1_OPERATIONAL_HEALTH_EXCEPTION.md | CLOSED_WITH_ACCEPTED_EXCEPTION |
| FIX-02 | Active workflows outside selected Day 1 scope | Extra active demo workflows documented as demo-only excluded path in CLINIC_ALPHA_WORKFLOW_SCOPE_ALIGNMENT.md | CLOSED_WITH_ACCEPTED_EXCEPTION |
| FIX-03 | Repeat reminder label mapping note | Mapping recorded in CLINIC_ALPHA_REPEAT_REMINDER_MAPPING_NOTE.md | CLOSED |
| FIX-04 | Re-run smoke after fixes | npm run smoke:staging PASS with canonical staging URL and safe flags | CLOSED |
| FIX-05 | Re-check audit since fix window | Audit since 2026-05-28T08:36:13+07:00 shows 0 outbound actions, 0 real-send indicators, 0 broad import indicators | CLOSED |

---

## 3) Recheck Evidence Summary

| Check | Result |
|---|---|
| DNS canonical host resolves | PASS |
| TCP 443 reachable | PASS |
| GET /api/live | PASS |
| GET /api/ready | PASS |
| appEnv = staging | PASS |
| database = flowbiz_beauty_staging | PASS |
| npm run smoke:staging | PASS |
| demo login | PASS |
| HITL queue visible | PASS |
| audit log visible | PASS |
| audit since fix window | PASS |
| no PR-21 import action | PASS |
| no PR-21 outbound send action | PASS |

---

## 4) Accepted Exceptions

Accepted non-blocking exceptions:
1. Operational health remains degraded because historical automation failures are still counted in the last-24-hour health window, while worker failed jobs are 0 and recent failure rows are 0.
2. Daily Marketing Reminder and Lead Qualification Nurture remain active in the demo workspace but are documented as demo-only excluded paths for Clinic Alpha Day 1.
3. The expected combined repeat reminder label maps to two active demo flows: Botox Cycle Reminder and Filler Cycle Reminder.

Acceptance is recorded only with sanitized roles:
1. Owner-A: accepted limited Day 1 readiness with documented exceptions.
2. FlowBiz-Tech: accepted technical exception for Day 1 start approval recheck.
3. FlowBiz-Ops: accepted operator scope controls and audit-window filtering.

---

## 5) Decision

PR-21 fix closure decision:
- READY_TO_START_LIMITED_PILOT_DAY_1_WITH_ACCEPTED_EXCEPTIONS

This is approval readiness for a later Day 1 start log. It does not mark the limited pilot as started.

---

## 6) Validation

Validation completed:
1. git diff --check: PASS.
2. npm run validate: PASS.
3. safety scan for real identifiers, credential material, signed-file attachment, and prohibited claim language: PASS.
