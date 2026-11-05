import assert from 'node:assert/strict';import {chromium} from 'playwright';
import {runPlaywrightNativeSelect} from './native-select.mjs';
import {runPlaywrightNestedVerticalScroll} from './nested-vertical-scroll.mjs';
import {runPlaywrightHorizontalScroll} from './horizontal-scroll.mjs';
import {runPlaywrightPressKey} from './press-key.mjs';
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

 console.log('STAGE67_PLAYWRIGHT_DOM_ACTIVE_ROUND2 '+JSON.stringify(results));
}finally{await browser.close()}
