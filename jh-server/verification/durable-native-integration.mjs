/** Exact operational MCP/HTTP handlers + candidate host hooks + private SQLite.
 * Synthetic Secure56 device only. Two actual SIGKILL restarts; no live phone or production mount.
 */
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {mkdtempSync,chmodSync,rmSync,readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {setTimeout as delay} from 'node:timers/promises';
import {createHash,createHmac,randomBytes} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {DurableManualCircuitFence} from '../owner-setup/deployment/durable-manual-circuit-fence.mjs';
import {buildDurableNativeRuntime} from '../owner-setup/deployment/durable-native-runtime-candidate.mjs';
const HERE=fileURLToPath(import.meta.url),CWD=fileURLToPath(new URL('../',import.meta.url));
const ROOT=path.join(CWD,'owner-setup');
const sha=x=>createHash('sha256').update(x).digest('hex');
const KEY=Buffer.alloc(32,42),NS=sha('synthetic-durable-native-owner');
const TOKEN='SYNTHETIC_DURABLE_NATIVE_HTTP_TEST_20261010';
const CATALOG='a777e1a88a0b7633ba983ca3054d2eb28f3b9c41596e0a46b93597d478a42ca1';
const nonce=()=>randomBytes(24).toString('base64url');
const mac=(key,x)=>createHmac('sha256',Buffer.from(key,'base64url')).update(x).digest('hex');
const fakeScreen={ok:true,url:JSON.stringify([{package:'laftel.net.laftel',className:'android.view.View',text:'Synthetic screen'}])};
function environment(port){return {PATH:process.env.PATH,PORT:String(port),JH_OWNER_DEFER_LISTEN:'1',
 PUBLIC_BASE_URL:'https://jh-secure-bridge-fix4.onrender.com',LIFE_HUB_TOKEN:TOKEN}}
if(process.argv[2]==='serve'){
 try{
  const runtime=await import(pathToFileURL(process.argv[3]).href);
  const host=runtime.installDurableNativeCircuit56({file:process.argv[4],key:KEY,namespace:NS,mode:'read'});
  await new Promise((resolve,reject)=>{runtime.httpServer.once('error',reject);runtime.httpServer.listen(Number(process.argv[5]),'127.0.0.1',resolve)});
  process.on('message',m=>{if(m?.op==='closeJournal'){host.close();process.send?.({op:'journalClosed'})}});
  process.stdout.write('SYNTHETIC_DURABLE_SERVER_READY\n');
 }catch(e){console.error(e.code||e.message);process.exitCode=1}
}else{
 const checks=[],children=[],clients=[];
 const mark=(name,value)=>{assert.ok(value,name);checks.push(name)};
 const dir=mkdtempSync(path.join(tmpdir(),'jh-durable-native-'));chmodSync(dir,0o700);
 const file=path.join(dir,'actions.sqlite');
 let build;
 const counts=()=>{const r=new DurableManualCircuitFence({file,key:KEY,namespace:NS,verifyAuthenticatedCompletion:()=>false});try{return r.counts()}finally{r.close()}};
 async function start(port){
  const base='http://127.0.0.1:'+port;
  const p=spawn(process.execPath,[HERE,'serve',build.file,file,String(port)],{cwd:CWD,env:environment(port),stdio:['ignore','pipe','pipe','ipc']});
  children.push(p);let logs='';for(const s of [p.stdout,p.stderr])s.on('data',b=>logs=(logs+b).slice(-6000));
  let ready=false;
  for(let i=0;i<120;i++){
   if(p.exitCode!==null||p.signalCode!==null)throw Error('test server failed: '+logs);
   try{if((await fetch(base+'/health',{signal:AbortSignal.timeout(600)})).ok){ready=true;break}}catch{}
   await delay(50);
  }
  assert.ok(ready,'test server did not become ready: '+logs);
  mark('unauthenticated MCP still rejected on this boot',(await fetch(base+'/mcp')).status===401);
  const c=new Client({name:'durable-native-integration',version:'1'},{capabilities:{}});
  await c.connect(new StreamableHTTPClientTransport(new URL(base+'/mcp'),{requestInit:{headers:{Authorization:'Bearer '+TOKEN}}}));clients.push(c);
  const call=async(name,args={})=>{const r=await c.callTool({name,arguments:args});assert.notEqual(r.isError,true,JSON.stringify(r));return JSON.parse(r.content.find(x=>x.type==='text').text)};
  async function request(method,url,body=null,headers={}){
   const o={method,headers:{...headers},signal:AbortSignal.timeout(5000)};
   if(body!==null){o.headers['content-type']='application/json';o.body=JSON.stringify(body)}
   const r=await fetch(base+url,o);return{status:r.status,data:r.status===204?null:r.headers.get('content-type')?.includes('json')?await r.json():await r.text()};
  }
  async function enroll(deviceId){
   const deviceDigest=sha('jh56|'+deviceId);
   const r=await request('POST','/device/register',{deviceId,deviceDigest,secureBridgeVersion:56,clientNonce:nonce(),clientTime:Date.now(),toolCatalogDigest:CATALOG,bridgeVersion:'synthetic56'});
   assert.equal(r.status,200,'synthetic secure registration failed');
   const s={...r.data,deviceId,deviceDigest},n=nonce(),t=Date.now()+30000;
   const h={'x-jh-session':s.secureSessionId,'x-jh-device':deviceDigest,'x-jh-nonce':n,'x-jh-expires':String(t),
    'x-jh-mac':mac(s.secureSessionSecret,'activate|'+s.secureSessionId+'|'+deviceDigest+'|'+n+'|'+t)};
   assert.equal((await request('POST','/device/activate',{deviceId,sessionDigest:s.sessionDigest},h)).status,200);
   return s;
  }
  async function poll(s){
   const n=nonce(),t=Date.now()+30000;
   return request('GET','/device/poll?deviceId='+s.deviceId,null,{'x-jh-session':s.secureSessionId,'x-jh-device':s.deviceDigest,'x-jh-nonce':n,'x-jh-expires':String(t),
    'x-jh-mac':mac(s.secureSessionSecret,'poll|'+s.secureSessionId+'|'+s.deviceDigest+'|'+n+'|'+t)});
  }
  async function take(s){for(let i=0;i<100;i++){const r=await poll(s);if(r.status!==204){assert.equal(r.status,200,JSON.stringify(r));return r.data}await delay(25)}throw Error('missing synthetic job')}
  async function complete(s,j,result={ok:true,url:'synthetic:completed'},badMac=false){
   const body={result},rd=sha(JSON.stringify(body)),n=nonce(),t=Date.now()+30000;
   return request('POST','/job/'+j.id+'/complete',body,{'x-jh-session':s.secureSessionId,'x-jh-device':s.deviceDigest,'x-jh-nonce':n,'x-jh-expires':String(t),'x-jh-result-digest':rd,
    'x-jh-mac':badMac?'0'.repeat(64):mac(s.secureSessionSecret,'complete|'+s.secureSessionId+'|'+j.id+'|'+s.deviceDigest+'|'+n+'|'+t+'|'+rd)});
  }
  return{p,call,enroll,poll,take,complete};
 }
 async function kill(p){
  if(p.exitCode!==null||p.signalCode!==null)return;
  const exited=new Promise(resolve=>p.once('exit',resolve));p.kill('SIGKILL');
  await Promise.race([exited,delay(3000).then(()=>{throw Error('test crash did not finish')})]);
 }
 async function closeStorage(s){
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('storage fault injection failed')),2500);
   const listener=m=>{if(m?.op==='journalClosed'){clearTimeout(timer);s.p.off('message',listener);resolve()}};
   s.p.on('message',listener);s.p.send({op:'closeJournal'});
  });
 }
 async function screen(s,session){const pending=s.call('life_android_snapshot');const j=await s.take(session);assert.equal(j.type,'agent_snapshot');assert.equal((await s.complete(session,j,fakeScreen)).status,200);return pending}
 try{
  build=buildDurableNativeRuntime(ROOT);
  mark('operational baseline and exact integration hooks verified',build.exactHookEdits===4&&build.productionEnabled===false);
  const seed=new DurableManualCircuitFence({file,key:KEY,namespace:NS,mode:'EXPLICIT_ONE_TIME',verifyAuthenticatedCompletion:()=>false});seed.close();
  const a=await start(19181),A=await a.enroll('synthetic-device-A');
  const open=await a.call('life_android_open',{target:'last_work_screen'}),sent=await a.take(A);
  mark('first native open is delivered only once',sent.id===open.jobId&&sent.type==='open_url');
  mark('durable unknown record exists before device completion',counts().uncertain===1&&counts().received===0);
  mark('journal metadata is not included in device payload',!JSON.stringify(sent).includes('recordId')&&!JSON.stringify(sent).includes('operation_hmac'));
  await kill(a.p);
  const b=await start(19181);
  mark('old session is not accepted after hard restart',(await b.poll(A)).status===401);
  const B=await b.enroll(A.deviceId);
  mark('restart never auto-dispatches old work',(await b.poll(B)).status===204);
  const repeat=await b.call('life_android_open',{target:'last_work_screen'}),blocked=await b.poll(B);
  mark('identical explicit command after restart is fenced before delivery',blocked.status===409&&blocked.data.code==='DURABLE_PREVIOUS_OUTCOME_UNKNOWN');
  const denied=await b.call('life_job_status',{job_id:repeat.jobId});
  mark('fenced command is not reported as successful',denied.status==='error'&&denied.deviceReportedOutcome==='NO_COMPLETION_REPORT');
  mark('old signed completion cannot clear a new job with reused ID',(await b.complete(A,sent)).status===401);
  mark('a current-session completion for an undispatched job cannot clear fence',(await b.complete(B,{id:repeat.jobId})).status===409);
  mark('forged attempts leave durable uncertainty untouched',counts().uncertain===1&&counts().received===0);
  const separate=await b.call('life_android_open',{target:'chrome'}),fresh=await b.take(B);
  mark('different explicit native command remains usable',fresh.id===separate.jobId&&counts().uncertain===2);
  mark('bad completion MAC is refused before journal update',(await b.complete(B,fresh,undefined,true)).status===401&&counts().uncertain===2);
  const genuine={ok:true,url:'synthetic:chrome-opened'};
  mark('authenticated completion is durably recorded',(await b.complete(B,fresh,genuine)).status===200&&counts().received===1&&counts().uncertain===1);
  mark('identical authenticated result retry is idempotent',(await b.complete(B,fresh,genuine)).status===200&&counts().received===1);
  mark('conflicting authenticated result cannot overwrite receipt',(await b.complete(B,fresh,{ok:false,url:'different'})).status===409);
  const preserved=await b.call('life_job_status',{job_id:fresh.id});
  mark('original accepted result survives conflicting retry',preserved.result.ok===true&&preserved.deviceReportedOutcome==='DEVICE_REPORTED_OK_UNVERIFIED');
  const prior=counts();const observed=await screen(b,B);
  mark('read-only snapshot bypasses action journal and still completes',observed.status==='complete'&&counts().uncertain===prior.uncertain&&counts().received===prior.received);
  const stepArgs={action:'set_text',text:'synthetic-input-label',value:'PRIVATE_FIXTURE_PAYLOAD_NOT_FOR_DISK'};
  const stepResult=b.call('life_android_step',stepArgs),step=await b.take(B);
  mark('native UI step is journaled before delivery',step.type==='agent_step'&&counts().uncertain===2);
  mark('unclassified result cannot clear a dispatched UI step',(await b.complete(B,step,{note:'not an outcome'})).status===409&&counts().uncertain===2);
  assert.equal((await b.complete(B,step,{ok:true,code:'synthetic-step'})).status,200);const finishedStep=await stepResult;
  mark('valid native UI result completes without business-success claim',finishedStep.status==='complete'&&finishedStep.deviceReportedOutcome==='DEVICE_REPORTED_OK_UNVERIFIED');
  const C=await b.enroll('synthetic-device-C');await b.call('life_android_select_device',{device_id:C.deviceId});
  await b.call('life_android_open',{target:'last_work_screen'});const other=await b.take(C);
  mark('same command for a different device is not incorrectly fenced',other.targetDeviceId===C.deviceId);
  assert.equal((await b.complete(C,other)).status,200);
  const bytes=[file,file+'-wal'].filter(existsSync).map(f=>readFileSync(f));
  mark('journal and WAL contain no plaintext UI input or device label',bytes.every(v=>!v.includes('PRIVATE_FIXTURE_PAYLOAD_NOT_FOR_DISK')&&!v.includes('synthetic-device-A')&&!v.includes('synthetic-input-label')));
  await kill(b.p);
  const c=await start(19181),D=await c.enroll(A.deviceId);
  await c.call('life_android_open',{target:'last_work_screen'});
  mark('unresolved command stays fenced across second hard restart',(await c.poll(D)).status===409&&counts().uncertain===1);
  await c.call('life_android_open',{target:'chrome'});const afterReceipt=await c.take(D);
  mark('a command with prior receipt can be explicitly requested again after restart',afterReceipt.type==='open_url'&&afterReceipt.target==='chrome');
  assert.equal((await c.complete(D,afterReceipt)).status,200);
  await closeStorage(c);
  await c.call('life_android_open',{target:'synthetic-new-app'});const unavailable=await c.poll(D);
  mark('unavailable journal blocks mutation before device receives it',unavailable.status===503&&unavailable.data.code==='DURABLE_STORAGE_UNAVAILABLE');
  const readDespiteFailure=await screen(c,D);
  mark('read-only diagnostics remain usable during journal failure',readDespiteFailure.status==='complete');
  await kill(c.p);
  const missing=spawnSync(process.execPath,[HERE,'serve',build.file,path.join(dir,'missing.sqlite'),'19182'],{cwd:CWD,env:environment(19182),encoding:'utf8',timeout:6000});
  mark('missing journal fails startup rather than creating empty recovery state',missing.status!==0&&missing.stderr.includes('JOURNAL_MISSING_REVIEW_REQUIRED')&&!existsSync(path.join(dir,'missing.sqlite')));
  console.log('JH_DURABLE_NATIVE_INTEGRATION_PASS '+JSON.stringify({passed:checks.length,failed:0,checks,hardRestartCount:2,baselineSha256:build.baselineSha256,candidateSha256:build.candidateSha256,livePhoneActions:0,productionDeployments:0,scope:'open_url and agent_step with read-only native diagnostics; synthetic signed Secure56 HTTP'}));
 }catch(e){console.error('JH_DURABLE_NATIVE_INTEGRATION_FAIL',e);process.exitCode=1}
 finally{
  for(const client of clients)try{await client.close()}catch{}
  for(const p of children)try{await kill(p)}catch{}
  rmSync(dir,{recursive:true,force:true});
 }
}
