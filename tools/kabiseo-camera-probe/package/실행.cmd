@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -File "%~dp0data\probe.ps1"
set "PROBE_EXIT=%ERRORLEVEL%"
if not "%PROBE_EXIT%"=="0" (
  echo Probe stopped. Do not change Windows security policy.
  if not exist "%~dp0RESULT.txt" echo BLOCKED: PowerShell startup failed. No camera observation.>"%~dp0RESULT.txt"
)
echo.
echo RESULT.txt is in this folder. No app installation or camera control was performed.
pause
exit /b %PROBE_EXIT%
