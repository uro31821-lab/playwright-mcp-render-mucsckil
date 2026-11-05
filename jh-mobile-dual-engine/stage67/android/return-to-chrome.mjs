import {ok,fail} from '../shared.mjs';
export async function runAndroidReturnToChrome({expectedPackage='com.android.chrome'},bridge){
 const feature='RETURN_TO_CHROME_FROM_OTHER_APP';
 const r=await bridge.returnPreviousWork();
 if(r?.ok!==true)return fail(feature,'ANDROID',r?.code||'RETURN_PREVIOUS_FAILED');
 const s=await bridge.currentState();
 if(s?.packageName!==expectedPackage)return fail(feature,'ANDROID','CHROME_FOCUS_NOT_VERIFIED',{packageName:s?.packageName});
 return ok(feature,'ANDROID',{packageName:s.packageName,windowId:s.windowId});
}