@echo off
cd /d "%~dp0"
echo Checking for updates...
git pull --quiet
if errorlevel 1 (
    echo.
    echo Git pull failed - running local version.
    echo.
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0create_test.ps1"
if errorlevel 1 (
    echo.
    echo PowerShell error - read message above.
    pause
)
