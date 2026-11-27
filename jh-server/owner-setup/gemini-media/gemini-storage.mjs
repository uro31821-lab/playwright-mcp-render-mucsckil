/** Gemini media addon for the existing encrypted life.sqlite store.
 * The base constructor owns path, key and metadata proof validation. This addon
 * opens a second connection to that same physical database and copies the same
 * key; it never creates another database or implicitly migrates Gemini tables.
 */
import {DatabaseSync} from 'node:sqlite';
import {createCipheriv,createDecipheriv,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {LifeCheckpointStore} from '../server-continuation/life-checkpoint-store.mjs';
import {isId,isHex,sha,fail} from '../server-continuation/life-checkpoint-wire.mjs';

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
export class GeminiLifeCheckpointStore extends LifeCheckpointStore {
 #db;#key;#server;#closed=false;
 constructor(options){
  super(options);
  try{
   this.#key=Buffer.from(options.key);this.#server=this.serverDigest;
   this.#db=new DatabaseSync(this.databasePath,{timeout:1000});
   this.#db.exec('PRAGMA trusted_schema=OFF; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;');
  }catch(e){
   try{this.#db?.close();}catch{}
   this.#key?.fill(0);
   try{super.close();}catch{}
   this.#closed=true;throw e;
  }
 }
 #aad(id,rev){return Buffer.from('jh-life-state-v1|'+this.#server+'|'+id+'|'+rev);}
 #seal(id,rev,plain){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',this.#key,iv);c.setAAD(this.#aad(id,rev));return Buffer.concat([iv,c.update(plain),c.final(),c.getAuthTag()]);}
 #open(id,rev,encrypted,maxBytes=66000){try{const b=Buffer.from(encrypted);if(b.length<28||b.length>maxBytes)fail('checkpoint_cipher_size');const c=createDecipheriv('aes-256-gcm',this.#key,b.subarray(0,12));c.setAAD(this.#aad(id,rev));c.setAuthTag(b.subarray(-16));return Buffer.concat([c.update(b.subarray(12,-16)),c.final()]);}catch{fail('checkpoint_unreadable_or_tampered');}}
 #ready(){if(this.#closed)fail('checkpoint_store_closed');}
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
 close(){
  if(this.#closed)return;this.#closed=true;
  try{this.#db.close();}finally{try{this.#key.fill(0);}finally{super.close();}}
 }
}
