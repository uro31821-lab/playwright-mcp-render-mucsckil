import assert from 'node:assert/strict';import {chromium} from 'playwright';
import {runPlaywrightNativeSelect} from './native-select.mjs';
import {runPlaywrightNestedVerticalScroll} from './nested-vertical-scroll.mjs';
import {runPlaywrightHorizontalScroll} from './horizontal-scroll.mjs';
import {runPlaywrightBack} from './back.mjs';
import {runPlaywrightPressKey} from './press-key.mjs';
import {runPlaywrightWaitCondition} from './wait-condition.mjs';
import {runPlaywrightScreenshot} from './screenshot.mjs';
const base=process.env.MOBILE13_FIXTURE_URL||'https://jh-secure-bridge-fix4.onrender.com/__jh_mobile13_fixture/v1/index.html';
const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:432,height:500}});
const pw={page:async()=>page};
const results={};
try{
 await page.goto(base,{waitUntil:'domcontentloaded'});
 results.NATIVE_SELECT=await runPlaywrightNativeSelect({optionLabel:'파랑 연습 옵션'},pw);
 assert.equal(results.NATIVE_SELECT.ok,true);assert.equal(await page.locator('#select-result').textContent(),'파랑 연습 옵션');

 await page.goto(base);results.NESTED_VERTICAL_SCROLL=await runPlaywrightNestedVerticalScroll({},pw);
 assert.equal(results.NESTED_VERTICAL_SCROLL.ok,true);assert.match(await page.locator('#inner-status').textContent(),/end=yes/);

 await page.goto(base);results.HORIZONTAL_SCROLL=await runPlaywrightHorizontalScroll({},pw);
 assert.equal(results.HORIZONTAL_SCROLL.ok,true);assert.match(await page.locator('#horizontal-status').textContent(),/end=yes/);

 await page.goto(base);await page.locator('#input-one').focus();
 results.PRESS_KEY=await runPlaywrightPressKey({key:'Enter',expectedText:'Enter · 페이지 이벤트'},pw);
 assert.equal(results.PRESS_KEY.ok,true);

 await page.goto(base);await page.locator('#delay-button').click();
 results.WAIT_CONDITION=await runPlaywrightWaitCondition({expectedText:'READY · 지연 조건 문구가 나타났습니다',timeoutMs:3000},pw);
 assert.equal(results.WAIT_CONDITION.ok,true);

 await page.goto(base);results.SCREENSHOT=await runPlaywrightScreenshot({},pw);
 assert.equal(results.SCREENSHOT.ok,true);

 await page.goto(base);await page.locator('#same-tab-link').click();await page.waitForLoadState('domcontentloaded');
 const before=page.url();assert.match(before,/destination\.html/);
 results.BACK=await runPlaywrightBack({expectedBefore:before},pw);
 assert.equal(results.BACK.ok,true);assert.match(page.url(),/__jh_mobile13_fixture\/v1\/index\.html/);

 console.log('STAGE67_PLAYWRIGHT_DOM_RESULTS '+JSON.stringify(results));
}finally{await browser.close()}