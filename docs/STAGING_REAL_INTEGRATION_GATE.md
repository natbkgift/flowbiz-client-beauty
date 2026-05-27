# Staging Real Integration Gate - FlowBiz Beauty

Date: 2026-05-27
Scope: Post-Phase 10 PR 8B - real integration approval gate completion

## Purpose

This gate defines the minimum ownership, safety limits, evidence requirements, and stop conditions that must be satisfied before any real LINE Messaging API or real Gemini provider test is run in staging.

This document completes the approval gate definition. It does not authorize real mode by itself. The QA window remains closed until the approval record is populated by human owners at the time of execution.

Initial staging conversion must keep:

```text
LINE_INTEGRATION_MODE=simulated
LINE_REAL_SEND_ENABLED=false
AI_PROVIDER=mock
AI_REAL_GENERATION_ENABLED=false
```

## Integration Gate Principle

Real provider testing is a separate controlled event after staging isolation passes. It must never be bundled with the first staging conversion or any production action.

The system must prove:

- staging database is isolated
- demo or approved pilot-safe data scope is controlled
- HITL remains enforced for all AI output
- audit logs record attempts and blocks
- webhooks are signature-verified
- real sends and real generation can be disabled immediately
- no secret is committed, printed, or stored in the repository

## Fixed Control Limits

- staging only. No production deploy, production DB, or production secret use.
- Max LINE live send per approved QA window: `1`.
- The single live LINE send may target only the approved QA-controlled test LINE user.
- Gemini output is HITL-only and must not send outbound automatically.
- Gemini output must not auto-queue outbound delivery without explicit HITL approval.
- AI-generated text may not bypass HITL under any condition.
- Real mode must not remain enabled after the rollback deadline.
- Technical operator actions are limited to staging env or approved secret storage outside the repo.

## Preconditions

Before requesting or opening the real provider QA window:

- `docs/STAGING_LIVE_SMOKE_REPORT.md` shows PASS.
- `docs/STAGING_DISK_RECOVERY_REPORT.md` shows PASS.
- `docs/CONTROLLED_REAL_INTEGRATION_TEST_REPORT.md` shows the retry outcome and current block reason.
- staging `df -h /` shows at least `20GB` free.
- `https://beauty.flowbiz.cloud/api/live` returns `200`.
- `https://beauty.flowbiz.cloud/api/ready` returns `200` and reports `appEnv=staging`.
- target database is `flowbiz_beauty_staging`.
- API and web services run as non-root `flowbiz`.
- `npm run smoke:staging` passes against public staging.
- targeted safety suite passes against the staging DB.
- demo seed exists and remains fake or demo-only.
- HITL queue is accessible.
- audit logs are readable.
- approved test LINE OA and approved test LINE user are confirmed.
- provider credentials exist outside the repo and outside shared docs.
- rollback owner is assigned and reachable for the full window.
- consent and pilot data handling docs are reviewed by owner or legal advisor.

If any precondition fails, do not load keys, do not enable real mode, and do not open the QA window.

## Ownership And Roles

The following role assignments define who must approve and operate the window. They are role-level assignments for PR 8B and must map to actual human owners at execution time.

| Role | Assigned owner | Responsibility |
| --- | --- | --- |
| QA owner | Senior Integration QA Lead | Owns go or no-go decision, validates test scope, signs final outcome |
| Rollback owner | Staging Rollback Owner | Executes rollback, confirms rollback deadline, blocks any extended real-mode exposure |
| Safety reviewer | SaaS Safety Operator | Reviews medical-risk, prohibited-claim, and outbound safety controls |
| HITL reviewer | Clinic QA HITL Reviewer | Verifies Gemini output stays pending approval and no AI outbound bypass occurs |
| Technical operator | GitHub Copilot in a supervised staging session | Runs approved commands, records sanitized evidence, never stores secrets in repo or chat |

## Approved Test Assets

Only sanitized aliases are stored in the repository. Real identifiers stay outside the repo.

| Asset | Approved value for gate record | Notes |
| --- | --- | --- |
| Clinic or test workspace | `flowbiz-beauty-demo` | Demo-only workspace |
| Test LINE OA | `flowbiz-beauty-staging-test-oa` | Sanitized alias only; real OA identifier stays outside repo |
| Test LINE user | `qa-line-user-01` | Sanitized alias only; real recipient identifier stays outside repo |
| Data scope | `demo/fake/approved pilot-safe only` | No real customer or patient data |

## LINE Real Integration Checklist

Required before LINE real mode QA:

- dedicated test LINE OA or approved staging LINE OA only
- approved test recipient only
- `LINE_CHANNEL_SECRET` present only in staging secret storage
- `LINE_CHANNEL_ACCESS_TOKEN` present only in staging secret storage
- webhook endpoint uses signature validation
- inbound events resolve clinic and workspace context
- outbound attempts write audit events
- AI-originated LINE messages require approved HITL state
- medical-risk text is blocked unless staff-approved
- dry-run path is tested before any live provider send
- operator can disable the provider path without deploy
- live send counter is reset and capped at `1` for the window

Do not use real clinic customer lists for initial LINE QA.

## Gemini Real Provider Checklist

Required before Gemini real mode QA:

- provider key stored only outside repo
- provider selected explicitly in staging env during the approved window only
- real generation remains disabled until the approved window starts
- prompt use cases are defined and use fake or approved pilot-safe data only
- pre-check and post-check medical safety run
- generated output enters HITL queue
- Gemini output remains suggestion-only and does not create outbound send side effects
- audit metadata avoids raw PII where possible
- operator can revert to `AI_PROVIDER=mock` without data migration

