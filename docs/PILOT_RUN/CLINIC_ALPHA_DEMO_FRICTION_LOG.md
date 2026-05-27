# Clinic Alpha — Demo Friction Log (PR-14 Network Recovery)

Document type: Live preflight friction and closure tracking
Pilot clinic: Clinic Alpha (pseudonym)
Date: 2026-05-28
Operator: FlowBiz-Ops

---

## Friction Summary

Total friction items tracked: 11
- Closed: 10
- Open: 1 (minor, non-blocking)

Current top note:
1. Canonical staging URL confirmed and all major live blockers closed.
2. One minor API payload limitation remains for explicit workflow-name visibility in HITL queue response.

Current operational recommendation: GO_FOR_REAL_DAY_0_DEMO

---

## Detailed Friction Log

| ID | Area | Severity | Symptom | Evidence (PR-14) | Probable Cause | Immediate Mitigation | Owner | Status |
|---|---|---|---|---|---|---|---|---|
| FR-01 | Canonical URL ambiguity | High | Two candidate hosts were in use | `beauty.flowbiz.cloud` resolved; `staging.flowbiz.io` did not | Historical command drift | Pin canonical URL in pilot runbook | FlowBiz-Tech | Closed |
| FR-02 | Staging DNS (wrong host) | High | `staging.flowbiz.io` unresolved | `Resolve-DnsName` failed | Wrong/deprecated host for this flow | Use canonical host only | FlowBiz-Tech | Closed |
| FR-03 | Staging network (wrong host) | High | TCP check failed on wrong host | `TcpTestSucceeded=False` | Non-resolving host | Use canonical host only | FlowBiz-Tech | Closed |
| FR-04 | API live endpoint | High | Previously unreachable | Canonical `/api/live` is HTTP 200 | Wrong host used in PR-13 | Recheck on canonical host | FlowBiz-Tech | Closed |
| FR-05 | API ready endpoint | High | Previously unreachable | Canonical `/api/ready` is HTTP 200 | Wrong host used in PR-13 | Recheck on canonical host | FlowBiz-Tech | Closed |
| FR-06 | Smoke live mode | High | Previously fetch-failed | `npm run smoke:staging` PASS (8 checks) on canonical host | Wrong host used in PR-13 | Keep canonical env vars pinned | FlowBiz-Tech | Closed |
| FR-07 | Demo login verification | Medium | Previously blocked | Login on canonical host is HTTP 200 with token | Wrong host used in PR-13 | Keep canonical env vars pinned | FlowBiz-Ops | Closed |
| FR-08 | HITL queue visibility | Medium | Previously blocked | Authenticated queue endpoint is HTTP 200 with pending records | Wrong host used in PR-13 | Keep canonical env vars pinned | FlowBiz-Ops | Closed |
| FR-09 | Audit log visibility | Medium | Previously blocked | Authenticated audit endpoint is HTTP 200 with records | Wrong host used in PR-13 | Keep canonical env vars pinned | FlowBiz-Ops | Closed |
| FR-10 | Readiness payload assertions | Medium | Previously blocked | `appEnv=staging`, DB `flowbiz_beauty_staging` confirmed | Wrong host used in PR-13 | Keep readiness assertion in preflight checklist | FlowBiz-Tech | Closed |
| FR-11 | Workflow-name payload visibility | Low | Queue API payload does not expose explicit workflow-name field | Queue item schema lacks workflow label field | API shape limitation | Verify workflow labels in UI during Day 0 run-through | FlowBiz-Ops | Open (Non-blocking) |

---

## Evidence Assets Status (PR-14)

| Asset ID | Required Asset | Current State | Blocking? | Owner |
|---|---|---|---|---|
| MA-01 | DNS resolve success evidence for canonical host | Present | No | FlowBiz-Tech |
| MA-02 | `/api/live` HTTP 200 proof | Present | No | FlowBiz-Tech |
| MA-03 | `/api/ready` HTTP 200 proof | Present | No | FlowBiz-Tech |
| MA-04 | readiness payload: `appEnv=staging` | Present | No | FlowBiz-Tech |
| MA-05 | readiness payload: DB `flowbiz_beauty_staging` | Present | No | FlowBiz-Tech |
| MA-06 | `npm run smoke:staging` live PASS proof | Present | No | FlowBiz-Tech |
| MA-07 | demo login PASS proof | Present | No | FlowBiz-Ops |
| MA-08 | HITL queue visible proof | Present | No | FlowBiz-Ops |
| MA-09 | audit log visible proof | Present | No | FlowBiz-Ops |
| MA-10 | selected workflows visible proof (5 workflows) | Partial (limitation noted) | No | FlowBiz-Ops |

---

## Resolution Criteria

Primary blocking friction closure criteria status:
1. DNS and TCP checks on canonical host: PASS.
2. `/api/live` and `/api/ready` on canonical host: PASS.
3. Readiness payload assertions: PASS.
4. `npm run smoke:staging` live mode: PASS.
5. Demo login, HITL queue, and audit visibility: PASS.

---

## Fix Plan (Operational Only)

1. Keep canonical URL pinned to `https://beauty.flowbiz.cloud` for pilot preflight.
2. Mark `https://staging.flowbiz.io` as wrong/deprecated in pilot docs.
3. During live Day 0 run-through, capture one UI proof for selected workflow labels.
4. Continue to keep real LINE and real AI generation disabled in Day 0 demo mode.

Note:
- No runtime code changes were performed in PR-14.
- If a runtime defect appears in Day 0 execution, raise separate PR Summary for runtime blocker handling.

---

## Sign-off

Prepared by: FlowBiz-Ops (pseudonym role)
Reviewed with: FlowBiz-Tech (preflight evidence complete)
Current recommendation: GO_FOR_REAL_DAY_0_DEMO
