param([Parameter(Mandatory = $true)][string]$KitRoot, [Parameter(Mandatory = $true)][string]$EvidencePath)
Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1 -or $PSVersionTable.PSEdition -cne 'Desktop') { throw 'WINDOWS_POWERSHELL_51_REQUIRED' }
$KitRoot = [IO.Path]::GetFullPath($KitRoot)
$work = Join-Path ([IO.Path]::GetTempPath()) ('jebiseo-utf8-' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($work) | Out-Null
$savedLocalAppData = $env:LOCALAPPDATA
$savedTemp = $env:TEMP
$savedTmp = $env:TMP
$env:LOCALAPPDATA = Join-Path $work 'local'
$env:TEMP = Join-Path $work 'temp'
$env:TMP = $env:TEMP
[IO.Directory]::CreateDirectory($env:TEMP) | Out-Null
$previousEncoding = [Console]::OutputEncoding
$allocatedConsole = $false
$consoleReady = $false
$checks = [Collections.Generic.List[string]]::new()
function Assert-Transport([bool]$Condition, [string]$Name) {
    if (!$Condition) { throw ('TRANSPORT_TEST_FAILED: ' + $Name) }
    $checks.Add($Name)
}
try {
    . (Join-Path $KitRoot 'RUN.ps1')
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class JebiseoTransportConsoleFixture {
    [DllImport("kernel32.dll", SetLastError=true)] public static extern uint GetConsoleOutputCP();
    [DllImport("kernel32.dll", SetLastError=true)] public static extern bool AllocConsole();
    [DllImport("kernel32.dll", SetLastError=true)] public static extern bool FreeConsole();
    [DllImport("kernel32.dll", SetLastError=true)] public static extern IntPtr GetStdHandle(int id);
    [DllImport("kernel32.dll", SetLastError=true)] public static extern bool SetStdHandle(int id, IntPtr handle);
}
'@
    # A headless CI child may have no console. Allocate only this test process's
    # console, preserving its redirected output handles, so .NET's real default
    # decoder can be exercised under CP949 without changing the system locale.
    if ([JebiseoTransportConsoleFixture]::GetConsoleOutputCP() -eq 0) {
        $savedHandles = @{}
        foreach ($id in @(-10, -11, -12)) { $savedHandles[$id] = [JebiseoTransportConsoleFixture]::GetStdHandle($id) }
        if (![JebiseoTransportConsoleFixture]::AllocConsole()) { throw 'TEST_CONSOLE_ALLOCATION_FAILED' }
        $allocatedConsole = $true
        foreach ($id in @(-10, -11, -12)) {
            $handle = $savedHandles[$id]
            if ($handle -ne [IntPtr]::Zero -and $handle.ToInt64() -ne -1) {
                if (![JebiseoTransportConsoleFixture]::SetStdHandle($id, $handle)) { throw 'TEST_PIPE_RESTORE_FAILED' }
            }
        }
    }
    $consoleReady = $true
    [Console]::OutputEncoding = [Text.Encoding]::GetEncoding(949)
    Assert-Transport ([Console]::OutputEncoding.CodePage -eq 949 -and [JebiseoTransportConsoleFixture]::GetConsoleOutputCP() -eq 949) 'actual_dotnet_console_default_is_cp949'

    $emitter = Join-Path $work 'raw UTF8 bytes & 100%.exe'
    Add-Type -TypeDefinition @'
using System;
using System.IO;
public class JebiseoRawPhoneByteFixture {
    public static int Main(string[] args) {
        string file;
        bool stderr = false;
        if (args.Length == 5 && args[0] == "-s" && args[2] == "shell" && args[3] == "cat" && args[4] == "/sdcard/Download/JebiseoLab/RESULT_PHONE.json") {
            file = Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"PHONE_BYTES.json");
        } else if (args.Length == 2 && (args[0] == "stdout" || args[0] == "stderr")) {
            file = args[1]; stderr = args[0] == "stderr";
        } else { return 2; }
        byte[] bytes = File.ReadAllBytes(file);
        Stream output = stderr ? Console.OpenStandardError() : Console.OpenStandardOutput();
        output.Write(bytes,0,bytes.Length); output.Flush();
        return 0;
    }
}
'@ -OutputAssembly $emitter -OutputType ConsoleApplication | Out-Null
    $expectedReport = "이번 시험 요약`n코드: GEMINI_SURFACE_UNVERIFIED`n개인 결과 저장: 실패 / DIR_OPEN / OTHER`nGemini 입력칸 진단`n제목 텍스트 일치: 0 / 설정된 입력칸 일치: 1`n한글 확인 ""따옴표"" \ 경로 " + [char]::ConvertFromUtf32(0x1F50D)
    $runId = '0123456789abcdef0123456789abcdef'
    $record = [ordered]@{ schema = 'jebiseo.phone-result.v1'; launchId = $runId; mode = 'probe'; recordedAt = '2026-11-06T00:00:00Z'; status = 'blocked'; code = 'GEMINI_SURFACE_UNVERIFIED'; reportText = $expectedReport }
    $json = $record | ConvertTo-Json
    Assert-Transport ($json.Contains('이번 시험 요약')) 'fixture_contains_unescaped_utf8_korean'
    $fixture = Join-Path $work 'PHONE_BYTES.json'
    Write-JebNewText $fixture $json
    $assets = [pscustomobject]@{ adbFullPath = $emitter }

    # Negative control: this is the pre-fix invocation with no decoder override.
    $legacy = Invoke-JebProcess $emitter @('stdout', $fixture) 10000
    $legacyRecord = ConvertFrom-JebPhoneResult $legacy.Text $runId 'probe'
    $expectedLegacy = [Text.Encoding]::GetEncoding(949).GetString([IO.File]::ReadAllBytes($fixture)).Trim()
    $legacyJsonAccepted = $null -ne $legacyRecord
    $legacyDiagnostic = [ordered]@{ consoleCodePage = [Console]::OutputEncoding.CodePage; exitCode = $legacy.ExitCode; timedOut = $legacy.TimedOut; codeUnits = $legacy.Text.Length; expectedCp949CodeUnits = $expectedLegacy.Length; matchesCp949Decoder = ($legacy.Text -ceq $expectedLegacy); equalsUtf8Json = ($legacy.Text -ceq $json); jsonAccepted = $legacyJsonAccepted }
    Write-Host ('TRANSPORT_LEGACY_DIAGNOSTIC=' + ($legacyDiagnostic | ConvertTo-Json -Compress))
    # CP949 can also consume a JSON escape or delimiter next to a multibyte
    # sequence. Corruption is the invariant; parsing the corrupted envelope is
    # not required for every fixture containing quotes, backslashes and emoji.
    Assert-Transport ($legacy.ExitCode -eq 0 -and $legacy.Text -ceq $expectedLegacy -and $legacy.Text -cne $json) 'legacy_cp949_matches_wrong_decoder_and_corrupts_utf8_json'

    $fixed = Invoke-JebAdb $assets @('stdout', $fixture) 10000
    Assert-Transport ($fixed.ExitCode -eq 0 -and $fixed.Text -ceq $json) 'adb_stdout_decodes_exact_utf8_under_cp949'
    $errorText = '한글 오류 경로: 진단 전용'
    $errorFixture = Join-Path $work 'stderr.txt'; Write-JebNewText $errorFixture $errorText
    $errorAnswer = Invoke-JebAdb $assets @('stderr', $errorFixture) 10000
    Assert-Transport ($errorAnswer.ExitCode -eq 0 -and $errorAnswer.Text -ceq $errorText) 'adb_stderr_decodes_exact_utf8_under_cp949'
    $invalidFixture = Join-Path $work 'invalid-utf8.bin'; [IO.File]::WriteAllBytes($invalidFixture, [byte[]]@(0xC3, 0x28))
    $invalid = Invoke-JebAdb $assets @('stdout', $invalidFixture) 10000
    Assert-Transport ($invalid.ExitCode -eq -9001 -and $invalid.Text -ceq '') 'invalid_utf8_is_rejected_without_replacement_text'

    $phone = Wait-JebPhoneResult $assets 'SYNTHETIC_PHONE' $runId 'probe' 0
    Assert-Transport ($null -ne $phone -and $phone.reportText -ceq $expectedReport -and $phone.code -ceq $record.code) 'actual_poll_and_json_conversion_preserve_unicode'
    $state = New-JebState $runId
    $state.status = 'PHONE_RESULT_RECEIVED'; $state.mode = 'probe'; $state.phoneStatus = $phone.status; $state.phoneCode = $phone.code; $state.phoneReport = $phone.reportText
    $handoff = Join-Path $work 'handoff.json'
    $saved = Save-JebResult $work (Join-Path $work 'results') $runId $handoff $state
    $strictUtf8 = [Text.UTF8Encoding]::new($false, $true)
    $stored = [IO.File]::ReadAllText($state.resultJsonPath, $strictUtf8) | ConvertFrom-Json
    $text = [IO.File]::ReadAllText($state.resultPath, $strictUtf8)
    Assert-Transport ($saved -and $stored.phoneReport -ceq $expectedReport -and $text.Contains($expectedReport) -and $text.Contains('제비서 독립 시험 결과')) 'utf8_result_json_and_text_preserve_exact_report'
    $verifier = Invoke-JebProcess (Join-Path $PSHOME 'powershell.exe') @('-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $KitRoot 'Confirm-Result.ps1'), '-RunId', $runId, '-Handoff', $handoff) 15000
    Assert-Transport ($verifier.ExitCode -eq 0) 'actual_powershell_verifier_accepts_unicode_result_hashes'
    $evidence = [ordered]@{ schema = 'jebiseo.windows.utf8-transport-tests.v1'; passed = $checks.Count; cases = $checks.ToArray(); powershell = $PSVersionTable.PSVersion.ToString(); consoleCodePage = 949; legacyCorruptionReproduced = $true; legacyDiagnostic = $legacyDiagnostic; exactUnicodeReportPreserved = $true; originalSystemLocaleChanged = $false; realNativeByteEmitter = $true; realAdb = 0; realPhone = 0; realInstall = 0 }
    Write-JebNewText $EvidencePath ($evidence | ConvertTo-Json -Depth 4)
} finally {
    try { if ($consoleReady) { [Console]::OutputEncoding = $previousEncoding } }
    finally {
        if ($allocatedConsole) { [JebiseoTransportConsoleFixture]::FreeConsole() | Out-Null }
        $env:LOCALAPPDATA = $savedLocalAppData
        $env:TEMP = $savedTemp
        $env:TMP = $savedTmp
        if (Test-Path -LiteralPath $work) { Remove-Item -LiteralPath $work -Recurse -Force }
    }
}
