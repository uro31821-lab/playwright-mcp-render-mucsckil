import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {describeOpenCompletion,awaitOpenCompletion,patchJH167OpenCompletion56,
 OPEN_COMPLETION_WAIT_MS,OPEN_STATUS_WAIT_MS} from './jh167-open-completion.mjs';
import {buildCleanRestartRelease56} from './durable-clean-restart-news-review-entry.mjs';

const binding={commandId:'command-a',sessionId:'session-a'};
const stamp=1792933200000;
const job=()=>({id:'job_1',type:'open_url',status:'in_progress',targetDeviceId:'device-a',
 commandId:binding.commandId,secureSessionId:binding.sessionId,
 url:'https://www.youtube.com/',createdAtMs:stamp,startedAtMs:stamp+5000});
const complete=(j=job())=>({...j,status:'complete',completedAt:new Date(stamp+29000).toISOString(),result:{
 ok:true,url:j.url,code:'RIGHT_ADDRESS_CONFIRMED',rightAddressConfirmed:true,pageContentVerified:false,
 splitScreenRequired:true,splitScreen:{kind:'split_screen_evidence',version:'1',verified:'true',layout:'LEFT_RIGHT',
 chatPackage:'com.openai.chatgpt',chatKind:'NATIVE',chatWindowId:'1',chatBounds:'0,0,500,900',
 workPackage:'com.android.chrome',workWindowId:'2',workBounds:'510,0,1000,900',observedAtMs:String(stamp+25000)}}});

test('receipt arriving after old 22-second budget is received with one wait and same job',async()=>{
 const original=job();let waits=0;
 const r=await awaitOpenCompletion(original,{currentBinding:()=>binding,waitJob:async(j,budget)=>{
  waits++;assert.equal(j,original);return budget>=29000?complete(j):j;
 }});
 assert.equal(waits,1);assert.equal(r.summary.completionReceived,true);
 assert.equal(r.summary.actionSucceeded,true);assert.equal(r.summary.pageContentVerified,false);
 assert.equal(OPEN_COMPLETION_WAIT_MS,40000);
});
test('late completion remains pending and gives read-only same-command continuation',async()=>{
 const j=job();const r=await awaitOpenCompletion(j,{currentBinding:()=>binding,waitJob:async()=>j});
 assert.equal(r.summary.executionStatus,'PENDING');assert.equal(r.summary.actionSucceeded,null);
 assert.equal(r.summary.completionReceived,false);
 assert.deepEqual(r.summary.followUp.arguments,{job_id:j.id,command_id:binding.commandId});
 assert.equal(r.summary.followUp.tool,'life_job_status');assert.equal(r.summary.automaticReplayAllowed,false);
});
test('follow-up receives delayed response without a second dispatch',async()=>{
 const j=job();let calls=0;
 const r=await awaitOpenCompletion(j,{currentBinding:()=>binding,budgetMs:OPEN_STATUS_WAIT_MS,
  waitJob:async(received,budget)=>{calls++;assert.equal(received.id,'job_1');assert.equal(budget,10000);return complete(received);}});
 assert.equal(calls,1);assert.equal(r.summary.code,'RIGHT_ADDRESS_CONFIRMED');
});
test('already completed receipt is returned without waiting',async()=>{
 const r=await awaitOpenCompletion(complete(),{currentBinding:()=>binding,waitJob:()=>{throw Error('must not wait')}});
 assert.equal(r.summary.actionSucceeded,true);
});
for(const state of ['queued','in_progress'])test(state+' is pending, never failed',()=>{
 const r=describeOpenCompletion({...job(),status:state},binding);
 assert.equal(r.executionStatus,'PENDING');assert.equal(r.actionSucceeded,null);
});
for(const state of ['error','expired'])test(state+' after dispatch is unknown, never failed or replayable',()=>{
 const r=describeOpenCompletion({...job(),status:state},binding);
 assert.equal(r.executionStatus,'EFFECT_UNKNOWN');assert.equal(r.actionSucceeded,null);
 assert.equal(r.followUp,null);assert.equal(r.automaticReplayAllowed,false);
});
test('known pre-dispatch rejection is not executed',()=>{
 const j={...job(),status:'error'};delete j.startedAtMs;
 assert.equal(describeOpenCompletion(j,binding).executionStatus,'NOT_EXECUTED');
});
for(const [name,change] of [
 ['missing address proof',j=>delete j.result.rightAddressConfirmed],
 ['device reports false despite address flag',j=>j.result.ok=false],
 ['wrong URL',j=>j.result.url='https://www.naver.com/'],
 ['unsigned job',j=>delete j.secureSessionId],
 ['wrong command',j=>j.commandId='command-b'],
 ['wrong session',j=>j.secureSessionId='session-b'],
 ['missing split proof',j=>delete j.result.splitScreen],
 ['wrong work app',j=>j.result.splitScreen.workPackage='com.kakao.talk'],
 ['observation predates dispatch',j=>j.result.splitScreen.observedAtMs=String(stamp)],
 ['stale proof at receipt time',j=>j.completedAt=new Date(stamp+100000).toISOString()],
 ['missing completion time',j=>delete j.completedAt],
 ['queue accepted without actual receipt',j=>j.status='queued']
])test(name+' cannot confirm success',()=>{
 const j=complete();change(j);const r=describeOpenCompletion(j,binding);
 assert.notEqual(r.actionSucceeded,true);assert.equal(r.rightAddressConfirmed,false);
 assert.equal(r.pageContentVerified,false);
});
test('current command changes while waiting: old completion is not applied',async()=>{
 let current=binding;
 const r=await awaitOpenCompletion(job(),{currentBinding:()=>current,waitJob:async j=>{
  current={...binding,commandId:'command-b'};return complete(j);
 }});
 assert.equal(r.summary.code,'OPEN_COMPLETION_BINDING_CHANGED');assert.equal(r.summary.actionSucceeded,null);
});
test('current session changes while waiting: no rebind or replay',async()=>{
 let current=binding;
 const r=await awaitOpenCompletion(job(),{currentBinding:()=>current,waitJob:async j=>{
  current={...binding,sessionId:'session-b'};return complete(j);
 }});
 assert.equal(r.summary.code,'OPEN_COMPLETION_BINDING_CHANGED');
});
test('different returned job is rejected',async()=>{
 const r=await awaitOpenCompletion(job(),{currentBinding:()=>binding,waitJob:async j=>({...complete(j),id:'job_2'})});
 assert.equal(r.summary.code,'OPEN_COMPLETION_CORRELATION_MISMATCH');assert.equal(r.job,null);
});
test('mutation of original job binding during wait is rejected',async()=>{
 const r=await awaitOpenCompletion(job(),{currentBinding:()=>binding,waitJob:async j=>{
  j.commandId='command-b';return complete(j);
 }});
 assert.equal(r.summary.code,'OPEN_COMPLETION_CORRELATION_MISMATCH');
});
test('unbound pending job is never waited or redispatched',async()=>{
 const r=await awaitOpenCompletion({...job(),commandId:'other'},
  {currentBinding:()=>binding,waitJob:()=>{throw Error('must not wait')}});
 assert.equal(r.summary.code,'OPEN_COMPLETION_BINDING_CHANGED');
});

