#requires -Version 5.1
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$KitRoot)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if($PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1 -or $env:OS -ne 'Windows_NT'){
    throw 'These tests require Windows PowerShell 5.1.'
}
$KitRoot=[IO.Path]::GetFullPath($KitRoot)
$mainPath=Join-Path $KitRoot 'data\Install-JH168-Stage27.ps1'
$helperPath=Join-Path $KitRoot 'data\JH-RUN-SAFETY.ps1'
$script:TestRoot=Join-Path ([IO.Path]::GetTempPath()) ('JH27-harmless-tests-'+[guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($script:TestRoot)
$savedLocalAppData=$env:LOCALAPPDATA
$script:TestCount=0
$script:TemporaryPaths=@()
$script:TestFailures=New-Object 'System.Collections.Generic.List[string]'
$script:ExtraOwnedDirectories=New-Object 'System.Collections.Generic.List[string]'

# Only function definitions are evaluated. The production installer top level is NEVER run.
$tokens=$null;$parseErrors=$null
$mainAst=[Management.Automation.Language.Parser]::ParseFile($mainPath,[ref]$tokens,[ref]$parseErrors)
if($parseErrors -and $parseErrors.Count -gt 0){throw 'Main installer has syntax errors.'}
foreach($definition in $mainAst.FindAll({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst]},$false)){
    Invoke-Expression $definition.Extent.Text
}
. $helperPath

function Assert-JhTest([bool]$Condition,[string]$Message){if(-not $Condition){throw ('ASSERT: '+$Message)}}
function Expect-JhThrow([scriptblock]$Body,[string]$Pattern){
    $caught=$false
    try{& $Body}catch{$caught=$true;Assert-JhTest ($_.Exception.Message -match $Pattern) ('Unexpected error: '+$_.Exception.Message)}
    Assert-JhTest $caught ('Expected failure matching '+$Pattern)
}
function Run-JhCase([string]$Name,[scriptblock]$Body){
    $script:TestCount++
    try{& $Body;Write-Host ('PASS: '+$Name)}catch{$script:TestFailures.Add($Name+': '+$_.Exception.Message);Write-Host ('FAIL: '+$Name+': '+$_.Exception.Message)}
}
function New-JhFixture([string]$Mode='success'){
    foreach($ownedPreviousTemp in $script:TemporaryPaths){if([IO.File]::Exists($ownedPreviousTemp)){[IO.File]::Delete($ownedPreviousTemp)}}
    $caseRoot=Join-Path $script:TestRoot ([guid]::NewGuid().ToString('N'))
    [void][IO.Directory]::CreateDirectory($caseRoot)
    $script:Root=Join-Path $caseRoot 'kit'
    [void][IO.Directory]::CreateDirectory($script:Root)
    $env:LOCALAPPDATA=Join-Path $caseRoot 'local'
    [void][IO.Directory]::CreateDirectory($env:LOCALAPPDATA)
    $script:CandidateBytes=[Text.Encoding]::ASCII.GetBytes('SYNTHETIC_STAGE27_NOT_AN_APK')
    $script:PriorBytes=[Text.Encoding]::ASCII.GetBytes('SYNTHETIC_STAGE26_NOT_AN_APK')
    $script:OtherBytes=[Text.Encoding]::ASCII.GetBytes('SYNTHETIC_UNEXPECTED_BYTES')
    $script:Apk=Join-Path $script:Root 'candidate.apk'
    [IO.File]::WriteAllBytes($script:Apk,$script:CandidateBytes)
    $priorFile=Join-Path $caseRoot 'prior.fixture'
    [IO.File]::WriteAllBytes($priorFile,$script:PriorBytes)
    $script:ExpectedSha=(Get-FileHash -LiteralPath $script:Apk -Algorithm SHA256).Hash.ToLowerInvariant()
    $script:ExpectedPriorSha=(Get-FileHash -LiteralPath $priorFile -Algorithm SHA256).Hash.ToLowerInvariant()
    $script:ExpectedBytes=$script:CandidateBytes.Length
    $script:ExpectedCert=('a'*64)
    $script:Package='com.koreanlifehub.bridge'
    $script:TargetVersion=168
    $script:SourceManifestSha='synthetic-manifest-sha'
    $script:CurrentRunId=[guid]::NewGuid().ToString('N')
    $script:AttemptCount=0;$script:Dispatched=$false;$script:TemporaryPaths=@();$script:Lines=@()
    $script:FixtureMode=$Mode;$script:InstalledAfter=$false;$script:InstallCalls=0;$script:NativeCalls=0
    $script:FixtureSerial='SYNTHETIC-DEVICE-ONLY'
}

# Synthetic frozen identity proof. Every native tool remains stubbed and
# no APK / signing tool / real Android device is ever accessed by this suite.
function Get-JhFrozenApkIdentity {
    $candidate=if($script:FixtureMode -ceq 'wrongIdentityDigest'){('b'*64)}else{$script:ExpectedSha}
    $pkg=if($script:FixtureMode -ceq 'wrongIdentityPackage'){'com.invalid.identity'}else{$script:Package}
    $ver=if($script:FixtureMode -ceq 'wrongIdentityVersion'){167}else{$script:TargetVersion}
    return [PSCustomObject]@{
        schema='JH168_STAGE27_SIGNING_VERIFICATION_V1'
        signed_sha256=$script:ExpectedSha
        certificate_sha256=$script:ExpectedCert
        original_certificate_match=$true
        v2_verified=$true
        v3_verified=$true
        source_manifest_sha256=$script:SourceManifestSha
        identity_proof=[PSCustomObject]@{
            source='SDK35_AAPT_AND_INDEPENDENT_BINARY_AXML'
            signed_apk_sha256=$candidate;package=$pkg;version_code=$ver;sdk35_aapt_exit=0
            sdk35_aapt_badging_package_line="package: name='com.koreanlifehub.bridge' versionCode='168' versionName='synthetic'"
            binary_axml_root_package_match=$true;binary_axml_root_version_code_match=$true
            verified_on_unchanged_signed_apk=$true;scope='FILE_IDENTITY_ONLY_NOT_DEVICE_INSTALL'
        }
    }
}

# Every potential external executable is replaced by an in-process deterministic stub.
function Find-Exe([string[]]$paths,[string]$name){return ('stub-'+$name)}
function Get-SdkRoots{return @('C:\JH-SYNTHETIC-SDK')}
function Run-Exe([string]$exe,[string[]]$arguments,[int]$timeoutSeconds=90){
    $script:NativeCalls++
    if($exe -ceq 'stub-aapt.exe'){throw 'REGRESSION_OLD_AAPT_TEXT_GATE_CALLED'}
    if($exe -ceq 'stub-java.exe'){
        $cert=if($script:FixtureMode -ceq 'wrongCert'){('b'*64)}else{$script:ExpectedCert}
        return @{ExitCode=0;Output=("Number of signers: 1`nSigner #1 certificate SHA-256 digest: "+$cert+"`nVerified using v2 scheme (APK Signature Scheme v2): true`nVerified using v3 scheme (APK Signature Scheme v3): true`n");Error=''}
    }
    Assert-JhTest ($exe -ceq 'stub-adb.exe') ('Unexpected executable '+$exe)
    if($arguments[0] -ceq 'devices'){
        $deviceRows=switch($script:FixtureMode){
            'twoDevices' {"$($script:FixtureSerial)`tdevice`nSECOND-SYNTHETIC`tdevice"}
            'unauthorized' {"$($script:FixtureSerial)`tunauthorized"}
            'recoverySecond' {"$($script:FixtureSerial)`tdevice`nSECOND-SYNTHETIC`trecovery"}
            default {"$($script:FixtureSerial)`tdevice"}
        }
        return @{ExitCode=0;Output=("List of devices attached`n"+$deviceRows+"`n");Error=''}
    }
    Assert-JhTest ($arguments[0] -ceq '-s' -and $arguments[1] -ceq $script:FixtureSerial) 'Exact synthetic device required'
    if($arguments[2] -ceq 'shell'){
        if($arguments[3] -ceq 'pm'){return @{ExitCode=0;Output="package:/synthetic/base.apk`n";Error=''}}
        if($arguments[3] -ceq 'dumpsys'){return @{ExitCode=0;Output="  versionCode=168 minSdk=26 targetSdk=35`n";Error=''}}
    }
    if($arguments[2] -ceq 'pull'){
        $payload=if($script:InstalledAfter -or $script:FixtureMode -ceq 'alreadyInstalled'){$script:CandidateBytes}else{$script:PriorBytes}
        if($script:FixtureMode -ceq 'wrongPrior' -or ($script:FixtureMode -ceq 'postMismatch' -and $script:InstalledAfter)){$payload=$script:OtherBytes}
        [IO.File]::WriteAllBytes($arguments[4],$payload)
        return @{ExitCode=0;Output='synthetic copy';Error=''}
    }
    if($arguments[2] -ceq 'install'){
        Assert-JhTest ($arguments.Count -eq 5 -and $arguments[3] -ceq '-r' -and $arguments[4] -ceq $script:Apk) 'Only exact install -r is permitted'
        Assert-JhTest ($script:Dispatched -and $script:AttemptCount -eq 1) 'Dispatch state must be set before stub invocation'
        $marker=Get-JhInstallAttemptPath $script:ExpectedSha $script:FixtureSerial
        Assert-JhTest ([IO.File]::Exists($marker)) 'Persistent marker must exist BEFORE install'
        $record=[IO.File]::ReadAllText($marker)|ConvertFrom-Json
        Assert-JhTest ($record.run_id -ceq $script:CurrentRunId -and $record.candidate_sha256 -ceq $script:ExpectedSha) 'Marker must bind current run and candidate'
        $script:InstallCalls++
        if($script:FixtureMode -ceq 'installTimeout'){throw 'NATIVE_COMMAND_TIMEOUT_RESULT_UNCONFIRMED'}
        $script:InstalledAfter=$true
        return @{ExitCode=0;Output="Success`n";Error=''}
    }
    throw ('Unexpected stub operation: '+($arguments -join ' '))
}
function Invoke-JhFixtureInstall{
    try{return Invoke-JhStage27Install}catch{return Get-JhFailureOutcome $_.Exception}
}

try{
    Run-JhCase 'Production scripts parse, BOM, aliases and automatic variables' {
        $forbidden=@('matches','pid','home','host','args','input','error','pshome','pwd','foreach','switch','this','psitem','_','lastexitcode','null','true','false','psversiontable','psscriptroot','pscommandpath')
        foreach($relative in @('data\Install-JH168-Stage27.ps1','data\JH-RUN-SAFETY.ps1','data\Confirm-Stage27-Result.ps1')){
            $path=Join-Path $KitRoot $relative
            $bytes=[IO.File]::ReadAllBytes($path)
            Assert-JhTest ($bytes.Length -gt 3 -and $bytes[0] -eq 239 -and $bytes[1] -eq 187 -and $bytes[2] -eq 191) ($relative+' must have UTF-8 BOM')
            $scanTokens=$null;$scanErrors=$null
            $scanAst=[Management.Automation.Language.Parser]::ParseFile($path,[ref]$scanTokens,[ref]$scanErrors)
            Assert-JhTest (-not $scanErrors -or $scanErrors.Count -eq 0) ($relative+' must parse')
            foreach($fn in $scanAst.FindAll({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst]},$true)){
                Assert-JhTest (-not (Get-Alias -Name $fn.Name -ErrorAction SilentlyContinue)) ('Alias collision '+$fn.Name)
            }
            foreach($assignment in $scanAst.FindAll({param($node) $node -is [Management.Automation.Language.AssignmentStatementAst]},$true)){
                if($assignment.Left -is [Management.Automation.Language.VariableExpressionAst]){
                    $name=$assignment.Left.VariablePath.UserPath.Split(':')[-1].ToLowerInvariant()
                    Assert-JhTest ($forbidden -notcontains $name) ('Automatic variable assignment '+$name)
                }
            }
            foreach($parameter in $scanAst.FindAll({param($node) $node -is [Management.Automation.Language.ParameterAst]},$true)){
                $name=$parameter.Name.VariablePath.UserPath.Split(':')[-1].ToLowerInvariant()
                Assert-JhTest ($forbidden -notcontains $name) ('Automatic variable parameter '+$name)
            }
        }
    }
    Run-JhCase 'Frozen signed identity proof content is pinned, not the local aapt output' {
        $proofPath=Join-Path $KitRoot 'data\STAGE27-SIGNATURE-VERIFICATION.json'
        $proofHash=(Get-FileHash -LiteralPath $proofPath -Algorithm SHA256).Hash.ToLowerInvariant()
        Assert-JhTest ($proofHash -ceq 'e3f1eb72bc37ecd193ba2c40af4f5c7c83a26c252739ce3e8d650b85ad481084') 'Original SDK 35 identity proof must be exact'
        $identity=([IO.File]::ReadAllText($proofPath)|ConvertFrom-Json).identity_proof
        Assert-JhTest ($identity.package -ceq 'com.koreanlifehub.bridge' -and [int]$identity.version_code -eq 168) 'Frozen identity is exact'
        $source=[IO.File]::ReadAllText($mainPath)
        Assert-JhTest ($source -match 'APK_FROZEN_IDENTITY_PROOF_MISMATCH_NO_INSTALL' -and
            $source -notmatch 'Run-Exe\s+\$aapt') 'Old text-only aapt gate must not return'
    }
    Run-JhCase 'Prior candidate installs exactly once and verifies current bytes' {
        New-JhFixture
        $result=Invoke-JhFixtureInstall
        Assert-JhTest ($result.Status -ceq 'NEW_PASS' -and $script:InstallCalls -eq 1 -and $script:AttemptCount -eq 1) 'One successful update required'
        Assert-JhTest ((Get-JhOutcomeExitCode $result.Status) -eq 0) 'Verified success exit must be zero'
        Assert-JhTest ([IO.File]::Exists((Get-JhInstallAttemptPath $script:ExpectedSha $script:FixtureSerial))) 'Attempt receipt must remain'
    }
    Run-JhCase 'Already installed exact candidate skips install' {
        New-JhFixture 'alreadyInstalled'
        $result=Invoke-JhFixtureInstall
        Assert-JhTest ($result.Status -ceq 'REUSED_PASS' -and $script:InstallCalls -eq 0 -and $script:AttemptCount -eq 0 -and -not $script:Dispatched) 'Same APK must not be installed again'
    }
    Run-JhCase 'Timeout retains persistent attempt and blocks retry from another kit' {
        New-JhFixture 'installTimeout'
        $result=Invoke-JhFixtureInstall
        Assert-JhTest ($result.Status -ceq 'UNKNOWN' -and $script:InstallCalls -eq 1 -and $script:AttemptCount -eq 1) 'Dispatched timeout must be unknown'
        Assert-JhTest ((Get-JhOutcomeExitCode $result.Status) -eq 5) 'Unknown exit must be five'
        $oldMarker=Get-JhInstallAttemptPath $script:ExpectedSha $script:FixtureSerial
        $script:Root=Join-Path $script:TestRoot ('second-kit-'+[guid]::NewGuid().ToString('N'))
        [void][IO.Directory]::CreateDirectory($script:Root)
        $script:Apk=Join-Path $script:Root 'candidate.apk';[IO.File]::WriteAllBytes($script:Apk,$script:CandidateBytes)
        $script:FixtureMode='success';$script:InstallCalls=0;$script:AttemptCount=0;$script:Dispatched=$false;$script:CurrentRunId=[guid]::NewGuid().ToString('N')
        $retry=Invoke-JhFixtureInstall
        Assert-JhTest ($retry.Status -ceq 'BLOCKED' -and $retry.Reason -match 'PRIOR_INSTALL_ATTEMPT' -and $script:InstallCalls -eq 0) 'Extracting again cannot bypass persistent marker'
        Assert-JhTest ((Get-JhInstallAttemptPath $script:ExpectedSha $script:FixtureSerial) -ceq $oldMarker) 'Marker identity must not depend on kit directory'
    }
    Run-JhCase 'Wrong hash, certificate, baseline and device ambiguity block before dispatch' {
        foreach($mode in @('wrongHash','wrongCert','wrongPrior','twoDevices','unauthorized','recoverySecond','wrongIdentityDigest','wrongIdentityPackage','wrongIdentityVersion')){
            New-JhFixture $mode
            if($mode -ceq 'wrongHash'){[IO.File]::WriteAllBytes($script:Apk,$script:OtherBytes)}
            $result=Invoke-JhFixtureInstall
            Assert-JhTest ($result.Status -ceq 'BLOCKED' -and $script:InstallCalls -eq 0 -and -not $script:Dispatched) ($mode+' must block before install')
            Assert-JhTest ((Get-JhOutcomeExitCode $result.Status) -eq 3) 'Blocked exit must be three'
        }
    }
    Run-JhCase 'Post-install bytes mismatch remains unknown without replay' {
        New-JhFixture 'postMismatch'
        $result=Invoke-JhFixtureInstall
        Assert-JhTest ($result.Status -ceq 'UNKNOWN' -and $script:InstallCalls -eq 1 -and $script:AttemptCount -eq 1) 'Post-install verification failure is not preflight blocked'
    }
    Run-JhCase 'Run lock, prior RESULT preservation and current identity' {
        New-JhFixture
        $old=Join-Path $script:Root 'RESULT.txt';[IO.File]::WriteAllText($old,'OLD-SUCCESS-SENTINEL')
        $lock=Enter-JhRunLock $script:Root $script:CurrentRunId
        try{
            Expect-JhThrow {Enter-JhRunLock $script:Root 'competing-run'} 'RUN_LOCK_UNAVAILABLE'
            $archived=Move-JhPreviousResult $script:Root $script:CurrentRunId $lock
            Assert-JhTest ([IO.File]::ReadAllText($archived) -ceq 'OLD-SUCCESS-SENTINEL') 'Prior RESULT must be preserved'
            $saved=Write-JhRunResult -Kit $script:Root -RunId $script:CurrentRunId -Kind 'INSTALLER' -Status 'NEW_PASS' -AttemptCount 1 -Lines @('STOP_REASON: SYNTHETIC_ONLY')
            Assert-JhTest ($saved.Saved -and -not $saved.FallbackUsed) 'Current result must be saved'
            $read=Read-JhRunResult $script:Root $script:CurrentRunId $saved.ReportPath 'INSTALLER'
            Assert-JhTest ($read.RunId -ceq $script:CurrentRunId -and $read.AttemptCount -eq 1) 'Current ID and attempt count required'
            Expect-JhThrow {Read-JhRunResult $script:Root 'different-run' $saved.ReportPath 'INSTALLER'} 'IDENTITY'
        }finally{Exit-JhRunLock $lock}
    }
    Run-JhCase 'Existing RESULT is never overwritten and fallback is validated' {
        New-JhFixture
        $primary=Join-Path $script:Root 'RESULT.txt';[IO.File]::WriteAllText($primary,'UNCHANGED-PRIOR-RESULT')
        $saved=Write-JhRunResult -Kit $script:Root -RunId $script:CurrentRunId -Kind 'INSTALLER' -Status 'UNKNOWN' -AttemptCount 1 -Lines @('STOP_REASON: SYNTHETIC_ONLY')
        Assert-JhTest ($saved.Saved -and $saved.FallbackUsed) 'Unavailable primary must fall back'
        Assert-JhTest ([IO.File]::ReadAllText($primary) -ceq 'UNCHANGED-PRIOR-RESULT') 'Prior result must remain unchanged'
        $read=Read-JhRunResult $script:Root $script:CurrentRunId $saved.ReportPath 'INSTALLER'
        Assert-JhTest ($read.Status -ceq 'UNKNOWN' -and $read.RunId -ceq $script:CurrentRunId) 'Fallback report must be current and unknown'
    }
}finally{
    $env:LOCALAPPDATA=$savedLocalAppData
    foreach($path in $script:TemporaryPaths){if([IO.File]::Exists($path)){[IO.File]::Delete($path)}}
    foreach($path in $script:ExtraOwnedDirectories){if([IO.Directory]::Exists($path)){[IO.Directory]::Delete($path,$true)}}
    if([IO.Directory]::Exists($script:TestRoot)){[IO.Directory]::Delete($script:TestRoot,$true)}
}
Write-Host ('STAGE27_HARMLESS_CASES: '+$script:TestCount)
Write-Host ('STAGE27_HARMLESS_FAILED: '+$script:TestFailures.Count)
if($script:TestFailures.Count -gt 0){foreach($failure in $script:TestFailures){Write-Host $failure};exit 1}
Write-Host 'REAL_ADB_KEY_APK_DEVICE_OPERATIONS: NOT_RUN'
exit 0
