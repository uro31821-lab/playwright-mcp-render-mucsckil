import {ok,fail} from '../shared.mjs';
export async function runPlaywrightReturnToChrome({},pw){
 const feature='RETURN_TO_CHROME_FROM_OTHER_APP';
 try{
  const device=await pw.device();
  await device.shell('monkey -p com.android.chrome -c android.intent.category.LAUNCHER 1');
  const focus=String(await device.shell("dumpsys window windows | grep -E 'mCurrentFocus|mFocusedApp'"));
  if(!focus.includes('com.android.chrome'))return fail(feature,'PLAYWRIGHT_MOBILE','CHROME_FOCUS_NOT_VERIFIED',{focus:focus.slice(0,180)});
  return ok(feature,'PLAYWRIGHT_MOBILE',{packageName:'com.android.chrome'});
 }catch(e){return fail(feature,'PLAYWRIGHT_MOBILE','RETURN_CHROME_FAILED',{message:String(e?.message||e).slice(0,180)})}
}