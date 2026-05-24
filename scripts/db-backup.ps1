$ErrorActionPreference = 'Stop'

$projectRoot = 'D:\FlowBiz\flowbiz-client-beauty'
$composeDir = Join-Path $projectRoot 'infra\docker'
$composeFile = Join-Path $composeDir 'docker-compose.yml'
$envFile = Join-Path $projectRoot '.env'
$envExampleFile = Join-Path $projectRoot '.env.example'
$backupRoot = 'D:\FlowBiz\backups\flowbiz-client-beauty'
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupFile = Join-Path $backupRoot ("flowbiz-postgres-$timestamp.sql")

function Resolve-DockerCommand {
  $dockerCommand = Get-Command docker -ErrorAction SilentlyContinue

  if ($dockerCommand) {
    return $dockerCommand.Source
  }

  $fallback = 'C:\Program Files\Docker\Docker\resources\bin\docker.exe'

  if (Test-Path $fallback) {
    return $fallback
  }

  throw 'Docker CLI is unavailable. Install Docker Desktop and ensure docker.exe is available.'
}

$dockerPath = Resolve-DockerCommand
$dockerBinDir = Split-Path -Parent $dockerPath
$env:PATH = "$dockerBinDir;$env:PATH"

if (-not (Test-Path $composeFile)) {
  throw "Compose file not found at $composeFile"
}

if (-not (Test-Path $backupRoot)) {
  throw "Backup root not found at $backupRoot"
}

$selectedEnvFile = if (Test-Path $envFile) { $envFile } elseif (Test-Path $envExampleFile) { $envExampleFile } else { throw 'Neither .env nor .env.example exists in the project root.' }

$envMap = @{}
Get-Content $selectedEnvFile | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -notmatch '=') {
    return
  }

  $name, $value = $_ -split '=', 2
  $envMap[$name.Trim()] = $value.Trim()
}

Push-Location $composeDir
try {
  & $dockerPath compose --env-file $selectedEnvFile -f $composeFile exec -T postgres pg_dump -U $envMap['POSTGRES_USER'] -d $envMap['POSTGRES_DB'] | Set-Content -Path $backupFile
  Write-Output $backupFile
} finally {
  Pop-Location
}