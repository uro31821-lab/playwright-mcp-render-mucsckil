param([Parameter(Mandatory=$true)][string]$KitRoot)
$ErrorActionPreference='Stop'
$KitRoot=(Resolve-Path -LiteralPath $KitRoot).Path
$scratch=Join-Path ([IO.Path]::GetTempPath()) ('JHEQ-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($scratch) | Out-Null
$savedLocal=$env:LOCALAPPDATA
$savedTemp=$env:TEMP
$passed=0
$failed=0
$outcomes=New-Object 'System.Collections.Generic.List[object]'
function Assert-Case([bool]$Condition,[string]$Reason) { if (!$Condition) { throw ('ASSERTION: '+$Reason) } }
function New-Fixture([string]$Name) {
    $root=Join-Path $scratch $Name
    [IO.Directory]::CreateDirectory((Join-Path $root 'data\evidence')) | Out-Null
    foreach ($name in @('Start-JH-Ebiseo.ps1','JH-Ebiseo-InstallCore.ps1','Confirm-JH-Ebiseo-Result.ps1')) { Copy-Item -LiteralPath (Join-Path $KitRoot ('data\'+$name)) -Destination (Join-Path $root ('data\'+$name)) }
    Copy-Item -LiteralPath (Join-Path $KitRoot 'POWER_SHELL_ERROR_CHECKLIST.txt') -Destination $root
    $release=Get-Content -LiteralPath (Join-Path $KitRoot 'data\RELEASE.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $release.status='VERIFIED_PREBUILT_UNSIGNED_CANDIDATE'
    $archive=Join-Path $root 'data\JH-Ebiseo-0.5.3-unsigned.apk'
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip=[IO.Compression.ZipFile]::Open($archive,[IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($entryName in @('AndroidManifest.xml','classes.dex','assets/synthetic.txt')) {
            $entry=$zip.CreateEntry($entryName);$writer=New-Object IO.StreamWriter($entry.Open())
            try { $writer.Write('SYNTHETIC_NON_EXECUTABLE_'+$entryName+'_'+$Name) } finally { $writer.Dispose() }
        }
    } finally { $zip.Dispose() }
    $release.payload.sha256=(Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    $release.payload.bytes=(Get-Item -LiteralPath $archive).Length
    $release.sourceManifestSha256='a'*64
    $evidence=@()
    foreach ($index in 1..3) {
        $file=Join-Path $root ('data\evidence\synthetic-'+$index+'.json')
        [IO.File]::WriteAllText($file,'{"synthetic":true,"deviceOperations":0}')
        $evidence+=@{path=('data/evidence/synthetic-'+$index+'.json');sha256=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()}
    }
    $release.evidence=$evidence
    $manifest=Join-Path $root 'data\RELEASE.json'
    [IO.File]::WriteAllText($manifest,($release|ConvertTo-Json -Depth 12),(New-Object Text.UTF8Encoding($false)))
    $env:LOCALAPPDATA=Join-Path $root 'local-state'
    $env:TEMP=Join-Path $root 'temporary'
    [IO.Directory]::CreateDirectory($env:LOCALAPPDATA) | Out-Null
    [IO.Directory]::CreateDirectory($env:TEMP) | Out-Null
    return [pscustomobject]@{Root=$root;Release=$release;Payload=$archive;ManifestSha=(Get-FileHash -LiteralPath $manifest -Algorithm SHA256).Hash.ToLowerInvariant()}
}
function Invoke-Scenario([string]$Name,[scriptblock]$Body) {
    try { & $Body; $script:passed++;$script:outcomes.Add(@{name=$Name;status='PASS'});Write-Host ('PASS '+$Name) }
    catch { $script:failed++;$script:outcomes.Add(@{name=$Name;status='FAIL';reason=$_.Exception.Message});Write-Host ('FAIL '+$Name+': '+$_.Exception.Message) }
}
# Parse the actual production bytes before creating any test fixture.
foreach ($scriptPath in @(Get-ChildItem -LiteralPath (Join-Path $KitRoot 'data') -Filter '*.ps1' -File)) {
    $tokens=$null;$parseErrors=$null
    $ast=[Management.Automation.Language.Parser]::ParseFile($scriptPath.FullName,[ref]$tokens,[ref]$parseErrors)
    Assert-Case (@($parseErrors).Count -eq 0) ('PowerShell syntax '+$scriptPath.Name)
    $assignments=$ast.FindAll({param($n) $n -is [Management.Automation.Language.AssignmentStatementAst]},$true)
    foreach ($assignment in $assignments) {
        if ($assignment.Left -is [Management.Automation.Language.VariableExpressionAst]) {
            $variable=$assignment.Left.VariablePath.UserPath
            Assert-Case ($variable -notmatch '^(?i:Matches|HOME|PID|Host|Error|Args|Input|PSVersionTable|ExecutionContext)$') ('automatic variable '+$variable)
        }
    }
}
. (Join-Path $KitRoot 'data\JH-Ebiseo-InstallCore.ps1')
Invoke-Scenario 'real native wrapper rejects launch failure after exit zero' {
    $ok=Invoke-JhNative $env:ComSpec @('/d','/c','exit 0')
    Assert-Case ($ok.ExitCode -eq 0) 'harmless native exit zero'
    $missing=Invoke-JhNative (Join-Path $scratch 'NONEXISTENT-NATIVE.exe') @()
    Assert-Case ($missing.ExitCode -ne 0) 'stale exit zero not reused'
}
foreach ($kind in @('current','stale-id','wrong-kind','tampered-hash')) {
    Invoke-Scenario ('actual result verifier '+$kind) {
        $folder=Join-Path $scratch ('verify-'+$kind);[IO.Directory]::CreateDirectory($folder)|Out-Null
        $run=[guid]::NewGuid().ToString('N')
        $resultPath=Join-Path $folder 'RESULT.txt'
        $pointerPath=Join-Path $folder 'handoff.json'
        $reportKind='JH_EBISEO_PREBUILT_INSTALL_RESULT_V1'
        $actualId=$run
        if($kind -eq 'stale-id'){$actualId='0'*32}
        if($kind -eq 'wrong-kind'){$reportKind='OTHER_REPORT'}
        $report=@{reportKind=$reportKind;runId=$actualId;status='PREPARED_NOT_INSTALLED'}
        [IO.File]::WriteAllText($resultPath,($report|ConvertTo-Json))
        $hash=(Get-FileHash -LiteralPath $resultPath -Algorithm SHA256).Hash.ToLowerInvariant()
        if($kind -eq 'tampered-hash'){[IO.File]::AppendAllText($resultPath,'CHANGED')}
        $pointer=@{reportKind=$reportKind;runId=$actualId;resultPath=$resultPath;resultSha256=$hash}
        [IO.File]::WriteAllText($pointerPath,($pointer|ConvertTo-Json))
        $checked=Invoke-JhNative (Join-Path $PSHOME 'powershell.exe') @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $KitRoot 'data\Confirm-JH-Ebiseo-Result.ps1'),'-RunId',$run,'-Handoff',$pointerPath)
        if($kind -eq 'current'){Assert-Case ($checked.ExitCode -eq 0) 'current result rejected'}
        else {Assert-Case ($checked.ExitCode -ne 0) 'invalid result accepted'}
    }
}

# Mocks exist only in this separate test process. Production has no test switch.
$script:mode='success';$script:installCalls=0;$script:signCalls=0;$script:installed=$false;$script:fixture=$null
function Get-JhTools($Release) { return [pscustomobject]@{Java='SYNTHETIC_JAVA';Keytool='SYNTHETIC_KEYTOOL';Signer='SYNTHETIC_SIGNER';Aapt='SYNTHETIC_AAPT';Zipalign='SYNTHETIC_ZIPALIGN';Adb='SYNTHETIC_ADB'} }
function Find-JhOriginalKey($Tools,$Release,$State) { $State.keySearch='SYNTHETIC_CERT_MATCH';return 'SYNTHETIC_NOT_A_REAL_KEY' }
function Read-JhInstallApproval {
    if($script:mode -eq 'decline'){return 'N'}
    $script:approvalPassed=$true
    if($script:mode -eq 'payload-after-prompt') {
        $signed=Join-Path $env:LOCALAPPDATA ('JH168\Ebiseo\artifacts\'+$script:fixture.Release.payload.sha256+'\SIGNED.apk')
        [IO.File]::AppendAllText($signed,'SYNTHETIC_CHANGED_AFTER_APPROVAL')
    }
    return 'Y'
}
function Invoke-JhNative([string]$Exe,[string[]]$Arguments) {
    $text='';$code=0
    if ($Exe -eq 'SYNTHETIC_AAPT') {
        $version=$script:fixture.Release.application.versionName
        if ($Arguments[-1] -match 'installed-(before|confirmation)[.]apk$') { $version=$script:fixture.Release.allowedInstalledVersionNames[0] }
        if ($Arguments[-1] -match 'installed-after[.]apk$' -and !$script:installed) { $version=$script:fixture.Release.allowedInstalledVersionNames[0] }
        if ($script:mode -eq 'wrong-version' -and $Arguments[-1] -eq $script:fixture.Payload) { $version+='-wrong' }
        if ($script:mode -eq 'unknown-current' -and $Arguments[-1] -match 'installed-') { $version='newer-unreviewed-source' }
        if ($script:mode -eq 'already-installed') { $version=$script:fixture.Release.application.versionName }
        $text="package: name='com.koreanlifehub.bridge' versionCode='168' versionName='"+$version+"'"+[Environment]::NewLine+"sdkVersion:'26'"+[Environment]::NewLine+"targetSdkVersion:'35'"
    } elseif ($Exe -eq 'SYNTHETIC_JAVA') {
        if ($Arguments -contains 'sign') {
            $script:signCalls++
            $outPosition=[Array]::IndexOf($Arguments,'--out')
            Copy-Item -LiteralPath $script:fixture.Payload -Destination $Arguments[$outPosition+1]
        } else {
            $cert=$script:fixture.Release.signing.certificateSha256
            if ($script:mode -eq 'wrong-signed-cert' -or ($script:mode -eq 'wrong-installed-cert' -and $Arguments[-1] -match 'installed-')) { $cert='b'*64 }
            $text='Verified using v2 scheme (APK Signature Scheme v2): true'+[Environment]::NewLine+'Verified using v3 scheme (APK Signature Scheme v3): true'+[Environment]::NewLine+'Signer #1 certificate SHA-256 digest: '+$cert
        }
    } elseif ($Exe -eq 'SYNTHETIC_ZIPALIGN') { $text='synthetic aligned'
    } elseif ($Exe -eq 'SYNTHETIC_ADB') {
        if ($Arguments[0] -eq 'devices') {
            $phone='SYNTHETIC_PHONE'
            if($script:mode -eq 'device-after-prompt' -and $script:approvalPassed){$phone='SYNTHETIC_CHANGED_PHONE'}
            $text='List of devices attached'+[Environment]::NewLine+$phone+' device product:fixture model:fixture'
        }
        elseif ($Arguments[0] -eq '-d') {
            $text='SYNTHETIC_PHONE'
            if($script:mode -eq 'device-after-prompt' -and $script:approvalPassed){$text='SYNTHETIC_CHANGED_PHONE'}
        }
        elseif ($Arguments -contains 'install') {
            $script:installCalls++
            if ($script:mode -eq 'unknown-install') { $code=1;$text='synthetic transport lost' }
            else { $script:installed=$true;$text='Success' }
        } elseif ($Arguments -contains 'dumpsys') {
            $version=$script:fixture.Release.allowedInstalledVersionNames[0]
            if ($script:installed -or $script:mode -eq 'already-installed') { $version=$script:fixture.Release.application.versionName }
            if ($script:mode -eq 'unknown-current') { $version='newer-unreviewed-source' }
            if ($script:mode -eq 'app-after-prompt' -and $script:approvalPassed) { $version='newer-after-owner-confirmation' }
            $text='  versionCode=168 minSdk=26 targetSdk=35'+[Environment]::NewLine+'  versionName='+$version
        } elseif ($Arguments -contains 'pull') {
            if ($script:mode -eq 'readback-unavailable' -and $script:installed) { return [pscustomobject]@{ExitCode=1;Text='synthetic unavailable'} }
            Copy-Item -LiteralPath $script:fixture.Payload -Destination $Arguments[-1]
        } elseif ($Arguments -contains 'pm') { $text='package:/data/app/SYNTHETIC/base.apk' }
        else { throw 'Unexpected synthetic ADB call' }
    } else { throw ('REAL_OR_UNKNOWN_TOOL_FORBIDDEN: '+$Exe) }
    return [pscustomobject]@{ExitCode=$code;Text=$text}
}
function Run-Fixture([string]$Mode,[string]$RunId=([guid]::NewGuid().ToString('N'))) {
    $script:mode=$Mode
    $handoff=Join-Path $script:fixture.Root ('handoff-'+$RunId+'.json')
    $outcome=Invoke-JhPrebuiltInstall -Root $script:fixture.Root -RunId $RunId -Handoff $handoff -PinnedReleaseSha $script:fixture.ManifestSha
    Write-Host ('SYNTHETIC_RESULT: mode='+$Mode+' status='+$outcome.status+' stage='+$outcome.stage+' reason='+$outcome.reason)
    return $outcome
}
function Reset-Fixture([string]$Name) {
    $script:fixture=New-Fixture $Name;$script:installCalls=0;$script:signCalls=0;$script:installed=$false;$script:approvalPassed=$false
}
try {
    Invoke-Scenario 'wrong payload blocks before signer and device' {
        Reset-Fixture 'wrong-payload'
        [IO.File]::AppendAllText($script:fixture.Payload,'changed')
        $r=Run-Fixture 'success'
        Assert-Case ($r.reason -eq 'PREBUILT_APK_HASH_MISMATCH' -and $script:signCalls -eq 0 -and $script:installCalls -eq 0) 'hash guard'
    }
    Invoke-Scenario 'wrong exact version blocks before signing' {
        Reset-Fixture 'wrong-version';$r=Run-Fixture 'wrong-version'
        Assert-Case ($r.reason -eq 'APK_IDENTITY_MISMATCH' -and $script:signCalls -eq 0 -and $script:installCalls -eq 0) 'exact version guard'
    }
    Invoke-Scenario 'wrong signed certificate blocks installation' {
        Reset-Fixture 'wrong-signed-cert';$r=Run-Fixture 'wrong-signed-cert'
        Assert-Case ($r.reason -eq 'ORIGINAL_CERTIFICATE_MISMATCH' -and $script:installCalls -eq 0) 'signed certificate guard'
    }
    Invoke-Scenario 'wrong installed certificate blocks installation' {
        Reset-Fixture 'wrong-installed-cert';$r=Run-Fixture 'wrong-installed-cert'
        Assert-Case ($r.reason -eq 'ORIGINAL_CERTIFICATE_MISMATCH' -and $script:installCalls -eq 0) 'installed certificate guard'
    }
    Invoke-Scenario 'newer installed version blocks downgrade' {
        Reset-Fixture 'unknown-current';$r=Run-Fixture 'unknown-current'
        Assert-Case ($r.reason -eq 'NEWER_OR_UNREVIEWED_INSTALLED_VERSION' -and $script:installCalls -eq 0) 'current baseline guard'
    }
    Invoke-Scenario 'approved APK changed while owner considers prompt blocks install' {
        Reset-Fixture 'apk-race';$r=Run-Fixture 'payload-after-prompt'
        Assert-Case ($r.reason -eq 'APPROVED_APK_CHANGED' -and $script:installCalls -eq 0) 'APK after-prompt recheck'
    }
    Invoke-Scenario 'USB phone changed after prompt blocks install' {
        Reset-Fixture 'phone-race';$r=Run-Fixture 'device-after-prompt'
        Assert-Case ($r.reason -eq 'APPROVED_USB_PHONE_CHANGED' -and $script:installCalls -eq 0) 'USB after-prompt recheck'
    }
    Invoke-Scenario 'newer installed app after prompt blocks install' {
        Reset-Fixture 'app-race';$r=Run-Fixture 'app-after-prompt'
        Assert-Case ($r.reason -eq 'NEWER_OR_UNREVIEWED_INSTALLED_VERSION' -and $script:installCalls -eq 0) 'app after-prompt recheck'
    }
    Invoke-Scenario 'decline preserves signed APK and next run reuses it' {
        Reset-Fixture 'decline';$r=Run-Fixture 'decline'
        Assert-Case ($r.status -eq 'PREPARED_NOT_INSTALLED' -and $script:installCalls -eq 0 -and $script:signCalls -eq 1) 'decline behavior'
        $second=Run-Fixture 'decline'
        Assert-Case ($second.signing -eq 'REUSED_VERIFIED_ORIGINAL_SIGNATURE' -and $script:signCalls -eq 1) 'signed reuse'
    }
    Invoke-Scenario 'successful update checks exact installed hash' {
        Reset-Fixture 'success';$r=Run-Fixture 'success'
        Assert-Case ($r.status -eq 'INSTALLED_VERIFIED_DEVICE_BEHAVIOR_NOT_RUN' -and $r.installedPackageHash -eq 'MATCH' -and $script:installCalls -eq 1) 'verified install outcome'
        Assert-Case (@(Get-ChildItem -LiteralPath (Join-Path $env:LOCALAPPDATA 'JH168\Ebiseo\attempts') -File).Count -eq 1) 'durable attempt'
    }
    Invoke-Scenario 'same APK already installed skips install' {
        Reset-Fixture 'already-installed';$r=Run-Fixture 'already-installed'
        Assert-Case ($r.status -eq 'ALREADY_INSTALLED_VERIFIED' -and $script:installCalls -eq 0) 'already-installed readback'
    }
    Invoke-Scenario 'unknown install retains fence across second run' {
        Reset-Fixture 'unknown-install';$r=Run-Fixture 'unknown-install'
        Assert-Case ($r.status -eq 'UNKNOWN_NO_AUTOMATIC_RETRY' -and $script:installCalls -eq 1) 'first unknown'
        $second=Run-Fixture 'unknown-install'
        Assert-Case ($second.reason -eq 'PRIOR_INSTALL_DISPATCH_NO_AUTOMATIC_RETRY' -and $script:installCalls -eq 1) 'no second dispatch'
    }
    Invoke-Scenario 'post-install unavailable readback stays unknown' {
        Reset-Fixture 'readback-unavailable';$r=Run-Fixture 'readback-unavailable'
        Assert-Case ($r.status -eq 'UNKNOWN_NO_AUTOMATIC_RETRY' -and $r.installedPackageHash -eq 'UNKNOWN' -and $script:installCalls -eq 1) 'readback not success'
    }
    Invoke-Scenario 'concurrent lock blocks before native effects' {
        Reset-Fixture 'concurrent'
        $folder=Join-Path $env:LOCALAPPDATA 'JH168\Ebiseo';[IO.Directory]::CreateDirectory($folder)|Out-Null
        $held=[IO.File]::Open((Join-Path $folder 'update.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
        try {$r=Run-Fixture 'success'} finally {$held.Dispose()}
        Assert-Case ($r.reason -eq 'ANOTHER_JH_UPDATE_IS_RUNNING' -and $script:signCalls -eq 0 -and $script:installCalls -eq 0) 'exclusive lock'
    }
    Invoke-Scenario 'primary result failure uses fallback' {
        Reset-Fixture 'result-fallback'
        $originalWrite=(Get-Item Function:\Write-JhNewText).ScriptBlock
        function Write-JhNewText([string]$Path,[string]$Text) {
            if ($Path -match '[\\/]runs[\\/].*[\\/]RESULT[.]txt$') { throw 'SYNTHETIC_PRIMARY_RESULT_FAILURE' }
            & $originalWrite $Path $Text
        }
        try {$r=Run-Fixture 'decline'} finally {Set-Item Function:\Write-JhNewText $originalWrite}
        Assert-Case ($r.resultPath -match 'local-state' -and (Test-Path -LiteralPath $r.resultPath)) 'fallback result'
    }
    Invoke-Scenario 'all result failures do not claim saved success' {
        Reset-Fixture 'all-result-failure'
        $originalWrite=(Get-Item Function:\Write-JhNewText).ScriptBlock
        function Write-JhNewText([string]$Path,[string]$Text) {
            if ($Path -match 'RESULT[.]txt$') { throw 'SYNTHETIC_ALL_RESULT_FAILURE' }
            & $originalWrite $Path $Text
        }
        try {$r=Run-Fixture 'decline'} finally {Set-Item Function:\Write-JhNewText $originalWrite}
        Assert-Case ($r.status -eq 'RESULT_WRITE_FAILED' -and $script:installCalls -eq 0) 'all writes failed'
    }
    Invoke-Scenario 'duplicate run preserves previous result' {
        Reset-Fixture 'preserve'
        $id=[guid]::NewGuid().ToString('N');$r=Run-Fixture 'decline' $id
        $before=(Get-FileHash -LiteralPath $r.resultPath -Algorithm SHA256).Hash
        $again=Run-Fixture 'decline' $id
        Assert-Case ((Get-FileHash -LiteralPath $r.resultPath -Algorithm SHA256).Hash -ceq $before) 'old result preserved'
        Assert-Case ($again.reason -eq 'CURRENT_RUN_HANDOFF_ALREADY_EXISTS' -and $script:installCalls -eq 0) 'duplicate blocked'
    }
} finally { $env:LOCALAPPDATA=$savedLocal;$env:TEMP=$savedTemp }
$report=@{schema='JH_EBISEO_WINDOWS51_MOCK_TESTS_V1';powershellVersion=$PSVersionTable.PSVersion.ToString();synthetic=$true;realKeys=0;realAdb=0;realDevices=0;passed=$passed;failed=$failed;cases=$outcomes;artifacts=$scratch}
$path=Join-Path $scratch 'WINDOWS-TEST-RESULT.json'
[IO.File]::WriteAllText($path,($report|ConvertTo-Json -Depth 8),(New-Object Text.UTF8Encoding($false)))
Write-Host ('TEST_RESULT_PATH: '+$path)
if ($failed -gt 0) { exit 1 }
exit 0
