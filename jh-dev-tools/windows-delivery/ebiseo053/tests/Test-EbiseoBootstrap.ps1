param([Parameter(Mandatory=$true)][string]$KitRoot)
$ErrorActionPreference='Stop'
$KitRoot=(Resolve-Path -LiteralPath $KitRoot).Path
$scratch=Join-Path ([IO.Path]::GetTempPath()) ('JHEQ-Boot-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($scratch)|Out-Null
$stubPath=Join-Path $scratch 'harmless-process-stub.exe'
$stubSource=@'
using System;
using System.IO;
using System.Text;
using System.Security.Cryptography;
public static class JhEbiseoBootstrapStub {
    static string Arg(string[] args,string name) {
        for(int i=0;i<args.Length-1;i++) if(args[i]==name) return args[i+1];
        throw new Exception("Missing harmless stub argument");
    }
    static string J(string s) { return "\"" + s.Replace("\\","\\\\").Replace("\"","\\\"") + "\""; }
    static string Sha(string p) {
        using(var sha=SHA256.Create()) using(var f=File.OpenRead(p))
            return BitConverter.ToString(sha.ComputeHash(f)).Replace("-","").ToLowerInvariant();
    }
    public static int Main(string[] args) {
        string script=Arg(args,"-File"), id=Arg(args,"-RunId"), handoff=Arg(args,"-Handoff");
        string scenario=Environment.GetEnvironmentVariable("JH_BOOTSTRAP_SYNTHETIC_CASE") ?? "success";
        if(script.EndsWith("Start-JH-Ebiseo.ps1")) {
            if(scenario=="unknown") return 9;
            string actualId=scenario=="stale" ? "00000000000000000000000000000000" : id;
            string root=Directory.GetParent(Path.GetDirectoryName(script)).FullName;
            string path=Path.Combine(root,"stub-results",id,"RESULT.txt");
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            string status=scenario=="reported-failure" ? "BLOCKED" : "PREPARED_NOT_INSTALLED";
            File.WriteAllText(path,"{\"reportKind\":\"JH_EBISEO_PREBUILT_INSTALL_RESULT_V1\",\"runId\":"+J(actualId)+",\"status\":"+J(status)+"}",new UTF8Encoding(false));
            File.WriteAllText(handoff,"{\"reportKind\":\"JH_EBISEO_PREBUILT_INSTALL_RESULT_V1\",\"runId\":"+J(actualId)+",\"resultPath\":"+J(path)+",\"resultSha256\":"+J(Sha(path))+"}",new UTF8Encoding(false));
            return scenario=="reported-failure" ? 7 : 0;
        }
        if(script.EndsWith("Confirm-JH-Ebiseo-Result.ps1")) {
            if(!File.Exists(handoff)) return 4;
            return File.ReadAllText(handoff).Contains("\"runId\":"+J(id)) ? 0 : 5;
        }
        return 12;
    }
}
'@
Add-Type -TypeDefinition $stubSource -Language CSharp -OutputAssembly $stubPath -OutputType ConsoleApplication
$original=(Get-Content -LiteralPath (Join-Path $KitRoot '실행.cmd') -Raw -Encoding ASCII)
$needle='set "JH_PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"'
if (($original.Split([string[]]@($needle),[StringSplitOptions]::None)).Count -ne 2) { throw 'Expected exactly one test-copy process substitution' }
$oldScenario=$env:JH_BOOTSTRAP_SYNTHETIC_CASE
$oldTemp=$env:TEMP
$passed=0;$failed=0;$cases=New-Object 'System.Collections.Generic.List[object]'
function Assert-Case([bool]$Ok,[string]$Reason) { if(!$Ok){throw $Reason} }
function Invoke-CmdCase([string]$Name,[string]$Scenario,[string]$Expected,[int]$ExpectedExit,[bool]$MissingFile=$false,[bool]$MissingPs=$false,[bool]$Fallback=$false) {
    $root=Join-Path $scratch ($Name+' space 한글 ! percent%')
    [IO.Directory]::CreateDirectory((Join-Path $root 'data'))|Out-Null
    foreach($file in @('Start-JH-Ebiseo.ps1','JH-Ebiseo-InstallCore.ps1','Confirm-JH-Ebiseo-Result.ps1','RELEASE.json','JH-Ebiseo-0.5.3-unsigned.apk')) {
        if($MissingFile -and $file -eq 'RELEASE.json'){continue}
        [IO.File]::WriteAllText((Join-Path $root ('data\'+$file)),'SYNTHETIC PLACEHOLDER')
    }
    [IO.File]::WriteAllText((Join-Path $root 'POWER_SHELL_ERROR_CHECKLIST.txt'),'SYNTHETIC')
    [IO.File]::WriteAllText((Join-Path $root 'RESULT.txt'),'PRESERVE_OLD_RESULT')
    if($Fallback){[IO.File]::WriteAllText((Join-Path $root 'bootstrap-results'),'SYNTHETIC_BLOCKED_DIRECTORY')}
    $exe=$stubPath;if($MissingPs){$exe=Join-Path $scratch 'NONEXISTENT.exe'}
    $runner=Join-Path $root '실행.cmd'
    $copy=$original.Replace($needle,('set "JH_PS='+$exe+'"'))
    [IO.File]::WriteAllText($runner,$copy,[Text.Encoding]::ASCII)
    $env:JH_BOOTSTRAP_SYNTHETIC_CASE=$Scenario
    $env:TEMP=Join-Path $root 'temporary';[IO.Directory]::CreateDirectory($env:TEMP)|Out-Null
    $info=New-Object Diagnostics.ProcessStartInfo
    $info.FileName=$env:ComSpec
    $info.Arguments='/d /s /c ""'+$runner+'" <nul"'
    $info.WorkingDirectory=$root
    $info.UseShellExecute=$false
    $info.RedirectStandardOutput=$true
    $info.RedirectStandardError=$true
    $process=[Diagnostics.Process]::Start($info)
    $stdoutTask=$process.StandardOutput.ReadToEndAsync();$stderrTask=$process.StandardError.ReadToEndAsync()
    if(!$process.WaitForExit(30000)){$process.Kill();throw 'Harmless CMD test timed out'}
    $stdout=$stdoutTask.Result;$stderr=$stderrTask.Result
    $exit=$process.ExitCode;$process.Dispose()
    Assert-Case ($exit -eq $ExpectedExit) ('Unexpected CMD exit '+$exit+': '+$stdout+' '+$stderr)
    Assert-Case (([IO.File]::ReadAllText((Join-Path $root 'RESULT.txt'))) -ceq 'PRESERVE_OLD_RESULT') 'Old result was modified'
    if($Expected -eq 'VERIFIED') {
        Assert-Case ($stdout -match 'current run result was verified') 'Missing current-result confirmation'
    } else {
        $found=@(Get-ChildItem -LiteralPath $root -Filter RESULT.txt -Recurse -File | Where-Object { $_.FullName -ne (Join-Path $root 'RESULT.txt') -and $_.FullName -notmatch 'stub-results' })
        Assert-Case ($found.Count -eq 1) 'Exactly one new bootstrap result required'
        $body=Get-Content -LiteralPath $found[0].FullName -Raw
        Assert-Case ($body -match ('(?m)^STATUS: '+$Expected+'\s*$')) 'Wrong dispatch classification'
        if($Expected -eq 'UNKNOWN'){Assert-Case ($body -match '(?m)^INSTALL_ATTEMPTS: UNKNOWN\s*$') 'Unknown dispatch falsely reports zero attempts'}
        if($Fallback){Assert-Case ($found[0].FullName -match 'temporary') 'Fallback result not used'}
    }
    return @{name=$Name;status='PASS';exitCode=$exit;synthetic=$true}
}
try {
    $specs=@(
        @('success','success','VERIFIED',0,$false,$false,$false),
        @('reported-failure','reported-failure','VERIFIED',7,$false,$false,$false),
        @('missing-file','success','BLOCKED',2,$true,$false,$false),
        @('missing-powershell','success','BLOCKED',2,$false,$true,$false),
        @('unknown-dispatch','unknown','UNKNOWN',3,$false,$false,$false),
        @('stale-result','stale','UNKNOWN',3,$false,$false,$false),
        @('fallback-write','success','BLOCKED',2,$true,$false,$true)
    )
    foreach($spec in $specs) {
        try {$outcome=Invoke-CmdCase @spec;$cases.Add($outcome);$passed++;Write-Host ('PASS '+$spec[0])}
        catch {$failed++;$cases.Add(@{name=$spec[0];status='FAIL';reason=$_.Exception.Message});Write-Host ('FAIL '+$spec[0]+': '+$_.Exception.Message)}
    }
} finally {$env:JH_BOOTSTRAP_SYNTHETIC_CASE=$oldScenario;$env:TEMP=$oldTemp}
$report=@{schema='JH_EBISEO_ACTUAL_CMD_MOCK_TESTS_V1';powershellVersion=$PSVersionTable.PSVersion.ToString();realCmd=$true;syntheticProcess=$true;realAdb=0;realKeys=0;passed=$passed;failed=$failed;cases=$cases;artifacts=$scratch}
$reportPath=Join-Path $scratch 'CMD-TEST-RESULT.json'
[IO.File]::WriteAllText($reportPath,($report|ConvertTo-Json -Depth 8),(New-Object Text.UTF8Encoding($false)))
Write-Host ('TEST_RESULT_PATH: '+$reportPath)
if($failed -gt 0){exit 1}
exit 0
