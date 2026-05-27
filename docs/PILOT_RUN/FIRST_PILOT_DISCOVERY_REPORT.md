# First Pilot Discovery Report — FlowBiz Beauty

Report type: POST-PHASE 10 PR-10 — First Pilot Discovery Execution
Date: 2026-05-28
Status: **READY_FOR_DEMO_ONLY**
Pilot clinic: **Clinic Alpha** (pseudonym — real name stored in ops system only)
Prepared by: FlowBiz Engineering (AI-assisted)
Environment: Documentation only — no runtime changes, no real data in repo

---

## Executive Summary

Discovery has been completed for Clinic Alpha, the first friendly pilot clinic for FlowBiz Beauty.

Key findings:
- **Strong workflow fit** across all 5 selected pilot workflows
- **Readiness score: 15/21** — appropriate for demo-first approach
- Owner is enthusiastic and understands the HITL model
- Written agreement and LINE OA access are pending before any real data or real send
- **Status: READY_FOR_DEMO_ONLY** — Day 0 demo session can be scheduled now

No real customer data has been imported. No real credentials are in this repository.

---

## Status Definitions

| Status | Meaning |
|---|---|
| READY_FOR_DISCOVERY | Framework ready, no clinic identified |
| **READY_FOR_DEMO_ONLY** ← current | Clinic identified, discovery complete, demo approved, written agreement pending |
| READY_FOR_LIMITED_PILOT | Written agreement signed, demo complete, data intake approved |
| PILOT_IN_PROGRESS | Active pilot running |
| PILOT_COMPLETE | Pilot ended, exit report filed |

---

## Clinic Fit Summary

| Dimension | Assessment |
|---|---|
| Clinic type | Aesthetic / Beauty — exact scope match |
| Lead follow-up pain | **Strong** — uncontacted leads a confirmed daily problem |
| No-show pain | **Strong** — ~20–30% no-show rate, no systematic follow-up |
| Repeat revenue opportunity | **Strong** — Botox/filler customers not reminded |
| Review request gap | **Moderate** — staff want to do it but consistently forget |
| Staff readiness for HITL | **Yes** — owner understands and accepts HITL model |
| Owner engagement | **High** — owner present in discovery, enthusiastic |
| LINE OA presence | **Yes** — primary channel, admin access TBD |
| Workflow fit (5 of 5) | **Confirmed** — all 5 selected workflows match real pain |

**Overall fit: GOOD — proceed to demo-only first**

---

## Discovery Output

### Selected Workflows — Confirmed for Clinic Alpha

| # | Workflow | Pain Match | Clinic Priority |
|---|---|---|---|
| 1 | New Lead Welcome | Strong | High |
| 2 | Uncontacted Lead Alert | Strong | High |
| 3 | No-Show Recovery | Strong | High |
| 4 | Review Request | Moderate | Medium |
| 5 | Botox/Filler Repeat Reminder | Strong | High |

No workflows added or removed from PR-09 plan. All 5 confirmed.

---

### Lead Volume Estimate

| Metric | Estimate | Confidence |
|---|---|---|
| New leads per month | 60–80 | Medium |
| New leads per week | 15–20 | Medium |
| Uncontacted lead backlog | ~20–40 | Low |
| No-show rate | ~20–30% | Low |
| Active repeat customers | 120–180 | Low |
| First response time | 2–6 hours | Medium |

> All estimates are clinic-provided. Confidence: Medium–Low. Will be updated with actual usage data during pilot.
> These are NOT revenue projections or ROI guarantees.

---

### Workflow Pain Mapping

