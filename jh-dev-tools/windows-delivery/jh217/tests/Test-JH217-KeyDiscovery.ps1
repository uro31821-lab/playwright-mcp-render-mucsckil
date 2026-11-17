param([Parameter(Mandatory=$true)][string]$KitRoot)
$ErrorActionPreference='Stop'
. (Join-Path $KitRoot 'JH217-LIB.ps1')
$script:assertions=0
function Assert-True([bool]$Value,[string]$Message){if(!$Value){throw $Message};$script:assertions++}
function Assert-Throws([scriptblock]$Action,[string]$Expected){
    $caught=$null;try{& $Action}catch{$caught=$_.Exception.Message}
    Assert-True ($null -ne $caught -and $caught.Contains($Expected)) ('Missing rejection: '+$Expected)
}
$temp=Join-Path ([IO.Path]::GetTempPath()) ('jh217-key-tests-'+[guid]::NewGuid().ToString('N'))
$names=@('USERPROFILE','LOCALAPPDATA','OneDrive','OneDriveConsumer','OneDriveCommercial','JH214_BUILD_DIR','JH_ORIGINAL_KEYSTORE','JH_ORIGINAL_KEYSTORE_PASS','JH217_STOREPASS')
$saved=@{};foreach($name in $names){$saved[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
$expected='7cc577efe48e865fdbe799b92aa9edf89724631361ae97979f2b8e4a940a288b'
$wrong='a'*64
$publicCert=($expected -replace '(..)(?=.)','$1:').ToUpperInvariant()
$script:stubOutputs=@{};$script:toolCalls=0
function Invoke-JhTool([string]$Tool,[string[]]$ToolArgs){
    if($Tool -cne 'synthetic-keytool' -or $ToolArgs[1] -cne '-list' -or $ToolArgs -contains '-genkeypair' -or $ToolArgs -contains '-exportcert'){throw 'Unexpected signing/key mutation tool'}
    Assert-True (($ToolArgs -join ' ') -notmatch 'private-test-password') 'Password leaked into arguments'
    $script:toolCalls++
    $path=$ToolArgs[([Array]::IndexOf($ToolArgs,'-keystore')+1)]
    if($script:stubOutputs.ContainsKey($path)){return [pscustomobject]@{Code=0;Text=$script:stubOutputs[$path]}}
    return [pscustomobject]@{Code=1;Text='synthetic unreadable store'}
}
function Add-StubFile([string]$Path,[string]$Output){
    [void][IO.Directory]::CreateDirectory((Split-Path -Parent $Path))
    [IO.File]::WriteAllText($Path,'synthetic store bytes; no private key')
    $script:stubOutputs[$Path]=$Output
}
try{
    $env:USERPROFILE=Join-Path $temp 'profile';$env:LOCALAPPDATA=Join-Path $temp 'local'
    foreach($name in @('OneDrive','OneDriveConsumer','OneDriveCommercial','JH214_BUILD_DIR','JH_ORIGINAL_KEYSTORE')){[Environment]::SetEnvironmentVariable($name,$null,'Process')}
    $env:JH_ORIGINAL_KEYSTORE_PASS='private-test-password'
    $default=Join-Path $env:USERPROFILE '.android\debug.keystore'
    $original=Join-Path $env:USERPROFILE 'Downloads\JH214 old ! %\original.jks'
    Add-StubFile $default ("Alias name: wrong-default`nEntry type: PrivateKeyEntry`nSHA256: "+$wrong)
    Add-StubFile $original ("Alias name: trust-only`nEntry type: trustedCertEntry`nSHA256: "+$publicCert+"`nAlias name: original`nEntry type: PrivateKeyEntry`nSHA256: "+$publicCert)
    $key=Get-JhOriginalKey 'synthetic-keytool' $expected
    Assert-True ($key.Path -ceq $original -and $key.Alias -ceq 'original') 'Wrong default prevented original JH key discovery'
    Assert-True ($script:JhKeySource -ceq 'JH214_BOUNDED_LOCATIONS') 'Wrong discovery source'
    Assert-True ($script:JhKeyCandidates -eq 2) 'Candidate deduplication or bounded order failed'
    Assert-True ((Get-JhSha $original) -ceq $key.KeySha256) 'Locator key hash mismatch'
    Save-JhOriginalKeyLocator $key $expected
    $cache=Join-Path $env:LOCALAPPDATA ('JH\signing\'+$expected+'.json')
    $raw=[IO.File]::ReadAllText($cache)
    Assert-True ($raw -notmatch 'private-test-password|synthetic store bytes') 'Locator contains a secret or key bytes'
    $again=Get-JhOriginalKey 'synthetic-keytool' $expected
    Assert-True ($again.Path -ceq $original -and $script:JhKeySource -ceq 'VERIFIED_LOCAL_LOCATOR') 'Verified locator was not reused'
    Assert-True ($script:JhKeyCandidates -eq 1 -and $script:JhKeyFolders -eq 0) 'Unnecessary rediscovery after cache verification'
    # A changed cached store is never trusted from its path alone. Find another original file.
    [IO.File]::WriteAllText($original,'changed synthetic bytes')
    $script:stubOutputs[$original]="Alias name: changed`nEntry type: PrivateKeyEntry`nSHA256: $wrong"
    $replacement=Join-Path $env:USERPROFILE 'Downloads\JH verified\recovered.keystore'
    Add-StubFile $replacement ("Alias name: recovered`nEntry type: PrivateKeyEntry`nSHA256: "+$publicCert)
    $recovered=Get-JhOriginalKey 'synthetic-keytool' $expected
    Assert-True ($recovered.Path -ceq $replacement) 'Stale locator accepted changed certificate'
    Assert-True ($script:JhKeySource -ceq 'JH214_BOUNDED_LOCATIONS') 'Stale cache skipped validation'
    $env:JH_ORIGINAL_KEYSTORE=$replacement
    $direct=Get-JhOriginalKey 'synthetic-keytool' $expected
    Assert-True ($direct.Path -ceq $replacement -and $script:JhKeyFolders -eq 0) 'Explicit verified path should skip discovery'
    $env:JH_ORIGINAL_KEYSTORE=$null
    # Cross-alias and certificate-chain confusion must not supply a private key.
    $script:stubOutputs[$replacement]="Alias name: wrong-private`nEntry type: PrivateKeyEntry`nSHA256: $wrong`nAlias name: trusted-only`nEntry type: trustedCertEntry`nSHA256: $publicCert"
    Assert-Throws {Get-JhOriginalKey 'synthetic-keytool' $expected} 'READABLE_KEYSTORES_NO_ORIGINAL_CERT_MATCH'
    $script:stubOutputs[$replacement]="Alias name: wrong-leaf`nEntry type: PrivateKeyEntry`nCertificate[1]:`nSHA256: $wrong`nCertificate[2]:`nSHA256: $publicCert"
    Assert-Throws {Get-JhOriginalKey 'synthetic-keytool' $expected} 'READABLE_KEYSTORES_NO_ORIGINAL_CERT_MATCH'
    $script:stubOutputs.Clear()
    Assert-Throws {Get-JhOriginalKey 'synthetic-keytool' $expected} 'NO_UNLOCKED_ORIGINAL_KEY_IN_BOUNDED_LOCATIONS'
    # Symlink/junction roots and keystore files cannot broaden the approved search.
    $outside=Join-Path $temp 'outside';[void][IO.Directory]::CreateDirectory($outside)
    $hidden=Join-Path $outside 'hidden.jks';Add-StubFile $hidden ("Alias name: linked`nEntry type: PrivateKeyEntry`nSHA256: "+$publicCert)
    $junction=Join-Path $env:USERPROFILE 'Downloads\linked'
    $null=New-Item -ItemType Junction -Path $junction -Target $outside
    Assert-Throws {Get-JhOriginalKey 'synthetic-keytool' $expected} 'NO_UNLOCKED_ORIGINAL_KEY_IN_BOUNDED_LOCATIONS'
    [IO.Directory]::Delete($junction)
    Write-Output ('JH217_KEY_DISCOVERY_ASSERTIONS_PASS='+$script:assertions)
    Write-Output 'REAL_KEYS_GENERATED_READ_SIGNED_OR_UPLOADED=0'
}finally{
    foreach($name in $names){[Environment]::SetEnvironmentVariable($name,$saved[$name],'Process')}
    if(Test-Path -LiteralPath $temp){Remove-Item -LiteralPath $temp -Recurse -Force}
}
