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
function Get-JhOriginalKey([string]$Keytool,[string]$Expected) {
    # Reuse explicit existing store or established Android store. No recursive scan/export.
    $candidate=$env:JH_ORIGINAL_KEYSTORE
    if(!$candidate -and $env:USERPROFILE){$candidate=Join-Path $env:USERPROFILE '.android\debug.keystore'}
    if(!$candidate -or !(Test-Path -LiteralPath $candidate -PathType Leaf)){throw 'ORIGINAL_KEY_PATH_REQUIRED_ON_THIS_PC'}
    $env:JH216_STOREPASS=if($env:JH_ORIGINAL_KEYSTORE_PASS){$env:JH_ORIGINAL_KEYSTORE_PASS}else{'android'}
    $r=Invoke-JhTool $Keytool @('-J-Duser.language=en','-list','-v','-keystore',$candidate,'-storepass:env','JH216_STOREPASS')
    if($r.Code -ne 0){throw 'ORIGINAL_KEY_CANNOT_BE_OPENED'}
    $entries=[regex]::Split($r.Text,'(?im)^\s*Alias name:\s*')
    for($index=1;$index -lt $entries.Count;$index++){
        $entry=$entries[$index];$alias=($entry -split "`r?`n",2)[0].Trim()
        $cert=[regex]::Match($entry,'(?im)^\s*SHA\s*-?\s*256\s*:\s*([0-9A-F:]{64,96})\s*$')
        if($alias -and $entry -match '(?i)Entry type:\s*PrivateKeyEntry' -and $cert.Success -and
           $cert.Groups[1].Value.Replace(':','').ToLowerInvariant() -ceq $Expected){return @{Path=$candidate;Alias=$alias}}
    }
    throw 'ORIGINAL_PRIVATE_KEY_CERTIFICATE_MISMATCH'
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
