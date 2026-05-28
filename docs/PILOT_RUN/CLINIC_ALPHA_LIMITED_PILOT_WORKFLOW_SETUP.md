# Clinic Alpha - Limited Pilot Workflow Setup (PR-19)

Document type: Limited pilot workflow setup plan
Pilot clinic: Clinic Alpha (pseudonym only)
Date: 2026-05-28
Decision baseline: READY_FOR_LIMITED_PILOT_PREP

---

## 1) Workflow Limit

PR-19 limits setup to four workflows. No other workflow is activated without owner acknowledgement and a separate scope note.

Selected workflows:
1. New lead welcome.
2. No-show recovery.
3. Review request.
4. Repeat visit reminder.

---

## 2) Workflow Setup Matrix

| Workflow | Owner | Sample Data Needed | HITL Touchpoint | Metric Generated | Activation Mode | Rollback |
|---|---|---|---|---|---|---|
| New lead welcome | FlowBiz-Ops + Staff-A1 | Lead status, source, consent metadata | Staff approves or edits draft before outbound | first response time, HITL decision | Simulated by default | Pause workflow; keep audit |
| No-show recovery | FlowBiz-Ops + Staff-A1 | No-show marker, last contact timestamp, consent metadata | Staff approves or rejects recovery draft | follow-up attempt, rebooking signal | Simulated by default | Pause workflow; remove from queue |
| Review request | FlowBiz-Ops + Staff-A1 | Completed visit marker, consent metadata | Staff reviews wording before outbound | requests prepared, approval rate | Simulated by default | Pause workflow; block outbound |
| Repeat visit reminder | FlowBiz-Ops + Staff-A1 | Reminder category, due window, consent metadata | Staff reviews timing and wording | reminders prepared, staff action | Simulated by default | Pause workflow; clear pending items |

---

## 3) Activation Rules

1. All workflows begin in simulated mode.
2. Every AI suggestion enters HITL review.
3. No outbound action occurs automatically.
4. Any real one-to-one send requires separate QA approval and owner confirmation.
5. Broadcast is not allowed.

---

## 4) Sample Data Rules

1. Use demo data first.
2. Use pseudonymized data only when workflow shape cannot be tested with demo data.
3. Use minimal operational sample only within the documented cap.
4. Do not use medical records.
5. Do not use full chat history.
6. Do not include real contact identifiers in repo.

---

## 5) Workflow Stop Conditions

Pause a workflow if:
1. HITL queue is bypassed.
2. Audit events are missing.
3. A draft contains medical advice or outcome risk.
4. Consent scope is unclear.
5. Staff reports the workflow is confusing or unsafe.
6. Staging health is degraded.

---

## 6) Decision

Workflow setup status:
- READY_FOR_DAY_1_PREP
