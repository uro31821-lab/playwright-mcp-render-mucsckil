import {ok,fail} from '../shared.mjs';
export async function runAndroidNestedVerticalScroll({targetHint='inner-scroll',direction='forward'},bridge){
 const feature='NESTED_VERTICAL_SCROLL', snap=await bridge.snapshot();
 const targets=await bridge.internalScrollTargets(snap);
 const target=Array.isArray(targets)?targets.find(x=>x?.viewId===targetHint||x?.label===targetHint):null;
 if(!target)return fail(feature,'ANDROID','NESTED_TARGET_NOT_PROVEN');
 const r=await bridge.scrollInternal(target,direction);
 if(r?.resultVerified!==true)return fail(feature,'ANDROID',r?.code||'NESTED_SCROLL_UNVERIFIED',{dispatched:r?.dispatched===true});
 return ok(feature,'ANDROID',{targetId:target.targetId,code:r.code});
}