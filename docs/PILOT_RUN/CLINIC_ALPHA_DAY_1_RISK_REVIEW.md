# Clinic Alpha - Day 1 Risk Review (PR-20)

Document type: Day 1 risk review before limited pilot operation
Pilot clinic: Clinic Alpha (pseudonym only)
Date: 2026-05-28
Decision baseline: READY_FOR_DAY_1_PREP

---

## 1) Risk Review Summary

Current risk decision:
- GO_WITH_FIXES

No live pilot start is approved by PR-20.

---

## 2) Open Risks

| Risk ID | Risk | Severity | Evidence | Required Action |
|---|---|---|---|---|
| RISK-01 | Operational health degraded | Medium | /ops/health reports degraded; automation failures in last 24 hours = 2 | Resolve or explicitly accept before Day 1 start log |
| RISK-02 | Workflow scope drift | Medium | Active staging demo workflows include two items outside selected Day 1 scope | Disable, pause, or document owner-approved exception |
| RISK-03 | Repeat reminder label mismatch | Low | Expected combined label maps to separate Botox and Filler cycle reminders | Add operator mapping note before start |
| RISK-04 | Historical real-send QA record may confuse Day 1 audit review | Low | Previous controlled QA window exists before PR-20 | Filter Day 1 audit review by PR-20 start window |
| RISK-05 | Public API does not expose all runtime mode fields | Low | Channel response does not expose primary LINE mode | Confirm safe mode through approved staging operations path before start log |

---

## 3) Closed or Controlled Risks

| Risk | Evidence | Status |
|---|---|---|
| Canonical host unreachable | DNS, TCP, live, and ready checks passed | CLOSED |
| Wrong database target | /api/ready reports flowbiz_beauty_staging | CLOSED |
| Demo login unavailable | Authenticated demo login passed | CLOSED |
| HITL queue unavailable | Queue endpoint returned visible records | CLOSED |
| Audit unavailable | Audit endpoint returned visible records | CLOSED |
| PR-20 data import | No import action executed | CONTROLLED |
| PR-20 outbound send | No outbound send action executed | CONTROLLED |

---

## 4) No-Go Escalation Criteria

Escalate to NO_GO if:
1. operational health remains degraded without exception
2. selected workflow scope cannot be aligned
3. HITL queue becomes unavailable
4. audit visibility becomes unavailable
5. any new outbound action appears before Day 1 start approval
6. any new data import appears outside approved scope

Escalate to BLOCKED if:
1. credential exposure is observed
2. unsafe send is observed
3. data outside approved scope is imported
4. owner approval is withdrawn
5. audit cannot be trusted

---

## 5) Recommended Fix Order

1. Investigate automation failures behind degraded operational health.
2. Align workflow activation with selected Day 1 scope.
3. Add repeat reminder mapping note to operator checklist.
4. Re-run Day 1 smoke and authenticated checks.
5. Re-issue Go/No-Go decision.

---

## 6) Risk Decision

Risk status:
- GO_WITH_FIXES

---

## 7) PR-21 Risk Recheck

PR-21 risk decision:
- READY_TO_START_LIMITED_PILOT_DAY_1_WITH_ACCEPTED_EXCEPTIONS

Recheck summary:
1. Core staging health passed.
2. Smoke staging passed.
3. Demo login, HITL queue, and audit visibility passed.
4. Audit since fix window shows 0 outbound actions.
5. Audit since fix window shows 0 real-send indicators.
6. Audit since fix window shows 0 broad import indicators.

Open risks converted to accepted exceptions:

| Risk ID | PR-21 Status | Exception Handling |
|---|---|---|
| RISK-01 | ACCEPTED_NON_BLOCKING_EXCEPTION | Operational health exception recorded; recheck required before start log |
| RISK-02 | ACCEPTED_NON_BLOCKING_EXCEPTION | Extra demo workflows excluded from Day 1 operating path |
| RISK-03 | CLOSED | Repeat reminder mapping note created |
| RISK-04 | CONTROLLED | Audit review uses PR-21 fix window |
| RISK-05 | CONTROLLED | Safe mode evidence relies on smoke flags and no outbound actions; staging ops path must reconfirm before start log |

Residual watch items:
1. Recheck /ops/health in PR-22 before start log.
2. Confirm extra demo workflows are not used in Day 1 operating steps.
3. Keep audit window filtering active.
4. Keep real send and AI auto-send disabled unless a separate approved window exists.

PR-21 risk status:
- READY_TO_START_LIMITED_PILOT_DAY_1_WITH_ACCEPTED_EXCEPTIONS
