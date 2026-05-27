# Post-Phase 10 PR 8 Controlled Real Integration Test Window Report

Date: 2026-05-27
Scope: Post-Phase 10 PR 8C - controlled real Gemini and LINE provider activation on staging only
Release under test: `7463c68`
Staging URL: `https://beauty.flowbiz.cloud/`
API base URL: `https://beauty.flowbiz.cloud/api`
SSH target: `flowbiz-vps`
Operator: GitHub Copilot in supervised staging session
QA window: `2026-05-27T19:33:01+07:00` to `2026-05-27T22:48:29+07:00`

## Status

PASS

Controlled real-provider QA executed on staging, captured sanitized evidence, and rolled back to safe defaults successfully.

Final rollout recommendation remains **NO-GO** until the product messaging route is rewired from `apps/api/src/modules/messaging/provider.js` simulated delivery to the real LINE integration service path.

## Execution summary

- gate opened with recorded human owner confirmation and explicit QA window timing
- preflight passed: disk `104G` free, `/api/live` `200`, `/api/ready` `200`, staging DB `flowbiz_beauty_staging`, services running as non-root `flowbiz`
- `npm run smoke:staging` passed before activation, after Gemini activation, after Gemini rollback, after LINE activation, and after final rollback
- targeted safety suite passed before provider activation: `30` pass / `0` fail
- provider state transitions completed:

```text
Before window:
LINE_INTEGRATION_MODE=simulated
LINE_REAL_SEND_ENABLED=false
AI_PROVIDER=mock
AI_REAL_GENERATION_ENABLED=false

Phase A active:
AI_PROVIDER=gemini
AI_REAL_GENERATION_ENABLED=true

Phase B rollback:
AI_PROVIDER=mock
AI_REAL_GENERATION_ENABLED=false
GEMINI_API_KEY=

Phase C active:
LINE_INTEGRATION_MODE=real
LINE_REAL_SEND_ENABLED=true

Phase D rollback:
LINE_INTEGRATION_MODE=simulated
LINE_REAL_SEND_ENABLED=false
LINE_CHANNEL_ACCESS_TOKEN=
LINE_CHANNEL_SECRET=
AI_PROVIDER=mock
AI_REAL_GENERATION_ENABLED=false
GEMINI_API_KEY=
```

## Gemini result

Overall result: PASS

Executed evidence:

- fail-closed precheck: PASS via targeted suite (`AI_REAL_GENERATION_DISABLED`, missing-key block)
- safe prompt / HITL pending: PASS
  - lead `185`
  - message id `121`
  - provider `gemini`
  - model `gemini-2.5-flash`
  - text hash `fbc92a253f268d435c7c7cb17a936c7970ca7bc0a7d3ad8dc453c5a4dabde90f`
  - audit id `1307`
- medical-risk prompt: PASS
  - lead `186`
  - message id `126`
  - output remained `pending_approval`
  - audit id `1336` recorded `preSeverity=high`, `preCategories=pregnancy`, `postSeverity=low`
- prohibited claim block / safe rewrite: PASS
  - message id `123`
  - text hash `6e8d0f17ccf605f015ce695d199a22fdc5333f76655a560b8d08452d4dbe4260`
  - forbidden phrase count in generated text: `0`
  - audit id `1313`
- rejected message blocked: PASS
  - message id `124`
  - outbound attempt blocked with `AI_MESSAGE_REJECTED`
  - audit id `1317`
- approved message queues only: PASS
  - message id `125`
  - approval status `approved`
  - outbound id `26`
  - outbound status `pending`
  - queue audit id `1325`
- timeout / provider failure handling: PASS via staging-host harness
  - timeout result: `AbortError`
  - provider failure result: `AI_PROVIDER_GENERATION_FAILED`
  - blocked audit ids `1338`, `1337`
  - `rawPiiLogged=false` for both blocked rows

Sanitized audit metadata check: PASS

- provider generation audit ids `1307`, `1310`, `1313`, `1316`, `1320` all recorded:
  - `provider=gemini`
  - `model=gemini-2.5-flash`
  - `rawPiiLogged=false`
  - `inputHash` / `outputHash` present
  - no raw recipient, raw prompt, or raw output stored in shared evidence

Gemini outbound safety: PASS

- no real external outbound send occurred during Gemini QA
- approved queue behavior remained internal and scheduled-only

