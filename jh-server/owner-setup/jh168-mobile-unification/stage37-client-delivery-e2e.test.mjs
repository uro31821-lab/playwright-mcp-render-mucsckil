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


/*
 * Stage37 adds only the RECEIVING MCP client boundary to the already verified
 * original Stage36 tests. It DOES NOT create any production client storage.
 * Text envelope mirrors the original jh-server/server.mjs textResult contract.
 */
const mcpTextResult=v=>({content:[{type:'text',text:JSON.stringify(v)}]});
const originalStatusTool='life_android_original_completion_handle_status';
function clientAccept(envelope,{taskDigest,jobDigest,now=Date.now()}={}){
 if(!envelope||!Array.isArray(envelope.content)||envelope.content.length!==1||
    envelope.content[0]?.type!=='text'||typeof envelope.content[0]?.text!=='string')
  return null;
 let v;
 try{v=JSON.parse(envelope.content[0].text)}catch{return null}
 if(v?.ok!==true||v?.resultVerified!==true||v?.executed!==true||
    v?.duplicate===true||v?.automaticReplay!==false||
    v?.taskDigest!==taskDigest||v?.jobDigest!==jobDigest)return null;
 const h=v.originalReceiptHandoff;
 if(!h||typeof h.sealed_handle!=='string'||
    !/^s35_v1_[A-Za-z0-9_-]{40,1790}$/.test(h.sealed_handle)||
    !Number.isSafeInteger(h.expires_at_ms)||h.expires_at_ms<=now||
    h.read_tool!==originalStatusTool||
    h.receipt_scope!=='ORIGINAL_SIGNED_DEVICE_RESULT_RECEIVED'||
    h.ui_transition_verified_by_handle!==false||
    h.task_success_verified_by_handle!==false||
    h.new_job_created!==false||h.original_job_reexecuted!==false||
    h.automatic_replay!==false)return null;
 return {sealedHandle:h.sealed_handle,expiresAtMs:h.expires_at_ms,
  readTool:h.read_tool};
}
function stageAndDeliver(host,j,extra={}){
 const stage36=createStage36InlineOriginalHandoff();
 const response={...result,jobDigest:'original-job-sha',taskDigest:j.taskDigest};
 assert.equal(stage36.stage({receipt:response,deviceResult:result,scope:scope(j),
  issue:()=>host.issueOriginalReceiptHandle(j,observed(j))}),true);
 const proof={verified:true,executed:true,duplicate:false,...extra};
 const item=stage36.finish({receipt:response,verified:proof});
 const final={...response,ok:true,resultVerified:proof.verified,
  executed:proof.executed,duplicate:proof.duplicate,automaticReplay:false,
  ...(item?{originalReceiptHandoff:item}:{})};
 return mcpTextResult(final);
}

