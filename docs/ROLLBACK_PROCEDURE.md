# Rollback Procedure - FlowBiz Beauty

Phase: 8 - Staging deployment readiness
Date: 2026-05-26

## Rollback Principle

Rollback should restore a known-good application release without deleting data automatically. Database rollback is treated as a controlled restore operation, not a blind script.

## Pre-Rollback Backup

Before changing application releases or database state:

```bash
mkdir -p /var/backups/flowbiz-beauty-staging
pg_dump "$DATABASE_URL" > "/var/backups/flowbiz-beauty-staging/pre-rollback-$(date +%Y%m%d-%H%M%S).sql"
```

Confirm the backup file is non-empty before proceeding.

## App Rollback

Preferred staging app rollback:

1. Identify the last known-good Git commit or release directory.
2. Stop API and web services.
3. Switch the `current` symlink to the known-good release directory, or check out the known-good commit in the staging release path.
4. Run `npm ci` if dependencies changed.
5. Run `npm run build:web`.
6. Restart API and web services.
7. Validate `/api/ready` and smoke test.

Do not run `git reset --hard` against an unclear working directory. Confirm the target path is the staging release path first.

## Database Rollback Policy

Migrations are forward-only by default. Do not attempt ad hoc down migrations unless a migration-specific rollback plan exists.

Allowed options:

- Restore the full pre-release database backup into a staging database.
- Apply a reviewed forward-fix migration.
- Rebuild staging from migrations and demo seed if the environment contains only disposable demo data.

Never run destructive SQL against a production database from the staging rollback path.

## Migration Rollback Warning

If a migration changed table constraints, required columns, or data shape, app rollback alone may not be enough. Stop and review compatibility before restarting the older app release.

Escalate if:

- Migration failure may have partially committed data.
- There is possible tenant isolation damage.
- HITL, audit, auth, or medical safety records may be inconsistent.
- Backup is missing or unverified.

## Generated Asset Rollback

Web assets should come from the selected release commit:

```bash
npm run build:web
```

Do not manually copy bundles from a workstation. If bundles mismatch source, rebuild from the release directory.

## Validation After Rollback

Run:

```bash
npm run validate
npm run smoke:staging
```

Then verify:

- `/api/live` returns 200.
- `/api/ready` returns 200 and DB status is connected.
- Admin page loads.
- Public page loads.
- Invalid login is rejected without 500.
- Demo login works if demo data is expected.
- LINE real send remains disabled.
- AI real generation remains disabled.

## When To Stop And Escalate

Stop rollback and escalate if:

- Backup cannot be created or verified.
- Target database is production or uncertain.
- Real LINE or real AI credentials are present unexpectedly.
- Auth, tenant, HITL, audit, AI safety, or LINE safety tests fail.
- Rollback requires deleting release folders, database volumes, or tenant data.
- Health/readiness remains unhealthy after app rollback.
