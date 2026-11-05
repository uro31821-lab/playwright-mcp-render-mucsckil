import {ok,fail} from '../shared.mjs';
export async function runAndroidBack({expectedUrlBefore},bridge){
 const feature='BACK', before=await bridge.currentState();
 const r=await bridge.backOnce();
 if(r?.dispatched!==true&&r?.ok!==true)return fail(feature,'ANDROID',r?.code||'BACK_NOT_DISPATCHED');
 const after=await bridge.currentState();
 if(before?.url===after?.url)return fail(feature,'ANDROID','BACK_NO_NAVIGATION_VERIFIED');
 if(expectedUrlBefore&&before?.url!==expectedUrlBefore)return fail(feature,'ANDROID','BACK_SCOPE_CHANGED');
 return ok(feature,'ANDROID',{beforeUrl:before?.url,afterUrl:after?.url});
}