import {createHash} from 'node:crypto';
import {
  BASE_CATALOG_DIGEST,CAMERA_TOOL,BINDING_JOB,CONFIG_JOB,
  BINDING_OPERATION,CONFIG_OPERATION,EXPECTED_PACKAGE,
  CAMERA_EXTENSION,MAX_REQUEST_CHARS
} from './camera-contract.mjs';

const deny=code=>Object.freeze({kind:'DENY',code});
const sha=v=>createHash('sha256').update(String(v),'utf8').digest('hex');
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const only=(v,fields)=>object(v)&&Object.keys(v).every(k=>fields.includes(k));
const common=[
  'taskId','effect','action','index','viewportWidth','viewportHeight','scrollX','scrollY','waitMs',
  'dataClass','maxActionsInCall','mcpToolName','taskDigest','targetDeviceDigest',
  'secureRequestedEffect','secureInvocationExpiresAt','containsCredential','commandId',
  'operation','packageName','cameraExtension','allowedSideEffect'
];
const configExtra=['cameraTarget','cameraExpiresAtMs','directRequest'];

export function exactCameraExtension(v){
  return object(v)&&v.id===CAMERA_EXTENSION.id&&v.version===CAMERA_EXTENSION.version&&
    v.digest===CAMERA_EXTENSION.digest&&Object.keys(v).length===3;
}
function exactBaseEnvelope(payload){
  return payload.containsCredential===false&&payload.dataClass==='NONE'&&
    typeof payload.taskDigest==='string'&&/^[a-f0-9]{64}$/.test(payload.taskDigest)&&
    payload.taskId===payload.taskDigest&&
    typeof payload.targetDeviceDigest==='string'&&/^[a-f0-9]{64}$/.test(payload.targetDeviceDigest)&&
    Number.isSafeInteger(payload.secureInvocationExpiresAt)&&payload.secureInvocationExpiresAt>0&&
    typeof payload.commandId==='string'&&/^[a-f0-9]{32}$/.test(payload.commandId)&&
    payload.effect==='READ_ONLY'&&payload.action===''&&payload.maxActionsInCall===20&&
    ['index','viewportWidth','viewportHeight','scrollX','scrollY','waitMs'].every(k=>payload[k]===0);
}
function cameraSignal(job,payload){
  return job?.type===BINDING_JOB||job?.type===CONFIG_JOB||job?.mcpToolName===CAMERA_TOOL||
    Object.hasOwn(job||{},'cameraExtension')||Object.hasOwn(payload||{},'cameraExtension');
}
function targetOk(v,payload){
  return object(v)&&typeof v.deviceId==='string'&&v.deviceId.length>0&&v.deviceId.length<=160&&
    v.taskId===payload.taskDigest&&v.commandId===payload.commandId&&
    typeof v.sessionId==='string'&&v.sessionId.length>0&&v.sessionId.length<=240&&
    Number.isSafeInteger(v.rightWindowId)&&v.rightWindowId>0&&Object.keys(v).length===5;
}
function requestOk(v){
  return typeof v==='string'&&v.length>0&&v.length<=MAX_REQUEST_CHARS&&/\S/u.test(v)&&
    !/[\u0000-\u001f\u007f]/u.test(v);
}

export function createCameraDurableClassifier({getCatalogDigest}={}){
  return function classifyCameraJob(job,payload){
    if(!cameraSignal(job,payload))return null;
    try{
      if(typeof getCatalogDigest!=='function'||getCatalogDigest()!==BASE_CATALOG_DIGEST)
        return deny('CAMERA_BASE_CATALOG_MISMATCH');
      if(!object(job)||!object(payload)||!exactCameraExtension(job.cameraExtension)||
         !exactCameraExtension(payload.cameraExtension)||!exactBaseEnvelope(payload))
        return deny('CAMERA_DURABLE_ENVELOPE_INVALID');
      if(job.mcpToolName!==CAMERA_TOOL||payload.mcpToolName!==CAMERA_TOOL)
        return deny('CAMERA_DURABLE_TOOL_MISMATCH');

      if(job.type===BINDING_JOB){
        if(job.secureRequestedEffect!=='READ_ONLY'||payload.secureRequestedEffect!=='READ_ONLY'||
           payload.operation!==BINDING_OPERATION||payload.packageName!==EXPECTED_PACKAGE||
           payload.allowedSideEffect!=='READ_CURRENT_CAMERA_BINDING_ONLY'||
           !only(payload,common))
          return deny('CAMERA_DURABLE_BINDING_ROUTE_MISMATCH');
        return Object.freeze({kind:'READ'});
      }

      if(job.type===CONFIG_JOB){
        if(job.secureRequestedEffect!=='WRITE_REVERSIBLE'||payload.secureRequestedEffect!=='WRITE_REVERSIBLE'||
           payload.operation!==CONFIG_OPERATION||payload.packageName!==EXPECTED_PACKAGE||
           payload.allowedSideEffect!=='CURRENT_CAMERA_SETTINGS_ONLY'||
           !only(payload,[...common,...configExtra])||
           !targetOk(payload.cameraTarget,payload)||!requestOk(payload.directRequest)||
           !Number.isSafeInteger(payload.cameraExpiresAtMs)||payload.cameraExpiresAtMs<=0)
          return deny('CAMERA_DURABLE_CONFIG_ROUTE_MISMATCH');
        return Object.freeze({kind:'JOURNAL',identityPayload:{
          operation:CONFIG_OPERATION,
          commandId:payload.commandId,
          taskDigest:payload.taskDigest,
          targetDeviceDigest:payload.targetDeviceDigest,
          sessionDigest:sha(payload.cameraTarget.sessionId),
          rightWindowId:payload.cameraTarget.rightWindowId,
          requestDigest:sha(payload.directRequest)
        },approvalGranted:false,screenConsentGranted:false});
      }
      return deny('CAMERA_DURABLE_ROUTE_MISMATCH');
    }catch{
      return deny('CAMERA_DURABLE_REJECTED');
    }
  };
}
