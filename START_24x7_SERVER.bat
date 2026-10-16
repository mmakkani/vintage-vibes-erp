@echo off
title Vintage Vibes Al Ain - 24/7 Dual-DB (Local PostgreSQL + Supabase Cloud) ^& HTTPS Server
color 0A
cd /d "%~dp0"

set "PGSSLMODE="
set "HOST="

echo ======================================================================
echo   VINTAGE VIBES ENTERPRISE ERP - 24/7 DEDICATED SERVER LAUNCHER
echo ======================================================================
echo.

if exist "%~dp0node-v22.14.0-win-x64\node.exe" (
    set "PATH=%~dp0node-v22.14.0-win-x64;%PATH%"
)

if exist "%~dp0pgsql\bin\pg_ctl.exe" (
    echo [1/4] Starting Local PostgreSQL Database on 127.0.0.1:5432...
    "%~dp0pgsql\bin\pg_ctl.exe" status -D "%~dp0pgdata" >nul 2>nul
    if errorlevel 1 (
        start "VintageVibes-LocalPG" /min cmd /c ""%~dp0pgsql\bin\pg_ctl.exe" -D "%~dp0pgdata" -l "%~dp0pg.log" start"
        timeout /t 2 /nobreak >nul
    )
)

echo [2/4] Cleaning up old instances...
taskkill /f /im caddy.exe >nul 2>nul
taskkill /f /im cloudflared.exe >nul 2>nul
taskkill /f /im node.exe >nul 2>nul

if exist "caddy.exe" (
    echo [3/4] Starting Direct IP HTTPS Server on Port 443 ^(Caddy^)...
    start "VintageVibes-HTTPS-Caddy" /min cmd /c "caddy.exe run --config Caddyfile"
)

if exist "launch_watchdog_silent.vbs" (
    wscript.exe "launch_watchdog_silent.vbs"
)

echo.
echo [4/4] Starting Vintage Vibes ERP Server on http://localhost:3000 ...
echo       Public Domain: https://vintagevibesgk.com (217.165.174.249)
echo ======================================================================
:loop
node dist/server.cjs
echo [WARN] Server exited. Restarting in 3 seconds...
timeout /t 3 /nobreak >nul
goto loop
