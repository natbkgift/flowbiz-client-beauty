# Clinic Alpha — Day 0 Preflight Re-Check Evidence Pack

Document type: POST-PHASE 10 PR-13 live staging evidence pack
Pilot clinic: Clinic Alpha (pseudonym only)
Execution date/time: 2026-05-28 05:44:38 +07:00
Operator: FlowBiz-Ops (pseudonym role)
Environment target: staging-safe only
Overall preflight status: FAIL

---

## 1) Scope and Objective

This preflight re-check was executed to close PR-12 friction and confirm readiness for a real Day 0 demo using live staging evidence.

Mandatory checks attempted:
- DNS/network reachability for staging URL
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
| DNS resolve for `staging.flowbiz.io` | Resolved host/IP | `DNS name does not exist` | FAIL |
| TCP connectivity to `staging.flowbiz.io:443` | `TcpTestSucceeded=True` | `TcpTestSucceeded=False` | FAIL |

Command evidence summary:
- Resolve-DnsName error: `staging.flowbiz.io : DNS name does not exist.`
- Test-NetConnection: remote port unresolved/0, connection false.

### B) API Health Endpoints

| Check | Expected | Actual | Result |
|---|---|---|---|
| `GET https://staging.flowbiz.io/api/live` | HTTP 200 | Host not found | FAIL |
| `GET https://staging.flowbiz.io/api/ready` | HTTP 200 | Host not found | FAIL |

Evidence:
- `/api/live` error: `No such host is known. (staging.flowbiz.io:443)`
- `/api/ready` error: `No such host is known. (staging.flowbiz.io:443)`

### C) Readiness Payload Assertions

| Assertion | Expected | Actual | Result |
|---|---|---|---|
| `appEnv=staging` | Confirmed from `/api/ready` payload | Not retrievable (endpoint unreachable) | BLOCKED |
| `DB=flowbiz_beauty_staging` | Confirmed from `/api/ready` payload | Not retrievable (endpoint unreachable) | BLOCKED |

### D) Smoke Test (Live)

| Check | Expected | Actual | Result |
|---|---|---|---|
| `npm run smoke:staging` live mode | PASS | `Smoke summary: FAIL - fetch failed` | FAIL |
| External send flags guard | PASS | PASS (`LINE real send` + `AI real generation` disabled) | PASS |

### E) Demo Login, HITL, Audit

| Check | Expected | Actual | Result |
|---|---|---|---|
| Demo login (`/api/auth/login`) | PASS | Host not found | FAIL |
| HITL queue visible (`/api/hitl/queue`) | PASS | Host not found | FAIL |
| Audit log visible (`/api/audit/logs`) | PASS | Host not found | FAIL |

Evidence:
- Login error: `No such host is known. (staging.flowbiz.io:443)`
- HITL error: `No such host is known. (staging.flowbiz.io:443)`
- Audit error: `No such host is known. (staging.flowbiz.io:443)`

### F) Selected Workflow Demo Path

| Workflow | Expected | Actual | Result |
|---|---|---|---|
| New Lead Welcome | Visible in live staging flow | Blocked by staging host unreachable | BLOCKED |
| Uncontacted Lead Alert | Visible in live staging flow | Blocked by staging host unreachable | BLOCKED |
| No-Show Recovery | Visible in live staging flow | Blocked by staging host unreachable | BLOCKED |
| Review Request | Visible in live staging flow | Blocked by staging host unreachable | BLOCKED |
| Botox/Filler Repeat Reminder | Visible in live staging flow | Blocked by staging host unreachable | BLOCKED |

---

## 3) Safety and Policy Evidence

| Constraint | Result | Notes |
|---|---|---|
| Use Clinic Alpha pseudonym only | PASS | No real clinic name recorded |
| Use demo seed/fake data only | PASS | No real data import executed |
| No real outbound LINE send | PASS | External send guard remains safe |
| No real Gemini generation | PASS | External generation guard remains safe |
| No secret exposure | PASS | No token/key printed in evidence |
| No ROI guarantee claim | PASS | None in this document |
| No medical outcome claim | PASS | None in this document |
| No runtime code changes | PASS | Docs/evidence only |
| No production deploy action | PASS | No deploy executed |

---

## 4) Evidence-Based Conclusion

Preflight cannot be approved for real Day 0 session at this time.

Root blocker:
- Staging DNS/network failure prevents all required live checks.

Decision implication:
- According to PR-13 decision rules, staging/network failure requires `NO_GO`.

---

## 5) Required Recovery Actions (Operational)

1. Fix or expose valid DNS/network route for the staging URL from operator network.
2. Re-run live checks and capture proof:
- `/api/live` HTTP 200
- `/api/ready` HTTP 200
- readiness payload includes `appEnv=staging`
- readiness payload includes DB `flowbiz_beauty_staging`
- `npm run smoke:staging` live PASS
- demo login PASS
- HITL queue visible
- audit log visible
3. Re-open go/no-go decision after all above checks are complete.

No runtime code change is proposed in this PR.

---

## 6) References

- CLINIC_ALPHA_DAY_0_DRY_RUN_REPORT.md
- CLINIC_ALPHA_DEMO_FRICTION_LOG.md
- CLINIC_ALPHA_REAL_DAY_0_GO_NO_GO.md
- CLINIC_ALPHA_DAY_0_DEMO_CHECKLIST.md
- CLINIC_ALPHA_DAY_0_REPORT_TEMPLATE.md
