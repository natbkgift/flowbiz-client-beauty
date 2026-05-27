# First Pilot Setup Report — FlowBiz Beauty

Report type: POST-PHASE 10 PR-09 — First Friendly Pilot Setup
Date: 2026-05-28
Status: **DISCOVERY_COMPLETE** _(updated in PR-10 — see FIRST_PILOT_DISCOVERY_REPORT.md)_
Prepared by: FlowBiz Engineering (AI-assisted)
Environment: Documentation only — staging, no production changes

---

## Executive Summary

All 12 pilot setup documents have been created under `docs/PILOT_RUN/`.
Discovery has been completed for Clinic Alpha (first friendly pilot clinic, pseudonym).
Status is now `DISCOVERY_COMPLETE` — clinic identified, discovery findings documented, Day 0 demo session being scheduled.
No runtime code changes were made. No real clinic data in repository.

---

## Status History

| PR | Status | Date | Notes |
|---|---|---|---|
| PR-09 | READY_FOR_DISCOVERY | 2026-05-28 | Pilot framework complete, no clinic yet |
| **PR-10** | **DISCOVERY_COMPLETE** | **2026-05-28** | **Clinic Alpha identified, fit confirmed, demo approved** |

### Current Status: DISCOVERY_COMPLETE

- Clinic identified (Clinic Alpha — pseudonym; real name in ops system only)
- Discovery call completed — readiness score 15/21 → DEMO_ONLY_FIRST
- All 5 workflows confirmed as strong fit
- Owner verbal approval for demo received
- Written agreement pending — **no real data until signed**
- LINE OA admin access for staging — pending
- Staging accounts for clinic staff — pending
- System is staging-only. No real LINE send. No real Gemini. No real data.

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
| 13 | [PILOT_CHECKLIST_INDEX.md](PILOT_CHECKLIST_INDEX.md) | Stage-ordered navigation index for all pilot docs | Created |

**PR-10 additions:**

| # | File | Purpose | Status |
|---|---|---|
| 14 | [PILOT_CLINIC_PROFILE_ALPHA.md](PILOT_CLINIC_PROFILE_ALPHA.md) | Pseudonymized discovery profile for Clinic Alpha | Created (PR-10) |
| 15 | [FIRST_PILOT_DISCOVERY_REPORT.md](FIRST_PILOT_DISCOVERY_REPORT.md) | Discovery findings, fit assessment, next actions | Created (PR-10) |

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
| Clinic identified | **Clinic Alpha — confirmed** |
| Clinic owner consent | **Verbal yes — written pending** |
| Staff accounts created | **Pending — pre-Day 0** |
| Data intake complete | **Demo mode approved — real data pending written consent** |
| Baseline metrics collected | **Discovery estimates available — formal baseline pending** |
| Day 0 session scheduled | **Pending scheduling** |

**Overall readiness: DISCOVERY_COMPLETE → proceed to schedule Day 0**
No blocking technical issues found. Written agreement is the main prerequisite before real data or real send.

---

## Open Questions

| # | Question | Owner | Target |
|---|---|---|---|
| 1 | Which clinic is the first friendly pilot? | ~~Business owner~~ | **RESOLVED — Clinic Alpha** |
| 2 | What data mode? | ~~FlowBiz + clinic owner~~ | **RESOLVED — Demo mode confirmed; pseudonymized requires written consent** |
| 3 | Is clinic ready for real LINE on Day 1? | ~~FlowBiz technical owner~~ | **RESOLVED — Demo only; real LINE pending written agreement** |
| 4 | How many staff accounts? | ~~Clinic owner~~ | **RESOLVED — 2 (Owner-A approver, Staff-A1 operator)** |
| 5 | Current no-show rate? | ~~Clinic staff~~ | **IN PROGRESS — estimate 20–30% from discovery** |
| 6 | Weekly lead volume? | ~~Clinic staff~~ | **IN PROGRESS — estimate 15–20/week from discovery** |
| 7 | Willing to share real data? | ~~Clinic owner~~ | **IN PROGRESS — pending written consent** |
| 8 | When can written pilot agreement be signed? | Owner-A | Within 7 days of Day 0 |
| 9 | Does Owner-A have LINE OA admin access for staging? | Owner-A | Pre-Day 0 |
| 10 | Demo language preference (Thai / English)? | FlowBiz operator | Pre-Day 0 |

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
| ~~1~~ | ~~Schedule discovery call~~ | ~~Business owner~~ | **DONE** |
| ~~2~~ | ~~Fill in PILOT_CLINIC_PROFILE.md~~ | ~~FlowBiz operator~~ | **DONE → PILOT_CLINIC_PROFILE_ALPHA.md** |
| 3 | Send written pilot agreement to Owner-A | FlowBiz operator | Today |
| 4 | Schedule Day 0 demo session | FlowBiz operator + Owner-A | This week |
| 5 | Confirm LINE OA admin access for staging | Owner-A | Pre-Day 0 |
| 6 | Create staging accounts (Staff-A1, Owner-A viewer) | FlowBiz technical owner | Pre-Day 0 |
| 7 | Run `npm run seed:demo` on staging | FlowBiz technical owner | Day before Day 0 |
| 8 | Update PILOT_BASELINE_METRICS.md with discovery estimates | FlowBiz operator | This week |
| 9 | Run preflight checklist (PILOT_DAY_0_RUNBOOK.md) | FlowBiz technical owner | Day before Day 0 |

---

## Git Summary

### PR-09 commit
- Branch: `main`
- Commit: `7686c7b` — "docs(beauty): add pilot run setup framework for first friendly pilot"
- Changes: Documentation only (`docs/PILOT_RUN/` — 13 new files)
- No source code changes, no migration changes, no configuration changes

### PR-10 commit
- Branch: `main`
- Changes: Documentation only (`docs/PILOT_RUN/` — 2 new files + 1 updated file)
- No source code changes, no migration changes, no configuration changes

---

## References

- [FIRST_FRIENDLY_PILOT_SETUP.md](FIRST_FRIENDLY_PILOT_SETUP.md)
- [PILOT_CHECKLIST_INDEX.md](PILOT_CHECKLIST_INDEX.md)
- [../FLOWBIZ_BEAUTY_FINAL_EXECUTION_REPORT.md](../FLOWBIZ_BEAUTY_FINAL_EXECUTION_REPORT.md)
- [../PILOT_SUCCESS_METRICS_SCORECARD.md](../PILOT_SUCCESS_METRICS_SCORECARD.md)
- [../HITL_APPROVAL_CONTRACT.md](../HITL_APPROVAL_CONTRACT.md)
- [../PDPA_CONSENT_FOUNDATION.md](../PDPA_CONSENT_FOUNDATION.md)
- [../AI_MEDICAL_SAFETY_POLICY.md](../AI_MEDICAL_SAFETY_POLICY.md)
- [PILOT_CLINIC_PROFILE_ALPHA.md](PILOT_CLINIC_PROFILE_ALPHA.md) _(PR-10)_
- [FIRST_PILOT_DISCOVERY_REPORT.md](FIRST_PILOT_DISCOVERY_REPORT.md) _(PR-10)_
