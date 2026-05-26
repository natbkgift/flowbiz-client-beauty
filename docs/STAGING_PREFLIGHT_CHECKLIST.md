# Staging Preflight Checklist - FlowBiz Beauty

Date: 2026-05-27
Scope: Post-Phase 10 PR 2 - live staging smoke preparation

## Current Decision

Status: `BLOCKED_FOR_LIVE_EXECUTION`

No staging host, staging URL, SSH target, or approved staging environment file was provided in the current workspace context. Per the staging safety rule, this document replaces `docs/STAGING_LIVE_SMOKE_REPORT.md` until a real staging host is available.

No production deploy was attempted. No production database, production secret, real LINE credential, real AI credential, or real customer data was used.

## Goal

Prepare the first live staging smoke run so that a future operator can deploy staging and record evidence without enabling real external send or real AI generation.

The live smoke run must verify:

- `/api/live`
- `/api/ready`
- admin page
- public page
- demo login
- HITL queue
- audit log
- LINE simulated mode
- AI mock mode

## Required Inputs Before Live Smoke

Do not start deployment until all values below are known and approved:

- Staging hostname or IP
- Staging public URL
- API base URL through nginx, usually `https://<staging-domain>/api`
- SSH access method for the staging host
- Non-root service user, recommended placeholder: `flowbiz`
- Staging env file path outside repo, for example `/etc/flowbiz/flowbiz-beauty-staging.env`
- Staging PostgreSQL database name
- Staging PostgreSQL user
- Backup directory outside repo
- Rollback release path or previous release commit
- Owner of go/no-go decision

## Safety Invariants

These values must remain in the staging env unless a separate signed integration test plan exists:

```bash
APP_ENV=staging
LINE_INTEGRATION_MODE=simulated
LINE_REAL_SEND_ENABLED=false
AI_PROVIDER=mock
AI_REAL_GENERATION_ENABLED=false
LINE_CHANNEL_ACCESS_TOKEN=
LINE_CHANNEL_SECRET=
GEMINI_API_KEY=
OPENAI_API_KEY=
```

Hard blocks:

- Do not point `DATABASE_URL` to production.
- Do not copy production secrets.
- Do not load real customer data.
- Do not use a production domain unless explicitly approved for staging.
- Do not run destructive rollback.
- Do not run real LINE outbound.
- Do not run real OpenAI/Gemini generation.

## Host Preflight

Run on the staging host:

```bash
node --version
npm --version
docker --version
docker compose version
psql --version
nginx -v
systemctl --version
```

Expected:

- Node.js 22 or approved CI-compatible version
- npm available
- Docker Engine and Compose plugin available
- PostgreSQL client tools available
- nginx installed if the host terminates HTTP(S)
- systemd available for API/web services

## Repository Preflight

Run from the release checkout:

```bash
git status --short --branch
git rev-parse --short HEAD
npm ci
npm run validate
npm test
```

Expected:

- Worktree clean before deployment
- Validation passes
- Full test suite passes

## Staging Env Checklist

The staging env file must live outside the repo. Recommended path:

```bash
/etc/flowbiz/flowbiz-beauty-staging.env
```

Required variables:

```bash
APP_ENV=staging
API_PORT=8103
WEB_PORT=8104
PUBLIC_APP_URL=https://staging.example.invalid
API_BASE_URL=/api
APP_BASE_URL=https://staging.example.invalid
DATABASE_URL=postgresql://flowbiz_staging:<staging-password>@127.0.0.1:5432/flowbiz_beauty_staging
AUTH_TOKEN_SECRET=<staging-random-secret>
INVITE_TOKEN_SECRET=<staging-random-secret>
LINE_INTEGRATION_MODE=simulated
LINE_REAL_SEND_ENABLED=false
AI_PROVIDER=mock
AI_REAL_GENERATION_ENABLED=false
GEMINI_API_KEY=
OPENAI_API_KEY=
```

Checklist:

- Env file is not committed.
- `DATABASE_URL` is staging-only.
- Secrets are generated for staging and not reused from production.
- LINE and AI real modes are disabled.
- Provider API keys are empty unless a separate integration test plan is approved.

## Database And Backup Preflight

Before migration:

