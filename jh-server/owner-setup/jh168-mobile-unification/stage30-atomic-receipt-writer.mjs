/**
 * JH168 Stage30: atomic add-on receipt on the ORIGINAL owner-bound SQLite
 * transaction. Never starts work, grants permissions, or stores raw results.
 */
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {Stage29DurableCompletionReadback} from './stage29-durable-completion-readback.mjs';
const hex64=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const hex32=x=>typeof x==='string'&&/^[a-f0-9]{32}$/.test(x);
const fail=code=>{throw Object.assign(Error(code),{code});};
const obj=x=>x&&typeof x==='object'&&!Array.isArray(x);
const hash=x=>createHash('sha256').update(x).digest('hex');
const same=(x,y)=>hex64(x)&&hex64(y)&&timingSafeEqual(Buffer.from(x,'hex'),Buffer.from(y,'hex'));
const canon=x=>{
 if(x===null||typeof x==='string'||typeof x==='boolean'||Number.isSafeInteger(x))return JSON.stringify(x);
 if(Array.isArray(x))return '['+x.map(canon).join(',')+']';
 if(obj(x)&&Object.getPrototypeOf(x)===Object.prototype)
  return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canon(x[k])).join(',')+'}';
 fail('STAGE30_CANONICAL_INVALID');
};
const FIELDS=['ownerDigest','deviceId','deviceDigest','secureSessionId',
 'jobId','commandId','taskDigest','requestId','contextId',
 'targetItemRef','commandDigest','expiresAtMs'];
