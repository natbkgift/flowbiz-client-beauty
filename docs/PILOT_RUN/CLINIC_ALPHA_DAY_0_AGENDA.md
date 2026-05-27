# Clinic Alpha — Day 0 Demo Session Agenda

Document type: Day 0 preparation — demo-only
Pilot clinic: **Clinic Alpha** (pseudonym — real name in ops system only)
Date: `<TBD — schedule with Owner-A>`
Location: `<TBD — on-site at clinic / remote video call>`
Session duration: ~45 minutes
Status: **DRAFT — pending Day 0 date confirmation**

---

> **DATA SAFETY NOTICE**
>
> - This demo uses **staging environment + demo seed data only**. No real customer data.
> - `LINE_REAL_SEND_ENABLED=false` — no real LINE messages will be sent during this session.
> - `AI_REAL_GENERATION_ENABLED=false` — all AI output uses the mock provider.
> - Attendees: Owner-A, Staff-A1, FlowBiz operator (facilitator).
> - Real clinic name, owner name, and contact details are **not in this file**.

---

## Attendees

| Role | Pseudonym | Present |
|---|---|---|
| Clinic owner / approver | Owner-A | Required |
| Front desk / operator | Staff-A1 | Required |
| FlowBiz operator (facilitator) | FlowBiz-Ops | Required |
| FlowBiz technical support | FlowBiz-Tech | Optional (standby) |

---

## Pre-Session Setup (T–30 min before session)

FlowBiz-Ops and FlowBiz-Tech complete before attendees join:

- [ ] Staging environment is running and accessible
- [ ] Demo seed data loaded (`npm run seed:demo` confirmed)
- [ ] Clinic Alpha workspace created on staging (demo tenant)
- [ ] Staff-A1 staging account created and login tested
- [ ] Owner-A staging viewer account created and login tested
- [ ] 5 demo leads visible in the lead list
- [ ] HITL approval queue has at least 2 pending demo drafts
- [ ] All 5 workflow automations are active in staging
- [ ] Screen share / projection ready
- [ ] `LINE_REAL_SEND_ENABLED=false` confirmed in staging env
- [ ] `AI_REAL_GENERATION_ENABLED=false` confirmed in staging env

See [CLINIC_ALPHA_DAY_0_DEMO_CHECKLIST.md](CLINIC_ALPHA_DAY_0_DEMO_CHECKLIST.md) for full checklist.

---

## Session Agenda

### Block 1 — Opening and Positioning (5 minutes)

**Who speaks:** FlowBiz-Ops

**Goal:** Set expectations clearly. Owner-A and Staff-A1 understand what this demo is and is not.

Talking points:

1. **What FlowBiz is**: A messaging follow-up tool that helps clinics respond to leads, reduce no-shows, and re-engage repeat customers — all through LINE, with staff approval before anything sends.

2. **What we will do today**:
   - Walk through the system together using demo data (not real customers)
   - Show all 5 workflows selected for Clinic Alpha
   - Practice the HITL approval flow (Staff-A1 approves/edits/rejects AI drafts)
   - Answer all questions

3. **What we will NOT do today**:
   - Send any real LINE messages to real customers
   - Import real customer data
   - Make any commitments about revenue or outcomes
   - Turn on real AI generation

4. **One key idea to establish**: _"Every AI message is a draft first. Nothing sends until staff approves it."_

**Transition:** "Let me show you the system. We will start with what the dashboard looks like."

---

### Block 2 — System Overview (5 minutes)

**Who drives:** FlowBiz-Ops (screen share — staging dashboard)

**Goal:** Orient Owner-A and Staff-A1 to the interface before any workflow demo.

Walk through:

1. **Dashboard overview** — main sections: Leads, HITL Queue, Conversations, Automations
2. **Demo leads visible** — point out 5 demo leads (pseudonymized Thai names)
3. **Explain the HITL queue** — "This is where AI drafts wait for your approval"
4. **Explain status icons** — lead status, workflow active/inactive, HITL pending/approved/rejected
5. **Login as Staff-A1** — show how staff sees the system vs. owner view

Ask: _"Any questions about what you see before we go into the workflows?"_

---

### Block 3 — Workflow Demo (20 minutes, ~4 min per workflow)

**Who drives:** FlowBiz-Ops (screen share) with Staff-A1 doing live actions on workflows 1 and 3

