import {ok,fail,afterEffect,effectUnknown} from '../shared.mjs';
export async function runAndroidScreenshot({consent},bridge){
 const feature='SCREENSHOT';
 if(!consent?.grantToken||!consent?.digest||!consent?.leaseToken)
  return fail(feature,'ANDROID','PHONE_SCREEN_CONSENT_REQUIRED');
 let r;
 try{r=await bridge.captureWorkWindow(consent)}catch(e){
  return effectUnknown(feature,'ANDROID','SCREENSHOT_RESULT_UNKNOWN',{message:String(e?.message||e).slice(0,180)});
 }
 if(r?.ok===true&&r?.pixelsCaptured===true)
  return ok(feature,'ANDROID',{digest:r.screenshotDigest||r.frameDigest||null});
 if(r?.dispatched===false)return fail(feature,'ANDROID',r?.code||'SCREENSHOT_NOT_DISPATCHED');
 if(r?.pixelsCaptured===true||r?.frameDigest||r?.screenshotDigest||r?.dispatched===true)
  return afterEffect(feature,'ANDROID',r?.code||'SCREENSHOT_READBACK_UNVERIFIED',{dispatched:r?.dispatched===true});
 return effectUnknown(feature,'ANDROID',r?.code||'SCREENSHOT_RESULT_UNKNOWN');
}
