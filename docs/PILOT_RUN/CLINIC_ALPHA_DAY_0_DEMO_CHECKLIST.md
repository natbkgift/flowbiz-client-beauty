# Clinic Alpha — Day 0 Demo Checklist

Document type: Pre-demo technical and content checklist
Pilot clinic: **Clinic Alpha** (pseudonym — real name in ops system only)
Owner: FlowBiz-Ops + FlowBiz-Tech
Status: **DRAFT — complete before session starts**

---

> **CRITICAL**: This checklist must be completed **30 minutes before** the demo session.
> Every item must be checked. If any item is FAIL, resolve before session or reschedule.
> No real customer data, real LINE messages, or real Gemini generation during this session.

---

## Section A — Staging Environment

| # | Check | How to Verify | Status |
|---|---|---|---|
| A1 | Staging server is running | `curl https://staging.flowbiz.io/health` returns `{"status":"ok"}` | ☐ |
| A2 | Staging DB is up | API returns data (not 500/503) | ☐ |
| A3 | No recent deploy in last 2 hours | Check deploy log | ☐ |
| A4 | Staging URL accessible from clinic's device | Test from Owner-A's phone/laptop | ☐ |
| A5 | Screen share / projector confirmed | Test before session | ☐ |

**Section A result:** ☐ ALL PASS &nbsp;|&nbsp; ☐ BLOCKER — DO NOT PROCEED

---

## Section B — Demo Seed Data

| # | Check | How to Verify | Status |
|---|---|---|---|
| B1 | `npm run seed:demo` completed successfully | Exit code 0, no errors | ☐ |
| B2 | Clinic Alpha workspace exists on staging | Login → workspace selector shows "Clinic Alpha" | ☐ |
| B3 | 5 demo leads visible in lead list | Dashboard → Leads tab → count ≥ 5 | ☐ |
| B4 | Demo lead names are pseudonymized (Thai names, not real) | Visual check — no real names | ☐ |
| B5 | Demo leads have diverse statuses | At least: new, uncontacted, no-show, treatment-complete, returning | ☐ |
| B6 | HITL queue has ≥ 3 pending draft messages | Dashboard → HITL queue → pending count | ☐ |
| B7 | All 5 workflow automations are active | Settings → Automations → all 5 status = active | ☐ |
| B8 | No real patient data in staging DB | Quick visual scan of lead list — all pseudonymized | ☐ |

**Section B result:** ☐ ALL PASS &nbsp;|&nbsp; ☐ BLOCKER — DO NOT PROCEED

---

## Section C — Safety Mode Verification

> These checks confirm real LINE and real Gemini are OFF. Must be confirmed before every demo session.

| # | Check | How to Verify | Status |
|---|---|---|---|
| C1 | `LINE_INTEGRATION_MODE=simulated` | Check staging env or API `/debug/env-mode` (if available) | ☐ |
| C2 | `LINE_REAL_SEND_ENABLED=false` | Confirm in `/etc/flowbiz/flowbiz-beauty-staging.env` — NOT `true` | ☐ |
| C3 | `AI_PROVIDER=mock` | Confirm in staging env | ☐ |
| C4 | `AI_REAL_GENERATION_ENABLED=false` | Confirm in `/etc/flowbiz/flowbiz-beauty-staging.env` — NOT `true` | ☐ |
| C5 | Send a test HITL approval — confirm no LINE message leaves staging | Approve a demo HITL draft → check LINE OA (should receive nothing) | ☐ |
| C6 | Confirm mock AI generates output (not blank/error) | Check HITL queue — drafts present and readable | ☐ |

> **If C2 or C4 are `true`**: STOP. Set them back to `false` before demo. Real send is not permitted during demo mode.

**Section C result:** ☐ ALL PASS &nbsp;|&nbsp; ☐ BLOCKER — DO NOT PROCEED

---

## Section D — Accounts and Access

| # | Check | How to Verify | Status |
|---|---|---|---|
| D1 | Staff-A1 staging account created | Login with Staff-A1 credentials → dashboard loads | ☐ |
| D2 | Owner-A staging account created | Login with Owner-A credentials → dashboard loads | ☐ |
| D3 | Staff-A1 role = `operator` | Settings → Users → Staff-A1 role | ☐ |
| D4 | Owner-A role = `workspace_admin` or `viewer` as agreed | Settings → Users → Owner-A role | ☐ |
| D5 | Staff-A1 can access HITL queue | Login as Staff-A1 → HITL queue visible | ☐ |
| D6 | Staff-A1 can approve/reject a HITL draft | Test approval flow with demo draft | ☐ |
| D7 | Credentials for Staff-A1 and Owner-A ready to hand over | In ops system, not in this file | ☐ |

