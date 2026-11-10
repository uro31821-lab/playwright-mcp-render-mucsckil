import {createHash} from 'node:crypto';

export const BASE_CATALOG_DIGEST='a777e1a88a0b7633ba983ca3054d2eb28f3b9c41596e0a46b93597d478a42ca1';
export const CAMERA_TOOL='life_android_camera_settings';
export const BINDING_JOB='kabiseo_camera_binding_status';
export const CONFIG_JOB='kabiseo_camera_config';
export const BINDING_OPERATION='KABISEO_CAMERA_BINDING_READ_V1';
export const CONFIG_OPERATION='KABISEO_CAMERA_CONFIG_APPLY_V1';
export const EXPECTED_PACKAGE='com.koreanlifehub.bridge';
export const EXTENSION_ID='jh.kabiseo.camera';
export const EXTENSION_VERSION=1;
export const EXTENSION_DIGEST='72d29c150ca52de2bac82fac40682d079dd0951687297f5c5796d28b49bc85a6';
export const PROTOCOL='kabiseo_camera_settings_v1';
export const MAX_REQUEST_CHARS=160;

export const CAMERA_EXTENSION=Object.freeze({id:EXTENSION_ID,version:EXTENSION_VERSION,digest:EXTENSION_DIGEST});

export function validateDirectRequest(value){
  if(typeof value!=='string'||value.length<1||value.length>MAX_REQUEST_CHARS||!/\S/u.test(value)||/[\u0000-\u001f\u007f]/u.test(value))
    throw new TypeError('camera request invalid');
  return value;
}

export function cameraContractFingerprint(){
  const contract={
    effects:['READ_ONLY','WRITE_REVERSIBLE'],
    forbidden:['activity_launch','shutter','capture','gallery_read','photo_transfer','gpt_camera_result_callback','automatic_replay'],
    id:EXTENSION_ID,jobs:[BINDING_JOB,CONFIG_JOB],operations:[BINDING_OPERATION,CONFIG_OPERATION],
    scope:'already_visible_current_right_camera_settings_only',tool:CAMERA_TOOL,version:EXTENSION_VERSION
  };
  return createHash('sha256').update(JSON.stringify(contract,Object.keys(contract).sort()),'utf8').digest('hex');
}
