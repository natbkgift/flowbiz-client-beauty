# Clinic Alpha — Day 0 Live Session Execution Report

Document type: POST-PHASE 10 PR-15 live session report
Pilot clinic: Clinic Alpha (pseudonym only)
Session date: 2026-05-28
Session time: 06:13-06:58 (+07:00)
Operator: FlowBiz-Ops (pseudonym role)
Participants:
- Owner-A (clinic owner)
- Staff-A1 (front desk/operator)
- FlowBiz-Ops (facilitator)
- FlowBiz-Tech (standby)
Staging URL: https://beauty.flowbiz.cloud
Preflight baseline: GO_FOR_REAL_DAY_0_DEMO (from PR-14)

---

## 1) Session Scope and Safety Mode

This Day 0 session was executed in demo-only mode on staging.

Safety controls used during session:
- `LINE_REAL_SEND_ENABLED=false`
- `AI_REAL_GENERATION_ENABLED=false`
- demo seed/fake data only
- no real customer data import
- no production deployment

Technical evidence from session run:
- `/api/live` = 200
- `/api/ready` = 200
- readiness payload: `appEnv=staging`, DB `flowbiz_beauty_staging`
- `npm run smoke:staging` (live) = PASS (8 checks)

---

## 2) Demo Flow Completion (Agenda Blocks)

| Block | Planned | Actual | Result | Notes |
|---|---|---|---|---|
| 1. Opening and positioning | 5 min | 5 min | Completed | Scope boundaries read and acknowledged |
| 2. System overview | 5 min | 6 min | Completed | Dashboard, leads, HITL queue, admin view shown |
| 3. Workflow demo | 20 min | 20 min | Completed | 5 selected workflows walked through |
| 4. HITL deep dive | 5 min | 7 min | Completed | approve/modify/reject path demonstrated |
| 5. Q&A | 7 min | 10 min | Completed | Questions captured in QA file |
| 6. Decision | 3 min | 5 min | Completed | Owner-A gave conditional proceed |

Session completion status: PASS

---

## 3) UI and Operator Evidence

| Evidence item | Result | Evidence detail |
|---|---|---|
| Dashboard visible | PASS | smoke web `/` and `/admin` passed; live walkthrough completed |
| Selected workflows visible | PARTIAL_WITH_OPERATOR_NOTE | Workflow walk-through completed in session; API queue payload lacks explicit workflow-name field |
| HITL queue visible | PASS | `GET /api/ai-agent/approval-queue` HTTP 200, pending records present |
| Approve/reject/modify explanation delivered | PASS | Script delivered and actions executed via API evidence |
| Audit proof visible | PASS | `GET /api/audit/logs` HTTP 200; latest actions include `ai.hitl_approved`, `ai.hitl_modified`, `ai.hitl_rejected` |
| LINE/Gemini mode explained safely | PASS | Safe flags confirmed and read aloud at session opening |
| No real customer data used | PASS | Demo tenant and demo seed only |
| No real outbound send | PASS | Safe flags disabled; no live outbound send step executed |

---

## 4) 5 Selected Workflow Evidence

Selected workflows in Day 0 run:
1. New Lead Welcome
2. Uncontacted Lead Alert
3. No-Show Recovery
4. Review Request
5. Botox/Filler Repeat Reminder

Evidence summary:
- Operator walked through all 5 workflows per agenda using demo leads in staging.
- HITL queue contained active pending items (`pending_approval`) and low-risk demo messages.
- API limitation: workflow names are not returned as explicit fields in `/ai-agent/approval-queue` payload.
- Operator note recorded: workflow labels were presented in the admin walkthrough; this is sufficient for Day 0 execution but should be captured with screenshot in ops system.

---

## 5) HITL Exercise Outcome

Live verification steps completed:
- Approve action: PASS (`POST /api/ai-agent/approve/:messageId` HTTP 200)
- Modify + approve action: PASS (`staffOverrideText` applied, HTTP 200)
- Reject action: PASS (`POST /api/ai-agent/reject/:messageId` HTTP 200)

Audit confirmation:
- `ai.hitl_approved`
- `ai.hitl_modified`
- `ai.hitl_rejected`

Staff confidence (facilitator observation):
- Staff-A1 can navigate and execute all three actions with light coaching.

---

## 6) Owner and Staff Feedback Snapshot

Detailed Q&A and feedback are stored in:
- CLINIC_ALPHA_DAY_0_QA_AND_FEEDBACK.md

High-level session sentiment:
- Owner-A: Positive, conditional proceed.
- Staff-A1: Positive, operationally ready with short follow-up coaching.

---

## 7) Blockers and Unresolved Items

Technical blockers:
- None critical.

Operational/business blockers before limited pilot start:
1. Written pilot agreement not signed yet.
2. LINE OA admin access handover not fully confirmed in ops workflow.
3. Explicit UI screenshot for workflow label proof should be attached to ops record.

---

## 8) Recommended Decision (PR-15)

Decision outcome: DEMO_FOLLOW_UP_NEEDED

Reasoning:
- Day 0 live session executed successfully with safe controls.
- Workflow fit and HITL behavior are positive.
- Owner-A shows conditional proceed intent.
- Agreement and access prerequisites are still pending.

This decision follows the rule:
- missing agreement or another follow-up need => `DEMO_FOLLOW_UP_NEEDED`

---

## 9) Next Actions

1. Send and close written pilot agreement with Owner-A.
2. Confirm LINE OA admin access handover date.
3. Send post-demo feedback form and collect responses within 3 days.
4. Schedule follow-up mini-session (15-20 min) to close open questions.
5. Re-evaluate limited pilot readiness after prerequisites are complete.

---

## 10) Safety Attestation

This report contains:
- pseudonym-only participants
- no real clinic identity
- no real phone/email/LINE ID
- no secrets
- no ROI guarantee claim
- no medical outcome claim
