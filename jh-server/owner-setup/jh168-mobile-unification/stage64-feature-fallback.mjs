/**
 * Stage64 per-feature Android fallback policy.
 *
 * User-visible rule:
 *   verified Android route -> next verified Android route -> manual.
 *
 * This module never dispatches actions. UNKNOWN / PENDING / effect-after-failure
 * are stopped by Stage61 and never fall through.
 */
export const STAGE64_FEATURE_VERSION='JH168_STAGE64_ANDROID_MANUAL_V2';

const SAFE_NO_EFFECT=new Set(['VERIFIED_UNSUPPORTED_NO_EFFECT','FAILED_NO_EFFECT']);
const DEFINITIONS=Object.freeze({
 OPEN:Object.freeze({android:Object.freeze(['ANDROID_WEB'])}),
 SNAPSHOT:Object.freeze({android:Object.freeze(['ANDROID_WEB'])}),
 CLICK:Object.freeze({android:Object.freeze(['ANDROID_WEB','ANDROID_COMPUTER_USE'])}),
 TYPE:Object.freeze({android:Object.freeze(['ANDROID_WEB','ANDROID_COMPUTER_USE'])}),
 SCROLL:Object.freeze({android:Object.freeze(['ANDROID_COMPUTER_USE'])}),
 BACK:Object.freeze({android:Object.freeze(['ANDROID_WEB','ANDROID_COMPUTER_USE'])}),
 SELECT_OPEN:Object.freeze({android:Object.freeze(['ANDROID_WEB','ANDROID_COMPUTER_USE'])}),
 SELECT_PICK:Object.freeze({android:Object.freeze(['ANDROID_WEB','ANDROID_COMPUTER_USE'])}),
 KEYPRESS_ENTER_TAB:Object.freeze({android:Object.freeze(['ANDROID_COMPUTER_USE'])}),
 NATIVE_APP_ACTION:Object.freeze({android:Object.freeze(['ANDROID_COMPUTER_USE'])}),
 READ_ONLY_INSPECT:Object.freeze({android:Object.freeze(['ANDROID_COMPUTER_USE'])})
});
const providerOutcome=(provider,{webOutcome,computerOutcome})=>
 provider==='ANDROID_WEB'?webOutcome:provider==='ANDROID_COMPUTER_USE'?computerOutcome:null;

export function stage64FeatureDefinition(action){
 const key=String(action||'').toUpperCase();
 const value=DEFINITIONS[key];
 return value?Object.freeze({action:key,android:value.android}):null;
}

export function nextStage64FeatureProvider({
 action,webOutcome='NOT_RUN',computerOutcome='NOT_RUN'
}={}){
 const def=stage64FeatureDefinition(action);
 if(!def)return Object.freeze({provider:'STOP_NO_REPLAY',action:String(action||'').toUpperCase(),
  code:'STAGE64_FEATURE_NOT_DEFINED',allowed:false,replayAllowed:false,fallbackEligible:false});
 const state={webOutcome:String(webOutcome||'NOT_RUN').toUpperCase(),
  computerOutcome:String(computerOutcome||'NOT_RUN').toUpperCase()};
 for(const provider of def.android){
  const outcome=providerOutcome(provider,state);
  if(outcome==='NOT_RUN')return Object.freeze({provider,action:def.action,
    code:provider==='ANDROID_WEB'?'TRY_EXISTING_ANDROID_WEB':'TRY_EXISTING_ANDROID_COMPUTER_USE',
    allowed:true,replayAllowed:false,fallbackEligible:false});
  if(!SAFE_NO_EFFECT.has(outcome))
   return Object.freeze({provider:'STOP_NO_REPLAY',action:def.action,
    code:'STAGE64_ANDROID_OUTCOME_NOT_FALLBACK_SAFE',allowed:false,replayAllowed:false,fallbackEligible:false});
 }
 return Object.freeze({provider:'MANUAL',action:def.action,
  code:'MANUAL_AFTER_ANDROID_GAP',allowed:false,replayAllowed:false,
  fallbackEligible:true,manualRequired:true});
}

export function compactVerifiedFeatureProfileStage64(rows=[]){
 const evidence=Array.isArray(rows)?rows:[];
 const features={};
 for(const action of Object.keys(DEFINITIONS)){
  const def=DEFINITIONS[action];
  const provider=def.android.find(p=>evidence.some(row=>row&&
   String(row.action||'').toUpperCase()===action&&row.provider===p&&row.outcome==='VERIFIED_PASS'))||'MANUAL';
  features[action]=Object.freeze({provider,verified:provider!=='MANUAL',
   manualRequired:provider==='MANUAL'});
 }
 return Object.freeze({version:STAGE64_FEATURE_VERSION,features:Object.freeze(features)});
}
