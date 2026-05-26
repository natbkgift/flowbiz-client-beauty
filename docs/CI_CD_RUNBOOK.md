# CI/CD Runbook - FlowBiz Beauty

Phase: 9 - CI/CD hardening
Date: 2026-05-26

## CI Purpose

GitHub Actions is the merge gate for FlowBiz Beauty. It validates migrations, build output, safety-critical tests, staging smoke dry-run, and staging compose configuration before changes reach `main`.

CI does not deploy production or staging.

## Workflow

Workflow file:

- `.github/workflows/ci.yml`

Triggers:

- Pull requests targeting `main`
- Pushes to `main`

Primary job:

- `validate-test-and-smoke`

## CI Steps

The job runs:

1. Checkout repository.
2. Setup Node.js 22.
3. Install dependencies with `npm ci`.
4. Start PostgreSQL 16 service container.
5. Wait for PostgreSQL readiness with `pg_isready`.
6. Run `npm run migrate`.
7. Run `npm run validate`.
8. Run `npm run build:web`.
9. Run full `npm test`.
10. Validate staging compose config.
11. Run `npm run smoke:staging` with `SMOKE_DRY_RUN=true`.

## Required Env

CI sets safe local-only values:

```bash
APP_ENV=test
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/flowbiz_beauty_test
AUTH_TOKEN_SECRET=ci-auth-token-secret
INVITE_TOKEN_SECRET=ci-invite-token-secret
LINE_INTEGRATION_MODE=simulated
LINE_REAL_SEND_ENABLED=false
AI_PROVIDER=mock
AI_REAL_GENERATION_ENABLED=false
GEMINI_API_KEY=
OPENAI_API_KEY=
SMOKE_DRY_RUN=true
```

No GitHub repository secret is required for the main CI gate.

## Safety Defaults

- LINE is simulated.
- LINE real send is disabled.
- AI provider is mock.
- AI real generation is disabled.
- Database is a disposable CI PostgreSQL service.
- No production domain is configured.
- No deploy step exists.

## Local Equivalent

Run these before opening or updating a PR:

```powershell
npm run migrate
npm run validate
npm run build:web
npm test
$env:SMOKE_DRY_RUN="true"; npm run smoke:staging; Remove-Item Env:\SMOKE_DRY_RUN
docker compose --env-file .env.example -f infra/docker/docker-compose.staging.yml config
```

Use a local PostgreSQL database through `.env` before running migration and tests.

## Safety-Critical Coverage

`npm test` is the main coverage gate and includes:

- Auth/session tests
- Tenant, workspace, and RBAC tests
- Audit isolation tests
- AI/HITL no-auto-send tests
- HITL approval contract tests
- LINE simulated and fail-closed real-mode tests
- LLM mock and fail-closed real-mode tests
- Health/readiness tests
- Automation, worker, event bus, campaign, customer, analytics, blog/forum, and SEO tests

## Demo Seed Policy

CI does not run `npm run seed:demo` in the main gate.

Reason:

- Demo seed is a sales/staging data preparation step, not a merge requirement.
- It mutates the test database with presentation data that can make unrelated test failure analysis noisier.
- The script remains validated through syntax/build gates and should be run in staging using the Phase 7 and Phase 8 runbooks.

Staging deployment validation should run:

```bash
npm run seed:demo
npm run smoke:staging
```

## Smoke Test Behavior

CI runs smoke in dry-run mode:

```bash
SMOKE_DRY_RUN=true npm run smoke:staging
```

This verifies the smoke script and external-send safety flags without requiring a live web/API server inside CI. Live smoke belongs to the staging deployment gate after services are running.

## Migration Failure Handling

If `npm run migrate` fails:

- Stop the PR merge.
- Check whether the migration is forward-only and non-destructive.
- Reproduce locally on a fresh database.
- Do not manually edit CI database state to force green.
- Add migration tests or a forward-fix migration if needed.

## Test Failure Handling

Treat failures in these areas as release blockers:

- Auth/session
- Tenant isolation
- RBAC
- Audit trail
- AI/HITL no-auto-send
- LINE fail-closed behavior
- LLM fail-closed behavior
- Medical safety
- Health/readiness

For flaky failures, reproduce with the exact failing test file and inspect database setup before retrying.

## What CI Does Not Do

CI does not:

- Deploy staging or production.
- Push commits or merge PRs automatically.
- Use production credentials.
- Use real LINE credentials.
- Use OpenAI or Gemini credentials.
- Enable LINE real-send mode.
- Enable AI real-generation mode.
- Restore or rollback databases.

## Future Improvements

- Split full tests into safety-focused matrix shards if runtime becomes too high.
- Add PR checklist enforcement for summary, risk, validation, and residual risk.
- Upload test logs as artifacts on failure.
- Add migration dry-run against an empty database and an upgraded seeded database.
- Add live staging smoke as a separate manually triggered workflow after staging deployment exists.
