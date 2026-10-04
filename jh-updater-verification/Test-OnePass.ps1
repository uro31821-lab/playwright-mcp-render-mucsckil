#requires -Version 5.1
param([string]$OutputDirectory = (Join-Path $PSScriptRoot 'test-output'))
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$script:cases = New-Object System.Collections.Generic.List[object]
function Assert($ok, [string]$reason = 'ASSERT') { if (!$ok) { throw $reason } }
function MustThrow([scriptblock]$body, [string]$code) {
    $thrown = $false
    try { & $body } catch { $thrown = $true; if ($_.Exception.Message -cne $code) { throw ('Expected ' + $code + ', got ' + $_.Exception.Message) } }
    if (!$thrown) { throw ('Missing rejection ' + $code) }
}
function Case([string]$name, [scriptblock]$body) {
    try { & $body; $script:cases.Add([pscustomobject]@{ name=$name; passed=$true }); Write-Host ('PASS ' + $name) }
    catch { $script:cases.Add([pscustomobject]@{ name=$name; passed=$false; error=$_.Exception.Message }); Write-Host ('FAIL ' + $name + ' ' + $_.Exception.Message) }
}
foreach ($f in Get-ChildItem -LiteralPath $PSScriptRoot -Filter '*.ps1') {
    $t=$null; $e=$null; [void][Management.Automation.Language.Parser]::ParseFile($f.FullName,[ref]$t,[ref]$e)
    if ($e.Count) { throw ('PARSE_FAILURE: ' + $f.Name + ' ' + $e[0].Message) }
}
. (Join-Path $PSScriptRoot 'JH.Update.Core.ps1')
$temp = Join-Path ([IO.Path]::GetTempPath()) ('JH synthetic & ' + [char]0xD55C + [char]0xAE00 + ' ' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp | Out-Null
$probe = Join-Path $temp 'NativeProbe.exe'
Add-Type -OutputAssembly $probe -OutputType ConsoleApplication -TypeDefinition @'
using System; using System.Text; using System.Threading;
public class NativeProbe {
 public static int Main(string[] args) {
  if(args.Length>0 && args[0]=="sleep") { Thread.Sleep(5000); return 0; }
  if(args.Length>0 && args[0]=="io") { Console.Out.Write(new string('O',200000)); Console.Error.Write(new string('E',200000)); return 7; }
  foreach(var a in args)Console.WriteLine(Convert.ToBase64String(Encoding.UTF8.GetBytes(a)));
  return 0;
 }
}
'@
Case 'PowerShell 5.1 parser and real Windows runner' { Assert ($PSVersionTable.PSVersion.Major -eq 5); Assert ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT) }
Case 'Native argument round-trip includes quotes trailing slashes empty text and Unicode' {
    $values = @('', 'a b', 'a"b', 'C:\folder with space\', 'a & b|c^d%PATH%!', ('x'+[char]9+'y'), ('line'+[char]10+'two'), [string][char]0xD55C)
    $r=Invoke-JhNative $probe $values 15
    Assert ($r.Code -eq 0)
    $lines=@($r.Out -split '\r?\n'); Assert ($lines.Count -eq ($values.Count+1))
    for($i=0;$i -lt $values.Count;$i++) { Assert ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($lines[$i])) -ceq $values[$i]) }
}
Case 'Native stdout stderr drain and nonzero exit are preserved' { $r=Invoke-JhNative $probe @('io') 15; Assert ($r.Code -eq 7); Assert ($r.Out.Length -eq 200000); Assert ($r.Err.Length -eq 200000) }
Case 'Required native call rejects nonzero exit' { MustThrow { Invoke-JhRequired $probe @('io') 15 } 'NATIVE_EXIT_7' }
Case 'Native timeout is bounded and rejected' { MustThrow { Invoke-JhNative $probe @('sleep') 1 } 'NATIVE_TIMEOUT' }
Case 'NUL native argument rejected' { MustThrow { ConvertTo-JhNativeArgument ('a'+[char]0+'b') } 'ARGUMENT_NUL' }
Case 'Batch shell file cannot enter native executor' { $b=Join-Path $temp 'no.cmd'; 'echo noop' | Set-Content $b; MustThrow { Invoke-JhNative $b @() } 'NATIVE_EXE_ONLY' }
Case 'Device list zero one and multiple cardinality' { Assert (@(Read-JhDeviceRows "List of devices attached`r`n").Count -eq 0); Assert (@(Read-JhDeviceRows "List of devices attached`r`nTEST1`tdevice`r`n").Count -eq 1); Assert (@(Read-JhDeviceRows "List of devices attached`r`nTEST1`tdevice`r`nTEST2`tdevice`r`n").Count -eq 2) }
Case 'Unparseable device output is not success' { MustThrow { Read-JhDeviceRows 'Success' } 'ADB_LIST_UNREADABLE' }
Case 'Package parser reads exact version' { $i=Read-JhApkIdentity "package: name='com.koreanlifehub.bridge' versionCode='131' versionName='unified-final-checkpoint.57-fix10' platformBuildVersionName='15'"; Assert ($i.Code -eq 131) }
Case 'Missing package identity rejected' { MustThrow { Read-JhApkIdentity 'Success' } 'APK_IDENTITY_UNREADABLE' }
Case 'Certificate parser requires exactly one signer' { Assert ((Read-JhCertificate ('Signer #1 certificate SHA-256 digest: '+('a'*64))) -ceq ('a'*64)); MustThrow { Read-JhCertificate (('Signer #1 certificate SHA-256 digest: '+('a'*64))+"`n"+('Signer #2 certificate SHA-256 digest: '+('b'*64))) } 'APK_SINGLE_CERT_REQUIRED' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
function New-FixtureZip([string]$path, $pairs) {
    $z=[IO.Compression.ZipFile]::Open($path,[IO.Compression.ZipArchiveMode]::Create)
    try { foreach($pair in $pairs) { $e=$z.CreateEntry($pair[0]);$s=$e.Open();$data=[Text.Encoding]::UTF8.GetBytes($pair[1]);$s.Write($data,0,$data.Length);$s.Dispose() } } finally { $z.Dispose() }
}
function TextHash([string]$text) { $m=New-Object IO.MemoryStream(,[Text.Encoding]::UTF8.GetBytes($text));try{return Get-JhStreamHash $m}finally{$m.Dispose()} }
$entryMap=[pscustomobject]@{'AndroidManifest.xml'=(TextHash 'new-manifest');'classes.dex'=(TextHash 'synthetic-dex')}
$fixture=Join-Path $temp 'new.apk';New-FixtureZip $fixture @(@('AndroidManifest.xml','new-manifest'),@('classes.dex','synthetic-dex'))
$old=Join-Path $temp 'old.apk';New-FixtureZip $old @(@('AndroidManifest.xml','old-manifest'),@('classes.dex','synthetic-dex'))
Case 'Exact nonsignature APK entry hashes are checked' { Assert-JhPayload $fixture $entryMap }
Case 'APK tampering is rejected' { MustThrow { Assert-JhPayload $old $entryMap } 'APK_PAYLOAD_MISMATCH' }
Case 'Extra APK payload is rejected' { $p=Join-Path $temp 'extra.apk';New-FixtureZip $p @(@('AndroidManifest.xml','new-manifest'),@('classes.dex','synthetic-dex'),@('assets/extra','x'));MustThrow {Assert-JhPayload $p $entryMap} 'APK_UNEXPECTED_ENTRY' }
Case 'Missing APK entry is rejected' { $p=Join-Path $temp 'missing.apk';New-FixtureZip $p @(@('AndroidManifest.xml','new-manifest'));MustThrow {Assert-JhPayload $p $entryMap} 'APK_ENTRY_MISSING' }
Case 'Duplicate APK entry is rejected' { $p=Join-Path $temp 'duplicate.apk';New-FixtureZip $p @(@('AndroidManifest.xml','new-manifest'),@('classes.dex','synthetic-dex'),@('classes.dex','synthetic-dex'));MustThrow {Assert-JhPayload $p $entryMap} 'APK_DUPLICATE_ENTRY' }
Case 'Signature entries may change but app payload may not' { $p=Join-Path $temp 'signature.apk';New-FixtureZip $p @(@('AndroidManifest.xml','new-manifest'),@('classes.dex','synthetic-dex'),@('META-INF/CERT.RSA','synthetic-signature'));Assert-JhPayload $p $entryMap }
$release=[pscustomobject]@{schema=1;releaseId='jh57-fix10-integrated-20261004';packageName='com.koreanlifehub.bridge';versionCode=131;versionName='unified-final-checkpoint.57-fix10';minimumInstalledVersionCode=130;apkFile='payload-unsigned.apk';unsignedSha256=(Get-JhHash $fixture);payloadEntries=$entryMap}
$newId=[pscustomobject]@{Package=$release.packageName;Code=131;Name=$release.versionName}
$oldId=[pscustomobject]@{Package=$release.packageName;Code=130;Name='unified-final-checkpoint.57-fix9'}
Case 'Version decision permits only expected update or exact already-installed payload' { Assert ((Get-JhUpdateDecision $oldId $release $false) -eq 'UPDATE');Assert ((Get-JhUpdateDecision $newId $release $true) -eq 'ALREADY_INSTALLED');MustThrow {Get-JhUpdateDecision $newId $release $false} 'SAME_VERSION_DIFFERENT_PAYLOAD' }
Case 'Newer version is never downgraded' { MustThrow {Get-JhUpdateDecision ([pscustomobject]@{Package=$release.packageName;Code=132;Name='newer'}) $release $false} 'DOWNGRADE_BLOCKED' }
Case 'Unknown older version is not overwritten' { MustThrow {Get-JhUpdateDecision ([pscustomobject]@{Package=$release.packageName;Code=129;Name='older'}) $release $false} 'UNSUPPORTED_BASE_VERSION' }
Case 'Other package is not updated' { MustThrow {Get-JhUpdateDecision ([pscustomobject]@{Package='other';Code=130;Name='other'}) $release $false} 'PACKAGE_MISMATCH' }
# From this point Android tools and signing are synthetic, while actual updater control-flow runs unchanged.
$originalProfile=$env:USERPROFILE
$env:USERPROFILE=Join-Path $temp 'synthetic-user'
New-Item -ItemType Directory -Force -Path (Join-Path $env:USERPROFILE '.android') | Out-Null
'SYNTHETIC-NOT-A-KEY' | Set-Content -LiteralPath (Join-Path $env:USERPROFILE '.android\debug.keystore')
$script:scenario='';$script:attempts=0;$script:deviceChecks=0
function Get-JhTools { return [pscustomobject]@{Adb='MOCK-ADB';Aapt='MOCK-AAPT';Align='MOCK-ALIGN';Signer='MOCK-SIGNER';Java='MOCK-JAVA'} }
function Get-JhApkIdentity($Tools,[string]$Apk) {return $newId}
function Get-JhApkCertificate($Tools,[string]$Apk) {if($script:scenario -eq 'cert-mismatch'){return ('b'*64)};return ('a'*64)}
function Get-JhSingleDevice([string]$Adb,[int]$WaitSeconds=0) {
 $script:deviceChecks++
 if($script:scenario -eq 'unauthorized'){throw 'USB_PHONE_NOT_AUTHORIZED'}
 if($script:scenario -eq 'multiple'){throw 'ONE_PHONE_ONLY'}
 if($script:scenario -eq 'swap-before' -and $script:deviceChecks -gt 1){return 'OTHER'}
 if($script:scenario -eq 'swap-after' -and $script:deviceChecks -gt 2){return 'OTHER'}
 return 'SYNTHETIC'
}
function Invoke-JhRequired([string]$File,[string[]]$Arguments,[int]$TimeoutSeconds=45) {
 if($File -eq 'MOCK-JAVA') {
  $index=[Array]::IndexOf($Arguments,'--out');Assert ($index -ge 0)
  Copy-Item -LiteralPath $fixture -Destination $Arguments[$index+1]
 }
 return ''
}
function Get-JhInstalled($Tools,[string]$Serial,[string]$Package,[string]$Directory,[string]$Stage) {
 $path=$old;$id=$oldId
 if($Stage -eq 'after' -and $script:scenario -ne 'false-success'){$path=$fixture;$id=$newId}
 if($script:scenario -eq 'already'){$path=$fixture;$id=$newId}
 if($script:scenario -eq 'same-version-other'){$path=$old;$id=$newId}
 if($Stage -eq 'precommit' -and $script:scenario -eq 'changed-before'){$path=$fixture}
 return [pscustomobject]@{Apk=$path;Identity=$id;Hash=(Get-JhHash $path);Certificate=('a'*64)}
}
function Invoke-JhInstallOnce($Tools,[string]$Serial,[string]$Signed) {
 $script:attempts++
 if($script:scenario -eq 'timeout-success'){throw 'NATIVE_TIMEOUT'}
 if($script:scenario -eq 'error-success'){return [pscustomobject]@{Code=1;Out='failed transport';Err=''}}
 return [pscustomobject]@{Code=0;Out="Success`n";Err=''}
}
function Open-JhApp($Tools,[string]$Serial,[string]$Package) { return $false }
function RunScenario([string]$name,[string]$status,[int]$attempts,[string]$code='') {
 $script:scenario=$name;$script:attempts=0;$script:deviceChecks=0
 $b=Join-Path $temp ('bundle-'+$name);$out=Join-Path $temp ('result-'+$name)
 New-Item -ItemType Directory -Path $b,$out | Out-Null
 Copy-Item -LiteralPath $fixture -Destination (Join-Path $b 'payload-unsigned.apk')
 $release | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $b 'release.json') -Encoding UTF8
 if($name -eq 'bad-hash'){'tampered' | Set-Content -LiteralPath (Join-Path $b 'payload-unsigned.apk')}
 $rc=Invoke-JhUpdate -Bundle $b -Results $out
 $r=Get-Content -LiteralPath (Join-Path $out 'result.json') -Raw | ConvertFrom-Json
 Assert ($r.status -ceq $status) ('Expected status '+$status+' got '+$r.status+' code '+$r.code)
 Assert ($script:attempts -eq $attempts)
 Assert ($r.installInvocations -eq $attempts)
 if($code){Assert ($r.code -ceq $code)}
 Assert (!$r.networkUpload -and !$r.keyExport -and !$r.approvalPerformed)
 Assert (($rc -eq 0) -eq [bool]$r.installedVerified)
}
try {
 Case 'Actual updater flow: one install then exact readback' {RunScenario 'normal' 'INSTALLED_VERIFIED' 1}
 Case 'Actual updater flow: exact existing release skips installation' {RunScenario 'already' 'ALREADY_INSTALLED_VERIFIED' 0}
 Case 'Actual updater flow: same version other payload blocked' {RunScenario 'same-version-other' 'STOPPED_BEFORE_INSTALL' 0 'SAME_VERSION_DIFFERENT_PAYLOAD'}
 Case 'Actual updater flow: false Success is not reported complete' {RunScenario 'false-success' 'INSTALL_RESULT_UNVERIFIED_NO_RETRY' 1 'POST_INSTALL_NOT_VERIFIED'}
 Case 'Actual updater flow: timeout followed by exact readback does not reinstall' {RunScenario 'timeout-success' 'INSTALLED_VERIFIED_AFTER_UNCERTAIN_RESPONSE' 1}
 Case 'Actual updater flow: transport error followed by exact readback reconciles' {RunScenario 'error-success' 'INSTALLED_VERIFIED_AFTER_UNCERTAIN_RESPONSE' 1}
 Case 'Actual updater flow: signing certificate mismatch blocks install' {RunScenario 'cert-mismatch' 'STOPPED_BEFORE_INSTALL' 0 'ORIGINAL_SIGNING_CERTIFICATE_MISMATCH'}
 Case 'Actual updater flow: no USB approval blocks install' {RunScenario 'unauthorized' 'STOPPED_BEFORE_INSTALL' 0 'USB_PHONE_NOT_AUTHORIZED'}
 Case 'Actual updater flow: multiple devices blocked' {RunScenario 'multiple' 'STOPPED_BEFORE_INSTALL' 0 'ONE_PHONE_ONLY'}
 Case 'Actual updater flow: phone swap before install blocked' {RunScenario 'swap-before' 'STOPPED_BEFORE_INSTALL' 0 'PHONE_CHANGED_BEFORE_INSTALL'}
 Case 'Actual updater flow: phone swap after install never marked verified' {RunScenario 'swap-after' 'INSTALL_RESULT_UNVERIFIED_NO_RETRY' 1 'PHONE_CHANGED_AFTER_INSTALL'}
 Case 'Actual updater flow: app changed before install blocked' {RunScenario 'changed-before' 'STOPPED_BEFORE_INSTALL' 0 'APP_CHANGED_BEFORE_INSTALL'}
 Case 'Actual updater flow: altered bundle stopped before tools' {RunScenario 'bad-hash' 'STOPPED_BEFORE_INSTALL' 0 'UNSIGNED_APK_HASH_MISMATCH'}
} finally { $env:USERPROFILE=$originalProfile }
$report=[ordered]@{scope='Actual Windows PowerShell 5.1; native argument tests use a real local probe; Android tools and signing are mocked for updater-flow cases. No device, network, real signing key, or app payload used.';powershell=$PSVersionTable.PSVersion.ToString();tests=$script:cases.Count;failures=@($script:cases | Where-Object {!$_.passed}).Count;cases=$script:cases}
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'windows-test-results.json') -Encoding UTF8
if($report.failures){throw ('WINDOWS_TEST_FAILURES='+$report.failures)}
Write-Host ('ALL_WINDOWS_TESTS_PASSED='+$report.tests)
