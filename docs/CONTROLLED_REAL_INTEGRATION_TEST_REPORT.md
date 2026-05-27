# Controlled Real Integration Test Report - FlowBiz Beauty

Date: 2026-05-27
Scope: Post-Phase 10 PR 8 - controlled real integration test window
Staging URL: `https://beauty.flowbiz.cloud/`
API base URL: `https://beauty.flowbiz.cloud/api`
SSH target: `flowbiz-vps`
Operator: Codex

## Status

BLOCKED

The controlled real integration window did not proceed to real Gemini generation or real LINE live send.

Reason: staging preconditions failed during the baseline safety phase. The staging host root filesystem reached 100% usage, PostgreSQL returned `No space left on device`, the staging PostgreSQL container exited, and `/api/ready` changed from healthy to HTTP 503.

No Gemini key, LINE token, LINE secret, real customer data, production database, production secret, production deploy, broadcast, real LINE send, or real AI generation was used.

## Release And Environment

Observed staging release path:

```text
/opt/flowbiz/clients/flowbiz-client-beauty-staging/releases/20260527005135-7463c68
```

Sanitized baseline env before the blocked condition:

```text
APP_ENV=staging
POSTGRES_DB=flowbiz_beauty_staging
POSTGRES_PORT=55432
DATABASE_URL=[redacted]
LINE_INTEGRATION_MODE=simulated
LINE_CHANNEL_ACCESS_TOKEN=
LINE_CHANNEL_SECRET=
LINE_REAL_SEND_ENABLED=false
AI_PROVIDER=mock
GEMINI_API_KEY=
AI_REAL_GENERATION_ENABLED=false
```

Service user check:

```text
flowbiz-beauty-api-staging.service user: flowbiz
flowbiz-beauty-web-staging.service user: flowbiz
```

## Safety Confirmation

| Control | Result |
| --- | --- |
| Production DB used | no |
| Production secret used | no |
| Real customer data used | no |
| Gemini key printed or committed | no |
| LINE token/secret printed or committed | no |
| Real AI generation enabled | no |
| Real LINE send enabled | no |
| LINE live send count | 0 |
| Broadcast attempted | no |
| HITL bypass attempted | no |
| Production deploy attempted | no |
| Runtime code changed | no |

## Credential Preflight

Credential directory inspected without printing values:

```text
D:\FlowBiz\FlowBiz Company\key
```

Sanitized presence check:

| File | Sanitized finding |
| --- | --- |
| `google_ai_studio` | Gemini-like key candidate present |
| `line_message_api` | LINE token-like value, channel-secret-like value, and test-user-like value present |
| `flowbiztoken` | no Gemini/LINE provider credential pattern detected |
| `web3forms` | no Gemini/LINE provider credential pattern detected |

The credentials were not copied to the repository, not copied to staging, not loaded into staging env, and not used for provider calls.

## Baseline Checks

Initial staging smoke from local machine:

```text
npm run smoke:staging: PASS
checks: 8
```

Initial readiness:

```json
{
  "status": "ok",
  "check": "readiness",
  "appEnv": "staging",
  "database": {
    "status": "connected",
    "name": "flowbiz_beauty_staging"
  }
}
```

Local targeted safety suite:

```text
node -r ./teardown-hook.js --test --test-force-exit --test-concurrency=1 tests/ai_provider_integration.test.js tests/hitl_approval_contract.test.js tests/line_integration.test.js tests/pre_phase10_safety_unit.test.js
tests: 30
pass: 30
fail: 0
```

## Blocking Evidence

Remote targeted safety suite was started on the staging host before any real provider credential was loaded.

Result:

```text
remote targeted safety suite: BLOCKED
passing before blocker: 9
failing after blocker: 7
primary error: PostgreSQL could not extend file because no space was left on device
```

Disk check:

```text
Filesystem      Size  Used Avail Use% Mounted on
/dev/sda1       193G  193G     0 100% /
```

Docker storage summary:

```text
Images reclaimable: 8.61GB
Local volumes: 450.1MB total
Staging DB data path: 83M
Staging release tree: 49M
```

Staging PostgreSQL container after blocker:

```text
flowbiz-beauty-postgres-staging Exited (1)
```

PostgreSQL log excerpt, sanitized:

```text
FATAL: could not write init file
ERROR: could not extend file ... No space left on device
HINT: Check free disk space.
```

Readiness after blocker:

