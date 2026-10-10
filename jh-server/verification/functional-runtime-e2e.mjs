/** Runs the original and repaired server as separate real Node processes.
 * Synthetic devices only; loopback HTTP only; real elapsed time, no fake clock.
 * Does not contact a real phone, browser provider, or production endpoint.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {buildFunctionalRuntimeCandidate} from './functional-runtime-candidate.mjs';
const TOKEN='JH_SYNTHETIC_RUNTIME_TEST_TOKEN_NOT_A_SECRET_20261010';
const checks=[];const running=[];const clients=[];
const mark=(name,actual,expected)=>{assert.deepEqual(actual,expected,name);checks.push({name,passed:true});};
const startedAt=new Date().toISOString();
async function start(file,port){
 const base='http://127.0.0.1:'+port;
 const proc=spawn(process.execPath,[fileURLToPath(file)],{cwd:fileURLToPath(new URL('..',import.meta.url)),env:{PATH:process.env.PATH,PORT:String(port),PUBLIC_BASE_URL:'https://jh-secure-bridge-fix4.onrender.com',LIFE_HUB_TOKEN:TOKEN},stdio:['ignore','pipe','pipe']});
 running.push(proc);let logs='';
 for(const stream of [proc.stdout,proc.stderr])stream.on('data',b=>{logs=(logs+b.toString()).slice(-16000);});
 let ready=false;
 for(let n=0;n<150;n++){
  if(proc.exitCode!==null)throw Error('server exited '+proc.exitCode+'\n'+logs);
  try{const r=await fetch(base+'/health',{signal:AbortSignal.timeout(1000)});if(r.ok){ready=true;break;}}catch{}
  await delay(100);
 }
 assert.ok(ready,'real server health check must pass\n'+logs);
 const unauth=await fetch(base+'/mcp',{signal:AbortSignal.timeout(3000)});
 mark('unauthenticated MCP blocked on port '+port,unauth.status,401);
 const client=new Client({name:'jh-functional-runtime-test',version:'1.0.0'},{capabilities:{}});
 await client.connect(new StreamableHTTPClientTransport(new URL(base+'/mcp'),{requestInit:{headers:{Authorization:'Bearer '+TOKEN}}}));
 clients.push(client);
 async function call(name,args={}){
  const r=await client.callTool({name,arguments:args});
  assert.notEqual(r.isError,true,'MCP request failed: '+name+' '+JSON.stringify(r));
  const text=(r.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');
  return JSON.parse(text);
 }
 return {base,call,port};
}
try{
 const {originalUrl,candidateUrl,identity}=await buildFunctionalRuntimeCandidate();
 const original=await start(originalUrl,18771),candidate=await start(candidateUrl,18772);
 for(const request of ['카카오T 열어줘','카카오티 열어줘','Kakao T 열어줘','카카오 택시 열어줘']){
  mark('original reproduces web misclassification: '+request,(await original.call('life_route',{request})).owner,'web');
  mark('candidate selects Android: '+request,(await candidate.call('life_route',{request})).owner,'android');
 }
 for(const request of ['네이버 열어줘','라프텔 열어줘']){
  mark('candidate preserves web route: '+request,(await candidate.call('life_route',{request})).owner,(await original.call('life_route',{request})).owner);
 }
 const jobs=[];
 for(const s of [original,candidate]){
  const reg=await fetch(s.base+'/device/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({deviceId:'jh-synthetic-'+s.port,bridgeVersion:'synthetic-test-only'}),signal:AbortSignal.timeout(5000)});
  assert.ok(reg.ok,'synthetic device registration failed: '+await reg.text());
  const opened=await s.call('life_open_service',{service:'카카오T'});
  mark('actual execution route on port '+s.port,opened.route,'android');
  assert.ok(opened.jobId,'queue must return a pollable job ID');
  const before=await s.call('life_job_status',{job_id:opened.jobId});
  mark('unexecuted synthetic job starts queued on port '+s.port,before.status,'queued');
  assert.ok(Number.isFinite(before.expiresAtMs),'job expiry must be observable');
  jobs.push({server:s,id:opened.jobId,expiry:before.expiresAtMs,createdAtMs:before.createdAtMs});
 }
 // Wait for the server's real configured TTL, without sending device polls.
 const deadline=Math.max(...jobs.map(j=>j.expiry))+350;
 console.log('JH_RUNTIME_TEST: two real servers running; awaiting actual job deadline. No phone operations.');
 await delay(Math.max(0,deadline-Date.now()));
 const oldJob=await original.call('life_job_status',{job_id:jobs[0].id});
 const fixedJob=await candidate.call('life_job_status',{job_id:jobs[1].id});
 mark('original reproduces queued after real deadline',oldJob.status,'queued');
 mark('candidate expires job on status read',fixedJob.status,'expired');
 mark('candidate returns explicit timeout',fixedJob.error,'job_timeout');
 mark('compatibility job lookup agrees',(await candidate.call('job_status',{job_id:jobs[1].id})).status,'expired');
 mark('nonexistent job is not marked successful',(await candidate.call('life_job_status',{job_id:'jh-synthetic-does-not-exist'})).error,'not found');
 mark('expired job has no successful result',Boolean(fixedJob.result?.ok),false);
 const report={schema:1,startedAt,finishedAt:new Date().toISOString(),scope:'Two real Node/MCP servers over loopback HTTP; synthetic devices; real elapsed job TTL; not a phone or production test',identity,checks,passed:checks.length,failed:0,elapsedJobMs:Date.now()-jobs[1].createdAtMs,originalStatus:oldJob.status,candidateStatus:fixedJob.status,phoneOperations:0,productionDeployment:false};
 writeFileSync(new URL('../verification-output/functional-runtime-e2e.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
 console.log('JH_FUNCTIONAL_RUNTIME_PASS '+JSON.stringify(report));
}catch(e){console.error('JH_FUNCTIONAL_RUNTIME_FAIL',e);process.exitCode=1;}
finally{
 for(const c of clients){try{await c.close();}catch{}}
 await Promise.all(running.map(p=>new Promise(resolve=>{
  if(p.exitCode!==null){resolve();return;}
  p.once('exit',()=>{clearTimeout(timer);resolve();});
  const timer=setTimeout(()=>{p.kill('SIGKILL');resolve();},4000);p.kill('SIGTERM');
 })));
}
