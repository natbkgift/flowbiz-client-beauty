# Real LINE QA Plan - FlowBiz Beauty

Date: 2026-05-27
Scope: Post-Phase 10 PR 7A - plan only, no real send

## Purpose

This document defines the QA plan for testing the LINE Messaging API on the staging-safe FlowBiz Beauty environment.

This PR does not enable real LINE sending, does not copy LINE credentials into the repository, does not print credentials, and does not send any real message.

## Scope

In scope for the future QA window:

- LINE runtime configuration on staging.
- Fail-closed real mode behavior.
- Outbound adapter behavior.
- Webhook signature validation.
- Inbound event parsing.
- HITL enforcement for AI-originated text.
- Audit evidence for outbound attempts, blocked attempts, and provider failures.
- Rollback to simulated mode.

Out of scope for this plan:

- Production deployment.
- Real customer data.
- Clinic customer broadcast.
- Production LINE OA.
- Bypassing HITL.
- Using LINE for medical advice.
- Production support commitment.

## Staging Preconditions

Before any real LINE QA execution:

- `docs/STAGING_LIVE_SMOKE_REPORT.md` remains PASS.
- `/api/live` returns 200.
- `/api/ready` returns 200 and reports `appEnv=staging`.
- Database is `flowbiz_beauty_staging`.
- API and web services run as non-root `flowbiz`.
- `npm run smoke:staging` passes.
- LINE remains simulated until the approved QA window.
- AI remains mock.
- Test data is fake, demo, or explicitly approved pilot-safe data.
- HITL queue is available and auditable.

## Credential Handling

Credential source provided by operator:

```text
D:\FlowBiz\FlowBiz Company\key\line_message_api
```

Handling rules:

- Do not commit credential files.
- Do not paste token or secret into docs, logs, commits, PR comments, or chat.
- Read credentials only during an approved QA window.
- Store credentials only in the staging host env file or approved secret manager.
- Use a dedicated LINE test channel or approved staging channel.
- Use test LINE users only.
- Clear credentials after QA if the test window is closed.

## Required Env Variables

Required variables for staging LINE QA:

| Variable | Initial staging value | QA window rule |
| --- | --- | --- |
| `LINE_INTEGRATION_MODE` | `simulated` | May be changed to real mode only during the approved QA window |
| `LINE_REAL_SEND_ENABLED` | `false` | May be enabled only during the approved live-send test step |
| `LINE_CHANNEL_ACCESS_TOKEN` | empty | Stored only in staging secret storage during QA |
| `LINE_CHANNEL_SECRET` | empty | Stored only in staging secret storage during QA |
| `APP_ENV` | `staging` | Must remain staging |
| `AI_PROVIDER` | `mock` | Must remain mock for LINE QA |
| `AI_REAL_GENERATION_ENABLED` | `false` | Must remain disabled |

## Test LINE OA And Test User Requirement

Use only:

- Dedicated LINE test OA, or an approved staging LINE OA.
- Test LINE user IDs controlled by the QA team.
- Test message text with no real customer PII.
- Fake lead/customer context from demo seed or QA fixture.

Do not use:

- Production LINE OA.
- Real customer lists.
- Real patient chat history.
- Sensitive medical content.

## HITL Requirements

Before any outbound real-send test:

- AI-originated messages must be in `approved` or `modified` state.
- `pending_approval` messages must be blocked.
- `rejected` messages must be blocked.
- Medical-risk text must require staff approval.
- Audit must preserve action, actor, clinic, workspace, risk label, and status.

Manual staff-authored test text may be used only for the controlled live-send step. AI-generated text must still prove HITL state first.

## Outbound QA Flow

### Stage 1 - Baseline Simulated Mode

1. Confirm staging env safe defaults.
2. Run smoke.
3. Run LINE unit tests.
4. Execute simulated adapter send with fake recipient.
5. Confirm `line.outbound_attempt` audit record exists.
6. Confirm audit stores hashes, not raw recipient or raw text.

