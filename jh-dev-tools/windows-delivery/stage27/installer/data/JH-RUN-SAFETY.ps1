# Shared Stage27 file/result/attempt safety. No device or network operations.
# Adapted from the reviewed FIX16 JH-RUN-SAFETY helper at a19eaadd9a7da22029dbd9cb13ed321f427db56c.
function Get-JhRunId([string]$RequestedId) {
    if([string]::IsNullOrWhiteSpace($RequestedId)){return [guid]::NewGuid().ToString('N')}
    if($RequestedId -cnotmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$'){throw 'INVALID_RUN_ID'}
    return $RequestedId
}

function Get-JhOutcomeExitCode([string]$Status) {
    switch -CaseSensitive ($Status) {
        'NEW_PASS' {return 0}
        'REUSED_PASS' {return 0}
        'BLOCKED' {return 3}
        'UNKNOWN' {return 5}
        default {throw 'RESULT_STATUS_NOT_RECOGNIZED'}
    }
}

function Enter-JhRunLock([string]$Kit,[string]$RunId) {
    $id=Get-JhRunId $RunId
    $lockPath=Join-Path ([IO.Path]::GetFullPath($Kit)) '.JH-STAGE27-RUN.lock'
    $stream=$null
    try {
        $stream=[IO.File]::Open($lockPath,[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
        $bytes=([Text.UTF8Encoding]::new($false)).GetBytes('RUN_ID: '+$id+"`n")
        $stream.SetLength(0);$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)
        return $stream
    } catch {
        if($null -ne $stream){$stream.Dispose()}
        throw 'RUN_LOCK_UNAVAILABLE_NO_PARALLEL_EXECUTION'
    }
}

function Exit-JhRunLock([IO.FileStream]$Lock) {
    # Preserve the file: deleting after close could race a subsequent owner.
    if($null -ne $Lock){$Lock.Dispose()}
}

function Move-JhPreviousResult([string]$Kit,[string]$RunId,[IO.FileStream]$Lock) {
    $id=Get-JhRunId $RunId
    $lockPath=Join-Path ([IO.Path]::GetFullPath($Kit)) '.JH-STAGE27-RUN.lock'
    if($null -eq $Lock -or !$Lock.CanWrite -or
       ![string]::Equals([IO.Path]::GetFullPath($Lock.Name),$lockPath,[StringComparison]::OrdinalIgnoreCase)){
        throw 'PREVIOUS_RESULT_ARCHIVE_REQUIRES_RUN_LOCK'
    }
    $previous=Join-Path $Kit 'RESULT.txt'
    if(![IO.File]::Exists($previous)){return $null}
    $directory=Join-Path (Join-Path $Kit 'out\history') $id
    $destination=Join-Path $directory 'RESULT-previous.txt'
    try {
        [void][IO.Directory]::CreateDirectory($directory)
        [IO.File]::Move($previous,$destination)
    }catch{throw 'PREVIOUS_RESULT_ARCHIVE_FAILED_NO_INSTALL'}
    return $destination
}

function Get-JhResultPaths([string]$Kit,[string]$RunId) {
    $id=Get-JhRunId $RunId
    $paths=New-Object 'System.Collections.Generic.List[string]'
    $paths.Add((Join-Path ([IO.Path]::GetFullPath($Kit)) 'RESULT.txt'))
    if(![string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)){
        $paths.Add((Join-Path (Join-Path (Join-Path $env:LOCALAPPDATA 'JH168\Stage27\RunResults') $id) 'RESULT.txt'))
    }
    $paths.Add((Join-Path (Join-Path (Join-Path ([IO.Path]::GetTempPath()) 'JH168-Stage27-RunResults') $id) 'RESULT.txt'))
    return @($paths.ToArray() | Select-Object -Unique)
}

function Write-JhResultFile([string]$Path,[string[]]$Lines) {
    # CreateNew never overwrites an earlier success, even after a competing run.
    $stream=$null;$writer=$null
    try {
        $stream=[IO.File]::Open($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
        $writer=[IO.StreamWriter]::new($stream,[Text.UTF8Encoding]::new($true))
        foreach($line in $Lines){$writer.WriteLine($line)}
        $writer.Flush();$stream.Flush($true)
    } finally {
        if($null -ne $writer){$writer.Dispose()}
        elseif($null -ne $stream){$stream.Dispose()}
    }
}

function Write-JhRunResult([string]$Kit,[string]$RunId,[string]$Kind,[string]$Status,
                           $AttemptCount,[string[]]$Lines,[bool]$AllowPrimary=$true) {
    $id=Get-JhRunId $RunId
    if($Kind -cnotin @('INSTALLER','BOOTSTRAP') -or $Status -cnotmatch '^[A-Z0-9_]{1,128}$'){
        throw 'INVALID_RESULT_METADATA'
    }
    if(!(($AttemptCount -is [int] -and $AttemptCount -in @(0,1)) -or
         ($Kind -ceq 'BOOTSTRAP' -and $AttemptCount -is [string] -and $AttemptCount -ceq 'UNKNOWN'))){
        throw 'INVALID_INSTALL_ATTEMPT_COUNT'
    }
    if(@($Lines | Where-Object {$_ -match '^(RUN_ID|REPORT_KIND|STATUS|ANDROID_INSTALL_ATTEMPT_COUNT|RESULT_PATH|RESULT_FALLBACK_USED|GENERATED_AT_UTC):'}).Count -gt 0){
        throw 'DUPLICATE_RESULT_METADATA'
    }
    $paths=@(Get-JhResultPaths $Kit $id)
    for($index=0;$index -lt $paths.Count;$index++){
        if($index -eq 0 -and !$AllowPrimary){continue}
        $path=$paths[$index]
        try {
            if($index -gt 0){[void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($path))}
            $all=@($Lines)+@(('RUN_ID: '+$id),('REPORT_KIND: '+$Kind),('STATUS: '+$Status),
                ('ANDROID_INSTALL_ATTEMPT_COUNT: '+$AttemptCount),
                ('GENERATED_AT_UTC: '+[DateTime]::UtcNow.ToString('o')),
                ('RESULT_PATH: '+$path),('RESULT_FALLBACK_USED: '+($index -gt 0).ToString().ToUpperInvariant()))
            Write-JhResultFile -Path $path -Lines $all
            $read=Read-JhRunResult -Kit $Kit -RunId $id -ReportPath $path -Kind $Kind
            Write-Host ('RESULT_PATH: '+$path)
            return [PSCustomObject]@{Saved=$true;ReportPath=$path;FallbackUsed=($index -gt 0);RunId=$id;Status=$read.Status}
        } catch {
            Write-Host ('RESULT_WRITE_LOCATION_UNAVAILABLE: '+$index)
        }
    }
    Write-Host 'RESULT_WRITE_FAILED: no current-run report was saved; do not repeat an uncertain installation.'
    return [PSCustomObject]@{Saved=$false;ReportPath=$null;FallbackUsed=$false;RunId=$id;Status=$Status}
}

function Read-JhRunResult([string]$Kit,[string]$RunId,[string]$ReportPath,[string]$Kind='INSTALLER') {
    $id=Get-JhRunId $RunId
    if([string]::IsNullOrEmpty($ReportPath) -or $Kind -cnotin @('INSTALLER','BOOTSTRAP')){throw 'CURRENT_RUN_RESULT_MISSING'}
    $full=[IO.Path]::GetFullPath($ReportPath)
    $allowed=@(Get-JhResultPaths $Kit $id | Where-Object {
        [string]::Equals([IO.Path]::GetFullPath($_),$full,[StringComparison]::OrdinalIgnoreCase)
    })
    if($allowed.Count -ne 1 -or ![IO.File]::Exists($full) -or (Get-Item -LiteralPath $full).Length -gt 1048576){
        throw 'CURRENT_RUN_RESULT_PATH_INVALID'
    }
    $lines=[IO.File]::ReadAllLines($full)
    $ids=@($lines | Where-Object {$_ -match '^RUN_ID: '})
    $kinds=@($lines | Where-Object {$_ -match '^REPORT_KIND: '})
    $statuses=@($lines | Where-Object {$_ -match '^STATUS: '})
    $counts=@($lines | Where-Object {$_ -match '^ANDROID_INSTALL_ATTEMPT_COUNT: '})
    $times=@($lines | Where-Object {$_ -match '^GENERATED_AT_UTC: '})
    $locations=@($lines | Where-Object {$_ -match '^RESULT_PATH: '})
    $countPattern='^ANDROID_INSTALL_ATTEMPT_COUNT: [01]$'
    if($Kind -ceq 'BOOTSTRAP'){$countPattern='^ANDROID_INSTALL_ATTEMPT_COUNT: (?:[01]|UNKNOWN)$'}
    if($ids.Count -ne 1 -or $ids[0] -cne ('RUN_ID: '+$id) -or
       $kinds.Count -ne 1 -or $kinds[0] -cne ('REPORT_KIND: '+$Kind) -or
       $statuses.Count -ne 1 -or $statuses[0] -cnotmatch '^STATUS: [A-Z0-9_]{1,128}$' -or
       $counts.Count -ne 1 -or $counts[0] -cnotmatch $countPattern -or
       $times.Count -ne 1 -or $times[0] -cnotmatch '^GENERATED_AT_UTC: \d{4}-\d{2}-\d{2}T' -or
       $locations.Count -ne 1 -or $locations[0] -cne ('RESULT_PATH: '+$full)){
        throw 'CURRENT_RUN_RESULT_IDENTITY_OR_COUNT_INVALID'
    }
    $count=$counts[0].Substring(('ANDROID_INSTALL_ATTEMPT_COUNT: ').Length)
    if($count -cne 'UNKNOWN'){$count=[int]$count}
    return [PSCustomObject]@{RunId=$id;ReportPath=$full;Kind=$Kind;Status=$statuses[0].Substring(8);AttemptCount=$count;Lines=$lines}
}

function Get-JhInstallAttemptPath([string]$CandidateSha,[string]$DeviceSerial) {
    if($CandidateSha -cnotmatch '^[0-9a-f]{64}$' -or [string]::IsNullOrWhiteSpace($DeviceSerial)){
        throw 'ATTEMPT_IDENTITY_INVALID'
    }
    if([string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)){throw 'PERSISTENT_ATTEMPT_STORE_UNAVAILABLE'}
    $hasher=[Security.Cryptography.SHA256]::Create()
    try {$deviceHash=([BitConverter]::ToString($hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($DeviceSerial)))).Replace('-','').ToLowerInvariant()}
    finally {$hasher.Dispose()}
    return Join-Path (Join-Path (Join-Path $env:LOCALAPPDATA 'JH168\InstallAttempts') $CandidateSha) ($deviceHash+'.json')
}

function New-JhInstallAttempt([string]$CandidateSha,[string]$DeviceSerial,[string]$CertificateSha,[string]$RunId) {
    $id=Get-JhRunId $RunId
    $path=Get-JhInstallAttemptPath $CandidateSha $DeviceSerial
    if(Test-Path -LiteralPath $path){throw 'PRIOR_INSTALL_ATTEMPT_RECORDED_NO_AUTOMATIC_RETRY'}
    [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($path))
    $record=[ordered]@{schema='JH168_STAGE27_ONESHOT_RECEIPT_V1';run_id=$id;candidate_sha256=$CandidateSha;
        expected_certificate_sha256=$CertificateSha;device_serial_hash=[IO.Path]::GetFileNameWithoutExtension($path);
        recorded_before_dispatch_utc=[DateTime]::UtcNow.ToString('o');execution_result='PENDING_UNKNOWN_NO_REPLAY'}
    $bytes=([Text.UTF8Encoding]::new($false)).GetBytes(($record|ConvertTo-Json -Depth 4))
    $stream=$null
    try {
        $stream=[IO.File]::Open($path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
        $stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)
    } catch {throw 'PERSISTENT_INSTALL_ATTEMPT_NOT_CREATED_NO_INSTALL'}
    finally {if($null -ne $stream){$stream.Dispose()}}
    if(![IO.File]::Exists($path) -or (Get-Item -LiteralPath $path).Length -ne $bytes.Length){throw 'PERSISTENT_INSTALL_ATTEMPT_UNCONFIRMED_NO_INSTALL'}
    return $path
}
