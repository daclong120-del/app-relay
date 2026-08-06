@echo off
chcp 65001 >nul
title AppRelay - Start All Local Services
color 0A

echo ==================================================
echo   AppRelay Local Development - Start All
echo ==================================================
echo   1. Supabase Local  (Docker)
echo   2. Dashboard       (Next.js dev server)
echo   3. Worker           (tsx dev mode)
echo ==================================================
echo.

echo [1/3] Starting Supabase Local...
call "%~dp0start-supabase.bat"
timeout /t 3 /nobreak >nul

echo.
echo [2/3] Starting Dashboard (Next.js)...
start "AppRelay Dashboard" cmd /k "cd /d "%~dp0..\dashboard" && npm run dev"
timeout /t 2 /nobreak >nul

echo.
echo [3/3] Starting Worker...
start "AppRelay Worker" cmd /k "cd /d "%~dp0..\workers\app-relay-worker" && npm run dev"

echo.
echo ==================================================
echo   All services started!
echo.
echo   Dashboard:       http://localhost:3000
echo   Supabase Studio: http://localhost:54323
echo   Supabase API:    http://localhost:54321
echo   Database:        localhost:54322
echo ==================================================
echo.
pause
