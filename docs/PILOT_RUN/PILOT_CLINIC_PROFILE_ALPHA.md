# Pilot Clinic Profile — Clinic Alpha

Document type: Discovery output — pseudonymized
Date of discovery: 2026-05-28
Version: 1.0
Status: **DISCOVERY_COMPLETE**

---

> **DATA HANDLING NOTICE — READ BEFORE EDITING**
>
> - This document uses a pseudonym. The real clinic name is stored securely **outside this repository**.
> - Do NOT add real owner names, phone numbers, LINE IDs, email addresses, or patient data to this file.
> - All estimates are clinic-provided approximations. They are NOT guaranteed revenue projections.
> - This document is safe to commit to the repository as written.

---

## Clinic Identity

| Field | Value |
|---|---|
| Internal pseudonym | **Clinic Alpha** |
| Real clinic name | `<STORED_IN_OPS_SYSTEM_ONLY — NOT_IN_REPO>` |
| City / Region | Bangkok metropolitan area |
| Clinic type | Aesthetic / Beauty |
| Branch count | 1 |
| Operating since | ~2019–2021 (estimate) |
| Clinic size | Small — 3–6 staff total |

---

## Decision Owner

| Field | Value |
|---|---|
| Pseudonym | Owner-A |
| Title | Clinic Owner / Managing Director |
| Contact details | `<STORED_IN_OPS_SYSTEM_ONLY — NOT_IN_REPO>` |
| Discovery call completed | Yes — 2026-05-28 |
| Verbal approval for pilot | Yes — confirmed during discovery |
| Written pilot agreement signed | No — pending |
| Agreement target date | `<TBD — within 7 days of Day 0 schedule>` |

> **Owner contact details are never stored in this repository.**
> Contact via ops/secure channel only.

---

## Staff / Operator Lead

| Field | Value |
|---|---|
| Pseudonym | Staff-A1 |
| Role | Front desk / CRM operator |
| Availability | Mon–Sat, ~09:00–18:00 local |
| LINE / contact | `<STORED_IN_OPS_SYSTEM_ONLY — NOT_IN_REPO>` |
| Technical contact | None — Owner-A handles approvals |

---

## Clinic Scale Estimates

> All values are discovery estimates. Confidence based on staff-provided information.
> These estimates are opportunity baselines only — not guaranteed outcomes.

| Metric | Estimate | Confidence |
|---|---|---|
| New leads per month | 60–80 | Medium |
| Active repeat customers | 120–180 | Low |
| New leads per week | 15–20 | Medium |
| No-show rate estimate | ~20–30% | Low |
| Average first response time to new lead | 2–6 hours | Medium |
| Current uncontacted lead backlog | ~20–40 leads | Low |
| Primary lead source | LINE OA + Instagram DM | High |
| Secondary lead source | Walk-in / word of mouth | Medium |

> Confidence key: High = staff can confirm from records. Medium = staff estimate. Low = rough guess.

---

## Main Communication Channels

- [x] LINE Official Account — **primary** inbound and outbound
- [x] Instagram DM — inbound only (manual pickup)
- [ ] Facebook Messenger — not primary
- [ ] Phone / SMS — occasional for urgent matters
- [x] Walk-in / In-clinic — significant for established customers

---

## Current Tools

| Tool | Usage |
|---|---|
| CRM / lead tracking | None — manual LINE chat + notes |
| Messaging | LINE OA — manual, no templates |
| Booking / scheduling | Manual — LINE + phone |
| EMR / medical record | Paper notes / basic spreadsheet |
| Marketing | Staff-composed LINE broadcasts — infrequent |

> **FlowBiz is not replacing EMR, scheduling, or payment systems in this pilot.**
> Scope is limited to follow-up messaging automation with HITL approval.

---

## Current Pain Points (Discovery-Stated)

> These are paraphrased from the owner/staff discovery conversation.
> These are their words about their problems — not FlowBiz claims about what the product can fix.

1. **Lost leads** — "New inquiries come in through LINE but we don't always reply fast enough, especially on weekends and evenings"
2. **Uncontacted backlog** — "We have a pile of leads in LINE we haven't followed up on — we just lose track"
3. **No-show problem** — "Many people who book don't show up. We call once and if no answer, we give up"
4. **Review requests inconsistent** — "We forget to ask customers for Google reviews. We know it's important but it never gets done"
5. **Botox/filler reminders missing** — "Customers who did Botox last year — we don't remind them when it's time again. We're losing repeat business"
6. **Staff time** — "My staff spends a lot of time typing the same messages over and over"

---

## Workflow Fit Assessment

| Workflow | Pain Match | Owner Interest | Priority |
|---|---|---|---|
| New Lead Welcome | Strong | High | 1 |
| Uncontacted Lead Alert | Strong | High | 2 |
| No-Show Recovery | Strong | High | 3 |
| Review Request | Moderate | Medium | 4 |
| Botox/Filler Repeat Reminder | Strong | High | 5 |

