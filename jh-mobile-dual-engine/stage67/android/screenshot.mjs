import {ok,fail} from '../shared.mjs';
export async function runAndroidScreenshot({consent},bridge){
 const feature='SCREENSHOT';
 if(!consent?.grantToken||!consent?.digest||!consent?.leaseToken)
  return fail(feature,'ANDROID','PHONE_SCREEN_CONSENT_REQUIRED');
 const r=await bridge.captureWorkWindow(consent);
 if(r?.ok!==true||r?.pixelsCaptured!==true)return fail(feature,'ANDROID',r?.code||'SCREENSHOT_UNVERIFIED');
 return ok(feature,'ANDROID',{digest:r.screenshotDigest||r.frameDigest||null});
}