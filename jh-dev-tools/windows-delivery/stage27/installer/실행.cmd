@echo off
setlocal EnableExtensions DisableDelayedExpansion
set "JH_KIT=%~dp0"
set "JH_RUN_ID=stage27-%RANDOM%-%RANDOM%-%RANDOM%"
set "JH_PUSHED="
set "JH_DISPATCHED=FALSE"
set "JH_STATUS=BLOCKED"
set "JH_REASON=EXTRACTED_FOLDER_UNAVAILABLE"
set "JH_EXIT_CODE=3"
set "JH_PS_EXIT=NOT_RUN"
set "JH_REPORT="
pushd "%JH_KIT%" 2>nul
if errorlevel 1 goto :JH_BLOCKED
set "JH_PUSHED=TRUE"
echo.
echo [JH168 Stage27] Verify existing APK, update once, verify installed bytes.
for %%F in ("data\Install-JH168-Stage27.ps1" "data\JH-RUN-SAFETY.ps1" "data\Confirm-Stage27-Result.ps1" "data\INSTALL-MANIFEST.json" "data\STAGE27-SIGNATURE-VERIFICATION.json" "data\JH168-Stage27-SIGNED.apk" "POWER_SHELL_ERROR_CHECKLIST.txt") do (
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
"%JH_PS%" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%JH_KIT%data\Install-JH168-Stage27.ps1" -RunId "%JH_RUN_ID%"
set "JH_PS_EXIT=%errorlevel%"
"%JH_PS%" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%JH_KIT%data\Confirm-Stage27-Result.ps1" -RunId "%JH_RUN_ID%"
set "JH_CONFIRM_EXIT=%errorlevel%"
if not "%JH_PS_EXIT%"=="%JH_CONFIRM_EXIT%" goto :JH_UNKNOWN
if "%JH_CONFIRM_EXIT%"=="0" goto :JH_VERIFIED_REPORT
if "%JH_CONFIRM_EXIT%"=="3" goto :JH_VERIFIED_REPORT
if "%JH_CONFIRM_EXIT%"=="5" goto :JH_VERIFIED_REPORT
:JH_UNKNOWN
set "JH_STATUS=UNKNOWN"
set "JH_EXIT_CODE=5"
if "%JH_PS_EXIT%"=="30" set "JH_EXIT_CODE=30"
set "JH_REASON=POWERSHELL_CALLED_CURRENT_RUN_RESULT_UNCONFIRMED"
echo.
echo UNKNOWN: Installation may have started. Do not repeat it automatically.
call :JH_SAVE_REPORT
goto :JH_FINISH

:JH_VERIFIED_REPORT
set "JH_EXIT_CODE=%JH_CONFIRM_EXIT%"
echo.
echo Current result identity was verified. Installation status is printed above.
echo Use the exact RESULT_PATH printed by PowerShell above.
goto :JH_FINISH

:JH_BLOCKED
echo.
echo BLOCKED: %JH_REASON%
echo PowerShell was not dispatched. Install attempts this launch: 0.
echo Extract all files and retain the entire data folder.
call :JH_SAVE_REPORT
goto :JH_FINISH

:JH_SAVE_REPORT
set "JH_REPORT="
set "JH_REPORT_BASE=%JH_KIT%"
call :JH_TRY_BASE
if defined JH_REPORT goto :JH_SAVED
if not defined LOCALAPPDATA goto :JH_TRY_TEMP
set "JH_REPORT_BASE=%LOCALAPPDATA%"
call :JH_TRY_BASE
if defined JH_REPORT goto :JH_SAVED
:JH_TRY_TEMP
if not defined TEMP goto :JH_NO_REPORT
set "JH_REPORT_BASE=%TEMP%"
call :JH_TRY_BASE
if defined JH_REPORT goto :JH_SAVED
:JH_NO_REPORT
set "JH_EXIT_CODE=30"
echo RESULT_WRITE_FAILED: No current result could be saved. Preserve this window.
exit /b 1
:JH_SAVED
echo RESULT_PATH: "%JH_REPORT%"
echo Existing reports and APK files were preserved.
exit /b 0

:JH_TRY_BASE
if not defined JH_REPORT_BASE exit /b 1
if not exist "%JH_REPORT_BASE%\." exit /b 1
for /L %%N in (1,1,3) do call :JH_TRY_DIRECTORY
if defined JH_REPORT exit /b 0
exit /b 1

:JH_TRY_DIRECTORY
if defined JH_REPORT exit /b 0
set "JH_REPORT_DIR=%JH_REPORT_BASE%\JH27-BOOTSTRAP-%JH_RUN_ID%-%RANDOM%"
md "%JH_REPORT_DIR%" 2>nul
if errorlevel 1 exit /b 1
if exist "%JH_REPORT_DIR%\RESULT.txt" exit /b 1
(
    echo JH168_STAGE27: BOOTSTRAP_REPORT
    echo RUN_ID: %JH_RUN_ID%
    echo REPORT_KIND: BOOTSTRAP
    echo GENERATED_AT_LOCAL: "%DATE% %TIME%"
    echo STATUS: %JH_STATUS%
    echo STOP_REASON: %JH_REASON%
    echo POWERSHELL_DISPATCHED: %JH_DISPATCHED%
    echo POWERSHELL_EXIT_CODE: %JH_PS_EXIT%
    if "%JH_DISPATCHED%"=="FALSE" (
        echo ANDROID_INSTALL_ATTEMPT_COUNT: 0
    ) else (
        echo ANDROID_INSTALL_ATTEMPT_COUNT: UNKNOWN
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
pause
if defined JH_PUSHED popd
exit /b %JH_EXIT_CODE%
