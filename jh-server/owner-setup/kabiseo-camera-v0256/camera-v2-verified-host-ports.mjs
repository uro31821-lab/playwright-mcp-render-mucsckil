/**
 * Server-local producer port for JH228. Not an HTTP endpoint.
 * It only connects a real trusted GPT LEFT renderer to the existing Secure56
 * stage store after confirming the CURRENT active signed device session.
 * User/model-provided "verified" flags cannot authorize staging.
 */
import {sharedCameraV2StageStore} from '../../camera-v2-secure-stage.mjs';
const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const H64=/^[a-f0-9]{64}$/,C32=/^[a-f0-9]{32}$/;
const SESSION=/^[A-Za-z0-9_-]{16,160}$/;
const ID=x=>typeof x==='string'&&x.trim()&&x.length<=1024;
const deny=code=>({acknowledged:false,code});
export function createJH228HostDeliveryPorts({
  currentTurn, signedScope, resolveActiveSignedSession,
  renderInLeftChat, store=sharedCameraV2StageStore, now=Date.now
}={}){
  if(!isObject(currentTurn)||!ID(currentTurn.threadId)||
     !ID(currentTurn.sourceRef)||!ID(currentTurn.referenceAttachmentId)||
     !isObject(signedScope)||!SESSION.test(signedScope.secureSessionId??'')||
     !H64.test(signedScope.deviceDigest??'')||!H64.test(signedScope.taskDigest??'')||
     !C32.test(signedScope.commandId??'')||
     typeof resolveActiveSignedSession!=='function'||
     typeof renderInLeftChat!=='function'||
     !store||typeof store.stageVerifiedJpeg!=='function'||
     typeof now!=='function')throw Error('JH228_TRUSTED_PORTS_REQUIRED');
  let state='INITIAL';
  const current=Object.freeze({
    threadId:currentTurn.threadId,sourceRef:currentTurn.sourceRef,
    attachmentId:currentTurn.referenceAttachmentId
  });
  async function checkSignedSession(){
    const active=await resolveActiveSignedSession(signedScope.secureSessionId);
    return isObject(active)&&active.verifiedBySecure56===true&&
      active.sessionId===signedScope.secureSessionId&&
      active.deviceDigest===signedScope.deviceDigest&&
      active.taskDigest===signedScope.taskDigest&&
      active.commandId===signedScope.commandId&&
      Number.isSafeInteger(active.expiresAtMs)&&active.expiresAtMs>now();
  }
  const chat=Object.freeze({
    async showLeft(renderPayload){
      if(state!=='INITIAL'||!isObject(renderPayload)||
         !Buffer.isBuffer(renderPayload.exampleJpeg)||
         renderPayload.sourceReferenceId!==current.attachmentId||
         !Array.isArray(renderPayload.lines)||renderPayload.lines.length!==3||
         renderPayload.referenceIsSimulated!==true)
        return {shown:false};
      state='PRESENTING';
      try{
        const receipt=await renderInLeftChat({threadId:current.threadId,
          sourceRef:current.sourceRef,attachmentId:current.attachmentId,
          exampleJpeg:renderPayload.exampleJpeg,lines:renderPayload.lines,
          caption:renderPayload.caption,referenceIsSimulated:true});
        if(!isObject(receipt)||receipt.shown!==true||
           receipt.threadId!==current.threadId||
           receipt.sourceRef!==current.sourceRef||
           receipt.attachmentId!==current.attachmentId||
           typeof receipt.presentationId!=='string'||
           !/^[A-Za-z0-9_-]{16,128}$/.test(receipt.presentationId)){
          state='FAILED';return {shown:false};
        }
        state='PRESENTED';
        return {shown:true};
      }catch{state='FAILED';return {shown:false};}
    }
  });
  const imageStage=Object.freeze({
    async stageVerifiedJpeg(payload){
      if(state!=='PRESENTED')return deny('JH228_LEFT_PRESENTATION_REQUIRED');
      state='STAGING'; // no second concurrent attempt
      try{
        if(!isObject(payload)||payload.threadId!==current.threadId||
           payload.secureSessionId!==signedScope.secureSessionId||
           payload.deviceDigest!==signedScope.deviceDigest||
           payload.taskDigest!==signedScope.taskDigest||
           payload.commandId!==signedScope.commandId)
          return deny('JH228_STAGE_SCOPE_MISMATCH');
        if(await checkSignedSession()!==true)return deny('JH228_ACTIVE_SECURE56_REQUIRED');
        // Override all externally supplied flags with a verified internal fact.
        const staged=store.stageVerifiedJpeg({...payload,verifiedBySecure56:true});
        if(staged?.acknowledged!==true)return deny('JH228_IMAGE_STAGE_REJECTED');
        return staged;
      }catch{return deny('JH228_IMAGE_STAGE_UNCERTAIN');}
      finally {state='FINISHED';}
    }
  });
  return Object.freeze({chat,imageStage,phase:()=>state});
}
