// Only fixed, reviewed device failure codes may leave the signed completion.
// Never forward arbitrary error text, identifiers or a failed result payload.
const DEVICE_FRAME_FAILURES=new Set([
  'CAMERA_LOCAL_SHARING_REQUIRED','CAMERA_SETTINGS_STILL_APPLYING',
  'CAMERA_FRESH_FRAME_REQUIRED','CAMERA_NOT_READY','CAMERA_FRAME_UNCONFIRMED',
  'GOAL_FRAME_UPLOAD_UNCONFIRMED'
]);
const fail=(code,failureStage)=>({ok:false,code,failureStage,automaticReplayAllowed:false});

/** Existing signed frame lease; no image bytes enter the completion journal. */
export function createGoalFramePort({chooseDevice,active,createWaiter,awaitFrame,runSecure,textResult,sha}) {
  return async request => {
    const device=chooseDevice(request.args.device_id||null);
    if(!device||!active(device))return textResult({ok:false,code:'CAMERA_DEVICE_NOT_ACTIVE'});
    const waiter=createWaiter(device,request.args.task_digest);
    if(!waiter)return textResult({ok:false,code:'CAMERA_FRAME_BUDGET'});
    // Await both paths even if command execution rejects, so a received private
    // buffer is always erased rather than abandoned by Promise.all early rejection.
    const [jobResult,frameResult]=await Promise.allSettled([
      Promise.resolve().then(()=>runSecure({...request,args:{...request.args,device_id:device},
        extra:{...request.extra,frameUploadLease:waiter.lease}})),
      Promise.resolve().then(()=>awaitFrame(waiter,15000))
    ]);
    const frame=frameResult.status==='fulfilled'?frameResult.value:null;
    try {
      const job=jobResult.status==='fulfilled'?jobResult.value:null;
      const result=job?.result;
      if(job?.status==='complete'&&result?.ok===false&&DEVICE_FRAME_FAILURES.has(result.code))
        return textResult(fail(result.code,'DEVICE_REPLY'));
      if(!result||result.ok!==true||result.code!=='CURRENT_CAMERA_FRAME'||
         !/^[a-f0-9]{32}$/.test(result.frameId||'')||typeof result.sessionId!=='string'||!result.sessionId||
         result.mimeType!=='image/jpeg')
        return textResult(fail('CAMERA_FRAME_UNCONFIRMED',job?.status==='complete'?'RECEIPT_VALIDATION':'SIGNED_COMMAND'));
      if(!Buffer.isBuffer(frame)||frame.length<4||frame[0]!==255||frame[1]!==216)
        return textResult(fail('CAMERA_FRAME_UNCONFIRMED','FRAME_TRANSFER'));
      return {content:[{type:'text',text:JSON.stringify({...result,frameDigest:sha(frame),persisted:false})},
        {type:'image',data:frame.toString('base64'),mimeType:'image/jpeg'}]};
    } finally {if(Buffer.isBuffer(frame))frame.fill(0);}
  };
}
