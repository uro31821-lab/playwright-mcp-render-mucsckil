@echo off
setlocal EnableExtensions DisableDelayedExpansion
set "JH_KIT=%~dp0"
set "JH_PUSHED="
set "JH_REPORT="
set "JH_REPORT_BASE="
set "JH_REPORT_DIR="
set "JH_DISPATCHED=FALSE"
set "JH_STATUS=BLOCKED"
set "JH_STAGE=BEFORE_POWERSHELL"
set "JH_REASON=EXTRACTED_FOLDER_UNAVAILABLE"
set "JH_PS_EXIT=NOT_RUN"
set "JH_EXIT_CODE=1"
pushd "%JH_KIT%" 2>nul
if errorlevel 1 goto :JH_BLOCKED
set "JH_PUSHED=TRUE"
echo.
echo [JH168 Mobile13] Use pre-signed APK, one update, verify. No local key needed.
for %%F in ("data\Update-Mobile13.ps1" "data\JH-RUN-SAFETY.ps1" "data\candidate.json" "data\JH168-Mobile13-SIGNED-20261101.apk" "POWER_SHELL_ERROR_CHECKLIST.txt") do (
    if not exist "%%~F" (
        set "JH_REASON=REQUIRED_FILE_MISSING_%%~F"
        goto :JH_BLOCKED
    )
    if exist "%%~F\" (
        set "JH_REASON=REQUIRED_FILE_IS_DIRECTORY_%%~F"
        goto :JH_BLOCKED
    )
)
set "JH_REASON=WINDOWS_POWERSHELL_MISSING"
if not defined SystemRoot goto :JH_BLOCKED
set "JH_PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%JH_PS%" goto :JH_BLOCKED
if exist "%JH_PS%\" goto :JH_BLOCKED
set "JH_DISPATCHED=TRUE"
set "JH_STAGE=AFTER_POWERSHELL_DISPATCH"
set "JH_RUN_ID=mobile13-%RANDOM%-%RANDOM%-%RANDOM%"
"%JH_PS%" -NoProfile -ExecutionPolicy Bypass -File "%JH_KIT%data\Update-Mobile13.ps1" -RunId "%JH_RUN_ID%"
set "JH_PS_EXIT=%errorlevel%"
if "%JH_PS_EXIT%"=="20" goto :JH_PS_FALLBACK_SAVED
set "JH_REASON=POWERSHELL_FAILED_OR_INTERRUPTED"
if not "%JH_PS_EXIT%"=="0" goto :JH_UNKNOWN
set "JH_REASON=POWERSHELL_RETURNED_WITHOUT_RESULT"
if not exist "RESULT.txt" goto :JH_UNKNOWN
if exist "RESULT.txt\" goto :JH_UNKNOWN
"%SystemRoot%\System32\findstr.exe" /x /c:"RUN_ID: %JH_RUN_ID%" "RESULT.txt" >nul 2>&1
if errorlevel 1 goto :JH_UNKNOWN
"%SystemRoot%\System32\findstr.exe" /x /c:"REPORT_KIND: ONECLICK" "RESULT.txt" >nul 2>&1
if errorlevel 1 goto :JH_UNKNOWN
set "JH_REPORT=%JH_KIT%RESULT.txt"
set "JH_EXIT_CODE=0"
echo.
echo PowerShell saved the current report. Read it for the actual outcome.
echo RESULT_PATH: "%JH_REPORT%"
goto :JH_FINISH

:JH_PS_FALLBACK_SAVED
set "JH_EXIT_CODE=20"
echo.
echo PowerShell saved its report in a fallback folder.
echo Use the exact RESULT_PATH printed by PowerShell above.
goto :JH_FINISH

:JH_EXISTING_RESULT
set "JH_REASON=EXISTING_RESULT_PRESERVED_NO_REPLAY"
goto :JH_BLOCKED

:JH_BLOCKED
echo.
echo BLOCKED: %JH_REASON%
echo PowerShell was not dispatched. This launch did not begin a device action.
echo Extract the whole ZIP and keep all bundled files together.
call :JH_SAVE_REPORT
goto :JH_FINISH

:JH_UNKNOWN
set "JH_STATUS=UNKNOWN"
set "JH_EXIT_CODE=2"
echo.
echo UNKNOWN: %JH_REASON% ; PowerShell exit code %JH_PS_EXIT%.
echo A device action may have started. Do not assume it was not executed.
echo Do not repeat the launch. Inspect the existing result and device state first.
call :JH_SAVE_REPORT
goto :JH_FINISH

