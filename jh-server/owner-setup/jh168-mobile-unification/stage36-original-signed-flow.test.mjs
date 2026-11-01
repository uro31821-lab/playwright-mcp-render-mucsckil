import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdtempSync,chmodSync,rmSync,readFileSync,writeFileSync,unlinkSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {DurableManualCircuitFence as OriginalFence}
 from '../deployment/durable-manual-circuit-fence.mjs';
import {Stage29DurableCompletionReadback}
 from './stage29-durable-completion-readback.mjs';
import {buildStage30CandidateSources} from './stage30-candidate-compose.mjs';
import {applyStage34HostPatch} from './stage34-owner-runtime-patch.mjs';
import {applyStage35HostPatch} from './stage35-sealed-handoff-patch.mjs';
import {createStage36InlineOriginalHandoff}
 from './stage36-inline-original-handoff.mjs';

const root=path.resolve(import.meta.dirname,'..');
const KEY=Buffer.alloc(32,0x36),NS='d'.repeat(64);
const COMMAND='Original Chrome overflow menu CLICK once';
const result={ok:true,action:'CLICK',resultVerified:true,
 verificationScope:'UI_TRANSITION_ONLY',actionReplayed:false};
let stage30,stage34path,stage35path,makeHost;
before(async()=>{
 stage30=buildStage30CandidateSources(root,{publish:true});
 const source=readFileSync(stage30.hostPath,'utf8');
 const stage34=applyStage34HostPatch(source);
 stage34path=path.join(root,'deployment/stage34-durable-native-host-candidate.mjs');
 writeFileSync(stage34path,stage34,{flag:'wx',mode:0o600});
 const stage35=applyStage35HostPatch(stage34);
 stage35path=path.join(root,'deployment/stage35-durable-native-host-candidate.mjs');
 writeFileSync(stage35path,stage35,{flag:'wx',mode:0o600});
 makeHost=(await import(pathToFileURL(stage35path).href)).createDurableNativeHooks;
});
after(()=>{
 for(const p of [stage35path,stage34path,stage30?.hostPath,stage30?.journalPath])
  if(p&&existsSync(p))unlinkSync(p);
});
function fixture(){
 const dir=mkdtempSync(path.join(tmpdir(),'jh-stage36-'));
 chmodSync(dir,0o700);
 const file=path.join(dir,'manual-circuit.sqlite');
 const orig=new OriginalFence({file,key:KEY,namespace:NS,mode:'EXPLICIT_ONE_TIME',
  verifyAuthenticatedCompletion:()=>false});
 orig.close();
 const addon=new Stage29DurableCompletionReadback({file,key:KEY,namespace:NS,
  mode:'EXPLICIT_ONE_TIME_ADDON',authorizeRead:()=>false});
 addon.close();
 return {file,close:()=>rmSync(dir,{recursive:true,force:true})};
}
const origJob=()=>({
 id:'job_361',type:'split_screen_session_followup',
 mcpToolName:'life_android_execute_computer_action',
 secureRequestedEffect:'REVERSIBLE_WRITE',
 status:'queued',action:'CLICK',
 targetDeviceId:'synthetic-phone',
 targetDeviceDigest:'b'.repeat(64),secureSessionId:'signed-original-session',
 commandId:'1'.repeat(32),taskDigest:'c'.repeat(64),
 requestId:'2'.repeat(32),contextId:'ssc_'+'3'.repeat(32),
 targetItemRef:'item_'+'4'.repeat(16),expiresAtMs:Date.now()+60000
});
const payload=j=>({contextId:j.contextId,requestId:j.requestId,
 action:'CLICK',command:COMMAND,targetItemRef:j.targetItemRef});
const observed=j=>({deviceId:j.targetDeviceId,
 deviceDigest:j.targetDeviceDigest,sessionId:j.secureSessionId,
 commandId:j.commandId,secureBridgeVersion:56});
const scope=j=>({
 type:j.type,effect:j.secureRequestedEffect,tool:j.mcpToolName,
 action:j.action,originalAction:j.action,jobStatus:j.status,
 originalJobId:j.id,
 currentCommandId:j.commandId,originalCommandId:j.commandId,
 deviceId:j.targetDeviceId,originalDeviceId:j.targetDeviceId,
 deviceDigest:j.targetDeviceDigest,originalDeviceDigest:j.targetDeviceDigest,
 originalSessionId:j.secureSessionId,currentSessionId:j.secureSessionId
});
function accepted(f){
 const j=origJob(),host=makeHost({file:f.file,key:KEY,namespace:NS,mode:'read'});
 host.capture(j,payload(j));
 assert.equal(host.beforeDispatch(j).allowed,true);
 j.status='in_progress';
 assert.equal(host.acceptedCompletion(j,result).allowed,true);
 j.status='complete';
 return {host,j};
}
test('original signed result -> stage35 sealed handle -> Stage155 proof -> client-only return -> server restart',()=>{
 const f=fixture();
 try{
  const {host,j}=accepted(f);
  const bridge=createStage36InlineOriginalHandoff();
  const response={...result,jobDigest:'original-job-sha',taskDigest:j.taskDigest};
  assert.equal(bridge.stage({
   receipt:response,deviceResult:result,scope:scope(j),
   issue:()=>host.issueOriginalReceiptHandle(j,observed(j))
  }),true);
  assert.equal(Object.hasOwn(response,'sealedHandle'),false);
  const transmitted=bridge.finish({
   receipt:response,verified:{verified:true,executed:true,duplicate:false}
  });
  assert.equal(typeof transmitted.sealed_handle,'string');
  assert.equal(transmitted.automatic_replay,false);
  assert.equal(transmitted.original_job_reexecuted,false);
  assert.equal(transmitted.ui_transition_verified_by_handle,false);
  host.close();
  const fresh=makeHost({file:f.file,key:KEY,namespace:NS,mode:'read'});
  const read=fresh.readOriginalReceiptHandle(transmitted.sealed_handle,{
   ...observed(j),sessionId:'new-current-signed-session'
  });
  assert.equal(read.ok,true);
  assert.equal(read.resultReceived,true);
  assert.equal(read.taskSuccessVerified,false);
  assert.equal(read.uiTransitionVerified,false);
  assert.equal(read.originalJobReexecuted,false);
  assert.equal(read.originalSessionRebound,false);
  fresh.close();
  const db=new DatabaseSync(f.file,{readOnly:true});
  assert.equal(db.prepare('SELECT COUNT(*) n FROM circuit_actions').get().n,1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM stage29_received_results').get().n,1);
  db.close();
 }finally{f.close()}
});
test('original phone result received but Stage155 protected verification fails: no handoff or new work',()=>{
 const f=fixture();
 try{
  const {host,j}=accepted(f);
  const bridge=createStage36InlineOriginalHandoff();
  const r={...result};
  assert.equal(bridge.stage({receipt:r,deviceResult:result,scope:scope(j),
   issue:()=>host.issueOriginalReceiptHandle(j,observed(j))}),true);
  assert.equal(bridge.finish({
    receipt:r,verified:{verified:false,executed:true,duplicate:false}
  }),null);
  host.close();
  const db=new DatabaseSync(f.file,{readOnly:true});
  assert.equal(db.prepare('SELECT COUNT(*) n FROM circuit_actions').get().n,1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM stage29_received_results').get().n,1);
  db.close();
 }finally{f.close()}
});
