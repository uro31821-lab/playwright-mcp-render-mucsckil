param(
    [Parameter(Mandatory=$true)][string]$RunId,
    [Parameter(Mandatory=$true)][string]$Handoff
)
$ErrorActionPreference='Stop'
try {
    if ($RunId -notmatch '^[0-9a-f]{32}$' -or !(Test-Path -LiteralPath $Handoff -PathType Leaf)) { throw 'MISSING_CURRENT_RESULT' }
    $pointer=Get-Content -LiteralPath $Handoff -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($pointer.runId -cne $RunId -or $pointer.reportKind -cne 'JH_EBISEO_PREBUILT_INSTALL_RESULT_V1') { throw 'WRONG_CURRENT_RESULT' }
    if (!(Test-Path -LiteralPath $pointer.resultPath -PathType Leaf)) { throw 'RESULT_FILE_MISSING' }
    $digest=(Get-FileHash -LiteralPath $pointer.resultPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($digest -cne $pointer.resultSha256) { throw 'RESULT_HASH_MISMATCH' }
    $report=Get-Content -LiteralPath $pointer.resultPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($report.runId -cne $RunId -or $report.reportKind -cne $pointer.reportKind) { throw 'STALE_RESULT' }
    Write-Host ('RESULT_PATH: '+$pointer.resultPath)
    Write-Host ('STATUS: '+$report.status)
    exit 0
} catch {
    Write-Host 'UNKNOWN: current PowerShell result could not be verified. Do not automatically retry.'
    exit 1
}