```bash
docker compose --env-file /etc/flowbiz/flowbiz-beauty-staging.env -f infra/docker/docker-compose.staging.yml up -d postgres
docker compose --env-file /etc/flowbiz/flowbiz-beauty-staging.env -f infra/docker/docker-compose.staging.yml ps
pg_dump "$DATABASE_URL" > /var/backups/flowbiz-beauty-staging/pre-migration-$(date +%Y%m%d%H%M%S).sql
```

Expected:

- PostgreSQL container is healthy.
- Backup file is created outside the repo.
- Backup restore procedure is known before migration begins.

## Build And Migration Steps

Run from the release checkout:

```bash
npm ci
npm run build:web
npm run migrate
```

Stop if:

- Migration fails.
- Migration attempts destructive data loss without approved backup/rollback plan.
- Build rewrites unexpected files outside generated assets.

## Demo Seed

Run only after migration succeeds and the database is confirmed staging-only:

```bash
npm run seed:demo
```

Expected:

- Demo clinic `flowbiz-beauty-demo` exists.
- Demo users are local/staging-only demo users.
- No real patient/customer data is inserted.

## Service Start

Install or update staging systemd units from examples after replacing placeholders:

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

Expected:

- Services run as non-root user.
- API listens on staging API port.
- Web listens on staging web port.
- nginx proxies `/api/` to API and `/` to web.

## Live Health Checks

Use the public staging URL through nginx:

```bash
curl -i https://staging.example.invalid/api/live
curl -i https://staging.example.invalid/api/ready
```

Expected:

- `/api/live` returns HTTP 200 when the process is alive.
- `/api/ready` returns HTTP 200 only when database connectivity is healthy.
- If database is unavailable, `/api/ready` must return non-200.

## Live Smoke Command

Run from the release checkout or an operator machine that can reach staging:

```powershell
$env:BASE_URL="https://staging.example.invalid"
$env:API_BASE_URL="https://staging.example.invalid/api"
$env:EXPECT_DEMO_DATA="true"
npm run smoke:staging
Remove-Item Env:\BASE_URL
Remove-Item Env:\API_BASE_URL
Remove-Item Env:\EXPECT_DEMO_DATA
```

Expected:

- API readiness passes.
- Web `/` and `/admin` pass.
- Admin and public bundles are reachable.
- Invalid login behavior is rejected safely.
- Demo tenant login succeeds when demo data is expected.
- External-send flags are not enabled.

## Manual Smoke Checks

Record screenshots or command output for:

- Public page loads.
- Admin page loads.
- Demo login works for `owner.demo@flowbiz.local`.
- Dashboard has demo data.
- Automation page shows 8 MVP flows.
- HITL queue has pending demo suggestions.
- Approve/modify/reject UI is visible.
- Audit log shows demo and HITL events.
- LINE status remains simulated.
- AI provider remains mock.

## Evidence Template

Copy this section into `docs/STAGING_LIVE_SMOKE_REPORT.md` after a real staging run:

```markdown
# Staging Live Smoke Report - FlowBiz Beauty

Date:
Release commit:
Staging URL:
API base URL:
Operator:

## Safety Confirmation

- Production DB used: no
- Production secrets used: no
- Real customer data used: no
- LINE real outbound enabled: no
- AI real generation enabled: no

## Commands

- npm run migrate:
- npm run seed:demo:
- npm run smoke:staging:

## Checks

- /api/live:
- /api/ready:
- admin page:
- public page:
- demo login:
- HITL queue:
- audit log:
- LINE simulated:
- AI mock:

## Result

PASS / BLOCKED / FAIL

## Issues

## Go/No-Go
```

## Go/No-Go

Go for live staging smoke only when:

- Staging host exists and is reachable.
- Env file is staging-only and outside repo.
- Database is confirmed non-production.
- Backup exists before migration.
- LINE and AI real modes are disabled.
- CI/local validation is green.
- Operator has rollback procedure ready.

No-go if:

- Host identity is unclear.
- Database URL could point to production.
- Any production secret is required.
- Any real customer data is required.
- Real external send is requested.
- `/api/ready` is unhealthy.
- Auth, tenant, HITL, AI, LINE, or audit tests fail.
