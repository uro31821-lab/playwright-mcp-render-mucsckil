param([string]$ScriptPath = "$PSScriptRoot\package\data\probe.ps1")
$ErrorActionPreference='Stop'
. $ScriptPath -LibraryOnly
$count=0
function Check([bool]$Ok,[string]$Name) { if(-not $Ok){throw ('TEST_FAILED_'+$Name)}; $script:count++; Write-Host ('PASS '+$Name) }
function Denied([scriptblock]$Code,[string]$Name) { $caught=$false; try{ & $Code | Out-Null }catch{$caught=$true}; Check $caught $Name }
function FocusText([string]$Pkg='com.openai.chatgpt',[string]$Token='abc123',[bool]$Caller=$false) {
    $extra=if($Caller){"    launchedFromUid=10100 launchedFromPackage=com.openai.chatgpt launchedFromFeature=null`n    Intent { act=android.media.action.IMAGE_CAPTURE dat=content://PRIVATE_DO_NOT_SAVE }"}else{''}
    return "  * Hist #0: ActivityRecord{$Token u0 $Pkg/.MainActivity t25}`n$extra`n  topResumedActivity=ActivityRecord{$Token u0 $Pkg/.MainActivity t25}`n"
}
function CameraText([string]$Pkg='com.openai.chatgpt',[string]$PidValue='123') {
    return "Active Camera Clients:`n[`n(Camera ID: 0, Cost: 100, PID: $PidValue, Client Package Name: $Pkg, Conflicting Client Devices: {})`n]`nAllowed users:`n0`nCamera service events log:`n CONNECT old com.secret.oldcamera`n"
}
$f=Read-Focus (FocusText); $c=Read-CameraOwners (CameraText)
$r=Get-RouteReport $f $c $f $c
Check ($r.route -eq 'CHATGPT_OWNS_CAMERA_OBSERVED' -and -not $r.automaticControlVerified) 'gpt_owner_does_not_grant_control'
$f2=Read-Focus (FocusText 'com.sec.android.app.camera' 'bbb123' $true); $c2=Read-CameraOwners (CameraText 'com.sec.android.app.camera')
Check ((Get-RouteReport $f2 $c2 $f2 $c2).route -eq 'GPT_IMAGE_CAPTURE_DELEGATION_OBSERVED') 'matching_live_caller_and_capture_intent'
$f3=Read-Focus (FocusText 'com.sec.android.app.camera')
Check ((Get-RouteReport $f3 $c2 $f3 $c2).route -eq 'OTHER_APP_OWNS_CAMERA_CALLER_UNPROVEN') 'standalone_camera_not_gpt_delegation'
Check ((Get-RouteReport $f $c $f2 $c2).route -eq 'UNKNOWN') 'changed_window_rejected'
$c3=Read-CameraOwners (CameraText 'com.openai.chatgpt' '456')
Check ((Get-RouteReport $f $c $f $c3).reason -eq 'OBSERVATION_CHANGED') 'changed_camera_client_rejected'
Check ((Get-RouteReport $f $c2 $f $c2).reason -eq 'FOREGROUND_CAMERA_OWNER_MISMATCH') 'split_other_pane_not_assumed'
$empty=Read-CameraOwners "Active Camera Clients:`n[]`nAllowed users:`n0`nCONNECT Camera ID: 0, PID: 123, Client Package Name: com.openai.chatgpt"
Check ($empty.Count -eq 0 -and (Get-RouteReport $f $empty $f $empty).route -eq 'UNKNOWN') 'historical_camera_logs_not_active'
Denied {Read-CameraOwners 'CONNECT Client Package Name: com.openai.chatgpt'} 'no_active_section_no_guess'
Denied {Read-CameraOwners "Active Camera Clients:`n[]`nActive Camera Clients:`n[]"} 'duplicate_active_sections'
Denied {Read-Focus ((FocusText)+(FocusText 'com.sec.android.app.camera' 'bbb123'))} 'multiple_foreground_windows'
Denied {Read-Focus 'Permission Denial: cannot dump activities'} 'no_permission_no_elevation'
Denied {Read-CameraOwners 'CameraService may be deadlocked'} 'deadlock_not_current_proof'
Denied {Read-CameraOwners (CameraText).Replace('Client Package Name:','VendorUnknownField:')} 'manufacturer_format_unknown'
$other=Read-Focus (FocusText 'secret.other.app'); $oc=Read-CameraOwners (CameraText 'secret.other.app')
$sanitized=(Get-RouteReport $other $oc $other $oc)|ConvertTo-Json -Depth 6
Check (-not $sanitized.Contains('secret.other.app')) 'unrelated_package_redacted'
$raw=FocusText 'com.sec.android.app.camera' 'bbb123' $true
Check (-not ((Get-RouteReport (Read-Focus $raw) $c2 (Read-Focus $raw) $c2)|ConvertTo-Json -Depth 6).Contains('PRIVATE_DO_NOT_SAVE')) 'content_uri_not_exported'
Check ((Get-OneSerial "List of devices attached`nABC123`tdevice`n") -eq 'ABC123') 'one_authorized_device'
Denied {Get-OneSerial "List of devices attached`nABC123`tunauthorized`n"} 'unauthorized_not_repaired'
Denied {Get-OneSerial "List of devices attached`nABC123`tdevice`nDEF456`tdevice`n"} 'multiple_devices_not_auto_selected'
Denied {Invoke-ReadOnlyAdb 'does-not-exist.exe' 'ABC123' 'install'} 'write_operation_refused_before_process'
$folder=Join-Path ([IO.Path]::GetTempPath()) ('카비서 점검 '+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($folder)|Out-Null
try {
    Save-Report $folder $r; Save-Report $folder $r
    Check ((Test-Path -LiteralPath (Join-Path $folder 'RESULT.txt')) -and @(Get-ChildItem -LiteralPath (Join-Path $folder 'logs')).Count -eq 2) 'unicode_space_result_and_previous_summary_retained'
} finally {Remove-Item -LiteralPath $folder -Recurse -Force}
Write-Host ('PROBE_TEST_RESULT='+(@{scenarios=$count;physicalDeviceReads=0;cameraControlVerified=$false;scope='PARSER_AND_LOCAL_FILE_FIXTURES_ONLY'}|ConvertTo-Json -Compress))