### Stage 2 - Real Mode Fail-Closed

1. Switch LINE integration mode to real mode for a controlled test.
2. Keep real-send disabled.
3. Attempt outbound send.
4. Confirm send is blocked.
5. Confirm audit records blocked real attempt.
6. Confirm no provider request is made.

### Stage 3 - Missing Credential Fail-Closed

1. Keep real mode selected.
2. Keep token missing.
3. Enable only the controlled real-send gate in the staging host for this negative test.
4. Attempt outbound send.
5. Confirm send fails before provider request.
6. Confirm audit records missing credential block.
7. Immediately restore disabled state.

### Stage 4 - Controlled Live Send

Run only after explicit approval:

1. Confirm test LINE OA and test user.
2. Confirm token and secret are stored outside repo.
3. Confirm test text is manual staff-approved or HITL-approved.
4. Enable real provider send only for the test window.
5. Send exactly one low-risk test text to the approved test user.
6. Confirm provider response.
7. Confirm audit evidence.
8. Disable real-send switch immediately after test.

This stage is not executed in this PR.

## Inbound Webhook QA Flow

### Signature Negative Tests

1. Send webhook payload without `x-line-signature`.
2. Confirm rejection.
3. Send webhook payload with invalid signature.
4. Confirm rejection.
5. Confirm no lead/customer action is created from rejected webhook.

### Signature Positive Test

1. Generate signature using `LINE_CHANNEL_SECRET` over raw request body.
2. Send payload to staging webhook route after route wiring exists.
3. Confirm signature validation passes.
4. Confirm event parser normalizes source type, LINE user id, message type, and text.
5. Confirm tenant/workspace context is resolved.
6. Confirm audit evidence is written.

Current limitation: the LINE adapter has signature validation and event parsing, but a route-level LINE webhook handler still needs to be wired before full inbound E2E QA.

## Audit And Log Evidence

Collect:

- Staging env sanitized output.
- `/api/ready` response.
- Test case ID.
- Actor user ID.
- Clinic/workspace ID.
- HITL message ID when applicable.
- `line.outbound_attempt` audit row.
- `line.outbound_blocked` audit row.
- Provider request ID when a controlled live send is approved.
- Provider failure hash for failure tests.
- No raw token, recipient ID, or raw message text in shared report.

## Rollback And Disable Plan

Rollback target:

- `LINE_INTEGRATION_MODE` back to simulated.
- `LINE_REAL_SEND_ENABLED` back to false.
- LINE token and secret cleared if the QA window is closed.
- Restart staging API service during approved window.
- Confirm `/api/ready`.
- Run smoke.
- Confirm fail-closed behavior.

Use `docs/REAL_LINE_ROLLBACK_CHECKLIST.md`.

## Stop Conditions

Stop immediately if:

- Staging readiness fails.
- Target DB is not staging.
- Credential would need to be committed or printed.
- Real customer data is requested.
- Production LINE OA is requested.
- AI-generated text can bypass HITL.
- Webhook signature verification is unavailable.
- Audit evidence is missing.
- Any unexpected external send occurs.
- Rollback owner is unavailable.

## Pass/Fail Criteria

Pass when:

- Simulated mode still works.
- Real mode blocks while real-send switch is disabled.
- Missing token blocks before provider request.
- Webhook missing/invalid signatures are rejected.
- Valid signature test passes at adapter level, and later at route level after wiring.
- Pending/rejected AI messages cannot send.
- Approved/modified AI messages can move only through approved outbound flow.
- Provider failure is audited.
- Disable switch stops future real sends.
- No secret or raw customer data appears in repo or report.

Fail if:

- Any real send happens outside the approved test step.
- Any AI-generated message sends without HITL.
- Any provider credential is printed or committed.
- Any webhook bypasses signature validation.
- Audit evidence is missing for attempts or blocks.
- Rollback does not restore simulated mode.
