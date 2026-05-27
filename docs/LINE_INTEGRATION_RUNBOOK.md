# LINE Integration Runbook

Last updated: 2026-05-28
Scope: Product LINE delivery wiring for the messaging path. Real sends are not enabled by default.

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

Product messaging provider selector:

```text
apps/api/src/modules/messaging/provider.js
```

Messaging services that call the selector:

```text
apps/api/src/modules/messaging/service.js
```

The current HTTP product route for lead manual send remains in:

```text
apps/api/src/server.js
```

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

## Product Route Wiring

The product messaging path now dispatches by channel type:

- `channelType = line` routes from `apps/api/src/modules/messaging/provider.js` to `sendTextMessage()`.
- non-LINE channels keep the existing simulated provider behavior.

Current behavior for `POST /leads/:leadId/messages` and service-level outbound calls:

- default LINE behavior remains simulated
- `LINE_INTEGRATION_MODE=real` is required before any real adapter path is considered
- `LINE_REAL_SEND_ENABLED=true` is required for any real LINE send
- missing `LINE_CHANNEL_ACCESS_TOKEN` blocks the send
- low-risk manual LINE text can send when the runtime is explicitly enabled
- `source: 'ai'` is blocked unless `approved: true`
- medical-risk text is blocked unless `approved: true`
- audit logs record `line.outbound_attempt` or `line.outbound_blocked` without raw recipient or raw text

AI-related product path notes:

- `queueApprovedMessageForOutbound()` now calls the messaging service with `source: 'ai'` and `approved: true`
- automation steps that generate AI text now call the messaging service with `source: 'ai'` and `approved: false`, so real LINE delivery fails closed instead of silently bypassing HITL

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

The LINE adapter is now wired for the immediate product messaging path through the messaging provider selector.

Still required before broader rollout:

- Add route-level webhook handler with signature verification.
- Confirm tenant/workspace context resolution for inbound events.
- Confirm opt-in/marketing consent policy.
- If a future worker sends queued `outbound_messages`, it must preserve or reconstruct `source` and `approved` context before calling the provider.

## Validation

Expected commands:

```text
node -r ./teardown-hook.js --test --test-force-exit --test-concurrency=1 apps/api/tests/messaging.test.js tests/messaging_provider_wiring.test.js tests/line_integration.test.js tests/hitl_approval_contract.test.js
npm run validate
npm test
```

No real LINE credentials are required for these tests.
