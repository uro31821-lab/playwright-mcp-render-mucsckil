/** JH168 verify-four-entrypoints FIRST, no production edits or phone actions.
 * Uses original generated Secure56 server registration handlers and inert
 * Android job doubles. Source-level simulation, not actual device E2E.
 */
import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
import {buildCleanRestartRelease56}
 from '../deployment/durable-clean-restart-news-review-entry.mjs';

let fullSource;
before(async()=>{
 const clean=buildCleanRestartRelease56();
 const mod=await import(pathToFileURL(clean.file).href);
 const built=mod.buildDurableRoutedRuntime(path.resolve('jh-server/owner-setup'));
 fullSource=readFileSync(built.file,'utf8');
});
const names=['life_route','life_open_service','life_naver_mail','life_android_open'];
const reg=n=>'  registerOAuthTool("'+n+'",{';
function section(start,end){
 const i=fullSource.indexOf(start);
 const j=fullSource.indexOf(end,i+start.length);
 assert.ok(i>=0&&j>i,'original generated entry boundaries '+start+' -> '+end);
 return fullSource.slice(i,j);
}
function harness(){
 const chunks=[
  section(reg('life_route'),reg('life_open_service')),
  section(reg('life_open_service'),reg('life_naver_mail')),
  section(reg('life_naver_mail'),reg('life_web_navigate')),
  section(reg('life_android_open'),'  const cuSchema56={')
 ];
 for(let i=0;i<chunks.length;i++)assert.ok(!chunks[i].includes('browserTool('),
   'unexpected cloud Playwright fallback for '+names[i]);
 const tools=new Map(),jobs=[],remote=[],notices=[];
 const z=new Proxy(()=>z,{get:()=>z,apply:()=>z});
 const context={
  z,URL,
  textResult:v=>({content:[{type:'text',text:JSON.stringify(v)}]}),
  jhOpenWait56:22000,
  jhAwaitOpenCompletion56:async(job)=>({job,summary:{
    code:'RIGHT_ADDRESS_CONFIRMED',rightAddressConfirmed:true,
    executionStatus:'EFFECT_CONFIRMED',actionSucceeded:true
  }}),
  jobResult:job=>({content:[{type:'text',text:JSON.stringify({
    ok:true,id:job?.id,jobId:job?.id
  })}]}),
  jhRequireCommand56:()=>('1'.repeat(32)),
  chooseDevice:()=>('mock-phone'),
  active56:()=>({sessionId:'synthetic-current-session'}),
  waitJob:async job=>job,
  registerOAuthTool:(n,c,h)=>tools.set(n,h),
  browserTool:async(...args)=>{remote.push(args);throw Error('UNEXPECTED_REMOTE_PLAYWRIGHT')},
  jhNativeReturnTarget56:s=>s==='last_work_screen'?'last_work_screen':null,
  mk:(type,payload)=>{
   jobs.push({type,payload});
   return {id:'job_'+jobs.length,status:'queued',targetDeviceId:'mock-phone'};
  },
  devices:new Map([['mock-phone',{secureBridgeVersion:56,secureActive:true,lastSeen:Date.now()}]]),
  notifications:notices
 };
 vm.runInNewContext(chunks.join('\n'),context,
  {timeout:3000,filename:'JH168-four-original-generated-entrypoints.mjs'});
 for(const n of names)assert.equal(typeof tools.get(n),'function','missing '+n);
 return {tools,jobs,remote,call:(n,args)=>tools.get(n)(args),
  parse:x=>JSON.parse(x.content[0].text)};
}
test('life_route directs ordinary website workflow to signed RIGHT screen, not Playwright',async()=>{
 const h=harness();
 const r=h.parse(await h.call('life_route',{request:'유튜브 열어줘'}));
 assert.equal(r.owner,'web');
 assert.match(r.rule,/RIGHT Chrome|RIGHT/);
 assert.ok(!r.rule.includes('Playwright as the primary web'));
 assert.equal(h.remote.length,0);
});
test('life_route recognizes explicit native app open language without creating a phone job',async()=>{
 const h=harness();
 for(const request of ['휴대폰 설정 앱 열기','설정 앱을 열어 주세요',
  '카카오톡 앱 실행해 줘','한국투자증권 앱','네이버 웹툰 앱 열어줘',
  'open Settings native app','launch Settings android app']){
  const r=h.parse(await h.call('life_route',{request}));
  assert.equal(r.owner,'android',request);
  assert.equal(r.request,request);
  assert.match(r.rule,/native app/);
 }
 assert.equal(h.jobs.length,0,'classification never dispatches an Android action');
 assert.equal(h.remote.length,0);
});
test('life_route keeps URLs, web intent and ambiguous brands on the original web rule',async()=>{
 const h=harness();
 for(const request of ['https://example.org/settings-app','example.org 앱 열기',
  '유튜브 열어줘','카카오톡','한국투자증권 열기','네이버 웹 앱 열기',
  '브라우저에서 설정 앱 열기','앱 열기','설정 앱 열지 마',
  '설정 앱 열고 유튜브 앱 열기','설정 앱\n열기']){
  const r=h.parse(await h.call('life_route',{request}));
  assert.equal(r.owner,'web',request);
  assert.match(r.rule,/signed phone RIGHT Chrome/);
 }
 assert.equal(h.jobs.length,0);assert.equal(h.remote.length,0);
});
test('native classifier preserves existing payment, reservation and original-return routing',async()=>{
 const h=harness();
 for(const [request,owner] of [['결제 준비','jh_payment'],
  ['식당 예약','restaurant_reservation'],['예약 진행','reservation_0_8'],
  ['맛집 검색','sikindaero_search'],['last_work_screen','android']]){
  assert.equal(h.parse(await h.call('life_route',{request})).owner,owner,request);
 }
 assert.equal(h.jobs.length,0);assert.equal(h.remote.length,0);
});
test('life_open_service calls the original signed Android RIGHT URL opener once',async()=>{
 const h=harness();
 const r=h.parse(await h.call('life_open_service',{service:'유튜브'}));
 assert.equal(h.remote.length,0);
 assert.ok(h.jobs.length===1,'ONE original Android open job');
 assert.equal(h.jobs[0].type,'open_url');
 assert.equal(h.jobs[0].payload.target,'right_web_link');
 assert.equal(h.jobs[0].payload.url,'https://www.youtube.com');
 assert.equal(r.rightAddressConfirmed,true);
});
test('life_naver_mail shares exactly the same RIGHT opener rather than a new remote browser',async()=>{
 const h=harness();
 const r=h.parse(await h.call('life_naver_mail',{}));
 assert.equal(h.remote.length,0);
 assert.equal(h.jobs.length,1);
 assert.equal(h.jobs[0].payload.target,'right_web_link');
 assert.equal(h.jobs[0].payload.url,'https://mail.naver.com/');
 assert.equal(r.rightAddressConfirmed,true);
});
test('life_android_open maps website to RIGHT, return-to-work remains separate native path',async()=>{
 const h=harness();
 const page=h.parse(await h.call('life_android_open',{target:'유튜브'}));
 assert.equal(h.remote.length,0);
 assert.equal(h.jobs.length,1);
 assert.equal(h.jobs[0].payload.target,'right_web_link');
 assert.equal(page.rightAddressConfirmed,true);
 const back=h.parse(await h.call('life_android_open',{target:'last_work_screen'}));
 assert.equal(back.route,'android_return');
 assert.equal(h.jobs.length,2);
 assert.equal(h.jobs[1].payload.target,'last_work_screen');
 assert.equal(h.remote.length,0);
});
test('all four source-generated entrypoints avoid cloud browser and preserve original Secure56 runtime',()=>{
 const h=harness();
 assert.equal(h.tools.size,4);
 assert.ok(fullSource.includes('jhRequireCommand56(device)'));
 assert.ok(fullSource.includes('jhInspectSplitEvidence155'));
 assert.ok(fullSource.includes('registerOAuthTool("life_web_click"'));
 assert.equal(h.remote.length,0);
});

