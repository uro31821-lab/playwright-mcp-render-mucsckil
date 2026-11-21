/**
 * KaBiseo size-only zoom candidate; no JPEG, no image tool, no AUTO or shutter.
 * Produces a single bound goal but never calls the device.
 * Current user intent and current device STATUS require independent host proofs.
 */
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const hex64=/^[a-f0-9]{64}$/,hex32=/^[a-f0-9]{32}$/;
const no=code=>({ok:false,code,deviceAction:false});
export const PROTOCOL='JH_CAMERA_V2_ZOOM_ONLY_V1';
export function makeZoomOnlyGoal({
  intent,deviceStatus,scope,verifyCurrentSignedStatus,
  verifyCurrentUserIntent,nowMs=Date.now()
}={}){
  let signed=false,user=false;
  try{signed=typeof verifyCurrentSignedStatus==='function'&&
       verifyCurrentSignedStatus({deviceStatus,scope})===true}catch{}
  if(!signed)return no('SECURE56_CURRENT_STATUS_NOT_VERIFIED');
  try{user=typeof verifyCurrentUserIntent==='function'&&
       verifyCurrentUserIntent({intent,scope})===true}catch{}
  if(!user)return no('CURRENT_USER_ZOOM_INTENT_NOT_VERIFIED');
  if(!Number.isSafeInteger(nowMs)||!object(intent)||!object(deviceStatus)||!object(scope)||
     !hex64.test(scope.taskDigest??'')||!hex64.test(scope.deviceDigest??'')||
     !hex32.test(scope.cameraCommandId??''))
    return no('ZOOM_INPUT_UNVERIFIED');
  if(intent.threadId!==scope.threadId||intent.sourceRef!==scope.sourceRef||
     intent.kind!=='SUBJECT_SIZE'||intent.userRequested!==true||
     !['INCREASE','DECREASE'].includes(intent.direction)||
     !['SLIGHT','MODERATE'].includes(intent.amount))
    return no('ZOOM_NOT_A_SIZE_REQUEST');
  if(intent.perspectiveChangeNeeded===true)return no('CAMERA_MOVEMENT_REQUIRED');
  if(intent.perspectiveChangeNeeded!==false)return no('PERSPECTIVE_UNCONFIRMED');
  if(deviceStatus.code!=='V2_CAMERA_UI_STATUS'||deviceStatus.appCameraFlow!=='AI_CAMERA_V2'||
     deviceStatus.autoArmed!==false||deviceStatus.autoVisualActive!==false||
     deviceStatus.manualZoomOverride!==false||
     deviceStatus.cameraReadiness?.ready!==true||
     typeof deviceStatus.sessionId!=='string'||deviceStatus.sessionId.length<8||
     !Number.isInteger(deviceStatus.rightWindowId)||deviceStatus.rightWindowId<1||
     !Number.isFinite(deviceStatus.actualZoom)||deviceStatus.actualZoom<=0)
    return no('RIGHT_CAMERA_NOT_READY');
  if(scope.secureSessionId!==deviceStatus.secureSessionId||
     scope.currentCameraSessionId!==deviceStatus.sessionId||
     scope.currentRightWindowId!==deviceStatus.rightWindowId||
     scope.taskDigest!==deviceStatus.taskDigest||
     scope.deviceDigest!==deviceStatus.deviceDigest)
    return no('ZOOM_DEVICE_SESSION_CHANGED');
  if(!Number.isSafeInteger(deviceStatus.receivedAtMs)||
     nowMs-deviceStatus.receivedAtMs<0||nowMs-deviceStatus.receivedAtMs>10000)
    return no('ZOOM_STATUS_STALE');
  // AI's qualitative size-only intent, not a measured pre-AUTO subject bound.
  const factor=intent.direction==='INCREASE'
    ?(intent.amount==='SLIGHT'?1.15:1.25)
    :(intent.amount==='SLIGHT'?0.85:0.75);
  return {ok:true,code:'ZOOM_GOAL_READY_NOT_APPLIED',deviceAction:false,
    tool:'life_android_camera_goal_v1',action:'apply',
    camera_command_id:scope.cameraCommandId,task_digest:scope.taskDigest,
    goal:{v2Protocol:PROTOCOL,purpose:'SUBJECT_SIZE_ONLY',
      relativeSubjectScale:factor,perspectiveRequired:false,
      expectedSessionId:deviceStatus.sessionId,
      expectedRightWindowId:deviceStatus.rightWindowId,
      expectedZoom:deviceStatus.actualZoom,expiresAtMs:nowMs+20000},
    afterAction:'READ_GOAL_STATUS_AND_REQUIRE_ZOOM_APPLIED_VERIFIED',
    canRetryUnknownEffect:false,noRemoteAuto:true,externalImageTransfer:false};
}
