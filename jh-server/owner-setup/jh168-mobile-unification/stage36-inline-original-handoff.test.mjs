import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createStage36InlineOriginalHandoff} from './stage36-inline-original-handoff.mjs';

const token='s35_v1_'+('Q'.repeat(96));
const command='a'.repeat(32);
const digest='b'.repeat(64);
const now=1793508000000;
const state=()=>({
 scope:{
  type:'split_screen_session_followup',
  effect:'REVERSIBLE_WRITE',
  tool:'life_android_execute_computer_action',
  action:'CLICK',originalAction:'CLICK',
  jobStatus:'complete',originalJobId:'job_360',
  currentCommandId:command,originalCommandId:command,
  deviceId:'synthetic-phone',originalDeviceId:'synthetic-phone',
  deviceDigest:digest,originalDeviceDigest:digest,
  originalSessionId:'original-session',currentSessionId:'original-session'
 },
 receipt:{ok:true,resultVerified:true,jobDigest:'not-identity',taskDigest:'c'.repeat(64)},
 deviceResult:{ok:true,resultVerified:true,action:'CLICK'},
 verified:{verified:true,executed:true,duplicate:false},
 issuance:{ok:true,code:'STAGE35_SEALED_ORIGINAL_REFERENCE_ISSUED',
  sealedHandle:token,sealedHandleIssued:true,expiresAtNotExtended:true,
  expiresAtMs:now+60000,taskSuccessVerified:false,
  uiTransitionVerified:false,automaticReplay:false}
});
function newBridge(ref={now}){
 return createStage36InlineOriginalHandoff({clock:()=>ref.now});
}
test('sealed handle is staged privately then returned only by original protected proof',()=>{
 const b=newBridge(),s=state();let count=0;
 assert.equal(b.stage({...s,issue:()=>{count++;return s.issuance}}),true);
 assert.equal(count,1);
 assert.equal(Object.hasOwn(s.receipt,'sealedHandle'),false);
 const result=b.finish({receipt:s.receipt,verified:s.verified});
 assert.equal(result.sealed_handle,token);
 assert.equal(result.expires_at_ms,now+60000);
 assert.equal(result.read_tool,'life_android_original_completion_handle_status');
 assert.equal(result.receipt_scope,'ORIGINAL_SIGNED_DEVICE_RESULT_RECEIVED');
 assert.equal(result.ui_transition_verified_by_handle,false);
 assert.equal(result.task_success_verified_by_handle,false);
 assert.equal(result.new_job_created,false);
 assert.equal(result.original_job_reexecuted,false);
 assert.equal(result.automatic_replay,false);
 assert.equal(b.finish({receipt:s.receipt,verified:s.verified}),null);
});
test('same original result cannot mint a duplicate handle even before screen finish',()=>{
 const b=newBridge(),s=state();let n=0;
 const issue=()=>{n++;return s.issuance};
 assert.equal(b.stage({...s,issue}),true);
 assert.equal(b.stage({...s,issue}),false);
 assert.equal(n,1);
 assert.equal(b.finish({receipt:s.receipt,verified:s.verified}).sealed_handle,token);
 assert.equal(b.stage({...s,issue}),false); // never issue again for consumed original result
 assert.equal(n,1);
});
test('protected readback failure cannot expose a staged handle',()=>{
 for(const diff of [
  {verified:false},{executed:false},{duplicate:true}
 ]){
  const b=newBridge(),s=state();
  b.stage({...s,issue:()=>s.issuance});
  const denied=b.finish({receipt:s.receipt,verified:{...s.verified,...diff}});
  assert.equal(denied,null,JSON.stringify(diff));
  assert.equal(b.finish({receipt:s.receipt,verified:s.verified}),null);
 }
});
test('the Android result itself must report a verified original screen transition',()=>{
 for(const diff of [
  {ok:false},{resultVerified:false},{resultVerified:null}
 ]){
  const b=newBridge(),s=state();let tries=0;
  assert.equal(b.stage({...s,deviceResult:{...s.deviceResult,...diff},
    issue:()=>{tries++;return s.issuance}}),false);
  assert.equal(tries,0);
  assert.equal(b.finish({receipt:s.receipt,verified:s.verified}),null);
 }
});
test('original job/device/session/command identity cannot be substituted to mint a handle',()=>{
 const mutations=[
  {type:'split_screen_session_status'},
  {effect:'READ_ONLY'}, {tool:'life_android_capture_work_window'},
  {action:'SCROLL'}, {originalAction:'SCROLL'}, {jobStatus:'queued'},
  {originalJobId:'j_360'},{currentCommandId:'c'.repeat(32)},
  {originalDeviceId:'other-phone'}, {originalDeviceDigest:'f'.repeat(64)},
  {currentSessionId:'rotated-original-session'}
 ];
 for(const diff of mutations){
  const b=newBridge(),s=state();let called=0;
  assert.equal(b.stage({...s,scope:{...s.scope,...diff},
    issue:()=>{called++;return s.issuance}}),false,JSON.stringify(diff));
  assert.equal(called,0);
 }
});
test('unverified signature flags, bad ciphertext and deadline cannot be returned',()=>{
 const keys=[
  {ok:false},{code:'NOT_VERIFIED'},{sealedHandleIssued:false},
  {expiresAtNotExtended:false},{taskSuccessVerified:true},
  {uiTransitionVerified:true},{automaticReplay:true},
  {sealedHandle:'s35_v1_invalid'},{sealedHandle:token.slice(0,6)+'!'},
  {expiresAtMs:now}
 ];
 for(const diff of keys){
  const b=newBridge(),s=state();
  assert.equal(b.stage({...s,issue:()=>({...s.issuance,...diff})}),false,
   JSON.stringify(diff));
  assert.equal(b.finish({receipt:s.receipt,verified:s.verified}),null);
 }
});
test('stale signed expiry at final screen verification suppresses handle',()=>{
 const time={now},b=newBridge(time),s=state();
 assert.equal(b.stage({...s,issue:()=>s.issuance}),true);
 time.now=now+60001;
 assert.equal(b.finish({receipt:s.receipt,verified:s.verified}),null);
});
test('failure in sealed issuer cannot alter original device result or claim completion',()=>{
 const b=newBridge(),s=state();
 assert.equal(b.stage({...s,issue:()=>{throw Error('owner sqlite locked')}}),false);
 assert.deepEqual(s.receipt,{ok:true,resultVerified:true,
  jobDigest:'not-identity',taskDigest:'c'.repeat(64)});
 assert.equal(b.finish({receipt:s.receipt,verified:s.verified}),null);
});
test('concurrent scoped receipts never share a handle across job results',()=>{
 const b=newBridge();
 const a=state(),c=state(),token2='s35_v1_'+('R'.repeat(96));
 c.receipt={ok:true,resultVerified:true};
 assert.equal(b.stage({...a,issue:()=>a.issuance}),true);
 assert.equal(b.stage({...c,issue:()=>({...c.issuance,sealedHandle:token2})}),true);
 assert.equal(b.finish({receipt:c.receipt,verified:c.verified}).sealed_handle,token2);
 assert.equal(b.finish({receipt:a.receipt,verified:a.verified}).sealed_handle,token);
});
test('fake original job result and absent verified context never become release proof',()=>{
 const b=newBridge(),s=state();
 assert.equal(b.stage({receipt:5,deviceResult:s.deviceResult,scope:s.scope,issue:()=>s.issuance}),false);
 assert.equal(b.finish({receipt:s.receipt,verified:undefined}),null);
 assert.equal(b.finish({receipt:{ok:true},verified:s.verified}),null);
});
test('pure helper has no server registry, token storage, approval or Android API',()=>{
 const source=readFileSync(new URL('./stage36-inline-original-handoff.mjs',import.meta.url),'utf8');
 for(const prohibited of [
  'registerOAuthTool(', 'httpServer.listen(',
  'mk(', 'waitJob(', 'begin_command(', 'beforeDispatch(',
  'sendPhone', 'approvalGrant(', 'writeFileSync(', 'DatabaseSync(',
  'setTimeout(', 'setInterval('
 ])assert.equal(source.includes(prohibited),false,prohibited);
});
