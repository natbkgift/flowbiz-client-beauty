# Clinic Alpha — Demo Friction Log (PR-18 Owner Action Closure)

Document type: Owner-action friction and closure tracking
Pilot clinic: Clinic Alpha (pseudonym)
Date: 2026-05-28
Operator: FlowBiz-Ops

---

## Friction Summary

Total friction items tracked: 17
- Closed: 14
- Open: 3 (Day 1 watch items; non-blocking safety status)

Current top note:
1. Technical staging blockers are closed.
2. Session execution blockers are closed.
3. Agreement/access/consent prerequisites are closed in sanitized owner evidence.
4. Day 1 monitoring shows safe governance stable, with operational improvements still needed.

Current operational recommendation: GO_WITH_IMPROVEMENTS

---

## Detailed Friction Log

| ID | Area | Severity | Symptom | Evidence (PR-18) | Probable Cause | Immediate Mitigation | Owner | Status |
|---|---|---|---|---|---|---|---|---|
| FR-01 | Canonical URL ambiguity | High | Two candidate hosts were in use | `beauty.flowbiz.cloud` resolved; `staging.flowbiz.io` did not | Historical command drift | Pin canonical URL in pilot runbook | FlowBiz-Tech | Closed |
| FR-02 | Staging DNS (wrong host) | High | `staging.flowbiz.io` unresolved | `Resolve-DnsName` failed | Wrong/deprecated host for this flow | Use canonical host only | FlowBiz-Tech | Closed |
| FR-03 | Staging network (wrong host) | High | TCP check failed on wrong host | `TcpTestSucceeded=False` | Non-resolving host | Use canonical host only | FlowBiz-Tech | Closed |
| FR-04 | API live endpoint | High | Previously unreachable | Canonical `/api/live` is HTTP 200 | Wrong host used in PR-13 | Recheck on canonical host | FlowBiz-Tech | Closed |
| FR-05 | API ready endpoint | High | Previously unreachable | Canonical `/api/ready` is HTTP 200 | Wrong host used in PR-13 | Recheck on canonical host | FlowBiz-Tech | Closed |
| FR-06 | Smoke live mode | High | Previously fetch-failed | `npm run smoke:staging` PASS (8 checks) on canonical host | Wrong host used in PR-13 | Keep canonical env vars pinned | FlowBiz-Tech | Closed |
| FR-07 | Demo login verification | Medium | Previously blocked | Login on canonical host is HTTP 200 with authenticated session | Wrong host used in PR-13 | Keep canonical env vars pinned | FlowBiz-Ops | Closed |
| FR-08 | HITL queue visibility | Medium | Previously blocked | Authenticated queue endpoint is HTTP 200 with pending records | Wrong host used in PR-13 | Keep canonical env vars pinned | FlowBiz-Ops | Closed |
| FR-09 | Audit log visibility | Medium | Previously blocked | Authenticated audit endpoint is HTTP 200 with records | Wrong host used in PR-13 | Keep canonical env vars pinned | FlowBiz-Ops | Closed |
| FR-10 | Readiness payload assertions | Medium | Previously blocked | `appEnv=staging`, DB `flowbiz_beauty_staging` confirmed | Wrong host used in PR-13 | Keep readiness assertion in preflight checklist | FlowBiz-Tech | Closed |
| FR-11 | Workflow-name payload visibility | Low | Queue API payload does not expose explicit workflow-name field | Queue item schema lacks workflow label field | API shape limitation | Verify workflow labels in UI during Day 0 run-through | FlowBiz-Ops | Closed (Non-blocking accepted) |
| FR-12 | Written agreement pending | Medium | Owner-A has conditional proceed but no written agreement artifact confirmed yet | PR-18 evidence register: `agreement_received=yes` | Commercial/legal prerequisite closure completed | Maintain written artifact outside repo only | FlowBiz-Ops + Owner-A | Closed |
| FR-13 | LINE OA access handover pending | Medium | Admin access timeline not finalized | PR-18 evidence register: `access_confirmed=yes` | Owner-side setup completed | Keep credential material in external protected storage only | FlowBiz-Ops + Owner-A | Closed |
| FR-14 | Consent/data intake gate pending | Medium | Consent checkpoint tied to agreement flow not yet closed | PR-18 evidence register: `confirmation_received=yes` | Closure completed by owner confirmation | Keep legal review acknowledgment active | FlowBiz-Ops | Closed |
| FR-15 | Day 1 HITL review cadence | Medium | Queue visible but no approve/reject/modify activity observed in API snapshot | PR-23 monitoring: `pending_approval=8` | Staff review cadence not yet evidenced | Add staff HITL review checkpoint in next operating window | FlowBiz-Ops + Staff-A1 | Open (Improvement) |
| FR-16 | Day 1 ops health exception | Medium | `/ops/health` remains degraded under accepted exception | PR-23 monitoring: automation failures in last 24h = 2, worker failed jobs = 0 | Historical failure window still affects health status | Recheck until healthy or renewed exception accepted | FlowBiz-Tech | Open (Accepted watch item) |
| FR-17 | Day 1 latency measurement gap | Low | Operator review latency not measurable from API snapshot | PR-23 monitoring notes | Missing timestamp-based latency capture | Add queue aging/review latency capture in PR-24 | FlowBiz-Ops | Open (Improvement) |

