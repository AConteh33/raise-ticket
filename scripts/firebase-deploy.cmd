@echo off
setlocal
cd /d "%~dp0.."

echo.
echo  Firebase deploy — Issue Tracker frontend
echo  ========================================
echo.

where node >nul 2>&1 || (
  echo  Node.js not found. Install from https://nodejs.org
  pause
  exit /b 1
)

echo  Step 1: Build config.js from .env.local ...
node scripts\write-frontend-config.js
if errorlevel 1 exit /b 1

echo.
echo  Step 2: Deploy to Firebase Hosting ...
echo  (If asked to log in, complete the browser sign-in.)
echo.

call npx firebase deploy --only hosting
if errorlevel 1 (
  echo.
  echo  Deploy failed. If you are not logged in, run:
  echo    npx firebase login
  echo  Then run this script again.
  echo.
  pause
  exit /b 1
)

echo.
echo  Done! Open: https://mother-app-9ca4d.web.app
echo.
pause
