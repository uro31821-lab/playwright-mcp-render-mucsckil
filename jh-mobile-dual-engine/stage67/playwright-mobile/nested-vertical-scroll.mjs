import {ok,fail} from '../shared.mjs';
export async function runPlaywrightNestedVerticalScroll({selector='[data-testid="inner-scroll"]'},pw){
 const feature='NESTED_VERTICAL_SCROLL',page=await pw.page();
 try{
  const loc=page.locator(selector);
  const r=await loc.evaluate(el=>{const b=el.scrollTop;el.scrollTop=el.scrollHeight;el.dispatchEvent(new Event('scroll',{bubbles:true}));return {before:b,after:el.scrollTop,max:Math.max(0,el.scrollHeight-el.clientHeight)}});
  if(!(r.after>r.before||r.after===r.max&&r.max>0))return fail(feature,'PLAYWRIGHT_MOBILE','NESTED_SCROLL_NO_MOVE',r);
  return ok(feature,'PLAYWRIGHT_MOBILE',r);
 }catch(e){return fail(feature,'PLAYWRIGHT_MOBILE','NESTED_SCROLL_FAILED',{message:String(e?.message||e).slice(0,180)})}
}