**Goal:** Show all 5 workflows in action using demo data. Staff-A1 does a live HITL approval.

---

#### Workflow 1 — New Lead Welcome (4 min)

_Scenario: A new customer inquires about Botox via LINE_

1. Show demo lead "Lead-Demo-01" appearing in the lead list (just came in)
2. System triggers workflow → AI drafts a welcome message
3. Draft appears in HITL queue — status: `pending_approval`
4. **Staff-A1 live action**: review the draft, edit one word, click Approve
5. Show message status changes to `approved`
6. Explain: message would go out via LINE — but `LINE_REAL_SEND_ENABLED=false` so nothing leaves staging

Key point to make: _"The AI wrote the draft. Staff-A1 changed one word and approved. The message only sends after approval — AI never sends directly."_

---

#### Workflow 2 — Uncontacted Lead Alert (4 min)

_Scenario: A lead from 3 days ago has not been contacted_

1. Show demo lead "Lead-Demo-02" with flag: "uncontacted for 3 days"
2. System generates alert → staff notified
3. AI draft follow-up created → appears in HITL queue
4. **FlowBiz-Ops demonstrates**: review draft, click Reject (to show rejection also works)
5. Staff-A1 types a manual reply instead
6. Explain: "If you don't like the AI draft, you can reject it and type your own"

Key point: _"The system reminds staff to follow up and offers a draft. Staff are always in control."_

---

#### Workflow 3 — No-Show Recovery (4 min)

_Scenario: A customer missed their appointment yesterday_

1. Show demo lead "Lead-Demo-03" with status: "no-show — appointment missed"
2. Workflow triggers → AI drafts a re-booking message
3. Draft appears in HITL queue
4. **Staff-A1 live action**: review, approve without changes
5. Show status: `approved` — would send via LINE in real mode

Key point: _"Normally this is the message that staff forget to send. The system remembers and prepares the draft automatically."_

Ask: _"Does this match what happens in your clinic when a customer misses an appointment?"_

---

#### Workflow 4 — Review Request (4 min)

_Scenario: A customer completed a treatment 3 days ago_

1. Show demo lead "Lead-Demo-04" status: "treatment complete — 3 days ago"
2. Workflow triggers → AI drafts a Google review request in Thai
3. Draft appears in HITL queue
4. **FlowBiz-Ops demonstrates**: read draft aloud, discuss the tone
5. Explain: staff can change the wording if it doesn't match clinic's voice

Key point: _"This is the message that clinics want to send but forget. The system handles the timing automatically."_

---

#### Workflow 5 — Botox/Filler Repeat Reminder (4 min)

_Scenario: A returning customer did Botox 90 days ago_

1. Show demo lead "Lead-Demo-05" — returning customer, last treatment 90 days ago
2. Workflow triggers → AI drafts a "time for a touch-up" reminder in Thai
3. Draft appears in HITL queue
4. Read draft with Owner-A and Staff-A1 — discuss whether the message sounds right
5. Point out: message does NOT mention specific treatment amounts, dosages, or medical claims

Key point: _"The AI draft uses soft language — a friendly reminder. It does not make medical claims. Staff can add personal touches before approving."_

---

### Block 4 — HITL Deep Dive (5 minutes)

**Who drives:** Staff-A1 (with FlowBiz-Ops coaching)

**Goal:** Staff-A1 is confident handling the HITL queue independently.

Exercise: Simulator run — 3 drafts in HITL queue, Staff-A1 processes them without guidance:

| Draft | Action |
|---|---|
| Draft A — good draft, send as-is | Staff-A1: **Approve** |
| Draft B — decent but wrong name in greeting | Staff-A1: **Modify** then Approve |
| Draft C — tone doesn't fit this customer | Staff-A1: **Reject** |

Debrief: _"In real use, you will see drafts like these every day. Your job is to check each one and decide. If it looks good, approve. If it needs changes, edit then approve. If it's wrong, reject and the system logs that."_

Explain audit trail: _"Every approval, modification, and rejection is logged with timestamp and staff name."_

---

### Block 5 — Questions and Concerns (7 minutes)

**Who leads:** FlowBiz-Ops (Owner-A and Staff-A1 ask questions)

Anticipated questions and prepared answers:

