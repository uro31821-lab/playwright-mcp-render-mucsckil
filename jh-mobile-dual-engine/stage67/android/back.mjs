import {ok,fail,afterEffect,effectUnknown} from '../shared.mjs';
export async function runAndroidBack({expectedUrlBefore},bridge){
 const feature='BACK', before=await bridge.currentState();
 if(expectedUrlBefore&&before?.url!==expectedUrlBefore)
  return fail(feature,'ANDROID','BACK_SCOPE_CHANGED',{beforeUrl:before?.url,expectedUrlBefore});
 let r;
 try{r=await bridge.backOnce()}catch(e){
  return effectUnknown(feature,'ANDROID','BACK_DISPATCH_RESULT_UNKNOWN',{message:String(e?.message||e).slice(0,180)});
 }
 if(r?.dispatched===false)return fail(feature,'ANDROID',r?.code||'BACK_NOT_DISPATCHED');
 if(r?.dispatched!==true&&r?.ok!==true)
  return effectUnknown(feature,'ANDROID',r?.code||'BACK_DISPATCH_RESULT_UNKNOWN');
 const after=await bridge.currentState();
 if(before?.url===after?.url)
  return afterEffect(feature,'ANDROID','BACK_NO_NAVIGATION_VERIFIED',{beforeUrl:before?.url,afterUrl:after?.url,dispatched:r?.dispatched===true});
 return ok(feature,'ANDROID',{beforeUrl:before?.url,afterUrl:after?.url});
}
