param([Parameter(Mandatory=$true)][string]$KitRoot,[Parameter(Mandatory=$true)][string]$CaseName)
$ErrorActionPreference='Stop'
$work=Join-Path ([IO.Path]::GetTempPath()) ('jh231-test-'+[Guid]::NewGuid().ToString('N'))
$null=New-Item -Path $work -ItemType Directory
$oldLocal=$env:LOCALAPPDATA;$oldTemp=$env:TEMP;$oldTmp=$env:TMP
$exitCode=1
function Check([bool]$Condition,[string]$Message){if(-not $Condition){throw ('ASSERT_FAILED: '+$Message)}}
function FixtureText([string]$Path,[string]$Value){[IO.File]::WriteAllText($Path,$Value,[Text.UTF8Encoding]::new($false))}
function FixtureManifest {
    $record=[ordered]@{}
    foreach($rel in @('실행.cmd','README_FIRST.md','POWER_SHELL_ERROR_CHECKLIST.txt','DELIVERY_PINS.json','internal/BOOTSTRAP.ps1','internal/JH231-UPDATE.ps1','payload/app-release-unsigned.apk','payload/SOURCE_LOCK.json')){
        $file=Join-Path $fixtureRoot $rel
        $record[$rel]=[ordered]@{bytes=(Get-Item -LiteralPath $file).Length;sha256=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()}
    }
    FixtureText (Join-Path $fixtureRoot 'PACKAGE_SHA256.json') ($record | ConvertTo-Json -Depth 4)
}
try {
    $fixtureRoot=Join-Path $work 'kit'
    foreach($dir in @($fixtureRoot,(Join-Path $fixtureRoot 'internal'),(Join-Path $fixtureRoot 'payload'),(Join-Path $work 'local'),(Join-Path $work 'temp'))){$null=New-Item -Path $dir -ItemType Directory -Force}
    $env:LOCALAPPDATA=Join-Path $work 'local';$env:TEMP=Join-Path $work 'temp';$env:TMP=$env:TEMP
    foreach($rel in @('실행.cmd','README_FIRST.md','POWER_SHELL_ERROR_CHECKLIST.txt','internal\BOOTSTRAP.ps1','internal\JH231-UPDATE.ps1')){Copy-Item -LiteralPath (Join-Path $KitRoot $rel) -Destination (Join-Path $fixtureRoot $rel)}
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $unsignedFixture=Join-Path $fixtureRoot 'payload\app-release-unsigned.apk'
    $zip=[IO.Compression.ZipFile]::Open($unsignedFixture,[IO.Compression.ZipArchiveMode]::Create)
    try {
        $entry=$zip.CreateEntry('classes.dex',[IO.Compression.CompressionLevel]::NoCompression)
        $stream=$entry.Open()
        try {$data=New-Object byte[] 5000100;$stream.Write($data,0,$data.Length)}finally{$stream.Dispose()}
        $entry=$zip.CreateEntry('AndroidManifest.xml',[IO.Compression.CompressionLevel]::NoCompression)
        $stream=$entry.Open();try{$data=[Text.Encoding]::UTF8.GetBytes('SYNTHETIC TEST DATA ONLY');$stream.Write($data,0,$data.Length)}finally{$stream.Dispose()}
    } finally {$zip.Dispose()}
    FixtureText (Join-Path $fixtureRoot 'payload\SOURCE_LOCK.json') '{"synthetic":true,"files":[]}'
    $fixtureCertificate='7cc577efe48e865fdbe799b92aa9edf89724631361ae97979f2b8e4a940a288b'
    $fixturePins=[ordered]@{schema='JH231_UNSIGNED_RELEASE_PINS_V1';package='com.koreanlifehub.bridge';fromVersion='230';fromName='jh230-kabiseo-v2-frame-lease-secure56';toVersion='231';toName='jh231-saved-post-target-secure56';unsignedSha256=(Get-FileHash -LiteralPath $unsignedFixture -Algorithm SHA256).Hash.ToLowerInvariant();unsignedBytes=(Get-Item -LiteralPath $unsignedFixture).Length;sourceLockSha256=(Get-FileHash -LiteralPath (Join-Path $fixtureRoot 'payload\SOURCE_LOCK.json') -Algorithm SHA256).Hash.ToLowerInvariant();certificateSha256=$fixtureCertificate}
    FixtureText (Join-Path $fixtureRoot 'DELIVERY_PINS.json') ($fixturePins | ConvertTo-Json)
    $mainSource=Get-Content -LiteralPath (Join-Path $fixtureRoot 'internal\JH231-UPDATE.ps1') -Raw -Encoding UTF8
    $mainPrelude=($mainSource -split '# MAIN_ENTRY',2)[0]
    $fixtureMainPrelude=Join-Path $fixtureRoot 'internal\Fixture-Main-Prelude.ps1'
    [IO.File]::WriteAllText($fixtureMainPrelude,$mainPrelude,[Text.UTF8Encoding]::new($true))
    . $fixtureMainPrelude
    $DeliveryRoot=$fixtureRoot
    $script:FixtureInstallCalls=0;$script:FixtureSignCalls=0;$script:FixtureNativeCalls=0
    $script:FixtureBeforeVersion='230';$script:FixtureAfterVersion='231'
    $script:FixtureChildCalls=0
    function FindAndroidTools {return [pscustomobject]@{Adb='FIXTURE_ADB';Aapt='FIXTURE_AAPT';Signer='FIXTURE_SIGNER'}}
    function Find-Keytool {return 'FIXTURE_KEYTOOL'}
    function AssertCrashGate {Evidence 'NEW_WINDOWS_KERNELPOWER_OR_BUGCHECK' '0_FIXTURE'}
    function Auto-FindOriginalSigner([string]$Tool,[string]$BuildRoot){
        if($CaseName -eq 'missing-original-key'){throw 'EXACT_JH222_SIGNER_LOCATOR_NOT_FOUND_OR_INVALID_NO_SIGN'}
        if($CaseName -eq 'preserve-current-sign-temp'){
            $path=Join-Path $DeliveryRoot ('SIGNED_APK_ONLY\jh231-'+$RunId+'.partial.apk')
            FixtureText $path 'PREEXISTING_PARTIAL_MUST_SURVIVE'
        }
        $cert=$Certificate;if($CaseName -eq 'wrong-original-cert'){$cert=('0'*64)}
        return @{Path=(Join-Path $work 'synthetic-not-a-key.fixture');Alias='fixture';StorePassword='fixture-only';KeyPassword='fixture-only';Certificate=$cert}
    }
    function Read-PublicSignerCert([string]$Tool,[string]$KeyStore,[string]$Alias){if($CaseName -eq 'wrong-repeat-cert'){return ('0'*64)};return $Certificate}
    function ExecNative([string]$Exe,[string[]]$Arguments){
        $script:FixtureNativeCalls++
        if($Exe -eq 'FIXTURE_AAPT'){
            Check ($Arguments[0] -eq 'dump' -and $Arguments[1] -eq 'badging') 'Only aapt metadata reads allowed'
            $name=Split-Path -Leaf $Arguments[2]
            $version=$ToVersion;$versionName=$ToName
            if($name -eq 'BEFORE-installed-base.apk'){$version=$script:FixtureBeforeVersion}
            if($name -eq 'AFTER-installed-base.apk'){$version=$script:FixtureAfterVersion}
            if($version -eq '230'){$versionName=$FromName}
            $output="package: name='$PackageId' versionCode='$version' versionName='$versionName'"
            if($CaseName -eq 'debuggable-apk'){$output+="`napplication-debuggable"}
            return [pscustomobject]@{Code=0;Output=$output}
        }
        if($Exe -eq 'FIXTURE_SIGNER'){
            if($Arguments[0] -eq 'verify'){
                $cert=$Certificate;$path=$Arguments[$Arguments.Length-1]
                if($CaseName -eq 'wrong-signed-cert' -or ($CaseName -eq 'wrong-installed-cert' -and (Split-Path -Leaf $path) -eq 'BEFORE-installed-base.apk')){$cert=('0'*64)}
                return [pscustomobject]@{Code=0;Output=('Signer #1 certificate SHA-256 digest: '+$cert)}
            }
            Check ($Arguments[0] -eq 'sign') 'Only sign or verify fixture operation allowed'
            $script:FixtureSignCalls++
            $outIndex=[Array]::IndexOf($Arguments,'--out')
            Check ($outIndex -gt 0) 'Signer out parameter'
            $outPath=$Arguments[$outIndex+1]
            Copy-Item -LiteralPath $Arguments[$Arguments.Length-1] -Destination $outPath -Force
            if($CaseName -eq 'signed-payload-changed'){
                $opened=[IO.Compression.ZipFile]::Open($outPath,[IO.Compression.ZipArchiveMode]::Update)
                try{$entry=$opened.CreateEntry('unexpected.txt');$s=$entry.Open();try{$s.WriteByte(1)}finally{$s.Dispose()}}finally{$opened.Dispose()}
            }
            return [pscustomobject]@{Code=0;Output='FIXTURE SIGNER'}
        }
        Check ($Exe -eq 'FIXTURE_ADB') 'All native calls must hit harmless fixture tools'
        if($Arguments[0] -eq 'devices'){
            $text="List of devices attached`nfixture-device device"
            if($CaseName -eq 'no-device'){$text='List of devices attached'}
            if($CaseName -eq 'multiple-devices'){$text+="`nfixture-two device"}
            if($CaseName -eq 'unauthorized-device'){$text="List of devices attached`nfixture-device unauthorized"}
            return [pscustomobject]@{Code=0;Output=$text}
        }
        Check ($Arguments[0] -eq '-s' -and $Arguments[1] -eq 'fixture-device') 'Exact fixture device only'
        if($Arguments[2] -eq 'shell'){
            Check (($Arguments[3..5] -join ' ') -eq ('pm path '+$PackageId)) 'Only package path read allowed'
            return [pscustomobject]@{Code=0;Output='package:/data/app/fixture/base.apk'}
        }
        if($Arguments[2] -eq 'pull'){
            $target=$Arguments[4]
            $from=Join-Path $DeliveryRoot 'SIGNED_APK_ONLY\JH231_NATIVE_EXACT_TARGET_ORIGINAL_CERT_SIGNED.apk'
            Copy-Item -LiteralPath $from -Destination $target
            if($CaseName -eq 'post-install-wrong-hash' -and (Split-Path -Leaf $target) -eq 'AFTER-installed-base.apk'){
                $s=[IO.File]::OpenWrite($target);try{$s.Position=100;$s.WriteByte(77)}finally{$s.Dispose()}
            }
            return [pscustomobject]@{Code=0;Output='FIXTURE PULL'}
        }
        Check ($Arguments[2] -eq 'install' -and $Arguments[3] -eq '-r' -and $Arguments.Length -eq 5) 'Only one data-preserving fixture update allowed'
        $script:FixtureInstallCalls++
        Check (Test-Path -LiteralPath (Join-Path $env:LOCALAPPDATA 'JH\install-attempts')) 'Durable intent directory exists before dispatch'
        $journal=@(Get-ChildItem -LiteralPath (Join-Path $env:LOCALAPPDATA 'JH\install-attempts') -File)
        Check ($journal.Count -eq 1) 'Exactly one durable journal before dispatch'
        $j=Get-Content -LiteralPath $journal[0].FullName -Raw | ConvertFrom-Json
        Check ($j.run_id -ceq $RunId -and $j.unsigned_apk_sha256 -ceq $ExpectedUnsignedSha) 'Current intent saved before dispatch'
        $rc=0;if($CaseName -eq 'nonzero-install-exact-readback'){$rc=1}
        return [pscustomobject]@{Code=$rc;Output='FIXTURE INSTALL'}
    }
    $finalFixture=Join-Path $fixtureRoot 'SIGNED_APK_ONLY\JH231_NATIVE_EXACT_TARGET_ORIGINAL_CERT_SIGNED.apk'
    if($CaseName -in @('reuse-signed-apk','preserve-existing-signed-apk','already-installed-exact','uncertain-no-replay','resign-no-replay')){
        $null=New-Item -Path (Split-Path -Parent $finalFixture) -ItemType Directory
        Copy-Item -LiteralPath $unsignedFixture -Destination $finalFixture
    }
    if($CaseName -eq 'wrong-unsigned-hash'){$fixturePins.unsignedSha256='0'*64;FixtureText (Join-Path $fixtureRoot 'DELIVERY_PINS.json') ($fixturePins | ConvertTo-Json)}
    if($CaseName -eq 'wrong-source-lock'){$fixturePins.sourceLockSha256='0'*64;FixtureText (Join-Path $fixtureRoot 'DELIVERY_PINS.json') ($fixturePins | ConvertTo-Json)}
    if($CaseName -eq 'invalid-pins-schema'){$fixturePins.schema='WRONG';FixtureText (Join-Path $fixtureRoot 'DELIVERY_PINS.json') ($fixturePins | ConvertTo-Json)}
    if($CaseName -eq 'wrong-installed-version'){$script:FixtureBeforeVersion='229'}
    if($CaseName -eq 'already-installed-exact'){$script:FixtureBeforeVersion='231'}
    if($CaseName -in @('uncertain-no-replay','resign-no-replay')){$script:FixtureAfterVersion='230'}
    if($CaseName -eq 'preserve-readback-folder'){
        $preexistingScratch=Join-Path ([IO.Path]::GetTempPath()) ('JH231-device-read-'+$RunId)
        $null=New-Item -Path $preexistingScratch -ItemType Directory
        FixtureText (Join-Path $preexistingScratch 'keep.txt') 'PREEXISTING_READBACK_MUST_SURVIVE'
    }
    if($CaseName -eq 'preserve-existing-result'){
        $preexistingResult=Join-Path $fixtureRoot ('runs\'+$RunId+'\RESULT.txt')
        $null=New-Item -Path (Split-Path -Parent $preexistingResult) -ItemType Directory -Force
        FixtureText $preexistingResult 'PREEXISTING_RESULT_MUST_SURVIVE'
    }
    if($CaseName -eq 'result-fallback'){FixtureText (Join-Path $fixtureRoot 'runs') 'BLOCKER'}
    if($CaseName -eq 'all-result-writes-fail'){
        FixtureText (Join-Path $work 'not-directory') 'BLOCKER'
        function ReportDirectories {return @((Join-Path $work 'not-directory\child'))}
    }
    if($CaseName -like 'boot-*'){
        $bootSource=Get-Content -LiteralPath (Join-Path $fixtureRoot 'internal\BOOTSTRAP.ps1') -Raw -Encoding UTF8
        $fixtureBootPrelude=Join-Path $fixtureRoot 'internal\Fixture-Boot-Prelude.ps1'
        [IO.File]::WriteAllText($fixtureBootPrelude,($bootSource -split '# BOOTSTRAP_MAIN_ENTRY',2)[0],[Text.UTF8Encoding]::new($true))
        . $fixtureBootPrelude
        $BootRoot=$fixtureRoot
        function InvokeUpdateChild([string]$Runner,[string]$Id){
            $script:FixtureChildCalls++;$script:BootDispatched=$true
            if($CaseName -eq 'boot-no-receipt'){return [pscustomobject]@{Code=0}}
            $kind='JH231_SIGN_UPDATE_RESULT_V1';$idValue=$Id;$status='PASS_UPDATE_INSTALLED_VERIFIED';$code=0
            if($CaseName -eq 'boot-wrong-kind'){$kind='JH230_RESULT'}
            if($CaseName -eq 'boot-stale-run-id'){$idValue=[Guid]::NewGuid().ToString('N')}
            if($CaseName -eq 'boot-child-blocked'){$status='BLOCKED_NO_INSTALL';$code=2}
            $dir=Join-Path $BootRoot ('runs\'+$Id);$null=New-Item -Path $dir -ItemType Directory -Force
            FixtureText (Join-Path $dir 'RESULT.txt') ("REPORT_KIND: $kind`r`nRUN_ID: $idValue`r`nSTATUS: $status`r`n")
            return [pscustomobject]@{Code=$code}
        }
        if($CaseName -eq 'boot-parse-failure'){
            [IO.File]::AppendAllText((Join-Path $fixtureRoot 'internal\JH231-UPDATE.ps1'),"`r`nfunction Incomplete {",[Text.UTF8Encoding]::new($false))
        }
        if($CaseName -eq 'boot-automatic-variable'){
            [IO.File]::AppendAllText((Join-Path $fixtureRoot 'internal\JH231-UPDATE.ps1'),"`r`n`$Matches='fixture'`r`n",[Text.UTF8Encoding]::new($false))
        }
        if($CaseName -eq 'boot-bad-bom'){
            $path=Join-Path $fixtureRoot 'internal\JH231-UPDATE.ps1';$bytes=[IO.File]::ReadAllBytes($path);[IO.File]::WriteAllBytes($path,$bytes[3..($bytes.Length-1)])
        }
        FixtureManifest
        if($CaseName -eq 'boot-hash-mismatch'){FixtureText (Join-Path $fixtureRoot 'README_FIRST.md') 'CHANGED'}
        if($CaseName -eq 'boot-report-fallback'){FixtureText (Join-Path $fixtureRoot 'bootstrap-runs') 'BLOCKER'}
        if($CaseName -eq 'boot-all-reports-fail'){
            FixtureText (Join-Path $work 'not-directory') 'BLOCKER'
            function BootResultDirs {return @((Join-Path $work 'not-directory\child'))}
        }
        $resultCode=InvokeJh231Bootstrap
        if($CaseName -in @('boot-pass','boot-report-fallback')){Check ($resultCode -eq 0 -and $BootStatus -eq 'PASS_CURRENT_RUNNER_RESULT_VERIFIED') 'Bootstrap current success receipt'}
        elseif($CaseName -eq 'boot-child-blocked'){Check ($resultCode -eq 2 -and $BootStatus -eq 'BLOCKED_CHILD_REPORTED_NO_INSTALL') 'Bootstrap current blocked receipt'}
        elseif($CaseName -in @('boot-parse-failure','boot-automatic-variable','boot-bad-bom','boot-hash-mismatch')){Check ($resultCode -eq 2 -and $FixtureChildCalls -eq 0 -and $BootStatus -eq 'BLOCKED_NO_RUNNER_DISPATCH') 'Bootstrap preflight no dispatch'}
        elseif($CaseName -eq 'boot-all-reports-fail'){Check ($resultCode -eq 2 -and -not $BootSaved) 'Bootstrap cannot claim result saved'}
        else{Check ($resultCode -eq 2 -and $BootStatus -eq 'UNKNOWN_AFTER_RUNNER_DISPATCH_NO_REPLAY') 'Untrusted/missing current receipt is unknown'}
        Check ($FixtureInstallCalls -eq 0 -and $FixtureSignCalls -eq 0) 'Bootstrap test never touches sign/install'
    } else {
        $resultCode=Invoke-Jh231Update
        $expectedBlock=@('wrong-unsigned-hash','wrong-source-lock','invalid-pins-schema','missing-original-key','wrong-original-cert','wrong-repeat-cert','wrong-signed-cert','signed-payload-changed','no-device','multiple-devices','unauthorized-device','wrong-installed-version','wrong-installed-cert','debuggable-apk','preserve-current-sign-temp','preserve-readback-folder')
        if($CaseName -in $expectedBlock){Check ($resultCode -eq 2 -and $FixtureInstallCalls -eq 0 -and $Status -eq 'BLOCKED_NO_INSTALL') 'Blocked before install'}
        elseif($CaseName -eq 'already-installed-exact'){Check ($resultCode -eq 0 -and $FixtureInstallCalls -eq 0 -and $Status -eq 'ALREADY_INSTALLED_VERIFIED_NO_INSTALL') 'Already installed skip'}
        elseif($CaseName -eq 'all-result-writes-fail'){Check ($resultCode -eq 2 -and -not $ResultSaved) 'No false saved result'}
        elseif($CaseName -in @('post-install-wrong-hash','uncertain-no-replay','resign-no-replay')){Check ($resultCode -eq 2 -and $FixtureInstallCalls -eq 1 -and $Status -eq 'UPDATE_OUTCOME_UNCONFIRMED_NO_RETRY') 'Unconfirmed update no replay'}
        else{Check ($resultCode -eq 0 -and $FixtureInstallCalls -eq 1 -and $Status -eq 'PASS_UPDATE_INSTALLED_VERIFIED') 'Single update exact readback'}
        if($CaseName -in @('wrong-unsigned-hash','wrong-source-lock','invalid-pins-schema','missing-original-key','wrong-original-cert','wrong-repeat-cert','debuggable-apk')){Check ($FixtureSignCalls -eq 0) 'No signing before preconditions'}
        if($CaseName -in @('reuse-signed-apk','preserve-existing-signed-apk','already-installed-exact')){Check ($FixtureSignCalls -eq 0) 'Exact existing signed APK reused'}
        if($CaseName -eq 'preserve-existing-signed-apk'){Check ((Sha256 $finalFixture) -ceq $fixturePins.unsignedSha256) 'Existing signed fixture unmodified'}
        if($CaseName -eq 'preserve-current-sign-temp'){Check ((Get-Content -LiteralPath (Join-Path $DeliveryRoot ('SIGNED_APK_ONLY\jh231-'+$RunId+'.partial.apk')) -Raw) -ceq 'PREEXISTING_PARTIAL_MUST_SURVIVE') 'Preexisting partial never cleaned'}
        if($CaseName -eq 'preserve-readback-folder'){Check ((Get-Content -LiteralPath (Join-Path $preexistingScratch 'keep.txt') -Raw) -ceq 'PREEXISTING_READBACK_MUST_SURVIVE') 'Preexisting scratch never cleaned'}
        if($CaseName -eq 'preserve-existing-result'){Check ((Get-Content -LiteralPath $preexistingResult -Raw) -ceq 'PREEXISTING_RESULT_MUST_SURVIVE') 'Existing result never overwritten';Check ($ActualResultPath -cne $preexistingResult) 'New report uses fallback'}
        if($CaseName -eq 'result-fallback'){Check ($ActualResultPath.StartsWith($env:LOCALAPPDATA)) 'LocalAppData report fallback'}
        if($CaseName -in @('uncertain-no-replay','resign-no-replay')){
            if($CaseName -eq 'resign-no-replay'){
                $beforeHash=Sha256 $finalFixture
                $bytes=[IO.File]::ReadAllBytes($finalFixture);$extra=[Text.Encoding]::ASCII.GetBytes('fixture-new-signature-identity')
                $bytes[$bytes.Length-2]=[byte]$extra.Length;$bytes[$bytes.Length-1]=0
                [IO.File]::WriteAllBytes($finalFixture,($bytes+$extra))
                Check ((Sha256 $finalFixture) -cne $beforeHash) 'Synthetic resign hash changed'
                AssertPayloadUnchanged $unsignedFixture $finalFixture
            }
            $RunId=[Guid]::NewGuid().ToString('N');$Status='NOT_STARTED';$Reason='NOT_STARTED';$Stage='INIT'
            $InstallAttempted=$false;$AdbInstallStarted=$false;$ResultSaved=$false;$CreatedTempFile=$null;$ScratchFolder=$null;$OwnsMutex=$false;$RunLock=$null;$Mutex=$null
            $resultCode=Invoke-Jh231Update
            Check ($resultCode -eq 2 -and $FixtureInstallCalls -eq 1 -and $Reason -eq 'INSTALL_INTENT_ALREADY_EXISTS_OR_JOURNAL_FAILED_NO_RETRY') 'New run and changed signature cannot replay same unsigned intent'
        }
        if($CaseName -ne 'all-result-writes-fail'){
            Check ($ResultSaved -and (Test-Path -LiteralPath $ActualResultPath)) 'Current RESULT saved'
            $report=Get-Content -LiteralPath $ActualResultPath -Raw
            Check ($report.Contains('RUN_ID: '+$RunId) -and $report.Contains('REPORT_KIND: JH231_SIGN_UPDATE_RESULT_V1')) 'Current report identity'
            Check (-not $report.Contains('fixture-only') -and -not $report.Contains('synthetic-not-a-key')) 'No credential or key path in reports'
        }
    }
    Write-Host ('FIXTURE_PASS: '+$CaseName)
    $exitCode=0
} catch {
    Write-Host ('FIXTURE_FAIL: '+$CaseName+' '+$_.Exception.Message)
    Write-Host $_.ScriptStackTrace
} finally {
    $env:LOCALAPPDATA=$oldLocal;$env:TEMP=$oldTemp;$env:TMP=$oldTmp
    if(Test-Path -LiteralPath $work){Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue}
}
exit $exitCode
