import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,chmodSync,rmSync,readFileSync,writeFileSync,unlinkSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {DurableManualCircuitFence as OriginalFence}
 from '../deployment/durable-manual-circuit-fence.mjs';
import {Stage29DurableCompletionReadback}
 from './stage29-durable-completion-readback.mjs';
import {buildStage30CandidateSources}
 from './stage30-candidate-compose.mjs';
import {createStage34OriginalReceiptReader}
 from './stage34-original-receipt-reader.mjs';
import {applyStage34HostPatch,reverseStage34HostPatch}
 from './stage34-owner-runtime-patch.mjs';

const root=path.resolve(import.meta.dirname,'..');
const KEY=Buffer.alloc(32,0x34),NS='d'.repeat(64);
const digest=x=>createHash('sha256').update(x).digest('hex');
const COMMAND='Open RIGHT Chrome menu exactly once';
const now=()=>Date.now();
let hostFactory,generatedHost,stage30Files;
before(async()=>{
 stage30Files=buildStage30CandidateSources(root,{publish:true});
 const originalHost=readFileSync(stage30Files.hostPath,'utf8');
 const patched=applyStage34HostPatch(originalHost);
 assert.equal(reverseStage34HostPatch(patched),originalHost);
 generatedHost=path.join(root,'deployment/stage34-durable-native-host-candidate.mjs');
 writeFileSync(generatedHost,patched,{flag:'wx',mode:0o600});
 const mod=await import(pathToFileURL(generatedHost).href);
 hostFactory=mod.createDurableNativeHooks;
});
after(()=>{
 for(const p of [generatedHost,stage30Files?.hostPath,stage30Files?.journalPath]){
  if(p&&existsSync(p))unlinkSync(p);
 }
});
function newFixture({addon=true}={}){
 const dir=mkdtempSync(path.join(tmpdir(),'jh-stage34-'));
 chmodSync(dir,0o700);
 const file=path.join(dir,'manual-circuit.sqlite');
 const journal=new OriginalFence({file,key:KEY,namespace:NS,
  mode:'EXPLICIT_ONE_TIME',verifyAuthenticatedCompletion:()=>false});
 journal.close();
 if(addon){
  const ext=new Stage29DurableCompletionReadback({file,key:KEY,namespace:NS,
    mode:'EXPLICIT_ONE_TIME_ADDON',authorizeRead:()=>false});
  ext.close();
 }
 return {file,dir,close:()=>rmSync(dir,{recursive:true,force:true})};
}
function job(){
 return {id:'job_341',type:'split_screen_session_followup',
 mcpToolName:'life_android_execute_computer_action',
 secureRequestedEffect:'REVERSIBLE_WRITE',status:'queued',
 targetDeviceId:'synthetic-phone',targetDeviceDigest:'b'.repeat(64),
 secureSessionId:'secure56-original-session',action:'CLICK',
 commandId:'1'.repeat(32),taskDigest:'c'.repeat(64),
 requestId:'2'.repeat(32),contextId:'ssc_'+'3'.repeat(32),
 targetItemRef:'item_'+'4'.repeat(16),expiresAtMs:now()+60000};
}
function ref(j){
 return {deviceId:j.targetDeviceId,deviceDigest:j.targetDeviceDigest,
 secureSessionId:j.secureSessionId,jobId:j.id,commandId:j.commandId,
 taskDigest:j.taskDigest,requestId:j.requestId,contextId:j.contextId,
 targetItemRef:j.targetItemRef,commandDigest:digest(COMMAND),
 expiresAtMs:j.expiresAtMs};
}
function current(j){
 // This object is constructed by a trusted internal OAuth handler from
 // the ORIGINAL active56/device map, not from a public request boolean.
 return {deviceId:j.targetDeviceId,deviceDigest:j.targetDeviceDigest,
  sessionId:'secure56-current-session-after-restart',secureBridgeVersion:56};
}
function accept(f,{result={ok:true,action:'CLICK',resultVerified:true,
 verificationScope:'UI_TRANSITION_ONLY'}}={}){
 const j=job(),host=hostFactory({file:f.file,key:KEY,namespace:NS,mode:'read'});
 host.capture(j,{contextId:j.contextId,requestId:j.requestId,
  action:'CLICK',command:COMMAND,targetItemRef:j.targetItemRef});
 assert.equal(host.beforeDispatch(j).allowed,true);
 j.status='in_progress';
 assert.equal(host.acceptedCompletion(j,result).allowed,true);
 host.close();
 return j;
}

