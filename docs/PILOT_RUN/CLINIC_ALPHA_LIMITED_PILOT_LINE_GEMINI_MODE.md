# Clinic Alpha - Limited Pilot LINE and Gemini Mode (PR-19)

Document type: Safe operating mode for limited pilot prep
Pilot clinic: Clinic Alpha (pseudonym only)
Date: 2026-05-28
Decision baseline: READY_FOR_LIMITED_PILOT_PREP

---

## 1) Default Safe Mode

Day 1 prep default:

| Setting | Value |
|---|---|
| LINE integration mode | simulated |
| Real LINE send | disabled |
| AI provider mode | mock |
| Real Gemini generation | disabled |

This is the only mode approved by PR-19.

---

## 2) Real LINE Send

Real LINE send is not enabled in PR-19.

Restricted one-to-one real send may be considered later only when all conditions are met:
1. separate LINE QA approval exists
2. Owner-A confirms the send checkpoint
3. Staff-A1 is active as HITL approver
4. recipient consent basis is verified outside repo
5. audit trail is readable
6. send volume stays within the pilot cap

Mass broadcast is never allowed in this pilot prep scope.

---

## 3) Real Gemini Generation

Real Gemini generation is not enabled in PR-19.

Restricted generation may be considered later only when all conditions are met:
1. separate Gemini QA approval exists
2. provider credentials remain outside repo
3. HITL queue is confirmed working
4. prohibited-content controls are active
5. FlowBiz-Ops monitors queue each operating day
6. every draft remains review-only until staff action

---

## 4) HITL Rule

1. AI draft enters pending review.
2. Staff-A1 approves, modifies, or rejects.
3. Approval does not automatically send anything.
4. Outbound action requires a deliberate separate step.
5. Every decision must be auditable.

Any AI-generated customer-facing text sent without a matching HITL approval is a critical stop condition.

---

## 5) Pilot Send Volume Cap

PR-19 cap:
- real send volume: 0
- broadcast volume: 0

If a later QA-approved restricted send test is created, proposed cap:
- maximum 10 one-to-one sends per operating day
- only selected workflows
- only approved recipients
- no batch scheduling
- no broadcast

---

## 6) Rollback Flags

Emergency safe values:
1. LINE integration mode: simulated.
2. Real LINE send: disabled.
3. AI provider mode: mock.
4. Real Gemini generation: disabled.

These values belong in staging operations only and must not be committed as live credentials or environment files.

---

## 7) Credential Handling

1. Provider credentials stay in external operational storage only.
2. No credential value is written in repo.
3. No credential value is pasted into docs, commits, issues, or chat logs.
4. Access to credential storage is limited to FlowBiz-Tech.

---

## 8) Decision

LINE and Gemini mode status:
- READY_FOR_DAY_1_PREP
