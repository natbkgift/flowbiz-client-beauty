# Staging Disk Recovery Report - FlowBiz Beauty

Date: 2026-05-27
Scope: Post-Phase 10 PR 8A - staging disk recovery and readiness restore
Staging URL: `https://beauty.flowbiz.cloud/`
API base URL: `https://beauty.flowbiz.cloud/api`
SSH target: `flowbiz-vps`
Operator: Codex

## Status

PASS

The staging host has been restored after the PR 8 disk-full blocker. The root filesystem now has enough free space, the staging PostgreSQL container is running and healthy, `/api/ready` returns 200, staging smoke passes, and the targeted safety suite passes on the staging database when app background services are paused during the test run.

No Gemini key, LINE token, LINE secret, production database, production secret, real customer data, production deploy, real LINE send, or real AI generation was used.

## Before Disk Usage

Initial blocked state from the PR 8 recovery attempt:

```text
Filesystem      Size  Used Avail Use% Mounted on
/dev/sda1       193G  193G     0 100% /
```

Staging PostgreSQL state during the blocker:

```text
flowbiz-beauty-postgres-staging Exited (1)
```

Readiness during the blocker:

```text
GET https://beauty.flowbiz.cloud/api/ready -> 503
database.status: unavailable
database.message: connect ECONNREFUSED 127.0.0.1:55432
```

Main disk pressure found during diagnosis:

```text
/opt: 170G
/var: 14G
/root: 1.6G
/tmp: 429M
```

Large non-FlowBiz-Beauty paths were inspected without deletion:

```text
/opt/backups/flowbiz-dhamma: 126G
/opt/flowbiz-client-dhamma/data: 33G
```

## Cleanup Actions

Safe cleanup actions already performed during the first recovery attempt:

- removed npm cache and npm logs
- ran systemd journal vacuum
- ran Docker builder cache cleanup
- ran dangling Docker image cleanup only
- removed old `/tmp` files older than one day
- removed non-current old FlowBiz Beauty `node_modules` directories

No database volume, backup, current symlink, staging env file, provider credential, or current release path was deleted.

The owner then expanded available disk capacity before this rerun.

## After Disk Usage

After capacity was added and staging PostgreSQL was restored:

```text
Filesystem      Size  Used Avail Use% Mounted on
/dev/sda1       193G   90G  104G  47% /
```

Docker storage after restore:

```text
Images: 9.602GB total, 9.602GB reclaimable
Containers: 58.54MB total
Local volumes: 450.2MB total, 120.4MB reclaimable
Build cache: 0B total
```

The staging PostgreSQL data path remained intact and was not deleted.

## Containers Affected

The previous stopped staging PostgreSQL container was missing after the image cleanup/capacity-change window, so the staging PostgreSQL service was recreated through the existing staging Compose file:

```text
docker compose --env-file /etc/flowbiz/flowbiz-beauty-staging.env -f infra/docker/docker-compose.staging.yml up -d postgres
```

The required `postgres:16` image was pulled again, then the staging container started successfully:

```text
flowbiz-beauty-postgres-staging   Up (healthy)
```

Final container status:

```text
flowbiz-beauty-postgres-staging   Up 12 minutes (healthy)   0.0.0.0:55432->5432/tcp
```

## DB Recovery Result

Staging database recovery succeeded.

Readiness confirms the API can connect to the staging database:

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

PostgreSQL logs reported crash recovery after the previous disk-full failure, then completed automatic recovery and accepted connections. This is recorded as a residual risk because the log included a corruption warning before recovery completed.

No restore from backup, migration, or demo reseed was required during this recovery rerun.

## Health Results

Public checks through nginx after recovery:

```text
GET https://beauty.flowbiz.cloud/api/live  -> 200
GET https://beauty.flowbiz.cloud/api/ready -> 200
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

## Smoke Result

Staging smoke after recovery:

```text
npm run smoke:staging: PASS
checks recorded: 8
```

Checks passed:

- external send flags disabled
- API readiness
- web `/`
- web `/admin`
- admin bundle
- public bundle
- invalid login rejection
- demo clinic visibility

## Targeted Safety Tests

First two targeted safety attempts on staging after DB recovery hit a repeat PostgreSQL deadlock during test cleanup:

```text
failure: deadlock detected
query: delete from clinics where id = $1
```

PostgreSQL logs showed concurrent app background activity touching automation, event, worker, and analytics records for the same test fixtures during teardown.

Controlled mitigation:

- stopped only the staging API and web services before the targeted test run
- ran the targeted safety suite against the staging database
- restarted the staging API and web services immediately through a shell trap
- verified services, readiness, and smoke after restart

Targeted suite result with app background services paused:

```text
node -r ./teardown-hook.js --test --test-force-exit --test-concurrency=1 tests/ai_provider_integration.test.js tests/hitl_approval_contract.test.js tests/line_integration.test.js tests/pre_phase10_safety_unit.test.js
tests: 16
pass: 16
fail: 0
duration_ms: 122697.433071
```

Services after test:

```text
flowbiz-beauty-api-staging: active
flowbiz-beauty-web-staging: active
```

## Local Validation

Local repository validation for this report:

```text
git diff --check: PASS
npm run validate: PASS
npm test: PASS, 156 passed / 0 failed
safety scan: PASS
```

## Safety Confirmation

| Control | Result |
| --- | --- |
| Gemini key used | no |
| LINE token/secret used | no |
| Real LINE enabled | no |
| Real AI enabled | no |
| Production DB touched | no |
| Production deploy attempted | no |
| Real customer data used | no |
| DB volume deleted | no |
| Backups deleted | no |
| Current release deleted | no |

Final sanitized staging env remains safe:

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

## Decision

Staging disk recovery: PASS

The staging environment is healthy enough to retry the controlled real integration test window.

## Residual Risks

- PostgreSQL crash recovery completed, but logs included a data-corruption warning after the previous disk-full event. Monitor DB behavior closely and keep the pre-migration backup available.
- Targeted tests on the live staging database can deadlock if app background services are running. For future staging test windows, pause staging app services or use a dedicated test database.
- Staging PostgreSQL still publishes host port `55432`; firewall exposure should be reviewed.
- Docker images show reclaimable storage; cleanup should remain deliberate because the host runs other FlowBiz services.
- Real Gemini and real LINE live paths remain unproven because PR 8 was blocked before provider activation.

## Next Recommended PR

Retry Controlled Real Integration Test Window.
