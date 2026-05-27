# PR 8D Provider Wiring Fixes Report

## Status

PASS

## Summary

PR 8D closes the product-path wiring gap that remained after PR 8C.

`POST /leads/:leadId/messages` still enters through `apps/api/src/server.js`, but LINE channel sends no longer stop at the simulated-only messaging provider. The messaging selector now routes `channelType = line` through `apps/api/src/modules/integrations/line/service.js` while preserving simulated behavior for non-LINE channels.

The fix stays fail-closed:

- default mode is still simulated
- real LINE requires `LINE_INTEGRATION_MODE=real`
- real send additionally requires `LINE_REAL_SEND_ENABLED=true`
- missing token blocks
- AI text requires explicit approval metadata
- medical-risk text requires explicit approval metadata
- line audit logs keep hashes only and do not store raw recipient/message values

## Files changed

- `apps/api/src/modules/messaging/provider.js`
- `apps/api/src/modules/messaging/service.js`
- `apps/api/src/modules/integrations/line/service.js`
- `apps/api/src/modules/ai-agent/conversation-service.js`
- `apps/api/src/modules/automation/service.js`
- `tests/messaging_provider_wiring.test.js`
- `docs/LINE_INTEGRATION_RUNBOOK.md`
- `docs/PROVIDER_WIRING_FIX_REPORT.md`

## Product route behavior

- Lead manual send still enters via `POST /leads/:leadId/messages` in `apps/api/src/server.js`.
- `apps/api/src/modules/messaging/service.js` now passes clinic, entity, actor, source, approval, and safe metadata into the provider selector.
- `apps/api/src/modules/messaging/provider.js` dispatches LINE channels to `sendTextMessage()` and leaves non-LINE channels on the simulated provider path.
- Simulated LINE sends still return `local-...-line` provider ids so downstream code that infers simulated delivery from provider id format does not regress.
- Approved AI queue sends now mark `source: 'ai'` and `approved: true` when they enter the messaging service.
- Automation steps that generate AI text now mark `source: 'ai'` and `approved: false`, which causes real LINE delivery to fail closed instead of bypassing HITL.

## Safety guarantees

- `LINE_REAL_SEND_ENABLED=false` blocks real LINE delivery.
- Missing `LINE_CHANNEL_ACCESS_TOKEN` blocks real LINE delivery.
- `source: 'ai'` without `approved: true` blocks with `HITL_APPROVAL_REQUIRED`.
- Medical-safety-sensitive text without `approved: true` blocks with `MEDICAL_SAFETY_REVIEW_REQUIRED`.
- LINE audit events record `recipientHash`, `messageHash`, `messageLength`, mode, status, and integration status only.
- The product message audit continues to store channel/message status metadata without copying raw recipient or raw message values into LINE audit rows.
- Non-LINE channels remain simulated and do not start using any real provider path.

## Validation

Executed on 2026-05-28 local dev environment after bringing up repo PostgreSQL via Docker.

Targeted tests:

```text
node -r ./teardown-hook.js --test --test-force-exit --test-concurrency=1 \
  apps/api/tests/messaging.test.js \
  tests/messaging_provider_wiring.test.js \
  tests/line_integration.test.js \
  tests/hitl_approval_contract.test.js
```

Result: `24` pass / `0` fail

Repository validation:

```text
npm run validate
```

Result: PASS

Full suite:

```text
npm test
```

Result: `163` pass / `0` fail

## Residual risks

- The immediate product path is wired, but a future worker that sends queued `outbound_messages` must preserve or reconstruct `source` and `approved` context before it calls the provider.
- Non-LINE channels are still simulated-only. This PR intentionally does not add real providers for email or SMS.
- The repository still does not have a dedicated `apps/api/src/modules/messaging/routes.js`; the HTTP route remains centralized in `apps/api/src/server.js`.

## Next recommended PR

First Friendly Pilot Setup