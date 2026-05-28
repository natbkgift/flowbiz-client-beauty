# Clinic Alpha - Limited Pilot Metrics Capture (PR-19)

Document type: Metrics capture plan for limited pilot prep
Pilot clinic: Clinic Alpha (pseudonym only)
Date: 2026-05-28
Decision baseline: READY_FOR_LIMITED_PILOT_PREP

---

## 1) Metrics Principles

1. Capture operational signals only.
2. Mark unknown baseline values as Unknown.
3. Do not fabricate numbers.
4. Treat opportunity estimates as conservative context only.
5. Do not claim certain financial return, revenue lift, or clinical result.

---

## 2) Baseline Metrics

Baseline fields to capture before Day 1 operational use:

| Area | Metric | Source | Confidence |
|---|---|---|---|
| Lead volume | new leads per week | staff estimate or dashboard | Unknown until captured |
| Lead response | average first response time | staff estimate or audit | Unknown until captured |
| Backlog | uncontacted lead count | staff estimate or dashboard | Unknown until captured |
| No-show | no-show count per week | staff estimate | Unknown until captured |
| Review | review requests per week | staff estimate | Unknown until captured |
| Repeat reminder | eligible reminders per week | staff estimate | Unknown until captured |
| Staff time | manual follow-up time | staff estimate | Unknown until captured |

---

## 3) Daily Metrics

Daily capture:
1. staging health status
2. new sample records added
3. HITL items created
4. HITL items approved
5. HITL items modified
6. HITL items rejected
7. HITL items pending longer than 24 hours
8. workflow issues logged
9. real-send count, expected to remain 0 unless separately approved

---

## 4) Weekly Metrics

Weekly capture:
1. total HITL items by workflow
2. approval, modification, and rejection rate
3. average HITL review time
4. uncontacted lead backlog trend
5. no-show follow-up attempts
6. repeat reminder actions prepared
7. review request actions prepared
8. staff feedback themes
9. open risks and mitigations

---

## 5) LINE Metrics

Safe default:
- real-send count: 0
- broadcast count: 0

If separate QA approval later permits restricted one-to-one send:
1. count approved one-to-one sends
2. count blocked send attempts
3. verify no broadcast event
4. verify every outbound event has a matching HITL approval

---

## 6) AI Suggestion Metrics

Capture:
1. suggestions generated
2. suggestions approved
3. suggestions modified
4. suggestions rejected
5. prohibited-content flags
6. missing-HITL incidents
7. staff quality feedback

Any missing-HITL incident is a stop condition.

---

## 7) Staff Adoption Metrics

Capture:
1. active HITL reviewer days
2. average review time
3. pending queue age
4. number of staff questions
5. workflow confusion notes
6. training follow-up needed

---

## 8) Conservative Opportunity Estimate

Opportunity estimates may be recorded only as conservative operational context:
1. recovered follow-up opportunities
2. reduced backlog opportunities
3. staff time saved estimate

Rules:
1. Use ranges or Unknown when data quality is low.
2. Do not present estimates as certain results.
3. Do not use prep estimates in sales materials.

---

## 9) Decision

Metrics capture status:
- READY_FOR_DAY_1_PREP
