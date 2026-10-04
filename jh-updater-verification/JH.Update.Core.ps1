#requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# No shell command strings are used to invoke native programs.
function ConvertTo-JhNativeArgument([string]$Value) {
    if ($null -eq $Value) { $Value = '' }
    if ($Value.IndexOf([char]0) -ge 0) { throw 'ARGUMENT_NUL' }
    $b = New-Object System.Text.StringBuilder
    [void]$b.Append('"'); $slashes = 0
    foreach ($ch in $Value.ToCharArray()) {
        if ($ch -eq '\') { $slashes++; continue }
        if ($ch -eq '"') {
            [void]$b.Append(('\' * (2 * $slashes + 1))); [void]$b.Append('"')
        } else {
            if ($slashes) { [void]$b.Append(('\' * $slashes)) }
            [void]$b.Append($ch)
        }
        $slashes = 0
    }
    if ($slashes) { [void]$b.Append(('\' * (2 * $slashes))) }
    [void]$b.Append('"'); return $b.ToString()
}

function Invoke-JhNative {
    param([string]$File, [string[]]$Arguments, [int]$TimeoutSeconds = 45)
    if ($TimeoutSeconds -lt 1 -or $TimeoutSeconds -gt 300) { throw 'BAD_TIMEOUT' }
    if (!(Test-Path -LiteralPath $File -PathType Leaf)) { throw 'NATIVE_TOOL_MISSING' }
    if ([IO.Path]::GetExtension($File) -ine '.exe') { throw 'NATIVE_EXE_ONLY' }
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = [IO.Path]::GetFullPath($File)
    $psi.Arguments = (($Arguments | ForEach-Object { ConvertTo-JhNativeArgument $_ }) -join ' ')
    $psi.UseShellExecute = $false; $psi.CreateNoWindow = $true
    $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
    $p = New-Object System.Diagnostics.Process; $p.StartInfo = $psi
    try {
        if (!$p.Start()) { throw 'NATIVE_START_FAILED' }
        $stdout = $p.StandardOutput.ReadToEndAsync(); $stderr = $p.StandardError.ReadToEndAsync()
        if (!$p.WaitForExit($TimeoutSeconds * 1000)) {
            try { $p.Kill(); [void]$p.WaitForExit(3000) } catch {}
            # A timed-out install may still be completing on Android: never auto-retry.
            throw 'NATIVE_TIMEOUT'
        }
        $p.WaitForExit()
        return [pscustomobject]@{ Code = $p.ExitCode; Out = $stdout.GetAwaiter().GetResult(); Err = $stderr.GetAwaiter().GetResult() }
    } finally { $p.Dispose() }
}

function Invoke-JhRequired([string]$File, [string[]]$Arguments, [int]$TimeoutSeconds = 45) {
    $r = Invoke-JhNative $File $Arguments $TimeoutSeconds
    if ($r.Code -ne 0) { throw ('NATIVE_EXIT_' + $r.Code) }
    return $r.Out
}
function Get-JhHash([string]$Path) { return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() }
function Get-JhStreamHash($Stream) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($sha.ComputeHash($Stream)).Replace('-','').ToLowerInvariant() }
    finally { $sha.Dispose() }
}
function Test-JhSignatureEntry([string]$Name) {
    return [regex]::IsMatch($Name, '^META-INF/(?:MANIFEST\.MF|[^/]+\.(?:SF|RSA|DSA|EC))$', [Text.RegularExpressions.RegexOptions]::IgnoreCase)
}
function Assert-JhPayload([string]$Apk, $Entries) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $expected = New-Object 'System.Collections.Generic.Dictionary[string,string]' ([StringComparer]::Ordinal)
    foreach ($prop in $Entries.PSObject.Properties) {
        if ($prop.Value -notmatch '^[0-9a-f]{64}$') { throw 'PAYLOAD_MANIFEST_INVALID' }
        $expected.Add($prop.Name, [string]$prop.Value)
    }
    if ($expected.Count -lt 1) { throw 'PAYLOAD_MANIFEST_EMPTY' }
    $seen = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
    $zip = [IO.Compression.ZipFile]::OpenRead($Apk)
    try {
        foreach ($e in $zip.Entries) {
            $n = $e.FullName
            if (!$seen.Add($n)) { throw 'APK_DUPLICATE_ENTRY' }
            if ($n.EndsWith('/')) { continue }
            if (Test-JhSignatureEntry $n) { continue }
            if (!$expected.ContainsKey($n)) { throw 'APK_UNEXPECTED_ENTRY' }
            $s = $e.Open()
            try { $h = Get-JhStreamHash $s } finally { $s.Dispose() }
            if ($h -cne $expected[$n]) { throw 'APK_PAYLOAD_MISMATCH' }
        }
        foreach ($n in $expected.Keys) { if (!$seen.Contains($n)) { throw 'APK_ENTRY_MISSING' } }
    } finally { $zip.Dispose() }
}
function Read-JhApkIdentity([string]$Text) {
    $m = [regex]::Matches($Text, "(?m)^package: name='([^']+)' versionCode='([0-9]+)' versionName='([^']*)'")
    if ($m.Count -ne 1) { throw 'APK_IDENTITY_UNREADABLE' }
    return [pscustomobject]@{ Package = $m[0].Groups[1].Value; Code = [long]$m[0].Groups[2].Value; Name = $m[0].Groups[3].Value }
}
function Read-JhCertificate([string]$Text) {
    $m = [regex]::Matches($Text, '(?m)^Signer #[0-9]+ certificate SHA-256 digest:\s*([0-9a-fA-F]{64})\s*$')
    if ($m.Count -ne 1) { throw 'APK_SINGLE_CERT_REQUIRED' }
    return $m[0].Groups[1].Value.ToLowerInvariant()
}
function Read-JhDeviceRows([string]$Text) {
    $rows = @(); $header = $false
    foreach ($line in ($Text -split '\r?\n')) {
        $s = $line.Trim().TrimStart([char]0xFEFF)
        if ($s -eq 'List of devices attached') { $header = $true; continue }
        if ($s.Length -eq 0 -or $s.StartsWith('* daemon')) { continue }
        if ($s -notmatch '^([A-Za-z0-9_.:-]+)\s+(device|offline|unauthorized|recovery|sideload|bootloader|no permissions)(?:\s|$)') { throw 'ADB_LIST_UNREADABLE' }
        $rows += [pscustomobject]@{ Serial = $Matches[1]; State = $Matches[2] }
    }
    if (!$header) { throw 'ADB_LIST_UNREADABLE' }
    return $rows
}
function Get-JhSingleDevice([string]$Adb, [int]$WaitSeconds = 0) {
    $deadline = [DateTime]::UtcNow.AddSeconds($WaitSeconds)
    do {
        $text = Invoke-JhRequired $Adb @('devices') 20
        $rows = @(Read-JhDeviceRows $text)
        if ($rows.Count -gt 1) { throw 'ONE_PHONE_ONLY' }
        if ($rows.Count -eq 1 -and $rows[0].State -eq 'device') {
            if ($rows[0].Serial -match '[:.]' -or $rows[0].Serial.StartsWith('emulator-')) { throw 'USB_PHONE_REQUIRED' }
            return [string]$rows[0].Serial
        }
        if ([DateTime]::UtcNow -ge $deadline) { throw 'USB_PHONE_NOT_AUTHORIZED' }
        Start-Sleep -Seconds 2
    } while ($true)
}
function Get-JhTools {
    $roots = @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT)
    if ($env:LOCALAPPDATA) { $roots += (Join-Path $env:LOCALAPPDATA 'Android\Sdk') }
    $sdk = $null
    foreach ($r in $roots) { if ($r -and (Test-Path -LiteralPath (Join-Path $r 'platform-tools\adb.exe'))) { $sdk = $r; break } }
    if (!$sdk) { throw 'ORIGINAL_ANDROID_SDK_MISSING' }
    $dirs = @(Get-ChildItem -LiteralPath (Join-Path $sdk 'build-tools') -Directory | Sort-Object { try { [version]$_.Name } catch { [version]'0.0' } } -Descending)
    $bt = $null
    foreach ($d in $dirs) {
        if ((Test-Path -LiteralPath (Join-Path $d.FullName 'aapt.exe')) -and (Test-Path -LiteralPath (Join-Path $d.FullName 'zipalign.exe')) -and (Test-Path -LiteralPath (Join-Path $d.FullName 'lib\apksigner.jar'))) { $bt = $d.FullName; break }
    }
    if (!$bt) { throw 'ORIGINAL_BUILD_TOOLS_MISSING' }
    $javaRoots = @($env:JAVA_HOME)
    if ($env:ProgramFiles) {
        $javaRoots += (Join-Path $env:ProgramFiles 'Android\Android Studio\jbr')
        foreach ($vendor in @('Microsoft','Eclipse Adoptium')) {
            $base = Join-Path $env:ProgramFiles $vendor
            if (Test-Path -LiteralPath $base) { $javaRoots += @(Get-ChildItem -LiteralPath $base -Directory -Filter 'jdk-*' | Sort-Object Name -Descending | Select-Object -ExpandProperty FullName) }
        }
    }
    $java = $null
    foreach ($r in $javaRoots) { if ($r -and (Test-Path -LiteralPath (Join-Path $r 'bin\java.exe'))) { $java = Join-Path $r 'bin\java.exe'; break } }
    if (!$java) { $c = Get-Command java.exe -ErrorAction SilentlyContinue; if ($c) { $java = $c.Source } }
    if (!$java) { throw 'JAVA_MISSING' }
    return [pscustomobject]@{ Adb = (Join-Path $sdk 'platform-tools\adb.exe'); Aapt = (Join-Path $bt 'aapt.exe'); Align = (Join-Path $bt 'zipalign.exe'); Signer = (Join-Path $bt 'lib\apksigner.jar'); Java = $java }
}
function Get-JhApkIdentity($Tools, [string]$Apk) { return Read-JhApkIdentity (Invoke-JhRequired $Tools.Aapt @('dump','badging',$Apk) 60) }
function Get-JhApkCertificate($Tools, [string]$Apk) { return Read-JhCertificate (Invoke-JhRequired $Tools.Java @('-jar',$Tools.Signer,'verify','--print-certs',$Apk) 90) }
function Get-JhInstalled($Tools, [string]$Serial, [string]$Package, [string]$Directory, [string]$Stage) {
    $output = Invoke-JhRequired $Tools.Adb @('-s',$Serial,'shell','pm','path',$Package) 30
    $lines = @($output -split '\r?\n' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    if ($lines.Count -ne 1 -or $lines[0] -notmatch '^package:(/data/app/[A-Za-z0-9_/+.=~@-]+/base\.apk)$') { throw 'EXISTING_STANDALONE_JH_REQUIRED' }
    $remote = $Matches[1]; $apk = Join-Path $Directory ($Stage + '.apk')
    [void](Invoke-JhRequired $Tools.Adb @('-s',$Serial,'pull',$remote,$apk) 90)
    if (!(Test-Path -LiteralPath $apk)) { throw 'INSTALLED_APK_READ_FAILED' }
    $id = Get-JhApkIdentity $Tools $apk
    if ($id.Package -cne $Package) { throw 'INSTALLED_PACKAGE_MISMATCH' }
    return [pscustomobject]@{ Apk = $apk; Identity = $id; Certificate = (Get-JhApkCertificate $Tools $apk); Hash = (Get-JhHash $apk) }
}
function Get-JhUpdateDecision($Installed, $Release, [bool]$PayloadMatches) {
    if ($Installed.Package -cne $Release.packageName) { throw 'PACKAGE_MISMATCH' }
    if ($Installed.Code -gt $Release.versionCode) { throw 'DOWNGRADE_BLOCKED' }
    if ($Installed.Code -eq $Release.versionCode) {
        if ($Installed.Name -cne $Release.versionName -or !$PayloadMatches) { throw 'SAME_VERSION_DIFFERENT_PAYLOAD' }
        return 'ALREADY_INSTALLED'
    }
    if ($Installed.Code -ne $Release.minimumInstalledVersionCode) { throw 'UNSUPPORTED_BASE_VERSION' }
    return 'UPDATE'
}
function Invoke-JhInstallOnce($Tools, [string]$Serial, [string]$Signed) {
    # Exactly one install call. Do not add -d, -g, uninstall, clear or automatic retry.
    return Invoke-JhNative $Tools.Adb @('-s',$Serial,'install','-r',$Signed) 180
}
function Open-JhApp($Tools, [string]$Serial, [string]$Package) {
    try {
        $r = Invoke-JhNative $Tools.Adb @('-s',$Serial,'shell','am','start','-n',($Package + '/.MainActivity')) 30
        return ($r.Code -eq 0 -and (($r.Out + $r.Err) -notmatch '(?im)^Error'))
    } catch { return $false }
}
function Invoke-JhUpdate {
    param([string]$Bundle, [string]$Results)
    $report = [ordered]@{ schema = 1; status = 'NOT_STARTED'; stage = 'bundle'; releaseId = ''; installInvocations = 0; installedVerified = $false; appOpened = $false; networkUpload = $false; keyExport = $false; approvalPerformed = $false; code = '' }
    $exit = 1
    try {
        $manifestFile = Join-Path $Bundle 'release.json'
        $release = Get-Content -LiteralPath $manifestFile -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($release.schema -ne 1 -or $release.packageName -cne 'com.koreanlifehub.bridge' -or $release.versionCode -ne 131 -or $release.minimumInstalledVersionCode -ne 130 -or $release.versionName -cne 'unified-final-checkpoint.57-fix10' -or $release.apkFile -cne 'payload-unsigned.apk') { throw 'RELEASE_MANIFEST_INVALID' }
        $report.releaseId = $release.releaseId
        $unsigned = Join-Path $Bundle 'payload-unsigned.apk'
        if ((Get-JhHash $unsigned) -cne $release.unsignedSha256) { throw 'UNSIGNED_APK_HASH_MISMATCH' }
        Assert-JhPayload $unsigned $release.payloadEntries
        $report.stage = 'tools'; $tools = Get-JhTools
        $id = Get-JhApkIdentity $tools $unsigned
        if ($id.Package -cne $release.packageName -or $id.Code -ne $release.versionCode -or $id.Name -cne $release.versionName) { throw 'CANDIDATE_IDENTITY_MISMATCH' }
        [void](Invoke-JhRequired $tools.Align @('-c','4',$unsigned) 90)
        $report.stage = 'usb'
        Write-Host '[1/4] Keep one phone unlocked. Allow Android USB debugging only if prompted for this PC.' -ForegroundColor Cyan
        $serial = Get-JhSingleDevice $tools.Adb 120
        $report.stage = 'installed_identity'
        $before = Get-JhInstalled $tools $serial $release.packageName $Results 'before'
        $payloadMatches = $false
        if ($before.Identity.Code -eq $release.versionCode) {
            try { Assert-JhPayload $before.Apk $release.payloadEntries; $payloadMatches = $true } catch {}
        }
        $decision = Get-JhUpdateDecision $before.Identity $release $payloadMatches
        if ($decision -eq 'ALREADY_INSTALLED') {
            $report.status = 'ALREADY_INSTALLED_VERIFIED'; $report.installedVerified = $true
            $report.stage = 'complete'; $report.appOpened = Open-JhApp $tools $serial $release.packageName; $exit = 0
        } else {
            $report.stage = 'signing'
            Write-Host '[2/4] Using the original PC signing key locally. No rebuild, key generation or upload.' -ForegroundColor Cyan
            $key = Join-Path $env:USERPROFILE '.android\debug.keystore'
            if (!(Test-Path -LiteralPath $key -PathType Leaf)) { throw 'ORIGINAL_SIGNING_KEY_MISSING' }
            $signed = Join-Path $Results 'JH-FIX10-signed.apk'
            [void](Invoke-JhRequired $tools.Java @('-jar',$tools.Signer,'sign','--ks',$key,'--ks-key-alias','androiddebugkey','--ks-pass','pass:android','--key-pass','pass:android','--v1-signing-enabled','true','--v2-signing-enabled','true','--v3-signing-enabled','true','--v4-signing-enabled','false','--out',$signed,$unsigned) 120)
            Assert-JhPayload $signed $release.payloadEntries
            $signedCert = Get-JhApkCertificate $tools $signed
            if ($signedCert -cne $before.Certificate) { throw 'ORIGINAL_SIGNING_CERTIFICATE_MISMATCH' }
            [void](Invoke-JhRequired $tools.Align @('-c','4',$signed) 90)
            $signedHash = Get-JhHash $signed
            $report.stage = 'precommit'
            if ((Get-JhSingleDevice $tools.Adb 0) -cne $serial) { throw 'PHONE_CHANGED_BEFORE_INSTALL' }
            $recheck = Get-JhInstalled $tools $serial $release.packageName $Results 'precommit'
            if ($recheck.Hash -cne $before.Hash -or $recheck.Certificate -cne $before.Certificate) { throw 'APP_CHANGED_BEFORE_INSTALL' }
            if ((Get-JhHash $signed) -cne $signedHash) { throw 'SIGNED_APK_CHANGED' }
            $report.stage = 'install'; $report.installInvocations = 1
            Write-Host '[3/4] Updating once. Existing app data is not cleared.' -ForegroundColor Cyan
            $accepted = $false
            try { $result = Invoke-JhInstallOnce $tools $serial $signed; $accepted = ($result.Code -eq 0 -and $result.Out -match '(?m)^Success\s*$') } catch { $report.code = 'INSTALL_RESPONSE_UNCERTAIN' }
            $report.stage = 'postcheck'
            Write-Host '[4/4] Reading back the installed APK and checking exact bytes and certificate.' -ForegroundColor Cyan
            if ((Get-JhSingleDevice $tools.Adb 0) -cne $serial) { throw 'PHONE_CHANGED_AFTER_INSTALL' }
            $after = Get-JhInstalled $tools $serial $release.packageName $Results 'after'
            if ($after.Hash -cne $signedHash -or $after.Certificate -cne $signedCert -or $after.Identity.Code -ne $release.versionCode -or $after.Identity.Name -cne $release.versionName) { throw 'POST_INSTALL_NOT_VERIFIED' }
            Assert-JhPayload $after.Apk $release.payloadEntries
            $report.installedVerified = $true
            $report.status = if ($accepted) { 'INSTALLED_VERIFIED' } else { 'INSTALLED_VERIFIED_AFTER_UNCERTAIN_RESPONSE' }
            $report.code = ''; $report.stage = 'complete'; $report.appOpened = Open-JhApp $tools $serial $release.packageName; $exit = 0
        }
    } catch {
        $report.status = if ($report.installInvocations -eq 0) { 'STOPPED_BEFORE_INSTALL' } else { 'INSTALL_RESULT_UNVERIFIED_NO_RETRY' }
        # Avoid exporting arbitrary native output, paths or credentials in the report.
        $msg = $_.Exception.Message
        $report.code = if ($msg -cmatch '^[A-Z][A-Z0-9_]{2,100}$') { $msg } else { 'LOCAL_STEP_FAILED' }
    }
    $report['recordedUtc'] = [DateTime]::UtcNow.ToString('o')
    $report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $Results 'result.json') -Encoding UTF8
    if ($exit -eq 0) {
        Write-Host ('[SUCCESS] ' + $report.status + ' - FIX10 / 131') -ForegroundColor Green
        Write-Host 'Installation is verified. Secure Bridge approval and actual CLICK/TYPE behavior are not certified by this installer.'
    } else {
        Write-Host ('[STOP] ' + $report.code + ' (stage: ' + $report.stage + ')') -ForegroundColor Red
        Write-Host 'No automatic install retry, uninstall, data clear or permission change was performed.'
    }
    return $exit
}
