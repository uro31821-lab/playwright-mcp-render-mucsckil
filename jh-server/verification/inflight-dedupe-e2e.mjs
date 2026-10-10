/** E2E: two real Node/MCP servers, synthetic devices, actual elapsed 8-second dedupe.
 * No production, Android phone, approvals or app actions are touched.
 */
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {readFileSync,writeFileSync,rmSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {assertFunctionalReleaseRuntime} from '../owner-setup/deployment/functional-release-runtime.mjs';
const BASELINE='3b01161101c5b9168d65470cf0afa6d9e8b9db78';
const root=fileURLToPath(new URL('../owner-setup/',import.meta.url));
const cwd=fileURLToPath(new URL('../',import.meta.url));
const baselineHelper=path.join(root,'deployment/native-readback-dedupe-baseline.mjs');
const baselineRuntime=path.join(root,'server-integration/server-dedupe-baseline.mjs');
const TOKEN='SYNTHETIC_INFLIGHT_DEDUPE_SECURITY_TEST_20261010';
const processes=[],clients=[],checks=[];
function mark(name,p){assert.ok(p,name);checks.push(name)}
async function start(file,port){
 const base='http://127.0.0.1:'+port,device='synthetic-inflight-'+port;
 const proc=spawn(process.execPath,[file],{cwd,env:{PATH:process.env.PATH,PORT:String(port),PUBLIC_BASE_URL:'https://jh-secure-bridge-fix4.onrender.com',LIFE_HUB_TOKEN:TOKEN},stdio:['ignore','pipe','pipe']});
 processes.push(proc);let logs='';
 for(const st of [proc.stdout,proc.stderr])st.on('data',b=>logs=(logs+b.toString()).slice(-5500));
 let ready=false;for(let i=0;i<120;i++){
  if(proc.exitCode!==null)throw Error('runtime start failed '+logs);
  try{if((await fetch(base+'/health',{signal:AbortSignal.timeout(800)})).ok){ready=true;break}}catch{}
  await delay(50);
 }
 assert.ok(ready,'health '+logs);
 mark('unauthorized call blocked '+port,(await fetch(base+'/mcp')).status===401);
 const client=new Client({name:'inflight-dedupe-e2e',version:'1.0.0'},{capabilities:{}});
 await client.connect(new StreamableHTTPClientTransport(new URL(base+'/mcp'),{requestInit:{headers:{Authorization:'Bearer '+TOKEN}}}));
 clients.push(client);
 const reg=await fetch(base+'/device/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({deviceId:device,bridgeVersion:'synthetic-only'})});
 assert.equal(reg.status,200,'mock device must register');
 async function call(name,args={}){
  const r=await client.callTool({name,arguments:args});
  assert.notEqual(r.isError,true,JSON.stringify(r));
  return JSON.parse(r.content.find(x=>x.type==='text').text);
 }
 async function poll(){
  const r=await fetch(base+'/device/poll?deviceId='+device,{signal:AbortSignal.timeout(3000)});
  if(r.status===204)return null;
  assert.equal(r.status,200);return r.json();
 }
 async function complete(job,result={ok:true,url:'synthetic:no_effect'}){
  const r=await fetch(base+'/job/'+job.id+'/complete',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({result})});
  assert.equal(r.status,200,'synthetic job completion');
 }
 return{call,poll,complete};
}
try{
 const input=execFileSync('git',['show',BASELINE+':jh-server/owner-setup/deployment/native-readback.mjs'],{encoding:'utf8',cwd});
 const current=readFileSync(path.join(root,'deployment/native-readback.mjs'),'utf8');
 const oldGet='const CACHEGET_OLD=',newGet='const CACHEGET_NEW=';
 mark('actual deployed baseline had no extended in-flight cache guard',!input.includes(oldGet)&&!input.includes(newGet));
 mark('candidate introduces exact anchored guard',current.includes(oldGet)&&current.includes(newGet));
 const change=execFileSync('git',['diff','--numstat',BASELINE,'HEAD','--','jh-server/owner-setup/deployment/native-readback.mjs'],{encoding:'utf8',cwd}).trim();
 mark('single patched source file with tracked diff',change.endsWith('jh-server/owner-setup/deployment/native-readback.mjs'));
 writeFileSync(baselineHelper,input,{mode:0o600});
 const fixedRuntime=assertFunctionalReleaseRuntime(root);
 const source=readFileSync(fixedRuntime,'utf8');
 const importOriginal='import {runNativeReadback} from "../deployment/native-readback.mjs";';
 const importLegacy='import {runNativeReadback} from "../deployment/native-readback-dedupe-baseline.mjs";';
 assert.equal(source.split(importOriginal).length,2,'exact import target');
 writeFileSync(baselineRuntime,source.replace(importOriginal,importLegacy),{mode:0o600});
 const original=await start(baselineRuntime,19681),fixed=await start(fixedRuntime,19682);
 const firstBefore=await original.call('life_android_open',{target:'last_work_screen'});
 const firstAfter=await fixed.call('life_android_open',{target:'last_work_screen'});
 mark('both servers initially queue one open job',firstBefore.queued&&firstAfter.queued);
 await delay(9200);
 const secondBefore=await original.call('life_android_open',{target:'last_work_screen'});
 const secondAfter=await fixed.call('life_android_open',{target:'last_work_screen'});
 mark('original reproduces duplicate task after eight seconds',firstBefore.jobId!==secondBefore.jobId);
 mark('fixed deduplicates still-active job after eight seconds',firstAfter.jobId===secondAfter.jobId);
 const queuedOriginal=[];while(true){const q=await original.poll();if(!q)break;queuedOriginal.push(q)}
 const queuedFixed=[];while(true){const q=await fixed.poll();if(!q)break;queuedFixed.push(q)}
 mark('original queued two actions',queuedOriginal.length===2&&queuedOriginal.every(j=>j.type==='open_url'));
 mark('fixed queued only one action',queuedFixed.length===1&&queuedFixed[0].type==='open_url');
 await Promise.all(queuedOriginal.map(j=>original.complete(j)));
 await fixed.complete(queuedFixed[0]);
 const status=await fixed.call('life_job_status',{job_id:firstAfter.jobId});
 mark('original fixed job receives only one synthetic result',status.status==='complete'&&status.deviceReportedOutcome==='DEVICE_REPORTED_OK_UNVERIFIED');
 const third=await fixed.call('life_android_open',{target:'last_work_screen'});
 mark('new explicit request after completed old job can dispatch fresh work',third.jobId!==firstAfter.jobId&&third.queued);
 const fresh=await fixed.poll();mark('fresh request has separate auditable job',fresh?.id===third.jobId);
 await fixed.complete(fresh);
 const directA=fixed.call('life_android_snapshot');
 const firstRead=await fixed.poll();mark('first standalone read queued',firstRead?.type==='agent_snapshot');
 await delay(9100);
 const directB=fixed.call('life_android_snapshot');
 await delay(250);
 const secondRead=await fixed.poll();
 mark('same in-progress screenshot request coalesces even after eight seconds',secondRead===null);
 await fixed.complete(firstRead,{ok:true,url:JSON.stringify([{package:'laftel.net.laftel',text:'Synthetic read-only',className:'android.view.View'}])});
 const read1=await directA,read2=await directB;
 mark('both snapshot waiters observe same terminal evidence',read1.id===read2.id&&read1.status==='complete'&&read2.status==='complete');
 mark('no repeated device work is left queued',await fixed.poll()===null);
 console.log('JH_INFLIGHT_DEDUPE_E2E_PASS '+JSON.stringify({passed:checks.length,failed:0,checks,realDelaysMs:[9200,9100],deviceActionsInFixedFirstPair:1,deviceActionsInOriginalFirstPair:2,phoneOperations:0,productionDeployment:false}));
}catch(e){console.error('JH_INFLIGHT_DEDUPE_E2E_FAIL',e);process.exitCode=1}
finally{
 for(const c of clients)try{await c.close()}catch{}
 await Promise.all(processes.map(p=>new Promise(resolve=>{
  if(p.exitCode!==null){resolve();return}
  p.once('exit',()=>{clearTimeout(timer);resolve()});
  const timer=setTimeout(()=>{p.kill('SIGKILL');resolve()},2000);p.kill('SIGTERM');
 })));
 rmSync(baselineHelper,{force:true});rmSync(baselineRuntime,{force:true});
}
