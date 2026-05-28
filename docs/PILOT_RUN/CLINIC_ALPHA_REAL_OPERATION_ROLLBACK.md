# Clinic Alpha - Real Operation Rollback (PR-29)

Document type: rollback readiness and execution evidence
Pilot clinic: Clinic Alpha (pseudonym only)
Date: 2026-05-28

---

## 1) Rollback Capability Verification

Verified available:
1. runtime env switch path on staging host
2. service restart commands for API and Web
3. safe-mode restore path for line and ai runtime modes
4. workflow pause capability path documented in pilot rollback runbook

---

## 2) Rollback Executed In This PR

Rollback target achieved:
1. real send off
2. ai real generation off
3. services restarted
4. readiness and smoke verification returned healthy state

Post-rollback mode snapshot:
1. line integration mode: simulated
2. line real send switch: false
3. ai provider: mock
4. ai real generation switch: false

---

## 3) Immediate Rollback Conditions Reconfirmed

Immediate rollback triggers remain active for:
1. wrong recipient detection
2. hitl bypass detection
3. unsafe medical wording detection
4. runaway workflow detection
5. duplicate outbound send detection
6. unexpected bulk behavior detection
7. audit visibility loss
8. operator visibility loss
