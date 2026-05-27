# Post-Phase 10 PR 8 Retry Controlled Real Integration Test Window Report

## Status

BLOCKED

## Commit

Release under test: `7463c68`

## Summary

Retry timestamp: `2026-05-27T13:36:18.5062494+07:00`
Operator: GitHub Copilot
Staging URL: `https://beauty.flowbiz.cloud/`
API base URL: `https://beauty.flowbiz.cloud/api`
SSH target: `flowbiz-vps`

This retry proved that staging is stable after the disk recovery and that the current safe defaults, fail-closed behavior, HITL contract, and audit access still hold on staging.

The retry did not proceed to real Gemini generation or the single controlled LINE live send. The real-provider window remained blocked before any key load because the governance gate had not been opened for execution: the retry window did not have a human-recorded QA start or end time, rollback-owner confirmation for the live window, or an execution-time approval record for the controlled test assets.

No Gemini key, LINE token, LINE secret, production database, production secret, real customer data, real AI generation, real LINE live send, broadcast, or production deploy was used. Live LINE send count remained `0`.

Credential file contents were intentionally not re-opened during this retry before the approval record was completed. Previous sanitized evidence already showed provider credential files exist outside the repository.

## Disk/readiness precheck

- `git status --short --branch`: `## main`
- `df -h /` on staging: `104G` free on `/` with `47%` used
- `curl -i https://beauty.flowbiz.cloud/api/live`: HTTP `200`, `appEnv=staging`
- `curl -i https://beauty.flowbiz.cloud/api/ready`: HTTP `200`, database connected, `flowbiz_beauty_staging`
- `docker ps` on staging: `flowbiz-beauty-postgres-staging` healthy
- API and web services run as non-root `flowbiz`
- sanitized staging env remained at safe defaults:

```text
APP_ENV=staging
POSTGRES_DB=flowbiz_beauty_staging
LINE_INTEGRATION_MODE=simulated
LINE_CHANNEL_ACCESS_TOKEN=
LINE_CHANNEL_SECRET=
LINE_REAL_SEND_ENABLED=false
AI_PROVIDER=mock
GEMINI_API_KEY=
AI_REAL_GENERATION_ENABLED=false
```

- `npm run smoke:staging`: PASS before the targeted suite and PASS again after restart
- targeted safety suite on the staging DB: PASS, `16` passed / `0` failed
- demo seed, HITL queue, and audit access confirmed:
  - `approval_queue_count=3`
  - `audit_readable_count=5`
  - sanitized HITL sample: queue ids `1`, `2`, and `3` remained `pending_approval` with `low`, `medium`, and `high` risk labels

## Gemini result

- fail-closed: PASS. The targeted suite confirmed real-provider generation is blocked when real mode is disabled or when the key is missing.
- controlled generation: NOT RUN. No Gemini key was loaded into staging because the approved QA window record was incomplete.
- HITL: PASS. The queue remained accessible, pending AI text stayed in HITL, and outbound movement still required approval.
- medical safety: PASS. Risky and prohibited language checks passed, and high-risk medical inbound content remained pending approval.
- rollback: SAFE DEFAULTS VERIFIED. Rollback execution was not required because Gemini real mode was never enabled.

## LINE result

- fail-closed: PASS. The targeted suite confirmed simulated default mode, real-mode disabled block, missing-token block, and AI or medical-risk outbound block.
- webhook: PASS at adapter or harness level. Signature validation and inbound event normalization passed in the targeted suite.
- dry-run: PASS. Real-mode dry-run behavior recorded no provider send.
- live send: NOT RUN. The single controlled live-send step did not start because the governance gate was not opened with execution-time owner confirmation and window timing.
- rollback: SAFE DEFAULTS VERIFIED. Rollback execution was not required because LINE real mode was never enabled.

## Safety confirmation

- customer data used: no, demo or fake data only
- secrets exposed: no
- real mode left enabled: no
- HITL bypass: no
- audit evidence: yes, readable and sanitized; recent safe audit ids included `1261`, `1205`, `990`, `987`, and `986`

## Validation

Commands and checks completed during this retry:

- `git status --short --branch`
- `curl -i https://beauty.flowbiz.cloud/api/live`
- `curl -i https://beauty.flowbiz.cloud/api/ready`
- `ssh flowbiz-vps "df -h /"`
- `ssh flowbiz-vps docker ps`
- `ssh flowbiz-vps "systemctl show -p User flowbiz-beauty-api-staging.service flowbiz-beauty-web-staging.service"`
- `npm run smoke:staging` with staging URLs and safe flags
- targeted safety suite on the staging DB:

```text
node -r ./teardown-hook.js --test --test-force-exit --test-concurrency=1 \
  tests/ai_provider_integration.test.js \
  tests/hitl_approval_contract.test.js \
  tests/line_integration.test.js \
  tests/pre_phase10_safety_unit.test.js
```

