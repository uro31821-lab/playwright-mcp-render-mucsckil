import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,rmSync,readFileSync,unlinkSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {Stage29DurableCompletionReadback} from './stage29-durable-completion-readback.mjs';
import {DurableManualCircuitFence as OriginalFence}
 from '../deployment/durable-manual-circuit-fence.mjs';
import {
 stage30BindingForOriginalJob,stage30OwnerScopeDigest,
 createStage30AtomicReceiptWriter
} from './stage30-atomic-receipt-writer.mjs';
import {
 buildStage30CandidateSources,
 applyStage30JournalCandidate,reverseStage30JournalCandidate,
 applyStage30HostCandidate,reverseStage30HostCandidate,
 applyStage30ServerRuntimeCandidate,reverseStage30ServerRuntimeCandidate
} from './stage30-candidate-compose.mjs';

const root=resolve(import.meta.dirname,'..');
const namespace='d'.repeat(64),KEY=Buffer.alloc(32,0x29);
const t0=1793508400000;
const sha=text=>createHash('sha256').update(text).digest('hex');
const command='Open Chrome overflow menu once in RIGHT work window';
const payloadFor=job=>({
 contextId:job.contextId,requestId:job.requestId,action:'CLICK',
 targetItemRef:job.targetItemRef,command
});
const identityFor=job=>({
 contextId:job.contextId,requestId:job.requestId,action:'CLICK',
 targetItemRef:job.targetItemRef,commandDigest:sha(command)
});
const makeJob=(now=t0)=>({
 id:'job_301',type:'split_screen_session_followup',
 mcpToolName:'life_android_execute_computer_action',
 secureRequestedEffect:'REVERSIBLE_WRITE',
 action:'CLICK',targetDeviceId:'synthetic-phone',
 targetDeviceDigest:'b'.repeat(64),secureSessionId:'secure56_fixture_session',
 commandId:'1'.repeat(32),taskDigest:'c'.repeat(64),
 requestId:'2'.repeat(32),contextId:'ssc_'+'3'.repeat(32),
 targetItemRef:'item_'+'4'.repeat(16),expiresAtMs:now+60000,
 status:'queued'
});
const result={ok:true,action:'CLICK',resultVerified:true,
 verificationScope:'UI_TRANSITION_ONLY',actionReplayed:false};
let candidateJournal,candidateHost,files;
before(async()=>{
 files=buildStage30CandidateSources(root,{publish:true});
 candidateJournal=(await import(pathToFileURL(files.journalPath).href)).DurableManualCircuitFence;
 candidateHost=(await import(pathToFileURL(files.hostPath).href)).createDurableNativeHooks;
});
after(()=>{
 if(files){
  for(const p of [files.hostPath,files.journalPath])if(existsSync(p))unlinkSync(p);
 }
});
function init(clock=()=>t0,addon=true){
 const dir=mkdtempSync(join(tmpdir(),'jh-stage30-'));
 const file=join(dir,'manual-circuit.sqlite');
 const original=new OriginalFence({file,key:KEY,namespace,clock,
  mode:'EXPLICIT_ONE_TIME',verifyAuthenticatedCompletion:()=>false});
 original.close();
 if(addon){
  const mig=new Stage29DurableCompletionReadback({file,key:KEY,namespace,
   mode:'EXPLICIT_ONE_TIME_ADDON',clock,authorizeRead:()=>false});
  mig.close();
 }
 const cleanup=()=>rmSync(dir,{recursive:true,force:true});
 return {file,dir,clock,cleanup};
}
function openRead(f,principal){
 return new Stage29DurableCompletionReadback({file:f.file,key:KEY,namespace,
  mode:'read',clock:f.clock,authorizeRead:(b,p)=>p===principal});
}
function createHost(f){
 return candidateHost({file:f.file,key:KEY,namespace,mode:'read'});
}
function currentJournal(f){
 return new OriginalFence({file:f.file,key:KEY,namespace,mode:'read',
  clock:f.clock,verifyAuthenticatedCompletion:()=>false});
}
function runHostOnce(f,job=makeJob(f.clock()),value=result){
 const host=createHost(f);
 host.capture(job,payloadFor(job));
 assert.deepEqual(host.beforeDispatch(job),{allowed:true});
 job.status='in_progress';
 const accepted=host.acceptedCompletion(job,value);
 host.close();
 return accepted;
}

