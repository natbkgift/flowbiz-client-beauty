# Staging Deploy Sequence - FlowBiz Beauty

Date: 2026-05-27
Scope: Post-Phase 10 PR 5 - deployment checklist only

## Status

`CHECKLIST_ONLY_NO_DEPLOY`

This sequence is the approved order for converting `beauty.flowbiz.cloud` into a staging-safe target. Commands are examples for the operator. Do not run them against the host until the owner explicitly approves the conversion window and target database.

## Required Approvals

Before any host change:

- Owner confirms `beauty.flowbiz.cloud` is intended to be staging.
- Operator confirms the target database is staging-only.
- Operator confirms no real customer data is required.
- Operator confirms no real LINE or real AI provider mode will be used.
- Operator confirms rollback owner and backup location.
- Operator confirms service restart window.

## Pre-Change Evidence

Record:

```bash
hostname
date -u
git rev-parse --short HEAD
systemctl cat flowbiz-client-beauty-api.service flowbiz-client-beauty-web.service
readlink -f /opt/flowbiz/clients/flowbiz-client-beauty/current
docker ps
```

Sanitize env output before storing it in docs. Never print or commit secret values.

## Step 1 - Prepare Non-Root Runtime

Target final state:

- Service user: `flowbiz`
- Service group: `flowbiz`
- No app service runs as root.

Example host preparation, after approval:

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin flowbiz
sudo mkdir -p /etc/flowbiz
sudo mkdir -p /opt/flowbiz/clients/flowbiz-client-beauty-staging/{repo,releases,shared}
sudo mkdir -p /var/backups/flowbiz-beauty-staging
sudo chown -R flowbiz:flowbiz /opt/flowbiz/clients/flowbiz-client-beauty-staging
```

If the `flowbiz` user already exists, do not recreate it. Verify ownership instead.

## Step 2 - Create Staging Env File

Create the env file outside the repository:

```bash
sudo install -m 0640 -o root -g flowbiz /dev/null /etc/flowbiz/flowbiz-beauty-staging.env
```

Populate it from `docs/STAGING_ENV_MATRIX.md`. Required safety values:

```text
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

Do not place secrets in repo files or shell history.

## Step 3 - Prepare Staging Database

Use a staging-only database, user, and storage path.

Checklist:

- Database name includes a staging marker.
- Database user includes a staging marker.
- Data root includes a staging marker.
- Existing production-like database is not used.
- Staging backup path exists before migration.

If using Docker Compose:

```bash
docker compose --env-file /etc/flowbiz/flowbiz-beauty-staging.env -f infra/docker/docker-compose.staging.yml config
docker compose --env-file /etc/flowbiz/flowbiz-beauty-staging.env -f infra/docker/docker-compose.staging.yml up -d postgres
docker compose --env-file /etc/flowbiz/flowbiz-beauty-staging.env -f infra/docker/docker-compose.staging.yml ps
```

Stop if the compose config points to a production-like data path.

## Step 4 - Backup Before Migration

Run a backup against the staging database before migration:

```bash
mkdir -p /var/backups/flowbiz-beauty-staging
pg_dump "$DATABASE_URL" > /var/backups/flowbiz-beauty-staging/pre-migration-$(date +%Y%m%d%H%M%S).sql
```

If the staging database is newly empty, record that fact. Do not skip backup silently.

## Step 5 - Prepare Release

From the staging release tree:

```bash
git fetch origin
git checkout <approved-commit>
npm ci
npm run validate
npm test
npm run build:web
```

Expected:

- Validation passes.
- Full test suite passes.
- Build succeeds.
- Generated assets belong to the approved release.

## Step 6 - Run Migration And Demo Seed

Only after database isolation is confirmed:

```bash
npm run migrate
npm run seed:demo
```

Stop if:

- Migration fails.
- Migration attempts unexpected destructive changes.
- The env points to a production-like database.
- Demo seed would insert into any database that is not clearly staging.

## Step 7 - Install Staging Systemd Units

Use staging service names:

- `flowbiz-beauty-api-staging.service`
- `flowbiz-beauty-web-staging.service`

Required properties:

```text
User=flowbiz
Group=flowbiz
EnvironmentFile=/etc/flowbiz/flowbiz-beauty-staging.env
NoNewPrivileges=true
PrivateTmp=true
```

Validate unit files before restart:

```bash
systemd-analyze verify /etc/systemd/system/flowbiz-beauty-api-staging.service
systemd-analyze verify /etc/systemd/system/flowbiz-beauty-web-staging.service
```

Do not replace existing active units until explicit approval is given.

## Step 8 - Configure Nginx

Use a staging-specific nginx site:

- Staging hostname only.
- Staging upstream names.
- Staging log file names.
- `/api/` routes to staging API.
- `/` routes to staging web.

Validate:

```bash
sudo nginx -t
```

Do not reload nginx until the service and domain cutover window is approved.

## Step 9 - Controlled Service Start

After approval:

```bash
sudo systemctl daemon-reload
sudo systemctl restart flowbiz-beauty-api-staging
sudo systemctl restart flowbiz-beauty-web-staging
sudo systemctl status flowbiz-beauty-api-staging --no-pager
sudo systemctl status flowbiz-beauty-web-staging --no-pager
```

If nginx config changed:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## Step 10 - Smoke Sequence

Run:

```bash
curl -i https://beauty.flowbiz.cloud/api/live
curl -i https://beauty.flowbiz.cloud/api/ready
```

Then from an operator machine:

```powershell
$env:BASE_URL="https://beauty.flowbiz.cloud"
$env:API_BASE_URL="https://beauty.flowbiz.cloud/api"
$env:EXPECT_DEMO_DATA="true"
npm run smoke:staging
Remove-Item Env:\BASE_URL
Remove-Item Env:\API_BASE_URL
Remove-Item Env:\EXPECT_DEMO_DATA
```

Manual checks:

- Public page loads.
- Admin page loads.
- Demo owner login works.
- Dashboard contains demo metrics.
- Automation page shows the 8 MVP flows.
- HITL queue contains pending demo suggestions.
- Audit log contains demo events.
- LINE remains simulated.
- AI remains mock.

## Rollback Safety Checklist

Rollback must be explicit and non-destructive:

- Confirm rollback target release.
- Confirm backup file path.
- Confirm no automatic data deletion.
- Confirm old nginx config snapshot.
- Confirm old systemd units snapshot.
- Repoint `current` symlink only after owner approval.
- Restore database only from a verified backup and only to the staging database.
- Re-run `/api/ready` and smoke after rollback.

Do not delete release directories or database volumes automatically.

## Evidence To Record

Update `docs/STAGING_LIVE_SMOKE_REPORT.md` with:

- Release commit.
- Staging URL.
- API base URL.
- Env safety confirmation.
- Migration result.
- Demo seed result.
- Smoke result.
- `/api/live` result.
- `/api/ready` result.
- Demo login result.
- HITL queue result.
- Audit log result.
- LINE simulated confirmation.
- AI mock confirmation.

## No-Go Conditions

No-go if:

- Any env value is guessed.
- Target database isolation is unclear.
- Services must continue running as root.
- Provider credentials are required for smoke.
- `/api/ready` fails.
- Full tests fail in auth, tenant, HITL, AI, LINE, audit, or readiness areas.
- Rollback path requires destructive deletion.
