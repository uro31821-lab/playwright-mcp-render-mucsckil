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
      const result=jobResult.status==='fulfilled'?jobResult.value?.result:null;
      if(!Buffer.isBuffer(frame)||!result||result.ok!==true||result.code!=='CURRENT_CAMERA_FRAME'||
         !/^[a-f0-9]{32}$/.test(result.frameId||'')||typeof result.sessionId!=='string'||!result.sessionId||
         result.mimeType!=='image/jpeg'||frame.length<4||frame[0]!==255||frame[1]!==216)
        return textResult({ok:false,code:'CAMERA_FRAME_UNCONFIRMED',automaticReplayAllowed:false});
      return {content:[{type:'text',text:JSON.stringify({...result,frameDigest:sha(frame),persisted:false})},
        {type:'image',data:frame.toString('base64'),mimeType:'image/jpeg'}]};
    } finally {if(Buffer.isBuffer(frame))frame.fill(0);}
  };
}
