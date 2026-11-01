import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {patchJH168MobileWebCommands56,patchJH168MobileWeb13VerifiedMode56,patchJH168MobileStatusOnly56,selectJH168MobileWeb13Mode56,JH168_MOBILE_13_VERIFY_MODE56} from './mobile-web-tool-patch.mjs';

const original=readFileSync(new URL('../../server.mjs',import.meta.url),'utf8');
const marker='  registerOAuthTool("life_web_navigate",{';
const guards=[
  '  let jhRightWebOpen56=null;',
  '  function jhSplitScreenJob56(){}',
  '  function jhSplitScreenContextId56(){}',
  '  function jhSplitScreenPayloadHasLocalOnly56(){}',
  '  function jhRequireCommand56(device){}',
  "  registerOAuthTool('life_android_split_screen_assistant',{});"
].join('\n')+'\n';
const prepared=original.replace(marker,guards+marker);
test('nine historical web routes use Android RIGHT and keep all other source bytes',()=>{
 const next=patchJH168MobileWebCommands56(prepared);
 const a=prepared.indexOf(marker),b=prepared.indexOf('  registerOAuthTool("life_android_devices",{',a);
 const x=a,y=next.indexOf('  registerOAuthTool("life_android_devices",{',x);
 assert.equal(next.slice(0,a),prepared.slice(0,a));
 const nextTail=next.slice(y);
 const capStart='  registerOAuthTool("life_android_capture_work_window",{';
 const capEnd='  registerOAuthTool("life_android_snapshot",{';
 const capAt=nextTail.indexOf(capStart),capStop=nextTail.indexOf(capEnd,capAt);
 assert(capAt>=0&&capStop>capAt);
 const patchedCapture=nextTail.slice(capAt,capStop);
 assert.match(patchedCapture,/jhMobileWebCapture56=async/);
 const following=patchedCapture.indexOf('  registerOAuthTool("',capStart.length);
 const first=following<0?patchedCapture:patchedCapture.slice(0,following);
 const rest=following<0?'':patchedCapture.slice(following);
 const restoredCapture=first.replace(
   '  },(jhMobileWebCapture56=async(args)=>{','  },async(args)=>{')
   .replace(/  \}\)\);(\s*)$/,'  });$1')+rest;
 assert.equal(nextTail.slice(0,capAt)+restoredCapture+nextTail.slice(capStop),prepared.slice(b));
 const section=next.slice(x,y);
 assert.equal((section.match(/registerOAuthTool\("life_web_/g)||[]).length,9);
 assert.doesNotMatch(section,/browserTool\(|browser_navigate\(/);
 for(const name of ['navigate','snapshot','click','type','select','press_key','wait','back','screenshot'])
   assert.match(section,new RegExp('registerOAuthTool\\("life_web_'+name+'"'));
 assert.match(section,/MOBILE_CONTEXT_ID_REQUIRED/);
 assert.match(section,/MOBILE_FRESH_ITEM_REF_REQUIRED/);
 assert.match(section,/MOBILE_REQUEST_ID_REQUIRED/);
 assert.match(section,/requestId,command,targetItemRef:bound.itemRef,action/);
 assert.match(section,/MOBILE_KEY_NOT_VERIFIED/);
 assert.match(section,/MOBILE_CAPTURE_REQUIRES_PHONE_CONSENT/);
 assert.match(section,/return jhMobileWebCapture56\(args\)/);
 assert.match(section,/jhSplitScreenJob56\("split_screen_session_input_preflight"/);
 assert.match(section,/automaticReplay:false/);
});
test('fail closed if legacy route or signed prerequisites drift',()=>{
 assert.throws(()=>patchJH168MobileWebCommands56(original),/PREREQUISITES/);
 assert.throws(()=>patchJH168MobileWebCommands56(prepared.replace('browserTool("browser_click"','browserTool("different_click"')),/DRIFT_CLICK/);
 assert.throws(()=>patchJH168MobileWebCommands56(prepared.replace('  let jhRightWebOpen56=null;','')),/PREREQUISITES/);
});
test('review composition wires mobile override after signed right-pane patch',()=>{
 const composition=readFileSync(new URL('../deployment/jh167-article-operational-review-composition.mjs',import.meta.url),'utf8');
 assert.match(composition,/patchJH168MobileWeb13VerifiedMode56\(patchJH167OpenCompletion56\(patchJH167RightPaneOrchestrator56\(/);
});

test('additional generated tool after capture remains unchanged',()=>{
 const anchor='  registerOAuthTool("life_android_snapshot",{';
 const added='  registerOAuthTool("life_android_extra",{inputSchema:{}},async(args)=>{\n    return null;\n  });\n\n';
 const changed=prepared.replace(anchor,added+anchor);
 const updated=patchJH168MobileWebCommands56(changed);
 assert(updated.includes(added));
 assert.equal((updated.match(/jhMobileWebCapture56=async/g)||[]).length,1);
});

test('temporary verified mode: default and empty restore ORIGINAL source byte-for-byte',()=>{
 assert.equal(selectJH168MobileWeb13Mode56({}),'ORIGINAL');
 assert.equal(selectJH168MobileWeb13Mode56({JH_MOBILE_WEB_13_MODE:''}),'ORIGINAL');
 assert.equal(patchJH168MobileWeb13VerifiedMode56(prepared,{}),prepared);
 assert.equal(patchJH168MobileWeb13VerifiedMode56(prepared,{JH_MOBILE_WEB_13_MODE:''}),prepared);
});
test('temporary mode FAILS CLOSED: invalid flag, wrong host, wrong stage25 scope, CI cannot claim production',()=>{
 const key='JH_MOBILE_WEB_13_MODE';
 for(const env of [
  {[key]:'true'},
  {[key]:JH168_MOBILE_13_VERIFY_MODE56},
  {[key]:JH168_MOBILE_13_VERIFY_MODE56,RENDER_SERVICE_ID:'wrong-host'},
  {[key]:JH168_MOBILE_13_VERIFY_MODE56,RENDER_SERVICE_ID:'srv-db0fjl2d0e5s73be114g',JH_DURABLE_RELEASE:'SERVE_READY_V1'},
  {[key]:JH168_MOBILE_13_VERIFY_MODE56,CI:'true',NODE_ENV:'test',JH_OWNER_DEFER_LISTEN:'1',RENDER_SERVICE_ID:'srv-db0fjl2d0e5s73be114g'}
 ]){
  assert.throws(()=>patchJH168MobileWeb13VerifiedMode56(prepared,env),
    /JH168_MOBILE_13_MODE_(INVALID|RELEASE_SCOPE_BLOCKED)/);
 }
});
test('temporary exact scoped mobile mode enables 9 PHONE aliases without cloud fallback',()=>{
 const env={CI:'true',NODE_ENV:'test',JH_OWNER_DEFER_LISTEN:'1',
   JH_MOBILE_WEB_13_MODE:JH168_MOBILE_13_VERIFY_MODE56};
 const result=patchJH168MobileWeb13VerifiedMode56(prepared,env);
 const a=result.indexOf('  registerOAuthTool("life_web_navigate",{');
 const b=result.indexOf('  registerOAuthTool("life_android_devices",{',a);
 assert.ok(a>=0&&b>a);
 const selected=result.slice(a,b);
 assert.equal((selected.match(/registerOAuthTool\("life_web_/g)||[]).length,9);
 assert.doesNotMatch(selected,/browserTool\(/);
 assert.match(result,/MOBILE_REQUEST_ID_REQUIRED/);
 assert.match(selected,/request_id:z\.string\(\)/);
});
test('temporary explicit original-owner gate uses no new secure grant or catalog authority',()=>{
 const env={JH_MOBILE_WEB_13_MODE:JH168_MOBILE_13_VERIFY_MODE56,
  RENDER_SERVICE_ID:'srv-db0fjl2d0e5s73be114g',
  JH_DURABLE_RELEASE:'SERVE_READY_V1',
  JH_PENDING_APPROVAL_OPERATOR_ENABLE:'EXPLICIT_OPERATOR_APPROVAL_RECEIPT_V1',
  JH_SPLIT_FOLLOWUP_OPERATOR_ENABLE:'EXPLICIT_FOLLOWUP_CLICK_RECEIPT_V1'};
 assert.equal(selectJH168MobileWeb13Mode56(env),'PHONE_RIGHT');
 const result=patchJH168MobileWeb13VerifiedMode56(prepared,env);
 assert.match(result,/MOBILE_REQUEST_ID_REQUIRED/);
 assert.match(result,/automaticReplay:false/);
});

test('status-only mobile patch is exact, reversible, preserves outside original Secure56 bytes',()=>{
 const env={CI:'true',NODE_ENV:'test',JH_OWNER_DEFER_LISTEN:'1',
   JH_MOBILE_WEB_13_MODE:JH168_MOBILE_13_VERIFY_MODE56};
 const updated=patchJH168MobileWeb13VerifiedMode56(prepared,env);
 const start='  registerOAuthTool("life_status",{';
 const end='  registerOAuthTool("life_route",{';
 const a=prepared.indexOf(start),b=prepared.indexOf(end,a);
 const x=updated.indexOf(start),y=updated.indexOf(end,x);
 assert(a>=0&&b>a&&x>=0&&y>x);
 const original=prepared.slice(a,b),status=updated.slice(x,y);
 assert.equal(updated.slice(0,x),prepared.slice(0,a));
 assert.equal(status.includes('await ensureBrowser()'),false);
 assert.equal(status.includes('browserTool('),false);
 assert.match(status,/browser="not_applicable_mobile_right"/);
 assert.match(status,/mobileRightStatus56/);
 assert.match(status,/jhV2SignedPollEvidence56/);
 assert.equal(status.includes('phoneActionVerified:true'),false);
 assert.equal(status.includes('signedPollVerified:true'),false);
 const legacy='    let browser="unknown";\n'+
   '    try{ await ensureBrowser(); browser="ready"; }catch(e){ browser="error: "+e.message; }';
 const mobile='    const browser="not_applicable_mobile_right";\n'+
   '    const signedPollVerified=typeof jhV2SignedPollEvidence56==="function"&&\n'+
   '      jhV2SignedPollEvidence56()?.verified===true;\n'+
   '    const mobileRightStatus56={signedPollVerified,uiVerified:false,\n'+
   '      phoneActionVerified:false,automaticReplay:false,cloudBrowserProbed:false};';
 assert.equal(status.replace('secureBridgeVersion:56,mobileRightStatus56',
   'secureBridgeVersion:56').replace(mobile,legacy),original);
 assert.throws(()=>patchJH168MobileStatusOnly56(updated),/STATUS_SOURCE_DRIFT/);
});
test('phone-only life_status reads signed poll evidence with NO legacy cloud browser RPC',async()=>{
 const env={CI:'true',NODE_ENV:'test',JH_OWNER_DEFER_LISTEN:'1',
   JH_MOBILE_WEB_13_MODE:JH168_MOBILE_13_VERIFY_MODE56};
 const src=patchJH168MobileWeb13VerifiedMode56(prepared,env);
 const a=src.indexOf('  registerOAuthTool("life_status",{');
 const b=src.indexOf('  registerOAuthTool("life_route",{',a);
 const part=src.slice(a,b);
 for(const verified of [false,true]){
  let call,probes=0;
  const sandbox={
   registerOAuthTool:(name,config,handler)=>{if(name==='life_status')call=handler},
   z:new Proxy(()=>z,{get:()=>z,apply:()=>z}),
   devices:new Map([['phone-1',{}]]),
   textResult:v=>({content:[{type:'text',text:JSON.stringify(v)}]}),
   jhV2SignedPollEvidence56:()=>{probes++;return {verified}},
   ensureBrowser:()=>{throw Error('UNEXPECTED_LEGACY_BROWSER_CONNECTION')}
  };
  vm.runInNewContext(part,sandbox,{timeout:1000});
  const response=JSON.parse((await call()).content[0].text);
  assert.equal(response.browser,'not_applicable_mobile_right');
  assert.equal(response.mobileRightStatus56.signedPollVerified,verified);
  assert.equal(response.mobileRightStatus56.uiVerified,false);
  assert.equal(response.mobileRightStatus56.cloudBrowserProbed,false);
  assert.equal(response.registeredAndroidDevices,1);
  assert.equal(probes,1);
 }
});
test('status patch refuses changed browser probe, missing status or duplicate marker',()=>{
 assert.throws(()=>patchJH168MobileStatusOnly56(prepared.replace(
  'await ensureBrowser()','await anUnreviewedBrowser()')),/STATUS_SOURCE_DRIFT/);
 assert.throws(()=>patchJH168MobileStatusOnly56(prepared.replace(
  '  registerOAuthTool("life_status",{','')),/STATUS_BOUNDARY_CHANGED/);
});
