# Staging Disk Recovery Report - FlowBiz Beauty

Date: 2026-05-27
Scope: Post-Phase 10 PR 8A - staging disk recovery and readiness restore
Staging URL: `https://beauty.flowbiz.cloud/`
API base URL: `https://beauty.flowbiz.cloud/api`
SSH target: `flowbiz-vps`
Operator: Codex

## Status

BLOCKED

The recovery window completed read-only diagnosis and safe cleanup, but staging readiness was not restored because the host still has less than 10GB free disk after allowed cleanup actions.

Per the stop condition, PostgreSQL was not restarted after cleanup because the host still had only about 725MB available on `/`. Restarting the staging database in this state risks another write failure.

No Gemini key, LINE token, LINE secret, production database, production secret, real customer data, production deploy, real LINE send, or real AI generation was used.

## Before Disk Usage

Initial filesystem state:

```text
Filesystem      Size  Used Avail Use% Mounted on
/dev/sda1       193G  193G     0 100% /
```

Staging PostgreSQL state:

```text
flowbiz-beauty-postgres-staging Exited (1)
```

Initial readiness after the PR 8 blocker:

```text
GET https://beauty.flowbiz.cloud/api/ready -> 503
database.status: unavailable
database.message: connect ECONNREFUSED 127.0.0.1:55432
```

Docker storage:

```text
Images: 9.627GB total, 8.61GB reclaimable
Containers: 58.51MB total
Local volumes: 450.1MB total, 120.4MB reclaimable
Build cache: 68.4MB total, 22.95MB reclaimable
```

Major disk users:

```text
/opt: 170G
/var: 14G
/root: 1.6G
/tmp: 429M
```

Major `/opt` users:

```text
/opt/backups: 126G
/opt/flowbiz-client-dhamma: 37G
/opt/flowbiz: 7.6G
```

Large inspected backup path:

```text
/opt/backups/flowbiz-dhamma: 126G
```

Backup files inspected without deletion:

```text
2026-05-17 data_20260517.tar.gz 12.4GB
2026-05-18 data_20260518.tar.gz 12.4GB
2026-05-19 data_20260519.tar.gz 14.0GB
2026-05-20 data_20260520.tar.gz 14.1GB
2026-05-21 data_20260521.tar.gz 14.2GB
2026-05-22 data_20260522.tar.gz 14.2GB
2026-05-23 data_20260523.tar.gz 14.2GB
2026-05-24 data_20260524.tar.gz 14.2GB
2026-05-25 data_20260525.tar.gz 12.3GB
2026-05-26 data_20260526.tar.gz 12.3GB
```

Large non-FlowBiz-Beauty data path inspected without deletion:

```text
/opt/flowbiz-client-dhamma/data: 33G
/opt/flowbiz-client-dhamma/data/voiceovers: 25G
/opt/flowbiz-client-dhamma/data/cache: 7.7G
```

## Cleanup Actions

Safe cleanup actions performed:

1. Attempted `npm cache clean --force`.
   - The command hit `ENOSPC` while writing npm log output.
   - Manual cache cleanup later removed `/root/.npm/_cacache` and `/root/.npm/_logs`.

2. Ran systemd journal vacuum:

```text
journalctl --vacuum-time=7d
```

Result:

```text
freed 0B
```

3. Ran Docker builder cache cleanup:

```text
docker builder prune -f
```

Result:

```text
about 22.95MB selected
```

4. Ran dangling Docker image cleanup only:

```text
docker image prune -f
```

Result:

```text
about 205.5kB reclaimed
```

5. Removed old `/tmp` files older than one day.

6. Removed non-current old FlowBiz Beauty `node_modules` directories:

```text
/opt/flowbiz/clients/flowbiz-client-beauty/releases/20260525071237/node_modules
/opt/flowbiz/clients/flowbiz-client-beauty/releases/20260526084443/node_modules
/opt/flowbiz/clients/flowbiz-client-beauty/releases/20260526084841/node_modules
/opt/flowbiz/clients/flowbiz-client-beauty/releases/20260526095611/node_modules
/opt/flowbiz/clients/flowbiz-client-beauty/releases/20260526100343/node_modules
/opt/flowbiz/clients/flowbiz-client-beauty/repo/node_modules
```

Current staging release was not deleted:

```text
/opt/flowbiz/clients/flowbiz-client-beauty-staging/releases/20260527005135-7463c68
```

No database volume, backup, current symlink, staging env file, provider credential, or release current path was deleted.

## After Disk Usage

After allowed cleanup:

```text
Filesystem      Size  Used Avail Use% Mounted on
/dev/sda1       193G  192G  725M 100% /
```

Docker storage after cleanup:

```text
Images: 9.604GB total, 9.072GB reclaimable
Containers: 58.49MB total
Local volumes: 449.9MB total, 120.4MB reclaimable
Build cache: 45.45MB total, 0B reclaimable
```

Remaining dominant disk usage:

```text
/opt/backups: 126G
/opt/flowbiz-client-dhamma: 37G
/opt/flowbiz: 7.4G
```

## Containers Affected

No running containers were pruned.

`docker container prune` was intentionally not run because the stopped staging PostgreSQL container must be preserved:

```text
flowbiz-beauty-postgres-staging Exited (1)
```

Staging PostgreSQL was not restarted after cleanup because free disk remained below the 10GB recovery threshold.

## DB Recovery Result

DB recovery was not attempted after cleanup.

Reason:

- free disk remained about 725MB
- stop condition says to stop if free disk remains below 10GB after cleanup
- restarting PostgreSQL in this state risks another disk write failure

No DB volume was deleted. No restore was attempted. No migration was run.

## Health Results

Current readiness:

```text
GET https://beauty.flowbiz.cloud/api/ready -> 503
database.status: unavailable
database.message: connect ECONNREFUSED 127.0.0.1:55432
```

`/api/live` was not treated as sufficient because readiness depends on database connectivity.

## Smoke Result

Staging smoke remains blocked:

```text
npm run smoke:staging -> FAIL
reason: API readiness failed at https://beauty.flowbiz.cloud/api/ready: HTTP 503
```

## Targeted Safety Tests

Targeted safety tests were not rerun on staging after cleanup.

Reason:

- staging DB is still down
- `/api/ready` is still 503
- free disk remains below the 10GB stop threshold

Previously recorded local targeted safety tests passed in PR 8:

```text
tests: 30
pass: 30
fail: 0
```

## Local Validation

Local repository validation was run separately from staging recovery because this PR only adds the recovery report.

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

## Decision

Staging disk recovery: BLOCKED

The allowed cleanup targets were not enough to restore safe operating capacity. The host needs either:

1. volume expansion, or
2. explicit owner-approved backup/data retention cleanup for the non-FlowBiz-Beauty paths that dominate disk usage.

## Residual Risks

- `beauty.flowbiz.cloud/api/ready` remains unhealthy.
- Staging PostgreSQL remains stopped.
- Root filesystem remains at 100% usage.
- `/opt/backups/flowbiz-dhamma` uses 126GB and likely needs a retention policy.
- `/opt/flowbiz-client-dhamma/data` uses 33GB and needs service-owner review before cleanup.
- Docker has about 9GB reclaimable image space, but reclaiming it safely would require explicit approval to remove unused tagged images, not just dangling images.

## Next Recommended PR

Volume Expansion Or Cross-Service Backup Retention Cleanup, then Retry Controlled Real Integration Test Window.
