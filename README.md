# FlowBiz Beauty

FlowBiz Beauty is an AI Marketing and Revenue Automation Layer for aesthetic clinics.

It helps clinics reduce missed lead follow-up, standardize staff response workflows, recover no-shows, request reviews, and surface Botox/Filler repeat-treatment opportunities. AI is used to draft operational and marketing suggestions, but customer-facing AI-generated messages must be reviewed and approved by staff before outbound delivery.

This repository is currently prepared for MVP demo, friendly pilot conversations, staging preparation, and CI-gated development. It is not cleared for production deployment yet.

## Current Positioning

FlowBiz Beauty is designed for clinic revenue operations:

- New lead response and follow-up visibility
- Uncontacted lead alerts
- AI-assisted message drafting with Human-In-The-Loop approval
- No-show recovery workflows
- Review request workflows
- Botox/Filler repeat reminder workflows
- Audit trail and RBAC for operational control
- Staging and CI readiness foundations

The core product sentence:

FlowBiz Beauty helps aesthetic clinics turn inquiries, no-shows, reviews, and repeat-treatment cycles into a controlled revenue workflow, with AI helping staff draft messages but never sending medical or marketing content without human approval.

## What FlowBiz Beauty Is

- AI Marketing and Revenue Automation Layer
- MVP demo and pilot workflow system for beauty/aesthetic clinics
- Modular monolith backend with PostgreSQL
- React/esbuild frontend
- Tenant-aware SaaS foundation with RBAC and audit trail
- HITL-first AI suggestion workflow
- Simulated/default integration foundation for LINE and LLM providers
- Staging-ready package after live smoke validation

## What FlowBiz Beauty Is Not

- Not an EMR or medical record system
- Not a full doctor scheduling system
- Not an inventory system
- Not a payment processing system
- Not a full CRM replacement on day one
- Not a medical diagnosis or treatment-advice engine
- Not an AI auto-reply system that sends customer-facing messages without staff approval
- Not production deployment cleared without further staging, consent, integration, monitoring, and support validation

## MVP Workflows

The MVP scope is locked to these 8 workflows:

1. New Lead Welcome
2. Uncontacted Lead Alert
3. Lead Qualification Nurture
4. No-Show Recovery
5. Review Request
6. Botox Cycle Reminder
7. Filler Cycle Reminder
8. Daily Marketing Reminder

See [docs/MVP_SCOPE_LOCK.md](docs/MVP_SCOPE_LOCK.md) for the full product contract.

## Safety Model

FlowBiz Beauty treats AI as a controlled assistant:

- AI drafts suggestions.
- Staff approves, rejects, or modifies suggestions.
- AI-generated customer-facing messages cannot move to outbound unless approved or modified by staff.
- Rejected AI suggestions cannot be sent.
- Modified approvals preserve original and edited text.
- Medical-risk text is labelled for careful review.
- Approval actions are auditable with clinic/workspace context, approver, risk label, and timestamps.

See [docs/HITL_APPROVAL_CONTRACT.md](docs/HITL_APPROVAL_CONTRACT.md) and [docs/AI_MEDICAL_SAFETY_POLICY.md](docs/AI_MEDICAL_SAFETY_POLICY.md).

## LINE And AI Integration Status

Current safe defaults:

- LINE integration mode defaults to simulated.
- LINE real outbound is not active by default.
- AI provider defaults to mock.
- Real OpenAI/Gemini generation is not active by default.
- Real integrations require separate staging test plan, credentials outside the repo, explicit environment configuration, HITL preservation, and QA.

Do not commit secrets. Do not use production credentials in local or staging env files.

Relevant docs:

- [docs/LINE_INTEGRATION_RUNBOOK.md](docs/LINE_INTEGRATION_RUNBOOK.md)
- [docs/AI_PROVIDER_INTEGRATION_RUNBOOK.md](docs/AI_PROVIDER_INTEGRATION_RUNBOOK.md)

## Project Structure

- `apps/api`: Node.js modular monolith API
- `apps/web`: React/esbuild admin and public web app
- `database/migrations`: PostgreSQL migrations
- `database/seeds`: base seed data
- `scripts`: migration, seed, validation, smoke, and local infra helpers
- `infra`: Docker, nginx, systemd, deploy, and rollback examples
- `docs`: audit, scope, safety, staging, CI, demo, and sales documents
- `tests` and `apps/api/tests`: Node test runner suites

## Prerequisites

- Node.js 22+
- npm 10+
- Docker Desktop or Docker Engine with Docker Compose
- PostgreSQL 16 for local/staging database

## Local Setup

Install dependencies:

```powershell
npm install
```

Copy environment example:

```powershell
Copy-Item .env.example .env
```

Start local PostgreSQL:

```powershell
& .\scripts\dev-up.ps1
```

Run migrations and base seeds:

```powershell
npm run migrate
npm run seed
```

Start API:

```powershell
npm run dev:api
```

Start web app in another terminal:

```powershell
npm run dev:web
```

Default local URLs:

- API: `http://localhost:3001`
- Web: `http://localhost:4173`

Health endpoints:

- `GET /live`: process liveness
- `GET /ready`: readiness with database connectivity
- `GET /health`: readiness alias for compatibility

## Demo Seed

The demo clinic seed is separate from base seed data:

```powershell
npm run seed:demo
```

