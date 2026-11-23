param([Parameter(Mandatory=$true)][string]$KitRoot)
$ErrorActionPreference='Stop'
if($PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1){throw 'Tests require Windows PowerShell 5.1'}
$KitRoot=(Resolve-Path -LiteralPath $KitRoot).Path
$caseRunner=Join-Path $PSScriptRoot 'Invoke-JH231Fixture.ps1'
$cmdRunner=Join-Path $PSScriptRoot 'Invoke-JH231CmdFixture.ps1'
$ps=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
foreach($path in @((Join-Path $KitRoot 'internal\BOOTSTRAP.ps1'),(Join-Path $KitRoot 'internal\JH231-UPDATE.ps1'),$caseRunner,$cmdRunner,$PSCommandPath)){
    $tokens=$null;$errors=$null
    $null=[Management.Automation.Language.Parser]::ParseFile($path,[ref]$tokens,[ref]$errors)
    if($errors.Count -ne 0){$errors | Format-List | Out-Host;throw ('Parser failed: '+$path)}
}
$cases=@('single-update','nonzero-install-exact-readback','already-installed-exact','wrong-unsigned-hash','wrong-source-lock','invalid-pins-schema',
    'missing-original-key','wrong-original-cert','wrong-repeat-cert','wrong-signed-cert','signed-payload-changed',
    'no-device','multiple-devices','unauthorized-device','wrong-installed-version','wrong-installed-cert','debuggable-apk',
    'post-install-wrong-hash','uncertain-no-replay','resign-no-replay','reuse-signed-apk','preserve-existing-signed-apk',
    'preserve-current-sign-temp','preserve-readback-folder','preserve-existing-result','result-fallback','all-result-writes-fail',
    'boot-pass','boot-stale-run-id','boot-wrong-kind','boot-no-receipt','boot-child-blocked','boot-parse-failure',
    'boot-automatic-variable','boot-protected-home','boot-bad-bom','boot-hash-mismatch','boot-report-fallback','boot-all-reports-fail',
    'cmd-success','cmd-bootstrap-missing','cmd-bootstrap-nonzero','cmd-bootstrap-parse-error','cmd-fallback-local')
$passed=0;$failed=New-Object 'System.Collections.Generic.List[string]'
foreach($case in $cases){
    $selectedRunner=if($case -like 'cmd-*'){$cmdRunner}else{$caseRunner}
    $out=@(& $ps -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $selectedRunner -KitRoot $KitRoot -CaseName $case 2>&1 | ForEach-Object {$_.ToString()})
    $code=$LASTEXITCODE
    if($code -eq 0 -and ($out -contains ('FIXTURE_PASS: '+$case))){$passed++;Write-Host ('PASS '+$case)}
    else{$failed.Add($case);$out | ForEach-Object {Write-Host $_};Write-Host ('FAIL '+$case)}
}
Write-Host ('JH231_WINDOWS_51_FIXTURE_TESTS: passed='+$passed+' total='+$cases.Count+' failed='+$failed.Count)
if($failed.Count -gt 0){throw ('Failed fixtures: '+($failed -join ', '))}
