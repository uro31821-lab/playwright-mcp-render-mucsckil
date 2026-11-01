/**
 * JH168 Stage34: strictly read-only, original owner-scope signed-result lookup.
 *
 * Server-side candidate ONLY, never connected to live MCP or Render by import.
 * Uses the exact Stage29/Stage30 HMAC-only rows from original private SQLite.
 * No new session, Android action, grant, confirmation, screen proof or job.
 */
import {DatabaseSync} from 'node:sqlite';
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {lstatSync,realpathSync,existsSync} from 'node:fs';
import {isAbsolute,resolve,dirname} from 'node:path';

const KEY_ORDER=['ownerDigest','deviceId','deviceDigest','secureSessionId',
  'jobId','commandId','taskDigest','requestId','contextId',
  'targetItemRef','commandDigest','expiresAtMs'];
const INPUT_ORDER=KEY_ORDER.filter(x=>x!=='ownerDigest');
const hex64=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const hex32=x=>typeof x==='string'&&/^[a-f0-9]{32}$/.test(x);
const equal=(x,y)=>hex64(x)&&hex64(y)&&
  timingSafeEqual(Buffer.from(x,'hex'),Buffer.from(y,'hex'));
const fail=code=>{throw Object.assign(Error(code),{code});};
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  Object.getPrototypeOf(x)===Object.prototype;
const canonical=x=>{
  if(x===null||typeof x==='string'||typeof x==='boolean'||Number.isSafeInteger(x))return JSON.stringify(x);
  if(Array.isArray(x))return '['+x.map(canonical).join(',')+']';
  if(object(x))return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';
  fail('STAGE34_CANONICAL_INVALID');
};
const unknown=code=>Object.freeze({ok:false,code,readOnly:true,executionStatus:'UNKNOWN',
  resultReceived:false,uiTransitionVerified:false,taskSuccessVerified:false,
  newJobCreated:false,originalJobReexecuted:false,automaticReplay:false,
  replayAllowed:false,originalSessionRebound:false});
