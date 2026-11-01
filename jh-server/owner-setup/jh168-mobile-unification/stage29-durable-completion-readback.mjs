/**
 * Stage29 source-only candidate: exact original Secure56 CLICK result receipt
 * bound to the EXISTING private manual-circuit SQLite journal.
 *
 * No MCP/HTTP registration. No action dispatch, session authorization, new
 * database, token replay, Android source, key material or UI payload storage.
 * This is NOT live until the original owner-bound host integration is reviewed.
 */
import {DatabaseSync} from 'node:sqlite';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {lstatSync,realpathSync,existsSync} from 'node:fs';
import {isAbsolute,resolve,dirname} from 'node:path';

const fail=code=>{throw Object.assign(Error(code),{code});};
const hex64=x=>typeof x==='string'&&/^[0-9a-f]{64}$/.test(x);
const hex32=x=>typeof x==='string'&&/^[0-9a-f]{32}$/.test(x);
const token=x=>typeof x==='string'&&x.length>0&&x.length<=128&&/^[A-Za-z0-9_-]+$/.test(x);
const equal=(a,b)=>hex64(a)&&hex64(b)&&
  timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  Object.getPrototypeOf(x)===Object.prototype;
const FIELDS=['ownerDigest','deviceId','deviceDigest','secureSessionId',
  'jobId','commandId','taskDigest','requestId','contextId',
  'targetItemRef','commandDigest','expiresAtMs'];
const SCHEMA='JH_STAGE29_RECEIVED_READBACK_V1';
const bound=x=>{
 if(!obj(x)||Object.keys(x).length!==FIELDS.length||FIELDS.some(k=>!Object.hasOwn(x,k))||
    !hex64(x.ownerDigest)||!hex64(x.deviceDigest)||!hex64(x.taskDigest)||
    !hex64(x.commandDigest)||!hex32(x.commandId)||!hex32(x.requestId)||
    !token(x.deviceId)||!token(x.secureSessionId)||!/^job_[0-9]+$/.test(x.jobId)||
    !/^ssc_[a-f0-9]{32}$/.test(x.contextId)||
    !/^item_[a-f0-9]{16}$/.test(x.targetItemRef)||
    !Number.isSafeInteger(x.expiresAtMs)||x.expiresAtMs<=0)
  fail('STAGE29_ORIGINAL_BINDING_REQUIRED');
 return x;
};
const canonical=x=>{
 if(x===null||typeof x==='string'||typeof x==='boolean'||Number.isSafeInteger(x))return JSON.stringify(x);
 if(Array.isArray(x))return '['+x.map(canonical).join(',')+']';
 if(obj(x))return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';
 fail('STAGE29_CANONICAL_INVALID');
};
const unknown=code=>Object.freeze({ok:false,code,readOnly:true,
  originalJobReexecuted:false,newJobCreated:false,automaticReplay:false,
  replayAllowed:false,uiTransitionVerified:false,executionStatus:'UNKNOWN'});
const requirePrivateJournal=file=>{
 if(typeof file!=='string'||!isAbsolute(file)||resolve(file)!==file||file.includes('\0'))
  fail('STAGE29_PATH_INVALID');
 const directory=dirname(file),d=lstatSync(directory);
 if(!d.isDirectory()||d.isSymbolicLink()||realpathSync(directory)!==directory||
    (d.mode&0o077)!==0||(typeof process.getuid==='function'&&d.uid!==process.getuid()))
  fail('STAGE29_PRIVATE_DIRECTORY_REQUIRED');
 if(!existsSync(file))fail('STAGE29_ORIGINAL_JOURNAL_MISSING_NO_INITIALIZATION');
 const f=lstatSync(file);
 if(!f.isFile()||f.isSymbolicLink()||f.nlink!==1||
    (f.mode&0o077)!==0||(typeof process.getuid==='function'&&f.uid!==process.getuid()))
  fail('STAGE29_ORIGINAL_JOURNAL_UNSAFE');
};

