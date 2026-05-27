# Clinic Alpha — Real Day 0 Go/No-Go Decision

Document type: PR-12 decision memo for real Day 0 session
Pilot clinic: Clinic Alpha (pseudonym)
Decision date: 2026-05-28
Decision owner: FlowBiz-Ops + FlowBiz-Tech
Current decision: GO_WITH_FIXES

---

## Decision Options

- GO_FOR_REAL_DAY_0_DEMO
- GO_WITH_FIXES
- NO_GO

Selected: GO_WITH_FIXES

---

## Decision Basis

### A) Technical and Safety Status

| Gate | Expected | Current | Result |
|---|---|---|---|
| `/api/live` | 200 | Host unresolved from runner environment | FAIL |
| `/api/ready` | 200 | Host unresolved from runner environment | FAIL |
| smoke live mode | PASS | `fetch failed` | FAIL |
| smoke dry-run safety guard | PASS | PASS | PASS |
| Real send disabled | must be disabled | PASS (`LINE_REAL_SEND_ENABLED=false`) | PASS |
| Real AI generation disabled | must be disabled | PASS (`AI_REAL_GENERATION_ENABLED=false`) | PASS |
| No real data usage | required | PASS | PASS |
| No secrets exposed | required | PASS | PASS |

### B) Session/Content Readiness

| Item | Current | Result |
|---|---|---|
| Day 0 agenda | Complete | PASS |
| Demo checklist | Complete | PASS |
| Staff training script | Complete | PASS |
| Owner decision checklist | Complete | PASS |
| Post-demo feedback form | Complete | PASS |
| Day 0 report template | Complete | PASS |
| Workflow script coverage (5 workflows) | Complete | PASS |
| Live UI evidence (login/HITL/audit) | Missing | FAIL |

---

## Why Not GO_FOR_REAL_DAY_0_DEMO Yet

Real session should not start until the following are proven on reachable staging:
1. `/api/live` returns 200.
2. `/api/ready` returns 200.
3. `npm run smoke:staging` passes in live mode.
4. Demo login works for Owner-A and Staff-A1 roles.
5. HITL queue is visible with demo drafts.
6. Audit trail proof is visible after approve/modify/reject walk-through.

---

## Why Not NO_GO

NO_GO is not selected because:
- No structural blocker found in process design, safety model, or operating pack.
- Failures are currently operational/network verification gaps.
- Safety controls and documentation readiness are strong.

---

## Required Fixes Before Real Day 0

| Priority | Fix | Owner | Acceptance Criteria |
|---|---|---|---|
| P1 | Restore/confirm staging reachability from operator network | FlowBiz-Tech | `/api/live` and `/api/ready` both 200 |
| P1 | Re-run staging smoke in live mode | FlowBiz-Tech | Smoke summary PASS |
| P1 | Validate demo logins (Owner-A + Staff-A1) | FlowBiz-Ops | Both accounts login successfully |
| P1 | Validate HITL queue with demo drafts | FlowBiz-Ops | Queue visible with expected pending items |
| P1 | Validate audit trail evidence | FlowBiz-Ops | At least 1 approve, 1 modify, 1 reject record visible |
| P2 | Attach proof bundle in ops record | FlowBiz-Ops | Links/screenshots archived |

---

## Re-Decision Trigger

Re-open this decision and upgrade to GO_FOR_REAL_DAY_0_DEMO only when all P1 items are PASS.

If any P1 item remains FAIL within planned Day 0 window:
- Keep GO_WITH_FIXES if timeline still feasible, or
- Downgrade to NO_GO and reschedule.

---

## Placeholder Questions to Capture in Real Session

Owner-A placeholders:
- <Owner question 1>
- <Owner question 2>
- <Owner question 3>

Staff-A1 placeholders:
- <Staff question 1>
- <Staff question 2>
- <Staff question 3>

---

## Safety Attestation (PR-12)

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

- CLINIC_ALPHA_DAY_0_DRY_RUN_REPORT.md
- CLINIC_ALPHA_DEMO_FRICTION_LOG.md
- CLINIC_ALPHA_DAY_0_DEMO_CHECKLIST.md
- CLINIC_ALPHA_DAY_0_AGENDA.md