:JH_SAVE_REPORT
rem A freshly created private directory prevents overwriting any existing report.
rem Never pass filesystem paths through CALL arguments; percent signs stay literal.
set "JH_REPORT="
if not defined JH_PUSHED goto :JH_REPORT_TEMP
if exist "%JH_KIT%RESULT.txt" goto :JH_REPORT_TEMP
set "JH_REPORT_BASE=%JH_KIT%"
call :JH_TRY_REPORT_BASE
if defined JH_REPORT goto :JH_REPORT_SAVED
:JH_REPORT_TEMP
if not defined TEMP goto :JH_REPORT_TMP
set "JH_REPORT_BASE=%TEMP%"
call :JH_TRY_REPORT_BASE
if defined JH_REPORT goto :JH_REPORT_SAVED
:JH_REPORT_TMP
if not defined TMP goto :JH_REPORT_LOCAL
set "JH_REPORT_BASE=%TMP%"
call :JH_TRY_REPORT_BASE
if defined JH_REPORT goto :JH_REPORT_SAVED
:JH_REPORT_LOCAL
if not defined LOCALAPPDATA goto :JH_REPORT_UNAVAILABLE
set "JH_REPORT_BASE=%LOCALAPPDATA%\Temp"
call :JH_TRY_REPORT_BASE
if defined JH_REPORT goto :JH_REPORT_SAVED
:JH_REPORT_UNAVAILABLE
echo ERROR: RESULT_WRITE_FAILED. No writable report location was available.
echo No RESULT.txt was saved by the bootstrap. Keep this window and its error text.
echo STATUS: %JH_STATUS%
echo REASON: %JH_REASON%
exit /b 1
:JH_REPORT_SAVED
echo RESULT_PATH: "%JH_REPORT%"
echo Existing reports and APK files were preserved.
exit /b 0

:JH_TRY_REPORT_BASE
if not defined JH_REPORT_BASE exit /b 1
for %%P in ("%JH_REPORT_BASE%\.") do set "JH_REPORT_BASE=%%~fP"
if "%JH_REPORT_BASE:~-1%"=="\" set "JH_REPORT_BASE=%JH_REPORT_BASE:~0,-1%"
if not exist "%JH_REPORT_BASE%\." exit /b 1
for /L %%N in (1,1,4) do call :JH_TRY_REPORT_DIRECTORY
if defined JH_REPORT exit /b 0
exit /b 1

:JH_TRY_REPORT_DIRECTORY
if defined JH_REPORT exit /b 0
set "JH_REPORT_DIR=%JH_REPORT_BASE%\JH-BOOTSTRAP-%RANDOM%-%RANDOM%"
md "%JH_REPORT_DIR%" 2>nul
if errorlevel 1 exit /b 1
if exist "%JH_REPORT_DIR%\RESULT.txt" exit /b 1
(
    echo JH168 MOBILE13 - BOOTSTRAP REPORT
    echo DATE: "%DATE% %TIME%"
    echo STATUS: %JH_STATUS%
    echo STAGE: %JH_STAGE%
    echo REASON: %JH_REASON%
    echo POWERSHELL_DISPATCHED: %JH_DISPATCHED%
    echo POWERSHELL_EXIT_CODE: %JH_PS_EXIT%
    if "%JH_DISPATCHED%"=="FALSE" (
        echo DEVICE_INSTALL_ATTEMPTED: FALSE
    ) else (
        echo DEVICE_INSTALL_ATTEMPTED: UNKNOWN
    )
    echo AUTO_RETRY: FORBIDDEN
    echo EXISTING_FILES: PRESERVED
    echo RESULT_PATH: "%JH_REPORT_DIR%\RESULT.txt"
) >"%JH_REPORT_DIR%\RESULT.txt" 2>nul
if errorlevel 1 exit /b 1
if not exist "%JH_REPORT_DIR%\RESULT.txt" exit /b 1
for %%R in ("%JH_REPORT_DIR%\RESULT.txt") do if %%~zR LEQ 0 exit /b 1
set "JH_REPORT=%JH_REPORT_DIR%\RESULT.txt"
exit /b 0

:JH_FINISH
echo.
echo Do not retry if signing or installation might have started.
pause
if defined JH_PUSHED popd
exit /b %JH_EXIT_CODE%