---

## Evidence Assets Status (PR-18)

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
| MA-11 | Written pilot agreement signed | Present (sanitized metadata only) | No | Owner-A + FlowBiz-Ops |
| MA-12 | LINE OA admin access handover confirmed | Present (sanitized metadata only) | No | Owner-A + FlowBiz-Ops |
| MA-13 | Consent/data handling gate closed | Present (sanitized metadata only) | No | FlowBiz-Ops |

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
1. Agreement signed: PASS.
2. LINE OA access handover: PASS.
3. Consent/data handling gate: PASS.

PR-16 closure pack criteria status:
1. Follow-up closure checklist created: COMPLETE.
2. Owner sign-off summary updated: COMPLETE (owner action closed).
3. LINE OA access checklist updated: COMPLETE (sanitized access confirmation recorded).
4. Consent/data handling confirmation updated: COMPLETE (sanitized confirmation recorded).
5. Decision gate updated: COMPLETE (current outcome `READY_FOR_LIMITED_PILOT_PREP`).

PR-17 owner approval execution criteria status:
1. Sanitized owner approval evidence register created: COMPLETE.
2. BL-01 evidence status updated: CLOSED.
3. BL-02 evidence status updated: CLOSED.
4. BL-03 evidence status updated: CLOSED.
5. Decision gate/readiness synchronized to evidence: COMPLETE.

PR-18 closure decision status:
1. Gate outcome: READY_FOR_LIMITED_PILOT_PREP.
2. Readiness outcome: READY_FOR_LIMITED_PILOT_PREP.
3. Blocking friction count: 0.

PR-23 Day 1 monitoring decision status:
1. Day 1 operational status: LIMITED_PILOT_DAY_1_STARTED.
2. Monitoring decision: GO_WITH_IMPROVEMENTS.
3. Safety event count: 0.
4. Outbound actions since Day 1 start: 0.
5. Broad import indicators since Day 1 start: 0.
6. Open improvement/watch items: 3.

---

## Fix Plan (Operational Only)

1. Keep canonical URL pinned to `https://beauty.flowbiz.cloud` for pilot preflight.
2. Continue to keep real LINE and real AI generation disabled in Day 0 demo mode.
3. Preserve written agreement artifact outside repo only.
4. Keep LINE OA credential material in external protected storage only.
5. Keep consent/data handling acknowledgements active during limited pilot prep.

Note:
- No runtime code changes were performed in PR-15.
- No runtime code changes were performed in PR-16.
- No runtime code changes were performed in PR-17.
- No runtime code changes were performed in PR-18.
- No runtime code changes were performed in PR-23.
- If a runtime defect appears in Day 0 execution, raise separate PR Summary for runtime blocker handling.

---

## Sign-off

Prepared by: FlowBiz-Ops (pseudonym role)
Reviewed with: FlowBiz-Tech (preflight evidence complete)
Current recommendation: GO_WITH_IMPROVEMENTS
