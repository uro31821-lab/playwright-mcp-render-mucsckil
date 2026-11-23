# Read-only observer. Never invoke signing, adb, the updater, or process termination.
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$ProbeId=[Guid]::NewGuid().ToString('N')
$ProbeRoot=Split-Path -Parent $PSScriptRoot
$ExpectedUnsigned='3e198708012ad2cc49dea6b8d28bf9ca7804a53ad7e0e08e76d4461aa32dcc88'
$ExpectedCertificate='7cc577efe48e865fdbe799b92aa9edf89724631361ae97979f2b8e4a940a288b'
$ExpectedLock='cb930936ff066f3a93e72718bb95d2c101b3fb5fb19d7871194fe22de37e2317'
function SafeRead([string]$Path,[int]$Limit) {
    if($Path -notmatch '^[A-Za-z]:\\' -or $Path.Length -gt 400){throw 'UNSAFE_LOCAL_PATH'}
    $item=Get-Item -LiteralPath $Path -Force -ErrorAction Stop
    if($item.PSIsContainer -or $item.Length -gt $Limit){throw 'INVALID_FILE_SIZE_OR_TYPE'}
    $node=$item
    while($null -ne $node){
        if(($node.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'REPARSE_PATH_REJECTED'}
        $node=if($node -is [IO.FileInfo]){$node.Directory}else{$node.Parent}
    }
    $stream=$null
    try {
        $stream=[IO.FileStream]::new($Path,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::ReadWrite)
        $buffer=New-Object byte[] ($Limit+1);$count=0
        do {$n=$stream.Read($buffer,$count,$buffer.Length-$count);$count+=$n} while($n -gt 0 -and $count -lt $buffer.Length)
        if($count -gt $Limit){throw 'FILE_CHANGED_OR_TOO_LARGE'}
        return ([Text.UTF8Encoding]::new($false,$true)).GetString($buffer,0,$count).TrimStart([char]0xfeff)
    } finally {if($stream){$stream.Dispose()}}
}
function MatchReleaseRoot([string]$Root) {
    try {
        $p=SafeRead (Join-Path $Root 'DELIVERY_PINS.json') 4096 | ConvertFrom-Json
        return ($p.schema -ceq 'JH231_UNSIGNED_RELEASE_PINS_V1' -and $p.package -ceq 'com.koreanlifehub.bridge' -and
            [string]$p.fromVersion -ceq '230' -and [string]$p.toVersion -ceq '231' -and
            $p.unsignedSha256 -ceq $ExpectedUnsigned -and $p.certificateSha256 -ceq $ExpectedCertificate -and $p.sourceLockSha256 -ceq $ExpectedLock)
    } catch {return $false}
}
function ReadProcessSnapshot {
    $session=[Diagnostics.Process]::GetCurrentProcess().SessionId
    $names="Name='powershell.exe' OR Name='cmd.exe' OR Name='java.exe' OR Name='javaw.exe' OR Name='keytool.exe' OR Name='adb.exe' OR Name='aapt.exe' OR Name='aapt2.exe'"
    $metadata=@(Get-CimInstance Win32_Process -Filter ("SessionId="+$session+" AND ("+$names+")") -Property Name,ProcessId,ParentProcessId,CreationDate -OperationTimeoutSec 5 -ErrorAction Stop)
    # Native-tool arguments are never requested. Only known script candidates need path/RunId discrimination.
    $candidateFilter="SessionId="+$session+" AND ((Name='powershell.exe' AND (CommandLine LIKE '%BOOTSTRAP.ps1%' OR CommandLine LIKE '%JH231-UPDATE.ps1%')) OR (Name='cmd.exe' AND CommandLine LIKE '%실행.cmd%'))"
    $candidates=@(Get-CimInstance Win32_Process -Filter $candidateFilter -Property ProcessId,CommandLine -OperationTimeoutSec 5 -ErrorAction Stop)
    $commands=@{};foreach($candidate in $candidates){$commands[[int]$candidate.ProcessId]=[string]$candidate.CommandLine}
    return @($metadata | ForEach-Object {[pscustomobject]@{Name=$_.Name;ProcessId=$_.ProcessId;ParentProcessId=$_.ParentProcessId;CreationDate=$_.CreationDate;CommandLine=if($commands.ContainsKey([int]$_.ProcessId)){$commands[[int]$_.ProcessId]}else{''}}})
}
function FindObservedRoots([object[]]$Processes) {
    $found=New-Object 'System.Collections.Generic.List[object]'
    foreach($p in $Processes){
        if([int]$p.ProcessId -eq $PID){continue}
        $line=[string]$p.CommandLine;$file=$null;$role=$null
        if($p.Name -ieq 'powershell.exe'){
            $m=[regex]::Match($line,'(?i)(?:^|\s)-File\s+(?:"([^"]+)"|(\S+))')
            if($m.Success){$file=if($m.Groups[1].Success){$m.Groups[1].Value}else{$m.Groups[2].Value}}
            if($file -and [IO.Path]::GetFileName((Split-Path -Parent $file)) -ieq 'internal'){
                $base=[IO.Path]::GetFileName($file)
                if($base -ieq 'BOOTSTRAP.ps1'){$role='BOOTSTRAP_PROCESS_PRESENT'}
                if($base -ieq 'JH231-UPDATE.ps1'){$role='UPDATE_PROCESS_PRESENT'}
                $root=Split-Path -Parent (Split-Path -Parent $file)
            }
        } elseif($p.Name -ieq 'cmd.exe'){
            $m=[regex]::Match($line,'(?i)"([A-Za-z]:\\[^"\r\n]+\\실행\.cmd)"')
            if($m.Success){$file=$m.Groups[1].Value;$root=Split-Path -Parent $file;$role='DELIVERY_CMD_PROCESS_PRESENT'}
        }
        if(-not $role -or -not (MatchReleaseRoot $root)){continue}
        $run='NOT_OBSERVED'
        if($role -eq 'UPDATE_PROCESS_PRESENT'){
            $ids=[regex]::Matches($line,'(?i)(?:^|\s)-RunId\s+"?([a-f0-9]{32})"?(?=\s|$)')
            if($ids.Count -eq 1){$run=$ids[0].Groups[1].Value.ToLowerInvariant()}
        }
        $found.Add([pscustomobject]@{Root=$root;Process=$p;Role=$role;RunId=$run})
    }
    return $found.ToArray()
}
function SafeReceipt([string]$Path,[string[]]$CurrentIds) {
    $raw=SafeRead $Path 65536
    $pairs=@{}
    foreach($line in $raw -split '\r?\n'){
        $m=[regex]::Match($line,'^([A-Z_]+): (.*)$')
        if(-not $m.Success){continue}
        $key=$m.Groups[1].Value;$value=$m.Groups[2].Value
        if($key -notin @('REPORT_KIND','RUN_ID','STATUS','STAGE','REASON','UTC','SIGN_ATTEMPT_STARTED','INSTALL_ATTEMPT_STARTED','ADB_INSTALL_COMMAND_DISPATCHED','DEVICE_READBACK')){continue}
        if($pairs.ContainsKey($key)){throw 'DUPLICATE_RECEIPT_FIELD'}
        $pairs[$key]=$value
    }
    if($pairs.REPORT_KIND -notin @('JH231_SIGN_UPDATE_RESULT_V1','JH231_BOOTSTRAP_RESULT_V1') -or
       $pairs.RUN_ID -cnotmatch '^[a-f0-9]{32}$' -or $pairs.STATUS -cnotmatch '^[A-Z0-9_]{1,160}$'){throw 'INVALID_RECEIPT'}
    $safe=[ordered]@{association=if($CurrentIds -contains $pairs.RUN_ID){'OBSERVED_RUN_ID_MATCH'}else{'UNATTRIBUTED_EXISTING_RECEIPT'};runId=$pairs.RUN_ID;kind=$pairs.REPORT_KIND;status=$pairs.STATUS}
    foreach($key in @('STAGE','REASON','DEVICE_READBACK')){if($pairs.ContainsKey($key) -and $pairs[$key] -cmatch '^[A-Z0-9_]{1,160}$'){$safe[$key]=$pairs[$key]}}
    foreach($key in @('SIGN_ATTEMPT_STARTED','INSTALL_ATTEMPT_STARTED','ADB_INSTALL_COMMAND_DISPATCHED')){if($pairs.ContainsKey($key) -and $pairs[$key] -match '^(True|False)$'){$safe[$key]=$pairs[$key]}}
    if($pairs.UTC -match '^\d{4}-\d\d-\d\dT[0-9:.]+(?:Z|[+-]\d\d:\d\d)$'){$safe['utc']=$pairs.UTC}
    return [pscustomobject]$safe
}
function SafeIntent([string]$Path,[string[]]$CurrentIds) {
    $x=SafeRead $Path 4096 | ConvertFrom-Json
    if($x.schema -cne 'JH231_DATA_PRESERVING_INSTALL_INTENT_V1' -or $x.package -cne 'com.koreanlifehub.bridge' -or
       $x.unsigned_apk_sha256 -cne $ExpectedUnsigned -or $x.certificate_sha256 -cne $ExpectedCertificate -or
       [string]$x.from_version -cne '230' -or [string]$x.to_version -cne '231' -or $x.action -cne 'SINGLE_ADB_INSTALL_R' -or
       $x.automatic_replay -isnot [bool] -or $x.automatic_replay -ne $false -or $x.run_id -cnotmatch '^[a-f0-9]{32}$'){throw 'UNRELATED_OR_INVALID_INTENT'}
    return [pscustomobject]@{runId=$x.run_id;association=if($CurrentIds -contains $x.run_id){'OBSERVED_RUN_ID_MATCH'}else{'UNATTRIBUTED_EXISTING_INTENT'};meaning='PRE_DISPATCH_RECORD_ONLY_INSTALL_OUTCOME_UNKNOWN'}
}
function ObserveJh231 {
    $processState='AVAILABLE';$all=@();$roots=@();$processInfo=New-Object 'System.Collections.Generic.List[object]'
    $receipts=New-Object 'System.Collections.Generic.List[object]';$intents=New-Object 'System.Collections.Generic.List[object]'
    $receiptReadErrors=0;$intentReadErrors=0
    Write-Host '[1/3] Reading JH231 process metadata (read only)...'
    try {$all=@(ReadProcessSnapshot);$roots=@(FindObservedRoots $all)}catch{$processState='UNAVAILABLE_CURRENT_STAGE_UNKNOWN'}
    $runIds=@($roots | Where-Object {$_.RunId -match '^[a-f0-9]{32}$'} | ForEach-Object {$_.RunId} | Select-Object -Unique)
    $known=@{}
    foreach($r in $roots){$known[[int]$r.Process.ProcessId]=@{depth=0;role=$r.Role}}
    for($depth=1;$depth -le 8;$depth++){
        foreach($p in $all){
            if(-not $known.ContainsKey([int]$p.ProcessId) -and $known.ContainsKey([int]$p.ParentProcessId) -and $known[[int]$p.ParentProcessId].depth -eq ($depth-1)){
                $known[[int]$p.ProcessId]=@{depth=$depth;role='RELATED_NATIVE_PROCESS_PRESENT'}
            }
        }
    }
    foreach($p in $all){
        if(-not $known.ContainsKey([int]$p.ProcessId)){continue}
        $when='UNAVAILABLE';try{$when=([datetime]$p.CreationDate).ToUniversalTime().ToString('o')}catch{}
        $processInfo.Add([pscustomobject]@{name=[string]$p.Name;processId=[int]$p.ProcessId;parentProcessId=[int]$p.ParentProcessId;startedUtc=$when;treeDepth=$known[[int]$p.ProcessId].depth;presence=$known[[int]$p.ProcessId].role})
    }
    Write-Host '[2/3] Reading existing JH231 result receipts...'
    $dirs=New-Object 'System.Collections.Generic.List[string]'
    foreach($r in @($roots.Root | Select-Object -Unique)){foreach($child in @('runs','bootstrap-runs')){$dirs.Add((Join-Path $r $child))}}
    if($env:LOCALAPPDATA){foreach($child in @('JH\delivery-results','JH\bootstrap-results')){$dirs.Add((Join-Path $env:LOCALAPPDATA $child))}}
    foreach($dir in $dirs){
        try {
            foreach($sub in @(Get-ChildItem -LiteralPath $dir -Directory -ErrorAction Stop | Where-Object {$_.Name -cmatch '^[a-f0-9]{32}$'} | Select-Object -First 40)){
                try{$receipts.Add((SafeReceipt (Join-Path $sub.FullName 'RESULT.txt') $runIds))}catch{$receiptReadErrors++}
            }
        } catch {}
    }
    foreach($id in $runIds){foreach($prefix in @('JH231-result-','JH231-bootstrap-')){
        try{$receipts.Add((SafeReceipt (Join-Path ([IO.Path]::GetTempPath()) ($prefix+$id+'\RESULT.txt')) $runIds))}catch{}
    }}
    Write-Host '[3/3] Reading durable install-intent records (no adb command)...'
    if($env:LOCALAPPDATA){
        try {
            $intentDir=Join-Path $env:LOCALAPPDATA 'JH\install-attempts'
            foreach($f in @(Get-ChildItem -LiteralPath $intentDir -Filter 'JH231-*.json' -File -ErrorAction Stop | Select-Object -First 50)){
                try{$intents.Add((SafeIntent $f.FullName $runIds))}catch{$intentReadErrors++}
            }
        }catch{$intentReadErrors++}
    }
    return [ordered]@{reportKind='JH231_READ_ONLY_DIAGNOSTIC_V1';diagnosticId=$ProbeId;utc=[DateTime]::UtcNow.ToString('o');processQuery=$processState;
        matchedOriginalRoots=@($roots.Root | Select-Object -Unique).Count;observedRunIds=$runIds;processes=$processInfo.ToArray();receipts=$receipts.ToArray();
        installIntents=$intents.ToArray();receiptReadErrors=$receiptReadErrors;intentReadErrors=$intentReadErrors;
        currentStage='NOT_PERSISTED_BY_OLD_RUNNER_UNLESS_MATCHED_RECEIPT';installationOutcome='NOT_INFERRED_FROM_PROCESS_OR_INTENT';
        actions='READ_ONLY_NO_ADB_NO_SIGNING_NO_PROCESS_STOP_NO_REPLAY';commandLinesAndSecrets='NOT_INCLUDED'}
}
function SaveProbe([object]$Report) {
    $name='JH231_STATUS_'+$ProbeId+'.txt';$body=$Report | ConvertTo-Json -Depth 8
    foreach($dir in @($ProbeRoot,[IO.Path]::GetTempPath())){
        $stream=$null
        try {
            $path=Join-Path $dir $name;$bytes=([Text.UTF8Encoding]::new($true)).GetBytes($body+"`r`n")
            $stream=[IO.FileStream]::new($path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
            $stream.Write($bytes,0,$bytes.Length);$stream.Flush($true);$stream.Dispose();$stream=$null
            Write-Host ('RESULT_PATH: '+$path);return $true
        }catch{}finally{if($stream){$stream.Dispose()}}
    }
    Write-Host 'RESULT_WRITE_FAILED';return $false
}
function InvokeReadStatus {
    Write-Host 'JH231 READ-ONLY STATUS: original update is left untouched.'
    try {
        $report=ObserveJh231
        Write-Host ('MATCHED_PROCESSES: '+@($report.processes).Count)
        foreach($p in @($report.processes)){Write-Host ('PROCESS: '+$p.name+' PID='+$p.processId+' START_UTC='+$p.startedUtc+' DEPTH='+$p.treeDepth+' '+$p.presence)}
        Write-Host ('OBSERVED_RUN_IDS: '+@($report.observedRunIds).Count)
        Write-Host ('EXISTING_RECEIPTS: '+@($report.receipts).Count)
        Write-Host ('EXISTING_INSTALL_INTENTS: '+@($report.installIntents).Count)
        Write-Host 'These observations do not prove the installation outcome. Do not run the updater again.'
        if(SaveProbe $report){return 0};return 2
    }catch{Write-Host 'DIAGNOSTIC_READ_FAILED_NO_DEVICE_ACTION';return 2}
}
# READ_STATUS_MAIN_ENTRY
exit (InvokeReadStatus)