## LINE result

Overall result: PASS for direct integration service validation

Executed evidence:

- missing token fail-closed: PASS
  - result code `LINE_ACCESS_TOKEN_REQUIRED`
  - audit id `1349`
- disabled switch fail-closed: PASS
  - result code `LINE_REAL_SEND_DISABLED`
  - audit id `1348`
- webhook signature validation: PASS
  - missing signature -> `line_signature_missing`
  - invalid signature -> `line_signature_invalid`
  - valid signature -> `line_signature_verified`
- dry-run in real mode: PASS
  - integration status `dry_run_real`
  - audit id `1351`
- pending AI send blocked: PASS
  - result code `HITL_APPROVAL_REQUIRED`
  - audit id `1350`
- rejected AI message blocked: PASS
  - message id `124`
  - result code `AI_MESSAGE_REJECTED`
- approved AI message queues only: PASS
  - lead `188`
  - message id `128`
  - outbound id `28`
  - outbound status `pending`
  - outbound count `0 -> 1`
- single real live send: PASS
  - lead `189`
  - exactly one direct real send executed through `apps/api/src/modules/integrations/line/service.js`
  - provider request id `05c4052c-7045-4d3d-a317-5634671fa03c`
  - sent at `2026-05-27T15:45:38.004Z`
  - line audit id `1380`
  - audit stored `recipientHash` and `messageHash`, not raw values

Important wiring finding:

- the product messaging route behind `POST /leads/:leadId/messages` still calls `apps/api/src/modules/messaging/provider.js`
- that provider currently returns simulated `local-...-line` ids and `integrationStatus=simulated`
- controlled QA therefore used the direct LINE integration service for the single real provider send
- this is a release-blocking wiring gap for broader rollout even though the underlying LINE integration service path passed

## Rollback evidence

Gemini rollback: PASS

- env restored to `AI_PROVIDER=mock`, `AI_REAL_GENERATION_ENABLED=false`, `GEMINI_API_KEY=`
- `/api/ready` returned `200`
- `npm run smoke:staging` passed
- rollback verification lead `187` returned `provider=mock`, `model=mock`, message id `127`

LINE rollback: PASS

- env restored to `LINE_INTEGRATION_MODE=simulated`, `LINE_REAL_SEND_ENABLED=false`, `LINE_CHANNEL_ACCESS_TOKEN=`, `LINE_CHANNEL_SECRET=`
- `/api/ready` returned `200`
- `npm run smoke:staging` passed
- post-rollback real-send probe blocked with `LINE_REAL_SEND_DISABLED`

## Safety confirmation

- customer data used: no
- demo or fake data only: yes
- secrets exposed in repo, logs, or report: no
- raw PII in audit evidence: no
- HITL bypass observed: no
- real Gemini generation left enabled after rollback: no
- real LINE send left enabled after rollback: no
- total real LINE live sends attempted: `1`
- approved recipient only: yes

## Validation

Executed checks:

- `git status --short --branch`
- `ssh flowbiz-vps "df -h /"`
- `curl -i https://beauty.flowbiz.cloud/api/live`
- `curl -i https://beauty.flowbiz.cloud/api/ready`
- `npm run smoke:staging`
- targeted safety suite:

```text
node -r ./teardown-hook.js --test --test-force-exit --test-concurrency=1 \
  tests/ai_provider_integration.test.js \
  tests/hitl_approval_contract.test.js \
  tests/line_integration.test.js \
  tests/pre_phase10_safety_unit.test.js
```

Targeted suite outcome: `30` pass / `0` fail

## Residual risks

- `apps/api/src/modules/messaging/provider.js` remains simulated-only and does not call the real LINE integration service
- `POST /leads/:leadId/messages` therefore does not yet prove real provider delivery through the normal product route
- Gemini medical-risk classification currently depends on input-side pre-safety; generated safe output can reduce post-safety to `low`, which is acceptable for HITL but should remain documented for reviewers

## Final recommendation

NO-GO for broader real-provider rollout until the messaging route is rewired to the real LINE integration service and the product path is re-validated.

This PR 8C window successfully proved:

- real Gemini provider generation on staging with HITL-only handling
- LINE integration service fail-closed behavior and one controlled real live send
- immediate rollback back to safe defaults

## Next recommended PR

Provider Wiring Fixes
