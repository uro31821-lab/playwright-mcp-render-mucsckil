param([Parameter(Mandatory=$true)][string]$KitRoot)
$ErrorActionPreference='Stop'
if($PSVersionTable.PSEdition -ne 'Desktop' -or $PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1){throw 'WINDOWS_POWERSHELL_51_REQUIRED'}
$KitRoot=(Resolve-Path -LiteralPath $KitRoot).Path
$work=Join-Path ([IO.Path]::GetTempPath()) ('jh231-progress-test-'+[Guid]::NewGuid().ToString('N'))
$null=New-Item -Path $work -ItemType Directory
$testPs=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$passed=0
function ProgressCheck([bool]$Condition,[string]$Message){if(-not $Condition){throw ('ASSERT_FAILED: '+$Message)}}
function Literal([string]$Text){return "'"+$Text.Replace("'","''")+"'"}
function WriteFixtureScript([string]$Path,[string]$Text){
    $normalized=($Text -replace "`r`n","`n") -replace "`n","`r`n"
    [IO.File]::WriteAllText($Path,$normalized,[Text.UTF8Encoding]::new($true))
}
function ProductionPrelude([string]$Source,[string]$Marker,[string]$Destination){
    $raw=Get-Content -LiteralPath $Source -Raw -Encoding UTF8
    ProgressCheck (([regex]::Matches($raw,[regex]::Escape($Marker))).Count -eq 1) 'Exactly one production entry marker'
    $prelude=($raw -split [regex]::Escape($Marker),2)[0]
    WriteFixtureScript $Destination $prelude
}
function PsInfo([string]$Code){
    $info=[Diagnostics.ProcessStartInfo]::new()
    $info.FileName=$testPs
    $info.Arguments='-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand '+[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($Code))
    return $info
}
function ObserveFixtureProcess([Diagnostics.ProcessStartInfo]$Info,[string]$ExpectedEarlyLine,[string]$DoneMarker){
    $Info.UseShellExecute=$false;$Info.CreateNoWindow=$true
    $Info.RedirectStandardInput=$true;$Info.RedirectStandardOutput=$true;$Info.RedirectStandardError=$true
    $Info.WorkingDirectory=$work
    $process=[Diagnostics.Process]::new();$process.StartInfo=$Info
    $watch=[Diagnostics.Stopwatch]::new()
    $lines=New-Object 'System.Collections.Generic.List[string]'
    $earlyObserved=$false;$earlyMs=-1;$stdoutClosed=$false;$started=$false
    try {
        ProgressCheck ($process.Start()) 'Start only the owned harmless process'
        $started=$true;$watch.Start()
        # The copied CMD uses pause; feed its only input without an interactive wait.
        $process.StandardInput.WriteLine('');$process.StandardInput.Close()
        # Drain stderr concurrently, and stdout incrementally. Never WaitForExit before draining.
        $stderrTask=$process.StandardError.ReadToEndAsync()
        $lineTask=$process.StandardOutput.ReadLineAsync()
        while(-not $stdoutClosed -or -not $process.HasExited){
            if($watch.Elapsed.TotalSeconds -gt 20){throw 'OWNED_HARMLESS_PROCESS_TIMEOUT_20_SECONDS'}
            if(-not $stdoutClosed -and $lineTask.Wait(100)){
                $line=$lineTask.Result
                if($null -eq $line){$stdoutClosed=$true}
                else {
                    $lines.Add($line)
                    if(-not $earlyObserved -and $line.StartsWith($ExpectedEarlyLine,[StringComparison]::Ordinal)){
                        ProgressCheck (-not $process.HasExited) 'Progress observed before parent harness termination'
                        ProgressCheck (-not (Test-Path -LiteralPath $DoneMarker)) 'Progress observed before harmless child completion marker'
                        $earlyObserved=$true;$earlyMs=$watch.ElapsedMilliseconds
                    }
                    $lineTask=$process.StandardOutput.ReadLineAsync()
                }
            } elseif($stdoutClosed){$null=$process.WaitForExit(100)}
        }
        ProgressCheck ($process.WaitForExit(2000)) 'Confirm owned process exit'
        ProgressCheck ($stderrTask.Wait(2000)) 'Confirm concurrent stderr drain finished'
        ProgressCheck $earlyObserved 'Required progress line arrived while harmless child still running'
        ProgressCheck (Test-Path -LiteralPath $DoneMarker -PathType Leaf) 'Harmless child completed its single invocation'
        return [pscustomobject]@{Code=$process.ExitCode;Lines=$lines.ToArray();Stderr=$stderrTask.Result;EarlyMs=$earlyMs;ElapsedMs=$watch.ElapsedMilliseconds}
    } finally {
        # Test-only cleanup of the exact Process object created above, never a user process.
        if($started -and -not $process.HasExited){try{$process.Kill();$null=$process.WaitForExit(2000)}catch{}}
        $process.Dispose()
    }
}
try {
    $preludes=Join-Path $work "preludes 한글 & apostrophe's"
    $null=New-Item -Path $preludes -ItemType Directory
    $bootPrelude=Join-Path $preludes 'Production-Boot-Prelude.ps1'
    $mainPrelude=Join-Path $preludes 'Production-Main-Prelude.ps1'
    ProductionPrelude (Join-Path $KitRoot 'internal\BOOTSTRAP.ps1') '# BOOTSTRAP_MAIN_ENTRY' $bootPrelude
    ProductionPrelude (Join-Path $KitRoot 'internal\JH231-UPDATE.ps1') '# MAIN_ENTRY' $mainPrelude
    foreach($path in @($bootPrelude,$mainPrelude,$PSCommandPath)){
        $tokens=$null;$parseErrors=$null
        $null=[Management.Automation.Language.Parser]::ParseFile($path,[ref]$tokens,[ref]$parseErrors)
        ProgressCheck ($parseErrors.Count -eq 0) ('Windows 5.1 parser: '+[IO.Path]::GetFileName($path))
    }
    foreach($childExit in @(0,7)){
        $case='native-child-exit-'+$childExit
        $runner=Join-Path $preludes ($case+'.ps1')
        $done=Join-Path $work ($case+'.done')
        $runId=[Guid]::NewGuid().ToString('N')
        # Load the exact production main prelude, then invoke only its stage-display function.
        # The actual update entry, key lookup, native tools, APK and phone are never invoked.
        $runnerBody=@'
param([string]$RunId)
$ErrorActionPreference='Stop'
$fixtureExpectedRun=__RUN_ID__
if($RunId -cne $fixtureExpectedRun){throw 'CHILD_RUN_ID_MISMATCH'}
. __MAIN_PRELUDE__ -RunId $RunId
SetJh231Stage 'DEVICE_PRECHECK'
if($Stage -cne 'DEVICE_PRECHECK' -or $RunId -cne $fixtureExpectedRun){throw 'PRODUCTION_STAGE_OR_RUN_ID_NOT_PRESERVED'}
[Console]::Out.Flush()
Start-Sleep -Milliseconds 3000
[IO.File]::WriteAllText(__DONE_MARKER__,'HARMLESS_CHILD_FINISHED',[Text.UTF8Encoding]::new($false))
Write-Output 'HARMLESS_CHILD_FINISHED'
exit __EXIT_CODE__
'@
        $runnerBody=$runnerBody.Replace('__RUN_ID__',(Literal $runId)).Replace('__MAIN_PRELUDE__',(Literal $mainPrelude)).Replace('__DONE_MARKER__',(Literal $done)).Replace('__EXIT_CODE__',[string]$childExit)
        WriteFixtureScript $runner $runnerBody
        # This calls the real production InvokeUpdateChild implementation, not a stub.
        $harness=@'
$ErrorActionPreference='Stop'
. __BOOT_PRELUDE__
$childResult=InvokeUpdateChild __RUNNER__ __RUN_ID__
if($childResult.Code -ne __EXIT_CODE__ -or -not $BootDispatched){throw 'NATIVE_CHILD_RESULT_OR_DISPATCH_NOT_PRESERVED'}
Write-Output ('HARNESS_RETURN_CODE: '+$childResult.Code)
exit 0
'@
        $harness=$harness.Replace('__BOOT_PRELUDE__',(Literal $bootPrelude)).Replace('__RUNNER__',(Literal $runner)).Replace('__RUN_ID__',(Literal $runId)).Replace('__EXIT_CODE__',[string]$childExit)
        $observed=ObserveFixtureProcess (PsInfo $harness) '[JH231] DEVICE_PRECHECK UTC=' $done
        ProgressCheck ($observed.Code -eq 0) ('Native production child path: '+$case+' '+$observed.Stderr)
        ProgressCheck (($observed.Lines | Where-Object {$_ -like ('*RunId='+$runId)}).Count -eq 1) 'One visible production stage line with exact RunId'
        ProgressCheck ($observed.Lines -contains ('HARNESS_RETURN_CODE: '+$childExit)) 'Original native exit code preserved'
        ProgressCheck (($observed.Lines | Where-Object {$_ -ceq 'HARMLESS_CHILD_FINISHED'}).Count -eq 1) 'One child completion without replay'
        $passed++;Write-Host ('PASS '+$case+' early_output_ms='+$observed.EarlyMs+' exit_ms='+$observed.ElapsedMs)
    }
    $cmdRoot=Join-Path $work "cmd 한글 space & apostrophe's"
    $null=New-Item -Path (Join-Path $cmdRoot 'internal') -ItemType Directory -Force
    $cmdPath=Join-Path $cmdRoot '실행.cmd'
    Copy-Item -LiteralPath (Join-Path $KitRoot '실행.cmd') -Destination $cmdPath
    $cmdDone=Join-Path $work 'cmd-start.done'
    $cmdBody="Start-Sleep -Milliseconds 3000`r`n[IO.File]::WriteAllText("+(Literal $cmdDone)+",'HARMLESS_BOOTSTRAP_FINISHED')`r`nexit 0`r`n"
    WriteFixtureScript (Join-Path $cmdRoot 'internal\BOOTSTRAP.ps1') $cmdBody
    $cmdInfo=[Diagnostics.ProcessStartInfo]::new()
    $cmdInfo.FileName=Join-Path $env:SystemRoot 'System32\cmd.exe'
    $cmdInfo.Arguments='/d /c ""'+$cmdPath+'""'
    $cmdObserved=ObserveFixtureProcess $cmdInfo 'JH231 update starting. Progress will appear below.' $cmdDone
    ProgressCheck ($cmdObserved.Code -eq 0) ('Actual CMD completion: '+$cmdObserved.Stderr)
    ProgressCheck ($cmdObserved.Lines -contains 'Keep this window open. Do not start a second copy.') 'Initial no-second-copy message visible'
    $passed++;Write-Host ('PASS actual-cmd-start-visible early_output_ms='+$cmdObserved.EarlyMs+' exit_ms='+$cmdObserved.ElapsedMs)
    Write-Host ('JH231_PROGRESS_WINDOWS_51_TESTS: passed='+$passed+' total=3 failed=0')
} finally {
    if(Test-Path -LiteralPath $work){Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue}
}
