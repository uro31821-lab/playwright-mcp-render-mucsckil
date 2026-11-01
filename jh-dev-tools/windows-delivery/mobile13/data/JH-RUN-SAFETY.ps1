# Shared file/result safety only. No build, signing, device or network commands.
function Get-JhRunId([string]$RequestedId) {
    if([string]::IsNullOrEmpty($RequestedId)){return [guid]::NewGuid().ToString('N')}
    if($RequestedId -cnotmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$'){throw 'INVALID_RUN_ID'}
    return $RequestedId
}

function Enter-JhRunLock([string]$Kit,[string]$RunId,[IO.FileStream]$ParentLock=$null) {
    $id=Get-JhRunId $RunId
    $lockPath=Join-Path ([IO.Path]::GetFullPath($Kit)) '.JH-FIX16-RUN.lock'
    if($null -ne $ParentLock){
        try {
            if(!$ParentLock.CanRead -or !$ParentLock.CanWrite -or
               ![string]::Equals([IO.Path]::GetFullPath($ParentLock.Name),$lockPath,[StringComparison]::OrdinalIgnoreCase)){
                throw 'INVALID_PARENT_RUN_LOCK'
            }
            $position=$ParentLock.Position
            $ParentLock.Position=0
            $reader=[IO.StreamReader]::new($ParentLock,[Text.Encoding]::UTF8,$true,1024,$true)
            try {$recorded=$reader.ReadLine()} finally {$reader.Dispose();$ParentLock.Position=$position}
            if($recorded -cne ('RUN_ID: '+$id)){throw 'PARENT_RUN_LOCK_ID_MISMATCH'}
        } catch {throw 'INVALID_PARENT_RUN_LOCK'}
        return $ParentLock
    }
    $stream=$null
    try {
        $stream=[IO.File]::Open($lockPath,[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
        $data=([Text.UTF8Encoding]::new($false)).GetBytes('RUN_ID: '+$id+"`n")
        $stream.SetLength(0)
        $stream.Write($data,0,$data.Length)
        $stream.Flush()
        return $stream
    } catch {
        if($null -ne $stream){$stream.Dispose()}
        throw 'RUN_LOCK_UNAVAILABLE_NO_PARALLEL_EXECUTION'
    }
}

function Exit-JhRunLock([IO.FileStream]$Lock,[bool]$Owned) {
    # Keep the lock file. Deleting it after close could race a new owner.
    if($Owned -and $null -ne $Lock){$Lock.Dispose()}
}

function Get-JhResultPaths([string]$Kit,[string]$RunId) {
    $id=Get-JhRunId $RunId
    $paths=New-Object 'System.Collections.Generic.List[string]'
    $paths.Add((Join-Path ([IO.Path]::GetFullPath($Kit)) 'RESULT.txt'))
    if(![string]::IsNullOrEmpty($env:LOCALAPPDATA)){
        $paths.Add((Join-Path (Join-Path (Join-Path $env:LOCALAPPDATA 'JH16F16\RunResults') $id) 'RESULT.txt'))
    }
    $paths.Add((Join-Path (Join-Path (Join-Path ([IO.Path]::GetTempPath()) 'JH16F16-RunResults') $id) 'RESULT.txt'))
    return @($paths.ToArray() | Select-Object -Unique)
}

function Write-JhResultFile([string]$Path,[string[]]$Lines) {
    $temporary=Join-Path ([IO.Path]::GetDirectoryName($Path)) ('.JH-RESULT.'+[guid]::NewGuid().ToString('N')+'.tmp')
    $stream=$null;$writer=$null;$created=$false
    try {
        $stream=[IO.File]::Open($temporary,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
        $created=$true
        $writer=[IO.StreamWriter]::new($stream,[Text.UTF8Encoding]::new($false))
        foreach($line in $Lines){$writer.WriteLine($line)}
        $writer.Flush();$stream.Flush()
        $writer.Dispose();$writer=$null;$stream=$null
        if([IO.File]::Exists($Path)){[IO.File]::Replace($temporary,$Path,$null)}
        else {[IO.File]::Move($temporary,$Path)}
    } finally {
        if($null -ne $writer){$writer.Dispose()}
        elseif($null -ne $stream){$stream.Dispose()}
        if($created -and [IO.File]::Exists($temporary)){[IO.File]::Delete($temporary)}
    }
}

function Write-JhRunResult([string]$Kit,[string]$RunId,[string]$Kind,[string]$Status,
                           $AttemptCount,[string[]]$Lines,[bool]$AllowPrimary=$true) {
    $id=Get-JhRunId $RunId
    if($Kind -cnotin @('ONECLICK','SIGNER') -or $Status -cnotmatch '^[A-Z0-9_]{1,128}$'){
        throw 'INVALID_RESULT_METADATA'
    }
    if(!(($AttemptCount -is [int] -and $AttemptCount -in @(0,1)) -or
         ($Kind -ceq 'ONECLICK' -and $AttemptCount -is [string] -and $AttemptCount -ceq 'UNKNOWN'))){throw 'INVALID_INSTALL_ATTEMPT_COUNT'}
    if(@($Lines | Where-Object {$_ -match '^(RUN_ID|REPORT_KIND|STATUS|ANDROID_INSTALL_ATTEMPT_COUNT|RESULT_PATH|RESULT_FALLBACK_USED):'}).Count -gt 0){
        throw 'DUPLICATE_RESULT_METADATA'
    }
    $paths=@(Get-JhResultPaths $Kit $id)
    for($index=0;$index -lt $paths.Count;$index++){
        if($index -eq 0 -and !$AllowPrimary){continue}
        $path=$paths[$index]
        try {
            if($index -gt 0){[void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($path))}
            $all=@($Lines)+@(('RUN_ID: '+$id),('REPORT_KIND: '+$Kind),('STATUS: '+$Status),
                ('ANDROID_INSTALL_ATTEMPT_COUNT: '+$AttemptCount),('RESULT_PATH: '+$path),
                ('RESULT_FALLBACK_USED: '+($index -gt 0).ToString().ToUpperInvariant()))
            Write-JhResultFile -Path $path -Lines $all
            Write-Host ('CURRENT RUN RESULT: '+$path) -ForegroundColor Yellow
            return [PSCustomObject]@{Saved=$true;ReportPath=$path;FallbackUsed=($index -gt 0);RunId=$id}
        } catch {
            # A failed optional location must not prevent trying the next one.
            Write-Host ('RESULT_WRITE_LOCATION_UNAVAILABLE: '+$index) -ForegroundColor Yellow
        }
    }
    Write-Host 'RESULT_WRITE_FAILED: no current-run result could be saved. Do not repeat an uncertain device action.' -ForegroundColor Red
    return [PSCustomObject]@{Saved=$false;ReportPath=$null;FallbackUsed=$false;RunId=$id}
}

function Read-JhRunResult([string]$Kit,[string]$RunId,[string]$ReportPath,[string]$Kind='SIGNER') {
    $id=Get-JhRunId $RunId
    if([string]::IsNullOrEmpty($ReportPath) -or $Kind -cnotin @('ONECLICK','SIGNER')){throw 'CURRENT_RUN_RESULT_MISSING'}
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
    $countPattern='^ANDROID_INSTALL_ATTEMPT_COUNT: [01]$'
    if($Kind -ceq 'ONECLICK'){$countPattern='^ANDROID_INSTALL_ATTEMPT_COUNT: (?:[01]|UNKNOWN)$'}
    if($ids.Count -ne 1 -or $ids[0] -cne ('RUN_ID: '+$id) -or
       $kinds.Count -ne 1 -or $kinds[0] -cne ('REPORT_KIND: '+$Kind) -or
       $statuses.Count -ne 1 -or $statuses[0] -cnotmatch '^STATUS: [A-Z0-9_]{1,128}$' -or
       $counts.Count -ne 1 -or $counts[0] -cnotmatch $countPattern){
        throw 'CURRENT_RUN_RESULT_IDENTITY_OR_COUNT_INVALID'
    }
    $body=@($lines | Where-Object {$_ -notmatch '^(RUN_ID|REPORT_KIND|STATUS|ANDROID_INSTALL_ATTEMPT_COUNT|RESULT_PATH|RESULT_FALLBACK_USED):'})
    $count=$counts[0].Substring(('ANDROID_INSTALL_ATTEMPT_COUNT: ').Length)
    if($count -cne 'UNKNOWN'){$count=[int]$count}
    return [PSCustomObject]@{RunId=$id;ReportPath=$full;Kind=$Kind;Status=$statuses[0].Substring(8);
        AttemptCount=$count;Body=$body}
}
