@echo off
setlocal

cd /d "%~dp0"

echo Starting OneStop...

if "%ONESTOP_PORT%"=="" set "ONESTOP_PORT=3000"

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found in PATH.
  echo Install Node.js 20+ and try again.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
)

if not exist ".runtime" mkdir ".runtime"

if not exist ".env.local" (
  if exist ".env.example" (
    echo [WARN] .env.local is missing.
    echo Copy .env.example to .env.local and fill in the required keys.
  ) else (
    echo [WARN] .env.local is missing.
  )
)

echo Creating Cloudflare tunnel for http://localhost:%ONESTOP_PORT% ...
where powershell >nul 2>nul
if errorlevel 1 (
  echo [WARN] PowerShell was not found. Skipping Cloudflare tunnel automation.
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-cloudflare-tunnel.ps1" -Port "%ONESTOP_PORT%"
)

if exist ".runtime\public-app-url.env" (
  for /f "usebackq tokens=1,* delims==" %%A in (".runtime\public-app-url.env") do set "%%A=%%B"
  echo Using PUBLIC_APP_URL=%PUBLIC_APP_URL%
) else (
  echo [WARN] PUBLIC_APP_URL was not updated by the tunnel helper.
  echo [WARN] Calls will use the value from .env.local if one exists.
)

echo Launching development server on http://localhost:%ONESTOP_PORT%
call npm run dev -- -p %ONESTOP_PORT%

endlocal
