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
  registerOAuthTool:(n,c,h)=>tools.set(n,h),
  browserTool:async(...args)=>{remote.push(args);throw Error('UNEXPECTED_REMOTE_PLAYWRIGHT')},
  jhNativeReturnTarget56:s=>s==='last_work_screen'?'last_work_screen':null,
  mk:(type,payload)=>{
   jobs.push({type,payload});
   return {id:'job_'+jobs.length,status:'queued',targetDeviceId:'mock-phone'};
  },
  devices:new Map([['mock-phone',true]]),
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
test('life_open_service calls the original signed Android RIGHT URL opener once',async()=>{
 const h=harness();
 const r=h.parse(await h.call('life_open_service',{service:'유튜브'}));
 assert.equal(h.remote.length,0);
 assert.ok(h.jobs.length===1,'ONE original Android open job');
 assert.equal(h.jobs[0].type,'open_url');
 assert.equal(h.jobs[0].payload.target,'right_web_link');
 assert.equal(h.jobs[0].payload.url,'https://www.youtube.com');
 assert.equal(r.queued,true);
});
test('life_naver_mail shares exactly the same RIGHT opener rather than a new remote browser',async()=>{
 const h=harness();
 const r=h.parse(await h.call('life_naver_mail',{}));
 assert.equal(h.remote.length,0);
 assert.equal(h.jobs.length,1);
 assert.equal(h.jobs[0].payload.target,'right_web_link');
 assert.equal(h.jobs[0].payload.url,'https://mail.naver.com/');
 assert.equal(r.queued,true);
});
test('life_android_open maps website to RIGHT, return-to-work remains separate native path',async()=>{
 const h=harness();
 const page=h.parse(await h.call('life_android_open',{target:'유튜브'}));
 assert.equal(h.remote.length,0);
 assert.equal(h.jobs.length,1);
 assert.equal(h.jobs[0].payload.target,'right_web_link');
 assert.equal(page.queued,true);
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
