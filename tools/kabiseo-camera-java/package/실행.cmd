@echo off
setlocal DisableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"
set "JH_JAVA="
if defined JAVA_HOME_17_X64 if exist "%JAVA_HOME_17_X64%\bin\javac.exe" set "JH_JAVA=%JAVA_HOME_17_X64%\bin\java.exe"
if not defined JH_JAVA if defined JAVA_HOME if exist "%JAVA_HOME%\bin\javac.exe" set "JH_JAVA=%JAVA_HOME%\bin\java.exe"
if not defined JH_JAVA for /d %%D in ("%ProgramFiles%\Eclipse Adoptium\jdk-17*" "%ProgramFiles%\Java\jdk-17*" "%ProgramFiles%\Microsoft\jdk-17*" "%USERPROFILE%\.jdks\*") do if exist "%%~D\bin\javac.exe" set "JH_JAVA=%%~D\bin\java.exe"
if not defined JH_JAVA if exist "%ProgramFiles%\Android\Android Studio\jbr\bin\javac.exe" set "JH_JAVA=%ProgramFiles%\Android\Android Studio\jbr\bin\java.exe"
if not defined JH_JAVA for /f "delims=" %%J in ('where javac.exe 2^>nul') do if exist "%%~dpJjava.exe" set "JH_JAVA=%%~dpJjava.exe"
if not defined JH_JAVA goto nojava
if not exist "%JH_JAVA%" goto nojava
if not exist "%~dp0data\CameraRouteProbe.java" goto missing
echo 카비서 촬영 경로 점검 FIX2 - 기존 Java 사용, PowerShell 사용 안 함
rem Java17 native argument encoding can lose Unicode absolute arguments.
rem The working directory is already this exact package; no relocation needed.
"%JH_JAVA%" -Dfile.encoding=UTF-8 --source 17 "data\CameraRouteProbe.java" "."
set "JH_EXIT=%ERRORLEVEL%"
if "%JH_EXIT%"=="3" goto done
if "%JH_EXIT%"=="1" goto javastart
if not exist "%~dp0RESULT.txt" goto javastart
goto done
:javastart
if not exist "%~dp0logs" mkdir "%~dp0logs"
if exist "%~dp0RESULT.txt" copy /y "%~dp0RESULT.txt" "%~dp0logs\previous-%RANDOM%-%RANDOM%.txt" >nul
>"%~dp0RESULT.txt" echo {"status":"BLOCKED","reason":"JAVA_START_FAILED","phoneAccessAttempted":false,"powerShellUsed":false}
goto done
:nojava
set "JH_EXIT=2"
if not exist "%~dp0logs" mkdir "%~dp0logs"
if exist "%~dp0RESULT.txt" copy /y "%~dp0RESULT.txt" "%~dp0logs\previous-%RANDOM%-%RANDOM%.txt" >nul
>"%~dp0RESULT.txt" echo {"status":"BLOCKED","reason":"EXISTING_JDK_NOT_FOUND","phoneAccessAttempted":false,"securitySettingsChanged":false,"powerShellUsed":false}
echo 기존 Java를 찾지 못했습니다. 새 설치는 하지 않았습니다.
goto done
:missing
set "JH_EXIT=2"
>"%~dp0RESULT.txt" echo {"status":"BLOCKED","reason":"PACKAGE_SOURCE_MISSING","phoneAccessAttempted":false}
:done
echo.
echo 같은 폴더의 RESULT.txt만 올려 주세요. 보안 설정을 끄지 마세요.
pause
exit /b %JH_EXIT%