Demo tenant details:

- Clinic slug: `flowbiz-beauty-demo`
- Workspace slug: `beauty-revenue`
- Owner: `owner.demo@flowbiz.local`
- Admin: `admin.demo@flowbiz.local`
- Operator: `operator.demo@flowbiz.local`
- Demo password: `DemoPass123!`

This credential is for local/demo use only. Do not create it in production.

See [docs/DEMO_CLINIC_SCRIPT.md](docs/DEMO_CLINIC_SCRIPT.md).

## Staging Readiness Commands

Staging is prepared through docs and scripts, but an actual staging host still needs live smoke validation.

Validate staging compose config:

```powershell
docker compose --env-file .env.example -f infra/docker/docker-compose.staging.yml config
```

Dry-run smoke test without running services:

```powershell
$env:SMOKE_DRY_RUN="true"
npm run smoke:staging
Remove-Item Env:\SMOKE_DRY_RUN
```

Live staging smoke after services are deployed:

```powershell
$env:BASE_URL="https://staging.example.invalid"
$env:API_BASE_URL="https://staging.example.invalid/api"
$env:EXPECT_DEMO_DATA="true"
npm run smoke:staging
```

Recommended staging flow:

```powershell
npm ci
npm run build:web
npm run migrate
npm run validate
npm test
npm run seed:demo
npm run smoke:staging
```

See [docs/STAGING_DEPLOYMENT_RUNBOOK.md](docs/STAGING_DEPLOYMENT_RUNBOOK.md) and [docs/ROLLBACK_PROCEDURE.md](docs/ROLLBACK_PROCEDURE.md).

## CI Validation Commands

Local equivalent of the CI gate:

```powershell
npm run migrate
npm run validate
npm run build:web
npm test
$env:SMOKE_DRY_RUN="true"; npm run smoke:staging; Remove-Item Env:\SMOKE_DRY_RUN
docker compose --env-file .env.example -f infra/docker/docker-compose.staging.yml config
```

GitHub Actions runs the main gate with:

- Node.js 22
- PostgreSQL 16 service container
- Migration check
- Web build
- Full test suite
- Staging compose validation
- Smoke dry-run
- Safe LINE/AI environment defaults

See [docs/CI_CD_RUNBOOK.md](docs/CI_CD_RUNBOOK.md).

## Sales And Pilot Docs

Sales package:

- [docs/SALES_PACKAGE/ONE_PAGE_PITCH.md](docs/SALES_PACKAGE/ONE_PAGE_PITCH.md)
- [docs/SALES_PACKAGE/PRICING_PACKAGES.md](docs/SALES_PACKAGE/PRICING_PACKAGES.md)
- [docs/SALES_PACKAGE/FLOWBIZ_VS_CRM.md](docs/SALES_PACKAGE/FLOWBIZ_VS_CRM.md)
- [docs/SALES_PACKAGE/ROI_CALCULATOR_SPEC.md](docs/SALES_PACKAGE/ROI_CALCULATOR_SPEC.md)
- [docs/SALES_PACKAGE/DEMO_VIDEO_SCRIPT.md](docs/SALES_PACKAGE/DEMO_VIDEO_SCRIPT.md)
- [docs/SALES_PACKAGE/OBJECTION_HANDLING.md](docs/SALES_PACKAGE/OBJECTION_HANDLING.md)
- [docs/SALES_PACKAGE/PILOT_CUSTOMER_PLAN.md](docs/SALES_PACKAGE/PILOT_CUSTOMER_PLAN.md)
- [docs/SALES_PACKAGE/SALES_CALL_SCRIPT.md](docs/SALES_PACKAGE/SALES_CALL_SCRIPT.md)
- [docs/SALES_PACKAGE/GO_TO_MARKET_CHECKLIST.md](docs/SALES_PACKAGE/GO_TO_MARKET_CHECKLIST.md)

Final execution report:

- [docs/FLOWBIZ_BEAUTY_FINAL_EXECUTION_REPORT.md](docs/FLOWBIZ_BEAUTY_FINAL_EXECUTION_REPORT.md)

## Go/No-Go Status

| Area | Status |
| --- | --- |
| Internal demo | GO |
| Friendly pilot demo | GO with limitations |
| Staging deploy | GO after live smoke |
| Production deploy | NO-GO until live staging validation, consent/PDPA, real integration QA, monitoring, and support process are complete |
| Paid customer onboarding | CONDITIONAL after pilot metrics, operational acceptance, and integration scope are confirmed |

## Residual Risks And Next Steps

Known residual risks:

- Live staging smoke has not been executed in this repository state.
- Real LINE outbound requires integration wiring, credentials outside repo, provider QA, and HITL preservation.
- Real OpenAI/Gemini generation requires provider QA and approved environment setup.
- Consent/PDPA, data retention, and production support process need dedicated work.
- Customer-level and broadcast-level HITL may need broader generalized workflow beyond the current lead-scoped queue.
- Production observability, incident response, and backup restore drill remain future work.

Recommended next PRs:

1. Run and document first live staging deployment smoke.
2. Add consent/PDPA and data retention workflow.
3. Add live integration QA plan for LINE and AI providers.
4. Expand HITL beyond lead-scoped AI suggestions.
5. Add production observability and incident runbook.
6. Build final pilot report template and ROI calculator spreadsheet.
