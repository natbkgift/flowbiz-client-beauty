# Clinic Alpha — Staff Training Mini-Script

Document type: Day 0 staff training guide — demo session
Pilot clinic: **Clinic Alpha** (pseudonym — real name in ops system only)
Audience: Staff-A1 (front desk / CRM operator)
Duration: ~15 minutes (embedded in Block 3–4 of Day 0 agenda)
Status: **DRAFT — facilitator guide**

---

> **Note for facilitator (FlowBiz-Ops)**:
> This script guides the hands-on training for Staff-A1 during the Day 0 demo.
> Staff-A1 should perform actions themselves with coaching — not just watch.
> All actions use staging environment with demo seed data. No real messages, no real customers.

---

## Training Goal

By the end of this 15-minute training, Staff-A1 should be able to:

1. Log in to the staging system independently
2. Find the HITL approval queue
3. Read an AI draft message
4. Approve a draft as-is
5. Modify a draft before approving
6. Reject a draft they don't like
7. Know how to find leads waiting for follow-up
8. Know where to get help if something goes wrong

---

## Part 1 — Logging In (2 minutes)

**Facilitator script:**

> "Let's start with logging in. Here are your demo credentials — username and password. Type these in at the login screen."

Hand Staff-A1 the staging credentials (from ops system — not in this file).

Wait for Staff-A1 to log in.

> "Good. You should see the main dashboard. On the left side, there are tabs — Leads, HITL Queue, Conversations. Today we will mainly use the HITL Queue."

**What to check:**
- [ ] Staff-A1 logged in successfully
- [ ] Dashboard loads without errors
- [ ] Staff-A1 sees the Leads tab and HITL Queue tab

---

## Part 2 — The HITL Queue (3 minutes)

**Facilitator script:**

> "Click on 'HITL Queue' in the left menu. This is the most important screen for your daily work."

Point to the queue on screen.

> "Every time the system prepares a message for a customer, it comes here first. The system does not send anything to customers by itself. It always waits for you to check it."

> "You will see a list of draft messages. Each one has a customer name, which workflow created it, and the message text. Let's look at the first one."

Ask Staff-A1:
> "What does this message say? Does it look correct to you?"

Let Staff-A1 read it and answer. This is normal — there is no wrong answer.

**Key concept to confirm:**

> "This is called HITL — Human In The Loop. You are the human. The AI writes a draft. You decide if it goes out."

**What to check:**
- [ ] Staff-A1 can navigate to HITL Queue
- [ ] Staff-A1 can see and read draft messages
- [ ] Staff-A1 understands the concept: draft first, then staff decides

---

## Part 3 — Approving a Draft (3 minutes)

**Facilitator script:**

> "Let's say this draft looks good. You are happy with it. What do you do? You click the green Approve button."

**Staff-A1 action**: Click Approve on Draft A.

> "Good. See how the status changed? It now says 'Approved'. In real mode, this is when the message would be sent to the customer via LINE. Since we are in demo mode today, nothing actually goes out — but the status shows what would happen."

> "Approving takes about 5 seconds. That is all you need to do for a good draft."

**What to check:**
- [ ] Staff-A1 can click Approve
- [ ] Draft status changes after approval
- [ ] Staff-A1 is comfortable with the flow

---

## Part 4 — Modifying a Draft (4 minutes)

**Facilitator script:**

> "Now let's look at Draft B. Read it to yourself."

Wait for Staff-A1 to read.

> "Imagine the AI used a formal greeting but your clinic usually speaks more casually. Or maybe the customer's name is slightly wrong. You can edit the message before approving."

> "Click the Edit button — it looks like a pencil icon. Change one or two words."

**Staff-A1 action**: Edit the draft (change greeting or add a personal touch).

> "Now click Approve. The system saves both — the original AI draft and what you changed. This is the audit trail."

> "In real use, this is where you add your personal touch. The AI gives you a starting point — you make it sound like your clinic."

**What to check:**
- [ ] Staff-A1 can click Edit
- [ ] Staff-A1 can type changes in the message box
- [ ] Staff-A1 can click Approve after editing
- [ ] Staff-A1 understands the audit trail concept

---

## Part 5 — Rejecting a Draft (2 minutes)

**Facilitator script:**

> "Sometimes the AI writes something that doesn't feel right at all. Maybe the timing is wrong, or the customer situation changed. In that case, you can reject the draft."

