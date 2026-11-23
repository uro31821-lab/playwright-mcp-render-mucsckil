param([Parameter(Mandatory=$true)][string]$KitRoot,[Parameter(Mandatory=$true)][string]$CaseName)
$ErrorActionPreference='Stop'
$work=Join-Path ([IO.Path]::GetTempPath()) ('jh231-cmd-test-'+[Guid]::NewGuid().ToString('N'))
$null=New-Item -Path $work -ItemType Directory
$exitCode=1
function CmdCheck([bool]$Condition,[string]$Message){if(-not $Condition){throw ('ASSERT_FAILED: '+$Message)}}
try {
    # Deliberately exercise spaces, Korean, ampersand and apostrophe in the extracted path.
    $kit=Join-Path $work "kit 한글 space & apostrophe's"
    $internal=Join-Path $kit 'internal';$temp=Join-Path $work 'temp';$local=Join-Path $work 'local'
    foreach($dir in @($kit,$internal,$temp,$local)){$null=New-Item -Path $dir -ItemType Directory -Force}
    $cmdPath=Join-Path $kit '실행.cmd'
    Copy-Item -LiteralPath (Join-Path $KitRoot '실행.cmd') -Destination $cmdPath
    # This is a standalone harmless bootstrap, never the production bootstrap/runner.
    # No real APK, signing tools, key locators or device commands exist in this fixture.
    $bootstrap=Join-Path $internal 'BOOTSTRAP.ps1'
    $body="Write-Output 'HARMLESS_BOOTSTRAP_EXECUTED'`r`nexit 0`r`n"
    if($CaseName -in @('cmd-bootstrap-nonzero','cmd-fallback-local')){$body="Write-Output 'HARMLESS_BOOTSTRAP_EXECUTED'`r`nexit 7`r`n"}
    if($CaseName -eq 'cmd-bootstrap-parse-error'){$body="function Broken {`r`n"}
    if($CaseName -ne 'cmd-bootstrap-missing'){[IO.File]::WriteAllText($bootstrap,$body,[Text.UTF8Encoding]::new($true))}
    if($CaseName -eq 'cmd-fallback-local'){
        $temp=Join-Path $work 'temp-file-blocker';[IO.File]::WriteAllText($temp,'BLOCKER',[Text.UTF8Encoding]::new($false))
    }
    $info=[Diagnostics.ProcessStartInfo]::new()
    $info.FileName=Join-Path $env:SystemRoot 'System32\cmd.exe'
    $info.Arguments='/d /c ""'+$cmdPath+'""'
    $info.WorkingDirectory=$work
    $info.UseShellExecute=$false
    $info.CreateNoWindow=$true
    $info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
    $info.EnvironmentVariables['TEMP']=$temp;$info.EnvironmentVariables['TMP']=$temp;$info.EnvironmentVariables['LOCALAPPDATA']=$local
    $process=[Diagnostics.Process]::new();$process.StartInfo=$info
    try {
        CmdCheck ($process.Start()) 'Real cmd process starts'
        $process.StandardInput.WriteLine('');$process.StandardInput.Close()
        if(-not $process.WaitForExit(15000)){try{$process.Kill()}catch{};throw 'CMD_FIXTURE_TIMEOUT'}
        $stdout=$process.StandardOutput.ReadToEnd();$stderr=$process.StandardError.ReadToEnd();$code=$process.ExitCode
    } finally {$process.Dispose()}
    $reports=@(Get-ChildItem -LiteralPath $work -Filter 'RESULT.txt' -File -Recurse)
    if($CaseName -eq 'cmd-success'){
        CmdCheck ($code -eq 0 -and $stdout.Contains('HARMLESS_BOOTSTRAP_EXECUTED')) 'Actual CMD invokes quoted PowerShell script path'
        CmdCheck ($reports.Count -eq 0) 'Success has no invented fallback report'
    } else {
        CmdCheck ($code -eq 2 -and $reports.Count -eq 1) 'Failure writes exactly one fresh fallback report'
        $raw=Get-Content -LiteralPath $reports[0].FullName -Raw
        CmdCheck ($raw.Contains('REPORT_KIND: JH231_CMD_FALLBACK_RESULT_V1') -and $raw.Contains('AUTOMATIC_REPLAY: NEVER')) 'Fallback receipt kind and no replay'
        if($CaseName -eq 'cmd-bootstrap-missing'){
            CmdCheck ($raw.Contains('STATUS: BLOCKED_BEFORE_BOOTSTRAP') -and -not $stdout.Contains('HARMLESS_BOOTSTRAP_EXECUTED')) 'Missing bootstrap is no dispatch'
        } else {
            CmdCheck ($raw.Contains('STATUS: UNKNOWN_AFTER_BOOTSTRAP_INVOCATION_NO_REPLAY')) 'After invocation no unproven no-effect claim'
        }
        if($CaseName -in @('cmd-bootstrap-nonzero','cmd-fallback-local')){
            CmdCheck ($raw.Contains('CHILD_EXIT_CODE: 7') -and $stdout.Contains('HARMLESS_BOOTSTRAP_EXECUTED')) 'Nonzero process code preserved'
        }
        if($CaseName -eq 'cmd-bootstrap-parse-error'){CmdCheck (-not $stdout.Contains('HARMLESS_BOOTSTRAP_EXECUTED')) 'Parser failure did not execute bootstrap body'}
        if($CaseName -eq 'cmd-fallback-local'){CmdCheck ($reports[0].FullName.StartsWith($local)) 'Real CMD uses LocalAppData fallback after blocked TEMP'}
    }
    Write-Host ('FIXTURE_PASS: '+$CaseName)
    $exitCode=0
} catch {
    Write-Host ('FIXTURE_FAIL: '+$CaseName+' '+$_.Exception.Message)
    Write-Host $_.ScriptStackTrace
} finally {
    if(Test-Path -LiteralPath $work){Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue}
}
exit $exitCode
