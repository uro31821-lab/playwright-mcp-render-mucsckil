/** Stage the ONE reviewed additive read policy in an isolated baseline checkout.
 * This is not an installer and never runs against an operational service.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const [candidate,baseline]=process.argv.slice(2).map(x=>path.resolve(x));
const rel='jh-server/owner-setup/deployment/durable-native-job-policy.mjs';
const dst=path.join(baseline,rel),text=readFileSync(dst,'utf8');
const blob=createHash('sha1').update('blob '+Buffer.byteLength(text)+'\0').update(text).digest('hex');
assert.equal(blob,'39be04401aa360ba6bf87370d291bc6096b5c655','original classifier must match reviewed baseline');
const next=readFileSync(path.join(candidate,rel),'utf8');
const begin=' // KABISEO_EXACT_METADATA_POLICY_BEGIN\n',end=' // KABISEO_EXACT_METADATA_POLICY_END\n';
assert.equal(next.split(begin).length,2);assert.equal(next.split(end).length,2);
const a=next.indexOf(begin),b=next.indexOf(end,a)+end.length;
assert.equal(next.slice(0,a)+next.slice(b),text,'no unrelated native policy change permitted');
const copy=path.join(path.dirname(dst),'durable-native-job-policy.kabiseo-original.mjs');
assert.equal(existsSync(copy),false);writeFileSync(copy,text,{flag:'wx',mode:0o600});
const original=(await import(pathToFileURL(copy).href)).durableNativeJobPolicy;
writeFileSync(dst,next);
const changed=(await import(pathToFileURL(dst).href)).durableNativeJobPolicy;
const p={requestId:'a'.repeat(32),commandId:'b'.repeat(32),taskDigest:'c'.repeat(64),taskId:'c'.repeat(64),
 action:'KABISEO_CAMERA_METADATA',cameraTargetPackage:'com.openai.chatgpt',mcpToolName:'life_android_kabiseo_metadata',
 secureRequestedEffect:'READ_ONLY',targetDeviceDigest:'d'.repeat(64),secureInvocationExpiresAt:Date.now()+45000,
 containsCredential:false,dataClass:'NONE',effect:'READ_ONLY',index:0,viewportWidth:0,viewportHeight:0,scrollX:0,scrollY:0,waitMs:0,maxActionsInCall:20};
const j={...p,type:'kabiseo_camera_metadata'};
assert.equal(original(j,p).code,'DURABLE_OPERATION_NOT_SUPPORTED');
assert.deepEqual(changed(j,p),{kind:'READ',approvalGranted:false,screenConsentGranted:false});
let rejected=0;
for(const field of Object.keys(p)){const q={...p};delete q[field];assert.equal(changed(j,q).kind,'DENY',field+' missing');rejected++;}
for(const [field,value] of Object.entries({action:'CLICK',effect:'MUTATION',secureRequestedEffect:'REVERSIBLE_WRITE',
 cameraTargetPackage:'com.android.chrome',mcpToolName:'life_android_capture_work_window',requestId:'x',commandId:'x',
 taskId:'e'.repeat(64),taskDigest:'e'.repeat(64),targetDeviceDigest:'e'.repeat(64),containsCredential:true,dataClass:'SECRET',
 secureInvocationExpiresAt:0,index:1,viewportWidth:1,viewportHeight:1,scrollX:1,scrollY:1,waitMs:1,maxActionsInCall:1,
 screenGrantToken:'token',textValue:'private',x:1,leaseToken:'token',unknownField:true})){
 assert.equal(changed(j,{...p,[field]:value}).kind,'DENY',field+' mismatched');rejected++;}
let unchanged=0;
for(const type of ['agent_snapshot','secure_device_status','computer_use_inspect','computer_use_action_prepare',
 'computer_use_action_approval_status','computer_use_screen_consent_status','computer_use_action_approval_request',
 'computer_use_screen_consent_request','split_comfort_status','split_screen_session_start','split_screen_session_status',
 'split_screen_session_followup','open_url','agent_step','computer_use_action_execute','computer_use_capture_frame','unknown']){
 for(const effect of ['READ_ONLY','REVERSIBLE_WRITE','MUTATION']){
  for(const payload of [{},{action:'CLICK',leaseToken:'fixture'},{dataClass:'SECRET'}]){
   const job={type,secureRequestedEffect:effect,mcpToolName:'life_android_secure_status'};
   assert.deepEqual(changed(job,payload),original(job,payload),type+' original route changed');unchanged++;
  }
 }
}
console.log('KABISEO_NATIVE_POLICY_REVIEW='+JSON.stringify({status:'PASS',originalBugReproduced:true,exactCameraReadAccepted:true,
 rejectedMalformedScopes:rejected,unrelatedCasesUnchanged:unchanged,originalClassifierBlob:blob,
 changedClassifierSha256:createHash('sha256').update(next).digest('hex'),physicalPhoneCommands:0,productionChanged:false}));
