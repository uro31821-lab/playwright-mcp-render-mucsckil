#!/usr/bin/env python3
"""Create a NEW source-only integration candidate. No build, install, server call or source overwrite.
Reject unknown/newer source rather than silently rewriting it to the inspected historical baseline.
"""
import argparse, hashlib, json, shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def replace_once(text,old,new):
    if text.count(old)!=1:raise ValueError('host anchor changed; manual review required')
    return text.replace(old,new,1)
def apply(source,output):
    source=Path(source).resolve();output=Path(output).resolve()
    baseline=json.loads((ROOT/'integration/host-baseline.json').read_text())
    if output.exists() or output==source or source in output.parents or output in source.parents:
        raise ValueError('output must be a new, separate directory')
    if any(p.is_symlink() for p in source.rglob('*')):raise ValueError('symlink in input')
    for name,digest in baseline['guarded_source_sha256'].items():
        p=source/name
        if not p.is_file() or sha(p)!=digest:raise ValueError('unsupported host baseline: '+name)
    bridge_path='app/src/main/java/com/koreanlifehub/bridge/BridgeService.kt'
    secure_path='app/src/main/java/com/koreanlifehub/bridge/SecureBridge56.kt'
    b=(source/bridge_path).read_text();s=(source/secure_path).read_text()
    b=replace_once(b,' private var agentMode=false', ''' // KABISEO_V07: OFF until profile enrollment, host/server review and phone read-only test.
 private val kabiseoCameraMetadataEnabled=false
 private val kabiseoCameraEpoch=java.util.concurrent.atomic.AtomicLong(0)
 private var agentMode=false''')
    b=replace_once(b,'  val generation=siteFence.discard()', '  kabiseoCameraEpoch.incrementAndGet()\n  val generation=siteFence.discard()')
    b=replace_once(b,'            val controlOnly=type.endsWith("_approval_status")', '''            // KABISEO_V07: the ORIGINAL Secure56 verifier and command/journal admission ran above.
            // Not reachable from agent_snapshot or agent_step; do not weaken their split gate.
            if(type=="kabiseo_camera_metadata"){
              completeResult(id,kabiseoMetadataResult(j,secureGate,admitted));delayMs=800L;continue
            }
            val controlOnly=type.endsWith("_approval_status")''')
    b=replace_once(b,' private fun verifyIncomingSecureJob(j:JSONObject,wireJson:String):SecureBridge56.Verify {',
      (ROOT/'integration/bridge_helper.kt.txt').read_text()+' private fun verifyIncomingSecureJob(j:JSONObject,wireJson:String):SecureBridge56.Verify {')
    b=replace_once(b,'   if(e==null) return\n   SplitComfortRuntime.observe', '''   if(e==null) return
   if(e.eventType in setOf(AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED,AccessibilityEvent.TYPE_WINDOWS_CHANGED,
       AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED,AccessibilityEvent.TYPE_VIEW_SCROLLED))kabiseoCameraEpoch.incrementAndGet()
   SplitComfortRuntime.observe''')
    b=replace_once(b,' override fun onInterrupt(){ChatGptReturnLifecycle.clear();',
        ' override fun onInterrupt(){kabiseoCameraEpoch.incrementAndGet();ChatGptReturnLifecycle.clear();')
    b=replace_once(b,' override fun onDestroy(){\n   try{',' override fun onDestroy(){\n   kabiseoCameraEpoch.incrementAndGet()\n   try{')
    b=replace_once(b,'   val tool=j.optString("mcpToolName")', '''   val tool=j.optString("mcpToolName")
   // Bidirectional type/tool binding: a read-only camera tool cannot authorize another job kind.
   if((j.optString("type")=="kabiseo_camera_metadata")!=(tool=="life_android_kabiseo_metadata"))
     return SecureBridge56.Verify(false,"kabiseo_tool_job_type_mismatch")''')
    s=replace_once(s,'"life_android_capture_work_window")','"life_android_capture_work_window","life_android_kabiseo_metadata")')
    s=replace_once(s,'  if(mcpToolName !in allowed)return Verify(false,"secure_tool_not_allowed")', '''  if(mcpToolName !in allowed)return Verify(false,"secure_tool_not_allowed")
  // The new diagnostic tool cannot borrow WRITE or pixel-capture authority.
  if(mcpToolName=="life_android_kabiseo_metadata"&&requestedEffect!="READ_ONLY")return Verify(false,"secure_effect_invalid")''')
    # Calculate every transformation before creating the new directory.
    additions={}
    for prefix in ('core','android'):
        for p in (ROOT/prefix/'src/main/java').rglob('*.java'):
            relative=p.relative_to(ROOT/prefix/'src/main/java')
            dest='app/src/main/java/'+relative.as_posix()
            if (source/dest).exists():raise ValueError('existing camera source must be reconciled: '+dest)
            text=p.read_text()
            if '@android.annotation.TargetApi(34)' not in text:
                text=replace_once(text,'public final class ','@android.annotation.TargetApi(34)\npublic final class ')
            additions[dest]=text
    shutil.copytree(source,output)
    (output/bridge_path).write_text(b);(output/secure_path).write_text(s)
    for name,text in additions.items():
        p=output/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text)
    before={p.relative_to(source).as_posix():sha(p) for p in source.rglob('*') if p.is_file()}
    after={p.relative_to(output).as_posix():sha(p) for p in output.rglob('*') if p.is_file()}
    changed=[p for p in before if before[p]!=after.get(p)]
    if sorted(changed)!=sorted([bridge_path,secure_path]):raise ValueError('unexpected host modifications')
    if any(p not in after for p in before):raise ValueError('source deleted')
    report={'schema':'KABISEO_V07_HOST_SOURCE_PATCH','input_source_kind':'Stage62 TripLocation merged CANDIDATE, not installed-source attestation',
      'input_zip_sha256':baseline['input_zip_sha256'],'changed':changed,'added':sorted(additions),
      'unchanged_original_files':len(before)-len(changed),'total_source_files':len(after),
      'manifest_unchanged':before['app/src/main/AndroidManifest.xml']==after['app/src/main/AndroidManifest.xml'],
      'app_gradle_unchanged':before['app/build.gradle.kts']==after['app/build.gradle.kts'],
      'secure56_verifyServerJob_unchanged':True,'runtime_feature_enabled':False,'camera_profiles_bundled':0,
      'full_host_build_passed':False,'server_route_registered':False,'phone_installed':False,'device_tested':False,
      'patched_sha256':{p:after[p] for p in changed+list(additions)}}
    (output.parent/(output.name+'-patch-report.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    return report
if __name__=='__main__':
    a=argparse.ArgumentParser();a.add_argument('--source',required=True,type=Path);a.add_argument('--output',required=True,type=Path);args=a.parse_args()
    try:print(json.dumps(apply(args.source,args.output),ensure_ascii=False,indent=2))
    except (ValueError,OSError) as e:raise SystemExit('BLOCKED: '+str(e))
