import {ok,fail} from '../stage67/shared.mjs';

const safeNoEffect=r=>r&&r.dispatched!==true&&r.resultVerified!==true;

export async function runNativeSelectRound3({label,optionLabel},bridge){
 const feature='NATIVE_SELECT';
 if(typeof bridge.form15SelectExact==='function'){
  const r=await bridge.form15SelectExact({label,optionLabel});
  if(r?.valueVerified===true)return ok(feature,'ANDROID',{route:'FORM15_EXACT',label,optionLabel});
  if(r?.dispatched===true)return fail(feature,'ANDROID',r.code||'FORM15_SELECT_UNVERIFIED',{dispatched:true});
 }
 if(typeof bridge.resolveChoiceByAssociatedLabel!=='function')
  return fail(feature,'ANDROID','CHOICE_LABEL_RELATION_NOT_AVAILABLE');
 const field=await bridge.resolveChoiceByAssociatedLabel(label);
 if(!field)return fail(feature,'ANDROID','CHOICE_LABEL_RELATION_NOT_PROVEN');
 const opened=await bridge.openChoice(field);
 if(opened?.ok!==true)return fail(feature,'ANDROID',opened?.code||'CHOICE_OPEN_FAILED');
 const options=await bridge.choiceOptions(field);
 const option=Array.isArray(options)?options.find(x=>x?.label===optionLabel):null;
 if(!option)return fail(feature,'ANDROID','CHOICE_OPTION_NOT_FOUND');
 const picked=await bridge.pickChoice(field,option);
 if(picked?.valueVerified!==true)return fail(feature,'ANDROID',picked?.code||'CHOICE_PICK_UNVERIFIED',{dispatched:picked?.dispatched===true});
 return ok(feature,'ANDROID',{route:'ASSOCIATED_LABEL',label,optionLabel});
}

export async function runNestedVerticalRound3({targetHint='inner-scroll',direction='forward'},bridge){
 const feature='NESTED_VERTICAL_SCROLL';
 const snap=await bridge.snapshot();
 const targets=await bridge.internalScrollTargets(snap);
 const target=Array.isArray(targets)?targets.find(x=>x?.viewId===targetHint||x?.label===targetHint):null;
 if(target){
  const r=await bridge.scrollInternal(target,direction);
  if(r?.resultVerified===true)return ok(feature,'ANDROID',{route:'NATIVE_EXACT',targetId:target.targetId});
  if(r?.dispatched===true)return fail(feature,'ANDROID',r.code||'NESTED_SCROLL_UNVERIFIED',{dispatched:true});
 }
 if(typeof bridge.computerScrollExact!=='function')
  return fail(feature,'ANDROID','NESTED_EXACT_COMPUTER_ROUTE_NOT_AVAILABLE');
 const c=await bridge.computerScrollExact({viewId:targetHint,direction});
 if(c?.targetVerified!==true||c?.resultVerified!==true)
  return fail(feature,'ANDROID',c?.code||'NESTED_COMPUTER_SCROLL_UNVERIFIED',{dispatched:c?.dispatched===true});
 return ok(feature,'ANDROID',{route:'COMPUTER_EXACT',targetId:c.targetId||targetHint});
}

export async function runHorizontalRound3({targetHint='horizontal-scroll',direction='right'},bridge){
 const feature='HORIZONTAL_SCROLL';
 const snap=await bridge.snapshot();
 const targets=await bridge.horizontalScrollTargets(snap);
 const target=Array.isArray(targets)?targets.find(x=>x?.viewId===targetHint||x?.label===targetHint):null;
 if(target){
  const r=await bridge.scrollHorizontal(target,direction);
  if(r?.resultVerified===true)return ok(feature,'ANDROID',{route:'NATIVE_EXACT',targetId:target.targetId});
  if(r?.dispatched===true)return fail(feature,'ANDROID',r.code||'HORIZONTAL_SCROLL_UNVERIFIED',{dispatched:true});
  const fallbackCodes=new Set(['horizontal_readback_before_insufficient','horizontal_readback_before_unavailable','HORIZONTAL_SCROLL_UNVERIFIED']);
  if(r?.code&&!fallbackCodes.has(r.code))return fail(feature,'ANDROID',r.code);
 }
 if(typeof bridge.computerHorizontalScrollExact!=='function')
  return fail(feature,'ANDROID','HORIZONTAL_EXACT_COMPUTER_ROUTE_NOT_AVAILABLE');
 const c=await bridge.computerHorizontalScrollExact({viewId:targetHint,direction});
 if(c?.targetVerified!==true||c?.resultVerified!==true)
  return fail(feature,'ANDROID',c?.code||'HORIZONTAL_COMPUTER_SCROLL_UNVERIFIED',{dispatched:c?.dispatched===true});
 return ok(feature,'ANDROID',{route:'COMPUTER_EXACT',targetId:c.targetId||targetHint});
}

export async function runPressKeyRound3({key='Enter',expectedText},bridge){
 const feature='PRESS_KEY';
 if(typeof bridge.computerKeypress!=='function')return fail(feature,'ANDROID','COMPUTER_KEYPRESS_NOT_AVAILABLE');
 const r=await bridge.computerKeypress({key});
 if(r?.resultVerified!==true)return fail(feature,'ANDROID',r?.code||'KEYPRESS_UNVERIFIED',{dispatched:r?.dispatched===true});
 if(expectedText){
  const snap=await bridge.snapshot();
  if(!(await bridge.hasExactText(snap,expectedText)))return fail(feature,'ANDROID','KEY_EFFECT_UNVERIFIED');
 }
 return ok(feature,'ANDROID',{route:'COMPUTER_KEYPRESS',key});
}

export async function runReturnChromeRound3({expectedPackage='com.android.chrome'},bridge){
 const feature='RETURN_TO_CHROME_FROM_OTHER_APP';
 if(typeof bridge.beginForegroundReturnWorkflow!=='function')
  return fail(feature,'ANDROID','RETURN_WORKFLOW_NOT_AVAILABLE');
 const w=await bridge.beginForegroundReturnWorkflow();
 if(w?.ok!==true||w?.initialPackage!==expectedPackage)return fail(feature,'ANDROID',w?.code||'RETURN_WORKFLOW_BEGIN_FAILED');
 const opened=await bridge.openOtherApp(w);
 if(opened?.verified!==true)return fail(feature,'ANDROID',opened?.code||'OTHER_APP_OPEN_UNVERIFIED',{dispatched:opened?.dispatched===true});
 const returned=await bridge.returnPrevious(w);
 if(returned?.verified!==true)return fail(feature,'ANDROID',returned?.code||'RETURN_PREVIOUS_UNVERIFIED',{dispatched:returned?.dispatched===true});
 const s=await bridge.currentState();
 if(s?.packageName!==expectedPackage)return fail(feature,'ANDROID','CHROME_FOCUS_NOT_VERIFIED',{packageName:s?.packageName});
 return ok(feature,'ANDROID',{route:'FOREGROUND_RETURN_WORKFLOW',packageName:s.packageName,windowId:s.windowId});
}
