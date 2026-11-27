/** Optional server storage adapter, not a daemon, agent, or second task engine.
 * Caller provisions a PRIVATE durable directory and separate existing encryption key.
 * Explicit initialize creates the database. Normal open never silently replaces a missing DB.
 * Authentication/authorization belongs to the reviewed host, never a request-body owner/flag. */
import {DatabaseSync} from 'node:sqlite';
import {createCipheriv,createDecipheriv,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {lstatSync,realpathSync,existsSync,openSync,closeSync,constants} from 'node:fs';
import {isAbsolute,dirname,resolve} from 'node:path';
import {canonical,parse,exact,checkpoint,transition,isId,isHex,sha,fail} from './life-checkpoint-wire.mjs';
import {remoteRequest,remoteContext,taskSpec,binding as remoteBinding,stableBinding} from './life-remote-task-wire.mjs';
import {workerPolicy,workerContext,workerClock} from './life-worker-policy.mjs';
import {workerRequest} from './life-worker-policy.mjs';
import {queueDescriptor,queueContext,queueRequest,queueRecord} from './life-queue-wire.mjs';
import {reconciliationRequest,reconciliationTask,verifiedStagedResult,candidateDigest} from './life-reconciliation-wire.mjs';
import {contentCanonical,contentParse,contentRecord,contentTime,contentBinding,CONTENT_MAX_BYTES} from './life-content-wire.mjs';

const GEMINI_JSON_MAX_BYTES=128*1024;
const GEMINI_OUTPUT_MAX_BYTES=20*1024*1024;
const GEMINI_TABLES=['life_gemini_media_meta','life_gemini_media_jobs','life_gemini_media_budgets','life_gemini_media_outputs'];
const geminiPlainObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
 (Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
/** Bounded, detached JSON. Do not invoke getters, toJSON, custom prototypes or sparse arrays. */
function geminiJsonText(value){
 if(value!==null&&!geminiPlainObject(value))fail('gemini_media_json_invalid');
 let bytes=0,nodes=0;const ancestors=new Set();
 const part=text=>{bytes+=Buffer.byteLength(text);if(bytes>GEMINI_JSON_MAX_BYTES)fail('gemini_media_size_invalid');return text;};
 function encode(v,depth){
  if(++nodes>32768||depth>20)fail('gemini_media_structure_limit');
  if(v===null||typeof v==='boolean')return part(JSON.stringify(v));
  if(typeof v==='string'){if(v.length>GEMINI_JSON_MAX_BYTES)fail('gemini_media_size_invalid');return part(JSON.stringify(v));}
  if(typeof v==='number'){if(!Number.isFinite(v))fail('gemini_media_json_invalid');return part(JSON.stringify(v));}
  if(typeof v!=='object'||ancestors.has(v))fail('gemini_media_json_invalid');
  const array=Array.isArray(v);
  if(array?Object.getPrototypeOf(v)!==Array.prototype:!geminiPlainObject(v))fail('gemini_media_json_invalid');
  if(array&&v.length>32768)fail('gemini_media_structure_limit');
  const descriptors=Object.getOwnPropertyDescriptors(v),keys=Reflect.ownKeys(descriptors);
  if(keys.some(k=>typeof k!=='string'))fail('gemini_media_json_invalid');
  ancestors.add(v);
  try{
   if(array){
    if(keys.length!==v.length+1)fail('gemini_media_json_invalid');
    const entries=[];part('[');part(']');
    for(let i=0;i<v.length;i++){
     const d=descriptors[String(i)];if(!d||!d.enumerable||!Object.hasOwn(d,'value'))fail('gemini_media_json_invalid');
     if(i)part(',');entries.push(encode(d.value,depth+1));
    }
    return '['+entries.join(',')+']';
   }
   if(keys.length>32768)fail('gemini_media_structure_limit');
   const entries=[];part('{');part('}');
   for(const k of keys.sort()){
    const d=descriptors[k];if(!d.enumerable||!Object.hasOwn(d,'value'))fail('gemini_media_json_invalid');
    if(k.length>GEMINI_JSON_MAX_BYTES)fail('gemini_media_size_invalid');
    if(entries.length)part(',');const key=part(JSON.stringify(k));part(':');entries.push(key+':'+encode(d.value,depth+1));
   }
   return '{'+entries.join(',')+'}';
  }finally{ancestors.delete(v);}
 }
 return encode(value,0);
}
function geminiParsed(bytes){
 let text,value;
 try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);value=JSON.parse(text);}catch{fail('gemini_media_record_invalid');}
 if(geminiJsonText(value)!==text)fail('gemini_media_record_invalid');return value;
}
function geminiEnvelope(value,keys,code){
 if(!geminiPlainObject(value))fail(code);
 const descriptors=Object.getOwnPropertyDescriptors(value),actual=Reflect.ownKeys(descriptors);
 if(actual.some(k=>typeof k!=='string')||actual.sort().join('|')!==keys.split(' ').sort().join('|')||
   actual.some(k=>!descriptors[k].enumerable||!Object.hasOwn(descriptors[k],'value')))fail(code);
 return value;
}
export class LifeCheckpointStore {
 #db;#key;#server;#databasePath;#closed=false;
 constructor({databasePath,key,serverDigest,initialize=false}){
  if(!Buffer.isBuffer(key)||key.length!==32||!isHex(serverDigest))fail('checkpoint_store_configuration');
  if(!isAbsolute(databasePath)||realpathSync(dirname(databasePath))!==resolve(dirname(databasePath)))fail('checkpoint_store_path');
  const dir=lstatSync(dirname(databasePath));
  if(!dir.isDirectory()||(dir.mode&0o077)!==0||dir.uid!==process.getuid())fail('checkpoint_store_directory_not_private');
  for(const suffix of ['','-journal','-wal','-shm'])if(existsSync(databasePath+suffix)){
   const st=lstatSync(databasePath+suffix);
   if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||st.uid!==process.getuid()||(st.mode&0o077)!==0)fail('checkpoint_store_file_not_private');
  }
  if(initialize){const fd=openSync(databasePath,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);closeSync(fd);}
  else if(!existsSync(databasePath))fail('checkpoint_store_missing');
  this.#key=Buffer.from(key);this.#server=serverDigest;this.#databasePath=databasePath;
  try{
   this.#db=new DatabaseSync(databasePath,{timeout:1000});
   this.#db.exec('PRAGMA trusted_schema=OFF; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;');
   if(initialize){
    this.#db.exec('BEGIN IMMEDIATE; CREATE TABLE metadata(id INTEGER PRIMARY KEY CHECK(id=1), proof BLOB NOT NULL); CREATE TABLE checkpoints(record_id TEXT PRIMARY KEY, revision INTEGER NOT NULL, body BLOB NOT NULL);');
    this.#db.prepare('INSERT INTO metadata VALUES(1,?)').run(this.#seal('metadata',1,Buffer.from('jh-life-checkpoint-v1')));this.#db.exec('COMMIT');
   }
   const meta=this.#db.prepare('SELECT proof FROM metadata WHERE id=1').get();
   if(!meta||this.#open('metadata',1,meta.proof).toString()!=='jh-life-checkpoint-v1')fail('checkpoint_store_key_or_schema_mismatch');
  }catch(e){try{this.#db?.close();}catch{}this.#key.fill(0);throw e;}
 }
 get serverDigest(){return this.#server;}
 get databasePath(){return this.#databasePath;}
 /** Non-mutating startup inspection. Missing optional schemas are NOT implicitly initialized. */
 assertRuntimeReady(){
  this.#contentReady();this.#workerPolicy();
  if(!this.#workersEnabled()||!this.#queueEnabled())fail('life_runtime_storage_not_initialized');
  for(const [table,fields] of [['checkpoints','record_id,revision,body'],['life_content','record_id,workflow_id,body'],
    ['life_workers','record_id,owner_id,revision,body'],['life_queue','record_id,owner_id,sequence,body'],['life_queue_owners','record_id,revision,body']])
   this.#db.prepare(`SELECT ${fields} FROM ${table} LIMIT 0`).all();
  return Object.freeze({content:true,worker:true,queue:true,initialized:false});
 }
 #identity(owner,workflow){if(!isHex(owner)||!isId(workflow))fail('checkpoint_identity_invalid');
  return createHmac('sha256',this.#key).update('jh-life-row-v1|'+owner+'|'+workflow).digest('hex');}
 #aad(id,rev){return Buffer.from('jh-life-state-v1|'+this.#server+'|'+id+'|'+rev);}
 #seal(id,rev,plain){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',this.#key,iv);c.setAAD(this.#aad(id,rev));return Buffer.concat([iv,c.update(plain),c.final(),c.getAuthTag()]);}
 #open(id,rev,encrypted,maxBytes=66000){try{const b=Buffer.from(encrypted);if(b.length<28||b.length>maxBytes)fail('checkpoint_cipher_size');const c=createDecipheriv('aes-256-gcm',this.#key,b.subarray(0,12));c.setAAD(this.#aad(id,rev));c.setAuthTag(b.subarray(-16));return Buffer.concat([c.update(b.subarray(12,-16)),c.final()]);}catch{fail('checkpoint_unreadable_or_tampered');}}
 #ready(){if(this.#closed)fail('checkpoint_store_closed');}
 #read(owner,workflow){const id=this.#identity(owner,workflow);const row=this.#db.prepare('SELECT revision,body FROM checkpoints WHERE record_id=?').get(id);if(!row)return null;
  const plain=this.#open(id,row.revision,row.body);try{const s=checkpoint(parse(plain));if(s.workflowId!==workflow||s.revision!==row.revision)fail('checkpoint_binding_mismatch');return s;}finally{plain.fill(0);}}
 load(owner,workflow){this.#ready();return this.#read(owner,workflow);}
 compareAndSet(owner,value,expectedRevision,execution=null,now=Date.now()){
  return this.#compareAndSet(owner,value,expectedRevision,execution,now,false);
 }
 #compareAndSet(owner,value,expectedRevision,execution,now,control){
  this.#ready();const s=checkpoint(parse(Buffer.from(canonical(value))));this.#identity(owner,s.workflowId);
  this.#db.exec('BEGIN IMMEDIATE');
  try{
   const old=this.#read(owner,s.workflowId);transition(old,s,expectedRevision);
   if(!control)this.#guardExecutionWrite(owner,s.workflowId,execution,now,old,s);
   const next={...s,revision:expectedRevision+1},id=this.#identity(owner,s.workflowId),plain=Buffer.from(canonical(next));
   let encrypted;try{encrypted=this.#seal(id,next.revision,plain);}finally{plain.fill(0);}
   this.#db.prepare('INSERT INTO checkpoints VALUES(?,?,?) ON CONFLICT(record_id) DO UPDATE SET revision=excluded.revision,body=excluded.body').run(id,next.revision,encrypted);
   const back=this.#read(owner,s.workflowId);if(canonical(back)!==canonical(next))fail('checkpoint_readback_mismatch');
   this.#db.exec('COMMIT');return back;
  }catch(e){try{if(this.#db.isTransaction)this.#db.exec('ROLLBACK');}catch{}throw e;}
 }
 /** Explicit optional migration. Never called by constructor or existing server startup. */
 initializeContentStorage(){
  this.#ready();this.#db.exec('BEGIN IMMEDIATE');
  try{
   this.#db.exec('CREATE TABLE life_content_meta(id INTEGER PRIMARY KEY CHECK(id=1), proof BLOB NOT NULL); CREATE TABLE life_content(record_id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL, body BLOB NOT NULL); CREATE INDEX life_content_workflow ON life_content(workflow_id);');
   this.#db.prepare('INSERT INTO life_content_meta VALUES(1,?)').run(this.#seal('content-metadata-v1',1,Buffer.from('jh-life-content-v1')));
   this.#db.exec('COMMIT');
  }catch(e){if(this.#db.isTransaction)this.#db.exec('ROLLBACK');throw e;}
 }
 #contentReady(){
  this.#ready();let meta;
  try{meta=this.#db.prepare('SELECT proof FROM life_content_meta WHERE id=1').get();}catch{fail('content_storage_not_initialized');}
  if(!meta||this.#open('content-metadata-v1',1,meta.proof).toString()!=='jh-life-content-v1')fail('content_storage_schema_invalid');
 }
 #contentId(owner,workflow,ref){
  this.#identity(owner,workflow);if(!isId(ref))fail('content_reference_invalid');
  return createHmac('sha256',this.#key).update('jh-life-content-row-v1|'+owner+'|'+workflow+'|'+ref).digest('hex');
 }
 #readContent(owner,workflow,ref){
  const id=this.#contentId(owner,workflow,ref),row=this.#db.prepare('SELECT body FROM life_content WHERE record_id=?').get(id);
  if(!row)return null;
  const plain=this.#open('content-v1|'+id,1,row.body,CONTENT_MAX_BYTES+64);
  try{const r=contentRecord(contentParse(plain));if(r.workflowId!==workflow||r.ref!==ref)fail('content_row_binding');return r;}finally{plain.fill(0);}
 }
 /** Immutable stage before checkpoint success. Orphan results cannot be read as completed. */
 putContent(owner,value,expectedRevision,now=Date.now(),execution=null){
  this.#contentReady();const r=contentRecord(contentParse(Buffer.from(contentCanonical(value))));contentTime(r,now);
  this.#db.exec('BEGIN IMMEDIATE');
  try{
   const cp=this.#read(owner,r.workflowId);if(!cp||cp.revision!==expectedRevision)fail('checkpoint_conflict');
   contentBinding(cp,r,false);
   this.#guardExecutionWrite(owner,r.workflowId,execution,now);
   const back=this.#saveContent(owner,r);
   this.#db.exec('COMMIT');return back;
  }catch(e){if(this.#db.isTransaction)this.#db.exec('ROLLBACK');throw e;}
 }
 /** Immutable encrypted staging shared by local and narrowly delegated read hosts. Caller owns transaction. */
 #saveContent(owner,r){
   const old=this.#readContent(owner,r.workflowId,r.ref);
   if(old){if(contentCanonical(old)!==contentCanonical(r))fail('content_immutable_conflict');}
   else{
    const workflowKey=this.#identity(owner,r.workflowId);
    const count=this.#db.prepare('SELECT count(*) AS n FROM life_content WHERE workflow_id=?').get(workflowKey).n;
    if(count>=48)fail('content_workflow_capacity');
    const id=this.#contentId(owner,r.workflowId,r.ref),plain=Buffer.from(contentCanonical(r));let encrypted;
    try{encrypted=this.#seal('content-v1|'+id,1,plain);}finally{plain.fill(0);}
    this.#db.prepare('INSERT INTO life_content VALUES(?,?,?)').run(id,workflowKey,encrypted);
   }
   const back=this.#readContent(owner,r.workflowId,r.ref);
   if(contentCanonical(back)!==contentCanonical(r))fail('content_readback_mismatch');
   return back;
 }
 loadContent(owner,workflow,plan,ref,now=Date.now()){
  this.#contentReady();this.#db.exec('BEGIN');
  try{
   const cp=this.#read(owner,workflow);
   if(!cp||cp.planDigest!==plan)fail('content_checkpoint_binding');
   if(cp.paused||cp.cancelled)fail('content_workflow_stopped');
   const r=this.#readContent(owner,workflow,ref);
   if(r){contentTime(r,now);contentBinding(cp,r,true);}
   this.#db.exec('COMMIT');return r;
  }catch(e){if(this.#db.isTransaction)this.#db.exec('ROLLBACK');throw e;}
 }
 /** Metadata control only. Never calls a provider or pretends an in-flight network call was killed. */
 control(owner,workflow,expectedRevision,action){
  if(!['pause','cancel','resume'].includes(action))fail('checkpoint_control_invalid');
  const old=this.load(owner,workflow);if(!old)fail('checkpoint_missing');
  if(old.revision!==expectedRevision)fail('checkpoint_conflict');
  if(old.cancelled&&action==='resume')fail('checkpoint_cancel_is_final');
  return this.#compareAndSet(owner,{...old,paused:action!=='resume',cancelled:old.cancelled||action==='cancel'},expectedRevision,null,Date.now(),true);
 }

 /** Explicit opt-in migration, never automatically run by the constructor. Policy is
  * persisted and authenticated; opening the DB does not reset budgets or ownership. */
 initializeWorkerStorage(policy){
  this.#ready();const checked=workerPolicy(policy);this.#db.exec('BEGIN IMMEDIATE');
  try{
   this.#db.exec('CREATE TABLE life_worker_meta(id INTEGER PRIMARY KEY CHECK(id=1), proof BLOB NOT NULL); CREATE TABLE life_workers(record_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, revision INTEGER NOT NULL, body BLOB NOT NULL); CREATE INDEX life_workers_owner ON life_workers(owner_id);');
   this.#db.prepare('INSERT INTO life_worker_meta VALUES(1,?)').run(this.#seal('worker-policy-v1',1,Buffer.from(canonical(checked))));
   this.#db.exec('COMMIT');
  }catch(e){if(this.#db.isTransaction)this.#db.exec('ROLLBACK');throw e;}
 }
 #workerPolicy(){
  this.#ready();let row;
  try{row=this.#db.prepare('SELECT proof FROM life_worker_meta WHERE id=1').get();}catch{fail('worker_storage_not_initialized');}
  if(!row)fail('worker_policy_missing');
  const plain=this.#open('worker-policy-v1',1,row.proof);
  try{return workerPolicy(parse(plain));}finally{plain.fill(0);}
 }
 #workersEnabled(){
  const n=this.#db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE type='table' AND name IN ('life_workers','life_worker_meta')").get().n;
  if(n!==0&&n!==2)fail('worker_storage_schema_damaged');
  return n===2;
 }
 #workerOwner(owner){
  if(!isHex(owner))fail('worker_owner_invalid');
  return createHmac('sha256',this.#key).update('jh-worker-owner-v1|'+owner).digest('hex');
 }
 #readWorker(owner,workflow){
  const id=this.#identity(owner,workflow),row=this.#db.prepare('SELECT revision,body FROM life_workers WHERE record_id=?').get(id);
  if(!row)return null;
  const plain=this.#open('worker-v1|'+id,row.revision,row.body);
  try{
   const r=parse(plain);
   if(r.workflowId!==workflow||r.revision!==row.revision||!isHex(r.planDigest)||!Number.isSafeInteger(r.fence)||r.fence<1||!Array.isArray(r.dispatches)||r.dispatches.length>64)fail('worker_record_invalid');
   return r;
  }finally{plain.fill(0);}
 }
 #writeWorker(owner,r){
  const next={...r,revision:r.revision+1},id=this.#identity(owner,r.workflowId),plain=Buffer.from(canonical(next));let encrypted;
  try{encrypted=this.#seal('worker-v1|'+id,next.revision,plain);}finally{plain.fill(0);}
  this.#db.prepare('INSERT INTO life_workers VALUES(?,?,?,?) ON CONFLICT(record_id) DO UPDATE SET revision=excluded.revision,body=excluded.body').run(id,this.#workerOwner(owner),next.revision,encrypted);
  const back=this.#readWorker(owner,r.workflowId);
  if(canonical(back)!==canonical(next))fail('worker_readback_mismatch');
  return back;
 }
 #requireWorker(r,context,now,cp){
  workerContext(context);workerClock(now,r?.lastSeenAt??0);
  if(!r||!r.lease||r.lease.workerDigest!==context.workerDigest||r.lease.leaseId!==context.proof.leaseId||r.fence!==context.proof.fence)fail('worker_fence_mismatch');
  if(now>=r.lease.expiresAt||now>=r.deadline)fail('worker_lease_expired');
  if(cp&&(cp.planDigest!==r.planDigest||cp.paused||cp.cancelled))fail('worker_workflow_stopped');
 }
 #workerView(r,context,now,cp,policy){
  workerClock(now,r.lastSeenAt);
  const own=r.lease?.workerDigest===context.workerDigest;
  const active=!!r.lease&&now<r.lease.expiresAt&&now<r.deadline&&!cp?.paused&&!cp?.cancelled;
  return {workflowId:r.workflowId,planDigest:r.planDigest,fence:r.fence,
   lease:own?r.lease:null,heldByOther:!!r.lease&&!own,active:active&&own,
   deadline:r.deadline,serverTime:now,maxParallelTasks:policy.maxParallelTasks,
   remainingTaskStarts:Math.max(0,policy.maxTaskStarts-(cp?.entries.reduce((n,e)=>n+e.invocations,0)??0)),
   dispatches:r.dispatches.length,requiresReconciliation:!!cp?.entries.some(e=>e.status==='RUNNING')&&(!active||!r.lease)};
 }
 #guardExecutionWrite(owner,workflow,context,now,old=null,next=null){
  if(!this.#workersEnabled()){if(context)fail('worker_storage_not_initialized');return;}
  this.#guardQueueExecution(owner,workflow,context,now);
  const r=this.#readWorker(owner,workflow);
  if(!r){if(context)fail('worker_lease_missing');return;}
  const cp=old??this.#read(owner,workflow);
  this.#requireWorker(r,context,now,cp);
  const policy=this.#workerPolicy();
  if(next){
   if(next.planDigest!==r.planDigest)fail('worker_plan_changed');
   if(next.entries.reduce((n,e)=>n+e.invocations,0)>policy.maxTaskStarts)fail('worker_task_budget_exhausted');
   if(next.entries.filter(e=>e.status==='RUNNING').length>policy.maxParallelTasks)fail('worker_parallel_limit');
   for(const e of next.entries){
    const before=cp?.entries.find(x=>x.taskId===e.taskId);
    if(e.status==='RUNNING'&&before?.status!=='RUNNING'&&!context.readOnlyTasks.has(e.taskId))fail('worker_task_not_readonly');
    if(e.status==='SUCCEEDED'&&before?.status==='RUNNING'&&!context.readOnlyTasks.has(e.taskId))fail('worker_task_not_readonly');
    if(e.status==='SUCCEEDED'&&before?.status==='RUNNING'&&!r.dispatches.some(d=>d.taskId===e.taskId&&d.attempt===e.invocations&&d.fence===r.fence))fail('worker_dispatch_not_recorded');
   }
  }
  this.#writeWorker(owner,{...r,lastSeenAt:now});
 }
 /** Atomically fences an existing workflow. The actor is authenticated by the host.
  * One coordinator owns a workflow; its existing Session may fan out 1..4 read tasks.
  * Expired RUNNING work is NEVER stolen/replayed just because its lease expired. */
 workerOperation(owner,request,context,now=Date.now()){
  this.#ready();const x=workerRequest(parse(Buffer.from(canonical(request))));
  workerContext(context,x.operation!=='acquire'&&x.operation!=='inspect');
  workerClock(now);const policy=this.#workerPolicy();this.#db.exec('BEGIN IMMEDIATE');
  try{
   let r=this.#readWorker(owner,x.workflowId);const cp=this.#read(owner,x.workflowId);
   if((r&&r.planDigest!==x.planDigest)||(cp&&cp.planDigest!==x.planDigest))fail('worker_plan_changed');
   if(r)workerClock(now,r.lastSeenAt);
   if(x.operation==='inspect'){
    if(r)r=this.#writeWorker(owner,{...r,lastSeenAt:now});
    const view=r?this.#workerView(r,context,now,cp,policy):null;this.#db.exec('COMMIT');return view;
   }
   if(x.operation!=='inspect')this.#guardQueueExecution(owner,x.workflowId,context,now);
   if(x.operation==='acquire'){
    if(cp?.paused||cp?.cancelled)fail('worker_workflow_stopped');
    if(cp?.entries.some(e=>e.status==='RUNNING'))fail('worker_execution_uncertain');
    if(r?.lease&&now<r.lease.expiresAt)fail('worker_already_owned');
    if(r&&now>=r.deadline)fail('worker_runtime_budget_exhausted');
    if(cp&&cp.entries.every(e=>e.status!=='PENDING'))fail('worker_no_pending_tasks');
    const rows=this.#db.prepare('SELECT revision,body,record_id FROM life_workers WHERE owner_id=?').all(this.#workerOwner(owner));let count=0;
    for(const row of rows){
     const plain=this.#open('worker-v1|'+row.record_id,row.revision,row.body);let other;
     try{other=parse(plain);}finally{plain.fill(0);}
     workerClock(now,other.lastSeenAt);
     if(other.workflowId===x.workflowId)continue;
     const state=this.#read(owner,other.workflowId);
     // Do not free capacity solely on timeout while a provider outcome remains unknown.
     if((other.lease&&now<other.lease.expiresAt)||state?.entries.some(e=>e.status==='RUNNING'))count++;
    }
    if(count>=policy.maxActiveWorkflows)fail('worker_owner_capacity');
    if(!r&&cp?.entries.some(e=>e.invocations!==0))fail('worker_migration_requires_fresh_workflow');
    const fence=(r?.fence??0)+1;
    if(!Number.isSafeInteger(fence))fail('worker_fence_overflow');
    r={workflowId:x.workflowId,planDigest:x.planDigest,revision:r?.revision??0,fence,
     deadline:r?.deadline??now+policy.runtimeMillis,lastSeenAt:now,dispatches:r?.dispatches??[],
     lease:{workerDigest:context.workerDigest,leaseId:'lease_'+randomBytes(16).toString('hex'),expiresAt:Math.min(now+policy.leaseMillis,r?.deadline??now+policy.runtimeMillis)}};
   }else{
    this.#requireWorker(r,context,now,cp);
    if(x.operation==='renew')r={...r,lease:{...r.lease,expiresAt:Math.min(now+policy.leaseMillis,r.deadline)}};
    else if(x.operation==='release'){
     if(cp?.entries.some(e=>e.status==='RUNNING'))fail('worker_release_uncertain');
     r={...r,lease:null};
    }else if(x.operation==='dispatch'){
     const e=cp?.entries.find(e=>e.taskId===x.taskId);
     if(!isId(x.taskId)||!context.readOnlyTasks.has(x.taskId)||!isId(x.providerId)||!isHex(x.descriptorDigest)||
       typeof x.toolName!=='string'||!/^[-A-Za-z0-9_.:/]{1,160}$/.test(x.toolName)||!isHex(x.actionDigest))fail('worker_dispatch_invalid');
     if(!e||e.status!=='RUNNING'||e.providerId!==x.providerId||e.invocations<1)fail('worker_task_not_running');
     if(x.actionDigest!==sha([cp.planDigest,x.taskId,e.invocations,x.providerId,x.toolName,x.descriptorDigest].join('|')))fail('worker_action_binding');
     if(r.dispatches.some(d=>d.taskId===x.taskId&&d.attempt===e.invocations))fail('worker_dispatch_replay');
     if(r.dispatches.length>=policy.maxTaskStarts)fail('worker_task_budget_exhausted');
     r={...r,dispatches:[...r.dispatches,{taskId:x.taskId,attempt:e.invocations,actionDigest:x.actionDigest,fence:r.fence}]};
    }
    r={...r,lastSeenAt:now};
   }
   r=this.#writeWorker(owner,r);const view=this.#workerView(r,context,now,cp,policy);
   this.#db.exec('COMMIT');return view;
  }catch(e){if(this.#db.isTransaction)this.#db.exec('ROLLBACK');throw e;}
 }
 /** Inspect/commit staged read evidence after a coordinator has lost its lease.
  * Same encrypted DB + atomic transaction; recovery does not acquire execution authority.
  * Only the reviewed authenticated host may construct context.recoveryTasks from its exact plan. */
 reconcile(owner,request,context,now=Date.now()) {
  this.#contentReady();this.#workerPolicy();
  const x=reconciliationRequest(parse(Buffer.from(canonical(request))));
  const spec=reconciliationTask(context,x.taskId);
  workerClock(now);if(context.expiresAt<=now)fail('reconcile_auth_expired');
  this.#db.exec('BEGIN IMMEDIATE');
  try {
   this.#guardQueueExecution(owner,x.workflowId,context,now);
   const cp=this.#read(owner,x.workflowId),r=this.#readWorker(owner,x.workflowId);
   if(!cp||!r||cp.planDigest!==x.planDigest||r.planDigest!==x.planDigest)fail('reconcile_workflow_binding');
   workerClock(now,r.lastSeenAt);
   if(cp.paused||cp.cancelled)fail('reconcile_workflow_stopped');
   if(r.lease&&now<r.lease.expiresAt)fail('reconcile_owner_still_active');
   if(now>=r.deadline)fail('reconcile_runtime_expired');
   const entry=cp.entries.find(e=>e.taskId===x.taskId);
   if(!entry||!['RUNNING','NEEDS_USER','SUCCEEDED'].includes(entry.status)||entry.invocations<1)fail('reconcile_task_not_uncertain');
   const dispatches=r.dispatches.filter(d=>d.taskId===x.taskId&&d.attempt===entry.invocations);
   if(dispatches.length!==1)fail('reconcile_dispatch_missing_or_ambiguous');
   const dispatch=dispatches[0];
   const rows=this.#db.prepare('SELECT record_id,body FROM life_content WHERE workflow_id=? LIMIT 50').all(this.#identity(owner,x.workflowId));
   if(rows.length>48)fail('reconcile_result_inventory_limit');
   const matches=[];
   for(const row of rows){
    const plain=this.#open('content-v1|'+row.record_id,1,row.body,CONTENT_MAX_BYTES+64);
    let c;try{c=contentRecord(contentParse(plain));}finally{plain.fill(0);}
    if(c.workflowId!==x.workflowId||c.planDigest!==x.planDigest||this.#contentId(owner,x.workflowId,c.ref)!==row.record_id)fail('reconcile_content_row_binding');
    if(c.category==='RESULT_TEXT'&&c.taskId===x.taskId)matches.push(c);
   }
   if(matches.length===0){
    if(entry.status==='SUCCEEDED')fail('reconcile_committed_result_missing');
    if(x.operation==='commit')fail('reconcile_candidate_missing');
    this.#writeWorker(owner,{...r,lastSeenAt:now});this.#db.exec('COMMIT');
    return {status:'NO_DURABLE_RESULT',checkpoint:cp,fence:r.fence,record:null,candidateDigest:null};
   }
   // Do not choose one of several records or ignore a conflicting record as if it were absent.
   if(matches.length!==1)fail('reconcile_result_ambiguous');
   const record=verifiedStagedResult(cp,entry,dispatch,matches[0],spec,context,now);
   const digest=candidateDigest(cp,r.fence,entry,dispatch,record);
   if(entry.status==='SUCCEEDED'){
    if(entry.receiptRef!==record.ref||entry.evidenceDigest!==record.evidenceDigest||entry.verifiedAt!==record.verifiedAt)fail('reconcile_committed_conflict');
    if(x.operation==='commit')fail('reconcile_already_committed');
    this.#writeWorker(owner,{...r,lastSeenAt:now});this.#db.exec('COMMIT');
    return {status:'ALREADY_COMMITTED',checkpoint:cp,fence:r.fence,record,candidateDigest:digest};
   }
   if(entry.receiptRef!==null||entry.evidenceDigest!==null||entry.verifiedAt!==0)fail('reconcile_prior_receipt_conflict');
   if(x.operation==='inspect'){
    this.#writeWorker(owner,{...r,lastSeenAt:now});this.#db.exec('COMMIT');
    return {status:'RECOVERABLE',checkpoint:cp,fence:r.fence,record,candidateDigest:digest};
   }
   if(x.expectedRevision!==cp.revision||x.expectedFence!==r.fence||x.candidateDigest!==digest)fail('reconcile_observation_changed');
   if(!Number.isSafeInteger(cp.revision+1)||!Number.isSafeInteger(r.fence+1))fail('reconcile_revision_overflow');
   // This sole explicit evidence-based transition handles NEEDS_USER too. General CAS still
   // refuses NEEDS_USER -> SUCCEEDED; no caller checkpoint or retry/reset is accepted here.
   const next=checkpoint({...cp,revision:cp.revision+1,entries:cp.entries.map(e=>e.taskId===x.taskId?
     {...e,status:'SUCCEEDED',code:'result_recovered_verified',receiptRef:record.ref,evidenceDigest:record.evidenceDigest,verifiedAt:record.verifiedAt}:e)});
   const id=this.#identity(owner,x.workflowId),plain=Buffer.from(canonical(next));let encrypted;
   try{encrypted=this.#seal(id,next.revision,plain);}finally{plain.fill(0);}
   this.#db.prepare('UPDATE checkpoints SET revision=?,body=? WHERE record_id=?').run(next.revision,encrypted,id);
   const back=this.#read(owner,x.workflowId);if(canonical(back)!==canonical(next))fail('reconcile_checkpoint_readback');
   const updated=this.#writeWorker(owner,{...r,fence:r.fence+1,lease:null,lastSeenAt:now});
   this.#db.exec('COMMIT');
   return {status:'COMMITTED',checkpoint:back,fence:updated.fence,record,candidateDigest:candidateDigest(back,updated.fence,back.entries.find(e=>e.taskId===x.taskId),dispatch,record)};
  }catch(e){if(this.#db.isTransaction)this.#db.exec('ROLLBACK');throw e;}
 }
 /** Explicit optional migration. Retains the existing checkpoint/worker/content DB and key.
  * Queue order is not task state; all statuses are derived from those existing records. */
 initializeQueueStorage(){
  this.#contentReady();this.#workerPolicy();this.#db.exec('BEGIN IMMEDIATE');
  try{
   this.#db.exec('CREATE TABLE life_queue_meta(id INTEGER PRIMARY KEY CHECK(id=1),proof BLOB NOT NULL); CREATE TABLE life_queue(record_id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,sequence INTEGER NOT NULL,body BLOB NOT NULL,UNIQUE(owner_id,sequence)); CREATE TABLE life_queue_owners(record_id TEXT PRIMARY KEY,revision INTEGER NOT NULL,body BLOB NOT NULL);');
   this.#db.exec('ALTER TABLE metadata ADD COLUMN queue_proof BLOB');
   this.#db.prepare('UPDATE metadata SET queue_proof=? WHERE id=1').run(this.#seal('queue-enabled-v1',1,Buffer.from('queue-required-v1')));
   this.#db.prepare('INSERT INTO life_queue_meta VALUES(1,?)').run(this.#seal('queue-meta-v1',1,Buffer.from('jh-life-queue-v1')));
   this.#db.exec('COMMIT');
  }catch(e){if(this.#db.isTransaction)this.#db.exec('ROLLBACK');throw e;}
 }
 #queueEnabled(){
  this.#ready();const n=this.#db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE type='table' AND name IN ('life_queue','life_queue_meta','life_queue_owners')").get().n;
  const marked=this.#db.prepare('PRAGMA table_info(metadata)').all().some(c=>c.name==='queue_proof');
  if(!marked){if(n!==0)fail('queue_schema_damaged');return false;}
  const proof=this.#db.prepare('SELECT queue_proof FROM metadata WHERE id=1').get()?.queue_proof;
  if(!proof||this.#open('queue-enabled-v1',1,proof).toString()!=='queue-required-v1'||n!==3)fail('queue_schema_damaged');
  const m=this.#db.prepare('SELECT proof FROM life_queue_meta WHERE id=1').get();
  if(!m||this.#open('queue-meta-v1',1,m.proof).toString()!=='jh-life-queue-v1')fail('queue_schema_damaged');return true;
 }
 #readQueue(owner,workflow){
  const id=this.#identity(owner,workflow),row=this.#db.prepare('SELECT owner_id,sequence,body FROM life_queue WHERE record_id=?').get(id);
  if(!row)return null;const b=this.#open('queue-v1|'+id,row.sequence,row.body);
  try{const r=queueRecord(parse(b));if(r.workflowId!==workflow||r.sequence!==row.sequence||row.owner_id!==this.#workerOwner(owner))fail('queue_row_binding');return r;}finally{b.fill(0);}
 }
 #queueWatermark(owner,now,increment=false){
  const id=this.#workerOwner(owner),row=this.#db.prepare('SELECT revision,body FROM life_queue_owners WHERE record_id=?').get(id);let state={lastSeenAt:0,sequence:0};
  if(row){const b=this.#open('queue-owner-v1|'+id,row.revision,row.body);try{state=parse(b);exact(state,'lastSeenAt sequence');}finally{b.fill(0);}}
  workerClock(now,state.lastSeenAt);
  if(!Number.isSafeInteger(state.sequence)||state.sequence<0)fail('queue_sequence_invalid');
  if(increment&&state.sequence>=1024)fail('queue_retention_capacity'); // bounded retention; no automatic deletion.
  state={lastSeenAt:now,sequence:state.sequence+(increment?1:0)};
  const rev=(row?.revision??0)+1;if(!Number.isSafeInteger(rev))fail('queue_revision_invalid');
  this.#db.prepare('INSERT INTO life_queue_owners VALUES(?,?,?) ON CONFLICT(record_id) DO UPDATE SET revision=excluded.revision,body=excluded.body').run(id,rev,this.#seal('queue-owner-v1|'+id,rev,Buffer.from(canonical(state))));
  return state;
 }
 #queueBinding(owner,r,g,now){
  if(!g||g.expiresAt<=now||g.planDigest!==r.planDigest||g.descriptorDigest!==r.descriptorDigest)fail('queue_scope_denied');
  const d=queueDescriptor(r.descriptor),cp=this.#read(owner,r.workflowId);
  if(!cp||cp.planDigest!==r.planDigest||canonical(cp.entries.map(e=>e.taskId))!==canonical(d.tasks))fail('queue_checkpoint_binding');
  if(d.tasks.some(t=>!g.readOnlyTasks.has(t))||g.readOnlyTasks.size!==d.tasks.length)fail('queue_scope_denied');
  return {cp,d};
 }
 #queueView(owner,r,g,now){
  const {cp,d}=this.#queueBinding(owner,r,g,now),w=this.#readWorker(owner,r.workflowId);
  workerClock(now,r.admittedAt);if(w){workerClock(now,w.lastSeenAt);if(w.planDigest!==r.planDigest)fail('queue_worker_binding');}
  let status='READY';
  if(cp.cancelled)status='CANCELLED';else if(cp.paused)status='PAUSED';
  else if(now>=r.expiresAt||(w&&now>=w.deadline)||cp.entries.some(e=>e.status==='SUCCEEDED'&&(e.verifiedAt>now||now-e.verifiedAt>600000)))status='EXPIRED';
  else if(w?.lease&&now<w.lease.expiresAt)status='BUSY';
  else if(cp.entries.some(e=>e.status==='RUNNING'||e.status==='NEEDS_USER'))status='RECONCILIATION_REQUIRED';
  else if(cp.entries.some(e=>!['PENDING','SUCCEEDED'].includes(e.status)))status='REVIEW_REQUIRED';
  else if(cp.entries.every(e=>e.status==='SUCCEEDED'))status='COMPLETED_METADATA';
  if(status==='READY')for(const request of d.descriptor.requests){
   const c=this.#readContent(owner,r.workflowId,request.inputRef);
   if(!c){status='INPUT_UNAVAILABLE';break;}
   contentTime(c,now);contentBinding(cp,c,true);
  }
  return {record:r,status,checkpointRevision:cp.revision};
 }
 /** Queue guard also protects existing worker/dispatch/content/CAS endpoints, so an old
  * credential cannot bypass admission expiry or substitute a different registered plan. */
 #guardQueueExecution(owner,workflow,context,now){
  if(!this.#queueEnabled())return;const r=this.#readQueue(owner,workflow);if(!r)return;
  this.#queueWatermark(owner,now);
  if(now>=r.expiresAt)fail('queue_admission_expired');
  if(context?.queueDescriptorDigest!==r.descriptorDigest)fail('queue_execution_binding');
  const cp=this.#read(owner,workflow);if(cp?.planDigest!==r.planDigest)fail('queue_checkpoint_binding');
  if(cp.paused||cp.cancelled)fail('queue_workflow_stopped');
 }
 queueOperation(owner,request,context,now=Date.now()){
  this.#contentReady();this.#workerPolicy();if(!this.#queueEnabled())fail('queue_storage_not_initialized');
  const x=queueRequest(parse(Buffer.from(canonical(request)))),ctx=queueContext(context);workerClock(now);
  this.#db.exec('BEGIN IMMEDIATE');
  try{
   this.#queueWatermark(owner,now);let value;
   if(x.operation==='submit'){
    const d=queueDescriptor(x.descriptor),g=ctx.queueGrants.get(x.workflowId);
    const old=this.#readQueue(owner,x.workflowId);
    if(old){
     if(old.planDigest!==x.planDigest||old.descriptorDigest!==d.digest)fail('queue_duplicate_conflict');
     value=[this.#queueView(owner,old,g,now)]; // never reset admission TTL/order on duplicate delivery.
    }else{
     const cp=this.#read(owner,x.workflowId),w=this.#readWorker(owner,x.workflowId);
     const temp={workflowId:x.workflowId,planDigest:x.planDigest,descriptorDigest:d.digest,descriptor:d.descriptor};
     this.#queueBinding(owner,temp,g,now);
     if(cp.paused||cp.cancelled||cp.entries.some(e=>e.status!=='PENDING'||e.invocations!==0))fail('queue_fresh_workflow_required');
     if(w?.lease&&now<w.lease.expiresAt)fail('queue_owner_still_active');
     let until=Math.min(now+600000,g.expiresAt,w?.deadline??Number.MAX_SAFE_INTEGER);
     for(const req of d.descriptor.requests){
      const c=this.#readContent(owner,x.workflowId,req.inputRef);if(!c)fail('queue_input_not_staged');
      contentTime(c,now);contentBinding(cp,c,true);
      if(req.operation==='FIND_MEMORY'&&(c.category!=='INPUT_TEXT'||c.kind!=='QUERY'))fail('queue_input_kind');
      if(req.operation==='READING_PREVIEW'){
       if(c.category!=='INPUT_SOURCE'||c.kind!=='PAGES')fail('queue_input_kind');
       const source=contentParse(Buffer.from(c.payload,'base64'));if(source.pageStart!==req.pageStart||source.pageEnd!==req.pageEnd)fail('queue_source_range');
      }
      until=Math.min(until,c.expiresAt);
     }
     if(until<=now)fail('queue_admission_expired');
     const all=this.#db.prepare('SELECT record_id,sequence,body FROM life_queue WHERE owner_id=?').all(this.#workerOwner(owner));let pending=0;
     for(const row of all){const b=this.#open('queue-v1|'+row.record_id,row.sequence,row.body);let t;try{t=queueRecord(parse(b));}finally{b.fill(0);}
      const state=this.#read(owner,t.workflowId);if(!state)fail('queue_checkpoint_binding');
      if(t.expiresAt>now&&!state.cancelled&&!state.entries.every(e=>e.status==='SUCCEEDED'))pending++;
     }
     if(pending>=64)fail('queue_pending_capacity');
     const sequence=this.#queueWatermark(owner,now,true).sequence;
     const r=queueRecord({...temp,version:1,sequence,admittedAt:now,expiresAt:until});
     const id=this.#identity(owner,x.workflowId),plain=Buffer.from(canonical(r));let encrypted;try{encrypted=this.#seal('queue-v1|'+id,sequence,plain);}finally{plain.fill(0);}
     this.#db.prepare('INSERT INTO life_queue VALUES(?,?,?,?)').run(id,this.#workerOwner(owner),sequence,encrypted);
     const back=this.#readQueue(owner,x.workflowId);if(canonical(back)!==canonical(r))fail('queue_readback_mismatch');
     value=[this.#queueView(owner,back,g,now)];
    }
   }else{
    value=[];for(const [workflow,g] of ctx.queueGrants){
     if(g.expiresAt<=now)continue;const r=this.#readQueue(owner,workflow);if(r)value.push(this.#queueView(owner,r,g,now));
    }
    value.sort((a,b)=>a.record.sequence-b.record.sequence);
   }
   this.#db.exec('COMMIT');return value;
  }catch(e){if(this.#db.isTransaction)this.#db.exec('ROLLBACK');throw e;}
 }
 /** Delegate an already-recorded exact read dispatch. No second task state machine:
  * ticket/one-shot/result pointer live inside the existing encrypted worker dispatch entry.
  * Only the coordinator Session can change checkpoint success; child cannot CAS or renew leases. */
 remoteTaskOperation(owner,request,context,now=Date.now()){
  this.#ready();this.#contentReady();this.#workerPolicy();const x=remoteRequest(request),ctx=remoteContext(context);
  if(ctx.ownerDigest!==owner||ctx.workflowId!==x.workflowId||ctx.planDigest!==x.planDigest||ctx.expiresAt<=now)fail('remote_scope_denied');
  this.#db.exec('BEGIN IMMEDIATE');
  try{
   let w=this.#readWorker(owner,x.workflowId);const cp=this.#read(owner,x.workflowId);
   if(!w||!cp||cp.planDigest!==x.planDigest||w.planDigest!==x.planDigest)fail('remote_workflow_binding');
   workerClock(now,w.lastSeenAt);
   if(!w.lease||now>=w.lease.expiresAt||now>=w.deadline||cp.paused||cp.cancelled)fail('remote_workflow_not_active');
   this.#guardQueueExecution(owner,x.workflowId,ctx,now);
   const coordinator=['offer','result'].includes(x.operation);
   if(coordinator)this.#requireWorker(w,{...ctx,proof:x.proof,readOnlyTasks:new Set(ctx.remoteTasks.keys())},now,cp);
   const specFor=id=>{const spec=ctx.remoteTasks.get(id);if(!spec)fail('remote_scope_denied');return taskSpec(spec);};
   const active=d=>{
    const a=d?.delegate,e=cp.entries.find(e=>e.taskId===d?.taskId),spec=specFor(d?.taskId);
    if(!a||d.fence!==w.fence||!e||e.status!=='RUNNING'||e.invocations!==d.attempt||e.providerId!==a.binding.providerId||
      now<a.offeredAt||now>=a.expiresAt||a.stepDigest!==spec.stepDigest||a.specDigest!==sha(canonical(spec))||a.binding.capability!==spec.capability||
      sha(canonical(stableBinding(a.binding)))!==spec.bindingDigest)fail('remote_ticket_not_current');
    for(const [id,ref]of Object.entries(a.dependencies)){
     const dep=cp.entries.find(e=>e.taskId===id);
     if(!dep||dep.status!=='SUCCEEDED'||dep.receiptRef!==ref||now-dep.verifiedAt<0||now-dep.verifiedAt>600000)fail('remote_dependency_not_verified');
    }
    return {a,e,spec};
   };
   const view=d=>{const {a,e}=active(d);return {ticketId:a.ticketId,taskId:d.taskId,actionDigest:d.actionDigest,attempt:d.attempt,fence:d.fence,
     delegateDigest:a.delegateDigest,stepDigest:a.stepDigest,binding:a.binding,dependencies:a.dependencies,expiresAt:a.expiresAt,
     contentExpiresAt:a.contentExpiresAt,started:a.startedAt!==null,resultReady:a.receiptRef!==null};};
   let value=null;
   if(x.operation==='offer'){
    const spec=specFor(x.taskId),b=remoteBinding(x.binding,now),e=cp.entries.find(e=>e.taskId===x.taskId);
    if(x.delegateDigest===ctx.workerDigest||!ctx.remoteTargets.has(x.delegateDigest)||x.stepDigest!==spec.stepDigest||b.capability!==spec.capability||
      sha(canonical(stableBinding(b)))!==spec.bindingDigest)fail('remote_scope_denied');
    if(!x.dependencies||Array.isArray(x.dependencies)||typeof x.dependencies!=='object'||canonical(Object.keys(x.dependencies).sort())!==canonical([...spec.dependencies].sort()))fail('remote_dependency_not_verified');
    for(const id of spec.dependencies){const dep=cp.entries.find(e=>e.taskId===id);if(!dep||dep.status!=='SUCCEEDED'||dep.receiptRef!==x.dependencies[id])fail('remote_dependency_not_verified');}
    if(!e||e.status!=='RUNNING'||e.providerId!==b.providerId||e.invocations<1||
      x.actionDigest!==sha([cp.planDigest,x.taskId,e.invocations,b.providerId,b.toolName,b.descriptorDigest].join('|')))fail('remote_action_binding');
    const d=w.dispatches.find(d=>d.taskId===x.taskId&&d.attempt===e.invocations);
    if(!d||d.fence!==w.fence||d.actionDigest!==x.actionDigest)fail('remote_dispatch_not_recorded');
    if(d.delegate)fail('remote_offer_replay');
    let contentExpiresAt=Math.min(ctx.expiresAt,now+600000);
    if(this.#queueEnabled()){const q=this.#readQueue(owner,x.workflowId);if(q)contentExpiresAt=Math.min(contentExpiresAt,q.expiresAt);}
    for(const ref of spec.inputRefs){const c=this.#readContent(owner,x.workflowId,ref);if(!c)fail('remote_input_missing');contentTime(c,now);contentBinding(cp,c,true);contentExpiresAt=Math.min(contentExpiresAt,c.expiresAt);}
    const expiresAt=Math.min(b.expiresAt,w.lease.expiresAt,w.deadline,contentExpiresAt,now+60000);
    if(expiresAt<=now)fail('remote_expired');
    d.delegate={ticketId:'remote_'+randomBytes(16).toString('hex'),delegateDigest:x.delegateDigest,stepDigest:x.stepDigest,specDigest:sha(canonical(spec)),binding:b,
      dependencies:x.dependencies,offeredAt:now,expiresAt,contentExpiresAt,startedAt:null,receiptRef:null};
    w=this.#writeWorker(owner,{...w,lastSeenAt:now});value=view(w.dispatches.find(t=>t.taskId===d.taskId&&t.attempt===d.attempt));
   }else if(x.operation==='list'){
    value=w.dispatches.filter(d=>d.delegate?.delegateDigest===ctx.workerDigest&&ctx.remoteTasks.has(d.taskId)&&d.delegate.startedAt===null&&d.fence===w.fence&&now<d.delegate.expiresAt&&cp.entries.some(e=>e.taskId===d.taskId&&e.status==='RUNNING')).map(view);
   }else{
    const d=w.dispatches.find(d=>d.delegate?.ticketId===x.ticketId);if(!d)fail('remote_ticket_unknown');
    const {a,e,spec}=active(d);
    if(!coordinator&&a.delegateDigest!==ctx.workerDigest)fail('remote_scope_denied');
    if(coordinator&&!ctx.remoteTargets.has(a.delegateDigest))fail('remote_scope_denied');
    if(x.operation==='begin'){
     if(a.startedAt!==null)fail('remote_begin_replay');a.startedAt=now;w=this.#writeWorker(owner,{...w,lastSeenAt:now});value=view(d);
    }else if(x.operation==='current')value=view(d);
    else if(x.operation==='result'){
     if(a.receiptRef!==null){const r=this.#readContent(owner,x.workflowId,a.receiptRef);value=verifiedStagedResult(cp,e,d,r,{kind:spec.kind,verificationKey:spec.verificationKey},{expiresAt:Math.min(ctx.expiresAt,a.contentExpiresAt)},now);}
    }else{
     if(a.startedAt===null)fail('remote_not_started');
     if(x.operation==='snapshot')value=cp;
     else if(x.operation==='get'){
      if(x.category==='RESULT_TEXT'){if(!Object.values(a.dependencies).includes(x.ref))fail('remote_content_scope');}
      else if(!spec.inputRefs.includes(x.ref))fail('remote_content_scope');
      value=this.#readContent(owner,x.workflowId,x.ref);if(value){contentTime(value,now);contentBinding(cp,value,true);if(value.category!==x.category||value.expiresAt>ctx.expiresAt)fail('remote_content_scope');}
     }else if(x.operation==='put'){
      if(cp.revision!==x.expectedRevision)fail('checkpoint_conflict');
      if(a.receiptRef!==null)fail('remote_result_replay');
      const r=verifiedStagedResult(cp,e,d,x.record,{kind:spec.kind,verificationKey:spec.verificationKey},{expiresAt:Math.min(ctx.expiresAt,a.contentExpiresAt)},now);
      if(r.verifiedAt<a.startedAt)fail('remote_evidence_predates_execution');
      contentBinding(cp,r,false);value=this.#saveContent(owner,r);a.receiptRef=r.ref;
      w=this.#writeWorker(owner,{...w,lastSeenAt:now});
     }
    }
   }
   if(!['offer','begin','put'].includes(x.operation))this.#writeWorker(owner,{...w,lastSeenAt:now});
   this.#db.exec('COMMIT');return value;
  }catch(e){if(this.#db.isTransaction)this.#db.exec('ROLLBACK');throw e;}
 }
 /** Explicit optional migration in the existing database; normal open never adds this schema. */
 initializeGeminiMediaStorage(){
  this.#ready();if(this.#db.isTransaction)fail('gemini_media_nested_transaction');this.#db.exec('BEGIN IMMEDIATE');
  try{
   const existing=this.#db.prepare('SELECT name FROM sqlite_master WHERE name IN (?,?,?,?)').all(...GEMINI_TABLES);
   if(existing.length){this.assertGeminiMediaReady();this.#db.exec('COMMIT');return Object.freeze({initialized:false});}
   this.#db.exec('CREATE TABLE life_gemini_media_meta(id INTEGER PRIMARY KEY CHECK(id=1), proof BLOB NOT NULL); '+
    'CREATE TABLE life_gemini_media_jobs(record_id TEXT PRIMARY KEY, task_id TEXT NOT NULL UNIQUE, revision INTEGER NOT NULL CHECK(revision>0), body BLOB NOT NULL); '+
    'CREATE TABLE life_gemini_media_budgets(record_id TEXT PRIMARY KEY, revision INTEGER NOT NULL CHECK(revision>0), body BLOB NOT NULL); '+
    'CREATE TABLE life_gemini_media_outputs(record_id TEXT PRIMARY KEY, body BLOB NOT NULL);');
   const plain=Buffer.from('jh-life-gemini-media-v1');
   try{this.#db.prepare('INSERT INTO life_gemini_media_meta VALUES(1,?)').run(this.#seal('gemini-media-metadata-v1',1,plain));}finally{plain.fill(0);}
   this.assertGeminiMediaReady();this.#db.exec('COMMIT');return Object.freeze({initialized:true});
  }catch(e){try{if(this.#db.isTransaction)this.#db.exec('ROLLBACK');}catch{}throw e;}
 }
 assertGeminiMediaReady(){
  this.#ready();
  const tables=this.#db.prepare('SELECT name,type FROM sqlite_master WHERE name IN (?,?,?,?)').all(...GEMINI_TABLES);
  if(!tables.length)fail('gemini_media_storage_not_initialized');
  if(tables.length!==GEMINI_TABLES.length||tables.some(t=>t.type!=='table'))fail('gemini_media_storage_schema_invalid');
  let meta;
  try{
   meta=this.#db.prepare('SELECT proof FROM life_gemini_media_meta WHERE id=1').get();
   this.#db.prepare('SELECT record_id,task_id,revision,body FROM life_gemini_media_jobs LIMIT 0').all();
   this.#db.prepare('SELECT record_id,revision,body FROM life_gemini_media_budgets LIMIT 0').all();
   this.#db.prepare('SELECT record_id,body FROM life_gemini_media_outputs LIMIT 0').all();
  }catch{fail('gemini_media_storage_schema_invalid');}
  if(!meta)fail('gemini_media_storage_schema_invalid');
  const plain=this.#open('gemini-media-metadata-v1',1,meta.proof);
  try{if(plain.toString()!=='jh-life-gemini-media-v1')fail('gemini_media_storage_schema_invalid');}finally{plain.fill(0);}
  return Object.freeze({geminiMedia:true,initialized:false});
 }
 #geminiId(kind,owner,requestId=null){
  if(!isHex(owner)||(kind!=='budget'&&!isId(requestId)))fail('gemini_media_identity_invalid');
  return createHmac('sha256',this.#key).update('jh-life-gemini-'+kind+'-row-v1|'+owner+(kind==='budget'?'':'|'+requestId)).digest('hex');
 }
 #geminiTaskId(owner,taskRef,kind){
  if(!isHex(owner)||!isId(taskRef)||!['analysis','generation'].includes(kind))fail('gemini_media_task_identity_invalid');
  return createHmac('sha256',this.#key).update('jh-life-gemini-task-row-v1|'+owner+'|'+taskRef+'|'+kind).digest('hex');
 }
 #geminiReadRecord(kind,owner,requestId=null){
  const id=this.#geminiId(kind,owner,requestId),table=kind==='job'?'life_gemini_media_jobs':'life_gemini_media_budgets';
  const row=this.#db.prepare(`SELECT revision,body${kind==='job'?',task_id':''} FROM ${table} WHERE record_id=?`).get(id);
  if(!row)return {value:null,revision:0,text:'null'};
  if(!Number.isSafeInteger(row.revision)||row.revision<1)fail('gemini_media_record_invalid');
  const plain=this.#open('gemini-media-'+kind+'-v1|'+id,row.revision,row.body,GEMINI_JSON_MAX_BYTES+28);
  try{
   const value=geminiParsed(plain);
   if(value===null||(kind==='job'&&value.requestId!==requestId))fail('gemini_media_record_binding');
   if(kind==='job'&&row.task_id!==this.#geminiTaskId(owner,value.taskRef,value.kind))fail('gemini_media_record_binding');
   return {value,revision:row.revision,text:plain.toString('utf8'),taskId:row.task_id};
  }finally{plain.fill(0);}
 }
 #geminiWriteRecord(kind,owner,requestId,old,text){
  if(text===old.text)return;
  if(text==='null')fail('gemini_media_record_delete_forbidden');
  if(old.revision>=Number.MAX_SAFE_INTEGER)fail('gemini_media_revision_exhausted');
  const id=this.#geminiId(kind,owner,requestId),revision=old.revision+1,plain=Buffer.from(text);
  let body;try{body=this.#seal('gemini-media-'+kind+'-v1|'+id,revision,plain);}finally{plain.fill(0);}
  if(kind==='job'){
   const value=JSON.parse(text),taskId=this.#geminiTaskId(owner,value.taskRef,value.kind);
   if(old.revision&&old.taskId!==taskId)fail('gemini_media_record_binding');
   const conflict=this.#db.prepare('SELECT record_id FROM life_gemini_media_jobs WHERE task_id=?').get(taskId);
   if(conflict&&conflict.record_id!==id)fail('gemini_media_task_conflict');
   this.#db.prepare('INSERT INTO life_gemini_media_jobs(record_id,task_id,revision,body) VALUES(?,?,?,?) ON CONFLICT(record_id) DO UPDATE SET revision=excluded.revision,body=excluded.body').run(id,taskId,revision,body);
  }else this.#db.prepare('INSERT INTO life_gemini_media_budgets(record_id,revision,body) VALUES(?,?,?) ON CONFLICT(record_id) DO UPDATE SET revision=excluded.revision,body=excluded.body').run(id,revision,body);
 }
 #geminiReadTransaction(read){
  this.#ready();if(this.#db.isTransaction)fail('gemini_media_nested_transaction');this.#db.exec('BEGIN');
  try{this.assertGeminiMediaReady();const result=read();this.#db.exec('COMMIT');return result;}
  catch(e){try{if(this.#db.isTransaction)this.#db.exec('ROLLBACK');}catch{}throw e;}
 }
 readGeminiMedia(owner,requestId){
  return this.#geminiReadTransaction(()=>({job:this.#geminiReadRecord('job',owner,requestId).value,budget:this.#geminiReadRecord('budget',owner).value}));
 }
 readGeminiMediaBudget(owner){return this.#geminiReadTransaction(()=>this.#geminiReadRecord('budget',owner).value);}
 findGeminiMediaJob(owner,taskRef,kind){
  return this.#geminiReadTransaction(()=>{
   const taskId=this.#geminiTaskId(owner,taskRef,kind),row=this.#db.prepare('SELECT record_id,revision,body FROM life_gemini_media_jobs WHERE task_id=?').get(taskId);
   if(!row)return null;
   if(!Number.isSafeInteger(row.revision)||row.revision<1)fail('gemini_media_record_invalid');
   const plain=this.#open('gemini-media-job-v1|'+row.record_id,row.revision,row.body,GEMINI_JSON_MAX_BYTES+28);
   try{
    const value=geminiParsed(plain);
    if(value===null||value.taskRef!==taskRef||value.kind!==kind||this.#geminiId('job',owner,value.requestId)!==row.record_id)fail('gemini_media_record_binding');
    return value;
   }finally{plain.fill(0);}
  });
 }
 /** A synchronous reservation/state transition plus authenticated readback is one write transaction. */
 transactGeminiMedia(owner,requestId,callback){
  this.#ready();this.#geminiId('job',owner,requestId);
  if(typeof callback!=='function')fail('gemini_media_callback_invalid');
  if(this.#db.isTransaction)fail('gemini_media_nested_transaction');this.#db.exec('BEGIN IMMEDIATE');
  try{
   this.assertGeminiMediaReady();
   const oldJob=this.#geminiReadRecord('job',owner,requestId),oldBudget=this.#geminiReadRecord('budget',owner);
   const outcome=callback({job:oldJob.value,budget:oldBudget.value});
   if(outcome instanceof Promise){outcome.catch(()=>{});fail('gemini_media_callback_must_be_synchronous');}
   geminiEnvelope(outcome,'job budget result','gemini_media_transaction_invalid');
   const jobText=geminiJsonText(outcome.job),budgetText=geminiJsonText(outcome.budget);
   const checkedJob=JSON.parse(jobText);
   if(checkedJob!==null&&checkedJob.requestId!==requestId)fail('gemini_media_record_binding');
   if((oldJob.value!==null&&checkedJob===null)||(oldBudget.value!==null&&budgetText==='null'))fail('gemini_media_record_delete_forbidden');
   this.#geminiWriteRecord('job',owner,requestId,oldJob,jobText);
   this.#geminiWriteRecord('budget',owner,null,oldBudget,budgetText);
   if(this.#geminiReadRecord('job',owner,requestId).text!==jobText||this.#geminiReadRecord('budget',owner).text!==budgetText)fail('gemini_media_readback_mismatch');
   this.#db.exec('COMMIT');return outcome.result;
  }catch(e){try{if(this.#db.isTransaction)this.#db.exec('ROLLBACK');}catch{}throw e;}
 }
 #geminiReadOutput(owner,requestId){
  const id=this.#geminiId('output',owner,requestId),row=this.#db.prepare('SELECT body FROM life_gemini_media_outputs WHERE record_id=?').get(id);
  if(!row)return null;
  const plain=this.#open('gemini-media-output-v1|'+id,1,row.body,GEMINI_OUTPUT_MAX_BYTES+1024);
  try{
   if(plain.length<5)fail('gemini_media_output_invalid');
   const headerLength=plain.readUInt32BE(0);
   if(headerLength<2||headerLength>996||4+headerLength>=plain.length)fail('gemini_media_output_invalid');
   const meta=geminiEnvelope(geminiParsed(plain.subarray(4,4+headerLength)),'requestId mimeType sha256 byteLength','gemini_media_output_invalid');
   const data=plain.subarray(4+headerLength);
   if(meta.requestId!==requestId||meta.mimeType!=='video/mp4'||!isHex(meta.sha256)||meta.byteLength!==data.length||
     data.length>GEMINI_OUTPUT_MAX_BYTES||sha(data)!==meta.sha256)fail('gemini_media_output_invalid');
   return {mimeType:meta.mimeType,sha256:meta.sha256,bytes:Buffer.from(data)};
  }finally{plain.fill(0);}
 }
 putGeminiMediaOutput(owner,requestId,value){
  this.#ready();this.#geminiId('output',owner,requestId);
  geminiEnvelope(value,'mimeType bytes sha256','gemini_media_output_invalid');
  if(value.mimeType!=='video/mp4'||!Buffer.isBuffer(value.bytes)||value.bytes.length<1||value.bytes.length>GEMINI_OUTPUT_MAX_BYTES||!isHex(value.sha256))fail('gemini_media_output_invalid');
  if(this.#db.isTransaction)fail('gemini_media_nested_transaction');
  const bytes=Buffer.from(value.bytes),receipt=Object.freeze({mimeType:value.mimeType,sha256:value.sha256,byteLength:bytes.length});
  try{
   if(sha(bytes)!==value.sha256)fail('gemini_media_output_digest_mismatch');
   this.#db.exec('BEGIN IMMEDIATE');
   try{
    this.assertGeminiMediaReady();
    if(this.#geminiReadRecord('job',owner,requestId).value===null)fail('gemini_media_job_missing');
    const old=this.#geminiReadOutput(owner,requestId);
    if(old){
     try{if(old.mimeType!==value.mimeType||old.sha256!==value.sha256||old.bytes.length!==bytes.length||!timingSafeEqual(old.bytes,bytes))fail('gemini_media_output_immutable_conflict');}
     finally{old.bytes.fill(0);}
    }else{
     const header=Buffer.from(geminiJsonText({requestId,...receipt})),length=Buffer.alloc(4);length.writeUInt32BE(header.length);
     const plain=Buffer.concat([length,header,bytes]),id=this.#geminiId('output',owner,requestId);
     let encrypted;try{encrypted=this.#seal('gemini-media-output-v1|'+id,1,plain);}finally{plain.fill(0);header.fill(0);}
     this.#db.prepare('INSERT INTO life_gemini_media_outputs(record_id,body) VALUES(?,?)').run(id,encrypted);
    }
    const back=this.#geminiReadOutput(owner,requestId);
    try{if(!back||back.mimeType!==value.mimeType||back.sha256!==value.sha256||back.bytes.length!==bytes.length||!timingSafeEqual(back.bytes,bytes))fail('gemini_media_output_readback_mismatch');}
    finally{back?.bytes.fill(0);}
    this.#db.exec('COMMIT');return receipt;
   }catch(e){try{if(this.#db.isTransaction)this.#db.exec('ROLLBACK');}catch{}throw e;}
  }finally{bytes.fill(0);}
 }
 loadGeminiMediaOutput(owner,requestId){
  return this.#geminiReadTransaction(()=>this.#geminiReadRecord('job',owner,requestId).value===null?null:this.#geminiReadOutput(owner,requestId));
 }
 close(){if(this.#closed)return;this.#closed=true;try{this.#db.close();}finally{this.#key.fill(0);}}
}
