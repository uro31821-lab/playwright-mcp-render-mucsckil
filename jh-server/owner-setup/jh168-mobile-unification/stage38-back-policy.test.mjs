import test from 'node:test';
import assert from 'node:assert/strict';
import {durableNativeJobPolicy} from '../deployment/durable-native-job-policy.mjs';
const job=()=>({type:'split_screen_session_followup',mcpToolName:'life_android_execute_computer_action',secureRequestedEffect:'REVERSIBLE_WRITE'});
const payload=(action='BACK')=>({contextId:'ssc_'+'a'.repeat(32),requestId:'b'.repeat(32),action,
  command:'Navigate backwards within current verified RIGHT Chrome context',targetItemRef:'item_'+'c'.repeat(16),
  mcpToolName:'life_android_execute_computer_action',secureRequestedEffect:'REVERSIBLE_WRITE',
  taskDigest:'d'.repeat(64),targetDeviceDigest:'e'.repeat(64),secureInvocationExpiresAt:99999,
  containsCredential:false,dataClass:'NON_SENSITIVE',commandId:'f'.repeat(32)});
test('CLICK and BACK are distinct journaled signed single-actions, no approvals granted',()=>{
 const a=durableNativeJobPolicy(job(),payload('CLICK')),b=durableNativeJobPolicy(job(),payload('BACK'));
 assert.equal(a.kind,'JOURNAL');assert.equal(b.kind,'JOURNAL');
 assert.equal(a.identityPayload.action,'CLICK');assert.equal(b.identityPayload.action,'BACK');
 assert.equal(a.identityPayload.targetItemRef,b.identityPayload.targetItemRef);
 assert.notDeepEqual(a.identityPayload,b.identityPayload);
 assert.equal(a.approvalGranted,false);assert.equal(b.approvalGranted,false);
 assert.equal(b.screenConsentGranted,false);
});
test('BACK requires exact fresh itemRef, signed route, command and request binding',()=>{
 for(const bad of [
  {targetItemRef:''},{targetItemRef:'wrong'},{command:''},{requestId:'x'},
  {contextId:'bad'},{value:'data'},{inputGrantToken:'unsafe'},{approvalGrantToken:'grant'},
  {dataClass:'SECRET'},{action:'SET_TEXT'},{action:'AUTO'},{action:'SCROLL'}]){
   assert.equal(durableNativeJobPolicy(job(),{...payload(),...bad}).kind,'DENY',JSON.stringify(bad));
 }
 for(const j of [{mcpToolName:'life_web_back'},{secureRequestedEffect:'READ_ONLY'}]){
  assert.equal(durableNativeJobPolicy({...job(),...j},payload()).kind,'DENY');
 }
});
test('device action remains original policy; no generic BACK on computer execute',()=>{
 const p=durableNativeJobPolicy({type:'computer_use_action_execute',mcpToolName:'life_android_execute_computer_action',secureRequestedEffect:'MUTATION'},{action:'BACK',leaseToken:'lease'});
 assert.equal(p.kind,'DENY');
});
