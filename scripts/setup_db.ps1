# ============================================================================
# setup_db.ps1 — Initializes and boots the isolated PostgreSQL 17 cluster
# ============================================================================

$ErrorActionPreference = "Stop"
$pgBin = "C:\Program Files\PostgreSQL\17\bin"
$baseDir = Split-Path -Parent $PSScriptRoot
$dataDir = "$baseDir\pgdata"
$logFile = "$baseDir\postgres.log"

Write-Host ">>> Checking PostgreSQL 17 binaries at $pgBin..." -ForegroundColor Cyan
if (-not (Test-Path "$pgBin\psql.exe")) {
    Write-Error "psql.exe not found at $pgBin. Please verify PostgreSQL 17 is installed."
}

# 1. Initialize cluster if data directory does not exist
if (-not (Test-Path "$dataDir\PG_VERSION")) {
    Write-Host ">>> Initializing isolated database cluster in $dataDir..." -ForegroundColor Yellow
    & "$pgBin\initdb.exe" -U postgres -A trust -E UTF8 --no-locale -D $dataDir
} else {
    Write-Host ">>> Database cluster already initialized at $dataDir." -ForegroundColor Green
}

# 2. Check if already accepting connections on port 5433
$isReady = & "$pgBin\pg_isready.exe" -h localhost -p 5433 -U postgres 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host ">>> Starting PostgreSQL on port 5433..." -ForegroundColor Cyan
    Start-Process -FilePath "$pgBin\postgres.exe" -ArgumentList "-D `"$dataDir`" -p 5433" -RedirectStandardOutput $logFile -RedirectStandardError $logFile -WindowStyle Hidden
    Start-Sleep -Seconds 2
}

# 3. Verify readiness
& "$pgBin\pg_isready.exe" -h localhost -p 5433 -U postgres
if ($LASTEXITCODE -ne 0) {
    Write-Error "PostgreSQL failed to accept connections on port 5433. Check $logFile."
}
Write-Host ">>> PostgreSQL is ready on localhost:5433." -ForegroundColor Green

# 4. Create database social_feed if it does not exist
$dbExists = & "$pgBin\psql.exe" -h localhost -p 5433 -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname = 'social_feed'"
if ($dbExists -ne "1") {
    Write-Host ">>> Creating database 'social_feed'..." -ForegroundColor Cyan
    & "$pgBin\psql.exe" -h localhost -p 5433 -U postgres -c "CREATE DATABASE social_feed;"
    Write-Host ">>> Database 'social_feed' created successfully." -ForegroundColor Green
} else {
    Write-Host ">>> Database 'social_feed' already exists." -ForegroundColor Green
}