Do not test real generation with sensitive medical notes or real patient records.

## Required Test Cases

### LINE

- simulated mode still passes
- real mode with send disabled fails closed
- missing token fails closed
- invalid webhook signature is rejected
- valid webhook signature is accepted in a controlled test
- AI-originated outbound without approval is blocked
- approved test outbound attempt is audited
- exactly one low-risk manual live send may run after explicit owner approval

### AI Provider

- mock mode still passes
- real provider with generation disabled fails closed
- missing key fails closed
- prohibited medical claim is flagged or safely rewritten
- high-risk text remains pending approval
- provider output creates a HITL item only
- rejected suggestion cannot be sent
- no generated suggestion sends outbound automatically

## Approval Record

Populate this record before any key load or real mode enablement. The window stays closed until every `required before start` item is filled by human owners.

| Field | Recorded value | Status |
| --- | --- | --- |
| QA owner | `Senior Integration QA Lead` | assigned |
| Rollback owner | `Staging Rollback Owner` | assigned |
| Safety reviewer | `SaaS Safety Operator` | assigned |
| HITL reviewer | `Clinic QA HITL Reviewer` | assigned |
| Technical operator | `GitHub Copilot in supervised staging session` | assigned |
| Clinic or test workspace | `flowbiz-beauty-demo` | fixed |
| Test LINE OA | `flowbiz-beauty-staging-test-oa` | fixed |
| Test LINE user | `qa-line-user-01` | fixed |
| Provider scope | `Gemini and LINE only` | fixed |
| Data scope | `demo/fake/approved pilot-safe only` | fixed |
| QA window start | `Record at window open in Asia/Bangkok time` | required before start |
| QA window end | `Record at window close in Asia/Bangkok time` | required before start |
| Rollback deadline | `No later than 15 minutes after the last provider-backed step` | fixed |
| Max LINE live send | `1` | fixed |
| Gemini output policy | `HITL only, no outbound send, no outbound auto-queue` | fixed |
| Window status | `CLOSED until all required-before-start fields are recorded and owners approve` | active gate |

## Evidence Checklist

Record sanitized evidence only.

### Before Window Open

- [ ] `git status --short --branch`
- [ ] `df -h /` on staging with at least `20GB` free
- [ ] `curl -i https://beauty.flowbiz.cloud/api/live`
- [ ] `curl -i https://beauty.flowbiz.cloud/api/ready`
- [ ] sanitized staging env snapshot showing safe defaults
- [ ] `npm run smoke:staging` PASS against public staging
- [ ] targeted safety suite PASS against staging DB
- [ ] HITL queue readable
- [ ] audit logs readable
- [ ] approved test LINE OA and test LINE user confirmed outside repo
- [ ] rollback owner reachable and rollback deadline acknowledged

### During Gemini QA

- [ ] provider name and model name only
- [ ] test case IDs and timestamps
- [ ] message IDs, HITL IDs, and audit IDs
- [ ] output length or hash only
- [ ] medical-risk or prohibited-claim outcome evidence
- [ ] explicit note that no outbound send occurred

### During LINE QA

- [ ] fail-closed evidence for disabled or missing-credential cases
- [ ] dry-run evidence with no provider send
- [ ] webhook signature negative and positive evidence
- [ ] live send counter before and after test
- [ ] single controlled live-send attempt evidence if approved
- [ ] audit event IDs for attempt, block, or provider response

### After Rollback

- [ ] sanitized env snapshot back at safe defaults
- [ ] `curl -i https://beauty.flowbiz.cloud/api/ready`
- [ ] `npm run smoke:staging` PASS
- [ ] real-send or real-generation retry is blocked after rollback
- [ ] final `df -h /` on staging
- [ ] incident note if any provider call failed

## Stop Conditions During Window

Stop immediately if any of the following occurs:

- free disk falls below `20GB`
- staging liveness or readiness fails
- env cannot be proven staging-only
- DB cannot be proven `flowbiz_beauty_staging`
- API or web service is not running as `flowbiz`
- a key, token, or secret is printed, logged, or would need to be committed
- real customer or patient data enters the QA path
- Gemini output bypasses HITL
- Gemini output sends or attempts outbound automatically
- LINE send count exceeds `1`
- LINE targets any user other than the approved test user
- audit evidence is missing or unreadable
- rollback owner becomes unavailable
- rollback deadline cannot be met
- post-rollback smoke fails
- PostgreSQL crash or corruption warning reappears

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

- restart only the affected staging services during the approved window
- confirm `/api/ready`
- run smoke against public staging
- confirm no pending provider job can send
- confirm live send counter stopped at `0` or `1`
- record audit log and incident notes if a provider call failed

## No-Go Conditions

Do not enable real provider QA if:

- staging isolation is incomplete
- live smoke has not passed
- provider keys would need to be committed or shared in repo evidence
- test data includes unapproved real customer data
- HITL can be bypassed
- webhook signature verification is missing
- audit logging is unavailable
- required owners or reviewers are not assigned
- rollback owner is not available
- the approval record is incomplete

## Residual Risks

- Real LINE adapter foundation is not yet the default provider behind all existing messaging routes.
- Real Gemini and real LINE provider calls remain unproven until a human-approved window executes.
- Provider outages, rate limits, and message delivery callbacks still need operational handling.
- Consent and PDPA review remain required before any live pilot-safe data usage.
