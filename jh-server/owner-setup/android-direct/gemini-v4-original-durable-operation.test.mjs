import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {FileDurableExecutionStore} from '../deployment/jh-result-verification/file-durable-execution-store.mjs';
import {createV4OriginalPersistentOperationLedger} from './gemini-v4-original-durable-operation.mjs';
import {createOriginalSecure56V4RightGeminiHost} from './gemini-v4-original-secure56-host.mjs';

const id='b'.repeat(32),cid='a'.repeat(32);
const payload=()=>({type:'open_url',target:'right_gemini_existing',operationId:id,commandId:cid,
 expectedWorkWindowId:32,expectedChatWindowId:31,
 expectedWorkPackage:'com.google.android.googlequicksearchbox',
 expectedChatPackage:'com.openai.chatgpt',
 expectedWorkBounds:'1100,0,2200,1800',expectedChatBounds:'0,0,1100,1800'});
const record=()=>({type:'open_url',target:'right_gemini_existing',commandId:cid,
 deviceId:'phone1',sessionId:'secure56',payload:payload(),state:'RESERVED_NO_REPLAY'});
const owner=()=>({deviceId:'phone1',sessionId:'secure56',commandId:cid});
async function inFolder(fn){
 const d=await mkdtemp(join(tmpdir(),'jh167-v4-original-'));
 try{
  const store=new FileDurableExecutionStore({directory:d,filename:'original-jh-result-execution-guard.json'});
  await store.init();
  await fn(store,d);
 }finally{await rm(d,{recursive:true,force:true})}
}
test('V4 durable port accepts ONLY an existing original FileDurableExecutionStore instance',()=>{
 assert.throws(()=>createV4OriginalPersistentOperationLedger({store:{claim:()=>true}}),
  /ORIGINAL_FILE_DURABLE_EXECUTION_STORE_REQUIRED/);
});
test('original store claims exactly one right Gemini job intent without a prompt or an approval token',async()=>{
 await inFolder(async (store)=>{
  const p=createV4OriginalPersistentOperationLedger({store});
  assert.equal(await p.claim(id,record()),true);
  assert.equal(await p.claim(id,record()),false);
  assert.equal(p.source,'ORIGINAL_JH_PERSISTENT_OPERATION_LEDGER');
  const doc=await readFile(store.filePath,'utf8');
  assert.equal(doc.includes('promptText'),false);
  assert.equal(doc.includes('approvalGrantToken'),false);
  assert.equal(doc.includes('Gemini answer'),false);
  const op=await p.lookup(id);
  assert.equal(op.jobId,null);assert.equal(op.deviceId,'phone1');
  assert.equal(await p.verify(op,id),true);
 });
});
test('real original operation attach is single-use and signed scope bounded',async()=>{
 await inFolder(async store=>{
  const p=createV4OriginalPersistentOperationLedger({store});
  await p.claim(id,record());
  assert.equal(await p.attachJob(id,'original-signed-job-1',{...owner(),deviceId:'wrong'}),false);
  assert.equal(await p.attachJob(id,'original-signed-job-1',owner()),true);
  assert.equal(await p.attachJob(id,'original-signed-job-2',owner()),false);
  const op=await p.lookup(id);
  assert.equal(op.jobId,'original-signed-job-1');
  assert.equal(await p.verify(op,id),true);
  assert.equal(await p.verify({...op,jobId:'fake'},id),false);
  assert.equal(await p.verify({...op,revision:0},id),false);
 });
});
test('old command, wrong Gemini target, or altered app identity never claims',async()=>{
 await inFolder(async store=>{
  const p=createV4OriginalPersistentOperationLedger({store});
  const checks=[
   {...record(),commandId:'x'},
   {...record(),target:'left_gemini_existing'},
   {...record(),payload:{...payload(),expectedChatPackage:'com.android.chrome'}},
   {...record(),payload:{...payload(),operationId:'c'.repeat(32)}},
   {...record(),payload:{...payload(),target:'left_gemini_existing'}},
  ];
  for(const r of checks)assert.equal(await p.claim(id,r),false);
  assert.equal(await p.lookup(id),null);
 });
});
test('same operation cannot replay across server process restart even if no phone job id was attached',async()=>{
 await inFolder(async (store,dir)=>{
  const a=createV4OriginalPersistentOperationLedger({store});
  assert.equal(await a.claim(id,record()),true);
  const reopened=new FileDurableExecutionStore({directory:dir,filename:'original-jh-result-execution-guard.json',
   instanceId:'new-server-process'});
  const b=createV4OriginalPersistentOperationLedger({store:reopened});
  assert.equal(await b.claim(id,record()),false);
  const recovered=await reopened.recoverInterrupted({force:true});
  assert.ok(Array.isArray(recovered));
  const recordNow=await b.lookup(id);
  assert.equal(recordNow.jobId,null);
  const raw=await reopened.get('JH167_V4_RIGHT_GEMINI:'+ (await import('node:crypto')).createHash('sha256').update(id).digest('hex'));
  assert.equal(raw.replayAllowed,false);
  assert.equal(raw.state,'NEEDS_REVIEW');
  assert.equal(await b.verify(recordNow,id),true);
 });
});
test('concurrent two original ledger claims dispatch at most once',async()=>{
 await inFolder(async store=>{
  const p=createV4OriginalPersistentOperationLedger({store});
  const results=await Promise.all([p.claim(id,record()),p.claim(id,record())]);
  assert.deepEqual(results.sort(),[false,true]);
 });
});
test('real disk-backed original ledger integrates with existing Secure56 right-phone binder',async()=>{
 await inFolder(async store=>{
  const originalLedger=createV4OriginalPersistentOperationLedger({store});
  const current={
   backend:'JH_ANDROID_NATIVE',secure56:true,current:true,deviceId:'phone1',
   sessionId:'secure56',commandId:cid,workSide:'RIGHT',chatSide:'LEFT',
   workPackage:'com.google.android.googlequicksearchbox',
   chatPackage:'com.openai.chatgpt',nativeGeminiWindowVerified:true,
   workWindowId:32,chatWindowId:31,workBounds:'1100,0,2200,1800',
   chatBounds:'0,0,1100,1800',observedAt:Date.now()
  };
  let count=0;const phoneJobs=new Map();
  const original={
   selectDevice:()=>current.deviceId,deviceMeta:()=>({secureBridgeVersion:56,secureActive:true,deviceDigest:'dev'}),
   activeSession:()=>({sessionId:'secure56',deviceDigest:'dev'}),
   requireCommand:()=>cid,
   makeOriginalJob:async (type,p,deviceId)=>{
    count++;const job={id:'original-job-'+count,type,status:'queued',
     targetDeviceId:deviceId,secureSessionId:'secure56',...p};
    phoneJobs.set(job.id,job);return job;
   },
   getOriginalJob:async jobId=>phoneJobs.get(jobId),
   verifyOriginalQueuedJob:async job=>job.type==='open_url'&&job.target==='right_gemini_existing',
   verifyOriginalCompletedJob:async job=>job.status==='complete'
  };
  const pane={read:()=>({...current}),verify:(o,command)=>o.commandId===command,
   capabilities:()=>({ready:true})};
  const host=createOriginalSecure56V4RightGeminiHost({
   pane,original,durable:originalLedger,enabled:true
  });
  const req={commandId:cid,operationId:id};
  assert.equal((await host.bind(req)).code,'RIGHT_GEMINI_BINDING_JOB_STARTED_READ_STATUS');
  assert.equal((await host.bind(req)).code,'ORIGINAL_OPERATION_ALREADY_RESERVED_READ_ONLY');
  assert.equal(count,1);
  const job=phoneJobs.get('original-job-1');job.status='complete';
  job.result={ok:true,code:'GEMINI_EXISTING_RIGHT_WINDOW_BOUND',
   workWindowId:32,chatWindowId:31,workPackage:current.workPackage,
   workBounds:current.workBounds,chatBounds:current.chatBounds,
   workSide:'RIGHT',chatSide:'LEFT',requestSent:false,
   resultVerified:false,automaticReplayAllowed:false};
  const result=await host.status(req);
  assert.equal(result.ok,true);assert.equal(result.requestSent,false);
  assert.equal(result.videoVerified,false);
 });
});
