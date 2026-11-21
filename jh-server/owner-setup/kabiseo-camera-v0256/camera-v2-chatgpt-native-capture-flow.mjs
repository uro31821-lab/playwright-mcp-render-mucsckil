/**
 * JH228 first-party-only COMPOSITION. No REST Image API fallback.
 *
 * Bind a trusted current-turn REFERENCE to the native ChatGPT image generator,
 * then the existing LEFT verification, Secure56 stage and signed camera APPLY
 * pipeline. This module does not authorize a UI action or create an API key.
 * Missing actual ChatGPT host callbacks cause a fail-closed startup error.
 */
import {createNativeChatGPTImagePorts} from './camera-v2-chatgpt-native-image-ports.mjs';
import {createJH228CameraV2Pipeline} from './camera-v2-current-turn-pipeline.mjs';

const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const id=v=>typeof v==='string'&&v.trim().length>0&&v.length<=1024;

export function createJH228NativeChatGPTCaptureFlow({
  currentTurn,chatgptHostPorts,cameraHostPorts,stageStore,env,now
}={}){
  if(!obj(currentTurn)||!id(currentTurn.threadId)||!id(currentTurn.sourceRef)||
     !id(currentTurn.referenceAttachmentId)||
     !obj(chatgptHostPorts)||!obj(cameraHostPorts)||
     typeof cameraHostPorts.readCurrentTurn!=='function')
    throw Error('JH228_NATIVE_CAPTURE_COMPOSITION_PORTS_REQUIRED');
  const bound=Object.freeze({
    threadId:currentTurn.threadId,sourceRef:currentTurn.sourceRef,
    referenceAttachmentId:currentTurn.referenceAttachmentId
  });
  const native=createNativeChatGPTImagePorts({
    ...chatgptHostPorts,currentTurn:bound
  });
  // Native provider ports MUST overwrite any legacy/external paid image ports.
  const wrapped={
    ...cameraHostPorts,
    readCurrentTurn:async()=>{
      const t=await cameraHostPorts.readCurrentTurn();
      return t?.threadId===bound.threadId&&t?.sourceRef===bound.sourceRef&&
        Array.isArray(t.attachments)&&t.attachments.length===1&&
        t.attachments[0]?.id===bound.referenceAttachmentId&&
        t.attachments[0]?.role==='REFERENCE'?t:null;
    },
    confirmImageGenerationReady:native.confirmImageGenerationReady,
    createSingleExample:native.createSingleExample
  };
  const pipeline=createJH228CameraV2Pipeline(wrapped,{
    stageStore,env,...(typeof now==='function'?{now}:{})
  });
  return Object.freeze({
    mode:'CHATGPT_NATIVE_IMAGEGEN_ONLY',
    run:({mood}={})=>pipeline.run({mood})
  });
}
