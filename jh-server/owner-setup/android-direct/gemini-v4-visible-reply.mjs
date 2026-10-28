/** JH167 V4 — native Gemini visible-reply observer, NOT a reply verifier.
 *
 * Uses one ORIGINAL Secure56-signed agent_snapshot and the authenticated
 * RIGHT Gemini / LEFT ChatGPT split-window proof. Read-only. No click, send,
 * retry, automatic resume, video generation, or new credentials.
 *
 * The AndroidAgent emits at most 800 masked characters per accessibility
 * node, without a message-turn ID. A returned fragment therefore NEVER
 * proves a complete answer, its conversation, or its relationship to a
 * specific request. A separate original-host turn verifier remains required.
 */
import {inspectFoldPair,FOLD_LAYOUTS} from './fold-evidence.mjs';

const H='com.google.android.googlequicksearchbox';
const RESPONSE_ID=H+':id/assistant_robin_text';
const REQUEST_ID=H+':id/assistant_robin_user_message_text';
const hex32=x=>typeof x==='string'&&/^[0-9a-f]{32}$/.test(x);
const hex64=x=>typeof x==='string'&&/^[0-9a-f]{64}$/.test(x);
const taskId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{8,80}$/.test(x);
const object=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const deny=(code)=>Object.freeze({ok:false,code,autoReplay:false,fullReplyVerified:false,
  requestTurnVerified:false,conversationVerified:false});
const FIELDS=['deviceId','sessionId','commandId','workWindowId','chatWindowId',
  'workPackage','chatPackage','workBounds','chatBounds'];
