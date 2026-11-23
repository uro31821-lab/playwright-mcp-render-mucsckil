param([ValidatePattern('^[a-f0-9]{32}$')][string]$RunId = [Guid]::NewGuid().ToString('N'))
# JH231 exact native target candidate. Original PC only; no remote key transfer.
# Candidate pins MUST be finalized from the actual verified unsigned build.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$PackageId = 'com.koreanlifehub.bridge'
$FromVersion = '230'
$FromName = 'jh230-kabiseo-v2-frame-lease-secure56'
$ToVersion = '231'
$ToName = 'NOT_LOADED'
$ExpectedUnsignedSha = 'NOT_LOADED'
$ExpectedUnsignedBytes = [int64]0
$ExpectedSourceLockSha = 'NOT_LOADED'
$Certificate = '7cc577efe48e865fdbe799b92aa9edf89724631361ae97979f2b8e4a940a288b'
$ExpectedCertificate = $Certificate
$CrashBaseline = [datetime]'2026-11-22T15:00:55'
$DeliveryRoot = Split-Path -Parent $PSScriptRoot
$Status = 'BLOCKED_NOT_STARTED'
$Stage = 'INIT'
$Reason = 'NOT_STARTED'
$SignedSha = 'NOT_VERIFIED'
$SignedFile = 'NOT_CREATED'
$SignAttempted = $false
$InstallAttempted = $false
$AdbInstallStarted = $false
$DeviceReadback = 'NOT_RUN'
$AttemptRecord = 'NOT_CREATED'
$KeySource = 'NOT_READ'
$ScratchFolder = $null
$CreatedTempFile = $null
$RunLock = $null
$Mutex = $null
$OwnsMutex = $false
$ResultSaved = $false
$ActualResultPath = 'NOT_SAVED'
$SecretVars = @('JH231_LOCAL_KS_PASSWORD','JH231_LOCAL_KEY_PASSWORD')
$Checks = New-Object 'System.Collections.Generic.List[string]'

