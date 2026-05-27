# Clinic Alpha — Day 0 Preflight Re-Check Evidence Pack

Document type: POST-PHASE 10 PR-14 live staging evidence closure
Pilot clinic: Clinic Alpha (pseudonym only)
Execution date/time: 2026-05-28
Operator: FlowBiz-Ops (pseudonym role)
Environment target: staging-safe only
Canonical staging URL: https://beauty.flowbiz.cloud
Overall preflight status: PASS

---

## 1) Scope and Objective

This preflight re-check was executed to close PR-13 blockers by first confirming canonical staging URL and then rerunning all live checks on that canonical host.

Mandatory checks attempted:
- DNS/network reachability for both candidate staging URLs
- `GET /api/live`
- `GET /api/ready`
- readiness payload checks (`appEnv=staging`, `DB=flowbiz_beauty_staging`)
- `npm run smoke:staging` in live mode
- demo login verification
- HITL queue visibility
- audit log visibility
- selected workflows visibility path
- safety and data constraints verification

---

## 2) Live Evidence Results

### A) DNS and Network

| Check | Expected | Actual | Result |
|---|---|---|---|
| DNS resolve for `beauty.flowbiz.cloud` | Resolved host/IP | Resolved to public IP | PASS |
| DNS resolve for `staging.flowbiz.io` | Resolved host/IP | `DNS name does not exist` | FAIL |
| TCP connectivity to `beauty.flowbiz.cloud:443` | `TcpTestSucceeded=True` | `TcpTestSucceeded=True` | PASS |
| TCP connectivity to `staging.flowbiz.io:443` | `TcpTestSucceeded=True` | `TcpTestSucceeded=False` | FAIL |

Command evidence summary:
- `beauty.flowbiz.cloud` resolved and passed TCP 443.
- `staging.flowbiz.io` did not resolve and failed TCP 443.
- Canonical host selected: `https://beauty.flowbiz.cloud`.

### B) API Health Endpoints (Canonical)

| Check | Expected | Actual | Result |
|---|---|---|---|
| `GET https://beauty.flowbiz.cloud/api/live` | HTTP 200 | HTTP 200 | PASS |
| `GET https://beauty.flowbiz.cloud/api/ready` | HTTP 200 | HTTP 200 | PASS |

Evidence:
- `/api/live` returned liveness JSON with `appEnv=staging`.
- `/api/ready` returned readiness JSON with connected staging DB.

### C) Readiness Payload Assertions (Canonical)

| Assertion | Expected | Actual | Result |
|---|---|---|---|
| `appEnv=staging` | Confirmed from `/api/ready` payload | `staging` | PASS |
| `DB=flowbiz_beauty_staging` | Confirmed from `/api/ready` payload | `flowbiz_beauty_staging` | PASS |

### D) Smoke Test (Live, Canonical)

| Check | Expected | Actual | Result |
|---|---|---|---|
| `npm run smoke:staging` live mode | PASS | PASS (`Smoke summary: 8 checks recorded, PASS`) | PASS |
| External send flags guard | PASS | PASS (`LINE real send` + `AI real generation` disabled) | PASS |

### E) Demo Login, HITL, Audit (Authenticated)

| Check | Expected | Actual | Result |
|---|---|---|---|
| Demo login (`/api/auth/login`) | PASS | HTTP 200 + token returned | PASS |
| HITL queue visible (`/api/ai-agent/approval-queue`) | PASS | HTTP 200 + pending items returned | PASS |
| Audit log visible (`/api/audit/logs`) | PASS | HTTP 200 + items returned | PASS |

Evidence:
- Login passed with authenticated token flow.
- HITL queue returned pending approval rows.
- Audit log returned recent action rows.

### F) Selected Workflow Demo Path

| Workflow | Expected | Actual | Result |
|---|---|---|---|
| New Lead Welcome | Visible in live staging flow | API queue payload does not include explicit workflow-name field | LIMITATION_NOTED |
| Uncontacted Lead Alert | Visible in live staging flow | API queue payload does not include explicit workflow-name field | LIMITATION_NOTED |
| No-Show Recovery | Visible in live staging flow | API queue payload does not include explicit workflow-name field | LIMITATION_NOTED |
| Review Request | Visible in live staging flow | API queue payload does not include explicit workflow-name field | LIMITATION_NOTED |
| Botox/Filler Repeat Reminder | Visible in live staging flow | API queue payload does not include explicit workflow-name field | LIMITATION_NOTED |

Limitation note:
- Selected workflow labels should be confirmed in UI during operator run-through.
- This is recorded as a payload-visibility limitation, not a preflight blocker.

---

## 3) Safety and Policy Evidence

| Constraint | Result | Notes |
|---|---|---|
| Use Clinic Alpha pseudonym only | PASS | No real clinic name recorded |
| Use demo seed/fake data only | PASS | No real data import executed |
| No real outbound LINE send | PASS | External send guard remains safe |
| No real Gemini generation | PASS | External generation guard remains safe |
| No secret exposure | PASS | No secrets committed; auth token not stored in report |
| No ROI guarantee claim | PASS | None in this document |
| No medical outcome claim | PASS | None in this document |
| No runtime code changes | PASS | Docs/evidence only |
| No production deploy action | PASS | No deploy executed |

---

## 4) Evidence-Based Conclusion

Preflight evidence closure is complete on canonical staging URL.

Decision implication:
- According to PR-14 decision rules, canonical staging URL passes required evidence.
- Go/no-go can be upgraded to `GO_FOR_REAL_DAY_0_DEMO`.

---

## 5) Required Recovery Actions (Operational)

1. Keep preflight command set pinned to canonical URL: `https://beauty.flowbiz.cloud`.
2. Mark `https://staging.flowbiz.io` as wrong/deprecated for this project runbook path.
3. Add one UI screenshot capture step for explicit workflow labels during final operator rehearsal.

No runtime code change is proposed in this PR.

---

## 6) References

- CLINIC_ALPHA_DAY_0_NETWORK_RECOVERY_REPORT.md
- CLINIC_ALPHA_DEMO_FRICTION_LOG.md
- CLINIC_ALPHA_REAL_DAY_0_GO_NO_GO.md
- CLINIC_ALPHA_DAY_0_DEMO_CHECKLIST.md
- CLINIC_ALPHA_DAY_0_REPORT_TEMPLATE.md
