@echo off
title AppRelay - Supabase Local

echo [Supabase] Checking Docker...
docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker is not running! Please start Docker Desktop first.
    pause
    exit /b 1
)

echo [Supabase] Checking if containers are already running...
docker ps --filter "name=supabase_db" --format "{{.Names}}" 2>nul | findstr /i "supabase_db" >nul 2>&1
if not errorlevel 1 (
    echo [Supabase] Already running. Skipping start.
    exit /b 0
)

echo [Supabase] Starting Supabase Local...
cd /d "%~dp0.."
npx supabase start

if errorlevel 1 (
    echo [ERROR] Supabase failed to start.
    pause
    exit /b 1
)

echo [Supabase] Running database migrations...
call "%~dp0migrate-db.bat"

echo [Supabase] Done.