test('explicit Android app is routed to original signed phone job; websites stay RIGHT Chrome',async()=>{
 const h=harness();
 const result=h.parse(await h.call('life_android_open',{target:'한국투자증권 앱'}));
 assert.equal(result.operation,'native_app_open');
 assert.equal(result.queued,true);
 assert.equal(result.screenVerified,false);
 assert.equal(result.requiresFreshWindowReadback,true);
 assert.equal(result.automaticReplay,false);
 assert.equal(h.jobs.length,1);
 assert.equal(h.jobs[0].type,'open_url');
 assert.equal(h.jobs[0].payload.target,'한국투자증권 앱');
 assert.equal(h.jobs[0].payload.url,'');
 assert.equal(h.remote.length,0);
 const page=h.parse(await h.call('life_android_open',{target:'유튜브'}));
 assert.equal(page.rightAddressConfirmed,true);
 assert.equal(h.jobs.length,2);
 assert.equal(h.jobs[1].payload.target,'right_web_link');
});
test('app route does not automatically take over ambiguous website or wrong signed device',async()=>{
 const h=harness();
 const noApp=h.parse(await h.call('life_android_open',{target:'알 수 없는 서비스'}));
 assert.equal(noApp.code,'RIGHT_WEB_URL_NOT_MAPPED');
 assert.equal(h.jobs.length,0);
 const source=fullSource;
 const start=source.indexOf('  registerOAuthTool("life_android_open",{');
 const end=source.indexOf('  const cuSchema56={',start);
 const block=source.slice(start,end);
 assert.match(block,/MOBILE_NATIVE_SIGNED_DEVICE_REQUIRED/);
 assert.match(block,/MOBILE_NATIVE_ORIGINAL_COMMAND_REQUIRED/);
 assert.doesNotMatch(block,/browserTool\(/);
});