function originalReference(x,namespace){
 if(!object(x)||Object.keys(x).length!==INPUT_ORDER.length||
    INPUT_ORDER.some(k=>!Object.hasOwn(x,k))||
    typeof x.deviceId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(x.deviceId)||
    typeof x.secureSessionId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(x.secureSessionId)||
    !hex64(x.deviceDigest)||!hex64(x.taskDigest)||!hex64(x.commandDigest)||
    !hex32(x.commandId)||!hex32(x.requestId)||
    !/^job_[0-9]+$/.test(x.jobId)||
    !/^ssc_[a-f0-9]{32}$/.test(x.contextId)||
    !/^item_[a-f0-9]{16}$/.test(x.targetItemRef)||
    !Number.isSafeInteger(x.expiresAtMs)||x.expiresAtMs<=0)
  fail('STAGE34_EXACT_ORIGINAL_REFERENCE_REQUIRED');
 return {ownerDigest:createHash('sha256')
    .update('JH_STAGE30_OWNER_SCOPE_V1|'+namespace).digest('hex'),...x};
}
function ensurePrivateFile(file){
 if(typeof file!=='string'||!isAbsolute(file)||resolve(file)!==file||file.includes('\0'))
  fail('STAGE34_ORIGINAL_JOURNAL_PATH_INVALID');
 const parent=dirname(file),p=lstatSync(parent);
 if(!p.isDirectory()||p.isSymbolicLink()||realpathSync(parent)!==parent||
    (p.mode&0o077)!==0||(typeof process.getuid==='function'&&p.uid!==process.getuid()))
  fail('STAGE34_OWNER_PRIVATE_DIRECTORY_REQUIRED');
 if(!existsSync(file))fail('STAGE34_ORIGINAL_JOURNAL_NOT_PRESENT');
 const f=lstatSync(file);
 if(!f.isFile()||f.isSymbolicLink()||f.nlink!==1||
    (f.mode&0o077)!==0||(typeof process.getuid==='function'&&f.uid!==process.getuid()))
  fail('STAGE34_ORIGINAL_JOURNAL_NOT_PRIVATE');
}
export function createStage34OriginalReceiptReader({
 file,key,namespace,authorizeCurrentOwner,clock=Date.now
}={}){
 if(!Buffer.isBuffer(key)||key.length!==32||!hex64(namespace)||
    typeof authorizeCurrentOwner!=='function'||typeof clock!=='function')
  fail('STAGE34_ORIGINAL_OWNER_HOST_REQUIRED');
 ensurePrivateFile(file);
 const privateKey=Buffer.from(key);
 let db=null,closed=false;
 const mac=input=>createHmac('sha256',privateKey).update(input).digest('hex');
 try{
  // SQLite readOnly prevents BOTH DML and persistent PRAGMA changes.
  // Never call the Stage29 readwrite-mode constructor for this endpoint.
  db=new DatabaseSync(file,{readOnly:true,timeout:4000});
  db.exec('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF; PRAGMA foreign_keys=ON;');
  if(db.prepare("SELECT v FROM circuit_meta WHERE k='version'").get()?.v!=='1'||
     !equal(db.prepare("SELECT v FROM circuit_meta WHERE k='binding'").get()?.v,
       mac('JH_MANUAL_CIRCUIT_KEY_V1|'+namespace)))
    fail('STAGE34_OWNER_JOURNAL_BINDING_MISMATCH');
  if(db.prepare("SELECT v FROM stage29_receipt_meta WHERE k='schema'").get()?.v!==
       'JH_STAGE29_RECEIVED_READBACK_V1'||
     !equal(db.prepare("SELECT v FROM stage29_receipt_meta WHERE k='binding'").get()?.v,
       mac('JH_STAGE29_SCHEMA_V1|'+namespace)))
    fail('STAGE34_STAGE29_RECEIPT_BINDING_MISMATCH');
  for(const name of ['stage29_no_receipt_update','stage29_no_receipt_delete'])
   if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name=?").get(name))
    fail('STAGE34_IMMUTABLE_RECEIPT_GUARD_REQUIRED');
 }catch(e){
  try{db?.close()}finally{privateKey.fill(0)}
  throw e;
 }
 function read({reference,principal}={}){
  if(closed)return unknown('STAGE34_READER_CLOSED');
  let original;
  try{original=originalReference(reference,namespace)}
  catch{return unknown('STAGE34_EXACT_ORIGINAL_REFERENCE_REQUIRED')}
  let authorized=false;
  try{authorized=authorizeCurrentOwner(original,principal)===true}
  catch{authorized=false}
  if(!authorized)return unknown('STAGE34_AUTHENTICATED_CURRENT_OWNER_DEVICE_REQUIRED');
  const now=clock();
  if(!Number.isSafeInteger(now)||now<=0)return unknown('STAGE34_CLOCK_INVALID');
  if(now>=original.expiresAtMs)
   return unknown('STAGE34_ORIGINAL_RECEIPT_EXPIRED');
  const scope=mac('JH_STAGE29_SCOPE_V1|'+namespace+'|'+
    canonical(KEY_ORDER.map(k=>original[k])));
  let receipt;
  try{receipt=db.prepare(
   'SELECT scope_hmac,record_id,operation_hmac,result_hmac,received_ms,expires_ms,row_mac '+
   'FROM stage29_received_results WHERE scope_hmac=?').get(scope)}
  catch{return unknown('STAGE34_ORIGINAL_RECEIPT_READ_FAILED')}
  if(!receipt)return unknown('STAGE34_ORIGINAL_RECEIPT_NOT_FOUND');
  const semantic={contextId:original.contextId,requestId:original.requestId,
    action:'CLICK',targetItemRef:original.targetItemRef,
    commandDigest:original.commandDigest};
  const operation=mac('JH_MANUAL_ACTION_V1|'+namespace+'|'+
    canonical([original.deviceId,'split_screen_session_followup',semantic]));
  const rowMac=mac('JH_STAGE29_ROW_V1|'+namespace+'|'+
    canonical([scope,receipt.record_id,receipt.operation_hmac,
      receipt.result_hmac,receipt.received_ms,receipt.expires_ms]));
  if(!/^[a-f0-9]{32}$/.test(receipt.record_id)||!equal(receipt.scope_hmac,scope)||
     !equal(receipt.operation_hmac,operation)||
     !equal(receipt.row_mac,rowMac)||
     receipt.expires_ms!==original.expiresAtMs||
     !Number.isSafeInteger(receipt.received_ms)||receipt.received_ms>=receipt.expires_ms)
    return unknown('STAGE34_RECEIPT_INTEGRITY_NOT_CONFIRMED');
  let row;
  try{row=db.prepare('SELECT record_id,operation_hmac,status,created_ms,completed_ms,result_hmac '+
    'FROM circuit_actions WHERE record_id=?').get(receipt.record_id)}
  catch{return unknown('STAGE34_ORIGINAL_JOURNAL_READ_FAILED')}
  if(!row||row.status!=='DEVICE_RESULT_RECEIVED'||
     !equal(row.operation_hmac,receipt.operation_hmac)||
     !equal(row.result_hmac,receipt.result_hmac)||
     !Number.isSafeInteger(row.completed_ms)||row.completed_ms<row.created_ms||
     row.completed_ms!==receipt.received_ms)
    return unknown('STAGE34_ORIGINAL_AUTHENTICATED_RESULT_MISSING');
  return Object.freeze({ok:true,code:'STAGE34_ORIGINAL_DEVICE_RESULT_RECEIVED',
    resultReceived:true,receiptRecovered:true,
    receiptScope:'EXACT_ORIGINAL_SIGNED_COMPLETION_ONLY',
    taskSuccessVerified:false,uiTransitionVerified:false,
    readOnly:true,newJobCreated:false,originalJobReexecuted:false,
    automaticReplay:false,replayAllowed:false,originalSessionRebound:false});
 }
 function close(){if(closed)return;closed=true;try{db.close()}finally{privateKey.fill(0)}}
 return Object.freeze({read,close,queryOnly:true,immutableOwnerJournal:true,
   noPhoneActions:true,authenticatedOwnerRequired:true});
}
