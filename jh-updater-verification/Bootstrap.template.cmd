@echo off
setlocal EnableExtensions DisableDelayedExpansion
title JHMCP FIX10 - One-pass verified update
set "JH_ONEPASS_SELF=%~f0"
set "JH_ONEPASS_OUT=%~dp0"
echo ==================================================
echo JHMCP FIX10 / 131 - ONE-PASS UPDATE
 echo No Gradle build. No app deletion. No key upload.
echo Use the SAME Windows PC and account as your existing JH app.
echo Keep ONE unlocked phone connected by USB.
echo ==================================================
where powershell.exe >nul 2>nul
if errorlevel 1 goto NO_PS
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; try { Add-Type -AssemblyName System.IO.Compression; Add-Type -AssemblyName System.IO.Compression.FileSystem; $raw=[IO.File]::ReadAllText($env:JH_ONEPASS_SELF); $mark='###JH_FIX10_ONEPASS_PAYLOAD###'; $at=$raw.LastIndexOf($mark); if($at -lt 0){throw 'Payload missing'}; $bytes=[Convert]::FromBase64String($raw.Substring($at+$mark.Length).Trim()); $h=[Security.Cryptography.SHA256]::Create(); try{$sum=[BitConverter]::ToString($h.ComputeHash($bytes)).Replace('-','').ToLowerInvariant()}finally{$h.Dispose()}; if($sum -cne '__PAYLOAD_SHA256__'){throw 'Package checksum mismatch. Nothing was installed.'}; $work=Join-Path ([IO.Path]::GetTempPath()) ('JHMCP-FIX10-'+[Guid]::NewGuid().ToString('N')); [void](New-Item -ItemType Directory -Path $work); $zip=Join-Path $work 'bundle.zip'; [IO.File]::WriteAllBytes($zip,$bytes); Expand-Archive -LiteralPath $zip -DestinationPath $work; $entry=Join-Path $work 'Run-OnePass.ps1'; foreach($file in @('Run-OnePass.ps1','JH.Update.Core.ps1')){$tokens=$null;$errors=$null;[void][System.Management.Automation.Language.Parser]::ParseFile((Join-Path $work $file),[ref]$tokens,[ref]$errors);if($errors.Count){throw 'PowerShell syntax check failed'}}; & $entry -OutputDirectory $env:JH_ONEPASS_OUT; exit $LASTEXITCODE } catch { Write-Host ('[STOP] '+$_.Exception.Message) -ForegroundColor Red; exit 1 }"
set "JH_ONEPASS_RC=%ERRORLEVEL%"
echo.
echo The result folder is next to this file. Do not run the older installer.
pause
exit /b %JH_ONEPASS_RC%
:NO_PS
echo [STOP] Windows PowerShell is not available. No action was performed.
pause
exit /b 2
###JH_FIX10_ONEPASS_PAYLOAD###
__PAYLOAD_BASE64__
