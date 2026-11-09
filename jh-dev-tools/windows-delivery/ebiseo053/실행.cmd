@echo off
setlocal EnableExtensions DisableDelayedExpansion
set "JH_ROOT=%~dp0"
set "JH_PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
set "JH_R1=0000%RANDOM%"
set "JH_R2=0000%RANDOM%"
set "JH_R3=0000%RANDOM%"
set "JH_R4=0000%RANDOM%"
set "JH_R5=0000%RANDOM%"
set "JH_R6=0000%RANDOM%"
set "JH_R7=0000%RANDOM%"
set "JH_R8=0000%RANDOM%"
set "JH_RUN_ID=%JH_R1:~-4%%JH_R2:~-4%%JH_R3:~-4%%JH_R4:~-4%%JH_R5:~-4%%JH_R6:~-4%%JH_R7:~-4%%JH_R8:~-4%"
set "JH_HANDOFF=%TEMP%\JH-Ebiseo053-Run-%JH_RUN_ID%.json"
set "JH_STATE=BLOCKED"
set "JH_ATTEMPTS=0"
set "JH_REASON=BOOTSTRAP_CHECK_FAILED"
set "JH_EXIT=2"
if not exist "%JH_PS%" goto jh_no_powershell
if not exist "%JH_ROOT%data\Start-JH-Ebiseo.ps1" goto jh_missing_file
if not exist "%JH_ROOT%data\JH-Ebiseo-InstallCore.ps1" goto jh_missing_file
if not exist "%JH_ROOT%data\Confirm-JH-Ebiseo-Result.ps1" goto jh_missing_file
if not exist "%JH_ROOT%data\RELEASE.json" goto jh_missing_file
if not exist "%JH_ROOT%data\JH-Ebiseo-0.5.3-unsigned.apk" goto jh_missing_file
if not exist "%JH_ROOT%POWER_SHELL_ERROR_CHECKLIST.txt" goto jh_missing_file
if exist "%JH_HANDOFF%" goto jh_duplicate_id
echo [Ebiseo] Verifying the existing APK, original certificate and current phone.
echo [Ebiseo] There is no local Android build. Installation requires one final Y.
"%JH_PS%" -NoProfile -ExecutionPolicy Bypass -File "%JH_ROOT%data\Start-JH-Ebiseo.ps1" -RunId "%JH_RUN_ID%" -Handoff "%JH_HANDOFF%"
set "JH_EXIT=%ERRORLEVEL%"
set "JH_STATE=UNKNOWN"
set "JH_ATTEMPTS=UNKNOWN"
"%JH_PS%" -NoProfile -ExecutionPolicy Bypass -File "%JH_ROOT%data\Confirm-JH-Ebiseo-Result.ps1" -RunId "%JH_RUN_ID%" -Handoff "%JH_HANDOFF%"
if errorlevel 1 goto jh_unverified_dispatch
echo [Ebiseo] The current run result was verified.
pause
exit /b %JH_EXIT%

:jh_no_powershell
set "JH_REASON=WINDOWS_POWERSHELL_NOT_FOUND"
goto jh_save_bootstrap
:jh_missing_file
set "JH_REASON=EXTRACT_ALL_REQUIRED_FILES_BEFORE_RUNNING"
goto jh_save_bootstrap
:jh_duplicate_id
set "JH_REASON=RUN_ID_COLLISION_NO_DISPATCH"
goto jh_save_bootstrap
:jh_unverified_dispatch
set "JH_REASON=CURRENT_RESULT_UNVERIFIED_NO_AUTOMATIC_RETRY"
set "JH_EXIT=3"
:jh_save_bootstrap
set "JH_RESULT_DIR=%JH_ROOT%bootstrap-results\%JH_RUN_ID%"
if exist "%JH_RESULT_DIR%" goto jh_fallback
mkdir "%JH_RESULT_DIR%" >nul 2>nul
if errorlevel 1 goto jh_fallback
set "JH_RESULT=%JH_RESULT_DIR%\RESULT.txt"
call :jh_write_bootstrap
if errorlevel 1 goto jh_fallback
goto jh_report_bootstrap
:jh_fallback
set "JH_RESULT_DIR=%TEMP%\JH-Ebiseo-Bootstrap-%JH_RUN_ID%"
if exist "%JH_RESULT_DIR%" goto jh_cannot_save
mkdir "%JH_RESULT_DIR%" >nul 2>nul
if errorlevel 1 goto jh_cannot_save
set "JH_RESULT=%JH_RESULT_DIR%\RESULT.txt"
call :jh_write_bootstrap
if errorlevel 1 goto jh_cannot_save
:jh_report_bootstrap
echo RESULT_PATH: "%JH_RESULT%"
echo STATUS: %JH_STATE%
echo REASON: %JH_REASON%
pause
exit /b %JH_EXIT%
:jh_cannot_save
echo RESULT_WRITE_FAILED
echo RUN_ID: %JH_RUN_ID%
echo STATUS: %JH_STATE%
echo REASON: %JH_REASON%
pause
exit /b %JH_EXIT%
:jh_write_bootstrap
if exist "%JH_RESULT%" exit /b 1
> "%JH_RESULT%" (
  echo REPORT_KIND: BOOTSTRAP
  echo RUN_ID: %JH_RUN_ID%
  echo STATUS: %JH_STATE%
  echo REASON: %JH_REASON%
  echo INSTALL_ATTEMPTS: %JH_ATTEMPTS%
)
exit /b %ERRORLEVEL%
