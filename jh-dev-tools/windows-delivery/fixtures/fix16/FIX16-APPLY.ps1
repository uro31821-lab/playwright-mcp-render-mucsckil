# JH168 FIX16: horizontal-only Chrome direct accessibility source integration
# Exact original FIX15 SHA256. Two adapters patched, new horizontal modules; no device changes.
$ErrorActionPreference='Stop'
$Kit=Split-Path -Parent $MyInvocation.MyCommand.Path
$Report=Join-Path $Kit 'RESULT.txt'
$Log=Join-Path $Kit 'FIX16-BUILD.log'
$Workspace=Join-Path $env:LOCALAPPDATA 'JH16F16'
$OutputProject=Join-Path $Workspace 'FIX16-PATCHED-SOURCE'
$OutputZip=Join-Path $Kit 'JH168-FIX16-PATCHED-SOURCE.zip'
$Temp=Join-Path ([System.IO.Path]::GetTempPath()) ('JH168_FIX16_' + [guid]::NewGuid().ToString('N'))
$Utf8=New-Object System.Text.UTF8Encoding($false)
$Lines=New-Object 'System.Collections.Generic.List[string]'
$Lines.Add('JH168 FIX16 - HORIZONTAL LEFT/RIGHT NATIVE ACCESSIBILITY INTEGRATION, SOURCE-ONLY')
$Lines.Add('No original source modification, no phone install, no signing, no GitHub push, no Computer Use, no auto action replay.')
$Lines.Add('DATE: '+(Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
$Status='STOPPED_NO_PHONE_CHANGE'
$ExpectedSourceZipSha='0a9f81af9d986fdf99f14334bfad9a6b5f24c780b046f6fd414872ee7f26920a'
$ExpectedRuntimeSha='0a69dc716e34e59672e9ba6a72c0ddd35ce487533c135c92733d700d6d441854'
$ExpectedPolicySha='546753d4461ac5bf4387c60cb15bad34df2cca3488868739c4eb32610fd64b9b'
function Add([string]$s){$script:Lines.Add($s)}
function Stage([string]$message){
    # Immediate, readable progress without editing user projects or phone.
    $entry='['+(Get-Date -Format 'HH:mm:ss')+'] '+$message
    Write-Host $entry -ForegroundColor Cyan
    [IO.File]::WriteAllText((Join-Path $Kit 'RUN-STATUS.txt'),$entry,[Text.UTF8Encoding]::new($false))
}
function Sha([string]$p){return (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
function Replace-Once([string]$s,[string]$before,[string]$after,[string]$name){
    $n=[regex]::Matches($s,[regex]::Escape($before)).Count
    if($n -ne 1){throw ('SOURCE_ANCHOR_MISMATCH_'+$name+'_COUNT_'+$n)}
    return $s.Replace($before,$after)
}
function Roots {
    $a=@((Join-Path $env:USERPROFILE 'Downloads'),(Join-Path $env:USERPROFILE 'Desktop'),
        (Join-Path $env:USERPROFILE 'OneDrive\Desktop'),$Kit)
    return @($a | Select-Object -Unique | Where-Object {Test-Path -LiteralPath $_})
}
function Locate-Fix15 {
    # Targeted lookup ONLY. Do not recursively scan all of Downloads/OneDrive.
    $target='JH168-FIX15-PATCHED-SOURCE.zip'
    $found=New-Object 'System.Collections.Generic.List[string]'
    foreach($root in @(Roots)) {
        $atRoot=Join-Path $root $target
        if(Test-Path -LiteralPath $atRoot){$found.Add($atRoot)}
        foreach($folder in @(Get-ChildItem -LiteralPath $root -Directory -Filter '*FIX15*' -ErrorAction SilentlyContinue)) {
            $one=Join-Path $folder.FullName $target
            if(Test-Path -LiteralPath $one){$found.Add($one)}
            # Support 'Downloads\JH168_FIX15...\output\file.zip' without traversing everything.
            foreach($child in @(Get-ChildItem -LiteralPath $folder.FullName -Directory -ErrorAction SilentlyContinue |
                Select-Object -First 20)) {
                $two=Join-Path $child.FullName $target
                if(Test-Path -LiteralPath $two){$found.Add($two)}
            }
        }
    }
    return @($found.ToArray() | Sort-Object -Unique)
}
function Find-Gradle {
    $exact=Join-Path $env:USERPROFILE 'Downloads\JH168-InputFocus-FIX2-AutoGradle-20261031\tools\gradle\gradle-8.9\bin\gradle.bat'
    if(Test-Path -LiteralPath $exact){return $exact}
    $cmd=Get-Command 'gradle.bat' -ErrorAction SilentlyContinue
    if($cmd -and $cmd.Source -match 'gradle[\\/]8[.]9'){return $cmd.Source}
    return $null
}
Stage 'FIX16 START: Checking exact FIX15 source and existing outputs (NO phone changes)'
try {
    if(Test-Path -LiteralPath $OutputProject){throw 'EXISTING_FIX16_OUTPUT_PROJECT_DO_NOT_OVERWRITE'}
    if(Test-Path -LiteralPath $OutputZip){throw 'EXISTING_FIX16_OUTPUT_ZIP_DO_NOT_OVERWRITE'}
    # Exact source-hash verification; bounded directory search, not full Downloads traversal.
    Stage 'STEP 1/5: Locate FIX15 source ZIP in known folders'
    $candidates=@(Locate-Fix15)
    Add('FIX15_CANDIDATES_FOUND: '+$candidates.Count)
    if($candidates.Count -eq 0){throw 'FIX15_SOURCE_ZIP_NOT_FOUND_IN_DOWNLOADS_OR_FIX15_FOLDERS'}
    Stage 'STEP 1/5: Check SHA256 of candidate files'
    $valid=@($candidates | Where-Object {(Sha $_) -eq $ExpectedSourceZipSha})
    if($valid.Count -lt 1){throw ('EXACT_FIX15_SOURCE_ZIP_NOT_FOUND_OR_SHA_MISMATCH_CANDIDATES_'+$candidates.Count)}
    $InputZip=$valid[0]
    Add('INPUT_FIX15_SOURCE_ZIP_SHA256: '+(Sha $InputZip))
    Add('INPUT_MATCH_COUNT: '+$valid.Count)
    Stage 'STEP 2/5: Unpack original source to temporary workspace'
    New-Item -ItemType Directory -Path $Temp | Out-Null
    Expand-Archive -LiteralPath $InputZip -DestinationPath $Temp -Force
    $all=@(Get-ChildItem -LiteralPath $Temp -Recurse -File -Filter 'JH168RightVerticalScrollRuntime.kt' -ErrorAction SilentlyContinue |
        Where-Object {$_.FullName -match '[\\/]app[\\/]src[\\/]main[\\/].*JH168RightVerticalScrollRuntime[.]kt$'})
    if($all.Count -ne 1){throw ('EXACT_FIX15_RUNTIME_NOT_UNIQUE_'+$all.Count)}
    $sourceFile=$all[0].FullName
    $cut=$sourceFile.IndexOf('\app\src\main\',[StringComparison]::OrdinalIgnoreCase)
    if($cut -lt 0){throw 'ANDROID_ROOT_MISSING'}
    $sourceRoot=$sourceFile.Substring(0,$cut)
    if(!(Test-Path -LiteralPath (Join-Path $sourceRoot 'app\build.gradle.kts'))){throw 'ANDROID_GRADLE_PROJECT_NOT_FOUND'}
    $pFile=Join-Path $sourceRoot 'app\src\main\java\com\koreanlifehub\bridge\JH168NestedScrollPolicy.kt'
    if(!(Test-Path -LiteralPath $pFile)){throw 'NESTED_POLICY_NOT_FOUND'}
    if((Sha $sourceFile) -ne $ExpectedRuntimeSha -or (Sha $pFile) -ne $ExpectedPolicySha){
        throw 'FIX15_RUNTIME_OR_POLICY_SHA_MISMATCH_NO_PATCH'
    }
    Add('FIX15_EXACT_RUNTIME_SHA256: MATCH')
    Add('FIX15_EXACT_POLICY_SHA256: MATCH')
    Stage 'STEP 3/5: Copy FIX15 source into short Windows workspace; patch horizontal-only modules'
    # Avoid the classic Windows MAX_PATH (260 characters) limitation.
    # The original ZIP is extracted to a TEMP folder and remains unchanged;
    # this output is an isolated newly created short workspace.
    if(!(Test-Path -LiteralPath $Workspace)){New-Item -Path $Workspace -ItemType Directory -Force | Out-Null}
    if(Test-Path -LiteralPath $OutputProject){throw 'EXISTING_FIX16_OUTPUT_PROJECT_DO_NOT_OVERWRITE'}
    Add('SHORT_BUILD_WORKSPACE: '+$OutputProject)
    Copy-Item -LiteralPath $sourceRoot -Destination $OutputProject -Recurse -Force -ErrorAction Stop
    if(!(Test-Path -LiteralPath (Join-Path $OutputProject 'app\src\test\java\com\koreanlifehub\bridge\restart\NewCommandCleanRestartIntegrationTest.kt'))){
        throw 'NESTED_TEST_FILE_NOT_COPIED_IN_SHORT_WORKSPACE'
    }
    Add('NESTED_TEST_SOURCE_COPY: VERIFIED')
    $runtime=Join-Path $OutputProject 'app\src\main\java\com\koreanlifehub\bridge\JH168RightVerticalScrollRuntime.kt'
    $policy=Join-Path $OutputProject 'app\src\main\java\com\koreanlifehub\bridge\JH168NestedScrollPolicy.kt'
    if(!(Test-Path -LiteralPath $runtime) -or !(Test-Path -LiteralPath $policy)){throw 'COPIED_FILES_MISSING'}
    # Fixed source hashes from the user's FIX16-PORT-SOURCE-EXCERPT.txt.
    # Use exact original FIX15 main files; only FormTransport and GuidedForms are patched.
    $main=Join-Path $OutputProject 'app\src\main\java\com\koreanlifehub\bridge'
    $checks=@{
        'FormTransport.kt'='e1d3e841868dcabddee14badd337ab2397de59834ecabeb7f5299b1292a8d2d0'
        'GuidedForms.kt'='cc7ee6467f8893e6ca73f461382518f1fe6324b95ac6819d33f942288cfbb0fb'
        'AndroidAgent.kt'='f036a1d4bcac3217409aa70a29b5d720eb06cd425b9df002b5a4bc4686beb9d4'
        'AndroidScrollTargetPolicy.kt'='c87e3d7f17e5a014d57af5875e44ea16c6b79b299145d4ddc155b26e0917e503'
    }
    foreach($name in $checks.Keys) {
        $path=Join-Path $main $name
        if(!(Test-Path -LiteralPath $path) -or (Sha $path) -ne $checks[$name]) {
            throw ('EXACT_FIX15_ADAPTER_SHA_MISMATCH_'+$name)
        }
    }
    Add('EXACT_FIX15_ADAPTER_HASHES: MATCH_4')
    if((Sha $runtime) -ne $ExpectedRuntimeSha -or (Sha $policy) -ne $ExpectedPolicySha){throw 'VERTICAL_RUNTIME_OR_POLICY_CHANGED'}
    # Fail if any new file name already exists; do not overwrite unknown app code.
    foreach($newName in @('JH168HorizontalScrollPolicy.kt','JH168RightHorizontalScrollRuntime.kt')) {
        if(Test-Path -LiteralPath (Join-Path $main $newName)){throw ('NEW_MODULE_ALREADY_EXISTS_'+$newName)}
        $candidate=Join-Path $Kit $newName
        if(!(Test-Path -LiteralPath $candidate)){throw ('NEW_MODULE_MISSING_'+$newName)}
    }
    $transport=Join-Path $main 'FormTransport.kt'
    $forms=Join-Path $main 'GuidedForms.kt'
    $ft=[IO.File]::ReadAllText($transport)
    # Add two narrowly allowlisted form carrier operations. Reuse the original
    # transport nonce+session+replay fence and sc_ exact ID shape.
    $ft=Replace-Once $ft '","form_scroll","form_scroll_targets","form_review"' '","form_scroll","form_scroll_targets","form_scroll_h","form_scroll_h_targets","form_review"' 'FORM_TRANSPORT_ALLOWLIST'
    $ft=Replace-Once $ft 'else if(op=="form_scroll" && p[4].isNotEmpty()){' 'else if(op in setOf("form_scroll","form_scroll_h") && p[4].isNotEmpty()){' 'FORM_TRANSPORT_EXACT_SC_ID'
    [IO.File]::WriteAllText($transport,$ft,$Utf8)
    $gf=[IO.File]::ReadAllText($forms)
    $gf=Replace-Once $gf '","form_scroll","form_scroll_targets","form_review"' '","form_scroll","form_scroll_targets","form_scroll_h","form_scroll_h_targets","form_review"' 'GUIDED_ACTION_ALLOWLIST'
    $gf=Replace-Once $gf '"internalScrollTargetsToolArguments" to FormTransport.command("form_scroll_targets"),' ('"internalScrollTargetsToolArguments" to FormTransport.command("form_scroll_targets"),'+"`n"+'        "horizontalScrollTargetsToolArguments" to FormTransport.command("form_scroll_h_targets"),') 'GUIDED_SCANNER_CARRIER'

    $hMethod=@'
    /** FIX16: horizontal native action is isolated from FIX15 vertical scroll. */
    @Synchronized fun scrollHorizontal(s:AccessibilityService,direction:String,targetId:String):Map<String,Any?> {
        if(SensitiveGuard.paused(s))return result("secure_local_required")
        val p=capture(s) ?: return result("work_window_unavailable")
        if(p.hasSensitive)return result("secure_local_required")
        if(direction!="left" && direction!="right")return result("invalid_horizontal_direction")
        if(!Regex("sc_[0-9a-f]{24}").matches(targetId))return result("horizontal_target_id_required")
        session.invalidateApproval()
        val outcome=JH168RightHorizontalScrollRuntime.scrollInternal(s,direction,p.scope,targetId)
        return result(outcome.code,outcome.ok,
            "dispatched" to outcome.dispatched,
            "resultVerified" to outcome.resultVerified,
            "scrollDirection" to if(direction=="right")"RIGHT" else "LEFT",
            "targetWindowId" to outcome.workWindowId,
            "targetDisplayId" to outcome.displayId,
            "matchedMovingContentItems" to outcome.matched,
            "rescanRequired" to true,
            "autoRetryAllowed" to false)
    }
'@
    $gf=Replace-Once $gf '    fun executeTransport(s:AccessibilityService,request:FormTransport.Request):String =' ($hMethod+"`n"+'    fun executeTransport(s:AccessibilityService,request:FormTransport.Request):String =') 'GUIDED_HORIZONTAL_METHOD'
    $hDiscovery=@'
                "form_scroll_h_targets"->{
                    val current=if(SensitiveGuard.paused(s))null else capture(s)
                    if(current==null||current.hasSensitive)result("secure_local_required")
                    else JH168RightHorizontalScrollRuntime.discoverInternal(s).let { v ->
                        result(v.code,v.ok,
                            "targets" to v.targets.map { t -> mapOf(
                                "targetId" to t.id,"relativeBounds" to t.relativeBounds,
                                "viewId" to t.safeViewId,"nested" to true,
                                "leftToolArguments" to if(t.left)FormTransport.command("form_scroll_h",t.id,"left") else null,
                                "rightToolArguments" to if(t.right)FormTransport.command("form_scroll_h",t.id,"right") else null
                            ) },"count" to v.targets.size,"noAutomaticParentFallback" to true,
                            "requiresExplicitTargetSelection" to true)
                    }
                }
'@
    $gf=Replace-Once $gf '                "form_scroll_targets"->{' ($hDiscovery+"`n"+'                "form_scroll_targets"->{') 'GUIDED_HORIZONTAL_DISCOVERY'
    $gf=Replace-Once $gf '                "form_scroll"->scroll(s,step.value ?: "forward",step.text.orEmpty())' ('                "form_scroll_h"->scrollHorizontal(s,step.value.orEmpty(),step.text.orEmpty())'+"`n"+'                "form_scroll"->scroll(s,step.value ?: "forward",step.text.orEmpty())') 'GUIDED_HORIZONTAL_DISPATCH'
    [IO.File]::WriteAllText($forms,$gf,$Utf8)

    # Include compiled pure-policy module and original signed-pane-bound runtime.
    foreach($name in @('JH168HorizontalScrollPolicy.kt','JH168RightHorizontalScrollRuntime.kt')) {
        Copy-Item -LiteralPath (Join-Path $Kit $name) -Destination (Join-Path $main $name)
    }
    $horizontal=Join-Path $main 'JH168RightHorizontalScrollRuntime.kt'
    $horizontalPolicy=Join-Path $main 'JH168HorizontalScrollPolicy.kt'
    if((Sha $horizontal) -ne '73a72f8107b15dc5f4e7b220028f39957b3a3fcb82f504118b0234b769ffea00'){
        throw 'HORIZONTAL_RUNTIME_SHA_MISMATCH'
    }
    if((Sha $horizontalPolicy) -ne '693a4983733182e73d3b3a9619e0f8810b310e42b5c8fb3844a5f8d1deee8ec4'){
        throw 'HORIZONTAL_POLICY_SHA_MISMATCH'
    }
    if((Sha $runtime) -ne $ExpectedRuntimeSha -or (Sha $policy) -ne $ExpectedPolicySha){throw 'VERTICAL_SCROLL_CODE_CHANGED'}
    if((Sha (Join-Path $main 'AndroidAgent.kt')) -ne $checks['AndroidAgent.kt']){throw 'ANDROID_AGENT_CHANGED'}
    # Every preexisting source file except two adapters must be byte-identical.
    $modified=@('app/src/main/java/com/koreanlifehub/bridge/FormTransport.kt',
                'app/src/main/java/com/koreanlifehub/bridge/GuidedForms.kt')
    $unchanged=0
    foreach($originalFile in @(Get-ChildItem -LiteralPath $sourceRoot -Recurse -File -ErrorAction Stop)){
        $relative=$originalFile.FullName.Substring($sourceRoot.Length).TrimStart([char]92,[char]47)
        $copy=Join-Path $OutputProject $relative
        if(!(Test-Path -LiteralPath $copy)){throw ('COPIED_SOURCE_FILE_MISSING_'+$relative)}
        if($relative.Replace('\','/') -notin $modified){
            if((Sha $originalFile.FullName) -ne (Sha $copy)){throw ('UNEXPECTED_SOURCE_CHANGE_'+$relative)}
            $unchanged++
        }
    }
    $tests=Join-Path $OutputProject 'app\src\test\java\com\koreanlifehub\bridge'
    if(!(Test-Path -LiteralPath $tests)){New-Item -Path $tests -ItemType Directory -Force | Out-Null}
    $testDst=Join-Path $tests 'JH168HorizontalScrollPolicyTest.kt'
    if(Test-Path -LiteralPath $testDst){throw 'HORIZONTAL_TEST_ALREADY_EXISTS'}
    Copy-Item -LiteralPath (Join-Path $Kit 'JH168HorizontalScrollPolicyTest.kt') -Destination $testDst
    Add('UNCHANGED_SOURCE_FILES_VERIFIED: '+$unchanged)
    Add('VERTICAL_FIX15_SOURCE_SHA256: MATCH')
    Add('HORIZONTAL_RUNTIME_SHA256: '+(Sha $horizontal))
    Add('HORIZONTAL_POLICY_SHA256: '+(Sha $horizontalPolicy))
    Add('FORMTRANSPORT_AND_GUIDEDFORMS_HORIZONTAL_ONLY: PATCHED')
    Add('JAVA_ANDROIDAGENT_UNCHANGED: YES')
    Add('EXISTING_SECURE56_APPROVAL: UNCHANGED')
    Add('NATIVE_HORIZONTAL_ONLY: ACTION_SCROLL_LEFT_RIGHT')
    Add('LEGACY_FORWARD_BACKWARD_FOR_HORIZONTAL: FORBIDDEN')
    Add('COMPUTER_USE: NOT_USED')
    Add('PARENT_FALLBACK: FORBIDDEN')
    Add('AUTO_REPLAY: FORBIDDEN')
    Add('MAX_NODES: 2500_UNCHANGED; MAX_DEPTH: 64_UNCHANGED; FANOUT: 100_PER_BATCH_UNCHANGED')
    # Never include credentials, a keystore, APK or local.properties in source ZIP.
    $exclude=@(Get-ChildItem -LiteralPath $OutputProject -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object {$_.Name -match '(?i)\.keystore$|\.jks$|\.p12$|\.pfx$|\.apk$|^local\.properties$'})
    if($exclude.Count -gt 0){throw ('UNEXPECTED_SENSITIVE_OR_BINARY_SOURCE_FILE_'+$exclude.Count)}
    Stage 'STEP 4/5: Package FIX16 horizontal source candidate'
    Compress-Archive -LiteralPath $OutputProject -DestinationPath $OutputZip -CompressionLevel Optimal
    Add('FIX16_SOURCE_ZIP_SHA256: '+(Sha $OutputZip))
    Add('FIX16_SOURCE_ZIP_CREATED: YES')
    Add('FIX16_SOURCE_ZIP_PATH: '+$OutputZip)
    $Status='SOURCE_PATCHED_BUILD_NOT_RUN'
    Stage 'STEP 5/5: Locate existing Gradle 8.9'
    $gradle=Find-Gradle
    if(!$gradle){
        Add('GRADLE: NOT_FOUND')
        $Status='SOURCE_PATCHED_BUILD_NOT_AVAILABLE'
    } else {
        Add('GRADLE: FOUND')
        $sdk=Join-Path $env:LOCALAPPDATA 'Android\Sdk'
        $java17='C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot'
        if(Test-Path -LiteralPath $sdk){$env:ANDROID_HOME=$sdk;$env:ANDROID_SDK_ROOT=$sdk}
        if(Test-Path -LiteralPath $java17){$env:JAVA_HOME=$java17}
        Stage 'STEP 5/5: Gradle tests and APK build; progress is shown below'
        $oldPref=$ErrorActionPreference
        Push-Location $OutputProject
        try {
            $ErrorActionPreference='Continue'
            # Show the original Gradle progress AND save it. No hidden log-only build.
            & $gradle --offline --no-daemon --console=plain '-Pkotlin.compiler.execution.strategy=in-process' ':app:testReleaseUnitTest' ':app:assembleRelease' 2>&1 |
                ForEach-Object { $line=([string]$_); $line | Out-File -FilePath $Log -Encoding UTF8 -Append; Write-Host $line }
            $exit=$LASTEXITCODE
        } finally {
            $ErrorActionPreference=$oldPref
            Pop-Location
        }
        Add('GRADLE_EXIT_CODE: '+$exit)
        if($exit -eq 0){
            $apk=Join-Path $OutputProject 'app\build\outputs\apk\release\app-release-unsigned.apk'
            if(!(Test-Path -LiteralPath $apk)){throw 'BUILD_REPORTED_SUCCESS_BUT_APK_MISSING'}
            $last=(Get-Item -LiteralPath $apk).LastWriteTimeUtc
            foreach($changed in @($transport,$forms,$horizontal,$horizontalPolicy,$testDst)){if($last -lt (Get-Item -LiteralPath $changed).LastWriteTimeUtc){throw ('APK_OLDER_THAN_CHANGED_SOURCE_'+[IO.Path]::GetFileName($changed))}}
            Add('FIX16_UNSIGNED_APK_PATH: '+$apk)
            Add('FIX16_UNSIGNED_APK_SHA256: '+(Sha $apk))
            $Status='FIX16_HORIZONTAL_BUILD_TEST_PASS_UNSIGNED_NOT_INSTALLED'
        } else { $Status='FIX16_HORIZONTAL_BUILD_FAILED_NO_PHONE_CHANGE' }
    }
} catch {
    Add('ERROR: '+$_.Exception.Message)
    if($Status -eq 'SOURCE_PATCHED_BUILD_NOT_RUN'){$Status='SOURCE_PATCHED_OR_PARTIAL_NO_PHONE_CHANGE'}
} finally {
    Add('STATUS: '+$Status)
    Add('DEVICE_INSTALL: NOT_ATTEMPTED')
    Add('SIGNING: NOT_ATTEMPTED')
    Add('ORIGINAL_FIX15_AND_FIX11_AND_FIX10: UNCHANGED')
    Add('SECURE56_APPROVAL: UNCHANGED')
    Add('COMPUTER_USE: NOT_USED')
    Add('PARENT_SCROLL_FALLBACK: NOT_USED')
    Add('GITHUB_DEPLOYMENT: NOT_ATTEMPTED')
    [IO.File]::WriteAllLines($Report,$Lines.ToArray(),$Utf8)
    Stage ('FINISHED: '+$Status+' ; open RESULT.txt')
    if(Test-Path -LiteralPath $Temp){Remove-Item -LiteralPath $Temp -Recurse -Force -ErrorAction SilentlyContinue}
    $Lines | ForEach-Object {Write-Host $_}
}
