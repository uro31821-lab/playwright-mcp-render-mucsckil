import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {durableNativeJobPolicy as policy} from '../owner-setup/deployment/durable-native-job-policy.mjs';
import {createDurableNativeHooks} from '../owner-setup/deployment/durable-native-host.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const job=(type,tool,effect)=>({type,mcpToolName:tool,secureRequestedEffect:effect,status:'queued',secureSessionId:'synthetic-session',targetDeviceId:'synthetic-device'});
const execute=(action,extra={})=>({action,leaseToken:'synthetic-lease',waitMs:100,viewportWidth:1000,viewportHeight:1800,x:100,y:200,...extra});
const execJob=()=>job('computer_use_action_execute','life_android_execute_computer_action','MUTATION');
for(const [type,tool]of [
 ['secure_device_status','life_android_secure_status'],['computer_use_inspect','life_android_computer_inspect'],
 ['computer_use_action_prepare','life_android_computer_prepare'],['computer_use_action_approval_status','life_android_action_approval_status'],
 ['computer_use_screen_consent_status','life_android_screen_consent_status']]){
 test(type+' keeps exact read-only route',()=>{assert.equal(policy(job(type,tool,'READ_ONLY'),{}).kind,'READ');assert.equal(policy(job(type,'wrong','READ_ONLY'),{}).kind,'DENY')});
}
for(const [type,tool]of [['computer_use_action_approval_request','life_android_action_approval_request'],['computer_use_screen_consent_request','life_android_screen_consent_request']]){
 test(type+' requests consent but grants none',()=>{const p=policy(job(type,tool,'REVERSIBLE_WRITE'),{});assert.equal(p.kind,'CONTROL');assert.equal(p.approvalGranted,false);assert.equal(p.screenConsentGranted,false)});
}
test('WAIT is nonmutating but requires original execution lease',()=>{assert.equal(policy(execJob(),execute('WAIT')).kind,'READ');assert.equal(policy(execJob(),execute('WAIT',{leaseToken:''})).kind,'DENY')});
test('requested READ_ONLY cannot turn CLICK into an unjournaled operation',()=>{assert.equal(policy(execJob(),execute('CLICK',{effect:'READ_ONLY'})).kind,'JOURNAL')});
for(const action of ['CLICK','DOUBLE_CLICK','SCROLL','TYPE','KEYPRESS','DRAG','MOVE'])test(action+' is journaled',()=>assert.equal(policy(execJob(),execute(action)).kind,'JOURNAL'));
test('screenshot remains protected and never gains consent',()=>{assert.equal(policy(execJob(),execute('SCREENSHOT')).kind,'DENY');const p=policy(execJob(),execute('SCREENSHOT',{screenGrantToken:'synthetic-consent'}));assert.equal(p.kind,'PROTECTED_READ');assert.equal(p.screenConsentGranted,false)});
test('frame upload requires complete original scope',()=>{const j=job('computer_use_capture_frame','life_android_capture_work_window','READ_ONLY');assert.equal(policy(j,{}).kind,'DENY');assert.equal(policy(j,{leaseToken:'lease',screenGrantToken:'consent',frameUploadLease:'frame'}).kind,'PROTECTED_READ')});
test('unknown or secret-bearing requests fail closed',()=>{assert.equal(policy(job('unknown','unknown','READ_ONLY'),{}).kind,'DENY');assert.equal(policy(execJob(),execute('TYPE',{dataClass:'SECRET'})).kind,'DENY');assert.equal(policy(execJob(),execute('EXECUTE_SHELL')).kind,'DENY')});
test('new task, grant, lease and expiry cannot bypass unknown identical Computer Use action',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'jh-cu-policy-')),options={file:path.join(dir,'journal.sqlite'),key:Buffer.alloc(32,12),namespace:sha('synthetic-cu-owner')};
 let hooks=createDurableNativeHooks({...options,mode:'EXPLICIT_ONE_TIME'});
 try{
  const a={...execJob(),id:'job_1'},p=execute('TYPE',{textValue:'SYNTHETIC_PRIVATE_TEXT',textDigest:sha('text'),taskDigest:sha('task-1'),actionApprovalGrantToken:'grant-1',secureInvocationExpiresAt:100});
  hooks.capture(a,p);assert.equal(hooks.beforeDispatch(a).allowed,true);a.status='in_progress';hooks.close();hooks=createDurableNativeHooks(options);
  const b={...execJob(),id:'job_2'},q={...p,taskDigest:sha('task-2'),taskId:'changed',index:9,leaseToken:'lease-2',actionApprovalGrantToken:'grant-2',secureInvocationExpiresAt:9999};
  hooks.capture(b,q);assert.equal(hooks.beforeDispatch(b).code,'DURABLE_PREVIOUS_OUTCOME_UNKNOWN');
  const c={...execJob(),id:'job_3'};hooks.capture(c,{...q,x:300});assert.equal(hooks.beforeDispatch(c).allowed,true);
 }finally{hooks.close();rmSync(dir,{recursive:true,force:true})}
});
