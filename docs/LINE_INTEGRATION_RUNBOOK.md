# LINE Integration Runbook

Last updated: 2026-05-26  
Scope: Phase 4 foundation for LINE Messaging API integration. Real sends are not enabled by default.

## Runtime Modes

Configure LINE through environment variables:

```text
LINE_INTEGRATION_MODE=simulated
LINE_CHANNEL_ACCESS_TOKEN=
LINE_CHANNEL_SECRET=
LINE_REAL_SEND_ENABLED=false
```

Allowed modes:

- `simulated`: default. No external LINE API request is sent.
- `real`: enables the real adapter path, but still refuses to send unless `LINE_REAL_SEND_ENABLED=true`.

Real send fail-closed rules:

- If `LINE_INTEGRATION_MODE=real` and `LINE_REAL_SEND_ENABLED` is not `true`, sending is blocked.
- If real send is enabled but `LINE_CHANNEL_ACCESS_TOKEN` is missing, sending is blocked.
- Tests must never set real credentials or trigger real external sends.

## Module

Main module:

```text
apps/api/src/modules/integrations/line/service.js
```

Exported functions:

- `sendTextMessage()`
- `validateWebhookSignature()`
- `parseInboundEvent()`
- `dryRunSend()`
- `auditOutboundAttempt()`

## Outbound Send Contract

Use `sendTextMessage()` for outbound LINE text attempts:

```js
await sendTextMessage({
  clinicId,
  actorUserId,
  entityType: 'lead',
  entityId: leadId,
  recipientId: lineUserId,
  text,
  source: 'manual',
  approved: false,
  dryRun: false
});
```

Important safety controls:

- `source: 'ai'` requires `approved: true`.
- Medical-safety-sensitive text requires `approved: true`.
- The adapter does not log raw recipient IDs or raw message text in audit context.
- Audit context stores hashes and message length instead.

## Dry Run

Use dry run to validate request shaping and audit behavior without provider sends:

```js
await dryRunSend({
  clinicId,
  actorUserId,
  recipientId: lineUserId,
  text: 'Dry run message'
});
```

Dry run works even when mode is `real` and `LINE_REAL_SEND_ENABLED=false`.

## Webhook Signature Verification

LINE webhooks must be verified with `x-line-signature` and `LINE_CHANNEL_SECRET`.

```js
const verification = validateWebhookSignature(req);

if (!verification.ok) {
  // reject webhook
}
```

The signature is HMAC-SHA256 over the raw request body, encoded as base64.

Fail-closed cases:

- Missing `LINE_CHANNEL_SECRET`
- Missing `x-line-signature`
- Invalid signature

## Inbound Event Parsing

Use `parseInboundEvent()` to normalize LINE events:

```js
const normalized = parseInboundEvent(lineEvent);
```

Normalized fields include:

- `eventType`
- `replyToken`
- `sourceType`
- `lineUserId`
- `messageType`
- `text`
- `rawEvent`

## Audit Events

The adapter writes audit events for send attempts when `clinicId` is provided:

- `line.outbound_attempt`
- `line.outbound_blocked`

Audit metadata includes:

- mode
- status
- dry-run flag
- reason
- integration status
- provider message id when present
- recipient hash
- message hash
- message length
- medical safety classification

## Current Integration Boundary

This phase adds the LINE adapter foundation only. It is not yet wired as the default provider behind existing messaging routes.

Before using LINE for real outbound in staging:

- Wire `channel_type = line` sends to this adapter.
- Preserve HITL approval checks before calling the adapter with `source: 'ai'`.
- Add route-level webhook handler with signature verification.
- Confirm tenant/workspace context resolution for inbound events.
- Confirm opt-in/marketing consent policy.

## Validation

Expected commands:

```text
node -r ./teardown-hook.js --test --test-force-exit --test-concurrency=1 tests/line_integration.test.js tests/pre_phase10_safety_unit.test.js
npm run validate
npm test
```

No real LINE credentials are required for these tests.
