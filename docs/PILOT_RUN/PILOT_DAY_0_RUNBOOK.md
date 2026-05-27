# Pilot Day 0 Runbook — FlowBiz Beauty

Date: 2026-05-28
Version: 1.0

---

## Purpose

This runbook defines the complete set of actions for Day 0 — the first day the clinic team interacts with FlowBiz Beauty.
Day 0 is a guided walkthrough, not a live production session.

Day 0 goal: clinic staff understand the product, can log in, can see the demo clinic, and are ready to use HITL review.

---

## Pre-Day 0 — FlowBiz Operator Preflight (Day Before)

Complete these before the Day 0 session:

### Environment

- [ ] Staging server is running: `curl https://<STAGING_HOST>/api/ready` → `{"status":"ok"}`
- [ ] Demo clinic seed is current: `npm run seed:demo` has been run on staging
- [ ] Staging is isolated: no production DB connection, no production credentials
- [ ] LINE mode: `LINE_INTEGRATION_MODE=simulated`, `LINE_REAL_SEND_ENABLED=false`
- [ ] AI mode: `AI_PROVIDER=mock`, `AI_REAL_GENERATION_ENABLED=false`

### Accounts

- [ ] Pilot Admin account created for FlowBiz operator (staging)
- [ ] Clinic Operator account(s) created for clinic staff (staging)
- [ ] Optional Viewer account created for clinic owner (staging)
- [ ] Login credentials shared securely with clinic staff
- [ ] Test login confirmed for each account

### Data

- [ ] Data mode confirmed: `demo` / `pseudonymized` / `limited real operational`
- [ ] Demo seed data is present: at least 10–20 sample leads visible
- [ ] No real customer data imported unless data intake checklist is complete
- [ ] No disallowed fields in any imported record

### Pilot Scope

- [ ] Exactly 5 (or fewer) workflows are enabled in staging config
- [ ] No other workflows active
- [ ] Pilot clinic workspace is isolated in correct tenant

### Materials Prepared

- [ ] Demo walkthrough script ready (see `docs/DEMO_CLINIC_SCRIPT.md`)
- [ ] HITL explanation slide or visual ready
- [ ] Support/escalation contact shared with clinic team
- [ ] Weekly check-in schedule agreed

---

## Day 0 Session Agenda (60–90 minutes)

### Part 1 — Welcome and Context (10 min)

- Introduce FlowBiz Beauty product purpose
- Confirm: this is a staging pilot, not production
- Confirm: no real messages will be sent today (simulated mode)
- Confirm: AI suggestions require staff approval before send
- Confirm: we are testing with demo data
- Collect any remaining baseline metrics from staff

### Part 2 — Staging Readiness Check (5 min)

- Pilot Admin confirms: `GET /api/ready` → healthy
- Show clinic team the staging URL
- Confirm team can access the staging URL from their devices
- Note: staging URL — `<STAGING_URL>`

### Part 3 — Staff Login Check (10 min)

For each clinic account:
- [ ] Staff logs in
- [ ] Correct workspace is visible (clinic tenant)
- [ ] No cross-clinic data visible
- [ ] Role is correct (operator / viewer)

### Part 4 — Demo Walkthrough (20–30 min)

Walk through each selected workflow using demo data:

**Workflow 1 — New Lead Welcome**
- [ ] Show new lead in demo
- [ ] Show AI suggestion in HITL queue
- [ ] Walk through approve → queue → (simulated) send flow
- [ ] Show audit trail entry

**Workflow 2 — Uncontacted Lead Alert**
- [ ] Show uncontacted leads list
- [ ] Show alert in dashboard
- [ ] Explain: staff action required, not auto-sent

**Workflow 3 — No-Show Recovery**
- [ ] Show no-show lead in demo
- [ ] Show AI recovery draft in HITL queue
- [ ] Walk through approve/modify/reject
- [ ] Show audit trail entry

**Workflow 4 — Review Request**
- [ ] Show eligible customer in demo
- [ ] Show AI review request draft
- [ ] Walk through HITL review flow

