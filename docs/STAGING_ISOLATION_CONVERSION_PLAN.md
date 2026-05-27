# Staging Isolation Conversion Plan - FlowBiz Beauty

Date: 2026-05-27
Scope: Post-Phase 10 PR 5 - plan only, no live deploy
Target URL under review: `https://beauty.flowbiz.cloud/`
SSH target used for read-only inspection: `flowbiz-vps`

## Status

`PLAN_ONLY_NO_DEPLOY`

This document defines how to convert the current `beauty.flowbiz.cloud` target from a production-like deployment into a staging-safe environment. It does not approve deployment, migration, service restart, rollback, real LINE sending, real AI generation, or use of real customer data.

## Current Risk Summary

Read-only inspection found that the current target is not safe to treat as staging yet:

- The active service env reports `APP_ENV=production`.
- API and web systemd services run as `User=root`.
- The active release path is under `/opt/flowbiz/clients/flowbiz-client-beauty/current`.
- The active shared env file is `/opt/flowbiz/clients/flowbiz-client-beauty/shared/.env`.
- No `/etc/flowbiz/flowbiz-beauty-staging.env` file exists.
- The current database name does not clearly identify itself as staging.
- LINE and AI safe-mode flags were not present in the sanitized remote env output.
- The deployed release predates the Phase 8/9 readiness work.
- `/api/live` and `/api/ready` return 404 on the current deployment.
- Docker shows an existing `flowbiz-beauty-postgres` container publishing port 5432 broadly on the host.

Because of these findings, the current target remains `NO-GO` for staging smoke until isolation is completed.

## Current Production-Like Findings

Sanitized remote facts from read-only inspection:

| Area | Current finding | Risk |
| --- | --- | --- |
| Service user | `root` | Over-privileged service execution |
| Service env | `NODE_ENV=production`, `APP_ENV=production` | Not a staging contract |
| Env file | shared `.env` in current release tree | Env separation is unclear |
| Staging env file | missing | Phase 8 staging contract not installed |
| Database name | `flowbiz_beauty` | Not clearly staging-only |
| Release | old deployed release | Missing `/live`, `/ready`, `seed:demo`, smoke script |
| Public health | `/api/health` returns 200 | Legacy health only |
| Readiness | `/api/ready` returns 404 | Cannot gate staging |
| LINE safety flags | not observed | Must be explicitly set before staging |
| AI safety flags | not observed | Must be explicitly set before staging |

## Target Staging Architecture

Target staging should use the existing modular monolith architecture:

- Domain: `beauty.flowbiz.cloud` only after owner confirms it is the staging domain.
- API service: Node process bound to localhost, for example `127.0.0.1:8103`.
- Web service: Node process bound to localhost, for example `127.0.0.1:8104`.
- Reverse proxy: nginx routes `/api/` to API and `/` to web.
- Service user: non-root `flowbiz` or another approved unprivileged account.
- Env file: `/etc/flowbiz/flowbiz-beauty-staging.env`, outside the repo.
- Database: dedicated staging PostgreSQL database with staging-only user and storage path.
- Release path: isolated staging release tree or a clearly converted release tree after backup.
- Demo seed: allowed only after database isolation is verified.
- LINE: simulated by default.
- AI: mock by default.

Do not convert the current target in place until the owner confirms whether any current data or service behavior must be preserved.

## Recommended Isolation Strategy

Preferred approach:

1. Freeze the current target as a production-like artifact.
2. Create a staging-specific env file outside the repo.
3. Create a staging-only database and user.
4. Create or confirm a non-root service account.
5. Deploy the current Phase 8-10 release into a staging release path.
6. Install separate staging systemd units or safely replace old units only after approval.
7. Point nginx to the staging API/web ports.
8. Run migration against the staging-only database.
9. Seed demo data.
10. Run live staging smoke.

Alternative approach:

- Provision a new hostname for staging and leave `beauty.flowbiz.cloud` untouched until the staging flow passes.

The preferred approach is acceptable only if `beauty.flowbiz.cloud` is officially designated as staging.

## Staging Service Layout Recommendation

Recommended final layout:

```text
/opt/flowbiz/clients/flowbiz-client-beauty-staging/
  repo/
  releases/
  current -> releases/<release-id>
  shared/

/etc/flowbiz/flowbiz-beauty-staging.env
/var/backups/flowbiz-beauty-staging/
/var/log/nginx/flowbiz-beauty-staging-access.log
/var/log/nginx/flowbiz-beauty-staging-error.log
```

