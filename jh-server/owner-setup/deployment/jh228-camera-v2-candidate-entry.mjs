/**
 * Disabled-by-default JH228 development candidate.
 * Do not turn on without complete producer -> ChatGPT left render -> phone E2E proof.
 */
import {pathToFileURL} from 'node:url';
import {buildJH228ReviewedRelease} from './jh228-camera-v2-durable-overlay.mjs';
const FLAG='EXPLICIT_JH228_CAMERA_V2_STAGE_OPERATOR_V1';
const PROD='srv-db0fjl2d0e5s73be114g';
export function chooseJH228CameraV2Startup(env={}){
 const value=env.JH228_CAMERA_V2_STAGE_OPERATOR_ENABLE;
 if(value===undefined||value==='')return 'original';
 if(value!==FLAG)throw Error('JH228_OPERATOR_FLAG_INVALID');
 if(env.RENDER_SERVICE_ID!==PROD||env.JH_DURABLE_RELEASE!=='SERVE_READY_V1')
   throw Error('JH228_OPERATOR_SERVICE_FENCE');
 if(env.CI==='true'||env.JH_OWNER_DEFER_LISTEN!==undefined||
    env.JH_PENDING_APPROVAL_OPERATOR_ENABLE!==undefined||
    env.JH_SPLIT_FOLLOWUP_OPERATOR_ENABLE!==undefined)
   throw Error('JH228_OPERATOR_CONFLICT');
 if(env.JH228_CAMERA_V2_UPSTREAM_E2E_GATE!=='TRUSTED_HOST_PORTS_AND_DEVICE_VERIFIED_V1')
   throw Error('JH228_UPSTREAM_E2E_NOT_VERIFIED');
 return 'jh228-candidate';
}
export async function main(env=process.env){
 if(chooseJH228CameraV2Startup(env)!=='jh228-candidate')
   throw Error('JH228_OPERATOR_NOT_ENABLED');
 const generated=buildJH228ReviewedRelease();
 const mod=await import(pathToFileURL(generated.file).href+'?sha256='+generated.sha256);
 const running=await mod.main(env);
 console.log('JH228_CAMERA_STAGE_RUNTIME_READY',JSON.stringify({
   stageRouteMounted:true,originalSecure56PinsPreserved:true,
   parentSha256:generated.parentSha256,generatedSha256:generated.sha256,
   autoTriggered:false,remoteShutterAllowed:false,
   imageProducerRealReceiptRequired:true}));
 return running;
}
