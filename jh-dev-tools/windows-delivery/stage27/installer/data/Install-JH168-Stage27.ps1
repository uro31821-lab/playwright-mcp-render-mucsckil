#requires -Version 5.1
param([string]$RunId)
# Stage27: verified existing APK, update only, at most one install, no UI action.
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$script:Root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$script:Data=Join-Path $script:Root 'data'
$script:Apk=Join-Path $script:Data 'JH168-Stage27-SIGNED.apk'
$script:ExpectedSha='129bcc55a9fbf04ebe2bb19d86958fd94f4dc6fd0969bb020105e7f162510359'
$script:ExpectedBytes=48884022
$script:ExpectedCert='7cc577efe48e865fdbe799b92aa9edf89724631361ae97979f2b8e4a940a288b'
$script:ExpectedPriorSha='1cba048cc64e0d381e9c1e2f2787197faa1e15b8ddaf0febadd91c0d17996852'
$script:SourceManifestSha='aa9a7fe1ddf30672fed68f62c58df9cf378047ae5c7f85911d3a2102d6623105'
$script:Package='com.koreanlifehub.bridge'
$script:TargetVersion=168
$script:SafetyHash='a7c6c5f45c92e65453cb7dd682bbf46d634e846404e309633fa5b713a00127f0'
$script:DeliveryManifestHash='e7aafd90332e1a95493c06ccf323ce40a8636ef79eaaf4c5c3ded0741d59cc41'
$script:AttemptCount=0
$script:Dispatched=$false
$script:TemporaryPaths=@()
$script:Lines=@('JH168_STAGE27: OWNER_TRIGGERED_EXISTING_APP_UPDATE',
 'PACKAGE: com.koreanlifehub.bridge','TARGET_VERSION_CODE: 168',
 ('EXPECTED_SIGNED_APK_SHA256: '+$script:ExpectedSha),('EXPECTED_CERTIFICATE_SHA256: '+$script:ExpectedCert),
 'BUILD_OR_SIGN_IN_INSTALLER: NOT_RUN','SERVER_DEPLOY: NOT_RUN','DEVICE_E2E: NOT_RUN',
 'PHONE_APPROVAL_OR_SECURITY_BYPASS: NONE','UNINSTALL_OR_DATA_WIPE: NEVER','AUTO_RETRY: FORBIDDEN')

