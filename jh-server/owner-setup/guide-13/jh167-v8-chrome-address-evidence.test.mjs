import test from 'node:test';
import assert from 'node:assert/strict';
import {extractVerifiedChromeAddressUrl,CHROME_URL_SOURCE} from './chrome-address-evidence.mjs';
import {identifyCurrentArticleFromSignedReadback} from './current-article.mjs';
const URL='https://www.hani.co.kr/arti/society/society_general/1283889.html';
const CMD='a'.repeat(32),AT=1792767000000;
const proof={workPackage:'com.android.chrome',workWindowId:'33555',observedAtMs:AT};
const row=(overrides={})=>({package:'com.android.chrome',viewId:'com.android.chrome:id/url_bar',
 className:'android.widget.EditText',text:URL,windowId:'33555',focused:'false',...overrides});
test('V8 only unfocused native Chrome address bar within signed RIGHT window is eligible',()=>{
 const good=extractVerifiedChromeAddressUrl([row()],proof);
 assert.equal(good.url,URL);assert.equal(good.source,CHROME_URL_SOURCE);
 for(const bad of [
  [row({text:'Google 검색 또는 URL 입력'})],
  [row({text:'www.hani.co.kr'})],
  [row({text:'https://www.hani.co.kr/'})],
  [row({focused:'true'})],
  [row({focused:true})],
  [row({viewId:''})],
  [row({package:'com.webview.fake'})],
  [row({className:'android.view.View'})],
  [row({windowId:'99887'})],
  [row({text:'http://www.hani.co.kr/arti/example'})],
  [row({text:'https://127.0.0.1/private'})],
  [row({text:'https://attacker@example.com/arti/example'})],
  [row(),row()]
 ])assert.equal(extractVerifiedChromeAddressUrl(bad,proof),null,JSON.stringify(bad));
 assert.equal(extractVerifiedChromeAddressUrl([row()],{...proof,workPackage:'com.example'}),null);
 assert.equal(extractVerifiedChromeAddressUrl([row()],{...proof,workWindowId:'98765'}),null);
});
test('V8 visible webpage text with URL is NOT native address evidence',()=>{
 const forged=[{package:'com.android.chrome',windowId:'33555',className:'android.view.View',
   text:URL,controlRole:'link',viewId:''}];
 assert.equal(extractVerifiedChromeAddressUrl(forged,proof),null);
});
test('V8 article identity tags address evidence without pretending publisher full-text was read',()=>{
 const e=extractVerifiedChromeAddressUrl([row()],proof);
 const readback={verified:true,command_id:CMD,
   source_ref:'JH_SIGNED_RIGHT:'+('b'.repeat(40)),
   selected_tab_titles:['“오세훈, 울면서 나경원 이기는 조사 요청” 명태균 진술 배척한 2심, 선택된 탭'],
   observation:{app:'com.android.chrome',window_id:'33555',observed_at:e.observed_at},
   browser_address_evidence:e};
 const r=identifyCurrentArticleFromSignedReadback({readback,commandId:CMD});
 assert.equal(r.status,'ARTICLE_TITLE_IDENTIFIED');
 assert.equal(r.observed_chrome_url,URL);
 assert.equal(r.browser_url_evidence_source,CHROME_URL_SOURCE);
 assert.equal(r.original_url,null);
 assert.equal(r.full_body_readback_verified,false);
 for(const altered of [
  {...readback,browser_address_evidence:{...e,source:'WEBPAGE_TEXT'}},
  {...readback,browser_address_evidence:{...e,window_id:'777'}},
  {...readback,browser_address_evidence:{...e,observed_at:'2020-01-01T00:00:00.000Z'}},
  {...readback,browser_address_evidence:null},
  {...readback,verified:false}
 ]) {
  const t=identifyCurrentArticleFromSignedReadback({readback:altered,commandId:CMD});
  assert.equal(t.observed_chrome_url||null,null);
 }
});