Recommended systemd units:

- `flowbiz-beauty-api-staging.service`
- `flowbiz-beauty-web-staging.service`

Required service properties:

- `User=flowbiz`
- `Group=flowbiz`
- `EnvironmentFile=/etc/flowbiz/flowbiz-beauty-staging.env`
- `NoNewPrivileges=true`
- `PrivateTmp=true`
- no inline secrets

## Database Isolation Checklist

Before migration or seed:

- Confirm target database name contains a staging marker.
- Confirm database user is staging-only.
- Confirm storage path is staging-only.
- Confirm backup directory is outside the repo.
- Confirm current production-like database is not reused.
- Confirm `DATABASE_URL` in the staging env points only to the staging database.
- Confirm `pg_dump` backup exists before any schema change.
- Confirm rollback is restore-from-backup, not automatic destructive rollback.

## Nginx And Site Separation

Target nginx should:

- Use the approved staging hostname.
- Proxy `/api/` to staging API localhost port.
- Proxy `/` to staging web localhost port.
- Write staging-specific access and error logs.
- Keep TLS certificate paths explicit for the staging hostname.
- Preserve security headers.
- Avoid mixing staging and production-like upstream names.

If the same domain is converted, capture the old nginx config before replacement and record the exact rollback file.

## Safe Env Separation

Required staging defaults:

```text
APP_ENV=staging
LINE_INTEGRATION_MODE=simulated
LINE_REAL_SEND_ENABLED=false
AI_PROVIDER=mock
AI_REAL_GENERATION_ENABLED=false
GEMINI_API_KEY=
OPENAI_API_KEY=
LINE_CHANNEL_ACCESS_TOKEN=
LINE_CHANNEL_SECRET=
```

All non-placeholder secrets must live outside the repo. Provider keys must stay empty for the initial staging smoke.

## Conversion Phases

### Phase A - Approval Gate

- Confirm domain ownership and intended staging use.
- Confirm no real customer data is required.
- Confirm no real provider send/generation is required.
- Confirm rollback owner and decision owner.

### Phase B - Host Preparation

- Create non-root service user if missing.
- Create `/etc/flowbiz/`.
- Create staging backup directory.
- Create staging release root.
- Create staging database/user/storage.

### Phase C - Release Preparation

- Checkout approved commit.
- Install dependencies.
- Build web assets from the release commit.
- Validate without touching live services.

### Phase D - Migration And Demo Seed

- Back up staging database.
- Run `npm run migrate` with staging env.
- Run `npm run seed:demo` only after staging database is confirmed.

### Phase E - Service Cutover

- Install staging systemd units.
- Validate nginx config.
- Restart only the staging units after explicit approval.
- Do not restart old production-like units unless the owner approves replacement.

### Phase F - Smoke And Evidence

- Check `/api/live`.
- Check `/api/ready`.
- Run `npm run smoke:staging`.
- Manually verify demo login, HITL queue, audit log, LINE simulated, and AI mock.
- Update `docs/STAGING_LIVE_SMOKE_REPORT.md`.

## Stop Conditions

Stop immediately if:

- The target database cannot be proven staging-only.
- The owner cannot confirm the domain is staging.
- Current live data must be preserved but no backup exists.
- Any real LINE send is requested during conversion.
- Any real AI generation is requested during conversion.
- Service changes require running as root in the final state.
- `/api/ready` is unhealthy after deploy.
- Auth, tenant, HITL, AI, LINE, audit, or readiness tests fail.

## Go/No-Go

| Gate | Decision |
| --- | --- |
| Use current target as staging today | NO-GO |
| Create isolated staging env on same host | GO with owner approval |
| Migrate current production-like database | NO-GO |
| Seed demo data into staging-only database | GO after isolation |
| Enable real LINE or real AI | NO-GO for this conversion |
| Run live smoke after isolation | GO after deployment checklist passes |

## Residual Risks

- The current host contains many other running services, so port and nginx changes need extra care.
- A `flowbiz` non-root user was not observed in read-only inspection output and may need creation.
- The existing PostgreSQL container exposes host port 5432 broadly; staging should prefer localhost-bound or internal-only exposure where possible.
- The remote release is old; deploying the current release may surface migration differences that require backup-first handling.
- Real provider credentials exist locally outside the repo but must not be used until the real integration gate is approved.
