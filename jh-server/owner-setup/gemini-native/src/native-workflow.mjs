import {createGeminiNativeTask,NATIVE_BACKEND,GEMINI_HOST,hash,text,bound,sameTurn} from './contract.mjs';
export {createGeminiNativeTask};
const clone=structuredClone;
const callVerified=async(fn,...a)=>{try{return await fn(...a)===true}catch{return false}};
const safeCode=x=>/^[A-Z][A-Z0-9_]{0,99}$/.test(x??'')?x:'HOST_REVIEW_REQUIRED';
const terminal=new Set(['DELIVERED','CANCELLED']);
/** Foreground Android via ONE original JH executor. Not a Gemini API, browser
 * profile, autonomous loop, or automatic resume service. All injected ports
 * are trusted server code. Validators MUST verify signed original JH receipts;
 * fields such as verified:true never substitute for those validators. */
export class GeminiNativeWorkflow {
 constructor(state,{save,engine,delivery,verifyObservation,verifyReceipt,clock=Date.now}={}){
  if(state?.schema!==4||state.backend!==NATIVE_BACKEND||state.workSide!=='LEFT'||state.chatSide!=='RIGHT'||
   !engine||engine.backend!==NATIVE_BACKEND||typeof save!=='function'||
   [verifyObservation,verifyReceipt,clock].some(f=>typeof f!=='function')||typeof engine.observe!=='function')
    throw Error('V4_ORIGINAL_JH_NATIVE_ENGINE_REQUIRED');
  if(state.promptDigest!==hash(state.prompt))throw Error('STORED_REQUEST_CHANGED');
  this.state=clone(state);Object.assign(this,{save,engine,delivery,verifyObservation,verifyReceipt,clock});
  this._cancelled=state.cancelled===true;this._dispatchStarted=false;this._tail=Promise.resolve();
  // Reloaded non-new tasks may inspect existing jobs/results, never start more work.
  this.readOnlyRecovery=state.sequence>0||state.phase!=='READY';
 }
 enqueue(fn){const run=this._tail.then(fn);this._tail=run.catch(()=>{});return run;}
 advance(){return this.enqueue(()=>this.step());}
 async commit(changes){const next={...this.state,...changes};await this.save(clone(next));this.state=next;}
 report(code,status='WAITING',extra={}){return {taskId:this.state.id,mode:this.state.mode,status,code,
  presentation:'CHATGPT_RESULT',workSide:'LEFT',chatSide:'RIGHT',automaticReplay:false,
  automaticResume:false,fullVideoInspectionVerified:false,...extra};}
 cancel(){
  // Immediate fence; do not enqueue the cancellation signal behind a slow read.
  this._cancelled=true;
  const irreversible=this._dispatchStarted||!!this.state.pending;
  try{this.engine.cancelPending?.(this.state.id)}catch{}
  return this.enqueue(async()=>{await this.commit({cancelled:true,phase:'CANCELLED'});
   return this.report(irreversible?'CANCELLED_STOP_FURTHER_ACTIONS_PRIOR_OUTCOME_MAY_EXIST':'CANCELLED_BEFORE_DISPATCH','CANCELLED',
     {priorOutcomeMayExist:irreversible,pendingKind:this.state.pending?.kind??null});});
 }
 cancelled(){return this._cancelled||this.state.cancelled;}
 async observation(){
  const s=this.state;let o;try{o=await this.engine.observe({taskId:s.id,commandId:s.commandId,expectedRequestDigest:s.requestDigest})}catch{return null}
  if(this.cancelled())return null;
  const now=this.clock();
  if(!o||o.taskId!==s.id||o.commandId!==s.commandId||o.backend!==NATIVE_BACKEND||
    !text(o.deviceId,200)||!text(o.sessionId,200)||!text(o.receiptId,200)||
    !Number.isSafeInteger(o.observedAt)||o.observedAt>now||now-o.observedAt>15000||
    o.workSide!=='LEFT'||o.chatSide!=='RIGHT'||o.splitVerified!==true||
    !await callVerified(this.verifyObservation,o,s))return null;
  if(this.cancelled())return null;
  if(s.deviceId&&!bound(o,s))return null;
  return o;
 }
 async dispatch(kind,payload,fn,o=null){
  if(this.cancelled())return this.report('CANCELLED_BEFORE_DISPATCH','CANCELLED');
  if(this.readOnlyRecovery)return this.report('RESTORED_TASK_READ_ONLY_NO_AUTO_CONTINUE','NEEDS_HOST');
  if(this.state.pending)return this.report('OUTCOME_PENDING_READ_ONLY');
  if(typeof fn!=='function')return this.report('ORIGINAL_NATIVE_PORT_NOT_CONNECTED','NEEDS_HOST');
  const s=this.state,action={id:`${s.id}:${s.sequence+1}`,taskId:s.id,commandId:s.commandId,
   deviceId:s.deviceId,sessionId:s.sessionId,kind,at:this.clock(),
   accountBinding:s.accountBinding,conversationId:s.conversationId,workSide:'LEFT',chatSide:'RIGHT',
   promptDigest:s.promptDigest,requestDigest:s.requestDigest,...payload};
  // Durable reservation must succeed before invoking any mutating original port.
  await this.commit({sequence:s.sequence+1,pending:action});
  if(this.cancelled())return this.report('CANCELLED_BEFORE_DISPATCH','CANCELLED');
  this._dispatchStarted=true;
  let receipt;try{receipt=await fn(clone(action),o)}catch{return this.report('OUTCOME_UNKNOWN_READ_SAME_JOB')}
  finally{this._dispatchStarted=false;}
  if(this.cancelled())return this.report('CANCELLED_PRIOR_OUTCOME_REQUIRES_READBACK','CANCELLED');
  if(!receipt||receipt.actionId!==action.id||receipt.taskId!==s.id||receipt.commandId!==s.commandId||
    !bound(receipt,action)||!await callVerified(this.verifyReceipt,receipt,action))
      return this.report('OUTCOME_UNKNOWN_READ_SAME_JOB');
  if(this.cancelled())return this.report('CANCELLED_PRIOR_OUTCOME_REQUIRES_READBACK','CANCELLED');
  if(receipt.outcome==='NOT_DISPATCHED'){
   // No silent retry even on rejection. A fresh explicit user instruction may start
   // a new operation after the original local approval state has been checked.
   await this.commit({pending:null,phase:'BLOCKED',blocker:safeCode(receipt.code)});
   return this.report(this.state.blocker,'NEEDS_HOST');
  }
  return this.report('DEVICE_RECEIPT_NOT_EFFECT_PROOF');
 }
 sent(o,p){return sameTurn(o,this.state)&&o.sent?.actionId===p.id&&
  o.sent.promptDigest===this.state.promptDigest&&text(o.sent.messageId,200)&&
  Number.isSafeInteger(o.sent.at)&&o.sent.at>=p.at&&o.sent.at<=this.clock();}
 nativeMatch(o){return o.packageName===this.state.nativeAction?.packageName&&o.targetStateVerified===true&&o.independentOfGeminiReply===true;}
 async step(){
  if(this.cancelled())return this.report('CANCELLED_NO_NEW_ACTIONS','CANCELLED');
  const s=this.state;
  if(s.phase==='DELIVERED')return this.report('RESULT_IN_CHATGPT','DELIVERED',{result:s.result});
  if(s.phase==='BLOCKED')return this.report(s.blocker,'NEEDS_HOST');
  if(s.pending?.kind==='DELIVER')return this.checkDelivery();
  if(s.pending?.kind==='EXPORT_VIDEO')return this.checkExport();
  if(s.phase==='RESULT_READY'&&!s.pending)return this.deliver();
  const o=await this.observation();
  if(this.cancelled())return this.report('CANCELLED_BEFORE_DISPATCH','CANCELLED');
  if(!o)return this.report('FRESH_SIGNED_NATIVE_OBSERVATION_REQUIRED','NEEDS_HOST');
  if(o.blocker||o.locked||o.sensitive||o.ownerControlActive)
    return this.report(safeCode(o.blocker||'PHONE_LOCAL_STEP_REQUIRED'),'NEEDS_USER');
  if(!s.deviceId){await this.commit({deviceId:o.deviceId,sessionId:o.sessionId});if(this.cancelled())return this.report('CANCELLED_BEFORE_DISPATCH','CANCELLED');}
  if(s.mode!=='ANDROID'){
   if(o.packageName!==GEMINI_HOST||o.surface!=='GEMINI_NATIVE'||o.surfaceVerified!==true)
      return this.report('GEMINI_NATIVE_LEFT_WINDOW_REQUIRED','NEEDS_USER');
   if(!text(o.accountBinding,200)||!text(o.conversationId,200))return this.report('ACCOUNT_AND_CONVERSATION_REQUIRED','NEEDS_HOST');
   if(s.accountBinding&&!sameTurn(o,s))return this.report('ACCOUNT_OR_CONVERSATION_CHANGED','NEEDS_HOST');
  }
  if(s.pending){
   const p=s.pending;
   if(p.kind==='TYPE'&&sameTurn(o,s)&&o.input?.text===s.prompt&&o.input?.draftActionId===p.id){
    await this.commit({pending:null,phase:'TYPED'});return this.report('DRAFT_READBACK_CONFIRMED');
   }
   if(p.kind==='SUBMIT'&&this.sent(o,p)){
    await this.commit({pending:null,phase:'WAITING',sentMessageId:o.sent.messageId,submittedAt:o.sent.at});
    return this.report('SUBMISSION_READBACK_CONFIRMED');
   }
   if(p.kind==='OPEN_APP'&&this.nativeMatch(o)){
    await this.commit({pending:null,phase:'RESULT_READY',result:{kind:'APP_STATE',packageName:s.nativeAction.packageName,
      text:`${s.nativeAction.label} 앱이 왼쪽 작업창에서 확인됐습니다.`,effectVerified:true}});
    return this.report('TARGET_APP_INDEPENDENTLY_CONFIRMED');
   }
   return this.report('OUTCOME_PENDING_READ_ONLY');
  }
  if(s.mode==='ANDROID'){
   if(this.nativeMatch(o)){
    await this.commit({phase:'RESULT_READY',result:{kind:'APP_STATE',packageName:s.nativeAction.packageName,
      text:`${s.nativeAction.label} 앱이 왼쪽 작업창에서 확인됐습니다.`,effectVerified:true}});
    return this.report('TARGET_ALREADY_OPEN');
   }
   return this.dispatch('OPEN_APP',{targetPackage:s.nativeAction.packageName},this.engine.openApp?.bind(this.engine),o);
  }
  if(s.phase==='WAITING'){
   const r=o.result;
   if(!r||r.sentMessageId!==s.sentMessageId||r.promptDigest!==s.promptDigest||r.complete!==true||o.generating!==false)
      return this.report('WAIT_FOR_MATCHING_GENERATION_RESULT');
   if(s.mode==='YOUTUBE'){
    if(r.videoUrl!==s.url||!text(r.text,100000))return this.report('MATCHING_VIDEO_RESPONSE_REQUIRED');
    const full=r.coverageEvidence==='BOUND_COMPLETE_TRAVERSAL'&&r.fullReplyVerified===true;
    await this.commit({phase:'RESULT_READY',result:{kind:'TEXT',text:r.text,sourceUrl:s.url,
      coverage:['PUBLIC_INFO','TRANSCRIPT','VISUAL'].includes(r.coverage)?r.coverage:'UNKNOWN',
      fullReplyVerified:full,partial:!full,fullVideoInspectionVerified:false}});
    return this.report(full?'MATCHING_REPLY_COLLECTED':'MATCHING_VISIBLE_REPLY_PARTIAL');
   }
   if(!text(r.artifactHandle,300)||r.playable!==true)return this.report('MATCHING_PLAYABLE_VIDEO_REQUIRED');
   return this.dispatch('EXPORT_VIDEO',{sentMessageId:s.sentMessageId,artifactHandle:r.artifactHandle},
     this.engine.exportExistingVideo?.bind(this.engine),o);
  }
  if(s.mode==='VIDEO'&&(o.includedVideoUseAvailable!==true||o.additionalPaymentRequired!==false||o.videoModeSelected!==true))
     return this.report('INCLUDED_VIDEO_QUOTA_AND_MODE_REQUIRED','NEEDS_USER');
  if(s.phase==='READY'){
   if(!o.input?.unique||!text(o.input.target,500))return this.report('GEMINI_EDITOR_NOT_UNIQUE','NEEDS_HOST');
   if(o.input.text!=='')return this.report('EXISTING_DRAFT_NOT_OVERWRITTEN','NEEDS_USER');
   await this.commit({accountBinding:o.accountBinding,conversationId:o.conversationId});
   return this.dispatch('TYPE',{target:o.input.target,text:s.prompt},this.engine.type?.bind(this.engine),o);
  }
  if(s.phase==='TYPED'){
   if(o.input?.text!==s.prompt)return this.report('DRAFT_CHANGED_NOT_SENT','NEEDS_USER');
   if(o.generating!==false)return this.report('GEMINI_BUSY_OR_UNKNOWN');
   if(!o.submit?.unique||!text(o.submit.target,500)||o.submit.locallyReviewable!==true)
      return this.report('EXACT_LOCALLY_REVIEWABLE_SEND_REQUIRED','NEEDS_HOST');
   return this.dispatch('SUBMIT',{target:o.submit.target},this.engine.submit?.bind(this.engine),o);
  }
  return this.report('NO_AUTOMATIC_REPLAY');
 }
 async checkExport(){
  const s=this.state,p=s.pending;let r;
  try{r=await this.engine.lookupExport?.(p.id)}catch{return this.report('EXPORT_STATUS_UNAVAILABLE')}
  if(this.cancelled())return this.report('CANCELLED_NO_NEW_ACTIONS','CANCELLED');
  if(!r||r.actionId!==p.id||r.taskId!==s.id||r.commandId!==s.commandId||!bound(r,p)||
    !await callVerified(this.verifyReceipt,r,p)||r.outcome!=='EXPORTED')return this.report('EXISTING_VIDEO_EXPORT_UNCONFIRMED');
  const a=r.artifact;
  if(!a||a.taskId!==s.id||a.sentMessageId!==s.sentMessageId||a.accountBinding!==s.accountBinding||
   !/^[a-f0-9]{64}$/.test(a.sha256??'')||!Number.isSafeInteger(a.bytes)||a.bytes<1||
   !['video/mp4','video/webm'].includes(a.mime)||!Number.isFinite(a.durationSeconds)||a.durationSeconds<=0||
   !await callVerified(this.delivery?.verifyArtifact,a,s))return this.report('VIDEO_BYTES_AND_REQUEST_MISMATCH');
  if(this.cancelled())return this.report('CANCELLED_NO_NEW_ACTIONS','CANCELLED');
  const {taskId,sentMessageId,accountBinding,localPath,sha256,bytes,mime,durationSeconds}=a;
  await this.commit({pending:null,phase:'RESULT_READY',result:{kind:'VIDEO',artifact:{taskId,sentMessageId,accountBinding,localPath,sha256,bytes,mime,durationSeconds}}});
  return this.report('EXISTING_VIDEO_EXPORT_VERIFIED');
 }
 async deliver(){
  const payload=this.state.result;
  return this.dispatch('DELIVER',{payload,payloadDigest:hash(JSON.stringify(payload))},this.delivery?.publish?.bind(this.delivery));
 }
 async checkDelivery(){
  const s=this.state,p=s.pending;let r;
  try{r=await this.delivery?.lookup?.(p.id)}catch{return this.report('DELIVERY_STATUS_UNAVAILABLE')}
  if(this.cancelled())return this.report('CANCELLED_NO_NEW_ACTIONS','CANCELLED');
  if(!r||r.actionId!==p.id||r.taskId!==s.id||r.commandId!==s.commandId||!bound(r,p)||
   !await callVerified(this.verifyReceipt,r,p)||r.outcome!=='DELIVERED'||
   r.payloadDigest!==p.payloadDigest||!validDelivery(r,p.payload,this.delivery?.playbackOrigins??[]))
    return this.report('CHATGPT_DELIVERY_NOT_CONFIRMED');
  if(this.cancelled())return this.report('CANCELLED_NO_NEW_ACTIONS','CANCELLED');
  const result=p.payload.kind==='VIDEO'?{kind:'VIDEO',href:r.href,mime:r.mime,durationSeconds:r.durationSeconds,
    playbackVerified:r.playbackVerified===true,sha256:r.sha256}:p.payload;
  await this.commit({pending:null,phase:'DELIVERED',result});return this.report('RESULT_IN_CHATGPT','DELIVERED',{result});
 }
}
/** Links must be returned by the authenticated existing media host, match the
 * exact artifact, and use a host-configured origin. No arbitrary Gemini URL. */
export function validDelivery(r,payload,playbackOrigins=[]){
 if(!payload||r?.destination!=='CHATGPT')return false;
 if(payload.kind!=='VIDEO')return ['TEXT','APP_STATE'].includes(payload.kind);
 const a=payload.artifact;
 if(!a||r.sha256!==a.sha256||r.bytes!==a.bytes||r.mime!==a.mime||r.durationSeconds!==a.durationSeconds||
    typeof r.href!=='string'||r.playbackVerified!==true)return false;
 try{const u=new URL(r.href);return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&
   playbackOrigins.includes(u.origin)&&!['localhost','127.0.0.1','[::1]'].includes(u.hostname)}catch{return false}
}
