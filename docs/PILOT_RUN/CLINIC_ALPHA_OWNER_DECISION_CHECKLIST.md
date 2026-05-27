# Clinic Alpha — Owner Decision Checklist

Document type: Post-demo owner decision guide
Pilot clinic: **Clinic Alpha** (pseudonym — real name in ops system only)
Audience: Owner-A — to complete at end of Day 0 demo session
Facilitator: FlowBiz-Ops
Timing: Block 6 of Day 0 agenda — after all 5 workflows demonstrated

---

> **Note for facilitator**: Walk Owner-A through this checklist verbally.
> Record Owner-A's answers. Do NOT guess or fill in on Owner-A's behalf.
> Owner-A makes the decision. FlowBiz-Ops facilitates — does not pressure.

---

## Part A — Understanding Check

Before asking for a decision, confirm Owner-A understood the key concepts.

| # | Question | Answer |
|---|---|---|
| U1 | "Does the system send any message without staff approval?" | ☐ Correct: No, never / ☐ Needs clarification |
| U2 | "What is the staff's main daily task in this system?" | ☐ Correct: Review HITL queue / ☐ Needs clarification |
| U3 | "Can the AI write messages about medical treatment results?" | ☐ Correct: No — prohibited / ☐ Needs clarification |
| U4 | "What happens if real LINE send is turned on without approval?" | ☐ Correct: Not possible without env flag change / ☐ Needs clarification |
| U5 | "At any point can Clinic Alpha stop the pilot?" | ☐ Correct: Yes — rollback within 1 hour / ☐ Needs clarification |

> If any answer is "Needs clarification" — clarify before proceeding to decision. Do not pressure for a decision until Owner-A fully understands.

---

## Part B — Concern Review

Record any open concerns Owner-A raised during the session.

| # | Concern Raised | Status | Resolution |
|---|---|---|---|
| C1 | `<fill in during session>` | ☐ Resolved / ☐ Open | |
| C2 | `<fill in during session>` | ☐ Resolved / ☐ Open | |
| C3 | `<fill in during session>` | ☐ Resolved / ☐ Open | |

> Open concerns must be noted. Do not promise to resolve them without checking with FlowBiz-Tech first.

---

## Part C — Readiness Questions

Ask Owner-A directly:

| # | Question | Owner-A Answer |
|---|---|---|
| R1 | "Did the demo show you how the 5 workflows address your pain points?" | ☐ Yes / ☐ Partially / ☐ No |
| R2 | "Is Staff-A1 confident enough to handle the HITL queue daily?" | ☐ Yes / ☐ Needs more practice / ☐ No |
| R3 | "Are you comfortable with demo data first before any real customer data?" | ☐ Yes / ☐ Want to discuss further |
| R4 | "Is the written pilot agreement something you can sign this week?" | ☐ Yes / ☐ Need to review / ☐ Not yet |
| R5 | "Can you confirm LINE OA admin access for our staging integration?" | ☐ Yes, can do / ☐ Need to check / ☐ Not sure |

---

## Part D — Prerequisites Before Limited Pilot

These must be complete before the pilot moves to any real data or real LINE send.
Use this list to show Owner-A what is still needed.

| # | Prerequisite | Status |
|---|---|---|
| P1 | Written pilot agreement signed by Owner-A | ☐ Done / ☐ Pending |
| P2 | LINE OA admin access shared for staging integration | ☐ Done / ☐ Pending |
| P3 | Staff-A1 confident with HITL queue (training complete) | ☐ Done / ☐ Needs more practice |
| P4 | Consent form for pseudonymized data intake signed | ☐ Done / ☐ Pending |
| P5 | Day 1 weekly check-in time confirmed | ☐ Done / ☐ Pending |
| P6 | Emergency contact confirmed (who to call if something goes wrong) | ☐ Done / ☐ Pending |

> **None of these are FlowBiz obstacles** — they are Owner-A's decisions and actions. FlowBiz-Ops will provide the agreement and consent form documents.

