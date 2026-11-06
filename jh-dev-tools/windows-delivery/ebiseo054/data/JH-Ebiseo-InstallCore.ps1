# Windows PowerShell 5.1. Definitions only: loading this file has no device effects.
# Every external process goes through Invoke-JhNative. Tests replace that function
# in an isolated process; production exposes no simulation, bypass, or retry flag.
Set-StrictMode -Version 2.0

function Stop-JhRun([string]$Code) {
    $problem = New-Object System.InvalidOperationException($Code)
    $problem.Data['JhCode'] = $Code
    throw $problem
}
function Get-JhFailureCode($Problem) {
    $exception = $Problem.Exception
    if ($exception -and $exception.Data.Contains('JhCode')) { return [string]$exception.Data['JhCode'] }
    return 'UNCLASSIFIED_FAILURE_REQUIRES_REVIEW'
}
function Get-JhSha([string]$Path) {
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256 -ErrorAction Stop).Hash.ToLowerInvariant()
}
function Get-JhTextSha([string]$Text) {
    $engine = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($engine.ComputeHash([Text.Encoding]::UTF8.GetBytes($Text)))).Replace('-','').ToLowerInvariant() }
    finally { $engine.Dispose() }
}
function Write-JhNewText([string]$Path, [string]$Text) {
    $parent = Split-Path -Parent $Path
    [IO.Directory]::CreateDirectory($parent) | Out-Null
    $stream = [IO.File]::Open($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try {
        $bytes = (New-Object Text.UTF8Encoding($false)).GetBytes($Text)
        $stream.Write($bytes,0,$bytes.Length)
        $stream.Flush($true)
    } finally { $stream.Dispose() }
}
function Write-JhStep($State, [string]$Step) {
    $State.stage = $Step
    Write-Host ('[Ebiseo] ' + $Step)
    try {
        [IO.File]::AppendAllText($State.logPath,([DateTime]::UtcNow.ToString('o')+' '+$Step+[Environment]::NewLine),(New-Object Text.UTF8Encoding($false)))
    } catch { $State.logWarning = 'LOG_WRITE_FAILED' }
}
function Assert-JhRegularFile([string]$Path,[string]$Code) {
    if (!(Test-Path -LiteralPath $Path -PathType Leaf)) { Stop-JhRun $Code }
    if (((Get-Item -LiteralPath $Path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { Stop-JhRun 'REPARSE_FILE_NOT_ALLOWED' }
}
function Read-JhJson([string]$Path) {
    Assert-JhRegularFile $Path 'REQUIRED_JSON_MISSING'
    return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8 -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop)
}
function Invoke-JhNative([string]$Exe,[string[]]$Arguments) {
    # Do not log arguments, process output, paths to keys, or environment values.
    $previous = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $global:LASTEXITCODE = $null
        try { $lines = @(& $Exe @Arguments 2>&1 | ForEach-Object { $_.ToString() }) }
        catch { return [pscustomobject]@{ ExitCode=-9001;Text='NATIVE_LAUNCH_FAILED' } }
        $exit = $global:LASTEXITCODE
        if ($null -eq $exit) { return [pscustomobject]@{ ExitCode=-9001;Text='NATIVE_LAUNCH_NOT_CONFIRMED' } }
        return [pscustomobject]@{ ExitCode=$exit; Text=($lines -join [Environment]::NewLine) }
    } finally { $ErrorActionPreference = $previous }
}
function Invoke-JhRequired([string]$Exe,[string[]]$Arguments,[string]$Code) {
    $answer = Invoke-JhNative $Exe $Arguments
    if ($answer.ExitCode -ne 0) { Stop-JhRun $Code }
    return [string]$answer.Text
}
function Join-JhCandidate([string]$Base,[string]$Child) {
    if ([string]::IsNullOrWhiteSpace($Base)) { return $null }
    return (Join-Path -Path $Base -ChildPath $Child)
}
function Get-JhTools($Release) {
    $checkpoint = $null
    $checkpointPath = Join-JhCandidate $env:LOCALAPPDATA 'JH168\verified-toolchain-8.9.json'
    if ($checkpointPath -and (Test-Path -LiteralPath $checkpointPath -PathType Leaf)) {
        try {
            $saved = Read-JhJson $checkpointPath
            if ($saved.schema -eq 'JH168_VERIFIED_LOCAL_TOOLCHAIN_V1' -and $saved.certificateSha256 -ceq $Release.signing.certificateSha256) { $checkpoint=$saved }
        } catch { $checkpoint=$null }
    }
    $jdkPaths = New-Object 'System.Collections.Generic.List[string]'
    if ($checkpoint) { $jdkPaths.Add([string]$checkpoint.jdkHome) }
    if ($env:JAVA_HOME) { $jdkPaths.Add($env:JAVA_HOME) }
    foreach ($folder in @((Join-JhCandidate $env:ProgramFiles 'Microsoft'),(Join-JhCandidate $env:ProgramFiles 'Eclipse Adoptium'),(Join-JhCandidate $env:ProgramFiles 'Java'),(Join-JhCandidate $env:LOCALAPPDATA 'Programs\Eclipse Adoptium'))) {
        if ($folder -and (Test-Path -LiteralPath $folder -PathType Container)) {
            foreach ($candidate in @(Get-ChildItem -LiteralPath $folder -Directory -ErrorAction SilentlyContinue | Select-Object -First 30)) { $jdkPaths.Add($candidate.FullName) }
        }
    }
    $jdk=$null
    foreach ($folder in @($jdkPaths | Select-Object -Unique)) {
        if ([string]::IsNullOrWhiteSpace($folder)) { continue }
        $java=Join-Path $folder 'bin\java.exe'
        $keytool=Join-Path $folder 'bin\keytool.exe'
        if (!(Test-Path -LiteralPath $java -PathType Leaf) -or !(Test-Path -LiteralPath $keytool -PathType Leaf)) { continue }
        $observed=Invoke-JhNative $java @('-version')
        if ($observed.ExitCode -eq 0 -and $observed.Text -match 'version "17[."]') { $jdk=$folder;break }
    }
    if (!$jdk) { Stop-JhRun 'EXISTING_JAVA17_REQUIRED' }
    $sdkPaths=New-Object 'System.Collections.Generic.List[string]'
    if ($checkpoint) { $sdkPaths.Add([string]$checkpoint.androidSdk) }
    foreach ($folder in @($env:ANDROID_HOME,$env:ANDROID_SDK_ROOT,(Join-JhCandidate $env:LOCALAPPDATA 'Android\Sdk'),(Join-JhCandidate $env:USERPROFILE '.jhmcp\android-sdk'),(Join-JhCandidate $env:USERPROFILE '.jhmcp57\android-sdk'),'C:\JHU32\JH\android\sdk','C:\JHU32\JH\android\android-sdk')) {
        if ($folder) { $sdkPaths.Add($folder) }
    }
    foreach ($folder in @($sdkPaths | Select-Object -Unique)) {
        foreach ($version in @('35.0.0','34.0.0')) {
            $buildTools=Join-Path $folder ('build-tools\'+$version)
            $result=[ordered]@{ Java=(Join-Path $jdk 'bin\java.exe');Keytool=(Join-Path $jdk 'bin\keytool.exe');Signer=(Join-Path $buildTools 'lib\apksigner.jar');Aapt=(Join-Path $buildTools 'aapt.exe');Zipalign=(Join-Path $buildTools 'zipalign.exe');Adb=(Join-Path $folder 'platform-tools\adb.exe') }
            $missing=@($result.Values | Where-Object { !(Test-Path -LiteralPath $_ -PathType Leaf) })
            if ($missing.Count -eq 0) { return [pscustomobject]$result }
        }
    }
    Stop-JhRun 'EXISTING_ANDROID_SIGNING_TOOLS_REQUIRED'
}
function Find-JhOriginalKey($Tools,$Release,$State) {
    # The confirmed historical key may be Desktop\안증, Desktop\인증 or redirected
    # Desktop. This retains Stage78's bounded search, not a recursive disk search.
    $desktop=[Environment]::GetFolderPath('Desktop')
    $roots=@((Join-JhCandidate $env:USERPROFILE '.android'),$desktop,(Join-JhCandidate $env:USERPROFILE 'Desktop'),(Join-JhCandidate $env:USERPROFILE 'Downloads'),(Join-JhCandidate $env:USERPROFILE 'Documents'),(Join-JhCandidate $env:OneDrive 'Desktop'),(Join-JhCandidate $env:OneDrive '바탕 화면'),(Join-JhCandidate $env:OneDriveConsumer 'Desktop'),(Join-JhCandidate $env:OneDriveCommercial 'Desktop')) | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Container) } | Select-Object -Unique
    $directories=New-Object 'System.Collections.Generic.List[string]'
    foreach ($rootPath in $roots) {
        $directories.Add([string]$rootPath)
        foreach ($child in @('안증','인증','서명','keys','key','keystore','Keystore','.android','JH')) {
            $candidate=Join-Path $rootPath $child
            if (Test-Path -LiteralPath $candidate -PathType Container) { $directories.Add($candidate) }
        }
        if ($rootPath -ne (Join-JhCandidate $env:USERPROFILE '.android')) {
            foreach ($folder in @(Get-ChildItem -LiteralPath $rootPath -Directory -ErrorAction SilentlyContinue | Sort-Object -Property LastWriteTime -Descending | Select-Object -First 100)) { $directories.Add($folder.FullName) }
        }
    }
    $keyFiles=New-Object 'System.Collections.Generic.List[string]'
    if ($env:JH_ORIGINAL_KEYSTORE -and (Test-Path -LiteralPath $env:JH_ORIGINAL_KEYSTORE -PathType Leaf)) { $keyFiles.Add($env:JH_ORIGINAL_KEYSTORE) }
    foreach ($folder in @($directories | Select-Object -Unique)) {
        foreach ($keyFile in @(Get-ChildItem -LiteralPath $folder -File -Filter 'debug*.keystore' -ErrorAction SilentlyContinue)) { $keyFiles.Add($keyFile.FullName) }
    }
    foreach ($keyPath in @($keyFiles | Select-Object -Unique)) {
        $State.keyCandidates++
        $check=Invoke-JhNative $Tools.Keytool @('-list','-v','-keystore',$keyPath,'-alias',[string]$Release.signing.alias,'-storepass:env','JH_EBISEO_STORE_PASSWORD')
        if ($check.ExitCode -ne 0) { continue }
        $certificate=[regex]::Match($check.Text,'(?im)^\s*SHA256:\s*([0-9a-f:]{64,96})\s*$')
        if ($certificate.Success -and $certificate.Groups[1].Value.Replace(':','').ToLowerInvariant() -ceq $Release.signing.certificateSha256) {
            $State.keySearch='ORIGINAL_CERT_MATCH'
            return $keyPath
        }
    }
    Stop-JhRun 'MATCHING_EXISTING_ORIGINAL_KEY_REQUIRED'
}
function Read-JhApkIdentity($Tools,[string]$Path) {
    $badging=Invoke-JhRequired $Tools.Aapt @('dump','badging',$Path) 'APK_METADATA_READ_FAILED'
    $info=[regex]::Match($badging,"(?m)^package: name='([^']+)' versionCode='([0-9]+)' versionName='([^']+)'")
    if (!$info.Success) { Stop-JhRun 'APK_METADATA_INVALID' }
    $minimum=[regex]::Match($badging,"(?m)^sdkVersion:'([0-9]+)'")
    $target=[regex]::Match($badging,"(?m)^targetSdkVersion:'([0-9]+)'")
    return [pscustomobject]@{ Id=$info.Groups[1].Value;Code=[int]$info.Groups[2].Value;Name=$info.Groups[3].Value;Debuggable=($badging -match '(?m)^application-debuggable');MinSdk=($(if($minimum.Success){[int]$minimum.Groups[1].Value}else{-1}));TargetSdk=($(if($target.Success){[int]$target.Groups[1].Value}else{-1})) }
}
function Assert-JhApkIdentity($Identity,$Release,[string]$Version) {
    if ($Identity.Id -cne $Release.application.id -or $Identity.Code -ne $Release.application.versionCode -or $Identity.Name -cne $Version -or $Identity.Debuggable) { Stop-JhRun 'APK_IDENTITY_MISMATCH' }
}
function Assert-JhCertificateText([string]$Text,[string]$Expected) {
    $certificates=[regex]::Matches($Text,'(?im)^Signer #\d+ certificate SHA-256 digest:\s*([0-9a-f]{64})\s*$')
    if ($certificates.Count -ne 1 -or $certificates[0].Groups[1].Value.ToLowerInvariant() -cne $Expected) { Stop-JhRun 'ORIGINAL_CERTIFICATE_MISMATCH' }
    if ($Text -notmatch '(?im)^Verified using v2 scheme.*:\s*true\s*$' -or $Text -notmatch '(?im)^Verified using v3 scheme.*:\s*true\s*$') { Stop-JhRun 'APK_V2_V3_SIGNATURE_REQUIRED' }
}
function Confirm-JhSignedApk($Tools,$Release,[string]$Path,[string]$Version) {
    Assert-JhRegularFile $Path 'SIGNED_APK_MISSING'
    $verify=Invoke-JhRequired $Tools.Java @('-jar',$Tools.Signer,'verify','--verbose','--print-certs','-Werr','--min-sdk-version','26','--max-sdk-version','35',$Path) 'APK_SIGNATURE_VERIFY_FAILED'
    Assert-JhCertificateText $verify $Release.signing.certificateSha256
    $identity=Read-JhApkIdentity $Tools $Path
    Assert-JhApkIdentity $identity $Release $Version
    return [pscustomobject]@{ Sha256=(Get-JhSha $Path);Identity=$identity;CertificateSha256=$Release.signing.certificateSha256 }
}
function Get-JhZipPayload([string]$Path,[bool]$AllowSignature) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive=[IO.Compression.ZipFile]::OpenRead($Path)
    $entries=@{}
    try {
        foreach ($entry in $archive.Entries) {
            if ($entry.FullName.EndsWith('/')) { continue }
            if ($entries.ContainsKey($entry.FullName)) { Stop-JhRun 'DUPLICATE_APK_ENTRY' }
            if ($entry.FullName -match '(?i)^META-INF/(MANIFEST[.]MF|[^/]+[.](RSA|DSA|EC|SF))$') {
                if (!$AllowSignature) { Stop-JhRun 'PREBUILT_INPUT_MUST_BE_UNSIGNED' }
                continue
            }
            $stream=$entry.Open();$digest=[Security.Cryptography.SHA256]::Create()
            try { $entries[$entry.FullName]=([BitConverter]::ToString($digest.ComputeHash($stream))).Replace('-','').ToLowerInvariant() }
            finally { $stream.Dispose();$digest.Dispose() }
        }
    } finally { $archive.Dispose() }
    return $entries
}
function Assert-JhPayloadUnchanged([string]$Unsigned,[string]$Signed) {
    $before=Get-JhZipPayload $Unsigned $false
    $after=Get-JhZipPayload $Signed $true
    if ($before.Count -ne $after.Count) { Stop-JhRun 'SIGNED_PAYLOAD_ENTRY_COUNT_MISMATCH' }
    foreach ($name in $before.Keys) {
        if (!$after.ContainsKey($name) -or $after[$name] -cne $before[$name]) { Stop-JhRun 'SIGNED_PAYLOAD_CHANGED' }
    }
}
function Read-JhRelease([string]$Root,[string]$PinnedSha) {
    if ($PinnedSha -notmatch '^[0-9a-f]{64}$' -or $PinnedSha -eq ('0'*64)) { Stop-JhRun 'RELEASE_NOT_FINALIZED' }
    $path=Join-Path $Root 'data\RELEASE.json'
    Assert-JhRegularFile $path 'RELEASE_MANIFEST_MISSING'
    if ((Get-JhSha $path) -cne $PinnedSha) { Stop-JhRun 'RELEASE_MANIFEST_HASH_MISMATCH' }
    $release=Read-JhJson $path
    if ($release.schema -cne 'JH_EBISEO_PREBUILT_RELEASE_V1' -or $release.status -cne 'VERIFIED_PREBUILT_UNSIGNED_CANDIDATE') { Stop-JhRun 'VERIFIED_PREBUILT_RELEASE_REQUIRED' }
    if ($release.payload.path -cne 'data/JH-Ebiseo-0.5.4-unsigned.apk' -or $release.payload.sha256 -notmatch '^[0-9a-f]{64}$' -or $release.payload.bytes -le 0) { Stop-JhRun 'PAYLOAD_CONTRACT_INVALID' }
    foreach ($evidence in $release.evidence) {
        if ($evidence.path -notmatch '^data/evidence/[A-Za-z0-9._-]+$' -or $evidence.sha256 -notmatch '^[0-9a-f]{64}$') { Stop-JhRun 'EVIDENCE_CONTRACT_INVALID' }
        $evidencePath=Join-Path $Root $evidence.path
        Assert-JhRegularFile $evidencePath 'BUILD_EVIDENCE_MISSING'
        if ((Get-JhSha $evidencePath) -cne $evidence.sha256) { Stop-JhRun 'BUILD_EVIDENCE_HASH_MISMATCH' }
    }
    if (@($release.evidence).Count -lt 3) { Stop-JhRun 'BUILD_EVIDENCE_INCOMPLETE' }
    return $release
}
function Get-JhDevice($Tools) {
    $output=Invoke-JhRequired $Tools.Adb @('devices','-l') 'ADB_DEVICE_LIST_FAILED'
    $rows=@($output -split '\r?\n' | Where-Object { $_ -match '^\S+\s+(device|offline|unauthorized|recovery|sideload)(\s|$)' })
    if ($rows.Count -ne 1 -or $rows[0] -notmatch '^\S+\s+device(\s|$)') { Stop-JhRun 'ONE_AUTHORIZED_USB_PHONE_REQUIRED' }
    $serial=($rows[0] -split '\s+')[0]
    $usb=(Invoke-JhRequired $Tools.Adb @('-d','get-serialno') 'ONE_USB_PHONE_REQUIRED').Trim()
    if ($usb -cne $serial -or $serial -match '^emulator-') { Stop-JhRun 'USB_PHONE_IDENTITY_MISMATCH' }
    return $serial
}
function Get-JhInstalledState($Tools,$Release,[string]$Serial,[string]$CopyPath) {
    $paths=Invoke-JhRequired $Tools.Adb @('-s',$Serial,'shell','pm','path',$Release.application.id) 'INSTALLED_APP_QUERY_FAILED'
    $basePaths=@($paths -split '\r?\n' | Where-Object { $_ -match '^package:/data/app/[^'']+/base[.]apk\s*$' })
    if ($basePaths.Count -ne 1) { Stop-JhRun 'EXISTING_JH_APP_REQUIRED' }
    $devicePath=$basePaths[0].Substring(8).Trim()
    $dump=Invoke-JhRequired $Tools.Adb @('-s',$Serial,'shell','dumpsys','package',$Release.application.id) 'INSTALLED_VERSION_READ_FAILED'
    $code=[regex]::Match($dump,'(?m)^\s*versionCode=([0-9]+)(?:\s|$)')
    $name=[regex]::Match($dump,'(?m)^\s*versionName=([^\r\n]+)')
    if (!$code.Success -or !$name.Success -or [int]$code.Groups[1].Value -ne $Release.application.versionCode) { Stop-JhRun 'INSTALLED_PACKAGE_VERSION_UNEXPECTED' }
    $version=$name.Groups[1].Value.Trim()
    $allowed=@($Release.allowedInstalledVersionNames)+@([string]$Release.application.versionName)
    if ($allowed -cnotcontains $version) { Stop-JhRun 'NEWER_OR_UNREVIEWED_INSTALLED_VERSION' }
    if (Test-Path -LiteralPath $CopyPath) { Stop-JhRun 'INSTALLED_APK_COPY_ALREADY_EXISTS' }
    Invoke-JhRequired $Tools.Adb @('-s',$Serial,'pull',$devicePath,$CopyPath) 'INSTALLED_APK_READBACK_FAILED' | Out-Null
    $verified=Confirm-JhSignedApk $Tools $Release $CopyPath $version
    return [pscustomobject]@{ VersionName=$version;Sha256=$verified.Sha256;CertificateSha256=$verified.CertificateSha256 }
}
function Read-JhInstallApproval {
    return (Read-Host 'Install this verified JH update once? Existing app data is retained. Type Y')
}
function Save-JhResult($State,[string]$Root,[string]$RunId,[string]$Handoff) {
    $State.finishedAtUtc=[DateTime]::UtcNow.ToString('o')
    $candidates=@((Join-Path $Root ('runs\'+$RunId+'\RESULT.txt')),(Join-JhCandidate $env:LOCALAPPDATA ('JH168\Ebiseo\results\'+$RunId+'\RESULT.txt')),(Join-JhCandidate $env:TEMP ('JH-Ebiseo-'+$RunId+'\RESULT.txt'))) | Where-Object { $_ }
    foreach ($candidate in $candidates) {
        try {
            $State.resultPath=$candidate
            Write-JhNewText $candidate ($State | ConvertTo-Json -Depth 12)
            Write-Host ('RESULT_PATH: '+$candidate)
            try {
                Write-JhNewText $Handoff (@{runId=$RunId;reportKind=$State.reportKind;resultPath=$candidate;resultSha256=(Get-JhSha $candidate)} | ConvertTo-Json -Depth 4)
            } catch { Write-Host 'RESULT_HANDOFF_WRITE_FAILED' }
            return $candidate
        } catch { }
    }
    Write-Host 'RESULT_WRITE_FAILED'
    Write-Host ('RUN_ID: '+$RunId)
    Write-Host ('STATUS: '+$State.status)
    Write-Host ('REASON: '+$State.reason)
    $State.resultPath=$null
    return $null
}
function Invoke-JhPrebuiltInstall([string]$Root,[string]$RunId,[string]$Handoff,[string]$PinnedReleaseSha) {
    $state=[ordered]@{reportKind='JH_EBISEO_PREBUILT_INSTALL_RESULT_V1';runId=$RunId;startedAtUtc=[DateTime]::UtcNow.ToString('o');finishedAtUtc=$null;status='BLOCKED';stage='INIT';reason='';cloudBuild='NOT_RUN';signing='NOT_RUN';keySearch='NOT_RUN';keyCandidates=0;installAttempts=0;installMayHaveExecuted=$false;installedPackageHash='NOT_RUN';deviceBehavior='NOT_RUN';sourceManifestSha256=$null;releaseManifestSha256=$PinnedReleaseSha;unsignedApkSha256=$null;signedApkSha256=$null;certificateSha256=$null;currentVersionName=$null;currentApkSha256=$null;logWarning=$null;cleanupWarning=$null;logPath=$null;resultPath=$null}
    $runDir=$null;$lockStream=$null;$apkReadLock=$null
    $savedStore=[Environment]::GetEnvironmentVariable('JH_EBISEO_STORE_PASSWORD','Process')
    $savedKey=[Environment]::GetEnvironmentVariable('JH_EBISEO_KEY_PASSWORD','Process')
    try {
        if ($RunId -notmatch '^[0-9a-f]{32}$') { Stop-JhRun 'INVALID_RUN_ID' }
        $Root=[IO.Path]::GetFullPath($Root)
        if ($Root.Length -gt 120) { Stop-JhRun 'EXTRACT_TO_SHORT_PATH_REQUIRED' }
        if (Test-Path -LiteralPath $Handoff) { Stop-JhRun 'CURRENT_RUN_HANDOFF_ALREADY_EXISTS' }
        $runDir=Join-Path $Root ('runs\'+$RunId)
        if (Test-Path -LiteralPath $runDir) { Stop-JhRun 'RUN_DIRECTORY_ALREADY_EXISTS' }
        [IO.Directory]::CreateDirectory($runDir) | Out-Null
        $state.logPath=Join-Path $runDir 'RUN.log'
        Write-JhStep $state 'VERIFY_EXTRACTED_DELIVERY'
        foreach ($relative in @('data\Start-JH-Ebiseo.ps1','data\JH-Ebiseo-InstallCore.ps1','data\Confirm-JH-Ebiseo-Result.ps1','POWER_SHELL_ERROR_CHECKLIST.txt')) { Assert-JhRegularFile (Join-Path $Root $relative) 'DELIVERY_NOT_FULLY_EXTRACTED' }
        $release=Read-JhRelease $Root $PinnedReleaseSha
        $payload=Join-Path $Root $release.payload.path
        Assert-JhRegularFile $payload 'PREBUILT_APK_MISSING'
        if ((Get-Item -LiteralPath $payload).Length -ne $release.payload.bytes -or (Get-JhSha $payload) -cne $release.payload.sha256) { Stop-JhRun 'PREBUILT_APK_HASH_MISMATCH' }
        $state.unsignedApkSha256=$release.payload.sha256
        $state.sourceManifestSha256=$release.sourceManifestSha256
        $state.cloudBuild='REUSED_VERIFIED_CLOUD_BUILD_NO_LOCAL_BUILD'
        if ([string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) { Stop-JhRun 'PERSISTENT_LOCAL_STATE_REQUIRED' }
        $persistent=Join-Path $env:LOCALAPPDATA 'JH168\Ebiseo'
        [IO.Directory]::CreateDirectory($persistent) | Out-Null
        try { $lockStream=[IO.File]::Open((Join-Path $persistent 'update.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None) }
        catch { Stop-JhRun 'ANOTHER_JH_UPDATE_IS_RUNNING' }
        Write-JhStep $state 'VERIFY_PREBUILT_APK_IDENTITY'
        $tools=Get-JhTools $release
        $identity=Read-JhApkIdentity $tools $payload
        Assert-JhApkIdentity $identity $release $release.application.versionName
        if ($identity.MinSdk -ne $release.application.minSdk -or $identity.TargetSdk -ne $release.application.targetSdk) { Stop-JhRun 'APK_SDK_IDENTITY_MISMATCH' }
        Invoke-JhRequired $tools.Zipalign @('-c','4',$payload) 'PREBUILT_ALIGNMENT_FAILED' | Out-Null
        $cache=Join-Path $persistent ('artifacts\'+$release.payload.sha256)
        [IO.Directory]::CreateDirectory($cache) | Out-Null
        $signed=Join-Path $cache 'SIGNED.apk'
        $signatureReceipt=Join-Path $cache 'SIGNATURE.json'
        if (Test-Path -LiteralPath $signed -PathType Leaf) {
            Write-JhStep $state 'VERIFY_EXISTING_SIGNED_ARTIFACT'
            $state.signing='EXISTING_SIGNATURE_VERIFICATION_STARTED'
            $proof=Read-JhJson $signatureReceipt
            if ($proof.schema -cne 'JH_EBISEO_LOCAL_SIGNATURE_V1' -or $proof.unsignedSha256 -cne $release.payload.sha256 -or $proof.signedSha256 -cne (Get-JhSha $signed)) { Stop-JhRun 'EXISTING_SIGNED_ARTIFACT_REQUIRES_REVIEW' }
            $signedProof=Confirm-JhSignedApk $tools $release $signed $release.application.versionName
            Assert-JhPayloadUnchanged $payload $signed
            $state.signing='REUSED_VERIFIED_ORIGINAL_SIGNATURE'
        } else {
            if (Test-Path -LiteralPath $signatureReceipt) { Stop-JhRun 'EXISTING_SIGNATURE_RECEIPT_WITHOUT_ARTIFACT' }
            Write-JhStep $state 'FIND_EXISTING_ORIGINAL_CERTIFICATE'
            # 'android' is the public Android debug-keystore convention, used by
            # the already verified original JH key. Private overrides stay local.
            $storePassword=$env:JH_ORIGINAL_KEYSTORE_PASSWORD
            if ([string]::IsNullOrEmpty($storePassword)) { $storePassword='android' }
            $keyPassword=$env:JH_ORIGINAL_KEY_PASSWORD
            if ([string]::IsNullOrEmpty($keyPassword)) { $keyPassword=$storePassword }
            [Environment]::SetEnvironmentVariable('JH_EBISEO_STORE_PASSWORD',$storePassword,'Process')
            [Environment]::SetEnvironmentVariable('JH_EBISEO_KEY_PASSWORD',$keyPassword,'Process')
            $state.keySearch='EXISTING_KEY_SEARCH_STARTED'
            $keyPath=Find-JhOriginalKey $tools $release $state
            Write-JhStep $state 'SIGN_PREBUILT_WITH_ORIGINAL_KEY'
            $state.signing='SIGNING_DISPATCH_ATTEMPTED_NOT_VERIFIED'
            Invoke-JhRequired $tools.Java @('-jar',$tools.Signer,'sign','--ks',$keyPath,'--ks-key-alias',$release.signing.alias,'--ks-pass','env:JH_EBISEO_STORE_PASSWORD','--key-pass','env:JH_EBISEO_KEY_PASSWORD','--v1-signing-enabled','true','--v2-signing-enabled','true','--v3-signing-enabled','true','--v4-signing-enabled','false','--out',$signed,$payload) 'ORIGINAL_KEY_SIGNING_FAILED' | Out-Null
            $signedProof=Confirm-JhSignedApk $tools $release $signed $release.application.versionName
            Assert-JhPayloadUnchanged $payload $signed
            Invoke-JhRequired $tools.Zipalign @('-c','4',$signed) 'SIGNED_ALIGNMENT_FAILED' | Out-Null
            $state.signing='ORIGINAL_SIGNATURE_VERIFIED_RECEIPT_NOT_SAVED'
            Write-JhNewText $signatureReceipt (@{schema='JH_EBISEO_LOCAL_SIGNATURE_V1';runId=$RunId;unsignedSha256=$release.payload.sha256;signedSha256=$signedProof.Sha256;certificateSha256=$release.signing.certificateSha256;releaseManifestSha256=$PinnedReleaseSha} | ConvertTo-Json -Depth 4)
            $state.signing='VERIFIED_ORIGINAL_SIGNATURE'
        }
        $state.signedApkSha256=$signedProof.Sha256
        $state.certificateSha256=$signedProof.CertificateSha256
        Write-JhStep $state 'VERIFY_CURRENT_USB_APP_AND_CERTIFICATE'
        $serial=Get-JhDevice $tools
        $current=Get-JhInstalledState $tools $release $serial (Join-Path $runDir 'installed-before.apk')
        $state.currentVersionName=$current.VersionName
        $state.currentApkSha256=$current.Sha256
        if ($current.VersionName -ceq $release.application.versionName) {
            if ($current.Sha256 -cne $signedProof.Sha256) { Stop-JhRun 'SAME_VERSION_DIFFERENT_PAYLOAD_REQUIRES_REVIEW' }
            $state.status='ALREADY_INSTALLED_VERIFIED'
            $state.installedPackageHash='MATCH'
            return $state
        }
        $fenceId=Get-JhTextSha ($release.application.id+'|'+$serial+'|'+$release.payload.sha256)
        $fence=Join-Path $persistent ('attempts\'+$fenceId+'.json')
        if (Test-Path -LiteralPath $fence) { Stop-JhRun 'PRIOR_INSTALL_DISPATCH_NO_AUTOMATIC_RETRY' }
        Write-JhStep $state 'READY_FOR_ONE_UPDATE'
        Write-Host ('Current version: '+$current.VersionName)
        Write-Host ('Update version: '+$release.application.versionName)
        Write-Host ('Verified APK SHA-256: '+$signedProof.Sha256)
        $choice=Read-JhInstallApproval
        if ($choice -cne 'Y' -and $choice -cne 'y') {
            $state.status='PREPARED_NOT_INSTALLED'
            $state.reason='OWNER_DID_NOT_CONFIRM'
            return $state
        }
        Write-JhStep $state 'REVERIFY_AFTER_OWNER_CONFIRMATION'
        # Deny mutation/replacement of the approved APK through dispatch/readback.
        try { $apkReadLock=[IO.File]::Open($signed,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read) }
        catch { Stop-JhRun 'APPROVED_APK_CANNOT_BE_LOCKED' }
        if ((Get-JhSha $signed) -cne $signedProof.Sha256) { Stop-JhRun 'APPROVED_APK_CHANGED' }
        if ((Get-JhDevice $tools) -cne $serial) { Stop-JhRun 'APPROVED_USB_PHONE_CHANGED' }
        $confirmed=Get-JhInstalledState $tools $release $serial (Join-Path $runDir 'installed-confirmation.apk')
        if ($confirmed.VersionName -ceq $release.application.versionName -and $confirmed.Sha256 -ceq $signedProof.Sha256) {
            $state.status='ALREADY_INSTALLED_VERIFIED'
            $state.installedPackageHash='MATCH'
            return $state
        }
        if ($confirmed.VersionName -cne $current.VersionName -or $confirmed.Sha256 -cne $current.Sha256 -or $confirmed.CertificateSha256 -cne $current.CertificateSha256) { Stop-JhRun 'APPROVED_INSTALLED_BASELINE_CHANGED' }
        Write-JhStep $state 'COMMIT_ONE_INSTALL_ATTEMPT'
        # CreateNew + Flush(true) on persistent storage BEFORE possible phone effect.
        Write-JhNewText $fence (@{schema='JH_EBISEO_INSTALL_ATTEMPT_V1';runId=$RunId;unsignedApkSha256=$release.payload.sha256;signedApkSha256=$signedProof.Sha256;deviceHash=(Get-JhTextSha $serial);state='DISPATCH_COMMITTED_OUTCOME_REQUIRES_READBACK';committedUtc=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json -Depth 4)
        $state.installAttempts=1
        $state.installMayHaveExecuted=$true
        $state.status='UNKNOWN_NO_AUTOMATIC_RETRY'
        try {
            $install=Invoke-JhNative $tools.Adb @('-s',$serial,'install','-r',$signed)
            if ($install.ExitCode -ne 0 -or $install.Text -notmatch '(?m)^Success\s*$') { $state.reason='ADB_OUTCOME_REQUIRES_READBACK' }
        } catch { $state.reason='ADB_DISPATCH_EXCEPTION_REQUIRES_READBACK' }
        Write-JhStep $state 'VERIFY_INSTALLED_APK_HASH_CERTIFICATE_VERSION'
        try {
            $after=Get-JhInstalledState $tools $release $serial (Join-Path $runDir 'installed-after.apk')
            if ($after.VersionName -ceq $release.application.versionName -and $after.Sha256 -ceq $signedProof.Sha256) {
                $state.status='INSTALLED_VERIFIED_DEVICE_BEHAVIOR_NOT_RUN'
                $state.reason=''
                $state.installedPackageHash='MATCH'
            } else { $state.reason='INSTALLED_PAYLOAD_NOT_CONFIRMED_NO_RETRY';$state.installedPackageHash='MISMATCH' }
        } catch { $state.reason='INSTALLED_READBACK_UNAVAILABLE_NO_RETRY';$state.installedPackageHash='UNKNOWN' }
        return $state
    } catch {
        $state.reason=Get-JhFailureCode $_
        if ($state.installMayHaveExecuted) { $state.status='UNKNOWN_NO_AUTOMATIC_RETRY' }
        return $state
    } finally {
        try {
            try { [Environment]::SetEnvironmentVariable('JH_EBISEO_STORE_PASSWORD',$savedStore,'Process') } catch { $state.cleanupWarning='PASSWORD_ENV_RESTORE_FAILED' }
            try { [Environment]::SetEnvironmentVariable('JH_EBISEO_KEY_PASSWORD',$savedKey,'Process') } catch { $state.cleanupWarning='PASSWORD_ENV_RESTORE_FAILED' }
            $storePassword=$null;$keyPassword=$null;$keyPath=$null
            try { if ($apkReadLock) { $apkReadLock.Dispose() } } catch { $state.cleanupWarning='APK_LOCK_RELEASE_FAILED' }
            try { if ($lockStream) { $lockStream.Dispose() } } catch { $state.cleanupWarning='UPDATE_LOCK_RELEASE_FAILED' }
        } finally {
            $result=Save-JhResult $state $Root $RunId $Handoff
            if (!$result) { $state.status='RESULT_WRITE_FAILED' }
        }
    }
}