> "Click the Reject button on Draft C. The system will ask you for a reason — this is optional but helpful for improving the AI over time."

**Staff-A1 action**: Click Reject, optionally type a reason.

> "The draft is now rejected. No message goes out. You can write a manual reply from the Conversations tab if needed."

> "Rejection is not a problem — it is the right move when the draft doesn't fit."

**What to check:**
- [ ] Staff-A1 can click Reject
- [ ] Staff-A1 is not afraid to use Reject
- [ ] Staff-A1 understands: Reject = no message, manual option available

---

## Part 6 — Finding Leads (2 minutes)

**Facilitator script:**

> "One more thing — let's look at the Leads tab. This is your lead list."

Navigate to the Leads tab.

> "You can see each lead's status — New, Contacted, Appointment Set, No-Show, and so on. If you see a lead flagged as Uncontacted for more than 2 days, that means the system has already prepared a follow-up draft in the HITL Queue for you."

> "You do not need to manually find every lead. The system alerts you through the queue. Your job is to check the queue — ideally once or twice a day."

**What to check:**
- [ ] Staff-A1 can navigate to Leads tab
- [ ] Staff-A1 understands the lead status system
- [ ] Staff-A1 understands daily queue check is the main routine

---

## Part 7 — Getting Help (1 minute)

**Facilitator script:**

> "If something looks wrong, or a message got approved by mistake, or you are not sure what to do — here is what to do:"

> "First: don't panic. No real messages go out unless you approve them, and you can flag anything for review."

> "Second: contact the FlowBiz operator — contact details are in the ops system."

> "Third: if something is urgent — like a wrong message appears to have gone out — use the emergency disable. We will cover that in a separate briefing."

Show the rollback/disable contact info location (ops system, not in this file).

---

## Training Completion Check

| Skill | Staff-A1 Demonstrated | Confident? |
|---|---|---|
| Log in to staging | ☐ Yes / ☐ No | ☐ Yes / ☐ Needs more time |
| Navigate to HITL Queue | ☐ Yes / ☐ No | ☐ Yes / ☐ Needs more time |
| Read and understand a draft | ☐ Yes / ☐ No | ☐ Yes / ☐ Needs more time |
| Approve a draft | ☐ Yes / ☐ No | ☐ Yes / ☐ Needs more time |
| Modify and approve a draft | ☐ Yes / ☐ No | ☐ Yes / ☐ Needs more time |
| Reject a draft | ☐ Yes / ☐ No | ☐ Yes / ☐ Needs more time |
| Find leads in leads tab | ☐ Yes / ☐ No | ☐ Yes / ☐ Needs more time |
| Knows how to get help | ☐ Yes / ☐ No | ☐ Yes / ☐ Needs more time |

**Overall training result:**
- ☐ **READY** — Staff-A1 can operate HITL queue independently
- ☐ **NEEDS FOLLOW-UP** — Schedule 15-min follow-up session before Week 1 start

---

## Common Staff Concerns and Responses

| Concern | Response |
|---|---|
| "What if I approve the wrong message?" | "In real mode, that message would go to the customer via LINE. That is why we review carefully. If a wrong message goes out, contact FlowBiz immediately — we log everything and can follow up." |
| "This seems like a lot of extra work" | "The queue check takes about 5–10 minutes per day. Compare that to manually typing every follow-up from scratch." |
| "What if a customer complains about a message?" | "The audit log shows exactly what was approved and by whom. Every action is tracked." |
| "I don't always check my phone at work" | "The system sends queue notifications. You can set the frequency. The messages wait in the queue — they don't expire." |
| "What if the AI writes something about treatment effects or safety?" | "It shouldn't — there are filters for that. But if you see any draft claiming treatment results or safety guarantees, reject it and flag it to FlowBiz. That is exactly the kind of thing we need to know about." |

---

## References

- [CLINIC_ALPHA_DAY_0_AGENDA.md](CLINIC_ALPHA_DAY_0_AGENDA.md) — full session context
- [PILOT_LINE_GEMINI_OPERATING_MODE.md](PILOT_LINE_GEMINI_OPERATING_MODE.md) — LINE/AI mode switches
- [PILOT_ROLLBACK_AND_DISABLE_PLAN.md](PILOT_ROLLBACK_AND_DISABLE_PLAN.md) — emergency disable
- [HITL_APPROVAL_CONTRACT.md](../HITL_APPROVAL_CONTRACT.md) — HITL rules
