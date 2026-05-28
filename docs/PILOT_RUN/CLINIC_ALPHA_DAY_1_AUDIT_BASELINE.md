# Clinic Alpha - Day 1 Audit Baseline (PR-22)

Document type: Opening-day audit baseline
Pilot clinic: Clinic Alpha (pseudonym only)
Date: 2026-05-28
Baseline timestamp: 2026-05-28T08:53:41+07:00

---

## 1) Audit Baseline Scope

This baseline records the sanitized opening audit state for Day 1 limited pilot operations.

The baseline does not include raw event payloads, personal identifiers, credential values, or customer contact data.

---

## 2) Audit Visibility Evidence

| Check | Evidence | Result |
|---|---|---|
| Audit endpoint visible | HTTP 200 | PASS |
| Recent audit records visible | 10 recent records visible | PASS |
| Baseline scanned records | 138 records scanned | PASS |
| HITL queue visible | 8 visible records | PASS |

---

## 3) Start Window Evidence

Audit window:
- from 2026-05-28T08:53:41+07:00

Opening scan result:
1. records since start window: 1
2. outbound actions since start window: 0
3. real-send indicators since start window: 0
4. broad import indicators since start window: 0

---

## 4) No-Send and No-Import Evidence

PR-22 start checks performed read-only verification only.

No action performed:
1. no outbound send
2. no broadcast
3. no broad data import
4. no medical record import
5. no full chat history import
6. no provider mode enablement

---

## 5) Audit Baseline Decision

Audit baseline status:
- BASELINE_ESTABLISHED

---

## 6) PR-23 Monitoring Baseline Update

Monitoring snapshot timestamp:
- 2026-05-28T09:36:23+07:00

Updated audit evidence:
1. recent audit records visible: 10
2. baseline scanned records: 139
3. records since Day 1 start window: 2
4. records since monitoring snapshot window: 1
5. outbound actions since Day 1 start: 0
6. real-send indicators since Day 1 start: 0
7. broad import indicators since Day 1 start: 0
8. HITL bypass indicators since Day 1 start: 0
9. broadcast indicators since Day 1 start: 0

Updated audit baseline status:
- CONTINUITY_CONFIRMED
