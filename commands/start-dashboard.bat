@echo off
chcp 65001 >nul
title AppRelay — Dashboard (Next.js)

echo [Dashboard] Starting Next.js dev server...
echo [Dashboard] URL: http://localhost:3000
echo.

cd /d "%~dp0..\dashboard"
npm run dev
