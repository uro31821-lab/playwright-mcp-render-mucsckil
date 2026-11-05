import {ok,fail} from '../shared.mjs';
export async function runPlaywrightBack({expectedBefore},pw){
 const feature='BACK',page=await pw.page();
 try{
  const before=page.url();
  if(expectedBefore&&before!==expectedBefore)return fail(feature,'PLAYWRIGHT_MOBILE','BACK_SCOPE_CHANGED',{before});
  const response=await page.goBack({waitUntil:'domcontentloaded'});
  const after=page.url();
  if(after===before)return fail(feature,'PLAYWRIGHT_MOBILE','BACK_NO_NAVIGATION_VERIFIED',{before,after,response:!!response});
  return ok(feature,'PLAYWRIGHT_MOBILE',{beforeUrl:before,afterUrl:after});
 }catch(e){return fail(feature,'PLAYWRIGHT_MOBILE','BACK_FAILED',{message:String(e?.message||e).slice(0,180)})}
}