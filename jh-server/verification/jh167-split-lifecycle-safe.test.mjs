import test from 'node:test';
import assert from 'node:assert/strict';
import {durableNativeJobPolicy as policy} from '../owner-setup/deployment/durable-native-job-policy.mjs';

const id='ssc_'+'1'.repeat(32), commandId='2'.repeat(32);
const job=type=>({type,mcpToolName:'life_android_execute_computer_action',
 secureRequestedEffect:'REVERSIBLE_WRITE',targetDeviceId:'synthetic-phone',
 secureSessionId:'synthetic-session',commandId});
const base=()=>({contextId:id,mcpToolName:'life_android_execute_computer_action',
 secureRequestedEffect:'REVERSIBLE_WRITE',taskDigest:'3'.repeat(64),
 targetDeviceDigest:'4'.repeat(64),secureInvocationExpiresAt:Date.now()+60000,
 containsCredential:false,dataClass:'NON_SENSITIVE',commandId});
const save=()=>({...base(),summaryText:'synthetic summary',comparedItemRefs:[],
 recommendedItemRef:''});
const finish=()=>({...base(),reason:'goal_completed'});
test('context-only save and finish must be journaled, never grant approval',()=>{
 for(const [type,p,transition] of [
 ['split_screen_session_save_analysis',save(),'SAVE_ANALYSIS'],
 ['split_screen_session_finish',finish(),'FINISH']]){
  const r=policy(job(type),p);
  assert.equal(r.kind,'JOURNAL');
  assert.deepEqual(r.identityPayload,{contextId:id,transition});
  assert.equal(r.approvalGranted,false);
  assert.equal(r.screenConsentGranted,false);
 }
});
test('mismatched scope, extra control fields and secret data fail closed',()=>{
 const sj=job('split_screen_session_save_analysis'),fj=job('split_screen_session_finish');
 for(const p of [{...save(),action:'CLICK'},{...save(),dataClass:'SECRET'},
  {...save(),contextId:'invalid'},{...save(),summaryText:''},
  {...save(),secureRequestedEffect:'READ_ONLY'},{...save(),commandId:'a'.repeat(32)}]){
  assert.equal(policy(sj,p).kind,'DENY');
 }
 for(const p of [{...finish(),action:'TYPE'},{...finish(),reason:'x'.repeat(81)},
  {...finish(),containsCredential:true}])assert.equal(policy(fj,p).kind,'DENY');
 assert.equal(policy({...sj,mcpToolName:'wrong'},save()).kind,'DENY');
});