test('Stage37 real owner SQLite -> Stage35/36 protected response -> MCP text -> same client -> NEW host signed read-only',()=>{
 const f=fixture();
 try{
  const {host,j}=accepted(f);
  const envelope=stageAndDeliver(host,j);
  const binding={taskDigest:j.taskDigest,jobDigest:'original-job-sha'};
  const client=clientAccept(envelope,binding);
  assert.ok(client);
  assert.equal(client.readTool,originalStatusTool);
  const receivedBody=envelope.content[0].text;
  for(const secret of [j.id,j.secureSessionId,j.commandId,j.targetDeviceId])
   assert.equal(receivedBody.includes(secret),false,'unsealed identity leaked');
  host.close();
  const next=makeHost({file:f.file,key:KEY,namespace:NS,mode:'read'});
  const response=next.readOriginalReceiptHandle(client.sealedHandle,{
   ...observed(j),sessionId:'new-current-authorized-session'
  });
  assert.equal(response.ok,true);
  assert.equal(response.resultReceived,true);
  assert.equal(response.taskSuccessVerified,false);
  assert.equal(response.uiTransitionVerified,false);
  assert.equal(response.originalJobReexecuted,false);
  assert.equal(response.newJobCreated,false);
  assert.equal(response.automaticReplay,false);
  next.close();
  const db=new DatabaseSync(f.file,{readOnly:true});
  assert.equal(db.prepare('SELECT COUNT(*) n FROM circuit_actions').get().n,1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM stage29_received_results').get().n,1);
  db.close();
 }finally{f.close()}
});

test('Stage37 original completion response is LOST: no client handle can be recovered, no click replay',()=>{
 const f=fixture();
 try{
  const {host,j}=accepted(f);
  const generated=stageAndDeliver(host,j);
  assert.ok(clientAccept(generated,{taskDigest:j.taskDigest,jobDigest:'original-job-sha'}));
  const droppedEnvelope=null;
  assert.equal(clientAccept(droppedEnvelope,{taskDigest:j.taskDigest,jobDigest:'original-job-sha'}),null);
  host.close();
  const next=makeHost({file:f.file,key:KEY,namespace:NS,mode:'read'});
  const refused=next.readOriginalReceiptHandle(undefined,{
   ...observed(j),sessionId:'new-current-authorized-session'
  });
  assert.equal(refused.ok,false);
  assert.notEqual(refused.resultReceived,true);
  assert.equal(refused.automaticReplay,false);
  next.close();
  const db=new DatabaseSync(f.file,{readOnly:true});
  assert.equal(db.prepare('SELECT COUNT(*) n FROM circuit_actions').get().n,1);
  db.close();
 }finally{f.close()}
});

test('Stage37 client rejects wrong task, wrong original job, expired reference or malformed text envelope',()=>{
 const f=fixture();
 try{
  const {host,j}=accepted(f);
  const envelope=stageAndDeliver(host,j);
  const correct={taskDigest:j.taskDigest,jobDigest:'original-job-sha'};
  assert.ok(clientAccept(envelope,correct));
  assert.equal(clientAccept(envelope,{...correct,taskDigest:'d'.repeat(64)}),null);
  assert.equal(clientAccept(envelope,{...correct,jobDigest:'other-job'}),null);
  assert.equal(clientAccept(envelope,{...correct,now:j.expiresAtMs+1}),null);
  assert.equal(clientAccept({content:[{type:'text',text:'truncated'}]},correct),null);
  assert.equal(clientAccept({content:[...envelope.content,...envelope.content]},correct),null);
  assert.equal(clientAccept({content:[{type:'image',data:'test'}]},correct),null);
  host.close();
 }finally{f.close()}
});

test('Stage37 protected screen verification failure, failed dispatch or duplicate never passes a sealed handle',()=>{
 for(const state of [{verified:false},{executed:false},{duplicate:true}]){
  const f=fixture();
  try{
   const {host,j}=accepted(f);
   const envelope=stageAndDeliver(host,j,state);
   const token=clientAccept(envelope,{taskDigest:j.taskDigest,jobDigest:'original-job-sha'});
   assert.equal(token,null,JSON.stringify(state));
   assert.equal(JSON.parse(envelope.content[0].text).originalReceiptHandoff,undefined);
   host.close();
  }finally{f.close()}
 }
});

test('Stage37 client-handoff test never creates a durable ChatGPT token store or fake phone action',()=>{
 const raw=readFileSync(new URL('./stage36-inline-original-handoff.mjs',import.meta.url),'utf8');
 assert.ok(raw.includes('WeakMap'));
 assert.ok(raw.includes('WeakSet'));
 assert.ok(!raw.includes('writeFileSync('));
 assert.ok(!raw.includes('localStorage'));
 assert.ok(!raw.includes('BEGIN_COMMAND'));
 const originalServer=readFileSync(path.join(root,'../../server.mjs'),'utf8');
 assert.ok(originalServer.includes('function textResult(v){'));
 assert.ok(originalServer.includes('content:[{type:"text",text:typeof v==="string"?v:JSON.stringify(v)}]'));
});
