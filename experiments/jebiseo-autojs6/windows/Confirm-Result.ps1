param([Parameter(Mandatory = $true)][string]$RunId, [Parameter(Mandatory = $true)][string]$Handoff)
Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
function Get-JebResultSha([string]$Path) {
    $stream = [IO.File]::OpenRead($Path)
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
    finally { $algorithm.Dispose(); $stream.Dispose() }
}
try {
    if ($RunId -cnotmatch '^[0-9a-f]{32}$' -or !(Test-Path -LiteralPath $Handoff -PathType Leaf) -or (Get-Item -LiteralPath $Handoff).Length -gt 65536) { throw 'Invalid current handoff' }
    $pointer = Get-Content -LiteralPath $Handoff -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($pointer.schema -cne 'jebiseo.windows.handoff.v1' -or $pointer.runId -cne $RunId) { throw 'Unrelated handoff' }
    foreach ($path in @($pointer.resultJsonPath, $pointer.resultPath)) {
        if (!(Test-Path -LiteralPath $path -PathType Leaf) -or (Get-Item -LiteralPath $path).Length -gt 1048576) { throw 'Missing current result' }
    }
    if ((Get-JebResultSha $pointer.resultJsonPath) -cne $pointer.resultJsonSha256 -or (Get-JebResultSha $pointer.resultPath) -cne $pointer.resultSha256) { throw 'Changed current result' }
    $result = Get-Content -LiteralPath $pointer.resultJsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($result.schema -cne 'jebiseo.windows.result.v1' -or $result.runId -cne $RunId -or $result.resultPath -cne $pointer.resultPath -or $result.resultJsonPath -cne $pointer.resultJsonPath) { throw 'Unrelated current result' }
    Write-Host ('RESULT_FILE=' + $pointer.resultPath)
    Write-Host ('STATUS=' + $result.status)
    exit 0
} catch {
    Write-Host 'CURRENT_RESULT_NOT_VERIFIED. Do not automatically retry an installation or launch.'
    exit 1
}
