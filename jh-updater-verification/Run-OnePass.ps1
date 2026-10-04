#requires -Version 5.1
param([Parameter(Mandatory=$true)][string]$OutputDirectory)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$mutex = New-Object System.Threading.Mutex -ArgumentList $false, 'Local\JHMCP-ONEPASS-INSTALL'
$owned = $false
try {
    try { $owned = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $owned = $true }
    if (!$owned) { throw 'Another JH updater is already running. Close neither process forcibly.' }
    $id = (Get-Date).ToString('yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0,8)
    $results = Join-Path $OutputDirectory ('JH-FIX10-result-' + $id)
    [void](New-Item -ItemType Directory -Path $results)
    . (Join-Path $PSScriptRoot 'JH.Update.Core.ps1')
    $rc = Invoke-JhUpdate -Bundle $PSScriptRoot -Results $results
    Write-Host ('Result: ' + (Join-Path $results 'result.json'))
    exit $rc
} catch {
    Write-Host ('[STOP] ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
} finally {
    if ($owned) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
