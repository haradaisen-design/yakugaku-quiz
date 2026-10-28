@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\set-github-token.ps1"
echo.
pause
