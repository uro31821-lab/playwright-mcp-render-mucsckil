#requires -Version 5.1
param([Parameter(Mandatory=$true)][string]$RunId)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$kit=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$helper=Join-Path $PSScriptRoot 'JH-RUN-SAFETY.ps1'
$safetyHash='a7c6c5f45c92e65453cb7dd682bbf46d634e846404e309633fa5b713a00127f0'
try {
    if(-not [IO.File]::Exists($helper) -or
       (Get-FileHash -LiteralPath $helper -Algorithm SHA256).Hash.ToLowerInvariant() -cne $safetyHash){throw 'RESULT_HELPER_UNTRUSTED'}
    . $helper
    $id=Get-JhRunId $RunId
    $paths=@(Get-JhResultPaths $kit $id)
    for($index=0;$index -lt $paths.Count;$index++){
        try {
            $report=Read-JhRunResult -Kit $kit -RunId $id -ReportPath $paths[$index] -Kind 'INSTALLER'
            Write-Host ('CURRENT_RUN_ID: '+$id)
            Write-Host ('STATUS: '+$report.Status)
            Write-Host ('ANDROID_INSTALL_ATTEMPT_COUNT: '+$report.AttemptCount)
            Write-Host ('RESULT_PATH: '+$report.ReportPath)
            Write-Host ('RESULT_FALLBACK_USED: '+($index -gt 0).ToString().ToUpperInvariant())
            exit (Get-JhOutcomeExitCode $report.Status)
        }catch{}
    }
    throw 'CURRENT_RUN_RESULT_NOT_VERIFIED'
}catch{
    Write-Host 'CURRENT_RUN_RESULT_NOT_VERIFIED: preserve the existing report; installation may be unconfirmed.'
    exit 11
}
