# Clinic Alpha - Day 1 Monitoring Log (PR-23)

Document type: POST-PHASE 10 PR-23 Day 1 monitoring evidence
Pilot clinic: Clinic Alpha (pseudonym only)
Date: 2026-05-28
Monitoring snapshot timestamp: 2026-05-28T09:36:23+07:00
Start timestamp: 2026-05-28T08:53:41+07:00
Canonical staging URL: https://beauty.flowbiz.cloud

---

## 1) Monitoring Scope

PR-23 monitors Day 1 limited pilot operation under safe-mode governance.

This log does not expand feature scope, enable production, enable real send, enable autonomous AI, export raw audit payloads, or commit customer data.

---

## 2) Health and Smoke Recheck

| Check | Evidence | Result |
|---|---|---|
| DNS canonical host resolves | 1 address record resolved | PASS |
| TCP 443 reachable | TCP check succeeded | PASS |
| GET /api/live | HTTP 200 | PASS |
| GET /api/ready | HTTP 200 | PASS |
| appEnv | staging | PASS |
| database | flowbiz_beauty_staging | PASS |
| smoke:staging | 8 checks recorded, PASS | PASS |

---

## 3) Queue and Audit Monitoring

| Check | Evidence | Result |
|---|---|---|
| demo login | HTTP 200 | PASS |
| HITL queue visible | HTTP 200, 8 visible items | PASS |
| HITL status distribution | pending_approval = 8 | WATCH |
| audit visible | HTTP 200, 10 recent records visible | PASS |
| audit baseline scanned | 139 records scanned | PASS |
| records since Day 1 start window | 2 records | PASS |
| records since monitoring snapshot window | 1 record | PASS |

---

## 4) Safety Monitoring

Audit since Day 1 start window:
1. outbound actions: 0
2. real-send indicators: 0
3. broad import indicators: 0
4. HITL bypass indicators: 0
5. broadcast indicators: 0

Audit since monitoring snapshot window:
1. outbound actions: 0
2. real-send indicators: 0
3. broad import indicators: 0
4. HITL bypass indicators: 0
5. broadcast indicators: 0

Safety monitoring result:
- PASS

---

## 5) Workflow Discipline

Allowed workflow paths remain represented:
1. New Lead Welcome.
2. Uncontacted Lead Alert.
3. No-Show Recovery.
4. Review Request.
5. Botox/Filler Repeat Reminder by mapped Botox Cycle Reminder and Filler Cycle Reminder.

Excluded demo workflow paths remain present in the demo workspace but are not used for Day 1 operations:
1. Daily Marketing Reminder.
2. Lead Qualification Nurture.

Excluded workflow violations observed:
- 0

---

## 6) Accepted Exceptions

Accepted exceptions remain controlled:
1. /ops/health still reports degraded.
2. automation failures in the last 24 hours = 2.
3. worker failed jobs = 0.
4. recent visible failure rows = 0.
5. excluded demo workflows remain excluded from operating path.

---

## 7) Monitoring Decision

Monitoring status:
- GO_WITH_IMPROVEMENTS

Rationale:
1. Governance and safety signals are stable.
2. HITL queue remains visible but no review decisions are observed in the API snapshot.
3. Operational health exception remains a watch item.
4. Operator review latency is not measurable from the available API snapshot.
