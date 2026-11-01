param([Parameter(Mandatory=$true)][string]$KitRoot)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

# Windows synthetic regression only. Disposable copies and harmless process
# stubs never invoke an actual key, signing tool, ADB binary, or phone.
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT -or
    $PSVersionTable.PSEdition -ne 'Desktop' -or
    $PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1) {
    throw 'Test-Mobile13 requires actual Windows PowerShell 5.1.'
}
$KitRoot = (Resolve-Path -LiteralPath $KitRoot).Path
$entryName = ([string][char]0xC2E4) + ([string][char]0xD589) + '.cmd'
$entryPath = Join-Path $KitRoot $entryName
$updaterPath = Join-Path $KitRoot 'data\Update-Mobile13.ps1'
$safetyPath = Join-Path $KitRoot 'data\JH-RUN-SAFETY.ps1'
$canonicalSafety = Join-Path $PSScriptRoot '..\fixtures\fix16\JH-RUN-SAFETY.ps1'
$testBase = [IO.Path]::GetTempPath()
if ($env:RUNNER_TEMP -and (Test-Path -LiteralPath $env:RUNNER_TEMP -PathType Container)) {$testBase=$env:RUNNER_TEMP}
$testRoot = Join-Path $testBase ('jm13-' + [guid]::NewGuid().ToString('N').Substring(0,8))
[void][IO.Directory]::CreateDirectory($testRoot)
$utf8 = New-Object Text.UTF8Encoding($false)
$results = New-Object 'System.Collections.Generic.List[string]'
$savedEnvironment = @{}
foreach ($name in @('LOCALAPPDATA','USERPROFILE','TEMP','TMP')) {
    $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}
$env:LOCALAPPDATA = Join-Path $testRoot 'LocalAppData'
$env:USERPROFILE = Join-Path $testRoot 'UserProfile'
foreach ($directory in @($env:LOCALAPPDATA, $env:USERPROFILE)) {
    [void][IO.Directory]::CreateDirectory($directory)
}
$realCmd = Join-Path ([Environment]::GetFolderPath([Environment+SpecialFolder]::System)) 'cmd.exe'
$originalFiles = @{}

function Assert-Jhm13([bool]$Condition, [string]$Message) {
    if (!$Condition) { throw $Message }
}
function Assert-Jhm13Equal($Actual, $Expected, [string]$Message) {
    if ($Actual -cne $Expected) { throw ($Message + '; expected=' + $Expected + '; actual=' + $Actual) }
}
function Assert-Jhm13Throws([scriptblock]$Body, [string]$ExpectedPattern) {
    $observed = $null
    try { $null = & $Body } catch { $observed = $_.Exception.Message }
    Assert-Jhm13 ($null -ne $observed) ('Expected rejection: ' + $ExpectedPattern)
    Assert-Jhm13 ($observed -match $ExpectedPattern) ('Wrong rejection: ' + $observed)
}
function Get-Jhm13Hash([string]$Path) {
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}
function Invoke-Jhm13Case([string]$Name, [scriptblock]$Body) {
    $null = & $Body
    $script:results.Add($Name)
    Write-Host ('PASS MOBILE13: ' + $Name)
}
function New-Jhm13Directory([string]$Name) {
    $path = Join-Path $testRoot $Name
    [void][IO.Directory]::CreateDirectory($path)
    return $path
}
function Read-Jhm13Text([string]$Path) {
    $bytes = [IO.File]::ReadAllBytes($Path)
    if ($bytes.Length -ge 2 -and $bytes[1] -eq 0) {
        return [Text.Encoding]::Unicode.GetString($bytes)
    }
    return [IO.File]::ReadAllText($Path)
}
function New-Jhm13BootstrapFixture([string]$Name) {
    $root = New-Jhm13Directory $Name
    $kit = Join-Path $root 'kit'
    $temp = Join-Path $root 'temp'
    $local = Join-Path $root 'local'
    $system = Join-Path $root 'synthetic-windows'
    foreach ($directory in @($kit, $temp, $local, $system)) {
        [void][IO.Directory]::CreateDirectory($directory)
    }
    # Copy only the real bootstrap. A missing companion must stop before any
    # PowerShell dispatch; a tripwire executable makes a broken gate harmless.
    [IO.File]::Copy($entryPath, (Join-Path $kit $entryName), $false)
    $psDirectory = Join-Path $system 'System32\WindowsPowerShell\v1.0'
    [void][IO.Directory]::CreateDirectory($psDirectory)
    [IO.File]::Copy($script:tripwirePath, (Join-Path $psDirectory 'powershell.exe'), $false)
    return [pscustomobject]@{Root=$root;Kit=$kit;Temp=$temp;Local=$local;System=$system}
}
function Add-Jhm13BootstrapCompanions($Fixture, [switch]$WithoutHelper) {
    [void][IO.Directory]::CreateDirectory((Join-Path $Fixture.Kit 'data'))
    foreach ($relative in @('data\Update-Mobile13.ps1','data\candidate.json','POWER_SHELL_ERROR_CHECKLIST.txt')) {
        [IO.File]::Copy((Join-Path $KitRoot $relative), (Join-Path $Fixture.Kit $relative), $false)
    }
    if (!$WithoutHelper) {
        [IO.File]::Copy($safetyPath, (Join-Path $Fixture.Kit 'data\JH-RUN-SAFETY.ps1'), $false)
    }
    [IO.File]::WriteAllText((Join-Path $Fixture.Kit 'data\JH168-Mobile13-UNSIGNED-20261101.apk'), 'SYNTHETIC_NOT_EXECUTED', $utf8)
}
function Invoke-Jhm13Bootstrap($Fixture, [string]$Mode='tripwire') {
    $start = New-Object Diagnostics.ProcessStartInfo
    $start.FileName = $realCmd
    $start.Arguments = '/d /u /c ""%JH_MOBILE13_TEST_ENTRY%""'
    $start.WorkingDirectory = $Fixture.Root
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardInput = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $start.StandardOutputEncoding = [Text.Encoding]::Unicode
    $start.StandardErrorEncoding = [Text.Encoding]::Unicode
    $start.EnvironmentVariables['JH_MOBILE13_TEST_ENTRY'] = Join-Path $Fixture.Kit $entryName
    $start.EnvironmentVariables['JH_MOBILE13_TEST_TRIPWIRE'] = Join-Path $Fixture.Root 'unexpected-powershell.txt'
    $start.EnvironmentVariables['JH_MOBILE13_TEST_STUB_MODE'] = $Mode
    $start.EnvironmentVariables['SystemRoot'] = $Fixture.System
    $start.EnvironmentVariables['LOCALAPPDATA'] = $Fixture.Local
    $start.EnvironmentVariables['TEMP'] = $Fixture.Temp
    $start.EnvironmentVariables['TMP'] = $Fixture.Temp
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $start
    try {
        [void]$process.Start()
        $process.StandardInput.Close()
        $stdout = $process.StandardOutput.ReadToEndAsync()
        $stderr = $process.StandardError.ReadToEndAsync()
        if (!$process.WaitForExit(15000)) {
            $process.Kill()
            throw 'Synthetic CMD fixture exceeded 15 seconds.'
        }
        $process.WaitForExit()
        return [pscustomobject]@{ExitCode=$process.ExitCode;Output=$stdout.Result;Error=$stderr.Result}
    } finally { $process.Dispose() }
}

