#requires -Version 5.1
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$KitRoot)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if($PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1 -or $env:OS -ne 'Windows_NT'){
    throw 'These tests require Windows PowerShell 5.1.'
}
$KitRoot=[IO.Path]::GetFullPath($KitRoot)
$testRoot=Join-Path ([IO.Path]::GetTempPath()) ('JH27-cmd-harmless-'+[guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($testRoot)
$script:Passed=0
function Assert-JhBootstrap([bool]$Condition,[string]$Message){if(-not $Condition){throw ('ASSERT: '+$Message)}}
function New-JhBootstrapFixture([string]$Name,[bool]$IncludeApk){
    $kit=Join-Path $testRoot $Name
    [void][IO.Directory]::CreateDirectory((Join-Path $kit 'data'))
    [IO.File]::WriteAllBytes((Join-Path $kit '실행.cmd'),[IO.File]::ReadAllBytes((Join-Path $KitRoot '실행.cmd')))
    foreach($file in @('data\Install-JH168-Stage27.ps1','data\JH-RUN-SAFETY.ps1','data\Confirm-Stage27-Result.ps1',
        'data\INSTALL-MANIFEST.json','data\STAGE27-SIGNATURE-VERIFICATION.json','POWER_SHELL_ERROR_CHECKLIST.txt','사용안내.txt')){
        [IO.File]::WriteAllText((Join-Path $kit $file),'SYNTHETIC_NOT_EXECUTED')
    }
    if($IncludeApk){[IO.File]::WriteAllText((Join-Path $kit 'data\JH168-Stage27-SIGNED.apk'),'SYNTHETIC_NOT_AN_APK')}
    [IO.File]::WriteAllText((Join-Path $kit 'RESULT.txt'),'PRESERVE_EXISTING_RESULT')
    return $kit
}
function Invoke-JhBootstrapFixture([string]$Kit,[string]$FakeSystemRoot){
    $info=[Diagnostics.ProcessStartInfo]::new()
    $info.FileName=$env:ComSpec
    $info.Arguments='/d /c ""'+(Join-Path $Kit '실행.cmd')+'""'
    $info.WorkingDirectory=$Kit
    $info.UseShellExecute=$false;$info.CreateNoWindow=$true
    $info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
    $info.EnvironmentVariables['SystemRoot']=$FakeSystemRoot
    $info.EnvironmentVariables['LOCALAPPDATA']=(Join-Path $testRoot 'local')
    $info.EnvironmentVariables['TEMP']=(Join-Path $testRoot 'temp')
    [void][IO.Directory]::CreateDirectory($info.EnvironmentVariables['LOCALAPPDATA'])
    [void][IO.Directory]::CreateDirectory($info.EnvironmentVariables['TEMP'])
    $process=[Diagnostics.Process]::new()
    try{
        $process.StartInfo=$info
        Assert-JhBootstrap ($process.Start()) 'Synthetic CMD must start'
        $stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync()
        $process.StandardInput.WriteLine('continue');$process.StandardInput.Close()
        if(-not $process.WaitForExit(10000)){try{$process.Kill()}catch{};throw 'Synthetic CMD timeout'}
        $process.WaitForExit()
        return [PSCustomObject]@{ExitCode=$process.ExitCode;Output=$stdout.GetAwaiter().GetResult();ErrorText=$stderr.GetAwaiter().GetResult()}
    }finally{$process.Dispose()}
}
try{
    $fakeSystemRoot=Join-Path $testRoot 'fake-system-root'
    $fakePsDirectory=Join-Path $fakeSystemRoot 'System32\WindowsPowerShell\v1.0'
    [void][IO.Directory]::CreateDirectory($fakePsDirectory)
    $stubExe=Join-Path $fakePsDirectory 'powershell.exe'
    # This executable only logs that it was called and returns a fixed status.
    # It never reads/evaluates a script, starts a process, or touches a device.
    $stubSource=@'
using System;
using System.IO;
public static class JhStage27SyntheticPowerShell {
    public static int Main(string[] input) {
        string target = "unknown";
        for (int i = 0; i + 1 < input.Length; i++) {
            if (String.Equals(input[i], "-File", StringComparison.OrdinalIgnoreCase)) {
                target = Path.GetFileName(input[i + 1]);
            }
        }
        File.AppendAllText("stub-invocations.txt", target + Environment.NewLine);
        Console.WriteLine("SYNTHETIC_POWERSHELL_NO_SCRIPT_EXECUTION");
        return target.IndexOf("Confirm-Stage27-Result", StringComparison.OrdinalIgnoreCase) >= 0 ? 11 : 0;
    }
}
'@
    Add-Type -TypeDefinition $stubSource -Language CSharp -OutputAssembly $stubExe -OutputType ConsoleApplication

    $missingKit=New-JhBootstrapFixture 'missing-apk' $false
    $missing=Invoke-JhBootstrapFixture $missingKit $fakeSystemRoot
    Assert-JhBootstrap ($missing.ExitCode -eq 3) 'Missing APK must not return success'
    Assert-JhBootstrap (-not [IO.File]::Exists((Join-Path $missingKit 'stub-invocations.txt'))) 'PowerShell must not be called when required APK is absent'
    Assert-JhBootstrap ([IO.File]::ReadAllText((Join-Path $missingKit 'RESULT.txt')) -ceq 'PRESERVE_EXISTING_RESULT') 'Existing result must survive bootstrap failure'
    $reports=@(Get-ChildItem -LiteralPath $missingKit -Recurse -File -Filter 'RESULT.txt'|Where-Object {$_.DirectoryName -ne $missingKit})
    Assert-JhBootstrap ($reports.Count -eq 1) 'Missing APK must create one new bootstrap result'
    $report=[IO.File]::ReadAllText($reports[0].FullName)
    Assert-JhBootstrap ($report -match '(?m)^STATUS: BLOCKED\r?$' -and $report -match '(?m)^ANDROID_INSTALL_ATTEMPT_COUNT: 0\r?$' -and $report -match '(?m)^RUN_ID: stage27-') 'Missing APK result must identify current blocked run with zero attempts'
    $script:Passed++;Write-Host 'PASS: Actual CMD missing APK blocks before dispatch and preserves prior result'

    $unknownKit=New-JhBootstrapFixture 'no-result' $true
    $beforeHash=(Get-FileHash -LiteralPath (Join-Path $unknownKit 'data\JH168-Stage27-SIGNED.apk') -Algorithm SHA256).Hash
    $unknown=Invoke-JhBootstrapFixture $unknownKit $fakeSystemRoot
    Assert-JhBootstrap ($unknown.ExitCode -eq 5) 'Dispatched no-result outcome must not return success'
    $calls=[IO.File]::ReadAllLines((Join-Path $unknownKit 'stub-invocations.txt'))
    Assert-JhBootstrap ($calls.Count -eq 2 -and $calls[0] -ceq 'Install-JH168-Stage27.ps1' -and $calls[1] -ceq 'Confirm-Stage27-Result.ps1') 'Only harmless installer and confirm stubs may be invoked'
    Assert-JhBootstrap ([IO.File]::ReadAllText((Join-Path $unknownKit 'RESULT.txt')) -ceq 'PRESERVE_EXISTING_RESULT') 'Prior RESULT must not become current success'
    $reports=@(Get-ChildItem -LiteralPath $unknownKit -Recurse -File -Filter 'RESULT.txt'|Where-Object {$_.DirectoryName -ne $unknownKit})
    Assert-JhBootstrap ($reports.Count -eq 1) 'Dispatched no-result must create one new bootstrap report'
    $report=[IO.File]::ReadAllText($reports[0].FullName)
    Assert-JhBootstrap ($report -match '(?m)^STATUS: UNKNOWN\r?$' -and $report -match '(?m)^ANDROID_INSTALL_ATTEMPT_COUNT: UNKNOWN\r?$' -and $report -match '(?m)^POWERSHELL_DISPATCHED: TRUE\r?$') 'Missing current result after dispatch must remain unknown'
    Assert-JhBootstrap ((Get-FileHash -LiteralPath (Join-Path $unknownKit 'data\JH168-Stage27-SIGNED.apk') -Algorithm SHA256).Hash -ceq $beforeHash) 'Synthetic APK must remain unchanged'
    $script:Passed++;Write-Host 'PASS: Actual CMD detects no current report after harmless dispatch and records unknown'
}finally{
    if([IO.Directory]::Exists($testRoot)){[IO.Directory]::Delete($testRoot,$true)}
}
Write-Host ('STAGE27_BOOTSTRAP_HARMLESS_CASES: '+$script:Passed)
Write-Host 'REAL_ADB_KEY_APK_DEVICE_OPERATIONS: NOT_RUN'
exit 0
