import {ok,fail} from '../shared.mjs';
export async function runPlaywrightWaitCondition({expectedText,timeoutMs=3000},pw){
 const feature='WAIT_CONDITION',page=await pw.page();
 try{
  await page.getByText(expectedText,{exact:true}).waitFor({state:'visible',timeout:timeoutMs});
  return ok(feature,'PLAYWRIGHT_MOBILE',{expectedText});
 }catch(e){return fail(feature,'PLAYWRIGHT_MOBILE','WAIT_CONDITION_UNVERIFIED',{message:String(e?.message||e).slice(0,180)})}
}