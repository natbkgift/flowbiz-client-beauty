# Staging Live Smoke Report - FlowBiz Beauty

Date: 2026-05-27
Scope: Post-Phase 10 PR 2 - first live staging smoke attempt
Staging URL: `https://beauty.flowbiz.cloud/`
API base URL: `https://beauty.flowbiz.cloud/api`
SSH target: `flowbiz-vps`
Operator: Codex

## Status

BLOCKED

The host is reachable, but the current remote deployment is not safe to treat as the Phase 8/9 staging target yet.

No migration, demo seed, deploy, service restart, destructive rollback, real LINE send, real AI generation, production credential use, or real customer data use was performed.

## Credential Directory Preflight

User-provided local credential directory:

```text
D:\FlowBiz\FlowBiz Company\key
```

Files observed without printing secret values:

```text
flowbiztoken
google_ai_studio
line_message_api.txt
web3forms
```

Sanitized finding:

- `google_ai_studio` appears to contain a Gemini-like API key.
- `line_message_api.txt` appears to contain LINE Messaging API related credential text.
- The credentials were not copied into the repo.
- The credentials were not copied to the server.
- The credentials were not used for smoke testing.
- Real LINE send and real AI generation remained disabled for local smoke script execution.

Reason not used:

- This run is a staging safety smoke, not a real integration QA run.
- The target host currently reports `APP_ENV=production`.
- The target release does not contain the Phase 8/9 integration safety scripts.
- Using real provider keys before staging isolation is confirmed would violate the no-real-send/no-real-generation policy.

## Safety Confirmation

- Production DB used: not intentionally used by this run
- Production secrets used: no new secrets used
- Real customer data used: no
- LINE real outbound enabled: no
- AI real generation enabled: no
- Production deploy attempted: no
- Destructive rollback attempted: no

## Remote Host Preflight

Read-only SSH preflight:

```text
hostname: srv1184643
ssh user: root
working directory on login: /root
kernel: Linux 6.8.0-107-generic
node: v22.22.2
npm: 10.9.7
git: 2.43.0
nginx: 1.24.0
```

Existing service state:

```text
flowbiz-client-beauty-api.service: active running
flowbiz-client-beauty-web.service: active running
```

Important finding:

```text
systemd User=root
systemd WorkingDirectory=/opt/flowbiz/clients/flowbiz-client-beauty/current
systemd Environment=NODE_ENV=production
```

This does not match the Phase 8 staging runbook expectation that staging services run under a non-root user with a staging env file.

## Remote Release Findings

Current symlink:

```text
/opt/flowbiz/clients/flowbiz-client-beauty/current
-> /opt/flowbiz/clients/flowbiz-client-beauty/releases/20260526100343
```

Remote repo checkout:

```text
repo path: /opt/flowbiz/clients/flowbiz-client-beauty/repo
branch: main...origin/main
commit: ec009aa
latest shown commit: ec009aa Merge pull request #6 from natbkgift/fix/forum-form-labels
```

The current deployed release is older than the local Phase 8-10 readiness work and does not include:

- `scripts/smoke-staging.js`
- `npm run seed:demo`
- `docs/STAGING_DEPLOYMENT_RUNBOOK.md`
- `/live` and `/ready` behavior behind `/api/live` and `/api/ready`

## Sanitized Env Findings

Remote shared `.env` is symlinked from:

```text
/opt/flowbiz/clients/flowbiz-client-beauty/shared/.env
```

Sanitized values observed:

```text
APP_ENV=production
API_PORT=8103
WEB_PORT=8104
DATABASE_URL=postgresql://flowbiz_beauty:[redacted]@localhost:5432/flowbiz_beauty
AUTH_TOKEN_SECRET=[redacted]
INVITE_TOKEN_SECRET=[redacted]
```

Blocking concern:

- `APP_ENV=production` is set on the target host.
- LINE and AI safe-mode flags were not present in the observed sanitized env output.
- The database name does not clearly identify itself as staging.

Because this target is production-like, the run stopped before `npm run migrate`, `npm run seed:demo`, or any service restart.

## HTTP Checks

Manual HTTP checks from local machine:

```text
GET https://beauty.flowbiz.cloud/           -> 200
GET https://beauty.flowbiz.cloud/admin      -> 200
GET https://beauty.flowbiz.cloud/api/live   -> 404
GET https://beauty.flowbiz.cloud/api/ready  -> 404
GET https://beauty.flowbiz.cloud/api/health -> 200
```

Interpretation:

- Public and admin web routes are reachable.
- The old `/api/health` route is reachable.
- Phase 8 readiness endpoints `/api/live` and `/api/ready` are not available on the deployed release.
- This prevents a Phase 8/9-compliant live staging smoke pass.

## Smoke Command Result

Command:

```powershell
$env:BASE_URL="https://beauty.flowbiz.cloud"
$env:API_BASE_URL="https://beauty.flowbiz.cloud/api"
$env:EXPECT_DEMO_DATA="true"
$env:LINE_REAL_SEND_ENABLED="false"
$env:AI_REAL_GENERATION_ENABLED="false"
npm run smoke:staging
```

Result:

```text
Staging smoke target web: https://beauty.flowbiz.cloud
Staging smoke target api: https://beauty.flowbiz.cloud/api
[PASS] external send flags - LINE real send and AI real generation are disabled
Smoke summary: FAIL - API readiness failed at https://beauty.flowbiz.cloud/api/ready: HTTP 404
```

## Commands Not Run

The following commands were intentionally not run on the remote host:

```text
npm run migrate
npm run seed:demo
npm run smoke:staging
systemctl restart flowbiz-client-beauty-api.service
systemctl restart flowbiz-client-beauty-web.service
```

Reasons:

- Target env reports `APP_ENV=production`.
- Target service runs as `root`.
- Target release lacks Phase 8/9 staging scripts and docs.
- Target DB name is not clearly staging-only.
- Running migration/seed could affect a production-like database.

## Required Fix Before Live Staging Smoke

Create or convert a safe staging target with:

- `APP_ENV=staging`
- staging-only `DATABASE_URL`
- env file outside repo
- non-root systemd user
- Phase 8/9 release deployed
- `LINE_INTEGRATION_MODE=simulated`
- `LINE_REAL_SEND_ENABLED=false`
- `AI_PROVIDER=mock`
- `AI_REAL_GENERATION_ENABLED=false`
- `/api/live` available
- `/api/ready` available and database-aware
- `npm run seed:demo` available
- `npm run smoke:staging` available

## Go/No-Go

Live smoke result: BLOCKED

Staging deploy on `beauty.flowbiz.cloud`: NO-GO until the target is confirmed staging-only or a separate staging host/database is provided.

Production deploy: NO-GO

Recommended next action:

1. Provision a staging-only database and env file.
2. Deploy the current Phase 8-10 release to a non-root staging service.
3. Confirm `/api/live` and `/api/ready`.
4. Run `npm run migrate`.
5. Run `npm run seed:demo`.
6. Run live `npm run smoke:staging`.
7. Update this report with PASS evidence.
