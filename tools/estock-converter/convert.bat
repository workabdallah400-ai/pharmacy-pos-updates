@echo off
chcp 65001 >nul
title PharmacyPOS - eStock Converter
set "PS1=%~dp0convert.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File','""%PS1%""') -Verb RunAs"
exit /b 0
