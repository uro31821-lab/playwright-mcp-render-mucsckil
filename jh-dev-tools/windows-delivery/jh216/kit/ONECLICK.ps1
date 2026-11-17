# Built once in the verified Linux environment; this PC only signs and updates.
$ErrorActionPreference='Stop'
$Kit=$PSScriptRoot
$RunId=[guid]::NewGuid().ToString('N')
$ExpectedUnsigned='91b9f31ff3dd7bb4c593712145278428ee44e05eb39ccef9cf79afbd3817b77b'
$ExpectedSource='70d313ee21b15268d01c1874687b19a8d5a99343ed2a5d15f37fe63bbb60dbf9'
$ExpectedCert='7cc577efe48e865fdbe799b92aa9edf89724631361ae97979f2b8e4a940a288b'
$BaselineSha='3700d413de7b726cf3afde7f162210b2d4577504b747d0e3ebd570cb2579f79a'
$VersionName='jh216-kabiseo-goal-switches-secure56'
$Status='BLOCKED';$Reason='NOT_RUN';$Stage='PREFLIGHT';$SignedSha='NOT_RUN'
$script:JhInstallAttempts=0;$RunLock=$null;$NamedMutex=$null;$OwnMutex=$false;$AllowPrimary=$false
$Signing='NOT_RUN';$Scan='NOT_RUN';$Preflight='NOT_RUN';$Report=$null
. (Join-Path $Kit 'JH-RUN-SAFETY.ps1')
try {
    if($PSVersionTable.PSEdition -cne 'Desktop' -or $PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1){throw 'WINDOWS_POWERSHELL_51_REQUIRED'}
    if(Test-Path -LiteralPath (Join-Path $Kit 'RESULT.txt')){throw 'PREVIOUS_RESULT_PRESERVED_NO_REPLAY'}
    $NamedMutex=New-Object System.Threading.Mutex($false,'Local\JH216_Camera_Release')
    try{$OwnMutex=$NamedMutex.WaitOne(0,$false)}catch [System.Threading.AbandonedMutexException]{$OwnMutex=$true}
    if(!$OwnMutex){throw 'ANOTHER_JH216_RELEASE_RUNNING'}
    $RunLock=Enter-JhRunLock $Kit $RunId
    if(Test-Path -LiteralPath (Join-Path $Kit 'RESULT.txt')){throw 'PREVIOUS_RESULT_PRESERVED_NO_REPLAY'}
    $AllowPrimary=$true
    if($Kit.Length -gt 150 -or $Kit -match '(?i)\.zip[\\/]' -or $Kit -match '(?i)[\\/]Temp[\\/].*\.tmp') {throw 'EXTRACT_TO_A_SHORT_ORDINARY_FOLDER'}
    $manifest=Get-Content -LiteralPath (Join-Path $Kit 'delivery-manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if($manifest.schema -cne 'JH216_DELIVERY_FILES_V1'){throw 'INVALID_DELIVERY_MANIFEST'}
    foreach($item in $manifest.files){
        if($item.path -match '(\.\.|^[/\\]|:)' -or $item.sha256 -cnotmatch '^[0-9a-f]{64}$'){throw 'INVALID_DELIVERY_FILE_PATH'}
        $p=Join-Path $Kit $item.path
        if(!(Test-Path -LiteralPath $p -PathType Leaf) -or (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant() -cne $item.sha256){throw 'DELIVERY_FILES_MISSING_OR_CHANGED'}
    }
    foreach($p in @(Get-ChildItem -LiteralPath $Kit -Filter '*.ps1' -File)){
        $tokens=$null;$errors=$null
        $ast=[Management.Automation.Language.Parser]::ParseFile($p.FullName,[ref]$tokens,[ref]$errors)
        if($errors.Count -gt 0){throw 'POWERSHELL_PARSE_FAILED'}
        foreach($f in @($ast.FindAll({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst]},$true))){
            if(Get-Alias -Name $f.Name -ErrorAction SilentlyContinue){throw 'POWERSHELL_FUNCTION_ALIAS_COLLISION'}
        }
        foreach($n in @($ast.FindAll({param($a) $a -is [Management.Automation.Language.AssignmentStatementAst]},$true))){
            if($n.Left.Extent.Text -match '^\$(?i:Matches|HOME|Host|PID|PSHOME|PSScriptRoot|Args|Input|Error|LASTEXITCODE)$'){throw 'POWERSHELL_AUTOMATIC_VARIABLE_ASSIGNMENT'}
        }
    }
    . (Join-Path $Kit 'JH216-LIB.ps1')
    $Unsigned=Join-Path $Kit 'payload\JH216_UNSIGNED.apk'
    Assert-JhFileHash $Unsigned $ExpectedUnsigned
    $receipt=Get-Content -LiteralPath (Join-Path $Kit 'payload\build-receipt.json') -Raw -Encoding UTF8|ConvertFrom-Json
    if($receipt.sourceDigestSha256 -cne $ExpectedSource -or $receipt.apk.sha256 -cne $ExpectedUnsigned -or $receipt.apk.versionCode -ne 216){throw 'BUILD_RECEIPT_MISMATCH'}
    $Tools=Get-JhTools
    Assert-JhApk $Unsigned $Tools.Aapt 216 $VersionName
    if(!$env:LOCALAPPDATA){throw 'LOCAL_STATE_DIRECTORY_UNAVAILABLE'}
    $State=Join-Path $env:LOCALAPPDATA ('JH\Camera216\'+$ExpectedUnsigned)
    [void][IO.Directory]::CreateDirectory($State)
    $Work=Join-Path $State $RunId
    [void][IO.Directory]::CreateDirectory($Work)
    $Signed=Join-Path $State 'JH216_ORIGINAL_CERT_SIGNED.apk'
    $Preflight='PASS_FILES_PATH_PARSE_IDENTITY_HASH_LOCK'
    $Stage='ORIGINAL_CERTIFICATE_SIGNING'
    if(Test-Path -LiteralPath $Signed -PathType Leaf){
        Assert-JhCertificate $Signed $Tools.Signer $ExpectedCert
        Assert-JhApk $Signed $Tools.Aapt 216 $VersionName
        Assert-JhPayloadEqual $Unsigned $Signed
        $Signing='REUSED_SIGNED_APK_EXACT_PAYLOAD_CERT_PASS'
    } else {
        $signMarker=Join-Path $State 'sign-attempt.json'
        if(Test-Path -LiteralPath $signMarker){throw 'PREVIOUS_SIGN_ATTEMPT_UNKNOWN_NO_REPLAY'}
        $OriginalKey=Get-JhOriginalKey $Tools.Keytool $ExpectedCert
        $Aligned=Join-Path $Work 'aligned-unsigned.apk'
        $r=Invoke-JhTool $Tools.Align @('-P','16','4',$Unsigned,$Aligned)
        if($r.Code -ne 0){throw 'ZIPALIGN_FAILED'}
        Assert-JhPayloadEqual $Unsigned $Aligned
        New-JhAttemptMarker $signMarker $RunId $ExpectedUnsigned
        $env:JH216_KEYPASS=if($env:JH_ORIGINAL_KEY_PASS){$env:JH_ORIGINAL_KEY_PASS}else{$env:JH216_STOREPASS}
        $r=Invoke-JhTool $Tools.Signer @('sign','--ks',$OriginalKey.Path,'--ks-key-alias',$OriginalKey.Alias,'--ks-pass','env:JH216_STOREPASS','--key-pass','env:JH216_KEYPASS','--out',$Signed,$Aligned)
        if($r.Code -ne 0){throw 'SIGNING_UNCONFIRMED_NO_INSTALL'}
        Assert-JhCertificate $Signed $Tools.Signer $ExpectedCert
        Assert-JhApk $Signed $Tools.Aapt 216 $VersionName
        Assert-JhPayloadEqual $Unsigned $Signed
        $Signing='NEW_PASS_ORIGINAL_CERT_EXACT_PAYLOAD'
    }
    $SignedSha=Get-JhSha $Signed
    $Stage='WINDOWS_DEFENDER_SCAN'
    if(!(Get-Command Start-MpScan -ErrorAction SilentlyContinue) -or !(Get-Command Get-MpThreatDetection -ErrorAction SilentlyContinue)){throw 'DEFENDER_SCAN_NOT_AVAILABLE_NO_INSTALL'}
    Start-MpScan -ScanType CustomScan -ScanPath $Signed -ErrorAction Stop
    $detections=@(Get-MpThreatDetection -ErrorAction Stop | Where-Object {
        @($_.Resources | Where-Object {$_ -and $_.IndexOf($Signed,[StringComparison]::OrdinalIgnoreCase) -ge 0}).Count -gt 0
    })
    if($detections.Count -gt 0){throw 'DEFENDER_MATCHING_DETECTION_NO_INSTALL'}
    $Scan='PASS_NO_MATCHING_DETECTION'
    $Stage='READ_DEVICE_AND_CONFIRM_UPDATE'
    $Serial=Get-JhDevice $Tools.Adb
    $algorithm=[Security.Cryptography.SHA256]::Create()
    try{$deviceHash=([BitConverter]::ToString($algorithm.ComputeHash([Text.Encoding]::UTF8.GetBytes($Serial)))).Replace('-','').ToLowerInvariant()}finally{$algorithm.Dispose()}
    $Marker=Join-Path $State ('install-'+$deviceHash+'.json')
    $Status=Invoke-JhUpdateOnce $Tools.Adb $Serial $Signed $SignedSha $BaselineSha $Work $Marker $RunId
    $Reason='READ_RESULT_STATUS';$Stage='DONE'
} catch {
    $rawReason=$_.Exception.Message
    $Reason=if($rawReason -cmatch '^[A-Z][A-Z0-9_]{1,100}$'){$rawReason}else{'LOCAL_STEP_FAILED_PRIVATE_DETAILS_NOT_LOGGED'}
    if($script:JhInstallAttempts -eq 1){$Status='UNKNOWN_INSTALL_READBACK_REQUIRED'}else{$Status='BLOCKED_NO_INSTALL'}
} finally {
    Remove-Item Env:JH216_STOREPASS -ErrorAction SilentlyContinue
    Remove-Item Env:JH216_KEYPASS -ErrorAction SilentlyContinue
    $lines=@('JH216_CAMERA_SWITCHES_RELEASE_V1',('UTC: '+[DateTime]::UtcNow.ToString('o')),('STAGE: '+$Stage),('REASON: '+$Reason),
        ('PREFLIGHT: '+$Preflight),('UNSIGNED_SHA256: '+$ExpectedUnsigned),('SOURCE_SHA256: '+$ExpectedSource),
        ('SIGNED_SHA256: '+$SignedSha),('SIGNING: '+$Signing),('DEFENDER_SCAN: '+$Scan),
        'BUILD: REUSED_VERIFIED_UNSIGNED_NO_LOCAL_BUILD','APP_ID: com.koreanlifehub.bridge','VERSION_CODE: 216',
        'JH215_VOICE: PAUSED_NOT_INCLUDED','APP_UNINSTALL: NEVER','DATA_CLEAR: NEVER','NEW_KEY_CREATED: NO',
        'PRIVATE_KEY_UPLOAD: NO','RENDER_DEPLOY: NOT_RUN','CAPTURE_E2E: NOT_RUN')
    $Report=Write-JhRunResult -Kit $Kit -RunId $RunId -Kind 'ONECLICK' -Status $Status -AttemptCount $script:JhInstallAttempts -Lines $lines -AllowPrimary $AllowPrimary
    Exit-JhRunLock $RunLock ($null -ne $RunLock)
    if($OwnMutex){$NamedMutex.ReleaseMutex()}
    if($null -ne $NamedMutex){$NamedMutex.Dispose()}
}
if(!$Report.Saved){exit 2}
if($Report.FallbackUsed){exit 20}
exit 0
