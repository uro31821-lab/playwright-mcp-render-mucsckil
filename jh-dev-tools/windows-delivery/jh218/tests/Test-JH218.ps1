param([Parameter(Mandatory=$true)][string]$KitRoot)
$ErrorActionPreference='Stop'
$KitRoot=[IO.Path]::GetFullPath($KitRoot)
$tests=0
function Assert-True([bool]$Value,[string]$Message){if(!$Value){throw $Message};$script:tests++}
function Assert-Throws([scriptblock]$Action,[string]$Expected){
    $caught=$null;try{& $Action}catch{$caught=$_.Exception.Message}
    Assert-True ($null -ne $caught -and $caught.Contains($Expected)) ('Expected rejection: '+$Expected)
}
foreach($file in @(Get-ChildItem -LiteralPath $KitRoot -Filter '*.ps1' -File)){
    $tokens=$null;$errors=$null
    $ast=[Management.Automation.Language.Parser]::ParseFile($file.FullName,[ref]$tokens,[ref]$errors)
    Assert-True ($errors.Count -eq 0) ('Parse failure: '+$file.Name)
    foreach($f in @($ast.FindAll({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst]},$true))){
        Assert-True (!(Get-Alias -Name $f.Name -ErrorAction SilentlyContinue)) ('Alias collision: '+$f.Name)
    }
}
. (Join-Path $KitRoot 'JH218-LIB.ps1')
$temp=Join-Path ([IO.Path]::GetTempPath()) ('JH218-tests-'+[guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($temp)
try {
    $file=Join-Path $temp 'candidate.apk';[IO.File]::WriteAllText($file,'synthetic unsigned candidate')
    $digest=Get-JhSha $file
    Assert-JhFileHash $file $digest
    Assert-Throws {Assert-JhFileHash $file ('0'*64)} 'PAYLOAD_HASH_MISMATCH'
    $marker=Join-Path $temp 'attempt.json'
    New-JhAttemptMarker $marker 'run-a' $digest
    $original=[IO.File]::ReadAllText($marker)
    Assert-Throws {New-JhAttemptMarker $marker 'run-b' $digest} ''
    Assert-True ([IO.File]::ReadAllText($marker) -ceq $original) 'Marker was overwritten'
    # Real ZIP byte comparisons, not a self-reported flag.
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $left=Join-Path $temp 'left';$right=Join-Path $temp 'right'
    [void][IO.Directory]::CreateDirectory($left);[void][IO.Directory]::CreateDirectory($right)
    [IO.File]::WriteAllText((Join-Path $left 'classes.dex'),'same');[IO.File]::WriteAllText((Join-Path $right 'classes.dex'),'same')
    $zip1=Join-Path $temp 'a.zip';$zip2=Join-Path $temp 'b.zip'
    [IO.Compression.ZipFile]::CreateFromDirectory($left,$zip1);[IO.Compression.ZipFile]::CreateFromDirectory($right,$zip2)
    Assert-JhPayloadEqual $zip1 $zip2;$script:tests++
    [IO.File]::WriteAllText((Join-Path $right 'classes.dex'),'different')
    $zip3=Join-Path $temp 'c.zip';[IO.Compression.ZipFile]::CreateFromDirectory($right,$zip3)
    Assert-Throws {Assert-JhPayloadEqual $zip1 $zip3} 'SIGNED_PAYLOAD_DIFFERS'
    # Mock only OS/tool boundaries in this test process; production has no bypass switch.
    function Get-JhInstalled([string]$Adb,[string]$Serial,[string]$Destination){
        if($script:observations.Count -eq 0){throw 'MOCK_READBACK_UNAVAILABLE'}
        return $script:observations.Dequeue()
    }
    function Read-Host([string]$Prompt){$script:prompts++;return $script:answer}
    function Invoke-JhTool([string]$Tool,[string[]]$ToolArgs){
        if($ToolArgs -contains 'install'){
            Assert-True (Test-Path -LiteralPath $script:caseMarker) 'Install before durable marker'
            Assert-True (($ToolArgs -join ' ') -ceq ('-s synthetic install -r '+$script:caseApk)) 'Unexpected device command'
            $script:installs++
        }else{throw 'Unexpected external command'}
        return [pscustomobject]@{Code=$script:returnCode;Text='synthetic process response'}
    }
    $cases=@(
        @{Name='already';Reads=@($digest);Answer='YES';Expected='ALREADY_JH218_EXACT_SHA_NO_ACTION';Installs=0;Prompts=0},
        @{Name='other-version';Reads=@('other');Answer='YES';Error='INSTALLED_APP_DIFFERS';Installs=0;Prompts=0},
        @{Name='declined';Reads=@('baseline');Answer='no';Expected='SIGNED_READY_USER_DID_NOT_INSTALL';Installs=0;Prompts=1},
        @{Name='changed-after-consent';Reads=@('baseline','other');Answer='YES';Error='INSTALLED_APP_CHANGED';Installs=0;Prompts=1},
        @{Name='one-success';Reads=@('baseline','baseline',$digest);Answer='YES';Expected='PASS_JH218_INSTALLED_EXACT_SHA';Installs=1;Prompts=1},
        @{Name='ambiguous-exit-exact-readback';Reads=@('baseline','baseline',$digest);Answer='YES';Expected='PASS_JH218_INSTALLED_EXACT_SHA';Installs=1;Prompts=1;Code=1},
        @{Name='readback-mismatch';Reads=@('baseline','baseline','other');Answer='YES';Error='INSTALL_OUTCOME_UNCONFIRMED';Installs=1;Prompts=1},
        @{Name='readback-lost';Reads=@('baseline','baseline');Answer='YES';Error='MOCK_READBACK_UNAVAILABLE';Installs=1;Prompts=1},
        @{Name='old-marker';Reads=@('baseline');Answer='YES';Error='PREVIOUS_INSTALL_ATTEMPT';Installs=0;Prompts=0;OldMarker=$true}
    )
    foreach($case in $cases){
        $work=Join-Path $temp $case.Name;[void][IO.Directory]::CreateDirectory($work)
        $script:caseMarker=Join-Path $work 'marker.json';$script:caseApk=$file
        if($case.ContainsKey('OldMarker')){[IO.File]::WriteAllText($script:caseMarker,'old')}
        $script:observations=New-Object 'System.Collections.Generic.Queue[string]'
        foreach($v in $case.Reads){$script:observations.Enqueue($v)}
        $script:answer=$case.Answer;$script:installs=0;$script:prompts=0;$script:returnCode=0
        if($case.ContainsKey('Code')){$script:returnCode=$case.Code}
        $action={Invoke-JhUpdateOnce 'unused' 'synthetic' $file $digest 'baseline' $work $script:caseMarker 'synthetic-run'}
        if($case.ContainsKey('Error')){Assert-Throws $action $case.Error}
        else{Assert-True ((& $action) -ceq $case.Expected) ('Wrong result: '+$case.Name)}
        Assert-True ($script:installs -eq $case.Installs) ('Install count: '+$case.Name)
        Assert-True ($script:prompts -eq $case.Prompts) ('Consent count: '+$case.Name)
        Assert-True ($script:JhInstallAttempts -eq $case.Installs) ('Recorded count: '+$case.Name)
    }
    # Actual CMD path handling and early failure: no production payload or tools supplied.
    $bootstrap=Join-Path $temp 'bootstrap space % !';[void][IO.Directory]::CreateDirectory($bootstrap)
    Copy-Item -LiteralPath (Join-Path $KitRoot '실행.cmd') -Destination (Join-Path $bootstrap 'run.cmd')
    $start=[Diagnostics.ProcessStartInfo]::new($env:ComSpec,'/d /c run.cmd')
    $start.WorkingDirectory=$bootstrap;$start.UseShellExecute=$false;$start.CreateNoWindow=$true
    $start.RedirectStandardInput=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
    $process=[Diagnostics.Process]::Start($start);$process.StandardInput.WriteLine('');$process.StandardInput.Close()
    $stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync()
    if(!$process.WaitForExit(15000)){$process.Kill();throw 'CMD did not terminate'}
    $output=$stdout.Result+$stderr.Result
    Assert-True ($output -match 'BLOCKED: REQUIRED_FILE_MISSING') 'CMD did not fail before dispatch'
    $reports=@(Get-ChildItem -LiteralPath $bootstrap -Recurse -Filter 'RESULT.txt' -File)
    Assert-True ($reports.Count -eq 1) 'CMD failure report missing'
    Assert-True ((Get-Content -LiteralPath $reports[0].FullName -Raw) -match 'POWERSHELL_DISPATCHED: FALSE') 'CMD reported wrong dispatch'
    Write-Output ('JH218_WINDOWS_ASSERTIONS_PASS='+$tests)
    Write-Output 'REAL_KEY_ADB_INSTALL_CALLS=0'
} finally {Remove-Item -LiteralPath $temp -Recurse -Force}

