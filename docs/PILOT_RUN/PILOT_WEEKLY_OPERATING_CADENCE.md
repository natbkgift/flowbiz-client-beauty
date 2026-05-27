# Pilot Weekly Operating Cadence — FlowBiz Beauty

Date: 2026-05-28
Version: 1.0

---

## Purpose

This document defines the daily and weekly operating rhythm for the pilot operator to run a consistent, safe, and measurable pilot.

---

## Daily Operator Routine (5–10 min)

Each operating day, the FlowBiz pilot operator should:

### Morning Check (before 10:00 local time)

- [ ] Confirm staging health: `GET /api/ready` → `{"status":"ok"}`
- [ ] Check audit log for any unexpected events since last check
- [ ] Check HITL queue: any items pending > 24h?
  - If yes: notify designated approver and log the delay
- [ ] Confirm LINE mode and AI mode match approved setting
- [ ] Review any new issues or staff messages

### Midday / On-Demand

- [ ] Respond to clinic staff questions within agreed response time
- [ ] Follow up on any outstanding HITL items
- [ ] Note any edge cases, unusual lead types, or message quality concerns

### End-of-Day Notes (optional)

- [ ] Log any notable events: unusual HITL decisions, staff feedback, technical issues
- [ ] If any error or unexpected real-send event: escalate immediately per rollback plan

---

## Weekly Check-In Agenda (30–45 min, every 7 days)

### Pre-Check-In Prep (day before)

- [ ] Pull weekly metrics from audit log / dashboard
- [ ] Summarize HITL stats: created / approved / rejected / modified / pending > 24h
- [ ] Note any workflow tuning opportunities
- [ ] Prepare questions for clinic owner/staff
- [ ] Update risk register if needed

### Check-In Agenda

**1. Review — What happened this week (10 min)**

- New leads entered
- Uncontacted leads at week end
- HITL queue stats
- No-show recovery attempts
- Review requests sent
- Botox/Filler reminders sent
- Any messages sent (real or simulated)
- Any issues or complaints

**2. Staff Experience (10 min)**

- Is the HITL queue easy to use?
- Did any AI suggestions feel wrong or inappropriate?
- Any messages that staff rejected? Why?
- Any workflows that aren't triggering as expected?
- What was most valuable this week?
- What was most frustrating?

**3. Quality Review (5 min)**

- Spot-check 3–5 HITL decisions from this week
- Were any approved messages borderline in quality?
- Were any medical-adjacent phrases in AI suggestions?
- Did staff modify AI text — are patterns emerging?

**4. Risk Review (5 min)**

- Any open risks from risk register?
- Any new risks identified this week?
- Any tenant isolation concerns?
- Any consent or data handling concerns?
- Any real-send errors or unexpected behaviors?

**5. Workflow Tuning (5 min)**

- Which workflows are generating the most useful suggestions?
- Should any workflow be paused for quality concerns?
- Should timing/trigger settings be adjusted?
- Are there workflows not yet enabled that staff are ready for?

**6. Next Week Action List (5 min)**

| Action | Owner | Due |
|---|---|---|
| `<ACTION_1>` | `<OWNER>` | `<DATE>` |
| `<ACTION_2>` | `<OWNER>` | `<DATE>` |

---

## Weekly Metrics Template

Record each week. Compare to baseline.

| Metric | Baseline | Week 1 | Week 2 | Week 3 | Week 4 |
|---|---|---|---|---|---|
| New leads this week | `<N>` | | | | |
| Uncontacted leads at week end | `<N>` | | | | |
| HITL items created | 0 | | | | |
| HITL approved | 0 | | | | |
| HITL rejected | 0 | | | | |
| HITL modified | 0 | | | | |
| HITL pending > 24h | 0 | | | | |
| No-show follow-ups attempted | `<N>` | | | | |
| No-show recoveries (re-booked) | `<N>` | | | | |
| Review requests sent | `<N>` | | | | |
| Repeat reminders sent | `<N>` | | | | |
| Staff time on manual follow-up (est) | `<H>` | | | | |
| Real LINE messages sent | 0 | | | | |
| Issues logged | 0 | | | | |

> All values during demo/simulated mode: real-send count remains 0 unless real LINE is approved.

---

## HITL Quality Review

Each week, review a sample of HITL decisions:

| Item | AI Text Quality | Staff Decision | Reason for Modification/Rejection | Action |
|---|---|---|---|---|
| `<Item 1>` | `Good / Borderline / Poor` | `Approved / Modified / Rejected` | `<reason>` | `<tuning or no action>` |
| `<Item 2>` | | | | |
| `<Item 3>` | | | | |

Patterns:
- Frequently rejected topics: `<list>`
- Frequently modified phrases: `<list>`
- Staff comfort level: `<High / Medium / Low>`

---

## Staff Feedback Log

| Date | Staff Member | Feedback | Action Taken |
|---|---|---|---|
| `<DATE>` | `<NAME>` | `<FEEDBACK>` | `<ACTION>` |

---

## Issue Tracking

| # | Date | Issue | Severity | Status | Resolution |
|---|---|---|---|---|---|
| 1 | `<DATE>` | `<ISSUE>` | `High / Medium / Low` | `Open / Resolved` | `<RESOLUTION>` |

Severity guide:
- **High**: Potential data exposure, incorrect real send, HITL bypass, staging outage
- **Medium**: Workflow not triggering, slow HITL queue, incorrect AI text pattern
- **Low**: UI confusion, minor metric discrepancy

---

## Pilot Week Status Summary

Update at end of each week:

| Week | Status | Key Finding | Action |
|---|---|---|---|
| Week 1 | `<In Progress / Complete>` | | |
| Week 2 | | | |
| Week 3 | | | |
| Week 4 | | | |

---

## References

- [PILOT_BASELINE_METRICS.md](PILOT_BASELINE_METRICS.md)
- [PILOT_EXIT_AND_CONVERSION_CRITERIA.md](PILOT_EXIT_AND_CONVERSION_CRITERIA.md)
- [PILOT_ROLLBACK_AND_DISABLE_PLAN.md](PILOT_ROLLBACK_AND_DISABLE_PLAN.md)
- [../PILOT_WEEKLY_CHECKIN_TEMPLATE.md](../PILOT_WEEKLY_CHECKIN_TEMPLATE.md)
- [../PILOT_RISK_REGISTER.md](../PILOT_RISK_REGISTER.md)
- [../PILOT_SUCCESS_METRICS_SCORECARD.md](../PILOT_SUCCESS_METRICS_SCORECARD.md)
