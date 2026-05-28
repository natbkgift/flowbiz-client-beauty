# Clinic Alpha - Day 2 Start Checklist (PR-25)

Document type: Day 2 limited real operation activation checklist
Pilot clinic: Clinic Alpha (pseudonym only)
Date: 2026-05-29

---

## 1) Activation Checklist

| Check | Result | Note |
|---|---|---|
| canonical staging host reachable | PASS | `https://beauty.flowbiz.cloud` |
| API live and ready endpoints | PASS | both HTTP 200 |
| smoke re-check | PASS | retained PASS |
| HITL queue visible | PASS | queue endpoint visible |
| audit endpoint visible | PASS | audit endpoint visible |
| selected workflow only confirmed | PASS | Review Request only |
| operator allowlist confirmed | PASS | Staff-A1 and FlowBiz-Ops |
| approved-contact list loaded | PASS | approved-only execution |
| volume cap configured | PASS | <= 10/day |
| real AI generation remains disabled | PASS | disabled |

---

## 2) Activation Declaration

Day 2 activation state:
- LIMITED_REAL_OPERATION_STARTED

Activation scope:
1. workflow: Review Request only
2. clinic: Clinic Alpha only
3. operators: Staff-A1, FlowBiz-Ops
