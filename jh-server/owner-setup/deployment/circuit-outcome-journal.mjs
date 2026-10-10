/** Optional fail-closed journal for Android actions across process crashes.
 * NOT installed in production until a reviewed authenticated caller wires it.
 * Records only opaque digests, not payloads, session secrets or user content.
 * Durable DISPATCH_UNCERTAIN must be committed BEFORE action delivery.
 */
import {DatabaseSync} from 'node:sqlite';
import {existsSync,lstatSync,realpathSync,chmodSync} from 'node:fs';
import {isAbsolute,dirname,resolve} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
const HEX=/^[a-f0-9]{64}$/;
function fail(code){const e=Error(code);e.code=code;throw e;}
function digest(x){if(typeof x!=='string'||!HEX.test(x))fail('JOURNAL_DIGEST_INVALID');return x;}
const token=()=>createHash('sha256').update(randomBytes(32)).digest('hex');
export class CircuitOutcomeJournal{
 #db;#now;#verify;#closed=false;
 constructor({databasePath,serverDigest,ownerDigest,now=Date.now,verifyAuthenticatedReceipt}={}){
  digest(serverDigest);digest(ownerDigest);
  if(typeof now!=='function'||typeof verifyAuthenticatedReceipt!=='function')fail('JOURNAL_VERIFIER_REQUIRED');
  if(typeof databasePath!=='string'||!isAbsolute(databasePath)||databasePath===':memory:'||
     realpathSync(dirname(databasePath))!==resolve(dirname(databasePath)))fail('JOURNAL_PRIVATE_PATH_REQUIRED');
  const parent=lstatSync(dirname(databasePath));
  if(!parent.isDirectory()||parent.isSymbolicLink()||(parent.mode&0o077)!==0||
     parent.uid!==process.getuid())fail('JOURNAL_PRIVATE_DIRECTORY_REQUIRED');
  if(existsSync(databasePath)){
   const st=lstatSync(databasePath);
   if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||st.uid!==process.getuid()||(st.mode&0o077)!==0)fail('JOURNAL_PRIVATE_FILE_REQUIRED');
  }
  this.#now=now;this.#verify=verifyAuthenticatedReceipt;
  this.#db=new DatabaseSync(databasePath,{timeout:5000});
  chmodSync(databasePath,0o600);
  try{
   this.#db.exec('PRAGMA trusted_schema=OFF; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;'+
    'CREATE TABLE IF NOT EXISTS journal_identity(server TEXT NOT NULL,owner TEXT NOT NULL);'+
    'CREATE TABLE IF NOT EXISTS uncertain_actions('+
     'device_digest TEXT NOT NULL,intent_digest TEXT NOT NULL,attempt_digest TEXT NOT NULL,'+
     'state TEXT NOT NULL,started INTEGER NOT NULL,updated INTEGER NOT NULL,receipt_digest TEXT,'+
     'PRIMARY KEY(device_digest,intent_digest),UNIQUE(attempt_digest),'+
     "CHECK(state IN ('RESERVED','DISPATCH_UNCERTAIN','DEVICE_RESULT_RECORDED')),"+
     'CHECK(length(device_digest)=64 AND length(intent_digest)=64 AND length(attempt_digest)=64),'+
     'CHECK(receipt_digest IS NULL OR length(receipt_digest)=64));'+
    "CREATE TRIGGER IF NOT EXISTS prevent_journal_delete BEFORE DELETE ON uncertain_actions BEGIN SELECT RAISE(ABORT,'JOURNAL_DELETE_FORBIDDEN'); END;");
   const rows=this.#db.prepare('SELECT * FROM journal_identity').all();
   if(rows.length>1)fail('JOURNAL_IDENTITY_CONFLICT');
   if(rows.length===0)this.#db.prepare('INSERT INTO journal_identity VALUES(?,?)').run(serverDigest,ownerDigest);
   else if(rows[0].server!==serverDigest||rows[0].owner!==ownerDigest)fail('JOURNAL_IDENTITY_MISMATCH');
  }catch(e){this.#db.close();this.#closed=true;throw e;}
 }
 #active(){if(this.#closed)fail('JOURNAL_CLOSED');}
 #time(){const t=this.#now();if(!Number.isSafeInteger(t)||t<=0)fail('JOURNAL_CLOCK_INVALID');return t;}
 inspect({deviceDigest,intentDigest}){
  this.#active();digest(deviceDigest);digest(intentDigest);
  const x=this.#db.prepare('SELECT state,attempt_digest,started,updated,receipt_digest FROM uncertain_actions WHERE device_digest=? AND intent_digest=?').get(deviceDigest,intentDigest);
  return x?Object.freeze({state:x.state,attemptDigest:x.attempt_digest,createdAt:x.started,updatedAt:x.updated,receiptDigest:x.receipt_digest,canAutomaticReplay:false}):Object.freeze({state:'NEVER_ADMITTED',canAutomaticReplay:false});
 }
 /** Host must call before preparing action dispatch. No automatic time-based unblock. */
 admit({deviceDigest,intentDigest}){
  this.#active();digest(deviceDigest);digest(intentDigest);const at=this.#time(),newAttempt=token();
  this.#db.exec('BEGIN IMMEDIATE');
  try{
   const current=this.#db.prepare('SELECT state,attempt_digest FROM uncertain_actions WHERE device_digest=? AND intent_digest=?').get(deviceDigest,intentDigest);
   if(current&&current.state!=='DEVICE_RESULT_RECORDED'){
    this.#db.exec('COMMIT');
    return Object.freeze({allowed:false,code:'PRIOR_OUTCOME_NOT_VERIFIED',priorState:current.state});
   }
   if(current){
    this.#db.prepare("UPDATE uncertain_actions SET attempt_digest=?,state='RESERVED',started=?,updated=?,receipt_digest=NULL WHERE device_digest=? AND intent_digest=?")
      .run(newAttempt,at,at,deviceDigest,intentDigest);
   }else{
    this.#db.prepare("INSERT INTO uncertain_actions VALUES(?,?,?,'RESERVED',?,?,NULL)")
      .run(deviceDigest,intentDigest,newAttempt,at,at);
   }
   this.#db.exec('COMMIT');
   return Object.freeze({allowed:true,attemptDigest:newAttempt,actionDispatched:false});
  }catch(e){this.#db.exec('ROLLBACK');throw e;}
 }
 /** Must be durable BEFORE sending an action to the device. */
 markMayHaveDispatched({deviceDigest,intentDigest,attemptDigest}){
  this.#active();for(const v of [deviceDigest,intentDigest,attemptDigest])digest(v);
  const n=this.#time();
  const r=this.#db.prepare("UPDATE uncertain_actions SET state='DISPATCH_UNCERTAIN',updated=? WHERE device_digest=? AND intent_digest=? AND attempt_digest=? AND state='RESERVED'")
    .run(n,deviceDigest,intentDigest,attemptDigest);
  if(r.changes!==1)fail('JOURNAL_DISPATCH_NOT_RESERVED');
  return Object.freeze({committed:true,code:'DISPATCH_UNCERTAIN',taskSuccessVerified:false});
 }
 /** Host-injected verifier must validate an authenticated result receipt, not business success. */
 recordAuthenticatedReceipt({deviceDigest,intentDigest,attemptDigest,receiptDigest,hostEvidence}){
  this.#active();for(const v of [deviceDigest,intentDigest,attemptDigest,receiptDigest])digest(v);
  if(this.#verify({deviceDigest,intentDigest,attemptDigest,receiptDigest,hostEvidence})!==true)fail('JOURNAL_RECEIPT_NOT_AUTHENTICATED');
  const n=this.#time();
  const updated=this.#db.prepare("UPDATE uncertain_actions SET state='DEVICE_RESULT_RECORDED',updated=?,receipt_digest=? WHERE device_digest=? AND intent_digest=? AND attempt_digest=? AND state='DISPATCH_UNCERTAIN'")
   .run(n,receiptDigest,deviceDigest,intentDigest,attemptDigest);
  if(updated.changes!==1)fail('JOURNAL_RECEIPT_STATE_INVALID');
  return Object.freeze({receiptRecorded:true,businessSuccessVerified:false,automaticActionReplayAllowed:false});
 }
 close(){if(this.#closed)return;this.#closed=true;this.#db.close();}
}
