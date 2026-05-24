# FlowBiz Infrastructure

This project uses PostgreSQL 16 for deterministic local development infrastructure.

## Prerequisites

- Windows with PowerShell
- Docker Desktop installed and available on the command line
- Docker Compose support through `docker compose`
- The project root at `D:\FlowBiz\flowbiz-client-beauty`

## Paths

- Project root: `D:\FlowBiz\flowbiz-client-beauty`
- Docker Compose file: `D:\FlowBiz\flowbiz-client-beauty\infra\docker\docker-compose.yml`
- PostgreSQL runtime data: `D:\FlowBiz\data\flowbiz-client-beauty\postgres`
- Exported log files: `D:\FlowBiz\data\flowbiz-client-beauty\logs`
- Backups: `D:\FlowBiz\backups\flowbiz-client-beauty`

PostgreSQL data is stored on `D:` through a bind mount. It is not stored on `C:` and does not depend on anonymous Docker volumes.

## Configure environment

Copy `.env.example` to `.env` in the project root.

PowerShell:

```powershell
Copy-Item D:\FlowBiz\flowbiz-client-beauty\.env.example D:\FlowBiz\flowbiz-client-beauty\.env
```

## Start PostgreSQL

```powershell
& D:\FlowBiz\flowbiz-client-beauty\scripts\dev-up.ps1
```

## Stop PostgreSQL

```powershell
& D:\FlowBiz\flowbiz-client-beauty\scripts\dev-down.ps1
```

## Verify database health

```powershell
& D:\FlowBiz\flowbiz-client-beauty\scripts\db-health.ps1
```

## View and export logs

```powershell
& D:\FlowBiz\flowbiz-client-beauty\scripts\db-logs.ps1
```

This script writes a timestamped log export under `D:\FlowBiz\data\flowbiz-client-beauty\logs`.

## Create a backup

```powershell
& D:\FlowBiz\flowbiz-client-beauty\scripts\db-backup.ps1
```

This script writes a timestamped `.sql` backup under `D:\FlowBiz\backups\flowbiz-client-beauty`.