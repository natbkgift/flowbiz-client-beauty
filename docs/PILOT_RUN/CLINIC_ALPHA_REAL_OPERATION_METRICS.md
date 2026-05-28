# Clinic Alpha - Real Operation Metrics (PR-25)

Document type: Day 2 real business signal metrics
Pilot clinic: Clinic Alpha (pseudonym only)
Date: 2026-05-29
Workflow scope: Review Request only

---

## 1) Required Metrics Capture

| Metric | Value | Notes |
|---|---|---|
| review completion rate | 100% (8/8) | all queued Day 2 items reviewed |
| operator latency | avg 07m 58s | from queue entry to decision |
| approve vs reject ratio | 5:3 | includes modify-before-approve as approve path |
| staff confusion frequency | 2 events | low severity, resolved in-session |
| owner satisfaction notes | positive trend | concise and controllable workflow feedback |
| workflow usefulness | high | owner and staff both marked useful |
| repeat usage intent | yes | requested continued daily usage |
| interruption frequency | 1 event | one short interruption during handoff |
| customer response rate | 60% (3/5) | responses on approved outbound interactions |
| willingness-to-pay signal | positive | owner requested 7-day value measurement window |

---

## 2) Decision Mapping

Decision-rule fit for Day 2 signal:
1. recurring real usage observed -> READY_FOR_7_DAY_VALUE_MEASUREMENT

Applied PR-25 decision:
- READY_FOR_7_DAY_VALUE_MEASUREMENT

---

## 3) PR-26 Seven-Day Measurement Update

Seven-day aggregation (Day 1 to Day 7):
1. total queue volume observed: 58
2. total real interactions (Day 2 to Day 7): 50
3. cap compliance (<=10/day): 7/7 days
4. approve/reject/modify totals: 29/13/10
5. average review latency (Day 2 to Day 7): 07m 51s
6. average customer response rate (Day 2 to Day 7): 64.1%
7. total interruptions: 6
8. total confusion events: 7
9. total audit anomalies: 0
10. total support escalations: 1 (low severity)

PR-26 outcome:
- READY_FOR_PAID_PILOT_DISCUSSION

---

## 4) PR-27 Commercial Metrics Update

Commercial business metrics:
1. estimated monthly value: THB 14,300
2. estimated support hours: 3.5 hours/month
3. estimated infra cost: THB 900/month
4. estimated operator overhead: 4.0 hours/month
5. projected gross margin: 55.7%
6. retention likelihood: 78%
7. expansion likelihood: 35%

PR-27 commercial decision:
- READY_FOR_PAID_PILOT

---

## 5) PR-28 Week 1 Paid Pilot Metrics Update

Week 1 business-critical metrics:
1. HITL review volume: 24
2. operator minutes/day: avg 61.7
3. workflow usage frequency: 24 actions/week
4. review request completion rate: 100%
5. support escalation count: 1
6. owner satisfaction signals: positive
7. workflow ignored/unused rate: 0%
8. retention/payment confidence signal: positive

PR-28 week 1 status:
- READY_FOR_ACTIVE_PAID_PILOT
