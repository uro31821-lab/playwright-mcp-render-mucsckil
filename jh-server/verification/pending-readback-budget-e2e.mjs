/** Real Node/MCP and loopback HTTP; synthetic Android; real elapsed delays. */
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {createHash} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {assertFunctionalReleaseRuntime} from '../owner-setup/deployment/functional-release-runtime.mjs';
const PIN='3b01161101c5b9168d65470cf0afa6d9e8b9db78';
const cwd=fileURLToPath(new URL('../',import.meta.url)),root=path.join(cwd,'owner-setup');
const modulePath='jh-server/owner-setup/deployment/native-readback.mjs';
const originalModule=path.join(root,'deployment/native-readback-pending-baseline.mjs');
const originalRuntime=path.join(root,'server-integration/server-pending-baseline.mjs');
const TOKEN='SYNTHETIC_PENDING_READBACK_TEST_NOT_A_SECRET_20261010';
const APP='laftel.net.laftel';
const processes=[],clients=[],checks=[];
const check=(name,value)=>{assert.ok(value,name);checks.push(name)};
const sha=b=>createHash('sha256').update(b).digest('hex');
const screen={ok:true,url:JSON.stringify([{package:APP,text:'Synthetic home',className:'android.view.View'}])};
async function start(file,port){
 const base='http://127.0.0.1:'+port,device='synthetic-pending-'+port;
 const proc=spawn(process.execPath,[file],{cwd,env:{PATH:process.env.PATH,PORT:String(port),PUBLIC_BASE_URL:'https://jh-secure-bridge-fix4.onrender.com',LIFE_HUB_TOKEN:TOKEN},stdio:['ignore','pipe','pipe']});
 processes.push(proc);let logs='';for(const s of [proc.stdout,proc.stderr])s.on('data',v=>{logs=(logs+v).slice(-5000)});
 let alive=false;for(let i=0;i<100;i++){
  if(proc.exitCode!==null)throw Error('runtime exited '+logs);
  try{if((await fetch(base+'/health',{signal:AbortSignal.timeout(500)})).ok){alive=true;break}}catch{}await delay(50);
 }assert.ok(alive,'runtime startup '+logs);
 check('unauthenticated MCP blocked '+port,(await fetch(base+'/mcp')).status===401);
 const client=new Client({name:'pending-budget-test',version:'1'},{capabilities:{}});
 await client.connect(new StreamableHTTPClientTransport(new URL(base+'/mcp'),{requestInit:{headers:{Authorization:'Bearer '+TOKEN}}}));clients.push(client);
 assert.equal((await fetch(base+'/device/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({deviceId:device,bridgeVersion:'synthetic-only'})})).status,200);
 return {
  async call(name,args){const r=await client.callTool({name,arguments:args});assert.notEqual(r.isError,true,JSON.stringify(r));return JSON.parse(r.content.find(v=>v.type==='text').text)},
  async poll(){const r=await fetch(base+'/device/poll?deviceId='+device,{signal:AbortSignal.timeout(3000)});if(r.status===204)return null;assert.equal(r.status,200);return r.json()},
  async complete(j,result){const r=await fetch(base+'/job/'+j.id+'/complete',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({result}),signal:AbortSignal.timeout(3000)});assert.equal(r.status,200)}
 };
}
async function scenario(s,{target,latency=9000,never=false,failed=false,step=false}){
 let done=false,out,error;const jobs=[],delayed=[];let firstReadAt=null,responseAt=null;
 const task=s.call(step?'life_android_step_and_snapshot':'life_android_open_and_snapshot',step?{action:'back',text:target}:{target}).then(v=>{out=v;done=true;responseAt=Date.now()},e=>{error=e;done=true});
 const end=Date.now()+20000;
 while(!done&&Date.now()<end){
  const j=await s.poll();
  if(j){jobs.push({id:j.id,type:j.type});
   if(j.type==='agent_snapshot'){
    firstReadAt??=Date.now();
    if(!never){const p=delay(latency).then(()=>s.complete(j,screen));void p.catch(()=>{});delayed.push(p)}
   }else{assert.ok(['open_url','agent_step'].includes(j.type));await s.complete(j,failed?{ok:false,url:'error:unknown_target:ChatGPT'}:{ok:true,packageName:APP})}
  }
  await delay(20);
 }
 assert.ok(done,'request exceeded bounded test limit');await task;if(error)throw error;
 await Promise.all(delayed);
 assert.equal(await s.poll(),null,'no hidden extra action or snapshot');
 return {out,jobs,readMs:firstReadAt===null?null:responseAt-firstReadAt,actions:jobs.filter(j=>j.type!=='agent_snapshot').length,reads:jobs.filter(j=>j.type==='agent_snapshot').length};
}
try{
 const old=execFileSync('git',['show',PIN+':'+modulePath],{cwd,encoding:'utf8'});
 const freshModule=readFileSync(path.join(root,'deployment/native-readback.mjs'),'utf8');
 const reversed=freshModule.replace("version:'bounded-native-v2-full-budget'","version:'bounded-native-v1'").replace('waitSnapshot(job,Math.max(1,deadline-now()))','waitSnapshot(job,Math.min(8000,Math.max(1,deadline-now())))');
 check('only wait limit and visible revision changed',reversed===old);
 writeFileSync(originalModule,old,{mode:0o600});
 const fixedRuntime=assertFunctionalReleaseRuntime(root),source=readFileSync(fixedRuntime,'utf8');
 const from='import {runNativeReadback} from "../deployment/native-readback.mjs";';
 const to='import {runNativeReadback} from "../deployment/native-readback-pending-baseline.mjs";';
 assert.equal(source.split(from).length,2);writeFileSync(originalRuntime,source.replace(from,to),{mode:0o600});
 check('original runtime differs only by original helper import',readFileSync(originalRuntime,'utf8').replace(to,from)===source);
 const original=await start(originalRuntime,19971),fixed=await start(fixedRuntime,19972);
 const [before,after]=await Promise.all([scenario(original,{target:'synthetic-slow-original'}),scenario(fixed,{target:'synthetic-slow-fixed'})]);
 check('original reproduces early exit before nine-second reply',before.out.readback.reason==='SNAPSHOT_NOT_COMPLETED'&&before.out.readback.ready===false&&before.readMs<9000);
 check('fixed accepts the same snapshot reply after nine seconds',after.out.readback.ready===true&&after.readMs>=9000&&after.readMs<12500);
 check('both original and fixed send exactly one action and one snapshot',before.actions===1&&before.reads===1&&after.actions===1&&after.reads===1);
 check('fixed confirms actual requested package evidence',after.out.readback.targetMatched===true&&after.out.readback.observedPackages.includes(APP));
 check('readback revision is identifiable',after.out.readback.version==='bounded-native-v2-full-budget');
 check('no business success or scroll restoration inferred',after.out.readback.taskSuccessVerified===false&&after.out.readback.pageOrScrollRestored===false);
 const moved=await scenario(fixed,{target:'synthetic-slow-step',step:true});
 check('step path waits on the same pending snapshot too',moved.out.readback.ready===true&&moved.actions===1&&moved.reads===1&&moved.readMs>=9000);
 const pending=await scenario(fixed,{target:'synthetic-unanswered',never:true});
 check('unanswered request stops within original total budget plus poll granularity',pending.readMs>=11800&&pending.readMs<13500&&pending.out.readback.ready===false);
 check('unanswered request creates no repeated read or action',pending.actions===1&&pending.reads===1&&pending.out.readback.actionReplayCount===0);
 const failed=await scenario(fixed,{target:'ChatGPT',failed:true});
 check('failed launch still stops with zero snapshots',failed.actions===1&&failed.reads===0&&failed.out.code==='ANDROID_OPEN_FAILED');
 console.log('JH_PENDING_BUDGET_E2E_PASS '+JSON.stringify({scope:'Real Node/MCP servers; loopback HTTP; synthetic phone; real nine-second delays; not production or real-device validation',parent:PIN,originalModuleSha256:sha(old),candidateModuleSha256:sha(freshModule),runtimeSha256:sha(source),beforeMs:before.readMs,afterMs:after.readMs,unansweredMs:pending.readMs,checks,passed:checks.length,failed:0,phoneOperations:0,productionDeployments:0}));
}catch(e){console.error('JH_PENDING_BUDGET_E2E_FAIL',e);process.exitCode=1}
finally{
 for(const c of clients){try{await c.close()}catch{}}
 await Promise.all(processes.map(p=>new Promise(resolve=>{if(p.exitCode!==null){resolve();return}p.once('exit',()=>{clearTimeout(t);resolve()});const t=setTimeout(()=>{p.kill('SIGKILL');resolve()},2000);p.kill('SIGTERM')})));
 rmSync(originalModule,{force:true});rmSync(originalRuntime,{force:true});
}
