import {ok,fail} from '../shared.mjs';
export async function runPlaywrightScreenshot({fullPage=false},pw){
 const feature='SCREENSHOT',page=await pw.page();
 try{
  const bytes=await page.screenshot({fullPage,type:'png'});
  if(!bytes||bytes.length<32)return fail(feature,'PLAYWRIGHT_MOBILE','SCREENSHOT_EMPTY');
  return ok(feature,'PLAYWRIGHT_MOBILE',{bytes:bytes.length});
 }catch(e){return fail(feature,'PLAYWRIGHT_MOBILE','SCREENSHOT_FAILED',{message:String(e?.message||e).slice(0,180)})}
}