test('stage34 source preserves exact original Stage30 host code reversibly',()=>{
 const oldHost=readFileSync(stage30Files.hostPath,'utf8');
 const patched=readFileSync(generatedHost,'utf8');
 assert.equal(reverseStage34HostPatch(patched),oldHost);
 assert.equal(patched.includes('readOriginalReceipt('),true);
 assert.equal(patched.includes('stage30ReceiptWriter:stage30Writer.append'),true);
 assert.equal(patched.includes('autoReplay:true'),false);
 assert.throws(()=>applyStage34HostPatch(patched),/STAGE34_/);
});

test('missing original Stage29 addon blocks server host before a device action',()=>{
 const f=newFixture({addon:false});
 try{
  assert.throws(()=>hostFactory({file:f.file,key:KEY,namespace:NS,mode:'read'}),
   /STAGE29_RECEIPT_SCHEMA_OR_OWNER_MISMATCH|no such table/i);
  const journal=new OriginalFence({file:f.file,key:KEY,namespace:NS,
   mode:'read',verifyAuthenticatedCompletion:()=>false});
  assert.equal(journal.counts().uncertain,0);
  journal.close();
 }finally{f.close()}
});

test('authenticated original signed receipt recovers after host restart, with zero CLICK replay',()=>{
 const f=newFixture();
 try{
  const j=accept(f);
  const newHost=hostFactory({file:f.file,key:KEY,namespace:NS,mode:'read'});
  const proof=newHost.readOriginalReceipt(ref(j),current(j));
  assert.equal(proof.ok,true);
  assert.equal(proof.code,'STAGE34_ORIGINAL_DEVICE_RESULT_RECEIVED');
  assert.equal(proof.resultReceived,true);
  assert.equal(proof.taskSuccessVerified,false);
  assert.equal(proof.uiTransitionVerified,false);
  assert.equal(proof.originalJobReexecuted,false);
  assert.equal(proof.newJobCreated,false);
  assert.equal(proof.replayAllowed,false);
  assert.equal(proof.originalSessionRebound,false);
  newHost.close();
  const db=new DatabaseSync(f.file,{readOnly:true});
  assert.equal(db.prepare('SELECT COUNT(*) n FROM circuit_actions').get().n,1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM stage29_received_results').get().n,1);
  db.close();
 }finally{f.close()}
});

test('different authenticated device, unsigned session or missing host status is rejected',()=>{
 const f=newFixture();
 try{
  const j=accept(f),host=hostFactory({file:f.file,key:KEY,namespace:NS,mode:'read'});
  for(const changed of [
   {...current(j),deviceId:'other-phone'},
   {...current(j),deviceDigest:'e'.repeat(64)},
   {...current(j),secureBridgeVersion:55},
   {...current(j),sessionId:''},
   null
  ]){
   const out=host.readOriginalReceipt(ref(j),changed);
   assert.equal(out.ok,false);
   assert.equal(out.resultReceived,false);
   assert.equal(out.automaticReplay,false);
  }
  host.close();
 }finally{f.close()}
});

test('reference is original scoped; changed task/job/session/command and bogus grant never work',()=>{
 const f=newFixture();
 try{
  const j=accept(f),host=hostFactory({file:f.file,key:KEY,namespace:NS,mode:'read'});
  for(const [k,v] of [
   ['jobId','job_342'],['secureSessionId','other-session'],
   ['commandId','e'.repeat(32)],['requestId','f'.repeat(32)],
   ['taskDigest','e'.repeat(64)],['targetItemRef','item_'+'e'.repeat(16)],
   ['commandDigest',digest('other command')],
   ['expiresAtMs',j.expiresAtMs+1]
  ]){
   const out=host.readOriginalReceipt({...ref(j),[k]:v},current(j));
   assert.equal(out.ok,false,k);
   assert.equal(out.replayAllowed,false,k);
  }
  const injected={...ref(j),approved:true};
  assert.equal(host.readOriginalReceipt(injected,current(j)).ok,false);
  host.close();
 }finally{f.close()}
});

test('different current OAuth principal cannot bypass explicit owner authorization',()=>{
 const f=newFixture();
 try{
  const j=accept(f);
  const principal=Object.freeze({});
  const r=createStage34OriginalReceiptReader({
   file:f.file,key:KEY,namespace:NS,
   authorizeCurrentOwner:(binding,caller)=>caller===principal
  });
  for(const caller of [null,undefined,{authenticated:true},{approved:true}]){
   const denied=r.read({reference:ref(j),principal:caller});
   assert.equal(denied.ok,false);
   assert.equal(denied.code,'STAGE34_AUTHENTICATED_CURRENT_OWNER_DEVICE_REQUIRED');
  }
  assert.equal(r.read({reference:ref(j),principal}).ok,true);
  r.close();
 }finally{f.close()}
});

test('expired original receipt remains UNKNOWN even with new active current session',()=>{
 const f=newFixture();
 try{
  const j=accept(f),trusted=Object.freeze({});
  const reader=createStage34OriginalReceiptReader({
   file:f.file,key:KEY,namespace:NS,clock:()=>j.expiresAtMs+1,
   authorizeCurrentOwner:(binding,p)=>p===trusted
  });
  const out=reader.read({reference:ref(j),principal:trusted});
  assert.equal(out.code,'STAGE34_ORIGINAL_RECEIPT_EXPIRED');
  assert.equal(out.resultReceived,false);
  assert.equal(out.replayAllowed,false);
  reader.close();
 }finally{f.close()}
});

test('old original journal receipt without atomic Stage29 row cannot be backfilled by status',()=>{
 const f=newFixture();
 try{
  const orig=new OriginalFence({file:f.file,key:KEY,namespace:NS,
   mode:'read',verifyAuthenticatedCompletion:()=>true});
  const j=job();
  const reserve=orig.reserveDispatch({deviceId:j.targetDeviceId,
   type:j.type,payload:{contextId:j.contextId,requestId:j.requestId,
    action:'CLICK',targetItemRef:j.targetItemRef,commandDigest:digest(COMMAND)}});
  orig.recordAuthenticatedDeviceResult({recordId:reserve.recordId,
   resultDigest:digest('historical'),hostEvidence:{}});
  orig.close();
  const host=hostFactory({file:f.file,key:KEY,namespace:NS,mode:'read'});
  const status=host.readOriginalReceipt(ref(j),current(j));
  assert.equal(status.ok,false);
  assert.equal(status.code,'STAGE34_ORIGINAL_RECEIPT_NOT_FOUND');
  host.close();
 }finally{f.close()}
});

test('Stage34 original file integrity and namespace checks reject wrong owner keys',()=>{
 const f=newFixture();
 try{
  assert.throws(()=>createStage34OriginalReceiptReader({
    file:f.file,key:Buffer.alloc(32,0x35),namespace:NS,authorizeCurrentOwner:()=>true
  }),/OWNER_JOURNAL_BINDING_MISMATCH/);
  assert.throws(()=>createStage34OriginalReceiptReader({
    file:f.file,key:KEY,namespace:'e'.repeat(64),authorizeCurrentOwner:()=>true
  }),/OWNER_JOURNAL_BINDING_MISMATCH/);
 }finally{f.close()}
});

test('Stage34 read-only query never mutates signed original journal or old action rows',()=>{
 const f=newFixture();
 try{
  const j=accept(f),host=hostFactory({file:f.file,key:KEY,namespace:NS,mode:'read'});
  const orig=new DatabaseSync(f.file,{readOnly:true});
  const before=orig.prepare('SELECT record_id,status,operation_hmac,result_hmac,completed_ms FROM circuit_actions').all();
  orig.close();
  for(let i=0;i<4;i++){
   assert.equal(host.readOriginalReceipt(ref(j),current(j)).ok,true);
  }
  host.close();
  const afterDB=new DatabaseSync(f.file,{readOnly:true});
  const after=afterDB.prepare('SELECT record_id,status,operation_hmac,result_hmac,completed_ms FROM circuit_actions').all();
  assert.deepEqual(after,before);
  assert.equal(afterDB.prepare('SELECT COUNT(*) n FROM stage29_received_results').get().n,1);
  afterDB.close();
 }finally{f.close()}
});
