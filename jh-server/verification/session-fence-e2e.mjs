/** No real device. Two real authenticated MCP/HTTP runtimes, device-bound secure session rotation.
 * Verify session-A work is never delivered to session B and old in-progress effects are not replayed.
 */
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {createHash,createHmac,randomBytes} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {readFileSync,writeFileSync,rmSync} from 'node:fs';
import path from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {reverseNativeReadbackPatch} from '../owner-setup/deployment/native-readback.mjs';
import {assertFunctionalReleaseRuntime} from '../owner-setup/deployment/functional-release-runtime.mjs';
const PIN='8053f79cae798c557b0f5fbb8c309444cb3d03a2';
const cwd=fileURLToPath(new URL('../',import.meta.url));
const root=path.join(cwd,'owner-setup');
const originalHelper=path.join(root,'deployment/native-readback-session-original.mjs');
const originalRuntime=path.join(root,'server-integration/server-session-original.mjs');
const sha=s=>createHash('sha256').update(s).digest('hex');
const TOKEN='SYNTHETIC_SESSION_FENCE_MCP_TEST_20261010';
const CATALOG='a777e1a88a0b7633ba983ca3054d2eb28f3b9c41596e0a46b93597d478a42ca1';
const procs=[],clients=[],checks=[];
const ok=(name,p)=>{assert.ok(p,name);checks.push(name)};
const nonce=()=>randomBytes(24).toString('base64url');
const hmac=(key,message)=>createHmac('sha256',Buffer.from(key,'base64url')).update(message).digest('hex');
async function start(file,port){
 const base='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,[file],{cwd,env:{PATH:process.env.PATH,PORT:String(port),PUBLIC_BASE_URL:'https://jh-secure-bridge-fix4.onrender.com',LIFE_HUB_TOKEN:TOKEN},stdio:['ignore','pipe','pipe']});
 procs.push(child);let logs='';for(const st of [child.stdout,child.stderr])st.on('data',x=>logs=(logs+x.toString()).slice(-7000));
 let ready=false;for(let i=0;i<120;i++){
  if(child.exitCode!==null)throw Error('server start failed '+logs);
  try{const r=await fetch(base+'/health',{signal:AbortSignal.timeout(700)});if(r.ok){ready=true;break}}catch{}
  await sleep(50);
 }assert.ok(ready,'health check '+logs);
 ok('unauthenticated MCP rejected '+port,(await fetch(base+'/mcp')).status===401);
 const client=new Client({name:'synthetic-secure-fence',version:'1.0.0'},{capabilities:{}});
 await client.connect(new StreamableHTTPClientTransport(new URL(base+'/mcp'),{requestInit:{headers:{Authorization:'Bearer '+TOKEN}}}));clients.push(client);
 async function call(name,args={}){const r=await client.callTool({name,arguments:args});assert.notEqual(r.isError,true,JSON.stringify(r));return JSON.parse(r.content.find(v=>v.type==='text').text)}
 async function http(method,url,body=null,headers={}){
  const opts={method,headers:{...headers}};
  if(body!==null){opts.headers['content-type']='application/json';opts.body=JSON.stringify(body)}
  const r=await fetch(base+url,opts);return{status:r.status,body:r.status===204?null:(r.headers.get('content-type')?.includes('json')?await r.json():await r.text())};
 }
 async function register(d,oldSession=null){
  const deviceDigest=sha('jh56|'+d),clientNonce=nonce(),clientTime=Date.now();
  const body={deviceId:d,secureBridgeVersion:56,deviceDigest,clientNonce,clientTime,toolCatalogDigest:CATALOG,bridgeVersion:'synthetic-56'};
  if(oldSession){body.previousSessionId=oldSession.secureSessionId;body.rotationMac=hmac(oldSession.secureSessionSecret,'register|'+oldSession.secureSessionId+'|'+deviceDigest+'|'+clientNonce+'|'+clientTime)}
  const r=await http('POST','/device/register',body);assert.equal(r.status,200,JSON.stringify(r));
  const issued={...r.body,deviceId:d,deviceDigest};
  const stamp=Date.now()+30000,n=nonce();
  const headers={'x-jh-session':issued.secureSessionId,'x-jh-device':deviceDigest,'x-jh-nonce':n,'x-jh-expires':String(stamp),
   'x-jh-mac':hmac(issued.secureSessionSecret,'activate|'+issued.secureSessionId+'|'+deviceDigest+'|'+n+'|'+stamp)};
  const active=await http('POST','/device/activate',{deviceId:d,sessionDigest:issued.sessionDigest},headers);
  assert.equal(active.status,200,JSON.stringify(active));
  return issued;
 }
 async function poll(session){
  const n=nonce(),t=Date.now()+30000,headers={'x-jh-session':session.secureSessionId,'x-jh-device':session.deviceDigest,
   'x-jh-nonce':n,'x-jh-expires':String(t),'x-jh-mac':hmac(session.secureSessionSecret,'poll|'+session.secureSessionId+'|'+session.deviceDigest+'|'+n+'|'+t)};
  return http('GET','/device/poll?deviceId='+session.deviceId,null,headers);
 }
 async function complete(session,job,result={ok:true,url:'synthetic:no_effect'}){
  const body={result},raw=JSON.stringify(body),rd=sha(raw),n=nonce(),t=Date.now()+30000;
  const headers={'x-jh-session':session.secureSessionId,'x-jh-device':session.deviceDigest,'x-jh-nonce':n,
   'x-jh-expires':String(t),'x-jh-result-digest':rd,
   'x-jh-mac':hmac(session.secureSessionSecret,'complete|'+session.secureSessionId+'|'+job.id+'|'+session.deviceDigest+'|'+n+'|'+t+'|'+rd)};
  return http('POST','/job/'+job.id+'/complete',body,headers);
 }
 return{call,register,poll,complete};
}
async function queuedRotation(s,tag,patched){
 const dev='queued_'+tag;const A=await s.register(dev);
 assert.equal((await s.call('life_android_select_device',{device_id:dev})).ok,true);
 const old=await s.call('life_android_open',{target:'last_work_screen'});
 ok(tag+' session A queues work',old.queued===true);
 const B=await s.register(dev,A);
 const same=await s.call('life_android_open',{target:'last_work_screen'});
 ok(tag+' new session B gets distinct queued job',same.queued===true&&same.jobId!==old.jobId);
 const rejected=await s.poll(A);
 ok(tag+' stale session A poll denied',rejected.status===401);
 const got=await s.poll(B);
 if(patched){
  ok('fixed poll skips stale A and delivers signed B only',got.status===200&&got.body.id===same.jobId&&got.body.secureSessionId===B.secureSessionId);
  const oldView=await s.call('life_job_status',{job_id:old.jobId});
  ok('fixed old session queued work expired before dispatch',oldView.status==='expired'&&oldView.error==='SECURE_SESSION_CHANGED_BEFORE_DISPATCH');
  ok('fixed new signed job still completes', (await s.complete(B,got.body)).status===200);
 }else{
  ok('original reproduces session A job leaked into B poll',got.status===200&&got.body.id===old.jobId&&got.body.secureSessionId===A.secureSessionId);
  const ghost=await s.complete(B,got.body);
  ok('old session job cannot be falsely completed by B',ghost.status===401);
 }
}
async function uncertainDispatched(s,tag,patched){
 const dev='uncertain_'+tag,A=await s.register(dev);
 assert.equal((await s.call('life_android_select_device',{device_id:dev})).ok,true);
 const old=await s.call('life_android_open',{target:'last_work_screen'});
 const dispatched=await s.poll(A);
 ok(tag+' originally dispatched under valid A',dispatched.status===200&&dispatched.body.id===old.jobId);
 const B=await s.register(dev,A);
 const repeat=await s.call('life_android_open',{target:'last_work_screen'});
 const queued=await s.poll(B);
 if(patched){
  ok('fixed holds unknown prior dispatched outcome across session change',repeat.jobId===old.jobId&&repeat.queued===false&&queued.status===204);
  const status=await s.call('life_job_status',{job_id:old.jobId});
  ok('fixed never marks unconfirmed old dispatch as success',status.status==='in_progress'&&status.deviceReportedOutcome==='NO_COMPLETION_REPORT');
 }else{
  ok('original creates duplicate new job across session change',repeat.jobId!==old.jobId&&repeat.queued===true&&queued.status===200&&queued.body.id===repeat.jobId);
 }
 const staleCompletion=await s.complete(A,dispatched.body);
 ok(tag+' old session completion refused by new active session',staleCompletion.status===401);
}
try{
 const previous=execFileSync('git',['show',PIN+':jh-server/owner-setup/deployment/native-readback.mjs'],{cwd,encoding:'utf8'});
 writeFileSync(originalHelper,previous,{mode:0o600});
 const oldPatch=await import(pathToFileURL(originalHelper).href);
 const latest=assertFunctionalReleaseRuntime(root),current=readFileSync(latest,'utf8');
 const clean=reverseNativeReadbackPatch(current),restored=oldPatch.applyNativeReadbackPatch(clean);
 const anchor='import {runNativeReadback} from "../deployment/native-readback.mjs";';
 assert.equal(restored.split(anchor).length,2);
 writeFileSync(originalRuntime,restored.replace(anchor,'import {runNativeReadback} from "../deployment/native-readback-session-original.mjs";'),{mode:0o600});
 ok('baseline reconstructed by old original release patch',!restored.includes('SECURE_SESSION_CHANGED_BEFORE_DISPATCH')&&current.includes('SECURE_SESSION_CHANGED_BEFORE_DISPATCH'));
 const original=await start(originalRuntime,19471),fixed=await start(latest,19472);
 await queuedRotation(original,'original',false);
 await queuedRotation(fixed,'fixed',true);
 await uncertainDispatched(original,'original',false);
 await uncertainDispatched(fixed,'fixed',true);
 console.log('JH_SESSION_FENCE_E2E_PASS '+JSON.stringify({passed:checks.length,failed:0,checks,syntheticSecureDevices:4,livePhoneActions:0,productionDeployments:0}));
}catch(e){console.error('JH_SESSION_FENCE_E2E_FAIL',e);process.exitCode=1}
finally{
 for(const c of clients){try{await c.close()}catch{}}
 await Promise.all(procs.map(p=>new Promise(resolve=>{
  if(p.exitCode!==null){resolve();return}
  p.once('exit',()=>{clearTimeout(t);resolve()});
  const t=setTimeout(()=>{p.kill('SIGKILL');resolve()},2500);p.kill('SIGTERM');
 })));
 rmSync(originalHelper,{force:true});rmSync(originalRuntime,{force:true});
}
