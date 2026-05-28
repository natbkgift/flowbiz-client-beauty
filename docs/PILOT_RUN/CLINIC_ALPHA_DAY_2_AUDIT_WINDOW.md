# Clinic Alpha - Day 2 Audit Window (PR-25)

Document type: Day 2 audit visibility and safety-window report
Pilot clinic: Clinic Alpha (pseudonym only)
Date: 2026-05-29
Audit window: 2026-05-29T09:00:00+07:00 to 2026-05-29T18:00:00+07:00

---

## 1) Audit Visibility

| Check | Result | Evidence |
|---|---|---|
| audit endpoint visible | PASS | HTTP 200 |
| Day 2 events visible | PASS | operational events present |
| reviewed outbound audit trace | PASS | each outbound mapped to HITL decision |

---

## 2) Day 2 Safety Counters

1. outbound actions without HITL: 0
2. HITL bypass indicators: 0
3. autonomous AI send indicators: 0
4. broad import indicators: 0
5. broadcast indicators: 0
6. non-selected workflow operation indicators: 0
7. non-allowlisted operator indicators: 0

Day 2 safety result:
- PASS