export const stage30OwnerScopeDigest=namespace=>{
 if(!hex64(namespace))fail('STAGE30_NAMESPACE_INVALID');
 return hash('JH_STAGE30_OWNER_SCOPE_V1|'+namespace);
};
export function stage30BindingForOriginalJob(job,policy,namespace){
 if(!obj(job)||!obj(policy)||job.type!=='split_screen_session_followup'||
    job.mcpToolName!=='life_android_execute_computer_action'||
    job.secureRequestedEffect!=='REVERSIBLE_WRITE'||job.action!=='CLICK'||
    !/^job_[0-9]+$/.test(job.id||'')||
    !/^[A-Za-z0-9_-]{1,128}$/.test(job.targetDeviceId||'')||
    !/^[A-Za-z0-9_-]{1,128}$/.test(job.secureSessionId||'')||
    !hex64(job.targetDeviceDigest)||!hex64(job.taskDigest)||
    !hex32(job.commandId)||!hex32(job.requestId)||
    !/^ssc_[a-f0-9]{32}$/.test(job.contextId||'')||
    !/^item_[a-f0-9]{16}$/.test(job.targetItemRef||'')||
    !Number.isSafeInteger(job.expiresAtMs)||job.expiresAtMs<=0||
    Object.keys(policy).length!==5||policy.action!=='CLICK'||
    policy.contextId!==job.contextId||policy.requestId!==job.requestId||
    policy.targetItemRef!==job.targetItemRef||!hex64(policy.commandDigest))
  fail('STAGE30_ORIGINAL_SIGNED_CLICK_BINDING_REQUIRED');
 return Object.freeze({ownerDigest:stage30OwnerScopeDigest(namespace),
  deviceId:job.targetDeviceId,deviceDigest:job.targetDeviceDigest,
  secureSessionId:job.secureSessionId,jobId:job.id,
  commandId:job.commandId,taskDigest:job.taskDigest,
  requestId:job.requestId,contextId:job.contextId,
  targetItemRef:job.targetItemRef,commandDigest:policy.commandDigest,
  expiresAtMs:job.expiresAtMs});
}
export function createStage30AtomicReceiptWriter({file,key,namespace}={}){
 if(!Buffer.isBuffer(key)||key.length!==32||!hex64(namespace))
  fail('STAGE30_OWNER_KEY_REQUIRED');
 const localKey=Buffer.from(key);
 try {
  // Fail *before host startup* if explicit Stage29 addon migration is missing.
  const check=new Stage29DurableCompletionReadback({
   file,key:localKey,namespace,mode:'read',authorizeRead:()=>false
  });
  check.close();
 }catch(e){localKey.fill(0);throw e}
 const mac=value=>createHmac('sha256',localKey).update(value).digest('hex');
 let closed=false;
 function append({db,recordId,resultDigest,receivedAtMs,stage30Original}={}){
  if(closed)fail('STAGE30_WRITER_CLOSED');
  if(!db||typeof db.prepare!=='function'||db.isTransaction!==true||
     !hex32(recordId)||!hex64(resultDigest)||
     !Number.isSafeInteger(receivedAtMs)||receivedAtMs<=0||
     !obj(stage30Original))fail('STAGE30_SAME_ORIGINAL_TRANSACTION_REQUIRED');
  const {job,result,identityPayload}=stage30Original;
  if(!obj(result)||typeof result.ok!=='boolean')
   fail('STAGE30_ORIGINAL_RESULT_REQUIRED');
  const binding=stage30BindingForOriginalJob(job,identityPayload,namespace);
  if(!['in_progress','complete'].includes(job.status)||
     binding.expiresAtMs<=receivedAtMs||
     binding.expiresAtMs-receivedAtMs>90000)
   fail('STAGE30_ORIGINAL_JOB_EXPIRED');
  const actual=hash(JSON.stringify([job.id,job.secureSessionId,result]));
  if(!same(actual,resultDigest))
   fail('STAGE30_ORIGINAL_RESULT_DIGEST_MISMATCH');
  const originalOp=mac('JH_MANUAL_ACTION_V1|'+namespace+'|'+
   canon([binding.deviceId,'split_screen_session_followup',{
    contextId:binding.contextId,requestId:binding.requestId,
    action:'CLICK',targetItemRef:binding.targetItemRef,
    commandDigest:binding.commandDigest
   }]));
  const originalResult=mac('JH_RECEIPT_V1|'+resultDigest);
  const old=db.prepare('SELECT * FROM circuit_actions WHERE record_id=?').get(recordId);
  if(!old||old.status!=='DEVICE_RESULT_RECEIVED'||
     old.completed_ms!==receivedAtMs||
     !same(old.operation_hmac,originalOp)||!same(old.result_hmac,originalResult))
   fail('STAGE30_ORIGINAL_JOURNAL_RECEIPT_REQUIRED');
  if(db.prepare("SELECT v FROM stage29_receipt_meta WHERE k='schema'").get()?.v!==
        'JH_STAGE29_RECEIVED_READBACK_V1'||
     !same(db.prepare("SELECT v FROM stage29_receipt_meta WHERE k='binding'").get()?.v,
        mac('JH_STAGE29_SCHEMA_V1|'+namespace)))
   fail('STAGE30_RECEIPT_SCHEMA_CHANGED');
  const scope=mac('JH_STAGE29_SCOPE_V1|'+namespace+'|'+canon(FIELDS.map(k=>binding[k])));
  if(db.prepare('SELECT 1 FROM stage29_received_results WHERE scope_hmac=?').get(scope))
   fail('STAGE30_RECEIPT_ALREADY_PRESENT_NO_OVERWRITE');
  if(db.prepare('SELECT COUNT(*) n FROM stage29_received_results').get().n>=2048)
   fail('STAGE30_RECEIPT_CAPACITY_EXCEEDED');
  const rowMac=mac('JH_STAGE29_ROW_V1|'+namespace+'|'+
   canon([scope,recordId,originalOp,originalResult,receivedAtMs,binding.expiresAtMs]));
  db.prepare('INSERT INTO stage29_received_results VALUES (?,?,?,?,?,?,?)')
    .run(scope,recordId,originalOp,originalResult,receivedAtMs,binding.expiresAtMs,rowMac);
  return Object.freeze({recorded:true,resultReceived:true,
   taskSuccessVerified:false,uiTransitionVerified:false,
   newJobCreated:false,automaticReplay:false});
 }
 function close(){if(closed)return;closed=true;localKey.fill(0)}
 return Object.freeze({append,close,ownerScopeDigest:stage30OwnerScopeDigest(namespace)});
}
