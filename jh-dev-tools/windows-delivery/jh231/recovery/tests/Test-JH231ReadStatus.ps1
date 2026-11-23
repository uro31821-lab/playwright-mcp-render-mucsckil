param([Parameter(Mandatory=$true)][string]$KitRoot)
$ErrorActionPreference='Stop'
if($PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1){throw 'WINDOWS_POWERSHELL_51_REQUIRED'}
$KitRoot=(Resolve-Path -LiteralPath $KitRoot).Path
$work=Join-Path ([IO.Path]::GetTempPath()) ('jh231-observer-test-'+[Guid]::NewGuid().ToString('N'))
$null=New-Item -Path $work -ItemType Directory
$passed=0
function Check([bool]$ok,[string]$name){if(-not $ok){throw ('ASSERT_FAILED: '+$name)};$script:passed++;Write-Host ('PASS '+$name)}
function PutText([string]$path,[string]$text){$null=New-Item -Path (Split-Path -Parent $path) -ItemType Directory -Force;[IO.File]::WriteAllText($path,$text,[Text.UTF8Encoding]::new($true))}
try {
    $scriptFile=Join-Path $KitRoot 'internal\JH231-READ-STATUS.ps1'
    $tokens=$null;$parseErrors=$null
    $ast=[Management.Automation.Language.Parser]::ParseFile($scriptFile,[ref]$tokens,[ref]$parseErrors)
    Check ($parseErrors.Count -eq 0) 'powershell51-parser'
    $bytes=[IO.File]::ReadAllBytes($scriptFile)
    Check ($bytes[0] -eq 239 -and $bytes[1] -eq 187 -and $bytes[2] -eq 191) 'utf8-bom'
    $source=Get-Content -LiteralPath $scriptFile -Raw -Encoding UTF8
    Check (-not ($source -match '(?<!\r)\n')) 'crlf'
    $commands=@($ast.FindAll({param($n) $n -is [Management.Automation.Language.CommandAst]},$true) | ForEach-Object {$_.GetCommandName()} | Where-Object {$_})
    Check (@($commands | Where-Object {$_ -match '^(adb|keytool|java|apksigner|Stop-Process|Start-Process|Invoke-WebRequest|Invoke-RestMethod|Remove-Item|Set-Content|Add-Content)$'}).Count -eq 0) 'no-device-signing-kill-network-or-target-write-command'
    $prelude=Join-Path $work 'prelude.ps1'
    PutText $prelude (($source -split '# READ_STATUS_MAIN_ENTRY',2)[0])
    . $prelude
    $orig=Join-Path $work 'original';$ProbeRoot=Join-Path $work 'probe';$env:LOCALAPPDATA=Join-Path $work 'local'
    $null=New-Item -Path $ProbeRoot -ItemType Directory
    $pins=@{schema='JH231_UNSIGNED_RELEASE_PINS_V1';package='com.koreanlifehub.bridge';fromVersion='230';toVersion='231';unsignedSha256=$ExpectedUnsigned;certificateSha256=$ExpectedCertificate;sourceLockSha256=$ExpectedLock}
    PutText (Join-Path $orig 'DELIVERY_PINS.json') ($pins | ConvertTo-Json)
    $id='11111111111111111111111111111111';$oldId='22222222222222222222222222222222'
    $script:FixtureProcesses=@(
        [pscustomobject]@{Name='powershell.exe';ProcessId=10001;ParentProcessId=9999;CreationDate=[datetime]'2026-11-24T00:00:00Z';CommandLine=('powershell -File "'+(Join-Path $orig 'internal\JH231-UPDATE.ps1')+'" -RunId '+$id+' --ks-pass pass:SECRET_SENTINEL')},
        [pscustomobject]@{Name='java.exe';ProcessId=10002;ParentProcessId=10001;CreationDate=[datetime]'2026-11-24T00:00:01Z';CommandLine='java --key C:\SECRET_KEY_PATH --password SECRET_SENTINEL'},
        [pscustomobject]@{Name='powershell.exe';ProcessId=10003;ParentProcessId=9999;CreationDate=[datetime]'2026-11-24T00:00:00Z';CommandLine='powershell -File C:\Unrelated\secret.ps1 --token SECRET_SENTINEL'})
    function ReadProcessSnapshot {return $script:FixtureProcesses}
    $r=ObserveJh231;$json=$r | ConvertTo-Json -Depth 8
    Check ($r.matchedOriginalRoots -eq 1 -and $r.observedRunIds -contains $id) 'exact-observed-root-and-run'
    Check (@($r.processes).Count -eq 2 -and @($r.processes | Where-Object {$_.processId -eq 10002 -and $_.treeDepth -eq 1}).Count -eq 1) 'bounded-parent-child-metadata'
    Check (-not $json.Contains('SECRET_') -and -not $json.Contains('CommandLine') -and -not $json.Contains($orig)) 'no-raw-commandline-secret-or-original-path-output'
    Check ($r.installationOutcome -eq 'NOT_INFERRED_FROM_PROCESS_OR_INTENT' -and $r.currentStage -like 'NOT_PERSISTED*') 'active-without-intent-keeps-outcome-unknown'
    $receipt='REPORT_KIND: JH231_SIGN_UPDATE_RESULT_V1'+"`r`nRUN_ID: "+$oldId+"`r`nSTATUS: PASS_UPDATE_INSTALLED_VERIFIED`r`nREASON: OLD_RESULT`r`nKEY_PATH: SECRET_KEY_PATH`r`n"
    $receiptFile=Join-Path $orig ('runs\'+$oldId+'\RESULT.txt');PutText $receiptFile $receipt
    $r=ObserveJh231
    Check (@($r.receipts).Count -eq 1 -and $r.receipts[0].association -eq 'UNATTRIBUTED_EXISTING_RECEIPT') 'old-success-is-not-current-success'
    $intent=[ordered]@{schema='JH231_DATA_PRESERVING_INSTALL_INTENT_V1';package='com.koreanlifehub.bridge';unsigned_apk_sha256=$ExpectedUnsigned;certificate_sha256=$ExpectedCertificate;from_version='230';to_version='231';action='SINGLE_ADB_INSTALL_R';automatic_replay=$false;run_id=$id;device_digest='SECRET_DEVICE_DIGEST'}
    $intentFile=Join-Path $env:LOCALAPPDATA 'JH\install-attempts\JH231-fixture.json';PutText $intentFile ($intent | ConvertTo-Json)
    $beforeReceipt=(Get-FileHash -LiteralPath $receiptFile).Hash;$beforeIntent=(Get-FileHash -LiteralPath $intentFile).Hash
    $r=ObserveJh231
    Check (@($r.installIntents).Count -eq 1 -and $r.installIntents[0].meaning -eq 'PRE_DISPATCH_RECORD_ONLY_INSTALL_OUTCOME_UNKNOWN') 'intent-does-not-prove-install'
    Check (-not (($r | ConvertTo-Json -Depth 8).Contains('SECRET_'))) 'receipt-and-intent-allowlist-redaction'
    Check ((Get-FileHash -LiteralPath $receiptFile).Hash -eq $beforeReceipt -and (Get-FileHash -LiteralPath $intentFile).Hash -eq $beforeIntent) 'original-files-unchanged'
    $bad=Join-Path $work 'oversized.txt';PutText $bad ('x'*5000)
    $blocked=$false;try{$null=SafeRead $bad 4096}catch{$blocked=$true}
    Check $blocked 'oversized-input-rejected'
    function ReadProcessSnapshot {throw 'SECRET_QUERY_ERROR'}
    $r=ObserveJh231
    Check ($r.processQuery -eq 'UNAVAILABLE_CURRENT_STAGE_UNKNOWN' -and -not (($r | ConvertTo-Json -Depth 8).Contains('SECRET_QUERY_ERROR'))) 'cim-failure-is-unknown-and-redacted'
    $saved=SaveProbe $r
    $first=Join-Path $ProbeRoot ('JH231_STATUS_'+$ProbeId+'.txt');$firstHash=(Get-FileHash -LiteralPath $first).Hash
    $null=SaveProbe $r
    Check ($saved -and (Get-FileHash -LiteralPath $first).Hash -eq $firstHash) 'fresh-report-no-overwrite'
    $cmdKit=Join-Path $work "cmd 한글 & space's";$null=New-Item -Path $cmdKit -ItemType Directory
    Copy-Item -LiteralPath (Join-Path $KitRoot '실행.cmd') -Destination $cmdKit
    $null=New-Item -Path (Join-Path $cmdKit 'internal') -ItemType Directory
    Copy-Item -LiteralPath $scriptFile -Destination (Join-Path $cmdKit 'internal\JH231-READ-STATUS.ps1')
    $psi=[Diagnostics.ProcessStartInfo]::new();$psi.FileName=Join-Path $env:SystemRoot 'System32\cmd.exe'
    $psi.Arguments='/d /c ""'+(Join-Path $cmdKit '실행.cmd')+'""';$psi.UseShellExecute=$false;$psi.CreateNoWindow=$true
    $psi.RedirectStandardInput=$true;$psi.RedirectStandardOutput=$true;$psi.RedirectStandardError=$true
    $psi.EnvironmentVariables['LOCALAPPDATA']=Join-Path $work 'empty-local'
    $pr=[Diagnostics.Process]::new();$pr.StartInfo=$psi
    try {
        $null=$pr.Start();$pr.StandardInput.WriteLine('');$pr.StandardInput.Close()
        if(-not $pr.WaitForExit(30000)){try{$pr.Kill()}catch{};throw 'HARMLESS_DIAGNOSTIC_CMD_TEST_TIMEOUT'}
        $out=$pr.StandardOutput.ReadToEnd();$err=$pr.StandardError.ReadToEnd();$code=$pr.ExitCode
        Check ($code -eq 0 -and $out.Contains('JH231 read-only status check.') -and $out.Contains('RESULT_PATH:')) 'actual-cmd-entry-and-report'
        Check (@(Get-ChildItem -LiteralPath $cmdKit -Filter 'JH231_STATUS_*.txt' -File).Count -eq 1) 'actual-cmd-one-new-report'
    }finally{$pr.Dispose()}
    Write-Host ('JH231_READ_ONLY_TESTS: passed='+$passed+' failed=0')
}finally{
    if(Test-Path -LiteralPath $work){Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue}
}
