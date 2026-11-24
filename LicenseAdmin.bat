@echo off
chcp 65001 >nul
title License Admin - PharmacyPOS
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js is not installed on this computer.
  echo   Install it from https://nodejs.org then run this file again.
  echo.
  pause
  exit /b 1
)

echo.
echo   Starting the licence admin panel...
echo   Keep this window open while you issue or revoke codes.
echo.

node "scripts\license-admin.mjs"
echo.
pause
