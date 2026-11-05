import {UNAVAILABLE} from './shared.mjs';
export async function runDualEngine({feature,input,androidRun,playwrightRun,androidPort,playwrightProvider}){
 const a=await androidRun(input,androidPort);
 if(a?.ok===true)return {...a,selected:'ANDROID'};
 if(!['FAILED_NO_EFFECT','PROVIDER_UNAVAILABLE'].includes(a?.outcome))return {...a,selected:'STOP_NO_REPLAY'};
 if(playwrightProvider){
  const p=await playwrightRun(input,playwrightProvider);
  if(p?.ok===true)return {...p,selected:'PLAYWRIGHT_MOBILE',androidResult:a};
  if(!['FAILED_NO_EFFECT','PROVIDER_UNAVAILABLE'].includes(p?.outcome))return {...p,selected:'STOP_NO_REPLAY',androidResult:a};
  return {ok:false,feature,selected:'MANUAL',androidResult:a,playwrightResult:p,manualRequired:true,replayAllowed:false};
 }
 return {ok:false,feature,selected:'MANUAL',androidResult:a,playwrightResult:{outcome:UNAVAILABLE,code:'PLAYWRIGHT_MOBILE_PROVIDER_NOT_CONNECTED'},manualRequired:true,replayAllowed:false};
}