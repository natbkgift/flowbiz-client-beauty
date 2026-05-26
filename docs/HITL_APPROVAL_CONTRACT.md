# HITL Approval Contract

Phase: 6 - HITL approval hardening
Date: 2026-05-26

## Purpose

Human-In-The-Loop approval is the central safety rule for FlowBiz Beauty AI actions. AI may draft suggestions, but it must not send patient, lead, or customer messages without staff approval.

## AI Suggestion Statuses

Canonical AI message statuses:

- `draft`: internal draft not yet submitted for approval.
- `pending_approval`: waiting for staff review.
- `approved`: staff approved the original AI text.
- `rejected`: staff rejected the AI text; it cannot be sent.
- `modified`: staff approved after editing the AI text.
- `sent`: approved text has been sent by an outbound delivery flow.
- `failed`: outbound delivery failed after approval.

Current Phase 6 implementation uses `pending_approval`, `approved`, `rejected`, and `modified` for review flow. Outbound queueing is recorded separately in `outbound_messages`.

## Required Approval Metadata

Every HITL approval or rejection must preserve:

- `clinic_id`
- `workspace_id`
- `lead_id`
- `ai_message_id`
- approver user id as `reviewed_by`
- original AI text as `original_text`
- staff-edited text as `modified_text` when edited
- risk label as `risk_label`
- timestamp as `reviewed_at`
- outbound reference as `outbound_message_id` when queued for send

Medical-risk labels use:

- `low`
- `medium`
- `high`

## Send Gate

AI-generated messages can move to outbound only when message status is:

- `approved`
- `modified`

Blocked states:

- `pending_approval`: returns `AI_MESSAGE_NOT_APPROVED`
- `rejected`: returns `AI_MESSAGE_REJECTED`

Approval itself does not send. Staff approval only changes the review status. A separate outbound action is required to queue the approved text for delivery.

## Audit Events

Phase 6 records:

- `ai.generated_requires_hitl`
- `ai.auto_reply_requires_hitl`
- `ai.provider_suggestion_requires_hitl`
- `ai.hitl_approved`
- `ai.hitl_modified`
- `ai.hitl_rejected`
- `ai.hitl_outbound_queued`

Audit metadata stores IDs, statuses, risk labels, lengths, and workflow metadata. It avoids storing unnecessary raw PII in audit context.

## Routes

Protected by `ai.manage`:

- `POST /ai-agent/approve/:messageId`
- `POST /ai-agent/reject/:messageId`
- `POST /ai-agent/outbound/:messageId`

Protected by `ai.read`:

- `GET /ai-agent/approval-queue`

The approval queue route is workspace-scoped for authenticated admin UI requests.

## Safety Rules

- AI cannot auto-send.
- Medical high-risk text must remain pending until reviewed.
- Rejected suggestions cannot enter outbound.
- Modified suggestions must keep both before and after text.
- Approved suggestions can be queued for outbound only by an authenticated staff user with `ai.manage`.

## Validation

Run:

```powershell
npm run migrate
node --test tests/hitl_approval_contract.test.js tests/advanced_saas_ai.test.js tests/phase8_ai_agent_orchestrator.test.js
npm run validate
npm test
```

Expected:

- pending AI suggestion cannot move to outbound
- rejected AI suggestion cannot move to outbound
- approved AI suggestion can move to outbound queue
- modified approval stores before/after text and approver metadata
- medical high-risk inbound text is labelled high risk and remains pending
- audit trail exists for approval, modification, rejection, and outbound queueing

## Residual Risks

- `sent` and `failed` state transitions are not yet wired to a real outbound delivery lifecycle callback.
- Customer-level and broadcast-level AI approvals still need a generalized non-lead HITL queue in a later phase.
- Existing manual messaging routes are outside the AI HITL contract and should be reviewed separately for workspace isolation.
