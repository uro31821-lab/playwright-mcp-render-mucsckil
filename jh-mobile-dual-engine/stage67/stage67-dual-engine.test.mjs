import test from 'node:test';import assert from 'node:assert/strict';
import {runAndroidNativeSelect} from './android/native-select.mjs';
import {runAndroidNestedVerticalScroll} from './android/nested-vertical-scroll.mjs';
import {runAndroidHorizontalScroll} from './android/horizontal-scroll.mjs';
import {runAndroidBack} from './android/back.mjs';
import {runAndroidPressKey} from './android/press-key.mjs';
import {runAndroidWaitCondition} from './android/wait-condition.mjs';
import {runAndroidScreenshot} from './android/screenshot.mjs';
import {runAndroidReturnToChrome} from './android/return-to-chrome.mjs';
import {runDualEngine} from './router.mjs';
const bridge={
 snapshot:async()=>({}),findChoiceByLabel:async()=>({id:'choice'}),openChoice:async()=>({ok:true}),
 choiceOptions:async()=>[{label:'파랑 연습 옵션'}],pickChoice:async()=>({valueVerified:true}),
 internalScrollTargets:async()=>[{viewId:'inner-scroll',targetId:'in'}],scrollInternal:async()=>({resultVerified:true,code:'nested_vertical_scroll_verified'}),
 horizontalScrollTargets:async()=>[{viewId:'horizontal-scroll',targetId:'h'}],scrollHorizontal:async()=>({resultVerified:true,code:'nested_horizontal_scroll_verified'}),
 currentState:(()=>{let n=0;return async()=>n++?{url:'https://a.test/',packageName:'com.android.chrome',windowId:2}:{url:'https://b.test/',packageName:'other',windowId:1}})(),
 backOnce:async()=>({ok:true,dispatched:true}),pressKey:async()=>({ok:true}),hasExactText:async()=>true,
 waitExactText:async()=>({conditionVerified:true,observedAtMs:1}),
 captureWorkWindow:async()=>({ok:true,pixelsCaptured:true,screenshotDigest:'d'.repeat(64)}),
 returnPreviousWork:async()=>({ok:true})
};
test('all eight Android same-feature implementations have a verified-pass path',async()=>{
 assert.equal((await runAndroidNativeSelect({label:'연습 색상',optionLabel:'파랑 연습 옵션'},bridge)).outcome,'VERIFIED_PASS');
 assert.equal((await runAndroidNestedVerticalScroll({},bridge)).outcome,'VERIFIED_PASS');
 assert.equal((await runAndroidHorizontalScroll({},bridge)).outcome,'VERIFIED_PASS');
 assert.equal((await runAndroidBack({expectedUrlBefore:'https://b.test/'},bridge)).outcome,'VERIFIED_PASS');
 assert.equal((await runAndroidPressKey({key:'Enter',expectedText:'Enter'},bridge)).outcome,'VERIFIED_PASS');
 assert.equal((await runAndroidWaitCondition({expectedText:'READY'},bridge)).outcome,'VERIFIED_PASS');
 assert.equal((await runAndroidScreenshot({consent:{grantToken:'g',digest:'d',leaseToken:'l'}},bridge)).outcome,'VERIFIED_PASS');
 assert.equal((await runAndroidReturnToChrome({},bridge)).outcome,'VERIFIED_PASS');
});
test('dual router tries Android then Playwright, then manual',async()=>{
 const a=async()=>({ok:false,outcome:'FAILED_NO_EFFECT',code:'A'}),p=async()=>({ok:true,outcome:'VERIFIED_PASS',provider:'PLAYWRIGHT_MOBILE'});
 assert.equal((await runDualEngine({feature:'X',input:{},androidRun:a,playwrightRun:p,androidPort:{},playwrightProvider:{}})).selected,'PLAYWRIGHT_MOBILE');
 const q=async()=>({ok:false,outcome:'FAILED_NO_EFFECT',code:'P'});
 assert.equal((await runDualEngine({feature:'X',input:{},androidRun:a,playwrightRun:q,androidPort:{},playwrightProvider:{}})).selected,'MANUAL');
});