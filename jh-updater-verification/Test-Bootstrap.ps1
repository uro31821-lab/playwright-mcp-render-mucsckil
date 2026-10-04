#requires -Version 5.1
param([string]$OutputDirectory)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$base=Join-Path ([IO.Path]::GetTempPath()) ('JH bootstrap & '+[char]0xD55C+' '+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $base | Out-Null
$records=New-Object System.Collections.Generic.List[object]
function RunCase([string]$Name,[int]$ChildExit,[int]$ExpectedExit,[bool]$Corrupt=$false,[int]$ExtraBytes=0,[bool]$Lock=$false) {
 $dir=Join-Path $base $Name;New-Item -ItemType Directory -Path $dir | Out-Null
 $zipPath=Join-Path $dir 'fixture.zip'
 $z=[IO.Compression.ZipFile]::Open($zipPath,[IO.Compression.ZipArchiveMode]::Create)
 try {
  $sources=@{'Run-OnePass.ps1'=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'Run-OnePass.ps1'));'JH.Update.Core.ps1'=('function Invoke-JhUpdate { param([string]$Bundle,[string]$Results); Set-Content -LiteralPath (Join-Path $Results ''fixture-ran.txt'') -Value ''mock only''; return '+$ChildExit+' }')}
  foreach($n in $sources.Keys){$en=$z.CreateEntry($n);$s=$en.Open();$b=[Text.Encoding]::UTF8.GetBytes($sources[$n]);$s.Write($b,0,$b.Length);$s.Dispose()}
  if($ExtraBytes -gt 0){$en=$z.CreateEntry('synthetic-large.bin',[IO.Compression.CompressionLevel]::NoCompression);$s=$en.Open();$buffer=New-Object byte[] 1048576;for($n=0;$n -lt $ExtraBytes;$n+=$buffer.Length){$s.Write($buffer,0,[Math]::Min($buffer.Length,$ExtraBytes-$n))};$s.Dispose()}
 } finally {$z.Dispose()}
 $bytes=[IO.File]::ReadAllBytes($zipPath);$hash=(Get-FileHash $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
 $template=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'Bootstrap.template.cmd'))
 if($Corrupt){$hash='0'*64}
 $text=$template.Replace('__PAYLOAD_SHA256__',$hash).Replace('__PAYLOAD_BASE64__',[Convert]::ToBase64String($bytes))
 $path=Join-Path $dir 'JH test & (one).cmd';[IO.File]::WriteAllText($path,$text.Replace("`r`n","`n").Replace("`n","`r`n"),[Text.Encoding]::ASCII)
 $mutex=$null
 if($Lock){$mutex=New-Object System.Threading.Mutex -ArgumentList $false,'Local\JHMCP-ONEPASS-INSTALL';[void]$mutex.WaitOne(0)}
 try {
  $psi=New-Object Diagnostics.ProcessStartInfo;$psi.FileName=$env:ComSpec;$psi.Arguments=('/d /c ""'+$path+'""');$psi.UseShellExecute=$false;$psi.CreateNoWindow=$true;$psi.RedirectStandardOutput=$true;$psi.RedirectStandardError=$true;$psi.RedirectStandardInput=$true
  $p=New-Object Diagnostics.Process;$p.StartInfo=$psi;[void]$p.Start();$p.StandardInput.Close();$o=$p.StandardOutput.ReadToEndAsync();$e=$p.StandardError.ReadToEndAsync()
  if(!$p.WaitForExit(90000)){try{$p.Kill()}catch{};throw 'BOOTSTRAP_TIMEOUT'}
  $p.WaitForExit();$out=$o.GetAwaiter().GetResult()+$e.GetAwaiter().GetResult();$rc=$p.ExitCode;$p.Dispose()
  $out | Set-Content -LiteralPath (Join-Path $OutputDirectory ('bootstrap-'+$Name+'.log')) -Encoding UTF8
  $ran=@(Get-ChildItem -LiteralPath $dir -Filter 'fixture-ran.txt' -Recurse).Count
  if($rc -ne $ExpectedExit){throw ('Exit mismatch '+$Name+': '+$rc+' expected '+$ExpectedExit+' '+$out)}
  if(($Corrupt -or $Lock) -and $ran -ne 0){throw 'BLOCKED_BUNDLE_RAN'}
  if(!$Corrupt -and !$Lock -and $ran -ne 1){throw 'BUNDLE_NOT_EXECUTED_ONCE'}
  $records.Add([pscustomobject]@{name=$Name;passed=$true;exitCode=$rc;fixtureExecutions=$ran;syntheticExtraBytes=$ExtraBytes})
 } finally {if($mutex){$mutex.ReleaseMutex();$mutex.Dispose()}}
}
RunCase 'normal' 0 0
RunCase 'nonzero' 9 9
RunCase 'corrupt' 0 1 $true
RunCase 'concurrent' 0 1 $false 0 $true
RunCase 'large-48MiB' 0 0 $false (48*1024*1024)
[ordered]@{scope='Actual cmd.exe and Windows PowerShell 5.1 bootstrap plus real entrypoint, synthetic updater core only. No device or signing key.';tests=$records.Count;failures=0;cases=$records} | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'bootstrap-results.json') -Encoding UTF8
Write-Host ('BOOTSTRAP_PASSED='+$records.Count)
