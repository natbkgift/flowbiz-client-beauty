# Clinic Alpha - Limited Pilot Day 1 Checklist (PR-19)

Document type: Day 1 prep checklist
Pilot clinic: Clinic Alpha (pseudonym only)
Date: 2026-05-28
Decision baseline: READY_FOR_LIMITED_PILOT_PREP

---

## 1) Go/No-Go Rule

Day 1 prep may proceed only if every required check is PASS.

Day 1 prep does not mean active pilot operations have started.

---

## 2) Checklist

| Check ID | Check | Owner | Required Result | Status |
|---|---|---|---|---|
| D1-01 | Staging health check | FlowBiz-Tech | healthy | PLANNED |
| D1-02 | Safe LINE mode | FlowBiz-Tech | simulated, real send disabled | PLANNED |
| D1-03 | Safe AI mode | FlowBiz-Tech | mock, real generation disabled | PLANNED |
| D1-04 | Staff-A1 login | FlowBiz-Ops | can access assigned workspace | PLANNED |
| D1-05 | Staff-A2 audit view | FlowBiz-Ops | read-only audit visibility | PLANNED |
| D1-06 | Demo or approved sample data visible | FlowBiz-Ops | within data cap | PLANNED |
| D1-07 | HITL queue visible | Staff-A1 + FlowBiz-Ops | queue can be reviewed | PLANNED |
| D1-08 | Audit trail visible | Staff-A2 + FlowBiz-Ops | recent events visible | PLANNED |
| D1-09 | Selected workflows checked | FlowBiz-Ops | four workflows only | PLANNED |
| D1-10 | Support roles confirmed | FlowBiz-Ops | Owner-A, Staff-A1, Staff-A2, FlowBiz-Tech | PLANNED |
| D1-11 | Stop conditions reviewed | FlowBiz-Ops | acknowledged by operating roles | PLANNED |
| D1-12 | Go/no-go decision recorded | FlowBiz-Ops | READY or NO-GO | PLANNED |

---

## 3) Pre-Use Verification

Before first operational use:
1. Confirm no stop condition is active.
2. Confirm data mode and cap.
3. Confirm safe operating flags.
4. Confirm HITL queue works.
5. Confirm audit events are visible.
6. Confirm support escalation path.

---

## 4) No-Go Before First Operational Use

Set Day 1 to NO-GO if:
1. staging health is not healthy
2. safe mode cannot be verified
3. staff cannot access required views
4. HITL queue is unavailable
5. audit view is unavailable
6. data scope is unclear
7. owner withdraws approval

---

## 5) Decision

Current Day 1 prep checklist status:
- READY_FOR_DAY_1_PREP
