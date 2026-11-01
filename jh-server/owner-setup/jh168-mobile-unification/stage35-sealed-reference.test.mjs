import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdtempSync,chmodSync,rmSync,readFileSync,writeFileSync,existsSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {DurableManualCircuitFence as OriginalFence}
 from '../deployment/durable-manual-circuit-fence.mjs';
import {Stage29DurableCompletionReadback} from './stage29-durable-completion-readback.mjs';
import {createStage35OriginalReferenceHandoff} from './stage35-sealed-reference.mjs';
import {buildStage30CandidateSources} from './stage30-candidate-compose.mjs';
import {applyStage34HostPatch,reverseStage34HostPatch} from './stage34-owner-runtime-patch.mjs';
import {applyStage35HostPatch,reverseStage35HostPatch} from './stage35-sealed-handoff-patch.mjs';

const root=path.resolve(import.meta.dirname,'..');
const KEY=Buffer.alloc(32,0x35),NS='d'.repeat(64);
const sha=x=>createHash('sha256').update(x).digest('hex');
const COMMAND='Stage35 signed original CLICK only';
const result={ok:true,action:'CLICK',resultVerified:true,
 verificationScope:'UI_TRANSITION_ONLY',actionReplayed:false};
let stage30files,stage34host,stage35host,createHost;
before(async()=>{
 stage30files=buildStage30CandidateSources(root,{publish:true});
 const base=readFileSync(stage30files.hostPath,'utf8');
 const s34=applyStage34HostPatch(base);
 assert.equal(reverseStage34HostPatch(s34),base);
 stage34host=path.join(root,'deployment/stage34-durable-native-host-candidate.mjs');
 writeFileSync(stage34host,s34,{encoding:'utf8',flag:'wx',mode:0o600});
 const s35=applyStage35HostPatch(s34);
 assert.equal(reverseStage35HostPatch(s35),s34);
 stage35host=path.join(root,'deployment/stage35-durable-native-host-candidate.mjs');
 writeFileSync(stage35host,s35,{encoding:'utf8',flag:'wx',mode:0o600});
 createHost=(await import(pathToFileURL(stage35host).href)).createDurableNativeHooks;
});
after(()=>{
 for(const f of [stage35host,stage34host,stage30files?.hostPath,stage30files?.journalPath])
  if(f&&existsSync(f))unlinkSync(f);
});
function fixture(){
 const dir=mkdtempSync(path.join(tmpdir(),'jh-stage35-'));
 chmodSync(dir,0o700);
 const file=path.join(dir,'manual-circuit.sqlite');
 const j=new OriginalFence({file,key:KEY,namespace:NS,
  mode:'EXPLICIT_ONE_TIME',verifyAuthenticatedCompletion:()=>false});
 j.close();
 const add=new Stage29DurableCompletionReadback({file,key:KEY,namespace:NS,
  mode:'EXPLICIT_ONE_TIME_ADDON',authorizeRead:()=>false});
 add.close();
 return {file,close:()=>rmSync(dir,{recursive:true,force:true})};
}
function job(){
 return {
  id:'job_351',type:'split_screen_session_followup',
  mcpToolName:'life_android_execute_computer_action',
  secureRequestedEffect:'REVERSIBLE_WRITE',status:'queued',
  action:'CLICK',targetDeviceId:'synthetic-owner-phone',
  targetDeviceDigest:'b'.repeat(64),
  secureSessionId:'secure56-original-session',
  commandId:'1'.repeat(32),taskDigest:'c'.repeat(64),
  requestId:'2'.repeat(32),contextId:'ssc_'+'3'.repeat(32),
  targetItemRef:'item_'+'4'.repeat(16),
  expiresAtMs:Date.now()+60000
 };
}
const payload=j=>({
 contextId:j.contextId,requestId:j.requestId,action:'CLICK',
 targetItemRef:j.targetItemRef,command:COMMAND
});
const originalReference=j=>({
 deviceId:j.targetDeviceId,deviceDigest:j.targetDeviceDigest,
 secureSessionId:j.secureSessionId,jobId:j.id,commandId:j.commandId,
 taskDigest:j.taskDigest,requestId:j.requestId,contextId:j.contextId,
 targetItemRef:j.targetItemRef,commandDigest:sha(COMMAND),
 expiresAtMs:j.expiresAtMs
});
const signed=(j,session=j.secureSessionId)=>({
 deviceId:j.targetDeviceId,deviceDigest:j.targetDeviceDigest,
 sessionId:session,secureBridgeVersion:56,commandId:j.commandId
});
function accept(f){
 const j=job(),host=createHost({file:f.file,key:KEY,namespace:NS,mode:'read'});
 host.capture(j,payload(j));
 assert.equal(host.beforeDispatch(j).allowed,true);
 j.status='in_progress';
 assert.equal(host.acceptedCompletion(j,result).allowed,true);
 j.status='complete';
 return {job:j,host};
}
test('Stage35 patches exact candidate host and reverses without original runtime drift',()=>{
 const s34=readFileSync(stage34host,'utf8');
 const s35=readFileSync(stage35host,'utf8');
 assert.equal(reverseStage35HostPatch(s35),s34);
 assert.ok(s35.includes('stage30ReceiptWriter:stage30Writer.append'));
 assert.ok(s35.includes('readOriginalReceiptHandle('));
 assert.ok(s35.includes('issueOriginalReceiptHandle('));
 assert.ok(!s35.includes('automaticReplayAllowed:true'));
 assert.throws(()=>applyStage35HostPatch(s35),/STAGE35_/);
});
test('original verified result -> opaque handle; different host after restart -> original result only',()=>{
 const f=fixture();
 try{
  const {job:j,host}=accept(f);
  const issued=host.issueOriginalReceiptHandle(j,signed(j));
  assert.equal(issued.ok,true);
  assert.equal(issued.sealedHandleIssued,true);
  assert.match(issued.sealedHandle,/^s35_v1_[A-Za-z0-9_-]+$/);
  assert.equal(issued.expiresAtMs,j.expiresAtMs);
  assert.equal(issued.expiresAtNotExtended,true);
  for(const raw of [j.id,j.secureSessionId,j.targetDeviceId,COMMAND,j.commandId])
   assert.equal(issued.sealedHandle.includes(raw),false,'cleartext reference leaked');
  host.close();
  const restarted=createHost({file:f.file,key:KEY,namespace:NS,mode:'read'});
  const recovered=restarted.readOriginalReceiptHandle(issued.sealedHandle,
   signed(j,'secure56-rotated-current-session'));
  assert.equal(recovered.ok,true);
  assert.equal(recovered.code,'STAGE35_ORIGINAL_RECEIPT_READ_BY_SEALED_HANDLE');
  assert.equal(recovered.resultReceived,true);
  assert.equal(recovered.taskSuccessVerified,false);
  assert.equal(recovered.uiTransitionVerified,false);
  assert.equal(recovered.originalSessionRebound,false);
  assert.equal(recovered.originalJobReexecuted,false);
  assert.equal(recovered.newJobCreated,false);
  assert.equal(recovered.replayAllowed,false);
  restarted.close();
  const db=new DatabaseSync(f.file,{readOnly:true});
  assert.equal(db.prepare('SELECT COUNT(*) n FROM circuit_actions').get().n,1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM stage29_received_results').get().n,1);
  db.close();
 }finally{f.close()}
});
test('encrypted handle cannot be issued from pending or other original job or command',()=>{
 const f=fixture();
 try{
  const j=job(),host=createHost({file:f.file,key:KEY,namespace:NS,mode:'read'});
  host.capture(j,payload(j));
  assert.equal(host.beforeDispatch(j).allowed,true);
  j.status='in_progress';
  assert.equal(host.issueOriginalReceiptHandle(j,signed(j)).ok,false);
  assert.equal(host.issueOriginalReceiptHandle(j,{...signed(j),commandId:'f'.repeat(32)}).ok,false);
  host.close();
  const original=new OriginalFence({file:f.file,key:KEY,namespace:NS,mode:'read',
    verifyAuthenticatedCompletion:()=>false});
  assert.equal(original.counts().uncertain,1);
  original.close();
 }finally{f.close()}
});
test('spoofed current signed device, changed local command and mutation cannot issue',()=>{
 const f=fixture();
 try{
  const {job:j,host}=accept(f);
  for(const obs of [
    {...signed(j),deviceId:'other-phone'},
    {...signed(j),deviceDigest:'e'.repeat(64)},
    {...signed(j),secureBridgeVersion:55},
    {...signed(j),sessionId:''},
    {...signed(j),commandId:'f'.repeat(32)}
  ]) assert.equal(host.issueOriginalReceiptHandle(j,obs).ok,false);
  j.targetDeviceDigest='e'.repeat(64);
  assert.equal(host.issueOriginalReceiptHandle(j,signed(j)).ok,false);
  host.close();
 }finally{f.close()}
});
test('valid sealed handle does not grant another device, wrong owner or unsigned session',()=>{
 const f=fixture();
 try{
  const {job:j,host}=accept(f);
  const issued=host.issueOriginalReceiptHandle(j,signed(j));
  assert.equal(issued.ok,true);
  host.close();
  const next=createHost({file:f.file,key:KEY,namespace:NS,mode:'read'});
  for(const obs of [
    {...signed(j),deviceId:'another-device'},
    {...signed(j),deviceDigest:'e'.repeat(64)},
    {...signed(j),secureBridgeVersion:55},
    {...signed(j),sessionId:''},
    null
  ]){
    const res=next.readOriginalReceiptHandle(issued.sealedHandle,obs);
    assert.equal(res.ok,false);
    assert.equal(res.resultReceived??false,false);
  }
  next.close();
  assert.throws(()=>createStage35OriginalReferenceHandoff({
   file:f.file,key:Buffer.alloc(32,0x36),namespace:NS,
   authorizeCurrentOwner:()=>true
  }),/OWNER_JOURNAL_BINDING_MISMATCH/);
 }finally{f.close()}
});
test('a bit-flipped or truncated AES-GCM handle remains UNKNOWN without new action',()=>{
 const f=fixture();
 try{
  const {job:j,host}=accept(f);
  const handle=host.issueOriginalReceiptHandle(j,signed(j)).sealedHandle;
  host.close();
  const next=createHost({file:f.file,key:KEY,namespace:NS,mode:'read'});
  const changed=handle.slice(0,Math.floor(handle.length/2))+
    (handle[Math.floor(handle.length/2)]==='A'?'B':'A')+
    handle.slice(Math.floor(handle.length/2)+1);
  for(const token of [changed,handle.slice(0,-5),'invalid','s35_v1__',
                       handle+'a',handle.replace(/^s35_v1_/,'s35_v2_')]){
    const res=next.readOriginalReceiptHandle(token,signed(j));
    assert.equal(res.ok,false);
    assert.equal(res.originalJobReexecuted,false);
    assert.equal(res.replayAllowed,false);
  }
  next.close();
 }finally{f.close()}
});
test('original signed expiry is not extended by sealing or a new session',()=>{
 const f=fixture();
 try{
  const {job:j,host}=accept(f);
  const handle=host.issueOriginalReceiptHandle(j,signed(j)).sealedHandle;
  host.close();
  const trusted=Object.freeze({});
  const s=createStage35OriginalReferenceHandoff({
   file:f.file,key:KEY,namespace:NS,clock:()=>j.expiresAtMs+1,
   authorizeCurrentOwner:(binding,principal)=>principal===trusted
  });
  const expired=s.read({sealedHandle:handle,principal:trusted});
  assert.equal(expired.ok,false);
  assert.equal(expired.code,'STAGE35_ORIGINAL_REFERENCE_EXPIRED');
  assert.equal(expired.replayAllowed,false);
  assert.equal(s.issue({reference:originalReference(j),principal:trusted}).ok,false);
  s.close();
 }finally{f.close()}
});
test('untrusted original-reference boolean or principal cannot obtain sealed handle',()=>{
 const f=fixture();
 try{
  const {job:j,host}=accept(f);
  host.close();
  const trusted=Object.freeze({});
  const svc=createStage35OriginalReferenceHandoff({
   file:f.file,key:KEY,namespace:NS,
   authorizeCurrentOwner:(binding,principal)=>principal===trusted
  });
  for(const p of [null,undefined,{authenticated:true},{approved:true}]){
   const denied=svc.issue({reference:originalReference(j),principal:p});
   assert.equal(denied.ok,false);
   assert.equal(denied.sealedHandleIssued,false);
  }
  const ok=svc.issue({reference:originalReference(j),principal:trusted});
  assert.equal(ok.ok,true);
  assert.equal(svc.read({sealedHandle:ok.sealedHandle,principal:{authenticated:true}}).ok,false);
  assert.equal(svc.read({sealedHandle:ok.sealedHandle,principal:trusted}).ok,true);
  svc.close();
 }finally{f.close()}
});
test('sealing needs existing Stage29 row; original-only result is insufficient',()=>{
 const f=fixture();
 try{
  const j=job(),orig=new OriginalFence({file:f.file,key:KEY,namespace:NS,
   mode:'read',verifyAuthenticatedCompletion:()=>true});
  const x=orig.reserveDispatch({deviceId:j.targetDeviceId,type:j.type,
   payload:{contextId:j.contextId,requestId:j.requestId,
    action:'CLICK',targetItemRef:j.targetItemRef,commandDigest:sha(COMMAND)}});
  assert.equal(x.allowed,true);
  orig.recordAuthenticatedDeviceResult({recordId:x.recordId,resultDigest:sha('old'),
    hostEvidence:{}});
  orig.close();
  const trusted=Object.freeze({});
  const svc=createStage35OriginalReferenceHandoff({
   file:f.file,key:KEY,namespace:NS,
   authorizeCurrentOwner:(r,p)=>p===trusted
  });
  const nope=svc.issue({reference:originalReference(j),principal:trusted});
  assert.equal(nope.ok,false);
  assert.equal(nope.sealedHandleIssued,false);
  svc.close();
 }finally{f.close()}
});
test('handle is client-carried encrypted context and private sqlite has no raw job/session',()=>{
 const f=fixture();
 try{
  const {job:j,host}=accept(f);
  const sealed=host.issueOriginalReceiptHandle(j,signed(j)).sealedHandle;
  host.close();
  const bytes=readFileSync(f.file);
  for(const privatePart of [j.id,j.secureSessionId,j.targetDeviceId,COMMAND,sealed]){
   assert.equal(bytes.includes(Buffer.from(privatePart)),false,
    'original reference or sealed handle persisted in clear');
  }
 }finally{f.close()}
});
