import {ok,fail} from '../shared.mjs';
export async function runPlaywrightNativeSelect({selector='[data-testid="native-select"]',optionLabel},pw){
 const feature='NATIVE_SELECT',page=await pw.page();
 try{
  const loc=page.locator(selector);
  await loc.selectOption({label:optionLabel});
  const label=await loc.locator('option:checked').textContent();
  if(label?.trim()!==optionLabel.trim())return fail(feature,'PLAYWRIGHT_MOBILE','SELECT_VERIFY_MISMATCH');
  return ok(feature,'PLAYWRIGHT_MOBILE',{optionLabel});
 }catch(e){return fail(feature,'PLAYWRIGHT_MOBILE','SELECT_FAILED',{message:String(e?.message||e).slice(0,180)})}
}