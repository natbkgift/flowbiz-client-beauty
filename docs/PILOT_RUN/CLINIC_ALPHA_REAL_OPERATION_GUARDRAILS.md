# Clinic Alpha - Real Operation Guardrails (PR-25)

Document type: PR-25 guardrail control sheet
Pilot clinic: Clinic Alpha (pseudonym only)
Date: 2026-05-28

---

## 1) Hard Guardrails

| Guardrail | Rule | Status |
|---|---|---|
| Environment | Canonical staging only (`https://beauty.flowbiz.cloud`) | ACTIVE |
| Production deploy | Forbidden | ACTIVE |
| Broad customer import | Forbidden | ACTIVE |
| Autonomous AI send | Forbidden | ACTIVE |
| HITL bypass | Forbidden | ACTIVE |
| Broadcast | Forbidden | ACTIVE |
| Multi-clinic rollout | Forbidden | ACTIVE |
| Workflow expansion | Forbidden | ACTIVE |
| Runtime code refactor | Forbidden | ACTIVE |
| Real AI generation | Forbidden | ACTIVE |

---

## 2) Allowed Operational Actions

Allowed actions only:
1. Review Request queue review.
2. approve/reject decisions by authorized operator.
3. modify-before-approve when content quality requires correction.
4. audit-window verification.
5. metric logging and value-signal capture.

---

## 3) Operator and Contact Controls

Operator allowlist:
1. Staff-A1
2. FlowBiz-Ops

Contact control:
1. approved contacts only
2. no unapproved contact activation
3. no batch/broadcast mode

---

## 4) Stop Conditions

Immediate stop conditions:
1. any HITL bypass event
2. any autonomous send event
3. any broad import event
4. any non-allowlisted operator action
5. any non-selected workflow action

Stop outcome label:
- BLOCKED
