@echo off
chcp 65001 >nul
title AppRelay — Worker Node

echo [Worker] Starting AppRelay Worker (dev mode)...
echo [Worker] Gateway: http://localhost:3000/api/release-ops/worker/v1
echo.

cd /d "%~dp0..\workers\app-relay-worker"
npm run dev
