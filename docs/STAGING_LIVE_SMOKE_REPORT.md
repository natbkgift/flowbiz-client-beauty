# Staging Live Smoke Report - FlowBiz Beauty

Date: 2026-05-27
Scope: Post-Phase 10 PR 6 - staging isolation execution
Release commit: `7463c68`
Staging URL: `https://beauty.flowbiz.cloud/`
API base URL: `https://beauty.flowbiz.cloud/api`
SSH target: `flowbiz-vps`
Operator: Codex

## Status

PASS

`beauty.flowbiz.cloud` has been converted from the previous production-like target into a staging-safe environment for FlowBiz Beauty.

No production database URL, production secret, real LINE credential, real AI provider credential, real customer data, or destructive rollback was used.

## Safety Confirmation

| Control | Result |
| --- | --- |
| `APP_ENV` | `staging` |
| App service user | `flowbiz` |
| Root app services | stopped and disabled |
| Staging database | `flowbiz_beauty_staging` |
| Staging database port | `127.0.0.1:55432` via staging PostgreSQL container |
| Production-like database migrated | no |
| Demo data used | yes, fake demo seed only |
| Real customer data used | no |
| LINE mode | `simulated` |
| LINE real outbound | disabled |
| AI provider | `mock` |
| AI real generation | disabled |
| Provider keys in staging env | empty for LINE/Gemini/OpenAI |

## Host Conversion Summary

Pre-change findings:

- Existing API/web units ran as `root`.
- Existing env reported `APP_ENV=production`.
- Existing public health had `/api/health`, but `/api/live` and `/api/ready` returned 404.
- Existing release predates the Phase 8/9 staging readiness work.

Actions completed:

- Created non-root `flowbiz` service user.
- Created `/etc/flowbiz/flowbiz-beauty-staging.env` outside the repository.
- Created staging release tree:

```text
/opt/flowbiz/clients/flowbiz-client-beauty-staging/
```

- Deployed release:

```text
/opt/flowbiz/clients/flowbiz-client-beauty-staging/releases/20260527005135-7463c68
```

- Created staging data/backup paths:

```text
/opt/flowbiz/data/flowbiz-client-beauty-staging
/opt/flowbiz/backups/flowbiz-client-beauty-staging
/var/backups/flowbiz-beauty-staging
```

- Started staging PostgreSQL container:

```text
flowbiz-beauty-postgres-staging
```

- Installed and enabled staging systemd units:

```text
flowbiz-beauty-api-staging.service
flowbiz-beauty-web-staging.service
```

- Stopped and disabled old root units:

```text
flowbiz-client-beauty-api.service
flowbiz-client-beauty-web.service
```

Process verification:

```text
flowbiz  /usr/bin/node apps/api/src/server.js
flowbiz  /usr/bin/node apps/web/src/server.js
```

## DB Isolation

Staging env uses:

```text
DATABASE_URL=postgresql://flowbiz_beauty_staging:[redacted]@127.0.0.1:55432/flowbiz_beauty_staging
POSTGRES_DB=flowbiz_beauty_staging
POSTGRES_USER=flowbiz_beauty_staging
POSTGRES_PORT=55432
DATA_ROOT=/opt/flowbiz/data/flowbiz-client-beauty-staging
```

Pre-migration backup was created through the staging container because host `pg_dump` was not installed:

```text
/var/backups/flowbiz-beauty-staging/pre-migration-20260527005606.sql
```

Migration result:

```text
npm run migrate: PASS
Applied migrations 001 through 037
```

Base seed was needed for full test fixtures:

```text
npm run seed: PASS
```

Demo seed result:

```text
npm run seed:demo: PASS
lead_count: 6
customer_count: 3
flow_count: 8
hitl_count: 3
audit_count: 3
dashboard_count: 1
```

## Validation Commands

Remote release validation:

```text
npm ci: PASS
npm run validate: PASS
npm run build:web: PASS
npm run migrate: PASS
npm run seed:demo: PASS
npm test: PASS after base seed was added
```

