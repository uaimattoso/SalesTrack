@echo off
setlocal
set "DASHBOARD_DIR=%~dp0"
set "DASHBOARD_URL=http://127.0.0.1:8765/"
set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -UseBasicParsing '%DASHBOARD_URL%' -TimeoutSec 1 | Out-Null; exit 0 } catch { exit 1 }"
if errorlevel 1 (
    start "SalesTrack Server" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%DASHBOARD_DIR%servidor-dashboard.ps1"
    timeout /t 2 /nobreak >nul
)

if exist "%CHROME%" (
    start "" "%CHROME%" "%DASHBOARD_URL%"
) else (
    start "" "%DASHBOARD_URL%"
)

endlocal
