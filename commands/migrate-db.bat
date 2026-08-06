@echo off
title AppRelay - Apply Database Migrations

echo [Migration] Applying all migrations to Supabase Local...
echo.

docker ps --filter "name=supabase_db" --format "{{.Names}}" 2>nul | findstr /i "supabase_db" >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Supabase DB container is not running!
    echo         Run start-supabase.bat first.
    pause
    exit /b 1
)

for /f "tokens=*" %%c in ('docker ps --filter "name=supabase_db" --format "{{.Names}}"') do set DB_CONTAINER=%%c

echo [Migration] Using container: %DB_CONTAINER%
echo.

cd /d "%~dp0.."
for %%f in (supabase\migrations\*.sql) do (
    echo   Applying: %%~nxf
    type "%%f" | docker exec -i %DB_CONTAINER% psql -U postgres >nul 2>&1
)

echo.
echo [Migration] Restarting PostgREST...
for /f "tokens=*" %%c in ('docker ps --filter "name=supabase_rest" --format "{{.Names}}"') do (
    docker restart %%c >nul 2>&1
)

echo [Migration] Done!
echo.
pause
