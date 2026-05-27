# Clinic Alpha — Day 0 Network Recovery and Canonical URL Report

Document type: POST-PHASE 10 PR-14 network recovery and canonical URL confirmation
Pilot clinic: Clinic Alpha (pseudonym only)
Date: 2026-05-28
Operator: FlowBiz-Ops (pseudonym role)
Status: PASS

---

## 1) Objective

Close PR-13 blocker by identifying the correct staging URL and re-running live preflight evidence on that canonical URL.

---

## 2) Canonical URL Determination

### Sources reviewed

- README.md
- docs/STAGING_LIVE_SMOKE_REPORT.md
- docs/STAGING_DISK_RECOVERY_REPORT.md
- docs/CONTROLLED_REAL_INTEGRATION_TEST_REPORT.md
- scripts/smoke-staging.js
- package.json

### Findings

1. Historical live smoke and controlled integration reports consistently reference:
- `https://beauty.flowbiz.cloud`

2. `scripts/smoke-staging.js` does not hardcode a staging host.
- It uses `BASE_URL` and `API_BASE_URL`.
- If not set, fallback is localhost defaults.

3. Candidate comparison from live checks:
- `beauty.flowbiz.cloud` resolves and accepts TCP 443.
- `staging.flowbiz.io` does not resolve in DNS and fails TCP check.

### Canonical decision

Canonical staging URL for this project is:
- `https://beauty.flowbiz.cloud`

URL status for `https://staging.flowbiz.io`:
- wrong/deprecated for this staging verification flow (non-resolving host in current environment)

---

## 3) Required Command Evidence

Commands executed:

1. `git status --short --branch`
2. `Resolve-DnsName beauty.flowbiz.cloud`
3. `Resolve-DnsName staging.flowbiz.io`
4. `Test-NetConnection beauty.flowbiz.cloud -Port 443`
5. `Test-NetConnection staging.flowbiz.io -Port 443`
6. `Invoke-WebRequest <canonical>/api/live`
7. `Invoke-WebRequest <canonical>/api/ready`
8. `npm run smoke:staging` with:
- `BASE_URL=https://beauty.flowbiz.cloud`
- `API_BASE_URL=https://beauty.flowbiz.cloud/api`
- `EXPECT_DEMO_DATA=true`
9. Demo login via API using demo seed account
10. Authenticated HITL queue check
11. Authenticated audit log check

All commands were run with staging-safe settings (real send and real AI generation disabled).

---

## 4) Evidence Summary

| Evidence item | Result |
|---|---|
| DNS: beauty.flowbiz.cloud | PASS |
| DNS: staging.flowbiz.io | FAIL (non-resolving) |
| TCP 443: beauty.flowbiz.cloud | PASS |
| TCP 443: staging.flowbiz.io | FAIL |
| `/api/live` on canonical | PASS (200) |
| `/api/ready` on canonical | PASS (200) |
| `appEnv=staging` | PASS |
| DB name = `flowbiz_beauty_staging` | PASS |
| `npm run smoke:staging` live | PASS (8 checks) |
| Demo login | PASS |
| HITL queue visible (authenticated) | PASS |
| Audit log visible (authenticated) | PASS |
| Selected workflows visible | PARTIAL — no explicit workflow-name field in queue payload; see limitation note |
| No real customer data used | PASS |
| No real outbound send | PASS |
| No secret exposure | PASS |

---

## 5) Limitation Note (Selected Workflows)

The authenticated HITL queue payload exposes queue/message metadata but does not directly expose a workflow-name field in current API response.

Implication:
- Workflow-name visibility is recorded as a data-shape limitation, not a readiness blocker.
- Day 0 operator should verify workflow labels in UI during the live facilitation walk-through.

---

## 6) Outcome

PR-13 blocker is closed.

- Canonical URL confirmed: `https://beauty.flowbiz.cloud`
- Previous URL `https://staging.flowbiz.io` is not valid for current staging preflight evidence.
- Live preflight checks on canonical URL are successful for health/readiness/smoke/login/HITL/audit.

---

## 7) Safety Confirmation

- Clinic pseudonym only (Clinic Alpha)
- No real clinic identity committed
- No real phone/LINE ID/email committed
- No secrets committed
- No real outbound LINE send
- No production deployment
- No runtime code change
- No ROI guarantee claim
- No medical outcome claim

---

## 8) References

- CLINIC_ALPHA_DAY_0_PREFLIGHT_EVIDENCE.md
- CLINIC_ALPHA_DEMO_FRICTION_LOG.md
- CLINIC_ALPHA_REAL_DAY_0_GO_NO_GO.md
- STAGING_LIVE_SMOKE_REPORT.md
- STAGING_DISK_RECOVERY_REPORT.md
- CONTROLLED_REAL_INTEGRATION_TEST_REPORT.md
