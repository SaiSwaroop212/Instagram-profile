# ============================================================================
# run_all.ps1 — Master verification script for PRD 03 deliverables
# Runs schema, seed, manifest, constraint tests, 10 SQL queries, transactions,
# and notification extension in one command.
# ============================================================================

$ErrorActionPreference = "Stop"
$pgBin = "C:\Program Files\PostgreSQL\17\bin"
$baseDir = Split-Path -Parent $PSScriptRoot
$psql = "$pgBin\psql.exe"
$connArgs = @("-h", "localhost", "-p", "5433", "-U", "postgres", "-d", "social_feed")

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "       PRD 03: RELATIONAL MODELING & SQL VERIFICATION SUITE           " -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan

# 1. Ensure DB cluster is running
& "$PSScriptRoot\setup_db.ps1"

# 2. Apply Schema DDL
Write-Host "`n[STEP 1/6] Applying DDL Schema (db/schema.sql)..." -ForegroundColor Yellow
& $psql @connArgs -f "$baseDir\db\schema.sql"
if ($LASTEXITCODE -ne 0) { Write-Error "Schema application failed." }

# 3. Deterministic Seed
Write-Host "`n[STEP 2/6] Seeding Deterministic Fixtures (db/seed.sql)..." -ForegroundColor Yellow
& $psql @connArgs -f "$baseDir\db\seed.sql"
if ($LASTEXITCODE -ne 0) { Write-Error "Seed insertion failed." }

# 4. Manifest Verification
Write-Host "`n[STEP 3/6] Verifying Seed Manifest (db/manifest.sql)..." -ForegroundColor Yellow
& $psql @connArgs -f "$baseDir\db\manifest.sql"
if ($LASTEXITCODE -ne 0) { Write-Error "Manifest verification failed." }

# 5. Constraint Test Suite
Write-Host "`n[STEP 4/6] Running Constraint & Integrity Tests (db/constraint-tests.sql)..." -ForegroundColor Yellow
& $psql @connArgs -f "$baseDir\db\constraint-tests.sql"
if ($LASTEXITCODE -ne 0) { Write-Error "Constraint tests failed." }

# 6. Ten SQL Use Cases
Write-Host "`n[STEP 5/6] Executing Ten SQL Use Cases (db/queries.sql)..." -ForegroundColor Yellow
& $psql @connArgs -f "$baseDir\db\queries.sql"
if ($LASTEXITCODE -ne 0) { Write-Error "Query execution failed." }

# 7. Transaction and Concurrency Tests
Write-Host "`n[STEP 6/6] Running Transaction & Concurrency Tests (db/transaction-tests.sql)..." -ForegroundColor Yellow
& $psql @connArgs -f "$baseDir\db\transaction-tests.sql"
if ($LASTEXITCODE -ne 0) { Write-Error "Transaction tests failed." }

# Optional: Notifications Extension
Write-Host "`n[EXTENSION] Running Notification Extension Suite (db/notifications.sql)..." -ForegroundColor Magenta
& $psql @connArgs -f "$baseDir\db\notifications.sql"

Write-Host "`n======================================================================" -ForegroundColor Green
Write-Host " [OK] ALL PRD 03 DELIVERABLES AND TESTS PASSED SUCCESSFULLY!          " -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Green