function Set-Jhm13Constant([string]$Text, [string]$Name, [string]$Value) {
    Assert-Jhm13 ($Value -cmatch '^[0-9a-f]{64}$') 'Fixture pin must be an exact SHA-256.'
    $pattern = '(?m)^\$' + [regex]::Escape($Name) + "='[^']*'$"
    $found = [regex]::Matches($Text, $pattern)
    Assert-Jhm13Equal $found.Count 1 ('Pin injection anchor changed: ' + $Name)
    return $Text.Replace($found[0].Value, ('$' + $Name + "='" + $Value + "'"))
}
function Set-Jhm13Function([string]$Text, [string]$Name, [string]$Replacement) {
    $tokens = $null; $errors = $null
    $ast = [Management.Automation.Language.Parser]::ParseInput($Text, [ref]$tokens, [ref]$errors)
    Assert-Jhm13 (!$errors -or $errors.Count -eq 0) 'Cannot inject a function into invalid production syntax.'
    $found = @($ast.FindAll({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst]}, $true) |
        Where-Object {$_.Name -ceq $Name})
    Assert-Jhm13Equal $found.Count 1 ('Function injection anchor changed: ' + $Name)
    $part = $found[0].Extent
    return $Text.Remove($part.StartOffset, $part.EndOffset - $part.StartOffset).Insert($part.StartOffset, $Replacement)
}
function New-Jhm13Zip([string]$Path, [string]$Marker) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::Open($Path, [IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($name in @('AndroidManifest.xml','classes.dex')) {
            $entry = $zip.CreateEntry($name)
            $writer = New-Object IO.StreamWriter($entry.Open(), $utf8)
            try {$writer.Write('SYNTHETIC_NOT_ANDROID_' + $Marker + '_' + $name)} finally {$writer.Dispose()}
        }
    } finally {$zip.Dispose()}
}
function New-Jhm13UpdaterFixture([string]$Name, [string]$Mode='success', [switch]$GuardFlushFailure) {
    $root = New-Jhm13Directory $Name
    $kit = Join-Path $root 'kit'
    $local = Join-Path $root 'local'
    $user = Join-Path $root 'user'
    $data = Join-Path $kit 'data'
    foreach ($directory in @($kit, $local, $user, $data, (Join-Path $user '.android'))) {
        [void][IO.Directory]::CreateDirectory($directory)
    }
    foreach ($relative in @($entryName, 'POWER_SHELL_ERROR_CHECKLIST.txt','data\JH-RUN-SAFETY.ps1')) {
        [IO.File]::Copy((Join-Path $KitRoot $relative), (Join-Path $kit $relative), $false)
    }
    $unsigned = Join-Path $data 'JH168-Mobile13-UNSIGNED-20261101.apk'
    $baseline = Join-Path $root 'baseline.apk'
    $installed = Join-Path $root 'synthetic-installed.apk'
    New-Jhm13Zip $unsigned 'CANDIDATE'
    New-Jhm13Zip $baseline 'BASELINE'
    if ($Mode -ceq 'wrong-before-hash') {New-Jhm13Zip $installed 'WRONG_BASELINE'}
    else {[IO.File]::Copy($baseline, $installed, $false)}
    # No key exists: the file is an inert sentinel, and keytool's only call is
    # handled by the in-memory function stub below.
    [IO.File]::WriteAllText((Join-Path $user '.android\debug.keystore'), 'SYNTHETIC_NOT_A_KEY', $utf8)
    $certificateBytes = $utf8.GetBytes('SYNTHETIC_PUBLIC_CERTIFICATE_BYTES_NOT_A_REAL_CERT')
    $sha = [Security.Cryptography.SHA256]::Create()
    try {$certificateHash = [BitConverter]::ToString($sha.ComputeHash($certificateBytes)).Replace('-','').ToLowerInvariant()} finally {$sha.Dispose()}
    $unsignedHash = Get-Jhm13Hash $unsigned
    $baselineHash = Get-Jhm13Hash $baseline
    $manifest = [IO.File]::ReadAllText((Join-Path $KitRoot 'data\candidate.json')) | ConvertFrom-Json
    $manifest.unsignedSha256 = $unsignedHash
    $manifest.unsignedBytes = (Get-Item -LiteralPath $unsigned).Length
    $manifest.previousInstalledSha256 = $baselineHash
    $manifest.certificateSha256 = $certificateHash
    $manifestPath = Join-Path $data 'candidate.json'
    [IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 12), $utf8)
    $settings = [ordered]@{
        mode=$Mode;installedPath=$installed;baselinePath=$baseline;
        certificateSha256=$certificateHash;certificateBase64=[Convert]::ToBase64String($certificateBytes);
        serial='SYNTHETIC-SAMSUNG-ONLY';unsignedSha256=$unsignedHash;
        cacheRoot=(Join-Path (Join-Path $local 'JH168Mobile13') $unsignedHash.Substring(0,16))
    }
    [IO.File]::WriteAllText((Join-Path $root 'scenario.json'), ($settings | ConvertTo-Json), $utf8)
    $source = [IO.File]::ReadAllText($updaterPath)
    foreach ($pair in @(
        @('UnsignedExpected',$unsignedHash), @('PreviousInstalledExpected',$baselineHash),
        @('CertExpected',$certificateHash), @('ManifestExpected',(Get-Jhm13Hash $manifestPath))
    )) {$source = Set-Jhm13Constant $source $pair[0] $pair[1]}
    $toolchainStub = @'
