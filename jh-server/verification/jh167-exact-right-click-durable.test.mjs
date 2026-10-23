/** JH167 exact-context, one-click durable security regression (no device or credentials). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {durableNativeJobPolicy as policy} from '../owner-setup/deployment/durable-native-job-policy.mjs';
import {createDurableNativeHooks} from '../owner-setup/deployment/durable-native-host.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex');
const task=(type='split_screen_session_followup',tool='life_android_execute_computer_action',effect='REVERSIBLE_WRITE')=>
  ({type,mcpToolName:tool,secureRequestedEffect:effect,id:'job_synthetic',status:'queued',
  secureSessionId:'synthetic-secure-session',targetDeviceId:'synthetic-device'});
const request={
 contextId:'ssc_'+'a'.repeat(32),requestId:'b'.repeat(32),
 targetItemRef:'item_'+'c'.repeat(16),action:'CLICK',command:'지도 메인메뉴 펼치기',
 mcpToolName:'life_android_execute_computer_action',
 secureRequestedEffect:'REVERSIBLE_WRITE',taskDigest:'d'.repeat(64),
 targetDeviceDigest:'e'.repeat(64),secureInvocationExpiresAt:1000000000000,containsCredential:false
};
test('only explicit signed semantic CLICK is recorded before dispatch',()=>{
 const p=policy(task(),request);
 assert.equal(p.kind,'JOURNAL');
 assert.equal(p.approvalGranted,false);
 assert.equal(p.screenConsentGranted,false);
 assert.deepEqual(Object.keys(p.identityPayload).sort(),
   ['action','commandDigest','contextId','requestId','targetItemRef'].sort());
 assert.equal(p.identityPayload.action,'CLICK');
 assert.ok(!JSON.stringify(p.identityPayload).includes(request.command));
});
test('every malformed or unreviewed follow-up stays denied',()=>{
 const bad=[
  {action:'AUTO'},{action:'SET_TEXT',value:'typing'},{action:'BACK'},
  {action:'SCROLL'},{action:'CLICK',targetItemRef:''},
  {action:'CLICK',targetItemRef:'item_wrong'},
  {requestId:''},{requestId:'abc'},{contextId:'ssc_wrong'},
  {command:''},{command:'x'.repeat(2001)},
  {containsCredential:true},{dataClass:'SECRET'},
  {screenGrantToken:'unapproved'},{actionApprovalGrantToken:'bypass'},
  {workflowId:'jh_split_fake'}, {commandId:'invalid'},
  {mcpToolName:'life_android_capture_work_window'}
 ];
 for(const x of bad)assert.equal(policy(task(),{...request,...x}).kind,'DENY',JSON.stringify(x));
 for(const [tool,effect] of [
   ['life_android_execute_computer_action','READ_ONLY'],
   ['life_android_capture_work_window','READ_ONLY'],
   ['life_android_execute_computer_action','MUTATION']])
  assert.equal(policy(task('split_screen_session_followup',tool,effect),request).kind,'DENY',tool+' '+effect);
 for(const type of ['split_screen_session_finish','split_screen_session_cancel',
   'split_screen_session_input_preflight','split_screen_session_save_analysis'])
  assert.equal(policy(task(type),request).kind,'DENY',type);
});
test('journal blocks replay of identical unresolved click across new signed job',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'jh-split-click-'));
 const opts={file:path.join(dir,'journal.sqlite'),key:Buffer.alloc(32,12),
   namespace:sha('jh-split-click-bounded-integration')};
 let hooks=createDurableNativeHooks({...opts,mode:'EXPLICIT_ONE_TIME'});
 try{
  const a=task();hooks.capture(a,request);
  assert.equal(hooks.beforeDispatch(a).allowed,true);
  a.status='in_progress';hooks.close();
  hooks=createDurableNativeHooks(opts);
  const b={...task(),id:'job_second'},same={...request,taskDigest:'f'.repeat(64),secureInvocationExpiresAt:9999999999999};
  hooks.capture(b,same);
  const result=hooks.beforeDispatch(b);
  assert.equal(result.allowed,false);
  assert.equal(result.code,'DURABLE_PREVIOUS_OUTCOME_UNKNOWN');
 }finally{hooks.close();rmSync(dir,{recursive:true,force:true});}
});
