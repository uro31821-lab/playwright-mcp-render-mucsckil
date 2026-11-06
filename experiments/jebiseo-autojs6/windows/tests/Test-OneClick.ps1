param([string]$KitRoot = (Split-Path -Parent $PSScriptRoot))
Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
$KitRoot = [IO.Path]::GetFullPath($KitRoot)
$work = Join-Path ([IO.Path]::GetTempPath()) ('jebiseo-unit-' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($work) | Out-Null
$previousLocal = $env:LOCALAPPDATA
$previousTemp = $env:TEMP
$previousTmp = $env:TMP
$env:LOCALAPPDATA = Join-Path $work 'local'
$env:TEMP = Join-Path $work 'temp'
$env:TMP = $env:TEMP
[IO.Directory]::CreateDirectory($env:TEMP) | Out-Null
$script:passed = 0
$script:caseNames = [Collections.Generic.List[string]]::new()
function Assert-JebTest([bool]$Condition, [string]$Name) {
    if (!$Condition) { throw ('TEST_FAILED: ' + $Name) }
    $script:passed++
    $script:caseNames.Add($Name)
}
function Assert-JebThrows([scriptblock]$Body, [string]$Expected, [string]$Name) {
    $actual = ''
    try { & $Body | Out-Null } catch { $actual = $_.Exception.Message }
    Assert-JebTest ($actual -ceq $Expected) $Name
}
try {
    foreach ($name in @('RUN.ps1', 'Confirm-Result.ps1')) {
        $tokens = $null; $errors = $null
        [Management.Automation.Language.Parser]::ParseFile((Join-Path $KitRoot $name), [ref]$tokens, [ref]$errors) | Out-Null
        Assert-JebTest (@($errors).Count -eq 0) ('parse_' + $name)
        $bytes = [IO.File]::ReadAllBytes((Join-Path $KitRoot $name))
        Assert-JebTest ($bytes.Length -gt 3 -and $bytes[0] -eq 239 -and $bytes[1] -eq 187 -and $bytes[2] -eq 191) ('utf8_bom_' + $name)
    }
    . (Join-Path $KitRoot 'RUN.ps1')
    $global:LASTEXITCODE = 0
    $missing = Invoke-JebProcess (Join-Path $work 'missing.exe') @('anything') 1000
    Assert-JebTest ($missing.ExitCode -eq -9001) 'native_launch_error_never_reuses_stale_zero'

    $probe = Join-Path $work 'process probe & 100%.exe'
    Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Threading;
public class JebiseoHarmlessArgumentProbe {
    public static int Main(string[] arguments) {
        if (arguments.Length > 0 && arguments[0] == "sleep") { Thread.Sleep(10000); return 0; }
        for (int i=0; i<arguments.Length; i++) Console.WriteLine(i.ToString() + ":" + Convert.ToBase64String(Encoding.UTF8.GetBytes(arguments[i])));
        return 0;
    }
}
'@ -OutputAssembly $probe -OutputType ConsoleApplication | Out-Null
    $values = @('', 'plain', '한글 space & 100%', 'a"b', 'C:\path with space\', 'slashes\\"quoted')
    $native = Invoke-JebProcess $probe $values 5000
    $expected = @(); for ($i = 0; $i -lt $values.Length; $i++) { $expected += ([string]$i + ':' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($values[$i]))) }
    Assert-JebTest ($native.ExitCode -eq 0 -and $native.Text -ceq ($expected -join [Environment]::NewLine)) 'native_argument_roundtrip_special_paths_quotes_empty'
    $timeout = Invoke-JebProcess $probe @('sleep') 100
    Assert-JebTest ($timeout.TimedOut -and $timeout.ExitCode -eq -9002) 'native_process_timeout_is_bounded'

    $assetRoot = Join-Path $work 'manifest-kit'
    [IO.Directory]::CreateDirectory($assetRoot) | Out-Null
    Write-JebNewText (Join-Path $assetRoot 'RUN.ps1') 'synthetic fixture'
    $fixtureHash = Get-JebSha256 (Join-Path $assetRoot 'RUN.ps1')
    $manifest = [ordered]@{ schema = 'jebiseo.windows.assets.v1'; appId = 'org.autojs.autojs6'; versionName = '6.8.0'; apk = @{ path = 'payload/autojs6.apk'; sha256 = '3a1415cb4f09123b7ed4911dd536280300ac722a97938d89043e48a7340a86fc'; size = 37708838 }; script = @{ path = 'payload/jebiseo-independent-test.js'; sha256 = $fixtureHash; size = 17 }; adb = @{ path = 'tools/platform-tools/adb.exe' }; files = @(@{ path = 'RUN.ps1'; sha256 = $fixtureHash; size = 17 }) }
    # Mutable synthetic manifests are test data only. Production payloads are never generated here.
    function Write-TestManifest { [IO.File]::WriteAllText((Join-Path $assetRoot 'assets.json'), ($manifest | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false)) }
    Write-TestManifest
    Assert-JebThrows { Get-JebAssetPath $assetRoot '../outside' } 'UNSAFE_ASSET_PATH' 'manifest_path_traversal_rejected'
    Assert-JebThrows { Get-JebAssetPath $assetRoot 'C:/outside' } 'UNSAFE_ASSET_PATH' 'manifest_absolute_path_rejected'
    Assert-JebThrows { Read-JebAssets $assetRoot } 'REQUIRED_FILE_NOT_HASHED' 'unhashed_required_files_rejected'
    $manifest.files[0].sha256 = ('0' * 64); Write-TestManifest
    Assert-JebThrows { Read-JebAssets $assetRoot } 'DELIVERY_FILE_HASH_MISMATCH' 'tampered_asset_rejected'
    $manifest.files[0].sha256 = $fixtureHash
    $manifest.files = @($manifest.files[0], $manifest.files[0]); Write-TestManifest
    Assert-JebThrows { Read-JebAssets $assetRoot } 'DUPLICATE_MANIFEST_FILE' 'duplicate_manifest_entry_rejected'
    $manifest.apk.sha256 = ('0' * 64); Write-TestManifest
    Assert-JebThrows { Read-JebAssets $assetRoot } 'UNREVIEWED_AUTOJS_APK' 'unreviewed_runtime_apk_rejected'

    $apkPath = Join-Path $work 'synthetic.apk'
    $scriptPath = Join-Path $work 'synthetic.js'
    Write-JebNewText $apkPath 'SYNTHETIC APK NO ANDROID CODE'
    Write-JebNewText $scriptPath 'SYNTHETIC SCRIPT NOT EXECUTABLE'
    $script:testAssets = [pscustomobject]@{ appId = 'org.autojs.autojs6'; versionName = '6.8.0'; apk = [pscustomobject]@{ sha256 = (Get-JebSha256 $apkPath) }; script = [pscustomobject]@{ sha256 = (Get-JebSha256 $scriptPath) }; apkFullPath = $apkPath; scriptFullPath = $scriptPath; adbFullPath = 'NEVER_USED.exe'; fileLocks = @() }
    $script:calls = [Collections.Generic.List[string]]::new()
    $script:mock = @{}
    function Reset-JebMock {
        $script:calls.Clear()
        $script:mock = @{ DeviceText = "List of devices attached`r`nSYNTHETIC_PHONE device usb:1-1"; UsbSerial = 'SYNTHETIC_PHONE'; Installed = 'absent'; InstallUpdates = $true; InstallTimeout = $false; InstallCalls = 0; FenceSeen = $false; Persistent = ''; Accessibility = 'org.autojs.autojs6/org.autojs.autojs.core.accessibility.AccessibilityServiceUsher'; FilesAllowed = $true; OverlayAllowed = $true; ScriptMismatch = $false; LaunchFails = $false; PhoneResults = @(); PhoneIndex = 0; Choice = '' }
    }
    function New-JebMockResult([string]$Text = '', [int]$ExitCode = 0, [bool]$TimedOut = $false) { return [pscustomobject]@{ Text = $Text; ExitCode = $ExitCode; TimedOut = $TimedOut } }
    function Invoke-JebAdb($Assets, [string[]]$Arguments, [int]$TimeoutMs = 30000) {
        $line = $Arguments -join ' '
        $script:calls.Add($line)
        if ($line -ceq 'devices -l') { return New-JebMockResult $script:mock.DeviceText }
        if ($line -ceq '-d get-serialno') { return New-JebMockResult $script:mock.UsbSerial }
        if ($line -match ' shell pm path ') {
            if ($script:mock.Installed -ceq 'absent') { return New-JebMockResult '' 1 }
            if ($script:mock.Installed -ceq 'unsafe') { return New-JebMockResult "package:/data/app/evil';touch /data/local/tmp/no/base.apk" }
            return New-JebMockResult 'package:/data/app/synthetic/base.apk'
        }
        if ($line -match ' shell dumpsys package ') {
            $version = '6.8.0'
            if ($script:mock.Installed -ceq 'old') { $version = '6.7.9' }
            if ($script:mock.Installed -ceq 'newer') { $version = '6.9.0' }
            return New-JebMockResult ("  versionCode=999 minSdk=24`n  versionName=" + $version)
        }
        if ($line -match ' shell sha256sum ') {
            $remote = $Arguments[-1]
            if ($remote -like '/data/app/*') {
                $hash = $script:testAssets.apk.sha256
                if ($script:mock.Installed -cne 'exact') { $hash = 'b' * 64 }
            } elseif ($remote -like '*/launch-request.json') {
                $local = $script:mock.RequestFile
                $hash = Get-JebSha256 $local
            } else {
                $hash = $script:testAssets.script.sha256
                if ($script:mock.ScriptMismatch) { $hash = 'c' * 64 }
            }
            return New-JebMockResult ($hash + '  ' + $remote)
        }
        if ($line -match ' install -r ') {
            $script:mock.InstallCalls++
            $records = @(Get-ChildItem -LiteralPath (Join-Path $script:mock.Persistent 'attempts') -Filter '*.json' -ErrorAction SilentlyContinue)
            $script:mock.FenceSeen = ($records.Count -eq 1)
            if ($script:mock.InstallUpdates) { $script:mock.Installed = 'exact' }
            if ($script:mock.InstallTimeout) { return New-JebMockResult '' -9002 $true }
            return New-JebMockResult 'Success'
        }
        if ($line -match ' shell getprop ro.build.version.sdk$') { return New-JebMockResult '34' }
        if ($line -match ' appops get .* MANAGE_EXTERNAL_STORAGE$') { if ($script:mock.FilesAllowed) { return New-JebMockResult 'MANAGE_EXTERNAL_STORAGE: allow' }; return New-JebMockResult 'No operations.' }
        if ($line -match ' appops get .* SYSTEM_ALERT_WINDOW$') { if ($script:mock.OverlayAllowed) { return New-JebMockResult 'SYSTEM_ALERT_WINDOW: allow' }; return New-JebMockResult 'SYSTEM_ALERT_WINDOW: default' }
        if ($line -match ' settings get secure enabled_accessibility_services$') { return New-JebMockResult $script:mock.Accessibility }
        if ($line -match ' push .* launch-request.json$' -or ($Arguments[-1] -ceq '/sdcard/Download/JebiseoLab/launch-request.json' -and $Arguments[2] -ceq 'push')) { $script:mock.RequestFile = $Arguments[3]; return New-JebMockResult '' }
        if ($line -match ' shell cat ') {
            if ($script:mock.PhoneIndex -lt $script:mock.PhoneResults.Count) { $answer = $script:mock.PhoneResults[$script:mock.PhoneIndex]; $script:mock.PhoneIndex++; return New-JebMockResult $answer }
            return New-JebMockResult '' 1
        }
        if ($line -match ' shell am start -n ') {
            if ($script:mock.LaunchFails) { return New-JebMockResult 'Error: synthetic dispatch uncertainty' 1 }
            return New-JebMockResult 'Starting: Intent'
        }
        if ($line -match ' shell mkdir -p /sdcard/Download/JebiseoLab$' -or $line -match ' push ' -or $line -match ' shell am start -a ') { return New-JebMockResult '' }
        throw ('UNEXPECTED_MOCK_COMMAND: ' + $line)
    }
    function Read-Host { param([string]$Prompt); return $script:mock.Choice }
    function Start-Sleep { param([int]$Milliseconds); }
    Reset-JebMock
    Assert-JebTest ((Get-JebDevice $script:testAssets) -ceq 'SYNTHETIC_PHONE') 'one_authorized_usb_device_selected'
    $script:mock.DeviceText += "`nSYNTHETIC_OTHER device usb:2"
    Assert-JebThrows { Get-JebDevice $script:testAssets } 'MULTIPLE_DEVICES_DISCONNECT_OTHERS' 'multiple_devices_never_auto_selected'
    Reset-JebMock; $script:mock.DeviceText = 'SYNTHETIC_PHONE unauthorized'
    Assert-JebThrows { Get-JebDevice $script:testAssets } 'USB_PHONE_AUTHORIZATION_REQUIRED' 'unauthorized_phone_rejected'
    Reset-JebMock; $script:mock.UsbSerial = 'OTHER'
    Assert-JebThrows { Get-JebDevice $script:testAssets } 'USB_PHONE_IDENTITY_MISMATCH' 'usb_serial_mismatch_rejected'
    Reset-JebMock; $script:mock.Installed = 'unsafe'
    Assert-JebThrows { Get-JebInstalled $script:testAssets 'SYNTHETIC_PHONE' $work } 'INSTALLED_PACKAGE_PATH_UNEXPECTED' 'remote_package_shell_injection_rejected'

    function New-JebRuntimeCase([string]$Name) {
        Reset-JebMock
        $folder = Join-Path $work $Name
        [IO.Directory]::CreateDirectory($folder) | Out-Null
        $script:mock.Persistent = Join-Path $folder 'persistent'
        return [pscustomobject]@{ RunDir = $folder; Persistent = $script:mock.Persistent; State = (New-JebState ([guid]::NewGuid().ToString('N'))) }
    }
    $case = New-JebRuntimeCase 'fresh-install'
    Ensure-JebRuntime $script:testAssets 'SYNTHETIC_PHONE' $case.RunDir $case.Persistent $case.State
    Assert-JebTest ($case.State.apk -ceq 'VERIFIED_INSTALLED' -and $script:mock.InstallCalls -eq 1 -and $script:mock.FenceSeen) 'durable_fence_precedes_one_install_and_hash_readback'
    $case = New-JebRuntimeCase 'already-exact'; $script:mock.Installed = 'exact'
    Ensure-JebRuntime $script:testAssets 'SYNTHETIC_PHONE' $case.RunDir $case.Persistent $case.State
    Assert-JebTest ($case.State.apk -ceq 'VERIFIED_REUSED' -and $script:mock.InstallCalls -eq 0) 'identical_runtime_reused_without_install'
    $case = New-JebRuntimeCase 'newer-blocked'; $script:mock.Installed = 'newer'
    Assert-JebThrows { Ensure-JebRuntime $script:testAssets 'SYNTHETIC_PHONE' $case.RunDir $case.Persistent $case.State } 'NEWER_AUTOJS_ALREADY_INSTALLED' 'newer_version_never_downgraded'
    Assert-JebTest ($script:mock.InstallCalls -eq 0) 'no_install_on_downgrade_block'
    $case = New-JebRuntimeCase 'unknown-install'; $script:mock.InstallUpdates = $false; $script:mock.InstallTimeout = $true
    Assert-JebThrows { Ensure-JebRuntime $script:testAssets 'SYNTHETIC_PHONE' $case.RunDir $case.Persistent $case.State } 'INSTALL_TIMED_OUT_NO_AUTOMATIC_RETRY' 'unknown_install_preserves_fence'
    $secondState = New-JebState ([guid]::NewGuid().ToString('N'))
    Assert-JebThrows { Ensure-JebRuntime $script:testAssets 'SYNTHETIC_PHONE' $case.RunDir $case.Persistent $secondState } 'PRIOR_INSTALL_OUTCOME_UNRESOLVED' 'restart_never_retries_unresolved_install'
    Assert-JebTest ($script:mock.InstallCalls -eq 1 -and $secondState.installAttempts -eq 0 -and $secondState.installMayHaveExecuted) 'attempt_count_distinguishes_prior_uncertainty'
    $script:mock.Installed = 'exact'
    Ensure-JebRuntime $script:testAssets 'SYNTHETIC_PHONE' $case.RunDir $case.Persistent $secondState
    Assert-JebTest ($secondState.apk -ceq 'VERIFIED_REUSED' -and $script:mock.InstallCalls -eq 1) 'later_exact_readback_resolves_without_retry'
    $case = New-JebRuntimeCase 'timeout-but-exact'; $script:mock.InstallTimeout = $true
    Ensure-JebRuntime $script:testAssets 'SYNTHETIC_PHONE' $case.RunDir $case.Persistent $case.State
    Assert-JebTest ($case.State.apk -ceq 'VERIFIED_INSTALLED') 'readback_can_confirm_install_after_adb_timeout'
    $case = New-JebRuntimeCase 'changed-device'; $script:mock.DeviceText = 'OTHER device usb:2'; $script:mock.UsbSerial = 'OTHER'
    Assert-JebThrows { Ensure-JebRuntime $script:testAssets 'SYNTHETIC_PHONE' $case.RunDir $case.Persistent $case.State } 'SELECTED_PHONE_CHANGED' 'device_change_before_dispatch_rejected'
    Assert-JebTest ($script:mock.InstallCalls -eq 0) 'changed_device_has_zero_installs'

    Reset-JebMock
    $permissions = Get-JebPermissionState $script:testAssets 'SYNTHETIC_PHONE'
    Assert-JebTest ($permissions.Files -and $permissions.Overlay -and $permissions.Accessibility) 'exact_current_accessibility_service_recognized'
    $script:mock.Accessibility = 'org.autojs.autojs6/com.stardust.ObsoleteService'
    Assert-JebTest (!(Get-JebPermissionState $script:testAssets 'SYNTHETIC_PHONE').Accessibility) 'stale_accessibility_component_rejected'
    Assert-JebTest (@($script:calls | Where-Object { $_ -match 'settings put|appops set|pm grant|uninstall' }).Count -eq 0) 'permissions_are_only_read_not_granted'
    Reset-JebMock
    foreach ($pair in @(@('', 'probe'), @('1', 'probe'), @('2', 'selection'), @('3', 'more'), @('4', 'handoff'), @('5', 'submit'))) {
        $script:mock.Choice = $pair[0]
        Assert-JebTest ((Read-JebMode) -ceq $pair[1]) ('mode_selection_' + $pair[1] + '_' + $pair[0])
    }
    $script:mock.Choice = '6'
    Assert-JebThrows { Read-JebMode } 'INVALID_MODE_SELECTION' 'invalid_selection_never_launches'
    Reset-JebMock
    $launchId = [guid]::NewGuid().ToString('N')
    $launchDir = Join-Path $work 'launch'; [IO.Directory]::CreateDirectory($launchDir) | Out-Null
    $launchState = New-JebState $launchId
    Send-JebLaunchFiles $script:testAssets 'SYNTHETIC_PHONE' $launchDir $launchId 'more' $launchState
    $request = Get-Content -LiteralPath (Join-Path $launchDir 'launch-request.json') -Raw | ConvertFrom-Json
    Assert-JebTest ($launchState.script -ceq 'VERIFIED' -and $request.schema -ceq 'jebiseo.phone-launch.v1' -and $request.launchId -ceq $launchId -and $request.mode -ceq 'more') 'script_readback_and_launch_request_bind_mode_and_run'
    Reset-JebMock; $script:mock.ScriptMismatch = $true
    Assert-JebThrows { Send-JebLaunchFiles $script:testAssets 'SYNTHETIC_PHONE' $launchDir ([guid]::NewGuid().ToString('N')) 'probe' (New-JebState $launchId) } 'SCRIPT_READBACK_HASH_MISMATCH' 'mismatched_phone_script_never_launches'

    $record = @{ schema = 'jebiseo.phone-result.v1'; launchId = $launchId; mode = 'more'; recordedAt = '2026-11-06T00:00:00Z'; status = 'BLOCKED'; code = 'SYNTHETIC_MENU_NOT_FOUND'; reportText = 'SAFE SYNTHETIC TEST REPORT' }
    $recordText = $record | ConvertTo-Json
    Assert-JebTest ($null -ne (ConvertFrom-JebPhoneResult $recordText $launchId 'more')) 'matching_phone_report_accepted'
    Assert-JebTest ($null -eq (ConvertFrom-JebPhoneResult $recordText ([guid]::NewGuid().ToString('N')) 'more')) 'stale_launch_id_rejected'
    Assert-JebTest ($null -eq (ConvertFrom-JebPhoneResult $recordText $launchId 'submit')) 'different_mode_report_rejected'
    $record.schema = 'wrong'
    Assert-JebTest ($null -eq (ConvertFrom-JebPhoneResult ($record | ConvertTo-Json) $launchId 'more')) 'wrong_phone_schema_rejected'
    $record.schema = 'jebiseo.phone-result.v1'
    Reset-JebMock; $script:mock.PhoneResults = @($recordText)
    $received = Wait-JebPhoneResult $script:testAssets 'SYNTHETIC_PHONE' $launchId 'more' 0
    Assert-JebTest ($received.code -ceq 'SYNTHETIC_MENU_NOT_FOUND') 'phone_result_poll_reads_fixed_path'
    Reset-JebMock; $script:mock.PhoneResults = @($recordText)
    Assert-JebTest ($null -eq (Wait-JebPhoneResult $script:testAssets 'SYNTHETIC_PHONE' ([guid]::NewGuid().ToString('N')) 'more' 0)) 'phone_poll_ignores_old_result_without_deleting_it'
    Reset-JebMock; $script:mock.PhoneResults = @($recordText)
    $launchState = New-JebState $launchId
    Start-JebPhoneTest $script:testAssets 'SYNTHETIC_PHONE' $launchId 'more' $launchState
    Assert-JebTest ($launchState.status -ceq 'PHONE_RESULT_RECEIVED' -and $launchState.phoneStatus -ceq 'BLOCKED' -and $launchState.fullE2e -ceq 'NOT_ASSESSED' -and $launchState.launchAttempts -eq 1) 'phone_blocked_result_is_not_e2e_success'
    $originalWait = ${function:Wait-JebPhoneResult}
    function Wait-JebPhoneResult { param($Assets, $Serial, $RunId, $Mode, $TimeoutSeconds = 600); return $null }
    Reset-JebMock; $launchState = New-JebState $launchId
    Assert-JebThrows { Start-JebPhoneTest $script:testAssets 'SYNTHETIC_PHONE' $launchId 'probe' $launchState } 'PHONE_RESULT_NOT_RECEIVED_NO_AUTOMATIC_RETRY' 'am_start_success_alone_is_not_phone_success'
    Assert-JebTest ($launchState.phoneTest -ceq 'NOT_CONFIRMED' -and @($script:calls | Where-Object { $_ -match 'shell am start -n' }).Count -eq 1) 'launch_dispatched_at_most_once'
    Set-Item -Path Function:Wait-JebPhoneResult -Value $originalWait

    $resultId = [guid]::NewGuid().ToString('N')
    $resultState = New-JebState $resultId
    $resultDirectory = Join-Path $work 'results'
    $handoff = Join-Path $work 'current-handoff.json'
    $saved = Save-JebResult $work $resultDirectory $resultId $handoff $resultState
    Assert-JebTest $saved 'new_result_and_current_handoff_saved'
    $powershell = Join-Path $PSHOME 'powershell.exe'
    $verifier = Join-Path $KitRoot 'Confirm-Result.ps1'
    $verified = Invoke-JebProcess $powershell @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $verifier, '-RunId', $resultId, '-Handoff', $handoff) 15000
    Assert-JebTest ($verified.ExitCode -eq 0) 'actual_result_verifier_accepts_current_identity'
    $stale = Invoke-JebProcess $powershell @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $verifier, '-RunId', ([guid]::NewGuid().ToString('N')), '-Handoff', $handoff) 15000
    Assert-JebTest ($stale.ExitCode -eq 1) 'actual_result_verifier_rejects_stale_run'
    [IO.File]::AppendAllText($resultState.resultPath, 'tamper')
    $tampered = Invoke-JebProcess $powershell @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $verifier, '-RunId', $resultId, '-Handoff', $handoff) 15000
    Assert-JebTest ($tampered.ExitCode -eq 1) 'actual_result_verifier_rejects_changed_report'
    $oldText = [IO.File]::ReadAllText($resultState.resultPath)
    $replacement = New-JebState $resultId
    $savedAgain = Save-JebResult $work $resultDirectory $resultId (Join-Path $work 'new-handoff.json') $replacement
    Assert-JebTest ($savedAgain -and [IO.File]::ReadAllText((Join-Path $resultDirectory 'RESULT.txt')) -ceq $oldText -and $replacement.resultPath -cne (Join-Path $resultDirectory 'RESULT.txt')) 'existing_result_preserved_and_fallback_used'
    $pointerFailureId = [guid]::NewGuid().ToString('N')
    $pointerFailureState = New-JebState $pointerFailureId
    $existingPointer = Join-Path $work 'existing-pointer.json'; Write-JebNewText $existingPointer 'KEEP'
    $pointerSaved = Save-JebResult $work (Join-Path $work 'pointer-failed') $pointerFailureId $existingPointer $pointerFailureState
    Assert-JebTest (!$pointerSaved -and (Test-Path -LiteralPath $pointerFailureState.resultPath) -and [IO.File]::ReadAllText($existingPointer) -ceq 'KEEP') 'handoff_failure_keeps_saved_report_and_prior_pointer'
    $originalWrite = ${function:Write-JebNewText}
    function Write-JebNewText { param($Path, $Value); throw 'SYNTHETIC_WRITE_FAILURE' }
    $failedSave = Save-JebResult $work '' ([guid]::NewGuid().ToString('N')) (Join-Path $work 'never.json') (New-JebState ([guid]::NewGuid().ToString('N')))
    Assert-JebTest (!$failedSave) 'all_result_writes_fail_explicitly'
    Set-Item -Path Function:Write-JebNewText -Value $originalWrite

    Reset-JebMock
    $preflight = Invoke-JebOneClick $assetRoot ([guid]::NewGuid().ToString('N')) (Join-Path $work 'preflight-handoff.json')
    Assert-JebTest ($preflight.State.error -ceq 'UNREVIEWED_AUTOJS_APK' -and $script:calls.Count -eq 0) 'failed_manifest_prevents_all_adb_calls'
    $originalRead = ${function:Read-JebAssets}
    function Read-JebAssets { param($Root); return $script:testAssets }
    $lockRoot = Join-Path $work 'locked-kit'; [IO.Directory]::CreateDirectory($lockRoot) | Out-Null
    $held = [IO.File]::Open((Join-Path $lockRoot 'runner.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    try {
        Reset-JebMock
        $locked = Invoke-JebOneClick $lockRoot ([guid]::NewGuid().ToString('N')) (Join-Path $work 'locked-handoff.json')
        Assert-JebTest ($locked.State.error -ceq 'DELIVERY_FOLDER_LOCK_UNAVAILABLE' -and $script:calls.Count -eq 0) 'same_folder_lock_blocks_concurrent_run_before_adb'
    } finally { $held.Dispose() }
    Set-Item -Path Function:Read-JebAssets -Value $originalRead

    [pscustomobject]@{ schema = 'jebiseo.windows.synthetic-tests.v1'; passed = $script:passed; cases = $script:caseNames.ToArray(); realAdb = 0; realPhone = 0; realInstall = 0; realAndroidScript = 0; realPowerShellProcess = $true; fullE2e = 'NOT_RUN' } | ConvertTo-Json -Depth 5
} finally {
    $env:LOCALAPPDATA = $previousLocal
    $env:TEMP = $previousTemp
    $env:TMP = $previousTmp
    if (Test-Path -LiteralPath $work) { Remove-Item -LiteralPath $work -Recurse -Force }
}
