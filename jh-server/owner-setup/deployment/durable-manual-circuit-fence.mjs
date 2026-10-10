/** Opt-in durable, HMAC-only Circuit restart fence. No dispatch, retry or authority. */
import {DatabaseSync} from 'node:sqlite';
import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {lstatSync,realpathSync,chmodSync,existsSync} from 'node:fs';
import {isAbsolute,dirname,resolve} from 'node:path';
const fail=c=>{throw Object.assign(new Error(c),{code:c});};
const obj=x=>!!x&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
const hex=x=>typeof x==='string'&&/^[0-9a-f]{64}$/.test(x);
const id=x=>typeof x==='string'&&/^[0-9a-f]{32}$/.test(x);
const canon=x=>{
 if(x===null||typeof x==='string'||typeof x==='boolean'||Number.isSafeInteger(x))return JSON.stringify(x);
 if(Array.isArray(x))return '['+x.map(canon).join(',')+']';
 if(obj(x))return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canon(x[k])).join(',')+'}';
 fail('JOURNAL_PAYLOAD_INVALID');
};
function verifyPath(p,existing){
 if(typeof p!=='string'||!isAbsolute(p)||resolve(p)!==p||p.includes('\0'))fail('JOURNAL_PATH_INVALID');
 const d=dirname(p),st=lstatSync(d);
 if(!st.isDirectory()||st.isSymbolicLink()||realpathSync(d)!==d||(st.mode&0o077)!==0)fail('JOURNAL_DIRECTORY_NOT_PRIVATE');
 const has=existsSync(p);if(existing&&!has)fail('JOURNAL_MISSING_REVIEW_REQUIRED');if(!existing&&has)fail('JOURNAL_EXISTS_NO_RESET');
 if(has){const v=lstatSync(p);if(!v.isFile()||v.isSymbolicLink()||v.nlink!==1||(v.mode&0o077)!==0)fail('JOURNAL_FILE_UNSAFE');}
}
const MAX_ROWS=10000,MAX_UNKNOWN=512;
export class DurableManualCircuitFence {
 #db;#key;#namespace;#clock;#verify;#closed=false;
 constructor({file,key,namespace,clock=Date.now,mode='read',verifyAuthenticatedCompletion}={}){
  if(!Buffer.isBuffer(key)||key.length!==32||!hex(namespace)||typeof clock!=='function'||typeof verifyAuthenticatedCompletion!=='function')fail('JOURNAL_CONFIGURATION_INVALID');
  if(!['read','EXPLICIT_ONE_TIME'].includes(mode))fail('JOURNAL_INIT_EXPLICIT_ONLY');
  verifyPath(file,mode==='read');
  this.#key=Buffer.from(key);this.#namespace=namespace;this.#clock=clock;this.#verify=verifyAuthenticatedCompletion;
  let db;
  try{
   db=new DatabaseSync(file,{timeout:4000});chmodSync(file,0o600);
   db.exec('PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=4000;');
   if(mode==='EXPLICIT_ONE_TIME'){
    db.exec("CREATE TABLE circuit_meta(k TEXT PRIMARY KEY, v TEXT NOT NULL);"+
      "CREATE TABLE circuit_actions(record_id TEXT PRIMARY KEY, operation_hmac TEXT NOT NULL, status TEXT NOT NULL,"+
      "created_ms INTEGER NOT NULL, completed_ms INTEGER, result_hmac TEXT,"+
      "CHECK(status IN ('OUTCOME_UNKNOWN','DEVICE_RESULT_RECEIVED')),"+
      "CHECK(length(operation_hmac)=64));"+
      "CREATE UNIQUE INDEX circuit_one_unknown ON circuit_actions(operation_hmac) WHERE status='OUTCOME_UNKNOWN';");
    db.prepare('INSERT INTO circuit_meta VALUES(?,?)').run('version','1');
    db.prepare('INSERT INTO circuit_meta VALUES(?,?)').run('binding',this.#mac('JH_MANUAL_CIRCUIT_KEY_V1|'+namespace));
   }else{
    if(!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='circuit_actions'").get())fail('JOURNAL_SCHEMA_MISSING');
    if(db.prepare('SELECT v FROM circuit_meta WHERE k=?').get('version')?.v!=='1')fail('JOURNAL_SCHEMA_INVALID');
    const expected=this.#mac('JH_MANUAL_CIRCUIT_KEY_V1|'+namespace),actual=db.prepare('SELECT v FROM circuit_meta WHERE k=?').get('binding')?.v;
    if(!hex(actual)||!timingSafeEqual(Buffer.from(actual,'hex'),Buffer.from(expected,'hex')))fail('JOURNAL_KEY_OR_NAMESPACE_MISMATCH');
   }
   this.#db=db;
  }catch(e){try{db?.close()}catch{}this.#key.fill(0);throw e}
 }
 #mac(s){return createHmac('sha256',this.#key).update(s).digest('hex')}
 #ready(){if(this.#closed)fail('JOURNAL_CLOSED')}
 #now(){const n=this.#clock();if(!Number.isSafeInteger(n)||n<=0)fail('JOURNAL_CLOCK_INVALID');return n}
 #fingerprint({deviceId,type,payload}={}){
  if(typeof deviceId!=='string'||deviceId.length<1||deviceId.length>128||
    typeof type!=='string'||type.length<1||type.length>48||!obj(payload))fail('JOURNAL_OPERATION_INVALID');
  const material=canon([deviceId,type,payload]);if(Buffer.byteLength(material)>16384)fail('JOURNAL_PAYLOAD_TOO_LARGE');
  return this.#mac('JH_MANUAL_ACTION_V1|'+this.#namespace+'|'+material);
 }
 /** Must be called synchronously before an already authorized job is exposed to device poll. */
 reserveDispatch(command){
  this.#ready();const fp=this.#fingerprint(command),n=this.#now();
  this.#db.exec('BEGIN IMMEDIATE');
  try{
   const old=this.#db.prepare("SELECT record_id FROM circuit_actions WHERE operation_hmac=? AND status='OUTCOME_UNKNOWN'").get(fp);
   if(old){this.#db.exec('ROLLBACK');return Object.freeze({allowed:false,code:'PREVIOUS_OUTCOME_UNKNOWN_RECONCILE_REQUIRED',automaticRetryAllowed:false});}
   const count=this.#db.prepare('SELECT COUNT(*) n FROM circuit_actions').get().n;
   const pending=this.#db.prepare("SELECT COUNT(*) n FROM circuit_actions WHERE status='OUTCOME_UNKNOWN'").get().n;
   if(count>=MAX_ROWS||pending>=MAX_UNKNOWN)fail('JOURNAL_CAPACITY_REVIEW_REQUIRED');
   const recordId=randomBytes(16).toString('hex');
   this.#db.prepare('INSERT INTO circuit_actions VALUES(?,?,?, ?,NULL,NULL)').run(recordId,fp,'OUTCOME_UNKNOWN',n);
   this.#db.exec('COMMIT');
   return Object.freeze({allowed:true,code:'DURABLE_DISPATCH_RECORDED',recordId,taskSuccessVerified:false});
  }catch(e){try{this.#db.exec('ROLLBACK')}catch{}throw e}
 }
 /** Call ONLY after authenticated HTTP completion acceptance; transport receipt is not task success. */
 recordAuthenticatedDeviceResult({recordId,resultDigest,hostEvidence}={}){
  this.#ready();if(!id(recordId)||!hex(resultDigest))fail('JOURNAL_RECEIPT_INVALID');
  if(this.#verify({recordId,resultDigest,hostEvidence})!==true)fail('JOURNAL_RECEIPT_NOT_AUTHENTICATED');
  const now=this.#now(),proof=this.#mac('JH_RECEIPT_V1|'+resultDigest);
  this.#db.exec('BEGIN IMMEDIATE');
  try{
   const row=this.#db.prepare('SELECT * FROM circuit_actions WHERE record_id=?').get(recordId);
   if(!row)fail('JOURNAL_RECORD_NOT_FOUND');
   if(row.status==='DEVICE_RESULT_RECEIVED'){
    if(row.result_hmac!==proof)fail('JOURNAL_RESULT_CONFLICT');
    this.#db.exec('ROLLBACK');
    return Object.freeze({recorded:false,code:'DEVICE_RESULT_ALREADY_RECORDED',taskSuccessVerified:false});
   }
   if(row.status!=='OUTCOME_UNKNOWN'||now<row.created_ms)fail('JOURNAL_STATE_INVALID');
   this.#db.prepare('UPDATE circuit_actions SET status=?,completed_ms=?,result_hmac=? WHERE record_id=? AND status=?')
     .run('DEVICE_RESULT_RECEIVED',now,proof,recordId,'OUTCOME_UNKNOWN');
   this.#db.exec('COMMIT');
   return Object.freeze({recorded:true,code:'DEVICE_RESULT_RECEIVED',taskSuccessVerified:false});
  }catch(e){try{this.#db.exec('ROLLBACK')}catch{}throw e}
 }
 inspect(command){
  this.#ready();
  return Object.freeze({blocked:!!this.#db.prepare("SELECT 1 FROM circuit_actions WHERE operation_hmac=? AND status='OUTCOME_UNKNOWN'").get(this.#fingerprint(command)),automaticRetryAllowed:false,taskSuccessVerified:false});
 }
 counts(){
  this.#ready();return Object.freeze({
   uncertain:this.#db.prepare("SELECT COUNT(*) n FROM circuit_actions WHERE status='OUTCOME_UNKNOWN'").get().n,
   received:this.#db.prepare("SELECT COUNT(*) n FROM circuit_actions WHERE status='DEVICE_RESULT_RECEIVED'").get().n,
   automaticRetryAllowed:false});
 }
 close(){if(this.#closed)return;this.#closed=true;try{this.#db.close()}finally{this.#key.fill(0)}}
}
