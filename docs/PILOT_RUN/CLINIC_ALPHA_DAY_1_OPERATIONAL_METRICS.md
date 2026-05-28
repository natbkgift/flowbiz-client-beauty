# Clinic Alpha - Day 1 Operational Metrics (PR-23)

Document type: Sanitized Day 1 operational metrics
Pilot clinic: Clinic Alpha (pseudonym only)
Date: 2026-05-28
Monitoring snapshot timestamp: 2026-05-28T09:36:23+07:00

---

## 1) Metric Summary

| Metric | Value | Notes |
|---|---:|---|
| HITL queue volume | 8 | visible queue records |
| HITL pending approval | 8 | all visible queue records pending |
| HITL approved | 0 | not observed in API snapshot |
| HITL rejected | 0 | not observed in API snapshot |
| HITL modified before approve | 0 | not observed in API snapshot |
| operator review latency | Not measured | API snapshot lacks sufficient latency evidence |
| audit recent visible records | 10 | recent audit records visible |
| audit baseline scanned records | 139 | sanitized count only |
| records since Day 1 start | 2 | sanitized count only |
| outbound actions since Day 1 start | 0 | safety scan |
| real-send indicators since Day 1 start | 0 | safety scan |
| broad import indicators since Day 1 start | 0 | safety scan |
| HITL bypass indicators since Day 1 start | 0 | safety scan |
| broadcast indicators since Day 1 start | 0 | safety scan |
| support escalations | 0 | no support incident observed |
| unresolved incidents | 0 | no open support incident observed |
| excluded workflow violations | 0 | excluded paths remain controlled |
| safety events | 0 | no unsafe event observed |

---

## 2) Workflow Noise and Friction

| Signal | Status | Note |
|---|---|---|
| selected workflow representation | PASS | selected paths present or mapped |
| excluded workflow visibility | WATCH | excluded demo paths remain present |
| false-positive signal count | 0 | no false-positive workflow signal recorded in PR-23 |
| low-value signal count | 0 | no low-value workflow signal recorded in PR-23 |
| workflow friction | WATCH | staff review activity not yet evidenced |

---

## 3) Metrics Decision

Metrics status:
- GO_WITH_IMPROVEMENTS
