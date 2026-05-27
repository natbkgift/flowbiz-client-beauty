# Staging Real Integration Gate - FlowBiz Beauty

Date: 2026-05-27
Scope: Post-Phase 10 PR 5 - future LINE/AI provider readiness gate

## Purpose

This gate defines the checks required before any real LINE Messaging API or real LLM provider test is run in staging. It is not approval to enable real provider mode.

Initial staging conversion must keep:

```text
LINE_INTEGRATION_MODE=simulated
LINE_REAL_SEND_ENABLED=false
AI_PROVIDER=mock
AI_REAL_GENERATION_ENABLED=false
```

## Integration Gate Principle

Real provider testing is a separate controlled event after staging isolation passes. It must never be bundled with the first staging conversion.

The system must prove:

- Staging database is isolated.
- Demo/pilot data scope is approved.
- HITL remains enforced.
- Audit logs record attempts.
- Webhooks are signature-verified.
- Real sends/generation can be disabled immediately.
- No secret is committed.

## Preconditions

Before requesting real provider QA:

- `docs/STAGING_LIVE_SMOKE_REPORT.md` shows PASS.
- `/api/live` and `/api/ready` pass on staging.
- `npm run smoke:staging` passes against staging.
- Consent and pilot data handling docs are reviewed by owner/legal advisor.
- Demo or pilot test contacts are approved.
- Staff knows AI drafts require approval before outbound.
- Provider credentials are stored only in the host env or approved secret manager.
- Rollback to simulated/mock mode is documented.

## LINE Real Integration Checklist

Required before LINE real mode QA:

- Dedicated LINE test channel or approved staging channel.
- Test recipient IDs only.
- `LINE_CHANNEL_SECRET` present in staging secret storage.
- `LINE_CHANNEL_ACCESS_TOKEN` present in staging secret storage.
- Webhook endpoint uses signature validation.
- Inbound events resolve clinic/workspace context.
- Outbound attempts write audit events.
- AI-originated LINE messages require approved HITL state.
- Medical-risk text is blocked unless staff-approved.
- Dry-run path tested before live provider send.
- Operator can disable real provider path without deploy.

Do not use real clinic customer lists for initial LINE QA.

## AI Real Provider Checklist

Required before Gemini/OpenAI real mode QA:

- Provider key stored only outside repo.
- Provider selected explicitly in staging env.
- Real generation remains disabled until the approved QA window.
- Prompt use case is defined.
- Test input uses fake or approved pilot-safe data.
- Pre-check and post-check medical safety run.
- Generated output enters HITL queue.
- Audit metadata avoids raw PII where possible.
- No generated customer-facing message is sent automatically.
- Operator can revert to `AI_PROVIDER=mock` without data migration.

Do not test real generation with sensitive medical notes or real patient records.

## Required Test Cases

### LINE

- Simulated mode still passes.
- Real mode with send disabled fails closed.
- Missing token fails closed.
- Invalid webhook signature is rejected.
- Valid webhook signature is accepted in a controlled test.
- AI-originated outbound without approval is blocked.
- Approved test outbound attempt is audited.

### AI Provider

- Mock mode still passes.
- Real provider with generation disabled fails closed.
- Missing key fails closed.
- Prohibited medical claim is flagged.
- High-risk text remains pending approval.
- Provider output creates a HITL item.
- Rejected suggestion cannot be sent.

## Approval Record

Before any real integration QA, record:

| Field | Value |
| --- | --- |
| QA owner | `<name>` |
| Clinic/test workspace | `<name>` |
| Test date/time | `<window>` |
| Provider | `<LINE/Gemini/OpenAI>` |
| Data scope | `<fake/demo/approved pilot-safe>` |
| Rollback owner | `<name>` |
| Safety reviewer | `<name>` |
| HITL reviewer | `<name>` |

## Rollback To Safe Mode

Immediate rollback target:

```text
LINE_INTEGRATION_MODE=simulated
LINE_REAL_SEND_ENABLED=false
AI_PROVIDER=mock
AI_REAL_GENERATION_ENABLED=false
LINE_CHANNEL_ACCESS_TOKEN=
LINE_CHANNEL_SECRET=
GEMINI_API_KEY=
OPENAI_API_KEY=
```

After rollback:

- Restart only the affected staging services during approved window.
- Confirm `/api/ready`.
- Run smoke dry-run or live staging smoke.
- Confirm no pending provider job can send.
- Record audit log and incident notes if a provider call failed.

## No-Go Conditions

Do not enable real provider QA if:

- Staging isolation is incomplete.
- Live smoke has not passed.
- Provider keys would need to be committed.
- Test data includes unapproved real customer data.
- HITL can be bypassed.
- Webhook signature verification is missing.
- Audit logging is unavailable.
- Staff reviewers are not assigned.
- Rollback owner is not available.

## Residual Risks

- Real LINE adapter foundation is not yet the default provider behind all existing messaging routes.
- Real AI provider calls have not been live-tested with external credentials.
- Provider outages, rate limits, and message delivery callbacks still need operational handling.
- Consent/PDPA review is draft-level and needs owner/legal advisor sign-off before live pilot data use.