Initial remote `npm test` before base seed failed because the fresh staging database had migrations and demo seed only, while test fixtures expected the base seeded owner/clinic records. After `npm run seed`, full test passed:

```text
tests: 156
pass: 156
fail: 0
duration_ms: 962899.973702
```

Local repository validation:

```text
npm run validate: PASS
npm test: BLOCKED by local environment
```

The local `npm test` attempt failed with PostgreSQL `could not extend file ... Input/output error` after the local `D:` drive reached zero free bytes. This was not reproduced on the isolated staging host, where the full suite passed. `node_modules` in the local workspace was removed after validation to recover enough disk for Git operations; it can be restored with `npm ci`.

Local smoke command:

```powershell
$env:BASE_URL="https://beauty.flowbiz.cloud"
$env:API_BASE_URL="https://beauty.flowbiz.cloud/api"
$env:EXPECT_DEMO_DATA="true"
$env:LINE_REAL_SEND_ENABLED="false"
$env:AI_REAL_GENERATION_ENABLED="false"
npm run smoke:staging
```

Smoke result:

```text
[PASS] external send flags - LINE real send and AI real generation are disabled
[PASS] api readiness - https://beauty.flowbiz.cloud/api/ready HTTP 200
[PASS] web / - https://beauty.flowbiz.cloud/ HTTP 200
[PASS] web /admin - https://beauty.flowbiz.cloud/admin HTTP 200
[PASS] asset /assets/admin.bundle.js - HTTP 200
[PASS] asset /assets/public.bundle.js - HTTP 200
[PASS] login endpoint behavior - invalid credentials rejected with INVALID_CREDENTIALS
[PASS] demo data visibility - demo clinic flowbiz-beauty-demo is reachable
Smoke summary: 8 checks recorded, PASS
```

## Health Checks

Public checks through nginx:

```text
GET https://beauty.flowbiz.cloud/api/live  -> 200
GET https://beauty.flowbiz.cloud/api/ready -> 200
GET https://beauty.flowbiz.cloud/          -> 200
GET https://beauty.flowbiz.cloud/admin     -> 200
```

`/api/live` response:

```json
{
  "status": "ok",
  "check": "liveness",
  "appEnv": "staging"
}
```

`/api/ready` response:

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

## Manual Checks

Manual API checks after smoke:

```text
demo login: PASS
HITL queue: PASS, 3 pending demo records
Audit log: PASS, latest query returned 4 records
Dashboard overview: PASS
LINE simulated: PASS by staging env
AI mock: PASS by staging env
```

## Nginx

`nginx -t` passed.

The existing nginx site for `beauty.flowbiz.cloud` continues to proxy:

- `/api/` to `127.0.0.1:8103`
- `/` to `127.0.0.1:8104`

Because the staging services use the same localhost ports, no nginx reload was required for routing. A later cleanup PR can rename access/error logs to staging-specific filenames.

## Operational Notes

During staging PostgreSQL startup, Docker Compose recreated the previous `flowbiz-beauty-postgres` container into the new staging container name. No migration or seed was run against the previous production-like database URL. The previous data path was not intentionally deleted, but rollback to the old production-like target would require explicit reconstruction of its database container and must not be treated as automatic.

This is acceptable for the approved conversion of `beauty.flowbiz.cloud` into staging, but it is recorded as a residual rollback risk.

## Go/No-Go

| Area | Decision |
| --- | --- |
| Live staging smoke | GO |
| Internal demo | GO |
| Friendly pilot demo | GO with limitations |
| Real LINE integration | NO-GO until real integration gate |
| Real AI generation | NO-GO until real integration gate |
| Production deploy | NO-GO |

## Residual Risks

- Nginx log filenames still use the older `flowbiz-client-beauty` names.
- Staging PostgreSQL publishes host port `55432`; firewall exposure should be reviewed.
- Host contains many other FlowBiz services, so future port/nginx changes still need careful preflight.
- Real LINE and AI credentials exist outside the repo but remain unused; real QA requires `docs/STAGING_REAL_INTEGRATION_GATE.md`.
- Rollback to the old production-like target is not automatic because the old root services are disabled and the old database container was replaced during conversion.
