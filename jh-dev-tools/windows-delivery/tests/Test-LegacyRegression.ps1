param([Parameter(Mandatory=$true)][string]$LegacyRoot)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2
$legacyScript = Join-Path ([IO.Path]::GetFullPath($LegacyRoot)) 'SIGN-UPDATE-FIX16.ps1'
$expectedHash = 'b3a00110bbf8363016265578fe2e2bd907f3cf3927d70214f7e6fe2921fa22a2'
if ((Get-FileHash -LiteralPath $legacyScript -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash) { throw 'Historical fixture hash changed' }
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('jh-legacy-cleanup-' + [Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($testRoot) | Out-Null
$reproduced = 0
try {
    foreach ($name in @('JH168-FIX16-SIGNED.apk', '.JH168-FIX16-ALIGNED.tmp.apk')) {
        $caseRoot = Join-Path $testRoot ([Guid]::NewGuid().ToString('N'))
        [IO.Directory]::CreateDirectory($caseRoot) | Out-Null
        $scriptPath = Join-Path $caseRoot 'SIGN-UPDATE-FIX16.ps1'
        [IO.File]::Copy($legacyScript, $scriptPath, $false)
        $existingPath = Join-Path $caseRoot $name
        [IO.File]::WriteAllText($existingPath, 'SYNTHETIC REGRESSION FILE - NOT AN APK')
        $sentinelPath = Join-Path $caseRoot 'unrelated.bin'
        [IO.File]::WriteAllText($sentinelPath, 'keep-this-synthetic-sentinel')
        # The pinned original throws before SDK/key/device work because this output exists.
        $outPath = Join-Path $caseRoot 'stdout.txt'
        $errPath = Join-Path $caseRoot 'stderr.txt'
        $process = Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',('"' + $scriptPath + '"')) -Wait -PassThru -RedirectStandardOutput $outPath -RedirectStandardError $errPath
        if ($process.ExitCode -ne 0) { throw 'Historical fixture did not reach its expected caught-error path' }
        $report = [IO.File]::ReadAllText((Join-Path $caseRoot 'RESULT.txt'))
        if ($report -notmatch '(?m)^STOP_REASON: (SIGNED_OUTPUT_ALREADY_EXISTS_NO_OVERWRITE|ALIGNED_TEMP_ALREADY_EXISTS_NO_OVERWRITE)\r?$') { throw 'Historical fixture reached an unexpected path' }
        if ($report -notmatch '(?m)^DEVICE_INSTALL_ATTEMPTED: FALSE\r?$') { throw 'Unexpected historical fixture activity' }
        if ([IO.File]::Exists($existingPath)) { throw 'Expected historical cleanup defect was not reproduced' }
        if ([IO.File]::ReadAllText($sentinelPath) -ne 'keep-this-synthetic-sentinel') { throw 'Unrelated fixture file changed' }
        $reproduced++
    }
    Write-Output ('JH_LEGACY_CLEANUP_REPRODUCED=' + $reproduced)
    Write-Output 'SCOPE=owned temporary fixture files only; no signing, build or device action'
} finally {
    if ([IO.Directory]::Exists($testRoot)) { [IO.Directory]::Delete($testRoot, $true) }
}