Targeted suite outcome summary:

- AI mock provider default and PII-safe audit metadata: PASS
- AI disabled or missing-key fail-closed behavior: PASS
- AI medical safety checks: PASS
- HITL contract and outbound approval gates: PASS
- LINE simulated, fail-closed, dry-run, and medical-risk send blocks: PASS
- LINE webhook signature validation and inbound event parsing: PASS

Real-provider execution decision:

- Gemini key and LINE credentials were not loaded into staging env
- no real Gemini generation was attempted
- no real LINE live message was sent

## Residual risks

- The governance gate definition now exists, but the retry report remains a historical record of a window that was blocked before execution-time approval was opened.
- Any future real-provider QA still requires human-recorded window start or end time, rollback-owner confirmation, and execution-time approval of the controlled test assets.
- Real Gemini generation remains unproven on staging because no approved key-loading window was opened.
- Real LINE live delivery remains unproven on staging because the single-message live-send step was not approved to run.
- LINE webhook validation passed at adapter or harness level, but route-level real inbound E2E remains a follow-up item until full wiring is exercised in an approved window.

## Next recommended PR

Provider Wiring Fixes

---

# PR 8C Attempt — Post-Phase 10 Controlled Real Provider Activation

## Status

BLOCKED — Gate not open. No execution proceeded.

## Attempt timestamp

`2026-05-27` Asia/Bangkok time
Operator: GitHub Copilot in supervised staging session

## Gate check result

All seven required documents were read before any execution step:

- `docs/STAGING_REAL_INTEGRATION_GATE.md`
- `docs/REAL_GEMINI_QA_PLAN.md`
- `docs/REAL_LINE_QA_PLAN.md`
- `docs/REAL_GEMINI_TEST_CASES.md`
- `docs/REAL_LINE_TEST_CASES.md`
- `docs/REAL_GEMINI_ROLLBACK_CHECKLIST.md`
- `docs/REAL_LINE_ROLLBACK_CHECKLIST.md`

Gate check found the following blocking conditions:

### Block 1 — QA window start and end are unfilled

The approval record in `STAGING_REAL_INTEGRATION_GATE.md` still has:

| Field | Recorded value | Status |
| --- | --- | --- |
| QA window start | `Record at window open in Asia/Bangkok time` | required before start — not filled |
| QA window end | `Record at window close in Asia/Bangkok time` | required before start — not filled |
| Window status | `CLOSED until all required-before-start fields are recorded and owners approve` | CLOSED |

The gate document states: *"The window stays closed until every required before start item is filled by human owners."*

### Block 2 — Owner names are role titles, not named humans

The gate document states: *"They are role-level assignments for PR 8B and must map to actual human owners at execution time."*

Current approval record roles:

- QA owner: `Senior Integration QA Lead` — role, not a named human
- Rollback owner: `Staging Rollback Owner` — role, not a named human
- Safety reviewer: `SaaS Safety Operator` — role, not a named human
- HITL reviewer: `Clinic QA HITL Reviewer` — role, not a named human

### Applicable No-Go conditions

From `STAGING_REAL_INTEGRATION_GATE.md` section **No-Go Conditions**:

- `the approval record is incomplete` ✓
- `required owners or reviewers are not assigned` ✓

## Phases A–D result

| Phase | Status |
| --- | --- |
| Phase A — Gemini Controlled QA | NOT STARTED |
| Phase B — Gemini Rollback | NOT STARTED |
| Phase C — LINE Controlled QA | NOT STARTED |
| Phase D — LINE Rollback | NOT STARTED |

No Gemini key was loaded. No LINE token or secret was loaded. No env variable was changed. No real provider mode was enabled. No service was restarted.

Live LINE send count: `0` (unchanged from previous retry).

## Safety confirmation

- customer data used: no
- secrets exposed: no
- real mode left enabled: no
- HITL bypass: no
- any staging env variable changed: no

## What must happen before PR 8C can execute

1. A human owner must open `docs/STAGING_REAL_INTEGRATION_GATE.md` and fill in `QA window start` and `QA window end` with actual Asia/Bangkok timestamps at the moment the window opens.
2. Owners listed as role titles must be mapped to named individuals or the team must explicitly confirm that role-level assignment is sufficient for this team's governance.
3. All `required before start` fields in the approval record must be filled and the `Window status` row must be updated to `OPEN`.
4. The precondition checklist must be re-verified at that moment (disk, readiness, smoke, safety suite).
5. Only after those steps may Phase A begin with loading the Gemini key outside the repo.

## Residual risks

- Gate remains CLOSED. Real provider behavior on staging remains unproven.
- Real Gemini generation has not run on staging.
- The single controlled LINE live send has not been performed.
- All other residual risks from the previous retry remain unchanged.
