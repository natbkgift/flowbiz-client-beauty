# First Pilot Setup Report — FlowBiz Beauty

Report type: POST-PHASE 10 PR-09 — First Friendly Pilot Setup
Date: 2026-05-28
Status: **READY_FOR_DISCOVERY**
Prepared by: FlowBiz Engineering (AI-assisted)
Environment: Documentation only — staging, no production changes

---

## Executive Summary

All 12 pilot setup documents have been created under `docs/PILOT_RUN/`.
No runtime code changes were made.
No real clinic has been confirmed yet.
The system is in `READY_FOR_DISCOVERY` state — ready to begin the discovery call and clinic onboarding process.

---

## Status: READY_FOR_DISCOVERY

This status means:
- Pilot framework is complete and ready to use
- No clinic has been confirmed yet
- All placeholders must be filled in during discovery call
- No real data, no real LINE send, no real Gemini generation until conditions are met
- System is staging-only

---

## Files Created — docs/PILOT_RUN/

| # | File | Purpose | Status |
|---|---|---|---|
| 1 | [FIRST_FRIENDLY_PILOT_SETUP.md](FIRST_FRIENDLY_PILOT_SETUP.md) | Master pilot setup: workflows selected, approval checklist, go/no-go | Created |
| 2 | [PILOT_CLINIC_PROFILE.md](PILOT_CLINIC_PROFILE.md) | Clinic identity, staff, scale, channels, pain points (placeholder) | Created |
| 3 | [PILOT_SCOPE_AND_BOUNDARIES.md](PILOT_SCOPE_AND_BOUNDARIES.md) | Binding scope: in/out of scope, LINE/AI/HITL boundaries | Created |
| 4 | [PILOT_DATA_INTAKE_CHECKLIST.md](PILOT_DATA_INTAKE_CHECKLIST.md) | 10-step data intake, consent, pseudonymization rules | Created |
| 5 | [PILOT_STAFF_ACCESS_PLAN.md](PILOT_STAFF_ACCESS_PLAN.md) | Staff roles, RBAC, HITL approver, onboarding/offboarding | Created |
| 6 | [PILOT_LINE_GEMINI_OPERATING_MODE.md](PILOT_LINE_GEMINI_OPERATING_MODE.md) | Exact mode switches, rollback env flags, operating window | Created |
| 7 | [PILOT_BASELINE_METRICS.md](PILOT_BASELINE_METRICS.md) | Pre-pilot baseline: lead volume, response, no-show, review, repeat | Created |
| 8 | [PILOT_DAY_0_RUNBOOK.md](PILOT_DAY_0_RUNBOOK.md) | Day 0 agenda: preflight, login check, demo walkthrough, go/no-go | Created |
| 9 | [PILOT_WEEKLY_OPERATING_CADENCE.md](PILOT_WEEKLY_OPERATING_CADENCE.md) | Daily routine, weekly check-in agenda, metrics template, issue log | Created |
| 10 | [PILOT_EXIT_AND_CONVERSION_CRITERIA.md](PILOT_EXIT_AND_CONVERSION_CRITERIA.md) | Exit scorecard, success/failure/extend/convert/no-go criteria | Created |
| 11 | [PILOT_ROLLBACK_AND_DISABLE_PLAN.md](PILOT_ROLLBACK_AND_DISABLE_PLAN.md) | Step-by-step rollback: disable LINE, disable AI, disable users, incident response | Created |
| 12 | [FIRST_PILOT_SETUP_REPORT.md](FIRST_PILOT_SETUP_REPORT.md) | This report | Created |

---

## Selected Pilot Workflows (5 of available)

| # | Workflow | Business Value | Status |
|---|---|---|---|
| 1 | New Lead Welcome | First response consistency | Selected |
| 2 | Uncontacted Lead Alert | Prevent lead loss | Selected |
| 3 | No-Show Recovery | Re-book lost appointments | Selected |
| 4 | Review Request | Build social proof | Selected |
| 5 | Botox/Filler Repeat Reminder | Repeat revenue | Selected |

> Workflows NOT selected for this pilot: Appointment Reminder, Birthday, Winback, Loyalty — can be added in a future sprint or after successful pilot.

---

## Safety Gates Confirmed

| Gate | Description | Status |
|---|---|---|
| No HITL bypass | All AI suggestions must be reviewed before send | Wired in existing code |
| LINE defaults simulated | `LINE_INTEGRATION_MODE=simulated`, `LINE_REAL_SEND_ENABLED=false` | Default |
| AI defaults mock | `AI_PROVIDER=mock`, `AI_REAL_GENERATION_ENABLED=false` | Default |
| Real flags not in repo | `LINE_REAL_SEND_ENABLED=true` and `AI_REAL_GENERATION_ENABLED=true` never committed | Enforced |
| PDPA consent check | Required before any outbound communication | Existing enforcement |
| Medical safety | No medical outcome claims, no treatment guarantees in AI output | Existing policy |
| Tenant isolation | Each clinic in separate workspace, RBAC enforced | Existing architecture |
| Staging only | No production DB connection, no production credentials | Current state |

