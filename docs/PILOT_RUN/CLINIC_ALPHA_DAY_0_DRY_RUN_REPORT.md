# Clinic Alpha — Day 0 Execution Dry-Run Report

Document type: POST-PHASE 10 PR-12 simulated Day 0 execution report
Pilot clinic: Clinic Alpha (pseudonym only)
Date/time: 2026-05-28 05:41:27 +07:00
Operator: FlowBiz-Ops (pseudonym role)
Environment: staging-safe + demo-only
Status: GO_WITH_FIXES

---

## 1) Dry-Run Scope

This dry-run validates Day 0 readiness using the PR-11 operating pack and simulated checks only.

Operating pack inspected:
- CLINIC_ALPHA_DAY_0_AGENDA.md
- CLINIC_ALPHA_DAY_0_DEMO_CHECKLIST.md
- CLINIC_ALPHA_STAFF_TRAINING_SCRIPT.md
- CLINIC_ALPHA_OWNER_DECISION_CHECKLIST.md
- CLINIC_ALPHA_POST_DEMO_FEEDBACK_FORM.md
- CLINIC_ALPHA_DAY_0_REPORT_TEMPLATE.md
- FIRST_PILOT_DISCOVERY_REPORT.md
- FIRST_PILOT_SETUP_REPORT.md

Constraints enforced during dry-run:
- Clinic Alpha pseudonym only
- Demo seed/fake data only
- No production deploy
- No runtime code changes
- No real LINE send
- No real AI generation
- No real customer import

---

## 2) Checklist Evidence (Required by PR-12)

| Check | Result | Evidence |
|---|---|---|
| staging `/api/live` = 200 | FAIL | DNS resolution failed from execution environment (`No such host is known`) |
| staging `/api/ready` = 200 | FAIL | DNS resolution failed from execution environment (`No such host is known`) |
| `smoke:staging` = PASS | PARTIAL | Live mode failed (`fetch failed`), dry-run mode passed with safety flags check |
| demo seed visible | BLOCKED | Cannot verify without reachable staging host |
| demo login works | BLOCKED | Cannot verify without reachable staging host |
| HITL queue visible | BLOCKED | Cannot verify without reachable staging host |
| audit log proof visible | BLOCKED | Cannot verify without reachable staging host |
| 5 selected workflows visible | PARTIAL | Workflow coverage validated at script/runbook level (agenda + training + checklist), not live UI |
| approve/reject/modify explanation works | PASS (script-level) | Covered explicitly in staff training script + agenda block 4 |
| LINE/Gemini mode explained safely | PASS | Checklist section C + smoke external-send guard passed |
| no real customer data used | PASS | Docs-only dry-run, no import executed |
| no real outbound send | PASS | `LINE_REAL_SEND_ENABLED=false` guard validated by smoke script |
| no secret exposure | PASS | No credentials or tokens used/printed |

---

## 3) Staging Health Snapshot

| Item | Result | Notes |
|---|---|---|
| Host reachability (`https://staging.flowbiz.io`) | FAIL | DNS/host unresolved from current execution environment |
| API live endpoint | FAIL | Could not resolve host |
| API ready endpoint | FAIL | Could not resolve host |
| Smoke script safety gate | PASS | Real send + real AI flags validated as disabled |
| Smoke script network layer | FAIL (live mode) / WARN (dry-run mode) | Live fetch failed, dry-run intentionally skipped network |

Interpretation:
- Safety guards are correctly implemented.
- Network-level staging verification could not be completed from this environment.

---

## 4) Demo Flow Result

Overall demo flow result: PARTIAL_READY

What is ready now:
- Day 0 facilitation flow is fully documented
- 5-workflow walkthrough is complete in agenda
- HITL approve/modify/reject flow is documented and testable once staging reachable
- Owner decision and feedback collection artifacts are complete

What is not yet proven live:
- Actual staging endpoint readiness
- Demo account login path
- HITL queue visibility in UI
- Audit log evidence capture in UI

---

## 5) Workflow Coverage (Selected 5)

