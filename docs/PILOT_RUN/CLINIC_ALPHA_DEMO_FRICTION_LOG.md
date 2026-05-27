# Clinic Alpha — Demo Friction Log (PR-16 Follow-Up Closure)

Document type: Follow-up friction and closure tracking
Pilot clinic: Clinic Alpha (pseudonym)
Date: 2026-05-28
Operator: FlowBiz-Ops

---

## Friction Summary

Total friction items tracked: 14
- Closed: 11
- Open: 3 (business/operational)

Current top note:
1. Technical staging blockers are closed.
2. Session execution blockers are closed.
3. Remaining open items are agreement/access/consent prerequisites before limited pilot start.

Current operational recommendation: PENDING_OWNER_ACTION

---

## Detailed Friction Log

| ID | Area | Severity | Symptom | Evidence (PR-15) | Probable Cause | Immediate Mitigation | Owner | Status |
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
| FR-12 | Written agreement pending | Medium | Owner-A has conditional proceed but no signed agreement yet | PR-16 closure checklist BL-01 | Commercial/legal prerequisite not closed | Send agreement pack and secure sign date | FlowBiz-Ops + Owner-A | Open (Blocking limited pilot start) |
| FR-13 | LINE OA access handover pending | Medium | Admin access timeline not finalized | PR-16 LINE OA checklist pending items | External dependency on owner-side setup | Confirm handover owner and date | FlowBiz-Ops + Owner-A | Open (Blocking limited pilot start) |
| FR-14 | Consent/data intake gate pending | Medium | Consent checkpoint tied to agreement flow not yet closed | PR-16 consent/data confirmation checklist | Sequence dependency | Close consent form after agreement confirmation | FlowBiz-Ops | Open (Blocking limited pilot start) |

---

## Evidence Assets Status (PR-15)

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
| MA-10 | selected workflows visible proof (5 workflows) | Partial (operator note + queue evidence; no explicit workflow-name field) | No | FlowBiz-Ops |
| MA-11 | Written pilot agreement signed | Missing | Yes | Owner-A + FlowBiz-Ops |
| MA-12 | LINE OA admin access handover confirmed | Missing | Yes | Owner-A + FlowBiz-Ops |
| MA-13 | Consent/data handling gate closed | Missing | Yes | FlowBiz-Ops |

---

## Resolution Criteria

Technical/session closure criteria status:
1. DNS and TCP checks on canonical host: PASS.
2. `/api/live` and `/api/ready` on canonical host: PASS.
3. Readiness payload assertions: PASS.
4. `npm run smoke:staging` live mode: PASS.
5. Demo login, HITL queue, and audit visibility: PASS.
6. HITL approve/modify/reject proof: PASS.

Limited pilot start closure criteria status:
1. Agreement signed: PENDING.
2. LINE OA access handover: PENDING.
3. Consent/data handling gate: PENDING.

PR-16 closure pack criteria status:
1. Follow-up closure checklist created: COMPLETE.
2. Owner sign-off summary created: COMPLETE (owner action still pending).
3. LINE OA access checklist created: COMPLETE (required approvals pending).
4. Consent/data handling confirmation created: COMPLETE (required approvals pending).
5. Decision gate created: COMPLETE (current outcome `PENDING_OWNER_ACTION`).

---

## Fix Plan (Operational Only)

1. Keep canonical URL pinned to `https://beauty.flowbiz.cloud` for pilot preflight.
2. Continue to keep real LINE and real AI generation disabled in Day 0 demo mode.
3. Close agreement signing and capture owner-confirmed sign date.
4. Close LINE OA admin handover checkpoint.
5. Close consent/data intake gate before limited pilot start.

Note:
- No runtime code changes were performed in PR-15.
- No runtime code changes were performed in PR-16.
- If a runtime defect appears in Day 0 execution, raise separate PR Summary for runtime blocker handling.

---

## Sign-off

Prepared by: FlowBiz-Ops (pseudonym role)
Reviewed with: FlowBiz-Tech (preflight evidence complete)
Current recommendation: DEMO_FOLLOW_UP_NEEDED
Current recommendation: PENDING_OWNER_ACTION
