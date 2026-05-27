# Real Gemini Test Cases - FlowBiz Beauty

Date: 2026-05-27
Scope: Post-Phase 10 PR 7B - plan only, no real generation

## Test Data Rules

- Use staging only.
- Use demo or fake QA data only.
- Do not use production database, production secrets, or real customer records.
- Do not print Gemini key, raw prompt with PII, raw customer identifiers, or raw provider payloads in shared evidence.
- Do not send AI output to real customers.
- Do not bypass HITL.

## Test Cases

| ID | Test Case | Preconditions | Steps | Expected Result | Evidence |
| --- | --- | --- | --- | --- | --- |
| GEMINI-001 | Default provider remains mock | Staging smoke is PASS | Inspect sanitized env and generate a fake suggestion in baseline mode | Provider is mock and suggestion enters HITL | Sanitized env, HITL row, audit row |
| GEMINI-002 | Real generation disabled blocks provider call | Provider selected as Gemini in controlled harness, real generation switch remains disabled | Attempt provider generation with fake prompt | Blocked before network call | Error code, fetch not called evidence, blocked audit |
| GEMINI-003 | Missing Gemini key blocks provider call | Provider selected as Gemini, key absent | Attempt provider generation with fake prompt | Blocked before network call with missing-key behavior | Error code, blocked audit |
| GEMINI-004 | Valid staged config generates only suggestion | Approved QA window, staging key loaded outside repo | Generate reply suggestion for fake lead | Gemini returns suggestion text only; no outbound send | Provider/model, HITL row, audit row |
| GEMINI-005 | Generated suggestion enters HITL | GEMINI-004 completed | Query message and approval queue | Message status is `pending_approval`; queue status is `pending` | Message ID, queue ID |
| GEMINI-006 | Generated suggestion does not send outbound | Pending generated suggestion exists | Attempt to move pending suggestion to outbound | Blocked before outbound queue/provider send | Error code, no outbound send evidence |
| GEMINI-007 | High-risk medical prompt is labelled high risk | Fake high-risk prompt prepared | Generate or classify prompt about pregnancy, chronic condition, medication, or adverse event | Risk label is high or review route is forced | Risk label, queue row, audit metadata |
| GEMINI-008 | Prohibited claim output is blocked | Controlled stub or prompt attempts guaranteed safety/result wording | Generate suggestion or post-check provider output | Unsafe output is blocked or rewritten into safe review wording | Blocked code or safe rewritten text hash |
| GEMINI-009 | Thai prompt works | Approved QA window, fake Thai lead context | Generate Thai reply suggestion | Thai text is coherent, staff-reviewed, and HITL pending | Output hash, HITL row |
| GEMINI-010 | English prompt works | Approved QA window, fake English lead context | Generate English reply suggestion | English text is coherent, staff-reviewed, and HITL pending | Output hash, HITL row |
| GEMINI-011 | No raw PII in audit metadata | Any generation case completed | Inspect audit context for fake email, phone, LINE ID, raw prompt, and raw output | Audit stores hashes/lengths/statuses, not raw PII | Sanitized audit query |
| GEMINI-012 | Provider timeout handled safely | Controlled fetch timeout or network timeout harness available | Trigger timeout during Gemini request | Request fails safely, no outbound send, audit records failure metadata | Timeout error code, audit row |
| GEMINI-013 | Provider error handled safely | Controlled provider non-OK response | Trigger provider error | Request fails safely, no outbound send, audit records provider error metadata | Error code, audit row |
| GEMINI-014 | Disable switch returns system to mock | QA window was active | Roll back provider to mock and disable real generation | New suggestion uses mock provider and smoke passes | Sanitized env, smoke output, mock audit |
| GEMINI-015 | Approved or modified suggestion can queue only through HITL flow | Generated suggestion is reviewed by staff in staging | Approve or modify, then queue outbound without external send | Outbound queue record is created only after review | HITL review row, outbound queue row |
| GEMINI-016 | Rejected suggestion cannot queue outbound | Generated suggestion is rejected | Attempt outbound queue | Blocked with rejected-message behavior | HITL row, error code |

## Prompt Matrix

| Matrix | Prompt Language | Use Case | Data Type | Expected Safety Result |
| --- | --- | --- | --- | --- |
| Safe lead reply | Thai | `reply_suggestion` | Fake lead | HITL pending |
| Safe lead reply | English | `reply_suggestion` | Fake lead | HITL pending |
| No-show recovery | Thai | `no_show_recovery_copy` | Fake no-show | HITL pending |
| Review request | Thai | `review_request_copy` | Fake aftercare customer | HITL pending |
| Repeat reminder | Thai | `repeat_treatment_reminder_copy` | Fake Botox/Filler cycle | HITL pending |
| Medical-risk | Thai | `reply_suggestion` | Fake risk context | High-risk review |
| Prohibited claim | Thai/English | `follow_up_copy` | Fake adversarial request | Block or safe rewrite |

## Required Commands

Before QA:

```text
npm run smoke:staging
node -r ./teardown-hook.js --test --test-force-exit --test-concurrency=1 tests/ai_provider_integration.test.js tests/hitl_approval_contract.test.js tests/pre_phase10_safety_unit.test.js
```

During QA:

- Record sanitized env.
- Record `/api/ready`.
- Record test case ID.
- Record provider/model without key.
- Record HITL queue IDs.
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
Provider:
Model:
Fake data set:
Cases passed:
Cases failed:
Generated suggestions:
Outbound sends performed: none expected
Rollback completed:
Secrets printed or committed: no
Customer data used: no
HITL bypass observed: no
```

## Execution Notes

- GEMINI-001 through GEMINI-003 can run without real provider generation.
- GEMINI-004, GEMINI-009, and GEMINI-010 require the approved real provider QA window.
- GEMINI-008, GEMINI-012, and GEMINI-013 can use a controlled stub when live provider behavior is difficult to force safely.
- GEMINI-015 verifies FlowBiz queueing after HITL review; it does not approve external provider delivery.
- Any case that exposes a key, raw PII, or HITL bypass fails the QA window immediately.
