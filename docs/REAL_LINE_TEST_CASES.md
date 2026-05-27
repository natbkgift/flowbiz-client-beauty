# Real LINE Test Cases - FlowBiz Beauty

Date: 2026-05-27
Scope: Post-Phase 10 PR 7A - plan only, no real send

## Test Data Rules

- Use staging only.
- Use demo or fake QA data only.
- Use a test LINE OA and test user only.
- Do not use production LINE OA or real customer data.
- Do not print token, secret, raw recipient ID, or raw message text in shared evidence.

## Test Cases

| ID | Test Case | Preconditions | Steps | Expected Result | Evidence |
| --- | --- | --- | --- | --- | --- |
| LINE-001 | Env defaults remain simulated | Staging smoke is PASS | Inspect sanitized env and run smoke | LINE mode is simulated, real send disabled | Sanitized env, smoke output |
| LINE-002 | Missing token blocks real send | Real mode selected in controlled test, token absent | Attempt adapter send to fake recipient | Send fails before provider call | Error code, audit blocked row |
| LINE-003 | Real mode disabled blocks send | Real mode selected, real-send switch disabled | Attempt adapter send | Send blocked with fail-closed error | Error code, audit blocked row |
| LINE-004 | Webhook missing signature rejected | Adapter or webhook route available | Send raw payload without signature | Validation rejects missing signature | Validation result, no entity mutation |
| LINE-005 | Webhook invalid signature rejected | Channel secret available in staging secret storage | Send payload with incorrect signature | Validation rejects invalid signature | Validation result, no entity mutation |
| LINE-006 | Webhook valid signature accepted | Channel secret available, raw body preserved | Send payload with correct signature | Validation passes and event parser normalizes inbound event | Validation result, normalized event |
| LINE-007 | Manual staff-approved text can send during approved QA window | Test OA/user approved, real provider gate approved | Send exactly one low-risk manual test text | Provider accepts send; audit records attempt | Provider request id, audit row |
| LINE-008 | AI-generated pending approval cannot send | AI suggestion exists with pending status | Attempt outbound/send path | Blocked before provider send | HITL status, error code, audit |
| LINE-009 | AI-generated rejected message cannot send | AI suggestion is rejected | Attempt outbound/send path | Blocked before provider send | HITL status, error code, audit |
| LINE-010 | AI-generated approved or modified message can queue outbound | Suggestion is approved or modified by staff | Queue outbound through approved flow | Outbound queue record created; no bypass | HITL review record, outbound record, audit |
| LINE-011 | Provider failure records failed status and audit | Approved test window, fetch/provider failure simulated or controlled | Force provider non-OK response | Send fails safely and audit stores failure metadata | Failure code, audit failure hash |
| LINE-012 | Disable switch stops real send immediately | Real provider QA was active | Disable real-send switch and retry send | Send blocked and no provider request is made | Sanitized env, blocked audit row |
| LINE-013 | Dry run works in real mode without provider send | Real mode selected, real-send switch disabled | Call dry-run send | Dry-run result recorded without provider call | Audit dry-run row |
| LINE-014 | Medical-risk text requires approval | Medical-risk test text prepared with fake data | Attempt send without approval | Blocked by medical safety rule | Error code, medical safety label, audit |
| LINE-015 | Audit omits raw recipient and message text | Any outbound attempt or block exists | Inspect audit context | Recipient and message are hashed; raw values absent | Audit row screenshot/query output |

## Execution Notes

- Cases LINE-001 through LINE-006 and LINE-013 through LINE-015 can be run without live provider send.
- LINE-007 is the only controlled live-send case and must be executed exactly once per approved QA window.
- LINE-010 verifies FlowBiz outbound lifecycle and HITL queueing; it does not by itself prove provider delivery.
- Full inbound E2E requires a route-level LINE webhook handler. Until that exists, LINE-004 through LINE-006 are adapter-level or harness-level tests.

## Required Commands

Before QA:

```text
npm run smoke:staging
node -r ./teardown-hook.js --test --test-force-exit --test-concurrency=1 tests/line_integration.test.js tests/pre_phase10_safety_unit.test.js
```

During QA:

- Record sanitized env.
- Record `/api/ready`.
- Record test case ID.
- Record audit event IDs.
- Record rollback time.

After QA:

```text
npm run smoke:staging
```

## Pass Summary Template

```text
QA window:
QA owner:
Staging URL:
LINE OA:
Test user:
Cases passed:
Cases failed:
Live send performed:
Rollback completed:
Secrets printed or committed: no
Customer data used: no
```
