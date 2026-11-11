@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"
set "S24_SOURCE=%~dp0stage24_windows_oneclick.py"
set "S24_RESULT=%~dp0RESULT.txt"
if not exist "%S24_SOURCE%" goto NO_SOURCE
where py >nul 2>nul
if not errorlevel 1 goto USE_PY
where python >nul 2>nul
if not errorlevel 1 goto USE_PYTHON
> "%S24_RESULT%" echo BLOCKED_PYTHON_NOT_FOUND_NO_DEVICE_ACCESS
echo BLOCKED: Python 3.10 or later is required. No phone access.
set "RC=12"
goto FINISH
:USE_PY
py -3 "%S24_SOURCE%" --result "%S24_RESULT%"
set "RC=%ERRORLEVEL%"
goto FINISH
:USE_PYTHON
python "%S24_SOURCE%" --result "%S24_RESULT%"
set "RC=%ERRORLEVEL%"
goto FINISH
:NO_SOURCE
> "%S24_RESULT%" echo BLOCKED_STAGE24_SOURCE_MISSING
echo BLOCKED: Source missing. Nothing was executed.
set "RC=12"
:FINISH
echo.
echo G Glass read-only result: "%S24_RESULT%"
if not "%RC%"=="0" echo BLOCKED or cancelled. No phone changes.
if not defined CI pause
exit /b %RC%
