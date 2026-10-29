/** JH167 V4: map the REAL 8–80-character native Gemini task identity into
 * the existing Secure56 computer-use envelope without weakening its guards.
 *
 * Why this exists: original exactEnvelope56 REQUIRES args.task_digest (64hex)
 * but original computerPayload56 sets Android taskId from args.task_id FIRST,
 * falling back to args.task_digest. Omitting task_id would make the phone
 * digest the WRONG identifier (the 64-hex token instead of task.id).
 *
 * This module only generates validated host-local identity fields. It cannot
 * send a phone job, authenticate a task, grant approval or deliver a result.
 * Call only after original host has independently verified saved task/owner.
 */
import {createHash} from 'node:crypto';

const HASH=/^[0-9a-f]{64}$/;
const COMMAND=/^[0-9a-f]{32}$/;
const TASK=/^[A-Za-z0-9_-]{8,80}$/;
const PACKAGE='com.google.android.googlequicksearchbox';
// Only fields returned by this exact authenticated host builder may be
// forwarded. Caller-supplied {verified:true} JSON is never a credential.
const ISSUED=new WeakSet();
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const digest=x=>createHash('sha256').update(x,'utf8').digest('hex');
export const nativeTaskIdDigest=taskId=>{
 if(!TASK.test(taskId??''))throw Error('V4_NATIVE_TASK_ID_INVALID');
 return digest('JH-GEMINI-TASK-ID-V1|'+taskId);
};
function binding(task,owner){
 return obj(task)&&task.schema===4&&TASK.test(task.id??'')&&
  COMMAND.test(task.commandId??'')&&
  task.backend==='JH_ANDROID_NATIVE'&&
  task.workSide==='RIGHT'&&task.chatSide==='LEFT'&&
  ['YOUTUBE','VIDEO','ANDROID'].includes(task.mode)&&task.cancelled!==true&&
  HASH.test(task.promptDigest??'')&&
  obj(owner)&&owner.current===true&&owner.secure56===true&&
  owner.backend==='JH_ANDROID_NATIVE'&&
  owner.commandId===task.commandId&&owner.workSide==='RIGHT'&&
  owner.chatSide==='LEFT'&&owner.workPackage===PACKAGE&&
  owner.chatPackage==='com.openai.chatgpt'&&
  typeof owner.deviceId==='string'&&owner.deviceId.length>0&&
  task.deviceId===owner.deviceId&&task.sessionId===owner.sessionId;
};
/** Read-only, explicitly original-verified task ID scope. */
export async function buildOriginalSecure56GeminiTaskIdentity({
 task,owner,verifyOriginalTask,verifyOriginalOwner
}={}){
 if([verifyOriginalTask,verifyOriginalOwner].some(x=>typeof x!=='function'))
  throw Error('ORIGINAL_SECURE56_AUTHORITY_CALLBACKS_REQUIRED');
 if(!binding(task,owner))throw Error('CURRENT_GEMINI_NATIVE_TASK_SCOPE_REQUIRED');
 let verified=false;
 try{verified=await verifyOriginalTask(task,owner)===true&&
  await verifyOriginalOwner(owner,task.commandId)===true}
 catch{verified=false}
 if(!verified)throw Error('ORIGINAL_GEMINI_TASK_OR_OWNER_AUTHENTICATION_REQUIRED');
 const expected=nativeTaskIdDigest(task.id);
 const issued=Object.freeze({
  task_id:task.id,
  task_digest:expected,
  device_id:owner.deviceId,
  // This is the policy ID the original AndroidComputerUseTransport.taskPolicy
  // will use after computerPayload56's task_id precedence.
  phone_task_id:task.id,
  nativeTaskIdentityVerifiedByOriginalHost:true,
  phoneLocalApprovalSatisfied:false,
  dispatched:false
 });
 ISSUED.add(issued);
 return issued;
}
/** Validate fields before passing them to original exactEnvelope56.
 * Do NOT accept a free-form caller "taskDigest" or any other account identity.
 */
export function requireOriginalSecure56GeminiTaskFields(fields,task){
 if(!obj(fields)||!ISSUED.has(fields)||!obj(task)||fields.task_id!==task.id||
  fields.phone_task_id!==task.id||
  !TASK.test(task.id??'')||
  fields.task_digest!==nativeTaskIdDigest(task.id)||
  !HASH.test(fields.task_digest)||fields.device_id!==task.deviceId||
  fields.nativeTaskIdentityVerifiedByOriginalHost!==true||
  fields.phoneLocalApprovalSatisfied!==false||
  fields.dispatched!==false)
   throw Error('V4_ORIGINAL_PHONE_TASK_ID_DIGEST_SCOPE_CHANGED');
 return Object.freeze({
  task_id:fields.task_id,task_digest:fields.task_digest,
  device_id:fields.device_id
 });
}
