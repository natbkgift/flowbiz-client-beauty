# Clinic Alpha - Real Operation Volume Limits (PR-25)

Document type: PR-25 volume and pacing policy
Pilot clinic: Clinic Alpha (pseudonym only)
Date: 2026-05-28

---

## 1) Daily Limits

| Limit | Value | Enforcement |
|---|---:|---|
| real interactions per day | <= 10 | operator count sheet + audit window check |
| concurrent operator sessions | <= 2 | operator allowlist only |
| workflow count in operation | 1 | Review Request only |
| clinic count | 1 | Clinic Alpha only |

---

## 2) Day 2 Planned Allocation

Planned volume for Day 2:
1. target total interactions: 8
2. approval target: 5
3. rejection target: 3
4. modify-before-approve target: 2 (subset of approvals)

Capacity reserve:
1. reserved buffer before hard cap: 2 interactions

---

## 3) Limit Enforcement Notes

1. If interaction count reaches 10, stop additional operation for the day.
2. If approved-contact criterion fails, force reject and mark as compliance reject.
3. If queue grows faster than operator capacity, defer to next day without raising cap.
