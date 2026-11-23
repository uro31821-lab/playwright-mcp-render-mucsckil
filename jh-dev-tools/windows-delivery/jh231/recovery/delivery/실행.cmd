@echo off
setlocal DisableDelayedExpansion
echo JH231 read-only status check. No installation or process stop.
echo Keep the original black update window open.
set "JH_STATUS_PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%JH_STATUS_PS%" goto blocked
if not exist "%~dp0internal\JH231-READ-STATUS.ps1" goto blocked
"%JH_STATUS_PS%" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0internal\JH231-READ-STATUS.ps1"
set "JH_STATUS_RC=%ERRORLEVEL%"
echo Send the new JH231_STATUS file or a photo of this result window.
pause
exit /b %JH_STATUS_RC%
:blocked
echo STATUS_READER_MISSING_EXTRACT_ALL
pause
exit /b 2
