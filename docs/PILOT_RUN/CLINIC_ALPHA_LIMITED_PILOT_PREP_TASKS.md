# Clinic Alpha — Limited Pilot Prep Tasks (PR-18)

Document type: Optional prep task pack after readiness flip
Pilot clinic: Clinic Alpha (pseudonym only)
Date: 2026-05-28
Decision baseline: READY_FOR_LIMITED_PILOT_PREP

---

## 1) Objective

Execute limited pilot preparation tasks without enabling real send modes or introducing unsafe data practices.

---

## 2) Prep Task Checklist

| Task ID | Task | Owner | Target Date (placeholder) | Status | Safety Note |
|---|---|---|---|---|---|
| LP-01 | Confirm Week 1 kickoff date/time and attendees (pseudonym only) | FlowBiz-Ops + Owner-A | YYYY-MM-DD | OPEN | No real contacts in repo |
| LP-02 | Finalize selected workflow set for pilot week 1 | FlowBiz-Ops + Staff-A1 | YYYY-MM-DD | OPEN | Keep HITL enforced |
| LP-03 | Confirm staff approver roster and role boundaries | Owner-A + FlowBiz-Ops | YYYY-MM-DD | OPEN | Least-privilege access |
| LP-04 | Prepare operator runbook for daily queue cadence | FlowBiz-Ops | YYYY-MM-DD | OPEN | No patient/real PII in examples |
| LP-05 | Validate staging-safe mode flags before kickoff | FlowBiz-Tech | YYYY-MM-DD | OPEN | Keep `LINE_REAL_SEND_ENABLED=false`, `AI_REAL_GENERATION_ENABLED=false` |
| LP-06 | Confirm consent/deletion-export operational handoff note | FlowBiz-Ops + Owner-A | YYYY-MM-DD | OPEN | Sanitized records only |
| LP-07 | Prepare week-1 risk watch and escalation contact roles | FlowBiz-Ops + FlowBiz-Tech | YYYY-MM-DD | OPEN | No secrets or tokens in docs |

---

## 3) Guardrails During Prep

1. Do not switch to real LINE send mode in this prep phase.
2. Do not enable real AI provider generation in this prep phase.
3. Do not import real customer data during prep unless separately approved and documented.
4. Do not store any credential/token/key in repository files.

---

## 4) Exit Criteria For Pilot Kickoff

1. Kickoff schedule confirmed.
2. Workflow scope confirmed.
3. Staff approvers confirmed.
4. Safe mode flags reconfirmed.
5. Escalation path confirmed.

---

## 5) Sign-Off (Pseudonym)

- Prepared by: FlowBiz-Ops
- Reviewed by: FlowBiz-Tech
- Owner acknowledgement: Owner-A