function Note([string]$key,[string]$value) {
    $script:Lines+=($key+': '+$value)
    Write-Host ($key+': '+$value)
}
function New-JhOutcome([string]$status,[string]$reason) {
    return [PSCustomObject]@{Status=$status;Reason=$reason}
}
function Get-JhFailureOutcome([Exception]$Failure) {
    $reason=$Failure.Message -replace '[\r\n]',' '
    if($reason.Length -gt 200){$reason=$reason.Substring(0,200)}
    $status=if($script:Dispatched){'UNKNOWN'}else{'BLOCKED'}
    return New-JhOutcome $status $reason
}
function Write-JhEmergencyResult([string]$id,[string]$reason) {
    # This minimal writer is used only before the hash-verified helper is loaded.
    $bases=@($script:Root,$env:LOCALAPPDATA,[IO.Path]::GetTempPath())
    foreach($basePath in $bases){
        if([string]::IsNullOrWhiteSpace($basePath)){continue}
        $directory=Join-Path $basePath ('JH27-Emergency-'+$id+'-'+[guid]::NewGuid().ToString('N'))
        $stream=$null;$writer=$null
        try{
            [void][IO.Directory]::CreateDirectory($directory)
            $path=Join-Path $directory 'RESULT.txt'
            $stream=[IO.File]::Open($path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
            $writer=[IO.StreamWriter]::new($stream,[Text.UTF8Encoding]::new($true))
            foreach($line in @('JH168_STAGE27: EMERGENCY_BEFORE_DEVICE_ACTION',('RUN_ID: '+$id),
                'REPORT_KIND: INSTALLER','STATUS: BLOCKED','ANDROID_INSTALL_ATTEMPT_COUNT: 0',
                ('GENERATED_AT_UTC: '+[DateTime]::UtcNow.ToString('o')),('STOP_REASON: '+$reason),
                'AUTO_RETRY: FORBIDDEN',('RESULT_PATH: '+$path))){$writer.WriteLine($line)}
            $writer.Flush();$stream.Flush($true);$writer.Dispose();$writer=$null;$stream=$null
            Write-Host ('RESULT_PATH: '+$path)
            return $true
        }catch{}finally{if($null -ne $writer){$writer.Dispose()}elseif($null -ne $stream){$stream.Dispose()}}
    }
    Write-Host 'RESULT_WRITE_FAILED: no emergency result was saved.'
    return $false
}

function Test-JhStage27Preflight([string]$Kit) {
    if($PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1 -or $env:OS -ne 'Windows_NT'){
        throw 'WINDOWS_POWERSHELL_5_1_REQUIRED'
    }
    $manifestPath=Join-Path $Kit 'data\INSTALL-MANIFEST.json'
    if(-not [IO.File]::Exists($manifestPath)){throw 'DELIVERY_MANIFEST_MISSING'}
    if((Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $script:DeliveryManifestHash){throw 'DELIVERY_MANIFEST_SHA256_MISMATCH'}
    $manifest=[IO.File]::ReadAllText($manifestPath)|ConvertFrom-Json
    if($manifest.schema -cne 'JH168_STAGE27_INSTALL_ONLY_V1' -or
       $manifest.candidate_sha256 -cne $script:ExpectedSha -or $manifest.certificate_sha256 -cne $script:ExpectedCert -or
       $manifest.prior_sha256 -cne $script:ExpectedPriorSha -or [int]$manifest.version_code -ne 168 -or
       $manifest.source_manifest_sha256 -cne $script:SourceManifestSha){throw 'DELIVERY_MANIFEST_CONTRACT_MISMATCH'}
    $expectedPaths=@('실행.cmd','사용안내.txt','POWER_SHELL_ERROR_CHECKLIST.txt',
        'data/JH-RUN-SAFETY.ps1','data/Confirm-Stage27-Result.ps1',
        'data/STAGE27-SIGNATURE-VERIFICATION.json','data/JH168-Stage27-SIGNED.apk')
    $observedPaths=@($manifest.files|ForEach-Object {$_.path})
    if($observedPaths.Count -ne $expectedPaths.Count -or @($observedPaths|Select-Object -Unique).Count -ne $expectedPaths.Count){throw 'DELIVERY_REQUIRED_FILES_INVALID'}
    foreach($relative in $expectedPaths){
        if($observedPaths -cnotcontains $relative){throw 'DELIVERY_REQUIRED_FILES_INVALID'}
        $item=@($manifest.files|Where-Object {$_.path -ceq $relative})[0]
        $path=[IO.Path]::GetFullPath((Join-Path $Kit $relative.Replace('/','\')))
        if($path.Length -gt 225){throw 'EXTRACTED_PATH_TOO_LONG_BEFORE_INSTALL'}
        if(-not [IO.File]::Exists($path)){throw ('REQUIRED_FILE_MISSING:'+ $relative)}
        if((Get-Item -LiteralPath $path).Length -ne [long]$item.size -or
           (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -cne $item.sha256){throw ('REQUIRED_FILE_HASH_MISMATCH:'+ $relative)}
    }
    $scriptNames=@('data/Install-JH168-Stage27.ps1','data/JH-RUN-SAFETY.ps1','data/Confirm-Stage27-Result.ps1')
    $automatic=@('matches','pid','home','host','args','input','error','pshome','pwd','foreach','switch','this','psitem','_','lastexitcode','null','true','false','psversiontable','psscriptroot','pscommandpath')
    foreach($relative in $scriptNames){
        $path=Join-Path $Kit $relative.Replace('/','\')
        if($path.Length -gt 225 -or -not [IO.File]::Exists($path)){throw 'SCRIPT_PATH_INVALID'}
        $bytes=[IO.File]::ReadAllBytes($path)
        if($bytes.Length -lt 3 -or $bytes[0] -ne 239 -or $bytes[1] -ne 187 -or $bytes[2] -ne 191){throw 'POWERSHELL_UTF8_BOM_REQUIRED'}
        $tokens=$null;$parseErrors=$null
        $ast=[Management.Automation.Language.Parser]::ParseFile($path,[ref]$tokens,[ref]$parseErrors)
        if($parseErrors -and $parseErrors.Count -gt 0){throw ('POWERSHELL_PARSE_ERROR:'+ $relative)}
        foreach($fn in $ast.FindAll({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst]},$true)){
            if(Get-Alias -Name $fn.Name -ErrorAction SilentlyContinue){throw ('FUNCTION_ALIAS_COLLISION:'+ $fn.Name)}
        }
        foreach($assignment in $ast.FindAll({param($node) $node -is [Management.Automation.Language.AssignmentStatementAst]},$true)){
            if($assignment.Left -is [Management.Automation.Language.VariableExpressionAst]){
                $name=$assignment.Left.VariablePath.UserPath.Split(':')[-1].ToLowerInvariant()
                if($automatic -contains $name){throw ('AUTOMATIC_VARIABLE_ASSIGNMENT:'+ $name)}
            }
        }
        foreach($parameter in $ast.FindAll({param($node) $node -is [Management.Automation.Language.ParameterAst]},$true)){
            $name=$parameter.Name.VariablePath.UserPath.Split(':')[-1].ToLowerInvariant()
            if($automatic -contains $name){throw ('AUTOMATIC_VARIABLE_PARAMETER:'+ $name)}
        }
    }
    $cmdBytes=[IO.File]::ReadAllBytes((Join-Path $Kit '실행.cmd'))
    if(@($cmdBytes|Where-Object {$_ -gt 127}).Count -gt 0 -or [Text.Encoding]::ASCII.GetString($cmdBytes) -match '(?<!\r)\n'){
        throw 'CMD_ASCII_CRLF_REQUIRED'
    }
    foreach($check in @('REQUIRED_FILES','SCRIPT_PATHS','UTF8_BOM_AND_CMD_CRLF','POWERSHELL_PARSE','FUNCTION_ALIAS','AUTOMATIC_VARIABLES','PATH_LENGTH','DELIVERY_HASHES','CHECKLIST_CONNECTED')){Note ('PREFLIGHT_'+$check) 'PASS'}
}

function Run-Exe([string]$exe,[string[]]$arguments,[int]$timeoutSeconds=90) {
 if(-not [System.IO.File]::Exists($exe)) { throw 'EXECUTABLE_MISSING' }
 $psi = [System.Diagnostics.ProcessStartInfo]::new()
 $psi.FileName = $exe
 $psi.UseShellExecute = $false
 $psi.CreateNoWindow = $true
 $psi.RedirectStandardOutput = $true
 $psi.RedirectStandardError = $true
 # Quote every argument. No argument supplied by this bundle contains literal quotes.
 $quoted = @()
 foreach($a in $arguments) {
  if($null -eq $a -or $a.Contains('"')) { throw 'NATIVE_ARGUMENT_INVALID' }
  $quoted += ('"'+$a+'"')
 }
 $psi.Arguments = $quoted -join ' '
 $p = [System.Diagnostics.Process]::new()
 try {
  $p.StartInfo = $psi
  if(-not $p.Start()) { throw 'PROCESS_START_FAILED' }
  $stdout = $p.StandardOutput.ReadToEndAsync()
  $stderr = $p.StandardError.ReadToEndAsync()
  if(-not $p.WaitForExit($timeoutSeconds * 1000)) {
   try { $p.Kill() } catch {}
   throw 'NATIVE_COMMAND_TIMEOUT_RESULT_UNCONFIRMED'
  }
  $p.WaitForExit()
  $outText = $stdout.GetAwaiter().GetResult()
  $errText = $stderr.GetAwaiter().GetResult()
  return @{ ExitCode=$p.ExitCode; Output=$outText; Error=$errText }
 } finally { $p.Dispose() }
}
function Find-Exe([string[]]$paths,[string]$name) {
 foreach ($p in $paths) {
  if($p -and [System.IO.File]::Exists($p)) {return [System.IO.Path]::GetFullPath($p)}
 }
 $c=Get-Command $name -ErrorAction SilentlyContinue
 if($c -and $c.Source -and (Test-Path -LiteralPath $c.Source -PathType Leaf)){return $c.Source}
 return $null
}
function Get-SdkRoots {
 $list=@()
 if($env:ANDROID_SDK_ROOT) { $list += $env:ANDROID_SDK_ROOT }
 if($env:ANDROID_HOME) { $list += $env:ANDROID_HOME }
 if($env:LOCALAPPDATA) { $list += (Join-Path $env:LOCALAPPDATA 'Android\Sdk') }
 if($env:USERPROFILE) { $list += (Join-Path $env:USERPROFILE 'AppData\Local\Android\Sdk') }
 return @($list | Select-Object -Unique)
}
function Verify-Signer([string]$java,[string]$jar,[string]$file) {
 $r=Run-Exe $java @('-jar',$jar,'verify','--verbose','--print-certs',$file) 90
 if($r.ExitCode -ne 0) { return @{Ok=$false; Code='APK_SIGNATURE_VERIFY_ERROR'} }
 $m=[regex]::Match($r.Output,'Signer #1 certificate SHA-256 digest:\s*([0-9a-fA-F]{64})')
 $n=[regex]::Match($r.Output,'Number of signers:\s*(\d+)')
 $v2=($r.Output -match 'Verified using v2 scheme .*?:\s*true')
 $v3=($r.Output -match 'Verified using v3 scheme .*?:\s*true')
 if(-not $m.Success -or -not $n.Success -or $n.Groups[1].Value -ne '1' -or (-not $v2 -and -not $v3)) {
   return @{Ok=$false;Code='APK_SIGNER_OR_SCHEME_INVALID'}
 }
 return @{Ok=$true;Cert=$m.Groups[1].Value.ToLowerInvariant();V2=$v2;V3=$v3}
}
function Get-Installed([string]$adb,[string]$serial,[string]$package) {
 $pm=Run-Exe $adb @('-s',$serial,'shell','pm','path',$package) 40
 if($pm.ExitCode -ne 0) { throw 'PACKAGE_PATH_QUERY_FAILED' }
 $m=[regex]::Matches($pm.Output,'(?m)^package:(.+?\.apk)\s*$')
 $base=@()
 foreach($row in $m) { if($row.Groups[1].Value -match '(^|/)base\.apk$'){ $base += $row.Groups[1].Value.Trim() } }
 if($base.Count -eq 0) { throw 'EXISTING_APP_NOT_FOUND_UPDATE_ONLY' }
 if($base.Count -ne 1) { throw 'EXISTING_BASE_APK_AMBIGUOUS' }
 $ds=Run-Exe $adb @('-s',$serial,'shell','dumpsys','package',$package) 50
 if($ds.ExitCode -ne 0) { throw 'INSTALLED_PACKAGE_DETAILS_UNAVAILABLE' }
 $match=[regex]::Match($ds.Output,'(?m)^\s*versionCode=(\d+)\b')
 if(-not $match.Success) { throw 'INSTALLED_VERSION_UNCONFIRMED' }
 return @{BasePath=$base[0];Version=[int]$match.Groups[1].Value}
}
function Pull-Apk([string]$adb,[string]$serial,[string]$basePath,[string]$destination) {
 if(Test-Path -LiteralPath $destination) { throw 'TEMP_APK_PATH_EXISTS_NO_OVERWRITE' }
 $pulled=Run-Exe $adb @('-s',$serial,'pull',$basePath,$destination) 180
 if($pulled.ExitCode -ne 0 -or -not [System.IO.File]::Exists($destination)) {
  throw 'EXISTING_APP_APK_READ_NOT_ALLOWED_NO_INSTALL'
 }
}

function Get-JhOneReadyDevice([string]$deviceOutput) {
    $rows=@()
    foreach($line in ($deviceOutput -split '\r?\n')){
        $trimmed=$line.Trim()
        if($trimmed.Length -eq 0 -or $trimmed -eq 'List of devices attached' -or $trimmed -match '^\* daemon '){continue}
        $rowMatch=[regex]::Match($trimmed,'^(\S+)\s+(\S+)(?:\s+.*)?$')
        if(-not $rowMatch.Success){throw 'ADB_DEVICE_LIST_UNPARSEABLE_NO_INSTALL'}
        $rows+=[PSCustomObject]@{Serial=$rowMatch.Groups[1].Value;State=$rowMatch.Groups[2].Value}
    }
    if($rows.Count -ne 1){throw 'EXACTLY_ONE_ANDROID_DEVICE_REQUIRED'}
    if($rows[0].State -ceq 'unauthorized'){throw 'ADB_PHONE_USB_DEBUG_AUTHORIZATION_REQUIRED'}
    if($rows[0].State -cne 'device'){throw 'ANDROID_DEVICE_NOT_READY'}
    return $rows[0].Serial
}

function New-JhOwnedTempApk {
    $path=[IO.Path]::Combine([IO.Path]::GetTempPath(),('jh168-stage27-'+[guid]::NewGuid().ToString('N')+'.apk'))
    if(Test-Path -LiteralPath $path){throw 'UNIQUE_TEMP_PATH_ALREADY_EXISTS'}
    $script:TemporaryPaths+=$path
    return $path
}

function Invoke-JhStage27Install {
    if(-not [IO.File]::Exists($script:Apk)){return New-JhOutcome 'BLOCKED' 'SIGNED_APK_MISSING'}
    if((Get-Item -LiteralPath $script:Apk).Length -ne $script:ExpectedBytes -or
       (Get-FileHash -LiteralPath $script:Apk -Algorithm SHA256).Hash.ToLowerInvariant() -cne $script:ExpectedSha){
        return New-JhOutcome 'BLOCKED' 'SIGNED_APK_SHA256_OR_SIZE_MISMATCH'
    }
    Note 'SIGNED_APK_HASH' 'MATCH'
    $sdkRoots=Get-SdkRoots
    $adbChoices=@();$aaptChoices=@();$jarChoices=@()
    foreach($sdk in $sdkRoots){
        $adbChoices+=(Join-Path $sdk 'platform-tools\adb.exe')
        foreach($ver in @('35.0.0','34.0.0')){
            $aaptChoices+=(Join-Path $sdk ('build-tools\'+$ver+'\aapt.exe'))
            $jarChoices+=(Join-Path $sdk ('build-tools\'+$ver+'\lib\apksigner.jar'))
        }
    }
    $adb=Find-Exe $adbChoices 'adb.exe';if(-not $adb){return New-JhOutcome 'BLOCKED' 'ADB_NOT_FOUND_USE_EXISTING_ANDROID_SDK_PLATFORM_TOOLS'}
    $aapt=Find-Exe $aaptChoices 'aapt.exe';if(-not $aapt){return New-JhOutcome 'BLOCKED' 'ANDROID_AAPT_NOT_FOUND'}
    $jar=Find-Exe $jarChoices 'apksigner.jar';if(-not $jar){return New-JhOutcome 'BLOCKED' 'ANDROID_APKSIGNER_JAR_NOT_FOUND'}
    $javaChoices=@();if($env:JAVA_HOME){$javaChoices+=(Join-Path $env:JAVA_HOME 'bin\java.exe')}
    $java=Find-Exe $javaChoices 'java.exe';if(-not $java){return New-JhOutcome 'BLOCKED' 'JAVA_NOT_FOUND'}
    $pkgInfo=Run-Exe $aapt @('dump','badging',$script:Apk) 80
    if($pkgInfo.ExitCode -ne 0 -or -not [regex]::IsMatch($pkgInfo.Output,"(?m)^package:\s+name='com\.koreanlifehub\.bridge'\s+versionCode='168'")){
        return New-JhOutcome 'BLOCKED' 'APK_PACKAGE_OR_VERSION_MISMATCH'
    }
    $signed=Verify-Signer $java $jar $script:Apk
    if(-not $signed.Ok -or $signed.Cert -cne $script:ExpectedCert){return New-JhOutcome 'BLOCKED' 'SIGNED_APK_CERTIFICATE_MISMATCH'}
    Note 'SIGNED_APK_PACKAGE_VERSION' 'MATCH';Note 'SIGNED_APK_CERTIFICATE' 'MATCH'
    $devices=Run-Exe $adb @('devices','-l') 80
    if($devices.ExitCode -ne 0){return New-JhOutcome 'BLOCKED' 'ADB_DEVICES_FAILED'}
    $serial=Get-JhOneReadyDevice $devices.Output
    Note 'DEVICE_COUNT' 'EXACTLY_ONE_READY'
    $installed=Get-Installed $adb $serial $script:Package
    Note 'INSTALLED_VERSION_BEFORE' ([string]$installed.Version)
    if($installed.Version -ne $script:TargetVersion){return New-JhOutcome 'BLOCKED' 'INSTALLED_VERSION_NOT_EXPECTED_STAGE26_NO_INSTALL'}
    $beforeTemp=New-JhOwnedTempApk
    Pull-Apk $adb $serial $installed.BasePath $beforeTemp
    $oldSigner=Verify-Signer $java $jar $beforeTemp
    if(-not $oldSigner.Ok -or $oldSigner.Cert -cne $script:ExpectedCert){return New-JhOutcome 'BLOCKED' 'INSTALLED_CERTIFICATE_NOT_EQUAL_TO_ORIGINAL'}
    $oldHash=(Get-FileHash -LiteralPath $beforeTemp -Algorithm SHA256).Hash.ToLowerInvariant()
    if($oldHash -ceq $script:ExpectedSha){
        Note 'APK_BYTES_ALREADY_INSTALLED' 'TRUE'
        return New-JhOutcome 'REUSED_PASS' 'EXACT_STAGE27_APK_ALREADY_INSTALLED_NO_REINSTALL'
    }
    if($oldHash -cne $script:ExpectedPriorSha){return New-JhOutcome 'BLOCKED' 'INSTALLED_STAGE26_BASELINE_HASH_UNEXPECTED_NO_INSTALL'}
    $marker=Get-JhInstallAttemptPath $script:ExpectedSha $serial
    if(Test-Path -LiteralPath $marker){return New-JhOutcome 'BLOCKED' 'PRIOR_INSTALL_ATTEMPT_RECORDED_NO_AUTOMATIC_RETRY'}
    $created=New-JhInstallAttempt $script:ExpectedSha $serial $script:ExpectedCert $script:CurrentRunId
    if($created -cne $marker){throw 'PERSISTENT_ATTEMPT_IDENTITY_MISMATCH_NO_INSTALL'}
    Note 'PERSISTENT_ATTEMPT_MARKER' 'CREATED_BEFORE_DISPATCH'
    $script:AttemptCount=1
    $script:Dispatched=$true
    $job=Run-Exe $adb @('-s',$serial,'install','-r',$script:Apk) 300
    if($job.ExitCode -ne 0 -or $job.Output -notmatch '(?m)^Success\s*$'){
        return New-JhOutcome 'UNKNOWN' 'INSTALL_RETURNED_NON_SUCCESS_EFFECT_UNCONFIRMED_NO_RETRY'
    }
    Note 'ADB_INSTALL_COMMAND_RESULT' 'SUCCESS'
    $after=Get-Installed $adb $serial $script:Package
    if($after.Version -ne $script:TargetVersion){return New-JhOutcome 'UNKNOWN' 'POST_INSTALL_VERSION_UNCONFIRMED_NO_RETRY'}
    $afterTemp=New-JhOwnedTempApk
    Pull-Apk $adb $serial $after.BasePath $afterTemp
    $postCert=Verify-Signer $java $jar $afterTemp
    $postHash=(Get-FileHash -LiteralPath $afterTemp -Algorithm SHA256).Hash.ToLowerInvariant()
    if(-not $postCert.Ok -or $postCert.Cert -cne $script:ExpectedCert -or $postHash -cne $script:ExpectedSha){
        return New-JhOutcome 'UNKNOWN' 'POST_INSTALL_CERT_OR_BYTES_UNCONFIRMED_NO_RETRY'
    }
    Note 'INSTALLED_VERSION_AFTER' ([string]$after.Version)
    Note 'INSTALLED_SHA256' 'MATCH';Note 'INSTALLED_CERTIFICATE' 'MATCH'
    Note 'NEXT' 'VERIFY_CHROME_MENU_COMPLETION_AND_SIGNED_RESULT_ACK_STAGE27'
    return New-JhOutcome 'NEW_PASS' 'ANDROID_PACKAGE_VERSION_CERTIFICATE_AND_BYTES_VERIFIED'
}

$helperLoaded=$false;$runLock=$null;$mutex=$null;$mutexOwned=$false;$resultSaved=$false;$exitCode=30
$script:CurrentRunId=if([string]::IsNullOrWhiteSpace($RunId)){[guid]::NewGuid().ToString('N')}else{$RunId}
if($script:CurrentRunId -cnotmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$'){$script:CurrentRunId=[guid]::NewGuid().ToString('N');$invalidId=$true}else{$invalidId=$false}
try {
    if($invalidId){throw 'INVALID_RUN_ID'}
    $safety=Join-Path $script:Data 'JH-RUN-SAFETY.ps1'
    if(-not [IO.File]::Exists($safety) -or (Get-FileHash -LiteralPath $safety -Algorithm SHA256).Hash.ToLowerInvariant() -cne $script:SafetyHash){throw 'SAFETY_HELPER_MISSING_OR_HASH_MISMATCH'}
    . $safety
    $helperLoaded=$true
    $runLock=Enter-JhRunLock $script:Root $script:CurrentRunId
    $mutex=[Threading.Mutex]::new($false,'Local\JH168_STAGE27_SINGLE_UPDATE')
    $mutexOwned=$mutex.WaitOne(0)
    if(-not $mutexOwned){throw 'ANOTHER_STAGE27_INSTALLER_RUNNING'}
    $archived=Move-JhPreviousResult $script:Root $script:CurrentRunId $runLock
    if($archived){Note 'PREVIOUS_RESULT_PRESERVED_AT' $archived}
    Test-JhStage27Preflight $script:Root
    $outcome=Invoke-JhStage27Install
} catch {
    $outcome=Get-JhFailureOutcome $_.Exception
} finally {
    # Only uniquely named temporary readback copies created by this run are removed.
    foreach($ownedPath in $script:TemporaryPaths){
        try{if([IO.File]::Exists($ownedPath)){[IO.File]::Delete($ownedPath)}}catch{}
    }
}
try {
    Note 'STOP_REASON' $outcome.Reason
    if($helperLoaded){
        $saved=Write-JhRunResult -Kit $script:Root -RunId $script:CurrentRunId -Kind 'INSTALLER' -Status $outcome.Status `
            -AttemptCount ([int]$script:AttemptCount) -Lines $script:Lines -AllowPrimary ($null -ne $runLock)
        $resultSaved=$saved.Saved
        if($saved.Saved){$exitCode=Get-JhOutcomeExitCode $outcome.Status}
    }else{
        $resultSaved=Write-JhEmergencyResult $script:CurrentRunId $outcome.Reason
        if($resultSaved){$exitCode=21}
    }
} catch {
    Write-Host 'RESULT_WRITE_FAILED: report persistence failed; preserve this window.'
} finally {
    if($null -ne $mutex){if($mutexOwned){try{$mutex.ReleaseMutex()}catch{}};$mutex.Dispose()}
    if($helperLoaded){Exit-JhRunLock $runLock}elseif($null -ne $runLock){$runLock.Dispose()}
}
exit $exitCode
