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
