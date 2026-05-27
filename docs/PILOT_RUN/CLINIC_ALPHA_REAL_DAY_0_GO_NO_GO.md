# Clinic Alpha — Real Day 0 Go/No-Go Decision

Document type: PR-13 decision memo for real Day 0 session
Pilot clinic: Clinic Alpha (pseudonym)
Decision date: 2026-05-28
Decision owner: FlowBiz-Ops + FlowBiz-Tech
Current decision: NO_GO

---

## Decision Options

- GO_FOR_REAL_DAY_0_DEMO
- GO_WITH_FIXES
- NO_GO

Selected: NO_GO

---

## Rule Applied

PR-13 decision rules define:
- If all required evidence passes: GO_FOR_REAL_DAY_0_DEMO
- If staging/network still fails: NO_GO
- If only minor non-blocking issues: GO_WITH_FIXES

Applied outcome:
- Staging/network checks failed in live preflight.
- Therefore decision is NO_GO.

---

## Decision Basis (PR-13 Live Evidence)

### A) Technical and Safety Status

| Gate | Expected | Current | Result |
|---|---|---|---|
| DNS resolve for `staging.flowbiz.io` | Success | DNS name does not exist | FAIL |
| Network to `staging.flowbiz.io:443` | Reachable | `TcpTestSucceeded=False` | FAIL |
| `/api/live` | HTTP 200 | Host not found | FAIL |
| `/api/ready` | HTTP 200 | Host not found | FAIL |
| readiness `appEnv=staging` | Confirmed from payload | Payload unavailable | BLOCKED |
| readiness DB `flowbiz_beauty_staging` | Confirmed from payload | Payload unavailable | BLOCKED |
| `npm run smoke:staging` (live) | PASS | FAIL (`fetch failed`) | FAIL |
| Demo login | PASS | FAIL (host not found) | FAIL |
| HITL queue visibility | PASS | FAIL (host not found) | FAIL |
| Audit log visibility | PASS | FAIL (host not found) | FAIL |
| External send flags disabled | PASS | PASS | PASS |
| No real data / no secrets in artifacts | PASS | PASS | PASS |

### B) Session/Content Readiness

| Item | Current | Result |
|---|---|---|
| Day 0 agenda | Complete | PASS |
| Demo checklist | Complete | PASS |
| Day 0 report template | Complete | PASS |
| Dry-run report and preflight evidence pack | Complete | PASS |
| Live staging evidence completeness | Incomplete | FAIL |

---

## Why NO_GO

NO_GO is selected because required live technical evidence did not pass.
The blocker is not minor; it prevents all core live verifications needed before a real owner/staff demo.

Specific blockers:
1. Staging DNS failure.
2. Endpoint failure (`/api/live`, `/api/ready`).
3. Smoke live failure.
4. Login/HITL/audit evidence unavailable.

---

## Required Actions Before Reconsidering Decision

| Priority | Action | Owner | Acceptance Criteria |
|---|---|---|---|
| P1 | Restore staging DNS/network reachability from operator network | FlowBiz-Tech | DNS resolve success + TCP 443 reachable |
| P1 | Re-run `/api/live` and `/api/ready` checks | FlowBiz-Tech | Both return HTTP 200 |
| P1 | Confirm readiness payload fields | FlowBiz-Tech | `appEnv=staging` and DB `flowbiz_beauty_staging` present |
| P1 | Re-run smoke test live | FlowBiz-Tech | `npm run smoke:staging` PASS |
| P1 | Verify demo login, HITL queue, audit visibility | FlowBiz-Ops | All evidence captured and attached |
| P2 | Re-issue decision memo | FlowBiz-Ops + FlowBiz-Tech | Decision updated from NO_GO based on full evidence |

---

## Re-Decision Trigger

Decision can only be upgraded from NO_GO when all P1 items are PASS with recorded proof.

---

## Safety Attestation (PR-13)

This decision document confirms:
- Pseudonym-only usage (Clinic Alpha, Owner-A, Staff-A1)
- No real phone/email/LINE ID in repo artifacts
- No credentials/secrets included
- No ROI guarantee statements
- No medical outcome guarantee statements
- No production deployment activity
- No real outbound LINE send activity

---

## References

- CLINIC_ALPHA_DAY_0_PREFLIGHT_EVIDENCE.md
- CLINIC_ALPHA_DEMO_FRICTION_LOG.md
- CLINIC_ALPHA_DAY_0_DRY_RUN_REPORT.md
- CLINIC_ALPHA_DAY_0_DEMO_CHECKLIST.md
