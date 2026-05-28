# Clinic Alpha - HITL Queue Analysis (PR-24)

Document type: POST-PHASE 10 PR-24 queue discipline and friction analysis
Pilot clinic: Clinic Alpha (pseudonym only)
Date: 2026-05-28
Cadence window: 2026-05-28T09:50:00+07:00 to 2026-05-28T11:20:00+07:00

---

## 1) Queue Discipline Snapshot

| Metric | Value | Status |
|---|---:|---|
| Opening visible queue | 8 | PASS |
| New items entered in window | 4 | PASS |
| Total handled in window | 12 | PASS |
| End-of-window pending queue | 0 | PASS |
| Queue starvation observed | 0 | PASS |
| Queue reorder anomalies | 0 | PASS |

Discipline result:
- Queue was processed in stable batches without stuck items.

---

## 2) Latency Bands

| Latency Band | Count | Percentage |
|---|---:|---:|
| <= 6m | 3 | 25.0% |
| > 6m and <= 9m | 5 | 41.7% |
| > 9m and <= 12m | 3 | 25.0% |
| > 12m | 1 | 8.3% |

Queue latency interpretation:
1. Most items were cleared within 9 minutes.
2. One item exceeded 12 minutes during operator handoff minute.
3. No item breached operational stop-condition threshold.

---

## 3) Queue Friction

| Friction ID | Description | Severity | Frequency | Mitigation |
|---|---|---|---:|---|
| QF-01 | Brief delay during Staff-A1 to Staff-A2 handoff | Low | 1 | Keep explicit handoff marker before break window |
| QF-02 | Queue filter reset after decision submit | Low | 2 | Pin filter preset in operator checklist |

Queue friction status:
- MINOR

---

## 4) Safety Correlation

Safety counters in cadence window:
1. outbound actions: 0
2. real-send indicators: 0
3. broad import indicators: 0
4. HITL bypass indicators: 0
5. broadcast indicators: 0

Correlation result:
- Queue throughput improved without weakening guardrails.