---

## Readiness Decision

| Dimension | Status |
|---|---|
| Pilot documentation | Complete |
| Code safety gates | In place (from prior PRs) |
| Staging environment | Available |
| Clinic identified | **Pending discovery** |
| Clinic owner consent | **Pending** |
| Staff accounts created | **Pending** |
| Data intake complete | **Pending** |
| Baseline metrics collected | **Pending** |
| Day 0 session scheduled | **Pending** |

**Overall readiness: READY_FOR_DISCOVERY**
No blocking technical issues found.

---

## Open Questions

| # | Question | Owner | Target |
|---|---|---|---|
| 1 | Which clinic is the first friendly pilot? | Business owner | Discovery call |
| 2 | What data mode will the clinic use? (demo / pseudonymized / limited real) | FlowBiz + clinic owner | Discovery call |
| 3 | Is clinic ready for real LINE on Day 1 or demo-only? | FlowBiz technical owner | Day 0 |
| 4 | How many staff accounts are needed? | Clinic owner | Discovery call |
| 5 | What is the clinic's current no-show rate? | Clinic staff | Baseline collection |
| 6 | What is the weekly lead volume? | Clinic staff | Baseline collection |
| 7 | Is the clinic willing to share any real operational data? | Clinic owner | Discovery call |

---

## Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | Clinic delays onboarding | Low | Pilot has no strict start deadline |
| R2 | Staff unfamiliar with HITL | Medium | Day 0 training included in runbook |
| R3 | Clinic wants real LINE from Day 1 | Medium | Conditions defined in LINE/Gemini mode doc |
| R4 | No-show rate unmeasured (unknown baseline) | Low | Accept Unknown baseline; compare relative change |
| R5 | Clinic has no LINE OA | High | Confirm during discovery — if no LINE OA, workflows 1/3/4/5 cannot operate in real mode |
| R6 | Discovery call not scheduled | Low | Blocked until business owner books clinic |

---

## Validation Results

No runtime code was changed. Validation applies to documentation only.

| Check | Result |
|---|---|
| No "guaranteed ROI" or equivalent phrases | Clean |
| No real credentials in docs | Clean |
| No real customer data in docs | Clean |
| No `LINE_REAL_SEND_ENABLED=true` as committed value | Clean (only referenced as conditional) |
| No `AI_REAL_GENERATION_ENABLED=true` as committed value | Clean (only referenced as conditional) |
| All rollback steps reference env flags | Confirmed |
| Status is READY_FOR_DISCOVERY (no clinic confirmed) | Confirmed |

---

## Next Actions

| Priority | Action | Owner | When |
|---|---|---|---|
| 1 | Schedule discovery call with first friendly clinic | Business owner | ASAP |
| 2 | Fill in PILOT_CLINIC_PROFILE.md during discovery | FlowBiz operator | Discovery call |
| 3 | Collect baseline metrics from clinic | FlowBiz operator | Discovery / Week 0 |
| 4 | Create clinic staff accounts on staging | FlowBiz technical owner | Pre-Day 0 |
| 5 | Confirm data mode with clinic owner | FlowBiz operator | Discovery call |
| 6 | Schedule Day 0 session | FlowBiz operator + clinic owner | After profile complete |
| 7 | Run preflight checklist (PILOT_DAY_0_RUNBOOK.md) | FlowBiz technical owner | Day before Day 0 |

---

## Git Summary

- Branch: `main`
- Changes: Documentation only (`docs/PILOT_RUN/` — 12 new files)
- No source code changes
- No migration changes
- No configuration changes

---

## References

- [FIRST_FRIENDLY_PILOT_SETUP.md](FIRST_FRIENDLY_PILOT_SETUP.md)
- [PILOT_CHECKLIST_INDEX.md](PILOT_CHECKLIST_INDEX.md)
- [../FLOWBIZ_BEAUTY_FINAL_EXECUTION_REPORT.md](../FLOWBIZ_BEAUTY_FINAL_EXECUTION_REPORT.md)
- [../PILOT_SUCCESS_METRICS_SCORECARD.md](../PILOT_SUCCESS_METRICS_SCORECARD.md)
- [../HITL_APPROVAL_CONTRACT.md](../HITL_APPROVAL_CONTRACT.md)
- [../PDPA_CONSENT_FOUNDATION.md](../PDPA_CONSENT_FOUNDATION.md)
- [../AI_MEDICAL_SAFETY_POLICY.md](../AI_MEDICAL_SAFETY_POLICY.md)
