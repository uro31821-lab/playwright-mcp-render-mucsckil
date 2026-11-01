param([string]$RunId = "")
# JH168 FIX16 - all-in-one owner-initiated build/sign/install/verify, one launch.
# Read-only preflight -> exact build reuse or strict new build -> signed one-time install.
$ErrorActionPreference='Stop'
$Kit=Split-Path -Parent $MyInvocation.MyCommand.Path
$Report=Join-Path $Kit 'RESULT.txt'
$UTF8=New-Object System.Text.UTF8Encoding($false)
$Summary=New-Object 'System.Collections.Generic.List[string]'
$Summary.Add('JH168 FIX16 - ONE CLICK INTEGRATED PIPELINE')
$Summary.Add('DATE: '+(Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
$Summary.Add('NO_UNINSTALL_NO_DATA_WIPE_NO_CU_NO_PARENT_FALLBACK_NO_REPLAY')
$STATUS='STOPPED_BEFORE_DEVICE_CHANGE'
$WasBuildNeeded=$false
$SignerInvoked=$false
$CacheStatus='NOT_CHECKED'
$EffectiveRunId=[guid]::NewGuid().ToString('N')
$SafetyReady=$false
$RunLock=$null
$AllowPrimaryResult=$false
$SignerResult=$null
$SignerAttemptCount=0
$ExitCode=1
$SafetyHash='9ebb716ab9cdb54f47e46c785c11412c4d8ae9c20d2f011376d4e721ca8aae0f'
function Log([string]$text){Write-Host ('['+(Get-Date -Format 'HH:mm:ss')+'] '+$text) -ForegroundColor Cyan}
function Get-JhFileSha256([string]$path){return (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()}
function Add([string]$text){$script:Summary.Add($text)}
try {
    $safetyPath=Join-Path $Kit 'JH-RUN-SAFETY.ps1'
    if(!(Test-Path -LiteralPath $safetyPath -PathType Leaf) -or (Get-JhFileSha256 $safetyPath) -cne $SafetyHash){
        throw 'RUN_SAFETY_HELPER_MISSING_OR_CHANGED'
    }
    . $safetyPath
    $SafetyReady=$true
    $EffectiveRunId=Get-JhRunId $RunId
    $RunLock=Enter-JhRunLock -Kit $Kit -RunId $EffectiveRunId
    if(Test-Path -LiteralPath $Report){throw 'PREVIOUS_RESULT_EXISTS_PRESERVED_NO_ACTION'}
    $AllowPrimaryResult=$true
    Log 'PREFLIGHT 1/6: ZIP extraction, required bundled scripts and file hashes'
    $required=@{
        'FIX16-APPLY.ps1' = '5ab7aa84edf377f4d695b65522afe62f86c9e4532fd862ee8dbce56d4af0b8d7'
        'SIGN-UPDATE-FIX16.ps1' = '34eb206b30846ad60be4465b49dd162c808475c52dce3d20a45508b4d8f29fe2'
        'JH168HorizontalScrollPolicy.kt' = '693a4983733182e73d3b3a9619e0f8810b310e42b5c8fb3844a5f8d1deee8ec4'
        'JH168RightHorizontalScrollRuntime.kt' = '73a72f8107b15dc5f4e7b220028f39957b3a3fcb82f504118b0234b769ffea00'
        'JH168HorizontalScrollPolicyTest.kt' = 'd9414e037c1ab698a1819ef1b5ca648557b4906f611ede3250d996fa4abb140f'
        'JH-RUN-SAFETY.ps1' = $SafetyHash
    }
    foreach($name in $required.Keys){
        $file=Join-Path $Kit $name
        if(!(Test-Path -LiteralPath $file -PathType Leaf)){throw ('ZIP_NOT_FULLY_EXTRACTED_MISSING_'+$name)}
        if((Get-JhFileSha256 $file) -ne $required[$name]){throw ('ONECLICK_BUNDLED_FILE_HASH_MISMATCH_'+$name)}
    }
    Add('BUNDLED_SOURCE_AND_SCRIPTS_SHA256: ALL_MATCH')
    Log 'PREFLIGHT 2/6: PowerShell parser, known error blacklist, safe local paths'
    foreach($name in @('ONECLICK.ps1','FIX16-APPLY.ps1','SIGN-UPDATE-FIX16.ps1','JH-RUN-SAFETY.ps1')){
        $path=Join-Path $Kit $name
        if(!(Test-Path -LiteralPath $path)){throw ('PS_SCRIPT_MISSING_'+$name)}
        $tokens=$null;$parseErrors=$null
        $parsedAst=[System.Management.Automation.Language.Parser]::ParseFile($path,[ref]$tokens,[ref]$parseErrors)
        if($parseErrors -and $parseErrors.Count -gt 0){throw ('POWERSHELL_SYNTAX_ERROR_'+$name+'_LINE_'+$parseErrors[0].Extent.StartLineNumber)}
        # Defend against Windows PowerShell built-in aliases overriding functions.
        # Previously 'H $file' resolved as Get-History -Id, not the hash helper.
        # Fail BEFORE signing/install whenever a bundled function shadows a built-in alias.
        $fnDefs=$parsedAst.FindAll({param($astItem) $astItem -is [System.Management.Automation.Language.FunctionDefinitionAst]},$true)
        foreach($fnDef in @($fnDefs)){
            $aliasCollision=Get-Alias -Name $fnDef.Name -ErrorAction SilentlyContinue
            if($null -ne $aliasCollision){throw ('POWERSHELL_FUNCTION_ALIAS_COLLISION_'+$fnDef.Name+'_IN_'+$name)}
        }
        $body=[IO.File]::ReadAllText($path)
        # Previously repeated: reserved automatic variable $Matches used as accumulator.
        if($body -match '(?im)\$Matches\s*(?:\+\+|--|=(?!=))'){
            throw ('KNOWN_ERROR_RESERVED_MATCHES_MUTATED_'+$name)
        }
        if($body -match '(?im)\$(?:Home|Host|PID|Input|Args)\s*(?:\+\+|--|=(?!=))'){
            throw ('KNOWN_ERROR_RESERVED_AUTOMATIC_VARIABLE_'+$name)
        }
    }
    if(!(Test-Path -LiteralPath $env:LOCALAPPDATA -PathType Container)){throw 'LOCALAPPDATA_NOT_AVAILABLE'}
    if($Kit.Length -gt 155){throw 'ZIP_EXTRACTED_FOLDER_PATH_TOO_LONG_USE_SHORT_FOLDER'}
    Add('POWERSHELL_SYNTAX_AND_COMMON_ERROR_CHECKLIST: PASS')
    $guard=Join-Path $env:LOCALAPPDATA 'JH16F16\FIX16-INSTALL-ATTEMPT-ONCE.txt'
    if(Test-Path -LiteralPath $guard){throw 'FIX16_ALREADY_ATTEMPTED_NO_REPEAT_CONTACT_ASSISTANT'}
    Log 'PREFLIGHT 3/6: Reuse FIX16 unsigned APK if exact known-good cached build exists'
    $proj=Join-Path $env:LOCALAPPDATA 'JH16F16\FIX16-PATCHED-SOURCE'
    $main=Join-Path $proj 'app\src\main\java\com\koreanlifehub\bridge'
    $unsigned=Join-Path $proj 'app\build\outputs\apk\release\app-release-unsigned.apk'
    $checkFiles=@{
        'JH168RightHorizontalScrollRuntime.kt'='73a72f8107b15dc5f4e7b220028f39957b3a3fcb82f504118b0234b769ffea00'
        'JH168HorizontalScrollPolicy.kt'='693a4983733182e73d3b3a9619e0f8810b310e42b5c8fb3844a5f8d1deee8ec4'
        'JH168RightVerticalScrollRuntime.kt'='0a69dc716e34e59672e9ba6a72c0ddd35ce487533c135c92733d700d6d441854'
    }
    $CachedOkay=$true
    foreach($name in $checkFiles.Keys){
        $path=Join-Path $main $name
        if(!(Test-Path -LiteralPath $path -PathType Leaf) -or (Get-JhFileSha256 $path) -ne $checkFiles[$name]){$CachedOkay=$false}
    }
    if(!(Test-Path -LiteralPath $unsigned -PathType Leaf)){$CachedOkay=$false}
    elseif((Get-JhFileSha256 $unsigned) -ne 'e299842f5bac002b2f3fd21d547f816debf02fb7d7c491554acc70b01607912c'){$CachedOkay=$false}
    $provenance=''
    if($CachedOkay){
        $CacheStatus='REUSE_EXACT_PREVIOUSLY_TESTED_FIX16_APK_NO_REBUILD'
        Add('BUILD_STEP: '+$CacheStatus)
        Log 'BUILD 4/6: Exact prior Gradle build hash matched; SKIPPING build'
    } else {
        if(Test-Path -LiteralPath $proj){throw 'PREVIOUS_FIX16_WORKSPACE_PARTIAL_OR_CHANGED_NO_AUTO_OVERWRITE'}
        Log 'BUILD 4/6: No trusted cached APK; run bundled strict source patch + Gradle tests + build'
        $WasBuildNeeded=$true
        & (Join-Path $Kit 'FIX16-APPLY.ps1')
        $built=Get-Content -LiteralPath $Report -ErrorAction Stop
        if($built -cnotcontains 'STATUS: FIX16_HORIZONTAL_BUILD_TEST_PASS_UNSIGNED_NOT_INSTALLED' -or
           $built -cnotcontains 'GRADLE_EXIT_CODE: 0'){
            throw 'FIX16_GRADLE_BUILD_NOT_PROVEN_STOP_NO_DEVICE_CHANGE'
        }
        $provenance=Join-Path $Kit 'FIX16-BUILD-RESULT.txt'
        if(Test-Path -LiteralPath $provenance){throw 'BUILD_RESULT_NAME_ALREADY_EXISTS_NO_OVERWRITE'}
        Copy-Item -LiteralPath $Report -Destination $provenance
        Add('BUILD_STEP: NEW_BUILD_WITH_GRADLE_TESTS_PROVEN')
    }
    Log 'SIGN 5/6: Original certificate sign and manifest verification; owner initiated'
    $SignerInvoked=$true
    $SignerAttemptCount='UNKNOWN'
    if($provenance){
        $replies=@(& (Join-Path $Kit 'SIGN-UPDATE-FIX16.ps1') -VerifiedBuildResult $provenance -RunId $EffectiveRunId -ParentRunLock $RunLock)
    } else {
        $replies=@(& (Join-Path $Kit 'SIGN-UPDATE-FIX16.ps1') -RunId $EffectiveRunId -ParentRunLock $RunLock)
    }
    if($replies.Count -ne 1){throw 'CURRENT_SIGNER_RECEIPT_MISSING_OR_AMBIGUOUS'}
    $receipt=$replies[0]
    if($receipt.RunId -cne $EffectiveRunId -or $receipt.Kind -cne 'SIGNER' -or
       $receipt.AttemptCount -isnot [int] -or $receipt.AttemptCount -notin @(0,1)){
        throw 'CURRENT_SIGNER_RECEIPT_IDENTITY_INVALID'
    }
    $SignerAttemptCount=$receipt.AttemptCount
    if($receipt.ResultSaved -isnot [bool] -or !$receipt.ResultSaved){throw 'CURRENT_SIGNER_RESULT_NOT_SAVED'}
    $SignerResult=Read-JhRunResult -Kit $Kit -RunId $EffectiveRunId -ReportPath $receipt.ReportPath -Kind 'SIGNER'
    if($SignerResult.Status -cne $receipt.Status -or $SignerResult.AttemptCount -ne $receipt.AttemptCount){
        throw 'CURRENT_SIGNER_RECEIPT_RESULT_MISMATCH'
    }
    $STATUS=$SignerResult.Status
    # No phone write is ever performed by the front controller; only the guarded signer.
    Add('SIGN_INSTALL_STEP: '+$STATUS)
    Add('RESULT_VERIFICATION: REFER_TO_SIGNED_INSTALL_RESULT_BELOW')
    Add('AUTO_RETRY: FORBIDDEN')
    Log ('VERIFY 6/6: Signer reported '+$STATUS)
} catch {
    Add('ONECLICK_STOP_REASON: '+$_.Exception.Message)
    if($_.InvocationInfo -and $_.InvocationInfo.ScriptLineNumber -gt 0){
        Add('ONECLICK_ERROR_LINE: '+$_.InvocationInfo.ScriptLineNumber)
        Add('ONECLICK_ERROR_COMMAND: '+($_.InvocationInfo.MyCommand.Name -replace '[^A-Za-z0-9_.-]','_'))
    }
    if($SignerInvoked){$STATUS='SIGN_OR_INSTALL_NOT_CONFIRMED_NO_AUTO_RETRY';$SignerResult=$null}
    Log ('STOP '+$_.Exception.Message)
} finally {
    if($null -ne $SignerResult){
        # These lines were read only from the receipt's current-run path and ID.
        $resultBody=@($SignerResult.Body)+@('','ONECLICK FRONT CONTROLLER')+$Summary.ToArray()
        $resultKind='SIGNER'
    } else {
        $attempted='UNKNOWN'
        if($SignerAttemptCount -is [int]){$attempted=($SignerAttemptCount -eq 1).ToString().ToUpperInvariant()}
        Add('DEVICE_INSTALL_ATTEMPTED: '+$attempted)
        Add('SECURE56_POLICY: UNCHANGED')
        Add('COMPUTER_USE: NOT_USED')
        Add('GITHUB_DEPLOYMENT: NOT_ATTEMPTED')
        $resultBody=$Summary.ToArray()
        $resultKind='ONECLICK'
    }
    try {
        if($SafetyReady){
            $saved=Write-JhRunResult -Kit $Kit -RunId $EffectiveRunId -Kind $resultKind -Status $STATUS `
                -AttemptCount $SignerAttemptCount -Lines $resultBody -AllowPrimary $AllowPrimaryResult
            if($saved.Saved){
                if($saved.FallbackUsed){$ExitCode=20}else{$ExitCode=0}
            }
        } else {
            Write-Host 'RUN_SAFETY_UNAVAILABLE: no device action occurred. The CMD launcher must record this startup failure.' -ForegroundColor Red
        }
    } catch {
        Write-Host 'CURRENT_RUN_RESULT_NOT_SAVED: report location is unavailable.' -ForegroundColor Red
    } finally {
        if($SafetyReady){Exit-JhRunLock -Lock $RunLock -Owned $true}
    }
    Write-Host 'DO NOT run twice if an installation might have started.' -ForegroundColor Yellow
}
# Only the top-level -File entrypoint exits. 0/20 certify saved current-run
# RESULT locations, not a successful build/sign/install outcome.
exit $ExitCode