---

## Part E — Owner Decision

> Ask Owner-A directly: "Based on what you saw today, what would you like to do next?"

**Owner-A decision (circle one):**

### Option 1 — Proceed to Limited Pilot ✓

> Owner-A is ready to run the 5 workflows with pseudonymized data on staging.
> All prerequisites will be completed within the agreed timeline.

If selected:
- [ ] Confirm pilot start target date: `<Date: TBD>`
- [ ] Confirm written agreement will be signed by: `<Date: TBD>`
- [ ] Confirm LINE OA access will be shared by: `<Date: TBD>`
- [ ] Schedule Week 1 check-in: `<Date/time: TBD>`
- [ ] Send pilot agreement document to Owner-A: `<FlowBiz-Ops to do today>`

---

### Option 2 — Demo Again First

> Owner-A wants another demo session to address specific concerns before committing.

If selected:
- [ ] Record specific concern(s) holding Owner-A back: `<Fill in>`
- [ ] Agree on what Demo 2 will cover differently: `<Fill in>`
- [ ] Schedule Demo 2 date: `<Date: TBD>`
- [ ] Confirm remaining blocking questions: `<Fill in>`

---

### Option 3 — Delay (Not Ready Now)

> Owner-A is interested but not in a position to commit right now.

If selected:
- [ ] Record reason for delay: `<Fill in>`
- [ ] Agree on a follow-up date: `<Date: TBD>`
- [ ] Confirm what would need to change for Owner-A to be ready: `<Fill in>`
- [ ] Set a "check in again" reminder: `<Date: TBD>`

---

### Option 4 — Not a Fit

> Owner-A has decided FlowBiz is not the right tool for Clinic Alpha at this time.

If selected:
- [ ] Record reason: `<Fill in>`
- [ ] Thank Owner-A for their time
- [ ] Confirm no data will be retained: all demo data deleted from staging within 7 days
- [ ] Close pilot file with status: `CLOSED — NOT_A_FIT`
- [ ] Update [FIRST_PILOT_DISCOVERY_REPORT.md](FIRST_PILOT_DISCOVERY_REPORT.md) with outcome

---

## Decision Summary (to be filled in after session)

| Field | Value |
|---|---|
| Owner decision | `<Option 1 / 2 / 3 / 4 — fill in>` |
| Verbal commitment | `<Yes / Conditional / No>` |
| Main remaining blocker | `<Fill in or N/A>` |
| Next action | `<Fill in>` |
| Target date for next action | `<Fill in>` |
| Facilitator notes | `<Any important observations>` |

---

## What to Send Owner-A After the Session

| Item | Send when | Status |
|---|---|---|
| Post-demo feedback form link | Same day | ☐ |
| Written pilot agreement PDF | If Option 1 selected | ☐ |
| Pseudonymized data consent form | If Option 1 selected | ☐ |
| Demo 2 invite | If Option 2 selected | ☐ |
| Follow-up reminder | If Option 3 selected | ☐ |
| Data deletion confirmation | If Option 4 selected | ☐ |

---

## References

- [CLINIC_ALPHA_DAY_0_AGENDA.md](CLINIC_ALPHA_DAY_0_AGENDA.md)
- [CLINIC_ALPHA_POST_DEMO_FEEDBACK_FORM.md](CLINIC_ALPHA_POST_DEMO_FEEDBACK_FORM.md)
- [PILOT_EXIT_AND_CONVERSION_CRITERIA.md](PILOT_EXIT_AND_CONVERSION_CRITERIA.md)
- [PILOT_AGREEMENT_TERMS_DRAFT.md](../PILOT_AGREEMENT_TERMS_DRAFT.md)
- [PILOT_DATA_INTAKE_CHECKLIST.md](PILOT_DATA_INTAKE_CHECKLIST.md)
- [FIRST_PILOT_DISCOVERY_REPORT.md](FIRST_PILOT_DISCOVERY_REPORT.md)
