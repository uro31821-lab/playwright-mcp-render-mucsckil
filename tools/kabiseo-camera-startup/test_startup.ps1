param([Parameter(Mandatory=$true)][string]$PackageRoot,[Parameter(Mandatory=$true)][string]$EvidencePath)
$ErrorActionPreference='Stop'
$checks=[Collections.Generic.List[string]]::new()
function Check([bool]$ok,[string]$name){if(-not $ok){throw ('CHECK_FAILED '+$name)};$checks.Add($name);Write-Host ('PASS '+$name)}
$top=Join-Path $env:RUNNER_TEMP ('카비서 시작 점검 '+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory $top | Out-Null
$initialPolicy=@(& "$env:SystemRoot/System32/WindowsPowerShell/v1.0/powershell.exe" -NoProfile -Command 'Get-ExecutionPolicy -List | ConvertTo-Json -Compress') -join ''
function Run-Case([string]$name,[string]$policy='',[scriptblock]$prepare={}){
    $root=Join-Path $top $name;New-Item -ItemType Directory $root | Out-Null
    Copy-Item "$PackageRoot/*" $root -Recurse
    & $prepare $root
    $p=[Diagnostics.ProcessStartInfo]::new();$p.FileName=Join-Path $env:SystemRoot 'System32\cmd.exe';$p.Arguments='/d /c call 실행.cmd';$p.WorkingDirectory=$root
    $p.UseShellExecute=$false;$p.RedirectStandardInput=$true;$p.RedirectStandardOutput=$true;$p.RedirectStandardError=$true
    # Tightening only this disposable child environment; never Set-ExecutionPolicy.
    if($policy){$p.Environment['PSExecutionPolicyPreference']=$policy}
    $child=[Diagnostics.Process]::Start($p);$o=$child.StandardOutput.ReadToEndAsync();$e=$child.StandardError.ReadToEndAsync();$child.StandardInput.Close()
    if(-not $child.WaitForExit(45000)){$child.Kill();throw 'TEST_TIMEOUT'}
    $output=$o.GetAwaiter().GetResult();$errorText=$e.GetAwaiter().GetResult();$exit=$child.ExitCode;$child.Dispose()
    $file=Join-Path $root 'RESULT.txt'
    if(-not (Test-Path $file)){throw ('MISSING_RESULT '+$name+' '+$exit+' '+$errorText+' '+$output)}
    $text=[IO.File]::ReadAllText($file)
    try{$data=$text|ConvertFrom-Json}catch{throw ('INVALID_RESULT '+$name+' '+$text+' '+$errorText+' '+$output)}
    Check (-not $data.phoneAccessAttempted -and $data.cameraObservation -eq 'NOT_RUN' -and -not $data.securitySettingsChanged) ($name+' no phone/security mutation')
    Check (-not $text.Contains($root) -and -not $text.Contains($env:USERNAME)) ($name+' result has no user path')
    Write-Host ('CASE_RESULT='+(@{case=$name;exit=$exit;report=$data}|ConvertTo-Json -Depth 6 -Compress))
    return [pscustomobject]@{Data=$data;Exit=$exit;Root=$root}
}
try{
    $source=[IO.File]::ReadAllText((Join-Path $PackageRoot '실행.cmd'))
    Check (-not ($source -match '(?i)Set-ExecutionPolicy|Unblock-File|ExecutionPolicy\s+(?:Bypass|Unrestricted)|EncodedCommand|Invoke-Expression|DownloadString')) 'no policy downgrade or script-text evaluation'
    Check (($source -split '\r?\n'|Measure-Object -Property Length -Maximum).Maximum -lt 7900) 'CMD line below parser limit'
    Check ($source.Contains(' -LibraryOnly') -and -not $source.Contains('Invoke-ReadOnlyAdb')) 'normal File loading only and no probe calls'
    $normal=Run-Case '기본 정상 공백' '' {param($r) Set-Content -LiteralPath (Join-Path $r 'RESULT.txt') -Value 'PREVIOUS_RESULT_SENTINEL' -Encoding UTF8}
    Check ($normal.Exit -eq 0 -and $normal.Data.status -eq 'STARTUP_ONLY_PASS') 'original library-only load passes on runner policy'
    Check (@(Get-ChildItem (Join-Path $normal.Root 'logs') -Filter previous-*.txt).Count -eq 1) 'prior result preserved not misreported as current'
    $missing=Run-Case '파일 누락' '' {param($r) Remove-Item -LiteralPath (Join-Path $r 'data/probe.ps1')}
    Check ($missing.Data.reason -eq 'PACKAGE_DATA_FILE_MISSING' -and -not $missing.Data.scriptLoadAttempted) 'missing payload classified before load'
    $parser=Run-Case '구문 오류' '' {param($r) Set-Content -LiteralPath (Join-Path $r 'data/probe.ps1') -Value 'function Broken {' -Encoding UTF8}
    Check ($parser.Data.reason -eq 'SCRIPT_PARSE_ERROR' -and $parser.Data.parserErrorIds.Count -gt 0 -and -not $parser.Data.scriptLoadAttempted) 'parse error classified before execution'
    $restricted=Run-Case '제한 정책' 'Restricted'
    # Windows emits UnauthorizedAccess without always printing PSSecurityException.
    # Require the actual failure receipt, nonzero child exit, unchanged policy and
    # BLOCKED status. Do not turn a policy rejection into a successful file load.
    Check ($restricted.Exit -eq 2 -and $restricted.Data.status -eq 'BLOCKED' -and $restricted.Data.childExitCode -eq 1 -and $restricted.Data.errorIdentifiers -contains 'UnauthorizedAccess' -and $restricted.Data.effectivePolicy -eq 'Restricted') 'restricted child rejects File with UnauthorizedAccess; no bypass'
    $download=Run-Case '인터넷 표시' 'RemoteSigned' {param($r) Set-Content -LiteralPath (Join-Path $r 'data/probe.ps1') -Stream Zone.Identifier -Value "[ZoneTransfer]`r`nZoneId=3`r`nHostUrl=https://fixture.invalid/PRIVATE_URL_MUST_NOT_EXPORT" -Encoding ASCII}
    Check ($download.Exit -eq 2 -and $download.Data.status -eq 'BLOCKED' -and $download.Data.childExitCode -eq 1 -and $download.Data.errorIdentifiers -contains 'UnauthorizedAccess' -and $download.Data.effectivePolicy -eq 'RemoteSigned' -and $download.Data.internetZoneDetected) 'downloaded unsigned File rejected; origin marking retained'
    Check (-not ([IO.File]::ReadAllText((Join-Path $download.Root 'RESULT.txt')).Contains('PRIVATE_URL_MUST_NOT_EXPORT'))) 'origin URL is not exported'
    $finalPolicy=@(& "$env:SystemRoot/System32/WindowsPowerShell/v1.0/powershell.exe" -NoProfile -Command 'Get-ExecutionPolicy -List | ConvertTo-Json -Compress') -join ''
    Check ($initialPolicy -ceq $finalPolicy) 'runner policies unchanged before and after tests'
    $result=[ordered]@{schema='KABISEO_STARTUP_DIAGNOSTIC_TEST_FIX1';status='PASS_DIAGNOSTIC_ONLY';checks=$checks;checksCount=$checks.Count;environmentCases=5;gitSha=$env:GITHUB_SHA;runId=$env:GITHUB_RUN_ID;physicalDeviceReads=0;cameraCommands=0;originalProbeChanged=$false;securityPolicyWeakened=$false;userRootCauseConfirmed=$false;originalPhoneFailureFixed=$false;scope='Windows CMD and Windows PowerShell 5.1 actual script-load tests; no device'}
    $result|ConvertTo-Json -Depth 6|Set-Content -LiteralPath $EvidencePath -Encoding UTF8
    Write-Host ('KABISEO_STARTUP_TEST='+($result|ConvertTo-Json -Depth 6 -Compress))
}finally{Remove-Item -LiteralPath $top -Recurse -Force}