function Evidence([string]$Name,[string]$Value) { $script:Checks.Add($Name + ': ' + $Value) }
function SetJh231Stage([string]$Value) {
    $script:Stage=$Value
    Write-Host ('[JH231] '+$Value+' UTC='+[DateTime]::UtcNow.ToString('o')+' RunId='+$RunId)
}
function AddLog([string]$Field,[string]$Value) { Evidence $Field $Value }
function Sha256([string]$File) { return (Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash.ToLowerInvariant() }
function Hash256([string]$File) { return Sha256 $File }
function TextSha([string]$Value) {
    $hasher = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($Value)))).Replace('-','').ToLowerInvariant() }
    finally { $hasher.Dispose() }
}
function ExecNative([string]$Exe,[string[]]$Arguments) {
    $priorEap = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $nativeLines = @(& $Exe @Arguments 2>&1 | ForEach-Object { $_.ToString() })
        $nativeExit = $LASTEXITCODE
    } finally { $ErrorActionPreference = $priorEap }
    return [pscustomobject]@{Code=$nativeExit;Output=($nativeLines -join "`n")}
}
function WriteNewUtf8([string]$Path,[string]$Text) {
    $writer = $null
    try {
        $writer = [IO.FileStream]::new($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
        $bytes = ([Text.UTF8Encoding]::new($false)).GetBytes($Text)
        $writer.Write($bytes,0,$bytes.Length)
        $writer.Flush($true)
    } finally { if($null -ne $writer) { $writer.Dispose() } }
}
function ReportDirectories {
    $dirs = New-Object 'System.Collections.Generic.List[string]'
    $dirs.Add((Join-Path $DeliveryRoot ('runs\'+$RunId)))
    if($env:LOCALAPPDATA) { $dirs.Add((Join-Path $env:LOCALAPPDATA ('JH\delivery-results\'+$RunId))) }
    $dirs.Add((Join-Path ([IO.Path]::GetTempPath()) ('JH231-result-'+$RunId)))
    return $dirs.ToArray()
}
function SaveResult {
    $report = New-Object 'System.Collections.Generic.List[string]'
    foreach($line in @(
        'REPORT_KIND: JH231_SIGN_UPDATE_RESULT_V1',('RUN_ID: '+$RunId),
        ('UTC: '+[DateTime]::UtcNow.ToString('o')),('STATUS: '+$script:Status),
        ('STAGE: '+$script:Stage),('REASON: '+$script:Reason),
        ('APP_ID: '+$PackageId),('EXPECTED_FROM_VERSION: '+$FromVersion),('EXPECTED_TO_VERSION: '+$ToVersion),
        ('UNSIGNED_APK_SHA256: '+$ExpectedUnsignedSha),('SOURCE_LOCK_SHA256: '+$ExpectedSourceLockSha),
        ('EXPECTED_ORIGINAL_CERT_SHA256: '+$Certificate),('SIGNED_APK_SHA256: '+$script:SignedSha),
        ('SIGN_ATTEMPT_STARTED: '+$script:SignAttempted),('INSTALL_ATTEMPT_STARTED: '+$script:InstallAttempted),
        ('ADB_INSTALL_COMMAND_DISPATCHED: '+$script:AdbInstallStarted),('INSTALL_ATTEMPT_LEDGER: '+$script:AttemptRecord),
        ('DEVICE_READBACK: '+$script:DeviceReadback),'APK_REBUILD: NOT_RUN',
        'APP_UNINSTALL_OR_DATA_CLEAR: NEVER','AUTOMATIC_REPLAY: NEVER','KEY_UPLOAD: NEVER',
        'PHONE_FEATURE_E2E: NOT_RUN','SERVER_DEPLOY: NOT_RUN')) { $report.Add($line) }
    foreach($entry in $script:Checks) { $report.Add($entry) }
    $reportText = ($report.ToArray() -join "`r`n")+"`r`n"
    foreach($dir in @(ReportDirectories)) {
        try {
            if(-not (Test-Path -LiteralPath $dir -PathType Container)) { $null=New-Item -Path $dir -ItemType Directory -Force -ErrorAction Stop }
            $file = Join-Path $dir 'RESULT.txt'
            WriteNewUtf8 $file $reportText
            $script:ActualResultPath = $file
            $script:ResultSaved = $true
            Write-Host ('RESULT_PATH: '+$file)
            return
        } catch { }
    }
    Write-Host 'RESULT_WRITE_FAILED'
}
function LoadReleasePins {
    $pinPath=Join-Path $DeliveryRoot 'DELIVERY_PINS.json'
    if(-not (Test-Path -LiteralPath $pinPath -PathType Leaf)) { throw 'RELEASE_PINS_MISSING_EXTRACT_ALL' }
    $pinInfo=Get-Item -LiteralPath $pinPath -ErrorAction Stop
    if($pinInfo.Length -lt 2 -or $pinInfo.Length -gt 4096 -or ($pinInfo.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'RELEASE_PINS_TYPE_OR_SIZE_REJECTED' }
    $pins=Get-Content -LiteralPath $pinPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $pinNames=@($pins.PSObject.Properties.Name | Sort-Object)
    $expectedNames=@('schema','package','fromVersion','fromName','toVersion','toName','unsignedSha256','unsignedBytes','sourceLockSha256','certificateSha256' | Sort-Object)
    if(($pinNames -join '|') -cne ($expectedNames -join '|') -or $pins.schema -cne 'JH231_UNSIGNED_RELEASE_PINS_V1' -or
       $pins.package -cne $PackageId -or [string]$pins.fromVersion -cne $FromVersion -or $pins.fromName -cne $FromName -or
       [string]$pins.toVersion -cne $ToVersion -or $pins.certificateSha256 -cne $Certificate -or
       [string]$pins.unsignedBytes -cnotmatch '^[1-9][0-9]{0,9}$') { throw 'CANDIDATE_PINS_NOT_FINALIZED_NO_ACTION' }
    $script:ToName=[string]$pins.toName
    $script:ExpectedUnsignedSha=[string]$pins.unsignedSha256
    $script:ExpectedUnsignedBytes=[int64]$pins.unsignedBytes
    $script:ExpectedSourceLockSha=[string]$pins.sourceLockSha256
}
function AssertPinsAndInput {
    LoadReleasePins
    if($ExpectedUnsignedSha -cnotmatch '^[a-f0-9]{64}$' -or $ExpectedSourceLockSha -cnotmatch '^[a-f0-9]{64}$' -or
        $ExpectedUnsignedBytes -le 0 -or $ToName -notmatch '^jh231-[a-z0-9-]+$') { throw 'CANDIDATE_PINS_NOT_FINALIZED_NO_ACTION' }
    if($DeliveryRoot.Length -gt 140) { throw 'EXTRACT_PATH_TOO_LONG_USE_SHORT_LOCAL_PATH' }
    foreach($rel in @('README_FIRST.md','POWER_SHELL_ERROR_CHECKLIST.txt','payload\app-release-unsigned.apk','payload\SOURCE_LOCK.json')) {
        $file = Join-Path $DeliveryRoot $rel
        if(-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw 'REQUIRED_DELIVERY_FILE_MISSING_EXTRACT_ALL' }
        if(((Get-Item -LiteralPath $file).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'DELIVERY_REPARSE_FILE_REJECTED' }
    }
    $unsigned = Join-Path $DeliveryRoot 'payload\app-release-unsigned.apk'
    $sourceLock = Join-Path $DeliveryRoot 'payload\SOURCE_LOCK.json'
    if((Sha256 $unsigned) -cne $ExpectedUnsignedSha -or (Get-Item -LiteralPath $unsigned).Length -ne $ExpectedUnsignedBytes -or
        (Sha256 $sourceLock) -cne $ExpectedSourceLockSha) { throw 'PINNED_UNSIGNED_APK_OR_SOURCE_LOCK_MISMATCH' }
    Evidence 'EXACT_UNSIGNED_INPUT_AND_SOURCE_LOCK' 'PASS'
    return $unsigned
}
function AssertTargetMetadata([string]$Path,[object]$Tools) {
    $meta=ApkMetadata $Path $Tools.Aapt
    if($meta.Package -cne $PackageId -or $meta.Version -cne $ToVersion -or $meta.Name -cne $ToName) { throw 'TARGET_APK_ID_VERSION_DEBUG_MISMATCH' }
}
function AssertPayloadUnchanged([string]$Unsigned,[string]$Signed) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $left=$null; $right=$null
    try {
        $left=[IO.Compression.ZipFile]::OpenRead($Unsigned)
        $right=[IO.Compression.ZipFile]::OpenRead($Signed)
        $sourceEntries=@($left.Entries | Where-Object { -not $_.FullName.EndsWith('/') })
        $signedEntries=@($right.Entries | Where-Object { -not $_.FullName.EndsWith('/') })
        if($sourceEntries.Count -ne $signedEntries.Count -or
            @($sourceEntries.FullName | Select-Object -Unique).Count -ne $sourceEntries.Count -or
            @($signedEntries.FullName | Select-Object -Unique).Count -ne $signedEntries.Count) { throw 'SIGNED_APK_PAYLOAD_ENTRY_SET_MISMATCH' }
        foreach($entry in $sourceEntries) {
            $other=$right.GetEntry($entry.FullName)
            if($null -eq $other -or $entry.Length -ne $other.Length) { throw 'SIGNED_APK_PAYLOAD_ENTRY_MISMATCH' }
            $a=$null; $b=$null; $ha=$null; $hb=$null
            try {
                $a=$entry.Open(); $b=$other.Open()
                $ha=[Security.Cryptography.SHA256]::Create(); $hb=[Security.Cryptography.SHA256]::Create()
                if([BitConverter]::ToString($ha.ComputeHash($a)) -cne [BitConverter]::ToString($hb.ComputeHash($b))) { throw 'SIGNED_APK_PAYLOAD_BYTES_CHANGED' }
            } finally { if($a){$a.Dispose()}; if($b){$b.Dispose()}; if($ha){$ha.Dispose()}; if($hb){$hb.Dispose()} }
        }
    } finally { if($left){$left.Dispose()}; if($right){$right.Dispose()} }
}
function AssertSignedCandidate([string]$Unsigned,[string]$Signed,[object]$Tools) {
    AssertTargetMetadata $Signed $Tools
    if((ApkCertificate $Signed $Tools.Signer) -cne $Certificate) { throw 'SIGNED_CERT_NOT_ORIGINAL' }
    AssertPayloadUnchanged $Unsigned $Signed
}
function AssertCrashGate {
    try {
        $events=@(Get-WinEvent -FilterHashtable @{LogName='System';Id=@(41,1001);StartTime=$CrashBaseline} -ErrorAction Stop)
    } catch {
        if($_.FullyQualifiedErrorId -like 'NoMatchingEventsFound*') { $events=@() }
        else { throw 'WINDOWS_EVENT_LOG_UNAVAILABLE_STOP' }
    }
    $relevant=@($events | Where-Object {($_.Id -eq 41 -and $_.ProviderName -match 'Kernel-Power') -or ($_.Id -eq 1001 -and $_.ProviderName -match 'WER-SystemErrorReporting')})
    Evidence 'NEW_WINDOWS_KERNELPOWER_OR_BUGCHECK' ([string]$relevant.Count)
    if($relevant.Count -gt 0) { throw 'NEW_WINDOWS_CRASH_SINCE_PREVIOUS_AUDIT_STOP' }
}

function Find-Keytool {
  $cmd = Get-Command 'keytool.exe' -ErrorAction SilentlyContinue
  if($cmd) {return $cmd.Source}
  if($env:JAVA_HOME) {
    $candidate = Join-Path $env:JAVA_HOME 'bin\keytool.exe'
    if(Test-Path -LiteralPath $candidate -PathType Leaf) {return $candidate}
  }
  $java = Get-Command 'java.exe' -ErrorAction SilentlyContinue
  if($java) {
    $candidate = Join-Path (Split-Path -Parent $java.Source) 'keytool.exe'
    if(Test-Path -LiteralPath $candidate -PathType Leaf) {return $candidate}
  }
  $jbr = Join-Path $env:ProgramFiles 'Android\Android Studio\jbr\bin\keytool.exe'
  if(Test-Path -LiteralPath $jbr -PathType Leaf) {return $jbr}
  throw 'KEYTOOL_NOT_FOUND_LOCAL_JDK'
}

function Set-TemporarySecret([string]$Name,[string]$Value) {
  [Environment]::SetEnvironmentVariable($Name,$Value,'Process')
}
function Clear-TemporarySecrets {
  foreach($name in $SecretVars) {[Environment]::SetEnvironmentVariable($name,$null,'Process')}
}
function Read-PublicSignerCert([string]$Tool,[string]$KeyStore,[string]$Alias) {
  $oldEap = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $out = (& $Tool '-J-Duser.language=en' '-J-Duser.country=US' -list -v -keystore $KeyStore -alias $Alias '-storepass:env' 'JH231_LOCAL_KS_PASSWORD' 2>&1 | Out-String)
    $rc = $LASTEXITCODE
  } finally {$ErrorActionPreference = $oldEap}
  if($rc -ne 0) {return 'CERT_LOOKUP_FAILED'}
  $find = [regex]::Match($out,'(?im)^\s*SHA256\s*:\s*([0-9a-f:]{64,95})\s*$')
  if(-not $find.Success) {return 'CERT_PARSE_FAILED'}
  return $find.Groups[1].Value.Replace(':','').ToLowerInvariant()
}
function Auto-FindOriginalSigner([string]$KeyTool,[string]$BuildRoot) {
  # EXACT JH222-LIB.ps1 lineage: %LOCALAPPDATA%\JH\signing\<cert>.json
  # Version V5 already completed a bounded scan. Do NOT repeat it.
  # NEVER read passwords from ChatGPT/handoff documents, scan config secrets,
  # create new keys, or accept a keystore whose certificate differs.
  $script:KeySource='EXACT_JH222_LOCATOR_RECOVERY_PENDING'
  $candidates=New-Object 'System.Collections.Generic.List[object]'
  $seen=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
  $locatorStatus='NOT_FOUND'
  $locatorPath=$null
  if($env:LOCALAPPDATA) {
    $locatorPath=Join-Path $env:LOCALAPPDATA ('JH\signing\'+$ExpectedCertificate+'.json')
    if(Test-Path -LiteralPath $locatorPath -PathType Leaf) {
      $locatorStatus='INVALID'
      try {
        $info=Get-Item -LiteralPath $locatorPath -Force -ErrorAction Stop
        if($info.Length -gt 0 -and $info.Length -le 16384 -and
           ($info.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) {
          $record=Get-Content -LiteralPath $locatorPath -Raw -Encoding UTF8 | ConvertFrom-Json
          $p=[string]$record.path
          $sha=[string]$record.keySha256
          if($record.schema -ceq 'JH_ORIGINAL_KEY_LOCATOR_V1' -and
             $record.certificateSha256 -ceq $ExpectedCertificate -and
             $p -cmatch '^[A-Za-z]:[\\/]' -and
             $sha -cmatch '^[a-f0-9]{64}$' -and
             (Test-Path -LiteralPath $p -PathType Leaf)) {
            $f=Get-Item -LiteralPath $p -Force -ErrorAction Stop
            if($f.Length -gt 0 -and $f.Length -le 10485760 -and
               ($f.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0 -and
               (Hash256 $p) -ceq $sha) {
              [void]$candidates.Add(@{Path=$p;Source='VERIFIED_LOCAL_LOCATOR';PinnedSha=$sha})
              [void]$seen.Add($p)
              $locatorStatus='VALID_KEYFILE_SHA_MATCH'
            } else {$locatorStatus='KEYFILE_SHA_OR_TYPE_MISMATCH'}
          } else {$locatorStatus='RECORD_OR_KEY_MISSING'}
        } else {$locatorStatus='LOCATOR_SIZE_OR_LINK_REJECTED'}
      } catch {$locatorStatus='UNREADABLE_OR_INVALID'}
    }
  } else {$locatorStatus='LOCALAPPDATA_UNAVAILABLE'}
  AddLog 'JH222_EXACT_LOCATOR_STATUS' $locatorStatus
  AddLog 'JH222_EXACT_LOCATOR_USED' ([string]($locatorStatus -eq 'VALID_KEYFILE_SHA_MATCH'))
  # The previous successful signer allowed this explicit local path; never
  # print its actual value in reports. It still must match the exact cert.
  foreach($name in @('JH_ORIGINAL_KEYSTORE','JH_ORIGINAL_KEYSTORE_PATH',
     'JH230_LOCAL_KEYSTORE_PATH')) {
    $p=[Environment]::GetEnvironmentVariable($name,'Process')
    if([string]::IsNullOrWhiteSpace($p)){continue}
    if($p -notmatch '^[A-Za-z]:[\\/]'){continue}
    if(-not (Test-Path -LiteralPath $p -PathType Leaf)){continue}
    try {
      $f=Get-Item -LiteralPath $p -Force -ErrorAction Stop
      if($f.Length -le 0 -or $f.Length -gt 10485760 -or
          ($f.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){continue}
      if($seen.Add($f.FullName)){
        [void]$candidates.Add(@{Path=$f.FullName;Source='EXISTING_LOCAL_ENV_PATH'})
      }
    } catch {}
  }
  AddLog 'DIRECT_ORIGINAL_SIGNER_CANDIDATES' ([string]$candidates.Count)
  if($candidates.Count -eq 0){throw 'EXACT_JH222_SIGNER_LOCATOR_NOT_FOUND_OR_INVALID_NO_SIGN'}
  # Only the ORIGINAL JH222-LIB environment interface and its public default,
  # never a password from chat, a memory store, an arbitrary file, or a guess list.
  $store=[Environment]::GetEnvironmentVariable('JH_ORIGINAL_KEYSTORE_PASS','Process')
  $credentialSource='JH222_DEFAULT_LOCAL'
  if(-not $store){$store=[Environment]::GetEnvironmentVariable('JH218_STOREPASS','Process')}
  if($store){$credentialSource='JH222_LOCAL_ENVIRONMENT'}
  if(-not $store){$store='android'}
  $keyPass=[Environment]::GetEnvironmentVariable('JH_ORIGINAL_KEY_PASS','Process')
  if(-not $keyPass){$keyPass=[Environment]::GetEnvironmentVariable('JH218_KEYPASS','Process')}
  if(-not $keyPass){$keyPass=$store}
  AddLog 'CREDENTIAL_SOURCE' $credentialSource
  $readable=0
  foreach($item in $candidates) {
    $p=[string]$item.Path
    Set-TemporarySecret 'JH231_LOCAL_KS_PASSWORD' $store
    $txt='';$rc=1;$oldEap=$ErrorActionPreference
    try {
      $ErrorActionPreference='Continue'
      $txt=(& $KeyTool '-J-Duser.language=en' '-J-Duser.country=US' '-list' '-v' '-keystore' $p '-storepass:env' 'JH231_LOCAL_KS_PASSWORD' 2>&1 | Out-String)
      $rc=$LASTEXITCODE
    } catch {} finally {$ErrorActionPreference=$oldEap;Clear-TemporarySecrets}
    if($rc -ne 0){continue}
    $readable++
    $entries=[regex]::Split($txt,'(?im)^\s*Alias name:\s*')
    foreach($entry in ($entries | Select-Object -Skip 1)){
      $alias=($entry -split "`r?`n",2)[0].Trim()
      if(-not $alias -or $alias.Length -gt 128 -or $alias -notmatch '^[a-zA-Z0-9._-]+$') {continue}
      if($entry -notmatch '(?im)^\s*Entry type:\s*PrivateKeyEntry\s*$'){continue}
      $fp=[regex]::Match($entry,'(?im)^\s*SHA\s*-?\s*256\s*:\s*([0-9a-f:]{64,95})\s*$')
      if($fp.Success -and $fp.Groups[1].Value.Replace(':','').ToLowerInvariant() -ceq $ExpectedCertificate){
        AddLog 'DIRECT_ORIGINAL_SIGNER_CERT' 'PASS'
        return @{Path=$p;Alias=$alias;StorePassword=$store;KeyPassword=$keyPass;
           Certificate=$ExpectedCertificate;Origin=[string]$item.Source}
      }
    }
  }
  AddLog 'DIRECT_KEYSTORE_READABLE' ([string]$readable)
  if($readable -eq 0){throw 'EXACT_LOCATOR_PRESENT_BUT_LOCAL_PASSWORD_UNAVAILABLE_OR_INVALID'}
  throw 'EXACT_LOCATOR_CERTIFICATE_MISMATCH_NO_SIGN'
}


function FindAndroidTools {
    $roots = New-Object 'System.Collections.Generic.List[string]'
    foreach($r in @($env:ANDROID_SDK_ROOT,$env:ANDROID_HOME)) {
        if($r -and -not $roots.Contains($r)) { $roots.Add($r) }
    }
    if($env:LOCALAPPDATA) {
        $r = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
        if(-not $roots.Contains($r)) { $roots.Add($r) }
    }
    foreach($root in $roots) {
        $adb = Join-Path $root 'platform-tools\adb.exe'
        $bt = Join-Path $root 'build-tools'
        if(-not (Test-Path -LiteralPath $adb -PathType Leaf) -or
           -not (Test-Path -LiteralPath $bt -PathType Container)) {continue}
        foreach($dir in @(Get-ChildItem -LiteralPath $bt -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending)) {
            $aapt = Join-Path $dir.FullName 'aapt.exe'
            $signer = Join-Path $dir.FullName 'apksigner.bat'
            if((Test-Path -LiteralPath $aapt -PathType Leaf) -and (Test-Path -LiteralPath $signer -PathType Leaf)) {
                Evidence 'BUILD_TOOLS_VERSION' $dir.Name
                return [pscustomobject]@{Adb=$adb;Aapt=$aapt;Signer=$signer}
            }
        }
    }
    throw 'ANDROID_SDK_TOOLS_NOT_FOUND'
}

function ApkMetadata([string]$Apk,[string]$Aapt) {
    $r = ExecNative $Aapt @('dump','badging',$Apk)
    if($r.Code -ne 0) {throw 'AAPT_BADGING_FAILED'}
    $m = [regex]::Match($r.Output,"(?m)^package:\s+name='([^']+)'\s+versionCode='([^']+)'\s+versionName='([^']*)'")
    if(-not $m.Success) {throw 'APK_METADATA_PARSE_FAILED'}
    if($r.Output -match 'application-debuggable') {throw 'DEBUGGABLE_APK_REJECTED'}
    return [pscustomobject]@{Package=$m.Groups[1].Value;Version=$m.Groups[2].Value;Name=$m.Groups[3].Value}
}
function ApkCertificate([string]$Apk,[string]$Signer) {
    $r = ExecNative $Signer @('verify','--print-certs',$Apk)
    if($r.Code -ne 0) {throw 'APKSIGNER_VERIFY_FAILED'}
    $certs = [regex]::Matches($r.Output,'(?im)^\s*Signer\s+#\d+\s+certificate\s+SHA-256\s+digest:\s*([a-f0-9:]{64,95})\s*$')
    if($certs.Count -ne 1) {throw 'APK_SIGNER_CERTIFICATE_PARSE_OR_COUNT_FAILED'}
    return $certs[0].Groups[1].Value.Replace(':','').ToLowerInvariant()
}
function GetOneDevice([string]$Adb) {
    $r = ExecNative $Adb @('devices')
    if($r.Code -ne 0) {throw 'ADB_DEVICES_FAILED'}
    $lines = @($r.Output -split '\r?\n')
    $authorized = @($lines | Where-Object {$_ -match '^\S+\s+device\s*$'})
    $other = @($lines | Where-Object {$_ -match '^\S+\s+(unauthorized|offline|recovery|sideload)\s*$'})
    Evidence 'AUTHORIZED_DEVICE_COUNT' ([string]$authorized.Count)
    Evidence 'OTHER_DEVICE_COUNT' ([string]$other.Count)
    if($authorized.Count -ne 1 -or $other.Count -ne 0) {throw 'REQUIRE_EXACTLY_ONE_AUTHORIZED_USB_DEVICE'}
    $serial = [regex]::Match($authorized[0],'^([^\s]+)').Groups[1].Value
    if(-not $serial) {throw 'ADB_DEVICE_PARSE_FAILED'}
    return $serial
}
function ReadInstalledApk([object]$Tools,[string]$Serial,[string]$Label) {
    $r = ExecNative $Tools.Adb @('-s',$Serial,'shell','pm','path',$PackageId)
    if($r.Code -ne 0) {throw 'DEVICE_PM_PATH_FAILED'}
    $basePaths = @($r.Output -split '\r?\n' | Where-Object {$_ -match '^package:/.*?/base\.apk\s*$'} | ForEach-Object {$_.Substring(8).Trim()})
    if($basePaths.Count -ne 1) {throw 'DEVICE_BASE_APK_PATH_NOT_UNIQUE'}
    $local = Join-Path $ScratchFolder ($Label+'-installed-base.apk')
    $pull = ExecNative $Tools.Adb @('-s',$Serial,'pull',$basePaths[0],$local)
    if($pull.Code -ne 0 -or -not (Test-Path -LiteralPath $local -PathType Leaf) -or (Get-Item -LiteralPath $local).Length -lt 5000000) {
        throw 'ADB_PULL_INSTALLED_APK_FAILED'
    }
    $meta = ApkMetadata $local $Tools.Aapt
    $cert = ApkCertificate $local $Tools.Signer
    if(($Label -eq 'AFTER' -or ($Label -eq 'BEFORE' -and $meta.Version -eq $ToVersion)) -and
       (Sha256 $local) -ne $SignedSha) {throw 'INSTALLED_231_APK_HASH_MISMATCH_NO_RETRY'}
    if($meta.Package -ne $PackageId -or $cert -ne $Certificate) {throw 'DEVICE_PACKAGE_OR_CERT_NOT_EXPECTED'}
    Evidence ($Label+'_VERSION') $meta.Version
    Evidence ($Label+'_SIGNER_MATCH') 'PASS'
    return $meta
}

function SignOrReuse([string]$Unsigned,[object]$Tools) {
    $outputDir=Join-Path $DeliveryRoot 'SIGNED_APK_ONLY'
    $finalApk=Join-Path $outputDir 'JH231_NATIVE_EXACT_TARGET_ORIGINAL_CERT_SIGNED.apk'
    if(Test-Path -LiteralPath $finalApk -PathType Leaf) {
        if(((Get-Item -LiteralPath $finalApk).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'SIGNED_OUTPUT_REPARSE_REJECTED' }
        AssertSignedCandidate $Unsigned $finalApk $Tools
        Evidence 'ORIGINAL_CERT_SIGNED_APK_REUSED' 'YES_EXACT_PAYLOAD_VERIFIED'
        return $finalApk
    }
    if(Test-Path -LiteralPath $outputDir -PathType Container) {
        if(@(Get-ChildItem -LiteralPath $outputDir -Filter '*.partial.apk' -File -ErrorAction Stop).Count -gt 0) { throw 'PREVIOUS_SIGN_PARTIAL_EXISTS_REVIEW_REQUIRED' }
    } else { $null=New-Item -Path $outputDir -ItemType Directory -ErrorAction Stop }
    $keytool=Find-Keytool
    $found=Auto-FindOriginalSigner $keytool $DeliveryRoot
    if($found.Certificate -cne $Certificate) { throw 'ORIGINAL_SIGNER_CERT_PRECHECK_FAILED' }
    Set-TemporarySecret 'JH231_LOCAL_KS_PASSWORD' $found.StorePassword
    try { $repeatCert=Read-PublicSignerCert $keytool $found.Path $found.Alias }
    finally { Clear-TemporarySecrets }
    if($repeatCert -cne $Certificate) { throw 'ORIGINAL_SIGNER_CERT_INDEPENDENT_READBACK_FAILED' }
    $tempCandidate=Join-Path $outputDir ('jh231-'+$RunId+'.partial.apk')
    if(Test-Path -LiteralPath $tempCandidate) { throw 'CURRENT_SIGN_TEMP_ALREADY_EXISTS_NO_OVERWRITE' }
    # Claim a new empty file before assigning cleanup ownership.
    WriteNewUtf8 $tempCandidate ''
    $script:CreatedTempFile=$tempCandidate
    Set-TemporarySecret 'JH231_LOCAL_KS_PASSWORD' $found.StorePassword
    Set-TemporarySecret 'JH231_LOCAL_KEY_PASSWORD' $found.KeyPassword
    $script:SignAttempted=$true
    try {
        $signed=ExecNative $Tools.Signer @('sign','--ks',$found.Path,'--ks-key-alias',$found.Alias,
            '--ks-pass','env:JH231_LOCAL_KS_PASSWORD','--key-pass','env:JH231_LOCAL_KEY_PASSWORD',
            '--v1-signing-enabled','false','--v2-signing-enabled','true','--v3-signing-enabled','true',
            '--v4-signing-enabled','false','--out',$script:CreatedTempFile,$Unsigned)
    } finally { Clear-TemporarySecrets; $found=$null }
    if($signed.Code -ne 0 -or -not (Test-Path -LiteralPath $script:CreatedTempFile -PathType Leaf)) { throw 'ORIGINAL_CERT_SIGN_FAILED_NO_INSTALL' }
    AssertSignedCandidate $Unsigned $script:CreatedTempFile $Tools
    if((Sha256 $Unsigned) -cne $ExpectedUnsignedSha) { throw 'UNSIGNED_INPUT_CHANGED_DURING_SIGN' }
    $tempSha=Sha256 $script:CreatedTempFile
    [IO.File]::Move($script:CreatedTempFile,$finalApk)
    $script:CreatedTempFile=$null
    if((Sha256 $finalApk) -cne $tempSha) { throw 'SIGNED_OUTPUT_POST_MOVE_HASH_MISMATCH' }
    Evidence 'ORIGINAL_CERT_SIGNED_APK_REUSED' 'NO_NEW_ORIGINAL_CERT_SIGN_VERIFIED'
    return $finalApk
}
function CreateInstallJournal([string]$Serial) {
    if(-not $env:LOCALAPPDATA) { throw 'LOCALAPPDATA_REQUIRED_FOR_INSTALL_JOURNAL' }
    $deviceDigest=TextSha ('JH231-device-v1|'+$Serial)
    $intent=TextSha ($PackageId+'|'+$ExpectedUnsignedSha+'|'+$Certificate+'|'+$deviceDigest)
    $ledgerDir=Join-Path $env:LOCALAPPDATA 'JH\install-attempts'
    if(-not (Test-Path -LiteralPath $ledgerDir -PathType Container)) { $null=New-Item -Path $ledgerDir -ItemType Directory -Force -ErrorAction Stop }
    $ledger=Join-Path $ledgerDir ('JH231-'+$intent+'.json')
    $record=[ordered]@{
        schema='JH231_DATA_PRESERVING_INSTALL_INTENT_V1';run_id=$RunId;
        package=$PackageId;unsigned_apk_sha256=$ExpectedUnsignedSha;signed_apk_sha256=$script:SignedSha;
        certificate_sha256=$Certificate;device_digest=$deviceDigest;from_version=$FromVersion;to_version=$ToVersion;
        created_at_utc=[DateTime]::UtcNow.ToString('o');action='SINGLE_ADB_INSTALL_R';automatic_replay=$false
    }
    try { WriteNewUtf8 $ledger ($record | ConvertTo-Json -Compress) }
    catch { throw 'INSTALL_INTENT_ALREADY_EXISTS_OR_JOURNAL_FAILED_NO_RETRY' }
    $script:AttemptRecord='DURABLE_CREATE_NEW_AND_FLUSH_BEFORE_DISPATCH'
    $script:InstallAttempted=$true
}
function Invoke-Jh231Update {
    try {
        SetJh231Stage 'INPUT_PREFLIGHT'
        $unsigned=AssertPinsAndInput
        SetJh231Stage 'LOCK'
        $script:Mutex=[Threading.Mutex]::new($false,'Local\JH231_ORIGINAL_CERT_SIGN_UPDATE_V1')
        try { $script:OwnsMutex=$script:Mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $script:OwnsMutex=$true }
        if(-not $script:OwnsMutex) { throw 'ANOTHER_SIGN_UPDATE_RUNNING_NO_ACTION' }
        $script:RunLock=[IO.FileStream]::new((Join-Path $DeliveryRoot '.jh231-running.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
        SetJh231Stage 'TOOLS'
        $tools=FindAndroidTools
        AssertTargetMetadata $unsigned $tools
        SetJh231Stage 'EXISTING_WINDOWS_CRASH_GATE'
        AssertCrashGate
        SetJh231Stage 'SIGN_OR_REUSE'
        $apk=SignOrReuse $unsigned $tools
        $script:SignedSha=Sha256 $apk
        $script:SignedFile=$apk
        SetJh231Stage 'DEVICE_PRECHECK'
        $serial=GetOneDevice $tools.Adb
        $scratchCandidate=Join-Path ([IO.Path]::GetTempPath()) ('JH231-device-read-'+$RunId)
        $null=New-Item -Path $scratchCandidate -ItemType Directory -ErrorAction Stop
        $script:ScratchFolder=$scratchCandidate
        $before=ReadInstalledApk $tools $serial 'BEFORE'
        if($before.Version -ceq $ToVersion -and $before.Name -ceq $ToName) {
            $script:DeviceReadback='EXACT_PACKAGE_VERSION_CERT_AND_APK_SHA_ALREADY_INSTALLED'
            $script:Status='ALREADY_INSTALLED_VERIFIED_NO_INSTALL'
            SetJh231Stage 'DONE'
            $script:Reason='CURRENT_PHONE_ALREADY_HAS_EXACT_SIGNED_APK'
        } elseif($before.Version -cne $FromVersion -or $before.Name -cne $FromName) {
            throw 'CURRENT_PHONE_VERSION_DIFFERS_NO_INSTALL'
        } else {
            SetJh231Stage 'FINAL_INPUT_RECHECK'
            if((Sha256 $unsigned) -cne $ExpectedUnsignedSha -or (Sha256 $apk) -cne $script:SignedSha) { throw 'APK_CHANGED_BEFORE_INSTALL_NO_ACTION' }
            AssertSignedCandidate $unsigned $apk $tools
            if((GetOneDevice $tools.Adb) -cne $serial) { throw 'DEVICE_CHANGED_BEFORE_INSTALL_NO_ACTION' }
            SetJh231Stage 'ONE_SHOT_JOURNAL'
            CreateInstallJournal $serial
            SetJh231Stage 'ADB_INSTALL_ONCE'
            $script:AdbInstallStarted=$true
            $action=ExecNative $tools.Adb @('-s',$serial,'install','-r',$apk)
            # Always use readback once after dispatch, including a non-success return.
            # Never issue a second install. Readback can resolve a lost success response.
            Evidence 'ADB_INSTALL_RETURN_CODE' ([string]$action.Code)
            SetJh231Stage 'POST_INSTALL_READBACK'
            $after=ReadInstalledApk $tools $serial 'AFTER'
            if($after.Version -cne $ToVersion -or $after.Name -cne $ToName) { throw 'POST_INSTALL_STATE_NOT_CONFIRMED_NO_RETRY' }
            $script:DeviceReadback='EXACT_PACKAGE_VERSION_CERT_AND_APK_SHA_VERIFIED'
            $script:Status='PASS_UPDATE_INSTALLED_VERIFIED'
            SetJh231Stage 'DONE'
            $script:Reason='ONE_UPDATE_AND_EXACT_INSTALLED_APK_READBACK'
        }
    } catch {
        $message=$_.Exception.Message
        $script:Reason=if($message -cmatch '^[A-Z0-9_]{3,160}$') {$message} else {'LOCAL_EXCEPTION_REVIEW_REQUIRED'}
        if($script:AdbInstallStarted -or $script:InstallAttempted) { $script:Status='UPDATE_OUTCOME_UNCONFIRMED_NO_RETRY' }
        else { $script:Status='BLOCKED_NO_INSTALL' }
    } finally {
        try { Clear-TemporarySecrets } catch { }
        # Clean only exact temporary paths created by this invocation.
        if($script:CreatedTempFile) {
            try { if(Test-Path -LiteralPath $script:CreatedTempFile -PathType Leaf) { Remove-Item -LiteralPath $script:CreatedTempFile -Force -ErrorAction Stop } }
            catch { Evidence 'CURRENT_SIGN_TEMP_CLEANUP' 'FAILED_REVIEW_REQUIRED' }
        }
        if($script:ScratchFolder) {
            try { if(Test-Path -LiteralPath $script:ScratchFolder -PathType Container) { Remove-Item -LiteralPath $script:ScratchFolder -Recurse -Force -ErrorAction Stop } }
            catch { Evidence 'CURRENT_READBACK_TEMP_CLEANUP' 'FAILED_REVIEW_REQUIRED' }
        }
        # Cleanup/lock-release failures must not suppress the primary report attempt.
        try { if($script:RunLock) { $script:RunLock.Dispose() } } catch { }
        try { if($script:OwnsMutex -and $script:Mutex) { $script:Mutex.ReleaseMutex() } } catch { }
        try { if($script:Mutex) { $script:Mutex.Dispose() } } catch { }
        SaveResult
        Write-Host ('STATUS: '+$script:Status)
        Write-Host ('REASON: '+$script:Reason)
        Write-Host ('RUN_ID: '+$RunId)
    }
    if($script:ResultSaved -and $script:Status -in @('PASS_UPDATE_INSTALLED_VERIFIED','ALREADY_INSTALLED_VERIFIED_NO_INSTALL')) { return 0 }
    return 2
}
# MAIN_ENTRY - tests exercise an isolated copy before this entry; no production test flag.
exit (Invoke-Jh231Update)
