# FlowBiz Local Foundation

The repository now includes the Sprint 0 runnable baseline, the Sprint 1 multi-tenant foundation, the Sprint 2 Lead CRM core slice, the Sprint 3 messaging foundation, and the Sprint 4 automation engine foundation.

## What exists

- `apps/api`: minimal backend shell
- `apps/web`: minimal frontend placeholder
- `database/migrations`: SQL migration baseline
- `database/seeds`: SQL seed baseline
- `scripts`: migration, seed, and validation runners
- `infra/docker`: Docker Compose for PostgreSQL 16
- `infra/README.md`: local infrastructure guide
- `apps/api/src/modules`: minimal modular-monolith auth and tenancy foundation
- `apps/api/src/modules/leads`: tenant-safe Lead CRM core services and endpoints
- `apps/api/src/modules/messaging`: channels, templates, identities, outbound logs, and manual send flow
- `apps/api/src/modules/automation`: flow definitions, executions, tasks, reminders, and event-driven runtime

## Prerequisites

- Node.js 22+
- npm 10+
- Docker Desktop with Docker Compose support for PostgreSQL local infrastructure

## 1. Install dependencies

```bash
npm install
```

## 2. Configure environment

Copy `.env.example` to `.env` and adjust values only if needed.

PowerShell:

```powershell
Copy-Item .env.example .env
```

## 3. Start the database

Use the infrastructure scripts documented in `infra/README.md`.

PowerShell:

```powershell
& .\scripts\dev-up.ps1
```

## 4. Run migrations

```bash
npm run migrate
```

## 5. Run seeds

```bash
npm run seed
```

## Seeded Sprint 1 credentials

- clinic slug: `demo-clinic`
- owner user: `owner@flowbiz.local`
- staff user: `staff@flowbiz.local`
- password: `Flowbiz123!`

## 6. Start the backend

```bash
npm run dev:api
```

Backend health endpoint:

- `http://localhost:3001/health`

Sprint 1 auth endpoints:

- `POST http://localhost:3001/auth/login`
- `GET http://localhost:3001/auth/me`
- `GET http://localhost:3001/tenant-context`
- `POST http://localhost:3001/auth/logout`

Sprint 2 Lead CRM endpoints:

- `GET http://localhost:3001/leads`
- `POST http://localhost:3001/leads`
- `GET http://localhost:3001/leads/:leadId`
- `PATCH http://localhost:3001/leads/:leadId`
- `POST http://localhost:3001/leads/:leadId/notes`
- `POST http://localhost:3001/leads/:leadId/owner`
- `POST http://localhost:3001/leads/:leadId/stage-status`

Sprint 3 Messaging endpoints:

- `GET http://localhost:3001/channels`
- `POST http://localhost:3001/channels`
- `GET http://localhost:3001/contact-identities?entityType=lead&entityId=:id`
- `POST http://localhost:3001/contact-identities`
- `GET http://localhost:3001/templates`
- `POST http://localhost:3001/templates`
- `PATCH http://localhost:3001/templates/:templateId`
- `GET http://localhost:3001/messages/outbound`
- `POST http://localhost:3001/leads/:leadId/messages`

Sprint 4 Automation endpoints:

- `GET http://localhost:3001/automation/flows`
- `POST http://localhost:3001/automation/flows`
- `POST http://localhost:3001/automation/flows/:flowId/steps`
- `POST http://localhost:3001/automation/flows/:flowId/status`
- `GET http://localhost:3001/automation/executions`
- `GET http://localhost:3001/automation/tasks`
- `GET http://localhost:3001/reminders`
- `POST http://localhost:3001/automation/events`

Example login body:

```json
{
	"email": "owner@flowbiz.local",
	"password": "Flowbiz123!",
	"clinicSlug": "demo-clinic"
}
```

## 7. Start the frontend placeholder

In a second terminal:

```bash
npm run dev:web
```

Frontend placeholder:

- `http://localhost:4173`

## 8. Run validation commands

```bash
npm run validate
npm test
```

## Supported command contract

- `& .\scripts\dev-up.ps1`: start PostgreSQL infrastructure
- `& .\scripts\dev-down.ps1`: stop PostgreSQL infrastructure
- `& .\scripts\db-health.ps1`: verify PostgreSQL health
- `& .\scripts\db-logs.ps1`: export PostgreSQL logs to `D:\FlowBiz\data\flowbiz-client-beauty\logs`
- `& .\scripts\db-backup.ps1`: write a PostgreSQL backup to `D:\FlowBiz\backups\flowbiz-client-beauty`
- `npm run migrate`: execute SQL migrations
- `npm run seed`: execute SQL seeds
- `npm run dev:api`: start the backend shell
- `npm run dev:web`: start the frontend placeholder
- `npm run validate`: validate scaffold integrity and JavaScript syntax
- `npm test`: run the minimal baseline test

## Scope guardrails

The current implementation is intentionally limited to Sprint 2 Lead CRM scope.

Not included yet:

- AI integrations
- Redis/workers
- analytics
- external services