function Get-JhToolchain {
    return [PSCustomObject]@{Java='JHM13_JAVA';Keytool='JHM13_KEYTOOL';Adb='JHM13_ADB';Signer='JHM13_SIGNER';Align='JHM13_ALIGN';Aapt='JHM13_AAPT'}
}
'@
    $toolStub = @'
function Invoke-JhTool([string]$Exe,[string[]]$Arguments) {
    # Test-copy replacement only. No process invocation is present in this body.
    $fixtureRoot=$env:JH_MOBILE13_SYNTHETIC_ROOT
    if(!$fixtureRoot){throw 'SYNTHETIC_FIXTURE_ROOT_REQUIRED'}
    $scenario=[IO.File]::ReadAllText((Join-Path $fixtureRoot 'scenario.json')) | ConvertFrom-Json
    $newline=[Environment]::NewLine
    $kind='';$text=''
    if($Exe -ceq 'JHM13_AAPT'){
        if($Arguments.Count -ne 3 -or $Arguments[0] -cne 'dump' -or $Arguments[1] -cne 'badging'){throw 'UNEXPECTED_SYNTHETIC_AAPT_ARGUMENTS'}
        $kind='inspect_apk'
        $text="package: name='com.koreanlifehub.bridge' versionCode='168' versionName='jh168-gemini-right-v2-release'"
    } elseif($Exe -ceq 'JHM13_KEYTOOL'){
        if($Arguments[0] -cne '-exportcert'){throw 'UNEXPECTED_SYNTHETIC_KEYTOOL_ARGUMENTS'}
        $kind='public_certificate'
        $text='-----BEGIN CERTIFICATE-----'+$newline+$scenario.certificateBase64+$newline+'-----END CERTIFICATE-----'
    } elseif($Exe -ceq 'JHM13_ALIGN'){
        if($Arguments.Count -ne 4 -or $Arguments[0] -cne '-p' -or $Arguments[1] -cne '4'){throw 'UNEXPECTED_SYNTHETIC_ALIGN_ARGUMENTS'}
        $kind='align'
        [IO.File]::Copy($Arguments[2],$Arguments[3],$false)
    } elseif($Exe -ceq 'JHM13_JAVA'){
        if($Arguments.Count -lt 4 -or $Arguments[0] -cne '-jar' -or $Arguments[1] -cne 'JHM13_SIGNER'){throw 'UNEXPECTED_SYNTHETIC_JAVA_ARGUMENTS'}
        if($Arguments[2] -ceq 'verify'){
            $kind='verify_signature'
            $cert=$scenario.certificateSha256
            if($scenario.mode -ceq 'wrong-before-cert' -and [IO.Path]::GetFileName($Arguments[-1]) -ceq 'before.apk'){$cert=('0'*64)}
            $text='Verified using v2 scheme (APK Signature Scheme v2): true'+$newline+'Signer #1 certificate SHA-256 digest: '+$cert
        } elseif($Arguments[2] -ceq 'sign'){
            $kind='sign'
            $outIndex=[Array]::IndexOf($Arguments,'--out')
            if($outIndex -lt 0 -or $outIndex+1 -ge $Arguments.Count){throw 'SYNTHETIC_SIGN_OUTPUT_MISSING'}
            $destination=$Arguments[$outIndex+1]
            [IO.File]::Copy($Arguments[-1],$destination,$false)
            Add-Type -AssemblyName System.IO.Compression.FileSystem
            $zip=[IO.Compression.ZipFile]::Open($destination,[IO.Compression.ZipArchiveMode]::Update)
            try {
                if($scenario.mode -ceq 'payload-tamper'){
                    $old=$zip.GetEntry('classes.dex');$old.Delete()
                    $entry=$zip.CreateEntry('classes.dex');$writer=New-Object IO.StreamWriter($entry.Open())
                    try{$writer.Write('SYNTHETIC_CHANGED_PAYLOAD')}finally{$writer.Dispose()}
                }
                $entry=$zip.CreateEntry('META-INF/SYNTHETIC.SF');$writer=New-Object IO.StreamWriter($entry.Open())
                try{$writer.Write('SYNTHETIC_NOT_A_SIGNATURE')}finally{$writer.Dispose()}
            } finally {$zip.Dispose()}
        } else {throw 'UNEXPECTED_SYNTHETIC_SIGNER_COMMAND'}
    } elseif($Exe -ceq 'JHM13_ADB'){
        if($Arguments.Count -eq 2 -and $Arguments[0] -ceq 'devices' -and $Arguments[1] -ceq '-l'){
            $kind='devices';$text='List of devices attached'+$newline+$scenario.serial+' device product:synthetic'
        } else {
            if($Arguments.Count -lt 4 -or $Arguments[0] -cne '-s' -or $Arguments[1] -cne $scenario.serial){throw 'UNEXPECTED_SYNTHETIC_DEVICE_BINDING'}
            if($Arguments.Count -eq 5 -and $Arguments[2] -ceq 'shell' -and $Arguments[3] -ceq 'getprop' -and $Arguments[4] -ceq 'ro.product.manufacturer'){
                $kind='manufacturer';$text='Samsung'
            } elseif($Arguments.Count -eq 6 -and $Arguments[2] -ceq 'shell' -and $Arguments[3] -ceq 'pm' -and $Arguments[4] -ceq 'path' -and $Arguments[5] -ceq 'com.koreanlifehub.bridge'){
                $kind='package_path';$text='package:/data/app/SYNTHETIC/base.apk'
            } elseif($Arguments.Count -eq 5 -and $Arguments[2] -ceq 'pull' -and $Arguments[3] -ceq '/data/app/SYNTHETIC/base.apk'){
                $kind='pull_apk';[IO.File]::Copy($scenario.installedPath,$Arguments[4],$false)
            } elseif($Arguments.Count -eq 5 -and $Arguments[2] -ceq 'install' -and $Arguments[3] -ceq '-r'){
                $guards=@(Get-ChildItem -LiteralPath $scenario.cacheRoot -Filter 'install-*.json' -File)
                if($guards.Count -ne 1){throw 'SYNTHETIC_INSTALL_BEFORE_PERSISTENT_GUARD'}
                $guard=[IO.File]::ReadAllText($guards[0].FullName) | ConvertFrom-Json
                if($guard.runId -cne $script:Id -or $guard.automaticReplay -ne $false -or $guard.signedSha256 -cne (Get-JhSha $Arguments[4])){throw 'SYNTHETIC_GUARD_BINDING_MISMATCH'}
                $kind='install'
                [IO.File]::AppendAllText((Join-Path $fixtureRoot 'calls.txt'),$kind+$newline)
                if($scenario.mode -ceq 'unknown-install'){return [PSCustomObject]@{ExitCode=1;Text='SYNTHETIC_RESPONSE_LOST_INSTALLED_BYTES_UNCHANGED'}}
                [IO.File]::Copy($Arguments[4],$scenario.installedPath,$true)
                return [PSCustomObject]@{ExitCode=0;Text='Success'}
            } else {throw 'UNEXPECTED_SYNTHETIC_ADB_OPERATION'}
        }
    } else {throw 'UNEXPECTED_SYNTHETIC_TOOL'}
    [IO.File]::AppendAllText((Join-Path $fixtureRoot 'calls.txt'),$kind+$newline)
    return [PSCustomObject]@{ExitCode=0;Text=$text}
}
'@
    $source = Set-Jhm13Function $source 'Get-JhToolchain' $toolchainStub
    $source = Set-Jhm13Function $source 'Invoke-JhTool' $toolStub
    if ($GuardFlushFailure) {
        $anchor = '$fileStream.Flush($true)'
        Assert-Jhm13Equal ([regex]::Matches($source, [regex]::Escape($anchor)).Count) 1 'Guard flush fault anchor changed.'
        $fault = "if([IO.Path]::GetFileName(" + '$Path' + ") -like 'install-*'){throw 'SYNTHETIC_GUARD_FLUSH_FAILED'};" + $anchor
        $source = $source.Replace($anchor, $fault)
    }
    [IO.File]::WriteAllText((Join-Path $data 'Update-Mobile13.ps1'), $source, (New-Object Text.UTF8Encoding($true)))
    return [pscustomobject]@{Root=$root;Kit=$kit;Local=$local;User=$user;Settings=$settings}
}
function Invoke-Jhm13Updater($Fixture) {
    $id = 'test-' + [guid]::NewGuid().ToString('N')
    $start = New-Object Diagnostics.ProcessStartInfo
    $start.FileName = Join-Path $PSHOME 'powershell.exe'
    $start.Arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + (Join-Path $Fixture.Kit 'data\Update-Mobile13.ps1') + '" -RunId "' + $id + '"'
    $start.WorkingDirectory = $Fixture.Root
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $start.EnvironmentVariables['JH_MOBILE13_SYNTHETIC_ROOT'] = $Fixture.Root
    $start.EnvironmentVariables['LOCALAPPDATA'] = $Fixture.Local
    $start.EnvironmentVariables['USERPROFILE'] = $Fixture.User
    $start.EnvironmentVariables['TEMP'] = $Fixture.Root
    $start.EnvironmentVariables['TMP'] = $Fixture.Root
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $start
    try {
        [void]$process.Start()
        $stdout = $process.StandardOutput.ReadToEndAsync()
        $stderr = $process.StandardError.ReadToEndAsync()
        if (!$process.WaitForExit(30000)) {$process.Kill();throw 'Synthetic updater exceeded 30 seconds.'}
        $process.WaitForExit()
        $output = $stdout.Result; $errorText = $stderr.Result; $exit = $process.ExitCode
    } finally {$process.Dispose()}
    Assert-Jhm13Equal $exit 0 ('Updater did not save a verified primary result: ' + $output + $errorText)
    $reportPath = Join-Path $Fixture.Kit 'RESULT.txt'
    $report = Read-JhRunResult -Kit $Fixture.Kit -RunId $id -ReportPath $reportPath -Kind 'ONECLICK'
    return [pscustomobject]@{RunId=$id;Report=$report;Output=$output;Error=$errorText;ReportText=[IO.File]::ReadAllText($reportPath)}
}
function Get-Jhm13CallCount($Fixture, [string]$Kind) {
    $path = Join-Path $Fixture.Root 'calls.txt'
    if (!(Test-Path -LiteralPath $path -PathType Leaf)) {return 0}
    return @([IO.File]::ReadAllLines($path) | Where-Object {$_ -ceq $Kind}).Count
}
function Assert-Jhm13Result($Observed, [string]$Status, [int]$Attempts, [string]$Reason='') {
    Assert-Jhm13Equal $Observed.Report.Status $Status ('Wrong updater status: ' + $Observed.ReportText)
    Assert-Jhm13Equal $Observed.Report.AttemptCount $Attempts 'Wrong current-run install attempt count.'
    if ($Reason) {Assert-Jhm13 ($Observed.Report.Body -contains ('FIRST_FAILURE_REASON: ' + $Reason)) ('Missing expected failure: ' + $Reason + '; ' + $Observed.ReportText)}
}

