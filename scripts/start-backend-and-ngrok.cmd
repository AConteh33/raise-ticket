@echo off
setlocal
cd /d "%~dp0.."

:: Main launcher — opens backend + ngrok, then closes this window
start "Issue Tracker Backend" cmd /k "%~dp0start-backend.cmd"
timeout /t 3 /nobreak >nul
start "Issue Tracker ngrok" cmd /k "%~dp0tunnel.cmd"
exit /b 0
