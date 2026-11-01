param([string]$RunId='')
# Verified binary reuse only. No Gradle, key generation, uninstall, UI or server calls.
$ErrorActionPreference='Stop'
$Kit=Split-Path -Parent $PSScriptRoot
$Id=[guid]::NewGuid().ToString('N')
$Rows=New-Object 'System.Collections.Generic.List[string]'
$RunLock=$null; $CacheLock=$null; $Receipt=$null; $SafetyReady=$false
$AllowPrimary=$false; $AttemptCount=0; $InstallDispatched=$false
$State='BLOCKED'; $Failure=''; $StageName='START'; $ExitCode=1
$BuildStatus='NOT_RUN'; $SigningStatus='NOT_RUN'; $InstallStatus='NOT_RUN'; $PreflightStatus='NOT_RUN'
$SignedPath=''; $SignedHash=''; $Work=''; $Log=''
$Utf8=New-Object System.Text.UTF8Encoding($false)
$ManifestExpected='0c3c19ae29a6ead313a27b37833a28b03ce03d71640484abd45ffc920a900020'
$SafetyExpected='9ebb716ab9cdb54f47e46c785c11412c4d8ae9c20d2f011376d4e721ca8aae0f'
$UnsignedExpected='40b8f766692a1e44e8e02fc9ed0de47a1ba172e12c0cf634852ec647cc9905d3'
$PreviousInstalledExpected='129bcc55a9fbf04ebe2bb19d86958fd94f4dc6fd0969bb020105e7f162510359'
$CertExpected='7cc577efe48e865fdbe799b92aa9edf89724631361ae97979f2b8e4a940a288b'
$CandidateId='JH168-MOBILE13-20261101'
$AppId='com.koreanlifehub.bridge'

