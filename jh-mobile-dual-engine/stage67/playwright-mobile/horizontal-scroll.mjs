import {ok,fail} from '../shared.mjs';
export async function runPlaywrightHorizontalScroll({selector='[data-testid="horizontal-scroll"]'},pw){
 const feature='HORIZONTAL_SCROLL',page=await pw.page();
 try{
  const loc=page.locator(selector);
  const before=await loc.evaluate(el=>({left:el.scrollLeft,max:Math.max(0,el.scrollWidth-el.clientWidth)}));
  if(before.max<=0)return fail(feature,'PLAYWRIGHT_MOBILE','HORIZONTAL_SCROLL_NOT_SCROLLABLE',before);
  await loc.evaluate(el=>{el.scrollLeft=Math.max(0,el.scrollWidth-el.clientWidth);el.dispatchEvent(new Event('scroll',{bubbles:false}))});
  await page.waitForFunction(sel=>{const el=document.querySelector(sel);if(!el)return false;const max=Math.max(0,el.scrollWidth-el.clientWidth);return max>0&&el.scrollLeft>=max-1},selector,{timeout:1500});
  await page.waitForTimeout(50);
  const after=await loc.evaluate(el=>({left:el.scrollLeft,max:Math.max(0,el.scrollWidth-el.clientWidth)}));
  if(!(after.max>0&&after.left>=after.max-1&&after.left>before.left))
   return fail(feature,'PLAYWRIGHT_MOBILE','HORIZONTAL_SCROLL_READBACK_MISMATCH',{before,after});
  return ok(feature,'PLAYWRIGHT_MOBILE',{before:before.left,after:after.left,max:after.max});
 }catch(e){return fail(feature,'PLAYWRIGHT_MOBILE','HORIZONTAL_SCROLL_FAILED',{message:String(e?.message||e).slice(0,180)})}
}
