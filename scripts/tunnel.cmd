@echo off
setlocal
cd /d "%~dp0.."

title Issue Tracker — ngrok tunnel

where ngrok >nul 2>&1
if errorlevel 1 (
  echo.
  echo  ngrok not found in PATH.
  echo  Install: winget install Ngrok.Ngrok
  echo  Then run: ngrok config add-authtoken YOUR_TOKEN
  echo.
  pause
  exit /b 1
)

netstat -ano | findstr /R /C:":8080 .*LISTENING" >nul 2>&1
if errorlevel 1 (
  echo.
  echo  WARNING: Nothing is listening on port 8080.
  echo  Start the backend first, or use the main Issue Tracker shortcut.
  echo.
)

echo.
echo  Starting ngrok tunnel -^> http://localhost:8080
echo  Copy the https URL into .env.local as API_PUBLIC_URL
echo  Press Ctrl+C to stop.
echo.

ngrok http 8080

echo.
echo  ngrok stopped.
pause
