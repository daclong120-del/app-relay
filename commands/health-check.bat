@echo off
title AppRelay - Health Check

echo ==================================================
echo   AppRelay Local - Health Check
echo ==================================================
echo.

echo [1] Docker...
docker info >nul 2>&1
if errorlevel 1 (
    echo     [FAIL] Docker is not running
) else (
    echo     [OK] Docker running
)

echo [2] Supabase DB...
docker ps --filter "name=supabase_db" --filter "status=running" --format "{{.Names}}" 2>nul | findstr /i "supabase_db" >nul 2>&1
if errorlevel 1 (
    echo     [FAIL] Supabase DB container not running
) else (
    echo     [OK] Supabase DB running (port 54322)
)

echo [3] Supabase API Gateway...
docker ps --filter "name=supabase_kong" --filter "status=running" --format "{{.Names}}" 2>nul | findstr /i "supabase_kong" >nul 2>&1
if errorlevel 1 (
    echo     [FAIL] Supabase Kong not running
) else (
    echo     [OK] Supabase API Gateway running (port 54321)
)

echo [4] Dashboard (Next.js)...
powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:3000/api/app-relay/v1/health' -UseBasicParsing -TimeoutSec 3; Write-Host '    [OK] Dashboard running (port 3000)' } catch { Write-Host '    [FAIL] Dashboard not reachable at localhost:3000' }"

echo [5] PostgREST...
docker ps --filter "name=supabase_rest" --filter "status=running" --format "{{.Names}}" 2>nul | findstr /i "supabase_rest" >nul 2>&1
if errorlevel 1 (
    echo     [FAIL] PostgREST not running
) else (
    echo     [OK] PostgREST running
)

echo [6] Database Tables...
for /f "tokens=*" %%c in ('docker ps --filter "name=supabase_db" --format "{{.Names}}" 2^>nul') do (
    for /f %%n in ('docker exec %%c psql -U postgres -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'release_ops_%%';" 2^>nul') do (
        if %%n GEQ 10 (
            echo     [OK] %%n release_ops tables found
        ) else (
            echo     [WARN] Only %%n tables found. Run migrate-db.bat
        )
    )
)

echo.
echo ==================================================
echo   Health check complete.
echo ==================================================
echo.
pause
