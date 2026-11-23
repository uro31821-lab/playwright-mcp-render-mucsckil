@echo off
echo JH231 update starting. Progress will appear below.
echo Keep this window open. Do not start a second copy.
setlocal DisableDelayedExpansion
set "JH_DELIVERY_ROOT=%~dp0"
set "JH_POWERSHELL=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
set "JH_RUN_STATUS=BLOCKED_BEFORE_BOOTSTRAP"
set "JH_RUN_REASON=BOOTSTRAP_OR_POWERSHELL_MISSING_EXTRACT_ALL"
set "JH_CHILD_RC=NOT_CALLED"
if not exist "%JH_POWERSHELL%" goto result_fallback
if not exist "%JH_DELIVERY_ROOT%internal\BOOTSTRAP.ps1" goto result_fallback
set "JH_RUN_STATUS=UNKNOWN_AFTER_BOOTSTRAP_INVOCATION_NO_REPLAY"
set "JH_RUN_REASON=CHECK_CURRENT_BOOTSTRAP_AND_RUNNER_RESULTS"
"%JH_POWERSHELL%" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%JH_DELIVERY_ROOT%internal\BOOTSTRAP.ps1"
set "JH_CHILD_RC=%ERRORLEVEL%"
if "%JH_CHILD_RC%"=="0" goto success
:result_fallback
set "JH_CMD_ID=%RANDOM%-%RANDOM%-%RANDOM%-%RANDOM%"
set "JH_CMD_RESULT=%TEMP%\JH231-cmd-%JH_CMD_ID%"
if exist "%JH_CMD_RESULT%" goto fallback_local
mkdir "%JH_CMD_RESULT%" 2>nul
if errorlevel 1 goto fallback_local
goto write_result
:fallback_local
if not defined LOCALAPPDATA goto result_failed
set "JH_CMD_RESULT=%LOCALAPPDATA%\JH\cmd-results\JH231-%JH_CMD_ID%"
if exist "%JH_CMD_RESULT%" goto result_failed
mkdir "%JH_CMD_RESULT%" 2>nul
if errorlevel 1 goto result_failed
:write_result
>"%JH_CMD_RESULT%\RESULT.txt" echo REPORT_KIND: JH231_CMD_FALLBACK_RESULT_V1
if errorlevel 1 goto result_failed
>>"%JH_CMD_RESULT%\RESULT.txt" echo RUN_ID: CMD-%JH_CMD_ID%
>>"%JH_CMD_RESULT%\RESULT.txt" echo STATUS: %JH_RUN_STATUS%
>>"%JH_CMD_RESULT%\RESULT.txt" echo REASON: %JH_RUN_REASON%
>>"%JH_CMD_RESULT%\RESULT.txt" echo CHILD_EXIT_CODE: %JH_CHILD_RC%
>>"%JH_CMD_RESULT%\RESULT.txt" echo AUTOMATIC_REPLAY: NEVER
if errorlevel 1 goto result_failed
echo RESULT_PATH: "%JH_CMD_RESULT%\RESULT.txt"
goto blocked
:result_failed
echo RESULT_WRITE_FAILED
:blocked
echo STATUS: %JH_RUN_STATUS%
echo No automatic retry. Review the current RESULT paths above.
pause
exit /b 2
:success
echo Current phone package, version, certificate and APK hash verified.
echo Instagram feature testing is a separate next step.
pause
exit /b 0
