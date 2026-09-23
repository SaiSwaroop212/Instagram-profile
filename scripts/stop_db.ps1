# ============================================================================
# stop_db.ps1 — Stops the isolated PostgreSQL 17 cluster cleanly
# ============================================================================

$pgBin = "C:\Program Files\PostgreSQL\17\bin"
$baseDir = Split-Path -Parent $PSScriptRoot
$dataDir = "$baseDir\pgdata"

Write-Host ">>> Stopping isolated PostgreSQL cluster..." -ForegroundColor Yellow
& "$pgBin\pg_ctl.exe" -D $dataDir stop -m fast
Write-Host ">>> PostgreSQL stopped." -ForegroundColor Green
