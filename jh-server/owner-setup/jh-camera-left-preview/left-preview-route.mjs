/** JH camera -> pyeonbiseo LEFT-ChatGPT preview ONLY.
 * Camera remains lead. Pure planning, no image tool, no Android side effect.
 * Host must actually invoke first-party ChatGPT image tool and render one image.
 */
import {createHash} from 'node:crypto';
const str=x=>typeof x==='string'&&x.trim().length>0&&x.length<=1024&&!/[\u0000-\u001f]/.test(x);
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const deny=code=>Object.freeze({allowed:false,code,previewGenerated:false,deviceTouched:false});
export function planLeftPreview({turn,routeReceipt,verifyShootingRoute,mood,selection}={}){
 if(!obj(turn)||!str(turn.threadId)||!str(turn.sourceRef)||
    typeof turn.utterance!=='string'||!turn.utterance.trim())
   return deny('CURRENT_TURN_UNVERIFIED');
 if(typeof verifyShootingRoute!=='function')return deny('ROUTE_VERIFIER_REQUIRED');
 if(!obj(routeReceipt)||routeReceipt.disposition!=='camera'||
    routeReceipt.reason!=='CAPTURE_REQUEST'||routeReceipt.pendingReadback===true||
    routeReceipt.threadId!==turn.threadId||routeReceipt.sourceRef!==turn.sourceRef)
   return deny('CURRENT_CAPTURE_UNVERIFIED');
 try{if(verifyShootingRoute(turn,routeReceipt)!==true)return deny('ROUTE_RECEIPT_REJECTED')}
 catch{return deny('ROUTE_RECEIPT_REJECTED')}
 if(typeof mood!=='string'||!mood.trim()||mood.trim().length>160)
   return deny('MOOD_REQUIRED');
 if(!Array.isArray(turn.attachments)||turn.attachments.length>10||
    turn.attachments.some(x=>!obj(x)||!str(x.id)||!['REFERENCE','EDITABLE'].includes(x.role))||
    new Set(turn.attachments.map(x=>x.id)).size!==turn.attachments.length)
   return deny('REFERENCE_INVALID');
 const refs=turn.attachments.filter(x=>x.role==='REFERENCE');
 const ref=selection??(refs.length===1?refs[0].id:null);
 if(!str(ref)||refs.filter(x=>x.id===ref).length!==1)return deny('PRIMARY_REFERENCE_REQUIRED');
 return Object.freeze({
   allowed:true,code:'LEFT_CAMERA_PREVIEW_PLANNED',threadId:turn.threadId,
   sourceRef:turn.sourceRef,referenceId:ref,
   identity:sha([turn.threadId,turn.sourceRef,ref]),
   lead:'camera',collaborator:'photo',collaboration:'PYEONBISEO_CAMERA_PREVIEW_ONLY',
   mood:mood.trim(),count:1,provider:'CHATGPT_NATIVE_IMAGE_GEN',
   outputPane:'LEFT_GPT',movementLines:3,approximate:true,
   preserve:['SUBJECT','OBJECT_COUNT','BACKGROUND'],cameraMoves:[
     'NEAR','FAR','LEFT','RIGHT','HEIGHT','DIAGONAL_45','ROTATE','ORBIT','TILT','ZOOM'],
   forbidden:['ANDROID_IMAGE_TRANSFER','SECURE56_STAGE','SIGNED_GOAL_APPLY',
     'USER_CLIPBOARD','PAID_IMAGE_API','REMOTE_AUTO','SHUTTER'],
   previewGenerated:false,deviceTouched:false
 });
}
export function easyThreeLines(lines){
 return Array.isArray(lines)&&lines.length===3&&lines.every(x=>
  typeof x==='string'&&x.trim()===x&&x.length>=4&&x.length<=30&&
  !/[\r\n<>]/.test(x)&&
  !/(제품|물건|소품|배경|조명|램프).{0,8}(옮겨|이동|켜|꺼|치워)/.test(x));
}
export function checkLeftPreviewResult(plan,{imageToolSucceeded=false,leftRendered=false,
 lines=[],rightTransferAttempted=false}={}){
 if(plan?.allowed!==true)return {completed:false,code:'VALID_PLAN_REQUIRED'};
 if(rightTransferAttempted)return {completed:false,code:'RIGHT_TRANSFER_FORBIDDEN'};
 if(imageToolSucceeded!==true||leftRendered!==true)return {completed:false,code:'LEFT_IMAGE_NOT_CONFIRMED'};
 if(!easyThreeLines(lines))return {completed:false,code:'THREE_EASY_LINES_REQUIRED'};
 return {completed:true,code:'LEFT_PREVIEW_READY',leftOnly:true,
    deviceTouched:false,lines:[...lines]};
}
export function oneTurnGate(){
 const seen=new Set();
 return {claim(plan){
   if(plan?.allowed!==true)return {claimed:false};
   if(seen.has(plan.identity))return {claimed:false,code:'ALREADY_HANDLED'};
   seen.add(plan.identity);return {claimed:true};
 }};
}