test('actual generated OPEN aliases and job-status share the completion path',async()=>{
 const release=buildCleanRestartRelease56(),mod=await import(pathToFileURL(release.file).href);
 const built=mod.buildDurableRoutedOperationalEntrypoint(new URL('..',import.meta.url).pathname);
 const source=readFileSync(built.runtimeFile,'utf8');
 const helperStart=source.indexOf('  async function jhOpenCompletion56(');
 const end=source.indexOf('  registerOAuthTool("life_naver_mail",{',helperStart);
 const registrations=new Map();let dispatches=0,waits=0;let mode='pending';
 const deps={
  jhAwaitOpenCompletion56:awaitOpenCompletion,jhOpenWait56:OPEN_COMPLETION_WAIT_MS,jhOpenStatusWait56:OPEN_STATUS_WAIT_MS,
  jhRequireCommand56:()=>binding.commandId,active56:()=>({sessionId:binding.sessionId}),
  textResult:x=>({content:[{type:'text',text:JSON.stringify(x)}]}),
  jobResult:j=>({content:[{type:'text',text:JSON.stringify({status:j?.status,deviceReportedOutcome:j?.status==='complete'?'DEVICE_REPORTED_OK_UNVERIFIED':'NO_COMPLETION_REPORT'})}]}),
  registerOAuthTool:(name,meta,fn)=>registrations.set(name,{meta,fn}),
  z:{string:()=>({})},jhNativeReturnTarget56:()=>null,devices:new Map(),
  mk:(_type,p)=>{dispatches++;return {...job(),status:'queued',url:p.url};},
  waitJob:async j=>{waits++;return mode==='complete'?complete(j):j;}
 };
 Function(...Object.keys(deps),source.slice(helperStart,end))(...Object.values(deps));
 const open=registrations.get('life_open_service').fn;
 let r=JSON.parse((await open({service:'유튜브'})).content[0].text);
 assert.equal(dispatches,1);assert.equal(r.code,'OPEN_COMPLETION_PENDING');
 assert.equal(r.actionSucceeded,null);assert.equal(r.status,'queued');
 const saved={...job(),status:'in_progress'};
 const statusStart=source.indexOf('  registerOAuthTool("life_job_status",{');
 const statusEnd=source.indexOf('\n  });',statusStart)+7;
 const statusDeps={...deps,jobs:new Map([['job_1',saved]]),cleanupJobs:()=>{},
  jhOpenCompletion56:Function(...Object.keys(deps),source.slice(helperStart,source.indexOf('  let jhRightWebOpen56',helperStart))+'\nreturn jhOpenCompletion56;')(...Object.values(deps))};
 Function(...Object.keys(statusDeps),source.slice(statusStart,statusEnd))(...Object.values(statusDeps));
 mode='complete';r=JSON.parse((await registrations.get('life_job_status').fn({job_id:'job_1'})).content[0].text);
 assert.equal(dispatches,1);assert.equal(waits,2);assert.equal(r.rightAddressConfirmed,true);
 assert.equal(r.completionReceived,true);assert.equal(r.deviceReportedOutcome,'DEVICE_REPORTED_OK_UNVERIFIED');
 // Direct URL route uses the same callback and result semantics.
 r=JSON.parse((await open({service:'https://www.youtube.com/'})).content[0].text);
 assert.equal(r.actionSucceeded,true);assert.equal(dispatches,2);
 assert.throws(()=>patchJH167OpenCompletion56(source),/ALREADY_PATCHED/);
 const pre=source.replace(/^import .*jh167-open-completion\.mjs";\n/,'');
 assert.throws(()=>patchJH167OpenCompletion56(pre),/ANCHOR_CHANGED/);
});
