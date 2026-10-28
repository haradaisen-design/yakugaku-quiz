@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\daily-update.ps1"
echo.
pause
