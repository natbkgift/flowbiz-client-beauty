# First Friendly Pilot Setup — FlowBiz Beauty

Date: 2026-05-28
Version: 1.0
Status: READY_FOR_DISCOVERY

---

## Pilot Purpose

This document defines the setup framework for FlowBiz Beauty's first friendly pilot with a real aesthetic clinic.

The pilot validates that FlowBiz Beauty can improve clinic revenue operations through better lead follow-up visibility, reduced uncontacted leads, no-show recovery, review generation, and repeat-service reminders — without replacing clinical judgement, EMR, scheduling, or the clinic's existing legal/compliance responsibilities.

This is a controlled, auditable, reversible pilot. It is:
- **NOT** a production rollout
- **NOT** a multi-clinic rollout
- **NOT** a full CRM/EMR replacement
- **NOT** a medical-advice system
- **NOT** a guaranteed-revenue commitment

---

## Pilot Clinic Placeholder

| Field | Value |
|---|---|
| Clinic name | `<CLINIC_NAME_PLACEHOLDER>` |
| Pseudonym (internal) | `<CLINIC_PSEUDONYM>` — e.g. "Clinic A" |
| City/Region | `<CITY_REGION>` |
| Clinic type | Aesthetic / Beauty clinic |
| Decision owner | `<OWNER_NAME_PLACEHOLDER>` |
| Owner contact | `<OWNER_CONTACT_PLACEHOLDER>` |

> All placeholders must be replaced before Day 0 activities begin.
> No real customer data may be imported until owner approval is documented.

---

## Pilot Owner (Clinic Side)

- Name: `<CLINIC_OWNER_OR_AUTHORIZED_REP>`
- Role: Clinic owner or authorized representative
- Responsibilities:
  - Approve pilot scope and data mode
  - Confirm consent basis for any outreach workflow
  - Designate staff operator(s)
  - Review and sign pilot agreement terms draft
  - Receive weekly check-in summaries
  - Make go/no-go decision for paid conversion

---

## FlowBiz Operator

- Name: `<FLOWBIZ_OPERATOR_NAME>`
- Role: Pilot operator / customer success lead
- Responsibilities:
  - Configure staging environment for clinic
  - Onboard clinic staff
  - Monitor HITL queue daily
  - Track baseline and weekly metrics
  - Conduct weekly check-in calls
  - Escalate technical issues
  - Prepare pilot exit report

---

## Pilot Duration

- Recommended: **14–30 days**
- Start date: `<DAY_0_DATE>`
- End date: `<DAY_0_DATE + 14 to 30 days>`
- Extension: By written / documented owner agreement only

---

## Selected Workflows — Round 1

The following 5 workflows are selected for the first pilot. No additional workflows should be enabled without clinic owner approval.

| # | Workflow | Description |
|---|---|---|
| 1 | **New Lead Welcome** | First-touch message drafted by AI, reviewed via HITL, queued for staff send |
| 2 | **Uncontacted Lead Alert** | Flag leads with no contact in 48h+ for staff follow-up |
| 3 | **No-Show Recovery** | Draft recovery outreach for leads who missed consultation |
| 4 | **Review Request** | Draft post-service review request for satisfied customers |
| 5 | **Botox/Filler Repeat Reminder** | Remind patients nearing repeat treatment window |

> **Rule**: Only these 5 workflows will be active. All others remain disabled.
> If clinic team is not ready for all 5, start with fewer and add only after staff confirm comfort.

---

## Not Included in This Pilot

The following are explicitly excluded:

- Lead Qualification Nurture (complex multi-step — next phase)
- Daily Marketing Reminder (broadcast risk — excluded)
- Mass or scheduled broadcast of any kind
- AI auto-send to real customers
- Full CRM features (pipeline analytics, multi-branch rollup)
- EMR integration
- Payment/invoice workflow
- Doctor scheduling
- Inventory
- Any non-staging environment

---

## Approval Checklist — Before Pilot Start

All items must be confirmed before Day 0:

- [ ] Pilot clinic owner identity confirmed and documented
- [ ] Pilot agreement terms reviewed and owner acknowledgement recorded
- [ ] Data mode agreed: `demo` / `pseudonymized` / `limited real operational`
- [ ] Consent basis for outreach workflows confirmed by owner
- [ ] Staff roles and accounts defined (least privilege)
- [ ] Selected workflows confirmed with owner
- [ ] HITL workflow explained to all staff who will approve
- [ ] AI safety rules and prohibited content explained to staff
- [ ] Staging environment confirmed healthy (`/api/ready`)
- [ ] Demo clinic seed available for onboarding walkthrough
- [ ] Rollback plan reviewed by FlowBiz technical owner
- [ ] Support/escalation contact shared with clinic
- [ ] Baseline metrics template filled with pre-pilot estimates
- [ ] Weekly check-in date/time agreed

---

## Go / No-Go Before Start

**GO** only if all of the following are true:

- [ ] Owner approval documented
- [ ] Data mode agreed and documented
- [ ] Staging environment healthy
- [ ] No critical risks open in risk register
- [ ] HITL confirmed working (smoke test passed)
- [ ] LINE real send disabled by default (or QA-gated if approved)
- [ ] Gemini real generation disabled by default (or QA-gated if approved)
- [ ] Staff accounts created and tested
- [ ] Demo walkthrough completed

**NO-GO** if any of the following:

- Owner approval not documented
- Data mode unclear
- Staging unhealthy
- Critical HITL or tenant isolation issue open
- Real provider mode active without QA gate
- No rollback plan confirmed

---

## Final Readiness Decision

| Decision | Condition |
|---|---|
| `READY_FOR_DISCOVERY` | No clinic confirmed yet — ready for outreach |
| `READY_FOR_DEMO_ONLY` | Clinic interested but owner approval/data mode not yet agreed |
| `READY_FOR_LIMITED_PILOT` | Owner approved + data mode agreed + staging healthy + all checklist items confirmed |
| `BLOCKED` | Critical risk, staging failure, or consent gap — stop and resolve |

**Current decision: `READY_FOR_DISCOVERY`**

> No clinic has been formally confirmed at time of writing.
> This document and all PILOT_RUN documents are prepared in advance of first clinic discovery/outreach.

---

## References

- [PILOT_CLINIC_PROFILE.md](PILOT_CLINIC_PROFILE.md)
- [PILOT_SCOPE_AND_BOUNDARIES.md](PILOT_SCOPE_AND_BOUNDARIES.md)
- [PILOT_DATA_INTAKE_CHECKLIST.md](PILOT_DATA_INTAKE_CHECKLIST.md)
- [PILOT_STAFF_ACCESS_PLAN.md](PILOT_STAFF_ACCESS_PLAN.md)
- [PILOT_LINE_GEMINI_OPERATING_MODE.md](PILOT_LINE_GEMINI_OPERATING_MODE.md)
- [PILOT_BASELINE_METRICS.md](PILOT_BASELINE_METRICS.md)
- [PILOT_DAY_0_RUNBOOK.md](PILOT_DAY_0_RUNBOOK.md)
- [PILOT_WEEKLY_OPERATING_CADENCE.md](PILOT_WEEKLY_OPERATING_CADENCE.md)
- [PILOT_EXIT_AND_CONVERSION_CRITERIA.md](PILOT_EXIT_AND_CONVERSION_CRITERIA.md)
- [PILOT_ROLLBACK_AND_DISABLE_PLAN.md](PILOT_ROLLBACK_AND_DISABLE_PLAN.md)
- [FIRST_PILOT_SETUP_REPORT.md](FIRST_PILOT_SETUP_REPORT.md)
