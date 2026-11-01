param([string]$VerifiedBuildResult = "",[string]$RunId = "",[IO.FileStream]$ParentRunLock = $null)
# JH168 FIX16 sign/update reason-only diagnostics: sign verified build using existing certificate; one-owner-triggered guarded update.
# NO source modification, new signing key, uninstall, data wipe, server change,
# Computer Use, Secure56 policy change or auto retry.
$ErrorActionPreference='Stop'
$Kit=Split-Path -Parent $MyInvocation.MyCommand.Path
$Report=Join-Path $Kit 'RESULT.txt'
$DiagnosticFile=Join-Path $Kit 'SIGN-DIAGNOSTIC.txt'
$Diagnostic=New-Object 'System.Collections.Generic.List[string]'
$Diagnostic.Add('FIX16 SIGN/UPDATE - sanitized local signing diagnostics')
$Diagnostic.Add('PRIVATE KEYS AND CERTIFICATE CONTENT ARE NEVER COPIED OR UPLOADED')
$Signed=Join-Path $Kit 'JH168-FIX16-SIGNED.apk'
$Aligned=Join-Path $Kit '.JH168-FIX16-ALIGNED.tmp.apk'
$Utf8=New-Object System.Text.UTF8Encoding($false)
$Rows=New-Object 'System.Collections.Generic.List[string]'
$Rows.Add('JH168 FIX16 - ORIGINAL CERT SIGN AND OWNER-TRIGGERED UPDATE ONLY')
$Rows.Add('DATE: '+(Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
$Rows.Add('NO_UNINSTALL_NO_DATA_WIPE_NO_SERVER_CHANGE_NO_COMPUTER_USE_NO_AUTOREPLAY')
$State='STOPPED_NO_DEVICE_CHANGE'
$OriginalCert='7cc577efe48e865fdbe799b92aa9edf89724631361ae97979f2b8e4a940a288b'
$RuntimeHash='73a72f8107b15dc5f4e7b220028f39957b3a3fcb82f504118b0234b769ffea00'
$PolicyHash='693a4983733182e73d3b3a9619e0f8810b310e42b5c8fb3844a5f8d1deee8ec4'
$SourceZipHash='bf82daa5526c4e1db08a31c841e859d254a0dfce0842ed628dc0c071e08df738'
$FreshBuildMode=$false
$UnsignedHashExpected='e299842f5bac002b2f3fd21d547f816debf02fb7d7c491554acc70b01607912c'
$SignedHash=''
$SignatureVerified=$false
$KeyPathForRedaction=''
$InstallAttempted=$false
$CertFound=$false
$InstallReportedSuccess=$false
$EffectiveRunId=[guid]::NewGuid().ToString('N')
$SafetyReady=$false
$RunLock=$null
$OwnRunLock=($null -eq $ParentRunLock)
$AllowPrimaryResult=$false
$AlignedCreated=$false
$SignedCreated=$false
$ResultReceipt=$null
$SafetyHash='9ebb716ab9cdb54f47e46c785c11412c4d8ae9c20d2f011376d4e721ca8aae0f'

function Add-Row([string]$s) { $script:Rows.Add($s) }
function Stage([string]$message) {
    $line='['+(Get-Date -Format 'HH:mm:ss')+'] '+$message
    Write-Host $line -ForegroundColor Cyan
    if($null -eq $script:RunLock){return}
    try {[System.IO.File]::WriteAllText((Join-Path $Kit 'RUN-STATUS.txt'),$line,$Utf8)}
    catch {
        Add-Row('RUN_STATUS_WRITE: UNAVAILABLE')
        Write-Host 'RUN_STATUS_WRITE_UNAVAILABLE; primary result will still be attempted.' -ForegroundColor Yellow
    }
}
function Redact-Diagnostic([string]$s) {
    if([string]::IsNullOrEmpty($s)){return '(no diagnostic output received)'}
    if($script:KeyPathForRedaction){$s=$s.Replace($script:KeyPathForRedaction,'[ORIGINAL_KEYSTORE_PATH_REDACTED]')}
    if($env:USERPROFILE){$s=$s.Replace($env:USERPROFILE,'%USERPROFILE%')}
    $s=[regex]::Replace($s,'(?i)pass:[^\s''"]+','pass:[REDACTED]')
    if($s.Length -gt 9000){$s=$s.Substring(0,9000)+' [TRUNCATED]'}
    return $s
}
function Add-Diagnostic([string]$stage,[string]$output,[int]$exitCode) {
    $script:Diagnostic.Add($stage+'_EXIT_CODE: '+$exitCode)
    $script:Diagnostic.Add($stage+'_OUTPUT:')
    $script:Diagnostic.Add((Redact-Diagnostic $output))
}

function Sha([string]$path) { return (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() }
function Cmd-Output([string]$exe,[string[]]$arguments) {
    $old=$ErrorActionPreference
    try {
        $ErrorActionPreference='Continue'
        $out=@(& $exe @arguments 2>&1 | ForEach-Object { $_.ToString() })
        $code=$LASTEXITCODE
    } finally { $ErrorActionPreference=$old }
    return @{ExitCode=$code;Text=($out -join "`n")}
}
function Scan-Folders {
    $roots=@(
        (Join-Path $env:USERPROFILE 'Downloads'),
        (Join-Path $env:USERPROFILE 'Desktop'),
        (Join-Path $env:USERPROFILE 'OneDrive\Desktop'),
        $Kit)
    return @($roots | Select-Object -Unique | Where-Object {Test-Path -LiteralPath $_})
}
function Find-Exe([string]$name,[string]$fallback) {
    if(Test-Path -LiteralPath $fallback){return $fallback}
    $cmd=Get-Command $name -ErrorAction SilentlyContinue
    if($cmd){return $cmd.Source}
    return $null
}
try {
    $safetyPath=Join-Path $Kit 'JH-RUN-SAFETY.ps1'
    if(!(Test-Path -LiteralPath $safetyPath -PathType Leaf) -or (Sha $safetyPath) -cne $SafetyHash){
        throw 'RUN_SAFETY_HELPER_MISSING_OR_CHANGED'
    }
    . $safetyPath
    $SafetyReady=$true
    $EffectiveRunId=Get-JhRunId $RunId
    $RunLock=Enter-JhRunLock -Kit $Kit -RunId $EffectiveRunId -ParentLock $ParentRunLock
    # A direct invocation preserves any previous RESULT. The front controller
    # owns its current run's primary path and lends its live lock to this child.
    $AllowPrimaryResult=($null -ne $ParentRunLock) -or !(Test-Path -LiteralPath $Report)
    if(Test-Path -LiteralPath $Signed){ throw 'SIGNED_OUTPUT_ALREADY_EXISTS_NO_OVERWRITE' }
    if(Test-Path -LiteralPath $Aligned){ throw 'ALIGNED_TEMP_ALREADY_EXISTS_NO_OVERWRITE' }
    # Accept a newly compiled binary only when this same run's trusted builder
    # returned a complete, all-tests-pass report with all protected-source hashes.
    if(-not [string]::IsNullOrEmpty($VerifiedBuildResult)) {
        if(!(Test-Path -LiteralPath $VerifiedBuildResult -PathType Leaf)) {throw 'FRESH_BUILD_RESULT_MISSING'}
        if([IO.Path]::GetFullPath($VerifiedBuildResult) -ne [IO.Path]::GetFullPath((Join-Path $Kit 'FIX16-BUILD-RESULT.txt'))) {
            throw 'FRESH_BUILD_RESULT_NOT_IN_THIS_KIT'
        }
        $buildLines=[IO.File]::ReadAllLines($VerifiedBuildResult)
        $requiredRows=@(
            'STATUS: FIX16_HORIZONTAL_BUILD_TEST_PASS_UNSIGNED_NOT_INSTALLED',
            'GRADLE_EXIT_CODE: 0',
            'FIX15_EXACT_RUNTIME_SHA256: MATCH',
            'FIX15_EXACT_POLICY_SHA256: MATCH',
            'EXACT_FIX15_ADAPTER_HASHES: MATCH_4',
            'VERTICAL_FIX15_SOURCE_SHA256: MATCH',
            'JAVA_ANDROIDAGENT_UNCHANGED: YES',
            'EXISTING_SECURE56_APPROVAL: UNCHANGED',
            'LEGACY_FORWARD_BACKWARD_FOR_HORIZONTAL: FORBIDDEN',
            'COMPUTER_USE: NOT_USED',
            'PARENT_FALLBACK: FORBIDDEN',
            'AUTO_REPLAY: FORBIDDEN',
            'DEVICE_INSTALL: NOT_ATTEMPTED',
            'SIGNING: NOT_ATTEMPTED'
        )
        foreach($line in $requiredRows){if($buildLines -cnotcontains $line){throw ('FRESH_BUILD_PROVENANCE_MISSING_'+$line.Split(':')[0])}}
        if(-not ($buildLines -match '^UNCHANGED_SOURCE_FILES_VERIFIED: 387$')){throw 'FRESH_BUILD_ORIGINAL_SOURCE_COUNT_INVALID'}
        if(-not ($buildLines -match '^HORIZONTAL_RUNTIME_SHA256: 73a72f8107b15dc5f4e7b220028f39957b3a3fcb82f504118b0234b769ffea00$')){throw 'FRESH_BUILD_RUNTIME_HASH_INVALID'}
        if(-not ($buildLines -match '^HORIZONTAL_POLICY_SHA256: 693a4983733182e73d3b3a9619e0f8810b310e42b5c8fb3844a5f8d1deee8ec4$')){throw 'FRESH_BUILD_POLICY_HASH_INVALID'}
        $zrow=@($buildLines | Where-Object {$_ -match '^FIX16_SOURCE_ZIP_SHA256: ([0-9a-f]{64})$'})
        $arow=@($buildLines | Where-Object {$_ -match '^FIX16_UNSIGNED_APK_SHA256: ([0-9a-f]{64})$'})
        if($zrow.Count -ne 1 -or $arow.Count -ne 1){throw 'FRESH_BUILD_HASHES_NOT_UNIQUE'}
        $SourceZipHash=$zrow[0].Substring(('FIX16_SOURCE_ZIP_SHA256: ').Length)
        $UnsignedHashExpected=$arow[0].Substring(('FIX16_UNSIGNED_APK_SHA256: ').Length)
        $FreshBuildMode=$true
        Add-Row('FIX16_BUILD_MODE: FRESH_THIS_ONECLICK_RUN_STRICT_PROVENANCE')
    } else {
        Add-Row('FIX16_BUILD_MODE: REUSED_EXACT_PREVIOUSLY_VERIFIED_BINARY')
    }
    Stage 'STEP 1/5: Check FIX16 exact short Windows workspace, source ZIP and APK'
    $downloads=Scan-Folders
    $proj=Join-Path $env:LOCALAPPDATA 'JH16F16\FIX16-PATCHED-SOURCE'
    if(!(Test-Path -LiteralPath $proj -PathType Container)){
        throw 'FIX16_SHORT_WORKSPACE_NOT_FOUND_NO_INSTALL'
    }
    $main=Join-Path $proj 'app\src\main\java\com\koreanlifehub\bridge'
    $r=Join-Path $main 'JH168RightHorizontalScrollRuntime.kt'
    $p=Join-Path $main 'JH168HorizontalScrollPolicy.kt'
    $v=Join-Path $main 'JH168RightVerticalScrollRuntime.kt'
    $t=Join-Path $main 'FormTransport.kt'
    $g=Join-Path $main 'GuidedForms.kt'
    $u=Join-Path $proj 'app\build\outputs\apk\release\app-release-unsigned.apk'
    foreach($entry in @($r,$p,$v,$t,$g,$u)) {
        if(!(Test-Path -LiteralPath $entry -PathType Leaf)){
            throw 'FIX16_EXACT_BUILD_INPUT_MISSING_NO_INSTALL'
        }
    }
    if((Sha $r) -ne $RuntimeHash -or (Sha $p) -ne $PolicyHash){
        throw 'FIX16_HORIZONTAL_RUNTIME_OR_POLICY_MISMATCH_NO_INSTALL'
    }
    if((Sha $v) -ne '0a69dc716e34e59672e9ba6a72c0ddd35ce487533c135c92733d700d6d441854'){
        throw 'FIX15_VERTICAL_RUNTIME_CHANGED_NO_INSTALL'
    }
    Add-Row('FIX16_RUNTIME_SOURCE_HASH: MATCH')
    Add-Row('FIX16_POLICY_SOURCE_HASH: MATCH')
    Add-Row('EXISTING_VERTICAL_FIX15_SOURCE_HASH: MATCH')
    # The source-only patch generated the ZIP in its kit Downloads folder, not
    # next to the short local Gradle workspace. Search a bounded set of folders.
    $zCandidates=New-Object 'System.Collections.Generic.List[string]'
    foreach($rootDir in $downloads) {
        $direct=Join-Path $rootDir 'JH168-FIX16-PATCHED-SOURCE.zip'
        if(Test-Path -LiteralPath $direct -PathType Leaf){$zCandidates.Add($direct)}
        foreach($folder in @(Get-ChildItem -LiteralPath $rootDir -Directory -ErrorAction SilentlyContinue |
                Where-Object {$_.Name -match '(?i)FIX16'} | Select-Object -First 60)) {
            $nested=Join-Path $folder.FullName 'JH168-FIX16-PATCHED-SOURCE.zip'
            if(Test-Path -LiteralPath $nested -PathType Leaf){$zCandidates.Add($nested)}
            foreach($sub in @(Get-ChildItem -LiteralPath $folder.FullName -Directory -ErrorAction SilentlyContinue |
                    Where-Object {$_.Name -match '(?i)FIX16'} | Select-Object -First 15)) {
                $deep=Join-Path $sub.FullName 'JH168-FIX16-PATCHED-SOURCE.zip'
                if(Test-Path -LiteralPath $deep -PathType Leaf){$zCandidates.Add($deep)}
            }
        }
    }
    $zValid=@()
    foreach($candidate in @($zCandidates.ToArray() | Sort-Object -Unique)) {
        if((Sha $candidate) -eq $SourceZipHash){$zValid+= $candidate}
    }
    if($zValid.Count -lt 1){
        throw 'NO_FULLY_HASH_VERIFIED_FIX16_SOURCE_ZIP_NO_INSTALL'
    }
    # A byte-identical duplicate is safe: never rebuild or sign based on a name alone.
    $sourceZip=@($zValid | Sort-Object)[0]
    Add-Row('FIX16_PINNED_EQUIVALENT_SOURCE_ZIP_COUNT: '+$zValid.Count)
    Add-Row('FIX16_SOURCE_SELECTION: DETERMINISTIC_IDENTICAL_HASHES_NO_BUILD_RETRY')
    Add-Row('FIX16_SOURCE_ZIP_SHA256: '+$SourceZipHash)
    $actualUnsignedHash=Sha $u
    if($actualUnsignedHash -ne $UnsignedHashExpected){
        throw 'UNSIGNED_APK_HASH_MISMATCH_NO_SIGN_NO_INSTALL'
    }
    $apkTime=(Get-Item -LiteralPath $u).LastWriteTimeUtc
    foreach($changed in @($r,$p,$v,$t,$g)) {
        if($apkTime -lt (Get-Item -LiteralPath $changed).LastWriteTimeUtc){
            throw 'UNSIGNED_APK_OLDER_THAN_PATCHED_SOURCE_NO_INSTALL'
        }
    }
    $source=[PSCustomObject]@{Root=$proj;Runtime=$r;Policy=$p;
        Unsigned=$u;SourceZip=$sourceZip;Time=$apkTime}
    Add-Row('FIX16_UNSIGNED_APK_SHA256: '+$actualUnsignedHash)
    Add-Row('UNSIGNED_APK_EXACT_PRIOR_BUILD: VERIFIED')
    Stage 'STEP 2/5: Find existing Android SDK 35 and JDK 17'
    $sdk=Join-Path $env:LOCALAPPDATA 'Android\Sdk'
    if(!(Test-Path -LiteralPath $sdk)){throw 'EXISTING_ANDROID_SDK_NOT_FOUND'}
    $builds=@(Get-ChildItem -LiteralPath (Join-Path $sdk 'build-tools') -Directory -ErrorAction SilentlyContinue |
        Where-Object {$_.Name -match '^3[45]\.'} | Sort-Object Name -Descending)
    $zipalign=$null;$signJar=$null;$aapt=$null
    foreach($b in $builds){
        $a=Join-Path $b.FullName 'zipalign.exe'
        $s=Join-Path $b.FullName 'lib\apksigner.jar'
        $t=Join-Path $b.FullName 'aapt.exe'
        if((Test-Path -LiteralPath $a) -and (Test-Path -LiteralPath $s) -and (Test-Path -LiteralPath $t)){
            $zipalign=$a;$signJar=$s;$aapt=$t;break
        }
    }
    if(!$zipalign){throw 'EXISTING_ANDROID_BUILD_TOOLS_NOT_FOUND'}
    $adb=Find-Exe 'adb.exe' (Join-Path $sdk 'platform-tools\adb.exe')
    $jdk17='C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot\bin'
    $keytool=Find-Exe 'keytool.exe' (Join-Path $jdk17 'keytool.exe')
    $java=Find-Exe 'java.exe' (Join-Path $jdk17 'java.exe')
    if(!$adb -or !$keytool -or !$java){throw 'EXISTING_ADB_OR_JDK17_JAVA_KEYTOOL_NOT_FOUND'}
    Add-Row('APK_SIGNING_ENGINE: JDK_JAVA_DIRECT_APKSIGNER_JAR')
    $versionResult=Cmd-Output $java @('-version')
    if($versionResult.ExitCode -ne 0){throw 'JAVA_RUNTIME_FAILED'}
    Add-Row('EXISTING_ANDROID_TOOLCHAIN: FOUND')
    # Locate only an ORIGINAL matching certificate. Never create a key or upload private material.
    Stage 'STEP 3/5: Locate original signing key (no export, no new key)'
    $candidate=New-Object 'System.Collections.Generic.List[string]'
    $standard=Join-Path $env:USERPROFILE '.android\debug.keystore'
    if(Test-Path -LiteralPath $standard){$candidate.Add($standard)}
    # Previously approved local signing-key locations only; never copy or bundle a key.
    foreach($root in $downloads){
        foreach($f in @(Get-ChildItem -LiteralPath $root -File -ErrorAction SilentlyContinue |
            Where-Object {$_.Extension -in @('.keystore','.jks')})){$candidate.Add($f.FullName)}
        foreach($d in @(Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue |
            Where-Object {$_.Name -match '(?i)(JH168|JH167|sign|key|cert|auth|인증|안증)' } | Select-Object -First 60)){
            foreach($f in @(Get-ChildItem -LiteralPath $d.FullName -Recurse -File -ErrorAction SilentlyContinue |
                Where-Object {$_.Extension -in @('.keystore','.jks')})){$candidate.Add($f.FullName)}
        }
    }
    $candidate=@($candidate.ToArray() | Sort-Object -Unique)
    $key=$null
    foreach($candidatePath in $candidate){
        $check=Cmd-Output $keytool @('-exportcert','-rfc','-keystore',$candidatePath,
            '-storepass','android','-alias','androiddebugkey')
        if($check.ExitCode -ne 0){continue}
        $pem=[regex]::Match($check.Text,'(?s)-----BEGIN CERTIFICATE-----\s*(.*?)\s*-----END CERTIFICATE-----')
        if(!$pem.Success){continue}
        try {
            $b64=$pem.Groups[1].Value -replace '\s',''
            $der=[Convert]::FromBase64String($b64)
            $digest=[BitConverter]::ToString([System.Security.Cryptography.SHA256]::Create().ComputeHash($der)).Replace('-','').ToLowerInvariant()
            if($digest -eq $OriginalCert){$key=$candidatePath;break}
        } catch {continue}
    }
    if(!$key){throw 'ORIGINAL_MATCHING_SIGNING_KEY_NOT_FOUND_NO_NEW_KEY'}
    $CertFound=$true
    $KeyPathForRedaction=$key
    Add-Row('ORIGINAL_CERTIFICATE_SHA256: '+$OriginalCert)
    Add-Row('ORIGINAL_CERTIFICATE_FOUND_IN_EXISTING_KEYSTORE: YES')
    # Certificate equality alone is not proof of private-key availability.
    # The ability to sign is checked by apksigner + its signed certificate readback.
    Stage 'STEP 4/5: Align + sign exact unsigned APK once and verify pinned original certificate'
    $alignedResult=Cmd-Output $zipalign @('-f','-p','4',$source.Unsigned,$Aligned)
    $AlignedCreated=Test-Path -LiteralPath $Aligned -PathType Leaf
    if($alignedResult.ExitCode -ne 0 -or !(Test-Path -LiteralPath $Aligned)){
        Add-Diagnostic 'ZIPALIGN' $alignedResult.Text $alignedResult.ExitCode
        throw ('ZIPALIGN_FAILED_EXIT_'+$alignedResult.ExitCode)
    }
    Add-Row('ZIPALIGN: PASS')
    # Direct JDK java -jar bypasses Windows .bat quoting/launcher problems.
    # ONE sign attempt only. No fallback or repeated phone action.
    $signResult=Cmd-Output $java @('-jar',$signJar,'sign','--ks',$key,'--ks-key-alias','androiddebugkey',
        '--ks-pass','pass:android','--key-pass','pass:android',
        '--v1-signing-enabled','true','--v2-signing-enabled','true','--v3-signing-enabled','true',
        '--out',$Signed,$Aligned)
    $SignedCreated=Test-Path -LiteralPath $Signed -PathType Leaf
    if($signResult.ExitCode -ne 0 -or !(Test-Path -LiteralPath $Signed)){
        Add-Diagnostic 'SIGN' $signResult.Text $signResult.ExitCode
        throw ('SIGN_FAILED_EXIT_'+$signResult.ExitCode+'_SEE_SIGN_DIAGNOSTIC_TXT')
    }
    Add-Row('SIGN_COMMAND: EXIT_0')
    $verification=Cmd-Output $java @('-jar',$signJar,'verify','--verbose','--print-certs',$Signed)
    if($verification.ExitCode -ne 0){
        Add-Diagnostic 'VERIFY' $verification.Text $verification.ExitCode
        throw ('APK_SIGNATURE_VERIFICATION_FAILED_EXIT_'+$verification.ExitCode)
    }
    $match=[regex]::Match($verification.Text,'Signer #1 certificate SHA-256 digest:\s*([0-9a-fA-F]{64})')
    if(!$match.Success -or $match.Groups[1].Value.ToLowerInvariant() -ne $OriginalCert){
        throw 'SIGNED_APK_CERTIFICATE_MISMATCH_NO_INSTALL'
    }
    $badging=Cmd-Output $aapt @('dump','badging',$Signed)
    if($badging.ExitCode -ne 0){throw 'SIGNED_APK_MANIFEST_UNREADABLE'}
    $pkg=[regex]::Match($badging.Text,"package:\s+name='([^']+)'\s+versionCode='([^']+)'")
    if(!$pkg.Success -or $pkg.Groups[1].Value -ne 'com.koreanlifehub.bridge' -or
        $pkg.Groups[2].Value -ne '168'){throw 'SIGNED_APK_PACKAGE_OR_VERSION_MISMATCH_NO_INSTALL'}
    $SignatureVerified=$true
    Add-Row('ORIGINAL_PRIVATE_KEY_SIGNATURE_VERIFIED: YES')
    $SignedHash=Sha $Signed
    Add-Row('SIGNED_APK_SHA256: '+$SignedHash)
    Add-Row('SIGNED_APK_CERTIFICATE: ORIGINAL_VERIFIED')
    Add-Row('SIGNED_APK_PACKAGE: com.koreanlifehub.bridge')
    Add-Row('SIGNED_APK_VERSION_CODE: 168')
    Stage 'STEP 5/5: Verify exactly one Samsung phone and the existing JH app'
    $deviceInfo=Cmd-Output $adb @('devices','-l')
    if($deviceInfo.ExitCode -ne 0){throw 'ADB_DEVICES_FAILED'}
    $deviceLines=@($deviceInfo.Text -split "`r?`n" |
        Where-Object {$_ -match '^\S+\s+device(\s|$)'})
    if($deviceLines.Count -ne 1){throw ('CONNECTED_AUTHORIZED_DEVICES_COUNT_'+$deviceLines.Count)}
    $serial=($deviceLines[0] -split '\s+')[0]
    $mfg=Cmd-Output $adb @('-s',$serial,'shell','getprop','ro.product.manufacturer')
    if($mfg.ExitCode -ne 0 -or $mfg.Text.Trim() -notmatch '(?i)^samsung$'){
        throw 'TARGET_IS_NOT_VERIFIED_SAMSUNG_NO_INSTALL'
    }
    $installed=Cmd-Output $adb @('-s',$serial,'shell','pm','path','com.koreanlifehub.bridge')
    if($installed.ExitCode -ne 0 -or $installed.Text -notmatch '(?m)^package:'){
        throw 'ORIGINAL_APP_NOT_INSTALLED_NO_FRESH_INSTALL'
    }
    Add-Row('EXACTLY_ONE_DEVICE: VERIFIED')
    Add-Row('EXISTING_APP_BEFORE_UPDATE: INSTALLED')
    # This is the user's one-click operation, not an automated retry or background update.
    Stage 'STEP 5/5: Run ONE authorized adb install -r (never uninstall or data wipe)'
    # Sticky idempotency barrier lives OUTSIDE the downloaded ZIP folder.
    # A second extraction/click must never issue the same device-changing action.
    $GuardDir=Join-Path $env:LOCALAPPDATA 'JH16F16'
    if(!(Test-Path -LiteralPath $GuardDir -PathType Container)) {throw 'ONECLICK_GUARD_DIRECTORY_NOT_FOUND'}
    $GuardPath=Join-Path $GuardDir 'FIX16-INSTALL-ATTEMPT-ONCE.txt'
    $guardText=@('FIX16_OWNER_ONE_CLICK_INSTALL_ATTEMPT',('SIGNED_APK_SHA256: '+$SignedHash),
        ('DATE: '+(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')),
        'DO_NOT_AUTO_REPLAY_IF_INSTALL_RESULT_UNCERTAIN') -join "`n"
    try {
        $guardStream=[System.IO.File]::Open($GuardPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
        try {
            $data=$Utf8.GetBytes($guardText)
            $guardStream.Write($data,0,$data.Length)
            $guardStream.Flush()
        } finally { $guardStream.Dispose() }
    } catch [System.IO.IOException] {
        throw 'ONECLICK_INSTALL_ALREADY_ATTEMPTED_NO_REPEAT'
    }
    Add-Row('FIX16_PERSISTENT_INSTALL_GUARD: WRITTEN_BEFORE_ADB_INSTALL')
    $InstallAttempted=$true
    $install=Cmd-Output $adb @('-s',$serial,'install','-r',$Signed)
    if($install.ExitCode -ne 0 -or $install.Text -notmatch '(?m)^Success\s*$'){
        throw ('UPDATE_FAILED_ONE_ATTEMPT_EXIT_'+$install.ExitCode)
    }
    $InstallReportedSuccess=$true
    $after=Cmd-Output $adb @('-s',$serial,'shell','pm','path','com.koreanlifehub.bridge')
    $details=Cmd-Output $adb @('-s',$serial,'shell','dumpsys','package','com.koreanlifehub.bridge')
    if($after.ExitCode -ne 0 -or $after.Text -notmatch '(?m)^package:' -or
       $details.ExitCode -ne 0 -or $details.Text -notmatch 'versionCode=168(\s|\b)'){
        $State='INSTALLED_REPORTED_POSTCHECK_INCOMPLETE'
        Add-Row('POSTINSTALL_PACKAGE_VERIFIED: INCOMPLETE')
    } else {
        $State='UPDATE_REPORTED_AND_PACKAGE_VERSION_VERIFIED'
        Add-Row('POSTINSTALL_PACKAGE_VERSION: 168')
    }
    # Optional read-only installed base.apk SHA256 check. Inaccessible packages yield
    # UNKNOWN, not another install attempt, because Samsung's shell permissions vary.
    if($InstallReportedSuccess){
        $afterPkg=Cmd-Output $adb @('-s',$serial,'shell','pm','path','com.koreanlifehub.bridge')
        $pathMatches=@($afterPkg.Text -split "`r?`n" | Where-Object {$_ -match '^package:/data/app/[A-Za-z0-9_./=~+\-]+/base[.]apk\s*$'})
        if($afterPkg.ExitCode -eq 0 -and $pathMatches.Count -eq 1){
            $basePath=$pathMatches[0].Substring(8).Trim()
            $remote=Cmd-Output $adb @('-s',$serial,'shell','sha256sum',$basePath)
            if($remote.ExitCode -eq 0 -and $remote.Text -match '^([0-9a-fA-F]{64})\s+'){
                if($Matches[1].ToLowerInvariant() -eq $SignedHash){
                    Add-Row('POSTINSTALL_APK_BYTE_SHA256: MATCH')
                } else {
                    Add-Row('POSTINSTALL_APK_BYTE_SHA256: MISMATCH_REVIEW_REQUIRED_NO_REINSTALL')
                    $State='POSTINSTALL_BINARY_HASH_MISMATCH_NO_AUTORETRY'
                }
            } else {Add-Row('POSTINSTALL_APK_BYTE_SHA256: NOT_ACCESSIBLE_READ_ONLY_CHECK')}
        } else {Add-Row('POSTINSTALL_APK_BYTE_SHA256: NOT_ACCESSIBLE_READ_ONLY_CHECK')}
    }
} catch {
    Add-Row('STOP_REASON: '+$_.Exception.Message)
    if($InstallReportedSuccess){$State='INSTALL_REPORTED_POSTCHECK_ERROR'}
    elseif($InstallAttempted){$State='UPDATE_ATTEMPTED_NOT_VERIFIED_NO_RETRY'}
    elseif($SignatureVerified){$State='SIGNED_NOT_INSTALLED'}
} finally {
    if($AlignedCreated -and (Test-Path -LiteralPath $Aligned)){
        Remove-Item -LiteralPath $Aligned -Force -ErrorAction SilentlyContinue
    }
    # Remove only this attempt's never-verified candidate, never an original APK.
    if($SignedCreated -and -not $SignatureVerified -and (Test-Path -LiteralPath $Signed)){
        Remove-Item -LiteralPath $Signed -Force -ErrorAction SilentlyContinue
        $Diagnostic.Add('UNVERIFIED_PARTIAL_SIGNED_OUTPUT: REMOVED_FROM_NEW_KIT_ONLY')
    }
    Stage ('DONE: '+$State)
    Add-Row('DEVICE_INSTALL_ATTEMPTED: '+$InstallAttempted.ToString().ToUpperInvariant())
    Add-Row('ORIGINAL_FIX10_SOURCE_ZIP: UNCHANGED')
    Add-Row('SECURE56_POLICY: UNCHANGED')
    Add-Row('COMPUTER_USE: NOT_USED')
    Add-Row('PARENT_SCROLL_FALLBACK: NOT_USED')
    Add-Row('GITHUB_DEPLOYMENT: NOT_ATTEMPTED')
    if($Diagnostic.Count -eq 2){$Diagnostic.Add('NO_SIGNER_FAILURE_OUTPUT; SEE_RESULT_TXT')}
    # Optional diagnostics cannot prevent the primary result or fallback.
    # Do not touch another process's files if the shared run lock was not obtained.
    if($null -ne $RunLock){
        try {[System.IO.File]::WriteAllLines($DiagnosticFile,$Diagnostic.ToArray(),$Utf8)}
        catch {Add-Row('SIGN_DIAGNOSTIC_WRITE: UNAVAILABLE')}
    }
    $attemptCount=0
    if($InstallAttempted){$attemptCount=1}
    try {
        if($SafetyReady){
            $ResultReceipt=Write-JhRunResult -Kit $Kit -RunId $EffectiveRunId -Kind 'SIGNER' -Status $State `
                -AttemptCount $attemptCount -Lines $Rows.ToArray() -AllowPrimary $AllowPrimaryResult
        } else {
            Write-Host 'RUN_SAFETY_UNAVAILABLE: no device action occurred and no current-run result was saved.' -ForegroundColor Red
        }
    } finally {
        if($SafetyReady){Exit-JhRunLock -Lock $RunLock -Owned $OwnRunLock}
    }
    $Rows | ForEach-Object {Write-Host $_}
    Write-Host ('STATUS: '+$State)
    Write-Host ('ANDROID_INSTALL_ATTEMPT_COUNT: '+$attemptCount)
    Write-Host 'Never rerun on an unknown install result.'
}
# An in-process receipt identifies only this invocation's saved result. Never exit
# the parent PowerShell host or ask it to infer success from an old RESULT.txt.
[PSCustomObject]@{RunId=$EffectiveRunId;Kind='SIGNER';Status=$State;AttemptCount=$attemptCount;
    ResultSaved=($null -ne $ResultReceipt -and $ResultReceipt.Saved);
    ReportPath=$(if($null -ne $ResultReceipt){$ResultReceipt.ReportPath}else{$null});
    FallbackUsed=($null -ne $ResultReceipt -and $ResultReceipt.FallbackUsed)}
