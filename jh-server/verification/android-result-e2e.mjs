/** Run actual baseline versus repaired Node/MCP servers with a synthetic phone.
 *  No remote phone, no production deployment. Completion is not task success.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {assertUnifiedRuntime} from '../owner-setup/deployment/unified-runtime-build.mjs';
import {assertFunctionalReleaseRuntime} from '../owner-setup/deployment/functional-release-runtime.mjs';
const token='JH_SYNTHETIC_COMPLETION_TEST_20261010_ABC_0123456789';
const root=fileURLToPath(new URL('../owner-setup/',import.meta.url));
const processes=[],clients=[],pass=[];
const mark=(name,condition)=>{assert.ok(condition,name);pass.push(name);};
async function start(file,port){
 const base='http://127.0.0.1:'+port;
 const proc=spawn(process.execPath,[file],{cwd:fileURLToPath(new URL('../',import.meta.url)),
  env:{PATH:process.env.PATH,PORT:String(port),PUBLIC_BASE_URL:'https://jh-secure-bridge-fix4.onrender.com',LIFE_HUB_TOKEN:token},
  stdio:['ignore','pipe','pipe']});
 processes.push(proc);
 let log='';proc.stdout.on('data',x=>log=(log+x).slice(-6000));proc.stderr.on('data',x=>log=(log+x).slice(-6000));
 let ready=false;
 for(let i=0;i<100;i++){
  if(proc.exitCode!==null)throw Error('start failed: '+log);
  try{const r=await fetch(base+'/health',{signal:AbortSignal.timeout(800)});if(r.ok){ready=true;break;}}catch{}
  await delay(50);
 }
 assert.ok(ready,'server did not start: '+log);
 const c=new Client({name:'jh-failure-test',version:'1'},{capabilities:{}});
 await c.connect(new StreamableHTTPClientTransport(new URL(base+'/mcp'),{requestInit:{headers:{Authorization:'Bearer '+token}}}));clients.push(c);
 const device='synthetic-device-'+port;
 const register=await fetch(base+'/device/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({deviceId:device,bridgeVersion:'synthetic-only'})});
 assert.equal(register.status,200);
 async function call(name,args={}){
  const response=await c.callTool({name,arguments:args});
  assert.notEqual(response.isError,true,'MCP failed '+name+': '+JSON.stringify(response));
  return JSON.parse(response.content.find(x=>x.type==='text').text);
 }
 async function poll(){
  for(let i=0;i<100;i++){
   const r=await fetch(base+'/device/poll?deviceId='+device);
   if(r.status===200)return await r.json();
   assert.equal(r.status,204);
   await delay(30);
  }
  throw Error('synthetic device did not receive job');
 }
 async function hasQueued(){
  const r=await fetch(base+'/device/poll?deviceId='+device);
  if(r.status===200)return await r.json();
  assert.equal(r.status,204);return null;
 }
 async function complete(j,result){
  const r=await fetch(base+'/job/'+j.id+'/complete',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({result})});
  assert.equal(r.status,200,'completion HTTP failed');
 }
 return{call,poll,complete,hasQueued};
}
async function scenario(server,repaired){
 const pending=server.call('life_android_open_and_snapshot',{target:'ChatGPT'});
 const launch=await server.poll();
 mark((repaired?'fixed':'original')+' dispatches one open command',launch.type==='open_url');
 await server.complete(launch,{ok:false,url:'error:unknown_target:ChatGPT'});
 if(!repaired){
  const extra=await server.poll();
  mark('original reproduces extra screenshot after failed open',extra.type==='agent_snapshot');
  await server.complete(extra,{ok:true,url:'['+'{"package":"com.test.legacy","text":"synthetic screen remains unchanged"},'.repeat(3)+']'});
 }
 const output=await pending;
 mark((repaired?'fixed':'original')+' preserves failed Android response',output.opened.result.ok===false);
 if(repaired){
  mark('fixed explicitly reports unsuccessful action',output.actionSucceeded===false&&output.code==='ANDROID_OPEN_FAILED');
  mark('fixed omits unrelated post-failure snapshot',output.snapshot===null);
  mark('fixed dispatches no additional job',await server.hasQueued()===null);
  const view=await server.call('life_job_status',{job_id:launch.id});
  mark('fixed distinguishes device failure from completed delivery',view.status==='complete'&&view.deviceReportedOutcome==='DEVICE_REPORTED_FAILURE');
  const compat=await server.call('job_status',{job_id:launch.id});
  mark('fixed compatibility status includes same failure',compat.deviceReportedOutcome==='DEVICE_REPORTED_FAILURE');
 }else{
  const view=await server.call('life_job_status',{job_id:launch.id});
  mark('original reproduces ambiguous completion',view.status==='complete'&&view.deviceReportedOutcome===undefined);
 }
}
try{
 const original=await start(assertUnifiedRuntime(root),19771);
 const fixed=await start(assertFunctionalReleaseRuntime(root),19772);
 await scenario(original,false);await scenario(fixed,true);
 const healthy=await fixed.call('life_status');
 mark('unrelated runtime status still responds',typeof healthy.version==='string');
 const missing=await fixed.call('life_job_status',{job_id:'nonexistent'});
 mark('nonexistent job does not claim success',missing.error==='not found');
 console.log('JH_ANDROID_RESULT_E2E_PASS '+JSON.stringify({passed:pass.length,failed:0,checks:pass,phoneOperations:0,productionDeployments:0}));
}catch(e){console.error('JH_ANDROID_RESULT_E2E_FAIL',e);process.exitCode=1;}
finally{
 for(const c of clients){try{await c.close()}catch{}}
 await Promise.all(processes.map(p=>new Promise(resolve=>{
  if(p.exitCode!==null){resolve();return;}
  p.once('exit',()=>{clearTimeout(timer);resolve()});
  const timer=setTimeout(()=>{p.kill('SIGKILL');resolve()},2000);
  p.kill('SIGTERM');
 })));
}
