param([Parameter(Mandatory=$true)][string]$KitRoot)
$ErrorActionPreference='Stop'
if($env:OS -ne 'Windows_NT'){throw 'These file/lock/process checks require Windows PowerShell.'}
$KitRoot=(Resolve-Path -LiteralPath $KitRoot).Path
$TestRoot=Join-Path ([IO.Path]::GetTempPath()) ('JH-RunSafety-'+[guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($TestRoot)
$OldLocalAppData=$env:LOCALAPPDATA
$OldUserProfile=$env:USERPROFILE
$env:LOCALAPPDATA=Join-Path $TestRoot 'LocalAppData'
$env:USERPROFILE=Join-Path $TestRoot 'UserProfile'
[void][IO.Directory]::CreateDirectory($env:LOCALAPPDATA)
[void][IO.Directory]::CreateDirectory($env:USERPROFILE)
$Passed=0
. (Join-Path $KitRoot 'JH-RUN-SAFETY.ps1')

function Assert-JhSafety([bool]$Condition,[string]$Message){if(!$Condition){throw $Message}}
function Assert-JhSafetyThrows([scriptblock]$Body){
    $threw=$false
    try {$null=& $Body} catch {$threw=$true}
    if(!$threw){throw 'Expected rejection did not occur.'}
}
function Invoke-JhSafetyTest([string]$Name,[scriptblock]$Body){
    & $Body
    $script:Passed++
    Write-Host ('PASS: '+$Name)
}
function Get-JhTestHash([string]$Path){return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()}
function New-JhSafetyKit([string]$Name){
    $path=Join-Path $TestRoot $Name
    [void][IO.Directory]::CreateDirectory($path)
    foreach($name in @('ONECLICK.ps1','SIGN-UPDATE-FIX16.ps1','JH-RUN-SAFETY.ps1')){
        Copy-Item -LiteralPath (Join-Path $KitRoot $name) -Destination (Join-Path $path $name)
    }
    return $path
}
function Invoke-JhRejectedSigner([string]$Path,[string]$Id){
    # Every caller supplies a pre-existing output or holds the run lock. The
    # isolated LOCALAPPDATA also has no build workspace, SDK or source artifacts.
    $items=@(& (Join-Path $Path 'SIGN-UPDATE-FIX16.ps1') -RunId $Id)
    Assert-JhSafety ($items.Count -eq 1) 'Signer did not return exactly one receipt.'
    $receipt=$items[0]
    Assert-JhSafety ($receipt.RunId -ceq $Id -and $receipt.ResultSaved -eq $true) 'Current-run signer receipt missing.'
    Assert-JhSafety ($receipt.AttemptCount -eq 0) 'An early rejected signer must record zero install attempts.'
    $read=Read-JhRunResult -Kit $Path -RunId $Id -ReportPath $receipt.ReportPath -Kind 'SIGNER'
    Assert-JhSafety ($read.AttemptCount -eq 0 -and $read.Status -ceq 'STOPPED_NO_DEVICE_CHANGE') 'Rejected signer result is inaccurate.'
    return $receipt
}

try {
    Invoke-JhSafetyTest 'Windows parser and helper/signer hash bindings' {
        foreach($name in @('ONECLICK.ps1','SIGN-UPDATE-FIX16.ps1','JH-RUN-SAFETY.ps1','FIX16-APPLY.ps1')){
            $tokens=$null;$parseErrors=$null
            $null=[Management.Automation.Language.Parser]::ParseFile((Join-Path $KitRoot $name),[ref]$tokens,[ref]$parseErrors)
            Assert-JhSafety (!$parseErrors -or $parseErrors.Count -eq 0) ('PowerShell syntax failure: '+$name)
        }
        $helperHash=Get-JhTestHash (Join-Path $KitRoot 'JH-RUN-SAFETY.ps1')
        $signerHash=Get-JhTestHash (Join-Path $KitRoot 'SIGN-UPDATE-FIX16.ps1')
        $signer=[IO.File]::ReadAllText((Join-Path $KitRoot 'SIGN-UPDATE-FIX16.ps1'))
        $oneclick=[IO.File]::ReadAllText((Join-Path $KitRoot 'ONECLICK.ps1'))
        Assert-JhSafety ($signer.Contains("`$SafetyHash='$helperHash'")) 'Signer helper hash is stale.'
        Assert-JhSafety ($oneclick.Contains("`$SafetyHash='$helperHash'")) 'ONECLICK helper hash is stale.'
        Assert-JhSafety ($oneclick.Contains("'SIGN-UPDATE-FIX16.ps1' = '$signerHash'")) 'ONECLICK signer hash is stale.'
    }

    Invoke-JhSafetyTest 'Pre-existing APK/aligned outputs survive; optional write failures do not block RESULT' {
        $kit=New-JhSafetyKit 'existing outputs'
        $signed=Join-Path $kit 'JH168-FIX16-SIGNED.apk'
        $aligned=Join-Path $kit '.JH168-FIX16-ALIGNED.tmp.apk'
        [IO.File]::WriteAllText($signed,'pre-existing verified candidate')
        [IO.File]::WriteAllText($aligned,'pre-existing aligned candidate')
        $before=@((Get-JhTestHash $signed),(Get-JhTestHash $aligned))
        [void][IO.Directory]::CreateDirectory((Join-Path $kit 'RUN-STATUS.txt'))
        [void][IO.Directory]::CreateDirectory((Join-Path $kit 'SIGN-DIAGNOSTIC.txt'))
        $id=[guid]::NewGuid().ToString('N')
        $receipt=Invoke-JhRejectedSigner $kit $id
        Assert-JhSafety ((Get-JhTestHash $signed) -ceq $before[0]) 'Existing signed APK was removed or changed.'
        Assert-JhSafety ((Get-JhTestHash $aligned) -ceq $before[1]) 'Existing aligned output was removed or changed.'
        Assert-JhSafety ($receipt.ReportPath -ceq (Join-Path $kit 'RESULT.txt')) 'Optional log failures prevented primary RESULT.'
        $lines=[IO.File]::ReadAllLines($receipt.ReportPath)
        Assert-JhSafety ($lines -contains 'RUN_STATUS_WRITE: UNAVAILABLE') 'Stage write failure was not observed.'
        Assert-JhSafety ($lines -contains 'SIGN_DIAGNOSTIC_WRITE: UNAVAILABLE') 'Diagnostic write failure was not observed.'
    }

    Invoke-JhSafetyTest 'Existing aligned-only output survives its own early rejection' {
        $kit=New-JhSafetyKit 'existing aligned only'
        $aligned=Join-Path $kit '.JH168-FIX16-ALIGNED.tmp.apk'
        [IO.File]::WriteAllText($aligned,'unaltered earlier output')
        $before=Get-JhTestHash $aligned
        $null=Invoke-JhRejectedSigner $kit ([guid]::NewGuid().ToString('N'))
        Assert-JhSafety ((Get-JhTestHash $aligned) -ceq $before) 'Aligned-only output was removed or changed.'
    }

    Invoke-JhSafetyTest 'Actual primary-write failure saves a bound fallback; stale IDs and invalid counts fail' {
        $kit=New-JhSafetyKit 'result fallback'
        [void][IO.Directory]::CreateDirectory((Join-Path $kit 'RESULT.txt'))
        $id=[guid]::NewGuid().ToString('N')
        # Count 1 here is synthetic result-serialization input, never a device event.
        $saved=Write-JhRunResult -Kit $kit -RunId $id -Kind 'SIGNER' -Status 'SYNTHETIC_HELPER_TEST_NO_DEVICE_ACTION' `
            -AttemptCount 1 -Lines @('SYNTHETIC RESULT TEST ONLY')
        Assert-JhSafety ($saved.Saved -and $saved.FallbackUsed) 'Primary write failure did not produce a fallback.'
        $read=Read-JhRunResult -Kit $kit -RunId $id -ReportPath $saved.ReportPath -Kind 'SIGNER'
        Assert-JhSafety ($read.AttemptCount -eq 1) 'Bound synthetic attempt count was lost.'
        $replacement=Write-JhRunResult -Kit $kit -RunId $id -Kind 'SIGNER' -Status 'SYNTHETIC_HELPER_TEST_NO_DEVICE_ACTION' `
            -AttemptCount 1 -Lines @('SYNTHETIC CURRENT-RUN REPLACEMENT')
        $replaced=Read-JhRunResult -Kit $kit -RunId $id -ReportPath $replacement.ReportPath -Kind 'SIGNER'
        Assert-JhSafety ($replaced.Body -contains 'SYNTHETIC CURRENT-RUN REPLACEMENT') 'Atomic current-run replacement failed.'
        Assert-JhSafetyThrows {Read-JhRunResult -Kit $kit -RunId 'different-run' -ReportPath $saved.ReportPath -Kind 'SIGNER'}
        $text=[IO.File]::ReadAllText($saved.ReportPath).Replace('ANDROID_INSTALL_ATTEMPT_COUNT: 1','ANDROID_INSTALL_ATTEMPT_COUNT: 2')
        [IO.File]::WriteAllText($saved.ReportPath,$text)
        Assert-JhSafetyThrows {Read-JhRunResult -Kit $kit -RunId $id -ReportPath $saved.ReportPath -Kind 'SIGNER'}
    }

    Invoke-JhSafetyTest 'Competing signer cannot change owner files; lock is reusable after release' {
        $kit=New-JhSafetyKit 'locked run'
        $ownerId=[guid]::NewGuid().ToString('N')
        $ownerLock=Enter-JhRunLock -Kit $kit -RunId $ownerId
        try {
            $primary=Join-Path $kit 'RESULT.txt'
            [IO.File]::WriteAllText($primary,'active owner result must remain unchanged')
            $before=Get-JhTestHash $primary
            $receipt=Invoke-JhRejectedSigner $kit ([guid]::NewGuid().ToString('N'))
            Assert-JhSafety ($receipt.FallbackUsed) 'Competing signer wrote the owner primary result.'
            Assert-JhSafety ((Get-JhTestHash $primary) -ceq $before) 'Competing signer changed owner result.'
            Assert-JhSafety (!(Test-Path -LiteralPath (Join-Path $kit 'RUN-STATUS.txt'))) 'Competing signer changed owner status.'
            Assert-JhSafetyThrows {Enter-JhRunLock -Kit $kit -RunId 'wrong-parent-id' -ParentLock $ownerLock}
        } finally {Exit-JhRunLock -Lock $ownerLock -Owned $true}
        $reopened=Enter-JhRunLock -Kit $kit -RunId ([guid]::NewGuid().ToString('N'))
        Exit-JhRunLock -Lock $reopened -Owned $true
    }

    Invoke-JhSafetyTest 'ONECLICK missing payload records this run with exit 0 before any build/sign/install' {
        $kit=New-JhSafetyKit 'missing payload'
        $id=[guid]::NewGuid().ToString('N')
        & (Join-Path $PSHOME 'powershell.exe') -NoProfile -ExecutionPolicy Bypass -File (Join-Path $kit 'ONECLICK.ps1') -RunId $id
        $code=$LASTEXITCODE
        Assert-JhSafety ($code -eq 0) 'Saved primary failure RESULT did not return exit 0.'
        $read=Read-JhRunResult -Kit $kit -RunId $id -ReportPath (Join-Path $kit 'RESULT.txt') -Kind 'ONECLICK'
        Assert-JhSafety ($read.AttemptCount -eq 0 -and $read.Status -ceq 'STOPPED_BEFORE_DEVICE_CHANGE') 'Startup failure report is inaccurate.'
    }

    Invoke-JhSafetyTest 'ONECLICK preserves previous RESULT and records a fresh fallback with exit 20' {
        $kit=New-JhSafetyKit 'previous result'
        $primary=Join-Path $kit 'RESULT.txt'
        [IO.File]::WriteAllText($primary,"OLD RESULT`r`nRUN_ID: old-run`r`nSTATUS: PREVIOUS_SUCCESS`r`n")
        $before=Get-JhTestHash $primary
        $id=[guid]::NewGuid().ToString('N')
        & (Join-Path $PSHOME 'powershell.exe') -NoProfile -ExecutionPolicy Bypass -File (Join-Path $kit 'ONECLICK.ps1') -RunId $id
        $code=$LASTEXITCODE
        Assert-JhSafety ($code -eq 20) 'Saved fallback failure RESULT did not return exit 20.'
        Assert-JhSafety ((Get-JhTestHash $primary) -ceq $before) 'Previous RESULT was overwritten.'
        $fallback=(Get-JhResultPaths $kit $id)[1]
        $read=Read-JhRunResult -Kit $kit -RunId $id -ReportPath $fallback -Kind 'ONECLICK'
        Assert-JhSafety ($read.AttemptCount -eq 0 -and $read.Status -ceq 'STOPPED_BEFORE_DEVICE_CHANGE') 'Fallback reused a previous success.'
        Assert-JhSafetyThrows {Read-JhRunResult -Kit $kit -RunId $id -ReportPath $primary -Kind 'ONECLICK'}
    }
    Write-Host ('RUN_SAFETY_TESTS_PASSED: '+$Passed)
    Write-Host 'BUILD_SIGN_INSTALL_DEVICE_ACTIONS: NOT_RUN'
} finally {
    $env:LOCALAPPDATA=$OldLocalAppData
    $env:USERPROFILE=$OldUserProfile
    Remove-Item -LiteralPath $TestRoot -Recurse -Force -ErrorAction SilentlyContinue
}