function same(a,b){return !!a&&!!b&&FIELDS.every(k=>a[k]===b[k])}
function validOwner(o,command,now){
 return object(o)&&o.current===true&&o.secure56===true&&
 o.backend==='JH_ANDROID_NATIVE'&&o.commandId===command&&
 o.workSide==='RIGHT'&&o.chatSide==='LEFT'&&o.workPackage===H&&
 o.chatPackage==='com.openai.chatgpt'&&o.nativeGeminiWindowVerified===true&&
 Number.isSafeInteger(o.workWindowId)&&Number.isSafeInteger(o.chatWindowId)&&
 o.workWindowId!==o.chatWindowId&&
 typeof o.workBounds==='string'&&typeof o.chatBounds==='string'&&
 typeof o.deviceId==='string'&&o.deviceId.length>0&&
 typeof o.sessionId==='string'&&o.sessionId.length>0&&
 Number.isSafeInteger(o.observedAt)&&o.observedAt<=now&&now-o.observedAt<=10000;
}
function validatedTask(t,id,owner){
 return object(t)&&t.schema===4&&t.id===id&&t.commandId===owner.commandId&&
 t.backend==='JH_ANDROID_NATIVE'&&t.workSide==='RIGHT'&&t.chatSide==='LEFT'&&
 t.deviceId===owner.deviceId&&t.sessionId===owner.sessionId&&
 typeof t.sentMessageId==='string'&&t.sentMessageId.length>0&&t.sentMessageId.length<=200&&
 ['WAITING','RESULT_READY','DELIVERED'].includes(t.phase)&&t.cancelled!==true;
}
function validSnapshot(job,owner,expectedJobId){
 return object(job)&&job.id===expectedJobId&&
 job.type==='agent_snapshot'&&job.targetDeviceId===owner.deviceId&&
 job.secureSessionId===owner.sessionId&&job.commandId===owner.commandId&&
 job.status==='complete'&&job.result?.ok===true&&
 typeof job.result.url==='string'&&Buffer.byteLength(job.result.url,'utf8')<=2*1024*1024;
}
export function createV4GeminiVisibleReplyObserver({
 readOriginalOwner,verifyOriginalOwner,readOriginalTask,verifyOriginalTask,
 createOriginalSnapshot,waitOriginalSnapshot,verifyOriginalSnapshot,clock=Date.now,enabled=false
}={}){
 if([readOriginalOwner,verifyOriginalOwner,readOriginalTask,verifyOriginalTask,
 createOriginalSnapshot,waitOriginalSnapshot,verifyOriginalSnapshot,clock].some(f=>typeof f!=='function'))
  throw Error('ORIGINAL_SECURE56_REPLY_PORTS_REQUIRED');
 let busy=false;
 async function owner(commandId){
  let o;try{o=await readOriginalOwner()}catch{return null}
  if(!validOwner(o,commandId,clock()))return null;
  try{if(await verifyOriginalOwner(o,commandId)!==true)return null}catch{return null}
  return o;
 }
 async function read({commandId,taskId:tid}={}){
  if(!enabled)return deny('GEMINI_VISIBLE_READBACK_DISABLED');
  if(!hex32(commandId)||!taskId(tid))return deny('SIGNED_COMMAND_AND_GEMINI_TASK_REQUIRED');
  if(busy)return deny('GEMINI_READBACK_IN_PROGRESS');
  busy=true;
  try{
   const before=await owner(commandId);
   if(!before)return deny('ORIGINAL_GEMINI_RIGHT_OWNER_UNVERIFIED');
   let task;try{task=await readOriginalTask(tid)}catch{return deny('ORIGINAL_GEMINI_TASK_UNAVAILABLE')}
   if(!validatedTask(task,tid,before))return deny('ORIGINAL_GEMINI_SENT_MESSAGE_REQUIRED');
   try{if(await verifyOriginalTask(task,before)!==true)
      return deny('ORIGINAL_GEMINI_TASK_UNAUTHENTICATED')}
   catch{return deny('ORIGINAL_GEMINI_TASK_UNAUTHENTICATED')}
   // A new ORIGINAL signed phone job is required; never reuse caller JSON
   // or infer a valid snapshot from an HTTP 200/"ok:true" alone.
   let queued;try{queued=await createOriginalSnapshot({
     deviceId:before.deviceId,commandId,sessionId:before.sessionId,
     purpose:'GEMINI_VISIBLE_REPLY_READ_ONLY'
   })}catch{return deny('SIGNED_GEMINI_SNAPSHOT_NOT_QUEUED')}
   if(!object(queued)||!queued.id||queued.type!=='agent_snapshot'||
     queued.targetDeviceId!==before.deviceId||
     queued.secureSessionId!==before.sessionId||queued.commandId!==commandId||
     queued.status!=='queued')return deny('SIGNED_GEMINI_SNAPSHOT_SCOPE_MISMATCH');
   let done;try{done=await waitOriginalSnapshot(queued,25000)}
   catch{return deny('SIGNED_GEMINI_SNAPSHOT_UNAVAILABLE')}
   if(!validSnapshot(done,before,queued.id))
    return deny('SIGNED_GEMINI_SNAPSHOT_UNVERIFIED');
   try{if(await verifyOriginalSnapshot(done,queued,before)!==true)
     return deny('SIGNED_GEMINI_SNAPSHOT_UNAUTHENTICATED')}
   catch{return deny('SIGNED_GEMINI_SNAPSHOT_UNAUTHENTICATED')}
   const after=await owner(commandId);
   if(!same(before,after))return deny('GEMINI_WINDOW_CHANGED_DURING_READBACK');
   let rows;try{rows=JSON.parse(done.result.url)}catch{return deny('GEMINI_SNAPSHOT_JSON_INVALID')}
   if(!Array.isArray(rows)||rows.length<2||rows.length>3000)
    return deny('GEMINI_SNAPSHOT_ROWS_INVALID');
   const fold=inspectFoldPair(done.result,rows,FOLD_LAYOUTS.LEFT_GPT_RIGHT_NATIVE_GEMINI,clock());
   if(fold.ok!==true||fold.nativeGeminiWindowVerified!==true)
    return deny('SIGNED_GEMINI_RIGHT_PANE_UNVERIFIED');
   const p=fold;
   if(Number(p.workWindowId)!==before.workWindowId||
      Number(p.chatWindowId)!==before.chatWindowId||
      p.workPackage!==before.workPackage||p.chatPackage!==before.chatPackage||
      [p.workBounds.left,p.workBounds.top,p.workBounds.right,p.workBounds.bottom].join(',')!==before.workBounds||
      [p.chatBounds.left,p.chatBounds.top,p.chatBounds.right,p.chatBounds.bottom].join(',')!==before.chatBounds)
    return deny('GEMINI_SIGNED_PANE_SCOPE_CHANGED');
   const fragments=[];
   for(const row of rows){
    if(!object(row)||row.package!==H||String(row.windowId)!==String(before.workWindowId))continue;
    if(row.viewId===REQUEST_ID)continue; // user text is never assistant text
    if(row.viewId!==RESPONSE_ID)continue;
    // A node marked as the Gemini assistant must carry the exact versioned
    // phone readback schema; a mismatched schema is not an absent answer.
    if(row.geminiReadbackSchema!=='NATIVE_V4')
      return deny('GEMINI_VISIBLE_TEXT_SCOPE_INVALID');
    if(row.sensitive!=='false'||row.geminiFullReplyVerified!=='false'||
       !hex64(row.geminiTextDigest)||typeof row.geminiPlainText!=='string'||
       row.geminiPlainText.length<1||row.geminiPlainText.length>800||
       !['true','false'].includes(row.geminiTextPartial)||
       !/^\d{1,6}$/.test(row.geminiVisibleTextLength??''))
      return deny('GEMINI_VISIBLE_TEXT_SCOPE_INVALID');
    if(fragments.length>=8)return deny('GEMINI_VISIBLE_NODE_BUDGET_EXCEEDED');
    fragments.push(Object.freeze({
      maskedText:row.geminiPlainText,digest:row.geminiTextDigest,
      visibleLength:Number(row.geminiVisibleTextLength),
      nodePartial:row.geminiTextPartial==='true'
    }));
   }
   if(fragments.length===0)return deny('GEMINI_ASSISTANT_REPLY_NOT_VISIBLE');
   if(!same(before,await owner(commandId)))
    return deny('GEMINI_WINDOW_CHANGED_AFTER_READBACK');
   // Fragment cannot be assigned to sentMessageId without new on-phone
   // authenticated reply-turn evidence. Full reply remains FALSE always.
   return Object.freeze({ok:true,code:'SIGNED_GEMINI_VISIBLE_FRAGMENTS_UNBOUND',
    taskId:tid,fragmentCount:fragments.length,fragments:Object.freeze(fragments),
    masked:true,readOnly:true,fullReplyVerified:false,
    requestTurnVerified:false,conversationVerified:false,
    requiresMessageTurnProof:true,autoReplay:false});
  }finally{busy=false}
 }
 return Object.freeze({read,capabilities:()=>Object.freeze({
  enabled:enabled===true,mode:'LEFT_GPT_RIGHT_NATIVE_GEMINI',
  originalSecure56Required:true,readOnly:true,
  requestTurnVerified:false,fullReplyVerified:false,
  actualPhoneTested:false,productionRegistered:false,autoReplay:false
 })});
}