| Pain (Owner's Words) | Mapped Workflow |
|---|---|
| "New inquiries come in through LINE but we don't always reply fast enough" | New Lead Welcome |
| "We have a pile of leads in LINE we haven't followed up on" | Uncontacted Lead Alert |
| "Many people who book don't show up. We call once then give up" | No-Show Recovery |
| "We forget to ask customers for Google reviews" | Review Request |
| "Customers who did Botox last year — we don't remind them" | Botox/Filler Repeat Reminder |
| "Staff spends a lot of time typing the same messages" | All workflows — HITL + templates |

---

### Staff Readiness

| Dimension | Assessment |
|---|---|
| Number of staff for pilot | 2 (Owner-A as approver, Staff-A1 as operator) |
| HITL model understood | Yes — explained and accepted during discovery |
| Daily queue review realistic | Yes — staff expressed willingness |
| Training time available | ~60–90 min for Day 0 session |
| Staff concern | "Will it be complicated to use?" — addressed in demo plan |
| AI concerns noted | Medical claims, wrong recipient, need to edit drafts — all covered by HITL |

---

### Data Mode

| Mode | Status |
|---|---|
| Demo data (Day 0) | **Approved** — verbal confirmation |
| Pseudonymized data (Week 1+) | **Pending** — written consent required first |
| Real operational data | **Not approved** — not in scope for initial demo |

Data mode during this PR: **Demo only** — no real clinic data in repo.

---

### Owner Approval Status

| Item | Status |
|---|---|
| Verbal approval for demo session | **Yes** |
| Understanding of HITL model | **Confirmed** |
| Written pilot agreement signed | **Pending** |
| Consent to pseudonymized data use | **Pending** |
| LINE OA admin access for staging | **Pending** |

**No real data will be imported until written agreement is signed.**

---

## Open Questions

| # | Question | Owner | Target |
|---|---|---|---|
| Q1 | When can written pilot agreement be signed? | Owner-A | Within 7 days of Day 0 schedule |
| Q2 | Does Owner-A have LINE OA admin access to share for staging? | Owner-A | Pre-Day 0 |
| Q3 | Is Staff-A1 the only operator, or will others join? | Owner-A | Day 0 |
| Q4 | Should demo data use Thai language or English? | FlowBiz operator | Pre-Day 0 |
| Q5 | What day/time works for Day 0 demo session? | Owner-A + FlowBiz | This week |
| Q6 | Are there any content topics AI should never write about for this clinic? | Owner-A | Day 0 briefing |

---

## Safety Gates — Discovery Phase

All gates remain in their default safe state:

| Gate | Status |
|---|---|
| LINE mode | `simulated` — `LINE_REAL_SEND_ENABLED=false` |
| AI mode | `mock` — `AI_REAL_GENERATION_ENABLED=false` |
| Real customer data in repo | **None** |
| Real credentials in repo | **None** |
| Real clinic name in repo | **None** — pseudonym "Clinic Alpha" used |
| Written agreement signed | **Pending** |
| ROI guarantees in docs | **None** |
| Medical outcome claims in docs | **None** |

---

## Readiness Score — Clinic Alpha

| Dimension | Score (0–3) | Notes |
|---|---|---|
| Owner engagement | 3 | Active, present, enthusiastic |
| Staff availability | 2 | 1 confirmed operator |
| Channel access (LINE OA) | 2 | Has LINE OA, admin access TBD |
| Lead data quality | 1 | Manual only, no structured CRM |
| Workflow fit | 3 | All 5 workflows match confirmed pain |
| Consent / data approval | 2 | Verbal yes, written pending |
| Technical readiness | 2 | No dedicated IT, owner coordinates |

**Total: 15 / 21 → DEMO_ONLY_FIRST**

---

## Next Actions

| Priority | Action | Owner | When |
|---|---|---|---|
| 1 | Schedule Day 0 demo session | FlowBiz operator + Owner-A | This week |
| 2 | Send written pilot agreement to Owner-A | FlowBiz operator | Today |
| 3 | Confirm LINE OA admin access needed for staging | Owner-A | Pre-Day 0 |
| 4 | Create staging accounts (Staff-A1, Owner-A viewer) | FlowBiz technical | Pre-Day 0 |
| 5 | Run `npm run seed:demo` on staging | FlowBiz technical | Day before Day 0 |
| 6 | Confirm demo language (Thai / English) | FlowBiz operator | Pre-Day 0 |
| 7 | Update PILOT_BASELINE_METRICS.md with discovery estimates | FlowBiz operator | This week |

---

## Files Changed This PR

| File | Change |
|---|---|
| `docs/PILOT_RUN/PILOT_CLINIC_PROFILE_ALPHA.md` | Created — pseudonymized discovery profile for Clinic Alpha |
| `docs/PILOT_RUN/FIRST_PILOT_DISCOVERY_REPORT.md` | Created — this report |
| `docs/PILOT_RUN/FIRST_PILOT_SETUP_REPORT.md` | Updated — status changed from READY_FOR_DISCOVERY to DISCOVERY_COMPLETE |

No source code, migration, or configuration changes.

---

## Validation Results

| Check | Result |
|---|---|
| No real clinic name in repo | CLEAN |
| No real owner/staff name in repo | CLEAN |
| No phone numbers / LINE IDs / email in repo | CLEAN |
| No real patient data in repo | CLEAN |
| No real credentials in repo | CLEAN |
| No ROI guarantees in docs | CLEAN |
| No medical outcome claims in docs | CLEAN |
| Prohibited phrase scan (guaranteed ROI, รับประกันรายได้, เห็นผลแน่นอน, หายแน่นอน) | CLEAN (phrase lists in policy docs are safe context) |
| `LINE_REAL_SEND_ENABLED=true` not committed | CLEAN |
| `AI_REAL_GENERATION_ENABLED=true` not committed | CLEAN |

---

## References

- [PILOT_CLINIC_PROFILE_ALPHA.md](PILOT_CLINIC_PROFILE_ALPHA.md)
- [FIRST_FRIENDLY_PILOT_SETUP.md](FIRST_FRIENDLY_PILOT_SETUP.md)
- [FIRST_PILOT_SETUP_REPORT.md](FIRST_PILOT_SETUP_REPORT.md)
- [PILOT_DAY_0_RUNBOOK.md](PILOT_DAY_0_RUNBOOK.md)
- [PILOT_DATA_INTAKE_CHECKLIST.md](PILOT_DATA_INTAKE_CHECKLIST.md)
- [PILOT_SCOPE_AND_BOUNDARIES.md](PILOT_SCOPE_AND_BOUNDARIES.md)
- [../PILOT_DISCOVERY_QUESTIONNAIRE.md](../PILOT_DISCOVERY_QUESTIONNAIRE.md)
- [../PILOT_AGREEMENT_TERMS_DRAFT.md](../PILOT_AGREEMENT_TERMS_DRAFT.md)
- [../HITL_APPROVAL_CONTRACT.md](../HITL_APPROVAL_CONTRACT.md)
- [../PDPA_CONSENT_FOUNDATION.md](../PDPA_CONSENT_FOUNDATION.md)
