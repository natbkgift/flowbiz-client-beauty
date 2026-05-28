# Clinic Alpha - Day 1 Operational Health Exception (PR-21)

Document type: Sanitized operational health exception
Pilot clinic: Clinic Alpha (pseudonym only)
Date: 2026-05-28
Canonical staging URL: https://beauty.flowbiz.cloud

---

## 1) Exception Reason

PR-20 identified degraded operational health because automation failures were counted within the last-24-hour health window.

PR-21 recheck confirms:
1. /ops/health endpoint returned HTTP 200.
2. systemStatus remains degraded.
3. automation failures in the last 24 hours = 2.
4. worker failed jobs = 0.
5. recent visible failure rows = 0.
6. core readiness, smoke, login, HITL, and audit checks passed.

---

## 2) Risk Assessment

This exception is accepted as non-blocking for Day 1 start approval recheck because:
1. core live/readiness endpoints pass
2. the staging database target is correct
3. smoke staging passes
4. HITL queue is visible
5. audit log is visible
6. no new outbound action appears in the PR-21 audit window
7. no broad import indicator appears in the PR-21 audit window

This exception must be rechecked in the Day 1 start log.

---

## 3) Acceptance

Sanitized acceptance:
1. Owner-A: accepts Day 1 readiness recheck with this documented exception.
2. FlowBiz-Tech: accepts technical exception for PR-21 start approval readiness.
3. FlowBiz-Ops: accepts operating watch item and will review health again before start log.

No real owner, staff, contact, or credential values are recorded.

---

## 4) Stop Condition

Escalate to NO_GO if:
1. /api/live or /api/ready fails
2. database target changes away from flowbiz_beauty_staging
3. worker failed jobs become non-zero
4. recent failure rows appear before start log
5. HITL or audit visibility fails
6. any outbound action appears before start log approval
7. any broad import indicator appears before start log approval

---

## 5) Exception Status

Operational health exception status:
- ACCEPTED_NON_BLOCKING_EXCEPTION
