# Clinic Alpha — Real Day 0 Go/No-Go Decision

Document type: PR-14 decision memo for real Day 0 session
Pilot clinic: Clinic Alpha (pseudonym)
Decision date: 2026-05-28
Decision owner: FlowBiz-Ops + FlowBiz-Tech
Canonical staging URL: https://beauty.flowbiz.cloud
Current decision: GO_FOR_REAL_DAY_0_DEMO

---

## Decision Options

- GO_FOR_REAL_DAY_0_DEMO
- GO_WITH_FIXES
- NO_GO

Selected: GO_FOR_REAL_DAY_0_DEMO

---

## Rule Applied

PR-14 decision rules define:
- If all required evidence passes: GO_FOR_REAL_DAY_0_DEMO
- If staging/network still fails: NO_GO
- If only minor non-blocking issues: GO_WITH_FIXES

Applied outcome:
- Canonical staging URL passed required health/readiness/smoke/login/HITL/audit evidence.
- Therefore decision is GO_FOR_REAL_DAY_0_DEMO.

---

## Decision Basis (PR-14 Live Evidence)

### A) Technical and Safety Status

| Gate | Expected | Current | Result |
|---|---|---|---|
| DNS resolve for canonical host | Success | Resolved | PASS |
| Network to canonical host:443 | Reachable | `TcpTestSucceeded=True` | PASS |
| DNS resolve for `staging.flowbiz.io` | Informational check | DNS name does not exist | FAIL (non-canonical) |
| `/api/live` on canonical | HTTP 200 | HTTP 200 | PASS |
| `/api/ready` on canonical | HTTP 200 | HTTP 200 | PASS |
| readiness `appEnv=staging` | Confirmed from payload | `staging` | PASS |
| readiness DB `flowbiz_beauty_staging` | Confirmed from payload | `flowbiz_beauty_staging` | PASS |
| `npm run smoke:staging` (live) | PASS | PASS (8 checks) | PASS |
| Demo login | PASS | PASS (token returned) | PASS |
| HITL queue visibility | PASS | PASS (authenticated response) | PASS |
| Audit log visibility | PASS | PASS (authenticated response) | PASS |
| External send flags disabled | PASS | PASS | PASS |
| No real data / no secrets in artifacts | PASS | PASS | PASS |

### B) Session/Content Readiness

| Item | Current | Result |
|---|---|---|
| Day 0 agenda | Complete | PASS |
| Demo checklist | Complete | PASS |
| Day 0 report template | Complete | PASS |
| Dry-run report and preflight evidence pack | Complete | PASS |
| Live staging evidence completeness | Complete on canonical host | PASS |
| Selected workflow-name field in API queue payload | Not explicit | LIMITATION_NOTED |

---

## Why GO_FOR_REAL_DAY_0_DEMO

GO_FOR_REAL_DAY_0_DEMO is selected because required live evidence passed on canonical staging URL.

Confirmed:
1. Canonical host DNS/network pass.
2. `/api/live` and `/api/ready` are HTTP 200.
3. Readiness payload confirms `appEnv=staging` and DB `flowbiz_beauty_staging`.
4. `npm run smoke:staging` live passes.
5. Demo login, HITL queue, and audit log checks pass with authentication.

Non-blocking note:
- HITL API payload does not directly expose workflow-name labels. Operator should verify labels in UI during Day 0 run-through.

---

## Required Actions Before Reconsidering Decision

| Priority | Action | Owner | Acceptance Criteria |
|---|---|---|---|
| P1 | Freeze preflight host to canonical URL | FlowBiz-Tech | All preflight commands use `https://beauty.flowbiz.cloud` |
| P1 | Mark non-canonical host as wrong/deprecated in pilot docs | FlowBiz-Ops | Docs updated and reviewed |
| P2 | Capture one UI proof for selected workflow labels at Day 0 start | FlowBiz-Ops | Screenshot or operator note attached in ops record |
| P2 | Keep safe integration flags disabled during demo | FlowBiz-Tech | `LINE_REAL_SEND_ENABLED=false` and `AI_REAL_GENERATION_ENABLED=false` |

---

## Re-Decision Trigger

Decision remains GO_FOR_REAL_DAY_0_DEMO while canonical staging checks remain green and safe-mode flags remain disabled.

---

## Safety Attestation (PR-14)

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

- CLINIC_ALPHA_DAY_0_NETWORK_RECOVERY_REPORT.md
- CLINIC_ALPHA_DAY_0_PREFLIGHT_EVIDENCE.md
- CLINIC_ALPHA_DEMO_FRICTION_LOG.md
- CLINIC_ALPHA_DAY_0_DRY_RUN_REPORT.md
- CLINIC_ALPHA_DAY_0_DEMO_CHECKLIST.md