function Add-JhRow([string]$Line) { $script:Rows.Add($Line) }
function Get-JhSha([string]$Path) { return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() }
function Set-JhStage([string]$Name) {
    $script:StageName=$Name
    $line='['+[DateTime]::UtcNow.ToString('o')+'] '+$Name
    Write-Host $line -ForegroundColor Cyan
    if($script:Log){try{[IO.File]::AppendAllText($script:Log,$line+"`r`n",$script:Utf8)}catch{Write-Host 'LOG_WRITE_UNAVAILABLE; result saving will still be attempted.'}}
}
function Invoke-JhTool([string]$Exe,[string[]]$Arguments) {
    # Do not log command arguments: they can contain local signing credentials.
    $previousPreference=$ErrorActionPreference
    try {
        $ErrorActionPreference='Continue'
        $toolLines=@(& $Exe @Arguments 2>&1 | ForEach-Object {$_.ToString()})
        $toolCode=$LASTEXITCODE
    } finally {$ErrorActionPreference=$previousPreference}
    return [PSCustomObject]@{ExitCode=$toolCode;Text=($toolLines -join "`n")}
}
function Write-JhNewJson([string]$Path,$Value) {
    $bytes=$script:Utf8.GetBytes(($Value | ConvertTo-Json -Depth 12))
    $fileStream=[IO.File]::Open($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try {$fileStream.Write($bytes,0,$bytes.Length);$fileStream.Flush($true)}finally{$fileStream.Dispose()}
}
function Get-JhToolchain {
    $sdkChoices=@($env:ANDROID_HOME,$env:ANDROID_SDK_ROOT,(Join-Path $env:LOCALAPPDATA 'Android\Sdk'))
    $buildToolRoot=$null; $adbPath=$null
    foreach($sdkChoice in @($sdkChoices | Where-Object {$_} | Select-Object -Unique)) {
        $adbCandidate=Join-Path $sdkChoice 'platform-tools\adb.exe'
        $toolsParent=Join-Path $sdkChoice 'build-tools'
        if(!(Test-Path -LiteralPath $adbCandidate -PathType Leaf) -or !(Test-Path -LiteralPath $toolsParent -PathType Container)){continue}
        $toolVersions=@(Get-ChildItem -LiteralPath $toolsParent -Directory | Where-Object {$_.Name -match '^(34|35)\.[0-9]+\.[0-9]+$'} | Sort-Object {[version]$_.Name} -Descending)
        foreach($toolVersion in $toolVersions) {
            $required=@('zipalign.exe','aapt.exe','lib\apksigner.jar')
            if(@($required | Where-Object {!(Test-Path -LiteralPath (Join-Path $toolVersion.FullName $_) -PathType Leaf)}).Count -eq 0){$buildToolRoot=$toolVersion.FullName;$adbPath=$adbCandidate;break}
        }
        if($buildToolRoot){break}
    }
    if(!$buildToolRoot){throw 'EXISTING_ANDROID_SIGNING_TOOLS_OR_ADB_NOT_FOUND'}
    $javaRoots=New-Object 'System.Collections.Generic.List[string]'
    if($env:JAVA_HOME){$javaRoots.Add($env:JAVA_HOME)}
    $javaRoots.Add('C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot')
    foreach($vendor in @('Microsoft','Java','Eclipse Adoptium','Android\Android Studio')) {
        $vendorPath=Join-Path $env:ProgramFiles $vendor
        if(Test-Path -LiteralPath $vendorPath -PathType Container){
            foreach($jdkFolder in @(Get-ChildItem -LiteralPath $vendorPath -Directory -ErrorAction SilentlyContinue | Where-Object {$_.Name -match '(?i)(17|jbr)'})){$javaRoots.Add($jdkFolder.FullName)}
        }
    }
    $javaPath=$null;$keytoolPath=$null
    foreach($javaRoot in @($javaRoots.ToArray() | Select-Object -Unique)) {
        $j=Join-Path $javaRoot 'bin\java.exe';$k=Join-Path $javaRoot 'bin\keytool.exe'
        if(!(Test-Path -LiteralPath $j -PathType Leaf) -or !(Test-Path -LiteralPath $k -PathType Leaf)){continue}
        $version=Invoke-JhTool $j @('-version')
        if($version.ExitCode -eq 0 -and $version.Text -match 'version "17[.\"]'){$javaPath=$j;$keytoolPath=$k;break}
    }
    if(!$javaPath){throw 'EXISTING_JDK17_NOT_FOUND_NO_TOOL_INSTALL'}
    return [PSCustomObject]@{Java=$javaPath;Keytool=$keytoolPath;Adb=$adbPath;Signer=(Join-Path $buildToolRoot 'lib\apksigner.jar');Align=(Join-Path $buildToolRoot 'zipalign.exe');Aapt=(Join-Path $buildToolRoot 'aapt.exe')}
}
function Assert-JhApk([string]$Path,$Tools,[bool]$Signed) {
    $badging=Invoke-JhTool $Tools.Aapt @('dump','badging',$Path)
    $identity=[regex]::Match($badging.Text,"(?m)^package: name='([^']+)' versionCode='([0-9]+)' versionName='([^']+)'")
    if($badging.ExitCode -ne 0 -or !$identity.Success -or $identity.Groups[1].Value -cne $script:AppId){throw 'APK_PACKAGE_UNVERIFIED'}
    $versionCode=[int]$identity.Groups[2].Value
    if($versionCode -gt 168){throw 'NEWER_INSTALLED_VERSION_NO_DOWNGRADE'}
    if($badging.Text -match '(?m)^application-debuggable'){throw 'DEBUGGABLE_APK_REJECTED'}
    if($Signed){
        $verified=Invoke-JhTool $Tools.Java @('-jar',$Tools.Signer,'verify','--verbose','--print-certs',$Path)
        $certs=[regex]::Matches($verified.Text,'Signer #[0-9]+ certificate SHA-256 digest:\s*([0-9a-fA-F]{64})')
        if($verified.ExitCode -ne 0 -or $certs.Count -ne 1 -or $certs[0].Groups[1].Value.ToLowerInvariant() -cne $script:CertExpected){throw 'APK_ORIGINAL_CERTIFICATE_UNVERIFIED'}
    }
    return [PSCustomObject]@{Version=$versionCode;Name=$identity.Groups[3].Value;Hash=(Get-JhSha $Path)}
}
function Assert-JhSignedPayload([string]$Unsigned,[string]$Signed) {
    # Signing/zipalign can change container bytes and signature metadata only.
    # Compare every other ZIP entry to the exact pinned unsigned artifact.
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $original=$null;$candidate=$null
    try {
        $original=[IO.Compression.ZipFile]::OpenRead($Unsigned)
        $candidate=[IO.Compression.ZipFile]::OpenRead($Signed)
        $entries=New-Object 'System.Collections.Generic.Dictionary[string,string]' ([StringComparer]::Ordinal)
        foreach($entry in $original.Entries){
            if($entries.ContainsKey($entry.FullName)){throw 'UNSIGNED_APK_DUPLICATE_ZIP_ENTRY'}
            $stream=$entry.Open();$sha=[Security.Cryptography.SHA256]::Create()
            try{$digest=[BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','')}finally{$stream.Dispose();$sha.Dispose()}
            $entries.Add($entry.FullName,$digest)
        }
        $seen=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
        foreach($entry in $candidate.Entries){
            if(!$seen.Add($entry.FullName)){throw 'SIGNED_APK_DUPLICATE_ZIP_ENTRY'}
            if(!$entries.ContainsKey($entry.FullName)){
                if($entry.FullName -cmatch '^META-INF/(?:MANIFEST[.]MF|[^/]+[.](?:SF|RSA|DSA|EC))$'){continue}
                throw 'SIGNED_APK_UNEXPECTED_PAYLOAD_ENTRY'
            }
            $stream=$entry.Open();$sha=[Security.Cryptography.SHA256]::Create()
            try{$digest=[BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','')}finally{$stream.Dispose();$sha.Dispose()}
            if($digest -cne $entries[$entry.FullName]){throw 'SIGNED_APK_PAYLOAD_CHANGED'}
        }
        foreach($name in $entries.Keys){if(!$seen.Contains($name)){throw 'SIGNED_APK_PAYLOAD_ENTRY_MISSING'}}
    } finally {if($null -ne $original){$original.Dispose()};if($null -ne $candidate){$candidate.Dispose()}}
}
function Get-JhInstalled([string]$Serial,$Tools,[string]$OutputPath) {
    $paths=Invoke-JhTool $Tools.Adb @('-s',$Serial,'shell','pm','path',$script:AppId)
    $packagePaths=@($paths.Text -split "`r?`n" | Where-Object {$_ -match '^package:'})
    if($paths.ExitCode -ne 0 -or $packagePaths.Count -ne 1){throw 'EXISTING_SINGLE_APK_NOT_FOUND_NO_FRESH_INSTALL'}
    $remotePath=$packagePaths[0].Substring(8).Trim()
    if($remotePath -cnotmatch '^/data/app/[A-Za-z0-9_./=~+\-]+/base[.]apk$'){throw 'EXISTING_APK_PATH_UNVERIFIED'}
    if(Test-Path -LiteralPath $OutputPath){throw 'INSTALLED_READBACK_PATH_ALREADY_EXISTS'}
    $pull=Invoke-JhTool $Tools.Adb @('-s',$Serial,'pull',$remotePath,$OutputPath)
    if($pull.ExitCode -ne 0 -or !(Test-Path -LiteralPath $OutputPath -PathType Leaf)){throw 'INSTALLED_APK_READBACK_UNAVAILABLE_NO_RETRY'}
    return Assert-JhApk $OutputPath $Tools $true
}
function Get-JhOriginalKeystore($Tools) {
    $keyPath=Join-Path $env:USERPROFILE '.android\debug.keystore'
    if(!(Test-Path -LiteralPath $keyPath -PathType Leaf)){throw 'ORIGINAL_KEYSTORE_NOT_FOUND_NO_NEW_KEY'}
    # The standard Android debug-keystore default is public, not a user secret.
    # Keep all key material local and suppress all command arguments/output.
    $certificate=Invoke-JhTool $Tools.Keytool @('-exportcert','-rfc','-keystore',$keyPath,'-storepass','android','-alias','androiddebugkey')
    $pem=[regex]::Match($certificate.Text,'(?s)-----BEGIN CERTIFICATE-----\s*(.*?)\s*-----END CERTIFICATE-----')
    if($certificate.ExitCode -ne 0 -or !$pem.Success){throw 'ORIGINAL_KEYSTORE_CERTIFICATE_UNREADABLE'}
    try {
        $publicDer=[Convert]::FromBase64String(($pem.Groups[1].Value -replace '\s',''))
        $sha=[Security.Cryptography.SHA256]::Create()
        try{$publicHash=[BitConverter]::ToString($sha.ComputeHash($publicDer)).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
    } catch {throw 'ORIGINAL_KEYSTORE_CERTIFICATE_UNREADABLE'}
    if($publicHash -cne $script:CertExpected){throw 'ORIGINAL_KEYSTORE_CERTIFICATE_MISMATCH_NO_SIGN'}
    return $keyPath
}
function Test-JhRuntimePreflight([string]$Root) {
    $required=@('data\Update-Mobile13.ps1','data\JH-RUN-SAFETY.ps1','data\candidate.json','data\JH168-Mobile13-UNSIGNED-20261101.apk','POWER_SHELL_ERROR_CHECKLIST.txt')
    foreach($relative in $required){
        $full=Join-Path $Root $relative
        if(!(Test-Path -LiteralPath $full -PathType Leaf)){throw 'FULL_EXTRACTION_REQUIRED_MISSING_FILE'}
        if([IO.Path]::GetFullPath($full).Length -ge 240){throw 'DELIVERY_PATH_TOO_LONG_FOR_EXISTING_WINDOWS_TOOLS'}
    }
    $entryName=([string][char]0xC2E4)+([string][char]0xD589)+'.cmd'
    $cmdBytes=[IO.File]::ReadAllBytes((Join-Path $Root $entryName))
    if(@($cmdBytes | Where-Object {$_ -gt 127}).Count -gt 0){throw 'CMD_MUST_BE_ASCII'}
    if([Text.Encoding]::ASCII.GetString($cmdBytes) -match '(?<!\r)\n'){throw 'CMD_MUST_USE_CRLF'}
    foreach($scriptPath in @((Join-Path $Root 'data\Update-Mobile13.ps1'),(Join-Path $Root 'data\JH-RUN-SAFETY.ps1'))){
        $scriptBytes=[IO.File]::ReadAllBytes($scriptPath)
        if(@($scriptBytes | Where-Object {$_ -gt 127}).Count -gt 0 -and !($scriptBytes.Length -ge 3 -and $scriptBytes[0] -eq 239 -and $scriptBytes[1] -eq 187 -and $scriptBytes[2] -eq 191)){throw 'POWERSHELL_UTF8_BOM_REQUIRED'}
        $parseTokens=$null;$parseErrors=$null
        $ast=[Management.Automation.Language.Parser]::ParseFile($scriptPath,[ref]$parseTokens,[ref]$parseErrors)
        if($parseErrors.Count -gt 0){throw 'POWERSHELL_PARSE_FAILED'}
        foreach($functionNode in @($ast.FindAll({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst]},$true))){
            if(Get-Alias -Name $functionNode.Name -ErrorAction SilentlyContinue){throw 'POWERSHELL_FUNCTION_ALIAS_COLLISION'}
        }
        $automaticAssignments=@($ast.FindAll({param($node) $node -is [Management.Automation.Language.AssignmentStatementAst] -and $node.Left.Extent.Text -match '^\$(?:Matches|HOME|Host|PID|PSHOME|PSVersionTable|args|input|this)\b'},$true))
        if($automaticAssignments.Count -gt 0){throw 'POWERSHELL_AUTOMATIC_VARIABLE_ASSIGNMENT'}
    }
}

Add-JhRow('CANDIDATE_ID: '+$CandidateId)
Add-JhRow('TASK_KIND: SIGN_VERIFIED_APK_AND_UPDATE_ONCE')
Add-JhRow('UNSIGNED_APK_SHA256: '+$UnsignedExpected)
Add-JhRow('ORIGINAL_CERTIFICATE_SHA256: '+$CertExpected)
Add-JhRow('SERVER_CANDIDATE_COMMIT: c6142bd21ea299a4464124356e9da34b58001900')
Add-JhRow('DEVICE_E2E: NOT_RUN')
Add-JhRow('SERVER_DEPLOYMENT: NOT_RUN_BY_THIS_UPDATER')
try {
    $safetyPath=Join-Path $PSScriptRoot 'JH-RUN-SAFETY.ps1'
    if(!(Test-Path -LiteralPath $safetyPath -PathType Leaf) -or (Get-JhSha $safetyPath) -cne $SafetyExpected){throw 'RUN_SAFETY_HELPER_MISSING_OR_CHANGED'}
    . $safetyPath
    $SafetyReady=$true
    $Id=Get-JhRunId $RunId
    $RunLock=Enter-JhRunLock -Kit $Kit -RunId $Id
    $resultPath=Join-Path $Kit 'RESULT.txt'
    $logRoot=Join-Path $Kit 'logs'
    [void][IO.Directory]::CreateDirectory($logRoot)
    if(Test-Path -LiteralPath $resultPath){
        if(!(Test-Path -LiteralPath $resultPath -PathType Leaf)){throw 'EXISTING_RESULT_IS_NOT_A_FILE'}
        [IO.File]::Copy($resultPath,(Join-Path $logRoot ('previous-'+$Id+'-RESULT.txt')),$false)
    }
    $AllowPrimary=$true
    $Log=Join-Path $logRoot ($Id+'.log')
    Set-JhStage '1/6 PREFLIGHT_AND_VERIFIED_BINARY_REUSE'
    Test-JhRuntimePreflight $Kit
    $manifestPath=Join-Path $PSScriptRoot 'candidate.json'
    if((Get-JhSha $manifestPath) -cne $ManifestExpected){throw 'CANDIDATE_MANIFEST_HASH_MISMATCH'}
    $manifest=[IO.File]::ReadAllText($manifestPath) | ConvertFrom-Json
    if($manifest.schema -cne 'jh.mobile13.windows-update.v1' -or $manifest.candidateId -cne $CandidateId -or $manifest.taskKind -cne 'SIGN_VERIFIED_APK_AND_UPDATE_ONCE' -or $manifest.unsignedSha256 -cne $UnsignedExpected -or $manifest.certificateSha256 -cne $CertExpected){throw 'CANDIDATE_MANIFEST_IDENTITY_MISMATCH'}
    $unsigned=Join-Path $PSScriptRoot 'JH168-Mobile13-UNSIGNED-20261101.apk'
    if((Get-Item -LiteralPath $unsigned).Length -ne $manifest.unsignedBytes -or (Get-JhSha $unsigned) -cne $UnsignedExpected){throw 'VERIFIED_UNSIGNED_APK_HASH_OR_SIZE_MISMATCH'}
    $BuildStatus='REUSED_PASS_1183_TESTS_NO_GRADLE'
    $PreflightStatus='NEW_PASS'
    if(!$env:LOCALAPPDATA -or !$env:USERPROFILE){throw 'WINDOWS_USER_DIRECTORIES_UNAVAILABLE'}
    $cacheRoot=Join-Path (Join-Path $env:LOCALAPPDATA 'JH168Mobile13') $UnsignedExpected.Substring(0,16)
    if($cacheRoot.Length -ge 160){throw 'LOCAL_CACHE_PATH_TOO_LONG_FOR_SIGNING_TOOLS'}
    [void][IO.Directory]::CreateDirectory($cacheRoot)
    # One candidate-wide lock also covers duplicate extractions in other folders.
    $CacheLock=Enter-JhRunLock -Kit $cacheRoot -RunId $Id
    $Work=Join-Path (Join-Path $cacheRoot 'runs') $Id
    if(Test-Path -LiteralPath $Work){throw 'RUN_WORKSPACE_ALREADY_EXISTS'}
    [void][IO.Directory]::CreateDirectory($Work)
    Set-JhStage '2/6 EXISTING_TOOLS_AND_INSTALLED_APP_READBACK'
    $tools=Get-JhToolchain
    $inputApk=Assert-JhApk $unsigned $tools $false
    if($inputApk.Version -ne 168 -or $inputApk.Name -cne 'jh168-gemini-right-v2-release'){throw 'CANDIDATE_APK_VERSION_MISMATCH'}
    $devices=Invoke-JhTool $tools.Adb @('devices','-l')
    $deviceLines=@($devices.Text -split "`r?`n" | Where-Object {$_ -match '^\S+\s+device(?:\s|$)'})
    $otherDevices=@($devices.Text -split "`r?`n" | Where-Object {$_ -match '^\S+\s+(?:offline|unauthorized)(?:\s|$)'})
    if($devices.ExitCode -ne 0 -or $deviceLines.Count -ne 1 -or $otherDevices.Count -ne 0){throw 'CONNECT_EXACTLY_ONE_AUTHORIZED_PHONE'}
    $serial=($deviceLines[0] -split '\s+')[0]
    if($serial -cnotmatch '^[A-Za-z0-9._:\-]{1,128}$'){throw 'DEVICE_SERIAL_FORMAT_UNVERIFIED'}
    $manufacturer=Invoke-JhTool $tools.Adb @('-s',$serial,'shell','getprop','ro.product.manufacturer')
    if($manufacturer.ExitCode -ne 0 -or $manufacturer.Text.Trim() -notmatch '^(?i)samsung$'){throw 'ORIGINAL_SAMSUNG_TARGET_UNVERIFIED'}
    $deviceDigest=[Security.Cryptography.SHA256]::Create()
    try{$deviceHash=[BitConverter]::ToString($deviceDigest.ComputeHash($Utf8.GetBytes($AppId+'|'+$serial))).Replace('-','').ToLowerInvariant()}finally{$deviceDigest.Dispose()}
    Add-JhRow('DEVICE_BINDING_SHA256: '+$deviceHash)
    $guardPath=Join-Path $cacheRoot ('install-'+$deviceHash+'.json')
    $before=Get-JhInstalled $serial $tools (Join-Path $Work 'before.apk')
    Add-JhRow('INSTALLED_BEFORE_SHA256: '+$before.Hash)
    Add-JhRow('INSTALLED_BEFORE_VERSION: '+$before.Version)
    Add-JhRow('INSTALLED_BEFORE_CERTIFICATE: MATCH')
    Set-JhStage '3/6 REUSE_OR_SIGN_WITH_ORIGINAL_LOCAL_CERTIFICATE'
    $SignedPath=Join-Path $cacheRoot 'JH168-Mobile13-SIGNED.apk'
    $signReceiptPath=Join-Path $cacheRoot 'signed-artifact.json'
    $cached=$false
    if((Test-Path -LiteralPath $SignedPath) -or (Test-Path -LiteralPath $signReceiptPath)){
        if(!(Test-Path -LiteralPath $SignedPath -PathType Leaf) -or !(Test-Path -LiteralPath $signReceiptPath -PathType Leaf)){throw 'PARTIAL_SIGNED_ARTIFACT_PRESERVED_REVIEW_REQUIRED'}
        $saved=[IO.File]::ReadAllText($signReceiptPath) | ConvertFrom-Json
        $signedInfo=Assert-JhApk $SignedPath $tools $true
        Assert-JhSignedPayload $unsigned $SignedPath
        if($saved.candidateId -cne $CandidateId -or $saved.unsignedSha256 -cne $UnsignedExpected -or $saved.signedSha256 -cne $signedInfo.Hash -or $saved.certificateSha256 -cne $CertExpected -or $signedInfo.Version -ne 168 -or $signedInfo.Name -cne 'jh168-gemini-right-v2-release'){throw 'CACHED_SIGNED_ARTIFACT_IDENTITY_MISMATCH'}
        $SignedHash=$signedInfo.Hash;$cached=$true
        $SigningStatus='REUSED_PASS'
    }
    if(!$cached){
        if(Test-Path -LiteralPath $guardPath){throw 'PRIOR_INSTALL_ATTEMPT_PRESERVED_NO_RESIGN_OR_RETRY'}
        if($before.Hash -cne $PreviousInstalledExpected){throw 'INSTALLED_BASELINE_CHANGED_NO_OVERWRITE'}
        $keyPath=Get-JhOriginalKeystore $tools
        $aligned=Join-Path $Work 'aligned.apk'
        $align=Invoke-JhTool $tools.Align @('-p','4',$unsigned,$aligned)
        if($align.ExitCode -ne 0 -or !(Test-Path -LiteralPath $aligned -PathType Leaf)){throw 'ZIPALIGN_FAILED'}
        $SigningStatus='UNKNOWN'
        $signed=Invoke-JhTool $tools.Java @('-jar',$tools.Signer,'sign','--ks',$keyPath,'--ks-key-alias','androiddebugkey','--ks-pass','pass:android','--key-pass','pass:android','--v1-signing-enabled','true','--v2-signing-enabled','true','--v3-signing-enabled','true','--v4-signing-enabled','false','--out',$SignedPath,$aligned)
        if($signed.ExitCode -ne 0 -or !(Test-Path -LiteralPath $SignedPath -PathType Leaf)){throw 'SIGNING_FAILED_PARTIAL_OUTPUT_PRESERVED'}
        $signedInfo=Assert-JhApk $SignedPath $tools $true
        Assert-JhSignedPayload $unsigned $SignedPath
        if($signedInfo.Version -ne 168 -or $signedInfo.Name -cne 'jh168-gemini-right-v2-release'){throw 'SIGNED_CANDIDATE_VERSION_MISMATCH'}
        $SignedHash=$signedInfo.Hash
        Write-JhNewJson $signReceiptPath ([ordered]@{candidateId=$CandidateId;unsignedSha256=$UnsignedExpected;signedSha256=$SignedHash;certificateSha256=$CertExpected;createdAt=[DateTime]::UtcNow.ToString('o')})
        $SigningStatus='NEW_PASS'
    }
    Add-JhRow('SIGNED_APK_SHA256: '+$SignedHash)
    Add-JhRow('SIGNED_APK_CERTIFICATE: MATCH')
    Add-JhRow('SIGNED_APK_PATH: '+$SignedPath)
    Set-JhStage '4/6 CHECK_PERSISTENT_INSTALL_GUARD'
    if($before.Hash -ceq $SignedHash){
        $InstallStatus='REUSED_PASS_ACTUAL_INSTALLED_BYTES_MATCH'
        Add-JhRow('INSTALLED_AFTER_SHA256: '+$before.Hash)
        Add-JhRow('INSTALLED_AFTER_VERSION: '+$before.Version)
        Add-JhRow('INSTALLED_AFTER_CERTIFICATE: MATCH')
        $State='REUSED_PASS';$ExitCode=0
    } else {
        if(Test-Path -LiteralPath $guardPath){throw 'PRIOR_INSTALL_ATTEMPT_PRESERVED_READBACK_NOT_MATCHED_NO_RETRY'}
        if($before.Hash -cne $PreviousInstalledExpected){throw 'INSTALLED_BASELINE_CHANGED_NO_OVERWRITE'}
        # Flush a sticky record BEFORE the single external effect. Never remove it.
        Write-JhNewJson $guardPath ([ordered]@{schema='jh.mobile13.install-attempt.v1';candidateId=$CandidateId;unsignedSha256=$UnsignedExpected;signedSha256=$SignedHash;deviceBindingSha256=$deviceHash;runId=$Id;attemptRecordedAt=[DateTime]::UtcNow.ToString('o');automaticReplay=$false})
        Add-JhRow('PERSISTENT_INSTALL_GUARD: WRITTEN_BEFORE_ADB')
        Set-JhStage '5/6 ONE_UPDATE_INSTALL_KEEP_APP_DATA'
        $AttemptCount=1;$InstallDispatched=$true;$InstallStatus='UNKNOWN'
        $install=Invoke-JhTool $tools.Adb @('-s',$serial,'install','-r',$SignedPath)
        Add-JhRow('ADB_INSTALL_EXIT_CODE: '+$install.ExitCode)
        $reportedSuccess=($install.ExitCode -eq 0 -and $install.Text -match '(?m)^Success\s*$')
        if($reportedSuccess){Add-JhRow('ADB_INSTALL_COMMAND_RESULT: SUCCESS')}else{Add-JhRow('ADB_INSTALL_COMMAND_RESULT: NOT_VERIFIED')}
        # Verify the actual bytes even when the command response was lost. No retry.
        Set-JhStage '6/6 INSTALLED_APK_HASH_CERTIFICATE_AND_VERSION_READBACK'
        $after=Get-JhInstalled $serial $tools (Join-Path $Work 'after.apk')
        Add-JhRow('INSTALLED_AFTER_SHA256: '+$after.Hash)
        Add-JhRow('INSTALLED_AFTER_VERSION: '+$after.Version)
        Add-JhRow('INSTALLED_AFTER_CERTIFICATE: MATCH')
        if($after.Hash -cne $SignedHash -or $after.Version -ne 168){throw 'INSTALL_RESULT_NOT_MATCHED_NO_RETRY'}
        $InstallStatus='NEW_PASS_ACTUAL_INSTALLED_BYTES_MATCH'
        $State='NEW_PASS';$ExitCode=0
    }
} catch {
    $Failure=$_.Exception.Message
    if($Failure -cnotmatch '^[A-Z0-9_]{1,180}$'){$Failure='UNEXPECTED_LOCAL_ERROR_DETAILS_NOT_LOGGED'}
    if($InstallDispatched){$State='UNKNOWN';$ExitCode=2}else{$State='BLOCKED';$ExitCode=1}
    Add-JhRow('FIRST_FAILURE_STAGE: '+$StageName)
    Add-JhRow('FIRST_FAILURE_REASON: '+$Failure)
} finally {
    Add-JhRow('BUILD: '+$BuildStatus)
    Add-JhRow('SIGNING: '+$SigningStatus)
    Add-JhRow('INSTALL: '+$InstallStatus)
    Add-JhRow('PREFLIGHT: '+$PreflightStatus)
    Add-JhRow('FINISHED_AT_UTC: '+[DateTime]::UtcNow.ToString('o'))
    Add-JhRow('PROCESS_EXIT_CODE: '+$ExitCode)
    Add-JhRow('INSTALL_REPLAY: FORBIDDEN')
    Add-JhRow('LOG_PATH: '+$Log)
    if($State -in @('NEW_PASS','REUSED_PASS')){Add-JhRow('NEXT_ACTION: SEND_THIS_RESULT_TXT_FOR_COORDINATED_SERVER_APPLICATION')}
    elseif($Failure -eq 'CONNECT_EXACTLY_ONE_AUTHORIZED_PHONE'){Add-JhRow('NEXT_ACTION: CONNECT_ORIGINAL_PHONE_AND_APPROVE_USB_DEBUGGING_THEN_USE_SAME_ENTRYPOINT')}
    else{Add-JhRow('NEXT_ACTION: SEND_THIS_RESULT_TXT_KEEP_EXISTING_FILES_DO_NOT_REINSTALL')}
    try {
        if($SafetyReady){
            $Receipt=Write-JhRunResult -Kit $Kit -RunId $Id -Kind 'ONECLICK' -Status $State -AttemptCount $AttemptCount -Lines $Rows.ToArray() -AllowPrimary $AllowPrimary
            if($Receipt.Saved){
                $checked=Read-JhRunResult -Kit $Kit -RunId $Id -ReportPath $Receipt.ReportPath -Kind 'ONECLICK'
                if($checked.Status -cne $State -or $checked.AttemptCount -ne $AttemptCount){throw 'CURRENT_RESULT_RECEIPT_MISMATCH'}
            }
        }
    } catch {Write-Host 'RESULT_WRITE_FAILED_OR_IDENTITY_UNVERIFIED' -ForegroundColor Red;$Receipt=$null}
    finally {
        if($SafetyReady){Exit-JhRunLock -Lock $CacheLock -Owned $true;Exit-JhRunLock -Lock $RunLock -Owned $true}
    }
    Write-Host ('STATUS: '+$State) -ForegroundColor Yellow
    Write-Host ('ANDROID_INSTALL_ATTEMPT_COUNT: '+$AttemptCount)
    if($Failure){Write-Host ('REASON: '+$Failure) -ForegroundColor Red}
    if($SignedHash){Write-Host ('SIGNED_APK_PATH: '+$SignedPath)}
}
if($null -eq $Receipt -or !$Receipt.Saved){exit 21}
if($Receipt.FallbackUsed){exit 20}
# 0 means a checked current-run report was saved; the report carries the outcome.
exit 0
