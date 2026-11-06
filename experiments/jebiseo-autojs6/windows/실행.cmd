@echo off
setlocal EnableExtensions DisableDelayedExpansion
set "JEB_ROOT=%~dp0"
set "JEB_PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
set "JEB_RUN_ID="
for /l %%I in (1,1,8) do call :JebRandomPart
set "JEB_HANDOFF=%TEMP%\Jebiseo-Handoff-%JEB_RUN_ID%.json"
set "JEB_STATUS=BLOCKED"
set "JEB_REASON=BOOTSTRAP_REQUIREMENT_MISSING"
set "JEB_INSTALL_ATTEMPTS=0"
set "JEB_RC=2"
if not exist "%JEB_PS%" goto :JebFallback
if not exist "%JEB_ROOT%RUN.ps1" goto :JebFallback
if not exist "%JEB_ROOT%Confirm-Result.ps1" goto :JebFallback
if not exist "%JEB_ROOT%assets.json" goto :JebFallback
if not exist "%JEB_ROOT%POWER_SHELL_ERROR_CHECKLIST.txt" goto :JebFallback
if exist "%JEB_HANDOFF%" goto :JebFallback
echo [Jebiseo] Preparing the independent phone test...
"%JEB_PS%" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%JEB_ROOT%RUN.ps1" -RunId "%JEB_RUN_ID%" -Handoff "%JEB_HANDOFF%"
set "JEB_RC=%ERRORLEVEL%"
set "JEB_STATUS=UNKNOWN"
set "JEB_INSTALL_ATTEMPTS=UNKNOWN"
set "JEB_REASON=CURRENT_RESULT_NOT_VERIFIED"
"%JEB_PS%" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%JEB_ROOT%Confirm-Result.ps1" -RunId "%JEB_RUN_ID%" -Handoff "%JEB_HANDOFF%"
if errorlevel 1 goto :JebFallback
echo [Jebiseo] The current result file is shown above.
echo [Jebiseo] A launch request alone does not mean the phone test passed.
pause
exit /b %JEB_RC%

:JebRandomPart
set "JEB_PART=0000%RANDOM%"
set "JEB_RUN_ID=%JEB_RUN_ID%%JEB_PART:~-4%"
exit /b 0

:JebFallback
set "JEB_RESULT_DIR=%JEB_ROOT%bootstrap-results\%JEB_RUN_ID%"
2>nul md "%JEB_RESULT_DIR%"
if errorlevel 1 goto :JebTempFallback
goto :JebWriteFallback

:JebTempFallback
set "JEB_RESULT_DIR=%TEMP%\Jebiseo-Bootstrap-%JEB_RUN_ID%"
2>nul md "%JEB_RESULT_DIR%"
if errorlevel 1 goto :JebNoResult

:JebWriteFallback
set "JEB_RESULT_FILE=%JEB_RESULT_DIR%\RESULT.txt"
if exist "%JEB_RESULT_FILE%" goto :JebNoResult
>"%JEB_RESULT_FILE%" (
echo REPORT_KIND=JEBISEO_BOOTSTRAP_RESULT_V1
echo RUN_ID=%JEB_RUN_ID%
echo STATUS=%JEB_STATUS%
echo REASON=%JEB_REASON%
echo INSTALL_ATTEMPTS=%JEB_INSTALL_ATTEMPTS%
echo PHONE_TEST=NOT_CONFIRMED
echo Do not automatically retry an installation or launch.
echo Keep this file and POWER_SHELL_ERROR_CHECKLIST.txt.
)
if errorlevel 1 goto :JebNoResult
echo [Jebiseo] Stopped. STATUS=%JEB_STATUS%
echo RESULT_FILE="%JEB_RESULT_FILE%"
pause
exit /b 2

:JebNoResult
echo RESULT_WRITE_FAILED. STATUS=%JEB_STATUS%
echo Do not automatically retry an installation or launch.
pause
exit /b 2
