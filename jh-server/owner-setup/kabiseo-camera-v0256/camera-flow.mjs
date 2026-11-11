import {
  CAMERA_TOOL,BINDING_JOB,CONFIG_JOB,BINDING_OPERATION,CONFIG_OPERATION,
  EXPECTED_PACKAGE,CAMERA_EXTENSION,PROTOCOL,validateDirectRequest
} from './camera-contract.mjs';

const HEX32=/^[a-f0-9]{32}$/;
const HEX64=/^[a-f0-9]{64}$/;

function safeBinding(result){
  if(!result||result.ok!==true||typeof result.sessionId!=='string'||result.sessionId.length<1||
     !Number.isSafeInteger(result.rightWindowId)||result.rightWindowId<1)return null;
  return {sessionId:result.sessionId,rightWindowId:result.rightWindowId};
}

// Expose a fixed, data-free phase code; never include a camera session, image, or raw exception.
function failClosed(code){
  return {ok:false,accepted:false,code,userVisibleResult:false,automaticReplayAllowed:false,protocol:PROTOCOL};
}

export async function runCameraSettingsFlow({args,runSecure,nowMs=()=>Date.now()}){
  const request=validateDirectRequest(args?.request_text);
  const commandId=String(args?.command_id||'');
  const taskDigest=String(args?.task_digest||'');
  if(!HEX32.test(commandId))throw new TypeError('command_id invalid');
  if(!HEX64.test(taskDigest))throw new TypeError('task_digest invalid');
  if(typeof runSecure!=='function')throw new TypeError('runSecure required');

  const common={device_id:args?.device_id,task_digest:taskDigest,command_id:commandId};
  let bindingJob;
  try { bindingJob=await runSecure({
    mcpToolName:CAMERA_TOOL,jobType:BINDING_JOB,effect:'READ_ONLY',args:common,
    extra:{commandId,operation:BINDING_OPERATION,packageName:EXPECTED_PACKAGE,
      cameraExtension:CAMERA_EXTENSION,allowedSideEffect:'READ_CURRENT_CAMERA_BINDING_ONLY'}
  }); } catch { return failClosed('CAMERA_BINDING_DISPATCH_FAILED'); }
  const binding=safeBinding(bindingJob?.result);
  if(!binding)return failClosed('CAMERA_NOT_READY');

  const cameraExpiresAtMs=nowMs()+10_000;
  let configJob;
  try { configJob=await runSecure({
    mcpToolName:CAMERA_TOOL,jobType:CONFIG_JOB,effect:'WRITE_REVERSIBLE',args:common,
    extra:{commandId,operation:CONFIG_OPERATION,packageName:EXPECTED_PACKAGE,
      cameraExtension:CAMERA_EXTENSION,allowedSideEffect:'CURRENT_CAMERA_SETTINGS_ONLY',
      cameraTarget:{deviceId:String(configJobDevice(args,bindingJob)),taskId:taskDigest,commandId,
        sessionId:binding.sessionId,rightWindowId:binding.rightWindowId},
      cameraExpiresAtMs,directRequest:request}
  }); } catch { return failClosed('CAMERA_CONFIG_DISPATCH_FAILED'); }
  const applied=configJob?.result?.ok===true&&configJob?.result?.resultVerified===true;
  return {ok:applied,accepted:applied,code:applied?'CAMERA_SETTINGS_ACCEPTED':'CAMERA_SETTINGS_NOT_CONFIRMED',
    userVisibleResult:false,automaticReplayAllowed:false,protocol:PROTOCOL};
}

function configJobDevice(args,bindingJob){
  const explicit=String(args?.device_id||'');
  if(explicit)return explicit;
  const fromJob=String(bindingJob?.targetDeviceId||'');
  if(!fromJob)throw new TypeError('device binding missing');
  return fromJob;
}
