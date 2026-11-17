param([Parameter(Mandatory=$true)][string]$KitRoot)
$ErrorActionPreference='Stop'
. (Join-Path $KitRoot 'JH217-LIB.ps1')
Add-Type -AssemblyName System.IO.Compression.FileSystem
$script:assertions=0
function Assert-True([bool]$Value,[string]$Message){if(!$Value){throw $Message};$script:assertions++}
function Assert-Throws([scriptblock]$Action,[string]$Expected){
    $caught=$null;try{& $Action}catch{$caught=$_.Exception.Message}
    Assert-True ($null -ne $caught -and $caught.Contains($Expected)) ('Missing rejection: '+$Expected)
}
function New-JhSyntheticZip([string]$Path,[object[]]$Entries){
    $archive=[IO.Compression.ZipFile]::Open($Path,[IO.Compression.ZipArchiveMode]::Create)
    try{
        foreach($item in $Entries){
            $entry=$archive.CreateEntry($item.Name)
            $stream=$entry.Open();$bytes=[Text.Encoding]::UTF8.GetBytes($item.Body)
            try{$stream.Write($bytes,0,$bytes.Length)}finally{$stream.Dispose()}
        }
    }finally{$archive.Dispose()}
    return $Path
}
$temp=Join-Path ([IO.Path]::GetTempPath()) ('jh217-apk-case-'+[guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($temp)
try{
    $entries=@(@{Name='classes.dex';Body='synthetic-dex'},@{Name='res/Case.xml';Body='upper-content'},@{Name='res/case.xml';Body='lower-content'})
    $left=New-JhSyntheticZip (Join-Path $temp 'left.zip') $entries
    $right=New-JhSyntheticZip (Join-Path $temp 'right.zip') @($entries[2],$entries[1],$entries[0])
    # The previous hashtable really reproduces the customer's false duplicate diagnosis.
    $legacy=@{};$legacyDuplicate=$false
    foreach($item in $entries){if($legacy.ContainsKey($item.Name)){$legacyDuplicate=$true};$legacy[$item.Name]=$item.Body}
    Assert-True $legacyDuplicate 'Regression fixture failed to reproduce old case-insensitive collision'
    $output=@(Assert-JhPayloadEqual $left $right)
    Assert-True ($output.Count -eq 0) 'Comparison leaked Dictionary.Remove Boolean outputs'
    $withSignature=New-JhSyntheticZip (Join-Path $temp 'signature.zip') ($entries+@(@{Name='META-INF/MANIFEST.MF';Body='manifest'},@{Name='META-INF/ORIGINAL.SF';Body='sf'},@{Name='META-INF/ORIGINAL.RSA';Body='signature'}))
    Assert-JhPayloadEqual $left $withSignature;$script:assertions++
    $modified=New-JhSyntheticZip (Join-Path $temp 'modified.zip') @($entries[0],$entries[1],@{Name='res/case.xml';Body='changed'})
    Assert-Throws {Assert-JhPayloadEqual $left $modified} 'SIGNED_PAYLOAD_DIFFERS'
    $renamed=New-JhSyntheticZip (Join-Path $temp 'renamed.zip') @($entries[0],$entries[1],@{Name='res/CASE.xml';Body='lower-content'})
    Assert-Throws {Assert-JhPayloadEqual $left $renamed} 'SIGNED_PAYLOAD_DIFFERS'
    $missing=New-JhSyntheticZip (Join-Path $temp 'missing.zip') @($entries[0],$entries[1])
    Assert-Throws {Assert-JhPayloadEqual $left $missing} 'SIGNED_PAYLOAD_DIFFERS'
    $extra=New-JhSyntheticZip (Join-Path $temp 'extra.zip') ($entries+@(@{Name='res/extra.xml';Body='extra'}))
    Assert-Throws {Assert-JhPayloadEqual $left $extra} 'SIGNED_PAYLOAD_DIFFERS'
    $duplicate=New-JhSyntheticZip (Join-Path $temp 'duplicate.zip') ($entries+@($entries[1]))
    Assert-Throws {Assert-JhPayloadEqual $duplicate $right} 'DUPLICATE_APK_ENTRY'
    Assert-Throws {Assert-JhPayloadEqual $left $duplicate} 'DUPLICATE_APK_ENTRY'
    $duplicateSignature=New-JhSyntheticZip (Join-Path $temp 'duplicate-signature.zip') ($entries+@(@{Name='META-INF/ORIGINAL.SF';Body='one'},@{Name='META-INF/ORIGINAL.SF';Body='two'}))
    Assert-Throws {Assert-JhPayloadEqual $left $duplicateSignature} 'DUPLICATE_APK_ENTRY'
    $lowerMetadata=New-JhSyntheticZip (Join-Path $temp 'lower-meta.zip') ($entries+@(@{Name='meta-inf/original.sf';Body='not-standard-signature-entry'}))
    Assert-Throws {Assert-JhPayloadEqual $left $lowerMetadata} 'SIGNED_PAYLOAD_DIFFERS'
    # Match actual APK inventory scale and its 13 case-only collision pairs using synthetic bytes/names.
    $bulk=New-Object 'System.Collections.Generic.List[object]'
    for($i=0;$i -lt 13;$i++){
        $bulk.Add(@{Name=('res/Pair{0:D2}.xml' -f $i);Body=('UPPER-'+$i)})
        $bulk.Add(@{Name=('res/pair{0:D2}.xml' -f $i);Body=('lower-'+$i)})
    }
    for($i=26;$i -lt 567;$i++){$bulk.Add(@{Name=('assets/synthetic-{0:D3}.bin' -f $i);Body=('payload-'+$i)})}
    $bulkLeft=New-JhSyntheticZip (Join-Path $temp 'bulk-left.zip') $bulk.ToArray()
    $bulkRight=New-JhSyntheticZip (Join-Path $temp 'bulk-right.zip') $bulk.ToArray()
    Assert-JhPayloadEqual $bulkLeft $bulkRight;$script:assertions++
    $bulk[25]=@{Name='res/pair12.xml';Body='incorrect-case-variant-bytes'}
    $bulkChanged=New-JhSyntheticZip (Join-Path $temp 'bulk-changed.zip') $bulk.ToArray()
    Assert-Throws {Assert-JhPayloadEqual $bulkLeft $bulkChanged} 'SIGNED_PAYLOAD_DIFFERS'
    Write-Output ('JH217_APK_CASE_ASSERTIONS_PASS='+$script:assertions)
    Write-Output 'SYNTHETIC_INVENTORY=567_ENTRIES_13_CASE_ONLY_PAIRS'
    Write-Output 'REAL_PRIVATE_APK_KEYS_ADB_INSTALL_USED=0'
}finally{Remove-Item -LiteralPath $temp -Recurse -Force}