export class Stage29DurableCompletionReadback {
 #db;#key;#namespace;#now;#authorize;#closed=false;
 constructor({file,key,namespace,mode='read',clock=Date.now,authorizeRead}={}){
  if(!Buffer.isBuffer(key)||key.length!==32||!hex64(namespace)||
     !['read','EXPLICIT_ONE_TIME_ADDON'].includes(mode)||
     typeof clock!=='function'||typeof authorizeRead!=='function')
   fail('STAGE29_HOST_CONFIGURATION_REQUIRED');
  requirePrivateJournal(file);
  this.#key=Buffer.from(key);this.#namespace=namespace;
  this.#now=clock;this.#authorize=authorizeRead;
  let db;
  try{
   db=new DatabaseSync(file,{timeout:4000});
   db.exec('PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=4000;');
   this.#db=db;
   const version=db.prepare("SELECT v FROM circuit_meta WHERE k='version'").get()?.v;
   const binding=db.prepare("SELECT v FROM circuit_meta WHERE k='binding'").get()?.v;
   if(version!=='1'||!equal(binding,this.#mac('JH_MANUAL_CIRCUIT_KEY_V1|'+namespace)))
    fail('STAGE29_ORIGINAL_JOURNAL_OWNER_BINDING_MISMATCH');
   if(!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='circuit_actions'").get())
    fail('STAGE29_ORIGINAL_JOURNAL_MISSING');
   if(mode==='EXPLICIT_ONE_TIME_ADDON')this.#initializeAddon();
   this.#checkAddon();
  }catch(e){try{db?.close()}catch{};this.#key.fill(0);throw e}
 }
 #mac(input){return createHmac('sha256',this.#key).update(input).digest('hex')}
 #ready(){
  if(this.#closed)fail('STAGE29_CLOSED');
 }
 #clock(){
  const at=this.#now();
  if(!Number.isSafeInteger(at)||at<=0)fail('STAGE29_CLOCK_INVALID');
  return at;
 }
 #scope(x){
  return this.#mac('JH_STAGE29_SCOPE_V1|'+this.#namespace+'|'+canonical(FIELDS.map(k=>x[k])));
 }
 #operation(x){
  const semantic={contextId:x.contextId,requestId:x.requestId,
    action:'CLICK',targetItemRef:x.targetItemRef,commandDigest:x.commandDigest};
  return this.#mac('JH_MANUAL_ACTION_V1|'+this.#namespace+'|'+
    canonical([x.deviceId,'split_screen_session_followup',semantic]));
 }
 #rowMac(scope,recordId,operation,result,received,expires){
  return this.#mac('JH_STAGE29_ROW_V1|'+this.#namespace+'|'+
    canonical([scope,recordId,operation,result,received,expires]));
 }
 #initializeAddon(){
  const db=this.#db;
  db.exec('BEGIN IMMEDIATE');
  try{
   const existing=db.prepare("SELECT 1 FROM sqlite_master WHERE name IN ('stage29_receipt_meta','stage29_received_results') LIMIT 1").get();
   if(existing)fail('STAGE29_ADDON_ALREADY_PRESENT_NO_RESET');
   db.exec("CREATE TABLE stage29_receipt_meta(k TEXT PRIMARY KEY,v TEXT NOT NULL);"+
    "CREATE TABLE stage29_received_results("+
    "scope_hmac TEXT PRIMARY KEY,record_id TEXT NOT NULL REFERENCES circuit_actions(record_id),"+
    "operation_hmac TEXT NOT NULL,result_hmac TEXT NOT NULL,"+
    "received_ms INTEGER NOT NULL,expires_ms INTEGER NOT NULL,row_mac TEXT NOT NULL,"+
    "CHECK(length(scope_hmac)=64 AND length(operation_hmac)=64 AND length(result_hmac)=64 AND length(row_mac)=64),"+
    "CHECK(received_ms<expires_ms));"+
    "CREATE TRIGGER stage29_no_receipt_update BEFORE UPDATE ON stage29_received_results "+
    "BEGIN SELECT RAISE(ABORT,'STAGE29_RECEIPT_IMMUTABLE'); END;"+
    "CREATE TRIGGER stage29_no_receipt_delete BEFORE DELETE ON stage29_received_results "+
    "BEGIN SELECT RAISE(ABORT,'STAGE29_RECEIPT_IMMUTABLE'); END;");
   db.prepare('INSERT INTO stage29_receipt_meta VALUES (?,?)').run('schema',SCHEMA);
   db.prepare('INSERT INTO stage29_receipt_meta VALUES (?,?)')
     .run('binding',this.#mac('JH_STAGE29_SCHEMA_V1|'+this.#namespace));
   db.exec('COMMIT');
  }catch(e){try{db.exec('ROLLBACK')}catch{};throw e}
 }
 #checkAddon(){
  const db=this.#db;
  const schema=db.prepare("SELECT v FROM stage29_receipt_meta WHERE k='schema'").get()?.v;
  const binding=db.prepare("SELECT v FROM stage29_receipt_meta WHERE k='binding'").get()?.v;
  if(schema!==SCHEMA||!equal(binding,this.#mac('JH_STAGE29_SCHEMA_V1|'+this.#namespace)))
   fail('STAGE29_RECEIPT_SCHEMA_OR_OWNER_MISMATCH');
  for(const name of ['stage29_no_receipt_update','stage29_no_receipt_delete'])
   if(!db.prepare('SELECT 1 FROM sqlite_master WHERE type=? AND name=?').get('trigger',name))
    fail('STAGE29_IMMUTABILITY_GUARD_MISSING');
 }
 #original(recordId,operation,resultHmac){
  const r=this.#db.prepare('SELECT record_id,operation_hmac,status,created_ms,completed_ms,result_hmac '+
    'FROM circuit_actions WHERE record_id=?').get(recordId);
  if(!r||r.status!=='DEVICE_RESULT_RECEIVED'||
     !equal(r.operation_hmac,operation)||!equal(r.result_hmac,resultHmac)||
     !Number.isSafeInteger(r.completed_ms)||r.completed_ms<r.created_ms)
    return false;
  return true;
 }
 /** Host only; call after ORIGINAL signed completion and original durable
  * acceptedCompletion. The immutable original journal row is the authority.
  * No caller-supplied approved=true / resultVerified=true flag is trusted. */
 record({binding,recordId,resultDigest}={}){
  this.#ready();
  const b=bound(binding),now=this.#clock();
  if(!hex32(recordId)||!hex64(resultDigest))
   fail('STAGE29_ORIGINAL_RECEIPT_IDENTITY_REQUIRED');
  if(b.expiresAtMs<=now||b.expiresAtMs-now>90000)
   return unknown('STAGE29_ORIGINAL_JOB_EXPIRED_OR_OUT_OF_SCOPE');
  const scope=this.#scope(b),operation=this.#operation(b);
  const result=this.#mac('JH_RECEIPT_V1|'+resultDigest);
  this.#db.exec('BEGIN IMMEDIATE');
  try{
   if(!this.#original(recordId,operation,result))
    fail('STAGE29_AUTHENTICATED_ORIGINAL_RECEIPT_REQUIRED');
   const old=this.#db.prepare('SELECT * FROM stage29_received_results WHERE scope_hmac=?').get(scope);
   if(old){
    if(old.record_id!==recordId||!equal(old.operation_hmac,operation)||
       !equal(old.result_hmac,result)||old.expires_ms!==b.expiresAtMs)
     fail('STAGE29_RECEIPT_CONFLICT_NO_OVERWRITE');
    this.#db.exec('ROLLBACK');
    return Object.freeze({recorded:false,code:'STAGE29_ALREADY_RECORDED',
      taskSuccessVerified:false,uiTransitionVerified:false,automaticReplay:false});
   }
   const count=this.#db.prepare('SELECT COUNT(*) n FROM stage29_received_results').get().n;
   if(count>=2048)fail('STAGE29_RECEIPT_CAPACITY_REVIEW_REQUIRED');
   const rowMac=this.#rowMac(scope,recordId,operation,result,now,b.expiresAtMs);
   this.#db.prepare('INSERT INTO stage29_received_results VALUES (?,?,?,?,?,?,?)')
     .run(scope,recordId,operation,result,now,b.expiresAtMs,rowMac);
   this.#db.exec('COMMIT');
   return Object.freeze({recorded:true,code:'STAGE29_ORIGINAL_DEVICE_RESULT_RECEIVED',
     taskSuccessVerified:false,uiTransitionVerified:false,automaticReplay:false});
  }catch(e){try{this.#db.exec('ROLLBACK')}catch{};throw e}
 }
 /** A host-injected current OAuth/owner+device/command authorization must
  * approve the exact ORIGINAL binding. This does not rebind a new session. */
 read({binding,principal}={}){
  this.#ready();
  const b=bound(binding),now=this.#clock();
  let allowed=false;
  try{allowed=this.#authorize(b,principal)===true}catch{allowed=false}
  if(!allowed)return unknown('STAGE29_CURRENT_AUTHORIZATION_REQUIRED');
  const scope=this.#scope(b);
  const row=this.#db.prepare('SELECT * FROM stage29_received_results WHERE scope_hmac=?').get(scope);
  if(!row)return unknown('STAGE29_ORIGINAL_RECEIPT_UNAVAILABLE');
  if(row.expires_ms<=now||b.expiresAtMs!==row.expires_ms)
   return unknown('STAGE29_ORIGINAL_RECEIPT_EXPIRED');
  const op=this.#operation(b);
  const actual=this.#rowMac(scope,row.record_id,row.operation_hmac,row.result_hmac,
    row.received_ms,row.expires_ms);
  if(!equal(row.row_mac,actual)||!equal(row.operation_hmac,op)||
     !this.#original(row.record_id,op,row.result_hmac))
   return unknown('STAGE29_ORIGINAL_RECEIPT_INTEGRITY_UNKNOWN');
  return Object.freeze({ok:true,code:'STAGE29_DEVICE_RESULT_RECEIVED_AFTER_RESTART',
    receiptRecovered:true,receiptScope:'ORIGINAL_SIGNED_DEVICE_COMPLETION_ONLY',
    resultReceived:true,taskSuccessVerified:false,uiTransitionVerified:false,
    originalJobReexecuted:false,newJobCreated:false,automaticReplay:false,
    replayAllowed:false,readOnly:true});
 }
 close(){
  if(this.#closed)return;
  this.#closed=true;
  try{this.#db.close()}finally{this.#key.fill(0)}
 }
}
