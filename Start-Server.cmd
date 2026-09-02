@echo off
title Raise Ticket Server
echo ========================================
echo   Raise Ticket - Start Server
echo ========================================
echo.

:: Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed.
    echo Download it from: https://nodejs.org
    echo Install it, then run this file again.
    echo.
    pause
    exit /b 1
)

:: Install dependencies if needed
if not exist "node_modules" (
    echo Installing dependencies... please wait
    echo.
    call npm install --omit=dev
    echo.
)

:: Get local IP
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4" ^| findstr /v "127.0.0.1"') do set LOCAL_IP=%%a
set LOCAL_IP=%LOCAL_IP: =%

echo ========================================
echo   Open this URL on any device:
echo   http://%LOCAL_IP%:8080
echo ========================================
echo.
echo Press Ctrl+C to stop the server.
echo.

node html-site/server.js
