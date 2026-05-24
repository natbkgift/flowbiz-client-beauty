$ErrorActionPreference = 'Stop'

$projectRoot = 'D:\FlowBiz\flowbiz-client-beauty'
$composeDir = Join-Path $projectRoot 'infra\docker'
$composeFile = Join-Path $composeDir 'docker-compose.yml'
$envFile = Join-Path $projectRoot '.env'
$envExampleFile = Join-Path $projectRoot '.env.example'
$logRoot = 'D:\FlowBiz\data\flowbiz-client-beauty\logs'
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$logFile = Join-Path $logRoot ("postgres-$timestamp.log")

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

if (-not (Test-Path $logRoot)) {
  throw "Log root not found at $logRoot"
}

$selectedEnvFile = if (Test-Path $envFile) { $envFile } elseif (Test-Path $envExampleFile) { $envExampleFile } else { throw 'Neither .env nor .env.example exists in the project root.' }

Push-Location $composeDir
try {
  & $dockerPath compose --env-file $selectedEnvFile -f $composeFile logs postgres | Tee-Object -FilePath $logFile
} finally {
  Pop-Location
}