test('source composition: journal/host patches reversible and originals untouched',()=>{
 const oldJournal=readFileSync(join(root,'deployment/durable-manual-circuit-fence.mjs'),'utf8');
 const oldHost=readFileSync(join(root,'deployment/durable-native-host.mjs'),'utf8');
 const alteredJournal=readFileSync(files.journalPath,'utf8');
 const alteredHost=readFileSync(files.hostPath,'utf8');
 assert.equal(reverseStage30JournalCandidate(alteredJournal),oldJournal);
 assert.equal(reverseStage30HostCandidate(alteredHost),oldHost);
 assert.equal(files.originalJournalSha,sha(oldJournal));
 assert.equal(files.originalHostSha,sha(oldHost));
 assert.equal(files.journalSha,sha(alteredJournal));
 assert.equal(files.hostSha,sha(alteredHost));
 assert.equal(alteredJournal.includes('this.#stage30Write({db:this.#db,'),true);
 assert.equal(alteredHost.includes('originalJobReexecuted:true'),false);
 assert.throws(()=>applyStage30JournalCandidate(alteredJournal));
 assert.throws(()=>applyStage30HostCandidate(alteredHost));
});

test('source-only operator import requires original Stage26 signed HMAC + nonce before host',()=>{
 const sample=[
  'import {createDurableNativeHooks} from "../deployment/durable-native-host.mjs";',
  'if(!a||sid!==j.secureSessionId){return}',
  'const stage26Ack56=decideExactSignedCompletionAck56(j,stage26RawDigest56);',
  'durableNativeHooks56?.acceptedCompletion(j,body.result);',
  'jhSplitFollowupReceipts56.read('
 ].join('\n');
 const patched=applyStage30ServerRuntimeCandidate(sample);
 assert.equal(reverseStage30ServerRuntimeCandidate(patched),sample);
 assert.ok(patched.includes('stage30-durable-native-host-candidate.mjs'));
 assert.throws(()=>applyStage30ServerRuntimeCandidate(patched));
 assert.throws(()=>applyStage30ServerRuntimeCandidate(sample.replace('if(!a||sid!==j.secureSessionId','if(false')));
 assert.throws(()=>applyStage30ServerRuntimeCandidate(sample.replace('stage26Ack56','stage26SignedAckRemoved')));
});

test('without one-time original owner Stage29 migration, candidate host fails BEFORE dispatch',()=>{
 const f=init(()=>t0,false);
 try{
  assert.throws(()=>createHost(f),/STAGE29_RECEIPT_SCHEMA_OR_OWNER_MISMATCH|no such table/i);
  const j=currentJournal(f);
  assert.deepEqual(j.counts(),{uncertain:0,received:0,automaticRetryAllowed:false});
  j.close();
 }finally{f.cleanup()}
});

test('original host signed completion, single SQLite commit of both, restart read receives only status',()=>{
 const now=Date.now();
 const f=init(()=>now);
 try{
  const job=makeJob(now);
  assert.deepEqual(runHostOnce(f,job),{allowed:true});
  const j=currentJournal(f);
  assert.equal(j.counts().received,1);
  assert.equal(j.counts().uncertain,0);
  j.close();
  const principal=Object.freeze({current:true});
  const reader=openRead(f,principal);
  const binding=stage30BindingForOriginalJob(job,identityFor(job),namespace);
  assert.equal(binding.ownerDigest,stage30OwnerScopeDigest(namespace));
  const read=reader.read({binding,principal});
  assert.equal(read.ok,true);
  assert.equal(read.resultReceived,true);
  assert.equal(read.taskSuccessVerified,false);
  assert.equal(read.uiTransitionVerified,false);
  assert.equal(read.originalJobReexecuted,false);
  assert.equal(read.replayAllowed,false);
  assert.equal(reader.read({binding,principal:{current:true}}).ok,false);
  reader.close();
  const raw=readFileSync(f.file,'utf8');
  for(const secret of [job.id,job.secureSessionId,job.targetDeviceId,
    command,'screenDigest','grantToken'])
    assert.equal(raw.includes(secret),false,'no persisted raw sensitive metadata');
 }finally{f.cleanup()}
});

