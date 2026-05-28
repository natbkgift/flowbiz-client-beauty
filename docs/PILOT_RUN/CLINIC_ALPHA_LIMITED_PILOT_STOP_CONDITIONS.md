# Clinic Alpha - Limited Pilot Stop Conditions (PR-19)

Document type: No-go and stop-condition register
Pilot clinic: Clinic Alpha (pseudonym only)
Date: 2026-05-28
Decision baseline: READY_FOR_LIMITED_PILOT_PREP

---

## 1) Immediate Stop Conditions

Stop prep or pilot operations immediately if any condition occurs:

| Stop ID | Condition | Severity | Immediate Action |
|---|---|---|---|
| STOP-01 | HITL bypass | Critical | Disable outbound path, preserve audit, incident review |
| STOP-02 | Wrong recipient risk | Critical | Disable outbound path and review affected records |
| STOP-03 | Real customer data outside approved scope | Critical | Pause data use, isolate sample, review legal/data impact |
| STOP-04 | Credential exposure | Critical | Rotate outside repo, revoke access, incident review |
| STOP-05 | LINE send outside approved volume | Critical | Disable real send and review audit |
| STOP-06 | Medical claim risk | High | Reject draft, pause workflow, review safety policy |
| STOP-07 | Consent ambiguity | High | Pause affected workflow until clarified |
| STOP-08 | Staging unhealthy | High | Pause operational use until healthy |
| STOP-09 | Audit missing | Critical | Pause all workflows until audit restored |
| STOP-10 | Owner withdrawal | High | Stop prep or pilot, begin closeout |

---

## 2) No-Go Conditions Before Day 1

Set Day 1 status to NO-GO if:
1. decision gate is no longer READY_FOR_LIMITED_PILOT_PREP
2. data cap is disputed
3. access roles are incomplete
4. safe mode cannot be verified
5. HITL queue is not visible
6. audit is not visible
7. support owner is unavailable
8. any immediate stop condition is active

---

## 3) Stop Response

When a stop condition occurs:
1. Pause affected workflow.
2. Disable real send and real AI provider capability if relevant.
3. Preserve audit trail.
4. Notify FlowBiz-Tech and FlowBiz-Ops.
5. Notify Owner-A through approved external channel.
6. Record sanitized incident note.
7. Do not resume until the stop condition is resolved and approved.

---

## 4) Resume Requirements

Resume only when:
1. root cause is understood
2. affected workflow is safe
3. audit evidence is preserved
4. Owner-A is informed
5. FlowBiz-Tech approves technical readiness
6. FlowBiz-Ops updates the prep report

---

## 5) Decision

Stop-condition register status:
- READY_FOR_DAY_1_PREP