| Likely Question | Prepared Answer |
|---|---|
| "What if the AI sends something wrong?" | "It can't. Nothing sends without staff approval. Every message is draft-first." |
| "What happens to our customer data?" | "Today we use demo data only. Real data intake requires your written consent first. Data handling is covered in our data policy which we will share with you." |
| "Can we customize the message templates?" | "Yes — the templates can be edited. The AI draft is a starting point, not fixed content." |
| "How long will it take for staff to learn?" | "Most staff are comfortable with the HITL queue within the first week. Today's session is the main training." |
| "What is the cost?" | "We will discuss pricing after the pilot. The pilot period is free. No commitment until you decide to convert." |
| "Can we stop at any time?" | "Yes — one message from you and we disable everything within the hour. Full rollback procedure is documented." |
| "Will AI mention medical procedures or dosages?" | "No. The AI uses general follow-up language only. It cannot and should not make medical claims. That is a hard boundary in our system." |

---

### Block 6 — Go / No-Go Decision (3 minutes)

**Who leads:** FlowBiz-Ops (Owner-A makes decision)

See [CLINIC_ALPHA_OWNER_DECISION_CHECKLIST.md](CLINIC_ALPHA_OWNER_DECISION_CHECKLIST.md) for full decision flow.

Summarize what was shown today:
- 5 workflows demonstrated
- HITL approval flow practiced by Staff-A1
- No real data, no real send
- All questions answered (or noted for follow-up)

Ask Owner-A directly:

> "Based on what you saw today — are you ready to move to a limited pilot with pseudonymized data, or would you like another demo session first?"

Decision options:

| Option | Meaning | Next Step |
|---|---|---|
| **Proceed to limited pilot** | Clinic ready to run the 5 workflows with pseudonymized data | Sign pilot agreement → set Week 1 start date |
| **Demo again** | Clinic wants a second demo before committing | Schedule Demo 2 — address specific concerns |
| **Delay** | Not ready now — schedule for later | Set a follow-up date |
| **Not a fit** | Clinic decides this is not the right tool | Close pilot gracefully |

---

### Post-Session (after attendees leave)

FlowBiz-Ops completes immediately:

- [ ] Fill in [CLINIC_ALPHA_DAY_0_REPORT_TEMPLATE.md](CLINIC_ALPHA_DAY_0_REPORT_TEMPLATE.md) with today's outcomes
- [ ] Record Owner-A's decision
- [ ] Send post-demo feedback form to Owner-A and Staff-A1 (see [CLINIC_ALPHA_POST_DEMO_FEEDBACK_FORM.md](CLINIC_ALPHA_POST_DEMO_FEEDBACK_FORM.md))
- [ ] If proceeding: send written pilot agreement for signature
- [ ] If proceeding: schedule Week 1 start date
- [ ] Log any open questions raised in session
- [ ] Confirm staging accounts remain active for Owner-A / Staff-A1 to explore

---

## References

- [CLINIC_ALPHA_DAY_0_DEMO_CHECKLIST.md](CLINIC_ALPHA_DAY_0_DEMO_CHECKLIST.md)
- [CLINIC_ALPHA_STAFF_TRAINING_SCRIPT.md](CLINIC_ALPHA_STAFF_TRAINING_SCRIPT.md)
- [CLINIC_ALPHA_OWNER_DECISION_CHECKLIST.md](CLINIC_ALPHA_OWNER_DECISION_CHECKLIST.md)
- [CLINIC_ALPHA_POST_DEMO_FEEDBACK_FORM.md](CLINIC_ALPHA_POST_DEMO_FEEDBACK_FORM.md)
- [CLINIC_ALPHA_DAY_0_REPORT_TEMPLATE.md](CLINIC_ALPHA_DAY_0_REPORT_TEMPLATE.md)
- [PILOT_DAY_0_RUNBOOK.md](PILOT_DAY_0_RUNBOOK.md)
- [PILOT_CLINIC_PROFILE_ALPHA.md](PILOT_CLINIC_PROFILE_ALPHA.md)
- [FIRST_PILOT_DISCOVERY_REPORT.md](FIRST_PILOT_DISCOVERY_REPORT.md)
- [PILOT_SCOPE_AND_BOUNDARIES.md](PILOT_SCOPE_AND_BOUNDARIES.md)
- [PILOT_LINE_GEMINI_OPERATING_MODE.md](PILOT_LINE_GEMINI_OPERATING_MODE.md)