| Workflow | Script/Pack Coverage | Live UI Proof |
|---|---|---|
| New Lead Welcome | PASS | BLOCKED |
| Uncontacted Lead Alert | PASS | BLOCKED |
| No-Show Recovery | PASS | BLOCKED |
| Review Request | PASS | BLOCKED |
| Botox/Filler Repeat Reminder | PASS | BLOCKED |

Notes:
- All 5 workflows are covered end-to-end in agenda and training script.
- Live demonstration remains blocked on staging reachability.

---

## 6) Issues and Friction

Primary friction observed in dry-run:
1. Staging DNS/host unreachable from current execution environment.
2. Live smoke cannot complete (`fetch failed`) because upstream host is unreachable.
3. Dependency chain effect: cannot verify demo login, HITL queue, audit log, or seed visibility live.

See CLINIC_ALPHA_DEMO_FRICTION_LOG.md for detailed friction tracking.

---

## 7) Missing Assets

Missing or pending assets before real Day 0 session:
1. Reachable staging URL confirmation from pilot operator network.
2. Evidence screenshot pack for:
- `/api/live` and `/api/ready` status 200
- demo login success
- HITL queue with pending drafts
- audit trail entry after approve/modify/reject
3. Confirmed demo credentials handoff in ops system (not in repo).
4. Confirmed seed execution output from staging host-side run.

---

## 8) Risks

| Risk | Severity | Impact |
|---|---|---|
| Staging host unreachable on Day 0 | High | Demo fails at startup |
| No live HITL/audit proof before owner session | High | Trust/confidence reduction |
| Last-minute troubleshooting during owner session | Medium | Time overrun, weaker session quality |
| Hidden env mismatch (safe flags) on host | Medium | Safety exposure if not rechecked on host |

---

## 9) Recommended Fixes (No Runtime Code Changes)

1. Ops/network fix: verify DNS and routing to staging host from Day 0 operator machine.
2. Re-run live checks from reachable network:
- `GET /api/live`
- `GET /api/ready`
- `npm run smoke:staging` (live mode, not dry-run)
3. Capture proof artifacts for login, HITL queue, and audit log.
4. Re-run pre-session checklist section A-F and record signed GO decision.
5. Keep `LINE_REAL_SEND_ENABLED=false` and `AI_REAL_GENERATION_ENABLED=false` throughout Day 0.

---

## 10) Owner/Staff Questions Placeholders (for real session)

Owner-A placeholders:
- QO-1: <to be collected during live Day 0>
- QO-2: <to be collected during live Day 0>
- QO-3: <to be collected during live Day 0>

Staff-A1 placeholders:
- QS-1: <to be collected during live Day 0>
- QS-2: <to be collected during live Day 0>
- QS-3: <to be collected during live Day 0>

---

## 11) Real Day 0 Decision

Decision for real Day 0 session: GO_WITH_FIXES

Reasoning:
- Documentation, facilitation flow, and safety model are ready.
- Live staging verification is currently blocked by host reachability and must be fixed first.
- No runtime code blocker identified in this PR.

Decision options considered:
- GO_FOR_REAL_DAY_0_DEMO: not selected (missing live proof)
- GO_WITH_FIXES: selected
- NO_GO: not selected (blockers appear operational, not structural)

---

## 12) Safety Confirmation

Confirmed in this dry-run:
- No real clinic name used
- No real owner/staff identifiers used
- No phone/email/LINE ID real data used
- No secrets exposed
- No ROI guarantee claims
- No medical outcome claims
- No production deployment actions
- No outbound LINE send action

---

## References

- CLINIC_ALPHA_DEMO_FRICTION_LOG.md
- CLINIC_ALPHA_REAL_DAY_0_GO_NO_GO.md
- CLINIC_ALPHA_DAY_0_AGENDA.md
- CLINIC_ALPHA_DAY_0_DEMO_CHECKLIST.md
- CLINIC_ALPHA_STAFF_TRAINING_SCRIPT.md
- CLINIC_ALPHA_OWNER_DECISION_CHECKLIST.md
- CLINIC_ALPHA_POST_DEMO_FEEDBACK_FORM.md
- CLINIC_ALPHA_DAY_0_REPORT_TEMPLATE.md
- FIRST_PILOT_DISCOVERY_REPORT.md
- FIRST_PILOT_SETUP_REPORT.md
