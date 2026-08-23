@echo off
setlocal
cd /d "%~dp0.."

title Issue Tracker — Backend (API + Database)

netstat -ano | findstr /R /C:":8080 .*LISTENING" >nul 2>&1
if %errorlevel%==0 (
  echo.
  echo  Backend already running on port 8080.
  echo  Health: http://localhost:8080/api/health
  echo.
  goto :stay_open
)

echo.
echo  Starting Issue Tracker backend...
echo  API + SQLite database
echo.
echo  Local health check: http://localhost:8080/api/health
echo  Press Ctrl+C to stop.
echo.

node scripts\run-api.js

echo.
echo  Backend stopped.

:stay_open
pause
