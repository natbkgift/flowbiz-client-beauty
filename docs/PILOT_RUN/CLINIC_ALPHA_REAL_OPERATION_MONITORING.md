# Clinic Alpha - Real Operation Monitoring (PR-29)

Document type: operational verification and monitoring record
Pilot clinic: Clinic Alpha (pseudonym only)
Date: 2026-05-28

---

## 1) Verification Checklist

| Check | Result |
|---|---|
| git status / branch / recent log verified | PASS |
| canonical URL verification | PASS |
| appEnv=staging verification | PASS |
| DB=flowbiz_beauty_staging verification | PASS |
| host build and validate commands | PASS |
| service restart completed | PASS |
| readiness verification after rollback | PASS |
| smoke:staging after rollback | PASS |
| npm test (workspace) | PASS |

---

## 2) Incident and Recovery

Incident observed:
1. after controlled real toggle attempt, public endpoint returned 502

Recovery action:
1. rollback to simulated line mode and mock AI mode
2. restart API and Web services
3. verify public and local endpoints returned 200

Current operational posture:
1. safe mode restored
2. HITL path preserved
3. audit visibility preserved
