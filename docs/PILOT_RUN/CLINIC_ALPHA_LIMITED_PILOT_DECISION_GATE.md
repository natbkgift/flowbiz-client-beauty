# Clinic Alpha — Limited Pilot Decision Gate (PR-17)

Document type: Formal decision gate for limited pilot preparation after owner approval execution
Pilot clinic: Clinic Alpha (pseudonym only)
Date: 2026-05-28
Evidence baseline: CLINIC_ALPHA_OWNER_APPROVAL_EVIDENCE.md

Allowed gate outcomes:
- READY_FOR_LIMITED_PILOT_PREP
- PENDING_OWNER_ACTION
- BLOCKED

Current gate outcome: PENDING_OWNER_ACTION

---

## 1) Gate Criteria Matrix

| Gate ID | Gate Criterion | Current Status | Evidence Source | Blocking Class |
|---|---|---|---|---|
| GATE-01 | Written agreement complete | PENDING_OWNER_ACTION | CLINIC_ALPHA_OWNER_APPROVAL_EVIDENCE.md (BL-01: agreement_received=no) | Business approval |
| GATE-02 | LINE OA access confirmed | PENDING_OWNER_ACTION | CLINIC_ALPHA_OWNER_APPROVAL_EVIDENCE.md (BL-02: access_confirmed=no) | Access |
| GATE-03 | Data handling confirmation complete | PENDING_OWNER_ACTION | CLINIC_ALPHA_OWNER_APPROVAL_EVIDENCE.md (BL-03: confirmation_received=no) | Data safety |
| GATE-04 | Staff approvers identified | PASS | Day 0 report + training records (Owner-A, Staff-A1 roles) | Non-blocking |
| GATE-05 | Selected workflows confirmed | PASS_WITH_NOTE | Day 0 live report workflow walkthrough | Non-blocking |
| GATE-06 | Safe operating mode confirmed | PASS | Safe flags and simulated mode requirement | Safety critical |
| GATE-07 | Support owner confirmed | PASS | FlowBiz-Ops + FlowBiz-Tech assigned | Non-blocking |
| GATE-08 | Rollback path confirmed | PASS | disable/fail-closed note in policy/runbook | Safety critical |

---

## 2) Decision Rules

Rule A:
- If all gate criteria complete with no safety/access/data red flags -> READY_FOR_LIMITED_PILOT_PREP.

Rule B:
- If business approvals are pending but no active safety/data/access breach -> PENDING_OWNER_ACTION.

Rule C:
- If any safety/data/access issue is unresolved or high risk -> BLOCKED.

Applied rule (current): Rule B

---

## 3) Current Decision Rationale

1. Technical and safety checks from PR-15 are passing.
2. Staff operator and support ownership are defined.
3. PR-17 sanitized evidence register still shows all three closure items pending owner action:
- written agreement
- LINE OA access confirmation
- consent/data handling confirmation

Therefore, outcome remains: PENDING_OWNER_ACTION

---

## 4) Exit Conditions To Upgrade

Change to READY_FOR_LIMITED_PILOT_PREP only when:
1. Signed agreement is confirmed.
2. LINE OA admin access checklist required items are confirmed.
3. Consent/data handling checklist is fully confirmed.
4. No safety/data/access blockers remain.

---

## 5) Escalation Conditions

Set outcome to BLOCKED immediately if:
1. Consent scope cannot be validated.
2. Access owner cannot be identified.
3. Unsafe send configuration is requested without approved QA.
4. Real customer data import is requested beyond approved minimum scope.

---

## 6) Sign-Off Record (Pseudonym)

- Gate owner: FlowBiz-Ops
- Technical reviewer: FlowBiz-Tech
- Business approver: Owner-A (pending)
- Last updated: 2026-05-28