**Workflow 5 — Botox/Filler Repeat Reminder**
- [ ] Show eligible customer in demo
- [ ] Show AI repeat reminder draft
- [ ] Walk through HITL review flow

### Part 5 — HITL Explanation and Practice (10 min)

- Explain: every AI suggestion must be approved before send
- Explain: approve (original text), modify (edit then approve), reject (discard)
- Explain: rejected messages cannot be sent
- Ask each operator to approve one demo HITL item
- Confirm understanding: operators comfortable with HITL?
- Note any concerns: `<NOTES>`

### Part 6 — First Real Controlled Send (If Approved — Optional)

Only if real LINE is QA-gated and all conditions in `PILOT_LINE_GEMINI_OPERATING_MODE.md` are met:

- [ ] FlowBiz technical owner has confirmed real LINE mode
- [ ] `LINE_REAL_SEND_ENABLED=true` in staging env (not in repo)
- [ ] Recipient is a designated test contact (not a real clinic customer)
- [ ] Test message content is safe and compliant
- [ ] Staff sends ONE approved test message to designated test contact
- [ ] Confirm LINE message received by test contact
- [ ] Show audit trail entry for `ai.hitl_outbound_queued` and send event

> If any condition is not met, skip this step. Real send is optional on Day 0.

### Part 7 — Audit Proof Check (5 min)

- Show audit log for Day 0 session
- Confirm: all AI suggestion events logged
- Confirm: HITL approval events logged
- Confirm: no events without clinic/workspace ID

### Part 8 — Day 0 Go / No-Go (5 min)

Review each item:

| Check | Status |
|---|---|
| Staging healthy | `[ ]` Pass `[ ]` Fail |
| All staff logged in | `[ ]` Pass `[ ]` Fail |
| HITL workflow understood | `[ ]` Pass `[ ]` Fail |
| Demo data visible | `[ ]` Pass `[ ]` Fail |
| Selected workflows clear | `[ ]` Pass `[ ]` Fail |
| Audit trail readable | `[ ]` Pass `[ ]` Fail |
| No cross-tenant data visible | `[ ]` Pass `[ ]` Fail |
| No real data in demo mode | `[ ]` Pass `[ ]` Fail |
| Support contacts shared | `[ ]` Pass `[ ]` Fail |
| Weekly check-in scheduled | `[ ]` Pass `[ ]` Fail |

**Day 0 Decision:**

- [ ] **GO** — Proceed to Week 1 operating cadence
- [ ] **CONDITIONAL GO** — Proceed with issues noted: `<DESCRIBE>`
- [ ] **NO-GO** — Blocking issue: `<DESCRIBE>` — resolve before Week 1

---

## Post-Day 0 — Operator Notes

Complete within 24h of Day 0:

- Staff readiness assessment: `<NOTES>`
- Owner engagement: `<NOTES>`
- Issues identified: `<ISSUES>`
- Data mode in effect: `<demo / pseudonymized / limited real>`
- LINE mode in effect: `<simulated / real (if approved)>`
- AI mode in effect: `<mock / gemini (if approved)>`
- Week 1 check-in date confirmed: `<DATE>`
- Baseline metrics update after Day 0: `<NOTES>`

---

## References

- [FIRST_FRIENDLY_PILOT_SETUP.md](FIRST_FRIENDLY_PILOT_SETUP.md)
- [PILOT_STAFF_ACCESS_PLAN.md](PILOT_STAFF_ACCESS_PLAN.md)
- [PILOT_LINE_GEMINI_OPERATING_MODE.md](PILOT_LINE_GEMINI_OPERATING_MODE.md)
- [PILOT_DATA_INTAKE_CHECKLIST.md](PILOT_DATA_INTAKE_CHECKLIST.md)
- [PILOT_ROLLBACK_AND_DISABLE_PLAN.md](PILOT_ROLLBACK_AND_DISABLE_PLAN.md)
- [../DEMO_CLINIC_SCRIPT.md](../DEMO_CLINIC_SCRIPT.md)
- [../STAGING_DEPLOYMENT_RUNBOOK.md](../STAGING_DEPLOYMENT_RUNBOOK.md)
