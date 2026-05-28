# Clinic Alpha - Limited Pilot Prep Plan (PR-19)

Document type: POST-PHASE 10 PR-19 limited pilot prep kickoff plan
Pilot clinic: Clinic Alpha (pseudonym only)
Date: 2026-05-28
Decision baseline: READY_FOR_LIMITED_PILOT_PREP
PR-19 status target: READY_FOR_DAY_1_PREP

---

## 1) Pilot Purpose

Prepare Clinic Alpha for a limited, measured, staging-first pilot that validates operational workflows, staff HITL usage, auditability, and safe follow-up processes.

This PR prepares the operating plan only. It does not start live pilot operations, enable production, import broad real customer data, enable mass broadcast, or authorize AI auto-send.

---

## 2) Duration

Planned limited pilot window:
1. Minimum: 14 days.
2. Maximum: 30 days.
3. Extension: only by written owner confirmation and a separate decision note.

PR-19 covers Day 1 prep only. It does not mark the pilot as started.

---

## 3) Prep Scope

Included:
1. Confirm scope, workflows, roles, data mode, metrics, and stop conditions.
2. Prepare Day 1 readiness checklist.
3. Confirm safe LINE and Gemini operating mode.
4. Confirm rollback and disable paths.
5. Prepare daily and weekly operating cadence.

Not included:
1. Production deployment.
2. Broad customer import.
3. Medical record import.
4. Full chat history import.
5. Mass broadcast.
6. Multi-clinic rollout.
7. Runtime code change.
8. Any financial-return or clinical-result commitment.

---

## 4) Roles

| Role | Pseudonym | Responsibility | Access Principle |
|---|---|---|---|
| Business approver | Owner-A | Approves scope, data mode, and stop decisions | Approver only |
| HITL approver | Staff-A1 | Reviews, modifies, approves, or rejects drafts | Least privilege for queue work |
| Audit viewer | Staff-A2 | Reviews audit summaries and operational notes | Read-only where possible |
| Pilot operator | FlowBiz-Ops | Runs cadence, metrics, and owner check-ins | Operational access only |
| Technical owner | FlowBiz-Tech | Confirms staging health, safe flags, rollback | Admin only where needed |

No real owner or staff names are recorded in repo.

---

## 5) Selected Workflows

PR-19 limits pilot prep to four workflows:

1. New lead welcome.
2. No-show recovery.
3. Review request.
4. Repeat visit reminder.

No additional workflow may be activated without an updated prep note and owner acknowledgement.

---

## 6) Success Criteria

Prep is successful when:
1. Day 1 checklist is complete.
2. Safe operating mode is verified.
3. Staff can log in and view assigned work.
4. HITL queue and audit views are visible.
5. Data scope and import cap are documented.
6. Metrics capture plan is ready.
7. Stop conditions are understood.

Success is operational readiness only. It is not a revenue, conversion, financial-return, or clinical-result claim.

---

## 7) Start Prerequisites

Before Day 1 operational use:
1. Decision gate remains READY_FOR_LIMITED_PILOT_PREP.
2. Owner action blockers remain closed.
3. Staging health checks pass.
4. Safe flags remain fail-closed unless separate QA approval exists.
5. Staff roles are provisioned with least privilege.
6. Import cap and data mode are accepted.
7. No stop condition is active.

---

## 8) PR-19 Decision

Because all required PR-19 prep documents are complete and PR-18 readiness is READY_FOR_LIMITED_PILOT_PREP, PR-19 decision is:

- READY_FOR_DAY_1_PREP

This is not an active pilot start status.