**All 5 selected workflows confirmed as a good fit for Clinic Alpha.**

---

## AI Concerns Raised (Discovery)

> Owner and staff concerns noted during discovery — used to guide HITL setup and training.

- "We don't want AI to say anything about medical results or safety guarantees"
- "Staff needs to check every message before it goes out — we can't trust AI completely"
- "We are worried about sending wrong messages to the wrong customer"
- "We want to be able to edit the AI draft before sending"

**FlowBiz response**: All AI suggestions enter HITL approval queue. No message sends without staff approval. Staff can approve, modify, or reject. This was explained and understood by Owner-A.

---

## Success Criteria (Owner-Stated)

> Owner's definition of pilot success in their own words (paraphrased).

| Target | Owner-Stated |
|---|---|
| Primary goal | "Staff responds to new leads more consistently, even if not immediately" |
| Secondary goal | "We stop losing Botox/filler repeat customers because we forgot to remind them" |
| Stretch goal | "Reduce time staff spends typing the same follow-up messages" |
| Success in their words | "If staff actually uses it and likes it, that's success" |

> FlowBiz does not guarantee any specific revenue increase, ROI, or clinical outcome from using this system.

---

## Data Mode for Pilot

- [x] **Demo** — Use FlowBiz demo data for Day 0 and initial training
- [ ] **Pseudonymized** — May be used in Week 1–2 if owner approves (TBD)
- [ ] **Limited Real Operational** — Not approved for initial pilot

Data mode confirmed by owner: Demo mode confirmed verbally. Written confirmation pending.
Expected progression: Demo (Day 0) → Pseudonymized (Weeks 1–2, pending written approval).

---

## Readiness Score

| Dimension | Score (0–3) | Notes |
|---|---|---|
| Owner engagement | 3 | Owner present in discovery call, enthusiastic |
| Staff availability | 2 | 1 designated operator confirmed, schedule slightly uncertain |
| Channel access (LINE OA) | 2 | Has LINE OA, admin access not yet confirmed for staging |
| Lead data quality | 1 | No structured data — manual LINE only |
| Workflow fit (top 5 workflows) | 3 | Strong fit across all 5 |
| Consent / data approval | 2 | Verbal approval, written pending |
| Technical readiness | 2 | No dedicated IT; owner handles setup coordination |

**Total: 15 / 21**

| Score | Recommendation |
|---|---|
| 18–21 | Proceed to limited pilot |
| **12–17** | **Proceed to demo-only first** ← this clinic |
| < 12 | Discovery / education phase needed |

---

## Fit Decision

- [ ] `PROCEED_TO_LIMITED_PILOT`
- [x] `DEMO_ONLY_FIRST` — Owner interested, demo confirmed, written agreement pending
- [ ] `DISCOVERY_NEEDED`
- [ ] `NOT_A_FIT`

**Decision rationale**: Clinic Alpha has strong workflow fit and enthusiastic owner but readiness score of 15/21 indicates demo-first is appropriate. LINE OA admin access and written agreement are prerequisites before any real data or real LINE send. Proceed to Day 0 demo session while collecting written consent.

---

## Open Items Before Day 0

| # | Item | Owner | Status |
|---|---|---|---|
| 1 | Written pilot agreement signed | Owner-A + FlowBiz | Pending |
| 2 | LINE OA admin access confirmed for staging | Owner-A | Pending |
| 3 | Staff-A1 staging account created | FlowBiz technical | Pending |
| 4 | Day 0 date scheduled | FlowBiz operator | Pending |
| 5 | Demo seed data confirmed on staging | FlowBiz technical | Pending |

---

## Notes from Discovery

- Discovery channel: `<SECURE_CHANNEL — NOT_IN_REPO>`
- Duration: ~45 minutes
- Participants: Owner-A, Staff-A1, FlowBiz operator
- Owner tone: Positive. Open to trying. Wants to see demo before committing to data sharing.
- Staff tone: Cautiously interested. Main concern: "will it be complicated to use?"
- Next contact: Schedule Day 0 demo within 7 days

---

## References

- [FIRST_PILOT_DISCOVERY_REPORT.md](FIRST_PILOT_DISCOVERY_REPORT.md)
- [FIRST_FRIENDLY_PILOT_SETUP.md](FIRST_FRIENDLY_PILOT_SETUP.md)
- [PILOT_SCOPE_AND_BOUNDARIES.md](PILOT_SCOPE_AND_BOUNDARIES.md)
- [PILOT_DATA_INTAKE_CHECKLIST.md](PILOT_DATA_INTAKE_CHECKLIST.md)
- [PILOT_DAY_0_RUNBOOK.md](PILOT_DAY_0_RUNBOOK.md)
- [../PILOT_DISCOVERY_QUESTIONNAIRE.md](../PILOT_DISCOVERY_QUESTIONNAIRE.md)
- [../PILOT_AGREEMENT_TERMS_DRAFT.md](../PILOT_AGREEMENT_TERMS_DRAFT.md)
