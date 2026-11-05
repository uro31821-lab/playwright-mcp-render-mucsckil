/**
 * Stage64 per-feature fallback policy.
 *
 * User-visible rule:
 *   Android first -> Playwright Mobile only for a verified Android no-effect gap
 *   -> manual user action when no safe automatic provider remains.
 *
 * This module does not dispatch anything. It only chooses the next provider and
 * can compact completed verification evidence into a "working routes only"
 * profile. UNKNOWN / PENDING / effect-after-failure are handled by Stage61
 * before this selector is called and must never fall through.
 */
export const STAGE64_FEATURE_VERSION='JH168_STAGE64_ANDROID_PLAYWRIGHT_MANUAL_V1';

const SAFE_NO_EFFECT=new Set(['VERIFIED_UNSUPPORTED_NO_EFFECT','FAILED_NO_EFFECT']);
const DEFINITIONS=Object.freeze({
 OPEN:Object.freeze({android:Object.freeze(['ANDROID_WEB']),playwrightMobile:true}),
 SNAPSHOT:Object.freeze({android:Object.freeze(['ANDROID_WEB']),playwrightMobile:true}),
 CLICK:Object.freeze({android:Object.freeze(['ANDROID_WEB','ANDROID_COMPUTER_USE']),playwrightMobile:true}),
 TYPE:Object.freeze({android:Object.freeze(['ANDROID_WEB','ANDROID_COMPUTER_USE']),playwrightMobile:true}),
 SCROLL:Object.freeze({android:Object.freeze(['ANDROID_COMPUTER_USE']),playwrightMobile:true}),
 BACK:Object.freeze({android:Object.freeze(['ANDROID_WEB','ANDROID_COMPUTER_USE']),playwrightMobile:true}),
 SELECT_OPEN:Object.freeze({android:Object.freeze(['ANDROID_WEB','ANDROID_COMPUTER_USE']),playwrightMobile:true}),
 SELECT_PICK:Object.freeze({android:Object.freeze(['ANDROID_WEB','ANDROID_COMPUTER_USE']),playwrightMobile:true}),
 KEYPRESS_ENTER_TAB:Object.freeze({android:Object.freeze(['ANDROID_COMPUTER_USE']),playwrightMobile:true}),
 NATIVE_APP_ACTION:Object.freeze({android:Object.freeze(['ANDROID_COMPUTER_USE']),playwrightMobile:false}),
 READ_ONLY_INSPECT:Object.freeze({android:Object.freeze(['ANDROID_COMPUTER_USE']),playwrightMobile:false})
});
const providerOutcome=(provider,{webOutcome,computerOutcome})=>
 provider==='ANDROID_WEB'?webOutcome:provider==='ANDROID_COMPUTER_USE'?computerOutcome:null;

export function stage64FeatureDefinition(action){
 const key=String(action||'').toUpperCase();
 const value=DEFINITIONS[key];
 return value?Object.freeze({action:key,android:value.android,playwrightMobile:value.playwrightMobile}):null;
}

export function nextStage64FeatureProvider({
 action,webOutcome='NOT_RUN',computerOutcome='NOT_RUN',playwrightMobileAvailable=false
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
 if(def.playwrightMobile&&playwrightMobileAvailable)
  return Object.freeze({provider:'PLAYWRIGHT_MOBILE',action:def.action,
   code:'TARGETED_PLAYWRIGHT_MOBILE_GAP',allowed:true,replayAllowed:false,fallbackEligible:true});
 return Object.freeze({provider:'MANUAL',action:def.action,
  code:def.playwrightMobile?'MANUAL_AFTER_AUTOMATION_GAP':'MANUAL_AFTER_ANDROID_GAP',
  allowed:false,replayAllowed:false,fallbackEligible:true,manualRequired:true});
}

/**
 * Build the post-verification capability file: for each feature retain only the
 * first automatic provider with a VERIFIED_PASS receipt. If none was verified,
 * retain MANUAL. Evidence is descriptive only and never authorizes execution.
 */
export function compactVerifiedFeatureProfileStage64(rows=[]){
 const evidence=Array.isArray(rows)?rows:[];
 const features={};
 for(const action of Object.keys(DEFINITIONS)){
  const def=DEFINITIONS[action];
  const order=[...def.android,...(def.playwrightMobile?['PLAYWRIGHT_MOBILE']:[])];
  const provider=order.find(p=>evidence.some(row=>row&&
   String(row.action||'').toUpperCase()===action&&row.provider===p&&row.outcome==='VERIFIED_PASS'))||'MANUAL';
  features[action]=Object.freeze({provider,verified:provider!=='MANUAL',
   manualRequired:provider==='MANUAL'});
 }
 return Object.freeze({version:STAGE64_FEATURE_VERSION,features:Object.freeze(features)});
}
