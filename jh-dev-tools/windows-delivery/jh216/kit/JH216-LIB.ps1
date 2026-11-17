Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
function Get-JhSha([string]$Path) {
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}
function Invoke-JhTool([string]$Tool,[string[]]$ToolArgs) {
    $oldPreference=$ErrorActionPreference
    $ErrorActionPreference='Continue'
    try { $output=(& $Tool @ToolArgs 2>&1 | Out-String); $code=$LASTEXITCODE }
    finally {$ErrorActionPreference=$oldPreference}
    return [pscustomobject]@{Code=$code;Text=$output}
}
function Assert-JhFileHash([string]$Path,[string]$Expected) {
    if($Expected -cnotmatch '^[0-9a-f]{64}$' -or !(Test-Path -LiteralPath $Path -PathType Leaf) -or
       (Get-JhSha $Path) -cne $Expected){throw 'PAYLOAD_HASH_MISMATCH'}
}
function Assert-JhApk([string]$Apk,[string]$Aapt,[int]$Version,[string]$VersionName) {
    $r=Invoke-JhTool $Aapt @('dump','badging',$Apk)
    if($r.Code -ne 0 -or $r.Text -notmatch "package: name='com\.koreanlifehub\.bridge' versionCode='$Version' versionName='$([regex]::Escape($VersionName))'" -or
       $r.Text -match 'application-debuggable'){throw 'APK_IDENTITY_MISMATCH'}
}
function Assert-JhCertificate([string]$Apk,[string]$Signer,[string]$Expected) {
    $r=Invoke-JhTool $Signer @('verify','--verbose','--print-certs',$Apk)
    $certRows=[regex]::Matches($r.Text,'(?im)^Signer #\d+ certificate SHA-256 digest:\s*([0-9a-f]{64})\s*$')
    if($r.Code -ne 0 -or $certRows.Count -ne 1 -or $certRows[0].Groups[1].Value.ToLowerInvariant() -cne $Expected){throw 'ORIGINAL_CERTIFICATE_MISMATCH'}
}
function Assert-JhPayloadEqual([string]$Unsigned,[string]$Signed) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $left=[IO.Compression.ZipFile]::OpenRead($Unsigned)
    $right=[IO.Compression.ZipFile]::OpenRead($Signed)
    try {
        $map=@{}
        foreach($entry in $left.Entries){
            if($entry.FullName -match '(?i)^META-INF/(MANIFEST\.MF|[^/]+\.(SF|RSA|DSA|EC))$'){continue}
            if($map.ContainsKey($entry.FullName)){throw 'DUPLICATE_APK_ENTRY'}
            $stream=$entry.Open();$algorithm=[Security.Cryptography.SHA256]::Create()
            try{$map[$entry.FullName]=[BitConverter]::ToString($algorithm.ComputeHash($stream))}finally{$stream.Dispose();$algorithm.Dispose()}
        }
        foreach($entry in $right.Entries){
            if($entry.FullName -match '(?i)^META-INF/(MANIFEST\.MF|[^/]+\.(SF|RSA|DSA|EC))$'){continue}
            if(!$map.ContainsKey($entry.FullName)){throw 'SIGNED_PAYLOAD_DIFFERS'}
            $stream=$entry.Open();$algorithm=[Security.Cryptography.SHA256]::Create()
            try{$digest=[BitConverter]::ToString($algorithm.ComputeHash($stream))}finally{$stream.Dispose();$algorithm.Dispose()}
            if($digest -cne $map[$entry.FullName]){throw 'SIGNED_PAYLOAD_DIFFERS'}
            $map.Remove($entry.FullName)
        }
        if($map.Count -ne 0){throw 'SIGNED_PAYLOAD_DIFFERS'}
    } finally {$left.Dispose();$right.Dispose()}
}
function Get-JhTools {
    $sdkRoots=@($env:ANDROID_HOME,$env:ANDROID_SDK_ROOT)
    if($env:LOCALAPPDATA){$sdkRoots+=Join-Path $env:LOCALAPPDATA 'Android\Sdk'}
    $sdk=$null
    foreach($candidate in @($sdkRoots | Where-Object {$_} | Select-Object -Unique)){
        if(Test-Path -LiteralPath (Join-Path $candidate 'build-tools\35.0.0\apksigner.bat') -PathType Leaf){$sdk=$candidate;break}
    }
    if(!$sdk){throw 'EXISTING_SDK35_TOOLS_NOT_FOUND'}
    $javaRoots=@($env:JAVA_HOME)
    if($env:LOCALAPPDATA){
        $checkpoint=Join-Path $env:LOCALAPPDATA 'JH168\verified-toolchain-8.9.json'
        if(Test-Path -LiteralPath $checkpoint -PathType Leaf){
            try{$old=Get-Content -LiteralPath $checkpoint -Raw -Encoding UTF8|ConvertFrom-Json
                if($old.PSObject.Properties['jdkHome']){$javaRoots+=[string]$old.jdkHome}}catch{}
        }
    }
    $keytool=$null
    foreach($candidate in @($javaRoots | Where-Object {$_} | Select-Object -Unique)){
        $path=Join-Path $candidate 'bin\keytool.exe';if(Test-Path -LiteralPath $path -PathType Leaf){$keytool=$path;break}
    }
    if(!$keytool){$found=Get-Command keytool.exe -ErrorAction SilentlyContinue;if($found){$keytool=$found.Source}}
    if(!$keytool){throw 'EXISTING_JAVA_KEYTOOL_NOT_FOUND'}
    $javaBin=Split-Path -Parent $keytool
    $env:JAVA_HOME=Split-Path -Parent $javaBin
    $env:PATH=$javaBin+';'+$env:PATH
    $base=Join-Path $sdk 'build-tools\35.0.0'
    $tools=@{Signer=(Join-Path $base 'apksigner.bat');Align=(Join-Path $base 'zipalign.exe');Aapt=(Join-Path $base 'aapt2.exe');Adb=(Join-Path $sdk 'platform-tools\adb.exe');Keytool=$keytool}
    foreach($path in $tools.Values){if(!(Test-Path -LiteralPath $path -PathType Leaf)){throw 'EXISTING_ANDROID_TOOL_MISSING'}}
    return $tools
}
function Read-JhOriginalKeyCandidate([string]$Keytool,[string]$Path,[string]$Expected) {
    if(!$Path -or $Path -notmatch '^[A-Za-z]:[\\/]' -or !(Test-Path -LiteralPath $Path -PathType Leaf)){return $null}
    $file=Get-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
    if(!$file -or ($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or $file.Length -le 0 -or $file.Length -gt 10485760){return $null}
    $script:JhKeyCandidates++
    $r=Invoke-JhTool $Keytool @('-J-Duser.language=en','-list','-v','-keystore',$file.FullName,'-storepass:env','JH216_STOREPASS')
    if($r.Code -ne 0){return $null}
    $script:JhKeyReadable++
    $entries=[regex]::Split($r.Text,'(?im)^\s*Alias name:\s*')
    for($index=1;$index -lt $entries.Count;$index++){
        $entry=$entries[$index];$alias=($entry -split "`r?`n",2)[0].Trim()
        if(!$alias -or $alias.Length -gt 128 -or $entry -notmatch '(?i)Entry type:\s*PrivateKeyEntry'){continue}
        # Match the first (leaf) certificate of this private-key entry, never another alias or CA.
        $cert=[regex]::Match($entry,'(?im)^\s*SHA\s*-?\s*256\s*:\s*([0-9A-F:]{64,96})\s*$')
        if($cert.Success -and $cert.Groups[1].Value.Replace(':','').ToLowerInvariant() -ceq $Expected){
            return @{Path=$file.FullName;Alias=$alias;KeySha256=(Get-JhSha $file.FullName)}
        }
    }
    return $null
}
function Save-JhOriginalKeyLocator([hashtable]$Key,[string]$Expected) {
    # Non-secret locator stays on this PC. No passwords or private-key bytes are stored/copied.
    # Cache writes are optional and cannot change an otherwise verified signing result.
    try {
        if(!$env:LOCALAPPDATA){return}
        $dir=Join-Path $env:LOCALAPPDATA 'JH\signing'
        [void][IO.Directory]::CreateDirectory($dir)
        if(((Get-Item -LiteralPath $dir -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){return}
        $path=Join-Path $dir ($Expected+'.json')
        if(Test-Path -LiteralPath $path){return}
        $value=@{schema='JH_ORIGINAL_KEY_LOCATOR_V1';certificateSha256=$Expected;path=$Key.Path;keySha256=$Key.KeySha256}
        $bytes=([Text.UTF8Encoding]::new($false)).GetBytes(($value|ConvertTo-Json -Compress))
        $stream=[IO.File]::Open($path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
        try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
    } catch { }
}
function Get-JhOriginalKey([string]$Keytool,[string]$Expected) {
    $script:JhKeyCandidates=0;$script:JhKeyReadable=0;$script:JhKeyFolders=0;$script:JhKeySource='NOT_FOUND'
    $env:JH216_STOREPASS=if($env:JH_ORIGINAL_KEYSTORE_PASS){$env:JH_ORIGINAL_KEYSTORE_PASS}else{'android'}
    $seenKeys=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
    $direct=New-Object 'System.Collections.Generic.List[object]'
    if($env:JH_ORIGINAL_KEYSTORE){$direct.Add(@{Path=$env:JH_ORIGINAL_KEYSTORE;Source='EXPLICIT_EXISTING_PATH'})}
    if($env:LOCALAPPDATA){
        $cache=Join-Path $env:LOCALAPPDATA ('JH\signing\'+$Expected+'.json')
        try{
            if(Test-Path -LiteralPath $cache -PathType Leaf){
                $info=Get-Item -LiteralPath $cache -Force
                if($info.Length -le 16384 -and ($info.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0){
                    $value=Get-Content -LiteralPath $cache -Raw -Encoding UTF8|ConvertFrom-Json
                    if($value.schema -ceq 'JH_ORIGINAL_KEY_LOCATOR_V1' -and $value.certificateSha256 -ceq $Expected -and
                       $value.path -match '^[A-Za-z]:[\\/]' -and $value.keySha256 -cmatch '^[0-9a-f]{64}$' -and
                       (Test-Path -LiteralPath $value.path -PathType Leaf) -and (Get-JhSha $value.path) -ceq $value.keySha256){
                        $direct.Add(@{Path=[string]$value.path;Source='VERIFIED_LOCAL_LOCATOR'})
                    }
                }
            }
        }catch{}
    }
    if($env:USERPROFILE){$direct.Add(@{Path=(Join-Path $env:USERPROFILE '.android\debug.keystore');Source='DEFAULT_ANDROID_PATH'})}
    foreach($item in $direct){
        if(!$seenKeys.Add([string]$item.Path)){continue}
        $key=Read-JhOriginalKeyCandidate $Keytool $item.Path $Expected
        if($key){$script:JhKeySource=$item.Source;return $key}
    }
    # Same bounded JH locations as the successful JH214 signer. Wrong default key is not terminal.
    $roots=New-Object 'System.Collections.Generic.List[object]'
    if($env:USERPROFILE){
        $roots.Add(@{Path=$env:USERPROFILE;Depth=0})
        foreach($name in @('.android','Downloads','Desktop','Documents','JH')){$roots.Add(@{Path=(Join-Path $env:USERPROFILE $name);Depth=7})}
    }
    foreach($path in @($env:JH214_BUILD_DIR,$PSScriptRoot)){if($path){$roots.Add(@{Path=$path;Depth=7})}}
    if($env:LOCALAPPDATA){foreach($name in @('JH168','JH171','JH185','JH212','JH213','JH214','JH')){$roots.Add(@{Path=(Join-Path $env:LOCALAPPDATA $name);Depth=7})}}
    foreach($cloud in @($env:OneDrive,$env:OneDriveConsumer,$env:OneDriveCommercial)){
        if($cloud){foreach($name in @('Desktop','Documents')){$roots.Add(@{Path=(Join-Path $cloud $name);Depth=7})}}
    }
    foreach($path in @('C:\JHU32\JH\android','C:\JHU32\JH','D:\JHU32\JH')){$roots.Add(@{Path=$path;Depth=7})}
    $queue=New-Object 'System.Collections.Generic.Queue[object]'
    foreach($item in $roots){if($item.Path -match '^[A-Za-z]:[\\/]' -and (Test-Path -LiteralPath $item.Path -PathType Container)){$queue.Enqueue($item)}}
    $seenDirs=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
    $watch=[Diagnostics.Stopwatch]::StartNew()
    while($queue.Count -gt 0 -and $script:JhKeyFolders -lt 6000 -and $script:JhKeyCandidates -lt 300 -and $watch.Elapsed.TotalSeconds -lt 90){
        $node=$queue.Dequeue();$dir=[string]$node.Path
        if(!$seenDirs.Add($dir)){continue}
        try{
            $info=Get-Item -LiteralPath $dir -Force -ErrorAction Stop
            if(($info.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){continue}
            $script:JhKeyFolders++
            $entries=@(Get-ChildItem -LiteralPath $dir -Force -ErrorAction Stop)
        }catch{continue}
        foreach($item in $entries){
            if($script:JhKeyCandidates -ge 300 -or $watch.Elapsed.TotalSeconds -ge 90){break}
            if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){continue}
            if($item.PSIsContainer){
                if($node.Depth -gt 0 -and $queue.Count -lt 6500 -and $item.Name -notmatch '^(\.git|\.gradle|node_modules|\.idea|\.venv|venv|Sdk|sdk|platforms|build-tools|\.cache|obj|target|dist)$'){
                    $queue.Enqueue(@{Path=$item.FullName;Depth=([int]$node.Depth-1)})
                }
            }elseif($item.Name -match '(?i)\.(keystore|jks|p12|pfx)$' -and $seenKeys.Add($item.FullName)){
                $key=Read-JhOriginalKeyCandidate $Keytool $item.FullName $Expected
                if($key){$script:JhKeySource='JH214_BOUNDED_LOCATIONS';return $key}
            }
        }
    }
    if($script:JhKeyReadable -gt 0){throw 'READABLE_KEYSTORES_NO_ORIGINAL_CERT_MATCH'}
    throw 'NO_UNLOCKED_ORIGINAL_KEY_IN_BOUNDED_LOCATIONS'
}
function Get-JhDevice([string]$Adb) {
    $r=Invoke-JhTool $Adb @('devices')
    $rows=@($r.Text -split "`r?`n" | Where-Object {$_ -match '^\S+\s+(device|offline|unauthorized)(\s|$)'})
    if($r.Code -ne 0 -or $rows.Count -ne 1 -or $rows[0] -notmatch '^\S+\s+device\s*$'){throw 'EXACTLY_ONE_AUTHORIZED_USB_DEVICE_REQUIRED'}
    $serial=($rows[0] -split '\s+')[0]
    if($serial -match ':'){throw 'USB_DEVICE_REQUIRED'}
    $model=Invoke-JhTool $Adb @('-s',$serial,'shell','getprop','ro.product.model')
    if($model.Code -ne 0 -or $model.Text.Trim() -cne 'SM-F971N'){throw 'DEVICE_MODEL_MISMATCH'}
    return $serial
}
function Get-JhInstalled([string]$Adb,[string]$Serial,[string]$Destination) {
    $r=Invoke-JhTool $Adb @('-s',$Serial,'shell','pm','path','com.koreanlifehub.bridge')
    $rows=@($r.Text -split "`r?`n" | Where-Object {$_ -like 'package:*'})
    if($r.Code -ne 0 -or $rows.Count -ne 1){throw 'INSTALLED_BASE_APK_PATH_NOT_UNIQUE'}
    $remote=$rows[0].Substring(8).Trim()
    if($remote -notmatch '^/data/app/[^\s]+/base\.apk$'){throw 'INSTALLED_BASE_APK_PATH_INVALID'}
    if(Test-Path -LiteralPath $Destination){throw 'READBACK_OUTPUT_ALREADY_EXISTS'}
    $r=Invoke-JhTool $Adb @('-s',$Serial,'pull',$remote,$Destination)
    if($r.Code -ne 0 -or !(Test-Path -LiteralPath $Destination -PathType Leaf)){throw 'INSTALLED_APK_READBACK_FAILED'}
    return Get-JhSha $Destination
}
function New-JhAttemptMarker([string]$Path,[string]$RunId,[string]$ApkSha) {
    $stream=[IO.File]::Open($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try{
        $body=([Text.UTF8Encoding]::new($false)).GetBytes((@{runId=$RunId;apkSha256=$ApkSha;status='INSTALL_MAY_HAVE_STARTED_NO_AUTO_REPLAY';utc=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json -Compress))
        $stream.Write($body,0,$body.Length);$stream.Flush($true)
    }finally{$stream.Dispose()}
}
function Invoke-JhUpdateOnce([string]$Adb,[string]$Serial,[string]$Signed,[string]$SignedSha,[string]$BaselineSha,[string]$Work,[string]$Marker,[string]$RunId) {
    $script:JhInstallAttempts=0
    $before=Get-JhInstalled $Adb $Serial (Join-Path $Work 'installed-before.apk')
    if($before -ceq $SignedSha){return 'ALREADY_JH216_EXACT_SHA_NO_ACTION'}
    if(Test-Path -LiteralPath $Marker){throw 'PREVIOUS_INSTALL_ATTEMPT_EXISTS_NO_REPLAY'}
    if($before -cne $BaselineSha){throw 'INSTALLED_APP_DIFFERS_FROM_VERIFIED_JH214'}
    Write-Host 'Update verified JH214 to JH216 camera/switches, preserving app data. JH215 voice stays paused.'
    $answer=Read-Host 'Type YES to update this USB phone once; anything else stops before installation'
    if($answer -cne 'YES'){return 'SIGNED_READY_USER_DID_NOT_INSTALL'}
    $current=Get-JhInstalled $Adb $Serial (Join-Path $Work 'installed-precommit.apk')
    if($current -cne $BaselineSha){throw 'INSTALLED_APP_CHANGED_BEFORE_UPDATE'}
    Assert-JhFileHash $Signed $SignedSha
    New-JhAttemptMarker $Marker $RunId $SignedSha
    $script:JhInstallAttempts=1
    $r=Invoke-JhTool $Adb @('-s',$Serial,'install','-r',$Signed)
    $after=Get-JhInstalled $Adb $Serial (Join-Path $Work 'installed-after.apk')
    if($after -ceq $SignedSha){return 'PASS_JH216_INSTALLED_EXACT_SHA'}
    throw 'INSTALL_OUTCOME_UNCONFIRMED_NO_REPLAY'
}
