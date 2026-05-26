# AI Provider Integration Runbook

Phase: 5 - LLM real integration foundation
Date: 2026-05-26

## Goal

Add a safe AI generation foundation for FlowBiz Beauty without enabling auto-send. AI generation is used only to create staff-reviewable suggestions for marketing and revenue workflows.

## Runtime Modes

Default mode is mock.

```env
AI_PROVIDER=mock
GEMINI_API_KEY=
OPENAI_API_KEY=
AI_REAL_GENERATION_ENABLED=false
GEMINI_MODEL=gemini-2.5-flash
OPENAI_MODEL=gpt-4.1-mini
```

Supported provider values:

- `mock`: deterministic local generation, no external network call.
- `openai`: real provider path using the OpenAI Responses API.
- `gemini`: real provider path using Gemini `generateContent`.

Real generation is fail-closed:

- `AI_REAL_GENERATION_ENABLED` must be exactly truthy.
- OpenAI requires `OPENAI_API_KEY`.
- Gemini requires `GEMINI_API_KEY`.
- Missing key or disabled real mode blocks generation before any provider request.

## Provider Adapter

Code path:

- `apps/api/src/modules/ai/provider-adapter.js`
- `apps/api/src/modules/ai/prompt-registry.js`

Main functions:

- `generateProviderText()`: generates text through mock/OpenAI/Gemini with pre/post safety checks.
- `generateAiSuggestion()`: generates text and queues it into HITL.
- `queueAiSuggestionForHitl()`: creates a pending AI message and HITL approval queue item.
- `classifyAiMedicalSafety()`: combines the medical keyword classifier with prohibited medical-claim detection.

## Prompt Use Cases

The prompt registry supports:

- `reply_suggestion`
- `follow_up_copy`
- `broadcast_copy`
- `lead_summary`
- `no_show_recovery_copy`
- `review_request_copy`
- `repeat_treatment_reminder_copy`

Every prompt includes the same safety baseline:

- staff review only
- no auto-send
- no diagnosis or prescription
- no guaranteed outcomes
- route risky medical context to staff or doctor review

## HITL Contract For Phase 5

Every generated suggestion must be queued for staff approval before any outbound send.

Current implementation uses the existing lead-scoped HITL tables:

- `ai_chat_messages.status = 'pending_approval'`
- `ai_hitl_approval_queue.status = 'pending'`

If a suggestion cannot be tied to a `clinicId` and `leadId`, generation fails closed with `AI_HITL_QUEUE_REQUIRED`. A universal non-lead HITL queue remains a Phase 6 hardening item.

## Audit Trail

Successful queued generations record:

- `ai.provider_suggestion_requires_hitl`
- `ai.provider_generation_queued`

Blocked real-provider attempts record:

- `ai.provider_generation_blocked`

Audit metadata intentionally stores hashes and lengths instead of raw prompt/input/output PII:

- provider
- model
- use case
- prompt hash
- input hash and length
- output hash and length
- safety labels
- provider request id when available
- `rawPiiLogged: false`

## Medical Safety

Pre-check runs on source context and structured variables. Post-check runs on generated output.

Prohibited generated claims are blocked:

- `ปลอดภัย 100%`
- `เห็นผลแน่นอน`
- `หายแน่นอน`

Medical-risk content is allowed only as a pending staff-review suggestion and is labelled in audit metadata.

## Current Wiring

The existing `/ai/generate-message` service now:

1. Collects lead signals.
2. Generates copy through the provider adapter.
3. Stores an AI insight.
4. Queues the generated text into HITL.
5. Returns `status: pending_approval`, `hitlRequired: true`, and `hitlMessageId`.

No outbound provider send is triggered by this flow.

## Validation

Run:

```powershell
node --test tests/ai_provider_integration.test.js tests/ai_agent_layer.test.js tests/pre_phase10_safety_unit.test.js
npm run validate
npm test
```

Expected:

- mock provider queues HITL item
- missing real keys fail closed
- disabled real mode fails before network request
- OpenAI adapter can be exercised with an injected fetch mock
- medical/prohibited text is flagged
- full suite remains green

## Residual Risks

- Existing HITL queue is lead-scoped; broadcast-level and customer-level AI approvals need Phase 6 schema/contract hardening.
- Real provider calls are foundation-level only and have not been live-tested with actual external credentials.
- Provider output moderation is deterministic and rule-based; it should be expanded before production.
- Prompt registry is code-based; admin-managed prompt versioning is not included in this phase.
