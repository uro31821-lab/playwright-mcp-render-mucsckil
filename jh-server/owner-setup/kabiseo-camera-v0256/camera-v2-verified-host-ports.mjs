/**
 * Server-local JH228 trusted handoff (not a public image upload).
 * LEFT screenshot/render status is never inferred from a chat message: the
 * independent host receipt verifier must attest exact image + three-line hashes.
 */
import {createHash} from 'node:crypto';
import {sharedCameraV2StageStore} from '../../camera-v2-secure-stage.mjs';
const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const H64=/^[a-f0-9]{64}$/,C32=/^[a-f0-9]{32}$/;
const SESSION=/^[A-Za-z0-9_-]{16,160}$/;
const ID=x=>typeof x==='string'&&x.trim()&&x.length<=1024;
const sha=x=>createHash('sha256').update(x).digest('hex');
const deny=code=>({acknowledged:false,code});
const validLines=lines=>Array.isArray(lines)&&lines.length===3&&lines.every(x=>
  typeof x==='string'&&x.trim().length>=2&&x.length<=100&&!/[\u0000-\u001f\u007f]/u.test(x));
export function createJH228HostDeliveryPorts({
  currentTurn, signedScope, resolveActiveSignedSession,
  renderInLeftChat, verifyLeftPresentationReceipt,
  store=sharedCameraV2StageStore, now=Date.now
}={}){
  if(!isObject(currentTurn)||!ID(currentTurn.threadId)||
     !ID(currentTurn.sourceRef)||!ID(currentTurn.referenceAttachmentId)||
     !isObject(signedScope)||!SESSION.test(signedScope.secureSessionId??'')||
     !H64.test(signedScope.deviceDigest??'')||!H64.test(signedScope.taskDigest??'')||
     !C32.test(signedScope.commandId??'')||
     typeof resolveActiveSignedSession!=='function'||
     typeof renderInLeftChat!=='function'||
     typeof verifyLeftPresentationReceipt!=='function'||
     !store||typeof store.stageVerifiedJpeg!=='function'||
     typeof now!=='function')throw Error('JH228_TRUSTED_PORTS_REQUIRED');
  let state='INITIAL',presentedImageDigest=null;
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
         !validLines(renderPayload.lines)||
         renderPayload.referenceIsSimulated!==true)
        return {shown:false};
      state='PRESENTING';
      const imageSha256=sha(renderPayload.exampleJpeg);
      const linesSha256=sha(JSON.stringify(renderPayload.lines));
      const binding=Object.freeze({...current,imageSha256,linesSha256,
        referenceIsSimulated:true});
      try{
        const receipt=await renderInLeftChat({threadId:current.threadId,
          sourceRef:current.sourceRef,attachmentId:current.attachmentId,
          exampleJpeg:renderPayload.exampleJpeg,lines:[...renderPayload.lines],
          imageSha256,linesSha256,
          caption:renderPayload.caption,referenceIsSimulated:true});
        if(!isObject(receipt)||receipt.shown!==true||
           receipt.threadId!==current.threadId||
           receipt.sourceRef!==current.sourceRef||
           receipt.attachmentId!==current.attachmentId||
           receipt.imageSha256!==imageSha256||
           receipt.linesSha256!==linesSha256||
           typeof receipt.presentationId!=='string'||
           !/^[A-Za-z0-9_-]{16,128}$/.test(receipt.presentationId)||
           await verifyLeftPresentationReceipt(receipt,binding)!==true){
          state='FAILED';return {shown:false};
        }
        presentedImageDigest=imageSha256;
        state='PRESENTED';
        return {shown:true};
      }catch{state='FAILED';return {shown:false};}
    }
  });
  const imageStage=Object.freeze({
    async stageVerifiedJpeg(payload){
      if(state!=='PRESENTED')return deny('JH228_LEFT_PRESENTATION_REQUIRED');
      state='STAGING';
      try{
        if(!isObject(payload)||payload.threadId!==current.threadId||
           payload.secureSessionId!==signedScope.secureSessionId||
           payload.deviceDigest!==signedScope.deviceDigest||
           payload.taskDigest!==signedScope.taskDigest||
           payload.commandId!==signedScope.commandId)
          return deny('JH228_STAGE_SCOPE_MISMATCH');
        if(!Buffer.isBuffer(payload.bytes)||!H64.test(payload.sha256??'')||
           payload.sha256!==presentedImageDigest||
           sha(payload.bytes)!==presentedImageDigest)
          return deny('JH228_LEFT_IMAGE_BYTES_MISMATCH');
        if(await checkSignedSession()!==true)return deny('JH228_ACTIVE_SECURE56_REQUIRED');
        const staged=store.stageVerifiedJpeg({...payload,verifiedBySecure56:true});
        if(staged?.acknowledged!==true)return deny('JH228_IMAGE_STAGE_REJECTED');
        return staged;
      }catch{return deny('JH228_IMAGE_STAGE_UNCERTAIN');}
      finally {state='FINISHED';presentedImageDigest=null;}
    }
  });
  return Object.freeze({chat,imageStage,phase:()=>state});
}