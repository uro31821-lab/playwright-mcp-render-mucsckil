import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,rmSync,chmodSync,readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createDurableNativeHooks} from '../owner-setup/deployment/durable-native-host.mjs';
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

test('journal blocks an unresolved lifecycle across restarts without storing summary text',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'jh-split-life-'));chmodSync(dir,0o700);
 const file=path.join(dir,'journal.sqlite');
 const options={file,key:Buffer.alloc(32,17),namespace:createHash('sha256').update('synthetic namespace').digest('hex')};
 let hooks=createDurableNativeHooks({...options,mode:'EXPLICIT_ONE_TIME'});
 try{
  const initial={...job('split_screen_session_save_analysis'),id:'save-one'};
  hooks.capture(initial,save());
  const admission=hooks.beforeDispatch(initial);
  assert.equal(admission.allowed,true,JSON.stringify(admission));
  hooks.close();
  hooks=createDurableNativeHooks({...options,mode:'read'});
  const repeated={...job('split_screen_session_save_analysis'),id:'save-again'};
  hooks.capture(repeated,{...save(),summaryText:'DIFFERENT_SENSITIVE_TEST_TEXT',taskDigest:'f'.repeat(64)});
  assert.equal(hooks.beforeDispatch(repeated).code,'DURABLE_PREVIOUS_OUTCOME_UNKNOWN');
  const finalizer={...job('split_screen_session_finish'),id:'finish-one'};
  hooks.capture(finalizer,finish());
  assert.equal(hooks.beforeDispatch(finalizer).allowed,true);
  const retried={...job('split_screen_session_finish'),id:'finish-again'};
  hooks.capture(retried,{...finish(),reason:'repeated'});
  assert.equal(hooks.beforeDispatch(retried).code,'DURABLE_PREVIOUS_OUTCOME_UNKNOWN');
  const other={...job('split_screen_session_save_analysis'),id:'other'};
  hooks.capture(other,{...save(),contextId:'ssc_'+'f'.repeat(32)});
  assert.equal(hooks.beforeDispatch(other).allowed,true);
  const data=[file,file+'-wal'].filter(existsSync).map(p=>readFileSync(p));
  assert.ok(data.every(b=>!b.includes('DIFFERENT_SENSITIVE_TEST_TEXT')&&!b.includes(id)));
 }finally{hooks.close();rmSync(dir,{recursive:true,force:true})}
});
