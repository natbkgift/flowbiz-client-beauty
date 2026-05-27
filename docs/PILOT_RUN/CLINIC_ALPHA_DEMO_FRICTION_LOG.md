# Clinic Alpha — Demo Friction Log (PR-13 Preflight Re-Check)

Document type: Live preflight friction and closure tracking
Pilot clinic: Clinic Alpha (pseudonym)
Date: 2026-05-28
Operator: FlowBiz-Ops

---

## Friction Summary

Total friction items: 10
- High: 6
- Medium: 4
- Low: 0

Current top blockers:
1. Staging DNS does not resolve from execution environment.
2. `/api/live` and `/api/ready` cannot be reached.
3. Live smoke remains FAIL.
4. Login, HITL queue, and audit proof cannot be verified live.
5. Required readiness payload assertions are blocked.

Current operational recommendation: NO_GO

---

## Detailed Friction Log

| ID | Area | Severity | Symptom | Evidence (PR-13) | Probable Cause | Immediate Mitigation | Owner | Status |
|---|---|---|---|---|---|---|---|---|
| FR-01 | Staging DNS | High | Staging hostname unresolved | `Resolve-DnsName: DNS name does not exist` | DNS record missing/hidden from this network | Fix DNS visibility from operator network | FlowBiz-Tech | Open |
| FR-02 | Staging network | High | TCP 443 unavailable | `TcpTestSucceeded=False` | Routing/firewall/network path issue | Validate route/firewall from operator location | FlowBiz-Tech | Open |
| FR-03 | API live endpoint | High | `/api/live` check failed | `No such host is known` | Blocked by FR-01/FR-02 | Re-check endpoint after network fix | FlowBiz-Tech | Open |
| FR-04 | API ready endpoint | High | `/api/ready` check failed | `No such host is known` | Blocked by FR-01/FR-02 | Re-check endpoint after network fix | FlowBiz-Tech | Open |
| FR-05 | Smoke live mode | High | `npm run smoke:staging` failed | `Smoke summary: FAIL - fetch failed` | Upstream staging unreachable | Re-run smoke live after network restoration | FlowBiz-Tech | Open |
| FR-06 | Demo login verification | Medium | Login cannot be validated | `POST /api/auth/login -> No such host is known` | Blocked by FR-01/FR-02 | Re-run demo login when host reachable | FlowBiz-Ops | Open |
| FR-07 | HITL queue visibility | Medium | Queue not verifiable | `GET /api/hitl/queue -> No such host is known` | Blocked by FR-01/FR-02 | Capture queue evidence after host recovery | FlowBiz-Ops | Open |
| FR-08 | Audit log visibility | Medium | Audit proof not verifiable | `GET /api/audit/logs -> No such host is known` | Blocked by FR-01/FR-02 | Capture audit evidence after host recovery | FlowBiz-Ops | Open |
| FR-09 | Readiness payload assertions | Medium | Cannot confirm `appEnv` and DB name | `/api/ready` unreachable | Blocked by FR-04 | Re-check payload fields after API ready pass | FlowBiz-Tech | Open |
| FR-10 | Go/no-go threshold breach | High | Decision cannot remain go-with-fixes | PR-13 rule: staging/network fail => NO_GO | Dependency on unresolved P1 blockers | Set decision to NO_GO and reschedule | FlowBiz-Ops + FlowBiz-Tech | Closed (Applied) |

---

## Missing Evidence Assets (PR-13)

| Asset ID | Required Asset | Current State | Blocking? | Owner |
|---|---|---|---|---|
| MA-01 | DNS resolve success evidence for staging host | Missing | Yes | FlowBiz-Tech |
| MA-02 | `/api/live` HTTP 200 proof | Missing | Yes | FlowBiz-Tech |
| MA-03 | `/api/ready` HTTP 200 proof | Missing | Yes | FlowBiz-Tech |
| MA-04 | readiness payload: `appEnv=staging` | Missing | Yes | FlowBiz-Tech |
| MA-05 | readiness payload: DB `flowbiz_beauty_staging` | Missing | Yes | FlowBiz-Tech |
| MA-06 | `npm run smoke:staging` live PASS proof | Missing | Yes | FlowBiz-Tech |
| MA-07 | demo login PASS proof | Missing | Yes | FlowBiz-Ops |
| MA-08 | HITL queue visible proof | Missing | Yes | FlowBiz-Ops |
| MA-09 | audit log visible proof | Missing | Yes | FlowBiz-Ops |
| MA-10 | selected workflows visible proof (5 workflows) | Missing | Yes | FlowBiz-Ops |

---

## Resolution Criteria

All blocking friction is considered closed only when:
1. DNS and TCP checks pass from operator network.
2. `/api/live` and `/api/ready` return HTTP 200.
3. Readiness payload confirms `appEnv=staging` and DB `flowbiz_beauty_staging`.
4. `npm run smoke:staging` live mode passes.
5. Demo login, HITL queue, and audit visibility are verified and recorded.

---

## Fix Plan (Operational Only)

1. Fix staging DNS/routing for operator execution network.
2. Re-run endpoint checks and capture raw output.
3. Re-run live smoke and archive PASS output.
4. Validate login, HITL queue, and audit trail on staging UI/API.
5. Re-open go/no-go only after all required assets are present.

Note:
- No runtime code changes were performed in PR-13.
- If network is healthy but product behavior still fails, raise separate PR Summary for runtime blocker handling.

---

## Sign-off

Prepared by: FlowBiz-Ops (pseudonym role)
Reviewed with: FlowBiz-Tech (pending)
Current recommendation: NO_GO