try {
    foreach ($path in @($entryPath, $updaterPath, $safetyPath, $canonicalSafety)) {
        Assert-Jhm13 (Test-Path -LiteralPath $path -PathType Leaf) ('Required actual runner file missing: ' + $path)
    }
    foreach ($file in @(Get-ChildItem -LiteralPath $KitRoot -File -Recurse)) {
        $originalFiles[$file.FullName] = Get-Jhm13Hash $file.FullName
    }

    Invoke-Jhm13Case 'exact production scripts parse in Windows 5.1 and avoid aliases' {
        $scripts = @(Get-ChildItem -LiteralPath $KitRoot -File -Recurse | Where-Object {$_.Extension -in @('.ps1','.psm1')})
        Assert-Jhm13 ($scripts.Count -ge 2) 'Expected updater and shared run safety scripts.'
        foreach ($scriptFile in $scripts) {
            $tokens = $null; $parseErrors = $null
            $ast = [Management.Automation.Language.Parser]::ParseFile($scriptFile.FullName, [ref]$tokens, [ref]$parseErrors)
            if ($parseErrors -and $parseErrors.Count -gt 0) {
                throw ('PowerShell parse error in ' + $scriptFile.Name + ': ' + $parseErrors[0].Message)
            }
            foreach ($fn in @($ast.FindAll({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst]}, $true))) {
                Assert-Jhm13 (!(Get-Alias -Name $fn.Name -ErrorAction SilentlyContinue)) ('Function/alias collision: ' + $fn.Name)
            }
            $raw = [IO.File]::ReadAllBytes($scriptFile.FullName)
            $text = [IO.File]::ReadAllText($scriptFile.FullName)
            if ($text -match '[^\x00-\x7F]') {
                $bom = ($raw.Length -ge 3 -and $raw[0] -eq 239 -and $raw[1] -eq 187 -and $raw[2] -eq 191) -or
                    ($raw.Length -ge 2 -and (($raw[0] -eq 255 -and $raw[1] -eq 254) -or ($raw[0] -eq 254 -and $raw[1] -eq 255)))
                Assert-Jhm13 $bom ('Non-ASCII Windows PowerShell lacks a BOM: ' + $scriptFile.Name)
            }
        }
    }

    Invoke-Jhm13Case 'actual bootstrap has ASCII CRLF and disables delayed expansion' {
        $raw = [IO.File]::ReadAllBytes($entryPath)
        Assert-Jhm13 (@($raw | Where-Object {$_ -gt 127}).Count -eq 0) 'CMD must contain ASCII bytes only.'
        $text = [Text.Encoding]::ASCII.GetString($raw)
        Assert-Jhm13 ($text -notmatch '(?<!\r)\n|\r(?!\n)') 'CMD must have only CRLF line endings.'
        Assert-Jhm13 ($text -match '(?im)^setlocal .*DisableDelayedExpansion\s*$') 'Delayed expansion must remain disabled.'
    }

    Invoke-Jhm13Case 'delivered safety helper is the unchanged reviewed helper' {
        Assert-Jhm13Equal (Get-Jhm13Hash $safetyPath) (Get-Jhm13Hash $canonicalSafety) 'Shared safety helper was changed.'
    }
    Invoke-Jhm13Case 'production manifest and original APK certificate pins are bound' {
        $source = [IO.File]::ReadAllText($updaterPath)
        $manifestPath = Join-Path $KitRoot 'data\candidate.json'
        $manifestHash = Get-Jhm13Hash $manifestPath
        Assert-Jhm13 ($source.Contains('$ManifestExpected=' + "'" + $manifestHash + "'")) 'Production manifest pin is stale.'
        Assert-Jhm13 ($source.Contains('$SafetyExpected=' + "'" + (Get-Jhm13Hash $safetyPath) + "'")) 'Production helper pin is stale.'
        $manifest = [IO.File]::ReadAllText($manifestPath) | ConvertFrom-Json
        Assert-Jhm13Equal $manifest.unsignedSha256 '40b8f766692a1e44e8e02fc9ed0de47a1ba172e12c0cf634852ec647cc9905d3' 'Original verified unsigned APK pin changed.'
        Assert-Jhm13Equal $manifest.certificateSha256 '7cc577efe48e865fdbe799b92aa9edf89724631361ae97979f2b8e4a940a288b' 'Original certificate pin changed.'
        Assert-Jhm13Equal $manifest.unsignedBytes 48835763 'Original unsigned APK byte count changed.'
    }
    . $safetyPath

    Invoke-Jhm13Case 'current result identity and attempt count reject stale or forged reports' {
        $kit = New-Jhm13Directory 'identity'
        $id = [guid]::NewGuid().ToString('N')
        $saved = Write-JhRunResult -Kit $kit -RunId $id -Kind 'SIGNER' -Status 'SYNTHETIC_NO_DEVICE' -AttemptCount 0 -Lines @('FIXTURE_ONLY: TRUE')
        Assert-Jhm13 $saved.Saved 'Synthetic primary result was not saved.'
        $read = Read-JhRunResult -Kit $kit -RunId $id -ReportPath $saved.ReportPath -Kind 'SIGNER'
        Assert-Jhm13Equal $read.AttemptCount 0 'No-effect fixture count changed.'
        Assert-Jhm13Throws {Read-JhRunResult -Kit $kit -RunId 'stale-run' -ReportPath $saved.ReportPath -Kind 'SIGNER'} 'CURRENT_RUN_RESULT_IDENTITY_OR_COUNT_INVALID'
        Assert-Jhm13Throws {Read-JhRunResult -Kit $kit -RunId $id -ReportPath $saved.ReportPath -Kind 'ONECLICK'} 'CURRENT_RUN_RESULT_IDENTITY_OR_COUNT_INVALID'
        Assert-Jhm13Throws {Write-JhRunResult -Kit $kit -RunId $id -Kind 'SIGNER' -Status 'SYNTHETIC' -AttemptCount 2 -Lines @()} 'INVALID_INSTALL_ATTEMPT_COUNT'
        Assert-Jhm13Throws {Write-JhRunResult -Kit $kit -RunId $id -Kind 'SIGNER' -Status 'SYNTHETIC' -AttemptCount 0 -Lines @('RUN_ID: injected')} 'DUPLICATE_RESULT_METADATA'
    }

    Invoke-Jhm13Case 'primary write failure preserves current identity through an actual fallback' {
        $kit = New-Jhm13Directory 'fallback'
        [void][IO.Directory]::CreateDirectory((Join-Path $kit 'RESULT.txt'))
        $id = [guid]::NewGuid().ToString('N')
        $saved = Write-JhRunResult -Kit $kit -RunId $id -Kind 'SIGNER' -Status 'SYNTHETIC_NO_DEVICE' -AttemptCount 0 -Lines @('FIXTURE_ONLY: TRUE')
        Assert-Jhm13 ($saved.Saved -and $saved.FallbackUsed) 'Primary filesystem failure did not produce a fallback.'
        $read = Read-JhRunResult -Kit $kit -RunId $id -ReportPath $saved.ReportPath -Kind 'SIGNER'
        Assert-Jhm13Equal $read.RunId $id 'Fallback was not bound to this run.'
        Assert-Jhm13Equal $read.AttemptCount 0 'Fallback claimed a device effect.'
    }

    Invoke-Jhm13Case 'same-folder competing run is rejected without touching the owner result' {
        $kit = New-Jhm13Directory 'lock ownership'
        $id = [guid]::NewGuid().ToString('N')
        $lock = Enter-JhRunLock -Kit $kit -RunId $id
        try {
            $resultPath = Join-Path $kit 'RESULT.txt'
            [IO.File]::WriteAllText($resultPath, 'CURRENT_OWNER_SENTINEL', $utf8)
            $before = Get-Jhm13Hash $resultPath
            Assert-Jhm13Throws {Enter-JhRunLock -Kit $kit -RunId 'competing-run'} 'RUN_LOCK_UNAVAILABLE_NO_PARALLEL_EXECUTION'
            Assert-Jhm13Throws {Enter-JhRunLock -Kit $kit -RunId 'wrong-parent-id' -ParentLock $lock} 'INVALID_PARENT_RUN_LOCK'
            Assert-Jhm13Equal (Get-Jhm13Hash $resultPath) $before 'Competing run changed the owner result.'
        } finally {Exit-JhRunLock -Lock $lock -Owned $true}
        $nextLock = Enter-JhRunLock -Kit $kit -RunId ([guid]::NewGuid().ToString('N'))
        Exit-JhRunLock -Lock $nextLock -Owned $true
    }

    Invoke-Jhm13Case 'first synthetic success signs and installs once; repeat reads and reuses with zero install' {
        $fixture = New-Jhm13UpdaterFixture 'success-repeat'
        $first = Invoke-Jhm13Updater $fixture
        Assert-Jhm13Result $first 'NEW_PASS' 1
        Assert-Jhm13Equal (Get-Jhm13CallCount $fixture 'sign') 1 'First run must sign once.'
        Assert-Jhm13Equal (Get-Jhm13CallCount $fixture 'install') 1 'First run must install once.'
        $guards = @(Get-ChildItem -LiteralPath $fixture.Settings.cacheRoot -Filter 'install-*.json' -File)
        Assert-Jhm13Equal $guards.Count 1 'Exactly one persistent device/candidate guard is required.'
        $guardHash = Get-Jhm13Hash $guards[0].FullName
        $oldReportHash = Get-Jhm13Hash (Join-Path $fixture.Kit 'RESULT.txt')
        $again = Invoke-Jhm13Updater $fixture
        Assert-Jhm13Result $again 'REUSED_PASS' 0
        Assert-Jhm13Equal (Get-Jhm13CallCount $fixture 'sign') 1 'Repeat re-signed an already verified candidate.'
        Assert-Jhm13Equal (Get-Jhm13CallCount $fixture 'install') 1 'Repeat issued another installation.'
        Assert-Jhm13Equal (Get-Jhm13Hash $guards[0].FullName) $guardHash 'Completed guard was rewritten or removed.'
        $preserved = Join-Path $fixture.Kit ('logs\previous-' + $again.RunId + '-RESULT.txt')
        Assert-Jhm13Equal (Get-Jhm13Hash $preserved) $oldReportHash 'Previous result was not preserved byte-for-byte.'
        Assert-Jhm13 ($again.Report.Body -contains 'INSTALL: REUSED_PASS_ACTUAL_INSTALLED_BYTES_MATCH') 'Reuse lacked actual installed-byte evidence.'
    }

    Invoke-Jhm13Case 'unknown install remains unknown and repeat cannot issue another install' {
        $fixture = New-Jhm13UpdaterFixture 'unknown-repeat' 'unknown-install'
        $beforeHash = Get-Jhm13Hash $fixture.Settings.installedPath
        $first = Invoke-Jhm13Updater $fixture
        Assert-Jhm13Result $first 'UNKNOWN' 1 'INSTALL_RESULT_NOT_MATCHED_NO_RETRY'
        Assert-Jhm13Equal (Get-Jhm13CallCount $fixture 'install') 1 'Unknown result must retain the first attempt.'
        Assert-Jhm13Equal (Get-Jhm13Hash $fixture.Settings.installedPath) $beforeHash 'Unknown fixture changed installed bytes.'
        $guard = @(Get-ChildItem -LiteralPath $fixture.Settings.cacheRoot -Filter 'install-*.json' -File)[0]
        $guardHash = Get-Jhm13Hash $guard.FullName
        $again = Invoke-Jhm13Updater $fixture
        Assert-Jhm13Result $again 'BLOCKED' 0 'PRIOR_INSTALL_ATTEMPT_PRESERVED_READBACK_NOT_MATCHED_NO_RETRY'
        Assert-Jhm13Equal (Get-Jhm13CallCount $fixture 'install') 1 'Uncertain prior effect was replayed.'
        Assert-Jhm13Equal (Get-Jhm13CallCount $fixture 'sign') 1 'Unknown repeat discarded the verified signature cache.'
        Assert-Jhm13Equal (Get-Jhm13Hash $guard.FullName) $guardHash 'Unknown-attempt guard changed.'
    }

    Invoke-Jhm13Case 'an unresolved guard still blocks when the signature cache is missing' {
        $fixture = New-Jhm13UpdaterFixture 'unknown-cache-lost' 'unknown-install'
        Assert-Jhm13Result (Invoke-Jhm13Updater $fixture) 'UNKNOWN' 1 'INSTALL_RESULT_NOT_MATCHED_NO_RETRY'
        # Delete only synthetic fixture copies to model an interrupted cache loss.
        Remove-Item -LiteralPath (Join-Path $fixture.Settings.cacheRoot 'JH168-Mobile13-SIGNED.apk')
        Remove-Item -LiteralPath (Join-Path $fixture.Settings.cacheRoot 'signed-artifact.json')
        $again = Invoke-Jhm13Updater $fixture
        Assert-Jhm13Result $again 'BLOCKED' 0 'PRIOR_INSTALL_ATTEMPT_PRESERVED_NO_RESIGN_OR_RETRY'
        Assert-Jhm13Equal (Get-Jhm13CallCount $fixture 'sign') 1 'Missing signature cache caused a new signing attempt.'
        Assert-Jhm13Equal (Get-Jhm13CallCount $fixture 'install') 1 'Missing signature cache bypassed the unresolved guard.'
    }

    foreach ($condition in @(
        @('wrong-before-hash','INSTALLED_BASELINE_CHANGED_NO_OVERWRITE'),
        @('wrong-before-cert','APK_ORIGINAL_CERTIFICATE_UNVERIFIED')
    )) {
        Invoke-Jhm13Case ('original installed identity mismatch blocks before signing: ' + $condition[0]) {
            $fixture = New-Jhm13UpdaterFixture $condition[0] $condition[0]
            $beforeHash = Get-Jhm13Hash $fixture.Settings.installedPath
            $observed = Invoke-Jhm13Updater $fixture
            Assert-Jhm13Result $observed 'BLOCKED' 0 $condition[1]
            Assert-Jhm13Equal (Get-Jhm13CallCount $fixture 'sign') 0 'Mismatch reached signing.'
            Assert-Jhm13Equal (Get-Jhm13CallCount $fixture 'install') 0 'Mismatch reached installation.'
            Assert-Jhm13Equal (Get-Jhm13Hash $fixture.Settings.installedPath) $beforeHash 'Mismatch changed existing bytes.'
        }
    }

    Invoke-Jhm13Case 'guard flush fault stops before install and preserves the sticky attempt record' {
        $fixture = New-Jhm13UpdaterFixture 'guard-flush' -GuardFlushFailure
        $first = Invoke-Jhm13Updater $fixture
        Assert-Jhm13Result $first 'BLOCKED' 0 'SYNTHETIC_GUARD_FLUSH_FAILED'
        Assert-Jhm13Equal (Get-Jhm13CallCount $fixture 'install') 0 'Guard flush failure reached installation.'
        $guards = @(Get-ChildItem -LiteralPath $fixture.Settings.cacheRoot -Filter 'install-*.json' -File)
        Assert-Jhm13Equal $guards.Count 1 'Guard created before the flush fault was discarded.'
        $again = Invoke-Jhm13Updater $fixture
        Assert-Jhm13Result $again 'BLOCKED' 0 'PRIOR_INSTALL_ATTEMPT_PRESERVED_READBACK_NOT_MATCHED_NO_RETRY'
        Assert-Jhm13Equal (Get-Jhm13CallCount $fixture 'install') 0 'Guard failure caused an automatic retry.'
        Assert-Jhm13Equal (Get-Jhm13CallCount $fixture 'sign') 1 'Guard failure re-signed an existing verified candidate.'
    }

    Invoke-Jhm13Case 'changed signed ZIP payload is refused and its partial output is preserved' {
        $fixture = New-Jhm13UpdaterFixture 'payload-tamper' 'payload-tamper'
        $first = Invoke-Jhm13Updater $fixture
        Assert-Jhm13Result $first 'BLOCKED' 0 'SIGNED_APK_PAYLOAD_CHANGED'
        Assert-Jhm13 ($first.Report.Body -contains 'SIGNING: UNKNOWN') 'Changed payload was presented as verified signing.'
        Assert-Jhm13Equal (Get-Jhm13CallCount $fixture 'install') 0 'Payload mismatch reached installation.'
        $signedPath = Join-Path $fixture.Settings.cacheRoot 'JH168-Mobile13-SIGNED.apk'
        $partialHash = Get-Jhm13Hash $signedPath
        Assert-Jhm13 (!(Test-Path -LiteralPath (Join-Path $fixture.Settings.cacheRoot 'signed-artifact.json'))) 'Unverified payload was cached as verified.'
        $again = Invoke-Jhm13Updater $fixture
        Assert-Jhm13Result $again 'BLOCKED' 0 'PARTIAL_SIGNED_ARTIFACT_PRESERVED_REVIEW_REQUIRED'
        Assert-Jhm13Equal (Get-Jhm13Hash $signedPath) $partialHash 'Partial output was deleted or overwritten.'
        Assert-Jhm13Equal (Get-Jhm13CallCount $fixture 'sign') 1 'Partial signature was retried automatically.'
    }

    Invoke-Jhm13Case 'unsigned hash mismatch blocks before any external-tool boundary' {
        $fixture = New-Jhm13UpdaterFixture 'unsigned-hash'
        [IO.File]::AppendAllText((Join-Path $fixture.Kit 'data\JH168-Mobile13-UNSIGNED-20261101.apk'), 'TAMPER', $utf8)
        $observed = Invoke-Jhm13Updater $fixture
        Assert-Jhm13Result $observed 'BLOCKED' 0 'VERIFIED_UNSIGNED_APK_HASH_OR_SIZE_MISMATCH'
        Assert-Jhm13 (!(Test-Path -LiteralPath (Join-Path $fixture.Root 'calls.txt'))) 'Unverified input reached a tool.'
    }

    Invoke-Jhm13Case 'candidate-wide lock blocks a second extraction before any tool use' {
        $fixture = New-Jhm13UpdaterFixture 'candidate-lock'
        [void][IO.Directory]::CreateDirectory($fixture.Settings.cacheRoot)
        $cacheLock = Enter-JhRunLock -Kit $fixture.Settings.cacheRoot -RunId 'original-candidate-owner'
        try {
            $observed = Invoke-Jhm13Updater $fixture
            Assert-Jhm13Result $observed 'BLOCKED' 0 'RUN_LOCK_UNAVAILABLE_NO_PARALLEL_EXECUTION'
            Assert-Jhm13 (!(Test-Path -LiteralPath (Join-Path $fixture.Root 'calls.txt'))) 'Competing candidate reached a tool.'
            Assert-Jhm13 ($cacheLock.CanRead -and $cacheLock.CanWrite) 'Contender disposed the owner lock.'
        } finally {Exit-JhRunLock -Lock $cacheLock -Owned $true}
    }

    # This C# executable does not interpret PowerShell or issue any subprocess.
    # If bootstrap accidentally dispatches, it writes a marker and exits 97.
    $tripwirePath = Join-Path $testRoot 'dispatch-tripwire.exe'
    $tripwireSource = @'
