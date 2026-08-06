@echo off
title AppRelay - Stop All Services

echo ==================================================
echo   AppRelay Local - Stop All Services
echo ==================================================
echo.

echo [1/2] Stopping Supabase Local...
cd /d "%~dp0.."
npx supabase stop 2>nul
if errorlevel 1 (
    echo [Supabase] Stopping containers manually...
    for /f "tokens=*" %%i in ('docker ps -q --filter "name=supabase"') do (
        docker stop %%i >nul 2>&1
    )
)

echo [2/2] Note: Dashboard and Worker windows must be closed manually (Ctrl+C).
echo.
echo All Supabase services stopped.
echo.
pause
