param([switch]$LibraryOnly)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
# Read-only owner observation, NOT camera control, consent or release approval.
# Uses existing ADB only. Raw dumps stay in memory and are never written/uploaded.
$script:Target = 'com.openai.chatgpt'
$script:Known = @('com.openai.chatgpt','com.sec.android.app.camera','com.android.camera2','com.google.android.GoogleCamera','com.android.chrome')
function Assert-Dump([string]$Text) {
    if ([string]::IsNullOrWhiteSpace($Text) -or $Text.Length -gt 8388608) { throw 'DUMP_EMPTY_OR_OVERSIZED' }
    if ($Text -match '(?i)permission denial|permission denied|cannot find service|can.t find service|dump timed out|may be deadlocked') { throw 'DUMP_UNAVAILABLE_NO_ELEVATION' }
}
function Read-Focus([string]$Text) {
    Assert-Dump $Text
    $record = 'ActivityRecord\{(?<token>[a-fA-F0-9]+)\s+u(?<user>\d+)\s+(?<package>[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+)/(?<activity>[A-Za-z0-9_.$]+)\s'
    $found = @([regex]::Matches($Text, '(?m)^\s*(?:topResumedActivity|mTopResumedActivity)\s*[:=]\s*' + $record))
    if ($found.Count -eq 0) { $found = @([regex]::Matches($Text, '(?m)^\s*(?:mResumedActivity|ResumedActivity)\s*[:=]\s*' + $record)) }
    $unique = @($found | ForEach-Object { $_.Value.Trim() } | Select-Object -Unique)
    if ($unique.Count -ne 1) { throw 'FOREGROUND_MISSING_OR_AMBIGUOUS' }
    $m = $found[0]
    $pkg = $m.Groups['package'].Value
    $token = $m.Groups['token'].Value
    $fromGpt = $false; $captureIntent = $false
    # Read launch evidence only inside this EXACT ActivityRecord's history block.
    $headers = @([regex]::Matches($Text, '(?m)^\s*\*\s*Hist #\d+:\s*' + $record))
    $matching = @($headers | Where-Object { $_.Groups['token'].Value -ceq $token })
    if ($matching.Count -eq 1) {
        $h = $matching[0]; $end = $Text.Length
        foreach ($next in $headers) { if ($next.Index -gt $h.Index) { $end = $next.Index; break } }
        $block = $Text.Substring($h.Index, $end-$h.Index)
        $callers = @([regex]::Matches($block, '(?m)^\s*launchedFromUid=\d+\s+launchedFromPackage=(?<p>[A-Za-z0-9_.]+)(?:\s|$)'))
        $intents = @([regex]::Matches($block, '(?m)^\s*Intent\s*\{(?<i>[^\r\n}]*)\}'))
        if ($callers.Count -eq 1) { $fromGpt = $callers[0].Groups['p'].Value -ceq $script:Target }
        if ($intents.Count -eq 1) { $captureIntent = $intents[0].Groups['i'].Value -match '(?:^|\s)act=android\.media\.action\.IMAGE_CAPTURE(?:\s|$)' }
    }
    [pscustomobject]@{ Package=$pkg; Activity=$m.Groups['activity'].Value; Token=$token; User=$m.Groups['user'].Value; FromGpt=$fromGpt; CaptureIntent=$captureIntent }
}
function Read-CameraOwners([string]$Text) {
    Assert-Dump $Text
    # NEVER scan event history: old CONNECT/DISCONNECT records are not current clients.
    $sections = @([regex]::Matches($Text, '(?ms)^\s*Active Camera Clients:\s*\[(?<body>.*?)\]\s*(?:\r?\n|$)'))
    if ($sections.Count -ne 1) { throw 'ACTIVE_CLIENT_FORMAT_UNSUPPORTED' }
    $body = $sections[0].Groups['body'].Value
    if ([string]::IsNullOrWhiteSpace($body)) { return [pscustomobject]@{ Count=0; Package=''; Signature='' } }
    $entries = @([regex]::Matches($body, '(?m)^\s*\(Camera ID:'))
    $names = @([regex]::Matches($body, 'Client Package Name:\s*(?<p>[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+)(?=,|\)|\s|$)'))
    $pids = @([regex]::Matches($body, '\bPID:\s*(?<v>\d+)(?=,|\s|$)'))
    $ids = @([regex]::Matches($body, 'Camera ID:\s*(?<v>[A-Za-z0-9_.:-]+),'))
    if ($entries.Count -ne 1 -or $names.Count -ne 1 -or $pids.Count -ne 1 -or $ids.Count -ne 1) { throw 'CAMERA_CLIENT_MISSING_OR_MULTIPLE' }
    [pscustomobject]@{ Count=1; Package=$names[0].Groups['p'].Value; Signature=($names[0].Groups['p'].Value+'|'+$pids[0].Groups['v'].Value+'|'+$ids[0].Groups['v'].Value) }
}
function Get-RouteReport($FirstFocus,$FirstCamera,$LastFocus,$LastCamera) {
    $route='UNKNOWN'; $reason='NO_ACTIVE_CAMERA'
    $stable = $FirstFocus.Token -ceq $LastFocus.Token -and $FirstFocus.Package -ceq $LastFocus.Package -and $FirstFocus.Activity -ceq $LastFocus.Activity -and $FirstFocus.User -ceq $LastFocus.User -and $FirstCamera.Signature -ceq $LastCamera.Signature -and $FirstCamera.Count -eq $LastCamera.Count
    if (-not $stable) { $reason='OBSERVATION_CHANGED' }
    elseif ($LastCamera.Count -eq 1) {
        if ($LastFocus.Package -cne $LastCamera.Package) { $reason='FOREGROUND_CAMERA_OWNER_MISMATCH' }
        elseif ($LastCamera.Package -ceq $script:Target) { $route='CHATGPT_OWNS_CAMERA_OBSERVED'; $reason='MATCHED_ACTIVE_CLIENT_AND_FOREGROUND' }
        elseif ($LastFocus.FromGpt -and $LastFocus.CaptureIntent -and $FirstFocus.FromGpt -and $FirstFocus.CaptureIntent) { $route='GPT_IMAGE_CAPTURE_DELEGATION_OBSERVED'; $reason='CURRENT_ACTIVITY_CALLER_ACTION_AND_CAMERA_MATCH' }
        else { $route='OTHER_APP_OWNS_CAMERA_CALLER_UNPROVEN'; $reason='DOES_NOT_PROVE_GPT_DELEGATED_CAPTURE' }
    }
    $knownFocus = $script:Known -ccontains $LastFocus.Package
    $knownClient = $script:Known -ccontains $LastCamera.Package
    [ordered]@{
        schema='KABISEO_CAMERA_ROUTE_OBSERVATION_V022'; status=$(if($route -eq 'UNKNOWN'){'BLOCKED'}else{'OBSERVED_NOT_CONTROL_VERIFIED'})
        route=$route; reason=$reason; stableDuringTwoReads=$stable
        focusedPackage=$(if($knownFocus){$LastFocus.Package}else{'OTHER_REDACTED'})
        focusedActivity=$(if($knownFocus){$LastFocus.Activity}else{$null})
        activeClientPackage=$(if($knownClient){$LastCamera.Package}elseif($LastCamera.Count -eq 0){$null}else{'OTHER_REDACTED'})
        launchedFromChatGPT=$LastFocus.FromGpt; imageCaptureIntent=$LastFocus.CaptureIntent
        rawDumpSaved=$false; pixelsRead=$false; textContentSaved=$false; deviceSerialSaved=$false
        cameraSettingsChanged=$false; cameraOpenedByProbe=$false; appInstalled=$false
        automaticControlVerified=$false; restoreVerified=$false; gptCameraReplaced=$false
        limits=@('Two sequential observations are not an atomic device snapshot','Owning camera does not prove control by another app','No inference of CameraX, Camera2 or accessibility controls','Unrecognized manufacturer output is rejected')
    }
}
function Find-ExistingAdb {
    $paths = @()
    foreach ($base in @($env:ANDROID_HOME,$env:ANDROID_SDK_ROOT)) { if ($base) { $paths += (Join-Path $base 'platform-tools\adb.exe') } }
    if ($env:LOCALAPPDATA) { $paths += (Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe') }
    if ($env:USERPROFILE) { $paths += (Join-Path $env:USERPROFILE 'Android\Sdk\platform-tools\adb.exe') }
    $cmd = Get-Command adb.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -ne $cmd) { $paths += $cmd.Source }
    foreach ($p in $paths) { if (Test-Path -LiteralPath $p -PathType Leaf) { return (Get-Item -LiteralPath $p).FullName } }
    throw 'EXISTING_ADB_NOT_FOUND'
}
function Invoke-ReadOnlyAdb([string]$Adb,[string]$Serial,[string]$Operation) {
    $allowed = @{
        devices=@('devices'); activity=@('shell','dumpsys','-t','5','activity','activities')
        camera=@('shell','dumpsys','-t','5','media.camera'); version=@('shell','dumpsys','-t','5','package','com.openai.chatgpt')
    }
    if (-not $allowed.ContainsKey($Operation)) { throw 'OPERATION_NOT_ALLOWED' }
    $arguments = @()
    if ($Operation -ne 'devices') {
        if ($Serial -notmatch '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$') { throw 'SERIAL_INVALID' }
        $arguments += @('-s',$Serial)
    }
    $arguments += $allowed[$Operation]
    $pi = New-Object System.Diagnostics.ProcessStartInfo
    $pi.FileName=$Adb; $pi.Arguments=($arguments -join ' '); $pi.UseShellExecute=$false; $pi.CreateNoWindow=$true
    $pi.RedirectStandardOutput=$true; $pi.RedirectStandardError=$true
    $p = New-Object System.Diagnostics.Process; $p.StartInfo=$pi
    try {
        if (-not $p.Start()) { throw 'ADB_START_FAILED' }
        $stdout=$p.StandardOutput.ReadToEndAsync(); $stderr=$p.StandardError.ReadToEndAsync()
        if (-not $p.WaitForExit(15000)) { $p.Kill(); throw 'ADB_READ_TIMEOUT' }
        $text=$stdout.GetAwaiter().GetResult(); $errorText=$stderr.GetAwaiter().GetResult()
        if ($p.ExitCode -ne 0 -or $text.Length -gt 8388608) { throw 'ADB_READ_FAILED' }
        if ($errorText -match '(?i)unauthorized|offline|permission denied') { throw 'ADB_NOT_AUTHORIZED_NO_REPAIR' }
        return $text
    } finally { $p.Dispose() }
}
function Get-OneSerial([string]$Text) {
    $rows=@($Text -split '\r?\n' | Where-Object { $_.Trim() -and $_ -notmatch '^List of devices attached|^\*' })
    if ($rows.Count -ne 1 -or $rows[0] -notmatch '^([A-Za-z0-9][A-Za-z0-9_.:-]{0,127})\s+device\s*$') { throw 'EXACTLY_ONE_AUTHORIZED_DEVICE_REQUIRED' }
    return $Matches[1]
}
function Save-Report([string]$Root,$Report) {
    $json=$Report | ConvertTo-Json -Depth 6
    $text="카비서 촬영 경로 점검 v0.22`r`n촬영·설정 변경·설치·외부 전송 없음`r`n`r`n"+$json
    $logs=Join-Path $Root 'logs'; [IO.Directory]::CreateDirectory($logs) | Out-Null
    $encoding=New-Object System.Text.UTF8Encoding($true)
    $stamp=[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-ffff')
    [IO.File]::WriteAllText((Join-Path $logs ('RESULT-'+$stamp+'.txt')),$text,$encoding)
    [IO.File]::WriteAllText((Join-Path $Root 'RESULT.txt'),$text,$encoding)
}
function Main {
    $root=Split-Path $PSScriptRoot -Parent; $lock=$null; $report=$null
    try {
        try { $lock=[IO.File]::Open((Join-Path $root '.probe.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None) }
        catch { Write-Host '이미 점검 중입니다. 기존 창에서 계속해 주세요.'; return 3 }
        $adb=Find-ExistingAdb
        $serial=Get-OneSerial (Invoke-ReadOnlyAdb $adb '' 'devices')
        Write-Host '휴대폰 GPT에서 사진 찍기 화면을 열어 주세요. 촬영 버튼은 누르지 마세요.'
        Write-Host '이 점검은 현재 앱과 카메라 사용 앱만 확인합니다. 설정을 바꾸지 않습니다.'
        [void](Read-Host '준비되면 PC에서 Enter')
        Write-Host '현재 촬영 경로 확인 중...'
        $started=[DateTime]::UtcNow
        $f1=Read-Focus (Invoke-ReadOnlyAdb $adb $serial 'activity')
        $c1=Read-CameraOwners (Invoke-ReadOnlyAdb $adb $serial 'camera')
        [Threading.Thread]::Sleep(300)
        $c2=Read-CameraOwners (Invoke-ReadOnlyAdb $adb $serial 'camera')
        $f2=Read-Focus (Invoke-ReadOnlyAdb $adb $serial 'activity')
        $report=Get-RouteReport $f1 $c1 $f2 $c2
        $report['observedAtUtc']=[DateTime]::UtcNow.ToString('o')
        $report['observationDurationMs']=[int]([DateTime]::UtcNow-$started).TotalMilliseconds
        if ($report['observationDurationMs'] -gt 20000) { $report['route']='UNKNOWN'; $report['status']='BLOCKED'; $report['reason']='OBSERVATION_TOO_SLOW' }
        $report['existingAdbSha256']=(Get-FileHash -LiteralPath $adb -Algorithm SHA256).Hash.ToLowerInvariant()
        Save-Report $root $report
        Write-Host ('결과: '+$report['route'])
        Write-Host '같은 폴더의 RESULT.txt만 GPT에 올려 주세요. 원본 진단 로그는 저장하지 않았습니다.'
        return 0
    } catch {
        $code=$_.Exception.Message
        if ($code -notmatch '^[A-Z][A-Z0-9_]{2,100}$') { $code='PROBE_FAILED_NO_RAW_DIAGNOSTICS_EXPORTED' }
        $report=[ordered]@{schema='KABISEO_CAMERA_ROUTE_OBSERVATION_V022';status='BLOCKED';reason=$code;observedAtUtc=[DateTime]::UtcNow.ToString('o');automaticControlVerified=$false;cameraSettingsChanged=$false;rawDumpSaved=$false;appInstalled=$false}
        if ($null -ne $lock) { Save-Report $root $report }
        Write-Host ('점검 중단: '+$code)
        Write-Host '보안 설정을 끄거나 앱을 재설치하지 마세요. RESULT.txt가 있으면 그 파일만 올려 주세요.'
        return 2
    } finally { if ($null -ne $lock) { $lock.Dispose() } }
}
if (-not $LibraryOnly) { exit (Main) }
