import {ok,fail,exactText} from '../shared.mjs';
export async function runAndroidPressKey({key,expectedText},bridge){
 const feature='PRESS_KEY';
 if(!exactText(key))return fail(feature,'ANDROID','KEY_INVALID');
 const r=await bridge.pressKey(key);
 if(r?.ok!==true)return fail(feature,'ANDROID',r?.code||'KEY_NOT_DISPATCHED');
 if(expectedText){
  const s=await bridge.snapshot();
  if(!(await bridge.hasExactText(s,expectedText)))return fail(feature,'ANDROID','KEY_EFFECT_UNVERIFIED');
 }
 return ok(feature,'ANDROID',{key});
}