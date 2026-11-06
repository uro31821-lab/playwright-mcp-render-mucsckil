# Windows PowerShell 5.1 entry point. No arbitrary command/payload overrides.
param(
    [Parameter(Mandatory=$true)][string]$RunId,
    [Parameter(Mandatory=$true)][string]$Handoff
)
$ErrorActionPreference='Stop'
$Root=Split-Path -Parent $PSScriptRoot
# Managed build-finalization pin; zero is deliberately non-executable.
$PinnedReleaseSha='5b92b7aa743911726a7f69b756fe1a6a44fc32b892f0cf05076ba9e01ea36cdb'
. (Join-Path $PSScriptRoot 'JH-Ebiseo-InstallCore.ps1')
$result=Invoke-JhPrebuiltInstall -Root $Root -RunId $RunId -Handoff $Handoff -PinnedReleaseSha $PinnedReleaseSha
Write-Host ('STATUS: '+$result.status)
Write-Host ('RUN_ID: '+$RunId)
if ($result.status -in @('ALREADY_INSTALLED_VERIFIED','INSTALLED_VERIFIED_DEVICE_BEHAVIOR_NOT_RUN','PREPARED_NOT_INSTALLED')) { exit 0 }
exit 1
