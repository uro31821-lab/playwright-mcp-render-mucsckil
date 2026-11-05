import test from 'node:test';
import assert from 'node:assert/strict';
import {fixedLayoutStage61,layoutFromStage61Receipt,routeStage61,verifyStage61Receipt,nextStage61Request,STAGE61_RECEIPT_SCHEMA,STAGE61_VERSION} from './stage61-right-pane-router.mjs';

const layout={arrangement:'LEFT_RIGHT',chatPackage:'com.openai.chatgpt',chatWindowId:10,chatLeft:0,chatRight:1216,chatDisplayId:0,workPackage:'com.android.chrome',workWindowId:11,workLeft:1233,workRight:2448,workDisplayId:0};
const receipt=(provider,outcome,action='CLICK')=>({schema:STAGE61_RECEIPT_SCHEMA,routerVersion:STAGE61_VERSION,provider,action,outcome,replayAllowed:false,automaticReplay:false,fixedLayout:'LEFT_GPT_RIGHT_WORK',leftGptProtected:true,rightWorkVerified:true,sameDisplay:true,chatPackage:'com.openai.chatgpt',chatWindowId:10,chatBounds:'0,0,1216,1713',chatDisplayId:0,workPackage:'com.android.chrome',workWindowId:11,workBounds:'1233,0,2448,1713',workDisplayId:0,unifiedReceiptDigest:'a'.repeat(64),successReceipt:outcome==='VERIFIED_PASS',verifiedUnsupportedNoEffect:outcome==='VERIFIED_UNSUPPORTED_NO_EFFECT'});

test('fixed layout accepts left GPT right Chrome',()=>assert.deepEqual(fixedLayoutStage61(layout),{ok:true,code:'LEFT_GPT_RIGHT_WORK_VERIFIED'}));
test('receipt reconstructs the same fixed layout',()=>assert.deepEqual(layoutFromStage61Receipt(receipt('ANDROID_WEB','READ_ONLY_VERIFIED','SNAPSHOT')),layout));
test('reversed layout is rejected',()=>assert.equal(fixedLayoutStage61({...layout,chatLeft:1233,chatRight:2448,workLeft:0,workRight:1216}).ok,false));
test('other display is rejected',()=>assert.equal(fixedLayoutStage61({...layout,workDisplayId:1}).code,'CHAT_AND_WORK_DISPLAY_CHANGED'));
test('web is first for click',()=>assert.equal(routeStage61({action:'CLICK',layout}).provider,'ANDROID_WEB'));
test('computer use is first for scroll',()=>assert.equal(routeStage61({action:'SCROLL',layout}).provider,'ANDROID_COMPUTER_USE'));
test('computer use is first for Enter/Tab keypress',()=>{
 const r=routeStage61({action:'KEYPRESS_ENTER_TAB',layout});
 assert.equal(r.provider,'ANDROID_COMPUTER_USE');assert.equal(r.code,'TRY_EXISTING_ANDROID_COMPUTER_USE');assert.equal(r.allowed,true);
});
test('computer use follows exact web unsupported',()=>assert.equal(routeStage61({action:'CLICK',layout,webOutcome:'VERIFIED_UNSUPPORTED_NO_EFFECT'}).provider,'ANDROID_COMPUTER_USE'));
test('exhausted Android providers become explicit manual fallback',()=>{const r=routeStage61({action:'SELECT_PICK',layout,webOutcome:'VERIFIED_UNSUPPORTED_NO_EFFECT',computerOutcome:'VERIFIED_UNSUPPORTED_NO_EFFECT'});assert.equal(r.provider,'MANUAL');assert.equal(r.code,'MANUAL_AFTER_AUTOMATION_GAP');assert.equal(r.allowed,false);});
test('verified failed-no-effect may advance to next Android provider',()=>assert.equal(routeStage61({action:'CLICK',layout,webOutcome:'FAILED_NO_EFFECT'}).provider,'ANDROID_COMPUTER_USE'));
for(const state of ['UNKNOWN','PENDING','PHONE_SCOPED_SITE_DISCARD','FAILED_AFTER_EFFECT'])test(`${state} stops without fallback`,()=>assert.equal(routeStage61({action:'CLICK',layout,webOutcome:state}).provider,'STOP_NO_REPLAY'));
test('verified action cannot be repeated',()=>assert.equal(routeStage61({action:'CLICK',layout,webOutcome:'VERIFIED_PASS'}).code,'ALREADY_VERIFIED_NO_REPEAT'));
test('verified receipt accepted',()=>assert.equal(verifyStage61Receipt(receipt('ANDROID_WEB','VERIFIED_PASS')).success,true));
test('false success receipt rejected',()=>assert.equal(verifyStage61Receipt({...receipt('ANDROID_WEB','FAILED_NO_EFFECT'),successReceipt:true}).ok,false));
test('next request uses prior web unsupported',()=>assert.equal(nextStage61Request({action:'CLICK',layout,receipts:[receipt('ANDROID_WEB','VERIFIED_UNSUPPORTED_NO_EFFECT')]}).provider,'ANDROID_COMPUTER_USE'));
test('one prior success stops all retry',()=>assert.equal(nextStage61Request({action:'CLICK',layout,receipts:[receipt('ANDROID_WEB','VERIFIED_PASS')]}).code,'ALREADY_VERIFIED_NO_REPEAT'));