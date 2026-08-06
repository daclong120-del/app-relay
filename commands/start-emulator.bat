@echo off
chcp 65001 >nul
title AppRelay — Android Emulator (chpay)

echo ==================================================
echo   AppRelay — Starting Android Emulator (AVD: chpay)
echo ==================================================
echo.

set "ROOT_DIR=%~dp0.."
set "JAVA_HOME=%ROOT_DIR%\tools\jdk"
set "EMULATOR_EXE=%ROOT_DIR%\tools\android-sdk\emulator\emulator.exe"

if not exist "%EMULATOR_EXE%" (
    echo [ERROR] Emulator binary not found at "%EMULATOR_EXE%"
    pause
    exit /b 1
)

echo [Emulator] Launching AVD "chpay"...
echo.

"%EMULATOR_EXE%" -avd chpay

