param([Parameter(Mandatory=$true)][string]$PackagerPath, [string]$PythonExe='python')
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
# Container compatibility only: seven inert files; no real APK, key, ADB or execution.
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT -or
    $PSVersionTable.PSEdition -ne 'Desktop' -or
    $PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1) {
    throw 'Actual Windows PowerShell 5.1 is required.'
}
if ([Threading.Thread]::CurrentThread.ApartmentState -ne 'STA') { throw 'Shell COM requires the STA test host.' }
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$PackagerPath = (Resolve-Path -LiteralPath $PackagerPath).Path
$sourceHash = (Get-FileHash -LiteralPath $PackagerPath -Algorithm SHA256).Hash
$testBase = [IO.Path]::GetTempPath()
if ($env:RUNNER_TEMP) { $testBase = $env:RUNNER_TEMP }
$testRoot = Join-Path $testBase ('jhz-' + [guid]::NewGuid().ToString('N').Substring(0,8))
$source = Join-Path $testRoot 'inert-source'
$extracted = Join-Path $testRoot 'expanded'
$korean = ([string][char]0xD55C) + ([string][char]0xAE00)
$zipPath = Join-Path $testRoot ('Mobile13 ' + $korean + '.zip')
$entryName = ([string][char]0xC2E4) + ([string][char]0xD589) + '.cmd'
$guideName = ([string][char]0xC0AC) + ([string][char]0xC6A9) + ([string][char]0xC548) + ([string][char]0xB0B4) + '.txt'
$utf8 = New-Object Text.UTF8Encoding($false)
$savedEncoding = [Console]::OutputEncoding
$savedPythonEncoding = $env:PYTHONIOENCODING
$shell = $null; $zipFolder = $null; $dataFolder = $null; $dataItem = $null; $item = $null
function Assert-Jhz([bool]$Condition, [string]$Message) { if (!$Condition) { throw $Message } }
function Get-JhzHash([string]$FilePath) { return (Get-FileHash -LiteralPath $FilePath -Algorithm SHA256).Hash.ToLowerInvariant() }
try {
    [void][IO.Directory]::CreateDirectory((Join-Path $source 'data'))
    $files = [ordered]@{}
    $files[$entryName] = [Text.Encoding]::ASCII.GetBytes("@echo off`r`necho SYNTHETIC_NOT_EXECUTED`r`nexit /b 99`r`n")
    $files['POWER_SHELL_ERROR_CHECKLIST.txt'] = $utf8.GetBytes('SYNTHETIC_ARCHIVE_CONTAINER_ONLY')
    $files[$guideName] = $utf8.GetBytes($korean + ' SYNTHETIC_NOT_EXECUTED')
    $files['data/Update-Mobile13.ps1'] = $utf8.GetBytes("throw 'SYNTHETIC_NOT_EXECUTED'`r`n")
    $files['data/JH-RUN-SAFETY.ps1'] = $utf8.GetBytes("# SYNTHETIC_NOT_EXECUTED`r`n")
    $files['data/candidate.json'] = $utf8.GetBytes('{"schema":"SYNTHETIC_ARCHIVE_CONTAINER_ONLY","realApk":false}')
    $files['data/JH168-Mobile13-UNSIGNED-20261101.apk'] = [byte[]](0..255)
    $expected = New-Object 'System.Collections.Generic.Dictionary[string,object]' ([StringComparer]::Ordinal)
    foreach ($relative in $files.Keys) {
        $path = Join-Path $source $relative
        [IO.File]::WriteAllBytes($path, $files[$relative])
        $expected.Add($relative, [pscustomobject]@{Size=$files[$relative].Length;Hash=(Get-JhzHash $path)})
    }
    # Invoke the current, unchanged production CLI. Its inspect_zip gate fully
    # reads CRC-checked members; independent Windows readers verify source SHA.
    $env:PYTHONIOENCODING = 'utf-8'
    [Console]::OutputEncoding = $utf8
    $packageJson = @(& $PythonExe -B $PackagerPath package $source --output $zipPath --windows-release)
    Assert-Jhz ($LASTEXITCODE -eq 0) ('Canonical package failed: ' + ($packageJson -join "`n"))
    $package = ($packageJson -join "`n") | ConvertFrom-Json
    Assert-Jhz ($package.ok -eq $true -and $package.file_count -eq 7 -and $package.development_preflight.ok -eq $true) 'Canonical packaging or preflight did not pass for all seven files.'
    Assert-Jhz ((Get-JhzHash $zipPath) -ceq $package.zip_sha256) 'Published archive SHA differs from the packager result.'
    $manifest = [IO.File]::ReadAllText($zipPath + '.manifest.json') | ConvertFrom-Json
    Assert-Jhz (@($manifest.files.PSObject.Properties).Count -eq 7) 'Manifest must contain exactly seven files.'
    foreach ($relative in $expected.Keys) {
        $record = $manifest.files.PSObject.Properties[$relative].Value
        Assert-Jhz ($record.size -eq $expected[$relative].Size -and $record.sha256 -ceq $expected[$relative].Hash) ('Manifest/source mismatch: ' + $relative)
    }
    $archive = [IO.Compression.ZipFile]::OpenRead($zipPath)
    try {
        Assert-Jhz ($archive.Entries.Count -eq 7) '.NET archive must contain exactly seven entries.'
        $seen = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
        foreach ($member in $archive.Entries) {
            Assert-Jhz ($expected.ContainsKey($member.FullName) -and $seen.Add($member.FullName)) ('.NET unexpected or duplicate entry: ' + $member.FullName)
            $stream = $member.Open(); $sha = [Security.Cryptography.SHA256]::Create()
            try { $hash = ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-','').ToLowerInvariant() }
            finally { $sha.Dispose(); $stream.Dispose() }
            $wanted = $expected[$member.FullName]
            Assert-Jhz ($member.Length -eq $wanted.Size -and $hash -ceq $wanted.Hash) ('.NET full-read mismatch: ' + $member.FullName)
        }
    } finally { $archive.Dispose() }
    Write-Host 'PASS ARCHIVE: .NET ZipArchive full read and SHA, seven exact entries'
    Expand-Archive -LiteralPath $zipPath -DestinationPath $extracted -ErrorAction Stop
    $expandedFiles = @(Get-ChildItem -LiteralPath $extracted -File -Recurse)
    Assert-Jhz ($expandedFiles.Count -eq 7) 'Expand-Archive must extract exactly seven files.'
    foreach ($file in $expandedFiles) {
        $relative = $file.FullName.Substring($extracted.Length + 1).Replace('\','/')
        Assert-Jhz ($expected.ContainsKey($relative)) ('Expand-Archive unexpected path: ' + $relative)
        Assert-Jhz ($file.Length -eq $expected[$relative].Size -and (Get-JhzHash $file.FullName) -ceq $expected[$relative].Hash) ('Expand-Archive byte mismatch: ' + $relative)
    }
    Write-Host 'PASS ARCHIVE: Expand-Archive extraction and SHA, seven exact files'
    # A missing Shell COM/ZIP namespace is an explicit failure, never a skip.
    $shell = New-Object -ComObject Shell.Application
    $zipFolder = $shell.NameSpace([string]$zipPath)
    Assert-Jhz ($null -ne $zipFolder) 'Windows Shell did not recognize the ZIP namespace (including on a headless host).'
    Assert-Jhz ($zipFolder.Items().Count -eq 4) 'Shell ZIP root must expose three files and the data folder.'
    $dataItem = $zipFolder.ParseName('data')
    Assert-Jhz ($null -ne $dataItem -and $dataItem.IsFolder) 'Shell ZIP nested data folder is missing.'
    $dataFolder = $dataItem.GetFolder
    Assert-Jhz ($null -ne $dataFolder -and $dataFolder.Items().Count -eq 4) 'Shell ZIP data folder must expose exactly four files.'
    foreach ($relative in $expected.Keys) {
        $parts = $relative.Split('/')
        $folder = $zipFolder
        if ($parts.Length -eq 2) { $folder = $dataFolder }
        $item = $folder.ParseName($parts[$parts.Length - 1])
        Assert-Jhz ($null -ne $item -and !$item.IsFolder -and $item.Size -eq $expected[$relative].Size) ('Shell ZIP cannot read the exact entry metadata: ' + $relative)
    }
    Write-Host 'PASS ARCHIVE: Windows Shell NameSpace, Korean names and nested seven files'
    Assert-Jhz ((Get-FileHash -LiteralPath $PackagerPath -Algorithm SHA256).Hash -ceq $sourceHash) 'Canonical packager was modified during this test.'
    [ordered]@{scope='SYNTHETIC_ARCHIVE_CONTAINER_ONLY';result='PASS';providers=3;fileCount=7;packagerSha256=$sourceHash.ToLowerInvariant();zipSha256=$package.zip_sha256;windows=[Environment]::OSVersion.Version.ToString();powershell=$PSVersionTable.PSVersion.ToString();signing='NOT_RUN';install='NOT_RUN';phone='NOT_RUN'} | ConvertTo-Json -Compress
} finally {
    foreach ($comObject in @($item,$dataItem,$dataFolder,$zipFolder,$shell)) {
        if ($null -ne $comObject -and [Runtime.InteropServices.Marshal]::IsComObject($comObject)) {
            try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($comObject) } catch { Write-Warning 'Shell COM cleanup was already completed.' }
        }
    }
    [GC]::Collect(); [GC]::WaitForPendingFinalizers()
    [Console]::OutputEncoding = $savedEncoding
    $env:PYTHONIOENCODING = $savedPythonEncoding
    if (Test-Path -LiteralPath $testRoot) { Remove-Item -LiteralPath $testRoot -Recurse -Force }
}
