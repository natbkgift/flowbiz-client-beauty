# Staging Env Matrix - FlowBiz Beauty

Date: 2026-05-27
Scope: Post-Phase 10 PR 5 - staging isolation planning

## Purpose

This matrix defines the staging environment contract for converting `beauty.flowbiz.cloud` into a staging-safe target. It is not an env file and contains no secrets.

The real staging env must live outside the repository, recommended path:

```text
/etc/flowbiz/flowbiz-beauty-staging.env
```

## Current Observed Remote Env

Sanitized read-only inspection found:

| Variable | Current observed value | Finding |
| --- | --- | --- |
| `APP_ENV` | `production` | Must change for staging |
| `API_PORT` | `8103` | Can be reused only if no conflict |
| `WEB_PORT` | `8104` | Can be reused only if no conflict |
| `DATABASE_URL` | redacted URL using `flowbiz_beauty` database | Not clearly staging-only |
| `POSTGRES_DB` | `flowbiz_beauty` | Not clearly staging-only |
| `POSTGRES_USER` | `flowbiz_beauty` | Not clearly staging-only |
| `DATA_ROOT` | `/opt/flowbiz/data/flowbiz-client-beauty` | Not staging-specific |
| `LINE_INTEGRATION_MODE` | not observed | Must be explicit |
| `LINE_REAL_SEND_ENABLED` | not observed | Must be explicit false |
| `AI_PROVIDER` | not observed | Must be explicit mock |
| `AI_REAL_GENERATION_ENABLED` | not observed | Must be explicit false |
| `GEMINI_API_KEY` | not observed | Must be empty for initial smoke |
| `OPENAI_API_KEY` | not observed | Must be empty for initial smoke |
| `LINE_CHANNEL_ACCESS_TOKEN` | not observed | Must be empty for initial smoke |
| `LINE_CHANNEL_SECRET` | not observed | Must be empty for initial smoke |

## Target Staging Env Matrix

| Variable | Required | Target staging value | Source / owner | Notes |
| --- | --- | --- | --- | --- |
| `APP_ENV` | yes | `staging` | Operator | Required for staging posture |
| `NODE_ENV` | yes | `production` | Operator | Build/runtime optimization is acceptable; `APP_ENV` remains staging |
| `API_PORT` | yes | approved localhost port | Operator | Example `8103`; confirm no conflict |
| `WEB_PORT` | yes | approved localhost port | Operator | Example `8104`; confirm no conflict |
| `PUBLIC_APP_URL` | yes | approved staging URL | Owner/operator | Do not guess domain |
| `APP_BASE_URL` | yes | approved staging URL | Owner/operator | Should match public staging URL |
| `API_BASE_URL` | yes | `/api` or approved API URL | Operator | Must match nginx routing |
| `DATABASE_URL` | yes | staging-only PostgreSQL URL | Operator | Secret value outside repo |
| `POSTGRES_DB` | yes | staging-only database name | Operator | Must include staging marker |
| `POSTGRES_USER` | yes | staging-only database user | Operator | Do not reuse production-like user |
| `POSTGRES_PASSWORD` | yes | secret outside repo | Operator | Never commit |
| `POSTGRES_PORT` | yes | approved host/container port | Operator | Prefer localhost/internal exposure |
| `DATA_ROOT` | yes | staging-only data path | Operator | Example `/opt/flowbiz/data/flowbiz-client-beauty-staging` |
| `BACKUP_ROOT` | yes | staging backup path | Operator | Outside repo |
| `LOG_ROOT` | optional | staging log path | Operator | Can rely on journald/nginx logs |
| `AUTH_TOKEN_SECRET` | yes | staging random secret | Operator | Never reuse production-like secret |
| `INVITE_TOKEN_SECRET` | yes | staging random secret | Operator | Never reuse production-like secret |
| `AUTH_TOKEN_TTL_HOURS` | optional | approved TTL | Operator | Keep conservative |
| `INVITE_TOKEN_TTL_HOURS` | optional | approved TTL | Operator | Keep conservative |
| `PUBLIC_SIGNUP_ENABLED` | optional | owner-approved value | Owner/operator | Consider disabled for demos unless needed |
| `WORKER_LOOP_ENABLED` | optional | owner-approved value | Operator | Enable only if jobs are expected |
| `LINE_INTEGRATION_MODE` | yes | `simulated` | Operator | Initial staging smoke default |
| `LINE_REAL_SEND_ENABLED` | yes | `false` | Operator | Must remain false for conversion |
| `LINE_CHANNEL_ACCESS_TOKEN` | yes | empty | Operator | Real key only after real integration gate |
| `LINE_CHANNEL_SECRET` | yes | empty | Operator | Real key only after real integration gate |
| `AI_PROVIDER` | yes | `mock` | Operator | Initial staging smoke default |
| `AI_REAL_GENERATION_ENABLED` | yes | `false` | Operator | Must remain false for conversion |
| `GEMINI_API_KEY` | yes | empty | Operator | Real key only after real integration gate |
| `OPENAI_API_KEY` | yes | empty | Operator | Real key only after real integration gate |
| `GEMINI_MODEL` | optional | default model name | Operator | Ignored in mock mode |
| `OPENAI_MODEL` | optional | default model name | Operator | Ignored in mock mode |

## Environment Ownership Rules

- Owner approves hostname and whether `beauty.flowbiz.cloud` is staging.
- Operator owns env file creation outside repo.
- Operator owns staging database isolation.
- Founder/sales team owns whether demo data is seeded.
- Security/product owner approves any future real provider credentials.

## Safe Example Skeleton

This skeleton is intentionally incomplete. Replace placeholders on the host only.

```text
APP_ENV=staging
NODE_ENV=production
API_PORT=<approved-api-port>
WEB_PORT=<approved-web-port>
PUBLIC_APP_URL=<approved-staging-url>
APP_BASE_URL=<approved-staging-url>
API_BASE_URL=/api
DATABASE_URL=<staging-postgres-url>
POSTGRES_DB=<staging-db-name>
POSTGRES_USER=<staging-db-user>
POSTGRES_PASSWORD=<staging-db-password>
POSTGRES_PORT=<approved-postgres-port>
DATA_ROOT=<staging-data-root>
BACKUP_ROOT=<staging-backup-root>
AUTH_TOKEN_SECRET=<staging-random-secret>
INVITE_TOKEN_SECRET=<staging-random-secret>
LINE_INTEGRATION_MODE=simulated
LINE_REAL_SEND_ENABLED=false
LINE_CHANNEL_ACCESS_TOKEN=
LINE_CHANNEL_SECRET=
AI_PROVIDER=mock
AI_REAL_GENERATION_ENABLED=false
GEMINI_API_KEY=
OPENAI_API_KEY=
```

## Validation Checklist

Before deployment:

- Env file exists outside repo.
- No secret value is present in Git.
- `APP_ENV=staging`.
- Database name and user clearly identify staging.
- LINE simulated mode is explicit.
- AI mock mode is explicit.
- Provider keys are empty for initial smoke.
- `npm run validate` passes locally.
- `npm test` passes locally.

After deployment:

- `/api/live` returns 200.
- `/api/ready` returns 200 only when database is reachable.
- `npm run smoke:staging` passes against the staging URL.
- Demo data exists only after `npm run seed:demo`.
- HITL queue has demo suggestions.
- Audit log records demo and approval workflow events.
