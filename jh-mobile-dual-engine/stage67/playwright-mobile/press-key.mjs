import {ok,fail} from '../shared.mjs';
export async function runPlaywrightPressKey({key,selector,expectedText},pw){
 const feature='PRESS_KEY',page=await pw.page();
 try{
  if(selector)await page.locator(selector).press(key);else await page.keyboard.press(key);
  if(expectedText){
   const seen=await page.getByText(expectedText,{exact:true}).count();
   if(seen<1)return fail(feature,'PLAYWRIGHT_MOBILE','KEY_EFFECT_UNVERIFIED',{key});
  }
  return ok(feature,'PLAYWRIGHT_MOBILE',{key});
 }catch(e){return fail(feature,'PLAYWRIGHT_MOBILE','KEY_FAILED',{message:String(e?.message||e).slice(0,180)})}
}