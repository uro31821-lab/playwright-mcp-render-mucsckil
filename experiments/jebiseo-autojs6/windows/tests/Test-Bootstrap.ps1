param([string]$KitRoot = (Split-Path -Parent $PSScriptRoot))
Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
$KitRoot = [IO.Path]::GetFullPath($KitRoot)
$work = Join-Path ([IO.Path]::GetTempPath()) ('jebiseo-cmd-' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($work) | Out-Null
$passed = [Collections.Generic.List[string]]::new()
$script:bootstrapDiagnostic = ''
function Assert-Bootstrap([bool]$Condition, [string]$Message) { if (!$Condition) { throw ('TEST_FAILED: ' + $Message + "`r`n" + $script:bootstrapDiagnostic) } }
try {
    $original = [IO.File]::ReadAllText((Join-Path $KitRoot '실행.cmd'), [Text.Encoding]::ASCII)
    $bytes = [IO.File]::ReadAllBytes((Join-Path $KitRoot '실행.cmd'))
    Assert-Bootstrap (@($bytes | Where-Object { $_ -gt 127 }).Count -eq 0 -and $original -notmatch '(?<!\r)\n') 'CMD must contain ASCII CRLF only'
    $stub = Join-Path $work 'harmless powershell & 100%.exe'
    Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Text;
public class JebiseoHarmlessBootstrapProcess {
    static string Arg(string[] values, string name) {
        for (int i=0; i+1<values.Length; i++) if (values[i].Equals(name, StringComparison.OrdinalIgnoreCase)) return values[i+1];
        throw new Exception("Missing test argument");
    }
    static void NewFile(string path, string value) {
        Directory.CreateDirectory(Path.GetDirectoryName(path));
        using (var stream = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None)) {
            var data = Encoding.UTF8.GetBytes(value); stream.Write(data,0,data.Length); stream.Flush(true);
        }
    }
    public static int Main(string[] arguments) {
        try {
            string file = Arg(arguments,"-File"), run = Arg(arguments,"-RunId"), handoff = Arg(arguments,"-Handoff");
            string root = Path.GetDirectoryName(file), scenario = File.ReadAllText(Path.Combine(root,"SCENARIO.txt")).Trim();
            File.AppendAllText(Path.Combine(root,"INVOCATIONS.log"),Path.GetFileName(file)+Environment.NewLine);
            if (Path.GetFileName(file).Equals("RUN.ps1",StringComparison.OrdinalIgnoreCase)) {
                if (scenario == "unknown-dispatch" || scenario == "fallback-write") return 3;
                string id = scenario == "stale-result" ? "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" : run;
                string result = Path.Combine(root,"synthetic-results",id,"RESULT.txt");
                NewFile(result,"RUN_ID="+id+Environment.NewLine+"STATUS="+(scenario=="reported-failure"?"BLOCKED":"PHONE_RESULT_RECEIVED")+Environment.NewLine);
                NewFile(handoff,id+"|"+result);
                return scenario=="reported-failure"?2:0;
            }
            if (!File.Exists(handoff)) return 1;
            string pointer = File.ReadAllText(handoff);
            if (!pointer.StartsWith(run+"|",StringComparison.Ordinal)) return 1;
            string path = pointer.Substring(run.Length+1);
            if (!File.Exists(path) || !File.ReadAllText(path).StartsWith("RUN_ID="+run+Environment.NewLine,StringComparison.Ordinal)) return 1;
            Console.WriteLine("RESULT_FILE="+path);
            return 0;
        } catch (Exception failure) { Console.Error.WriteLine("SYNTHETIC_STUB_ERROR="+failure.GetType().Name+": "+failure.Message); return 1; }
    }
}
'@ -OutputAssembly $stub -OutputType ConsoleApplication | Out-Null

    foreach ($scenario in @('success', 'reported-failure', 'missing-file', 'missing-powershell', 'unknown-dispatch', 'stale-result', 'fallback-write')) {
        $root = Join-Path $work ($scenario + ' 한글 & (space) 100%')
        $temp = Join-Path $work ($scenario + '-temp')
        [IO.Directory]::CreateDirectory($root) | Out-Null
        [IO.Directory]::CreateDirectory($temp) | Out-Null
        [IO.File]::WriteAllText((Join-Path $root 'SCENARIO.txt'), $scenario)
        [IO.File]::WriteAllText((Join-Path $root 'RESULT.txt'), 'KEEP_PREVIOUS_RESULT')
        foreach ($required in @('RUN.ps1', 'Confirm-Result.ps1', 'assets.json', 'POWER_SHELL_ERROR_CHECKLIST.txt')) { [IO.File]::WriteAllText((Join-Path $root $required), 'SYNTHETIC TEST PLACEHOLDER') }
        $selected = $stub
        if ($scenario -ceq 'missing-powershell') { $selected = Join-Path $root 'does-not-exist.exe' }
        # Only the test COPY changes the interpreter path; production has no bypass switch.
        $batchLiteral = $selected.Replace('%', '%%')
        $copy = $original.Replace('set "JEB_PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"', ('set "JEB_PS=' + $batchLiteral + '"'))
        Assert-Bootstrap ($copy -cne $original) 'Fixed interpreter line must be present'
        $entry = Join-Path $root '실행.cmd'
        [IO.File]::WriteAllText($entry, $copy, [Text.Encoding]::ASCII)
        if ($scenario -ceq 'missing-file') { Remove-Item -LiteralPath (Join-Path $root 'RUN.ps1') }
        if ($scenario -ceq 'fallback-write') { [IO.File]::WriteAllText((Join-Path $root 'bootstrap-results'), 'BLOCK_DIRECTORY_CREATION') }
        $process = [Diagnostics.Process]::new()
        try {
            $info = [Diagnostics.ProcessStartInfo]::new()
            $info.FileName = $env:COMSPEC
            $info.Arguments = '/d /s /c ""' + $entry + '" <nul"'
            $info.WorkingDirectory = $root
            $info.UseShellExecute = $false
            $info.CreateNoWindow = $true
            $info.RedirectStandardOutput = $true
            $info.RedirectStandardError = $true
            $info.EnvironmentVariables['TEMP'] = $temp
            $info.EnvironmentVariables['TMP'] = $temp
            $process.StartInfo = $info
            Assert-Bootstrap ($process.Start()) 'Actual cmd.exe must start'
            $stdout = $process.StandardOutput.ReadToEndAsync()
            $stderr = $process.StandardError.ReadToEndAsync()
            if (!$process.WaitForExit(30000)) { try { $process.Kill() } catch { }; throw ('CMD_TIMEOUT: ' + $scenario) }
            $output = $stdout.GetAwaiter().GetResult() + $stderr.GetAwaiter().GetResult()
            $exitCode = $process.ExitCode
        } finally { $process.Dispose() }
        $script:bootstrapDiagnostic = 'SYNTHETIC_SCENARIO=' + $scenario + "`r`nEXIT_CODE=" + $exitCode + "`r`nACTUAL_CMD_OUTPUT_BEGIN`r`n" + $output + "`r`nACTUAL_CMD_OUTPUT_END"
        Assert-Bootstrap ([IO.File]::ReadAllText((Join-Path $root 'RESULT.txt')) -ceq 'KEEP_PREVIOUS_RESULT') ($scenario + ': previous RESULT preserved')
        Assert-Bootstrap ($output.Contains('RESULT_FILE=')) ($scenario + ': current result path displayed')
        $log = Join-Path $root 'INVOCATIONS.log'
        $invocations = @(); if (Test-Path -LiteralPath $log) { $invocations = @([IO.File]::ReadAllLines($log)) }
        if ($scenario -ceq 'success' -or $scenario -ceq 'reported-failure') {
            $expectedExit = 0; if ($scenario -ceq 'reported-failure') { $expectedExit = 2 }
            Assert-Bootstrap ($exitCode -eq $expectedExit -and $invocations.Count -eq 2) ($scenario + ': one dispatch and one verifier')
            Assert-Bootstrap (!(Test-Path -LiteralPath (Join-Path $root 'bootstrap-results'))) ($scenario + ': verified result requires no fallback')
        } else {
            Assert-Bootstrap ($exitCode -eq 2) ($scenario + ': failure exit is explicit')
            $fallbacks = @()
            $localFallback = Join-Path $root 'bootstrap-results'
            if (Test-Path -LiteralPath $localFallback -PathType Container) { $fallbacks += @(Get-ChildItem -LiteralPath $localFallback -Filter 'RESULT.txt' -Recurse) }
            $fallbacks += @(Get-ChildItem -LiteralPath $temp -Filter 'RESULT.txt' -Recurse)
            Assert-Bootstrap ($fallbacks.Count -eq 1) ($scenario + ': one fresh fallback result')
            $report = [IO.File]::ReadAllText($fallbacks[0].FullName)
            Assert-Bootstrap ($report -match '(?m)^RUN_ID=[0-9a-f]{32}\r?$') ($scenario + ': fresh run identity')
            if ($scenario -ceq 'missing-file' -or $scenario -ceq 'missing-powershell') {
                Assert-Bootstrap ($report -match 'STATUS=BLOCKED' -and $report -match 'INSTALL_ATTEMPTS=0' -and $invocations.Count -eq 0) ($scenario + ': no dispatch on preflight failure')
            } else {
                Assert-Bootstrap ($report -match 'STATUS=UNKNOWN' -and $report -match 'INSTALL_ATTEMPTS=UNKNOWN' -and $invocations.Count -eq 2) ($scenario + ': unknown dispatch never retried')
            }
            if ($scenario -ceq 'fallback-write') { Assert-Bootstrap ($fallbacks[0].FullName.StartsWith($temp, [StringComparison]::OrdinalIgnoreCase)) 'Unwritable root falls back to TEMP' }
        }
        $passed.Add($scenario)
    }
    [pscustomobject]@{ schema = 'jebiseo.windows.bootstrap-tests.v1'; passed = $passed.Count; cases = $passed.ToArray(); actualCmd = $true; syntheticPowerShellProcess = $true; realAdb = 0; realPhone = 0; realInstall = 0; fullE2e = 'NOT_RUN' } | ConvertTo-Json -Depth 4
} finally {
    if (Test-Path -LiteralPath $work) { Remove-Item -LiteralPath $work -Recurse -Force }
}