using System;
using System.IO;
public static class JhMobile13Tripwire {
    public static int Main(string[] arguments) {
        string path = Environment.GetEnvironmentVariable("JH_MOBILE13_TEST_TRIPWIRE");
        if (!String.IsNullOrEmpty(path)) File.AppendAllText(path, "UNEXPECTED_DISPATCH\r\n");
        if (Environment.GetEnvironmentVariable("JH_MOBILE13_TEST_STUB_MODE") == "stale-result") {
            File.WriteAllText(Path.Combine(Environment.CurrentDirectory, "RESULT.txt"),
                "RUN_ID: stale-previous-run\r\nREPORT_KIND: ONECLICK\r\nSTATUS: NEW_PASS\r\nANDROID_INSTALL_ATTEMPT_COUNT: 0\r\n");
            return 0;
        }
        return 97;
    }
}
'@
    Add-Type -TypeDefinition $tripwireSource -OutputAssembly $tripwirePath -OutputType ConsoleApplication

    foreach ($name in @('missing companions', ('space ' + ([string][char]0xD55C) + ([string][char]0xAE00) + ' %name% !name!'))) {
        Invoke-Jhm13Case ('actual CMD rejects missing companions before dispatch: ' + $name) {
            $fixture = New-Jhm13BootstrapFixture $name
            $observed = Invoke-Jhm13Bootstrap $fixture
            Assert-Jhm13 ($observed.ExitCode -ne 0) 'Missing companion files returned success.'
            Assert-Jhm13 (!(Test-Path -LiteralPath (Join-Path $fixture.Root 'unexpected-powershell.txt'))) 'Missing files did not stop PowerShell dispatch.'
            $reports = @(Get-ChildItem -LiteralPath $fixture.Root -Filter RESULT.txt -File -Recurse)
            Assert-Jhm13Equal $reports.Count 1 'Predispatch block must save exactly one result.'
            $body = Read-Jhm13Text $reports[0].FullName
            Assert-Jhm13 ($body -match '(?m)^STATUS: BLOCKED\s*$') 'Predispatch report must say BLOCKED.'
            Assert-Jhm13 ($body -match '(?m)^(?:ANDROID_INSTALL_ATTEMPT_COUNT: 0|DEVICE_INSTALL_ATTEMPTED: FALSE)\s*$') 'Predispatch report must explicitly record no installation.'
            Assert-Jhm13 ($observed.Output.Contains($reports[0].FullName)) 'Actual result path was not printed.'
        }
    }

    Invoke-Jhm13Case 'actual CMD rejects the specifically missing helper before dispatch' {
        $fixture = New-Jhm13BootstrapFixture 'missing-helper'
        Add-Jhm13BootstrapCompanions $fixture -WithoutHelper
        $observed = Invoke-Jhm13Bootstrap $fixture
        Assert-Jhm13Equal $observed.ExitCode 1 'Missing helper was not a predispatch block.'
        Assert-Jhm13 (!(Test-Path -LiteralPath (Join-Path $fixture.Root 'unexpected-powershell.txt'))) 'Missing helper dispatched PowerShell.'
        $reports = @(Get-ChildItem -LiteralPath $fixture.Root -Filter RESULT.txt -File -Recurse)
        Assert-Jhm13Equal $reports.Count 1 'Missing helper did not save one result.'
        $text = Read-Jhm13Text $reports[0].FullName
        Assert-Jhm13 ($text.Contains('REASON: REQUIRED_FILE_MISSING_data\JH-RUN-SAFETY.ps1')) 'Missing-helper reason was not retained.'
        Assert-Jhm13 ($text.Contains('DEVICE_INSTALL_ATTEMPTED: FALSE')) 'Missing-helper block claimed uncertain dispatch.'
    }

    Invoke-Jhm13Case 'actual CMD refuses a stale successful report after one harmless dispatch' {
        $fixture = New-Jhm13BootstrapFixture 'stale-result'
        Add-Jhm13BootstrapCompanions $fixture
        $findstr = Join-Path ([Environment]::GetFolderPath([Environment+SpecialFolder]::System)) 'findstr.exe'
        [IO.File]::Copy($findstr, (Join-Path $fixture.System 'System32\findstr.exe'), $false)
        $observed = Invoke-Jhm13Bootstrap $fixture 'stale-result'
        Assert-Jhm13Equal $observed.ExitCode 2 'Stale result was accepted as current success.'
        $calls = [IO.File]::ReadAllLines((Join-Path $fixture.Root 'unexpected-powershell.txt'))
        Assert-Jhm13Equal $calls.Length 1 'Bootstrap replayed the harmless stub.'
        $reports = @(Get-ChildItem -LiteralPath $fixture.Root -Filter RESULT.txt -File -Recurse)
        $unknown = @($reports | Where-Object {(Read-Jhm13Text $_.FullName) -match '(?m)^STATUS: UNKNOWN\s*$'})
        Assert-Jhm13Equal $unknown.Count 1 'Postdispatch uncertainty was not saved separately.'
        $text = Read-Jhm13Text $unknown[0].FullName
        Assert-Jhm13 ($text.Contains('DEVICE_INSTALL_ATTEMPTED: UNKNOWN')) 'Postdispatch uncertainty claimed no possible device effect.'
        Assert-Jhm13 ($text.Contains('AUTO_RETRY: FORBIDDEN')) 'Postdispatch report lost the no-replay contract.'
        Assert-Jhm13 ([IO.File]::ReadAllText((Join-Path $fixture.Kit 'RESULT.txt')).Contains('RUN_ID: stale-previous-run')) 'Stale evidence was overwritten.'
    }

    Invoke-Jhm13Case 'original production inputs remain byte-identical' {
        $now = @(Get-ChildItem -LiteralPath $KitRoot -File -Recurse)
        Assert-Jhm13Equal $now.Count $originalFiles.Count 'Test changed production file membership.'
        foreach ($file in $now) {
            Assert-Jhm13 ($originalFiles.ContainsKey($file.FullName)) 'Test added a production file.'
            Assert-Jhm13Equal (Get-Jhm13Hash $file.FullName) $originalFiles[$file.FullName] ('Test changed production file: ' + $file.Name)
        }
    }
    $proof = [ordered]@{
        schema='JHAI_MOBILE13_WINDOWS_SYNTHETIC_V1';platform='Windows PowerShell 5.1';
        scope='SYNTHETIC_FILES_AND_PROCESSES';passed=$results.Count;failed=0;
        updaterSha256=(Get-Jhm13Hash $updaterPath);entrySha256=(Get-Jhm13Hash $entryPath);
        originalSafetySha256=(Get-Jhm13Hash $safetyPath);
        realBuild='NOT_RUN';realSigningKey='NOT_RUN';realAdb='NOT_RUN';phone='NOT_RUN'
    }
    Write-Host ('MOBILE13_WINDOWS_SYNTHETIC_RESULT: ' + ($proof | ConvertTo-Json -Compress))
} finally {
    foreach ($name in $savedEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process')
    }
    Remove-Item -LiteralPath $testRoot -Recurse -Force -ErrorAction SilentlyContinue
}
