import {
  BASE_CATALOG_DIGEST,CAMERA_TOOL,BINDING_JOB,CONFIG_JOB,
  BINDING_OPERATION,CONFIG_OPERATION,CAMERA_EXTENSION,PROTOCOL
} from './camera-contract.mjs';
import {runCameraSettingsFlow} from './camera-flow.mjs';
import {createCameraDurableClassifier,exactCameraExtension} from './camera-durable-policy.mjs';

function signal(type,payload){
  return type===BINDING_JOB||type===CONFIG_JOB||payload?.mcpToolName===CAMERA_TOOL||
    Object.hasOwn(payload||{},'cameraExtension');
}
function fail(code){throw Object.assign(Error(code),{code});}
// Fixed diagnostic codes only. Never serialize exception text, command values,
// camera state, photo content or activity/window identifiers into MCP responses.
function safeHandlerErrorCode(error){
  const mapping={
    'camera request invalid':'CAMERA_PREFLIGHT_TEXT_REJECTED',
    'command_id invalid':'CAMERA_PREFLIGHT_COMMAND_REJECTED',
    'task_digest invalid':'CAMERA_PREFLIGHT_TASK_REJECTED',
    'runSecure required':'CAMERA_PREFLIGHT_RUNNER_REJECTED'
  };
  const m=typeof error?.message==='string'?error.message:'';
  return Object.hasOwn(mapping,m)?mapping[m]:'CAMERA_HANDLER_INTERNAL_ERROR';
}
// Diagnostic classes, never the command itself. A valid client command must
// still pass the exact 32-hex check in camera-flow.mjs; no fallback or replay.
function commandArgumentShape(args){
  const value=args?.command_id;
  if(value===undefined)return 'MISSING';
  if(typeof value!=='string')return 'WRONG_TYPE';
  if(value.length!==32)return 'WRONG_LENGTH';
  return /^[a-f0-9]{32}$/.test(value)?'VALID':'WRONG_FORMAT';
}
function validate(type,payload,deviceId,now){
  if(!signal(type,payload))return;
  if(!exactCameraExtension(payload.cameraExtension))fail('CAMERA_EXTENSION_MISMATCH');
  if(payload.mcpToolName!==CAMERA_TOOL)fail('CAMERA_TOOL_MISMATCH');
  if(type===BINDING_JOB){
    if(payload.secureRequestedEffect!=='READ_ONLY'||payload.operation!==BINDING_OPERATION)
      fail('CAMERA_BINDING_ROUTE_MISMATCH');
    return;
  }
  if(type===CONFIG_JOB){
    const t=payload.cameraTarget;
    if(payload.secureRequestedEffect!=='WRITE_REVERSIBLE'||payload.operation!==CONFIG_OPERATION||
       !t||t.deviceId!==deviceId||t.commandId!==payload.commandId||t.taskId!==payload.taskDigest||
       !Number.isSafeInteger(payload.cameraExpiresAtMs)||payload.cameraExpiresAtMs<=now()||
       payload.cameraExpiresAtMs>now()+15000)
      fail('CAMERA_CONFIG_BINDING_MISMATCH');
    return;
  }
  fail('CAMERA_ROUTE_MISMATCH');
}

export function createCameraHostIntegration({getCatalogDigest,runSecure,now=Date.now}={}){
  if(typeof getCatalogDigest!=='function'||typeof runSecure!=='function')fail('CAMERA_HOST_PORT_REQUIRED');
  if(getCatalogDigest()!==BASE_CATALOG_DIGEST)fail('CAMERA_BASE_CATALOG_MISMATCH');
  console.info('JH_KABISEO_HANDLER_DIAGNOSTIC_V2_READY');
  const classify=createCameraDurableClassifier({getCatalogDigest});
  return Object.freeze({
    classify,
    beforeMk(type,payload,deviceId){validate(type,payload,deviceId,now);},
    beforeDispatch(job){
      try{validate(job?.type,job,job?.targetDeviceId,now);return {allowed:true};}
      catch(e){return {allowed:false,code:e?.code||'CAMERA_DISPATCH_REJECTED',httpStatus:409};}
    },
    register({z,registerOAuthTool,textResult}={}){
      if(!z||typeof registerOAuthTool!=='function'||typeof textResult!=='function')fail('CAMERA_REGISTER_PORT_REQUIRED');
      registerOAuthTool(CAMERA_TOOL,{
        title:'KaBiseo current camera settings',
        description:'Apply only shooting mode/style to the already-visible RIGHT KaBiseo camera through existing Secure56. Never launches camera, presses shutter, reads gallery, transfers photos, or returns camera-setting details.',
        inputSchema:{device_id:z.string().optional(),task_digest:z.string(),command_id:z.string().optional(),camera_command_id:z.string().optional(),request_text:z.string().min(1).max(160)},
        annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false}
      },async args=>{
        try{
          const result=await runCameraSettingsFlow({args,runSecure,nowMs:now});
          return textResult(result.ok?{ok:true,protocol:PROTOCOL}:{ok:false,code:result.code,protocol:PROTOCOL});
        }catch(error){
          const code=safeHandlerErrorCode(error);
          console.warn('JH_KABISEO_HANDLER_DIAGNOSTIC '+code);
          if(code==='CAMERA_PREFLIGHT_COMMAND_REJECTED')
            console.warn('JH_KABISEO_COMMAND_INPUT_SHAPE '+commandArgumentShape(args));
          return textResult({ok:false,code,protocol:PROTOCOL});
        }
      });
      return Object.freeze({tool:CAMERA_TOOL,extension:CAMERA_EXTENSION});
    }
  });
}
