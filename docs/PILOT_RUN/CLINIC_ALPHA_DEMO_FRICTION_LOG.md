# Clinic Alpha — Demo Friction Log (PR-12 Dry-Run)

Document type: Dry-run friction and gap tracking
Pilot clinic: Clinic Alpha (pseudonym)
Date: 2026-05-28
Operator: FlowBiz-Ops

---

## Friction Summary

Total friction items: 8
- High: 3
- Medium: 4
- Low: 1

Top blockers:
1. Staging host not reachable from current execution environment.
2. Live smoke failed due to network fetch failure.
3. Cannot collect live evidence for demo login, HITL queue, and audit log.

---

## Detailed Friction Log

| ID | Area | Severity | Symptom | Evidence | Probable Cause | Immediate Mitigation | Owner | Status |
|---|---|---|---|---|---|---|---|---|
| FR-01 | Staging network | High | `/api/live` check failed | `No such host is known (staging.flowbiz.io:443)` | DNS/routing mismatch from runner network | Validate DNS + network from operator machine and staging host | FlowBiz-Tech | Open |
| FR-02 | Staging network | High | `/api/ready` check failed | `No such host is known (staging.flowbiz.io:443)` | Same as FR-01 | Same as FR-01 | FlowBiz-Tech | Open |
| FR-03 | Smoke live mode | High | `npm run smoke:staging` ended FAIL | `Smoke summary: FAIL - fetch failed` | Upstream host unreachable | Re-run smoke from reachable network after FR-01/FR-02 fix | FlowBiz-Tech | Open |
| FR-04 | Demo seed verification | Medium | Could not verify demo seed visibility | No reachable API/UI path | Depends on FR-01..03 | Re-run seed check once host reachable | FlowBiz-Tech | Open |
| FR-05 | Demo login verification | Medium | Could not verify demo login | No reachable API/UI path | Depends on FR-01..03 | Validate demo credentials + login on staging UI | FlowBiz-Ops | Open |
| FR-06 | HITL queue verification | Medium | Could not verify queue in UI | No reachable API/UI path | Depends on FR-01..03 | Capture queue screenshot with pending drafts | FlowBiz-Ops | Open |
| FR-07 | Audit proof verification | Medium | Could not verify audit entries after approve/modify/reject | No reachable API/UI path | Depends on FR-01..03 | Run one test cycle and capture audit proof | FlowBiz-Ops | Open |
| FR-08 | Dry-run confidence | Low | Session prep depends on docs-only confirmation | Script-level only for some checks | Live proof pending | Keep go/no-go at GO_WITH_FIXES until live evidence collected | FlowBiz-Ops | Open |

---

## Missing Assets Register

| Asset ID | Required Asset | Why Needed | Current State | Owner |
|---|---|---|---|---|
| MA-01 | `/api/live` 200 evidence | Startup confidence | Missing | FlowBiz-Tech |
| MA-02 | `/api/ready` 200 evidence | DB readiness confidence | Missing | FlowBiz-Tech |
| MA-03 | Live smoke PASS output | End-to-end staging signal | Missing | FlowBiz-Tech |
| MA-04 | Demo login success evidence | Account readiness proof | Missing | FlowBiz-Ops |
| MA-05 | HITL queue pending drafts evidence | Core demo proof | Missing | FlowBiz-Ops |
| MA-06 | Audit log entry evidence | Compliance + traceability proof | Missing | FlowBiz-Ops |
| MA-07 | Seed execution confirmation | Demo data availability proof | Missing | FlowBiz-Tech |

---

## Risk Linkage

| Risk ID | Linked Friction | Risk if unresolved before real Day 0 |
|---|---|---|
| RK-01 | FR-01, FR-02 | Demo cannot start on time |
| RK-02 | FR-03 | Core smoke signal unavailable |
| RK-03 | FR-05, FR-06 | Owner confidence drops due to no live system proof |
| RK-04 | FR-07 | Auditability promise cannot be demonstrated |

---

## Fix Plan (Operational Only)

1. Confirm staging DNS resolution and network path from Day 0 operator location.
2. Re-run endpoint checks (`/api/live`, `/api/ready`) and record 200 evidence.
3. Re-run `npm run smoke:staging` in live mode and archive output.
4. Execute one scripted HITL cycle (approve/modify/reject) on demo data and capture audit proof.
5. Update go/no-go file immediately after proof is captured.

Note:
- No runtime code changes were performed in PR-12.
- If operational fixes fail and a product/runtime blocker is discovered, create separate PR Summary as instructed.

---

## Sign-off

Prepared by: FlowBiz-Ops (pseudonym role)
Review required by: FlowBiz-Tech before real Day 0 session
Current recommendation: GO_WITH_FIXES