test('original foreign-session or device mutation cannot force a second result or new CLICK',()=>{
 const now=Date.now();
 const f=init(()=>now);
 try{
  const host=createHost(f);
  const job=makeJob(now);
  host.capture(job,payloadFor(job));
  assert.equal(host.beforeDispatch(job).allowed,true);
  job.status='in_progress';
  job.targetDeviceDigest='f'.repeat(64);
  const denied=host.acceptedCompletion(job,result);
  assert.equal(denied.allowed,false);
  host.close();
  const j=currentJournal(f);
  assert.equal(j.counts().uncertain,1);
  assert.equal(j.counts().received,0);
  j.close();
 }finally{f.cleanup()}
});

test('a mismatched original result digest rolls back original result and Stage29 insert together',()=>{
 const f=init();
 try{
  const writer=createStage30AtomicReceiptWriter({file:f.file,key:KEY,namespace});
  const journal=new candidateJournal({file:f.file,key:KEY,namespace,mode:'read',
   clock:f.clock,verifyAuthenticatedCompletion:()=>true,
   stage30ReceiptWriter:writer.append});
  const job=makeJob();
  const receipt=journal.reserveDispatch({deviceId:job.targetDeviceId,
   type:job.type,payload:identityFor(job)});
  assert.equal(receipt.allowed,true);
  job.status='in_progress';
  const digest=sha(JSON.stringify([job.id,job.secureSessionId,result]));
  assert.throws(()=>journal.recordAuthenticatedDeviceResult({
   recordId:receipt.recordId,resultDigest:digest,hostEvidence:{},
   stage30Original:{job,identityPayload:identityFor(job),
    result:{ok:false,action:'CLICK'}}}),/STAGE30_ORIGINAL_RESULT_DIGEST_MISMATCH/);
  assert.equal(journal.counts().uncertain,1);
  assert.equal(journal.counts().received,0);
  journal.close();writer.close();
  const rb=openRead(f,Object.freeze({}));
  assert.equal(rb.read({binding:stage30BindingForOriginalJob(job,identityFor(job),namespace),
   principal:null}).ok,false);
  rb.close();
 }finally{f.cleanup()}
});

test('synthetic process exits before SQLite COMMIT: no partial received result or receipt',()=>{
 for(const mode of ['after_original_update','after_stage30_insert']){
  const f=init();
  try{
   const sub=spawnSync(process.execPath,
    [new URL('./stage30-crash-worker.mjs',import.meta.url).pathname,f.file,mode],{
     encoding:'utf8',timeout:12000
    });
   assert.equal(sub.status,mode==='after_original_update'?81:82,
    'crash marker '+mode+': '+sub.stderr);
   const j=currentJournal(f);
   assert.equal(j.counts().uncertain,1);
   assert.equal(j.counts().received,0);
   j.close();
   const reader=openRead(f,Object.freeze({}));
   const binding=stage30BindingForOriginalJob(makeJob(),identityFor(makeJob()),namespace);
   const row=reader.read({binding,principal:null});
   assert.equal(row.ok,false);
   reader.close();
  }finally{f.cleanup()}
 }
});

test('synthetic process exits AFTER COMMIT: both receipts survive separate process',()=>{
 const f=init();
 try{
  const sub=spawnSync(process.execPath,
   [new URL('./stage30-crash-worker.mjs',import.meta.url).pathname,f.file,'after_commit'],{
    encoding:'utf8',timeout:12000
   });
  assert.equal(sub.status,83,'postcommit exit: '+sub.stderr);
  const j=currentJournal(f);
  assert.equal(j.counts().uncertain,0);assert.equal(j.counts().received,1);
  j.close();
  const principal=Object.freeze({read:true});
  const reader=openRead(f,principal);
  const bind=stage30BindingForOriginalJob(makeJob(),identityFor(makeJob()),namespace);
  assert.equal(reader.read({binding:bind,principal}).ok,true);
  reader.close();
 }finally{f.cleanup()}
});

test('no API, session, OAuth or Android executor is added by Stage30',()=>{
 const s=readFileSync(new URL('./stage30-atomic-receipt-writer.mjs',import.meta.url),'utf8');
 const patch=readFileSync(new URL('./stage30-candidate-compose.mjs',import.meta.url),'utf8');
 for(const p of ['registerOAuthTool(','httpServer.listen(','executeRightPane(',
  'localGrantApproved = true'])assert.equal(s.includes(p),false);
 assert.equal(patch.includes('stage30-durable-native-host-candidate.mjs'),true);
 assert.equal(patch.includes('no-replay-auto-retry'),false);
});
