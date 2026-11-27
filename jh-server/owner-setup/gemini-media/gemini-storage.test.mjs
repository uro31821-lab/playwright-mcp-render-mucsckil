import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash,createHmac} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {Worker} from 'node:worker_threads';
import {GeminiLifeCheckpointStore as LifeCheckpointStore} from './gemini-storage.mjs';

const OWNER='a'.repeat(64),OTHER='b'.repeat(64),SERVER='c'.repeat(64),REQUEST='gemini_request_1';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const error=code=>value=>value?.code===code;
function fixture(t,{migrate=true}={}){
 const directory=mkdtempSync(join(tmpdir(),'jh-gemini-storage-')),databasePath=join(directory,'life.sqlite'),key=Buffer.alloc(32,41);
 const options={databasePath,key,serverDigest:SERVER};
 let store=new LifeCheckpointStore({...options,initialize:true});
 t.after(()=>{store.close();rmSync(directory,{recursive:true,force:true});});
 if(migrate)store.initializeGeminiMediaStorage();
 return {directory,databasePath,key,options,get store(){return store;},restart(){store.close();store=new LifeCheckpointStore(options);return store;}};
}
function seed(store,owner=OWNER,requestId=REQUEST){
 return store.transactGeminiMedia(owner,requestId,()=>({
  job:{requestId,taskRef:requestId+'_task',kind:'generation',status:'UNKNOWN',bodyHash:'d'.repeat(64),providerId:'operations/provider_1',description:'제주 영상 분석 — private media text'},
  budget:{period:'2026-11',reservedMicros:700000,confirmedMicros:12000},result:'reserved'
 }));
}
function output(text='private mp4 bytes'){
 const bytes=Buffer.concat([Buffer.from([0,0,0,20]),Buffer.from('ftypmp42'),Buffer.from(text)]);
 return {mimeType:'video/mp4',bytes,sha256:digest(bytes)};
}
function raw(f,callback){const db=new DatabaseSync(f.databasePath);try{return callback(db);}finally{db.close();}}

test('Gemini schema is explicit, repeat migration is a no-op, and all data stays in life.sqlite',t=>{
 const f=fixture(t,{migrate:false});
 const names=()=>raw(f,db=>db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r=>r.name));
 const baseline=names();
 assert.throws(()=>f.store.assertGeminiMediaReady(),error('gemini_media_storage_not_initialized'));
 assert.throws(()=>f.store.readGeminiMedia(OWNER,REQUEST),error('gemini_media_storage_not_initialized'));
 assert.deepEqual(names(),baseline);
 f.restart();assert.throws(()=>f.store.assertGeminiMediaReady(),error('gemini_media_storage_not_initialized'));
 assert.deepEqual(f.store.initializeGeminiMediaStorage(),{initialized:true});
 seed(f.store);
 const before=f.store.readGeminiMedia(OWNER,REQUEST);
 assert.deepEqual(f.store.initializeGeminiMediaStorage(),{initialized:false});
 assert.deepEqual(f.store.readGeminiMedia(OWNER,REQUEST),before);
 assert.equal(names().length,baseline.length+4);
 assert.deepEqual(readdirSync(f.directory),['life.sqlite']);
});

