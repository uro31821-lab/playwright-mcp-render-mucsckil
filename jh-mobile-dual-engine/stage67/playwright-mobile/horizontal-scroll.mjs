import {ok,fail} from '../shared.mjs';
export async function runPlaywrightHorizontalScroll({selector='[data-testid="horizontal-scroll"]'},pw){
 const feature='HORIZONTAL_SCROLL',page=await pw.page();
 try{
  const loc=page.locator(selector);
  const r=await loc.evaluate(el=>{const b=el.scrollLeft;el.scrollLeft=el.scrollWidth;el.dispatchEvent(new Event('scroll',{bubbles:true}));return {before:b,after:el.scrollLeft,max:Math.max(0,el.scrollWidth-el.clientWidth)}});
  if(!(r.after>r.before||r.after===r.max&&r.max>0))return fail(feature,'PLAYWRIGHT_MOBILE','HORIZONTAL_SCROLL_NO_MOVE',r);
  return ok(feature,'PLAYWRIGHT_MOBILE',r);
 }catch(e){return fail(feature,'PLAYWRIGHT_MOBILE','HORIZONTAL_SCROLL_FAILED',{message:String(e?.message||e).slice(0,180)})}
}