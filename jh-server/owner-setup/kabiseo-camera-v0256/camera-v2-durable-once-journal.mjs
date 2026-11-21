/**
 * JH228 durable one-shot claim, separate from the existing Secure56 phone
 * effect journal. Fail-closed: no automatic retry after UNKNOWN/partial effects.
 * No photo, session secret, user utterance or raw device/turn IDs are persisted.
 */
import {DatabaseSync} from 'node:sqlite';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {openSync,closeSync,existsSync,lstatSync,realpathSync,chmodSync} from 'node:fs';
import path from 'node:path';
const H64=/^[a-f0-9]{64}$/,H32=/^[a-f0-9]{32}$/;
const S=/^[A-Za-z0-9_-]{16,160}$/;
const MAX_CLAIMS=100000;
const fail=c=>{throw Object.assign(new Error(c),{code:c});};
const equals=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&
  timingSafeEqual(Buffer.from(a),Buffer.from(b));
function checkLocation(file,mode){
 if(typeof file!=='string'||!path.isAbsolute(file)||path.resolve(file)!==file||
    file.includes('\0'))fail('V2_ONCE_PATH_INVALID');
 const dir=path.dirname(file),d=lstatSync(dir);
 if(!d.isDirectory()||d.isSymbolicLink()||realpathSync(dir)!==dir||
    d.uid!==process.getuid()||(d.mode&0o077)!==0)fail('V2_ONCE_PRIVATE_DIR_REQUIRED');
 const exists=existsSync(file);
 if(mode==='INITIALIZE'&&exists)fail('V2_ONCE_ALREADY_INITIALIZED');
 if(mode==='READ'&&!exists)fail('V2_ONCE_INIT_REQUIRED');
 if(exists){
  const s=lstatSync(file);
  if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||
     s.uid!==process.getuid()||(s.mode&0o077)!==0)fail('V2_ONCE_FILE_UNSAFE');
 }
}
function validateScope(s){
 return s&&typeof s==='object'&&!Array.isArray(s)&&
   typeof s.threadId==='string'&&s.threadId.length>0&&s.threadId.length<=256&&
   typeof s.sourceRef==='string'&&s.sourceRef.length>0&&s.sourceRef.length<=256&&
   H32.test(s.commandId??'')&&H64.test(s.taskDigest??'')&&
   H64.test(s.deviceDigest??'')&&S.test(s.secureSessionId??'');
}
export class JH228DurableOnceJournal {
 #db;#key;#namespace;#closed=false;#clock;
 constructor({file,key,namespace,mode='READ',clock=Date.now}={}){
  if(!Buffer.isBuffer(key)||key.length!==32||!H64.test(namespace??'')||
     !['READ','INITIALIZE'].includes(mode)||typeof clock!=='function')
    fail('V2_ONCE_CONFIG_INVALID');
  checkLocation(file,mode);
  this.#key=Buffer.from(key);this.#namespace=namespace;this.#clock=clock;
  let db;
  try{
   if(mode==='INITIALIZE'){
    const fd=openSync(file,'wx',0o600);closeSync(fd);
   }
   db=new DatabaseSync(file,{timeout:3000});
   chmodSync(file,0o600);
   db.exec('PRAGMA trusted_schema=OFF; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
   if(mode==='INITIALIZE'){
    db.exec("CREATE TABLE v2_meta(k TEXT PRIMARY KEY,v TEXT NOT NULL);"+
      "CREATE TABLE v2_claims(identity_hmac TEXT PRIMARY KEY,claimed_ms INTEGER NOT NULL CHECK(claimed_ms>0));");
    db.prepare('INSERT INTO v2_meta VALUES(?,?)').run('version','1');
    db.prepare('INSERT INTO v2_meta VALUES(?,?)').run('binding',this.#hmac('JH228_CAMERA_V2_ONCE_KEY_V1|'+namespace));
   }else{
    const schema=db.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='v2_claims'").get();
    if(schema?.ok!==1||db.prepare('SELECT v FROM v2_meta WHERE k=?').get('version')?.v!=='1')
      fail('V2_ONCE_SCHEMA_INVALID');
    const actual=db.prepare('SELECT v FROM v2_meta WHERE k=?').get('binding')?.v;
    const expected=this.#hmac('JH228_CAMERA_V2_ONCE_KEY_V1|'+namespace);
    if(!H64.test(actual??'')||!equals(actual,expected))fail('V2_ONCE_KEY_OR_NAMESPACE_MISMATCH');
   }
   this.#db=db;
  }catch(e){try{db?.close()}catch{}this.#key.fill(0);throw e;}
 }
 #hmac(value){return createHmac('sha256',this.#key).update(value).digest('hex');}
 #digest(scope){
  if(!validateScope(scope))fail('V2_ONCE_SCOPE_INVALID');
  // Exclude rotating Secure56 sessionId from identity to block reconnect replay.
  return this.#hmac('JH228_CAMERA_ONE_SHOT_V1|'+this.#namespace+'|'+JSON.stringify([
    scope.threadId,scope.sourceRef,scope.commandId,scope.taskDigest,scope.deviceDigest
  ]));
 }
 claimOneShot(scope){
  if(this.#closed)fail('V2_ONCE_JOURNAL_CLOSED');
  const identity=this.#digest(scope),t=this.#clock();
  if(!Number.isSafeInteger(t)||t<=0)fail('V2_ONCE_CLOCK_INVALID');
  this.#db.exec('BEGIN IMMEDIATE');
  try{
   const exists=this.#db.prepare('SELECT 1 AS ok FROM v2_claims WHERE identity_hmac=?').get(identity);
   if(exists){this.#db.exec('ROLLBACK');return Object.freeze({claimed:false,code:'V2_ALREADY_CLAIMED_OR_OUTCOME_UNKNOWN'});}
   const n=this.#db.prepare('SELECT COUNT(*) AS n FROM v2_claims').get().n;
   if(n>=MAX_CLAIMS)fail('V2_ONCE_JOURNAL_CAPACITY_REVIEW_REQUIRED');
   this.#db.prepare('INSERT INTO v2_claims VALUES(?,?)').run(identity,t);
   this.#db.exec('COMMIT');
   return Object.freeze({claimed:true,code:'V2_ONCE_DURABLE_CLAIMED'});
  }catch(e){try{this.#db.exec('ROLLBACK')}catch{}throw e;}
 }
 count(){if(this.#closed)fail('V2_ONCE_JOURNAL_CLOSED');
   return this.#db.prepare('SELECT COUNT(*) AS n FROM v2_claims').get().n;}
 close(){if(this.#closed)return;this.#closed=true;try{this.#db.close()}finally{this.#key.fill(0)}}
}
