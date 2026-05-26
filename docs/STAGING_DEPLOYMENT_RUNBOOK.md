# Staging Deployment Runbook - FlowBiz Beauty

Phase: 8 - Staging deployment readiness
Date: 2026-05-26

## Staging Goal

Staging is for demo readiness, pilot validation, migration rehearsals, and integration safety checks. It must not use production data, production credentials, real LINE sending, or real AI generation unless a separate approved test plan explicitly changes those controls.

## Staging Architecture

Recommended minimal staging topology:

- PostgreSQL 16 through Docker Compose.
- API Node service through systemd on `127.0.0.1:8103`.
- Web Node service through systemd on `127.0.0.1:8104`.
- Nginx terminates HTTPS and proxies `/api/` to API and `/` to web.
- Demo data is optional and seeded with `npm run seed:demo`.

This keeps the current modular monolith architecture. Do not convert to microservices for staging.

## Required Server Packages

- Node.js 22 LTS or the version approved by CI.
- npm.
- Git.
- Docker Engine with Docker Compose plugin.
- PostgreSQL client tools for `pg_dump` and manual restore checks.
- nginx.
- certbot if HTTPS certificates are managed on the host.
- systemd.

## Env Setup

Create a staging env file outside the repository, for example:

```bash
/etc/flowbiz/flowbiz-beauty-staging.env
```

Use `.env.example` as the variable checklist, then set staging values:

```bash
APP_ENV=staging
API_PORT=8103
WEB_PORT=8104
PUBLIC_APP_URL=https://staging.example.invalid
API_BASE_URL=/api
DATABASE_URL=postgresql://flowbiz_staging:replace-with-staging-password@127.0.0.1:5432/flowbiz_beauty_staging
AUTH_TOKEN_SECRET=replace-with-staging-random-secret
INVITE_TOKEN_SECRET=replace-with-staging-random-secret
LINE_INTEGRATION_MODE=simulated
LINE_REAL_SEND_ENABLED=false
AI_PROVIDER=mock
AI_REAL_GENERATION_ENABLED=false
```

Do not commit the staging env file. Do not reuse production secrets or production database URLs.

## Database Setup

Use the staging compose file:

```bash
docker compose --env-file /etc/flowbiz/flowbiz-beauty-staging.env -f infra/docker/docker-compose.staging.yml up -d postgres
docker compose --env-file /etc/flowbiz/flowbiz-beauty-staging.env -f infra/docker/docker-compose.staging.yml ps
```

Confirm the container is healthy before migrations.

## Migration Steps

From the release directory:

```bash
npm ci
npm run build:web
npm run migrate
```

If migrations fail, stop. Do not manually edit schema in staging to force progress. Capture logs and restore from the pre-migration backup if needed.

## Seed Demo Steps

Demo seed is optional but recommended for sales and pilot walkthroughs:

```bash
npm run seed:demo
```

The demo tenant is `flowbiz-beauty-demo`. Demo data is fake and must remain clearly marked as demo.

## Build Steps

```bash
npm ci
npm run validate
npm run build:web
```

Do not copy generated assets from another environment. Build from the checked-out release commit.

## Start And Restart Steps

Install the staging systemd examples after replacing placeholders:

- `infra/systemd/flowbiz-beauty-api.staging.service.example`
- `infra/systemd/flowbiz-beauty-web.staging.service.example`

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl restart flowbiz-beauty-api-staging
sudo systemctl restart flowbiz-beauty-web-staging
sudo systemctl status flowbiz-beauty-api-staging --no-pager
sudo systemctl status flowbiz-beauty-web-staging --no-pager
```

Staging services must run as a non-root user such as `flowbiz`.

## Health Check

Use:

- `GET /live` for process liveness. This does not check database readiness.
- `GET /ready` for readiness. This checks database connectivity and returns non-200 if DB is unavailable.
- `GET /health` is kept as a readiness alias for compatibility.

Load balancers and deployment gates should use `/api/ready` through nginx.

## Smoke Test

Dry-run mode for local validation without running servers:

```powershell
$env:SMOKE_DRY_RUN="true"
npm run smoke:staging
```

Live staging smoke:

```powershell
$env:BASE_URL="https://staging.example.invalid"
$env:API_BASE_URL="https://staging.example.invalid/api"
$env:EXPECT_DEMO_DATA="true"
npm run smoke:staging
```

The smoke test checks API readiness, web routes, admin/public assets, invalid-login behavior, demo tenant visibility when requested, and local process env flags for real send/generation.

## Log Locations

- API systemd logs: `journalctl -u flowbiz-beauty-api-staging`
- Web systemd logs: `journalctl -u flowbiz-beauty-web-staging`
- nginx access/error logs: `/var/log/nginx/flowbiz-beauty-staging-access.log`, `/var/log/nginx/flowbiz-beauty-staging-error.log`
- PostgreSQL logs: Docker logs for `flowbiz-beauty-postgres-staging`
- Backup files: staging backup directory outside the repo, for example `/var/backups/flowbiz-beauty-staging`

## No-Real-Send Policy

Staging defaults:

- `LINE_INTEGRATION_MODE=simulated`
- `LINE_REAL_SEND_ENABLED=false`
- `AI_PROVIDER=mock`
- `AI_REAL_GENERATION_ENABLED=false`
- Empty LINE/OpenAI/Gemini keys unless a separately approved integration test is running

Do not run live LINE or live LLM generation during Phase 8.

## Go/No-Go Checklist

Go when all are true:

- Env file is outside repo and contains no production credentials.
- PostgreSQL container is healthy.
- `npm run migrate` passes.
- `npm run validate` passes.
- `npm test` passes or an approved test subset is documented for the staging gate.
- `/api/ready` returns 200 with database connected.
- Smoke test passes against staging.
- LINE real send is disabled.
- AI real generation is disabled.
- Rollback backup exists from before the release.

No-go if any are true:

- `/api/ready` returns non-200.
- Staging points to production database or production credentials.
- Real LINE send or real AI generation is enabled unintentionally.
- Migration failed or produced data-loss concern.
- Auth, tenant isolation, HITL, AI safety, LINE safety, or audit tests fail.