test('partial schema fails closed instead of recreating or resetting an existing table',t=>{
 const f=fixture(t,{migrate:false});
 raw(f,db=>db.exec('CREATE TABLE life_gemini_media_jobs(record_id TEXT PRIMARY KEY, revision INTEGER, body BLOB)'));
 assert.throws(()=>f.store.initializeGeminiMediaStorage(),error('gemini_media_storage_schema_invalid'));
 assert.equal(raw(f,db=>db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name LIKE 'life_gemini_media_%'").get().n),1);
});

test('job, owner budget, unknown provider state and encrypted output survive restart',t=>{
 const f=fixture(t),value=output();
 assert.equal(seed(f.store),'reserved');
 const before=f.store.readGeminiMedia(OWNER,REQUEST);
 assert.deepEqual(f.store.putGeminiMediaOutput(OWNER,REQUEST,value),{mimeType:'video/mp4',sha256:value.sha256,byteLength:value.bytes.length});
 f.restart();assert.deepEqual(f.store.readGeminiMedia(OWNER,REQUEST),before);
 assert.deepEqual(f.store.readGeminiMediaBudget(OWNER),before.budget);
 assert.deepEqual(f.store.loadGeminiMediaOutput(OWNER,REQUEST),value);
 const file=readFileSync(f.databasePath);
 for(const secret of [OWNER,REQUEST,'operations/provider_1','private media text','private mp4 bytes','reservedMicros'])assert.equal(file.includes(Buffer.from(secret)),false,secret);
 const detached=f.store.readGeminiMedia(OWNER,REQUEST);detached.job.description='changed outside transaction';
 assert.deepEqual(f.store.readGeminiMedia(OWNER,REQUEST),before);
});

test('HMAC row identities isolate owners and budgets are shared only within one owner',t=>{
 const f=fixture(t);seed(f.store);f.store.putGeminiMediaOutput(OWNER,REQUEST,output());
 assert.deepEqual(f.store.readGeminiMedia(OTHER,REQUEST),{job:null,budget:null});
 assert.equal(f.store.readGeminiMediaBudget(OTHER),null);
 assert.equal(f.store.loadGeminiMediaOutput(OTHER,REQUEST),null);
 assert.throws(()=>f.store.putGeminiMediaOutput(OTHER,REQUEST,output()),error('gemini_media_job_missing'));
 seed(f.store,OTHER);
 assert.equal(f.store.loadGeminiMediaOutput(OTHER,REQUEST),null);
 f.store.transactGeminiMedia(OWNER,'second_request',({job,budget})=>{
  assert.equal(job,null);assert.equal(budget.reservedMicros,700000);
  return {job:{requestId:'second_request',taskRef:'second_task',kind:'analysis',status:'RESERVED'},budget:{...budget,reservedMicros:900000},result:null};
 });
 assert.equal(f.store.readGeminiMedia(OWNER,REQUEST).budget.reservedMicros,900000);
 assert.equal(f.store.readGeminiMediaBudget(OTHER).reservedMicros,700000);
 for(const bad of ['a',OWNER.toUpperCase(),'../owner'])assert.throws(()=>f.store.readGeminiMedia(bad,REQUEST),error('gemini_media_identity_invalid'));
 for(const bad of ['', '../request', 'x'.repeat(81)])assert.throws(()=>f.store.readGeminiMedia(OWNER,bad),error('gemini_media_identity_invalid'));
});

test('one owner task and kind cannot acquire a second request ID from another room',t=>{
 const f=fixture(t);seed(f.store);const before=f.store.readGeminiMedia(OWNER,REQUEST),taskRef=before.job.taskRef;
 assert.deepEqual(f.store.findGeminiMediaJob(OWNER,taskRef,'generation'),before.job);
 assert.equal(f.store.findGeminiMediaJob(OTHER,taskRef,'generation'),null);
 assert.equal(f.store.findGeminiMediaJob(OWNER,taskRef,'analysis'),null);
 assert.throws(()=>f.store.transactGeminiMedia(OWNER,'other_room_request',({budget})=>({
  job:{...before.job,requestId:'other_room_request'},budget:{...budget,reservedMicros:1400000},result:null
 })),error('gemini_media_task_conflict'));
 assert.deepEqual(f.store.readGeminiMedia(OWNER,REQUEST),before);
 assert.deepEqual(f.store.readGeminiMedia(OWNER,'other_room_request'),{job:null,budget:before.budget});
 assert.throws(()=>f.store.transactGeminiMedia(OWNER,REQUEST,({job,budget})=>({job:{...job,taskRef:'replacement_task'},budget,result:null})),error('gemini_media_record_binding'));
 assert.throws(()=>f.store.transactGeminiMedia(OWNER,REQUEST,({job,budget})=>({job:{...job,kind:'analysis'},budget,result:null})),error('gemini_media_record_binding'));
 seed(f.store,OTHER);
 assert.equal(f.store.findGeminiMediaJob(OTHER,taskRef,'generation').requestId,REQUEST);
 f.store.transactGeminiMedia(OWNER,'analysis_request',({budget})=>({
  job:{requestId:'analysis_request',taskRef,kind:'analysis',status:'RESERVED'},budget,result:null
 }));
 assert.equal(f.store.findGeminiMediaJob(OWNER,taskRef,'analysis').requestId,'analysis_request');
 raw(f,db=>{
  const row=db.prepare('SELECT task_id FROM life_gemini_media_jobs LIMIT 1').get();
  assert.throws(()=>db.prepare('INSERT INTO life_gemini_media_jobs(record_id,task_id,revision,body) VALUES(?,?,?,?)').run('different_row',row.task_id,1,Buffer.alloc(32)),/UNIQUE constraint failed/);
 });
 f.restart();assert.deepEqual(f.store.findGeminiMediaJob(OWNER,taskRef,'generation'),before.job);
});

test('callback failures, invalid JSON and asynchronous callbacks preserve both records',t=>{
 const f=fixture(t);seed(f.store);const before=f.store.readGeminiMedia(OWNER,REQUEST);
 const unchanged=()=>assert.deepEqual(f.store.readGeminiMedia(OWNER,REQUEST),before);
 assert.throws(()=>f.store.transactGeminiMedia(OWNER,REQUEST,({job,budget})=>{
  job.status='SUCCEEDED';budget.reservedMicros=0;throw new Error('callback failed');
 }),/callback failed/);unchanged();
 assert.throws(()=>f.store.transactGeminiMedia(OWNER,REQUEST,async state=>({...state,result:null})),error('gemini_media_callback_must_be_synchronous'));unchanged();
 assert.throws(()=>f.store.transactGeminiMedia(OWNER,REQUEST,({job,budget})=>({job:{...job,requestId:'wrong'},budget,result:null})),error('gemini_media_record_binding'));unchanged();
 assert.throws(()=>f.store.transactGeminiMedia(OWNER,REQUEST,({budget})=>({job:null,budget,result:null})),error('gemini_media_record_delete_forbidden'));unchanged();
 assert.throws(()=>f.store.transactGeminiMedia(OWNER,REQUEST,({job})=>({job,budget:null,result:null})),error('gemini_media_record_delete_forbidden'));unchanged();
 let invoked=0;const getter={};Object.defineProperty(getter,'secret',{enumerable:true,get(){invoked++;return 1;}});
 const cycle={};cycle.self=cycle;
 const invalid=[new Date(),{bad:undefined},{bad:Infinity},{bad:Buffer.from('bytes')},{bad:[,1]},getter,cycle];
 for(const budget of invalid){
  assert.throws(()=>f.store.transactGeminiMedia(OWNER,REQUEST,({job})=>({job:{...job,status:'SUCCEEDED'},budget,result:null})),error('gemini_media_json_invalid'));unchanged();
 }
 assert.equal(invoked,0);
 assert.throws(()=>f.store.transactGeminiMedia(OWNER,REQUEST,({job})=>({job,budget:{text:'한'.repeat(50000)},result:null})),error('gemini_media_size_invalid'));unchanged();
 assert.throws(()=>f.store.transactGeminiMedia(OWNER,REQUEST,()=>f.store.transactGeminiMedia(OWNER,REQUEST,()=>null)),error('gemini_media_nested_transaction'));unchanged();
 assert.equal(f.store.transactGeminiMedia(OWNER,'no_op',state=>({...state,result:'no dispatch'})),'no dispatch');
 assert.equal(f.store.readGeminiMedia(OWNER,'no_op').job,null);
});

test('SQLite failure after the job write rolls back the job and budget together',t=>{
 const f=fixture(t);seed(f.store);const before=f.store.readGeminiMedia(OWNER,REQUEST);
 raw(f,db=>db.exec("CREATE TRIGGER reject_budget BEFORE UPDATE ON life_gemini_media_budgets BEGIN SELECT RAISE(ABORT,'budget_write_failure'); END"));
 assert.throws(()=>f.store.transactGeminiMedia(OWNER,REQUEST,({job,budget})=>({
  job:{...job,status:'SUCCEEDED'},budget:{...budget,reservedMicros:0},result:'must not return'
 })),/budget_write_failure/);
 assert.deepEqual(f.store.readGeminiMedia(OWNER,REQUEST),before);
});

test('authenticated readback occurs before commit and failures roll back both updates',t=>{
 const f=fixture(t);seed(f.store);const before=f.store.readGeminiMedia(OWNER,REQUEST);
 raw(f,db=>db.exec('CREATE TRIGGER corrupt_job AFTER UPDATE ON life_gemini_media_jobs BEGIN UPDATE life_gemini_media_jobs SET body=zeroblob(32) WHERE record_id=NEW.record_id; END'));
 assert.throws(()=>f.store.transactGeminiMedia(OWNER,REQUEST,({job,budget})=>({
  job:{...job,status:'SUCCEEDED'},budget:{...budget,confirmedMicros:100000},result:'must not return'
 })),error('checkpoint_unreadable_or_tampered'));
 assert.deepEqual(f.store.readGeminiMedia(OWNER,REQUEST),before);
});

test('output is bound to an existing job, immutable, digest checked and idempotent after restart',t=>{
 const f=fixture(t),value=output();
 assert.throws(()=>f.store.putGeminiMediaOutput(OWNER,REQUEST,value),error('gemini_media_job_missing'));
 seed(f.store);
 assert.throws(()=>f.store.putGeminiMediaOutput(OWNER,REQUEST,{...value,sha256:'0'.repeat(64)}),error('gemini_media_output_digest_mismatch'));
 assert.throws(()=>f.store.putGeminiMediaOutput(OWNER,REQUEST,{...value,mimeType:'text/plain'}),error('gemini_media_output_invalid'));
 assert.throws(()=>f.store.putGeminiMediaOutput(OWNER,REQUEST,{...value,bytes:Buffer.alloc(20*1024*1024+1)}),error('gemini_media_output_invalid'));
 assert.equal(f.store.loadGeminiMediaOutput(OWNER,REQUEST),null);
 const receipt=f.store.putGeminiMediaOutput(OWNER,REQUEST,value);
 const encrypted=raw(f,db=>Buffer.from(db.prepare('SELECT body FROM life_gemini_media_outputs').get().body));
 f.restart();assert.deepEqual(f.store.putGeminiMediaOutput(OWNER,REQUEST,value),receipt);
 assert.deepEqual(raw(f,db=>Buffer.from(db.prepare('SELECT body FROM life_gemini_media_outputs').get().body)),encrypted);
 assert.throws(()=>f.store.putGeminiMediaOutput(OWNER,REQUEST,output('different video')),error('gemini_media_output_immutable_conflict'));
 assert.deepEqual(f.store.loadGeminiMediaOutput(OWNER,REQUEST),value);
});

test('failed output readback leaves no partially stored result',t=>{
 const f=fixture(t);seed(f.store);
 raw(f,db=>db.exec('CREATE TRIGGER corrupt_output AFTER INSERT ON life_gemini_media_outputs BEGIN UPDATE life_gemini_media_outputs SET body=zeroblob(32) WHERE record_id=NEW.record_id; END'));
 assert.throws(()=>f.store.putGeminiMediaOutput(OWNER,REQUEST,output()),error('checkpoint_unreadable_or_tampered'));
 assert.equal(f.store.loadGeminiMediaOutput(OWNER,REQUEST),null);
 assert.equal(f.store.readGeminiMedia(OWNER,REQUEST).job.status,'UNKNOWN');
});

test('ciphertext tampering and replacing another owner row fail authentication',async t=>{
 for(const kind of ['jobs','budgets','outputs'])await t.test(kind,sub=>{
  const f=fixture(sub);seed(f.store);f.store.putGeminiMediaOutput(OWNER,REQUEST,output());
  raw(f,db=>{
   const row=db.prepare(`SELECT record_id,body FROM life_gemini_media_${kind}`).get(),bytes=Buffer.from(row.body);bytes[15]^=1;
   db.prepare(`UPDATE life_gemini_media_${kind} SET body=? WHERE record_id=?`).run(bytes,row.record_id);
  });
  const read=kind==='outputs'?()=>f.store.loadGeminiMediaOutput(OWNER,REQUEST):()=>f.store.readGeminiMedia(OWNER,REQUEST);
  assert.throws(read,error('checkpoint_unreadable_or_tampered'));
 });
 await t.test('owner row substitution',sub=>{
  const f=fixture(sub);seed(f.store,OWNER);seed(f.store,OTHER);
  const id=owner=>createHmac('sha256',f.key).update('jh-life-gemini-job-row-v1|'+owner+'|'+REQUEST).digest('hex');
  raw(f,db=>{
   const row=db.prepare('SELECT body,revision FROM life_gemini_media_jobs WHERE record_id=?').get(id(OTHER));
   db.prepare('UPDATE life_gemini_media_jobs SET body=?,revision=? WHERE record_id=?').run(row.body,row.revision,id(OWNER));
  });
  assert.throws(()=>f.store.readGeminiMedia(OWNER,REQUEST),error('checkpoint_unreadable_or_tampered'));
  assert.equal(f.store.readGeminiMedia(OTHER,REQUEST).job.requestId,REQUEST);
 });
});

test('two SQLite connections reserve the same request once, including shared owner cost',{timeout:5000},async t=>{
 const f=fixture(t),moduleUrl=new URL('./gemini-storage.mjs',import.meta.url).href;
 function worker(){
  const w=new Worker(`
   const {parentPort,workerData}=require('node:worker_threads');
   (async()=>{
    const {GeminiLifeCheckpointStore:LifeCheckpointStore}=await import(workerData.moduleUrl);
    const store=new LifeCheckpointStore({...workerData.options,key:Buffer.from(workerData.options.key)});
    parentPort.postMessage({ready:true});
    parentPort.once('message',()=>{
     try{
      const result=store.transactGeminiMedia(workerData.owner,workerData.requestId,({job,budget})=>{
       if(job)return {job,budget,result:false};
       return {job:{requestId:workerData.requestId,taskRef:'shared_task',kind:'generation',status:'RESERVED'},budget:{reservedMicros:(budget?.reservedMicros??0)+700000},result:true};
      });
      parentPort.postMessage({result});
     }catch(e){parentPort.postMessage({error:e.code||e.message});}finally{store.close();}
    });
   })().catch(e=>{parentPort.postMessage({error:e.code||e.message});});
  `,{eval:true,workerData:{moduleUrl,options:f.options,owner:OWNER,requestId:REQUEST}});
  t.after(()=>w.terminate());
  let readyResolve,resultResolve,resultReject;
  const ready=new Promise(resolve=>{readyResolve=resolve;});
  const result=new Promise((resolve,reject)=>{resultResolve=resolve;resultReject=reject;});
  w.on('message',message=>{if(message.ready)readyResolve();else if(message.error){readyResolve();resultReject(new Error(message.error));}else resultResolve(message.result);});
  w.on('error',e=>{readyResolve();resultReject(e);});
  return {w,ready,result};
 }
 const a=worker(),b=worker();await Promise.all([a.ready,b.ready]);a.w.postMessage('go');b.w.postMessage('go');
 const results=await Promise.all([a.result,b.result]);assert.deepEqual(results.sort(),[false,true]);
 f.restart();assert.equal(f.store.readGeminiMediaBudget(OWNER).reservedMicros,700000);
 assert.equal(f.store.readGeminiMedia(OWNER,REQUEST).job.status,'RESERVED');
});

test('existing checkpoint APIs and data remain usable before and after the optional migration',t=>{
 const f=fixture(t,{migrate:false});
 const checkpoint={workflowId:'legacy_workflow',planDigest:'e'.repeat(64),revision:0,paused:false,cancelled:false,
  entries:[{taskId:'legacy_task',status:'PENDING',providerId:null,code:'pending',evidenceDigest:null,receiptRef:null,verifiedAt:0,invocations:0}]};
 const saved=f.store.compareAndSet(OWNER,checkpoint,0);assert.equal(saved.revision,1);
 f.store.initializeGeminiMediaStorage();seed(f.store);f.store.putGeminiMediaOutput(OWNER,REQUEST,output());
 assert.deepEqual(f.store.load(OWNER,'legacy_workflow'),saved);
 const paused=f.store.control(OWNER,'legacy_workflow',1,'pause');assert.equal(paused.revision,2);assert.equal(paused.paused,true);
 f.restart();assert.deepEqual(f.store.load(OWNER,'legacy_workflow'),paused);
 assert.equal(f.store.readGeminiMedia(OWNER,REQUEST).job.status,'UNKNOWN');
 f.store.close();assert.throws(()=>f.store.readGeminiMediaBudget(OWNER),error('checkpoint_store_closed'));
 assert.throws(()=>new LifeCheckpointStore({...f.options,key:Buffer.alloc(32,42)}),error('checkpoint_unreadable_or_tampered'));
});