**Section D result:** ☐ ALL PASS &nbsp;|&nbsp; ☐ BLOCKER — DO NOT PROCEED

---

## Section E — Content and Messaging

| # | Check | How to Verify | Status |
|---|---|---|---|
| E1 | All AI draft messages are in Thai (or agreed language) | Check HITL queue drafts — correct language | ☐ |
| E2 | No draft contains medical claims or treatment guarantees | Read each draft — no outcome-guarantee or safety-guarantee wording | ☐ |
| E3 | No draft contains real personal data | Read each draft — demo names only | ☐ |
| E4 | No draft contains pricing or ROI claims | Read each draft | ☐ |
| E5 | Workflow trigger labels visible in demo UI | Workflow 1–5 names readable in demo | ☐ |
| E6 | Demo lead names are appropriate (Thai, friendly, non-offensive) | Visual check | ☐ |

**Section E result:** ☐ ALL PASS &nbsp;|&nbsp; ☐ BLOCKER — DO NOT PROCEED

---

## Section F — Facilitator Preparation

| # | Check | Status |
|---|---|---|
| F1 | FlowBiz-Ops has reviewed the full session agenda ([CLINIC_ALPHA_DAY_0_AGENDA.md](CLINIC_ALPHA_DAY_0_AGENDA.md)) | ☐ |
| F2 | FlowBiz-Ops has practiced the HITL demo flow once | ☐ |
| F3 | Staff training script reviewed ([CLINIC_ALPHA_STAFF_TRAINING_SCRIPT.md](CLINIC_ALPHA_STAFF_TRAINING_SCRIPT.md)) | ☐ |
| F4 | Owner decision checklist printed/ready ([CLINIC_ALPHA_OWNER_DECISION_CHECKLIST.md](CLINIC_ALPHA_OWNER_DECISION_CHECKLIST.md)) | ☐ |
| F5 | Feedback form ready to send after session ([CLINIC_ALPHA_POST_DEMO_FEEDBACK_FORM.md](CLINIC_ALPHA_POST_DEMO_FEEDBACK_FORM.md)) | ☐ |
| F6 | Day 0 report template ready to fill in ([CLINIC_ALPHA_DAY_0_REPORT_TEMPLATE.md](CLINIC_ALPHA_DAY_0_REPORT_TEMPLATE.md)) | ☐ |
| F7 | Written pilot agreement PDF ready to send (if Owner-A decides to proceed) | ☐ |
| F8 | FlowBiz-Tech on standby for technical issues | ☐ |

**Section F result:** ☐ ALL PASS &nbsp;|&nbsp; ☐ PROCEED WITH CAUTION

---

## Section G — Scope Reminder (Read Aloud Before Session Starts)

> Read this to yourself or to the team before entering the session:

```
Today is a demo session — demo data only, staging only.
Nothing we show today involves real customers or real messages.
LINE is in simulated mode. AI is in mock mode.
Our goal is to show the HITL workflow and get Owner-A's decision.
We do not promise revenue, clinical outcomes, or ROI.
We do not mention the clinic's real name or real customer names.
```

---

## Go / No-Go Summary

| Section | Result | Decision |
|---|---|---|
| A — Staging | ☐ Pass / ☐ Fail | |
| B — Seed data | ☐ Pass / ☐ Fail | |
| C — Safety mode | ☐ Pass / ☐ Fail | |
| D — Accounts | ☐ Pass / ☐ Fail | |
| E — Content | ☐ Pass / ☐ Fail | |
| F — Facilitator | ☐ Pass / ☐ Caution | |

**Overall go/no-go:** ☐ **GO — proceed with demo** &nbsp;|&nbsp; ☐ **NO-GO — resolve blockers first**

Signed off by: `<FlowBiz-Ops — name not in repo>`
Date/time: `<Fill in on day>`

---

## References

- [CLINIC_ALPHA_DAY_0_AGENDA.md](CLINIC_ALPHA_DAY_0_AGENDA.md)
- [PILOT_DAY_0_RUNBOOK.md](PILOT_DAY_0_RUNBOOK.md)
- [PILOT_LINE_GEMINI_OPERATING_MODE.md](PILOT_LINE_GEMINI_OPERATING_MODE.md)
- [PILOT_DATA_INTAKE_CHECKLIST.md](PILOT_DATA_INTAKE_CHECKLIST.md)
- [PILOT_ROLLBACK_AND_DISABLE_PLAN.md](PILOT_ROLLBACK_AND_DISABLE_PLAN.md)
