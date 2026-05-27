# Clinic Alpha — Day 0 Q&A and Feedback Log

Document type: POST-PHASE 10 PR-15 Q&A and feedback capture
Pilot clinic: Clinic Alpha (pseudonym only)
Session date: 2026-05-28
Facilitator: FlowBiz-Ops
Participants: Owner-A, Staff-A1

---

## 1) Q&A Capture

| ID | Asked by | Question (pseudonym only) | Answer provided | Status |
|---|---|---|---|---|
| Q1 | Owner-A | If staff approves a wrong message, can we trace who approved it? | Yes. Every HITL action is logged in audit with actor and timestamp. | Resolved |
| Q2 | Owner-A | Can this run safely without sending any real LINE message during demo period? | Yes. `LINE_REAL_SEND_ENABLED=false`; demo path is non-live outbound. | Resolved |
| Q3 | Owner-A | Do we have to import real customer data to test this? | No. Day 0 uses demo seed/fake data only. | Resolved |
| Q4 | Owner-A | Can we customize message tone before sending? | Yes. Staff can modify draft text before approving. | Resolved |
| Q5 | Staff-A1 | What should I do when draft tone does not match clinic style? | Use modify-and-approve or reject path; do not approve blindly. | Resolved |
| Q6 | Staff-A1 | Is there a daily routine for queue checking? | Yes. Suggested cadence: morning, midday, end-of-day. | Resolved |
| Q7 | Owner-A | Are there any hard restrictions on medical claims? | Yes. No medical outcome guarantees; staff must reject unsafe phrasing. | Resolved |
| Q8 | Owner-A | What is needed before we start limited pilot? | Signed agreement + LINE OA access + consent readiness. | Open follow-up |

---

## 2) Staff-A1 Feedback (Facilitator Summary)

Source: verbal feedback during session + training script checklist

| Area | Summary |
|---|---|
| Usability | Queue and lead navigation are clear after walkthrough |
| HITL clarity | Approve/modify/reject model understood |
| Confidence level | Medium-to-high; can operate with light coaching |
| Most useful workflow (stated) | Uncontacted Lead Alert and No-Show Recovery |
| Main concern | Wording consistency in Thai tone for different customer types |
| Suggested improvement | Keep a short "approved wording examples" playbook |

Staff-A1 sentiment: Positive, ready with minor follow-up coaching.

---

## 3) Owner-A Feedback (Facilitator Summary)

Source: verbal feedback during session + owner decision discussion

| Area | Summary |
|---|---|
| Perceived value | Positive; workflow automation aligns with current pain points |
| Trust in AI + HITL | Positive; owner values mandatory staff approval gate |
| Readiness to proceed | Conditional proceed |
| Main concern | Wants agreement terms and responsibilities clear before start |
| Open question | Timeline and checklist to move from demo mode to limited pilot |

Owner-A sentiment: Positive, conditionally ready.

---

## 4) Per-Workflow Feedback (Session Note)

| Workflow | Owner-A reaction | Staff-A1 reaction | Fit assessment |
|---|---|---|---|
| New Lead Welcome | Positive | Positive | Strong fit |
| Uncontacted Lead Alert | Positive | Very positive | Strong fit |
| No-Show Recovery | Positive | Very positive | Strong fit |
| Review Request | Positive | Neutral-positive | Medium fit |
| Botox/Filler Repeat Reminder | Positive | Positive | Strong fit |

Overall workflow fit: Strong for 4/5, medium for 1/5.

---

## 5) Unresolved Questions

1. Agreement signature timeline confirmation (Owner-A).
2. LINE OA admin access handover timing confirmation (Owner-A).
3. Internal SOP for tone/style consistency before Week 1 kickoff (FlowBiz-Ops + Staff-A1).

---

## 6) Recommended Follow-Up Actions

1. Send agreement package and obtain signature date commitment.
2. Confirm LINE OA admin access readiness checkpoint.
3. Schedule 15-20 minute follow-up session focused on:
- style/tone examples
- Week 1 operating cadence
- escalation process confirmation
4. Collect formal post-demo feedback form responses in 3 days.

---

## 7) Session-Level Outcome Link

Primary outcome status from Day 0:
- DEMO_FOLLOW_UP_NEEDED

Rationale:
- Positive technical and operational signal.
- Remaining blockers are agreement/access prerequisites, not product safety/runtime issues.

---

## 8) Safety Confirmation

- Pseudonym-only entries: yes
- No real clinic identifiers: yes
- No real contacts: yes
- No secrets: yes
- No ROI guarantee claim: yes
- No medical outcome claim: yes
