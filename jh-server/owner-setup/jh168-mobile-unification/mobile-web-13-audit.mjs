/**
 * JH168 Playwright -> signed Android RIGHT: 9 web aliases + 4 entrypoints.
 * VERIFICATION FIRST. Source-only audit; no edits to actual server/Android.
 * Every route is reported even if an earlier one fails. Do not mark any as
 * phone-E2E PASS based on source generation alone.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildCleanRestartRelease56} from '../deployment/durable-clean-restart-news-review-entry.mjs';

const root=path.resolve('jh-server/owner-setup');
const clean=buildCleanRestartRelease56();
const mod=await import(pathToFileURL(clean.file).href);
const built=mod.buildDurableRoutedRuntime(root);
const source=readFileSync(built.file,'utf8');

const nine=[
  ['life_web_navigate',['jhRightWebOpen56({service:parsed.href})']],
  ['life_web_snapshot',['jhMobileWebRead56(args)']],
  ['life_web_click',['jhMobileWebFollow56(args,"CLICK"']],
  ['life_web_type',['MOBILE_SUBMIT_SEPARATE_ACTION_REQUIRED','MOBILE_CSS_SELECTOR_UNSUPPORTED','jhMobileWebFollow56(args,"SET_TEXT"']],
  ['life_web_select',['MOBILE_SELECT_VISIBLE_ITEM_REQUIRED','jhMobileWebFollow56(args,"CLICK"']],
  ['life_web_press_key',['MOBILE_KEY_NOT_VERIFIED','"BACK"']],
  ['life_web_wait',['MOBILE_WAIT_CONDITION_UNVERIFIED','conditionVerified:false']],
  ['life_web_back',['jhMobileWebFollow56(args,"BACK"']],
  ['life_web_screenshot',['MOBILE_CAPTURE_REQUIRES_PHONE_CONSENT','jhMobileWebCapture56(args)']]
];
const entries=[
  ['life_route',['const nativeHints=[];'],'  registerOAuthTool("life_open_service",{'],
  ['life_open_service',['jhRightWebOpen56=async','target:"right_web_link"'],'  registerOAuthTool("life_naver_mail",{'],
  ['life_naver_mail',['jhRightWebOpen56({service:"네이버 메일"})'],'  registerOAuthTool("life_web_navigate",{'],
  ['life_android_open',['jhNativeReturnTarget56','return jhRightWebOpen56({service:raw});'],'  const cuSchema56={']
];
const disclaimer={
  sourceOnly:true,
  realAndroidE2E:'NOT_RUN',
  productionDeployed:'NOT_CONFIRMED',
  outstandingCrossCutting:['input_focus','nested_scroll','multiple_windows','local_approval','one_shot_screen_consent','handoff_between_native_and_web','end_to_end_no_replay']
};
const rows=[];
function block(name,end=null){
 const start='  registerOAuthTool("'+name+'",{';
 const at=source.indexOf(start);
 if(at<0||source.indexOf(start,at+start.length)>=0)return null;
 const stop=end?source.indexOf(end,at+start.length):
   source.indexOf('  registerOAuthTool(',at+start.length);
 if(stop<0||stop<=at)return null;
 return source.slice(at,stop);
}
for(const [name,must]of nine){
 const x=block(name);
 const reasons=[];
 if(!x)reasons.push('MISSING_OR_DUPLICATE_ROUTE');
 else {
  for(const needle of must)if(!x.includes(needle))reasons.push('MISSING_'+needle);
  if(x.includes('browserTool('))reasons.push('CLOUD_PLAYWRIGHT_REMAINS');
 }
 rows.push({name,kind:'legacy_web_alias',sourceRoute:reasons.length?'FAIL':'PASS',
  phoneE2E:'NOT_RUN',issues:reasons});
}
for(const [name,must,end]of entries){
 const x=block(name,end);
 const reasons=[];
 if(!x)reasons.push('MISSING_OR_DUPLICATE_ENTRY');
 else {
  for(const needle of must)if(!x.includes(needle))reasons.push('MISSING_'+needle);
  if(x.includes('browserTool('))reasons.push('CLOUD_PLAYWRIGHT_REMAINS');
  if(name==='life_route'&&x.includes('Use Playwright as the primary web'))reasons.push('OLD_PLAYWRIGHT_DEFAULT');
 }
 rows.push({name,kind:'entrypoint',sourceRoute:reasons.length?'FAIL':'PASS',
  phoneE2E:'NOT_RUN',issues:reasons});
}
const routeStart=source.indexOf('  registerOAuthTool("life_web_navigate",{');
const routeEnd=source.indexOf('  registerOAuthTool("life_android_devices",{',routeStart);
if(!(routeStart>=0&&routeEnd>routeStart))throw Error('AUDIT_REGISTRY_BOUNDARY_CHANGED');
const routeArea=source.slice(routeStart,routeEnd);
const additional=[];
if((routeArea.match(/registerOAuthTool\("life_web_/g)||[]).length!==9)
 additional.push('NINE_ALIAS_COUNT_NOT_EXACT');
if(routeArea.includes('browserTool('))additional.push('LEGACY_BROWSER_FALLBACK_REMAINS');
if(!source.includes('jhSplitScreenJob56("split_screen_session_input_preflight'))
 additional.push('ORIGINAL_INPUT_PREFLIGHT_MISSING');
if(!source.includes('MOBILE_REQUEST_ID_REQUIRED')||!source.includes('requestId,command,targetItemRef:bound.itemRef,action'))
 additional.push('ORIGINAL_REQUEST_ID_NOT_BOUND');
if(!source.includes('jhRightWebOpen56=async'))
 additional.push('SIGNED_RIGHT_OPEN_MISSING');
for(const r of rows){
 console.log('JH_MOBILE_ROUTE_AUDIT '+JSON.stringify(r));
}
console.log('JH_MOBILE_CROSS_CUTTING '+JSON.stringify(disclaimer));
console.log('JH_MOBILE_GAP_INVENTORY '+JSON.stringify({
 gaps:[
  'PRESS_KEY_ONLY_BACK_ENTER_TAB_ESCAPE_NOT_VERIFIED',
  'CONDITION_WAIT_RETURNS_UNVERIFIED',
  'TYPE_SUBMIT_SEPARATE_NO_ONE_CALL_SUBMIT',
  'SELECT_OPEN_AND_PICK_REQUIRE_FRESH_PHONE_ITEM_READ',
  'SCREENSHOT_REQUIRES_PHONE_LOCAL_CONSENT',
  'NESTED_SCROLL_AND_ANDROID_FOCUS_REAL_PHONE_E2E_UNVERIFIED',
  'ANDROID_APP_APK_INSTALL_AND_13_ROUTE_E2E_NOT_RUN',
  'OLDER_CI_SOURCE_GUARD_EXPECTATION_CONFLICTS_OUTSTANDING'
 ],sourceFatal:additional,sourceFailures:rows.filter(x=>x.sourceRoute!=='PASS').map(x=>x.name)
}));
assert.equal(rows.length,13,'all 9+4 must be inventoried');
assert.equal(rows.filter(x=>x.kind==='legacy_web_alias').length,9);
assert.equal(rows.filter(x=>x.kind==='entrypoint').length,4);
assert.equal(rows.filter(x=>x.sourceRoute==='PASS').length,13,
 'exact generated runtime source route validation incomplete');
assert.deepEqual(additional,[],'native original security preflights / no cloud fallback missing');
console.log('JH_MOBILE_13_SOURCE_AUDIT_PASS_PHONE_E2E_NOT_RUN');
