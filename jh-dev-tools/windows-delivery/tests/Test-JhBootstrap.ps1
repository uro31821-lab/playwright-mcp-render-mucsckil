param([Parameter(Mandatory=$true)][string]$KitRoot)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

# Windows-only, effect-free bootstrap regression. The synthetic powershell.exe
# never interprets a .ps1 file or runs ADB, key tools, Gradle, APKs, or a build.
# Its reports are fixture evidence, not proof of real Windows/APK operation.
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
    throw 'Test-JhBootstrap requires Windows and Windows PowerShell 5.1.'
}
if ($PSVersionTable.PSEdition -ne 'Desktop') {
    throw 'Run this test with Windows PowerShell 5.1 (shell: powershell).'
}
$entryName = ([string][char]0xC2E4) + ([string][char]0xD589) + '.cmd'
$entryPath = Join-Path ([IO.Path]::GetFullPath($KitRoot)) $entryName
if (!(Test-Path -LiteralPath $entryPath -PathType Leaf)) { throw 'Bootstrap entry was not found in KitRoot.' }
$entryBytes = [IO.File]::ReadAllBytes($entryPath)
if (@($entryBytes | Where-Object { $_ -gt 127 }).Count -ne 0) { throw 'Bootstrap must remain ASCII.' }
$entryText = [Text.Encoding]::ASCII.GetString($entryBytes)
if ($entryText -match '(?<!\r)\n|\r(?!\n)') { throw 'Bootstrap must use CRLF only.' }
if ($entryText -notmatch '(?im)^setlocal .*DisableDelayedExpansion\s*$') { throw 'Delayed expansion must remain disabled.' }
$requiredNames = @('ONECLICK.ps1','SIGN-UPDATE-FIX16.ps1','FIX16-APPLY.ps1','JH-RUN-SAFETY.ps1',
    'JH168HorizontalScrollPolicy.kt','JH168RightHorizontalScrollRuntime.kt','JH168HorizontalScrollPolicyTest.kt',
    '00-README-FIRST.txt','POWER_SHELL_ERROR_CHECKLIST.txt')
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('JH-Bootstrap-Tests-' + [Guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($testRoot)
$realCmd = Join-Path ([Environment]::GetFolderPath([Environment+SpecialFolder]::System)) 'cmd.exe'
$utf8 = New-Object Text.UTF8Encoding($false)
$results = New-Object 'System.Collections.Generic.List[string]'
$completed = $false
$lastObservation = $null

function Assert-JhTrue([bool]$Condition, [string]$Message) {
    if (!$Condition) { throw $Message }
}
function Assert-JhEqual($Actual, $Expected, [string]$Message) {
    if ($Actual -cne $Expected) { throw ($Message + ' (expected=' + $Expected + '; actual=' + $Actual + ')') }
}
function Read-JhFixtureText([string]$Path) {
    $bytes = [IO.File]::ReadAllBytes($Path)
    # cmd /u redirects its built-in output as UTF-16LE without a BOM.
    if ($bytes.Length -ge 2 -and $bytes[1] -eq 0) { return [Text.Encoding]::Unicode.GetString($bytes) }
    return [IO.File]::ReadAllText($Path, [Text.Encoding]::UTF8)
}
function Get-JhNewReports($Fixture) {
    return @(Get-ChildItem -LiteralPath $Fixture.Root -Filter RESULT.txt -File -Recurse | Where-Object {
        !($Fixture.OriginalResult -and $_.FullName -eq (Join-Path $Fixture.Kit 'RESULT.txt'))
    })
}
function New-JhFixture([string]$Name, [string]$Mode = 'success', [switch]$WithoutPowerShell, [string]$Fault = '') {
    $root = Join-Path $testRoot $Name
    $kit = Join-Path $root 'kit'
    $temp = Join-Path $root 'temp'
    $local = Join-Path $root 'local'
    $system = Join-Path $root 'synthetic-windows'
    foreach ($directory in @($kit, $temp, (Join-Path $local 'Temp'), $system)) {
        [void][IO.Directory]::CreateDirectory($directory)
    }
    $text = $entryText
    if ($Fault -eq 'pushd') {
        $anchor = 'pushd "%JH_KIT%" 2>nul'
        Assert-JhEqual ([regex]::Matches($text, [regex]::Escape($anchor)).Count) 1 'pushd fault anchor must be unique'
        $text = $text.Replace($anchor, 'pushd "%JH_BOOTSTRAP_FAULT_PATH%" 2>nul')
    } elseif ($Fault -eq 'report-base') {
        $anchor = 'set "JH_REPORT_BASE=%JH_KIT%"'
        Assert-JhEqual ([regex]::Matches($text, [regex]::Escape($anchor)).Count) 1 'report-base fault anchor must be unique'
        $text = $text.Replace($anchor, 'set "JH_REPORT_BASE=%JH_KIT%report-base-is-a-file"')
        [IO.File]::WriteAllText((Join-Path $kit 'report-base-is-a-file'), 'fixture: not a directory', $utf8)
    } elseif ($Fault) { throw 'Unsupported fixture fault.' }
    [IO.File]::WriteAllText((Join-Path $kit $entryName), $text, [Text.Encoding]::ASCII)
    foreach ($name in $requiredNames) {
        [IO.File]::WriteAllText((Join-Path $kit $name), 'fixture only: this file must never be executed', $utf8)
    }
    [IO.File]::WriteAllText((Join-Path $kit 'bootstrap-fixture-mode.txt'), $Mode, $utf8)
    [IO.File]::WriteAllText((Join-Path $kit 'existing.apk'), 'fixture-existing-apk-must-be-preserved', $utf8)
    if (!$WithoutPowerShell) {
        $psDirectory = Join-Path $system 'System32\WindowsPowerShell\v1.0'
        [void][IO.Directory]::CreateDirectory($psDirectory)
        [IO.File]::Copy($stubPath, (Join-Path $psDirectory 'powershell.exe'), $false)
    }
    return [pscustomobject]@{ Root=$root; Kit=$kit; Temp=$temp; Local=$local; System=$system; OriginalResult=$false }
}
function Invoke-JhFixture($Fixture, [hashtable]$ExtraEnvironment = @{}) {
    $start = New-Object Diagnostics.ProcessStartInfo
    $start.FileName = $realCmd
    # Expand the entry variable once; do not embed percent-bearing paths in /c text.
    $start.Arguments = '/d /u /c ""%JH_BOOTSTRAP_ENTRY%""'
    $start.WorkingDirectory = $Fixture.Root
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardInput = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $start.StandardOutputEncoding = [Text.Encoding]::Unicode
    $start.StandardErrorEncoding = [Text.Encoding]::Unicode
    $start.EnvironmentVariables['JH_BOOTSTRAP_ENTRY'] = Join-Path $Fixture.Kit $entryName
    $start.EnvironmentVariables['JH_BOOTSTRAP_FAULT_PATH'] = Join-Path $Fixture.Root 'absent-target-folder'
    $start.EnvironmentVariables['SystemRoot'] = $Fixture.System
    $start.EnvironmentVariables['TEMP'] = $Fixture.Temp
    $start.EnvironmentVariables['TMP'] = $Fixture.Temp
    $start.EnvironmentVariables['LOCALAPPDATA'] = $Fixture.Local
    foreach ($key in $ExtraEnvironment.Keys) { $start.EnvironmentVariables[$key] = [string]$ExtraEnvironment[$key] }
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $start
    try {
        [void]$process.Start()
        $process.StandardInput.Close()
        $stdout = $process.StandardOutput.ReadToEndAsync()
        $stderr = $process.StandardError.ReadToEndAsync()
        if (!$process.WaitForExit(15000)) { $process.Kill(); throw 'Synthetic bootstrap exceeded 15 seconds.' }
        $process.WaitForExit()
        $observed = [pscustomobject]@{ ExitCode=$process.ExitCode; Output=$stdout.Result; Error=$stderr.Result }
    } finally { $process.Dispose() }
    Assert-JhEqual ([IO.File]::ReadAllText((Join-Path $Fixture.Kit 'existing.apk'), $utf8)) 'fixture-existing-apk-must-be-preserved' 'Existing APK changed'
    $script:lastObservation = $observed
    return $observed
}
function Assert-JhBlocked($Fixture, $Observed, [string]$Reason) {
    Assert-JhEqual $Observed.ExitCode 1 ('Expected bootstrap block: ' + $Reason)
    Assert-JhTrue (!(Test-Path -LiteralPath (Join-Path $Fixture.Kit 'bootstrap-stub-invoked.txt'))) 'A pre-dispatch block launched the stub'
    $reports = @(Get-JhNewReports $Fixture)
    Assert-JhEqual $reports.Count 1 'Expected one new bootstrap report'
    $body = Read-JhFixtureText $reports[0].FullName
    Assert-JhTrue ($body.Contains('STATUS: BLOCKED')) 'Block was not reported'
    Assert-JhTrue ($body.Contains('POWERSHELL_DISPATCHED: FALSE')) 'Dispatch was misreported'
    Assert-JhTrue ($body.Contains('DEVICE_INSTALL_ATTEMPTED: FALSE')) 'Pre-dispatch device status was not explicit'
    Assert-JhTrue ($body.Contains('REASON: ' + $Reason)) 'Block reason is missing'
    Assert-JhTrue ($Observed.Output.Contains($reports[0].FullName)) 'Actual saved path was not printed'
}
function Assert-JhOnce($Fixture) {
    $calls = @([IO.File]::ReadAllLines((Join-Path $Fixture.Kit 'bootstrap-stub-invoked.txt')))
    Assert-JhEqual $calls.Count 1 'PowerShell was dispatched more than once'
}
function Assert-JhUnknown($Fixture, $Observed, [string]$Reason) {
    Assert-JhEqual $Observed.ExitCode 2 'Post-dispatch uncertainty must exit with UNKNOWN'
    Assert-JhOnce $Fixture
    $reports = @(Get-JhNewReports $Fixture | Where-Object { (Read-JhFixtureText $_.FullName).Contains('JH168 FIX16 - BOOTSTRAP REPORT') })
    Assert-JhEqual $reports.Count 1 'Expected one new UNKNOWN report'
    $body = Read-JhFixtureText $reports[0].FullName
    Assert-JhTrue ($body.Contains('STATUS: UNKNOWN')) 'Post-dispatch failure was not UNKNOWN'
    Assert-JhTrue ($body.Contains('POWERSHELL_DISPATCHED: TRUE')) 'Dispatch state was lost'
    Assert-JhTrue ($body.Contains('DEVICE_INSTALL_ATTEMPTED: UNKNOWN')) 'Possible device action was not preserved as unknown'
    Assert-JhTrue (!$body.Contains('DEVICE_INSTALL_ATTEMPTED: FALSE')) 'Post-dispatch failure falsely claimed no device action'
    Assert-JhTrue ($body.Contains('REASON: ' + $Reason)) 'UNKNOWN reason is missing'
    Assert-JhTrue ($body.Contains('AUTO_RETRY: FORBIDDEN')) 'Retry prohibition is missing'
    Assert-JhTrue ($Observed.Output.Contains($reports[0].FullName)) 'Actual UNKNOWN report path was not printed'
}
function Pass-JhCase([string]$Name) {
    $results.Add($Name)
    Write-Host ('PASS ' + $Name)
}

try {
    # This fixture executable only writes fixture reports and an invocation counter.
    # Compilation happens in the test harness, never in the product bootstrap.
    $stubPath = Join-Path $testRoot 'synthetic-powershell.exe'
    $stubSource = @'
using System;
using System.IO;
using System.Text;
public static class JhBootstrapStub {
    public static int Main(string[] args) {
        Console.OutputEncoding = new UnicodeEncoding(false, false);
        string kit = Environment.CurrentDirectory;
        string calls = Path.Combine(kit, "bootstrap-stub-invoked.txt");
        File.AppendAllText(calls, "called\r\n", new UTF8Encoding(false));
        string mode = File.ReadAllText(Path.Combine(kit, "bootstrap-fixture-mode.txt")).Trim();
        if (mode == "no-result") return 0;
        if (mode == "failure") return 7;
        if (mode == "fallback") {
            string folder = Path.Combine(Environment.GetEnvironmentVariable("TEMP"), "JH-STUB-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(folder);
            string report = Path.Combine(folder, "RESULT.txt");
            using (var stream = new FileStream(report, FileMode.CreateNew, FileAccess.Write))
            using (var writer = new StreamWriter(stream, new UTF8Encoding(false))) {
                writer.WriteLine("FIXTURE_ONLY: fallback saved; no real PowerShell or APK action");
            }
            Console.WriteLine("RESULT_PATH: \"" + report + "\"");
            return 20;
        }
        string rootReport = Path.Combine(kit, "RESULT.txt");
        using (var stream = new FileStream(rootReport, FileMode.CreateNew, FileAccess.Write))
        using (var writer = new StreamWriter(stream, new UTF8Encoding(false))) {
            writer.WriteLine(mode == "result-then-failure"
                ? "FIXTURE_ONLY: partial report before failure"
                : "FIXTURE_ONLY: root report saved; no real PowerShell or APK action");
        }
        return mode == "result-then-failure" ? 9 : 0;
    }
}
'@
    Add-Type -TypeDefinition $stubSource -OutputAssembly $stubPath -OutputType ConsoleApplication

    foreach ($missing in $requiredNames) {
        $fixture = New-JhFixture -Name ('missing-' + $missing.Replace('.', '-'))
        Remove-Item -LiteralPath (Join-Path $fixture.Kit $missing)
        $observed = Invoke-JhFixture $fixture
        Assert-JhBlocked $fixture $observed ('REQUIRED_FILE_MISSING_' + $missing)
        Pass-JhCase ('missing required file: ' + $missing)
    }

    $fixture = New-JhFixture -Name 'powershell-missing' -WithoutPowerShell
    Assert-JhBlocked $fixture (Invoke-JhFixture $fixture) 'WINDOWS_POWERSHELL_MISSING'
    Pass-JhCase 'Windows PowerShell unavailable'

    # Deterministic filesystem fault injection changes one line of a disposable
    # entry copy. The production script has no test flags or environment bypass.
    $fixture = New-JhFixture -Name 'target-path-error' -Fault 'pushd'
    Assert-JhBlocked $fixture (Invoke-JhFixture $fixture) 'EXTRACTED_FOLDER_UNAVAILABLE'
    $report = @(Get-JhNewReports $fixture)[0]
    Assert-JhTrue ($report.FullName.StartsWith($fixture.Temp + '\', [StringComparison]::OrdinalIgnoreCase)) 'Unavailable target did not use a private TEMP fallback'
    Pass-JhCase 'pushd failure leaves a fallback report'

    $fixture = New-JhFixture -Name 'existing-result'
    $oldReport = Join-Path $fixture.Kit 'RESULT.txt'
    [IO.File]::WriteAllText($oldReport, 'existing-report-must-stay-byte-identical', $utf8)
    $before = [Convert]::ToBase64String([IO.File]::ReadAllBytes($oldReport))
    $fixture.OriginalResult = $true
    Assert-JhBlocked $fixture (Invoke-JhFixture $fixture) 'EXISTING_RESULT_PRESERVED_NO_REPLAY'
    Assert-JhEqual ([Convert]::ToBase64String([IO.File]::ReadAllBytes($oldReport))) $before 'Existing RESULT was overwritten'
    $report = @(Get-JhNewReports $fixture)[0]
    Assert-JhTrue ($report.FullName.StartsWith($fixture.Temp + '\', [StringComparison]::OrdinalIgnoreCase)) 'Existing RESULT did not select TEMP fallback'
    Pass-JhCase 'existing RESULT is preserved without dispatch'

    $fixture = New-JhFixture -Name 'root-report-unwritable' -Fault 'report-base'
    Remove-Item -LiteralPath (Join-Path $fixture.Kit 'ONECLICK.ps1')
    Assert-JhBlocked $fixture (Invoke-JhFixture $fixture) 'REQUIRED_FILE_MISSING_ONECLICK.ps1'
    $report = @(Get-JhNewReports $fixture)[0]
    Assert-JhTrue ($report.FullName.StartsWith($fixture.Temp + '\', [StringComparison]::OrdinalIgnoreCase)) 'Unavailable report directory did not select TEMP fallback'
    Pass-JhCase 'unavailable root report location falls back to TEMP'

    $fixture = New-JhFixture -Name 'all-report-locations-unavailable' -Fault 'report-base'
    Remove-Item -LiteralPath (Join-Path $fixture.Kit 'ONECLICK.ps1')
    $unwritable = Join-Path $fixture.Root 'not-a-directory'
    [IO.File]::WriteAllText($unwritable, 'fixture: not a directory', $utf8)
    $observed = Invoke-JhFixture $fixture @{ TEMP=$unwritable; TMP=$unwritable; LOCALAPPDATA=$unwritable }
    Assert-JhEqual $observed.ExitCode 1 'Report write failure must retain BLOCKED exit'
    Assert-JhEqual (@(Get-JhNewReports $fixture).Count) 0 'A report was falsely claimed at an unavailable location'
    Assert-JhTrue ($observed.Output.Contains('ERROR: RESULT_WRITE_FAILED.')) 'All-location write failure was not clearly printed'
    Assert-JhTrue ($observed.Output.Contains('No RESULT.txt was saved by the bootstrap.')) 'Missing report was not disclosed'
    Pass-JhCase 'all report locations unavailable is explicit'

    $fixture = New-JhFixture -Name 'stub-root-result'
    $observed = Invoke-JhFixture $fixture
    Assert-JhEqual $observed.ExitCode 0 'Saved root report did not retain the zero exit contract'
    Assert-JhOnce $fixture
    Assert-JhEqual (@(Get-JhNewReports $fixture).Count) 1 'Root success produced extra reports'
    Assert-JhTrue ($observed.Output.Contains((Join-Path $fixture.Kit 'RESULT.txt'))) 'Root result path was not printed'
    Pass-JhCase 'synthetic PowerShell returns one current root report'

    $fixture = New-JhFixture -Name 'stub-fallback' -Mode 'fallback'
    $observed = Invoke-JhFixture $fixture
    Assert-JhEqual $observed.ExitCode 20 'Saved fallback report did not retain code 20'
    Assert-JhOnce $fixture
    $reports = @(Get-JhNewReports $fixture)
    Assert-JhEqual $reports.Count 1 'Code 20 generated a second bootstrap report'
    Assert-JhTrue ($observed.Output.Contains($reports[0].FullName)) 'Stub fallback report path was not retained'
    Assert-JhTrue (!(Test-Path -LiteralPath (Join-Path $fixture.Kit 'RESULT.txt'))) 'Fallback case created an unexpected root RESULT'
    Pass-JhCase 'code 20 retains the one fallback report'

    $fixture = New-JhFixture -Name 'zero-without-result' -Mode 'no-result'
    Assert-JhUnknown $fixture (Invoke-JhFixture $fixture) 'POWERSHELL_RETURNED_WITHOUT_RESULT'
    Pass-JhCase 'zero exit without a result remains UNKNOWN'

    $fixture = New-JhFixture -Name 'post-dispatch-failure' -Mode 'failure'
    Assert-JhUnknown $fixture (Invoke-JhFixture $fixture) 'POWERSHELL_FAILED_OR_INTERRUPTED'
    Pass-JhCase 'post-dispatch failure remains UNKNOWN'

    $fixture = New-JhFixture -Name 'partial-result-then-failure' -Mode 'result-then-failure'
    Assert-JhUnknown $fixture (Invoke-JhFixture $fixture) 'POWERSHELL_FAILED_OR_INTERRUPTED'
    Assert-JhEqual ([IO.File]::ReadAllText((Join-Path $fixture.Kit 'RESULT.txt'), $utf8).Trim()) 'FIXTURE_ONLY: partial report before failure' 'Partial result was overwritten'
    Assert-JhEqual (@(Get-JhNewReports $fixture).Count) 2 'Partial result and separate UNKNOWN report were not preserved'
    Pass-JhCase 'partial report remains intact beside UNKNOWN fallback'

    $hangul = ([string][char]0xD55C) + ([string][char]0xAE00)
    $fixture = New-JhFixture -Name ('space ' + $hangul + ' %JH_LITERAL_SEGMENT% ! (folder)')
    $observed = Invoke-JhFixture $fixture @{ JH_LITERAL_SEGMENT='must-not-expand' }
    Assert-JhEqual $observed.ExitCode 0 'Literal space/Hangul/percent/exclamation path was corrupted'
    Assert-JhOnce $fixture
    Assert-JhTrue ($observed.Output.Contains((Join-Path $fixture.Kit 'RESULT.txt'))) 'Exact non-ASCII/percent path was not printed'
    Pass-JhCase 'spaces Hangul percent and exclamation remain literal'

    $completed = $true
    Write-Host ('PASS Test-JhBootstrap: ' + $results.Count + ' effect-free Windows CMD scenarios; real APK actions NOT_RUN.')
} catch {
    if ($lastObservation) {
        Write-Host ('Last synthetic CMD stdout: ' + $lastObservation.Output)
        Write-Host ('Last synthetic CMD stderr: ' + $lastObservation.Error)
    }
    throw
} finally {
    if ($completed) {
        Remove-Item -LiteralPath $testRoot -Recurse -Force
    } else {
        Write-Host ('FAILED fixture evidence retained at: ' + $testRoot)
    }
}
