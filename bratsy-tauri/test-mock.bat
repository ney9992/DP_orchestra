@echo off
cd /d "%~dp0"
echo Запуск mock-plantsim.ps1...
powershell -ExecutionPolicy Bypass -File "dev-tools\mock-plantsim.ps1" /S "test.spm" "%CD%\test.spp"
echo.
echo Содержимое results.txt:
type results.txt
