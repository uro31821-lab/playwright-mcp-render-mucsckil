import {ok,fail} from '../shared.mjs';
export async function runAndroidHorizontalScroll({targetHint='horizontal-scroll',direction='right'},bridge){
 const feature='HORIZONTAL_SCROLL', snap=await bridge.snapshot();
 const targets=await bridge.horizontalScrollTargets(snap);
 const target=Array.isArray(targets)?targets.find(x=>x?.viewId===targetHint||x?.label===targetHint):null;
 if(!target)return fail(feature,'ANDROID','HORIZONTAL_TARGET_NOT_PROVEN');
 const r=await bridge.scrollHorizontal(target,direction);
 if(r?.resultVerified!==true)return fail(feature,'ANDROID',r?.code||'HORIZONTAL_SCROLL_UNVERIFIED',{dispatched:r?.dispatched===true});
 return ok(feature,'ANDROID',{targetId:target.targetId,code:r.code});
}