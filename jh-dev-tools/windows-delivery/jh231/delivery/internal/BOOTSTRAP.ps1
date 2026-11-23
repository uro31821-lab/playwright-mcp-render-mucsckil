# Windows PowerShell 5.1 entry preflight. No key or phone call occurs here.
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$BootRunId=[Guid]::NewGuid().ToString('N')
$BootRoot=Split-Path -Parent $PSScriptRoot
$BootStatus='BLOCKED_NO_RUNNER_DISPATCH'
$BootReason='NOT_STARTED'
$BootDispatched=$false
$BootChildCode='NOT_RUN'
$BootChildResult='NOT_CONFIRMED'
$BootSaved=$false
$BootChecks=New-Object 'System.Collections.Generic.List[string]'
function BootWriteNew([string]$Path,[string]$Text) {
    $stream=$null
    try {
        $stream=[IO.FileStream]::new($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
        $bytes=([Text.UTF8Encoding]::new($false)).GetBytes($Text)
        $stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)
    } finally { if($stream){$stream.Dispose()} }
}
function BootResultDirs {
    $dirs=@((Join-Path $BootRoot ('bootstrap-runs\'+$BootRunId)))
    if($env:LOCALAPPDATA){$dirs+=Join-Path $env:LOCALAPPDATA ('JH\bootstrap-results\'+$BootRunId)}
    $dirs+=Join-Path ([IO.Path]::GetTempPath()) ('JH231-bootstrap-'+$BootRunId)
    return $dirs
}
function SaveBootResult {
    $lines=@('REPORT_KIND: JH231_BOOTSTRAP_RESULT_V1',('RUN_ID: '+$BootRunId),
        ('UTC: '+[DateTime]::UtcNow.ToString('o')),('STATUS: '+$script:BootStatus),
        ('REASON: '+$script:BootReason),('RUNNER_DISPATCHED: '+$script:BootDispatched),
        ('CHILD_EXIT_CODE: '+$script:BootChildCode),('CURRENT_CHILD_RESULT: '+$script:BootChildResult),
        'PHONE_FEATURE_E2E: NOT_RUN','AUTOMATIC_REPLAY: NEVER')+@($script:BootChecks)
    foreach($dir in @(BootResultDirs)){
        try {
            if(-not (Test-Path -LiteralPath $dir -PathType Container)){$null=New-Item -Path $dir -ItemType Directory -Force -ErrorAction Stop}
            $file=Join-Path $dir 'RESULT.txt'
            BootWriteNew $file (($lines -join "`r`n")+"`r`n")
            Write-Host ('BOOTSTRAP_RESULT_PATH: '+$file)
            $script:BootSaved=$true
            return
        } catch {}
    }
    Write-Host 'RESULT_WRITE_FAILED'
}
function AssertBootPreflight {
    if($PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1){throw 'WINDOWS_POWERSHELL_51_REQUIRED'}
    if($BootRoot.Length -gt 140){throw 'EXTRACT_PATH_TOO_LONG_USE_SHORT_LOCAL_PATH'}
    # Reject common Explorer archive staging paths. Full extraction must also pass all required file hashes.
    if($BootRoot -match '(?i)\.zip(?:[\\/]|$)' -or $BootRoot -match '(?i)[\\/]Temp[\\/].*(?:\.zip|Temp[0-9]+_)') {throw 'ARCHIVE_TEMP_EXTRACTION_REJECTED_EXTRACT_ALL'}
    $required=@('실행.cmd','README_FIRST.md','POWER_SHELL_ERROR_CHECKLIST.txt','DELIVERY_PINS.json',
        'internal\BOOTSTRAP.ps1','internal\JH231-UPDATE.ps1','payload\app-release-unsigned.apk','payload\SOURCE_LOCK.json')
    $manifestPath=Join-Path $BootRoot 'PACKAGE_SHA256.json'
    if(-not(Test-Path -LiteralPath $manifestPath -PathType Leaf)){throw 'PACKAGE_MANIFEST_MISSING_EXTRACT_ALL'}
    if((Get-Item -LiteralPath $manifestPath).Length -gt 65536){throw 'PACKAGE_MANIFEST_TOO_LARGE'}
    $manifest=Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach($rel in $required){
        $file=Join-Path $BootRoot $rel
        if(-not(Test-Path -LiteralPath $file -PathType Leaf)){throw 'REQUIRED_DELIVERY_FILE_MISSING_EXTRACT_ALL'}
        $info=Get-Item -LiteralPath $file -Force -ErrorAction Stop
        if(($info.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'DELIVERY_REPARSE_FILE_REJECTED'}
        $key=$rel.Replace('\','/')
        $record=$manifest.PSObject.Properties[$key]
        if($null -eq $record -or $record.Value.sha256 -cnotmatch '^[a-f0-9]{64}$' -or
            [string]$record.Value.bytes -cnotmatch '^[1-9][0-9]*$'){throw 'PACKAGE_MANIFEST_RECORD_MISSING_OR_INVALID'}
        if($info.Length -ne [int64]$record.Value.bytes -or
            (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -cne $record.Value.sha256){throw 'DELIVERY_FILE_HASH_OR_SIZE_MISMATCH'}
    }
    $script:BootChecks.Add('EXTRACTION_REQUIRED_FILES_PATHS_MANIFEST: PASS')
    $autoNames=@('args','error','event','eventargs','eventsubscriber','foreach','home','host','input','lastexitcode','matches','myinvocation','nestedpromptlevel','pid','profile','psboundparameters','pscmdlet','pscommandpath','psculture','psdebugcontext','pshome','psitem','psscriptroot','psuiculture','psversiontable','pwd','sender','shellid','stacktrace','switch','this','true','false','null')
    foreach($rel in @('internal\BOOTSTRAP.ps1','internal\JH231-UPDATE.ps1')){
        $path=Join-Path $BootRoot $rel
        $bytes=[IO.File]::ReadAllBytes($path)
        if($bytes.Length -lt 3 -or $bytes[0] -ne 239 -or $bytes[1] -ne 187 -or $bytes[2] -ne 191){throw 'POWERSHELL_UTF8_BOM_REQUIRED'}
        $text=[Text.UTF8Encoding]::new($false,$true).GetString($bytes,3,$bytes.Length-3)
        if($text -match '(?<!\r)\n'){throw 'POWERSHELL_CRLF_REQUIRED'}
        $tokens=$null;$parseErrors=$null
        $ast=[Management.Automation.Language.Parser]::ParseFile($path,[ref]$tokens,[ref]$parseErrors)
        if($parseErrors.Count -ne 0){throw 'POWERSHELL_51_PARSE_FAILED'}
        $assignments=$ast.FindAll({param($node) $node -is [Management.Automation.Language.AssignmentStatementAst]},$true)
        foreach($assignment in $assignments){
            if($assignment.Left -is [Management.Automation.Language.VariableExpressionAst]){
                $variable=$assignment.Left.VariablePath.UserPath.ToLowerInvariant()
                # Plain $null = <command> is an output sink, not mutable application state.
                if($variable -ceq 'null' -and $assignment.Operator -eq [Management.Automation.Language.TokenKind]::Equals){continue}
                if($autoNames -contains ($variable -replace '^(?:script|global|local|private):','')){throw 'POWERSHELL_AUTOMATIC_VARIABLE_COLLISION'}
            }
        }
        $definitions=$ast.FindAll({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst]},$true)
        foreach($definition in $definitions){
            if(Get-Alias -Name $definition.Name -ErrorAction SilentlyContinue){throw 'POWERSHELL_FUNCTION_ALIAS_COLLISION'}
        }
    }
    $cmd=[IO.File]::ReadAllBytes((Join-Path $BootRoot '실행.cmd'))
    if(@($cmd | Where-Object {$_ -gt 127}).Count -gt 0 -or [Text.Encoding]::ASCII.GetString($cmd) -match '(?<!\r)\n'){throw 'CMD_ASCII_CRLF_REQUIRED'}
    $script:BootChecks.Add('POWERSHELL_51_PARSE_BOM_AUTOVARS_ALIASES_CMD_ENCODING: PASS')
}
function InvokeUpdateChild([string]$Runner,[string]$Id) {
    $ps=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    if(-not(Test-Path -LiteralPath $ps -PathType Leaf)){throw 'WINDOWS_POWERSHELL_EXECUTABLE_MISSING'}
    $script:BootDispatched=$true
    $prior=$ErrorActionPreference
    try {
        $ErrorActionPreference='Continue'
        $lines=@(& $ps -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $Runner -RunId $Id 2>&1 | ForEach-Object {$_.ToString()})
        $code=$LASTEXITCODE
    } finally {$ErrorActionPreference=$prior}
    foreach($line in $lines){Write-Host $line}
    return [pscustomobject]@{Code=$code}
}
function ReadCurrentChildResult {
    $dirs=@((Join-Path $BootRoot ('runs\'+$BootRunId)))
    if($env:LOCALAPPDATA){$dirs+=Join-Path $env:LOCALAPPDATA ('JH\delivery-results\'+$BootRunId)}
    $dirs+=Join-Path ([IO.Path]::GetTempPath()) ('JH231-result-'+$BootRunId)
    foreach($dir in $dirs){
        $file=Join-Path $dir 'RESULT.txt'
        if(-not(Test-Path -LiteralPath $file -PathType Leaf)){continue}
        $info=Get-Item -LiteralPath $file -ErrorAction Stop
        if($info.Length -gt 65536 -or ($info.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){continue}
        $raw=Get-Content -LiteralPath $file -Raw -Encoding UTF8
        $idFields=[regex]::Matches($raw,'(?m)^RUN_ID: ([a-f0-9]{32})\r?$')
        $kindFields=[regex]::Matches($raw,'(?m)^REPORT_KIND: ([A-Z0-9_]+)\r?$')
        $stateFields=[regex]::Matches($raw,'(?m)^STATUS: ([A-Z0-9_]+)\r?$')
        if($idFields.Count -eq 1 -and $idFields[0].Groups[1].Value -ceq $BootRunId -and
            $kindFields.Count -eq 1 -and $kindFields[0].Groups[1].Value -ceq 'JH231_SIGN_UPDATE_RESULT_V1' -and
            $stateFields.Count -eq 1){return [pscustomobject]@{Path=$file;Status=$stateFields[0].Groups[1].Value}}
    }
    throw 'CURRENT_RUN_ID_RESULT_MISSING_OR_INVALID_NO_REPLAY'
}
function InvokeJh231Bootstrap {
    try {
        AssertBootPreflight
        $result=InvokeUpdateChild (Join-Path $BootRoot 'internal\JH231-UPDATE.ps1') $BootRunId
        $script:BootChildCode=[string]$result.Code
        $receipt=ReadCurrentChildResult
        $script:BootChildResult=$receipt.Status
        if($result.Code -eq 0 -and $receipt.Status -in @('PASS_UPDATE_INSTALLED_VERIFIED','ALREADY_INSTALLED_VERIFIED_NO_INSTALL')){
            $script:BootStatus='PASS_CURRENT_RUNNER_RESULT_VERIFIED'
            $script:BootReason='CURRENT_RUN_ID_AND_REPORT_KIND_MATCH'
        } elseif($result.Code -ne 0 -and $receipt.Status -eq 'BLOCKED_NO_INSTALL'){
            $script:BootStatus='BLOCKED_CHILD_REPORTED_NO_INSTALL'
            $script:BootReason='CURRENT_RUNNER_BLOCKED_SEE_CHILD_RESULT'
        } else {throw 'CURRENT_RUNNER_OUTCOME_NOT_VERIFIED_NO_REPLAY'}
    } catch {
        $message=$_.Exception.Message
        $script:BootReason=if($message -cmatch '^[A-Z0-9_]{3,160}$'){$message}else{'BOOTSTRAP_LOCAL_EXCEPTION'}
        if($script:BootDispatched){$script:BootStatus='UNKNOWN_AFTER_RUNNER_DISPATCH_NO_REPLAY'}
        else{$script:BootStatus='BLOCKED_NO_RUNNER_DISPATCH'}
    } finally {
        SaveBootResult
        Write-Host ('BOOTSTRAP_STATUS: '+$script:BootStatus)
        Write-Host ('BOOTSTRAP_REASON: '+$script:BootReason)
    }
    if($script:BootSaved -and $script:BootStatus -eq 'PASS_CURRENT_RUNNER_RESULT_VERIFIED'){return 0}
    return 2
}
# BOOTSTRAP_MAIN_ENTRY - fixture tests load an isolated copy before this line.
exit (InvokeJh231Bootstrap)
