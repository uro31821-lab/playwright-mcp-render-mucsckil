import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {patchJH168MobileWebCommands56} from './mobile-web-tool-patch.mjs';

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
 assert.match(composition,/patchJH168MobileWebCommands56\(patchJH167OpenCompletion56\(patchJH167RightPaneOrchestrator56\(/);
});

test('additional generated tool after capture remains unchanged',()=>{
 const anchor='  registerOAuthTool("life_android_snapshot",{';
 const added='  registerOAuthTool("life_android_extra",{inputSchema:{}},async(args)=>{\n    return null;\n  });\n\n';
 const changed=prepared.replace(anchor,added+anchor);
 const updated=patchJH168MobileWebCommands56(changed);
 assert(updated.includes(added));
 assert.equal((updated.match(/jhMobileWebCapture56=async/g)||[]).length,1);
});
