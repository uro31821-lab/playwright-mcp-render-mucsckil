param([string]$RunId = ([guid]::NewGuid().ToString('N')), [string]$Handoff = '')

# Windows PowerShell 5.1. Dot-sourcing defines functions only; it never contacts a phone.
Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

function Stop-JebRun([string]$Code) { throw [InvalidOperationException]::new($Code) }
function Get-JebErrorCode($Failure) {
    $message = [string]$Failure.Exception.Message
    if ($message -cmatch '^[A-Z][A-Z0-9_]{2,100}$') { return $message }
    return 'UNEXPECTED_LOCAL_ERROR'
}
function Get-JebSha256([string]$Path) {
    $stream = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
    finally { $algorithm.Dispose(); $stream.Dispose() }
}
function Get-JebTextHash([string]$Value) {
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($algorithm.ComputeHash([Text.Encoding]::UTF8.GetBytes($Value)))).Replace('-', '').ToLowerInvariant() }
    finally { $algorithm.Dispose() }
}
function Write-JebNewText([string]$Path, [string]$Value) {
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($Path)) | Out-Null
    $stream = [IO.File]::Open($Path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try { $bytes = ([Text.UTF8Encoding]::new($false)).GetBytes($Value); $stream.Write($bytes, 0, $bytes.Length); $stream.Flush($true) }
    finally { $stream.Dispose() }
}
function ConvertTo-JebProcessArgument([string]$Value) {
    if ($null -eq $Value -or $Value.IndexOf([char]0) -ge 0 -or $Value -match '[\r\n]') { Stop-JebRun 'INVALID_PROCESS_ARGUMENT' }
    # Microsoft CommandLineToArgvW escaping, including quotes and trailing backslashes.
    $quoted = [regex]::Replace($Value, '(\\*)"', '$1$1\"')
    $quoted = [regex]::Replace($quoted, '(\\+)$', '$1$1')
    return '"' + $quoted + '"'
}
function Invoke-JebProcess([string]$Exe, [string[]]$Arguments, [int]$TimeoutMs = 30000) {
    $process = [Diagnostics.Process]::new()
    try {
        $info = [Diagnostics.ProcessStartInfo]::new()
        $info.FileName = $Exe
        $info.Arguments = (($Arguments | ForEach-Object { ConvertTo-JebProcessArgument $_ }) -join ' ')
        $info.UseShellExecute = $false
        $info.CreateNoWindow = $true
        $info.RedirectStandardOutput = $true
        $info.RedirectStandardError = $true
        $process.StartInfo = $info
        if (!$process.Start()) { return [pscustomobject]@{ ExitCode = -9001; Text = ''; TimedOut = $false } }
        $stdout = $process.StandardOutput.ReadToEndAsync()
        $stderr = $process.StandardError.ReadToEndAsync()
        if (!$process.WaitForExit($TimeoutMs)) {
            try { $process.Kill(); $process.WaitForExit(5000) | Out-Null } catch { }
            return [pscustomobject]@{ ExitCode = -9002; Text = ''; TimedOut = $true }
        }
        # Both redirected streams are drained asynchronously, avoiding pipe deadlock.
        $outText = $stdout.GetAwaiter().GetResult()
        $errText = $stderr.GetAwaiter().GetResult()
        return [pscustomobject]@{ ExitCode = $process.ExitCode; Text = ($outText + "`n" + $errText).Trim(); TimedOut = $false }
    } catch { return [pscustomobject]@{ ExitCode = -9001; Text = ''; TimedOut = $false } }
    finally { $process.Dispose() }
}
function Invoke-JebAdb($Assets, [string[]]$Arguments, [int]$TimeoutMs = 30000) {
    return Invoke-JebProcess $Assets.adbFullPath $Arguments $TimeoutMs
}
function Invoke-JebRequiredAdb($Assets, [string[]]$Arguments, [string]$Code, [int]$TimeoutMs = 30000) {
    $answer = Invoke-JebAdb $Assets $Arguments $TimeoutMs
    if ($answer.ExitCode -ne 0) { Stop-JebRun $Code }
    return [string]$answer.Text
}
function Get-JebAssetPath([string]$Root, [string]$Relative) {
    if ([string]::IsNullOrWhiteSpace($Relative) -or [IO.Path]::IsPathRooted($Relative) -or $Relative -match '[:\\\x00]') { Stop-JebRun 'UNSAFE_ASSET_PATH' }
    foreach ($part in ($Relative -split '/')) { if ($part -eq '' -or $part -eq '.' -or $part -eq '..') { Stop-JebRun 'UNSAFE_ASSET_PATH' } }
    $rootPath = [IO.Path]::GetFullPath($Root).TrimEnd([char[]]'\/')
    $fullPath = [IO.Path]::GetFullPath((Join-Path $rootPath ($Relative.Replace('/', [IO.Path]::DirectorySeparatorChar))))
    if (!$fullPath.StartsWith(($rootPath + [IO.Path]::DirectorySeparatorChar), [StringComparison]::OrdinalIgnoreCase)) { Stop-JebRun 'UNSAFE_ASSET_PATH' }
    $current = $fullPath
    while ($current.Length -ge $rootPath.Length) {
        if (Test-Path -LiteralPath $current) {
            if (((Get-Item -LiteralPath $current -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { Stop-JebRun 'LINKED_ASSET_NOT_ALLOWED' }
        }
        if ($current -ceq $rootPath) { break }
        $current = [IO.Path]::GetDirectoryName($current)
    }
    if (!(Test-Path -LiteralPath $fullPath -PathType Leaf)) { Stop-JebRun 'DELIVERY_NOT_FULLY_EXTRACTED' }
    return $fullPath
}
function Read-JebAssets([string]$Root) {
    $manifest = Get-JebAssetPath $Root 'assets.json'
    if ((Get-Item -LiteralPath $manifest).Length -gt 1048576) { Stop-JebRun 'ASSET_MANIFEST_INVALID' }
    try { $assets = Get-Content -LiteralPath $manifest -Raw -Encoding UTF8 | ConvertFrom-Json }
    catch { Stop-JebRun 'ASSET_MANIFEST_INVALID' }
    if ($assets.schema -cne 'jebiseo.windows.assets.v1' -or $assets.appId -cne 'org.autojs.autojs6' -or $assets.versionName -cne '6.8.0') { Stop-JebRun 'UNREVIEWED_RUNTIME' }
    if ($assets.apk.path -cne 'payload/autojs6.apk' -or $assets.script.path -cne 'payload/jebiseo-independent-test.js' -or $assets.adb.path -cne 'tools/platform-tools/adb.exe') { Stop-JebRun 'UNREVIEWED_PAYLOAD_PATH' }
    if ($assets.apk.sha256 -cne '3a1415cb4f09123b7ed4911dd536280300ac722a97938d89043e48a7340a86fc' -or [long]$assets.apk.size -ne 37708838) { Stop-JebRun 'UNREVIEWED_AUTOJS_APK' }
    $required = @('실행.cmd', 'RUN.ps1', 'Confirm-Result.ps1', 'POWER_SHELL_ERROR_CHECKLIST.txt', 'payload/autojs6.apk', 'payload/jebiseo-independent-test.js', 'tools/platform-tools/adb.exe', 'tools/platform-tools/AdbWinApi.dll', 'tools/platform-tools/AdbWinUsbApi.dll')
    $seen = @{}
    $locks = [Collections.Generic.List[IDisposable]]::new()
    try {
        foreach ($entry in @($assets.files)) {
            $relative = [string]$entry.path
            if ($seen.ContainsKey($relative)) { Stop-JebRun 'DUPLICATE_MANIFEST_FILE' }
            if ([string]$entry.sha256 -cnotmatch '^[a-f0-9]{64}$' -or [long]$entry.size -lt 1) { Stop-JebRun 'ASSET_MANIFEST_INVALID' }
            $filePath = Get-JebAssetPath $Root $relative
            $handle = [IO.File]::Open($filePath, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
            $locks.Add($handle)
            if ($handle.Length -ne [long]$entry.size -or (Get-JebSha256 $filePath) -cne $entry.sha256) { Stop-JebRun 'DELIVERY_FILE_HASH_MISMATCH' }
            $seen[$relative] = $entry
        }
        foreach ($relative in $required) { if (!$seen.ContainsKey($relative)) { Stop-JebRun 'REQUIRED_FILE_NOT_HASHED' } }
        foreach ($payload in @($assets.apk, $assets.script)) {
            if ($seen[$payload.path].sha256 -cne $payload.sha256 -or [long]$seen[$payload.path].size -ne [long]$payload.size) { Stop-JebRun 'PAYLOAD_MANIFEST_MISMATCH' }
        }
        $assets | Add-Member NoteProperty adbFullPath (Get-JebAssetPath $Root $assets.adb.path)
        $assets | Add-Member NoteProperty apkFullPath (Get-JebAssetPath $Root $assets.apk.path)
        $assets | Add-Member NoteProperty scriptFullPath (Get-JebAssetPath $Root $assets.script.path)
        $assets | Add-Member NoteProperty fileLocks $locks
        return $assets
    } catch { foreach ($handle in $locks) { $handle.Dispose() }; throw }
}
function Get-JebDevice($Assets) {
    $output = Invoke-JebRequiredAdb $Assets @('devices', '-l') 'ADB_DEVICE_LIST_FAILED'
    $rows = @($output -split '\r?\n' | Where-Object { $_ -match '^\S+\s+(device|offline|unauthorized|recovery|sideload)(\s|$)' })
    if ($rows.Count -gt 1) { Stop-JebRun 'MULTIPLE_DEVICES_DISCONNECT_OTHERS' }
    if ($rows.Count -eq 0) { Stop-JebRun 'USB_PHONE_NOT_FOUND' }
    if ($rows[0] -notmatch '^\S+\s+device(\s|$)') { Stop-JebRun 'USB_PHONE_AUTHORIZATION_REQUIRED' }
    $serial = ($rows[0] -split '\s+')[0]
    $usb = (Invoke-JebRequiredAdb $Assets @('-d', 'get-serialno') 'ONE_USB_PHONE_REQUIRED').Trim()
    if ($serial -cne $usb -or $serial -match '^emulator-' -or $serial -notmatch '^[A-Za-z0-9_.:-]{1,160}$') { Stop-JebRun 'USB_PHONE_IDENTITY_MISMATCH' }
    return $serial
}
function Wait-JebDevice($Assets, [int]$TimeoutSeconds = 180) {
    $timer = [Diagnostics.Stopwatch]::StartNew()
    $shown = $false
    do {
        try { return Get-JebDevice $Assets }
        catch {
            $code = Get-JebErrorCode $_
            if ($code -cne 'USB_PHONE_NOT_FOUND' -and $code -cne 'USB_PHONE_AUTHORIZATION_REQUIRED') { throw }
            if (!$shown) { Write-Host '휴대폰 한 대를 USB로 연결하고 잠금을 풀어 주세요. USB 디버깅 허용 화면이 나오면 휴대폰에서 허용해 주세요.'; $shown = $true }
        }
        Start-Sleep -Milliseconds 2000
    } while ($timer.Elapsed.TotalSeconds -lt $TimeoutSeconds)
    Stop-JebRun 'USB_PHONE_SETUP_TIMEOUT'
}
function Assert-JebSameDevice($Assets, [string]$Serial) {
    if ((Get-JebDevice $Assets) -cne $Serial) { Stop-JebRun 'SELECTED_PHONE_CHANGED' }
}
function Get-JebRemoteHash($Assets, [string]$Serial, [string]$Remote, [string]$RunDir) {
    if ($Remote -notmatch '^/(?:data/app|sdcard/Download/JebiseoLab)/[A-Za-z0-9_./=+~-]+$' -or $Remote -match '/\.\.?/') { Stop-JebRun 'UNSAFE_REMOTE_PATH' }
    $answer = Invoke-JebAdb $Assets @('-s', $Serial, 'shell', 'sha256sum', $Remote)
    if ($answer.ExitCode -eq 0) {
        $match = [regex]::Match($answer.Text.Trim(), '^([A-Fa-f0-9]{64})\s+\*?([^\r\n]+)$')
        if ($match.Success -and $match.Groups[2].Value.Trim() -ceq $Remote) { return $match.Groups[1].Value.ToLowerInvariant() }
    }
    $copy = Join-Path $RunDir ('readback-' + [guid]::NewGuid().ToString('N') + '.bin')
    if (Test-Path -LiteralPath $copy) { Stop-JebRun 'READBACK_PATH_COLLISION' }
    Invoke-JebRequiredAdb $Assets @('-s', $Serial, 'pull', $Remote, $copy) 'REMOTE_HASH_READBACK_FAILED' 120000 | Out-Null
    if (!(Test-Path -LiteralPath $copy -PathType Leaf)) { Stop-JebRun 'REMOTE_HASH_READBACK_FAILED' }
    return Get-JebSha256 $copy
}
function Get-JebInstalled($Assets, [string]$Serial, [string]$RunDir) {
    $answer = Invoke-JebAdb $Assets @('-s', $Serial, 'shell', 'pm', 'path', 'org.autojs.autojs6')
    if (($answer.ExitCode -eq 0 -or $answer.ExitCode -eq 1) -and [string]::IsNullOrWhiteSpace($answer.Text)) { return [pscustomobject]@{ Installed = $false; Sha256 = ''; VersionName = ''; VersionCode = 0 } }
    if ($answer.ExitCode -ne 0) { Stop-JebRun 'INSTALLED_PACKAGE_QUERY_FAILED' }
    $paths = @($answer.Text -split '\r?\n' | Where-Object { ![string]::IsNullOrWhiteSpace($_) })
    if ($paths.Count -ne 1) { Stop-JebRun 'INSTALLED_PACKAGE_PATH_UNEXPECTED' }
    $pathMatch = [regex]::Match($paths[0], '^package:(/data/app/[A-Za-z0-9_./=+~-]+/base\.apk)\s*$')
    if (!$pathMatch.Success) { Stop-JebRun 'INSTALLED_PACKAGE_PATH_UNEXPECTED' }
    $remote = $pathMatch.Groups[1].Value
    $dump = Invoke-JebRequiredAdb $Assets @('-s', $Serial, 'shell', 'dumpsys', 'package', 'org.autojs.autojs6') 'INSTALLED_VERSION_READ_FAILED'
    $version = [regex]::Match($dump, '(?m)^\s*versionName=([^\r\n]+)')
    $versionCode = [regex]::Match($dump, '(?m)^\s*versionCode=([0-9]+)(?:\s|$)')
    if (!$version.Success -or !$versionCode.Success) { Stop-JebRun 'INSTALLED_VERSION_READ_FAILED' }
    return [pscustomobject]@{ Installed = $true; Sha256 = (Get-JebRemoteHash $Assets $Serial $remote $RunDir); VersionName = $version.Groups[1].Value.Trim(); VersionCode = [long]$versionCode.Groups[1].Value }
}
function Test-JebInstalledExact($Installed, $Assets) {
    return ($Installed.Installed -and $Installed.Sha256 -ceq $Assets.apk.sha256 -and $Installed.VersionName -ceq $Assets.versionName)
}
function Assert-JebNoDowngrade($Installed, $Assets) {
    if (!$Installed.Installed) { return }
    if ($Installed.VersionName -notmatch '^\d+\.\d+\.\d+$') { Stop-JebRun 'UNREVIEWED_INSTALLED_VERSION' }
    if ([version]$Installed.VersionName -gt [version]$Assets.versionName) { Stop-JebRun 'NEWER_AUTOJS_ALREADY_INSTALLED' }
    if ($null -ne $Assets.PSObject.Properties['versionCode'] -and [long]$Installed.VersionCode -gt [long]$Assets.versionCode) { Stop-JebRun 'NEWER_AUTOJS_ALREADY_INSTALLED' }
}
function Ensure-JebRuntime($Assets, [string]$Serial, [string]$RunDir, [string]$Persistent, $State) {
    $installed = Get-JebInstalled $Assets $Serial $RunDir
    if (Test-JebInstalledExact $installed $Assets) { $State.apk = 'VERIFIED_REUSED'; return }
    Assert-JebNoDowngrade $installed $Assets
    $deviceHash = Get-JebTextHash $Serial
    $fenceKey = Get-JebTextHash ('org.autojs.autojs6|' + $deviceHash + '|' + $Assets.apk.sha256)
    $fence = Join-Path $Persistent ('attempts\' + $fenceKey + '.json')
    if (Test-Path -LiteralPath $fence) {
        $State.apk = 'PRIOR_INSTALL_OUTCOME_UNCONFIRMED'
        $State.installMayHaveExecuted = $true
        Stop-JebRun 'PRIOR_INSTALL_OUTCOME_UNRESOLVED'
    }
    Assert-JebSameDevice $Assets $Serial
    if ((Get-JebSha256 $Assets.apkFullPath) -cne $Assets.apk.sha256) { Stop-JebRun 'APK_CHANGED_BEFORE_INSTALL' }
    # Persistent CreateNew + Flush(true) is completed BEFORE a possible phone effect.
    Write-JebNewText $fence (@{ schema = 'jebiseo.install-attempt.v1'; runId = $State.runId; deviceHash = $deviceHash; apkSha256 = $Assets.apk.sha256; state = 'DISPATCH_COMMITTED_READBACK_REQUIRED'; recordedAt = [DateTime]::UtcNow.ToString('o') } | ConvertTo-Json)
    $State.installAttempts = 1
    $State.installMayHaveExecuted = $true
    $State.apk = 'INSTALL_OUTCOME_UNCONFIRMED'
    Write-Host 'AutoJs6를 설치합니다. 휴대폰에 설치 확인이 나오면 확인해 주세요.'
    $install = Invoke-JebAdb $Assets @('-s', $Serial, 'install', '-r', $Assets.apkFullPath) 180000
    # Readback decides the outcome even if adb timed out or returned an error.
    try {
        Assert-JebSameDevice $Assets $Serial
        $after = Get-JebInstalled $Assets $Serial $RunDir
        if (Test-JebInstalledExact $after $Assets) { $State.apk = 'VERIFIED_INSTALLED'; return }
    } catch { }
    if ($install.TimedOut) { Stop-JebRun 'INSTALL_TIMED_OUT_NO_AUTOMATIC_RETRY' }
    Stop-JebRun 'INSTALL_READBACK_NOT_MATCHED_NO_AUTOMATIC_RETRY'
}
function Test-JebAppOpAllowed([string]$Text, [string]$Operation) {
    $operationPattern = [regex]::Escape($Operation)
    # AOSP appops get reports UID overrides separately; they take precedence.
    $uidModes = [regex]::Matches($Text, ('(?m)^\s*Uid mode:\s*' + $operationPattern + ':\s*([A-Za-z_]+)(?=\s|;|$)'))
    if ($uidModes.Count -gt 0) { return ($uidModes.Count -eq 1 -and $uidModes[0].Groups[1].Value -ceq 'allow') }
    $packageModes = [regex]::Matches($Text, ('(?m)^\s*' + $operationPattern + ':\s*([A-Za-z_]+)(?=\s|;|$)'))
    return ($packageModes.Count -eq 1 -and $packageModes[0].Groups[1].Value -ceq 'allow')
}
function Get-JebPermissionState($Assets, [string]$Serial) {
    $sdkText = (Invoke-JebRequiredAdb $Assets @('-s', $Serial, 'shell', 'getprop', 'ro.build.version.sdk') 'ANDROID_VERSION_READ_FAILED').Trim()
    if ($sdkText -notmatch '^\d+$') { Stop-JebRun 'ANDROID_VERSION_READ_FAILED' }
    $sdk = [int]$sdkText
    if ($sdk -ge 30) {
        $files = Invoke-JebAdb $Assets @('-s', $Serial, 'shell', 'cmd', 'appops', 'get', 'org.autojs.autojs6', 'MANAGE_EXTERNAL_STORAGE')
        $fileAllowed = ($files.ExitCode -eq 0 -and (Test-JebAppOpAllowed $files.Text 'MANAGE_EXTERNAL_STORAGE'))
    } else {
        $package = Invoke-JebRequiredAdb $Assets @('-s', $Serial, 'shell', 'dumpsys', 'package', 'org.autojs.autojs6') 'STORAGE_PERMISSION_READ_FAILED'
        $fileAllowed = ($package -match 'android\.permission\.READ_EXTERNAL_STORAGE:\s*granted=true' -and $package -match 'android\.permission\.WRITE_EXTERNAL_STORAGE:\s*granted=true')
    }
    $overlay = Invoke-JebAdb $Assets @('-s', $Serial, 'shell', 'cmd', 'appops', 'get', 'org.autojs.autojs6', 'SYSTEM_ALERT_WINDOW')
    $accessibility = Invoke-JebAdb $Assets @('-s', $Serial, 'shell', 'settings', 'get', 'secure', 'enabled_accessibility_services')
    $accessibilityAllowed = $false
    if ($accessibility.ExitCode -eq 0) {
        foreach ($service in ($accessibility.Text.Trim() -split ':')) {
            if ($service -ceq 'org.autojs.autojs6/org.autojs.autojs.core.accessibility.AccessibilityServiceUsher') { $accessibilityAllowed = $true }
        }
    }
    return [pscustomobject]@{ Files = [bool]$fileAllowed; Overlay = ($overlay.ExitCode -eq 0 -and (Test-JebAppOpAllowed $overlay.Text 'SYSTEM_ALERT_WINDOW')); Accessibility = $accessibilityAllowed; Sdk = $sdk }
}
function Wait-JebPermissions($Assets, [string]$Serial, [int]$TimeoutSeconds = 180) {
    foreach ($permission in @('Files', 'Overlay', 'Accessibility')) {
        $current = Get-JebPermissionState $Assets $Serial
        if ($current.$permission) { continue }
        if ($permission -ceq 'Files') {
            Write-Host '휴대폰에서 AutoJs6의 파일 접근을 허용해 주세요.'
            if ($current.Sdk -ge 30) { $arguments = @('shell', 'am', 'start', '-a', 'android.settings.MANAGE_APP_ALL_FILES_ACCESS_PERMISSION', '-d', 'package:org.autojs.autojs6') }
            else { $arguments = @('shell', 'am', 'start', '-a', 'android.settings.APPLICATION_DETAILS_SETTINGS', '-d', 'package:org.autojs.autojs6') }
        } elseif ($permission -ceq 'Overlay') {
            Write-Host '휴대폰에서 AutoJs6의 다른 앱 위에 표시를 허용해 주세요.'
            $arguments = @('shell', 'am', 'start', '-a', 'android.settings.action.MANAGE_OVERLAY_PERMISSION', '-d', 'package:org.autojs.autojs6')
        } else {
            Write-Host '휴대폰 접근성 → 설치된 앱 → AutoJs6를 켜 주세요. TalkBack 자체를 켤 필요는 없습니다.'
            Write-Host '제한된 설정 안내가 나오면 휴대폰이 안내하는 AutoJs6 앱 정보 화면에서 직접 확인해 주세요.'
            $arguments = @('shell', 'am', 'start', '-a', 'android.settings.ACCESSIBILITY_SETTINGS')
        }
        Assert-JebSameDevice $Assets $Serial
        Invoke-JebAdb $Assets (@('-s', $Serial) + $arguments) | Out-Null
        $timer = [Diagnostics.Stopwatch]::StartNew()
        do {
            Start-Sleep -Milliseconds 2000
            $current = Get-JebPermissionState $Assets $Serial
            if ($current.$permission) { break }
        } while ($timer.Elapsed.TotalSeconds -lt $TimeoutSeconds)
        if (!$current.$permission) { Stop-JebRun ('PERMISSION_' + $permission.ToUpperInvariant() + '_NOT_ENABLED') }
    }
}
function Read-JebMode {
    Write-Host ''
    Write-Host '이번에 시험할 항목을 하나 고르세요.'
    Write-Host '  1. 화면 메뉴 읽기만 (기본값)'
    Write-Host '  2. 원하는 항목 찾기와 선택'
    Write-Host '  3. ... 메뉴만 열고 멈추기'
    Write-Host '  4. Gemini로 보내기 항목 누르기 [외부 전송]'
    Write-Host '  5. Gemini 전송 버튼 누르기 [외부 전송]'
    $choice = (Read-Host '번호 1~5, 또는 Enter=1').Trim()
    if ($choice -ceq '') { $choice = '1' }
    switch ($choice) {
        '1' { return 'probe' }
        '2' { return 'selection' }
        '3' { return 'more' }
        '4' { return 'handoff' }
        '5' { return 'submit' }
        default { Stop-JebRun 'INVALID_MODE_SELECTION' }
    }
}
function Send-JebLaunchFiles($Assets, [string]$Serial, [string]$RunDir, [string]$RunId, [string]$Mode, $State) {
    if ($RunId -cnotmatch '^[0-9a-f]{32}$' -or @('probe', 'selection', 'more', 'handoff', 'submit') -cnotcontains $Mode) { Stop-JebRun 'INVALID_LAUNCH_REQUEST' }
    Assert-JebSameDevice $Assets $Serial
    Invoke-JebRequiredAdb $Assets @('-s', $Serial, 'shell', 'mkdir', '-p', '/sdcard/Download/JebiseoLab') 'PHONE_TEST_FOLDER_FAILED' | Out-Null
    Invoke-JebRequiredAdb $Assets @('-s', $Serial, 'push', $Assets.scriptFullPath, '/sdcard/Download/JebiseoLab/jebiseo-independent-test.js') 'SCRIPT_COPY_FAILED' 120000 | Out-Null
    if ((Get-JebRemoteHash $Assets $Serial '/sdcard/Download/JebiseoLab/jebiseo-independent-test.js' $RunDir) -cne $Assets.script.sha256) { Stop-JebRun 'SCRIPT_READBACK_HASH_MISMATCH' }
    $State.script = 'VERIFIED'
    $request = Join-Path $RunDir 'launch-request.json'
    Write-JebNewText $request (@{ schema = 'jebiseo.phone-launch.v1'; launchId = $RunId; mode = $Mode } | ConvertTo-Json)
    Invoke-JebRequiredAdb $Assets @('-s', $Serial, 'push', $request, '/sdcard/Download/JebiseoLab/launch-request.json') 'LAUNCH_REQUEST_COPY_FAILED' | Out-Null
    if ((Get-JebRemoteHash $Assets $Serial '/sdcard/Download/JebiseoLab/launch-request.json' $RunDir) -cne (Get-JebSha256 $request)) { Stop-JebRun 'LAUNCH_REQUEST_HASH_MISMATCH' }
}
function ConvertFrom-JebPhoneResult([string]$Text, [string]$ExpectedRunId, [string]$ExpectedMode) {
    if ([string]::IsNullOrWhiteSpace($Text) -or $Text.Length -gt 65536) { return $null }
    try {
        $record = $Text | ConvertFrom-Json
        if ($record.schema -cne 'jebiseo.phone-result.v1' -or $record.launchId -cne $ExpectedRunId -or $record.mode -cne $ExpectedMode) { return $null }
        if ([string]$record.status -cnotmatch '^[A-Za-z0-9_.:-]{1,100}$' -or [string]$record.code -cnotmatch '^[A-Za-z0-9_.:-]{1,100}$') { return $null }
        if ($record.reportText -isnot [string] -or $record.reportText.Length -gt 50000) { return $null }
        $recordedAt = [DateTimeOffset]::Parse([string]$record.recordedAt, [Globalization.CultureInfo]::InvariantCulture)
        $safeReport = [regex]::Replace($record.reportText, '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '')
        return [pscustomobject]@{ status = [string]$record.status; code = [string]$record.code; reportText = $safeReport; recordedAt = $recordedAt.ToString('o'); mode = $ExpectedMode }
    } catch { return $null }
}
function Wait-JebPhoneResult($Assets, [string]$Serial, [string]$RunId, [string]$Mode, [int]$TimeoutSeconds = 600) {
    $timer = [Diagnostics.Stopwatch]::StartNew()
    do {
        $answer = Invoke-JebAdb $Assets @('-s', $Serial, 'shell', 'cat', '/sdcard/Download/JebiseoLab/RESULT_PHONE.json') 10000
        if ($answer.ExitCode -eq 0) {
            $record = ConvertFrom-JebPhoneResult $answer.Text $RunId $Mode
            if ($null -ne $record) { return $record }
        }
        Start-Sleep -Milliseconds 2000
    } while ($timer.Elapsed.TotalSeconds -lt $TimeoutSeconds)
    return $null
}
function Start-JebPhoneTest($Assets, [string]$Serial, [string]$RunId, [string]$Mode, $State) {
    Write-Host ''
    Write-Host '휴대폰을 왼쪽 ChatGPT / 오른쪽 Gemini 분할화면으로 맞춰 주세요.'
    Read-Host '준비되면 이 PC 창에서 Enter를 누르세요' | Out-Null
    Assert-JebSameDevice $Assets $Serial
    $permissions = Get-JebPermissionState $Assets $Serial
    if (!$permissions.Files -or !$permissions.Overlay -or !$permissions.Accessibility) { Stop-JebRun 'REQUIRED_PERMISSION_CHANGED' }
    $State.launch = 'REQUESTED'
    $State.launchAttempts = 1
    $State.phoneTest = 'NOT_CONFIRMED'
    $answer = Invoke-JebAdb $Assets @('-s', $Serial, 'shell', 'am', 'start', '-n', 'org.autojs.autojs6/org.autojs.autojs.external.open.RunIntentActivity', '--es', 'path', '/sdcard/Download/JebiseoLab/jebiseo-independent-test.js') 30000
    if ($answer.ExitCode -ne 0 -or $answer.Text -match '(?im)^\s*(Error:|Exception|SecurityException)') { $State.launch = 'OUTCOME_UNCONFIRMED' }
    Write-Host '휴대폰 시험을 시작하도록 요청했습니다. 휴대폰의 안내에 따라 주세요. 결과를 최대 10분 기다립니다.'
    $phone = Wait-JebPhoneResult $Assets $Serial $RunId $Mode
    if ($null -eq $phone) { Stop-JebRun 'PHONE_RESULT_NOT_RECEIVED_NO_AUTOMATIC_RETRY' }
    $State.phoneTest = 'REPORTED'
    $State.phoneStatus = $phone.status
    $State.phoneCode = $phone.code
    $State.phoneReport = $phone.reportText
    $State.phoneRecordedAt = $phone.recordedAt
    $State.status = 'PHONE_RESULT_RECEIVED'
}
function New-JebState([string]$RunId) {
    return [ordered]@{ schema = 'jebiseo.windows.result.v1'; runId = $RunId; startedAt = [DateTime]::UtcNow.ToString('o'); finishedAt = $null; status = 'BLOCKED'; stage = 'INIT'; error = ''; apk = 'NOT_RUN'; script = 'NOT_RUN'; launch = 'NOT_RUN'; phoneTest = 'NOT_RUN'; mode = ''; phoneStatus = ''; phoneCode = ''; phoneReport = ''; phoneRecordedAt = ''; installAttempts = 0; installMayHaveExecuted = $false; launchAttempts = 0; fullE2e = 'NOT_ASSESSED'; resultPath = ''; resultJsonPath = '' }
}
function Format-JebResult($State) {
    $lines = @('제비서 독립 시험 결과', ('RUN_ID=' + $State.runId), ('STATUS=' + $State.status), ('STAGE=' + $State.stage), ('ERROR=' + $State.error), ('APK=' + $State.apk), ('SCRIPT=' + $State.script), ('LAUNCH=' + $State.launch), ('PHONE_TEST=' + $State.phoneTest), ('MODE=' + $State.mode), ('PHONE_STATUS=' + $State.phoneStatus), ('PHONE_CODE=' + $State.phoneCode), ('INSTALL_ATTEMPTS=' + $State.installAttempts), ('INSTALL_MAY_HAVE_EXECUTED=' + $State.installMayHaveExecuted), ('LAUNCH_ATTEMPTS=' + $State.launchAttempts), 'FULL_E2E=NOT_ASSESSED', '', 'APK 설치와 실행 요청만으로 휴대폰 시험 성공을 판정하지 않습니다.', '아래 휴대폰 결과는 위 MODE 한 항목에 대한 보고입니다.')
    if (![string]::IsNullOrWhiteSpace($State.phoneReport)) { $lines += @('', '--- 휴대폰 시험 보고 ---', $State.phoneReport) }
    return ($lines -join "`r`n") + "`r`n"
}
function Save-JebResult([string]$Root, [string]$RunDir, [string]$RunId, [string]$Handoff, $State) {
    $State.finishedAt = [DateTime]::UtcNow.ToString('o')
    $candidates = [Collections.Generic.List[string]]::new()
    if (![string]::IsNullOrWhiteSpace($RunDir)) { $candidates.Add($RunDir) }
    if (![string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) { $candidates.Add((Join-Path $env:LOCALAPPDATA ('JebiseoStandalone\results\' + $RunId))) }
    $candidates.Add((Join-Path ([IO.Path]::GetTempPath()) ('Jebiseo-Result-' + $RunId)))
    foreach ($directory in $candidates) {
        $reportSaved = $false
        try {
            $jsonPath = Join-Path $directory 'RESULT.json'
            $textPath = Join-Path $directory 'RESULT.txt'
            if ((Test-Path -LiteralPath $jsonPath) -or (Test-Path -LiteralPath $textPath)) { continue }
            $State.resultPath = $textPath
            $State.resultJsonPath = $jsonPath
            Write-JebNewText $jsonPath ($State | ConvertTo-Json -Depth 8)
            Write-JebNewText $textPath (Format-JebResult $State)
            $reportSaved = $true
        } catch {
            if (![string]::IsNullOrWhiteSpace($State.resultJsonPath) -and (Test-Path -LiteralPath $State.resultJsonPath -PathType Leaf)) { Write-Host ('PARTIAL_RESULT_FILE=' + $State.resultJsonPath) }
        }
        if ($reportSaved) {
            Write-Host (Format-JebResult $State)
            Write-Host ('결과 파일: ' + $textPath)
            try {
            $pointer = @{ schema = 'jebiseo.windows.handoff.v1'; runId = $RunId; resultJsonPath = $jsonPath; resultPath = $textPath; resultJsonSha256 = (Get-JebSha256 $jsonPath); resultSha256 = (Get-JebSha256 $textPath) }
            Write-JebNewText $Handoff ($pointer | ConvertTo-Json)
            return $true
            } catch {
                Write-Host ('HANDOFF_WRITE_FAILED. RESULT_FILE=' + $textPath)
                return $false
            }
        }
    }
    Write-Host 'RESULT_WRITE_FAILED: 결과 파일을 저장하지 못했습니다. 설치나 실행을 자동으로 다시 시도하지 마세요.'
    return $false
}
function Invoke-JebOneClick([string]$Root, [string]$RunId, [string]$Handoff) {
    $state = New-JebState $RunId
    $assets = $null
    $runDir = ''
    $lock = $null
    $folderLock = $null
    try {
        if ($RunId -cnotmatch '^[0-9a-f]{32}$') { Stop-JebRun 'INVALID_RUN_ID' }
        $Root = [IO.Path]::GetFullPath($Root)
        if ($Root.Length -gt 140) { Stop-JebRun 'EXTRACT_TO_SHORT_PATH_REQUIRED' }
        if (Test-Path -LiteralPath $Handoff) { Stop-JebRun 'CURRENT_HANDOFF_ALREADY_EXISTS' }
        $state.stage = 'VERIFY_DELIVERY'
        $assets = Read-JebAssets $Root
        try { $folderLock = [IO.File]::Open((Join-Path $Root 'runner.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None) }
        catch { Stop-JebRun 'DELIVERY_FOLDER_LOCK_UNAVAILABLE' }
        if ([string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) { Stop-JebRun 'PERSISTENT_STATE_FOLDER_REQUIRED' }
        $persistent = Join-Path $env:LOCALAPPDATA 'JebiseoStandalone'
        [IO.Directory]::CreateDirectory($persistent) | Out-Null
        try { $lock = [IO.File]::Open((Join-Path $persistent 'runner.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None) }
        catch { Stop-JebRun 'ANOTHER_TEST_RUNNER_IS_RUNNING' }
        $runDir = Join-Path $Root ('runs\' + $RunId)
        if (Test-Path -LiteralPath $runDir) { $runDir = ''; Stop-JebRun 'RUN_ID_ALREADY_EXISTS' }
        try { [IO.Directory]::CreateDirectory($runDir) | Out-Null }
        catch {
            $runDir = Join-Path $persistent ('runs\' + $RunId)
            if (Test-Path -LiteralPath $runDir) { $runDir = ''; Stop-JebRun 'RUN_ID_ALREADY_EXISTS' }
            [IO.Directory]::CreateDirectory($runDir) | Out-Null
        }
        Write-Host '제비서 독립 시험을 준비합니다. 기존 JH 앱은 이 설치 대상이 아닙니다.'
        $state.mode = Read-JebMode
        $state.stage = 'CONNECT_USB_PHONE'
        $serial = Wait-JebDevice $assets
        $state.stage = 'VERIFY_AUTOJS_RUNTIME'
        Ensure-JebRuntime $assets $serial $runDir $persistent $state
        $state.stage = 'WAIT_FOR_MANUAL_PERMISSIONS'
        Wait-JebPermissions $assets $serial
        $state.stage = 'COPY_AND_VERIFY_SCRIPT'
        Send-JebLaunchFiles $assets $serial $runDir $RunId $state.mode $state
        $state.stage = 'REQUEST_PHONE_TEST'
        Start-JebPhoneTest $assets $serial $RunId $state.mode $state
        $state.stage = 'PHONE_RESULT_RECEIVED'
    } catch {
        $state.error = Get-JebErrorCode $_
        if ($state.launchAttempts -gt 0 -or ($state.installMayHaveExecuted -and $state.apk -cne 'VERIFIED_INSTALLED')) { $state.status = 'OUTCOME_UNCONFIRMED_NO_AUTOMATIC_RETRY' }
        else { $state.status = 'BLOCKED' }
        Write-Host ('진행을 멈췄습니다: ' + $state.error)
    } finally {
        $saved = Save-JebResult $Root $runDir $RunId $Handoff $state
        if ($null -ne $assets -and $null -ne $assets.PSObject.Properties['fileLocks']) { foreach ($handle in $assets.fileLocks) { $handle.Dispose() } }
        if ($null -ne $lock) { $lock.Dispose() }
        if ($null -ne $folderLock) { $folderLock.Dispose() }
    }
    return [pscustomobject]@{ State = $state; Saved = $saved }
}

if ($MyInvocation.InvocationName -ne '.') {
    if ([string]::IsNullOrWhiteSpace($Handoff)) { $Handoff = Join-Path ([IO.Path]::GetTempPath()) ('Jebiseo-Handoff-' + $RunId + '.json') }
    $answer = Invoke-JebOneClick $PSScriptRoot $RunId $Handoff
    if ($answer.Saved -and $answer.State.status -ceq 'PHONE_RESULT_RECEIVED') { exit 0 }
    exit 2
}
