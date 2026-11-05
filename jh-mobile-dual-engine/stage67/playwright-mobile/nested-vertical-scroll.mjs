import {ok,fail} from '../shared.mjs';
export async function runPlaywrightNestedVerticalScroll({selector='[data-testid="inner-scroll"]'},pw){
 const feature='NESTED_VERTICAL_SCROLL',page=await pw.page();
 try{
  const loc=page.locator(selector);
  const before=await loc.evaluate(el=>({top:el.scrollTop,max:Math.max(0,el.scrollHeight-el.clientHeight)}));
  if(before.max<=0)return fail(feature,'PLAYWRIGHT_MOBILE','NESTED_SCROLL_NOT_SCROLLABLE',before);
  await loc.evaluate(el=>{el.scrollTop=Math.max(0,el.scrollHeight-el.clientHeight);el.dispatchEvent(new Event('scroll',{bubbles:false}))});
  await page.waitForFunction(sel=>{const el=document.querySelector(sel);if(!el)return false;const max=Math.max(0,el.scrollHeight-el.clientHeight);return max>0&&el.scrollTop>=max-1},selector,{timeout:1500});
  await page.waitForTimeout(50);
  const after=await loc.evaluate(el=>({top:el.scrollTop,max:Math.max(0,el.scrollHeight-el.clientHeight)}));
  if(!(after.max>0&&after.top>=after.max-1&&after.top>before.top))
   return fail(feature,'PLAYWRIGHT_MOBILE','NESTED_SCROLL_READBACK_MISMATCH',{before,after});
  return ok(feature,'PLAYWRIGHT_MOBILE',{before:before.top,after:after.top,max:after.max});
 }catch(e){return fail(feature,'PLAYWRIGHT_MOBILE','NESTED_SCROLL_FAILED',{message:String(e?.message||e).slice(0,180)})}
}
