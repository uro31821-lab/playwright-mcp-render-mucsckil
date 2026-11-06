@echo off
setlocal DisableDelayedExpansion
chcp 65001 >nul
set "KABISEO_START_ROOT=%~dp0"
set "KABISEO_START_ID=%RANDOM%-%RANDOM%-%RANDOM%"
set "KABISEO_PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
REM Limit this child process to OS-bundled Windows PowerShell modules. A pwsh7
REM parent through cmd can otherwise pass incompatible module paths. SETLOCAL
REM restores this variable at exit; no policy, registry, profile or disk edits.
set "PSModulePath=%SystemRoot%\System32\WindowsPowerShell\v1.0\Modules"
echo KaBiseo startup check FIX1. No phone connection is needed.
echo This checks script loading only. It does not start ADB or change security settings.
if not exist "%KABISEO_PS%" goto missing_ps
REM Fixed diagnostic command only. The original script is loaded with normal -File
REM policy enforcement and -LibraryOnly. Never evaluate its text or run camera Main.
"%KABISEO_PS%" -NoLogo -NoProfile -NonInteractive -Command "$ErrorActionPreference='Stop'; $root=$env:KABISEO_START_ROOT; $id=$env:KABISEO_START_ID; $result=Join-Path $root 'RESULT.txt'; $logs=Join-Path $root 'logs'; $lock=$null; $busy=$false; $code=2; $r=[ordered]@{schema='KABISEO_STARTUP_DIAGNOSTIC_V022_FIX1';status='BLOCKED';reason='DIAGNOSTIC_INCOMPLETE';runId=$id;powershellVersion=$PSVersionTable.PSVersion.ToString();languageMode=$ExecutionContext.SessionState.LanguageMode.ToString();effectivePolicy=$null;policyScopes=@();scriptExists=$false;scriptSha256=$null;internetZoneDetected=$null;parserErrorIds=@();childExitCode=$null;errorIdentifiers=@();scriptLoadAttempted=$false;phoneAccessAttempted=$false;cameraObservation='NOT_RUN';securitySettingsChanged=$false;rawErrorSaved=$false}; try { if($r.languageMode -ne 'FullLanguage'){ $r.reason='POWERSHELL_LANGUAGE_MODE_RESTRICTED' } else { try { $lock=[IO.File]::Open((Join-Path $root '.startup.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None) } catch { $busy=$true; Write-Host 'Startup check is already running or folder cannot be locked.'; exit 3 }; $r.effectivePolicy=[string](Get-ExecutionPolicy); $r.policyScopes=@(Get-ExecutionPolicy -List | ForEach-Object { [ordered]@{scope=[string]$_.Scope;policy=[string]$_.ExecutionPolicy} }); $s=Join-Path $root 'data\probe.ps1'; $r.scriptExists=Test-Path -LiteralPath $s -PathType Leaf; if(-not $r.scriptExists){ $r.reason='PACKAGE_DATA_FILE_MISSING' } else { $r.scriptSha256=(Get-FileHash -LiteralPath $s -Algorithm SHA256).Hash.ToLowerInvariant(); $zone=Get-Content -LiteralPath $s -Stream Zone.Identifier -ErrorAction SilentlyContinue; $r.internetZoneDetected=([string]($zone -join [char]10) -match '(?m)^ZoneId=(3|4)\s*$'); $tokens=$null; $errors=$null; [void][System.Management.Automation.Language.Parser]::ParseFile($s,[ref]$tokens,[ref]$errors); $r.parserErrorIds=@($errors | ForEach-Object { if($_.ErrorId -match '^[A-Za-z0-9_.:-]{1,120}$'){$_.ErrorId} }); if($errors.Count -gt 0){ $r.reason='SCRIPT_PARSE_ERROR' } else { $pi=New-Object Diagnostics.ProcessStartInfo; $pi.FileName=$env:KABISEO_PS; $pi.Arguments='-NoLogo -NoProfile -NonInteractive -File '+[char]34+$s+[char]34+' -LibraryOnly'; $pi.UseShellExecute=$false; $pi.CreateNoWindow=$true; $pi.RedirectStandardOutput=$true; $pi.RedirectStandardError=$true; $p=New-Object Diagnostics.Process; $p.StartInfo=$pi; try { $r.scriptLoadAttempted=$true; if(-not $p.Start()){throw 'CHILD_START_FAILED'}; $stdout=$p.StandardOutput.ReadToEndAsync(); $stderr=$p.StandardError.ReadToEndAsync(); if(-not $p.WaitForExit(30000)){ $p.Kill(); $r.reason='SCRIPT_LOAD_TIMEOUT' } else { $r.childExitCode=$p.ExitCode; $err=$stderr.GetAwaiter().GetResult(); [void]$stdout.GetAwaiter().GetResult(); foreach($known in @('PSSecurityException','UnauthorizedAccess','ParserError','CommandNotFoundException','FileNotFoundException','ParameterBindingException')){ if($err -match ('\b'+$known+'\b')){$r.errorIdentifiers+= $known} }; if($p.ExitCode -eq 0){ $r.status='STARTUP_ONLY_PASS'; $r.reason='SCRIPT_LOADED_NO_PHONE_ACCESS'; $code=0 } elseif($r.errorIdentifiers -contains 'PSSecurityException'){ $r.reason='SCRIPT_POLICY_OR_SIGNATURE_BLOCKED' } else { $r.reason='SCRIPT_LOAD_FAILED' } } } finally { $p.Dispose() } } } } } catch { $r.reason='DIAGNOSTIC_READ_FAILED'; if($_.FullyQualifiedErrorId -match '^[A-Za-z0-9_.:,-]{1,160}$'){$r.errorIdentifiers+= $_.FullyQualifiedErrorId} } finally { try { if(-not $busy){ if(-not (Test-Path -LiteralPath $logs)){New-Item -ItemType Directory -Path $logs | Out-Null}; if(Test-Path -LiteralPath $result){Copy-Item -LiteralPath $result -Destination (Join-Path $logs ('previous-'+$id+'.txt'))}; $json=$r | ConvertTo-Json -Depth 5; Set-Content -LiteralPath (Join-Path $logs ('startup-'+$id+'.json')) -Value $json -Encoding UTF8; Set-Content -LiteralPath $result -Value $json -Encoding UTF8; Set-Content -LiteralPath (Join-Path $logs ('receipt-'+$id+'.ok')) -Value 'REPORT_WRITTEN' -Encoding ASCII; Write-Host ('Result: '+$r.reason) } } finally { if($null -ne $lock){$lock.Dispose()} } }; exit $code"
set "DIAG_EXIT=%ERRORLEVEL%"
if "%DIAG_EXIT%"=="3" goto busy
if exist "%~dp0logs\receipt-%KABISEO_START_ID%.ok" goto done
if not exist "%~dp0logs" mkdir "%~dp0logs" 2>nul
if exist "%~dp0RESULT.txt" copy /y "%~dp0RESULT.txt" "%~dp0logs\previous-%KABISEO_START_ID%.txt" >nul 2>nul
>"%~dp0RESULT.txt" echo schema=KABISEO_STARTUP_DIAGNOSTIC_V022_FIX1
>>"%~dp0RESULT.txt" echo status=BLOCKED
>>"%~dp0RESULT.txt" echo reason=POWERSHELL_DIAGNOSTIC_BOOTSTRAP_FAILED
>>"%~dp0RESULT.txt" echo processExitCode=%DIAG_EXIT%
>>"%~dp0RESULT.txt" echo phoneAccessAttempted=false
>>"%~dp0RESULT.txt" echo cameraObservation=NOT_RUN
goto done
:missing_ps
set "DIAG_EXIT=2"
if not exist "%~dp0logs" mkdir "%~dp0logs" 2>nul
if exist "%~dp0RESULT.txt" copy /y "%~dp0RESULT.txt" "%~dp0logs\previous-%KABISEO_START_ID%.txt" >nul 2>nul
>"%~dp0RESULT.txt" echo status=BLOCKED
>>"%~dp0RESULT.txt" echo reason=WINDOWS_POWERSHELL_NOT_FOUND
>>"%~dp0RESULT.txt" echo phoneAccessAttempted=false
goto done
:busy
echo Already running or folder unavailable. Do not start another copy.
:done
echo.
echo Attach only RESULT.txt. No camera, ADB, installation or security-policy change was performed.
pause
exit /b %DIAG_EXIT%
