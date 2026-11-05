import {ok,fail,exactText} from '../shared.mjs';
export async function runAndroidWaitCondition({expectedText,timeoutMs=3000},bridge){
 const feature='WAIT_CONDITION';
 if(!exactText(expectedText)||!Number.isSafeInteger(timeoutMs)||timeoutMs<0||timeoutMs>30000)
  return fail(feature,'ANDROID','WAIT_INPUT_INVALID');
 const r=await bridge.waitExactText(expectedText,timeoutMs);
 if(r?.conditionVerified!==true)return fail(feature,'ANDROID',r?.code||'WAIT_CONDITION_UNVERIFIED');
 return ok(feature,'ANDROID',{expectedText,observedAtMs:r.observedAtMs});
}