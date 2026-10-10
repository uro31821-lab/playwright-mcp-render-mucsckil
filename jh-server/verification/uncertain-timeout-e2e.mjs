/** Pin deployed parent, accelerate ONLY the test job TTL to 1500ms, then exercise
 * real loopback Node/MCP and synthetic Android poll/complete. No actual phone.
 */
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {readFileSync,writeFileSync,rmSync} from 'node:fs';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {reverseNativeReadbackPatch} from '../owner-setup/deployment/native-readback.mjs';
import {assertFunctionalReleaseRuntime} from '../owner-setup/deployment/functional-release-runtime.mjs';
const PIN='78c0bac854c45235dd728294eba630436c35bd72';
const cwd=fileURLToPath(new URL('../',import.meta.url)),root=path.join(cwd,'owner-setup');
const baselineHelper=path.join(root,'deployment/native-readback-ttl-old.mjs');
const runtimeOld=path.join(root,'server-integration/server-ttl-old.mjs');
const runtimeNew=path.join(root,'server-integration/server-ttl-new.mjs');
const TOKEN='SYNTHETIC_EXPIRED_JOB_E2E_20261010_NO_SECRET';
const procs=[],clients=[],checks=[];
const verify=(name,value)=>{assert.ok(value,name);checks.push(name)};
async function start(file,port){
 const base='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,[file],{cwd,env:{PATH:process.env.PATH,PORT:String(port),PUBLIC_BASE_URL:'https://jh-secure-bridge-fix4.onrender.com',LIFE_HUB_TOKEN:TOKEN},stdio:['ignore','pipe','pipe']});
 procs.push(child);let logs='';for(const st of [child.stdout,child.stderr])st.on('data',b=>logs=(logs+b.toString()).slice(-5400));
 let healthy=false;
 for(let i=0;i<120;i++){if(child.exitCode!==null)throw Error('server died '+logs);
  try{if((await fetch(base+'/health',{signal:AbortSignal.timeout(800)})).ok){healthy=true;break;}}catch{}
  await delay(50)}
 assert.ok(healthy,'server not listening '+logs);
 verify('auth still enforced '+port,(await fetch(base+'/mcp')).status===401);
 const c=new Client({name:'no-replay-expired-mcp',version:'1'},{capabilities:{}});
 await c.connect(new StreamableHTTPClientTransport(new URL(base+'/mcp'),{requestInit:{headers:{Authorization:'Bearer '+TOKEN}}}));clients.push(c);
 const device='synthetic-ttl-'+port;
 const reg=await fetch(base+'/device/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({deviceId:device,bridgeVersion:'synthetic'})});
 assert.equal(reg.status,200);
 const call=async(name,args={})=>{const x=await c.callTool({name,arguments:args});assert.notEqual(x.isError,true,JSON.stringify(x));return JSON.parse(x.content.find(z=>z.type==='text').text)};
 const poll=async()=>{const r=await fetch(base+'/device/poll?deviceId='+device,{signal:AbortSignal.timeout(3000)});if(r.status===204)return null;assert.equal(r.status,200);return r.json()};
 const complete=async(job)=>{const r=await fetch(base+'/job/'+job.id+'/complete',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({result:{ok:true,url:'synthetic:test-only'}})});return r.status};
 async function untilQueued(){for(let i=0;i<120;i++){const j=await poll();if(j)return j;await delay(25)}throw Error('No job in queue')}
 return{call,poll,complete,untilQueued};
}
function accelerate(source){
 const before='const JOB_TTL_MS=90*1000;',after='const JOB_TTL_MS=1500;';
 assert.equal(source.split(before).length,2,'exact immutable original timeout configuration');
 assert.ok(!source.includes(after));return source.replace(before,after);
}
try{
 const sourceBefore=execFileSync('git',['show',PIN+':jh-server/owner-setup/deployment/native-readback.mjs'],{encoding:'utf8',cwd});
 writeFileSync(baselineHelper,sourceBefore,{mode:0o600});
 const previous=await import(pathToFileURL(baselineHelper).href);
 const built=readFileSync(assertFunctionalReleaseRuntime(root),'utf8');
 const unpatched=reverseNativeReadbackPatch(built),baseline=previous.applyNativeReadbackPatch(unpatched);
 const nativePath='import {runNativeReadback} from "../deployment/native-readback.mjs";';
 assert.equal(baseline.split(nativePath).length,2);
 verify('old and new sources revert exactly to same pinned baseline',previous.reverseNativeReadbackPatch(baseline)===unpatched);
 verify('production source uses ninety-second expiry, test-only runtime uses 1500ms',built.includes('const JOB_TTL_MS=90*1000;'));
 writeFileSync(runtimeOld,accelerate(baseline.replace(nativePath,'import {runNativeReadback} from "../deployment/native-readback-ttl-old.mjs";')),{mode:0o600});
 writeFileSync(runtimeNew,accelerate(built),{mode:0o600});
 const old=await start(runtimeOld,19371),fixed=await start(runtimeNew,19372);
 const original=await old.call('life_android_open',{target:'last_work_screen'});
 const improved=await fixed.call('life_android_open',{target:'last_work_screen'});
 verify('both initial commands are queued',original.queued&&improved.queued);
 const oldDispatch=await old.untilQueued(),newDispatch=await fixed.untilQueued();
 verify('both old and new were truly delivered to device',oldDispatch.id===original.jobId&&newDispatch.id===improved.jobId);
 await delay(9300);
 const oldRepeat=await old.call('life_android_open',{target:'last_work_screen'});
 const fixedRepeat=await fixed.call('life_android_open',{target:'last_work_screen'});
 verify('baseline duplicates previously dispatched command after expiry',oldRepeat.jobId!==original.jobId&&oldRepeat.queued===true);
 verify('fixed does not queue another command on uncertain prior result',fixedRepeat.jobId===improved.jobId&&fixedRepeat.queued===false);
 const oldStatus=await old.call('life_job_status',{job_id:original.jobId});
 const fixedStatus=await fixed.call('life_job_status',{job_id:improved.jobId});
 verify('baseline misleadingly expires dispatched command',oldStatus.status==='expired'&&oldStatus.error==='job_timeout');
 verify('fixed exposes UNKNOWN_RESULT as terminal error',fixedStatus.status==='error'&&fixedStatus.error==='DISPATCH_OUTCOME_UNKNOWN_NO_AUTO_REPLAY'&&fixedStatus.deviceReportedOutcome==='NO_COMPLETION_REPORT');
 verify('late completion is not allowed to overwrite uncertain result',(await fixed.complete(newDispatch))===409);
 verify('fixed did not requeue an uncertain action',await fixed.poll()===null);
 verify('baseline newly queued duplicate can actually be delivered',(await old.untilQueued()).id===oldRepeat.jobId);
 const cleared=await fixed.call('life_android_open',{target:'chrome'});
 verify('a different fresh explicit command remains possible',cleared.queued===true&&cleared.jobId!==improved.jobId);
 const clearedJob=await fixed.untilQueued();verify('new separate command can be delivered',clearedJob.id===cleared.jobId);
 verify('fresh separate job can complete normally',(await fixed.complete(clearedJob))===200);
 const readA=fixed.call('life_android_snapshot');
 const readOne=await fixed.untilQueued();verify('read-only snapshot delivered once',readOne.type==='agent_snapshot');
 await delay(2250);
 const readB=fixed.call('life_android_snapshot');
 const readTwo=await fixed.untilQueued();
 verify('expired read-only snapshot may be refreshed',readTwo.type==='agent_snapshot'&&readTwo.id!==readOne.id);
 await fixed.complete(readTwo);await Promise.all([readA,readB]);
 verify('nothing unexpectedly queued after read-only refresh',await fixed.poll()===null);
 const queued=await fixed.call('life_android_open',{target:'last_work_screen'});
 verify('uncertain old action remains fenced during retention window',queued.jobId===improved.jobId&&queued.queued===false);
 console.log('JH_UNCERTAIN_TIMEOUT_E2E_PASS '+JSON.stringify({passed:checks.length,failed:0,checks,testOnlyJobTtlMs:1500,actualProductionJobTtlMs:90000,phoneOperations:0,productionDeployments:0}));
}catch(e){console.error('JH_UNCERTAIN_TIMEOUT_E2E_FAIL',e);process.exitCode=1;}
finally{
 for(const c of clients)try{await c.close()}catch{}
 await Promise.all(procs.map(p=>new Promise(resolve=>{if(p.exitCode!==null){resolve();return;}p.once('exit',()=>{clearTimeout(t);resolve()});const t=setTimeout(()=>{p.kill('SIGKILL');resolve()},2000);p.kill('SIGTERM')})));
 for(const f of [baselineHelper,runtimeOld,runtimeNew])rmSync(f,{force:true});
}