```text
GET https://beauty.flowbiz.cloud/api/ready -> 503
database.status: unavailable
database.message: connect ECONNREFUSED 127.0.0.1:55432
```

Final staging smoke after blocker:

```text
npm run smoke:staging: FAIL
reason: API readiness failed at https://beauty.flowbiz.cloud/api/ready: HTTP 503
```

## Gemini Tests Run

| Area | Result |
| --- | --- |
| Baseline mock mode | PASS through local targeted safety tests |
| Fail-closed with real generation disabled | PASS through local targeted safety tests |
| Missing-key block | PASS through local targeted safety tests |
| Controlled real Gemini generation | NOT RUN |
| Safe prompt matrix | NOT RUN |
| Medical-risk prompt matrix | NOT RUN |
| Prohibited-claim output check | NOT RUN |
| HITL verification for real output | NOT RUN |
| Real provider audit evidence | NOT RUN |

Reason not run:

- Remote staging safety precondition failed before real provider activation.
- `/api/ready` became unhealthy.
- Loading Gemini credentials onto a full/unhealthy staging host would violate the fail-closed rule.

## LINE Tests Run

| Area | Result |
| --- | --- |
| Baseline simulated mode | PASS through local targeted safety tests |
| Real mode fail-closed when disabled | PASS through local targeted safety tests |
| Missing token block | PASS through local targeted safety tests |
| Dry-run path | PASS through local targeted safety tests |
| Webhook signature validation | PASS through local targeted safety tests |
| AI pending/rejected send block | PASS through local targeted safety tests |
| Controlled live LINE send | NOT RUN |

Live LINE send count:

```text
0
```

Reason not run:

- Remote staging safety precondition failed before LINE credential loading.
- `/api/ready` became unhealthy.
- The allowed live-send step requires healthy staging, safe env, and immediate rollback capability.

## HITL Check

HITL contract was not re-verified on remote after disk exhaustion because staging database writes were failing.

Local targeted safety tests confirmed:

- pending AI suggestions cannot move outbound
- rejected AI suggestions cannot move outbound
- approved/modified suggestions queue outbound only through HITL flow
- high-risk medical inbound content remains pending

No real Gemini output was generated, and no AI-generated text was sent to LINE.

## Audit Evidence Summary

Audit evidence from the real provider window was not created because the real provider phases did not run.

Local and baseline test evidence confirmed existing behavior for:

- AI provider fail-closed behavior
- HITL approval contract
- LINE simulated/fail-closed behavior
- webhook signature validation
- medical safety classifier

No raw key, token, recipient ID, real customer PII, or provider payload was printed or committed.

## Rollback Confirmation

Provider rollback was not required because real provider modes were never enabled and credentials were never loaded.

Final sanitized env still showed safe defaults:

```text
APP_ENV=staging
LINE_INTEGRATION_MODE=simulated
LINE_CHANNEL_ACCESS_TOKEN=
LINE_CHANNEL_SECRET=
LINE_REAL_SEND_ENABLED=false
AI_PROVIDER=mock
GEMINI_API_KEY=
AI_REAL_GENERATION_ENABLED=false
```

Operational rollback is still required for staging health:

- free disk space or expand the host volume
- restart `flowbiz-beauty-postgres-staging`
- verify `/api/ready`
- rerun staging smoke
- rerun targeted safety tests

## Decision

Controlled real integration test window: BLOCKED

Reason:

- Staging host filesystem full
- PostgreSQL writes failed
- PostgreSQL container exited
- `/api/ready` returned 503

This is a correct fail-closed outcome. Real Gemini generation and real LINE sending must not proceed until staging health is restored.

## Residual Risks

- Host root filesystem is full and can break staging database, logs, deploys, backups, and future QA.
- Docker images show reclaimable space, but cleanup should be planned and recorded because the host runs other FlowBiz services.
- Staging PostgreSQL publishes host port `55432`; firewall exposure still needs review after health is restored.
- The current real LINE adapter remains foundation-level and not the default messaging provider for all routes.
- Real Gemini and real LINE live paths remain unproven.

## Next Actions

1. Create a staging host disk cleanup or volume expansion window.
2. Record cleanup commands and before/after disk evidence.
3. Restart staging PostgreSQL and verify `/api/ready`.
4. Rerun `npm run smoke:staging`.
5. Rerun targeted safety tests on staging.
6. Reopen a controlled real integration window only after staging health is green.
7. If cleanup is successful, proceed with Gemini real generation first, then LINE fail-closed/dry-run, then exactly one controlled LINE live send.
