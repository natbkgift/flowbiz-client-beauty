# Clinic Alpha — LINE OA Access Checklist (PR-16)

Document type: LINE OA access request and safety checklist
Pilot clinic: Clinic Alpha (pseudonym only)
Date: 2026-05-28
Status: PENDING_OWNER_ACTION

---

## 1) Scope

This checklist confirms minimum access and safety controls for pilot-stage LINE OA integration readiness.

This checklist does not authorize real broadcast, production rollout, or credential storage in repo.

---

## 2) Access Requirement Checklist

| Item ID | Requirement | Owner | Evidence Required | Status |
|---|---|---|---|---|
| LINE-01 | Test/staging LINE OA context is identified | Owner-A + FlowBiz-Tech | Environment note referencing staging context | PENDING_OWNER_ACTION |
| LINE-02 | LINE OA admin access is granted to approved operator(s) | Owner-A | Access grant confirmation (outside repo) | PENDING_OWNER_ACTION |
| LINE-03 | Token/secret handling remains outside repository | FlowBiz-Tech | Attestation: no token/secret committed | PASS |
| LINE-04 | Webhook URL placeholder is prepared | FlowBiz-Tech | Placeholder recorded: `https://<staging-domain>/api/integrations/line/webhook` | PENDING_OWNER_ACTION |
| LINE-05 | Broadcast send is disabled by policy | FlowBiz-Ops | Operating policy note confirmed | PASS |
| LINE-06 | No real customer send until explicit approval checkpoint | Owner-A + FlowBiz-Ops | Written checkpoint acknowledgment | PENDING_OWNER_ACTION |
| LINE-07 | One controlled test user is defined for first verification | Owner-A + FlowBiz-Tech | Pseudonym test-user plan (no real ID in repo) | PENDING_OWNER_ACTION |
| LINE-08 | Disable switch and rollback path are documented | FlowBiz-Tech | Runtime safety note references fail-closed mode | PASS |

---

## 3) Runtime Safety Baseline

Required defaults during follow-up stage:
- `LINE_INTEGRATION_MODE=simulated`
- `LINE_REAL_SEND_ENABLED=false`
- `AI_REAL_GENERATION_ENABLED=false`

Controls:
1. No real outbound send while status is PENDING_OWNER_ACTION.
2. No credentials or webhook secrets in repository.
3. Any move toward real mode requires separate QA checklist and explicit approval.

---

## 4) Controlled First-Test Plan (Template)

1. Confirm one controlled test user (pseudonym only in repo note).
2. Verify webhook endpoint format and signature handling path.
3. Execute one low-risk test message in controlled conditions only after approval.
4. Confirm audit trail event presence for outbound attempt/block decision.
5. Stop immediately if consent/access/safety uncertainty appears.

---

## 5) Decision Impact

- If all required pending items close: contributes to READY_FOR_LIMITED_PILOT_PREP.
- If owner approval or access remains pending: overall decision remains PENDING_OWNER_ACTION.
- If safety or access anomaly is detected: escalate decision to BLOCKED.

---

## 6) Sign-Off Record (Pseudonym)

- Prepared by: FlowBiz-Tech
- Reviewed by: FlowBiz-Ops
- Owner approval: Pending (Owner-A)
- Last update: 2026-05-28
